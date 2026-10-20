import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { ALL_TOOLS } from "../src/lib/futureme";
import { mockProvider } from "../src/lib/mock-llm";
import { apifyRunner, apifyStatus, FETCHERS, mcpRunner, parseTarget, removeApifyKey, restRunner, saveApifyKey, type ApifyRunner, type McpCaller } from "../src/lib/social/apify";
import { checkClaim, claims, CODE_TTL_MS, importClaim, MAX_CHECKS, startClaim } from "../src/lib/social/claims";
import { deleteSource, getPersona, sourceRows } from "../src/lib/social/store";

let dir: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-fetch-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  db = openDb(":memory:");
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
  for (const k of ["VAULT_DIR", "DATABASE_PATH"]) delete process.env[k];
});

/** An Instagram profile as apify/instagram-profile-scraper returns it. */
const instagram = (bio: string, extra: Record<string, unknown> = {}) => [
  {
    username: "hodan.builds",
    fullName: "Hodan Warsame",
    biography: bio,
    externalUrl: "https://hodan.dev",
    private: false,
    latestPosts: [
      { caption: "Shipped offline payments for Dahab Pay today. Boring tools win again.", timestamp: "2026-09-02T10:00:00.000Z", url: "https://www.instagram.com/p/1/", likesCount: 120 },
      { caption: "Teaching my cousins Python on Saturdays. Week 6: they built a budget app!", timestamp: "2026-08-20T10:00:00.000Z", url: "https://www.instagram.com/p/2/", likesCount: 80 },
    ],
    ...extra,
  },
];

/** A runner that returns fixed items and records what it was asked to run. */
function fakeRunner(items: (actor: string) => unknown[]): ApifyRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    transport: "mcp",
    calls,
    async run(actor) {
      calls.push(actor);
      return items(actor);
    },
  };
}

