import type { TwinState } from "@/app/api/twin/state";

export type TwinResponse = TwinState & Record<string, unknown>;

export async function post(body: object): Promise<TwinResponse> {
  const res = await fetch("/api/twin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

export async function upload(form: FormData): Promise<TwinResponse> {
  const res = await fetch("/api/twin/audio", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

/** Runs an action, swaps in the new state, and turns errors into toasts. */
export type Act = <T extends TwinState>(fn: () => Promise<T>, success?: string) => Promise<T | null>;
