export const DEFAULT_CURRENCY = "EUR";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeCurrencyCode(value, fallback = DEFAULT_CURRENCY) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (/^[A-Z]{3}$/.test(normalized)) {
    try {
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: normalized,
      }).format(0);

      return normalized;
    } catch {}
  }

  return fallback;
}

export function formatMoneyFromCents(
  cents,
  currency = DEFAULT_CURRENCY,
  options = {},
) {
  const currencyCode = normalizeCurrencyCode(currency);
  const value = numberOrZero(cents) / 100;
  const { locale = "de-DE", ...formatOptions } = options;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    ...formatOptions,
  }).format(value);
}

export function formatCompactMoneyFromCents(
  cents,
  currency = DEFAULT_CURRENCY,
  options = {},
) {
  return formatMoneyFromCents(cents, currency, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    ...options,
  });
}
