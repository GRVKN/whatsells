import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";

import { getShopPlan } from "../billing.server";
import { generateExpertFlyer } from "../expert-assets.server";
import { getOrCreateExpertSnapshot } from "../expert-analysis.server";
import {
  activateExpertCampaignDraft,
  askExpertQuestion,
  buildExpertTrackingLink,
  createExpertCampaignPackage,
  generateWeeklyExpertStrategy,
  recordExpertDraftDecision,
  runExpertMarketAnalysis,
  saveExpertGoals,
} from "../expert-copilot.server";
import { loadExpertWorkspace } from "../expert-context.server";
import { isExpertStorageConfigured } from "../expert-storage.server";
import { ExpertUsageLimitError } from "../expert-usage.server";
import { useI18n } from "../i18n-context";
import {
  EXPERT_MONTHLY_PRICE_USD,
  EXPERT_TRIAL_DAYS,
  getPlanCapabilities,
} from "../plans";
import { getShopCurrency } from "../shop-currency.server";
import { syncShopifyExpertCatalog } from "../shopify-catalog.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/expert.module.css";

function formatUsdMicros(value, intlLocale) {
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format((Number(value) || 0) / 1_000_000);
}

function getTone(tone) {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "attention";
  if (tone === "success") return "success";

  return "info";
}

function getAiLabel(snapshot) {
  if (snapshot?.aiStatus === "enhanced") return "Luna explanation active";
  if (snapshot?.aiStatus === "limited") return "Verified rules · AI limit";
  if (snapshot?.aiStatus === "failed") {
    return "Verified rules · AI unavailable";
  }

  return "Verified rules active";
}

function isSubmitting(navigation, intent) {
  return (
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === intent
  );
}

function Metric({ label, value, helpText }) {
  return (
    <div className={styles.metric}>
      <Text as="p" tone="subdued">
        {label}
      </Text>
      <Text as="p" variant="headingLg">
        {value}
      </Text>
      {helpText ? (
        <Text as="p" tone="subdued">
          {helpText}
        </Text>
      ) : null}
    </div>
  );
}

function Score({ value, confidence }) {
  const score = Math.min(Math.max(Number(value) || 0, 0), 100);
  const { t } = useI18n();

  return (
    <BlockStack gap="100">
      <InlineStack align="space-between" gap="200">
        <Text as="p" fontWeight="semibold">
          {score}/100
        </Text>
        <Badge>{t("{confidence} confidence", { confidence })}</Badge>
      </InlineStack>
      <ProgressBar
        progress={score}
        tone={score >= 70 ? "success" : "primary"}
        size="small"
      />
    </BlockStack>
  );
}

function RecommendationCard({ item, currency, featured = false }) {
  const { t, formatMoney } = useI18n();
  const metrics = item?.metrics || {};
  const evidence = [];

  if (Number.isFinite(Number(metrics.clicks30d))) {
    evidence.push(
      t("{count} clicks · 30 days", { count: Number(metrics.clicks30d) }),
    );
  }
  if (Number.isFinite(Number(metrics.orders30d))) {
    evidence.push(
      t("{count} orders · 30 days", { count: Number(metrics.orders30d) }),
    );
  }
  if (Number.isFinite(Number(metrics.resultCents))) {
    evidence.push(
      t("{result} result", {
        result: formatMoney(metrics.resultCents, currency),
      }),
    );
  }

  return (
    <div
      className={`${styles.recommendation} ${
        featured ? styles.featuredRecommendation : ""
      }`}
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" gap="200" wrap>
          <InlineStack gap="150" wrap>
            <Badge tone={getTone(item.tone)}>
              {featured
                ? t("Today’s action")
                : t(item.type.replaceAll("_", " "))}
            </Badge>
            <Badge>
              {t("{confidence} confidence", {
                confidence: item.confidence,
              })}
            </Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            {t("Priority {priority}/100", {
              priority: Math.round(Number(item.priority) || 0),
            })}
          </Text>
        </InlineStack>
        <Text as={featured ? "h2" : "h3"} variant="headingMd">
          {item.title}
        </Text>
        <Text as="p">{item.summary}</Text>
        <Text as="p" tone="subdued">
          <strong>{t("Why:")}</strong> {item.rationale}
        </Text>
        <Text as="p">
          <strong>{t("Next:")}</strong> {item.nextStep}
        </Text>
        {evidence.length ? (
          <InlineStack gap="150" wrap>
            {evidence.map((value) => (
              <Badge key={value}>{value}</Badge>
            ))}
          </InlineStack>
        ) : null}
      </BlockStack>
    </div>
  );
}

