"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

export default function CameraPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setPreview(ev.target?.result as string); setExtracted(false); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Header title="Scan Document" backHref="/leads/new" />

      <div className="p-4 md:p-6 space-y-4">
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} className="hidden" />

        {!preview ? (
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-[4/3] md:aspect-[16/9] bg-white rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center gap-3 active:bg-primary/5 hover:border-primary/50 transition-colors">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
            <div className="text-primary font-medium">Tap to capture</div>
            <div className="text-sm text-gray">ID Card / Document / Electricity Bill</div>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden">
              <img src={preview} alt="captured" className="w-full" />
              <button onClick={() => { setPreview(null); setExtracted(false); }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm">✕</button>
            </div>

            {!extracted ? (
              <button onClick={() => setExtracted(true)}
                className="w-full md:w-auto md:px-12 py-4 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-bold text-base active:scale-[0.98] transition-all shadow-lg shadow-primary/20">
                Extract Data (Demo)
              </button>
            ) : (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Extraction Complete (Demo)
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray">Name</span><span className="font-medium">สมชาย ใจดี</span></div>
                  <div className="flex justify-between"><span className="text-gray">ID No.</span><span className="font-medium">1-xxxx-xxxxx-xx-x</span></div>
                  <div className="flex justify-between"><span className="text-gray">Address</span><span className="font-medium">99/123 ม.5</span></div>
                </div>
                <Link href="/leads/new"
                  className="block w-full py-3 bg-primary text-white rounded-xl font-medium text-center text-sm active:scale-[0.98] mt-2">
                  Use in Form
                </Link>
              </div>
            )}

            <button onClick={() => fileInputRef.current?.click()}
              className="w-full md:w-auto md:px-8 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium active:bg-gray-50 hover:bg-gray-50 transition-colors">
              Retake Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
