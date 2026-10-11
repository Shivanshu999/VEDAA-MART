import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@vedaa/database";
import type { Env } from "../env.js";

export function createAuth(env: Env) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "CUSTOMER",
          input: false,
        },
        phone: {
          type: "string",
          required: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