function Sources({ citations }) {
  const { t } = useI18n();
  const values = Array.isArray(citations) ? citations : [];
  if (!values.length) return null;

  return (
    <BlockStack gap="100">
      <Text as="p" fontWeight="semibold">
        {t("Sources")}
      </Text>
      <ul className={styles.sourceList}>
        {values.slice(0, 10).map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title || source.url}
            </a>
          </li>
        ))}
      </ul>
    </BlockStack>
  );
}

function LockedExpert({ expertUrl, upgradeUrl, currentPlan }) {
  const targetUrl = expertUrl || upgradeUrl;
  const { t } = useI18n();

  return (
    <Page title="WhatSells Expert" subtitle={t("AI marketing copilot")}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <BlockStack gap="250">
                <InlineStack gap="200" wrap>
                  <Badge tone="attention">{t("Expert locked")}</Badge>
                  <Text as="p" fontWeight="semibold">
                    {t("Current plan: {plan}", {
                      plan: t(currentPlan),
                    })}
                  </Text>
                </InlineStack>
                <Text as="p">
                  {t(
                    "Shopify must confirm the paid Expert subscription before any shop analysis, chat, market scan or generated asset is available.",
                  )}
                </Text>
                <InlineStack gap="200" wrap>
                  {targetUrl ? (
                    <Button
                      variant="primary"
                      onClick={() => window.open(targetUrl, "_top")}
                    >
                      {t("Start {days}-day free trial · ${price}/month", {
                        days: EXPERT_TRIAL_DAYS,
                        price: EXPERT_MONTHLY_PRICE_USD,
                      })}
                    </Button>
                  ) : null}
                  <Button url="/app">{t("Back to dashboard")}</Button>
                </InlineStack>
              </BlockStack>
            </Banner>
            <Card>
              <BlockStack gap="250">
                <Text as="h2" variant="headingMd">
                  {t("Included in Expert")}
                </Text>
                <ul className={styles.safeguardList}>
                  <li>{t("Daily measured action and Opportunity Scores.")}</li>
                  <li>
                    {t("AI chat grounded in Shopify and WhatSells data.")}
                  </li>
                  <li>
                    {t("Current web-grounded market and channel analysis.")}
                  </li>
                  <li>
                    {t(
                      "Campaign packages, copy, tracking links and AI flyers.",
                    )}
                  </li>
                  <li>
                    {t("Weekly Sol strategy and merchant-controlled budgets.")}
                  </li>
                </ul>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const plan = await getShopPlan({
    shop: session.shop,
    admin,
    requireLive: true,
  });
  const capabilities = getPlanCapabilities(plan);

  if (!capabilities.canUseExpertOperator) {
    return {
      unlocked: false,
      currentPlan: capabilities.plan,
      expertUrl: plan.expertUrl,
      upgradeUrl: plan.upgradeUrl,
    };
  }

  const currency = await getShopCurrency(admin);
  const products = await syncShopifyExpertCatalog({
    shop: session.shop,
    admin,
    currency,
  });
  const snapshot = await getOrCreateExpertSnapshot({
    shop: session.shop,
    currency,
  });
  const workspace = await loadExpertWorkspace({
    shop: session.shop,
  });

  return {
    unlocked: true,
    currentPlan: capabilities.plan,
    currency,
    snapshot,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.imageUrl,
      minPriceCents: product.minPriceCents,
      totalInventory: product.totalInventory,
    })),
    workspace: {
      ...workspace,
      drafts: workspace.drafts.map((draft) => ({
        ...draft,
        trackingLink: draft.campaign?.publicToken
          ? buildExpertTrackingLink(draft.campaign.publicToken)
          : null,
      })),
    },
    configuration: {
      ai:
        process.env.EXPERT_AI_ENABLED === "true" &&
        Boolean(process.env.OPENAI_API_KEY),
      webSearch: process.env.EXPERT_WEB_SEARCH_ENABLED === "true",
      storage: isExpertStorageConfigured(),
    },
  };
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const plan = await getShopPlan({
    shop: session.shop,
    admin,
    requireLive: true,
  });
  const capabilities = getPlanCapabilities(plan);

  if (!capabilities.canUseExpertOperator) {
    return Response.json(
      {
        error:
          "Expert is available only after Shopify confirms the Expert subscription.",
        expertUrl: plan.expertUrl,
      },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save_goals") {
      await saveExpertGoals({
        shop: session.shop,
        values: Object.fromEntries(formData),
      });
      return Response.json({ ok: true, message: "Expert goals saved." });
    }

    const currency = await getShopCurrency(admin);
    if (intent === "market_analysis") {
      await syncShopifyExpertCatalog({
        shop: session.shop,
        admin,
        currency,
        force: true,
      });
    }
    const snapshot = await getOrCreateExpertSnapshot({
      shop: session.shop,
      currency,
      force: intent === "refresh_snapshot",
    });

    if (intent === "refresh_snapshot") {
      return Response.json({
        ok: true,
        message: "Daily evidence refreshed.",
      });
    }

    if (intent === "ask_expert") {
      await askExpertQuestion({
        shop: session.shop,
        question: formData.get("question"),
        snapshot,
      });
      return Response.json({ ok: true, message: "Expert answered." });
    }

    if (intent === "market_analysis") {
      await runExpertMarketAnalysis({
        shop: session.shop,
        focus: formData.get("focus"),
        snapshot,
      });
      return Response.json({
        ok: true,
        message: "Current market scan completed.",
      });
    }

    if (intent === "weekly_strategy") {
      const result = await generateWeeklyExpertStrategy({
        shop: session.shop,
        snapshot,
      });
      return Response.json({
        ok: true,
        message: result.reused
          ? "This week’s strategy is already current."
          : "Weekly Sol strategy completed.",
      });
    }

    if (intent === "campaign_package") {
      await createExpertCampaignPackage({
        shop: session.shop,
        productId: formData.get("productId"),
        objective: formData.get("objective"),
        snapshot,
      });
      return Response.json({
        ok: true,
        message: "Campaign package created as a draft.",
      });
    }

    if (intent === "activate_draft") {
      await activateExpertCampaignDraft({
        shop: session.shop,
        draftId: formData.get("draftId"),
      });
      return Response.json({
        ok: true,
        message:
          "WhatSells tracking campaign created. No external ad spend was started.",
      });
    }

    if (intent === "generate_flyer") {
      await generateExpertFlyer({
        shop: session.shop,
        draftId: formData.get("draftId"),
      });
      return Response.json({
        ok: true,
        message: "AI flyer created with the real tracking QR code.",
      });
    }

    if (intent === "reject_draft" || intent === "defer_draft") {
      await recordExpertDraftDecision({
        shop: session.shop,
        draftId: formData.get("draftId"),
        decision: intent === "reject_draft" ? "rejected" : "deferred",
      });
      return Response.json({
        ok: true,
        message:
          intent === "reject_draft"
            ? "Draft rejected."
            : "Draft kept for later.",
      });
    }

    return Response.json({ error: "Unknown Expert action." }, { status: 400 });
  } catch (error) {
    const status = error instanceof ExpertUsageLimitError ? 429 : 400;
    console.error("Expert action failed", {
      shop: session.shop,
      intent,
      error: error?.message || String(error),
    });

    return Response.json(
      {
        error:
          error instanceof ExpertUsageLimitError
            ? "The monthly Expert allowance or cost guard has been reached."
            : error?.message || "Expert could not complete this action.",
      },
      { status },
    );
  }
}

