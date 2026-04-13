// Shared UI style tokens — keep the whole app consistent.
// Reference: lead detail / pre-survey card style.

export const ui = {
  // Cards
  card: "rounded-lg bg-white border border-gray-200 p-3",
  cardLg: "rounded-xl bg-white border border-gray-200/70",
  cardHeader: "px-4 py-2.5 flex items-center gap-2.5",
  cardBody: "px-4 pb-3 pt-2 border-t border-gray-100",

  // Labels
  label: "text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1.5",
  labelInline: "text-xs font-semibold tracking-[0.1em] uppercase text-gray-400",

  // Inputs
  input: "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors",
  inputMono: "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary transition-colors",
  select: "w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm appearance-none focus:outline-none focus:border-primary transition-colors",
  textarea: "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors resize-none",

  // Chip buttons (toggle/select) — uses --active theme
  chip: (selected: boolean) =>
    `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
      selected
        ? "bg-active text-white border-active shadow-sm shadow-active/20"
        : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
    }`,

  // Action buttons
  btnPrimary: "w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-primary/20",
  btnSecondary: "w-full h-11 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-colors",
  btnDanger: "w-full h-11 rounded-lg text-sm font-semibold text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-colors",

  // Small badges/pills
  badgeBlue: "inline-flex items-center text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-600/15",
  badgePurple: "inline-flex items-center text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-600/15",
  badgeEmerald: "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-600/15",
  badgeAmber: "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-600/15",
  badgeRed: "inline-flex items-center text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-600/15",
  badgeGray: "inline-flex items-center text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200",

  // Typography helpers
  title: "text-sm font-semibold leading-tight tracking-tight text-gray-900",
  titleLg: "text-base font-bold leading-tight tracking-tight text-gray-900",
  subtitle: "text-xs text-gray-500",
  meta: "text-xs text-gray-400",

  // Layout
  page: "p-3 space-y-2",
  pageWide: "p-4 space-y-3",
};
