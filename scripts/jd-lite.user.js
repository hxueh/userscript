// ==UserScript==
// @name         JD Lite
// @name:zh-CN   京东精简版
// @namespace    https://github.com/hxueh
// @version      0.3.0
// @description  Strips JD desktop pages down to search, product images, price, SKU and buy buttons, blocks tracking scripts and beacons, removes popups, side rails, sponsored results and recommendations, and restyles search and item pages in an iOS look that works at phone and desktop width and follows the system dark mode.
// @description:zh-CN 把京东桌面版精简为搜索、商品图、价格、规格和购买按钮，拦截统计脚本与上报请求，移除弹窗、侧边栏、推广商品和推荐模块，并以 iOS 风格重绘搜索页和商品页，手机和电脑宽度都能正常使用，并跟随系统深色模式。
// @author       hxueh
// @license      MIT
// @homepageURL  https://github.com/hxueh
// @supportURL   https://github.com/hxueh
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA2NCA2NCc+PHJlY3Qgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyByeD0nMTQnIGZpbGw9JyNlMTI1MWInLz48dGV4dCB4PSczMicgeT0nNDQnIGZvbnQtZmFtaWx5PSdIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZicgZm9udC1zaXplPScyOCcgZm9udC13ZWlnaHQ9JzcwMCcgZmlsbD0nI2ZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+SkQ8L3RleHQ+PC9zdmc+
// @match        https://www.jd.com/*
// @match        https://jd.com/*
// @match        https://search.jd.com/*
// @match        https://item.jd.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const STYLE_ID = 'jdl-style';

    // ---------------------------------------------------------------------
    // Request blocker. It has to run first, at document-start, so the tracking
    // scripts never execute. With @grant none the script runs in the page, so
    // patching the page's own fetch, XHR, sendBeacon and script loading takes
    // effect for every caller.
    //
    // Only analytics that JD's risk control does not read are blocked. Its
    // own scripts (pc-risk, js_security, gias pc-tk, jra jsTk, gatherInfo,
    // passport, sso) stay, and so do two feeds it scores sessions with:
    // wl.js, which sets the visitor-ID cookies, and cactus.jd.com, which
    // signs api.m.jd.com calls and receives the mouse and keyboard behaviour
    // report. With those blocked, the server answers the first interaction
    // with risk code 605 and the page is replaced by "当前页面异常" or a
    // forced sign-in.
    // ---------------------------------------------------------------------
    const BLOCKED_URL = new RegExp([
        // Page-view and click log pixels, and page-speed beacons.
        '//mercury\\.jd\\.com/', '//uranus\\.jd\\.com/', '//knicks\\.jd\\.com/', '//h5speed\\.m\\.jd\\.com/',
        // Performance and error monitoring SDKs.
        '/dra/probe-web/', '/ws-js/[^/]+/web-monitor', '//sgm-static\\.jd\\.com/', '//sgm-m\\.jd\\.com/',
        // Third-party analytics.
        '//zz\\.bdstatic\\.com/', '//hm\\.baidu\\.com/', '//(?:www|ssl)\\.google-analytics\\.com/',
        // The accessibility toolbar loader and the "shop around" AI widget.
        '/oldman/wza1/', '/qyg-ai-shop-around',
    ].join('|'), 'i');
    // api.m.jd.com calls that only feed modules this script hides.
    const BLOCKED_API = /[?&]functionId=(?:pc_item_getWareRecommendation|pctradesoa_queryAdverts|relsearch)(?:&|$)/;
    const isBlocked = (url) => {
        try {
            const s = String(url instanceof Request ? url.url : url);
            return BLOCKED_URL.test(s) || (s.includes('api.m.jd.com') && BLOCKED_API.test(s));
        } catch { return false; }
    };

    // Beacons report that they were queued so the caller moves on.
    if (navigator.sendBeacon) {
        const beacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = (url, data) => (isBlocked(url) ? true : beacon(url, data));
    }
    // A blocked fetch resolves with an empty JSON object rather than failing, so
    // callers that chain .json() keep working.
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
        if (isBlocked(input)) {
            return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return nativeFetch.apply(this, arguments);
    };
    // A blocked XHR is pointed at an empty data: URL, which completes
    // normally without a network request.
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (isBlocked(url)) return nativeOpen.call(this, 'GET', 'data:application/json,{}', ...rest);
        return nativeOpen.call(this, method, url, ...rest);
    };
    // Tracking pixels: an image whose src is blocked never loads.
    const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, enumerable: imgSrc.enumerable, get: imgSrc.get,
        set(value) { if (!isBlocked(value)) imgSrc.set.call(this, value); },
    });
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
        if (this instanceof HTMLScriptElement && String(name).toLowerCase() === 'src' && isBlocked(value)) {
            this.src = value; // routed through the guarded setter above
            return;
        }
        return nativeSetAttribute.call(this, name, value);
    };
    // Scripts written in the HTML: the parser inserts them before running
    // them, and a mutation callback runs in between. Changing the type then
    // stops execution; removing the node keeps the DOM tidy.
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

    // JD's desktop pages mix stable class names (plugin_goodsCardWrapper,
    // page-right-*, bottom-btns-root) with CSS-module names whose hash changes
    // between releases ("_card_1y1ag_92"). The stable names are used where they
    // exist; the module names are matched by prefix with [class*="_card_"].
    //
    // The look follows iOS: grouped grey background, white cards with large
    // corners, translucent "glass" bars, capsule controls and the system font.
    // Colours live in custom properties so one block defines them.
    const CSS = `
:root {
    --jdl-bg: #f2f2f7;
    --jdl-card: #fff;
    /* The selected segment of a segmented control, and text on a label-coloured fill. */
    --jdl-segment: #fff;
    --jdl-on-label: #fff;
    --jdl-on-label-filter: brightness(0) invert(1);
    --jdl-label: #000;
    --jdl-label2: rgba(60, 60, 67, .6);
    --jdl-fill: rgba(118, 118, 128, .12);
    --jdl-separator: rgba(60, 60, 67, .18);
    --jdl-tint: #e1251b;
    --jdl-tint-soft: rgba(225, 37, 27, .1);
    --jdl-price: #ff3b30;
    --jdl-glass: rgba(255, 255, 255, .72);
    --jdl-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 4px 16px rgba(0, 0, 0, .04);
    --jdl-radius: 20px;
    --jdl-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", system-ui, sans-serif;
}

/* Dark mode follows the system setting with the iOS dark palette: black page,
   elevated grey cards, white labels. color-scheme dark also gives form
   controls and scroll bars their dark look. */
@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        --jdl-bg: #000;
        --jdl-card: #1c1c1e;
        --jdl-segment: #636366;
        --jdl-label: #fff;
        --jdl-label2: rgba(235, 235, 245, .6);
        --jdl-fill: rgba(118, 118, 128, .24);
        --jdl-separator: rgba(84, 84, 88, .65);
        --jdl-tint: #ff453a;
        --jdl-tint-soft: rgba(255, 69, 58, .18);
        --jdl-price: #ff453a;
        --jdl-glass: rgba(28, 28, 30, .72);
        --jdl-shadow: none;
        --jdl-on-label: #000;
        --jdl-on-label-filter: brightness(0);
    }
    /* Neutral colours the site sets itself, tagged by the JS layer (toneTree).
       :where() keeps the specificity at zero, so every rule in this script
       that sets a colour still wins over these. */
    :where([data-jdl-fg="1"]) { color: var(--jdl-label) !important; }
    :where([data-jdl-fg="2"]) { color: var(--jdl-label2) !important; }
    :where([data-jdl-bg="1"]) { background-color: var(--jdl-card) !important; }
    :where([data-jdl-bg="2"]) { background-color: var(--jdl-fill) !important; }
    :where([data-jdl-bd]) { border-color: var(--jdl-separator) !important; }
}

/* ---------- Shared frame: footer, side rails, login nag, floating layers ---------- */
#footer-2024, #J_footer, #jdccm-elevator, .jdmcc_elevator, #elevator_from_common_component,
#guide-login-bar-2025, #qyg-ai-shop-around-root, #J_promotional-top,
#jdmccProductImgWrap, [id^="jdmccBag"],
.continuous-panel, .continuous-toggle, #treasure, #hotwords, #hotword,
.jd_pc_search_bar_react_ai_search_wrap, .jd_pc_search_bar_react_image_search_wrap {
    display: none !important;
}

/* AI features: the 京言 assistant, AI search, AI summaries and compare
   bubbles. The JS layer hides the ones that only have hashed class names.
   Match jingyan by id only: the home search form carries an "include_jingyan"
   class. */
#jingyanWrapperBox, #jingyanWrapper, .jingyan-trigger, [id*="jingyan"],
#ai-bubble-container, [class*="ai_search"], [class*="aiSearch"], [class*="ai-search"],
[class*="ai-assistant"], [class*="aiAssistant"], [id*="ai-assistant"] {
    display: none !important;
}

html, body {
    background: var(--jdl-bg) !important;
    min-width: 0 !important;
}
body, body input, body button, body textarea, body select {
    font-family: var(--jdl-font) !important;
    -webkit-font-smoothing: antialiased;
}
body { -webkit-tap-highlight-color: transparent; }
/* clip, unlike hidden, does not create a scroll container, so sticky bars keep working. */
html, body { overflow-x: clip !important; overflow-y: visible !important; min-height: 100vh; }

/* Fixed-width containers become fluid with a readable maximum. */
.adaptive-container, #main_search_conter, .header_center, .common-banner, .padding-box,
#shortcut-2024, #shortcut, .jdmcc-topbar-wrapper, #header > .w {
    width: auto !important;
    min-width: 0 !important;
    max-width: 1280px;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box;
}

/* ---------- Top bar: keep sign-in, home, cart, orders, my JD ---------- */
/* The top bar's dropdowns (my JD, cart) open downwards; lift the bar above
   the sticky search header so the header does not cover them. */
#shortcut-2024, #shortcut, .common-banner { position: relative !important; z-index: 1001 !important; }
.jdmcc-topbar {
    background: transparent !important; border-bottom: 0 !important;
    width: auto !important; min-width: 0 !important; font-size: 13px;
}
.jdmcc-topbar-wrapper {
    display: flex !important; justify-content: space-between; align-items: center;
    padding: 0 16px !important;
}
.jdmcc-topbar ul { display: flex !important; align-items: center; float: none !important; margin: 0 !important; }
.jdmcc-topbar li, .jdmcc-topbar ul > div { float: none !important; }
.jdmcc-topbar a, .jdmcc-topbar span { color: var(--jdl-label2) !important; }
/* fore2 is the cart and orders pair; the ids are sign-in, home and my JD. */
.jdmcc-topbar .shortcut_btn:not(#ttbar-login-2024):not(#ttbar-home):not(#ttbar-myjd-2024):not(.fore2),
.jdmcc-topbar .spacer { display: none !important; }

/* ---------- Search field: iOS search bar ---------- */
.jd_pc_search_bar_react_search_main { width: 100% !important; height: auto !important; }
.jd_pc_search_bar_react_search_box {
    display: flex !important; align-items: center; gap: 8px; position: relative;
    width: 100% !important; height: 40px !important; box-sizing: border-box;
    border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
    background: transparent !important; padding: 0 !important;
}
.jd_pc_search_bar_react_search_box::before {
    /* Magnifier glyph, drawn with CSS so no network request is needed. */
    content: ""; position: absolute; left: 12px; top: 50%; width: 11px; height: 11px;
    margin-top: -8px; border: 2px solid var(--jdl-label2); border-radius: 50%;
    pointer-events: none; z-index: 1;
}
.jd_pc_search_bar_react_search_box::after {
    content: ""; position: absolute; left: 24px; top: 50%; width: 2px; height: 6px;
    margin-top: 3px; background: var(--jdl-label2); transform: rotate(-45deg);
    border-radius: 1px; pointer-events: none; z-index: 1;
}
/* The search box can hold a category picker ("商品") before the field; it costs
   width and the field searches products anyway. */
.jd_pc_search_bar_react_search_box > :not(input):not([class*="search_btn_wrap"]):not([class*="dark_text"]) { display: none !important; }
input.jd_pc_search_bar_react_search_input {
    position: static !important; flex: 1 1 auto; width: auto !important; min-width: 0; height: 40px !important; line-height: 40px !important;
    padding: 0 12px 0 36px !important; margin: 0 !important; box-sizing: border-box;
    background: var(--jdl-fill) !important; border: 0 !important; border-radius: 12px !important;
    outline: none !important; font-size: 16px !important; color: var(--jdl-label) !important;
}
.jd_pc_search_bar_react_dark_text_text { display: none !important; }
[class*="search_btn_wrap"] { position: static !important; flex: none; width: auto !important; height: 40px !important; margin: 0 !important; }
button.jd_pc_search_bar_react_search_btn {
    position: static !important; height: 40px !important; width: auto !important;
    padding: 0 18px !important; margin: 0 !important;
    border: 0 !important; border-radius: 999px !important;
    background: var(--jdl-tint) !important; color: #fff !important;
    font-size: 15px !important; font-weight: 600 !important; line-height: 40px !important;
}

/* ---------- Home: logo + search box only, centered ---------- */
html[data-jdl-page="home"] #J_app, html[data-jdl-page="home"] .fs, html[data-jdl-page="home"] #J_enjoyTop,
html[data-jdl-page="home"] #pageTabWrap, html[data-jdl-page="home"] .logo_subtit { display: none !important; }
html[data-jdl-page="home"] #header { height: auto !important; margin-top: 16vh; background: transparent !important; }
html[data-jdl-page="home"] #header > .w {
    display: flex !important; flex-direction: column; align-items: center; gap: 28px;
    height: auto !important; padding: 0 16px;
}
html[data-jdl-page="home"] #header > .w > * {
    position: static !important; float: none !important; margin: 0 !important;
}
/* The logo picture is in logo_extend, which a script fills after load and
   sometimes leaves empty. Until it has an image, the hidden "京东" link text
   in logo_tit is shown as a word mark instead. */
html[data-jdl-page="home"] #logo:has(.logo_extend img) .logo_tit,
html[data-jdl-page="home"] #logo:not(:has(.logo_extend img)) .logo_extend { display: none !important; }
html[data-jdl-page="home"] .logo_tit {
    position: static !important; width: auto !important; height: auto !important; margin: 0 !important;
    background: none !important;
}
html[data-jdl-page="home"] .logo_tit_lk {
    display: block !important; width: auto !important; height: auto !important; background: none !important;
    font-size: 44px !important; line-height: 1.1 !important; font-weight: 800 !important; letter-spacing: .06em;
    color: var(--jdl-tint) !important; text-indent: 0 !important; text-decoration: none !important;
}
html[data-jdl-page="home"] #logo, html[data-jdl-page="home"] .logo_extend {
    position: static !important; width: auto !important; height: auto !important; background: none !important;
}
/* The logo is drawn white for the old red header; tint it JD red for the grey page. */
html[data-jdl-page="home"] .logo_extend img {
    display: block; height: 64px !important; width: auto !important;
    filter: brightness(0) invert(18%) sepia(94%) saturate(4683%) hue-rotate(352deg) brightness(91%) contrast(92%);
}
html[data-jdl-page="home"] #search, html[data-jdl-page="home"] #search .search-m,
html[data-jdl-page="home"] #search .form {
    width: min(680px, 100%) !important; height: auto !important; position: static !important;
    margin: 0 auto !important; padding: 0 !important; border: 0 !important; background: transparent !important;
}

/* ---------- Search results: glass header ---------- */
/* The logo row and search field float over the results like an iOS
   navigation bar: sticky, translucent, blurred. The page wrappers span the
   full width so the bar can too; the results below carry the maximum width. */
#main_search_container_wrap, [class*="_container_"]:has(> #main_search_container_wrap) {
    width: auto !important; min-width: 0 !important; max-width: none !important; margin: 0 !important;
}
/* Its parent is a flex row, where "auto" shrinks the wrapper to its content. */
#main_search_container_wrap { width: 100% !important; flex: 1 1 auto !important; }
html[data-jdl-page="search"] #main_search_container_wrap > .header {
    position: sticky !important; top: 0; z-index: 900; height: auto !important;
    margin: 0 !important; padding: 8px 16px !important;
    background: var(--jdl-glass) !important;
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    border-bottom: .5px solid var(--jdl-separator);
}
/* The site turns header_wrap fixed once the page scrolls, which would leave
   the sticky bar empty; keep it in flow so the bar carries it. */
#header_wrap {
    position: static !important; width: auto !important; height: auto !important;
    background: transparent !important; box-shadow: none !important;
}
/* header_wrap is itself a flex row, so the centre box needs an explicit
   width or it shrinks to the logo. */
#header_wrap .header_center {
    display: flex !important; align-items: center; gap: 16px; height: auto !important;
    flex: 1 1 auto; width: 100% !important; max-width: 1248px;
}
#header_wrap .logo { flex: none; width: auto !important; height: 32px !important; margin: 0 !important; }
#header_wrap .logo a { display: block; width: 116px !important; height: 32px !important; background-size: contain !important; background-position: left center !important; }
#header_wrap .logo img { height: 32px !important; width: auto !important; }
#header_wrap .jd_pc_search_bar_react_search_main { flex: 1 1 auto; max-width: 720px; margin: 0 !important; }

#searchCenter, [class*="_searchContent_"], [class*="_left_to_all_"] {
    width: auto !important; min-width: 0 !important; max-width: 100% !important; margin: 0 !important;
}
/* The results sit on a white rounded sheet; the cards are the surface instead. */
#searchCenter {
    padding: 12px 16px 0 !important; box-sizing: border-box;
    background: transparent !important; border-radius: 0 !important;
}
[class*="_left_to_all_"] { padding: 0 !important; }
#search-condition { width: auto !important; margin: 0 0 12px !important; background: transparent !important; border: 0 !important; }

/* Scope tabs (all / new / shops / enterprise) become a segmented control. */
[class*="_top-bar_"] {
    display: flex !important; align-items: center; justify-content: space-between; gap: 12px;
    width: auto !important; height: auto !important; margin: 0 0 10px !important; background: transparent !important;
}
[class*="_top-bar-left-tab-wrap_"] { min-width: 0; width: auto !important; }
[class*="_top-bar-left-tab_"] {
    display: inline-flex !important; gap: 2px; padding: 2px; height: auto !important;
    background: var(--jdl-fill) !important; border-radius: 10px;
}
[class*="_top-bar-left-tab-item_"] {
    margin: 0 !important; padding: 6px 14px !important; height: auto !important; line-height: 20px !important;
    border-radius: 8px; font-size: 14px !important; font-weight: 500 !important; color: var(--jdl-label) !important;
    white-space: nowrap; background: transparent !important;
}
[class*="_top-bar-left-tab-item_"]::after, [class*="_top-bar-left-tab-item_"]::before,
[class*="_top-bar-left-tab-active-line_"] { display: none !important; }
[class*="_top-bar-left-tab-item_"][class*="_top-bar-left-tab-active_"] {
    background: var(--jdl-segment) !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 .5px rgba(0, 0, 0, .04);
    font-weight: 600 !important;
}
/* Delivery address, grid/list switch and the banner slot beside the tabs. */
[class*="_top-bar-right_"], [class*="_rendWrap_"] { display: none !important; }

/* Sort and filter chips stay; the brand / source-channel row (品牌, 来源渠道),
   the result count, the "more" menu and dividers go. */
[class*="_all-filter-row-wrapper_"], [class*="_all-filter-line_"], [class*="_divider_"],
[class*="_car-home_"], [class*="_box-bar-right_"] { display: none !important; }
/* One row of chips that scrolls sideways instead of wrapping or clipping. */
[class*="_box-bar_"], [class*="_box-bar-left_"] {
    display: flex !important; align-items: center; gap: 6px; flex-wrap: nowrap !important;
    width: auto !important; height: auto !important; min-width: 0; max-width: 100%;
    background: transparent !important; border: 0 !important; padding: 0 !important;
}
[class*="_box-bar-left_"] { overflow-x: auto; scrollbar-width: none; padding: 1px !important; }
[class*="_box-bar-left_"]::-webkit-scrollbar { display: none; }
[class*="_sort-bar_"], [class*="_sort-bar-area_"], [class*="_box-bar-middle_"] {
    background: transparent !important;
    display: flex !important; align-items: center; gap: 6px; flex-wrap: nowrap !important;
    flex: none !important; width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important;
}
/* Every sort control and filter chip is the same 30px capsule. The site wraps
   them in boxes of different fixed sizes (a 216px dropdown trigger, a 32px
   select inside each chip); those collapse to their content. */
[class*="_sort-bar-area_"] > *, [class*="_price-range_"], [class*="_trigger-item_"], [class*="_trigger-item_"] > *,
[class*="_box-bar-middle_"] [class*="_filter-select_"] {
    width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; background: transparent !important; box-shadow: none !important; line-height: inherit !important;
}
[class*="_trigger-wrap_"], [class*="_sort-tag-button_"], [class*="_box-bar-middle_"] > .box-bar-item {
    display: inline-flex !important; align-items: center; justify-content: center; gap: 4px; flex: none !important;
    width: auto !important; min-width: 0 !important; height: 30px !important; margin: 0 !important;
    padding: 0 12px !important; line-height: 30px !important;
    border: 0 !important; border-radius: 999px !important;
    background: var(--jdl-card) !important; color: var(--jdl-label) !important;
    box-shadow: 0 0 0 .5px var(--jdl-separator) !important;
    font-size: 13px !important; font-weight: 400 !important;
    box-sizing: border-box; white-space: nowrap;
}
[class*="_trigger-wrap_"] *, [class*="_sort-tag-button_"] *, [class*="_box-bar-middle_"] > .box-bar-item * {
    border: 0 !important; background-color: transparent !important;
    font-size: inherit !important; line-height: inherit !important; height: auto !important;
}
[class*="_trigger-wrap_"] img, [class*="_sort-tag-button_"] img, .box-bar-item img { max-height: 14px; width: auto; }
/* Chips that are only a programme logo (国家补贴, 超级补贴, sale banners) are
   tagged by the JS layer; the rest share one text style. */
[class*="_box-bar-middle_"] > .box-bar-item * { color: inherit !important; font-weight: inherit !important; }
/* The active sort and every selected filter chip become a filled capsule, the
   same treatment as the selected scope tab, instead of JD's red text. */
[class*="_sort-tag-button__active_"], [class*="_trigger-wrap_"][class*="active"],
[class*="_box-bar-middle_"] > .box-bar-item:has([class*="__active_"], [class*="-active_"]) {
    background: var(--jdl-label) !important; color: var(--jdl-on-label) !important; box-shadow: none !important;
}
[class*="_sort-tag-button__active_"] *, [class*="_trigger-wrap_"][class*="active"] *,
[class*="_box-bar-middle_"] > .box-bar-item:has([class*="__active_"], [class*="-active_"]) * { color: var(--jdl-on-label) !important; }
[class*="_sort-tag-button__active_"] img, [class*="_trigger-wrap_"][class*="active"] img,
[class*="_box-bar-middle_"] > .box-bar-item:has([class*="__active_"], [class*="-active_"]) img { filter: var(--jdl-on-label-filter); }
/* Empty checkbox items carry only an icon badge (a sale logo), not a filter word. */
[class*="_box-bar-middle_"] > .box-bar-item:empty { display: none !important; }

/* Responsive grid instead of the fixed six-per-row flex wrap. */
/* The grid's parent is a flex row; a column keeps the ad bar above the grid. */
[class*="_goodsContainer-box_"], [class*="_wrapper_"]:has(> [class*="_goodsContainer-box_"]) {
    width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important;
}
[class*="_goodsContainer-box_"] { display: flex !important; flex-direction: column !important; align-items: stretch !important; }
.plugin_goodsContainer {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 14px; width: auto !important; margin: 0 !important; padding: 0 !important;
}
/* Spacers and non-card inserts span the full row instead of taking a cell. */
.plugin_goodsContainer > :not(.plugin_goodsCardWrapper) { grid-column: 1 / -1; }
.plugin_goodsContainer > :not(.plugin_goodsCardWrapper):empty { display: none !important; }
.plugin_goodsCardWrapper {
    width: auto !important; max-width: none !important; height: auto !important;
    margin: 0 !important; padding: 0 !important; min-width: 0; float: none !important;
}
/* On hover the site draws a white panel (::before) 49px taller than the card
   to hold the buttons this script hides; the card's own lift effect replaces it. */
.plugin_goodsCardWrapper::before, .plugin_goodsCardWrapper::after { display: none !important; }
.plugin_goodsCardWrapper > [class*="_card_"] {
    display: flex !important; flex-direction: column; position: relative;
    width: auto !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
    background: var(--jdl-card) !important; border-radius: var(--jdl-radius) !important;
    overflow: hidden; box-shadow: var(--jdl-shadow) !important; border: 0 !important;
    cursor: pointer; transition: transform .25s cubic-bezier(.2, .8, .2, 1), box-shadow .25s;
}
@media (hover: hover) {
    .plugin_goodsCardWrapper > [class*="_card_"]:hover {
        transform: translateY(-2px); box-shadow: 0 2px 4px rgba(0, 0, 0, .04), 0 12px 28px rgba(0, 0, 0, .08) !important;
    }
}
.plugin_goodsCardWrapper > [class*="_card_"]:active { transform: scale(.97); }
/* The picture box is a strip of colour variants; show one square photo. */
.plugin_goodsCardWrapper [class*="_bannerPicBox_"] {
    width: 100% !important; height: auto !important; aspect-ratio: 1 / 1; overflow: hidden;
    margin: 0 !important; border-radius: 0 !important; background: var(--jdl-bg);
}
.plugin_goodsCardWrapper [class*="_bannerPicBox_"] > *,
.plugin_goodsCardWrapper [class*="_bannerPicBox_"] [class*="_wrapper_"] {
    width: 100% !important; height: 100% !important;
}
.plugin_goodsCardWrapper [class*="_bannerPicBox_"] img {
    width: 100% !important; height: 100% !important; object-fit: cover;
}
/* Keep image, title, price, sales and shop; drop badges, sliders and hover menus. */
.plugin_goodsCardWrapper [class*="_activity_"], .plugin_goodsCardWrapper [class*="_btns_new_"],
.plugin_goodsCardWrapper [class*="_tags_"], .plugin_goodsCardWrapper #operation,
.plugin_goodsCardWrapper [class*="_operation_"], .plugin_goodsCardWrapper [class*="_customer_service_icon_"],
.plugin_goodsCardWrapper [class*="_link_icon_"], .plugin_goodsCardWrapper [class*="_subsidy_"],
.plugin_goodsCardWrapper [class*="_ad_"], .plugin_goodsCardWrapper [class*="_addCart_"] { display: none !important; }

.plugin_goodsCardWrapper [class*="_info_w_"], .plugin_goodsCardWrapper [class*="_info_"] {
    display: flex !important; flex-direction: column; flex: 1 1 auto;
    width: auto !important; height: auto !important; padding: 0 !important; margin: 0 !important;
}
.plugin_goodsCardWrapper [class*="_goods_title_container_"] {
    width: auto !important; height: auto !important; margin: 0 !important; padding: 10px 12px 0 !important;
    font-size: 14px !important; line-height: 19px !important; font-weight: 400 !important;
    color: var(--jdl-label) !important; letter-spacing: -.01em;
    display: -webkit-box !important; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    white-space: normal !important;
}
.plugin_goodsCardWrapper [class*="_goods_title_container_"] * {
    color: inherit !important; font-size: inherit !important; font-weight: inherit !important; line-height: inherit !important;
}
.plugin_goodsCardWrapper [class*="_goods_title_container_"] [class*="_tag_"] { display: inline !important; vertical-align: -2px; margin-right: 4px; }
.plugin_goodsCardWrapper [class*="_goods_title_container_"] [class*="_tag_"] * { display: inline !important; }

/* Price row: the list price and add-to-cart button sit beside the deal price. */
.plugin_goodsCardWrapper [class*="_container_"]:has(> [class*="_price_"]) {
    display: flex !important; flex-wrap: wrap; align-items: baseline; column-gap: 6px; row-gap: 2px;
    width: auto !important; height: auto !important; padding: 6px 12px 0 !important; margin: 0 !important;
    position: relative;
}
.plugin_goodsCardWrapper [class^="_price_"], .plugin_goodsCardWrapper [class*=" _price_"] {
    color: var(--jdl-price) !important; font-size: 20px !important; font-weight: 600 !important;
    letter-spacing: -.02em; line-height: 24px !important;
}
.plugin_goodsCardWrapper [class*="_price_"] * { color: inherit !important; }
.plugin_goodsCardWrapper [class*="_yen_"], .plugin_goodsCardWrapper [class*="_decimal_"] {
    font-size: 13px !important; font-weight: 600 !important; font-style: normal;
}
.plugin_goodsCardWrapper [class*="_gray_"] { font-size: 12px !important; color: var(--jdl-label2) !important; }
.plugin_goodsCardWrapper [class*="_goods_volume_container_"] {
    padding: 4px 12px 0 !important; margin: 0 !important; height: auto !important;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 12px !important; color: var(--jdl-label2) !important; line-height: 16px !important;
}
.plugin_goodsCardWrapper [class*="_goods_volume_container_"] * {
    font-size: inherit !important; color: inherit !important; margin-left: 0 !important; padding-left: 0 !important;
}
.plugin_goodsCardWrapper [class*="_info_"] > [class*="_newStyle_"]:has([class*="_name_"]) {
    margin-top: auto !important; padding: 4px 12px 12px !important; height: auto !important;
    background: transparent !important; border: 0 !important; display: block !important;
}
.plugin_goodsCardWrapper [class*="_name_"] {
    display: block !important; min-width: 0; max-width: 100%;
    font-size: 12px !important; color: var(--jdl-label2) !important;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.plugin_goodsCardWrapper [class*="_name_"] * { font-size: inherit !important; color: inherit !important; }

/* The coupon strip above the grid ("¥54 无门槛…后失效"), and the "商品精选
   广告" block and "猜你喜欢" feed under the pager. The last two are
   taller than the heading sweep's size guard allows, so they are hidden by id.
   Their wrappers stay: the results' infinite scroll may watch them. */
#youlikeCenter, #advertisingCenter, [class*="_couponFilterContainer_"],
[class*="_bottomCenter_"]:has(> #youlikeCenter), [class*="_bottomCenter_"]:has(> #advertisingCenter) { display: none !important; }

/* Sponsored cards, tagged by the JS layer. */
html body [data-jdl-ad][data-jdl-ad][data-jdl-ad] { display: none !important; }

/* Pager: capsule buttons. */
[class*="_pagiContainer_"] { width: auto !important; margin: 28px 0 !important; }
[class*="_pagiContainer_"] > * { display: flex !important; flex-wrap: wrap; justify-content: center; gap: 6px; }
[class*="_pagination_"]:not([class*="_pagination_item_"]):not([class*="_pagination_previous_"]):not([class*="_pagination_next_"]) { width: auto !important; }
[class*="_pagination_item_"], [class*="_pagination_previous_"], [class*="_pagination_next_"] {
    margin: 0 !important; border: 0 !important; border-radius: 999px !important;
    background: var(--jdl-card) !important; color: var(--jdl-label) !important;
    box-shadow: 0 0 0 .5px var(--jdl-separator) !important;
    min-width: 36px; height: 36px !important; line-height: 36px !important; padding: 0 12px !important;
    box-sizing: border-box; text-align: center;
}
[class*="_pagination_item_"][class*="_active_"] { background: var(--jdl-label) !important; color: var(--jdl-on-label) !important; box-shadow: none !important; }
[class*="_pagination_toPageNum_"] input {
    width: 48px !important; height: 36px !important; margin: 0 6px !important; padding: 0 8px !important;
    border: 0 !important; border-radius: 10px !important; background: var(--jdl-fill) !important;
    text-align: center; font-size: 14px !important; box-sizing: border-box;
}

/* ---------- Item page ---------- */
html[data-jdl-page="item"] .padding-box { padding: 0 16px !important; box-sizing: border-box; }
html[data-jdl-page="item"] .page-container { padding-top: 4px; }
/* Activity banner, enterprise and credit offers, ranking badge, compare and AI bubbles. */
.page-right-banber, .page-right-lachine, .page-right-ranking, .page-right-whitebar,
.page-right-serviceOption, .page-right-GovInquiry, .page-end, .exposure-container,
[class*="_actionGroup_"], .stage .btns, .looked-agian-ske { display: none !important; }
.crumb { color: var(--jdl-label2) !important; font-size: 12px; }

/* Shop strip and its search field sit on one row above the product. */
#searchBar-root { display: flex !important; align-items: center; gap: 16px; height: auto !important; margin: 4px 0 12px; }
#searchBar-root > * { min-width: 0; }
#searchBar-root [class*="_search_main_"] { flex: 0 1 420px; height: auto !important; }
#searchBar-root [class*="_search_wrapper_"] { height: auto !important; }
/* The shop and site search buttons sit over the field; lay them out in a row. */
#searchBar-root [class*="_search_box_"] {
    display: flex !important; align-items: center; gap: 6px; height: auto !important;
    border: 0 !important; background: transparent !important; box-shadow: none !important;
}
#searchBar-root [class*="_search_box_"] > * { position: static !important; flex: none; }
#searchBar-root input[class*="_search_input_"] {
    flex: 1 1 auto !important; min-width: 0; width: auto !important; height: 36px !important;
    padding: 0 12px !important; box-sizing: border-box;
    background: var(--jdl-fill) !important; border: 0 !important; border-radius: 12px !important; font-size: 15px !important;
}
#searchBar-root [class*="_search_box_"] button { width: auto !important; height: 36px !important; padding: 0 14px !important; margin: 0 !important; }
#searchBar-root [class*="_search_wrapper_"], #searchBar-root [class*="_search_wrapper_"] > * { border: 0 !important; box-shadow: none !important; }
#searchBar-root button, #searchBar-root [class*="_search_wrapper_"] [class*="btn"] {
    border: 0 !important; border-radius: 999px !important;
}
.shop-plugin button, .mini-shop button { border-radius: 999px !important; }

.page-content-main { display: flex !important; align-items: flex-start; gap: 16px; }
.page-content-left, .page-content-right {
    background: var(--jdl-card) !important; border-radius: 24px; box-shadow: var(--jdl-shadow);
    padding: 16px !important; box-sizing: border-box; min-width: 0;
}
.page-content-left { flex: 1 1 auto; width: auto !important; }
.page-content-right { flex: 0 0 440px; width: auto !important; min-width: 0 !important; top: 12px !important; }
.page-content-bar { display: none !important; }
/* Gallery: rounded photo and thumbnails. */
[class*="_gallery_"] .stage img, [class*="_gallery_"] .main-img img { border-radius: 16px; }
[class*="_gallery_"] .image-carousel .item, [class*="_gallery_"] .image-carousel .item img { border-radius: 10px !important; }
/* Detail tabs under the gallery: a segmented control, sticky like before. */
.left-tabs-nav {
    background: var(--jdl-glass) !important;
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    border-radius: 12px; overflow-x: auto; scrollbar-width: none;
}
.left-tabs-nav .left-radius, .left-tabs-nav .right-radius, .left-tabs-nav .tab-spacer, .left-tabs-nav .pk { display: none !important; }
.left-tabs-nav .item { border-radius: 8px; white-space: nowrap; padding: 8px 14px !important; }
.left-tabs-nav .item.active { background: var(--jdl-fill) !important; color: var(--jdl-label) !important; font-weight: 600; }

/* Purchase panel: title, price, delivery, SKU, quantity, buttons. */
.page-right-wrap, #page-right-information, .product-tab-panel, .page-right-content {
    background: transparent !important; border: 0 !important; box-shadow: none !important;
}
.page-right-skuname, .page-right-skuname * {
    font-size: 20px !important; line-height: 26px !important; font-weight: 600 !important;
    color: var(--jdl-label) !important; letter-spacing: -.02em;
}
.page-right-skuname img { height: 18px !important; width: auto !important; vertical-align: -2px; }
/* The title box has a fixed two-line height sized for the site's smaller font. */
.page-right-skuname, .page-right-skuname .sku-title, .page-right-skuname .sku-title-text { height: auto !important; max-height: none !important; }
.page-right-skuname .sku-title-text {
    display: -webkit-box !important; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden !important;
}
/* The tag icons (自营, 门店有售) float left of the name, which breaks the
   line clamp; set them inline at the start of the first line instead. */
.page-right-skuname .sku-title-icon-box {
    float: none !important; display: inline-flex !important; align-items: center; gap: 3px;
    height: auto !important; margin: 0 6px 0 0 !important; vertical-align: 3px;
}
/* The 收藏 (save) button shares the title box; keep it a small icon label. */
.page-right-skuname .sku-title { display: flex !important; align-items: flex-start; gap: 12px; }
.page-right-skuname .sku-title-text { flex: 1 1 auto; min-width: 0; }
.page-right-skuname .follow-btn, .page-right-skuname .follow-btn * {
    font-size: 12px !important; line-height: 16px !important; font-weight: 400 !important;
    color: var(--jdl-label2) !important; letter-spacing: 0;
}
.page-right-skuname .follow-btn {
    flex: none; display: flex !important; flex-direction: column; align-items: center; gap: 2px;
    width: auto !important; height: auto !important; padding: 2px 0 0 !important; border: 0 !important;
}
/* The site pins the price block and the 官方购买 / 以旧换新 tab bar
   (sticky, top 52px) while the SKU list scrolls under them, which shows the
   list through the gap above and lets the price float over the options.
   Keep both in the normal flow; the buy bar stays pinned at the bottom. */
.page-right-sticky-floor, .page-right-tab { position: static !important; }
.page-right-sticky-floor { background: transparent !important; }
.product-price-panel { background: transparent !important; border: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }
.product-price--main, .product-price--main * { color: var(--jdl-price) !important; }
.product-price--value { font-size: 30px !important; font-weight: 700 !important; letter-spacing: -.02em; }
.product-price--unit { font-size: 17px !important; font-weight: 600 !important; }
.product-price--activity-item { border-radius: 6px !important; }
.page-right-discount { background: transparent !important; }
.layout-label, .specification-group-label { color: var(--jdl-label2) !important; font-size: 13px !important; }
.specification-item-sku, .specification-series-item {
    border: 0 !important; border-radius: 12px !important; background: var(--jdl-fill) !important;
    box-shadow: none !important; color: var(--jdl-label) !important; min-height: 0 !important;
}
.specification-item-sku--selected, .specification-series-item--selected {
    background: var(--jdl-tint-soft) !important; box-shadow: inset 0 0 0 1.5px var(--jdl-tint) !important;
    color: var(--jdl-tint) !important;
}
.specification-item-sku--selected *, .specification-series-item--selected * { color: inherit !important; }
.specification-item-sku-image { border-radius: 8px !important; }

.page-right-suctionbottom {
    background: var(--jdl-glass) !important;
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    border-top: .5px solid var(--jdl-separator) !important; box-shadow: none !important;
    border-radius: 0 0 24px 24px; margin: 0 -16px -16px !important; padding: 12px 16px !important;
}
.page-right-btns { display: flex !important; align-items: center; gap: 12px; }
.page-right-RightBtns { flex: 1 1 auto; min-width: 0; }
.bottom-btns-root { display: flex !important; gap: 8px; width: 100% !important; }
.bottom-btns-root > div {
    flex: 1 1 0; display: flex !important; align-items: center; justify-content: center;
    height: 50px !important; margin: 0 !important; border: 0 !important; border-radius: 999px !important;
    background: var(--jdl-tint) !important; color: #fff !important; box-shadow: none !important;
    font-size: 16px !important; font-weight: 600 !important; cursor: pointer; width: auto !important;
    white-space: nowrap; padding: 0 12px !important; min-width: 0;
}
.bottom-btns-root > div:first-child:not(:only-child) { background: var(--jdl-tint-soft) !important; color: var(--jdl-tint) !important; }
.bottom-btns-root > div * { color: inherit !important; font-size: inherit !important; font-weight: inherit !important; background: transparent !important; }
.pc-component-stepper { border-radius: 999px !important; overflow: hidden; background: var(--jdl-fill) !important; border: 0 !important; }
.pc-component-stepper * { border: 0 !important; background: transparent !important; }

/* ---------- Elements tagged by the JS layer ---------- */
/* Repeated attribute selectors raise specificity above the component rules
   above, which also use !important on display. */
html body [data-jdl-hidden][data-jdl-hidden][data-jdl-hidden] { display: none !important; }

/* ---------- Phone and narrow windows ---------- */
@media (max-width: 900px) {
    /* One top-bar row: home is the only item a phone can spare. */
    .jdmcc-topbar-wrapper { padding: 0 8px !important; }
    .jdmcc-topbar #ttbar-home { display: none !important; }
    .jdmcc-topbar ul { min-width: 0; white-space: nowrap; }
    .jdmcc-topbar .shortcut_btn { padding: 0 5px !important; }
    #ttbar-login-2024 { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }

    /* Search header: the logo costs a row, so only the field and button remain. */
    #header_wrap .logo { display: none !important; }
    #header_wrap .jd_pc_search_bar_react_search_main { max-width: none; }
    html[data-jdl-page="search"] #main_search_container_wrap > .header { padding: 8px 12px !important; }
    button.jd_pc_search_bar_react_search_btn { padding: 0 14px !important; }
    #searchCenter { padding: 10px 12px 0 !important; }

    /* Address, brand row and the result count are not worth the room;
       tabs and chips scroll sideways on one line. */
    [class*="_top-bar-left-tab-wrap_"] { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
    [class*="_top-bar-left-tab-wrap_"]::-webkit-scrollbar { display: none; }

    .plugin_goodsContainer { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .plugin_goodsCardWrapper > [class*="_card_"] { border-radius: 16px !important; }
    .plugin_goodsCardWrapper [class*="_goods_title_container_"] { padding: 8px 10px 0 !important; font-size: 13px !important; line-height: 18px !important; }
    .plugin_goodsCardWrapper [class*="_container_"]:has(> [class*="_price_"]) { padding: 4px 10px 0 !important; }
    .plugin_goodsCardWrapper [class^="_price_"], .plugin_goodsCardWrapper [class*=" _price_"] { font-size: 18px !important; }
    .plugin_goodsCardWrapper [class*="_goods_volume_container_"] { padding: 2px 10px 0 !important; }
    .plugin_goodsCardWrapper [class*="_info_"] > [class*="_newStyle_"]:has([class*="_name_"]) { padding: 4px 10px 10px !important; }
    /* The list price crowds a half-width card. */
    .plugin_goodsCardWrapper [class*="_gray_"] { display: none !important; }

    /* Item page: gallery on top, purchase panel below. */
    html[data-jdl-page="item"] .padding-box { padding: 0 12px !important; }
    #searchBar-root { flex-wrap: wrap; gap: 8px; }
    #searchBar-root > * { width: 100% !important; flex: 1 1 100% !important; }
    /* The shop strip: buttons wrap under the name, and the hover card has no
       hover to open it on a phone. */
    .shop-plugin { flex-wrap: wrap; gap: 8px; height: auto !important; }
    .shop-plugin .top-btns { flex: none !important; width: auto !important; }
    .mini-shop { display: none !important; }
    .page-content-main { flex-direction: column !important; gap: 12px; }
    .page-content-left, .page-content-right {
        width: 100% !important; flex: none !important; border-radius: 20px; padding: 12px !important;
    }
    /* Put the purchase panel right under the gallery, before the long detail
       tabs. The gallery and the tabs share two wrapper levels, so both
       dissolve and their children become items of the column directly. */
    /* The desktop gutter between gallery and panel is a left margin on the panel. */
    .page-content-right { position: static !important; order: -1; margin: 0 !important; }
    /* The panel is a fixed-height scroll box on desktop. In the phone column
       it scrolled on its own inside the page; let it grow and scroll with
       the page instead. */
    .page-right-wrap, .page-right-information {
        height: auto !important; max-height: none !important; overflow: visible !important;
    }
    .page-content-left, .page-content-left > * { display: contents !important; }
    [class*="_gallery_"], .left-tabs-container {
        background: var(--jdl-card); border-radius: 20px; padding: 12px; box-sizing: border-box;
        box-shadow: var(--jdl-shadow); min-width: 0 !important;
    }
    [class*="_gallery_"] { order: -2; }
    .left-tabs-container { order: 0; }
    /* The site sizes the gallery with height 0 plus padding-bottom 74%, a
       desktop aspect box; with height auto that padding is empty space. */
    [class*="_gallery_"] {
        width: 100% !important; height: auto !important; display: block !important; padding: 12px !important;
    }
    [class*="_gallery_"] .image-carousel { display: none !important; }
    /* On desktop the photo is absolutely placed beside the thumbnail column. */
    [class*="_gallery_"] .stage, [class*="_gallery_"] .centre, [class*="_gallery_"] .image-area,
    [class*="_gallery_"] .main-img {
        position: relative !important; left: 0 !important; top: 0 !important;
        width: 100% !important; height: auto !important; min-width: 0 !important; margin: 0 !important;
    }
    [class*="_gallery_"] .stage img, [class*="_gallery_"] .main-img img { width: 100% !important; height: auto !important; }
    [class*="_gallery_"] .attribute { display: none !important; }
    .left-tabs-container, .left-tabs-content, .left-tabs-item {
        width: 100% !important; min-width: 0 !important; box-sizing: border-box !important;
    }
    .left-tabs-item { padding-left: 4px !important; padding-right: 4px !important; }
    /* The description is laid out at a fixed 750px for desktop. */
    .left-tabs-content div { max-width: 100% !important; }
    .left-tabs-content img { max-width: 100% !important; height: auto !important; }
    .page-right-skuname, .page-right-skuname * { font-size: 17px !important; line-height: 23px !important; }
    /* Long titles and the delivery row would otherwise run past the screen edge. */
    .page-content-right { overflow-wrap: anywhere; }
    .page-content-right * { min-width: 0; max-width: 100%; }

    /* Pin the buy buttons to the bottom edge as a glass bar. */
    .page-right-suctionbottom {
        position: fixed !important; left: 0; right: 0; bottom: 0 !important; z-index: 1000;
        margin: 0 !important; border-radius: 0;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom)) !important; box-sizing: border-box;
    }
    html[data-jdl-page="item"] body { padding-bottom: 84px; }
}
`;

    // Some desktop pages ship no viewport tag, so a phone would lay them out at
    // desktop width and the media query above would never fire. Set our own,
    // replacing whatever is there.
    const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
    const ensureViewport = () => {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            (document.head || document.documentElement).appendChild(meta);
        }
        if (meta.content !== VIEWPORT) meta.content = VIEWPORT;
    };

    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    };

    const apply = () => {
        ensureViewport();
        injectStyle();
        document.documentElement.dataset.jdlPage = pageType();
    };

    apply();

    // The pages rewrite <head> during hydration; put the style back if it is dropped.
    const watchHead = () => {
        if (!document.head) return false;
        new MutationObserver(() => {
            if (!document.getElementById(STYLE_ID)) apply();
        }).observe(document.head, { childList: true });
        return true;
    };
    // At document-start <head> may not exist yet; wait for it once.
    if (!watchHead()) {
        const wait = new MutationObserver(() => {
            if (watchHead()) wait.disconnect();
        });
        wait.observe(document.documentElement, { childList: true });
    }

    // ---------------------------------------------------------------------
    // JS layer. CSS alone cannot recognise popups, recommendation blocks or
    // sponsored results, because JD hashes many class names and renders the
    // page after load. These helpers look at text, position and structure.
    // ---------------------------------------------------------------------

    const HIDE_ATTR = 'data-jdl-hidden';
    const AD_ATTR = 'data-jdl-ad';

    // Tracking parameters carry no page state; stripping them keeps URLs short,
    // shareable and free of click attribution.
    const TRACK_PARAMS = [
        'spm', 'spmTag', 'pvid', 'bbtf', 'extension_id', 'ptag', '_fd', 'cu', 'abt', 'jd_pop',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_user',
    ];

    // Headings that introduce recommendation or promotion blocks.
    const PROMO_HEADING = /^(?:猜你喜欢|为你推荐|为您推荐|相似(?:宝贝|商品)|看了又看|店铺推荐|热销推荐|搭配推荐|大家都在(?:看|买|搜)|你可能还喜欢|达人选购|店长推荐|排行榜|人气单品|下载.{0,6}(?:App|APP|客户端)|扫码.{0,8}(?:手机|京东))$/;
    // Floating layers that must stay: login, captcha and slide verification.
    // The risk layers must stay visible: hiding one leaves a blank page.
    const KEEP_OVERLAY = /登录|注册|验证|滑块|安全|异常|login|passport|captcha|toast|risk/i;
    // Form controls and labels that mark the part of a page people came for.
    const CONTROLS = 'input, textarea, select, form';
    const REAL_CONTENT = /立即购买|加入购物车|去结算|提交订单|合计|全选/;
    // AI entry points and hints, matched by their visible label because most
    // carry hashed class names. Kept short so ordinary text never matches.
    const AI_LABEL = /^(?:京言(?:AI)?|AI(?:搜索|搜|助手|问答|总结|对比|导购|帮我选|一键比价)?|问AI|AI帮你.{0,6}|.{0,10}AI.{0,4}(?:对比|总结).{0,24}|商品对比)$/;

    // A function declaration, not a const, so apply() can call it before this point.
    function pageType() {
        const { hostname: h, pathname: p } = location;
        if (h === 'item.jd.com') return 'item';
        if (h === 'search.jd.com') return 'search';
        if (/^(?:www\.)?jd\.com$/.test(h) && (p === '/' || p === '/index.html')) return 'home';
        return 'other';
    }

    const cleanUrl = (raw) => {
        let u;
        try { u = new URL(raw, location.href); } catch { return null; }
        let changed = false;
        for (const k of TRACK_PARAMS) {
            if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
        }
        return changed ? u.toString() : null;
    };

    const hide = (el) => {
        if (el && el.nodeType === 1) el.setAttribute(HIDE_ATTR, '');
    };

    // Strip tracking from the current address without adding a history entry.
    const cleanLocation = () => {
        const next = cleanUrl(location.href);
        if (next && next !== location.href) {
            try { history.replaceState(history.state, '', next); } catch { /* cross-origin frames */ }
        }
    };

    // Rewrite item links so opened tabs also get clean URLs.
    const cleanLinks = (root) => {
        for (const a of root.querySelectorAll('a[href*="item.jd.com"]')) {
            const next = cleanUrl(a.getAttribute('href'));
            if (next) a.setAttribute('href', next);
        }
    };

    // Hide fixed-position layers that are not part of sign-in or verification:
    // coupon pop-ups, red-envelope animations, floating tool rails, QR cards.
    const sweepOverlays = (nodes) => {
        for (const el of nodes) {
            if (!el.isConnected || el.hasAttribute(HIDE_ATTR) || el.id === STYLE_ID) continue;
            if (el.closest('.jdmcc-topbar')) continue;
            if (KEEP_OVERLAY.test(el.id + ' ' + el.className) || el.querySelector('iframe, input, [type="password"]')) continue;
            if (getComputedStyle(el).position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            // Never remove anything that carries purchase controls.
            if (REAL_CONTENT.test(el.textContent)) continue;
            if (KEEP_OVERLAY.test(el.textContent.slice(0, 200))) continue;
            hide(el);
        }
    };

    // Recommendation and promotion modules announce themselves with a short
    // heading. Hide the block that heading belongs to, but never one that holds
    // purchase controls or the main search form.
    const sweepPromoBlocks = (root) => {
        const main = document.querySelector('.left-tabs-content, #searchCenter, #J_app') || document.body;
        const heads = root.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p');
        for (const h of heads) {
            if (h.children.length > 1 || h.hasAttribute(HIDE_ATTR)) continue;
            const t = h.textContent.trim();
            if (t.length < 2 || t.length > 16 || !PROMO_HEADING.test(t)) continue;
            // The detail tab bar has a "推荐" entry; tab labels are not headings.
            // Result cards are left to sweepResultGrid, which owns the ad toggle.
            if (h.closest('.left-tabs-nav, .jdmcc-topbar, #search-condition, .plugin_goodsContainer')) continue;
            // Walk up to the module root: the largest ancestor that is still a
            // block of its own rather than the whole page column.
            let block = h;
            while (block.parentElement && block.parentElement !== main && block.parentElement !== document.body) {
                const parent = block.parentElement;
                // A parent that adds a form control or a purchase label holds real
                // page content too (the SKU panel, the result grid); stop below it.
                if (parent.children.length > 6) break;
                if (parent.querySelectorAll(CONTROLS).length > block.querySelectorAll(CONTROLS).length) break;
                if (REAL_CONTENT.test(parent.textContent) && !REAL_CONTENT.test(block.textContent)) break;
                if (parent.matches('.plugin_goodsContainer, .page-content-main, .page-content-right')) break;
                block = parent;
            }
            if (block === main || block === document.body) continue;
            if (block.querySelector(CONTROLS) && REAL_CONTENT.test(block.textContent)) continue;
            // Never hide something that covers most of the page.
            if (block.offsetHeight > window.innerHeight * 1.5 && block.offsetWidth > window.innerWidth * 0.9) continue;
            hide(block);
        }
    };

    // The "推荐" detail tab only scrolls to the recommendation feed, which is
    // hidden, so the tab itself goes too.
    const sweepItemPage = () => {
        for (const tab of document.querySelectorAll('.left-tabs-nav .item')) {
            if (tab.textContent.trim() === '推荐') hide(tab);
        }
    };

    // Hide every AI entry point: find a short element whose whole text is an
    // AI label, then climb to the smallest box that is a control of its own
    // (a button, link, chip or bubble) without swallowing the field or the
    // purchase panel around it.
    const sweepAi = (root) => {
        for (const el of root.querySelectorAll('div, span, a, button, p, li')) {
            if (el.children.length > 3 || el.hasAttribute(HIDE_ATTR)) continue;
            const t = el.textContent.replace(/\s+/g, '');
            if (!t || t.length > 40 || !AI_LABEL.test(t)) continue;
            let box = el;
            for (let i = 0; i < 4 && box.parentElement; i++) {
                const parent = box.parentElement;
                if (parent.querySelector(CONTROLS) || REAL_CONTENT.test(parent.textContent)) break;
                if (parent.textContent.replace(/\s+/g, '').length > t.length + 12) break;
                box = parent;
            }
            hide(box);
        }
    };

    // Sponsored cards carry a "广告" label inside the picture box. Its class is a
    // hashed CSS-module name, so the text is what identifies it.
    const isSponsored = (card) =>
        [...card.querySelectorAll('[class*="_ad_"]')].some((el) => el.textContent.trim() === '广告');

    const sweepResultGrid = () => {
        if (pageType() !== 'search') return;
        const grid = document.querySelector('.plugin_goodsContainer');
        if (!grid) return;
        for (const card of grid.querySelectorAll(':scope > .plugin_goodsCardWrapper')) {
            card.toggleAttribute(AD_ATTR, isSponsored(card));
        }
        // Filter chips that carry only a logo image are promotions, not filters.
        for (const chip of document.querySelectorAll('[class*="_box-bar-middle_"] > .box-bar-item')) {
            if (!chip.textContent.trim()) hide(chip);
        }
        // Scope tabs for business buyers are not shopping scopes for most people.
        for (const tab of document.querySelectorAll('[class*="_top-bar-left-tab-item_"]')) {
            if (/^(?:企业采购|工业品)$/.test(tab.textContent.trim())) hide(tab);
        }
    };

    // Dark mode. The CSS recolours what this script styles, but the rest of
    // the page keeps the site's fixed colours: dark grey text, white panels
    // and light grey borders, which are unreadable or glaring on black. CSS
    // cannot select an element by its colour, so in dark mode each element's
    // computed colours are read once and the neutral ones are tagged; the
    // dark CSS block maps the tags to the palette. Coloured text and fills
    // (prices, red labels) have a high chroma and keep their colour.
    const DARK = matchMedia('(prefers-color-scheme: dark)');
    const NEUTRAL_CHROMA = 48;
    // Elements already checked. The late full sweeps reset it, so elements
    // read before the site's style sheets finished loading are read again.
    let toned = new WeakSet();
    const parseRgb = (value) => {
        const m = value.match(/[\d.]+/g);
        if (!m || m.length < 3) return null;
        const [r, g, b, a = 1] = m.map(Number);
        return { l: (0.299 * r + 0.587 * g + 0.114 * b) / 255, chroma: Math.max(r, g, b) - Math.min(r, g, b), a };
    };
    const isNeutral = (c) => c && c.a > 0.5 && c.chroma < NEUTRAL_CHROMA;
    const toneElement = (el) => {
        if (toned.has(el)) return;
        toned.add(el);
        if (el instanceof SVGElement || /^(?:IMG|VIDEO|CANVAS|SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) return;
        const cs = getComputedStyle(el);
        const fg = parseRgb(cs.color);
        if (isNeutral(fg) && fg.l < 0.5) el.setAttribute('data-jdl-fg', fg.l < 0.3 ? '1' : '2');
        const bg = parseRgb(cs.backgroundColor);
        // Pure white becomes the card colour; light greys become the fill.
        if (isNeutral(bg) && bg.l > 0.85) el.setAttribute('data-jdl-bg', bg.l > 0.97 ? '1' : '2');
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
            const bd = parseRgb(cs[`border${side}Color`]);
            if (parseFloat(cs[`border${side}Width`]) > 0 && isNeutral(bd) && bd.l > 0.7) {
                el.setAttribute('data-jdl-bd', '');
                break;
            }
        }
    };
    const toneTree = (root) => {
        if (!DARK.matches || !root || root.nodeType !== 1) return;
        toneElement(root);
        for (const el of root.querySelectorAll('*')) toneElement(el);
    };
    // Switching the system to dark while a page is open tags it then.
    DARK.addEventListener('change', () => toneTree(document.body));

    // On the home page the search box is the only thing left, so start there.
    const focusSearch = () => {
        if (pageType() !== 'home') return;
        const input = document.querySelector('#search input[type="text"], #search input:not([type])');
        if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    };

    const sweep = (nodes) => {
        const roots = nodes && nodes.length ? nodes : [document.body];
        for (const root of roots) {
            if (!root.isConnected) continue;
            cleanLinks(root);
            sweepPromoBlocks(root);
            sweepAi(root);
            toneTree(root);
        }
        // Overlays are direct children of the page shell; checking only those
        // keeps getComputedStyle calls cheap on large result pages.
        sweepOverlays([...document.body.children, ...(document.querySelector('.page')?.children || [])]);
        if (pageType() === 'item') sweepItemPage();
        sweepResultGrid();
    };

    // Added nodes are batched and swept once per animation frame burst.
    let queue = new Set();
    let scheduled = false;
    const flush = () => {
        scheduled = false;
        const nodes = [...queue].filter((n) => n.isConnected);
        queue = new Set();
        if (nodes.length) sweep(nodes.length > 40 ? null : nodes);
    };
    const enqueue = (node) => {
        queue.add(node);
        if (!scheduled) {
            scheduled = true;
            setTimeout(() => requestAnimationFrame(flush), 150);
        }
    };

    const startJs = () => {
        document.documentElement.dataset.jdlPage = pageType();
        cleanLocation();
        sweep();
        focusSearch();
        new MutationObserver((records) => {
            for (const rec of records) {
                for (const n of rec.addedNodes) {
                    if (n.nodeType === 1) enqueue(n);
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
        // Rendering finishes in stages; sweep again for late modules, and read
        // the dark-mode colours again now that the style sheets have loaded.
        for (const ms of [1200, 3500]) setTimeout(() => { toned = new WeakSet(); sweep(); }, ms);
        // Search paging and sorting change the URL without a reload.
        let last = location.href;
        setInterval(() => {
            if (location.href === last) return;
            last = location.href;
            document.documentElement.dataset.jdlPage = pageType();
            cleanLocation();
            sweep();
        }, 800);
    };

    if (document.body) startJs();
    else document.addEventListener('DOMContentLoaded', startJs, { once: true });
})();
