import OpenAI from "openai";
import { mockProvider } from "./mock-llm";

// Nebius Token Factory exposes an OpenAI-compatible API, so the standard client works with a different base URL.
export const NEBIUS_BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.us-north1.nebius.com/v1/";

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type ToolDefinition = OpenAI.Chat.ChatCompletionFunctionTool;

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Completion {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  name: string;
  complete(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<Completion>;
}

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

export function nebiusProvider(): LlmProvider {
  return openAiCompatible(`nebius:${modelId()}`, llmClient(), modelId());
}

// Docker Model Runner serves an OpenAI-compatible API, so local mode is the same client pointed at this machine.
// Inside Compose, the `models:` element injects LOCAL_LLM_URL and LOCAL_MODEL (see docker-compose.local.yml).
export const LOCAL_LLM_URL = () => process.env.LOCAL_LLM_URL ?? "http://localhost:12434/engines/v1";
export const LOCAL_MODEL = () => process.env.LOCAL_MODEL ?? "ai/qwen3";

export function localProvider(): LlmProvider {
  return openAiCompatible(`local:${LOCAL_MODEL()}`, new OpenAI({ apiKey: "local", baseURL: LOCAL_LLM_URL() }), LOCAL_MODEL());
}

function openAiCompatible(name: string, client: OpenAI, model: string): LlmProvider {
  return {
    name,
    async complete(messages, tools) {
      const res = await client.chat.completions.create({
        model,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" as const } : {}),
      });
      const msg = res.choices[0]?.message;
      return {
        content: msg?.content ?? null,
        toolCalls: (msg?.tool_calls ?? [])
          .filter((c) => c.type === "function")
          .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
      };
    },
  };
}

// LLM_PROVIDER=mock forces the stand-in and LLM_PROVIDER=local uses Docker Model Runner on this machine;
// otherwise Nebius is used whenever a key is configured.
export function getProvider(): LlmProvider {
  if (process.env.LLM_PROVIDER === "local") return localProvider();
  if (process.env.LLM_PROVIDER === "mock" || !process.env.NEBIUS_API_KEY) return mockProvider;
  return nebiusProvider();
}
