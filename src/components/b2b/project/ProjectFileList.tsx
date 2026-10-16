"use client";

import { formatThaiDate } from "@/lib/utils/formatters";
import { atLocal } from "@/lib/b2b/project-view";
import type { B2bProjectFile } from "@/lib/b2b/project";

// รูป/ไฟล์ของโครงการในการ์ดขั้น (แผน 20261015-10 — เริ่มจากผลสำรวจ) · กดชื่อเปิดแท็บใหม่ (ผ่าน API ที่ตรวจสิทธิ์) · × ลบทีละไฟล์
export default function ProjectFileList({ title, files, canEdit, onAdd, onView, onRemove }: {
  title: string;
  files: B2bProjectFile[];
  canEdit: boolean;
  onAdd: () => void;
  onView: (f: B2bProjectFile) => void;
  onRemove: (f: B2bProjectFile) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">{files.length} ไฟล์</span>
        {canEdit && (
          <button type="button" onClick={onAdd} className="ml-auto h-8 px-3 rounded-lg border border-active text-xs font-semibold text-active hover:bg-active-light">+ แนบไฟล์</button>
        )}
      </div>
      {files.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-gray-400">ยังไม่มีไฟล์ — รูปหลังคา · แบบ · ตู้ MDB · ไฟล์วัดพื้นที่</div>
      ) : (
        <ul className="flex flex-wrap gap-2 p-3">
          {files.map((f) => (
            <li key={f.id} className="flex max-w-full items-center rounded-lg border border-gray-200 bg-gray-50"
              title={`${f.label} · ${formatThaiDate(atLocal(f.created_at))}${f.created_by_name ? ` · ${f.created_by_name}` : ""}${f.note ? ` · ${f.note}` : ""}`}>
              <button type="button" onClick={() => onView(f)} style={{ minHeight: 0 }}
                className="max-w-[16rem] truncate px-2 py-1 text-xs text-primary hover:underline">
                {f.mime === "application/pdf" ? "📄" : "🖼"} {f.label}
              </button>
              {canEdit && (
                <button type="button" onClick={() => onRemove(f)} style={{ minHeight: 0 }} aria-label={`ลบ ${f.label}`}
                  className="px-1.5 py-1 text-xs text-gray-400 hover:text-red-600">×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