function GoalForm({ goal, navigation }) {
  const { t, formatNumber } = useI18n();
  const formatInput = (cents) =>
    formatNumber((Number(cents) || 0) / 100, {
      useGrouping: false,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {t("Merchant goals and guardrails")}
          </Text>
          <Text as="p" tone="subdued">
            {t(
              "Terra and Sol must respect these values. A saved budget is a ceiling, never permission to spend it.",
            )}
          </Text>
        </BlockStack>
        <Form method="post">
          <input type="hidden" name="intent" value="save_goals" />
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>{t("Primary goal")}</span>
              <select name="primaryGoal" defaultValue={goal.primaryGoal}>
                <option value="profitable_sales">
                  {t("Profitable sales")}
                </option>
                <option value="revenue_growth">{t("Revenue growth")}</option>
                <option value="product_launch">{t("Product launch")}</option>
                <option value="clear_inventory">{t("Clear inventory")}</option>
                <option value="brand_awareness">{t("Brand awareness")}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("Monthly test budget")}</span>
              <input
                name="monthlyAdBudget"
                inputMode="decimal"
                defaultValue={formatInput(goal.monthlyAdBudgetCents)}
              />
            </label>
            <label className={styles.field}>
              <span>{t("Target monthly revenue")}</span>
              <input
                name="targetRevenue"
                inputMode="decimal"
                defaultValue={
                  goal.targetRevenueCents
                    ? formatInput(goal.targetRevenueCents)
                    : ""
                }
              />
            </label>
            <label className={styles.field}>
              <span>{t("Target ROAS")}</span>
              <input
                name="targetRoas"
                inputMode="decimal"
                defaultValue={goal.targetRoas || ""}
              />
            </label>
            <label className={styles.field}>
              <span>{t("Country")}</span>
              <input name="countryCode" defaultValue={goal.countryCode} />
            </label>
            <label className={styles.field}>
              <span>{t("Language")}</span>
              <input name="language" defaultValue={goal.language} />
            </label>
          </div>
          <label className={styles.field}>
            <span>{t("Target audience")}</span>
            <textarea name="audience" defaultValue={goal.audience || ""} />
          </label>
          <label className={styles.field}>
            <span>{t("Brand voice and differentiators")}</span>
            <textarea
              name="brandVoice"
              defaultValue={goal.brandVoice || ""}
              placeholder={t("Direct, premium, playful…")}
            />
          </label>
          <label className={styles.field}>
            <span>{t("Offer notes")}</span>
            <textarea name="offerNotes" defaultValue={goal.offerNotes || ""} />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>{t("Preferred channels · comma-separated")}</span>
              <input
                name="preferredChannels"
                defaultValue={goal.preferredChannels.join(", ")}
              />
            </label>
            <label className={styles.field}>
              <span>{t("Excluded channels · comma-separated")}</span>
              <input
                name="excludedChannels"
                defaultValue={goal.excludedChannels.join(", ")}
              />
            </label>
          </div>
          <Button
            submit
            variant="primary"
            loading={isSubmitting(navigation, "save_goals")}
          >
            {t("Save goals")}
          </Button>
        </Form>
      </BlockStack>
    </Card>
  );
}

