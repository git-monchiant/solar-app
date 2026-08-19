import { hasRole, type Role } from "@/lib/roles";
import {
  BoltIcon, CheckIcon, ClockIcon, DocumentIcon, DownloadIcon, LineIcon, PhoneIcon, XIcon,
} from "@/components/ui/icons";

// ทะเบียนโมดูลของ module-base navigation (design: docs/plan/20260813-02-module-base-navigation.md)
// โมดูล = ชั้น navigation เท่านั้น — ทุก href ชี้ route เดิม ไม่มีการรื้อ URL
// เมนูในโมดูล = กลุ่ม journey code (steps/subs ใช้นับ badge จาก /api/journey-summary)

// ไอคอน inline ชุดเดียวกับ BottomNav เดิม (heroicons outline, w-6 h-6 stroke 2)
function I({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {paths.map((p, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={p} />)}
    </svg>
  );
}
const D = {
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  lines: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z",
  card: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  clipboardCheck: "M9 12.75L11.25 15 15 9.75M6.75 3.75h10.5A2.25 2.25 0 0119.5 6v12a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V6a2.25 2.25 0 012.25-2.25z",
  mapPin: ["M15 10.5a3 3 0 11-6 0 3 3 0 016 0z", "M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"],
  map: "M9 6.75V15m0-8.25l-4.5-2.25v10.5L9 17.25m0-10.5l6 3m0 6.75l4.5 2.25V8.25L15 6m0 10.5V6m0 0l-6-3",
  wrench: "M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z",
  shield: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  banknotes: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  sun: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
  archive: "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  cog: ["M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z", "M15 12a3 3 0 11-6 0 3 3 0 016 0z"],
  users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  clipboard: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  checkCircle: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  wallet: "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3",
  warning: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
};

export type ModuleKey =
  | "seeker" | "sales" | "install" | "warranty" | "om"
  | "quotation"
  | "account" | "package" | "om_package" | "dashboard" | "setup";

export type ModuleMenuItem = {
  label: string;
  /** กลุ่มที่มี children ไม่ต้องมี href (หัวข้อพับได้ ไม่ใช่ลิงก์) */
  href?: string;
  icon: React.ReactNode;
  /** journey_step ที่นับรวมเป็น badge ของเมนูนี้ */
  steps?: number[];
  /** journey_sub ที่นับรวมเป็น badge (ใช้กับคิวที่แยกระดับ sub เช่น รอยืนยันเงิน) */
  subs?: number[];
  roles?: Role[];
  /** กลุ่ม: กางค้างไว้ตั้งแต่เปิดหน้า (ผู้ใช้ยังกดหุบเองได้) */
  defaultOpen?: boolean;
  /** เมนูบริบท (แปะไว้เผื่อดู ไม่ใช่งานของโมดูล) — ไม่บวกเข้า badge การ์ดโมดูล */
  noModuleCount?: boolean;
  /** เมนูย่อย — desktop แสดงเป็นกลุ่มพับได้ · mobile ใช้ href ของลูกตัวแรก */
  children?: ModuleMenuItem[];
};

export type ModuleGroup = "operation" | "setup";

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: "operation", label: "Operation" },
  { key: "setup", label: "Setup" },
];

export type AppModule = {
  key: ModuleKey;
  label: string;
  desc: string;
  emoji: string;
  /** tailwind class พื้นหลังไอคอนการ์ดใน hub */
  tint: string;
  /** หมวดบนหน้า home */
  group: ModuleGroup;
  /** ไม่ระบุ = เห็นทุก role */
  roles?: Role[];
  soon?: boolean;
  /** จอแรกตอนเข้าโมดูลจาก hub — ไม่ระบุ = เมนูตัวแรก */
  defaultHref?: string;
  /** การ์ดบน hub แสดงเฉพาะจอเล็ก (md ขึ้นไปซ่อน) — ใช้กับโมดูลทางลัดสำหรับมือถือ */
  mobileOnly?: boolean;
  menu: ModuleMenuItem[];
};

