import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { InfraiError, InfraiLogs } from "./infrai_logs.js";
import { buildEventSchema, decideRelease } from "./release_model.js";

const logs = InfraiLogs.fromEnvironment();

function reply(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "POST" && url.pathname === "/build-events") {
      const parsed = buildEventSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        reply(response, 400, { error: "Invalid build event", issues: parsed.error.issues });
        return;
      }
      const decision = decideRelease(parsed.data);
      await logs.ingest(
        [decision.diagnostic],
        `build-${parsed.data.buildId}-${parsed.data.stage}`,
      );
      reply(response, 202, decision);
      return;
    }

    if (request.method === "GET" && url.pathname === "/diagnostics") {
      const q = url.searchParams.get("q") ?? "release";
      const [identity, results] = await Promise.all([
        logs.whoAmI(),
        logs.search(q, "developer-tools"),
      ]);
      reply(response, 200, { query: q, credential: identity, results });
      return;
    }

    reply(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      reply(response, error.status, { error: error.code, message: error.message });
      return;
    }
    const requestId = randomUUID();
    console.error({ requestId, error });
    reply(response, 500, { error: "Request could not be completed", requestId });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Release observer listening on http://localhost:${port}`));
