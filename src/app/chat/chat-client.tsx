"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { refreshPlanAction } from "@/app/actions";
import { input, primaryButton } from "@/components/ui";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
  citations: string[];
  approvals?: number[];
  tools?: string[];
}

export function ChatClient({ initial, name }: { initial: UiMessage[]; name: string }) {
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState(""); // the reply while it streams in
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function send(formData: FormData) {
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return;
    setError(undefined);
    setMessages((m) => [...m, { role: "user", content: text, citations: [] }]);
    form.current?.reset();

    start(async () => {
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "Your future self couldn't answer just now.");
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const event = JSON.parse(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
            if (event.type === "delta") setDraft((d) => d + event.text);
            if (event.type === "done") {
              setMessages((m) => [...m, { role: "assistant", content: event.reply, citations: event.citations, approvals: event.approvals, tools: event.tools }]);
              setDraft("");
            }
            if (event.type === "error") throw new Error(event.error);
          }
        }
        await refreshPlanAction();
      } catch (err) {
        setDraft("");
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <ol className="flex flex-1 flex-col gap-4">
        {messages.length === 0 && (
          <li className="text-stone-500">Ask {name} ten years from now anything. Try: &ldquo;Help me plan my first step.&rdquo;</li>
        )}
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl rounded-br-sm bg-stone-900 px-4 py-2.5 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900"
              }
            >
              <p className="whitespace-pre-wrap leading-7">{m.content}</p>
            </div>
            {m.role === "assistant" && (m.citations.length > 0 || (m.approvals?.length ?? 0) > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-2 px-1 text-xs text-stone-500">
                {m.citations.map((c) => (
                  <span key={c} className="rounded bg-stone-200/70 px-1.5 py-0.5 dark:bg-stone-800">
                    remembered {c}
                  </span>
                ))}
                {(m.approvals?.length ?? 0) > 0 && (
                  <Link href="/plan" className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 underline dark:bg-amber-900/40 dark:text-amber-200">
                    {m.approvals!.length} proposal{m.approvals!.length > 1 ? "s" : ""} waiting for you
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
        {draft && (
          <li className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900">
            <p className="whitespace-pre-wrap leading-7">{draft}</p>
          </li>
        )}
        {pending && !draft && <li className="self-start text-sm text-stone-500">Searching your memories…</li>}
      </ol>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <form ref={form} action={send} className="sticky bottom-4 flex gap-2">
        <input name="text" autoComplete="off" placeholder="Talk to your future self…" className={input} disabled={pending} />
        <button className={primaryButton} disabled={pending}>
          Send
        </button>
      </form>
    </div>
  );
}
