import 'server-only';
import type {Category,DataPage} from '@/lib/contracts';
import {all,scalar} from './sql';

export type Row=Record<string,unknown>;

// Read-only record views for the supplier Data browser, one per information category.
// `scope` filters customer-specific views; items and stock are shared by every customer.
const views:Record<Category,{select:string;scopeColumn:string|null;order:string}>={
  items_stock:{select:"SELECT i.sku id,i.sku,i.description,c.name category,i.pack,(SELECT group_concat(stock,' · ') FROM (SELECT b.code||' '||s.available stock FROM branch_stock s JOIN branches b ON b.id=s.branch_id WHERE s.item_id=i.id ORDER BY b.rowid)) available FROM items i JOIN product_categories c ON c.id=i.category_id",scopeColumn:null,order:'c.sort_order,i.sku'},
  pricing:{select:'SELECT p.id,cu.id customer_id,i.sku,i.description,i.pack,i.list_price,p.unit_price customer_price FROM customers cu JOIN customer_prices p ON p.price_level_id=cu.price_level_id JOIN items i ON i.id=p.item_id',scopeColumn:'cu.id',order:'cu.name,i.sku'},
  orders_quotes:{select:'SELECT o.id,o.customer_id,o.order_number,o.po_number,o.order_date,o.status,o.total FROM orders o',scopeColumn:'o.customer_id',order:'o.order_date DESC'},
  account:{select:'SELECT cu.id,cu.id customer_id,cu.account_number,cu.terms,cu.credit_limit,cu.open_balance,r.name rep FROM customers cu LEFT JOIN customer_rep cr ON cr.customer_id=cu.id LEFT JOIN reps r ON r.id=cr.rep_id',scopeColumn:'cu.id',order:'cu.name'},
};

/** One page of a Data browser view. */
export function browse(scope:string|null,category:Category,page:number,size:number):DataPage{
  const view=views[category];const where=scope&&view.scopeColumn?` WHERE ${view.scopeColumn}=?`:'';const params=where?[scope]:[];
  const total=scalar<number>(`SELECT count(*) FROM (${view.select}${where})`,...params)??0;
  const rows=all<Row>(`${view.select}${where} ORDER BY ${view.order} LIMIT ? OFFSET ?`,...params,size,(page-1)*size);
  return {rows,total,page,size};
}
