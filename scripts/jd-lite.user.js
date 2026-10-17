// ==UserScript==
// @name         JD Lite
// @name:zh-CN   京东精简版
// @namespace    https://github.com/hxueh
// @version      0.1.0
// @description  Strips JD desktop pages down to search, product images, price, SKU and buy buttons, blocks tracking scripts and beacons, removes popups, side rails, sponsored results and recommendations, and restyles search and item pages in an iOS look that works at phone and desktop width.
// @description:zh-CN 把京东桌面版精简为搜索、商品图、价格、规格和购买按钮，拦截统计脚本与上报请求，移除弹窗、侧边栏、推广商品和推荐模块，并以 iOS 风格重绘搜索页和商品页，手机和电脑宽度都能正常使用。
// @author       hxueh
// @license      MIT
// @homepageURL  https://github.com/hxueh
// @supportURL   https://github.com/hxueh
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
    // Only pure analytics are blocked. JD's risk-control and login scripts
    // (pc-risk, js_security, gias pc-tk, jra jsTk, gatherInfo, passport, sso)
    // stay, because without them the site shows slider verification or
    // refuses add-to-cart and checkout. cactus.jd.com/request_algo stays too:
    // it serves the algorithm that signs every api.m.jd.com call.
    // ---------------------------------------------------------------------
    const BLOCKED_URL = new RegExp([
        // Page-view and click logging.
        '//wl\\.jd\\.com/', '//mercury\\.jd\\.com/', '//uranus\\.jd\\.com/', '//knicks\\.jd\\.com/',
        '//cactus\\.jd\\.com/behavior_report', '//h5speed\\.m\\.jd\\.com/',
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
html[data-jdl-page="home"] #pageTabWrap, html[data-jdl-page="home"] .logo_subtit,
html[data-jdl-page="home"] .logo_tit { display: none !important; }
html[data-jdl-page="home"] #header { height: auto !important; margin-top: 16vh; background: transparent !important; }
html[data-jdl-page="home"] #header > .w {
    display: flex !important; flex-direction: column; align-items: center; gap: 28px;
    height: auto !important; padding: 0 16px;
}
html[data-jdl-page="home"] #header > .w > * {
    position: static !important; float: none !important; margin: 0 !important;
}
/* The logo picture is in logo_extend; logo_tit only holds hidden link text. */
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
[class*="_top-bar-left-tab-item_"]::after, [class*="_top-bar-left-tab-item_"]::before { display: none !important; }
[class*="_top-bar-left-tab-item_"][class*="_top-bar-left-tab-active_"] {
    background: var(--jdl-card) !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 .5px rgba(0, 0, 0, .04);
    font-weight: 600 !important;
}
/* Grid/list view switch and the ad-like banner slot beside the tabs. */
[class*="_top-bar-right_"] [class*="_switch_"], [class*="_rendWrap_"] { display: none !important; }
[class*="_top-bar-right_"] { color: var(--jdl-label2) !important; font-size: 13px; }

