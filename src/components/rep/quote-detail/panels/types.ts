import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {PanelEndpoint,PanelMethod} from './api';

/** Saves one panel edit through the quote editor's queue; resolves to the fresh detail or rejects with the server's message. */
export type SavePanel=(endpoint:PanelEndpoint,method:PanelMethod,body?:unknown)=>Promise<QuoteDetail>;
