"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatThaiDate } from "@/lib/utils/formatters";

const CO = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  nameTh: "บริษัท เสนาโซลาร์ เอนเนอร์ยี่ จำกัด",
  address: "448 RATCHADAPHISEK RD., SAM SEN NOK, HUAI KHWANG, BANGKOK 10310",
  taxId: "0105552041258",
  phone: "02-541-4642 ต่อ 10303",
  hotline: "089-834-3333",
  email: "SERVICES_SSE@SENASOLARENERGY.COM",
};

const METER_LABEL: Record<string, string> = {
  "5_15":   "5(15) A",
  "15_45":  "15(45) A",
  "30_100": "30(100) A",
  unknown:  "ไม่ทราบ",
};

interface SystemSpecs {
  inverter?: { brand?: string; kw?: number | null; phase?: string; sn?: string };
  panel?:    { brand?: string; model?: string; count?: number | null; watt?: number | null; total_kwp?: number | null };
  battery?:  { brand?: string; model?: string; kwh?: number | null };
  ac_dc_box_ongrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
  ac_dc_box_hybrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
}
type PassNote = { pass: boolean | null; note?: string };
interface VisualChecks { [key: string]: PassNote }
interface FunctionTests {
  voltage_1ph?: { ln?: number | null };
  voltage_3ph?: { l1n?: number | null; l1l2?: number | null; l3n?: number | null; l1l3?: number | null; l2n?: number | null; l2l3?: number | null };
  meter_size?: string | null;
  meter_amp?: number | null;
  current_kw?: number | null;
  pv1_volt?: number | null;
  pv2_volt?: number | null;
  inverter_ip?: PassNote;
  smart_meter_reverse?: PassNote;
  wifi_app?: PassNote;
  app_solar?: PassNote;
}

interface Data {
  lead: {
    id: number;
    full_name: string;
    phone: string;
    project_name: string | null;
    installation_address: string | null;
    install_checklist_doc_no: string | null;
    install_completed_at: string | null;
    install_customer_signature_url: string | null;
    install_photos: string | null;
    install_photos_extra: string | null;
    assigned_name: string | null;
  };
  checklist: {
    inspection_date: string | null;
    system_specs: string | null;
    visual_checks: string | null;
    function_tests: string | null;
    notes: string | null;
    inspector_signature_url: string | null;
    customer_signature_url: string | null;
    submitted_at: string | null;
  } | null;
  signer: { full_name: string; signature_url: string | null } | null;
}

