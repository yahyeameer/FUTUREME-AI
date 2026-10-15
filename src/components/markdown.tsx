import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

// A small, safe Markdown renderer for notes and replies: paragraphs, headings, lists, task lists,
// quotes, bold, italic, code and Obsidian [[wiki-links]]. No HTML is ever injected.

type Resolve = (title: string) => string | undefined;

function inline(text: string, resolve?: Resolve, keyBase = ""): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2]) {
      const label = m[3] ?? m[2];
      const href = resolve?.(m[2].trim());
      out.push(
        href ? (
          <Link key={key} href={href} className="text-accent-ink underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
            {label}
          </Link>
        ) : (
          <span key={key} className="text-muted-foreground" title="No note with this title">
            {label}
          </span>
        ),
      );
    } else if (m[4]) out.push(<strong key={key}>{m[4]}</strong>);
    else if (m[5] || m[6]) out.push(<em key={key}>{m[5] ?? m[6]}</em>);
    else if (m[7]) out.push(<code key={key} className="rounded bg-surface-3 px-1 py-px font-mono text-[0.85em]">{m[7]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, resolve, className }: { source: string; resolve?: Resolve; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      blocks.push(
        <p key={k++} className="t-label !mt-6 first:!mt-0">
          {inline(heading[2], resolve, `h${k}`)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k++} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc marker:text-subtle")}>
          {items.map((it, j) => {
            const task = it.match(/^\[( |x)\]\s+(.*)/i);
            return task ? (
              <li key={j} className="-ml-5 flex list-none items-start gap-2">
                <span aria-hidden className={cn("mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px]", task[1] !== " " ? "border-accent bg-accent text-accent-foreground" : "border-border-strong")}>
                  {task[1] !== " " ? "✓" : ""}
                </span>
                <span className={cn(task[1] !== " " && "text-muted-foreground")}>
                  <span className="sr-only">{task[1] !== " " ? "Done: " : "To do: "}</span>
                  {inline(task[2], resolve, `l${k}-${j}`)}
                </span>
              </li>
            ) : (
              <li key={j}>{inline(it, resolve, `l${k}-${j}`)}</li>
            );
          })}
        </List>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={k++} className="border-l-2 border-copper/60 pl-3 text-muted-foreground italic">
          {inline(quote.join(" "), resolve, `q${k}`)}
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(" "), resolve, `p${k}`)}</p>);
  }
  return <div className={cn("space-y-3", className)}>{blocks}</div>;
}
