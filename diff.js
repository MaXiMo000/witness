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
 * A domain claiming "no third-party trackers" can still fail on cookies
 * alone: a request can land on the allow-list (it's a font host, a CDN)
 * while still dropping a tracking cookie that host never needed to set.
 * Same three-status discipline as check() -- null means "nothing to say",
 * never a silent pass baked into the caller's own logic.
 */
function checkCookies(claims, cookieDomains) {
  if (!claims || !(claims.claims && claims.claims.no_third_party_cookies)) return null;
  const setters = [...new Set(cookieDomains.map(stripWww))];
  if (setters.length === 0) return null;
  return `claims no third-party cookies, but a cookie was set by: ${setters.join(", ")}`;
}

/**
 * `claims.headers` checks the page's own top-level response headers, not
 * third-party requests -- e.g. a site that documents "we set a strict CSP"
 * can be held to that literally. `pageHeaders` is the raw
 * chrome.webRequest responseHeaders array (name/value pairs, any case).
 * Two rule shapes, deliberately not a full header-value grammar: `present`
 * (the header exists at all) and `contains` (a substring match) -- a full
 * CSP/HSTS parser is a lot of code for a claims file that just needs "this
 * exists" or "this mentions X", and a brittle exact-match would fail on
 * harmless directive reordering that isn't the claim being checked.
 */
function checkHeaders(claims, pageHeaders) {
  const expected = claims && claims.headers;
  if (!expected) return null;
  const actual = new Map((pageHeaders || []).map((h) => [h.name.toLowerCase(), h.value]));
  const missing = [];
  for (const [name, rule] of Object.entries(expected)) {
    const value = actual.get(name.toLowerCase());
    if (rule.present && value === undefined) {
      missing.push(`${name} (not sent)`);
    } else if (rule.contains && !(value || "").includes(rule.contains)) {
      missing.push(`${name} (expected to contain "${rule.contains}")`);
    }
  }
  return missing.length ? `declared header claims not observed: ${missing.join(", ")}` : null;
}

/**
 * @param {object|null} claims - parsed policies/<domain>.json, or null if
 *   none exists for this domain yet
 * @param {string[]} observedDomains - distinct third-party domains contacted
 *   while the page was open (already normalized via thirdPartyDomains)
 * @param {{cookieDomains?: string[], pageHeaders?: object[]}} [extra] -
 *   cookieDomains: third-party domains observed setting a cookie.
 *   pageHeaders: the top-level page's own response headers.
 * @returns {{status: "pass"|"fail"|"unverified", detail: string, unexpected: string[]}}
 */
function check(claims, observedDomains, extra = {}) {
  // No claims recorded for this site -- that's not a pass. There is nothing
  // here to compare against, so the honest answer is "don't know yet", same
  // three-status shape as the rest of this line of tools.
  if (!claims) {
    return { status: "unverified", detail: "no claims recorded for this site yet", unexpected: [] };
  }

  const allowed = new Set((claims.allowed_third_party_domains || []).map(stripWww));
  const unexpected = observedDomains.map(stripWww).filter((d) => !allowed.has(d));

  if (unexpected.length > 0) {
    const noTrackersClaimed = Boolean(claims.claims && claims.claims.no_third_party_trackers);
    const detail = noTrackersClaimed
      ? `claims no third-party trackers, but contacted: ${unexpected.join(", ")}`
      : `contacted domains outside the declared allow-list: ${unexpected.join(", ")}`;
    return { status: "fail", detail, unexpected };
  }

  const cookieDetail = checkCookies(claims, extra.cookieDomains || []);
  if (cookieDetail) return { status: "fail", detail: cookieDetail, unexpected: [] };

  const headerDetail = checkHeaders(claims, extra.pageHeaders || []);
  if (headerDetail) return { status: "fail", detail: headerDetail, unexpected: [] };

  return { status: "pass", detail: "observed traffic matches declared claims", unexpected: [] };
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

/**
 * The code-enforced half of SCHEMA.md's "Filling one in for a real, named
 * third party" guidance -- a policy for a domain you don't own is only
 * ever loaded if its own `source` field looks like it actually cites
 * something: a real link, and either a quoted phrase or enough prose that
 * it isn't just a bare assertion. This can't verify the quote is genuine
 * -- no code can -- it only refuses the one failure mode a computer
 * *can* catch: a "reviewed" entry with no citation in it at all. The
 * human judgment SCHEMA.md asks for (is this actually what the policy
 * says, quoted correctly) still has to happen before the file is ever
 * written; this is a floor under that, not a replacement for it.
 */
function isValidReviewedClaims(claims) {
  if (!claims || typeof claims.source !== "string") return false;
  const source = claims.source;
  const hasLink = /https?:\/\//.test(source);
  const hasQuoteOrSubstance = /["“‘’]/.test(source) || source.length >= 40;
  return hasLink && hasQuoteOrSubstance;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    check, checkCookies, checkHeaders, thirdPartyDomains, stripWww, isOwned, isValidReviewedClaims,
  };
} else {
  self.WitnessDiff = {
    check, checkCookies, checkHeaders, thirdPartyDomains, stripWww, isOwned, isValidReviewedClaims,
  };
}
