"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";
import { getUserIdHeader } from "@/lib/api";

// Temporary admin-only export page. Will be replaced by a proper reports page.
export default function ExportPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="Export" subtitle="ADMIN ONLY" />
        <div className="p-4 md:p-6 max-w-4xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
            ต้องเป็น admin เท่านั้น
          </div>
        </div>
      </div>
    );
  }

  const downloadSeekerLeads = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/export/seeker-leads", { headers: { ...getUserIdHeader() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seeker-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title="Export" subtitle="DATA EXPORT (TEMP)" />
      <div className="p-4 md:p-6 max-w-4xl space-y-3">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-xs">
          🚧 หน้าชั่วคราว — จะถูกแทนที่ด้วยหน้า Reports เต็มในอนาคต
        </div>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Lead จาก Seeker</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Lead ที่ถูกสร้างจาก Prospect (source = seeker หรือผูกกับ prospect)
              รวม seeker ที่เก็บข้อมูล + รายละเอียด prospect ต้นทาง
            </p>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={downloadSeekerLeads}
              disabled={busy}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  กำลังเตรียม...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CSV
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
