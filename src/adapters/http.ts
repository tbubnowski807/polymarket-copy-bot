import { log } from "@/lib/logger";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public url?: string,
    public body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Detect no-network / DNS errors so "auto" mode can fall back to demo data.
export function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; name?: string };
  const code = e?.code ?? e?.cause?.code ?? "";
  return (
    ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
      code,
    ) || e?.name === "AbortError"
  );
}

export async function getJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      const text = await res.text();
      if (res.status === 429 || res.status === 503) {
        // Rate limited / temporarily unavailable — back off and retry.
        if (attempt < retries) {
          const wait = 800 * Math.pow(2, attempt) + Math.random() * 400;
          await sleep(wait);
          continue;
        }
        throw new ApiError(
          `HTTP ${res.status} from ${url} after ${retries} retries: ${text.slice(0, 200)}`,
          res.status, url, text.slice(0, 1000),
        );
      }
      if (!res.ok) {
        // Show the REAL error. Callers decide whether to stop or fall back.
        throw new ApiError(
          `HTTP ${res.status} from ${url}: ${text.slice(0, 300)}`,
          res.status, url, text.slice(0, 1000),
        );
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiError(
          `Invalid JSON from ${url}: ${text.slice(0, 200)}`,
          res.status, url,
        );
      }
    } catch (err) {
      lastErr = err;
      // Retry transient network errors too.
      if (attempt < retries && isNetworkError(err)) {
        await sleep(800 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Try live fetch; in "auto" mode, on a NETWORK error only, fall back to demo.
// On an API error (4xx/5xx) we always surface the real error and stop, unless
// mode is "demo".
export async function withMode<T>(
  mode: "live" | "demo" | "auto",
  liveFn: () => Promise<T>,
  demoFn: () => T,
  label: string,
): Promise<{ data: T; demo: boolean }> {
  if (mode === "demo") {
    return { data: demoFn(), demo: true };
  }
  try {
    const data = await liveFn();
    return { data, demo: false };
  } catch (err) {
    if (mode === "auto" && isNetworkError(err)) {
      log.warn(
        `${label}: network unavailable, falling back to clearly-labeled DEMO data`,
        (err as Error).message,
      );
      return { data: demoFn(), demo: true };
    }
    // live mode, or a real API error: surface it and STOP. Never fake data.
    throw err;
  }
}