export const MODULES: AppModule[] = [
  {
    key: "seeker", label: "Seeker", emoji: "🏠", tint: "bg-fuchsia-50",
    group: "operation",
    desc: "เก็บบ้าน · สนใจ · สร้างลีด",
    // solar_sup ไม่เกี่ยวกับงานหาลูกค้า — ตัดออกตามคำขอ
    roles: ["leadsseeker", "sales", "sales_sup", "admin"],
    menu: [
      { label: "Seeker", href: "/seeker", icon: <I d={D.mapPin} /> },
      { label: "Map", href: "/seeker/map", icon: <I d={D.map} /> },
      { label: "Insights", href: "/seeker/dashboard", icon: <I d={D.chart} /> },
      { label: "Packages", href: "/packages", icon: <I d={D.sun} /> },
    ],
  },
  {
    key: "sales", label: "Sales", emoji: "📞", tint: "bg-emerald-50",
    group: "operation",
    desc: "ติดตาม · จอง · เสนอราคา · ชำระเงิน",
    // ฝั่ง solar (ทั้ง manager และ solar ปกติ) ไม่เห็นโมดูล Sales — งานอนุมัติของ
    // Solar Manager เข้าผ่านโมดูลติดตั้ง (desktop) / โมดูล Quotation (mobile)
    roles: ["sales", "sales_sup", "account", "admin"],
    // Sales เห็นครบทุก step ของ journey — ลูกค้าติดต่อ sales ของตัวเองตลอดเส้น
    // (เลื่อนวันนัด, ทวงใบรับประกัน ฯลฯ) จึงต้องตามงานได้ถึงส่งมอบ
    menu: [
      { label: "Today", href: "/today", icon: <I d={D.calendar} /> },
      // ปฏิทินของ sales = นัดติดตาม (leads.next_follow_up) ล้วน — ไม่ใช่คิวสำรวจ/ติดตั้ง
      { label: "ปฏิทิน", href: "/calendar?team=followup", icon: <I d={D.calendar} /> },
      { label: "ทั้งหมด", href: "/pipeline?tab=all", icon: <I d={D.lines} />, steps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 9800, 9900] },
      { label: "ติดตาม", href: "/pipeline?tab=pre_survey", icon: <PhoneIcon className="w-6 h-6" strokeWidth={2} />, steps: [100] },
      { label: "จองสำรวจ", href: "/pipeline?tab=booking", icon: <ClockIcon className="w-6 h-6" strokeWidth={2} />, steps: [200] },
      { label: "สำรวจ", href: "/pipeline?tab=survey", icon: <I d={D.mapPin} />, steps: [300] },
      {
        label: "ใบเสนอราคา", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />,
        children: [
          { label: "รอใบเสนอราคา", href: "/pipeline?tab=quotation", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />, steps: [400] },
          { label: "รอชำระเงิน", href: "/pipeline?tab=order", icon: <I d={D.card} />, steps: [500] },
        ],
      },
      {
        label: "ติดตั้ง", icon: <I d={D.wrench} />,
        children: [
          { label: "รอนัดติดตั้ง", href: "/pipeline?tab=wait_install", icon: <ClockIcon className="w-6 h-6" strokeWidth={2} />, steps: [600] },
          { label: "รอติดตั้ง", href: "/pipeline?tab=install", icon: <I d={D.calendar} />, subs: [710] },
          { label: "กำลังติดตั้ง", href: "/pipeline?tab=installing", icon: <I d={D.wrench} />, subs: [720] },
        ],
      },
      { label: "รอออกใบรับประกัน", href: "/pipeline?tab=warranty", icon: <I d={D.shield} />, steps: [800] },
      // ส่งมอบแล้ว (1000) ซ่อนไว้ก่อนตามคำขอ — ยังเข้าได้จากโมดูล Warranty
      { label: "รอขอขนานไฟ", href: "/pipeline?tab=gridtie", icon: <BoltIcon className="w-6 h-6" strokeWidth={2} />, steps: [900] },
      { label: "ยกเลิก", href: "/pipeline?tab=lost", icon: <XIcon className="w-6 h-6" strokeWidth={2} />, steps: [9800, 9900] },
      { label: "แคตตาล็อก", href: "/packages", icon: <I d={D.sun} /> },
    ],
  },
  {
    // กระบวนการใบเสนอราคาครบวงจร สำหรับฝั่ง solar (ไม่เห็นโมดูล Sales)
    // — solar ปกติดู list ได้ · เมนูอนุมัติเห็นเฉพาะ Manager/Admin
    key: "quotation", label: "Quotation", emoji: "🧾", tint: "bg-rose-50",
    group: "operation",
    desc: "อนุมัติ · รอใบเสนอราคา · รอชำระเงิน",
    roles: ["solar", "solar_sup"],
    // จุดเข้า = list ลูกค้ารวมทั้งกระบวนการใบเสนอ (รอทำใบเสนอ/รออนุมัติ/รอชำระ)
    // — ไม่ใช่คิวเอกสารรออนุมัติ ซึ่งแยกเป็นเมนูของมันเอง
    defaultHref: "/pipeline?tab=quote_process",
    menu: [
      { label: "รอใบเสนอราคา", href: "/pipeline?tab=quotation", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />, steps: [400] },
      { label: "ใบเสนอราคา", href: "/pipeline?tab=quote_process", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />, steps: [400, 500] },
      { label: "รอชำระเงิน", href: "/pipeline?tab=order", icon: <I d={D.card} />, steps: [500] },
    ],
  },
  {
    key: "install", label: "สำรวจ & ติดตั้ง", emoji: "🔧", tint: "bg-blue-50",
    group: "operation",
    desc: "ปฏิทิน · สำรวจ · คิวติดตั้ง",
    roles: ["sales", "solar", "sales_sup", "solar_sup", "account", "admin"],
    defaultHref: "/calendar",
    menu: [
      { label: "Today", href: "/today", icon: <I d={D.calendar} /> },
      { label: "ปฏิทิน", href: "/calendar", icon: <I d={D.calendar} /> },
      { label: "สำรวจ", href: "/pipeline?tab=survey", icon: <I d={D.mapPin} />, steps: [300] },
      { label: "รอนัดติดตั้ง", href: "/pipeline?tab=wait_install", icon: <ClockIcon className="w-6 h-6" strokeWidth={2} />, steps: [600] },
      {
        label: "ติดตั้ง", icon: <I d={D.wrench} />, defaultOpen: true,
        children: [
          { label: "รอติดตั้ง", href: "/pipeline?tab=install", icon: <I d={D.calendar} />, subs: [710] },
          { label: "กำลังติดตั้ง", href: "/pipeline?tab=installing", icon: <I d={D.wrench} />, subs: [720] },
        ],
      },
      { label: "รอออกใบรับประกัน", href: "/pipeline?tab=warranty", icon: <I d={D.shield} />, steps: [800] },
    ],
  },
  {
    key: "warranty", label: "Warranty", emoji: "🛡️", tint: "bg-cyan-50",
    group: "operation",
    desc: "ออกใบรับประกัน · ขนานไฟ · ส่งมอบ",
    roles: ["sales", "solar", "sales_sup", "solar_sup", "admin"],
    // จอแรกของโมดูล = list รวมงานรับประกัน (800+900) — เท่ากับ badge การ์ดพอดี
    defaultHref: "/pipeline?tab=warranty_process",
    menu: [
      {
        label: "ติดตั้ง", icon: <I d={D.wrench} />, defaultOpen: true, noModuleCount: true,
        children: [
          { label: "รอติดตั้ง", href: "/pipeline?tab=install", icon: <I d={D.calendar} />, subs: [710] },
          { label: "กำลังติดตั้ง", href: "/pipeline?tab=installing", icon: <I d={D.wrench} />, subs: [720] },
        ],
      },
      { label: "ทั้งหมด", href: "/pipeline?tab=warranty_process", icon: <I d={D.lines} />, steps: [800, 900] },
      { label: "รอออกใบรับประกัน", href: "/pipeline?tab=warranty", icon: <I d={D.shield} />, steps: [800] },
      { label: "รอขอขนานไฟ", href: "/pipeline?tab=gridtie", icon: <BoltIcon className="w-6 h-6" strokeWidth={2} />, steps: [900] },
      // ส่งมอบแล้วสะสมไปเรื่อยๆ — ไม่ใช่งานค้าง ไม่นับเข้า badge การ์ดโมดูล
      { label: "ส่งมอบแล้ว", href: "/pipeline?tab=handover", icon: <CheckIcon className="w-6 h-6" strokeWidth={2} />, steps: [1000], noModuleCount: true },
    ],
  },
  {
    key: "om", label: "O&M", emoji: "🛠️", tint: "bg-orange-50",
    group: "operation",
    desc: "แจ้งซ่อม · งานซ่อม · สัญญา O&M",
    roles: ["sales", "solar", "sales_sup", "solar_sup", "admin"],
    soon: true,
    menu: [],
  },
  {
    key: "package", label: "Package", emoji: "📦", tint: "bg-violet-50",
    group: "setup",
    desc: "แคตตาล็อก · จัดการแพ็คเกจ",
    // ทั้งหมวด SETUP = admin เท่านั้น — ทีมอื่นดูแคตตาล็อกจากเมนูในโมดูลของตัวเอง
    roles: ["admin"],
    menu: [
      { label: "แคตตาล็อก", href: "/packages", icon: <I d={D.sun} /> },
      { label: "จัดการ Package", href: "/packages/manage", icon: <I d={D.archive} />, roles: ["admin"] },
    ],
  },
  {
    key: "om_package", label: "Package O&M", emoji: "🧰", tint: "bg-orange-50",
    group: "setup",
    desc: "แพ็คเกจบริการ O&M · สัญญา",
    roles: ["admin"],
    soon: true,
    menu: [],
  },
  {
    key: "account", label: "บัญชี", emoji: "💰", tint: "bg-amber-50",
    group: "operation",
    desc: "รอยืนยันเงิน · รายรับ",
    roles: ["account", "admin"],
    defaultHref: "/report/pending",
    menu: [
      { label: "ปฏิทิน", href: "/calendar", icon: <I d={D.calendar} /> },
      { label: "ทั้งหมด", href: "/pipeline?tab=all", icon: <I d={D.lines} />, steps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 9800, 9900] },
      { label: "สำรวจ", href: "/pipeline?tab=survey", icon: <I d={D.mapPin} />, steps: [300] },
      {
        label: "ใบเสนอราคา", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />, defaultOpen: true,
        children: [
          { label: "รอใบเสนอราคา", href: "/pipeline?tab=quotation", icon: <DocumentIcon className="w-6 h-6" strokeWidth={2} />, steps: [400] },
          { label: "รอชำระเงิน", href: "/pipeline?tab=order", icon: <I d={D.card} />, steps: [500] },
        ],
      },
      {
        label: "ติดตั้ง", icon: <I d={D.wrench} />, defaultOpen: true,
        children: [
          { label: "รอนัดติดตั้ง", href: "/pipeline?tab=wait_install", icon: <ClockIcon className="w-6 h-6" strokeWidth={2} />, steps: [600] },
          { label: "รอติดตั้ง", href: "/pipeline?tab=install", icon: <I d={D.calendar} />, subs: [710] },
          { label: "กำลังติดตั้ง", href: "/pipeline?tab=installing", icon: <I d={D.wrench} />, subs: [720] },
        ],
      },
      { label: "รอออกใบรับประกัน", href: "/pipeline?tab=warranty", icon: <I d={D.shield} />, steps: [800] },
      { label: "รายรับ/ใบแจ้งหนี้", href: "/report", icon: <I d={D.wallet} /> },
    ],
  },
  {
    key: "dashboard", label: "Dashboard", emoji: "📊", tint: "bg-sky-50",
    group: "operation",
    desc: "ภาพรวม · Customer · Lifecycle",
    roles: ["admin", "sales", "solar", "account", "sales_sup", "solar_sup"],
    menu: [
      { label: "ภาพรวม", href: "/dashboard", icon: <I d={D.chart} /> },
      { label: "Dashboard II", href: "/dashboard-dev", icon: <I d={D.chart} /> },
      { label: "Customer", href: "/dashboard-customer", icon: <I d={D.clipboard} /> },
      { label: "Lead Tracking", href: "/lifecycle", icon: <I d={D.checkCircle} /> },
    ],
  },
  {
    key: "setup", label: "Setup", emoji: "⚙️", tint: "bg-gray-100",
    group: "setup",
    desc: "ตั้งค่า · ผู้ใช้ · LINE · Export",
    roles: ["admin"],
    menu: [
      { label: "ตั้งค่า", href: "/settings", icon: <I d={D.cog} /> },
      { label: "ตั้งค่าการชำระ", href: "/payment-setup", icon: <I d={D.card} /> },
      { label: "ผู้ใช้", href: "/app-users", icon: <I d={D.users} /> },
      { label: "LINE Users", href: "/line-users", icon: <LineIcon className="w-6 h-6" strokeWidth={2} /> },
      { label: "Export", href: "/export", icon: <DownloadIcon className="w-6 h-6" strokeWidth={2} /> },
      { label: "Client Errors", href: "/client-errors", icon: <I d={D.warning} /> },
    ],
  },
];