function UsageCard({ usage }) {
  const { t, intlLocale } = useI18n();
  const categories = usage.categories;
  const rows = [
    ["Chat questions", categories.chat],
    ["Market scans", categories.market_analysis],
    ["Campaign packages", categories.campaign_package],
    ["Weekly strategies", categories.weekly_strategy],
    ["Flyers / images", categories.image],
  ];

  return (
    <Card>
      <BlockStack gap="250">
        <InlineStack align="space-between" gap="200" wrap>
          <Text as="h2" variant="headingMd">
            {t("Monthly AI allowance")}
          </Text>
          <Badge tone="success">
            {t("{cost} estimated", {
              cost: formatUsdMicros(usage.committedCostMicros, intlLocale),
            })}
          </Badge>
        </InlineStack>
        <Text as="p" tone="subdued">
          {t(
            "Internal cost guard: {cost}. OpenAI project limits remain the second global safety net.",
            {
              cost: formatUsdMicros(usage.costLimitMicros, intlLocale),
            },
          )}
        </Text>
        <div className={styles.usageGrid}>
          {rows.map(([label, item]) => (
            <div className={styles.usageItem} key={label}>
              <Text as="p" tone="subdued">
                {t(label)}
              </Text>
              <Text as="p" fontWeight="semibold">
                {item.used} / {item.limit}
              </Text>
            </div>
          ))}
        </div>
      </BlockStack>
    </Card>
  );
}

