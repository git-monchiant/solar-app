import sql from 'mssql';

const projects = [
  "เสนา วิลล์ - คลอง 1", "J City เสนา", "J Villa เสนา - คลอง 1",
  "J Town จังหิล - คลอง 1", "Exclusive วิลล์", "เสนา วีราชิณเมศร์ - บางบัวทอง",
  "เสนา วิลเลจ กม.9", "เสนา วิว่า รัตนาธิเบศร์ - บางบัวทอง",
  "เสนา เวล่า รังสิต - คลอง 1", "J City สุขุมวิท - แพรกษา",
  "เสนา วิลเลจ สุขุมวิท - แพรกษา", "เสนา อเวนิว 2 รังสิต - คลอง 1",
  "J Town1 รังสิต - คลอง 1", "J Town2 รังสิต - คลอง 1",
  "J Villa รังสิต - คลอง 1", "J Exclusive รังสิต - คลอง 1",
];

const titleMale = ["นาย"];
const titleFemale = ["นาง", "นางสาว"];
const firstNames = [
  "สมชาย", "วิชัย", "สุรชัย", "ประเสริฐ", "สุทธิชัย", "ธนวัฒน์", "พงษ์ศักดิ์", "ชัยวัฒน์",
  "วีระ", "สมศักดิ์", "กิตติ", "อภิชาติ", "ณัฐพล", "ปัญญา", "สมพงษ์", "มงคล",
  "สมหญิง", "สุดา", "มาลี", "กัลยา", "นิภา", "พรทิพย์", "ยุพา", "วาสนา",
  "สุภาพร", "อรุณี", "จิรา", "ภัทรา", "นันทนา", "พิมพ์", "ธิดา", "ชนิดา",
];
const surnames = [
  "แสงทอง", "สุขสวัสดิ์", "ใจดี", "รุ่งเรือง", "ทองดี", "ศรีสุข", "วงศ์ทอง",
  "บุญมา", "พันธ์ทอง", "จันทร์ฉาย", "ยิ้มแย้ม", "เจริญพร", "ทวีทรัพย์",
  "มีชัย", "สายสุวรรณ", "รัตนากร", "ประสิทธิ์", "อินทร์สุข", "พูลสวัสดิ์",
  "สุวรรณเลิศ", "บุญรอด", "กมลทิพย์", "เกียรติยศ", "เพชรรัตน์",
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function genName() {
  const isFemale = Math.random() < 0.5;
  const title = rand(isFemale ? titleFemale : titleMale);
  return `${title}${rand(firstNames)} ${rand(surnames)}`;
}

function genPhone() {
  const prefix = Math.random() < 0.5 ? "08" : "09";
  return prefix + String(randInt(10000000, 99999999));
}

function genStatus() {
  const r = Math.random();
  // 50% pending, 15% contacted, 20% interested, 15% not_interested
  if (r < 0.50) return { interest: null, interest_type: null, visited: false, note: null };
  if (r < 0.65) {
    // contacted
    const sub = Math.random();
    if (sub < 0.5) return { interest: "not_home", interest_type: null, visited: true, note: null };
    return { interest: null, interest_type: null, visited: true, note: rand(["ไปใหม่อีกครั้ง", "ฝากเบอร์ไว้", "ขอคิดดูก่อน"]) };
  }
  if (r < 0.85) {
    // interested
    const type = Math.random() < 0.7 ? "new" : "upgrade";
    return {
      interest: "interested",
      interest_type: type,
      visited: true,
      note: rand([null, "สนใจมาก นัดเสนอราคา", "ต้องการข้อมูลเพิ่มเติม", "อยากทราบราคาแพ็คเกจ"]),
    };
  }
  // not_interested
  return {
    interest: "not_interested",
    interest_type: null,
    visited: true,
    note: rand([null, "ไม่สนใจ", "มีแผงอยู่แล้ว", "งบไม่พอ"]),
  };
}

function genExistingSolar() {
  // 15% chance of existing solar
  if (Math.random() < 0.15) {
    const kw = [3.3, 5.0, 5.5, 10, 15][randInt(0, 4)];
    return { existing_solar: "มี", installed_kw: kw, installed_product: rand(["Jinko", "Canadian Solar", "Huawei", "Growatt"]) };
  }
  return { existing_solar: null, installed_kw: null, installed_product: null };
}

const pool = await sql.connect({
  server: "172.41.1.73", port: 1433, user: "monchiant", password: "monchiant",
  database: "solardb", options: { encrypt: false, trustServerCertificate: true },
});

// Get max existing seq
const maxSeq = (await pool.request().query('SELECT MAX(seq) as m FROM prospects')).recordset[0].m || 0;
let seq = maxSeq;

let total = 0;
for (let pi = 0; pi < projects.length; pi++) {
  const projName = projects[pi];
  const count = randInt(15, 20);
  const baseLot = 100 + pi * 50;
  const usedHouses = new Set();
  for (let i = 0; i < count; i++) {
    seq++;
    let houseNum;
    do {
      houseNum = `${baseLot}/${randInt(1, 200)}`;
    } while (usedHouses.has(houseNum));
    usedHouses.add(houseNum);

    const name = genName();
    const phone = Math.random() < 0.85 ? genPhone() : null;
    const s = genStatus();
    const es = genExistingSolar();

    const req = pool.request()
      .input('seq', sql.Int, seq)
      .input('project_name', sql.NVarChar(200), projName)
      .input('house_number', sql.NVarChar(50), houseNum)
      .input('full_name', sql.NVarChar(200), name)
      .input('phone', sql.NVarChar(20), phone)
      .input('interest', sql.NVarChar(20), s.interest)
      .input('interest_type', sql.NVarChar(20), s.interest_type)
      .input('note', sql.NVarChar(sql.MAX), s.note)
      .input('visited_at', sql.DateTime2, s.visited ? new Date(Date.now() - randInt(0, 14) * 86400000) : null)
      .input('existing_solar', sql.NVarChar(50), es.existing_solar)
      .input('installed_kw', sql.Decimal(8, 2), es.installed_kw)
      .input('installed_product', sql.NVarChar(200), es.installed_product);

    await req.query(`
      INSERT INTO prospects (seq, project_name, house_number, full_name, phone, interest, interest_type, note, visited_at, existing_solar, installed_kw, installed_product)
      VALUES (@seq, @project_name, @house_number, @full_name, @phone, @interest, @interest_type, @note, @visited_at, @existing_solar, @installed_kw, @installed_product)
    `);
    total++;
  }
  console.log(`${projName}: +${count}`);
}

console.log(`\nTotal inserted: ${total}`);
const final = await pool.request().query('SELECT COUNT(*) as c FROM prospects');
console.log(`Grand total prospects: ${final.recordset[0].c}`);
await pool.close();
