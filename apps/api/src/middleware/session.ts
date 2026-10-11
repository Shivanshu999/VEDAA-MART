import type { Context, Next } from "hono";
import type { Auth } from "../lib/auth.js";
import { AppError } from "@vedaa/shared";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export async function attachSession(auth: Auth, c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) {
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as { role?: string }).role ?? "CUSTOMER",
    } satisfies SessionUser);
  }
  await next();
}

export function requireAuth(c: Context): SessionUser {
  const user = c.get("user") as SessionUser | undefined;
  if (!user) {
    throw new AppError("Authentication required", "UNAUTHORIZED", 401);
  }
  return user;
}

export function requireRole(c: Context, roles: string[]): SessionUser {
  const user = requireAuth(c);
  if (!roles.includes(user.role)) {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }
  return user;
}

export function requireAnyRole(c: Context, roles: string[]): SessionUser {
  return requireRole(c, roles);
}

export function assertStoreAccess(
  user: SessionUser,
  storeId: string | undefined,
  authorizedStoreIds: readonly string[],
  allowedRoles: string[] = ["STORE_MANAGER", "STORE_STAFF"],
): SessionUser {
  if (user.role === "ADMIN") return user;
  if (storeId && allowedRoles.includes(user.role) && authorizedStoreIds.includes(storeId)) {
    return user;
  }
  throw new AppError("Store access required", "FORBIDDEN", 403);
}

export function requireStoreAccess(
  c: Context,
  storeId: string | undefined,
  authorizedStoreIds: readonly string[] = [],
  allowedRoles: string[] = ["STORE_MANAGER", "STORE_STAFF"],
): SessionUser {
  return assertStoreAccess(requireAuth(c), storeId, authorizedStoreIds, allowedRoles);
}
