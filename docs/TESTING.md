# Testing & CI

Stack: **Vitest** (unit / parsing / integration) + **Playwright** (E2E, desktop + mobile).
There is no production code in the test paths; tests live beside the layer they cover.

## Run locally

```bash
# Server: unit + parsing(fixtures) + failure + consistency + integration + security
cd server && npm test

# Client: pure lib unit tests (dates, fuel, discounts, filters, format)
cd client && npm test

# E2E (builds the client, serves it, mocks the API):
npm run build:client && npm run e2e         # from repo root
npm run e2e:install                          # one-time: download browsers

# Live parser health (hits real provider sites — used by the nightly job):
cd server && npm run health:parsers
```

## Layout

```
server/test/{unit,parsing,failure,integration,consistency,security}/   # Vitest (node)
server/test/fixtures/<provider>/{latest.html,expected.json}            # real frozen HTML
server/scripts/{refresh-fixtures,parser-health}.js
client/test/unit/                                                      # Vitest (jsdom)
client/src/lib/                                                        # extracted pure helpers
e2e/                                                                   # Playwright specs + API mocks
```

## Parser fixtures

`server/test/fixtures/<provider>/latest.html` is a frozen real page; `expected.json` is the
parser's known-good output. The parsing test locks `parseX(html) === expected.json`. When a
provider legitimately changes layout (the nightly health check will flag it), refresh both files
and review the diff in the PR:

```bash
cd server && npm run fixtures:refresh           # all providers
cd server && npm run fixtures:refresh circlek   # one provider
```

## CI (GitHub Actions)

- **pr.yml** — lint, server tests, client tests, build, security (npm audit high+ & gitleaks). Required to merge.
- **main.yml** — same + E2E (desktop + mobile), then a Vercel production deploy gated on the
  `production` GitHub Environment (add a required reviewer) and a post-deploy smoke check.
- **nightly.yml** — live parser health check (opens an issue on failure) + dependency audit.
- **dependabot.yml** — weekly npm + github-actions updates.

### Solo-dev setup (current)
This is a single-maintainer repo, so the value is in **never deploying broken code**, not in
PR ceremony. What matters:

1. **Deploy only through the gated workflow.** `main.yml` runs lint + server + client + E2E and the
   `deploy` job `needs:` them, so a red build never reaches production. **Disable Vercel's git
   auto-deploy for production** (Vercel → Project → Git) so this workflow is the *only* path to prod —
   otherwise Vercel ships the push before Actions can gate it, and the gate is cosmetic.
2. **Tested on every push.** `main.yml` runs on push to `main`, so direct commits are still tested
   (no PR required). Open a PR only when you want a preview deploy or a paper trail — `pr.yml` will run.
3. **One cheap guardrail:** in repo settings, protect `main` against force-push and deletion. Zero
   friction; saves you from a bad `git push --force`.

Skip (team-only ceremony): required PRs, required reviewers, "up to date before merge", manual
approval environments. The `production` environment in `main.yml` is harmless without a reviewer; add
one later if a collaborator joins.

### Required deploy secrets
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (and keep `CRON_SECRET` set in Vercel).
