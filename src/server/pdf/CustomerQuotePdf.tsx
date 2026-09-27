import 'server-only';
import {Document,Page,Text,View,renderToBuffer} from '@react-pdf/renderer';
import {Closing,Letterhead,PageFooter,Parties,Totals,s} from './layout';
import type {CustomerPdfModel} from './model';

// The customer quote (task 4.1, spec §6.7): formal and black and white, like a quote from an
// established distributor. It prints the model and nothing else (see ./model), in the frame the
// quote PDFs share (./layout).

export function CustomerQuotePdf({model:m}:{model:CustomerPdfModel}){
  return <Document title={m.title} author={m.supplier.name} subject={`Quotation for ${m.customer.name}`} creator={m.footer.via} producer={m.supplier.name} language="en-US">
    <Page size="LETTER" style={s.page}>
      <View style={s.content}>
      <Letterhead supplier={m.supplier} title="QUOTATION" reference={`${m.quote.number}  ·  ${m.quote.revision}`}
        stamps={m.draft?['Draft preview · not sent',m.footer.sample]:[m.footer.sample]}/>

      <View style={s.heavyRule}/>

      <Parties model={m}/>

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

      <Closing model={m}/>
      </View>

      <PageFooter left={m.footer.left} middle={m.footer.via}/>
    </Page>
  </Document>;
}

/** Renders the customer quote PDF to bytes. */
export async function renderCustomerQuotePdf(model:CustomerPdfModel):Promise<Uint8Array>{
  return new Uint8Array(await renderToBuffer(<CustomerQuotePdf model={model}/>));
}
