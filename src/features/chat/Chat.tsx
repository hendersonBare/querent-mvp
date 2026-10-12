"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ClarifyPayload, ItemPopupPayload, QuoteNotice, QuoteRequestedPayload } from "@/domain";
import type { API, ChatAnswer, ChatTurn, Principal, QuoteRequestResult } from "@/lib/contracts";
import { initials } from "@/lib/initials";
import { everyWhileVisible } from "@/lib/use-poll";
import { ClarifyPanel } from "@/components/customer/ClarifyPanel";
import { ItemPopup } from "@/components/customer/ItemPopup";
import { QuoteNoticeCard } from "@/components/customer/QuoteNoticeCard";
import { emitQuotesChanged } from "@/components/customer/quotes-changed";
import { actionClass, CustomerSite } from "@/components/customer/site/CustomerSite";
import { QueryBox } from "@/components/customer/site/QueryBox";
import { addArrived, NOTICE_POLL_MS, placeWithHistory, timeline, type PlacedNotice } from "./notices";

/**
 * The quote an item pop-up turn became: the first Request quote confirmation after it, before any
 * newer pop-up (task 2.3). Null while it hasn't been requested.
 */
export function quoteRequestedAfter(turns: readonly ChatTurn[], index: number): string | null {
  for (const turn of turns.slice(index + 1)) {
    if (turn.kind === "item_popup") return null;
    if (turn.kind === "quote_requested" && turn.payload)
      return (turn.payload as QuoteRequestedPayload).quote_number;
  }
  return null;
}
export function CustomerChat({
  api,
  user,
  signOut,
  noticePollMs = NOTICE_POLL_MS,
}: {
  api: API;
  user: Principal;
  signOut: () => void;
  /** How often to look for a newly sent quote (tests shorten it). */
  noticePollMs?: number;
}) {
  const [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<ChatTurn[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conversation, setConversation] = useState(""),
    // The item pop-up that just arrived opens by itself; one reloaded from history waits (task 2.3).
    [popupToOpen, setPopupToOpen] = useState(""),
    // "Quote … is ready" messages (task 5.1), and the conversation they were first loaded for:
    // polling for new ones starts once the history and the notices already sent are on screen.
    [notices, setNotices] = useState<PlacedNotice[]>([]),
    [noticesFor, setNoticesFor] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const turnCount = useRef(0);
  turnCount.current = turns.length;
  const shownNotices = useRef(new Set<string>());
  useEffect(() => {
    shownNotices.current = new Set(notices.map((p) => p.notice.id));
  }, [notices]);
  useEffect(() => {
    const key = `querent-conversation-${user.user_id}`;
    const id = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, id);
    setConversation(id);
  }, [user.user_id]);
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    // Notices are extra: if they can't load, the history still shows and the poll tries again.
    Promise.all([
      api.get<ChatTurn[]>(`customer/history/${conversation}`).then(
        (result) => ({ ok: true as const, result }),
        (reason: unknown) => ({ ok: false as const, reason }),
      ),
      api.get<QuoteNotice[]>(`customer/notices/${conversation}`).catch(() => [] as QuoteNotice[]),
    ]).then(([history, sent]) => {
      if (cancelled) return;
      // A message sent before the history arrived stays, after the history.
      if (history.ok) setTurns((current) => [...history.result, ...current]);
      else setError(String(history.reason));
      setNotices(placeWithHistory(history.ok ? history.result : [], sent));
      setNoticesFor(conversation);
    });
    return () => {
      cancelled = true;
    };
  }, [api, conversation]);
  // A quote the rep sends while the chat is open shows up without a reload (task 5.1). The chat
  // polls, and tells the site its quotes changed when one arrives (the bell reads again).
  useEffect(() => {
    if (!noticesFor || noticesFor !== conversation) return;
    let cancelled = false;
    // Only while the tab is visible: a hidden chat skips the poll and catches up when shown.
    const stop = everyWhileVisible(() => {
      api
        .get<QuoteNotice[]>(`customer/notices/${conversation}`)
        .then((sent) => {
          if (cancelled) return;
          const arrived = sent.filter((n) => !shownNotices.current.has(n.id));
          if (!arrived.length) return;
          // Marked shown now, not after the render: a poll answered before then mustn't announce them again.
          for (const n of arrived) shownNotices.current.add(n.id);
          setNotices((placed) => addArrived(placed, sent, turnCount.current));
          emitQuotesChanged();
        })
        .catch(() => {});
    }, noticePollMs);
    return () => {
      cancelled = true;
      stop();
    };
  }, [api, conversation, noticesFor, noticePollMs]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy, notices]);
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
      if (result.kind === "item_popup") setPopupToOpen(id);
    } catch (e) {
      setTurns((t) => t.filter((turn) => turn.id !== id));
      setQuestion(text);
      setError(e instanceof Error ? e.message : "Unable to send.");
    } finally {
      setBusy(false);
    }
  }
  /** Request quote succeeded: the confirmation joins the chat, and the site is told its quotes changed. */
  function quoteRequested(result: QuoteRequestResult) {
    setTurns((t) =>
      t.some(
        (turn) =>
          turn.kind === "quote_requested" &&
          (turn.payload as QuoteRequestedPayload | null)?.quote_id === result.quote.id,
      )
        ? t
        : [...t, result.turn],
    );
    emitQuotesChanged();
  }
  const lastPopup = turns.findLastIndex((turn) => turn.kind === "item_popup");
  function newChat() {
    const id = crypto.randomUUID();
    localStorage.setItem(`querent-conversation-${user.user_id}`, id);
    setTurns([]);
    setNotices([]);
    setNoticesFor("");
    setPopupToOpen("");
    setConversation(id);
    setError("");
  }
  /** C_CVL1's starter questions for a signed-in customer (new-ui-implementation-prompt Appendix E). */
  const starters = [
    "Do you have 1/2 in grade 8 hex bolts in stock?",
    "What did we pay for nitrile gloves last time?",
    "Has our last order shipped?",
    "What's our open balance?",
  ];
  // The customer site (plan U10, C_CVL1): the chat is the Querent box. New conversation has no frame:
  // it shows next to Orders and My rep once the conversation has turns.
  return (
    <CustomerSite
      api={api}
      user={user}
      signOut={signOut}
      actions={
        turns.length > 0 ? (
          <button type="button" className={actionClass} onClick={newChat} disabled={busy}>
            New conversation
          </button>
        ) : null
      }
    >
      <QueryBox
        heading={
          <>
            Your business.
            <br />
            Your answers.
          </>
        }
        sub="Ask about stock, pricing, orders and quotes."
        starters={starters}
        onStarter={(q) => void ask(q)}
        startersDisabled={!conversation || busy}
        showWelcome={turns.length === 0}
        talk={
          turns.length > 0 || notices.length > 0 ? (
            <div className="turns">
              {/* The turns, with the "quote is ready" messages among them (task 5.1). */}
              {timeline(turns, notices).map((entry) => {
                if (entry.kind === "notice")
                  return <QuoteNoticeCard key={`notice-${entry.notice.id}`} notice={entry.notice} />;
                const { turn, index } = entry;
                return (
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
                          <div className={`answer-bubble ${turn.outcome === "error" ? "answer-error" : ""}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
                            {/* Only the latest clarifying reply can still be answered (task 2.2). */}
                            {turn.kind === "clarify" && turn.payload && index === turns.length - 1 && (
                              <ClarifyPanel
                                payload={turn.payload as ClarifyPayload}
                                active={!busy && !!conversation}
                                onSend={(message) => void ask(message)}
                              />
                            )}
                            {/* Only the latest pop-up can still be quoted, once (task 2.3). */}
                            {turn.kind === "item_popup" && turn.payload && (
                              <ItemPopup
                                api={api}
                                conversationId={conversation}
                                payload={turn.payload as ItemPopupPayload}
                                active={index === lastPopup && !!conversation}
                                requested={quoteRequestedAfter(turns, index)}
                                autoOpen={turn.id === popupToOpen}
                                onRequested={quoteRequested}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              <div ref={end} />
            </div>
          ) : null
        }
        question={question}
        onQuestion={setQuestion}
        onSubmit={() => void ask(question)}
        busy={busy || !conversation}
        error={error}
      />
    </CustomerSite>
  );
}
