import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// Obsidian-compatible Markdown vault: one note per file, YAML frontmatter, [[wiki-links]].

export const VAULT_FOLDERS = [
  "Profile",
  "Goals",
  "Reflections",
  "Plans",
  "Tasks",
  "Daily",
  "Research",
  "Calls",
  "Inbox",
] as const;

export type VaultFolder = (typeof VAULT_FOLDERS)[number];

export interface NoteInput {
  folder: VaultFolder;
  title: string;
  body: string;
  tags?: string[];
  links?: string[];
  evidence?: "user-stated" | "ai-inferred" | "verified";
}

export interface Note {
  path: string;
  title: string;
  folder: string;
  tags: string[];
  links: string[];
  body: string;
  data: Record<string, unknown>;
}

export function vaultRoot(): string {
  // The vault lives wherever VAULT_DIR points at runtime, so keep the bundler from tracing it.
  return path.resolve(/*turbopackIgnore: true*/ process.env.VAULT_DIR ?? path.join(process.cwd(), "data", "vault"));
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
  return slug || "untitled";
}

// Resolve a vault-relative path and refuse anything that escapes the vault.
export function resolveInVault(relPath: string, root = vaultRoot()): string {
  const full = path.resolve(root, relPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Path escapes vault: ${relPath}`);
  }
  return full;
}

export function writeNote(input: NoteInput, root = vaultRoot()): Note {
  if (!VAULT_FOLDERS.includes(input.folder)) {
    throw new Error(`Unknown vault folder: ${input.folder}`);
  }
  const rel = path.join(input.folder, `${slugify(input.title)}.md`);
  const full = resolveInVault(rel, root);
  fs.mkdirSync(path.dirname(full), { recursive: true });

  const links = input.links ?? [];
  const data = {
    title: input.title,
    tags: input.tags ?? [],
    evidence: input.evidence ?? "user-stated",
    updated: new Date().toISOString(),
  };
  const linkLine = links.length ? `\n\nRelated: ${links.map((l) => `[[${l}]]`).join(", ")}\n` : "\n";
  const content = matter.stringify(`# ${input.title}\n\n${input.body.trim()}${linkLine}`, data);
  fs.writeFileSync(full, content, "utf8");
  return readNote(rel, root);
}

/** Deletes one note. Used when the twin's retention period ends or its data is deleted; a missing file is fine. */
export function deleteNote(relPath: string, root = vaultRoot()) {
  fs.rmSync(resolveInVault(relPath, root), { force: true });
}

export function readNote(relPath: string, root = vaultRoot()): Note {
  const full = resolveInVault(relPath, root);
  const parsed = matter(fs.readFileSync(/*turbopackIgnore: true*/ full, "utf8"));
  const links = [...parsed.content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1].trim());
  return {
    path: relPath.split(path.sep).join("/"),
    title: String(parsed.data.title ?? path.basename(relPath, ".md")),
    folder: relPath.split(path.sep)[0],
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
    links,
    body: parsed.content,
    data: parsed.data,
  };
}

export function listNotes(root = vaultRoot()): string[] {
  if (!fs.existsSync(/*turbopackIgnore: true*/ root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

export interface SearchHit {
  note: Note;
  score: number;
}

// Keyword and tag search. Title and tag matches weigh more than body matches.
export function searchNotes(query: string, limit = 5, root = vaultRoot()): SearchHit[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const rel of listNotes(root)) {
    const note = readNote(rel, root);
    const title = note.title.toLowerCase();
    const tags = note.tags.join(" ").toLowerCase();
    const body = note.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      if (tags.includes(t)) score += 2;
      score += Math.min(body.split(t).length - 1, 5);
    }
    if (score > 0) hits.push({ note, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
