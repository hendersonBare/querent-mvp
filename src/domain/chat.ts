// Customer chat: conversations and their messages.

export type MessageRole='customer'|'assistant'|'system';

export interface Conversation {id:string;customer_id:string;contact_id:string|null;started_at:string}

/** kind: text, item_popup, quote_requested, quote_ready, ...; payload is kind-specific JSON (null for text). */
export interface ChatMessage {id:string;conversation_id:string;role:MessageRole;kind:string;content:string;payload:unknown;created_at:string}
