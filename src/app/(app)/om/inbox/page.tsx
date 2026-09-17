"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { UserIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";

interface Conversation {
  id: number;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  phone: string | null;
  identity_status: "unknown" | "lead" | "matched" | "verified";
  is_follow: boolean;
  channel_mode: string;
  last_message_at: string | null;
  house_id: number | null;
  house_number: string | null;
  project_name: string | null;
  last_text: string | null;
  last_direction: string | null;
  last_type: string | null;
  unread_count: number;
}

interface ChatMessage {
  id: number;
  direction: "in" | "out";
  message_type: string;
  text: string | null;
  payload: string | null;
  admin_user_id: number | null;
  created_at: string;
}

// รูป/วิดีโอผูกกับไฟล์ผ่าน media_token ใน payload → เสิร์ฟที่ /api/om/line/media/{token}
// ไฟล์เก็บ 24 ชม. (นโยบายผู้ใช้) — เกินแล้ว route ตอบ 410 → แสดง "หมดอายุ" แทน
const mediaSrc = (m: ChatMessage): string | null => {
  if (m.message_type !== "image" && m.message_type !== "video") return null;
  try {
    const token = JSON.parse(m.payload || "{}").media_token;
    return typeof token === "string" ? `/api/om/line/media/${token}` : null;
  } catch {
    return null;
  }
};

function MediaBubble({ src, kind }: { src: string; kind: string }) {
  const [dead, setDead] = useState(false);
  if (dead) {
    return <div className="px-3 py-2 text-xs italic opacity-70">ไฟล์หมดอายุแล้ว (เก็บ 24 ชม.)</div>;
  }
  return kind === "image" ? (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="" onError={() => setDead(true)} className="rounded-xl max-h-64 max-w-full object-contain" style={{ minHeight: 0 }} />
    </a>
  ) : (
    <video src={src} controls onError={() => setDead(true)} className="rounded-xl max-h-64 max-w-full" />
  );
}

