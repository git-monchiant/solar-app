import QRCode from "qrcode";
import fs from "fs";

function tlv(tag, value) { return tag + value.length.toString().padStart(2, "0") + value; }
function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function build({billerId, ref1, ref2, merchantName, terminal, amount}) {
  const merchant =
    tlv("00", "A000000677010112") +
    tlv("01", billerId) +
    tlv("02", ref1) +
    (ref2 ? tlv("03", ref2) : "");
  const hasAmount = amount > 0;
  const core =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") +
    tlv("30", merchant) +
    tlv("53", "764") +
    (hasAmount ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "TH") +
    tlv("59", (merchantName || "SENA SOLAR").slice(0, 25)) +
    (terminal ? tlv("62", tlv("07", terminal)) : "");
  const withPrefix = core + "6304";
  return withPrefix + crc16(withPrefix);
}

const payload = build({
  billerId: "010753700001716",
  ref1: "87UX",
  ref2: "86289573",
  merchantName: "Digio",
  terminal: "SDGO862842802640220",
  amount: 1,
});

console.log("payload:");
console.log(payload);
console.log("\nlength:", payload.length);

const outPath = "/tmp/test_qr_1baht.png";
await QRCode.toFile(outPath, payload, { width: 600, margin: 2 });
console.log("\nPNG saved:", outPath);