export function modulesForRoles(activeRoles: Role[]): AppModule[] {
  return MODULES.filter((m) => !m.roles || hasRole(activeRoles, ...m.roles));
}

export function getModule(key: string | null | undefined): AppModule | null {
  if (!key) return null;
  return MODULES.find((m) => m.key === key) ?? null;
}

/** href ของเมนูตรงกับตำแหน่งปัจจุบันไหม — path ต้องตรงเป๊ะ และ query ใน href
 * (เช่น ?tab=survey) ต้องตรงทุกตัว · ใช้ร่วมกันทั้ง BottomNav และ useActiveMenuItem */
export function matchMenuHref(
  href: string | undefined,
  pathname: string,
  searchParams: { get(name: string): string | null },
): boolean {
  if (!href) return false;
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  if (!query) return true;
  for (const [k, v] of new URLSearchParams(query)) {
    if (searchParams.get(k) !== v) return false;
  }
  return true;
}

// active module เก็บใน localStorage — BottomNav ฟัง event นี้เพื่อสลับเมนูทันที
// โดยไม่ต้อง reload (คนที่ไม่เคยเข้า hub จะไม่มีค่านี้ → เมนูแบบเดิมทุกอย่าง)
export const ACTIVE_MODULE_KEY = "activeModule";
export const ACTIVE_MODULE_EVENT = "active-module-changed";

