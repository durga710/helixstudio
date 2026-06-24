import type { Metadata } from "next";
import { CommunityGallery } from "@/components/community/community-gallery";

export const metadata: Metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default function CommunityPage() {
  return (
    <div className="pad-screen">
      <CommunityGallery />
    </div>
  );
}
