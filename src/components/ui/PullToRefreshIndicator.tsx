"use client";

export default function PullToRefreshIndicator({
  pullY,
  refreshing,
  threshold = 70,
}: {
  pullY: number;
  refreshing: boolean;
  threshold?: number;
}) {
  const ready = pullY >= threshold;
  const opacity = Math.min(pullY / threshold, 1);
  const rotation = Math.min((pullY / threshold) * 180, 180);

  if (pullY === 0 && !refreshing) return null;

  return (
    <div
      className="absolute left-0 right-0 top-0 flex items-center justify-center pointer-events-none z-20"
      style={{
        height: Math.max(pullY, refreshing ? threshold : 0),
        opacity,
      }}
    >
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm border transition-colors ${
          ready || refreshing ? "border-primary text-primary" : "border-gray-300 text-gray-400"
        }`}
      >
        {refreshing ? (
          <div className="w-4 h-4 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.1s linear" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        )}
      </div>
    </div>
  );
}
