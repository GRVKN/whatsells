import { createContext, useContext, useMemo } from "react";

import {
  DEFAULT_LOCALE,
  getIntlLocale,
  normalizeLocale,
  translate,
} from "./i18n";
import { formatCompactMoneyFromCents, formatMoneyFromCents } from "./money";

const I18nContext = createContext(null);

export function I18nProvider({
  children,
  locale = DEFAULT_LOCALE,
  preference = "auto",
  detectedLocale = DEFAULT_LOCALE,
}) {
  const value = useMemo(() => {
    const normalizedLocale = normalizeLocale(locale);
    const intlLocale = getIntlLocale(normalizedLocale);

    return {
      locale: normalizedLocale,
      intlLocale,
      preference,
      detectedLocale: normalizeLocale(detectedLocale),
      t: (source, variables) => translate(normalizedLocale, source, variables),
      formatNumber: (number, options = {}) =>
        new Intl.NumberFormat(intlLocale, options).format(Number(number) || 0),
      formatDate: (value, options = {}) =>
        new Intl.DateTimeFormat(intlLocale, options).format(new Date(value)),
      formatPercent: (value, options = {}) => {
        if (
          value === null ||
          value === undefined ||
          Number.isNaN(Number(value))
        ) {
          return "—";
        }

        return new Intl.NumberFormat(intlLocale, {
          style: "percent",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          ...options,
        }).format(Number(value));
      },
      formatMoney: (cents, currency, options = {}) =>
        formatMoneyFromCents(cents, currency, {
          ...options,
          locale: intlLocale,
        }),
      formatCompactMoney: (cents, currency) =>
        formatCompactMoneyFromCents(cents, currency, {
          locale: intlLocale,
        }),
    };
  }, [detectedLocale, locale, preference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
