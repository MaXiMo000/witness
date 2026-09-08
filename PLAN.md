# witness — continuity notes

Read this first if you're picking this project up in a new session.

## The idea, in one line

A browser extension that watches what a site actually contacts (third-party
domains, in your own browser, on your own traffic) and checks it against a
claims file for that domain -- `pass` / `fail` / `unverified`, same
three-status shape as [invariant](https://github.com/MaXiMo000/invariant),
[firedrill](https://github.com/MaXiMo000/firedrill) and
[carabiner](https://github.com/MaXiMo000/carabiner). Different audience
(a person browsing, not a developer's CI), different surface (a browser
extension, not a CLI), same instinct: don't trust the claim, check the
behavior.

Full pitch and reasoning: see the conversation this was scoped in, or
`README.md` once it's fleshed out further.

## Status as of 2026-09-08: verified working, scope decided

Loaded unpacked in a real Chrome. `maximo000.github.io/carabiner/` reads a
real `PASS` (observed `fonts.googleapis.com`/`fonts.gstatic.com`, matched
the allow-list); an unclaimed site reads real `UNVERIFIED`. Toolbar badge
(OK/FAIL/? on the icon, via `chrome.action.setBadgeText`) and a dark-mode
popup with unexpected-domain highlighting are in.

**Scope decided:** witness stays scoped to domains I personally own and
write a claims file for. It is not going to grow into a general tracker
scanner for arbitrary sites (YouTube, LinkedIn, etc.) — that's what
uBlock/Ghostery/Privacy Badger already do with EasyPrivacy, no reason to
rebuild it, and it would dilute the actual idea (checking a site's own
stated claim against its own behavior, not flagging generic trackers).
Every site without a claims file correctly reads `UNVERIFIED` forever,
by design.

## Original scaffold notes (2026-09-08, pre-verification)

**Built and verified:**
- `diff.js` -- the pure comparison logic (claims vs. observed domains).
  Unit tested: `node --test` runs 6 tests, all passing. This is the part
  that's actually proven correct.
- `manifest.json` -- Manifest V3, permissions `webRequest`/`webNavigation`/
  `storage`/`tabs`, `<all_urls>` host permission. Validated as parseable
  JSON (`node -e "JSON.parse(...)"`), nothing more.
- `background.js` -- service worker, tracks distinct domains contacted per
  tab in `chrome.storage.session` (not a module variable -- MV3 workers are
  ephemeral and a variable would silently reset mid-page-load). Syntax
  checked (`node --check`), **never executed** -- no access to real
  `chrome.*` APIs from this environment.
- `popup.html` / `popup.js` -- reads the current tab's observed domains,
  fetches a bundled `policies/<domain>.json`, calls `diff.js`, renders
  pass/fail/unverified. Syntax checked only, **never rendered in a real
  popup.**
- `policies/maximo000.github.io.json` -- one real, safe claims file, for a
  domain I actually control (the GitHub Pages sites for portfolio,
  firedrill, carabiner, invariant). Static HTML, only Google Fonts as a
  third party, so this should read as a clean PASS once actually tested.

**NOT done -- this is genuinely just a scaffold:**
1. **Never loaded as an unpacked extension in a real Chrome/Edge/Brave.**
   This environment's browser-automation tools can't drive
   `chrome://extensions` or pass `--load-extension` at launch, so this step
   needs a human, in a real browser, on a real machine:
   ```
   chrome://extensions -> Developer mode -> Load unpacked -> select this folder
   ```
   Then visit `https://maximo000.github.io/invariant/`, open the popup, and
   confirm it says PASS with `fonts.googleapis.com` / `fonts.gstatic.com`
   (or nothing, if the fonts already cached) listed and nothing else.
2. **No icons.** `action.default_icon` is omitted in `manifest.json` on
   purpose -- Chrome shows a generic default, which is fine for a dev
   build. A real icon is a design task, not a code task; do it once the
   mechanism is proven, not before.
3. **Only one claims file, for a domain I own.** That's deliberate (see
   below) -- extending to real third-party sites is the next real decision,
   not a coding task to just do.
4. **No badge/icon-color feedback in the toolbar** -- right now you have to
   open the popup to see anything. A `chrome.action.setBadgeText` call in
   `background.js` (or a separate `content.js`) showing PASS/FAIL at a
   glance would be the natural next UI step, once the popup itself is
   confirmed working for real.
5. **No packaging / Chrome Web Store listing.** Not worth doing before the
   mechanism is proven against a real page in a real browser.

## Before naming a real company

The whole point of this tool is to flag when a real site's actual behavior
doesn't match what it publicly claims. That's legitimate and useful, but
publishing "Site X's privacy policy contradicts its own behavior" under a
real name is also a real factual/reputational claim about a real company --
get the policy-reading wrong and it's a false public accusation, not a bug.

Before adding a `policies/<real-company-domain>.json` file and publishing
findings against it:
- Quote the exact policy language the claim is based on in `source`, with a
  link, so the claim is checkable by someone else, not just asserted.
- Phrase findings as an observed discrepancy ("contacted X, which isn't in
  the declared allow-list"), never as an accusation of bad faith ("this
  site is lying"). The extension's own `diff.js` already does this --
  keep any future UI wording consistent with it.
- Consider running it past the target site's own published contact/legal
  process before a public "gotcha" post, the same way security researchers
  do responsible disclosure -- this is the same shape of claim.

None of that blocks testing the extension against sites you own (like the
`maximo000.github.io` file already here), or against your own personal
browsing for your own use, with no publication involved.

## Next session, in order

Steps 1-4 from the original plan are done (real browser load, badge,
scope decision). What's left is optional polish, not required for the
tool to be "working":

1. A real icon (`action.default_icon`) instead of Chrome's default
   puzzle-piece placeholder -- purely cosmetic, do it if it bugs you.
2. If a second site of mine ever gets its own `policies/<domain>.json`
   (e.g. another GitHub Pages project with different third parties),
   confirm the badge and popup both handle multiple claims files fine --
   the code already supports it (`policies/<domain>.json` is looked up by
   the actual page domain), just untested with more than one file.
3. No Chrome Web Store listing planned -- this is a personal-use tool, not
   a published extension.
