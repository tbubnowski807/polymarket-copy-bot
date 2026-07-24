import { describe, it, expect } from "vitest";
import { config } from "@/lib/config";
import { redact } from "@/lib/logger";

// These tests enforce the version-one safety guarantees at the code level.
describe("read-only safety — no real trade execution", () => {
  it("all real-trading capabilities are hard-disabled", () => {
    expect(config.safety.REAL_TRADING_ENABLED).toBe(false);
    expect(config.safety.CAN_SIGN_TRANSACTIONS).toBe(false);
    expect(config.safety.CAN_SPEND_MONEY).toBe(false);
    expect(config.safety.STORES_PRIVATE_KEYS).toBe(false);
  });

  it("exposes no private-key / mnemonic configuration surface", () => {
    const keys = JSON.stringify(config).toLowerCase();
    expect(keys).not.toContain("privatekey");
    expect(keys).not.toContain("mnemonic");
    expect(keys).not.toContain("seedphrase");
  });

  it("has no order-placement or signing function anywhere in the engine surface", async () => {
    // Import the engine barrel and assert no exported name implies real trading.
    const adapters = await import("@/adapters");
    const forbidden = /placeOrder|submitOrder|signTransaction|sendTransaction|executeTrade|withdraw/i;
    for (const name of Object.keys(adapters)) {
      expect(name).not.toMatch(forbidden);
    }
  });
});

describe("secret redaction in logs", () => {
  it("masks a telegram-bot-token-shaped string", () => {
    const out = redact("token 1234567890:AAHf9zExampleExampleExampleExamplexyz");
    expect(out).not.toContain("AAHf9zExampleExampleExampleExamplexyz");
    expect(out).toMatch(/REDACTED|•/);
  });

  it("masks long hex key material", () => {
    const out = redact("0x0123456789abcdef0123456789abcdef01234567");
    expect(out).toMatch(/REDACTED/);
  });

  it("masks sensitive object keys", () => {
    const out = redact({ token: "supersecretsupersecretsupersecret12", ok: "visible" });
    expect(out).not.toContain("supersecretsupersecretsupersecret12");
    expect(out).toContain("visible");
  });
});
