import type { JSONSchemaType } from "ajv";
import { validateWithSchema, type SchemaValidationResult } from "./validator";
import type { StructuredTripPlan } from "./types";

const timePattern = "^(?:[01]\\d|2[0-3]):[0-5]\\d$";
const datePattern = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

export const structuredTripPlanSchema: JSONSchemaType<StructuredTripPlan> = {
  $id: "ai-travel-planner://schemas/structured-trip-plan.json",
  type: "object",
  additionalProperties: false,
  required: ["overview", "days", "budget"],
  properties: {
    overview: {
      type: "object",
      additionalProperties: false,
      required: ["title", "destination", "startDate", "endDate", "totalDays", "summary"],
      properties: {
        title: { type: "string", minLength: 1 },
        destination: { type: "string", minLength: 1 },
        startDate: { type: "string", pattern: datePattern },
        endDate: { type: "string", pattern: datePattern },
        totalDays: { type: "integer", minimum: 1 },
        summary: { type: "string", minLength: 1 },
        travelStyle: { type: "string", nullable: true },
      },
    },
    days: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "date", "title", "summary", "activities"],
        properties: {
          day: { type: "integer", minimum: 1 },
          date: { type: "string", pattern: datePattern },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          activities: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type"],
              properties: {
                name: { type: "string", minLength: 1 },
                type: { type: "string", minLength: 1 },
                summary: { type: "string", nullable: true },
                location: { type: "string", nullable: true },
                startTime: { type: "string", pattern: timePattern, nullable: true },
                endTime: { type: "string", pattern: timePattern, nullable: true },
                tips: {
                  type: "array",
                  nullable: true,
                  items: { type: "string", minLength: 1 },
                },
                budget: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  required: ["amount", "currency"],
                  properties: {
                    amount: { type: "number", minimum: 0 },
                    currency: { type: "string", minLength: 1 },
                    description: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          accommodations: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 },
              address: { type: "string", nullable: true },
              checkInTime: { type: "string", pattern: timePattern, nullable: true },
              checkOutTime: { type: "string", pattern: timePattern, nullable: true },
              budget: {
                type: "object",
                nullable: true,
                additionalProperties: false,
                required: ["amount", "currency"],
                properties: {
                  amount: { type: "number", minimum: 0 },
                  currency: { type: "string", minLength: 1 },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
          meals: {
            type: "array",
            nullable: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type"],
              properties: {
                name: { type: "string", minLength: 1 },
                type: { type: "string", minLength: 1 },
                summary: { type: "string", nullable: true },
                location: { type: "string", nullable: true },
                startTime: { type: "string", pattern: timePattern, nullable: true },
                endTime: { type: "string", pattern: timePattern, nullable: true },
                tips: {
                  type: "array",
                  nullable: true,
                  items: { type: "string", minLength: 1 },
                },
                budget: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  required: ["amount", "currency"],
                  properties: {
                    amount: { type: "number", minimum: 0 },
                    currency: { type: "string", minLength: 1 },
                    description: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          notes: {
            type: "array",
            nullable: true,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    budget: {
      type: "object",
      additionalProperties: false,
      required: ["currency", "total", "breakdown"],
      properties: {
        currency: { type: "string", minLength: 1 },
        total: { type: "number", minimum: 0 },
        breakdown: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "amount"],
            properties: {
              category: { type: "string", minLength: 1 },
              amount: { type: "number", minimum: 0 },
              description: { type: "string", nullable: true },
              percentage: { type: "number", nullable: true, minimum: 0, maximum: 100 },
            },
          },
        },
        tips: {
          type: "array",
          nullable: true,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    suggestions: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
  },
};

export function validateStructuredTripPlan(
  payload: unknown
): SchemaValidationResult<StructuredTripPlan> {
  return validateWithSchema(structuredTripPlanSchema, payload);
}
