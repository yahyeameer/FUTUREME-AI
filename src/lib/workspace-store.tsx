"use client";

import * as React from "react";
import { toast } from "sonner";
import { createDemoService, resetDemo } from "@/mocks/demo-service";
import type { CoachingStyle, Message, ToolCall, Workspace } from "@/types";
import { usePreferences } from "./preferences";
import { createLiveService, probeLive } from "./services/live-service";
import type { FutureMeService } from "./services/types";

// Client store for the workspace snapshot. Picks the live service when the FutureMe server answers
// (or when the user chose it), and the demo service otherwise.

export interface PendingTurn {
  text: string;
  tools: ToolCall[];
  draft: string;
  error?: string;
}

interface WorkspaceContext {
  status: "loading" | "ready" | "error";
  workspace: Workspace | null;
  service: FutureMeService | null;
  error: string | null;
  /** Why the current mode was chosen, for Settings. */
  modeReason: string;
  pending: PendingTurn | null;
  /** Runs a mutation and swaps in the snapshot it returns. Errors become toasts; resolves to false on failure. */
  run: (fn: (s: FutureMeService) => Promise<Workspace>, success?: string) => Promise<boolean>;
  apply: (ws: Workspace) => void;
  send: (text: string, style: CoachingStyle) => Promise<void>;
  /** Runs the fact checker on a reply. Replies are checked automatically after each turn when the backend supports it. */
  verify: (messageId: string) => Promise<void>;
  /** Replies being checked right now, and ones whose check failed. */
  checks: Record<string, "checking" | "failed">;
  stop: () => void;
  retry: () => void;
  reload: () => void;
  resetDemoData: (kind: "seed" | "empty") => void;
}

