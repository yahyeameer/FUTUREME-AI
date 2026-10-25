import type { Db } from "../db";
import type { AgentMail } from "../mail";
import { getTwinSetting } from "../twin";
import { googleApi, googleConnection } from "./google";

// The agent's email: reading, searching and sending mail from the user's own mailbox. Three ways to reach one:
//   gmail      the user's Google account (google.ts): Gmail API, reads and sends as them.
//   imap       any mailbox with IMAP and SMTP (Outlook, Fastmail, iCloud, Gmail with an app password):
//                EMAIL_IMAP_HOST, EMAIL_SMTP_HOST, EMAIL_USER, EMAIL_PASSWORD
//                (optional EMAIL_IMAP_PORT=993, EMAIL_SMTP_PORT=465, EMAIL_IMAP_SECURE, EMAIL_SMTP_SECURE, EMAIL_ADDRESS,
//                EMAIL_FROM_NAME)
//   agentmail  the twin's own AgentMail inbox (mail.ts), when nothing else is set up: mail goes from the twin's
//              address, not the user's.
// EMAIL_PROVIDER picks one when several are set up. Reading runs straight away; sending always waits for the user's
// approval (tools.ts), and mail from outside is handed to the agent as quoted data, never as instructions.

export type MailProviderName = "gmail" | "imap" | "agentmail";

export interface MailSummary {
  id: string;
  from: string;
  to?: string;
  subject: string;
  date: string | null;
  snippet: string;
  unread?: boolean;
  threadId?: string;
}

export interface MailMessage extends MailSummary {
  body: string;
  /** The RFC 5322 Message-ID, used to thread a reply. */
  messageId?: string;
  references?: string;
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  /** The message being answered, so the reply lands in the same thread. */
  replyTo?: MailMessage;
}

export interface MailQuery {
  query?: string;
  unreadOnly?: boolean;
  limit: number;
}

export interface MailProvider {
  name: MailProviderName;
  label: string;
  search(q: MailQuery): Promise<MailSummary[]>;
  read(id: string): Promise<MailMessage>;
  send(m: OutgoingMail): Promise<{ id: string }>;
}

type Fetch = typeof fetch;
type Env = Record<string, string | undefined>;

const MAX_BODY = 12_000;

export function imapConfig(env: Env = process.env) {
  const host = env.EMAIL_IMAP_HOST?.trim();
  const user = env.EMAIL_USER?.trim();
  const pass = env.EMAIL_PASSWORD;
  if (!host || !user || !pass) return null;
  const imapPort = Number(env.EMAIL_IMAP_PORT ?? 993);
  const smtpPort = Number(env.EMAIL_SMTP_PORT ?? 465);
  // TLS from the start on 993 and 465; plain then STARTTLS otherwise, unless EMAIL_IMAP_SECURE / EMAIL_SMTP_SECURE say.
  const flag = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : /^(1|true|on|yes)$/i.test(v.trim()));
  return {
    imap: { host, port: imapPort, secure: flag(env.EMAIL_IMAP_SECURE, imapPort !== 143) },
    smtp: { host: env.EMAIL_SMTP_HOST?.trim() || host.replace(/^imap\./, "smtp."), port: smtpPort, secure: flag(env.EMAIL_SMTP_SECURE, smtpPort === 465) },
    user,
    pass,
    address: env.EMAIL_ADDRESS?.trim() || user,
    fromName: env.EMAIL_FROM_NAME?.trim() || undefined,
  };
}

/** Which mailbox the agent uses, or null when none is set up. */
export function mailProviderName(db: Db, env: Env = process.env): MailProviderName | null {
  const available: Record<MailProviderName, boolean> = {
    gmail: googleConnection(db).connected,
    imap: !!imapConfig(env),
    agentmail: !!env.AGENTMAIL_API_KEY,
  };
  const wanted = env.EMAIL_PROVIDER?.trim().toLowerCase() as MailProviderName | undefined;
  if (wanted && wanted in available) return available[wanted] ? wanted : null;
  return (["gmail", "imap", "agentmail"] as const).find((p) => available[p]) ?? null;
}

export function mailProvider(db: Db, opts: { http?: Fetch; env?: Env; imap?: ImapDeps } = {}): MailProvider | null {
  const name = mailProviderName(db, opts.env);
  if (name === "gmail") return gmailProvider(db, opts.http);
  if (name === "imap") return imapProvider(imapConfig(opts.env)!, opts.imap);
  if (name === "agentmail") return agentMailProvider(db);
  return null;
}

// ---------- Gmail ----------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

const header = (p: GmailPart | undefined, name: string) => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const b64 = (data?: string) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");

function gmailBody(p: GmailPart | undefined): string {
  if (!p) return "";
  const all: GmailPart[] = [];
  const walk = (x: GmailPart) => (all.push(x), x.parts?.forEach(walk));
  walk(p);
  const plain = all.find((x) => x.mimeType === "text/plain" && x.body?.data);
  if (plain) return b64(plain.body!.data);
  const html = all.find((x) => x.mimeType === "text/html" && x.body?.data);
  return html ? htmlToText(b64(html.body!.data)) : "";
}

