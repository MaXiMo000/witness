"use strict";
/**
 * Fetch orchestration shared between background.js and popup.js. Not in
 * diff.js on purpose -- diff.js is pure and runs under plain Node in tests;
 * this needs chrome.runtime.getURL and fetch, which only exist in the
 * extension. Kept small and free of the pass/fail logic itself, which stays
 * in diff.js where it's tested.
 */

// In the extension, diff.js (loaded first) already put this on the shared
// global scope. Under Node -- this file's own tests -- there is no such
// global yet, so pull it in the same way diff.js exports for Node.
const WitnessDiff =
  typeof module !== "undefined" && module.exports ? require("./diff.js") : self.WitnessDiff;

async function fetchJson(path, fallback) {
  try {
    const res = await fetch(chrome.runtime.getURL(path));
    if (res.ok) return await res.json();
  } catch {
    // Bundled with the extension and should always load; if it somehow
    // doesn't, the fallback (an empty list, or null) fails closed the
    // same way a domain not being on either list already does.
  }
  return fallback;
}

/**
 * The claims for `pageDomain`, or null if there are none to trust.
 *
 * Two tiers, checked in order, same "policy file existing is not enough
 * on its own" discipline for both:
 *
 * - `owned`: policies/owned.json -- sites you operate. The claim is a
 *   self-declared statement of fact about your own infrastructure.
 * - `reviewed`: policies/reviewed.json -- real, named third parties you
 *   don't own but have carefully reviewed, per SCHEMA.md's "Filling one
 *   in for a real, named third party". These additionally have to pass
 *   `isValidReviewedClaims` -- a citation-shaped `source` field is
 *   required in code, not just asked for in docs, before the claim is
 *   ever loaded.
 *
 * @returns {Promise<{claims: object, tier: "owned"|"reviewed"}|null>}
 */
async function loadClaims(pageDomain) {
  const owned = await fetchJson("policies/owned.json", []);
  if (WitnessDiff.isOwned(owned, pageDomain)) {
    const claims = await fetchJson(`policies/${pageDomain}.json`, null);
    return claims ? { claims, tier: "owned" } : null;
  }

  const reviewed = await fetchJson("policies/reviewed.json", []);
  if (WitnessDiff.isOwned(reviewed, pageDomain)) {
    const claims = await fetchJson(`policies/${pageDomain}.json`, null);
    if (claims && WitnessDiff.isValidReviewedClaims(claims)) {
      return { claims, tier: "reviewed" };
    }
    return null; // present, but doesn't clear the sourcing bar -- fails closed
  }

  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { loadClaims };
}
