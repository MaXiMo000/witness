// Run: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { check, thirdPartyDomains, stripWww } = require("../diff.js");

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
