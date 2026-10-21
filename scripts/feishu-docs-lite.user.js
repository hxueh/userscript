// ==UserScript==
// @name         Feishu Docs Lite
// @name:zh-CN   飞书文档精简
// @namespace    https://github.com/hxueh
// @version      0.7.0
// @description  Makes Feishu Drive, Wiki, Docs, Sheets and Base lighter: blocks analytics, monitoring and ad trackers, uses system fonts (also in sheet cells and in whiteboards, which saves a 17 MB download), removes tracking characters from titles and hides the help button. Keeps Feishu’s theme.
// @description:zh-CN 精简飞书云盘、知识库、云文档、电子表格和多维表格：拦截统计、监控和广告追踪，使用系统字体（表格单元格和画板也使用，画板省去 17 MB 下载），去除标题中的追踪字符，并隐藏帮助按钮。保留飞书的主题设置。
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
        // A spreadsheet opened by its own link. Sheets draws its cells on a
        // canvas, so the font CSS below changes only the toolbar and menus.
        // The canvas font is changed separately (see "Sheet cell font").
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
    // Whiteboard font. The whiteboard draws its text on a canvas, and its
    // font plugin downloads Noto Sans SC Regular and Bold (about 17 MB
    // together) for each page that has a whiteboard. It loads them with
    // new FontFace(family, "url(...)"), and catches any load error. Give
    // that family the system's own CJK font instead, by weight. The family
    // name stays the same, so the plugin sees the font as loaded and draws
    // with it. If none of the local fonts exists, load() fails, the plugin
    // logs it, and the canvas uses its fallback font. Text in shapes can
    // wrap a little differently than for users without this script.
    // ---------------------------------------------------------------------
    const WHITEBOARD_FONT = /whiteboard_icon_source\/font\/Noto_Sans_/;
    const LOCAL_FONTS = {
        400: 'local("PingFangSC-Regular"), local("HiraginoSans-W3"), local("MicrosoftYaHei"), local("NotoSansSC-Regular")',
        700: 'local("PingFangSC-Semibold"), local("HiraginoSans-W6"), local("MicrosoftYaHei-Bold"), local("NotoSansSC-Bold")',
    };
    const NativeFontFace = window.FontFace;
    if (NativeFontFace) {
        // A subclass keeps instanceof, the prototype and document.fonts.add()
        // working for every other font, which passes through unchanged.
        window.FontFace = class FontFace extends NativeFontFace {
            constructor(family, source, descriptors) {
                if (typeof source === 'string' && WHITEBOARD_FONT.test(source)) {
                    source = Number(descriptors?.weight) >= 600 ? LOCAL_FONTS[700] : LOCAL_FONTS[400];
                }
                super(family, source, descriptors);
            }
        };
    }

    // ---------------------------------------------------------------------
    // Sheet cell font. Sheets draws cells, row numbers and column letters on
    // a canvas, so the page CSS cannot change their font. Each ctx.font starts
    // with four Feishu families before the system font: MonospacedNumber
    // (Helvetica Neue for the digits 0-9 only), LarkHackSafariFont,
    // LarkEmojiFont and LarkChineseQuote (for （ ） and “ ”). Remove them, so
    // cells use the same system font as the rest of the page. Digits are then
    // proportional, so numbers in a column can be a little out of line. Emoji
    // still come from "Apple Color Emoji" and the other emoji fonts at the end
    // of Feishu's list. This covers Sheets, sheets in the wiki and sheet blocks
    // in docs. It runs at document-start, before Feishu measures text, so
    // column widths and line wrapping match what is drawn.
    // ---------------------------------------------------------------------
    // Feishu writes the list both with and without a space after each comma.
    const CELL_FONTS = /\b(?:MonospacedNumber|LarkHackSafariFont|LarkEmojiFont|LarkChineseQuote)\s*,\s*/g;
    // The setter runs on each font change while the sheet draws, but there
    // are only a few distinct values, so keep the results.
    const cellFonts = new Map();
    const cellFont = (value) => {
        let result = cellFonts.get(value);
        if (result === undefined) {
            if (cellFonts.size > 256) cellFonts.clear();
            result = value.replace(CELL_FONTS, '');
            cellFonts.set(value, result);
        }
        return result;
    };
    for (const Context of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
        const font = Context && Object.getOwnPropertyDescriptor(Context.prototype, 'font');
        if (!font?.set || !font.configurable) continue;
        Object.defineProperty(Context.prototype, 'font', {
            ...font,
            set(value) {
                // Other fonts, such as the whiteboard's, pass through unchanged.
                if (typeof value === 'string' && (value.includes('Lark') || value.includes('MonospacedNumber'))) {
                    value = cellFont(value);
                }
                font.set.call(this, value);
            },
        });
    }

    // ---------------------------------------------------------------------
    // Page CSS: system font and no help button. Colours and
    // light or dark stay as Feishu sets them from its own Appearance
    // setting. Plain CSS, so no script runs while you read, scroll or type.
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
