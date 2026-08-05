import { getShopPlan } from "../billing.server";
import db from "../db.server";
import { downloadExpertAsset } from "../expert-storage.server";
import { getPlanCapabilities } from "../plans";
import { authenticate } from "../shopify.server";

function safeFileName(value) {
  return (
    String(value || "whatsells-asset")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 180) || "whatsells-asset"
  );
}

export async function loader({ request, params }) {
  const { session, admin } = await authenticate.admin(request);
  const plan = await getShopPlan({
    shop: session.shop,
    admin,
    requireLive: true,
  });
  const capabilities = getPlanCapabilities(plan);

  if (!capabilities.canUseExpertOperator) {
    return new Response("Expert subscription required", { status: 403 });
  }

  const asset = await db.expertGeneratedAsset.findFirst({
    where: {
      id: String(params.id || "").trim(),
      shop: session.shop,
      status: "ready",
    },
  });

  if (!asset?.storagePath) {
    return new Response("Asset not found", { status: 404 });
  }

  if (asset.expiresAt && new Date(asset.expiresAt).getTime() <= Date.now()) {
    return new Response("Asset expired", { status: 410 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const wantsPdf =
      searchParams.get("format") === "pdf" &&
      asset.mimeType === "image/png" &&
      Boolean(asset.sourceStoragePath);
    const stored = await downloadExpertAsset({
      path: wantsPdf ? asset.sourceStoragePath : asset.storagePath,
    });
    const download = searchParams.get("download") === "1";
    const fileName = wantsPdf
      ? asset.fileName.replace(/\.png$/i, ".pdf")
      : asset.fileName;

    return new Response(stored.body, {
      status: 200,
      headers: {
        "Content-Type": wantsPdf ? "application/pdf" : asset.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(fileName)}"`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Could not load Expert asset", {
      assetId: asset.id,
      shop: session.shop,
      error: error?.message || String(error),
    });

    return new Response("Asset temporarily unavailable", { status: 502 });
  }
}
