import { redirect } from "next/navigation";

export default function SlaPage() {
  redirect("/today?sla=all");
}
