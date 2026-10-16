import {withApiUser} from '@/features/auth/api';
import {handleMatch} from '@/features/quote-tool/match';

// POST /api/quote-tool/match: a pasted list or a PDF in, an NDJSON stream of progress and the match
// result out (src/features/quote-tool/match.ts). Parsing and judging call Claude, so the route may run
// for minutes; the pipeline gives up well inside maxDuration (pipeline.ts PARSE_TIMEOUT_MS, RUN_DEADLINE_MS).
export const runtime='nodejs';
export const maxDuration=300;

export const POST=withApiUser(handleMatch);
