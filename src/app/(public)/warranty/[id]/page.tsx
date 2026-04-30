"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Pkg {
  id: number;
  name: string;
  kwp: number;
  has_battery: boolean;
  battery_kwh: number;
  battery_brand: string;
  solar_panels: number;
  panel_watt: number;
  inverter_kw: number;
  inverter_brand: string;
}

interface Data {
  lead: {
    id: number;
    full_name: string;
    phone: string;
    project_name: string | null;
    installation_address: string | null;
    warranty_inverter_sn: string | null;
    warranty_doc_no: string | null;
    warranty_start_date: string | null;
    warranty_end_date: string | null;
    warranty_issued_at: string | null;
    warranty_customer_signature_url: string | null;
    install_customer_signature_url: string | null;
    warranty_system_size_kwp: number | null;
    warranty_panel_count: number | null;
    warranty_panel_watt: number | null;
    warranty_panel_brand: string | null;
    warranty_inverter_brand: string | null;
    warranty_inverter_kw: number | null;
    warranty_battery_brand: string | null;
    warranty_battery_kwh: number | null;
    warranty_has_battery: boolean | null;
  };
  package: Pkg | null;
  signer: { full_name: string; signature_url: string | null } | null;
}

const CO = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  nameTh: "บริษัท เสนาโซลาร์ เอนเนอร์ยี่ จำกัด",
  address: "448 RATCHADAPHISEK RD., SAM SEN NOK, HUAI KHWANG, BANGKOK 10310",
  taxId: "0105552041258",
  phone: "02-541-4642 ต่อ 10303",
  hotline: "089-834-3333",
  email: "SERVICES_SSE@SENASOLARENERGY.COM",
};

// Use Thai Buddhist calendar (พ.ศ.) — toLocaleDateString("th-TH") alone still
// returns Gregorian year in some runtimes; the BCP-47 -u-ca-buddhist extension
// forces พ.ศ. consistently in browser + puppeteer.
const fmt = (d: string | null) => {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH-u-ca-buddhist", { day: "numeric", month: "long", year: "numeric" });
};
const fmtLong = (d: string | null) => {
  if (!d) return "……………………….";
  return new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH-u-ca-buddhist", { day: "numeric", month: "long", year: "numeric" });
};

