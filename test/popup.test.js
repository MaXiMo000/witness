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
    status: { textContent: "", className: "" },
    observed: { children: [], innerHTML: "", appendChild(el) { this.children.push(el); } },
  };
  return {
    getElementById: (id) => els[id],
    createElement: () => ({ textContent: "", className: "" }),
    _els: els,
  };
}

/** Load popup.js fresh with the given chrome/loadOwnedClaims stand-ins, and
 * wait for its fire-and-forget main() to settle before returning the
 * document it rendered into. */
async function runPopup({ chrome, loadOwnedClaims }) {
  global.document = fakeDocument();
  global.chrome = chrome;
  global.WitnessDiff = require("../diff.js");
  global.loadOwnedClaims = loadOwnedClaims;
  delete require.cache[POPUP_PATH];
  require(POPUP_PATH);
  // main() is async; give its promise chain room to run to completion
  // before the test reads what it rendered.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const doc = global.document;
  delete global.document;
  delete global.chrome;
  delete global.WitnessDiff;
  delete global.loadOwnedClaims;
  return doc;
}

test("popup: a normal pass renders through the real render() path", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
      storage: { session: { get: async () => ({ "tab:1": { domains: ["cdn.example.net"] } }) } },
    },
    loadOwnedClaims: async () => ({ allowed_third_party_domains: ["cdn.example.net"] }),
  });
  assert.equal(doc._els.domain.textContent, "example.com");
  assert.equal(doc._els.status.className, "pass");
});

test("popup: an unanticipated throw still renders, instead of leaving \"checking...\" forever", async () => {
  const doc = await runPopup({
    chrome: {
      tabs: { query: async () => { throw new Error("extension context invalidated"); } },
      storage: { session: { get: async () => ({}) } },
    },
    loadOwnedClaims: async () => null,
  });
  assert.equal(doc._els.status.className, "unverified");
  assert.match(doc._els.status.textContent, /extension context invalidated/);
});
