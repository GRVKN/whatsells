import { Prisma } from "@prisma/client";

import db from "./db.server";
import {
  buildIncrementalRefundSnapshot,
  buildOrderFinancialSnapshot,
  calculateOrderReconciliation,
  getRefundPayloadAmountCents,
} from "./order-reconciliation.js";

const ORDER_RECONCILIATION_QUERY = `#graphql
  query WhatSellsOrderReconciliation($id: ID!) {
    order(id: $id) {
      id
      name
      cancelledAt
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalRefundedSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
`;

function clean(value) {
  return String(value || "").trim();
}

function toOrderGid(value) {
  const id = clean(value);
  if (!id) return null;

  return id.startsWith("gid://shopify/Order/")
    ? id
    : `gid://shopify/Order/${id}`;
}

function getOrderGid(payload, topic) {
  const normalizedTopic = clean(topic).toUpperCase().replaceAll("/", "_");

  if (normalizedTopic === "REFUNDS_CREATE") {
    return (
      toOrderGid(payload?.order?.admin_graphql_api_id) ||
      toOrderGid(payload?.order_id)
    );
  }

  return (
    toOrderGid(payload?.admin_graphql_api_id) ||
    toOrderGid(payload?.order?.admin_graphql_api_id) ||
    toOrderGid(payload?.order_id) ||
    (normalizedTopic === "ORDERS_CANCELLED" ? toOrderGid(payload?.id) : null)
  );
}

function getOrderIdCandidates(orderGid) {
  const candidates = new Set([orderGid]);
  const numericId = clean(orderGid).split("/").at(-1);

  if (numericId) {
    candidates.add(numericId);
  }

  return [...candidates];
}

function getRefundId(payload) {
  return clean(payload?.admin_graphql_api_id) || clean(payload?.id) || null;
}

function getPayloadCurrency(payload) {
  const transaction = Array.isArray(payload?.transactions)
    ? payload.transactions.find((item) => item?.currency)
    : null;
  const lineItem = Array.isArray(payload?.refund_line_items)
    ? payload.refund_line_items[0]
    : null;

  return (
    clean(transaction?.currency) ||
    clean(lineItem?.subtotal_set?.shop_money?.currency_code) ||
    null
  );
}

function buildCancelledOrderFromPayload(payload, orderGid) {
  const total = payload?.total_price;
  const refunded = payload?.total_refunded;
  const currency = clean(payload?.currency);

  if (total === null || total === undefined || !currency) {
    return null;
  }

  return {
    id: orderGid,
    name: clean(payload?.name) || orderGid,
    cancelledAt: payload?.cancelled_at || new Date().toISOString(),
    totalPriceSet: {
      shopMoney: {
        amount: total,
        currencyCode: currency,
      },
    },
    totalRefundedSet: {
      shopMoney: {
        amount: refunded || "0",
        currencyCode: currency,
      },
    },
  };
}

async function loadCurrentOrder(admin, orderGid) {
  if (!admin?.graphql) {
    throw new Error("Shopify Admin API is unavailable for this webhook.");
  }

  const response = await admin.graphql(ORDER_RECONCILIATION_QUERY, {
    variables: {
      id: orderGid,
    },
  });
  const body = await response.json();

  if (body?.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }

  return body?.data?.order || null;
}

