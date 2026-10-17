// ==UserScript==
// @name         Taobao & Tmall Lite
// @namespace    https://github.com/hxueh
// @version      0.3.0
// @description  Strips Taobao and Tmall desktop pages down to search, product images, price, SKU and buy buttons, removes popups, ads, sponsored results and recommendations, and restyles results and item pages in an iOS look that works at phone and desktop width.
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
// @exclude      https://buy.taobao.com/*
// @exclude      https://buy.tmall.com/*
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
    //
    // The look follows iOS: grouped grey background, white cards with large
    // continuous corners, translucent "glass" bars, capsule controls and the
    // system font. Colours live in custom properties so one block defines them.
    const CSS = `
:root {
    --tbl-bg: #f2f2f7;
    --tbl-card: #fff;
    --tbl-label: #000;
    --tbl-label2: rgba(60, 60, 67, .6);
    --tbl-label3: rgba(60, 60, 67, .3);
    --tbl-fill: rgba(118, 118, 128, .12);
    --tbl-separator: rgba(60, 60, 67, .18);
    --tbl-tint: #ff5000;
    --tbl-price: #ff3b30;
    --tbl-glass: rgba(255, 255, 255, .72);
    --tbl-glass-edge: rgba(255, 255, 255, .6);
    --tbl-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 4px 16px rgba(0, 0, 0, .04);
    --tbl-radius: 20px;
    --tbl-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", system-ui, sans-serif;
}

/* ---------- Shared frame: footer, toolkit, popups, AI panel ---------- */
#J_SiteFooter, #tbpc-tbnav-footer-slot,
#tbpc-tbnav-toolkit-slot, #tb-toolkit-new, #J_Toolkit,
#tbpc-pop-slot, #J_TBPC_POP_home, #J_TBPC_POP_search, #ariaTipText,
#ai-bubble-container, #tbpc-compare-sku-portal-root,
[class*="panelInner--"], [class*="splitPanel--"], [class*="panelErrorRoot--"],
[class*="newGuide--"], [class*="zoneBlock--"],
[class*="Recommend"], [class*="recommend"], [class*="guessYouLike"],
.tb-pick-feeds-container, .seo, .screen-outer, .tbh-superbanner,
[class*="tips-carousel"], [class*="smallTabListWrapper"],
[class*="fixChecker"], [class*="scrollBy400"] {
    display: none !important;
}

html, body {
    background: var(--tbl-bg) !important;
    min-width: 0 !important;
}
body, body input, body button, body textarea, body select {
    font-family: var(--tbl-font) !important;
    -webkit-font-smoothing: antialiased;
}
body { -webkit-tap-highlight-color: transparent; }
/* clip, unlike hidden, does not create a scroll container, so sticky bars keep working.
   overflow-y must stay visible: with the page stripped down, body can be shorter than
   the search suggestion panel, and a scrolling body would cut that panel off. */
html, body { overflow-x: clip !important; overflow-y: visible !important; min-height: 100vh; }

/* Fixed-width page containers become fluid with a readable maximum. */
.tbpc-layout, [class*="contentWrapAdapt--"], [class*="innerWrap--"][class*="headerBox"],
#headerBoxWrapperDom {
    width: auto !important;
    min-width: 0 !important;
    max-width: 1280px;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box;
    background: transparent !important;
}
.tbpc-layout { padding-left: 16px !important; padding-right: 16px !important; }

/* ---------- Top nav: keep login, home, orders, my Taobao, cart ---------- */
/* flow-root contains the floated menu items, which would otherwise spill out
   and push the search header sideways once the row wraps on a phone. */
#J_SiteNav {
    display: flow-root !important;
    background: transparent !important; border-bottom: 0 !important;
    font-size: 13px;
}
#J_SiteNav a, #J_SiteNav span { color: var(--tbl-label2) !important; }
#J_SiteNavBdL > li:not(#J_SiteNavLogin),
#J_SiteNavBdR > li:not(#J_SiteNavHome):not(#J_SiteNavBought):not(#J_SiteNavMytaobao):not(#J_MiniCart):not(.mini-cart),
#J_SiteNavRegionList, #J_SiteNavMobile, #J_SiteNavEnterprise, #J_SiteNavFavor,
#J_SiteNavOpenShop, #J_SiteNavSeller, #J_SiteNavService {
    display: none !important;
}
#J_SiteNavBd, #J_SiteNav .site-nav-bd {
    display: flex !important; justify-content: space-between; align-items: center; flex-wrap: wrap;
    width: auto !important; min-width: 0 !important; max-width: 1280px; margin: 0 auto;
    background: transparent !important;
}
/* Both halves ship with a fixed width and floated items; lay them out as flex rows. */
#J_SiteNavBdL, #J_SiteNavBdR {
    display: flex !important; float: none !important; width: auto !important; margin: 0 !important;
}
#J_SiteNavBd li { float: none !important; flex: none; }
#J_SiteNavBd .site-nav-menu-hd { display: flex !important; align-items: center; white-space: nowrap; }
#J_SiteNavBd .site-nav-menu-hd > a { display: inline-flex !important; align-items: center; height: auto !important; }

/* ---------- Search field: iOS search bar ---------- */
#J_Search, #J_Search form, .search-suggest-combobox {
    border: 0 !important; box-shadow: none !important; background: transparent !important;
}
#J_Search form {
    display: flex !important; align-items: center; gap: 8px;
    height: auto !important; padding: 0 !important; border-radius: 0 !important;
}
#J_Search .search-suggest-combobox {
    order: 1; flex: 1 1 auto; position: relative;
    background: var(--tbl-fill) !important; border-radius: 12px !important;
    height: 40px !important; margin: 0 !important; padding: 0 !important;
}
#J_Search .search-suggest-combobox::before {
    /* Magnifier glyph, drawn with CSS so no network request is needed. */
    content: ""; position: absolute; left: 12px; top: 50%; width: 11px; height: 11px;
    margin-top: -8px; border: 2px solid var(--tbl-label2); border-radius: 50%;
    pointer-events: none;
}
#J_Search .search-suggest-combobox::after {
    content: ""; position: absolute; left: 24px; top: 50%; width: 2px; height: 6px;
    margin-top: 3px; background: var(--tbl-label2); transform: rotate(-45deg);
    border-radius: 1px; pointer-events: none;
}
#J_Search input#q, #J_Search input[name="q"] {
    width: 100% !important; height: 40px !important; line-height: 40px !important;
    padding: 0 12px 0 36px !important; margin: 0 !important; box-sizing: border-box;
    background: transparent !important; border: 0 !important; outline: none !important;
    font-size: 16px !important; color: var(--tbl-label) !important;
}
#J_Search .btn-search, #J_Search button#button {
    order: 2; position: static !important; flex: none;
    height: 40px !important; width: auto !important; padding: 0 18px !important; margin: 0 !important;
    border: 0 !important; border-radius: 999px !important;
    background: var(--tbl-tint) !important; color: #fff !important;
    font-size: 15px !important; font-weight: 600 !important; line-height: 40px !important;
}
.search-suggest-buttons-wrapper, .search-suggest-image-search-out-icon, [class*="entryBtn--"] { display: none !important; }
/* Suggestion dropdown becomes an inset grouped list. */
.search-suggest-popup, .search-suggest-menu {
    border: 0 !important; border-radius: 14px !important; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, .14) !important; margin-top: 6px !important;
}

/* ---------- Home: logo + search box only, centered ---------- */
.tbpc-layout > [class*="J_Module"], [class*="cup"][class*="search-fixed"] ~ * { display: none !important; }
html[data-tbl-page="home"] .tbh-logo-right,
html[data-tbl-page="home"] #J_Search > form + div { display: none !important; }
html[data-tbl-page="home"] .tbpc-layout:has(.top-wrap) { height: auto !important; margin-top: 16vh; }
html[data-tbl-page="home"] [class*="search-decorations"],
html[data-tbl-page="home"] [class*="search-decorations"] .top { height: auto !important; background: transparent !important; }
html[data-tbl-page="home"] .top-wrap {
    display: flex !important; flex-direction: column; align-items: center; gap: 28px;
    height: auto !important; width: auto !important;
}
html[data-tbl-page="home"] .top-wrap > * { float: none !important; margin: 0 !important; }
html[data-tbl-page="home"] .tbh-logo { width: auto !important; height: auto !important; }
html[data-tbl-page="home"] .tbh-search { width: min(680px, 100%) !important; }

/* ---------- Search results: glass header ---------- */
/* The logo row and search field float over the results like an iOS
   navigation bar: sticky, translucent, blurred. */
.tbpc-layout[class*="headerWrapAdaptMod--"] {
    position: sticky !important; top: 0; z-index: 900; clear: both;
    max-width: none !important; padding-top: 8px !important; padding-bottom: 8px !important;
    background: var(--tbl-glass) !important;
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    border-bottom: .5px solid var(--tbl-separator);
}
/* The header row is itself a flex container, so the box would shrink to its
   content without an explicit full width. */
#headerBoxWrapperDom {
    display: flex !important; align-items: center; gap: 16px;
    width: 100% !important; height: auto !important; padding: 0 !important; max-width: 1248px;
}
[class*="logoWrapAdapt--"] { flex: none; width: auto !important; height: 32px !important; margin: 0 !important; }
[class*="logoWrapAdapt--"] img { height: 32px !important; width: auto !important; }
#headerBoxWrapperDom [class*="suggestWarpAdaptMod--"] {
    flex: 1 1 auto !important; width: auto !important; max-width: 720px !important; margin: 0 !important;
}
#headerBoxWrapperDom [class*="searchArea--"], #headerBoxWrapperDom [class*="searchSuggest--"],
#headerBoxWrapperDom #J_Search, #headerBoxWrapperDom #J_Search form {
    width: 100% !important; max-width: 100% !important; margin: 0 !important; height: auto !important;
    flex: 1 1 auto !important; box-sizing: border-box;
}
#headerBoxWrapperDom > [class*="adaptMod--"]:empty { display: none !important; }

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
[class*="pageContent--"] { padding-top: 12px !important; }

/* Scope tabs (all / Tmall / Taobao / shops) become a segmented control. */
[class*="tabWrapAll--"] {
    display: flex !important; align-items: center; justify-content: space-between; gap: 12px;
    height: auto !important; margin: 0 0 10px !important; border: 0 !important;
}
[class*="tabWrapOuter--"] { min-width: 0; }
[class*="tabWrap--"] {
    display: inline-flex !important; gap: 2px; padding: 2px; height: auto !important;
    background: var(--tbl-fill) !important; border-radius: 10px;
}
[class*="tabWrap--"] > [class*="baseStyle--"] {
    margin: 0 !important; padding: 6px 14px !important; height: auto !important; line-height: 20px !important;
    border-radius: 8px; font-size: 14px !important; font-weight: 500; color: var(--tbl-label) !important;
    white-space: nowrap;
}
[class*="tabWrap--"] > [class*="actStyle--"] {
    background: var(--tbl-card); box-shadow: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 .5px rgba(0, 0, 0, .04);
    font-weight: 600 !important;
}
[class*="activeLine--"] { display: none !important; }

/* Sort and filter chips: capsules on one scrolling row. */
[class*="sortBarWrapper--"] { margin: 0 0 12px !important; }
[class*="sortBarWrapTop--"] { background: transparent !important; border: 0 !important; }
/* The sort tabs are Fusion "next-tabs" (li > .next-tabs-tab-inner); the filter
   chips beside them are filterItem-- boxes. Both get the same capsule. */
[class*="sortBarWrapper--"] .next-tabs-tab { background: transparent !important; border: 0 !important; }
[class*="sortBarWrapper--"] .next-tabs-tab-inner,
[class*="sortBarWrapper--"] [class*="filterItem--"],
[class*="sortBarWrapTop--"] [class*="innerWrap--"] > *,
[class*="sortBarWrapper--"] button {
    border: 0 !important; border-radius: 999px !important;
    background: var(--tbl-card) !important; color: var(--tbl-label) !important;
    box-shadow: 0 0 0 .5px var(--tbl-separator) !important;
}
[class*="sortBarWrapper--"] [class*="filterItem--"] * { color: var(--tbl-label) !important; }
[class*="sortBarWrapper--"] .next-tabs-tab.active .next-tabs-tab-inner {
    background: var(--tbl-label) !important; color: #fff !important; box-shadow: none !important;
}
[class*="sortBarWrapper--"] .next-tabs-tab.active .next-tabs-tab-inner * { color: #fff !important; }
[class*="divider--"] { display: none !important; }

/* Each card sits in a .tbpc-col wrapper with a percentage width; reset it so
   the grid decides the width. */
#content_wrapper > [class*="tbpc-row"] > * {
    width: auto !important; max-width: none !important; flex: none !important;
    padding: 0 !important; margin: 0 !important; min-width: 0; display: block;
}
/* "Suggested search" cards are not products. */
#content_wrapper > [class*="tbpc-row"] > *:has([class*="suggestItemCard--"]) { display: none !important; }
/* Sponsored cards, tagged by the JS layer, stay hidden unless the toggle shows them. */
html:not([data-tbl-ads="show"]) [data-tbl-ad] { display: none !important; }

/* Responsive grid instead of the fixed 5-column flex row. */
#content_wrapper > [class*="tbpc-row"] {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 14px;
    width: auto !important;
    margin: 0 !important;
}
#content_wrapper a[class*="doubleCardWrapper"], #content_wrapper > [class*="tbpc-row"] > * > a {
    display: block; height: 100%;
    width: auto !important; margin: 0 !important; padding: 0 !important; min-width: 0;
    background: var(--tbl-card) !important; border-radius: var(--tbl-radius) !important;
    overflow: hidden; box-shadow: var(--tbl-shadow) !important; border: 0 !important;
    text-decoration: none !important;
    transition: transform .25s cubic-bezier(.2, .8, .2, 1), box-shadow .25s;
}
@media (hover: hover) {
    #content_wrapper > [class*="tbpc-row"] > * > a:hover {
        transform: translateY(-2px); box-shadow: 0 2px 4px rgba(0, 0, 0, .04), 0 12px 28px rgba(0, 0, 0, .08) !important;
    }
}
#content_wrapper > [class*="tbpc-row"] > * > a:active { transform: scale(.97); }
[class*="doubleCard--"] {
    width: 100% !important; height: 100% !important; padding: 0 !important; margin: 0 !important;
    background: transparent !important; border: 0 !important; box-shadow: none !important;
    display: flex !important; flex-direction: column;
}
[class*="mainPicAndDesc--"] { width: 100% !important; height: auto !important; padding: 0 !important; }
[class*="imageSwitch--"], [class*="mainPicAdaptWrapper--"] {
    width: 100% !important; height: auto !important; aspect-ratio: 1 / 1;
    margin: 0 !important; border-radius: 0 !important; background: var(--tbl-bg);
}
[class*="mainImg--"], [class*="mainPic--"] {
    width: 100% !important; height: 100% !important; object-fit: cover; border-radius: 0 !important;
}
/* Keep image, title, price, shop; drop badges, hover layers and stat lines. */
[class*="hoverWrapper--"], [class*="hoverLayer--"], [class*="mainP4pPic--"],
[class*="pageHoaderWrapper--"], [class*="mask--"], [class*="subIconWrapper--"],
[class*="structuredWrapper--"], [class*="newContainer--"], [class*="videoIcon--"],
[class*="preSwitchBtn--"], [class*="nextSwitchBtn--"], [class*="iconPic--"],
[class*="wwWrap--"], [class*="shopTagWrapper--"] { display: none !important; }

[class*="descWrapper--"] { width: auto !important; padding: 10px 12px 0 !important; margin: 0 !important; }
[class*="descWrapper--"] [class*="title--"] {
    width: auto !important; height: auto !important; margin: 0 !important;
    font-size: 14px !important; line-height: 19px !important; font-weight: 400 !important;
    color: var(--tbl-label) !important; letter-spacing: -.01em;
    display: -webkit-box !important; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    white-space: normal !important;
}
[class*="descWrapper--"] [class*="title--"] * { color: inherit !important; font-weight: inherit !important; }
[class*="priceWrapper--"] {
    padding: 6px 12px 0 !important; margin: 0 !important; height: auto !important;
    display: block !important;
}
[class*="innerNormalPriceWrapper--"], [class*="priceWrapper--"] > div {
    display: flex !important; flex-wrap: wrap; align-items: baseline; column-gap: 6px; row-gap: 2px;
    height: auto !important;
}
[class*="priceWrapper--"] [class*="unit--"] {
    font-size: 13px !important; font-weight: 600 !important; color: var(--tbl-price) !important; margin-right: -5px;
}
[class*="innerPriceWrapper--"] { display: inline-flex !important; align-items: baseline; color: var(--tbl-price) !important; }
[class*="priceInt--"] { font-size: 20px !important; font-weight: 600 !important; letter-spacing: -.02em; color: var(--tbl-price) !important; }
[class*="priceFloat--"] { font-size: 13px !important; font-weight: 600 !important; color: var(--tbl-price) !important; }
[class*="realSales--"], [class*="procity--"] {
    font-size: 12px !important; color: var(--tbl-label2) !important; margin: 0 !important; line-height: 16px !important;
}
[class*="procity--"] + [class*="procity--"] { margin-left: -4px !important; }
[class*="shopInfo--"] {
    margin-top: auto !important; padding: 6px 12px 12px !important; height: auto !important;
    background: transparent !important; border: 0 !important;
}
[class*="shopName--"] { display: block !important; min-width: 0; }
[class*="shopNameText--"] {
    font-size: 12px !important; color: var(--tbl-label2) !important;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%;
}

/* Ad toggle row inserted by the JS layer above the grid. */
#tbl-adbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin: 0 0 12px; padding: 0 4px; font-size: 13px; color: var(--tbl-label2);
}
#tbl-adbar button {
    border: 0; border-radius: 999px; padding: 5px 12px; cursor: pointer;
    background: var(--tbl-fill); color: var(--tbl-tint); font-size: 13px; font-weight: 600;
}

/* Pager: capsule buttons. */
[class*="pgWrap--"] { margin: 28px 0 !important; }
[class*="pgWrap--"] button, [class*="pgWrap--"] .next-btn, [class*="pgWrap--"] input {
    border: 0 !important; border-radius: 999px !important; background: var(--tbl-card) !important;
    box-shadow: 0 0 0 .5px var(--tbl-separator) !important; min-width: 36px; height: 36px !important;
}
[class*="pgWrap--"] .next-current, [class*="pgWrap--"] button[class*="current"] {
    background: var(--tbl-label) !important; color: #fff !important;
}

/* ---------- Item page ---------- */
#apple-header, [class*="headerArea--"] { display: none !important; }
html[data-tbl-page="item"] .tbpc-layout { padding-top: 12px !important; }
[class*="keyInfo--"] {
    gap: 16px; padding: 0 !important; box-sizing: border-box; align-items: flex-start;
    background: transparent !important;
}
[class*="leftWrap--"][class*="mRcLbO7l"], [class*="rightWrap--"][class*="YeyCQ2XA"] { min-width: 0; }
html[data-tbl-page="item"] #left-content-area, html[data-tbl-page="item"] #right-content-area {
    background: var(--tbl-card) !important; border-radius: 24px; box-shadow: var(--tbl-shadow);
    padding: 16px !important; box-sizing: border-box;
}
html[data-tbl-page="item"] #right-content-area { position: sticky; top: 12px; }
[class*="shopHeader--"] { margin: 0 0 12px !important; padding: 0 !important; border: 0 !important; }
[class*="shopHeader--"] [class*="button--"] {
    border: 0 !important; border-radius: 999px !important; background: var(--tbl-fill) !important;
    color: var(--tbl-label) !important;
}
/* Round the photo itself; clipping the wrapper would cut off the bottom of
   images taller than the box the site reserves for them. */
[class*="mainPicWrap--"] img, [class*="picGallery--"] img { max-width: 100%; height: auto; }
[class*="mainPicWrap--"] img { border-radius: 16px; }
[class*="thumbnailsWrap--"] img, [class*="thumbnailsWrap--"] > * > * { border-radius: 10px !important; }

/* Purchase panel: drop promo strips, keep title, price, SKU, quantity, buttons. */
[class*="PurchasePanel--"], [class*="GeneralSkuPanel--"], [class*="bodyWrap--"],
#tbpcDetail_SkuPanelRightWrap, #tbpcDetail_SkuPanelBody {
    background: transparent !important; border: 0 !important; box-shadow: none !important;
    padding-left: 0 !important; padding-right: 0 !important;
}
[class*="headStrip--"], [class*="mainIcon--"], [class*="promotionBanner"],
[class*="SecondCard--"] [class*="coupon"], [class*="cornerText--"] { display: none !important; }
[class*="MainTitle--"], [class*="mainTitle--"] {
    font-size: 20px !important; line-height: 26px !important; font-weight: 600 !important;
    color: var(--tbl-label) !important; letter-spacing: -.02em;
}
[class*="block2--"], [class*="block2--"] [class*="text--"], [class*="block2--"] [class*="unit--"] { color: var(--tbl-price) !important; }
[class*="block2--"] [class*="text--"] { font-size: 30px !important; font-weight: 700 !important; letter-spacing: -.02em; }
[class*="block2--"] [class*="unit--"] { font-size: 17px !important; font-weight: 600 !important; }
[class*="splitline--"] { background: var(--tbl-separator) !important; height: .5px !important; }
[class*="ItemLabel--"] { color: var(--tbl-label2) !important; font-size: 13px !important; }
[class*="valueItem--"] {
    border: 0 !important; border-radius: 12px !important; background: var(--tbl-fill) !important;
    box-shadow: none !important; color: var(--tbl-label) !important; padding: 8px 12px !important;
    min-height: 0 !important;
}
[class*="valueItem--"][class*="isSelected--"] {
    background: rgba(255, 80, 0, .1) !important; box-shadow: inset 0 0 0 1.5px var(--tbl-tint) !important;
    color: var(--tbl-tint) !important;
}
[class*="valueItem--"] img { border-radius: 8px !important; }
[class*="foot--"][id="tbpcDetail_SkuPanelFoot"] { background: transparent !important; border: 0 !important; box-shadow: none !important; }
[class*="Actions--"] { display: flex !important; align-items: center; gap: 12px; }
[class*="leftButtons--"] { display: flex !important; flex: 1 1 auto; gap: 8px; }
[class*="Actions--"] button[class*="btn--"] {
    flex: 1 1 0; height: 50px !important; margin: 0 !important; border: 0 !important;
    border-radius: 999px !important; font-size: 17px !important; font-weight: 600 !important;
    background: var(--tbl-tint) !important; color: #fff !important; box-shadow: none !important;
}
[class*="Actions--"] button[class*="leftBtn--"] {
    background: rgba(255, 80, 0, .12) !important; color: var(--tbl-tint) !important;
}
[class*="Actions--"] button[class*="btn--"] span { color: inherit !important; }
[class*="RightButton--"] { color: var(--tbl-label2) !important; }

/* ---------- Cart ---------- */
.trade-root-header-container [class*="search"], [class*="bg--"][class*="UIcuThJD"] { display: none !important; }
#tbpc-trade-cart { overflow-x: auto; }

/* ---------- Elements tagged by the JS layer ---------- */
[data-tbl-hidden] { display: none !important; }

/* ---------- Phone and narrow windows ---------- */
@media (max-width: 900px) {
    .tbpc-layout { padding-left: 12px !important; padding-right: 12px !important; }

    /* One nav row: the home link is the only item a phone can spare. */
    #J_SiteNavBd { padding: 0 6px; flex-wrap: nowrap !important; }
    #J_SiteNavHome { display: none !important; }
    #J_SiteNavBdL, #J_SiteNavBdR { min-width: 0; white-space: nowrap; }
    #J_SiteNavBd .site-nav-arrow { display: none !important; }
    #J_SiteNavBd .site-nav-menu-hd { padding: 0 5px !important; }
    #J_SiteNavLogin { min-width: 0; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }

    /* Search header: the logo costs a row, so only the field and button remain. */
    [class*="logoWrapAdapt--"] { display: none !important; }
    #headerBoxWrapperDom [class*="suggestWarpAdaptMod--"] { max-width: none !important; }
    #J_Search .btn-search, #J_Search button#button { padding: 0 14px !important; }

    /* Page count and view toggle are not worth the room; tabs and chips scroll sideways. */
    [class*="rightWrapper--"] { display: none !important; }
    [class*="tabWrapOuter--"], [class*="sortBarWrapper--"], [class*="sortBarWrapTop--"],
    [class*="sortBarWrapInner--"] {
        width: auto !important; max-width: 100%; overflow-x: auto; scrollbar-width: none;
    }
    [class*="tabWrapOuter--"]::-webkit-scrollbar, [class*="sortBarWrapper--"] *::-webkit-scrollbar { display: none; }

    #content_wrapper > [class*="tbpc-row"] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    #content_wrapper > [class*="tbpc-row"] > * > a { border-radius: 16px !important; }
    [class*="descWrapper--"] { padding: 8px 10px 0 !important; }
    [class*="descWrapper--"] [class*="title--"] { font-size: 13px !important; line-height: 18px !important; }
    [class*="priceWrapper--"] { padding: 4px 10px 0 !important; }
    [class*="priceInt--"] { font-size: 18px !important; }
    [class*="shopInfo--"] { padding: 4px 10px 10px !important; }
    /* Location tags crowd a half-width card. */
    [class*="procity--"] { display: none !important; }

    /* Item page: gallery on top, purchase panel below. */
    [class*="keyInfo--"] { flex-direction: column !important; height: auto !important; gap: 12px; }
    [class*="leftWrap--"], [class*="rightWrap--"], [class*="picGallery--"],
    [class*="innerWrap--"], [class*="mainPicWrap--"], [class*="PurchasePanel--"],
    [class*="GeneralSkuPanel--"], [class*="bodyWrap--"] {
        width: 100% !important; max-width: 100% !important; height: auto !important;
    }
    /* The desktop gutter between gallery and panel is a left margin on the panel. */
    html[data-tbl-page="item"] #right-content-area { position: static; margin: 0 !important; }
    html[data-tbl-page="item"] #left-content-area, html[data-tbl-page="item"] #right-content-area {
        border-radius: 20px; padding: 12px !important;
    }
    [class*="thumbnailsWrap--"] { display: none !important; }
    /* The photo box carries a desktop min-width; let the photo scale to the card. */
    [class*="mainPicWrap--"] { margin: 0 !important; min-width: 0 !important; }
    [class*="mainPicWrap--"] img { width: 100% !important; height: auto !important; }
    [class*="MainTitle--"], [class*="mainTitle--"] { font-size: 17px !important; line-height: 23px !important; }
    /* Long titles and the shipping row would otherwise run past the screen edge. */
    [class*="rightWrap--"] { overflow-wrap: anywhere; }
    [class*="rightWrap--"] * { min-width: 0; }
    #tbpcDetail_SkuPanelBody { height: auto !important; max-height: none !important; overflow: visible !important; }

    /* Pin the buy buttons (tagged by the JS layer) to the bottom edge as a glass bar. */
    [data-tbl-buybar] {
        position: fixed !important; left: 0; right: 0; bottom: 0; z-index: 1000;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom)) !important;
        background: var(--tbl-glass) !important;
        -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
        border-top: .5px solid var(--tbl-separator); box-sizing: border-box;
    }
    html[data-tbl-page="item"] body { padding-bottom: 84px; }
}
`;

    // Desktop pages either ship no viewport tag or a fixed one ("width=1200"), so a
    // phone would lay them out at desktop width and the media queries above would
    // never fire. Set our own, replacing whatever is there.
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
        document.documentElement.dataset.tblPage = pageType();
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

    // ---------------------------------------------------------------------
    // JS layer. CSS alone cannot recognise popups, recommendation blocks,
    // sponsored results or the buy bar, because the sites hash their class
    // names and rebuild the DOM after load. These helpers look at text,
    // position, link targets and structure.
    // ---------------------------------------------------------------------

    const HIDE_ATTR = 'data-tbl-hidden';
    const AD_ATTR = 'data-tbl-ad';
    const BUYBAR_ATTR = 'data-tbl-buybar';

    // Tracking parameters carry no page state; stripping them keeps URLs short,
    // shareable and free of click attribution.
    const TRACK_PARAMS = [
        'spm', 'scm', 'pvid', 'utparam', 'ali_trackid', 'clk1', 'bftTag', 'abbucket',
        'acm', 'trackInfo', 'cps', 'union_lens', 'xxc', 'sourceType', 'suid',
        'share_crt_v', 'sp_tk', 'bxsign', 'ut_sk', 'un', 'tkFlag', 'cpp', 'shareurl',
    ];

    // Headings that introduce recommendation or promotion blocks.
    const PROMO_HEADING = /^(?:猜你喜欢|为你推荐|为您推荐|相似(?:宝贝|商品)|看了又看|店铺推荐|热销推荐|搭配推荐|大家都在(?:看|买|搜)|你可能还喜欢|品牌甄选|广告|AD|下载.{0,6}(?:App|APP|客户端)|扫码.{0,8}(?:手机|淘宝|天猫))$/;
    // Sort-bar chips that advertise a sale event rather than filter results.
    const PROMO_CHIP = /双11|双十一|双12|618|开门红|折起|大促|狂欢/;
    // Floating layers that must stay: login, captcha and slide verification.
    const KEEP_OVERLAY = /登录|注册|验证|滑块|安全|baxia|nc_|J_Member|login/i;
    // Form controls and labels that mark the part of a page people came for.
    const CONTROLS = 'input, textarea, select, form';
    const REAL_CONTENT = /立即购买|加入购物车|结算|提交订单|合计|全选/;
    const AD_HOST = /click\.simba\.taobao\.com|simba\.taobao\.com|tanx\.com|alimama\.com/i;

    // A function declaration, not a const, so apply() can call it before this point.
    function pageType() {
        const { hostname: h, pathname: p } = location;
        if (/item\.htm|detail/.test(p) || /^(?:item|detail)\./.test(h)) return 'item';
        if (/cart/.test(h) || /cart/.test(p)) return 'cart';
        if (/^s\.taobao|^list\.tmall|\/search/.test(h + p)) return 'search';
        if (/^(?:www\.)?(?:taobao|tmall)\.(?:com|hk)$/.test(h) && (p === '/' || p === '/index.htm')) return 'home';
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

    // Rewrite item links so opened tabs also get clean URLs; sponsored links are
    // left alone because their redirect target lives in the query string.
    const cleanLinks = (root) => {
        for (const a of root.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href');
            if (!href || AD_HOST.test(href) || !/item\.htm|detail\.tmall|item\.taobao/.test(href)) continue;
            const next = cleanUrl(href);
            if (next) a.setAttribute('href', next);
        }
    };

    // Hide fixed-position layers that are not part of sign-in or verification:
    // coupon pop-ups, open-in-app banners, floating tool rails, QR cards.
    const sweepOverlays = (nodes) => {
        for (const el of nodes) {
            if (!el.isConnected || el.hasAttribute(HIDE_ATTR)) continue;
            if (el.id === 'J_SiteNav' || el.closest('#J_SiteNav')) continue;
            if (KEEP_OVERLAY.test(el.id + ' ' + el.className) || el.querySelector('iframe, input, [type="password"]')) continue;
            const pos = getComputedStyle(el).position;
            if (pos !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            // Never remove the buy bar or anything that carries purchase controls.
            if (/立即购买|加入购物车|结算|提交订单/.test(el.textContent)) continue;
            if (KEEP_OVERLAY.test(el.textContent.slice(0, 200))) continue;
            hide(el);
        }
    };

    // Recommendation and promotion modules announce themselves with a short
    // heading. Hide the block that heading belongs to, but never one that holds
    // purchase controls or the main search form.
    const sweepPromoBlocks = (root) => {
        const main = document.querySelector('#page-content-area, #pageContent, #content_wrapper, main') || document.body;
        const heads = root.querySelectorAll('h1, h2, h3, h4, div, span, p');
        for (const h of heads) {
            if (h.children.length > 1 || h.hasAttribute(HIDE_ATTR)) continue;
            const t = h.textContent.trim();
            if (t.length < 2 || t.length > 16 || !PROMO_HEADING.test(t)) continue;
            // Walk up to the module root: the largest ancestor that is still a
            // block of its own rather than the whole page column.
            let block = h;
            while (block.parentElement && block.parentElement !== main && block.parentElement !== document.body) {
                const parent = block.parentElement;
                // A parent that adds a form control or a purchase/checkout label holds
                // real page content too (the cart list, the SKU panel); stop below it.
                if (parent.children.length > 6) break;
                if (parent.querySelectorAll(CONTROLS).length > block.querySelectorAll(CONTROLS).length) break;
                if (REAL_CONTENT.test(parent.textContent) && !REAL_CONTENT.test(block.textContent)) break;
                block = parent;
            }
            if (block === main || block === document.body) continue;
            if (block.querySelector(CONTROLS) && REAL_CONTENT.test(block.textContent)) continue;
            // Never hide something that covers most of the page.
            if (block.offsetHeight > window.innerHeight * 1.5 && block.offsetWidth > window.innerWidth * 0.9) continue;
            hide(block);
        }
    };

    // Result cards that are not products: the "was this search helpful" survey and
    // similar prompts have no product link and no price.
    const NON_PRODUCT_CARD = /对本次搜索体验满意吗|搜索体验|意见反馈/;
    // Sponsored results link through the simba click tracker (desktop and mobile
    // variants) instead of straight to the item, which is the one marker that
    // survives class-name changes.
    const SPONSORED_LINK = 'a[href*="simba.taobao.com"], a[href*="tanx.com"], a[href*="alimama.com"]';

    // A one-line bar above the grid tells how many sponsored cards are hidden and
    // lets the user show them, because on some queries they are most of the page.
    const updateAdBar = (grid, count) => {
        let bar = document.getElementById('tbl-adbar');
        if (!count) { bar?.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'tbl-adbar';
            bar.innerHTML = '<span></span><button type="button"></button>';
            bar.querySelector('button').addEventListener('click', () => {
                const root = document.documentElement;
                if (root.dataset.tblAds === 'show') delete root.dataset.tblAds;
                else root.dataset.tblAds = 'show';
                updateAdBar(grid, Number(bar.dataset.count));
            });
        }
        // The grid can be re-rendered on pagination; keep the bar right above it.
        if (bar.nextElementSibling !== grid) grid.before(bar);
        const shown = document.documentElement.dataset.tblAds === 'show';
        bar.dataset.count = count;
        bar.querySelector('span').textContent = shown ? `正在显示 ${count} 条推广` : `已隐藏 ${count} 条推广`;
        bar.querySelector('button').textContent = shown ? '隐藏' : '显示';
    };

    const sweepResultGrid = () => {
        if (pageType() !== 'search') return;
        const grid = document.querySelector('#content_wrapper > [class*="tbpc-row"]');
        if (!grid) return;
        let ads = 0;
        for (const col of grid.children) {
            if (col.hasAttribute(HIDE_ATTR)) continue;
            if (NON_PRODUCT_CARD.test(col.textContent) && !col.querySelector('a[href*="item"], a[href*="detail"], a[href*="click.simba"]')) {
                hide(col);
                continue;
            }
            const sponsored = !!col.querySelector(SPONSORED_LINK) || /^广告$/.test(col.querySelector('[class*="p4p"], [class*="P4p"]')?.textContent.trim() || '');
            col.toggleAttribute(AD_ATTR, sponsored);
            if (sponsored) ads++;
        }
        updateAdBar(grid, ads);
        // Sale-event chips in the sort bar.
        for (const chip of document.querySelectorAll('[class*="sortBarWrapper--"] [class*="filterItem--"], [class*="sortBarWrapper--"] .next-tabs-tab')) {
            if (PROMO_CHIP.test(chip.textContent)) hide(chip);
        }
    };

    // Find the container that holds "add to cart" and "buy now" and tag it, so
    // narrow screens can pin it to the bottom edge.
    const tagBuyBar = () => {
        if (document.querySelector(`[${BUYBAR_ATTR}]`)) return;
        const buy = [...document.querySelectorAll('button, div, span, a')]
            .find((e) => e.children.length === 0 && e.textContent.trim() === '立即购买');
        if (!buy) return;
        let box = buy.parentElement;
        for (let i = 0; box && i < 6; i++, box = box.parentElement) {
            if (/加入购物车/.test(box.textContent) && box.textContent.length < 40) {
                box.setAttribute(BUYBAR_ATTR, '');
                return;
            }
        }
    };

    // On the home page the search box is the only thing left, so start there.
    const focusSearch = () => {
        if (pageType() !== 'home') return;
        const input = document.querySelector('#q, input[name="q"], input[type="search"]');
        if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    };

    const sweep = (nodes) => {
        const roots = nodes && nodes.length ? nodes : [document.body];
        for (const root of roots) {
            if (!root.isConnected) continue;
            cleanLinks(root);
            sweepPromoBlocks(root);
        }
        // Overlays are direct children of the page shell; checking only those
        // keeps getComputedStyle calls cheap on large result pages.
        const shell = [...document.body.children, ...(document.querySelector('#tbpc-pop-slot')?.children || [])];
        sweepOverlays(shell);
        if (pageType() === 'item') tagBuyBar();
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
        document.documentElement.dataset.tblPage = pageType();
        cleanLocation();
        sweep();
        focusSearch();
        new MutationObserver((records) => {
            for (const rec of records) {
                for (const n of rec.addedNodes) {
                    // Our own ad bar would otherwise retrigger a sweep on every update.
                    if (n.nodeType === 1 && n.id !== 'tbl-adbar') enqueue(n);
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
        // Hydration finishes in stages; sweep again for late-rendered modules.
        for (const ms of [1200, 3500]) setTimeout(() => sweep(), ms);
        // Single-page navigation changes the page type without a reload.
        let last = location.href;
        setInterval(() => {
            if (location.href === last) return;
            last = location.href;
            document.documentElement.dataset.tblPage = pageType();
            cleanLocation();
            sweep();
        }, 800);
    };

    if (document.body) startJs();
    else document.addEventListener('DOMContentLoaded', startJs, { once: true });
})();
