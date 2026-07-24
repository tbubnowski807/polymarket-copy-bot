// Redacting logger. Any token/secret-looking string is masked in output.
// Use this everywhere instead of console.* so secrets never leak to logs.

const SECRET_PATTERNS: RegExp[] = [
  // Telegram bot token: 1234567890:AA...
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  // Long hex (possible key material) 40+ hex chars
  /\b(0x)?[0-9a-fA-F]{40,}\b/g,
  // Generic long secret-ish base64/url tokens
  /\b[A-Za-z0-9_-]{32,}\b/g,
];

const SENSITIVE_KEYS = [
  "token",
  "secret",
  "key",
  "privatekey",
  "private_key",
  "mnemonic",
  "seed",
  "password",
  "authorization",
  "apikey",
  "api_key",
];

export function redact(input: unknown): string {
  let s = typeof input === "string" ? input : safeStringify(input);
  for (const re of SECRET_PATTERNS) {
    s = s.replace(re, (m) => mask(m));
  }
  return s;
}

function mask(v: string): string {
  if (v.length <= 8) return "•".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-2)}[REDACTED]`;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (key, value) => {
      if (
        typeof key === "string" &&
        SENSITIVE_KEYS.includes(key.toLowerCase()) &&
        typeof value === "string" &&
        value.length > 0
      ) {
        return mask(value);
      }
      return value;
    });
  } catch {
    return String(v);
  }
}

function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info: (msg: string, meta?: unknown) =>
    console.log(`[${ts()}] INFO  ${redact(msg)}${metaStr(meta)}`),
  warn: (msg: string, meta?: unknown) =>
    console.warn(`[${ts()}] WARN  ${redact(msg)}${metaStr(meta)}`),
  error: (msg: string, meta?: unknown) =>
    console.error(`[${ts()}] ERROR ${redact(msg)}${metaStr(meta)}`),
  demo: (msg: string) =>
    console.log(`[${ts()}] DEMO  [DEMO DATA] ${redact(msg)}`),
};

function metaStr(meta?: unknown): string {
  if (meta === undefined) return "";
  return " " + redact(meta);
}
