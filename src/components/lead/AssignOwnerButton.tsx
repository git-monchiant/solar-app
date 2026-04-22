"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";

interface User {
  id: number;
  username: string;
  full_name: string;
  team?: string | null;
  role?: string | null;
}

interface Props {
  leadId: number;
  assignedUserId: number | null;
  assignedName: string | null;
  onChanged?: () => void;
  size?: "sm" | "md";
}

function initialsOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  const isLatin = /^[A-Za-z\s]+$/.test(trimmed);
  if (isLatin) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Thai / non-Latin: many leading characters (เ แ โ ใ ไ ำ vowel marks, etc.)
  // render unrecognizably in a small circle. Use an icon instead.
  return null;
}

function colorOf(id: number | null): string {
  const palette = ["bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500"];
  return palette[Math.abs((id ?? 0) % palette.length)];
}

export default function AssignOwnerButton({ leadId, assignedUserId, assignedName, onChanged, size = "sm" }: Props) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Local optimistic state so the avatar updates instantly on click,
  // without waiting for parent list refresh.
  const [localUserId, setLocalUserId] = useState<number | null>(assignedUserId);
  const [localName, setLocalName] = useState<string | null>(assignedName);
  useEffect(() => { setLocalUserId(assignedUserId); setLocalName(assignedName); }, [assignedUserId, assignedName]);

  useEffect(() => {
    if (!open || users.length > 0) return;
    apiFetch("/api/users?role=sales").then(setUsers).catch(console.error);
  }, [open, users.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const assign = async (userId: number | null, name: string | null) => {
    // Optimistic update — avatar switches immediately
    setLocalUserId(userId);
    setLocalName(name);
    setOpen(false);
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_user_id: userId }),
      });
      onChanged?.();
    } catch (e) {
      // Revert on failure
      setLocalUserId(assignedUserId);
      setLocalName(assignedName);
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const sizePx = size === "md" ? "w-9 h-9 text-[13px]" : "w-6 h-6 text-[10px]";
  const iconSize = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  const assigned = !!localUserId;
  const initials = initialsOf(localName);
  const personIcon = (
    <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
    </svg>
  );

  return (
    <div className="relative" ref={ref} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${sizePx} rounded-full flex items-center justify-center font-bold transition-all shrink-0 ${
          assigned
            ? `${colorOf(localUserId)} text-white shadow-sm`
            : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        }`}
        title={assigned ? `Owner: ${localName}` : "Assign owner"}
        style={{ minHeight: 0 }}
      >
        {assigned ? (initials ?? personIcon) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-8 z-50 w-56 rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            Assign Owner
          </div>
          {me && localUserId !== me.id && (
            <button
              type="button"
              disabled={saving}
              onClick={() => assign(me.id, me.full_name)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <span className={`w-6 h-6 rounded-full ${colorOf(me.id)} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                {initialsOf(me.full_name) ?? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                )}
              </span>
              <span className="text-sm font-semibold text-gray-800">Me — {me.full_name}</span>
            </button>
          )}
          <div className="max-h-60 overflow-y-auto">
            {users.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">Loading...</div>
            ) : (
              users.filter(u => u.id !== me?.id).map(u => (
                <button
                  key={u.id}
                  type="button"
                  disabled={saving}
                  onClick={() => assign(u.id, u.full_name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${u.id === localUserId ? "bg-primary/5" : ""}`}
                >
                  <span className={`w-6 h-6 rounded-full ${colorOf(u.id)} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                    {initialsOf(u.full_name) ?? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{u.full_name}</span>
                  {u.id === localUserId && (
                    <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
          {localUserId && (
            <button
              type="button"
              disabled={saving}
              onClick={() => assign(null, null)}
              className="w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 text-left"
            >
              ✕ ลบ owner
            </button>
          )}
        </div>
      )}
    </div>
  );
}