const Ctx = React.createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { mode, hydrated } = usePreferences();
  const [service, setService] = React.useState<FutureMeService | null>(null);
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null);
  const [status, setStatus] = React.useState<WorkspaceContext["status"]>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [modeReason, setModeReason] = React.useState("");
  const [pending, setPending] = React.useState<PendingTurn | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [checks, setChecks] = React.useState<Record<string, "checking" | "failed">>({});
  const abort = React.useRef<AbortController | null>(null);
  const lastText = React.useRef<{ text: string; style: CoachingStyle } | null>(null);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError(null);
      let svc: FutureMeService;
      let reason: string;
      if (mode === "demo") {
        svc = createDemoService();
        reason = "You chose demo mode.";
      } else {
        const live = await probeLive();
        if (live) {
          svc = createLiveService();
          reason = mode === "live" ? "You chose the FutureMe server." : "The FutureMe server is available.";
        } else if (mode === "live") {
          if (!cancelled) {
            setError("The FutureMe server isn't responding. Switch to demo mode in Settings, or try again.");
            setStatus("error");
          }
          return;
        } else {
          svc = createDemoService();
          reason = "The FutureMe server isn't reachable, so demo data is shown.";
        }
      }
      try {
        const ws = await svc.load();
        if (cancelled) return;
        setService(svc);
        setWorkspace(ws);
        setModeReason(reason);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load your workspace.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, hydrated, nonce]);

  const run = React.useCallback<WorkspaceContext["run"]>(
    async (fn, success) => {
      if (!service) return false;
      try {
        setWorkspace(await fn(service));
        if (success) toast.success(success);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
        return false;
      }
    },
    [service],
  );

  const verify = React.useCallback(
    async (messageId: string) => {
      if (!service) return;
      setChecks((c) => ({ ...c, [messageId]: "checking" }));
      try {
        const next = await service.verifyMessage(messageId);
        const verification = next.conversation.find((m) => m.id === messageId)?.verification;
        if (!verification) throw new Error("The check wasn't saved.");
        // Only this reply changes, so a check finishing late never overwrites newer state.
        setWorkspace((cur) => (cur ? { ...cur, conversation: cur.conversation.map((m) => (m.id === messageId ? { ...m, verification } : m)) } : cur));
        setChecks((c) => {
          const rest = { ...c };
          delete rest[messageId];
          return rest;
        });
      } catch {
        setChecks((c) => ({ ...c, [messageId]: "failed" }));
      }
    },
    [service],
  );

  // A reply can finish while its check is still running and the page reloads. Pick a recent unchecked reply back up, once.
  const resumed = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (status !== "ready" || !workspace?.capabilities.verify || pending) return;
    const last = [...workspace.conversation].reverse().find((m) => m.role === "assistant");
    if (!last || last.verification || last.simulated || resumed.current.has(last.id) || checks[last.id]) return;
    if (Date.now() - new Date(last.createdAt).getTime() > 10 * 60_000) return;
    const t = setTimeout(() => {
      resumed.current.add(last.id);
      void verify(last.id);
    }, 0);
    return () => clearTimeout(t);
  }, [status, workspace, pending, checks, verify]);

  const send = React.useCallback(
    async (text: string, style: CoachingStyle) => {
      if (!service || pending) return;
      lastText.current = { text, style };
      const controller = new AbortController();
      abort.current = controller;
      setPending({ text, tools: [], draft: "" });
      // Show the user's message right away.
      setWorkspace((ws) =>
        ws ? { ...ws, conversation: [...ws.conversation, { id: `local-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString(), citations: [] } satisfies Message] } : ws,
      );
      try {
        for await (const ev of service.sendMessage(text, { style, signal: controller.signal })) {
          if (ev.type === "tool")
            setPending((p) => (p ? { ...p, tools: [...p.tools.filter((t) => t.name !== ev.tool.name), ev.tool] } : p));
          else if (ev.type === "delta") setPending((p) => (p ? { ...p, draft: p.draft + ev.text } : p));
          else if (ev.type === "error") {
            setPending((p) => (p ? { ...p, tools: p.tools.map((t) => ({ ...t, status: t.status === "running" ? "failed" : t.status })), error: ev.error } : p));
            return;
          } else if (ev.type === "done") {
            // The turn's message carries tool and approval details the stored conversation may not.
            const ws = ev.workspace;
            const i = ws.conversation.findIndex((m) => m.id === ev.message.id);
            if (i >= 0) ws.conversation[i] = { ...ws.conversation[i], ...ev.message, approvalIds: ev.message.approvalIds?.length ? ev.message.approvalIds : ws.conversation[i].approvalIds };
            setWorkspace(ws);
            setPending(null);
            if (ws.capabilities.verify) {
              resumed.current.add(ev.message.id);
              void verify(ev.message.id);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setPending(null);
          // Reload so the conversation reflects what the server actually stored.
          service.load().then(setWorkspace, () => undefined);
          return;
        }
        setPending((p) => (p ? { ...p, error: err instanceof Error ? err.message : "Something went wrong." } : p));
      } finally {
        abort.current = null;
      }
    },
    [service, pending, verify],
  );

  const stop = React.useCallback(() => abort.current?.abort(), []);

  const retry = React.useCallback(() => {
    const last = lastText.current;
    if (!last || !service) return;
    setPending(null);
    // Drop the optimistic user message; the retry adds it again.
    service.load().then((ws) => {
      setWorkspace(ws);
      void send(last.text, last.style);
    });
  }, [service, send]);

  const value = React.useMemo<WorkspaceContext>(
    () => ({
      status,
      workspace,
      service,
      error,
      modeReason,
      pending,
      run,
      apply: setWorkspace,
      send,
      verify,
      checks,
      stop,
      retry,
      reload: () => setNonce((n) => n + 1),
      resetDemoData: (kind) => {
        resetDemo(kind);
        setNonce((n) => n + 1);
      },
    }),
    [status, workspace, service, error, modeReason, pending, run, send, verify, checks, stop, retry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceContext() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaceContext must be used inside WorkspaceProvider");
  return ctx;
}

/** For screens that render only once the workspace is loaded (wrapped by <WorkspaceGate>). */
export function useWorkspace() {
  const ctx = useWorkspaceContext();
  if (!ctx.workspace || !ctx.service) throw new Error("useWorkspace used before the workspace loaded");
  return { ...ctx, workspace: ctx.workspace, service: ctx.service };
}
