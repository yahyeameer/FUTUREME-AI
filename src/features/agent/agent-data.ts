import { AtSign, BookmarkPlus, CalendarDays, FilePen, FilePlus, FileSearch, FolderOpen, Forward, Globe, ListChecks, ListPlus, Mail, MessageSquare, Search, UserPlus, type LucideIcon } from "lucide-react";
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
  /** For a card that stands for a family of tools (email_search, email_send…): all of their names. */
  names?: string[];
}

/**
 * The real toolset: the TOMORA MCP server (mcp/futureme-server.ts) exposes these, plus the voice twin's own tools.
 * Each agent in agents/futureme.yaml gets only the ones it needs.
 */
export function agentTools(ws: Workspace): ToolInfo[] {
  const web = ws.platform.webSearch;
  const webOn = web === "brave" || web === "duckduckgo";
  const usedBy = (name: string) => ws.platform.team.filter((a) => a.tools.includes(name)).map((a) => a.label);
  const offReason = web === "off" ? "Turned off on this server (WEB_SEARCH=off)." : "Needs the TOMORA server; the demo has no web access.";
  const integration = (id: string) => ws.agentActions?.integrations.find((i) => i.id === id);
  const live = !!ws.agentActions;
  const needsServer = "Needs the TOMORA server.";
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
      name: "search_social",
      label: "Search your accounts",
      icon: AtSign,
      description: ws.capabilities.delegation
        ? "Searches what you wrote on the LinkedIn, X and Facebook accounts you imported (posts, roles, profile) and quotes it with dates and links. Also reads the persona built from them."
        : "Searches the LinkedIn, X and Facebook data you import on Connected accounts. Needs the TOMORA server.",
      access: ws.capabilities.delegation ? "read" : "none",
      gate: ws.capabilities.delegation ? "auto" : "unavailable",
      touches: "Imported accounts (vault Social folder)",
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
        ? `Searches the web through ${web === "brave" ? "Brave Search" : "DuckDuckGo"} for quick facts mid-conversation, and for the research agent's deeper reports.`
        : `Searches the web. ${offReason}`,
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
        : `Reads public web pages. ${offReason}`,
      access: webOn ? "read" : "none",
      gate: webOn ? "auto" : "unavailable",
      touches: "Public web pages",
    },
    {
      name: "delegate_task",
      label: "Hand off a task",
      icon: Forward,
      description: ws.capabilities.delegation
        ? "Gives one task to the researcher or the council mid-conversation and uses their answer. The supervisor reviews it first."
        : "Hands a task to the researcher or the council mid-conversation. Needs the TOMORA server.",
      access: ws.capabilities.delegation ? "read" : "none",
      gate: ws.capabilities.delegation ? "auto" : "unavailable",
      touches: "Other agents",
    },
    {
      name: "spawn_agent",
      label: "Create a helper",
      icon: UserPlus,
      description: ws.capabilities.delegation
        ? "Creates a temporary helper with a role and read-only tools for one task. Helpers can't save anything, and the supervisor reviews their answer."
        : "Creates a temporary helper agent for one task. Needs the TOMORA server.",
      access: ws.capabilities.delegation ? "read" : "none",
      gate: ws.capabilities.delegation ? "auto" : "unavailable",
      touches: "New helper agents",
    },
    {
      name: "email_send",
      names: ["email_search", "email_read", "email_draft", "email_send"],
      label: "Email",
      icon: Mail,
      description: !live
        ? `Searches, reads and drafts your email, and sends with your approval. ${needsServer}`
        : integration("email")?.status === "connected"
          ? `Searches and reads ${integration("email")!.via}, saves drafts, and sends or replies only after you approve each email.`
          : "Saves email drafts to your vault. Connect Google or an IMAP mailbox under Integrations to let it read and send mail.",
      access: live ? "write" : "none",
      gate: live ? "approval" : "unavailable",
      touches: "Your mailbox",
    },
    {
      name: "calendar_create_event",
      names: ["calendar_list_events", "calendar_create_event", "get_current_time"],
      label: "Calendar",
      icon: CalendarDays,
      description: live
        ? `Checks your schedule and adds events after you approve them. Uses ${integration("calendar")?.via ?? "TOMORA's calendar"}.`
        : `Checks your schedule and adds events with your approval. ${needsServer}`,
      access: live ? "write" : "none",
      gate: live ? "approval" : "unavailable",
      touches: "Your calendar",
    },
    {
      name: "send_message",
      label: "Chat channels",
      icon: MessageSquare,
      description:
        live && integration("messaging")?.status !== "off"
          ? `Posts reminders or summaries to ${integration("messaging")!.via}. Every message waits for your approval.`
          : `Posts to your Slack, Discord or Telegram after you approve each message. ${live ? "Set one up under Integrations." : needsServer}`,
      access: live && integration("messaging")?.status !== "off" ? "write" : "none",
      gate: live && integration("messaging")?.status !== "off" ? "approval" : "unavailable",
      touches: "Your chat channels",
    },
    {
      name: "add_task",
      names: ["list_tasks", "add_task", "complete_task"],
      label: "Manage tasks",
      icon: ListChecks,
      description: live ? "Reads your roadmap, and adds tasks to a goal or marks them done once you approve." : `Reads, adds and completes roadmap tasks with your approval. ${needsServer}`,
      access: live ? "write" : "none",
      gate: live ? "approval" : "unavailable",
      touches: "Roadmap",
    },
    {
      name: "edit_file",
      names: ["edit_file", "delete_file"],
      label: "Change files",
      icon: FilePen,
      description: live ? "Adds to, rewrites or deletes a note or file in your vault. You see the change first and approve it." : `Edits or deletes vault files with your approval. ${needsServer}`,
      access: live ? "write" : "none",
      gate: live ? "approval" : "unavailable",
      touches: "Vault notes and files",
    },
  ].map((t) => ({ ...t, usedBy: [...new Set((t.names ?? [t.name]).flatMap(usedBy))] }) as ToolInfo);
}

export interface LogEntry {
  id: string;
  at: string;
  kind: "tool" | "skill" | "approval" | "council" | "research" | "night" | "mission";
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
  for (const m of ws.missions) {
    out.push({
      id: `mission-${m.id}`,
      at: m.finishedAt ?? m.createdAt,
      kind: "mission",
      title: `Mission: ${m.goal}`,
      detail: m.status === "failed" ? m.error : m.status === "done" ? `${m.runs.length} helpers, reviewed by the supervisor` : "In progress",
      status: m.status === "failed" ? "failed" : m.status === "done" ? "done" : "running",
      href: "/missions",
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** How often any tool behind a card was called, and when last. */
export function cardUsage(usage: ReturnType<typeof toolUsage>, tool: ToolInfo) {
  let out: { count: number; last?: string } | undefined;
  for (const name of tool.names ?? [tool.name]) {
    const u = usage.get(name);
    if (!u) continue;
    out = { count: (out?.count ?? 0) + u.count, last: !out?.last || (u.last && u.last > out.last) ? u.last : out.last };
  }
  return out;
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
  /** False when the user told TOMORA not to retrieve this note and the backend enforces it. */
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

const KIND_LABEL: Record<LogEntry["kind"], string> = { tool: "Tool", skill: "Action", approval: "Approval", council: "Council", research: "Research", night: "Night shift", mission: "Mission" };

/** The small caption under a log entry: the tool's name, or what kind of record it is. */
export const logKind = (e: LogEntry) => e.tool ?? KIND_LABEL[e.kind];
