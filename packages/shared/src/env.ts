import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
});

export function parseEnv<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  env: Record<string, string | undefined> = process.env,
) {
  const merged = baseEnvSchema.merge(schema);
  const result = merged.safeParse(env);
  if (!result.success) {
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}
