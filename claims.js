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

/**
 * The claims for `pageDomain`, or null if there are none to trust -- either
 * no policies/<domain>.json exists, or one does but the domain is not on
 * policies/owned.json. A policy file existing is not proof of ownership;
 * only the owned list is checked in code (README.md's "Scope" section).
 */
async function loadOwnedClaims(pageDomain) {
  let owned = [];
  try {
    const res = await fetch(chrome.runtime.getURL("policies/owned.json"));
    if (res.ok) owned = await res.json();
  } catch {
    // owned.json is bundled with the extension and should always load; if it
    // somehow doesn't, isOwned([], ...) is false and every domain reads
    // unverified -- fails closed, never a verdict for an unreviewed site.
  }
  if (!WitnessDiff.isOwned(owned, pageDomain)) return null;

  try {
    const res = await fetch(chrome.runtime.getURL(`policies/${pageDomain}.json`));
    if (res.ok) return await res.json();
  } catch {
    // no bundled claims file for this domain -- reads as unverified
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { loadOwnedClaims };
}
