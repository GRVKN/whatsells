import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Page,
  Select,
  Text,
  Toast,
} from "@shopify/polaris";

import {
  buildLanguagePreferenceCookie,
  normalizeLanguagePreference,
} from "../i18n";
import { useI18n } from "../i18n-context";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  await authenticate.admin(request);
  const formData = await request.formData();
  const preference = normalizeLanguagePreference(
    formData.get("languagePreference"),
  );

  return Response.json(
    { ok: true, preference },
    {
      headers: {
        "Set-Cookie": buildLanguagePreferenceCookie(request, preference),
      },
    },
  );
}

export default function SettingsPage() {
  const fetcher = useFetcher();
  const { t, preference, detectedLocale } = useI18n();
  const [languagePreference, setLanguagePreference] = useState(preference);
  const [showSaved, setShowSaved] = useState(false);
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    setLanguagePreference(preference);
  }, [preference]);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle") {
      setShowSaved(true);
    }
  }, [fetcher.data, fetcher.state]);

  const options = [
    { label: t("Automatic"), value: "auto" },
    { label: t("German"), value: "de" },
    { label: t("English"), value: "en" },
  ];

  return (
    <Page title={t("Settings")} subtitle={t("Language and regional formats")}>
      <BlockStack gap="400">
        <Card>
          <fetcher.Form method="post">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                {t("Language")}
              </Text>

              <Banner tone="info">
                <BlockStack gap="100">
                  <Text as="p" fontWeight="semibold">
                    {t("Follow Shopify Admin language")}
                  </Text>
                  <Text as="p">
                    {t(
                      "WhatSells automatically follows the language selected by the current Shopify Admin user. Unsupported languages fall back to English.",
                    )}
                  </Text>
                  <Text as="p" tone="subdued">
                    {t("Current Shopify language: {language}", {
                      language: detectedLocale === "de" ? "Deutsch" : "English",
                    })}
                  </Text>
                </BlockStack>
              </Banner>

              <Select
                label={t("Manual language")}
                name="languagePreference"
                options={options}
                value={languagePreference}
                onChange={setLanguagePreference}
                helpText={t(
                  "This choice applies in this browser. Currency still follows the store currency configured in Shopify.",
                )}
              />

              <Button variant="primary" submit loading={isSaving}>
                {t("Save language")}
              </Button>
            </BlockStack>
          </fetcher.Form>
        </Card>
      </BlockStack>

      {showSaved ? (
        <Toast
          content={t("Language preference saved.")}
          onDismiss={() => setShowSaved(false)}
        />
      ) : null}
    </Page>
  );
}