function CopilotCard({ messages, navigation, enabled }) {
  const chat = messages.filter((message) => message.kind === "chat").slice(-12);
  const { t } = useI18n();

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <InlineStack gap="150" wrap>
            <Text as="h2" variant="headingMd">
              {t("Ask Expert")}
            </Text>
            <Badge>Luna</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            {t(
              "Fast questions use shop data only. Use the market scan for current external trends.",
            )}
          </Text>
        </BlockStack>
        {chat.length ? (
          <div className={styles.chat}>
            {chat.map((message) => (
              <div
                className={
                  message.role === "merchant"
                    ? styles.merchantMessage
                    : styles.assistantMessage
                }
                key={message.id}
              >
                <Text as="p" fontWeight="semibold">
                  {message.role === "merchant" ? t("You") : t("Expert")}
                </Text>
                <Text as="p">{message.content}</Text>
              </div>
            ))}
          </div>
        ) : null}
        <Form method="post">
          <input type="hidden" name="intent" value="ask_expert" />
          <label className={styles.field}>
            <span>{t("Your question")}</span>
            <textarea
              name="question"
              required
              maxLength={1500}
              placeholder={t("Which product should I focus on next—and why?")}
            />
          </label>
          <Button
            submit
            variant="primary"
            disabled={!enabled}
            loading={isSubmitting(navigation, "ask_expert")}
          >
            {t("Ask Luna")}
          </Button>
        </Form>
      </BlockStack>
    </Card>
  );
}

function MarketCard({ latest, navigation, enabled, products }) {
  const analysis = latest?.structured;
  const productById = new Map(products.map((product) => [product.id, product]));
  const { t, formatDate } = useI18n();
  const formatDateTime = (value) =>
    formatDate(value, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" gap="200" wrap>
          <InlineStack gap="150" wrap>
            <Text as="h2" variant="headingMd">
              {t("Current market and product scan")}
            </Text>
            <Badge tone="info">{t("Terra + web search")}</Badge>
          </InlineStack>
          {latest ? (
            <Text as="p" tone="subdued">
              {formatDateTime(latest.createdAt)}
            </Text>
          ) : null}
        </InlineStack>
        {analysis ? (
          <BlockStack gap="250">
            <Text as="p">{analysis.summary}</Text>
            {(analysis.rankedProducts || []).slice(0, 5).map((product) => (
              <div className={styles.marketProduct} key={product.productId}>
                <InlineStack align="space-between" gap="200" wrap>
                  <Text as="h3" fontWeight="semibold">
                    #{product.rank} ·{" "}
                    {productById.get(product.productId)?.title ||
                      product.productId}
                  </Text>
                  <Badge>{product.opportunityScore}/100</Badge>
                </InlineStack>
                <Text as="p">{product.whyNow}</Text>
                <Text as="p" tone="subdued">
                  {t("Channels: {channels}", {
                    channels: product.recommendedChannels.map(t).join(", "),
                  })}
                </Text>
                <Text as="p">{product.testPlan}</Text>
              </div>
            ))}
            <Sources citations={latest.citations} />
          </BlockStack>
        ) : (
          <Text as="p" tone="subdued">
            {t("No live market scan has been created yet.")}
          </Text>
        )}
        <Form method="post">
          <input type="hidden" name="intent" value="market_analysis" />
          <label className={styles.field}>
            <span>{t("Optional focus")}</span>
            <input
              name="focus"
              maxLength={800}
              placeholder={t(
                "Example: Germany, summer campaign, small test budget",
              )}
            />
          </label>
          <Button
            submit
            disabled={!enabled}
            loading={isSubmitting(navigation, "market_analysis")}
          >
            {t("Run current market scan")}
          </Button>
        </Form>
      </BlockStack>
    </Card>
  );
}

function WeeklyCard({ latest, navigation, currency, enabled }) {
  const strategy = latest?.structured;
  const { t, formatDate, formatMoney } = useI18n();
  const formatDateTime = (value) =>
    formatDate(value, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card>
      <BlockStack gap="250">
        <InlineStack align="space-between" gap="200" wrap>
          <InlineStack gap="150" wrap>
            <Text as="h2" variant="headingMd">
              {t("Weekly deep strategy")}
            </Text>
            <Badge>Sol</Badge>
          </InlineStack>
          {latest ? (
            <Text as="p" tone="subdued">
              {formatDateTime(latest.createdAt)}
            </Text>
          ) : null}
        </InlineStack>
        {strategy ? (
          <>
            <Text as="p">{strategy.executiveSummary}</Text>
            <Text as="p" fontWeight="semibold">
              {t("Recommended weekly test budget: {budget}", {
                budget: formatMoney(
                  strategy.totalRecommendedBudgetCents || 0,
                  currency,
                ),
              })}
            </Text>
          </>
        ) : (
          <Text as="p" tone="subdued">
            {t(
              "Sol combines the measured snapshot with the latest saved market scan. One current report is reused for seven days.",
            )}
          </Text>
        )}
        <Form method="post">
          <input type="hidden" name="intent" value="weekly_strategy" />
          <Button
            submit
            disabled={!enabled}
            loading={isSubmitting(navigation, "weekly_strategy")}
          >
            {t("Generate this week’s strategy")}
          </Button>
        </Form>
      </BlockStack>
    </Card>
  );
}

