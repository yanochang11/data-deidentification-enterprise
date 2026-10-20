import './styles.css';
import { el, installTooltips } from './ui/components';
import { createProcessView, hasUnsavedResults, syncPatternChanges } from './ui/process-view';
import { createPatternsView } from './ui/patterns-view';
import { createRestoreView } from './ui/restore-view';

type TabId = 'process' | 'patterns' | 'restore';

const TABS: { id: TabId; label: string; create: () => HTMLElement }[] = [
  { id: 'process', label: '去識別化', create: createProcessView },
  { id: 'patterns', label: '偵測規則', create: createPatternsView },
  { id: 'restore', label: '還原', create: createRestoreView },
];

function mount(): void {
  const app = document.getElementById('app')!;
  // Static about/FAQ content shipped in index.html for crawlers; after mount it lives in a dialog opened from the footer.
  const siteInfo = document.getElementById('site-info');
  app.replaceChildren(); // drop the static SEO fallback
  const infoDialog = el('dialog', { class: 'site-info-dialog', 'aria-label': '常見問題' });
  if (siteInfo) {
    infoDialog.append(
      el('button', { class: 'dialog-close', type: 'button', 'aria-label': '關閉', onClick: () => infoDialog.close() }, '✕'),
      siteInfo,
    );
    infoDialog.addEventListener('click', (e) => {
      if (e.target === infoDialog) infoDialog.close(); // backdrop click
    });
  }
  const nav = el('nav', { class: 'tabs' });
  const panels = el('main', { class: 'panels' });
  const views = new Map<TabId, HTMLElement>();

  const activate = (id: TabId) => {
    // Popups are attached to <body>, so they would otherwise linger over the other tabs.
    document.querySelector('.add-popup')?.remove();
    window.getSelection()?.removeAllRanges();
    for (const t of TABS) {
      nav.querySelector(`[data-tab="${t.id}"]`)?.classList.toggle('active', t.id === id);
      let v = views.get(t.id);
      if (!v && t.id === id) {
        v = t.create();
        views.set(t.id, v);
        panels.append(v);
      }
      if (v) v.hidden = t.id !== id;
    }
    // Pattern changes made in another tab should be visible on return.
    if (id === 'patterns') {
      const fresh = createPatternsView();
      views.get('patterns')?.replaceWith(fresh);
      views.set('patterns', fresh);
    }
    if (id === 'process') syncPatternChanges();
  };

  for (const t of TABS) {
    nav.append(el('button', { class: 'tab', 'data-tab': t.id, type: 'button', onClick: () => activate(t.id) }, t.label));
  }
  const help = el('a', {
    class: 'tab tab-link',
    href: 'https://github.com/dean9703111/data-deidentification#操作流程',
    target: '_blank',
    rel: 'noopener',
    title: '開啟 GitHub 專案頁的操作說明',
  }, '使用說明 ↗');
  nav.append(help);

  // Served from public/ with a relative path so it works under any deploy base (vite base: './') and stays offline-safe.
  const logo = el('img', { class: 'brand-logo', src: './brand/machan-logo.png', alt: 'MACHAN 明昌國際', width: '1024', height: '187' });
  app.append(
    el('header', { class: 'header' },
      el('div', { class: 'brand' },
        logo,
        el('span', { class: 'brand-divider', 'aria-hidden': 'true' }),
        el('div', { class: 'brand-text' }, el('h1', {}, '文件去識別化工具'), el('span', { class: 'muted' }, '純前端處理・文件不離開你的電腦')),
      ),
      nav,
    ),
    panels,
    el('footer', { class: 'footer' },
      el('div', { class: 'footer-inner' },
        el('div', { class: 'footer-brand' },
          el('strong', {}, '明昌國際 企業版'),
          el('span', { class: 'muted' }, '　文件去識別化工具'),
          siteInfo ? el('span', { class: 'muted' }, '・') : null,
          siteInfo ? el('button', { class: 'link-btn', type: 'button', onClick: () => infoDialog.showModal() }, '常見問題') : null,
        ),
        // MIT requires keeping the upstream copyright notice, so attribution stays visible in the enterprise build.
        el('div', { class: 'footer-credit muted' },
          '基於 ',
          el('a', { href: 'https://github.com/dean9703111/data-deidentification', target: '_blank', rel: 'noopener' }, 'data-deidentification'),
          '（MIT © Dean Lin）',
        ),
      ),
    ),
    infoDialog,
  );
  activate('process');

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedResults()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

mount();
installTooltips();
