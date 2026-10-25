# Agent integrations

The future self can act for you, not just advise: read and send email, check and fill your calendar, post to your chat
channels, look things up on the web, and manage your tasks and vault files. Everything lives in `src/lib/connectors/`,
is offered to the in-process agent loop and to Docker Agent (through `mcp/futureme-server.ts`), and follows one rule:

- **Reading runs on its own.** Searching mail, reading a message, listing events or tasks, the clock.
- **Anything that sends, adds, changes or deletes waits for you.** It becomes a request on the Agent page, under
  Integrations, showing exactly what will happen (recipients, subject and full text for an email; the time and invitees
  for an event; the new text for a file). Approve runs it and posts the result into the conversation; Decline does nothing.
  If it fails (a mailbox is down), the request stays pending with the reason so you can try again.
- `AGENT_AUTO_APPROVE` lists tools you trust to run without asking. **Sending email and chat messages always asks**,
  whatever it says.
- Mail from outside is handed to the agent between markers as data, with a warning when it reads like instructions to
  an AI. The agent is told never to follow it.

## In the conversation

Each reply lists its steps with one line on what each did ("Searched your email · unread · 1 message", "Asked to send
an email · waiting for your approval"). The same steps are woven into the reasoning trail where they happened, live
while Nemotron thinks and saved with the reply, so you can read why it searched and what it found before it acted.
Requests a reply made (an email, an event, a file change) show their approval cards right under it, so you can approve
or decline without leaving the chat; they also stay on the Agent page.

## Tools

| Tool | What it does | Runs |
| --- | --- | --- |
| `get_current_time` | Date, time and weekday, in any time zone | on its own |
| `web_search`, `fetch_url` | Search the web and read public pages (now also for the future self, not just the researcher) | on its own |
| `email_search` | Newest or matching messages: ids, senders, subjects, snippets (Gmail search syntax on Gmail) | on its own |
| `email_read` | One message in full, as quoted data; IMAP opens the inbox read-only so nothing is marked read | on its own |
| `email_draft` | Saves a draft to the vault's `Drafts/` folder; sends nothing | on its own |
| `email_send` | Sends, or replies in the same thread with `reply_to_id` | **always asks** |
| `calendar_list_events` | Events in a range from every calendar source | on its own |
| `calendar_create_event` | Adds an event; attendees get an invitation | asks |
| `send_message` | Posts to Slack, Discord or Telegram | **always asks** |
| `list_tasks` | Goals and tasks with ids | on its own |
| `add_task`, `complete_task` | Adds a task to a goal, or marks one done | asks |
| `edit_file`, `delete_file` | Appends to, rewrites or deletes a vault file | asks |
| `save_file` | Saves a new file in `Files/`; replacing an existing one now asks (it becomes an `edit_file` request) | new: on its own |

## Setting them up

| Integration | What to set | Notes |
| --- | --- | --- |
| **Google** (Gmail + Calendar) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, then **Connect Google** on the Agent page | Create an OAuth client (Web application) in Google Cloud, turn on the Gmail and Calendar APIs, and add `<your address>/api/integrations/google/callback` as a redirect URI. Scopes: `gmail.modify`, `gmail.send`, `calendar.events`. The refresh token is stored encrypted. Or set `GOOGLE_REFRESH_TOKEN` yourself. While the app is in Google's "testing" mode, add yourself as a test user. |
| **Any mailbox** (IMAP + SMTP) | `EMAIL_IMAP_HOST`, `EMAIL_SMTP_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` | Use an app password. Optional: `EMAIL_IMAP_PORT` (993), `EMAIL_SMTP_PORT` (465), `EMAIL_IMAP_SECURE`, `EMAIL_SMTP_SECURE`, `EMAIL_ADDRESS`, `EMAIL_FROM_NAME`. |
| **AgentMail** | `AGENTMAIL_API_KEY` (already used by the voice twin) | Used only when nothing else is set: mail then goes from the twin's own address, not yours. |
| Which mailbox | `EMAIL_PROVIDER=gmail\|imap\|agentmail` | Default order: Gmail, IMAP, AgentMail. |
| **Calendar feeds** | `CALENDAR_ICS_URLS` (comma-separated) | Secret iCal addresses from Outlook, iCloud, Proton or Google. Read-only; repeating events show their first date only. |
| **TOMORA calendar** | nothing | When Google isn't connected, new events go to a table in SQLite and a note in `Calendar/`. |
| **Slack** | `SLACK_WEBHOOK_URL` | An incoming webhook; posts to the one channel it was made for. |
| **Discord** | `DISCORD_WEBHOOK_URL` | A channel webhook; @everyone and role pings are turned off. |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | A bot from @BotFather and the chat it writes to. |

The Agent page shows each integration's state and which of its tools run on their own or ask first.

## How it was tested

- `tests/connectors.test.ts`: every tool, against stand-ins for Google's token endpoint, the Gmail and Calendar APIs, a
  Slack webhook and an ICS feed, plus a fake IMAP client; the approval flow (approve, decline, failure stays pending,
  no double send); the Connect Google flow; and the future self asking to send an email in a conversation.
- IMAP and SMTP for real: the actual `imapflow`, `mailparser` and `nodemailer` code against local mail servers
  (hoodiecrow IMAP and smtp-server): search, unread filter, reading without marking read, and a threaded reply.
- In the running app: an email reply, a task and an event requested by the agent, approved on the Agent page; the reply
  went out over SMTP with the right `In-Reply-To`.
- **Not yet tested against real accounts:** a real Google account (Gmail, Calendar, the consent screen), a real
  mailbox, Slack, Discord or Telegram.
