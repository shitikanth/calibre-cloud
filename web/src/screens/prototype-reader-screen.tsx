// PROTOTYPE (throwaway): opens an EPUB with foliate-js or a PDF with pdf.js from a Blob,
// under the deployed CSP, and reports what happens. Not production code.
import { useEffect, useRef, useState } from 'react';
import { getEntries, log, subscribe, watchViolations, type Entry } from '../prototype/log.ts';
import type { FoliateView, Location, TocItem } from 'foliate-js/view.js';

type Opened = { kind: 'epub'; name: string } | { kind: 'pdf'; name: string; pages: number } | undefined;

export function PrototypeReaderScreen() {
  const [opened, setOpened] = useState<Opened>(undefined);
  const [file, setFile] = useState<File | undefined>(undefined);

  return (
    <section className="flex h-[calc(100vh-3rem)] flex-col gap-2">
      <h1 className="text-xl font-semibold">Reader prototype</h1>
      <input
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        data-testid="file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          log('open', `${f.name} (${f.size} bytes)`);
          setOpened(undefined);
          setFile(f);
        }}
      />
      {file && (file.name.endsWith('.pdf') ? <PdfReader file={file} onOpened={setOpened} /> : <EpubReader file={file} onOpened={setOpened} />)}
      <Log opened={opened} />
    </section>
  );
}

