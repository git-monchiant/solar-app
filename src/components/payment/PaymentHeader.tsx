import { formatTHB } from "@/lib/utils/formatters";

interface Props {
  title: string;
  amount: number;
  amountLabel?: string;
}

export default function PaymentHeader({ title, amount, amountLabel = "ยอดชำระ" }: Props) {
  return (
    <div>
      {title && <div className="text-sm font-semibold text-gray-900">{title}</div>}
      <div className="text-xs text-gray-500">{amountLabel ? `${amountLabel} ` : ""}{formatTHB(amount)} บาท</div>
    </div>
  );
}
