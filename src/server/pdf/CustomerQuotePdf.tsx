import 'server-only';
import {Document,Font,Page,StyleSheet,Text,View,renderToBuffer} from '@react-pdf/renderer';
import type {CustomerPdfModel} from './model';

// The customer quote (task 4.1, spec §6.7): formal and black and white, like a quote from an
// established distributor. It prints the model and nothing else (see ./model). Built-in PDF fonts
// only (Helvetica, Courier), so rendering needs no font files or network.

// Whole words only: a hyphenated "yel-low" would read badly and break text search in the PDF.
Font.registerHyphenationCallback(word=>[word]);

const INK='#000000',MUTED='#4d4d4d',RULE='#b3b3b3';

const s=StyleSheet.create({
  page:{paddingTop:44,paddingBottom:64,paddingHorizontal:48,fontFamily:'Helvetica',fontSize:9,color:INK,lineHeight:1.35},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  brand:{flexDirection:'row'},
  logo:{width:46,height:46,borderWidth:1.25,borderColor:INK,alignItems:'center',justifyContent:'center',marginRight:12},
  logoMark:{fontFamily:'Times-Bold',fontSize:26,lineHeight:1},
  company:{fontFamily:'Helvetica-Bold',fontSize:14.5,letterSpacing:0.3,marginBottom:3},
  headRight:{alignItems:'flex-end'},
  stamps:{flexDirection:'row',marginBottom:8},
  stamp:{borderWidth:0.75,borderColor:INK,paddingVertical:1.5,paddingHorizontal:5,fontFamily:'Helvetica-Bold',fontSize:6.5,letterSpacing:1,textTransform:'uppercase',marginLeft:4},
  docTitle:{fontFamily:'Helvetica-Bold',fontSize:19,letterSpacing:2.5},
  docRef:{fontSize:10,marginTop:2},
  heavyRule:{borderBottomWidth:1.5,borderBottomColor:INK,marginTop:14,marginBottom:14},
  parties:{flexDirection:'row',justifyContent:'space-between'},
  partyCol:{width:'48%'},
  label:{fontFamily:'Helvetica-Bold',fontSize:7,letterSpacing:1.1,textTransform:'uppercase',color:MUTED,marginBottom:4},
  strong:{fontFamily:'Helvetica-Bold'},
  customerName:{fontFamily:'Helvetica-Bold',fontSize:10.5,marginBottom:1},
  block:{marginBottom:12},
  detailRow:{flexDirection:'row',paddingVertical:1.5,borderBottomWidth:0.5,borderBottomColor:RULE},
  detailLabel:{width:84,color:MUTED},
  detailValue:{flex:1},
  table:{marginTop:6},
  tr:{flexDirection:'row',paddingVertical:5,borderBottomWidth:0.5,borderBottomColor:RULE},
  th:{flexDirection:'row',paddingVertical:4,borderTopWidth:1,borderTopColor:INK,borderBottomWidth:1,borderBottomColor:INK},
  thText:{fontFamily:'Helvetica-Bold',fontSize:7,letterSpacing:0.9,textTransform:'uppercase'},
  cNo:{width:18},
  cSku:{width:86,paddingRight:6},
  cDesc:{flex:1,paddingRight:8},
  cQty:{width:36,textAlign:'right',paddingRight:8},
  cUnit:{width:66},
  cPrice:{width:60,textAlign:'right'},
  cExt:{width:66,textAlign:'right'},
  sku:{fontFamily:'Courier',fontSize:8.5},
  summary:{flexDirection:'row',justifyContent:'space-between',marginTop:14},
  noteCol:{width:'50%',paddingRight:16},
  totals:{width:236},
  totalRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:3},
  totalDetail:{fontSize:7.5,color:MUTED},
  grandRow:{flexDirection:'row',justifyContent:'space-between',marginTop:4,paddingTop:6,borderTopWidth:1.25,borderTopColor:INK},
  grandText:{fontFamily:'Helvetica-Bold',fontSize:11.5},
  closing:{flexDirection:'row',justifyContent:'space-between',marginTop:22,paddingTop:12,borderTopWidth:0.5,borderTopColor:INK},
  footer:{position:'absolute',left:48,right:48,bottom:28,flexDirection:'row',justifyContent:'space-between',paddingTop:6,borderTopWidth:0.5,borderTopColor:INK,fontSize:7,color:MUTED},
});

function Totals({rows}:{rows:CustomerPdfModel['totals']}){
  return <View style={s.totals}>
    {rows.map(row=>row.strong
      ?<View key={row.label} style={s.grandRow}><Text style={s.grandText}>{row.label}</Text><Text style={s.grandText}>{row.value}</Text></View>
      :<View key={row.label} style={s.totalRow}>
        <View><Text>{row.label}</Text>{row.detail?<Text style={s.totalDetail}>{row.detail}</Text>:null}</View>
        <Text>{row.value}</Text>
      </View>)}
  </View>;
}

