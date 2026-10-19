// ==UserScript==
// @name         Ctrip Mobile Lite
// @name:zh-CN   携程移动版精简
// @namespace    https://github.com/hxueh
// @version      0.1.0
// @description  Gives Ctrip's mobile web (m.ctrip.com) an iOS 27 Liquid Glass look with a floating glass tab bar, rounded cards and the system font. Blocks analytics, ad SDKs, app wake-up and incognito-detection scripts, and removes ads, app download prompts and floating badges. Follows the system dark mode.
// @description:zh-CN 为携程移动网页（m.ctrip.com）加入 iOS 27 液态玻璃风格：悬浮玻璃标签栏、圆角卡片和系统字体。拦截统计、广告 SDK、唤起 App 和无痕检测脚本，移除广告、App 下载提示和悬浮角标，并跟随系统深色模式。
// @author       hxueh
// @license      MIT
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA2NCA2NCc+PHJlY3Qgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyByeD0nMTQnIGZpbGw9JyMyODdkZmEnLz48dGV4dCB4PSczMicgeT0nNDQnIGZvbnQtZmFtaWx5PSdIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZicgZm9udC1zaXplPSczMCcgZm9udC13ZWlnaHQ9JzcwMCcgZmlsbD0nI2ZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+QzwvdGV4dD48L3N2Zz4=
// @match        https://m.ctrip.com/*
// @match        https://sec-m.ctrip.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    // Add ?ctml=off to a URL to see the original page, for example to check
    // whether a broken feature is caused by this script.
    if (new URLSearchParams(location.search).get('ctml') === 'off') return;

    // ---------------------------------------------------------------------
    // Request blocker. It runs first, at document-start, so the blocked
    // scripts never execute. With @grant none the script runs in the page, so
    // patching the page's own fetch, XHR, sendBeacon and script loading
    // affects every caller.
    //
    // Ctrip's risk control reads several of the scripts it loads. These stay:
    // md.min.js and mrms.js (ubtrms risk), c-sign.js and c-sec.js (request
    // signing), bn-pf (bot fingerprint), cdid.c-ctrip.com (device ID), the
    // captcha and login SDKs, and the hotel and flight anti-spider scripts.
    // Without them the APIs answer with a captcha or an empty result.
    //
    // UBT, Ctrip's page-view and click analytics library (ubt.minh.js), also
    // stays, because it is what loads c-sec.js and mrms.js. Only its two
    // upload endpoints on s.c-ctrip.com are blocked, so the data it collects
    // never leaves the browser.
    // ---------------------------------------------------------------------
    const BLOCKED_URL = new RegExp([
        // UBT beacons (bf.gif, bee/collect) and the account UBT add-on.
        '//s\\.c-ctrip\\.com/', '/cusersdk_accountubt/',
        // Flight "insight" analytics and the generic stat and trace endpoints.
        '/modules/flight/insight-js/', '/restapi/soa2/29624/', '/restapi/soa2/20589/SaveTraceInfo',
        // Session screen capture for feedback reports.
        '/nfes-libs/[^/]+/screenshot2\\.js',
        // Marketing attribution, app wake-up, floating promos and the
        // redirect to the app download page.
        '/mkt-union-tracing/', '//pages\\.ctrip\\.com/market/wakeup/',
        // Ad SDKs and the ad exchange pixel.
        '/market/adsdk/', '/packages/market/mktadsdk/', '//ma-adx\\.ctrip\\.com/',
        '/restapi/soa2/13916/(?:tripAds|getPushId)', '/restapi/soa2/10994/json/GetFloatUI',
        '/restapi/soa2/28252/PopupActivity',
        // SEM landing-page scripts and China Mobile push.
        '/ResH5SearchOnline/app_se[mo]\\.js', '//jzts\\.cmpassport\\.com/',
        // Third-party analytics.
        '//(?:www|ssl)\\.google-analytics\\.com/', '//hm\\.baidu\\.com/', '//zz\\.bdstatic\\.com/',
        // App schemes. Opening one from a web page only shows an error.
        '^ctrip:', '^ctripwireless:',
    ].join('|'), 'i');
    const isBlocked = (url) => {
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
    // so callers that chain .json() keep working.
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
    // Tracking pixels and app-scheme iframes: a blocked src is never set.
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
        if (String(name).toLowerCase() === 'src' && isBlocked(value)
            && (this instanceof HTMLScriptElement || this instanceof HTMLImageElement || this instanceof HTMLIFrameElement)) {
            this.src = value; // routed through the guarded setters above
            return;
        }
        return nativeSetAttribute.call(this, name, value);
    };
    // Scripts written in the HTML: the parser inserts them before it runs
    // them, and a mutation callback runs in between. Changing the type then
    // stops execution, and removing the node keeps the DOM tidy.
    new MutationObserver((records) => {
        for (const rec of records) {
            for (const n of rec.addedNodes) {
                if (n.tagName === 'SCRIPT' && n.src && isBlocked(n.src)) {
                    n.type = 'javascript/blocked';
                    n.remove();
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Pages call the Google and Baidu analytics globals directly, for
    // example ga('send', ...). Stubs that accept any call keep those calls
    // from throwing now that the libraries never load.
    if (!window._hmt) window._hmt = [];
    if (!window.ga) window.ga = () => {};

    // Links into the app ("打开App", "App内打开") use an app scheme or go
    // through the download redirect. A tap on one does nothing useful in a
    // browser, so stop it before Ctrip's own handler runs.
    const APP_LINK = /^(?:ctrip|ctripwireless):|\/\/(?:m\.ctrip\.com\/m\/c\d+|pages\.ctrip\.com\/market\/wakeup|english\.ctrip\.com\/main\/downapp)|[?&]openapp=1/i;
    document.addEventListener('click', (event) => {
        const link = event.target instanceof Element && event.target.closest('a[href]');
        if (link && APP_LINK.test(link.getAttribute('href'))) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    // ---------------------------------------------------------------------
    // Theme. Ctrip's mobile site is many separate apps (Next.js on the home
    // page, Taro on hotels, flights and cars, and older Lizard pages), each
    // with its own hashed class names. So the theme has two parts:
    //
    // 1. Rules for the few stable names: the home page, the hotel and home
    //    tab bars, and the ad and app-promo containers.
    // 2. A JS pass (classify below) that recognises page chrome by layout,
    //    not by class name, and tags it with ctml-* classes. The CSS then
    //    styles those tags, so new Ctrip apps get the look too.
    //
    // The look follows iOS 27 Liquid Glass: translucent bars that blur and
    // brighten what is behind them, a thin light edge on the glass, a
    // floating capsule tab bar, large rounded cards and the system font.
    // ---------------------------------------------------------------------
    const CSS = `
:root {
    --ctml-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Hiragino Sans GB", sans-serif;
    --ctml-bg: #f2f2f7;
    --ctml-card: #fff;
    --ctml-label: #000;
    --ctml-label2: rgba(60, 60, 67, .6);
    --ctml-fill: rgba(118, 118, 128, .12);
    --ctml-separator: rgba(60, 60, 67, .16);
    --ctml-accent: #0a7aff;
    /* Liquid Glass: a light, translucent tint, a strong blur that also
       raises saturation, a bright inner edge on top and a soft shadow. */
    --ctml-glass: rgba(255, 255, 255, .62);
    --ctml-glass-filter: blur(22px) saturate(190%) brightness(1.04);
    --ctml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .9), inset 0 0 0 .5px rgba(255, 255, 255, .45);
    --ctml-glass-shadow: 0 10px 30px rgba(0, 0, 0, .12), 0 1px 3px rgba(0, 0, 0, .06);
    --ctml-radius: 24px;
    --ctml-safe-bottom: env(safe-area-inset-bottom, 0px);
    -webkit-text-size-adjust: 100%;
}

html, body {
    font-family: var(--ctml-font) !important;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
}
input, textarea, button, select { font-family: inherit; }

/* ---- Removed: ads, app prompts, floating badges --------------------- */
.promotion-app, #c_mkt_app_download, #HOMEPAGE_TO_APP,
.ad-banner-wrap, [id^="adsdk_"], [class*="adsdk_" i], #newAdSdk,
.fixed-sign-in-entry, #c_bbz_h5_qiandao,
[class*="downloadApp" i], [class*="download-app" i], [class*="download_app" i],
[class*="openApp" i], [class*="open-app" i], [class*="open_app" i],
[class*="appBanner" i], [class*="app-banner" i], [class*="wakeup" i], [class*="wake-up" i],
[class*="mkt-float" i], [class*="mktFloat" i], [id*="mkt_float" i],
/* Dialog ads and floats from the marketing float script (flt_*). The
   script itself is blocked; this covers pages that bundle a copy. */
[class*="dialogAd" i], [class^="flt_"], [class*=" flt_"],
.ctml-hidden {
    display: none !important;
}

/* ---- Liquid Glass surfaces ------------------------------------------- */
.ctml-glass-top, .ctml-glass-bottom, .ctml-tabbar {
    background: var(--ctml-glass) !important;
    -webkit-backdrop-filter: var(--ctml-glass-filter) !important;
    backdrop-filter: var(--ctml-glass-filter) !important;
}
.ctml-glass-top { box-shadow: 0 .5px 0 var(--ctml-separator) !important; }
.ctml-glass-bottom {
    box-shadow: 0 -.5px 0 var(--ctml-separator) !important;
    border-top-left-radius: 22px !important;
    border-top-right-radius: 22px !important;
    padding-bottom: var(--ctml-safe-bottom) !important;
}
/* Children of a glass bar often paint their own white background, which
   would hide the glass. Clear the direct children only, so buttons and
   badges further down keep their colors. */
.ctml-glass-top > *, .ctml-glass-bottom > *, .ctml-tabbar > * {
    background-color: transparent !important;
}

/* The tab bar floats above the page as a capsule, as in iOS 26 and 27.
   The host is the fixed element that places the bar. It is the bar itself,
   or, in Taro apps, a plain fixed wrapper around it. */
.ctml-tabbar-host {
    left: 14px !important;
    right: 14px !important;
    width: auto !important;
    bottom: calc(8px + var(--ctml-safe-bottom)) !important;
    /* Some bars centre themselves with left: 50% and a transform or a
       negative margin. With left and right set, those would push the
       bar off screen. */
    transform: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
}
/* A separate wrapper must not paint over the glass bar inside it. */
.ctml-tabbar-host:not(.ctml-tabbar) { background: transparent !important; }
.ctml-tabbar {
    min-height: 58px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: 999px !important;
    box-shadow: var(--ctml-glass-edge), var(--ctml-glass-shadow) !important;
    display: flex !important;
    align-items: stretch !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
}
.ctml-tabbar > * {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 2px;
    border-radius: 999px !important;
    transition: background-color .2s ease, transform .2s ease;
}
.ctml-tabbar > :active { transform: scale(.94); }
.ctml-tabbar > .ctml-tab-active { background-color: var(--ctml-fill) !important; }
.ctml-tabbar > .ctml-tab-active > :last-child { color: var(--ctml-accent) !important; font-weight: 600; }
/* Leave room under the page for the floating bar. */
html.ctml-has-tabbar body { padding-bottom: calc(80px + var(--ctml-safe-bottom)) !important; }

/* ---- Cards and controls --------------------------------------------- */
.ctml-card {
    border-radius: var(--ctml-radius) !important;
    corner-shape: squircle;
    overflow: hidden;
}
.ctml-primary {
    border-radius: 999px !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 6px 16px rgba(0, 0, 0, .12) !important;
    transition: transform .15s ease, filter .15s ease;
}
.ctml-primary:active { transform: scale(.97); filter: brightness(.95); }
.ctml-pill { border-radius: 999px !important; }

/* ---- Home page (m.ctrip.com/html5/) --------------------------------- */
html.ctml-home, html.ctml-home body { background: var(--ctml-bg) !important; }
html.ctml-home .index-page-top-wrap {
    background: var(--ctml-glass) !important;
    -webkit-backdrop-filter: var(--ctml-glass-filter);
    backdrop-filter: var(--ctml-glass-filter);
    box-shadow: 0 .5px 0 var(--ctml-separator);
    padding-top: env(safe-area-inset-top, 0px);
}
html.ctml-home #search-box { background: transparent !important; }
html.ctml-home .search-index-box {
    height: 38px !important;
    margin: 6px 14px !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--ctml-fill) !important;
    box-shadow: var(--ctml-glass-edge);
    display: flex !important;
    align-items: center !important;
    color: var(--ctml-label2) !important;
    font-size: 16px !important;
}
html.ctml-home .search-index-box .icon-global-search { color: var(--ctml-label2) !important; }
html.ctml-home .main-nav-wrap,
html.ctml-home .sub-nav-wrap {
    margin: 10px 14px 0 !important;
    border-radius: var(--ctml-radius) !important;
    corner-shape: squircle;
    overflow: hidden !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}
html.ctml-home .nav-switch-item { border-radius: 999px !important; }
html.ctml-home .nav-switch-item-active { background: var(--ctml-accent) !important; }
html.ctml-home .sub-banner { padding: 0 14px !important; gap: 10px; }
html.ctml-home .sub-banner .banner {
    border-radius: var(--ctml-radius) !important;
    corner-shape: squircle;
    overflow: hidden !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}
html.ctml-home .sub-banner .banner img { border-radius: 14px; }
html.ctml-home .toolbox { background: transparent !important; }
html.ctml-home .tool-link {
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--ctml-card) !important;
    color: var(--ctml-accent) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
html.ctml-home .tool-ver, html.ctml-home .tool-ver a { color: var(--ctml-label2) !important; }
/* The search overlay that opens from the search bar. */
html.ctml-home .search-wrap .search-box {
    border-radius: 999px !important;
    background: var(--ctml-fill) !important;
}
html.ctml-home .search-list li { border-radius: 999px !important; }

/* ---- Hotel search (m.ctrip.com/webapp/hotels/) ---------------------- */
/* The hero is an ad slider. With the ad hidden, keep only enough of it
   for the back and account buttons that sit on top of it. The search
   form below overlaps the hero by 44px, so 100px leaves a 56px bar. */
.hero-slider:has(> #newAdSdk) {
    height: calc(100px + env(safe-area-inset-top, 0px)) !important;
    background: transparent !important;
}
.hero-slider .hero-shadow,
[class*="header_activity"] {
    display: none !important;
}
.cm-modal {
    border-radius: 18px !important;
    background: var(--ctml-glass) !important;
    -webkit-backdrop-filter: var(--ctml-glass-filter);
    backdrop-filter: var(--ctml-glass-filter);
}

/* ---- Dark mode ------------------------------------------------------- */
/* Ctrip has no dark mode, and its many apps share no colour variables, so
   the whole page is inverted with one filter, as in WSJ Dark Mode.
   invert(.92) maps white to about #141414, and hue-rotate(180deg) brings
   the hues back, so Ctrip blue stays blue and prices stay orange.
   Photos and video are inverted a second time, which restores them. */
@media (prefers-color-scheme: dark) {
    /* The filter does not reach the canvas behind the page, which shows
       the root background below short pages and when the page bounces.
       So the root background is dark already, and the body carries the
       light background that the filter turns dark. */
    html, html.ctml-home {
        background: #1c1c1e !important;
        filter: invert(.92) hue-rotate(180deg);
    }
    body { min-height: 100vh; }
    html.ctml-home body { background: var(--ctml-bg) !important; }
    img, picture, video, canvas, iframe,
    [style*="background-image"], .taro-img {
        filter: brightness(.88) invert(1) hue-rotate(180deg);
    }
    :is(img, picture, video, canvas, [style*="background-image"], .taro-img)
        :is(img, picture, video, canvas, [style*="background-image"], .taro-img) {
        filter: none;
    }
    /* Primary buttons keep their real colours, as tinted buttons do in
       iOS dark mode. Without this their white label would turn dark. */
    .ctml-primary { filter: invert(1) hue-rotate(180deg); }
    /* Small icons and logos look right with only the page filter. */
    img[src$=".svg"], img[src*=".svg?"], .ctml-icon { filter: none !important; }
    /* Shadows would turn into glows under the filter. */
    .ctml-tabbar { box-shadow: var(--ctml-glass-edge), 0 8px 24px rgba(0, 0, 0, .06) !important; }
}
`;

    const style = document.createElement('style');
    style.id = 'ctml-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    // Some Ctrip apps replace the head when they boot. Put the style back.
    new MutationObserver(() => {
        if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    }).observe(document.documentElement, { childList: true });

    const root = document.documentElement;
    if (/^\/html5\/?(?:index\.html)?$/.test(location.pathname)) root.classList.add('ctml-home');

    // ---------------------------------------------------------------------
    // Layout classifier. It looks at each new element's computed style and
    // box once (the data-ctml mark stops a second look) and tags the ones
    // that are page chrome. Reading computed style is the expensive part, so
    // the work runs in idle time, in batches, and skips small inline nodes.
    // ---------------------------------------------------------------------

    // Tab bars with known class names. The classifier also finds unnamed
    // ones: a fixed bar at the bottom whose children are 3 to 5 icon tabs.
    const TABBAR_SELECTOR = '.tabbar, [class*="bottomToolbar_bottomBarRoot"], [class*="tab-bar" i], [class*="tabBar"]';
    // Short labels of app prompts that Ctrip renders without a stable class.
    const APP_PROMPT_TEXT = /^(?:打开|下载|去)(?:携程)?\s*app|app\s*(?:内|里)(?:打开|查看|领取)|^下载携程$|^打开携程$/i;
    // Labels of the primary action button on search forms.
    const PRIMARY_TEXT = /^(?:查\s*询|搜\s*索|搜索|立即预订|预订|去支付|提交订单|下一步|确定|登录)$/;

    const isWhite = (color) => color === 'rgb(255, 255, 255)';
    const isTransparent = (color) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
    // A saturated fill, such as Ctrip blue or flight orange, as opposed to
    // white, grey or a transparent background.
    const isColorful = (color) => {
        const m = color.match(/\d+(?:\.\d+)?/g);
        if (!m || (m[3] !== undefined && Number(m[3]) < .5)) return false;
        const [r, g, b] = m.map(Number);
        return Math.max(r, g, b) - Math.min(r, g, b) > 60;
    };

    const markTabbar = (bar) => {
        const host = getComputedStyle(bar).position === 'fixed' ? bar : bar.parentElement;
        host.classList.add('ctml-tabbar-host');
        bar.classList.add('ctml-tabbar');
        // An earlier look may have seen the wrapper as a plain bottom bar.
        host.classList.remove('ctml-glass-bottom');
        bar.classList.remove('ctml-glass-bottom');
        root.classList.add('ctml-has-tabbar');
        // The selected tab is the one whose label is coloured. Compare the
        // label colours and highlight the odd one out.
        const tabs = [...bar.children];
        const colors = tabs.map((tab) => getComputedStyle(tab.lastElementChild || tab).color);
        const counts = colors.reduce((acc, c) => acc.set(c, (acc.get(c) || 0) + 1), new Map());
        // With two tabs both colours are unique, so take the coloured one
        // (Ctrip blue) over the grey one.
        const unique = tabs.map((tab, i) => i).filter((i) => counts.get(colors[i]) === 1);
        let active = unique.length === 1 ? unique[0] : unique.find((i) => isColorful(colors[i])) ?? -1;
        // On the home page every label is grey and only the icon image
        // changes. There the current tab is the link that goes nowhere
        // (javascript:void(0)) or back to this page.
        if (active < 0) {
            active = tabs.findIndex((tab) => {
                const href = tab.getAttribute('href') || '';
                return /^javascript:/i.test(href) || (href && tab.href.split('?')[0] === location.href.split('?')[0]);
            });
        }
        tabs.forEach((tab, i) => tab.classList.toggle('ctml-tab-active', i === active));
    };

    const classify = (el) => {
        if (el.dataset.ctml) return;
        el.dataset.ctml = '1';
        // A named tab bar counts when it, or a fixed wrapper of the same
        // height, is fixed to the screen.
        if (el.matches(TABBAR_SELECTOR) && el.children.length >= 2) {
            const parent = el.parentElement;
            if (getComputedStyle(el).position === 'fixed'
                || (parent && getComputedStyle(parent).position === 'fixed'
                    && Math.abs(parent.getBoundingClientRect().height - el.getBoundingClientRect().height) <= 4)) {
                markTabbar(el);
                return;
            }
        }
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.display === 'inline') return;
        const rect = el.getBoundingClientRect();
        const text = el.childElementCount <= 3 ? el.textContent.trim() : '';

        // Sponsored results carry a small "广告" (ad) label. Hide the result
        // row that holds it: the nearest ancestor that is one of several
        // rows, which shows as a parent much taller than the row.
        // A header carousel of ads can share its box with the city picker
        // and the search field, so a block with a form control is never
        // hidden.
        if (text === '广告' && rect.height <= 24) {
            let row = el;
            while (row.parentElement && row.parentElement !== document.body) {
                const parentHeight = row.parentElement.getBoundingClientRect().height;
                const rowHeight = row.getBoundingClientRect().height;
                if (rowHeight >= 80 && parentHeight > rowHeight * 1.8) break;
                row = row.parentElement;
            }
            if (row.parentElement !== document.body && row.getBoundingClientRect().height <= 500
                && !row.querySelector('input, textarea, select, form, [role="search"], [class*="search" i]')) {
                row.classList.add('ctml-hidden');
            }
            return;
        }

        if (rect.width < 40 || rect.height < 20) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // App prompts: small elements whose whole label asks to open the app.
        if (text && text.length <= 12 && APP_PROMPT_TEXT.test(text)) {
            const box = el.closest('[style*="fixed"], [class*="float" i], [class*="banner" i]') || el;
            if (box !== document.body) box.classList.add('ctml-hidden');
            return;
        }

        if (cs.position === 'fixed' || cs.position === 'sticky') {
            const fullWidth = rect.width >= vw * .9;
            // A bar along the top of the screen: the navigation header.
            if (fullWidth && rect.top <= 4 && rect.height <= 100 && !isTransparent(cs.backgroundColor)) {
                el.classList.add('ctml-glass-top');
                return;
            }
            // A bar along the bottom: either a tab bar or an action bar
            // with a total and a pay button. Only a fixed element counts:
            // a sticky filter bar can sit at the bottom edge while the page
            // loads and move up later.
            if (cs.position === 'fixed' && fullWidth && rect.bottom >= vh - 4 && rect.height <= 120) {
                // Many apps wrap the bar in a transparent fixed element.
                // Then the bar is its only visible child of about the same
                // height. Taro adds an empty safe-area spacer next to it.
                let bar = el;
                const visible = [...el.children].filter((c) => c.getBoundingClientRect().height > 0);
                if (visible.length === 1 && Math.abs(visible[0].getBoundingClientRect().height - rect.height) <= 4) bar = visible[0];
                const kids = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0);
                // Tabs are 2 to 5 items, each with an icon and a label.
                // An action bar has wider items, usually without icons.
                const tabLike = kids.length >= 2 && kids.length <= 5 && kids.every((c) => {
                    const r = c.getBoundingClientRect();
                    return r.height >= 36 && r.width <= vw / 2 + 1 && c.querySelector('img, svg, i, [class*="icon" i], .taro-img');
                });
                if (tabLike) markTabbar(bar);
                else if (!isTransparent(getComputedStyle(bar).backgroundColor)) bar.classList.add('ctml-glass-bottom');
                return;
            }
            // Small floating badges in a corner (sign-in, coupons, red
            // packets). Fixed, narrow, off to one side, and not a dialog.
            // Customer service and back-to-top buttons look the same but
            // are useful, so their labels keep them.
            if (rect.width <= 96 && rect.height <= 110 && (rect.right >= vw - 8 || rect.left <= 8)
                && rect.top > 80 && el.querySelector('img, .taro-img') && !el.closest('[role="dialog"]')
                && !/客服|咨询|顶部/.test(el.textContent)) {
                el.classList.add('ctml-hidden');
                return;
            }
        }

        // Primary buttons: a short label on a saturated fill, wide enough
        // to be the form's main action.
        if (text && PRIMARY_TEXT.test(text) && rect.width >= vw * .4 && rect.height >= 34 && rect.height <= 64
            && (isColorful(cs.backgroundColor) || cs.backgroundImage.includes('gradient'))) {
            el.classList.add('ctml-primary');
            return;
        }

        // Cards: wide white blocks that already have rounded corners. Ctrip
        // uses 4 to 12 px; the larger iOS radius makes them read as cards.
        if (isWhite(cs.backgroundColor) && parseFloat(cs.borderTopLeftRadius) >= 4
            && rect.width >= vw * .6 && rect.width < vw - 1 && rect.height >= 48) {
            el.classList.add('ctml-card');
            return;
        }

        // Chips and tags: small rounded fills become capsules.
        const radius = parseFloat(cs.borderTopLeftRadius);
        if (radius >= 2 && radius < rect.height / 2 && rect.height <= 34 && rect.width <= 140
            && !isTransparent(cs.backgroundColor) && text && text.length <= 8) {
            el.classList.add('ctml-pill');
        }
    };

    // Elements that cannot be page chrome, or whose computed style would be
    // wasted work.
    const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BR', 'SVG', 'PATH', 'IMG', 'INPUT', 'TEXTAREA',
        'SPAN', 'I', 'B', 'EM', 'STRONG', 'P', 'H1', 'H2', 'H3', 'H4', 'LABEL', 'OPTION', 'SOURCE', 'PICTURE', 'VIDEO']);
    const queue = new Set();
    let scheduled = false;
    // deep is false when only the node itself changed (a class or style
    // update); its children were already looked at.
    const enqueue = (node, deep = true) => {
        if (node.nodeType !== 1) return;
        if (!SKIP.has(node.tagName.toUpperCase())) queue.add(node);
        if (!deep) { schedule(); return; }
        // Walk the whole subtree. Apps often mount the full page in one
        // insertion, and the tab bar is usually its last, deepest part.
        // The walk only queues nodes; the costly checks run in idle time.
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!SKIP.has(n.tagName.toUpperCase())) queue.add(n);
        }
        schedule();
    };
    const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 50));
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        idle((deadline) => {
            scheduled = false;
            for (const el of queue) {
                queue.delete(el);
                if (el.isConnected) {
                    try { classify(el); } catch { /* a detached or odd node; skip it */ }
                }
                if (deadline.timeRemaining() < 2) break;
            }
            if (queue.size) schedule();
        }, { timeout: 300 });
    };

    const start = () => {
        enqueue(document.body);
        // The page's class names, without the ctml-* tags this script adds.
        // Adding a tag is itself a class change, and it must not count as a
        // page change, or every tagged element would be looked at again.
        const ownClasses = (value) => (value || '').replace(/\bctml-[\w-]+/g, '').trim();
        new MutationObserver((records) => {
            for (const rec of records) {
                for (const n of rec.addedNodes) enqueue(n);
                // Taro apps switch a tab or move a bar into place by
                // changing its class or style. Look at that element again.
                const el = rec.target;
                if (rec.type !== 'attributes' || !el.dataset || !el.dataset.ctml) continue;
                if (rec.attributeName === 'class' && ownClasses(rec.oldValue) === ownClasses(el.getAttribute('class'))) continue;
                delete el.dataset.ctml;
                enqueue(el, false);
            }
        }).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'],
        });
        // The tab bar's selected item changes after the page's first data
        // load, so check it again once things settle.
        setTimeout(() => document.querySelectorAll('.ctml-tabbar').forEach(markTabbar), 1500);
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
