/* Tiny regex tokenizer for the code viewer. Token classes mirror the
 * prototype's palette (.tok-k keyword, .tok-s string, .tok-f function,
 * .tok-t type, .tok-cm comment, .tok-nu number) — colors live in globals.css. */

export interface Token {
  cls: string | null;
  text: string;
}

const TS_PATTERN = new RegExp(
  [
    String.raw`(?<cm>\/\/.*$|\/\*[\s\S]*?\*\/|^\s*#.*$)`,
    String.raw`(?<s>'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + "`(?:[^`\\\\]|\\\\.)*`)",
    String.raw`(?<nu>\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<k>\b(?:import|export|from|const|let|var|function|async|await|return|if|else|for|while|of|in|new|class|extends|implements|interface|type|enum|model|true|false|null|undefined|default|throw|try|catch|switch|case|public|private|readonly|static|void|this)\b)`,
    String.raw`(?<f>\b[a-zA-Z_$][\w$]*(?=\s*\())`,
    String.raw`(?<t>\b[A-Z][A-Za-z0-9_]*\b)`,
  ].join("|"),
  "gm"
);

export function tokenizeLine(line: string): Token[] {
  if (line.length === 0) return [{ cls: null, text: "" }];
  const tokens: Token[] = [];
  let last = 0;
  TS_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TS_PATTERN.exec(line)) !== null) {
    if (match.index > last) tokens.push({ cls: null, text: line.slice(last, match.index) });
    const groups = match.groups ?? {};
    const cls = Object.keys(groups).find((g) => groups[g] !== undefined) ?? null;
    tokens.push({ cls, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < line.length) tokens.push({ cls: null, text: line.slice(last) });
  return tokens;
}
