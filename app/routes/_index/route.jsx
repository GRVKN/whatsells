import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>WhatSells</h1>
        <p className={styles.text}>
          Track campaign links and QR codes, connect them to Shopify orders and
          see what actually sells.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g. my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Free</strong>. Start with 3 campaigns, tracking links, QR
            codes and core order attribution.
          </li>
          <li>
            <strong>Basic</strong>. Analyze up to 20 campaigns with ROI, ROAS,
            time ranges, rankings and CSV export.
          </li>
          <li>
            <strong>Pro</strong>. Unlock unlimited campaigns, Add-to-Cart
            tracking and the full conversion funnel.
          </li>
        </ul>
      </div>
    </div>
  );
}
