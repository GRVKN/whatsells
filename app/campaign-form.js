function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCampaignDraft({ name, shopifyProductId, cost }) {
  const errors = {};
  const trimmedName = cleanString(name);
  const trimmedCost = cleanString(cost);

  if (!trimmedName) {
    errors.name = "Enter a name so you can recognise this campaign later.";
  }

  if (trimmedName.length > 120) {
    errors.name = "Use 120 characters or fewer.";
  }

  if (!cleanString(shopifyProductId)) {
    errors.product = "Choose the Shopify product this campaign promotes.";
  }

  if (trimmedCost) {
    const parsedCost = Number(trimmedCost.replace(",", "."));

    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      errors.cost = "Enter a positive amount, for example 25 or 25.50.";
    }
  }

  return errors;
}

export function hasCampaignDraftErrors(errors) {
  return Boolean(errors && Object.keys(errors).length);
}
