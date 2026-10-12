import {managerRoute,repJson} from '@/server/rep/http';
import {repMargins} from '@/server/rep/settings';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/settings/margins (plan U8, C_S2, C_S3; Appendix D "any rep's margins, manager, read-only"):
 * every rep's own margin per category, by name. The manager only (403 for a rep). There is no write here.
 */
export const GET=managerRoute(()=>repJson(repMargins()));
