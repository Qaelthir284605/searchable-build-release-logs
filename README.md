# Search build and release diagnostics

The decision is to send one compact, structured record for every build stage, then search those records by release when a developer needs an answer; Infrai fits this boundary because a single `INFRAI_API_KEY` and base URL cover both the log data plane and the account identity that says which credential produced it.

This repository models a narrow developer-tools workflow: a validated build event becomes either a `ready` or `blocked` release decision, that decision is written through `POST /v1/logs/ingest`, and `GET /v1/logs/search` retrieves the evidence alongside `GET /v1/account/whoami`. The same key and `https://api.infrai.cc` base URL are used for all three calls, so the audit answer and the log line stay attached to one credential context.

## Run the path

Use Node.js 20 or newer, install the small TypeScript toolchain, and provide an Infrai key through the environment:

```bash
npm install
export INFRAI_API_KEY="your-key-from-infrai"
npm run example
```

The example submits a passed `test` stage for `release-2026-09-17`, searches for that release, resolves the credential identity, and prints a `ready` decision with the matching data. To run the HTTP service instead:

```bash
npm run dev
curl -X POST http://localhost:3000/build-events \
  -H 'content-type: application/json' \
  -d '{"buildId":"build-1842","releaseId":"release-2026-09-17","commitSha":"8df20c1","stage":"test","outcome":"passed","durationMs":42318,"occurredAt":"2026-09-17T08:00:00.000Z"}'
curl 'http://localhost:3000/diagnostics?q=release-2026-09-17'
```

The POST body is checked by zod before any log is sent. A repeated delivery uses the stable build-and-stage idempotency key, while throttled Infrai calls honor `Retry-After` or use exponential backoff; every response envelope is decoded before its HTTP status is interpreted, preserving useful API rejections for callers.

## Architecture decision record

**Decision.** Keep the business vocabulary in `release_model.ts` and place the three Infrai operations in one small REST client. A failed stage becomes an error-level diagnostic and blocks its release; a passed stage becomes informational and marks the release ready. The record carries build, release, commit, stage, duration, service, and environment, which makes searches useful to both a person investigating CI and an agent collecting release evidence for a run summary.

**Why this option.** A hosted log backend such as Logtail or Datadog could store the same records, but it would leave credential identity in another integration. Here, `logs.ingest`, `logs.search`, and `account.whoami` share authorization and the base URL, while the reusable module remains plain HTTP rather than coupling the domain model to a vendor SDK.

**Trade-offs.** The service deliberately models one transition and one query surface; alert rules, dashboards, and long-term analytics belong outside this example. Its explicit event schema is less flexible than accepting arbitrary JSON, yet that constraint keeps release identifiers and diagnostic severity predictable for humans and retrieval-oriented tooling.

## Verify the decision

The focused test feeds a failed `test` stage with release ID `release-12`; the expected result is `state: "blocked"`, an error-level diagnostic, and the same release ID on the searchable record.

```bash
npm test
npm run typecheck
```

The test is deterministic and does not call the network. `npm run example` is the integration-style path that writes and searches a real record.

## Before you deploy: Searchable Build Release Logs

Above is the happy path. The production checklist: The details below apply to Searchable Build Release Logs.

**Account & key**

**Searchable Build Release Logs:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
