import type { Metadata } from "next";
import { store } from "@/lib/store";
import { EditorScreen } from "@/components/screens/editor/editor-screen";

export const metadata: Metadata = { title: "Editor" };
export const dynamic = "force-dynamic";

export default function EditorPage() {
  const { tree, files } = store();
  return <EditorScreen tree={tree} files={files} />;
}
