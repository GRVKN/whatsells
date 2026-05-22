(function () {
  var CAMPAIGN_KEY = "ws_campaign";
  var STORAGE_KEY = "whatsells_campaign_token";
  var LAST_SYNC_KEY = "whatsells_last_cart_sync_token";

  function log() {
    try {
      console.log.apply(console, ["[WhatSells Tracker]"].concat([].slice.call(arguments)));
    } catch (error) {}
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function getCampaignFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      return clean(params.get(CAMPAIGN_KEY));
    } catch (error) {
      log("Could not read URL params", error);
      return "";
    }
  }

  function saveToken(token) {
    if (!token) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, token);
      log("Saved token to localStorage", token);
    } catch (error) {
      log("Could not save token to localStorage", error);
    }

    try {
      document.cookie =
        CAMPAIGN_KEY +
        "=" +
        encodeURIComponent(token) +
        "; path=/; max-age=" +
        60 * 60 * 24 * 7 +
        "; SameSite=Lax";

      log("Saved token to cookie", token);
    } catch (error) {
      log("Could not save token to cookie", error);
    }
  }

  function getStoredToken() {
    try {
      return clean(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      log("Could not read token from localStorage", error);
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
    if (!token) {
      log("No token available, skipping cart sync");
      return;
    }

    if (!shouldSyncCart(token)) {
      log("Cart already synced for this session", token);
      return;
    }

    log("Syncing cart attribute", token);

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
      .then(function (response) {
        log("cart/update.js response", response.status);

        if (!response.ok) {
          throw new Error("Cart update failed with status " + response.status);
        }

        markSynced(token);
        return response.json();
      })
      .then(function (cart) {
        log("Cart attributes after sync", cart.attributes);
      })
      .catch(function (error) {
        log("Cart sync failed", error);
      });
  }

  log("Loaded on", window.location.href);

  var tokenFromUrl = getCampaignFromUrl();

  if (tokenFromUrl) {
    log("Token found in URL", tokenFromUrl);
    saveToken(tokenFromUrl);
    syncCartAttribute(tokenFromUrl);
    return;
  }

  var storedToken = getStoredToken();

  if (storedToken) {
    log("Using stored token", storedToken);
    syncCartAttribute(storedToken);
    return;
  }

  log("No campaign token found");
})();