function DraftCard({ draft, currency, navigation, storageEnabled, aiEnabled }) {
  const packageData = draft.package || {};
  const { t, formatMoney } = useI18n();

  return (
    <div className={styles.draftCard}>
      <BlockStack gap="250">
        <InlineStack align="space-between" gap="200" wrap>
          <BlockStack gap="050">
            <Text as="h3" variant="headingMd">
              {packageData.campaignName || t("Expert campaign")}
            </Text>
            <Text as="p" tone="subdued">
              {draft.product?.title} · {draft.channel}
            </Text>
          </BlockStack>
          <Badge tone={draft.status === "approved" ? "success" : undefined}>
            {t(
              String(draft.status).charAt(0).toUpperCase() +
                String(draft.status).slice(1),
            )}
          </Badge>
        </InlineStack>
        <Text as="p">{packageData.hypothesis}</Text>
        <div className={styles.copyBlock}>
          <Text as="p" fontWeight="semibold">
            {packageData.headline}
          </Text>
          <Text as="p">{packageData.primaryText}</Text>
          <Text as="p" tone="subdued">
            {t("CTA: {cta}", { cta: packageData.cta })}
          </Text>
        </div>
        <InlineStack gap="150" wrap>
          <Badge>
            {t("{budget} max test", {
              budget: formatMoney(
                packageData.recommendedBudgetCents || 0,
                currency,
              ),
            })}
          </Badge>
          <Badge>
            {t("{days} days", { days: packageData.durationDays || 0 })}
          </Badge>
        </InlineStack>
        {draft.trackingLink ? (
          <div className={styles.trackingLink}>
            <Text as="p" fontWeight="semibold">
              {t("Live WhatSells tracking link")}
            </Text>
            <code>{draft.trackingLink}</code>
          </div>
        ) : (
          <Banner tone="warning">
            {t(
              "This is only a draft. Creating the WhatSells link still starts no external advertising and spends no budget.",
            )}
          </Banner>
        )}
        <InlineStack gap="150" wrap>
          {!draft.campaign ? (
            <Form method="post">
              <input type="hidden" name="intent" value="activate_draft" />
              <input type="hidden" name="draftId" value={draft.id} />
              <Button
                submit
                variant="primary"
                loading={isSubmitting(navigation, "activate_draft")}
              >
                {t("Confirm and create tracking campaign")}
              </Button>
            </Form>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="generate_flyer" />
              <input type="hidden" name="draftId" value={draft.id} />
              <Button
                submit
                disabled={!storageEnabled || !aiEnabled}
                loading={isSubmitting(navigation, "generate_flyer")}
              >
                {t("Generate AI flyer + real QR")}
              </Button>
            </Form>
          )}
          {draft.status === "draft" ? (
            <Form method="post">
              <input type="hidden" name="intent" value="reject_draft" />
              <input type="hidden" name="draftId" value={draft.id} />
              <Button
                submit
                tone="critical"
                loading={isSubmitting(navigation, "reject_draft")}
              >
                {t("Reject draft")}
              </Button>
            </Form>
          ) : null}
        </InlineStack>
        {draft.assets?.length ? (
          <InlineStack gap="150" wrap>
            {draft.assets.map((asset) => (
              <Button
                key={asset.id}
                url={`/api/expert/assets/${asset.id}?download=1`}
              >
                {t("Download {fileName}", { fileName: asset.fileName })}
              </Button>
            ))}
          </InlineStack>
        ) : null}
      </BlockStack>
    </div>
  );
}

