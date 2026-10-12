// Supplier, customers, contacts, reps, departments and supplier settings (spec §2, §4).

export interface Supplier {id:string;name:string;address:string;city:string;state:string;zip:string;phone:string;email:string;website:string}

export interface Rep {id:string;name:string;initials:string;title:string;phone:string;email:string}
/** A rep's Settings > Profile as stored (plan U9): the rep, and when their picture last changed (null: no picture). */
export interface RepProfile extends Rep {picture_updated_at:string|null}
/** The picture types a rep may upload (plan U9): never SVG, which can carry script. */
export const PICTURE_TYPES=['image/png','image/jpeg','image/webp'] as const;
export type PictureType=(typeof PICTURE_TYPES)[number];
/** A rep's stored picture. */
export interface RepPicture {data:Uint8Array;type:PictureType;updated_at:string}
/** The notification events a rep turns on or off in the app (plan U9; Appendix C rep_notification_prefs). */
export const REP_NOTIFICATION_KEYS=['quote_overdue','quote_aging','below_margin_floor','change_requested','quote_accepted','quote_declined','quote_expired','customer_chat_needs_rep'] as const;
export type RepNotificationKey=(typeof REP_NOTIFICATION_KEYS)[number];
/**
 * Settings > Notifications' two cards (plan U9; C_RS4), in its order and words: the switches that feed the
 * caution dropdown (Needs attention) and the ones that feed the bell (Notifications).
 */
export const NOTIFICATION_GROUPS:readonly {title:string;items:readonly {key:RepNotificationKey;label:string}[]}[]=[
  {title:'Needs attention',items:[
    {key:'quote_overdue',label:'Quote overdue'},{key:'quote_aging',label:'Quote aging'},
    {key:'below_margin_floor',label:'Below margin floor'},{key:'change_requested',label:'Change requested'},
  ]},
  {title:'Notifications',items:[
    {key:'quote_accepted',label:'Quote accepted'},{key:'quote_declined',label:'Quote declined'},
    {key:'quote_expired',label:'Quote expired'},{key:'customer_chat_needs_rep',label:'Customer chat needs a rep'},
  ]},
];

/** reps.role (v3 spec §8, decision 20): supervisor and admin are merged into manager. */
export type RepRole='rep'|'manager';
/** A rep's stored role and whether they are active, read on every rep request (task D1). */
export interface RepStanding {role:RepRole;active:boolean}
/** One rep as Teams and Reps lists them (tasks D1, U7): role, team (its name and id, null for none), active, and how many customers are theirs (customer_rep). */
export interface TeamRep extends Pick<Rep,'id'|'name'|'initials'|'title'>,RepStanding {team:string|null;team_id:number|null;customer_count:number}

/** One row of the customer picker, the Customers list and Rep assignments (one rep per customer). */
export interface CustomerListItem {id:string;name:string;account_number:string;rep_id:string|null;rep_name:string|null}

/**
 * One row of the rep's Customers list (task 3.8): the customer list's facts plus terms, balance and how
 * much history the account has. Placeholder customers have null terms and zero counts (spec §2).
 */
export interface CustomerDirectoryRow extends CustomerListItem {
  terms:string|null;credit_limit:number|null;open_balance:number|null;
  order_count:number;last_order_date:string|null;quote_count:number;
  /** Quotes still open: Draft ready, Changes requested or Sent (the Has open quotes filter, plan U5). */
  open_quote_count:number;
}

export interface ShipTo {name:string|null;address:string;city:string|null;state:string|null;zip:string|null;lat:number|null;lng:number|null}

/** Internal account record. Placeholder customers have only id, name, account number and rep (spec §2). */
export interface CustomerAccount {
  id:string;account_number:string;name:string;terms:string|null;credit_limit:number|null;open_balance:number|null;past_due_balance:number|null;
  tax_status:'taxable'|'exempt'|null;tax_state:string|null;price_level_id:string|null;main_phone:string|null;ship_to:ShipTo|null;rep:Rep|null;
}

/** Customer-safe account facts (the get_account_summary tool, spec §6.3). */
export interface AccountSummary {customer_id:string;account_number:string;name:string;terms:string|null;credit_limit:number|null;open_balance:number|null;past_due_balance:number|null;tax_status:'taxable'|'exempt'|null;rep:Rep|null}

/**
 * Internal facts for the rep's Customer panel. A quote is lost when it expired (the seed stores its
 * lost quotes that way, task 0.2) or the customer declined it (A1), as quoteOutcome counts them, so
 * win_rate = accepted / (accepted + lost), or null with no decided quotes.
 */
export interface CustomerStats {customer_id:string;last_order:{order_number:string;order_date:string;total:number}|null;quotes_accepted:number;quotes_lost:number;win_rate:number|null}

export interface Contact {id:string;customer_id:string;name:string;title:string|null;phone:string|null;email:string|null;is_primary:boolean}

/** Static department contacts (the chat's answers); will-call rows point at their branch. */
export interface Department {id:string;name:string;branch_id:string|null;phone:string;email:string|null;hours:string;sort_order:number}

/**
 * GET /api/query/customer/contacts: the customer's assigned rep, shown in the My rep sheet (plan U10,
 * C_CVL3). Only the rep: the departments stay in the chat's answers.
 */
/**
 * The rep as a customer sees them (plan U9): what the rep set on Settings > Profile, their title, and a link to
 * their picture (null without one). No internal id, nothing else of the rep.
 */
export interface CustomerRep {name:string;initials:string;title:string;phone:string;email:string;picture_url:string|null}
export interface CustomerRepContact {rep:CustomerRep|null}

/** Freight rates (spec §5.3), shown read-only in Settings. */
/** Settings > Pricing & delivery. road_factor turns straight-line miles into road miles (spec §5.3). */
export interface DeliveryRates {base_fee:number;per_mile:number;min_charge:number;free_threshold:number;max_radius_miles:number;road_factor:number}

export interface PricingSettings {scarcity_uplift_enabled:boolean}

/** A rep's margin floor for one product category, as a fraction (0.2 = 20%). Spec §5.2. */
export interface RepFloor {rep_id:string;category_id:string;category_name:string;margin_floor:number;updated_at:string}
