import {csvFileResponse} from '@/server/export/http';
import {lineItemsCsv,lineItemsFilename} from '@/server/export/line-items';
import {repPdfSource} from '@/server/pdf/rep';
import {parseRevision} from '@/server/pdf/request';
import {repJson,repRoute} from '@/server/rep/http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes/<id or number>/lines.csv?rev=n|draft: Line items (CSV) from the quote's
 * Export menu (task 4.3, spec §4), for Excel or Google Sheets. Rep-only: 401 without a session,
 * 403 for a customer, and another rep's quote is 404 like an unknown one (repPdfSource), except
 * to the manager, who reads any quote (task D2).
 *
 * rev picks the revision exactly as on GET /api/quotes/<id>/pdf: a sent revision, the latest
 * sent without it, or rev=draft for the unsent draft (409 once there is none). The file is built
 * from the customer PDF's own customer-safe source, so it has the customer quote's columns and
 * no cost or margin.
 */
export const GET=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params},session)=>{
  const rev=parseRevision(request.nextUrl.searchParams.get('rev'));
  if(!rev.ok)return repJson({detail:rev.detail},400);
  const {id}=await params;
  const loaded=await repPdfSource(repId,id,rev.rev,new Date().toISOString(),{manager:session.manager});
  if(!loaded.ok)return repJson({detail:loaded.detail},loaded.status);
  return csvFileResponse(lineItemsCsv(loaded.source),lineItemsFilename(loaded.source));
});
