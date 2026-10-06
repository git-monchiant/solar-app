"use client";

import B2bPagePlaceholder from "@/components/b2b/B2bPagePlaceholder";

// รายการ BOQ — Solar B2B + admin (Purchase ไม่เห็นหน้านี้ · เคาะ 6 ต.ค. 69)
export default function B2bBoqListPage() {
  return (
    <B2bPagePlaceholder
      fallbackTitle="รายการ BOQ"
      roles={["b2b", "admin"]}
      phase="เฟส 3"
      points={[
        "รายการ BOQ ทุกโครงการ · สร้าง BOQ ใหม่ · ออก Revision",
        "หน้าทำ BOQ ตาม sheet EPCL - BOQS: หัวใบ · สรุป 25 หมวด · รายละเอียดทีละหมวด",
        "หมวด 1–18 เลือกรายการจาก Master Data ราคาขึ้นอัตโนมัติ · หมวดเสริม 19–25 ใส่ราคาเองได้",
        "ดาวน์โหลดเป็นไฟล์ Excel (เฟส 4)",
      ]}
    />
  );
}
