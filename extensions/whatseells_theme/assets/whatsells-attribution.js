(() => {
  const CAMPAIGN_PARAM = "ws_campaign";
  const COOKIE_NAME = "ws_cid";
  const STORAGE_KEY = "ws_campaign";
  const CART_ATTR_KEY = "ws_campaign";
  const CART_SYNC_LOCK_KEY = "ws_campaign_sync_inflight";
  const CART_SYNC_TS_KEY = "ws_campaign_sync_ts";
  const SYNC_DEBOUNCE_MS = 1500;

  function getUrlCampaign() {
    try {
      const url = new URL(window.location.href);
      const value = url.searchParams.get(CAMPAIGN_PARAM);
      return value ? String(value).trim() : null;
    } catch {
      return null;
    }
  }



  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getStoredCampaign() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value ? String(value).trim() : null;
    } catch {
      return null;
    }
  }

  function setStoredCampaign(token) {
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {}
  }

  function getCampaignToken() {
    return getUrlCampaign() || getCookie(COOKIE_NAME) || getStoredCampaign() || null;
  }

  async function fetchCart() {
    const res = await fetch(`${window.Shopify?.routes?.root || "/"}cart.js`, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Could not load cart (${res.status})`);
    }

    return res.json();
  }

  async function updateCartAttributes(attributes) {
    const root = window.Shopify?.routes?.root || "/";
    const res = await fetch(`${root}cart/update.js`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ attributes }),
    });

    if (!res.ok) {
      throw new Error(`Could not update cart attributes (${res.status})`);
    }

    return res.json();
  }

  function shouldSyncNow() {
    try {
      const last = Number(window.sessionStorage.getItem(CART_SYNC_TS_KEY) || "0");
      return Date.now() - last > SYNC_DEBOUNCE_MS;
    } catch {
      return true;
    }
  }

  function markSyncNow() {
    try {
      window.sessionStorage.setItem(CART_SYNC_TS_KEY, String(Date.now()));
    } catch {}
  }

  function getSyncLock() {
    try {
      return window.sessionStorage.getItem(CART_SYNC_LOCK_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setSyncLock(value) {
    try {
      window.sessionStorage.setItem(CART_SYNC_LOCK_KEY, value ? "1" : "0");
    } catch {}
  }

  async function syncCampaignToCart() {
    const token = getCampaignToken();
    if (!token) return;

    setStoredCampaign(token);

    if (getSyncLock()) return;
    if (!shouldSyncNow()) return;

    setSyncLock(true);

    try {
      const cart = await fetchCart();
      const current = cart?.attributes?.[CART_ATTR_KEY];

      if (current === token) {
        markSyncNow();
        return;
      }

      await updateCartAttributes({
        [CART_ATTR_KEY]: token,
      });

      markSyncNow();
    } catch (err) {
      console.error("WhatSells cart attribution sync failed:", err);
    } finally {
      setSyncLock(false);
    }
  }

  function bootstrap() {
    syncCampaignToCart();

    document.addEventListener("submit", () => {
      syncCampaignToCart();
    }, true);

    window.addEventListener("pageshow", () => {
      syncCampaignToCart();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();