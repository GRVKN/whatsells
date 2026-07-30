import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { useI18n } from "../../i18n-context";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const { t } = useI18n();

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading={t("Log in")}>
            <s-text-field
              name="shop"
              label={t("Shop domain")}
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop ? t(errors.shop) : undefined}
            ></s-text-field>
            <s-button type="submit">{t("Log in")}</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
