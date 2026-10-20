// ==UserScript==
// @name         Feishu Messenger Lite
// @name:zh-CN   飞书消息精简
// @namespace    https://github.com/hxueh
// @version      0.1.1
// @description  Gives Feishu's web messenger (/next/messenger) an iOS and macOS 27 look with Liquid Glass menus and dialogs, capsule buttons, squircle cards and the system font. Blocks the Tea/Rangers analytics, Slardar monitoring and ad trackers, and removes "Download Feishu". Follows Feishu's own light and dark theme.
// @description:zh-CN 为飞书网页版消息（/next/messenger）加入 iOS 与 macOS 27 风格：液态玻璃菜单与弹窗、胶囊按钮、圆角卡片和系统字体。拦截 Tea/Rangers 统计、Slardar 监控和广告追踪，并移除“下载飞书”。跟随飞书自身的浅色与深色主题。
// @author       hxueh
// @license      MIT
// @icon         https://www.feishu.cn/favicon.ico
// @match        https://*.feishu.cn/next/messenger*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    // Add ?fml=off to the URL to see the original page, for example to check
    // whether a broken feature is caused by this script.
    if (new URLSearchParams(location.search).get('fml') === 'off') return;

    // Feishu's web client is one single-page app, so the same document moves
    // between Messenger, Docs, Calendar and the rest without a reload. Every
    // part of this script checks the route first and does nothing outside
    // /next/messenger.
    const onMessenger = () => location.pathname.startsWith('/next/messenger');

    // ---------------------------------------------------------------------
    // Request blocker. It runs first, at document-start, so the blocked
    // scripts never execute. With @grant none the script runs in the page, so
    // patching the page's own fetch, XHR, sendBeacon and script loading
    // affects every caller.
    //
    // Only telemetry is blocked. The IM gateway, the frontier WebSocket, the
    // passport heartbeat and the file and image CDNs all stay.
    // ---------------------------------------------------------------------
    const BLOCKED_URL = new RegExp([
        // Tea / Rangers, ByteDance's event analytics: the collectors on
        // mcs*.feishu.cn and mcs*.larksuite.com, and the SDK and its
        // autotrack, heatmap and A/B plugins on the applog CDNs.
        '//mcs(?:-[a-z0-9-]+)?\\.(?:feishu\\.cn|larksuite\\.com|zijieapi\\.com)/',
        '//[^/]*applogcdn\\.com/', '/collect-autotrack-rangers\\.js', '//analytics\\.snssdk\\.com/',
        // Slardar, the performance and error monitor: its SDK, its settings
        // fetch and its upload endpoints.
        '//[^/]*bytedapm\\.com/', '/slardar/fe/sdk-web/', '//slardar[^/]*\\.(?:feishu\\.cn|larksuite\\.com)/',
        '/monitor_(?:browser|web)/(?:collect|settings)', '//mon\\.(?:zijieapi|snssdk|tiktokv)\\.com/',
        // Third-party marketing tags.
        '//www\\.googletagmanager\\.com/', '//(?:www|ssl)\\.google-analytics\\.com/',
        '//(?:px\\.ads|snap)\\.licdn\\.com/', '//px\\.ads\\.linkedin\\.com/', '//hm\\.baidu\\.com/',
    ].join('|'), 'i');
    const isBlocked = (url) => {
        if (!onMessenger()) return false;
        try {
            return BLOCKED_URL.test(String(url instanceof Request ? url.url : url));
        } catch { return false; }
    };

    // Beacons report that they were queued so the caller moves on.
    if (navigator.sendBeacon) {
        const beacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = (url, data) => (isBlocked(url) ? true : beacon(url, data));
    }
    // A blocked fetch resolves with an empty JSON object rather than failing,
    // so the SDKs neither throw nor queue the data to retry later.
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
        if (isBlocked(input)) {
            return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return nativeFetch.apply(this, arguments);
    };
    // A blocked XHR is pointed at an empty data: URL, which completes normally
    // without a network request.
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (isBlocked(url)) return nativeOpen.call(this, 'GET', 'data:application/json,{}', ...rest);
        return nativeOpen.call(this, method, url, ...rest);
    };
    // Tracking pixels and tag iframes: a blocked src is never set.
    for (const Element_ of [HTMLImageElement, HTMLIFrameElement]) {
        const desc = Object.getOwnPropertyDescriptor(Element_.prototype, 'src');
        Object.defineProperty(Element_.prototype, 'src', {
            configurable: true, enumerable: desc.enumerable, get: desc.get,
            set(value) { if (!isBlocked(value)) desc.set.call(this, value); },
        });
    }
    // Scripts added from code: a blocked src is never set, and an error event
    // fires so loaders waiting on the script give up instead of hanging.
    const scriptSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        configurable: true, enumerable: scriptSrc.enumerable, get: scriptSrc.get,
        set(value) {
            if (!isBlocked(value)) { scriptSrc.set.call(this, value); return; }
            this.type = 'javascript/blocked';
            setTimeout(() => this.dispatchEvent(new Event('error')), 0);
        },
    });
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        if (isBlocked(value) && String(name).toLowerCase() === 'src'
            && (this instanceof HTMLScriptElement || this instanceof HTMLImageElement || this instanceof HTMLIFrameElement)) {
            this.src = value; // routed through the guarded setters above
            return;
        }
        return nativeSetAttribute.call(this, name, value);
    };

    // Inline snippets in the HTML call these globals directly, for example
    // gtag(...) or window.collectEvent(...). Stubs that accept any call keep
    // those calls from throwing now that the libraries never load.
    const noop = () => {};
    for (const name of ['gtag', 'ga', 'collectEvent', 'lintrk']) {
        if (!window[name]) window[name] = noop;
    }
    if (!window.dataLayer) window.dataLayer = [];
    if (!window._hmt) window._hmt = [];

    // ---------------------------------------------------------------------
    // Theme. Feishu builds its UI from the Universe Design (UD) library, whose
    // components carry stable ud__* class names and read their colours from
    // CSS variables such as --bg-body and --text-title. So the theme styles
    // those components and reuses those variables, instead of matching the
    // app's hashed class names. Because the colours come from Feishu's own
    // variables, its light and dark themes both keep working.
    //
    // The look follows iOS and macOS 27: Liquid Glass on surfaces that float
    // above the content (menus, popovers, tooltips, dialogs), capsule
    // buttons, continuous-corner (squircle) cards, iOS system blue and green,
    // and the system font.
    //
    // Speed: backdrop-filter blurs what is behind an element on every frame
    // that it changes, so it is used only on small floating surfaces, never on
    // the chat list or the message list that scroll all the time. Everything
    // is plain CSS scoped under html.fml, so the browser does the work once
    // and no script runs while you scroll or type.
    // ---------------------------------------------------------------------
    const CSS = `
html.fml, html.fml body {
    --fml-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    --fml-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --fml-blue: #007aff;
    --fml-green: #34c759;
    --fml-red: #ff3b30;
    /* Liquid Glass: a translucent tint of Feishu's own surface colour (set
       on each surface below, because a var() inside a custom property
       resolves here on <html> and would miss a theme set further down), a
       blur that also raises saturation, a bright inner edge and a soft
       shadow. */
    --fml-glass-filter: blur(24px) saturate(180%);
    --fml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .7), inset 0 0 0 .5px rgba(255, 255, 255, .28);
    --fml-glass-shadow: 0 12px 36px rgba(0, 0, 0, .16), 0 2px 6px rgba(0, 0, 0, .06);
    --fml-radius-s: 10px;
    --fml-radius-m: 14px;
    --fml-radius-l: 22px;

    /* iOS system blue in place of Feishu blue. UD derives its primary
       buttons, links, selections and focus rings from these. */
    --primary-pri-500: var(--fml-blue);
    --primary-pri-600: #0066d6;
    --primary-pri-700: #0055b3;
    --primary-pri-400: #3395ff;
    --primary-pri-300: #66afff;
    --primary-pri-200: #b3d7ff;
    --primary-pri-100: #e0efff;
    --primary-pri-50: #f0f7ff;
    --text-link-normal: var(--fml-blue);
    --text-link-hover: #3395ff;
    --text-link-pressed: #0066d6;

    -webkit-text-size-adjust: 100%;
}
@media (prefers-color-scheme: dark) {
    html.fml, html.fml body {
        --fml-blue: #0a84ff;
        --fml-green: #30d158;
        --fml-red: #ff453a;
        --fml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .16), inset 0 0 0 .5px rgba(255, 255, 255, .08);
        --fml-glass-shadow: 0 12px 36px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .25);
    }
}

html.fml, html.fml body,
html.fml :is(button, input, textarea, select, [contenteditable="true"]) {
    font-family: var(--fml-font) !important;
}
html.fml :is(code, pre, kbd, samp) { font-family: var(--fml-mono) !important; }
html.fml body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
}
html.fml ::selection { background: color-mix(in srgb, var(--fml-blue) 28%, transparent); }

/* ---- Removed: Download Feishu ------------------------------------------ */
/* The download entry in the sidebar and the "get the desktop app" banners.
   Entries that only show text are found by the script below and tagged
   with .fml-hidden. */
html.fml :is(
    a[href*="feishu.cn/download"], a[href*="larksuite.com/download"],
    [aria-label="下载飞书"], [aria-label="下載飛書"], [aria-label="Download Feishu" i], [aria-label="Download Lark" i],
    [title="下载飞书"], [title="下載飛書"], [title="Download Feishu" i], [title="Download Lark" i]
), html.fml .fml-hidden {
    display: none !important;
}

/* ---- Scrollbars: thin overlay bars, as on macOS ----------------------- */
html.fml * { scrollbar-width: thin; scrollbar-color: rgba(128, 128, 128, .45) transparent; }
html.fml ::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }
html.fml ::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: rgba(128, 128, 128, .4) padding-box;
}
html.fml ::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 128, .65); }
html.fml ::-webkit-scrollbar-track, html.fml ::-webkit-scrollbar-corner { background: transparent; }

/* ---- Liquid Glass: floating surfaces ---------------------------------- */
html.fml :is(
    .ud__popover__content, .ud__popover-inner, .ud__dropdown__menu, .ud__dropdown-menu,
    .ud__menu, .ud__select__dropdown, .ud__select-dropdown, .ud__cascader__dropdown,
    .ud__toast, .ud__message__notice, .ud__notification__notice, [role="menu"],
    /* Messenger's own menus are not UD components: the right-click menu on
       a chat and the "+" (new group, new doc, ...) menu. */
    .larkc-contextMenu-wrapper, .quick-jump-menu
) {
    background: color-mix(in srgb, var(--bg-float, #fff) 72%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-glass-shadow) !important;
}
/* Tooltips have white text on a dark panel (--bg-tips), in both themes, so
   their glass is a dark tint. The light tint above made the text invisible.
   UD nests a .ud__tooltip-content inside .ud__tooltip__content, so only the
   outer panel gets the glass and the inner one stays clear; otherwise the
   two layers stack and the tint doubles. */
html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) {
    background: color-mix(in srgb, var(--bg-tips, #1f2329) 78%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-s) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-shadow) !important;
}
html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) :is(.ud__tooltip-content, .ud__tooltip-inner, [role="tooltip"]) {
    background: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
}
/* Arrows on popovers and tooltips do not match a blurred, rounded panel. */
html.fml :is(.ud__popover__arrow, .ud__popover-arrow, .ud__tooltip__arrow, .ud__tooltip-arrow) { display: none !important; }
/* Menu rows: inset, rounded highlights as in macOS menus. */
html.fml :is(.ud__menu__item, .ud__menu-item, .ud__dropdown__item, .ud__dropdown-menu-item,
             .ud__select__option, .ud__select-option, [role="menuitem"]) {
    margin: 0 5px !important;
    border-radius: 8px !important;
}
html.fml :is(.ud__modal__content, .ud__modal-content, .ud__drawer__content) {
    border-radius: var(--fml-radius-l) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-glass-shadow) !important;
}
/* Dialog backdrops dim and blur, as sheets do in iOS 27. */
html.fml :is(.ud__modal__mask, .ud__modal-mask, .ud__drawer__mask, .ud__drawer-mask) {
    background: rgba(0, 0, 0, .22) !important;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
}

/* ---- Controls ---------------------------------------------------------- */
html.fml :is(.ud__button, button[class*="ud__button"]) {
    border-radius: 999px !important;
    transition: transform .15s ease, filter .15s ease, background-color .15s ease;
}
html.fml :is(.ud__button, button[class*="ud__button"]):active { transform: scale(.97); }
html.fml :is(.ud__input, .ud__input-wrapper, .ud__input__wrapper, .ud__select__selector, .ud__select-selector,
             .ud__textarea, .ud__search, [class*="ud__input-search"]) {
    border-radius: var(--fml-radius-s) !important;
    corner-shape: squircle;
}
html.fml :is(.ud__input, .ud__input-wrapper, .ud__input__wrapper, .ud__textarea):focus-within {
    box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--fml-blue) 35%, transparent) !important;
}
/* Switches in iOS green. */
html.fml :is(.ud__switch--checked, .ud__switch-checked, .ud__switch[aria-checked="true"]) {
    background-color: var(--fml-green) !important;
}
html.fml :is(.ud__checkbox__inner, .ud__checkbox-inner) { border-radius: 6px !important; }
html.fml :is(.ud__badge__count, .ud__badge-count, .ud__badge__dot, .ud__badge-dot) {
    background-color: var(--fml-red) !important;
    box-shadow: none !important;
}
/* Segmented tabs (All / Unread / @Me and so on) as capsules. */
html.fml :is(.ud__tabs__tab, .ud__tabs-tab, [role="tab"]) { border-radius: 999px !important; }

/* ---- Cards and images -------------------------------------------------- */
/* Message cards, link previews, file and image attachments. */
html.fml :is(.ud__card, [class*="message-card" i], [class*="messageCard" i], [class*="file-card" i], [class*="fileCard" i]) {
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
}
html.fml :is([class*="message-image" i], [class*="messageImage" i], [class*="image-message" i]) img {
    border-radius: var(--fml-radius-m) !important;
}

/* ---- Motion ------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
    html.fml *, html.fml *::before, html.fml *::after {
        transition-duration: .01ms !important;
        animation-duration: .01ms !important;
    }
}
/* With Reduce Transparency on, glass turns solid, as in iOS. */
@media (prefers-reduced-transparency: reduce) {
    html.fml * { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
    html.fml :is(
        .ud__popover__content, .ud__popover-inner, .ud__dropdown__menu, .ud__dropdown-menu,
        .ud__menu, .ud__select__dropdown, .ud__select-dropdown, .ud__cascader__dropdown,
        .ud__toast, .ud__message__notice, .ud__notification__notice, [role="menu"],
        .larkc-contextMenu-wrapper, .quick-jump-menu
    ) { background: var(--bg-float, #fff) !important; }
    html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) {
        background: var(--bg-tips, #1f2329) !important;
    }
}
`;

    // At document-start some managers run before <html> exists. Wait for it
    // with a one-shot observer on the document itself.
    const whenRoot = (fn) => {
        if (document.documentElement) { fn(); return; }
        const wait = new MutationObserver(() => {
            if (!document.documentElement) return;
            wait.disconnect();
            fn();
        });
        wait.observe(document, { childList: true });
    };

    const style = document.createElement('style');
    style.id = 'fml-style';
    style.textContent = CSS;
    whenRoot(() => (document.head || document.documentElement).appendChild(style));

    // ---------------------------------------------------------------------
    // "Download Feishu". Where the entry has only visible text and no label
    // or link the CSS can match, find it by its text and hide the whole entry
    // (icon and label) by climbing to the largest ancestor whose text is
    // still just that label.
    //
    // This is the only script that runs after load. Added nodes are queued
    // and checked once per animation frame, and a subtree is walked only when
    // its text contains the label, so typing and scrolling stay cheap.
    // ---------------------------------------------------------------------
    const LABEL = /^(?:下载飞书(?:客户端|桌面端|App)?|下載飛書(?:客戶端|桌面端|App)?|Download (?:Feishu|Lark)(?: (?:app|desktop|client))?|(?:Feishu|Lark)\s*(?:を)?ダウンロード)$/i;
    const HINT = /下载飞书|下載飛書|Download (?:Feishu|Lark)|(?:Feishu|Lark)\s*を?ダウンロード/i;
    const STOP = new Set(['BODY', 'HTML', 'NAV', 'ASIDE', 'HEADER', 'MAIN', 'UL', 'OL']);

    const hidden = new Set();
    const hideEntry = (textNode) => {
        let el = textNode.parentElement;
        if (!el || el.closest('[contenteditable="true"]')) return;
        const label = el.textContent.trim();
        // Stay within five levels so a label that sits alone in a big,
        // otherwise empty wrapper never takes the wrapper with it.
        for (let i = 0; i < 5; i++) {
            const up = el.parentElement;
            if (!up || STOP.has(up.tagName) || up.textContent.trim() !== label) break;
            el = up;
        }
        // The class is for the stylesheet. React can rewrite className on
        // the next render, but it only touches the style properties it
        // manages, so the inline display keeps the entry hidden.
        el.classList.add('fml-hidden');
        el.style.setProperty('display', 'none', 'important');
        hidden.add(el);
    };

    const scan = (root) => {
        if (!HINT.test(root.textContent)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (LABEL.test(n.nodeValue.trim())) hideEntry(n);
        }
    };

    let pending = [];
    let frame = 0;
    const flush = () => {
        frame = 0;
        const roots = pending;
        pending = [];
        if (!onMessenger()) return;
        for (const root of roots) if (root.isConnected) scan(root);
    };
    const observer = new MutationObserver((records) => {
        for (const rec of records) {
            for (const n of rec.addedNodes) {
                if (n.nodeType === 1) pending.push(n);
                else if (n.nodeType === 3 && n.parentElement) pending.push(n.parentElement);
            }
        }
        if (pending.length && !frame) frame = requestAnimationFrame(flush);
    });

    // ---------------------------------------------------------------------
    // Route tracking. The theme class and the observer are on only while the
    // app shows /next/messenger.
    // ---------------------------------------------------------------------
    let active = false;
    const sync = () => {
        const want = onMessenger();
        if (want === active) return;
        active = want;
        document.documentElement.classList.toggle('fml', want);
        if (want) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
            if (document.body) scan(document.body);
        } else {
            observer.disconnect();
            pending = [];
            // The sidebar stays on screen in Docs, Calendar and the rest, so
            // give the entry back there.
            for (const el of hidden) {
                el.classList.remove('fml-hidden');
                el.style.removeProperty('display');
            }
            hidden.clear();
        }
    };
    for (const method of ['pushState', 'replaceState']) {
        const native = history[method];
        history[method] = function () {
            const result = native.apply(this, arguments);
            sync();
            return result;
        };
    }
    window.addEventListener('popstate', sync);
    whenRoot(sync);
})();
