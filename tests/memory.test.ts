import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localTables } from "../src/lib/cloud/sync";
import { openDb, type Db } from "../src/lib/db";
import { chat, inProcessBackend, runTool, saveProfile } from "../src/lib/futureme";
import { listFiles, readFile, rememberConversation, saveFile, searchMemory, syncMemoryIndex } from "../src/lib/memory";
import { mockProvider } from "../src/lib/mock-llm";
import { readNote, writeNote } from "../src/lib/vault";

let dir: string;
let root: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-"));
  root = path.join(dir, "vault");
  process.env.VAULT_DIR = root;
  db = openDb(":memory:");
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.VAULT_DIR;
});

const paths = (hits: { note: { path: string } }[]) => hits.map((h) => h.note.path);

describe("memory index", () => {
  it("indexes the vault in the database and ranks title matches first", () => {
    writeNote({ folder: "Goals", title: "Run a marathon", body: "Train three times a week." });
    writeNote({ folder: "Reflections", title: "Morning", body: "Thought about the marathon briefly." });
    expect(paths(searchMemory(db, "marathon"))).toEqual(["Goals/run-a-marathon.md", "Reflections/morning.md"]);
    expect(db.prepare("SELECT title, folder FROM notes ORDER BY path").all()).toEqual([
      { title: "Run a marathon", folder: "Goals" },
      { title: "Morning", folder: "Reflections" },
    ]);
  });

  it("sees notes written or deleted in Obsidian, outside TOMORA's folders too", () => {
    expect(searchMemory(db, "sourdough")).toEqual([]);
    fs.mkdirSync(path.join(root, "Kitchen"), { recursive: true });
    fs.writeFileSync(path.join(root, "Kitchen", "bread.md"), "# Bread\n\nMy sourdough starter is called Bilal.\n");
    expect(paths(searchMemory(db, "sourdough starter"))).toEqual(["Kitchen/bread.md"]);

    fs.rmSync(path.join(root, "Kitchen", "bread.md"));
    expect(searchMemory(db, "sourdough")).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notes").get()).toEqual({ n: 0 });
  });

  it("matches word stems and only re-reads notes that changed", () => {
    writeNote({ folder: "Goals", title: "Learn to swim", body: "Swimming lessons on Saturdays." });
    expect(paths(searchMemory(db, "lesson"))).toEqual(["Goals/learn-to-swim.md"]);
    expect(syncMemoryIndex(db, root)).toBe(0);
  });

  it("rebuilds the full-text index when the notes table was restored without it", () => {
    writeNote({ folder: "Goals", title: "Open a bakery", body: "In Hargeisa." });
    syncMemoryIndex(db, root);
    db.prepare("DELETE FROM notes_fts").run();
    expect(paths(searchMemory(db, "bakery"))).toEqual(["Goals/open-a-bakery.md"]);
  });

  it("keeps the full-text index out of the cloud copy", () => {
    const names = localTables(db).map((t) => t.name);
    expect(names).toContain("notes");
    expect(names.filter((n) => n.startsWith("notes_fts"))).toEqual([]);
  });
});

describe("conversations", () => {
  it("appends every exchange to the day's note", () => {
    const at = new Date("2026-10-16T07:30:00Z");
    rememberConversation("I want to learn Arabic", "Start with ten words a day.", at);
    rememberConversation("Which words?", "Greetings first.", new Date("2026-10-16T08:05:00Z"));
    const note = readNote("Conversations/conversation-2026-10-16.md");
    expect(note.title).toBe("Conversation 2026-10-16");
    expect(note.body).toContain("## 07:30 UTC\n\n**Me:** I want to learn Arabic\n\n**Future me:** Start with ten words a day.");
    expect(note.body).toContain("## 08:05 UTC\n\n**Me:** Which words?");
    expect(paths(searchMemory(db, "arabic"))).toEqual(["Conversations/conversation-2026-10-16.md"]);
  });

  it("saves chats with the future self, so later turns can find them", async () => {
    saveProfile(db, { name: "Amina", dream: "Lead an AI lab", style: "direct" });
    await chat(db, "My sister Hodan is starting university", inProcessBackend(mockProvider));
    expect(paths(searchMemory(db, "Hodan university"))[0]).toMatch(/^Conversations\/conversation-\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe("agent files", () => {
  it("saves, lists and reads files in the Files folder", () => {
    expect(saveFile("Reading list", "- Atomic Habits")).toBe("Files/Reading-list.md");
    expect(saveFile("budget.csv", "item,cost\nlaptop,900")).toBe("Files/budget.csv");
    expect(listFiles("Files")).toEqual(["Files/Reading-list.md", "Files/budget.csv"]);
    expect(readFile("Files/budget.csv").content).toBe("item,cost\nlaptop,900");
    expect(readNote("Files/Reading-list.md").data.evidence).toBe("ai-inferred");
    expect(paths(searchMemory(db, "laptop"))).toEqual(["Files/budget.csv"]);
  });

  it("refuses other file types and paths outside the vault", () => {
    expect(() => saveFile("run.sh", "rm -rf /")).toThrow(/Files can be/);
    expect(saveFile("../../escape.md", "x")).toBe("Files/escape.md");
    expect(() => readFile("../secret.md")).toThrow(/escapes vault/);
    expect(() => readFile("Files/missing.md")).toThrow(/No file/);
  });

  it("is reachable through the agent's tools", async () => {
    expect((await runTool(db, "save_file", JSON.stringify({ name: "plan.md", content: "Step one" }))).output).toBe("Saved Files/plan.md.");
    expect((await runTool(db, "list_files", JSON.stringify({ folder: "Files" }))).output).toBe("Files/plan.md");
    expect((await runTool(db, "read_file", JSON.stringify({ path: "Files/plan.md" }))).output).toContain("Step one");
    expect((await runTool(db, "read_file", JSON.stringify({ path: "/etc/passwd.md" }))).output).toMatch(/^Error:/);
  });
});
