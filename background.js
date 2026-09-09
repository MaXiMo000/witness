"use strict";
/**
 * Service worker: watches every request made while a tab has a page open,
 * and keeps a running list of distinct domains contacted. No request or
 * response bodies are read, no headers beyond the URL -- the check only
 * ever needs "which domains did this page talk to."
 *
 * MV3 service workers are ephemeral (killed and restarted between events),
 * so state lives in chrome.storage.session, not a module-level variable --
 * a variable would silently reset mid-page-load and undercount domains.
 */

importScripts("diff.js", "claims.js"); // shared with popup.js

const BADGE = {
  pass: ["OK", "#2e7d32"],
  fail: ["FAIL", "#c62828"],
  unverified: ["?", "#757575"],
};

// ponytail: badge is computed once when the page finishes loading, not live
// on every later request, and not on client-side (SPA) route changes --
// good enough to glance at without opening the popup for the static sites
// witness currently checks. Add a webNavigation.onHistoryStateUpdated
// listener if a future claims file targets an SPA.
async function updateBadge(tabId, pageDomain, domains) {
  const claims = await loadOwnedClaims(pageDomain);
  const thirdParty = WitnessDiff.thirdPartyDomains(pageDomain, domains);
  const { status } = WitnessDiff.check(claims, thirdParty);
  const [text, color] = BADGE[status];
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null; // chrome-extension://, data:, etc. -- not a real domain to track
  }
}

async function getTabState(tabId) {
  const key = `tab:${tabId}`;
  const data = await chrome.storage.session.get(key);
  return data[key] || { pageDomain: null, domains: [] };
}

async function setTabState(tabId, state) {
  await chrome.storage.session.set({ [`tab:${tabId}`]: state });
}

// A new top-level navigation starts a fresh count for that tab. Without
// this, domains from the previous page on the same tab would linger and
// make the next page look like it contacted things it never did.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // top-level frame only, not iframes
  setTabState(details.tabId, { pageDomain: hostOf(details.url), domains: [] });
  chrome.action.setBadgeText({ tabId: details.tabId, text: "" }); // clear stale status while loading
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const state = await getTabState(details.tabId);
  if (state.pageDomain) updateBadge(details.tabId, state.pageDomain, state.domains);
});

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId < 0) return; // not associated with a visible tab
    const domain = hostOf(details.url);
    if (!domain) return;

    const state = await getTabState(details.tabId);
    if (!state.domains.includes(domain)) {
      state.domains.push(domain);
      await setTabState(details.tabId, state);
    }
  },
  { urls: ["<all_urls>"] },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab:${tabId}`);
});
