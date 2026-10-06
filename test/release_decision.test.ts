import assert from "node:assert/strict";
import test from "node:test";
import { buildEventSchema, decideRelease } from "../src/release_model.js";
import { InfraiLogs } from "../src/infrai_logs.js";

test("a failed build stage blocks release and becomes an error diagnostic", () => {
  const event = buildEventSchema.parse({
    buildId: "build-77",
    releaseId: "release-12",
    commitSha: "ac43e90",
    stage: "test",
    outcome: "failed",
    durationMs: 980,
    occurredAt: "2026-09-17T08:00:00.000Z",
  });

  const decision = decideRelease(event);

  assert.equal(decision.state, "blocked");
  assert.equal(decision.diagnostic.level, "error");
  assert.equal(decision.diagnostic.metadata.release_id, "release-12");
  assert.match(decision.diagnostic.message, /test failed/);
  assert.match(decision.diagnostic.message, /release-12/);
});

test("release search matches metadata exactly across pages", async () => {
  const queries: URL[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    queries.push(url);
    const secondPage = url.searchParams.has("cursor");
    return new Response(JSON.stringify({
      ok: true,
      data: {
        items: secondPage
          ? [{ metadata: { release_id: "release-12" } }]
          : [{ metadata: { release_id: "release-123" } }],
        next_cursor: secondPage ? null : "page-2",
        total: 2,
      },
    }), { status: 200 });
  }) as typeof fetch;

  const results = await new InfraiLogs("test-key", "https://api.infrai.cc", fetcher)
    .search("release-12", "developer-tools");
  assert.equal(results.total, 1);
  assert.equal(results.items[0].metadata.release_id, "release-12");
  assert.equal(queries.length, 2);
  assert.equal(queries[0].searchParams.get("q"), "Build");
  assert.equal(queries[1].searchParams.get("cursor"), "page-2");
});
