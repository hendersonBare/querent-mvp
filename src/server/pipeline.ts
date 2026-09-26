import "server-only";
import type { ChatAnswer } from "@/lib/contracts";
import { chatMode } from "./chat/mode";
import { scriptedReply, type ChatReply } from "./chat/scripted";
import {
  addMessage,
  appendLog,
  assignedRep,
  conversation,
  conversationMessages,
  createConversation,
} from "./repository/customer";

// The customer chat pipeline. Each turn is stored in the conversation (messages, with the
// reply's kind and payload, e.g. the item pop-up's cart) and in the query log behind analytics.
// Scripted chat answers without an API key (spec §6.5, task 0.4). Tool-calling chat over the
// repository is task 2.1; until it lands, live mode gives a holding answer that points to the rep.

/** The conversation id belongs to another customer. */
export class ConversationNotFoundError extends Error {}

const reply = (r: Partial<ChatReply> & Pick<ChatReply, "content" | "outcome">): ChatReply => ({
  kind: "text",
  payload: null,
  categories: [],
  handled: [],
  toolCalls: [],
  rowCount: 0,
  ...r,
});

function holdingReply(customerId: string): ChatReply {
  const rep = assignedRep(customerId);
  return reply({
    outcome: "no_rows",
    content: rep
      ? `Querent is being upgraded to handle quote requests, so I can't look that up yet. ${rep.name} can help right away: ${rep.phone} or ${rep.email}.`
      : "Querent is being upgraded to handle quote requests, so I can't look that up yet. Please call Herrick customer service.",
  });
}

/** Opens the customer's conversation, creating it on the first message. */
function openConversation(customerId: string, conversationId: string, contactId: string | null) {
  if (conversation(customerId, conversationId)) return;
  try {
    createConversation({ id: conversationId, customerId, contactId });
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT"))
      throw new ConversationNotFoundError(`Conversation ${conversationId} not found.`);
    throw error;
  }
}

export async function ask(
  customerId: string,
  conversationId: string,
  question: string,
  { contactId = null }: { contactId?: string | null } = {},
): Promise<ChatAnswer> {
  const started = Date.now();
  openConversation(customerId, conversationId, contactId);
  const earlier = conversationMessages(customerId, conversationId);
  addMessage(customerId, conversationId, { role: "customer", content: question });
  let result: ChatReply;
  try {
    result =
      chatMode() === "scripted"
        ? scriptedReply({ customerId }, question, earlier)
        : holdingReply(customerId);
  } catch (error) {
    console.error("Chat pipeline failed", error);
    result = reply({ outcome: "error", content: "We couldn’t complete that lookup. Please try again." });
  }
  addMessage(customerId, conversationId, {
    role: "assistant",
    kind: result.kind,
    content: result.content,
    payload: result.payload,
  });
  appendLog({
    customerId,
    conversationId,
    question,
    categories: result.categories,
    handled: result.handled,
    toolCalls: result.toolCalls,
    rowCount: result.rowCount,
    latency: Date.now() - started,
    outcome: result.outcome,
    answer: result.content,
  });
  return {
    answer: result.content,
    sql: null,
    categories: result.categories,
    outcome: result.outcome,
    row_count: result.rowCount,
    kind: result.kind,
    payload: result.payload,
  };
}
