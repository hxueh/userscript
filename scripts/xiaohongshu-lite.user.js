// ==UserScript==
// @name         Xiaohongshu Lite
// @name:zh-CN   小红书精简版：首页 · 点点 · 发布 · 通知 · 消息
// @namespace    https://github.com/hxueh
// @author       hxueh
// @version      0.7.5
// @description  A lighter, phone-style Xiaohongshu web: icon tab bar, slim search, Recommend-only feed, full-screen image viewer, no analytics.
// @description:zh-CN 小红书网页精简版：图标标签栏、精简搜索、仅推荐流、全屏看图，并拦截统计请求。
// @icon         data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20128%20128'%3E%3Crect%20width='128'%20height='128'%20rx='28'%20fill='%23ff2442'/%3E%3Crect%20x='38'%20y='22'%20width='52'%20height='84'%20rx='12'%20fill='none'%20stroke='white'%20stroke-width='7'/%3E%3Crect%20x='50'%20y='84'%20width='28'%20height='9'%20rx='4.5'%20fill='white'/%3E%3C/svg%3E
// @match        https://www.xiaohongshu.com/*
// @match        https://m.xiaohongshu.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  // ───────────────────────── m → www ─────────────────────────
  // m.xiaohongshu.com can serve an app-download landing page.
  // Forward to the same path on www so both hosts show the same site.
  if (location.hostname === 'm.xiaohongshu.com') {
    location.replace('https://www.xiaohongshu.com' + location.pathname + location.search + location.hash);
    return;
  }

  // ───────────────────────── Recommend only ─────────────────────────
  // The channel row (穿搭, 美食, ...) is hidden below, so a stale
  // ?channel_id=... would leave the feed on a channel with no way back.
  // Drop it and fall back to the default Recommend feed.
  try {
    const u = new URL(location.href);
    const ch = u.searchParams.get('channel_id');
    if (u.pathname === '/explore' && ch && ch !== 'homefeed_recommend') {
      u.searchParams.delete('channel_id');
      u.searchParams.delete('channel_type');
      location.replace(u.toString());
      return;
    }
  } catch (e) { /* malformed URL: leave the page alone */ }

  // ───────────────────────── block tracking ─────────────────────────
  // Telemetry the page sends on its own: APM (apm-fe, fe2 /api/data), the
  // event collector (t2 /api/v2/collect) and Sentry-style error reporters.
  // These are fire-and-forget, so answering them locally with an empty 200
  // keeps the page happy while nothing leaves the browser.
  //
  // Deliberately NOT blocked: as.xiaohongshu.com and fe-static.xhscdn.com/as/*
  // (request signing / device fingerprint) and the captcha script. The site
  // needs them to sign API calls; blocking them breaks the feed and triggers
  // verification prompts.
  const TRACKERS = [
    /^https?:\/\/(apm-fe|fe2|t2)\.xiaohongshu\.com\//i,
    /^https?:\/\/[^/]*\.?sentry\.io\//i,
    /\/api\/v2\/collect(\?|$)/i,
  ];
  const isTracker = (u) => {
    try { const h = new URL(u, location.href).href; return TRACKERS.some((re) => re.test(h)); }
    catch (e) { return false; }
  };

  // Proxies keep the patched functions looking native (toString, length), since
  // the site's own anti-bot code may inspect them.
  const wrap = (obj, name, handler) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = new Proxy(orig, { apply: handler });
  };

  // fetch(): answer trackers with an empty JSON 200.
  wrap(window, 'fetch', (target, self, args) => {
    const req = args[0];
    const url = typeof req === 'string' ? req : (req && req.url) || String(req);
    if (isTracker(url)) {
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return Reflect.apply(target, self, args);
  });

  // XMLHttpRequest: re-point tracker calls at an empty data: URL, which the
  // browser answers locally (200, no network).
  wrap(XMLHttpRequest.prototype, 'open', (target, self, args) => {
    if (isTracker(args[1])) return Reflect.apply(target, self, ['GET', 'data:,', args[2] !== false]);
    return Reflect.apply(target, self, args);
  });

  // Beacons are telemetry by definition (fire-and-forget on page hide).
  wrap(navigator, 'sendBeacon', () => true);

  // Pixels and late-loaded tracker scripts.
  for (const [Ctor, attr] of [[HTMLImageElement, 'src'], [HTMLScriptElement, 'src']]) {
    const d = Object.getOwnPropertyDescriptor(Ctor.prototype, attr);
    if (!d || !d.set) continue;
    Object.defineProperty(Ctor.prototype, attr, {
      ...d,
      set(v) { d.set.call(this, isTracker(v) ? 'data:,' : v); },
    });
  }

  // ───────────────────────── styles ─────────────────────────
  // The site ships two sidebar DOMs: logged out, each tab is a bare <li>;
  // logged in, each is wrapped in .popover-container and the layout gets an
  // AI search card. Tabs are therefore tagged with data-xlk (see tagBar) and
  // styled by tag instead of by position.
  const CSS = `
:root {
  --xl-red: #ff2442;
  --xl-red-soft: rgba(255, 36, 66, .12);
  --xl-bar-bg: rgba(255, 255, 255, .72);
  --xl-bar-border: rgba(255, 255, 255, .6);
  --xl-bar-shadow: 0 8px 30px rgba(0, 0, 0, .14), 0 1px 3px rgba(0, 0, 0, .08);
  --xl-ink: #333;
  --xl-ink-dim: #8a8a8a;
  --xl-top-bg: rgba(255, 255, 255, .86);
  --xl-field: #f2f2f2;
  --xl-bar-h: 56px;
  --xl-top-h: 52px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --xl-red: #ff4d63;
    --xl-red-soft: rgba(255, 77, 99, .18);
    --xl-bar-bg: rgba(40, 40, 42, .78);
    --xl-bar-border: rgba(255, 255, 255, .1);
    --xl-bar-shadow: 0 8px 30px rgba(0, 0, 0, .5), 0 1px 3px rgba(0, 0, 0, .4);
    --xl-ink: #f2f2f2;
    --xl-ink-dim: #9a9a9a;
    --xl-top-bg: rgba(10, 10, 10, .86);
    --xl-field: #232325;
  }
}

/* ── top bar: classic slim search only ── */
/* Logged in, wide windows get an AI search card (header-dual-wide plus
   .search-area in the feed); always use the classic slim header instead. */
.header-dual-wide,
.search-area { display: none !important; }
.header-dual-narrow { display: block !important; }

.header-container {
  position: fixed !important;
  top: 0; left: 0; right: 0;
  width: auto !important;
  height: var(--xl-top-h) !important;
  z-index: 90;
  background: var(--xl-top-bg) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: none !important;
  transition: transform .28s ease, opacity .28s ease;
}
.header-container header {
  height: var(--xl-top-h) !important;
  padding: 0 14px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: transparent !important;
}
/* logo, creator/business links, the extra icon-only search button */
.header-container header > a,
.header-container header > button,
.header-container header .right { display: none !important; }
.header-container .input-box {
  position: relative !important;
  left: auto !important; right: auto !important; top: auto !important;
  transform: none !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 640px !important;
  min-width: 0 !important;
  height: 36px !important;
  margin: 0 !important;
  border-radius: 18px !important;
  background: var(--xl-field) !important;
  box-shadow: none !important;
}
.header-container .search-input {
  font-size: 15px !important;
  color: var(--xl-ink) !important;
  padding-left: 16px !important;
  background: transparent !important;
}
.header-container .input-button { right: 6px !important; }
.header-container .search-icon { color: var(--xl-red) !important; }

/* ── floating tab bar (the original left sidebar) ── */
.main-container .side-bar {
  position: fixed !important;
  left: 12px !important;
  right: 12px !important;
  bottom: max(12px, env(safe-area-inset-bottom)) !important;
  top: auto !important;
  width: auto !important;
  max-width: 420px;
  margin: 0 auto !important;
  height: var(--xl-bar-h) !important;
  padding: 0 !important;
  display: block !important;
  /* Just under the note overlay (z-index 99) so an opened note covers the bar. */
  z-index: 98;
  border-radius: calc(var(--xl-bar-h) / 2) !important;
  background: var(--xl-bar-bg) !important;
  border: 1px solid var(--xl-bar-border);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow: var(--xl-bar-shadow);
  overflow: visible !important;
  transition: transform .28s ease, opacity .28s ease;
}
.side-bar .channel-list {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
}
.side-bar .channel-list-content {
  display: flex !important;
  flex-direction: row !important;
  align-items: stretch;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  padding: 6px !important;
  gap: 2px;
  box-sizing: border-box;
}
/* every tab slot shares the bar equally */
.side-bar .channel-list-content > * {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
}
.side-bar .popover-trigger,
.side-bar li {
  flex: 1 1 auto;
  display: flex !important;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  list-style: none;
}
.side-bar li a,
.side-bar .popover-trigger > a,
.side-bar .bottom-menu-component > .bottom-channel {
  flex: 1 1 auto;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 2px;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 25px !important;
  background: transparent !important;
  color: var(--xl-ink-dim) !important;
  text-decoration: none;
  cursor: pointer;
  transition: background .2s, color .2s;
}
.side-bar li a.active,
.side-bar li.active-channel > a {
  background: var(--xl-red-soft) !important;
  color: var(--xl-red) !important;
}
.side-bar svg {
  width: 24px !important;
  height: 24px !important;
  margin: 0 !important;
  color: inherit !important;
  fill: currentColor !important;
}
.side-bar .badge-container {
  display: flex !important;
  margin: 0 !important;
  position: relative;
}
/* avatar for 我 when logged in (its <a> sits one <div> deeper than the others) */
.side-bar li.user > div {
  flex: 1 1 auto;
  display: flex !important;
  width: auto !important;
}
.side-bar li.user :is(.reds-image-container, .reds-img-box, img) {
  width: 26px !important;
  height: 26px !important;
  border-radius: 50% !important;
}
/* logged in, 我 is rendered twice (avatar + text); keep the avatar one */
.side-bar li.user ~ .bottom-menu-component { display: none !important; }

/* Icon-only bar: native labels (and the little "ai" tag on 点点) are hidden. */
.side-bar .channel,
.side-bar .text,
.side-bar .xhs-ai-chat-header__tag { display: none !important; }

/* Only 首页 / 点点 / 发布 / 通知 / 消息 / 我 stay. */
.side-bar [data-xlk="live"],
.side-bar [data-xlk="red"],
.side-bar [data-xlk="login"],
.side-bar .side-bar-logo-wrapper,
.side-bar .information-container,
.side-bar .about-us-block,
.side-bar .divider,
.side-bar .app-info,
.side-bar .corp-info,
.bottom-menu-ai { display: none !important; }

/* Lift the floating upload / refresh buttons clear of the tab bar. */
.floating-btn-sets {
  top: auto !important;
  bottom: calc(var(--xl-bar-h) + 28px) !important;
  right: 12px !important;
  transition: bottom .28s ease;
}

/* ── hide on scroll down, show on scroll up ──
   the scroll handler toggles .xl-hide on <html>. The tab bar slides
   down, the search bar slides up, and the floating buttons drop to the edge. */
html.xl-hide .main-container .side-bar {
  transform: translateY(calc(var(--xl-bar-h) + 40px));
  opacity: 0;
  pointer-events: none;
}
html.xl-hide .header-container {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}
html.xl-hide .floating-btn-sets { bottom: 24px !important; }
/* Search results have their own fixed search box (.ai-header-container) and a
   fixed filter strip below it; slide the box away and pull the strip up. */
.ai-header-container { transition: transform .28s ease, opacity .28s ease; }
.reds-sticky { transition: top .28s ease; }
html.xl-hide .ai-header-container {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}
html.xl-hide .reds-sticky { top: 0 !important; }

/* ── home feed: Recommend only, centered ── */
/* Search results reuse the same container for their 全部 / 图文 / 视频 / 用户
   tabs, so only hide it on the home feed. */
html[data-xl-page="explore"] .feeds-page .channel-container,
html[data-xl-page="explore"] #channel-container,
html[data-xl-page="home"] .feeds-page .channel-container,
html[data-xl-page="home"] #channel-container { display: none !important; }

/* The site reserves left padding for the sidebar that is now a bottom bar. */
.main-content,
.with-side-bar { padding-left: 0 !important; margin-left: 0 !important; }
.main-container { padding-left: 0 !important; }
.main-container .feeds-page {
  margin: 0 auto !important;
  width: 100% !important;
  /* Native masonry sizes and positions cards from the viewport width.
     Keep the feed full-width so its rightmost column is not clipped. */
  max-width: none !important;
  box-sizing: border-box;
  padding: calc(var(--xl-top-h) + 8px) 6px calc(var(--xl-bar-h) + 36px) !important;
}
.feeds-container { padding-left: 0 !important; padding-right: 0 !important; }


/* Center the occupied columns, not the full-width native masonry canvas.
   A relative offset preserves native sizing without creating a containing
   block for the fixed refresh/filter buttons nested inside the canvas. */
.feeds-page .feeds-container { left: var(--xl-feed-inset, 0px) !important; }

/* Other pages (profile, search results) need clearance for both bars. */
.main-container .main-content > div:not(.feeds-page) {
  padding-top: var(--xl-top-h);
  padding-bottom: calc(var(--xl-bar-h) + 36px);
}


/* ── notes: bigger images, native-feeling viewer ── */
/* The site caps the image area at 60vw on narrow screens (a 412px phone gets
   247px), which shrinks portrait photos to a postage stamp. Let it grow to the
   usual 3:4 portrait ratio, but never past 74% of the screen height. Most
   videos are 3:4 as well, so the player gets the same room. */
.note-container .media-container {
  max-height: min(133.333vw, 74vh) !important;
}

/* Full-screen viewer (opened by tapping an image; built in openViewer). */
.xl-viewer {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: #000;
  overscroll-behavior: contain;
  touch-action: none;
  animation: xl-fade .18s ease;
}
.xl-viewer.xl-out { opacity: 0; transition: opacity .18s ease; }
@keyframes xl-fade { from { opacity: 0; } to { opacity: 1; } }
.xl-track {
  position: absolute;
  inset: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.xl-track::-webkit-scrollbar { display: none; }
.xl-page {
  flex: 0 0 100%;
  height: 100%;
  overflow: hidden;
  scroll-snap-align: center;
  scroll-snap-stop: always;
  touch-action: pan-x;
}
.xl-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: 50% 50%;
  will-change: transform;
  user-select: none;
  -webkit-user-drag: none;
}
.xl-top {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: max(10px, env(safe-area-inset-top)) 12px 28px;
  background: linear-gradient(rgba(0, 0, 0, .55), transparent);
  color: #fff;
  pointer-events: none;
  transition: opacity .2s ease;
}
.xl-viewer button {
  pointer-events: auto;
  border: 0;
  color: #fff;
  background: rgba(255, 255, 255, .16);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  cursor: pointer;
}
.xl-close { width: 36px; height: 36px; border-radius: 50%; font-size: 18px; line-height: 1; }
.xl-count { padding: 5px 12px; border-radius: 14px; font-size: 13px; background: rgba(255, 255, 255, .16); }
.xl-nav {
  position: absolute;
  top: 50%;
  width: 40px; height: 40px;
  margin-top: -20px;
  border-radius: 50%;
  font-size: 26px;
  line-height: 1;
  display: none;
}
.xl-prev { left: 12px; }
.xl-next { right: 12px; }
/* Arrow buttons only where a mouse is the input; touch screens just swipe. */
@media (hover: hover) and (pointer: fine) { .xl-nav { display: block; } }
.xl-viewer.xl-ui-off .xl-top,
.xl-viewer.xl-ui-off .xl-nav { opacity: 0; pointer-events: none; }
.xl-viewer.xl-single .xl-count,
.xl-viewer.xl-single .xl-nav { display: none; }
html.xl-viewing { overflow: hidden !important; }

/* ── per-page fixes (html[data-xl-page] is the first URL path segment) ── */
/* 通知 / 消息 / 点点 chat have their own headers: no search bar there. */
html[data-xl-page="notification"] .header-container,
html[data-xl-page="chat"] .header-container,
html[data-xl-page="ai_chat"] .header-container { display: none !important; }
/* Its tab strip is position:fixed at 72px, sized for the site's own header
   that we hide here; it would cover the first notification. Pin it to the top. */
html[data-xl-page="notification"] .reds-sticky { top: 0 !important; }
html[data-xl-page="notification"] .main-container .main-content > div.notification-page {
  padding-top: 0 !important;
}
/* 消息: use the full viewport above the tab bar. The generic padding above
   left a black strip on top and an empty strip at the bottom. */
html[data-xl-page="chat"] .main-container .main-content > div {
  padding: 0 !important;
}
html[data-xl-page="chat"] .xhs-im-page {
  height: calc(100vh - var(--xl-bar-h) - 24px) !important;
  min-height: 0 !important;
}
html[data-xl-page="chat"] .xhs-im-view {
  height: 100% !important;
}
html[data-xl-page="ai_chat"] .main-container .main-content > div {
  padding: 0 !important;
}
`;

  const style = document.createElement('style');
  style.id = 'xl-style';
  style.textContent = CSS;
  // At document-start <head> may not exist yet; documentElement always does.
  (document.head || document.documentElement).appendChild(style);

  // ───────────────────────── tab tagging ─────────────────────────
  // Each tab is identified by its sprite icon id, which is stable across the
  // logged-in / logged-out / collapsed-sidebar variants. Visible text is only
  // a fallback because collapsed mode (search pages) has none.
  // key → [label shown, icon ids, text fallback]
  const TABS = {
    home:    ['首页', ['home'], /^(发现|首页)/],
    dots:    ['点点', ['aiChatNormal', 'aiChat'], /^点点/],
    red:     ['点点', ['red'], /^RED/i],
    live:    ['直播', ['live'], /^直播/],
    publish: ['发布', ['creator'], /^发布/],
    notify:  ['通知', ['notification'], /^通知/],
    msg:     ['消息', ['im_chat_tab'], /^消息/],
    me:      ['我', ['me'], /^我/],
  };

  function keyOf(slot) {
    if (slot.matches('.login-btn')) return 'login';
    const use = slot.querySelector('use');
    const icon = use ? (use.getAttribute('href') || use.getAttribute('xlink:href') || '').split('#').pop() : '';
    const text = slot.textContent.replace(/\s+/g, '');
    for (const [key, [, ids, re]] of Object.entries(TABS)) {
      if (ids.includes(icon) || (!icon && re.test(text))) return key;
    }
    return '';
  }

  function tagBar() {
    const row = document.querySelector('.side-bar .channel-list-content');
    if (!row) return;
    const slots = [...row.children];
    const keys = slots.map(keyOf);
    // Logged out there is no 点点 entry, only RED (/red_video). Let RED fill
    // that slot instead of hiding it, so the bar always has six tabs.
    if (!keys.includes('dots')) {
      const i = keys.indexOf('red');
      if (i >= 0) keys[i] = 'dots';
    }
    slots.forEach((slot, i) => {
      const key = keys[i];
      if (!key) return;
      slot.dataset.xlk = key;
      if (key === 'login') return;
      // Icon-only bar: expose the name as a tooltip / accessible label instead.
      const holder = slot.querySelector('a, .bottom-channel');
      if (holder && holder.title !== TABS[key][0]) holder.title = TABS[key][0];
    });
  }

  // ───────────────────────── note gallery ─────────────────────────
  // The in-page carousel ships with Swiper's swipe switched off on the
  // container (class swiper-no-swiping), so only the arrow buttons work.
  // Switch it back on, and open a full-screen viewer when an image is tapped.
  function enableSwipe() {
    for (const el of document.querySelectorAll('.note-container .swiper-no-swiping')) {
      el.classList.remove('swiper-no-swiping');
    }
  }

  // Distinct image URLs of the open note, in order. Swiper's loop mode clones
  // slides, so dedupe by data-swiper-slide-index.
  function collectImages() {
    const byIdx = new Map();
    document.querySelectorAll('.note-container .swiper-slide').forEach((slide, n) => {
      const img = slide.querySelector('img');
      if (!img || !(img.currentSrc || img.src)) return;
      const idx = slide.getAttribute('data-swiper-slide-index');
      const key = idx === null ? 'n' + n : idx;
      if (!byIdx.has(key)) byIdx.set(key, { idx: idx === null ? n : +idx, url: img.currentSrc || img.src });
    });
    if (!byIdx.size) {
      // Single image notes without a carousel.
      const img = document.querySelector('.note-container .media-container img');
      if (img) return [img.currentSrc || img.src];
    }
    return [...byIdx.values()].sort((a, b) => a.idx - b.idx).map((v) => v.url);
  }
  function currentIndex() {
    const a = document.querySelector('.note-container .swiper-slide-active');
    const i = a && a.getAttribute('data-swiper-slide-index');
    return i === null || i === undefined ? 0 : +i || 0;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const MAX_ZOOM = 5;

  // Keys while the viewer is open. This listener is registered once, at
  // document-start, so it runs before the site's own handlers on window and
  // can swallow Escape / arrows; otherwise Escape would also close the note
  // underneath the viewer.
  let viewerKeys = null;
  window.addEventListener('keydown', (e) => {
    if (viewerKeys && viewerKeys(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function openViewer(urls, start) {
    if (document.getElementById('xl-viewer')) return;
    const ov = document.createElement('div');
    ov.id = 'xl-viewer';
    ov.className = 'xl-viewer' + (urls.length < 2 ? ' xl-single' : '');
    ov.innerHTML =
      '<div class="xl-track"></div>' +
      '<div class="xl-top"><button class="xl-close" aria-label="Close">✕</button><span class="xl-count"></span></div>' +
      '<button class="xl-nav xl-prev" aria-label="Previous">‹</button>' +
      '<button class="xl-nav xl-next" aria-label="Next">›</button>';
    const track = ov.querySelector('.xl-track');
    const count = ov.querySelector('.xl-count');
    let cur = clamp(start, 0, urls.length - 1);

    // One page per image; each keeps its own zoom state {s: scale, x, y: pan}.
    const pages = urls.map((url) => {
      const page = document.createElement('div');
      page.className = 'xl-page';
      const img = new Image();
      img.className = 'xl-img';
      img.draggable = false;
      img.src = url;
      page.appendChild(img);
      track.appendChild(page);
      return { page, img, s: 1, x: 0, y: 0 };
    });

    const apply = (p, animate) => {
      p.img.style.transition = animate ? 'transform .22s ease' : 'none';
      p.img.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.s})`;
    };
    // Keep the zoomed image from being dragged past its own edges.
    const limit = (p) => {
      const pw = p.page.clientWidth, ph = p.page.clientHeight;
      const nw = p.img.naturalWidth || pw, nh = p.img.naturalHeight || ph;
      const f = Math.min(pw / nw, ph / nh);
      const mx = Math.max(0, (nw * f * p.s - pw) / 2);
      const my = Math.max(0, (nh * f * p.s - ph) / 2);
      p.x = clamp(p.x, -mx, mx);
      p.y = clamp(p.y, -my, my);
    };
    // While zoomed the page pans instead of the track scrolling.
    const syncMode = (p) => {
      const z = p.s > 1.02;
      track.style.overflowX = z ? 'hidden' : 'auto';
      p.page.style.touchAction = z ? 'none' : 'pan-x';
    };
    // Zoom to scale s keeping the point (cx, cy) in screen space fixed.
    const zoomAt = (p, s1, cx, cy, animate) => {
      const r = p.page.getBoundingClientRect();
      const fx = cx - (r.left + r.width / 2), fy = cy - (r.top + r.height / 2);
      const k = s1 / p.s;
      p.x = fx - (fx - p.x) * k;
      p.y = fy - (fy - p.y) * k;
      p.s = s1;
      if (s1 <= 1.02) { p.s = 1; p.x = 0; p.y = 0; } else limit(p);
      syncMode(p);
      apply(p, animate);
    };

    const update = () => { count.textContent = `${cur + 1} / ${urls.length}`; };
    const goTo = (i, smooth) => {
      cur = clamp(i, 0, urls.length - 1);
      track.scrollTo({ left: cur * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
      update();
    };

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      // Leave the page's own carousel on the image the user ended on.
      try {
        const sw = document.querySelector('.note-container .swiper');
        if (sw && sw.swiper && sw.swiper.slideToLoop) sw.swiper.slideToLoop(cur, 0);
      } catch (e) { /* carousel API unavailable: harmless */ }
      viewerKeys = null;
      ov.classList.add('xl-out');
      setTimeout(() => { ov.remove(); document.documentElement.classList.remove('xl-viewing'); }, 190);
    };
    viewerKeys = (e) => {
      if (e.key === 'Escape') { close(); return true; }
      if (e.key === 'ArrowLeft') { goTo(cur - 1, true); return true; }
      if (e.key === 'ArrowRight') { goTo(cur + 1, true); return true; }
      return false;
    };

    ov.querySelector('.xl-close').addEventListener('click', close);
    ov.querySelector('.xl-prev').addEventListener('click', () => goTo(cur - 1, true));
    ov.querySelector('.xl-next').addEventListener('click', () => goTo(cur + 1, true));

    // Swiping between pages is native scroll-snap; track which page is showing.
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
      if (i !== cur && i >= 0 && i < urls.length) {
        pages[cur].s = 1; pages[cur].x = 0; pages[cur].y = 0; apply(pages[cur], false); syncMode(pages[cur]);
        cur = i;
        update();
      }
    }, { passive: true });

    // Gestures per page: pinch zoom, drag-pan when zoomed, double-tap zoom,
    // tap to show/hide the controls, and drag down to dismiss.
    pages.forEach((p) => {
      const ptrs = new Map();
      let pinch = null, drag = null, tap = null, lastTap = { t: 0, x: 0, y: 0 }, tapTimer = 0;
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

      p.page.addEventListener('pointerdown', (e) => {
        // Keeps receiving moves when a finger leaves the page; not essential.
        try { p.page.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / stale pointer */ }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          pinch = { d0: dist(a, b), s0: p.s, x0: p.x, y0: p.y, mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2 };
          drag = null; tap = null;
        } else if (ptrs.size === 1) {
          drag = { x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, dismiss: false };
          tap = { t: Date.now(), x: e.clientX, y: e.clientY, ok: true };
        }
      });

      p.page.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.ok = false;
        if (pinch && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()];
          const r = p.page.getBoundingClientRect();
          const s1 = clamp(pinch.s0 * dist(a, b) / pinch.d0, 1, MAX_ZOOM);
          const k = s1 / pinch.s0;
          const fx0 = pinch.mx0 - (r.left + r.width / 2), fy0 = pinch.my0 - (r.top + r.height / 2);
          const fx = (a.x + b.x) / 2 - (r.left + r.width / 2), fy = (a.y + b.y) / 2 - (r.top + r.height / 2);
          p.s = s1;
          p.x = fx - (fx0 - pinch.x0) * k;
          p.y = fy - (fy0 - pinch.y0) * k;
          limit(p);
          apply(p, false);
          return;
        }
        if (!drag) return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (p.s > 1.02) {
          p.x = drag.px + dx; p.y = drag.py + dy;
          limit(p); apply(p, false);
        } else if (drag.dismiss || (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.2)) {
          // Drag down/up to dismiss: the image follows the finger, the backdrop fades.
          drag.dismiss = true;
          p.img.style.transition = 'none';
          p.img.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(Math.abs(dy) / 1200, .15)})`;
          ov.style.background = `rgba(0, 0, 0, ${1 - Math.min(Math.abs(dy) / 420, .75)})`;
          ov.classList.add('xl-ui-off');
        }
      });

      const end = (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const wasDismiss = drag && drag.dismiss;
        const dy = e.clientY - (drag ? drag.y0 : e.clientY);
        ptrs.delete(e.pointerId);
        if (pinch && ptrs.size < 2) {
          pinch = null;
          if (p.s < 1.05) { p.s = 1; p.x = 0; p.y = 0; }
          syncMode(p); apply(p, true);
          // Re-anchor a remaining finger so panning continues smoothly.
          const rest = [...ptrs.values()][0];
          drag = rest ? { x0: rest.x, y0: rest.y, px: p.x, py: p.y, dismiss: false } : null;
          return;
        }
        if (wasDismiss && e.type === 'pointerup') {
          if (Math.abs(dy) > 110) { close(); return; }
          // Not far enough: spring back.
          ov.style.background = '';
          ov.classList.remove('xl-ui-off');
          apply(p, true);
        }
        drag = null;
        // Taps: double tap toggles 2.5× zoom at the tap point, a single tap
        // shows/hides the controls (after waiting out a possible second tap).
        if (tap && tap.ok && e.type === 'pointerup' && Date.now() - tap.t < 300) {
          const now = Date.now();
          if (now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
            clearTimeout(tapTimer);
            lastTap.t = 0;
            zoomAt(p, p.s > 1.02 ? 1 : 2.5, tap.x, tap.y, true);
          } else {
            lastTap = { t: now, x: tap.x, y: tap.y };
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => ov.classList.toggle('xl-ui-off'), 300);
          }
        }
        tap = null;
      };
      p.page.addEventListener('pointerup', end);
      p.page.addEventListener('pointercancel', end);

      // Trackpad pinch (ctrl+wheel) zooms at the cursor; plain wheel pans a zoomed image.
      p.page.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          zoomAt(p, clamp(p.s * Math.exp(-e.deltaY * 0.01), 1, MAX_ZOOM), e.clientX, e.clientY, false);
        } else if (p.s > 1.02) {
          e.preventDefault();
          p.x -= e.deltaX; p.y -= e.deltaY;
          limit(p); apply(p, false);
        }
      }, { passive: false });
    });

    document.body.appendChild(ov);
    document.documentElement.classList.add('xl-viewing');
    goTo(cur, false);
  }

  // Tap an image in a note → open the viewer. A drag that ends on the image
  // (carousel swipe) must not count as a tap, so remember where the press began.
  let pressAt = null;
  document.addEventListener('pointerdown', (e) => { pressAt = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const hit = t.closest('.note-container .swiper-slide, .note-container .note-slider-img, .note-container .media-container');
    if (!hit || t.closest('video, .xgplayer, button, a, [class*="arrow"], [class*="pagination"]')) return;
    if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) return;
    const urls = collectImages();
    if (!urls.length) return;
    e.preventDefault();
    e.stopPropagation();
    openViewer(urls, currentIndex());
  }, true);

  // ───────────────────────── home: 只看图文 by default ─────────────────────────
  // The feed has a floating 只看图文 toggle (div.graphic-filter). The site
  // does not remember it between loads, so switch it on once each time the
  // feed is entered. Armed again on every route change (see syncPage); a single
  // shot per entry means a manual switch-off is never fought.
  //   off: .graphic-filter, icon "imgNote"
  //   on:  .graphic-filter.checked-border, icon "imgNoteSelect"
  //   busy: icon "loading" (wait for it to settle)
  let graphicArmed = true;
  function autoGraphicOnly() {
    if (!graphicArmed) return;
    const page = root.dataset.xlPage;
    if (page !== 'explore' && page !== 'home') return;
    const gf = document.querySelector('.graphic-filter');
    if (!gf) return; // not rendered yet; the next DOM change retries
    const use = gf.querySelector('use');
    const icon = use ? (use.getAttribute('href') || use.getAttribute('xlink:href') || '').split('#').pop() : '';
    if (icon === 'loading') return;
    graphicArmed = false;
    if (icon === 'imgNote' && !gf.classList.contains('checked-border')) {
      const btn = gf.querySelector('.btn-wrapper');
      if (btn) btn.click();
    }
  }

  // ───────────────────────── page + scroll state ─────────────────────────
  // The site is a single-page app, so the path changes without a reload.
  // Mirror the first path segment onto <html> for the per-page CSS above.
  const root = document.documentElement;
  function syncPage() {
    const seg = location.pathname.split('/')[1] || 'home';
    if (root.dataset.xlPage !== seg) {
      root.dataset.xlPage = seg;
      root.classList.remove('xl-hide'); // new page: start with the bars visible
      graphicArmed = true;
      const v = document.getElementById('xl-viewer');
      if (v) { v.remove(); root.classList.remove('xl-viewing'); }
    }
  }

  // Hide the tab bar and search bar while reading down, bring them back on
  // any upward scroll or when near the top. A small threshold ignores jitter
  // from momentum scrolling and the feed's lazy-load height changes.
  // Scrolling is tracked per scroller: the feed scrolls the document, but
  // search results scroll an inner container.
  const lastTop = new WeakMap();
  let ticking = false;
  function onScroll(e) {
    const page = root.dataset.xlPage;
    if (page === 'chat' || page === 'ai_chat') return; // bars stay put in chats
    const doc = document.scrollingElement || root;
    const el = e.target === document ? doc : e.target;
    if (!(el instanceof Element)) return;
    if (el !== doc) {
      // Only the page-sized scroller counts; ignore small panes, horizontal
      // strips (filter chips) and scrolling inside an opened note.
      if (el.closest('.note-detail-mask')) return;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < innerHeight * 0.5) return;
      if (el.scrollHeight <= el.clientHeight + 1) return;
    }
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = el.scrollTop || 0;
      // First event from this scroller: it started at the top.
      const prev = lastTop.has(el) ? lastTop.get(el) : 0;
      const dy = y - prev;
      if (y < 60 || dy < -8) root.classList.remove('xl-hide');
      else if (dy > 8) root.classList.add('xl-hide');
      if (Math.abs(dy) > 8 || y < 60) lastTop.set(el, y);
    });
  }
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });

  // Native masonry leaves room for the old sidebar even after it becomes a
  // bottom bar. Measure the actual cards and center their occupied span.
  // A relative offset avoids changing masonry width or capturing fixed buttons.
  let centeredFeed = null, feedResize = null, feedLayout = null, centerQueued = false;
  function queueCenterFeed() {
    if (centerQueued) return;
    centerQueued = true;
    requestAnimationFrame(() => { centerQueued = false; centerFeed(); });
  }
  function centerFeed() {
    const feed = document.querySelector('.feeds-page .feeds-container');
    if (feed !== centeredFeed) {
      if (feedResize) feedResize.disconnect();
      if (feedLayout) feedLayout.disconnect();
      centeredFeed = feed;
      if (feed) {
        // Card widths and transforms settle after Vue's DOM insertion and can
        // change on resize; observe both rather than relying on load timing.
        feedResize = new ResizeObserver(queueCenterFeed);
        feedResize.observe(feed);
        feedLayout = new MutationObserver(queueCenterFeed);
        feedLayout.observe(feed, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
      }
    }
    if (!feed) return;
    const origin = feed.getBoundingClientRect().left;
    let left = Infinity, right = -Infinity;
    for (const card of feed.querySelectorAll('.note-item')) {
      const rect = card.getBoundingClientRect();
      if (!rect.width) continue;
      left = Math.min(left, rect.left - origin);
      right = Math.max(right, rect.right - origin);
    }
    if (!Number.isFinite(left)) return;
    const inset = Math.max(0, (feed.clientWidth - (right - left)) / 2 - left);
    const value = (Math.round(inset * 100) / 100) + 'px';
    // Avoid a mutation loop when our own custom property is observed.
    if (feed.style.getPropertyValue('--xl-feed-inset') !== value) {
      feed.style.setProperty('--xl-feed-inset', value);
    }
  }
  window.addEventListener('resize', queueCenterFeed, { passive: true });

  // Vue re-renders the bar on login state / route changes; retag on any DOM
  // churn, throttled to one pass per frame, and keep our <style> in <head>.
  let queued = false;
  const onMutate = () => {
    if (!document.getElementById('xl-style')) {
      (document.head || document.documentElement).appendChild(style);
    }
    syncPage();
    enableSwipe();
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; tagBar(); autoGraphicOnly(); queueCenterFeed(); });
  };
  new MutationObserver(onMutate).observe(document.documentElement, { childList: true, subtree: true });
  syncPage();
  tagBar();
  queueCenterFeed();
})();
