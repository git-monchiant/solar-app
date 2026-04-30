/**
 * Imports lead-registration emails from Gmail into the leads table.
 *
 * Targets: subject "มีผู้สนใจติดตั้งโซลาร์ กับ Sena Solar Energy" from
 * sales@senasolarenergy.com (web form forwarding).
 *
 * Dedupe via leads.gmail_message_id (migration 103). Re-running is safe.
 *
 * Usage:
 *   node scripts/adhoc/gmail_import_leads.mjs                # last 30d
 *   node scripts/adhoc/gmail_import_leads.mjs --dry-run
 *   node scripts/adhoc/gmail_import_leads.mjs --q "..."
 */
import sql from 'mssql';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

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
const DRY = !!argMap['dry-run'];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const tokRes = await pool.request().query(`SELECT value FROM app_settings WHERE [key] = 'gmail_oauth_tokens'`);
if (!tokRes.recordset.length) { console.error('Gmail not connected.'); process.exit(1); }
const tokens = JSON.parse(tokRes.recordset[0].value);
console.error(`Connected: ${tokens.email}`);

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

const decodeB64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
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
  return html ? html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

// Two form formats are forwarded by the website:
//   A) compact: "ชื่อ - นามสกุล", "อีเมล", "เบอร์โทรศัพท์", "ที่อยู่ตามจังหวัด",
//      "ประเภทที่อยู่อาศัย", "ค่าไฟต่อเดือน", "รูปแบบหลังคา".
//   B) full assessment: separate "ชื่อ" / "นามสกุล", "อีเมล์", many calc
//      fields, "เบอร์โทรศัพท์", "ที่อยู่", "จังหวัด / เขต".
// Strategy: pull phone + email by direct regex (always reliable), then sweep
// known labels in order to slice values between them.

const LABELS = [
  { key: 'full_name_combined', re: /ชื่อ\s*[-–]\s*นามสกุล/ },
  { key: 'first_name',         re: /(?:^|\s)ชื่อ(?!\s*[-–])/ },
  { key: 'last_name',          re: /นามสกุล/ },
  { key: 'email',              re: /อีเมล[์]?/ },
  { key: 'phone',              re: /เบอร์โทรศัพท์/ },
  { key: 'province',           re: /ที่อยู่ตามจังหวัด|จังหวัด\s*\/?\s*เขต/ },
  { key: 'address',            re: /(?<!ตาม)ที่อยู่(?!ตาม)/ },
  { key: 'residence',          re: /ประเภทที่อยู่อาศัย|ประเภทบ้าน/ },
  { key: 'monthly_bill',       re: /(?:บิล)?ค่าไฟต่อเดือน[^&]*?(?=&|\s)/ },
  { key: 'roof_shape',         re: /รูปแบบหลังคา|ทรงหลังคา/ },
  { key: 'roof_material',      re: /ประเภทหลังคา/ },
];

function parseRegistrationBody(body) {
  const after = body.replace(/^.*?(?:กรอกข้อมูลเพื่อรับข้อเสนอพิเศษ|รายละเอียดดังนี้)\s*/s, '').trim();
  const isFormatA = /ชื่อ\s*[-–]\s*นามสกุล/.test(after);
  // Pick which label set to use based on detected format. This avoids the
  // collision where /นามสกุล/ matches inside "ชื่อ - นามสกุล" in Format A.
  const labels = isFormatA
    ? LABELS.filter(l => !['first_name', 'last_name'].includes(l.key))
    : LABELS.filter(l => l.key !== 'full_name_combined');
  const matches = labels.map(l => {
    const m = after.match(l.re);
    return { key: l.key, idx: m ? m.index : -1, end: m ? m.index + m[0].length : -1 };
  }).filter(m => m.idx >= 0).sort((a, b) => a.idx - b.idx);
  const out = {};
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const raw = after.slice(cur.end, next ? next.idx : after.length).trim();
    if (!out[cur.key]) out[cur.key] = raw;
  }
  // Format B: combine separated first + last.
  if (!out.full_name_combined && out.first_name) {
    out.full_name_combined = `${out.first_name || ''} ${out.last_name || ''}`.trim();
  }
  // Direct extraction — body has at most one phone + one email per registration.
  const phoneMatch = after.match(/\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  if (phoneMatch) out._phone_direct = phoneMatch[0];
  const emailMatch = after.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) out._email_direct = emailMatch[0];
  return out;
}

