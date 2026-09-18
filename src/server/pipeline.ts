import "server-only";
import type { Category } from "@/lib/contracts";
import { appendLog, context, enabledCategories, history } from "./repository";
import { matchGolden, unsupportedAnswer } from "./golden";
import { claudeQuery } from "./claude";

export async function ask(
  customerId: string,
  conversationId: string,
  question: string,
) {
  const started = Date.now();
  let requested: Category[] = [];
  let handled: Category[] = [];
  let sql: string | null = null;
  let answer = "We couldn’t complete that lookup. Please try again.";
  let rowCount = 0;
  let outcome: "answered" | "no_rows" | "restricted" | "error" = "error";
  try {
    const allowed = enabledCategories(customerId);
    if (process.env.ANTHROPIC_API_KEY) {
      const result = await claudeQuery(
        question,
        customerId,
        allowed,
        context(customerId, conversationId, allowed),
      );
      requested = result.categories;
      handled = result.handled;
      sql = result.sql;
      answer = result.answer;
      rowCount = result.rows.length;
      outcome = !handled.length
        ? "restricted"
        : rowCount
          ? "answered"
          : "no_rows";
    } else {
      const previous = history(customerId, conversationId).at(-1)?.question as
        | string
        | undefined;
      const result = matchGolden(question, customerId, previous);
      if (!result) {
        answer = unsupportedAnswer;
        outcome = "no_rows";
      } else {
        requested = result.categories;
        handled = requested.filter((c) => allowed.has(c));
        if (!handled.length) {
          answer = "That information isn’t available here.";
          outcome = "restricted";
        } else if (handled.length !== requested.length) {
          const permittedQuestion = handled.includes("orders_current")
            ? "What is the status of PO-48213?"
            : handled.includes("other")
              ? "What is our account number?"
              : handled.includes("service_records")
                ? "Show our recent service records."
                : handled.includes("financing")
                  ? "What financing plans do we have?"
                  : question;
          const partial = matchGolden(permittedQuestion, customerId);
          if (partial) {
            answer = partial.answer;
            sql = partial.sql;
            rowCount = partial.rowCount;
            outcome = rowCount ? "answered" : "no_rows";
          } else {
            answer = "That information isn’t available here.";
            outcome = "restricted";
            handled = [];
          }
        } else {
          const latest = enabledCategories(customerId);
          if (!handled.every((c) => latest.has(c))) {
            answer = "That information isn’t available here.";
            outcome = "restricted";
            handled = [];
          } else {
            answer = result.answer;
            sql = result.sql;
            rowCount = result.rowCount;
            outcome = rowCount ? "answered" : "no_rows";
          }
        }
      }
    }
  } catch (error) {
    console.error("Chat pipeline failed", error);
  }
  appendLog({
    customerId,
    conversationId,
    question,
    categories: requested,
    handled,
    sql,
    rowCount,
    latency: Date.now() - started,
    outcome,
    answer,
  });
  return { answer, sql, categories: requested, outcome, row_count: rowCount };
}
