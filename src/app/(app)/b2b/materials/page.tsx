"use client";

import B2bPagePlaceholder from "@/components/b2b/B2bPagePlaceholder";

// Master Data วัสดุ — Solar B2B กรอกข้อมูลรายการ · Purchase ใส่/ปรับราคา · admin ได้ทั้งคู่
export default function B2bMaterialsPage() {
  return (
    <B2bPagePlaceholder
      fallbackTitle="Master Data วัสดุ"
      roles={["b2b", "purchase", "admin"]}
      phase="เฟส 2"
      points={[
        "รายการวัสดุ / ค่าบริการ อ้างอิง sheet Unit price Material จัดกลุ่มตามหมวดและหัวข้อย่อย",
        "Solar B2B เพิ่ม / แก้ข้อมูลรายการ · ราคาแก้ไม่ได้",
        "Purchase ใส่ / ปรับราคาต่อหน่วย พร้อมประวัติราคา · ตัวกรอง \"รอราคา\"",
        "นำเข้าข้อมูลตั้งต้นจากไฟล์ Excel",
      ]}
    />
  );
}
