import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";

import db from "./db.server.js";
import { buildExpertTrackingLink } from "./expert-copilot.server.js";
import {
  buildExpertFlyerImagePrompt,
  buildExpertFlyerSvg,
  normalizeExpertFlyerInput,
} from "./expert-flyer.js";
import {
  buildExpertStoragePath,
  deleteExpertAssets,
  isExpertStorageConfigured,
  uploadExpertAsset,
} from "./expert-storage.server.js";
import {
  completeExpertUsage,
  failExpertUsage,
  reserveExpertUsage,
} from "./expert-usage.server.js";
import { EXPERT_USAGE_CATEGORIES } from "./expert-usage.js";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL_FALLBACK = "gpt-image-2";
const ASSET_RETENTION_DAYS = 90;
const SAFE_PRODUCT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function clean(value, maxLength = 1_500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeFileStem(value) {
  return (
    clean(value, 80)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 72) || "campaign"
  );
}

function safeProductImageHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "cdn.shopify.com" ||
      host.endsWith(".shopifycdn.com") ||
      host.endsWith(".myshopify.com")
    );
  } catch {
    return false;
  }
}

async function loadProductImage(url, fetchImpl) {
  if (!url || !safeProductImageHost(url)) return null;

  try {
    const response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const contentLength = Number(response.headers.get("content-length")) || 0;

    if (
      !response.ok ||
      !SAFE_PRODUCT_IMAGE_TYPES.has(contentType) ||
      contentLength > 8 * 1024 * 1024
    ) {
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return null;

    return {
      bytes,
      contentType,
      dataUri: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

function productImageExtension(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function requestOpenAIBackground({
  apiKey,
  model,
  prompt,
  imageSize,
  productImage,
  fetchImpl,
}) {
  const commonFields = {
    model,
    prompt,
    size: imageSize,
    quality: "medium",
    output_format: "png",
    moderation: "auto",
  };
  let url = OPENAI_IMAGES_URL;
  let body;
  let headers = { Authorization: `Bearer ${apiKey}` };

  if (productImage) {
    url = OPENAI_IMAGE_EDITS_URL;
    body = new FormData();
    for (const [key, value] of Object.entries(commonFields)) {
      body.append(key, String(value));
    }
    body.append(
      "image[]",
      new Blob([productImage.bytes], { type: productImage.contentType }),
      `product.${productImageExtension(productImage.contentType)}`,
    );
  } else {
    headers = { ...headers, "Content-Type": "application/json" };
    body = JSON.stringify(commonFields);
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Image API returned ${response.status}.`);
  }

  const responseBody = await response.json();
  const backgroundBase64 = clean(responseBody?.data?.[0]?.b64_json, 30_000_000);
  if (!backgroundBase64) {
    throw new Error("OpenAI Image API returned no image.");
  }

  return { body: responseBody, backgroundBase64 };
}

export async function renderExpertFlyerFiles(svg, format) {
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: format.width },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Arial",
    },
  });
  const png = Buffer.from(rendered.render().asPng());
  const document = await PDFDocument.create();
  const image = await document.embedPng(png);
  const page = document.addPage([format.pdfWidth, format.pdfHeight]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: format.pdfWidth,
    height: format.pdfHeight,
  });
  const pdf = Buffer.from(await document.save({ useObjectStreams: true }));

  return { png, pdf };
}

export async function generateExpertFlyer({
  shop,
  draftId,
  values = {},
  dbClient = db,
  fetchImpl = fetch,
  reserveUsage = reserveExpertUsage,
  completeUsage = completeExpertUsage,
  failUsage = failExpertUsage,
  uploadAsset = uploadExpertAsset,
}) {
  if (!isExpertStorageConfigured()) {
    throw new Error(
      "Configure the private Supabase Expert asset bucket before generating flyers.",
    );
  }

  const draft = await dbClient.expertCampaignDraft.findFirst({
    where: {
      id: clean(draftId, 200),
      shop,
    },
    include: {
      product: true,
      campaign: true,
    },
  });

  if (
    !draft?.product ||
    draft.product.status !== "ACTIVE" ||
    !draft.product.onlineStoreUrl ||
    !draft?.campaign
  ) {
    throw new Error(
      "Create the WhatSells tracking campaign before generating the flyer.",
    );
  }

  const packageData = draft.package || {};
  const trackingLink = buildExpertTrackingLink(draft.campaign.publicToken);
  const model = process.env.OPENAI_IMAGE_MODEL || IMAGE_MODEL_FALLBACK;
  const apiKey = process.env.OPENAI_API_KEY || "";

  if (process.env.EXPERT_AI_ENABLED !== "true" || !apiKey) {
    throw new Error("The Expert AI image connection is not enabled.");
  }

  const [goal, productImage] = await Promise.all([
    dbClient.expertGoal.findUnique({
      where: { shop },
      select: { language: true },
    }),
    loadProductImage(draft.product.imageUrl, fetchImpl),
  ]);
  const flyer = normalizeExpertFlyerInput({
    values,
    packageData,
    productTitle: draft.product.title,
    language: goal?.language || "en",
  });
  const prompt = buildExpertFlyerImagePrompt({
    product: draft.product,
    flyer,
    hasProductReference: Boolean(productImage),
  });
  const fileStem = `${safeFileStem(
    packageData.campaignName || draft.product.title,
  )}-${flyer.format.key.replaceAll("_", "-")}-flyer`;
  const asset = await dbClient.expertGeneratedAsset.create({
    data: {
      shop,
      draftId: draft.id,
      type: "flyer",
      fileName: `${fileStem}.png`,
      mimeType: "image/png",
      prompt,
      model,
      width: flyer.format.width,
      height: flyer.format.height,
      expiresAt: new Date(
        Date.now() + ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ),
    },
  });
  let reservation = null;
  const uploadedPaths = [];

  try {
    reservation = await reserveUsage({
      shop,
      category: EXPERT_USAGE_CATEGORIES.IMAGE,
      model,
    });
    const generated = await requestOpenAIBackground({
      apiKey,
      model,
      prompt,
      imageSize: flyer.format.imageSize,
      productImage,
      fetchImpl,
    });
    const qrSvg = await QRCode.toString(trackingLink, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
      color: {
        dark: "#10231d",
        light: "#ffffff",
      },
    });
    const flyerSvg = buildExpertFlyerSvg({
      backgroundBase64: generated.backgroundBase64,
      productImageDataUri: productImage?.dataUri || "",
      productTitle: draft.product.title,
      flyer,
      qrBase64: Buffer.from(qrSvg, "utf8").toString("base64"),
      trackingLink,
    });
    const files = await renderExpertFlyerFiles(flyerSvg, flyer.format);
    const pngPath = buildExpertStoragePath({
      shop,
      assetId: asset.id,
      extension: "png",
    });
    const pdfPath = buildExpertStoragePath({
      shop,
      assetId: asset.id,
      extension: "pdf",
    });

    await uploadAsset({
      path: pngPath,
      bytes: files.png,
      contentType: "image/png",
    });
    uploadedPaths.push(pngPath);
    await uploadAsset({
      path: pdfPath,
      bytes: files.pdf,
      contentType: "application/pdf",
    });
    uploadedPaths.push(pdfPath);

    const usage = generated.body?.usage || {};
    await completeUsage({
      requestId: reservation.requestId,
      model,
      inputTokens: Number(usage.input_tokens) || 0,
      cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens) || 0,
      outputTokens: Number(usage.output_tokens) || 0,
      imageCount: 1,
      providerResponseId: generated.body?.id || null,
    });
    const ready = await dbClient.expertGeneratedAsset.update({
      where: { id: asset.id },
      data: {
        status: "ready",
        storagePath: pngPath,
        sourceStoragePath: pdfPath,
      },
    });

    return {
      asset: ready,
      trackingLink,
    };
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await deleteExpertAssets({ paths: uploadedPaths });
      } catch (cleanupError) {
        console.error(
          "Could not clean up incomplete Expert assets",
          cleanupError,
        );
      }
    }

    if (reservation) {
      try {
        await failUsage({
          requestId: reservation.requestId,
          failureCode: error?.code || error?.name || "image_error",
        });
      } catch {}
    }

    await dbClient.expertGeneratedAsset.update({
      where: { id: asset.id },
      data: {
        status: "failed",
      },
    });

    throw error;
  }
}

export async function purgeExpiredExpertAssets({
  now = new Date(),
  take = 100,
  dbClient = db,
  deleteAssets = deleteExpertAssets,
}) {
  const expired = await dbClient.expertGeneratedAsset.findMany({
    where: {
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take,
    select: {
      id: true,
      storagePath: true,
      sourceStoragePath: true,
    },
  });

  if (!expired.length) return 0;

  await deleteAssets({
    paths: expired.flatMap((asset) => [
      asset.storagePath,
      asset.sourceStoragePath,
    ]),
  });
  await dbClient.expertGeneratedAsset.deleteMany({
    where: {
      id: { in: expired.map((asset) => asset.id) },
    },
  });

  return expired.length;
}
