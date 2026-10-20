"use client";
import { MouseEvent, ReactNode, AnchorHTMLAttributes } from "react";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";

// งาน O&M ในปฏิทินร่วมฝั่งขาย (แผน 20261001-01 เฟส 2) — รวมไว้ไฟล์เดียว
// ★ ไฟล์ปฏิทินฝั่งขาย (EventCalendarMonth/List · CalendarPicker) ใช้ร่วมกับ v2 บน main
//   แก้ที่นั่นให้น้อยที่สุด แล้วดึงของ O&M จากที่นี่ — ลด conflict ตอน merge main → v3
// ★ สี teal — ส้มของโมดูล O&M ซ้ำกับทีมติดตั้งในปฏิทิน (สำรวจ ม่วง · ติดตั้ง ส้ม · ติดตาม น้ำเงิน · งานอื่น เทา)

export const OM_EVENT_COLOR = "#0d9488";   // teal-600

/** แถวงาน O&M จาก /api/surveys/scheduled — id = เลขใบงาน · house_id ไว้เปิดหน้ารายละเอียด */
export type OmEventFields = { house_id?: number | null; om_service?: string | null; project_name?: string | null };

/** "O&M · ล้างแผง · <โครงการ>" — ★ 21 ต.ค. 69 ผู้ใช้ขอชื่อโครงการในปฏิทิน (API ส่ง project_name มาแล้ว · แผน 20261021-02) */
export const omEventLabel = (service?: string | null, project?: string | null) =>
  `O&M${service ? ` · ${service}` : ""}${project ? ` · ${project}` : ""}`;

export function OmWrenchIcon({ className = "w-3.5 h-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z" />
    </svg>
  );
}

// ลิงก์ไปหน้างานบริการ O&M — แบบ LeadLink: <a> จริง (คลิกกลาง/คลิกขวาเปิดแท็บใหม่ได้)
//   คลิกปกติผ่าน useOpenOmService (จอกว้างเปิดแท็บใหม่ ?focus=1 · มือถือแท็บเดิม)
type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "id"> & {
  houseId: number | string;
  children: ReactNode;
};

export function OmServiceLink({ houseId, onClick, children, ...rest }: LinkProps) {
  const open = useOpenOmService();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    open(houseId);
  };
  return (
    <a href={`/om/services/${houseId}`} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
