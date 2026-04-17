"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActiveRoles } from "@/lib/roles";

export default function Home() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();

  useEffect(() => {
    if (activeRoles.length === 0) return;
    const seekerOnly =
      activeRoles.includes("leadsseeker") &&
      !activeRoles.includes("sales") &&
      !activeRoles.includes("solar");
    if (seekerOnly) router.replace("/seeker");
    else router.replace("/today");
  }, [activeRoles, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );
}
