// ==UserScript==
// @name         Feishu Messenger Lite
// @name:zh-CN   飞书消息精简
// @namespace    https://github.com/hxueh
// @version      0.12.0
// @description  Restyles Feishu messages, contacts, tasks, Workplace and Calendar with Liquid Glass, light and dark themes, resizable lists, and an iPhone layout. Blocks analytics and ad trackers, and hides the download prompt.
// @description:zh-CN 为飞书消息、通讯录、任务、工作台和日历加入液态玻璃风格、浅色与深色主题、可调宽度列表和 iPhone 布局。拦截统计与广告追踪，隐藏下载提示。
// @author       hxueh
// @license      MIT
// @icon         https://www.feishu.cn/favicon.ico
// @match        https://*.feishu.cn/next/messenger*
// @match        https://*.feishu.cn/next/contacts*
// @match        https://*.feishu.cn/next/task*
// @match        https://*.feishu.cn/next/workplace*
// @match        https://*.feishu.cn/calendar*
// @require      https://update.greasyfork.org/scripts/601258/Feishu%20Lite%20Blocker.js
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

// The script is a named function so that, on a phone, it can run itself a
// second time on the desktop page it loads (see loadDesktopApp below).
(function fml(desktopLoaded) {
    'use strict';

    // Add ?fml=off to the URL to see the original page, for example to check
    // whether a broken feature is caused by this script.
    if (new URLSearchParams(location.search).get('fml') === 'off') return;

    // Feishu is one single-page app across Messenger, Contacts, Docs,
    // Calendar and the rest, so every part of this script checks the route
    // first. The script styles Messenger, Contacts, Task, Workplace and
    // Calendar; section() tells them apart for the phone layout and the list
    // widths, which differ between the pages. Calendar is a separate app at
    // /calendar (the sidebar opens it in a new tab), not under /next.
    const section = () => location.pathname.match(/^\/(?:next\/(messenger|contacts|task|workplace)|(calendar))(?:\/|$)/)?.slice(1).find(Boolean) || null;
    const onFeishuPage = () => section() !== null;

    // ---------------------------------------------------------------------
    // Phones. Feishu's server answers a phone user agent with a small
    // "unsupported browser" page that has no messenger in it, and a script
    // cannot change the user agent of the page request. It can fetch the
    // page again with a Mac Safari User-Agent header (WebKit sends a header
    // set by fetch), then replace the error page with the result. Feishu's
    // code then reads navigator.userAgent and navigator.platform, so those
    // report the same Mac. Touch support is left as it is, so the phone
    // layout below still turns on. With Safari's "Request Desktop Website",
    // the user agent is already a Mac and none of this runs.
    // ---------------------------------------------------------------------
    //
    // Feishu's own code has a second check: a "Mac" with more than two touch
    // points is an iPad, and the iPad web version is refused. An iPhone in
    // Safari's desktop mode looks exactly like that, so maxTouchPoints
    // reports 0 to Feishu on any touch device that claims to be a Mac. The
    // real value is kept for the phone layout (the second run of this
    // function reads it from REAL_TOUCH_KEY, because by then the property
    // reports 0).
    const REAL_TOUCH_KEY = Symbol.for('fml.maxTouchPoints');
    if (window[REAL_TOUCH_KEY] === undefined) window[REAL_TOUCH_KEY] = navigator.maxTouchPoints;
    const realTouchPoints = window[REAL_TOUCH_KEY];
    const PHONE_UA = /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent);
    const TOUCH_MAC = navigator.platform === 'MacIntel' && realTouchPoints > 1;
    const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    // Calendar does not start again in a document that a script rewrites
    // (tested: it stays on its loading spinner, with or without this
    // script), so a phone gets Feishu's own Calendar page. The Mac user
    // agent goes only with the reload, so Calendar sees the real phone.
    const RELOAD = PHONE_UA && section() !== 'calendar';
    if ((RELOAD || TOUCH_MAC) && !desktopLoaded) {
        const fake = [['maxTouchPoints', 0]];
        if (RELOAD) fake.push(['userAgent', DESKTOP_UA], ['appVersion', DESKTOP_UA.slice(8)], ['platform', 'MacIntel']);
        for (const [key, value] of fake) {
            Object.defineProperty(Navigator.prototype, key, { configurable: true, get: () => value });
        }
    }
    const showDesktopHint = () => {
        const add = () => {
            const note = document.createElement('div');
            note.style.cssText = 'margin:24px 16px;padding:12px 14px;border-radius:12px;background:#f2f2f7;color:#1c1c1e;font:15px/1.5 -apple-system,sans-serif';
            note.textContent = '飞书消息精简无法自动加载桌面版。请在 Safari 地址栏点「大小」→「请求桌面网站」。'
                + ' Feishu Messenger Lite could not load the desktop app. In Safari, tap aA → Request Desktop Website.';
            document.body.appendChild(note);
        };
        if (document.body) add();
        else document.addEventListener('DOMContentLoaded', add, { once: true });
    };
    const loadDesktopApp = async () => {
        let response;
        let html;
        try {
            response = await fetch(location.href, {
                credentials: 'include',
                cache: 'no-store',
                headers: { 'User-Agent': DESKTOP_UA },
            });
            html = await response.text();
        } catch {
            showDesktopHint();
            return;
        }
        // Logged out: the server redirects to the login page.
        if (new URL(response.url).pathname !== location.pathname) {
            location.replace(response.url);
            return;
        }
        // The header did not get through, so the server sent the error page again.
        if (!html.includes('<html') || html.includes('app-shell-not-support')) {
            showDesktopHint();
            return;
        }
        // Stop the error page, start a new document, set up this script on
        // it (before Feishu's scripts run, so the request blocker is in
        // place), then write Feishu's desktop page into it.
        window.stop();
        document.open();
        fml(true);
        document.write(html);
        document.close();
    };
    if (RELOAD && !desktopLoaded && onFeishuPage()) {
        loadDesktopApp();
        return;
    }

    // ---------------------------------------------------------------------
    // The shared library handles request filtering. Keep the route check here
    // because Feishu can navigate to other apps without a reload.
    // The IM gateway, WebSocket, passport and file CDNs remain available.
    // ---------------------------------------------------------------------
    FeishuLiteBlocker.install({ when: onFeishuPage });

    // ---------------------------------------------------------------------
    // Theme. Feishu's Universe Design (UD) components have stable ud__* class
    // names and read colours from tokens such as --bg-body. The theme styles
    // those classes and redefines those tokens (Solarized Light, Apple dark mode),
    // so it follows Feishu's own light and dark switch.
    //
    // Speed: it is plain CSS under html.fml, so no script runs while you
    // scroll or type. backdrop-filter re-blurs on every frame its backdrop
    // changes, so only small floating surfaces (menus, tooltips) use it.
    // ---------------------------------------------------------------------
    const CSS = `
html.fml, html.fml body {
    --fml-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    --fml-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --fml-blue: #268bd2;
    --fml-green: #859900;
    --fml-red: #dc322f;
    /* Liquid Glass. The tint is set on each surface, because a var() in a
       custom property resolves here on <html>. */
    --fml-glass-filter: blur(24px) saturate(180%);
    --fml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .7), inset 0 0 0 .5px rgba(255, 255, 255, .28);
    --fml-glass-shadow: 0 12px 36px rgba(0, 0, 0, .16), 0 2px 6px rgba(0, 0, 0, .06);
    --fml-radius-s: 10px;
    --fml-radius-m: 14px;
    --fml-radius-l: 22px;
    --fml-radius-panel: 18px;
    --fml-panel-shadow: 0 8px 28px rgba(7, 54, 66, .1), 0 1px 3px rgba(7, 54, 66, .08);
    /* Soft palette glows that show through the glass panels. */
    --fml-wallpaper:
        radial-gradient(70vw 60vh at 0% 0%, rgba(38, 139, 210, .16), transparent 70%),
        radial-gradient(60vw 60vh at 100% 100%, rgba(42, 161, 152, .14), transparent 70%),
        radial-gradient(50vw 50vh at 85% 5%, rgba(181, 137, 0, .1), transparent 70%),
        #eee8d5;

    /* Solarized Light core tokens. Each "-raw" twin is "r,g,b" for rgba(). */
    --N00: #fdf6e3;
    --N50: #f8f1de;
    --N100: #eee8d5;
    --N200: #e7e0cc;
    --N300: #ddd6c1;
    --N350: #d2cbb5;
    --N400: #b3b8ae;
    --N500: #93a1a1;
    --N600: #657b83;
    --N650: #5f747b;
    --N700: #586e75;
    --N800: #2c4b53;
    --N900: #073642;
    --N950: #002b36;
    --N1000: #001f27;
    --B50: #f0f0e2;
    --primary-pri-50: #f0f0e2;
    --primary-pri-50-raw: 240,240,226;
    --B100: #e3e9e1;
    --primary-pri-100: #e3e9e1;
    --primary-pri-100-raw: 227,233,225;
    --B200: #c9dcdf;
    --primary-pri-200: #c9dcdf;
    --primary-pri-200-raw: 201,220,223;
    --B300: #a7cbdc;
    --primary-pri-300: #a7cbdc;
    --primary-pri-300-raw: 167,203,220;
    --B350: #87bbda;
    --primary-pri-350: #87bbda;
    --primary-pri-350-raw: 135,187,218;
    --B400: #5ca6d6;
    --primary-pri-400: #5ca6d6;
    --primary-pri-400-raw: 92,166,214;
    --B500: #268bd2;
    --primary-pri-500: #268bd2;
    --primary-pri-500-raw: 38,139,210;
    --B600: #217fbf;
    --primary-pri-600: #217fbf;
    --primary-pri-600-raw: 33,127,191;
    --B700: #1d74ad;
    --primary-pri-700: #1d74ad;
    --primary-pri-700-raw: 29,116,173;
    --B800: #176594;
    --primary-pri-800: #176594;
    --primary-pri-800-raw: 23,101,148;
    --B900: #11567c;
    --primary-pri-900: #11567c;
    --primary-pri-900-raw: 17,86,124;
    --primary-content-default: #268bd2;
    --primary-content-default-raw: 38,139,210;
    --primary-content-hover: #4a9fdb;
    --primary-content-hover-raw: 74,159,219;
    --primary-content-pressed: #1f74b0;
    --primary-content-pressed-raw: 31,116,176;
    --primary-content-loading: #a7cbdc;
    --primary-content-loading-raw: 167,203,220;
    --primary-fill-default: #268bd2;
    --primary-fill-default-raw: 38,139,210;
    --primary-fill-hover: #4a9fdb;
    --primary-fill-hover-raw: 74,159,219;
    --primary-fill-pressed: #1f74b0;
    --primary-fill-pressed-raw: 31,116,176;
    --primary-fill-loading: #a7cbdc;
    --primary-fill-loading-raw: 167,203,220;
    --primary-fill-solid-01: #f0f0e2;
    --primary-fill-solid-01-raw: 240,240,226;
    --primary-fill-solid-02: #e3e9e1;
    --primary-fill-solid-02-raw: 227,233,225;
    --primary-fill-solid-03: #c9dcdf;
    --primary-fill-solid-03-raw: 201,220,223;
    --primary-fill-transparent-01: rgba(38, 139, 210, 0.1);
    --primary-fill-transparent-01-raw: 38,139,210;
    --primary-fill-transparent-02: rgba(38, 139, 210, 0.15);
    --primary-fill-transparent-02-raw: 38,139,210;
    --primary-fill-transparent-03: rgba(38, 139, 210, 0.2);
    --primary-fill-transparent-03-raw: 38,139,210;
    --primary-on-primary-fill: #fdf6e3;
    --primary-on-primary-fill-raw: 253,246,227;
    --bg-pricolor: #268bd2;
    --bg-pricolor-raw: 38,139,210;
    --text-link-normal: #268bd2;
    --text-link-normal-raw: 38,139,210;
    --text-link-hover: #4a9fdb;
    --text-link-hover-raw: 74,159,219;
    --text-link-pressed: #1f74b0;
    --text-link-pressed-raw: 31,116,176;
    --text-link-loading: #a7cbdc;
    --text-link-loading-raw: 167,203,220;
    --fill-active: rgba(38, 139, 210, 0.15);
    --fill-active-raw: 38,139,210;
    --fill-selected: rgba(38, 139, 210, 0.1);
    --fill-selected-raw: 38,139,210;
    --bg-text-selection: rgba(38, 139, 210, 0.28);
    --bg-text-selection-raw: 38,139,210;
    --bg-body: #fdf6e3;
    --bg-body-raw: 253,246,227;
    --bg-base: #eee8d5;
    --bg-base-raw: 238,232,213;
    --bg-body-overlay: #f6efdb;
    --bg-body-overlay-raw: 246,239,219;
    --bg-content-base: #f9f2df;
    --bg-content-base-raw: 249,242,223;
    --bg-filler: #eee8d5;
    --bg-filler-raw: 238,232,213;
    --bg-float: #fdf6e3;
    --bg-float-raw: 253,246,227;
    --bg-float-base: #eee8d5;
    --bg-float-base-raw: 238,232,213;
    --bg-float-overlay: #f6efdb;
    --bg-float-overlay-raw: 246,239,219;
    --bg-sub-navigation: #f6efdb;
    --bg-sub-navigation-raw: 246,239,219;
    --bg-tips: #073642;
    --bg-tips-raw: 7,54,66;
    --text-title: #073642;
    --text-title-raw: 7,54,66;
    --text-caption: #586e75;
    --text-caption-raw: 88,110,117;
    --text-placeholder: #93a1a1;
    --text-placeholder-raw: 147,161,161;
    --text-disabled: #b3b8ae;
    --text-disabled-raw: 179,184,174;
    --text-link-disabled: #b3b8ae;
    --text-link-disabled-raw: 179,184,174;
    --icon-n1: #586e75;
    --icon-n1-raw: 88,110,117;
    --icon-n2: #657b83;
    --icon-n2-raw: 101,123,131;
    --icon-n3: #93a1a1;
    --icon-n3-raw: 147,161,161;
    --icon-disabled: #b3b8ae;
    --icon-disabled-raw: 179,184,174;
    --fill-disabled: #d2cbb5;
    --fill-disabled-raw: 210,203,181;
    --line-border-card: #e4ddc8;
    --line-border-card-raw: 228,221,200;
    --line-border-component: #d2cbb5;
    --line-border-component-raw: 210,203,181;
    --bg-float-push: rgba(253, 246, 227, 0.8);
    --bg-float-push-raw: 253,246,227;
    --fill-hover: rgba(88, 110, 117, 0.08);
    --fill-hover-raw: 88,110,117;
    --fill-focus: rgba(88, 110, 117, 0.12);
    --fill-focus-raw: 88,110,117;
    --fill-pressed: rgba(88, 110, 117, 0.12);
    --fill-pressed-raw: 88,110,117;
    --fill-tag: rgba(88, 110, 117, 0.1);
    --fill-tag-raw: 88,110,117;
    --line-divider-default: rgba(88, 110, 117, 0.16);
    --line-divider-default-raw: 88,110,117;
    --line-divider-module: rgba(88, 110, 117, 0.16);
    --line-divider-module-raw: 88,110,117;
    --fill-loading-mask: rgba(253, 246, 227, 0.6);
    --fill-loading-mask-raw: 253,246,227;

    -webkit-text-size-adjust: 100%;
}
html.fml.fml-dark, html.fml.fml-dark body {
    /* Apple dark mode (iOS and macOS system colours), with secondary
       text raised from #98989f to #c7c7cc so previews stay readable.
       Links use the lighter #409cff (6:1 on #1c1c1e), and filled buttons
       use Apple's web blue #0071e3, because white on #0a84ff is 3.6:1. */
    --fml-blue: #0a84ff;
    --fml-green: #30d158;
    --fml-red: #ff453a;
    --N00: #000000;
    --N50: #1c1c1e;
    --N100: #2c2c2e;
    --N200: #3a3a3c;
    --N300: #48484a;
    --N350: #545458;
    --N400: #636366;
    --N500: #8e8e93;
    --N600: #aeaeb2;
    --N650: #c7c7cc;
    --N700: #d1d1d6;
    --N800: #e5e5ea;
    --N900: #f2f2f7;
    --N950: #f9f9fb;
    --N1000: #ffffff;
    --B50: #1a2634;
    --primary-pri-50: #1a2634;
    --primary-pri-50-raw: 26,38,52;
    --B100: #192d42;
    --primary-pri-100: #192d42;
    --primary-pri-100-raw: 25,45,66;
    --B200: #17395d;
    --primary-pri-200: #17395d;
    --primary-pri-200-raw: 23,57,93;
    --B300: #14487c;
    --primary-pri-300: #14487c;
    --primary-pri-300-raw: 20,72,124;
    --B350: #12569c;
    --primary-pri-350: #12569c;
    --primary-pri-350-raw: 18,86,156;
    --B400: #0e6ac7;
    --primary-pri-400: #0e6ac7;
    --primary-pri-400-raw: 14,106,199;
    --B500: #0a84ff;
    --primary-pri-500: #0a84ff;
    --primary-pri-500-raw: 10,132,255;
    --B600: #409cff;
    --primary-pri-600: #409cff;
    --primary-pri-600-raw: 64,156,255;
    --B700: #64b0ff;
    --primary-pri-700: #64b0ff;
    --primary-pri-700-raw: 100,176,255;
    --B800: #8cc4ff;
    --primary-pri-800: #8cc4ff;
    --primary-pri-800-raw: 140,196,255;
    --B900: #b3d8ff;
    --primary-pri-900: #b3d8ff;
    --primary-pri-900-raw: 179,216,255;
    --primary-content-default: #409cff;
    --primary-content-default-raw: 64,156,255;
    --primary-content-hover: #64b0ff;
    --primary-content-hover-raw: 100,176,255;
    --primary-content-pressed: #0a84ff;
    --primary-content-pressed-raw: 10,132,255;
    --primary-content-loading: #14487c;
    --primary-content-loading-raw: 20,72,124;
    --primary-fill-default: #0071e3;
    --primary-fill-default-raw: 0,113,227;
    --primary-fill-hover: #0a84ff;
    --primary-fill-hover-raw: 10,132,255;
    --primary-fill-pressed: #0062c4;
    --primary-fill-pressed-raw: 0,98,196;
    --primary-fill-loading: #14487c;
    --primary-fill-loading-raw: 20,72,124;
    --primary-fill-solid-01: #1a2634;
    --primary-fill-solid-01-raw: 26,38,52;
    --primary-fill-solid-02: #192d42;
    --primary-fill-solid-02-raw: 25,45,66;
    --primary-fill-solid-03: #17395d;
    --primary-fill-solid-03-raw: 23,57,93;
    --primary-fill-transparent-01: rgba(10, 132, 255, 0.15);
    --primary-fill-transparent-01-raw: 10,132,255;
    --primary-fill-transparent-02: rgba(10, 132, 255, 0.2);
    --primary-fill-transparent-02-raw: 10,132,255;
    --primary-fill-transparent-03: rgba(10, 132, 255, 0.3);
    --primary-fill-transparent-03-raw: 10,132,255;
    --primary-on-primary-fill: #ffffff;
    --primary-on-primary-fill-raw: 255,255,255;
    --bg-pricolor: #0071e3;
    --bg-pricolor-raw: 0,113,227;
    --text-link-normal: #409cff;
    --text-link-normal-raw: 64,156,255;
    --text-link-hover: #64b0ff;
    --text-link-hover-raw: 100,176,255;
    --text-link-pressed: #0a84ff;
    --text-link-pressed-raw: 10,132,255;
    --text-link-loading: #14487c;
    --text-link-loading-raw: 20,72,124;
    --fill-active: rgba(10, 132, 255, 0.24);
    --fill-active-raw: 10,132,255;
    --fill-selected: rgba(10, 132, 255, 0.18);
    --fill-selected-raw: 10,132,255;
    --bg-text-selection: rgba(10, 132, 255, 0.35);
    --bg-text-selection-raw: 10,132,255;
    --bg-body: #1c1c1e;
    --bg-body-raw: 28,28,30;
    --bg-base: #111113;
    --bg-base-raw: 17,17,19;
    --bg-body-overlay: #2c2c2e;
    --bg-body-overlay-raw: 44,44,46;
    --bg-content-base: #1c1c1e;
    --bg-content-base-raw: 28,28,30;
    --bg-filler: #2c2c2e;
    --bg-filler-raw: 44,44,46;
    --bg-float: #2c2c2e;
    --bg-float-raw: 44,44,46;
    --bg-float-base: #1c1c1e;
    --bg-float-base-raw: 28,28,30;
    --bg-float-overlay: #3a3a3c;
    --bg-float-overlay-raw: 58,58,60;
    --bg-sub-navigation: #242426;
    --bg-sub-navigation-raw: 36,36,38;
    --bg-tips: #3a3a3c;
    --bg-tips-raw: 58,58,60;
    --text-title: #ffffff;
    --text-title-raw: 255,255,255;
    --text-caption: #c7c7cc;
    --text-caption-raw: 199,199,204;
    --text-placeholder: #8e8e93;
    --text-placeholder-raw: 142,142,147;
    --text-disabled: #636366;
    --text-disabled-raw: 99,99,102;
    --text-link-disabled: #636366;
    --text-link-disabled-raw: 99,99,102;
    --icon-n1: #f2f2f7;
    --icon-n1-raw: 242,242,247;
    --icon-n2: #c7c7cc;
    --icon-n2-raw: 199,199,204;
    --icon-n3: #8e8e93;
    --icon-n3-raw: 142,142,147;
    --icon-disabled: #636366;
    --icon-disabled-raw: 99,99,102;
    --fill-disabled: #3a3a3c;
    --fill-disabled-raw: 58,58,60;
    --line-border-component: #48484a;
    --line-border-component-raw: 72,72,74;
    --line-divider-module: #111113;
    --line-divider-module-raw: 17,17,19;
    --bg-float-push: rgba(44, 44, 46, 0.8);
    --bg-float-push-raw: 44,44,46;
    --fill-hover: rgba(235, 235, 245, 0.08);
    --fill-hover-raw: 235,235,245;
    --fill-focus: rgba(235, 235, 245, 0.12);
    --fill-focus-raw: 235,235,245;
    --fill-pressed: rgba(235, 235, 245, 0.14);
    --fill-pressed-raw: 235,235,245;
    --fill-tag: rgba(235, 235, 245, 0.1);
    --fill-tag-raw: 235,235,245;
    --line-border-card: rgba(255, 255, 255, 0.1);
    --line-border-card-raw: 255,255,255;
    --line-divider-default: rgba(84, 84, 88, 0.65);
    --line-divider-default-raw: 84,84,88;
    --fill-loading-mask: rgba(0, 0, 0, 0.6);
    --fill-loading-mask-raw: 0,0,0;
    --fml-glass-edge: inset 0 .5px 0 rgba(255, 255, 255, .16), inset 0 0 0 .5px rgba(255, 255, 255, .08);
    --fml-glass-shadow: 0 12px 36px rgba(0, 0, 0, .5), 0 2px 6px rgba(0, 0, 0, .3);
    --fml-panel-shadow: 0 8px 28px rgba(0, 0, 0, .4), 0 1px 3px rgba(0, 0, 0, .3);
    /* System blue, purple and teal glows on a near-black desktop. */
    --fml-wallpaper:
        radial-gradient(70vw 60vh at 0% 0%, rgba(10, 132, 255, .2), transparent 70%),
        radial-gradient(60vw 60vh at 100% 100%, rgba(191, 90, 242, .15), transparent 70%),
        radial-gradient(50vw 50vh at 85% 5%, rgba(100, 210, 255, .08), transparent 70%),
        #111113;
}

html.fml, html.fml body,
html.fml :is(button, input, textarea, select, [contenteditable="true"]) {
    font-family: var(--fml-font) !important;
}
html.fml :is(code, pre, kbd, samp) { font-family: var(--fml-mono) !important; }
html.fml body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
}
html.fml ::selection { background: color-mix(in srgb, var(--fml-blue) 28%, transparent); }

/* ---- Removed: Download Feishu ------------------------------------------ */
/* .navItem-download is the sidebar entry. The script below finds other
   entries by their text and tags them .fml-hidden. */
html.fml :is(
    .navItem-download,
    a[href*="feishu.cn/download"], a[href*="larksuite.com/download"],
    [aria-label="下载飞书"], [aria-label="下載飛書"], [aria-label="Download Feishu" i], [aria-label="Download Lark" i],
    [title="下载飞书"], [title="下載飛書"], [title="Download Feishu" i], [title="Download Lark" i]
), html.fml .fml-hidden {
    display: none !important;
}

/* ---- Chat list: "Done" (archive) button ------------------------------- */
/* The button is an overlay on the right of each row that Feishu shows only
   on hover (opacity 0). Show it on every row, without its gradient, and
   reserve space so it does not cover the time and the unread badge. The
   selectors use the row's stable a11y_* classes and the DOM structure,
   because the other class names are hashed. */
html.fml .a11y_feed_card_main { padding-inline-end: 26px; }
html.fml .a11y_feed_card_main + div > div {
    opacity: 1 !important;
    width: 28px !important;
}
html.fml .a11y_feed_card_main + div > div::before,
html.fml .a11y_feed_card_main + div > div::after { display: none !important; }
/* Archiving: Feishu fades the row (a 0.3 s opacity transition), collapses
   its wrapper to 0 height (a 0.3 s animation that keeps its end state),
   slides the rows below up (an inline transform transition), and removes
   the row later. With no transitions and a 1 ms animation, the row has
   no height in the next frame, so it leaves the list at once. */
html.fml .a11y_feed_main_list .list_items > div > div > div { animation-duration: 1ms !important; }
html.fml .a11y_feed_main_list .list_items > div { transition: none !important; }
html.fml .a11y_feed_card_item, html.fml .a11y_feed_card_item > * { transition: none !important; }

/* ---- Phone layout (iOS Safari) ---------------------------------------- */
/* html.fml-mobile is set by the script on touch phones and narrow windows.
   The layout follows iOS Messages: the chat list fills the screen, a tap
   shows the chat full screen (html.fml-chat-open), and the back button or
   the back swipe returns to the list. Feishu's own script hides the list
   with an inline display: none and squeezes the chat at this width, so
   these rules use !important to win over inline styles. The sidebar
   (Calendar, Docs and the rest) is hidden: this script is for Messenger,
   Contacts, Task, Workplace and Calendar, and the last three simply fill
   the screen. */
html.fml.fml-mobile .appNavbar,
html.fml.fml-mobile .sidebar-resizer { display: none !important; }
html.fml.fml-mobile .appLayout {
    /* 100dvh follows Safari's toolbars, so the message box stays visible. */
    height: 100dvh !important;
    box-sizing: border-box;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
}
html.fml.fml-mobile .appLayout-content,
html.fml.fml-mobile .appLayout-content > div {
    width: 100% !important;
    min-width: 0 !important;
    flex: 1 1 auto;
}
html.fml.fml-mobile .page-view-messenger { display: block !important; width: 100% !important; }
html.fml.fml-mobile .page-view-messenger-chat { display: none !important; }
html.fml.fml-mobile.fml-chat-open .page-view-messenger { display: none !important; }
html.fml.fml-mobile.fml-chat-open .page-view-messenger-chat { display: block !important; width: 100% !important; }
/* Contacts works the same way: the list of contact groups (.contactPageNav)
   fills the screen, and a tap on a group shows its contacts (.contactTab). */
html.fml.fml-mobile .contactPageNav { display: block !important; width: 100% !important; max-width: none !important; flex: 1 1 auto !important; }
html.fml.fml-mobile .contactTab { display: none !important; }
html.fml.fml-mobile.fml-chat-open .contactPageNav { display: none !important; }
html.fml.fml-mobile.fml-chat-open .contactTab { display: flex !important; width: 100% !important; min-width: 0 !important; flex: 1 1 auto !important; }
html.fml.fml-mobile .contactTab_header { padding-left: 44px !important; }
/* Full-screen panels, as on iPhone, instead of floating cards. */
html.fml.fml-mobile :is(.page-content-wrapper, .contactPageNav, .contactTab, .workplace-wrapper, #root-todo > div > div > div) {
    border-radius: 0 !important;
    box-shadow: none !important;
}
/* Calendar: the grid fills the screen, as Calendar on iPhone. The sidebar
   with the month and the calendar list is hidden; Today and the arrows in
   the toolbar still move between days. */
html.fml.fml-mobile #calendar-tab :is(.tool-panel, .tool-calendar-dragger) { display: none !important; }
html.fml.fml-mobile #calendar-tab :is(.default-page, .create-event-page .main) {
    padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
}
html.fml.fml-mobile #calendar-tab :is(.calendar-view, .create-event-page .left) {
    border-radius: 0 !important;
    box-shadow: none !important;
}
html.fml.fml-mobile .chatContainer__headerWrapper { padding-left: 44px !important; }
html.fml.fml-mobile .lark__editor--default { margin-bottom: calc(env(safe-area-inset-bottom) + 4px) !important; }
/* The back button is the script's own element, outside Feishu's React
   tree, so a Feishu re-render cannot remove it. */
.fml-back { display: none; }
html.fml.fml-mobile.fml-chat-open .fml-back {
    display: flex;
    position: fixed;
    z-index: 1000;
    top: calc(env(safe-area-inset-top) + 16px);
    left: calc(env(safe-area-inset-left) + 6px);
    width: 36px;
    height: 36px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--fml-blue);
    -webkit-tap-highlight-color: transparent;
}
html.fml.fml-mobile.fml-chat-open .fml-back:active { background: var(--fill-pressed); }
html.fml.fml-mobile .fml-back svg { width: 22px; height: 22px; }

/* ---- Scrollbars: thin overlay bars, as on macOS ----------------------- */
html.fml * { scrollbar-width: thin; scrollbar-color: rgba(128, 128, 128, .45) transparent; }
html.fml ::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }
html.fml ::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: rgba(128, 128, 128, .4) padding-box;
}
html.fml ::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 128, .65); }
html.fml ::-webkit-scrollbar-track, html.fml ::-webkit-scrollbar-corner { background: transparent; }

/* ---- Liquid Glass: the window ----------------------------------------- */
/* The sidebar, chat list and chat are translucent panels on the wallpaper.
   They have no backdrop-filter: behind them is only soft gradients, so a
   blur would look the same but cost a full-panel blur on each scroll frame. */
html.fml .appLayout {
    background: var(--fml-wallpaper) !important;
}
/* Clear Feishu's solid frame and inner layers. */
html.fml :is(.messagesLayout, .appLayout-content, .appNavbar-navbarMenu,
             .page-content-wrapper .larklet-extension-component,
             .page-content-wrapper .larklet-extension,
             .page-content-wrapper .larklet-extension > div,
             .lark-chat.main-box, .chatContainer, .chatMainContent) {
    background: transparent !important;
}
/* Glass panels: the chat list and the chat, and in Contacts the group
   list and the contact list. Contacts has no .page-content-wrapper, so its
   two panels get the same glass and the same gap. */
html.fml .contactPage { background: transparent !important; gap: 8px; }
html.fml.fml-mobile .contactPage { gap: 0; }
html.fml :is(.page-content-wrapper, .contactPageNav, .contactTab) {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
/* Glass cards: each chat row and each contact row is a small glass card on
   the glass panel. The tint is a background-image, not a background-color,
   so Feishu's own hover and selected colours (set as background-color)
   still show through it. */
html.fml :is(.a11y_feed_main_list .a11y_feed_card_item, .contactTab .list_items .larkc-card) {
    background-image: linear-gradient(color-mix(in srgb, var(--bg-float) 60%, transparent),
                                      color-mix(in srgb, var(--bg-float) 60%, transparent)) !important;
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), 0 1px 3px rgba(0, 0, 0, .08) !important;
}
/* Chat rows: a 6px gap between cards. The chat list is a virtual list that
   measures each row, so the margin moves the rows below it down. */
html.fml .a11y_feed_main_list .a11y_feed_card_item { margin-bottom: 6px !important; }
/* Contact rows are placed at fixed 54px steps, so a margin would make them
   overlap. A transparent 3px border at the top and bottom makes the gap
   inside the row instead (the rows are border-box, so the height stays),
   and the background is clipped to the padding box. The drop shadow is
   left out: it would draw at the outer edge of the transparent border. */
html.fml .contactTab .list_items .larkc-card {
    border-block: 3px solid transparent !important;
    background-clip: padding-box !important;
    box-shadow: var(--fml-glass-edge) !important;
}
/* Task: its nav column and its content column become two glass panels,
   as in Messenger. Their class names are hashed, so the selectors follow
   the DOM from the stable #root-todo: root > wrapper > row > columns. The
   columns' own solid inner layers are cleared so the glass shows. */
html.fml #root-todo, html.fml #root-todo > div { background: transparent !important; }
html.fml #root-todo > div > div { gap: 8px; background: transparent !important; }
html.fml #root-todo > div > div > div {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
html.fml #root-todo > div > div > div > div { background-color: transparent !important; }
/* Workplace: one glass panel with glass app cards, as the chat rows. */
html.fml .workplace-wrapper {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
html.fml .appcenter-header-wrap {
    background: transparent !important;
    border-radius: 0 !important;
    box-shadow: inset 0 -.5px 0 var(--line-divider-default) !important;
}
html.fml .appcenter-search-input {
    background: var(--fill-tag) !important;
    border-color: transparent !important;
    border-radius: 999px !important;
    box-shadow: var(--fml-glass-edge) !important;
}
html.fml :is(.appcenter-card-wrap, .appcenter-add-card) {
    background: color-mix(in srgb, var(--bg-float) 60%, transparent) !important;
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), 0 1px 3px rgba(0, 0, 0, .08) !important;
    transition: background-color .15s ease;
}
html.fml :is(.appcenter-card-wrap, .appcenter-add-card):hover {
    background: color-mix(in srgb, var(--bg-float) 85%, transparent) !important;
}
/* The category bar sticks to the top while the apps scroll under it, so it
   is the one panel-wide surface that needs a real blur. */
html.fml .category-list-wrap { background: transparent !important; }
html.fml .category-list-section {
    background: color-mix(in srgb, var(--bg-body) 50%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter);
    backdrop-filter: var(--fml-glass-filter);
}
/* ---- Calendar ----------------------------------------------------------- */
/* Calendar is a separate app at /calendar with fixed light colours and no
   Feishu tokens, so these rules set its colours from the palette above.
   The layout follows Calendar on macOS 27: a glass sidebar with the month
   and the calendar list, and a glass panel with the grid. */
html.fml body:has(#calendar-tab) { background: var(--fml-wallpaper) !important; }
html.fml #calendar-tab, html.fml #calendar-tab > div,
html.fml #calendar-tab :is(.calendar-header, .tool-bar-navigator, .timezone, .padding) { background: transparent !important; }
html.fml #calendar-tab .default-page {
    box-sizing: border-box;
    padding: 8px;
    background: transparent !important;
}
html.fml #calendar-tab :is(.tool-panel, .calendar-view) {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
html.fml #calendar-tab .tool-calendar-dragger { background: transparent !important; width: 8px !important; }
/* Feishu's text and grid lines have fixed greys. They take the palette's
   colours here; inline colours (events, calendar dots) still win. */
html.fml #calendar-tab :is(.tool-panel, .calendar-view) { color: var(--text-title); }
html.fml #calendar-tab :is(.tool-panel, .calendar-view) * { color: inherit; }
html.fml #calendar-tab :not(.now-pointer) { border-color: var(--line-divider-default); }
/* The grid lines are 1px pseudo-elements with a fixed grey background. */
html.fml #calendar-tab :is(.calendar, .padding, .header-cell, .calendar-timeline, .row-line-item, .day-column, .week-row, .calendar-header)::before,
html.fml #calendar-tab :is(.calendar, .padding, .header-cell, .calendar-timeline, .row-line-item, .day-column, .week-row, .calendar-header)::after {
    background-color: var(--line-divider-default) !important;
}
html.fml #calendar-tab :is(.larkc-dayPanel-header, .larkc-dayPanel-date__othermonth, .calendar-timeline-slot,
                           .timezone, .title-text, [class*="WeekHeaderCell-index-module__weekLabel"]) {
    color: var(--text-caption);
}
html.fml #calendar-tab .larkc-dayPanel-date__othermonth { opacity: .55; }

/* Toolbar: capsule buttons and a segmented control, as in macOS 27. */
html.fml #calendar-tab .tool-bar { background: transparent !important; }
html.fml #calendar-tab .tool-bar .label { font-weight: 700; letter-spacing: -.01em; }
html.fml #calendar-tab .tool-bar-navigator .label-btn {
    height: 30px;
    padding: 0 14px;
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--fill-tag) !important;
    box-shadow: var(--fml-glass-edge);
    font-weight: 500;
}
html.fml #calendar-tab .tool-bar-navigator .btn { border-radius: 999px !important; }
html.fml #calendar-tab :is(.tool-bar-navigator .label-btn, .tool-bar-navigator .btn, .larkc-pickerToolBar-icon):hover {
    background: var(--fill-hover) !important;
}
html.fml #calendar-tab .mode-section {
    padding: 2px;
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--fill-tag) !important;
    box-shadow: var(--fml-glass-edge);
}
html.fml #calendar-tab .mode-section .label-btn {
    border-radius: 999px !important;
    color: var(--text-title) !important;
    background: transparent !important;
    transition: background-color .15s ease;
}
html.fml #calendar-tab .mode-section .label-btn.selected {
    background: var(--bg-float) !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .14), var(--fml-glass-edge);
    font-weight: 600;
}

/* Day headers: today's date in a red circle, as in Apple Calendar. */
html.fml #calendar-tab [class*="HeaderCell-index-module__isToday"] [class*="WeekHeaderCell-index-module__weekLabel"] { color: var(--fml-red); }
html.fml #calendar-tab [class*="HeaderCell-index-module__isToday"] [class*="WeekHeaderCell-index-module__dateLabel"] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.45em;
    height: 1.45em;
    padding: 0 .2em;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--fml-red);
    color: #fff;
}
/* Today's column: a faint tint instead of Feishu's grey block. */
html.fml #calendar-tab :is(.day-column.isToday, .monthview-day-block.today) {
    background: color-mix(in srgb, var(--fml-red) 3%, transparent) !important;
}
/* Day view: hours outside your working time get a faint shade. */
html.fml #calendar-tab .work-time-mask-item-vertical { background: color-mix(in srgb, var(--text-title) 4%, transparent) !important; }
/* Month view: today's date in the same red circle. */
html.fml #calendar-tab .weekday-label.today .weekday-label-wrapper { background: var(--fml-red) !important; color: #fff; font-weight: 600; }

/* The current time: a red line and label. */
html.fml #calendar-tab .now-pointer { border-color: color-mix(in srgb, var(--fml-red) 35%, transparent) !important; }
html.fml #calendar-tab .now-pointer.is-today-pointer { border-color: var(--fml-red) !important; }
html.fml #calendar-tab .now-pointer.is-today-pointer::before { background-color: var(--fml-red) !important; }
html.fml #calendar-tab .calendar-timeline-slot-now { color: var(--fml-red) !important; font-weight: 600; }

/* Events: rounded tiles. The wrapper's white backs the faded past events,
   so it takes the panel colour. */
html.fml #calendar-tab :is(.event-instance-wrapper, .event-transformer, .allday-wrapper, .month-transformer) {
    background: var(--bg-body) !important;
    border-radius: 6px;
}
html.fml #calendar-tab :is(.event-instance, .all-day-event-instance, .event-instance-past-wrapper) { border-radius: 6px !important; }
/* A bar in the calendar colour on the left edge, as on macOS. */
html.fml #calendar-tab .event-instance { box-shadow: inset 3px 0 0 currentColor; }
html.fml.fml-dark #calendar-tab .event-instance { box-shadow: inset 3px 0 0 color-mix(in srgb, currentColor 70%, #fff); }
/* A past event is faded by a white layer over it; the layer takes the
   panel colour so it fades towards the panel in both themes. */
html.fml #calendar-tab :is(.past-event-instance, .all-day-event-instance-is-past)::after { background-color: var(--bg-body) !important; }
/* In dark mode an event's fill comes from its text colour (Feishu sets
   both inline, per calendar): a dark tint with lighter text, as on macOS. */
html.fml.fml-dark #calendar-tab :is(.event-instance, .all-day-event-instance) {
    background-color: color-mix(in srgb, currentColor 34%, var(--bg-body)) !important;
}
html.fml.fml-dark #calendar-tab :is(.event-instance, .all-day-event-instance) > * {
    color: color-mix(in srgb, currentColor 45%, #fff);
}

/* Month in the sidebar. */
html.fml #calendar-tab .larkc-pickerToolBar-label { font-weight: 700; }
html.fml #calendar-tab .larkc-pickerToolBar-icon { border-radius: 999px; }
html.fml #calendar-tab .larkc-dayPanel-date { transition: background-color .15s ease; }
html.fml #calendar-tab .larkc-dayPanel-date:hover { background: var(--fill-hover) !important; }
html.fml #calendar-tab .larkc-dayPanel-date__selected { border: 0 !important; background: var(--fill-tag) !important; font-weight: 600; }
html.fml #calendar-tab .larkc-dayPanel-date__today { border: 0 !important; background: var(--fml-red) !important; color: #fff !important; font-weight: 600; }

/* Sidebar: search field and calendar list. */
html.fml #calendar-tab [class*="CalendarSearch"] input {
    background: var(--fill-tag) !important;
    border: 0 !important;
    border-radius: 999px !important;
    box-shadow: var(--fml-glass-edge);
}
html.fml #calendar-tab .calendar-item { border-radius: 8px; margin: 0 6px; }
html.fml #calendar-tab .calendar-item:hover { background: var(--fill-hover) !important; }
html.fml #calendar-tab .title.my .title-text { font-weight: 600; }

/* The "+" button: a glass-edged circle in the accent colour. */
html.fml #calendar-tab .add-new-event-btn {
    background: var(--fml-blue) !important;
    box-shadow: var(--fml-glass-edge), 0 6px 18px color-mix(in srgb, var(--fml-blue) 40%, transparent) !important;
    transition: transform .15s ease;
}
html.fml #calendar-tab .add-new-event-btn:active { transform: scale(.94); }
html.fml #calendar-tab .add-new-event-btn svg { color: #fff; }
/* Events you have not answered are striped. The stripes are a light tint
   of the calendar colour, so in dark mode they come from the text colour. */
html.fml.fml-dark #calendar-tab .event-instance[style*="gradient"] {
    background-color: var(--bg-body) !important;
    background-image: repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 32%, transparent) 0 5px, transparent 5px 10px) !important;
}

/* Event details and the "N more" list in Month view: glass cards. The
   details header keeps the calendar colour that Feishu sets inline.
   Feishu's cards are white with dark text, so their text takes the
   palette colours. */
html.fml #calendar-tab .month-view-show-more { color: var(--text-title); }
html.fml #calendar-tab .month-view-show-more * { color: inherit; }
html.fml #calendar-tab :is(.event-detail, .month-view-show-more) {
    background: color-mix(in srgb, var(--bg-float) 82%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter);
    backdrop-filter: var(--fml-glass-filter);
    border-radius: var(--fml-radius-l) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-glass-shadow) !important;
}
html.fml.fml-dark #calendar-tab .event-detail { color: var(--text-title); }
html.fml.fml-dark #calendar-tab .event-detail :not(.event-detail--header, .event-detail--header *) { color: inherit; }
html.fml.fml-dark #calendar-tab .event-detail :is(.participate-detail, .detail-content.is-text) { color: var(--text-caption); }
/* The answer bar (Yes / No / Maybe) at the bottom of the card. */
html.fml #calendar-tab .event-detail .selector-area { background: transparent !important; }
html.fml #calendar-tab .event-detail .radio:not(._selected) { background: transparent !important; }
html.fml #calendar-tab .event-detail .radio._selected { background: var(--fml-blue) !important; border-color: var(--fml-blue) !important; }
/* Event editor (/calendar/eventedit): the form becomes a glass panel next
   to the day grid, with filled fields and a capsule Save button. */
html.fml #calendar-tab .create-event-page, html.fml #calendar-tab .create-event-page .main { background: transparent !important; }
html.fml #calendar-tab .create-event-page .main { box-sizing: border-box; padding: 8px; gap: 8px; }
html.fml #calendar-tab .create-event-page .left {
    background: color-mix(in srgb, var(--bg-body) 68%, transparent) !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
    color: var(--text-title);
}
html.fml #calendar-tab .create-event-page .left * { color: inherit; }
html.fml #calendar-tab .create-event-page .left :is(input, textarea, ._selection, .add-room) {
    background: var(--fill-tag) !important;
    border-color: transparent !important;
    border-radius: var(--fml-radius-s) !important;
    corner-shape: squircle;
}
html.fml #calendar-tab .create-event-page .left :is(input, textarea)::placeholder { color: var(--text-placeholder); }
html.fml #calendar-tab .create-event-page .left :is(input, textarea, ._selection):focus-within {
    box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--fml-blue) 35%, transparent) !important;
}
html.fml #calendar-tab .larkc-btn-primary {
    background: var(--fml-blue) !important;
    color: #fff !important;
    border-radius: 999px !important;
}
html.fml #calendar-tab .create-event-page :is(.timezone-btn, .add-reminder-enable) { color: var(--fml-blue) !important; }
/* The description editor and its toolbar. */
html.fml #calendar-tab .create-event-page :is(.adit-wrapper, .adit-plate) { background: transparent !important; }
html.fml #calendar-tab .create-event-page .adit-group::before { background-color: var(--line-divider-default) !important; }
/* The button that hides the free/busy grid. */
html.fml #calendar-tab .createEventPage--layout--expandLine {
    background: var(--bg-float) !important;
    box-shadow: var(--fml-glass-edge), 0 1px 3px rgba(0, 0, 0, .14);
}
/* Free/busy grid: the same lines as the calendar, and the new event in
   the accent colour instead of grey. */
html.fml #calendar-tab .calendar-timeline.timeline { background: transparent !important; }
html.fml #calendar-tab .hour-segment-slot::after { background-color: var(--line-divider-default) !important; }
html.fml #calendar-tab .shadow-event {
    background: color-mix(in srgb, var(--fml-blue) 35%, var(--bg-body)) !important;
    color: var(--text-title) !important;
    border-radius: 6px;
    box-shadow: inset 3px 0 0 var(--fml-blue);
}
/* A disabled checkbox: a light grey box with a grey tick. */
html.fml #calendar-tab .larkc-checkbox-disable svg { background: var(--fill-tag) !important; color: var(--text-placeholder) !important; }
/* The sidebar glass is an inset pseudo-element, so the bar keeps its
   layout; isolation keeps the glass behind the bar's content. */
html.fml .appNavbar {
    background: transparent !important;
    isolation: isolate;
    color: var(--text-title) !important;
    /* A gap between the sidebar and the chat list. */
    margin-inline-end: 8px !important;
}
html.fml .appNavbar::before {
    content: "";
    position: absolute;
    inset: 6px 0 6px 6px;
    z-index: -1;
    pointer-events: none;
    background: color-mix(in srgb, var(--bg-body) 55%, transparent);
    border-radius: var(--fml-radius-panel);
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow);
}
/* Feishu's white sidebar text does not show on light glass. */
html.fml .appNavbar :is(.navbarMenu, .navbarMenu *, .appNavbar-search-input, .appNavbar-search-input *,
                         .quick-jump-enter__icon, .quick-jump-enter__icon *) {
    color: var(--text-caption) !important;
}
html.fml .appNavbar :is(.navbarMenu_active, .navbarMenu_active *) {
    color: var(--text-title) !important;
}
/* Unread badges keep white text on their red fill. */
html.fml .appNavbar :is([class*="badge" i], [class*="badge" i] *) {
    color: #fff !important;
}
/* Tabs are capsules; the selected one is a raised glass capsule. */
html.fml .appNavbar .navbarMenu {
    border-radius: 999px !important;
    transition: background-color .15s ease;
}
html.fml .appNavbar .navbarMenu:hover { background: var(--fill-hover) !important; }
html.fml .appNavbar .navbarMenu_active,
html.fml .appNavbar .navbarMenu_active:hover {
    background: color-mix(in srgb, var(--bg-float) 75%, transparent) !important;
    box-shadow: var(--fml-glass-edge), 0 1px 4px rgba(0, 0, 0, .12) !important;
}
html.fml .appNavbar .appNavbar-search-input {
    background: var(--fill-tag) !important;
    border: 0 !important;
    border-radius: 999px !important;
    box-shadow: var(--fml-glass-edge) !important;
}
/* Collapsed tab menu (the default): 62px wide with icons only. The glass
   starts 6px from the left, so the content is shifted 3px right
   (padding 11px left, 5px right) to centre it on the glass. The script's
   button below the tabs adds html.fml-nav-expanded, which restores
   Feishu's own 156px layout with labels. */
html.fml .appNavbar { transition: width .2s ease, min-width .2s ease, max-width .2s ease; }
html.fml:not(.fml-nav-expanded) .appNavbar { width: 62px !important; min-width: 62px !important; max-width: 62px !important; }
/* The avatar and the "+" button stack in a column. */
html.fml:not(.fml-nav-expanded) .appNavbar-navHeader {
    flex-direction: column;
    align-items: center;
    gap: 10px;
    height: auto !important;
    padding: 14px 0 10px 6px !important;
}
html.fml:not(.fml-nav-expanded) .quick-jump-enter { margin: 0 !important; }
html.fml:not(.fml-nav-expanded) :is(.appNavbar-search-input-wrapper, .appNavbar-navbarMenu) { padding: 0 5px 0 11px !important; }
html.fml:not(.fml-nav-expanded) :is(.appNavbar-search-input, .navbarMenu) { justify-content: center; padding: 0 !important; }
/* Scoped to the sidebar: Workplace's own search box uses the same classes. */
html.fml:not(.fml-nav-expanded) .appNavbar :is(.search-input-box-desc, .search-input-box-shortcut, .navbarMenu-content) { display: none !important; }
/* The unread badge moves from the end of the row to the icon's corner. */
html.fml:not(.fml-nav-expanded) .navbarMenu-badge {
    position: absolute !important;
    top: -3px;
    right: -1px;
    margin: 0 !important;
    transform: scale(.85);
}
/* The account switcher at the bottom, centred on the glass. */
html.fml:not(.fml-nav-expanded) .appNavbar_bottomList { width: 100% !important; }
html.fml:not(.fml-nav-expanded) .navItem-userAuthList { left: 6px !important; width: 56px !important; padding: 0 !important; }
html.fml:not(.fml-nav-expanded) :is(.user-auth-list, .user-auth-list_listContent) { justify-content: center !important; padding: 0 !important; }
html.fml:not(.fml-nav-expanded) .user-auth-list_item { margin: 0 !important; }
/* List widths. The chat list and the Contacts group list are 260px by
   default and at least: the width of five pinned chats. Feishu sets how
   many pinned chats go on a row from the list width, and five fit from
   256px (tested; at 254px it shows four wider ones), so 260px leaves a
   small margin. The script sets --fml-list-w and
   --fml-contacts-w from the user's drag and keeps them in localStorage.
   Feishu clamps the chat list at 288px (an inline min-width and the
   clamp in its own resizer), so the script owns both the width and the
   drag. The chat takes the rest of the row. The phone layout is full
   screen and keeps its own rules. */
html.fml:not(.fml-mobile) .page-view-messenger { width: var(--fml-list-w, 260px) !important; flex: none !important; }
html.fml:not(.fml-mobile) .page-view-messenger [style*="min-width: 288px"] { min-width: 0 !important; }
html.fml:not(.fml-mobile) .page-view-messenger-chat { flex: 1 1 0 !important; width: auto !important; min-width: 0 !important; }
html.fml:not(.fml-mobile) .contactPageNav { width: var(--fml-contacts-w, 260px) !important; min-width: 0 !important; max-width: none !important; flex: none !important; }
html.fml:not(.fml-mobile) .contactTab { flex: 1 1 0 !important; width: auto !important; min-width: 0 !important; }
/* Contacts has no divider, so the script adds one in the 8px gap between
   the two panels. It is absolutely placed, so it takes no space. */
html.fml .contactPage { position: relative; }
.fml-resizer { display: none; }
html.fml:not(.fml-mobile) .fml-resizer {
    display: block;
    position: absolute;
    z-index: 5;
    top: 0;
    bottom: 0;
    left: var(--fml-contacts-w, 260px);
    width: 8px;
    cursor: col-resize;
}
html.fml-resizing, html.fml-resizing * { cursor: col-resize !important; user-select: none !important; }
/* The expand and collapse button, below the tabs, in the same capsule shape. */
.fml-nav-toggle { display: none; }
html.fml .fml-nav-toggle {
    display: flex;
    align-items: center;
    width: 100%;
    height: 32px;
    margin: 8px 0 0;
    padding: 0 0 0 19px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-caption);
    cursor: pointer;
    transition: background-color .15s ease;
}
html.fml .fml-nav-toggle:hover { background: var(--fill-hover); }
html.fml:not(.fml-nav-expanded) .fml-nav-toggle { justify-content: center; padding: 0; }
html.fml .fml-nav-toggle svg { width: 16px; height: 16px; transition: transform .2s ease; }
/* The chevrons point right to expand and left to collapse. */
html.fml.fml-nav-expanded .fml-nav-toggle svg { transform: scaleX(-1); }
/* The chat header and the message box sit above and below the message
   scroller, not over it, so a backdrop blur would only blur the static
   panel. A plain tint looks the same and keeps them off the GPU. */
html.fml .chatContainer__headerWrapper {
    background: color-mix(in srgb, var(--bg-body) 60%, transparent) !important;
    box-shadow: inset 0 -.5px 0 var(--line-divider-default) !important;
}
html.fml .lark__editor--default {
    background: color-mix(in srgb, var(--bg-float) 62%, transparent) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-panel) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow) !important;
}
html.fml .lark__editor--default:focus-within {
    box-shadow: var(--fml-glass-edge), var(--fml-panel-shadow),
                0 0 0 3px color-mix(in srgb, var(--fml-blue) 35%, transparent) !important;
}

/* ---- Liquid Glass: floating surfaces ---------------------------------- */
html.fml :is(
    .ud__popover__content, .ud__popover-inner, .ud__dropdown__menu, .ud__dropdown-menu,
    .ud__menu, .ud__select__dropdown, .ud__select-dropdown, .ud__cascader__dropdown,
    .ud__toast, .ud__message__notice, .ud__notification__notice, [role="menu"],
    /* Messenger's own right-click and "+" menus. */
    .larkc-contextMenu-wrapper, .quick-jump-menu
) {
    background: color-mix(in srgb, var(--bg-float, #fff) 72%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-edge), var(--fml-glass-shadow) !important;
}
/* Tooltips have white text, so their glass is a dark tint. UD nests two
   tooltip panels; only the outer one gets glass so the tint does not double. */
html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) {
    background: color-mix(in srgb, var(--bg-tips, #1f2329) 78%, transparent) !important;
    -webkit-backdrop-filter: var(--fml-glass-filter) !important;
    backdrop-filter: var(--fml-glass-filter) !important;
    border: 0 !important;
    border-radius: var(--fml-radius-s) !important;
    corner-shape: squircle;
    box-shadow: var(--fml-glass-shadow) !important;
}
html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) :is(.ud__tooltip-content, .ud__tooltip-inner, [role="tooltip"]) {
    background: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
}
/* Arrows on popovers and tooltips do not match a blurred, rounded panel. */
html.fml :is(.ud__popover__arrow, .ud__popover-arrow, .ud__tooltip__arrow, .ud__tooltip-arrow) { display: none !important; }
/* Menu rows: inset, rounded highlights as in macOS menus. */
html.fml :is(.ud__menu__item, .ud__menu-item, .ud__dropdown__item, .ud__dropdown-menu-item,
             .ud__select__option, .ud__select-option, [role="menuitem"]) {
    margin: 0 5px !important;
    border-radius: 8px !important;
}
html.fml :is(.ud__modal__content, .ud__modal-content, .ud__drawer__content) {
    border-radius: var(--fml-radius-l) !important;
    corner-shape: squircle;
    overflow: hidden;
    box-shadow: var(--fml-glass-edge), var(--fml-glass-shadow) !important;
}
/* Dialog backdrops dim and blur, as sheets do in iOS 27. */
html.fml :is(.ud__modal__mask, .ud__modal-mask, .ud__drawer__mask, .ud__drawer-mask) {
    background: rgba(0, 0, 0, .22) !important;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
}

/* ---- Controls ---------------------------------------------------------- */
html.fml :is(.ud__button, button[class*="ud__button"]) {
    border-radius: 999px !important;
    transition: transform .15s ease, filter .15s ease, background-color .15s ease;
}
html.fml :is(.ud__button, button[class*="ud__button"]):active { transform: scale(.97); }
html.fml :is(.ud__input, .ud__input-wrapper, .ud__input__wrapper, .ud__select__selector, .ud__select-selector,
             .ud__textarea, .ud__search, [class*="ud__input-search"]) {
    border-radius: var(--fml-radius-s) !important;
    corner-shape: squircle;
}
html.fml :is(.ud__input, .ud__input-wrapper, .ud__input__wrapper, .ud__textarea):focus-within {
    box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--fml-blue) 35%, transparent) !important;
}
/* Switches in the palette's green. */
html.fml :is(.ud__switch--checked, .ud__switch-checked, .ud__switch[aria-checked="true"]) {
    background-color: var(--fml-green) !important;
}
html.fml :is(.ud__checkbox__inner, .ud__checkbox-inner) { border-radius: 6px !important; }
html.fml :is(.ud__badge__count, .ud__badge-count, .ud__badge__dot, .ud__badge-dot) {
    background-color: var(--fml-red) !important;
    box-shadow: none !important;
}
/* Segmented tabs (All / Unread / @Me and so on) as capsules. */
html.fml :is(.ud__tabs__tab, .ud__tabs-tab, [role="tab"]) { border-radius: 999px !important; }

/* ---- Cards and images -------------------------------------------------- */
/* Message cards, link previews, file and image attachments. */
html.fml :is(.ud__card, [class*="message-card" i], [class*="messageCard" i], [class*="file-card" i], [class*="fileCard" i]) {
    border-radius: var(--fml-radius-m) !important;
    corner-shape: squircle;
}
html.fml :is([class*="message-image" i], [class*="messageImage" i], [class*="image-message" i]) img {
    border-radius: var(--fml-radius-m) !important;
}

/* ---- Motion ------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
    html.fml *, html.fml *::before, html.fml *::after {
        transition-duration: .01ms !important;
        animation-duration: .01ms !important;
    }
}
/* With Reduce Transparency on, glass turns solid, as in iOS. */
@media (prefers-reduced-transparency: reduce) {
    html.fml * { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
    html.fml :is(
        .ud__popover__content, .ud__popover-inner, .ud__dropdown__menu, .ud__dropdown-menu,
        .ud__menu, .ud__select__dropdown, .ud__select-dropdown, .ud__cascader__dropdown,
        .ud__toast, .ud__message__notice, .ud__notification__notice, [role="menu"],
        .larkc-contextMenu-wrapper, .quick-jump-menu
    ) { background: var(--bg-float, #fff) !important; }
    html.fml :is(.ud__tooltip__content, .ud__tooltip-inner, [role="tooltip"]) {
        background: var(--bg-tips, #1f2329) !important;
    }
    html.fml :is(.page-content-wrapper, .contactPageNav, .contactTab, .chatContainer__headerWrapper, .lark__editor--default,
                 #root-todo > div > div > div, .workplace-wrapper, .category-list-section,
                 #calendar-tab .tool-panel, #calendar-tab .calendar-view, #calendar-tab .create-event-page .left) {
        background: var(--bg-body) !important;
    }
    html.fml #calendar-tab :is(.event-detail, .month-view-show-more) { background: var(--bg-float) !important; }
    html.fml .appNavbar::before { background: var(--bg-body-overlay); }
}
`;

    // Some managers run before <html> exists; the shared library waits for it.
    const whenRoot = FeishuLiteBlocker.whenRoot;

    const style = document.createElement('style');
    style.id = 'fml-style';
    style.textContent = CSS;
    whenRoot(() => (document.head || document.documentElement).appendChild(style));

    // ---------------------------------------------------------------------
    // Light or dark. Most of Feishu's CSS reads only the system theme, so the
    // script sets html.fml-dark from Feishu's Appearance setting instead, and
    // you can switch without changing the browser or OS theme.
    //
    // Feishu has two Appearance settings (Light, Dark or Follow System): one
    // in the Messenger avatar menu and one in the Docs "..." menu. They are
    // saved apart and do not sync. Both Lite scripts use the most recent
    // choice from either menu, so one switch changes Messenger and Docs.
    // Follow System uses the browser or OS theme.
    //
    // - Messenger saves {"value":"DARK","lastTime":...} in MESSENGER_KEY.
    // - Docs saves {"setting":"dark","sync":true,...} in DOCS_KEY when you
    //   choose. It also rewrites the key without "sync" on every page load,
    //   so only writes with "sync" count as a choice.
    // - The latest choice and its time go in CHOICE_KEY, which both scripts
    //   share because Messenger and Docs are on the same tenant domain.
    const MESSENGER_KEY = 'larkapi/next_lark_web_preference/lark.setting.theme';
    const DOCS_KEY = 'view_mode';
    const CHOICE_KEY = 'feishu-lite-theme';
    const CHOICES = ['light', 'dark', 'system'];
    const setItem = Storage.prototype.setItem;
    const parse = (text) => {
        try { return JSON.parse(text); } catch { return text; }
    };
    const readKey = (key) => {
        try { return parse(localStorage.getItem(key)); } catch { return null; }
    };
    const fromMessenger = (v) => ({ LIGHT: 'light', DARK: 'dark', FOLLOW_SYSTEM: 'system' })[v && typeof v === 'object' ? v.value : v] || null;
    const fromDocs = (v) => (v && CHOICES.includes(v.setting) ? v.setting : null);
    // A write to a Feishu key that is a real choice: [setting, time] or null.
    const choiceOf = (key, text) => {
        const v = parse(text);
        if (key === MESSENGER_KEY) return fromMessenger(v) && [fromMessenger(v), +v?.lastTime || Date.now()];
        if (key === DOCS_KEY && v?.sync) return fromDocs(v) && [fromDocs(v), Date.now()];
        return null;
    };
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');
    const wantDark = () => {
        const saved = readKey(CHOICE_KEY);
        // No choice made since the script was installed: use this page's own
        // setting, then the other one.
        const setting = CHOICES.includes(saved?.setting) ? saved.setting
            : fromMessenger(readKey(MESSENGER_KEY)) || fromDocs(readKey(DOCS_KEY));
        return setting === 'dark' || (setting !== 'light' && darkQuery.matches);
    };
    const remember = (choice) => {
        if (!choice) return;
        const [setting, time] = choice;
        // An older write (for example Feishu saving an unchanged setting
        // again) does not replace a newer choice.
        if (!(time > (+readKey(CHOICE_KEY)?.time || 0))) return;
        try { setItem.call(localStorage, CHOICE_KEY, JSON.stringify({ setting, time })); } catch { /* storage full or blocked */ }
        applyTheme();
    };
    const applyTheme = () => {
        const dark = wantDark();
        whenRoot(() => document.documentElement.classList.toggle('fml-dark', dark));
    };
    applyTheme();
    darkQuery.addEventListener('change', applyTheme);
    // A choice made in another tab (the storage event fires only there).
    addEventListener('storage', (e) => {
        if (e.key === CHOICE_KEY || e.key === null) applyTheme();
        else remember(choiceOf(e.key, e.newValue));
    });
    // A choice made in this tab. The script runs in the page (@grant none),
    // so wrapping setItem sees Feishu's own write at once.
    Storage.prototype.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (this === localStorage) remember(choiceOf(key, String(value)));
    };

    // ---------------------------------------------------------------------
    // The other tokens. Feishu has about 13,000 tokens on :root, about 440
    // of them grays. Once its token sheet loads, each gray is remapped to the
    // palette colour at the same lightness (alpha kept); real colours stay.
    // The result goes before the main style, so the core tokens above win.
    //
    // Feishu puts its dark tokens in a (prefers-color-scheme: dark) query, so
    // they follow the system, not Feishu's Appearance setting. Each theme is
    // therefore written in full under its own class (html.fml or
    // html.fml.fml-dark): every token whose value differs between Feishu's
    // light and dark sets is copied, so the wrong set never shows through.
    // ---------------------------------------------------------------------
    // Lightness stops; a gray between two stops is interpolated.
    const RAMPS = {
        light: [[0, '#001f27'], [0.14, '#073642'], [0.22, '#2c4b53'], [0.35, '#586e75'],
            [0.45, '#657b83'], [0.6, '#93a1a1'], [0.76, '#b3b8ae'], [0.84, '#d2cbb5'],
            [0.9, '#e4ddc8'], [0.95, '#eee8d5'], [0.97, '#f6efdb'], [1, '#fdf6e3']],
        dark: [[0, '#000000'], [0.04, '#0a0a0b'], [0.08, '#141416'], [0.1, '#1c1c1e'],
            [0.16, '#242426'], [0.22, '#2c2c2e'], [0.26, '#3a3a3c'], [0.31, '#48484a'],
            [0.37, '#545458'], [0.46, '#636366'], [0.55, '#8e8e93'], [0.65, '#aeaeb2'],
            [0.82, '#c7c7cc'], [0.92, '#f2f2f7'], [1, '#ffffff']],
    };
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rampAt = (ramp, l) => {
        let i = 1;
        while (i < ramp.length - 1 && ramp[i][0] < l) i++;
        const [l0, c0] = ramp[i - 1];
        const [l1, c1] = ramp[i];
        const t = l1 === l0 ? 0 : Math.min(1, Math.max(0, (l - l0) / (l1 - l0)));
        const a = hexRgb(c0), b = hexRgb(c1);
        return a.map((x, k) => Math.round(x + (b[k] - x) * t));
    };
    const parseColor = (v) => {
        v = v.trim();
        let m = v.match(/^#([0-9a-f]{6})$/i);
        if (m) return [...hexRgb('#' + m[1]), 1];
        m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    // Tokens that must keep Feishu's value: fixed colours, illustrations,
    // charts, and the watermark.
    const KEEP = /static|white|black|illustration|datav|watermark|-(?:raw|SR|SG|SB|SA|HS|L)$/i;
    const remap = (rule, ramp, other) => {
        const out = [];
        for (const name of rule.style) {
            if (!name.startsWith('--')) continue;
            const value = rule.style.getPropertyValue(name).trim();
            const c = KEEP.test(name) ? null : parseColor(value);
            if (!c || Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 14) {
                // Not a gray: keep Feishu's value for this theme, but only
                // where the other theme has a different one.
                if (other && other.style.getPropertyValue(name).trim() !== value) out.push(`${name}: ${value};`);
                continue;
            }
            const l = (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 510;
            const [r, g, b] = rampAt(ramp, l);
            out.push(`${name}: ${c[3] === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${c[3]})`};`);
            if (rule.style.getPropertyValue(name + '-raw')) out.push(`${name}-raw: ${r},${g},${b};`);
        }
        return out.join('\n');
    };
    const tokenStyle = document.createElement('style');
    tokenStyle.id = 'fml-tokens';
    // Feishu has about 80 stylesheets. Each is read once, cross-origin ones
    // (SecurityError) are not retried, and the work stops when the token
    // sheet is found. Other errors mean the sheet is still loading.
    const done = new WeakSet();
    let tokensFound = false;
    const buildTokens = () => {
        if (tokensFound) return;
        for (const sheet of document.styleSheets) {
            if (done.has(sheet)) continue;
            let rules;
            try { rules = sheet.cssRules; } catch (e) {
                if (e.name === 'SecurityError') done.add(sheet);
                continue;
            }
            done.add(sheet);
            // The token sheet: a huge :root, and again inside a dark query.
            let light = null, dark = null;
            for (const rule of rules) {
                if (rule.selectorText === ':root' && rule.style.length > 500) light = rule;
                else if (rule.media && /dark/.test(rule.media.mediaText)) {
                    for (const inner of rule.cssRules) {
                        if (inner.selectorText === ':root' && inner.style.length > 500) dark = inner;
                    }
                }
            }
            let css = '';
            if (light) css += `html.fml, html.fml body {\n${remap(light, RAMPS.light, dark)}\n}\n`;
            // Later in the sheet, and more specific, so it wins when dark.
            if (dark) css += `html.fml.fml-dark, html.fml.fml-dark body {\n${remap(dark, RAMPS.dark, light)}\n}\n`;
            if (css) {
                tokenStyle.textContent += css;
                if (!tokenStyle.isConnected && style.parentNode) style.parentNode.insertBefore(tokenStyle, style);
                tokensFound = true;
                document.removeEventListener('load', onLinkLoad, true);
                return;
            }
        }
    };
    // Load events do not bubble, so listen in the capture phase.
    const onLinkLoad = (e) => {
        if (e.target.tagName === 'LINK' && onFeishuPage()) buildTokens();
    };
    document.addEventListener('load', onLinkLoad, true);
    document.addEventListener('DOMContentLoaded', () => { if (onFeishuPage()) buildTokens(); }, { once: true });
    // A manager that injects after the HTML is parsed misses those events.
    if (document.readyState !== 'loading' && onFeishuPage()) whenRoot(buildTokens);

    // ---------------------------------------------------------------------
    // "Download Feishu" entries that the CSS cannot match: find them by their
    // text and hide the largest ancestor whose text is still just the label.
    // Added nodes are checked once per frame. Messages and the message box
    // are skipped: they are most of the mutations, and a message that says
    // "下载飞书" must stay visible.
    // ---------------------------------------------------------------------
    const LABEL = /^(?:下载飞书(?:客户端|桌面端|App)?|下載飛書(?:客戶端|桌面端|App)?|Download (?:Feishu|Lark)(?: (?:app|desktop|client))?|(?:Feishu|Lark)\s*(?:を)?ダウンロード)$/i;
    const HINT = /下载飞书|下載飛書|Download (?:Feishu|Lark)|(?:Feishu|Lark)\s*を?ダウンロード/i;
    const STOP = new Set(['BODY', 'HTML', 'NAV', 'ASIDE', 'HEADER', 'MAIN', 'UL', 'OL']);
    const SKIP = '.chatMainContent, [contenteditable="true"]';

    const hidden = new Set();
    const hideEntry = (textNode) => {
        let el = textNode.parentElement;
        if (!el || el.closest(SKIP)) return;
        const label = el.textContent.trim();
        // Climb to take the entry's icon too, but stop at a parent that holds
        // anything more than a small icon. The sidebar's account entry has
        // no text, so a text test alone would hide it with the download entry.
        for (let i = 0; i < 5; i++) {
            const up = el.parentElement;
            if (!up || STOP.has(up.tagName) || up.textContent.trim() !== label) break;
            if ([...up.children].some((c) => c !== el && c.getElementsByTagName('*').length > 3)) break;
            el = up;
        }
        // React can rewrite className but keeps unmanaged inline styles.
        el.classList.add('fml-hidden');
        el.style.setProperty('display', 'none', 'important');
        hidden.add(el);
    };

    const scan = (root) => {
        if (!HINT.test(root.textContent)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (LABEL.test(n.nodeValue.trim())) hideEntry(n);
        }
    };

    let pending = [];
    let frame = 0;
    const flush = () => {
        frame = 0;
        const roots = pending;
        pending = [];
        if (!onFeishuPage()) return;
        placeNavToggle();
        placeResizer();
        for (const root of roots) if (root.isConnected && !root.closest(SKIP)) scan(root);
    };
    const observer = new MutationObserver((records) => {
        for (const rec of records) {
            for (const n of rec.addedNodes) {
                if (n.nodeType === 1) pending.push(n);
                else if (n.nodeType === 3 && n.parentElement) pending.push(n.parentElement);
            }
        }
        if (pending.length && !frame) frame = requestAnimationFrame(flush);
    });

    // ---------------------------------------------------------------------
    // The "Done" (archive) button on a chat row shows a "Done" tooltip on
    // hover. React builds the tooltip from the mouse events that reach its
    // root, so stopping the events that enter the button keeps the tooltip
    // from being created at all. Leaving the button is not stopped, so the
    // row's own hover state still clears. The button still works on click.
    // ---------------------------------------------------------------------
    const DONE_BUTTON = '.a11y_feed_item_done';
    const muteDoneTooltip = (e) => {
        if (!active) return;
        // Entering the button: mouseover targets it, and the mouseout from
        // the row has it as relatedTarget.
        const t = e.type.endsWith('out') ? e.relatedTarget : e.target;
        if (t instanceof Element && t.closest(DONE_BUTTON)) e.stopPropagation();
    };
    for (const type of ['mouseover', 'mouseout', 'pointerover', 'pointerout']) {
        document.addEventListener(type, muteDoneTooltip, true);
    }

    // ---------------------------------------------------------------------
    // Background prefetch, built on Feishu's own code so that it reads and
    // writes nothing Feishu would not:
    // - The chat list loads 15 chats, then more as you scroll. The FeedList
    //   component's own loadmore() loads the rest without scrolling.
    // - "Collapsed Chats" (the folded chats) is one entry that Feishu sorts
    //   by time. A wrapper on the feed store's getState() moves it to the
    //   end of the list.
    // - Feishu's message service can sync a chat's latest messages into the
    //   IM SDK without showing them, so the chat opens from local data. This
    //   runs for plain chats (not topic groups) that are not folded and have
    //   fewer than 100 members, one at a time, in idle time, and again only
    //   when the chat has a new message. It does not mark anything as read;
    //   a check below turns it off if that ever changes.
    // It runs every few minutes and soon after Feishu receives new messages
    // (the store changes when a push arrives).
    // ---------------------------------------------------------------------
    const PREFETCH_MAX_MEMBERS = 100;
    const SWEEP_MS = 5 * 60 * 1000;
    const PREFETCH_GAP_MS = 300;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // Wait for the browser to be idle, so that the work never competes with
    // scrolling, typing or rendering.
    const idle = () => new Promise((resolve) => {
        if (window.requestIdleCallback) requestIdleCallback(() => resolve(), { timeout: 3000 });
        else setTimeout(resolve, 50);
    });

    let feedStore = null;
    let messageService;   // undefined: not looked up yet; null: not found
    let prefetchOff = false;
    const prefetched = new Map(); // chat id -> last message position already synced
    const queue = [];
    const queued = new Set();
    let pumping = false;

    // Feishu's modules are not global. Pushing a chunk with a runtime
    // callback into its webpack queue hands back the module loader; the
    // message service is then found by its source text, because module ids
    // change with every Feishu build.
    const findMessageService = () => {
        const chunks = window.webpackChunkLarkletMessenger;
        if (!chunks) return null;
        let req = null;
        chunks.push([[Symbol('fml')], {}, (r) => { req = r; }]);
        if (!req) return null;
        for (const id in req.m) {
            if (!Function.prototype.toString.call(req.m[id]).includes('getChatMessages:async function')) continue;
            const service = req(id)?.default;
            if (typeof service?.getChatMessages === 'function') return service;
        }
        return null;
    };

    const moveBoxLast = (store) => {
        const getState = store.getState;
        let lastIn = null;
        let lastOut = null;
        store.getState = function () {
            const state = getState.apply(this, arguments);
            if (!active) return state;
            // React and Feishu call getState very often. The result is
            // cached per state object, so most calls cost one comparison and
            // selectors still see a stable object.
            if (state === lastIn) return lastOut;
            lastIn = lastOut = state;
            const box = state?.status?.boxEntryId;
            const list = state?.message?.list;
            const items = list?.items;
            if (box && items?.length && items[items.length - 1] !== box) {
                const i = items.indexOf(box);
                if (i >= 0) {
                    const moved = items.slice();
                    moved.splice(i, 1);
                    moved.push(box);
                    lastOut = { ...state, message: { ...state.message, list: { ...list, items: moved } } };
                }
            }
            return lastOut;
        };
        // An action no reducer knows makes the list read the new order.
        store.dispatch({ type: 'fml/refresh' });
    };

    // The FeedList component's props hold loadmore() for the list on screen.
    const feedListProps = () => {
        const el = document.querySelector('.a11y_feed_main_list');
        if (!el) return null;
        const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'));
        for (let f = key && el[key], i = 0; f && i < 20; f = f.return, i++) {
            if (typeof f.memoizedProps?.loadmore === 'function') return f.memoizedProps;
        }
        return null;
    };

    const waitForStore = (test, ms) => new Promise((resolve) => {
        if (test()) { resolve(true); return; }
        let unsubscribe = null;
        const timer = setTimeout(() => { unsubscribe(); resolve(false); }, ms);
        unsubscribe = feedStore.subscribe(() => {
            if (!test()) return;
            clearTimeout(timer);
            unsubscribe();
            resolve(true);
        });
    });

    // Load the rest of the chat list. A feed cursor with id "0" marks the end.
    const prefetchFeed = async () => {
        for (let page = 0; page < 30 && active; page++) {
            const state = feedStore.getState();
            const list = state.message?.list;
            if (!list || list.loading || list.feedCursor?.id === '0') return;
            // loadmore() loads the filter on screen; only the Chats list is wanted.
            if (state.status?.activeFilterType !== state.message.type) return;
            const props = feedListProps();
            if (!props) return;
            const before = list.items.length;
            props.loadmore();
            const loaded = await waitForStore(() => {
                const l = feedStore.getState().message?.list;
                return l && !l.loading && (l.items.length !== before || l.feedCursor?.id === '0');
            }, 5000);
            if (!loaded) return;
            await idle();
        }
    };

    // Chats in the main list that are not in "Collapsed Chats", have fewer
    // than 100 members (0 for one-to-one chats), are not open, and have a
    // message that has not been synced yet. Topic groups (chatMode other
    // than 1) and groups shown as topics (chatDisplayModeSetting 2) are
    // skipped: Feishu loads them topic by topic, and a plain sync of their
    // latest messages left some topics unable to load.
    const prefetchCandidates = () => {
        const state = feedStore.getState();
        const out = [];
        for (const id of state.message?.list?.items || []) {
            const p = state.previews?.[id];
            if (!p || p.type !== 1 || p.parentCardId || p.isMember === false) continue;
            if (p.chatMode !== 1 || p.chatDisplayModeSetting !== 1) continue;
            if ((p.userCount || 0) >= PREFETCH_MAX_MEMBERS || id === state.status?.activeFeedId) continue;
            if (prefetched.get(id) === p.lastMessagePosition) continue;
            out.push(id);
        }
        return out;
    };

    // Safety check: a sync must not move the chat's read position. If it
    // does while the chat is not open, stop prefetching for this page load.
    const checkReadPosition = (id, before) => {
        setTimeout(() => {
            const state = feedStore.getState();
            const p = state.previews?.[id];
            if (p && p.readPosition > before && state.status?.activeFeedId !== id) {
                prefetchOff = true;
                console.warn('[Feishu Messenger Lite] Chat prefetch stopped: a read position changed after a prefetch.');
            }
        }, 3000);
    };

    // One chat at a time, each after an idle period and a short gap, so the
    // IM SDK is never busy with prefetch when Feishu needs it.
    const pump = async () => {
        pumping = true;
        while (queue.length && active && !prefetchOff) {
            await idle();
            const id = queue.shift();
            queued.delete(id);
            const p = feedStore.getState().previews?.[id];
            if (!p || id === feedStore.getState().status?.activeFeedId) continue;
            try {
                // needResponse must stay true. With false, the service returns
                // before it adds the chat's members to Feishu's name map, so
                // the chat opens with English names only (for example on
                // reactions) until Feishu fetches the members again. The
                // response itself is only normalized, not stored, so it is
                // dropped here.
                await messageService.getChatMessages({ chatId: id, count: 20, needResponse: true });
                prefetched.set(id, p.lastMessagePosition);
                checkReadPosition(id, p.readPosition);
            } catch { /* skipped; the next sweep tries again */ }
            await sleep(PREFETCH_GAP_MS);
        }
        pumping = false;
    };

    const enqueuePrefetch = () => {
        if (!messageService || prefetchOff || !active) return;
        for (const id of prefetchCandidates()) {
            if (queued.has(id)) continue;
            queued.add(id);
            queue.push(id);
        }
        if (queue.length && !pumping) pump();
    };

    const sweep = async () => {
        if (!active || !feedStore) return;
        await idle();
        await prefetchFeed();
        if (messageService === undefined) messageService = findMessageService();
        enqueuePrefetch();
    };

    // A push (new message, read on another device and so on) changes the
    // store. Changes come in bursts, so they are handled at most every 2 s.
    let pushTimer = 0;
    const onStoreChange = () => {
        if (pushTimer || !active) return;
        pushTimer = setTimeout(() => { pushTimer = 0; enqueuePrefetch(); }, 2000);
    };

    // The feed store and the list appear some seconds after the page loads.
    let booting = false;
    const bootPrefetch = async () => {
        if (feedStore || booting) return;
        booting = true;
        for (let i = 0; i < 120 && !feedStore; i++) {
            const store = window.__feedStore;
            if (store?.getState && store.subscribe && document.querySelector('.a11y_feed_main_list')) {
                feedStore = store;
                moveBoxLast(store);
                store.subscribe(onStoreChange);
                setInterval(sweep, SWEEP_MS);
                sweep();
                break;
            }
            await sleep(1000);
        }
        booting = false;
    };

    // ---------------------------------------------------------------------
    // Phone layout for iOS Safari. The top of this script makes Feishu see
    // a Mac, so the phone is found by its real touch support and screen
    // size instead. A narrow window on a
    // computer gets the same layout.
    // ---------------------------------------------------------------------
    const isMobile = () => (realTouchPoints > 0 && Math.min(screen.width, screen.height) <= 500)
        || window.innerWidth <= 640;
    let mobile = false;

    // In desktop mode Safari may lay the page out wider than the screen.
    // This viewport keeps it at the phone's width, stops the zoom when a
    // text field gets focus, and lets the page use the full screen so the
    // safe-area padding in the CSS can keep clear of the notch.
    const VIEWPORT = 'width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
    const setViewport = () => {
        if (!document.head) return;
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            document.head.appendChild(meta);
        }
        if (meta.content !== VIEWPORT) meta.content = VIEWPORT;
    };

    const backButton = document.createElement('button');
    backButton.className = 'fml-back';
    backButton.type = 'button';
    backButton.setAttribute('aria-label', 'Back');
    backButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>';

    // Opening a chat adds a history entry with the same URL, so Safari's
    // back swipe and back button return to the list instead of leaving
    // Feishu. Feishu's own history state is kept in the entry.
    const openChatView = () => {
        if (document.documentElement.classList.contains('fml-chat-open')) return;
        document.documentElement.classList.add('fml-chat-open');
        history.pushState({ ...(history.state || {}), fml: 'chat' }, '', location.href);
    };
    const closeChatView = () => document.documentElement.classList.remove('fml-chat-open');
    backButton.addEventListener('click', () => {
        if (history.state?.fml === 'chat') history.back(); // popstate closes the view
        else closeChatView();
    });
    window.addEventListener('popstate', () => {
        if (history.state?.fml !== 'chat') closeChatView();
    });

    const rowFeedId = (row) => {
        const key = Object.keys(row).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'));
        for (let f = key && row[key], i = 0; f && i < 15; f = f.return, i++) {
            if (typeof f.memoizedProps?.feedId === 'string') return f.memoizedProps.feedId;
        }
        return null;
    };
    // A tap on a chat row shows the chat. The Done button archives without
    // opening, and "Collapsed Chats" opens its folder inside the list.
    // In Contacts, a tap on a contact group shows its contacts. The group
    // items have a type class (ORGANIZATION, GROUP and so on); the tenant
    // item at the top has none and stays in the list.
    document.addEventListener('click', (e) => {
        if (!mobile || !active || !(e.target instanceof Element)) return;
        if (section() === 'contacts') {
            const item = e.target.closest('.contactPageNav_item');
            if (item && item.classList.length > 1 && e.target.closest('.larkc-card')) openChatView();
            return;
        }
        const row = e.target.closest('.a11y_feed_card_item');
        if (!row || e.target.closest(DONE_BUTTON)) return;
        const box = feedStore?.getState().status?.boxEntryId;
        if (box && rowFeedId(row) === box) return;
        openChatView();
    }, true);

    const syncMobile = () => {
        const want = active && isMobile();
        if (want !== mobile) {
            mobile = want;
            document.documentElement.classList.toggle('fml-mobile', want);
            if (!want) closeChatView();
        }
        if (mobile) {
            setViewport();
            if (document.body && !backButton.isConnected) document.body.appendChild(backButton);
        }
    };
    window.addEventListener('resize', () => { if (active) syncMobile(); });

    // ---------------------------------------------------------------------
    // Tab menu (the sidebar with Messenger, Docs, Calendar and the rest).
    // It is narrow and shows icons only by default. A button below the tabs
    // expands it to Feishu's width with labels, and collapses it again. The
    // choice is kept in localStorage for the next visit.
    // ---------------------------------------------------------------------
    const NAV_KEY = 'fml.navExpanded';
    let navExpanded = false;
    try { navExpanded = localStorage.getItem(NAV_KEY) === '1'; } catch { /* storage blocked: stay collapsed */ }
    const navToggle = document.createElement('button');
    navToggle.className = 'fml-nav-toggle';
    navToggle.type = 'button';
    navToggle.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 4 4-4 4M9 4l4 4-4 4"/></svg>';
    const applyNav = () => {
        document.documentElement.classList.toggle('fml-nav-expanded', navExpanded);
        const label = navExpanded ? 'Collapse tab menu' : 'Expand tab menu';
        navToggle.title = label;
        navToggle.setAttribute('aria-label', label);
        navToggle.setAttribute('aria-expanded', String(navExpanded));
        // Expanded tabs show their labels, so the tooltips set below go.
        if (navExpanded) {
            for (const el of document.querySelectorAll('[data-fml-tip]')) {
                el.removeAttribute('title');
                el.removeAttribute('data-fml-tip');
            }
        }
    };
    navToggle.addEventListener('click', () => {
        navExpanded = !navExpanded;
        try { localStorage.setItem(NAV_KEY, navExpanded ? '1' : '0'); } catch { /* not kept */ }
        applyNav();
    });
    whenRoot(applyNav);
    // The button goes at the end of Feishu's tab list. React keeps a node
    // that it did not create, but a re-render of the list can drop it, so
    // the observer's flush puts it back.
    const placeNavToggle = () => {
        const menu = document.querySelector('.appNavbar-navbarMenu');
        if (menu && navToggle.parentElement !== menu) menu.appendChild(navToggle);
    };
    // A collapsed tab has no label, so its label becomes the hover tooltip.
    document.addEventListener('mouseover', (e) => {
        if (!active || navExpanded || !(e.target instanceof Element)) return;
        const item = e.target.closest('.navbarMenu, .appNavbar-search-input');
        if (!item || item.hasAttribute('data-fml-tip')) return;
        const label = item.querySelector('.navbarMenu-content, .search-input-box-desc')?.textContent.trim();
        if (label) {
            item.title = label;
            item.setAttribute('data-fml-tip', '');
        }
    }, true);

    // ---------------------------------------------------------------------
    // List widths. Both lists default to the width of four pinned chats and
    // can be dragged wider or back to that size at the divider. A double
    // click on the divider resets the width. Feishu's own resizer stops at
    // 288px, so its drag is stopped and this one runs instead.
    // ---------------------------------------------------------------------
    const LIST_MIN = 260; // five pinned chats per row; see the CSS
    const CHAT_MIN = 320; // keep the chat or the contact list usable
    const PANES = {
        messenger: { key: 'fml.listWidth', prop: '--fml-list-w', pane: '.page-view-messenger' },
        contacts: { key: 'fml.contactsWidth', prop: '--fml-contacts-w', pane: '.contactPageNav' },
    };
    const setPaneWidth = (pane, width) => document.documentElement.style.setProperty(pane.prop, `${Math.round(width)}px`);
    whenRoot(() => {
        for (const pane of Object.values(PANES)) {
            let width = LIST_MIN;
            try { width = Math.max(LIST_MIN, Number(localStorage.getItem(pane.key)) || LIST_MIN); } catch { /* default */ }
            setPaneWidth(pane, width);
        }
    });
    const contactsResizer = document.createElement('div');
    contactsResizer.className = 'fml-resizer';
    contactsResizer.setAttribute('role', 'separator');
    contactsResizer.setAttribute('aria-orientation', 'vertical');
    // Like the tab menu button, the divider is put back if React drops it.
    const placeResizer = () => {
        const page = section() === 'contacts' && document.querySelector('.contactPage');
        if (page && contactsResizer.parentElement !== page) page.appendChild(contactsResizer);
    };
    const resizerAt = (e) => active && !mobile && e.target instanceof Element
        && e.target.closest('.sidebar-resizer, .fml-resizer') && PANES[section()];
    // Stopping the pointerdown also stops the mousedown that follows it;
    // the mousedown is stopped too in case Feishu listens for it alone.
    document.addEventListener('mousedown', (e) => { if (resizerAt(e)) e.stopImmediatePropagation(); }, true);
    document.addEventListener('pointerdown', (e) => {
        const pane = resizerAt(e);
        const el = pane && document.querySelector(pane.pane);
        if (!el || e.button !== 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const startX = e.clientX;
        const startWidth = el.getBoundingClientRect().width;
        const max = Math.max(LIST_MIN, el.parentElement.getBoundingClientRect().width - CHAT_MIN);
        let width = startWidth;
        document.documentElement.classList.add('fml-resizing');
        const move = (ev) => {
            width = Math.min(max, Math.max(LIST_MIN, startWidth + ev.clientX - startX));
            setPaneWidth(pane, width);
        };
        const up = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('pointercancel', up, true);
            document.documentElement.classList.remove('fml-resizing');
            try { localStorage.setItem(pane.key, String(Math.round(width))); } catch { /* not kept */ }
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', up, true);
    }, true);
    document.addEventListener('dblclick', (e) => {
        const pane = resizerAt(e);
        if (!pane) return;
        e.stopImmediatePropagation();
        setPaneWidth(pane, LIST_MIN);
        try { localStorage.removeItem(pane.key); } catch { /* nothing kept */ }
    }, true);

    // ---------------------------------------------------------------------
    // Route tracking: the theme and the observer are on only on
    // /next/messenger, /next/contacts, /next/task, /next/workplace and
    // /calendar.
    // ---------------------------------------------------------------------
    let active = false;
    let lastSection = null;
    const sync = () => {
        const want = onFeishuPage();
        // Going between Messenger and Contacts keeps the script on, but the
        // open chat or contact list belongs to the page that was left.
        const now = section();
        if (now !== lastSection) {
            lastSection = now;
            closeChatView();
            // The prefetch waits for the chat list, which only Messenger
            // has, so a visit that starts in Task or Workplace boots it here.
            if (now === 'messenger' && active) bootPrefetch();
        }
        if (want === active) return;
        active = want;
        document.documentElement.classList.toggle('fml', want);
        if (want) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
            if (document.body) scan(document.body);
            if (now === 'messenger') bootPrefetch();
            placeNavToggle();
            placeResizer();
            if (feedStore) sweep();
            syncMobile();
            // <body> may not exist yet at document-start.
            if (!document.body) document.addEventListener('DOMContentLoaded', syncMobile, { once: true });
        } else {
            syncMobile();
            observer.disconnect();
            pending = [];
            // The sidebar stays in Docs, Calendar and the rest; restore it.
            for (const el of hidden) {
                el.classList.remove('fml-hidden');
                el.style.removeProperty('display');
            }
            hidden.clear();
        }
    };
    // The shared library patches history once and runs this after
    // pushState, replaceState and popstate.
    FeishuLiteBlocker.onRoute(sync);
    whenRoot(sync);
})(false);
