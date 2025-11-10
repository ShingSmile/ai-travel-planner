import type { JSONSchemaType } from "ajv";
import { structuredTripPlanSchema } from "./schema";
import {
  ItineraryPromptContext,
  type LLMMessage,
  type LLMStructuredGenerationResult,
  type StructuredTripPlan,
} from "./types";
import { LLMGenerationError } from "./errors";
import { buildItineraryPromptMessages } from "./prompts";
import { validateWithSchema } from "./validator";
import { normalizeStructuredTripPlanPayload } from "./normalize";

type BailianClientMode = "dashscope" | "compatible";

interface BailianClientOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
  mode?: BailianClientMode;
}

interface StructuredGenerationOptions<T> {
  messages: LLMMessage[];
  schema: JSONSchemaType<T>;
  temperature?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  schemaName?: string;
  transformPayload?: (payload: unknown) => unknown;
}

interface ChatMessageContentBlock {
  type?: string;
  text?: string;
  content?: string;
}

type ChatMessageContent = string | ChatMessageContentBlock[];

interface BailianResponseChoice {
  finish_reason?: string;
  message?: {
    role: string;
    content?: ChatMessageContent;
  };
  output_text?: string;
}

interface BailianResponse {
  request_id?: string;
  id?: string;
  output?: {
    text?: string;
    choices?: BailianResponseChoice[];
  };
  choices?: BailianResponseChoice[];
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
const DEFAULT_COMPATIBLE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = process.env.BAILIAN_MODEL ?? "qwen-plus";
const DEFAULT_SCHEMA_NAME = "structured_trip_plan";
const LLM_DEBUG_STRUCTURED_OUTPUT = resolveBooleanEnv(process.env.LLM_DEBUG_STRUCTURED_OUTPUT);

export class BailianClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxRetries: number;
  private readonly mode: BailianClientMode;

  constructor(options?: BailianClientOptions) {
    const forcedMode = options?.mode ?? resolveModeFromEnv();
    const { endpoint, mode } = resolveEndpoint(
      options?.endpoint ?? process.env.BAILIAN_API_BASE_URL,
      forcedMode
    );
    const apiKeyRaw =
      options?.apiKey ??
      process.env.BAILIAN_API_KEY ??
      (mode === "compatible" ? process.env.OPENAI_API_KEY : undefined);
    const apiKey = apiKeyRaw?.trim();

    if (!apiKey) {
      throw new LLMGenerationError("config", "缺少百炼 API Key（BAILIAN_API_KEY）。", {
        shouldRollback: false,
      });
    }

    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = options?.model ?? DEFAULT_MODEL;
    this.defaultTemperature = options?.temperature ?? 0.6;
    this.defaultMaxRetries = options?.maxRetries ?? 3;
    this.mode = mode;
  }

  async generateTripPlan(
    context: ItineraryPromptContext,
    options?: Omit<StructuredGenerationOptions<StructuredTripPlan>, "messages" | "schema">
  ): Promise<LLMStructuredGenerationResult<StructuredTripPlan>> {
    const messages = buildItineraryPromptMessages(context);
    return this.generateStructuredJson<StructuredTripPlan>({
      messages,
      schema: structuredTripPlanSchema,
      temperature: options?.temperature,
      maxRetries: options?.maxRetries,
      signal: options?.signal,
      schemaName: options?.schemaName ?? DEFAULT_SCHEMA_NAME,
      transformPayload: (payload) => normalizeStructuredTripPlanPayload(payload, context),
    });
  }

