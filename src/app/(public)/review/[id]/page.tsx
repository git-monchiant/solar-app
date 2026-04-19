"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

const CATEGORIES = [
  { key: "review_quality", label: "คุณภาพงานติดตั้ง", icon: "🔧" },
  { key: "review_service", label: "การบริการ", icon: "🤝" },
  { key: "review_punctuality", label: "ความตรงต่อเวลา", icon: "⏰" },
];

export default function ReviewPage() {
  const { id } = useParams();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const allRated = CATEGORIES.every(c => ratings[c.key] > 0);
  const avgRating = allRated ? Math.round(CATEGORIES.reduce((sum, c) => sum + (ratings[c.key] || 0), 0) / CATEGORIES.length) : 0;

  const submit = async () => {
    if (!allRated) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          review_rating: avgRating,
          review_quality: ratings.review_quality,
          review_service: ratings.review_service,
          review_punctuality: ratings.review_punctuality,
          review_comment: comment || null,
        }),
      });
      setSubmitted(true);
    } finally { setSaving(false); }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </div>
          <div className="text-xl font-bold text-gray-900 mb-2">ขอบคุณครับ</div>
          <div className="text-sm text-gray-500 mb-4">ขอบคุณสำหรับการประเมิน<br />ความคิดเห็นของคุณมีค่ากับเรา</div>
          <div className="space-y-2">
            {CATEGORIES.map(c => (
              <div key={c.key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                <span className="text-sm text-gray-600">{c.icon} {c.label}</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-lg ${s <= (ratings[c.key] || 0) ? "text-amber-400" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <img src="/logos/logo-sena.png" alt="Sena Solar" className="h-8 mx-auto opacity-50" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8">
        <div className="text-center mb-6">
          <img src="/logos/logo-sena.png" alt="Sena Solar" className="h-10 mx-auto mb-4" />
          <div className="text-lg font-bold text-gray-900">ประเมินการติดตั้ง</div>
          <div className="text-sm text-gray-500 mt-1">กรุณาให้คะแนนการติดตั้ง Solar Rooftop</div>
        </div>

        <div className="space-y-4 mb-6">
          {CATEGORIES.map(c => (
            <div key={c.key}>
              <div className="text-sm font-semibold text-gray-700 mb-2">{c.icon} {c.label}</div>
              <div className="flex items-center gap-2 justify-center">
                {[1,2,3,4,5].map(s => (
                  <button key={s} type="button" onClick={() => setRatings(prev => ({ ...prev, [c.key]: s }))}
                    className="transition-transform hover:scale-110 active:scale-95" style={{ minHeight: 0 }}>
                    <span className={`text-3xl ${s <= (ratings[c.key] || 0) ? "text-amber-400" : "text-gray-200"}`}>★</span>
                  </button>
                ))}
              </div>
              {ratings[c.key] > 0 && (
                <div className="text-center text-xs font-semibold mt-1">
                  {ratings[c.key] === 1 && <span className="text-red-500">ต้องปรับปรุง</span>}
                  {ratings[c.key] === 2 && <span className="text-orange-500">พอใช้</span>}
                  {ratings[c.key] === 3 && <span className="text-amber-500">ปานกลาง</span>}
                  {ratings[c.key] === 4 && <span className="text-emerald-500">ดี</span>}
                  {ratings[c.key] === 5 && <span className="text-emerald-600">ดีมาก</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">ความคิดเห็นเพิ่มเติม</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="บอกเราว่าคุณคิดอย่างไร..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
        </div>

        <button onClick={submit} disabled={saving || !allRated}
          className="w-full h-12 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
          {saving ? "กำลังส่ง..." : !allRated ? "กรุณาให้คะแนนครบทุกหัวข้อ" : "ส่งคะแนน"}
        </button>
      </div>
    </div>
  );
}
