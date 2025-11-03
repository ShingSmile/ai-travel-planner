export type LLMGenerationErrorKind = "config" | "network" | "validation" | "unexpected";

interface GenerationErrorOptions {
  cause?: unknown;
  details?: string;
  attempt?: number;
  shouldRollback?: boolean;
}

export class LLMGenerationError extends Error {
  public readonly kind: LLMGenerationErrorKind;
  public readonly details?: string;
  public readonly attempt?: number;
  public readonly shouldRollback: boolean;

  constructor(kind: LLMGenerationErrorKind, message: string, options?: GenerationErrorOptions) {
    super(message);
    this.name = "LLMGenerationError";
    this.kind = kind;
    this.details = options?.details;
    this.attempt = options?.attempt;
    this.shouldRollback = options?.shouldRollback ?? kind !== "config";
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