export function setActiveModule(key: ModuleKey | null): void {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(ACTIVE_MODULE_KEY, key);
  else localStorage.removeItem(ACTIVE_MODULE_KEY);
  window.dispatchEvent(new Event(ACTIVE_MODULE_EVENT));
}

export type JourneySummaryRow = { journey_step: number | null; journey_sub: number | null; n: number };

/** รวมจำนวน lead ของเมนู (จากแถว GROUP BY ของ /api/journey-summary) — กลุ่มที่มี
 * children ได้ค่าเป็นผลรวมของลูกทั้งหมด */
export function countForMenuItem(item: ModuleMenuItem, rows: JourneySummaryRow[]): number | null {
  if (item.children) {
    const counts = item.children.map((c) => countForMenuItem(c, rows)).filter((n): n is number => n != null);
    return counts.length > 0 ? counts.reduce((a, b) => a + b, 0) : null;
  }
  if (!item.steps && !item.subs) return null;
  return rows.reduce((sum, r) => {
    if (item.steps?.includes(r.journey_step ?? -1)) return sum + r.n;
    if (item.subs?.includes(r.journey_sub ?? -1)) return sum + r.n;
    return sum;
  }, 0);
}

/** badge รวมของการ์ดโมดูลใน hub — นับจาก "เซ็ต step/sub ไม่ซ้ำ" ของทุกเมนูรวมกัน
 * (บวกเลขรายเมนูตรงๆ ไม่ได้ เพราะเมนูรวมอย่าง "ทั้งหมด"/"ใบเสนอราคา" ทับกับเมนูรายขั้น
 * แล้วลูกค้าคนเดียวถูกนับหลายรอบ — การ์ดต้องเท่าจำนวนลูกค้าจริง) */
