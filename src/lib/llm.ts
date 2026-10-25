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
  /** Nemotron's reasoning trace, when reasoning was on. */
  reasoning?: string | null;
  usage?: { prompt: number; completion: number; reasoning: number };
  /** True when the reply stopped at the token limit, so it may be cut off mid-sentence or mid-JSON. */
  truncated?: boolean;
}

/** "on" lets Nemotron think before it answers; "off" answers straight away (fast, cheap). */
export type ReasoningMode = "on" | "off";

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompleteOptions {
  reasoning?: ReasoningMode;
  /** Constrains the reply to this JSON schema (structured output). Only for calls without tools. */
  schema?: JsonSchemaSpec;
  /** Caps the reply, reasoning included. Unset leaves the server's default. */
  maxTokens?: number;
  /** Streams the reply as it is written. */
  onText?: (text: string) => void;
  /** Streams the reasoning trace as it is written. */
  onReasoning?: (text: string) => void;
}

export interface LlmProvider {
  name: string;
  complete(messages: ChatMessage[], tools?: ToolDefinition[], opts?: CompleteOptions): Promise<Completion>;
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
  return openAiCompatible(`nebius:${modelId()}`, llmClient(), modelId(), { nemotron: true });
}

/**
 * NEBIUS_REASONING=on|off forces Nemotron's reasoning for every call; otherwise ("auto") each agent picks its own mode:
 * planners, chairs and supervisors think, quick voices and live calls answer straight away.
 */
export function reasoningFor(wanted: ReasoningMode | undefined): ReasoningMode | undefined {
  const forced = process.env.NEBIUS_REASONING;
  return forced === "on" || forced === "off" ? forced : wanted;
}

// Docker Model Runner serves an OpenAI-compatible API, so local mode is the same client pointed at this machine.
// Inside Compose, the `models:` element injects LOCAL_LLM_URL and LOCAL_MODEL (see docker-compose.local.yml).
export const LOCAL_LLM_URL = () => process.env.LOCAL_LLM_URL ?? "http://localhost:12434/engines/v1";
export const LOCAL_MODEL = () => process.env.LOCAL_MODEL ?? "ai/qwen3";

export function localProvider(): LlmProvider {
  return openAiCompatible(`local:${LOCAL_MODEL()}`, new OpenAI({ apiKey: "local", baseURL: LOCAL_LLM_URL() }), LOCAL_MODEL());
}

// Nemotron on Token Factory (a vLLM server) takes a few fields beyond the OpenAI API: chat_template_kwargs switches
// reasoning on or off, and the reasoning trace comes back as reasoning_content next to the reply.
type NemotronDelta = { content?: string | null; reasoning_content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] };
type NemotronUsage = { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number | null } | null };

function openAiCompatible(name: string, client: OpenAI, model: string, features: { nemotron?: boolean } = {}): LlmProvider {
  return {
    name,
    async complete(messages, tools, opts = {}) {
      const reasoning = features.nemotron ? reasoningFor(opts.reasoning) : undefined;
      const body = {
        model,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" as const } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(reasoning ? { chat_template_kwargs: { enable_thinking: reasoning === "on" } } : {}),
        // Tool calling and a forced JSON reply don't mix, so the schema only applies to calls without tools.
        ...(opts.schema && !tools?.length && features.nemotron
          ? { response_format: { type: "json_schema" as const, json_schema: { name: opts.schema.name, schema: opts.schema.schema, strict: true } } }
          : {}),
      };
      const usageOf = (u: NemotronUsage | null | undefined) =>
        u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined;

      if (!opts.onText && !opts.onReasoning) {
        const res = await client.chat.completions.create(body);
        const msg = res.choices[0]?.message as (OpenAI.Chat.ChatCompletionMessage & { reasoning_content?: string | null }) | undefined;
        return {
          content: msg?.content ?? null,
          toolCalls: (msg?.tool_calls ?? [])
            .filter((c) => c.type === "function")
            .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
          reasoning: msg?.reasoning_content ?? null,
          usage: usageOf(res.usage as NemotronUsage),
          truncated: res.choices[0]?.finish_reason === "length",
        };
      }

      // Streaming: the reply and the reasoning go out as they arrive; tool calls arrive in pieces and are put back together.
      const stream = await client.chat.completions.create({ ...body, stream: true, stream_options: { include_usage: true } });
      let content = "";
      let thought = "";
      let usage: Completion["usage"];
      let truncated = false;
      const calls: { id: string; name: string; arguments: string }[] = [];
      for await (const chunk of stream) {
        if (chunk.usage) usage = usageOf(chunk.usage as NemotronUsage);
        if (chunk.choices[0]?.finish_reason === "length") truncated = true;
        const delta = chunk.choices[0]?.delta as NemotronDelta | undefined;
        if (!delta) continue;
        if (delta.reasoning_content) {
          thought += delta.reasoning_content;
          opts.onReasoning?.(delta.reasoning_content);
        }
        if (delta.content) {
          content += delta.content;
          opts.onText?.(delta.content);
        }
        for (const c of delta.tool_calls ?? []) {
          const slot = (calls[c.index] ??= { id: "", name: "", arguments: "" });
          if (c.id) slot.id = c.id;
          if (c.function?.name) slot.name += c.function.name;
          if (c.function?.arguments) slot.arguments += c.function.arguments;
        }
      }
      return {
        content: content || null,
        toolCalls: calls.filter(Boolean).map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments })),
        reasoning: thought || null,
        usage,
        truncated,
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
