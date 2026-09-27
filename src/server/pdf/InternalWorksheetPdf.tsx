import 'server-only';
import {Document,Page,StyleSheet,Text,View,renderToBuffer} from '@react-pdf/renderer';
import {Closing,INK,Letterhead,MUTED,PageFooter,Parties,RULE,Totals,s} from './layout';
import type {WorksheetModel} from './worksheet';

// The rep's internal worksheet (task 4.2, spec §6.7): the customer quote's frame (./layout) with
// the rep's columns and panels added, under a CONFIDENTIAL — INTERNAL banner on every page. It
// prints the model and nothing else (see ./worksheet). Black and white like the quote, with one
// red for the banner and below-floor lines, as the quote screen warns in red.

const RED='#a3191c';

const w=StyleSheet.create({
  page:{paddingTop:52},
  banner:{position:'absolute',top:16,left:48,right:48,flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:RED,color:'#ffffff',paddingVertical:4,paddingHorizontal:8},
  // Wider letter spacing reads as "C O N F I D E N T I A L" to pdf.js, and to search and copy.
  bannerTitle:{fontFamily:'Helvetica-Bold',fontSize:9.5,lineHeight:1.2,letterSpacing:0.4},
  bannerNote:{fontSize:7.5,lineHeight:1.2},
  table:{marginTop:16,fontSize:8},
  tr:{paddingTop:5,paddingBottom:4,borderBottomWidth:0.5,borderBottomColor:RULE},
  row:{flexDirection:'row'},
  cNo:{width:14},
  cSku:{width:68,paddingRight:4,fontFamily:'Courier',fontSize:7.5},
  cDesc:{flex:1,paddingRight:6},
  cQty:{width:26,textAlign:'right',paddingRight:4},
  cPrice:{width:46,textAlign:'right'},
  cExt:{width:50,textAlign:'right'},
  cBasis:{width:48,paddingLeft:8,marginLeft:6,borderLeftWidth:0.5,borderLeftColor:RULE},
  cCost:{width:40,textAlign:'right'},
  cMargin:{width:40,textAlign:'right'},
  cFloor:{width:32,textAlign:'right'},
  pack:{color:MUTED,fontSize:7.5},
  below:{fontFamily:'Helvetica-Bold',color:RED},
  // Under the description: # (14) + SKU (68).
  sub:{marginLeft:82,marginTop:3,fontSize:7.5,lineHeight:1.35,color:MUTED},
  warning:{fontFamily:'Helvetica-Bold',color:RED},
  whyLabel:{fontFamily:'Helvetica-Bold',color:INK},
  quoteNote:{marginBottom:10},
  profit:{width:190,marginTop:3},
  panels:{flexDirection:'row',justifyContent:'space-between',marginTop:18,paddingTop:10,borderTopWidth:0.5,borderTopColor:INK},
  panel:{flex:1,paddingRight:14},
  panelLast:{flex:1},
  kv:{flexDirection:'row',justifyContent:'space-between',paddingVertical:1.5,borderBottomWidth:0.5,borderBottomColor:RULE},
  kvLabel:{color:MUTED},
  note:{marginBottom:5},
  noteMeta:{fontSize:7,color:MUTED},
  check:{marginBottom:2},
  asOf:{marginTop:12,fontFamily:'Helvetica-Oblique',fontSize:7,lineHeight:1.35,color:MUTED},
});

function Line({line:l}:{line:WorksheetModel['lines'][number]}){
  return <View style={w.tr} wrap={false}>
    <View style={w.row}>
      <Text style={w.cNo}>{l.no}</Text>
      <Text style={w.cSku}>{l.sku}</Text>
      <View style={w.cDesc}><Text>{l.description}</Text><Text style={w.pack}>{l.unit}{l.category?`  ·  ${l.category}`:''}</Text></View>
      <Text style={w.cQty}>{l.qty}</Text>
      <Text style={w.cPrice}>{l.unitPrice}</Text>
      <Text style={w.cExt}>{l.extended}</Text>
      <Text style={w.cBasis}>{l.basis}</Text>
      <Text style={w.cCost}>{l.cost}</Text>
      <Text style={l.belowFloor?[w.cMargin,w.below]:w.cMargin}>{l.margin}</Text>
      <Text style={w.cFloor}>{l.floor}</Text>
    </View>
    <View style={w.sub}>
      {l.warning?<Text style={w.warning}>{l.warning}</Text>:null}
      <Text>{l.facts.join('  ')}</Text>
      {l.why?<Text><Text style={w.whyLabel}>Why this price? </Text>{l.why}</Text>:null}
    </View>
  </View>;
}

