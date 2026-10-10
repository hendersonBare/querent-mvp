// Which chat engine answers (spec §6.5). Scripted chat is deterministic and offline: CI and every
// E2E run use it, and so does any deployment without an API key. Live chat is Claude with tools
// over the repository (task 2.1).

export type ChatMode='scripted'|'live';

/** The live model when ANTHROPIC_MODEL is not set (spec §6.5). */
export const DEFAULT_MODEL='claude-sonnet-5';

/** `scripted` when QUERENT_SCRIPTED=1 or no ANTHROPIC_API_KEY is set, otherwise `live`. */
// TODO(R-2): read the key from user secrets or a secrets manager instead of .env.local.
export function chatMode(env:Record<string,string|undefined>=process.env):ChatMode{
  const forced=/^(1|true)$/i.test(env.QUERENT_SCRIPTED?.trim()??'');
  return forced||!env.ANTHROPIC_API_KEY?.trim()?'scripted':'live';
}

/** The model live chat calls: ANTHROPIC_MODEL, or the default. */
export function chatModel(env:Record<string,string|undefined>=process.env){
  return env.ANTHROPIC_MODEL?.trim()||DEFAULT_MODEL;
}
