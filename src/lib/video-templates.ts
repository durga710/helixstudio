/**
 * Curated starter reels for beginners. Each is a ready-made recipe (idea + a
 * well-crafted shot list) that teaches good prompting by example — notice how
 * every shot repeats the same style words so the reel feels cohesive.
 *
 * "Use this template" creates a fresh VideoProject from one of these (via the
 * normal /api/video/projects save flow) and opens it in the editor. Pure
 * content — no database seeding required.
 */

export interface VideoTemplateShot {
  title: string;
  prompt: string;
  seconds: number;
}

export interface VideoTemplate {
  id: string;
  title: string;
  category: string;
  /** One line on what it is + the prompting lesson it demonstrates. */
  description: string;
  /** The concept that drives generation — the editor re-plans shots from this,
   * so it's written to produce a reel matching the example shots below. */
  idea: string;
  size: string; // "1280x720" (landscape) | "720x1280" (portrait)
  secondsEach: number;
  shots: VideoTemplateShot[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "cinematic-city",
    title: "Cinematic city story",
    category: "Story",
    description: "A moody 3-shot mini-story. Shows how repeating style words keeps a reel cohesive.",
    idea: "A moody cinematic mini-story set in a neon-soaked future city: sunrise over the glass rooftops, a tense chase through a rain-slick night market, and a quiet rain-soaked finale under a flickering streetlamp. Cinematic, warm film grain, shallow depth of field throughout.",
    size: "1280x720",
    secondsEach: 8,
    shots: [
      {
        title: "Sunrise over neon rooftops",
        prompt:
          "Aerial wide shot drifting over a futuristic city at dawn, neon signs fading as golden sunrise light spills across glass towers, cinematic, warm film grain, shallow depth of field, slow forward motion.",
        seconds: 8,
      },
      {
        title: "Chase through the night market",
        prompt:
          "Fast tracking shot following a hooded figure weaving through a crowded neon night market, rain-slick streets reflecting pink and blue signs, motion blur, cinematic, warm film grain, shallow depth of field.",
        seconds: 8,
      },
      {
        title: "Rain-soaked finale",
        prompt:
          "Close-up of the figure stopping under a flickering streetlamp in heavy rain, neon reflections in the puddles, breath visible in the cold, quiet and moody, cinematic, warm film grain, shallow depth of field, slow push-in.",
        seconds: 8,
      },
    ],
  },
  {
    id: "product-ad",
    title: "Punchy product ad",
    category: "Marketing",
    description: "A snappy 4-shot ad. Swap in your own product — keep the premium studio look across shots.",
    idea: "A punchy, premium product ad for sleek white wireless earbuds: a dramatic studio hero reveal, a feature close-up, a bright lifestyle moment, and a clean logo end-card. Premium studio look, high contrast, shallow depth of field. Swap in your own product.",
    size: "1280x720",
    secondsEach: 4,
    shots: [
      {
        title: "Hero reveal",
        prompt:
          "Studio hero shot of sleek white wireless earbuds rotating slowly on a glossy black pedestal, dramatic rim lighting, soft reflections, premium, clean, high-contrast, shallow depth of field.",
        seconds: 4,
      },
      {
        title: "Feature close-up",
        prompt:
          "Extreme close-up of the earbuds' surface and detail, a bright light sweeping across the texture, premium, clean, high-contrast, shallow depth of field, slow pan.",
        seconds: 4,
      },
      {
        title: "Lifestyle moment",
        prompt:
          "A young person in a bright modern apartment puts in the earbuds and smiles, soft natural window light, premium, clean, high-contrast, shallow depth of field.",
        seconds: 4,
      },
      {
        title: "Logo / call to action",
        prompt:
          "Minimal shot of the earbuds case on a clean soft-gradient background with empty space for a logo, premium, clean, high-contrast, soft studio light.",
        seconds: 4,
      },
    ],
  },
  {
    id: "travel-reel",
    title: "Travel reel (portrait)",
    category: "Social",
    description: "A vertical travel montage for social. Demonstrates strong camera + golden-hour light cues.",
    idea: "A vibrant vertical travel montage at golden hour: a sweeping aerial of a turquoise coastline, a close-up of colorful local street food, a traveler running along an empty beach at sunset, and a silhouette watching the sunset from a cliff. Sun-drenched, cinematic travel look, vertical framing.",
    size: "720x1280",
    secondsEach: 8,
    shots: [
      {
        title: "Establishing landscape",
        prompt:
          "Sweeping aerial of a turquoise coastline and dramatic cliffs at golden hour, smooth drone motion, vibrant, sun-drenched, cinematic travel look, vertical framing.",
        seconds: 8,
      },
      {
        title: "Local detail",
        prompt:
          "Close-up of hands holding fresh colorful street food at a busy local market, shallow depth of field, vibrant, sun-drenched, cinematic travel look, vertical framing.",
        seconds: 8,
      },
      {
        title: "Motion moment",
        prompt:
          "A traveler with a backpack runs along an empty beach at sunset, splashing through shallow water, backlit, vibrant, sun-drenched, cinematic travel look, vertical framing, slow motion.",
        seconds: 8,
      },
      {
        title: "Golden-hour closer",
        prompt:
          "Silhouette of the traveler standing on a cliff watching the sunset, warm golden sky, vibrant, sun-drenched, cinematic travel look, vertical framing, slow push-in.",
        seconds: 8,
      },
    ],
  },
  {
    id: "explainer",
    title: "Simple explainer",
    category: "Education",
    description: "A clean animated explainer. One clear idea per shot, with a consistent friendly flat style.",
    idea: "A clean, friendly animated explainer in a minimal flat-illustration style: a glowing lightbulb hook, two simple animated concept beats (connected nodes, then a rising chart), and a checkmark conclusion with room for text. One clear idea per shot, soft gradients, smooth motion.",
    size: "1280x720",
    secondsEach: 8,
    shots: [
      {
        title: "Hook",
        prompt:
          "A single glowing lightbulb icon floating over a clean soft-gradient background, gentle motion, minimal, friendly, modern flat-illustration style, soft shadows.",
        seconds: 8,
      },
      {
        title: "Idea one",
        prompt:
          "A simple animated diagram of three connected nodes lighting up one by one on a clean soft-gradient background, minimal, friendly, modern flat-illustration style, smooth motion.",
        seconds: 8,
      },
      {
        title: "Idea two",
        prompt:
          "An upward-trending line chart drawing itself across a clean soft-gradient background, minimal, friendly, modern flat-illustration style, smooth motion.",
        seconds: 8,
      },
      {
        title: "Conclusion",
        prompt:
          "A large checkmark forming inside a circle on a clean soft-gradient background with empty space for text, minimal, friendly, modern flat-illustration style.",
        seconds: 8,
      },
    ],
  },
  {
    id: "food-reel",
    title: "Food / recipe reel (portrait)",
    category: "Social",
    description: "A vertical, appetizing cooking reel. Notice the warm-light, food-commercial style on every shot.",
    idea: "An appetizing vertical food reel: fresh colorful ingredients laid out on a rustic table, vegetables sizzling in a hot pan with rising steam, careful plating with a fresh garnish, and a slow hero shot of the finished dish. Warm kitchen light, crisp food-commercial look, vertical framing.",
    size: "720x1280",
    secondsEach: 4,
    shots: [
      {
        title: "Ingredients",
        prompt:
          "Top-down shot of fresh colorful ingredients arranged on a rustic wooden table, hands entering frame to place a bowl, warm kitchen light, appetizing, crisp, food-commercial look, vertical framing.",
        seconds: 4,
      },
      {
        title: "Cooking action",
        prompt:
          "Close-up of vegetables sizzling and tossing in a hot pan with steam rising, warm kitchen light, appetizing, crisp, food-commercial look, vertical framing, slow motion.",
        seconds: 4,
      },
      {
        title: "Plating",
        prompt:
          "Hands carefully plating the finished dish and adding a fresh garnish, shallow depth of field, warm kitchen light, appetizing, crisp, food-commercial look, vertical framing.",
        seconds: 4,
      },
      {
        title: "Final dish",
        prompt:
          "Slow rotating hero shot of the finished plated dish on a wooden table, steam gently rising, warm kitchen light, appetizing, crisp, food-commercial look, vertical framing.",
        seconds: 4,
      },
    ],
  },
];

export function getVideoTemplate(id: string): VideoTemplate | undefined {
  return VIDEO_TEMPLATES.find((t) => t.id === id);
}
