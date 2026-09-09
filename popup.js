"use strict";

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return render({ status: "unverified", detail: "no active tab", unexpected: [] }, "", []);

  let pageDomain;
  try {
    pageDomain = new URL(tab.url).hostname;
  } catch {
    return render({ status: "unverified", detail: "not a web page", unexpected: [] }, tab.url, []);
  }

  const stored = await chrome.storage.session.get(`tab:${tab.id}`);
  const state = stored[`tab:${tab.id}`] || { pageDomain, domains: [], cookieDomains: [], pageHeaders: [] };

  // A claims file bundled with the extension itself for now (policies/).
  // Fetching a domain's own claims from *itself* would defeat the point --
  // a site can't be trusted to self-report the thing being checked.
  const loaded = await loadClaims(pageDomain);

  const thirdParty = WitnessDiff.thirdPartyDomains(pageDomain, state.domains);
  const cookieDomains = WitnessDiff.thirdPartyDomains(pageDomain, state.cookieDomains || []);
  const result = WitnessDiff.check(loaded?.claims ?? null, thirdParty,
    { cookieDomains, pageHeaders: state.pageHeaders });
  render(result, pageDomain, thirdParty, loaded?.tier ?? null);
  renderHistory(await loadHistory(pageDomain));
}

async function loadHistory(domain) {
  const key = `history:${WitnessDiff.stripWww(domain)}`;
  const stored = await chrome.storage.local.get(key);
  return stored[key] || [];
}

main().catch((err) => {
  // Every already-caught step above reads as unverified on its own failure;
  // this is the floor under anything that wasn't anticipated -- without it
  // the popup was stuck on the static "checking..." from popup.html forever,
  // with nothing to say a real error, not a slow network, was why.
  render({ status: "unverified", detail: `witness hit an internal error: ${err.message}`, unexpected: [] }, "", []);
});

// Shown once, distinct from the pass/fail verdict itself: a reader should
// be able to tell "the operator says this about their own site" from "a
// reviewer sourced this from the company's public policy" without reading
// SCHEMA.md -- the two carry different epistemic weight, and collapsing
// them into one undifferentiated claim would overstate the third-party
// case and undersell the owned one.
const TIER_LABEL = {
  owned: "self-declared — a site you operate",
  reviewed: "third-party claim — reviewed and sourced, not your own site",
};

function render(result, domain, thirdParty, tier) {
  document.getElementById("domain").textContent = domain;
  const statusEl = document.getElementById("status");
  statusEl.textContent = `${result.status.toUpperCase()} — ${result.detail}`;
  statusEl.className = result.status;

  const tierEl = document.getElementById("tier");
  if (tierEl) tierEl.textContent = tier ? TIER_LABEL[tier] : "";

  const unexpected = new Set(result.unexpected);
  const list = document.getElementById("observed");
  list.innerHTML = "";
  for (const d of thirdParty) {
    const li = document.createElement("li");
    li.textContent = d;
    if (unexpected.has(d)) li.className = "unexpected";
    list.appendChild(li);
  }
}

function renderHistory(entries) {
  const list = document.getElementById("history");
  if (!list) return; // absent in tests that don't need it
  list.innerHTML = "";
  // Newest first: what changed recently matters more than the oldest entry
  // still inside the cap.
  for (const entry of [...entries].reverse()) {
    const li = document.createElement("li");
    const when = new Date(entry.ts).toLocaleString();
    li.textContent = `${when} — ${entry.status.toUpperCase()}`;
    li.className = entry.status;
    li.title = entry.detail;
    list.appendChild(li);
  }
}
