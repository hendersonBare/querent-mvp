import 'server-only';
import {Font,StyleSheet,Text,View} from '@react-pdf/renderer';
import type {CustomerPdfModel} from './model';

// The frame every quote PDF shares (tasks 4.1 and 4.2): letterhead, parties, totals, terms and
// rep, footer. Formal and black and white, like a quote from an established distributor. It
// prints what it is given and nothing else, and imports no data code, so the customer PDF can
// use it (src/server/pdf/boundary.test.ts). Built-in PDF fonts only (Helvetica, Courier), so
// rendering needs no font files or network.

// Whole words only: a hyphenated "yel-low" would read badly and break text search in the PDF.
Font.registerHyphenationCallback(word=>[word]);

export const INK='#000000',MUTED='#4d4d4d',RULE='#b3b3b3';

// No lineHeight on the Page: react-pdf 4 then drops `render` texts (the page number) and resolves
// the inherited multiple against the page's 9pt, squashing larger text. It is set on the content
// wrapper instead (with its own fontSize: a View resolves the multiple against its own size, 18pt
// by default), and on each larger text style.
export const s=StyleSheet.create({
  page:{paddingTop:44,paddingBottom:64,paddingHorizontal:48,fontFamily:'Helvetica',fontSize:9,color:INK},
  content:{fontSize:9,lineHeight:1.35},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  brand:{flexDirection:'row'},
  logo:{width:46,height:46,borderWidth:1.25,borderColor:INK,alignItems:'center',justifyContent:'center',marginRight:12},
  logoMark:{fontFamily:'Times-Bold',fontSize:26,lineHeight:1},
  company:{fontFamily:'Helvetica-Bold',fontSize:14.5,lineHeight:1.2,letterSpacing:0.3,marginBottom:3},
  headRight:{alignItems:'flex-end'},
  stamps:{flexDirection:'row',marginBottom:8},
  stamp:{borderWidth:0.75,borderColor:INK,paddingVertical:1.5,paddingHorizontal:5,fontFamily:'Helvetica-Bold',fontSize:6.5,lineHeight:1.2,letterSpacing:0.4,textTransform:'uppercase',marginLeft:4},
  docTitle:{fontFamily:'Helvetica-Bold',fontSize:19,lineHeight:1.15,letterSpacing:1},
  docRef:{fontSize:10,lineHeight:1.3,marginTop:3},
  heavyRule:{borderBottomWidth:1.5,borderBottomColor:INK,marginTop:14,marginBottom:14},
  parties:{flexDirection:'row',justifyContent:'space-between'},
  partyCol:{width:'48%'},
  label:{fontFamily:'Helvetica-Bold',fontSize:7,letterSpacing:0.4,textTransform:'uppercase',color:MUTED,marginBottom:4},
  strong:{fontFamily:'Helvetica-Bold'},
  customerName:{fontFamily:'Helvetica-Bold',fontSize:10.5,lineHeight:1.3,marginBottom:1},
  block:{marginBottom:12},
  detailRow:{flexDirection:'row',paddingVertical:1.5,borderBottomWidth:0.5,borderBottomColor:RULE},
  detailLabel:{width:84,color:MUTED},
  detailValue:{flex:1},
  table:{marginTop:18},
  tr:{flexDirection:'row',paddingVertical:5,borderBottomWidth:0.5,borderBottomColor:RULE},
  th:{flexDirection:'row',paddingVertical:4,borderTopWidth:1,borderTopColor:INK,borderBottomWidth:1,borderBottomColor:INK},
  thText:{fontFamily:'Helvetica-Bold',fontSize:7,letterSpacing:0.4,textTransform:'uppercase'},
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
  grandText:{fontFamily:'Helvetica-Bold',fontSize:11.5,lineHeight:1.3},
  closing:{flexDirection:'row',justifyContent:'space-between',marginTop:22,paddingTop:12,borderTopWidth:0.5,borderTopColor:INK},
  footer:{position:'absolute',left:48,right:48,bottom:28,flexDirection:'row',justifyContent:'space-between',paddingTop:6,borderTopWidth:0.5,borderTopColor:INK,fontSize:7,color:MUTED},
});

/** Herrick's letterhead on the left; the document title, its reference and small stamps on the right. */
export function Letterhead({supplier,title,reference,stamps}:{supplier:CustomerPdfModel['supplier'];title:string;reference:string;stamps:readonly string[]}){
  return <View style={s.header}>
    <View style={s.brand}>
      {/* Logo placeholder: Herrick's mark goes here once supplied. */}
      <View style={s.logo}><Text style={s.logoMark}>H</Text></View>
      <View>
        <Text style={s.company}>{supplier.name}</Text>
        {supplier.branch?<Text>{supplier.branch}</Text>:null}
        {supplier.address.map(line=><Text key={line}>{line}</Text>)}
        <Text>Phone {supplier.phone}{supplier.website?`  ·  ${supplier.website}`:''}</Text>
      </View>
    </View>
    <View style={s.headRight}>
      <View style={s.stamps}>
        {stamps.map(stamp=><Text key={stamp} style={s.stamp}>{stamp}</Text>)}
      </View>
      <Text style={s.docTitle}>{title}</Text>
      <Text style={s.docRef}>{reference}</Text>
    </View>
  </View>;
}

/** Quote for (customer, attention, account) and pickup or delivery on the left; the quote details on the right. */
export function Parties({model:m}:{model:Pick<CustomerPdfModel,'customer'|'fulfillment'|'details'>}){
  return <View style={s.parties}>
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
  </View>;
}

/** Subtotal, freight, sales tax and the total (the `strong` row). */
export function Totals({rows}:{rows:CustomerPdfModel['totals']}){
  return <View style={s.totals}>
    {rows.map(row=>row.strong
      ?<View key={row.label} style={s.grandRow}><Text style={s.grandText}>{row.label}</Text><Text style={s.grandText}>{row.value}</Text></View>
      :<View key={row.label} style={s.totalRow}>
        <View><Text>{row.label}</Text>{row.detail?<Text style={s.totalDetail}>{row.detail}</Text>:null}</View>
        <Text>{row.value}</Text>
      </View>)}
  </View>;
}

/** Terms and conditions, and the customer's sales rep with their contact. */
export function Closing({model:m}:{model:Pick<CustomerPdfModel,'terms'|'rep'|'supplier'>}){
  return <View style={s.closing} wrap={false}>
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
  </View>;
}

/** On every page: the document reference, the middle mark ("via Querent") and "Page n of N". */
export function PageFooter({left,middle}:{left:string;middle:string}){
  return <View style={s.footer} fixed>
    <Text>{left}</Text>
    <Text>{middle}</Text>
    <Text render={({pageNumber,totalPages})=>`Page ${pageNumber} of ${totalPages}`}/>
  </View>;
}
