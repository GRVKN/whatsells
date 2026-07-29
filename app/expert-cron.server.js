import crypto from "node:crypto";

function clean(value) {
  return String(value || "").trim();
}

export function getBearerToken(request) {
  const authorization = clean(request?.headers?.get?.("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match ? clean(match[1]) : "";
}

export function isValidExpertCronRequest(
  request,
  expectedSecret = process.env.EXPERT_CRON_SECRET || "",
) {
  const expected = clean(expectedSecret);
  const provided = getBearerToken(request);

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
