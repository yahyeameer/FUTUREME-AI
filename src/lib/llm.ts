import OpenAI from "openai";
import { mockProvider } from "./mock-llm";

// Nebius Token Factory exposes an OpenAI-compatible API, so the standard client works with a different base URL.
export const NEBIUS_BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1/";

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
  const client = llmClient();
  const model = modelId();
  return {
    name: `nebius:${model}`,
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

// LLM_PROVIDER=mock forces the stand-in; otherwise Nebius is used whenever a key is configured.
export function getProvider(): LlmProvider {
  if (process.env.LLM_PROVIDER === "mock" || !process.env.NEBIUS_API_KEY) return mockProvider;
  return nebiusProvider();
}
