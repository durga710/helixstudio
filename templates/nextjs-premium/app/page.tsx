// The app opens directly to the dashboard — no marketing/login gate. The login
// page still lives at /login as an OPTIONAL feature; add a public landing here
// only if the user asks for one.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
