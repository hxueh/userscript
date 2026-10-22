// ==UserScript==
// @name         Feishu Docs Lite
// @name:zh-CN   飞书文档精简
// @namespace    https://github.com/hxueh
// @version      0.8.0
// @description  Makes Feishu Drive, Wiki, Docs, Sheets and Base lighter: blocks analytics, monitoring and ad trackers, removes tracking characters from titles and hides the help button. Keeps Feishu’s fonts and theme.
// @description:zh-CN 精简飞书云盘、知识库、云文档、电子表格和多维表格：拦截统计、监控和广告追踪，去除标题中的追踪字符，并隐藏帮助按钮。保留飞书的字体和主题设置。
// @author       hxueh
// @license      MIT
// @icon         https://www.feishu.cn/favicon.ico
// @match        https://*.feishu.cn/drive/*
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
        // Feishu opens on Drive (/drive/home/). A doc opened from there is
        // an in-app navigation, so the script must already run on Drive.
        ['drive', /^\/drive(?:\/|$)/],
        ['wiki', /^\/wiki(?:\/|$)/],
        // A doc opened by its own link, outside the wiki tree.
        ['docx', /^\/docx\//],
        // A spreadsheet opened by its own link.
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

    // ---------------------------------------------------------------------
    // The shared library handles request filtering, watermarks and the
    // invisible tracking characters in document titles for both Lite
    // scripts, and patches history once for all of them. Docs is a
    // single-page app, so the blocker stays on after a route change.
    // ---------------------------------------------------------------------
    FeishuLiteBlocker.install({ cleanTitle: true });
    FeishuLiteBlocker.onRoute(syncApp);

    // ---------------------------------------------------------------------
    // Page CSS: no help button. Fonts, colours and light or dark stay as
    // Feishu sets them. Plain CSS, so no script runs while you read, scroll
    // or type.
    // ---------------------------------------------------------------------
    const CSS = `
/* The floating "?" help button covers the bottom right of the document.
   Help stays in the "..." menu. */
html.fdl .help-block.group-btns { display: none !important; }
/* Do not set transition-duration on all elements. Every element has
   transition-property: all with a duration of 0, so any duration makes
   each element animate every change. The doc blocks that Feishu moves
   and resizes while you scroll then lag one frame, Feishu reads stale
   positions and corrects the scroll, and the page bounces. */
`;
    const pageStyle = document.createElement('style');
    pageStyle.className = 'fdl-style';
    pageStyle.textContent = CSS;

    // At document-start <head> may not exist yet. The style goes at the end
    // of <html>, after <head>, so it comes after Feishu's own CSS.
    FeishuLiteBlocker.whenHead(() => root.append(pageStyle));
})();
