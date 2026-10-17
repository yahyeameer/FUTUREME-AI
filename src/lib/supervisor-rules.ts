// The supervisor's rule checks: pure functions, so the browser (demo mode) applies exactly the same rules as the server.

export type Verdict = "ok" | "flag" | "block";

export interface Issue {
  source: "rule" | "supervisor";
  severity: Exclude<Verdict, "ok">;
  text: string;
}

export interface RunUnderReview {
  agent: string;
  role: string | null;
  task: string;
  allowedTools: string[];
  usedTools: string[];
  /** Links and note paths the run's tools actually returned. */
  citations: string[];
  output: string;
  /** False for Docker Agent runs in parallel, whose tool logs can overlap; tool-use rules are skipped then. */
  exactEvents: boolean;
}

const RANK: Record<Verdict, number> = { ok: 0, flag: 1, block: 2 };
export const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

// Things only a write tool could do. Helpers have none, so saying so is a claim the supervisor must catch.
const ACTION_CLAIM = /\b(I|I've|I have|we've|we have)\s+(?:already\s+)?(saved|created|added|scheduled|sent|emailed|booked|posted|published|updated your|deleted|approved)\b/i;

/** `knownNotes` is every note path in the vault; pass null where the vault can't be listed. */
export function ruleChecks(run: RunUnderReview, knownNotes: Set<string> | null): Issue[] {
  const issues: Issue[] = [];
  const out = run.output.trim();
  if (!out) issues.push({ source: "rule", severity: "block", text: "It returned nothing." });

  if (run.exactEvents) {
    const outside = [...new Set(run.usedTools.filter((t) => !run.allowedTools.includes(t)))];
    if (outside.length) issues.push({ source: "rule", severity: "block", text: `It used tools it wasn't given: ${outside.join(", ")}.` });
  }

  const opened = new Set(run.citations.map(normalizeUrl));
  const links = [...new Set(out.match(/https?:\/\/[^\s)\]"'<>]+/g) ?? [])].map((u) => u.replace(/[.,;:]+$/, ""));
  const unopened = links.filter((u) => !opened.has(normalizeUrl(u)));
  if (unopened.length) {
    issues.push({ source: "rule", severity: "flag", text: `It cites ${unopened.length === 1 ? "a link" : `${unopened.length} links`} its tools never returned: ${unopened.map(host).join(", ")}.` });
  }

  const notePaths = [...new Set(out.match(/\b(?:Profile|Goals|Reflections|Tasks|Research|Daily)\/[\w\- .]+\.md\b/g) ?? [])];
  const missing = knownNotes ? notePaths.filter((p) => !knownNotes.has(p)) : [];
  if (missing.length) issues.push({ source: "rule", severity: "flag", text: `It points to notes that don't exist: ${missing.join(", ")}.` });

  if (ACTION_CLAIM.test(out)) issues.push({ source: "rule", severity: "flag", text: "It says it saved or sent something, but helpers can't change anything." });
  return issues;
}

export function verdictOf(issues: Issue[]): Verdict {
  return issues.reduce<Verdict>((v, i) => worst(v, i.severity), "ok");
}

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

function host(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}
