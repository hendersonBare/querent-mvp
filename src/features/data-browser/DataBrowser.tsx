'use client';
import {useCallback,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {categories,labels,type API,type Category,type Customer,type DataPage} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';
export function DataBrowser({api,scope,customers}:{api:API;scope:string;customers:Customer[]}){
 const [category,setCategory]=useState<Category>('orders_current'),[page,setPage]=useState(1);
 const load=useCallback(()=>api.get<DataPage>(`supplier/data/${scope}/${category}?page=${page}&size=10`),[api,scope,category,page]);
 const {data,error}=usePoll(load,15000);
 const names=new Map(customers.map(c=>[c.id,c.name]));
 const columns=data?.rows[0]?Object.keys(data.rows[0]).filter(c=>c!=='id'&&(c!=='customer_id'||scope==='all')):[];
 return <section className="card"><div className="section-heading"><div><h2>Data browser</h2><p>Read-only records from Century Equipment.</p></div><select aria-label="Data category" value={category} onChange={e=>{setCategory(e.target.value as Category);setPage(1);}}>{categories.map(c=><option value={c} key={c}>{labels[c]}</option>)}</select></div>{error&&<p className="error" role="alert">{error}</p>}<div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c==='customer_id'?'Customer':c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{data?.rows.map((row,i)=><tr key={String(row.id||i)}>{columns.map(c=><td key={c}>{c==='customer_id'?(names.get(String(row[c]))??'Unknown'):(row[c]===null?'N/A':String(row[c]))}</td>)}</tr>)}</tbody></table></div>{!data?(error?null:<p className="muted">Loading records…</p>):!data.rows.length?<p className="muted">No records in this category.</p>:null}<div className="pagination"><span>{data?.total??0} records · Page {page} of {Math.max(1,Math.ceil((data?.total??0)/10))}</span><div><button className="icon-button" aria-label="Previous page" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next page" disabled={!data||page*10>=data.total} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div></div></section>;
}
