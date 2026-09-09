# Claims file format

One file per domain: `policies/<domain>.json`. `<domain>` is the hostname
exactly as the browser reports it (no scheme, no path, no leading `www.` --
`diff.js` normalizes that on the observed side, so write the file for the
bare domain).

```json
{
  "domain": "example.com",
  "claims": {
    "no_third_party_trackers": true,
    "no_third_party_cookies": true
  },
  "allowed_third_party_domains": ["fonts.gstatic.com"],
  "headers": {
    "content-security-policy": { "present": true }
  },
  "source": "how you know this claim is real -- a quoted line from the privacy policy, or (for a site you own) a statement of fact",
  "checked_at": "2026-09-08"
}
```

- `allowed_third_party_domains` is the actual gate: anything contacted that
  isn't in this list is `fail`, regardless of what `claims` says.
- `claims.no_third_party_trackers` only changes the wording of a failure
  (quotes the site's own claim back at it) -- the allow-list is what decides
  pass/fail either way.
- `claims.no_third_party_cookies` is a separate, stricter gate: a domain can
  be on the allow-list (it's a legitimate font host or CDN) and still fail
  this if it sets a cookie the allow-list doesn't say anything about
  cookies at all.
- `headers` checks the page's *own* top-level response, not third parties --
  for a claim like "we set a strict CSP." Two rule shapes per header name:
  `{"present": true}` (must be sent at all) or `{"contains": "substring"}`
  (a loose match, since an exact-string check would break on harmless
  directive reordering that isn't the claim being verified).
- No file for a domain -- `unverified`, never a silent pass.
- All three checks (traffic, cookies, headers) fail closed independently:
  the first one that finds a discrepancy is what the popup reports.

## Filling one in for a real, named third party

This is the part that needs a person, not automation: reading an actual
privacy policy and writing down what it actually promises is a judgment
call, and getting it wrong before publishing a "this site contradicts
itself" finding about a real company is a real reputational and factual
risk, not a bug. Before adding a `policies/<real-company-domain>.json` for
anywhere you don't personally control:

- Quote the exact policy language the claim is based on in `source`, with
  a link, so the claim is checkable by someone else, not just asserted.
- Phrase findings as an observed discrepancy ("contacted X, which isn't in
  the declared allow-list"), never as an accusation of bad faith ("this
  site is lying"). Keep any future UI wording consistent with `diff.js`,
  which already does this.