function CampaignStudio({
  products,
  drafts,
  currency,
  navigation,
  storageEnabled,
  aiEnabled,
}) {
  const { t } = useI18n();

  return (
    <Card>
      <BlockStack gap="350">
        <BlockStack gap="100">
          <InlineStack gap="150" wrap>
            <Text as="h2" variant="headingMd">
              {t("Campaign studio")}
            </Text>
            <Badge tone="info">Terra + GPT Image 2</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            {t(
              "Terra creates the plan and copy. A separate confirmation creates the real tracking link. GPT Image 2 supplies the visual background; WhatSells overlays the exact text, real product image and scan-safe QR code.",
            )}
          </Text>
        </BlockStack>
        <Form method="post">
          <input type="hidden" name="intent" value="campaign_package" />
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>{t("Shopify product")}</span>
              <select name="productId" required defaultValue="">
                <option value="" disabled>
                  {t("Choose product")}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("Objective or idea")}</span>
              <input
                name="objective"
                maxLength={800}
                placeholder={t(
                  "Sell profitably, test TikTok, promote locally…",
                )}
              />
            </label>
          </div>
          <Button
            submit
            variant="primary"
            disabled={!products.length || !aiEnabled}
            loading={isSubmitting(navigation, "campaign_package")}
          >
            {t("Create campaign package")}
          </Button>
        </Form>
        {drafts.length ? <Divider /> : null}
        <div className={styles.draftGrid}>
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              currency={currency}
              navigation={navigation}
              storageEnabled={storageEnabled}
              aiEnabled={aiEnabled}
            />
          ))}
        </div>
      </BlockStack>
    </Card>
  );
}

