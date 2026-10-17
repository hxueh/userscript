// ==UserScript==
// @name         Instagram Lite
// @name:en      Instagram Lite - iOS 26 style, no Reels, ads or suggestions
// @name:zh-CN   Instagram Lite - iOS 26 风格，移除 Reels、广告和推荐内容
// @name:zh-TW   Instagram Lite - iOS 26 風格，移除 Reels、廣告和推薦內容
// @name:ja      Instagram Lite - iOS 26 風デザイン、リール・広告・おすすめを非表示
// @name:ko      Instagram Lite - iOS 26 스타일, 릴스·광고·추천 콘텐츠 제거
// @name:de      Instagram Lite - iOS-26-Look ohne Reels, Werbung und Vorschläge
// @name:fr      Instagram Lite - Style iOS 26 sans Reels, pubs ni suggestions
// @name:es      Instagram Lite - Estilo iOS 26 sin Reels, anuncios ni sugerencias
// @name:it      Instagram Lite - Stile iOS 26 senza Reels, pubblicità e suggerimenti
// @namespace    https://github.com/hxueh
// @version      0.1.21
// @description  Give Instagram web an iOS 26 "Liquid Glass" look, and remove Reels, Explore, sponsored posts and suggested content
// @description:en Give Instagram web an iOS 26 "Liquid Glass" look, and remove Reels, Explore, sponsored posts and suggested content
// @description:zh-CN 为 Instagram 网页版应用 iOS 26 “液态玻璃”风格，并移除 Reels、探索页、赞助帖子和推荐内容
// @description:zh-TW 為 Instagram 網頁版套用 iOS 26「液態玻璃」風格，並移除 Reels、探索頁、贊助貼文和推薦內容
// @description:ja    Instagram ウェブ版を iOS 26 の「Liquid Glass」風にし、リール・発見タブ・広告・おすすめ投稿を非表示にします
// @description:ko    Instagram 웹에 iOS 26 "Liquid Glass" 스타일을 적용하고 릴스, 탐색 탭, 광고 게시물, 추천 콘텐츠를 제거합니다
// @description:de    Gibt Instagram im Web einen iOS-26-„Liquid Glass“-Look und entfernt Reels, Entdecken, gesponserte Beiträge und Vorschläge
// @description:fr    Donne à Instagram Web un style iOS 26 « Liquid Glass » et supprime Reels, Explorer, les publications sponsorisées et les suggestions
// @description:es    Aplica a Instagram web un estilo iOS 26 «Liquid Glass» y elimina Reels, Explorar, publicaciones patrocinadas y sugerencias
// @description:it    Dà a Instagram web uno stile iOS 26 «Liquid Glass» e rimuove Reels, Esplora, post sponsorizzati e contenuti suggeriti
// @author       hxueh
// @match        https://www.instagram.com/*
// @icon         https://www.instagram.com/favicon.ico
// @grant        none
// @run-at       document-start
// @noframes
// @license      LGPL-3.0-or-later
// ==/UserScript==

