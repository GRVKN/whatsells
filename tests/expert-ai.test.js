import assert from "node:assert/strict";
import test from "node:test";

import { enhanceExpertAnalysis } from "../app/expert-ai.server.js";

const analysis = {
  currency: "EUR",
  overview: { campaigns: 1 },
  methodology: { safeguards: [] },
  recommendations: [
    {
      key: "collect_data:test",
      type: "collect_data",
      scope: "campaign",
      title: "Collect data",
      summary: "Original summary",
      rationale: "Original rationale",
      nextStep: "Original next step",
      confidence: "Low",
      metrics: { clicks30d: 4 },
    },
  ],
  todayAction: {
    key: "collect_data:test",
  },
};

test("Expert works without an OpenAI key by keeping verified copy", async () => {
  const result = await enhanceExpertAnalysis(analysis, {
    enabled: false,
    apiKey: "",
  });

  assert.equal(result.aiStatus, "rules_only");
  assert.equal(result.analysis, analysis);
});

test("Expert accepts structured AI wording without changing the recommendation key", async () => {
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);

    assert.equal(request.store, false);
    assert.equal(request.text.format.type, "json_schema");

    return {
      ok: true,
      async json() {
        return {
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    overviewSummary: "Measured signal is still early.",
                    recommendations: [
                      {
                        key: "collect_data:test",
                        summary: "Collect a larger sample.",
                        rationale: "Four clicks are too little evidence.",
                        nextStep: "Verify distribution and keep measuring.",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        };
      },
    };
  };

  const result = await enhanceExpertAnalysis(analysis, {
    enabled: true,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  assert.equal(result.aiStatus, "enhanced");
  assert.equal(result.aiModel, "test-model");
  assert.equal(result.analysis.todayAction.key, "collect_data:test");
  assert.equal(result.analysis.todayAction.summary, "Collect a larger sample.");
});

test("Expert falls back safely when AI wording fails", async () => {
  const result = await enhanceExpertAnalysis(analysis, {
    enabled: true,
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });

  assert.equal(result.aiStatus, "failed");
  assert.equal(result.analysis.recommendations[0].summary, "Original summary");
});
