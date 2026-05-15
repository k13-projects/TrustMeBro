"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";

type ToolEvent = {
  name: string;
  status: "running" | "done";
  summary?: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  tools?: ToolEvent[];
};

type ServerEvent =
  | { type: "text"; value: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done" };

const STORAGE_KEY = "tmb:chat:v1";
const SAMPLE_QUESTIONS = [
  "What's today's Bet of the Day and why?",
  "How is LeBron James doing the last 5 games?",
  "Where do the projections come from?",
];

export function ChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Hydrate from sessionStorage post-mount so SSR and first client render
    // agree on an empty list; setState here is the standard storage-hydration
    // pattern, not an avoidable cascade.
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessages(JSON.parse(stored));
      }
    } catch {
      // session storage may be unavailable; ignore.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota / availability errors
    }
  }, [messages]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      tools: [],
    };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!resp.ok || !resp.body) {
        const reason =
          resp.status === 429
            ? "Rate limit hit (50/hour). Try again later."
            : `Request failed (${resp.status}).`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: reason } : m,
          ),
        );
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: ServerEvent;
          try {
            event = JSON.parse(line) as ServerEvent;
          } catch {
            continue;
          }
          applyEvent(assistantId, event);
        }
      }
      // flush any tail
      if (buffer.trim()) {
        try {
          applyEvent(assistantId, JSON.parse(buffer) as ServerEvent);
        } catch {
          // ignore malformed tail
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: message } : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function applyEvent(assistantId: string, event: ServerEvent) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        switch (event.type) {
          case "text":
            return { ...m, content: m.content + event.value };
          case "tool_call":
            return {
              ...m,
              tools: [
                ...(m.tools ?? []),
                { name: event.name, status: "running" as const },
              ],
            };
          case "tool_result": {
            const tools = (m.tools ?? []).slice();
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === event.name && tools[i].status === "running") {
                tools[i] = { ...tools[i], status: "done", summary: event.summary };
                break;
              }
            }
            return { ...m, tools };
          }
          case "error":
            return {
              ...m,
              content: m.content
                ? `${m.content}\n\n⚠ ${event.message}`
                : `⚠ ${event.message}`,
            };
          case "done":
          default:
            return m;
        }
      }),
    );
  }

  function clearHistory() {
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      {/* Click-outside scrim */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        role="dialog"
        aria-label="TrustMeBro chat"
        className={`fixed top-0 right-0 z-40 h-full w-full sm:w-[420px] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col glass glass-sheen border-l border-white/10">
          <header className="px-5 py-4 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
              <h2 className="text-sm font-semibold tracking-tight">
                Ask TrustMeBro
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground/55">
              <button
                type="button"
                onClick={clearHistory}
                className="hover:text-foreground/90 transition-colors"
              >
                Clear
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover:text-foreground/90 transition-colors"
              >
                Close
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 ? (
              <EmptyState onPick={(q) => send(q)} />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {busy ? <TypingIndicator /> : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-white/10 p-3 flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about today's picks, players, sources…"
              className="flex-1 resize-none bg-white/5 rounded-xl px-3 py-2 text-sm placeholder:text-foreground/35 focus:outline-none focus:bg-white/10 transition-colors max-h-32"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl px-3 py-2 text-sm font-medium bg-gradient-to-br from-indigo-400 via-fuchsia-500 to-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
          <div className="px-4 pb-3 text-[10px] text-foreground/40 font-mono tracking-wide">
            via Gemini 2.5 Flash · projections, not advice
          </div>
        </div>
      </aside>
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/40 text-foreground"
            : "bg-white/5 text-foreground/90"
        }`}
      >
        {message.tools && message.tools.length > 0 ? (
          <div className="mb-2 space-y-1">
            {message.tools.map((t, i) => (
              <ToolChip key={i} tool={t} />
            ))}
          </div>
        ) : null}
        {message.content || (isUser ? "" : <span className="text-foreground/40">…</span>)}
      </div>
    </div>
  );
}

function ToolChip({ tool }: { tool: ToolEvent }) {
  const label = tool.name === "lookup_player" ? "Looking up player" : tool.name;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-black/30 border border-white/10 px-2.5 py-1 text-[11px] text-foreground/70">
      <span
        className={`size-1.5 rounded-full ${
          tool.status === "running" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
        }`}
      />
      <span>{label}</span>
      {tool.summary ? (
        <span className="text-foreground/50 font-mono">— {tool.summary}</span>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-3.5 py-2.5 bg-white/5 text-foreground/60 text-sm">
        <span className="inline-flex gap-1">
          <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" />
          <span
            className="size-1.5 rounded-full bg-foreground/50 animate-bounce"
            style={{ animationDelay: "120ms" }}
          />
          <span
            className="size-1.5 rounded-full bg-foreground/50 animate-bounce"
            style={{ animationDelay: "240ms" }}
          />
        </span>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-3 py-6">
      <p className="text-sm text-foreground/65">
        Ask me about today&apos;s picks, a player&apos;s recent form, or how the
        engine works.
      </p>
      <div className="flex flex-col gap-2">
        {SAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-left text-sm rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-foreground/80"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
