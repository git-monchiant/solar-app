// วงหมุนโหลดหน้า/พื้นที่เนื้อหา — base component ที่เดียวทั้งแอป
// จุดสำคัญ: min-h อิง viewport (ไม่พึ่งความสูง parent) — ของเดิมใช้ h-full ซึ่งยุบ
// เมื่อ parent ไม่ full height ทำให้วงหมุนไปกองอยู่ชิดบนแทนที่จะอยู่กลางจอ
export default function Loading({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center min-h-[55vh] ${className}`}>
      <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
