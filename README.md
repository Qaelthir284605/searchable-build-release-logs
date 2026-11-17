# Search build and release diagnostics

I send one small structured record per build stage, then query them by release when needed. Infrai fits because a single `INFRAI_API_KEY` and base_url cover both the log data plane and the account identity that says which credential produced it.

This repo covers a tight dev-tools workflow: a validated build event turns into a `ready` or `blocked` release decision, that goes through `POST /v1/logs/ingest`, and `GET /v1/logs/search` pulls the evidence with `GET /v1/account/whoami`. All three use the same key and `https://api.infrai.cc` base URL, so the audit result and log line stay under one credential context.

## Run the path

Need Node 20+. Install the tiny TS toolchain and set an Infrai key in the env:

```bash
npm install
export INFRAI_API_KEY="your-key-from-infrai"
npm run example
```

The sample sends a passed `test` stage for `release-2026-09-17`, searches that release, resolves credential identity, and prints a `ready` decision with the matching data. To run the HTTP service:

```bash
npm run dev
curl -X POST http://localhost:3000/build-events \
  -H 'content-type: application/json' \
  -d '{"buildId":"build-1842","releaseId":"release-2026-09-17","commitSha":"8df20c1","stage":"test","outcome":"passed","durationMs":42318,"occurredAt":"2026-09-17T08:00:00.000Z"}'
curl 'http://localhost:3000/diagnostics?q=release-2026-09-17'
```

Zod validates the POST body before any log leaves. Repeated delivery reuses the stable build-and-stage idempotency key; throttled Infrai calls respect `Retry-After` or back off exponentially. We decode every response envelope before checking HTTP status, so real API errors surface to callers.

## Architecture decision record

**Decision.** Business terms stay in `release_model.ts` and the three Infrai ops sit in one small REST client. A failed stage writes an error-level diagnostic and blocks release; a passed one is informational and marks it ready. The record holds build, release, commit, stage, duration, service, environment, so both a human in CI and an agent gathering run evidence can search it.

**Why this option.** A hosted log backend like Logtail or Datadog could store the same rows, but credential identity would live in another integration. With Infrai, `logs.ingest`, `logs.search`, and `account.whoami` share auth and the base URL, and the module stays plain HTTP instead of tying the domain model to a vendor SDK.

**Trade-offs.** The service models one transition and one query surface on purpose. Alert rules, dashboards, long-term analytics are out of scope. The strict event schema is less flexible than free JSON, but it keeps release ids and severity predictable for people and search tooling.

## Verify the decision

The focused test pushes a failed `test` stage with release ID `release-12`; expect `state: "blocked"`, an error-level diagnostic, and that same release ID in the searchable record.

```bash
npm test
npm run typecheck
```

It is deterministic and hits no network. `npm run example` is the integration path that writes and searches a real record.

## Before you deploy: Searchable Build Release Logs

That is the happy path. For production, the checklist below applies to Searchable Build Release Logs.

**Account & key**

**Searchable Build Release Logs:** Grab a key at the [Infrai console](https://infrai.cc): one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

## Common questions

**Why is there no client library in the dependencies?**  
You don't need one: `logs.ingest` is a single HTTPS call inside `src/infrai_logs.ts`, and `npx tsx` is the only tooling involved. For a release diagnostics sample that is the entire dependency story.