const VISUAL_ITEMS: Array<{ key: string; label: string }> = [
  { key: "panel_pos",        label: "2.1 ระยะ / ตำแหน่งติดตั้ง แผงโซลาร์เซลล์ ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "inverter_pos",     label: "2.2 ระยะ / ตำแหน่งติดตั้ง INVERTER ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "control_box_pos",  label: "2.3 ระยะ / ตำแหน่งติดตั้ง ตู้ควบคุม ได้ระดับ / ภายในเก็บงานเรียบร้อย" },
  { key: "battery_pos",      label: "2.4 ระยะ / ตำแหน่งติดตั้ง BATTERY ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "junction_box",     label: "2.5 JUNCTION BOX ติดตั้งครบและเรียบร้อย ใช้งานได้สมบูรณ์ (หน้าบ้าน / หลังบ้าน)" },
  { key: "pipe_install",     label: "2.6 งานเดินท่อ ติดตั้งแข็งแรง ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "wire_way",         label: "2.7 งานติดตั้งราง WIRE WAY (กรณีมี) งานติดตั้งเรียบร้อย / เชื่อมกราวด์รางเรียบร้อย" },
  { key: "ground_weld",      label: "2.8 งานติดตั้งกราวด์เชื่อมต่อเก็บงานเรียบร้อย (เชื่อมโดยเทอร์มิเวล)" },
  { key: "terminal_breaker", label: "2.9 จุดเชื่อมต่อสาย TERMINAL และ BREAKER เชื่อมต่อเรียบร้อย" },
  { key: "dc_pipe",          label: "2.10 งานเดินท่อและตำแหน่งเชื่อมต่อ BOX / ท่อ สาย DC หลังบ้านชั้น 2 เก็บงานเรียบร้อย" },
];

const ONGRID_BREAKERS = [
  { key: "mcb_dc_solar", label: "MCB DC SOLAR" },
  { key: "mcb_rcbo_ac",  label: "MCB RCBO AC" },
  { key: "mcb_dc",       label: "MCB DC" },
  { key: "mcb_ac_grid",  label: "MCB AC GRID" },
];

const HYBRID_BREAKERS = [
  { key: "mcb_dc_solar",  label: "MCB DC SOLAR" },
  { key: "ats",           label: "ATS (AUTOMATIC TRANSFER SWITCH)" },
  { key: "mcb_rcbo_ac",   label: "MCB RCBO AC" },
  { key: "mcb_dc",        label: "MCB DC" },
  { key: "mcb_ac_grid",   label: "MCB AC GRID" },
  { key: "mcb_ac_backup", label: "MCB AC BACK UP" },
];

const FUNCTION_PASS_FAIL = [
  { key: "inverter_ip",         label: "3.5 ทดสอบการเชื่อมต่อ INVERTER ผ่าน IP ของเครื่อง" },
  { key: "smart_meter_reverse", label: "3.6 ทดสอบการทำงานของ SMART METER ในส่วนกันกระแสไหลย้อน" },
  { key: "wifi_app",            label: "3.7 ทดสอบการเชื่อมต่อ WIFI ผ่าน APP ของเครื่อง ใช้งานได้ปกติ" },
  { key: "app_solar",           label: "3.8 ทำการเชื่อมต่อ APP SOLAR ให้กับลูกค้า ดูค่าพลังงาน ได้ปกติ" },
];

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// Inline SVG marks for the .checkbox cells (see CSS comment above for why).
const CheckMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 12 10 18 20 6" />
  </svg>
);
const XMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
);

const fmt = (d: string | null) => formatThaiDate(d, { buddhist: true, monthLong: true });
const fmtNum = (v: number | null | undefined, digits = 0) =>
  v == null ? "-" : Number(v).toFixed(digits);
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "-" : String(v);

