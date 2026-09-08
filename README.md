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
  open (domains only — no bodies, no headers beyond the URL) and keeps a
  running list of distinct third-party domains contacted.
- A `policies/<domain>.json` file declares what a domain is allowed to
  contact. See `policies/SCHEMA.md`.
- `diff.js` — pure, dependency-free comparison logic, unit tested with
  Node's built-in test runner — compares the two and reports the verdict.

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

## Status

**Verified working, in a real browser.** Loaded unpacked in Chrome,
confirmed a real `PASS` against `maximo000.github.io/carabiner/` (observed
`fonts.googleapis.com` / `fonts.gstatic.com`, matched the declared
allow-list) and a real `UNVERIFIED` on a site with no claims file. Toolbar
badge (OK/FAIL/?) and dark-mode popup styling are in. See `PLAN.md` for the
full history and what's still open.

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
