// ==UserScript==
// @name         Feishu Messenger Lite
// @name:zh-CN   飞书消息精简
// @namespace    https://github.com/hxueh
// @version      0.2.2
// @description  Gives Feishu's web messenger (/next/messenger) an iOS and macOS 27 look with Liquid Glass menus and dialogs, capsule buttons, squircle cards and the system font, coloured Solarized Light by day and Tokyo Night by night. Blocks Tea/Rangers analytics, Slardar monitoring, ad trackers and the Security Policy SDK, and removes "Download Feishu". Switches with Feishu's own light and dark theme.
// @description:zh-CN 为飞书网页版消息（/next/messenger）加入 iOS 与 macOS 27 风格：液态玻璃菜单与弹窗、胶囊按钮、圆角卡片和系统字体，日间使用 Solarized Light 配色，夜间使用 Tokyo Night 配色。拦截 Tea/Rangers 统计、Slardar 监控、广告追踪和 Security Policy SDK，并移除“下载飞书”。跟随飞书自身的浅色与深色主题。
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
    // Block telemetry and the Security Policy SDK. The IM gateway, the
    // frontier WebSocket, passport heartbeat and file and image CDNs stay.
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
        // The messenger's own copy of the Slardar SDK (about 90 KB). The
        // HTML loads it with a plain <script src>, so the parser blocker
        // below stops it.
        '/web-client-next/p/static/js/slardar\\.[0-9a-f]+\\.js',
        // The ByteDance accessibility-testing entry, which loads its own
        // tooling and reporting. Readers and keyboard use do not need it.
        '/accessibility-task-platform/',
        // Feishu loads policy-sdk-<version>.js from lmp/scs (currently with
        // a double slash). Match this SDK path, not general policy APIs,
        // so the login and message endpoints keep their normal behaviour.
        '/lmp/scs/+policy-sdk(?:-[0-9][0-9A-Za-z._-]*)?\\.js(?:[?#]|$)',
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

    // Scripts written in the HTML: the parser inserts them without the src
    // setter, so the guards above never see them. An observer on the
    // document runs before the parser executes each new script, and a
    // script whose type is not JavaScript is skipped. Removing it as well
    // keeps it from running if something resets the type. Firefox also
    // fires beforescriptexecute, which is the direct way to cancel one.
    const blockParsed = (node) => {
        if (node.tagName !== 'SCRIPT' || !node.src || !isBlocked(node.src)) return;
        node.type = 'javascript/blocked';
        node.remove();
    };
    const parserGuard = new MutationObserver((records) => {
        for (const rec of records) for (const n of rec.addedNodes) blockParsed(n);
    });
    parserGuard.observe(document, { childList: true, subtree: true });
    // Only the first HTML parse needs this. After it, scripts come from code
    // and the src setter covers them, so the observer stops to save work.
    document.addEventListener('DOMContentLoaded', () => parserGuard.disconnect(), { once: true });
    document.addEventListener('beforescriptexecute', (e) => {
        if (e.target.src && isBlocked(e.target.src)) e.preventDefault();
    }, true);

    // Inline snippets in the HTML call these globals directly, for example
    // gtag(...) or window.collectEvent(...). Stubs that accept any call keep
    // those calls from throwing now that the libraries never load.
    const noop = () => {};
    for (const name of ['gtag', 'ga', 'collectEvent', 'lintrk']) {
        if (!window[name]) window[name] = noop;
    }
    // Slardar is used through chains such as Slardar('init', ...),
    // Slardar.on('init', fn) and Slardar.getSender().send(...). A proxy
    // that returns itself from every call and property answers all of
    // them. It has no "then", so awaiting it does not hang, and it turns
    // into an empty string or 0 where code reads it as a value.
    const sink = new Proxy(function () {}, {
        get: (_, key) => (key === 'then' || key === Symbol.iterator ? undefined
            : key === Symbol.toPrimitive ? () => ''
            : sink),
        apply: () => sink,
        construct: () => sink,
    });
    if (onMessenger() && !window.Slardar) window.Slardar = sink;
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
    // buttons, continuous-corner (squircle) cards and the system font. The
    // colours are Solarized Light by day and Tokyo Night by night, applied by
    // redefining Feishu's own colour tokens, so they follow the same light and
    // dark switch as Feishu.
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
    /* Accents from the active palette (Solarized Light by day). */
    --fml-blue: #268bd2;
    --fml-green: #859900;
    --fml-red: #dc322f;
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
    --fml-radius-panel: 18px;
    --fml-panel-shadow: 0 8px 28px rgba(7, 54, 66, .1), 0 1px 3px rgba(7, 54, 66, .08);
    /* The wallpaper behind every glass panel. Soft glows in the palette's
       blue, cyan and yellow on base2 give the translucent panels something
       to show through. */
    --fml-wallpaper:
        radial-gradient(70vw 60vh at 0% 0%, rgba(38, 139, 210, .16), transparent 70%),
        radial-gradient(60vw 60vh at 100% 100%, rgba(42, 161, 152, .14), transparent 70%),
        radial-gradient(50vw 50vh at 85% 5%, rgba(181, 137, 0, .1), transparent 70%),
        #eee8d5;

    /* Solarized Light. Feishu reads every colour from these tokens on :root
       (and switches them for dark in a prefers-color-scheme block), so
       redefining them on html.fml recolours every UD component. Each token
       has a "-raw" twin ("r,g,b") that components use inside rgba(). */
    --N00: #fdf6e3;
    --N50: #f8f1de;
    --N100: #eee8d5;
    --N200: #e7e0cc;
    --N300: #ddd6c1;
    --N350: #d2cbb5;
    --N400: #b3b8ae;
    --N500: #93a1a1;
    --N600: #657b83;
    --N650: #5f747b;
    --N700: #586e75;
    --N800: #2c4b53;
    --N900: #073642;
    --N950: #002b36;
    --N1000: #001f27;
    --B50: #f0f0e2;
    --primary-pri-50: #f0f0e2;
    --primary-pri-50-raw: 240,240,226;
    --B100: #e3e9e1;
    --primary-pri-100: #e3e9e1;
    --primary-pri-100-raw: 227,233,225;
    --B200: #c9dcdf;
    --primary-pri-200: #c9dcdf;
    --primary-pri-200-raw: 201,220,223;
    --B300: #a7cbdc;
    --primary-pri-300: #a7cbdc;
    --primary-pri-300-raw: 167,203,220;
    --B350: #87bbda;
    --primary-pri-350: #87bbda;
    --primary-pri-350-raw: 135,187,218;
    --B400: #5ca6d6;
    --primary-pri-400: #5ca6d6;
    --primary-pri-400-raw: 92,166,214;
    --B500: #268bd2;
    --primary-pri-500: #268bd2;
    --primary-pri-500-raw: 38,139,210;
    --B600: #217fbf;
    --primary-pri-600: #217fbf;
    --primary-pri-600-raw: 33,127,191;
    --B700: #1d74ad;
    --primary-pri-700: #1d74ad;
    --primary-pri-700-raw: 29,116,173;
    --B800: #176594;
    --primary-pri-800: #176594;
    --primary-pri-800-raw: 23,101,148;
    --B900: #11567c;
    --primary-pri-900: #11567c;
    --primary-pri-900-raw: 17,86,124;
    --primary-content-default: #268bd2;
    --primary-content-default-raw: 38,139,210;
    --primary-content-hover: #4a9fdb;
    --primary-content-hover-raw: 74,159,219;
    --primary-content-pressed: #1f74b0;
    --primary-content-pressed-raw: 31,116,176;
    --primary-content-loading: #a7cbdc;
    --primary-content-loading-raw: 167,203,220;
    --primary-fill-default: #268bd2;
    --primary-fill-default-raw: 38,139,210;
    --primary-fill-hover: #4a9fdb;
    --primary-fill-hover-raw: 74,159,219;
    --primary-fill-pressed: #1f74b0;
    --primary-fill-pressed-raw: 31,116,176;
    --primary-fill-loading: #a7cbdc;
    --primary-fill-loading-raw: 167,203,220;
    --primary-fill-solid-01: #f0f0e2;
    --primary-fill-solid-01-raw: 240,240,226;
    --primary-fill-solid-02: #e3e9e1;
    --primary-fill-solid-02-raw: 227,233,225;
    --primary-fill-solid-03: #c9dcdf;
    --primary-fill-solid-03-raw: 201,220,223;
    --primary-fill-transparent-01: rgba(38, 139, 210, 0.1);
    --primary-fill-transparent-01-raw: 38,139,210;
    --primary-fill-transparent-02: rgba(38, 139, 210, 0.15);
    --primary-fill-transparent-02-raw: 38,139,210;
    --primary-fill-transparent-03: rgba(38, 139, 210, 0.2);
    --primary-fill-transparent-03-raw: 38,139,210;
    --primary-on-primary-fill: #fdf6e3;
    --primary-on-primary-fill-raw: 253,246,227;
    --bg-pricolor: #268bd2;
    --bg-pricolor-raw: 38,139,210;
    --text-link-normal: #268bd2;
    --text-link-normal-raw: 38,139,210;
    --text-link-hover: #4a9fdb;
    --text-link-hover-raw: 74,159,219;
    --text-link-pressed: #1f74b0;
    --text-link-pressed-raw: 31,116,176;
    --text-link-loading: #a7cbdc;
    --text-link-loading-raw: 167,203,220;
    --fill-active: rgba(38, 139, 210, 0.15);
    --fill-active-raw: 38,139,210;
    --fill-selected: rgba(38, 139, 210, 0.1);
    --fill-selected-raw: 38,139,210;
    --bg-text-selection: rgba(38, 139, 210, 0.28);
    --bg-text-selection-raw: 38,139,210;
    --bg-body: #fdf6e3;
    --bg-body-raw: 253,246,227;
    --bg-base: #eee8d5;
    --bg-base-raw: 238,232,213;
    --bg-body-overlay: #f6efdb;
    --bg-body-overlay-raw: 246,239,219;
    --bg-content-base: #f9f2df;
    --bg-content-base-raw: 249,242,223;
    --bg-filler: #eee8d5;
    --bg-filler-raw: 238,232,213;
    --bg-float: #fdf6e3;
    --bg-float-raw: 253,246,227;
    --bg-float-base: #eee8d5;
    --bg-float-base-raw: 238,232,213;
    --bg-float-overlay: #f6efdb;
    --bg-float-overlay-raw: 246,239,219;
    --bg-sub-navigation: #f6efdb;
    --bg-sub-navigation-raw: 246,239,219;
    --bg-tips: #073642;
    --bg-tips-raw: 7,54,66;
    --text-title: #073642;
    --text-title-raw: 7,54,66;
    --text-caption: #586e75;
    --text-caption-raw: 88,110,117;
    --text-placeholder: #93a1a1;
    --text-placeholder-raw: 147,161,161;
    --text-disabled: #b3b8ae;
    --text-disabled-raw: 179,184,174;
    --text-link-disabled: #b3b8ae;
    --text-link-disabled-raw: 179,184,174;
    --icon-n1: #586e75;
    --icon-n1-raw: 88,110,117;
    --icon-n2: #657b83;
    --icon-n2-raw: 101,123,131;
    --icon-n3: #93a1a1;
    --icon-n3-raw: 147,161,161;
    --icon-disabled: #b3b8ae;
    --icon-disabled-raw: 179,184,174;
    --fill-disabled: #d2cbb5;
    --fill-disabled-raw: 210,203,181;
    --line-border-card: #e4ddc8;
    --line-border-card-raw: 228,221,200;
    --line-border-component: #d2cbb5;
    --line-border-component-raw: 210,203,181;
    --bg-float-push: rgba(253, 246, 227, 0.8);
    --bg-float-push-raw: 253,246,227;
    --fill-hover: rgba(88, 110, 117, 0.08);
    --fill-hover-raw: 88,110,117;
    --fill-focus: rgba(88, 110, 117, 0.12);
    --fill-focus-raw: 88,110,117;
    --fill-pressed: rgba(88, 110, 117, 0.12);
    --fill-pressed-raw: 88,110,117;
    --fill-tag: rgba(88, 110, 117, 0.1);
    --fill-tag-raw: 88,110,117;
    --line-divider-default: rgba(88, 110, 117, 0.16);
    --line-divider-default-raw: 88,110,117;
    --line-divider-module: rgba(88, 110, 117, 0.16);
    --line-divider-module-raw: 88,110,117;
    --fill-loading-mask: rgba(253, 246, 227, 0.6);
    --fill-loading-mask-raw: 253,246,227;

    -webkit-text-size-adjust: 100%;
}
@media (prefers-color-scheme: dark) {
    html.fml, html.fml body {
        /* Tokyo Night. */
        --fml-blue: #7aa2f7;
        --fml-green: #9ece6a;
        --fml-red: #f7768e;
        --N00: #16161e;
        --N50: #1a1b26;
        --N100: #1f2335;
        --N200: #292e42;
        --N300: #2f3549;
        --N350: #3b4261;
        --N400: #414868;
        --N500: #565f89;
        --N600: #737aa2;
        --N650: #9aa5ce;
        --N700: #a9b1d6;
        --N800: #c0caf5;
        --N900: #c8d3f5;
        --N950: #e0e6ff;
        --N1000: #ffffff;
        --B50: #202333;
        --primary-pri-50: #202333;
        --primary-pri-50-raw: 32,35,51;
        --B100: #262b3f;
        --primary-pri-100: #262b3f;
        --primary-pri-100-raw: 38,43,63;
        --B200: #313b58;
        --primary-pri-200: #313b58;
        --primary-pri-200-raw: 49,59,88;
        --B300: #40517a;
        --primary-pri-300: #40517a;
        --primary-pri-300-raw: 64,81,122;
        --B350: #4f6599;
        --primary-pri-350: #4f6599;
        --primary-pri-350-raw: 79,101,153;
        --B400: #6280c3;
        --primary-pri-400: #6280c3;
        --primary-pri-400-raw: 98,128,195;
        --B500: #7aa2f7;
        --primary-pri-500: #7aa2f7;
        --primary-pri-500-raw: 122,162,247;
        --B600: #82a7f7;
        --primary-pri-600: #82a7f7;
        --primary-pri-600-raw: 130,167,247;
        --B700: #8bacf7;
        --primary-pri-700: #8bacf7;
        --primary-pri-700-raw: 139,172,247;
        --B800: #96b2f6;
        --primary-pri-800: #96b2f6;
        --primary-pri-800-raw: 150,178,246;
        --B900: #a0b8f6;
        --primary-pri-900: #a0b8f6;
        --primary-pri-900-raw: 160,184,246;
        --primary-content-default: #7aa2f7;
        --primary-content-default-raw: 122,162,247;
        --primary-content-hover: #8db0f8;
        --primary-content-hover-raw: 141,176,248;
        --primary-content-pressed: #6183d4;
        --primary-content-pressed-raw: 97,131,212;
        --primary-content-loading: #40517a;
        --primary-content-loading-raw: 64,81,122;
        --primary-fill-default: #7aa2f7;
        --primary-fill-default-raw: 122,162,247;
        --primary-fill-hover: #8db0f8;
        --primary-fill-hover-raw: 141,176,248;
        --primary-fill-pressed: #6183d4;
        --primary-fill-pressed-raw: 97,131,212;
        --primary-fill-loading: #40517a;
        --primary-fill-loading-raw: 64,81,122;
        --primary-fill-solid-01: #202333;
        --primary-fill-solid-01-raw: 32,35,51;
        --primary-fill-solid-02: #262b3f;
        --primary-fill-solid-02-raw: 38,43,63;
        --primary-fill-solid-03: #313b58;
        --primary-fill-solid-03-raw: 49,59,88;
        --primary-fill-transparent-01: rgba(122, 162, 247, 0.15);
        --primary-fill-transparent-01-raw: 122,162,247;
        --primary-fill-transparent-02: rgba(122, 162, 247, 0.2);
        --primary-fill-transparent-02-raw: 122,162,247;
        --primary-fill-transparent-03: rgba(122, 162, 247, 0.3);
        --primary-fill-transparent-03-raw: 122,162,247;
        --primary-on-primary-fill: #16161e;
        --primary-on-primary-fill-raw: 22,22,30;
        --bg-pricolor: #7aa2f7;
        --bg-pricolor-raw: 122,162,247;
        --text-link-normal: #7aa2f7;
        --text-link-normal-raw: 122,162,247;
        --text-link-hover: #8db0f8;
        --text-link-hover-raw: 141,176,248;
        --text-link-pressed: #6183d4;
        --text-link-pressed-raw: 97,131,212;
        --text-link-loading: #40517a;
        --text-link-loading-raw: 64,81,122;
        --fill-active: rgba(122, 162, 247, 0.2);
        --fill-active-raw: 122,162,247;
        --fill-selected: rgba(122, 162, 247, 0.15);
        --fill-selected-raw: 122,162,247;
        --bg-text-selection: rgba(122, 162, 247, 0.28);
        --bg-text-selection-raw: 122,162,247;
        --bg-body: #1a1b26;
        --bg-body-raw: 26,27,38;
        --bg-base: #16161e;
        --bg-base-raw: 22,22,30;
        --bg-body-overlay: #1f2335;
        --bg-body-overlay-raw: 31,35,53;
        --bg-content-base: #16161e;
        --bg-content-base-raw: 22,22,30;
        --bg-filler: #292e42;
        --bg-filler-raw: 41,46,66;
        --bg-float: #1f2335;
        --bg-float-raw: 31,35,53;
        --bg-float-base: #1a1b26;
        --bg-float-base-raw: 26,27,38;
        --bg-float-overlay: #292e42;
        --bg-float-overlay-raw: 41,46,66;
        --bg-sub-navigation: #1f2335;
        --bg-sub-navigation-raw: 31,35,53;
        --bg-tips: #414868;
        --bg-tips-raw: 65,72,104;
        --text-title: #c0caf5;
        --text-title-raw: 192,202,245;
        --text-caption: #a9b1d6;
        --text-caption-raw: 169,177,214;
        --text-placeholder: #565f89;
        --text-placeholder-raw: 86,95,137;
        --text-disabled: #545c7e;
        --text-disabled-raw: 84,92,126;
        --text-link-disabled: #545c7e;
        --text-link-disabled-raw: 84,92,126;
        --icon-n1: #c0caf5;
        --icon-n1-raw: 192,202,245;
        --icon-n2: #a9b1d6;
        --icon-n2-raw: 169,177,214;
        --icon-n3: #737aa2;
        --icon-n3-raw: 115,122,162;
        --icon-disabled: #545c7e;
        --icon-disabled-raw: 84,92,126;
        --fill-disabled: #3b4261;
        --fill-disabled-raw: 59,66,97;
        --line-border-component: #3b4261;
        --line-border-component-raw: 59,66,97;
        --line-divider-module: #15161e;
        --line-divider-module-raw: 21,22,30;
        --bg-float-push: rgba(31, 35, 53, 0.8);
        --bg-float-push-raw: 31,35,53;
        --fill-hover: rgba(192, 202, 245, 0.06);
        --fill-hover-raw: 192,202,245;
        --fill-focus: rgba(192, 202, 245, 0.1);
        --fill-focus-raw: 192,202,245;
        --fill-pressed: rgba(192, 202, 245, 0.1);
        --fill-pressed-raw: 192,202,245;
        --fill-tag: rgba(192, 202, 245, 0.08);
        --fill-tag-raw: 192,202,245;
        --line-border-card: rgba(192, 202, 245, 0.1);
        --line-border-card-raw: 192,202,245;
        --line-divider-default: rgba(169, 177, 214, 0.12);
        --line-divider-default-raw: 169,177,214;
        --fill-loading-mask: rgba(22, 22, 30, 0.6);
        --fill-loading-mask-raw: 22,22,30;
        --fml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .16), inset 0 0 0 .5px rgba(255, 255, 255, .08);
        --fml-glass-shadow: 0 12px 36px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .25);
        --fml-panel-shadow: 0 8px 28px rgba(0, 0, 0, .35), 0 1px 3px rgba(0, 0, 0, .25);
        /* Tokyo Night wallpaper: blue, purple and cyan glows on #16161e. */
        --fml-wallpaper:
            radial-gradient(70vw 60vh at 0% 0%, rgba(122, 162, 247, .22), transparent 70%),
            radial-gradient(60vw 60vh at 100% 100%, rgba(187, 154, 247, .18), transparent 70%),
            radial-gradient(50vw 50vh at 85% 5%, rgba(125, 207, 255, .12), transparent 70%),
            #16161e;
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

