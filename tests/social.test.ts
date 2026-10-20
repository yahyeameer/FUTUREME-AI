import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { chat, compareWithSocial, inProcessBackend, runTool, saveProfile } from "../src/lib/futureme";
import type { ChatMessage, LlmProvider } from "../src/lib/llm";
import { searchMemory } from "../src/lib/memory";
import { mockProvider } from "../src/lib/mock-llm";
import { collectExportFiles, readExports } from "../src/lib/social/extract";
import { disconnect, finishOAuth, startOAuth, syncOAuth } from "../src/lib/social/oauth";
import { parseCsv, parseExport, type ExportFile } from "../src/lib/social/parse";
import { SAMPLE_FILES } from "../src/lib/social/sample";
import { decryptSecret, encryptSecret } from "../src/lib/social/secrets";
import { deleteSource, getPersona, importSocial, searchSocial, socialPromptBlock, sourceRows } from "../src/lib/social/store";
import { bytesSource, type Inflate } from "../src/lib/social/zip";
import { listNotes } from "../src/lib/vault";

let dir: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  db = openDb(":memory:");
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const k of ["VAULT_DIR", "DATABASE_PATH", "FUTUREME_SECRET_KEY", "X_CLIENT_ID", "X_CLIENT_SECRET"]) delete process.env[k];
});

const nodeInflate: Inflate = async (d) => new Uint8Array(zlib.inflateRawSync(d));

/** A minimal ZIP writer for the tests: deflated entries, a central directory, no ZIP64. */
function zip(files: ExportFile[]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const raw = Buffer.from(f.text);
    const data = zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cdBuf, end]));
}

const sample = () => parseExport(SAMPLE_FILES);
const profile = () =>
  saveProfile(db, { name: "Hodan", dream: "Run an AI research lab in Hargeisa.", current: "Developer", style: "direct" });

describe("reading exports", () => {
  it("reads only profile, career and own posts out of a zipped archive", async () => {
    const archive = zip([...SAMPLE_FILES, { name: "twitter/data/direct-messages.js", text: "secret" }, { name: "messages/inbox/a/profile.js", text: "x" }]);
    const { files, skipped } = await collectExportFiles([{ name: "archive.zip", source: bytesSource(archive) }], nodeInflate);
    expect(files.map((f) => f.name.split("/").pop()).sort()).toEqual(
      ["Education.csv", "Positions.csv", "Profile.csv", "Shares.csv", "Skills.csv", "account.js", "profile.js", "tweets.js"].sort(),
    );
    // Both DM files, LinkedIn connections, and a "profile.js" inside a messages folder are never read.
    expect(skipped).toBe(4);
  });

  it("parses LinkedIn and X into one shape, without keeping private fields", () => {
    const [linkedin, x] = sample().sort((a, b) => a.platform.localeCompare(b.platform));
    expect(linkedin.platform).toBe("linkedin");
    expect(linkedin.account.name).toBe("Hodan Warsame");
    expect(linkedin.account.websites).toEqual(["https://hodan.dev"]);
    expect(linkedin.positions[0]).toMatchObject({ title: "Full-Stack Developer", company: "Dahab Pay", start: "2021-10" });
    expect(linkedin.posts[0].text).toContain("Somali-language assistant");
    expect(linkedin.posts[0].text).toContain("\n\nIf you work"); // Line breaks inside a quoted CSV field survive.
    expect(x.account).toMatchObject({ handle: "@hodan_builds", location: "Hargeisa" });
    expect(x.posts[0]).toMatchObject({ date: "2025-09-08", url: "https://x.com/hodan_builds/status/1830000000000000001", likes: 212, reposts: 48 });
    expect(x.posts.find((p) => p.text.startsWith("@amina"))?.reply).toBe(true);
    expect(JSON.stringify([linkedin, x])).not.toContain("not-kept@example.com");
  });

  it("skips reposts of other people and expands shortened links", () => {
    const [x] = parseExport([
      {
        name: "data/tweets.js",
        text: `window.YTD.tweets.part0 = ${JSON.stringify([
          { tweet: { id_str: "1", created_at: "Wed Oct 10 20:19:24 +0000 2018", full_text: "RT @someone: not mine" } },
          { tweet: { id_str: "2", created_at: "Wed Oct 10 20:19:24 +0000 2018", full_text: "Mine &amp; good https://t.co/x", entities: { urls: [{ url: "https://t.co/x", expanded_url: "https://hodan.dev" }] } } },
        ])}`,
      },
    ]);
    expect(x.posts).toEqual([expect.objectContaining({ date: "2018-10-10", text: "Mine & good https://hodan.dev" })]);
  });

  it("reads Facebook's JSON download and repairs its text encoding", () => {
    const mojibake = (s: string) => String.fromCharCode(...Buffer.from(s, "utf8"));
    const [fb] = parseExport([
      {
        name: "your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json",
        text: JSON.stringify([{ timestamp: 1700000000, data: [{ post: mojibake("Café opening in Hargeisa ☕") }] }, { timestamp: 1700000001, data: [] }]),
      },
      {
        name: "personal_information/profile_information/profile_information.json",
        text: JSON.stringify({ profile_v2: { name: { full_name: "Hodan W" }, current_city: { name: "Hargeisa" }, work_experiences: [{ employer: "Dahab Pay", title: "Developer", start_timestamp: 1633046400 }] } }),
      },
    ]);
    expect(fb.platform).toBe("facebook");
    expect(fb.account.name).toBe("Hodan W");
    expect(fb.positions[0]).toMatchObject({ company: "Dahab Pay", start: "2021-10" });
    expect(fb.posts).toEqual([{ date: "2023-11-14", text: "Café opening in Hargeisa ☕" }]);
  });

  it("explains what to do with an HTML Facebook download or a file that isn't an export", async () => {
    const html = zip([{ name: "posts/your_posts_1.html", text: "<html>" }]);
    await expect(readExports([{ name: "fb.zip", source: bytesSource(html) }], nodeInflate)).rejects.toThrow(/JSON format/);
    const other = zip([{ name: "notes.txt", text: "hello" }]);
    await expect(readExports([{ name: "other.zip", source: bytesSource(other) }], nodeInflate)).rejects.toThrow(/No profile or posts/);
  });

  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\n"x, ""y""","line\nbreak"\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "line\nbreak"],
    ]);
  });
});

