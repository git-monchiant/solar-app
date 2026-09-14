import assert from "node:assert/strict";
import {
  BANGKOK_DISTRICTS,
  THAI_PROVINCES,
  normalizeProvince,
  parseThaiLocation,
  stripAdminPrefix,
} from "../../src/lib/thai-location.ts";

// ทุกเคสในไฟล์นี้เป็นค่าจริงที่มีอยู่ใน leads.installation_address หรือ
// projects.district/province ไม่ใช่ตัวอย่างสมมติ — ถ้าแก้ parser แล้วเคสไหนตก
// แปลว่าข้อมูลลูกค้าจริงจะ backfill ผิดตาม

{
  assert.equal(THAI_PROVINCES.length, 77, "ต้องมีครบ 77 จังหวัด");
  assert.equal(BANGKOK_DISTRICTS.length, 50, "กรุงเทพฯ มี 50 เขต");
  assert.equal(new Set(THAI_PROVINCES).size, 77, "ชื่อจังหวัดห้ามซ้ำ");
  assert.equal(new Set(BANGKOK_DISTRICTS).size, 50, "ชื่อเขตห้ามซ้ำ");
}

// ตัดคำนำหน้าหน่วยการปกครอง — ต้องตัดคำยาวก่อนคำสั้นเสมอ
{
  assert.equal(stripAdminPrefix("อำเภอลำลูกกา"), "ลำลูกกา");
  assert.equal(stripAdminPrefix("เขตคันนายาว"), "คันนายาว");
  assert.equal(stripAdminPrefix("จังหวัดปทุมธานี"), "ปทุมธานี");
  assert.equal(stripAdminPrefix("จ.ปทุมธานี"), "ปทุมธานี");
  // "ตำบล" ซ่อนอยู่ท้าย "องค์การบริหารส่วนตำบล" — ถ้าตัดคำสั้นก่อนจะเหลือขยะ
  assert.equal(stripAdminPrefix("องค์การบริหารส่วนตำบลบางเสาธง"), "บางเสาธง");
  // ชื่อที่ไม่มีคำนำหน้าต้องไม่ถูกแตะ
  assert.equal(stripAdminPrefix("ลำลูกกา"), "ลำลูกกา");
}

// ชื่อเล่นกรุงเทพฯ ทุกแบบที่เซลส์พิมพ์จริง
{
  for (const alias of ["กทม", "กทม.", "กรุงเทพ", "กรุงเทพฯ", "กรุงเทพมหานคร", "บางกอก"])
    assert.equal(normalizeProvince(alias), "กรุงเทพมหานคร", `alias ${alias}`);
  assert.equal(normalizeProvince("จังหวัดสมุทรปราการ"), "สมุทรปราการ");
  assert.equal(normalizeProvince("ไม่ใช่จังหวัด"), null);
  assert.equal(normalizeProvince(""), null);
  assert.equal(normalizeProvince(null), null);
}

// ค่าที่ไม่มีข้อมูลพื้นที่ ต้องคืน null ทั้งคู่ — "ไม่รู้" ดีกว่า "เดาผิด"
{
  for (const junk of ["87/74", "149/31", "-", "", "   ", null, undefined]) {
    const got = parseThaiLocation(junk);
    assert.deepEqual(got, { district: null, province: null }, `junk: ${junk}`);
  }
}

