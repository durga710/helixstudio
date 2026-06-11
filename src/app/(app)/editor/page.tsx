import type { Metadata } from "next";
import { activeProject, activeWorkspace, setActiveProject } from "@/lib/store";
import { EditorScreen } from "@/components/screens/editor/editor-screen";

export const metadata: Metadata = { title: "Editor" };
export const dynamic = "force-dynamic";

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (project) setActiveProject(project);
  const { tree, files } = activeWorkspace();
  const seeded = activeProject()?.id === "acme-web";
  return <EditorScreen tree={tree} files={files} seeded={seeded} />;
}
