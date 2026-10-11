'use client';
import {useState,type CSSProperties} from 'react';
import {
  CustomerPicker,DataTable,Dropdown,DropdownItem,FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterInput,FilterPair,FilterSpacer,
  HeaderIconButton,Lane,LaneRow,PageHeader,Select,Sheet,StatusText,Toggle,ViewNoteButton,type DataColumn,type TablePrefs,
} from '@/components/ui';

// Test tooling (see page.tsx). The sample rows and names mirror the frames' placeholder content so the
// spec can match elements by their text; none of it is product data.

const COLOR_TOKENS=['rail','rail-border','rail-text','rail-name','rail-button-border','titlebar','titlebar-muted','page','card','card-border','table-header',
  'table-header-text','row-divider','row-divider-soft','lane','border','rule','text','text-2','text-muted','text-code','icon-muted','more-text','accent','red',
  'red-tint','red-border','note','note-text','toggle-off','check-disabled','close','count-bg','button-text','backdrop-sheet','backdrop-dialog'];
const SHADOW_TOKENS=['shadow-popover','shadow-picker','shadow-sheet','shadow-lane-drag','shadow-header-drag'];
const FONT_SIZE_TOKENS=['text-body','text-title','text-table-head','text-button','text-control','text-label','text-card-title','text-secondary'];
const RADIUS_TOKENS=['radius-card','radius-control','radius-button','radius-field'];
const swatch=(token:string,style:CSSProperties)=><div key={token} data-token={token} style={{width:24,height:24,...style}}/>;

const STATUSES=['Draft ready','Changes requested','Sent','Accepted','Expired','Declined'];
const ONLY=['Overdue','Aging','Below margin floor'];
interface QuoteFilters {statuses:string[];only:string[];rep:string;customer:string}
const ALL_STATUSES:QuoteFilters={statuses:STATUSES,only:[],rep:'',customer:''};
const NONE:QuoteFilters={statuses:[],only:[],rep:'',customer:''};

const CUSTOMERS=[['Wasatch Mechanical Contractors','WAS-1142'],['Canyon Ridge Builders','CRB-3318'],['Bonneville Electric Supply','BES-2207'],
  ['Summit Plumbing and Heating','SPH-0931'],['Red Rock Excavation','RRE-4410'],['Teton Concrete Works','TCW-2290'],['Great Basin Fabrication','GBF-2207'],
  ['Uinta Facility Services','UFS-4051'],['Utah Valley Electric','UVE-5126'],['Weber Basin Fabricators','WBF-6074'],['Wasatch Valley Roofing','WVR-5520'],
  ['Cache Valley Mechanical','CVM-1180'],['Ogden Steel Erectors','OSE-3302']].map(([name,account_number],i)=>({id:`c${i}`,name,account_number}));

interface Row {id:string;cust:string;date:string;st:string;flag?:string;note?:boolean;total:string;margin:string}
const ROWS:Row[]=[
  {id:'Q-24791',cust:'Wasatch Mechanical Contractors',date:'Oct 9',st:'Sent',total:'$96.00',margin:'35.4%'},
  {id:'Q-24817',cust:'Wasatch Mechanical Contractors',date:'Oct 9',st:'Draft ready',flag:'Overdue. 1 line below floor',total:'$1,122.40',margin:'32.2%'},
  {id:'Q-24790',cust:'Wasatch Mechanical Contractors',date:'Oct 8',st:'Changes requested',flag:'Overdue',note:true,total:'$1,164.00',margin:'34.9%'},
  {id:'Q-24789',cust:'Wasatch Mechanical Contractors',date:'Oct 6',st:'Sent',flag:'Aging',total:'$360.80',margin:'34.5%'},
  ...Array.from({length:27},(_,i)=>({id:`Q-${24700+i}`,cust:'Canyon Ridge Builders',date:'Sep 8',st:'Accepted',total:'$412.90',margin:'36.0%'})),
];
const COLUMNS:DataColumn<Row>[]=[
  {id:'quote',label:'Quote',track:'1fr',alwaysShown:true,render:r=><div style={{fontWeight:800}}>{r.id}</div>},
  {id:'customer',label:'Customer',track:'2.2fr',render:r=>r.cust},
  {id:'requested',label:'Requested',track:'0.9fr',render:r=><div style={{color:'var(--q-text-2)'}}>{r.date}</div>},
  {id:'status',label:'Status',track:'1.5fr',render:r=><><StatusText status={r.st} flag={r.flag}/>{r.note&&<ViewNoteButton/>}</>},
  {id:'total',label:'Total',track:'1fr',align:'right',render:r=><div style={{fontWeight:800,fontVariantNumeric:'tabular-nums'}}>{r.total}</div>},
  {id:'margin',label:'Margin',track:'0.9fr',align:'right',render:r=><div style={{fontFamily:'var(--q-font-mono)',fontSize:13,color:'var(--q-table-header-text)'}}>{r.margin}</div>},
  {id:'rep',label:'Rep',track:'1fr',hiddenByDefault:true,render:()=>'Brandi Gallegos'},
  {id:'valid',label:'Valid until',track:'1fr',hiddenByDefault:true,render:()=>'Oct 23'},
  {id:'agent',label:'Purchasing agent',track:'1fr',hiddenByDefault:true,render:()=>'Dana Ortiz'},
];
const LANES:[string,number][]=[['Draft ready',1],['Changes requested',1],['Sent',2],['Accepted',20],['Expired',7],['Declined',0]];

