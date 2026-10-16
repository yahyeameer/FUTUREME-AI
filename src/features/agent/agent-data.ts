import { BookmarkPlus, FilePlus, FileSearch, FolderOpen, Globe, ListPlus, Search, type LucideIcon } from "lucide-react";
import type { Memory, Workspace } from "@/types";

export type ToolAccess = "read" | "write" | "none";
export type ToolGate = "auto" | "approval" | "unavailable";

export interface ToolInfo {
  name: string;
  label: string;
  icon: LucideIcon;
  description: string;
  access: ToolAccess;
  gate: ToolGate;
  /** What the tool touches, in the user's words. */
  touches: string;
  /** Which agents may call it, read from the team file. */
  usedBy?: string[];
}

/**
 * The real toolset: the FutureMe MCP server (mcp/futureme-server.ts) exposes these, plus the voice twin's own tools.
 * Each agent in agents/futureme.yaml gets only the ones it needs, so the future self itself never browses.
 */
export function agentTools(ws: Workspace): ToolInfo[] {
  const web = ws.platform.webSearch;
  const webOn = web === "brave" || web === "duckduckgo";
  const usedBy = (name: string) => ws.platform.team.filter((a) => a.tools.includes(name)).map((a) => a.label);
  const offReason = web === "off" ? "Turned off on this server (WEB_SEARCH=off)." : "Needs the FutureMe server; the demo has no web access.";
  return [
    {
      name: "search_memory",
      label: "Search memory",
      icon: Search,
      description:
        "Searches everything it remembers before it answers: your vault notes (including ones you write in Obsidian), every past conversation and saved files. Cites what it used.",
      access: "read",
      gate: "auto",
      touches: "Vault notes and conversations",
    },
    {
      name: "save_file",
      label: "Save a file",
      icon: FilePlus,
      description: "Keeps a draft, list or plan you asked for as a file in your vault's Files folder.",
      access: "write",
      gate: "auto",
      touches: "Vault Files folder",
    },
    {
      name: "read_file",
      label: "Read files",
      icon: FolderOpen,
      description: "Lists and opens the notes and files in your vault when it needs the whole text.",
      access: "read",
      gate: "auto",
      touches: "Vault notes and files",
    },
    {
      name: "propose_plan",
      label: "Propose a plan",
      icon: ListPlus,
      description: "Drafts a goal with concrete steps. Once you approve it, it becomes a milestone and tasks on your roadmap.",
      access: "write",
      gate: "approval",
      touches: "Roadmap",
    },
    {
      name: "propose_memory",
      label: "Propose a memory",
      icon: BookmarkPlus,
      description: "Suggests saving something you shared. Once you approve it, it is written to your vault as a Markdown note.",
      access: "write",
      gate: "approval",
      touches: "Vault notes",
    },
    {
      name: "web_search",
      label: "Web search",
      icon: Globe,
      description: webOn
        ? `Searches the web through ${web === "brave" ? "Brave Search" : "DuckDuckGo"}. Only the research agent has it; your future self never browses.`
        : `Searches the web for the research agent. ${offReason}`,
      access: webOn ? "read" : "none",
      gate: webOn ? "auto" : "unavailable",
      touches: "The web",
    },
    {
      name: "fetch_url",
      label: "Read a web page",
      icon: FileSearch,
      description: webOn
        ? "Reads a public page as plain text so research cites what a page actually says. Private and local addresses are refused."
        : `Reads public web pages for the research agent. ${offReason}`,
      access: webOn ? "read" : "none",
      gate: webOn ? "auto" : "unavailable",
      touches: "Public web pages",
    },
  ].map((t) => ({ ...t, usedBy: usedBy(t.name) }) as ToolInfo);
}

export interface LogEntry {
  id: string;
  at: string;
  kind: "tool" | "skill" | "approval" | "council" | "research" | "night";
  tool?: string;
  title: string;
  detail?: string;
  status: "done" | "failed" | "running" | "pending" | "approved" | "rejected";
  href: string;
}