describe("which account", () => {
  it("accepts handles and profile links, and refuses other sites and personal Facebook profiles", () => {
    expect(parseTarget("instagram", "@hodan.builds").handle).toBe("hodan.builds");
    expect(parseTarget("instagram", "https://www.instagram.com/hodan.builds/").handle).toBe("hodan.builds");
    expect(parseTarget("x", "twitter.com/hodan_w").url).toBe("https://x.com/hodan_w");
    expect(parseTarget("linkedin", "https://www.linkedin.com/in/hodan-warsame/").handle).toBe("hodan-warsame");
    expect(parseTarget("youtube", "https://youtube.com/@hodanbuilds").url).toBe("https://www.youtube.com/@hodanbuilds");
    expect(parseTarget("tiktok", "https://www.tiktok.com/@hodan.builds").handle).toBe("hodan.builds");
    expect(() => parseTarget("instagram", "https://evil.example/hodan")).toThrow(/isn't a Instagram link/);
    expect(() => parseTarget("x", "this handle is far too long")).toThrow(/username/);
    expect(() => parseTarget("linkedin", "https://www.linkedin.com/company/dahab")).toThrow(/\/in\//);
    expect(() => parseTarget("facebook", "https://www.facebook.com/profile.php?id=1000")).toThrow(/Pages/);
  });
});

describe("ownership check", () => {
  it("keeps nothing until the code is on the account, then imports it without the code", async () => {
    const claim = startClaim(db, "instagram", "@hodan.builds", true);
    expect(claim.code).toMatch(/^FM-[A-Z2-9]{6}$/);
    expect(claim.where).toMatch(/bio/);

    // Someone else's account, or the owner hasn't added the code yet: refused, and nothing is stored.
    let bio = "Payments engineer in Hargeisa.";
    const runner = fakeRunner(() => instagram(bio));
    const miss = await checkClaim(db, claim.id, runner);
    expect(miss.verified).toBe(false);
    expect(miss.verified ? "" : miss.reason).toMatch(/wasn't found.*Nothing was kept/);
    expect(miss.claim.ready).toBeNull();
    expect(db.prepare("SELECT data FROM social_claims").get()).toEqual({ data: null });
    await expect(importClaim(db, claim.id, true, mockProvider)).rejects.toThrow(/Verify/);

    bio = `Payments engineer in Hargeisa. ${claim.code.toLowerCase()}`;
    const hit = await checkClaim(db, claim.id, runner);
    expect(hit.verified).toBe(true);
    expect(hit.claim.ready).toMatchObject({ posts: 2, name: "Hodan Warsame" });

    const result = await importClaim(db, claim.id, true, mockProvider);
    expect(result.posts).toBe(2);
    const [row] = sourceRows(db);
    expect(row.method).toBe("apify");
    expect(row.data.account.bio).toBe("Payments engineer in Hargeisa.");
    expect(JSON.stringify(row.data)).not.toContain(claim.code);
    expect(getPersona(db)?.sources).toEqual(["instagram"]);
    // Imported once: the fetched copy is gone from the claim.
    await expect(importClaim(db, claim.id, true, mockProvider)).rejects.toThrow(/Verify/);

    await deleteSource(db, "instagram", mockProvider);
    expect(claims(db)).toEqual([]);
  });

  it("limits checks, expires codes, refuses private accounts and other people's posts", async () => {
    const claim = startClaim(db, "instagram", "hodan.builds", true);
    const runner = fakeRunner(() => instagram("no code here"));
    for (let i = 0; i < MAX_CHECKS; i++) expect((await checkClaim(db, claim.id, runner)).verified).toBe(false);
    await expect(checkClaim(db, claim.id, runner)).rejects.toThrow(/too many times/);

    const again = startClaim(db, "instagram", "hodan.builds", true);
    const priv = await checkClaim(db, again.id, fakeRunner(() => instagram(again.code, { private: true })));
    expect(priv.verified ? "" : priv.reason).toMatch(/private/);

    // The scraper returned a different account than the one named: treated as not found.
    const other = await checkClaim(db, again.id, fakeRunner(() => instagram(again.code, { username: "someone.else" })));
    expect(other.verified).toBe(false);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + CODE_TTL_MS + 1000);
    await expect(checkClaim(db, again.id, runner)).rejects.toThrow(/expired/);
    expect(claims(db)).toEqual([]);
  });

  it("needs consent, and caps how many accounts can be tried a day", () => {
    expect(() => startClaim(db, "x", "hodan_w", false)).toThrow(/Agree/);
    for (let i = 0; i < 5; i++) startClaim(db, "x", `hodan_${i}`, true);
    expect(() => startClaim(db, "x", "hodan_w", true)).toThrow(/Too many/);
    expect(claims(db)).toHaveLength(1);
  });

  it("only fetches LinkedIn posts after the profile is verified", async () => {
    const claim = startClaim(db, "linkedin", "linkedin.com/in/hodan-warsame", true);
    let headline = "Payments engineer";
    const runner = fakeRunner((actor) =>
      actor === FETCHERS.linkedin.profile.id
        ? [
            {
              publicIdentifier: "hodan-warsame",
              firstName: "Hodan",
              lastName: "Warsame",
              headline,
              about: "I build payment rails.",
              location: { linkedinText: "Hargeisa" },
              experience: [{ position: "Senior Engineer", companyName: "Dahab Pay", startDate: { text: "Mar 2023" }, endDate: { text: "Present" } }],
              education: [{ schoolName: "University of Hargeisa", degree: "BSc", fieldOfStudy: "Computer Science", endDate: { text: "2019" } }],
              skills: [{ name: "Go" }, { name: "PostgreSQL" }],
              languages: [{ name: "Somali", proficiency: "Native" }],
            },
          ]
        : [{ content: "We cut payment failures by 40% this quarter.", postedAt: { date: "2026-09-10 08:00" }, linkedinUrl: "https://www.linkedin.com/posts/1", engagement: { likes: 300 } }],
    );
    await checkClaim(db, claim.id, runner);
    expect(runner.calls).toEqual([FETCHERS.linkedin.profile.id]);

    headline = `Payments engineer · ${claim.code}`;
    const hit = await checkClaim(db, claim.id, runner);
    expect(hit.verified).toBe(true);
    expect(runner.calls.slice(1)).toEqual([FETCHERS.linkedin.profile.id, FETCHERS.linkedin.more!.id]);
    await importClaim(db, claim.id, true, mockProvider);
    const [row] = sourceRows(db);
    expect(row.data.account.headline).toBe("Payments engineer ·");
    expect(row.data.positions[0]).toMatchObject({ title: "Senior Engineer", company: "Dahab Pay", start: "2023-03" });
    expect(row.data.positions[0].end).toBeUndefined();
    expect(row.data.languages).toEqual(["Somali (Native)"]);
    expect(row.data.posts[0]).toMatchObject({ date: "2026-09-10", likes: 300 });
  });

  it("keeps only the account's own posts from the X search", () => {
    const t = parseTarget("x", "@hodan_w");
    const out = FETCHERS.x.profile.map(
      [
        { text: "Boring tools win.", createdAt: "Wed Sep 03 10:00:00 +0000 2026", url: "https://x.com/hodan_w/status/1", likeCount: 4, author: { userName: "hodan_w", name: "Hodan", description: "bio" } },
        { text: "@hodan_w you're wrong", createdAt: "Wed Sep 03 11:00:00 +0000 2026", author: { userName: "troll" } },
        { text: "RT something", isRetweet: true, author: { userName: "hodan_w" } },
      ],
      t,
    );
    expect(out.import.posts.map((p) => p.text)).toEqual(["Boring tools win."]);
    expect(out.import.posts[0].date).toBe("2026-09-03");
  });
});

describe("Apify transport", () => {
  it("runs an actor over MCP: call-actor, polls the run, reads the dataset", async () => {
    const calls: string[] = [];
    let polls = 0;
    const client: McpCaller = {
      async callTool({ name, arguments: args }) {
        calls.push(name);
        if (name === "call-actor") {
          expect(args).toMatchObject({ actor: "apify/instagram-profile-scraper", waitSecs: 45, callOptions: { maxItems: 1, maxTotalChargeUsd: 0.25 } });
          return { content: [{ type: "text", text: JSON.stringify({ runId: "r1", status: "RUNNING" }) }] };
        }
        if (name === "get-actor-run") return { structuredContent: { runId: "r1", status: ++polls < 2 ? "RUNNING" : "SUCCEEDED", storages: { datasets: { default: { id: "d1" } } } } };
        expect(args).toMatchObject({ datasetId: "d1" });
        return { structuredContent: { datasetId: "d1", items: [{ username: "x" }], itemCount: 1 } };
      },
      close: async () => undefined,
    };
    const runner = mcpRunner("t", async () => client, 1);
    expect(await runner.run("apify/instagram-profile-scraper", {}, FETCHERS.instagram.profile.limits)).toEqual([{ username: "x" }]);
    expect(calls).toEqual(["call-actor", "get-actor-run", "get-actor-run", "get-dataset-items"]);
  });

  it("reports a failed run, and the REST fallback sends the token in a header", async () => {
    const failing: McpCaller = { callTool: async () => ({ structuredContent: { runId: "r", status: "FAILED" } }), close: async () => undefined };
    await expect(mcpRunner("t", async () => failing).run("a/b", {}, FETCHERS.x.profile.limits)).rejects.toThrow(/failed/);

    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toMatch(/^https:\/\/api\.apify\.com\/v2\/acts\/apidojo~tweet-scraper\/run-sync-get-dataset-items\?.*maxTotalChargeUsd=0\.25/);
      expect(String(url)).not.toContain("token=");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
      return Response.json([{ id: 1 }]);
    });
    expect(await restRunner("secret", http as typeof fetch).run("apidojo/tweet-scraper", {}, FETCHERS.x.profile.limits)).toEqual([{ id: 1 }]);
  });

  it("takes an Apify key pasted on the page, checks it with Apify and stores it encrypted", async () => {
    const key = "apify_api_" + "a".repeat(36);
    const refused = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(saveApifyKey(db, key, refused as unknown as typeof fetch)).rejects.toThrow(/didn't accept/);
    await expect(saveApifyKey(db, "nope", refused as unknown as typeof fetch)).rejects.toThrow(/doesn't look like/);
    expect(apifyStatus(db).configured).toBe(false);
    expect(apifyRunner(db)).toBeNull();

    const ok = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${key}`);
      return Response.json({ data: { username: "hodan" } });
    });
    expect(await saveApifyKey(db, key, ok as unknown as typeof fetch)).toBe("hodan");
    expect(apifyStatus(db)).toEqual({ configured: true, source: "saved", account: "hodan" });
    expect(apifyRunner(db)?.transport).toBe("mcp");
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'apify_token'").get() as { value: string };
    expect(stored.value).not.toContain(key);
    removeApifyKey(db);
    expect(apifyStatus(db).configured).toBe(false);
  });

  it("gives the agent no way to fetch other people's profiles", () => {
    const names = ALL_TOOLS.map((t) => t.function.name);
    expect(names.some((n) => /apify|scrape|fetch_profile|claim/.test(n))).toBe(false);
  });
});
