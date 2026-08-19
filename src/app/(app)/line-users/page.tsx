"use client";
import { PlusIcon, UserIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import NewLeadModal from "@/components/modal/NewLeadModal";
import { LeadLink } from "@/components/lead/LeadLink";
import Loading from "@/components/ui/Loading";

interface LinkedLead {
  id: number;
  full_name: string;
  phone: string | null;
  status: string;
}

interface LinkedProspect {
  id: number;
  house_number: string | null;
  full_name: string | null;
  project_name: string | null;
  lead_id: number | null;
}

interface LineUser {
  id: number;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  phone: string | null;
  house_number: string | null;
  linked_leads: LinkedLead[];
  linked_prospects: LinkedProspect[];
  linked_leads_count: number;
  linked_prospects_count: number;
  created_at: string;
  last_message_at: string | null;
}

// Parse full ISO string (including Z) so JS correctly reads it as UTC then
// converts to the user's local timezone. Stripping Z via slice() would make
// JS treat it as naive local time and shift the display by +7h in Bangkok.
const formatDate = (d: string) =>
  formatThaiDate(d, { year: false, time: true, timeZone: "Asia/Bangkok" });

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
          <Loading />
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">ยังไม่มี LINE user</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">เบอร์</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">บ้านเลขที่</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mapped Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Added</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.picture_url ? (
                          <img src={u.picture_url} alt="" className="w-9 h-8 rounded-full object-cover" style={{ minHeight: 0 }} />
                        ) : (
                          <div className="w-9 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400" style={{ minHeight: 0 }}>
                            <UserIcon className="w-5 h-5" strokeWidth={2} />
                          </div>
                        )}
                        <span className="font-semibold text-gray-900">{u.display_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {u.phone || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {u.house_number || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(u.linked_leads.length > 0 || u.linked_prospects.length > 0) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {u.linked_leads.map(l => (
                            <LeadLink
                              key={`l${l.id}`}
                              id={l.id}
                              title={`Lead: ${l.full_name}${l.phone ? ` · ${l.phone}` : ""}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                            >
                              L#{l.id}
                            </LeadLink>
                          ))}
                          {u.linked_prospects.filter(p => !p.lead_id).map(p => (
                            <a
                              key={`p${p.id}`}
                              href={p.project_name ? `/seeker?project=${encodeURIComponent(p.project_name)}` : "/seeker"}
                              title={`Prospect: ${p.house_number || "-"}${p.full_name ? ` · ${p.full_name}` : ""}${p.project_name ? ` · ${p.project_name}` : ""}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                            >
                              P#{p.id}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <button type="button" onClick={() => setNewLeadForLine(u)} className="inline-flex items-center gap-1 text-active font-semibold hover:underline cursor-pointer">
                          <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                          สร้าง Lead
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {(u.linked_leads.length > 0 || u.linked_prospects.length > 0) ? (
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
