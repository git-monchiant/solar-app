"use client";

interface Props {
  onClick: () => void;
  ariaLabel?: string;
}

// Shared X close button for full-screen-on-mobile modals. Keeps header layout
// consistent across NewLeadModal, AddActivityModal, ProfileModal, and seeker's
// VisitModal.
export default function ModalCloseButton({ onClick, ariaLabel = "ปิด" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{ minHeight: 0 }}
      className="w-8 h-8 -mr-1.5 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 transition-colors"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
