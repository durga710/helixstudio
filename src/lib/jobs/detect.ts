/**
 * Heuristic: does this request look like a big, structural change that should run
 * as a durable planner→workers→reviewer JOB rather than one chat turn? Pure +
 * tested. The UI uses it to OFFER "run as a multi-step job" (auto-detect+confirm).
 */

const STRUCTURAL =
  /\b(re-?factor|re-?structure|re-?architect|re-?organi[sz]e|re-?write|overhaul|migrate|convert|port|rename\s+(all|every|the)|across\s+(the|all|every)|throughout|every\s+(page|file|route|component|screen|endpoint)|whole\s+(app|codebase|project|thing)|entire\s+(app|codebase|project)|all\s+(the\s+)?(pages|files|routes|components|screens))\b/i;

export function looksLikeBigJob(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (STRUCTURAL.test(m)) return true;
  // A long, multi-requirement brief (several bullet/numbered points) is also
  // job-shaped even without a keyword.
  const bullets = (m.match(/(^|\n)\s*([-*•]|\d+[.)])\s+/g) || []).length;
  return m.length > 700 && bullets >= 5;
}