/* ---- Liquid Glass: the window ----------------------------------------- */
/* The whole messenger sits on the palette wallpaper, and every part of it
   (the tab bar on the left, the chat list, the chat) is a translucent glass
   panel over that wallpaper, with a bright edge and a soft shadow.
   Speed: these panels have no backdrop-filter. What is behind them is only
   the wallpaper, a set of soft gradients, so a blur would look the same and
   cost a full-panel blur on every frame the chat list or the messages
   scroll. Only bars and controls that float above moving content (the chat
   header, the message box, menus) blur what is behind them. */
html.fml .appLayout {
    background: var(--fml-wallpaper) !important;
}
/* Clear the layers between the wallpaper and the panels. Feishu paints the
   frame around the panels in a slate tenant colour, and every panel has
   solid layers inside it. */
html.fml :is(.messagesLayout, .appLayout-content, .appNavbar-navbarMenu,
             .page-content-wrapper .larklet-extension-component,
             .page-content-wrapper .larklet-extension,
             .page-content-wrapper .larklet-extension > div,
             .lark-chat.main-box, .chatContainer, .chatMainContent) {
    background: transparent !important;
}
/* Glass panels: the chat list and the chat. */
html.fml .page-content-wrapper {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
/* The tab bar: a floating glass sidebar, as in macOS 27. The glass is a
   pseudo-element inset from the edges, so the bar keeps its own size and
   layout; isolation keeps the pseudo-element behind the bar's content. */
html.fml .appNavbar {
    background: transparent !important;
    isolation: isolate;
    color: var(--text-title) !important;
    /* Reserve a gap in the flex row so the wallpaper separates the sidebar
       from the chat list while the sidebar keeps its original width. */
    margin-inline-end: 8px !important;
}
html.fml .appNavbar::before {
    content: "";
    position: absolute;
    inset: 6px 0 6px 6px;
    z-index: -1;
    pointer-events: none;
    background: color-mix(in srgb, var(--bg-body) 55%, transparent);
    border-radius: var(--fml-radius-panel);
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow);
}
/* Feishu draws the tab bar for its slate colour, with white text and
   icons. On glass the palette's text colours apply instead. */