const section:CSSProperties={marginTop:32};

export function UiFixture({tableId,prefs,persist}:{tableId:string;prefs:TablePrefs|null;persist:boolean}){
  const [customer,setCustomer]=useState<string|null>(null);
  const [filters,setFilters]=useState(ALL_STATUSES);
  const [caution,setCaution]=useState(false);
  const [bell,setBell]=useState(false);
  const [lanes,setLanes]=useState(LANES);
  const [on,setOn]=useState(true);
  const [off,setOff]=useState(false);
  const [sheet,setSheet]=useState(false);
  return <div className="ui-root" data-testid="ui-root" style={{padding:'var(--q-page-padding)',minHeight:'100vh'}}>
    <section data-testid="tokens" style={{display:'flex',flexWrap:'wrap',gap:4}}>
      {COLOR_TOKENS.map(t=>swatch(t,{backgroundColor:`var(--q-${t})`}))}
      {SHADOW_TOKENS.map(t=>swatch(t,{boxShadow:`var(--q-${t})`}))}
      {FONT_SIZE_TOKENS.map(t=>swatch(t,{fontSize:`var(--q-${t})`}))}
      {RADIUS_TOKENS.map(t=>swatch(t,{borderRadius:`var(--q-${t})`}))}
      {swatch('title-tracking',{fontSize:'var(--q-text-title)',letterSpacing:'var(--q-title-tracking)'})}
      {swatch('font-sans',{fontFamily:'var(--q-font-sans)'})}
      {swatch('font-mono',{fontFamily:'var(--q-font-mono)'})}
      {swatch('page-padding',{padding:'var(--q-page-padding)',width:0,height:0})}
      {swatch('rail-width',{width:'var(--q-rail-width)'})}
      {swatch('control-height',{height:'var(--q-control-height)'})}
      {swatch('header-button',{height:'var(--q-header-button)'})}
      {swatch('picker-height',{height:'var(--q-picker-height)'})}
    </section>

    <section data-testid="header" style={section}>
      <PageHeader title="Quotes" right={<>
        <Dropdown open={caution} onOpenChange={setCaution} title="3 need your attention"
          trigger={<HeaderIconButton tone="caution" icon="caution" label="Needs attention, 2 items" open={caution}/>}>
          <DropdownItem title="Q-24790" tag="Overdue" tone="problem" onSelect={()=>setCaution(false)}>Dana Ortiz asked to move pickup to Ogden.</DropdownItem>
          <DropdownItem title="Q-24817" tag="Overdue" tone="problem" onSelect={()=>setCaution(false)}>Draft has 1 line below the margin floor.</DropdownItem>
          <DropdownItem title="Q-24789" tag="Aging" tone="problem" onSelect={()=>setCaution(false)}>Sent Oct 6, no reply yet.</DropdownItem>
        </Dropdown>
        <Dropdown open={bell} onOpenChange={setBell} title="Notifications"
          trigger={<HeaderIconButton tone="bell" icon="bell" label="Notifications" open={bell}/>}>
          <DropdownItem title="Dana Ortiz replied on Q-24790" onSelect={()=>setBell(false)}>Oct 9, 4:12 PM</DropdownItem>
          <DropdownItem title="Q-24763 accepted by Canyon Ridge" onSelect={()=>setBell(false)}>Sep 21, 9:40 AM</DropdownItem>
          <DropdownItem title="Q-24815 expired" onSelect={()=>setBell(false)}>Sep 18</DropdownItem>
        </Dropdown>
      </>}>
        <CustomerPicker customers={CUSTOMERS} value={customer} onChange={setCustomer}/>
        <FilterButton<QuoteFilters> title="Filter quotes" value={filters} empty={NONE} count={0} onApply={setFilters}>
          {(draft,set)=><>
            <FilterGroup label="Status" columns={2}>
              {STATUSES.map(st=><FilterCheckbox key={st} label={st} checked={draft.statuses.includes(st)}
                onChange={c=>set({...draft,statuses:c?[...draft.statuses,st]:draft.statuses.filter(x=>x!==st)})}/>)}
            </FilterGroup>
            <FilterSpacer height={8}/>
            <FilterField label="Rep">{id=><Select label="Rep" labelledBy={id} value={draft.rep} onChange={rep=>set({...draft,rep})}
              options={[{value:'',label:'All reps'},{value:'brandi',label:'Brandi Gallegos'},{value:'mara',label:'Mara Jensen'}]}/>}</FilterField>
            <FilterField label="Customer">{id=><Select label="Customer" labelledBy={id} value={draft.customer} onChange={c=>set({...draft,customer:c})}
              options={[{value:'',label:'Any customer'},...CUSTOMERS.slice(0,3).map(c=>({value:c.id,label:c.name}))]}/>}</FilterField>
            <FilterPair>
              <FilterField label="Requested from">{id=><FilterInput type="date" aria-label="Requested from" aria-describedby={id}/>}</FilterField>
              <FilterField label="Requested to">{id=><FilterInput type="date" aria-label="Requested to" aria-describedby={id}/>}</FilterField>
            </FilterPair>
            <FilterGroup label="Only show" labelMargin="2px 0">
              {ONLY.map(o=><FilterCheckbox key={o} label={o} checked={draft.only.includes(o)}
                onChange={c=>set({...draft,only:c?[...draft.only,o]:draft.only.filter(x=>x!==o)})}/>)}
            </FilterGroup>
          </>}
        </FilterButton>
      </PageHeader>
    </section>

    <section data-testid="applied" style={section}>
      <FilterButton<string[]> title="Filter customers" value={['brandi']} empty={[]} count={1} width={400} onApply={()=>{}}>
        {(draft,set)=><FilterGroup label="Rep"><FilterCheckbox label="Brandi Gallegos" checked={draft.includes('brandi')} onChange={c=>set(c?['brandi']:[])}/></FilterGroup>}
      </FilterButton>
    </section>

    <section data-testid="table" style={section}>
      <DataTable<Row> tableId={tableId} label="Quotes" columns={COLUMNS} rows={ROWS} rowKey={r=>r.id} pageSize={13} minWidth={880} divider="soft"
        moreLabel={n=>`Show ${n} more quotes`} lessLabel="Show fewer quotes" initialPrefs={prefs} onPrefsChange={persist?undefined:()=>{}}/>
    </section>

    <section data-testid="lanes" style={section}>
      <LaneRow ids={lanes.map(l=>l[0])} label="Board columns" onMove={(from,to)=>setLanes(l=>{const n=[...l];const [x]=n.splice(from,1);n.splice(to,0,x);return n;})}>
        {lane=><Lane key={lane.id} {...lane} label={lane.id} count={lanes.find(l=>l[0]===lane.id)![1]}/>}
      </LaneRow>
    </section>

    <section data-testid="toggles" style={section}>
      <Toggle label="On" checked={on} onChange={setOn}/>
      <Toggle label="Off" checked={off} onChange={setOff}/>
    </section>

    <section data-testid="sheet" style={section}>
      <button type="button" onClick={()=>setSheet(true)}>Open sheet</button>
      <Sheet open={sheet} title="Q-24790" subtitle="Wasatch Mechanical Contractors" onClose={()=>setSheet(false)}/>
    </section>
  </div>;
}
