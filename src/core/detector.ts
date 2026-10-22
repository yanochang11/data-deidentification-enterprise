import type { Category, Pattern, RedactionItem, Retention } from './types';
import { CodeBook } from './codes';
import { splitFor } from './retention';

let nextId = 1;
function newId(): string {
  return `r${nextId++}`;
}

interface Candidate {
  category: Category;
  start: number;
  end: number;
  retention?: Retention;
  customCode?: string;
}

function makeItem(
  text: string,
  start: number,
  end: number,
  category: Category,
  book: CodeBook,
  origin: 'auto' | 'manual',
  retention?: Retention,
  customCode?: string,
): RedactionItem {
  const original = text.slice(start, end);
  const item: RedactionItem = { id: newId(), category, original, start, end, code: '', origin, active: true };
  if (retention) item.retention = retention;
  if (customCode) item.customCode = customCode;
  applySplit(item, retention, book, customCode);
  return item;
}

function applySplit(item: RedactionItem, retention: Retention | undefined, book: CodeBook, customCode?: string): void {
  const { head, tail } = splitFor(item.original, retention, item.category);
  if (head) item.head = head;
  else delete item.head;
  if (tail) item.tail = tail;
  else delete item.tail;
  item.code = book.codeFor(item.category, item.original, head, tail, customCode ?? item.customCode);
}

/**
 * Re-splits every item for a new output mode (全部隱藏／部分保留／自訂). Codes follow the split, so an
 * item whose kept characters change gets the code for its new split (see CodeBook).
 */
export function resplitItems(items: RedactionItem[], book: CodeBook, resolve: (it: RedactionItem) => Retention | undefined): void {
  for (const it of items) applySplit(it, resolve(it), book);
}

export function compilePattern(p: Pattern): RegExp | null {
  try {
    return new RegExp(p.regex, p.flags ?? 'gu');
  } catch {
    return null;
  }
}

/** Longest match wins; on equal length, the earlier start wins. */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen: Candidate[] = [];
  for (const c of sorted) {
    if (chosen.every((k) => c.end <= k.start || c.start >= k.end)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

export function detect(text: string, patterns: Pattern[], book: CodeBook = new CodeBook()): RedactionItem[] {
  const cands: Candidate[] = [];
  for (const p of patterns) {
    if (!p.enabled) continue;
    const re = compilePattern(p);
    if (!re) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const verdict = p.validate ? p.validate(m[0], text.slice(Math.max(0, m.index - 24), m.index)) : true;
      if (verdict === false || verdict === 0) {
        // Skip only the rejected word, not the whole match: 工程師程大偉 rejects「程師程」but holds「程大偉」.
        re.lastIndex = m.index + Math.min(2, m[0].length);
        continue;
      }
      // A shorter accepted length keeps only that much; matching resumes right after it.
      const length = verdict === true ? m[0].length : Math.min(verdict, m[0].length);
      if (length < m[0].length) re.lastIndex = m.index + length;
      const matched = text.slice(m.index, m.index + length);
      const customCode = p.getCustomCode ? p.getCustomCode(matched) : undefined;
      cands.push({ category: p.category, start: m.index, end: m.index + length, retention: p.retention, customCode });
    }
  }
  return resolveOverlaps(cands).map((c) => makeItem(text, c.start, c.end, c.category, book, 'auto', c.retention, c.customCode));
}

export class OverlapError extends Error {
  constructor() {
    super('選取範圍與既有項目重疊，請調整選取範圍');
  }
}

export function addManualItem(
  items: RedactionItem[],
  text: string,
  start: number,
  end: number,
  category: Category,
  book: CodeBook,
  retention?: Retention,
  customCode?: string,
): RedactionItem {
  if (start < 0 || end > text.length || start >= end) throw new Error('選取範圍無效');
  const overlaps = items.some((it) => it.active && start < it.end && end > it.start);
  if (overlaps) throw new OverlapError();
  const item = makeItem(text, start, end, category, book, 'manual', retention, customCode);
  const next = [...items, item].sort((a, b) => a.start - b.start);
  items.length = 0;
  items.push(...next);
  return item;
}

export function toggleItem(items: RedactionItem[], id: string): RedactionItem | undefined {
  const it = items.find((x) => x.id === id);
  if (!it) return undefined;
  if (!it.active) {
    const overlaps = items.some((o) => o.active && o.id !== id && it.start < o.end && it.end > o.start);
    if (overlaps) throw new OverlapError();
  }
  it.active = !it.active;
  return it;
}
