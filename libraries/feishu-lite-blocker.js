// ==UserScript==
// @name         Feishu Lite Blocker
// @name:zh-CN   飞书精简拦截库
// @namespace    https://github.com/hxueh
// @version      1.0.0
// @description  Library for the Feishu Lite userscripts. Blocks Tea/Rangers analytics, Slardar monitoring and third-party marketing tags on Feishu pages before they load, and turns their globals into harmless stubs. Load it with @require and @run-at document-start, then call FeishuLiteBlocker.install().
// @description:zh-CN 飞书精简系列用户脚本的公共库。在飞书页面加载前拦截 Tea/Rangers 统计、Slardar 监控和第三方营销代码，并把它们的全局对象替换为无害的空实现。用 @require 引入并以 @run-at document-start 运行，然后调用 FeishuLiteBlocker.install()。
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
//     });
//
// The page-wide patches are installed once per window, even when several
// scripts, or one script running twice on a rewritten document, call
// install(). Each call adds its patterns as a rule with its own route
// check, and attaches the parser guard to the current document.
var FeishuLiteBlocker = (function () {
    'use strict';

    // Analytics and monitoring that every Feishu web app loads. The IM
    // gateway, WebSocket, passport, file CDNs and the company security
    // features (policy SDK, watermark, audit reporter) are not in this list.
    const BASE_PATTERNS = [
        // Tea / Rangers analytics: event uploads, SDK settings, web ID, plugins.
        '//mcs(?:-[a-z0-9-]+)?\\.(?:feishu\\.cn|larksuite\\.com|zijieapi\\.com)/',
        '//[^/]*applogcdn\\.com/', '/collect-autotrack-rangers\\.js', '//analytics\\.snssdk\\.com/',
        // Slardar performance and error monitor: SDK, plugins, settings, uploads.
        '//[^/]*bytedapm\\.com/', '/slardar/fe/sdk-web/', '//slardar[^/]*\\.(?:feishu\\.cn|larksuite\\.com)/',
        '/monitor_(?:browser|web)/(?:collect|settings)', '//mon\\.(?:zijieapi|snssdk|tiktokv)\\.com/',
        // Third-party marketing tags.
        '//www\\.googletagmanager\\.com/', '//(?:www|ssl)\\.google-analytics\\.com/',
        '//(?:px\\.ads|snap)\\.licdn\\.com/', '//px\\.ads\\.linkedin\\.com/', '//hm\\.baidu\\.com/',
    ];

    // State shared by every copy of this library in the window. A Symbol.for
    // key is the same in all copies, and it survives document.open().
    const KEY = Symbol.for('feishu-lite-blocker');
    const state = window[KEY] || (window[KEY] = { rules: [], patched: false, sink: null });

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

    const patch = () => {
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

    const install = ({ patterns = [], when = () => true, stubs = [] } = {}) => {
        // A second call with the same patterns (a script that runs again on
        // a rewritten document) replaces the rule instead of adding a copy.
        const source = [...BASE_PATTERNS, ...patterns].join('|');
        const existing = state.rules.find((rule) => rule.re.source === new RegExp(source).source);
        if (existing) existing.when = when;
        else state.rules.push({ re: new RegExp(source, 'i'), when });
        if (!state.patched) {
            state.patched = true;
            patch();
        }
        if (document.readyState === 'loading') guardParser();
        // Stubs for globals that inline snippets call, so they do not throw.
        const noop = () => {};
        for (const name of ['gtag', 'ga', 'collectEvent', ...stubs]) {
            if (!window[name]) window[name] = noop;
        }
        if (when() && !window.Slardar) window.Slardar = sink;
        if (!window.dataLayer) window.dataLayer = [];
        if (!window._hmt) window._hmt = [];
    };

    return { install, isBlocked, sink, BASE_PATTERNS };
})();
