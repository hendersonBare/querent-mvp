// Draws the customer quote PDF (task 4.1) into the preview modal, one canvas per page, with pdf.js
// (unpdf's build, which needs no worker file). The browser's own PDF viewer isn't used: headless
// browsers and phones (Android Chrome, iOS Safari in a frame) have none that works inline, and
// spec §3 asks for the PDF rendered inline at every width. The library loads on first use, so the
// chat doesn't pay for it until a quote is opened.

/** Pixels per PDF point: enough for a sharp page at the modal's width on a high-density screen, capped for memory. */
export function renderScale(devicePixelRatio=1){
  return Math.min(3,Math.max(1.5,devicePixelRatio*1.35));
}

export interface RenderedPdf {pages:number;
  /** Each page's text, in order: read to screen readers in place of the canvases. */
  text:string[]}

/**
 * Renders `data` into `into` (which it empties first), a canvas per page, stopping early once
 * `cancelled()` says the modal moved on. Throws when the bytes aren't a readable PDF.
 */
export async function renderPdf(data:Uint8Array,into:HTMLElement,{scale=renderScale(),cancelled=()=>false}:{scale?:number;cancelled?:()=>boolean}={}):Promise<RenderedPdf>{
  const {getDocumentProxy}=await import('unpdf');
  const pdf=await getDocumentProxy(data);
  try{
    into.replaceChildren();
    const text:string[]=[];
    for(let n=1;n<=pdf.numPages&&!cancelled();n++){
      const page=await pdf.getPage(n);
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      canvas.className='qp-sheet';
      canvas.dataset.page=String(n);
      canvas.setAttribute('aria-hidden','true');
      into.append(canvas);
      await page.render({canvas,viewport}).promise;
      const content=await page.getTextContent();
      text.push(content.items.map(item=>'str' in item?item.str:'').join(' ').replace(/\s+/g,' ').trim());
      page.cleanup();
    }
    return {pages:pdf.numPages,text};
  }finally{
    await pdf.loadingTask.destroy();
  }
}
