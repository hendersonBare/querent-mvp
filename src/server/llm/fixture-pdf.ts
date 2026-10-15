import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

// A tiny, valid, single-page PDF writer for tests and fixtures (no dependencies). The committed
// sample list (SAMPLE_LIST_PDF_PATH) is buildFixturePdf(SAMPLE_LIST_LINES); its parse fixture lives
// in fixtures/pdf, keyed by its sha256. Regenerate it with:
//   npx tsx -e "import('./src/server/llm/fixture-pdf.ts').then(m=>m.writeSamplePdf())"

export const SAMPLE_LIST_PDF_PATH='test/fixtures/sample-list.pdf';

/** A Uline-style purchase order: header, address and total lines around four product lines. */
export const SAMPLE_LIST_LINES=[
  'Acme Fulfillment - Purchase Order PO-1042',
  'Ship to: 100 Main Street, Springfield',
  'Item     Description     Qty     Unit price',
  'S-4128   12 x 10 x 8" Corrugated Boxes, 32 ECT     10 bundles     $1.10',
  'S-1734   Cast Stretch Wrap 18" x 1500\' 80 Gauge     4 rolls     $24.00',
  'S-5467   Reclosable Poly Bags 30 x 30" 2 Mil     2 cases     $89.00',
  'H-1180   Kraft Packing Paper Roll 36"     as needed',
  'Subtotal: $296.00',
];

/** PDF string literal escaping; characters outside Latin-1 become "?". */
function pdfString(text:string):string{
  return `(${text.replace(/[^\x20-\xff]/g,'?').replace(/[\\()]/g,c=>`\\${c}`)})`;
}

/** One Letter page with each line in Helvetica 11pt, top to bottom. Deterministic: no dates or ids. */
export function buildFixturePdf(lines:string[]):Uint8Array{
  const stream=['BT','/F1 11 Tf','14 TL','56 740 Td',...lines.map(line=>`${pdfString(line)} Tj T*`),'ET'].join('\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let out='%PDF-1.4\n';
  const offsets:number[]=[];
  objects.forEach((body,i)=>{
    offsets.push(Buffer.byteLength(out,'latin1'));
    out+=`${i+1} 0 obj\n${body}\nendobj\n`;
  });
  const xref=Buffer.byteLength(out,'latin1');
  out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}`;
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out,'latin1'));
}

/** Writes the committed sample list PDF (run from the repository root). */
export function writeSamplePdf(root=process.cwd()){
  writeFileSync(join(root,SAMPLE_LIST_PDF_PATH),buildFixturePdf(SAMPLE_LIST_LINES));
}
