import crypto from "node:crypto";

export function hashIp(ip) {
  const normalizedIp = String(ip || "").trim();
  if (!normalizedIp) return null;

  const secret =
    process.env.IP_HASH_SECRET || process.env.SHOPIFY_API_SECRET || "";

  // An unsalted IP hash can be guessed cheaply. If no server secret exists,
  // retain no IP-derived value instead of storing a weak pseudonym.
  if (!secret) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(normalizedIp)
    .digest("hex")
    .slice(0, 32);
}
