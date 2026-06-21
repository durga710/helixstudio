import type { Metadata } from "next";
import { HelixVideoStudio } from "@/components/video/HelixVideoStudio";

export const metadata: Metadata = {
  title: "HelixVideo — Helix Studio",
  description: "Turn a prompt into a cinematic clip with HelixVideo.",
};

export default function VideoPage() {
  return <HelixVideoStudio />;
}
