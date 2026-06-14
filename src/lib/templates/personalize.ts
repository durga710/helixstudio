import "server-only";

/**
 * 0-token template personalization. A stored skeleton ships with a generic product
 * name ("Helix App") so it renders before the agent builds. We swap that for the
 * user's project name at injection time, so the VERY FIRST render already feels like
 * their app — no "this came from a template" tell. The agent then replaces the rest
 * of the placeholders (stats, demo copy, the main-feature region) per BUILD_RULES.
 */

const APP_NAME_TOKEN = "Helix App";

/** Only string-substitute textual UI files (never binaries / lockfiles). */
function isPersonalizable(path: string): boolean {
  return /\.(tsx?|jsx?|html|css|md|json)$/i.test(path);
}

/** Keep only characters that are safe inside a TS/HTML string literal or JSX text,
 * so an odd project name can't break the injected files. */
function safeAppName(raw: string): string {
  return raw.replace(/[^\w &.\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function personalizeTemplateFiles(
  files: { path: string; content: string }[],
  opts: { appName?: string | null },
): { path: string; content: string }[] {
  const raw = opts.appName?.trim();
  if (!raw || /^untitled project$/i.test(raw)) return files;
  const appName = safeAppName(raw);
  if (!appName) return files;
  return files.map((f) =>
    isPersonalizable(f.path) && f.content.includes(APP_NAME_TOKEN)
      ? { ...f, content: f.content.split(APP_NAME_TOKEN).join(appName) }
      : f,
  );
}
