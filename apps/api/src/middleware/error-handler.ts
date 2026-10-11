import type { Context } from "hono";
import { AppError } from "@vedaa/shared";
import { ZodError } from "zod";

export function handleError(err: unknown, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() } },
      400,
    );
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } }, 500);
}
