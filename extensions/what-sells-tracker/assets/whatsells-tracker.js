(function () {
  var CAMPAIGN_KEY = "ws_campaign";
  var STORAGE_KEY = "whatsells_campaign_token";
  var LAST_SYNC_KEY = "whatsells_last_cart_sync_token";

  function clean(value) {
    return String(value || "").trim();
  }

  function getCampaignFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      return clean(params.get(CAMPAIGN_KEY));
    } catch (error) {
      return "";
    }
  }

  function saveToken(token) {
    if (!token) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch (error) {}

    try {
      document.cookie =
        CAMPAIGN_KEY +
        "=" +
        encodeURIComponent(token) +
        "; path=/; max-age=" +
        60 * 60 * 24 * 7 +
        "; SameSite=Lax";
    } catch (error) {}
  }

  function getStoredToken() {
    try {
      return clean(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return "";
    }
  }

  function shouldSyncCart(token) {
    try {
      return window.sessionStorage.getItem(LAST_SYNC_KEY) !== token;
    } catch (error) {
      return true;
    }
  }

  function markSynced(token) {
    try {
      window.sessionStorage.setItem(LAST_SYNC_KEY, token);
    } catch (error) {}
  }

  function syncCartAttribute(token) {
    if (!token) return;
    if (!shouldSyncCart(token)) return;

    fetch("/cart/update.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        attributes: {
          ws_campaign: token,
        },
      }),
    })
      .then(function () {
        markSynced(token);
      })
      .catch(function () {});
  }

  var tokenFromUrl = getCampaignFromUrl();

  if (tokenFromUrl) {
    saveToken(tokenFromUrl);
    syncCartAttribute(tokenFromUrl);
    return;
  }

  var storedToken = getStoredToken();

  if (storedToken) {
    syncCartAttribute(storedToken);
  }
})();