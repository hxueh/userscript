// ==UserScript==
// @name         Taobao & Tmall Mobile Lite
// @namespace    https://github.com/hxueh
// @version      0.1.1
// @description  A minimal, search-first interface across Taobao and Tmall mobile subdomains with iOS-style item pages and fewer app prompts, overlays, ads, and recommendations.
// @author       hxueh
// @license      MIT
// @homepageURL  https://github.com/hxueh
// @supportURL   https://github.com/hxueh
// @match        https://m.taobao.com/*
// @match        https://main.m.taobao.com/*
// @match        https://pages-g.m.taobao.com/*
// @match        https://s.m.taobao.com/*
// @match        https://*.m.taobao.com/*
// @match        https://item.taobao.com/*
// @match        https://m.tmall.com/*
// @match        https://*.m.tmall.com/*
// @match        https://detail.tmall.com/*
// @match        https://*.detail.tmall.com/*
// @match        https://list.tmall.com/*
// @match        https://pages.tmall.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const SCRIPT_ID = 'tbml';
    const ROOT_ID = `${SCRIPT_ID}-root`;
    const STYLE_ID = `${SCRIPT_ID}-style`;
    const ORIGINAL_PARAM = 'tbml';
    const ORIGINAL_VALUE = 'off';

    const APP_SCHEMES = /^(?:tbopen|taobao|tmall):\/\//i;
    const WEB_URL = /^https?:\/\//i;
    const APP_PROMPT_TEXT = /(?:打开|下载|唤起|启动|前往).{0,8}(?:淘宝|天猫).{0,8}(?:app|客户端)|(?:淘宝|天猫).{0,8}(?:app|客户端).{0,8}(?:打开|下载|查看)|app\s*内打开|立即打开\s*app/i;
    const PROMO_TEXT = /红包|签到|新人礼|新人专享|领券中心|活动弹窗|限时福利|惊喜礼包/i;
    const LOGIN_OR_SECURITY_TEXT = /登录|注册|验证码|滑块|安全验证|隐私政策|用户协议/i;
    const DETAIL_PURCHASE_TEXT = /加入购物车|立即购买|去购买|领券购买|马上抢|单独购买|发起拼单|结算|仅支持在客户端购买/i;
    const DETAIL_PRIMARY_ACTION_TEXT = /立即购买|去购买|领券购买|马上抢|单独购买|发起拼单/i;
    const DETAIL_SECONDARY_ACTION_TEXT = /加入购物车/i;
    // Shown instead of the buy button on items that can only be bought in the app.
    const DETAIL_NOTICE_ACTION_TEXT = /仅支持在客户端购买/;
    // Buttons and links that only push the visitor into the app. Matched on a whole text node.
    const APP_ENTRY_TEXT = /^(?:打开手机淘宝查看(?:更多图文详情|全部|更多)?|打开(?:手机)?(?:淘宝|天猫)(?:app)?|去(?:淘宝|天猫)(?:app)?查看更多)\s*[>›»]?$/i;
    const DETAIL_ICON_ACTION_TEXT = /^(?:客服|店铺|购物车|收藏|分享)$/;
    const DETAIL_ROW_TEXT = /^(?:已选|选择|规格|发货|配送|运费|送至|服务|保障|参数|优惠|促销|活动|数量|尺码|颜色|版本|套餐)/;

    const DIRECT_REMOVE_SELECTORS = [
        '#J_smartBanner',
        '.smartbanner',
        '[class*="smart-banner" i]',
        '[class*="smartBanner"]',
        '[class*="SmartBanner"]',
        '[class*="open-app" i]',
        '[class*="openApp"]',
        '[class*="OpenApp"]',
        '[class*="download-app" i]',
        '[class*="downloadApp"]',
        '[class*="DownloadApp"]',
        '[class*="download-bar" i]',
        '[class*="downloadBar"]',
        '[class*="call-app" i]',
        '[class*="callApp"]',
        '[class*="app-call" i]',
        '[class*="wake-app" i]',
        '[class*="wakeApp"]',
        '[class*="WakeApp"]',
        '[class*="app-guide" i]',
        '[class*="appGuide"]',
        '[class*="AppGuide"]',
        '[class*="app-banner" i]',
        '[class*="appBanner"]',
        '[class*="AppBanner"]',
        '[id*="openApp" i]',
        '[id*="downloadApp" i]',
        '[id*="callApp" i]',
        '[data-action*="openapp" i]',
        '[data-action*="downloadapp" i]',
        '[data-type*="openapp" i]',
        '[data-spm*="appdownload" i]',
        '[class*="index_module_redPacket"]',
        '[class*="RedPacketReminderWrapper"]',
        '[class*="basic-pop-tmp1-wrapper"]',
        '[class*="custom-pop-tmp1-wrapper"]',
        '[id*="TBPC_POP_home"]'
    ];

    const CANDIDATE_SELECTORS = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[class*="modal" i]',
        '[class*="popup" i]',
        '[class*="pop-wrap" i]',
        '[class*="mask" i]',
        '[class*="overlay" i]',
        '[class*="float" i]',
        '[style*="position: fixed" i]'
    ];

    let observer;
    let cleanupScheduled = false;
    let lastUrl = location.href;
    let contentDetail = false;

    function addStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --tbml-tint: #ff5000;
                --tbml-tint-pressed: #e24600;
                --tbml-red: #ff3b30;
                --tbml-orange: #ff9500;
                --tbml-bg: #f2f2f7;
                --tbml-card: rgba(255, 255, 255, 0.72);
                --tbml-fill: rgba(120, 120, 128, 0.12);
                --tbml-text: #1c1c1e;
                --tbml-secondary: rgba(60, 60, 67, 0.6);
                --tbml-border: rgba(60, 60, 67, 0.12);
                --tbml-glass: rgba(255, 255, 255, 0.64);
                --tbml-glass-edge: rgba(255, 255, 255, 0.78);
                --tbml-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                --tbml-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
            }

            /* Liquid Glass surface shared by the search capsule, top bar and buy bar. */
            .tbml-glass,
            html.tbml-detail .tbml-ios-topbar,
            html.tbml-detail .tbml-ios-buybar {
                background: var(--tbml-glass) !important;
                -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
                backdrop-filter: blur(28px) saturate(180%) !important;
                box-shadow:
                    inset 0 1px 0 var(--tbml-glass-edge),
                    inset 0 0 0 0.5px var(--tbml-glass-edge),
                    var(--tbml-glass-shadow) !important;
            }

            html.tbml-home,
            html.tbml-home body {
                min-height: 100% !important;
                margin: 0 !important;
                background: var(--tbml-bg) !important;
                color: var(--tbml-text) !important;
                font-family: var(--tbml-font) !important;
                overflow: auto !important;
                overscroll-behavior: none;
                -webkit-text-size-adjust: 100%;
            }

            html.tbml-home body > :not(#${ROOT_ID}):not(script):not(style):not(link) {
                display: none !important;
            }

            #${ROOT_ID} {
                box-sizing: border-box;
                position: relative;
                z-index: 2147483647;
                min-height: 100svh;
                padding:
                    max(24px, env(safe-area-inset-top))
                    max(18px, env(safe-area-inset-right))
                    max(28px, env(safe-area-inset-bottom))
                    max(18px, env(safe-area-inset-left));
                display: grid;
                place-items: center;
                background:
                    radial-gradient(60% 42% at 18% 6%, rgba(255, 149, 0, 0.20), transparent 70%),
                    radial-gradient(56% 40% at 86% 14%, rgba(255, 59, 48, 0.16), transparent 70%),
                    var(--tbml-bg);
            }

            .tbml-shell {
                box-sizing: border-box;
                width: min(100%, 560px);
                margin: auto;
            }

            .tbml-brand {
                margin: 0 0 26px;
                text-align: center;
            }

            .tbml-brand-title {
                margin: 0;
                font-size: clamp(34px, 11vw, 52px);
                font-weight: 700;
                letter-spacing: -0.04em;
                line-height: 1.05;
            }

            .tbml-brand-subtitle {
                margin: 10px 0 0;
                color: var(--tbml-secondary);
                font-size: 15px;
                line-height: 1.4;
            }

            .tbml-search-form {
                box-sizing: border-box;
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 60px;
                padding: 6px 6px 6px 18px;
                border-radius: 999px;
            }

            .tbml-search-form:focus-within {
                box-shadow:
                    inset 0 1px 0 var(--tbml-glass-edge),
                    0 0 0 3px rgba(255, 80, 0, 0.28),
                    var(--tbml-glass-shadow);
            }

            .tbml-search-glyph {
                flex: none;
                width: 20px;
                height: 20px;
                color: var(--tbml-secondary);
            }

            .tbml-search-input {
                box-sizing: border-box;
                flex: 1;
                width: 100%;
                min-width: 0;
                min-height: 46px;
                padding: 0;
                border: 0;
                outline: none;
                background: transparent;
                color: var(--tbml-text);
                font: inherit;
                font-size: 17px;
                -webkit-appearance: none;
                appearance: none;
            }

            .tbml-search-input::placeholder {
                color: var(--tbml-secondary);
            }

            .tbml-search-button {
                flex: none;
                min-width: 72px;
                min-height: 46px;
                padding: 0 20px;
                border: 0;
                border-radius: 999px;
                background: var(--tbml-tint);
                color: #fff;
                font: inherit;
                font-size: 16px;
                font-weight: 600;
                -webkit-appearance: none;
                appearance: none;
                touch-action: manipulation;
                transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1), background 0.18s;
            }

            .tbml-search-button:active {
                background: var(--tbml-tint-pressed);
                transform: scale(0.95);
            }

            .tbml-links {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
                margin-top: 14px;
            }

            .tbml-link {
                box-sizing: border-box;
                min-height: 76px;
                padding: 12px 6px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border-radius: 22px;
                background: var(--tbml-glass);
                -webkit-backdrop-filter: blur(24px) saturate(170%);
                backdrop-filter: blur(24px) saturate(170%);
                box-shadow: inset 0 1px 0 var(--tbml-glass-edge), 0 4px 18px rgba(0, 0, 0, 0.06);
                color: var(--tbml-text);
                text-align: center;
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                touch-action: manipulation;
                transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1), background 0.18s;
            }

            .tbml-link svg {
                width: 24px;
                height: 24px;
                color: var(--tbml-tint);
            }

            .tbml-link:active {
                background: var(--tbml-fill);
                transform: scale(0.96);
            }

            .tbml-original-link {
                width: fit-content;
                margin: 22px auto 0;
                display: block;
                color: var(--tbml-secondary);
                text-decoration: none;
                font-size: 13px;
            }

            #tbml-enable-button {
                position: fixed;
                right: max(14px, env(safe-area-inset-right));
                bottom: max(18px, env(safe-area-inset-bottom));
                z-index: 2147483647;
                min-height: 44px;
                padding: 0 18px;
                border: 0;
                border-radius: 999px;
                color: var(--tbml-text);
                font: 600 14px/1 var(--tbml-font);
                touch-action: manipulation;
            }

            html.tbml-search,
            html.tbml-search body,
            html.tbml-detail,
            html.tbml-detail body {
                background: var(--tbml-bg) !important;
            }

            html.tbml-search body,
            html.tbml-detail body {
                padding-bottom: env(safe-area-inset-bottom);
            }

            html.tbml-detail,
            html.tbml-detail body {
                color: var(--tbml-text) !important;
                font-family: var(--tbml-font) !important;
                -webkit-text-size-adjust: 100%;
            }

            html.tbml-detail body {
                box-sizing: border-box;
                /* Room for the floating buy bar so the last row is never covered. */
                padding-bottom: calc(104px + env(safe-area-inset-bottom)) !important;
            }

            html.tbml-detail *,
            html.tbml-detail *::before,
            html.tbml-detail *::after {
                -webkit-tap-highlight-color: transparent;
            }

            html.tbml-detail .tbml-ios-gallery {
                overflow: hidden !important;
                border-radius: 0 0 28px 28px !important;
                background: #fff !important;
                box-shadow: 0 10px 34px rgba(0, 0, 0, 0.08) !important;
                isolation: isolate;
            }

            html.tbml-detail .tbml-ios-gallery img,
            html.tbml-detail .tbml-ios-gallery video,
            html.tbml-detail .tbml-ios-gallery canvas {
                display: block;
                max-width: 100%;
            }

            /* Grouped, inset cards like Settings: continuous corners and a hairline edge. */
            html.tbml-detail .tbml-ios-card {
                box-sizing: border-box !important;
                margin: 12px max(12px, env(safe-area-inset-left)) !important;
                border: 0 !important;
                border-radius: 22px !important;
                background: var(--tbml-card) !important;
                box-shadow: inset 0 0 0 0.5px var(--tbml-border), 0 2px 14px rgba(0, 0, 0, 0.04) !important;
                -webkit-backdrop-filter: blur(24px) saturate(150%);
                backdrop-filter: blur(24px) saturate(150%);
                overflow: hidden;
            }

            html.tbml-detail .tbml-ios-row {
                box-sizing: border-box !important;
                min-height: 48px;
                margin: 8px max(12px, env(safe-area-inset-left)) !important;
                padding: 12px 16px !important;
                border: 0 !important;
                border-radius: 18px !important;
                background: var(--tbml-card) !important;
                box-shadow: inset 0 0 0 0.5px var(--tbml-border) !important;
            }

            /* A row inside a card becomes a flat list cell separated by a hairline. */
            html.tbml-detail .tbml-ios-card .tbml-ios-row {
                margin: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                border-top: 0.5px solid var(--tbml-border) !important;
            }

            html.tbml-detail .tbml-ios-price {
                color: var(--tbml-red) !important;
                font-size: clamp(26px, 7.4vw, 34px) !important;
                font-weight: 700 !important;
                letter-spacing: -0.03em !important;
                line-height: 1.12 !important;
                font-variant-numeric: tabular-nums;
            }

            html.tbml-detail .tbml-ios-title {
                color: var(--tbml-text) !important;
                font-size: 17px !important;
                font-weight: 600 !important;
                letter-spacing: -0.01em !important;
                line-height: 1.4 !important;
            }

            html.tbml-detail .tbml-ios-topbar {
                box-sizing: border-box !important;
                top: 0 !important;
                min-height: calc(48px + env(safe-area-inset-top)) !important;
                padding-top: env(safe-area-inset-top) !important;
                border-bottom: 0.5px solid var(--tbml-border) !important;
            }

            html.tbml-detail .tbml-ios-topbar a,
            html.tbml-detail .tbml-ios-topbar button,
            html.tbml-detail .tbml-ios-topbar [role="button"] {
                border-radius: 999px !important;
            }

            /* Floating glass capsule that hovers above the home indicator. */
            html.tbml-detail .tbml-ios-buybar {
                box-sizing: border-box !important;
                left: max(12px, env(safe-area-inset-left)) !important;
                right: max(12px, env(safe-area-inset-right)) !important;
                bottom: calc(10px + env(safe-area-inset-bottom)) !important;
                width: auto !important;
                min-height: 64px !important;
                padding: 8px 8px 8px 10px !important;
                border: 0 !important;
                border-radius: 32px !important;
                z-index: 2147483000 !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }

            html.tbml-detail .tbml-ios-buybar a,
            html.tbml-detail .tbml-ios-buybar button,
            html.tbml-detail .tbml-ios-buybar [role="button"] {
                box-sizing: border-box;
                min-height: 48px;
                font-family: inherit !important;
                touch-action: manipulation;
                transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1), filter 0.18s;
            }

            html.tbml-detail .tbml-ios-action-primary,
            html.tbml-detail .tbml-ios-action-secondary {
                flex: 1 1 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 !important;
                padding: 0 8px !important;
                border: 0 !important;
                border-radius: 999px !important;
                color: #fff !important;
                font-size: 15px !important;
                font-weight: 600 !important;
                white-space: nowrap !important;
            }

            html.tbml-detail .tbml-ios-action-primary {
                background: var(--tbml-red) !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 4px 14px rgba(255, 59, 48, 0.30) !important;
            }

            html.tbml-detail .tbml-ios-action-secondary {
                background: var(--tbml-orange) !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 4px 14px rgba(255, 149, 0, 0.28) !important;
            }

            /* App-only items: keep the explanation but make it read as a disabled control. */
            html.tbml-detail .tbml-ios-action-notice {
                flex: 1 1 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 !important;
                padding: 0 12px !important;
                border: 0 !important;
                border-radius: 999px !important;
                background: var(--tbml-fill) !important;
                color: var(--tbml-secondary) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                white-space: nowrap !important;
                box-shadow: none !important;
            }

            .tbml-hidden {
                display: none !important;
            }

            /* Icon actions behave like tab-bar items: stacked glyph and label, no fill. */
            html.tbml-detail .tbml-ios-action-icon {
                flex: none !important;
                min-width: 40px !important;
                display: inline-flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 2px !important;
                margin: 0 !important;
                padding: 0 2px !important;
                border: 0 !important;
                border-radius: 14px !important;
                white-space: nowrap !important;
                background: transparent !important;
                box-shadow: none !important;
                color: var(--tbml-text) !important;
                font-size: 11px !important;
                font-weight: 500 !important;
                line-height: 1.2 !important;
            }

            html.tbml-detail .tbml-ios-action-primary:active,
            html.tbml-detail .tbml-ios-action-secondary:active,
            html.tbml-detail .tbml-ios-action-icon:active {
                filter: brightness(0.92);
                transform: scale(0.95);
            }

            ${DIRECT_REMOVE_SELECTORS.join(',\n')} {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --tbml-bg: #000;
                    --tbml-card: rgba(44, 44, 46, 0.72);
                    --tbml-fill: rgba(120, 120, 128, 0.28);
                    --tbml-text: #f5f5f7;
                    --tbml-secondary: rgba(235, 235, 245, 0.6);
                    --tbml-border: rgba(255, 255, 255, 0.14);
                    --tbml-glass: rgba(44, 44, 46, 0.58);
                    --tbml-glass-edge: rgba(255, 255, 255, 0.16);
                    --tbml-glass-shadow: 0 10px 36px rgba(0, 0, 0, 0.5);
                }

                #${ROOT_ID} {
                    background:
                        radial-gradient(60% 42% at 18% 6%, rgba(255, 149, 0, 0.16), transparent 70%),
                        radial-gradient(56% 40% at 86% 14%, rgba(255, 59, 48, 0.14), transparent 70%),
                        var(--tbml-bg);
                }

                html.tbml-detail .tbml-ios-gallery {
                    background: #1c1c1e !important;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function isTaobaoMobileHost(host = location.hostname.toLowerCase()) {
        return host === 'm.taobao.com' || host.endsWith('.m.taobao.com');
    }

    function isTmallMobileHost(host = location.hostname.toLowerCase()) {
        return host === 'm.tmall.com' || host.endsWith('.m.tmall.com');
    }

    function isTmallPage() {
        const host = location.hostname.toLowerCase();
        return host === 'tmall.com' || host.endsWith('.tmall.com');
    }

    function isHomePage() {
        const host = location.hostname.toLowerCase();
        const path = location.pathname.replace(/\/+$/, '') || '/';
        const homePath = path === '/' || path === '/index.htm' || path === '/index.html';
        const taobaoHome = host === 'm.taobao.com' || host === 'main.m.taobao.com';
        const tmallHome = host === 'm.tmall.com' || host === 'main.m.tmall.com';
        return homePath && (taobaoHome || tmallHome);
    }

    function isSearchPage() {
        const host = location.hostname.toLowerCase();
        const path = location.pathname.toLowerCase();
        const mobileSearchPath = /\/(?:search|searchlist)(?:[/.]|$)/.test(path);
        return host === 's.m.taobao.com' ||
            host === 's.m.tmall.com' ||
            host === 'list.m.tmall.com' ||
            (host === 'list.tmall.com' && path.includes('/search_product')) ||
            (isTaobaoMobileHost(host) && mobileSearchPath) ||
            (isTmallMobileHost(host) && mobileSearchPath);
    }

    function isDetailPage() {
        const host = location.hostname.toLowerCase();
        const path = location.pathname.toLowerCase();
        return contentDetail ||
            host === 'item.taobao.com' ||
            host === 'detail.m.tmall.com' ||
            host === 'detail.tmall.com' ||
            host.endsWith('.detail.tmall.com') ||
            (isTaobaoMobileHost(host) && (path.includes('/detail') || path.includes('/awp/core/detail'))) ||
            (isTmallMobileHost(host) && path.includes('/detail'));
    }

    function getSiteConfig() {
        if (isTmallPage()) {
            return {
                name: '天猫',
                subtitle: '搜索天猫商品，不看首页信息流',
                searchAction: 'https://list.tmall.com/search_product.htm',
                placeholder: '搜索天猫商品',
                searchLabel: '搜索天猫商品'
            };
        }

        return {
            name: '淘宝',
            subtitle: '搜索商品，不看首页信息流',
            searchAction: 'https://s.m.taobao.com/h5',
            placeholder: '搜索淘宝商品',
            searchLabel: '搜索淘宝商品'
        };
    }

    function originalModeRequested() {
        return new URL(location.href).searchParams.get(ORIGINAL_PARAM) === ORIGINAL_VALUE;
    }

    function withOriginalMode(urlString) {
        const url = new URL(urlString);
        url.searchParams.set(ORIGINAL_PARAM, ORIGINAL_VALUE);
        return url.href;
    }

    function withoutOriginalMode(urlString) {
        const url = new URL(urlString);
        url.searchParams.delete(ORIGINAL_PARAM);
        return url.href;
    }

    function createMinimalHome() {
        if (!isHomePage() || originalModeRequested() || document.getElementById(ROOT_ID)) return;
        if (!document.body) return;

        document.documentElement.classList.add('tbml-home');

        const site = getSiteConfig();
        const root = document.createElement('main');
        root.id = ROOT_ID;
        root.innerHTML = `
            <section class="tbml-shell" aria-label="${escapeHtml(site.name)} Mobile Lite">
                <header class="tbml-brand">
                    <h1 class="tbml-brand-title">${escapeHtml(site.name)}</h1>
                    <p class="tbml-brand-subtitle">${escapeHtml(site.subtitle)}</p>
                </header>

                <div>
                    <form class="tbml-search-form tbml-glass" action="${escapeHtml(site.searchAction)}" method="get" role="search">
                        <svg class="tbml-search-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
                        <input
                            class="tbml-search-input"
                            type="search"
                            name="q"
                            enterkeyhint="search"
                            autocomplete="off"
                            autocapitalize="none"
                            spellcheck="false"
                            placeholder="${escapeHtml(site.placeholder)}"
                            aria-label="${escapeHtml(site.searchLabel)}"
                        >
                        <button class="tbml-search-button" type="submit">搜索</button>
                    </form>

                    <nav class="tbml-links" aria-label="快捷入口">
                        <a class="tbml-link" href="https://main.m.taobao.com/cart/index.html">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>
                            购物车
                        </a>
                        <a class="tbml-link" href="https://tm.m.taobao.com/list.htm?OrderListType=total_orders">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>
                            订单
                        </a>
                        <a class="tbml-link" href="https://h5.m.taobao.com/mlapp/mytaobao.html">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>
                            我的淘宝
                        </a>
                    </nav>
                </div>

                <a class="tbml-original-link" href="${escapeHtml(withOriginalMode(location.href))}">临时显示原版首页</a>
            </section>
        `;

        document.body.appendChild(root);
        const input = root.querySelector('.tbml-search-input');
        window.setTimeout(() => input?.focus({ preventScroll: true }), 80);
    }

    function createEnableButton() {
        if (!isHomePage() || !originalModeRequested() || !document.body) return;
        if (document.getElementById('tbml-enable-button')) return;

        const button = document.createElement('button');
        button.id = 'tbml-enable-button';
        button.className = 'tbml-glass';
        button.type = 'button';
        button.textContent = '精简首页';
        button.addEventListener('click', () => {
            location.href = withoutOriginalMode(location.href);
        });
        document.body.appendChild(button);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function removeDirectMatches(root = document) {
        let removed = false;
        for (const selector of DIRECT_REMOVE_SELECTORS) {
            let elements;
            try {
                elements = root.querySelectorAll(selector);
            } catch {
                continue;
            }
            for (const element of elements) {
                if (element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) continue;
                element.remove();
                removed = true;
            }
        }
        return removed;
    }

    function isOverlayLike(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.matches('[role="dialog"], [aria-modal="true"]')) return true;

        const marker = `${element.id} ${element.className}`.toLowerCase();
        if (/modal|popup|pop-wrap|overlay|mask|dialog|float/.test(marker)) return true;

        const style = getComputedStyle(element);
        const zIndex = Number.parseInt(style.zIndex, 10);
        return (style.position === 'fixed' || style.position === 'sticky') &&
            (Number.isFinite(zIndex) ? zIndex >= 20 : true);
    }

    function normalizedText(element) {
        return (element.innerText || element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
    }

    function removeTextMatchedOverlays(root = document) {
        const selector = CANDIDATE_SELECTORS.join(',');
        let candidates;
        try {
            candidates = root.querySelectorAll(selector);
        } catch {
            return false;
        }

        let removed = false;
        let inspected = 0;
        for (const element of candidates) {
            if (++inspected > 300) break;
            if (!(element instanceof HTMLElement) || !element.isConnected) continue;
            if (element.id === ROOT_ID || element.closest(`#${ROOT_ID}`)) continue;
            if (!isOverlayLike(element)) continue;

            const text = normalizedText(element);
            if (!text || LOGIN_OR_SECURITY_TEXT.test(text)) continue;

            const appPrompt = APP_PROMPT_TEXT.test(text);
            const promotion = PROMO_TEXT.test(text);
            if (!appPrompt && !promotion) continue;

            element.remove();
            removed = true;
        }
        return removed;
    }

    function removeNonessentialBottomNav(root = document) {
        if (!isSearchPage()) return false;

        let candidates;
        try {
            candidates = root.querySelectorAll('nav, footer, [class*="bottom" i], [class*="tabbar" i], [class*="tab-bar" i]');
        } catch {
            return false;
        }

        let removed = false;
        for (const element of candidates) {
            if (!(element instanceof HTMLElement) || !element.isConnected) continue;
            const text = normalizedText(element);
            if (!text || /加入购物车|立即购买|购买|结算/.test(text)) continue;

            const matches = ['首页', '消息', '购物车', '我的淘宝', '我的'].filter(label => text.includes(label)).length;
            if (matches < 3) continue;

            const style = getComputedStyle(element);
            if (style.position !== 'fixed' && style.position !== 'sticky') continue;
            element.remove();
            removed = true;
        }
        return removed;
    }

    function elementMarker(element) {
        return `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
    }

    function visibleElementRect(element) {
        if (!(element instanceof HTMLElement) || !element.isConnected) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
        return { rect, style };
    }

    function queryElements(root, selector, limit = 1200) {
        let elements;
        try {
            elements = root.querySelectorAll(selector);
        } catch {
            return [];
        }
        return [...elements].slice(0, limit);
    }

    function clickableForLabel(element, boundary = null) {
        const clickable = element.closest('button, a, [role="button"], [onclick], [class*="button" i], [class*="btn" i]');
        if (!clickable) return element;
        if (boundary && !boundary.contains(clickable)) return element;
        return clickable;
    }

    function styleDetailTopBar(root = document) {
        const candidates = queryElements(
            root,
            'header, nav, [class*="header" i], [class*="navbar" i], [class*="nav-bar" i], [class*="topbar" i], [class*="top-bar" i], [style*="position: fixed" i], [style*="position: sticky" i]',
            240
        );

        for (const element of candidates) {
            if (element.classList.contains('tbml-ios-buybar')) continue;
            const visual = visibleElementRect(element);
            if (!visual) continue;
            const { rect, style } = visual;
            const text = normalizedText(element);
            const marker = elementMarker(element);
            const anchored = style.position === 'fixed' || style.position === 'sticky';
            const namedTopBar = /header|navbar|nav-bar|topbar|top-bar|navigation/.test(marker);
            const topAligned = rect.top <= Math.max(70, window.innerHeight * 0.08);
            const compact = rect.height <= 128 && rect.width >= window.innerWidth * 0.68;
            if (!compact || !topAligned || (!anchored && !namedTopBar) || DETAIL_PURCHASE_TEXT.test(text)) continue;

            element.classList.add('tbml-ios-topbar');
            return true;
        }
        return false;
    }

    function styleDetailBuyBar(root = document) {
        // Class names on the mobile pages are hashed, so match structurally: any block that
        // holds a purchase label and is pinned to (or sits at) the bottom of the screen.
        const candidates = queryElements(root, 'footer, nav, section, div', 2000);

        let changed = false;
        for (const element of candidates) {
            // textContent is cheap; innerText forces layout, so only ask for it after this.
            if (!DETAIL_PURCHASE_TEXT.test(element.textContent || '')) continue;
            if (element.closest('.tbml-ios-buybar')) continue;
            const text = normalizedText(element);
            if (!DETAIL_PURCHASE_TEXT.test(text)) continue;
            const visual = visibleElementRect(element);
            if (!visual) continue;
            const { rect, style } = visual;
            const nearBottom = rect.bottom >= window.innerHeight - 48 || rect.top >= window.innerHeight * 0.62;
            const anchored = style.position === 'fixed' || style.position === 'sticky';
            if (rect.width < window.innerWidth * 0.68 || rect.height > 220 || (!anchored && !nearBottom)) continue;

            element.classList.add('tbml-ios-buybar');
            changed = true;

            const labels = queryElements(element, 'button, a, [role="button"], span, div', 280);
            for (const label of labels) {
                const labelText = normalizedText(label);
                if (!labelText || labelText.length > 18) continue;
                const action = clickableForLabel(label, element);
                // A wrapper and its inner label both carry the text; style only the outer one.
                if (action.parentElement?.closest('[class*="tbml-ios-action-"]')) continue;
                if (DETAIL_NOTICE_ACTION_TEXT.test(labelText)) {
                    action.classList.add('tbml-ios-action-notice');
                } else if (DETAIL_SECONDARY_ACTION_TEXT.test(labelText)) {
                    action.classList.add('tbml-ios-action-secondary');
                } else if (DETAIL_PRIMARY_ACTION_TEXT.test(labelText)) {
                    action.classList.add('tbml-ios-action-primary');
                } else if (DETAIL_ICON_ACTION_TEXT.test(labelText)) {
                    action.classList.add('tbml-ios-action-icon');
                }
            }
        }
        return changed;
    }

    function styleDetailGallery(root = document) {
        const candidates = [];
        for (const element of queryElements(root, '[class*="swiper" i], [class*="carousel" i], [class*="gallery" i], [class*="slider" i], [class*="banner" i], [class*="pic" i], [class*="image" i]', 500)) {
            const visual = visibleElementRect(element);
            if (!visual) continue;
            const { rect, style } = visual;
            if (style.position === 'fixed' || style.position === 'sticky') continue;
            if (rect.top > window.innerHeight * 1.05 || rect.width < window.innerWidth * 0.76 || rect.height < 180) continue;
            if (DETAIL_PURCHASE_TEXT.test(normalizedText(element))) continue;
            candidates.push({ element, area: rect.width * rect.height, rect });
        }

        for (const image of queryElements(root, 'img, video, canvas', 320)) {
            const visual = visibleElementRect(image);
            if (!visual) continue;
            const { rect } = visual;
            if (rect.top > window.innerHeight || rect.width < window.innerWidth * 0.72 || rect.height < 180) continue;
            const container = image.closest('[class*="swiper" i], [class*="carousel" i], [class*="gallery" i], [class*="slider" i]') || image.parentElement;
            if (!container) continue;
            const containerVisual = visibleElementRect(container);
            if (!containerVisual) continue;
            candidates.push({ element: container, area: containerVisual.rect.width * containerVisual.rect.height, rect: containerVisual.rect });
        }

        candidates.sort((a, b) => b.area - a.area);
        const gallery = candidates.find(({ element }) => !element.closest('.tbml-ios-topbar, .tbml-ios-buybar'));
        if (!gallery) return false;
        gallery.element.classList.add('tbml-ios-gallery');
        return true;
    }

    function styleDetailTypography(root = document) {
        const viewportHeight = Math.max(window.innerHeight, 640);
        let changed = false;
        let prices = 0;
        let titles = 0;

        // Walk in document order, but let the innermost match win: a wrapper such as
        // `.price-box` is marked first, then handed over to its inner `.price` below.
        // Otherwise both would be styled and the price would be scaled twice.
        const claim = (element, cls) => {
            const outer = element.parentElement?.closest(`.${cls}`);
            if (outer) {
                outer.classList.remove(cls);
                return cls === 'tbml-ios-price' ? --prices : --titles;
            }
            return null;
        };

        for (const element of queryElements(root, 'h1, h2, h3, p, span, div, [class*="price" i], [class*="title" i]', 1500)) {
            if (element.closest('.tbml-ios-topbar, .tbml-ios-buybar')) continue;
            const text = normalizedText(element);
            if (!text || text.length > 180 || element.children.length > 8) continue;
            const visual = visibleElementRect(element);
            if (!visual || visual.rect.top > viewportHeight * 2.4) continue;
            const marker = elementMarker(element);

            if (prices < 5 && (/^(?:¥|￥)\s*[\d,.]+/.test(text) || (/price/.test(marker) && /\d/.test(text) && text.length < 48))) {
                claim(element, 'tbml-ios-price');
                element.classList.add('tbml-ios-price');
                prices += 1;
                changed = true;
                continue;
            }

            const titleCandidate = /(?:^|[-_])title(?:$|[-_])|itemtitle|main-title|goods-title/.test(marker) || /^(?:H1|H2)$/.test(element.tagName);
            if (titles < 3 && titleCandidate && text.length >= 6 && text.length <= 160 && !DETAIL_ROW_TEXT.test(text)) {
                claim(element, 'tbml-ios-title');
                element.classList.add('tbml-ios-title');
                titles += 1;
                changed = true;
            }
        }
        return changed;
    }

    function styleDetailRowsAndCards(root = document) {
        let changed = false;
        let rowCount = 0;
        let cardCount = 0;

        for (const element of queryElements(root, 'div, li, section, article', 1500)) {
            if (element.closest('.tbml-ios-topbar, .tbml-ios-buybar, .tbml-ios-gallery')) continue;
            const text = normalizedText(element);
            if (!text || text.length > 220) continue;
            const visual = visibleElementRect(element);
            if (!visual) continue;
            const { rect, style } = visual;
            if (style.position === 'fixed' || style.position === 'sticky') continue;

            if (rowCount < 24 && DETAIL_ROW_TEXT.test(text) && rect.width >= window.innerWidth * 0.68 && rect.height >= 32 && rect.height <= 180) {
                const nestedMatch = [...element.children].some(child => {
                    const childText = normalizedText(child);
                    return childText && childText.length < text.length && DETAIL_ROW_TEXT.test(childText);
                });
                if (!nestedMatch) {
                    element.classList.add('tbml-ios-row');
                    rowCount += 1;
                    changed = true;
                }
            }

            if (cardCount >= 32 || rect.width < window.innerWidth * 0.80 || rect.height < 56 || rect.height > 760) continue;
            const marker = elementMarker(element);
            const namedCard = /(?:^|[-_])(card|module|panel|section|info|sku|service|delivery|seller|shop|review|parameter|coupon|promotion|guarantee)(?:$|[-_])/.test(marker) ||
                /item-info|detail-info|goods-info|shop-info|seller-info/.test(marker);
            const semanticCard = /(?:店铺|进店|商品评价|宝贝评价|服务保障|参数信息|优惠明细|已选|配送至)/.test(text);
            if (!namedCard && !semanticCard) continue;
            if (element.parentElement?.classList.contains('tbml-ios-card')) continue;

            element.classList.add('tbml-ios-card');
            cardCount += 1;
            changed = true;
        }
        return changed;
    }

    function enhanceDetailPage(root = document) {
        if (!isDetailPage() || !document.body) return false;
        document.body.classList.add('tbml-ios-detail-body');

        return styleDetailTopBar(root) |
            styleDetailBuyBar(root) |
            styleDetailGallery(root) |
            styleDetailTypography(root) |
            styleDetailRowsAndCards(root);
    }

    function removeDetailRecommendations(root = document) {
        if (!isDetailPage()) return false;

        const headings = root.querySelectorAll?.('h1, h2, h3, h4, [role="heading"]');
        if (!headings) return false;

        let removed = false;
        for (const heading of headings) {
            const text = normalizedText(heading);
            if (!/^(?:猜你喜欢|看了又看|为你推荐|相关推荐)$/.test(text)) continue;

            const section = heading.closest('section, article, [class*="recommend" i], [class*="guess" i]') || heading.parentElement;
            if (!section || section === document.body || section.closest(`#${ROOT_ID}`)) continue;
            section.remove();
            removed = true;
        }
        return removed;
    }

    function unlockAfterRemoval() {
        window.setTimeout(() => {
            const visibleDialog = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
                .some(element => element instanceof HTMLElement && getComputedStyle(element).display !== 'none');
            if (visibleDialog) return;

            for (const element of [document.documentElement, document.body]) {
                if (!element) continue;
                const inlineOverflow = element.style.overflow;
                if (inlineOverflow === 'hidden' || inlineOverflow === 'clip') {
                    element.style.removeProperty('overflow');
                }
            }
        }, 30);
    }

    // Detects item pages by what they show. The check runs on mobile hosts only and stops once
    // it succeeds, so reading textContent (cheaper than innerText: no layout) stays rare.
    function detectDetailByContent() {
        if (contentDetail || !document.body) return false;
        const host = location.hostname.toLowerCase();
        if (!isTaobaoMobileHost(host) && !isTmallMobileHost(host)) return false;
        if (isHomePage() || isSearchPage()) return false;

        const text = document.body.textContent || '';
        if (!/加入购物车|仅支持在客户端购买|领券购买|立即购买/.test(text)) return false;
        if (!/店铺|进店|评价|宝贝详情|商品详情/.test(text)) return false;

        contentDetail = true;
        updateModeClasses();
        return true;
    }

    // Hides whole-text "open the app" entry points. Hiding (not removing) keeps the site's
    // framework from tripping over a node it still expects to own.
    function hideAppEntryPoints(root = document) {
        if (isHomePage() && !originalModeRequested()) return false;
        const scope = root.body || root;
        if (!scope) return false;

        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const hits = [];
        for (let node = walker.nextNode(); node && hits.length < 40; node = walker.nextNode()) {
            const value = node.nodeValue?.trim();
            if (!value || value.length > 24 || !APP_ENTRY_TEXT.test(value)) continue;
            hits.push(node.parentElement);
        }

        let changed = false;
        for (let element of hits) {
            if (!element || element.closest(`#${ROOT_ID}`)) continue;
            // Climb to the outermost wrapper that holds nothing but this prompt, so the
            // empty button shell disappears with its label.
            const label = normalizedText(element);
            for (let i = 0; i < 4 && element.parentElement; i += 1) {
                const parent = element.parentElement;
                if (parent === document.body || normalizedText(parent) !== label) break;
                element = parent;
            }
            if (element.classList.contains('tbml-hidden')) continue;
            element.classList.add('tbml-hidden');
            changed = true;
        }
        return changed;
    }

    function clean(root = document) {
        if (isHomePage() && !originalModeRequested()) return;

        detectDetailByContent();

        const removed = removeDirectMatches(root) |
            removeTextMatchedOverlays(root) |
            hideAppEntryPoints(root) |
            removeNonessentialBottomNav(root) |
            removeDetailRecommendations(root);

        enhanceDetailPage(root);

        if (removed) unlockAfterRemoval();
    }

    function scheduleClean() {
        if (cleanupScheduled) return;
        cleanupScheduled = true;
        // Detail-page styling scans well over a thousand nodes with getComputedStyle, so a
        // short delay lets bursts of mutations collapse into one pass.
        window.setTimeout(() => {
            requestAnimationFrame(() => {
                cleanupScheduled = false;
                clean(document);
            });
        }, 120);
    }

    function webFallbackFromAppUrl(rawUrl) {
        if (!rawUrl || !APP_SCHEMES.test(rawUrl)) return null;

        try {
            const appUrl = new URL(rawUrl);
            const h5Url = appUrl.searchParams.get('h5Url') || appUrl.searchParams.get('url');
            if (h5Url) {
                const decoded = decodeURIComponent(h5Url);
                if (WEB_URL.test(decoded)) return decoded;
            }

            if (/^(?:taobao|tbopen):\/\/s\.taobao\.com/i.test(rawUrl)) {
                const query = appUrl.searchParams.get('q');
                if (query) return `https://s.m.taobao.com/h5?q=${encodeURIComponent(query)}`;
            }

            if (/^(?:taobao|tbopen):\/\/list\.tmall\.com\/search_product\.htm/i.test(rawUrl) ||
                /^tmall:\/\/page\.tm\/search/i.test(rawUrl)) {
                const query = appUrl.searchParams.get('q');
                if (query) return `https://list.tmall.com/search_product.htm?q=${encodeURIComponent(query)}`;
            }
        } catch {
            const match = rawUrl.match(/[?&]h5Url=([^&#]+)/i);
            if (match) {
                try {
                    const decoded = decodeURIComponent(match[1]);
                    if (WEB_URL.test(decoded)) return decoded;
                } catch {
                    // Ignore malformed fallback URLs.
                }
            }
        }
        return null;
    }

    function interceptAppLinks(event) {
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!anchor) return;

        const href = anchor.getAttribute('href') || '';
        if (!APP_SCHEMES.test(href)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const fallback = webFallbackFromAppUrl(href);
        if (fallback) location.href = fallback;
    }

    function updateModeClasses() {
        document.documentElement.classList.toggle('tbml-search', isSearchPage());
        document.documentElement.classList.toggle('tbml-detail', isDetailPage());
        document.body?.classList.toggle('tbml-ios-detail-body', isDetailPage());
    }

    function updatePageMode() {
        updateModeClasses();

        if (isHomePage()) {
            if (originalModeRequested()) {
                document.documentElement.classList.remove('tbml-home');
                document.getElementById(ROOT_ID)?.remove();
                createEnableButton();
                clean();
            } else {
                document.getElementById('tbml-enable-button')?.remove();
                createMinimalHome();
            }
        } else {
            document.documentElement.classList.remove('tbml-home');
            document.getElementById(ROOT_ID)?.remove();
            document.getElementById('tbml-enable-button')?.remove();
            clean();
        }
    }

    function observeDocument() {
        if (observer || !document.documentElement) return;

        observer = new MutationObserver(mutations => {
            if (isHomePage() && !originalModeRequested()) {
                createMinimalHome();
                return;
            }

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    scheduleClean();
                }
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        addStyle();
        document.addEventListener('click', interceptAppLinks, true);
        observeDocument();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updatePageMode, { once: true });
        } else {
            updatePageMode();
        }

        // Taobao and Tmall use client-side navigation on some pages. Polling keeps the script
        // compatible without replacing the site's History API functions.
        window.setInterval(() => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            contentDetail = false;
            updatePageMode();
        }, 700);
    }

    init();
})();
