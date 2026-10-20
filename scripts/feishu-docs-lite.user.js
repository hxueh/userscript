// ==UserScript==
// @name         Feishu Docs Lite
// @name:zh-CN   飞书文档精简
// @namespace    https://github.com/hxueh
// @version      0.2.1
// @description  Makes Feishu Docs lighter and calmer, starting with the Wiki (/wiki and /wiki/*). Blocks Tea/Rangers analytics, Slardar monitoring, ad trackers and accessibility-testing tooling before they load, and stops their global error and long-task observers. Recolours the whole app with Solarized Light by day and Apple dark mode by night, following Feishu's Appearance setting, and uses the system font.
// @description:zh-CN 让飞书文档更轻、更安静，先支持知识库（/wiki 与 /wiki/*）。在加载前拦截 Tea/Rangers 统计、Slardar 监控、广告追踪和无障碍测试工具，并停止它们的全局错误与长任务监听。跟随飞书的外观设置，日间使用 Solarized Light 配色，夜间使用 Apple 深色模式配色，并使用系统字体。
// @author       hxueh
// @license      MIT
// @icon         https://www.feishu.cn/favicon.ico
// @match        https://*.feishu.cn/wiki
// @match        https://*.feishu.cn/wiki/*
// @match        https://*.feishu.cn/wiki?*
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
    // the same request stack and the same colour tokens, so the blocker and
    // the theme below are written for all of them. To support another app,
    // add a row here and an @match line in the header. The app name is set
    // as a class on <html> (for example html.fdl-wiki), so app-specific CSS
    // can be scoped without any script work.
    // ---------------------------------------------------------------------
    const APPS = [
        ['wiki', /^\/wiki(?:\/|$)/],
        // Planned: ['docx', /^\/docx\//], ['sheets', /^\/sheets\//], ['base', /^\/base\//],
    ];
    const appOf = (path) => APPS.find(([, re]) => re.test(path))?.[0] || null;

    const root = document.documentElement;
    root.classList.add('fdl');
    let currentApp = appOf(location.pathname);
    if (currentApp) root.classList.add('fdl-' + currentApp);
    // Docs is a single-page app: moving from the wiki to a doc does not
    // load a new page. Keep the app class current on history changes.
    // Everything else stays on after a route change, because a page that
    // is half recoloured, or tracked again, would be worse.
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
    // Light and dark. Feishu Docs has a complete dark theme behind
    // html[data-theme="dark"], and its document view follows that attribute.
    // The script sets the attribute from the Appearance choice below and sets
    // it back if the app changes it, so Feishu's own dark styles (and the
    // recolouring below) follow that choice.
    // ---------------------------------------------------------------------
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
            : fromDocs(readKey(DOCS_KEY)) || fromMessenger(readKey(MESSENGER_KEY));
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
        const theme = wantDark() ? 'dark' : 'light';
        if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
    };
    new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
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
    // Colours. Feishu defines about 1,800 colour tokens (--bg-body, --N900,
    // --B500, --udtoken-..., --ccmtoken-..., each with an "r,g,b" -raw twin)
    // in <style> elements that its scripts add at run time, once for light
    // and once for dark. Each app (Docs, Sheets, Base, the space sidebar)
    // adds its own copy. The values are literals, not var() references, so
    // redefining a few tokens is not enough.
    //
    // So the script reads each token rule once, when its <style> is added,
    // and writes a copy with the same selector where every colour is moved
    // to the target palette:
    //   - greys (low chroma) are placed on the target grey ramp by their
    //     grey level, using Feishu's own grey steps as anchors;
    //   - Feishu blue (hue 205-232) becomes Solarized blue or Apple system
    //     blue, lighter or darker by the same amount as the original;
    //   - every other hue (red, green, highlight colours) is kept, so
    //     coloured text and callouts still mean what the author chose.
    // The copy uses !important and the same selectors, so it wins over the
    // original while keeping its light/dark order. Tokens that keep their
    // colour are copied as well, for the same reason. This runs once per
    // stylesheet (a few milliseconds), and nothing runs while you scroll or
    // type. It works for any app that uses the same tokens.
    // ---------------------------------------------------------------------
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    // Anchors: [Feishu grey level (mean of R, G and B), target colour].
    const GREYS = {
        // Solarized Light. Feishu's light steps N00 ... N1000.
        light: [[0, '#001f27'], [17, '#002b36'], [35, '#073642'], [47, '#2c4b53'], [59, '#586e75'],
            [86, '#5f747b'], [106, '#657b83'], [149, '#93a1a1'], [191, '#b3b8ae'], [211, '#d2cbb5'],
            [224, '#ddd6c1'], [239, '#e7e0cc'], [243, '#eee8d5'], [246, '#f8f1de'], [255, '#fdf6e3']],
        // Apple dark mode (iOS and macOS system greys). Feishu's dark steps.
        // Secondary text (Feishu #a6a6a6) is raised to #c7c7cc, so captions
        // stay readable on #1c1c1e.
        dark: [[0, '#000000'], [10, '#000000'], [26, '#1c1c1e'], [41, '#2c2c2e'], [55, '#3a3a3c'],
            [67, '#48484a'], [80, '#545458'], [95, '#636366'], [117, '#8e8e93'], [166, '#c7c7cc'],
            [207, '#d1d1d6'], [224, '#e5e5ea'], [235, '#f2f2f7'], [248, '#f9f9fb'], [255, '#ffffff']],
    };
    for (const k of Object.keys(GREYS)) GREYS[k] = GREYS[k].map(([level, c]) => [level, hex(c)]);
    // Blue: the target blue, the HSL lightness of Feishu's own primary blue
    // in that theme (the pivot), and the colours that lighter and darker
    // shades move toward.
    const BLUES = {
        light: { blue: hex('#268bd2'), pivot: 0.55, up: hex('#fdf6e3'), down: hex('#002b36') },
        dark: { blue: hex('#0a84ff'), pivot: 0.6, up: hex('#ffffff'), down: hex('#000000') },
    };
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const fromGrey = (ramp, level) => {
        for (let i = 1; i < ramp.length; i++) {
            const [l1, c1] = ramp[i];
            if (level <= l1) {
                const [l0, c0] = ramp[i - 1];
                return mix(c0, c1, l1 === l0 ? 1 : (level - l0) / (l1 - l0));
            }
        }
        return ramp[ramp.length - 1][1];
    };
    // Returns [r, g, b] in the target palette, or null to keep the colour.
    const remapRgb = (rgb, theme) => {
        const max = Math.max(...rgb);
        const min = Math.min(...rgb);
        if (max - min <= 20) return fromGrey(GREYS[theme], (rgb[0] + rgb[1] + rgb[2]) / 3);
        const l = (max + min) / 510;
        const s = (max - min) / 255 / (1 - Math.abs(2 * l - 1));
        if (s < 0.35) return null;
        const [r, g, b] = rgb;
        const d = max - min;
        const hue = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
        if (hue < 205 || hue > 232) return null;
        const { blue, pivot, up, down } = BLUES[theme];
        return l >= pivot ? mix(blue, up, (l - pivot) / (1 - pivot)) : mix(blue, down, (pivot - l) / pivot);
    };
    const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
    const cache = { light: new Map(), dark: new Map() };
    const remapColor = (text, theme) => {
        const seen = cache[theme].get(text);
        if (seen !== undefined) return seen;
        let rgb;
        let alpha = 1;
        if (text[0] === '#') {
            let h = text.slice(1);
            if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
            if (h.length !== 6 && h.length !== 8) return text;
            rgb = hex('#' + h);
            if (h.length === 8) alpha = parseInt(h.slice(6), 16) / 255;
        } else {
            const parts = text.slice(text.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean).map(parseFloat);
            if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return text;
            rgb = parts.slice(0, 3).map(Math.round);
            if (parts.length > 3) alpha = parts[3];
        }
        const out = remapRgb(rgb, theme);
        const result = !out ? text
            : alpha >= 1 ? toHex(out)
            : `rgba(${out.join(', ')}, ${+alpha.toFixed(3)})`;
        cache[theme].set(text, result);
        return result;
    };
    const RAW = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/;
    const remapValue = (name, value, theme) => {
        // --static-white and --static-black are meant to stay as they are,
        // for example white text on a coloured button.
        if (name.startsWith('--static-')) return null;
        const raw = RAW.exec(value);
        if (raw) {
            const out = remapRgb([+raw[1], +raw[2], +raw[3]], theme);
            return out ? out.join(',') : null;
        }
        if (!value.includes('#') && !value.includes('rgb')) return null;
        const next = value.replace(COLOR, (c) => remapColor(c, theme));
        return next === value ? null : next;
    };
    // Split "a, b[x], c" at top-level commas, so each selector can get the
    // palette of its own theme.
    const splitSelectors = (text) => {
        const out = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '(' || c === '[') depth++;
            else if (c === ')' || c === ']') depth--;
            else if (c === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
        }
        out.push(text.slice(start).trim());
        return out;
    };
    const DARK_SELECTOR = /dark/i;
    const MIN_TOKENS = 20; // a rule with fewer custom properties is not a token set
    const tokenSheet = document.createElement('style');
    tokenSheet.id = 'fdl-tokens';
    const remapRules = (rules, out) => {
        for (const rule of rules) {
            if (rule.cssRules && !rule.style) { remapRules(rule.cssRules, out); continue; }
            const style = rule.style;
            if (!style || style.length < MIN_TOKENS || !rule.selectorText) continue;
            if (!style[0].startsWith('--') && !style[style.length - 1].startsWith('--')) continue;
            for (const selector of splitSelectors(rule.selectorText)) {
                const theme = DARK_SELECTOR.test(selector) ? 'dark' : 'light';
                let body = '';
                for (let i = 0; i < style.length; i++) {
                    const name = style[i];
                    if (!name.startsWith('--')) continue;
                    // Unchanged tokens are copied too. Every copy is
                    // !important, and an !important light token would
                    // otherwise beat the plain dark one in dark mode.
                    const value = style.getPropertyValue(name).trim();
                    body += `${name}:${remapValue(name, value, theme) ?? value} !important;`;
                }
                if (body) out.push(`${selector}{${body}}`);
            }
        }
    };
    const doneSheets = new WeakSet();
    const remapStyle = (node) => {
        if (node.tagName !== 'STYLE' || node === tokenSheet || node.classList.contains('fdl-style')) return;
        const sheet = node.sheet;
        if (!sheet || doneSheets.has(sheet)) return;
        doneSheets.add(sheet);
        // Cheap test first: token sheets declare many "--x:" colours.
        const text = node.textContent;
        if (text.length < 2000 || !/--[\w-]+:\s*(?:#|rgb)/.test(text)) return;
        const out = [];
        try { remapRules(sheet.cssRules, out); } catch { return; }
        if (out.length) tokenSheet.textContent += out.join('\n') + '\n';
    };
    // Token <style> elements are added to <head> at run time. The observer
    // callback runs before the next paint, so the original colours are not
    // seen. It watches only the direct children of <head>.
    const watchHead = () => {
        const head = document.head;
        for (const n of head.children) remapStyle(n);
        new MutationObserver((records) => {
            for (const rec of records) for (const n of rec.addedNodes) remapStyle(n);
        }).observe(head, { childList: true });
    };

    // ---------------------------------------------------------------------
    // Page CSS: system font, palette-coloured selection. Plain CSS, so no
    // script runs while you read, scroll or type.
    // ---------------------------------------------------------------------
    const CSS = `
html.fdl {
    --fdl-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    --fdl-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --fdl-accent: #268bd2;
}
html.fdl[data-theme="dark"] { --fdl-accent: #0a84ff; }
html.fdl body,
html.fdl :is(button, input, textarea, select) {
    font-family: var(--fdl-font) !important;
}
html.fdl :is(code, pre, kbd, samp) { font-family: var(--fdl-mono) !important; }
html.fdl body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
html.fdl ::selection { background: color-mix(in srgb, var(--fdl-accent) 28%, transparent); }
`;
    const pageStyle = document.createElement('style');
    pageStyle.className = 'fdl-style';
    pageStyle.textContent = CSS;

    // At document-start <head> may not exist yet. Both styles go at the end
    // of <html>, after <head>, so they come after Feishu's own CSS.
    const install = () => {
        root.append(pageStyle, tokenSheet);
        watchHead();
    };
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
