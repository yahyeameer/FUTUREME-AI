import { parseJsonReply, runAgent } from "./agents";
import type { Db } from "./db";
import { SUPERVISE_MARKER } from "./mock-llm";
import { SCHEMAS } from "./nemotron";
import { listNotes } from "./vault";
import { ruleChecks as checkRules, verdictOf, worst, type Issue, type RunUnderReview, type Verdict } from "./supervisor-rules";

export { verdictOf, type Issue, type RunUnderReview, type Verdict };
export const ruleChecks = (run: RunUnderReview) => checkRules(run, new Set(listNotes()));

// The supervisor watches the other agents. Every sub-agent result goes through two layers before anyone relies on it:
// 1. Rules in code, which are guarantees: a helper that returns nothing, uses a tool it wasn't given, cites a link it
//    never opened or a note that doesn't exist, or claims to have saved or sent something it can't.
// 2. The supervisor agent (agents/futureme.yaml), which judges what rules can't: did it do the task, and stay in its role?
// The stricter verdict wins. A blocked result is never passed on to the agent that asked for it.

export interface Supervision {
  verdict: Verdict;
  issues: Issue[];
  summary: string;
  /** Which backend ran the supervisor agent; null when only the rules ran. */
  backend: string | null;
  checkedAt: string;
}

/** Rules, then the supervisor agent. If the supervisor agent can't run, the rule verdict stands and says so. */
export async function supervise(db: Db, run: RunUnderReview, opts: { agentReview?: boolean } = {}): Promise<Supervision> {
  const rules = ruleChecks(run);
  const checkedAt = new Date().toISOString();
  if (opts.agentReview === false || verdictOf(rules) === "block") {
    return { verdict: verdictOf(rules), issues: rules, summary: rules.length ? rules[0].text : "Passed the rule checks.", backend: null, checkedAt };
  }
  try {
    const review = await runAgent(db, "supervisor", [
      {
        role: "user",
        content: `${SUPERVISE_MARKER} ${JSON.stringify({
          agent: run.agent,
          role: run.role,
          task: run.task,
          tools_allowed: run.allowedTools,
          tools_used: run.usedTools,
          output: run.output.slice(0, 4000),
          rule_findings: rules.map((r) => `${r.severity}: ${r.text}`),
        })}`,
      },
    ], { schema: SCHEMAS.supervision });
    const parsed = parseJsonReply<{ verdict?: unknown; issues?: unknown; summary?: unknown }>(review.reply);
    const agentVerdict: Verdict = parsed?.verdict === "block" || parsed?.verdict === "flag" ? parsed.verdict : "ok";
    const agentIssues: Issue[] = (Array.isArray(parsed?.issues) ? parsed.issues : [])
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, 4)
      .map((text) => ({ source: "supervisor", severity: agentVerdict === "ok" ? "flag" : agentVerdict, text: text.trim() }));
    const issues = [...rules, ...agentIssues];
    // An agent "block" with no reason given is still honoured, but recorded as such.
    if (agentVerdict !== "ok" && !agentIssues.length) issues.push({ source: "supervisor", severity: agentVerdict, text: "The supervisor rejected it without giving a reason." });
    return {
      verdict: worst(verdictOf(rules), agentVerdict === "ok" && agentIssues.length ? "flag" : agentVerdict),
      issues,
      summary: typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 400) : issues[0]?.text ?? "Looks fine.",
      backend: review.backend,
      checkedAt,
    };
  } catch (err) {
    return {
      verdict: verdictOf(rules),
      issues: rules,
      summary: `The supervisor agent couldn't run (${err instanceof Error ? err.message : "unknown error"}), so only the rule checks applied.`,
      backend: null,
      checkedAt,
    };
  }
}

