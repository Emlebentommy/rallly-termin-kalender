import { redirect } from "next/navigation";

// Upstream's calendar view is an empty placeholder; calendars are managed in
// the settings and shown on each poll
export default function Page() {
  redirect("/settings/calendars");
}
