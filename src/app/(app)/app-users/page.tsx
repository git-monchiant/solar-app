"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useMe, ROLE_LABEL, ALL_ROLES, type Role } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  team: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
  role?: string;
  extra_roles?: string | null;
};

export default function AppUsersPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="App Users" subtitle="USER MANAGEMENT" />
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
      <Header title="App Users" subtitle="USER MANAGEMENT" />
      <div className="p-4 md:p-6">
        <UsersList currentUserId={me.id} />
      </div>
    </div>
  );
}

function UsersList({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch("/api/users").then(setUsers).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">ผู้ใช้งานระบบ</h2>
          <p className="text-xs text-gray-500 mt-0.5">เพิ่ม/แก้ไข/ปิดการใช้งาน บัญชีผู้ใช้</p>
        </div>
        <button type="button" onClick={() => setEditing("new")}
          className="h-10 px-4 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">
          + เพิ่มผู้ใช้
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Team</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">เบอร์</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3 font-semibold">{u.full_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map(r => (
                        <span key={r} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{u.team}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">{u.phone || "—"}</td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Active</span>
                      : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Disabled</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setEditing(u)}
                      className="text-xs font-semibold text-primary hover:underline">
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีผู้ใช้</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function UserEditor({ user, currentUserId, onClose, onSaved }: {
  user: UserRow | null;
  currentUserId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useDialog();
  const isNew = !user;
  const [username, setUsername] = useState(user?.username || "");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [team, setTeam] = useState(user?.team || "Sen X PM");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const initialRoles: Role[] = (() => {
    if (Array.isArray(user?.roles) && user.roles.length > 0) return user.roles as Role[];
    if (user?.role) return [user.role as Role];
    return ["sales"];
  })();
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDefaultAdmin = user?.username === "admin";
  const toggleRole = (r: Role) => {
    if (isDefaultAdmin && r === "admin") return;
    setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const save = async () => {
    if (!username || !fullName) { setError("กรุณากรอก username และชื่อ-สกุล"); return; }
    if (isNew && !password) { setError("กรุณาตั้งรหัสผ่านเริ่มต้น"); return; }
    if (roles.length === 0) { setError("เลือก role อย่างน้อย 1 อัน"); return; }
    setSaving(true); setError(null);
    try {
      if (isNew) {
        await apiFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, full_name: fullName, team, phone, email, roles }),
        });
      } else {
        await apiFetch(`/api/users/${user!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName, team, phone, email, is_active: isActive, roles,
            ...(password ? { password } : {}),
          }),
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!user) return;
    if (user.id === currentUserId) { setError("ไม่สามารถปิดบัญชีตัวเอง"); return; }
    const ok = await dialog.confirm({
      title: "ปิดการใช้งานผู้ใช้",
      message: `ปิดการใช้งานผู้ใช้ ${user.username}?`,
      variant: "danger",
      confirmText: "ปิดการใช้งาน",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-bold">{isNew ? "เพิ่มผู้ใช้ใหม่" : `แก้ไข: ${user?.full_name}`}</div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="Username">
            <input type="text" value={username} disabled={!isNew}
              onChange={e => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary disabled:bg-gray-50" />
          </Field>
          <Field label="ชื่อ-สกุล">
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label={isNew ? "รหัสผ่านเริ่มต้น" : "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)"}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label="Roles (เลือกได้หลายอัน)">
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => {
                const on = roles.includes(r);
                const locked = isDefaultAdmin && r === "admin";
                return (
                  <button key={r} type="button" onClick={() => toggleRole(r)}
                    disabled={locked}
                    title={locked ? "user 'admin' ถูกล็อกให้มี role admin เสมอ" : undefined}
                    className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"} ${locked ? "opacity-70 cursor-not-allowed" : ""}`}>
                    {ROLE_LABEL[r]}{locked && " 🔒"}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Team">
            <input type="text" value={team} onChange={e => setTeam(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label="เบอร์โทร">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </Field>

          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              เปิดการใช้งาน (active)
            </label>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg py-2 text-center">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          {!isNew && (
            <button type="button" onClick={deactivate} disabled={saving}
              className="h-10 px-4 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
              ปิดการใช้งาน
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="h-10 px-5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || roles.length === 0}
            title={roles.length === 0 ? "เลือก role อย่างน้อย 1 อัน" : undefined}
            className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
