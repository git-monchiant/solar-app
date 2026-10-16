// แพ็คเกจบริการ O&M — ชนิดข้อมูล + ป้ายที่ใช้ร่วมกันทั้งแคตตาล็อก/หน้าจัดการ/API

export type OmPlanType = "per_visit" | "contract";

export type OmPackage = {
  id: number;
  kw_min: number;
  kw_max: number;
  max_panels: number | null;
  plan_type: OmPlanType;
  contract_months: number | null;
  visits: number | null;
  price: number;
  scope: string | null;
  is_active: boolean;
  /** ช่วงราคาที่แสดง (Active หรือช่วงล่าสุด) — มาจาก GET /api/om/packages เท่านั้น */
  start_date?: string | null;
  expire_date?: string | null;
};

export type OmPackageNote = { id?: number; body: string };

const kw = (n: number) => n.toFixed(2);

/** "2.00–5.00 kW" */
export const omTierKw = (p: Pick<OmPackage, "kw_min" | "kw_max">) => `${kw(p.kw_min)}–${kw(p.kw_max)} kW`;

/** ชื่อเต็มแบบในตารางราคา — "ค่าบริการงาน O&M ขนาดติดตั้ง 2.00-5.00 kW หรือจำนวนแผงไม่เกิน 10 แผง" */
export const omTierLabel = (p: Pick<OmPackage, "kw_min" | "kw_max" | "max_panels">) =>
  `ค่าบริการงาน O&M ขนาดติดตั้ง ${kw(p.kw_min)}-${kw(p.kw_max)} kW${p.max_panels ? ` หรือจำนวนแผงไม่เกิน ${p.max_panels} แผง` : ""}`;

/** คีย์จัดกลุ่มขั้นขนาดระบบ — แถวที่ขนาดเดียวกันอยู่การ์ด/กลุ่มเดียวกัน */
export const omTierKey = (p: Pick<OmPackage, "kw_min" | "kw_max" | "max_panels">) =>
  `${p.kw_min}|${p.kw_max}|${p.max_panels ?? ""}`;

/** "รายครั้ง" · "สัญญา 12 เดือน เข้า 2 ครั้ง" */
export const omPlanLabel = (p: Pick<OmPackage, "plan_type" | "contract_months" | "visits">) => {
  if (p.plan_type === "per_visit") return "รายครั้ง";
  return ["สัญญา", p.contract_months ? `${p.contract_months} เดือน` : null, p.visits ? `เข้า ${p.visits} ครั้ง` : null]
    .filter(Boolean).join(" ");
};

/**
 * ช่วง kW ของแพ็กเกจที่ "ตรงกับบ้าน" (แผน 20261014-05 · ผู้ใช้เคาะ 14 ต.ค. 69) — ใช้เตือนอย่างเดียว ไม่บล็อก
 *   · ช่วงครอบขนาดบ้าน = ตรง
 *   · บ้านเล็กกว่าช่วงแรก = ช่วงแรก (ชื่อแพ็กเกจมี "หรือจำนวนแผงไม่เกิน N แผง" — ระบบเล็กกว่านี้แผงไม่เกินแน่นอน)
 *   · บ้านใหญ่กว่าช่วงสุดท้าย = ช่วงสุดท้าย + over (ใส่ส่วนที่เกินเป็นงานเพิ่ม)
 * ไม่มีขนาดบ้าน / ไม่มีแพ็กเกจ = null
 */
export function omFitTier(pkgs: readonly Pick<OmPackage, "kw_min" | "kw_max">[], kw: number):
  { kw_min: number; kw_max: number; over: boolean } | null {
  if (!(kw > 0) || pkgs.length === 0) return null;
  const tiers = [...pkgs].sort((a, b) => a.kw_max - b.kw_max);
  const hit = tiers.find((t) => kw <= t.kw_max);
  const tier = hit ?? tiers[tiers.length - 1];
  return { kw_min: tier.kw_min, kw_max: tier.kw_max, over: !hit };
}

/** แพ็กเกจอยู่ช่วง kW เดียวกับช่วงที่ตรงกับบ้านไหม (omFitTier) */
export const omSameTier = (p: Pick<OmPackage, "kw_min" | "kw_max">, t: Pick<OmPackage, "kw_min" | "kw_max">) =>
  p.kw_min === t.kw_min && p.kw_max === t.kw_max;

/**
 * ขอบเขตงาน → รายข้อ (bullet ในแคตตาล็อก · รายละเอียดตั้งต้นใต้แพ็กเกจในใบเสนอราคา)
 * ★ แผน 20261014-04: บรรทัดละข้อ แบบใบตัวอย่างของบริษัท · ข้อมูลเก่าคั่นด้วย "+" (ตารางราคาต้นฉบับ) ยังอ่านได้
 *   ตัวเลขครั้ง/เดือนเขียนลงข้อความของแต่ละแพ็กเกจตรง ๆ (ผู้ใช้สั่ง 14 ต.ค. — ไม่ใช้ตัวแทนค่า)
 */
export const omScopeItems = (scope: string | null | undefined) => {
  const text = scope ?? "";
  return text.split(/\r?\n/.test(text) ? /\r?\n/ : "+").map((s) => s.trim()).filter(Boolean);
};

type Parsed =Omit<OmPackage, "id">;

/** ตรวจ body ของ POST/PATCH — คืนค่าที่พร้อมลงฐาน หรือข้อความ error ภาษาไทย */
export function readOmPackageBody(b: Record<string, unknown>): { value: Parsed } | { error: string } {
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const kw_min = num(b.kw_min);
  const kw_max = num(b.kw_max);
  const price = num(b.price);
  if (kw_min == null || kw_max == null || !Number.isFinite(kw_min) || !Number.isFinite(kw_max) || kw_min < 0) {
    return { error: "กรุณาระบุขนาดติดตั้ง (kW) ให้ครบ" };
  }
  if (kw_max < kw_min) return { error: "ขนาดสูงสุดต้องไม่น้อยกว่าขนาดต่ำสุด" };
  if (price == null || !(price > 0)) return { error: "กรุณาระบุค่าบริการ" };
  const plan_type: OmPlanType = b.plan_type === "contract" ? "contract" : "per_visit";
  const contract = plan_type === "contract";
  const contract_months = contract ? num(b.contract_months) : null;
  const visits = contract ? num(b.visits) : null;
  if (contract && !(Number(contract_months) > 0)) return { error: "กรุณาระบุระยะสัญญา (เดือน)" };
  if (contract && !(Number(visits) > 0)) return { error: "กรุณาระบุจำนวนครั้งที่เข้าบริการ" };
  const max_panels = num(b.max_panels);
  return {
    value: {
      kw_min, kw_max, price, plan_type, contract_months, visits,
      max_panels: max_panels && max_panels > 0 ? Math.round(max_panels) : null,
      scope: typeof b.scope === "string" && b.scope.trim() ? b.scope.trim().slice(0, 500) : null,
      is_active: b.is_active !== false,
    },
  };
}
