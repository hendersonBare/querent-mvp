// BOXT matching (task B3): description-only scoring against the catalog, retrieval of the judge's
// candidates with product groups and the lead, and the decision rule the quote tool's pipeline and the
// evaluation suite (src/eval) share. Pure and client-safe: the catalog and the rule are arguments.
export {scorePackaging,type Candidate,type Eligibility} from './score-packaging';
export {packLabel,productGroup,type PackagingItem} from './packaging';
export {retrieve,type MatchRule,type RetrieveOptions,type Retrieval} from './retrieve';
export {decide,type Decision,type NoMatchReason,type Verdict} from './decide';
