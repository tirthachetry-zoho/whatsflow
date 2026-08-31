import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { captureError } from "@/lib/logger";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to view this resource.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this business.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input.", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "A conflicting resource already exists.") {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again shortly.", retryAfterMs?: number) {
    super(message, 429, "RATE_LIMITED", { retryAfterMs });
  }
}

export function toErrorResponse(error: unknown, context?: Record<string, unknown>): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid input.", details: error.flatten() } },
      { status: 422 },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  captureError(error, context);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
