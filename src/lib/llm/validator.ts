import Ajv, { type ErrorObject, type JSONSchemaType, type ValidateFunction } from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: true,
  useDefaults: true,
  removeAdditional: "failing",
});

const validatorCache = new WeakMap<object, ValidateFunction>();

export interface SchemaValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function getValidator<T>(schema: JSONSchemaType<T>): ValidateFunction<T> {
  const schemaRef = schema as unknown as object;
  const cached = validatorCache.get(schemaRef);
  if (cached) {
    return cached as ValidateFunction<T>;
  }

  const validator = ajv.compile<T>(schema);
  validatorCache.set(schemaRef, validator as ValidateFunction);
  return validator;
}

export function validateWithSchema<T>(
  schema: JSONSchemaType<T>,
  payload: unknown
): SchemaValidationResult<T> {
  const validator = getValidator(schema);
  const result = validator(payload);

  if (result) {
    return {
      success: true,
      data: payload as T,
    };
  }

  return {
    success: false,
    errors: formatAjvErrors(validator.errors),
  };
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) {
    return [];
  }

  return errors.map((error) => {
    const path = error.instancePath ? error.instancePath : error.schemaPath.replace("#/", "");
    return `${path || "(root)"} ${error.message ?? ""}`.trim();
  });
}
