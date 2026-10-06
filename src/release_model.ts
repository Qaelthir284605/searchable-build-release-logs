import { z } from "zod";
import type { LogEntry } from "./infrai_logs.js";

export const buildEventSchema = z.object({
  buildId: z.string().min(1),
  releaseId: z.string().min(1),
  commitSha: z.string().min(7),
  stage: z.enum(["compile", "test", "package", "deploy"]),
  outcome: z.enum(["passed", "failed"]),
  durationMs: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
});

export type BuildEvent = z.infer<typeof buildEventSchema>;

export type ReleaseDecision = {
  releaseId: string;
  state: "ready" | "blocked";
  diagnostic: LogEntry;
};

export function decideRelease(event: BuildEvent): ReleaseDecision {
  const passed = event.outcome === "passed";
  return {
    releaseId: event.releaseId,
    state: passed ? "ready" : "blocked",
    diagnostic: {
      timestamp: event.occurredAt,
      level: passed ? "info" : "error",
      message: passed
        ? `Build stage ${event.stage} passed; release ${event.releaseId} is ready`
        : `Build stage ${event.stage} failed; release ${event.releaseId} is blocked`,
      service: "developer-tools",
      environment: "ci",
      trace_id: event.buildId,
      metadata: {
        build_id: event.buildId,
        release_id: event.releaseId,
        commit_sha: event.commitSha,
        stage: event.stage,
        duration_ms: event.durationMs,
        release_state: passed ? "ready" : "blocked",
      },
    },
  };
}
