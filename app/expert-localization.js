const DYNAMIC_RECOMMENDATION_PATTERNS = Object.freeze([
  [/^Protect budget on “(.+)”$/, "Protect budget on “{name}”"],
  [
    /^Improve the product path for “(.+)”$/,
    "Improve the product path for “{name}”",
  ],
  [
    /^Investigate checkout friction for “(.+)”$/,
    "Investigate checkout friction for “{name}”",
  ],
  [/^Scale “(.+)” carefully$/, "Scale “{name}” carefully"],
  [/^Traffic is falling for “(.+)”$/, "Traffic is falling for “{name}”"],
  [
    /^Collect a clearer signal for “(.+)”$/,
    "Collect a clearer signal for “{name}”",
  ],
  [/^Prioritize “(.+)”$/, "Prioritize “{name}”"],
  [/^Test a second channel for “(.+)”$/, "Test a second channel for “{name}”"],
]);

function localizeRecommendationText(value, t) {
  const text = String(value || "");

  for (const [pattern, source] of DYNAMIC_RECOMMENDATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return t(source, { name: match[1] });
  }

  const assignmentMatch = text.match(
    /^(\d+) campaigns? cannot contribute to product opportunities yet\.$/,
  );
  if (assignmentMatch) {
    const count = Number(assignmentMatch[1]);
    return count === 1
      ? t("1 campaign cannot contribute to product opportunities yet.")
      : t("{count} campaigns cannot contribute to product opportunities yet.", {
          count,
        });
  }

  return t(text);
}

export function localizeExpertRecommendation(item, t) {
  return {
    ...item,
    title: localizeRecommendationText(item?.title, t),
    summary: localizeRecommendationText(item?.summary, t),
    rationale: localizeRecommendationText(item?.rationale, t),
    nextStep: localizeRecommendationText(item?.nextStep, t),
  };
}
