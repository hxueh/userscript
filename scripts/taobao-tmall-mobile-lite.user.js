// ==UserScript==
// @name         Taobao & Tmall Mobile Lite
// @namespace    https://github.com/hxueh
// @version      0.0.5
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
    const DETAIL_PURCHASE_TEXT = /加入购物车|立即购买|去购买|领券购买|马上抢|单独购买|发起拼单|结算/i;
    const DETAIL_PRIMARY_ACTION_TEXT = /立即购买|去购买|领券购买|马上抢|单独购买|发起拼单/i;
    const DETAIL_SECONDARY_ACTION_TEXT = /加入购物车/i;
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

    function addStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --tbml-orange: #ff5000;
                --tbml-orange-pressed: #e84800;
                --tbml-bg: #f5f5f7;
                --tbml-card: rgba(255, 255, 255, 0.92);
                --tbml-text: #1d1d1f;
                --tbml-secondary: #6e6e73;
                --tbml-border: rgba(60, 60, 67, 0.16);
                --tbml-shadow: 0 16px 50px rgba(0, 0, 0, 0.10);
            }

            html.tbml-home,
            html.tbml-home body {
                min-height: 100% !important;
                margin: 0 !important;
                background: var(--tbml-bg) !important;
                color: var(--tbml-text) !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif !important;
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
                    radial-gradient(circle at 50% 8%, rgba(255, 80, 0, 0.12), transparent 34%),
                    var(--tbml-bg);
            }

            .tbml-shell {
                box-sizing: border-box;
                width: min(100%, 560px);
                margin: auto;
            }

            .tbml-brand {
                margin: 0 0 22px;
                text-align: center;
            }

            .tbml-brand-title {
                margin: 0;
                font-size: clamp(32px, 10vw, 48px);
                font-weight: 800;
                letter-spacing: -0.05em;
                line-height: 1;
            }

            .tbml-brand-subtitle {
                margin: 10px 0 0;
                color: var(--tbml-secondary);
                font-size: 15px;
                line-height: 1.4;
            }

            .tbml-card {
                box-sizing: border-box;
                padding: 16px;
                border: 1px solid var(--tbml-border);
                border-radius: 24px;
                background: var(--tbml-card);
                box-shadow: var(--tbml-shadow);
                -webkit-backdrop-filter: blur(24px) saturate(160%);
                backdrop-filter: blur(24px) saturate(160%);
            }

            .tbml-search-form {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 10px;
            }

            .tbml-search-input {
                box-sizing: border-box;
                width: 100%;
                min-width: 0;
                min-height: 52px;
                padding: 0 16px;
                border: 1px solid var(--tbml-border);
                border-radius: 16px;
                outline: none;
                background: rgba(118, 118, 128, 0.10);
                color: var(--tbml-text);
                font: inherit;
                font-size: 17px;
                -webkit-appearance: none;
                appearance: none;
            }

            .tbml-search-input:focus {
                border-color: rgba(255, 80, 0, 0.55);
                box-shadow: 0 0 0 4px rgba(255, 80, 0, 0.12);
            }

            .tbml-search-button {
                min-width: 76px;
                min-height: 52px;
                padding: 0 18px;
                border: 0;
                border-radius: 16px;
                background: var(--tbml-orange);
                color: #fff;
                font: inherit;
                font-size: 16px;
                font-weight: 700;
                -webkit-appearance: none;
                appearance: none;
                touch-action: manipulation;
            }

            .tbml-search-button:active {
                background: var(--tbml-orange-pressed);
                transform: scale(0.98);
            }

            .tbml-links {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
                margin-top: 12px;
            }

            .tbml-link {
                box-sizing: border-box;
                min-height: 48px;
                padding: 0 8px;
                display: grid;
                place-items: center;
                border: 1px solid var(--tbml-border);
                border-radius: 15px;
                background: rgba(255, 255, 255, 0.72);
                color: var(--tbml-text);
                text-align: center;
                text-decoration: none;
                font-size: 14px;
                font-weight: 600;
                touch-action: manipulation;
            }

            .tbml-link:active {
                background: rgba(118, 118, 128, 0.12);
                transform: scale(0.98);
            }

            .tbml-original-link {
                width: fit-content;
                margin: 18px auto 0;
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
                min-height: 42px;
                padding: 0 15px;
                border: 1px solid rgba(255, 255, 255, 0.40);
                border-radius: 999px;
                background: rgba(29, 29, 31, 0.84);
                color: #fff;
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
                -webkit-backdrop-filter: blur(18px) saturate(160%);
                backdrop-filter: blur(18px) saturate(160%);
                font: 600 14px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
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
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif !important;
                -webkit-text-size-adjust: 100%;
            }

            html.tbml-detail body {
                box-sizing: border-box;
                padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important;
                background:
                    radial-gradient(circle at 50% -80px, rgba(255, 80, 0, 0.09), transparent 320px),
                    var(--tbml-bg) !important;
            }

            html.tbml-detail *,
            html.tbml-detail *::before,
            html.tbml-detail *::after {
                -webkit-tap-highlight-color: transparent;
            }

            html.tbml-detail .tbml-ios-gallery {
                overflow: hidden !important;
                border-radius: 0 0 24px 24px !important;
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

            html.tbml-detail .tbml-ios-card {
                box-sizing: border-box !important;
                margin: 12px max(10px, env(safe-area-inset-left)) !important;
                border: 1px solid var(--tbml-border) !important;
                border-radius: 18px !important;
                background: var(--tbml-card) !important;
                box-shadow: 0 3px 18px rgba(0, 0, 0, 0.055) !important;
                -webkit-backdrop-filter: blur(24px) saturate(150%);
                backdrop-filter: blur(24px) saturate(150%);
                overflow: hidden;
            }

            html.tbml-detail .tbml-ios-row {
                box-sizing: border-box !important;
                min-height: 48px;
                padding: 12px 14px !important;
                border: 1px solid var(--tbml-border) !important;
                border-radius: 14px !important;
                background: rgba(255, 255, 255, 0.66) !important;
            }

            html.tbml-detail .tbml-ios-price {
                color: #ff3b30 !important;
                font-size: clamp(24px, 7vw, 32px) !important;
                font-weight: 800 !important;
                letter-spacing: -0.035em !important;
                line-height: 1.12 !important;
                font-variant-numeric: tabular-nums;
            }

            html.tbml-detail .tbml-ios-title {
                color: var(--tbml-text) !important;
                font-size: 17px !important;
                font-weight: 650 !important;
                letter-spacing: -0.015em !important;
                line-height: 1.42 !important;
            }

            html.tbml-detail .tbml-ios-topbar {
                box-sizing: border-box !important;
                top: 0 !important;
                min-height: calc(44px + env(safe-area-inset-top)) !important;
                padding-top: env(safe-area-inset-top) !important;
                border-bottom: 1px solid var(--tbml-border) !important;
                background: rgba(245, 245, 247, 0.78) !important;
                box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) inset !important;
                -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                backdrop-filter: blur(24px) saturate(180%) !important;
            }

            html.tbml-detail .tbml-ios-topbar a,
            html.tbml-detail .tbml-ios-topbar button,
            html.tbml-detail .tbml-ios-topbar [role="button"] {
                border-radius: 999px !important;
                -webkit-tap-highlight-color: transparent;
            }

            html.tbml-detail .tbml-ios-buybar {
                box-sizing: border-box !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                min-height: calc(68px + env(safe-area-inset-bottom)) !important;
                padding: 8px max(10px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)) !important;
                border-top: 1px solid var(--tbml-border) !important;
                border-radius: 22px 22px 0 0 !important;
                background: rgba(255, 255, 255, 0.86) !important;
                box-shadow: 0 -10px 34px rgba(0, 0, 0, 0.10) !important;
                -webkit-backdrop-filter: blur(26px) saturate(180%) !important;
                backdrop-filter: blur(26px) saturate(180%) !important;
                z-index: 2147483000 !important;
            }

            html.tbml-detail .tbml-ios-buybar a,
            html.tbml-detail .tbml-ios-buybar button,
            html.tbml-detail .tbml-ios-buybar [role="button"] {
                box-sizing: border-box;
                min-height: 44px;
                border-radius: 15px !important;
                font-family: inherit !important;
                font-weight: 700 !important;
                touch-action: manipulation;
            }

            html.tbml-detail .tbml-ios-action-primary {
                border: 0 !important;
                background: #ff3b30 !important;
                color: #fff !important;
                box-shadow: 0 5px 16px rgba(255, 59, 48, 0.24) !important;
            }

            html.tbml-detail .tbml-ios-action-secondary {
                border: 0 !important;
                background: #ff9500 !important;
                color: #fff !important;
                box-shadow: 0 5px 16px rgba(255, 149, 0, 0.22) !important;
            }

            html.tbml-detail .tbml-ios-action-icon {
                min-width: 42px !important;
                background: rgba(118, 118, 128, 0.10) !important;
                color: var(--tbml-text) !important;
                box-shadow: none !important;
            }

            html.tbml-detail .tbml-ios-action-primary:active,
            html.tbml-detail .tbml-ios-action-secondary:active,
            html.tbml-detail .tbml-ios-action-icon:active {
                filter: brightness(0.94);
                transform: scale(0.98);
            }

            ${DIRECT_REMOVE_SELECTORS.join(',\n')} {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --tbml-bg: #000;
                    --tbml-card: rgba(28, 28, 30, 0.90);
                    --tbml-text: #f5f5f7;
                    --tbml-secondary: #a1a1a6;
                    --tbml-border: rgba(255, 255, 255, 0.14);
                    --tbml-shadow: 0 18px 55px rgba(0, 0, 0, 0.46);
                }

                .tbml-search-input {
                    background: rgba(118, 118, 128, 0.24);
                }

                .tbml-link {
                    background: rgba(44, 44, 46, 0.78);
                }

                html.tbml-detail .tbml-ios-gallery {
                    background: #1c1c1e !important;
                }

                html.tbml-detail .tbml-ios-row {
                    background: rgba(44, 44, 46, 0.72) !important;
                }

                html.tbml-detail .tbml-ios-topbar {
                    background: rgba(18, 18, 20, 0.80) !important;
                }

                html.tbml-detail .tbml-ios-buybar {
                    background: rgba(28, 28, 30, 0.88) !important;
                }

                html.tbml-detail .tbml-ios-action-icon {
                    background: rgba(118, 118, 128, 0.24) !important;
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
        return host === 'item.taobao.com' ||
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

                <div class="tbml-card">
                    <form class="tbml-search-form" action="${escapeHtml(site.searchAction)}" method="get" role="search">
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
                        <a class="tbml-link" href="https://main.m.taobao.com/cart/index.html">购物车</a>
                        <a class="tbml-link" href="https://tm.m.taobao.com/list.htm?OrderListType=total_orders">订单</a>
                        <a class="tbml-link" href="https://h5.m.taobao.com/mlapp/mytaobao.html">我的淘宝</a>
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
        const candidates = queryElements(
            root,
            'footer, nav, [class*="bottom" i], [class*="footer" i], [class*="action" i], [class*="buy" i], [style*="position: fixed" i], [style*="position: sticky" i]',
            420
        );

        let changed = false;
        for (const element of candidates) {
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
                if (DETAIL_SECONDARY_ACTION_TEXT.test(labelText)) {
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

        for (const element of queryElements(root, 'h1, h2, h3, p, span, div, [class*="price" i], [class*="title" i]', 1500)) {
            if (element.closest('.tbml-ios-topbar, .tbml-ios-buybar')) continue;
            const text = normalizedText(element);
            if (!text || text.length > 180 || element.children.length > 8) continue;
            const visual = visibleElementRect(element);
            if (!visual || visual.rect.top > viewportHeight * 2.4) continue;
            const marker = elementMarker(element);

            if (prices < 5 && (/^(?:¥|￥)\s*[\d,.]+/.test(text) || (/price/.test(marker) && /\d/.test(text) && text.length < 48))) {
                element.classList.add('tbml-ios-price');
                prices += 1;
                changed = true;
                continue;
            }

            const titleCandidate = /(?:^|[-_])title(?:$|[-_])|itemtitle|main-title|goods-title/.test(marker) || /^(?:H1|H2)$/.test(element.tagName);
            if (titles < 3 && titleCandidate && text.length >= 6 && text.length <= 160 && !DETAIL_ROW_TEXT.test(text)) {
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

    function clean(root = document) {
        if (isHomePage() && !originalModeRequested()) return;

        const removed = removeDirectMatches(root) |
            removeTextMatchedOverlays(root) |
            removeNonessentialBottomNav(root) |
            removeDetailRecommendations(root);

        enhanceDetailPage(root);

        if (removed) unlockAfterRemoval();
    }

    function scheduleClean() {
        if (cleanupScheduled) return;
        cleanupScheduled = true;
        requestAnimationFrame(() => {
            cleanupScheduled = false;
            clean(document);
        });
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

    function updatePageMode() {
        document.documentElement.classList.toggle('tbml-search', isSearchPage());
        document.documentElement.classList.toggle('tbml-detail', isDetailPage());
        document.body?.classList.toggle('tbml-ios-detail-body', isDetailPage());

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
            updatePageMode();
        }, 700);
    }

    init();
})();