html.fml .appNavbar :is(.navbarMenu, .navbarMenu *, .appNavbar-search-input, .appNavbar-search-input *,
                         .quick-jump-enter__icon, .quick-jump-enter__icon *) {
    color: var(--text-caption) !important;
}
html.fml .appNavbar :is(.navbarMenu_active, .navbarMenu_active *) {
    color: var(--text-title) !important;
}
/* Unread badges keep white text on their red fill. */
html.fml .appNavbar :is([class*="badge" i], [class*="badge" i] *) {
    color: #fff !important;
}
/* Tabs are capsules; the selected one is a raised glass capsule. */
html.fml .appNavbar .navbarMenu {
    border-radius: 999px !important;
    transition: background-color .15s ease;
}
html.fml .appNavbar .navbarMenu:hover { background: var(--fill-hover) !important; }
html.fml .appNavbar .navbarMenu_active,
html.fml .appNavbar .navbarMenu_active:hover {
    background: color-mix(in srgb, var(--bg-float) 75%, transparent) !important;
    box-shadow: var(--fml-glass-edge), 0 1px 4px rgba(0, 0, 0, .12) !important;
}
html.fml .appNavbar .appNavbar-search-input {
    background: var(--fill-tag) !important;
    border: 0 !important;
    border-radius: 999px !important;
    box-shadow: var(--fml-glass-edge) !important;
}
/* The chat header floats above the messages as they scroll under it, so
   it blurs them, as toolbars do in iOS 27. */
