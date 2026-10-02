"use client";

// ใบเสร็จของค่าบริการ O&M 1 ก้อน — 2 ต.ค. 69 ผู้ใช้สั่ง "ทำเหมือนฝั่งขาย"
// ★ ยกแถวใบเสร็จของ InstallmentReceiptList ฝั่งขาย (โหมด compact) มาทั้งก้อน
//   ยังไม่มีใบเสร็จตัวจริง = ปุ่มใบเสร็จรับเงินชั่วคราว (PDF stage om) · แนบตัวจริงแล้วปุ่มชั่วคราวหายแบบฝั่งขาย
//   แนบ/ลบได้เฉพาะ admin + account (สิทธิ์ใน ActualReceiptUpload) · คนอื่นเห็นไฟล์อย่างเดียว
// ★ ใช้ที่ขั้นชำระเงินของงานบริการ + หน้ารายรับ O&M (Account เข้าโมดูล O&M ไม่ได้ แนบจากหน้ารายรับแทน)
import ReceiptButtons from "@/components/lead/detail/ReceiptButtons";
import ActualReceiptUpload from "@/components/lead/detail/ActualReceiptUpload";

export type OmReceiptPay = { id: number; lead_id: number; actual_receipt_url: string | null };

export default function OmReceiptRow({ pay, docNo, onChanged }: {
  /** แถว payments ที่ Account ยืนยันรับเงินแล้ว */
  pay: OmReceiptPay;
  /** เลขใบเสนอราคา — ตั้งชื่อไฟล์ */
  docNo: string;
  onChanged: () => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 md:inline-flex md:items-center md:gap-2">
      {!pay.actual_receipt_url && (
        <ReceiptButtons leadId={pay.lead_id} stage="om" paymentId={pay.id}
          fileLabel={`${docNo}_receipt`} modalLabel={`ใบเสร็จ ${docNo}`} compact />
      )}
      <ActualReceiptUpload leadId={pay.lead_id} paymentId={pay.id} url={pay.actual_receipt_url}
        fileLabel={docNo} refresh={onChanged} compact />
    </div>
  );
}
