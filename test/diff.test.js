// Run: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  check, checkCookies, checkHeaders, thirdPartyDomains, stripWww, isOwned, isValidReviewedClaims,
  redactSensitiveHeaders,
} = require("../diff.js");

test("no claims file -> unverified, never a false pass or fail", () => {
  const result = check(null, ["ads.example"]);
  assert.equal(result.status, "unverified");
});

test("clean site, only allowed domains contacted -> pass", () => {
  const claims = { claims: { no_third_party_trackers: true }, allowed_third_party_domains: ["fonts.gstatic.com"] };
  const result = check(claims, ["fonts.gstatic.com"]);
  assert.equal(result.status, "pass");
});

test("site claims no trackers but contacts one anyway -> fail, names it", () => {
  const claims = { claims: { no_third_party_trackers: true }, allowed_third_party_domains: [] };
  const result = check(claims, ["ads.example.com"]);
  assert.equal(result.status, "fail");
  assert.ok(result.unexpected.includes("ads.example.com"));
  assert.match(result.detail, /ads\.example\.com/);
});

test("www. is normalized so it can't cause a false mismatch", () => {
  const claims = { claims: {}, allowed_third_party_domains: ["fonts.gstatic.com"] };
  const result = check(claims, ["www.fonts.gstatic.com"]);
  assert.equal(result.status, "pass");
});

test("thirdPartyDomains excludes the page's own domain and de-dupes", () => {
  const domains = thirdPartyDomains("example.com", ["example.com", "www.example.com", "cdn.example.org", "cdn.example.org"]);
  assert.deepEqual(domains, ["cdn.example.org"]);
});

test("stripWww only strips a leading www.", () => {
  assert.equal(stripWww("www.example.com"), "example.com");
  assert.equal(stripWww("wwwexample.com"), "wwwexample.com");
  assert.equal(stripWww("static.example.com"), "static.example.com");
});

test("isOwned: a domain on the list is owned, www.-insensitively", () => {
  assert.equal(isOwned(["maximo000.github.io"], "maximo000.github.io"), true);
  assert.equal(isOwned(["maximo000.github.io"], "www.maximo000.github.io"), true);
  assert.equal(isOwned(["www.maximo000.github.io"], "maximo000.github.io"), true);
});

test("isOwned: a policy file existing is not the same as being on the list", () => {
  assert.equal(isOwned(["maximo000.github.io"], "evil.example.com"), false);
});

test("isOwned: fails closed on a missing or malformed owned list", () => {
  assert.equal(isOwned([], "maximo000.github.io"), false);
  assert.equal(isOwned(null, "maximo000.github.io"), false);
  assert.equal(isOwned(undefined, "maximo000.github.io"), false);
});

test("isValidReviewedClaims: a link plus a quoted phrase clears the bar", () => {
  const claims = { source: 'Their policy says "no third-party trackers" -- https://example.com/privacy' };
  assert.equal(isValidReviewedClaims(claims), true);
});

test("isValidReviewedClaims: a link plus enough prose (no quote marks) also clears it", () => {
  const claims = { source: "Reviewed the published privacy policy at https://example.com/privacy on 2026-09-10" };
  assert.equal(isValidReviewedClaims(claims), true);
});

test("isValidReviewedClaims: a bare assertion with no link is refused", () => {
  assert.equal(isValidReviewedClaims({ source: "trust me, I checked" }), false);
});

test("isValidReviewedClaims: a link with no quote and too little prose is refused", () => {
  assert.equal(isValidReviewedClaims({ source: "see https://example.com" }), false);
});

test("isValidReviewedClaims: a missing or non-string source is refused, not a crash", () => {
  assert.equal(isValidReviewedClaims({}), false);
  assert.equal(isValidReviewedClaims({ source: 42 }), false);
  assert.equal(isValidReviewedClaims(null), false);
});

test("loadClaims: an owned domain with a policy file returns it, tagged 'owned'", async () => {
  const { loadClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": ["example.com"],
    "policies/reviewed.json": [],
    "policies/example.com.json": { allowed_third_party_domains: ["cdn.example.net"] },
  };
  global.fetch = async (url) =>
    url in files
      ? { ok: true, json: async () => files[url] }
      : { ok: false };
  try {
    const loaded = await loadClaims("example.com");
    assert.deepEqual(loaded, { claims: files["policies/example.com.json"], tier: "owned" });
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});

test("checkCookies: no claim -> nothing to say, even if cookies were set", () => {
  assert.equal(checkCookies({ claims: {} }, ["ads.example"]), null);
});

test("checkCookies: claims none, none observed -> nothing to say", () => {
  const claims = { claims: { no_third_party_cookies: true } };
  assert.equal(checkCookies(claims, []), null);
});

test("checkCookies: claims none but a third party set one -> names it", () => {
  const claims = { claims: { no_third_party_cookies: true } };
  const detail = checkCookies(claims, ["www.ads.example"]);
  assert.match(detail, /ads\.example/);
});

test("checkHeaders: no claim -> nothing to say", () => {
  assert.equal(checkHeaders({}, [{ name: "X-Foo", value: "1" }]), null);
});

test("checkHeaders: present claim satisfied, case-insensitively", () => {
  const claims = { headers: { "Content-Security-Policy": { present: true } } };
  const detail = checkHeaders(claims, [{ name: "content-security-policy", value: "default-src 'none'" }]);
  assert.equal(detail, null);
});

test("checkHeaders: present claim not satisfied -> names the header", () => {
  const claims = { headers: { "content-security-policy": { present: true } } };
  const detail = checkHeaders(claims, [{ name: "content-type", value: "text/html" }]);
  assert.match(detail, /content-security-policy/);
});

test("checkHeaders: contains claim checks a substring, not an exact match", () => {
  const claims = { headers: { "content-security-policy": { contains: "default-src 'none'" } } };
  const ok = checkHeaders(claims, [{ name: "content-security-policy", value: "default-src 'none'; script-src 'self'" }]);
  assert.equal(ok, null);
  const bad = checkHeaders(claims, [{ name: "content-security-policy", value: "default-src *" }]);
  assert.match(bad, /content-security-policy/);
});

test("check: an allow-listed domain still fails a no-cookies claim if it sets one", () => {
  const claims = { claims: { no_third_party_cookies: true }, allowed_third_party_domains: ["cdn.example.net"] };
  const result = check(claims, ["cdn.example.net"], { cookieDomains: ["cdn.example.net"] });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /cdn\.example\.net/);
});

