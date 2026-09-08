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

## Status

**Early scaffold, not yet run in a real browser.** The comparison logic is
real and tested (`node --test`); the extension itself (manifest, service
worker, popup) is written and syntax-checked but has never been loaded into
an actual browser from this environment. See `PLAN.md` for exactly what's
verified, what isn't, and the next concrete steps — read that before
building on this further.

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

## What's deliberately not here yet

No icon, no toolbar badge, no packaging, no claims file for any domain I
don't personally control. That last one is a judgment call, not a coding
task — see "Before naming a real company" in `PLAN.md`.

MIT licensed.
