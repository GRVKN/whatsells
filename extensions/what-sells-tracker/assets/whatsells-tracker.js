(function () {
  var CAMPAIGN_KEY = "ws_campaign";
  var STORAGE_KEY = "whatsells_campaign_token";
  var LAST_SYNC_KEY = "whatsells_last_cart_sync_token";

  var LAST_ADD_TO_CART_TRACK_KEY = "whatsells_last_add_to_cart_track";
  var ADD_TO_CART_DEBOUNCE_MS = 3000;

  /**
   * WICHTIG:
   * Diese URL muss auf deine WhatSells-App zeigen.
   * Falls deine Live-App nicht app.whatsells.dev ist, hier später anpassen.
   */
  var TRACK_BASE_URL =
    window.WHATSELLS_TRACK_BASE_URL ||
    window.WHATSELLS_APP_URL ||
    "https://app.whatsells.dev";

  var TRACK_ENDPOINT = TRACK_BASE_URL.replace(/\/$/, "") + "/api/track";

  function log() {
    try {
      console.log.apply(
        console,
        ["[WhatSells Tracker]"].concat([].slice.call(arguments)),
      );
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

  function getActiveToken() {
    var tokenFromUrl = getCampaignFromUrl();

    if (tokenFromUrl) {
      saveToken(tokenFromUrl);
      return tokenFromUrl;
    }

    return getStoredToken();
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

  function shouldTrackAddToCart(token) {
    if (!token) return false;

    try {
      var raw = window.sessionStorage.getItem(LAST_ADD_TO_CART_TRACK_KEY);
      if (!raw) return true;

      var data = JSON.parse(raw);
      var sameToken = data && data.token === token;
      var tooSoon = data && Date.now() - Number(data.time || 0) < ADD_TO_CART_DEBOUNCE_MS;

      return !(sameToken && tooSoon);
    } catch (error) {
      return true;
    }
  }

  function markAddToCartTracked(token) {
    try {
      window.sessionStorage.setItem(
        LAST_ADD_TO_CART_TRACK_KEY,
        JSON.stringify({
          token: token,
          time: Date.now(),
        }),
      );
    } catch (error) {}
  }

  function trackAddToCart(reason) {
    var token = getActiveToken();

    if (!token) {
      log("No token available, skipping add_to_cart tracking");
      return;
    }

    if (!shouldTrackAddToCart(token)) {
      log("Add-to-cart tracking skipped by debounce", token);
      return;
    }

    markAddToCartTracked(token);

    log("Tracking add_to_cart", {
      token: token,
      reason: reason || "unknown",
      endpoint: TRACK_ENDPOINT,
    });

    fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({
        type: "add_to_cart",
        campaignToken: token,
        source: "theme_extension",
        reason: reason || "unknown",
        pageUrl: window.location.href,
      }),
    })
      .then(function (response) {
        log("api/track response", response.status);

        if (!response.ok) {
          throw new Error("Track request failed with status " + response.status);
        }

        return response.json();
      })
      .then(function (data) {
        log("Add-to-cart tracked", data);
      })
      .catch(function (error) {
        log("Add-to-cart tracking failed", error);
      });
  }

  function isCartAddUrl(url) {
    try {
      var value = String(url || "");

      return (
        value.indexOf("/cart/add") !== -1 ||
        value.indexOf("cart/add.js") !== -1
      );
    } catch (error) {
      return false;
    }
  }

  function patchFetchForAddToCart() {
    if (!window.fetch || window.__whatsellsFetchPatched) return;

    window.__whatsellsFetchPatched = true;

    var originalFetch = window.fetch;

    window.fetch = function () {
      var args = arguments;
      var requestUrl = "";

      try {
        var firstArg = args[0];

        if (typeof firstArg === "string") {
          requestUrl = firstArg;
        } else if (firstArg && firstArg.url) {
          requestUrl = firstArg.url;
        }
      } catch (error) {}

      var isAddToCart = isCartAddUrl(requestUrl);

      return originalFetch.apply(this, args).then(function (response) {
        try {
          if (isAddToCart && response && response.ok) {
            trackAddToCart("fetch_cart_add");
          }
        } catch (error) {
          log("Fetch add-to-cart hook failed", error);
        }

        return response;
      });
    };

    log("Fetch add-to-cart hook installed");
  }

  function patchXhrForAddToCart() {
    if (!window.XMLHttpRequest || window.__whatsellsXhrPatched) return;

    window.__whatsellsXhrPatched = true;

    var originalOpen = window.XMLHttpRequest.prototype.open;
    var originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this.__whatsellsIsAddToCart = isCartAddUrl(url);
      } catch (error) {
        this.__whatsellsIsAddToCart = false;
      }

      return originalOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function () {
      try {
        if (this.__whatsellsIsAddToCart) {
          this.addEventListener("load", function () {
            if (this.status >= 200 && this.status < 300) {
              trackAddToCart("xhr_cart_add");
            }
          });
        }
      } catch (error) {
        log("XHR add-to-cart hook failed", error);
      }

      return originalSend.apply(this, arguments);
    };

    log("XHR add-to-cart hook installed");
  }

  function listenForAddToCartForms() {
    document.addEventListener(
      "submit",
      function (event) {
        try {
          var form = event.target;
          if (!form || !form.action) return;

          if (isCartAddUrl(form.action)) {
            window.setTimeout(function () {
              trackAddToCart("form_submit_cart_add");
            }, 800);
          }
        } catch (error) {
          log("Form add-to-cart listener failed", error);
        }
      },
      true,
    );

    document.addEventListener(
      "click",
      function (event) {
        try {
          var el = event.target;

          while (el && el !== document.body) {
            var text = clean(el.textContent).toLowerCase();
            var name = clean(el.getAttribute && el.getAttribute("name")).toLowerCase();
            var type = clean(el.getAttribute && el.getAttribute("type")).toLowerCase();

            var looksLikeAddButton =
              name === "add" ||
              type === "submit" ||
              text.includes("add to cart") ||
              text.includes("in den warenkorb") ||
              text.includes("zum warenkorb hinzufügen");

            if (looksLikeAddButton) {
              window.setTimeout(function () {
                syncCartAttribute(getActiveToken());
              }, 250);

              break;
            }

            el = el.parentElement;
          }
        } catch (error) {}
      },
      true,
    );

    log("Add-to-cart form listeners installed");
  }

  function bootstrap() {
    log("Loaded on", window.location.href);

    var token = getActiveToken();

    if (token) {
      log("Active token found", token);
      syncCartAttribute(token);
    } else {
      log("No campaign token found");
    }

    patchFetchForAddToCart();
    patchXhrForAddToCart();
    listenForAddToCartForms();

    window.addEventListener("pageshow", function () {
      var currentToken = getActiveToken();

      if (currentToken) {
        syncCartAttribute(currentToken);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();