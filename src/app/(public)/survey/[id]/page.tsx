"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { formatSlotsRange } from "@/lib/time-slots";
import {
  ROOF_MATERIAL_LABEL as ROOF_MATERIAL_MAP,
  ORIENTATION_LABEL as ORIENTATION_MAP,
  SHADING_LABEL as SHADING_MAP,
  METER_SIZE_LABEL as METER_MAP,
  MDB_SLOTS_LABEL as MDB_SLOTS_MAP,
  BREAKER_LABEL as BREAKER_MAP,
  ROOF_STRUCTURE_LABEL as ROOF_STRUCTURE_MAP,
  INVERTER_LOCATION_LABEL as INVERTER_LOC_MAP,
  WIFI_LABEL as WIFI_MAP,
  ACCESS_LABEL as ACCESS_MAP,
  APPLIANCE_LABEL as APPLIANCE_MAP,
  BATTERY_LABEL as BATTERY_MAP,
  PHASE_LABEL as PHASE_MAP,
  labelFor as otherLabel,
} from "@/lib/constants/survey-options";

interface Pkg {
  id: number;
  name: string;
  kwp: number;
  phase: number;
  has_battery: boolean;
  battery_kwh: number;
  battery_brand: string;
  solar_panels: number;
  panel_watt: number;
  inverter_kw: number;
  inverter_brand: string;
  price: number;
  is_upgrade: boolean;
}

interface Lead {
  id: number;
  full_name: string;
  phone: string;
  project_name: string | null;
  installation_address: string | null;
  assigned_name: string | null;
  survey_date: string | null;
  survey_time_slot: string | null;
  survey_lat: number | null;
  survey_lng: number | null;
  survey_note: string | null;
  survey_photos: string | null;
  // Electrical
  survey_electrical_phase: string | null;
  survey_meter_size: string | null;
  survey_voltage_ln: number | null;
  survey_voltage_ll: number | null;
  survey_monthly_bill: number | null;
  survey_mdb_brand: string | null;
  survey_mdb_model: string | null;
  survey_mdb_slots: string | null;
  survey_breaker_type: string | null;
  survey_panel_to_inverter_m: number | null;
  survey_db_distance_m: number | null;
  survey_wants_battery: string | null;
  survey_appliances: string | null;
  // Roof / house
  survey_roof_material: string | null;
  survey_roof_orientation: string | null;
  survey_floors: number | null;
  survey_roof_area_m2: number | null;
  survey_roof_tilt: number | null;
  survey_shading: string | null;
  survey_roof_structure: string | null;
  survey_roof_width_m: number | null;
  survey_roof_length_m: number | null;
  // Installation planning
  survey_inverter_location: string | null;
  survey_wifi_signal: string | null;
  survey_access_method: string | null;
  // Photo Checklist
  survey_photo_building_url: string | null;
  survey_photo_roof_structure_url: string | null;
  survey_photo_mdb_url: string | null;
  survey_photo_inverter_point_url: string | null;
  // Recommendation + sign
  survey_recommended_kw: number | null;
  survey_panel_count: number | null;
  survey_customer_signature_url: string | null;
}

interface Data {
  lead: Lead;
  packages: Pkg[];
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

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};