describe("importing into memory", () => {
  it("needs consent", async () => {
    await expect(importSocial(db, sample()[0], { method: "export", consent: false })).rejects.toThrow(/Agree/);
    expect(sourceRows(db)).toEqual([]);
  });

  it("writes notes, builds a persona and gives it to the future self", async () => {
    for (const imp of sample()) await importSocial(db, imp, { method: "sample", consent: true, provider: mockProvider });
    expect(listNotes().filter((n) => n.startsWith("Social"))).toEqual([
      "Social/linkedin-posts-2024.md",
      "Social/linkedin-posts-2025.md",
      "Social/linkedin-profile.md",
      "Social/persona-from-your-accounts.md",
      "Social/x-posts-2024.md",
      "Social/x-posts-2025.md",
      "Social/x-profile.md",
    ]);
    const persona = getPersona(db)!;
    expect(persona.now).toBe("Full-Stack Developer at Dahab Pay; Volunteer Instructor at Hargeisa Tech Hub");
    expect(persona.topics.map((t) => t.term)).toContain("somali");
    expect(persona.examples.length).toBeGreaterThan(2);
    const block = socialPromptBlock(db)!;
    expect(block).toContain("LinkedIn, X");
    expect(block).toContain("- Now: Full-Stack Developer at Dahab Pay");

    // The future self is told, and its usual memory search finds the imported notes too.
    profile();
    let system = "";
    const spy: LlmProvider = { name: "spy", complete: async (m: ChatMessage[], t) => ((system ||= String(m[0].content)), mockProvider.complete(m, t)) };
    await chat(db, "What do I usually write about?", inProcessBackend(spy));
    expect(system).toContain("What their own accounts say about them");
    expect(searchMemory(db, "reconciliation").map((h) => h.note.path)).toContain("Social/linkedin-posts-2024.md");
  });

  it("answers search_social and get_persona with sources", async () => {
    for (const imp of sample()) await importSocial(db, imp, { method: "sample", consent: true, provider: mockProvider });
    const farmers = await runTool(db, "search_social", JSON.stringify({ query: "farmers SMS crop prices" }));
    expect(farmers.output).toMatch(/^\[(X|LinkedIn) post · 2025-09-/);
    expect(farmers.citations).toContain("Social/x-posts-2025.md");
    const onlyLinkedIn = searchSocial(db, "workshop students", { platform: "linkedin" });
    expect(onlyLinkedIn.every((h) => h.platform === "linkedin")).toBe(true);
    expect(onlyLinkedIn.some((h) => h.text.includes("14 students"))).toBe(true);
    expect((await runTool(db, "get_persona", "{}")).output).toContain("## How you write");
  });

  it("replaces a platform's notes on re-import and deletes them with the source", async () => {
    const [linkedin, x] = sample().sort((a, b) => a.platform.localeCompare(b.platform));
    await importSocial(db, linkedin, { method: "export", consent: true, provider: mockProvider });
    await importSocial(db, x, { method: "export", consent: true, provider: mockProvider });
    await importSocial(db, { ...linkedin, posts: linkedin.posts.filter((p) => p.date?.startsWith("2025")) }, { method: "export", consent: true, provider: mockProvider });
    expect(listNotes()).not.toContain("Social/linkedin-posts-2024.md");
    await deleteSource(db, "linkedin", mockProvider);
    expect(listNotes().filter((n) => n.startsWith("Social/linkedin"))).toEqual([]);
    expect(getPersona(db)?.sources).toEqual(["x"]);
    await deleteSource(db, "x", mockProvider);
    expect(listNotes().filter((n) => n.startsWith("Social"))).toEqual([]);
    expect(getPersona(db)).toBeNull();
  });

  it("compares answers with and without the imported accounts", async () => {
    profile();
    await expect(compareWithSocial(db, "What should I focus on?", mockProvider)).rejects.toThrow(/Import an account/);
    for (const imp of sample()) await importSocial(db, imp, { method: "sample", consent: true, provider: mockProvider });
    const c = await compareWithSocial(db, "What should I focus on?", mockProvider);
    expect(c.without).not.toContain("Dahab Pay");
    expect(c.with).toContain("Dahab Pay");
    expect(db.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({ n: 0 });
  });
});

describe("tokens and OAuth", () => {
  it("encrypts secrets with a key that never enters the database", () => {
    const sealed = encryptSecret("token-123");
    expect(sealed).not.toContain("token-123");
    expect(decryptSecret(sealed)).toBe("token-123");
    expect(decryptSecret(sealed.slice(0, -2) + "AA")).toBeNull();
    const keyFile = path.join(dir, "secret.key");
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    process.env.FUTUREME_SECRET_KEY = "a different key";
    expect(decryptSecret(sealed)).toBeNull(); // Changing the key means reconnecting, not leaking.
  });

  it("connects X with PKCE, stores the token encrypted, and revokes it on disconnect", async () => {
    expect(() => startOAuth(db, "x", "http://localhost:3000", true)).toThrow(/isn't set up/);
    process.env.X_CLIENT_ID = "client";
    expect(() => startOAuth(db, "x", "http://localhost:3000", false)).toThrow(/Agree/);
    const url = new URL(startOAuth(db, "x", "http://localhost:3000", true));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/connections/oauth/x/callback");
    const state = url.searchParams.get("state")!;

    const calls: string[] = [];
    const http = (async (input: string | URL, init?: RequestInit) => {
      const u = String(input);
      calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]}`);
      if (u.endsWith("/oauth2/token")) return Response.json({ access_token: "AT-secret", refresh_token: "RT-secret", expires_in: 7200 });
      if (u.includes("/users/me")) return Response.json({ data: { id: "42", name: "Hodan", username: "hodan_builds", description: "Builder" } });
      if (u.includes("/tweets")) return Response.json({ data: [{ id: "9", text: "Hello from the API", created_at: "2026-10-01T10:00:00.000Z", public_metrics: { like_count: 3 } }] });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const result = await finishOAuth(db, "x", { code: "abc", state }, "http://localhost:3000", { http, provider: mockProvider });
    expect(result.posts).toBe(1);
    const row = db.prepare("SELECT secret FROM social_tokens WHERE platform = 'x'").get() as { secret: string };
    expect(row.secret).not.toContain("AT-secret");
    expect(sourceRows(db)[0]).toMatchObject({ platform: "x", method: "oauth", account: "@hodan_builds" });
    // The same state can't be used twice.
    await expect(finishOAuth(db, "x", { code: "abc", state }, "http://localhost:3000", { http })).rejects.toThrow(/expired/);

    await syncOAuth(db, "x", { http, provider: mockProvider });
    await disconnect(db, "x", { http });
    expect(calls).toContain("POST https://api.x.com/2/oauth2/revoke");
    expect(db.prepare("SELECT COUNT(*) AS n FROM social_tokens").get()).toEqual({ n: 0 });
    expect(sourceRows(db)).toHaveLength(1); // Disconnecting keeps what was imported until it's deleted.
  });
});
