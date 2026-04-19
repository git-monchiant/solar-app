"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import NewLeadModal from "@/components/modal/NewLeadModal";

interface LineUser {
  id: number;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  lead_id: number | null;
  lead_name: string | null;
  lead_phone: string | null;
  created_at: string;
  last_message_at: string | null;
}

const formatDate = (d: string) =>
  new Date(String(d).slice(0, 19)).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function LineUsersPage() {
  const [users, setUsers] = useState<LineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeadForLine, setNewLeadForLine] = useState<LineUser | null>(null);

  const fetchUsers = () => {
    apiFetch("/api/line-users").then(setUsers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  return (
    <div>
      <Header title="LINE Users" subtitle={`${users.length} users`} />

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">ยังไม่มี LINE user</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">LINE ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mapped Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Active</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.picture_url ? (
                          <img src={u.picture_url} alt="" className="w-9 h-9 rounded-full object-cover" style={{ minHeight: 0 }} />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-400" style={{ minHeight: 0 }}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                          </div>
                        )}
                        <span className="font-semibold text-gray-900">{u.display_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[150px]">{u.line_user_id}</td>
                    <td className="px-4 py-3">
                      {u.lead_id ? (
                        <a href={`/leads/${u.lead_id}`} className="text-active font-semibold hover:underline">
                          {u.lead_name} {u.lead_phone && <span className="text-gray-400 font-mono text-xs ml-1">{u.lead_phone}</span>}
                        </a>
                      ) : (
                        <button type="button" onClick={() => setNewLeadForLine(u)} className="inline-flex items-center gap-1 text-active font-semibold hover:underline cursor-pointer">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          สร้าง Lead
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.last_message_at ? formatDate(u.last_message_at) : formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {u.lead_id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Mapped
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newLeadForLine && (
        <NewLeadModal
          onClose={() => setNewLeadForLine(null)}
          onCreated={fetchUsers}
          linkLine={{
            userId: newLeadForLine.id,
            displayName: newLeadForLine.display_name || "",
            pictureUrl: newLeadForLine.picture_url,
          }}
        />
      )}
    </div>
  );
}
