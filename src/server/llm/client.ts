import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// The one place that reads the Anthropic settings (docs/boxt/plan.md, "LLM contract"). The key and
// every request stay server-side and are never logged: no module in src/server/llm logs anything.

export type LlmMode='live'|'scripted';
type Env=Record<string,string|undefined>;

/** The live model when ANTHROPIC_MODEL is not set. The only model id in the repository. */
export const DEFAULT_MODEL='claude-sonnet-5-5';

/** The SDK's default request timeout for this app's client, in ms. Calls may pass a shorter one. */
export const CLIENT_TIMEOUT_MS=120_000;
/** Retries on 408/409/429/5xx and connection errors, with the SDK's backoff. */
export const CLIENT_MAX_RETRIES=2;

/** `scripted` when QUERENT_SCRIPTED=1 or no ANTHROPIC_API_KEY is set (fixtures, never the network); else `live`. */
// TODO(R-2): read the key from user secrets or a secrets manager instead of .env.local.
export function llmMode(env:Env=process.env):LlmMode{
  if(env.QUERENT_SCRIPTED?.trim()==='1')return 'scripted';
  return env.ANTHROPIC_API_KEY?.trim()?'live':'scripted';
}

/** ANTHROPIC_MODEL, else DEFAULT_MODEL. */
export function model(env:Env=process.env):string{
  return env.ANTHROPIC_MODEL?.trim()||DEFAULT_MODEL;
}

/** The slice of the SDK client the parser and judge use; tests inject a fake. */
export interface MessagesClient {
  messages:{create(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions):PromiseLike<Anthropic.Message>};
}

let shared:MessagesClient|undefined;

/** One SDK client per server process, created on first use. */
export function anthropicClient(env:Env=process.env):MessagesClient{
  return shared??=new Anthropic({apiKey:env.ANTHROPIC_API_KEY?.trim(),timeout:CLIENT_TIMEOUT_MS,maxRetries:CLIENT_MAX_RETRIES});
}

/** Drops the shared client (tests only). */
export function resetClientForTests(){shared=undefined;}