export function CustomerQuotePdf({model:m}:{model:CustomerPdfModel}){
  return <Document title={m.title} author={m.supplier.name} subject={`Quotation for ${m.customer.name}`} creator={m.footer.via} producer={m.supplier.name} language="en-US">
    <Page size="LETTER" style={s.page}>
      <View style={s.header}>
        <View style={s.brand}>
          {/* Logo placeholder: Herrick's mark goes here once supplied. */}
          <View style={s.logo}><Text style={s.logoMark}>H</Text></View>
          <View>
            <Text style={s.company}>{m.supplier.name}</Text>
            {m.supplier.branch?<Text>{m.supplier.branch}</Text>:null}
            {m.supplier.address.map(line=><Text key={line}>{line}</Text>)}
            <Text>Phone {m.supplier.phone}{m.supplier.website?`  ·  ${m.supplier.website}`:''}</Text>
          </View>
        </View>
        <View style={s.headRight}>
          <View style={s.stamps}>
            {m.draft?<Text style={s.stamp}>Draft preview · not sent</Text>:null}
            <Text style={s.stamp}>{m.footer.sample}</Text>
          </View>
          <Text style={s.docTitle}>QUOTATION</Text>
          <Text style={s.docRef}>{m.quote.number}  ·  {m.quote.revision}</Text>
        </View>
      </View>

      <View style={s.heavyRule}/>

      <View style={s.parties}>
        <View style={s.partyCol}>
          <View style={s.block}>
            <Text style={s.label}>Quote for</Text>
            <Text style={s.customerName}>{m.customer.name}</Text>
            {m.customer.attention?<Text>{m.customer.attention}</Text>:null}
            <Text>{m.customer.account}</Text>
          </View>
          <View>
            <Text style={s.label}>{m.fulfillment.label}</Text>
            {m.fulfillment.lines.map((line,i)=><Text key={i}>{line}</Text>)}
          </View>
        </View>
        <View style={s.partyCol}>
          <Text style={s.label}>Quote details</Text>
          {m.details.map(d=><View key={d.label} style={s.detailRow}><Text style={s.detailLabel}>{d.label}</Text><Text style={s.detailValue}>{d.value}</Text></View>)}
        </View>
      </View>

      <View style={s.table}>
        <View style={s.th}>
          <Text style={[s.thText,s.cNo]}>#</Text>
          <Text style={[s.thText,s.cSku]}>SKU</Text>
          <Text style={[s.thText,s.cDesc]}>Description</Text>
          <Text style={[s.thText,s.cQty]}>Qty</Text>
          <Text style={[s.thText,s.cUnit]}>Unit</Text>
          <Text style={[s.thText,s.cPrice]}>Unit price</Text>
          <Text style={[s.thText,s.cExt]}>Extended</Text>
        </View>
        {m.lines.map(line=><View key={line.no} style={s.tr} wrap={false}>
          <Text style={s.cNo}>{line.no}</Text>
          <Text style={[s.sku,s.cSku]}>{line.sku}</Text>
          <Text style={s.cDesc}>{line.description}</Text>
          <Text style={s.cQty}>{line.qty}</Text>
          <Text style={s.cUnit}>{line.unit}</Text>
          <Text style={s.cPrice}>{line.unitPrice}</Text>
          <Text style={s.cExt}>{line.extended}</Text>
        </View>)}
      </View>

      <View style={s.summary} wrap={false}>
        <View style={s.noteCol}>
          {m.note?<><Text style={s.label}>Note</Text><Text>{m.note}</Text></>:null}
        </View>
        <Totals rows={m.totals}/>
      </View>

      <View style={s.closing} wrap={false}>
        <View style={s.partyCol}>
          <Text style={s.label}>Terms and conditions</Text>
          {m.terms.map(line=><Text key={line}>{line}</Text>)}
        </View>
        <View style={s.partyCol}>
          <Text style={s.label}>Your sales representative</Text>
          <Text style={s.strong}>{m.rep.name}</Text>
          {m.rep.title?<Text>{m.rep.title}, {m.supplier.name}</Text>:null}
          {m.rep.phone?<Text>{m.rep.phone}</Text>:null}
          {m.rep.email?<Text>{m.rep.email}</Text>:null}
        </View>
      </View>

      <View style={s.footer} fixed>
        <Text>{m.footer.left}</Text>
        <Text>{m.footer.via}</Text>
        <Text render={({pageNumber,totalPages})=>`Page ${pageNumber} of ${totalPages}`}/>
      </View>
    </Page>
  </Document>;
}

/** Renders the customer quote PDF to bytes. */
export async function renderCustomerQuotePdf(model:CustomerPdfModel):Promise<Uint8Array>{
  return new Uint8Array(await renderToBuffer(<CustomerQuotePdf model={model}/>));
}
