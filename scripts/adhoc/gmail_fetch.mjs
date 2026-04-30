/**
 * Reads Gmail OAuth tokens from app_settings and prints recent inbox messages
 * to stdout for inspection. No DB writes.
 *
 * Usage:
 *   node scripts/adhoc/gmail_fetch.mjs                # last 7d, max 20
 *   node scripts/adhoc/gmail_fetch.mjs --q "newer_than:30d" --max 50
 *   node scripts/adhoc/gmail_fetch.mjs --id <messageId>     # full body of one message
 */
import sql from 'mssql';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local manually (no dotenv dep needed).
const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) argMap[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
}

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const r = await pool.request().query(`SELECT value FROM app_settings WHERE [key] = 'gmail_oauth_tokens'`);
if (!r.recordset.length) {
  console.error('No Gmail tokens found in app_settings. Connect Gmail in /settings first.');
  process.exit(1);
}
const tokens = JSON.parse(r.recordset[0].value);
console.error(`Connected as: ${tokens.email}`);

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI,
);
auth.setCredentials({
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  expiry_date: tokens.expiry_date,
  token_type: tokens.token_type,
  scope: tokens.scope,
});

const gmail = google.gmail({ version: 'v1', auth });

function decodeB64(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}
function extractBody(payload) {
  if (!payload) return '';
  const stack = [payload];
  let html = '';
  while (stack.length) {
    const p = stack.pop();
    if (p.mimeType === 'text/plain' && p.body?.data) return decodeB64(p.body.data);
    if (p.mimeType === 'text/html' && p.body?.data && !html) html = decodeB64(p.body.data);
    if (p.parts) stack.push(...p.parts);
  }
  return html ? html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

if (argMap.id) {
  const msg = await gmail.users.messages.get({ userId: 'me', id: argMap.id, format: 'full' });
  const headers = msg.data.payload?.headers ?? [];
  const get = (n) => headers.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value || '';
  console.log('id:', argMap.id);
  console.log('from:', get('From'));
  console.log('to:', get('To'));
  console.log('subject:', get('Subject'));
  console.log('date:', get('Date'));
  console.log('---');
  console.log(extractBody(msg.data.payload));
} else {
  const q = argMap.q || 'in:inbox newer_than:7d';
  const max = parseInt(argMap.max || '20');
  console.error(`query: "${q}"  max: ${max}`);
  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: max });
  const ids = (list.data.messages ?? []).map(m => m.id);
  console.log(`# ${ids.length} message(s)`);
  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    const headers = msg.data.payload?.headers ?? [];
    const get = (n) => headers.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value || '';
    console.log(`${id}\t${get('Date').slice(0, 25).padEnd(26)}\t${get('From').slice(0, 40).padEnd(41)}\t${get('Subject').slice(0, 80)}`);
  }
}

await pool.close();