test("check: a declared header claim that the response never sent -> fail", () => {
  const claims = { allowed_third_party_domains: [], headers: { "content-security-policy": { present: true } } };
  const result = check(claims, [], { pageHeaders: [] });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /content-security-policy/);
});

test("check: cookie and header claims both satisfied -> pass, same as before they existed", () => {
  const claims = {
    claims: { no_third_party_cookies: true },
    allowed_third_party_domains: ["cdn.example.net"],
    headers: { "content-security-policy": { present: true } },
  };
  const result = check(claims, ["cdn.example.net"], {
    cookieDomains: [],
    pageHeaders: [{ name: "content-security-policy", value: "default-src 'none'" }],
  });
  assert.equal(result.status, "pass");
});

test("loadClaims: a real policy file for a domain on neither list is never returned", async () => {
  const { loadClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": ["example.com"], // does not list evil.example.com
    "policies/reviewed.json": [],
    "policies/evil.example.com.json": { allowed_third_party_domains: [] },
  };
  global.fetch = async (url) =>
    url in files
      ? { ok: true, json: async () => files[url] }
      : { ok: false };
  try {
    const loaded = await loadClaims("evil.example.com");
    assert.equal(loaded, null, "a policy file existing must not be enough on its own");
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});

test("loadClaims: a reviewed domain with a properly sourced claim returns it, tagged 'reviewed'", async () => {
  const { loadClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": [],
    "policies/reviewed.json": ["thirdparty.example"],
    "policies/thirdparty.example.json": {
      allowed_third_party_domains: [],
      source: 'Their privacy policy states "we do not use third-party trackers" -- https://thirdparty.example/privacy',
    },
  };
  global.fetch = async (url) =>
    url in files ? { ok: true, json: async () => files[url] } : { ok: false };
  try {
    const loaded = await loadClaims("thirdparty.example");
    assert.deepEqual(loaded, { claims: files["policies/thirdparty.example.json"], tier: "reviewed" });
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});

test("loadClaims: a reviewed domain whose claims file has no real citation is refused", async () => {
  const { loadClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": [],
    "policies/reviewed.json": ["thirdparty.example"],
    // No link, no quote -- just an assertion. Exactly what
    // isValidReviewedClaims exists to refuse.
    "policies/thirdparty.example.json": { allowed_third_party_domains: [], source: "trust me" },
  };
  global.fetch = async (url) =>
    url in files ? { ok: true, json: async () => files[url] } : { ok: false };
  try {
    const loaded = await loadClaims("thirdparty.example");
    assert.equal(loaded, null, "an under-sourced third-party claim must fail closed, not load anyway");
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});

test("loadClaims: a domain on both lists reads as owned, not reviewed", async () => {
  // Not a real scenario (a domain shouldn't be on both), but the lookup
  // order is worth pinning explicitly: owned is checked first, so an
  // owned domain's claims never have to clear the reviewed tier's extra
  // sourcing bar just because it also ended up on that list.
  const { loadClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": ["example.com"],
    "policies/reviewed.json": ["example.com"],
    "policies/example.com.json": { allowed_third_party_domains: [], source: "a fact about my own site" },
  };
  global.fetch = async (url) =>
    url in files ? { ok: true, json: async () => files[url] } : { ok: false };
  try {
    const loaded = await loadClaims("example.com");
    assert.equal(loaded.tier, "owned");
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});

test("redactSensitiveHeaders: a Set-Cookie value is masked, name kept", () => {
  const headers = [
    { name: "Set-Cookie", value: "session=abc123secret; Path=/" },
    { name: "Content-Type", value: "text/html" },
  ];
  const result = redactSensitiveHeaders(headers);
  assert.equal(result[0].name, "Set-Cookie");
  assert.equal(result[0].value, "[REDACTED]");
  assert.equal(result[1].value, "text/html"); // unrelated header untouched
});

test("redactSensitiveHeaders: matches header names case-insensitively", () => {
  const result = redactSensitiveHeaders([{ name: "AUTHORIZATION", value: "Bearer sk-real-token" }]);
  assert.equal(result[0].value, "[REDACTED]");
});

test("redactSensitiveHeaders: a present-only claim still works after redaction", () => {
  const claims = { headers: { "set-cookie": { present: true } } };
  const redacted = redactSensitiveHeaders([{ name: "Set-Cookie", value: "session=abc123secret" }]);
  assert.equal(checkHeaders(claims, redacted), null); // still detected as present
});

test("redactSensitiveHeaders: empty/missing input doesn't throw", () => {
  assert.deepEqual(redactSensitiveHeaders([]), []);
  assert.deepEqual(redactSensitiveHeaders(undefined), []);
});
