// ==UserScript==
// @name         Taobao & Tmall Lite
// @namespace    https://github.com/hxueh
// @version      0.2.1
// @description  Strips Taobao and Tmall desktop pages down to search, product images, price, SKU and buy buttons, removes popups, ads and recommendations with CSS and JS, and stays usable at phone width.
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
/* clip, unlike hidden, does not create a scroll container, so sticky bars keep working. */
html, body { overflow-x: clip; }

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
#J_SiteNavBdR > li:not(#J_SiteNavHome):not(#J_SiteNavBought):not(#J_SiteNavMytaobao):not(#J_MiniCart):not(.mini-cart),
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
/* "Suggested search" cards are not products. Sponsored cards stay: on a typical
   results page they are most of the grid, and hiding them leaves a handful of items. */
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
[class*="keyInfo--"] { gap: 24px; padding-top: 16px; box-sizing: border-box; }
[class*="leftWrap--"][class*="mRcLbO7l"], [class*="rightWrap--"][class*="YeyCQ2XA"] { min-width: 0; }
[class*="mainPicWrap--"] img, [class*="picGallery--"] img { max-width: 100%; height: auto; }

/* ---------- Cart ---------- */
.trade-root-header-container [class*="search"], [class*="bg--"][class*="UIcuThJD"] { display: none !important; }
#tbpc-trade-cart { overflow-x: auto; }

/* ---------- Elements tagged by the JS layer ---------- */
[data-tbl-hidden] { display: none !important; }

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

    /* Pin the buy buttons (tagged by the JS layer) to the bottom edge. */
    [data-tbl-buybar] {
        position: fixed !important; left: 0; right: 0; bottom: 0; z-index: 1000;
        padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); background: #fff;
        box-shadow: 0 -1px 8px rgba(0, 0, 0, .12); box-sizing: border-box;
    }
    html[data-tbl-page="item"] body { padding-bottom: 76px; }
}
`;

    // Desktop pages either ship no viewport tag or a fixed one ("width=1200"), so a
    // phone would lay them out at desktop width and the media queries above would
    // never fire. Set our own, replacing whatever is there.
    const VIEWPORT = 'width=device-width, initial-scale=1';
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
    // JS layer. CSS alone cannot recognise popups, recommendation blocks or
    // the buy bar, because the sites hash their class names and rebuild the
    // DOM after load. These helpers look at text, position and structure.
    // ---------------------------------------------------------------------

    const HIDE_ATTR = 'data-tbl-hidden';
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
    // Floating layers that must stay: login, captcha and slide verification.
    const KEEP_OVERLAY = /登录|注册|验证|滑块|安全|baxia|nc_|J_Member|login/i;
    // Form controls and labels that mark the part of a page people came for.
    const CONTROLS = 'input, textarea, select, form';
    const REAL_CONTENT = /立即购买|加入购物车|结算|提交订单|合计|全选/;
    const AD_HOST = /click\.simba\.taobao\.com|simba\.taobao\.com|tanx\.com|alimama\.com/i;

    const pageType = () => {
        const { hostname: h, pathname: p } = location;
        if (/item\.htm|detail/.test(p) || /^(?:item|detail)\./.test(h)) return 'item';
        if (/cart/.test(h) || /cart/.test(p)) return 'cart';
        if (/^s\.taobao|^list\.tmall|\/search/.test(h + p)) return 'search';
        if (/^(?:www\.)?(?:taobao|tmall)\.(?:com|hk)$/.test(h) && (p === '/' || p === '/index.htm')) return 'home';
        return 'other';
    };

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
    const sweepResultGrid = () => {
        if (pageType() !== 'search') return;
        const grid = document.querySelector('#content_wrapper > [class*="tbpc-row"]');
        if (!grid) return;
        for (const col of grid.children) {
            if (col.hasAttribute(HIDE_ATTR)) continue;
            if (NON_PRODUCT_CARD.test(col.textContent) && !col.querySelector('a[href*="item"], a[href*="detail"], a[href*="click.simba"]')) hide(col);
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
                for (const n of rec.addedNodes) if (n.nodeType === 1) enqueue(n);
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
