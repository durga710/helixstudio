/**
 * File-scope matching for workers. A sub-task declares the paths it may write
 * (globs); writes outside are rejected so parallel/sequential workers stay in
 * their lane. Pure + dependency-free so it's unit-testable. Supports `*` (one
 * segment), `**` (any depth), and exact paths.
 */

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // ** = any depth
        i++;
        if (glob[i + 1] === "/") i++; // collapse "**/"
      } else {
        re += "[^/]*"; // * = within one segment
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** True if `path` is allowed by the scope globs. Empty/undefined scope = the
 * whole project (no restriction). */
export function pathInScope(path: string, globs?: string[] | null): boolean {
  if (!globs || globs.length === 0) return true;
  return globs.some((g) => globToRegExp(g.trim()).test(path));
}

/** A clear, model-actionable error for an out-of-scope write. */
export function outOfScopeError(path: string, globs: string[]): string {
  return (
    `${path} is outside this sub-task's assigned scope (${globs.join(", ")}). ` +
    `Only edit files within your scope; another worker owns the rest.`
  );
}
