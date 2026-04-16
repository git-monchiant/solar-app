import { redirect } from "next/navigation";

export default function BookingsPage() {
  redirect("/pipeline?tab=pre_survey");
}
