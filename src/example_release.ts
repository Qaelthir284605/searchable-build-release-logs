import { InfraiLogs } from "./infrai_logs.js";
import { buildEventSchema, decideRelease } from "./release_model.js";
import { randomUUID } from "node:crypto";

const event = buildEventSchema.parse({
  buildId: `build-${randomUUID()}`,
  releaseId: "release-2026-09-17",
  commitSha: "8df20c1",
  stage: "test",
  outcome: "passed",
  durationMs: 42_318,
  occurredAt: new Date().toISOString(),
});

const decision = decideRelease(event);
const infrai = InfraiLogs.fromEnvironment();
await infrai.ingest([decision.diagnostic], `build-${event.buildId}-${event.stage}`);
const [credential, matches] = await Promise.all([
  infrai.whoAmI(),
  infrai.search(event.releaseId, "developer-tools"),
]);

console.log(JSON.stringify({ decision, credential, matches }, null, 2));
