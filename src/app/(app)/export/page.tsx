"use client";
import { DownloadIcon } from "@/components/ui/icons";
import { useDialog } from "@/components/ui/Dialog";

import { useState } from "react";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";
import { getUserIdHeader } from "@/lib/api";

// Temporary admin-only export page. Will be replaced by a proper reports page.
export default function ExportPage() {
  const dialog = useDialog();
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="Export" subtitle="ADMIN ONLY" />
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
            ต้องเป็น admin เท่านั้น
          </div>
        </div>
      </div>
    );
  }

  const downloadCsv = async (endpoint: string, filenamePrefix: string) => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { headers: { ...getUserIdHeader() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      dialog.alert({ title: "Export ไม่สำเร็จ", message: e instanceof Error ? e.message : "Export failed", variant: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const downloadSeekerLeads = () => downloadCsv("/api/export/seeker-leads", "seeker-leads");
  const downloadSeekerProspects = () => downloadCsv("/api/export/seeker-prospects", "seeker-prospects");

  return (
    <div>
      <Header title="Export" subtitle="DATA EXPORT (TEMP)" />
      <div className="p-4 md:p-6 space-y-3">
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
              className="h-8 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  กำลังเตรียม...
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5" strokeWidth={2} />
                  Download CSV
                </>
              )}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Prospect ตามสถานะการติดตาม</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Prospect ที่ยังอยู่ระหว่างติดตาม: <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />ยังไม่ตัดสินใจ</span>
              {" · "}
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />ไม่สนใจ</span>
              {" · "}
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" />ยังไม่ได้เยี่ยม</span>
              {" "}(ไม่รวม &quot;สนใจ&quot; — อยู่ใน export ด้านบนแล้ว)
            </p>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={downloadSeekerProspects}
              disabled={busy}
              className="h-8 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  กำลังเตรียม...
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5" strokeWidth={2} />
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