/** Everything the agent did, newest first, built only from records in the workspace. */
export function agentLog(ws: Workspace): LogEntry[] {
  const out: LogEntry[] = [];
  for (const m of ws.conversation) {
    if (m.role !== "assistant") continue;
    (m.tools ?? []).forEach((t, i) =>
      out.push({ id: `${m.id}-t${i}`, at: m.createdAt, kind: "tool", tool: t.name, title: t.label, detail: t.detail, status: t.status, href: "/future-self" }),
    );
  }
  const skillName = (id: string) => ws.skills.find((s) => s.id === id)?.name ?? id;
  for (const r of ws.skillRuns) {
    out.push({
      id: `run-${r.id}`,
      at: r.finishedAt ?? r.startedAt,
      kind: "skill",
      title: `Ran ${skillName(r.skillId)}`,
      detail: r.summary,
      status: r.status === "failed" ? "failed" : r.status === "running" ? "running" : "done",
      href: "/skills",
    });
  }
  for (const a of ws.approvals) {
    out.push({
      id: `ap-${a.id}`,
      at: a.decidedAt ?? a.createdAt,
      kind: "approval",
      title: a.kind === "plan" ? `Plan: ${a.plan.goal}` : `Memory: ${a.memory.title}`,
      detail: a.status === "pending" ? "Waiting for your approval" : a.status === "approved" ? "You approved it" : "You declined it",
      status: a.status,
      href: a.kind === "plan" ? "/roadmap" : "/memory",
    });
  }
  for (const c of ws.councils) {
    out.push({ id: `council-${c.id}`, at: c.createdAt, kind: "council", title: "Council met", detail: c.question, status: "done", href: "/council" });
  }
  for (const r of ws.research) {
    out.push({
      id: `research-${r.id}`,
      at: r.finishedAt ?? r.startedAt,
      kind: "research",
      title: `Researched ${r.topic}`,
      detail: r.status === "failed" ? r.error : `${r.sources.length} sources`,
      status: r.status === "failed" ? "failed" : r.status === "running" ? "running" : "done",
      href: "/agent#research-heading",
    });
  }
  for (const n of ws.nightShifts) {
    out.push({
      id: `night-${n.id}`,
      at: n.finishedAt ?? n.startedAt,
      kind: "night",
      title: n.trigger === "schedule" ? "Night shift ran" : "Night shift ran (by you)",
      detail: n.status === "failed" ? n.error : n.brief,
      status: n.status === "failed" ? "failed" : n.status === "running" ? "running" : "done",
      href: "/agent#night-heading",
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function toolUsage(ws: Workspace) {
  const counts = new Map<string, { count: number; last?: string }>();
  for (const m of ws.conversation) {
    for (const t of m.tools ?? []) {
      const c = counts.get(t.name) ?? { count: 0 };
      c.count += 1;
      if (!c.last || m.createdAt > c.last) c.last = m.createdAt;
      counts.set(t.name, c);
    }
  }
  return counts;
}

export interface VaultFile {
  path: string;
  folder: string;
  name: string;
  href: string;
  updatedAt: string;
  memory?: Memory;
  /** False when the user told FutureMe not to retrieve this note and the backend enforces it. */
  readable: boolean;
}

/** The Markdown files the agent can reach, grouped the way they sit in the vault. */
export function vaultFiles(ws: Workspace): VaultFile[] {
  const files: VaultFile[] = [];
  const seen = new Set<string>();
  for (const m of ws.memories) {
    if (!m.path || m.archived || seen.has(m.path)) continue;
    seen.add(m.path);
    const [folder, ...rest] = m.path.split("/");
    files.push({
      path: m.path,
      folder: rest.length ? folder : "Vault",
      name: rest.length ? rest.join("/") : folder,
      href: `/memory/${encodeURIComponent(m.id)}`,
      updatedAt: m.updatedAt,
      memory: m,
      readable: m.retrievable || !ws.capabilities.memoryRetrievalControl,
    });
  }
  for (const e of ws.editions) {
    if (!e.path || seen.has(e.path)) continue;
    seen.add(e.path);
    const [folder, ...rest] = e.path.split("/");
    // The live agent searches every Markdown file in the vault, Daily issues included; the demo searches memories only.
    files.push({ path: e.path, folder: rest.length ? folder : "Daily", name: rest.length ? rest.join("/") : folder, href: "/daily", updatedAt: e.date, readable: ws.runtime.mode === "live" });
  }
  return files.sort((a, b) => a.folder.localeCompare(b.folder) || b.updatedAt.localeCompare(a.updatedAt));
}

const KIND_LABEL: Record<LogEntry["kind"], string> = { tool: "Tool", skill: "Action", approval: "Approval", council: "Council", research: "Research", night: "Night shift" };

/** The small caption under a log entry: the tool's name, or what kind of record it is. */
export const logKind = (e: LogEntry) => e.tool ?? KIND_LABEL[e.kind];
