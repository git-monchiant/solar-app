"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ModalBase from "@/components/ui/ModalBase";

interface LineUser {
  id: number;
  display_name: string;
  picture_url: string | null;
  line_user_id: string;
  created_at: string | null;
  last_message_at: string | null;
  linked_leads_count: number;
  linked_prospects_count: number;
}

type Target =
  | { type: "lead"; id: number; label: string }
  | { type: "prospect"; id: number; label: string }
  // "draft" = caller has no record yet (e.g. new-lead form). Picker just returns
  // the chosen LINE user; caller links it after saving.
  | { type: "draft"; label: string };

interface Props {
  target: Target;
  onClose: () => void;
  onLinked: (linked: { id: number; display_name: string; picture_url: string | null }) => void;
}

export default function LinePickerModal({ target, onClose, onLinked }: Props) {
  const [users, setUsers] = useState<LineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<LineUser | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    apiFetch("/api/line-users").then((data: LineUser[]) => {
      setUsers(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLink = async (user: LineUser) => {
    setLinking(true);
    try {
      // draft: no record yet — defer linking to caller (new-lead form saves first).
      if (target.type !== "draft") {
        const body = target.type === "lead"
          ? { lead_id: target.id }
          : { prospect_id: target.id };
        await apiFetch(`/api/line-users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onLinked({ id: user.id, display_name: user.display_name || "", picture_url: user.picture_url });
      onClose();
    } finally {
      setLinking(false);
    }
  };

  const filtered = users.filter(u =>
    !search || (u.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
          </span>
          <span>เชื่อม LINE</span>
        </div>
      }
      onClose={onClose}
      size="lg"
    >
      <>
        {confirm ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              {confirm.picture_url ? (
                <img src={confirm.picture_url} alt="" className="w-16 h-16 rounded-full object-cover mb-2" style={{ minHeight: 0 }} />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-2" style={{ minHeight: 0 }}>
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                </div>
              )}
              <div className="text-base font-bold text-gray-900">{confirm.display_name}</div>
              <div className="text-xs text-gray-400 mt-1">เชื่อมกับ <span className="font-semibold text-gray-700">{target.label}</span></div>
              {(confirm.linked_leads_count + confirm.linked_prospects_count) > 0 && (
                <div className="text-xs text-amber-600 mt-2">
                  LINE นี้ถูกใช้อยู่แล้วกับ {confirm.linked_leads_count} lead · {confirm.linked_prospects_count} prospect — ยืนยันจะเพิ่มซ้ำ
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700">
                ยกเลิก
              </button>
              <button type="button" disabled={linking} onClick={() => handleLink(confirm)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white disabled:opacity-50">
                {linking ? "กำลังเชื่อม..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มี LINE user ในระบบ</div>
        ) : (
          <div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ LINE..."
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary mb-3"
            />
            <div className="grid grid-cols-1 gap-2">
              {filtered.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setConfirm(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-active/40 hover:bg-active-light transition-all text-left"
                >
                  <LineAvatar url={u.picture_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{u.display_name || "LINE User"}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })
                            : ""}
                        </div>
                      </div>
                      {(u.linked_leads_count + u.linked_prospects_count) > 0 && (
                        <div className="shrink-0 flex flex-col items-end text-xs leading-snug">
                          {u.linked_leads_count > 0 && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <span>{u.linked_leads_count}</span>
                              <span className="text-gray-400">Lead</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            </div>
                          )}
                          {u.linked_prospects_count > 0 && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <span>{u.linked_prospects_count}</span>
                              <span className="text-gray-400">Prospect</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    </ModalBase>
  );
}

// LINE profile URLs expire periodically — when the image fails to load we
// silently swap to a placeholder instead of letting the broken-image icon
// (and a noisy console 404) leak into the UI.
function LineAvatar({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0" style={{ minHeight: 0 }}>
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="w-10 h-10 rounded-full object-cover shrink-0"
      style={{ minHeight: 0 }}
      onError={() => setFailed(true)}
    />
  );
}
