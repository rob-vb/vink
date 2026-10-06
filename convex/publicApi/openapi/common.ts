// What every /v1 endpoint shares: auth, the error shape and its codes.
import type { ErrorCode, Response, Schema } from "./types";

export const API_BASE_URL = "https://vink.page/v1";

export const securitySchemes = {
  apiKey: {
    type: "http",
    scheme: "bearer",
    description:
      "An API Key, made by an Admin under Settings → API Keys. Send it as `Authorization: Bearer <key>`.",
  },
};

export const errorSchema: Schema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", description: "Stable, snake_case. Branch on this.", example: "invalid_api_key" },
        message: {
          type: "string",
          description: "A sentence for people. It may change.",
          example: "This API Key doesn't exist or was revoked.",
        },
      },
    },
  },
};

const error = (code: string, message: string) => ({ error: { code, message } });

export const sharedResponses: Record<string, Response> = {
  Unauthorized: {
    description: "The API Key is missing, unknown or revoked.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        example: error("invalid_api_key", "This API Key doesn't exist or was revoked."),
      },
    },
  },
  InternalError: {
    description: "Something went wrong on our side.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        example: error("internal_error", "Something went wrong on our side. Try again later."),
      },
    },
  },
};

export const commonErrors: ErrorCode[] = [
  { status: 401, code: "missing_api_key", meaning: "No `Authorization: Bearer <key>` header." },
  { status: 401, code: "invalid_api_key", meaning: "The key is unknown or was revoked." },
  { status: 404, code: "not_found", meaning: "No such endpoint, or nothing with that id in your Organisation." },
  { status: 500, code: "internal_error", meaning: "Something went wrong on our side. Try again later." },
];
