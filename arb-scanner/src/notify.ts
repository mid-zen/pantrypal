/**
 * Pluggable alert notifiers. Each notifier takes a batch of arbitrage
 * opportunities and pushes a message somewhere. Channels are enabled purely by
 * presence of their env vars, so adding/removing one needs no code change.
 *
 *   Discord:  set DISCORD_WEBHOOK_URL
 *   Telegram: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 */
import type { ArbOpportunity } from "./arbitrage.js";
import { formatAmerican } from "./odds.js";

export interface Notifier {
  name: string;
  send(opps: ArbOpportunity[]): Promise<void>;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** One opportunity rendered as a compact, channel-agnostic plain-text block. */
export function summarizeOpp(opp: ArbOpportunity): string {
  const lines: string[] = [];
  lines.push(`🎯 ${opp.marginPct.toFixed(2)}% arb · ${opp.sportTitle} · ${opp.matchup}`);
  lines.push(`Market: ${opp.marketLabel}`);
  for (const leg of opp.legs) {
    const pt = leg.point !== undefined ? ` ${leg.point}` : "";
    lines.push(
      `  • Bet ${money(leg.roundedStake)} on ${leg.outcomeName}${pt} ` +
        `@ ${leg.bookmaker} (${leg.decimal.toFixed(2)} / ${formatAmerican(leg.decimal)})`,
    );
  }
  lines.push(
    `Guaranteed profit: ${money(opp.worstCaseProfit)} on ${money(opp.totalStake)} staked`,
  );
  lines.push(`Starts: ${new Date(opp.commenceTime).toLocaleString()}`);
  for (const w of opp.warnings) lines.push(`⚠ ${w}`);
  return lines.join("\n");
}

/** Full alert text for a batch of opportunities. */
export function buildAlertText(opps: ArbOpportunity[]): string {
  const header = `🔔 Arb scanner: ${opps.length} new opportunit${opps.length === 1 ? "y" : "ies"}`;
  return [header, ...opps.map(summarizeOpp)].join("\n\n");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/** Prints alerts to the console. Always-available fallback / --dry-run target. */
class ConsoleNotifier implements Notifier {
  name = "console";
  async send(opps: ArbOpportunity[]): Promise<void> {
    process.stdout.write("\n" + buildAlertText(opps) + "\n");
  }
}

class DiscordNotifier implements Notifier {
  name = "discord";
  constructor(private webhookUrl: string) {}
  async send(opps: ArbOpportunity[]): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Discord caps message content at 2000 chars.
      body: JSON.stringify({ content: truncate(buildAlertText(opps), 1990) }),
    });
    if (!res.ok) {
      throw new Error(`Discord webhook ${res.status}: ${await res.text().catch(() => "")}`);
    }
  }
}

class TelegramNotifier implements Notifier {
  name = "telegram";
  constructor(private botToken: string, private chatId: string) {}
  async send(opps: ArbOpportunity[]): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Telegram caps a message at 4096 chars. Plain text avoids parse-mode escaping.
      body: JSON.stringify({
        chat_id: this.chatId,
        text: truncate(buildAlertText(opps), 4000),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Telegram API ${res.status}: ${await res.text().catch(() => "")}`);
    }
  }
}

/**
 * Build the active notifier list from environment variables. If no real channel
 * is configured (or dryRun is set), falls back to the console notifier so alerts
 * are never silently dropped.
 */
export function buildNotifiers(opts: { dryRun: boolean } = { dryRun: false }): Notifier[] {
  const notifiers: Notifier[] = [];

  const discord = process.env.DISCORD_WEBHOOK_URL;
  if (discord) notifiers.push(new DiscordNotifier(discord));

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) notifiers.push(new TelegramNotifier(tgToken, tgChat));

  if (opts.dryRun || notifiers.length === 0) {
    notifiers.push(new ConsoleNotifier());
  }
  return notifiers;
}
