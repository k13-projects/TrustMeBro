"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCart } from "@/components/cart/CartContext";

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
const ARCHIVE_KEY = "tmb:chat:v1:archive";
const FOLLOWUP_MARKER = "<<<followups>>>";

const STARTER_POOL = [
  "What's today's Bet of the Day and why?",
  "Show me tonight's highest-confidence picks.",
  "How are confidence scores calculated?",
  "Where do the projections come from?",
  "How is LeBron James doing the last 5 games?",
  "Why is that the Bet of the Day instead of #2?",
  "Which game has the most picks tonight?",
  "What stats does the engine actually look at?",
];

function splitFollowups(content: string): { body: string; followups: string[] } {
  const idx = content.indexOf(FOLLOWUP_MARKER);
  if (idx === -1) return { body: content, followups: [] };
  const body = content.slice(0, idx).trimEnd();
  const tail = content.slice(idx + FOLLOWUP_MARKER.length);
  const followups = tail
    .split("\n")
    .map((s) => s.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter((s) => s.length > 0 && s.length < 140)
    .slice(0, 3);
  return { body, followups };
}

function pickStarters(): string[] {
  // Shuffle pool per mount so the empty state never looks frozen.
  const arr = [...STARTER_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 3);
}

export function ChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const cart = useCart();
  const [messages, setMessages] = useState<Message[]>([]);
  const [archived, setArchived] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickyBottomRef = useRef(true);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    try {
      const storedArchive = sessionStorage.getItem(ARCHIVE_KEY);
      if (storedArchive) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setArchived(JSON.parse(storedArchive));
      }
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        // If we have leftover live messages on first mount, treat them as
        // archived — a closed panel always reopens to a fresh empty state.
        if (parsed.length > 0) {
          setArchived((prev) => (prev.length > 0 ? prev : parsed));
          sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify(parsed));
          sessionStorage.removeItem(STORAGE_KEY);
        }
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
    try {
      sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
    } catch {
      // ignore
    }
  }, [archived]);

  // On close: snapshot the live conversation into the archive and clear the
  // live thread. Next open gets a crisp empty state, with a one-click chip to
  // restore the previous chat. Avoids the "did the bot reset itself?" feeling.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open && messages.length > 0) {
      setArchived(messages);
      setMessages([]);
      setInput("");
    }
  }, [open, messages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickyBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

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

    const wirePayload = [...messages, userMsg]
      .filter((m) => m.content.trim().length > 0)
      .slice(-19)
      .map((m) => {
        // Strip follow-up tail from prior assistant turns — the model already
        // saw its own output and we don't want the marker poisoning context.
        if (m.role === "assistant") {
          return { role: m.role, content: splitFollowups(m.content).body };
        }
        return { role: m.role, content: m.content };
      });

    // Snapshot the cart so the bot can answer questions about the user's
    // current coupon ("why is X in my coupon", "what's my potential payout",
    // etc.) without the user having to paste it in.
    const couponCtx = cart.hydrated && cart.picks.length > 0
      ? {
          mode: cart.mode,
          stake: cart.stake,
          picks: cart.picks.map((p) => ({
            prediction_id: p.prediction_id,
            player_name: `${p.player_first_name} ${p.player_last_name}`.trim(),
            team_abbr: p.team_abbreviation ?? null,
            market: p.market,
            line: p.line,
            pick: p.pick,
            confidence: p.confidence,
          })),
        }
      : null;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: wirePayload, coupon: couponCtx }),
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
    setArchived([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(ARCHIVE_KEY);
    } catch {
      // ignore
    }
  }

  function restoreArchived() {
    if (archived.length === 0) return;
    setMessages(archived);
    setArchived([]);
    stickyBottomRef.current = true;
  }

  // Find the last assistant message so we only render follow-ups for that one.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/55 backdrop-blur-[3px] transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        role="dialog"
        aria-label="TrustMeBro chat"
        // When the coupon drawer is open we slide the chat panel to its left
        // (sm:right-[420px] matches the drawer width). On mobile the drawer
        // takes the whole screen, but the launcher is hidden in that case so
        // this branch is only reachable from desktop.
        className={`fixed top-0 ${cart.isOpen ? "sm:right-[420px]" : "right-0"} z-40 h-full w-full sm:w-[440px] transition-[transform,right] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col glass-chat glass-sheen border-l border-white/10">
          <header className="px-5 py-4 flex items-center justify-between border-b border-white/10">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <SparkleGlyph className="size-4 text-emerald-300" />
                <h2 className="text-base font-semibold tracking-tight bg-gradient-to-r from-white via-white to-emerald-200 bg-clip-text text-transparent">
                  TrustMeBro Analyst
                </h2>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/40 mt-0.5">
                projections · not advice
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearHistory}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="size-8 inline-flex items-center justify-center rounded-lg text-foreground/55 hover:text-foreground/95 hover:bg-white/5 transition-colors"
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                title="Close"
                className="size-8 inline-flex items-center justify-center rounded-lg text-foreground/55 hover:text-foreground/95 hover:bg-white/5 transition-colors"
              >
                <XIcon />
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            onScroll={onListScroll}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 ? (
              <EmptyState
                onPick={(q) => send(q)}
                archivedCount={archived.length}
                onRestore={restoreArchived}
              />
            ) : (
              messages.map((m, i) => (
                <div key={m.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 6) * 20}ms` }}>
                  <MessageRow
                    message={m}
                    isLastAssistant={m.id === lastAssistantId}
                    onFollowupClick={(q) => {
                      stickyBottomRef.current = true;
                      send(q);
                    }}
                  />
                </div>
              ))
            )}
            {busy ? <TypingIndicator /> : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              stickyBottomRef.current = true;
              send(input);
            }}
            className="border-t border-white/10 p-3 flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  stickyBottomRef.current = true;
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about today's picks, players, sources…"
              className="flex-1 resize-none bg-white/5 ring-1 ring-white/10 focus:ring-emerald-400/40 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-foreground/35 focus:outline-none focus:bg-white/[0.07] transition-all duration-200 overflow-y-auto"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="group size-10 inline-flex items-center justify-center rounded-xl text-white bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-600 gradient-shift shadow-[0_0_24px_-4px_rgba(16,185,129,0.6)] disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_30px_-2px_rgba(16,185,129,0.85)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200"
            >
              <SendIcon />
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