const gmailSummary = (m: GmailMessage): MailSummary => ({
  id: m.id,
  threadId: m.threadId,
  from: header(m.payload, "From"),
  to: header(m.payload, "To") || undefined,
  subject: header(m.payload, "Subject") || "(no subject)",
  date: header(m.payload, "Date") || null,
  snippet: decodeEntities(m.snippet ?? ""),
  unread: m.labelIds?.includes("UNREAD"),
});

export function gmailProvider(db: Db, http?: Fetch): MailProvider {
  const api = <T>(url: string, init?: { method?: string; body?: unknown }) => googleApi<T>(db, url, init, http);
  return {
    name: "gmail",
    label: googleConnection(db).email ? `Gmail (${googleConnection(db).email})` : "Gmail",
    async search({ query, unreadOnly, limit }) {
      const q = [query?.trim() || "in:inbox", unreadOnly ? "is:unread" : ""].filter(Boolean).join(" ");
      const list = await api<{ messages?: { id: string }[] }>(`${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(limit) })}`);
      const meta = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";
      const msgs = await Promise.all((list.messages ?? []).map((m) => api<GmailMessage>(`${GMAIL}/messages/${encodeURIComponent(m.id)}?${meta}`)));
      return msgs.map(gmailSummary);
    },
    async read(id) {
      const m = await api<GmailMessage>(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`);
      return { ...gmailSummary(m), body: gmailBody(m.payload).slice(0, MAX_BODY), messageId: header(m.payload, "Message-ID") || undefined, references: header(m.payload, "References") || undefined };
    },
    async send(m) {
      const raw = await composeRaw({ ...m, from: googleConnection(db).email ?? undefined });
      const sent = await api<{ id: string }>(`${GMAIL}/messages/send`, { body: { raw: raw.toString("base64url"), threadId: m.replyTo?.threadId } });
      return { id: sent.id };
    },
  };
}

/** Builds the MIME message (for Gmail's raw send) with nodemailer's composer, so headers and UTF-8 are encoded properly. */
export async function composeRaw(m: OutgoingMail & { from?: string }): Promise<Buffer> {
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  return new MailComposer({ from: m.from, to: m.to, cc: m.cc, subject: m.subject, text: m.body, ...threading(m.replyTo) }).compile().build();
}

const threading = (r?: MailMessage) => (r?.messageId ? { inReplyTo: r.messageId, references: [r.references, r.messageId].filter(Boolean).join(" ") } : {});

// ---------- IMAP and SMTP ----------

type ImapConfig = NonNullable<ReturnType<typeof imapConfig>>;

/** The IMAP and SMTP clients, loaded only when used. Swapped out in tests. */
export interface ImapDeps {
  imap(c: ImapConfig): Promise<ImapClient>;
  smtp(c: ImapConfig): Promise<{ sendMail(m: Record<string, unknown>): Promise<{ messageId: string }> }>;
  parse(source: Buffer): Promise<{ text?: string; html?: string | false; messageId?: string; references?: string | string[]; subject?: string; from?: { text: string }; to?: { text: string } | { text: string }[]; date?: Date }>;
}

interface ImapEnvelope {
  subject?: string;
  date?: Date;
  from?: { name?: string; address?: string }[];
  to?: { name?: string; address?: string }[];
  messageId?: string;
}
interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string, opts?: { readOnly?: boolean }): Promise<unknown>;
  search(q: Record<string, unknown>, opts: { uid: true }): Promise<number[] | false | undefined>;
  fetchAll(range: number[], q: Record<string, unknown>, opts: { uid: true }): Promise<{ uid: number; envelope?: ImapEnvelope; flags?: Set<string> }[]>;
  fetchOne(uid: string, q: Record<string, unknown>, opts: { uid: true }): Promise<{ uid: number; source?: Buffer; flags?: Set<string> } | false>;
}

const defaultImapDeps: ImapDeps = {
  async imap(c) {
    const { ImapFlow } = await import("imapflow");
    return new ImapFlow({ host: c.imap.host, port: c.imap.port, secure: c.imap.secure, auth: { user: c.user, pass: c.pass }, logger: false }) as unknown as ImapClient;
  },
  async smtp(c) {
    const nodemailer = await import("nodemailer");
    return nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: { user: c.user, pass: c.pass } });
  },
  async parse(source) {
    const { simpleParser } = await import("mailparser");
    return simpleParser(source) as unknown as ReturnType<ImapDeps["parse"]>;
  },
};

const addr = (a?: { name?: string; address?: string }[]) => (a ?? []).map((x) => (x.name ? `${x.name} <${x.address}>` : (x.address ?? ""))).join(", ");

export function imapProvider(c: ImapConfig, deps: ImapDeps = defaultImapDeps): MailProvider {
  // Opens INBOX read-only for each call, so reading never marks anything as seen.
  async function withInbox<T>(fn: (client: ImapClient) => Promise<T>): Promise<T> {
    const client = await deps.imap(c);
    await client.connect();
    try {
      await client.mailboxOpen("INBOX", { readOnly: true });
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
  return {
    name: "imap",
    label: `${c.address} (IMAP)`,
    search: ({ query, unreadOnly, limit }) =>
      withInbox(async (client) => {
        const criteria: Record<string, unknown> = query?.trim() ? { or: [{ subject: query }, { from: query }, { body: query }] } : { all: true };
        if (unreadOnly) criteria.seen = false;
        const uids = (await client.search(criteria, { uid: true })) || [];
        const latest = uids.sort((a, b) => b - a).slice(0, limit);
        if (!latest.length) return [];
        const msgs = await client.fetchAll(latest, { envelope: true, flags: true }, { uid: true });
        return msgs
          .sort((a, b) => b.uid - a.uid)
          .map((m) => ({
            id: String(m.uid),
            from: addr(m.envelope?.from),
            to: addr(m.envelope?.to) || undefined,
            subject: m.envelope?.subject || "(no subject)",
            date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
            snippet: "",
            unread: m.flags ? !m.flags.has("\\Seen") : undefined,
          }));
      }),
    read: (id) =>
      withInbox(async (client) => {
        if (!/^\d+$/.test(id)) throw new Error(`"${id}" isn't a message id from email_search.`);
        const m = await client.fetchOne(id, { source: true, flags: true }, { uid: true });
        if (!m || !m.source) throw new Error(`No message ${id} in the inbox.`);
        const p = await deps.parse(m.source);
        const body = p.text?.trim() || (p.html ? htmlToText(p.html) : "");
        const to = Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : p.to?.text;
        return {
          id,
          from: p.from?.text ?? "",
          to,
          subject: p.subject || "(no subject)",
          date: p.date ? p.date.toISOString() : null,
          snippet: body.slice(0, 160),
          unread: m.flags ? !m.flags.has("\\Seen") : undefined,
          body: body.slice(0, MAX_BODY),
          messageId: p.messageId,
          references: Array.isArray(p.references) ? p.references.join(" ") : p.references,
        };
      }),
    async send(m) {
      const transport = await deps.smtp(c);
      const sent = await transport.sendMail({
        from: c.fromName ? { name: c.fromName, address: c.address } : c.address,
        to: m.to,
        cc: m.cc,
        subject: m.subject,
        text: m.body,
        ...threading(m.replyTo),
      });
      return { id: sent.messageId };
    },
  };
}

