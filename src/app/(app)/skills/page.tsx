import type { Metadata } from "next";
import { SkillsScreen } from "@/components/screens/skills-screen";

export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return <SkillsScreen />;
}
