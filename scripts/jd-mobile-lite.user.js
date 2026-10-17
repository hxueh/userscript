// ==UserScript==
// @name         JD Mobile Lite
// @name:zh-CN   京东移动端精简搜索
// @namespace    https://github.com/hxueh
// @version      0.2.0
// @description  Restyles JD's mobile web for iOS across home, categories, search, product pages, cart, account, shops, rankings, forms, and dialogs in light and dark mode while removing app prompts and overlays.
// @description:zh-CN 为京东移动网页统一加入 iOS 风格，覆盖首页、分类、搜索、商品详情、购物车、账户、店铺、榜单、表单和弹窗，支持深色模式，同时移除 App 跳转提示与干扰遮罩。
// @author       hxueh
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA2NCA2NCc+PHJlY3Qgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyByeD0nMTQnIGZpbGw9JyNlMTI1MWInLz48dGV4dCB4PSczMicgeT0nNDQnIGZvbnQtZmFtaWx5PSdIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZicgZm9udC1zaXplPScyOCcgZm9udC13ZWlnaHQ9JzcwMCcgZmlsbD0nI2ZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+SkQ8L3RleHQ+PC9zdmc+
// @match        https://m.jd.com/*
// @match        https://*.m.jd.com/*
// @match        https://so.m.jd.com/*
// @match        https://item.m.jd.com/*
// @match        https://minicaty-pro.pf.jd.com/*
// @match        https://wqs.jd.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const HOME_PATHS = new Set(['/', '/index.html']);
    const pageParams = new URLSearchParams(location.search);
    const IS_HOME = location.hostname === 'm.jd.com' && HOME_PATHS.has(location.pathname);
    const IS_NATIVE_SEARCH = location.hostname === 'so.m.jd.com';
    const IS_SEARCH_RESULTS = IS_NATIVE_SEARCH && /\/ware\/search\.action\/?$/.test(location.pathname);
    const IS_NATIVE_ITEM = location.hostname === 'item.m.jd.com';
    const IS_ITEM_DETAIL = IS_NATIVE_ITEM && /\/product\/\d+\.html\/?$/.test(location.pathname);

    if (pageParams.get('jdml') === 'off') {
        return;
    }

    const EXPLICIT_APP_PROMO_SELECTOR = [
        'meta[name="apple-itunes-app" i]',
        'meta[name="google-play-app" i]',
        'link[rel="manifest" i]',
        '[class*="downloadApp" i]',
        '[class*="download_app" i]',
        '[class*="download-app" i]',
        '[class*="appDownload" i]',
        '[class*="app_download" i]',
        '[class*="app-download" i]',
        '[class*="openApp" i]',
        '[class*="open_app" i]',
        '[class*="open-app" i]',
        '[class*="appBanner" i]',
        '[class*="app_banner" i]',
        '[class*="app-banner" i]',
        '[class*="appWake" i]',
        '[class*="app_wake" i]',
        '[class*="app-wake" i]',
        '[class*="appGuide" i]',
        '[class*="app_guide" i]',
        '[class*="app-guide" i]',
        '[id*="downloadApp" i]',
        '[id*="openApp" i]',
        '[id*="appBanner" i]'
    ].join(',');

    const APP_TRIGGER_SELECTOR = [
        '[data-openapp]',
        '[data-open-app]',
        '[data-appurl]',
        '[data-app-url]',
        '[data-jdapp]',
        'a[href*="openapp.jdmobile.com" i]',
        'a[href^="openapp.jdmobile:" i]',
        'a[href^="jdmobile:" i]',
        'a[href^="jingdong:" i]',
        'iframe[src*="openapp.jdmobile.com" i]'
    ].join(',');

    const SEARCH_INTERSTITIAL_MASK_SELECTOR = [
        '#id-pcprompt-mask',
        '#pcprompt-mask',
        '[id^="pcprompt"][id*="mask" i]',
        '[class*="pcprompt" i][class*="mask" i]'
    ].join(',');

    const PROMPT_SURFACE_SELECTOR = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[class*="popup" i]',
        '[class*="modal" i]',
        '[class*="overlay" i]',
        '[class*="notice" i]',
        '[class*="notify" i]',
        '[class*="push" i]',
        '[class*="guide" i]',
        '[class*="tip" i]',
        '[style*="position: fixed" i]',
        '[style*="position:fixed" i]',
        '[style*="position: sticky" i]',
        '[style*="position:sticky" i]'
    ].join(',');

    const COMMERCE_GUARD_SELECTOR = [
        'form',
        '[role="search"]',
        '.search_prolist_item',
        '.search_prolist_item_inner',
        '[class*="search_prolist" i]',
        '[class*="search-result" i]',
        '[class*="search_result" i]',
        '[class*="product-card" i]',
        '[class*="product_card" i]',
        '[data-sku]',
        '[data-sku-id]',
        '[data-wareid]',
        '[data-ware-id]'
    ].join(',');

    const PRODUCT_LINK_SELECTOR = [
        'a[href*="item.m.jd.com/product/" i]',
        'a[href*="item.m.jd.com/ware/" i]',
        'a[href*="item.jd.com/" i]'
    ].join(',');

    // JD serves several search front ends with different class naming conventions.
    // These selectors stay scoped to known product structures instead of matching every data-sku node.
    const SEARCH_LIST_SELECTOR = [
        '.search_prolist', '#searchProlist', '#search-prolist',
        '#searchList', '.search_list', '.search-list', '.product_list', '.product-list',
        '[class*="searchProductList"]', '[class*="search-product-list"]',
        '[class*="searchResultList"]', '[class*="search-result-list"]'
    ].join(',');

    const SEARCH_CARD_SELECTOR = [
        '.search_prolist_item', '.search_result_item', '.search-result-item',
        '.product_card', '.product-card',
        '[class*="searchProductItem"]', '[class*="search-product-item"]',
        '[class*="searchResultItem"]', '[class*="search-result-item"]'
    ].join(',');

    // These selectors only identify candidates. Layout checks in styleGenericPage decide whether
    // a candidate is the page chrome, a content card, or a compact row before a class is applied.
    const SITE_HEADER_CANDIDATE_SELECTOR = [
        'header', '[role="banner"]', '#header', '#m_header', '#m_common_header', '#commonHeader', '.m_header',
        '.common_header', '.common-header', '.page_header', '.page-header',
        '.header_bar', '.header-bar', '.top_bar', '.top-bar',
        '[class*="pageHeader"]', '[class*="page-header"]'
    ].join(',');

    const SITE_TABBAR_CANDIDATE_SELECTOR = [
        'nav', '[role="navigation"]', '.tabbar', '.tab_bar', '.tab-bar',
        '.bottom_nav', '.bottom-nav', '.bottom_bar', '.bottom-bar',
        '.common_nav', '.common-nav', '.jd_footer', '.jd-footer',
        '[class*="bottomNav"]', '[class*="bottom-nav"]',
        '[class*="tabBar"]', '[class*="tab-bar"]'
    ].join(',');

    const SITE_CARD_CANDIDATE_SELECTOR = [
        'section', 'article', '[role="region"]', '.card', '.panel', '.module',
        '.mod_block', '.mod-block', '.floor', '.content_box', '.content-box',
        '.account_box', '.account-box', '.order_box', '.order-box',
        '.shop_box', '.shop-box', '[class*="contentCard"]', '[class*="content-card"]'
    ].join(',');

    const SITE_ROW_CANDIDATE_SELECTOR = [
        'li', '[role="listitem"]', '.list_item', '.list-item', '.menu_item', '.menu-item',
        '.cell', '.setting_item', '.setting-item', '.order_item', '.order-item'
    ].join(',');

    const NATIVE_CLEANUP_CSS = `
        html.jdml-native-cleanup :is(
            meta[name="apple-itunes-app" i],
            meta[name="google-play-app" i],
            link[rel="manifest" i],
            #id-pcprompt-mask,
            #pcprompt-mask,
            [id^="pcprompt"][id*="mask" i],
            [class*="pcprompt" i][class*="mask" i],
            [class*="downloadApp" i],
            [class*="download_app" i],
            [class*="download-app" i],
            [class*="appDownload" i],
            [class*="app_download" i],
            [class*="app-download" i],
            [class*="openApp" i],
            [class*="open_app" i],
            [class*="open-app" i],
            [class*="appBanner" i],
            [class*="app_banner" i],
            [class*="app-banner" i],
            [class*="appWake" i],
            [class*="app_wake" i],
            [class*="app-wake" i],
            [class*="appGuide" i],
            [class*="app_guide" i],
            [class*="app-guide" i],
            [id*="downloadApp" i],
            [id*="openApp" i],
            [id*="appBanner" i]
        ) {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;

    const MOBILE_IOS_CSS = `
        html.jdml-native-cleanup {
            color-scheme: light;
            --jdml-mobile-bg: #f2f2f7;
            --jdml-mobile-card: #ffffff;
            --jdml-mobile-media: #f7f7f9;
            --jdml-mobile-text: #1c1c1e;
            --jdml-mobile-secondary: #6e6e73;
            --jdml-mobile-tertiary: #8e8e93;
            --jdml-mobile-fill: #e9e9ee;
            --jdml-mobile-fill-strong: #dedee4;
            --jdml-mobile-separator: rgba(60, 60, 67, 0.13);
            --jdml-mobile-accent: #e1251b;
            --jdml-mobile-accent-soft: rgba(225, 37, 27, 0.10);
            --jdml-mobile-blue: #007aff;
            --jdml-mobile-header: rgba(247, 247, 249, 0.90);
            --jdml-mobile-tabbar: rgba(247, 247, 249, 0.94);
            --jdml-mobile-mask: rgba(0, 0, 0, 0.36);
            background: var(--jdml-mobile-bg) !important;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
        }

        @media (prefers-color-scheme: dark) {
            html.jdml-native-cleanup {
                color-scheme: dark;
                --jdml-mobile-bg: #000000;
                --jdml-mobile-card: #1c1c1e;
                --jdml-mobile-media: #2c2c2e;
                --jdml-mobile-text: #f2f2f7;
                --jdml-mobile-secondary: #aeaeb2;
                --jdml-mobile-tertiary: #8e8e93;
                --jdml-mobile-fill: #2c2c2e;
                --jdml-mobile-fill-strong: #3a3a3c;
                --jdml-mobile-separator: rgba(84, 84, 88, 0.65);
                --jdml-mobile-accent: #ff453a;
                --jdml-mobile-accent-soft: rgba(255, 69, 58, 0.16);
                --jdml-mobile-blue: #0a84ff;
                --jdml-mobile-header: rgba(28, 28, 30, 0.90);
                --jdml-mobile-tabbar: rgba(28, 28, 30, 0.94);
                --jdml-mobile-mask: rgba(0, 0, 0, 0.58);
            }

            /* Neutral colours the site sets itself on parts this script does not
               restyle, tagged by toneTree(). :where() keeps the specificity at zero,
               so every rule in this script that sets a colour still wins. */
            :where([data-jdml-fg="1"]) { color: var(--jdml-mobile-text) !important; }
            :where([data-jdml-fg="2"]) { color: var(--jdml-mobile-secondary) !important; }
            :where([data-jdml-bg="1"]) { background-color: var(--jdml-mobile-card) !important; }
            :where([data-jdml-bg="2"]) { background-color: var(--jdml-mobile-fill) !important; }
            :where([data-jdml-bd]) { border-color: var(--jdml-mobile-separator) !important; }
        }

        html.jdml-native-cleanup,
        html.jdml-native-cleanup body {
            min-height: 100%;
            background: var(--jdml-mobile-bg) !important;
        }

        html.jdml-native-cleanup body {
            margin: 0 !important;
            color: var(--jdml-mobile-text) !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
                         "PingFang SC", "Helvetica Neue", Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
        }

        html.jdml-native-cleanup * {
            box-sizing: border-box;
        }

        html.jdml-native-cleanup :is(a, button, input, select, textarea, [role="button"]) {
            -webkit-tap-highlight-color: transparent;
        }

        html.jdml-native-cleanup :is(button, input, select, textarea) {
            font: inherit;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) body {
            width: min(100%, 760px) !important;
            margin-inline: auto !important;
            padding-bottom: env(safe-area-inset-bottom) !important;
            overflow-x: hidden !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item):has(.jdml-site-tabbar) body {
            padding-bottom: calc(68px + env(safe-area-inset-bottom)) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(
            .jdml-site-main,
            main,
            [role="main"]
        ) {
            width: 100% !important;
            max-width: 760px !important;
            margin-inline: auto !important;
        }

        /* The normalizer tags the actual viewport header instead of styling every class name
           containing "header", which would also catch headings inside product cards. */
        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-header {
            position: sticky !important;
            z-index: 900 !important;
            top: 0 !important;
            right: auto !important;
            left: auto !important;
            width: min(100%, 760px) !important;
            min-height: 44px !important;
            margin: 0 auto !important;
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-mobile-separator) !important;
            padding-top: env(safe-area-inset-top) !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-header) !important;
            box-shadow: none !important;
            transform: none !important;
            -webkit-backdrop-filter: blur(22px) saturate(180%) !important;
            backdrop-filter: blur(22px) saturate(180%) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-header :is(
            a,
            button,
            [role="button"]
        ) {
            min-width: 38px !important;
            min-height: 38px !important;
            border: 0 !important;
            border-radius: 50% !important;
            color: var(--jdml-mobile-blue) !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        /* Shared JD headers often paint an extra white wrapper after the outer header loads.
           Clearing only direct children keeps logos and icons intact while letting the iOS
           material on the tagged viewport header remain visible. */
        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-header > * {
            color: inherit !important;
            background-color: transparent !important;
            background-image: none !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-search {
            border: 0 !important;
            border-radius: 12px !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-fill) !important;
            box-shadow: none !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(
            input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
            select,
            textarea
        ) {
            min-height: 42px !important;
            border: 0 !important;
            border-radius: 12px !important;
            outline: 0 !important;
            padding: 9px 12px !important;
            color: var(--jdml-mobile-text) !important;
            background-color: var(--jdml-mobile-fill) !important;
            box-shadow: none !important;
            -webkit-appearance: none !important;
            appearance: none !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(input, textarea)::placeholder {
            color: var(--jdml-mobile-tertiary) !important;
            opacity: 1 !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(input, select, textarea):focus-visible {
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--jdml-mobile-blue) 22%, transparent) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-card {
            border: 0 !important;
            border-radius: 18px !important;
            color: var(--jdml-mobile-text) !important;
            background-color: var(--jdml-mobile-card) !important;
            background-image: none !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035), 0 8px 24px rgba(0, 0, 0, 0.045) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-section {
            width: auto !important;
            margin: 10px 12px !important;
            padding: 14px !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-row {
            min-height: 44px !important;
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-mobile-separator) !important;
            color: var(--jdml-mobile-text) !important;
            background: transparent !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-row:last-child {
            border-bottom: 0 !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-product-card {
            position: relative !important;
            border: 0 !important;
            border-radius: 16px !important;
            overflow: hidden !important;
            color: var(--jdml-mobile-text) !important;
            background-color: var(--jdml-mobile-card) !important;
            background-image: none !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035), 0 8px 22px rgba(0, 0, 0, 0.045) !important;
            transform: translateZ(0);
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-product-card:active {
            transform: scale(0.992) translateZ(0) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-product-card img {
            border-radius: 12px !important;
            background: var(--jdml-mobile-media) !important;
            object-fit: contain !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-product-card > * {
            color: inherit !important;
            background-color: transparent !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(
            .jdml-site-price,
            .jdml-site-price *
        ) {
            color: var(--jdml-mobile-accent) !important;
            font-variant-numeric: tabular-nums !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-button {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 42px !important;
            border: 0 !important;
            border-radius: 12px !important;
            padding: 8px 16px !important;
            box-shadow: none !important;
            font-weight: 650 !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-button-primary {
            color: #fff !important;
            background: var(--jdml-mobile-accent) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-button-secondary {
            color: var(--jdml-mobile-blue) !important;
            background: color-mix(in srgb, var(--jdml-mobile-blue) 12%, transparent) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-button:active {
            opacity: 0.76 !important;
            transform: scale(0.97) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-chip {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 32px !important;
            border: 0 !important;
            border-radius: 10px !important;
            padding: 6px 11px !important;
            color: var(--jdml-mobile-secondary) !important;
            background: var(--jdml-mobile-fill) !important;
            box-shadow: none !important;
            font-size: 14px !important;
            font-weight: 500 !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-chip:is(
            .active,
            .current,
            .cur,
            [aria-selected="true"]
        ) {
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-card) !important;
            box-shadow: 0 1px 5px rgba(0, 0, 0, 0.10) !important;
            font-weight: 650 !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-sidebar {
            border: 0 !important;
            border-right: 0.5px solid var(--jdml-mobile-separator) !important;
            color: var(--jdml-mobile-secondary) !important;
            background: var(--jdml-mobile-header) !important;
            box-shadow: none !important;
            -webkit-backdrop-filter: blur(18px) saturate(180%) !important;
            backdrop-filter: blur(18px) saturate(180%) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-sidebar :is(
            a,
            button,
            li,
            [role="tab"]
        ) {
            min-height: 44px !important;
            border: 0 !important;
            border-radius: 10px !important;
            color: inherit !important;
            background: transparent !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-sidebar :is(
            .active,
            .current,
            .cur,
            [aria-selected="true"]
        ) {
            color: var(--jdml-mobile-accent) !important;
            background: var(--jdml-mobile-card) !important;
            font-weight: 650 !important;
        }

        /* The existing links stay wired to JD. Only their presentation becomes an iOS tab bar. */
        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-tabbar {
            position: fixed !important;
            z-index: 950 !important;
            right: auto !important;
            bottom: 0 !important;
            left: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-around !important;
            width: min(100%, 760px) !important;
            min-height: 58px !important;
            margin: 0 !important;
            border: 0 !important;
            border-top: 0.5px solid var(--jdml-mobile-separator) !important;
            padding: 6px max(8px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)) !important;
            color: var(--jdml-mobile-secondary) !important;
            background: var(--jdml-mobile-tabbar) !important;
            box-shadow: 0 -5px 22px rgba(0, 0, 0, 0.055) !important;
            transform: translateX(-50%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-tabbar :is(
            a,
            button,
            [role="tab"]
        ) {
            flex: 1 1 0 !important;
            min-width: 44px !important;
            min-height: 44px !important;
            border: 0 !important;
            color: inherit !important;
            background: transparent !important;
            box-shadow: none !important;
            text-align: center !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-tabbar :is(
            .active,
            .current,
            .cur,
            [aria-selected="true"]
        ) {
            color: var(--jdml-mobile-accent) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-sheet {
            z-index: 1200 !important;
            border: 0 !important;
            border-radius: 22px 22px 0 0 !important;
            padding-bottom: env(safe-area-inset-bottom) !important;
            overflow: hidden !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-card) !important;
            box-shadow: 0 -12px 44px rgba(0, 0, 0, 0.18) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-dialog {
            z-index: 1200 !important;
            max-width: min(92vw, 520px) !important;
            border: 0 !important;
            border-radius: 20px !important;
            overflow: hidden !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-card) !important;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-mask {
            background: var(--jdml-mobile-mask) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            backdrop-filter: blur(4px) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-toast {
            border: 0 !important;
            border-radius: 14px !important;
            padding: 10px 14px !important;
            color: var(--jdml-mobile-text) !important;
            background: color-mix(in srgb, var(--jdml-mobile-card) 92%, transparent) !important;
            box-shadow: 0 10px 34px rgba(0, 0, 0, 0.15) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-empty {
            margin: 12px !important;
            border: 0 !important;
            border-radius: 18px !important;
            padding: 28px 18px !important;
            color: var(--jdml-mobile-secondary) !important;
            background: var(--jdml-mobile-card) !important;
            text-align: center !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) .jdml-site-footer {
            border: 0 !important;
            padding: 18px 12px calc(18px + env(safe-area-inset-bottom)) !important;
            color: var(--jdml-mobile-tertiary) !important;
            background: transparent !important;
            text-align: center !important;
        }

        /* JD's Category tab is a separate Taro app. Its stock header reserves a tall campaign
           gradient, so these hooks collapse it into the same compact navigation used elsewhere. */
        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] :is(
            #containerTop,
            .newcate_header,
            .nav_h5,
            .nav_h5_container
        ) {
            position: sticky !important;
            z-index: 920 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: 112px !important;
            margin: 0 !important;
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-mobile-separator) !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-header) !important;
            background-image: none !important;
            transform: none !important;
            -webkit-backdrop-filter: blur(22px) saturate(180%) !important;
            backdrop-filter: blur(22px) saturate(180%) !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .search-bar-wrap {
            min-height: 52px !important;
            padding: 8px 12px !important;
            background: transparent !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .searchBoxStyle {
            width: 100% !important;
            height: 36px !important;
            border: 0 !important;
            border-radius: 12px !important;
            padding: 0 12px !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-fill) !important;
            box-shadow: none !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] :is(.ca_wrap, .ca_container) {
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-bg) !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .cate_root_list {
            border-right: 0.5px solid var(--jdml-mobile-separator) !important;
            color: var(--jdml-mobile-secondary) !important;
            background: var(--jdml-mobile-fill) !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .cate_root_list_item {
            border: 0 !important;
            color: var(--jdml-mobile-secondary) !important;
            background: transparent !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .cate_root_list_item_cur {
            border-radius: 0 12px 12px 0 !important;
            color: var(--jdml-mobile-accent) !important;
            background: var(--jdml-mobile-card) !important;
            font-weight: 650 !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] :is(.ca_title, .ca_content_content_name) {
            color: var(--jdml-mobile-text) !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .ca_content {
            margin: 8px 10px 14px !important;
            border: 0 !important;
            border-radius: 18px !important;
            padding: 12px 8px 0 !important;
            color: var(--jdml-mobile-text) !important;
            background: var(--jdml-mobile-card) !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035), 0 8px 22px rgba(0, 0, 0, 0.045) !important;
        }

        html.jdml-ios-site[data-jdml-host="minicaty-pro.pf.jd.com"] .ca_content_content_img {
            border-radius: 12px !important;
            background: var(--jdml-mobile-media) !important;
            object-fit: contain !important;
        }

        /* Cart and account are separate Taro shells with hard-coded light canvases. Restrict the
           override to their router layers so product images and status artwork keep their colors. */
        html.jdml-ios-site:is(
            [data-jdml-host="p.m.jd.com"],
            [data-jdml-host="my.m.jd.com"]
        ) :is(
            #app,
            [class*="taro_router"],
            [class*="taro_page"],
            [class*="page_container"],
            [class*="page-container"]
        ) {
            color: var(--jdml-mobile-text) !important;
            background-color: var(--jdml-mobile-bg) !important;
            background-image: none !important;
        }

        html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) :is(
            .jdml-site-loading,
            [aria-busy="true"]
        ) {
            border-radius: 12px !important;
            color: var(--jdml-mobile-secondary) !important;
            background: linear-gradient(90deg, var(--jdml-mobile-fill), var(--jdml-mobile-fill-strong), var(--jdml-mobile-fill)) !important;
            background-size: 220% 100% !important;
            animation: jdml-ios-shimmer 1.35s ease-in-out infinite !important;
        }

        @keyframes jdml-ios-shimmer {
            to { background-position-x: -220%; }
        }

        @media (prefers-reduced-motion: reduce) {
            html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) *,
            html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) *::before,
            html.jdml-native-cleanup:not(.jdml-ios-search):not(.jdml-ios-item) *::after {
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `;

    const SEARCH_IOS_CSS = `
        html.jdml-ios-search {
            color-scheme: light;
            --jdml-ios-bg: #f2f2f7;
            --jdml-ios-card: #ffffff;
            --jdml-ios-text: #1c1c1e;
            --jdml-ios-secondary: #6e6e73;
            --jdml-ios-tertiary: #8e8e93;
            --jdml-ios-fill: #e9e9ee;
            --jdml-ios-separator: rgba(60, 60, 67, 0.12);
            --jdml-ios-accent: #e1251b;
            --jdml-ios-blue: #007aff;
            --jdml-ios-header: rgba(247, 247, 249, 0.88);
            --jdml-ios-toolbar: rgba(247, 247, 249, 0.92);
            --jdml-ios-media: #f7f7f9;
            background: var(--jdml-ios-bg) !important;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
        }

        /* Search results use the same iOS semantic colors as item pages. */
        @media (prefers-color-scheme: dark) {
            html.jdml-ios-search {
                color-scheme: dark;
                --jdml-ios-bg: #000000;
                --jdml-ios-card: #1c1c1e;
                --jdml-ios-text: #f2f2f7;
                --jdml-ios-secondary: #aeaeb2;
                --jdml-ios-tertiary: #8e8e93;
                --jdml-ios-fill: #2c2c2e;
                --jdml-ios-separator: rgba(84, 84, 88, 0.65);
                --jdml-ios-accent: #ff453a;
                --jdml-ios-blue: #0a84ff;
                --jdml-ios-header: rgba(28, 28, 30, 0.88);
                --jdml-ios-toolbar: rgba(28, 28, 30, 0.92);
                --jdml-ios-media: #2c2c2e;
            }
        }

        html.jdml-ios-search,
        html.jdml-ios-search body {
            min-height: 100%;
            background: var(--jdml-ios-bg) !important;
        }

        html.jdml-ios-search body {
            margin: 0 !important;
            color: var(--jdml-ios-text) !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
                         "PingFang SC", "Helvetica Neue", Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
        }

        /* JD wraps search results in a legacy white canvas; bring that outer surface into the
           same palette as the cards so dark mode does not become a dark-card-on-white layout. */
        html.jdml-ios-search :is(.wx_wrap, .search_jd) {
            min-height: 100vh !important;
            color: var(--jdml-ios-text) !important;
            background: var(--jdml-ios-bg) !important;
        }

        html.jdml-ios-search * {
            box-sizing: border-box;
        }

        html.jdml-ios-search a,
        html.jdml-ios-search button,
        html.jdml-ios-search input {
            -webkit-tap-highlight-color: transparent;
        }

        /* Frosted iOS-style search header. */
        html.jdml-ios-search :is(
            #search-head,
            #searchHead,
            #searchHeader,
            .search_head,
            .search-head,
            .search_header,
            .search-header,
            .search_head_fixer,
            .search-head-fixer,
            .search_header_fixer,
            .search-header-fixer
        ) {
            border: 0 !important;
            background: var(--jdml-ios-header) !important;
            box-shadow: 0 0.5px 0 var(--jdml-ios-separator) !important;
            -webkit-backdrop-filter: blur(22px) saturate(180%) !important;
            backdrop-filter: blur(22px) saturate(180%) !important;
        }

        html.jdml-ios-search :is(
            #search-head,
            #searchHead,
            #searchHeader,
            .search_head,
            .search-head,
            .search_header,
            .search-header
        ) {
            padding-top: env(safe-area-inset-top) !important;
        }

        html.jdml-ios-search :is(
            #search-head,
            #searchHead,
            #searchHeader,
            .search_head,
            .search-head,
            .search_header,
            .search-header
        ) input:is([type="search"], [name="keyword"]),
        html.jdml-ios-search input#msKeyWord,
        html.jdml-ios-search input#keyword {
            min-height: 36px !important;
            border: 0 !important;
            border-radius: 12px !important;
            outline: 0 !important;
            padding: 7px 12px !important;
            color: var(--jdml-ios-text) !important;
            background: var(--jdml-ios-fill) !important;
            box-shadow: none !important;
            font: 16px/22px -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif !important;
            -webkit-appearance: none !important;
            appearance: none !important;
        }

        html.jdml-ios-search :is(
            #search-head,
            #searchHead,
            #searchHeader,
            .search_head,
            .search-head,
            .search_header,
            .search-header
        ) input::placeholder,
        html.jdml-ios-search input#msKeyWord::placeholder,
        html.jdml-ios-search input#keyword::placeholder {
            color: var(--jdml-ios-tertiary) !important;
            opacity: 1 !important;
        }

        html.jdml-ios-search :is(
            #search-head,
            #searchHead,
            #searchHeader,
            .search_head,
            .search-head,
            .search_header,
            .search-header
        ) form > :is(a, button):first-child {
            display: grid !important;
            place-items: center !important;
            flex: 0 0 36px !important;
            width: 36px !important;
            min-width: 36px !important;
            height: 36px !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 50% !important;
            padding: 0 !important;
            color: var(--jdml-ios-blue) !important;
            background: transparent !important;
            box-shadow: none !important;
            font-size: 26px !important;
            line-height: 1 !important;
        }

        html.jdml-ios-search :is(
            #searchSubmit,
            .search_submit,
            .search-submit,
            .search_cancel,
            .search-cancel
        ) {
            min-width: 42px !important;
            border: 0 !important;
            color: var(--jdml-ios-blue) !important;
            background: transparent !important;
            font-size: 15px !important;
            font-weight: 500 !important;
        }

        /* Native sort/filter row, restyled as a segmented toolbar. */
        html.jdml-ios-search :is(
            .search_tab,
            .search-tab,
            .search_sort,
            .search-sort,
            .search_tab_fix,
            .search-tab-fix
        ) {
            z-index: 40 !important;
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-ios-separator) !important;
            padding: 7px 10px !important;
            background: var(--jdml-ios-toolbar) !important;
            box-shadow: none !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
        }

        html.jdml-ios-search :is(
            #barTabs,
            .pro_filter_items,
            #sortProBlock,
            .pro_filter,
            .pro_filter_wrap
        ) {
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-ios-separator) !important;
            background: var(--jdml-ios-toolbar) !important;
            color: var(--jdml-ios-secondary) !important;
        }

        html.jdml-ios-search :is(
            .search_tab,
            .search-tab,
            .search_sort,
            .search-sort,
            .search_tab_fix,
            .search-tab-fix
        ) :is(a, button, li, span[role="button"]) {
            min-height: 34px !important;
            border-radius: 10px !important;
            color: var(--jdml-ios-secondary) !important;
            font-size: 14px !important;
            font-weight: 500 !important;
        }

        html.jdml-ios-search :is(
            .search_tab,
            .search-tab,
            .search_sort,
            .search-sort,
            .search_tab_fix,
            .search-tab-fix
        ) :is(.cur, .current, .active, [aria-selected="true"]) {
            color: var(--jdml-ios-text) !important;
            background: var(--jdml-ios-card) !important;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08) !important;
            font-weight: 650 !important;
        }

        /* One-column iOS card list. */
        html.jdml-ios-search :is(
            .search_prolist,
            #searchProlist,
            #search-prolist,
            .jdml-ios-product-list
        ) {
            display: flex !important;
            flex-flow: column nowrap !important;
            gap: 12px !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 12px 12px calc(24px + env(safe-area-inset-bottom)) !important;
            background: transparent !important;
        }

        html.jdml-ios-search :is(
            .search_prolist,
            #searchProlist,
            #search-prolist,
            .jdml-ios-product-list
        )::before,
        html.jdml-ios-search :is(
            .search_prolist,
            #searchProlist,
            #search-prolist,
            .jdml-ios-product-list
        )::after {
            display: none !important;
        }

        html.jdml-ios-search .search_prolist_item,
        html.jdml-ios-search .jdml-ios-product-card {
            float: none !important;
            display: block !important;
            position: relative !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 18px !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: var(--jdml-ios-card) !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06) !important;
            transform: translateZ(0);
        }

        html.jdml-ios-search .search_prolist_item:active,
        html.jdml-ios-search .jdml-ios-product-card:active {
            transform: scale(0.992) translateZ(0) !important;
        }

        html.jdml-ios-search .search_prolist_item_inner,
        html.jdml-ios-search .jdml-ios-product-inner,
        html.jdml-ios-search .jdml-ios-product-card > a:first-of-type {
            display: grid !important;
            grid-template-columns: 124px minmax(0, 1fr) !important;
            align-items: start !important;
            gap: 12px !important;
            width: 100% !important;
            min-height: 148px !important;
            height: auto !important;
            margin: 0 !important;
            border: 0 !important;
            padding: 12px !important;
            color: inherit !important;
            background: transparent !important;
            text-decoration: none !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_cover,
            .search_prolist_img,
            .search_prolist_image,
            .search_prolist_item_pic,
            .jdml-ios-product-image
        ) {
            grid-column: 1 !important;
            grid-row: 1 !important;
            position: relative !important;
            width: 124px !important;
            min-width: 124px !important;
            height: 124px !important;
            margin: 0 !important;
            border-radius: 14px !important;
            overflow: hidden !important;
            background: var(--jdml-ios-media) !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_cover,
            .search_prolist_img,
            .search_prolist_image,
            .search_prolist_item_pic,
            .jdml-ios-product-image
        ) img,
        html.jdml-ios-search img.search_prolist_cover_img {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            border-radius: inherit !important;
            object-fit: contain !important;
            background: var(--jdml-ios-media) !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_info,
            .search_prolist_item_info,
            .search_prolist_content,
            .jdml-ios-product-info
        ) {
            grid-column: 2 !important;
            min-width: 0 !important;
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_title,
            .search_prolist_item_title,
            .search_prolist_name,
            .jdml-ios-product-title
        ) {
            display: -webkit-box !important;
            max-height: 62px !important;
            margin: 0 0 8px !important;
            overflow: hidden !important;
            color: var(--jdml-ios-text) !important;
            font-size: 15px !important;
            font-weight: 500 !important;
            line-height: 20px !important;
            letter-spacing: -0.01em !important;
            word-break: break-word !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 3 !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_price,
            .search_prolist_item_price,
            .search_prolist_price_box,
            .jdml-ios-product-price
        ) {
            margin: 3px 0 5px !important;
            color: var(--jdml-ios-accent) !important;
            font-size: 22px !important;
            font-weight: 700 !important;
            line-height: 1.15 !important;
            letter-spacing: -0.025em !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_price,
            .search_prolist_item_price,
            .search_prolist_price_box,
            .jdml-ios-product-price
        ) :is(em, i, span) {
            color: inherit !important;
            font-style: normal !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_comment,
            .search_prolist_item_comment,
            .search_prolist_shop,
            .search_prolist_item_shop,
            .search_prolist_good,
            .search_prolist_service
        ) {
            margin-top: 4px !important;
            color: var(--jdml-ios-secondary) !important;
            font-size: 12px !important;
            line-height: 17px !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_tag,
            .search_prolist_tags,
            .search_prolist_label,
            .search_prolist_labels
        ) :is(span, em, i) {
            display: inline-flex !important;
            align-items: center !important;
            min-height: 20px !important;
            margin: 2px 4px 2px 0 !important;
            border: 0 !important;
            border-radius: 6px !important;
            padding: 1px 6px !important;
            color: var(--jdml-ios-accent) !important;
            background: rgba(225, 37, 27, 0.08) !important;
            font-size: 10px !important;
            font-style: normal !important;
            line-height: 16px !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_item_button,
            .search_prolist_button,
            .search_prolist_cart,
            .search_prolist_buy,
            .jdml-ios-product-action
        ) {
            right: 12px !important;
            bottom: 12px !important;
            border: 0 !important;
            border-radius: 999px !important;
            color: var(--jdml-ios-accent) !important;
            background: rgba(225, 37, 27, 0.09) !important;
            box-shadow: none !important;
        }

        html.jdml-ios-search :is(
            .search_prolist_item_button,
            .search_prolist_button,
            .search_prolist_cart,
            .search_prolist_buy,
            .jdml-ios-product-action
        ):active {
            background: rgba(225, 37, 27, 0.16) !important;
            transform: scale(0.94) !important;
        }

        html.jdml-ios-search :is(.search_loading, .search_empty, .search_no_result, .search_nomore) {
            margin: 12px !important;
            border-radius: 16px !important;
            padding: 24px 16px !important;
            color: var(--jdml-ios-secondary) !important;
            background: var(--jdml-ios-card) !important;
            text-align: center !important;
        }

        @media (max-width: 360px) {
            html.jdml-ios-search .search_prolist_item_inner,
            html.jdml-ios-search .jdml-ios-product-inner,
            html.jdml-ios-search .jdml-ios-product-card > a:first-of-type {
                grid-template-columns: 108px minmax(0, 1fr) !important;
                gap: 10px !important;
                min-height: 132px !important;
                padding: 10px !important;
            }

            html.jdml-ios-search :is(
                .search_prolist_cover,
                .search_prolist_img,
                .search_prolist_image,
                .search_prolist_item_pic,
                .jdml-ios-product-image
            ) {
                width: 108px !important;
                min-width: 108px !important;
                height: 108px !important;
            }
        }

        @media (min-width: 700px) {
            html.jdml-ios-search :is(
                .search_prolist,
                #searchProlist,
                #search-prolist,
                .jdml-ios-product-list
            ) {
                width: min(100%, 760px) !important;
                margin-inline: auto !important;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            html.jdml-ios-search .search_prolist_item,
            html.jdml-ios-search .jdml-ios-product-card,
            html.jdml-ios-search :is(
                .search_prolist_item_button,
                .search_prolist_button,
                .search_prolist_cart,
                .search_prolist_buy,
                .jdml-ios-product-action
            ) {
                transition: none !important;
            }
        }
    `;


    const ITEM_IOS_CSS = `
        html.jdml-ios-item {
            color-scheme: light;
            --jdml-item-bg: #f2f2f7;
            --jdml-item-card: #ffffff;
            --jdml-item-media: #ffffff;
            --jdml-item-text: #1c1c1e;
            --jdml-item-secondary: #6e6e73;
            --jdml-item-tertiary: #8e8e93;
            --jdml-item-fill: #e9e9ee;
            --jdml-item-separator: rgba(60, 60, 67, 0.13);
            --jdml-item-accent: #e1251b;
            --jdml-item-accent-soft: rgba(225, 37, 27, 0.10);
            --jdml-item-blue: #007aff;
            --jdml-item-header: rgba(247, 247, 249, 0.88);
            --jdml-item-tabbar: rgba(247, 247, 249, 0.92);
            --jdml-item-actionbar-bg: rgba(250, 250, 252, 0.92);
            --jdml-item-floating: rgba(255, 255, 255, 0.90);
            background: var(--jdml-item-bg) !important;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
        }

        /* Match iOS dark mode as a complete palette so no light page surfaces leak through. */
        @media (prefers-color-scheme: dark) {
            html.jdml-ios-item {
                color-scheme: dark;
                --jdml-item-bg: #000000;
                --jdml-item-card: #1c1c1e;
                --jdml-item-media: #1c1c1e;
                --jdml-item-text: #f2f2f7;
                --jdml-item-secondary: #aeaeb2;
                --jdml-item-tertiary: #8e8e93;
                --jdml-item-fill: #2c2c2e;
                --jdml-item-separator: rgba(84, 84, 88, 0.65);
                --jdml-item-accent: #ff453a;
                --jdml-item-accent-soft: rgba(255, 69, 58, 0.16);
                --jdml-item-blue: #0a84ff;
                --jdml-item-header: rgba(28, 28, 30, 0.88);
                --jdml-item-tabbar: rgba(28, 28, 30, 0.92);
                --jdml-item-actionbar-bg: rgba(28, 28, 30, 0.92);
                --jdml-item-floating: rgba(44, 44, 46, 0.90);
            }
        }

        html.jdml-ios-item,
        html.jdml-ios-item body {
            min-height: 100%;
            background: var(--jdml-item-bg) !important;
        }

        html.jdml-ios-item body {
            margin: 0 !important;
            padding-bottom: calc(82px + env(safe-area-inset-bottom)) !important;
            color: var(--jdml-item-text) !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
                         "PingFang SC", "Helvetica Neue", Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
        }

        html.jdml-ios-item * {
            box-sizing: border-box;
        }

        html.jdml-ios-item :is(a, button, input, [role="button"]) {
            -webkit-tap-highlight-color: transparent;
        }

        /* JD's legacy item page mounts major sections directly under body. */
        html.jdml-ios-item :is(
            #app,
            #root,
            #container,
            main,
            #part_main,
            #part_store,
            #part_summary,
            #part_related
        ) {
            width: 100% !important;
            max-width: 760px;
            margin-inline: auto;
        }

        /* Native product header, kept functional but made compact and translucent. */
        html.jdml-ios-item :is(
            #m_header,
            .m_header,
            #m_common_header,
            #m_short_header,
            .m_short_header,
            #detailHeader,
            #detail-header,
            .detail_header,
            .detail-header,
            .detail_header_wrap,
            .detail-header-wrap,
            [class*="detailHeader"],
            [class*="detail-header"]
        ) {
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-item-separator) !important;
            padding-top: env(safe-area-inset-top) !important;
            background: var(--jdml-item-header) !important;
            box-shadow: none !important;
            -webkit-backdrop-filter: blur(22px) saturate(180%) !important;
            backdrop-filter: blur(22px) saturate(180%) !important;
        }

        html.jdml-ios-item :is(#m_header, .m_header, #detailHeader, #detail-header) {
            position: sticky !important;
            z-index: 850 !important;
            top: 0 !important;
        }

        html.jdml-ios-item :is(
            #m_header,
            .m_header,
            #m_common_header,
            #m_short_header,
            .m_short_header,
            #detailHeader,
            #detail-header,
            .detail_header,
            .detail-header,
            .detail_header_wrap,
            .detail-header-wrap,
            [class*="detailHeader"],
            [class*="detail-header"]
        ) :is(a, button, [role="button"]) {
            border: 0 !important;
            color: var(--jdml-item-blue) !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        /* Product image gallery. */
        html.jdml-ios-item :is(
            .jdml-item-gallery,
            #loopImgDiv,
            .mod_slider,
            .mod_slider_s1,
            #slide,
            #preview,
            .detail_pic,
            .detail-pic,
            .goods_pic,
            .goods-pic,
            .preview,
            .preview_wrap,
            .preview-wrap,
            .product_gallery,
            .product-gallery,
            [class*="productGallery"],
            [class*="imageGallery"]
        ) {
            position: relative !important;
            width: auto !important;
            margin: 12px !important;
            border: 0 !important;
            border-radius: 20px !important;
            overflow: hidden !important;
            background: var(--jdml-item-card) !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(0, 0, 0, 0.06) !important;
        }

        html.jdml-ios-item :is(
            .jdml-item-gallery,
            #loopImgDiv,
            .mod_slider,
            .mod_slider_s1,
            #slide,
            #preview,
            .detail_pic,
            .detail-pic,
            .goods_pic,
            .goods-pic,
            .preview,
            .preview_wrap,
            .preview-wrap,
            .product_gallery,
            .product-gallery,
            [class*="productGallery"],
            [class*="imageGallery"]
        ) img {
            background: var(--jdml-item-media) !important;
            object-fit: contain !important;
        }

        /* Product information floors become grouped iOS cards. */
        html.jdml-ios-item .jdml-item-card {
            position: relative !important;
            width: auto !important;
            height: auto !important;
            margin: 10px 12px !important;
            border: 0 !important;
            border-radius: 16px !important;
            overflow: hidden !important;
            color: var(--jdml-item-text) !important;
            background: var(--jdml-item-card) !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.035) !important;
        }

        html.jdml-ios-item .jdml-item-title {
            color: var(--jdml-item-text) !important;
            font-size: 17px !important;
            font-weight: 650 !important;
            line-height: 1.42 !important;
            letter-spacing: -0.012em !important;
        }

        html.jdml-ios-item .jdml-item-price,
        html.jdml-ios-item .jdml-item-price * {
            color: var(--jdml-item-accent) !important;
            font-variant-numeric: tabular-nums !important;
        }

        html.jdml-ios-item .jdml-item-price {
            font-size: 28px !important;
            font-weight: 720 !important;
            letter-spacing: -0.025em !important;
        }

        html.jdml-ios-item :is(
            .detail_prom,
            .detail-promotion,
            .prom_floor,
            .prom-floor,
            .detail_sku,
            .detail-sku,
            .sku_floor,
            .sku-floor,
            .detail_address,
            .detail-address,
            .address_floor,
            .address-floor,
            .detail_service,
            .detail-service,
            .service_floor,
            .service-floor,
            .shop_info,
            .shop-info,
            .detail_shop,
            .detail-shop
        ) :is(a, button, [role="button"]) {
            min-height: 44px !important;
        }

        html.jdml-ios-item :is(
            .detail_prom,
            .detail-promotion,
            .prom_floor,
            .prom-floor,
            .detail_sku,
            .detail-sku,
            .sku_floor,
            .sku-floor,
            .detail_address,
            .detail-address,
            .address_floor,
            .address-floor,
            .detail_service,
            .detail-service,
            .service_floor,
            .service-floor
        ) {
            color: var(--jdml-item-text) !important;
            background: var(--jdml-item-card) !important;
        }

        html.jdml-ios-item :is(
            .detail_prom,
            .detail-promotion,
            .prom_floor,
            .prom-floor,
            .detail_sku,
            .detail-sku,
            .sku_floor,
            .sku-floor,
            .detail_address,
            .detail-address,
            .address_floor,
            .address-floor,
            .detail_service,
            .detail-service,
            .service_floor,
            .service-floor
        ) + :is(
            .detail_prom,
            .detail-promotion,
            .prom_floor,
            .prom-floor,
            .detail_sku,
            .detail-sku,
            .sku_floor,
            .sku-floor,
            .detail_address,
            .detail-address,
            .address_floor,
            .address-floor,
            .detail_service,
            .detail-service,
            .service_floor,
            .service-floor
        ) {
            border-top: 0.5px solid var(--jdml-item-separator) !important;
        }

        html.jdml-ios-item :is(
            #detailTab,
            .mod_fix_wrap,
            .mod_fix,
            .mod_tab,
            .detail_tab,
            .detail-tab,
            .detail_nav,
            .detail-nav,
            .tab_bar,
            .tab-bar,
            [class*="detailTab"],
            [class*="detail-tab"]
        ) {
            border: 0 !important;
            border-bottom: 0.5px solid var(--jdml-item-separator) !important;
            padding: 7px 10px !important;
            background: var(--jdml-item-tabbar) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
        }

        html.jdml-ios-item :is(
            #detailTab,
            .mod_fix,
            .mod_tab,
            .detail_tab,
            .detail-tab,
            .detail_nav,
            .detail-nav,
            .tab_bar,
            .tab-bar,
            [class*="detailTab"],
            [class*="detail-tab"]
        ) :is(a, button, li, [role="tab"], .item) {
            min-height: 34px !important;
            border-radius: 10px !important;
            color: var(--jdml-item-secondary) !important;
            font-size: 14px !important;
            font-weight: 500 !important;
        }

        html.jdml-ios-item :is(
            #detailTab,
            .mod_fix,
            .mod_tab,
            .detail_tab,
            .detail-tab,
            .detail_nav,
            .detail-nav,
            .tab_bar,
            .tab-bar,
            [class*="detailTab"],
            [class*="detail-tab"]
        ) :is(.cur, .current, .active, [aria-selected="true"]) {
            color: var(--jdml-item-text) !important;
            background: var(--jdml-item-card) !important;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08) !important;
            font-weight: 650 !important;
        }

        /* SKU, promotion and delivery dialogs retain native JS but look like iOS sheets. */
        html.jdml-ios-item .jdml-item-sheet {
            z-index: 1200 !important;
            border-radius: 22px 22px 0 0 !important;
            padding-bottom: env(safe-area-inset-bottom) !important;
            overflow: hidden !important;
            color: var(--jdml-item-text) !important;
            background: var(--jdml-item-card) !important;
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.16) !important;
        }

        html.jdml-ios-item .jdml-item-sheet :is(button, a, [role="button"]) {
            -webkit-tap-highlight-color: transparent;
        }

        html.jdml-ios-item :is(
            .sku_item,
            .sku-item,
            .sku_option,
            .sku-option,
            [class*="skuItem"],
            [class*="sku-item"]
        ) {
            border: 0 !important;
            border-radius: 10px !important;
            color: var(--jdml-item-text) !important;
            background: var(--jdml-item-fill) !important;
        }

        html.jdml-ios-item :is(
            .sku_item.selected,
            .sku-item.selected,
            .sku_option.selected,
            .sku-option.selected,
            .sku_item.cur,
            .sku-item.cur,
            [class*="skuItem"][class*="selected"],
            [class*="sku-item"][class*="selected"]
        ) {
            color: var(--jdml-item-accent) !important;
            background: var(--jdml-item-accent-soft) !important;
            box-shadow: inset 0 0 0 1px rgba(225, 37, 27, 0.28) !important;
        }

        /* Native purchase bar remains wired to JD handlers. */
        html.jdml-ios-item .jdml-item-actionbar {
            position: fixed !important;
            z-index: 900 !important;
            right: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            width: 100% !important;
            min-height: 64px !important;
            margin: 0 !important;
            border: 0 !important;
            border-top: 0.5px solid var(--jdml-item-separator) !important;
            padding: 8px max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)) !important;
            background: var(--jdml-item-actionbar-bg) !important;
            box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.06) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
        }

        html.jdml-ios-item .jdml-item-actionbar :is(a, button, [role="button"], .btn) {
            min-height: 44px !important;
            border-radius: 13px !important;
            box-shadow: none !important;
            font-size: 15px !important;
            font-weight: 650 !important;
        }

        html.jdml-ios-item .jdml-item-actionbar :is(.de_btn_bar, .btn_group) {
            gap: 8px !important;
        }

        html.jdml-ios-item .jdml-item-actionbar .icon_btn {
            color: var(--jdml-item-secondary) !important;
            background: transparent !important;
        }

        /* Keep the native controls but remove auxiliary rows that turn the bar into a banner. */
        html.jdml-ios-item .jdml-item-actionbar :is(#itemLoginTip, .itemLoginTip, #statusNotice, .statusNotice) {
            display: none !important;
        }

        html.jdml-ios-item .jdml-item-actionbar .de_btn_bar {
            display: flex !important;
            align-items: stretch !important;
            min-height: 44px !important;
            background: transparent !important;
        }

        html.jdml-ios-item .jdml-item-action-secondary {
            border: 0 !important;
            color: var(--jdml-item-accent) !important;
            background: var(--jdml-item-accent-soft) !important;
        }

        html.jdml-ios-item .jdml-item-action-primary {
            border: 0 !important;
            color: #fff !important;
            background: var(--jdml-item-accent) !important;
        }

        /* Nonessential product-page clutter. */
        html.jdml-ios-item :is(
            .jdml-item-clutter,
            #m_common_tip,
            #qrcodeBottom,
            #jxappPopup,
            .h5_to_wxapp_bottom_wrap,
            #mCommonFooter,
            #commonFooter,
            .common_footer,
            .common-footer,
            .jd_footer,
            .jd-footer,
            .detail_recommend,
            .detail-recommend,
            .recommend_floor,
            .recommend-floor,
            .guess_like,
            .guess-like,
            .guessYouLike,
            .similar_goods,
            .similar-goods,
            .shop_recommend,
            .shop-recommend,
            #guessArea,
            #peijianBox,
            #accessoryArea,
            .detail_cmd,
            .detail_accessory,
            [class*="recommendFloor"],
            [class*="guessYouLike"]
        ) {
            display: none !important;
        }

        html.jdml-ios-item :is(.backtop, .back_top, .back-top, [class*="backToTop"]) {
            border: 0 !important;
            border-radius: 50% !important;
            color: var(--jdml-item-secondary) !important;
            background: var(--jdml-item-floating) !important;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            backdrop-filter: blur(16px) !important;
        }

        @media (prefers-color-scheme: dark) {
            /* JD paints the price campaign as a light bitmap; remove only that decoration so
               the live price and countdown remain readable on the dark iOS card. */
            html.jdml-ios-item #priceSpec :is(.detail_decoration, [class*="bg_"]) {
                background-color: transparent !important;
                background-image: none !important;
            }

            html.jdml-ios-item #priceSpec .text {
                color: var(--jdml-item-secondary) !important;
                background: var(--jdml-item-fill) !important;
            }

            html.jdml-ios-item .jdml-item-actionbar .icon_btn :is(.txt, span) {
                color: var(--jdml-item-secondary) !important;
            }
        }

        @media (min-width: 760px) {
            html.jdml-ios-item .jdml-item-actionbar {
                right: 50% !important;
                left: auto !important;
                width: 760px !important;
                transform: translateX(50%) !important;
                border-radius: 18px 18px 0 0 !important;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            html.jdml-ios-item * {
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `;

    const APP_PROMO_TEXT_RE = /(?:(?:打开|下载|安装|使用|前往|唤起|启动|进入|跳转).{0,12}(?:京东\s*)?(?:app|客户端))|(?:(?:京东\s*)?(?:app|客户端).{0,12}(?:打开|下载|安装|使用|前往|唤起|启动|进入|查看|购买|参与|最新版|专享|专属))|(?:(?:app|客户端)[内中](?:打开|查看|购买|参与))|(?:在\s*(?:京东\s*)?app\s*[内中])|(?:(?:仅|只|专).{0,12}(?:京东\s*)?(?:app|客户端))|(?:(?:open|download|install|use|launch|continue|view|buy|shop).{0,14}(?:(?:jd|jingdong)\s*)?app)|(?:(?:(?:jd|jingdong)\s*)?app.{0,14}(?:open|download|install|use|launch|continue|view|buy|shop))/i;
    const PUSH_PROMPT_TEXT_RE = /(?:(?:开启|打开|允许|接收|订阅).{0,8}(?:消息|推送)?通知)|(?:(?:消息|推送)?通知.{0,8}(?:开启|打开|允许|接收))/i;
    const PRESERVE_ITEM_NOTICE_RE = /(?:到货|降价|库存|预约|开售)通知/i;
    const PROTECTED_ACTION_RE = /(?:加入购物车|立即购买|去结算|确认订单|搜索商品|搜索|综合|销量|价格|筛选)/;
    const ITEM_RECOMMEND_HEADING_RE = /^(?:猜你喜欢|为你推荐|看了又看|同类推荐|相似商品|店铺热销)$/;
    const PRICE_TEXT_RE = /(?:^|\s)[¥￥]\s*\d/;
    const PRIMARY_ACTION_TEXT_RE = /^(?:提交|保存|确认|完成|登录|注册|去结算|结算|付款|支付|立即购买|加入购物车|领取|开通)$/;
    const SECONDARY_ACTION_TEXT_RE = /^(?:取消|返回|关闭|编辑|管理|重试|逛逛频道|查看|筛选|清空)$/;
    const EMPTY_STATE_TEXT_RE = /(?:暂无|还没有|空空如也|挑点喜欢的|没有找到|无搜索结果|购物车为空)/;
    const APP_CONTENT_TARGET_SELECTOR = [
        'a', 'button', '[role="button"]', '[onclick]',
        '#rightBtn', '#statusNotice', '#statusNote',
        '[class*="btn" i]', '[class*="button" i]',
        '[class*="banner" i]', '[class*="notice" i]', '[class*="prompt" i]',
        '[class*="guide" i]', '[class*="tip" i]',
        '[id*="download" i]', '[id*="openApp" i]', '[id*="appPrompt" i]'
    ].join(',');
    const ITEM_CARD_SELECTOR = [
        '#buyArea', '.buy_area', '.buy-area',
        '#priceSpec', '.priceSpec',
        '.detail_info', '.detail-info', '.goods_info', '.goods-info',
        '.item_info', '.item-info', '.price_wrap', '.price-wrap',
        '.detail_prom', '.detail-promotion', '.prom_floor', '.prom-floor',
        '.detail_sku', '.detail-sku', '.sku_floor', '.sku-floor',
        '.detail_address', '.detail-address', '.address_floor', '.address-floor',
        '.detail_service', '.detail-service', '.service_floor', '.service-floor',
        '.shop_info', '.shop-info', '.detail_shop', '.detail-shop',
        '.comment_info', '.comment-info', '.detail_comment', '.detail-comment',
        '.item_floor', '.item-floor', '.detail_extra', '.detail-extra',
        '.detail_transfer', '.detail-transfer', '.detail_serve_container',
        '.detail-shop-box-v3', '.detail_shop_box_v3', '.detail_mendian',
        '.mod_key_parameters', '.detail_specBusiness',
        '[class*="detailFloor"]', '[class*="detail_floor"]'
    ].join(',');

    let removedPromptSinceLastUnlock = false;

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
        if (isNeutral(fg) && fg.l < 0.5) el.setAttribute('data-jdml-fg', fg.l < 0.3 ? '1' : '2');
        const bg = parseRgb(cs.backgroundColor);
        // Pure white becomes the card colour; light greys become the fill.
        if (isNeutral(bg) && bg.l > 0.85) el.setAttribute('data-jdml-bg', bg.l > 0.97 ? '1' : '2');
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
            const bd = parseRgb(cs[`border${side}Color`]);
            if (parseFloat(cs[`border${side}Width`]) > 0 && isNeutral(bd) && bd.l > 0.7) {
                el.setAttribute('data-jdml-bd', '');
                break;
            }
        }
    };
    function toneTree(root) {
        if (root === document) root = document.documentElement;
        if (!DARK.matches || !root || root.nodeType !== 1) return;
        toneElement(root);
        for (const el of root.querySelectorAll('*')) toneElement(el);
    }

    function injectStyle(css, marker) {
        if (document.querySelector(`style[${marker}]`)) return;

        const style = document.createElement('style');
        style.setAttribute(marker, '');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function getPromptText(element) {
        return (element?.innerText || element?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 320);
    }

    function hasProductContent(element) {
        if (!(element instanceof Element)) return false;
        if (element.matches(COMMERCE_GUARD_SELECTOR)) return true;
        if (element.matches(PRODUCT_LINK_SELECTOR) || element.querySelector(PRODUCT_LINK_SELECTOR)) return true;
        return PROTECTED_ACTION_RE.test(getPromptText(element));
    }

    function getPositionInfo(element) {
        if (!(element instanceof Element)) return { positioned: false, modalLike: false };

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const fixedOrSticky = style.position === 'fixed' || style.position === 'sticky';
        const dialogRole = element.matches('[role="dialog"], [role="alertdialog"]');
        const viewportArea = Math.max(1, innerWidth * innerHeight);
        const elementArea = Math.max(0, rect.width * rect.height);
        const coversViewport = elementArea / viewportArea >= 0.18;
        const highLayer = Number.parseInt(style.zIndex, 10) >= 100;
        const modalLike = dialogRole || fixedOrSticky || (style.position === 'absolute' && coversViewport && highLayer);
        return { positioned: fixedOrSticky, modalLike };
    }

    function isPromptSurface(element) {
        if (!(element instanceof Element)) return false;
        const { modalLike } = getPositionInfo(element);
        if (modalLike) return true;
        return element.matches(PROMPT_SURFACE_SELECTOR)
            && /(?:app|download|open|wake|banner|popup|modal|overlay|notice|notify|push|guide|tip|prompt)/i
                .test(`${element.id} ${element.className}`);
    }

    function isAppOrPushPrompt(element) {
        if (!(element instanceof Element) || !element.isConnected) return false;
        if (hasProductContent(element)) return false;

        const text = getPromptText(element);
        if (!text || text.length > 260) return false;

        const appPromo = APP_PROMO_TEXT_RE.test(text);
        const pushPrompt = PUSH_PROMPT_TEXT_RE.test(text) && !PRESERVE_ITEM_NOTICE_RE.test(text);
        if (!appPromo && !pushPrompt) return false;

        const hasAction = element.matches('a, button, [role="button"]')
            || Boolean(element.querySelector('a, button, [role="button"]'));
        return isPromptSurface(element) || hasAction;
    }

    function closestSafePromptRoot(element) {
        if (!(element instanceof Element)) return null;

        let best = element;
        let current = element.parentElement;
        for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
            if (hasProductContent(current)) break;
            if (!isPromptSurface(current)) break;
            best = current;
            current = current.parentElement;
        }
        return best;
    }

    function removeNode(element, preferPromptRoot = false) {
        if (!(element instanceof Element) || !element.isConnected) return false;

        let target = preferPromptRoot ? closestSafePromptRoot(element) : element;
        if (!target || target === document.body || target === document.documentElement) return false;

        // Never delete a product/result container. Explicit app surfaces may contain a product
        // link or live inside a data-sku root, so they remain removable on item pages.
        const explicitlyRemovable = (node) => node.matches(EXPLICIT_APP_PROMO_SELECTOR)
            || node.matches(APP_TRIGGER_SELECTOR);
        if (hasProductContent(target) && !explicitlyRemovable(target)) {
            target = element;
            if (hasProductContent(target) && !explicitlyRemovable(target)) return false;
        }

        target.remove();
        removedPromptSinceLastUnlock = true;
        return true;
    }

    function collectMatches(root, selector) {
        if (!(root instanceof Element) && root !== document) return [];
        const matches = [];
        if (root instanceof Element && root.matches(selector)) matches.push(root);
        matches.push(...root.querySelectorAll(selector));
        return matches;
    }

    function removeAppRelatedContent(root) {
        const candidates = collectMatches(root, APP_CONTENT_TARGET_SELECTOR)
            .filter((element) => {
                const text = getPromptText(element);
                return text && text.length <= 260 && APP_PROMO_TEXT_RE.test(text);
            });

        // Remove the smallest matching control first. This prevents a mixed action bar from
        // disappearing when only one of its buttons redirects to the JD app.
        for (const candidate of candidates) {
            const hasMatchingDescendant = candidates.some((other) => (
                other !== candidate && candidate.contains(other)
            ));
            if (hasMatchingDescendant) continue;
            removeNode(candidate, true);
        }

        // Some prompts are plain text inside otherwise anonymous wrappers. Walking text nodes
        // catches those variants without applying broad substring selectors to product content.
        const ownerRoot = root === document ? document.documentElement : root;
        if (!(ownerRoot instanceof Element)) return;
        const walker = document.createTreeWalker(ownerRoot, NodeFilter.SHOW_TEXT);
        const owners = new Set();
        let textNode = walker.nextNode();
        while (textNode) {
            const text = (textNode.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (text && text.length <= 180 && APP_PROMO_TEXT_RE.test(text)) {
                owners.add(textNode.parentElement);
            }
            textNode = walker.nextNode();
        }

        for (const owner of owners) {
            if (!(owner instanceof Element) || !owner.isConnected) continue;
            const target = owner.closest(APP_CONTENT_TARGET_SELECTOR) || owner;
            if (target === document.body || target === document.documentElement) continue;
            const text = getPromptText(target);
            if (text.length <= 260 && APP_PROMO_TEXT_RE.test(text)) removeNode(target, true);
        }
    }

    function dismissSearchInterstitial(root) {
        if (!IS_NATIVE_SEARCH) return;

        const continueButtons = collectMatches(root, '#pcprompt-viewpc');
        for (const button of continueButtons) {
            if (button.dataset.jdmlClicked === '1') continue;
            button.dataset.jdmlClicked = '1';
            try {
                button.click();
            } catch {
                // Removing the prompt mask below is the fallback.
            }
        }

        for (const mask of collectMatches(root, SEARCH_INTERSTITIAL_MASK_SELECTOR)) {
            removeNode(mask);
        }

        for (const appChoice of collectMatches(root, '#pcprompt-viewapp')) {
            removeNode(appChoice, true);
        }
    }

    function getVisibleRect(element) {
        if (!(element instanceof Element)) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        return rect;
    }

    function isWideEnoughForPageChrome(rect) {
        const viewportWidth = Math.max(320, innerWidth || document.documentElement.clientWidth || 320);
        return rect.width >= Math.min(320, viewportWidth * 0.48);
    }

    function findProductCardRoot(link) {
        if (!(link instanceof Element)) return null;

        let best = link;
        let current = link.parentElement;
        for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
            const rect = getVisibleRect(current);
            const text = getPromptText(current);
            const productLinkCount = current.querySelectorAll(PRODUCT_LINK_SELECTOR).length;
            if (!rect || text.length > 900 || productLinkCount > 2) break;
            if (rect.height <= Math.max(720, innerHeight * 0.92) && current.querySelector('img')) {
                best = current;
            }
            current = current.parentElement;
        }
        return best;
    }

    function tagPriceFragments(card) {
        if (!(card instanceof Element)) return;
        for (const element of card.querySelectorAll('*')) {
            if (element.children.length > 3) continue;
            const directText = [...element.childNodes]
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.nodeValue || '')
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (PRICE_TEXT_RE.test(directText)) element.classList.add('jdml-site-price');
        }
        if (PRICE_TEXT_RE.test(getPromptText(card)) && !card.querySelector('.jdml-site-price')) {
            card.classList.add('jdml-site-price');
        }
    }

    function styleGenericPage(root) {
        if (IS_HOME || IS_SEARCH_RESULTS || IS_ITEM_DETAIL) return;

        const html = document.documentElement;
        html.classList.add('jdml-ios-site');
        html.dataset.jdmlHost = location.hostname;

        const documentWide = root === document || root === document.documentElement;
        const bodyRect = document.body?.getBoundingClientRect();
        const viewportHeight = Math.max(480, innerHeight || document.documentElement.clientHeight || 480);

        // Keep one centered mobile canvas on wide desktop windows while preserving JD's own
        // routers and page containers. This also gives fixed headers and tab bars a stable width.
        const mainSelector = [
            'main', '[role="main"]', '#app', '#root', '#container', '#content',
            '.page', '.page_wrap', '.page-wrap', '.wrapper', '.main', '.main_wrap', '.main-wrap'
        ].join(',');
        for (const main of collectMatches(root, mainSelector)) {
            const rect = getVisibleRect(main);
            if (rect && isWideEnoughForPageChrome(rect)) main.classList.add('jdml-site-main');
        }

        const headerCandidates = new Set(collectMatches(root, SITE_HEADER_CANDIDATE_SELECTOR));
        for (const input of collectMatches(root, 'input[type="search"], input[name="keyword" i], input[placeholder*="搜索"]')) {
            input.classList.add('jdml-site-search');
            let current = input.parentElement;
            for (let depth = 0; current && current !== document.body && depth < 4; depth += 1) {
                const rect = getVisibleRect(current);
                if (rect && rect.top <= 130 && rect.height <= 150 && isWideEnoughForPageChrome(rect)) {
                    headerCandidates.add(current);
                }
                current = current.parentElement;
            }
        }

        for (const header of headerCandidates) {
            const rect = getVisibleRect(header);
            if (!rect || rect.top > 150 || rect.height > 170 || !isWideEnoughForPageChrome(rect)) continue;
            header.classList.add('jdml-site-header');
        }

        const tabbarCandidates = new Set(collectMatches(root, SITE_TABBAR_CANDIDATE_SELECTOR));
        if (documentWide) {
            // Some JD apps use generated class names. A fixed, short, full-width container with
            // at least three controls is still reliably identifiable as viewport navigation.
            for (const element of document.querySelectorAll('body div, body ul')) {
                const style = getComputedStyle(element);
                if (style.position !== 'fixed' && style.position !== 'sticky') continue;
                const rect = getVisibleRect(element);
                if (!rect || rect.height < 38 || rect.height > 130 || !isWideEnoughForPageChrome(rect)) continue;
                if (rect.bottom < viewportHeight - 36) continue;
                const controls = element.querySelectorAll('a, button, [role="tab"], [role="button"]');
                if (controls.length >= 3) tabbarCandidates.add(element);
            }
        }

        for (const tabbar of tabbarCandidates) {
            const rect = getVisibleRect(tabbar);
            if (!rect || rect.height < 38 || rect.height > 140 || !isWideEnoughForPageChrome(rect)) continue;
            const nearBottom = rect.bottom >= viewportHeight - 42;
            const controls = tabbar.querySelectorAll('a, button, [role="tab"], [role="button"]');
            if (nearBottom && controls.length >= 3) tabbar.classList.add('jdml-site-tabbar');
        }

        if (documentWide && document.body && bodyRect) {
            // The category app uses an opaque generated class for its left rail. Its geometry and
            // repeated short labels are stable, so the heuristic is deliberately layout-based.
            for (const sidebar of document.querySelectorAll('aside, [role="tablist"], body ul, body div')) {
                const rect = getVisibleRect(sidebar);
                if (!rect || rect.width < 58 || rect.width > 190 || rect.height < viewportHeight * 0.44) continue;
                if (Math.abs(rect.left - bodyRect.left) > 18 || rect.top > 180) continue;
                if (sidebar.children.length < 5 || sidebar.querySelectorAll('img').length > 3) continue;
                sidebar.classList.add('jdml-site-sidebar');
                break;
            }
        }

        for (const card of collectMatches(root, SITE_CARD_CANDIDATE_SELECTOR)) {
            const rect = getVisibleRect(card);
            if (!rect || rect.width < 180 || rect.height < 44 || rect.height > viewportHeight * 1.15) continue;
            if (card.matches('.jdml-site-header, .jdml-site-tabbar, .jdml-site-sidebar')) continue;
            if (card.closest('.jdml-site-product-card')) continue;
            card.classList.add('jdml-site-card');
            if (card.matches('section, article, [role="region"]')) card.classList.add('jdml-site-section');
        }

        const productLinks = new Set(collectMatches(root, PRODUCT_LINK_SELECTOR));
        for (const link of collectMatches(root, 'a[href]')) {
            if (link.querySelector('img') && PRICE_TEXT_RE.test(getPromptText(link))) productLinks.add(link);
        }
        for (const link of productLinks) {
            const card = findProductCardRoot(link);
            if (!card) continue;
            card.classList.add('jdml-site-product-card');
            tagPriceFragments(card);
        }

        for (const row of collectMatches(root, SITE_ROW_CANDIDATE_SELECTOR)) {
            const rect = getVisibleRect(row);
            if (!rect || rect.width < 180 || rect.height < 34 || rect.height > 132) continue;
            if (row.closest('.jdml-site-product-card, .jdml-site-tabbar, .jdml-site-sidebar')) continue;
            row.classList.add('jdml-site-row');
        }

        for (const action of collectMatches(root, 'a, button, [role="button"], input[type="button"], input[type="submit"]')) {
            const text = getPromptText(action) || action.value || '';
            if (!text || text.length > 24) continue;
            if (PRIMARY_ACTION_TEXT_RE.test(text)) {
                action.classList.add('jdml-site-button', 'jdml-site-button-primary');
            } else if (SECONDARY_ACTION_TEXT_RE.test(text)) {
                action.classList.add('jdml-site-button', 'jdml-site-button-secondary');
            }
        }

        const chipSelector = [
            '[role="tab"]', '[aria-selected]', '.tab_item', '.tab-item', '.filter_item', '.filter-item',
            '.sort_item', '.sort-item', '.category_item', '.category-item'
        ].join(',');
        for (const chip of collectMatches(root, chipSelector)) {
            const rect = getVisibleRect(chip);
            const text = getPromptText(chip);
            if (rect && rect.height <= 60 && text && text.length <= 24) chip.classList.add('jdml-site-chip');
        }

        const dialogSelector = [
            '[role="dialog"]', '[role="alertdialog"]', '.modal', '.popup', '.pop_up', '.pop-up',
            '.dialog', '.bottom_sheet', '.bottom-sheet', '.action_sheet', '.action-sheet',
            '[class*="bottomSheet"]', '[class*="bottom-sheet"]'
        ].join(',');
        for (const dialog of collectMatches(root, dialogSelector)) {
            if (isAppOrPushPrompt(dialog)) continue;
            const rect = getVisibleRect(dialog);
            if (!rect) continue;
            const sheetLike = rect.bottom >= viewportHeight - 18 && rect.width >= Math.min(320, innerWidth * 0.62);
            dialog.classList.add(sheetLike ? 'jdml-site-sheet' : 'jdml-site-dialog');
        }

        for (const mask of collectMatches(root, '.mask, .modal_mask, .modal-mask, .overlay, .backdrop, [class*="dialogMask"], [class*="dialog-mask"]')) {
            const rect = getVisibleRect(mask);
            if (rect && rect.width * rect.height >= innerWidth * viewportHeight * 0.48) {
                mask.classList.add('jdml-site-mask');
            }
        }

        for (const toast of collectMatches(root, '.toast, .message, .notice, [role="status"], [class*="toast" i]')) {
            const rect = getVisibleRect(toast);
            if (rect && rect.width <= 560 && rect.height <= 180) toast.classList.add('jdml-site-toast');
        }

        const emptyCandidates = new Set(collectMatches(
            root,
            '.empty, .empty_state, .empty-state, .no_data, .no-data, [class*="emptyState"]'
        ));
        if (documentWide) {
            for (const element of document.querySelectorAll('body div')) {
                const text = getPromptText(element);
                if (!text || text.length > 120 || !EMPTY_STATE_TEXT_RE.test(text)) continue;
                let current = element;
                for (let depth = 0; current.parentElement && current.parentElement !== document.body && depth < 3; depth += 1) {
                    if (current.parentElement.querySelectorAll('a[href]').length > 2) break;
                    current = current.parentElement;
                }
                emptyCandidates.add(current);
            }
        }
        for (const empty of emptyCandidates) {
            if (EMPTY_STATE_TEXT_RE.test(getPromptText(empty))) empty.classList.add('jdml-site-empty');
        }

        for (const loading of collectMatches(root, '.loading, .skeleton, [class*="skeleton" i], [aria-busy="true"]')) {
            loading.classList.add('jdml-site-loading');
        }

        for (const footer of collectMatches(root, 'footer, .footer, .common_footer, .common-footer')) {
            if (!footer.classList.contains('jdml-site-tabbar')) footer.classList.add('jdml-site-footer');
        }

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.content = matchMedia('(prefers-color-scheme: dark)').matches ? '#000000' : '#f2f2f7';
        }
    }

    function styleSearchResults(root) {
        if (!IS_SEARCH_RESULTS) return;

        document.documentElement.classList.add('jdml-ios-search');

        const darkMode = matchMedia('(prefers-color-scheme: dark)').matches;
        const canvasColor = darkMode ? '#000000' : '#f2f2f7';
        const toolbarColor = darkMode ? 'rgba(28, 28, 30, 0.92)' : 'rgba(247, 247, 249, 0.92)';
        const searchSurfaceSelector = [
            '.wx_wrap.search_jd',
            '#barTabs', '.pro_filter_items', '#sortProBlock', '.pro_filter', '.pro_filter_wrap'
        ].join(',');

        // A few legacy search wrappers ship inline white backgrounds with !important. Keep the
        // override narrow and inline so only the page canvas and filter toolbar follow dark mode.
        // Re-read from document because JD often adds the toolbar's children after its wrapper.
        for (const surface of collectMatches(document, searchSurfaceSelector)) {
            surface.style.setProperty('background', surface.matches('.wx_wrap') ? canvasColor : toolbarColor, 'important');
            surface.style.setProperty('background-image', 'none', 'important');
            for (const child of surface.querySelectorAll('div, a, button, li, span')) {
                child.style.setProperty('background-image', 'none', 'important');
                if (child !== surface && !child.matches('.search_prolist_item, .jdml-ios-product-card')) {
                    child.style.setProperty('background-color', 'transparent', 'important');
                }
            }
        }

        for (const list of collectMatches(root, SEARCH_LIST_SELECTOR)) {
            list.classList.add('jdml-ios-product-list');
        }

        for (const card of collectMatches(root, SEARCH_CARD_SELECTOR)) {
            if (card.parentElement?.closest(SEARCH_CARD_SELECTOR)) continue;
            card.classList.add('jdml-ios-product-card');

            // Normalize the common JD search variants into stable presentation hooks.
            // The native links and event handlers remain untouched.
            const hooks = [
                [
                    '.search_prolist_item_inner, .product_card_inner, .product-card-inner, '
                    + '[class*="productCardInner"], [class*="product-card-inner"]',
                    'jdml-ios-product-inner'
                ],
                [
                    '.search_prolist_cover, .search_prolist_img, .search_prolist_image, '
                    + '.search_prolist_item_pic, .product_image, .product-image, '
                    + '.product_img, .product-img, [class*="productImage"], [class*="product-image"]',
                    'jdml-ios-product-image'
                ],
                [
                    '.search_prolist_info, .search_prolist_item_info, .search_prolist_content, '
                    + '.product_info, .product-info, [class*="productInfo"], [class*="product-info"]',
                    'jdml-ios-product-info'
                ],
                [
                    '.search_prolist_title, .search_prolist_item_title, .search_prolist_name, '
                    + '.product_title, .product-title, .product_name, .product-name, '
                    + '[class*="productTitle"], [class*="product-title"], '
                    + '[class*="productName"], [class*="product-name"]',
                    'jdml-ios-product-title'
                ],
                [
                    '.search_prolist_price, .search_prolist_item_price, .search_prolist_price_box, '
                    + '.product_price, .product-price, [class*="productPrice"], [class*="product-price"]',
                    'jdml-ios-product-price'
                ],
                [
                    '.search_prolist_item_button, .search_prolist_button, .search_prolist_cart, '
                    + '.search_prolist_buy, .cart_button, .cart-button, .buy_button, .buy-button, '
                    + '[class*="cartButton"], [class*="cart-button"], '
                    + '[class*="buyButton"], [class*="buy-button"]',
                    'jdml-ios-product-action'
                ]
            ];

            for (const [selector, className] of hooks) {
                for (const element of card.querySelectorAll(selector)) {
                    element.classList.add(className);
                }
            }
        }

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.content = matchMedia('(prefers-color-scheme: dark)').matches
                ? '#000000'
                : '#f2f2f7';
        }
    }


    function findItemActionBar(action) {
        let current = action.parentElement;
        let fallback = null;

        for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
            const text = getPromptText(current);
            if (text.length <= 180 && /(?:加入购物车|立即购买)/.test(text)) {
                fallback = current;
                const style = getComputedStyle(current);
                const identity = `${current.id} ${current.className}`;
                const hasBothActions = /加入购物车/.test(text) && /立即购买/.test(text);
                if (style.position === 'fixed' || style.position === 'sticky'
                    || hasBothActions || /(?:bottom|footer|action|btn|bar)/i.test(identity)) {
                    return current;
                }
            }
            current = current.parentElement;
        }
        return fallback;
    }

    function findItemClutterSection(heading) {
        let current = heading.parentElement;
        let fallback = heading.parentElement;
        for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
            const identity = `${current.id} ${current.className}`;
            if (/(?:recommend|guess|similar|hot)/i.test(identity)) return current;
            if (current.matches('section, article')) fallback = current;
            current = current.parentElement;
        }
        return fallback;
    }

    function styleItemPage(root) {
        if (!IS_ITEM_DETAIL) return;

        document.documentElement.classList.add('jdml-ios-item');

        const gallerySelector = [
            '#loopImgDiv', '.mod_slider', '.mod_slider_s1',
            '#slide', '#preview', '.detail_pic', '.detail-pic', '.goods_pic', '.goods-pic',
            '.preview', '.preview_wrap', '.preview-wrap', '.product_gallery', '.product-gallery',
            '[class*="productGallery"]', '[class*="imageGallery"]'
        ].join(',');
        for (const gallery of collectMatches(root, gallerySelector)) {
            gallery.classList.add('jdml-item-gallery');
        }

        for (const card of collectMatches(root, ITEM_CARD_SELECTOR)) {
            if (card.closest('.jdml-item-card') && !card.classList.contains('jdml-item-card')) continue;
            card.classList.add('jdml-item-card');
        }

        const titleSelector = [
            'h1', '#itemName', '.sku-name', '.sku_name', '.goods_name', '.goods-name',
            '.detail_name', '.detail-name', '[class*="productName"]', '[class*="skuName"]'
        ].join(',');
        for (const title of collectMatches(root, titleSelector)) {
            if (getPromptText(title).length <= 180) title.classList.add('jdml-item-title');
        }

        const priceSelector = [
            '#price', '.jd_price', '.jd-price', '.detail_price', '.detail-price',
            '#priceSpec .price', '.priceSpec .price',
            '.price_wrap', '.price-wrap', '.goods_price', '.goods-price',
            '[class*="priceValue"]', '[class*="price-value"]'
        ].join(',');
        for (const price of collectMatches(root, priceSelector)) {
            price.classList.add('jdml-item-price');
        }

        // JD's current item page renders purchase controls as divs, so tag the native bar
        // directly instead of depending only on button text that can change by product state.
        const nativeActionBarSelector = [
            '#btnTools', '.de_btn_wrap', '.detail_action_bar', '.detail-action-bar',
            '[class*="detailActionBar"]', '[class*="detail-action-bar"]'
        ].join(',');
        for (const bar of collectMatches(root, nativeActionBarSelector)) {
            bar.classList.add('jdml-item-actionbar');
        }

        for (const action of collectMatches(root, '#leftBtn, .btn_m_red')) {
            action.classList.add('jdml-item-action-secondary');
        }
        for (const action of collectMatches(root, '#rightBtn, .btn_orange')) {
            action.classList.add('jdml-item-action-primary');
        }

        for (const action of collectMatches(root, 'a, button, [role="button"]')) {
            const text = getPromptText(action);
            if (!/^(?:加入购物车|立即购买|购买|去购买)$/.test(text)) continue;
            action.classList.add(/加入购物车/.test(text)
                ? 'jdml-item-action-secondary'
                : 'jdml-item-action-primary');
            const bar = findItemActionBar(action);
            if (bar) bar.classList.add('jdml-item-actionbar');
        }

        const sheetSelector = [
            '[role="dialog"]', '[role="alertdialog"]', '.sku_window', '.sku-window',
            '.sku_choose_info', '.sku-choose-info', '.detail_sku_v1_main',
            '.prom_window', '.prom-window', '.address_window', '.address-window',
            '.detail_bottom_aciton_sheet', '.detail_bottom_action_sheet',
            '[class*="skuModal"]', '[class*="sku-modal"]', '[class*="bottomSheet"]'
        ].join(',');
        for (const sheet of collectMatches(root, sheetSelector)) {
            if (!isAppOrPushPrompt(sheet)) sheet.classList.add('jdml-item-sheet');
        }

        for (const heading of collectMatches(root, 'h2, h3, h4, [role="heading"]')) {
            if (!ITEM_RECOMMEND_HEADING_RE.test(getPromptText(heading))) continue;
            const section = findItemClutterSection(heading);
            if (section && section !== document.body && section !== document.documentElement) {
                section.classList.add('jdml-item-clutter');
            }
        }

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.content = matchMedia('(prefers-color-scheme: dark)').matches
                ? '#000000'
                : '#f2f2f7';
        }
    }

    function cleanNativeRoot(root) {
        styleGenericPage(root);
        styleSearchResults(root);
        styleItemPage(root);
        dismissSearchInterstitial(root);

        for (const element of collectMatches(root, EXPLICIT_APP_PROMO_SELECTOR)) {
            if (element.matches('meta, link')) {
                element.remove();
                continue;
            }
            removeNode(element, true);
        }

        for (const trigger of collectMatches(root, APP_TRIGGER_SELECTOR)) {
            removeNode(trigger, true);
        }

        removeAppRelatedContent(root);

        for (const candidate of collectMatches(root, PROMPT_SURFACE_SELECTOR)) {
            if (isAppOrPushPrompt(candidate)) removeNode(candidate);
        }

        toneTree(root);

        if (IS_NATIVE_SEARCH) {
            for (const ad of collectMatches(root, '.search_prolist_ad')) {
                const card = ad.closest('.search_prolist_item');
                if (card) card.remove();
                else ad.remove();
            }
        }
    }

    function releaseStaleScrollLock() {
        if (!removedPromptSinceLastUnlock) return;
        removedPromptSinceLastUnlock = false;

        requestAnimationFrame(() => {
            const visiblePrompt = [...document.querySelectorAll(PROMPT_SURFACE_SELECTOR)]
                .some((element) => isAppOrPushPrompt(element));
            if (visiblePrompt) return;

            for (const element of [document.documentElement, document.body]) {
                if (!element) continue;
                if (element.style.overflow === 'hidden') element.style.removeProperty('overflow');
                if (element.style.overflowY === 'hidden') element.style.removeProperty('overflow-y');
                if (element.style.position === 'fixed' && !element.style.top && !element.style.left) {
                    element.style.removeProperty('position');
                }
            }
        });
    }

    function startNativeCleanup() {
        window.addEventListener('beforeinstallprompt', (event) => event.preventDefault(), { capture: true });

        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element
                ? event.target.closest(`${APP_TRIGGER_SELECTOR},${EXPLICIT_APP_PROMO_SELECTOR}`)
                : null;
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            removeNode(target, true);
            releaseStaleScrollLock();
        }, true);
        document.documentElement.classList.add('jdml-native-cleanup');
        if (IS_SEARCH_RESULTS) document.documentElement.classList.add('jdml-ios-search');
        if (IS_ITEM_DETAIL) document.documentElement.classList.add('jdml-ios-item');
        injectStyle(NATIVE_CLEANUP_CSS, 'data-jdml-native-style');
        injectStyle(MOBILE_IOS_CSS, 'data-jdml-mobile-ios-style');
        if (IS_SEARCH_RESULTS) injectStyle(SEARCH_IOS_CSS, 'data-jdml-search-ios-style');
        if (IS_ITEM_DETAIL) injectStyle(ITEM_IOS_CSS, 'data-jdml-item-ios-style');
        cleanNativeRoot(document.documentElement);
        releaseStaleScrollLock();

        const pendingRoots = new Set();
        let scheduled = false;
        const flush = () => {
            scheduled = false;
            for (const root of pendingRoots) cleanNativeRoot(root);
            pendingRoots.clear();
            releaseStaleScrollLock();
        };

        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) pendingRoots.add(node);
                }
            }
            if (!scheduled && pendingRoots.size) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
        // Switching the system to dark while a page is open tags it then.
        DARK.addEventListener('change', () => toneTree(document));
        document.addEventListener('DOMContentLoaded', () => {
            toned = new WeakSet();
            cleanNativeRoot(document);
            releaseStaleScrollLock();
        }, { once: true });
        // pageshow fires after load, when every style sheet has applied; read the
        // dark-mode colours again then.
        window.addEventListener('pageshow', () => {
            toned = new WeakSet();
            cleanNativeRoot(document);
            releaseStaleScrollLock();
        });
    }

    if (!IS_HOME) {
        // Every non-home JD page gets the app-content cleanup. Search and item pages
        // additionally receive their scoped iOS presentation from startNativeCleanup().
        startNativeCleanup();
        return;
    }

    const SEARCH_ENDPOINT = 'https://so.m.jd.com/ware/search.action';
    const ORIGINAL_HOME = 'https://m.jd.com/?jdml=off';
    const STORAGE_KEY = 'jd-mobile-lite:recent-searches';
    const MAX_RECENT_SEARCHES = 8;

    const QUICK_SEARCHES = [
        '手机',
        '笔记本电脑',
        '耳机',
        '显示器',
        '家用电器',
        '日用品',
    ];

    const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>';
    const CLOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

    const CSS = `
        :root {
            color-scheme: light dark;
            --jdml-accent: #e1251b;
            --jdml-bg: #f5f5f7;
            --jdml-card: rgba(255, 255, 255, 0.88);
            --jdml-text: #18181a;
            --jdml-muted: #707076;
            --jdml-line: rgba(25, 25, 27, 0.09);
            --jdml-fill: rgba(118, 118, 128, 0.10);
            --jdml-shadow: 0 16px 42px rgba(0, 0, 0, 0.07);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
                         "PingFang SC", "Helvetica Neue", Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
        }

        html.jdml-pending body { opacity: 0 !important; }
        html.jdml-ready body { opacity: 1 !important; }
        html.jdml-ready body > :not(#jdml-root) { display: none !important; }

        * { box-sizing: border-box; }

        html,
        html.jdml-ready {
            min-height: 100%;
            background: var(--jdml-bg) !important;
        }

        body,
        html.jdml-ready body {
            min-height: 100svh;
            margin: 0;
            color: var(--jdml-text) !important;
            background:
                radial-gradient(circle at 88% -8%, rgba(225, 37, 27, 0.14), transparent 35%),
                var(--jdml-bg) !important;
            -webkit-font-smoothing: antialiased;
        }

        html.jdml-ready .jdml-page {
            color: var(--jdml-text) !important;
        }

        button, input { font: inherit; }
        a { color: inherit; text-decoration: none; -webkit-tap-highlight-color: transparent; }
        button { -webkit-tap-highlight-color: transparent; }
        svg {
            width: 1em;
            height: 1em;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .jdml-page {
            width: min(100%, 680px);
            margin: 0 auto;
            padding: max(18px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
        }

        .jdml-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 42px;
        }

        .jdml-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 17px;
            font-weight: 720;
        }

        .jdml-logo {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            color: #fff;
            background: var(--jdml-accent);
            box-shadow: 0 7px 18px rgba(225, 37, 27, 0.24);
            font-size: 13px;
            font-weight: 800;
        }

        .jdml-original-link,
        .jdml-text-button {
            border: 0;
            padding: 8px 9px;
            color: var(--jdml-muted);
            background: transparent;
            font-size: 13px;
            cursor: pointer;
        }

        .jdml-hero {
            padding: clamp(58px, 15vh, 112px) 2px 0;
        }

        .jdml-eyebrow {
            margin: 0 0 7px;
            color: var(--jdml-accent);
            font-size: 13px;
            font-weight: 750;
            letter-spacing: 0.08em;
        }

        .jdml-hero h1 {
            margin: 0 0 11px;
            font-size: clamp(36px, 11vw, 54px);
            line-height: 1.02;
            letter-spacing: -0.048em;
        }

        .jdml-lead {
            margin: 0 0 24px;
            color: var(--jdml-muted);
            font-size: 14px;
            line-height: 1.55;
        }

        .jdml-search {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            gap: 10px;
            padding: 7px 7px 7px 15px;
            border: 1px solid var(--jdml-line);
            border-radius: 20px;
            background: var(--jdml-card);
            box-shadow: var(--jdml-shadow);
            -webkit-backdrop-filter: blur(24px) saturate(160%);
            backdrop-filter: blur(24px) saturate(160%);
        }

        .jdml-search:focus-within {
            border-color: rgba(225, 37, 27, 0.40);
            box-shadow: 0 0 0 4px rgba(225, 37, 27, 0.09), var(--jdml-shadow);
        }

        .jdml-search-icon {
            display: grid;
            place-items: center;
            color: var(--jdml-muted);
            font-size: 21px;
        }

        .jdml-search input {
            width: 100%;
            min-width: 0;
            height: 43px;
            border: 0;
            outline: 0;
            color: var(--jdml-text);
            background: transparent;
            font-size: 16px;
        }

        .jdml-search input::placeholder {
            color: var(--jdml-muted);
            opacity: 0.80;
        }

        .jdml-search button {
            min-width: 66px;
            height: 43px;
            border: 0;
            border-radius: 14px;
            padding: 0 16px;
            color: #fff;
            background: var(--jdml-accent);
            font-weight: 720;
            cursor: pointer;
        }

        .jdml-search button:active,
        .jdml-chip:active { transform: scale(0.97); }

        .jdml-hint {
            min-height: 20px;
            margin: 9px 5px 0;
            color: var(--jdml-muted);
            font-size: 12px;
            line-height: 1.5;
        }

        .jdml-section {
            margin-top: 18px;
            padding: 16px;
            border: 1px solid var(--jdml-line);
            border-radius: 22px;
            background: var(--jdml-card);
            box-shadow: var(--jdml-shadow);
            -webkit-backdrop-filter: blur(24px) saturate(160%);
            backdrop-filter: blur(24px) saturate(160%);
        }

        .jdml-section[hidden] { display: none; }

        .jdml-section-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .jdml-section-title {
            display: flex;
            align-items: center;
            gap: 7px;
        }

        .jdml-section h2 {
            margin: 0;
            font-size: 16px;
            letter-spacing: -0.01em;
        }

        .jdml-heading-icon {
            display: grid;
            color: var(--jdml-muted);
            font-size: 17px;
        }

        .jdml-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 9px;
        }

        .jdml-chip {
            max-width: 100%;
            overflow: hidden;
            padding: 9px 13px;
            border-radius: 999px;
            color: var(--jdml-text) !important;
            background: var(--jdml-fill);
            font-size: 14px;
            text-overflow: ellipsis;
            white-space: nowrap;
            transition: transform 120ms ease;
        }

        .jdml-note {
            padding: 22px 8px 0;
            color: var(--jdml-muted);
            text-align: center;
            font-size: 12px;
            line-height: 1.6;
        }

        @media (max-width: 359px) {
            .jdml-page { padding-inline: 12px; }
            .jdml-search { gap: 7px; padding-left: 12px; }
            .jdml-search button { min-width: 60px; padding-inline: 12px; }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { transition: none !important; }
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --jdml-bg: #111113;
                --jdml-card: rgba(31, 31, 34, 0.88);
                --jdml-text: #f5f5f7;
                --jdml-muted: #a1a1a7;
                --jdml-line: rgba(255, 255, 255, 0.09);
                --jdml-fill: rgba(255, 255, 255, 0.075);
                --jdml-shadow: 0 18px 46px rgba(0, 0, 0, 0.25);
            }
        }
    `;

    function escapeHTML(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function makeSearchURL(keyword) {
        const url = new URL(SEARCH_ENDPOINT);
        url.searchParams.set('keyword', keyword.trim());
        return url.href;
    }

    function extractProductURL(value) {
        const text = value.trim();
        if (!/^https?:\/\//i.test(text)) return null;

        let url;
        try {
            url = new URL(text);
        } catch {
            return null;
        }

        const hostname = url.hostname.toLowerCase();
        let sku = null;

        if (hostname === 'item.jd.com') {
            sku = url.pathname.match(/\/(\d+)\.html(?:\/)?$/)?.[1] || null;
        } else if (hostname === 'item.m.jd.com') {
            sku = url.pathname.match(/\/product\/(\d+)\.html(?:\/)?$/)?.[1]
                || url.searchParams.get('wareId')
                || null;
        } else {
            return null;
        }

        if (!sku || !/^\d+$/.test(sku)) return null;
        return `https://item.m.jd.com/product/${sku}.html`;
    }

    function readRecentSearches() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(value)
                ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, MAX_RECENT_SEARCHES)
                : [];
        } catch {
            return [];
        }
    }

    function saveSearch(keyword) {
        const normalized = keyword.trim();
        if (!normalized || extractProductURL(normalized)) return;

        const searches = readRecentSearches().filter((item) => item !== normalized);
        searches.unshift(normalized);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
        } catch {
            // Search remains usable if storage is unavailable.
        }
    }

    function createSearchChip(keyword) {
        const link = document.createElement('a');
        link.className = 'jdml-chip';
        link.href = makeSearchURL(keyword);
        link.textContent = keyword;
        link.addEventListener('click', () => saveSearch(keyword));
        return link;
    }

    function renderRecentSearches() {
        const section = document.getElementById('jdml-recent');
        const list = document.getElementById('jdml-recent-list');
        if (!section || !list) return;

        const searches = readRecentSearches();
        section.hidden = searches.length === 0;
        list.replaceChildren(...searches.map(createSearchChip));
    }

    function updateDocumentMetadata() {
        document.documentElement.lang = 'zh-CN';
        document.title = '京东搜索';

        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            (document.head || document.documentElement).appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    }

    function buildPage() {
        const quickLinks = QUICK_SEARCHES
            .map((keyword) => `<a class="jdml-chip" href="${escapeHTML(makeSearchURL(keyword))}" data-keyword="${escapeHTML(keyword)}">${escapeHTML(keyword)}</a>`)
            .join('');

        const root = document.createElement('main');
        root.id = 'jdml-root';
        root.className = 'jdml-page';
        root.innerHTML = `
            <header class="jdml-header">
                <div class="jdml-brand" aria-label="京东精简搜索">
                    <span class="jdml-logo">JD</span>
                    <span>京东搜索</span>
                </div>
                <a class="jdml-original-link" href="${ORIGINAL_HOME}">原版首页</a>
            </header>

            <section class="jdml-hero" aria-labelledby="jdml-heading">
                <p class="jdml-eyebrow">SEARCH FIRST</p>
                <h1 id="jdml-heading">查找商品</h1>
                <p class="jdml-lead">搜索结果与商品详情页保持京东原生，不修改购买、评价或规格功能。</p>

                <form id="jdml-search-form" class="jdml-search" action="${SEARCH_ENDPOINT}" method="get" accept-charset="UTF-8" role="search">
                    <span class="jdml-search-icon">${SEARCH_ICON}</span>
                    <input id="jdml-search-input" name="keyword" type="search" inputmode="search"
                           enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
                           placeholder="搜索商品，或粘贴商品链接" aria-label="搜索京东商品">
                    <button id="jdml-search-button" type="submit">搜索</button>
                </form>
                <p id="jdml-search-hint" class="jdml-hint" aria-live="polite">也可粘贴京东商品链接直接打开。</p>
            </section>

            <section id="jdml-recent" class="jdml-section" hidden>
                <div class="jdml-section-heading">
                    <div class="jdml-section-title">
                        <span class="jdml-heading-icon">${CLOCK_ICON}</span>
                        <h2>最近搜索</h2>
                    </div>
                    <button id="jdml-clear-recent" class="jdml-text-button" type="button">清空</button>
                </div>
                <div id="jdml-recent-list" class="jdml-chips"></div>
            </section>

            <section class="jdml-section">
                <div class="jdml-section-heading">
                    <div class="jdml-section-title"><h2>快速搜索</h2></div>
                </div>
                <div class="jdml-chips">${quickLinks}</div>
            </section>

            <p class="jdml-note">首页不加载广告、活动会场或无限推荐流。</p>
        `;
        return root;
    }

    function attachEvents() {
        const form = document.getElementById('jdml-search-form');
        const input = document.getElementById('jdml-search-input');
        const button = document.getElementById('jdml-search-button');
        const hint = document.getElementById('jdml-search-hint');
        const clearButton = document.getElementById('jdml-clear-recent');

        const updateInputMode = () => {
            const productURL = extractProductURL(input?.value || '');
            if (button) button.textContent = productURL ? '打开' : '搜索';
            if (hint) {
                hint.textContent = productURL
                    ? '已识别京东商品链接，将直接打开商品详情。'
                    : '也可粘贴京东商品链接直接打开。';
            }
        };

        input?.addEventListener('input', updateInputMode);

        form?.addEventListener('submit', (event) => {
            const value = input?.value.trim() || '';
            if (!value) {
                event.preventDefault();
                input?.focus();
                return;
            }

            const productURL = extractProductURL(value);
            if (productURL) {
                event.preventDefault();
                location.assign(productURL);
                return;
            }

            // Keep the form's native GET navigation as the primary search path.
            // The handler only records history; even if it later fails, searching still works.
            saveSearch(value);
        });

        clearButton?.addEventListener('click', () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {
                // Ignore storage errors.
            }
            renderRecentSearches();
        });

        document.querySelectorAll('.jdml-chip[data-keyword]').forEach((link) => {
            link.addEventListener('click', () => saveSearch(link.dataset.keyword || ''));
        });
    }

    function addStyles() {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(CSS);
            return;
        }

        const style = document.createElement('style');
        style.textContent = CSS;
        document.documentElement.appendChild(style);
    }

    function mount() {
        if (!document.body) return false;

        try {
            // Stop the promotional homepage as early as the browser permits.
            window.stop();
        } catch {
            // The replacement still works when window.stop() is unavailable.
        }

        updateDocumentMetadata();
        const root = buildPage();
        document.body.replaceChildren(root);

        document.documentElement.classList.remove('jdml-pending');
        document.documentElement.classList.add('jdml-ready');

        attachEvents();
        renderRecentSearches();

        // Remove late homepage nodes from scripts that had already started.
        const observer = new MutationObserver(() => {
            for (const child of [...document.body.children]) {
                if (child !== root) child.remove();
            }
        });
        observer.observe(document.body, { childList: true });

        return true;
    }

    document.documentElement.classList.add('jdml-pending');
    addStyles();

    // Never leave the page hidden if JD changes its document boot sequence.
    const visibilityFailSafe = setTimeout(() => {
        document.documentElement.classList.remove('jdml-pending');
    }, 1500);

    if (mount()) {
        clearTimeout(visibilityFailSafe);
        return;
    }

    const bootObserver = new MutationObserver(() => {
        if (mount()) {
            clearTimeout(visibilityFailSafe);
            bootObserver.disconnect();
        }
    });

    bootObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