// จังหวัดเดี่ยว ๆ (รูปแบบที่เว็บฟอร์มส่งมา — 75 ลีดเป็น "กรุงเทพมหานคร" เฉย ๆ)
{
  assert.deepEqual(parseThaiLocation("กรุงเทพมหานคร"), { district: null, province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("กทม"), { district: null, province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("นครศรีธรรมราช"), { district: null, province: "นครศรีธรรมราช" });
  assert.deepEqual(parseThaiLocation("ประจวบคีรีขันธ์"), { district: null, province: "ประจวบคีรีขันธ์" });
}

// รูปแบบ "<อำเภอ> <จังหวัด>" ที่เซลส์พิมพ์กันบ่อย
{
  assert.deepEqual(parseThaiLocation("บางบัวทอง นนทบุรี"), { district: "บางบัวทอง", province: "นนทบุรี" });
  assert.deepEqual(parseThaiLocation("ปากเกร็ด นนทบุรี"), { district: "ปากเกร็ด", province: "นนทบุรี" });
  assert.deepEqual(parseThaiLocation("บางพลี สมุทรปราการ"), { district: "บางพลี", province: "สมุทรปราการ" });
  assert.deepEqual(parseThaiLocation("ลำลูกกา ปทุมธานี"), { district: "ลำลูกกา", province: "ปทุมธานี" });
}

// จังหวัดมาก่อน แล้วตามด้วยข้อความที่ไม่ใช่อำเภอ — ห้ามเดาอำเภอ
{
  assert.deepEqual(parseThaiLocation("ปทุมธานี คลอง 4"), { district: null, province: "ปทุมธานี" });
  assert.deepEqual(parseThaiLocation("ปทุมธานี บ้านเดี่ยว"), { district: null, province: "ปทุมธานี" });
}

// ชื่อเขตกรุงเทพฯ ลอย ๆ ต้องเดาจังหวัดย้อนกลับได้
{
  assert.deepEqual(parseThaiLocation("คลองสามวา"), { district: "คลองสามวา", province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("ประเวศ กทม"), { district: "ประเวศ", province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("พัฒนาการ สวนหลวง กทม"), { district: "สวนหลวง", province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("ธนบุรี"), { district: "ธนบุรี", province: "กรุงเทพมหานคร" });
}

// ชื่ออำเภอในพื้นที่ให้บริการลอย ๆ ก็ต้องเดาจังหวัดย้อนกลับได้
{
  assert.deepEqual(parseThaiLocation("ลำลูกกา คลอง 4"), { district: "ลำลูกกา", province: "ปทุมธานี" });
}

// หมายเหตุในวงเล็บและรหัสไปรษณีย์ต้องไม่รบกวนการ parse
{
  assert.deepEqual(parseThaiLocation("ปทุมธานี (ลูกค้าบูธออมสิน)"), { district: null, province: "ปทุมธานี" });
  assert.deepEqual(parseThaiLocation("ลาดพร้าว (ลูกค้าจากบูธ Toshiba)"), { district: "ลาดพร้าว", province: "กรุงเทพมหานคร" });
  assert.deepEqual(parseThaiLocation("ลาดกระบัง กรุงเทพมหานคร "), { district: "ลาดกระบัง", province: "กรุงเทพมหานคร" });
}

// ที่อยู่เต็มรูปแบบ — คำนำหน้าชัดเจนต้องชนะทุกกฎ
{
  assert.deepEqual(
    parseThaiLocation("บ้านเลขที่ 5/2 ซ.สวรรค์วิถี แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพมหานคร 10310"),
    { district: "ห้วยขวาง", province: "กรุงเทพมหานคร" },
  );
  assert.deepEqual(
    parseThaiLocation("โรงงานเพชรสว่างเกิด การโยธา จำกัด ตำบลคลองควาย อำเภอสามโคก จ.ปทุมธานี"),
    { district: "สามโคก", province: "ปทุมธานี" },
  );
  assert.deepEqual(
    parseThaiLocation("50/119 หมู่ 2 หมู่บ้านสถาพร ซอย 38 ถนนรังสิต-นครนายก คลอง 3 ตำบลบึงยี่โถ อ.ธัญบุรี จ.ปทุมธานี 12130"),
    { district: "ธัญบุรี", province: "ปทุมธานี" },
  );
}

// กับดักชื่อซ้อนกัน — ภาษาไทยไม่เว้นวรรค ชื่อสั้นจึงหลุดไปโผล่กลางคำอื่นได้
{
  // "พระนคร" (เขต กทม.) ซ่อนอยู่ใน "พระนครศรีอยุธยา"
  assert.deepEqual(parseThaiLocation("พระนครศรีอยุธยา"), { district: null, province: "พระนครศรีอยุธยา" });
  // "ตาก" ซ่อนอยู่ใน "ตากสิน"
  assert.deepEqual(parseThaiLocation("ถนนตากสิน คลองสาน กทม"), { district: "คลองสาน", province: "กรุงเทพมหานคร" });
  // "เลย" ซ่อนอยู่ใน "เลยไป"
  assert.deepEqual(parseThaiLocation("เลยไปทางบางพลี"), { district: "บางพลี", province: "สมุทรปราการ" });
  // แต่ชื่อสั้นที่ยืนเดี่ยวจริง ๆ ต้องยังจับได้
  assert.deepEqual(parseThaiLocation("ตาก"), { district: null, province: "ตาก" });
  assert.deepEqual(parseThaiLocation("จ.ตาก"), { district: null, province: "ตาก" });
  // "นครศรีธรรมราช" ต้องไม่ถูกชื่อจังหวัดสั้นกว่าแย่งไปก่อน
  assert.equal(parseThaiLocation("อยู่ที่นครศรีธรรมราช").province, "นครศรีธรรมราช");
}

console.log("thai-location tests passed");
