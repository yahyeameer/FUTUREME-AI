import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  delete process.env.WEB_SEARCH;
  delete process.env.YDC_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.YDC_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe("search provider choice", () => {
  it("prefers You.com, then Brave, then DuckDuckGo, and honours WEB_SEARCH=off", async () => {
    const { searchProvider } = await import("../src/lib/web");
    expect(searchProvider()).toBe("duckduckgo");
    process.env.BRAVE_SEARCH_API_KEY = "b";
    expect(searchProvider()).toBe("brave");
    process.env.YDC_API_KEY = "y";
    expect(searchProvider()).toBe("you");
    process.env.WEB_SEARCH = "off";
    expect(searchProvider()).toBe("off");
  });
});

describe("You.com search", () => {
  it("reads web hits, falls back to snippets, and drops hits without a url", async () => {
    const { parseYouSearch } = await import("../src/lib/web");
    const out = parseYouSearch({
      results: {
        web: [
          { url: "https://a.example/x", title: "A <b>bold</b> title", description: "About A", snippets: ["ignored"] },
          { url: "https://b.example/y", title: "B", snippets: ["B snippet one", "two"] },
          { title: "no url" },
        ],
      },
    });
    expect(out).toEqual([
      { title: "A bold title", url: "https://a.example/x", snippet: "About A" },
      { title: "B", url: "https://b.example/y", snippet: "B snippet one" },
    ]);
    expect(parseYouSearch({ hits: [{ url: "https://c.example", title: "C", description: "old shape" }] })).toHaveLength(1);
    expect(parseYouSearch(null)).toEqual([]);
    expect(parseYouSearch({ results: { web: "nope" } })).toEqual([]);
  });

  it("calls the API with the key in both header styles and returns de-duplicated results", async () => {
    process.env.YDC_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      Response.json({ results: { web: [{ url: "https://a.example", title: "A", description: "a" }, { url: "https://a.example", title: "A again", description: "dup" }] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { webSearch } = await import("../src/lib/web");
    expect(await webSearch("somaliland ai courses", 5)).toEqual([{ title: "A", url: "https://a.example", snippet: "a" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.you.com/v1/search");
    expect(url).toContain("query=somaliland%20ai%20courses");
    expect(init.headers).toMatchObject({ "X-API-Key": "test-key", Authorization: "Bearer test-key" });
  });

  it("reports a failed call instead of returning nothing silently", async () => {
    process.env.YDC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const { webSearch } = await import("../src/lib/web");
    await expect(webSearch("x")).rejects.toThrow(/You\.com Search returned 401/);
  });
});
