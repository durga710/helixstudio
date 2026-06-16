// The app opens directly to the dashboard — no marketing/login gate. The login
// page still lives at /login as an OPTIONAL feature; add a public landing here
// only if the user asks for one.
//
// AI: DO NOT build the user's feature here — this page only redirects, so nothing
// you add here is ever shown. Build it in `app/(app)/dashboard/page.tsx` instead.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
