import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full bg-gray-light">
      <BottomNav />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 md:ml-64">
        {children}
      </main>
    </div>
  );
}
