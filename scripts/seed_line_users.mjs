import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const thaiNames = [
  "สมชาย", "สมหญิง", "วิชัย", "นิตยา", "ประเสริฐ", "สุภาพร", "อนุชา", "พรทิพย์", "ธนากร", "จันทร์เพ็ญ",
  "กิตติ", "มาลี", "วรพจน์", "สุดา", "เกรียงศักดิ์", "รัตนา", "ภาณุพงศ์", "วันดี", "อภิชาติ", "นภาพร",
  "สุรชัย", "พิมพ์ใจ", "ชัยวัฒน์", "อรุณี", "ปิยะ", "สาวิตรี", "ณัฐพล", "กัลยา", "วิทยา", "ลัดดา",
  "พิชิต", "เพ็ญศรี", "สราวุธ", "อัมพร", "ธีระ", "บุญมี", "นครินทร์", "ศิริพร", "อดิศร", "พัชรี",
  "วสันต์", "จิราภรณ์", "เอกชัย", "ดวงใจ", "ไพบูลย์", "สุกัญญา", "มนตรี", "รุ่งนภา", "ศักดิ์ชัย", "วาสนา",
  "บุญเลิศ", "กนกวรรณ", "สุเทพ", "อุบล", "วิโรจน์", "สมศรี", "ประสิทธิ์", "จุฑามาศ", "อำนาจ", "พิศมัย",
  "สมพงษ์", "นิภา", "ชาติชาย", "รัชนี", "สุรศักดิ์", "สุนีย์", "พิทักษ์", "ปราณี", "กฤษณะ", "บุปผา",
  "วัชระ", "เสาวลักษณ์", "ณรงค์", "ดวงดาว", "สุพจน์", "ลำไย", "เดชา", "กุสุมา", "สมบัติ", "แสงเดือน",
  "อุดม", "จารุณี", "วีระ", "เรณู", "ทวี", "พรพิมล", "มานพ", "สุวรรณา", "ยุทธนา", "อำพร",
  "พิสิษฐ์", "สุพรรณี", "โกวิท", "กาญจนา", "นิพนธ์", "พนิดา", "สมเกียรติ", "วัลลภา", "พรเทพ", "จินตนา",
];

const lastNames = [
  "แสงจันทร์", "บุญมาก", "ทองดี", "สุขสวัสดิ์", "พงศ์ประยูร", "ศรีสุข", "ชัยชนะ", "มั่นคง",
  "เจริญผล", "สว่างวงศ์", "รักษ์ธรรม", "วิไลลักษณ์", "กิจเจริญ", "ดีมาก", "สิริโสภา",
  "ปิยะนาถ", "อุดมศักดิ์", "ชาญวิทย์", "เพชรดี", "ศิลปสุข",
];

for (let i = 0; i < 100; i++) {
  const firstName = thaiNames[i % thaiNames.length];
  const lastName = lastNames[i % lastNames.length];
  const displayName = `${firstName} ${lastName}`;
  const lineUserId = `U${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 33);

  await pool.request()
    .input('line_user_id', sql.NVarChar(100), lineUserId)
    .input('display_name', sql.NVarChar(200), displayName)
    .input('last_message_at', sql.DateTime2, new Date(Date.now() - Math.random() * 7 * 86400000))
    .query(`INSERT INTO line_users (line_user_id, display_name, last_message_at) VALUES (@line_user_id, @display_name, @last_message_at)`);
}

console.log('Seeded 100 LINE users');
await pool.close();
