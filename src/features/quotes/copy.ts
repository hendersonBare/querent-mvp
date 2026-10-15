// The quotes pages' and API's words (docs/boxt/plan.md B6), in one place so the pages and the route
// handlers say the same thing. No em dashes anywhere in UI copy.

export const QUOTE_COPY={
  // API
  notFound:'Quote not found.',
  exampleDelete:'The example quote can\'t be deleted.',
  exampleEdit:'The example quote can\'t be edited.',
  invalidBody:'The changes are not valid.',
  unknownLine:'One of the lines is not on this quote. Reload the page and try again.',
  unmatchedPrice:'An unmatched line has no item to price.',
  matchedNeedsBoth:'Every matched line needs a quantity and a unit price.',
  loadFailed:'The quotes could not be loaded. Try again.',
  saveFailed:'The quote could not be saved. Try again.',
  deleteFailed:'The quote could not be deleted. Try again.',
  notAllowed:'You are not allowed to change this quote.',

  // List
  empty:'No quotes yet. Create one with the',
  emptyLink:'Quote creation tool',
  none:'None',
  example:'Example',

  // Detail
  backToQuotes:'Quotes',
  noCustomer:'No customer name',
  exampleNote:'This example can\'t be edited or deleted.',
  matchedByRep:'Matched by rep',
  unmatchedTitle:'Unmatched lines',
  unmatchedLabel:'Unmatched - original text',
  nearMissesTitle:'Near-misses',
  notPriced:'Not priced',
  notSet:'Not set',
  total:'Total',
  edit:'Edit quote',
  delete:'Delete',
  save:'Save changes',
  saving:'Saving…',
  cancel:'Cancel',
  remove:'Remove',
  needsLine:'A quote needs at least one line. To drop them all, delete the quote instead.',
  quantityError:'Enter a quantity above 0.',
  priceError:'Enter a price of 0 or more, with up to 4 decimals.',
  required:'Required.',
  textTooLong:'Use at most 200 characters.',

  // Delete dialog
  deleteTitle:'Delete this quote?',
  deleteIntro:'The quote and all its lines are removed for everyone. This can\'t be undone.',
  deleteConfirm:'Delete quote',
  deleting:'Deleting…',
} as const;
