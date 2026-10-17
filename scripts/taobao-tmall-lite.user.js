// ==UserScript==
// @name         Taobao & Tmall Lite
// @namespace    https://github.com/hxueh
// @version      0.1.0
// @description  Strips Taobao and Tmall desktop pages down to search, product images, price, SKU and buy buttons, and makes them responsive down to phone width.
// @author       hxueh
// @license      MIT
// @homepageURL  https://github.com/hxueh
// @supportURL   https://github.com/hxueh
// @match        https://*.taobao.com/*
// @match        https://*.tmall.com/*
// @match        https://*.tmall.hk/*
// @exclude      https://m.taobao.com/*
// @exclude      https://*.m.taobao.com/*
// @exclude      https://m.tmall.com/*
// @exclude      https://*.m.tmall.com/*
// @exclude      https://login.taobao.com/*
// @exclude      https://login.tmall.com/*
// @exclude      https://*.alipay.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const STYLE_ID = 'tbl-style';

    // Class names on these sites carry a hashed suffix ("title--ASSt27UY") that
    // changes between releases, so every rule below matches the stable prefix
    // with [class*="name--"] and only uses plain ids for the shared frame.
    const CSS = `
/* ---------- Shared frame: footer, toolkit, popups, AI panel ---------- */
#J_SiteFooter, #tbpc-tbnav-footer-slot,
#tbpc-tbnav-toolkit-slot, #tb-toolkit-new, #J_Toolkit,
#tbpc-pop-slot, #J_TBPC_POP_home, #ariaTipText,
[class*="panelInner--"], [class*="splitPanel--"], [class*="panelErrorRoot--"],
[class*="newGuide--"],
[class*="Recommend"], [class*="recommend"], [class*="guessYouLike"],
.tb-pick-feeds-container, .seo, .screen-outer, .tbh-superbanner,
[class*="tips-carousel"], [class*="smallTabListWrapper"],
[class*="fixChecker"], [class*="scrollBy400"] {
    display: none !important;
}

html, body {
    background: #fff !important;
    min-width: 0 !important;
}
html, body { overflow-x: hidden; }

/* Fixed-width page containers become fluid with a readable maximum. */
.tbpc-layout, [class*="contentWrapAdapt--"], [class*="innerWrap--"][class*="headerBox"],
#headerBoxWrapperDom {
    width: auto !important;
    min-width: 0 !important;
    max-width: 1280px;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box;
}
.tbpc-layout { padding-left: 16px !important; padding-right: 16px !important; }

/* ---------- Top nav: keep login, home, orders, my Taobao, cart ---------- */
#J_SiteNav { background: #fff !important; border-bottom: 1px solid #eee; }
#J_SiteNavBdL > li:not(#J_SiteNavLogin),
#J_SiteNavBdR > li:not(#J_SiteNavHome):not(#J_SiteNavBought):not(#J_SiteNavMytaobao):not(#J_SiteNavMiniCart):not(.mini-cart),
#J_SiteNavRegionList, #J_SiteNavMobile, #J_SiteNavEnterprise, #J_SiteNavFavor,
#J_SiteNavOpenShop, #J_SiteNavSeller, #J_SiteNavService {
    display: none !important;
}
#J_SiteNavBd, #J_SiteNav .site-nav-bd {
    display: flex; justify-content: space-between; flex-wrap: wrap;
    width: auto !important; min-width: 0 !important;
}
#J_SiteNavBdL, #J_SiteNavBdR { float: none !important; }

/* ---------- Home: logo + search box only ---------- */
.tbpc-layout > [class*="J_Module"], [class*="cup"][class*="search-fixed"] ~ * { display: none !important; }

/* ---------- Search results ---------- */
/* Hot-model chips and brand/filter rows. The column also carries a
   min-width tied to a breakpoint class, which blocks narrow windows. */
#search-content-leftWrap > [class*="wrap--"] { display: none !important; }
#search-content-leftWrap {
    min-width: 0 !important; width: 100% !important; max-width: 100% !important;
    flex: none !important; padding: 0 !important;
}
.tbpc-layout[class*="headerWrapAdaptMod--"], .tbpc-layout[class*="pageContent--"] {
    margin-left: auto !important; margin-right: auto !important; width: auto !important;
}
[class*="entryBtn--"], .search-suggest-image-search-out-icon { display: none !important; }

/* Each card sits in a .tbpc-col wrapper with a percentage width; reset it so
   the grid decides the width. */
#content_wrapper > [class*="tbpc-row"] > * {
    width: auto !important; max-width: none !important; flex: none !important;
    padding: 0 !important; margin: 0 !important; min-width: 0; display: block;
}
/* Sponsored cards go through click.simba.taobao.com; real results do not.
   The "suggest" and survey cards are not products either. */
#content_wrapper > [class*="tbpc-row"] > *:has(> a[href*="click.simba.taobao.com"]),
#content_wrapper > [class*="tbpc-row"] > *:has([class*="suggestItemCard--"]) { display: none !important; }

/* Responsive grid instead of the fixed 5-column flex row. */
#content_wrapper > [class*="tbpc-row"] {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 16px 12px;
    width: auto !important;
    margin: 0 !important;
}
#content_wrapper a[class*="doubleCardWrapper"] {
    width: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    min-width: 0;
}
[class*="doubleCard--"] { width: 100% !important; height: auto !important; }
[class*="mainPicAndDesc--"] { width: 100% !important; height: auto !important; }
[class*="imageSwitch--"], [class*="mainPicAdaptWrapper--"] {
    width: 100% !important; height: auto !important; aspect-ratio: 1 / 1;
}
[class*="mainImg--"], [class*="mainPic--"] { width: 100% !important; height: 100% !important; object-fit: cover; }
/* Keep image, title, price, shop; drop badges, hover layers and stat lines. */
[class*="hoverWrapper--"], [class*="hoverLayer--"], [class*="mainP4pPic--"],
[class*="pageHoaderWrapper--"], [class*="mask--"], [class*="subIconWrapper--"],
[class*="structuredWrapper--"], [class*="newContainer--"] { display: none !important; }
[class*="descWrapper--"], [class*="title--"] { width: auto !important; }
[class*="pgWrap--"] { margin: 24px 0; }

/* ---------- Item page ---------- */
#apple-header, [class*="headerArea--"] { display: none !important; }
[class*="keyInfo--"] { gap: 24px; }
[class*="leftWrap--"][class*="mRcLbO7l"], [class*="rightWrap--"][class*="YeyCQ2XA"] { min-width: 0; }
[class*="mainPicWrap--"] img, [class*="picGallery--"] img { max-width: 100%; height: auto; }

/* ---------- Cart ---------- */
.trade-root-header-container [class*="search"], [class*="bg--"][class*="UIcuThJD"] { display: none !important; }
#tbpc-trade-cart { overflow-x: auto; }

/* ---------- Phone and narrow windows ---------- */
@media (max-width: 900px) {
    .tbpc-layout { padding-left: 10px !important; padding-right: 10px !important; }

    #J_SiteNavBd { padding: 0 10px; }

    /* Search header: logo above a full-width search box. */
    #headerBoxWrapperDom { display: flex !important; flex-wrap: wrap; padding: 0 !important; height: auto !important; }
    [class*="logoWrapAdapt--"] { width: 100% !important; height: 40px !important; }
    #headerBoxWrapperDom [class*="suggestWarpAdaptMod--"] {
        flex: 1 1 100% !important; width: 100% !important; max-width: 100% !important; margin: 0 !important;
    }
    #headerBoxWrapperDom [class*="searchArea--"], #headerBoxWrapperDom [class*="searchSuggest--"],
    #headerBoxWrapperDom form { width: 100% !important; max-width: 100% !important; }

    /* Page count and view toggle are not worth the room; sort chips scroll sideways. */
    [class*="rightWrapper--"] { display: none !important; }
    [class*="tabWrapAll--"] { height: auto !important; flex-wrap: wrap; }
    [class*="tabWrapOuter--"], [class*="tabWrap--"], [class*="sortBarWrapper--"],
    [class*="sortBarWrapTop--"] { width: auto !important; max-width: 100%; overflow-x: auto; }

    #content_wrapper > [class*="tbpc-row"] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 8px; }

    /* Item page: gallery on top, purchase panel below. */
    [class*="keyInfo--"] { flex-direction: column !important; height: auto !important; }
    [class*="leftWrap--"], [class*="rightWrap--"], [class*="picGallery--"],
    [class*="innerWrap--"], [class*="mainPicWrap--"], [class*="PurchasePanel--"],
    [class*="GeneralSkuPanel--"], [class*="bodyWrap--"] {
        width: 100% !important; max-width: 100% !important; height: auto !important;
    }
    [class*="thumbnailsWrap--"] { display: none !important; }
    [class*="mainPicWrap--"] { margin: 0 !important; }
    /* Long titles and the shipping row would otherwise run past the screen edge. */
    [class*="rightWrap--"] { overflow-wrap: anywhere; }
    [class*="rightWrap--"] * { min-width: 0; }

    /* Keep the buy buttons reachable at the bottom of the screen. */
    [class*="Footer"][class*="buy"], [class*="footWrap--"] { position: sticky; bottom: 0; background: #fff; }
}
`;

    // Desktop pages ship without a viewport tag, so a phone would render them at
    // 980px and the media query above would never fire.
    const ensureViewport = () => {
        if (document.querySelector('meta[name="viewport"]')) return;
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        (document.head || document.documentElement).appendChild(meta);
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
    };

    apply();

    // The sites rewrite <head> during hydration; put the style back if it is dropped.
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
})();
