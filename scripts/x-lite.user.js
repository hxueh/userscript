// ==UserScript==
// @name         X Lite
// @namespace    https://greasyfork.org/users/36282-hxueh
// @version      0.5.1
// @description  An iOS 27-inspired X with liquid glass tabs, navigation and tweet cards, mobile dock, manual video playback, no sidebar or Grok, and best-effort analytics blocking.
// @author       hxueh
// @license      MIT
// @match        https://x.com/*
// @match        https://www.x.com/*
// @match        https://twitter.com/*
// @match        https://www.twitter.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==

(() => {
    'use strict';

    // Ask supporting browsers to mix audio instead of claiming exclusive
    // playback. Older WebKit builds expose the same behavior as "transient".
    let audioMixType = 'unsupported';
    try {
        const session = navigator.audioSession;
        if (session) {
            for (const type of ['ambient', 'transient']) {
                try { session.type = type; if (session.type === type) { audioMixType = type; break; } } catch { /* Try the older API value. */ }
            }
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(session), 'type');
            if (audioMixType !== 'unsupported' && descriptor?.set && descriptor.configurable) {
                Object.defineProperty(session, 'type', {
                    get() { return Reflect.apply(descriptor.get, this, []); },
                    set(value) {
                        // Explicit microphone calls retain their recording mode.
                        return Reflect.apply(descriptor.set, this, [value === 'play-and-record' ? value : audioMixType]);
                    },
                    configurable: true
                });
            }
        }
    } catch { /* Audio-session hints are optional; silent defaults still apply. */ }

    // These controls belong to this page only. Decline X's lock-screen metadata
    // and transport handlers so opening it does not advertise a new music player.
    try {
        const session = navigator.mediaSession;
        if (session) {
            const prototype = Object.getPrototypeOf(session);
            for (const [property, neutral] of [['metadata', null], ['playbackState', 'none']]) {
                const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
                if (!descriptor?.set) continue;
                Reflect.apply(descriptor.set, session, [neutral]);
                if (descriptor.configurable) Object.defineProperty(session, property, {
                    get() { return Reflect.apply(descriptor.get, this, []); },
                    set() { return Reflect.apply(descriptor.set, this, [neutral]); },
                    configurable: true
                });
            }
            const nativeHandler = session.setActionHandler;
            for (const action of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
                try { Reflect.apply(nativeHandler, session, [action, null]); } catch { /* Action not supported here. */ }
            }
            session.setActionHandler = function (action) { return Reflect.apply(nativeHandler, this, [action, null]); };
            if (session.setPositionState) session.setPositionState = function () {};
        }
    } catch { /* Some browsers expose only part of MediaSession. */ }

    // Run in the page realm at document-start so X sees these wrappers. This
    // cannot filter requests from workers, other realms, or before injection.
    const trackerDomains = [
        'analytics.twitter.com', 'ads-api.twitter.com', 'ads-twitter.com',
        'analytics.x.com', 'ads-api.x.com', 'google-analytics.com',
        'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
        'scorecardresearch.com', 'hotjar.com', 'sentry.io'
    ];
    const inDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
    const blockedCounts = { fetch: 0, xhr: 0, beacon: 0, resource: 0 };
    function recordBlock(kind) {
        blockedCounts[kind]++;
        // Counts provide local diagnostics without retaining URLs or payloads.
        document.documentElement?.setAttribute('data-xl-blocks', JSON.stringify(blockedCounts));
    }
    function blockedURL(input) {
        try {
            const url = new URL(input instanceof Request ? input.url : String(input), location.href);
            if (!/^https?:$/.test(url.protocol)) return false;
            if (trackerDomains.some(domain => inDomain(url.hostname, domain))) return true;
            // Match telemetry paths, never generic API/GraphQL or media paths.
            return ['x.com', 'twitter.com'].some(domain => inDomain(url.hostname, domain)) &&
                /^\/(?:i\/(?:api\/)?)?(?:1\.1\/)?(?:jot(?:\/|$)|scribe(?:\/|$))/.test(url.pathname);
        } catch {
            return false;
        }
    }
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        // A rejected request exposes the block to callers; do not fabricate a
        // successful server response for a request that was never transmitted.
        if (blockedURL(input)) {
            recordBlock('fetch');
            return Promise.reject(new TypeError('X Lite blocked an analytics request'));
        }
        return Reflect.apply(originalFetch, this, [input, init]);
    };
    const originalBeacon = navigator.sendBeacon;
    if (originalBeacon) navigator.sendBeacon = function (url, data) {
        if (blockedURL(url)) { recordBlock('beacon'); return false; }
        return Reflect.apply(originalBeacon, this, [url, data]);
    };
    const blockedXHR = new WeakSet();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...options) {
        // open() validates arguments but does not transmit a request. Keep its
        // native behavior and make the blocking decision at send().
        const result = Reflect.apply(originalOpen, this, [method, url, ...options]);
        if (blockedURL(url)) blockedXHR.add(this);
        else blockedXHR.delete(this);
        return result;
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (blockedXHR.has(this)) {
            recordBlock('xhr');
            this.abort();
            throw new DOMException('X Lite blocked an analytics request', 'NetworkError');
        }
        return Reflect.apply(originalSend, this, args);
    };

    const resourceSelector = 'script[src], iframe[src], img[src], link[rel="preload"][href], link[rel="prefetch"][href], link[rel="modulepreload"][href]';
    function cleanResource(element) {
        const attribute = element.tagName === 'LINK' ? 'href' : 'src';
        if (!blockedURL(element.getAttribute(attribute))) return;
        recordBlock('resource');
        // Disable script execution as well as its URL. Removing a script after
        // the parser starts loading it is only a fallback, not a network filter.
        if (element.tagName === 'SCRIPT') element.type = 'application/x-x-lite-blocked';
        element.removeAttribute(attribute);
        element.setAttribute('data-xl-blocked', '');
    }
    function cleanTree(node) {
        if (node.nodeType === 1 && node.matches(resourceSelector)) cleanResource(node);
        if (node.querySelectorAll) node.querySelectorAll(resourceSelector).forEach(cleanResource);
        if (node.nodeType === 1 && node.matches('a[ping]')) node.removeAttribute('ping');
        if (node.querySelectorAll) node.querySelectorAll('a[ping]').forEach(link => link.removeAttribute('ping'));
    }
    // Catch dynamically inserted trackers before insertion, including scripts
    // inside fragments. Native insertion still performs its own validation.
    for (const name of ['appendChild', 'insertBefore', 'replaceChild']) {
        const original = Node.prototype[name];
        Node.prototype[name] = function (node, ...rest) {
            if (node instanceof Node) cleanTree(node);
            return Reflect.apply(original, this, [node, ...rest]);
        };
    }
    // Setters also cover connected elements whose URL changes after insertion.
    for (const [prototype, property] of [
        [HTMLScriptElement.prototype, 'src'],
        [HTMLImageElement.prototype, 'src'],
        [HTMLIFrameElement.prototype, 'src']
    ]) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
        if (!descriptor?.set || !descriptor.configurable) continue;
        Object.defineProperty(prototype, property, {
            ...descriptor,
            set(value) {
                if (blockedURL(value)) {
                    recordBlock('resource');
                    if (this.tagName === 'SCRIPT') this.type = 'application/x-x-lite-blocked';
                    this.removeAttribute(property);
                    this.setAttribute('data-xl-blocked', '');
                    return;
                }
                return Reflect.apply(descriptor.set, this, [value]);
            }
        });
    }
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        const attribute = String(name).toLowerCase();
        if (attribute === 'autoplay' && this.tagName === 'VIDEO') {
            this.removeAttribute('autoplay');
            return;
        }
        const resource = attribute === 'src' && /^(SCRIPT|IMG|IFRAME)$/.test(this.tagName);
        if (resource && blockedURL(value)) {
            recordBlock('resource');
            if (this.tagName === 'SCRIPT') this.type = 'application/x-x-lite-blocked';
            this.removeAttribute(attribute);
            return Reflect.apply(originalSetAttribute, this, ['data-xl-blocked', '']);
        }
        return Reflect.apply(originalSetAttribute, this, [name, value]);
    };

    const style = document.createElement('style');
    style.id = 'x-lite-style';
    style.dataset.version = '0.5.1';
    // Stable roles and test IDs survive X's generated class-name changes.
    // CSS also applies to content mounted later, before an observer can run.
    style.textContent = `
        :root {
            --xl-rail: 88px;
            --xl-feed: 900px;
            --xl-glass: rgba(250,252,255,.88);
            --xl-line: rgba(100,116,139,.18);
            --xl-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 8px 28px rgba(15,23,42,.09);
            --xl-ink: #17212f;
            --xl-accent: #007aff;
            --xl-canvas: #f5f6f8;
            --xl-post: rgba(255,255,255,.74);
            --xl-card-line: rgba(255,255,255,.90);
            --xl-highlight: rgba(255,255,255,.55);
            --xl-card-shadow: inset 0 1px 0 var(--xl-highlight), 0 2px 10px rgba(25,35,50,.045);
        }
        :root[data-xl-dark] {
            --xl-glass: rgba(28,34,44,.90);
            --xl-line: rgba(203,213,225,.18);
            --xl-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 8px 28px rgba(0,0,0,.24);
            --xl-ink: #f2f5fa;
            --xl-accent: #64a8ff;
            --xl-canvas: #10151c;
            --xl-post: rgba(29,36,46,.82);
            --xl-card-line: rgba(255,255,255,.10);
            --xl-highlight: rgba(255,255,255,.10);
        }
        [data-testid="sidebarColumn"],
        a[href="/i/grok"], a[href^="/i/grok/"], a[href^="/i/grok?"],
        a[href="/i/premium_sign_up"],
        [data-testid="GrokDrawer"], [data-testid="GrokDrawerHeader"],
        [data-testid="grok-drawer"],
        button[aria-label*="Grok" i], [role="button"][aria-label*="Grok" i],
        button[aria-label="Generate image"],
        [data-xl-hidden],
        [data-testid="cellInnerDiv"]:has([data-testid="placementTracking"]),
        [data-testid="cellInnerDiv"]:has([data-testid="promotedIndicator"]),
        article:has([data-testid="placementTracking"]),
        article:has([data-testid="promotedIndicator"]) {
            display: none !important;
        }
        /* Leave a readable column instead of stretching posts across the screen. */
        div:has(> header[role="banner"]):has(> main[role="main"]) {
            justify-content: center !important;
        }
        header[role="banner"] { flex: 0 0 var(--xl-rail) !important; width: var(--xl-rail) !important; }
        header[role="banner"] > div,
        header[role="banner"] > div > div { width: var(--xl-rail) !important; }
        main[role="main"] {
            align-items: flex-start !important;
            flex: 0 1 var(--xl-feed) !important;
            min-width: 0 !important;
        }
        main[role="main"] > div { width: min(100%, var(--xl-feed)) !important; }
        [data-testid="primaryColumn"] {
            width: 100% !important;
            max-width: var(--xl-feed) !important;
            min-width: 0 !important;
            border-color: var(--xl-line) !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
            background: var(--xl-canvas) !important;
        }
        /* X caps the inner timeline at 600px independently of primaryColumn.
           Stretch only its outer wrapper so cards fill the feed without changing
           quoted posts, media sizing, or the virtualized row positioning. */
        [data-testid="primaryColumn"] div:has(> section[role="region"] [data-testid="cellInnerDiv"]) {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
        }
        /* Tinted glass uses an opaque-enough base to keep text readable. */
        header[role="banner"] nav {
            margin: 12px 8px;
            padding: 8px 4px;
            border: 1px solid var(--xl-line);
            border-radius: 32px;
            background: var(--xl-glass) !important;
            -webkit-backdrop-filter: blur(28px) saturate(145%);
            backdrop-filter: blur(28px) saturate(145%);
            box-shadow: var(--xl-shadow);
        }
        header[role="banner"] nav a,
        header[role="banner"] nav [role="button"] {
            border-radius: 24px !important;
        }
        header[role="banner"] nav a:hover,
        header[role="banner"] nav [role="button"]:hover,
        [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]) {
            background: var(--xl-glass) !important;
            -webkit-backdrop-filter: blur(22px) saturate(150%);
            backdrop-filter: blur(22px) saturate(150%);
            box-shadow: var(--xl-shadow);
        }
        [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]) {
            margin: 8px;
            padding: 4px;
            border: 1px solid var(--xl-line);
            border-radius: 28px;
            overflow: hidden;
        }
        [data-testid="primaryColumn"] [role="tab"] {
            border-radius: 22px;
            min-height: 44px;
            color: var(--xl-ink) !important;
        }
        [data-testid="primaryColumn"] [role="tab"][aria-selected="true"] {
            background: color-mix(in srgb, var(--xl-accent) 14%, transparent) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.15);
        }
        article[data-testid="tweet"] {
            margin: 8px;
            border: 1px solid var(--xl-card-line) !important;
            border-radius: 24px;
            background: var(--xl-post) !important;
            box-shadow: var(--xl-card-shadow);
        }
        article[data-testid="tweet"][data-xl-visible] {
            -webkit-backdrop-filter: blur(16px) saturate(135%);
            backdrop-filter: blur(16px) saturate(135%);
        }
        /* Preserve X's virtualized rows inside one continuous thread surface.
           Individual posts retain only a divider, with no card gaps or corners. */
        [data-xl-thread] {
            margin: 8px;
            border: 1px solid var(--xl-card-line);
            border-radius: 24px;
            background: var(--xl-post);
            box-shadow: var(--xl-card-shadow);
            overflow: clip;
        }
        [data-xl-thread] article[data-testid="tweet"] {
            margin: 0 !important;
            border: 0 !important;
            border-bottom: 1px solid var(--xl-line) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        [data-xl-thread] [data-testid="cellInnerDiv"] > div {
            border-bottom-width: 0 !important;
        }
        /* Joined feed rows keep only the outside corners and one divider.
           Removing the vertical margins lets X remeasure its native cells. */
        article[data-testid="tweet"][data-xl-join-prev] {
            margin-top: 0 !important;
            border-top: 0 !important;
            border-top-left-radius: 0 !important;
            border-top-right-radius: 0 !important;
            box-shadow: none !important;
        }
        article[data-testid="tweet"][data-xl-join-next] {
            margin-bottom: 0 !important;
            border-bottom: 1px solid var(--xl-line) !important;
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            box-shadow: none !important;
        }
        [data-testid="cellInnerDiv"]:has([data-xl-join-next]) > div { border-bottom-width: 0 !important; }
        [data-testid="tweetTextarea_0"] { font-family: inherit; }
        a:focus-visible, button:focus-visible, [role="button"]:focus-visible,
        [role="tab"]:focus-visible {
            outline: 2px solid var(--xl-accent) !important;
            outline-offset: -3px;
        }
        [role="dialog"] {
            border-radius: 24px !important;
            box-shadow: var(--xl-shadow);
        }
        #x-lite-dock, #x-lite-compose { display: none; }
        .x-lite-sound {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 5;
            padding: 8px 12px;
            min-height: 44px;
            border: 1px solid rgba(255,255,255,.35);
            border-radius: 20px;
            background: rgba(16,24,36,.88);
            color: white;
            font: 600 13px -apple-system, system-ui, sans-serif;
            cursor: pointer;
            touch-action: manipulation;
        }
        /* X switches the nav to icon-plus-label at 1265px. The widest label
           ("Follower requests") plus the nav's margin needs about 340px, so a
           narrower rail lets the glass nav spill over the feed. */
        @media (min-width: 1265px) { :root { --xl-rail: 344px; } }
        @media (max-width: 700px) {
            :root[data-xl-dock] header[role="banner"] { display: none !important; }
            :root[data-xl-dock] main[role="main"] {
                flex-basis: 100% !important;
                padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
            }
            main[role="main"] > div { width: 100% !important; }
            #x-lite-dock {
                display: grid;
                grid-template-columns: repeat(7, minmax(0, 1fr));
                position: fixed;
                z-index: 8;
                left: max(6px, env(safe-area-inset-left, 0px));
                right: max(6px, env(safe-area-inset-right, 0px));
                bottom: max(8px, env(safe-area-inset-bottom, 0px));
                min-height: 56px;
                border-radius: 28px;
                border: 1px solid var(--xl-line);
                background: var(--xl-glass);
                -webkit-backdrop-filter: blur(18px) saturate(135%);
                backdrop-filter: blur(18px) saturate(135%);
                box-shadow: var(--xl-shadow);
            }
            #x-lite-dock a, #x-lite-dock button, #x-lite-compose {
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--xl-ink);
                background: transparent;
                border: 0;
                border-radius: 24px;
                min-width: 0;
                min-height: 48px;
                font: 24px system-ui;
                cursor: pointer;
                text-decoration: none;
                touch-action: manipulation;
            }
            #x-lite-dock svg, #x-lite-compose svg { width: 24px; height: 24px; fill: currentColor; }
            #x-lite-dock [aria-current="page"] { color: var(--xl-accent); background: color-mix(in srgb, var(--xl-accent) 12%, transparent); }
            #x-lite-compose {
                display: flex;
                position: fixed;
                right: max(16px, env(safe-area-inset-right, 0px));
                bottom: calc(80px + env(safe-area-inset-bottom, 0px));
                width: 52px;
                height: 52px;
                z-index: 8;
                color: white;
                background: #007aff;
                box-shadow: var(--xl-shadow);
            }
            /* Portalled dialogs must remain above our dock and compose button. */
            body:has([role="dialog"]) #x-lite-dock,
            body:has([role="dialog"]) #x-lite-compose,
            :root[data-xl-composing] #x-lite-dock,
            :root[data-xl-composing] #x-lite-compose { display: none; }
            [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]) {
                margin: 4px;
                padding: 2px;
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.15);
            }
            [role="dialog"] { border-radius: 16px !important; }
            article[data-testid="tweet"] { margin: 6px; border-radius: 20px; }
            [data-xl-thread] { margin: 6px; border-radius: 20px; }
            article[data-testid="tweet"][data-xl-visible] {
                -webkit-backdrop-filter: blur(8px) saturate(120%);
                backdrop-filter: blur(8px) saturate(120%);
            }
        }

        /* Liquid glass: translucent bodies, a bright specular rim on the top edge,
           a faint tinted rim on the bottom, and extra saturation so the feed
           colours bleed through the way they do on iOS. Backdrop blur is only on
           the outer container; nested backdrop-filters would not blur the page. */
        :root {
            --xl-lg-fill: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.28));
            --xl-lg-rim: inset 0 1px 0 rgba(255,255,255,.95), inset 0 -1px 0 rgba(255,255,255,.35), inset 0 0 0 1px rgba(255,255,255,.35);
            --xl-lg-drop: 0 10px 30px rgba(15,23,42,.12), 0 1px 3px rgba(15,23,42,.08);
            --xl-lg-pill: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.62));
        }
        :root[data-xl-dark] {
            --xl-lg-fill: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05));
            --xl-lg-rim: inset 0 1px 0 rgba(255,255,255,.38), inset 0 -1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.10);
            --xl-lg-drop: 0 10px 30px rgba(0,0,0,.40), 0 1px 3px rgba(0,0,0,.30);
            --xl-lg-pill: linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.12));
        }
        header[role="banner"] nav,
        [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]),
        #x-lite-dock {
            background: var(--xl-lg-fill), color-mix(in srgb, var(--xl-glass) 38%, transparent) !important;
            -webkit-backdrop-filter: blur(24px) saturate(190%) brightness(1.04);
            backdrop-filter: blur(24px) saturate(190%) brightness(1.04);
            border-color: transparent !important;
            box-shadow: var(--xl-lg-rim), var(--xl-lg-drop) !important;
            /* iOS Safari skips backdrop-filter on rounded, clipped elements until
               they get their own compositing layer; these force one. */
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            isolation: isolate;
            will-change: backdrop-filter;
        }
        /* overflow:hidden on the tab list is another WebKit trigger for losing the blur. */
        [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]) {
            overflow: visible !important;
            position: sticky;
            top: 6px;
            z-index: 3;
        }
        /* X draws the selected tab as a coloured underline; the glass pill replaces it. */
        [data-testid="primaryColumn"] [role="tablist"] [role="tab"] div:empty {
            background: transparent !important;
        }
        [data-testid="primaryColumn"] [role="tablist"] [role="tab"] {
            transition: background .25s ease, box-shadow .25s ease, transform .25s ease;
        }
        [data-testid="primaryColumn"] [role="tablist"] [role="tab"]:hover {
            background: color-mix(in srgb, var(--xl-ink) 7%, transparent) !important;
        }
        [data-testid="primaryColumn"] [role="tablist"] [role="tab"][aria-selected="true"] {
            background: var(--xl-lg-pill) !important;
            box-shadow: var(--xl-lg-rim), 0 4px 14px rgba(15,23,42,.14) !important;
        }
        [data-testid="primaryColumn"] [role="tablist"] [role="tab"][aria-selected="true"]:active {
            transform: scale(.97);
        }
        header[role="banner"] nav a:hover,
        header[role="banner"] nav [role="button"]:hover {
            background: var(--xl-lg-pill) !important;
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            box-shadow: var(--xl-lg-rim) !important;
        }
        #x-lite-dock [aria-current="page"] {
            background: var(--xl-lg-pill) !important;
            box-shadow: var(--xl-lg-rim), 0 3px 10px rgba(15,23,42,.14);
        }
        #x-lite-compose {
            background: linear-gradient(180deg, color-mix(in srgb, var(--xl-accent) 78%, white), var(--xl-accent)) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.7), inset 0 0 0 1px rgba(255,255,255,.25), var(--xl-lg-drop) !important;
        }
        @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
            header[role="banner"] nav, [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]), #x-lite-dock {
                background: var(--xl-lg-fill), var(--xl-glass) !important;
            }
        }
        @media (prefers-reduced-transparency: reduce) {
            :root { --xl-glass: #fff; --xl-post: #fff; --xl-highlight: transparent; }
            :root[data-xl-dark] { --xl-glass: #151c26; --xl-post: #151c26; }
            article[data-testid="tweet"][data-xl-visible] { -webkit-backdrop-filter: none; backdrop-filter: none; }
            header[role="banner"] nav, [data-testid="primaryColumn"] [role="tablist"]:has([role="tab"]), #x-lite-dock {
                background: var(--xl-glass) !important;
                -webkit-backdrop-filter: none;
                backdrop-filter: none;
            }
        }
        @media (prefers-contrast: more) {
            :root { --xl-glass: #fff; --xl-post: #fff; --xl-line: #657180; --xl-card-line: var(--xl-line); --xl-highlight: transparent; }
            :root[data-xl-dark] { --xl-glass: #151c26; --xl-post: #151c26; --xl-line: #a7b2c0; }
        }
    `;

    const labels = {
        suggestions: new Set(['who to follow', 'you might like', '你可能喜欢', '你可能喜歡', '推荐关注', '推薦跟隨', 'おすすめユーザー'])
    };
    const normalized = element => element.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
    let queued = false;
    const threadContainers = new Set();
    const joinedPosts = new Set();
    function nativeThreadLines(post) {
        const avatar = post.querySelector('[data-testid="Tweet-User-Avatar"]');
        const column = avatar?.parentElement;
        // X renders a thin, empty colored div below the avatar and another in
        // the preceding header row. Use their structure and width, not hashed
        // class names or author equality: replies can have different authors.
        const isLine = element => {
            if (element.tagName !== 'DIV' || element.children.length || element.textContent.trim()) return false;
            const css = getComputedStyle(element);
            const width = Number.parseFloat(css.width);
            return width >= 1 && width <= 3 && css.backgroundColor !== 'rgba(0, 0, 0, 0)' && css.backgroundColor !== 'transparent';
        };
        const upper = column?.parentElement?.previousElementSibling;
        return {
            down: Boolean(column && [...column.children].some(element => element !== avatar && isLine(element))),
            up: Boolean(upper && [...upper.querySelectorAll('div')].some(isLine))
        };
    }
    function syncThreads() {
        const desired = new Set();
        const joins = new Map();
        const primary = document.querySelector('[data-testid="primaryColumn"]');
        if (primary && /\/status\/\d+(?:\/|$)/.test(location.pathname)) {
            // The nearest labeled ancestor of a top-level post is X's native
            // conversation timeline. Its label can be in any language.
            const firstPost = primary.querySelector('article[data-testid="tweet"]');
            const timeline = firstPost?.parentElement.closest('div[aria-label]');
            if (timeline && primary.contains(timeline) && timeline.querySelector('[data-testid="cellInnerDiv"]')) desired.add(timeline);
        } else if (primary) {
            // Keep React's separate virtualized cells intact. Matching native
            // connector ends identify a conversation spanning adjacent rows;
            // corner and margin changes make those rows one visual surface.
            for (const cell of primary.querySelectorAll('[data-testid="cellInnerDiv"]')) {
                if (cell.querySelectorAll('article[data-testid="tweet"]').length > 1 && cell.firstElementChild) desired.add(cell.firstElementChild);
            }
        }
        if (primary && !/\/status\/\d+(?:\/|$)/.test(location.pathname)) {
            const cells = [...primary.querySelectorAll('[data-testid="cellInnerDiv"]')];
            for (let index = 1; index < cells.length; index++) {
                const before = cells[index - 1];
                const after = cells[index];
                if (before.parentElement !== after.parentElement || getComputedStyle(before).display === 'none' || getComputedStyle(after).display === 'none') continue;
                const previous = before.querySelectorAll('article[data-testid="tweet"]');
                const current = after.querySelectorAll('article[data-testid="tweet"]');
                if (previous.length !== 1 || current.length !== 1) continue;
                if (!nativeThreadLines(previous[0]).down || !nativeThreadLines(current[0]).up) continue;
                joins.set(previous[0], { ...joins.get(previous[0]), next: true });
                joins.set(current[0], { ...joins.get(current[0]), previous: true });
            }
        }
        // Recompute both ends after recycling or route changes so stale joins
        // cannot attach an unrelated post that reuses a native cell.
        for (const post of new Set([...joinedPosts, ...joins.keys()])) {
            const state = joins.get(post);
            post.toggleAttribute('data-xl-join-prev', Boolean(state?.previous));
            post.toggleAttribute('data-xl-join-next', Boolean(state?.next));
            if (state) joinedPosts.add(post); else joinedPosts.delete(post);
        }
        for (const container of threadContainers) if (!desired.has(container)) {
            container.removeAttribute('data-xl-thread');
            threadContainers.delete(container);
        }
        for (const container of desired) if (!threadContainers.has(container)) {
            container.setAttribute('data-xl-thread', '');
            threadContainers.add(container);
        }
    }

    const dockItems = [
        ['AppTabBar_Home_Link', 'Home'], ['AppTabBar_Explore_Link', 'Search'],
        ['AppTabBar_Notifications_Link', 'Notifications'], ['AppTabBar_DirectMessage_Link', 'Messages'],
        ['AppTabBar_Profile_Link', 'Profile'], ['AppTabBar_More_Menu', 'More'],
        ['SideNav_AccountSwitcher_Button', 'Account']
    ];
    let dock;
    let compose;
    function nativeControl(id) {
        return document.querySelector(`header[role="banner"] [data-testid="${id}"]`);
    }
    function proxyControl(source, fallback, findSource) {
        const control = document.createElement(source.tagName === 'A' ? 'a' : 'button');
        if (control.tagName === 'BUTTON') control.type = 'button';
        const icon = source.querySelector('svg');
        if (icon) control.append(icon.cloneNode(true));
        else control.textContent = '◉';
        control.setAttribute('aria-label', source.getAttribute('aria-label') || fallback);
        control.addEventListener('click', event => {
            // Preserve browser gestures such as opening a link in a new tab.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            const original = findSource();
            if (!original) return;
            event.preventDefault();
            original.click();
        });
        return control;
    }
    function syncDock() {
        const root = document.documentElement;
        const ready = document.body && dockItems.every(([id]) => nativeControl(id));
        root.toggleAttribute('data-xl-dock', Boolean(ready));
        root.toggleAttribute('data-xl-composing', location.pathname.startsWith('/compose/'));
        if (!ready) {
            dock?.remove();
            compose?.remove();
            dock = compose = undefined;
            return;
        }
        if (!dock) {
            // Proxy native controls instead of moving React-owned elements.
            // This keeps native routing, badges in accessible labels, and menus.
            dock = document.createElement('nav');
            dock.id = 'x-lite-dock';
            dock.setAttribute('aria-label', 'X Lite mobile navigation');
            for (const [id, fallback] of dockItems) dock.append(proxyControl(nativeControl(id), fallback, () => nativeControl(id)));
            document.body.append(dock);
        }
        dockItems.forEach(([id, fallback], index) => {
            const original = nativeControl(id);
            const control = dock.children[index];
            const label = original.getAttribute('aria-label') || fallback;
            if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label);
            const href = original.getAttribute('href');
            if (href && control.getAttribute('href') !== href) control.setAttribute('href', href);
            const active = href && (location.pathname === href || (href === '/explore' && location.pathname === '/search'));
            if (active && control.getAttribute('aria-current') !== 'page') control.setAttribute('aria-current', 'page');
            if (!active) control.removeAttribute('aria-current');
        });
        const findCompose = () => document.querySelector('header[role="banner"] a[href="/compose/post"]');
        const source = findCompose();
        if (!compose && source) {
            compose = proxyControl(source, 'Post', findCompose);
            compose.id = 'x-lite-compose';
            compose.href = '/compose/post';
            document.body.append(compose);
        }
    }

    const videos = new Set();
    const soundAllowed = new WeakSet();
    const soundButtons = new WeakMap();
    const mutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (mutedDescriptor?.set && mutedDescriptor.configurable) Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        ...mutedDescriptor,
        set(value) {
            const muted = this instanceof HTMLVideoElement && !soundAllowed.has(this) ? true : value;
            return Reflect.apply(mutedDescriptor.set, this, [muted]);
        }
    });
    function silenceVideo(video) {
        soundAllowed.delete(video);
        video.muted = true;
        const button = soundButtons.get(video);
        if (button && button.textContent !== 'Enable sound') button.textContent = 'Enable sound';
    }
    function addSoundControl(video) {
        const player = video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"]');
        if (!player) return;
        const existing = soundButtons.get(video);
        if (existing?.isConnected) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'x-lite-sound';
        button.textContent = 'Enable sound';
        button.title = 'Allow this video to use audio. Your browser may pause background music.';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.isTrusted) return;
            if (soundAllowed.has(video)) silenceVideo(video);
            else {
                soundAllowed.add(video);
                video.muted = false;
                button.textContent = 'Mute video';
            }
        });
        soundButtons.set(video, button);
        player.append(button);
    }
    const videoIntent = new WeakMap();
    const manualVideo = new WeakSet();
    const recentIntent = video => Date.now() - (videoIntent.get(video) || 0) < 2500;
    function grantVideoIntent(event) {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        if (event.type === 'keydown' && !['Enter', ' ', 'k', 'K'].includes(event.key)) return;
        const player = event.target.closest('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]');
        const video = player?.tagName === 'VIDEO' ? player : player?.querySelector('video');
        if (video) videoIntent.set(video, Date.now());
    }
    document.addEventListener('pointerdown', grantVideoIntent, true);
    // Trusted click also covers assistive activation without a pointer event.
    document.addEventListener('click', grantVideoIntent, true);
    document.addEventListener('keydown', grantVideoIntent, true);
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
        if (this instanceof HTMLVideoElement && this.paused) {
            // X calls play() for visible videos even without an autoplay
            // attribute. Require a fresh trusted gesture on this player.
            if (!recentIntent(this)) return Promise.reject(new DOMException('Tap this video to play', 'NotAllowedError'));
            if (!soundAllowed.has(this)) this.muted = true;
            manualVideo.add(this);
            videoIntent.delete(this);
        }
        return Reflect.apply(originalPlay, this, args);
    };
    const autoplayDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'autoplay');
    if (autoplayDescriptor?.set && autoplayDescriptor.configurable) {
        Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
            ...autoplayDescriptor,
            set(value) { return Reflect.apply(autoplayDescriptor.set, this, [this instanceof HTMLVideoElement ? false : value]); }
        });
    }
    const tweets = new Set();
    const tweetObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        // Only visible cards receive backdrop blur; offscreen cards keep their
        // tinted surface without an active blur layer.
        for (const entry of entries) entry.target.toggleAttribute('data-xl-visible', entry.isIntersecting);
    }) : null;
    function watchTweets(node) {
        const candidates = node.querySelectorAll ? [...node.querySelectorAll('article[data-testid="tweet"]')] : [];
        if (node.nodeType === 1 && node.matches('article[data-testid="tweet"]')) candidates.push(node);
        for (const tweet of candidates) {
            if (tweets.has(tweet)) continue;
            tweets.add(tweet);
            tweetObserver?.observe(tweet);
        }
    }
    const inPictureInPicture = video => document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
    function pauseVideo(video) {
        if (!video.paused && !inPictureInPicture(video)) video.pause();
    }
    const videoObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        for (const entry of entries) if (!entry.isIntersecting) pauseVideo(entry.target);
    }, { threshold: 0 }) : null;
    function watchVideos(node) {
        const candidates = node.querySelectorAll ? [...node.querySelectorAll('video')] : [];
        if (node.nodeType === 1 && node.tagName === 'VIDEO') candidates.push(node);
        for (const video of candidates) {
            addSoundControl(video);
            if (videos.has(video)) continue;
            videos.add(video);
            video.autoplay = false;
            video.preload = 'none';
            video.playsInline = true;
            silenceVideo(video);
            videoObserver?.observe(video);
        }
    }
    function releaseDetachedMedia() {
        for (const [elements, observer] of [[videos, videoObserver], [tweets, tweetObserver]]) {
            for (const element of elements) if (!element.isConnected) {
                observer?.unobserve(element);
                elements.delete(element);
            }
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) for (const video of videos) pauseVideo(video);
    });
    document.addEventListener('play', event => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || inPictureInPicture(video)) return;
        if (!soundAllowed.has(video)) video.muted = true;
        // Native video controls can start playback without calling our JS
        // wrapper, so enforce the same gesture rule on the media event too.
        if (recentIntent(video)) { manualVideo.add(video); videoIntent.delete(video); }
        const rect = video.getBoundingClientRect();
        if (!manualVideo.has(video) || document.hidden || rect.bottom <= 0 || rect.top >= innerHeight) pauseVideo(video);
    }, true);
    document.addEventListener('pause', event => {
        if (!(event.target instanceof HTMLVideoElement)) return;
        manualVideo.delete(event.target);
        videoIntent.delete(event.target);
        silenceVideo(event.target);
    }, true);
    document.addEventListener('ended', event => {
        if (event.target instanceof HTMLVideoElement) silenceVideo(event.target);
    }, true);
    document.addEventListener('volumechange', event => {
        const video = event.target;
        if (video instanceof HTMLVideoElement && !soundAllowed.has(video) && !video.muted) silenceVideo(video);
    }, true);

    function refresh() {
        queued = false;
        const root = document.documentElement;
        if (!root) return;
        if (!style.isConnected) root.append(style);
        if (root.getAttribute('data-xl-audio-session') !== audioMixType) root.setAttribute('data-xl-audio-session', audioMixType);
        syncDock();
        syncThreads();

        // Follow X's own theme, which can differ from the operating system theme.
        if (document.body) {
            const rgb = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
            if (rgb && rgb.length >= 3) {
                const dark = .2126 * Number(rgb[0]) + .7152 * Number(rgb[1]) + .0722 * Number(rgb[2]) < 128;
                root.toggleAttribute('data-xl-dark', dark);
            }
        }

        // Hide recommendation modules, never posts that merely mention them.
        // Re-evaluate recycled cells because X uses a virtualized timeline.
        for (const cell of document.querySelectorAll('[data-testid="cellInnerDiv"]')) {
            const suggestion = !cell.querySelector('article') &&
                [...cell.querySelectorAll('h2, h3, [role="heading"]')].some(h => labels.suggestions.has(normalized(h)));
            cell.toggleAttribute('data-xl-hidden', suggestion);
        }
    }

    function schedule() {
        if (queued) return;
        queued = true;
        // Coalesce React's bursts of mutations into one pass per frame.
        requestAnimationFrame(refresh);
    }

    const observer = new MutationObserver(records => {
        // Process added subtrees instead of rescanning every resource on every
        // React update. This fallback runs after parser insertion, so it cannot
        // promise to stop parser-initiated network requests.
        for (const record of records) {
            if (record.type === 'attributes') {
                if (['src', 'href', 'rel', 'ping'].includes(record.attributeName)) cleanTree(record.target);
            } else for (const node of record.addedNodes) {
                cleanTree(node);
                watchVideos(node);
                watchTweets(node);
            }
        }
        releaseDetachedMedia();
        schedule();
    });
    observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected', 'aria-label', 'data-testid', 'src', 'href', 'rel', 'ping']
    });
    // Body style changes signal X's theme switch without observing every inline
    // style in the timeline or reacting to our own data attributes.
    const themeObserver = new MutationObserver(schedule);
    function observeTheme() {
        if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        cleanTree(document);
        watchVideos(document);
        watchTweets(document);
        schedule();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeTheme, { once: true });
    else observeTheme();
    addEventListener('popstate', schedule);
    addEventListener('pageshow', schedule);
    refresh();
})();