export function countForModule(mod: AppModule, rows: JourneySummaryRow[]): number | null {
  const steps = new Set<number>();
  const subs = new Set<number>();
  const collect = (items: ModuleMenuItem[]) => {
    for (const mi of items) {
      if (mi.noModuleCount) continue;
      mi.steps?.forEach((v) => steps.add(v));
      mi.subs?.forEach((v) => subs.add(v));
      if (mi.children) collect(mi.children);
    }
  };
  collect(mod.menu);
  if (steps.size === 0 && subs.size === 0) return null;
  let n = 0;
  for (const r of rows) {
    // แถว GROUP BY (step, sub) นับครั้งเดียว แม้จะเข้าเงื่อนไขทั้ง step และ sub
    if ((r.journey_step != null && steps.has(r.journey_step)) || (r.journey_sub != null && subs.has(r.journey_sub))) {
      n += r.n;
    }
  }
  return n;
}

// เมนูอนุมัติใบเสนอ — ไม่ผูกกับโมดูลไหน: BottomNav inject ต่อท้าย left menu ของ
// "ทุกโมดูลที่เปิด" อัตโนมัติ เมื่อ user มีสิทธิ์อนุมัติ (คนอื่นไม่เห็นเลย)
export const APPROVAL_MENU_ITEM: ModuleMenuItem = {
  label: "อนุมัติใบเสนอราคา", href: "/quotation-approvals", icon: <I d={D.clipboardCheck} />,
  roles: ["admin", "solar_sup", "sales_sup"],
};