const cleanPhone = (s) => {
  const digits = (s || '').replace(/[^0-9]/g, '');
  // Thai mobile = 10 digits starting with 0; landline = 9 digits.
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(0, 10);
  return digits.slice(0, 10);
};
const parseMoneyRange = (s) => {
  if (!s) return null;
  const nums = (s.match(/[\d,]+/g) || []).map(n => parseInt(n.replace(/,/g, ''))).filter(n => !isNaN(n));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length); // midpoint
};

const q = argMap.q || 'from:sales@senasolarenergy.com subject:("มีผู้สนใจติดตั้งโซลาร์") newer_than:90d';
const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100 });
const ids = (list.data.messages ?? []).map(m => m.id);
console.error(`scanning ${ids.length} message(s)`);

let imported = 0, skipped = 0, errors = 0;
for (const id of ids) {
  try {
    const exists = await pool.request()
      .input('gmail_id', sql.NVarChar(64), id)
      .query(`SELECT TOP 1 id FROM leads WHERE gmail_message_id = @gmail_id`);
    if (exists.recordset.length) { skipped++; continue; }

    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const headers = msg.data.payload?.headers ?? [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const body = extractBody(msg.data.payload) || msg.data.snippet || '';
    const fields = parseRegistrationBody(body);

    if (!fields.full_name && !fields.phone) {
      console.error(`skip ${id} — no name/phone in body`);
      errors++;
      continue;
    }

    const fullName = (fields.full_name_combined || '').trim();
    const phone = cleanPhone(fields._phone_direct || fields.phone);
    const email = (fields._email_direct || fields.email || '').trim().replace(/^[^\w]+/, '');
    const provinceRaw = (fields.province || '').trim();
    // Format B has "จังหวัด: กรุงเทพมหานคร เขต/อำเภอ: ..." — pluck the จังหวัด only.
    const provinceMatch = provinceRaw.match(/จังหวัด\s*:\s*([^\s]+)/);
    const province = (provinceMatch ? provinceMatch[1] : provinceRaw).trim();
    const residence = (fields.residence || '').trim();
    const monthlyBill = parseMoneyRange(fields.monthly_bill);
    const roof = (fields.roof_shape || '').trim();

    const note = `[Gmail registration]\nวันที่: ${date}\nsubject: ${subject}\n\n` +
      `ชื่อ: ${fullName}\nemail: ${email}\nโทร: ${phone}\nจังหวัด: ${province}\n` +
      `ประเภทที่อยู่: ${residence}\nค่าไฟต่อเดือน: ${fields.monthly_bill || '-'}\nหลังคา: ${roof}`;

    console.log(`→ ${fullName} | ${phone} | ${email} | ${province}`);
    if (DRY) { imported++; continue; }

    // Truncate to actual column widths (queried via sys.columns):
    //   full_name(200), phone(20), email(200), zone(100),
    //   pre_residence_type(30), pre_roof_shape(20).
    await pool.request()
      .input('full_name', sql.NVarChar(200), fullName.slice(0, 200) || '(no name)')
      .input('phone', sql.NVarChar(20), phone.slice(0, 20))
      .input('email', sql.NVarChar(200), email ? email.slice(0, 200) : null)
      .input('source', sql.NVarChar(50), 'email')
      .input('note', sql.NVarChar(sql.MAX), note)
      .input('zone', sql.NVarChar(100), province ? province.slice(0, 100) : null)
      .input('residence', sql.NVarChar(30), residence ? residence.slice(0, 30) : null)
      .input('roof_shape', sql.NVarChar(20), roof ? roof.slice(0, 20) : null)
      .input('monthly_bill', sql.Decimal(12, 2), monthlyBill)
      .input('gmail_id', sql.NVarChar(64), id)
      .query(`
        INSERT INTO leads (
          full_name, phone, email, source, status, note,
          zone, pre_residence_type, pre_roof_shape, pre_monthly_bill,
          gmail_message_id, contact_date, created_at
        ) VALUES (
          @full_name, @phone, @email, @source, 'pre_survey', @note,
          @zone, @residence, @roof_shape, @monthly_bill,
          @gmail_id, GETDATE(), GETDATE()
        )
      `);
    imported++;
  } catch (e) {
    console.error(`error on ${id}:`, e.message);
    errors++;
  }
}

console.error(`\n${DRY ? '[dry-run] ' : ''}imported=${imported}  skipped=${skipped}  errors=${errors}`);
await pool.close();
