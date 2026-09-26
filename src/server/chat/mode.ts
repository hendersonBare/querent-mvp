// Which chat engine answers (spec §6.5). Scripted chat is deterministic and offline: CI and every
// E2E run use it, and so does any deployment without an API key. Live chat is Claude with tools
// over the repository (task 2.1).

export type ChatMode='scripted'|'live';

/** `scripted` when QUERENT_SCRIPTED=1 or no ANTHROPIC_API_KEY is set, otherwise `live`. */
export function chatMode(env:Record<string,string|undefined>=process.env):ChatMode{
  const forced=/^(1|true)$/i.test(env.QUERENT_SCRIPTED?.trim()??'');
  return forced||!env.ANTHROPIC_API_KEY?.trim()?'scripted':'live';
}
