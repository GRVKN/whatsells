import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPERT_MODEL_TASKS,
  callStructuredExpertResponse,
  extractOpenAICitations,
  extractOpenAIUsage,
  resolveExpertModel,
} from "../app/expert-openai.server.js";

test("model router keeps fast, expert and deep roles separate", () => {
  assert.equal(resolveExpertModel(EXPERT_MODEL_TASKS.CHAT, {}), "gpt-5.6-luna");
  assert.equal(
    resolveExpertModel(EXPERT_MODEL_TASKS.MARKET, {}),
    "gpt-5.6-terra",
  );
  assert.equal(
    resolveExpertModel(EXPERT_MODEL_TASKS.WEEKLY, {}),
    "gpt-5.6-sol",
  );
});

test("Responses usage and native web citations are extracted", () => {
  const body = {
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 20 },
    },
    output: [
      {
        type: "web_search_call",
        action: {
          sources: [{ url: "https://example.com/a", title: "Source A" }],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "{}",
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com/a",
                title: "Source A",
              },
            ],
          },
        ],
      },
    ],
  };

  assert.deepEqual(extractOpenAIUsage(body), {
    inputTokens: 120,
    cachedInputTokens: 20,
    outputTokens: 40,
    webSearchCalls: 1,
  });
  assert.deepEqual(extractOpenAICitations(body), [
    { url: "https://example.com/a", title: "Source A" },
  ]);
});

test("structured call reserves and completes merchant usage", async () => {
  const calls = [];
  const result = await callStructuredExpertResponse({
    shop: "shop.example",
    category: "chat",
    task: EXPERT_MODEL_TASKS.CHAT,
    instructions: "Test",
    input: { question: "Test" },
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { answer: { type: "string" } },
      required: ["answer"],
    },
    schemaName: "test_schema",
    enabled: true,
    apiKey: "test-key",
    reserveUsage: async (value) => {
      calls.push(["reserve", value]);
      return { requestId: "request-1" };
    },
    completeUsage: async (value) => {
      calls.push(["complete", value]);
    },
    failUsage: async (value) => {
      calls.push(["fail", value]);
    },
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.model, "gpt-5.6-luna");
      assert.equal(request.reasoning.effort, "none");
      assert.equal(request.store, false);

      return {
        ok: true,
        async json() {
          return {
            id: "resp-1",
            status: "completed",
            usage: {
              input_tokens: 10,
              output_tokens: 5,
            },
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ answer: "Done" }),
                  },
                ],
              },
            ],
          };
        },
      };
    },
  });

  assert.deepEqual(result.data, { answer: "Done" });
  assert.equal(calls[0][0], "reserve");
  assert.equal(calls[1][0], "complete");
  assert.equal(
    calls.some(([name]) => name === "fail"),
    false,
  );
});
