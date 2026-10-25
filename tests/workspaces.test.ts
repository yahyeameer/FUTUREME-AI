import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;
const A = "a".repeat(32);
const B = "b".repeat(32);

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-ws-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.FUTUREME_MULTI_USER = "1";
  process.env.FUTUREME_ACCESS_CODE = "open sesame";
});
afterEach(() => {
  for (const k of ["DATABASE_PATH", "VAULT_DIR", "FUTUREME_MULTI_USER", "FUTUREME_ACCESS_CODE", "FUTUREME_SHOW_CODE"]) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("workspace ids", () => {
  it("accepts only 32 hex characters, so an id can never walk out of its folder", async () => {
    const { isWorkspaceId, newWorkspaceId, cookieValue } = await import("../src/lib/workspace-id");
    expect(isWorkspaceId(newWorkspaceId())).toBe(true);
    expect(newWorkspaceId()).not.toBe(newWorkspaceId());
    for (const bad of ["", "../../etc", `${A}/..`, A.toUpperCase(), A.slice(1), `${A}0`, null, undefined, 5]) expect(isWorkspaceId(bad)).toBe(false);
    expect(cookieValue("a=1; futureme_ws=abc; b=2", "futureme_ws")).toBe("abc");
    expect(cookieValue(undefined, "futureme_ws")).toBeNull();
  });
});

describe("isolated workspaces", () => {
  it("gives each workspace its own vault, database and key folder", async () => {
    const { runInWorkspace, currentWorkspace, dataDir, workspaceDbFile } = await import("../src/lib/tenant");
    const { vaultRoot } = await import("../src/lib/vault");
    const inA = runInWorkspace(A, () => ({ ws: currentWorkspace(), vault: vaultRoot(), data: dataDir(), db: workspaceDbFile() }));
    const inB = runInWorkspace(B, () => ({ ws: currentWorkspace(), vault: vaultRoot(), data: dataDir(), db: workspaceDbFile() }));
    expect(inA.ws).toBe(A);
    expect(inB.ws).toBe(B);
    expect(inA.vault).toBe(path.join(dir, "workspaces", A, "vault"));
    expect(inB.vault).toBe(path.join(dir, "workspaces", B, "vault"));
    expect(inA.db).toBe(path.join(dir, "workspaces", A, "futureme.db"));
    expect(inA.data).not.toBe(inB.data);
  });

  it("keeps the context across awaits, so streamed and long-running work stays in its workspace", async () => {
    const { runInWorkspace, currentWorkspace } = await import("../src/lib/tenant");
    const seen = await Promise.all(
      [A, B].map((id) =>
        runInWorkspace(id, async () => {
          await new Promise((r) => setTimeout(r, id === A ? 20 : 1));
          return currentWorkspace();
        }),
      ),
    );
    expect(seen).toEqual([A, B]);
  });

  it("falls back to the default data outside a workspace, with a bad id, or when multi-user mode is off", async () => {
    const { runInWorkspace, currentWorkspace } = await import("../src/lib/tenant");
    const { vaultRoot } = await import("../src/lib/vault");
    expect(currentWorkspace()).toBeNull();
    expect(vaultRoot()).toBe(path.resolve(dir, "vault"));
    expect(runInWorkspace("../../evil", () => currentWorkspace())).toBeNull();
    delete process.env.FUTUREME_MULTI_USER;
    expect(runInWorkspace(A, () => currentWorkspace())).toBeNull();
    expect(runInWorkspace(A, () => vaultRoot())).toBe(path.resolve(dir, "vault"));
  });

  it("writes notes and rows for one workspace that the other never sees", async () => {
    const { runInWorkspace } = await import("../src/lib/tenant");
    const { openDb } = await import("../src/lib/db");
    const { workspaceDbFile } = await import("../src/lib/tenant");
    const { writeNote, listNotes } = await import("../src/lib/vault");
    runInWorkspace(A, () => writeNote({ title: "Only mine", body: "private", folder: "Reflections" }));
    expect(runInWorkspace(A, () => listNotes())).toEqual([expect.stringContaining("only-mine")]);
    expect(runInWorkspace(B, () => listNotes())).toEqual([]);
    const dbA = openDb(runInWorkspace(A, () => workspaceDbFile()));
    const dbB = openDb(runInWorkspace(B, () => workspaceDbFile()));
    dbA.prepare("INSERT INTO settings (key, value) VALUES ('x', 'a')").run();
    expect(dbB.prepare("SELECT value FROM settings WHERE key = 'x'").get()).toBeUndefined();
    dbA.close();
    dbB.close();
  });
});

describe("sign-in in multi-user mode", () => {
  const post = async (fields: Record<string, string>) => {
    const { POST } = await import("../src/app/api/login/route");
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return POST(new Request("http://localhost:3000/api/login", { method: "POST", body, headers: { "x-forwarded-for": "9.9.9.9" } }));
  };

  it("hands out the access cookie and a new private workspace", async () => {
    const res = await post({ code: "open sesame" });
    const cookies = res.headers.getSetCookie();
    expect(cookies[0]).toMatch(/^futureme_access=/);
    expect(cookies[1]).toMatch(/^futureme_ws=[a-f0-9]{32};/);
    expect(cookies[1]).toMatch(/HttpOnly/);
    const second = (await post({ code: "open sesame" })).headers.getSetCookie()[1];
    expect(second).not.toBe(cookies[1]);
  });

  it("reopens an existing workspace from its code, and ignores a malformed one", async () => {
    expect((await post({ code: "open sesame", workspace: A })).headers.getSetCookie()[1]).toMatch(new RegExp(`^futureme_ws=${A};`));
    expect((await post({ code: "open sesame", workspace: "../../x" })).headers.getSetCookie()[1]).toMatch(/^futureme_ws=[a-f0-9]{32};/);
  });

  it("gives no workspace for a wrong code", async () => {
    const res = await post({ code: "nope" });
    expect(res.headers.get("location")).toMatch(/error=wrong/);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sets no workspace cookie when multi-user mode is off", async () => {
    delete process.env.FUTUREME_MULTI_USER;
    expect((await post({ code: "open sesame" })).headers.getSetCookie()).toHaveLength(1);
  });
});

describe("the proxy in multi-user mode", () => {
  const run = async (cookie: string, pathname = "/roadmap") => {
    const { proxy } = await import("../src/proxy");
    return proxy(new NextRequest(`http://localhost:3000${pathname}`, { headers: { cookie } }));
  };
  const access = async () => {
    const { ACCESS_COOKIE, accessToken } = await import("../src/lib/access");
    return `${ACCESS_COOKIE}=${accessToken("open sesame")}`;
  };

  it("needs both cookies", async () => {
    expect((await run(`${await access()}; futureme_ws=${A}`)).headers.get("x-middleware-next")).toBe("1");
    expect((await run(await access())).headers.get("location")).toMatch(/\/login\?next=%2Froadmap$/);
    expect((await run(`futureme_ws=${A}`)).headers.get("location")).toMatch(/\/login/);
    expect((await run(`${await access()}; futureme_ws=not-an-id`)).status).toBe(307);
  });

  it("still lets the sign-in page through and answers APIs with 401", async () => {
    expect((await run("", "/login")).headers.get("x-middleware-next")).toBe("1");
    expect((await run("", "/api/workspace")).status).toBe(401);
  });

  it("needs only the access cookie when multi-user mode is off", async () => {
    delete process.env.FUTUREME_MULTI_USER;
    expect((await run(await access())).headers.get("x-middleware-next")).toBe("1");
  });
});
