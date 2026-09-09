"use strict";
/**
 * Service worker: watches every request made while a tab has a page open,
 * and keeps a running list of distinct domains contacted, which of them set
 * a cookie, and the top-level page's own response headers -- everything the
 * three claim types (traffic, cookies, headers) need. No request or
 * response bodies are ever read.
 *
 * MV3 service workers are ephemeral (killed and restarted between events),
 * so per-page state lives in chrome.storage.session, not a module-level
 * variable -- a variable would silently reset mid-page-load and undercount.
 * Verdict history is the one thing that survives a browser restart, so it
 * lives in chrome.storage.local instead.
 */

importScripts("diff.js", "claims.js"); // shared with popup.js

const BADGE = {
  pass: ["OK", "#2e7d32"],
  fail: ["FAIL", "#c62828"],
  unverified: ["?", "#757575"],
};

// History is capped per domain so an always-open tab on one site can't grow
// storage without bound -- the last 20 checks is plenty to see a pattern
// ("this has failed the last 3 times") without needing a real database.
const HISTORY_LIMIT = 20;

async function recordHistory(domain, result) {
  const key = `history:${WitnessDiff.stripWww(domain)}`;
  const stored = await chrome.storage.local.get(key);
  const entries = stored[key] || [];
  entries.push({ ts: Date.now(), status: result.status, detail: result.detail });
  await chrome.storage.local.set({ [key]: entries.slice(-HISTORY_LIMIT) });
}

// ponytail: badge is computed once when the page finishes loading, not live
// on every later request, and not on client-side (SPA) route changes --
// good enough to glance at without opening the popup for the static sites
// witness currently checks. Add a webNavigation.onHistoryStateUpdated
// listener if a future claims file targets an SPA.
async function updateBadge(tabId, pageDomain, state) {
  const loaded = await loadClaims(pageDomain);
  const thirdParty = WitnessDiff.thirdPartyDomains(pageDomain, state.domains);
  const cookieDomains = WitnessDiff.thirdPartyDomains(pageDomain, state.cookieDomains);
  const result = WitnessDiff.check(loaded?.claims ?? null, thirdParty,
    { cookieDomains, pageHeaders: state.pageHeaders });
  const [text, color] = BADGE[result.status];
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  // unverified is "nothing recorded yet", not a check that ran and found
  // something -- recording it as history would just be noise every time an
  // unreviewed site is visited.
  if (result.status !== "unverified") await recordHistory(pageDomain, result);
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
  return data[key] || { pageDomain: null, domains: [], cookieDomains: [], pageHeaders: [] };
}

async function setTabState(tabId, state) {
  await chrome.storage.session.set({ [`tab:${tabId}`]: state });
}

// A new top-level navigation starts a fresh count for that tab. Without
// this, domains (and cookies, headers) from the previous page on the same
// tab would linger and make the next page look like it did things it never
// did.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // top-level frame only, not iframes
  setTabState(details.tabId, { pageDomain: hostOf(details.url), domains: [], cookieDomains: [], pageHeaders: [] });
  chrome.action.setBadgeText({ tabId: details.tabId, text: "" }); // clear stale status while loading
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const state = await getTabState(details.tabId);
  if (state.pageDomain) updateBadge(details.tabId, state.pageDomain, state);
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

// Non-blocking observation only -- no "blocking" in extraInfoSpec, so this
// never touches the response, just reads it. "extraHeaders" is required to
// see Set-Cookie at all: Chrome hides it from the default responseHeaders
// set for privacy, but that hiding is lifted for an extension that already
// holds the host permission covering the request, which manifest.json's
// <all_urls> does -- no new permission needed for either header claims or
// cookie claims.
chrome.webRequest.onHeadersReceived.addListener(
  async (details) => {
    if (details.tabId < 0) return;
    const domain = hostOf(details.url);
    if (!domain) return;
    const headers = details.responseHeaders || [];
    const state = await getTabState(details.tabId);
    let changed = false;

    if (details.type === "main_frame") {
      state.pageHeaders = headers;
      changed = true;
    }
    const setsCookie = headers.some((h) => h.name.toLowerCase() === "set-cookie");
    if (setsCookie && !state.cookieDomains.includes(domain)) {
      state.cookieDomains.push(domain);
      changed = true;
    }
    if (changed) await setTabState(details.tabId, state);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"],
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab:${tabId}`);
});
