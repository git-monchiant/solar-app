"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface LineUser {
  id: number;
  display_name: string;
  picture_url: string | null;
  line_user_id: string;
  lead_id: number | null;
  created_at: string | null;
  last_message_at: string | null;
}

interface Props {
  leadId: number;
  leadName: string;
  onClose: () => void;
  onLinked: () => void;
}

export default function LinePickerModal({ leadId, leadName, onClose, onLinked }: Props) {
  const [users, setUsers] = useState<LineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<LineUser | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    apiFetch("/api/line-users").then((data: LineUser[]) => {
      setUsers(data.filter(u => !u.lead_id));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLink = async (user: LineUser) => {
    setLinking(true);
    try {
      await apiFetch(`/api/line-users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      onLinked();
      onClose();
    } finally {
      setLinking(false);
    }
  };

  const filtered = users.filter(u =>
    !search || (u.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-3xl p-5 pb-8 md:pb-5 animate-slide-up max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">เชื่อม LINE</h3>
          <button onClick={onClose} style={{ minHeight: 0 }} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

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
              <div className="text-xs text-gray-400 mt-1">เชื่อมกับ <span className="font-semibold text-gray-700">{leadName}</span></div>
              <div className="text-xs text-amber-600 mt-2">เชื่อมได้ครั้งเดียว ไม่สามารถเปลี่ยนได้</div>
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
          <div className="text-center py-8 text-gray-400 text-sm">ไม่มี LINE user ที่รอเชื่อม</div>
        ) : (
          <div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ LINE..."
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary mb-3"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {filtered.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setConfirm(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-active/40 hover:bg-active-light transition-all text-left"
                >
                  {u.picture_url ? (
                    <img src={u.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ minHeight: 0 }} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0" style={{ minHeight: 0 }}>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{u.display_name || "LINE User"}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {u.created_at ? `เพิ่มเมื่อ ${new Date(u.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ""}
                      {u.last_message_at ? ` · ล่าสุด ${new Date(u.last_message_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