export default function ExpertPage() {
  const data = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const { t, formatDate, formatMoney, formatPercent } = useI18n();
  const formatDateTime = (value) =>
    formatDate(value, { dateStyle: "medium", timeStyle: "short" });

  if (!data.unlocked) {
    return (
      <LockedExpert
        expertUrl={data.expertUrl}
        upgradeUrl={data.upgradeUrl}
        currentPlan={data.currentPlan}
      />
    );
  }

  const { snapshot, workspace } = data;
  const analysis = snapshot.analysis;
  const overview = analysis.overview;
  const recommendations = Array.isArray(analysis.recommendations)
    ? analysis.recommendations
    : [];
  const productScores = Array.isArray(analysis.productScores)
    ? analysis.productScores
    : [];
  const latestMarket = [...workspace.messages]
    .reverse()
    .find((message) => message.kind === "market_analysis");
  const latestWeekly = [...workspace.messages]
    .reverse()
    .find((message) => message.kind === "weekly_strategy");

  return (
    <Page
      title="WhatSells Expert"
      subtitle={t(
        "AI copilot grounded in measured Shopify and campaign evidence",
      )}
      backAction={{ content: t("Dashboard"), url: "/app" }}
      primaryAction={{ content: t("Create campaign"), url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.error ? (
              <Banner tone="critical">
                <Text as="p">{t(actionData.error)}</Text>
              </Banner>
            ) : null}
            {actionData?.message ? (
              <Banner tone="success">
                <Text as="p">{t(actionData.message)}</Text>
              </Banner>
            ) : null}
            {!data.configuration.ai ? (
              <Banner tone="warning">
                {t(
                  "AI is safely disabled until the OpenAI key and EXPERT_AI_ENABLED are configured on the server. The verified daily rule engine still works.",
                )}
              </Banner>
            ) : null}
            {data.configuration.ai && !data.configuration.webSearch ? (
              <Banner tone="warning">
                {t("Live market scans require EXPERT_WEB_SEARCH_ENABLED=true.")}
              </Banner>
            ) : null}
            {!data.configuration.storage ? (
              <Banner tone="warning">
                {t(
                  "Flyer generation requires the private Supabase Expert asset bucket and server credentials. Text analysis remains available.",
                )}
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" gap="300" wrap>
                  <InlineStack gap="150" wrap>
                    <Badge tone="success">
                      {t("Expert active · ${price}/month", {
                        price: EXPERT_MONTHLY_PRICE_USD,
                      })}
                    </Badge>
                    <Badge
                      tone={
                        snapshot.aiStatus === "enhanced" ? "info" : undefined
                      }
                    >
                      {t(getAiLabel(snapshot))}
                    </Badge>
                    <Badge
                      tone={
                        analysis.status === "ready" ? "success" : "attention"
                      }
                    >
                      {analysis.status === "ready"
                        ? t("Decision-ready")
                        : t("Building evidence")}
                    </Badge>
                  </InlineStack>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="refresh_snapshot"
                    />
                    <Button
                      submit
                      loading={isSubmitting(navigation, "refresh_snapshot")}
                    >
                      {t("Refresh evidence")}
                    </Button>
                  </Form>
                </InlineStack>
                <Text as="p" tone="subdued">
                  {t(
                    "Snapshot updated {date}. Customer names, emails, addresses and order IDs are never sent to the AI. Product labels and merchant text are treated as untrusted input.",
                    { date: formatDateTime(snapshot.dataThrough) },
                  )}
                </Text>
                {analysis.overviewSummary ? (
                  <Text as="p">{analysis.overviewSummary}</Text>
                ) : null}
              </BlockStack>
            </Card>

            <div className={styles.metricGrid}>
              <Metric
                label={t("Shop products")}
                value={String(data.products.length)}
              />
              <Metric
                label={t("Campaigns")}
                value={String(overview.campaigns)}
              />
              <Metric
                label={t("Clicks · 30 days")}
                value={String(overview.clicks30d)}
              />
              <Metric
                label={t("Orders · 30 days")}
                value={String(overview.orders30d)}
              />
              <Metric
                label={t("Net revenue")}
                value={formatMoney(overview.revenueCents, data.currency)}
              />
              <Metric
                label={t("Campaign result")}
                value={formatMoney(overview.resultCents, data.currency)}
              />
              <Metric label={t("ROI")} value={formatPercent(overview.roi)} />
              <Metric
                label={t("Conversion")}
                value={formatPercent(overview.conversionRate)}
              />
            </div>

            {analysis.todayAction ? (
              <RecommendationCard
                item={analysis.todayAction}
                currency={data.currency}
                featured
              />
            ) : null}

            <div className={styles.scoreColumns}>
              <GoalForm goal={workspace.goal} navigation={navigation} />
              <UsageCard usage={workspace.usage} />
            </div>
            <div className={styles.scoreColumns}>
              <CopilotCard
                messages={workspace.messages}
                navigation={navigation}
                enabled={data.configuration.ai}
              />
              <WeeklyCard
                latest={latestWeekly}
                navigation={navigation}
                currency={data.currency}
                enabled={data.configuration.ai}
              />
            </div>
            <MarketCard
              latest={latestMarket}
              navigation={navigation}
              enabled={data.configuration.ai && data.configuration.webSearch}
              products={data.products}
            />
            <CampaignStudio
              products={data.products}
              drafts={workspace.drafts}
              currency={data.currency}
              navigation={navigation}
              storageEnabled={data.configuration.storage}
              aiEnabled={data.configuration.ai}
            />

            {recommendations.length > 1 ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("Measured action queue")}
                  </Text>
                  <div className={styles.recommendationGrid}>
                    {recommendations.slice(1).map((item) => (
                      <RecommendationCard
                        key={item.key}
                        item={item}
                        currency={data.currency}
                      />
                    ))}
                  </div>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {t("Product opportunities from measured campaigns")}
                </Text>
                {productScores.length ? (
                  productScores.slice(0, 8).map((product) => (
                    <div className={styles.scoreRow} key={product.id}>
                      <InlineStack align="space-between" gap="200" wrap>
                        <Text as="h3" fontWeight="semibold">
                          #{product.rank} {product.title}
                        </Text>
                        <Text as="p" tone="subdued">
                          {t("{orders} orders · {revenue}", {
                            orders: product.orders,
                            revenue: formatMoney(
                              product.revenueCents,
                              data.currency,
                            ),
                          })}
                        </Text>
                      </InlineStack>
                      <Score
                        value={product.score}
                        confidence={product.confidence}
                      />
                    </div>
                  ))
                ) : (
                  <Text as="p" tone="subdued">
                    {t(
                      "The market scan can compare the Shopify catalog immediately. Measured Opportunity Scores appear after campaigns collect evidence.",
                    )}
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="250">
                <Text as="h2" variant="headingMd">
                  {t("Non-negotiable safeguards")}
                </Text>
                <ul className={styles.safeguardList}>
                  {analysis.methodology.safeguards.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                  <li>
                    {t(
                      "AI output is always a proposal, never a sales promise.",
                    )}
                  </li>
                  <li>
                    {t(
                      "WhatSells never starts or edits Meta, TikTok, Google or any other external ad campaign automatically.",
                    )}
                  </li>
                </ul>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
