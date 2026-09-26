import "server-only";
import { appendLog, assignedRep } from "./repository";

// Holding answer while chat is rebuilt for Query to Quote. The old regex answers and
// text-to-SQL read tables that no longer exist, and text-to-SQL could now reach
// items.cost, so both are gone. Scripted chat arrives in task 0.4 and tool-calling
// chat over the repository in task 2.1 (spec §6.3, §6.5).
export async function ask(
  customerId: string,
  conversationId: string,
  question: string,
) {
  const started = Date.now();
  const rep = assignedRep(customerId);
  const answer = rep
    ? `Querent is being upgraded to handle quote requests, so I can't look that up yet. ${rep.name} can help right away: ${rep.phone} or ${rep.email}.`
    : "Querent is being upgraded to handle quote requests, so I can't look that up yet. Please call Herrick customer service.";
  appendLog({
    customerId,
    conversationId,
    question,
    categories: [],
    handled: [],
    toolCalls: [],
    rowCount: 0,
    latency: Date.now() - started,
    outcome: "no_rows",
    answer,
  });
  return {
    answer,
    sql: null,
    categories: [],
    outcome: "no_rows" as const,
    row_count: 0,
  };
}
