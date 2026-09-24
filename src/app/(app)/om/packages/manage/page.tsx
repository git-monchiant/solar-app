"use client";
import { XIcon } from "@/components/ui/icons";
import Dropdown from "@/components/ui/Dropdown";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { formatTHB as fmt } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import Loading from "@/components/ui/Loading";
import { PACKAGE_EDIT_ROLES, PACKAGE_VIEW_ROLES } from "@/lib/role-permissions";
import {
  omPlanLabel, omTierKey, omTierKw, omTierLabel,
  type OmPackage, type OmPackageNote,
} from "@/lib/om/packages";

// จัดการแพ็คเกจบริการ O&M — ยกโครงจาก /packages/manage ทั้งก้อน
// (toolbar · กลุ่มการ์ด · ป้าย ACTIVE · modal แก้ไข/ดูอย่างเดียว · สิทธิ์ชุดเดียวกัน)

type Editing = Omit<OmPackage, "id"> & { id?: number };

const empty: Editing = {
  kw_min: 0, kw_max: 0, max_panels: null, plan_type: "per_visit",
  contract_months: null, visits: null, price: 0, scope: null, is_active: true,
};

export default function ManageOmPackagesPage() {
  const [packages, setPackages] = useState<OmPackage[]>([]);
  const [notes, setNotes] = useState<OmPackageNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notesDraft, setNotesDraft] = useState<OmPackageNote[] | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const { activeRoles } = useActiveRoles();
  const canEdit = hasRole(activeRoles, ...PACKAGE_EDIT_ROLES);
  const canView = hasRole(activeRoles, ...PACKAGE_VIEW_ROLES);
  const viewOnly = !!editing && !canEdit;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterPlan, setFilterPlan] = useState<"all" | "per_visit" | "contract">("all");

  const load = () => {
    apiFetch("/api/om/packages?all=1")
      .then((r: { packages: OmPackage[]; notes: OmPackageNote[] }) => { setPackages(r.packages); setNotes(r.notes); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    if (!editing) setSaveError("");
  }, [editing]);

  const filtered = packages.filter(p => {
    if (filter === "active" && !p.is_active) return false;
    if (filter === "inactive" && p.is_active) return false;
    if (filterPlan !== "all" && p.plan_type !== filterPlan) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!omTierLabel(p).toLowerCase().includes(q) && !omPlanLabel(p).includes(q) && !(p.scope ?? "").includes(q)) return false;
    }
    return true;
  });

  // กลุ่ม = ขั้นขนาดระบบ (API เรียง kW → รายครั้งก่อนสัญญาให้แล้ว)
  const grouped: { key: string; head: OmPackage; items: OmPackage[] }[] = [];
  for (const p of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.key === omTierKey(p)) last.items.push(p);
    else grouped.push({ key: omTierKey(p), head: p, items: [p] });
  }

  const save = async () => {
    if (!canEdit || !editing) return;
    setSaveError("");
    setSaving(true);
    try {
      if (editing.id) {
        await apiFetch(`/api/om/packages/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      } else {
        await apiFetch("/api/om/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      }
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error && e.message ? e.message : "บันทึก Package O&M ไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: OmPackage) => {
    if (!canEdit) return;
    await apiFetch(`/api/om/packages/${pkg.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !pkg.is_active }) });
    load();
  };

  const saveNotes = async () => {
    if (!canEdit || !notesDraft) return;
    setNotesError("");
    setNotesSaving(true);
    try {
      await apiFetch("/api/om/packages/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notesDraft) });
      setNotesDraft(null);
      load();
    } catch (e) {
      setNotesError(e instanceof Error && e.message ? e.message : "บันทึกหมายเหตุไม่สำเร็จ");
    } finally {
      setNotesSaving(false);
    }
  };

  // สไตล์ช่องกรอกชุดเดียวกับ /packages/manage
  const fieldBase = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600 disabled:hover:border-gray-200 disabled:cursor-default";
  const fieldCls = `${fieldBase} text-sm`;
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  if (loading) return <Loading />;

  return (
    <div>
      <Header title="จัดการ Package O&M" subtitle="O&M PACKAGE MANAGEMENT" />

      <div className="p-4 md:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <Dropdown className="w-36" value={filter} onChange={v => { if (v) setFilter(v as typeof filter); }} options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]} />
          <Dropdown className="w-40" value={filterPlan} onChange={v => { if (v) setFilterPlan(v as typeof filterPlan); }} options={[
            { value: "all", label: "ทุกเงื่อนไข" },
            { value: "per_visit", label: "รายครั้ง" },
            { value: "contract", label: "สัญญา" },
          ]} />
          {canEdit && (
            <button type="button" onClick={() => { setSaveError(""); setEditing({ ...empty }); }} className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่ม Package O&amp;M</button>
          )}
        </div>

        {/* Cards */}
        <div className="space-y-5">
          {grouped.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบ Package O&amp;M ตามเงื่อนไขที่เลือก</div>
          ) : grouped.map(group => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-baseline gap-2 px-1">
                <h2 className="text-sm font-bold text-gray-900">{omTierKw(group.head)}</h2>
                {group.head.max_panels != null && <span className="text-xs font-semibold text-gray-400">หรือจำนวนแผงไม่เกิน {group.head.max_panels} แผง</span>}
                <span className="text-xs font-mono text-gray-400">({group.items.length})</span>
              </div>
              {group.items.map(pkg => (
                <div key={pkg.id} className={`rounded-xl bg-white border border-gray-300 overflow-hidden transition-all ${!pkg.is_active ? "opacity-50" : ""}`}>
                  <div className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Row 1: เงื่อนไข */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-bold text-lg text-gray-900">{omPlanLabel(pkg)}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${pkg.plan_type === "contract" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                          {pkg.plan_type === "contract" ? "CONTRACT" : "PER VISIT"}
                        </span>
                      </div>

                      {/* Row 2: ค่าบริการ */}
                      <div className="mb-2">
                        <span className="text-xl font-bold font-mono tabular-nums text-gray-900">{fmt(pkg.price)} <span className="text-sm text-gray-400">THB</span></span>
                      </div>

                      {/* Row 3: ขอบเขตงาน */}
                      {pkg.scope && <div className="text-sm text-gray-400">{pkg.scope.split("+").join(" + ")}</div>}
                    </div>

                    {/* Right: status + edit */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button type="button" onClick={() => toggleActive(pkg)} disabled={!canEdit} className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${!canEdit ? "cursor-default " : ""}${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {pkg.is_active ? "ACTIVE" : "INACTIVE"}
                      </button>
                      {canEdit ? (
                        <button type="button" onClick={() => setEditing({ ...pkg })} className="text-sm text-primary font-semibold hover:underline">แก้ไข</button>
                      ) : canView ? (
                        <button type="button" onClick={() => setEditing({ ...pkg })} className="text-sm text-primary font-semibold hover:underline">ดูรายละเอียด</button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        {/* หมายเหตุท้ายตารางค่าบริการ — แสดงในแคตตาล็อกทุกครั้ง */}
        <section className="rounded-xl bg-white border border-gray-300 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="text-xs font-bold text-gray-800">หมายเหตุท้ายตารางค่าบริการ</div>
            {canEdit && !notesDraft && (
              <button type="button" onClick={() => { setNotesError(""); setNotesDraft(notes.map(n => ({ body: n.body }))); }} className="text-sm text-primary font-semibold hover:underline">แก้ไข</button>
            )}
            {notesDraft && (
              <button type="button" onClick={() => setNotesDraft(v => [...(v ?? []), { body: "" }])}
                className="h-8 px-3 shrink-0 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                + เพิ่มหมายเหตุ
              </button>
            )}
          </div>
          {notesDraft ? (
            <div className="space-y-2">
              {notesDraft.map((n, index) => (
                <div key={index} className="flex items-start gap-2">
                  <textarea value={n.body} rows={2}
                    onChange={e => setNotesDraft(v => (v ?? []).map((x, i) => i === index ? { body: e.target.value } : x))}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10" />
                  <button type="button" onClick={() => setNotesDraft(v => (v ?? []).filter((_, i) => i !== index))} aria-label="ลบหมายเหตุ"
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                {notesError && <p role="alert" className="text-xs font-medium text-red-600">{notesError}</p>}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setNotesDraft(null)} className="h-9 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ยกเลิก</button>
                  <button type="button" onClick={saveNotes} disabled={notesSaving} className="h-9 px-6 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {notesSaving ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </div>
            </div>
          ) : notes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">ยังไม่มีหมายเหตุ</div>
          ) : (
            <div className="space-y-1.5">
              {notes.map((n, i) => <p key={n.id ?? i} className="text-sm text-gray-600 leading-relaxed">{n.body}</p>)}
            </div>
          )}
        </section>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full max-w-3xl my-2">
            <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900 truncate">
                    {!editing.id ? "เพิ่ม Package O&M ใหม่" : viewOnly ? "รายละเอียด Package O&M" : "แก้ไข Package O&M"}
                  </h2>
                  {viewOnly && (
                    <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xxs font-bold text-gray-500">อ่านอย่างเดียว</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{editing.id ? `รหัส #${editing.id} · ${omTierLabel(editing)}` : "กรอกรายละเอียดแพ็คเกจบริการใหม่"}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
              </button>
            </div>

            <fieldset disabled={viewOnly} className="min-w-0 p-4 md:p-6 space-y-4 bg-slate-50/50">
              {/* ── ขนาดระบบ ─────────────────────────────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-bold text-gray-800 mb-3">ขนาดติดตั้ง</div>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>ตั้งแต่ (kW) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" value={editing.kw_min || ""} onChange={e => setEditing({ ...editing, kw_min: parseFloat(e.target.value) || 0 })} placeholder="เช่น 2.00" className={`text-right ${fieldCls}`} />
                  </div>
                  <div>
                    <label className={labelCls}>ถึง (kW) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" value={editing.kw_max || ""} onChange={e => setEditing({ ...editing, kw_max: parseFloat(e.target.value) || 0 })} placeholder="เช่น 5.00" className={`text-right ${fieldCls}`} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className={labelCls}>หรือจำนวนแผงไม่เกิน</label>
                    <input type="number" value={editing.max_panels ?? ""} onChange={e => setEditing({ ...editing, max_panels: numOrNull(e.target.value) })} placeholder="-" className={`text-right ${fieldCls}`} />
                  </div>
                </div>
              </section>

              {/* ── เงื่อนไข & ค่าบริการ ─────────────────────────────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-bold text-gray-800 mb-3">เงื่อนไข &amp; ค่าบริการ</div>
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-12">
                    <label className={labelCls}>เงื่อนไข</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "per_visit" as const, label: "รายครั้ง", activeClass: "bg-orange-50 text-orange-700 border-orange-300" },
                        { key: "contract" as const, label: "สัญญา", activeClass: "bg-blue-50 text-blue-700 border-blue-300" },
                      ].map(f => (
                        <button key={f.key} type="button"
                          onClick={() => setEditing({
                            ...editing, plan_type: f.key,
                            ...(f.key === "contract" && !editing.contract_months ? { contract_months: 12, visits: 2 } : {}),
                          })}
                          className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-all ${editing.plan_type === f.key ? f.activeClass : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editing.plan_type === "contract" && (
                    <>
                      <div className="md:col-span-4">
                        <label className={labelCls}>ระยะสัญญา (เดือน) <span className="text-red-500">*</span></label>
                        <input type="number" value={editing.contract_months ?? ""} onChange={e => setEditing({ ...editing, contract_months: numOrNull(e.target.value) })} placeholder="12" className={`text-right ${fieldCls}`} />
                      </div>
                      <div className="md:col-span-4">
                        <label className={labelCls}>เข้าบริการ (ครั้ง) <span className="text-red-500">*</span></label>
                        <input type="number" value={editing.visits ?? ""} onChange={e => setEditing({ ...editing, visits: numOrNull(e.target.value) })} placeholder="2" className={`text-right ${fieldCls}`} />
                      </div>
                    </>
                  )}
                  <div className="md:col-span-4">
                    <label className={labelCls}>ค่าบริการ (บาท) <span className="text-red-500">*</span></label>
                    <input type="number" value={editing.price || ""} onChange={e => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })}
                      placeholder="ระบุราคา" className={`text-right font-semibold ${fieldCls} ${Number(editing.price) > 0 ? "" : "border-red-300 bg-red-50/40"}`} />
                  </div>
                  <div className="md:col-span-12">
                    <label className={labelCls}>ขอบเขตงาน</label>
                    <textarea value={editing.scope ?? ""} onChange={e => setEditing({ ...editing, scope: e.target.value || null })} rows={2}
                      placeholder="เช่น ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600" />
                  </div>
                </div>
              </section>
            </fieldset>

            {/* Actions — active toggle + save/cancel */}
            <div className="bg-white px-6 py-3 border-t border-gray-100 flex items-center gap-3 rounded-b-2xl">
              {viewOnly ? (
                <>
                  <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${editing.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {editing.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <div className="ml-auto">
                    <button type="button" onClick={() => setEditing(null)} className="h-9 px-6 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
                  </div>
                </>
              ) : (
              <>
              <div className="flex items-center gap-2.5">
                <div role="button" onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
                  className={`relative cursor-pointer rounded-full transition-colors ${editing.is_active ? "bg-emerald-500" : "bg-gray-300"}`}
                  style={{ width: "44px", height: "24px", minWidth: "44px", minHeight: "24px" }}>
                  <div className="absolute rounded-full bg-white shadow-sm transition-all"
                    style={{ width: "18px", height: "18px", top: "3px", left: editing.is_active ? "23px" : "3px" }} />
                </div>
                <span className={`text-sm font-semibold ${editing.is_active ? "text-emerald-700" : "text-gray-500"}`}>{editing.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
              </div>
              {saveError && <p role="alert" className="text-xs font-medium text-red-600">{saveError}</p>}
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="h-9 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ยกเลิก</button>
                <button type="button" onClick={save} disabled={saving} className="h-9 px-6 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
