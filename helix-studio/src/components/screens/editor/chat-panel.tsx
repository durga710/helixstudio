"use client";

import { useEffect, useRef, useState } from "react";
import { Check, SendHorizontal } from "lucide-react";
import { HelixGlyph } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { usePrefs, MODEL_LABELS, DEPTH_LABELS } from "@/hooks/use-prefs";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  seeded?: boolean;
}

const SEED_MESSAGES: Message[] = [
  {
    id: 1,
    role: "user",
    content:
      "Add team invitations — emailed invite plus a single-use join code, with admin resend / revoke / copy-link controls.",
    seeded: true,
  },
  { id: 2, role: "assistant", content: "", seeded: true },
];

/** Minimal inline markdown: **bold** and `code`. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <b key={i} className="font-semibold text-txt">{part.slice(2, -2)}</b>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-panel2 px-1 font-mono text-[11.5px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}

function SeededAssistantMessage() {
  const { toast } = useToast();
  const planItems: Array<{ state: "done" | "now" | "wait"; label: React.ReactNode }> = [
    { state: "done", label: <>Add <b className="text-txt">Invite</b> model to schema.prisma</> },
    { state: "done", label: <>Create <b className="text-txt">createInvite</b> + email w/ join code</> },
    { state: "now", label: <>Build admin <b className="text-txt">resend / revoke / copy-link</b></> },
    { state: "wait", label: <>Private acceptance flow (<b className="text-txt">/accept/[token]</b>)</> },
    { state: "wait", label: <>Unit tests + security review</> },
  ];
  return (
    <div className="min-w-0 flex-1 text-[12.5px]">
      <p className="mb-[5px]">Here&apos;s my plan before touching any code:</p>
      <div className="mt-[7px] rounded-[9px] border border-border2 bg-panel px-[13px] py-[11px]">
        <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
          Implementation plan
        </div>
        <ul className="flex flex-col gap-1.5">
          {planItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-txt2">
              <span
                className={cn(
                  "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px]",
                  item.state === "done" && "bg-[color-mix(in_srgb,var(--green)_18%,transparent)] text-ok",
                  item.state === "now" && "border border-accent bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent",
                  item.state === "wait" && "bg-panel2 text-txt3"
                )}
              >
                {item.state === "done" && <Check className="h-2.5 w-2.5" strokeWidth={2.4} />}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-[7px] overflow-hidden rounded-[9px] border border-border2 bg-panel">
        <div className="flex items-center gap-[7px] border-b border-border px-[11px] py-[7px] font-mono text-[11px] text-txt2">
          <span className="rounded-full border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_9%,transparent)] px-2 text-[10.5px] font-semibold text-ok">
            +12
          </span>
          <span className="rounded-full border border-border2 px-2 text-[10.5px] font-semibold text-txt2">−0</span>
          app/api/invites.ts
        </div>
        <pre className="py-1.5 font-mono text-[11px] leading-[1.55]">
          {[
            "export async function createInvite(",
            "  orgId, email) {",
            "  const code = randomCode(8)",
            "  // …emails invite + code",
          ].map((l, i) => (
            <div key={i} className="flex bg-[color-mix(in_srgb,var(--green)_8%,transparent)] px-[11px]">
              <span className="w-[13px] text-ok">+</span>
              {l}
            </div>
          ))}
        </pre>
        <div className="flex gap-[7px] border-t border-border px-[11px] py-2">
          <button
            onClick={() => toast("Diff accepted — applied to working tree")}
            className="cursor-pointer rounded-card-sm border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] px-2.5 py-[5px] text-[11px] text-ok"
          >
            Accept
          </button>
          <button
            onClick={() => toast("All diffs accepted")}
            className="cursor-pointer rounded-card-sm border border-border2 bg-panel2 px-2.5 py-[5px] text-[11px] text-txt2 hover:text-txt"
          >
            Accept all
          </button>
          <button
            onClick={() => toast("Diff rejected")}
            className="cursor-pointer rounded-card-sm border border-border2 bg-panel2 px-2.5 py-[5px] text-[11px] text-txt2 hover:text-txt"
          >
            Reject
          </button>
        </div>
      </div>
      <p className="mt-[9px]">Wiring the admin controls now — confirm before I run the migration?</p>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { prefs } = usePrefs();
  const nextId = useRef(100);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg: Message = { id: nextId.current++, role: "user", content: text };
    const assistantId = nextId.current++;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const history = [...messages.filter((m) => !m.seeded), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, tier: prefs.model, depth: prefs.depth }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Helix hit an error — try again." } : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-bg2">
      <div className="flex items-center gap-[9px] border-b border-border px-3.5 py-2.5">
        <div className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-accent to-[color-mix(in_srgb,var(--accent)_55%,#000)]">
          <HelixGlyph size={14} />
        </div>
        <div className="text-[13px] font-semibold">Helix</div>
        <div className="ml-auto rounded-md border border-border2 px-2 py-[3px] text-[10.5px] text-txt2">
          {MODEL_LABELS[prefs.model]} · {DEPTH_LABELS[prefs.depth]}
        </div>
      </div>

      <div ref={bodyRef} className="scroll-area flex flex-1 flex-col gap-3.5 overflow-auto p-3.5">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-[9px] text-[12.5px]">
            <div
              className={cn(
                "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                m.role === "user"
                  ? "bg-gradient-to-br from-[#8b5cf6] to-accent"
                  : "bg-gradient-to-br from-accent to-[color-mix(in_srgb,var(--accent)_55%,#000)]"
              )}
            >
              {m.role === "user" ? "DG" : <HelixGlyph size={12} />}
            </div>
            {m.seeded && m.role === "assistant" ? (
              <SeededAssistantMessage />
            ) : (
              <div className={cn("min-w-0 flex-1 whitespace-pre-wrap", m.role === "user" && "text-txt2")}>
                {m.content === "" && m.role === "assistant" ? (
                  <span className="text-txt3">Thinking…</span>
                ) : (
                  m.content.split("\n").map((line, i) => (
                    <p key={i} className="mb-[5px] min-h-[1em]">
                      <Inline text={line} />
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-[11px]">
        <div className="rounded-[10px] border border-border2 bg-panel px-[11px] py-[9px] focus-within:border-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Helix, @-mention a file, or describe a change…"
            aria-label="Message Helix"
            className="h-9 w-full resize-none border-none bg-transparent font-sans text-[12.5px] text-txt outline-none placeholder:text-txt3"
          />
          <div className="mt-[5px] flex items-center gap-[7px]">
            <span className="inline-flex items-center gap-[5px] rounded-md border border-border px-[7px] py-[3px] text-[10.5px] text-txt2">
              @ invites.ts
            </span>
            <span className="inline-flex items-center gap-[5px] rounded-md border border-border px-[7px] py-[3px] text-[10.5px] text-txt2">
              Agent: {prefs.fullWorkflow ? "Full workflow" : "Single agent"}
            </span>
            <button
              onClick={send}
              disabled={streaming || input.trim().length === 0}
              aria-label="Send message"
              className="ml-auto grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border-none bg-accent text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendHorizontal className="h-[15px] w-[15px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
