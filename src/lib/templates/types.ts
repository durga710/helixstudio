/**
 * Types for the scaffold-template library. The actual template data is bundled
 * into registry.generated.ts by scripts/gen-templates.mjs (run at prebuild) so
 * there are no runtime filesystem reads on Vercel.
 */

export interface TemplateManifest {
  id: string;
  label: string;
  /** Detection hint: static | next | vite | flask | express | fastapi | django | vue | … */
  framework: string;
  description: string;
  /** Lowercase words that, when present in a prompt, vote for this template. */
  keywords: string[];
  /** Seeds Workspace.notes at injection (kept under NOTES_MAX). */
  notesBlurb: string;
  /** How the maintenance job regenerates the base ("overlay-only" = no CLI). */
  cli: string;
  /** For game templates: which engine this starter uses (phaser | babylon |
   * playcanvas | godot). Metadata only — drives the hidden engine router and
   * the admin engine-override, never the runtime. Absent for non-game templates. */
  engine?: string;
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface Template {
  manifest: TemplateManifest;
  files: TemplateFile[];
}
