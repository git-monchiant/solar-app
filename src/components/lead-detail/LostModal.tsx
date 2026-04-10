"use client";

import { useState } from "react";

const LOST_REASONS = ["Too expensive", "Not ready yet", "Chose competitor", "Roof not suitable", "Other"];

interface Props {
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function LostModal({ leadId, onClose, onSaved }: Props) {
  const [reason, setReason] = useState("");
  const [revisitDate, setRevisitDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          status: "lost",
          lost_reason: reason === "Other" ? note : reason,
          revisit_date: revisitDate || null,
        }),
      });
      if (note) {
        await fetch(`/api/leads/${leadId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({ activity_type: "note", note: `Lost: ${reason === "Other" ? note : reason}` }),
        });
      }
      onSaved();
      onClose();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 pb-8 animate-slide-up">
        <h3 className="font-bold text-lg text-red-600 mb-4">Mark as Lost</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1.5">Reason *</label>
            <div className="flex flex-wrap gap-2">
              {LOST_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${reason === r ? "bg-red-500 text-white" : "bg-gray-100 text-gray"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {reason === "Other" && (
            <div>
              <label className="block text-sm font-semibold mb-1">Details</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1">Revisit Date (optional)</label>
            <input type="date" value={revisitDate} onChange={(e) => setRevisitDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            <div className="text-xs text-gray mt-1">Set a date to revisit this customer</div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={!reason || saving}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50">
            {saving ? "Saving..." : "Mark Lost"}
          </button>
        </div>
      </div>
    </div>
  );
}
