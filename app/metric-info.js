export const METRIC_INFO = {
  revenue: {
    title: "Net revenue",
    description:
      "Revenue from attributed orders after tracked refunds and cancellations.",
    formula:
      "Original attributed order value − refunds − value of cancelled orders",
    example: "€1,000 in attributed orders − €150 refunded = €850 net revenue.",
    note: "Taxes and shipping included in the Shopify order total can still be part of this value.",
  },
  orders: {
    title: "Orders",
    description:
      "Attributed Shopify orders that have not been cancelled. A refunded order can remain an order unless Shopify also marks it cancelled.",
    formula: "Attributed orders − cancelled attributed orders",
    example: "10 attributed orders − 2 cancellations = 8 active orders.",
  },
  refunds: {
    title: "Refunds",
    description:
      "The amount Shopify reports as refunded for attributed orders.",
    formula: "Sum of Shopify refunds for attributed orders",
    example: "Two refunds of €25 and €40 produce €65 in refunds.",
  },
  cancelledOrders: {
    title: "Cancelled orders",
    description:
      "Attributed orders Shopify has marked as cancelled. They remain visible for audit purposes but no longer count as successful orders.",
    formula: "Count of attributed orders with a Shopify cancellation",
    example:
      "If 2 of 10 attributed orders are cancelled, active orders become 8.",
  },
  campaignResult: {
    title: "Campaign result",
    description: "A campaign-only result, not the merchant's final profit.",
    formula: "Net attributed revenue − campaign cost",
    example: "€850 net revenue − €300 campaign cost = €550 campaign result.",
    note: "Product cost, shipping, payment fees, taxes, returns handling and other operating costs are not deducted.",
  },
  roi: {
    title: "ROI",
    description: "Shows the campaign result relative to campaign cost.",
    formula: "(Net revenue − campaign cost) ÷ campaign cost × 100",
    example:
      "€1,000 net revenue and €400 campaign cost give a €600 result and 150% ROI.",
    note: "This is a campaign ROI. It is not a full business-profit calculation.",
  },
  roas: {
    title: "ROAS",
    description:
      "Shows how much net attributed revenue was generated per unit of campaign spend.",
    formula: "Net attributed revenue ÷ campaign cost",
    example: "€1,000 net revenue ÷ €400 campaign cost = 2.50x ROAS.",
    note: "ROAS does not deduct product or operating costs.",
  },
  conversion: {
    title: "Conversion",
    description:
      "The share of tracked clicks that became active attributed orders.",
    formula: "Active attributed orders ÷ tracked clicks × 100",
    example: "5 active orders from 100 clicks = 5% conversion.",
  },
  addToCarts: {
    title: "Add-to-Carts",
    description:
      "Tracked occasions when a visitor from this campaign added an item to the cart.",
    formula: "Count of tracked add-to-cart events",
    note: "Repeated cart actions can occur before one order; this is an intent signal, not a sale.",
  },
  addToCartRate: {
    title: "Add-to-Cart Rate",
    description:
      "The share of tracked clicks that led to a tracked add-to-cart action.",
    formula: "Add-to-Carts ÷ tracked clicks × 100",
    example: "20 add-to-carts from 100 clicks = 20%.",
  },
  cartToOrder: {
    title: "Cart-to-Order Rate",
    description:
      "Compares active attributed orders with tracked add-to-cart actions.",
    formula: "Active attributed orders ÷ Add-to-Carts × 100",
    example: "5 active orders from 20 add-to-carts = 25%.",
  },
  campaignName: {
    title: "Campaign name",
    description:
      "A unique internal name that lets you recognise and compare this campaign later.",
    example: "Spring flyer Berlin or TikTok creator Anna.",
  },
  campaignType: {
    title: "Campaign type",
    description:
      "Describes where the tracking link or QR code will be used. It helps organise and compare campaigns.",
  },
  productSelection: {
    title: "Shopify product",
    description:
      "The product this campaign promotes. WhatSells loads it directly from your Shopify catalog and creates the destination automatically.",
    example:
      "Choose the same product for TikTok, Instagram, packaging and flyer campaigns to compare those channels together.",
    note: "The product must be published to your Shopify Online Store.",
  },
  campaignCost: {
    title: "Campaign cost",
    description:
      "Enter only the total cost of this campaign in the store currency.",
    example:
      "Include the ad spend, creator fee or printing cost assigned to this campaign.",
    note: "Do not enter product, shipping, payment or general operating costs here.",
  },
  notes: {
    title: "Notes",
    description:
      "Optional internal context that helps you understand the campaign later.",
    example: "300 flyers, distributed 12 March, spring offer.",
  },
};
