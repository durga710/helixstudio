/* eslint-disable react/no-unescaped-entities -- long-form guide prose */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Save,
  Share2,
  Sparkles,
  TriangleAlert,
  Upload,
  Wand2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How to make an AI video — HelixVideo Guide",
  description:
    "A beginner's guide to making AI videos with HelixVideo: from a one-line idea to a finished reel you can share and remix.",
};

export default function VideoGuidePage() {
  return (
    <div className="pad-screen mx-auto max-w-[860px]">
      {/* Hero */}
      <div className="lit relative mb-8 overflow-hidden rounded-card-lg border border-border2 bg-panel px-7 py-8">
        <div className="aurora-bg" />
        <div className="relative z-10">
          <div className="text-eyebrow mb-2">HelixVideo · Guide</div>
          <h1 className="text-display">
            How to make an <span className="brand-gradient-text">AI video</span>
          </h1>
          <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-txt2">
            You describe what you want; HelixVideo generates it shot by shot and stitches it into one
            video. No camera, no editing software, no experience needed. This guide takes you from a
            one-line idea to a finished reel you can share — and let others remix.
          </p>
          <Link
            href="/video/editor"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-[0_6px_20px_-6px_color-mix(in_srgb,var(--accent)_75%,transparent)] transition-[transform,box-shadow] hover:-translate-y-px"
          >
            <Sparkles className="h-4 w-4" /> Open the Video Editor
          </Link>
        </div>
      </div>

      {/* How it works */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3">How it works (the 30-second version)</h2>
        <div className="lit rounded-card border border-border bg-panel p-5 text-[14px] leading-relaxed text-txt2">
          <p>
            AI video models make short clips — each up to about 20 seconds. To make something longer,
            HelixVideo generates several clips and <strong className="text-txt">stitches them
            back-to-back</strong> into one continuous reel. The loop is simple:
          </p>
          <p className="mt-3 font-mono text-[12.5px] text-txt3">
            your idea → AI plans a shot list → a clip per shot → stitched into one reel → export &amp;
            share
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3">Make your first video</h2>
        <ol className="space-y-3">
          <Step n={1} icon={<Lightbulb className="h-4 w-4" />} title="Describe your idea">
            Open the <Link href="/video/editor" className="text-accent hover:underline">Video Editor</Link>{" "}
            and type your idea in plain language — the story or the vibe, not technical settings. For
            example: <em className="text-txt">"A day in a neon city — sunrise over rooftops, a chase
            through the markets, a quiet rain-soaked finale."</em>
          </Step>
          <Step n={2} icon={<ListChecks className="h-4 w-4" />} title="Pick length & format">
            Choose how many shots and how many seconds each (more shots = a longer video), and
            landscape or portrait. Start small — 3 to 5 shots is plenty for your first reel.
          </Step>
          <Step n={3} icon={<Clapperboard className="h-4 w-4" />} title="Generate">
            Hit generate. Helix writes a shot list (one prompt per shot), then renders each shot and
            stitches them into the live preview as they finish. If one shot fails, it's skipped and
            the rest still come together.
          </Step>
          <Step n={4} icon={<Film className="h-4 w-4" />} title="Review & re-roll">
            Watch the stitched reel. AI video is a little like a slot machine — if a shot isn't right,
            tweak its wording and regenerate. Small prompt changes can make a big difference.
          </Step>
          <Step n={5} icon={<Save className="h-4 w-4" />} title="Save your project">
            Click <strong className="text-txt">Save</strong> and give it a title. Now you can close the
            tab and come back later — your idea and shot list are kept, and you can resume right where
            you left off.
          </Step>
          <Step n={6} icon={<Download className="h-4 w-4" />} title="Export to one MP4">
            Click <strong className="text-txt">Download MP4</strong> to flatten the whole reel into a
            single video file you can keep or upload anywhere.
          </Step>
        </ol>
      </section>

      {/* Share */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3 flex items-center gap-2">
          <Share2 className="h-5 w-5 text-accent" /> Share it with the community
        </h2>
        <div className="lit rounded-card border border-border bg-panel p-5 text-[14px] leading-relaxed text-txt2">
          <p>
            Helix doesn't host video files, so you publish the actual video on a platform you control,
            then share the link:
          </p>
          <ol className="mt-3 space-y-2">
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel2 font-mono text-[11px] text-txt3">1</span>
              <span><strong className="text-txt">Download</strong> your reel as an MP4.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel2 font-mono text-[11px] text-txt3">2</span>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Upload className="h-4 w-4 text-accent" />
                Upload it to <strong className="text-txt">YouTube</strong> (or Vimeo / Loom). Set it to{" "}
                <strong className="text-txt">Public or Unlisted</strong> — a Private video won't play
                for anyone else.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel2 font-mono text-[11px] text-txt3">3</span>
              <span>
                Copy the link, then open{" "}
                <Link href="/community" className="text-accent hover:underline">Community</Link> →
                Publish → <strong className="text-txt">A video</strong>, and paste it.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel2 font-mono text-[11px] text-txt3">4</span>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Wand2 className="h-4 w-4 text-accent" />
                Optionally link your saved reel and turn on{" "}
                <strong className="text-txt">reveal transcript &amp; shots</strong> +{" "}
                <strong className="text-txt">allow remixing</strong>, so others can see how you made it
                and remix it into their own editor.
              </span>
            </li>
          </ol>
        </div>
      </section>

      {/* Prompting tips */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3">Prompting tips — make your shots look good</h2>
        <p className="mb-3 text-[14px] leading-relaxed text-txt2">
          The prompt for each shot is where the quality comes from. A good shot prompt describes five
          things:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tip title="Subject + action">Who or what, doing one clear thing. "A lone astronaut walks across red desert dunes."</Tip>
          <Tip title="Camera">"Wide cinematic shot", "slow push-in", "aerial", "close-up", "tracking shot".</Tip>
          <Tip title="Light & mood">"Golden-hour sunrise", "neon night", "soft overcast", "moody and tense".</Tip>
          <Tip title="Consistent style">Repeat the same style words in every shot — "cinematic, warm film grain, shallow depth of field" — so the reel feels like one piece.</Tip>
        </div>
        <div className="lit mt-3 rounded-card border border-border bg-panel p-4 text-[13.5px] leading-relaxed text-txt2">
          <strong className="text-txt">One action per shot.</strong> Each clip is short — don't try to
          cram a whole scene into one. Break the story into beats and give each its own shot.
        </div>
      </section>

      {/* Reference image */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3 flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-accent" /> Start from a picture
        </h2>
        <div className="lit rounded-card border border-border bg-panel p-5 text-[14px] leading-relaxed text-txt2">
          In the single-clip studio you can <strong className="text-txt">attach a reference image</strong>{" "}
          to guide a shot. Helix uses it as a visual starting point, so the result follows your
          picture's subject and style — handy when you already have a look you want to match.
        </div>
      </section>

      {/* Pitfalls */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3 flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-warn" /> Common pitfalls
        </h2>
        <ul className="space-y-2 text-[14px] leading-relaxed text-txt2">
          <Pitfall>A <strong className="text-txt">Private</strong> YouTube video won't embed — set it Public or Unlisted.</Pitfall>
          <Pitfall>Vague prompts give generic results. Add detail: subject, camera, light, mood.</Pitfall>
          <Pitfall>Lots of shots means longer waits and higher cost — start with 3–5.</Pitfall>
          <Pitfall>
            A character won't look identical across shots — each shot is generated separately, so faces
            and outfits drift. Attach a Character reference in the editor to nudge consistency
            (best-effort, not perfect).
          </Pitfall>
          <Pitfall>
            Only make content you have the right to make — no real people without consent, and nothing
            that breaks the{" "}
            <Link href="/terms" className="text-accent hover:underline">rules</Link>.
          </Pitfall>
        </ul>
      </section>

      {/* What's next */}
      <section className="mb-9">
        <h2 className="text-h2 mb-3">What&rsquo;s new</h2>
        <p className="text-[14px] leading-relaxed text-txt2">
          <strong className="text-txt">AI voice narration</strong> — once your reel is rendered, write a
          script, pick a voice, and download your reel with a spoken voiceover.{" "}
          <strong className="text-txt">Character consistency</strong> — attach a Character reference in the
          editor and we&rsquo;ll use it on every shot to keep your character consistent (best-effort — AI
          video can still drift between shots).
        </p>
      </section>

      {/* Closer */}
      <div className="lit gradient-border rounded-card-lg border border-[color-mix(in_srgb,var(--accent)_22%,var(--border-2))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))] p-6 text-center">
        <h2 className="text-h2">That's the whole loop.</h2>
        <p className="mx-auto mt-1.5 max-w-[460px] text-[14px] leading-relaxed text-txt2">
          Describe it, generate it, share it. The best way to learn is to make a quick 3-shot reel
          right now.
        </p>
        <Link
          href="/video/editor"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:-translate-y-px"
        >
          Make a video <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="lit flex gap-3.5 rounded-card border border-border bg-panel p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border2 bg-panel2 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-txt3">{String(n).padStart(2, "0")}</span>
          <h3 className="text-h3 text-txt">{title}</h3>
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-txt2">{children}</p>
      </div>
    </li>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lit rounded-card border border-border bg-panel p-4">
      <div className="text-eyebrow mb-1">{title}</div>
      <p className="text-[13px] leading-relaxed text-txt2">{children}</p>
    </div>
  );
}

function Pitfall({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
      <span>{children}</span>
    </li>
  );
}