function KeyValues({rows}:{rows:readonly {label:string;value:string}[]}){
  return <>{rows.map(r=><View key={r.label} style={w.kv}><Text style={w.kvLabel}>{r.label}</Text><Text>{r.value}</Text></View>)}</>;
}

export function InternalWorksheetPdf({model:m}:{model:WorksheetModel}){
  const f=m.frame;
  return <Document title={m.title} author={f.supplier.name} subject={`Internal worksheet for ${f.customer.name}`} creator={f.footer.via} producer={f.supplier.name} keywords="confidential, internal" language="en-US">
    <Page size="LETTER" style={[s.page,w.page]}>
      <View style={w.banner} fixed>
        <Text style={w.bannerTitle}>{m.banner.title}</Text>
        <Text style={w.bannerNote}>{m.banner.note}</Text>
      </View>

      <View style={s.content}>
      <Letterhead supplier={f.supplier} title="QUOTE WORKSHEET" reference={`${f.quote.number}  ·  ${f.quote.revision}`} stamps={m.stamps}/>

      <View style={s.heavyRule}/>

      <Parties model={f}/>

      <View style={w.table}>
        <View style={[s.th,w.row]}>
          <Text style={[s.thText,w.cNo]}>#</Text>
          <Text style={[s.thText,w.cSku,{fontFamily:'Helvetica-Bold',fontSize:7}]}>SKU</Text>
          <Text style={[s.thText,w.cDesc]}>Description</Text>
          <Text style={[s.thText,w.cQty]}>Qty</Text>
          <Text style={[s.thText,w.cPrice]}>Unit price</Text>
          <Text style={[s.thText,w.cExt]}>Extended</Text>
          <Text style={[s.thText,w.cBasis]}>Basis</Text>
          <Text style={[s.thText,w.cCost]}>Cost</Text>
          <Text style={[s.thText,w.cMargin]}>Margin</Text>
          <Text style={[s.thText,w.cFloor]}>Floor</Text>
        </View>
        {m.lines.map(line=><Line key={line.no} line={line}/>)}
      </View>

      <View style={s.summary} wrap={false}>
        <View style={s.noteCol}>
          {f.note?<View style={w.quoteNote}><Text style={s.label}>Note</Text><Text>{f.note}</Text></View>:null}
          <View style={w.profit}>
            <Text style={s.label}>Profit (internal)</Text>
            <KeyValues rows={m.profit}/>
          </View>
        </View>
        <Totals rows={f.totals}/>
      </View>

      <View style={w.panels} wrap={false}>
        {m.credit?<View style={w.panel}>
          <Text style={s.label}>Account and credit</Text>
          <KeyValues rows={m.credit.rows}/>
          {m.credit.warning?<Text style={[w.warning,{marginTop:3}]}>{m.credit.warning}</Text>:null}
        </View>:null}
        <View style={m.checks?w.panel:w.panelLast}>
          <Text style={s.label}>Internal notes</Text>
          {m.notes.length?m.notes.map((n,i)=><View key={i} style={w.note}><Text>{n.body}</Text><Text style={w.noteMeta}>{n.meta}</Text></View>):<Text>None.</Text>}
        </View>
        {m.checks?<View style={w.panelLast}>
          <Text style={s.label}>Before sending</Text>
          {m.checks.map(c=><Text key={c} style={w.check}>{c}</Text>)}
        </View>:null}
      </View>

      <Text style={w.asOf}>{m.asOf}</Text>

      <Closing model={f}/>
      </View>

      <PageFooter left={m.footer.left} middle={m.footer.middle}/>
    </Page>
  </Document>;
}

/** Renders the internal worksheet PDF to bytes. */
export async function renderInternalWorksheetPdf(model:WorksheetModel):Promise<Uint8Array>{
  return new Uint8Array(await renderToBuffer(<InternalWorksheetPdf model={model}/>));
}
