import { redirect } from "next/navigation";

// Classroom is retired from the app (we lead with Community + team Spaces). The
// route stays as a redirect so old links/bookmarks land somewhere sensible; the
// classroom backend/schema is untouched and the code remains in git history.
export const dynamic = "force-dynamic";

export default function ClassroomPage() {
  redirect("/space");
}