async function updateAttributedOrder({
  shop,
  order,
  orderIdCandidates,
  processedRefundId = null,
  maxAttempts = 3,
}) {
  const next = buildOrderFinancialSnapshot(order);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const event = await tx.event.findFirst({
            where: {
              type: "purchase",
              orderId: {
                in: orderIdCandidates,
              },
              campaign: {
                shop,
              },
            },
            select: {
              id: true,
              campaignId: true,
              valueCents: true,
              originalValueCents: true,
              refundedCents: true,
              isCancelled: true,
              processedRefundIds: true,
            },
          });

          if (!event) {
            return {
              status: "not_attributed",
              orderId: order.id,
              orderName: order.name,
            };
          }

          const deltas = calculateOrderReconciliation(event, next);
          const shouldRecordRefund =
            processedRefundId &&
            !event.processedRefundIds.includes(processedRefundId);

          await tx.event.update({
            where: {
              id: event.id,
            },
            data: {
              originalValueCents: next.originalValueCents,
              refundedCents: next.refundedCents,
              valueCents: next.valueCents,
              isCancelled: next.isCancelled,
              reconciledAt: new Date(),
              currency: next.currency,
              orderId: order.id,
              ...(shouldRecordRefund
                ? {
                    processedRefundIds: {
                      push: processedRefundId,
                    },
                  }
                : {}),
            },
          });

          if (
            deltas.revenueDeltaCents !== 0 ||
            deltas.refundedDeltaCents !== 0 ||
            deltas.ordersDelta !== 0 ||
            deltas.cancelledOrdersDelta !== 0
          ) {
            await tx.campaign.update({
              where: {
                id: event.campaignId,
              },
              data: {
                revenueCents: {
                  increment: deltas.revenueDeltaCents,
                },
                refundedCents: {
                  increment: deltas.refundedDeltaCents,
                },
                ordersCount: {
                  increment: deltas.ordersDelta,
                },
                cancelledOrdersCount: {
                  increment: deltas.cancelledOrdersDelta,
                },
              },
            });
          }

          return {
            status: "updated",
            orderId: order.id,
            orderName: order.name,
            campaignId: event.campaignId,
            ...next,
            ...deltas,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (error?.code === "P2034" && attempt < maxAttempts) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Order reconciliation retry limit reached.");
}

async function applyRefundPayload({
  shop,
  payload,
  orderGid,
  orderIdCandidates,
  maxAttempts = 3,
}) {
  const refundId = getRefundId(payload);
  const refundAmountCents = getRefundPayloadAmountCents(payload);

  if (!refundId) {
    throw new Error("Refund webhook is missing a refund id.");
  }

  if (refundAmountCents <= 0) {
    throw new Error("Refund webhook contains no successful refund amount.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const event = await tx.event.findFirst({
            where: {
              type: "purchase",
              orderId: {
                in: orderIdCandidates,
              },
              campaign: {
                shop,
              },
            },
            select: {
              id: true,
              campaignId: true,
              originalValueCents: true,
              valueCents: true,
              refundedCents: true,
              currency: true,
              isCancelled: true,
              processedRefundIds: true,
            },
          });

          if (!event) {
            return {
              status: "not_attributed",
              orderId: orderGid,
            };
          }

          if (event.processedRefundIds.includes(refundId)) {
            return {
              status: "duplicate_refund",
              orderId: orderGid,
              campaignId: event.campaignId,
              refundId,
            };
          }

          const next = buildIncrementalRefundSnapshot(event, refundAmountCents);
          const deltas = calculateOrderReconciliation(event, next);

          await tx.event.update({
            where: {
              id: event.id,
            },
            data: {
              originalValueCents: next.originalValueCents,
              refundedCents: next.refundedCents,
              valueCents: next.valueCents,
              reconciledAt: new Date(),
              currency: event.currency || getPayloadCurrency(payload),
              processedRefundIds: {
                push: refundId,
              },
            },
          });

          await tx.campaign.update({
            where: {
              id: event.campaignId,
            },
            data: {
              revenueCents: {
                increment: deltas.revenueDeltaCents,
              },
              refundedCents: {
                increment: deltas.refundedDeltaCents,
              },
            },
          });

          return {
            status: "updated_from_webhook_payload",
            orderId: orderGid,
            campaignId: event.campaignId,
            refundId,
            ...next,
            ...deltas,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (error?.code === "P2034" && attempt < maxAttempts) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Refund payload reconciliation retry limit reached.");
}

export async function reconcileAttributedOrder({
  admin,
  shop,
  payload,
  topic,
}) {
  const orderGid = getOrderGid(payload, topic);

  if (!orderGid) {
    return {
      status: "missing_order_id",
      topic,
    };
  }

  const normalizedTopic = clean(topic).toUpperCase().replaceAll("/", "_");
  const orderIdCandidates = getOrderIdCandidates(orderGid);
  const payloadOrder =
    normalizedTopic === "ORDERS_CANCELLED"
      ? buildCancelledOrderFromPayload(payload, orderGid)
      : null;

  if (payloadOrder) {
    return updateAttributedOrder({
      shop,
      order: payloadOrder,
      orderIdCandidates,
    });
  }

  try {
    const order = await loadCurrentOrder(admin, orderGid);

    if (order) {
      return updateAttributedOrder({
        shop,
        order,
        orderIdCandidates,
        processedRefundId:
          normalizedTopic === "REFUNDS_CREATE" ? getRefundId(payload) : null,
      });
    }
  } catch (error) {
    if (normalizedTopic !== "REFUNDS_CREATE") {
      throw error;
    }

    console.warn(
      "Shopify order lookup failed; using the signed refund payload:",
      {
        error,
        orderId: orderGid,
        shop,
      },
    );
  }

  if (normalizedTopic === "REFUNDS_CREATE") {
    return applyRefundPayload({
      shop,
      payload,
      orderGid,
      orderIdCandidates,
    });
  }

  return {
    status: "order_not_found",
    orderId: orderGid,
    topic,
  };
}