(function () {
    "use strict";

    // ==================== CONSTANTS ====================

    const STYLE_ID = "igx-style";
    const HIDDEN_ATTR = "data-igx-hidden";
    const COLLAPSE_ATTR = "data-igx-collapse";
    const NAV_ATTR = "data-igx-nav";
    const CHROME_HIDDEN_ATTR = "data-igx-chrome-hidden";
    const GROW_ATTR = "data-igx-grow";
    const SCAN_DELAY_MS = 250;
    // Only Chromium renders SVG filters inside backdrop-filter (needed for
    // real refraction). iOS Chrome reports "CriOS", so it is correctly false.
    const LENS_SUPPORTED = /\bChrome\//.test(navigator.userAgent);
    // Header labels can render a moment after the article, so each article
    // is re-checked for a few seconds before we trust it.
    const ARTICLE_RECHECK_MS = 6000;

    // Exact (lowercased) UI strings. Instagram follows the account language,
    // so the common ones are listed for each locale.
    // Instagram labels paid posts "Sponsored" in some markets and plain "Ad"
    // in others, so both families of labels are listed.
    const SPONSORED = new Set([
        "sponsored", "赞助内容", "贊助內容", "スポンサー", "広告", "광고",
        "gesponsert", "sponsorisé", "patrocinado", "sponsorizzato",
        "ad", "ads", "advertisement", "广告", "廣告", "anzeige", "annonce",
        "anuncio", "annuncio", "publicité", "publicidad", "pubblicità",
    ]);
    const SUGGESTED = new Set([
        "suggested for you", "suggested posts", "suggested reels", "suggested",
        "为你推荐", "推荐帖子", "為你推薦", "推薦貼文", "おすすめ",
        "あなたへのおすすめ", "회원님을 위한 추천", "vorgeschlagen für dich",
        "suggestions pour vous", "sugerencias para ti", "suggerimenti per te",
    ]);
    // The sidebar's "Also from Meta" entry (a launcher for Meta's other apps).
    const ALSO_FROM_META = new Set([
        "also from meta", "meta 旗下其他产品", "meta 旗下的其他产品", "来自 meta 的更多产品",
        "meta 旗下其他應用", "來自 meta 的更多產品", "meta の他のアプリ", "meta의 다른 앱",
        "auch von meta", "également de meta", "también de meta", "anche da meta",
    ]);
    const FOLLOW = new Set([
        "follow", "关注", "關注", "フォロー", "팔로우",
        "folgen", "suivre", "seguir", "segui",
    ]);

    // ==================== STYLE ====================

    // Dark palette lives in one string because it is needed twice: once for
    // the OS preference and once for Instagram's own theme toggle (which
    // puts a class on <html> and can disagree with the OS).
    const DARK_VARS = `
        --igx-bg: #000;
        --igx-card: #1c1c1e;
        --igx-glass: rgba(44, 44, 48, 0.34);
        --igx-fill: rgba(118, 118, 128, 0.24);
        --igx-hairline: rgba(255, 255, 255, 0.14);
        --igx-highlight: rgba(255, 255, 255, 0.16);
        --igx-rim: rgba(255, 255, 255, 0.2);
        --igx-page: #000;
        --igx-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
        --igx-blue: #0a84ff;
    `;

    const CSS = `
        :root {
            --igx-bg: #f2f2f7;
            --igx-card: #fff;
            --igx-glass: rgba(255, 255, 255, 0.38);
            --igx-fill: rgba(118, 118, 128, 0.12);
            --igx-hairline: rgba(60, 60, 67, 0.16);
            --igx-highlight: rgba(255, 255, 255, 0.7);
            --igx-rim: rgba(255, 255, 255, 0.85);
            --igx-page: #fff;
            --igx-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            --igx-blue: #007aff;
        }
        @media (prefers-color-scheme: dark) {
            :root:not(.__ig-light-mode) { ${DARK_VARS} }
        }
        :root.__ig-dark-mode { ${DARK_VARS} }

        /* --- removed content --- */
        [${HIDDEN_ATTR}]:not([${COLLAPSE_ATTR}]),
        a[href="/reels/"],
        a[href$="/reels/"] {
            display: none !important;
        }
        /* The Explore page doubles as the mobile Search page, so it stays;
           only its grid of recommended posts is removed. */
        html[data-igx-explore] main a[href^="/p/"],
        html[data-igx-explore] main a[href^="/reel/"] {
            display: none !important;
        }
        /* Feed items are collapsed to zero height instead of display:none.
           Instagram loads the next batch when the last post nears the
           screen edge; a display:none post never reports that, so the feed
           would stop loading and go blank. */
        [${COLLAPSE_ATTR}] {
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }

        /* --- typography and canvas --- */
        * {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                "SF Pro Display", system-ui, sans-serif !important;
            -webkit-font-smoothing: antialiased;
        }
        html { scrollbar-width: none; }
        html, body, main { background: var(--igx-bg) !important; }

        /* Explore and search keep Instagram's own page colour (white or
           black). They are plain full-height lists, not grouped cards, and
           the grey canvas showed through as a band behind the results. */
        html[data-igx-explore] body,
        html[data-igx-explore] main,
        html[data-igx-explore] [data-igx-canvas] {
            background: var(--igx-page) !important;
        }

        /* Search results: see growSearchResults() in the script. The results
           list sits in a narrow column that Instagram squeezes to its
           content height. Letting its parents take the full width, and the
           list the height of the screen below the search bar, gives a
           normal full-page list at any screen size. */
        html[data-igx-explore] [${GROW_ATTR}] {
            height: auto !important;
            max-height: none !important;
            flex-shrink: 0 !important;
            width: 100% !important;
            max-width: none !important;
        }
        html[data-igx-explore] [${GROW_ATTR}="panel"] {
            min-height: calc(100vh - 160px) !important;
            min-height: calc(100dvh - 160px) !important;
        }
        /* The grid is removed, so its "loading more" spinner has nothing to
           load and would sit alone under the results. */
        html[data-igx-explore] main [data-visualcompletion="loading-state"] {
            display: none !important;
        }

        /* The app root paints its own opaque background over <body>, so the
           grouped-grey canvas is applied to that element too. */
        [data-igx-canvas] { background: var(--igx-bg) !important; }

        /* iOS system blue for Instagram's themed buttons and links */
        :root, body {
            --ig-primary-button: 0, 122, 255;
            --ig-link: 0, 122, 255;
        }

        /* --- feed cards --- */
        article {
            background: var(--igx-card) !important;
            border: 0.5px solid var(--igx-hairline) !important;
            /* Sizes scale with the screen: a 22px corner suits a desktop
               column but looks heavy on a 390px phone. */
            border-radius: clamp(14px, 3.4vw, 22px) !important;
            margin-bottom: clamp(8px, 1.6vw, 12px) !important;
            /* No overflow:hidden here. Clipping to the rounded corners would
               cut off anything that overhangs the card, such as the story
               ring around the author's avatar. Every post starts with its
               header, so the media never touches the rounded corners. */
        }
        @media (max-width: 767px) {
            article {
                margin-left: clamp(4px, 2vw, 8px) !important;
                margin-right: clamp(4px, 2vw, 8px) !important;
                width: auto !important;
            }
        }

        /* Inputs are left as Instagram draws them. The search bar is already
           a capsule (a pill behind a transparent input), and restyling the
           input put a second shape on top of the pill: the two radii
           disagreed and left darker crescents at the corners. */
        button[type="submit"] { border-radius: 999px !important; }

        /* --- Liquid Glass surfaces --- */
        [${NAV_ATTR}],
        [role="dialog"],
        [role="menu"] {
            background: var(--igx-glass) !important;
            -webkit-backdrop-filter: blur(30px) saturate(180%);
            backdrop-filter: blur(30px) saturate(180%);
            border: 0.5px solid var(--igx-hairline) !important;
            /* Specular rim: bright top edge, faint bottom edge, soft inner glow */
            box-shadow: var(--igx-shadow),
                inset 0 1px 0.5px var(--igx-highlight),
                inset 0 -1px 0.5px rgba(255, 255, 255, 0.12),
                inset 0 0 18px rgba(255, 255, 255, 0.06) !important;
        }
        [role="dialog"], [role="menu"] {
            border-radius: clamp(18px, 5vw, 28px) !important;
            overflow: hidden;
        }
        [${NAV_ATTR}="top"] { border-radius: 0 !important; }

        /* Instagram paints opaque white boxes inside its bars. They would
           cover the glass and square off its corners, so clear the first
           few layers (icons and badges sit deeper and keep their colors). */
        [${NAV_ATTR}] > *,
        [${NAV_ATTR}] > * > *,
        [${NAV_ATTR}] > * > * > * {
            background: transparent !important;
            box-shadow: none !important;
        }
        /* A bright rim reads as glass; the dark hairline reads as a card. */
        [${NAV_ATTR}] { border-color: var(--igx-rim) !important; }
        [${NAV_ATTR}="bottom"] { overflow: hidden; }

        /* Browsers without SVG backdrop filters (Safari, Firefox) cannot bend
           the content behind the glass. Imitate the look instead: a diagonal
           specular sheen, a thin cyan/magenta fringe at the rim (the glass's
           dispersion), and a brighter, more saturated backdrop. */
        html[data-igx-faux] [${NAV_ATTR}]:not([${NAV_ATTR}="top"]),
        html[data-igx-faux] [role="dialog"],
        html[data-igx-faux] [role="menu"] {
            background-image:
                linear-gradient(135deg, rgba(255, 255, 255, 0.34) 0%,
                    rgba(255, 255, 255, 0) 38%,
                    rgba(255, 255, 255, 0) 62%,
                    rgba(255, 255, 255, 0.16) 100%) !important;
            -webkit-backdrop-filter: blur(18px) saturate(190%) brightness(1.06);
            backdrop-filter: blur(18px) saturate(190%) brightness(1.06);
            box-shadow: var(--igx-shadow),
                inset 0 1px 0.5px var(--igx-highlight),
                inset 0 -1px 0.5px rgba(255, 255, 255, 0.12),
                inset 1.5px 0 1px -0.5px rgba(0, 255, 255, 0.22),
                inset -1.5px 0 1px -0.5px rgba(255, 0, 170, 0.18),
                inset 0 0 22px rgba(255, 255, 255, 0.08) !important;
        }

        /* Desktop: the sidebar becomes a rounded glass panel, like iPadOS 26.
           Its position is left to Instagram; only the shape changes. */
        [${NAV_ATTR}="side"] {
            border-radius: clamp(18px, 5vw, 28px) !important;
        }

        /* Like the iOS 26 app, the tab bar and top bar slide out of the way
           while scrolling down and return on the first scroll up. */
        [${NAV_ATTR}="bottom"],
        [${NAV_ATTR}="top"] {
            transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease;
        }
        html[${CHROME_HIDDEN_ATTR}] [${NAV_ATTR}="bottom"] {
            transform: translateY(calc(100% + 32px)) !important;
            opacity: 0;
            pointer-events: none;
        }
        html[${CHROME_HIDDEN_ATTR}] [${NAV_ATTR}="top"] {
            transform: translateY(-100%) !important;
            opacity: 0;
            pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
            [${NAV_ATTR}="bottom"], [${NAV_ATTR}="top"] { transition: none; }
        }

        /* Mobile: a floating capsule tab bar, like the iOS 26 app */
        @media (max-width: 767px) {
            [${NAV_ATTR}="bottom"] {
                left: max(clamp(8px, 3vw, 14px), env(safe-area-inset-left, 0px)) !important;
                right: max(clamp(8px, 3vw, 14px), env(safe-area-inset-right, 0px)) !important;
                bottom: calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
                width: auto !important;
                border-radius: 34px !important;
            }
        }
    `;

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        // Lets the stylesheet switch to the imitation glass (see below).
        if (!LENS_SUPPORTED) document.documentElement.setAttribute("data-igx-faux", "");
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        // At document-start <head> may not exist yet; <html> always does.
        (document.head || document.documentElement).appendChild(style);
    }

    // ==================== NETWORK ====================

    // Hiding recommended content after it renders still downloads it, and
    // telemetry runs whether or not you can see it. So requests are answered
    // locally and never leave the browser when they are for:
    //  - the Explore grid and suggested accounts (/api/v1/discover/);
    //  - Instagram's own telemetry (Falco / client-event logging, batched
    //    "bz" pings, quality metrics);
    //  - third-party trackers and ad pixels.
    // Search uses a different endpoint (web/search/topsearch) and is not
    // affected.
    const BLOCKED_API = /\/api\/v1\/discover\//;
    const TELEMETRY_PATH =
        /\/(?:logging_client_events|logging\/falco|ajax\/bz|ajax\/qm|api\/v1\/logging\/)/;
    const TRACKER_HOST = new RegExp(
        "//(?:[\\w-]+\\.)*(?:connect\\.facebook\\.net|google-analytics\\.com|" +
            "googletagmanager\\.com|doubleclick\\.net|googleadservices\\.com|" +
            "scorecardresearch\\.com|bat\\.bing\\.com|analytics\\.tiktok\\.com|" +
            "ads-twitter\\.com|snap\\.licdn\\.com)(?:[:/?#]|$)",
        "i",
    );
    const FACEBOOK_PIXEL = /\/\/(?:[\w-]+\.)*facebook\.com\/tr\/?(?:[?#]|$)/i;
    // A blocked list endpoint must look like a real, finished, empty page.
    // Instagram keeps a loading spinner up until the response says there is
    // nothing more (auto_load_more_enabled / more_available false and no
    // next_max_id), so a bare {"items": []} leaves the Explore page spinning.
    const EMPTY_RESULT = JSON.stringify({
        status: "ok",
        items: [],
        users: [],
        sectional_items: [],
        num_results: 0,
        rank_token: "0",
        auto_load_more_enabled: false,
        more_available: false,
        next_max_id: null,
        max_id: null,
    });

    // Resolve against the page URL first, so relative paths are judged too.
    function absolute(url) {
        try {
            return new URL(String(url), location.href).href;
        } catch (err) {
            return String(url);
        }
    }
    function isTracker(url) {
        const href = absolute(url);
        return TELEMETRY_PATH.test(href) || TRACKER_HOST.test(href) || FACEBOOK_PIXEL.test(href);
    }

    // The code that replaces fetch, XHR and friends. It has to run in the
    // PAGE's JavaScript world: userscript managers often run scripts in an
    // isolated world (Tampermonkey on Chromium does), where replacing
    // window.fetch changes nothing the page can see. So this function is
    // self-contained (it is serialized with toString() and injected as an
    // inline <script>); it gets its patterns through cfg.
    function installNetworkBlock(cfg) {
        if (window.__igxNet) return;
        window.__igxNet = true;

        const api = new RegExp(cfg.api);
        const telemetry = new RegExp(cfg.telemetry);
        const host = new RegExp(cfg.host, "i");
        const pixel = new RegExp(cfg.pixel, "i");
        const abs = (url) => {
            try {
                return new URL(String(url), location.href).href;
            } catch (err) {
                return String(url);
            }
        };
        const tracker = (url) => {
            const href = abs(url);
            return telemetry.test(href) || host.test(href) || pixel.test(href);
        };
        // Every request answered locally is noted (path only) in
        // window.__igxBlocked, so a broken page can be diagnosed from the
        // console: if the list shows an endpoint the page needs, narrow the
        // patterns above.
        window.__igxBlocked = [];
        const blocked = (url) => {
            const href = abs(url);
            const hit = api.test(href) || tracker(url);
            if (hit && window.__igxBlocked.length < 100) {
                // abs() falls back to the raw string when it cannot parse the
                // URL, and new URL() would then throw inside the page's own
                // fetch call. The log is only a diagnostic, so never let it
                // break the request.
                try {
                    window.__igxBlocked.push(new URL(href).pathname);
                } catch (err) {
                    window.__igxBlocked.push(href);
                }
            }
            return hit;
        };

        const originalFetch = window.fetch;
        window.fetch = function (input) {
            const url = typeof input === "string" ? input : (input && input.url) || input;
            if (blocked(url)) {
                return Promise.resolve(
                    new Response(cfg.empty, {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }),
                );
            }
            return originalFetch.apply(this, arguments);
        };

        // XHR cannot return a fake Response, so mark the request at open()
        // and, at send(), fill in a finished state and fire the events the
        // page is waiting for.
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__igxBlocked = blocked(url);
            return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (!this.__igxBlocked) return originalSend.apply(this, arguments);
            const set = (key, value) =>
                Object.defineProperty(this, key, { value, configurable: true });
            set("readyState", 4);
            set("status", 200);
            set("statusText", "OK");
            set("responseText", cfg.empty);
            set("response", this.responseType === "json" ? JSON.parse(cfg.empty) : cfg.empty);
            set("getResponseHeader", () => "application/json");
            set("getAllResponseHeaders", () => "content-type: application/json\r\n");
            setTimeout(() => {
                for (const type of ["readystatechange", "load", "loadend"]) {
                    this.dispatchEvent(new Event(type));
                }
            }, 0);
        };

        // Beacons are fire-and-forget logging; claim success so the page
        // does not retry.
        if (navigator.sendBeacon) {
            const originalBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = (url, data) => (blocked(url) ? true : originalBeacon(url, data));
        }
    }

    const NETWORK_CONFIG = {
        api: BLOCKED_API.source,
        telemetry: TELEMETRY_PATH.source,
        host: TRACKER_HOST.source,
        pixel: FACEBOOK_PIXEL.source,
        empty: EMPTY_RESULT,
    };
    const NETWORK_CODE = `(${installNetworkBlock.toString()})(${JSON.stringify(NETWORK_CONFIG)});`;
    let networkInjected = false;

    // Instagram's CSP only lets an inline script run if it carries the nonce
    // of the page's own scripts, so wait until one exists and copy its nonce.
    // (A script element's .nonce property survives after the attribute is
    // hidden from the DOM.) If the page has no CSP at all, no nonce is needed
    // and the injection simply works.
    function injectNetworkBlock() {
        if (networkInjected) return;
        const withNonce = document.querySelector("script[nonce]");
        if (!withNonce || !withNonce.nonce) return;
        networkInjected = true;
        const script = document.createElement("script");
        script.nonce = withNonce.nonce;
        script.textContent = NETWORK_CODE;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    function blockRequests() {
        // Covers managers that already run in the page world.
        installNetworkBlock(NETWORK_CONFIG);
        injectNetworkBlock();
    }

    // Scripts and pixels that arrive in the HTML itself bypass the hooks
    // above; the mutation observer passes each batch of added nodes here.
    function dropTrackerNodes(records) {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1 || !/^(SCRIPT|IMG|IFRAME|LINK)$/.test(node.tagName)) continue;
                const url = node.src || node.href;
                if (url && isTracker(url)) node.remove();
            }
        }
    }

    // ==================== ROUTING ====================

    // CSS can hide the links, but a typed URL or a stale tab would still land
    // on the Reels / suggested-people pages, so bounce those back to the home feed.
    // Share links carry per-person tracking IDs (igsh, utm_*, fbclid...).
    // Strip them from the address bar so they are not sent along with later
    // requests or copied into links you share. replaceState is captured
    // before watchHistory() wraps it, to avoid re-entering guardRoute.
    const TRACKING_PARAMS = /^(?:igsh|igshid|fbclid|gclid|ig_rid|utm_\w+)$/;
    const rawReplaceState = history.replaceState;

    function cleanUrl() {
        const url = new URL(location.href);
        let changed = false;
        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_PARAMS.test(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        }
        if (changed) rawReplaceState.call(history, history.state, "", url.pathname + url.search + url.hash);
    }

    let lastPath = location.pathname;

    function guardRoute() {
        cleanUrl();
        const path = location.pathname;
        let target = null;
        // A new page starts at the top, so the tab bar and top bar come back.
        // Otherwise bars that slid away on the feed stay hidden on the
        // profile or post you just opened, until you happen to scroll up.
        if (path !== lastPath) {
            lastPath = path;
            travel = 0;
            setBarsHidden(false);
        }
        // Flag the Explore page so the stylesheet can strip its post grid.
        document.documentElement.toggleAttribute("data-igx-explore", /^\/explore\/(?:search\/?)?$/.test(path));
        if (/^\/(reels|explore\/people)(\/|$)/.test(path)) {
            target = "/";
        } else {
            // Profile "Reels" tab: /username/reels/ -> /username/
            const m = path.match(/^\/([^/]+)\/reels\/?$/);
            if (m) target = `/${m[1]}/`;
        }
        if (target) location.replace(target);
    }

    // Instagram navigates with pushState and never reloads, so wrap the
    // history API (this works because the script runs with @grant none, in
    // the page's own context).
    function watchHistory() {
        for (const method of ["pushState", "replaceState"]) {
            const original = history[method];
            history[method] = function (...args) {
                const result = original.apply(this, args);
                guardRoute();
                return result;
            };
        }
        window.addEventListener("popstate", guardRoute);
    }

    // ==================== HIDING ====================

    const norm = (text) => text.trim().toLowerCase();

    // collapse=true keeps the element in the layout at zero height (for feed
    // items, see the CSS note); otherwise it is removed with display:none.
    // `reason` is stored in the attribute so a hidden element can be audited
    // from the DevTools elements panel.
    function hide(el, collapse = false, reason = "") {
        if (!el || el.hasAttribute(HIDDEN_ATTR)) return;
        // Safety net: a post or a suggestion card never holds this many links.
        // If a heuristic climbed to a container that does, it found the
        // page's content, and hiding it would blank the page.
        if (el.tagName !== "ARTICLE" && el.querySelectorAll("a").length > MAX_HIDDEN_LINKS) return;
        el.setAttribute(HIDDEN_ATTR, reason);
        if (collapse) el.setAttribute(COLLAPSE_ATTR, "");
        for (const media of el.querySelectorAll("video, audio")) silence(media);
    }

    // A collapsed post is invisible but still in the page, so its video can
    // keep playing (with sound, if you unmuted an earlier post) and keep
    // downloading. Stop it and tell the browser not to buffer more.
    function silence(media) {
        media.muted = true;
        media.preload = "none";
        if (!media.paused) media.pause();
    }

    // Instagram's autoplay calls play() again whenever it thinks a post is
    // on screen, and a post can receive its <video> after it was hidden.
    // Catching "play" (which does not bubble, hence the capture phase)
    // covers both cases.
    function onMediaPlay(event) {
        const media = event.target;
        if (media instanceof HTMLMediaElement && media.closest(`[${HIDDEN_ATTR}]`)) silence(media);
    }

    // Hide an element together with wrappers that exist only to hold it, so
    // the nav does not keep an empty slot (and its spacing) behind.
    function hideBranch(el) {
        let node = el;
        for (let i = 0; i < 5; i++) {
            const parent = node.parentElement;
            if (!parent || parent.children.length > 1) break;
            if (parent === document.body || parent.matches("nav, main, [role='navigation']")) break;
            node = parent;
        }
        hide(node);
    }

    function hideNavLinks() {
        const links = document.querySelectorAll(
            'a[href="/reels/"], a[href$="/reels/"]',
        );
        for (const link of links) hideBranch(link);
        hideAlsoFromMeta();
    }

    // "Also from Meta" is an <a href="#"> at the bottom of the sidebar, not
    // a distinct URL, so it is found by its label. A collapsed sidebar shows
    // only the icon, whose aria-label carries the same text.
    function hideAlsoFromMeta() {
        for (const link of document.querySelectorAll(`[${NAV_ATTR}] a, nav a`)) {
            if (link.hasAttribute(HIDDEN_ATTR)) continue;
            const icon = link.querySelector("svg[aria-label]");
            const label = icon ? icon.getAttribute("aria-label") : "";
            if (ALSO_FROM_META.has(norm(link.textContent)) || ALSO_FROM_META.has(norm(label))) {
                hideBranch(link);
            }
        }
    }

    // Sponsored posts, "suggested" posts and posts from accounts you do not
    // follow all carry a label or a Follow button at the top of the article.
    // The mobile site has no <header> element, so fall back to the article
    // itself and read only its first lines (username, label, Follow button).
    // innerText is used (not textContent) because Instagram pads the
    // "Sponsored" label with hidden decoy spans to dodge text matching.
    const HEADER_LINES = 8;
    const MIN_ARTICLE_HEIGHT = 100; // px; shorter means an unfilled placeholder
    const contentSince = new WeakMap();

    // Instagram only fills a post in as you scroll toward it; until then the
    // <article> is a ~1px placeholder with no text. The recheck window
    // therefore starts when the post first has real content, not when the
    // element first exists, or a sponsored post that fills in late (after
    // the window closed) would slip through.
    function scanArticles() {
        const onFeed = location.pathname === "/";
        const now = Date.now();
        for (const article of document.querySelectorAll(`article:not([${HIDDEN_ATTR}])`)) {
            if (article.offsetHeight < MIN_ARTICLE_HEIGHT) continue;
            if (!contentSince.has(article)) contentSince.set(article, now);
            if (now - contentSince.get(article) > ARTICLE_RECHECK_MS) continue;

            const root = article.querySelector("header") || article;
            const lines = root.innerText.split("\n").slice(0, HEADER_LINES).map(norm);
            let reason = "";
            if (lines.some((line) => SPONSORED.has(line))) reason = "sponsored";
            else if (lines.some((line) => SUGGESTED.has(line))) reason = "suggested";
            // A Follow button means the author is not followed, which on the
            // home feed means the post was recommended. Skip it elsewhere:
            // permalinks of strangers' posts are intended.
            else if (onFeed && lines.some((line) => FOLLOW.has(line))) reason = "follow";
            if (reason) hide(article, true, reason);
        }
    }

    // Standalone suggestion blocks: the sidebar "Suggested for you" panel and
    // the carousel of accounts that Instagram injects between posts.
    const MAX_HIDDEN_LINKS = 60; // see the safety net in hide()
    const MAX_SUGGESTION_LINKS = 40; // a suggestion block has ~5-25 profile links
    const checkedLabels = new WeakSet();

    function scanSuggestionBlocks() {
        // Both blocks have a "See all" link to /explore/people/. Climb to the
        // first ancestor holding the whole account list (3+ profile links).
        // This guess is only trusted on the home page, and only when the block
        // is small: on other pages (notifications has the same "See all" link
        // beside a list of 80+ links) the first ancestor with enough links can
        // be the whole page content, and collapsing it empties the page.
        if (location.pathname === "/") {
            for (const link of document.querySelectorAll('a[href="/explore/people/"]')) {
                if (link.closest(`[${HIDDEN_ATTR}]`)) continue;
                let node = link;
                for (let i = 0; i < 8 && node.parentElement; i++) {
                    node = node.parentElement;
                    const profileLinks = node.querySelectorAll('a[href^="/"]:not([href^="/explore/"])');
                    if (profileLinks.length >= 3) {
                        const small = profileLinks.length <= MAX_SUGGESTION_LINKS;
                        if (small && !node.querySelector("article") && !node.matches("main, body")) {
                            hide(node, true, "suggested-block");
                        }
                        break;
                    }
                }
            }
        }

        // Blocks without that link are found by their heading text. Climb to
        // the child of the feed list (the level whose parent holds articles)
        // so the whole card goes, not just the heading.
        for (const leaf of document.querySelectorAll("span, h2, h3")) {
            if (leaf.children.length || checkedLabels.has(leaf)) continue;
            const text = leaf.textContent;
            if (text.length > 40) continue;

            // Second net for sponsored posts, in case the line scan above
            // missed one (late render, unusual markup). Only a label in the
            // top strip counts, so a comment that says "Sponsored" is safe.
            if (SPONSORED.has(norm(text))) {
                const article = leaf.closest("article");
                if (article) {
                    if (leaf.getBoundingClientRect().top - article.getBoundingClientRect().top < 140) hide(article, true, "sponsored-leaf");
                } else if (location.pathname.startsWith("/stories/") && leaf.getBoundingClientRect().top < 240) {
                    skipStoryAd(leaf);
                }
                continue;
            }
            if (!SUGGESTED.has(norm(text))) continue;
            checkedLabels.add(leaf);
            if (leaf.closest(`[${HIDDEN_ATTR}]`)) continue;

            let node = leaf;
            for (let i = 0; i < 12 && node.parentElement; i++) {
                if (node.parentElement.querySelector("article")) {
                    // Never hide a container that holds other posts.
                    if (!node.querySelector("article")) hide(node, true, "suggested-heading");
                    break;
                }
                node = node.parentElement;
            }
        }
    }

    // ==================== APP PROMPTS ====================

    // Safari's "Open in the Instagram app" bar is not part of the page: Safari
    // builds it from this <meta> tag, so removing the tag (as early as the
    // parser adds it) stops the bar from appearing.
    function removeAppBanner() {
        const head = document.head || document.documentElement;
        for (const meta of head.querySelectorAll('meta[name="apple-itunes-app"], meta[name="google-play-app"]')) {
            meta.remove();
        }
    }

    // In-page prompts ("Open Instagram", "Get the app") are ordinary fixed
    // bars. Links to the app stores are removed outright; a short exact-text
    // match catches the bars that only carry a label.
    const APP_PROMPT_TEXT = new Set([
        "open instagram", "open app", "open in app", "use the app", "get the app",
        "打开 instagram", "打开应用", "打开app", "获取应用", "使用应用",
    ]);
    const APP_PROMPT_MAX_HEIGHT = 200; // px; a full-page overlay is not a prompt

    let lastPromptScan = 0;

    function hideAppPrompts() {
        // Scans every span/link/button, so run it at most every 2 seconds.
        if (Date.now() - lastPromptScan < 2000) return;
        lastPromptScan = Date.now();
        for (const link of document.querySelectorAll(
            'a[href*="apps.apple.com"], a[href*="play.google.com/store"], a[href^="instagram://"]',
        )) {
            hideBranch(link);
        }
        for (const leaf of document.querySelectorAll("span, a, button")) {
            if (leaf.children.length || leaf.closest(`[${HIDDEN_ATTR}]`)) continue;
            if (leaf.textContent.length > 24 || !APP_PROMPT_TEXT.has(norm(leaf.textContent))) continue;
            // Walk up to the fixed or sticky bar that holds the label.
            let node = leaf.parentElement;
            while (node && node !== document.body) {
                const position = getComputedStyle(node).position;
                if ((position === "fixed" || position === "sticky") && node.offsetHeight <= APP_PROMPT_MAX_HEIGHT) {
                    hide(node);
                    break;
                }
                node = node.parentElement;
            }
        }
    }

    // ==================== STORY ADS ====================

    // Story ads live in the story viewer, which has no <article>, and hiding
    // the frame would leave a dead screen that never advances. So when the
    // frame carries a Sponsored label, move on to the next story instead.
    let lastStorySkip = 0;
    const STORY_NEXT = new Set([
        "next", "下一步", "下一个", "下一個", "次へ", "다음",
        "weiter", "suivant", "siguiente", "avanti",
    ]);

    function skipStoryAd(label) {
        const now = Date.now();
        if (now - lastStorySkip < 1200) return; // let the next frame load first
        lastStorySkip = now;

        // The button's label follows the account language like everything
        // else, so an English-only selector missed it in other locales and
        // fell through to the less reliable synthetic tap below.
        const next = [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
            .find((el) => STORY_NEXT.has(norm(el.getAttribute("aria-label"))));
        if (next) {
            next.click();
            return;
        }
        // The mobile viewer has no button: a tap on the right side advances.
        const x = window.innerWidth * 0.85;
        const y = window.innerHeight * 0.5;
        const target = document.elementFromPoint(x, y) || label;
        for (const type of ["pointerdown", "pointerup", "click"]) {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
        }
    }

    // ==================== NAVIGATION TAGGING ====================

    // Instagram's class names are obfuscated and change often, so the nav
    // bars are found by what they contain (the Home / Inbox links) and
    // tagged with their position for the CSS to target.
    const taggedNavs = new WeakSet();

    const MIN_NAV_SIZE = 40; // px; smaller boxes are wrappers, not the bar

    // Instagram's desktop sidebar is a zero-width position:fixed wrapper
    // whose only child (position:absolute, 72px wide) is the visible bar. So
    // climb to the fixed ancestor but tag the highest element on the way that
    // has a real size; tagging the wrapper would give glass to a 1px sliver.
    function tagNavs() {
        const anchors = document.querySelectorAll('a[href="/"], a[href="/direct/inbox/"]');
        for (const anchor of anchors) {
            if (anchor.closest(`[${NAV_ATTR}]`)) continue;
            let best = null;
            let fixed = null;
            for (let node = anchor.parentElement; node && node !== document.body; node = node.parentElement) {
                if (node.offsetWidth >= MIN_NAV_SIZE && node.offsetHeight >= MIN_NAV_SIZE) best = node;
                if (getComputedStyle(node).position === "fixed") {
                    fixed = node;
                    break;
                }
            }
            if (!fixed || !best || taggedNavs.has(best)) continue;

            const rect = best.getBoundingClientRect();
            let kind = "top";
            if (rect.width < rect.height) kind = "side";
            else if (rect.top > window.innerHeight / 2) kind = "bottom";
            best.setAttribute(NAV_ATTR, kind);
            taggedNavs.add(best);
        }

        // The mobile top bar is a full-width fixed <header> (logo, create and
        // notification buttons) with no link to Home inside it, so the anchor
        // search above never finds it. Post headers live inside <article>.
        for (const header of document.querySelectorAll("header")) {
            if (header.closest("article") || taggedNavs.has(header)) continue;
            if (header.offsetWidth < window.innerWidth * 0.9) continue;
            if (getComputedStyle(header).position !== "fixed") continue;
            header.setAttribute(NAV_ATTR, "top");
            taggedNavs.add(header);
        }
    }

    // Rotating a tablet or resizing the window can turn a bottom bar into a
    // sidebar, so drop the tags and let the next scan classify again.
    function resetNavTags() {
        for (const node of document.querySelectorAll(`[${NAV_ATTR}]`)) {
            node.removeAttribute(NAV_ATTR);
            taggedNavs.delete(node);
            // The lens sets backdrop-filter inline, so it would outlive the
            // tag (and the stylesheet) unless it is torn down here too.
            dropLens(node);
        }
        schedule();
    }

    // Mobile browsers fire "resize" every time the address bar collapses or
    // returns, which is all the time while scrolling. Only the width decides
    // the layout (sidebar vs. tab bar), so height-only changes are ignored,
    // and a burst of events (dragging a window edge) is handled once.
    const RESIZE_SETTLE_MS = 200;
    let lastWidth = window.innerWidth;
    let resizeTimer = 0;

    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth === lastWidth) return;
            lastWidth = window.innerWidth;
            resetNavTags();
        }, RESIZE_SETTLE_MS);
    }

    // ==================== LIQUID GLASS ====================

    // Blur alone is the iOS 18 look. iOS 26 glass also refracts: content under
    // the rim bends as if seen through a thick lens. CSS cannot do that, but
    // backdrop-filter accepts an SVG filter, and feDisplacementMap can shift
    // each backdrop pixel using a map image. Only Chromium renders SVG
    // filters inside backdrop-filter; other browsers keep the blur above.
    const SVG_NS = "http://www.w3.org/2000/svg";
    const BEZEL_MAX = 22; // px of rim that refracts
    const MAP_PIXELS = 120000; // cap on displacement map size (CPU cost)
    const lenses = new Map(); // element -> { filter, image, displace, ro, ... }
    let lensDefs = null;
    let lensCount = 0;

    function getLensDefs() {
        if (!lensDefs) {
            const svg = document.createElementNS(SVG_NS, "svg");
            svg.setAttribute("width", "0");
            svg.setAttribute("height", "0");
            svg.setAttribute("aria-hidden", "true");
            svg.style.cssText = "position:absolute;pointer-events:none";
            lensDefs = document.createElementNS(SVG_NS, "defs");
            svg.appendChild(lensDefs);
            document.documentElement.appendChild(svg);
        }
        return lensDefs;
    }

    // Draws the displacement map for a w*h rounded rectangle. In a map,
    // channel 128 means "no shift"; R and G encode the x and y shift. Near
    // the edge each pixel is told to sample from further inside the shape
    // (a convex lens compresses the rim), fading to zero at depth `bezel`.
    function buildLensMap(w, h, radius, bezel) {
        const step = Math.max(1, Math.sqrt((w * h) / MAP_PIXELS));
        const cw = Math.max(1, Math.round(w / step));
        const ch = Math.max(1, Math.round(h / step));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        const image = ctx.createImageData(cw, ch);
        const data = image.data;
        const halfW = w / 2;
        const halfH = h / 2;

        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                const dx = (x + 0.5) * step - halfW;
                const dy = (y + 0.5) * step - halfH;
                // Signed distance to a rounded rectangle, split into the
                // part outside the straight edges (ox, oy) and the part
                // inside (qx, qy are negative there).
                const qx = Math.abs(dx) - (halfW - radius);
                const qy = Math.abs(dy) - (halfH - radius);
                const ox = Math.max(qx, 0);
                const oy = Math.max(qy, 0);
                const depth = radius - Math.hypot(ox, oy) - Math.min(Math.max(qx, qy), 0);

                let vx = 0;
                let vy = 0;
                if (depth < bezel) {
                    // Outward normal at the nearest edge point.
                    let nx;
                    let ny;
                    if (ox > 0 || oy > 0) {
                        const len = Math.hypot(ox, oy);
                        nx = (Math.sign(dx) * ox) / len;
                        ny = (Math.sign(dy) * oy) / len;
                    } else if (qx > qy) {
                        nx = Math.sign(dx);
                        ny = 0;
                    } else {
                        nx = 0;
                        ny = Math.sign(dy);
                    }
                    const strength = Math.pow(1 - Math.max(depth, 0) / bezel, 2);
                    vx = -nx * strength;
                    vy = -ny * strength;
                }
                const i = (y * cw + x) * 4;
                data[i] = 128 + vx * 127;
                data[i + 1] = 128 + vy * 127;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL();
    }

    // The map has to match the element's size and corner radius, so every
    // glass element gets its own filter, rebuilt when it is resized.
    function updateLens(el, lens) {
        // offsetWidth ignores transforms, so a dialog mid scale-in animation
        // is measured at its real size.
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w < 8 || h < 8) return;
        const radius = Math.min(
            parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
            w / 2,
            h / 2,
        );
        if (w === lens.w && h === lens.h && radius === lens.radius) return;
        Object.assign(lens, { w, h, radius });

        const bezel = Math.max(4, Math.min(BEZEL_MAX, Math.min(w, h) / 2));
        lens.image.setAttribute("href", buildLensMap(w, h, radius, bezel));
        lens.image.setAttribute("width", w);
        lens.image.setAttribute("height", h);
        lens.displace.setAttribute("scale", String(Math.round(bezel * 1.8)));

        // Only switch the element over once its map exists; before that the
        // stylesheet's plain blur stays in place.
        const value = `url(#${lens.id}) saturate(1.7)`;
        el.style.setProperty("backdrop-filter", value, "important");
        el.style.setProperty("-webkit-backdrop-filter", value, "important");
    }

    function ensureLens(el) {
        if (!LENS_SUPPORTED) return;
        let lens = lenses.get(el);
        if (!lens) {
            // A full-screen "dialog" is a backdrop wrapper, not a glass pane.
            if (el.offsetWidth * el.offsetHeight > window.innerWidth * window.innerHeight * 0.8) return;

            const id = `igx-lens-${++lensCount}`;
            const filter = document.createElementNS(SVG_NS, "filter");
            filter.setAttribute("id", id);
            filter.setAttribute("x", "0");
            filter.setAttribute("y", "0");
            filter.setAttribute("width", "100%");
            filter.setAttribute("height", "100%");
            // Map values are raw channel numbers, not colors; keep sRGB so
            // the browser does not gamma-correct them.
            filter.setAttribute("color-interpolation-filters", "sRGB");

            const image = document.createElementNS(SVG_NS, "feImage");
            image.setAttribute("x", "0");
            image.setAttribute("y", "0");
            image.setAttribute("preserveAspectRatio", "none");
            image.setAttribute("result", "map");

            // A light blur first, so the bent content stays smooth.
            const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
            blur.setAttribute("in", "SourceGraphic");
            blur.setAttribute("stdDeviation", "3");
            blur.setAttribute("result", "soft");

            const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
            displace.setAttribute("in", "soft");
            displace.setAttribute("in2", "map");
            displace.setAttribute("xChannelSelector", "R");
            displace.setAttribute("yChannelSelector", "G");

            filter.append(image, blur, displace);
            getLensDefs().appendChild(filter);

            lens = { id, filter, image, displace, w: 0, h: 0, radius: -1 };
            lens.ro = new ResizeObserver(() => updateLens(el, lens));
            lens.ro.observe(el);
            lenses.set(el, lens);
        }
        updateLens(el, lens);
    }

    // Dialogs and menus are created and destroyed constantly; drop the
    // filters of elements that left the page.
    function pruneLenses() {
        for (const el of lenses.keys()) {
            if (!el.isConnected) dropLens(el);
        }
    }

    function dropLens(el) {
        const lens = lenses.get(el);
        if (!lens) return;
        lens.ro.disconnect();
        lens.filter.remove();
        el.style.removeProperty("backdrop-filter");
        el.style.removeProperty("-webkit-backdrop-filter");
        lenses.delete(el);
    }

    function applyLenses() {
        pruneLenses();
        const targets = document.querySelectorAll(
            `[${NAV_ATTR}]:not([${NAV_ATTR}="top"]), [role="dialog"], [role="menu"]`,
        );
        for (const el of targets) ensureLens(el);
    }

    // ==================== SEARCH RESULTS ====================

    // On the Explore / search pages the search bar is position:fixed and the
    // results (or "Recent" list) sit in a scrolling container inside a chain
    // of flex parents, in a narrow column. With the recommended grid gone,
    // nothing below gives that chain a height, so it collapses to its
    // content: results get clipped to a few pixels, and the "No recent
    // searches" message lands on top of the "Recent" heading. This marks the
    // scroller ("panel") and its parents so the stylesheet can give them the
    // full width and the height of the screen. It finds them by behavior
    // (a scrolling, non-fixed container under <main> > <nav>), not by class
    // names, so it does not depend on Instagram's obfuscated CSS.
    function growSearchResults() {
        if (!location.pathname.startsWith("/explore/")) return;
        const nav = document.querySelector("main > nav");
        if (!nav) return;
        for (const panel of nav.querySelectorAll("div")) {
            if (panel.getAttribute(GROW_ATTR) === "panel") return;
            const style = getComputedStyle(panel);
            if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
            if (style.position === "fixed") continue;
            panel.setAttribute(GROW_ATTR, "panel");
            for (let node = panel.parentElement; node && node !== nav.parentElement; node = node.parentElement) {
                node.setAttribute(GROW_ATTR, "");
            }
            return;
        }
    }

    // ==================== CANVAS ====================

    // Finds the full-screen element that paints the page white (it is a
    // wrapper around everything, not <body>) and marks it for the stylesheet.
    function tagCanvas() {
        if (document.querySelector("[data-igx-canvas]")) return;
        const start = document.querySelector("main") || document.querySelector("article");
        for (let node = start; node && node !== document.body; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            const opaque = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
            if (opaque && node.offsetWidth >= window.innerWidth * 0.9 && node.offsetHeight >= window.innerHeight * 0.9) {
                node.setAttribute("data-igx-canvas", "");
                return;
            }
        }
    }

    // ==================== SCROLLING ====================

    const SCROLL_TRAVEL = 12; // px in one direction before the bars react
    const SCROLL_TOP_ZONE = 60; // px from the top where the bars always show
    const SCROLL_IDLE_MS = 150; // quiet time after which scrolling counts as over
    let isScrolling = false;
    let scrollIdleTimer = 0;
    let scrollFramePending = false;
    let lastScrollY = 0;
    let travel = 0; // signed distance since the direction last changed

    function setBarsHidden(hidden) {
        document.documentElement.toggleAttribute(CHROME_HIDDEN_ATTR, hidden);
    }

    // Runs once per frame at most, however many scroll events arrive.
    function processScroll() {
        scrollFramePending = false;
        const y = window.scrollY;
        const delta = y - lastScrollY;
        lastScrollY = y;
        if (y < SCROLL_TOP_ZONE) {
            travel = 0;
            setBarsHidden(false);
            return;
        }
        // A reversal restarts the count, so a small wobble never toggles.
        if (delta !== 0 && Math.sign(delta) !== Math.sign(travel)) travel = 0;
        travel += delta;
        if (travel > SCROLL_TRAVEL) setBarsHidden(true);
        else if (travel < -SCROLL_TRAVEL) setBarsHidden(false);
    }

    // Capture phase on window so the handler sees every scroll, but only
    // the page's own scroller counts: the stories tray, dialogs and menus
    // scroll too, and must not hide the bars.
    function onScroll(event) {
        const target = event.target;
        if (target !== document && target !== document.documentElement && target !== document.scrollingElement) return;

        isScrolling = true;
        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = setTimeout(() => {
            isScrolling = false;
            schedule(); // catch up on everything skipped during the scroll
        }, SCROLL_IDLE_MS);

        if (!scrollFramePending) {
            scrollFramePending = true;
            requestAnimationFrame(processScroll);
        }
    }

    // ==================== IMAGE RETRY ====================

    // Instagram's CDN sometimes refuses or drops an image request (a burst of
    // requests while scrolling is enough), and the page does not retry: the
    // post is left with a grey placeholder. Re-assigning the same URL a
    // moment later makes the browser request it again.
    const IMAGE_RETRIES = 2;
    const IMAGE_RETRY_DELAY_MS = 1200;
    const imageRetries = new WeakMap();

    function onImageError(event) {
        const img = event.target;
        if (!(img instanceof HTMLImageElement)) return;
        const src = img.getAttribute("src");
        if (!src || src.startsWith("data:")) return;
        const tries = imageRetries.get(img) || 0;
        if (tries >= IMAGE_RETRIES) return;
        imageRetries.set(img, tries + 1);
        // Feed images also carry a srcset, and the browser loads whichever
        // srcset candidate fits the screen, not src. Re-setting src alone
        // leaves that choice untouched and nothing is fetched again, so the
        // srcset is cleared and restored along with it.
        const srcset = img.getAttribute("srcset");
        setTimeout(() => {
            if (!img.isConnected || img.getAttribute("src") !== src) return;
            img.removeAttribute("srcset");
            img.removeAttribute("src");
            if (srcset) img.setAttribute("srcset", srcset);
            img.setAttribute("src", src);
        }, IMAGE_RETRY_DELAY_MS * (tries + 1));
    }

    // ==================== MAIN ====================

    // While scrolling, only the cheap passes run every time (new posts must
    // be judged before they scroll into view). The passes that read text from
    // every element or force layout are limited to one per FULL_SCAN_MS, so
    // they do not compete with the scroll for the main thread.
    const FULL_SCAN_MS = 800;
    let lastFullScan = 0;

    function run() {
        try {
            guardRoute();
            hideNavLinks();
            scanArticles();
            growSearchResults();
            const now = Date.now();
            if (isScrolling && now - lastFullScan < FULL_SCAN_MS) return;
            lastFullScan = now;
            scanSuggestionBlocks();
            tagNavs();
            tagCanvas();
            applyLenses();
            hideAppPrompts();
        } catch (err) {
            console.warn("[Instagram Lite]", err);
        }
    }

    // Trailing throttle: Instagram mutates the DOM constantly while
    // scrolling, and the scans do not need to run on every burst.
    let timer = 0;
    function schedule() {
        if (timer) return;
        timer = setTimeout(() => {
            timer = 0;
            run();
        }, SCAN_DELAY_MS);
    }

    // Must run first: requests the page makes while loading are the ones
    // worth blocking.
    blockRequests();
    injectStyle();
    guardRoute();
    watchHistory();

    // childList only: the scans set attributes themselves, and observing
    // those would make every scan trigger the next one.
    removeAppBanner();
    new MutationObserver((records) => {
        removeAppBanner();
        injectNetworkBlock();
        dropTrackerNodes(records);
        schedule();
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    // "error" does not bubble, so it has to be caught in the capture phase.
    document.addEventListener("error", onImageError, true);
    document.addEventListener("play", onMediaPlay, true);
    schedule();
})();