  async generateStructuredJson<T>(
    options: StructuredGenerationOptions<T>
  ): Promise<LLMStructuredGenerationResult<T>> {
    const maxRetries = options.maxRetries ?? this.defaultMaxRetries;
    let attempt = 0;
    let lastError: LLMGenerationError | null = null;

    while (attempt < maxRetries) {
      attempt += 1;
      try {
        const response = await this.invoke(options, attempt);
        emitLLMDebugLog("raw_llm_payload", {
          attempt,
          parsed: safeSamplePayload(response.parsed),
          raw: safeSamplePayload(response.raw),
          usage: response.usage,
        });

        const transformedPayload = options.transformPayload
          ? options.transformPayload(response.parsed)
          : response.parsed;
        emitLLMDebugLog("normalized_llm_payload", {
          attempt,
          payload: safeSamplePayload(transformedPayload),
        });
        const validated = validateWithSchema(options.schema, transformedPayload);
        if (!validated.success) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[LLM] Structured payload validation failed", {
              attempt,
              errors: validated.errors,
              payloadSample: safeSamplePayload(transformedPayload),
            });
          }
          emitLLMDebugLog("validation_failed_payload", {
            attempt,
            errors: validated.errors,
            payload: safeSamplePayload(transformedPayload),
          });
          throw new LLMGenerationError(
            "validation",
            `第 ${attempt} 次调用返回的内容未通过 JSON Schema 检验。`,
            {
              attempt,
              details: validated.errors?.join("; "),
            }
          );
        }

        const structuredData = validated.data as T;
        emitLLMDebugLog("validated_trip_plan", {
          attempt,
          payload: safeSamplePayload(structuredData),
          stats: summarizeStructuredPayload(structuredData),
        });
        return {
          output: validated.data as T,
          raw: response.raw,
          attempts: attempt,
          usage: response.usage,
        };
      } catch (error) {
        if (error instanceof LLMGenerationError) {
          lastError = error;
        } else {
          lastError = new LLMGenerationError("unexpected", "调用百炼接口时发生未知错误。", {
            cause: error,
            attempt,
          });
        }

        if (attempt >= maxRetries) {
          break;
        }

        await delay(attempt * 400);
      }
    }

    throw (
      lastError ?? new LLMGenerationError("unexpected", "百炼返回未知错误，且未能捕获更详细信息。")
    );
  }

  private async invoke<T>(options: StructuredGenerationOptions<T>, attempt: number) {
    let parsedJson: unknown;
    let rawResponse: BailianResponse | undefined;

    const requestBody = this.buildRequestPayload(options);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });
    } catch (error) {
      throw new LLMGenerationError("network", "无法连接百炼服务，请检查网络或密钥是否有效。", {
        attempt,
        cause: error,
      });
    }

    if (!response.ok) {
      const errorText = await safeReadText(response);
      throw new LLMGenerationError("network", "百炼接口返回错误状态。", {
        attempt,
        details: errorText,
      });
    }

    try {
      rawResponse = (await response.json()) as BailianResponse;
    } catch (error) {
      throw new LLMGenerationError("unexpected", "百炼返回无法解析的响应。", {
        attempt,
        cause: error,
      });
    }

    const jsonPayload = extractJsonContent(rawResponse);
    try {
      parsedJson = jsonPayload ? JSON.parse(jsonPayload) : null;
    } catch (error) {
      throw new LLMGenerationError("validation", "百炼返回的内容不是合法的 JSON。", {
        attempt,
        cause: error,
      });
    }

    return {
      raw: rawResponse,
      parsed: parsedJson,
      usage: {
        requestId: rawResponse?.request_id ?? rawResponse?.id,
        promptTokens: rawResponse?.usage?.input_tokens ?? rawResponse?.usage?.prompt_tokens,
        completionTokens:
          rawResponse?.usage?.output_tokens ?? rawResponse?.usage?.completion_tokens,
        totalTokens: rawResponse?.usage?.total_tokens,
      },
    };
  }

  private buildRequestPayload<T>(options: StructuredGenerationOptions<T>) {
    const schemaName = options.schemaName ?? DEFAULT_SCHEMA_NAME;
    if (this.mode === "compatible") {
      return {
        model: this.model,
        messages: options.messages,
        temperature: options.temperature ?? this.defaultTemperature,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            schema: options.schema,
          },
        },
      };
    }

    return {
      model: this.model,
      input: {
        messages: options.messages,
      },
      parameters: {
        temperature: options.temperature ?? this.defaultTemperature,
        result_format: "json",
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema: options.schema,
        },
      },
    };
  }
}

function summarizeStructuredPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { overviewPresent: false };
  }
  const record = payload as Record<string, unknown>;
  const budget = record.budget as unknown;
  return {
    overviewPresent: Boolean(record.overview),
    dayCount: Array.isArray(record.days) ? record.days.length : undefined,
    hasBudgetBreakdown: Boolean(
      budget &&
        typeof budget === "object" &&
        Array.isArray((budget as Record<string, unknown>).breakdown as unknown[])
    ),
  };
}

function safeSamplePayload(payload: unknown) {
  try {
    return JSON.parse(
      JSON.stringify(payload, (_key, value) => {
        if (typeof value === "string" && value.length > 600) {
          return `${value.slice(0, 600)}…`;
        }
        return value;
      })
    );
  } catch {
    return "[unserializable payload]";
  }
}

function emitLLMDebugLog(event: string, payload: unknown) {
  if (!LLM_DEBUG_STRUCTURED_OUTPUT) {
    return;
  }
  console.debug(`[LLM][debug] ${event}`, payload);
}

function resolveBooleanEnv(value?: string | null) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "debug", "on"].includes(normalized);
}

function extractJsonContent(response: BailianResponse | undefined) {
  if (!response) return null;

  if (response.output?.text) {
    return response.output.text.trim();
  }

  const firstChoice = response.output?.choices?.[0] ?? response.choices?.[0];
  if (firstChoice?.output_text) {
    return firstChoice.output_text.trim();
  }

  const messageContent = firstChoice?.message?.content;
  if (!messageContent) {
    return null;
  }

  if (typeof messageContent === "string") {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    const combined = messageContent
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();

    return combined || null;
  }

  return null;
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "未知错误";
  }
}

function delay(duration: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

function resolveModeFromEnv(): BailianClientMode | undefined {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (!provider) return undefined;
  if (provider === "openai" || provider === "compatible") {
    return "compatible";
  }
  if (provider === "bailian" || provider === "dashscope") {
    return "dashscope";
  }
  return undefined;
}

function resolveEndpoint(
  providedEndpoint?: string,
  forcedMode?: BailianClientMode
): { endpoint: string; mode: BailianClientMode } {
  const normalized = providedEndpoint?.trim() ?? "";

  if (forcedMode === "compatible") {
    const base = normalized || process.env.OPENAI_API_BASE_URL?.trim() || DEFAULT_COMPATIBLE_BASE;
    return { endpoint: ensureChatCompletionsPath(base), mode: "compatible" };
  }

  if (forcedMode === "dashscope") {
    return { endpoint: normalized || DEFAULT_ENDPOINT, mode: "dashscope" };
  }

  if (normalized) {
    if (isCompatibleEndpoint(normalized)) {
      return { endpoint: ensureChatCompletionsPath(normalized), mode: "compatible" };
    }
    return { endpoint: normalized, mode: "dashscope" };
  }

  return { endpoint: DEFAULT_ENDPOINT, mode: "dashscope" };
}

function ensureChatCompletionsPath(base: string) {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function isCompatibleEndpoint(endpoint: string) {
  const lower = endpoint.toLowerCase();
  return lower.includes("compatible-mode") || lower.endsWith("/chat/completions");
}
