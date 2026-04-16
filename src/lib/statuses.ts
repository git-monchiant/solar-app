export const STATUSES = ["register", "booked", "survey", "quote", "order", "install", "closed"] as const;
export type Status = (typeof STATUSES)[number] | "lost";

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string; icon: string; description: string; action: string }> = {
  register:    { label: "รอติดตาม",     color: "bg-sky-500",     bg: "bg-sky-50",     text: "text-sky-700",     icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",  description: "Registered or walked in — first contact",      action: "Log Contact" },
  booked:        { label: "Booked",        color: "bg-indigo-500",  bg: "bg-indigo-50",  text: "text-indigo-700",  icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",  description: "Booking placed",                       action: "Create Booking" },
  survey:        { label: "สำรวจหน้างาน",   color: "bg-violet-500",  bg: "bg-violet-50",  text: "text-violet-700",  icon: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",  description: "Site survey scheduled",                action: "Schedule Survey" },
  quote:        { label: "รอใบเสนอราคา",   color: "bg-orange-500",  bg: "bg-orange-50",  text: "text-orange-700",  icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",  description: "Quotation sent — waiting for decision", action: "Show Package" },
  order:     { label: "รออนุมัติ/ชำระ", color: "bg-green-500",   bg: "bg-green-50",   text: "text-green-700",   icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",  description: "Customer order — process payment",  action: "Process Payment" },
  install:     { label: "กำลังติดตั้ง",   color: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", icon: "M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z",  description: "Installation completed!",              action: "Complete" },
  closed:        { label: "ติดตั้งเรียบร้อย", color: "bg-teal-500",    bg: "bg-teal-50",    text: "text-teal-700",    icon: "M4.5 12.75l6 6 9-13.5",  description: "Job closed — all done",                action: "Closed" },
  lost:          { label: "ยกเลิก",         color: "bg-red-400",     bg: "bg-red-50",     text: "text-red-700",     icon: "M6 18L18 6M6 6l12 12",  description: "Lost — set revisit date",               action: "Set Revisit" },
};

export const PAYMENT_TYPES = [
  { value: "transfer", label: "โอนเงิน" },
  { value: "credit_card", label: "บัตรเครดิต" },
  { value: "green_loan", label: "สินเชื่อกรีน" },
  { value: "home_equity", label: "สินเชื่อบ้าน" },
] as const;

export const FINANCE_STATUSES = [
  { value: "pending", label: "รอดำเนินการ", color: "bg-amber-100 text-amber-700" },
  { value: "approved", label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  { value: "rejected", label: "ไม่อนุมัติ", color: "bg-red-100 text-red-700" },
] as const;