function EpubReader({ file, onOpened }: { file: File; onOpened: (o: Opened) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | undefined>(undefined);
  const [loc, setLoc] = useState<Location | undefined>(undefined);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [flow, setFlow] = useState<'paginated' | 'scrolled'>('paginated');
  const [fontSize, setFontSize] = useState(100);
  const [cfiInput, setCfiInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    (async () => {
      const t0 = performance.now();
      await import('foliate-js/view.js');
      const view = document.createElement('foliate-view') as FoliateView;
      view.style.cssText = 'display:block;width:100%;height:100%';
      view.addEventListener('relocate', (e) => {
        const d = (e as CustomEvent<Location>).detail;
        setLoc(d);
        window.__proto.state['cfi'] = d.cfi;
        window.__proto.state['fraction'] = d.fraction;
      });
      view.addEventListener('load', (e) => {
        const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
        watchViolations(doc, `section ${index}`);
        doc.defaultView?.addEventListener('error', (ev) => log('error', `section ${index}: ${ev.message}`));
        const inline = doc.getElementById('inline-js');
        if (inline) log('script', `section ${index}: #inline-js = "${inline.textContent}"`);
        const scripts = doc.querySelectorAll('script');
        if (scripts.length) log('script', `section ${index}: ${scripts.length} <script> element(s) in document, src=${[...scripts].map((s) => s.src || '(inline)').join(', ')}`);
        const onclick = doc.querySelector<HTMLElement>('[onclick]');
        if (onclick) {
          doc.defaultView!.alert = () => log('script', `section ${index}: alert() RAN from onclick`);
          onclick.click();
          log('script', `section ${index}: clicked [onclick] element`);
        }
        window.__proto.state['sectionLoaded'] = index;
      });
      el.replaceChildren(view);
      viewRef.current = view;
      try {
        await view.open(file);
        if (cancelled) return;
        await view.init({ showTextStart: true });
        view.renderer.setAttribute('flow', 'paginated');
        setToc(view.book.toc ?? []);
        log('epub', `opened in ${Math.round(performance.now() - t0)} ms; renderer=${view.renderer.tagName.toLowerCase()}; toc=${view.book.toc?.length ?? 0}`);
        window.__proto.state['opened'] = 'epub';
        onOpened({ kind: 'epub', name: file.name });
      } catch (err) {
        log('error', `epub open failed: ${String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      viewRef.current?.close();
    };
  }, [file, onOpened]);

  const setFlowAttr = (f: 'paginated' | 'scrolled') => {
    setFlow(f);
    viewRef.current?.renderer.setAttribute('flow', f);
    log('epub', `flow=${f}`);
  };
  const applyFont = (pct: number) => {
    setFontSize(pct);
    viewRef.current?.renderer.setStyles?.(`html { font-size: ${pct}% !important; }`);
    log('epub', `font-size=${pct}%`);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      <div className="flex w-56 shrink-0 flex-col gap-1 overflow-auto text-sm">
        <div className="flex gap-1">
          <button type="button" className="rounded border px-2" onClick={() => void viewRef.current?.prev()}>Prev</button>
          <button type="button" className="rounded border px-2" onClick={() => void viewRef.current?.next()}>Next</button>
          <button type="button" className="rounded border px-2" data-testid="flow" onClick={() => setFlowAttr(flow === 'paginated' ? 'scrolled' : 'paginated')}>{flow}</button>
        </div>
        <div className="flex gap-1">
          <button type="button" className="rounded border px-2" onClick={() => applyFont(fontSize - 10)}>A-</button>
          <button type="button" className="rounded border px-2" onClick={() => applyFont(fontSize + 10)}>A+</button>
          <span>{fontSize}%</span>
        </div>
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void viewRef.current?.goTo(cfiInput).then(() => log('epub', `goTo(${cfiInput})`)); }}>
          <input className="min-w-0 flex-1 border px-1" placeholder="CFI" value={cfiInput} onChange={(e) => setCfiInput(e.target.value)} data-testid="cfi" />
          <button type="submit" className="rounded border px-2">Go</button>
        </form>
        <p className="break-all text-xs">cfi: <span data-testid="current-cfi">{loc?.cfi}</span></p>
        <p className="text-xs">{loc ? `${Math.round(loc.fraction * 100)}% · section ${loc.section?.current ?? '?'}/${loc.section?.total ?? '?'} · ${loc.tocItem?.label ?? ''}` : 'no location yet'}</p>
        <ul className="text-xs">
          {toc.map((item) => (
            <li key={item.href}><button type="button" className="text-left underline" onClick={() => void viewRef.current?.goTo(item.href)}>{item.label}</button></li>
          ))}
        </ul>
      </div>
      <div ref={host} className="min-h-0 min-w-0 flex-1 border" data-testid="epub-host" />
    </div>
  );
}

function PdfReader({ file, onOpened }: { file: File; onOpened: (o: Opened) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentProxy | undefined>(undefined);
  const taskRef = useRef<{ destroy(): Promise<void> } | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const tImport = performance.now();
      try {
        const data = await file.arrayBuffer();
        const tRead = performance.now();
        const task = pdfjs.getDocument({ data });
        taskRef.current = task;
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        setPages(doc.numPages);
        log('pdf', `import ${Math.round(tImport - t0)} ms, arrayBuffer ${Math.round(tRead - tImport)} ms, getDocument ${Math.round(performance.now() - tRead)} ms; ${doc.numPages} pages; worker=${workerUrl}`);
        window.__proto.state['opened'] = 'pdf';
        window.__proto.state['pages'] = doc.numPages;
        onOpened({ kind: 'pdf', name: file.name, pages: doc.numPages });
      } catch (err) {
        log('error', `pdf open failed: ${String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      void taskRef.current?.destroy();
    };
  }, [file, onOpened]);

  useEffect(() => {
    const doc = docRef.current;
    const c = canvas.current;
    if (!doc || !c || !pages) return;
    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      const p = await doc.getPage(page);
      const viewport = p.getViewport({ scale: scale * devicePixelRatio });
      c.width = viewport.width;
      c.height = viewport.height;
      c.style.width = `${viewport.width / devicePixelRatio}px`;
      const task = p.render({ canvas: c, viewport });
      await task.promise;
      if (cancelled) return;
      log('pdf', `page ${page} @${scale}x rendered in ${Math.round(performance.now() - t0)} ms`);
      window.__proto.state['page'] = page;
      window.__proto.state['rendered'] = (Number(window.__proto.state['rendered']) || 0) + 1;
    })().catch((err) => log('error', `pdf render failed: ${String(err)}`));
    return () => { cancelled = true; };
  }, [page, pages, scale]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex gap-1 text-sm">
        <button type="button" className="rounded border px-2" data-testid="pdf-prev" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
        <button type="button" className="rounded border px-2" data-testid="pdf-next" onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
        <span>{page} / {pages}</span>
        <button type="button" className="rounded border px-2" onClick={() => setScale((s) => s / 1.25)}>−</button>
        <button type="button" className="rounded border px-2" data-testid="pdf-zoom-in" onClick={() => setScale((s) => s * 1.25)}>+</button>
        <span>{Math.round(scale * 100)}%</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto border"><canvas ref={canvas} /></div>
    </div>
  );
}

function Log({ opened }: { opened: Opened }) {
  const [entries, setEntries] = useState<Entry[]>(() => [...getEntries()]);
  useEffect(() => {
    const unsubscribe = subscribe(() => setEntries([...getEntries()]));
    return () => void unsubscribe();
  }, []);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <details open className="max-h-48 shrink-0 overflow-auto border p-1 text-xs">
      <summary>
        log ({entries.length}) · {opened ? `${opened.kind}: ${opened.name}` : 'nothing open'} · {mem ? `heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'no performance.memory'}
      </summary>
      <pre data-testid="log">{entries.map((e) => `${e.t}\t${e.kind}\t${e.text}`).join('\n')}</pre>
    </details>
  );
}