html.fml .chatContainer__headerWrapper {
    background: color-mix(in srgb, var(--bg-body) 60%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    box-shadow: inset 0 -.5px 0 var(--line-divider-default) !important;
}
/* The message box: a glass field with continuous corners. */
html.fml .lark__editor--default {
    background: color-mix(in srgb, var(--bg-float) 62%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
html.fml .lark__editor--default:focus-within {
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow),
                0 0 0 3px color-mix(in srgb, var(--fml-blue) 35%, transparent) !important;
}

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
/* Switches in the palette's green. */
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
    html.fml :is(.page-content-wrapper, .chatContainer__headerWrapper, .lark__editor--default) {
        background: var(--bg-body) !important;
    }
    html.fml .appNavbar::before { background: var(--bg-body-overlay); }
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
    // Palette for the rest of Feishu's tokens. Besides the core tokens set
    // in the CSS, Feishu has about 13,000 tokens on :root in families such
    // as --imtoken-*, --udtoken-* and --vctoken-*, about 440 of them grays
    // for surfaces, text and lines. Listing them by hand would break each
    // time Feishu adds one, so the grays are remapped from Feishu's own
    // stylesheet once it loads: each gray goes to the palette colour at the
    // same lightness, and keeps its alpha. Real colours (blue, red, green
    // and so on) stay, as do fixed colours such as white text on buttons.
    // The result goes in a style element placed before the main one, so the
    // hand-picked core tokens in the CSS still win.
    // ---------------------------------------------------------------------
    // Lightness stops: a Feishu gray at lightness l becomes the colour
    // between the two stops around l.
    const RAMPS = {
        light: [[0, '#001f27'], [0.14, '#073642'], [0.22, '#2c4b53'], [0.35, '#586e75'],
            [0.45, '#657b83'], [0.6, '#93a1a1'], [0.76, '#b3b8ae'], [0.84, '#d2cbb5'],
            [0.9, '#e4ddc8'], [0.95, '#eee8d5'], [0.97, '#f6efdb'], [1, '#fdf6e3']],
        dark: [[0, '#0f0f14'], [0.04, '#13131a'], [0.08, '#16161e'], [0.1, '#1a1b26'],
            [0.16, '#1f2335'], [0.22, '#292e42'], [0.26, '#2f3549'], [0.31, '#3b4261'],
            [0.37, '#414868'], [0.46, '#565f89'], [0.55, '#737aa2'], [0.65, '#a9b1d6'],
            [0.82, '#b4bdea'], [0.92, '#c0caf5'], [1, '#e0e6ff']],
    };
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rampAt = (ramp, l) => {
        let i = 1;
        while (i < ramp.length - 1 && ramp[i][0] < l) i++;
        const [l0, c0] = ramp[i - 1];
        const [l1, c1] = ramp[i];
        const t = l1 === l0 ? 0 : Math.min(1, Math.max(0, (l - l0) / (l1 - l0)));
        const a = hexRgb(c0), b = hexRgb(c1);
        return a.map((x, k) => Math.round(x + (b[k] - x) * t));
    };
    const parseColor = (v) => {
        v = v.trim();
        let m = v.match(/^#([0-9a-f]{6})$/i);
        if (m) return [...hexRgb('#' + m[1]), 1];
        m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    // Tokens that must keep Feishu's value: fixed colours, illustrations,
    // charts, and the watermark.
    const KEEP = /static|white|black|illustration|datav|watermark|-(?:raw|SR|SG|SB|SA|HS|L)$/i;
    const remap = (rule, ramp) => {
        const out = [];
        for (const name of rule.style) {
            if (!name.startsWith('--') || KEEP.test(name)) continue;
            const c = parseColor(rule.style.getPropertyValue(name));
            if (!c || Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 14) continue;
            const l = (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 510;
            const [r, g, b] = rampAt(ramp, l);
            out.push(`${name}: ${c[3] === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${c[3]})`};`);
            if (rule.style.getPropertyValue(name + '-raw')) out.push(`${name}-raw: ${r},${g},${b};`);
        }
        return out.join('\n');
    };
    const tokenStyle = document.createElement('style');
    tokenStyle.id = 'fml-tokens';
    const done = new WeakSet();
    const buildTokens = () => {
        for (const sheet of document.styleSheets) {
            if (done.has(sheet)) continue;
            let rules;
            try { rules = sheet.cssRules; } catch { continue; } // cross-origin, no CORS
            done.add(sheet);
            let css = '';
            for (const rule of rules) {
                // Feishu's token sheet: :root with thousands of properties,
                // and the same :root again inside prefers-color-scheme: dark.
                if (rule.selectorText === ':root' && rule.style.length > 500) {
                    css += `html.fml, html.fml body {\n${remap(rule, RAMPS.light)}\n}\n`;
                } else if (rule.media && /dark/.test(rule.media.mediaText)) {
                    for (const inner of rule.cssRules) {
                        if (inner.selectorText === ':root' && inner.style.length > 500) {
                            css += `@media (prefers-color-scheme: dark) {\nhtml.fml, html.fml body {\n${remap(inner, RAMPS.dark)}\n}\n}\n`;
                        }
                    }
                }
            }
            if (css) {
                tokenStyle.textContent += css;
                if (!tokenStyle.isConnected && style.parentNode) style.parentNode.insertBefore(tokenStyle, style);
            }
        }
    };
    // The token sheet is a <link> in the HTML. Load events do not bubble,
    // so listen in the capture phase for any stylesheet that finishes.
    document.addEventListener('load', (e) => {
        if (e.target.tagName === 'LINK' && onMessenger()) buildTokens();
    }, true);
    document.addEventListener('DOMContentLoaded', () => { if (onMessenger()) buildTokens(); }, { once: true });
    // A manager that injects late (after the HTML is parsed) misses the
    // events above, so build from what is already loaded.
    if (document.readyState !== 'loading' && onMessenger()) whenRoot(buildTokens);

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
