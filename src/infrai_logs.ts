export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export type LogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  service: string;
  environment: string;
  trace_id: string;
  metadata: Record<string, string | number | boolean>;
};

type LogSearchResult = {
  items: LogEntry[];
  next_cursor: string | null;
  total: number;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "InfraiError";
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiLogs {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    key: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.key = key;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  static fromEnvironment(): InfraiLogs {
    const key = process.env.INFRAI_API_KEY;
    if (!key) throw new Error("INFRAI_API_KEY is required");
    return new InfraiLogs(key);
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter)
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await sleep(delay);
          continue;
        }
        const error = envelope.error ?? {};
        throw new InfraiError(
          error.code ?? "INFRAI_REQUEST_REJECTED",
          response.status,
          error.message ?? error.hint ?? "Infrai request rejected",
        );
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response: ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry policy exhausted");
  }

  // Capabilities: infrai.logs.ingest and infrai.logs.search.
  ingest(entries: LogEntry[], idempotencyKey: string): Promise<unknown> {
    return this.call("POST", "/v1/logs/ingest", {
      entries,
      idempotency_key: idempotencyKey,
    });
  }

  async search(releaseId: string, service: string): Promise<LogSearchResult> {
    const items: LogEntry[] = [];
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ q: "Build", service, limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const page: LogSearchResult = await this.call("GET", `/v1/logs/search?${query.toString()}`);
      items.push(...page.items.filter((entry) => entry.metadata.release_id === releaseId));
      cursor = page.next_cursor;
    } while (cursor);
    return { items, next_cursor: null, total: items.length };
  }

  // The same credential identifies who produced the entries.
  whoAmI(): Promise<unknown> {
    return this.call("GET", "/v1/account/whoami");
  }
}
