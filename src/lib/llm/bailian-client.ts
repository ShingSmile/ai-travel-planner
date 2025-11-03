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

interface BailianClientOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
}

interface StructuredGenerationOptions<T> {
  messages: LLMMessage[];
  schema: JSONSchemaType<T>;
  temperature?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  schemaName?: string;
}

interface BailianResponseChoice {
  finish_reason?: string;
  message?: {
    role: string;
    content?: string;
  };
  output_text?: string;
}

interface BailianResponse {
  request_id?: string;
  output?: {
    text?: string;
    choices?: BailianResponseChoice[];
  };
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

const DEFAULT_ENDPOINT =
  process.env.BAILIAN_API_BASE_URL ??
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
const DEFAULT_MODEL = process.env.BAILIAN_MODEL ?? "qwen-plus";
const DEFAULT_SCHEMA_NAME = "structured_trip_plan";

export class BailianClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxRetries: number;

  constructor(options?: BailianClientOptions) {
    const apiKey = options?.apiKey ?? process.env.BAILIAN_API_KEY;

    if (!apiKey) {
      throw new LLMGenerationError("config", "缺少百炼 API Key（BAILIAN_API_KEY）。", {
        shouldRollback: false,
      });
    }

    this.apiKey = apiKey;
    this.endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
    this.model = options?.model ?? DEFAULT_MODEL;
    this.defaultTemperature = options?.temperature ?? 0.6;
    this.defaultMaxRetries = options?.maxRetries ?? 3;
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

        const validated = validateWithSchema(options.schema, response.parsed);
        if (!validated.success) {
          throw new LLMGenerationError(
            "validation",
            `第 ${attempt} 次调用返回的内容未通过 JSON Schema 检验。`,
            {
              attempt,
              details: validated.errors?.join("; "),
            }
          );
        }

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

    const requestBody = {
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
          name: options.schemaName ?? DEFAULT_SCHEMA_NAME,
          schema: options.schema,
        },
      },
    };

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
        requestId: rawResponse?.request_id,
        promptTokens: rawResponse?.usage?.input_tokens,
        completionTokens: rawResponse?.usage?.output_tokens,
        totalTokens: rawResponse?.usage?.total_tokens,
      },
    };
  }
}

function extractJsonContent(response: BailianResponse | undefined) {
  if (!response) return null;

  if (response.output?.text) {
    return response.output.text.trim();
  }

  const firstChoice = response.output?.choices?.[0];
  if (firstChoice?.output_text) {
    return firstChoice.output_text.trim();
  }
  if (firstChoice?.message?.content) {
    return firstChoice.message.content.trim();
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
