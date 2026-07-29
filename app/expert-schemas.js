const shortString = { type: "string", maxLength: 500 };
const longString = { type: "string", maxLength: 1_500 };

const channelEnum = [
  "meta",
  "instagram",
  "tiktok",
  "google",
  "email",
  "influencer",
  "flyer",
  "packaging",
  "event",
  "qr",
  "link",
];

export const expertChatSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: longString,
    certainty: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    suggestedActions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: shortString,
          intent: {
            type: "string",
            enum: [
              "review_product",
              "run_market_scan",
              "create_campaign_package",
              "collect_more_data",
              "none",
            ],
          },
          productId: { type: "string", maxLength: 200 },
        },
        required: ["label", "intent", "productId"],
      },
    },
    dataLimits: {
      type: "array",
      maxItems: 5,
      items: shortString,
    },
  },
  required: ["answer", "certainty", "suggestedActions", "dataLimits"],
};

export const expertMarketSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: longString,
    marketWindow: shortString,
    rankedProducts: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productId: { type: "string", maxLength: 200 },
          rank: { type: "integer", minimum: 1, maximum: 100 },
          opportunityScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          whyNow: longString,
          measuredEvidence: {
            type: "array",
            maxItems: 6,
            items: shortString,
          },
          marketEvidence: {
            type: "array",
            maxItems: 6,
            items: shortString,
          },
          risks: {
            type: "array",
            maxItems: 5,
            items: shortString,
          },
          recommendedChannels: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", enum: channelEnum },
          },
          testPlan: longString,
        },
        required: [
          "productId",
          "rank",
          "opportunityScore",
          "confidence",
          "whyNow",
          "measuredEvidence",
          "marketEvidence",
          "risks",
          "recommendedChannels",
          "testPlan",
        ],
      },
    },
    portfolioPlan: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productId: { type: "string", maxLength: 200 },
          channel: { type: "string", enum: channelEnum },
          role: {
            type: "string",
            enum: ["primary_test", "secondary_test", "hold", "collect_data"],
          },
          reason: longString,
        },
        required: ["productId", "channel", "role", "reason"],
      },
    },
    dataLimits: {
      type: "array",
      maxItems: 8,
      items: shortString,
    },
  },
  required: [
    "summary",
    "marketWindow",
    "rankedProducts",
    "portfolioPlan",
    "dataLimits",
  ],
};

export const expertCampaignSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    productId: { type: "string", maxLength: 200 },
    campaignName: { type: "string", maxLength: 120 },
    objective: shortString,
    channel: { type: "string", enum: channelEnum },
    secondaryChannels: {
      type: "array",
      maxItems: 3,
      items: { type: "string", enum: channelEnum },
    },
    audience: longString,
    hypothesis: longString,
    offer: longString,
    headline: { type: "string", maxLength: 180 },
    primaryText: longString,
    shortText: { type: "string", maxLength: 300 },
    cta: { type: "string", maxLength: 80 },
    recommendedBudgetCents: {
      type: "integer",
      minimum: 0,
      maximum: 100_000_000,
    },
    durationDays: { type: "integer", minimum: 1, maximum: 90 },
    successMetric: shortString,
    stopConditions: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: shortString,
    },
    creativeBrief: longString,
    flyerConcept: {
      type: "object",
      additionalProperties: false,
      properties: {
        visualDirection: longString,
        headline: { type: "string", maxLength: 180 },
        subline: { type: "string", maxLength: 260 },
        cta: { type: "string", maxLength: 80 },
        qrCaption: { type: "string", maxLength: 120 },
      },
      required: ["visualDirection", "headline", "subline", "cta", "qrCaption"],
    },
    safeguards: {
      type: "array",
      maxItems: 6,
      items: shortString,
    },
  },
  required: [
    "productId",
    "campaignName",
    "objective",
    "channel",
    "secondaryChannels",
    "audience",
    "hypothesis",
    "offer",
    "headline",
    "primaryText",
    "shortText",
    "cta",
    "recommendedBudgetCents",
    "durationDays",
    "successMetric",
    "stopConditions",
    "creativeBrief",
    "flyerConcept",
    "safeguards",
  ],
};

export const expertWeeklySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    executiveSummary: longString,
    wins: {
      type: "array",
      maxItems: 6,
      items: shortString,
    },
    risks: {
      type: "array",
      maxItems: 6,
      items: shortString,
    },
    productPriorities: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productId: { type: "string", maxLength: 200 },
          priority: {
            type: "string",
            enum: ["scale", "test", "improve", "hold", "stop"],
          },
          reason: longString,
        },
        required: ["productId", "priority", "reason"],
      },
    },
    channelPlan: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          channel: { type: "string", enum: channelEnum },
          action: longString,
          budgetCents: {
            type: "integer",
            minimum: 0,
            maximum: 100_000_000,
          },
        },
        required: ["channel", "action", "budgetCents"],
      },
    },
    tests: {
      type: "array",
      maxItems: 6,
      items: longString,
    },
    totalRecommendedBudgetCents: {
      type: "integer",
      minimum: 0,
      maximum: 100_000_000,
    },
    dataLimits: {
      type: "array",
      maxItems: 8,
      items: shortString,
    },
  },
  required: [
    "executiveSummary",
    "wins",
    "risks",
    "productPriorities",
    "channelPlan",
    "tests",
    "totalRecommendedBudgetCents",
    "dataLimits",
  ],
};

export const EXPERT_CHANNELS = Object.freeze(channelEnum);
