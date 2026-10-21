// ==UserScript==
// @name         Feishu Lite Blocker
// @name:zh-CN   飞书精简拦截库
// @namespace    https://github.com/hxueh
// @version      1.3.0
// @description  Library for the Feishu Lite userscripts. Blocks analytics, monitoring, audit uploads, compliance pings and marketing tags before they load, stubs their globals, hides watermarks and can strip invisible tracking characters from the page title. Also gives route-change and page-ready helpers.
// @description:zh-CN 飞书精简系列用户脚本的公共库。在加载前拦截统计、监控、审计上报、合规心跳和营销代码，替换其全局对象，隐藏水印，并可去除页面标题中的隐形追踪字符。另提供路由变化和页面就绪辅助函数。
// @author       hxueh
// @license      MIT
// ==/UserScript==

/* exported FeishuLiteBlocker */

// Usage, in a userscript with @run-at document-start and @grant none (the
// patches must reach the page's own fetch, XHR and script loading):
//
//     FeishuLiteBlocker.install({
//         when: () => location.pathname.startsWith('/wiki'),  // optional route check
//         patterns: ['/some-extra-script\\.js'],              // optional, regex sources
//         stubs: ['lintrk'],                                  // optional no-op globals
//         cleanTitle: true,                                   // optional, see below
//     });
//
// Helpers that the scripts share, so each one does not patch history or
// wait for the parser on its own:
//
//     FeishuLiteBlocker.onRoute(fn);   // after pushState, replaceState, popstate
//     FeishuLiteBlocker.whenRoot(fn);  // once <html> exists
//     FeishuLiteBlocker.whenHead(fn);  // once <head> exists
//
// The page-wide patches are installed once per window, even when several
// scripts, or one script running twice on a rewritten document, call
// install(). Each call adds its patterns as a rule with its own route
// check, and attaches the parser guard to the current document.
var FeishuLiteBlocker = (function () {
    'use strict';

    // Share all rules from Messenger Lite 0.8.1 so each consumer blocks the
    // same optional scripts. The IM gateway, WebSocket, passport, file CDNs
    // and general policy APIs are not in this list. Watermarks are
    // hidden with CSS below because they can use inline image data.
    const BASE_PATTERNS = [
        // Tea / Rangers analytics: event uploads, SDK settings, web ID, plugins.
        '//mcs(?:-[a-z0-9-]+)?\\.(?:feishu\\.cn|larksuite\\.com|zijieapi\\.com)/',
        '//[^/]*applogcdn\\.com/', '/collect-autotrack-rangers\\.js', '//analytics\\.snssdk\\.com/',
        // Slardar performance and error monitor: SDK, plugins, settings, uploads.
        '//[^/]*bytedapm\\.com/', '/slardar/fe/sdk-web/', '//slardar[^/]*\\.(?:feishu\\.cn|larksuite\\.com)/',
        '/monitor_(?:browser|web)/(?:collect|settings)', '//mon\\.(?:zijieapi|snssdk|tiktokv)\\.com/',
        // Messenger's bundled Slardar copy is separate from the shared SDK.
        '/web-client-next/p/static/js/slardar\\.[0-9a-f]+\\.js',
        // Block the test tooling; screen readers and keyboards do not need it.
        '/accessibility-task-platform/',
        // Match only the SDK file, including its double-slash path. Policy
        // APIs used by login and messaging must still reach the server.
        '/lmp/scs/+policy-sdk(?:-[0-9][0-9A-Za-z._-]*)?\\.js(?:[?#]|$)',
        // The browser loads these reporting chunks separately. Do not match
        // every Policy SDK chunk: session refresh also uses that filename.
        '/lmp/scs/+(?:lmp-sdk-report|logger)\\.policy-sdk-[0-9][0-9A-Za-z._-]*\\.js(?:[?#]|$)',
        // Observed in Feishu Docs and confirmed in its Policy SDK. Include
        // the tenant probe, but keep other compliance and login APIs available.
        '/lark/scs/compliance/ping(?:_tenant_restriction)?/?(?:[?#]|$)',
        // The audit SDK also lives in a shared vendor bundle. Stop its upload
        // endpoint instead of blocking that bundle and breaking document code.
        '/suite/security/audit/client_events/create/?(?:[?#]|$)',
        // The same SDK falls back to this older endpoint when the audit
        // service domain is absent, so cover both upload methods.
        '/suite/admin/security/events/?(?:[?#]|$)',
        // Third-party marketing tags.
        '//www\\.googletagmanager\\.com/', '//(?:www|ssl)\\.google-analytics\\.com/',
        '//(?:px\\.ads|snap)\\.licdn\\.com/', '//px\\.ads\\.linkedin\\.com/', '//hm\\.baidu\\.com/',
    ];

    // State shared by every copy of this library in the window. A Symbol.for
    // key is the same in all copies, and it survives document.open().
    const KEY = Symbol.for('feishu-lite-blocker');
    const state = window[KEY] || (window[KEY] = { rules: [], patched: false, sink: null });
    // Callbacks for route changes. A Set in the shared state, so a second
    // copy of the library adds to the same list.
    if (!state.routeFns) state.routeFns = new Set();

    // At document-start the parser may not have created <html> or <head>
    // yet. Observe only until the element exists, then stop.
    const whenRoot = (fn) => {
        if (document.documentElement) { fn(); return; }
        const wait = new MutationObserver(() => {
            if (!document.documentElement) return;
            wait.disconnect();
            fn();
        });
        wait.observe(document, { childList: true });
    };
    const whenHead = (fn) => whenRoot(() => {
        if (document.head) { fn(); return; }
        const wait = new MutationObserver(() => {
            if (!document.head) return;
            wait.disconnect();
            fn();
        });
        wait.observe(document.documentElement, { childList: true });
    });

    // Slardar is called through a global whose name the page chooses (for
    // example Slardar, BearWebSlardarWeb or _lmp_slardar_client_...), as
    // name('init', ...) or name.getSender().send(...). This proxy returns
    // itself for any call or property, has no "then" so awaiting it does
    // not hang, and converts to "" as a value.
    const sink = state.sink || (state.sink = new Proxy(function () {}, {
        get: (_, key) => (key === 'then' || key === Symbol.iterator ? undefined
            : key === Symbol.toPrimitive ? () => ''
            : sink),
        apply: () => sink,
        construct: () => sink,
    }));
    const sinkGlobal = (name) => {
        if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return;
        try { window[name] = sink; } catch { /* a read-only global: leave it */ }
    };
    // The SDK URL names its global: browser.cn.js?bid=...&globalName=X.
    const sinkFromUrl = (url) => {
        const match = /[?&]globalName=([\w$]+)/.exec(url);
        if (match) sinkGlobal(match[1]);
    };

    // This runs on every request and every image src the app sets, so the
    // cheap checks come first. data: and blob: URLs are never trackers, and a
    // base64 image can be hundreds of KB, which a regex would scan in full.
    const isBlocked = (url) => {
        if (!url) return false;
        try {
            const s = typeof url === 'string' ? url : String(url instanceof Request ? url.url : url);
            if (s.startsWith('data:') || s.startsWith('blob:')) return false;
            return state.rules.some((rule) => rule.re.test(s) && rule.when());
        } catch { return false; }
    };

    // Inline Slardar loaders: each one defines a queue under its global
    // name, adds window "error" and "unhandledrejection" listeners, starts a
    // PerformanceObserver that keeps every long task and layout shift for
    // the life of the page, then adds the SDK script. The global name is
    // the last argument of the loader call.
    const SLARDAR_LOADER = /\/slardar\/fe\/sdk-web\//;
    const LOADER_GLOBAL = /['"]([A-Za-z_$][\w$]*)['"]\s*\)\s*;?\s*$/;
    const isSlardarLoader = (text) => text.includes('precollect') && SLARDAR_LOADER.test(text);

    // Selectors based on C3604's MIT-licensed watermark script, supplied by
    // the user: https://greasyfork.org/scripts/537395 . Keep the nodes in the
    // DOM so the app can still update them. CSS also covers later overlays
    // without observing every DOM change. Do not hide ordinary document images.
    const WATERMARK_CSS = `
.suite-clear[style*='background-image: url("'],
.suite-clear[style*='data:image/png;base64'],
.ssrWaterMark,
div[style*='position: fixed'][style*='pointer-events: none'][style*='height: 100%'][style*='width: 100%'][style*='background-image: url("data:image/png;base64,'],
div[style*='position: fixed'][style*='pointer-events: none'][style*='height: 100%'][style*='width: 100%'][style*='background-repeat: repeat;'] {
    transform: scale(0) !important;
    height: 1px !important;
    width: 1px !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}`;
    const syncWatermarks = () => {
        const root = document.documentElement;
        if (!root) return;
        // document.open() removes the old style. Recreate it on the next
        // install, using the same shared state to avoid duplicate styles.
        if (!state.watermarkStyle?.isConnected) {
            const style = document.createElement('style');
            style.textContent = WATERMARK_CSS;
            state.watermarkStyle = style;
            root.appendChild(style);
        }
        // Use the same route checks as the request blocker. When Messenger
        // navigates to another app, its watermark becomes visible again.
        state.watermarkStyle.media = state.rules.some((rule) => rule.when()) ? 'all' : 'not all';
    };
    // CSS handles later watermark updates, so only the first sync waits.
    const installWatermarks = () => whenRoot(syncWatermarks);

    // Feishu Docs puts about 45 invisible characters (zero-width spaces,
    // joiners, bidi controls) before each document title. They change on
    // every load, which suggests a per-user tracking code, and they go into
    // the tab, the history and bookmarks. Body text is not touched: the
    // editor uses zero-width spaces there to place the caret.
    const TITLE_JUNK = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;
    const TITLE_JUNK_ALL = new RegExp(TITLE_JUNK.source, 'g');
    const syncTitle = () => {
        if (!state.rules.some((rule) => rule.cleanTitle && rule.when())) return;
        const title = document.title;
        // Write only when there is something to remove. The write fires the
        // observer again, and the clean title then stops the loop here.
        if (TITLE_JUNK.test(title)) document.title = title.replace(TITLE_JUNK_ALL, '');
    };
    // Feishu sets the title once per navigation, by replacing the <title>
    // text or the element. Watch <head> for both. document.open() makes a
    // new <head>, so attach again when the observed one is gone.
    const watchTitle = () => whenHead(() => {
        if (state.titleObserver && state.titleHead === document.head) return;
        state.titleObserver?.disconnect();
        state.titleHead = document.head;
        state.titleObserver = new MutationObserver(syncTitle);
        state.titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
        syncTitle();
    });

    // One history patch serves the library and every script. An error in
    // one callback is logged and does not stop the others.
    const dispatchRoute = () => {
        syncWatermarks();
        syncTitle();
        for (const fn of state.routeFns) {
            try { fn(); } catch (error) { console.error('[Feishu Lite Blocker] Route callback failed:', error); }
        }
    };
    const onRoute = (fn) => {
        state.routeFns.add(fn);
        return () => state.routeFns.delete(fn);
    };

    const patch = () => {
        // Feishu changes routes without a page load. Run the route callbacks
        // after the URL changes, and preserve the history method's return value.
        for (const method of ['pushState', 'replaceState']) {
            const native = history[method];
            history[method] = function () {
                const result = native.apply(this, arguments);
                dispatchRoute();
                return result;
            };
        }
        // A blocked beacon reports success so the caller moves on.
        if (navigator.sendBeacon) {
            const beacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = (url, data) => (isBlocked(url) ? true : beacon(url, data));
        }
        // A blocked fetch resolves with "{}" so the SDKs do not throw or retry.
        const nativeFetch = window.fetch;
        window.fetch = function (input, init) {
            if (isBlocked(input)) {
                return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            return nativeFetch.apply(this, arguments);
        };
        // A blocked XHR loads an empty data: URL and completes without the network.
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
        // A blocked script fires an error so loaders give up instead of
        // hanging, and its global becomes the sink.
        const scriptSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            configurable: true, enumerable: scriptSrc.enumerable, get: scriptSrc.get,
            set(value) {
                if (!isBlocked(value)) { scriptSrc.set.call(this, value); return; }
                sinkFromUrl(String(value));
                this.type = 'javascript/blocked';
                setTimeout(() => this.dispatchEvent(new Event('error')), 0);
            },
        });
        const nativeSetAttribute = Element.prototype.setAttribute;
        // React calls setAttribute for every class, aria-* and data-* change, so
        // test the attribute name before running the URL regex.
        Element.prototype.setAttribute = function (name, value) {
            if (typeof name === 'string' && name.length === 3 && name.toLowerCase() === 'src'
                && (this instanceof HTMLScriptElement || this instanceof HTMLImageElement || this instanceof HTMLIFrameElement)
                && isBlocked(value)) {
                this.src = value; // routed through the guarded setters above
                return;
            }
            return nativeSetAttribute.call(this, name, value);
        };
    };

    // The HTML parser inserts scripts without the src setter. An observer
    // sees each one before it runs (the parser runs pending microtasks
    // before it executes a script) and disables it. It is attached to each
    // new document, so it is set up on every install() call.
    const guardParser = () => {
        const blockParsed = (node) => {
            if (node.tagName !== 'SCRIPT') return;
            if (node.src) {
                if (!isBlocked(node.src)) return;
                sinkFromUrl(node.src);
            } else {
                const text = node.textContent;
                if (!isSlardarLoader(text) || !state.rules.some((rule) => rule.when())) return;
                sinkGlobal(LOADER_GLOBAL.exec(text)?.[1]);
            }
            node.type = 'javascript/blocked';
            node.remove();
        };
        const parserGuard = new MutationObserver((records) => {
            for (const rec of records) for (const n of rec.addedNodes) blockParsed(n);
        });
        parserGuard.observe(document, { childList: true, subtree: true });
        // Later scripts come from code and hit the src setter, so stop here.
        document.addEventListener('DOMContentLoaded', () => parserGuard.disconnect(), { once: true });
        // Firefox can cancel a script outright.
        document.addEventListener('beforescriptexecute', (e) => {
            const s = e.target;
            if (s.src ? isBlocked(s.src) : isSlardarLoader(s.textContent) && state.rules.some((rule) => rule.when())) {
                e.preventDefault();
            }
        }, true);
    };

    const install = ({ patterns = [], when = () => true, stubs = [], cleanTitle = false } = {}) => {
        // A second call with the same patterns (a script that runs again on
        // a rewritten document) replaces the rule instead of adding a copy.
        const source = [...BASE_PATTERNS, ...patterns].join('|');
        const existing = state.rules.find((rule) => rule.re.source === new RegExp(source).source);
        if (existing) Object.assign(existing, { when, cleanTitle });
        else state.rules.push({ re: new RegExp(source, 'i'), when, cleanTitle });
        if (!state.patched) {
            state.patched = true;
            patch();
        }
        if (document.readyState === 'loading') guardParser();
        installWatermarks();
        if (cleanTitle) watchTitle();
        // document.open() can clear window listeners, so add this one on
        // each install. Remove the prior callback when another copy loads.
        if (state.popstate) window.removeEventListener('popstate', state.popstate);
        state.popstate = dispatchRoute;
        window.addEventListener('popstate', state.popstate);
        // Stubs for globals that inline snippets call, so they do not throw.
        const noop = () => {};
        for (const name of ['gtag', 'ga', 'collectEvent', 'lintrk', ...stubs]) {
            if (!window[name]) window[name] = noop;
        }
        if (when() && !window.Slardar) window.Slardar = sink;
        if (!window.dataLayer) window.dataLayer = [];
        if (!window._hmt) window._hmt = [];
    };

    return { install, isBlocked, sink, BASE_PATTERNS, onRoute, whenRoot, whenHead };
})();
