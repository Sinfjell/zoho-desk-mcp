import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_PATH = path.join(os.homedir(), ".zoho-desk-token.json");
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

function readCache(): TokenCache | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as TokenCache;
  } catch {
    return null;
  }
}

function writeCache(cache: TokenCache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), { encoding: "utf-8", mode: 0o600 });
}

async function refreshToken(): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("ZohoAuthError: Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, or ZOHO_REFRESH_TOKEN");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://accounts.zoho.eu/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`ZohoAuthError: Token refresh failed (${res.status}). Regenerate refresh token at https://api-console.zoho.com`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string };

  if (data.error || !data.access_token) {
    throw new Error(`ZohoAuthError: ${data.error ?? "Unknown error"}. Regenerate refresh token at https://api-console.zoho.com`);
  }

  const cache: TokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55 min (conservative)
  };
  writeCache(cache);

  return data.access_token;
}

export async function getAccessToken(): Promise<string> {
  const cache = readCache();
  if (cache && cache.expiresAt - TOKEN_BUFFER_MS > Date.now()) {
    return cache.accessToken;
  }
  return refreshToken();
}
