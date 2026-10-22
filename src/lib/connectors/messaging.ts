// Messages the agent can send to the user's own chat channels, each only after the user approves it:
//   slack      SLACK_WEBHOOK_URL        an incoming webhook (Slack app > Incoming Webhooks), posts to one channel
//   discord    DISCORD_WEBHOOK_URL      a channel webhook (Channel settings > Integrations > Webhooks)
//   telegram   TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID   a bot from @BotFather, and the chat it should write to
// A webhook posts to the one place it was made for, so the agent can't message anyone else.

export const CHANNELS = ["slack", "discord", "telegram"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_NAMES: Record<Channel, string> = { slack: "Slack", discord: "Discord", telegram: "Telegram" };

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

export function channelConfigured(c: Channel, env: Env = process.env): boolean {
  if (c === "slack") return !!env.SLACK_WEBHOOK_URL?.trim();
  if (c === "discord") return !!env.DISCORD_WEBHOOK_URL?.trim();
  return !!env.TELEGRAM_BOT_TOKEN?.trim() && !!env.TELEGRAM_CHAT_ID?.trim();
}

export const configuredChannels = (env: Env = process.env) => CHANNELS.filter((c) => channelConfigured(c, env));

const MAX = { slack: 3000, discord: 2000, telegram: 4096 } satisfies Record<Channel, number>;

export async function sendToChannel(c: Channel, text: string, http: Fetch = fetch, env: Env = process.env): Promise<string> {
  if (!channelConfigured(c, env)) throw new Error(`${CHANNEL_NAMES[c]} isn't set up on this server.`);
  const body = text.slice(0, MAX[c]);
  let res: Response;
  if (c === "slack") res = await http(env.SLACK_WEBHOOK_URL!.trim(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
  else if (c === "discord")
    res = await http(env.DISCORD_WEBHOOK_URL!.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No @everyone or role pings from the agent.
      body: JSON.stringify({ content: body, allowed_mentions: { parse: [] } }),
    });
  else
    res = await http(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID!.trim(), text: body, disable_web_page_preview: true }),
    });
  if (!res.ok) throw new Error(`${CHANNEL_NAMES[c]} answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return `Posted to ${CHANNEL_NAMES[c]}.`;
}
