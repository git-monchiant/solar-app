// Reusable "done view" summary section — left-bordered card with a coloured
// header, used across step components (PreSurvey, Survey, Install, Quote, ...)
// when the step is collapsed. Replaces 30+ duplicated `border-l-3 border-X ...`
// blocks so a single tweak changes the look everywhere.

type Color = "primary" | "indigo" | "amber" | "orange" | "blue" | "violet" | "emerald" | "teal" | "gray" | "red" | "rose" | "sky";

const COLOR_CLASSES: Record<Color, { border: string; text: string }> = {
  primary: { border: "border-primary",     text: "text-primary" },
  indigo:  { border: "border-indigo-400",  text: "text-indigo-600" },
  amber:   { border: "border-amber-400",   text: "text-amber-600" },
  orange:  { border: "border-orange-400",  text: "text-orange-600" },
  blue:    { border: "border-blue-400",    text: "text-blue-600" },
  violet:  { border: "border-violet-400",  text: "text-violet-600" },
  emerald: { border: "border-emerald-400", text: "text-emerald-600" },
  teal:    { border: "border-teal-400",    text: "text-teal-600" },
  gray:    { border: "border-gray-300",    text: "text-gray-500" },
  red:     { border: "border-red-400",     text: "text-red-600" },
  rose:    { border: "border-rose-400",    text: "text-rose-600" },
  sky:     { border: "border-sky-400",     text: "text-sky-600" },
};

interface Props {
  color?: Color;
  title: React.ReactNode;
  children: React.ReactNode;
}

export default function DoneSection({ color = "gray", title, children }: Props) {
  const c = COLOR_CLASSES[color];
  return (
    <div className={`border-l-3 ${c.border} pl-3`}>
      <div className={`text-xs font-bold ${c.text} uppercase mb-1.5`}>{title}</div>
      {children}
    </div>
  );
}
