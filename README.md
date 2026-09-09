# witness

**Watches what a site actually does. Checks it against what it claims to do.**

A privacy policy says "we do not use third-party tracking cookies." Nobody
checks whether that's true. Your browser already sees every request a page
makes — witness just compares that against a declared claim and tells you
`pass`, `fail`, or `unverified`, the same three-status shape as
[invariant](https://github.com/MaXiMo000/invariant),
[firedrill](https://github.com/MaXiMo000/firedrill), and
[carabiner](https://github.com/MaXiMo000/carabiner): a claim nobody checked
is not the same as a claim that held up, and a site with no claims file
recorded reads as `unverified`, never a silent pass.

```
example.com
FAIL — claims no third-party trackers, but contacted: ads.example.net
  ads.example.net
```

## How

- A Manifest V3 extension watches requests made while a tab has a page
  open — no bodies are ever read — and keeps a running list of the
  distinct third-party domains contacted, which of them set a cookie
  (`Set-Cookie` on the response, read via `webRequest`'s non-blocking
  `extraHeaders`, not a new permission), and the top-level page's own
  response headers.
- A `policies/<domain>.json` file declares what a domain is allowed to
  contact, plus optionally a no-third-party-cookies claim and expectations
  about the page's own headers (e.g. "we set a CSP"). See
  `policies/SCHEMA.md`. `policies/owned.json` lists which domains a policy
  file is actually trusted for — see Scope, below.
- `diff.js` — pure, dependency-free comparison logic, unit tested with
  Node's built-in test runner — compares the three (traffic, cookies,
  headers) against the claims and reports one verdict.
- `claims.js` — the fetch orchestration `background.js` and `popup.js`
  share (load `owned.json`, check it, then load the domain's policy file).
  Kept out of `diff.js` so the pass/fail logic stays pure and Node-testable;
  this needs `chrome.runtime.getURL` and `fetch`, which only exist in the
  extension itself.
- Every verdict (pass/fail, not unverified — there's nothing to log yet)
  is appended to `chrome.storage.local`, capped at the last 20 per domain,
  and the popup shows them under "Recent checks" — so a site that passed
  today and failed last week doesn't require remembering that yourself.

## Scope

witness is a personal transparency badge for sites I own, not a general web
privacy scanner. It only ever knows about domains that have a
`policies/<domain>.json` file I wrote myself, sourced from the site's own
published claims. Every other site — YouTube, LinkedIn, anything I haven't
personally reviewed — correctly reads `UNVERIFIED`, not a bug. Broad
tracker detection across arbitrary sites is already a solved problem
(uBlock/Ghostery/Privacy Badger, built on EasyPrivacy); witness isn't
trying to replace that. Its job is narrower: prove a specific claim about a
specific site I control actually holds.

**"Sites I own" is now checked in code, not just curation.**
`policies/owned.json` is the list; `claims.js:loadOwnedClaims()` checks a
domain against it before a `policies/<domain>.json` file for that domain is
ever read, in both `background.js` and `popup.js` — a policy file existing
is no longer enough on its own, on purpose (`test/diff.test.js` asserts
exactly that: a real claims file for a domain not on the list is never
returned). This raises the bar from "nothing stops it" to "two files have
to agree, and the diff that adds one without the other is visible in
review" — it does not make the claim cryptographic or the domain's actual
ownership verifiable, and `manifest.json` still requests `<all_urls>`
because the extension has to be able to *observe* traffic on a site before
it can ever tell you whether that site is on the owned list to begin with.
Read every claim here as "sourced and reviewed by one person, and the tool
now refuses to render a verdict for anything that reviewer didn't also add
to the owned list" — still not a property the software can prove from
first principles, just one more thing that has to go wrong at once.

## Status

**Verified working, in a real browser** (as of the initial scaffold).
Loaded unpacked in Chrome, confirmed a real `PASS` against
`maximo000.github.io/carabiner/` (observed `fonts.googleapis.com` /
`fonts.gstatic.com`, matched the declared allow-list) and a real
`UNVERIFIED` on a site with no claims file. Toolbar badge (OK/FAIL/?) and
dark-mode popup styling are in.

Everything added since — the owned-list gate, the popup's top-level error
handling, persisted verdict history, and cookie/header claims — is covered
by `node --test` (25 tests, including several that load the real
`popup.js`/`diff.js` with fake `chrome`/`document` globals and check what
they actually rendered or decided) but **not re-confirmed end-to-end in a
real Chrome instance** — every session since the initial scaffold has hit a
tooling outage reaching a real browser. The `webRequest.onHeadersReceived`
listener in particular (`extraHeaders`, `Set-Cookie` visibility, header
capture timing against `onCompleted`) is exactly the kind of thing that can
look right in a unit test and still behave differently against a real
response — load-unpacked and click through, including a site that actually
sets a third-party cookie, before trusting this beyond what the tests
already pin down.

## Try the logic

```bash
node --test
```

## Load it (once you're in a real browser)

```
chrome://extensions → Developer mode → Load unpacked → select this folder
```

Then visit a page under a domain with a `policies/<domain>.json` file (a
real one already exists for `maximo000.github.io`) and open the popup.

## What's deliberately not here

No icon, no packaging, no Chrome Web Store listing, no claims file for any
domain I don't personally control — that last one isn't a TODO, it's the
scope (see above).

MIT licensed.