// ---------- AgentMail (the twin's inbox) ----------

/** `given` is swapped in by tests; otherwise the client is made from AGENTMAIL_API_KEY when first used. */
export function agentMailProvider(db: Db, given?: AgentMail): MailProvider {
  // mail.ts is loaded lazily: it imports the agent runner, which imports these tools.
  let api = given as AgentMail;
  const inbox = async () => {
    const mail = await import("../mail");
    api ??= mail.getMailApi()!;
    return mail.ensureInbox(db, api);
  };
  return {
    name: "agentmail",
    label: `${getTwinSetting(db, "inbox_email") ?? "Your twin's inbox"} (AgentMail)`,
    async search({ query, unreadOnly, limit }) {
      const box = await inbox();
      const list = await api.listMessages(box.id, Math.min(100, limit * 4));
      const q = query?.trim().toLowerCase();
      return list
        .filter((m) => !q || `${m.from} ${m.subject ?? ""} ${m.preview ?? ""}`.toLowerCase().includes(q))
        .filter((m) => !unreadOnly || (m.labels ?? []).includes("unread"))
        .slice(0, limit)
        .map((m) => ({
          id: m.message_id,
          threadId: m.thread_id,
          from: m.from,
          to: Array.isArray(m.to) ? m.to.join(", ") : m.to,
          subject: m.subject || "(no subject)",
          date: m.timestamp ?? m.created_at ?? null,
          snippet: m.preview ?? "",
          unread: (m.labels ?? []).includes("unread"),
        }));
    },
    async read(id) {
      const box = await inbox();
      const m = await api.getMessage(box.id, id);
      const body = m.text?.trim() || (m.html ? htmlToText(m.html) : "");
      return {
        id: m.message_id,
        threadId: m.thread_id,
        from: m.from,
        to: Array.isArray(m.to) ? m.to.join(", ") : m.to,
        subject: m.subject || "(no subject)",
        date: m.timestamp ?? m.created_at ?? null,
        snippet: body.slice(0, 160),
        body: body.slice(0, MAX_BODY),
        messageId: m.message_id,
      };
    },
    async send(m) {
      const box = await inbox();
      const cc = m.cc?.length ? m.cc.join(", ") : undefined;
      const sent = m.replyTo
        ? await api.reply(box.id, m.replyTo.id, { cc, text: m.body })
        : await api.send(box.id, { to: m.to.join(", "), cc, subject: m.subject, text: m.body });
      return { id: sent.message_id };
    },
  };
}

// ---------- Text helpers ----------

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
