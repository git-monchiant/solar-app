import BottomNav from "@/components/BottomNav";
import SwipeNav from "@/components/SwipeNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full bg-gray-50">
      <BottomNav />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 md:ml-64">
        <SwipeNav>{children}</SwipeNav>
      </main>
    </div>
  );
}
