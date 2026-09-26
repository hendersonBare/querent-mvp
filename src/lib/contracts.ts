/** What Querent may answer in chat, toggled per customer in Settings (spec §2). */
export const categories = ['items_stock','pricing','orders_quotes','account'] as const;
export type Category = typeof categories[number];
export const labels: Record<Category,string> = {items_stock:'Items & stock',pricing:'Pricing',orders_quotes:'Orders & quotes',account:'Account'};
/** Supplier personas are a rep (rep_id); customer personas are a contact at a customer. */
export interface Principal {user_id:string;role:'supplier_admin'|'customer_user';customer_id:string|null;name:string;user_name:string;rep_id:string|null;contact_id:string|null}
export interface AccessRule {category:Category;enabled:boolean|null;rep_id:string|null;mixed_rep:boolean;rep_name:string;phone:string|null;email:string|null}
export interface Rep {id:string;name:string;phone:string;email:string;initials?:string;title?:string}
export interface Customer {id:string;name:string;account_number?:string}
export interface Analytics {total_queries:number;minutes_saved:number;hours_saved:string;categories:{category:Category;count:number;rep_name:string}[]}
export interface Dashboard {access:AccessRule[];analytics:Analytics}
export interface ERPStatus {last_updated:string|null;events:{id:number;timestamp:string;message:string}[]}
export interface ChatAnswer {answer:string;sql:string|null;categories:Category[];outcome:'answered'|'no_rows'|'error'|'restricted';row_count:number}
export interface ChatTurn extends ChatAnswer {id:string;question:string;timestamp?:string}
export interface DataPage {rows:Record<string,unknown>[];total:number;page:number;size:number}
export interface API {get<T>(path:string):Promise<T>;send<T>(path:string,method:'POST'|'PUT',body:unknown):Promise<T>}
export interface Persona {id:'supplier'|'customer';label:string;description:string}
