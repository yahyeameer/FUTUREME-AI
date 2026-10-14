import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listNotes, readNote, resolveInVault, searchNotes, slugify, writeNote } from "../src/lib/vault";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("vault", () => {
  it("writes an Obsidian-style note with frontmatter and wiki-links", () => {
    const note = writeNote(
      { folder: "Goals", title: "Lead an AI lab", body: "Within 10 years.", tags: ["career"], links: ["Values"] },
      root,
    );
    expect(note.path).toBe("Goals/lead-an-ai-lab.md");
    expect(note.tags).toEqual(["career"]);
    expect(note.links).toEqual(["Values"]);
    const raw = fs.readFileSync(path.join(root, note.path), "utf8");
    expect(raw).toMatch(/^---\ntitle: Lead an AI lab/);
    expect(raw).toContain("[[Values]]");
  });

  it("finds notes by keyword, ranking title matches first", () => {
    writeNote({ folder: "Goals", title: "Run a marathon", body: "Train three times a week." }, root);
    writeNote({ folder: "Reflections", title: "Morning", body: "Thought about the marathon briefly." }, root);
    const hits = searchNotes("marathon", 5, root);
    expect(hits.map((h) => h.note.title)).toEqual(["Run a marathon", "Morning"]);
  });

  it("refuses paths outside the vault", () => {
    expect(() => resolveInVault("../secrets.md", root)).toThrow(/escapes vault/);
    expect(() => readNote("../../etc/passwd", root)).toThrow(/escapes vault/);
  });

  it("slugifies titles safely", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("***")).toBe("untitled");
    expect(listNotes(path.join(root, "missing"))).toEqual([]);
  });
});