/* Brand row, filter bar and sort chips. */
[class*="_all-filter-row-wrapper_"] {
    width: auto !important; background: var(--jdl-card) !important; border-radius: 14px;
    padding: 4px 12px !important; box-sizing: border-box; margin-bottom: 10px;
}
[class*="_all-filter-line_"], [class*="_divider_"], [class*="_car-home_"] { display: none !important; }
[class*="_box-bar_"] {
    display: flex !important; align-items: center; gap: 8px; width: auto !important; height: auto !important;
    background: transparent !important; border: 0 !important;
}
[class*="_box-bar-left_"] { display: flex !important; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
[class*="_sort-bar_"], [class*="_sort-bar-area_"], [class*="_box-bar-middle_"] {
    display: flex !important; align-items: center; gap: 6px; flex-wrap: wrap; width: auto !important;
}
/* Each sort control, price box and filter checkbox gets the same capsule. The
   sort area wraps its dropdown triggers in fixed-width boxes; those collapse to
   their content and the trigger itself becomes the capsule. */
[class*="_sort-bar-area_"] > *, [class*="_price-range_"], [class*="_trigger-item_"], [class*="_trigger-item_"] > * {
    width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; background: transparent !important;
}
[class*="_trigger-wrap_"], [class*="_sort-tag-button_"], [class*="_box-bar-middle_"] > .box-bar-item {
    display: inline-flex !important; align-items: center; gap: 4px;
    width: auto !important; min-width: 0 !important; margin: 0 !important;
    padding: 5px 12px !important; height: auto !important; line-height: 18px !important;
    border: 0 !important; border-radius: 999px !important;
    background: var(--jdl-card) !important; color: var(--jdl-label) !important;
    box-shadow: 0 0 0 .5px var(--jdl-separator) !important; font-size: 13px !important;
    box-sizing: border-box; white-space: nowrap;
}
[class*="_trigger-wrap_"] *, [class*="_sort-tag-button_"] *, [class*="_box-bar-middle_"] > .box-bar-item * {
    border: 0 !important; background-color: transparent !important;
}
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
.plugin_goodsCardWrapper [class*="_ad_"] { display: none !important; }

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
.plugin_goodsCardWrapper [class*="_addCart_"] {
    position: absolute !important; right: 10px; bottom: -2px; margin: 0 !important;
    width: 28px !important; height: 28px !important; border: 0 !important; border-radius: 50% !important;
    background-color: var(--jdl-tint-soft) !important;
}
.plugin_goodsCardWrapper [class*="_goods_volume_container_"] {
    padding: 4px 12px 0 !important; margin: 0 !important; height: auto !important;
    font-size: 12px !important; color: var(--jdl-label2) !important; line-height: 16px !important;
}
.plugin_goodsCardWrapper [class*="_goods_volume_container_"] * { font-size: inherit !important; color: inherit !important; }
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

/* Sponsored cards, tagged by the JS layer, stay hidden unless the toggle shows them. */
html:not([data-jdl-ads="show"]) [data-jdl-ad] { display: none !important; }

/* Ad toggle row inserted by the JS layer above the grid. */
#jdl-adbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin: 0 0 12px; padding: 0 4px; font-size: 13px; color: var(--jdl-label2);
}
#jdl-adbar button {
    border: 0; border-radius: 999px; padding: 5px 12px; cursor: pointer;
    background: var(--jdl-fill); color: var(--jdl-tint); font-size: 13px; font-weight: 600;
}

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
[class*="_pagination_item_"][class*="_active_"] { background: var(--jdl-label) !important; color: #fff !important; box-shadow: none !important; }

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
[data-jdl-hidden] { display: none !important; }

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
    [class*="_top-bar-right_"], [class*="_all-filter-row-wrapper_"], [class*="_box-bar-right_"] { display: none !important; }
    [class*="_top-bar-left-tab-wrap_"], [class*="_box-bar-left_"], [class*="_box-bar-middle_"] {
        flex-wrap: nowrap !important; max-width: 100%; overflow-x: auto; scrollbar-width: none;
    }
    [class*="_box-bar_"] { display: block !important; }
    [class*="_box-bar-left_"] > *, [class*="_box-bar-middle_"] > * { flex: none !important; }
    [class*="_top-bar-left-tab-wrap_"]::-webkit-scrollbar, [class*="_box-bar-left_"]::-webkit-scrollbar,
    [class*="_box-bar-middle_"]::-webkit-scrollbar { display: none; }

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
    .page-content-left, .page-content-left > * { display: contents !important; }
    [class*="_gallery_"], .left-tabs-container {
        background: var(--jdl-card); border-radius: 20px; padding: 12px; box-sizing: border-box;
        box-shadow: var(--jdl-shadow); min-width: 0 !important;
    }
    [class*="_gallery_"] { order: -2; }
    .left-tabs-container { order: 0; }
    [class*="_gallery_"] { width: 100% !important; height: auto !important; display: block !important; }
    [class*="_gallery_"] .image-carousel { display: none !important; }
    /* On desktop the photo is absolutely placed beside the thumbnail column. */
    [class*="_gallery_"] .stage, [class*="_gallery_"] .centre, [class*="_gallery_"] .image-area,
    [class*="_gallery_"] .main-img {
        position: relative !important; left: 0 !important; top: 0 !important;
        width: 100% !important; height: auto !important; min-width: 0 !important; margin: 0 !important;
    }
    [class*="_gallery_"] .stage img, [class*="_gallery_"] .main-img img { width: 100% !important; height: auto !important; }
    [class*="_gallery_"] .attribute { display: none !important; }
    .left-tabs-container, .left-tabs-content, .left-tabs-item { width: 100% !important; min-width: 0 !important; }
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
    const KEEP_OVERLAY = /登录|注册|验证|滑块|安全|login|passport|captcha|toast/i;
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
        const heads = root.querySelectorAll('h1, h2, h3, h4, div, span, p');
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

    // A one-line bar above the grid tells how many sponsored cards are hidden and
    // lets the user show them, because on some queries they are a third of the page.
    const updateAdBar = (grid, count) => {
        let bar = document.getElementById('jdl-adbar');
        if (!count) { bar?.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'jdl-adbar';
            bar.innerHTML = '<span></span><button type="button"></button>';
            bar.querySelector('button').addEventListener('click', () => {
                const root = document.documentElement;
                if (root.dataset.jdlAds === 'show') delete root.dataset.jdlAds;
                else root.dataset.jdlAds = 'show';
                updateAdBar(grid, Number(bar.dataset.count));
            });
        }
        // The grid can be re-rendered on pagination; keep the bar right above it.
        if (bar.nextElementSibling !== grid) grid.before(bar);
        const shown = document.documentElement.dataset.jdlAds === 'show';
        bar.dataset.count = count;
        bar.querySelector('span').textContent = shown ? `正在显示 ${count} 条推广` : `已隐藏 ${count} 条推广`;
        bar.querySelector('button').textContent = shown ? '隐藏' : '显示';
    };

    const sweepResultGrid = () => {
        if (pageType() !== 'search') return;
        const grid = document.querySelector('.plugin_goodsContainer');
        if (!grid) return;
        let ads = 0;
        for (const card of grid.querySelectorAll(':scope > .plugin_goodsCardWrapper')) {
            const sponsored = isSponsored(card);
            card.toggleAttribute(AD_ATTR, sponsored);
            if (sponsored) ads++;
        }
        updateAdBar(grid, ads);
    };

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
                    // Our own ad bar would otherwise retrigger a sweep on every update.
                    if (n.nodeType === 1 && n.id !== 'jdl-adbar') enqueue(n);
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
        // Rendering finishes in stages; sweep again for late modules.
        for (const ms of [1200, 3500]) setTimeout(() => sweep(), ms);
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
