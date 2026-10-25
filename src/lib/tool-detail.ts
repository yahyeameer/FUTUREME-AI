// One short line on what a tool call did, from its arguments and output: "“grant” · 2 messages", "waiting for your
// approval: Email to hodan@example.org". Shown next to the step in the reply's activity list and in its reasoning trail.

const MAX = 90;

const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (s: unknown) => (typeof s === "string" && s.trim() ? `“${s.trim()}”` : null);

function parse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function toolDetail(name: string, rawArgs: string, output: string): string | undefined {
  const a = parse(rawArgs);
  if (output.startsWith("Error")) return clip(output.replace(/^Error:\s*(\w+ failed:\s*)?/, "").split("\n")[0]);
  // A request that now waits on the Agent page: "Request #12 (Email to …) is waiting …".
  const request = output.match(/^Request #\d+ \((.+?)\) is waiting/);
  if (request) return clip(`waiting for your approval: ${request[1]}`);
  const lines = output.split("\n");
  const join = (...parts: (string | null | undefined)[]) => clip(parts.filter(Boolean).join(" · "));

  switch (name) {
    case "email_search": {
      const n = lines.filter((l) => /^\d+\. \[id /.test(l)).length;
      return join(quoted(a.query), a.unread_only ? "unread" : null, n ? plural(n, "message") : "nothing found");
    }
    case "email_read":
      return join(lines.find((l) => l.startsWith("Subject: "))?.slice(9), lines.find((l) => l.startsWith("From: "))?.slice(6));
    case "email_draft":
      return join(quoted(a.subject), "saved, not sent");
    case "calendar_list_events": {
      const n = lines.filter((l) => l.startsWith("- ")).length;
      return join(quoted(a.query), n ? plural(n, "event") : "nothing scheduled");
    }
    case "list_tasks": {
      const n = lines.filter((l) => /^\s+- \[/.test(l)).length;
      return plural(n, "task");
    }
    case "get_current_time":
      return clip(output.split(". ISO:")[0]);
    case "web_search": {
      const n = lines.filter((l) => /^\d+\. /.test(l)).length;
      return join(quoted(a.query), n ? plural(n, "result") : "no results");
    }
    case "fetch_url":
      try {
        return new URL(String(a.url)).hostname;
      } catch {
        return undefined;
      }
    case "search_memory": {
      const n = lines.filter((l) => l.startsWith("## ")).length;
      return join(quoted(a.query), n ? plural(n, "note") : "nothing matched");
    }
    case "save_file":
    case "edit_file":
    case "delete_file":
    case "add_task":
    case "complete_task":
    case "calendar_create_event":
    case "email_send":
    case "send_message":
      // Ran straight away (auto-approved or a new file): its own sentence says what happened.
      return clip(lines[0]);
    default:
      return undefined;
  }
}
