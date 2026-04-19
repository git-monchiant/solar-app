const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);

interface Props {
  title: string;
  amount: number;
  amountLabel?: string;
}

export default function PaymentHeader({ title, amount, amountLabel = "ยอดชำระ" }: Props) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500">{amountLabel} {fmt(amount)} บาท</div>
    </div>
  );
}
