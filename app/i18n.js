import de from "./locales/de.js";

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = Object.freeze(["en", "de"]);
export const LANGUAGE_PREFERENCE_COOKIE = "ws_language";
export const DETECTED_LOCALE_COOKIE = "ws_detected_locale";

const TRANSLATIONS = Object.freeze({ de });
const INTL_LOCALES = Object.freeze({
  de: "de-DE",
  en: "en-US",
});

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeLocale(value, fallback = DEFAULT_LOCALE) {
  const language = clean(value).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(language) ? language : fallback;
}

export function normalizeLanguagePreference(value) {
  const preference = clean(value).toLowerCase();
  return SUPPORTED_LOCALES.includes(preference) ? preference : "auto";
}

export function getIntlLocale(locale) {
  return INTL_LOCALES[normalizeLocale(locale)] || INTL_LOCALES.en;
}

export function translate(locale, source, variables = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const translated =
    normalizedLocale === DEFAULT_LOCALE
      ? String(source ?? "")
      : TRANSLATIONS[normalizedLocale]?.[source] || String(source ?? "");

  return translated.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key])
      : match,
  );
}

export function parseCookies(headerValue) {
  return Object.fromEntries(
    clean(headerValue)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        const key = separator >= 0 ? part.slice(0, separator) : part;
        const value = separator >= 0 ? part.slice(separator + 1) : "";

        try {
          return [decodeURIComponent(key), decodeURIComponent(value)];
        } catch {
          return [key, value];
        }
      }),
  );
}

export function serializeLanguageCookie(name, value, options = {}) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function getAcceptLanguage(request) {
  const firstLanguage = clean(request.headers.get("accept-language"))
    .split(",")[0]
    ?.split(";")[0];

  return normalizeLocale(firstLanguage);
}

export function resolveRequestLocalization(request) {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie"));
  const shopifyLocale = url.searchParams.get("locale");
  const detectedLocale = shopifyLocale
    ? normalizeLocale(shopifyLocale)
    : normalizeLocale(
        cookies[DETECTED_LOCALE_COOKIE] || getAcceptLanguage(request),
      );
  const preference = normalizeLanguagePreference(
    cookies[LANGUAGE_PREFERENCE_COOKIE],
  );
  const locale = preference === "auto" ? detectedLocale : preference;
  const headers = new Headers();

  if (shopifyLocale) {
    headers.append(
      "Set-Cookie",
      serializeLanguageCookie(DETECTED_LOCALE_COOKIE, detectedLocale, {
        maxAge: 60 * 60 * 24 * 365,
        secure: url.protocol === "https:",
      }),
    );
  }

  return {
    locale,
    preference,
    detectedLocale,
    headers,
  };
}

export function buildLanguagePreferenceCookie(request, preference) {
  const url = new URL(request.url);
  const normalizedPreference = normalizeLanguagePreference(preference);

  if (normalizedPreference === "auto") {
    return serializeLanguageCookie(LANGUAGE_PREFERENCE_COOKIE, "", {
      maxAge: 0,
      secure: url.protocol === "https:",
    });
  }

  return serializeLanguageCookie(
    LANGUAGE_PREFERENCE_COOKIE,
    normalizedPreference,
    {
      maxAge: 60 * 60 * 24 * 365,
      secure: url.protocol === "https:",
    },
  );
}
