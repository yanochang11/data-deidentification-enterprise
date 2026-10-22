import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { CodeBook } from '../../src/core/codes';
import { detect, resplitItems } from '../../src/core/detector';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { assemblePdf, generatePdf, parsePdf, type PdfHandle } from '../../src/formats/pdf';

const FONT = new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'));

const LINES = [
  '個案姓名：王小明先生（身分證字號 A123456789）',
  '聯絡手機 0912-345-678，Email：xiaoming.wang@example.com',
  '地址：台北市信義區市府路45號8樓',
];

async function buildPdf(lines: string[]): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(FONT, { subset: true });
  const page = pdf.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 24, size: 12, font }));
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'sample.pdf', { type: 'application/pdf' });
}

beforeAll(() => {
  // The font is fetched from the static site at runtime; serve it from disk here.
  vi.stubGlobal('fetch', async () => new Response(FONT));
  // Vite's `?url` worker path is not importable under Node; point pdf.js at the file directly.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL('node_modules/pdfjs-dist/build/pdf.worker.min.mjs').href;
});

describe('PDF round trip', () => {
  it('extracts text with positions and rebuilds a text-only PDF without the originals', async () => {
    const doc = await parsePdf(await buildPdf(LINES));
    for (const l of LINES) expect(doc.text.replace(/\s/g, '')).toContain(l.replace(/\s/g, ''));

    const items = detect(doc.text, BUILTIN_PATTERNS);
    const originals = items.map((i) => i.original);
    expect(originals).toContain('A123456789');
    expect(originals).toContain('王小明');
    expect(originals).toContain('xiaoming.wang@example.com');
    expect(originals).toContain('台北市信義區市府路45號8樓');

    const { edits, mapping } = applyRedactions(doc.text, items);
    const blob = await generatePdf(doc, edits);
    const out = await parsePdf(new File([blob], 'out.pdf'));
    for (const o of originals) expect(out.text).not.toContain(o);
    for (const m of mapping) expect(out.text).toContain(`[${m.category}:${m.code}]`);

    // The rebuilt PDF must not embed the original bytes at all (no hidden text underneath).
    const raw = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    expect(raw).not.toContain('A123456789');

    const restored = restore(out.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText.replace(/\s/g, '')).toBe(doc.text.replace(/\s/g, ''));
  });

  it('rejects a PDF without a text layer', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    const file = new File([(await pdf.save()) as BlobPart], 'blank.pdf');
    await expect(parsePdf(file)).rejects.toThrow(/文字層/);

    const splitDoc = assemblePdf('split.pdf', [
      {
        width: 595,
        height: 842,
        items: [
          { text: '明昌國際', x: 45, y: 802.9, fontSize: 10.5, width: 42 },
          { text: '工', x: 87, y: 802.9, fontSize: 10.5, width: 10.5 },
          { text: '業股份有限公司 業務報價單', x: 97.5, y: 802.9, fontSize: 10.5, width: 128.6, eol: true },
          { text: '規格敘述：特仕款，內部配置 Apex (CA0005) 專', x: 49.5, y: 477.4, fontSize: 7.5, width: 160.9 },
          { text: '用', x: 210.4, y: 477.4, fontSize: 7.5, width: 7.5 },
          { text: '泡棉', x: 217.9, y: 477.4, fontSize: 7.5, width: 15 },
          { text: '工', x: 232.9, y: 477.4, fontSize: 7.5, width: 7.5 },
          { text: '具置物盤模組', x: 240.4, y: 477.4, fontSize: 7.5, width: 45, eol: true },
        ],
      },
    ]);
    const handle = splitDoc.handle as PdfHandle;
    expect(handle.pages[0].items).toHaveLength(2);
    expect(handle.pages[0].items[0].text).toBe('明昌國際工業股份有限公司 業務報價單');
    expect(handle.pages[0].items[1].text).toBe('規格敘述：特仕款，內部配置 Apex (CA0005) 專用泡棉工具置物盤模組');

    const book = new CodeBook();
    const splitItems = detect(splitDoc.text, BUILTIN_PATTERNS, book);
    resplitItems(splitItems, book, () => ({ mode: 'preview' }));
    const { edits, redactedText } = applyRedactions(splitDoc.text, splitItems);
    expect(redactedText).toMatch(/\[公司:\w{6}\]股份有限公司 業務報價單/);
    expect(redactedText).toContain('[客戶:CA0005] (CA0005) 專用泡棉工具置物盤模組');

    const blob = await generatePdf(splitDoc, edits);
    const out = await parsePdf(new File([blob], 'split-out.pdf'));
    expect(out.text).toMatch(/\[公司:\w{6}\]股份有限公司 業務報價單/);
    expect(out.text).toContain('[客戶:CA0005] (CA0005) 專用泡棉工具置物盤模組');

    const quoteBytes = new Uint8Array(readFileSync('明昌國際_客戶報價單_測試範本.pdf'));
    const quoteDoc = await parsePdf(new File([quoteBytes], 'quote.pdf'));
    const quoteBook = new CodeBook();
    const quoteItems = detect(quoteDoc.text, BUILTIN_PATTERNS, quoteBook);
    resplitItems(quoteItems, quoteBook, () => ({ mode: 'preview' }));
    const quoteRedacted = applyRedactions(quoteDoc.text, quoteItems);
    const quoteOutBlob = await generatePdf(quoteDoc, quoteRedacted.edits);
    const quoteOut = await parsePdf(new File([quoteOutBlob], 'quote.deid.pdf'));
    expect(quoteOut.text).not.toContain('grainger.com');
    expect(quoteOut.text).toMatch(/\[電子郵件:\w{6}\]@machangroup\.com/);
    expect(quoteOut.text).toContain('[客戶:CA0005] (CA0005) 專用泡棉工具置物盤模組');
    const quoteHandle = quoteOut.handle as PdfHandle;
    for (const pg of quoteHandle.pages) {
      for (let i = 0; i < pg.items.length; i++) {
        for (let j = i + 1; j < pg.items.length; j++) {
          const a = pg.items[i];
          const b = pg.items[j];
          if (Math.abs(a.y - b.y) < Math.min(a.fontSize, b.fontSize) * 0.5) {
            const [left, right] = a.x <= b.x ? [a, b] : [b, a];
            expect(left.x + left.width).toBeLessThanOrEqual(right.x + 2);
          }
        }
      }
    }
  });
});
