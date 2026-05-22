import { useState } from "react";
import { formatTHB } from "@/lib/utils/formatters";

interface Props {
  title: string;
  amount: number;
  amountLabel?: string;
  /** When set, shows a pencil icon next to the amount. Click to edit inline. */
  onAmountEdit?: (next: number) => void;
}

export default function PaymentHeader({ title, amount, amountLabel = "ยอดชำระ", onAmountEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(amount));

  const commit = () => {
    const n = Math.max(0, parseInt(draft) || 0);
    onAmountEdit?.(n);
    setEditing(false);
  };

  return (
    <div>
      {title && <div className="text-sm font-semibold text-gray-900">{title}</div>}
      <div className="text-xs text-gray-500 flex items-center gap-1">
        {amountLabel ? `${amountLabel} ` : ""}
        {editing ? (
          <input
            type="number"
            autoFocus
            value={draft}
            min={0}
            step={100}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(String(amount)); setEditing(false); }
            }}
            className="w-24 h-6 px-1.5 rounded border border-primary font-mono text-right text-xs focus:outline-none"
            style={{ minHeight: 0 }}
          />
        ) : (
          <span>{formatTHB(amount)}</span>
        )}
        <span>บาท</span>
        {onAmountEdit && !editing && (
          <button
            type="button"
            onClick={() => { setDraft(String(amount)); setEditing(true); }}
            className="ml-1 text-gray-400 hover:text-primary transition-colors"
            title="แก้ไขจำนวน"
            style={{ minHeight: 0 }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
