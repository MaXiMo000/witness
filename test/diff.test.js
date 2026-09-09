// Run: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { check, checkCookies, checkHeaders, thirdPartyDomains, stripWww, isOwned } = require("../diff.js");

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

test("loadOwnedClaims: an owned domain with a policy file returns it", async () => {
  const { loadOwnedClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": ["example.com"],
    "policies/example.com.json": { allowed_third_party_domains: ["cdn.example.net"] },
  };
  global.fetch = async (url) =>
    url in files
      ? { ok: true, json: async () => files[url] }
      : { ok: false };
  try {
    const claims = await loadOwnedClaims("example.com");
    assert.deepEqual(claims, files["policies/example.com.json"]);
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

test("loadOwnedClaims: a real policy file for an unowned domain is never returned", async () => {
  const { loadOwnedClaims } = require("../claims.js");
  global.chrome = { runtime: { getURL: (p) => p } };
  const files = {
    "policies/owned.json": ["example.com"], // does not list evil.example.com
    "policies/evil.example.com.json": { allowed_third_party_domains: [] },
  };
  global.fetch = async (url) =>
    url in files
      ? { ok: true, json: async () => files[url] }
      : { ok: false };
  try {
    const claims = await loadOwnedClaims("evil.example.com");
    assert.equal(claims, null, "a policy file existing must not be enough on its own");
  } finally {
    delete global.chrome;
    delete global.fetch;
  }
});
