"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  LogOut,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  API,
  AccessRule,
  ChatAnswer,
  ChatTurn,
  Principal,
} from "@/lib/contracts";
import { usePoll } from "@/lib/use-poll";
import { ERPIndicator } from "@/features/erp-status/Status";
import { RepPanel } from "./RepPanel";
export function CustomerChat({
  api,
  user,
  signOut,
}: {
  api: API;
  user: Principal;
  signOut: () => void;
}) {
  const [open, setOpen] = useState(true),
    [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<ChatTurn[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conversation, setConversation] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const loadPanel = useCallback(
    () => api.get<AccessRule[]>("customer/panel"),
    [api],
  );
  const { data: rules, error: panelError } = usePoll(loadPanel);
  useEffect(() => {
    if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
  }, []);
  useEffect(() => {
    const key = `querent-conversation-${user.user_id}`;
    const id = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, id);
    setConversation(id);
  }, [user.user_id]);
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    api
      .get<ChatTurn[]>(`customer/history/${conversation}`)
      .then((result) => {
        if (!cancelled) setTurns(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, conversation]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);
  async function ask(text: string) {
    if (!text.trim() || busy || !conversation) return;
    setBusy(true);
    setError("");
    setQuestion("");
    const id = crypto.randomUUID();
    setTurns((t) => [
      ...t,
      {
        id,
        question: text,
        answer: "",
        sql: null,
        categories: [],
        outcome: "answered",
        row_count: 0,
      },
    ]);
    try {
      const result = await api.send<ChatAnswer>("customer/chat", "POST", {
        question: text,
        conversation_id: conversation,
      });
      setTurns((t) =>
        t.map((turn) => (turn.id === id ? { ...turn, ...result } : turn)),
      );
    } catch (e) {
      setTurns((t) => t.filter((turn) => turn.id !== id));
      setQuestion(text);
      setError(e instanceof Error ? e.message : "Unable to send.");
    } finally {
      setBusy(false);
    }
  }
  function newChat() {
    const id = crypto.randomUUID();
    localStorage.setItem(`querent-conversation-${user.user_id}`, id);
    setTurns([]);
    setConversation(id);
    setError("");
  }
  return (
    <div className="customer-shell">
      <header className="customer-header">
        <div className="header-brand">
          <button
            className="icon-button"
            aria-label={open ? "Collapse contacts" : "Expand contacts"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <img src="/querent-logo.png" alt="Querent" width="34" height="34" />
          <strong>{user.name}</strong>
          <span className="via">via Querent</span>
        </div>
        <div className="header-actions">
          <ERPIndicator api={api} />
          <button className="workspace-switch" aria-label="Switch workspace" onClick={signOut}>
            <LogOut size={16} /> Switch workspace
          </button>
        </div>
      </header>
      <div className="customer-body">
        {open && (
          <aside className="customer-sidebar">
            <button className="new-chat" onClick={newChat} disabled={busy}>
              <Plus size={17} />
              New conversation
            </button>
            {panelError ? (
              <p className="error" role="alert">
                {panelError}
              </p>
            ) : (
              <RepPanel rules={rules} />
            )}
          </aside>
        )}
        <main className="chat-main">
          <div className="chat-scroll">
            {turns.length === 0 ? (
              <div className="chat-welcome">
                <img src="/querent-logo.png" alt="" width="55" height="55" />
                <p className="eyebrow">HERRICK INDUSTRIAL SUPPLY</p>
                <h1>
                  Your business.
                  <br />
                  Your answers.
                </h1>
                <p>Ask about your orders, inventory, service and more.</p>
                <div className="suggestions">
                  {[
                    "What is the status of PO-48213?",
                    "What hydraulic filters are in stock?",
                    "Show my recent service history.",
                    "What are my financing balances?",
                  ].map((q) => (
                    <button
                      key={q}
                      disabled={!conversation || busy}
                      onClick={() => void ask(q)}
                    >
                      {q}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="turns">
                {turns.map((turn) => (
                  <article className="chat-turn" key={turn.id}>
                    <div className="question-row">
                      <div className="question-bubble">{turn.question}</div>
                      <span className="avatar user-avatar">WE</span>
                    </div>
                    <div className="answer-row">
                      <span className="avatar brand-avatar">
                        <img src="/querent-logo.png" alt="Querent" />
                      </span>
                      <div className="answer-content">
                        {!turn.answer ? (
                          <div className="typing" role="status">
                            Looking up your records<span>…</span>
                          </div>
                        ) : (
                          <div
                            className={`answer-bubble ${turn.outcome === "error" ? "answer-error" : ""}`}
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {turn.answer}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="composer-wrap">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <textarea
                aria-label="Ask a question"
                placeholder="Ask about your orders, inventory, service…"
                rows={1}
                maxLength={4000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
              />
              <button
                className="send-button"
                aria-label="Send question"
                disabled={busy || !question.trim() || !conversation}
              >
                <ArrowUp size={21} />
              </button>
            </form>
            <p className="composer-note">
              Customer data, finally customer-facing.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
