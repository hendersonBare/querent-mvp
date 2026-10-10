import "server-only";
import type { ItemPopupPayload } from "@/domain";
import type { ChatAnswer } from "@/lib/contracts";
import { liveReply } from "./chat/live";
import { chatMode } from "./chat/mode";
import { reply, type ChatReply } from "./chat/reply";
import { scriptedReply } from "./chat/scripted";
import { withSuggestions } from "./customer/suggestions";
import {
  addMessage,
  appendLog,
  conversation,
  conversationMessages,
  createConversation,
} from "./repository/customer";

// The customer chat pipeline. Each turn is stored in the conversation (messages, with the
// reply's kind and payload, e.g. the item pop-up's cart) and in the query log behind analytics.
// Live mode is Claude with typed tools over the customer-safe repository (task 2.1); scripted
// mode answers without an API key or with QUERENT_SCRIPTED=1 (spec §6.5, task 0.4).
// An item pop-up is stored with its "Frequently bought together" suggestions and how many were
// offered (decision 37, spec §10, task E1), chosen once here so Request quote can check them.

/** The conversation id belongs to another customer. */
export class ConversationNotFoundError extends Error {}

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
        : await liveReply({ customerId }, question, earlier);
  } catch (error) {
    console.error("Chat pipeline failed", error);
    result = reply({ outcome: "error", content: "We couldn’t complete that lookup. Please try again." });
  }
  if (result.kind === "item_popup" && result.payload) {
    try {
      result = { ...result, payload: await withSuggestions(customerId, result.payload as ItemPopupPayload) };
    } catch (error) {
      // The list still opens without suggestions.
      console.error("Pop-up suggestions failed", error);
    }
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
    categories: result.categories,
    outcome: result.outcome,
    row_count: result.rowCount,
    kind: result.kind,
    payload: result.payload,
  };
}
