"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDate } from "@/lib/utils/formatters";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";

type ErrorRow = {
  id: number;
  created_at: string;
  source: string | null;
  message: string | null;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  status_code: number | null;
  request_url: string | null;
  user_id: number | null;
  user_name: string | null;
};

const sourceTint: Record<string, string> = {
  apifetch: "bg-rose-50 text-rose-700 border-rose-200",
  window_error: "bg-amber-50 text-amber-700 border-amber-200",
  promise_rejection: "bg-orange-50 text-orange-700 border-orange-200",
  manual: "bg-blue-50 text-blue-700 border-blue-200",
};

function fmtTime(iso: string) {
  return formatThaiDate(iso, { time: true });
}

export default function ClientErrorsPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/api/client-errors?limit=200")
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="Client Errors" subtitle="ADMIN" />
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
            ต้องเป็น admin เท่านั้น
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Client Errors" subtitle="ADMIN" />
      <div className="p-4 md:p-6 space-y-3">
        <div className="text-xs text-gray-500">
          แสดง 200 รายการล่าสุด — รวม API failures, uncaught JS errors, promise rejections จาก browser ของ user
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มี error</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              const tint = r.source ? sourceTint[r.source] || "bg-gray-50 text-gray-700 border-gray-200" : "bg-gray-50 text-gray-700 border-gray-200";
              return (
                <div key={r.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 text-xxs font-bold uppercase px-2 py-0.5 rounded border ${tint}`}>
                        {r.source || "?"}{r.status_code ? ` · ${r.status_code}` : ""}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{r.message || "(no message)"}</div>
                        <div className="text-xxs text-gray-500 mt-0.5 truncate">
                          {fmtTime(r.created_at)}
                          {r.user_name ? ` · ${r.user_name}` : r.user_id ? ` · user #${r.user_id}` : " · anon"}
                          {r.url ? ` · ${new URL(r.url).pathname}` : ""}
                        </div>
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-3 space-y-2 text-xs">
                      {r.request_url && (
                        <div>
                          <span className="font-semibold text-gray-500 uppercase tracking-wider">Request:</span>{" "}
                          <span className="font-mono text-gray-800">{r.request_url}</span>
                        </div>
                      )}
                      {r.url && (
                        <div>
                          <span className="font-semibold text-gray-500 uppercase tracking-wider">Page:</span>{" "}
                          <span className="font-mono text-gray-800 break-all">{r.url}</span>
                        </div>
                      )}
                      {r.stack && (
                        <div>
                          <div className="font-semibold text-gray-500 uppercase tracking-wider mb-1">Stack / Body</div>
                          <pre className="font-mono text-xxs text-gray-700 bg-white border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{r.stack}</pre>
                        </div>
                      )}
                      {r.user_agent && (
                        <div className="text-gray-400 truncate">{r.user_agent}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
