import type { CloudStore, Row, Value } from "./store";

// Supabase through its REST APIs (PostgREST for tables, Storage for files), so no SDK is needed.
// The secret key bypasses row level security; it must only ever be used on the server.

const PAGE = 1000;

export function supabaseStore(opts: { url: string; key: string; bucket: string; fetch?: typeof fetch }): CloudStore {
  const base = opts.url.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const headers: Record<string, string> = { apikey: opts.key };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only go in apikey.
  if (opts.key.startsWith("eyJ")) headers.Authorization = `Bearer ${opts.key}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await doFetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
    if (!res.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res;
  }
  const objectPath = (p: string) => `/storage/v1/object/${encodeURIComponent(opts.bucket)}/${p.split("/").map(encodeURIComponent).join("/")}`;
  const quote = (v: Value) => (v === null ? "null" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

  return {
    name: "supabase",

    async tables() {
      const spec = (await (await call("/rest/v1/", { headers: { Accept: "application/openapi+json" } })).json()) as {
        definitions?: Record<string, { properties?: Record<string, unknown> }>;
      };
      return new Map(Object.entries(spec.definitions ?? {}).map(([name, def]) => [name, Object.keys(def.properties ?? {})]));
    },

    async select(table, key) {
      const rows: Row[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const res = await call(`/rest/v1/${table}?select=*&order=${key}&limit=${PAGE}&offset=${offset}`);
        const page = (await res.json()) as Row[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
      }
    },

    async upsert(table, key, rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        await call(`/rest/v1/${table}?on_conflict=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows.slice(i, i + PAGE)),
        });
      }
    },

    async remove(table, key, ids) {
      for (let i = 0; i < ids.length; i += 100) {
        const list = ids.slice(i, i + 100).map(quote).join(",");
        await call(`/rest/v1/${table}?${key}=in.(${encodeURIComponent(list)})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      }
    },

    async putFile(path, bytes) {
      await call(objectPath(path), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" },
        body: bytes as unknown as BodyInit,
      });
    },

    async getFile(path) {
      return new Uint8Array(await (await call(objectPath(path))).arrayBuffer());
    },

    async removeFiles(paths) {
      if (!paths.length) return;
      await call(`/storage/v1/object/${encodeURIComponent(opts.bucket)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
    },
  };
}
