// ==UserScript==
// @name         Feishu Docs Lite
// @name:zh-CN   飞书文档精简
// @namespace    https://github.com/hxueh
// @version      0.5.0
// @description  Makes Feishu Wiki, Docs, Sheets and Base lighter by blocking analytics, monitoring, ad trackers, and testing tools. Uses the system font and keeps Feishu’s theme settings.
// @description:zh-CN 精简飞书知识库、云文档、电子表格和多维表格，拦截统计、监控、广告追踪和测试工具。使用系统字体，保留飞书的主题设置。
// @author       hxueh
// @license      MIT
// @icon         https://www.feishu.cn/favicon.ico
// @match        https://*.feishu.cn/wiki
// @match        https://*.feishu.cn/wiki/*
// @match        https://*.feishu.cn/wiki?*
// @match        https://*.feishu.cn/docx/*
// @match        https://*.feishu.cn/sheets/*
// @match        https://*.feishu.cn/base/*
// @require      https://update.greasyfork.org/scripts/601258/Feishu%20Lite%20Blocker.js
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // Add ?fdl=off to the URL to see the original page, for example to check
    // whether a broken feature is caused by this script.
    if (new URLSearchParams(location.search).get('fdl') === 'off') return;

    // ---------------------------------------------------------------------
    // Apps. Wiki, Docs, Sheets and Base are one product ("CCM") that shares
    // the same request stack, so the blocker and the CSS below are written
    // for all of them. To support another app,
    // add a row here and an @match line in the header. The app name is set
    // as a class on <html> (for example html.fdl-wiki), so app-specific CSS
    // can be scoped without any script work.
    // ---------------------------------------------------------------------
    const APPS = [
        ['wiki', /^\/wiki(?:\/|$)/],
        // A doc opened by its own link, outside the wiki tree.
        ['docx', /^\/docx\//],
        // A spreadsheet opened by its own link. Sheets draws its cells on a
        // canvas, so the font CSS below changes only the toolbar and menus.
        ['sheets', /^\/sheets\//],
        // A Base (multidimensional table) opened by its own link.
        ['base', /^\/base\//],
    ];
    const appOf = (path) => APPS.find(([, re]) => re.test(path))?.[0] || null;

    const root = document.documentElement;
    root.classList.add('fdl');
    let currentApp = appOf(location.pathname);
    if (currentApp) root.classList.add('fdl-' + currentApp);
    // Docs is a single-page app: moving from the wiki to a doc does not
    // load a new page. Keep the app class current on history changes.
    // Everything else stays on after a route change, because a page that
    // is half restyled, or tracked again, would be worse.
    const syncApp = () => {
        const next = appOf(location.pathname);
        if (next === currentApp) return;
        if (currentApp) root.classList.remove('fdl-' + currentApp);
        if (next) root.classList.add('fdl-' + next);
        currentApp = next;
    };
    for (const method of ['pushState', 'replaceState']) {
        const native = history[method];
        history[method] = function () {
            const result = native.apply(this, arguments);
            syncApp();
            return result;
        };
    }
    window.addEventListener('popstate', syncApp);

    // ---------------------------------------------------------------------
    // The shared library handles request filtering for both Lite scripts.
    // Keep these rules in the library so both scripts use the same code.
    // Docs is a single-page app, so the blocker stays on after a route change.
    // ---------------------------------------------------------------------
    FeishuLiteBlocker.install();

    // ---------------------------------------------------------------------
    // Page CSS: system font only. Colours and light or dark stay as Feishu
    // sets them from its own Appearance setting. Plain CSS, so no script
    // runs while you read, scroll or type.
    // ---------------------------------------------------------------------
    const CSS = `
html.fdl {
    --fdl-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    --fdl-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
html.fdl body,
html.fdl :is(button, input, textarea, select) {
    font-family: var(--fdl-font) !important;
}
html.fdl :is(code, pre, kbd, samp) { font-family: var(--fdl-mono) !important; }
html.fdl body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
`;
    const pageStyle = document.createElement('style');
    pageStyle.className = 'fdl-style';
    pageStyle.textContent = CSS;

    // At document-start <head> may not exist yet. The style goes at the end
    // of <html>, after <head>, so it comes after Feishu's own CSS.
    const install = () => root.append(pageStyle);
    if (document.head) install();
    else {
        const wait = new MutationObserver(() => {
            if (!document.head) return;
            wait.disconnect();
            install();
        });
        wait.observe(root, { childList: true });
    }
})();
