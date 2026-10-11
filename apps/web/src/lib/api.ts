const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: init?.cache ?? "no-store",
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(payload?.error?.message ?? "Request failed", res.status, payload?.error?.code);
  }
  return payload as T;
}
