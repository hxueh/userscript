// ==UserScript==
// @name         Douban Mobile Lite
// @name:zh-CN   豆瓣移动版增强：广播 · 书影音 · 小组 · 搜索
// @namespace    https://github.com/hxueh
// @author       hxueh
// @version      0.3.12
// @description  Replaces Douban mobile with a full-page interface for search, movies, TV, books, music, groups, and reviews. Sign in to browse friends’ posts and your library. Removes app prompts and uses your web session.
// @description:zh-CN 为豆瓣移动版提供全屏界面，支持搜索、书影音、小组和评论。登录后可查看友邻广播与个人书影音。移除 App 提示，使用网页登录状态。
// @match        https://m.douban.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMwMDc3MjIiLz48dGV4dCB4PSIzMiIgeT0iNDQiIGZvbnQtZmFtaWx5PSJIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIzNCIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RDwvdGV4dD48L3N2Zz4K
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  const VERSION = '0.3.11';
  const API = '/rexxar/api/v2';
  const H = 'dml/';

  // ───────────────────────── utilities ─────────────────────────
  const qs = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getCookie = (n) => {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]).replace(/"/g, '') : '';
  };
  const ck = () => getCookie('ck');
  const loggedIn = () => !!ck();
  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };
  const loginUrl = () => 'https://accounts.douban.com/passport/login?redir=' + encodeURIComponent(location.href);

  function parseTime(s) {
    if (!s) return null;
    s = String(s);
    const d = new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s.slice(10)) ? '' : '+08:00'));
    return isNaN(d) ? null : d;
  }
  function ago(s) {
    const d = parseTime(s);
    if (!d) return esc(s || '');
    const sec = (Date.now() - d) / 1000;
    if (sec < 60) return '刚刚';
    if (sec < 3600) return Math.floor(sec / 60) + '分钟前';
    if (sec < 86400) return Math.floor(sec / 3600) + '小时前';
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
  }
  // Linkify raw text before escaping. The URL pattern is ASCII-only, so CJK text written
  // straight after a link (common on Douban) stays outside it; trailing punctuation is trimmed.
  const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%()]+/g;
  function textHTML(t) {
    const src = String(t ?? '');
    let out = '', last = 0;
    for (const m of src.matchAll(URL_RE)) {
      const u = m[0].replace(/[.,;:!?)\]]+$/, '');
      out += esc(src.slice(last, m.index)) + `<a href="${esc(u)}">${esc(u)}</a>`;
      last = m.index + u.length;
    }
    return (out + esc(src.slice(last))).replace(/\n/g, '<br>');
  }

  // Keep article markup, but never let remote HTML supply actions, forms or executable URLs.
  function safeURL(value) {
    if (!value || !String(value).trim()) return '';
    try {
      const url = new URL(value, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  // A CSS url() value for a style attribute. Quotes and backslashes are percent-encoded because
  // attribute escaping alone would decode back to a quote and end the url("…") string early.
  const cssURL = (value) => {
    const u = safeURL(value);
    return u ? `url("${u.replace(/["\\\n\r]/g, encodeURIComponent)}")` : 'none';
  };
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const root = doc.body;
    root.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base,input,textarea,select,svg,math,template').forEach((n) => n.remove());
    root.querySelectorAll('*').forEach((n) => {
      const href = n.tagName === 'A' ? safeURL(n.getAttribute('href') || '') : '';
      const src = n.tagName === 'IMG' ? safeURL(n.getAttribute('data-src') || n.getAttribute('src') || '') : '';
      const alt = n.getAttribute('alt') || '';
      // An allowlist also strips injected data-act/data-route and browser-specific handlers.
      Array.from(n.attributes).forEach((a) => n.removeAttribute(a.name));
      if (href) n.setAttribute('href', href);
      if (n.tagName === 'IMG') {
        if (!src) { n.remove(); return; }
        n.setAttribute('src', src);
        n.setAttribute('alt', alt);
        n.setAttribute('loading', 'lazy');
        n.setAttribute('data-act', 'img');
        n.setAttribute('tabindex', '0');
        n.setAttribute('role', 'button');
        n.setAttribute('aria-label', alt || '查看图片');
        n.setAttribute('data-src', src);
      }
    });
    return root.innerHTML;
  }

  function pic(o, big) {
    if (!o) return '';
    if (typeof o === 'string') return o;
    const pick = (x) => (typeof x === 'string' ? x : x && x.url);
    return (big && (pick(o.raw) || pick(o.large))) || pick(o.normal) || pick(o.large) || pick(o.small) || o.url || '';
  }

  const TYPE_NAME = { movie: '电影', tv: '电视剧', book: '图书', music: '音乐' };
  const REVIEW_NAME = { book: '书评', music: '乐评' };
  const VERBS = { book: ['想读', '在读', '读过'], music: ['想听', '在听', '听过'], other: ['想看', '在看', '看过'] };
  const verbsFor = (t) => VERBS[t] || VERBS.other;
  const STATUSES = ['mark', 'doing', 'done'];

  function stars(r) {
    if (!r || !r.value) return '';
    const v = (r.value / (r.max || 5)) * 5;
    const full = Math.max(0, Math.min(5, Math.round(v)));
    return `<span class="dml-stars">${'★'.repeat(full)}<i>${'★'.repeat(5 - full)}</i></span>`;
  }

  // ───────────────────────── icons ─────────────────────────
  const svg = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICON = {
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),
    timeline: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    library: svg('<rect x="4" y="3" width="6" height="18" rx="1"/><rect x="12" y="3" width="4" height="18" rx="1"/><path d="M18 4l2.5 16"/>'),
    groups: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>'),
    compose: svg('<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5l3 3L12 15l-4 1 1-4z"/>'),
    back: svg('<path d="M15 4l-8 8 8 8"/>', 'stroke-width="2.4"'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', 'stroke-width="2"'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.4"'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 'stroke-width="2.6"'),
    send: svg('<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>', 'stroke-width="2.6"'),
    home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>', 'stroke-width="2"'),
    comment: svg('<path d="M4 5h16v11H9l-5 4z"/>', 'width="18" height="18"'),
    reshare: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 'width="18" height="18"'),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 'width="18" height="18"'),
  };

  // ───────────────────────── API (same-origin rexxar, cookie auth) ─────────────────────────
  class ApiError extends Error {
    constructor(status, body) {
      super((body && (body.localized_message || body.msg)) || 'HTTP ' + status);
      this.status = status;
      this.body = body;
    }
  }
  async function request(method, path, params = {}) {
    const url = new URL(API + path, location.origin);
    // Legacy status detail/comments reject for_mobile=1 with spam_id; use the native API form.
    if (!/^\/status\/\d+(?:\/|$)/.test(path)) url.searchParams.set('for_mobile', '1');
    if (ck()) url.searchParams.set('ck', ck());
    const init = { method, credentials: 'include', headers: { Accept: 'application/json' } };
    // GET drops empty values to keep URLs tidy. POST keeps '' because an empty comment or tag
    // field is an explicit request to clear it; only undefined/null mean "leave unchanged".
    const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && (method !== 'GET' || v !== ''));
    if (method === 'GET') clean.forEach(([k, v]) => url.searchParams.set(k, v));
    else {
      const body = new URLSearchParams(clean.map(([k, v]) => [k, String(v)]));
      if (ck()) body.set('ck', ck());
      init.body = body;
    }
    const controller = new AbortController();
    init.signal = controller.signal;
    // Bound both headers and body reads; never retry a write automatically.
    const timeout = setTimeout(() => controller.abort(), 20000);
    let status = 0;
    try {
      const res = await fetch(url, init);
      status = res.status;
      let data;
      try { data = await res.json(); }
      catch (_) { throw new ApiError(controller.signal.aborted ? 0 : status, { msg: controller.signal.aborted ? '请求超时，请重试' : '接口未返回有效 JSON，请重试' }); }
      if (!res.ok) throw new ApiError(status, data);
      // Rexxar can return an application error with HTTP 200.
      if (data && data.code != null && Number(data.code) !== 0) {
        throw new ApiError(status, { ...data, msg: data.localized_message || data.msg || '接口返回错误 ' + data.code });
      }
      if (!data || typeof data !== 'object') throw new ApiError(status, { msg: '接口返回格式异常' });
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, { msg: controller.signal.aborted ? '请求超时，请重试' : '网络错误' });
    } finally {
      clearTimeout(timeout);
    }
  }

  // Try candidate paths in order; fall through only when an endpoint doesn't exist (404/405).
  async function tryPaths(method, paths, params) {
    let last;
    for (const p of paths) {
      try {
        return await request(method, p, params);
      } catch (e) {
        last = e;
        if (e.status !== 404 && e.status !== 405) throw e;
      }
    }
    throw last;
  }
  const api = {
    get: (p, q) => tryPaths('GET', [].concat(p), q),
    post: (p, b) => tryPaths('POST', [].concat(p), b),
  };

  let mePromise = null;
  function getMe() {
    if (!loggedIn()) return Promise.resolve(null);
    if (!mePromise) {
      mePromise = (async () => {
        try {
          const u = await api.get('/user/~me');
          if (u && u.id) return u;
        } catch (_) {}
        try {
          const html = await (await fetch('/mine/', { credentials: 'include' })).text();
          const m = html.match(/\/people\/([A-Za-z0-9_.-]+)\//);
          if (m) {
            try {
              const u = await api.get('/user/' + m[1]);
              if (u && u.id) return u;
            } catch (_) {}
            return { id: m[1] };
          }
        } catch (_) {}
        return null;
      })();
      mePromise.then((u) => {
        if (!u) mePromise = null;
      });
    }
    return mePromise;
  }

  function errMsg(e) {
    if (!e) return '出错了';
    if ((e.status === 401 || e.status === 403) && !loggedIn()) return '请先登录豆瓣';
    if (e.status === 404) return '内容不存在，或接口已变更（404）';
    if (e.status === 0) return e.message || '网络错误';
    return (e.message || '出错了') + (e.status ? `（${e.status}）` : '');
  }

  // ───────────────────────── links → lite routes ─────────────────────────
  const RESERVED_GROUP = new Set(['topic', 'explore', 'search', 'mine', 'my', 'people', 'category', 'new_group']);
  function routeForPath(p, host) {
    let m;
    // Native category entrances should open discovery for the same kind of content.
    if ((m = p.match(/^\/(movie|tv|book|music)\/?$/))) return `library/${m[1]}`;
    if (/^\/group(?:\/explore(?:\/[^/]+)?)?\/?$/.test(p)) return 'groups/discover';
    if ((m = p.match(/^\/(movie|tv|book|music)\/(\d+)\/?$/))) return `subject/${m[1]}/${m[2]}`;
    if ((m = p.match(/^\/(?:(movie|book|music|tv)\/)?subject\/(\d+)/))) {
      const sub = (host || '').split('.')[0];
      const type = m[1] || { movie: 'movie', book: 'book', music: 'music' }[sub];
      if (type) return `subject/${type}/${m[2]}`;
    }
    if ((m = p.match(/^\/celebrity\/(\d+)/))) return `celebrity/${m[1]}`;
    if ((m = p.match(/^\/personage\/(\d+)/))) return `personage/${m[1]}`;
    if ((m = p.match(/^\/author\/(\d+)/))) return `author/${m[1]}`;
    if ((m = p.match(/^\/(?:group\/)?topic\/(\d+)(?:\/|$)/))) return `topic/${m[1]}`;
    if ((m = p.match(/\/status\/(\d+)/))) return `status/${m[1]}`;
    if ((m = p.match(/\/review\/(\d+)/))) return `review/${m[1]}`;
    if ((m = p.match(/^\/people\/([A-Za-z0-9_.-]+)(?:\/(?:statuses)?)?\/?$/))) return `user/${m[1]}`;
    if ((m = p.match(/^\/group\/([^/]+)\/?$/)) && !RESERVED_GROUP.has(m[1])) return `group/${m[1]}`;
    return null;
  }
  function routeForUrl(href) {
    if (!href) return null;
    let u;
    try {
      u = new URL(href, location.href);
    } catch (_) {
      return null;
    }
    if (u.protocol === 'douban:') {
      const path = (u.host && u.host !== 'douban.com' ? '/' + u.host : '') + u.pathname;
      return routeForPath(path, '');
    }
    if (!/^https?:$/.test(u.protocol) || !/(^|\.)douban\.com$/.test(u.hostname)) return null;
    if (u.pathname.startsWith('/doubanapp/dispatch')) {
      const uri = u.searchParams.get('uri');
      return routeForPath(uri || u.pathname.replace('/doubanapp/dispatch', ''), '');
    }
    // Native search links enter Lite with their query and category intact.
    if (u.pathname.replace(/\/$/, '') === '/search') {
      return 'search/' + (SEARCH_TYPES[u.searchParams.get('type')] ? u.searchParams.get('type') : 'all') + '/' + encodeURIComponent(u.searchParams.get('query') || '');
    }
    return routeForPath(u.pathname, u.hostname);
  }

  // ───────────────────────── styles ─────────────────────────
  // One consolidated sheet in the iOS 26/27 visual language: design tokens, the Liquid Glass
  // material, then layout and components. Neutrals follow the iOS 26 system palette; the accent
  // is Douban green. --tint is for text and icons (dark enough for 4.5:1 on white), --tint-fill
  // is the brighter brand green behind white labels on prominent buttons.
  const CSS = `
#dml-app{
  --bg:#f2f2f7;--card:#fff;--card-2:#f5f5f8;--text:#000;--sub:#8a8a8e;--sep:rgba(60,60,67,.13);
  --tint:#00872e;--tint-fill:#009a3a;--tint-soft:rgba(0,154,58,.12);--on-tint:#fff;--red:#ff383c;--star:#ff9500;
  --fill:rgba(120,120,128,.1);--chip:rgba(120,120,128,.16);--lens:rgba(120,120,128,.15);
  --thumb:#fff;--thumb-sh:0 3px 10px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
  /* Liquid Glass, matched against Safari on macOS 27: a quiet material. Blur plus saturation
     lifts colour from what is underneath; the edge is an even hairline that is only slightly
     brighter at the top, with a faint sheen and a soft, low shadow. */
  --glass:rgba(255,255,255,.58);--glass-strong:rgba(250,250,252,.8);--sheen:.14;
  --glass-blur:blur(16px) saturate(180%);
  --rim:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.55));
  --glass-sh:0 0 0 .5px rgba(0,0,0,.07),0 4px 16px rgba(0,0,0,.08);
  --card-sh:0 1px 2px rgba(0,0,0,.03),0 4px 16px rgba(0,0,0,.04);
  --spring:cubic-bezier(.34,1.45,.64,1);
  --r:26px;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Helvetica Neue",system-ui,sans-serif;
  font-size:16px;line-height:1.45;color:var(--text);-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){#dml-app{
  --bg:#000;--card:#1c1c1e;--card-2:#262628;--text:#fff;--sub:#98989f;--sep:rgba(84,84,88,.48);
  --tint:#3ddc6e;--tint-fill:#17a34a;--tint-soft:rgba(61,220,110,.16);--red:#ff4245;--star:#ff9f0a;
  --fill:rgba(118,118,128,.2);--chip:rgba(118,118,128,.24);--lens:rgba(255,255,255,.14);
  --thumb:#636366;--thumb-sh:0 3px 8px rgba(0,0,0,.3);
  --glass:rgba(118,118,128,.2);--glass-strong:rgba(44,44,47,.82);--sheen:.03;
  --glass-blur:blur(16px) saturate(160%);
  --rim:linear-gradient(180deg,rgba(255,255,255,.17),rgba(255,255,255,.07));
  --glass-sh:0 4px 16px rgba(0,0,0,.28);
  --card-sh:none}}
/* Fall back to solid surfaces where blur is unavailable or the user asks for less transparency. */
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#dml-app{--glass:var(--card);--glass-strong:var(--card)}}
@media (prefers-reduced-transparency:reduce){#dml-app{--glass:var(--card);--glass-strong:var(--card);--glass-blur:none;--sheen:0}}
@media (prefers-contrast:more){#dml-app{--rim:linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4));--glass:var(--glass-strong)}}
@media (prefers-contrast:more) and (prefers-color-scheme:dark){#dml-app{--rim:linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.55))}}

/* Element resets use :where() so they carry no ID weight; otherwise "#dml-app button" would
   outrank every component class (.dml-tab, .dml-seg button…) and wipe their padding and colour. */
:where(#dml-app) *{box-sizing:border-box}
:where(#dml-app) button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
:where(#dml-app) a{color:var(--tint);text-decoration:none;-webkit-tap-highlight-color:transparent}
:where(#dml-app) :is(textarea,input,select){font:inherit;color:var(--text)}
#dml-app .dml-author{color:var(--text)}
/* Douban's own stylesheet stays loaded and colours headings and paragraphs grey; inherit ours. */
#dml-app :is(h1,h2,h3,h4){color:inherit}
#dml-app .dml-rich :is(p,li){color:inherit}
#dml-app button:focus-visible,#dml-app a:focus-visible,#dml-app input:focus-visible,#dml-app textarea:focus-visible,#dml-app select:focus-visible,#dml-app [tabindex]:focus-visible{outline:3px solid var(--tint);outline-offset:2px}
#dml-app button:disabled{cursor:default;opacity:.5}
#dml-app .dml-cell[data-route]:active,#dml-app a.dml-cell:active{background:var(--card-2)}

/* ── Liquid Glass material ──
   Regular glass: floating bars and buttons. Strong glass: sheets and toasts that hold text.
   Prominent glass: the tinted primary action. The ::after layer draws the specular rim, a
   1px gradient ring cut out with a mask, which gives the edge its lit, curved look. */
#dml-app :is(.dml-nav .side button,.dml-tabbar,.dml-replybar,.dml-gbtn,.dml-viewer .count,.dml-marks button){
  background:linear-gradient(180deg,rgba(255,255,255,var(--sheen)),transparent 60%),var(--glass);
  -webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--glass-sh)}
#dml-app :is(.dml-sheet,.dml-toast){
  background:linear-gradient(180deg,rgba(255,255,255,var(--sheen)),transparent 40%),var(--glass-strong);
  -webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--glass-sh)}
#dml-app :is(.dml-gbtn.primary,.dml-marks button.on,.dml-replybar button[type=submit],.dml-linkform button,.dml-error button){
  background:linear-gradient(180deg,rgba(255,255,255,.14),transparent 60%),var(--tint-fill)!important;color:var(--on-tint)!important;
  box-shadow:0 4px 14px color-mix(in srgb,var(--tint-fill) 28%,transparent)}
#dml-app :is(.dml-nav .side button,.dml-tabbar,.dml-replybar,.dml-gbtn,.dml-viewer .count,.dml-marks button,.dml-sheet,.dml-toast,.dml-replybar button[type=submit],.dml-linkform button,.dml-error button)::after{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:var(--rim);pointer-events:none;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
/* In-flow glass controls need a positioning context for the rim; bars and sheets are already
   fixed or absolute, which is why position is not part of the shared material rule. */
.dml-nav .side button,.dml-gbtn,.dml-marks button,.dml-replybar button[type=submit],.dml-linkform button,.dml-error button{position:relative}
/* Glass controls swell slightly under the finger, like the system's interactive glass. */
#dml-app :is(.dml-nav .side button,.dml-gbtn,.dml-marks button,.dml-replybar button[type=submit],.dml-tab,.dml-linkform button,.dml-error button){transition:transform .35s var(--spring),background .2s,opacity .2s}
#dml-app :is(.dml-nav .side button,.dml-gbtn,.dml-marks button,.dml-replybar button[type=submit],.dml-tab,.dml-linkform button,.dml-error button):active{transform:scale(1.08)}

/* Let the document own scrolling so iPhone Safari can collapse its browser toolbar. */
html.dml-open{position:static!important;height:auto!important;overflow-y:auto!important;overscroll-behavior-y:auto!important;scroll-behavior:auto;background:#f2f2f7}
html.dml-open body{display:block!important;position:static!important;width:auto!important;min-width:0!important;height:auto!important;min-height:100vh;min-height:100svh;max-width:none!important;margin:0!important;padding:0!important;overflow:visible!important;background:transparent!important}
html.dml-open.dml-modal,html.dml-open.dml-modal body{overflow:hidden!important}
@media(prefers-color-scheme:dark){html.dml-open{background:#000}}
html.dml-open body>*:not(#dml-app){display:none!important}

.dml-scroll{display:none;position:relative;min-height:100vh;min-height:100svh;background:var(--bg)}
#dml-app.open .dml-scroll{display:block}
.dml-view{max-width:680px;margin:0 auto;min-height:100vh;min-height:100svh;padding-bottom:calc(104px + env(safe-area-inset-bottom))}
.dml-view.has-replybar{padding-bottom:calc(112px + env(safe-area-inset-bottom))}

/* ── navigation bar: no bar at all, just floating glass buttons ──
   Content scrolls under a soft "scroll edge" blur that fades out downwards, as in iOS 26. */
.dml-nav{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;min-height:60px;padding:calc(env(safe-area-inset-top) + 6px) 16px 8px}
.dml-nav::before{content:"";position:absolute;inset:0 0 -24px;z-index:-1;pointer-events:none;
  background:linear-gradient(var(--bg),transparent);
  background:linear-gradient(var(--bg) 10%,color-mix(in srgb,var(--bg) 65%,transparent) 55%,transparent);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  -webkit-mask-image:linear-gradient(#000 50%,transparent);mask-image:linear-gradient(#000 50%,transparent)}
.dml-nav h1{flex:1;margin:0;font-size:17px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .2s}
.dml-nav .side{display:flex;align-items:center;gap:8px;min-width:44px}
.dml-nav .side.r{justify-content:flex-end}
.dml-nav .side button{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;color:var(--text)}
.dml-nav .side button svg{width:22px;height:22px}
.dml-nav .side button span{display:none}
/* The small title appears only once the large title has scrolled away. */
.dml-view.root .dml-nav h1{opacity:0}
#dml-app.scrolled .dml-view.root .dml-nav h1{opacity:1}
.dml-large{margin:0;padding:0 20px 6px;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:.2px}

/* ── tab bar: a floating glass capsule that minimises while you scroll down ── */
.dml-tabbar{display:none;position:fixed;left:16px;right:16px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147483001;max-width:400px;margin:0 auto;padding:4px;border-radius:100px;
  transition:max-width .45s var(--spring),padding .3s ease}
#dml-app.open .dml-tabbar{display:flex}
#dml-app.open.no-tabbar .dml-tabbar{display:none}
.dml-tab{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 0 5px;border-radius:100px;font-size:10px;font-weight:600;color:var(--text)}
.dml-tab svg{width:24px;height:24px}
.dml-tab span{display:block;max-height:14px;overflow:hidden;transition:max-height .3s ease,opacity .2s}
/* The selected tab sits under a lens: a lighter pill with the icon in the tint colour. */
.dml-tab.on{color:var(--tint);background:var(--lens)}
#dml-app.tabbar-min .dml-tabbar{max-width:calc(var(--tabs,3) * 54px + 8px)}
#dml-app.tabbar-min .dml-tab{padding:7px 0}
#dml-app.tabbar-min .dml-tab span{max-height:0;opacity:0}

.dml-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));transform:translate(-50%,10px) scale(.94);z-index:2147483006;max-width:78%;padding:11px 20px;border-radius:100px;color:var(--text);font-size:15px;font-weight:500;text-align:center;opacity:0;pointer-events:none;transition:opacity .2s,transform .4s var(--spring)}
.dml-toast.on{opacity:1;transform:translate(-50%,0) scale(1)}

/* ── lists and cells: inset grouped cards with the larger iOS 26 corner radius ── */
.dml-list{margin:8px 16px;border-radius:var(--r);overflow:hidden;background:var(--card);box-shadow:var(--card-sh)}
.dml-list:empty{display:none}
.dml-cell{display:block;position:relative;background:var(--card);padding:14px 18px;color:var(--text)!important;transition:background .15s}
.dml-list>.dml-cell+.dml-cell::before,.dml-list>.dml-cell+a.dml-cell::before{content:"";position:absolute;top:0;left:18px;right:0;border-top:.5px solid var(--sep)}
.dml-main>.dml-cell,.dml-article,.dml-mine,.dml-intro{margin:10px 16px 0;border-radius:var(--r);box-shadow:var(--card-sh)}
.dml-row{display:flex;gap:11px}
.dml-row>.dml-col{flex:1;min-width:0}
/* Hide alt text and broken-image icons; the filled circle stands in for a missing avatar. */
.dml-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;background:var(--fill);color:transparent;font-size:0}
.dml-avatar.s{width:32px;height:32px}
.dml-avatar.sq{border-radius:12px}
img.dml-broken{visibility:hidden}
.dml-name{font-weight:600;font-size:15px}
.dml-meta{font-size:13px;color:var(--sub)}
.dml-meta .op{display:inline-block;margin-left:5px;padding:0 7px;border-radius:100px;background:var(--tint-soft);color:var(--tint);font-size:11px;font-weight:700;vertical-align:1px}
.dml-text{margin-top:5px;font-size:16px;line-height:1.55;word-break:break-word}
.dml-imgs{display:grid;gap:3px;margin-top:10px;grid-template-columns:repeat(3,1fr);border-radius:18px;overflow:hidden}
.dml-imgs.n1{grid-template-columns:1fr;max-width:78%}
.dml-imgs.n2{grid-template-columns:1fr 1fr}
.dml-imgs img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:var(--fill);cursor:zoom-in}
.dml-imgs.n1 img{aspect-ratio:auto;max-height:360px}
.dml-reshared{margin-top:10px;padding:12px;border-radius:18px;background:var(--fill)}
.dml-reshared .dml-text{font-size:15px}
.dml-linkcard{display:flex!important;gap:12px;align-items:center;margin-top:10px;padding:10px;border-radius:18px;background:var(--fill);color:var(--text)!important}
.dml-linkcard img{width:46px;height:64px;object-fit:cover;border-radius:8px;flex:none}
.dml-linkcard b{display:block;font-size:15px}
.dml-linkcard span{font-size:13px;color:var(--sub);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dml-acts{display:flex;justify-content:space-between;max-width:300px;margin-top:10px;margin-left:51px;color:var(--sub);font-size:13px}
.dml-acts.flush{margin-left:0}
.dml-acts button{display:flex;align-items:center;gap:5px;min-height:32px;padding:0 6px 0 0;color:var(--sub)!important;font-variant-numeric:tabular-nums}
.dml-acts button.on{color:var(--red)!important}
.dml-acts button.on svg{fill:currentColor}
.dml-cacts{display:flex;gap:16px;margin-top:6px;font-size:13px;color:var(--sub)}
.dml-cacts button{color:var(--tint)!important;font-weight:500}
.dml-quote{margin-top:6px;padding:7px 12px;border-left:3px solid var(--tint);background:var(--fill);border-radius:0 12px 12px 0;font-size:14px;color:var(--sub)}
.dml-more{display:block;width:100%;padding:20px;color:var(--sub)!important;font-size:14px;text-align:center}
.dml-empty{padding:48px 16px;text-align:center;color:var(--sub);font-size:15px}
.dml-empty::before{content:"";display:block;width:44px;height:44px;margin:0 auto 10px;border-radius:50%;background:var(--fill)}
.dml-error{margin:16px;padding:20px 16px;border-radius:var(--r);background:var(--card);text-align:center;color:var(--sub);box-shadow:var(--card-sh)}
.dml-error button{display:inline-block;margin-top:12px;padding:9px 22px;border-radius:100px;font-weight:600}
.dml-tip{margin:12px 16px;padding:14px 18px;border-radius:var(--r);background:var(--card);font-size:14px;color:var(--sub);box-shadow:var(--card-sh)}
.dml-tip a{font-weight:600}
.dml-section{padding:22px 34px 6px;font-size:15px;font-weight:600;color:var(--text)}
.dml-group{margin:16px;border-radius:var(--r);overflow:hidden;background:var(--card);box-shadow:var(--card-sh)}

/* ── loading: shimmer skeleton instead of a bare label ── */
.dml-loading{margin:8px 16px;border-radius:var(--r);overflow:hidden;background:var(--card);box-shadow:var(--card-sh)}
.dml-skel{display:flex;gap:12px;padding:16px 18px}
.dml-skel+.dml-skel{border-top:.5px solid var(--sep)}
.dml-skel i{display:block;flex:none;width:40px;height:40px;border-radius:50%}
.dml-skel div{flex:1}
.dml-skel b{display:block;height:12px;margin:4px 0 10px;border-radius:6px}
.dml-skel b:nth-child(1){width:38%}.dml-skel b:nth-child(2){width:92%}.dml-skel b:nth-child(3){width:70%;margin-bottom:0}
.dml-skel i,.dml-skel b{background:linear-gradient(90deg,var(--fill) 25%,var(--chip) 50%,var(--fill) 75%);background-size:300% 100%;animation:dml-shimmer 1.4s ease-in-out infinite}
@keyframes dml-shimmer{from{background-position:100% 0}to{background-position:0 0}}

/* ── segmented control: tinted track with a raised glass thumb ── */
.dml-cast{margin:10px 16px;font-size:14px;line-height:1.6;color:var(--sub)}.dml-cast b{color:var(--text);font-weight:600;margin-right:4px}
.dml-people{display:flex;gap:14px;overflow-x:auto;padding:6px 16px 10px;scrollbar-width:none;scroll-snap-type:x proximity}
.dml-people::-webkit-scrollbar{display:none}
/* Fixed-width, clipped cards: min-width:0 + overflow:hidden stop long nowrap captions from
   stretching a flex item beyond its basis. */
.dml-person{flex:0 0 92px;width:92px;min-width:0;overflow:hidden;text-align:center;color:inherit;text-decoration:none;scroll-snap-align:start}
.dml-person img,.dml-person .ph{display:block;width:92px;height:124px;object-fit:cover;border-radius:14px;background:var(--chip);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.dml-person:active img{opacity:.8}
.dml-person .n{margin-top:8px;font-size:13px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.dml-person .r{margin-top:2px;font-size:11px;color:var(--sub);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dml-cinfo{margin:8px 16px;font-size:14px;line-height:1.7;color:var(--sub)}.dml-cinfo b{color:var(--text);font-weight:600;margin-right:6px}
.dml-seg.scroll{overflow-x:auto;scrollbar-width:none}.dml-seg.scroll button{flex:0 0 auto;padding:7px 14px;white-space:nowrap}
.dml-seg{display:flex;margin:10px 16px;padding:3px;border-radius:100px;background:var(--chip)}
.dml-seg button{flex:1;padding:7px 0;border-radius:100px;font-size:13px;font-weight:500;text-align:center;transition:background .25s,box-shadow .25s,transform .35s var(--spring)}
.dml-seg button:active{transform:scale(.96)}
.dml-seg button.on{background:var(--thumb);font-weight:600;box-shadow:var(--thumb-sh)}

/* ── subject page: blurred poster backdrop behind the header ── */
.dml-subj{position:relative;display:flex;gap:16px;margin:10px 16px 0;padding:18px;border-radius:var(--r);overflow:hidden;background:var(--card);box-shadow:var(--card-sh);isolation:isolate}
.dml-subj::before{content:"";position:absolute;inset:-40px;z-index:-2;background:var(--poster,none) center/cover;filter:blur(36px) saturate(1.6);opacity:.55}
.dml-subj::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,color-mix(in srgb,var(--card) 50%,transparent),var(--card) 92%)}
.dml-subj>img{width:104px;height:148px;object-fit:cover;border-radius:12px;flex:none;background:var(--fill);box-shadow:0 8px 22px rgba(0,0,0,.25);cursor:zoom-in}
.dml-subj h2{margin:0 0 4px;font-size:21px;line-height:1.25;font-weight:700}
.dml-score{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:10px}
.dml-score b{font-size:28px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.dml-stars{color:var(--star);letter-spacing:1px;font-size:13px}
.dml-stars i{font-style:normal;opacity:.25}
.dml-marks{display:flex;gap:10px;padding:14px 16px 0}
.dml-marks button{flex:1;padding:12px 0;border-radius:100px;color:var(--tint)!important;font-weight:600;font-size:15px}
.dml-mine{padding:12px 18px;background:var(--card);font-size:14px;color:var(--sub)}
.dml-intro{padding:14px 18px;background:var(--card);font-size:15px;line-height:1.6;color:var(--text);white-space:pre-line;cursor:pointer}
/* Border instead of padding keeps the clamp from showing a sliver of the fifth line. */
.dml-intro.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;padding:0;border:solid transparent;border-width:14px 18px}
.dml-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dml-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dml-credit{margin-top:3px;font-size:12.5px;line-height:1.4;color:var(--sub);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dml-credit b{color:var(--text);font-weight:600;margin-right:6px}
.dml-list>.dml-cell{padding:14px 16px}.dml-row{gap:14px}
.dml-poster{width:72px;height:102px;object-fit:cover;border-radius:12px;flex:none;background:var(--fill);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.dml-title{font-size:16px;font-weight:600;line-height:1.35}
.dml-rating{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-size:13px;color:var(--sub)}
.dml-rating b{color:var(--text);font-weight:700;font-variant-numeric:tabular-nums}

/* ── articles: reviews and group topics ── */
.dml-article{padding:20px 18px;background:var(--card)}
.dml-article h2{margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700}
.dml-chip{display:inline-block;margin-bottom:12px;padding:5px 13px;border-radius:100px;background:var(--tint-soft);font-size:13px;font-weight:600;color:var(--tint)!important}
.dml-rich{margin-top:14px;font-size:17px;line-height:1.75;word-break:break-word}
.dml-rich img{display:block;max-width:100%;height:auto;margin:12px 0;border-radius:16px;cursor:zoom-in}
.dml-rich p{margin:0 0 1em}
.dml-rich a{word-break:break-all}
.dml-rich blockquote{margin:1em 0;padding:4px 14px;border-left:3px solid var(--sep);color:var(--sub)}
.dml-oponly .dml-comment:not(.is-op){display:none}

/* ── reply bar: glass capsule with a round, tinted send button (Messages style) ── */
.dml-replybar{position:fixed;left:16px;right:16px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147483002;max-width:648px;margin:0 auto;padding:6px;border-radius:26px}
.dml-replybar .dml-ref{display:flex;justify-content:space-between;align-items:center;padding:4px 10px 6px;font-size:13px;color:var(--sub)}
.dml-replybar .dml-ref[hidden]{display:none}
.dml-replybar .dml-ref button{padding:0 4px}
.dml-replybar .dml-line{display:flex;align-items:flex-end;gap:6px}
.dml-replybar textarea{flex:1;min-height:38px;max-height:120px;padding:8px 14px;border:0;border-radius:20px;background:transparent;font-size:16px;resize:none;outline:none}
.dml-replybar textarea::placeholder{color:var(--sub)}
.dml-replybar button[type=submit]{display:flex;align-items:center;justify-content:center;flex:none;width:38px;height:38px;border-radius:50%}
.dml-replybar button[type=submit] svg{width:20px;height:20px}
/* The send button stays dimmed until there is something to send. */
.dml-replybar:not(.has-text) button[type=submit]{opacity:.35}

/* ── sheets: inset glass cards with circular glass header buttons ── */
.dml-sheet-wrap{position:fixed;inset:0;z-index:2147483004;background:rgba(0,0,0,0);transition:background .3s}
.dml-sheet-wrap.on{background:rgba(0,0,0,.22)}
.dml-sheet{position:absolute;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));max-width:560px;max-height:88%;margin:0 auto;overflow:auto;padding:0 16px 16px;border-radius:38px;transform:translateY(calc(100% + 40px));transition:transform .5s var(--spring)}
.dml-sheet::before{content:"";display:block;width:36px;height:5px;margin:7px auto 0;border-radius:3px;background:var(--sep)}
.dml-sheet-wrap.on .dml-sheet{transform:none}
.dml-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;height:60px;font-size:17px}
.dml-sheet-head b{flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dml-gbtn{display:flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;border-radius:50%;color:var(--text)!important}
.dml-gbtn svg{width:20px;height:20px}
.dml-sheet .dml-seg{margin:4px 0 12px}
.dml-field,.dml-textarea{display:block;width:100%;margin-bottom:12px;padding:12px 16px;border:0;border-radius:18px;background:var(--fill);font-size:16px;outline:none}
.dml-textarea{min-height:120px;resize:none}
.dml-rate{display:flex;justify-content:center;gap:12px;margin:6px 0 14px;font-size:34px;color:var(--star)}
.dml-rate button{opacity:.22;color:var(--star)!important;transition:opacity .15s,transform .35s var(--spring)}
.dml-rate button.on{opacity:1}
.dml-rate button:active{transform:scale(1.2)}
.dml-danger{display:block;width:100%;padding:14px 0;border-radius:100px;background:var(--fill)!important;color:var(--red)!important;font-size:16px;font-weight:600}
.dml-linkform{padding:18px}
.dml-linkform button{padding:9px 20px;border-radius:100px;font-weight:600}

/* ── image viewer: swipe or use arrow keys between images in the same post ── */
.dml-viewer{position:fixed;inset:0;z-index:2147483005;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.94);animation:dml-fade .2s ease-out;touch-action:pan-y pinch-zoom}
.dml-viewer img{max-width:100%;max-height:100%;object-fit:contain;-webkit-user-select:none;user-select:none}
.dml-viewer .dml-gbtn{position:absolute;top:calc(env(safe-area-inset-top) + 10px);left:16px;color:#fff!important}
.dml-viewer .count{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:6px 14px;border-radius:100px;color:#fff;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
@keyframes dml-fade{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){#dml-app *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

  function injectStyle() {
    // At document-start the root element may not exist yet; wait for it.
    const root = document.head || document.documentElement;
    if (!root) {
      const mo = new MutationObserver(() => {
        if (document.documentElement) {
          mo.disconnect();
          injectStyle();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
      return;
    }
    if (document.getElementById('dml-style')) return;
    const s = document.createElement('style');
    s.id = 'dml-style';
    s.textContent = CSS;
    root.appendChild(s);
    // Hide the native page before first paint; boot mounts the replacement after DOM readiness.
    document.documentElement.classList.add('dml-open');
  }

  // ───────────────────────── shell, router, view cache ─────────────────────────
  const ui = {};
  const ROUTES = [];
  const cache = new Map();
  let current = null;
  let internalNav = false;

  function buildShell() {
    ui.app = h(`<div id="dml-app">
      <div class="dml-scroll"></div>
      <nav class="dml-tabbar">
        ${loggedIn() ? `<button class="dml-tab" data-act="tab" data-tab="timeline" data-route="timeline">${ICON.timeline}<span>动态</span></button>` : ''}
        <button class="dml-tab" data-act="tab" data-tab="library" data-route="library">${ICON.library}<span>书影音</span></button>
        <button class="dml-tab" data-act="tab" data-tab="groups" data-route="groups">${ICON.groups}<span>小组</span></button>
        <button class="dml-tab" data-act="tab" data-tab="search" data-route="search">${ICON.search}<span>搜索</span></button>
      </nav>
      <div class="dml-toast"></div>
    </div>`);
    ui.scroll = qs('.dml-scroll', ui.app);
    ui.tabbar = qs('.dml-tabbar', ui.app);
    // The minimised capsule is sized from the tab count (including Search when logged out).
    ui.tabbar.style.setProperty('--tabs', ui.tabbar.children.length);
    ui.toast = qs('.dml-toast', ui.app);
    ui.toast.setAttribute('role', 'status');
    ui.toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(ui.app);
    ui.app.addEventListener('click', onClick);
    // Root scrolling also drives Safari's chrome; listen passively without intercepting gestures.
    window.addEventListener('scroll', onPageScroll, { passive: true });
    ui.app.addEventListener('focusin', () => setTabbarMin(false));
    // Generated article images use the same action for touch and keyboard input.
    ui.app.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('img[data-act="img"]')) {
        e.preventDefault();
        ACTIONS.img(e.target);
      }
    });
    // Image errors don't bubble, so listen in the capture phase. Hiding the element removes
    // Safari's broken-image glyph while the card keeps its placeholder background.
    ui.app.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG') e.target.classList.add('dml-broken');
    }, true);
    setThemeColor();
  }

  // Tint Safari's toolbar to match the Lite background instead of Douban's native page colour.
  function setThemeColor() {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    [['#f2f2f7', '(prefers-color-scheme: light)'], ['#000000', '(prefers-color-scheme: dark)']].forEach(([color, media]) => {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = color;
      m.media = media;
      document.head.appendChild(m);
    });
  }

  const pageScrollTop = () => document.scrollingElement ? document.scrollingElement.scrollTop : window.scrollY;
  let chromeAnchor = 0;
  let chromeFrame = 0;
  // iOS 26 behaviour: the navigation buttons stay put and the tab bar shrinks to its icons
  // while scrolling down, then expands again on scroll up, on tap, or near the top.
  function setTabbarMin(min) {
    ui.app.classList.toggle('tabbar-min', min);
  }
  function onPageScroll() {
    if (chromeFrame) return;
    chromeFrame = requestAnimationFrame(() => {
      chromeFrame = 0;
      // Clamp iOS rubber-band overscroll so bouncing at either edge cannot flip direction.
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const top = Math.max(0, Math.min(pageScrollTop(), max));
      const delta = top - chromeAnchor;
      // Swap the large title for the compact one once it has scrolled under the header.
      ui.app.classList.toggle('scrolled', top > 44);
      if (top <= 24 || document.documentElement.classList.contains('dml-modal') ||
          ui.app.querySelector('input:focus,textarea:focus,select:focus')) {
        setTabbarMin(false);
        chromeAnchor = top;
      } else if (delta >= 18 || delta <= -10) {
        // A small direction threshold filters touch jitter while making the expand feel immediate.
        setTabbarMin(delta > 0);
        chromeAnchor = top;
      }
    });
  }
  function scrollPage(top, behavior = 'auto') {
    // Navigation and Back restoration should always start with usable navigation controls.
    setTabbarMin(false);
    ui.app.classList.toggle('scrolled', top > 44);
    chromeAnchor = top;
    window.scrollTo({ top, left: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior });
  }
  function syncModalScroll() {
    setTabbarMin(false);
    // Lock only modal interactions; normal pages must remain the browser's root scroller.
    document.documentElement.classList.toggle('dml-modal', !!ui.app.querySelector('.dml-viewer,.dml-sheet-wrap'));
  }

  let toastTimer;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('on'), 2200);
  }
  function needLogin() {
    if (confirm('需要登录豆瓣，现在去登录？')) location.href = loginUrl();
  }

  // A malformed shared hash should not prevent the shell from opening.
  const currentRoute = () => {
    if (!location.hash.startsWith('#' + H)) return null;
    try { return decodeURIComponent(location.hash.slice(H.length + 1)); }
    catch (_) { return homeRoute(); }
  };
  const depth = () => (history.state && history.state.dmlDepth) || 0;
  const baseUrl = () => location.pathname + location.search;

  function withInternal(fn) {
    internalNav = true;
    try {
      fn();
    } finally {
      internalNav = false;
    }
  }
  // reset=true starts a fresh stack (tab switches), so the tab root shows its large title and
  // refresh button instead of a Back button left over from the previous tab's depth.
  function go(route, replace, reset) {
    const st = { dmlDepth: reset ? 0 : replace ? depth() : depth() + 1 };
    const url = baseUrl() + '#' + H + route;
    withInternal(() => (replace ? history.replaceState(st, '', url) : history.pushState(st, '', url)));
    render(false);
  }
  function back() {
    if (depth() > 0) history.back();
    else closeLite();
  }
  const homeRoute = () => loggedIn() ? 'timeline' : 'library';
  function closeLite() {
    // The script owns every mobile page; returning home must never reveal the native guide.
    withInternal(() => history.replaceState({ dmlDepth: 0 }, '', baseUrl() + '#' + H + homeRoute()));
    render(false);
  }
  function refresh() {
    if (current) go(current.route, true);
  }

  function evict(entry) {
    entry.dead = true;
    entry.cleanups.forEach((f) => {
      try {
        f();
      } catch (_) {}
    });
  }

  function render(fromPop) {
    ui.app.querySelectorAll('.dml-viewer,.dml-sheet-wrap').forEach((modal) => modal.remove());
    syncModalScroll();
    autoOpenForNativeUrl();
    const route = currentRoute();
    if (current) {
      current.scrollTop = pageScrollTop();
      current.node.remove();
      cache.set(current.route, current);
      while (cache.size > 8) {
        const [k, v] = cache.entries().next().value;
        evict(v);
        cache.delete(k);
      }
      current = null;
    }
    ui.app.classList.add('open');
    document.documentElement.classList.add('dml-open');

    if (fromPop && cache.has(route)) {
      current = cache.get(route);
      cache.delete(route);
      ui.scroll.appendChild(current.node);
      applyChrome(current);
      scrollPage(current.scrollTop || 0);
      return;
    }
    if (cache.has(route)) {
      evict(cache.get(route));
      cache.delete(route);
    }
    current = { route, node: h('<div class="dml-view"></div>'), cleanups: [], acts: {}, tab: null, tabbar: true, scrollTop: 0 };
    ui.scroll.appendChild(current.node);
    scrollPage(0);
    for (const [re, fn] of ROUTES) {
      const m = route.match(re);
      if (m) {
        fn(current, ...m.slice(1));
        return;
      }
    }
    (loggedIn() ? vTimeline : vDiscover)(current);
  }

  function applyChrome(v) {
    document.title = (v.title || '豆瓣') + ' · 豆瓣 Lite';
    ui.app.classList.toggle('no-tabbar', !v.tabbar);
    ui.tabbar.querySelectorAll('.dml-tab').forEach((t) => (t.classList.toggle('on', t.dataset.tab === v.tab), t.setAttribute('aria-current', t.dataset.tab === v.tab ? 'page' : 'false')));
  }

  function page(v, { title = '', right = '', tab = null, tabbar = true } = {}) {
    v.tab = tab;
    v.title = title;
    v.tabbar = tabbar;
    // A view that resolves after the user has left (e.g. status → topic redirect) must not
    // overwrite the visible page's title and tab state.
    if (current === v) applyChrome(v);
    const root = depth() === 0 && !!tab;
    // Depth 0 means there is no Lite history to go back to. Tab roots offer refresh; a deep link
    // opened directly (often with the tab bar hidden) needs a way home instead of a dead end.
    const leftBtn = depth() > 0
      ? `<button data-act="back" aria-label="返回">${ICON.back}<span>返回</span></button>`
      : root
        ? `<button data-act="retry" aria-label="刷新">${ICON.refresh}</button>`
        : `<button data-act="close" aria-label="首页">${ICON.home}</button>`;
    v.node.classList.toggle('root', root);
    v.node.innerHTML = `<header class="dml-nav"><div class="side">${leftBtn}</div><h1>${esc(title)}</h1><div class="side r">${right}</div></header>${root ? `<h1 class="dml-large">${esc(title)}</h1>` : ''}<main class="dml-main"></main>`;
    return qs('.dml-main', v.node);
  }
  const setTitle = (v, t) => {
    v.title = t || '';
    if (current === v) document.title = (v.title || '豆瓣') + ' · 豆瓣 Lite';
    v.node.querySelectorAll('.dml-nav h1,.dml-large').forEach((el) => (el.textContent = t || ''));
  };
  // Skeleton rows hint at the layout that is about to appear, so the page doesn't jump.
  const loadingHTML = () => `<div class="dml-loading" role="status" aria-label="加载中">${'<div class="dml-skel"><i></i><div><b></b><b></b><b></b></div></div>'.repeat(3)}</div>`;
  const errHTML = (e) => `<div class="dml-error">${esc(errMsg(e))}<button data-act="retry">重试</button></div>`;
  const loginTip = (msg) => `<div class="dml-tip">${esc(msg)} <a href="${esc(loginUrl())}">去登录</a></div>`;

  // Paged list with auto-load. load(cursor) → { items, next } (next == null when done).
  function pager(v, container, load, renderItem, opts = {}) {
    const list = h(`<div class="dml-list${opts.listClass ? ' ' + opts.listClass : ''}"></div>`);
    const btn = h('<button class="dml-more" type="button">加载更多</button>');
    container.append(list, btn);
    let cursor, busy = false, done = false, stopped = false, failed = false, count = 0;
    const seen = new Set();
    async function step() {
      if (busy || done || stopped) return;
      failed = false;
      btn.disabled = true;
      busy = true;
      btn.textContent = '加载中…';
      try {
        const { items, next } = await load(cursor);
        if (stopped) return;
        if (!Array.isArray(items)) throw new Error('列表格式异常');
        const previousCursor = cursor;
        let added = 0;
        const frag = document.createDocumentFragment();
        items.forEach((it) => {
          const key = it && it.id;
          if (key != null) {
            if (seen.has(key)) return;
            seen.add(key);
          }
          const html = renderItem(it, count++);
          const el = html && h(html);
          if (el) { frag.appendChild(el); added++; }
        });
        list.appendChild(frag);
        cursor = next;
        done = next == null || !items.length || (previousCursor !== undefined && JSON.stringify(next) === JSON.stringify(previousCursor)) || added === 0;
      } catch (e) {
        if (stopped) return;
        failed = true;
        busy = false;
        btn.disabled = false;
        btn.textContent = (e.status === 401 || e.status === 403) && !loggedIn() ? '需要登录，轻点重试' : `${errMsg(e)}，轻点重试`;
        return;
      }
      busy = false;
      btn.disabled = false;
      if (done) {
        btn.textContent = count ? '没有更多了' : opts.empty || '暂无内容';
        btn.disabled = true;
      } else {
        btn.textContent = '加载更多';
        // IntersectionObserver only reports changes. If a short page leaves the button on
        // screen, re-observing delivers a fresh entry so loading continues without a tap.
        requestAnimationFrame(() => { if (!stopped) { io.unobserve(btn); io.observe(btn); } });
      }
    }
    btn.addEventListener('click', step);
    const io = new IntersectionObserver((es) => !failed && es[0].isIntersecting && step(), { root: null, rootMargin: '300px 0px' });
    io.observe(btn);
    const stop = () => { stopped = true; io.disconnect(); };
    v.cleanups.push(stop);
    if (v.dead) stop();
    Promise.resolve().then(step); // first page doesn't depend on the observer firing
    // Show an item created locally (e.g. a reply just sent) and remember its id, so it isn't
    // rendered a second time when a later page from the server contains it.
    const add = (it) => {
      const key = it && it.id;
      if (key == null || seen.has(key)) return;
      seen.add(key);
      const html = renderItem(it, count++);
      const el = html && h(html);
      if (el) list.appendChild(el);
    };
    return { list, step, stop, add };
  }
  const offsetLoader = (fetcher, key, size = 20) => async (start = 0) => {
    const d = await fetcher(start, size);
    const items = d[key];
    if (!Array.isArray(items)) throw new Error('接口未返回预期列表');
    const nextStart = start + items.length;
    const total = d.total;
    const more = items.length > 0 && (typeof total === 'number' ? nextStart < total : items.length >= size);
    return { items, next: more ? nextStart : null };
  };

  // ───────────────────────── click handling ─────────────────────────
  const ACTIONS = {
    back,
    close: closeLite,
    'reply-focus': () => { const field = current && qs('.dml-replybar textarea', current.node); if (field) field.focus(); },
    'user-unavailable': () => toast('这条内容没有提供用户主页信息'),
    retry: refresh,
    tab: (el) => {
      // A tap on the minimised bar only expands it, so the user can see the labels first.
      if (ui.app.classList.contains('tabbar-min')) {
        setTabbarMin(false);
        return;
      }
      if (current && current.tab === el.dataset.tab && depth() === 0) {
        scrollPage(0, 'smooth');
        return;
      }
      // Like iOS, tapping a tab (including the current one from a pushed page) returns to its root.
      go(el.dataset.route, true, true);
    },
    img: (el) => {
      // Page through the other images of the same post, grid or article.
      const scope = el.closest('.dml-imgs,.dml-rich,.dml-subj');
      const imgs = scope ? Array.from(scope.querySelectorAll('img[data-act="img"]')) : [el];
      let index = Math.max(0, imgs.indexOf(el));
      const srcOf = (img) => img.dataset.src || img.getAttribute('src');
      const viewer = h(`<div class="dml-viewer" role="dialog" aria-modal="true" aria-label="图片预览" tabindex="-1"><button class="dml-gbtn" aria-label="关闭">${ICON.close}</button><img alt=""><span class="count" aria-live="polite"></span></div>`);
      const shown = qs('img', viewer);
      const counter = qs('.count', viewer);
      const show = (i) => {
        index = (i + imgs.length) % imgs.length;
        shown.src = srcOf(imgs[index]);
        counter.textContent = `${index + 1} / ${imgs.length}`;
        counter.hidden = imgs.length < 2;
      };
      const close = () => { viewer.remove(); syncModalScroll(); imgs[index].focus({ preventScroll: true }); };
      // A horizontal swipe changes image; a tap (little movement) closes the viewer.
      let x0 = null, y0 = null, swiped = false;
      viewer.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; swiped = false; }, { passive: true });
      viewer.addEventListener('touchend', (e) => {
        if (x0 == null || e.touches.length) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (imgs.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; show(index + (dx < 0 ? 1 : -1)); }
      });
      viewer.addEventListener('click', () => { if (!swiped) close(); swiped = false; });
      viewer.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight' && imgs.length > 1) show(index + 1);
        else if (e.key === 'ArrowLeft' && imgs.length > 1) show(index - 1);
      });
      show(index);
      ui.app.appendChild(viewer);
      syncModalScroll();
      viewer.focus({ preventScroll: true });
    },
    expand: (el) => el.classList.toggle('clamp'),
    compose: () => composeSheet(),
    like: async (el) => {
      if (!loggedIn()) return needLogin();
      const id = el.dataset.id;
      const liked = el.dataset.liked === '1';
      el.disabled = true;
      try {
        const resource = el.dataset.api === 'group/topic' ? 'group/topic' : 'status';
        await api.post(`/${resource}/${id}/react`, { reaction_type: liked ? 0 : 1 });
        el.dataset.liked = liked ? '0' : '1';
        el.setAttribute('aria-label', liked ? '赞' : '取消赞');
        el.classList.toggle('on', !liked);
        const c = qs('span', el);
        c.textContent = Math.max(0, (parseInt(c.textContent, 10) || 0) + (liked ? -1 : 1)) || '';
      } catch (e) {
        toast(errMsg(e));
      } finally {
        el.disabled = false;
      }
    },
    reshare: async (el) => {
      if (!loggedIn()) return needLogin();
      // Personal topics use Douban's native share form; opening it does not publish anything.
      if (el.dataset.topic) {
        window.open(`https://www.douban.com/topic/${el.dataset.topic}/?type=rec#sep`, '_blank', 'noopener,noreferrer');
        return;
      }
      if (!confirm('转发这条广播？')) return;
      try {
        await api.post(`/status/${el.dataset.id}/reshare`, {});
        toast('已转发');
      } catch (e) {
        toast(errMsg(e));
      }
    },
  };

  function onClick(e) {
    const actEl = e.target.closest('[data-act]');
    if (actEl && ui.app.contains(actEl)) {
      const fn = (current && current.acts[actEl.dataset.act]) || ACTIONS[actEl.dataset.act];
      if (fn) {
        e.preventDefault();
        e.stopPropagation();
        fn(actEl, e);
        return;
      }
    }
    const a = e.target.closest('a[href]');
    if (a && ui.app.contains(a)) {
      e.preventDefault();
      const r = a.dataset.route || routeForUrl(a.href);
      if (r) return go(r);
      if (!safeURL(a.href)) return;
      let u;
      try {
        u = new URL(a.href);
      } catch (_) {
        return;
      }
      if (/(^|\.)douban\.com$/.test(u.hostname)) {
        withInternal(() => history.replaceState(null, '', baseUrl()));
        location.href = a.href;
      } else window.open(a.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const row = e.target.closest('[data-route]');
    const sel = window.getSelection && window.getSelection();
    const selecting = sel && !sel.isCollapsed && row && row.contains(sel.anchorNode);
    if (row && ui.app.contains(row) && !selecting) go(row.dataset.route);
  }

  // ───────────────────────── sheets & reply bar ─────────────────────────
  function sheet(html, onMount) {
    const wrap = h(`<div class="dml-sheet-wrap"><div class="dml-sheet">${html}</div></div>`);
    ui.app.appendChild(wrap);
    syncModalScroll();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
    const close = () => {
      wrap.classList.remove('on');
      setTimeout(() => { wrap.remove(); syncModalScroll(); }, 280);
    };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-sheet-close]')) close();
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    onMount(wrap, close);
    return close;
  }

  function composeSheet() {
    if (!loggedIn()) return needLogin();
    sheet(
      `<div class="dml-sheet-head"><button class="dml-gbtn" data-sheet-close aria-label="取消">${ICON.close}</button><b>发广播</b><button class="dml-gbtn primary" data-post aria-label="发布">${ICON.send}</button></div>
       <textarea class="dml-textarea" rows="7" maxlength="2000" placeholder="分享新鲜事…"></textarea>`,
      (w, close) => {
        const ta = qs('textarea', w);
        setTimeout(() => ta.focus(), 300);
        qs('[data-post]', w).addEventListener('click', async (e) => {
          const text = ta.value.trim();
          const btn = e.currentTarget;
          if (!text || btn.disabled) return;
          btn.disabled = true;
          try {
            await api.post('/status/create_status', { text });
            close();
            toast('已发布');
            if (current && current.route === 'timeline') refresh();
          } catch (err) {
            toast(errMsg(err));
            btn.disabled = false;
          }
        });
      }
    );
  }

  function replyBar(v, { placeholder, send, onSent }) {
    const bar = h(`<form class="dml-replybar">
      <div class="dml-ref" hidden><span></span><button type="button" aria-label="取消引用">✕</button></div>
      <div class="dml-line"><textarea rows="1" placeholder="${esc(placeholder)}"></textarea><button type="submit" aria-label="发送">${ICON.send}</button></div>
    </form>`);
    v.node.appendChild(bar);
    v.node.classList.add('has-replybar');
    const ta = qs('textarea', bar);
    const refBox = qs('.dml-ref', bar);
    let ref = null, sending = false;
    const clearRef = () => {
      ref = null;
      refBox.hidden = true;
    };
    v.acts.ref = (el) => {
      if (!loggedIn()) return needLogin();
      ref = el.dataset.cid;
      qs('span', refBox).textContent = '回复 ' + (el.dataset.name || '');
      refBox.hidden = false;
      ta.focus();
    };
    qs('.dml-ref button', bar).addEventListener('click', clearRef);
    // Dims the send button while the field is empty; called again after a successful send.
    const syncText = () => bar.classList.toggle('has-text', !!ta.value.trim());
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      syncText();
    });
    bar.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!loggedIn()) return needLogin();
      const draft = ta.value;
      const text = draft.trim();
      if (!text || sending) return;
      const sentRef = ref;
      sending = true;
      const btn = qs('button[type=submit]', bar);
      btn.disabled = true;
      try {
        const r = await send(text, sentRef);
        if (ta.value === draft) { ta.value = ''; ta.style.height = ''; ta.blur(); syncText(); }
        if (ref === sentRef) clearRef();
        toast('已发送');
        if (onSent) onSent(r);
      } catch (err) {
        toast(errMsg(err));
      } finally {
        sending = false;
        btn.disabled = false;
      }
    });
  }

  // ───────────────────────── renderers ─────────────────────────
  function cardHTML(c) {
    if (!c || !(c.title || c.url)) return '';
    const r = routeForUrl(c.uri) || routeForUrl(c.url);
    const image = pic(c.image);
    // Card URLs come from the API; filter them so long-press "open in new tab" can't run a script URL.
    return `<a class="dml-linkcard" href="${esc(safeURL(c.url) || '#')}"${r ? ` data-route="${esc(r)}"` : ''}>${image ? `<img loading="lazy" src="${esc(image)}">` : ''}<div><b>${esc(c.title || '')}</b><span>${esc(c.subtitle || c.desc || '')}</span></div></a>`;
  }

  function userRoute(user) {
    const linked = routeForUrl(user && (user.uri || user.url));
    if (linked && linked.startsWith('user/')) return linked;
    const id = user && (user.id || user.uid);
    return id && /^[A-Za-z0-9_.-]+$/.test(String(id)) ? 'user/' + id : null;
  }
  function authorName(user) {
    const route = userRoute(user);
    return route ? `<a class="dml-name dml-author" href="#dml/${esc(route)}" data-route="${esc(route)}">${esc(user.name || '')}</a>` : `<button class="dml-name" data-act="user-unavailable">${esc(user && user.name || '豆友')}</button>`;
  }
  function authorAvatar(user, small = false) {
    const route = userRoute(user);
    const avatar = user && user.avatar;
    const image = `<img class="dml-avatar${small ? ' s' : ''}" loading="lazy" alt="${esc(user && user.name || '豆友')}"${avatar ? ` src="${esc(avatar)}"` : ''}>`;
    return route ? `<a href="#dml/${esc(route)}" data-route="${esc(route)}" aria-label="查看${esc(user.name || '豆友')}的主页">${image}</a>` : image;
  }
  function personalTopicId(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      if (!/(^|\.)douban\.com$/.test(url.hostname)) return null;
      const match = url.pathname.match(/^\/topic\/(\d+)(?:\/|$)/);
      return match && match[1];
    } catch (_) { return null; }
  }
  function statusTopicId(status) {
    const cardTopic = status.card && status.card.type === 'topic' && /^\d+$/.test(String(status.card.id || '')) ? String(status.card.id) : null;
    return status._topicId || cardTopic || personalTopicId(status.url) || personalTopicId(status.uri) || personalTopicId(status.card && (status.card.url || status.card.uri));
  }
  const statusSnapshots = new Map();
  function rememberStatus(status) {
    if (!status || !status.id) return;
    statusSnapshots.delete(String(status.id));
    statusSnapshots.set(String(status.id), status);
    // This is only an in-memory alias cache; cap it so scrolling cannot grow it indefinitely.
    if (statusSnapshots.size > 200) statusSnapshots.delete(statusSnapshots.keys().next().value);
  }
  function statusRoute(status) {
    const topic = statusTopicId(status);
    return topic ? 'topic/' + topic : Object.prototype.hasOwnProperty.call(status, '_route') ? status._route : 'status/' + status.id;
  }
  function feedStatus(item) {
    if (!item) return null;
    const legacy = (item.status && typeof item.status === 'object' && item.status) || (item.type === 'status' && item.content && item.content.status) || (item.author && item);
    if (legacy) return legacy;
    const content = item.content || {};
    const author = content.author || item.owner;
    if (!item.id || !author) return null;
    // Modern lifestream topics share the topic/comment API, not the legacy /status API.
    const topic = item.type === 'topic' ? content.id || item.id : null;
    const route = routeForUrl(item.uri) || routeForUrl(item.url) || routeForUrl(content.uri) || routeForUrl(content.url);
    return { id: item.id, author, text: content.abstract || content.title || '', create_time: item.created_time,
      activity: item.activity || '', images: (content.photos || []).map((photo) => photo.image || photo),
      card: content.card || (!topic && { title: content.title || item.type_cn || '查看原文', subtitle: content.abstract || '', url: safeURL(item.url || content.url) }), comments_count: item.comments_count, reactions_count: item.reactions_count,
      reaction_type: item.reaction_type, reshares_count: item.reshares_count, _topicId: topic, _route: route };
  }

  function statusBody(s, nested) {
    rememberStatus(s); // Reshared originals also need a snapshot when opened from the nested card.
    const a = s.author || {};
    const imgs = (s.images || []).map((im) => ({ t: pic(im), b: pic(im, true) })).filter((x) => x.t);
    const grid = imgs.length
      ? `<div class="dml-imgs n${Math.min(imgs.length, 3)}">${imgs
          .map((x) => `<img loading="lazy" src="${esc(x.t)}" data-act="img" data-src="${esc(x.b || x.t)}" tabindex="0" role="button" aria-label="查看图片">`)
          .join('')}</div>`
      : '';
    return `<div class="dml-row">
      ${nested ? '' : authorAvatar(a)}
      <div class="dml-col">
        <div>${authorName(a)} <span class="dml-meta">${esc(s.activity || '')}</span></div>
        <div class="dml-meta">${ago(s.create_time)}</div>
        ${s.text ? `<div class="dml-text">${textHTML(s.text)}</div>` : ''}
        ${grid}
        ${cardHTML(s.card)}
        ${!nested && s.reshared_status && s.reshared_status.id ? `<div class="dml-reshared" data-route="${esc(statusRoute(s.reshared_status))}">${statusBody(s.reshared_status, true)}</div>` : ''}
      </div>
    </div>`;
  }

  function statusHTML(s, { detail = false } = {}) {
    if (!s || !s.id || !s.author) return '';
    rememberStatus(s);
    const topic = statusTopicId(s);
    const target = statusRoute(s);
    const actionable = !!topic || !!(target && target.startsWith('status/'));
    const liked = !!(s.liked || s.reaction_type > 0);
    const likes = s.like_count ?? s.reactions_count ?? 0;
    return `<article class="dml-cell"${detail || !target ? '' : ` data-route="${esc(target)}"`}>
      ${statusBody(s)}
      ${actionable ? `<div class="dml-acts${detail ? ' flush' : ''}">
        <button ${detail ? 'data-act="reply-focus"' : `data-route="${esc(target)}"`} aria-label="查看回复${s.comments_count ? ' ' + esc(s.comments_count) : ''}">${ICON.comment}<span>${esc(s.comments_count || '')}</span></button>
        <button data-act="reshare" data-id="${esc(s.id)}"${topic ? ` data-topic="${esc(topic)}"` : ''} aria-label="转发广播">${ICON.reshare}<span>${esc(s.reshares_count || '')}</span></button>
        <button data-act="like" data-api="${topic ? 'group/topic' : 'status'}" data-id="${esc(topic || s.id)}" data-liked="${liked ? 1 : 0}" aria-label="${liked ? '取消赞' : '赞'}" class="${liked ? 'on' : ''}">${ICON.heart}<span>${esc(likes || '')}</span></button>
      </div>` : ''}
    </article>`;
  }

  function commentHTML(c, { opId, floor } = {}) {
    if (!c || !c.id) return '';
    const a = c.author || {};
    const isOp = opId && a.id === opId;
    const ref = c.ref_comment && (c.ref_comment.text || c.ref_comment.author)
      ? `<div class="dml-quote">${esc((c.ref_comment.author && c.ref_comment.author.name) || '')}：${esc(c.ref_comment.text || '')}</div>`
      : '';
    const photos = (c.photos || []).map((p) => pic(p.image || p)).filter(Boolean);
    return `<div class="dml-cell dml-comment${isOp ? ' is-op' : ''}">
      <div class="dml-row">
        ${authorAvatar(a, true)}
        <div class="dml-col">
          <div class="dml-meta">${authorName(a)}${isOp ? '<span class="op">楼主</span>' : ''} · ${ago(c.create_time)}${floor ? ` · #${floor}` : ''}</div>
          ${ref}
          <div class="dml-text">${textHTML(c.text || '')}</div>
          ${photos.length ? `<div class="dml-imgs n${Math.min(photos.length, 3)}">${photos.map((u) => `<img loading="lazy" src="${esc(u)}" data-act="img" data-src="${esc(u)}" tabindex="0" role="button" aria-label="查看图片">`).join('')}</div>` : ''}
          <div class="dml-cacts"><button data-act="ref" data-cid="${esc(c.id)}" data-name="${esc(a.name || '')}">回复</button>${c.vote_count ? `<span>赞 ${c.vote_count}</span>` : ''}</div>
        </div>
      </div>
    </div>`;
  }

  function interestHTML(c) {
    if (!c || !c.id) return '';
    const u = c.user || {};
    return `<div class="dml-cell">
      <div class="dml-row">
        <img class="dml-avatar s" loading="lazy" src="${esc(u.avatar || '')}">
        <div class="dml-col">
          <div class="dml-meta"><span class="dml-name" style="color:var(--text)">${esc(u.name || '')}</span> ${stars(c.rating)} · ${ago(c.create_time)}</div>
          <div class="dml-text">${textHTML(c.comment || '')}</div>
          ${c.vote_count ? `<div class="dml-cacts"><span>有用 ${c.vote_count}</span></div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function reviewRowHTML(r) {
    if (!r || !r.id) return '';
    const u = r.user || {};
    return `<div class="dml-cell" data-route="review/${esc(r.id)}">
      <div class="dml-title">${esc(r.title || '')}</div>
      <div class="dml-meta" style="margin:4px 0">${esc(u.name || '')} ${stars(r.rating)} · ${ago(r.create_time)}</div>
      <div class="dml-text dml-clamp3" style="font-size:15px;color:var(--sub)">${esc(r.abstract || '')}</div>
      ${r.useful_count ? `<div class="dml-cacts"><span>有用 ${r.useful_count}</span>${r.comments_count ? `<span>回应 ${r.comments_count}</span>` : ''}</div>` : ''}
    </div>`;
  }

  // List rows only carry bare names (no ids or portraits), so credits are labelled text lines
  // instead of the raw "a / b / c" subtitle; rows without credit arrays keep that subtitle.
  function rowCreditsHTML(subj) {
    const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (x && x.name) || x).filter((x) => typeof x === 'string' && x);
    const credits = [['导演', list(subj.directors)], ['主演', list(subj.actors).slice(0, 4)], ['作者', list(subj.author)], ['表演者', list(subj.singer)]].filter(([, n]) => n.length);
    const sub = String(subj.card_subtitle || subj.subtitle || '');
    if (!credits.length) return sub ? `<div class="dml-meta dml-clamp2">${esc(sub)}</div>` : '';
    // Drop the credit names from the subtitle so only year/region/genre/publisher remain.
    const names = new Set(credits.flatMap(([, n]) => n.flatMap((x) => [x, ...x.split(/\s+/)])));
    const meta = sub.split(' / ').filter((part) => part && !part.split(/\s+/).every((w) => names.has(w)) && !names.has(part)).join(' · ');
    return `${meta ? `<div class="dml-meta dml-clamp2">${esc(meta)}</div>` : ''}${credits.map(([k, n]) => `<div class="dml-credit"><b>${k}</b>${esc(n.join(' / '))}</div>`).join('')}`;
  }

  function subjectRowHTML(subj, extra = '') {
    if (!subj || !subj.id) return '';
    const type = subj.type || 'movie';
    return `<a class="dml-cell" href="#dml/subject/${esc(type)}/${esc(subj.id)}" data-route="subject/${esc(type)}/${esc(subj.id)}">
      <div class="dml-row">
        <img class="dml-poster" loading="lazy" src="${esc(pic(subj.pic || subj.cover || subj.cover_url))}">
        <div class="dml-col">
          <div class="dml-title">${esc(subj.title || '')}</div>
          ${rowCreditsHTML(subj)}
          ${extra}
        </div>
      </div>
    </a>`;
  }

  function topicRowHTML(t, showGroup) {
    if (!t || !t.id) return '';
    const g = t.group || {};
    const a = t.author || {};
    return `<div class="dml-cell" data-route="topic/${esc(t.id)}">
      <div class="dml-title dml-clamp2">${esc(t.title || '')}</div>
      <div class="dml-meta" style="margin-top:4px">${showGroup && g.name ? esc(g.name) + ' · ' : ''}${esc(a.name || '')} · ${ago(t.update_time || t.create_time)}${t.comments_count ? ` · ${t.comments_count}回应` : ''}</div>
    </div>`;
  }

  // ───────────────────────── views ─────────────────────────
  function vTimeline(v) {
    const main = page(v, { title: '动态', tab: 'timeline', right: loggedIn() ? `<button data-act="compose" aria-label="发广播">${ICON.compose}</button>` : '' });
    if (!loggedIn()) { main.innerHTML = loginTip('登录后查看友邻广播。'); return; }
    const paths = ['/status/home_timeline'];
    pager(
      v,
      main,
      async (cursor) => {
        const d = await api.get(paths, { max_id: cursor, count: 20 });
        const raw = d.items || d.statuses;
        if (!Array.isArray(raw)) throw new Error('接口未返回广播列表');
        const items = raw.map(feedStatus).filter((s) => s && s.id && s.author);
        const last = raw.length ? (raw[raw.length - 1].status || raw[raw.length - 1]).id : null;
        return { items, next: last };
      },
      (s) => statusHTML(s),
      { empty: '还没有动态' }
    );
  }

  async function vStatus(v, id) {
    const main = page(v, { title: '广播', tabbar: false });
    main.innerHTML = loadingHTML();
    let s = statusSnapshots.get(String(id));
    if (s && statusTopicId(s)) return vTopic(v, statusTopicId(s));
    // Timeline/profile entries already contain the full status; reuse it to avoid a second request.
    if (!s) {
      try { s = await api.get(`/status/${id}`); }
      catch (e) { main.innerHTML = errHTML(e); return; }
    }
    if (statusTopicId(s)) return vTopic(v, statusTopicId(s));
    main.innerHTML = statusHTML(s, { detail: true }) + `<div class="dml-section">回复${s.comments_count ? ' ' + s.comments_count : ''}</div>`;
    const p = pager(v, main, offsetLoader((start, count) => api.get(`/status/${id}/comments`, { start, count }), 'comments'), (c) => commentHTML(c), { empty: '还没有回复' });
    replyBar(v, {
      placeholder: '回复广播…',
      send: (text, ref) => api.post(`/status/${id}/create_comment`, { text, ref_comment_id: ref }),
      onSent: (c) => p.add(c),
    });
  }

  async function vUser(v, uid) {
    const main = page(v, { title: '豆友', tab: 'timeline' });
    main.innerHTML = loadingHTML();
    let user;
    try { user = await api.get('/user/' + encodeURIComponent(uid)); }
    catch (e) { main.innerHTML = errHTML(e); return; }
    setTitle(v, user.name || '豆友');
    main.innerHTML = `<div class="dml-cell"><div class="dml-row">${authorAvatar(user)}<div class="dml-col"><div class="dml-name">${esc(user.name || '豆友')}</div>${user.loc && user.loc.name ? `<div class="dml-meta">${esc(user.loc.name)}</div>` : ''}</div></div>${user.intro || user.desc ? `<div class="dml-text">${textHTML(user.intro || user.desc)}</div>` : ''}</div><div class="dml-section">动态</div><div data-user-feed></div>`;
    const box = qs('[data-user-feed]', main);
    let slices;
    try {
      const data = await api.get(`/user/${encodeURIComponent(user.id || uid)}/lifestream/timeslices`);
      if (!Array.isArray(data.timeslices)) throw new Error('接口未返回用户动态时间段');
      slices = data.timeslices.filter((slice) => !slice.empty && !slice.fold);
      if (!slices.length) { box.innerHTML = '<div class="dml-empty">暂无可见动态</div>'; return; }
    } catch (e) { box.innerHTML = errHTML(e); return; }
    pager(v, box, async (cursor = { index: 0 }) => {
      const slice = slices[cursor.index];
      const data = await api.get(`/user/${encodeURIComponent(user.id || uid)}/lifestream`, { slice: slice.slice, hot: !!slice.hot, filter_after: cursor.after, count: 20 });
      if (!Array.isArray(data.items)) throw new Error('接口未返回用户动态');
      const items = data.items.map(feedStatus).filter(Boolean);
      const after = data.next_filter_after;
      const next = after != null && after !== '' ? { index: cursor.index, after } : cursor.index + 1 < slices.length ? { index: cursor.index + 1 } : null;
      return { items, next };
    }, statusHTML, { empty: '暂无可见动态' });
  }

  function neoDBUrl(type, id) {
    const host = { movie: 'movie', tv: 'movie', book: 'book', music: 'music' }[type];
    if (!host || !/^\d+$/.test(String(id))) return '';
    // NeoDB's web lookup resolves a supported source URL to its matching record.
    // Send only the public canonical item URL, never the current page or session parameters.
    const url = new URL('https://neodb.social/search/');
    url.searchParams.set('q', `https://${host}.douban.com/subject/${id}/`);
    return url.href;
  }

  // Credits render as a horizontal strip of portrait cards. The subject payload only carries bare
  // names, so the richer /celebrities endpoint (avatar, role, character) is fetched separately and
  // the text-only line stays as the fallback if it fails or the type has no cast.
  function castTextHTML(s, skipPeople) {
    const names = (list) => (list || []).map((p) => (p && p.name) || '').filter(Boolean);
    // Books and music have no cast; their credits are plain string/name lists on the payload.
    const rows = [
      ['导演', names(s.directors)], ['主演', names(s.actors)],
      ['作者', names((s.author || []).map((n) => ({ name: n })))], ['译者', names((s.translator || []).map((n) => ({ name: n })))],
      ['表演者', names(s.singer)],
      [s.type === 'music' ? '出版者' : '出版社', names((s.press || s.publisher || []).map((n) => ({ name: n })))],
      ['出版年', names((s.pubdate || []).map((n) => ({ name: n }))).slice(0, s.type === 'book' ? 1 : 0)],
      ['页数', names((s.pages || []).map((n) => ({ name: n })))], ['定价', names((s.price || []).map((n) => ({ name: n })))],
      ['介质', names((s.media || []).map((n) => ({ name: n })))], ['唱片数', names((s.discs || []).map((n) => ({ name: n })))],
      ['发行时间', names((s.pubdate || []).map((n) => ({ name: n }))).slice(0, s.type === 'music' ? 1 : 0)],
    ].filter(([k, n]) => n.length && !(skipPeople && (k === '作者' || k === '译者')));
    const intro = s.type === 'book' && s.author_intro ? `<div class="dml-section">作者简介</div><div class="dml-intro clamp" data-act="expand">${esc(s.author_intro)}</div>` : '';
    return rows.length || intro ? intro && !rows.length ? intro : `<div class="dml-cast">${rows.map(([k, n]) => `<div><b>${k}</b> ${esc(n.join(' / '))}</div>`).join('')}</div>${intro}` : '';
  }
  function castCardHTML(c, role, kind = 'celebrity') {
    const photo = pic(c.avatar, true);
    // Only movie casts carry a short character name; author payloads put a long bio there.
    const sub = kind === 'celebrity' && c.character && c.character !== role ? c.character : role;
    const body = `${photo ? `<img loading="lazy" alt="" src="${esc(photo)}">` : '<span class="ph"></span>'}<div class="n">${esc(c.name || '')}</div><div class="r">${esc(sub || '')}</div>`;
    // Open the in-app celebrity page; entries without an id stay plain cards.
    return c.id ? `<a class="dml-person" href="#dml/${kind}/${esc(c.id)}" data-route="${kind}/${esc(c.id)}">${body}</a>` : `<div class="dml-person">${body}</div>`;
  }
  async function loadCast(box, type, id, s) {
    box.innerHTML = castTextHTML(s);
    if (type === 'book') {
      try {
        const d = await api.get(`/book/${id}/authors`);
        const groups = [['authors', '作者'], ['translators', '译者'], ['painters', '绘者'], ['photographers', '摄影'], ['editors', '编者']];
        const cards = groups.flatMap(([k, role]) => (d[k] || []).map((c) => castCardHTML(c, role, 'author')));
        if (cards.length && box.isConnected) box.innerHTML = `<div class="dml-section">作者</div><div class="dml-people">${cards.join('')}</div>` + castTextHTML(s, true);
      } catch (e) { /* keep the text fallback */ }
      return;
    }
    if (type !== 'movie' && type !== 'tv') return;
    try {
      const d = await api.get(`/${type}/${id}/celebrities`);
      const cards = [...(d.directors || []).map((c) => castCardHTML(c, '导演')), ...(d.actors || []).map((c) => castCardHTML(c, '演员'))];
      if (cards.length && box.isConnected) box.innerHTML = `<div class="dml-section">影人</div><div class="dml-people">${cards.join('')}</div>`;
    } catch (e) { /* keep the text fallback */ }
  }

  // Celebrity page: portrait, the profile rows Douban publishes, and a paged filmography with
  // the roles this person held in each work.
  const vCelebrity = (v, id) => vPerson(v, 'celebrity', id);
  const vAuthor = (v, id) => vPerson(v, 'author', id);
  // A /personage/ link carries neither id, so look up which celebrity or author it stands for.
  async function vPersonage(v, id) {
    const main = page(v, { title: '人物', tab: 'library' });
    main.innerHTML = loadingHTML();
    try {
      const d = await api.get(`/personage/${id}`);
      if (d.celebrity_id) return go(`celebrity/${d.celebrity_id}`, true);
      if (d.author_id) return go(`author/${d.author_id}`, true);
      main.innerHTML = errHTML({ message: '暂不支持此类人物页' });
    } catch (e) {
      main.innerHTML = errHTML(e);
    }
  }
  async function vPerson(v, kind, id) {
    const main = page(v, { title: '影人', tab: 'library' });
    main.innerHTML = loadingHTML();
    let c;
    try {
      c = await api.get(`/${kind}/${id}`);
    } catch (e) {
      main.innerHTML = errHTML(e);
      return;
    }
    setTitle(v, c.title || c.name);
    const photo = pic(c.cover, true) || pic(c.cover_img, true) || pic(c.avatar, true);
    // Celebrities publish labelled profile rows; authors expose flat fields instead.
    const info = kind === 'author'
      ? [['出生日期', c.birthday && !/^0+/.test(c.birthday) ? c.birthday : ''], ['国籍', c.nationality], ['代表作', c.stand_for], ['简介', c.intro || c.abstract]].filter((r) => r[1])
      : ((c.extra && c.extra.info) || []).filter((r) => Array.isArray(r) && r[1]);
    main.innerHTML = `
      <div class="dml-subj" style="--poster:${esc(cssURL(photo))}">
        ${photo ? `<img src="${esc(photo)}" alt="${esc(c.title || '')}" data-act="img" data-src="${esc(photo)}" tabindex="0" role="button">` : ''}
        <div class="dml-col"><h2>${esc(c.title)}</h2>${c.latin_title || c.latin_name ? `<div class="dml-meta">${esc(c.latin_title || c.latin_name)}</div>` : ''}</div>
      </div>
      ${info.length ? `<div class="dml-cinfo">${info.map(([k, val]) => `<div><b>${esc(k)}</b>${esc(val)}</div>`).join('')}</div>` : ''}
      <div class="dml-section">作品</div><div data-works></div>`;
    pager(v, qs('[data-works]', main), offsetLoader((start, count) => api.get(`/${kind}/${id}/works`, { start, count }), 'works'), (w) => {
      // Celebrity works wrap the subject with roles; author works are the subjects themselves.
      const subj = w.work || w;
      return subjectRowHTML(Object.assign({ type: /^(movie|tv|book|music)$/.test(subj.type) ? subj.type : 'movie' }, subj), kind === 'celebrity' && w.roles && w.roles.length ? `<div class="dml-meta" style="margin-top:4px">${esc(w.roles.join(' / '))}</div>` : '');
    }, { empty: '暂无作品' });
  }

  async function vSubject(v, type, id) {
    const main = page(v, { title: TYPE_NAME[type] || '条目', tab: 'library' });
    main.innerHTML = loadingHTML();
    let s;
    const alt = type === 'movie' ? ['/tv/' + id] : type === 'tv' ? ['/movie/' + id] : [];
    try {
      s = await api.get([`/${type}/${id}`, ...alt]);
    } catch (e) {
      main.innerHTML = errHTML(e);
      return;
    }
    type = s.type || type;
    setTitle(v, s.title);
    const verbs = verbsFor(type);
    const it = s.interest && s.interest.status ? s.interest : null;
    const r = s.rating || {};
    const sub = s.card_subtitle || [s.year, ...(s.genres || [])].filter(Boolean).join(' / ');
    const poster = pic(s.pic || s.cover_url, true);
    const neodb = neoDBUrl(type, id);
    main.innerHTML = `
      <div class="dml-subj" style="--poster:${esc(cssURL(poster))}">
        <img src="${esc(poster)}" alt="${esc(s.title || '')}" data-act="img" data-src="${esc(poster)}" tabindex="0" role="button">
        <div class="dml-col">
          <h2>${esc(s.title)}</h2>
          ${s.original_title && s.original_title !== s.title ? `<div class="dml-meta">${esc(s.original_title)}</div>` : ''}
          <div class="dml-meta" style="margin-top:4px">${esc(sub)}</div>
          <div class="dml-score">${r.value ? `<b>${Number(r.value).toFixed(1)}</b>${stars(r)}<span class="dml-meta">${r.count || 0}人评价</span>` : '<span class="dml-meta">暂无评分</span>'}</div>
          ${neodb ? `<a class="dml-chip" style="margin-top:12px;margin-bottom:0" href="${esc(neodb)}" target="_blank" rel="noopener noreferrer" aria-label="在 NeoDB 打开此条目（新标签页）">在 NeoDB 打开 ↗</a>` : ''}
        </div>
      </div>
      <div class="dml-marks">${STATUSES.map((k, i) => `<button data-act="mark" data-status="${k}" class="${it && it.status === k ? 'on' : ''}">${it && it.status === k ? '✓ ' : ''}${verbs[i]}</button>`).join('')}</div>
      ${it ? `<div class="dml-mine">我${verbs[STATUSES.indexOf(it.status)] || ''} ${stars(it.rating)}${it.create_time ? ' · ' + ago(it.create_time) : ''}${it.comment ? `<div class="dml-text" style="font-size:14px">${textHTML(it.comment)}</div>` : ''}</div>` : ''}
      <div data-cast></div>
      ${s.intro ? `<div class="dml-intro clamp" data-act="expand">${esc(s.intro)}</div>` : ''}
      <div class="dml-seg" data-seg="kind"><button class="on" data-act="kind" data-k="comments">短评</button><button data-act="kind" data-k="reviews">${REVIEW_NAME[type] || '影评'}</button></div>
      <div class="dml-seg" data-seg="order"><button class="on" data-act="order" data-k="hot">热门</button><button data-act="order" data-k="latest">最新</button></div>
      <div data-box></div>`;
    loadCast(qs('[data-cast]', main), type, id, s);
    const box = qs('[data-box]', main);
    const orderSeg = qs('[data-seg=order]', main);
    let kind = 'comments', order = 'hot', p = null;
    const load = () => {
      if (p) p.stop();
      box.innerHTML = '';
      orderSeg.style.display = kind === 'comments' ? '' : 'none';
      p =
        kind === 'comments'
          ? pager(v, box, offsetLoader((start, count) => api.get(`/${type}/${id}/interests`, { start, count, order_by: order }), 'interests'), interestHTML, { empty: '暂无短评' })
          : pager(v, box, offsetLoader((start, count) => api.get(`/${type}/${id}/reviews`, { start, count }), 'reviews'), reviewRowHTML, { empty: '暂无评论' });
    };
    const segPick = (seg, el) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    v.acts.kind = (el) => {
      kind = el.dataset.k;
      segPick(el.parentElement, el);
      load();
    };
    v.acts.order = (el) => {
      order = el.dataset.k;
      segPick(el.parentElement, el);
      load();
    };
    v.acts.mark = (el) => {
      if (!loggedIn()) return needLogin();
      markSheet(s, type, el.dataset.status);
    };
    load();
  }

  function markSheet(s, type, status) {
    const verbs = verbsFor(type);
    const it = s.interest && s.interest.status ? s.interest : null;
    let rating = (it && it.rating && it.rating.value) || 0;
    const tags = it && it.tags ? [].concat(it.tags).map((t) => (typeof t === 'string' ? t : t.name)).join(' ') : '';
    sheet(
      `<div class="dml-sheet-head"><button class="dml-gbtn" data-sheet-close aria-label="取消">${ICON.close}</button><b>${esc(s.title)}</b><button class="dml-gbtn primary" data-save aria-label="保存">${ICON.check}</button></div>
       <div class="dml-seg">${STATUSES.map((k, i) => `<button type="button" data-st="${k}" class="${k === status ? 'on' : ''}">${verbs[i]}</button>`).join('')}</div>
       <div class="dml-rate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n}星" class="${n <= rating ? 'on' : ''}">★</button>`).join('')}</div>
       <input class="dml-field" data-tags placeholder="标签（用空格分隔，选填）" value="${esc(tags)}">
       <textarea class="dml-textarea" data-comment maxlength="350" placeholder="写短评（选填）">${esc((it && it.comment) || '')}</textarea>
       ${it ? '<button type="button" class="dml-danger" data-remove>删除标记</button>' : ''}`,
      (w, close) => {
        const rate = qs('.dml-rate', w);
        const syncRate = () => {
          rate.style.display = status === 'mark' ? 'none' : '';
          rate.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n <= rating));
        };
        syncRate();
        rate.addEventListener('click', (e) => {
          const b = e.target.closest('[data-n]');
          if (!b) return;
          rating = rating === +b.dataset.n ? 0 : +b.dataset.n;
          syncRate();
        });
        qs('.dml-seg', w).addEventListener('click', (e) => {
          const b = e.target.closest('[data-st]');
          if (!b) return;
          status = b.dataset.st;
          w.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b));
          syncRate();
        });
        qs('[data-save]', w).addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await api.post([`/${type}/${s.id}/${status}`, `/${type}/${s.id}/mark`], {
              interest: status,
              rating: status === 'mark' ? undefined : rating || undefined,
              tags: qs('[data-tags]', w).value.trim(),
              comment: qs('[data-comment]', w).value.trim(),
            });
            close();
            toast('已保存');
            refresh();
          } catch (err) {
            toast(errMsg(err));
            btn.disabled = false;
          }
        });
        const rm = qs('[data-remove]', w);
        if (rm)
          rm.addEventListener('click', async () => {
            if (!confirm('确定删除这条标记？')) return;
            try {
              await api.post(`/${type}/${s.id}/unmark`, {});
              close();
              toast('已删除');
              refresh();
            } catch (err) {
              toast(errMsg(err));
            }
          });
      }
    );
  }

  async function vReview(v, id) {
    const main = page(v, { title: '评论', tab: 'library' });
    main.innerHTML = loadingHTML();
    let r;
    try {
      r = await api.get(`/review/${id}`);
    } catch (e) {
      main.innerHTML = errHTML(e);
      return;
    }
    let html = r.content || r.fulltext || '';
    if (!html || html.length <= (r.abstract || '').length + 20) {
      try {
        const f = await api.get(`/review/${id}/fulltext`);
        html = f.html || f.content || f.fulltext || html;
      } catch (_) {}
    }
    if (!html) html = textHTML(r.abstract || '');
    const u = r.user || {};
    const subj = r.subject;
    main.innerHTML = `<div class="dml-article">
      ${subj && subj.id ? `<a class="dml-chip" href="#" data-route="subject/${esc(subj.type || 'movie')}/${esc(subj.id)}">${esc(subj.title || '')}</a>` : ''}
      <h2>${esc(r.title || '')}</h2>
      <div class="dml-row" style="align-items:center"><img class="dml-avatar s" src="${esc(u.avatar || '')}"><div class="dml-col"><div class="dml-name">${esc(u.name || '')}</div><div class="dml-meta">${stars(r.rating)} ${ago(r.create_time)}</div></div></div>
      <div class="dml-rich">${sanitize(html)}</div>
      ${r.useful_count ? `<div class="dml-meta" style="margin-top:16px">${r.useful_count} 人觉得有用</div>` : ''}
    </div>`;
  }

  // Resolve pasted Douban links locally; no search terms or history are stored.
  function openLinkHTML() {
    return `<div class="dml-group"><form data-open-link class="dml-linkform"><label for="dml-link" class="dml-name">打开豆瓣条目或话题</label><input id="dml-link" class="dml-field" type="url" required placeholder="https://m.douban.com/movie/1292052"><button type="submit">打开链接</button><p data-link-error role="status" class="dml-meta"></p></form></div>`;
  }
  function mountOpenLink(main) {
    qs('[data-open-link]', main).addEventListener('submit', (e) => {
      e.preventDefault();
      const route = routeForUrl(qs('input', e.currentTarget).value.trim());
      if (route) go(route);
      else qs('[data-link-error]', main).textContent = '请粘贴豆瓣电影、图书、音乐、广播、评论或小组链接';
    });
  }

  // Use the same HTML and JSON endpoints as Douban's mobile search, without a third-party index.
  const SEARCH_TYPES = { all: '全部', 1002: '影视', 1001: '图书', 1003: '音乐', 1019: '小组' };
  function searchRows(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('li > a[href]')).flatMap((a) => {
      const route = routeForUrl(new URL(a.getAttribute('href'), 'https://m.douban.com').href);
      const title = qs('.subject-title', a)?.textContent.trim();
      if (!route || !title) return [];
      // Extract text and safe image URLs only; server markup must never become executable UI.
      return [{ id: route, route, title, image: safeURL(qs('img', a)?.getAttribute('src')),
        meta: qs('.rating', a)?.textContent.trim().replace(/\s+/g, ' ') || '' }];
    });
  }
  function searchRowHTML(item) {
    return `<a class="dml-cell" href="#dml/${esc(item.route)}" data-route="${esc(item.route)}"><div class="dml-row">${item.image ? `<img class="dml-poster" loading="lazy" alt="" src="${esc(item.image)}">` : ''}<div class="dml-col"><div class="dml-title">${esc(item.title)}</div><div class="dml-meta">${esc(item.meta)}</div></div></div></a>`;
  }
  async function fetchSearch(url, json = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (!res.ok) throw new ApiError(res.status);
      return json ? await res.json() : await res.text();
    } finally { clearTimeout(timeout); }
  }
  function vSearch(v, type = 'all', encoded = '') {
    type = SEARCH_TYPES[type] ? type : 'all';
    let query = '';
    try { query = decodeURIComponent(encoded); } catch (_) {}
    const main = page(v, { title: '搜索', tab: 'search' });
    main.innerHTML = `<div class="dml-group"><form data-search class="dml-linkform" role="search"><label for="dml-search" class="dml-name">搜索豆瓣</label><input id="dml-search" class="dml-field" type="search" required placeholder="搜索书影音、小组" value="${esc(query)}"><button type="submit">搜索</button></form></div><div class="dml-seg scroll" aria-label="搜索类型">${['all', '1002', '1001', '1003', '1019'].map((key) => [key, SEARCH_TYPES[key]]).map(([key, name]) => `<button data-act="search-type" data-type="${key}" class="${key === type ? 'on' : ''}">${name}</button>`).join('')}</div><div data-search-results aria-live="polite"></div>`;
    const field = qs('input', main);
    const box = qs('[data-search-results]', main);
    let activePager = null, generation = 0;
    // Each search replaces the pager. A late response from an earlier query cannot overwrite it.
    const run = async () => {
      const term = field.value.trim();
      const token = ++generation;
      if (activePager) activePager.stop();
      box.innerHTML = '';
      if (!term) { box.innerHTML = '<div class="dml-empty">输入关键词搜索豆瓣</div>'; return; }
      const selectedType = type;
      const params = new URLSearchParams({ query: term });
      if (selectedType !== 'all') params.set('type', selectedType);
      const nativeURL = 'https://m.douban.com/search/?' + params;
      box.innerHTML = loadingHTML();
      try {
        if (selectedType === 'all') {
          const html = await fetchSearch(nativeURL);
          if (token !== generation || v.dead) return;
          const doc = new DOMParser().parseFromString(html, 'text/html');
          if (!qs('.search-results', doc)) throw new Error('豆瓣暂未返回搜索结果，请稍后重试');
          const sections = Array.from(doc.querySelectorAll('.search-module'));
          box.innerHTML = sections.map((section) => {
            const rows = searchRows(section.innerHTML);
            const more = qs('.search-results-modules-more[href]', section);
            const moreRoute = more && routeForUrl(new URL(more.getAttribute('href'), nativeURL).href);
            return rows.length ? `<div class="dml-section">${esc(qs('.search-results-modules-name', section)?.textContent || '')}</div><div class="dml-list">${rows.map(searchRowHTML).join('')}</div>${moreRoute ? `<a class="dml-more" href="#dml/${esc(moreRoute)}" data-route="${esc(moreRoute)}">${esc(more.textContent)}</a>` : ''}` : '';
          }).join('') || '<div class="dml-empty">没有找到相关结果</div>';
        } else {
          box.innerHTML = '';
          activePager = pager(v, box, async (p = 0) => {
            const args = new URLSearchParams({ q: term, t: selectedType, p });
            const data = await fetchSearch('/j/search/?' + args, true);
            if (typeof data.html !== 'string' || !Number.isFinite(data.count) || !Number.isFinite(data.limit) || data.limit <= 0) throw new Error('豆瓣暂未返回搜索结果，请稍后重试');
            return { items: searchRows(data.html), next: (p + 1) * data.limit < data.count ? p + 1 : null };
          }, searchRowHTML, { empty: '没有找到相关结果' });
        }
      } catch (e) {
        if (token === generation && !v.dead) box.innerHTML = errHTML(e);
      }
    };
    qs('form', main).addEventListener('submit', (e) => { e.preventDefault(); run(); });
    v.acts['search-type'] = (el) => {
      type = el.dataset.type;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      run();
    };
    // Queries stay in this view's memory; submitting does not add them to browser history or storage.
    v.cleanups.push(() => { generation++; });
    run();
  }

  const DISCOVERY = {
    movie: { name: '电影', cats: [['影院热映', 'movie_showing'], ['热门电影', 'movie_hot_gaia'], ['Top 250', 'movie_top250']] },
    tv: { name: '剧集', cats: [['热门剧集', 'tv_hot'], ['国产剧', 'tv_domestic'], ['美剧', 'tv_american'], ['日剧', 'tv_japanese'], ['韩剧', 'tv_korean'], ['动画', 'tv_animation'], ['综艺', 'tv_variety_show']] },
    book: { name: '图书', cats: [['最新', 'book_latest'], ['虚构类', 'book_fiction'], ['非虚构类', 'book_nonfiction'], ['畅销', 'book_bestseller']] },
    music: { name: '音乐', cats: [['华语', 'music_chinese'], ['最新', 'music_latest']] },
  };
  function libraryModes(mode, type = 'movie') {
    const mineType = type === 'tv' ? 'movie' : type;
    return `<div class="dml-seg" aria-label="书影音浏览方式"><button data-act="go" data-route="library/${type}" class="${mode === 'discover' ? 'on' : ''}">发现</button><button data-act="go" data-route="library/${mineType}/done" class="${mode === 'mine' ? 'on' : ''}">我的</button></div>`;
  }
  function vDiscover(v, type = 'movie') {
    const config = DISCOVERY[type] || DISCOVERY.movie;
    const main = page(v, { title: '书影音', tab: 'library' });
    main.innerHTML = libraryModes('discover', type) + `<div class="dml-seg" aria-label="发现类型">${Object.entries(DISCOVERY).map(([key, c]) => `<button data-act="go" data-route="library/${key}" class="${key === type ? 'on' : ''}">${c.name}</button>`).join('')}</div><div class="dml-seg scroll" aria-label="分类筛选">${config.cats.map(([n], i) => `<button data-act="cat" data-i="${i}" class="${i === 0 ? 'on' : ''}">${n}</button>`).join('')}</div><div data-discovery></div>`;
    v.acts.go = (el) => go(el.dataset.route, true);
    const box = qs('[data-discovery]', main);
    let p = null;
    // Public collections stay available regardless of login; the category chips only swap which
    // collection the pager reads, so switching never leaves the page.
    const load = (i) => {
      const collection = config.cats[i][1];
      if (p) p.stop();
      box.innerHTML = '';
      p = pager(v, box, offsetLoader((start, count) => api.get(`/subject_collection/${collection}/items`, { start, count }), 'subject_collection_items'), (item) => {
        const subject = { ...item, type: /^(movie|tv|book|music)$/.test(item.type) ? item.type : type };
        const value = item.rating && item.rating.value;
        return subjectRowHTML(subject, `<div class="dml-rating">${value ? `${stars(item.rating)}<b>${esc(Number(value).toFixed(1))}</b>` : '暂无评分'}</div>`);
      }, { empty: '暂无推荐条目' });
    };
    v.acts.cat = (el) => {
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      load(+el.dataset.i);
    };
    load(0);
  }

  async function vLibrary(v, type, status) {
    type = type || 'movie';
    status = status || 'done';
    const main = page(v, { title: '书影音', tab: 'library' });
    if (!loggedIn()) {
      main.innerHTML = libraryModes('mine', type) + loginTip('登录后查看你标记过的书影音。') + openLinkHTML();
      v.acts.go = (el) => go(el.dataset.route, true);
      mountOpenLink(main);
      return;
    }
    const verbs = verbsFor(type);
    main.innerHTML = libraryModes('mine', type) + `
      <div class="dml-seg">${[['movie', '影视'], ['book', '图书'], ['music', '音乐']].map(([k, n]) => `<button data-act="go" data-route="library/${k}/${status}" class="${k === type ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="dml-seg">${STATUSES.map((k, i) => `<button data-act="go" data-route="library/${type}/${k}" class="${k === status ? 'on' : ''}">${verbs[i]}</button>`).join('')}</div>
      <div data-box>${loadingHTML()}</div>`;
    v.acts.go = (el) => go(el.dataset.route, true);
    const box = qs('[data-box]', main);
    const me = await getMe();
    if (!me) {
      box.innerHTML = errHTML({ message: '无法确定当前用户，请刷新重试' });
      return;
    }
    box.innerHTML = '';
    pager(
      v,
      box,
      offsetLoader((start, count) => api.get(`/user/${me.id}/interests`, { type, status, start, count }), 'interests'),
      (it) => {
        const subj = it.subject || {};
        const extra = `<div class="dml-meta" style="margin-top:4px">${stars(it.rating)} ${ago(it.create_time)}</div>${it.comment ? `<div class="dml-text dml-clamp2" style="font-size:14px">${esc(it.comment)}</div>` : ''}`;
        return subjectRowHTML(Object.assign({ type: subj.type || type }, subj), extra);
      },
      { empty: '这里还是空的' }
    );
  }

  async function joinedGroups(me) {
    const d = await api.get(`/group/user/${me.id}/joined_groups`, { start: 0, count: 100 });
    return d.groups || d.items || [];
  }

  function groupRowHTML(g) {
    return `<a class="dml-cell" href="#dml/group/${esc(g.id)}" data-route="group/${esc(g.id)}"><div class="dml-row"><img class="dml-avatar sq" loading="lazy" alt="" src="${esc(g.avatar || '')}"><div class="dml-col"><div class="dml-name">${esc(g.name || '')}</div><div class="dml-meta">${g.member_count ? esc(g.member_count) + ' 成员' : ''}</div>${g.desc_abstract ? `<div class="dml-text dml-clamp2">${esc(g.desc_abstract)}</div>` : ''}</div></div></a>`;
  }
  async function discoverGroups(box) {
    box.innerHTML = loadingHTML();
    try {
      const data = await api.get('/group/rec_groups_for_newbies');
      if (!Array.isArray(data.rec_groups)) throw new Error('接口未返回小组分类');
      // This is the same public, interest-based feed used by Douban's mobile group guide.
      const categories = data.rec_groups.flatMap((section) => section.classified_groups || []).filter((c) => Array.isArray(c.groups) && c.groups.length);
      if (!categories.length) { box.innerHTML = '<div class="dml-empty">暂无推荐小组</div>'; return; }
      box.innerHTML = `<div style="margin:12px 16px"><label for="dml-group-category">按兴趣发现小组</label><select id="dml-group-category" class="dml-field" style="margin-top:8px"><option value="all">全部分类</option>${categories.map((c, i) => `<option value="${i}">${esc(c.name || '推荐小组')}</option>`).join('')}</select></div><div data-group-results></div>`;
      const select = qs('select', box);
      const draw = () => {
        const selected = select.value === 'all' ? categories : [categories[Number(select.value)]];
        const seen = new Set();
        qs('[data-group-results]', box).innerHTML = selected.map((category) => {
          const groups = category.groups.filter((g) => g && g.id && !seen.has(String(g.id)) && seen.add(String(g.id)));
          return groups.length ? `<div class="dml-section">${esc(category.name || '推荐小组')}</div><div class="dml-list">${groups.map(groupRowHTML).join('')}</div>` : '';
        }).join('');
      };
      select.addEventListener('change', draw);
      draw();
    } catch (e) { box.innerHTML = errHTML(e); }
  }

  async function vGroups(v, mode) {
    mode = mode || 'discover';
    const main = page(v, { title: '小组', tab: 'groups' });
    const modes = `<div class="dml-seg" aria-label="小组浏览方式">${[['discover', '发现'], ['feed', '最新话题'], ['mine', '我的小组']].map(([key, name]) => `<button data-act="go" data-route="groups/${key}" class="${key === mode ? 'on' : ''}">${name}</button>`).join('')}</div>`;
    v.acts.go = (el) => go(el.dataset.route, true);
    main.innerHTML = modes + '<div data-box></div>';
    const box = qs('[data-box]', main);
    if (mode === 'discover') { await discoverGroups(box); return; }
    if (!loggedIn()) {
      box.innerHTML = loginTip('登录后查看你加入的小组和最新话题。');
      return;
    }
    box.innerHTML = loadingHTML();
    const me = await getMe();
    if (!me) {
      box.innerHTML = errHTML({ message: '无法确定当前用户，请刷新重试' });
      return;
    }
    let groups;
    try {
      groups = await joinedGroups(me);
    } catch (e) {
      box.innerHTML = errHTML(e);
      return;
    }
    if (!groups.length) {
      box.innerHTML = '<div class="dml-empty">还没有加入小组</div>';
      return;
    }
    if (mode === 'mine') {
      box.innerHTML = `<div class="dml-list">${groups
        .map(
          (g) => `<div class="dml-cell" data-route="group/${esc(g.id)}"><div class="dml-row" style="align-items:center"><img class="dml-avatar sq" loading="lazy" alt="" src="${esc(g.avatar || '')}"><div class="dml-col"><div class="dml-name">${esc(g.name || '')}</div><div class="dml-meta">${g.member_count ? esc(g.member_count) + ' 成员' : ''}</div></div></div></div>`
        )
        .join('')}</div>`;
      return;
    }
    const sample = groups.slice(0, 12);
    const results = await Promise.allSettled(sample.map((g) => api.get(`/group/${g.id}/topics`, { start: 0, count: 15 }).then((d) => (d.topics || []).map((t) => Object.assign({ group: g }, t)))));
    const seen = new Set();
    const topics = results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((t) => t && t.id && !seen.has(t.id) && seen.add(t.id))
      .sort((a, b) => (parseTime(b.update_time || b.create_time) || 0) - (parseTime(a.update_time || a.create_time) || 0));
    box.innerHTML = topics.length
      ? `<div class="dml-list">${topics.map((t) => topicRowHTML(t, true)).join('')}</div><div class="dml-more" style="pointer-events:none">来自你的前 ${sample.length} 个小组</div>`
      : '<div class="dml-empty">暂无话题</div>';
  }

  async function vGroup(v, gid) {
    const main = page(v, { title: '小组', tab: 'groups' });
    main.innerHTML = loadingHTML();
    let g = null;
    try {
      g = await api.get(`/group/${gid}`);
    } catch (_) {}
    if (g && g.name) setTitle(v, g.name);
    main.innerHTML = g
      ? `<div class="dml-cell"><div class="dml-row" style="align-items:center"><img class="dml-avatar sq" style="width:56px;height:56px" alt="" src="${esc(g.avatar || '')}"><div class="dml-col"><div class="dml-name" style="font-size:18px">${esc(g.name || '')}</div><div class="dml-meta">${g.member_count ? esc(g.member_count) + ' 成员' : ''}</div></div></div>${g.desc_abstract || g.desc ? `<div class="dml-intro clamp" data-act="expand" style="padding:10px 0 0;border:0">${esc(g.desc_abstract || g.desc)}</div>` : ''}</div><div class="dml-section">话题</div>`
      : '';
    const id = (g && g.id) || gid;
    pager(v, main, offsetLoader((start, count) => api.get(`/group/${id}/topics`, { start, count }), 'topics'), (t) => topicRowHTML(t, false), { empty: '暂无话题' });
  }

  async function vTopic(v, id) {
    const main = page(v, { title: '小组话题', tabbar: false });
    main.innerHTML = loadingHTML();
    let t;
    try {
      t = await api.get(`/group/topic/${id}`);
    } catch (e) {
      main.innerHTML = errHTML(e);
      return;
    }
    const a = t.author || {};
    const g = t.group || {};
    setTitle(v, g.name || t.title || '广播');
    const content = t.content || textHTML(t.abstract || '');
    const extraPhotos = /<img/i.test(content) ? [] : (t.photos || []).map((p) => pic(p.image || p, true)).filter(Boolean);
    main.innerHTML = `<div class="dml-article">
      ${g.id ? `<a class="dml-chip" href="#" data-route="group/${esc(g.id)}">${esc(g.name || '小组')}</a>` : ''}
      ${t.title ? `<h2>${esc(t.title)}</h2>` : ''}
      <div class="dml-row" style="align-items:center">${authorAvatar(a, true)}<div class="dml-col"><div>${authorName(a)}</div><div class="dml-meta">${ago(t.create_time)}</div></div></div>
      <div class="dml-rich">${sanitize(content)}${extraPhotos.map((u) => `<img loading="lazy" src="${esc(u)}" data-act="img" data-src="${esc(u)}" tabindex="0" role="button" aria-label="查看图片">`).join('')}</div>
    </div>
    <div class="dml-seg"><button class="on" data-act="op" data-k="all">全部回应${t.comments_count ? ' ' + t.comments_count : ''}</button><button data-act="op" data-k="op">只看楼主</button></div>`;
    const p = pager(v, main, offsetLoader((start, count) => api.get(`/group/topic/${id}/comments`, { start, count }), 'comments', 50), (c, i) => commentHTML(c, { opId: a.id, floor: i + 1 }), { empty: '还没有回应' });
    v.acts.op = (el) => {
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      p.list.classList.toggle('dml-oponly', el.dataset.k === 'op');
      p.step();
    };
    replyBar(v, {
      placeholder: '回应话题…',
      send: (text, ref) => api.post(`/group/topic/${id}/create_comment`, { text, ref_comment_id: ref }),
      onSent: (c) => p.add(c),
    });
  }

  ROUTES.push(
    [/^search(?:\/(all|1001|1002|1003|1019)\/(.*))?$/, vSearch],
    [/^timeline$/, vTimeline],
    [/^status\/(\d+)$/, vStatus],
    [/^user\/([A-Za-z0-9_.-]+)$/, vUser],
    [/^subject\/(movie|tv|book|music)\/(\d+)$/, vSubject],
    [/^review\/(\d+)$/, vReview],
    [/^celebrity\/(\d+)$/, vCelebrity],
    [/^author\/(\d+)$/, vAuthor],
    [/^personage\/(\d+)$/, vPersonage],
    [/^library(?:\/(movie|tv|book|music))?$/, vDiscover],
    [/^library\/(movie|book|music)\/(mark|doing|done)$/, vLibrary],
    [/^groups(?:\/(discover|feed|mine))?$/, vGroups],
    [/^group\/([^/]+)$/, vGroup],
    [/^topic\/(\d+)$/, vTopic],
  );

  // ───────────────────────── boot ─────────────────────────
  function autoOpenForNativeUrl() {
    const route = currentRoute();
    // Retired More and diagnostic links return to the default page.
    if (route && !['more', 'diag'].includes(route) && (loggedIn() || route !== 'timeline')) return;
    // All native paths, including /home_guide, get a Lite route. Preserve supported deep links.
    const target = ['timeline', 'more', 'diag'].includes(route) ? homeRoute() : routeForUrl(location.href) || homeRoute();
    withInternal(() => history.replaceState({ dmlDepth: 0 }, '', baseUrl() + '#' + H + target));
  }

  function hookSpaNavigation() {
    for (const name of ['pushState', 'replaceState']) {
      const orig = history[name];
      history[name] = function () {
        const ret = orig.apply(this, arguments);
        if (!internalNav) {
          setTimeout(() => {
            autoOpenForNativeUrl();
            if (currentRoute() && !(current && current.route === currentRoute())) render(false);
          }, 0);
        }
        return ret;
      };
    }
  }

  function boot() {
    buildShell();
    // Lite restores each cached route itself, including across the browser's Back action.
    history.scrollRestoration = 'manual';
    hookSpaNavigation();
    window.addEventListener('popstate', () => render(true));
    // Hash-only links also need takeover, including when the site clears our route.
    window.addEventListener('hashchange', () => {
      if (!current || current.route !== currentRoute()) render(true);
    });
    autoOpenForNativeUrl();
    render(false);
  }

  injectStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
