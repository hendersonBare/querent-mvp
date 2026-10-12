import 'server-only';
import {NOTIFICATION_GROUPS,REP_NOTIFICATION_KEYS,type RepNotificationKey} from '@/domain';
import {repNotificationPrefs,setRepNotificationPrefs} from '@/server/repository';
import type {NotificationKind} from './badges';

// Settings > Notifications (plan U9; C_RS4; Appendix C rep_notification_prefs): in-app switches only (no email),
// in C_RS4's two cards: the four that feed the caution dropdown (Needs attention) and the four that feed the
// bell (Notifications). Every switch is on until the rep turns it off. GET /api/rep/badges applies them through
// notifyFor (src/server/rep/badges.ts): a row is dropped when a switch it falls under is off.

export type NotificationPrefs=Record<RepNotificationKey,boolean>;

/** C_RS4's cards, in its order and words (shared with the page). */
export {NOTIFICATION_GROUPS};

/** A request the switches can't take: 400. */
export class NotificationPrefsError extends Error{
  readonly status=400;
  constructor(message='Invalid setting.'){super(message);this.name='NotificationPrefsError';}
}

const isKey=(key:string):key is RepNotificationKey=>(REP_NOTIFICATION_KEYS as readonly string[]).includes(key);

/** GET /api/rep/notification-prefs: every switch of the rep, on unless they turned it off. */
export function notificationPrefs(repId:string):NotificationPrefs{
  const stored=repNotificationPrefs(repId);
  return Object.fromEntries(REP_NOTIFICATION_KEYS.map(key=>[key,stored[key]??true])) as NotificationPrefs;
}

/**
 * PUT /api/rep/notification-prefs {<event key>: true|false, ...}: the switches sent (one card's, or any of
 * them), all stored or none. Only the eight Appendix C keys, each true or false; always the signed-in rep's.
 */
export function updateNotificationPrefs(repId:string,input:unknown):NotificationPrefs{
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new NotificationPrefsError();
  const entries=Object.entries(input as Record<string,unknown>);
  if(!entries.length||entries.some(([key,value])=>!isKey(key)||typeof value!=='boolean'))throw new NotificationPrefsError();
  setRepNotificationPrefs(repId,Object.fromEntries(entries) as Partial<NotificationPrefs>);
  return notificationPrefs(repId);
}

/**
 * The switch each badge row kind falls under. A new quote request is the customer's chat asking for its rep
 * (the bell's "Q-24818 requested by Dana Ortiz"); every other kind is its own Appendix C key.
 */
const PREF_OF:Record<NotificationKind,RepNotificationKey>={
  quote_overdue:'quote_overdue',quote_aging:'quote_aging',below_margin_floor:'below_margin_floor',change_requested:'change_requested',
  quote_accepted:'quote_accepted',quote_declined:'quote_declined',quote_expired:'quote_expired',quote_requested:'customer_chat_needs_rep',
};

/** The rep's switches as GET /api/rep/badges takes them (repBadges' `notify`): read once per call. */
export function notifyFor(repId:string):(kind:NotificationKind)=>boolean{
  const prefs=notificationPrefs(repId);
  return kind=>prefs[PREF_OF[kind]];
}
