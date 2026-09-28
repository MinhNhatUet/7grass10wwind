import { redirect } from "next/navigation";

// One management workflow: do not retain the former simulated upload dashboard.
export default function LecturerDashboard() {
  redirect("/hub/review");
}
