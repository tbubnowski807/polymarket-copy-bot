// Optional Telegram alerts. If no token/chat configured, this is a no-op that
// logs to stdout instead. Tokens are NEVER logged (redacting logger + we never
// print the token). Keep alerts minimal — reserved for important events.
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

export type AlertLevel = "report" | "high_confidence" | "rule_change" | "wallet_change" | "drawdown";

export async function sendTelegram(text: string, level: AlertLevel = "report"): Promise<{ sent: boolean; reason?: string }> {
  if (!config.telegram.enabled) {
    log.info(`[telegram disabled] (${level}) would send: ${text.slice(0, 400)}`);
    return { sent: false, reason: "telegram_not_configured" };
  }
  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Show real error but redact anything secret-looking.
      log.error(`Telegram send failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    log.info(`Telegram alert sent (${level}).`);
    return { sent: true };
  } catch (e) {
    log.error(`Telegram send error: ${(e as Error).message}`);
    return { sent: false, reason: "exception" };
  }
}
