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
  const state = stored[`tab:${tab.id}`] || { pageDomain, domains: [] };

  // A claims file bundled with the extension itself for now (policies/).
  // Fetching a domain's own claims from *itself* would defeat the point --
  // a site can't be trusted to self-report the thing being checked.
  let claims = null;
  try {
    const res = await fetch(chrome.runtime.getURL(`policies/${pageDomain}.json`));
    if (res.ok) claims = await res.json();
  } catch {
    // no bundled claims file for this domain -- that's fine, reads as unverified
  }

  const thirdParty = WitnessDiff.thirdPartyDomains(pageDomain, state.domains);
  const result = WitnessDiff.check(claims, thirdParty);
  render(result, pageDomain, thirdParty);
}

function render(result, domain, thirdParty) {
  document.getElementById("domain").textContent = domain;
  const statusEl = document.getElementById("status");
  statusEl.textContent = `${result.status.toUpperCase()} — ${result.detail}`;
  statusEl.className = result.status;

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

main();
