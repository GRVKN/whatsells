// app/root.jsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { AppProvider, Frame } from "@shopify/polaris";
import deTranslations from "@shopify/polaris/locales/de.json";
import enTranslations from "@shopify/polaris/locales/en.json";
import { I18nProvider } from "./i18n-context";
import { resolveRequestLocalization } from "./i18n";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  const { locale, preference, detectedLocale, headers } =
    resolveRequestLocalization(request);

  return Response.json(
    { locale, preference, detectedLocale },
    {
      headers,
    },
  );
}

export async function action({ request }) {
  const url = new URL(request.url);

  return new Response(null, {
    status: 303,
    headers: {
      Location: `/app${url.search || ""}`,
    },
  });
}

export default function App() {
  const { locale, preference, detectedLocale } = useLoaderData();
  const polarisTranslations = locale === "de" ? deTranslations : enTranslations;

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nProvider
          locale={locale}
          preference={preference}
          detectedLocale={detectedLocale}
        >
          <AppProvider i18n={polarisTranslations}>
            <Frame>
              <Outlet />
            </Frame>
          </AppProvider>
        </I18nProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
