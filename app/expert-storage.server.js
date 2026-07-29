import crypto from "node:crypto";

function getStorageConfig() {
  const url = String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(process.env.EXPERT_ASSET_BUCKET || "whatsells-expert")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");

  if (!url || !serviceKey || !bucket) {
    return null;
  }

  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url, serviceKey, bucket };
}

function encodePath(path) {
  return String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function shopFolder(shop) {
  return crypto
    .createHash("sha256")
    .update(String(shop || ""))
    .digest("hex")
    .slice(0, 24);
}

export function isExpertStorageConfigured() {
  return Boolean(getStorageConfig());
}

export function buildExpertStoragePath({
  shop,
  assetId,
  extension,
  suffix = "",
}) {
  const safeExtension = String(extension || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeSuffix = String(suffix || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const safeAssetId = String(assetId || "").replace(/[^a-zA-Z0-9_-]/g, "");

  return `${shopFolder(shop)}/${safeAssetId}${safeSuffix ? `-${safeSuffix}` : ""}.${safeExtension}`;
}

export async function uploadExpertAsset({
  path,
  bytes,
  contentType,
  fetchImpl = fetch,
}) {
  const config = getStorageConfig();
  if (!config) {
    throw new Error("Supabase Storage is not configured for Expert assets.");
  }

  const response = await fetchImpl(
    `${config.url}/storage/v1/object/${config.bucket}/${encodePath(path)}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase Storage upload returned ${response.status}.`);
  }

  return path;
}

export async function downloadExpertAsset({ path, fetchImpl = fetch }) {
  const config = getStorageConfig();
  if (!config) {
    throw new Error("Supabase Storage is not configured for Expert assets.");
  }

  const response = await fetchImpl(
    `${config.url}/storage/v1/object/authenticated/${config.bucket}/${encodePath(path)}`,
    {
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase Storage download returned ${response.status}.`);
  }

  return response;
}

export async function deleteExpertAssets({ paths, fetchImpl = fetch }) {
  const config = getStorageConfig();
  const objects = [
    ...new Set((Array.isArray(paths) ? paths : []).filter(Boolean)),
  ];
  if (!objects.length) return 0;
  if (!config) {
    throw new Error(
      "Supabase Storage is not configured for Expert asset deletion.",
    );
  }

  const response = await fetchImpl(
    `${config.url}/storage/v1/object/${config.bucket}`,
    {
      method: "DELETE",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: objects }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase Storage deletion returned ${response.status}.`);
  }

  return objects.length;
}
