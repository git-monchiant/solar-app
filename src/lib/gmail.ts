import { google, type gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getDb, sql } from "@/lib/db";

// Gmail integration uses Google OAuth (test-user flow). Tokens are stored in
// app_settings as JSON under `gmail_oauth_tokens` so we don't need a dedicated
// table for a single-mailbox setup.

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function getOAuthClient(): OAuth2Client {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error("GOOGLE_OAUTH_* env vars are not configured");
  }
  return new google.auth.OAuth2(id, secret, redirect);
}

export function buildAuthUrl(state: string): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
  email: string;
  connected_at: string;
};

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const db = await getDb();
  await db.request()
    .input("key", sql.NVarChar(100), "gmail_oauth_tokens")
    .input("value", sql.NVarChar(sql.MAX), JSON.stringify(tokens))
    .query(`
      MERGE app_settings AS target
      USING (SELECT @key AS [key], @value AS value) AS src
      ON target.[key] = src.[key]
      WHEN MATCHED THEN UPDATE SET value = src.value, updated_at = GETDATE()
      WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (src.[key], src.value);
    `);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const db = await getDb();
  const r = await db.request()
    .input("key", sql.NVarChar(100), "gmail_oauth_tokens")
    .query(`SELECT value FROM app_settings WHERE [key] = @key`);
  if (!r.recordset.length) return null;
  try {
    return JSON.parse(r.recordset[0].value) as StoredTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  const db = await getDb();
  await db.request()
    .input("key", sql.NVarChar(100), "gmail_oauth_tokens")
    .query(`DELETE FROM app_settings WHERE [key] = @key`);
}

export async function getGmailClient(): Promise<gmail_v1.Gmail | null> {
  const tokens = await loadTokens();
  if (!tokens?.refresh_token) return null;
  const auth = getOAuthClient();
  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    token_type: tokens.token_type,
    scope: tokens.scope,
  });
  // Auto-refresh: googleapis updates credentials in-place; persist if rotated.
  auth.on("tokens", async (next) => {
    if (next.access_token) {
      await saveTokens({
        ...tokens,
        access_token: next.access_token,
        expiry_date: next.expiry_date ?? tokens.expiry_date,
        scope: next.scope ?? tokens.scope,
      });
    }
  });
  return google.gmail({ version: "v1", auth });
}
