import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = async (code: string, ip: string, next = "/roadmap") => {
  const { POST } = await import("../src/app/api/login/route");
  const body = new FormData();
  body.set("code", code);
  body.set("next", next);
  return POST(new Request("http://localhost:3000/api/login", { method: "POST", body, headers: { "x-forwarded-for": ip } }));
};

beforeEach(() => {
  vi.resetModules();
  process.env.FUTUREME_ACCESS_CODE = "open sesame";
});
afterEach(() => {
  delete process.env.FUTUREME_ACCESS_CODE;
});

describe("sign in", () => {
  it("redirects to a path on the public host, not the server's internal one", async () => {
    const ok = await post("open sesame", "1.1.1.1");
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/roadmap");
    expect(ok.headers.get("set-cookie")).toMatch(/^futureme_access=/);
    expect((await post("nope", "1.1.1.1")).headers.get("location")).toBe("/login?error=wrong&next=%2Froadmap");
  });

  it("slows wrong codes from one address and across addresses, so a spoofed X-Forwarded-For doesn't help", async () => {
    for (let i = 0; i < 5; i++) await post("nope", "2.2.2.2");
    expect((await post("open sesame", "2.2.2.2")).headers.get("location")).toMatch(/error=wait/);
    for (let i = 0; i < 45; i++) await post("nope", `10.0.0.${i}`);
    const spoofed = await post("open sesame", "10.9.9.9");
    expect(spoofed.headers.get("location")).toMatch(/error=wait/);
    expect(spoofed.headers.get("set-cookie")).toBeNull();
  });
});
