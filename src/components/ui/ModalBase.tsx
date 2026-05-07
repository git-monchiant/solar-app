"use client";
import ModalCloseButton from "./ModalCloseButton";

type Size = "md" | "lg" | "xl";

interface Props {
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  size?: Size;
  /** Sticky bottom slot for action buttons — Save, Next, Back, etc. Pass any
   * combination; layout/spacing is the caller's responsibility. Hidden when
   * `null`/`undefined`. */
  footer?: React.ReactNode;
}

const SIZE_CLASS: Record<Size, string> = {
  md: "md:max-w-md",
  lg: "md:max-w-2xl",
  xl: "md:max-w-4xl",
};

/**
 * Standard modal frame — single source of truth for header (title + X close),
 * body, and a sticky footer slot for action buttons.
 *
 * Scroll model: NO inner scroll. The overlay container scrolls (mobile +
 * desktop) so the user only ever sees one scrollbar. Tall content makes the
 * page taller, not the modal.
 *
 * Mobile: full-screen, edge-to-edge.
 * Desktop: centered, max width by `size`, rounded corners, dim backdrop.
 */
export default function ModalBase({ title, children, onClose, size = "lg", footer }: Props) {
  return (
    // Backdrop is non-dismissive — only the X close button (or programmatic
    // onClose) closes the modal. Prevents accidental data loss when the user
    // clicks just outside an input.
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40">
      <div
        className={`relative bg-white w-full md:my-6 md:mx-auto md:rounded-2xl flex flex-col min-h-screen md:min-h-0 ${SIZE_CLASS[size]}`}
      >
        {/* Sticky header — title + close button. items-start so multi-row
         * titles (e.g. seeker prospect modal: house number + tag chips below)
         * keep the X anchored to the top instead of drifting to vertical
         * center. Single-line titles look the same. */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] flex items-start justify-between z-10 md:rounded-t-2xl gap-3">
          <h2 className="text-lg font-bold text-gray-900 truncate min-w-0 flex-1 flex items-start gap-2">{title}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        {/* Body — natural flow, parent handles scroll */}
        <div className="px-5 py-4 flex-1">{children}</div>

        {/* Sticky footer — action buttons (Save / Next / Back / etc.) */}
        {footer && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))] z-10 md:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
