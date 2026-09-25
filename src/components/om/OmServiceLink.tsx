"use client";
import { MouseEvent, ReactNode, AnchorHTMLAttributes } from "react";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";

// ลิงก์เข้าหน้ารายละเอียดงานบริการ O&M — ก๊อปจาก LeadLink ของฝั่งขายทั้งก้อน
// เป็น <a> จริง Ctrl/Cmd+click · คลิกกลาง · คลิกขวาเปิดแท็บใหม่ · คัดลอกลิงก์ ใช้ได้ตามปกติ
// คลิกซ้ายธรรมดาเท่านั้นที่ส่งต่อให้ useOpenOmService (จอกว้าง = แท็บใหม่ ?focus=1 · มือถือ = แท็บเดิม)
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  houseId: number | string;
  children: ReactNode;
};

export function OmServiceLink({ houseId, onClick, children, ...rest }: Props) {
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
