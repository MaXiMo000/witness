// Run: node --test
// popup.js is a plain (non-module) script that runs `main().catch(...)` as a
// side effect of being loaded -- in the browser, by a <script> tag; here, by
// require(). So the test sets up fake chrome/document/WitnessDiff globals
// *before* requiring it, the same way three <script> tags put diff.js's and
// claims.js's globals in scope before popup.js runs in popup.html.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const POPUP_PATH = require.resolve("../popup.js");

function fakeDocument() {
  const els = {
    domain: { textContent: "" },
    tier: { textContent: "" },
    status: { textContent: "", className: "" },
    observed: { children: [], innerHTML: "", appendChild(el) { this.children.push(el); } },
    history: { children: [], innerHTML: "", appendChild(el) { this.children.push(el); } },
  };
  return {
    getElementById: (id) => els[id],
    createElement: () => ({ textContent: "", className: "" }),
    _els: els,
  };
}

/** Load popup.js fresh with the given chrome/loadClaims stand-ins, and
 * wait for its fire-and-forget main() to settle before returning the
 * document it rendered into. */
async function runPopup({ chrome, loadClaims }) {
  global.document = fakeDocument();
  global.chrome = chrome;
  global.WitnessDiff = require("../diff.js");
  global.loadClaims = loadClaims;
  delete require.cache[POPUP_PATH];
  require(POPUP_PATH);
  // main() is async; give its promise chain room to run to completion
  // before the test reads what it rendered.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const doc = global.document;
  delete global.document;
  delete global.chrome;
  delete global.WitnessDiff;
  delete global.loadClaims;
  return doc;
}

test("popup: a normal pass renders through the real render() path", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: {
        session: { get: async () => ({ "tab:1": { domains: ["cdn.example.net"] } }) },
        local: { get: async () => ({}) },
      },
    },
    loadClaims: async () => ({ claims: { allowed_third_party_domains: ["cdn.example.net"] }, tier: "owned" }),
  });
  assert.equal(doc._els.domain.textContent, "example.com");
  assert.equal(doc._els.status.className, "pass");
  assert.match(doc._els.tier.textContent, /self-declared/);
});

test("popup: a reviewed third-party claim renders its own, distinct tier label", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: {
        session: { get: async () => ({ "tab:1": { domains: [] } }) },
        local: { get: async () => ({}) },
      },
    },
    loadClaims: async () => ({ claims: { allowed_third_party_domains: [] }, tier: "reviewed" }),
  });
  assert.match(doc._els.tier.textContent, /third-party/);
  assert.doesNotMatch(doc._els.tier.textContent, /self-declared/);
});

test("popup: unverified (no claims at all) shows no tier label", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: {
        session: { get: async () => ({ "tab:1": { domains: [] } }) },
        local: { get: async () => ({}) },
      },
    },
    loadClaims: async () => null,
  });
  assert.equal(doc._els.status.className, "unverified");
  assert.equal(doc._els.tier.textContent, "");
});

test("popup: an unanticipated throw still renders, instead of leaving \"checking...\" forever", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => { throw new Error("extension context invalidated"); } },
      storage: { session: { get: async () => ({}) }, local: { get: async () => ({}) } },
    },
    loadClaims: async () => null,
  });
  assert.equal(doc._els.status.className, "unverified");
  assert.match(doc._els.status.textContent, /extension context invalidated/);
});

test("popup: renders recorded history, newest first", async () => {
  const history = [
    { ts: 1000, status: "fail", detail: "old failure" },
    { ts: 2000, status: "pass", detail: "recovered" },
  ];
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: {
        session: { get: async () => ({ "tab:1": { domains: [] } }) },
        local: { get: async () => ({ "history:example.com": history }) },
      },
    },
    loadClaims: async () => ({ claims: { allowed_third_party_domains: [] }, tier: "owned" }),
  });
  const rendered = doc._els.history.children;
  assert.equal(rendered.length, 2);
  assert.match(rendered[0].textContent, /PASS/); // newest first
  assert.match(rendered[1].textContent, /FAIL/);
});

test("popup: no recorded history -> empty list, not an error", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: {
        session: { get: async () => ({ "tab:1": { domains: [] } }) },
        local: { get: async () => ({}) },
      },
    },
    loadClaims: async () => ({ claims: { allowed_third_party_domains: [] }, tier: "owned" }),
  });
  assert.equal(doc._els.history.children.length, 0);
});