export default function SurveyPdfPage() {
  const { id } = useParams();
  const [d, setD] = useState<Data | null>(null);
  const [locQr, setLocQr] = useState<string | null>(null);

  useEffect(() => {
    const userId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("user_id") : null;
    const qs = userId ? `?user_id=${userId}` : "";
    fetch(`/api/survey/${id}/data${qs}`).then(r => r.json()).then(setD).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!d?.lead.survey_lat || !d?.lead.survey_lng) { setLocQr(null); return; }
    const mapsUrl = `https://www.google.com/maps?q=${d.lead.survey_lat},${d.lead.survey_lng}`;
    QRCode.toDataURL(mapsUrl, { width: 360, margin: 1 })
      .then(setLocQr)
      .catch(err => { console.error("QR gen failed", err); setLocQr(null); });
  }, [d?.lead.survey_lat, d?.lead.survey_lng]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary animate-spin" /></div>;

  const { lead, packages } = d;

  const docNo = `SRV${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`;
  const slotTime = lead.survey_time_slot ? (formatSlotsRange(lead.survey_time_slot) || lead.survey_time_slot) : "—";
  const appliances = (lead.survey_appliances || "").split(",").filter(Boolean).map(v => APPLIANCE_MAP[v] || v);

  const photoSlots: { url: string | null; label: string }[] = [
    { url: lead.survey_photo_building_url, label: "อาคาร / ตัวบ้าน" },
    { url: lead.survey_photo_roof_structure_url, label: "โครงหลังคา" },
    { url: lead.survey_photo_mdb_url, label: "ตู้ MDB / Consumer Unit" },
    { url: lead.survey_photo_inverter_point_url, label: "จุดติดตั้ง Inverter" },
  ];
  const extraPhotos = (lead.survey_photos || "").split(",").filter(Boolean);

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
        .survey-body h2 { break-after: avoid; page-break-after: avoid; }
        .survey-body table { break-inside: auto; }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      `}</style>
      <div className="survey-body mx-auto bg-white shadow-xl print:shadow-none text-[16px] text-gray-900" style={{ width: "210mm", minHeight: "297mm" }} id="survey">
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
                      <div className="text-[10px] uppercase tracking-wider opacity-80 leading-tight">Site Survey Form</div>
                      <div className="text-[16px] font-bold leading-tight mt-0.5">ใบสำรวจหน้างาน</div>
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
                <div className="tbody-pull-up px-[30px] py-2.5 flex justify-between items-center border-b border-gray-100">
                  <span className="text-[12px] text-gray-500">DOCUMENT NO: <span className="text-gray-900 font-bold text-[18px] tracking-wider ml-1">{docNo}</span></span>
                  <span className="text-[12px] text-gray-500">SURVEY DATE: <span className="text-gray-800 font-semibold">{fmtDate(lead.survey_date)}{lead.survey_time_slot ? ` · ${slotTime}` : ""}</span></span>
                </div>

                <div className="px-[30px] py-4 flex flex-col gap-3.5 leading-[1.5]">

                  {/* ข้อมูลลูกค้า */}
                  <div className="avoid-break">
                    <div className="text-[16px] font-bold uppercase tracking-wider text-black mb-2">CUSTOMER INFORMATION · ข้อมูลลูกค้า</div>
                    <div className="flex items-start gap-4">
                      <div className="flex-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[15px] text-black">
                        <span className="font-medium">ชื่อลูกค้า</span><span>{lead.full_name || "—"}</span>
                        <span className="font-medium">เบอร์โทร</span><span>{lead.phone || "—"}</span>
                        {lead.project_name && (<><span className="font-medium">โครงการ</span><span>{lead.project_name}</span></>)}
                        {lead.installation_address && (<><span className="font-medium">ที่อยู่ติดตั้ง</span><span>{lead.installation_address}</span></>)}
                        {lead.assigned_name && (<><span className="font-medium">ผู้สำรวจ</span><span>{lead.assigned_name}</span></>)}
                      </div>
                      {locQr && (
                        <div className="shrink-0 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={locQr} alt="Location QR" className="w-[120px] h-[120px] border border-gray-300 rounded" />
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-black mt-1">QR แผนที่ Location</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 1. ระบบไฟฟ้า (PDF §2) */}
                  <Section title="1. ระบบไฟฟ้า · ELECTRICAL SYSTEM">
                    <SpecGrid>
                      <Field label="ขนาดมิเตอร์" value={lead.survey_meter_size ? METER_MAP[lead.survey_meter_size] || lead.survey_meter_size : "—"} />
                      <Field label="ระบบไฟ" value={lead.survey_electrical_phase ? PHASE_MAP[lead.survey_electrical_phase] || lead.survey_electrical_phase : "—"} />
                      <GroupRow label="แรงดัน" items={[
                        { label: "L-N", value: lead.survey_voltage_ln != null ? `${lead.survey_voltage_ln} V` : "—" },
                        { label: "L-L", value: lead.survey_voltage_ll != null ? `${lead.survey_voltage_ll} V` : "—" },
                      ]} />
                      <Field label="ค่าไฟเฉลี่ย/เดือน" value={lead.survey_monthly_bill != null ? `${lead.survey_monthly_bill.toLocaleString()} บาท` : "—"} />
                      <GroupRow label="ตู้ MDB" items={[
                        { label: "ยี่ห้อ", value: lead.survey_mdb_brand || "—" },
                        { label: "รุ่น", value: lead.survey_mdb_model || "—" },
                        { label: "ช่องว่าง", value: lead.survey_mdb_slots ? MDB_SLOTS_MAP[lead.survey_mdb_slots] || lead.survey_mdb_slots : "—" },
                      ]} />
                      <Field label="ชนิดเบรกเกอร์" value={otherLabel(lead.survey_breaker_type, BREAKER_MAP)} />
                      <GroupRow label="Cable" items={[
                        { label: "PV → Inverter", value: lead.survey_panel_to_inverter_m != null ? `${lead.survey_panel_to_inverter_m} m` : "—" },
                        { label: "Inverter → MDB", value: lead.survey_db_distance_m != null ? `${lead.survey_db_distance_m} m` : "—" },
                      ]} />
                      <Field label="เครื่องใช้พิเศษ" value={appliances.length ? appliances.join(" · ") : "—"} />
                    </SpecGrid>
                  </Section>

                  {/* 2. หลังคา · โครงสร้างบ้าน (PDF §3) */}
                  <Section title="2. หลังคา · โครงสร้างบ้าน · ROOF STRUCTURE">
                    <SpecGrid>
                      <Field label="จำนวนชั้น" value={lead.survey_floors != null ? `${lead.survey_floors} ชั้น` : "—"} />
                      <Field label="วัสดุหลังคา" value={lead.survey_roof_material ? ROOF_MATERIAL_MAP[lead.survey_roof_material] || lead.survey_roof_material : "—"} />
                      <Field label="ทิศทางหลังคา" value={lead.survey_roof_orientation ? ORIENTATION_MAP[lead.survey_roof_orientation] || lead.survey_roof_orientation : "—"} />
                      <Field label="ความชันหลังคา" value={lead.survey_roof_tilt != null ? `${lead.survey_roof_tilt}°` : "—"} />
                      <GroupRow label="ขนาดหลังคา" items={[
                        { label: "พื้นที่", value: lead.survey_roof_area_m2 != null ? `${lead.survey_roof_area_m2} m²` : "—" },
                        { label: "W × L", value: lead.survey_roof_width_m != null && lead.survey_roof_length_m != null ? `${lead.survey_roof_width_m} × ${lead.survey_roof_length_m} m` : "—" },
                      ]} />
                      <Field label="โครงสร้างหลังคา" value={lead.survey_roof_structure ? ROOF_STRUCTURE_MAP[lead.survey_roof_structure] || lead.survey_roof_structure : "—"} />
                      <Field label="เงาบัง" value={lead.survey_shading ? SHADING_MAP[lead.survey_shading] || lead.survey_shading : "—"} />
                    </SpecGrid>
                  </Section>

                  {/* 3. การเตรียมการติดตั้ง (PDF §4) */}
                  <Section title="3. การเตรียมการติดตั้ง · INSTALLATION PLANNING">
                    <SpecGrid>
                      <Field label="ตำแหน่ง Inverter" value={lead.survey_inverter_location ? INVERTER_LOC_MAP[lead.survey_inverter_location] || lead.survey_inverter_location : "—"} />
                      <Field label="สัญญาณ Wi-Fi" value={lead.survey_wifi_signal ? WIFI_MAP[lead.survey_wifi_signal] || lead.survey_wifi_signal : "—"} />
                      <Field label="วิธีขึ้นหลังคา" value={lead.survey_access_method ? ACCESS_MAP[lead.survey_access_method] || lead.survey_access_method : "—"} />
                    </SpecGrid>
                  </Section>

                  {/* 4. ขนาดระบบ + แพ็คเกจที่เสนอ (PDF §7) — ขึ้นหน้าใหม่ */}
                  <div style={{ breakBefore: "page" }} />
                  <Section title="4. ขนาดระบบที่เสนอ · RECOMMENDED SYSTEM">
                    <SpecGrid>
                      <Field label="ขนาดแนะนำ" value={lead.survey_recommended_kw != null ? `${lead.survey_recommended_kw} kWp` : "—"} />
                      <Field label="จำนวน Panel" value={lead.survey_panel_count != null ? `${lead.survey_panel_count} แผง` : "—"} />
                      <Field label="ระบบ" value={otherLabel(lead.survey_wants_battery, BATTERY_MAP)} />
                    </SpecGrid>
                    {packages.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[16px] font-bold uppercase tracking-wider text-black mb-1.5">แพ็คเกจที่เสนอ</div>
                        <table className="w-full border border-gray-200 text-[15px]">
                          <thead className="bg-gray-50">
                            <tr className="text-left">
                              <th className="py-1.5 font-medium text-black" style={{ paddingLeft: "32px", paddingRight: "12px" }}>ชื่อแพ็คเกจ</th>
                              <th className="px-3 py-1.5 font-medium text-black">kWp</th>
                              <th className="px-3 py-1.5 font-medium text-black">Panel</th>
                              <th className="px-3 py-1.5 font-medium text-black">Inverter</th>
                              <th className="px-3 py-1.5 font-medium text-black">Battery</th>
                              <th className="py-1.5 font-medium text-black text-right" style={{ paddingLeft: "12px", paddingRight: "32px" }}>ราคา (บาท)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {packages.map(p => (
                              <tr key={p.id} className="border-t border-gray-100">
                                <td className="py-1.5" style={{ paddingLeft: "32px", paddingRight: "12px" }}>{p.is_upgrade ? "[UPGRADE] " : ""}{p.name}</td>
                                <td className="px-3 py-1.5">{p.kwp}</td>
                                <td className="px-3 py-1.5">{p.solar_panels > 0 ? `${p.solar_panels} × ${p.panel_watt}W` : "—"}</td>
                                <td className="px-3 py-1.5">{p.inverter_kw > 0 ? `${p.inverter_brand} ${p.inverter_kw}kW` : "—"}</td>
                                <td className="px-3 py-1.5">{p.has_battery ? `${p.battery_brand || ""} ${p.battery_kwh}kWh`.trim() : "—"}</td>
                                <td className="py-1.5 text-right font-mono" style={{ paddingLeft: "12px", paddingRight: "32px" }}>{p.price.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Section>

                  {/* 5. บันทึก Surveyor */}
                  {lead.survey_note && (
                    <Section title="5. บันทึกผู้สำรวจ · SURVEYOR NOTE">
                      <div className="text-[15px] text-black whitespace-pre-wrap border border-gray-300 rounded p-3">{lead.survey_note}</div>
                    </Section>
                  )}

                  {/* Signature */}
                  <div className="flex justify-around gap-8 mt-24 avoid-break">
                    <SignatureBox label="ลูกค้า" name={lead.full_name} signatureUrl={lead.survey_customer_signature_url} />
                    <SignatureBox label="ผู้สำรวจ" name={d.signer?.full_name || lead.assigned_name || ""} signatureUrl={d.signer?.signature_url ?? null} />
                  </div>

                  {/* 6. Photo Checklist — pushed to last page(s) */}
                  <div style={{ breakBefore: "page" }}>
                    <Section title="บันทึกภาพหน้างาน · PHOTO CHECKLIST">
                      <div className="grid grid-cols-2 gap-3">
                        {photoSlots.map((p) => (
                          <PhotoSlot key={p.label} url={p.url} label={p.label} />
                        ))}
                      </div>
                      {extraPhotos.length > 0 && (
                        <div className="mt-4">
                          <div className="text-[16px] font-bold uppercase tracking-wider text-black mb-2">รูปถ่ายเพิ่มเติม</div>
                          <div className="grid grid-cols-3 gap-2">
                            {extraPhotos.map((url) => (
                              <div key={url} className="border border-gray-200 aspect-square overflow-hidden rounded">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="survey" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="avoid-break">
      <h2 className="text-[16px] font-bold text-black border-l-4 border-primary pl-2 mb-2">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function SpecGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dotted border-gray-300 py-1.5 leading-tight">
      <span className="text-[15px] font-medium uppercase tracking-wider text-black shrink-0 min-w-[160px]">{label}</span>
      <span className="text-[15px] font-normal text-black">{value}</span>
    </div>
  );
}

function GroupRow({ label, items }: { label: string; items: { label: string; value: string }[] }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dotted border-gray-300 py-1.5 leading-tight">
      <span className="text-[15px] font-medium uppercase tracking-wider text-black shrink-0 min-w-[160px]">{label}</span>
      <div className="text-black flex flex-wrap items-baseline gap-x-10 gap-y-1">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-baseline gap-4 whitespace-nowrap">
            <span className="text-[15px] font-normal text-black">{it.label}</span>
            <span className="text-[15px] font-normal text-black">{it.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PhotoSlot({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="border border-gray-300 rounded overflow-hidden">
      <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[15px] text-black">— ไม่มีรูป —</span>
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-gray-300 text-[15px] font-medium uppercase tracking-wider text-black">{label}</div>
    </div>
  );
}

function SignatureBox({ label, name, signatureUrl }: { label: string; name: string; signatureUrl?: string | null }) {
  return (
    <div className="flex-1 max-w-[260px] text-center text-black">
      <div className="flex items-end justify-center h-[70px] mb-0.5">
        {signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signatureUrl} alt="signature" className="max-h-[70px] max-w-full object-contain" />
        )}
      </div>
      <div className="text-[15px] border-t border-black pt-1.5 font-normal">( {name || "…………………………………………"} )</div>
      <div className="text-[15px] font-medium mt-1">{label}</div>
    </div>
  );
}
