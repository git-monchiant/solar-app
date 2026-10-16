"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AddonMode } from "@/lib/b2b/boq-calc";
import type { BoqHeader, BoqLine } from "@/lib/b2b/boq";
import type { OmParams } from "@/lib/b2b/boq-om";
import type { B2bCategory } from "@/lib/b2b/materials";
import ModalShell from "@/components/b2b/project/ModalShell";
import BoqSourceField from "./BoqSourceField";

// ดึงบางหมวดจากใบ BOQ อื่น (Rev ไหนก็ได้ · งานอื่นก็ได้) เข้าใบที่ทำอยู่ — แผน 20261016-05
// กติกาเดียวกับคัดลอกทั้งใบ (copyBoqLines): บรรทัด Master ใช้ราคาปัจจุบัน · ราคาใส่เองคัดลอกตามเดิม · หมายเหตุติดมา
// ต่างกันตรง: รายการที่ปิดใช้งานใน Master ข้าม (ใบที่ทำอยู่เพิ่มรายการปิดใช้งานใหม่ไม่ได้ — API บันทึกปฏิเสธ)
//   บรรทัดสูตร O&M ที่ใบมีอยู่แล้ว (role ซ้ำ) ไม่ดึงซ้ำ · ทำในหน้าจออย่างเดียว ยังไม่บันทึกจนกด "บันทึก"

type Source = { header: BoqHeader; lines: BoqLine[] };
export type ImportResult = {
  lines: BoqLine[];
  /** หมวดที่ลบบรรทัดเดิมทิ้งก่อนเติม (โหมดแทนที่) */
  replaceCats: number[];
  /** โหมดของหมวดเสริมจากใบต้นทาง — หน้าแม่ใส่เฉพาะหมวดที่ใบยังไม่มี */
  addonModes: Record<number, AddonMode>;
  /** ช่องตั้งค่า O&M ของใบต้นทาง (ใช้เมื่อใบที่ทำอยู่ยังไม่มี) */
  omParams: OmParams | null;
  omReset: boolean;
  skippedInactive: number;
  skippedDup: number;
  from: string;
};

let seq = 0;
const newKey = () => `imp${Date.now()}_${++seq}`;