// ป้ายตัวตน 4 แบบ ตาม mockup 20260824_03
const IDENTITY: Record<Conversation["identity_status"], { label: string; cls: string }> = {
  verified: { label: "ลูกค้า O&M", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  matched: { label: "รอยืนยัน", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  lead: { label: "Lead ขาย", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  unknown: { label: "ไม่ทราบตัวตน", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const fmtTime = (d: string | null) =>
  d ? formatThaiDate(d, { year: false, time: true, timeZone: "Asia/Bangkok" }) : "";

export default function OmInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | Conversation["identity_status"]>("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchConversations = () =>
    apiFetch("/api/om/line/conversations")
      .then((r) => setConversations(r.conversations || []))
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchConversations();
    const t = setInterval(fetchConversations, 15000);
    return () => clearInterval(t);
  }, []);

  const openChat = (c: Conversation) => {
    setActive(c);
    setChatLoading(true);
    apiFetch(`/api/om/line/messages?line_user_id=${encodeURIComponent(c.line_user_id)}`)
      .then((r) => setMessages(r.messages || []))
      .catch(console.error)
      .finally(() => setChatLoading(false));
    setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread_count: 0 } : x)));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch("/api/om/line/messages", {
        method: "POST",
        body: JSON.stringify({ line_user_id: active.line_user_id, text: draft.trim() }),
      });
      setDraft("");
      openChat(active);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (file: File) => {
    if (!active || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await apiFetch("/api/om/line/media", { method: "POST", body: form });
      await apiFetch("/api/om/line/messages", {
        method: "POST",
        body: JSON.stringify({ line_user_id: active.line_user_id, media_token: up.token }),
      });
      openChat(active);
    } catch (e) {
      alert(e instanceof Error ? e.message : "ส่งไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const shown = conversations.filter((c) => filter === "all" || c.identity_status === filter);
  const unreadTotal = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div className="flex flex-col h-[calc(100dvh-0px)]">
      <Header title="แชต LINE" subtitle={unreadTotal > 0 ? `ยังไม่อ่าน ${unreadTotal}` : "O&M inbox"} />

      <div className="flex flex-1 min-h-0">
        {/* รายชื่อห้องแชต — mobile: ซ่อนเมื่อเปิดแชตอยู่ */}
        <div className={`w-full md:w-80 md:border-r border-gray-200 bg-white flex-col min-h-0 ${active ? "hidden md:flex" : "flex"}`}>
          <div className="flex gap-1.5 p-3 border-b border-gray-100 overflow-x-auto">
            {([["all", "ทั้งหมด"], ["verified", "ลูกค้า O&M"], ["matched", "รอยืนยัน"], ["lead", "Lead"], ["unknown", "ไม่ทราบ"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                style={{ minHeight: 0 }}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                  filter === k ? "bg-blue-900 text-white border-blue-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <Loading />
            ) : shown.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">ยังไม่มีแชต</div>
            ) : (
              shown.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openChat(c)}
                  style={{ minHeight: 0 }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${active?.id === c.id ? "bg-gray-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {c.picture_url ? (
                      <img src={c.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ minHeight: 0 }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 shrink-0" style={{ minHeight: 0 }}>
                        <UserIcon className="w-5 h-5" strokeWidth={2} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm truncate">{c.display_name || c.line_user_id}</span>
                        <span className={`px-1.5 py-px rounded-full text-xxs font-semibold border shrink-0 ${IDENTITY[c.identity_status].cls}`}>
                          {IDENTITY[c.identity_status].label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {c.last_direction === "out" ? "คุณ: " : ""}
                        {c.last_type === "follow" ? "เพิ่มเพื่อนแล้ว" : c.last_text || c.last_type || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xxs text-gray-400">{fmtTime(c.last_message_at)}</span>
                      {c.unread_count > 0 && (
                        <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-white text-xxs font-bold">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ห้องแชต */}
        <div className={`flex-1 flex-col min-h-0 bg-gray-50 ${active ? "flex" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">เลือกห้องแชตจากรายการ</div>
          ) : (
            <>
              {/* แถบบริบท: ตัวตน + บ้าน (ย่อ ไม่กินพื้นที่แชต ตาม feedback mockup) */}
              <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
                <button type="button" onClick={() => setActive(null)} style={{ minHeight: 0 }} className="md:hidden text-gray-500 text-sm font-semibold cursor-pointer">
                  ←
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm truncate">{active.display_name || active.line_user_id}</span>
                    <span className={`px-1.5 py-px rounded-full text-xxs font-semibold border ${IDENTITY[active.identity_status].cls}`}>
                      {IDENTITY[active.identity_status].label}
                    </span>
                    {active.channel_mode === "test" && (
                      <span className="px-1.5 py-px rounded-full text-xxs font-semibold bg-red-50 text-red-600 border border-red-200">TEST</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {active.house_number ? `บ้าน ${active.house_number} · ${active.project_name || "—"}` : "ยังไม่ผูกบ้าน"}
                    {active.phone ? ` · ${active.phone}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {chatLoading ? (
                  <Loading />
                ) : (
                  messages.map((m) =>
                    m.message_type === "follow" ? (
                      <div key={m.id} className="text-center text-xxs text-gray-400 py-1">
                        เพิ่มเพื่อนเมื่อ {fmtTime(m.created_at)}
                      </div>
                    ) : (
                      <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl text-sm break-words overflow-hidden ${
                            mediaSrc(m) ? "p-1" : "px-3.5 py-2 whitespace-pre-wrap"
                          } ${
                            m.direction === "out"
                              ? "bg-blue-900 text-white rounded-br-md"
                              : "bg-white border border-gray-200 text-gray-900 rounded-bl-md"
                          }`}
                        >
                          {mediaSrc(m) ? (
                            <MediaBubble src={mediaSrc(m)!} kind={m.message_type} />
                          ) : (
                            m.text || <span className="italic opacity-70">[{m.message_type}]</span>
                          )}
                          <div className={`text-xxs mt-0.5 ${mediaSrc(m) ? "px-2 pb-1" : ""} ${m.direction === "out" ? "text-blue-200" : "text-gray-400"}`}>
                            {fmtTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    ),
                  )
                )}
                <div ref={bottomRef} />
              </div>

              <div className="bg-white border-t border-gray-200 p-3 flex gap-2 items-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,video/mp4"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f); }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title="แนบรูป (JPEG/PNG ≤10MB) หรือวิดีโอ (MP4 ≤50MB)"
                  style={{ minHeight: 0 }}
                  className="w-9 h-9 shrink-0 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  {uploading ? (
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-900 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  )}
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="พิมพ์ข้อความตอบลูกค้า…"
                  className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-900"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  style={{ minHeight: 0 }}
                  className="px-4 py-2 rounded-full bg-blue-900 text-white text-sm font-semibold disabled:opacity-40 cursor-pointer"
                >
                  ส่ง
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
