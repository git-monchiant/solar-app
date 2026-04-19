"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Header from "@/components/Header";
import { useMe, ROLE_LABEL, ALL_ROLES, type Role } from "@/lib/roles";

type Settings = Record<string, string>;
type Tab = "general" | "users";

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  team: string;
  role: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  extra_roles: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [tab, setTab] = useState<Tab>("general");

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("activeRoles");
    }
    router.replace("/login");
  };

  return (
    <div>
      <Header title="Settings" subtitle="APP CONFIGURATION" />

      <div className="p-4 md:p-6 max-w-4xl">
        <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
          <TabBtn active={tab === "general"} onClick={() => setTab("general")} label="ทั่วไป" />
          {isAdmin && <TabBtn active={tab === "users"} onClick={() => setTab("users")} label="ผู้ใช้งาน" />}
          <div className="flex-1" />
          <div className="pb-2 pr-1">
            <button
              type="button"
              onClick={logout}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>

        {tab === "general" && <GeneralTab />}
        {tab === "users" && isAdmin && <UsersTab currentUserId={me?.id ?? 0} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${active ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-gray-800"}`}
    >
      {label}
    </button>
  );
}

function GeneralTab() {
  const [settings, setSettings] = useState<Settings>({});
  const [taxIdInput, setTaxIdInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [bankInput, setBankInput] = useState("");
  const [bankBranchInput, setBankBranchInput] = useState("");
  const [bankNumberInput, setBankNumberInput] = useState("");
  const [bankNameInput, setBankNameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      setTaxIdInput(s.promptpay_tax_id || "");
      setCompanyInput(s.company_name || "");
      setBankInput(s.bank_account_bank || "");
      setBankBranchInput(s.bank_account_branch || "");
      setBankNumberInput(s.bank_account_number || "");
      setBankNameInput(s.bank_account_name || "");
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isOn = (key: string) => settings[key] !== "false";

  const patch = async (payload: Record<string, string | boolean>) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(prev => ({ ...prev, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) }));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: string) => {
    const next = !isOn(key);
    const qrOn = key === "promptpay_qr_enabled" ? next : isOn("promptpay_qr_enabled");
    const linkOn = key === "promptpay_link_enabled" ? next : isOn("promptpay_link_enabled");
    const bankOn = key === "bank_account_enabled" ? next : isOn("bank_account_enabled");
    if (!qrOn && !linkOn && !bankOn) return;
    await patch({ [key]: next });
  };

  const saveTaxId = async () => {
    if (!/^\d{13}$/.test(taxIdInput)) { alert("Tax ID ต้องเป็นตัวเลข 13 หลัก"); return; }
    await patch({ promptpay_tax_id: taxIdInput, company_name: companyInput });
  };

  const saveBank = async () => {
    if (!bankInput || !bankNumberInput || !bankNameInput) { alert("กรุณากรอกธนาคาร / เลขบัญชี / ชื่อบัญชี"); return; }
    await patch({
      bank_account_bank: bankInput,
      bank_account_branch: bankBranchInput,
      bank_account_number: bankNumberInput,
      bank_account_name: bankNameInput,
    });
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">PromptPay</h2>
          <p className="text-xs text-gray-500 mt-0.5">ข้อมูลผู้รับชำระเงิน</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">Tax ID (13 หลัก)</label>
              <input type="text" inputMode="numeric" maxLength={13} value={taxIdInput}
                onChange={e => setTaxIdInput(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="0000000000000"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชื่อบริษัท</label>
              <input type="text" value={companyInput} onChange={e => setCompanyInput(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={saveTaxId} disabled={saving}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              {savedAt && <span className="text-xs font-semibold text-emerald-600">✓ บันทึกแล้ว</span>}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">บัญชีธนาคาร</h2>
          <p className="text-xs text-gray-500 mt-0.5">สำหรับลูกค้าโอนตรงเข้าบัญชี</p>
        </div>
        {!loading && (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ธนาคาร</label>
              <input type="text" value={bankInput} onChange={e => setBankInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">สาขา</label>
              <input type="text" value={bankBranchInput} onChange={e => setBankBranchInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขบัญชี</label>
              <input type="text" value={bankNumberInput} onChange={e => setBankNumberInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชื่อบัญชี</label>
              <input type="text" value={bankNameInput} onChange={e => setBankNameInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={saveBank} disabled={saving}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">ช่องทางการชำระเงิน</h2>
          <p className="text-xs text-gray-500 mt-0.5">เปิด/ปิดช่องทางที่แสดงให้ลูกค้า</p>
        </div>
        {!loading && (
          <div className="divide-y divide-gray-100">
            {[
              { key: "promptpay_qr_enabled", label: "Thai QR", description: "QR code สำหรับสแกนชำระผ่าน PromptPay" },
              { key: "promptpay_link_enabled", label: "Payment Link", description: "ลิ้งค์หน้าชำระเงินส่งให้ลูกค้า" },
              { key: "bank_account_enabled", label: "Bank Account", description: "บัญชีธนาคารสำหรับลูกค้าโอนตรง" },
            ].map(t => {
              const on = isOn(t.key);
              return (
                <div key={t.key} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                  </div>
                  <button type="button" onClick={() => toggle(t.key)} disabled={saving}
                    className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-primary" : "bg-gray-300"}`}
                    aria-label={`Toggle ${t.label}`}>
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function UsersTab({ currentUserId }: { currentUserId: number }) {
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
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">{u.role}</span>
                    {u.extra_roles && <span className="text-[10px] text-gray-400 ml-1">+{u.extra_roles.split(",").length}</span>}
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
  const isNew = !user;
  const [username, setUsername] = useState(user?.username || "");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [team, setTeam] = useState(user?.team || "Sen X PM");
  const [role, setRole] = useState(user?.role || "sales");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const initialExtra = user?.extra_roles ? user.extra_roles.split(",").filter(Boolean) as Role[] : [];
  const [extraRoles, setExtraRoles] = useState<Role[]>(initialExtra);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (r: Role) => {
    setExtraRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const save = async () => {
    if (!username || !fullName) { setError("กรุณากรอก username และชื่อ-สกุล"); return; }
    if (isNew && !password) { setError("กรุณาตั้งรหัสผ่านเริ่มต้น"); return; }
    setSaving(true); setError(null);
    try {
      if (isNew) {
        await apiFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, full_name: fullName, team, role, phone, email, extra_roles: extraRoles }),
        });
      } else {
        await apiFetch(`/api/users/${user!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName, team, role, phone, email, is_active: isActive,
            extra_roles: extraRoles,
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
    if (!confirm(`ปิดการใช้งานผู้ใช้ ${user.username}?`)) return;
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
          <Field label="Role หลัก">
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary">
              <option value="admin">admin</option>
              <option value="sales">sales</option>
              <option value="solar">solar</option>
              <option value="leadsseeker">leadsseeker</option>
            </select>
          </Field>
          <Field label="Roles เพิ่มเติม">
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => {
                const on = extraRoles.includes(r);
                return (
                  <button key={r} type="button" onClick={() => toggleRole(r)}
                    className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                    {ROLE_LABEL[r]}
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
          <button type="button" onClick={save} disabled={saving}
            className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
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
