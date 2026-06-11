"use client";

import { Fragment } from "react";

/* Lightweight markdown renderer for chat messages. Handles what Claude
 * actually streams — fenced code blocks, headings, bullet/numbered lists,
 * bold, italic, inline code, links — without pulling in a parser dependency.
 * Everything is rendered as React nodes; no raw HTML injection. */

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <b key={i} className="font-semibold text-txt">
              <InlineMd text={part.slice(2, -2)} />
            </b>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-panel2 px-1 font-mono text-[11.5px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <i key={i}>
              <InlineMd text={part.slice(1, -1)} />
            </i>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
          return (
            <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-accent underline">
              {link[1]}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

interface Block {
  type: "code" | "text";
  content: string;
  lang?: string;
}

function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    if (match.index > last) blocks.push({ type: "text", content: markdown.slice(last, match.index) });
    blocks.push({ type: "code", lang: match[1] || undefined, content: match[2] ?? "" });
    last = match.index + match[0].length;
  }
  if (last < markdown.length) blocks.push({ type: "text", content: markdown.slice(last) });
  return blocks;
}

function TextBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: React.ReactNode[] = [];
  let listItems: Array<{ text: string; ordered: boolean }> = [];

  function flushList(key: number) {
    if (listItems.length === 0) return;
    const ordered = listItems[0]!.ordered;
    const items = listItems.map((item, i) => (
      <li key={i} className="text-txt2">
        <InlineMd text={item.text} />
      </li>
    ));
    out.push(
      ordered ? (
        <ol key={`l${key}`} className="my-1 list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`l${key}`} className="my-1 list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      )
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      listItems.push({ text: bullet[1]!, ordered: false });
      return;
    }
    if (numbered) {
      listItems.push({ text: numbered[1]!, ordered: true });
      return;
    }
    flushList(i);

    if (heading) {
      out.push(
        <div key={i} className="mb-0.5 mt-2 text-[12.5px] font-bold text-txt">
          <InlineMd text={heading[2]!} />
        </div>
      );
      return;
    }
    if (line.trim() === "") {
      out.push(<div key={i} className="h-1.5" />);
      return;
    }
    out.push(
      <p key={i} className="mb-[3px]">
        <InlineMd text={line} />
      </p>
    );
  });
  flushList(lines.length);
  return <>{out}</>;
}

export function Markdown({ content }: { content: string }) {
  return (
    <>
      {splitBlocks(content).map((block, i) =>
        block.type === "code" ? (
          <div key={i} className="my-1.5 overflow-hidden rounded-[9px] border border-border2 bg-codebg">
            {block.lang && (
              <div className="border-b border-border px-2.5 py-1 font-mono text-[10px] text-txt3">
                {block.lang}
              </div>
            )}
            <pre className="scroll-area overflow-x-auto px-2.5 py-2 font-mono text-[11px] leading-[1.55] text-txt2">
              {block.content.replace(/\n$/, "")}
            </pre>
          </div>
        ) : (
          <TextBlock key={i} content={block.content} />
        )
      )}
    </>
  );
}
