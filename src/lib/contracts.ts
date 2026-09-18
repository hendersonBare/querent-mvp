export const categories = ['parts_stock','equipment_stock','service_records','orders_past','orders_current','financing','other'] as const;
export type Category = typeof categories[number];
export const labels: Record<Category,string> = {parts_stock:'Parts inventory',equipment_stock:'Equipment inventory',service_records:'Service records',orders_past:'Past orders',orders_current:'Current orders',financing:'Financing',other:'Account details'};
export interface Principal {user_id:string;role:'supplier_admin'|'customer_user';customer_id:string|null;name:string}
export interface AccessRule {category:Category;enabled:boolean|null;rep_id:string|null;mixed_rep:boolean;rep_name:string;phone:string|null;email:string|null}
export interface Rep {id:string;name:string;phone:string;email:string}
export interface Customer {id:string;name:string}
export interface Analytics {total_queries:number;minutes_saved:number;hours_saved:string;categories:{category:Category;count:number;rep_name:string}[]}
export interface Dashboard {access:AccessRule[];analytics:Analytics}
export interface ERPStatus {last_updated:string|null;events:{id:number;timestamp:string;message:string}[]}
export interface ChatAnswer {answer:string;sql:string|null;categories:Category[];outcome:'answered'|'no_rows'|'error'|'restricted';row_count:number}
export interface ChatTurn extends ChatAnswer {id:string;question:string;timestamp?:string}
export interface DataPage {rows:Record<string,unknown>[];total:number;page:number;size:number}
export interface API {get<T>(path:string):Promise<T>;send<T>(path:string,method:'POST'|'PUT',body:unknown):Promise<T>}
export interface Persona {id:'supplier'|'wasatch'|'bonneville';label:string;description:string}
