// Small fetch helper for client components.
export interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function postJson<T = Record<string, unknown>>(url: string, body?: unknown): Promise<JsonResult<T>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Pull a user-facing message out of an API response. */
export function messageOf(data: unknown, fallback: string) {
  const d = data as { message?: string; error?: string } | null;
  return d?.message ?? d?.error ?? fallback;
}
