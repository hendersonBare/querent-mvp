"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ClarifyPayload } from "@/domain";
import type { API, ChatAnswer, ChatTurn, Principal } from "@/lib/contracts";
import { initials } from "@/lib/initials";
import { ClarifyPanel } from "@/components/customer/ClarifyPanel";
import { CustomerLayout } from "@/components/customer/CustomerLayout";
export function CustomerChat({
  api,
  user,
  signOut,
}: {
  api: API;
  user: Principal;
  signOut: () => void;
}) {
  const [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<ChatTurn[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conversation, setConversation] = useState("");
  const end = useRef<HTMLDivElement>(null);
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
  // The rep's section sits at the very top of the left sidebar (spec §3), so New conversation
  // lives above the chat.
  return (
    <CustomerLayout api={api} user={user} signOut={signOut}>
      <div className="chat-column">
        <div className="chat-toolbar">
          <button className="new-chat" onClick={newChat} disabled={busy}>
            <Plus size={16} />
            New conversation
          </button>
        </div>
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
                <p>Ask about stock, pricing, orders and quotes.</p>
                <div className="suggestions">
                  {[
                    "Do you have 1/2 in grade 8 hex bolts in stock?",
                    "What did we pay for nitrile gloves last time?",
                    "Has our last order shipped?",
                    "What's our open balance?",
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
                {turns.map((turn, index) => (
                  <article className="chat-turn" key={turn.id}>
                    <div className="question-row">
                      <div className="question-bubble">{turn.question}</div>
                      <span className="avatar user-avatar">{initials(user.user_name)}</span>
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
                            {/* Only the latest clarifying reply can still be answered (task 2.2). */}
                            {turn.kind === "clarify" && turn.payload && index === turns.length - 1 && (
                              <ClarifyPanel
                                payload={turn.payload as ClarifyPayload}
                                active={!busy && !!conversation}
                                onSend={(message) => void ask(message)}
                              />
                            )}
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
                placeholder="Ask about stock, pricing, orders…"
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
    </CustomerLayout>
  );
}
