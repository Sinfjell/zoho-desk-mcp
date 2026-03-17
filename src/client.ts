import { getAccessToken } from "./auth.js";

const BASE_URL = "https://desk.zoho.eu/api/v1";

function getOrgId(): string {
  const orgId = process.env.ZOHO_DESK_ORG_ID;
  if (!orgId) throw new Error("Missing ZOHO_DESK_ORG_ID");
  return orgId;
}

async function zohoFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "orgId": getOrgId(),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 404) {
    throw new ZohoNotFoundError(`Not found: ${path}`);
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new ZohoRateLimitError(`Rate limited. Retry after ${retryAfter ?? "unknown"} seconds.`);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; errorCode?: string };
      message = body.message ?? body.errorCode ?? message;
    } catch { /* ignore parse errors */ }
    throw new ZohoApiError(`Zoho API error: ${message}`);
  }

  return res.json() as Promise<T>;
}

export class ZohoApiError extends Error {
  constructor(message: string) { super(message); this.name = "ZohoApiError"; }
}
export class ZohoNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "ZohoNotFoundError"; }
}
export class ZohoRateLimitError extends Error {
  constructor(message: string) { super(message); this.name = "ZohoRateLimitError"; }
}
export class ZohoValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ZohoValidationError"; }
}

export async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  let url = path;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  return zohoFetch<T>(url);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return zohoFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return zohoFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
