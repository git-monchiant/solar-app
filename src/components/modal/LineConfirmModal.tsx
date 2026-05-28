"use client";
import { LineIcon } from "@/components/ui/icons";
import ModalBase from "@/components/ui/ModalBase";

interface Props {
  name: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function LineConfirmModal({ name, description, onConfirm, onCancel }: Props) {
  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <LineIcon className="w-4 h-4" />
          </span>
          <span>ส่งให้ลูกค้าทาง LINE?</span>
        </div>
      }
      onClose={onCancel}
      size="md"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700">ยกเลิก</button>
          <button type="button" onClick={onConfirm} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[#06C755] text-white">ส่งเลย</button>
        </div>
      }
    >
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <LineIcon className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="text-sm text-gray-500 mb-1">{name}</div>
        {description && <div className="text-xs text-gray-400">{description}</div>}
      </div>
    </ModalBase>
  );
}
