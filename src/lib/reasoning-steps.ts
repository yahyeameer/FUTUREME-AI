// A reply's reasoning trail mixes Nemotron's thinking with the tool calls it led to. Each call is its own line starting
// with this mark (written by chat() in futureme.ts), so the browser can show actions apart from thoughts.
export const STEP_MARK = "▸";

export type TrailPart = { kind: "thought"; text: string } | { kind: "step"; text: string; failed: boolean };

/** Splits a reasoning trail into thoughts and tool steps, in order. */
export function splitTrail(text: string): TrailPart[] {
  const parts: TrailPart[] = [];
  let thought: string[] = [];
  const flush = () => {
    // Older trails separated steps with a "---" line; one at either edge of a thought is just that separator.
    const t = thought.join("\n").trim().replace(/^---\s*|\s*---$/g, "").trim();
    if (t) parts.push({ kind: "thought", text: t });
    thought = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith(`${STEP_MARK} `)) {
      flush();
      const body = line.slice(STEP_MARK.length + 1).trim();
      parts.push({ kind: "step", text: body, failed: /^[^·]*\(failed\)/.test(body) });
    } else thought.push(line);
  }
  flush();
  return parts;
}
