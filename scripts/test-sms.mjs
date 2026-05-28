// Quick manual test for the SMSMKT (Clicknext) text-SMS endpoint.
// Run: node --env-file=.env.local scripts/test-sms.mjs [phone] [message]
//   node --env-file=.env.local scripts/test-sms.mjs 0859099890 "ทดสอบส่ง SMS"

const API_URL = process.env.SMSMKT_API_URL || "https://portal-otp.smsmkt.com/api";
const API_KEY = process.env.SMSMKT_API_KEY;
const SECRET_KEY = process.env.SMSMKT_SECRET_KEY;
const SENDER = process.env.SMSMKT_SENDER;
const PROJECT_ID = process.env.SMSMKT_PROJECT_ID;

const phone = process.argv[2] || "0859099890";
const message = process.argv[3] || "ทดสอบส่ง SMS จาก SENA Solar";

if (!API_KEY || !SECRET_KEY) {
  console.error("Missing SMSMKT_API_KEY / SMSMKT_SECRET_KEY in env");
  process.exit(1);
}
if (!SENDER) {
  console.error("Missing SMSMKT_SENDER (approved sender name) in env");
  process.exit(1);
}

const body = {
  message,
  phone,
  sender: SENDER,
  ...(PROJECT_ID ? { project_id: PROJECT_ID } : {}),
};

console.log("POST", `${API_URL}/send-message`);
console.log("body:", body);

const res = await fetch(`${API_URL}/send-message`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    api_key: API_KEY,
    secret_key: SECRET_KEY,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("\nHTTP", res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