export default function ImportFromBoqDialog({ boqId, projectId, categories, current, onImport, onClose }: {
  boqId: number;
  projectId: number | null;
  categories: B2bCategory[];
  /** บรรทัดของใบที่ทำอยู่ (ไว้บอกจำนวนเดิม + กัน O&M ซ้ำ) */
  current: BoqLine[];
  onImport: (r: ImportResult) => void;
  onClose: () => void;
}) {
  const [srcId, setSrcId] = useState("");
  const [src, setSrc] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"append" | "replace">("append");

  const choose = async (id: string) => {
    setSrcId(id); setSrc(null); setPicked(new Set()); setError("");
    if (!id) return;
    setLoading(true);
    try {
      setSrc(await apiFetch(`/api/b2b/boqs/${id}`) as Source);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "โหลดใบต้นทางไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => (src
    ? categories.map((c) => ({ c, ls: src.lines.filter((l) => l.category_id === c.id) })).filter((g) => g.ls.length > 0)
    : []), [src, categories]);
  const inactiveOf = (ls: BoqLine[]) => ls.filter((l) => l.line_type === "material" && l.current_active === false).length;
  const selected = groups.filter((g) => picked.has(g.c.id)).flatMap((g) => g.ls);
  const willSkip = inactiveOf(selected);
  const toggle = (cid: number) => setPicked((s) => { const n = new Set(s); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });

  const confirm = () => {
    if (!src) { setError("เลือกใบต้นทางก่อน"); return; }
    if (picked.size === 0) { setError("ติ๊กอย่างน้อย 1 หมวด"); return; }
    const replaceCats = mode === "replace" ? [...picked] : [];
    // role ที่ใบนี้มีอยู่แล้ว (และไม่ได้ถูกแทนที่) — ดึงซ้ำจะนับค่า O&M สองรอบ
    const haveRoles = new Set(current.filter((l) => l.om_role && !replaceCats.includes(l.category_id)).map((l) => l.om_role));
    let skippedInactive = 0; let skippedDup = 0;
    const lines: BoqLine[] = [];
    for (const l of selected) {
      if (l.line_type === "material" && l.current_active === false) { skippedInactive++; continue; }
      if (l.om_role && haveRoles.has(l.om_role)) { skippedDup++; continue; }
      if (l.om_role) haveRoles.add(l.om_role);
      lines.push(l.line_type === "material"
        // บรรทัดใหม่ (ไม่มี id) — server เติมข้อมูล/ราคาจาก Master ปัจจุบันตอนบันทึก · หน้าจอใช้ราคาปัจจุบันไปก่อน
        ? { ...l, id: undefined, key: newKey(), unit_cost: l.current_unit_price ?? null, refresh_price: false, price_entered_by_name: undefined }
        : { ...l, id: undefined, key: newKey(), price_entered_by_name: undefined });
    }
    const addonModes: Record<number, AddonMode> = {};
    for (const cid of picked) if (src.header.addon_modes[cid]) addonModes[cid] = src.header.addon_modes[cid];
    // O&M: ใบจากโครงการอื่น = ไซต์อื่น → ระยะทางเป็น 0 ให้กรอกใหม่ (แบบเดียวกับคัดลอกทั้งใบ)
    const srcOm = picked.has(13) ? src.header.om_params : null;
    const omReset = !!srcOm && src.header.project_id !== projectId && srcOm.distance_km !== 0;
    onImport({
      lines, replaceCats, addonModes, omParams: srcOm ? { ...srcOm, distance_km: omReset ? 0 : srcOm.distance_km } : null, omReset,
      skippedInactive, skippedDup, from: `${src.header.doc_no} Rev ${src.header.revision}`,
    });
  };

  const label = "block text-xs font-semibold text-gray-500 mb-1";
  return (
    <ModalShell title="ดึงรายการจากใบอื่น" subtitle={'เลือกใบ BOQ (งานอื่น / Rev เก่าก็ได้) แล้วติ๊กหมวดที่ต้องการ — ยังไม่บันทึกจนกด "บันทึก"'}
      width="max-w-2xl" error={error} confirmText={selected.length ? `ดึง ${selected.length - willSkip} บรรทัด` : "ดึงรายการ"} onConfirm={confirm} onClose={onClose}>
      <BoqSourceField projectId={projectId} value={srcId} onChange={(v) => void choose(v)} labelCls={label} label="ใบต้นทาง" blankLabel={null} excludeId={boqId} hint={null} />

      {loading && <p className="text-sm text-gray-400">กำลังโหลดใบต้นทาง…</p>}
      {src && groups.length === 0 && <p className="text-sm text-gray-400">ใบนี้ยังไม่มีรายการ</p>}
      {src && groups.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500">หมวดที่จะดึง</span>
            <button type="button" onClick={() => setPicked(new Set(groups.map((g) => g.c.id)))} style={{ minHeight: 0 }} className="ml-auto text-xs font-semibold text-primary hover:underline">เลือกทั้งหมด</button>
            <button type="button" onClick={() => setPicked(new Set())} style={{ minHeight: 0 }} className="text-xs font-semibold text-gray-500 hover:underline">ล้าง</button>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
            {groups.map(({ c, ls }) => {
              const have = current.filter((l) => l.category_id === c.id).length;
              const off = inactiveOf(ls);
              return (
                <label key={c.id} className={`flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50 ${picked.has(c.id) ? "bg-primary/5" : ""}`}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">{c.id}. {c.name}</span>
                    <span className="text-xs text-gray-400">
                      {ls.length} บรรทัด{have ? ` · ใบนี้มีอยู่ ${have} บรรทัด` : ""}
                      {off > 0 && <span className="text-red-500"> · ปิดใช้งานใน Master {off} (ไม่ดึง)</span>}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> เพิ่มต่อท้ายรายการเดิม</label>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> แทนที่รายการเดิมในหมวดที่ติ๊ก</label>
          </div>
          <p className="text-xs text-gray-400">ราคาใช้ราคาปัจจุบันใน Master · ราคาใส่เองในหมวดเสริมคัดลอกตามเดิม · หมายเหตุติดมาด้วย · หมวด 13 O&amp;M บรรทัดที่ใบนี้มีแล้วไม่ดึงซ้ำ</p>
        </>
      )}
    </ModalShell>
  );
}