// คิวของบัญชี — inject แบบเดียวกับเมนูอนุมัติ (โมดูลที่มีเมนูนี้อยู่แล้วจะไม่ถูกเบิ้ล)
export const ACCOUNT_PENDING_MENU_ITEM: ModuleMenuItem = {
  label: "รอยืนยันรับเงิน", href: "/report/pending", icon: <I d={D.banknotes} />,
  subs: [210, 520],
  roles: ["admin", "account"],
};

/** เมนูงานประจำตัว (ตามสิทธิ์ของ user) ที่ต้องตามไปทุกโมดูล */
export const INJECTED_MENU_ITEMS: ModuleMenuItem[] = [APPROVAL_MENU_ITEM, ACCOUNT_PENDING_MENU_ITEM];

// ---------- แถบล่างมือถือ: กำหนดตาม "role" ไม่ผูกกับโมดูลที่เปิดอยู่ ----------
// item ที่มี roles = ปุ่ม gate สิทธิ์ (คนไม่มีสิทธิ์เห็นเป็นสีเทากดไม่ได้ — BottomNav จัดการ)
const APPROVE_ITEM: ModuleMenuItem = {
  label: "อนุมัติ", href: "/quotation-approvals", icon: <I d={D.clipboardCheck} />,
  roles: ["admin", "solar_sup", "sales_sup"],
};

const SALES_BAR: ModuleMenuItem[] = [
  { label: "ปฏิทิน", href: "/calendar?team=followup", icon: <I d={D.calendar} /> },
  { label: "ติดตาม", href: "/pipeline?tab=pre_survey", icon: <PhoneIcon className="w-6 h-6" strokeWidth={2} />, steps: [100] },
  { label: "ทั้งหมด", href: "/pipeline?tab=all", icon: <I d={D.lines} />, steps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 9800, 9900] },
  APPROVE_ITEM,
];
const SOLAR_BAR: ModuleMenuItem[] = [
  { label: "ปฏิทิน", href: "/calendar", icon: <I d={D.calendar} /> },
  { label: "สำรวจ", href: "/pipeline?tab=survey", icon: <I d={D.mapPin} />, steps: [300] },
  { label: "ติดตั้ง", href: "/pipeline?tab=install_process", icon: <I d={D.wrench} />, steps: [600], subs: [710, 720] },
  APPROVE_ITEM,
];
const ACCOUNT_BAR: ModuleMenuItem[] = [
  { label: "ทั้งหมด", href: "/pipeline?tab=all", icon: <I d={D.lines} />, steps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 9800, 9900] },
  { label: "รายรับ", href: "/report", icon: <I d={D.wallet} /> },
  { label: "ยืนยันรับเงิน", href: "/report/pending", icon: <I d={D.banknotes} />, subs: [210, 520] },
];
const SEEKER_BAR: ModuleMenuItem[] = [
  { label: "Seeker", href: "/seeker", icon: <I d={D.mapPin} /> },
  { label: "Insights", href: "/seeker/dashboard", icon: <I d={D.chart} /> },
  { label: "Packages", href: "/packages", icon: <I d={D.sun} /> },
];

/** แถบล่างของ role ที่สวมอยู่ — เลือกชุดเดียวตามลำดับความสำคัญ (admin ใช้ชุด sales) */
export function mobileBarForRoles(activeRoles: Role[]): ModuleMenuItem[] {
  if (activeRoles.length === 0) return [];
  if (hasRole(activeRoles, "admin", "sales", "sales_sup")) return SALES_BAR;
  if (hasRole(activeRoles, "solar", "solar_sup")) return SOLAR_BAR;
  if (hasRole(activeRoles, "account")) return ACCOUNT_BAR;
  if (hasRole(activeRoles, "leadsseeker")) return SEEKER_BAR;
  return [];
}