export default function InstallDocPage() {
  const { id } = useParams();
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    const userId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("user_id") : null;
    const qs = userId ? `?user_id=${userId}` : "";
    fetch(`/api/install-doc/${id}/data${qs}`).then(r => r.json()).then(setD).catch(console.error);
  }, [id]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary animate-spin rounded-full" /></div>;

  const { lead, checklist, signer } = d;
  const specs = safeParse<SystemSpecs>(checklist?.system_specs, {});
  const checks = safeParse<VisualChecks>(checklist?.visual_checks, {});
  const tests = safeParse<FunctionTests>(checklist?.function_tests, {});
  const inv = specs.inverter || {};
  const pn  = specs.panel    || {};
  const bt  = specs.battery  || {};
  const ongrid = specs.ac_dc_box_ongrid || {};
  const hybrid = specs.ac_dc_box_hybrid || {};
  const v3 = tests.voltage_3ph || {};

  const docNo = lead.install_checklist_doc_no || `SSE-CK-${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`;
  // Fall back to today if neither the checklist's inspection_date nor the
  // lead's install_completed_at have a value — the printable doc should
  // always carry a date even on leads that haven't filled the checklist yet.
  const inspectionDate = checklist?.inspection_date || lead.install_completed_at || new Date().toISOString().slice(0, 10);
  const phase1 = (inv.phase || "").toLowerCase().includes("1") || inv.phase === "1_phase";
  const phase3 = (inv.phase || "").toLowerCase().includes("3") || inv.phase === "3_phase";

  const meterText = tests.meter_size
    ? (METER_LABEL[tests.meter_size] || tests.meter_size)
    : tests.meter_amp != null ? `${tests.meter_amp} A` : "-";

  // Install photos (workflow capture + ad-hoc post-install). Both columns are
  // CSV; we de-dup before render so the same URL isn't shown twice.
  const splitCsv = (s: string | null): string[] =>
    !s ? [] : String(s).split(",").map(x => x.trim()).filter(Boolean);
  const installPhotos = Array.from(new Set([
    ...splitCsv(lead.install_photos),
    ...splitCsv(lead.install_photos_extra),
  ]));

  return (
    <div className="bg-gray-100 min-h-screen py-4 print:py-0 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { body { margin: 0; background: white; } }
        table.doc { border-collapse: collapse; width: 100%; }
        table.doc thead { display: table-header-group; }
        table.doc tfoot { display: table-footer-group; }
        table.doc td { padding: 0; vertical-align: top; }
        .strip-header, .strip-footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        .strip-header { height: 20mm; box-sizing: border-box; padding-top: 4mm !important; padding-bottom: 4mm !important; }
        .tbody-pull-up { margin-top: -5mm; }
        .install-body h2 { break-after: avoid; page-break-after: avoid; }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        .sec-title { background: #fff5e1; border: 1px solid #e5e7eb; padding: 4px 10px; font-weight: 700; font-size: 13px; }
        .sec-body  { border: 1px solid #e5e7eb; border-top: 0; padding: 8px 12px; font-size: 13px; line-height: 1.55; }
        /* Renamed from .underline -> .value-box because Tailwind's built-in
           .underline utility (text-decoration: underline) was still being
           applied even after we cleared border-bottom. */
        .value-box { min-width: 50px; display: inline-block; padding: 0 4px; text-align: center; text-decoration: none; }
        /* 12x12 inline checkbox. The mark inside is an SVG (not the unicode
           ✓ / ✗ characters) — puppeteer's headless Chromium on the prod Linux
           container doesn't ship a font that has those glyphs, so they rendered
           as .notdef blanks on the server even though they showed fine on
           macOS dev. SVG guarantees identical render anywhere. */
        .checkbox { display: inline-flex; width: 12px; height: 12px; border: 1px solid #4b5563; vertical-align: middle; margin-right: 4px; align-items: center; justify-content: center; box-sizing: border-box; }
        .checkbox svg { width: 10px; height: 10px; display: block; }
        .checkbox.checked svg { color: #15803d; }
        .checkbox.failed          { border-color: #dc2626; }
        .checkbox.failed svg      { color: #dc2626; }
        /* Note-line was a fill-in-blank style with dotted border-bottom; user
           asked for no underlines anywhere in the doc, so drop the border and
           just keep the cell as a left-padded text slot. */
        .note-line { min-height: 16px; padding: 0 4px; }
      `}</style>

      <div className="install-body mx-auto bg-white shadow-xl print:shadow-none text-[14px] text-gray-900" style={{ width: "210mm", minHeight: "297mm" }} id="install-doc">
        <table className="doc">
          <thead>
            <tr>
              <td>
                <div className="strip-header bg-primary text-white px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[18px] leading-tight tracking-wide">{CO.name}</div>
                      <div className="text-[13px] opacity-90 leading-snug mt-1">{CO.address}</div>
                      <div className="text-[13px] opacity-90 leading-snug">TAX ID: {CO.taxId} · TEL: {CO.phone}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] uppercase tracking-wider opacity-80 leading-tight">Installation Handover</div>
                      <div className="text-[18px] font-bold leading-tight mt-0.5">ใบส่งมอบงานติดตั้ง</div>
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
                  <span className="text-[14px] text-gray-500">DOCUMENT NO: <span className="text-gray-900 font-bold text-[20px] tracking-wider ml-1">{docNo}</span></span>
                  <span className="text-[14px] text-gray-500">DATE: <span className="text-gray-800 font-semibold">{fmt(inspectionDate)}</span></span>
                </div>

                <div className="px-5 py-4 flex flex-col gap-3 leading-[1.5]">
                  {/* Customer info */}
                  <div className="avoid-break">
                    <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">CUSTOMER INFORMATION</div>
                    <div className="grid grid-cols-[80px_1fr] gap-y-1 text-[14px]">
                      <span className="text-gray-400">โครงการ</span><span className="text-gray-900 font-semibold">{lead.project_name || lead.full_name}</span>
                      <span className="text-gray-400">ลูกค้า</span><span className="text-gray-800">{lead.full_name}</span>
                      {lead.phone && (<><span className="text-gray-400">โทร.</span><span className="text-gray-800">{lead.phone}</span></>)}
                      {lead.installation_address && (<><span className="text-gray-400">ที่อยู่</span><span className="text-gray-800">{lead.installation_address}</span></>)}
                    </div>
                  </div>

                  {/* SECTION 1 — System Spec */}
                  <div className="avoid-break">
                    <div className="sec-title">1. คุณลักษณะเฉพาะระบบโซลาร์เซลล์</div>
                    <div className="sec-body">
                      <Row>
                        <span style={{ width: 180 }}>1.1 ผลิตภัณฑ์ INVERTER</span>
                        <span className="value-box" style={{ minWidth: 130 }}>{dash(inv.brand)}</span>
                        <span style={{ marginLeft: 12 }}>ขนาด</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{inv.kw != null ? `${inv.kw} kW` : "-"}</span>
                        <span style={{ marginLeft: 12 }}><span className={`checkbox ${phase1 ? "checked" : ""}`}>{phase1 && <CheckMark />}</span>ระบบไฟ 1 เฟส</span>
                        <span style={{ marginLeft: 12 }}><span className={`checkbox ${phase3 ? "checked" : ""}`}>{phase3 && <CheckMark />}</span>ระบบไฟ 3 เฟส</span>
                      </Row>
                      <Row>
                        <span style={{ width: 180 }}>1.2 หมายเลขประจำเครื่อง (S/N)</span>
                        <span className="value-box" style={{ minWidth: 280, textAlign: "left" }}>{dash(inv.sn)}</span>
                      </Row>
                      <Row>
                        <span style={{ width: 180 }}>1.3 ผลิตภัณฑ์ แผงโซลาร์เซลล์</span>
                        <span className="value-box" style={{ minWidth: 200, textAlign: "left" }}>{[pn.brand, pn.model].filter(Boolean).join(" ") || "-"}</span>
                        <span style={{ marginLeft: 12 }}>จำนวน</span>
                        <span className="value-box" style={{ minWidth: 50 }}>{dash(pn.count)}</span>
                        <span>แผง</span>
                        <span style={{ marginLeft: 12 }}>ขนาดติดตั้ง</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{pn.total_kwp != null ? Number(pn.total_kwp).toFixed(4) : "-"}</span>
                        <span>kWp</span>
                      </Row>
                      <Row>
                        <span style={{ width: 180 }}>1.4 ผลิตภัณฑ์ BATTERY</span>
                        <span className="value-box" style={{ minWidth: 200, textAlign: "left" }}>{[bt.brand, bt.model].filter(Boolean).join(" ") || "-"}</span>
                        <span style={{ marginLeft: 12 }}>ขนาด</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{dash(bt.kwh)}</span>
                        <span>kWh</span>
                      </Row>
                      <SubGroup title="1.5 ชุดตู้ควบคุม AC/DC BOX ON GRID" rows={ONGRID_BREAKERS} values={ongrid} />
                      <SubGroup title="1.6 ชุดตู้ควบคุม AC/DC BOX HYBRID" rows={HYBRID_BREAKERS} values={hybrid} />
                    </div>
                  </div>

                  {/* SECTION 2 — Visual Checks */}
                  <div className="avoid-break">
                    <div className="sec-title">2. งานติดตั้งระบบโซลาร์เซลล์</div>
                    <div className="sec-body">
                      {VISUAL_ITEMS.map(item => {
                        const c = checks[item.key] || { pass: null };
                        const passed = c.pass === true;
                        const failed = c.pass === false;
                        return (
                          <div key={item.key} style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 1fr", gap: 6, alignItems: "center", padding: "2px 0" }}>
                            <span>{item.label}</span>
                            <span><span className={`checkbox ${passed ? "checked" : ""}`}>{passed && <CheckMark />}</span>ผ่าน</span>
                            <span><span className={`checkbox ${failed ? "failed" : ""}`}>{failed && <XMark />}</span><span className={failed ? "text-red-600 font-semibold" : ""}>ไม่ผ่าน</span></span>
                            <span className="note-line">{c.note || ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECTION 3 — Function Tests */}
                  <div className="avoid-break">
                    <div className="sec-title">3. ทดสอบฟังก์ชั่นระบบโซลาร์เซลล์</div>
                    <div className="sec-body">
                      <div style={{ fontWeight: 600, paddingBottom: 2 }}>3.1 แรงดันไฟฟ้ากรณีระบบไฟ 1 เฟส</div>
                      <Row>
                        <span style={{ width: 280 }}>- วัดแรงดัน VOLT AC VOLT TO LINE ( L:N ) :</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{fmtNum(tests.voltage_1ph?.ln, 2)}</span>
                        <span>Volt</span>
                        <span style={{ marginLeft: 20 }}>ขนาดมิเตอร์ไฟฟ้า</span>
                        <span className="value-box" style={{ minWidth: 80 }}>{meterText}</span>
                      </Row>

                      <div style={{ fontWeight: 600, paddingTop: 6, paddingBottom: 2 }}>3.2 แรงดันไฟฟ้ากรณีระบบไฟ 3 เฟส</div>
                      {/* 2-col grid — left + right cells share the same row.
                          Each cell is its own sub-grid (label + value + unit)
                          so columns stay aligned regardless of label length. */}
                      {([
                        { kA: "l1n" as const,  lA: "L1:N",  kB: "l1l2" as const, lB: "L1:L2" },
                        { kA: "l3n" as const,  lA: "L3:N",  kB: "l1l3" as const, lB: "L1:L3" },
                        { kA: "l2n" as const,  lA: "L2:N",  kB: "l2l3" as const, lB: "L2:L3" },
                      ]).map((r, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16, padding: "2px 0" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "auto 70px 30px", gap: 6, alignItems: "center" }}>
                            <span>- วัดแรงดัน VOLT AC VOLT TO LINE ( {r.lA} ) :</span>
                            <span className="value-box">{fmtNum(v3[r.kA], 2)}</span>
                            <span>Volt</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "auto 70px 30px", gap: 6, alignItems: "center" }}>
                            <span>- วัดแรงดัน VOLT AC VOLT TO LINE ( {r.lB} ) :</span>
                            <span className="value-box">{fmtNum(v3[r.kB], 2)}</span>
                            <span>Volt</span>
                          </div>
                        </div>
                      ))}

                      <Row>
                        <span style={{ width: 280, paddingTop: 6 }}>3.3 กำลังการผลิตที่ผลิตได้ ที่วัด ณ.ปัจจุบัน :</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{fmtNum(tests.current_kw, 4)}</span>
                        <span>kW</span>
                      </Row>
                      <Row>
                        <span style={{ width: 280 }}>- ค่า PV1 :</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{fmtNum(tests.pv1_volt, 2)}</span>
                        <span>Volt</span>
                      </Row>
                      <Row>
                        <span style={{ width: 280 }}>- ค่า PV2 :</span>
                        <span className="value-box" style={{ minWidth: 70 }}>{fmtNum(tests.pv2_volt, 2)}</span>
                        <span>Volt</span>
                      </Row>

                      <div style={{ paddingTop: 6 }}>
                        {FUNCTION_PASS_FAIL.map(item => {
                          const c = (tests[item.key as keyof FunctionTests] as PassNote | undefined) || { pass: null };
                          const passed = c.pass === true;
                          const failed = c.pass === false;
                          return (
                            <div key={item.key} style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 1fr", gap: 6, alignItems: "center", padding: "2px 0" }}>
                              <span>{item.label}</span>
                              <span><span className={`checkbox ${passed ? "checked" : ""}`}>{passed && <CheckMark />}</span>ผ่าน</span>
                              <span><span className={`checkbox ${failed ? "failed" : ""}`}>{failed && <XMark />}</span><span className={failed ? "text-red-600 font-semibold" : ""}>ไม่ผ่าน</span></span>
                              <span className="note-line">{c.note || ""}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="avoid-break">
                    <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">บันทึกเพิ่มเติม</div>
                    <div style={{ minHeight: 80, border: "1px solid #e5e7eb", padding: "8px 12px", borderRadius: 4, whiteSpace: "pre-wrap", fontSize: 13 }}>
                      {checklist?.notes || ""}
                    </div>
                  </div>

                  {/* Signatures — same SignatureBox shape as warranty (ลูกค้า
                      ซ้าย / บริษัท ขวา ตามที่ user request). Customer signature
                      comes from leads.install_customer_signature_url (the
                      SignaturePad in Install subStep 4); falls back to the
                      legacy install_checklists.customer_signature_url. */}
                  <div className="flex justify-around gap-8 mt-4 avoid-break">
                    <SignatureBox label="ลูกค้า" name={lead.full_name} signatureUrl={lead.install_customer_signature_url || checklist?.customer_signature_url || null} />
                    <SignatureBox label={CO.nameTh} name={signer?.full_name || lead.assigned_name || ""} signatureUrl={signer?.signature_url || checklist?.inspector_signature_url || null} />
                  </div>

                  {/* Photo appendix — same pattern as the survey PDF: hard
                      page break before so the photo gallery starts on a fresh
                      A4, then 2-col grid of aspect-square thumbnails. */}
                  {installPhotos.length > 0 && (
                    <div style={{ breakBefore: "page" }}>
                      <div className="sec-title">ภาพการติดตั้ง · INSTALLATION PHOTOS</div>
                      <div className="sec-body">
                        <div className="grid grid-cols-2 gap-3">
                          {installPhotos.map((url, i) => (
                            <div key={url} className="border border-gray-300 rounded overflow-hidden avoid-break">
                              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`install ${i + 1}`} className="w-full h-full object-cover" />
                              </div>
                              <div className="px-2 py-1 border-t border-gray-300 text-[11px] text-gray-600 text-center">รูปติดตั้ง {i + 1} / {installPhotos.length}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <td>
                <div className="strip-footer bg-gray-50 border-t border-gray-100 px-5 py-2 text-[13px] text-gray-500 text-center">
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

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, padding: "2px 0" }}>{children}</div>;
}

function SubGroup({ title, rows, values }: {
  title: string;
  rows: Array<{ key: string; label: string }>;
  values: Record<string, { amp?: number | null; sqmm?: number | null }>;
}) {
  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {rows.map(b => {
        const v = values[b.key] || {};
        return (
          <div key={b.key} style={{ display: "grid", gridTemplateColumns: "220px 80px 50px 80px 80px 50px", gap: 4, alignItems: "center", padding: "1px 0" }}>
            <span>- {b.label} :</span>
            <span className="value-box">{v.amp != null ? String(v.amp) : "-"}</span>
            <span>Amp</span>
            <span>ขนาดสาย</span>
            <span className="value-box">{v.sqmm != null ? String(v.sqmm) : "-"}</span>
            <span>Sq.mm</span>
          </div>
        );
      })}
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
      <div className="text-[13px] border-t border-gray-400 pt-1">( {name || "…………………………………………"} )</div>
      <div className="text-[12px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
