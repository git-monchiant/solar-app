import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["senasolar.ngrok.app", "172.22.40.9"],
  devIndicators: false,
  output: "standalone",
  // เอกสารของลูกค้าห้าม cache ที่ Cloudflare — URL ลงท้าย .pdf ถูก Cloudflare เก็บไว้
  // เองอัตโนมัติ 4 ชั่วโมงเมื่อ origin ไม่ส่ง Cache-Control ผลคือแก้ข้อมูลแล้วสร้างไฟล์ใหม่
  // แต่ลูกค้ายังเห็นฉบับเก่า (ใบเสนอราคาลีด 1070 ยังขึ้นค่าไฟ 999,999 หลังแก้ 25 ก.ย. 2569)
  // และเอกสารที่มีชื่อ ที่อยู่ เลขบัตรประชาชน ไม่ควรค้างอยู่ใน cache สาธารณะ
  async headers() {
    return [
      {
        source: "/api/:doc(quotation-pdf|survey-report|warranty|huawei-warranty|receipt|invoice|install-doc)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
