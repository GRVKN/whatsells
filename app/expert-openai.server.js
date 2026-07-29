import {
  ExpertUsageLimitError,
  completeExpertUsage,
  failExpertUsage,
  reserveExpertUsage,
} from "./expert-usage.server.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const EXPERT_MODEL_TASKS = Object.freeze({
  DAILY: "daily",
  CHAT: "chat",
  MARKET: "market",
  CAMPAIGN: "campaign",
  WEEKLY: "weekly",
});

const TASK_CONFIG = Object.freeze({
  [EXPERT_MODEL_TASKS.DAILY]: Object.freeze({
    env: "OPENAI_FAST_MODEL",
    fallback: "gpt-5.6-luna",
    reasoning: "none",
    maxOutputTokens: 1_800,
  }),
  [EXPERT_MODEL_TASKS.CHAT]: Object.freeze({
    env: "OPENAI_FAST_MODEL",
    fallback: "gpt-5.6-luna",
    reasoning: "none",
    maxOutputTokens: 1_500,
  }),
  [EXPERT_MODEL_TASKS.MARKET]: Object.freeze({
    env: "OPENAI_EXPERT_MODEL",
    fallback: "gpt-5.6-terra",
    reasoning: "low",
    maxOutputTokens: 4_500,
  }),
  [EXPERT_MODEL_TASKS.CAMPAIGN]: Object.freeze({
    env: "OPENAI_EXPERT_MODEL",
    fallback: "gpt-5.6-terra",
    reasoning: "low",
    maxOutputTokens: 3_500,
  }),
  [EXPERT_MODEL_TASKS.WEEKLY]: Object.freeze({
    env: "OPENAI_DEEP_MODEL",
    fallback: "gpt-5.6-sol",
    reasoning: "high",
    maxOutputTokens: 5_000,
  }),
});

export class ExpertAiUnavailableError extends Error {
  constructor(message, code = "expert_ai_unavailable") {
    super(message);
    this.name = "ExpertAiUnavailableError";
    this.code = code;
  }
}

export function resolveExpertModel(task, env = process.env) {
  const config = TASK_CONFIG[task] || TASK_CONFIG[EXPERT_MODEL_TASKS.CHAT];
  return String(env[config.env] || config.fallback).trim();
}

export function getResponseOutputText(body) {
  if (typeof body?.output_text === "string") {
    return body.output_text;
  }

  for (const item of Array.isArray(body?.output) ? body.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        return part.text;
      }
    }
  }

  return "";
}

export function extractOpenAIUsage(body) {
  const usage = body?.usage || {};

  return {
    inputTokens: Math.max(Number(usage.input_tokens) || 0, 0),
    cachedInputTokens: Math.max(
      Number(usage.input_tokens_details?.cached_tokens) || 0,
      0,
    ),
    outputTokens: Math.max(Number(usage.output_tokens) || 0, 0),
    webSearchCalls: (Array.isArray(body?.output) ? body.output : []).filter(
      (item) => item?.type === "web_search_call",
    ).length,
  };
}

export function extractOpenAICitations(body) {
  const citations = new Map();

  function add(value) {
    const url = String(value?.url || "").trim();
    if (!url.startsWith("https://") && !url.startsWith("http://")) return;

    citations.set(url, {
      url,
      title: String(value?.title || value?.name || url)
        .trim()
        .slice(0, 300),
    });
  }

  for (const item of Array.isArray(body?.output) ? body.output : []) {
    for (const source of Array.isArray(item?.action?.sources)
      ? item.action.sources
      : []) {
      add(source);
    }

    for (const part of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(part?.annotations)
        ? part.annotations
        : []) {
        if (annotation?.type === "url_citation") {
          add(annotation);
        }
      }
    }
  }

  return [...citations.values()].slice(0, 20);
}

export async function callStructuredExpertResponse({
  shop = "",
  category,
  task,
  instructions,
  input,
  schema,
  schemaName,
  webSearch = false,
  model: modelOverride,
  maxOutputTokens,
  enabled = process.env.EXPERT_AI_ENABLED === "true",
  webSearchEnabled = process.env.EXPERT_WEB_SEARCH_ENABLED === "true",
  apiKey = process.env.OPENAI_API_KEY || "",
  fetchImpl = fetch,
  reserveUsage = reserveExpertUsage,
  completeUsage = completeExpertUsage,
  failUsage = failExpertUsage,
}) {
  if (!enabled || !apiKey) {
    throw new ExpertAiUnavailableError(
      "The Expert AI connection is not enabled.",
      "ai_disabled",
    );
  }

  if (webSearch && !webSearchEnabled) {
    throw new ExpertAiUnavailableError(
      "Live market search is not enabled.",
      "web_search_disabled",
    );
  }

  const config = TASK_CONFIG[task] || TASK_CONFIG[EXPERT_MODEL_TASKS.CHAT];
  const model = String(modelOverride || resolveExpertModel(task)).trim();
  let reservation = null;

  try {
    if (shop && category) {
      reservation = await reserveUsage({
        shop,
        category,
        model,
      });
    }

    const requestBody = {
      model,
      store: false,
      reasoning: {
        effort: config.reasoning,
      },
      instructions,
      input: typeof input === "string" ? input : JSON.stringify(input ?? null),
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
      max_output_tokens: maxOutputTokens || config.maxOutputTokens,
      ...(webSearch
        ? {
            tools: [{ type: "web_search" }],
            tool_choice: "required",
            include: ["web_search_call.action.sources"],
          }
        : {}),
    };
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(webSearch ? 60_000 : 30_000),
    });

    if (!response.ok) {
      throw new ExpertAiUnavailableError(
        `OpenAI Responses API returned ${response.status}`,
        `openai_${response.status}`,
      );
    }

    const body = await response.json();
    if (body?.status && body.status !== "completed") {
      throw new ExpertAiUnavailableError(
        "OpenAI did not complete the response.",
        `openai_${body.status}`,
      );
    }

    const outputText = getResponseOutputText(body);
    if (!outputText) {
      throw new ExpertAiUnavailableError(
        "OpenAI returned no structured output.",
        "empty_output",
      );
    }

    const data = JSON.parse(outputText);
    const usage = extractOpenAIUsage(body);
    const citations = extractOpenAICitations(body);

    if (reservation) {
      await completeUsage({
        requestId: reservation.requestId,
        model,
        ...usage,
        providerResponseId: body?.id || null,
      });
    }

    return {
      data,
      model,
      citations,
      usage,
      providerResponseId: body?.id || null,
    };
  } catch (error) {
    if (reservation) {
      try {
        await failUsage({
          requestId: reservation.requestId,
          failureCode: error?.code || error?.name || "provider_error",
        });
      } catch (usageError) {
        console.error("Could not release Expert usage reservation", {
          error: usageError?.message || String(usageError),
        });
      }
    }

    if (
      error instanceof ExpertAiUnavailableError ||
      error instanceof ExpertUsageLimitError
    ) {
      throw error;
    }

    throw new ExpertAiUnavailableError(
      error?.message || "Expert AI request failed.",
      error instanceof SyntaxError ? "invalid_structured_output" : "ai_error",
    );
  }
}
