// The settings page's and API's words (docs/boxt/plan.md B7), in one place so the page and the route
// handlers say the same thing. The levels' own labels and descriptions live in ./strictness.ts (LEVELS).
// No em dashes anywhere in UI copy.

export const SETTINGS_COPY={
  // API
  invalidLevel:'Choose Strict, Balanced or Lenient.',
  loadFailed:'The settings could not be loaded. Try again.',
  saveFailed:'The setting could not be saved. Try again.',
  notAllowed:'You are not allowed to change this setting.',

  // Page
  title:'Settings',
  cardTitle:'Match strictness',
  explanation:'Strict puts fewer items on a quote automatically. Anything it is unsure about is left for you to match.',
  scope:'This setting applies to every user in the company and to new match runs only. Existing quotes do not change.',
  defaultTag:'Default (recommended)',
  save:'Save',
  saving:'Saving…',
  saved:(label:string)=>`Saved. New match runs use ${label}.`,
  comingSoon:'Other settings coming soon.',
} as const;