function MessageRow({
  message,
  isLastAssistant,
  onFollowupClick,
}: {
  message: Message;
  isLastAssistant: boolean;
  onFollowupClick: (q: string) => void;
}) {
  const isUser = message.role === "user";
  const { body, followups } = isUser
    ? { body: message.content, followups: [] as string[] }
    : splitFollowups(message.content);

  return (
    <div className="space-y-2">
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={
            isUser
              ? "max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-gradient-to-br from-emerald-500/35 to-green-600/35 ring-1 ring-emerald-300/15 text-foreground whitespace-pre-wrap"
              : "max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white/[0.04] ring-1 ring-white/5 text-foreground/90"
          }
        >
          {message.tools && message.tools.length > 0 ? (
            <div className="mb-2 space-y-1">
              {message.tools.map((t, i) => (
                <ToolChip key={i} tool={t} />
              ))}
            </div>
          ) : null}
          {isUser ? (
            body
          ) : body ? (
            <MarkdownBody source={body} />
          ) : (
            <span className="text-foreground/40">…</span>
          )}
        </div>
      </div>

      {!isUser && isLastAssistant && followups.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {followups.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onFollowupClick(q)}
              className="group inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] ring-1 ring-white/10 hover:ring-emerald-400/40 px-3 py-1.5 text-xs text-foreground/75 hover:text-foreground hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="text-emerald-300/80 group-hover:text-emerald-200 transition-colors">↳</span>
              <span>{q}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 last:mb-0 space-y-1 list-none pl-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 last:mb-0 space-y-1 list-decimal pl-5 marker:text-foreground/40">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:top-0 before:text-emerald-300/80 [li_&]:before:content-['◦']">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/85">{children}</em>
          ),
          code: ({ children }) => (
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] font-mono text-foreground/95">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200 transition-colors"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <p className="mb-2 font-semibold text-foreground">{children}</p>
          ),
          h2: ({ children }) => (
            <p className="mb-2 font-semibold text-foreground">{children}</p>
          ),
          h3: ({ children }) => (
            <p className="mb-2 font-semibold text-foreground">{children}</p>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {source}
      </ReactMarkdown>
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
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-white/[0.04] ring-1 ring-white/5 text-foreground/60 text-sm">
        <span className="inline-flex gap-1">
          <span className="size-1.5 rounded-full bg-emerald-300/80 animate-bounce" />
          <span
            className="size-1.5 rounded-full bg-emerald-300/80 animate-bounce"
            style={{ animationDelay: "120ms" }}
          />
          <span
            className="size-1.5 rounded-full bg-emerald-300/80 animate-bounce"
            style={{ animationDelay: "240ms" }}
          />
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  archivedCount,
  onRestore,
}: {
  onPick: (q: string) => void;
  archivedCount: number;
  onRestore: () => void;
}) {
  // useMemo so shuffles happen once per panel mount, not on every render.
  const starters = useMemo(() => pickStarters(), []);
  return (
    <div className="space-y-4 py-4 fade-up">
      <div className="flex flex-col items-start gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] ring-1 ring-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200/85">
          <SparkleGlyph className="size-3" />
          <span>AI Analyst</span>
        </div>
        <h3 className="text-lg font-semibold tracking-tight bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent">
          What do you want to know tonight?
        </h3>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Ask about today&apos;s picks, a player&apos;s recent form, or how the
          engine decides.
        </p>
        {archivedCount > 0 ? (
          <button
            type="button"
            onClick={onRestore}
            className="group mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 ring-1 ring-emerald-400/30 hover:ring-emerald-400/60 px-3 py-1.5 text-xs text-emerald-100 hover:text-white transition-all duration-200 hover:-translate-y-0.5"
            aria-label={`Restore previous conversation with ${archivedCount} messages`}
          >
            <RestoreGlyph />
            <span>
              Continue previous chat
              <span className="text-emerald-300/70 ml-1.5 font-mono tabular-nums">
                {archivedCount}
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <div className="grid gap-2">
        {starters.map((q, i) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            style={{ animationDelay: `${80 + i * 60}ms` }}
            className="fade-up group text-left text-sm rounded-xl px-3.5 py-3 bg-white/[0.035] hover:bg-white/[0.07] ring-1 ring-white/10 hover:ring-emerald-400/40 text-foreground/85 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(16,185,129,0.45)] flex items-start gap-3"
          >
            <span className="mt-0.5 size-6 inline-flex items-center justify-center rounded-md bg-gradient-to-br from-emerald-500/30 to-green-600/30 ring-1 ring-emerald-300/20 text-emerald-200 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              {starterIcon(i)}
            </span>
            <span className="flex-1">{q}</span>
            <span className="text-foreground/30 group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all duration-200">
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RestoreGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function starterIcon(i: number) {
  const set = [<SparkleGlyph key="s" className="size-3" />, <ChartGlyph key="c" />, <BookGlyph key="b" />];
  return set[i % set.length];
}

function SparkleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}

function ChartGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 3 5-5" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" />
      <path d="M4 16a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
      <path d="m5 12 14-7-4 14-3-6z" />
      <path d="m12 13 8-8" />
    </svg>
  );
}