export default function WarrantyPage() {
  const { id } = useParams();
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    const userId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("user_id") : null;
    const qs = userId ? `?user_id=${userId}` : "";
    fetch(`/api/warranty/${id}/data${qs}`).then(r => r.json()).then(setD).catch(console.error);
  }, [id]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary animate-spin" /></div>;

  const { lead, package: pkg } = d;
  // Prefer warranty_* equipment snapshot (entered by staff to reflect actual
  // installed equipment); fall back to the package for older leads.
  const sysKwp = lead.warranty_system_size_kwp ?? pkg?.kwp ?? null;
  const pnlCount = lead.warranty_panel_count ?? pkg?.solar_panels ?? null;
  const pnlWatt = lead.warranty_panel_watt ?? pkg?.panel_watt ?? null;
  const pnlBrand = lead.warranty_panel_brand ?? "";
  const invBrand = lead.warranty_inverter_brand ?? pkg?.inverter_brand ?? "";
  const invKw = lead.warranty_inverter_kw ?? pkg?.inverter_kw ?? null;
  const battBrand = lead.warranty_battery_brand ?? pkg?.battery_brand ?? "";
  const battKwh = lead.warranty_battery_kwh ?? pkg?.battery_kwh ?? null;
  const hasBattery = lead.warranty_has_battery ?? !!pkg?.has_battery;

  const defaultDocNo = `SSE${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`;
  const docNo = lead.warranty_doc_no || defaultDocNo;
  const sizeSpec = sysKwp != null ? `${sysKwp} kWp` : "—";
  const panelSpec = pnlCount && pnlWatt ? `${pnlCount} แผง × ${pnlWatt}W${pnlBrand ? ` · ${pnlBrand}` : ""}` : "—";
  const inverterSpec = invBrand || invKw != null ? `${invBrand} ${invKw != null ? `${invKw}kW` : ""}`.trim() : "—";
  const batterySpec = hasBattery ? `${battBrand}${battKwh != null ? ` ${battKwh}kWh` : ""}`.trim() || "—" : "—";

  return (
    <div className="bg-gray-100 min-h-screen py-4 print:py-0 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { body { margin: 0; background: white; } }
        /* Table-based running header/footer — Chrome repeats thead + tfoot on every printed page */
        table.doc { border-collapse: collapse; width: 100%; }
        table.doc thead { display: table-header-group; }
        table.doc tfoot { display: table-footer-group; }
        table.doc td { padding: 0; vertical-align: top; }
        .strip-header, .strip-footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        .strip-header { height: 20mm; box-sizing: border-box; padding-top: 4mm !important; padding-bottom: 4mm !important; }
        .tbody-pull-up { margin-top: -5mm; }
        .warranty-body h2 { break-after: avoid; page-break-after: avoid; }
        .warranty-body ol, .warranty-body ul { break-inside: avoid; page-break-inside: avoid; }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      `}</style>
      <div className="warranty-body mx-auto bg-white shadow-xl print:shadow-none text-[12px] text-gray-900" style={{ width: "210mm", minHeight: "297mm", fontFamily: "'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" }} id="warranty">
        <table className="doc">
          <thead>
            <tr>
              <td>
                <div className="strip-header bg-primary text-white px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[16px] leading-tight tracking-wide">{CO.name}</div>
                      <div className="text-[11px] opacity-90 leading-snug mt-1">{CO.address}</div>
                      <div className="text-[11px] opacity-90 leading-snug">TAX ID: {CO.taxId} · TEL: {CO.phone}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider opacity-80 leading-tight">Warranty Certificate</div>
                      <div className="text-[16px] font-bold leading-tight mt-0.5">หนังสือรับประกัน</div>
                    </div>
                  </div>
                </div>
                <div style={{ height: "5mm" }} aria-hidden="true" />
              </td>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>
                {/* Ref + Date */}
                <div className="tbody-pull-up px-5 py-2.5 flex justify-between items-center border-b border-gray-100">
                  <span className="text-[12px] text-gray-500">DOCUMENT NO: <span className="text-gray-900 font-bold text-[18px] tracking-wider ml-1">{docNo}</span></span>
                  <span className="text-[12px] text-gray-500">DATE: <span className="text-gray-800 font-semibold">{fmt(lead.warranty_issued_at || lead.warranty_start_date)}</span></span>
                </div>

                {/* Body */}
                <div className="px-5 py-4 flex flex-col gap-4 leading-[1.55]">
                  <div className="avoid-break">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">CUSTOMER INFORMATION</div>
                    <div className="grid grid-cols-[70px_1fr] gap-y-1 text-[12px]">
                      <span className="text-gray-400">NAME</span><span className="text-gray-900 font-semibold">{lead.full_name}</span>
                      {lead.phone && (<><span className="text-gray-400">PHONE</span><span className="text-gray-800">{lead.phone}</span></>)}
                      {lead.project_name && (<><span className="text-gray-400">PROJECT</span><span className="text-gray-800">{lead.project_name}</span></>)}
                      {lead.installation_address && (<><span className="text-gray-400">ADDRESS</span><span className="text-gray-800">{lead.installation_address}</span></>)}
                    </div>
                  </div>

                  <div className="border border-gray-200 overflow-hidden avoid-break">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ (บนหลังคา)</div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      <Spec label="SYSTEM SIZE" value={sizeSpec} />
                      <Spec label="SOLAR PANELS" value={panelSpec} />
                      <Spec label="INVERTER" value={inverterSpec} />
                      {hasBattery && <Spec label="BATTERY" value={batterySpec} />}
                      <Spec label="INVERTER SERIAL NUMBER" value={lead.warranty_inverter_sn || "—"} />
                      <Spec label="ON-SITE SERVICE" value="ล้างแผง / ตรวจเช็คระบบ 4 ครั้ง / 2 ปี" />
                    </div>
                    <div className="px-4 py-3 bg-active-light/30 flex items-end justify-between border-t border-gray-200">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500">WARRANTY PERIOD · ระยะเวลารับประกันการติดตั้ง 2 ปี</div>
                      <div className="text-[13px] font-bold text-gray-900">
                        {fmtLong(lead.warranty_start_date)} <span className="text-gray-400 mx-1">—</span> {fmtLong(lead.warranty_end_date)}
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] indent-6">
                    <strong>{CO.nameTh}</strong> ("บริษัทฯ") ขอรับรองการติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ให้แก่ลูกค้า ภายใต้เงื่อนไขดังต่อไปนี้
                  </p>

                  <Section title="1. ระยะเวลาการรับประกันอุปกรณ์" avoidBreak={false}>
                    <p className="indent-6">กรณีที่ระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์เกิดปัญหาหรือความขัดข้อง สืบเนื่องจากตัวแผงเซลล์แสงอาทิตย์ (PV MODULES) เครื่องแปลงกระแสไฟฟ้า (INVERTER) ลูกค้าจะต้องเรียกร้องเอาประกันตามเงื่อนไขการรับประกันจากผู้ผลิตสินค้าแต่ละรายได้โดยตรง ทั้งนี้ บริษัทฯ ตกลงจะเป็นผู้ประสานงานกับผู้ผลิตให้แก่ลูกค้า หากปัญหาหรือความขัดข้องดังกล่าวเกิดขึ้นภายในระยะเวลาประกัน นับแต่วันที่บริษัทฯ ติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ให้กับลูกค้าแล้วเสร็จ</p>
                    <p className="mt-1.5">รายชื่อผู้ผลิตสินค้าที่รับประกันสินค้า:</p>
                    <ol className="list-decimal pl-6 space-y-0.5">
                      <li>ผู้ผลิตแผงเซลล์แสงอาทิตย์ (PV MODULES) : PRODUCTION WARRANTY และ PERFORMANCE WARRANTY รับประกันจากผู้ผลิตโดยตรง</li>
                      <li>ผู้ผลิตเครื่องแปลงไฟฟ้า (INVERTER) : การรับประกันมาตรฐาน รับประกันจากผู้ผลิตโดยตรง</li>
                      {hasBattery && <li>แบตเตอรี่ (BATTERY) : ระยะเวลารับประกัน รับประกันจากผู้ผลิตโดยตรง</li>}
                    </ol>
                    <p className="mt-1.5 indent-6">เงื่อนไขการรับประกันเป็นไปตามที่ผู้ผลิตกำหนด โดยบริษัทฯ จำกัดความรับผิดตามเงื่อนไขที่ผู้ผลิตและ/หรือ ผู้จัดจำหน่ายกำหนด แม้จะอยู่ในการประกัน แต่หากมีค่าใช้จ่ายใดที่เงื่อนไขการรับประกันไม่ครอบคลุม ลูกค้าจะต้องรับผิดชอบค่าใช้จ่ายในส่วนดังกล่าวเองแต่เพียงฝ่ายเดียว สำหรับอุปกรณ์อื่นๆ ซึ่งเป็นอุปกรณ์ที่มีอายุการใช้งานจำกัด ลูกค้าจะต้องทำการเปลี่ยนใหม่ตามอายุการใช้งานด้วยค่าใช้จ่ายของลูกค้าเองทั้งสิ้น</p>
                    <p className="mt-1.5 indent-6">ในกรณีสินค้าเสียหายในช่วงระยะเวลารับประกันสินค้า แต่พ้นระยะเวลารับประกันการติดตั้ง 2 ปีแล้ว ลูกค้าอาจจะต้องชำระบริการสำรวจ, ค่าขนส่ง, ค่าบริการรื้อถอน และค่าติดตั้งสินค้าใหม่ทดแทน เพิ่มเติมตามเงื่อนไขที่บริษัทฯ กำหนด</p>
                  </Section>

                  <Section title="2. ระยะเวลาการรับประกันการติดตั้ง">
                    <p className="indent-6">กรณีที่ระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์เกิดปัญหาหรือความขัดข้อง สืบเนื่องจากการติดตั้งโดยบริษัทฯ บริษัทฯ จะรับประกันการติดตั้งดังกล่าว ภายในระยะเวลารับประกัน นับแต่วันที่บริษัทฯ ติดตั้งให้แล้วเสร็จ เฉพาะกรณีดังนี้</p>
                    <ol className="list-decimal pl-6">
                      <li>ความบกพร่องจากการติดตั้งที่ไม่เป็นไปตามมาตรฐานวิศวกรรม</li>
                      <li>การเชื่อมต่อระบบที่ผิดพลาดจากการดำเนินงานของบริษัทฯ</li>
                    </ol>
                    <p className="mt-1.5 indent-6">บริษัทฯ ขอสงวนสิทธิ์ในการพิจารณาวิธีการแก้ไข ไม่ว่าจะเป็นการซ่อมแซมหรือเปลี่ยนอะไหล่ ในกรณีจำเป็นต้องเปลี่ยนอะไหล่หรือวัสดุ บริษัทฯ ขอสงวนสิทธิ์ในการพิจารณาใช้อะไหล่หรือวัสดุเทียบเท่า ซึ่งอาจมีลักษณะ รูปทรง คุณสมบัติ แตกต่างจากอะไหล่หรือวัสดุเดิมได้</p>
                  </Section>

                  <Section title="3. โปรแกรมการดูแลระบบ (O&M)">
                    <p className="indent-6">นอกเหนือจากการรับประกันการติดตั้ง บริษัทฯ มีบริการเสริมเป็นโปรแกรมการดูแลระบบโดยไม่มีค่าใช้จ่ายเพิ่มเติม ในช่วงประกันการติดตั้ง ดังนี้</p>
                    <ol className="list-decimal pl-6">
                      <li>ตรวจสอบทางกายภาพของแผงเซลล์แสงอาทิตย์ (PV MODULES)</li>
                      <li>ตรวจสอบโครงสร้างการยึดแผง (MOUNTING STRUCTURES)</li>
                      <li>ตรวจสอบระบบเชื่อมต่อ (CONNECTING AND WIRING)</li>
                      <li>ตรวจสอบเครื่องแปลงไฟ (INVERTER)</li>
                      {hasBattery && <li>ตรวจสอบแบตเตอรี่ (BATTERY)</li>}
                      <li>ตรวจสอบตู้ไฟฟ้าประจำบ้าน (PANEL BOARD)</li>
                      <li>ตรวจสอบอุปกรณ์ป้องกัน (CIRCUIT BREAKER)</li>
                      <li>การให้บริการล้างแผงเซลล์แสงอาทิตย์</li>
                    </ol>
                    <div className="mt-1.5 pl-2">
                      <div className="font-semibold">หมายเหตุ:</div>
                      <ul className="list-disc pl-5 space-y-0.5">
                        <li>บริษัทฯ จะส่งแผนกำหนดการเข้าตรวจสอบล่วงหน้าในแต่ละครั้งทั้ง 2 ปี และจะแจ้งวันที่เข้าดำเนินการผ่านบริษัทบริหารและ/หรือ ลูกค้า ล่วงหน้า 1 เดือน ก่อนเดือนเข้าบริการ</li>
                        <li>หากลูกค้าไม่สะดวก สามารถขอเลื่อนได้ 1 ครั้ง โดยแจ้งล่วงหน้าไม่น้อยกว่า 15 วัน หากเลื่อนเกิน 1 ครั้ง หรือน้อยกว่า 15 วัน จะถือว่าสละสิทธิ์ในการรับบริการครั้งนั้น</li>
                      </ul>
                    </div>
                  </Section>

                  <Section title="4. เงื่อนไขการใช้สิทธิประกัน">
                    <ol className="list-decimal pl-6">
                      <li>หากให้บริษัทฯ ประสานงานกับผู้ผลิตแทน ลูกค้าต้องแสดงหนังสือรับประกันฉบับนี้เพื่อตรวจสอบระยะเวลาสิทธิ</li>
                      <li>การใช้สิทธิประกันการติดตั้ง ลูกค้าจะต้องแสดงหนังสือรับประกันฉบับนี้เช่นกัน บริษัทฯ จะรับประกันเฉพาะในกรณีที่มีการใช้งานตามภาวะปกติและถูกต้องตามหลักวิศวกรรมเท่านั้น</li>
                    </ol>
                  </Section>

                  <Section title="5. เงื่อนไขที่อยู่นอกเหนือการรับประกัน" avoidBreak={false}>
                    <ol className="list-decimal pl-6 space-y-0.5">
                      <li>หมดระยะเวลาการรับประกัน</li>
                      <li>ปัญหาหรือข้อขัดข้องไม่ได้เกิดจากการติดตั้งระบบ</li>
                      <li>มีการแก้ไขซ่อมแซมหรือดัดแปลงโดยไม่ได้รับอนุญาตจากบริษัทฯ</li>
                      <li>การใช้งานไม่ถูกวิธี ขาดการดูแลรักษา หรือเกินขีดความสามารถของระบบ</li>
                      <li>การสึกหรอจากการใช้งานตามปกติ / รอยขีดข่วนภายนอก, คราบเชื้อรา, หรือสีซีดจางที่เกิดขึ้นหลังจากการส่งมอบ</li>
                      <li>อุปกรณ์สิ้นเปลืองหรือหมดอายุเนื่องจากการใช้งานหรือเสื่อมตามอายุ</li>
                      <li>ความเสียหายจากภัยธรรมชาติ น้ำท่วม ฟ้าผ่า พายุ แผ่นดินไหว หรือความผิดปกติที่ไม่เกิดจากการใช้งานปกติ</li>
                      <li>สิ่งของตกกระทบ หรือมีสิ่งแปลกปลอม เช่น นกเข้าไปทำรัง, หนูกัด, รังปลวก</li>
                      <li>ความผิดปกติของระบบไฟฟ้าภายนอก หรือโครงข่ายไฟฟ้า (GRID)</li>
                      <li>เหตุสุดวิสัย (FORCE MAJEURE)</li>
                      <li>ความเสียหายทางอ้อม (INDIRECT DAMAGES)</li>
                      <li>การสูญเสียกำไร รายได้ หรือโอกาสทางธุรกิจ</li>
                      <li>ค่าไฟฟ้าที่คาดว่าจะประหยัดได้</li>
                      <li>ความเสียหายต่อทรัพย์สินอื่น</li>
                      <li>ความรับผิดชอบที่นอกเหนือจากผู้ผลิต/ผู้จัดจำหน่ายกำหนด</li>
                      <li>ค่าบริการสำรวจ, ค่าขนส่ง, ค่ารื้อถอน และค่าติดตั้งสินค้าใหม่ทดแทน กรณีสินค้าเสียในช่วงประกันสินค้าแต่พ้นประกันติดตั้ง 2 ปีแล้ว</li>
                    </ol>
                    <p className="mt-1.5 indent-6">ทั้งนี้ สินค้าทุกประเภทที่อยู่ในระยะเวลารับประกันแต่อยู่นอกเงื่อนไขการรับประกัน หากลูกค้าประสงค์ให้บริษัทฯ ซ่อมแซม บริษัทฯ มีบริการรับซ่อมโดยเรียกเก็บค่าบริการตามอัตราที่บริษัทฯ กำหนด</p>
                  </Section>

                  <p className="text-[11px] text-gray-600 indent-6">
                    เอกสารนี้ทำขึ้น 2 ฉบับ มีข้อความถูกต้องตรงกัน ทั้งสองฝ่ายได้อ่านและยอมรับเงื่อนไขข้างต้นแล้ว จึงได้ลงรายมือชื่อไว้เป็นสำคัญ
                  </p>

                  <div className="flex justify-around gap-8 mt-4 avoid-break">
                    <SignatureBox label="ลูกค้า" name={lead.full_name} signatureUrl={lead.warranty_customer_signature_url || lead.install_customer_signature_url} />
                    <SignatureBox label={CO.nameTh} name={d.signer?.full_name || ""} signatureUrl={d.signer?.signature_url ?? null} />
                  </div>
                </div>
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <td>
                <div className="strip-footer bg-gray-50 border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500 text-center">
                  การให้บริการด้านเทคนิค ติดต่อ โทร. {CO.phone} · สายด่วน {CO.hotline} · {CO.email}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-tight">{label}</div>
      <div className="text-[12px] font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function Section({ title, children, avoidBreak = true }: { title: string; children: React.ReactNode; avoidBreak?: boolean }) {
  return (
    <div className={`${avoidBreak ? "avoid-break" : ""}`}>
      <h2 className="text-[13px] font-bold text-gray-900 border-l-4 border-primary pl-2 mb-1">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function SignatureBox({ label, name, signatureUrl }: { label: string; name: string; signatureUrl?: string | null }) {
  return (
    <div className="flex-1 max-w-[260px] text-center">
      <div className="flex items-end justify-center h-[55px] mb-0.5">
        {signatureUrl && (
          <img src={signatureUrl} alt="signature" className="max-h-[55px] max-w-full object-contain" />
        )}
      </div>
      <div className="text-[11px] border-t border-gray-400 pt-1">( {name || "…………………………………………"} )</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
