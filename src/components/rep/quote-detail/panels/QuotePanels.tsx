'use client';
import {useCallback} from 'react';
import type {QuoteFigures} from '@/server/rep/quote-math';
import type {QuoteEditor} from '../use-quote-editor';
import {ActivityPanel} from './ActivityPanel';
import {savePanel} from './api';
import {CustomerPanel} from './CustomerPanel';
import {FulfillmentPanel} from './FulfillmentPanel';
import {NotesPanel} from './NotesPanel';
import {TermsPanel} from './TermsPanel';
import type {SavePanel} from './types';

// The quote detail's side panels (spec §4, task 3.4; screens 03, 04, 08): Customer with the
// credit bar, Pickup or delivery with freight, Quote terms, Internal notes and Activity, under the
// summary card in the rail. `figures` are the page's live totals (the summary card's), so the
// credit bar and freight follow prices, qty and freight as the rep edits. Panel saves go through
// the editor's queue (saveQuote), behind any line edits, and their fresh detail refreshes the
// whole page: totals, "things to check before sending" and these panels.

export function QuotePanels({editor,figures}:{editor:QuoteEditor;figures:QuoteFigures}){
  const {detail,saveQuote}=editor;
  const quoteId=detail.quote.id;
  const save=useCallback<SavePanel>((endpoint,method,body)=>saveQuote(()=>savePanel(quoteId,endpoint,method,body)),[saveQuote,quoteId]);
  return <>
    <CustomerPanel detail={detail} quoteTotal={figures.total??figures.items}/>
    <FulfillmentPanel detail={detail} items={figures.items} save={save}/>
    <TermsPanel detail={detail} save={save}/>
    <NotesPanel detail={detail} save={save}/>
    <ActivityPanel detail={detail}/>
  </>;
}
