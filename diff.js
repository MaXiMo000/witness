"use strict";
/**
 * Compare what a page actually did (observed third-party request domains)
 * against what its policy claims to do. Pure functions, no browser APIs --
 * so this is testable with plain Node and shared as-is between the
 * background service worker and the popup.
 */

function stripWww(host) {
  return host.replace(/^www\./, "");
}

/** Every distinct third-party domain contacted, normalized. */
function thirdPartyDomains(pageDomain, requestDomains) {
  const page = stripWww(pageDomain);
  return [...new Set(requestDomains.map(stripWww))].filter((d) => d !== page);
}

/**
 * @param {object|null} claims - parsed policies/<domain>.json, or null if
 *   none exists for this domain yet
 * @param {string[]} observedDomains - distinct third-party domains contacted
 *   while the page was open (already normalized via thirdPartyDomains)
 * @returns {{status: "pass"|"fail"|"unverified", detail: string, unexpected: string[]}}
 */
function check(claims, observedDomains) {
  // No claims recorded for this site -- that's not a pass. There is nothing
  // here to compare against, so the honest answer is "don't know yet", same
  // three-status shape as the rest of this line of tools.
  if (!claims) {
    return { status: "unverified", detail: "no claims recorded for this site yet", unexpected: [] };
  }

  const allowed = new Set((claims.allowed_third_party_domains || []).map(stripWww));
  const unexpected = observedDomains.map(stripWww).filter((d) => !allowed.has(d));

  if (unexpected.length === 0) {
    return { status: "pass", detail: "observed traffic matches declared claims", unexpected: [] };
  }

  const noTrackersClaimed = Boolean(claims.claims && claims.claims.no_third_party_trackers);
  const detail = noTrackersClaimed
    ? `claims no third-party trackers, but contacted: ${unexpected.join(", ")}`
    : `contacted domains outside the declared allow-list: ${unexpected.join(", ")}`;
  return { status: "fail", detail, unexpected };
}

/**
 * Whether `domain` is on the list of sites actually reviewed and owned --
 * the code-level half of the "sites I own" scope README.md documents. A
 * policy file existing under policies/ is not, by itself, proof of that;
 * anyone could add one. `ownedList` is policies/owned.json, the one file a
 * PR adding a new domain has to touch alongside the policy file itself.
 */
function isOwned(ownedList, domain) {
  const target = stripWww(domain);
  return Array.isArray(ownedList) && ownedList.some((d) => stripWww(d) === target);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { check, thirdPartyDomains, stripWww, isOwned };
} else {
  self.WitnessDiff = { check, thirdPartyDomains, stripWww, isOwned };
}
