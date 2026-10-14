import OpenAI from "openai";

// Nebius Token Factory exposes an OpenAI-compatible API, so the standard client works with a different base URL.
export const NEBIUS_BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1/";

export function llmClient(): OpenAI {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set. Copy .env.example to .env.local and add your key.");
  return new OpenAI({ apiKey, baseURL: NEBIUS_BASE_URL });
}

export function modelId(): string {
  const model = process.env.NEBIUS_MODEL;
  if (!model) throw new Error("NEBIUS_MODEL is not set. Run `npm run spike:models` to list available Nemotron models.");
  return model;
}
