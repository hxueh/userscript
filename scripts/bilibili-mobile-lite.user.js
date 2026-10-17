// ==UserScript==
// @name         Bilibili Mobile Lite: Simplified Home & Native Player
// @name:zh-CN   哔哩哔哩移动版精简：首页与原生播放器
// @name:zh-TW   嗶哩嗶哩行動版精簡：首頁與原生播放器
// @name:ja      Bilibili Mobile Lite：シンプルホーム＆ネイティブプレーヤー
// @namespace    https://github.com/hxueh
// @version      0.8.0
// @description  Rebuilds Bilibili mobile with an iOS-style video feed, creator profiles, native comments, signed high-quality DASH playback, background audio, collections and continuous play with autoplay, search, and Bangumi support.
// @description:zh-CN 将哔哩哔哩移动版重构为 iOS 风格的视频流、创作者主页与原生评论区，支持签名高画质 DASH、后台音频、合集与自动连播、搜索与番剧。
// @description:zh-TW 將嗶哩嗶哩行動版重構為 iOS 風格的影片動態、創作者主頁與原生留言區，支援簽名高畫質 DASH、背景音訊、合集與自動連播、搜尋與番劇。
// @description:ja BilibiliモバイルをiOS風の動画フィード、投稿者プロフィール、ネイティブコメント欄に再構築し、署名付き高画質DASH、バックグラウンド音声、シリーズと連続再生（自動再生）、検索、アニメに対応します。
// @author       hxueh
// @license      MIT
// @match        https://m.bilibili.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.bilibili.com
// @connect      app.bilibili.com
// @noframes
// @icon         https://www.bilibili.com/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  if (window.top !== window.self || location.hostname !== "m.bilibili.com") {
    return;
  }

  const BILIBILI_PLAYER_OPT_IN_KEY = "bm-native-use-bilibili-player";
  const RELEASE_BILIBILI_PLAYER_EVENT = "bm-native-release-bilibili-player";
  installPageGuards();

  // Runs inside the page (not the userscript sandbox) before Bilibili's own
  // scripts, so it can stop work this script makes pointless:
  //   - the analytics beacons sent to data.bilibili.com and the data collector;
  //   - the error/blank-screen monitor (biliMirror);
  //   - webpack prefetches of route chunks and debug source maps;
  //   - Bilibili's own video player, which would otherwise load and start
  //     downloading the video behind the native player. It is held, not
  //     dropped, so it can be released if the native player gives up.
  // log-reporter.js and reporter-pb still load: besides analytics they register
  // the device with Bilibili's anti-bot system (buvid4, _uuid, buvid_fp and the
  // gaia-gateway calls), which search and recommendations depend on. Only
  // their network reports are dropped.
  function installPageGuards() {
    let useBilibiliPlayer = false;
    try {
      useBilibiliPlayer = sessionStorage.getItem(BILIBILI_PLAYER_OPT_IN_KEY) === location.pathname;
    } catch {
    }
    const config = {
      dropScripts: [
        "/bfs/seed/jinkela/short/b-mirror/",
      ],
      holdScripts: /^\/video\//i.test(location.pathname) && !useBilibiliPlayer
        ? ["/bfs/static/player/main/"]
        : [],
      dropRequests: [
        "^https?://data\\.bilibili\\.com/(v2/)?log/web",
        "/x/web-frontend/data/collector",
      ],
      dropPrefetch: [
        "\\.map(\\?|$)",
        "/bfs/static/jinkela/mstation[^/]*/[^/]+\\.js(\\?|$)",
      ],
      releaseEvent: RELEASE_BILIBILI_PLAYER_EVENT,
    };
    const pageWindow = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
    // Without a sandbox (or with @grant none) this already runs in the page.
    if (pageWindow === window) {
      try {
        pageGuard(config);
      } catch (error) {
        console.warn("[bilibili-mobile-lite] unable to install page guards", error);
      }
      return;
    }
    const inject = () => {
      try {
        const script = document.createElement("script");
        script.textContent = `(${pageGuard.toString()})(${JSON.stringify(config)});`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (error) {
        console.warn("[bilibili-mobile-lite] unable to install page guards", error);
      }
    };
    if (document.documentElement) {
      inject();
      return;
    }
    // Some managers start before the <html> element exists; inject as soon as it does.
    const waitForRoot = new MutationObserver(() => {
      if (!document.documentElement) return;
      waitForRoot.disconnect();
      inject();
    });
    waitForRoot.observe(document, { childList: true });
  }

  // Serialized with toString(); it must not reference anything outside itself.
  function pageGuard(config) {
    if (window.__bmNativePageGuard) return;
    window.__bmNativePageGuard = true;

    const toRules = (list) => (list || []).map((source) => new RegExp(source, "i"));
    const dropScriptRules = toRules(config.dropScripts);
    const holdScriptRules = toRules(config.holdScripts);
    const dropRequestRules = toRules(config.dropRequests);
    const dropPrefetchRules = toRules(config.dropPrefetch);
    const matches = (url, rules) => Boolean(url) && rules.some((rule) => rule.test(String(url)));
    const absolute = (url) => {
      try {
        return new URL(String(url), location.href).href;
      } catch {
        return String(url || "");
      }
    };
    const held = [];
    let released = false;

    function decide(node) {
      if (node instanceof HTMLScriptElement) {
        const src = node.src || node.getAttribute("src") || "";
        if (!src) return "";
        if (matches(src, dropScriptRules)) return "drop";
        if (!released && matches(src, holdScriptRules)) return "hold";
      } else if (node instanceof HTMLLinkElement) {
        const rel = String(node.rel || "").toLowerCase();
        if ((rel === "prefetch" || rel === "preload" || rel === "modulepreload") && matches(node.href, dropPrefetchRules)) {
          return "drop";
        }
      }
      return "";
    }

    function intercept(parent, node) {
      const action = node instanceof Node ? decide(node) : "";
      if (action === "hold") {
        held.push({ parent, node });
      } else if (action === "drop" && node instanceof HTMLScriptElement) {
        // Let dynamic loaders reject instead of waiting forever for a removed script.
        node.type = "javascript/blocked";
        setTimeout(() => node.dispatchEvent(new Event("error")), 0);
      }
      return action;
    }

    const nativeAppendChild = Node.prototype.appendChild;
    const nativeInsertBefore = Node.prototype.insertBefore;
    Node.prototype.appendChild = function appendChild(node) {
      if (intercept(this, node)) return node;
      return nativeAppendChild.call(this, node);
    };
    Node.prototype.insertBefore = function insertBefore(node, reference) {
      if (intercept(this, node)) return node;
      return nativeInsertBefore.call(this, node, reference);
    };
    for (const name of ["append", "prepend"]) {
      const native = Element.prototype[name];
      if (typeof native !== "function") continue;
      Element.prototype[name] = function (...nodes) {
        return native.apply(this, nodes.filter((node) => !intercept(this, node)));
      };
    }

    // Tags already in the HTML never pass through appendChild; catch them as
    // the parser adds them.
    const parserObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (decide(node) !== "drop") continue;
          if (node instanceof HTMLScriptElement) node.type = "javascript/blocked";
          node.remove();
        }
      }
    });
    parserObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => parserObserver.disconnect(), { once: true });

    // Answer analytics endpoints locally so nothing waits on them.
    const fakeBody = '{"code":0,"message":"0","ttl":1}';
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === "function") {
      window.fetch = function fetch(input, init) {
        const url = absolute(typeof input === "string" || input instanceof URL ? input : input && input.url);
        if (matches(url, dropRequestRules)) {
          return Promise.resolve(new Response(fakeBody, { status: 200, headers: { "content-type": "application/json" } }));
        }
        return nativeFetch.apply(this, arguments);
      };
    }

    const xhrTargets = new WeakMap();
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function open(method, url) {
      xhrTargets.set(this, absolute(url));
      return nativeOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function send() {
      if (!matches(xhrTargets.get(this), dropRequestRules)) return nativeSend.apply(this, arguments);
      const xhr = this;
      const define = (key, value) => {
        try {
          Object.defineProperty(xhr, key, { configurable: true, value });
        } catch {
        }
      };
      define("readyState", 4);
      define("status", 200);
      define("statusText", "OK");
      define("responseText", fakeBody);
      define("response", xhr.responseType === "json" ? JSON.parse(fakeBody) : fakeBody);
      setTimeout(() => {
        for (const type of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(new ProgressEvent(type));
      }, 0);
    };

    if (typeof navigator.sendBeacon === "function") {
      const nativeBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function sendBeacon(url) {
        if (matches(absolute(url), dropRequestRules)) return true;
        return nativeBeacon.apply(this, arguments);
      };
    }

    // Let Bilibili's own player load after all, when the native one gives up.
    document.addEventListener(config.releaseEvent, () => {
      if (released) return;
      released = true;
      for (const { parent, node } of held.splice(0)) {
        const target = parent && parent.isConnected ? parent : document.head || document.documentElement;
        nativeAppendChild.call(target, node);
      }
    });
  }

  // Search, creator profiles and anime pages are drawn entirely by this script,
  // so on a fresh load Bilibili's own app (about 600 KB of compressed
  // JavaScript plus CSS, analytics and prefetches) is stopped before it loads.
  // The viewer can always get the original page back: anime episodes that need
  // Bilibili's player reload into it automatically, and failures offer a button.
  const ORIGINAL_PAGE_KEY = "bm-native-original-page";
  // Failsafe: a takeover that never finishes rendering (some unusual userscript
  // manager timing could leave a blank page) is detected on the next load of
  // that page, and takeovers are then switched off for the rest of the session.
  const TAKEOVER_PENDING_KEY = "bm-native-takeover-pending";
  const TAKEOVER_DISABLED_KEY = "bm-native-takeover-disabled";

  function readSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeSession(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
    }
  }

  function markTakeoverRendered() {
    if (readSession(TAKEOVER_PENDING_KEY) === location.pathname) writeSession(TAKEOVER_PENDING_KEY, null);
  }

  function isOwnedPath(pathname) {
    return /^\/search\/?$/i.test(pathname) ||
      /^\/space\/[1-9]\d*(?:\/|$)/i.test(pathname) ||
      /^\/bangumi\/play\/(?:ep|ss)\d+/i.test(pathname);
  }

  function originalPageRequestedHere() {
    try {
      return sessionStorage.getItem(ORIGINAL_PAGE_KEY) === location.pathname;
    } catch {
      return false;
    }
  }

  function openOriginalPage() {
    markTakeoverRendered();
    writeSession(ORIGINAL_PAGE_KEY, location.pathname);
    location.reload();
  }

  function takeOverDocumentIfOwned() {
    // Only on a fresh load: once Bilibili's app is running (in-app navigation,
    // late injection), the script works alongside it as before.
    if (document.readyState !== "loading" || !isOwnedPath(location.pathname) || originalPageRequestedHere()) {
      return false;
    }
    if (readSession(TAKEOVER_DISABLED_KEY)) return false;
    if (readSession(TAKEOVER_PENDING_KEY) === location.pathname) {
      // The last takeover of this page never finished; use original pages now.
      writeSession(TAKEOVER_PENDING_KEY, null);
      writeSession(TAKEOVER_DISABLED_KEY, "1");
      console.warn(`${LOG_PREFIX} the previous page takeover did not finish; using Bilibili's original pages this session`);
      return false;
    }
    writeSession(TAKEOVER_PENDING_KEY, location.pathname);
    // Write the new page first: stopping before the original page has a root
    // element leaves some engines with a finished, empty document that
    // document.open() can no longer replace. Then stop whatever is left of the
    // original response so it cannot resume parsing over the new page.
    let built = tryBuildOwnedDocument();
    try {
      window.stop();
    } catch (error) {
      console.warn(`${LOG_PREFIX} unable to stop the original page`, error);
    }
    if (!built || !ownedDocumentIsIntact()) built = tryBuildOwnedDocument();
    if (!built) {
      abandonTakeover();
      return false;
    }
    // Re-check while the browser settles, in case the original page resumed.
    for (const delay of [150, 600, 2000]) {
      window.setTimeout(() => {
        if (!ownedDocumentIsIntact()) abandonTakeover();
      }, delay);
    }
    return true;
  }

  function tryBuildOwnedDocument() {
    try {
      buildOwnedDocument();
    } catch (error) {
      console.warn(`${LOG_PREFIX} unable to build the page`, error);
    }
    return ownedDocumentIsIntact();
  }

  function ownedDocumentIsIntact() {
    // Bilibili's own page also has #app, so check for this script's marker.
    const root = document.documentElement;
    const app = document.getElementById("app");
    return Boolean(root?.classList.contains(`${SCRIPT_PREFIX}-takeover`) && document.body && app?.isConnected);
  }

  // Never leave a blank page: fall back to Bilibili's original pages for the
  // rest of this session and load the original right away.
  let takeoverAbandoned = false;
  function abandonTakeover() {
    if (takeoverAbandoned) return;
    takeoverAbandoned = true;
    console.warn(`${LOG_PREFIX} the page takeover did not take; loading Bilibili's original page`);
    writeSession(TAKEOVER_PENDING_KEY, null);
    writeSession(TAKEOVER_DISABLED_KEY, "1");
    location.reload();
  }

  // Replace the stopped page with a minimal document parsed from scratch.
  // Building nodes by hand is not enough: when the original parse is stopped
  // before <body>, browsers can keep rendering blocked (no paint, no lazy
  // images, no IntersectionObserver). A fresh parse via document.open() lets
  // the page finish loading normally. This runs before the script registers
  // any of its own listeners, which document.open() would clear.
  function buildOwnedDocument() {
    const escapeHTML = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
    const markup = [
      "<!doctype html>",
      `<html lang="${escapeHTML(UI_LANGUAGE_TAG)}" class="${SCRIPT_PREFIX}-takeover">`,
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<meta name="color-scheme" content="light dark">',
      '<meta name="referrer" content="no-referrer-when-downgrade">',
      `<title>${escapeHTML(t("bilibili"))}</title>`,
      '<link rel="icon" href="https://www.bilibili.com/favicon.ico">',
      "</head>",
      '<body><div id="app"></div></body>',
      "</html>",
    ].join("");
    document.open();
    document.write(markup);
    document.close();
  }

  // Bilibili's app normally registers the device with its anti-bot system and
  // keeps a short-lived ticket cookie fresh; search and other APIs are less
  // likely to be refused when these exist. On taken-over pages the app never
  // runs, so restore whatever is missing. Usually everything is already set
  // from earlier visits and this does nothing.
  async function ensureAntiBotCookies() {
    try {
      if (!getCookieValue("buvid4") || !getCookieValue("_uuid")) {
        // Bilibili's own registration script; its analytics beacons stay blocked.
        const script = document.createElement("script");
        script.src = "https://s1.hdslb.com/bfs/seed/log/report/log-reporter.js";
        script.async = true;
        (document.head || document.documentElement)?.appendChild(script);
      }
      const ticketExpires = Number(getCookieValue("bili_ticket_expires")) || 0;
      if (!getCookieValue("bili_ticket") || ticketExpires * 1000 < Date.now() + 3_600_000) {
        await refreshBiliTicket();
      }
    } catch (error) {
      console.debug(`${LOG_PREFIX} unable to restore anti-bot cookies`, error);
    }
  }

  // Algorithm as documented by bilibili-API-collect (misc/sign/bili_ticket).
  async function refreshBiliTicket() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    const ts = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const key = await subtle.importKey("raw", encoder.encode("XgwSnGZ1p"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await subtle.sign("HMAC", key, encoder.encode(`ts${ts}`));
    const hexsign = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const params = new URLSearchParams({ key_id: "ec02", hexsign, "context[ts]": String(ts), csrf: getCookieValue("bili_jct") || "" });
    const response = await gmRequestJSON(
      "POST",
      `https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?${params}`,
      { headers: { Referer: "https://m.bilibili.com/" } },
    );
    const ticket = response?.code === 0 ? String(response.data?.ticket || "") : "";
    if (!ticket) return;
    const createdAt = Number(response.data?.created_at) || ts;
    const ttl = Number(response.data?.ttl) || 259_200;
    const attributes = `; domain=.bilibili.com; path=/; max-age=${ttl}; secure; samesite=lax`;
    document.cookie = `bili_ticket=${ticket}${attributes}`;
    document.cookie = `bili_ticket_expires=${createdAt + ttl}${attributes}`;
  }

  function setTakeoverTitle(title) {
    if (!TAKEOVER_ACTIVE) return;
    const value = String(title || "").trim();
    document.title = value ? `${value} - ${t("bilibili")}` : t("bilibili");
  }

  // Shown only on taken-over pages, where there is no original page underneath.
  function showTakeoverFailure() {
    if (!TAKEOVER_ACTIVE || !document.body) return;
    markTakeoverRendered();
    const shell = createElement("main", "bm-takeover-failure");
    applyUILanguage(shell);
    shell.setAttribute("role", "alert");
    const title = createElement("h1", "bm-takeover-failure-title");
    title.textContent = t("pageLoadFailed");
    const hint = createElement("p", "bm-takeover-failure-hint");
    hint.textContent = t("pageLoadFailedHint");
    const actions = createElement("div", "bm-takeover-failure-actions");
    const retry = createElement("button", "bm-button");
    retry.type = "button";
    retry.textContent = t("retry");
    retry.addEventListener("click", () => location.reload());
    const original = createElement("button", "bm-takeover-failure-original");
    original.type = "button";
    original.textContent = t("openOriginalPage");
    original.addEventListener("click", openOriginalPage);
    actions.append(retry, original);
    shell.append(title, hint, actions);
    document.querySelectorAll(".bm-takeover-failure").forEach((node) => node.remove());
    document.documentElement.classList.add(`${SCRIPT_PREFIX}-takeover-failed`);
    document.body.appendChild(shell);
  }

  function releaseBilibiliPlayer() {
    document.dispatchEvent(new Event(RELEASE_BILIBILI_PLAYER_EVENT));
  }

  function bilibiliPlayerRequestedHere() {
    try {
      return sessionStorage.getItem(BILIBILI_PLAYER_OPT_IN_KEY) === location.pathname;
    } catch {
      return false;
    }
  }

  const PAGE_WINDOW = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
  const PAGE_NAVIGATOR = PAGE_WINDOW.navigator || navigator;
  const PAGE_MEDIA_METADATA = PAGE_WINDOW.MediaMetadata || globalThis.MediaMetadata;
  // Shaka (~590 KB) is only needed for DASH playback, so it is loaded on video
  // and anime pages when first needed instead of on every page. The browser
  // checks the file against this hash (Subresource Integrity) before running it.
  const SHAKA_URL = "https://cdn.jsdelivr.net/npm/shaka-player@5.2.13/dist/shaka-player.dash.js";
  const SHAKA_INTEGRITY = "sha256-ohlgTlLfNJuagFCE7Zi6AI5JfGzEnCZKyEHLrBLx7SE=";
  const SHAKA_LOAD_TIMEOUT_MS = 15_000;

  const SCRIPT_PREFIX = "bm-native";
  const STYLE_ID = `${SCRIPT_PREFIX}-style`;
  const ROUTE_EVENT = `${SCRIPT_PREFIX}-locationchange`;
  const HISTORY_HOOK_FLAG = `__${SCRIPT_PREFIX}Wrapped`;
  const LOG_PREFIX = "[bilibili-mobile-lite]";
  const RECOMMEND_HASH = "#/recommend/";
  const API_TIMEOUT_MS = 20_000;
  const ELEMENT_TIMEOUT_MS = 20_000;
  const HOME_ACTIVE_CLASS = `${SCRIPT_PREFIX}-home-active`;
  const SEARCH_ACTIVE_CLASS = `${SCRIPT_PREFIX}-search-active`;
  const PROFILE_ACTIVE_CLASS = `${SCRIPT_PREFIX}-profile-active`;
  const BANGUMI_ACTIVE_CLASS = `${SCRIPT_PREFIX}-bangumi-active`;
  const VIDEO_ACTIVE_CLASS = `${SCRIPT_PREFIX}-video-active`;
  const WBI_MIXIN_KEY_TTL_MS = 10 * 60_000;
  const MEDIA_SESSION_POSITION_INTERVAL_MS = 1_000;
  const BACKGROUND_PAUSE_GRACE_MS = 2_500;
  const MAX_CONSECUTIVE_EMPTY_PAGES = 2;
  const HOME_MAX_PAGES = 100;
  const SEARCH_MAX_PAGES = 100;
  const PROFILE_MAX_PAGES = 100;
  const PROFILE_PAGE_SIZE = 30;
  const COMMENT_MAX_PAGES = 100;
  const COMMENT_REPLY_PREVIEW_LIMIT = 3;
  const MEDIA_CAPABILITIES_MAX_CONCURRENCY = 3;
  const VIDEO_CAPABILITY_CACHE_LIMIT = 128;
  const INITIAL_PATHNAME = location.pathname;
  const WATCH_HEARTBEAT_INTERVAL_MS = 15_000;
  const RESUME_MIN_SECONDS = 5;
  const RESUME_END_MARGIN_SECONDS = 10;
  const RESUME_TOAST_MS = 6_000;
  // Autoplay is a lasting preference, so it lives in localStorage rather than
  // sessionStorage. It only decides whether a single video continues into a
  // related one; collections, parts and episodes always continue in order.
  const AUTOPLAY_STORAGE_KEY = "bm-native-autoplay";
  // Video mode looks up the next track's signed URLs only this close to the
  // end, so watching one video does not cost a second play-URL request.
  const VIDEO_PREFETCH_LEAD_SECONDS = 20;
  const TRACK_PREFETCH_TTL_MS = 30 * 60_000;
  const UI_MESSAGES = Object.freeze({
    "zh-CN": Object.freeze({
      categoryBangumi: "番剧",
      categoryFilm: "影视",
      categoryVideo: "视频",
      categoryPicture: "图文",
      homeTitle: "推荐",
      homeSubtitle: "为你挑选值得一看的内容",
      refreshRecommendations: "刷新推荐",
      recommendedVideos: "推荐视频",
      homeAria: "哔哩哔哩移动版推荐",
      homeEnd: "今天先看到这里",
      loadingMore: "正在加载更多",
      findingMoreContent: "正在查找更多内容",
      recommendLoadFailed: "无法加载推荐内容",
      reload: "重新加载",
      searchAria: "哔哩哔哩搜索",
      backToRecommendations: "返回推荐",
      searchTitle: "搜索",
      searchPlaceholder: "搜索视频、番剧或影视",
      clearSearch: "清除搜索内容",
      searchSort: "搜索排序",
      sortComprehensive: "综合",
      sortMostPlayed: "最多播放",
      sortLatest: "最新发布",
      searchResults: "搜索结果",
      startSearch: "开始搜索",
      searchPrompt: "输入关键词查找视频、番剧或影视",
      searchPartialFailure: "{types}结果暂时加载失败，其他结果仍可浏览。",
      retry: "重试",
      searchCountOne: "{count} 个搜索结果",
      searchCountOther: "{count} 个搜索结果",
      allResultsShown: "已显示全部结果",
      noResults: "没有找到相关内容",
      findingMoreResults: "正在查找更多结果",
      searchLoadFailed: "无法加载搜索结果",
      searchHint: "输入番剧、影视、歌手、歌曲、UP 主或视频标题",
      bilibili: "哔哩哔哩",
      bangumiPlayer: "番剧播放器",
      back: "返回",
      bangumiFallback: "番剧",
      nowPlaying: "正在播放",
      episodeMetaOne: "共 {count} 集",
      episodeMetaOther: "共 {count} 集",
      episodeSelection: "选集",
      episodeFallback: "EP {id}",
      bilibiliBangumi: "哔哩哔哩番剧",
      nativePlayerAria: "原生 HTML5 媒体播放器",
      audioOnlyPlayer: "仅音频播放器",
      audioOnlyMode: "仅音频模式",
      audioOnlySubtitle: "切换 App 或锁屏后可继续播放",
      playAudio: "播放音频",
      pauseAudio: "暂停音频",
      audioProgress: "音频播放进度",
      loadingVideo: "正在加载视频",
      loadingAudio: "正在加载音频",
      nativePlayer: "原生播放器",
      selectEpisodePart: "选择视频分集或分 P",
      selectVideoQuality: "选择视频清晰度",
      audioOnly: "仅音频",
      switchAudioMode: "切换到仅音频模式",
      switchVideoMode: "切换回视频模式",
      watchVideo: "看视频",
      audioBackground: "仅音频 · 后台播放",
      fullscreen: "全屏",
      enterFullscreen: "进入全屏",
      dashFallbackLoading: "DASH 不可用，正在加载 MP4 备用源",
      playbackFailed: "浏览器无法播放哔哩哔哩的 DASH 或 HTML5 视频源。",
      allMediaFailed: "所有原生媒体地址均加载失败。",
      loadingHighQualityDash: "正在加载高画质 DASH",
      useBilibiliPlayer: "使用哔哩哔哩播放器",
      highQuality: "高画质",
      qualityAuto: "自动",
      qualityHighest: "最高",
      autoDash: "自动 DASH",
      scoreValue: "{score} 分",
      coverLoadFailed: "封面加载失败",
      creatorPrefix: "UP",
      openCreatorProfile: "查看 {name} 的主页",
      profileAria: "{name} 的个人主页",
      profileTitle: "个人主页",
      profileVideos: "视频",
      profileVideoCountOne: "{count} 个视频",
      profileVideoCountOther: "{count} 个视频",
      profileUid: "UID {id}",
      profileLoading: "正在加载个人主页",
      profileLoadFailed: "无法加载个人主页",
      profileVideosLoadFailed: "无法加载视频",
      profileNoVideos: "暂未发布视频",
      profileEnd: "已显示全部视频",
      profileOfficial: "官方认证",
      profileFollowerCountOne: "{count} 位粉丝",
      profileFollowerCountOther: "{count} 位粉丝",
      profileFollow: "关注",
      profileFollowing: "已关注",
      profileMutual: "互相关注",
      profileFollowLoading: "处理中",
      profileFollowCreator: "关注 {name}",
      profileUnfollowCreator: "取消关注 {name}",
      profileFollowFailed: "关注失败，请重试",
      profileUnfollowFailed: "取消关注失败，请重试",
      commentsAria: "视频评论",
      commentsTitle: "评论",
      commentsHot: "最热",
      commentsNewest: "最新",
      commentsSort: "评论排序",
      commentsCountOne: "{count} 条评论",
      commentsCountOther: "{count} 条评论",
      commentsLoading: "正在加载评论",
      commentsLoadFailed: "无法加载评论",
      commentsNoComments: "还没有评论",
      commentsClosed: "评论区已关闭",
      commentsEnd: "已显示全部评论",
      commentsPinned: "置顶",
      commentsUploader: "UP 主",
      commentsReplyCountOne: "{count} 条回复",
      commentsReplyCountOther: "{count} 条回复",
      commentsLikeCount: "{count} 个赞",
      commentsImage: "评论图片",
      imageViewer: "查看图片",
      viewImage: "查看图片 {index}/{total}",
      imageCounter: "{index} / {total}",
      closeImageViewer: "关闭",
      previousImage: "上一张",
      nextImage: "下一张",
      imageLoadFailed: "图片加载失败",
      commentsAnonymous: "匿名用户",
      audioAlbum: "Bilibili · 仅音频",
      audioGeneric: "音频",
      bitrateReported: "{bitrate} kbps（标称）",
      bitrateUnavailable: "码率未知",
      highestAvailable: "最高可用",
      pageLoadFailed: "页面加载失败",
      pageLoadFailedHint: "请检查网络后重试，或打开哔哩哔哩原始页面。",
      openOriginalPage: "打开原始页面",
      previousTrack: "上一个",
      nextTrack: "下一个",
      resumedAt: "已从 {time} 继续播放",
      startOver: "从头播放",
      autoplay: "自动连播",
      autoplayOn: "自动连播已开启",
      autoplayOff: "自动连播已关闭",
      collectionTitle: "合集",
      partsTitle: "视频分 P",
      selectPlaylistVideo: "选择合集或分 P 视频",
    }),
    "zh-TW": Object.freeze({
      categoryBangumi: "番劇",
      categoryFilm: "影視",
      categoryVideo: "影片",
      categoryPicture: "圖文",
      homeTitle: "推薦",
      homeSubtitle: "為你挑選值得一看的內容",
      refreshRecommendations: "重新整理推薦",
      recommendedVideos: "推薦影片",
      homeAria: "嗶哩嗶哩行動版推薦",
      homeEnd: "今天先看到這裡",
      loadingMore: "正在載入更多",
      findingMoreContent: "正在尋找更多內容",
      recommendLoadFailed: "無法載入推薦內容",
      reload: "重新載入",
      searchAria: "嗶哩嗶哩搜尋",
      backToRecommendations: "返回推薦",
      searchTitle: "搜尋",
      searchPlaceholder: "搜尋影片、番劇或影視",
      clearSearch: "清除搜尋內容",
      searchSort: "搜尋排序",
      sortComprehensive: "綜合",
      sortMostPlayed: "最多播放",
      sortLatest: "最新發布",
      searchResults: "搜尋結果",
      startSearch: "開始搜尋",
      searchPrompt: "輸入關鍵字尋找影片、番劇或影視",
      searchPartialFailure: "{types}結果暫時載入失敗，其他結果仍可瀏覽。",
      retry: "重試",
      searchCountOne: "{count} 個搜尋結果",
      searchCountOther: "{count} 個搜尋結果",
      allResultsShown: "已顯示所有結果",
      noResults: "沒有找到相關內容",
      findingMoreResults: "正在尋找更多結果",
      searchLoadFailed: "無法載入搜尋結果",
      searchHint: "輸入番劇、影視、歌手、歌曲、UP 主或影片標題",
      bilibili: "嗶哩嗶哩",
      bangumiPlayer: "番劇播放器",
      back: "返回",
      bangumiFallback: "番劇",
      nowPlaying: "正在播放",
      episodeMetaOne: "共 {count} 集",
      episodeMetaOther: "共 {count} 集",
      episodeSelection: "選集",
      episodeFallback: "EP {id}",
      bilibiliBangumi: "嗶哩嗶哩番劇",
      nativePlayerAria: "原生 HTML5 媒體播放器",
      audioOnlyPlayer: "僅音訊播放器",
      audioOnlyMode: "僅音訊模式",
      audioOnlySubtitle: "切換 App 或鎖定螢幕後可繼續播放",
      playAudio: "播放音訊",
      pauseAudio: "暫停音訊",
      audioProgress: "音訊播放進度",
      loadingVideo: "正在載入影片",
      loadingAudio: "正在載入音訊",
      nativePlayer: "原生播放器",
      selectEpisodePart: "選擇影片分集或分 P",
      selectVideoQuality: "選擇影片畫質",
      audioOnly: "僅音訊",
      switchAudioMode: "切換到僅音訊模式",
      switchVideoMode: "切換回影片模式",
      watchVideo: "看影片",
      audioBackground: "僅音訊 · 背景播放",
      fullscreen: "全螢幕",
      enterFullscreen: "進入全螢幕",
      dashFallbackLoading: "DASH 無法使用，正在載入 MP4 備用來源",
      playbackFailed: "瀏覽器無法播放嗶哩嗶哩的 DASH 或 HTML5 影片來源。",
      allMediaFailed: "所有原生媒體網址均載入失敗。",
      loadingHighQualityDash: "正在載入高畫質 DASH",
      useBilibiliPlayer: "使用嗶哩嗶哩播放器",
      highQuality: "高畫質",
      qualityAuto: "自動",
      qualityHighest: "最高",
      autoDash: "自動 DASH",
      scoreValue: "{score} 分",
      coverLoadFailed: "封面載入失敗",
      creatorPrefix: "UP",
      openCreatorProfile: "查看 {name} 的主頁",
      profileAria: "{name} 的個人主頁",
      profileTitle: "個人主頁",
      profileVideos: "影片",
      profileVideoCountOne: "{count} 部影片",
      profileVideoCountOther: "{count} 部影片",
      profileUid: "UID {id}",
      profileLoading: "正在載入個人主頁",
      profileLoadFailed: "無法載入個人主頁",
      profileVideosLoadFailed: "無法載入影片",
      profileNoVideos: "尚未發布影片",
      profileEnd: "已顯示所有影片",
      profileOfficial: "官方認證",
      profileFollowerCountOne: "{count} 位粉絲",
      profileFollowerCountOther: "{count} 位粉絲",
      profileFollow: "關注",
      profileFollowing: "已關注",
      profileMutual: "互相關注",
      profileFollowLoading: "處理中",
      profileFollowCreator: "關注 {name}",
      profileUnfollowCreator: "取消關注 {name}",
      profileFollowFailed: "關注失敗，請再試一次",
      profileUnfollowFailed: "取消關注失敗，請再試一次",
      commentsAria: "影片留言",
      commentsTitle: "留言",
      commentsHot: "最熱門",
      commentsNewest: "最新",
      commentsSort: "留言排序",
      commentsCountOne: "{count} 則留言",
      commentsCountOther: "{count} 則留言",
      commentsLoading: "正在載入留言",
      commentsLoadFailed: "無法載入留言",
      commentsNoComments: "尚無留言",
      commentsClosed: "留言區已關閉",
      commentsEnd: "已顯示所有留言",
      commentsPinned: "置頂",
      commentsUploader: "UP 主",
      commentsReplyCountOne: "{count} 則回覆",
      commentsReplyCountOther: "{count} 則回覆",
      commentsLikeCount: "{count} 個讚",
      commentsImage: "留言圖片",
      imageViewer: "檢視圖片",
      viewImage: "檢視圖片 {index}/{total}",
      imageCounter: "{index} / {total}",
      closeImageViewer: "關閉",
      previousImage: "上一張",
      nextImage: "下一張",
      imageLoadFailed: "圖片載入失敗",
      commentsAnonymous: "匿名使用者",
      audioAlbum: "Bilibili · 僅音訊",
      audioGeneric: "音訊",
      bitrateReported: "{bitrate} kbps（標稱）",
      bitrateUnavailable: "位元率未知",
      highestAvailable: "最高可用",
      pageLoadFailed: "頁面載入失敗",
      pageLoadFailedHint: "請檢查網路後重試，或開啟嗶哩嗶哩原始頁面。",
      openOriginalPage: "開啟原始頁面",
      previousTrack: "上一個",
      nextTrack: "下一個",
      resumedAt: "已從 {time} 繼續播放",
      startOver: "從頭播放",
      autoplay: "自動連播",
      autoplayOn: "自動連播已開啟",
      autoplayOff: "自動連播已關閉",
      collectionTitle: "合集",
      partsTitle: "影片分 P",
      selectPlaylistVideo: "選擇合集或分 P 影片",
    }),
    en: Object.freeze({
      categoryBangumi: "Anime",
      categoryFilm: "Film & TV",
      categoryVideo: "Videos",
      categoryPicture: "Posts",
      homeTitle: "Recommended",
      homeSubtitle: "Worthwhile videos selected for you",
      refreshRecommendations: "Refresh recommendations",
      recommendedVideos: "Recommended videos",
      homeAria: "Bilibili mobile recommendations",
      homeEnd: "You’re all caught up",
      loadingMore: "Loading more",
      findingMoreContent: "Looking for more content",
      recommendLoadFailed: "Couldn’t load recommendations",
      reload: "Reload",
      searchAria: "Bilibili search",
      backToRecommendations: "Back to recommendations",
      searchTitle: "Search",
      searchPlaceholder: "Search videos, anime, films, or TV",
      clearSearch: "Clear search",
      searchSort: "Search sort order",
      sortComprehensive: "Relevance",
      sortMostPlayed: "Most played",
      sortLatest: "Newest",
      searchResults: "Search results",
      startSearch: "Start searching",
      searchPrompt: "Enter keywords to find videos, anime, films, or TV",
      searchPartialFailure: "Results for {types} couldn’t be loaded. Other results are still available.",
      retry: "Retry",
      searchCountOne: "{count} search result",
      searchCountOther: "{count} search results",
      allResultsShown: "All results shown",
      noResults: "No results found",
      findingMoreResults: "Looking for more results",
      searchLoadFailed: "Couldn’t load search results",
      searchHint: "Search anime, films, artists, songs, creators, or video titles",
      bilibili: "Bilibili",
      bangumiPlayer: "Anime player",
      back: "Back",
      bangumiFallback: "Anime",
      nowPlaying: "Now playing",
      episodeMetaOne: "{count} episode",
      episodeMetaOther: "{count} episodes",
      episodeSelection: "Episodes",
      episodeFallback: "EP {id}",
      bilibiliBangumi: "Bilibili Anime",
      nativePlayerAria: "Native HTML5 media player",
      audioOnlyPlayer: "Audio-only player",
      audioOnlyMode: "Audio-only mode",
      audioOnlySubtitle: "Keep playing when switching apps or locking the screen",
      playAudio: "Play audio",
      pauseAudio: "Pause audio",
      audioProgress: "Audio playback position",
      loadingVideo: "Loading video",
      loadingAudio: "Loading audio",
      nativePlayer: "Native player",
      selectEpisodePart: "Select episode or part",
      selectVideoQuality: "Select video quality",
      audioOnly: "Audio only",
      switchAudioMode: "Switch to audio-only mode",
      switchVideoMode: "Switch back to video",
      watchVideo: "Watch video",
      audioBackground: "Audio only · Background playback",
      fullscreen: "Fullscreen",
      enterFullscreen: "Enter fullscreen",
      dashFallbackLoading: "DASH unavailable. Loading MP4 fallback",
      playbackFailed: "This browser couldn’t play Bilibili’s DASH or HTML5 video source.",
      allMediaFailed: "All native media URLs failed to load.",
      loadingHighQualityDash: "Loading high-quality DASH",
      useBilibiliPlayer: "Use Bilibili player",
      highQuality: "High quality",
      qualityAuto: "Auto",
      qualityHighest: "Highest",
      autoDash: "Auto DASH",
      scoreValue: "{score} points",
      coverLoadFailed: "Cover failed to load",
      creatorPrefix: "UP",
      openCreatorProfile: "Open {name}\'s profile",
      profileAria: "{name}\'s profile",
      profileTitle: "Profile",
      profileVideos: "Videos",
      profileVideoCountOne: "{count} video",
      profileVideoCountOther: "{count} videos",
      profileUid: "UID {id}",
      profileLoading: "Loading profile",
      profileLoadFailed: "Unable to load this profile",
      profileVideosLoadFailed: "Unable to load videos",
      profileNoVideos: "No videos published yet",
      profileEnd: "All videos shown",
      profileOfficial: "Official",
      profileFollowerCountOne: "{count} follower",
      profileFollowerCountOther: "{count} followers",
      profileFollow: "Follow",
      profileFollowing: "Following",
      profileMutual: "Mutual",
      profileFollowLoading: "Working…",
      profileFollowCreator: "Follow {name}",
      profileUnfollowCreator: "Unfollow {name}",
      profileFollowFailed: "Couldn’t follow. Try again.",
      profileUnfollowFailed: "Couldn’t unfollow. Try again.",
      commentsAria: "Video comments",
      commentsTitle: "Comments",
      commentsHot: "Hot",
      commentsNewest: "Newest",
      commentsSort: "Comment sort order",
      commentsCountOne: "{count} comment",
      commentsCountOther: "{count} comments",
      commentsLoading: "Loading comments",
      commentsLoadFailed: "Unable to load comments",
      commentsNoComments: "No comments yet",
      commentsClosed: "Comments are closed",
      commentsEnd: "All comments shown",
      commentsPinned: "Pinned",
      commentsUploader: "Creator",
      commentsReplyCountOne: "{count} reply",
      commentsReplyCountOther: "{count} replies",
      commentsLikeCount: "{count} likes",
      commentsImage: "Comment image",
      imageViewer: "Image viewer",
      viewImage: "View image {index} of {total}",
      imageCounter: "{index} of {total}",
      closeImageViewer: "Close",
      previousImage: "Previous image",
      nextImage: "Next image",
      imageLoadFailed: "Couldn’t load this image",
      commentsAnonymous: "Anonymous",
      audioAlbum: "Bilibili · Audio only",
      audioGeneric: "Audio",
      bitrateReported: "{bitrate} kbps reported",
      bitrateUnavailable: "bitrate unavailable",
      highestAvailable: "highest available",
      pageLoadFailed: "This page couldn’t load",
      pageLoadFailedHint: "Check your connection and retry, or open Bilibili’s original page.",
      openOriginalPage: "Open original page",
      previousTrack: "Previous",
      nextTrack: "Next",
      resumedAt: "Resumed at {time}",
      startOver: "Start over",
      autoplay: "Autoplay",
      autoplayOn: "Autoplay is on",
      autoplayOff: "Autoplay is off",
      collectionTitle: "Collection",
      partsTitle: "Parts",
      selectPlaylistVideo: "Select a video in the collection or a part",
    }),
    ja: Object.freeze({
      categoryBangumi: "アニメ",
      categoryFilm: "映画・ドラマ",
      categoryVideo: "動画",
      categoryPicture: "記事",
      homeTitle: "おすすめ",
      homeSubtitle: "見る価値のあるコンテンツをあなたに",
      refreshRecommendations: "おすすめを更新",
      recommendedVideos: "おすすめ動画",
      homeAria: "Bilibiliモバイルのおすすめ",
      homeEnd: "今日はここまで",
      loadingMore: "さらに読み込み中",
      findingMoreContent: "さらにコンテンツを探しています",
      recommendLoadFailed: "おすすめを読み込めませんでした",
      reload: "再読み込み",
      searchAria: "Bilibili検索",
      backToRecommendations: "おすすめに戻る",
      searchTitle: "検索",
      searchPlaceholder: "動画、アニメ、映画・ドラマを検索",
      clearSearch: "検索内容をクリア",
      searchSort: "検索結果の並び順",
      sortComprehensive: "関連度順",
      sortMostPlayed: "再生数順",
      sortLatest: "新着順",
      searchResults: "検索結果",
      startSearch: "検索を開始",
      searchPrompt: "キーワードを入力して動画、アニメ、映画・ドラマを検索",
      searchPartialFailure: "{types}の結果を読み込めませんでした。他の結果は引き続き表示できます。",
      retry: "再試行",
      searchCountOne: "{count}件の検索結果",
      searchCountOther: "{count}件の検索結果",
      allResultsShown: "すべての結果を表示しました",
      noResults: "該当する結果がありません",
      findingMoreResults: "さらに結果を探しています",
      searchLoadFailed: "検索結果を読み込めませんでした",
      searchHint: "アニメ、映画・ドラマ、歌手、楽曲、投稿者、動画タイトルを入力",
      bilibili: "Bilibili",
      bangumiPlayer: "アニメプレーヤー",
      back: "戻る",
      bangumiFallback: "アニメ",
      nowPlaying: "再生中",
      episodeMetaOne: "全{count}話",
      episodeMetaOther: "全{count}話",
      episodeSelection: "エピソード",
      episodeFallback: "EP {id}",
      bilibiliBangumi: "Bilibiliアニメ",
      nativePlayerAria: "ネイティブHTML5メディアプレーヤー",
      audioOnlyPlayer: "音声のみプレーヤー",
      audioOnlyMode: "音声のみモード",
      audioOnlySubtitle: "Appを切り替えたり画面をロックした後も再生できます",
      playAudio: "音声を再生",
      pauseAudio: "音声を一時停止",
      audioProgress: "音声の再生位置",
      loadingVideo: "動画を読み込み中",
      loadingAudio: "音声を読み込み中",
      nativePlayer: "ネイティブプレーヤー",
      selectEpisodePart: "エピソードまたはパートを選択",
      selectVideoQuality: "画質を選択",
      audioOnly: "音声のみ",
      switchAudioMode: "音声のみモードに切り替え",
      switchVideoMode: "動画モードに戻る",
      watchVideo: "動画を見る",
      audioBackground: "音声のみ · バックグラウンド再生",
      fullscreen: "全画面",
      enterFullscreen: "全画面表示",
      dashFallbackLoading: "DASHを利用できません。MP4代替ソースを読み込み中",
      playbackFailed: "このブラウザではBilibiliのDASHまたはHTML5動画ソースを再生できませんでした。",
      allMediaFailed: "すべてのネイティブメディアURLを読み込めませんでした。",
      loadingHighQualityDash: "高画質DASHを読み込み中",
      useBilibiliPlayer: "Bilibiliプレーヤーを使用",
      highQuality: "高画質",
      qualityAuto: "自動",
      qualityHighest: "最高",
      autoDash: "自動DASH",
      scoreValue: "{score}点",
      coverLoadFailed: "サムネイルを読み込めませんでした",
      creatorPrefix: "UP",
      openCreatorProfile: "{name}のプロフィールを開く",
      profileAria: "{name}のプロフィール",
      profileTitle: "プロフィール",
      profileVideos: "動画",
      profileVideoCountOne: "{count}本の動画",
      profileVideoCountOther: "{count}本の動画",
      profileUid: "UID {id}",
      profileLoading: "プロフィールを読み込み中",
      profileLoadFailed: "プロフィールを読み込めませんでした",
      profileVideosLoadFailed: "動画を読み込めませんでした",
      profileNoVideos: "投稿された動画はありません",
      profileEnd: "すべての動画を表示しました",
      profileOfficial: "公式認証",
      profileFollowerCountOne: "フォロワー {count}人",
      profileFollowerCountOther: "フォロワー {count}人",
      profileFollow: "フォロー",
      profileFollowing: "フォロー中",
      profileMutual: "相互フォロー",
      profileFollowLoading: "処理中…",
      profileFollowCreator: "{name}をフォロー",
      profileUnfollowCreator: "{name}のフォローを解除",
      profileFollowFailed: "フォローできませんでした。もう一度お試しください。",
      profileUnfollowFailed: "フォローを解除できませんでした。もう一度お試しください。",
      commentsAria: "動画のコメント",
      commentsTitle: "コメント",
      commentsHot: "人気順",
      commentsNewest: "新着順",
      commentsSort: "コメントの並び順",
      commentsCountOne: "{count}件のコメント",
      commentsCountOther: "{count}件のコメント",
      commentsLoading: "コメントを読み込み中",
      commentsLoadFailed: "コメントを読み込めませんでした",
      commentsNoComments: "コメントはまだありません",
      commentsClosed: "コメント欄は閉じられています",
      commentsEnd: "すべてのコメントを表示しました",
      commentsPinned: "固定",
      commentsUploader: "投稿者",
      commentsReplyCountOne: "{count}件の返信",
      commentsReplyCountOther: "{count}件の返信",
      commentsLikeCount: "いいね {count}件",
      commentsImage: "コメント画像",
      imageViewer: "画像を表示",
      viewImage: "画像 {index}/{total} を表示",
      imageCounter: "{index} / {total}",
      closeImageViewer: "閉じる",
      previousImage: "前の画像",
      nextImage: "次の画像",
      imageLoadFailed: "画像を読み込めませんでした",
      commentsAnonymous: "匿名ユーザー",
      audioAlbum: "Bilibili · 音声のみ",
      audioGeneric: "音声",
      bitrateReported: "{bitrate} kbps（公称）",
      bitrateUnavailable: "ビットレート不明",
      highestAvailable: "利用可能な最高音質",
      pageLoadFailed: "ページを読み込めませんでした",
      pageLoadFailedHint: "接続を確認して再試行するか、Bilibili の元のページを開いてください。",
      openOriginalPage: "元のページを開く",
      previousTrack: "前へ",
      nextTrack: "次へ",
      resumedAt: "{time} から再開しました",
      startOver: "最初から再生",
      autoplay: "自動再生",
      autoplayOn: "自動再生：オン",
      autoplayOff: "自動再生：オフ",
      collectionTitle: "シリーズ",
      partsTitle: "パート",
      selectPlaylistVideo: "シリーズの動画またはパートを選択",
    }),
  });
  const UI_LOCALE = detectUILocale();
  const UI_LANGUAGE_TAG = UI_LOCALE;
  const SEARCH_TYPE_LABELS = Object.freeze({
    media_bangumi: t("categoryBangumi"),
    media_ft: t("categoryFilm"),
    video: t("categoryVideo"),
  });
  const QUALITY_LABELS = Object.freeze({
    6: "240P",
    16: "360P",
    32: "480P",
    64: "720P",
    74: "720P · 60fps",
    80: "1080P",
    112: "1080P+",
    116: "1080P · 60fps",
    120: "4K",
    125: "HDR",
    126: "Dolby Vision",
    127: "8K",
  });
  const WBI_MIXIN_KEY_ENC_TAB = Object.freeze([
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
  ]);
  const MD5_SHIFTS = Object.freeze([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]);
  const MD5_CONSTANTS = Object.freeze(Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  ));
  const UGC_PLAYER_SELECTORS = Object.freeze([
    "#app .video .m-video-player",
    "#app .m-video .m-video-player",
    "#app .m-video-player",
    "#app .video-share",
    "#app .m-video-normal",
    "#app .m-video",
  ]);

  function detectUILocale() {
    const candidates = [
      ...(Array.isArray(PAGE_NAVIGATOR.languages) ? PAGE_NAVIGATOR.languages : []),
      PAGE_NAVIGATOR.language,
    ];
    for (const candidate of candidates) {
      const language = String(candidate || "").trim().replaceAll("_", "-").toLowerCase();
      if (!language) continue;
      if (language === "ja" || language.startsWith("ja-")) return "ja";
      if (language === "zh" || language.startsWith("zh-")) {
        return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(language) ? "zh-TW" : "zh-CN";
      }
      if (language === "en" || language.startsWith("en-")) return "en";
    }
    return "en";
  }

  function t(key, values = null) {
    const template = String(UI_MESSAGES[UI_LOCALE]?.[key] ?? UI_MESSAGES.en[key] ?? key);
    if (!values) return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : `{${name}}`,
    );
  }

  function formatLocalizedList(items) {
    const values = [...new Set((items || []).filter(Boolean))];
    if (values.length <= 1) return values[0] || "";
    try {
      return new Intl.ListFormat(UI_LANGUAGE_TAG, { style: "short", type: "conjunction" }).format(values);
    } catch {
      return values.join(UI_LOCALE === "en" ? ", " : "、");
    }
  }

  function formatEpisodeMeta(count) {
    return t(Number(count) === 1 ? "episodeMetaOne" : "episodeMetaOther", { count });
  }

  function formatSearchResultCount(count) {
    return t(Number(count) === 1 ? "searchCountOne" : "searchCountOther", { count });
  }

  function formatProfileVideoCount(count) {
    return t(Number(count) === 1 ? "profileVideoCountOne" : "profileVideoCountOther", { count });
  }

  function formatProfileFollowerCount(count) {
    const value = Math.max(0, Number(count) || 0);
    return t(value === 1 ? "profileFollowerCountOne" : "profileFollowerCountOther", {
      count: formatCount(value),
    });
  }

  function applyUILanguage(element) {
    if (element instanceof HTMLElement) element.lang = UI_LANGUAGE_TAG;
    return element;
  }

  const TAKEOVER_ACTIVE = takeOverDocumentIfOwned();
  injectStyle();
  if (TAKEOVER_ACTIVE) void ensureAntiBotCookies();

  let routeCleanup = () => {};
  let routeAbortController = null;
  let routeGeneration = 0;
  let routeKey = "";
  let routeInitKey = "";
  let cachedWbiMixinKey = "";
  let cachedWbiMixinKeyExpiresAt = 0;
  let cachedWbiMixinKeyPromise = null;
  let wbiMixinKeyGeneration = 0;
  let dashPlaybackSupportedCache;
  let shakaPolyfillsInstalled = false;
  const videoDecodingCapabilityCache = new Map();
  const mediaCapabilityQueue = [];
  let activeMediaCapabilityProbes = 0;
  const audioTypeSupportCache = new Map();
  let audioSupportProbe = null;
  // Search titles contain entity escapes; decode them as text, never as HTML.
  const HTML_ENTITIES = Object.freeze({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&nbsp;": " ",
  });
  let publishedDateFormatter = null;
  let publishedDateFormatterInitialized = false;
  let compactCountFormatter = null;
  let compactCountFormatterInitialized = false;
  let commentDateFormatter = null;
  let commentDateFormatterInitialized = false;
  let suppressedRouteNotifications = 0;
  let shakaLoadPromise = null;
  let activeImageViewer = null;
  // A one-shot playback handoff for the next player that mounts, used when an
  // in-place audio track change has to rebuild the page around the new track.
  let pendingPlayerHandoff = null;

  installHistoryHooks();
  window.addEventListener("popstate", notifyLocationChange);
  window.addEventListener(ROUTE_EVENT, () => void runRoute());
  document.addEventListener("DOMContentLoaded", () => void runRoute(), { once: true });
  window.addEventListener("load", () => void runRoute(), { once: true });
  void runRoute();

  async function runRoute(force = false) {
    const nextRouteKey = `${location.pathname}${location.search}`;
    // A forced handoff must replace even an initialization still in progress.
    if (!force && (nextRouteKey === routeKey || routeInitKey === nextRouteKey)) return;
    routeKey = nextRouteKey;
    routeInitKey = nextRouteKey;

    const generation = ++routeGeneration;
    routeAbortController?.abort();
    routeAbortController = null;
    safeCleanup(routeCleanup);
    routeCleanup = () => {};

    const controller = new AbortController();
    routeAbortController = controller;
    const routeContext = createRouteContext(generation, controller.signal);

    let nextCleanup = () => {};
    try {
      if (isHomePath(location.pathname)) {
        nextCleanup = await initHomePage(routeContext);
      } else if (isSearchPath(location.pathname)) {
        nextCleanup = await initSearchPage(routeContext);
      } else if (isSpacePath(location.pathname)) {
        nextCleanup = await initProfilePage(routeContext);
      } else if (/^\/video\//i.test(location.pathname)) {
        nextCleanup = await initUGCNativePlayer(routeContext);
      } else if (/^\/bangumi\/play\/(?:ep|ss)\d+/i.test(location.pathname)) {
        nextCleanup = await initBangumiNativePlayer(routeContext);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error(`${LOG_PREFIX} route initialization failed`, error);
        if (/^\/video\//i.test(location.pathname)) releaseBilibiliPlayer();
        if (routeContext.isCurrent()) {
          routeKey = "";
          showTakeoverFailure();
        }
      }
    } finally {
      // An older initialization must not clear its forced replacement's marker.
      if (generation === routeGeneration && routeInitKey === nextRouteKey) routeInitKey = "";
    }

    if (!routeContext.isCurrent()) {
      safeCleanup(nextCleanup);
      return;
    }
    if (TAKEOVER_ACTIVE) markTakeoverRendered();

    routeCleanup = () => {
      controller.abort();
      safeCleanup(nextCleanup);
      if (routeAbortController === controller) routeAbortController = null;
    };
  }

  function isHomePath(pathname) {
    return pathname === "/" || pathname === "/index.html";
  }

  function isSearchPath(pathname) {
    return pathname === "/search" || pathname === "/search/";
  }

  function isSpacePath(pathname) {
    return /^\/space\/[1-9]\d*(?:\/|$)/i.test(pathname);
  }

  function parseSpaceIdentifier(pathname) {
    const match = /^\/space\/([1-9]\d*)(?:\/|$)/i.exec(pathname);
    return match?.[1] || "";
  }

  function installHistoryHooks() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (original?.[HISTORY_HOOK_FLAG]) continue;

      const wrapped = function (...args) {
        const result = Reflect.apply(original, this, args);
        notifyLocationChange();
        return result;
      };
      Object.defineProperty(wrapped, HISTORY_HOOK_FLAG, { value: true });

      try {
        history[method] = wrapped;
      } catch (error) {
        console.warn(`${LOG_PREFIX} unable to observe history.${method}`, error);
      }
    }
  }

  function notifyLocationChange() {
    if (suppressedRouteNotifications > 0) return;
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }

  // Record a new URL for the track that is now playing without tearing down
  // the current route. Rebuilding the route would replace the <audio> element,
  // which ends iOS background playback while the screen is locked.
  function recordLocationWithoutRoute(url) {
    suppressedRouteNotifications += 1;
    try {
      history.pushState(history.state, "", url);
    } finally {
      suppressedRouteNotifications -= 1;
    }
    routeKey = `${location.pathname}${location.search}`;
  }

  // Rebuild the current route (page chrome, comments, episode list) after an
  // in-place track change, carrying the playback position into the new player.
  function rebuildRouteWithHandoff(handoff) {
    pendingPlayerHandoff = handoff ? { ...handoff, createdAt: Date.now() } : null;
    routeKey = "";
    void runRoute(true);
  }

  function takePlayerHandoff(key) {
    const handoff = pendingPlayerHandoff;
    pendingPlayerHandoff = null;
    if (!handoff || handoff.key !== key || Date.now() - handoff.createdAt > 60_000) return null;
    return handoff;
  }

  function createRouteContext(generation, signal) {
    return {
      signal,
      isCurrent() {
        return generation === routeGeneration && !signal.aborted;
      },
      assertCurrent() {
        throwIfAborted(signal);
        if (generation !== routeGeneration) throw createAbortError();
      },
    };
  }

  function safeCleanup(cleanup) {
    try {
      cleanup?.();
    } catch (error) {
      console.warn(`${LOG_PREFIX} cleanup failed`, error);
    }
  }

  function createAbortError() {
    if (typeof DOMException === "function") {
      return new DOMException("Operation aborted", "AbortError");
    }
    const error = new Error("Operation aborted");
    error.name = "AbortError";
    return error;
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === "object" && error.name === "AbortError");
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw createAbortError();
  }

  function isAutoplayEnabled() {
    try {
      return localStorage.getItem(AUTOPLAY_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  }

  function setAutoplayEnabled(enabled) {
    try {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
    }
  }

  // === module: pages ===
  async function initHomePage(routeContext) {
    const { signal } = routeContext;
    const channelMenu = await waitForAny(
      ["#app .m-head .channel-menu", "#app .m-head [class*='channel-menu']"],
      ELEMENT_TIMEOUT_MS,
      signal,
    );
    routeContext.assertCurrent();

    const head = channelMenu.closest("#app .m-head") || channelMenu.closest(".m-head");
    if (!(head instanceof HTMLElement)) return () => {};

    head.querySelectorAll(".bm-home-shell, .bm-recommend-view").forEach((node) => node.remove());
    document.documentElement?.classList.add(HOME_ACTIVE_CLASS);

    const refreshButton = createElement("button", "bm-recommend-fab");
    refreshButton.type = "button";
    refreshButton.title = t("refreshRecommendations");
    refreshButton.setAttribute("aria-label", t("refreshRecommendations"));
    refreshButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="15" height="13" rx="4" />
        <path d="m9.5 9 5 3-5 3z" />
        <path d="M19.5 2.75v4M17.5 4.75h4" />
      </svg>
    `;

    const view = createElement("main", "bm-recommend-view");
    view.setAttribute("aria-label", t("recommendedVideos"));
    const grid = createElement("div", "bm-recommend-grid");
    const status = createElement("div", "bm-recommend-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "bm-recommend-sentinel");
    view.append(grid, status, sentinel);

    const homeShell = createElement("section", "bm-home-shell");
    homeShell.setAttribute("aria-label", t("homeAria"));
    applyUILanguage(homeShell);
    homeShell.append(view);
    head.appendChild(homeShell);
    document.body.appendChild(refreshButton);

    if (location.hash !== RECOMMEND_HASH) {
      history.replaceState(history.state, "", `/${RECOMMEND_HASH}`);
    }

    let page = 0;
    let loading = false;
    let stopped = false;
    let disposed = false;
    let consecutiveEmptyPages = 0;
    let prefetchFrame = 0;
    let observedAppRoot = null;
    const seen = new Set();
    let syncScheduled = false;

    const scheduleHomeSync = () => {
      if (syncScheduled || disposed || signal.aborted) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        syncHomeDom();
      });
    };

    const domObserver = new MutationObserver(() => {
      if (homeShell.isConnected || disposed || signal.aborted) return;
      scheduleHomeSync();
    });
    const rootObserver = new MutationObserver(() => {
      if (homeShell.isConnected && observedAppRoot?.isConnected) return;
      scheduleHomeSync();
    });

    const observeHomeRoot = (currentHead) => {
      const nextAppRoot = currentHead?.closest?.("#app") || document.querySelector("#app");
      if (!(nextAppRoot instanceof HTMLElement) || nextAppRoot === observedAppRoot) return;
      observedAppRoot = nextAppRoot;
      domObserver.disconnect();
      domObserver.observe(nextAppRoot, { childList: true, subtree: true });
    };

    const syncHomeDom = () => {
      if (disposed || !routeContext.isCurrent()) return;
      document.documentElement?.classList.add(HOME_ACTIVE_CLASS);

      const currentHead = document.querySelector("#app .m-head");
      if (currentHead instanceof HTMLElement) {
        if (homeShell.parentElement !== currentHead) currentHead.appendChild(homeShell);
        observeHomeRoot(currentHead);
      }
      if (!refreshButton.isConnected && document.body) document.body.appendChild(refreshButton);
    };

    rootObserver.observe(document.body || document.documentElement, { childList: true });
    syncHomeDom();

    function showInitialSkeletons() {
      if (page !== 0 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 4; index += 1) {
        fragment.appendChild(createRecommendationSkeletonCard());
      }
      grid.appendChild(fragment);
    }

    function clearInitialSkeletons() {
      grid.querySelectorAll(".bm-recommend-skeleton").forEach((node) => node.remove());
    }


    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 700) void loadMore();
      });
    }

    async function loadMore() {
      if (disposed || signal.aborted || loading || stopped) return;
      if (page >= HOME_MAX_PAGES) {
        stopped = true;
        status.dataset.state = "done";
        status.textContent = t("homeEnd");
        return;
      }
      loading = true;
      status.replaceChildren();

      if (page === 0) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        const requestedPage = page;
        const items = await getRecommendations(requestedPage, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;

        const freshItems = items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) fragment.appendChild(createRecommendationCard(item));
        grid.appendChild(fragment);
        page = requestedPage + 1;
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || page >= HOME_MAX_PAGES) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = t("homeEnd");
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreContent");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} recommendations failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";

        const message = createElement("span", "bm-status-message");
        message.textContent = t("recommendLoadFailed");
        const retry = createElement("button", "bm-button");
        retry.type = "button";
        retry.textContent = t("reload");
        retry.addEventListener(
          "click",
          () => {
            status.replaceChildren();
            delete status.dataset.state;
            void loadMore();
          },
          { once: true },
        );
        status.append(message, retry);
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const refreshFeed = async () => {
      if (disposed || loading) return;
      refreshButton.disabled = true;
      refreshButton.classList.add("is-refreshing");
      page = 0;
      stopped = false;
      consecutiveEmptyPages = 0;
      seen.clear();
      grid.replaceChildren();
      status.replaceChildren();
      window.scrollTo({ top: 0, behavior: "smooth" });
      try {
        await loadMore();
      } finally {
        refreshButton.disabled = false;
        refreshButton.classList.remove("is-refreshing");
      }
    };
    refreshButton.addEventListener("click", refreshFeed);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(sentinel);
    void loadMore();

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      domObserver.disconnect();
      rootObserver.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      refreshButton.removeEventListener("click", refreshFeed);
      refreshButton.remove();
      homeShell.remove();
      if (!document.querySelector(".bm-home-shell")) {
        document.documentElement?.classList.remove(HOME_ACTIVE_CLASS);
      }
    };
  }


  async function initSearchPage(routeContext) {
    const { signal } = routeContext;
    const app = await waitForAny(["#app"], ELEMENT_TIMEOUT_MS, signal);
    routeContext.assertCurrent();

    app.querySelectorAll(".bm-search-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(SEARCH_ACTIVE_CLASS);

    const queryParams = new URLSearchParams(location.search);
    const keyword = (queryParams.get("keyword") || "").trim();
    const requestedOrder = queryParams.get("order") || "totalrank";
    const order = ["totalrank", "click", "pubdate"].includes(requestedOrder)
      ? requestedOrder
      : "totalrank";

    setTakeoverTitle(keyword ? `${keyword} - ${t("searchTitle")}` : t("searchTitle"));
    const shell = createElement("section", "bm-search-shell");
    shell.setAttribute("aria-label", t("searchAria"));
    shell.classList.toggle("is-empty", !keyword);
    applyUILanguage(shell);

    const header = createElement("header", "bm-search-header");
    const headerTop = createElement("div", "bm-search-header-top");

    const backButton = createElement("a", "bm-search-back");
    backButton.href = "/";
    backButton.setAttribute("aria-label", t("backToRecommendations"));
    backButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5-7 7 7 7" />
      </svg>
    `;

    const heading = createElement("div", "bm-search-heading");
    const title = createElement("h1", "bm-search-title");
    title.textContent = t("searchTitle");
    heading.append(title);
    headerTop.append(backButton, heading);

    const form = createElement("form", "bm-search-form");
    form.setAttribute("role", "search");

    const searchIcon = createElement("span", "bm-search-icon");
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.innerHTML = `
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    `;

    const input = createElement("input", "bm-search-input");
    input.type = "search";
    input.name = "keyword";
    input.value = keyword;
    input.placeholder = t("searchPlaceholder");
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.enterKeyHint = "search";
    input.setAttribute("aria-label", t("searchPlaceholder"));

    const clearButton = createElement("button", "bm-search-clear");
    clearButton.type = "button";
    clearButton.setAttribute("aria-label", t("clearSearch"));
    clearButton.innerHTML = `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" />
        <path d="m7.4 7.4 5.2 5.2m0-5.2-5.2 5.2" />
      </svg>
    `;

    const submitButton = createElement("button", "bm-search-submit");
    submitButton.type = "submit";
    submitButton.textContent = t("searchTitle");

    const syncClearButton = () => {
      clearButton.hidden = input.value.length === 0;
      submitButton.disabled = input.value.trim().length === 0;
    };
    input.addEventListener("input", syncClearButton);
    clearButton.addEventListener("click", () => {
      input.value = "";
      syncClearButton();
      input.focus();
    });
    syncClearButton();

    form.append(searchIcon, input, clearButton, submitButton);

    const sortBar = createElement("nav", "bm-search-sort");
    sortBar.setAttribute("aria-label", t("searchSort"));
    for (const item of [
      ["totalrank", t("sortComprehensive")],
      ["click", t("sortMostPlayed")],
      ["pubdate", t("sortLatest")],
    ]) {
      const [value, label] = item;
      const option = createElement("button", `bm-search-sort-option${order === value ? " is-active" : ""}`);
      option.type = "button";
      option.dataset.order = value;
      option.textContent = label;
      option.setAttribute("aria-pressed", order === value ? "true" : "false");
      option.addEventListener("click", () => {
        if (!keyword || value === order) return;
        const url = new URL(location.href);
        url.searchParams.set("keyword", keyword);
        if (value === "totalrank") url.searchParams.delete("order");
        else url.searchParams.set("order", value);
        history.pushState(history.state, "", url);
      });
      sortBar.appendChild(option);
    }

    header.append(headerTop, form, sortBar);

    const content = createElement("main", "bm-search-content");
    const summary = createElement("div", "bm-search-summary");
    const summaryCopy = createElement("div", "bm-search-summary-copy");
    const summaryLabel = createElement("div", "bm-search-summary-label");
    summaryLabel.textContent = keyword ? t("searchResults") : t("startSearch");
    const summaryTitle = createElement("div", "bm-search-summary-title");
    summaryTitle.textContent = keyword ? `“${keyword}”` : t("searchPrompt");
    summaryCopy.append(summaryLabel, summaryTitle);
    const countBadge = createElement("span", "bm-search-count");
    countBadge.hidden = true;
    summary.append(summaryCopy, countBadge);

    const warningBox = createElement("div", "bm-search-warning");
    warningBox.hidden = true;
    warningBox.setAttribute("role", "status");

    const grid = createElement("div", "bm-recommend-grid bm-search-grid");
    const status = createElement("div", "bm-recommend-status bm-search-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "bm-recommend-sentinel bm-search-sentinel");
    content.append(summary, warningBox, grid, status, sentinel);
    shell.append(header, content);
    app.appendChild(shell);

    let nextPage = 1;
    let totalPages = Number.POSITIVE_INFINITY;
    let loading = false;
    let stopped = false;
    let disposed = false;
    let syncScheduled = false;
    let consecutiveEmptyPages = 0;
    let prefetchFrame = 0;
    let observedAppRoot = null;
    const seen = new Set();
    const failedSearchRequests = new Map();

    const scheduleSearchSync = () => {
      if (syncScheduled || disposed || signal.aborted) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        syncSearchDom();
      });
    };

    const domObserver = new MutationObserver(() => {
      if (shell.isConnected || disposed || signal.aborted) return;
      scheduleSearchSync();
    });
    const rootObserver = new MutationObserver(() => {
      if (shell.isConnected && observedAppRoot?.isConnected) return;
      scheduleSearchSync();
    });

    const observeSearchRoot = (currentApp) => {
      if (!(currentApp instanceof HTMLElement) || currentApp === observedAppRoot) return;
      observedAppRoot = currentApp;
      domObserver.disconnect();
      domObserver.observe(currentApp, { childList: true });
    };

    const syncSearchDom = () => {
      if (disposed || !routeContext.isCurrent()) return;
      document.documentElement?.classList.add(SEARCH_ACTIVE_CLASS);
      const currentApp = document.querySelector("#app");
      if (currentApp instanceof HTMLElement) {
        if (shell.parentElement !== currentApp) currentApp.appendChild(shell);
        observeSearchRoot(currentApp);
      }
    };

    rootObserver.observe(document.body || document.documentElement, { childList: true });
    syncSearchDom();

    const showInitialSkeletons = () => {
      if (nextPage !== 1 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 5; index += 1) {
        fragment.appendChild(createRecommendationSkeletonCard());
      }
      grid.appendChild(fragment);
    };

    const clearInitialSkeletons = () => {
      grid.querySelectorAll(".bm-recommend-skeleton").forEach((node) => node.remove());
    };

    const searchSectionOrder = Object.freeze(["bangumi", "film", "video", "picture"]);
    const searchSectionAnchors = new Map();

    function ensureSearchSectionAnchors() {
      if (searchSectionAnchors.size > 0) return;
      for (const kind of searchSectionOrder) {
        const anchor = document.createComment(`bm-search-${kind}-end`);
        searchSectionAnchors.set(kind, anchor);
        grid.appendChild(anchor);
      }
    }

    function insertSearchItems(items) {
      if (!Array.isArray(items) || items.length === 0) return;
      ensureSearchSectionAnchors();
      const fragments = new Map(searchSectionOrder.map((kind) => [kind, document.createDocumentFragment()]));
      for (const item of items) {
        const kind = searchSectionAnchors.has(item.kind) ? item.kind : "picture";
        const card = createRecommendationCard(item);
        card.dataset.searchKind = kind;
        fragments.get(kind).appendChild(card);
      }
      for (const kind of searchSectionOrder) {
        const fragment = fragments.get(kind);
        if (fragment.childNodes.length > 0) grid.insertBefore(fragment, searchSectionAnchors.get(kind));
      }
    }

    function renderSearchWarnings() {
      warningBox.replaceChildren();
      if (failedSearchRequests.size === 0) {
        warningBox.hidden = true;
        return;
      }
      warningBox.hidden = false;
      const failedTypes = [...new Set(
        [...failedSearchRequests.values()].map((item) => SEARCH_TYPE_LABELS[item.searchType] || item.searchType),
      )];
      const message = createElement("span", "bm-search-warning-message");
      message.textContent = t("searchPartialFailure", { types: formatLocalizedList(failedTypes) });
      const retry = createElement("button", "bm-search-warning-retry");
      retry.type = "button";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => void retryFailedSearchRequests(), { once: true });
      warningBox.append(message, retry);
    }

    function mergeTotalPages(candidate) {
      const value = Math.max(0, Number(candidate) || 0);
      if (value === 0) return;
      totalPages = Number.isFinite(totalPages) ? Math.max(totalPages, value) : value;
    }

    function hasMoreSearchPages() {
      return nextPage <= SEARCH_MAX_PAGES && nextPage <= totalPages;
    }

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped || !keyword) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted || !keyword) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
      });
    }

    async function retryFailedSearchRequests() {
      if (disposed || signal.aborted || failedSearchRequests.size === 0) return;
      const pending = [...failedSearchRequests.entries()];
      warningBox.dataset.loading = "true";
      const settled = await Promise.allSettled(pending.map(([, request]) =>
        getSearchTypeResults(keyword, request.page, order, request.searchType, signal),
      ));
      if (disposed || signal.aborted || !routeContext.isCurrent()) return;
      const recovered = [];
      for (let index = 0; index < settled.length; index += 1) {
        const [key] = pending[index];
        const result = settled[index];
        if (result.status === "fulfilled") {
          failedSearchRequests.delete(key);
          mergeTotalPages(result.value.totalPages);
          recovered.push(...result.value.items);
        } else if (!isAbortError(result.reason)) {
          console.warn(`${LOG_PREFIX} search-category retry failed`, result.reason);
        }
      }
      const fresh = recovered.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      insertSearchItems(fresh);
      if (fresh.length > 0) consecutiveEmptyPages = 0;
      if (hasMoreSearchPages()) {
        stopped = false;
        if (status.dataset.state === "done") {
          delete status.dataset.state;
          status.textContent = "";
        }
      }
      delete warningBox.dataset.loading;
      renderSearchWarnings();
      scheduleUnderfillCheck();
    }


    async function loadMore() {
      if (!keyword || disposed || signal.aborted || loading || stopped || !hasMoreSearchPages()) return;
      loading = true;
      status.replaceChildren();

      if (nextPage === 1) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        const requestedPage = nextPage;
        const result = await getSearchResults(keyword, requestedPage, order, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;

        mergeTotalPages(result.totalPages);
        if (Number.isFinite(result.total) && result.total >= 0) {
          countBadge.hidden = false;
          countBadge.textContent = result.total > 999 ? "999+" : String(result.total);
          countBadge.title = formatSearchResultCount(result.total);
        }

        for (const failure of result.failures || []) {
          failedSearchRequests.set(`${requestedPage}:${failure.searchType}`, {
            page: requestedPage,
            searchType: failure.searchType,
            error: failure.error,
          });
        }
        renderSearchWarnings();

        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        insertSearchItems(freshItems);
        nextPage = requestedPage + 1;
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || !hasMoreSearchPages()) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = grid.childElementCount > 0 ? t("allResultsShown") : t("noResults");
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreResults");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} search failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";

        const message = createElement("span", "bm-status-message");
        message.textContent = t("searchLoadFailed");
        const retry = createElement("button", "bm-button");
        retry.type = "button";
        retry.textContent = t("reload");
        retry.addEventListener(
          "click",
          () => {
            status.replaceChildren();
            delete status.dataset.state;
            void loadMore();
          },
          { once: true },
        );
        status.append(message, retry);
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const onSubmit = (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const url = new URL(location.href);
      url.pathname = "/search";
      url.search = "";
      url.searchParams.set("keyword", value);
      history.pushState(history.state, "", url);
    };
    form.addEventListener("submit", onSubmit);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);

    if (keyword) {
      void loadMore();
    } else {
      status.dataset.state = "empty";
      status.textContent = t("searchHint");
      window.requestAnimationFrame(() => input.focus());
    }

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      domObserver.disconnect();
      rootObserver.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      form.removeEventListener("submit", onSubmit);
      input.removeEventListener("input", syncClearButton);
      shell.remove();
      if (!document.querySelector(".bm-search-shell")) {
        document.documentElement?.classList.remove(SEARCH_ACTIVE_CLASS);
      }
    };
  }


  async function initProfilePage(routeContext) {
    const { signal } = routeContext;
    const creatorId = parseSpaceIdentifier(location.pathname);
    if (!creatorId) return () => {};
    const viewerId = getCurrentUserId();
    const ownProfile = Boolean(viewerId && viewerId === creatorId);

    const app = await waitForAny(["#app"], ELEMENT_TIMEOUT_MS, signal);
    routeContext.assertCurrent();

    app.querySelectorAll(".bm-profile-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(PROFILE_ACTIVE_CLASS);

    const shell = createElement("section", "bm-profile-shell");
    shell.setAttribute("aria-label", t("profileAria", { name: t("profileTitle") }));
    applyUILanguage(shell);

    const nav = createElement("header", "bm-profile-nav");
    const backButton = createElement("button", "bm-search-back bm-profile-back");
    backButton.type = "button";
    backButton.setAttribute("aria-label", t("back"));
    backButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5-7 7 7 7" />
      </svg>
    `;

    const navHeading = createElement("div", "bm-profile-nav-heading");
    const navTitle = createElement("div", "bm-profile-nav-title");
    navTitle.textContent = t("profileTitle");
    navHeading.append(navTitle);

    const homeButton = createElement("a", "bm-search-back bm-profile-home");
    homeButton.href = "/";
    homeButton.setAttribute("aria-label", t("backToRecommendations"));
    homeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 10.5 12 4l7.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-4v5H6a1.5 1.5 0 0 1-1.5-1.5z" />
      </svg>
    `;
    nav.append(backButton, navHeading, homeButton);

    const hero = createElement("section", "bm-profile-hero is-loading");
    const heroCover = createElement("div", "bm-profile-cover");
    const heroCoverImage = document.createElement("img");
    heroCoverImage.alt = "";
    heroCoverImage.decoding = "async";
    heroCoverImage.referrerPolicy = "no-referrer";
    heroCoverImage.hidden = true;
    heroCover.appendChild(heroCoverImage);

    const heroContent = createElement("div", "bm-profile-hero-content");
    const avatarFrame = createElement("div", "bm-profile-avatar-frame");
    const avatar = document.createElement("img");
    avatar.alt = "";
    avatar.decoding = "async";
    avatar.referrerPolicy = "no-referrer";
    avatar.addEventListener("error", () => avatar.removeAttribute("src"));
    heroCoverImage.addEventListener("error", () => {
      heroCoverImage.hidden = true;
      heroCoverImage.removeAttribute("src");
    });
    avatarFrame.appendChild(avatar);

    const identity = createElement("div", "bm-profile-identity");
    const nameRow = createElement("div", "bm-profile-name-row");
    const name = createElement("h1", "bm-profile-name");
    name.textContent = t("profileLoading");
    const official = createElement("span", "bm-profile-official");
    official.hidden = true;
    official.textContent = t("profileOfficial");
    nameRow.append(name, official);

    const signature = createElement("p", "bm-profile-signature");
    signature.hidden = true;
    const profileMeta = createElement("div", "bm-profile-meta");
    const uidPill = createElement("span", "bm-profile-meta-pill");
    uidPill.textContent = t("profileUid", { id: creatorId });
    const followerPill = createElement("span", "bm-profile-meta-pill");
    followerPill.hidden = true;
    const videoPill = createElement("span", "bm-profile-meta-pill is-accent");
    videoPill.textContent = formatProfileVideoCount(0);
    profileMeta.append(uidPill, followerPill, videoPill);

    const profileActions = createElement("div", "bm-profile-actions");
    profileActions.hidden = ownProfile;
    const followButton = createElement("button", "bm-profile-follow");
    followButton.type = "button";
    followButton.hidden = ownProfile;
    const followIcon = createElement("span", "bm-profile-follow-icon");
    followIcon.setAttribute("aria-hidden", "true");
    const followLabel = createElement("span", "bm-profile-follow-label");
    const followMessage = createElement("span", "bm-profile-follow-message");
    followMessage.setAttribute("role", "status");
    followMessage.setAttribute("aria-live", "polite");
    followMessage.hidden = true;
    followButton.append(followIcon, followLabel);
    profileActions.append(followButton, followMessage);
    identity.append(nameRow, signature, profileMeta, profileActions);
    heroContent.append(avatarFrame, identity);
    hero.append(heroCover, heroContent);

    const content = createElement("main", "bm-profile-content");
    const sectionHeader = createElement("div", "bm-profile-section-header");
    const sectionCopy = createElement("div", "bm-profile-section-copy");
    const sectionTitle = createElement("h2", "bm-profile-section-title");
    sectionTitle.textContent = t("profileVideos");
    sectionCopy.append(sectionTitle);
    const countBadge = createElement("span", "bm-profile-count");
    countBadge.hidden = true;
    sectionHeader.append(sectionCopy, countBadge);

    const grid = createElement("div", "bm-recommend-grid bm-profile-grid");
    const status = createElement("div", "bm-recommend-status bm-profile-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "bm-recommend-sentinel bm-profile-sentinel");
    content.append(sectionHeader, grid, status, sentinel);
    shell.append(nav, hero, content);
    app.appendChild(shell);

    let nextPage = 1;
    let totalPages = Number.POSITIVE_INFINITY;
    let totalVideos = 0;
    let loading = false;
    let stopped = false;
    let disposed = false;
    let syncScheduled = false;
    let prefetchFrame = 0;
    let observedAppRoot = null;
    let consecutiveEmptyPages = 0;
    let profileDisplayName = t("profileTitle");
    let followerCount = null;
    let followBusy = false;
    let followState = {
      following: false,
      mutual: false,
      known: ownProfile || !isLoggedIn(),
    };
    const seen = new Set();

    const onBack = () => {
      if (history.length > 1) history.back();
      else location.assign("/");
    };
    backButton.addEventListener("click", onBack);

    function setFollowMessage(message = "") {
      followMessage.textContent = message;
      followMessage.hidden = !message;
    }

    function renderFollowButton() {
      if (ownProfile) {
        profileActions.hidden = true;
        followButton.hidden = true;
        return;
      }

      profileActions.hidden = false;
      const following = Boolean(followState.following);
      const mutual = following && Boolean(followState.mutual);
      const waitingForState = isLoggedIn() && !followState.known;
      followButton.hidden = false;
      followButton.disabled = followBusy || waitingForState;
      followButton.classList.toggle("is-following", following);
      followButton.classList.toggle("is-mutual", mutual);
      followButton.setAttribute("aria-busy", followBusy ? "true" : "false");
      followButton.setAttribute("aria-pressed", following ? "true" : "false");
      followButton.setAttribute(
        "aria-label",
        t(following ? "profileUnfollowCreator" : "profileFollowCreator", { name: profileDisplayName }),
      );

      followLabel.textContent = followBusy || waitingForState
        ? t("profileFollowLoading")
        : mutual
          ? t("profileMutual")
          : following
            ? t("profileFollowing")
            : t("profileFollow");
      followIcon.innerHTML = following
        ? `<svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.2 3.2 7.8-8" /></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 8c.5-3.5 2.6-5.5 6-5.5 1.2 0 2.3.3 3.2.8M17.5 8v7M14 11.5h7" /></svg>`;
    }

    function updateFollowerCount(count) {
      const numeric = Number(count);
      if (!Number.isFinite(numeric)) return;
      followerCount = Math.max(0, Math.round(numeric));
      const label = formatProfileFollowerCount(followerCount);
      followerPill.textContent = label;
      followerPill.title = label;
      followerPill.hidden = false;
    }

    async function refreshFollowState() {
      if (ownProfile || !isLoggedIn()) {
        followState.known = true;
        renderFollowButton();
        return;
      }
      try {
        const relation = await getCreatorRelation(creatorId, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;
        followState = { ...relation, known: true };
        setFollowMessage();
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        console.warn(`${LOG_PREFIX} creator relationship failed`, error);
        followState.known = true;
      }
      renderFollowButton();
    }

    async function refreshFollowerCount() {
      try {
        const count = await getCreatorFollowerCount(creatorId, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;
        updateFollowerCount(count);
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        console.warn(`${LOG_PREFIX} creator follower count failed`, error);
      }
    }

    async function onFollowClick() {
      if (disposed || followBusy || ownProfile) return;
      if (!isLoggedIn()) {
        location.assign(createBilibiliLoginUrl());
        return;
      }

      const csrf = getCookieValue("bili_jct");
      if (!csrf) {
        location.assign(createBilibiliLoginUrl());
        return;
      }

      const shouldFollow = !followState.following;
      followBusy = true;
      setFollowMessage();
      renderFollowButton();
      try {
        await modifyCreatorRelation(creatorId, shouldFollow, csrf, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;
        followState = {
          following: shouldFollow,
          mutual: false,
          known: true,
        };
        if (followerCount != null) {
          updateFollowerCount(followerCount + (shouldFollow ? 1 : -1));
        }
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        console.warn(`${LOG_PREFIX} creator follow action failed`, error);
        if (error?.code === -101 || error?.code === -111) {
          location.assign(createBilibiliLoginUrl());
          return;
        }
        setFollowMessage(t(shouldFollow ? "profileFollowFailed" : "profileUnfollowFailed"));
      } finally {
        followBusy = false;
        if (!disposed) renderFollowButton();
      }

      void refreshFollowState();
      void refreshFollowerCount();
    }

    followButton.addEventListener("click", onFollowClick);
    renderFollowButton();

    const scheduleProfileSync = () => {
      if (syncScheduled || disposed || signal.aborted) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        syncProfileDom();
      });
    };

    const domObserver = new MutationObserver(() => {
      if (shell.isConnected || disposed || signal.aborted) return;
      scheduleProfileSync();
    });
    const rootObserver = new MutationObserver(() => {
      if (shell.isConnected && observedAppRoot?.isConnected) return;
      scheduleProfileSync();
    });

    const observeProfileRoot = (currentApp) => {
      if (!(currentApp instanceof HTMLElement) || currentApp === observedAppRoot) return;
      observedAppRoot = currentApp;
      domObserver.disconnect();
      domObserver.observe(currentApp, { childList: true });
    };

    const syncProfileDom = () => {
      if (disposed || !routeContext.isCurrent()) return;
      document.documentElement?.classList.add(PROFILE_ACTIVE_CLASS);
      const currentApp = document.querySelector("#app");
      if (currentApp instanceof HTMLElement) {
        if (shell.parentElement !== currentApp) currentApp.appendChild(shell);
        observeProfileRoot(currentApp);
      }
    };

    rootObserver.observe(document.body || document.documentElement, { childList: true });
    syncProfileDom();

    function updateVideoCount(count) {
      totalVideos = Math.max(0, Number(count) || 0);
      const label = formatProfileVideoCount(totalVideos);
      videoPill.textContent = label;
      countBadge.textContent = totalVideos > 999 ? "999+" : String(totalVideos);
      countBadge.title = label;
      countBadge.hidden = false;
    }

    function renderProfile(profile) {
      if (disposed || signal.aborted || !routeContext.isCurrent()) return;
      const profileName = profile.name || t("profileTitle");
      profileDisplayName = profileName;
      setTakeoverTitle(profile.name || t("profileTitle"));
      name.textContent = profileName;
      navTitle.textContent = profileName;
      shell.setAttribute("aria-label", t("profileAria", { name: profileName }));
      renderFollowButton();
      avatar.alt = profileName;
      if (profile.avatar) avatar.src = sizedImage(profile.avatar, 240, 240);
      else avatar.removeAttribute("src");
      if (profile.cover) {
        heroCoverImage.src = sizedImage(profile.cover, 1200, 360);
        heroCoverImage.hidden = false;
      }
      signature.textContent = profile.signature;
      signature.hidden = !profile.signature;
      official.textContent = profile.official || t("profileOfficial");
      official.hidden = !profile.official;
      hero.classList.remove("is-loading", "is-error");
    }

    function renderProfileFailure(error) {
      if (disposed || isAbortError(error)) return;
      console.warn(`${LOG_PREFIX} creator profile failed`, error);
      name.textContent = t("profileLoadFailed");
      navTitle.textContent = t("profileTitle");
      hero.classList.remove("is-loading");
      hero.classList.add("is-error");
    }

    function showInitialSkeletons() {
      if (nextPage !== 1 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 6; index += 1) {
        fragment.appendChild(createRecommendationSkeletonCard());
      }
      grid.appendChild(fragment);
    }

    function clearInitialSkeletons() {
      grid.querySelectorAll(".bm-recommend-skeleton").forEach((node) => node.remove());
    }

    function hasMoreProfilePages() {
      return nextPage <= PROFILE_MAX_PAGES && nextPage <= totalPages;
    }

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
      });
    }

    async function loadMore() {
      if (disposed || signal.aborted || loading || stopped || !hasMoreProfilePages()) return;
      loading = true;
      status.replaceChildren();

      if (nextPage === 1) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        const requestedPage = nextPage;
        const result = await getCreatorVideos(creatorId, requestedPage, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;

        totalPages = Math.max(0, Number(result.totalPages) || 0);
        updateVideoCount(result.total);
        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) fragment.appendChild(createRecommendationCard(item));
        grid.appendChild(fragment);
        nextPage = requestedPage + 1;
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (totalVideos === 0) {
          stopped = true;
          status.dataset.state = "empty";
          status.textContent = t("profileNoVideos");
        } else if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || !hasMoreProfilePages()) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = t("profileEnd");
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreContent");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} creator videos failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";
        const message = createElement("span", "bm-status-message");
        message.textContent = t("profileVideosLoadFailed");
        const retry = createElement("button", "bm-button");
        retry.type = "button";
        retry.textContent = t("retry");
        retry.addEventListener("click", () => void loadMore(), { once: true });
        status.append(message, retry);
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);

    void getCreatorProfile(creatorId, signal).then(renderProfile, renderProfileFailure);
    void refreshFollowState();
    void refreshFollowerCount();
    void loadMore();

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      domObserver.disconnect();
      rootObserver.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      backButton.removeEventListener("click", onBack);
      followButton.removeEventListener("click", onFollowClick);
      shell.remove();
      if (!document.querySelector(".bm-profile-shell")) {
        document.documentElement?.classList.remove(PROFILE_ACTIVE_CLASS);
      }
    };
  }

  async function initUGCNativePlayer(routeContext) {
    const identifier = parseUGCIdentifier(location.pathname);
    if (!identifier) return () => {};
    // The viewer chose Bilibili's own player for this video earlier in the session.
    if (bilibiliPlayerRequestedHere()) return () => {};
    void loadShaka();

    const { signal } = routeContext;
    const mountReady = waitForAny(UGC_PLAYER_SELECTORS, ELEMENT_TIMEOUT_MS, signal)
      .then(() => waitForNextFrame(signal));
    const infoRequest = getVideoInfo(identifier, signal);
    const [, info] = await Promise.all([mountReady, infoRequest]);
    routeContext.assertCurrent();

    const requestedPageValue = Number(new URLSearchParams(location.search).get("p") || "1");
    const requestedPage = Number.isInteger(requestedPageValue) && requestedPageValue > 0 ? requestedPageValue : 1;
    const page = info.pages?.find((item) => item.page === requestedPage) || {
      cid: info.cid,
      page: 1,
      part: info.title,
    };

    const source = await getUGCPlaySource(identifier, page.cid, signal);
    routeContext.assertCurrent();

    const mount = createUGCMount();
    const videoAid = Number(info.aid || identifier.aid) || 0;
    const videoBvid = String(info.bvid || identifier.bvid || "");
    const videoPathname = location.pathname;
    let disposed = false;
    let trackAbort = null;
    // The video whose details (creator, comments, parts) the page shows now.
    let loadedBvid = videoBvid;

    const describeOwner = (owner) => {
      const mid = extractCreatorId(owner?.mid);
      if (!mid) return null;
      return { name: owner.name || "", url: createCreatorUrl(mid), avatar: fixCover(owner.face || "") };
    };
    const createTrackHistory = ({ aid, bvid, cid, page, duration }) => createWatchHistoryContext({
      aid,
      bvid,
      cid,
      type: 3,
      subType: 0,
      duration: Number(duration) || 0,
      referer: `https://www.bilibili.com/video/${bvid || `av${aid}`}/?p=${page || 1}`,
    });
    // The video this page opened with keeps its path and query; any other
    // video gets a clean /video/BV… link.
    const createTrackHref = ({ aid, bvid, page }) => {
      const url = new URL(location.href);
      url.hash = "";
      if (bvid === videoBvid || (!bvid && aid === videoAid)) {
        url.pathname = videoPathname;
      } else {
        url.pathname = `/video/${bvid || `av${aid}`}`;
        url.search = "";
      }
      if (Number(page) > 1) url.searchParams.set("p", String(page));
      else url.searchParams.delete("p");
      return `${url.pathname}${url.search}`;
    };
    // One queue entry per part. A video's title stands in for a single part.
    const createTrack = ({ aid, bvid, part, videoTitle, partCount, poster, creator, label, group = "", autoplay = false }) => {
      const page = Number(part.page) || 1;
      const partTitle = String(part.part || "").trim();
      return {
        value: `${bvid || `av${aid}`}:${part.cid}`,
        aid,
        bvid,
        cid: Number(part.cid),
        page,
        videoTitle,
        title: partCount > 1 && partTitle ? partTitle : videoTitle,
        label,
        group,
        href: createTrackHref({ aid, bvid, page }),
        poster: fixCover(poster || ""),
        history: createTrackHistory({ aid, bvid, cid: part.cid, page, duration: part.duration }),
        creator,
        autoplay,
      };
    };
    const playableParts = (pages) => (Array.isArray(pages) ? pages : []).filter((item) => Number(item?.cid) > 0);
    const tracksForVideo = (details) => {
      const aid = Number(details.aid) || 0;
      const bvid = String(details.bvid || "");
      const parts = playableParts(details.pages);
      const list = parts.length > 0 ? parts : [{ cid: details.cid, page: 1, part: details.title, duration: details.duration }];
      return list.map((part) => createTrack({
        aid,
        bvid,
        part,
        videoTitle: details.title || "",
        partCount: list.length,
        poster: details.pic,
        creator: describeOwner(details.owner),
        label: `P${Number(part.page) || 1} · ${part.part || details.title || ""}`,
      }));
    };

    // A collection (合集) plays in its own order, like a YouTube playlist. Each
    // of its videos contributes all of its parts.
    const collectionTracks = [];
    const season = info.ugc_season;
    const seasonSections = Array.isArray(season?.sections)
      ? season.sections.filter((section) => Array.isArray(section?.episodes) && section.episodes.length > 0)
      : [];
    let episodeNumber = 0;
    for (const section of seasonSections) {
      for (const episode of section.episodes) {
        const bvid = String(episode.bvid || episode.arc?.bvid || "");
        const aid = Number(episode.aid || episode.arc?.aid) || 0;
        if (!bvid && !aid) continue;
        episodeNumber += 1;
        const isOpenedVideo = bvid ? bvid === videoBvid : aid === videoAid;
        const episodeTitle = String(episode.title || episode.arc?.title || "");
        const parts = playableParts(isOpenedVideo ? info.pages : episode.pages);
        const list = parts.length > 0
          ? parts
          : [{ cid: episode.cid || episode.page?.cid, page: 1, part: episodeTitle, duration: episode.arc?.duration }];
        const creator = isOpenedVideo
          ? describeOwner(info.owner)
          : describeOwner(episode.arc?.author) ||
            (Number(season.mid) === Number(info.owner?.mid) ? describeOwner(info.owner) : null);
        for (const part of list) {
          if (!(Number(part.cid) > 0)) continue;
          const partLabel = list.length > 1 ? `-P${Number(part.page) || 1} · ${part.part || episodeTitle}` : ` · ${episodeTitle}`;
          const track = createTrack({
            aid,
            bvid,
            part,
            videoTitle: episodeTitle,
            partCount: list.length,
            poster: episode.arc?.pic || (isOpenedVideo ? info.pic : ""),
            creator,
            label: `${episodeNumber}${partLabel}`,
            group: seasonSections.length > 1 ? String(section.title || "") : "",
          });
          if (list.length > 1) track.title = `${episodeTitle} · ${part.part || `P${track.page}`}`;
          collectionTracks.push(track);
        }
      }
    }

    const currentValue = `${videoBvid || `av${videoAid}`}:${page.cid}`;
    const collectionIndex = collectionTracks.findIndex((item) => item.value === currentValue);
    const isCollection = collectionTracks.length > 1 && collectionIndex >= 0;
    // Every video page gets a queue the player walks through in place. A
    // collection holds its videos; otherwise the queue holds this video's
    // parts followed by one related video that Autoplay may continue into.
    const queueItems = isCollection ? collectionTracks : tracksForVideo({ ...info, aid: videoAid, bvid: videoBvid });
    const queueIndex = isCollection ? collectionIndex : queueItems.findIndex((item) => item.value === currentValue);
    const queue = {
      kind: isCollection ? "playlist" : "autoplay",
      items: queueItems,
      index: Math.max(0, queueIndex),
      loadSource: (item, trackSignal) => getUGCPlaySource(item.bvid ? { bvid: item.bvid } : { aid: item.aid }, item.cid, trackSignal),
      // A collection lists every entry. A single video lists only its own
      // parts, never the related pick or videos played before it.
      getPickerEntries(activeIndex) {
        const entries = queue.items.map((item, index) => ({ index, label: item.label, group: item.group, item }));
        if (queue.kind === "playlist") return entries;
        const bvid = queue.items[activeIndex]?.bvid;
        return entries.filter(({ item }) => item.bvid === bvid && !item.autoplay);
      },
      onTrackChange: (item, index) => void onTrackChange(item, index),
    };

    let comments = createVideoCommentsSection({
      aid: videoAid,
      uploaderId: info.owner?.mid,
      initialCount: info.stat?.reply,
      signal,
    });

    // The list sits between the player controls and the comments.
    const supplemental = createElement("div", "bm-video-supplemental");
    const listSection = createElement("section", "bm-playlist-section");
    const listHeader = createElement("div", "bm-playlist-header");
    const listTitle = createElement("h2", "bm-playlist-title");
    listTitle.textContent = isCollection ? String(season?.title || "").trim() || t("collectionTitle") : t("partsTitle");
    const listCount = createElement("span", "bm-playlist-count");
    listHeader.append(listTitle, listCount);
    const listRail = createElement("div", "bm-playlist-rail");
    listSection.append(listHeader, listRail);
    supplemental.append(listSection, comments.element);

    function renderPlaylistRail(activeIndex) {
      const entries = queue.getPickerEntries(activeIndex);
      listSection.hidden = entries.length <= 1;
      listCount.textContent = `${entries.length}`;
      listRail.replaceChildren(...entries.map(({ index, label, item }) => {
        const button = createElement("button", "bm-playlist-item-button");
        button.type = "button";
        button.textContent = label;
        button.title = item.title;
        if (index === activeIndex) {
          button.classList.add("is-current");
          button.setAttribute("aria-current", "true");
        }
        button.addEventListener("click", () => {
          if (index === activeIndex) return;
          // Switching inside the player keeps fullscreen and the play state.
          if (queue.play) queue.play(index);
          else history.pushState(history.state, "", item.href);
        });
        return button;
      }));
      requestAnimationFrame(() => {
        listRail.querySelector(".bm-playlist-item-button.is-current")?.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "center",
        });
      });
    }

    function replaceComments(details) {
      const nextComments = createVideoCommentsSection({
        aid: details.aid,
        uploaderId: details.owner?.mid,
        initialCount: details.stat?.reply,
        signal,
      });
      comments.element.replaceWith(nextComments.element);
      comments.cleanup();
      comments = nextComments;
      comments.start();
    }

    // Replace whatever follows the current video's last part with the first
    // related video that has not been queued yet, so autoplay never bounces
    // between two videos.
    async function queueRelatedVideo(index, relatedSignal) {
      if (queue.kind !== "autoplay") return;
      const current = queue.items[index];
      if (!current) return;
      let last = index;
      while (last + 1 < queue.items.length && queue.items[last + 1].bvid === current.bvid && !queue.items[last + 1].autoplay) {
        last += 1;
      }
      try {
        const related = await getRelatedVideos(current.bvid ? { bvid: current.bvid } : { aid: current.aid }, relatedSignal);
        if (disposed || relatedSignal.aborted) return;
        const queued = new Set(queue.items.slice(0, last + 1).map((item) => item.bvid));
        const pick = related.find((video) => !queued.has(video.bvid));
        if (!pick) return;
        queue.items.splice(last + 1, queue.items.length, createTrack({
          aid: pick.aid,
          bvid: pick.bvid,
          part: { cid: pick.cid, page: 1, part: pick.title, duration: pick.duration },
          videoTitle: pick.title,
          partCount: 1,
          poster: pick.pic,
          creator: describeOwner(pick.owner),
          label: pick.title,
          autoplay: true,
        }));
        queue.refresh?.();
      } catch (error) {
        if (!isAbortError(error)) console.debug(`${LOG_PREFIX} related videos failed`, error);
      }
    }

    // The player has already swapped the media and recorded the new URL.
    // Bring the rest of the page up to date for the track playing now.
    async function onTrackChange(item, index) {
      if (disposed) return;
      renderPlaylistRail(index);
      // Another part of the same video needs nothing else.
      if (item.bvid === loadedBvid) return;
      loadedBvid = item.bvid;
      if (item.videoTitle) document.title = `${item.videoTitle} - ${t("bilibili")}`;
      trackAbort?.abort();
      const controller = new AbortController();
      trackAbort = controller;
      const onRouteAbort = () => controller.abort();
      signal.addEventListener("abort", onRouteAbort, { once: true });
      try {
        const details = await getVideoInfo(item.bvid ? { bvid: item.bvid } : { aid: item.aid }, controller.signal);
        if (disposed || controller.signal.aborted) return;
        queue.setCreator?.(describeOwner(details.owner) || {});
        replaceComments(details);
        if (queue.kind === "autoplay") {
          // A related pick arrives as its first part only. Queue all of its
          // parts in place, then find the next related video after them.
          const parts = tracksForVideo(details);
          const position = parts.findIndex((track) => track.cid === item.cid);
          if (position >= 0) queue.items.splice(index, queue.items.length, ...parts.slice(position));
          renderPlaylistRail(index);
          queue.refresh?.();
          await queueRelatedVideo(index, controller.signal);
        }
      } catch (error) {
        if (!isAbortError(error)) console.warn(`${LOG_PREFIX} video details for the next track failed`, error);
      } finally {
        signal.removeEventListener("abort", onRouteAbort);
        if (trackAbort === controller) trackAbort = null;
      }
    }

    renderPlaylistRail(queue.index);

    let nativeCleanup = () => {};
    try {
      nativeCleanup = renderNativePlayer({
        mount,
        resolveMount: resolveUGCMount,
        title: queue.items[queue.index]?.title || page.part || info.title,
        artist: info.owner?.name || t("bilibili"),
        creatorUrl: createCreatorUrl(info.owner?.mid),
        creatorAvatar: fixCover(info.owner?.face || ""),
        poster: info.pic,
        source,
        historyContext: createTrackHistory({
          aid: videoAid,
          bvid: videoBvid,
          cid: page.cid,
          page: page.page,
          duration: page.duration || info.duration,
        }),
        playlist: queueIndex >= 0 ? queue : null,
        supplementalContent: supplemental,
        options: [],
        onOptionChange(value) {
          const url = new URL(location.href);
          url.searchParams.set("p", value);
          history.pushState(history.state, "", url);
        },
      });
      comments.start();
    } catch (error) {
      comments.cleanup();
      throw error;
    }

    if (queueIndex >= 0 && queue.kind === "autoplay") {
      const relatedController = new AbortController();
      trackAbort = relatedController;
      signal.addEventListener("abort", () => relatedController.abort(), { once: true });
      void queueRelatedVideo(queue.index, relatedController.signal).finally(() => {
        if (trackAbort === relatedController) trackAbort = null;
      });
    }

    return () => {
      if (disposed) return;
      disposed = true;
      trackAbort?.abort();
      comments.cleanup();
      safeCleanup(nativeCleanup);
    };
  }

  function findUGCPlayerHost() {
    for (const selector of UGC_PLAYER_SELECTORS) {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) continue;

      if (element.matches(".m-video-player")) {
        const share = element.closest(".video-share");
        const normal = element.closest(".m-video-normal");
        if (share instanceof HTMLElement && normal instanceof HTMLElement) {
          return normal;
        }
      }
      return element;
    }
    return null;
  }

  function createUGCMount(preserve = null) {
    const host = findUGCPlayerHost();
    if (!(host instanceof HTMLElement)) {
      throw new Error("Unable to find the current Bilibili video container");
    }

    if (host.matches(".m-video-player")) {
      const originalPlayers = Array.from(
        host.querySelectorAll(
          ":scope > .player-container, :scope > [class*='player-container'], :scope > bilibili-player",
        ),
      ).filter((node) => node instanceof HTMLElement);
      return createPlayerMount(host, originalPlayers, preserve);
    }

    removeStalePlayerShells(host, preserve);
    const originalShare = host.querySelector(":scope > .video-share");
    return {
      host,
      before: originalShare || host.firstChild,
      originals: originalShare instanceof HTMLElement ? [originalShare] : [],
    };
  }

  function resolveUGCMount(preserve) {
    try {
      return createUGCMount(preserve);
    } catch {
      return null;
    }
  }


  async function initBangumiNativePlayer(routeContext) {
    const identifier = parseBangumiIdentifier(location.pathname);
    if (!identifier) return () => {};
    if (originalPageRequestedHere()) return () => {};
    void loadShaka();

    const { signal } = routeContext;
    const season = await getBangumiSeason(identifier, signal);
    routeContext.assertCurrent();

    const episodeGroups = collectBangumiEpisodeGroups(season);
    const episodes = episodeGroups.flatMap((group) => group.episodes);
    if (episodes.length === 0) throw new Error("Bilibili returned no playable episodes for this season");

    const episode =
      (identifier.type === "ep" && episodes.find((item) => Number(item.id) === identifier.id)) ||
      episodes.find((item) => Number(item.id) === Number(season.new_ep?.id)) ||
      episodes[0];
    const episodeGroup =
      episodeGroups.find((group) => group.episodes.some((item) => Number(item.id) === Number(episode.id))) ||
      episodeGroups[0];

    let source;
    try {
      source = await getBangumiPlaySource(episode, season, signal, {
        allowEmbedded: location.pathname === INITIAL_PATHNAME,
      });
    } catch (error) {
      if (error?.bangumiAccessRestricted || error?.bangumiNativeUnsupported) {
        console.warn(`${LOG_PREFIX} native Bangumi playback is unavailable; using Bilibili's official player`, error);
        document.documentElement?.classList.remove(BANGUMI_ACTIVE_CLASS);
        if (TAKEOVER_ACTIVE) openOriginalPage();
        return () => {};
      }
      throw error;
    }
    routeContext.assertCurrent();

    const body = await waitForAny(["body"], ELEMENT_TIMEOUT_MS, signal);
    routeContext.assertCurrent();

    document.querySelectorAll(".bm-bangumi-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(BANGUMI_ACTIVE_CLASS);

    const shell = createElement("main", "bm-bangumi-shell");
    shell.setAttribute("aria-label", t("bangumiPlayer"));
    applyUILanguage(shell);

    const header = createElement("header", "bm-bangumi-header");
    const backButton = createElement("button", "bm-bangumi-back");
    backButton.type = "button";
    backButton.setAttribute("aria-label", t("back"));
    backButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    `;
    backButton.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.href = "/";
    });

    const heading = createElement("div", "bm-bangumi-heading");
    setTakeoverTitle([season.title, formatBangumiEpisodeTitle(episode)].filter(Boolean).join(" "));
    const seasonTitle = createElement("h1", "bm-bangumi-title");
    seasonTitle.textContent = season.title || t("bangumiFallback");
    const episodeTitle = createElement("p", "bm-bangumi-current");
    episodeTitle.textContent = formatBangumiEpisodeTitle(episode);
    heading.append(seasonTitle, episodeTitle);

    const homeButton = createElement("a", "bm-bangumi-home");
    homeButton.href = "/";
    homeButton.setAttribute("aria-label", t("backToRecommendations"));
    homeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" />
      </svg>
    `;
    header.append(backButton, heading, homeButton);

    const content = createElement("section", "bm-bangumi-content");
    const playerHost = createElement("div", "bm-bangumi-player-host");
    const detailCard = createElement("section", "bm-bangumi-detail-card");

    const detailTop = createElement("div", "bm-bangumi-detail-top");
    const detailCopy = createElement("div", "bm-bangumi-detail-copy");
    const detailLabel = createElement("div", "bm-bangumi-detail-label");
    detailLabel.textContent = t("nowPlaying");
    const detailTitle = createElement("h2", "bm-bangumi-detail-title");
    detailTitle.textContent = season.title || t("bangumiFallback");
    const detailMeta = createElement("div", "bm-bangumi-detail-meta");
    detailMeta.textContent = formatEpisodeMeta(episodeGroup?.episodes.length || episodes.length);
    detailCopy.append(detailLabel, detailTitle, detailMeta);

    const badge = createElement("span", "bm-bangumi-badge");
    badge.textContent = `EP ${episode.id}`;
    detailTop.append(detailCopy, badge);

    const evaluateText = String(season.evaluate || season.subtitle || "").trim();
    if (evaluateText) {
      const evaluate = createElement("p", "bm-bangumi-evaluate");
      evaluate.textContent = evaluateText;
      detailCard.append(detailTop, evaluate);
    } else {
      detailCard.append(detailTop);
    }

    const episodeSection = createElement("section", "bm-bangumi-episodes");
    const episodeHeader = createElement("div", "bm-bangumi-episodes-header");
    const episodeHeading = createElement("h2", "bm-bangumi-episodes-title");
    episodeHeading.textContent = t("episodeSelection");
    const episodeCount = createElement("span", "bm-bangumi-episodes-count");
    episodeHeader.append(episodeHeading, episodeCount);

    const episodeTabs = createElement("div", "bm-bangumi-group-tabs");
    episodeTabs.setAttribute("role", "tablist");
    episodeTabs.setAttribute("aria-label", t("episodeSelection"));
    const episodePanels = createElement("div", "bm-bangumi-group-panels");
    const groupTabs = [];
    const groupPanels = [];
    let activeEpisodeGroupIndex = Math.max(0, episodeGroups.indexOf(episodeGroup));
    // The episode playing now; an in-place track change moves it.
    let currentEpisodeId = Number(episode.id);

    const activateEpisodeGroup = (requestedIndex, { focus = false, scrollCurrent = false } = {}) => {
      const index = Math.max(0, Math.min(Number(requestedIndex) || 0, episodeGroups.length - 1));
      activeEpisodeGroupIndex = index;
      episodeCount.textContent = `${episodeGroups[index]?.episodes.length || 0}`;
      for (let itemIndex = 0; itemIndex < groupTabs.length; itemIndex += 1) {
        const selected = itemIndex === index;
        const tab = groupTabs[itemIndex];
        const panel = groupPanels[itemIndex];
        tab.classList.toggle("is-current", selected);
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panel.hidden = !selected;
      }
      if (focus) groupTabs[index]?.focus();
      if (scrollCurrent) {
        requestAnimationFrame(() => {
          groupTabs[index]?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
          groupPanels[index]?.querySelector(".bm-bangumi-episode-button.is-current")?.scrollIntoView({
            behavior: "auto",
            block: "nearest",
            inline: "center",
          });
        });
      }
    };

    episodeGroups.forEach((group, groupIndex) => {
      const groupToken = `bm-bangumi-group-${groupIndex}`;
      const tab = createElement("button", "bm-bangumi-group-tab");
      tab.type = "button";
      tab.id = `${groupToken}-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `${groupToken}-panel`);
      tab.setAttribute("aria-selected", "false");
      const tabLabel = createElement("span", "bm-bangumi-group-tab-label");
      tabLabel.textContent = group.title;
      const tabCount = createElement("span", "bm-bangumi-group-tab-count");
      tabCount.textContent = `${group.episodes.length}`;
      tab.append(tabLabel, tabCount);
      tab.addEventListener("click", () => activateEpisodeGroup(groupIndex, { scrollCurrent: true }));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (groupIndex + 1) % episodeGroups.length;
        else if (event.key === "ArrowLeft") nextIndex = (groupIndex - 1 + episodeGroups.length) % episodeGroups.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = episodeGroups.length - 1;
        if (nextIndex == null) return;
        event.preventDefault();
        activateEpisodeGroup(nextIndex, { focus: true, scrollCurrent: true });
      });

      const panel = createElement("div", "bm-bangumi-group-panel");
      panel.id = `${groupToken}-panel`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.hidden = true;
      const episodeRail = createElement("div", "bm-bangumi-episode-rail");
      for (const item of group.episodes) {
        const button = createElement("button", "bm-bangumi-episode-button");
        button.type = "button";
        button.dataset.episodeId = String(item.id);
        button.textContent = compactBangumiEpisodeLabel(item);
        button.title = formatBangumiEpisodeTitle(item);
        if (Number(item.id) === Number(episode.id)) {
          button.classList.add("is-current");
          button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => {
          if (Number(item.id) === currentEpisodeId) return;
          // A queued episode switches inside the player, which keeps
          // fullscreen and the play state. Others rebuild the page.
          const queueIndex = playlist ? playlist.items.findIndex((entry) => Number(entry.episode.id) === Number(item.id)) : -1;
          if (queueIndex >= 0 && playlist.play) playlist.play(queueIndex);
          else history.pushState(history.state, "", `/bangumi/play/ep${item.id}`);
        });
        episodeRail.appendChild(button);
      }
      panel.appendChild(episodeRail);
      groupTabs.push(tab);
      groupPanels.push(panel);
      episodeTabs.appendChild(tab);
      episodePanels.appendChild(panel);
    });

    episodeSection.append(episodeHeader);
    if (episodeGroups.length > 1) episodeSection.appendChild(episodeTabs);
    episodeSection.appendChild(episodePanels);
    activateEpisodeGroup(activeEpisodeGroupIndex);

    content.append(playerHost, detailCard, episodeSection);
    shell.append(header, content);
    body.appendChild(shell);

    const seasonId = Number(season.season_id) || 0;
    const createEpisodeHistory = (item) => createWatchHistoryContext({
      aid: item.aid,
      bvid: item.bvid,
      cid: item.cid,
      epid: item.id,
      sid: seasonId,
      type: 4,
      subType: Number(season.type) || 0,
      duration: Number(item.duration) > 0 ? Number(item.duration) / 1000 : 0,
      referer: `https://www.bilibili.com/bangumi/play/ep${item.id}`,
    });
    // Lock-screen next/previous stays inside the current group, so finishing
    // the main episodes does not roll into trailers or specials.
    const groupItems = (episodeGroup?.episodes || []).map((item) => ({
      value: String(item.id),
      title: formatBangumiEpisodeTitle(item) || season.title || t("bangumiFallback"),
      href: `/bangumi/play/ep${item.id}`,
      poster: item.cover || season.cover || "",
      history: createEpisodeHistory(item),
      episode: item,
    }));
    const currentGroupIndex = groupItems.findIndex((item) => Number(item.episode.id) === Number(episode.id));
    const playlist = currentGroupIndex >= 0 && groupItems.length > 1
      ? {
          kind: "episodes",
          items: groupItems,
          index: currentGroupIndex,
          loadSource: (item, trackSignal) => getBangumiPlaySource(item.episode, season, trackSignal, {
            allowEmbedded: false,
          }),
          onTrackChange: (item) => showCurrentEpisode(item.episode),
        }
      : null;

    // The player has already swapped the media and recorded the new URL, so
    // bring the heading and the episode list up to date with it.
    function showCurrentEpisode(nextEpisode) {
      currentEpisodeId = Number(nextEpisode.id);
      const episodeLabel = formatBangumiEpisodeTitle(nextEpisode);
      setTakeoverTitle([season.title, episodeLabel].filter(Boolean).join(" "));
      episodeTitle.textContent = episodeLabel;
      badge.textContent = `EP ${nextEpisode.id}`;
      for (const button of episodePanels.querySelectorAll(".bm-bangumi-episode-button")) {
        const current = Number(button.dataset.episodeId) === currentEpisodeId;
        button.classList.toggle("is-current", current);
        if (current) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      const groupIndex = episodeGroups.findIndex((group) => group.episodes.some((item) => Number(item.id) === currentEpisodeId));
      activateEpisodeGroup(groupIndex >= 0 ? groupIndex : activeEpisodeGroupIndex, { scrollCurrent: true });
    }

    const nativeCleanup = renderNativePlayer({
      mount: createBangumiMount(playerHost),
      resolveMount: resolveBangumiMount,
      title: formatBangumiEpisodeTitle(episode) || season.title || t("bangumiFallback"),
      artist: season.title || t("bilibiliBangumi"),
      poster: episode.cover || season.cover || "",
      source,
      historyContext: createEpisodeHistory(episode),
      playlist,
      options: episodeGroups.flatMap((group) => group.episodes.map((item) => ({
        value: String(item.id),
        label: formatBangumiEpisodeTitle(item) || t("episodeFallback", { id: item.id }),
        group: group.title,
        selected: Number(item.id) === Number(episode.id),
      }))),
      onOptionChange(value) {
        history.pushState(history.state, "", `/bangumi/play/ep${value}`);
      },
    });

    requestAnimationFrame(() => activateEpisodeGroup(activeEpisodeGroupIndex, { scrollCurrent: true }));

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      safeCleanup(nativeCleanup);
      shell.remove();
      if (!document.querySelector(".bm-bangumi-shell")) {
        document.documentElement?.classList.remove(BANGUMI_ACTIVE_CLASS);
      }
    };
  }

  function formatBangumiEpisodeTitle(episode) {
    return [episode?.title, episode?.long_title].filter(Boolean).join(" · ") || t("episodeFallback", { id: episode?.id || "" });
  }

  function compactBangumiEpisodeLabel(episode) {
    const title = String(episode?.title || "").trim();
    const longTitle = String(episode?.long_title || "").trim();
    if (title && title.length <= 8) return title;
    if (longTitle && longTitle.length <= 10) return longTitle;
    return title || longTitle || t("episodeFallback", { id: episode?.id || "" });
  }

  function createBangumiMount(playerHost, preserve = null) {
    if (!(playerHost instanceof HTMLElement)) throw new Error("Unable to create the Bangumi player mount");
    removeStalePlayerShells(playerHost, preserve);
    return { host: playerHost, before: playerHost.firstChild, originals: [] };
  }

  function resolveBangumiMount(preserve) {
    const playerHost = document.querySelector(".bm-bangumi-player-host");
    if (!(playerHost instanceof HTMLElement)) return null;
    try {
      return createBangumiMount(playerHost, preserve);
    } catch {
      return null;
    }
  }

  function createPlayerMount(playerRoot, originalPlayers, preserve = null) {
    removeStalePlayerShells(playerRoot, preserve);
    const originals = originalPlayers.length
      ? originalPlayers
      : Array.from(playerRoot.children).filter(
          (node) =>
            node instanceof HTMLElement &&
            node !== preserve &&
            !node.classList.contains(`${SCRIPT_PREFIX}-player`),
        );
    return {
      host: playerRoot,
      before: playerRoot.firstChild,
      originals,
    };
  }

  function removeStalePlayerShells(host, preserve) {
    host.querySelectorAll(`:scope > .${SCRIPT_PREFIX}-player`).forEach((node) => {
      if (node !== preserve) node.remove();
    });
  }

  // === module: player ===
  // Render native video plus an audio-only path that can remain active when
  // Safari is backgrounded. The mode switch itself is always user-initiated,
  // which satisfies iOS media-playback gesture requirements.
  function renderNativePlayer({
    mount,
    resolveMount,
    title,
    artist = t("bilibili"),
    creatorUrl = "",
    creatorAvatar = "",
    poster,
    source,
    supplementalContent = null,
    options,
    onOptionChange,
    historyContext = null,
    playlist = null,
  }) {
    // These describe the track that is currently loaded. An in-place audio
    // track change (lock-screen next/previous) replaces all of them together.
    let candidates = Array.isArray(source?.candidates) ? [...source.candidates] : [];
    let audioCandidates = Array.isArray(source?.audioCandidates) ? source.audioCandidates : [];
    let loadProgressiveFallback = typeof source?.loadProgressiveFallback === "function"
      ? source.loadProgressiveFallback
      : null;
    let currentTitle = title;
    let currentArtist = artist;
    let currentCreatorUrl = creatorUrl;
    let currentCreatorAvatar = creatorAvatar;
    let currentPoster = sizedImage(poster || "", 1280, 720);
    let currentHistory = historyContext;
    if (candidates.length === 0) throw new Error("No playable native media candidates were provided");

    const shell = createElement("section", `${SCRIPT_PREFIX}-player`);
    shell.setAttribute("aria-label", t("nativePlayerAria"));
    applyUILanguage(shell);

    const videoBox = createElement("div", "bm-native-video-box");
    const video = document.createElement("video");
    video.className = "bm-native-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.poster = currentPoster;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x5-playsinline", "");
    video.setAttribute("x5-video-player-type", "h5-page");
    video.setAttribute("x-webkit-airplay", "allow");

    const audioView = createElement("div", "bm-audio-only-view");
    audioView.hidden = true;
    audioView.setAttribute("aria-label", t("audioOnlyPlayer"));

    const audioArtwork = document.createElement("img");
    audioArtwork.className = "bm-audio-only-artwork";
    audioArtwork.alt = "";
    audioArtwork.decoding = "async";
    audioArtwork.referrerPolicy = "no-referrer";
    if (currentPoster) audioArtwork.src = currentPoster;
    audioArtwork.hidden = !currentPoster;
    audioView.appendChild(audioArtwork);

    const audioScrim = createElement("div", "bm-audio-only-scrim");
    const audioPanel = createElement("div", "bm-audio-only-panel");
    const audioIcon = createElement("span", "bm-audio-only-icon");
    audioIcon.setAttribute("aria-hidden", "true");
    audioIcon.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M5 14v-2a7 7 0 0 1 14 0v2" />
        <path d="M5 14H3.8A1.8 1.8 0 0 0 2 15.8v2.4A1.8 1.8 0 0 0 3.8 20H5z" />
        <path d="M19 14h1.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H19z" />
      </svg>
    `;
    const audioCopy = createElement("div", "bm-audio-only-copy");
    const audioTitle = createElement("strong", "bm-audio-only-title");
    audioTitle.textContent = t("audioOnlyMode");
    const audioSubtitle = createElement("span", "bm-audio-only-subtitle");
    audioSubtitle.textContent = t("audioOnlySubtitle");
    audioCopy.append(audioTitle, audioSubtitle);

    // Keep the real media element outside Bilibili's replaceable app subtree.
    // Removing or reparenting an active HTMLMediaElement causes iOS Safari to
    // terminate its background playback session when the screen locks.
    const backgroundAudioHost = createElement("div", "bm-background-audio-host");
    const audio = document.createElement("audio");
    audio.className = "bm-native-audio";
    audio.controls = false;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("x-webkit-airplay", "allow");
    backgroundAudioHost.appendChild(audio);

    const audioTransport = createElement("div", "bm-audio-transport");
    const audioPlayButton = createElement("button", "bm-audio-play-button");
    audioPlayButton.type = "button";
    audioPlayButton.setAttribute("aria-label", t("playAudio"));
    audioPlayButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path class="bm-audio-play-glyph" d="M8 5.5v13l10-6.5z" />
        <path class="bm-audio-pause-glyph" d="M8 5.5h3v13H8zM14 5.5h3v13h-3z" />
      </svg>
    `;
    const audioTimeline = document.createElement("input");
    audioTimeline.className = "bm-audio-timeline";
    audioTimeline.type = "range";
    audioTimeline.min = "0";
    audioTimeline.max = "1";
    audioTimeline.step = "0.1";
    audioTimeline.value = "0";
    audioTimeline.setAttribute("aria-label", t("audioProgress"));
    const audioTime = createElement("span", "bm-audio-time");
    audioTime.textContent = "0:00 / 0:00";
    const createSkipButton = (className, label, path) => {
      const button = createElement("button", `bm-audio-skip-button ${className}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" /></svg>`;
      button.hidden = !playlist;
      return button;
    };
    const audioPreviousButton = createSkipButton("is-previous", t("previousTrack"), "M7 6v12M18 6.5v11l-8.5-5.5z");
    const audioNextButton = createSkipButton("is-next", t("nextTrack"), "M17 6v12M6 6.5v11l8.5-5.5z");
    audioTransport.append(audioPreviousButton, audioPlayButton, audioNextButton, audioTimeline, audioTime);

    audioPanel.append(audioIcon, audioCopy, audioTransport);
    audioView.append(audioScrim, audioPanel);

    const playerLoading = createElement("div", "bm-player-loading");
    playerLoading.setAttribute("role", "status");
    playerLoading.setAttribute("aria-live", "polite");
    const playerSpinner = createElement("span", "bm-player-spinner");
    playerSpinner.setAttribute("aria-hidden", "true");
    const playerLoadingText = createElement("span");
    playerLoadingText.textContent = t("loadingVideo");
    playerLoading.append(playerSpinner, playerLoadingText);

    const resumeToast = createElement("div", "bm-resume-toast");
    resumeToast.hidden = true;
    resumeToast.setAttribute("role", "status");
    resumeToast.setAttribute("aria-live", "polite");
    const resumeToastText = createElement("span", "bm-resume-toast-text");
    const resumeToastButton = createElement("button", "bm-resume-toast-button");
    resumeToastButton.type = "button";
    resumeToastButton.textContent = t("startOver");
    resumeToast.append(resumeToastText, resumeToastButton);
    videoBox.append(video, audioView, playerLoading, resumeToast);

    const meta = createElement("div", "bm-native-player-meta");
    const playerInfo = createElement("div", "bm-native-player-info");
    const playerKicker = createElement("div", "bm-native-player-kicker");
    playerKicker.textContent = t("nativePlayer");
    const playerTitleRow = createElement("div", "bm-native-player-title-row");
    const titleNode = createElement("div", "bm-native-player-title");
    const qualityNode = createElement("span", "bm-native-quality");
    qualityNode.hidden = true;
    playerTitleRow.append(titleNode, qualityNode);
    playerInfo.append(playerKicker, playerTitleRow);

    // A queue can move to another creator's video, so the creator row is
    // built whenever a queue exists and is hidden while it has no profile.
    let creatorLink = null;
    let creatorImage = null;
    let creatorName = null;
    if (creatorUrl || playlist) {
      creatorLink = createElement("a", "bm-native-player-creator");
      creatorImage = document.createElement("img");
      creatorImage.className = "bm-native-player-creator-avatar";
      creatorImage.alt = "";
      creatorImage.loading = "eager";
      creatorImage.decoding = "async";
      creatorImage.referrerPolicy = "no-referrer";
      creatorName = createElement("span", "bm-native-player-creator-name");
      const creatorDisclosure = createElement("span", "bm-native-player-creator-disclosure");
      creatorDisclosure.setAttribute("aria-hidden", "true");
      creatorDisclosure.textContent = "›";
      creatorLink.append(creatorImage, creatorName, creatorDisclosure);
      playerInfo.appendChild(creatorLink);
      renderCreator();
    }

    function renderCreator() {
      if (!creatorLink) return;
      if (currentCreatorUrl) creatorLink.href = currentCreatorUrl;
      else creatorLink.removeAttribute("href");
      creatorLink.hidden = !currentCreatorUrl;
      creatorLink.setAttribute("aria-label", t("openCreatorProfile", { name: currentArtist }));
      creatorLink.title = t("openCreatorProfile", { name: currentArtist });
      creatorName.textContent = currentArtist;
      if (currentCreatorAvatar) creatorImage.src = sizedImage(currentCreatorAvatar, 96, 96);
      else creatorImage.removeAttribute("src");
      creatorImage.hidden = !currentCreatorAvatar;
    }

    // `replace` describes a whole new creator (a track change); otherwise only
    // the fields that arrived are filled in (late video details).
    function setCreator(details = {}, { replace = false } = {}) {
      const name = String(details?.name || "").trim();
      const url = String(details?.url || "");
      const avatar = String(details?.avatar || "");
      if (replace || name) currentArtist = name || t("bilibili");
      if (replace || url) currentCreatorUrl = url;
      if (replace || avatar) currentCreatorAvatar = avatar;
      renderCreator();
      updateMediaSessionMetadata();
    }

    const playerActions = createElement("div", "bm-native-player-actions");
    let selector = null;
    // A page that owns a queue (collection videos, parts) describes the picker
    // itself, since its entries change as the queue moves to another video.
    // Those options carry queue indexes instead of page values.
    const usesPlaylistPicker = typeof playlist?.getPickerEntries === "function";
    if (usesPlaylistPicker || options.length > 1) {
      selector = createElement("select", "bm-native-selector");
      selector.setAttribute("aria-label", usesPlaylistPicker ? t("selectPlaylistVideo") : t("selectEpisodePart"));
      selector.addEventListener("change", () => {
        if (usesPlaylistPicker) {
          const index = Number(selector.value);
          if (Number.isInteger(index)) void changeTrack(index, { reason: "select" });
          return;
        }
        // A queued item is swapped in place, which keeps fullscreen and lets
        // audio-only playback carry on. Anything else rebuilds the page.
        const playlistIndex = findPlaylistIndex(selector.value);
        if (playlistIndex >= 0) {
          void changeTrack(playlistIndex, { reason: "select" });
          return;
        }
        onOptionChange?.(selector.value);
      });
      playerActions.appendChild(selector);
    }

    function renderSelectorOptions() {
      if (!selector) return;
      const entries = usesPlaylistPicker
        ? playlist.getPickerEntries(playlistIndex).map((entry) => ({
            value: String(entry.index),
            label: entry.label,
            group: entry.group,
            selected: entry.index === playlistIndex,
          }))
        : options;
      const optionGroups = new Map();
      selector.replaceChildren();
      for (const item of entries) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        option.selected = item.selected;
        const groupLabel = String(item.group || "").trim();
        if (!groupLabel) {
          selector.appendChild(option);
          continue;
        }
        let optionGroup = optionGroups.get(groupLabel);
        if (!optionGroup) {
          optionGroup = document.createElement("optgroup");
          optionGroup.label = groupLabel;
          optionGroups.set(groupLabel, optionGroup);
          selector.appendChild(optionGroup);
        }
        optionGroup.appendChild(option);
      }
      selector.hidden = entries.length <= 1;
    }

    // Keep the picker on the track that is playing now.
    function syncSelector() {
      if (!selector) return;
      if (usesPlaylistPicker) renderSelectorOptions();
      else if (playlist?.items[playlistIndex]) selector.value = playlist.items[playlistIndex].value;
    }

    const qualitySelector = createElement("select", "bm-native-quality-selector");
    qualitySelector.setAttribute("aria-label", t("selectVideoQuality"));
    qualitySelector.hidden = true;
    playerActions.appendChild(qualitySelector);

    const audioModeButton = createElement("button", "bm-audio-mode-button");
    audioModeButton.type = "button";
    audioModeButton.title = t("audioOnly");
    audioModeButton.setAttribute("aria-label", t("switchAudioMode"));
    audioModeButton.setAttribute("aria-pressed", "false");
    audioModeButton.disabled = audioCandidates.length === 0;
    audioModeButton.hidden = audioCandidates.length === 0;
    audioModeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 14v-2a7 7 0 0 1 14 0v2" />
        <path d="M5 14H3.8A1.8 1.8 0 0 0 2 15.8v2.4A1.8 1.8 0 0 0 3.8 20H5z" />
        <path d="M19 14h1.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H19z" />
      </svg>
      <span>${t("audioOnly")}</span>
    `;
    playerActions.appendChild(audioModeButton);

    const autoplayButton = createElement("button", "bm-audio-mode-button bm-autoplay-button");
    autoplayButton.type = "button";
    autoplayButton.title = t("autoplay");
    // Collections, parts and episodes always continue to their next item. The
    // switch only decides whether a single video continues into a related one.
    autoplayButton.hidden = playlist?.kind !== "autoplay";
    autoplayButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5v9l7-4.5z" />
        <path d="M12 7.5v9l7-4.5z" />
      </svg>
      <span>${t("autoplay")}</span>
    `;
    playerActions.appendChild(autoplayButton);

    function updateAutoplayButton() {
      const enabled = isAutoplayEnabled();
      autoplayButton.classList.toggle("is-active", enabled);
      autoplayButton.setAttribute("aria-pressed", String(enabled));
      autoplayButton.setAttribute("aria-label", enabled ? t("autoplayOn") : t("autoplayOff"));
    }

    function toggleAutoplay() {
      setAutoplayEnabled(!isAutoplayEnabled());
      updateAutoplayButton();
      updateTrackControls();
      prefetchNextTrack();
    }

    // iPhone Safari exposes video fullscreen through the WebKit video API.
    // Keep this as a direct click handler: WebKit rejects fullscreen requests
    // that are not made synchronously from a user gesture.
    const fullscreenButton = createElement("button", "bm-fullscreen-button");
    fullscreenButton.type = "button";
    fullscreenButton.title = t("fullscreen");
    fullscreenButton.setAttribute("aria-label", t("enterFullscreen"));
    fullscreenButton.disabled = true;
    fullscreenButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      </svg>
      <span>${t("fullscreen")}</span>
    `;
    playerActions.appendChild(fullscreenButton);
    meta.append(playerInfo, playerActions);

    const errorBox = createElement("div", "bm-player-error");
    errorBox.hidden = true;
    errorBox.setAttribute("role", "alert");
    shell.append(videoBox, meta, errorBox);
    if (supplementalContent instanceof Node) shell.appendChild(supplementalContent);

    let currentMount = mount;
    let sourceIndex = 0;
    let audioSourceIndex = 0;
    let audioLoadedIndex = -1;
    let mode = "video";
    let disposed = false;
    let syncFrame = 0;
    let topOffsetFrame = 0;
    let pendingAudioTime = 0;
    let resumeAudioAfterLoad = false;
    let backgroundPlaybackExpected = false;
    let hiddenAt = 0;
    let wasPlayingBeforeHidden = false;
    let backgroundResumeConsumed = false;
    let backgroundResumeTimer = 0;
    let lastExplicitAudioAction = "pause";
    let lastAudioPlayingAt = 0;
    let videoPlaybackExpected = false;
    let lastMediaPositionUpdateAt = 0;
    let dashPlayer = null;
    let dashManifestUrl = "";
    let currentDashCandidate = null;
    let selectedQualityMode = "auto";
    let progressiveFallbackLoaded = false;
    let progressiveFallbackPromise = null;
    let videoFallbackPromise = null;
    let pendingVideoRestore = null;
    let videoLoadToken = 0;
    let observedPlayerRoot = null;
    let observedPlayerHost = null;
    let dashLoadedToken = 0;
    const playerAbort = new AbortController();
    let historyReporter = createWatchHistoryReporter(currentHistory);
    let resumeToken = 0;
    let resumeTarget = null;
    let resumeToastTimer = 0;
    let playlistIndex = playlist ? playlist.index : -1;
    let trackChangeToken = 0;
    // True once an in-place audio track change has left the surrounding page
    // (comments, episode list, the paused <video>) describing an older track.
    // Only happens when the page has no onTrackChange hook to follow along.
    let trackStale = false;
    // True once an in-place audio track change has left only the paused
    // <video> on an older stream; the page itself already follows along.
    let videoSourcesStale = false;
    // While a track change is in flight, events from the outgoing media (its
    // pause, a last timeupdate) must not reach the incoming track's history
    // reporter. The next loadedmetadata re-enables reporting.
    let reporterSuspended = false;
    const trackSourceCache = new Map();
    const originalPlayers = new Set();
    const visibleAncestors = new Map();
    const forcedAncestorStyles = {
      display: "block",
      visibility: "visible",
      width: "100%",
      height: "auto",
      "min-height": "0",
      overflow: "visible",
    };

    const domObserver = new MutationObserver(() => {
      if (mode === "audio" && document.hidden) return;
      if (!shell.isConnected) schedulePlayerSync();
    });
    const rootObserver = new MutationObserver(() => {
      if (mode === "audio" && document.hidden) return;
      if (!shell.isConnected || !observedPlayerRoot?.isConnected) schedulePlayerSync();
    });
    const visibilityObserver = new MutationObserver(() => {
      if (mode === "audio" && document.hidden) return;
      if (!isPlayerVisible()) schedulePlayerSync();
    });
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          if (mode === "audio" && document.hidden) return;
          if (entries.some((entry) => entry.contentRect.width <= 0 || entry.contentRect.height <= 0)) {
            schedulePlayerSync();
          }
        })
      : null;

    function isPlayerVisible() {
      if (!shell.isConnected || shell.getClientRects().length === 0) return false;
      const computed = getComputedStyle(shell);
      return computed.display !== "none" && computed.visibility !== "hidden";
    }

    function schedulePlayerSync() {
      if (disposed || syncFrame) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        syncPlayerDom();
      });
    }

    function observePlayerMount(host) {
      const nextRoot = host.closest?.("#app") || document.querySelector("#app") || document.body || document.documentElement;
      if (nextRoot instanceof Node && nextRoot !== observedPlayerRoot) {
        observedPlayerRoot = nextRoot;
        domObserver.disconnect();
        domObserver.observe(nextRoot, { childList: true, subtree: true });
      }
      if (host !== observedPlayerHost) {
        observedPlayerHost = host;
        resizeObserver?.disconnect();
        resizeObserver?.observe(shell);
        resizeObserver?.observe(host);
      }
    }

    function observeVisibilityChain(host) {
      visibilityObserver.disconnect();
      for (let ancestor = host; ancestor instanceof HTMLElement; ancestor = ancestor.parentElement) {
        visibilityObserver.observe(ancestor, {
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
        });
        if (ancestor === document.documentElement) break;
      }
    }

    function rememberOriginalPlayers(originals) {
      for (const original of originals || []) {
        if (!(original instanceof HTMLElement) || original === shell) continue;
        originalPlayers.add(original);
        original.classList.add("bm-original-player-hidden");
      }
    }

    function forceVisibleAncestors(host) {
      for (let ancestor = host; ancestor instanceof HTMLElement && ancestor.id !== "app"; ancestor = ancestor.parentElement) {
        const computed = getComputedStyle(ancestor);
        if (computed.display !== "none" && computed.visibility !== "hidden") continue;

        let savedProperties = visibleAncestors.get(ancestor);
        if (!savedProperties) {
          savedProperties = Object.keys(forcedAncestorStyles).map((property) => ({
            property,
            originalValue: ancestor.style.getPropertyValue(property),
            originalPriority: ancestor.style.getPropertyPriority(property),
            appliedValue: "",
            appliedPriority: "",
          }));
          visibleAncestors.set(ancestor, savedProperties);
        }

        ancestor.classList.add(`${SCRIPT_PREFIX}-video-ancestor-visible`);
        for (const saved of savedProperties) {
          ancestor.style.setProperty(saved.property, forcedAncestorStyles[saved.property], "important");
          saved.appliedValue = ancestor.style.getPropertyValue(saved.property);
          saved.appliedPriority = ancestor.style.getPropertyPriority(saved.property);
        }
      }
    }

    function applyMount(nextMount) {
      const host = nextMount?.host;
      if (!(host instanceof HTMLElement) || !host.isConnected) return false;

      currentMount = nextMount;
      rememberOriginalPlayers(nextMount.originals);

      if (shell.parentElement !== host) {
        const preferredBefore =
          nextMount.before instanceof Node && nextMount.before.parentNode === host && nextMount.before !== shell
            ? nextMount.before
            : host.firstChild;
        host.insertBefore(shell, preferredBefore || null);
      }

      document.documentElement?.classList.add(VIDEO_ACTIVE_CLASS);
      forceVisibleAncestors(host);
      observePlayerMount(host);
      observeVisibilityChain(host);
      syncTopOffset();
      return true;
    }

    // Bilibili's video page keeps its own fixed header. Rather than guessing its
    // height, measure whatever fixed or sticky bar covers the top of the
    // viewport and push the player down by exactly the overlap.
    function measureFixedHeaderBottom() {
      if (typeof document.elementsFromPoint !== "function") return 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      let bottom = 0;
      for (const x of [12, viewportWidth / 2, Math.max(12, viewportWidth - 12)]) {
        for (const element of document.elementsFromPoint(x, 1)) {
          if (!(element instanceof HTMLElement) || shell.contains(element)) continue;
          for (let node = element; node instanceof HTMLElement && node !== document.body; node = node.parentElement) {
            const position = getComputedStyle(node).position;
            if (position !== "fixed" && position !== "sticky") continue;
            const rect = node.getBoundingClientRect();
            // Ignore full-screen overlays; a header is a short bar at the top.
            if (rect.top <= 1 && rect.height > 0 && rect.height < viewportHeight * 0.35) {
              bottom = Math.max(bottom, rect.bottom);
            }
            break;
          }
        }
      }
      return bottom;
    }

    function syncTopOffset() {
      if (disposed || topOffsetFrame) return;
      // Coalesce resize and DOM notifications into one measurement per frame.
      topOffsetFrame = window.requestAnimationFrame(() => {
        topOffsetFrame = 0;
        try {
          applyTopOffset();
        } catch (error) {
          console.debug(`${LOG_PREFIX} unable to measure the page header`, error);
        }
      });
    }

    function applyTopOffset() {
      if (disposed || !shell.isConnected) return;
      // Only the regular video page sits under Bilibili's header.
      if (!shell.parentElement?.closest(".m-video-player, .m-video-normal")) {
        shell.style.removeProperty("--bm-player-top-offset");
        return;
      }
      // Headers can hide while scrolling; only measure near the top of the page.
      if (window.scrollY > 4 && shell.style.getPropertyValue("--bm-player-top-offset")) return;
      const applied = Number.parseFloat(shell.style.getPropertyValue("--bm-player-top-offset")) || 0;
      const naturalTop = shell.getBoundingClientRect().top + window.scrollY - applied;
      const offset = Math.max(0, Math.ceil(measureFixedHeaderBottom() - naturalTop));
      if (Math.abs(offset - applied) >= 1 || !shell.style.getPropertyValue("--bm-player-top-offset")) {
        shell.style.setProperty("--bm-player-top-offset", `${offset}px`);
      }
    }

    function syncPlayerDom() {
      if (disposed || (mode === "audio" && document.hidden)) return;
      let nextMount = currentMount;
      try {
        nextMount = resolveMount?.(shell) || currentMount;
      } catch (error) {
        console.warn(`${LOG_PREFIX} unable to resolve the current player mount`, error);
      }
      applyMount(nextMount);
    }

    function activeMedia() {
      return mode === "audio" ? audio : video;
    }

    function updateSourceLabel(candidate) {
      titleNode.textContent = currentTitle;
      qualityNode.textContent = candidate?.qualityLabel || "";
      qualityNode.hidden = !candidate?.qualityLabel;
    }

    function showPlayerLoading(message) {
      playerLoadingText.textContent = message || (mode === "audio" ? t("loadingAudio") : t("loadingVideo"));
      playerLoading.hidden = false;
    }

    function hidePlayerLoading() {
      playerLoading.hidden = true;
    }

    function configureAudioSession() {
      try {
        if (PAGE_NAVIGATOR.audioSession && "type" in PAGE_NAVIGATOR.audioSession) {
          PAGE_NAVIGATOR.audioSession.type = "playback";
        }
      } catch (error) {
        console.debug(`${LOG_PREFIX} unable to select the page playback audio session`, error);
      }
    }

    function clearBackgroundResumeTimer() {
      if (!backgroundResumeTimer) return;
      window.clearTimeout(backgroundResumeTimer);
      backgroundResumeTimer = 0;
    }

    function playAudio({ explicit = false } = {}) {
      configureAudioSession();
      if (explicit) lastExplicitAudioAction = "play";
      backgroundPlaybackExpected = true;
      return audio.play();
    }

    function pauseAudio({ explicit = true } = {}) {
      if (explicit) lastExplicitAudioAction = "pause";
      backgroundPlaybackExpected = false;
      wasPlayingBeforeHidden = false;
      clearBackgroundResumeTimer();
      audio.pause();
    }

    function updateMediaSessionMetadata() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_MEDIA_METADATA !== "function") return;
      try {
        PAGE_NAVIGATOR.mediaSession.metadata = new PAGE_MEDIA_METADATA({
          title: currentTitle,
          artist: currentArtist,
          album: mode === "audio" ? t("audioAlbum") : "Bilibili",
          artwork: currentPoster
            ? [
                { src: currentPoster, sizes: "512x512" },
                { src: currentPoster, sizes: "256x256" },
              ]
            : [],
        });
      } catch (error) {
        console.debug(`${LOG_PREFIX} unable to set media-session metadata`, error);
      }
    }

    function updateMediaSessionState({ forcePosition = false } = {}) {
      if (!("mediaSession" in PAGE_NAVIGATOR)) return;
      const media = activeMedia();
      try {
        PAGE_NAVIGATOR.mediaSession.playbackState = media.paused ? "paused" : "playing";
      } catch {
      }
      if (typeof PAGE_NAVIGATOR.mediaSession.setPositionState !== "function") return;
      if (!Number.isFinite(media.duration) || media.duration <= 0 || !Number.isFinite(media.currentTime)) return;
      const now = performance.now();
      if (!forcePosition && now - lastMediaPositionUpdateAt < MEDIA_SESSION_POSITION_INTERVAL_MS) return;
      lastMediaPositionUpdateAt = now;
      try {
        PAGE_NAVIGATOR.mediaSession.setPositionState({
          duration: media.duration,
          playbackRate: media.playbackRate || 1,
          position: Math.min(Math.max(media.currentTime, 0), media.duration),
        });
      } catch {
      }
    }

    function seekActiveMedia(seconds) {
      const media = activeMedia();
      if (!Number.isFinite(media.duration)) return;
      media.currentTime = Math.min(Math.max(media.currentTime + seconds, 0), media.duration);
      updateMediaSessionState({ forcePosition: true });
    }

    function installMediaSessionHandlers() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      const handlers = {
        play: () => {
          if (mode === "audio") playAudio({ explicit: true }).catch(() => {});
          else video.play().catch(() => {});
        },
        pause: () => {
          if (mode === "audio") pauseAudio({ explicit: true });
          else video.pause();
        },
        stop: () => {
          if (mode === "audio") pauseAudio({ explicit: true });
          else video.pause();
        },
        seekbackward: (details) => seekActiveMedia(-(details.seekOffset || 15)),
        seekforward: (details) => seekActiveMedia(details.seekOffset || 15),
        seekto: (details) => {
          if (!Number.isFinite(details.seekTime)) return;
          activeMedia().currentTime = details.seekTime;
          updateMediaSessionState({ forcePosition: true });
        },
      };
      for (const [action, handler] of Object.entries(handlers)) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, handler);
        } catch {
        }
      }
    }

    function clearMediaSessionHandlers() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      for (const action of ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"]) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, null);
        } catch {
        }
      }
    }

    // === player: watch history & resume ===
    function currentPlaybackSnapshot() {
      const media = activeMedia();
      const mediaDuration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
      return {
        time: Number.isFinite(media.currentTime) ? media.currentTime : 0,
        duration: mediaDuration || Number(currentHistory?.duration) || 0,
        playing: !media.paused && !media.ended,
      };
    }

    function flushWatchHistory({ beacon = false } = {}) {
      historyReporter?.flush(currentPlaybackSnapshot(), { beacon });
    }

    function hideResumeToast() {
      if (resumeToastTimer) window.clearTimeout(resumeToastTimer);
      resumeToastTimer = 0;
      resumeToast.hidden = true;
    }

    function showResumeToast(seconds) {
      hideResumeToast();
      resumeToastText.textContent = t("resumedAt", { time: formatMediaTime(seconds) });
      resumeToast.hidden = false;
      resumeToastTimer = window.setTimeout(hideResumeToast, RESUME_TOAST_MS);
    }

    function startOverFromToast() {
      hideResumeToast();
      const media = activeMedia();
      setMediaTime(media, 0);
      if (media === audio) pendingAudioTime = 0;
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function requestResume(context, { handoff = null } = {}) {
      const token = ++resumeToken;
      resumeTarget = null;
      hideResumeToast();
      if (!context) return;
      if (handoff) {
        resumeTarget = {
          token,
          seconds: Number(handoff.time) || 0,
          silent: true,
          play: Boolean(handoff.shouldPlay),
        };
        applyResumeTarget();
        return;
      }
      resolveResumePosition(context, playerAbort.signal).then(
        (seconds) => {
          if (disposed || token !== resumeToken || seconds == null) return;
          resumeTarget = { token, seconds, silent: false, play: false };
          applyResumeTarget();
        },
        (error) => {
          if (!isAbortError(error)) console.debug(`${LOG_PREFIX} unable to look up the resume position`, error);
        },
      );
    }

    function applyResumeTarget() {
      const target = resumeTarget;
      if (!target || disposed || target.token !== resumeToken) return;
      const media = activeMedia();
      if (media.readyState < HTMLMediaElement.HAVE_METADATA) return;
      if (media === video) {
        // A source fallback restores its own position, and Shaka sets the
        // start position while loading, so wait for either to settle.
        if (pendingVideoRestore) return;
        if (currentDashCandidate && dashLoadedToken !== videoLoadToken) return;
      }
      resumeTarget = null;

      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
      if (isResumablePosition(target.seconds, duration) && (media.currentTime || 0) <= RESUME_MIN_SECONDS) {
        setMediaTime(media, target.seconds);
        if (media === audio) pendingAudioTime = target.seconds;
        if (!target.silent) showResumeToast(target.seconds);
      }
      if (target.play && media.paused) {
        const request = media === audio ? playAudio({ explicit: false }) : media.play();
        request?.catch?.(() => {});
      }
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    // === player: playlist (next / previous track) ===
    function findPlaylistIndex(value) {
      if (!playlist) return -1;
      return playlist.items.findIndex((item) => item.value === String(value));
    }

    function hasTrack(delta) {
      const index = playlistIndex + delta;
      return Boolean(playlist) && index >= 0 && index < playlist.items.length;
    }

    function updateTrackControls() {
      const hasPrevious = hasTrack(-1);
      const hasNext = hasTrack(1);
      audioPreviousButton.disabled = !hasPrevious;
      audioNextButton.disabled = !hasNext;
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      // Registering these replaces the ±15 s skip buttons on the iOS lock
      // screen, so only offer them when there is somewhere to go.
      for (const [action, available, delta] of [["previoustrack", hasPrevious, -1], ["nexttrack", hasNext, 1]]) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, available ? () => skipTrack(delta) : null);
        } catch {
        }
      }
    }

    function setCurrentPoster(url) {
      currentPoster = sizedImage(String(url || ""), 1280, 720);
      video.poster = currentPoster;
      if (currentPoster) audioArtwork.src = currentPoster;
      else audioArtwork.removeAttribute("src");
      audioArtwork.hidden = !currentPoster;
    }

    function loadTrackSource(index) {
      const item = playlist.items[index];
      const now = Date.now();
      // Signed URLs expire; discard stale entries even when another track is requested.
      for (const [key, cachedEntry] of trackSourceCache) {
        if (now - cachedEntry.at >= TRACK_PREFETCH_TTL_MS) trackSourceCache.delete(key);
      }
      const cached = trackSourceCache.get(item.value);
      if (cached) {
        // Keep recently used tracks when bounding the prefetch cache.
        trackSourceCache.delete(item.value);
        trackSourceCache.set(item.value, cached);
        return cached.promise;
      }
      const entry = { at: now, promise: null };
      entry.promise = Promise.resolve().then(() => playlist.loadSource(item, playerAbort.signal));
      entry.promise.catch(() => {
        if (trackSourceCache.get(item.value) === entry) trackSourceCache.delete(item.value);
      });
      trackSourceCache.set(item.value, entry);
      // Six entries cover nearby parts without retaining a long video's entire playlist.
      while (trackSourceCache.size > 6) {
        trackSourceCache.delete(trackSourceCache.keys().next().value);
      }
      return entry.promise;
    }

    // A related-video pick only plays by itself while Autoplay is on. The
    // next/previous controls still reach it either way.
    function canAutoAdvance() {
      if (!hasTrack(1)) return false;
      return !playlist.items[playlistIndex + 1].autoplay || isAutoplayEnabled();
    }

    // Signed media URLs are fetched ahead of time so that, when a track ends
    // on a locked phone, the next one can start without waiting on the API.
    // Video mode waits until the current track is close to its end instead,
    // so watching one video does not cost a second play-URL request.
    function prefetchNextTrack({ force = false } = {}) {
      if (!playlist || disposed || (mode !== "audio" && !force) || !canAutoAdvance()) return;
      loadTrackSource(playlistIndex + 1).catch((error) => {
        if (!isAbortError(error)) console.debug(`${LOG_PREFIX} next track prefetch failed`, error);
      });
    }

    function skipTrack(delta) {
      if (!hasTrack(delta)) return;
      // Like most music players, "previous" first restarts the current track.
      if (delta < 0 && (activeMedia().currentTime || 0) > 3) {
        setMediaTime(activeMedia(), 0);
        updateAudioControls();
        updateMediaSessionState({ forcePosition: true });
        return;
      }
      void changeTrack(playlistIndex + delta, { reason: "skip" });
    }

    // Loads another queue item into the same media elements in both modes.
    // Reusing the <video> keeps iOS fullscreen and lets the next item start
    // after "ended" without a new tap, which a freshly built player would
    // need. Reusing the <audio> keeps background playback alive.
    async function changeTrack(index, { reason = "skip" } = {}) {
      if (!playlist || disposed || index === playlistIndex || index < 0 || index >= playlist.items.length) return;
      const item = playlist.items[index];
      const audioMode = mode === "audio";

      const token = ++trackChangeToken;
      const previous = {
        index: playlistIndex,
        title: currentTitle,
        poster: currentPoster,
        history: currentHistory,
        reporter: historyReporter,
        creator: { name: currentArtist, url: currentCreatorUrl, avatar: currentCreatorAvatar },
      };
      // An automatic advance already reported the old track as finished.
      if (reason !== "auto") flushWatchHistory();
      reporterSuspended = true;
      // Silence the old video while the next source resolves. The new load
      // carries its own play intent, so this pause does not cancel it.
      if (!audioMode) video.pause();

      // Show the new track right away so the page and lock screen reflect the tap.
      playlistIndex = index;
      currentTitle = item.title || currentTitle;
      if (item.creator) setCreator(item.creator, { replace: true });
      setCurrentPoster(item.poster || currentPoster);
      currentHistory = item.history || null;
      historyReporter = createWatchHistoryReporter(currentHistory);
      resumeTarget = null;
      hideResumeToast();
      syncSelector();
      updateSourceLabel(null);
      updateTrackControls();
      updateMediaSessionMetadata();
      showPlayerLoading(audioMode ? t("loadingAudio") : t("loadingVideo"));
      if (audioMode) {
        backgroundPlaybackExpected = true;
        lastExplicitAudioAction = "play";
      }

      let nextSource = null;
      let failure = null;
      try {
        nextSource = await loadTrackSource(index);
        const playable = audioMode ? nextSource?.audioCandidates : nextSource?.candidates;
        if (!Array.isArray(playable) || playable.length === 0) {
          failure = new Error(audioMode ? "The selected track has no audio-only stream" : "The selected track has no video stream");
        }
      } catch (error) {
        failure = error;
      }
      if (disposed || token !== trackChangeToken) return;

      if (failure) {
        if (!isAbortError(failure)) console.warn(`${LOG_PREFIX} unable to switch tracks in place`, failure);
        playlistIndex = previous.index;
        currentTitle = previous.title;
        setCurrentPoster(previous.poster);
        setCreator(previous.creator, { replace: true });
        currentHistory = previous.history;
        historyReporter = previous.reporter;
        reporterSuspended = false;
        syncSelector();
        updateSourceLabel(audioMode ? audioCandidates[audioSourceIndex] : candidates[sourceIndex]);
        updateTrackControls();
        updateMediaSessionMetadata();
        hidePlayerLoading();
        // In the foreground, fall back to a full page change for this track;
        // that page shows its own error and recovery options.
        if (!document.hidden && !isAbortError(failure)) history.pushState(history.state, "", item.href);
        return;
      }

      candidates = Array.isArray(nextSource.candidates) ? [...nextSource.candidates] : [];
      audioCandidates = Array.isArray(nextSource.audioCandidates) ? nextSource.audioCandidates : [];
      loadProgressiveFallback = typeof nextSource.loadProgressiveFallback === "function"
        ? nextSource.loadProgressiveFallback
        : null;
      progressiveFallbackLoaded = false;
      progressiveFallbackPromise = null;
      videoFallbackPromise = null;
      sourceIndex = 0;
      audioSourceIndex = 0;
      // Forces the other element to reload when the viewer switches modes.
      audioLoadedIndex = -1;
      audioModeButton.disabled = audioCandidates.length === 0;
      audioModeButton.hidden = audioCandidates.length === 0;

      recordLocationWithoutRoute(item.href);
      requestResume(currentHistory);
      if (audioMode) {
        // Release the paused video of the previous track.
        videoLoadToken += 1;
        pendingVideoRestore = null;
        void destroyDashPlayback();
        currentDashCandidate = null;
        video.removeAttribute("src");
        video.load();
        // With a page hook the page follows along, so switching back to video
        // only has to reload the stream. Without one, rebuild the route then.
        if (playlist.onTrackChange) videoSourcesStale = true;
        else trackStale = true;
        loadCurrentAudioSource(0, true);
      } else {
        videoSourcesStale = false;
        const playbackRate = Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1;
        void loadCurrentSource({ currentTime: 0, playbackRate, shouldPlay: true });
      }
      playlist.onTrackChange?.(item, index);
      prefetchNextTrack();
    }

    function updateFullscreenAvailability() {
      if (mode === "audio") {
        fullscreenButton.hidden = true;
        fullscreenButton.disabled = true;
        return;
      }

      const webkitVideoFullscreen =
        typeof video.webkitEnterFullscreen === "function" && video.webkitSupportsFullscreen !== false;
      const elementFullscreen =
        typeof video.requestFullscreen === "function" || typeof video.webkitRequestFullscreen === "function";
      const supported = webkitVideoFullscreen || elementFullscreen;

      fullscreenButton.hidden = !supported;
      fullscreenButton.disabled = !supported || video.readyState < HTMLMediaElement.HAVE_METADATA;
    }

    function enterFullscreen() {
      if (fullscreenButton.disabled || mode !== "video") return;

      try {
        if (typeof video.webkitEnterFullscreen === "function" && video.webkitSupportsFullscreen !== false) {
          video.webkitEnterFullscreen();
          return;
        }

        if (typeof video.requestFullscreen === "function") {
          const request = video.requestFullscreen();
          request?.catch?.((error) => console.warn(`${LOG_PREFIX} fullscreen request failed`, error));
          return;
        }

        if (typeof video.webkitRequestFullscreen === "function") {
          video.webkitRequestFullscreen();
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} fullscreen request failed`, error);
      }
    }

    function setMediaTime(media, time) {
      if (!Number.isFinite(time) || time < 0 || media.readyState < HTMLMediaElement.HAVE_METADATA) return;
      try {
        media.currentTime = Math.min(time, Number.isFinite(media.duration) ? media.duration : time);
      } catch {
      }
    }

    function loadCurrentAudioSource(time = pendingAudioTime, shouldPlay = resumeAudioAfterLoad) {
      const candidate = audioCandidates[audioSourceIndex];
      if (!candidate?.url) {
        switchToVideo(false);
        audioModeButton.disabled = true;
        audioModeButton.hidden = true;
        return;
      }

      pendingAudioTime = Number.isFinite(time) ? time : 0;
      resumeAudioAfterLoad = Boolean(shouldPlay);
      audioLoadedIndex = audioSourceIndex;
      showPlayerLoading(t("loadingAudio"));
      updateSourceLabel(candidate);
      audio.src = candidate.url;
      audio.dataset.sourceIndex = String(audioSourceIndex);
      audio.dataset.quality = String(candidate.quality || "");
      audio.load();
      setMediaTime(audio, pendingAudioTime);
      if (resumeAudioAfterLoad) {
        playAudio().catch((error) => {
          if (error?.name !== "AbortError") {
            console.debug(`${LOG_PREFIX} audio playback is waiting for user interaction`, error);
          }
        });
      }
    }

    function updateModeButton() {
      const audioActive = mode === "audio";
      audioModeButton.classList.toggle("is-active", audioActive);
      audioModeButton.setAttribute("aria-pressed", String(audioActive));
      audioModeButton.title = audioActive ? t("watchVideo") : t("audioOnly");
      audioModeButton.setAttribute("aria-label", audioActive ? t("switchVideoMode") : t("switchAudioMode"));
      audioModeButton.querySelector("span").textContent = audioActive ? t("watchVideo") : t("audioOnly");
      playerKicker.textContent = audioActive ? t("audioBackground") : t("nativePlayer");
      shell.classList.toggle("is-audio-mode", audioActive);
    }

    function switchToAudio() {
      if (mode === "audio" || audioCandidates.length === 0) return;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const shouldPlay = !video.paused && !video.ended;
      configureAudioSession();
      video.pause();
      mode = "audio";
      lastExplicitAudioAction = shouldPlay ? "play" : "pause";
      backgroundPlaybackExpected = shouldPlay;
      video.hidden = true;
      audioView.hidden = false;
      updateModeButton();
      updateFullscreenAvailability();
      updateMediaSessionMetadata();
      if (audioLoadedIndex !== audioSourceIndex || !audio.src) {
        loadCurrentAudioSource(time, shouldPlay);
      } else {
        setMediaTime(audio, time);
        updateSourceLabel(audioCandidates[audioSourceIndex]);
        if (shouldPlay) playAudio().catch(() => {});
      }
      updateMediaSessionState();
      prefetchNextTrack();
    }

    function switchToVideo(transferPlayback = true) {
      if (mode === "video") return;
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const shouldPlay = transferPlayback && !audio.paused && !audio.ended;
      if (trackStale) {
        // The page around the player still describes an earlier track, so
        // rebuild it for the current one and continue from the same position.
        pauseAudio();
        rebuildRouteWithHandoff({
          key: currentHistory ? watchProgressKey(currentHistory) : "",
          time,
          shouldPlay,
        });
        return;
      }
      if (videoSourcesStale) {
        // The page already follows the current track; only the <video> still
        // holds an earlier track's stream, so load the current one here.
        videoSourcesStale = false;
        resumeAudioAfterLoad = false;
        pauseAudio();
        mode = "video";
        audioView.hidden = true;
        video.hidden = false;
        updateModeButton();
        updateFullscreenAvailability();
        updateMediaSessionMetadata();
        void loadCurrentSource({ currentTime: time, playbackRate: 1, shouldPlay });
        return;
      }
      resumeAudioAfterLoad = false;
      pauseAudio();
      mode = "video";
      audioView.hidden = true;
      video.hidden = false;
      setMediaTime(video, time);
      updateSourceLabel(candidates[sourceIndex]);
      if (dashPlayer) updateDashQualityLabel(dashPlayer);
      updateModeButton();
      updateFullscreenAvailability();
      updateMediaSessionMetadata();
      if (shouldPlay) video.play().catch(() => {});
      hidePlayerLoading();
      updateMediaSessionState();
    }

    function toggleAudioMode() {
      if (mode === "audio") switchToVideo(true);
      else switchToAudio();
    }

    async function destroyDashPlayback() {
      const player = dashPlayer;
      dashPlayer = null;
      if (player) {
        try {
          await player.destroy();
        } catch (error) {
          console.debug(`${LOG_PREFIX} DASH player cleanup failed`, error);
        }
      }
      if (dashManifestUrl) {
        URL.revokeObjectURL(dashManifestUrl);
        dashManifestUrl = "";
      }
      try {
        video.disableRemotePlayback = false;
      } catch {
      }
    }

    function configureQualitySelector(candidate) {
      qualitySelector.replaceChildren();
      const options = Array.isArray(candidate?.qualityOptions) ? candidate.qualityOptions : [];
      if (candidate?.kind !== "dash" || options.length === 0) {
        qualitySelector.hidden = true;
        return;
      }
      if (!options.some((item) => item.value === selectedQualityMode)) selectedQualityMode = "auto";
      for (const item of options) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        option.selected = item.value === selectedQualityMode;
        qualitySelector.appendChild(option);
      }
      qualitySelector.hidden = false;
    }

    function applyQualitySelection(player = dashPlayer) {
      if (!player) return;
      const auto = selectedQualityMode === "auto";
      player.configure({ abr: { enabled: auto } });
      if (!auto) {
        const track = chooseQualityTrack(player.getVariantTracks(), selectedQualityMode);
        if (track) player.selectVariantTrack(track, true, 0);
      }
      window.setTimeout(() => updateDashQualityLabel(player), 0);
    }

    function onQualitySelectionChange() {
      selectedQualityMode = qualitySelector.value || "auto";
      applyQualitySelection();
    }

    function updateDashQualityLabel(player = dashPlayer) {
      if (!player || mode !== "video") return;
      try {
        const active = player.getVariantTracks().find((track) => track.active);
        if (!active) return;
        const parts = [];
        if (active.height) parts.push(`${active.height}P`);
        if (Number(active.frameRate) > 30) parts.push(`${Math.round(active.frameRate)}fps`);
        if (active.hdr && active.hdr !== "SDR") parts.push(active.hdr);
        if (currentDashCandidate?.audioLabel) parts.push(currentDashCandidate.audioLabel);
        parts.push(selectedQualityMode === "auto" ? t("autoDash") : "DASH");
        qualityNode.textContent = parts.join(" · ");
        qualityNode.hidden = false;
      } catch {
      }
    }

    function captureVideoPlaybackState() {
      const pending = pendingVideoRestore?.state;
      const currentTime = Number.isFinite(video.currentTime) && video.currentTime > 0
        ? video.currentTime
        : Number(pending?.currentTime || 0);
      const playbackRate = Number.isFinite(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : Number(pending?.playbackRate || 1);
      return {
        currentTime,
        playbackRate,
        shouldPlay: Boolean(
          pending?.shouldPlay || (mode === "video" && videoPlaybackExpected && !video.ended),
        ),
      };
    }

    function restoreVideoPlaybackState(state, token = videoLoadToken) {
      if (!state || disposed || token !== videoLoadToken || video.readyState < HTMLMediaElement.HAVE_METADATA) {
        return false;
      }
      if (pendingVideoRestore?.token === token) pendingVideoRestore = null;
      setMediaTime(video, Number(state.currentTime));
      if (Number.isFinite(state.playbackRate) && state.playbackRate > 0) {
        try {
          video.playbackRate = state.playbackRate;
        } catch {
        }
      }
      if (state.shouldPlay && mode === "video") {
        video.play().catch((error) => {
          if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") {
            console.debug(`${LOG_PREFIX} unable to resume video after source fallback`, error);
          }
        });
      }
      return true;
    }

    function onVideoLoadedMetadata() {
      if (mode === "video") reporterSuspended = false;
      updateFullscreenAvailability();
      const pending = pendingVideoRestore;
      if (pending) restoreVideoPlaybackState(pending.state, pending.token);
      applyResumeTarget();
    }

    async function loadLazyProgressiveFallback(error, restoreState = null) {
      if (!loadProgressiveFallback || progressiveFallbackLoaded) return false;
      if (!progressiveFallbackPromise) {
        if (mode === "video") showPlayerLoading(t("dashFallbackLoading"));
        const request = (async () => {
          const fallback = await loadProgressiveFallback();
          progressiveFallbackLoaded = true;
          const existingURLs = new Set(candidates.map((candidate) => candidate?.url).filter(Boolean));
          const additions = (fallback?.candidates || []).filter((candidate) => {
            if (!candidate?.url || existingURLs.has(candidate.url)) return false;
            existingURLs.add(candidate.url);
            return true;
          });
          if (additions.length === 0) return -1;
          const firstFallbackIndex = candidates.length;
          candidates.push(...additions);
          return firstFallbackIndex;
        })().catch((fallbackError) => {
          if (!isAbortError(fallbackError)) {
            console.warn(`${LOG_PREFIX} lazy progressive fallback failed`, fallbackError, error);
          }
          return -1;
        });
        const sharedRequest = request.finally(() => {
          if (progressiveFallbackPromise === sharedRequest) progressiveFallbackPromise = null;
        });
        progressiveFallbackPromise = sharedRequest;
      }

      const firstFallbackIndex = await progressiveFallbackPromise;
      if (firstFallbackIndex < 0 || disposed) return false;
      sourceIndex = firstFallbackIndex;
      void loadCurrentSource(restoreState);
      return true;
    }

    function advanceVideoSource(error, restoreState = captureVideoPlaybackState()) {
      if (disposed) return Promise.resolve(false);
      if (videoFallbackPromise) return videoFallbackPromise;

      const failedIndex = sourceIndex;
      const task = (async () => {
        console.warn(`${LOG_PREFIX} video source failed; trying fallback`, error);
        if (sourceIndex === failedIndex) sourceIndex = failedIndex + 1;
        if (sourceIndex < candidates.length) {
          void loadCurrentSource(restoreState);
          return true;
        }
        if (await loadLazyProgressiveFallback(error, restoreState)) return true;
        if (mode === "audio") {
          console.warn(`${LOG_PREFIX} video candidates failed while audio-only mode remained available`);
        } else {
          showPlayerFailure(t("playbackFailed"));
        }
        return false;
      })();

      const sharedFallback = task.finally(() => {
        if (videoFallbackPromise === sharedFallback) videoFallbackPromise = null;
      });
      videoFallbackPromise = sharedFallback;
      return sharedFallback;
    }

    async function loadCurrentSource(restoreState = null) {
      const candidate = candidates[sourceIndex];
      if (!candidate || (candidate.kind !== "dash" && !candidate.url)) {
        if (await loadLazyProgressiveFallback(new Error("No current media candidate"), restoreState)) return;
        showPlayerFailure(t("allMediaFailed"));
        return;
      }

      const token = ++videoLoadToken;
      pendingVideoRestore = restoreState ? { token, state: restoreState } : null;
      videoBox.hidden = false;
      meta.hidden = false;
      errorBox.hidden = true;
      if (mode === "video") showPlayerLoading(candidate.kind === "dash" ? t("loadingHighQualityDash") : t("loadingVideo"));
      updateSourceLabel(mode === "audio" ? audioCandidates[audioSourceIndex] : candidate);
      configureQualitySelector(candidate);

      await destroyDashPlayback();
      if (disposed || token !== videoLoadToken || candidate !== candidates[sourceIndex]) return;

      if (candidate.kind !== "dash") {
        currentDashCandidate = null;
        video.src = candidate.url;
        video.dataset.sourceIndex = String(sourceIndex);
        video.dataset.quality = String(candidate.quality || "");
        video.dataset.sourceType = "progressive";
        video.load();
        updateFullscreenAvailability();
        return;
      }

      currentDashCandidate = candidate;
      if (!isDashPlaybackSupported()) {
        void advanceVideoSource(new Error("DASH playback is not supported by this Safari version"), restoreState);
        return;
      }

      try {
        ensureShakaPolyfills();
        video.removeAttribute("src");
        video.load();
        video.dataset.sourceIndex = String(sourceIndex);
        video.dataset.quality = String(candidate.quality || "");
        video.dataset.sourceType = "dash";
        video.disableRemotePlayback = true;

        const player = new (getShaka().Player)();
        dashPlayer = player;
        const retryParameters = {
          maxAttempts: 4,
          baseDelay: 500,
          backoffFactor: 2,
          fuzzFactor: 0.3,
          timeout: 20_000,
          stallTimeout: 7_000,
          connectionTimeout: 10_000,
        };
        player.configure({
          abr: {
            enabled: selectedQualityMode === "auto",
            defaultBandwidthEstimate: 12_000_000,
            useNetworkInformation: true,
          },
          manifest: { retryParameters },
          streaming: {
            bufferingGoal: 18,
            rebufferingGoal: 2,
            bufferBehind: 12,
            segmentPrefetchLimit: 2,
            retryParameters,
          },
        });
        player.addEventListener("adaptation", () => updateDashQualityLabel(player));
        player.addEventListener("variantchanged", () => updateDashQualityLabel(player));
        player.addEventListener("error", (event) => {
          const detail = event?.detail;
          const critical = detail?.severity == null ||
            detail.severity === getShaka()?.util?.Error?.Severity?.CRITICAL;
          if (critical && player === dashPlayer && token === videoLoadToken) {
            void advanceVideoSource(detail || new Error("DASH playback failed"));
          }
        });

        await player.attach(video);
        if (disposed || token !== videoLoadToken || player !== dashPlayer) {
          await player.destroy().catch(() => {});
          return;
        }
        dashManifestUrl = URL.createObjectURL(new Blob([candidate.manifest], { type: "application/dash+xml" }));
        const startTime = Number.isFinite(restoreState?.currentTime) && restoreState.currentTime > 0
          ? restoreState.currentTime
          : null;
        await player.load(dashManifestUrl, startTime, "application/dash+xml");
        if (disposed || token !== videoLoadToken || player !== dashPlayer) return;
        applyQualitySelection(player);
        restoreVideoPlaybackState(restoreState, token);
        dashLoadedToken = token;
        applyResumeTarget();
        updateDashQualityLabel(player);
        updateFullscreenAvailability();
      } catch (error) {
        if (disposed || token !== videoLoadToken) return;
        const fallbackState = restoreState || captureVideoPlaybackState();
        await destroyDashPlayback();
        if (token !== videoLoadToken) return;
        void advanceVideoSource(error, fallbackState);
      }
    }

    function onVideoError() {
      if (disposed) return;
      if (candidates[sourceIndex]?.kind === "dash" || dashPlayer) return;
      if (mode === "video") hidePlayerLoading();
      void advanceVideoSource(video.error || new Error("HTML5 video playback failed"));
    }

    function onAudioError() {
      if (disposed || mode !== "audio") return;
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : pendingAudioTime;
      const shouldPlay = resumeAudioAfterLoad || backgroundPlaybackExpected || !audio.paused;
      audioSourceIndex += 1;
      if (audioSourceIndex < audioCandidates.length) {
        loadCurrentAudioSource(time, shouldPlay);
      } else {
        console.warn(`${LOG_PREFIX} all audio-only media URLs failed`);
        switchToVideo(false);
        audioModeButton.disabled = true;
        audioModeButton.hidden = true;
      }
    }

    function onAudioMetadata() {
      if (mode !== "audio") return;
      reporterSuspended = false;
      setMediaTime(audio, pendingAudioTime);
      if (resumeAudioAfterLoad && audio.paused) playAudio({ explicit: false }).catch(() => {});
      applyResumeTarget();
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function onActiveMediaReady(event) {
      if (event.currentTarget !== activeMedia()) return;
      if (event.currentTarget === audio) resumeAudioAfterLoad = false;
      hidePlayerLoading();
      updateMediaSessionState({ forcePosition: true });
    }

    function onActiveMediaWaiting(event) {
      if (event.currentTarget !== activeMedia()) return;
      showPlayerLoading();
    }

    function formatMediaTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
      const total = Math.floor(seconds);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const remaining = total % 60;
      return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
        : `${minutes}:${String(remaining).padStart(2, "0")}`;
    }

    function updateAudioControls() {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const current = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, duration || audio.currentTime) : 0;
      audioTimeline.max = String(duration || 1);
      if (!audioTimeline.matches(":active")) audioTimeline.value = String(current);
      audioTime.textContent = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
      const playing = !audio.paused && !audio.ended;
      audioPlayButton.classList.toggle("is-playing", playing);
      audioPlayButton.setAttribute("aria-label", playing ? t("pauseAudio") : t("playAudio"));
    }

    function toggleAudioPlayback() {
      if (audio.paused || audio.ended) playAudio({ explicit: true }).catch(() => {});
      else pauseAudio({ explicit: true });
    }

    function seekAudioFromControl() {
      const target = Number(audioTimeline.value);
      if (!Number.isFinite(target)) return;
      setMediaTime(audio, target);
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function scheduleBackgroundResume() {
      if (
        disposed ||
        mode !== "audio" ||
        !document.hidden ||
        !backgroundPlaybackExpected ||
        !wasPlayingBeforeHidden ||
        backgroundResumeConsumed ||
        audio.ended ||
        Date.now() - hiddenAt > BACKGROUND_PAUSE_GRACE_MS ||
        lastExplicitAudioAction === "pause"
      ) return;
      backgroundResumeConsumed = true;
      clearBackgroundResumeTimer();
      backgroundResumeTimer = window.setTimeout(() => {
        backgroundResumeTimer = 0;
        if (!audio.paused || audio.ended || !document.hidden || !backgroundPlaybackExpected) return;
        configureAudioSession();
        playAudio({ explicit: false }).catch((error) => {
          console.debug(`${LOG_PREFIX} one-time background audio recovery was rejected`, error);
        });
      }, 350);
    }

    function onDocumentVisibilityChange() {
      if (document.hidden) {
        hiddenAt = Date.now();
        wasPlayingBeforeHidden = mode === "audio" && !audio.ended &&
          (!audio.paused || Date.now() - lastAudioPlayingAt < 1_000);
        backgroundResumeConsumed = false;
        configureAudioSession();
        updateMediaSessionMetadata();
        updateMediaSessionState({ forcePosition: true });
        flushWatchHistory();
        if (audio.paused) scheduleBackgroundResume();
        return;
      }
      hiddenAt = 0;
      wasPlayingBeforeHidden = false;
      backgroundResumeConsumed = false;
      clearBackgroundResumeTimer();
    }

    function onPageHide() {
      flushWatchHistory({ beacon: true });
      if (mode !== "audio" || !backgroundPlaybackExpected) return;
      configureAudioSession();
      updateMediaSessionState({ forcePosition: true });
    }

    function onMediaEnded(event) {
      if (event.currentTarget !== activeMedia()) return;
      historyReporter?.onEnded(currentPlaybackSnapshot());
    }

    // Runs after onMediaEnded, which has already reported the finished track.
    function onVideoEnded() {
      if (mode !== "video" || disposed) return;
      if (canAutoAdvance()) void changeTrack(playlistIndex + 1, { reason: "auto" });
    }

    function onVideoProgress() {
      if (mode !== "video" || disposed || !Number.isFinite(video.duration)) return;
      if (video.duration - video.currentTime <= VIDEO_PREFETCH_LEAD_SECONDS) prefetchNextTrack({ force: true });
    }

    function onAudioEnded() {
      if (mode !== "audio" || disposed) return;
      // The old track really ended even if advancing fails. Its reporter resets
      // on replay, so record completion once before changeTrack replaces it.
      historyReporter?.onEnded(currentPlaybackSnapshot());
      if (canAutoAdvance()) {
        // Keep the background session alive and move straight to the next
        // part or episode on the same <audio> element.
        void changeTrack(playlistIndex + 1, { reason: "auto" });
        return;
      }
      backgroundPlaybackExpected = false;
      wasPlayingBeforeHidden = false;
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function onMediaStateChange(event) {
      if (event.currentTarget !== activeMedia()) return;
      if (historyReporter && !reporterSuspended) {
        const snapshot = currentPlaybackSnapshot();
        if (event.type === "play") historyReporter.onPlay(snapshot);
        else if (event.type === "pause") historyReporter.onPause(snapshot);
        else if (event.type === "timeupdate") historyReporter.onTick(snapshot);
      }
      if (event.currentTarget === video) {
        if (event.type === "play") videoPlaybackExpected = true;
        else if (event.type === "pause" && !video.error) videoPlaybackExpected = false;
      }
      if (event.currentTarget === audio) {
        if (!audio.paused && !audio.ended) {
          configureAudioSession();
          backgroundPlaybackExpected = true;
          lastAudioPlayingAt = Date.now();
          if (!document.hidden) lastExplicitAudioAction = "play";
        } else if (event.type === "pause") {
          scheduleBackgroundResume();
        }
        updateAudioControls();
      }
      updateMediaSessionState({ forcePosition: event.type !== "timeupdate" });
    }

    function showPlayerFailure(message) {
      pendingVideoRestore = null;
      videoPlaybackExpected = false;
      videoBox.hidden = true;
      meta.hidden = true;
      errorBox.hidden = false;
      errorBox.replaceChildren();
      const messageNode = createElement("div");
      messageNode.textContent = message;
      const restore = createElement("button", "bm-button");
      restore.type = "button";
      restore.textContent = t("useBilibiliPlayer");
      restore.addEventListener("click", () => {
        try {
          sessionStorage.setItem(BILIBILI_PLAYER_OPT_IN_KEY, location.pathname);
        } catch {
        }
        cleanup();
        releaseBilibiliPlayer();
      }, { once: true });
      errorBox.append(messageNode, restore);
    }

    if (!applyMount(mount)) throw new Error("Unable to mount the native player in the current page");
    document.documentElement.appendChild(backgroundAudioHost);
    rootObserver.observe(document.body || document.documentElement, { childList: true });
    configureAudioSession();
    installMediaSessionHandlers();
    updateMediaSessionMetadata();

    video.addEventListener("error", onVideoError);
    video.addEventListener("loadedmetadata", onVideoLoadedMetadata);
    audio.addEventListener("error", onAudioError);
    audio.addEventListener("loadedmetadata", onAudioMetadata);
    video.addEventListener("ended", onMediaEnded);
    video.addEventListener("ended", onVideoEnded);
    video.addEventListener("timeupdate", onVideoProgress);
    audio.addEventListener("ended", onAudioEnded);
    document.addEventListener("visibilitychange", onDocumentVisibilityChange, true);
    PAGE_WINDOW.addEventListener("pagehide", onPageHide, true);
    for (const media of [video, audio]) {
      media.addEventListener("loadstart", onActiveMediaWaiting);
      media.addEventListener("waiting", onActiveMediaWaiting);
      media.addEventListener("stalled", onActiveMediaWaiting);
      media.addEventListener("seeking", onActiveMediaWaiting);
      media.addEventListener("canplay", onActiveMediaReady);
      media.addEventListener("playing", onActiveMediaReady);
      media.addEventListener("seeked", onActiveMediaReady);
      media.addEventListener("play", onMediaStateChange);
      media.addEventListener("pause", onMediaStateChange);
      media.addEventListener("durationchange", onMediaStateChange);
      media.addEventListener("ratechange", onMediaStateChange);
      media.addEventListener("timeupdate", onMediaStateChange);
    }
    qualitySelector.addEventListener("change", onQualitySelectionChange);
    audioModeButton.addEventListener("click", toggleAudioMode);
    autoplayButton.addEventListener("click", toggleAutoplay);
    audioPlayButton.addEventListener("click", toggleAudioPlayback);
    audioTimeline.addEventListener("input", seekAudioFromControl);
    fullscreenButton.addEventListener("click", enterFullscreen);
    audioPreviousButton.addEventListener("click", onPreviousTrackClick);
    audioNextButton.addEventListener("click", onNextTrackClick);
    resumeToastButton.addEventListener("click", startOverFromToast);
    updateModeButton();
    updateFullscreenAvailability();
    updateTrackControls();
    renderSelectorOptions();
    updateAutoplayButton();
    if (playlist) {
      // Let the page drive this player: its list plays an item in place, and
      // late video details fill in the creator and extend the queue.
      playlist.play = (index) => void changeTrack(index, { reason: "select" });
      playlist.setCreator = (details) => setCreator(details);
      playlist.refresh = () => {
        renderSelectorOptions();
        updateTrackControls();
        prefetchNextTrack();
      };
    }
    window.addEventListener("resize", syncTopOffset, { passive: true });
    window.addEventListener("orientationchange", syncTopOffset, { passive: true });
    const topOffsetTimers = [300, 1200, 3000].map((delay) => window.setTimeout(syncTopOffset, delay));
    requestResume(currentHistory, {
      handoff: currentHistory ? takePlayerHandoff(watchProgressKey(currentHistory)) : null,
    });
    void loadCurrentSource();

    function onPreviousTrackClick() {
      skipTrack(-1);
    }

    function onNextTrackClick() {
      skipTrack(1);
    }

    function cleanup() {
      if (disposed) return;
      window.removeEventListener("resize", syncTopOffset);
      window.removeEventListener("orientationchange", syncTopOffset);
      topOffsetTimers.forEach((timer) => window.clearTimeout(timer));
      flushWatchHistory();
      disposed = true;
      playerAbort.abort();
      trackChangeToken += 1;
      trackSourceCache.clear();
      resumeTarget = null;
      hideResumeToast();
      videoLoadToken += 1;
      pendingVideoRestore = null;
      progressiveFallbackPromise = null;
      videoFallbackPromise = null;
      void destroyDashPlayback();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (topOffsetFrame) window.cancelAnimationFrame(topOffsetFrame);
      domObserver.disconnect();
      rootObserver.disconnect();
      visibilityObserver.disconnect();
      resizeObserver?.disconnect();
      clearMediaSessionHandlers();
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("loadedmetadata", onVideoLoadedMetadata);
      video.removeEventListener("ended", onMediaEnded);
      video.removeEventListener("ended", onVideoEnded);
      video.removeEventListener("timeupdate", onVideoProgress);
      audio.removeEventListener("error", onAudioError);
      audio.removeEventListener("loadedmetadata", onAudioMetadata);
      audio.removeEventListener("ended", onAudioEnded);
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange, true);
      PAGE_WINDOW.removeEventListener("pagehide", onPageHide, true);
      for (const media of [video, audio]) {
        media.removeEventListener("loadstart", onActiveMediaWaiting);
        media.removeEventListener("waiting", onActiveMediaWaiting);
        media.removeEventListener("stalled", onActiveMediaWaiting);
        media.removeEventListener("seeking", onActiveMediaWaiting);
        media.removeEventListener("canplay", onActiveMediaReady);
        media.removeEventListener("playing", onActiveMediaReady);
        media.removeEventListener("seeked", onActiveMediaReady);
        media.removeEventListener("play", onMediaStateChange);
        media.removeEventListener("pause", onMediaStateChange);
        media.removeEventListener("durationchange", onMediaStateChange);
        media.removeEventListener("ratechange", onMediaStateChange);
        media.removeEventListener("timeupdate", onMediaStateChange);
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
      qualitySelector.removeEventListener("change", onQualitySelectionChange);
      audioModeButton.removeEventListener("click", toggleAudioMode);
      autoplayButton.removeEventListener("click", toggleAutoplay);
      if (playlist) {
        playlist.play = null;
        playlist.setCreator = null;
        playlist.refresh = null;
      }
      audioPlayButton.removeEventListener("click", toggleAudioPlayback);
      audioTimeline.removeEventListener("input", seekAudioFromControl);
      fullscreenButton.removeEventListener("click", enterFullscreen);
      audioPreviousButton.removeEventListener("click", onPreviousTrackClick);
      audioNextButton.removeEventListener("click", onNextTrackClick);
      resumeToastButton.removeEventListener("click", startOverFromToast);
      backgroundPlaybackExpected = false;
      videoPlaybackExpected = false;
      clearBackgroundResumeTimer();
      backgroundAudioHost.remove();
      shell.remove();

      for (const [ancestor, properties] of visibleAncestors) {
        ancestor.classList.remove(`${SCRIPT_PREFIX}-video-ancestor-visible`);
        for (const saved of properties) {
          const currentValue = ancestor.style.getPropertyValue(saved.property);
          const currentPriority = ancestor.style.getPropertyPriority(saved.property);
          if (currentValue !== saved.appliedValue || currentPriority !== saved.appliedPriority) continue;
          if (saved.originalValue) {
            ancestor.style.setProperty(saved.property, saved.originalValue, saved.originalPriority);
          } else {
            ancestor.style.removeProperty(saved.property);
          }
        }
      }

      for (const original of originalPlayers) {
        original.classList.remove("bm-original-player-hidden");
      }

      if (!document.querySelector(`.${SCRIPT_PREFIX}-player`)) {
        document.documentElement?.classList.remove(VIDEO_ACTIVE_CLASS);
      }
    }

    return cleanup;
  }

  // === module: watch-history ===
  // Reports playback to the signed-in account's watch history using the same
  // heartbeat the desktop web player sends, and resumes from the position the
  // account last recorded.
  function createWatchHistoryContext({ aid, bvid = "", cid, epid = 0, sid = 0, type = 3, subType = 0, duration = 0, referer = "" }) {
    const numericAid = Number(aid) || 0;
    const numericCid = Number(cid) || 0;
    if (!numericAid || !numericCid) return null;
    return Object.freeze({
      aid: numericAid,
      bvid: String(bvid || ""),
      cid: numericCid,
      epid: Number(epid) || 0,
      sid: Number(sid) || 0,
      type: Number(type) || 3,
      subType: Number(subType) || 0,
      duration: Math.max(0, Number(duration) || 0),
      referer: String(referer || "https://www.bilibili.com/"),
    });
  }

  function watchProgressKey(context) {
    return `${context.aid}:${context.cid}`;
  }

  function isResumablePosition(seconds, duration) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < RESUME_MIN_SECONDS) return false;
    const total = Number(duration);
    return !(Number.isFinite(total) && total > 0 && value > total - RESUME_END_MARGIN_SECONDS);
  }

  async function getRemoteWatchProgress(context, signal) {
    const params = { aid: String(context.aid), cid: String(context.cid) };
    if (context.epid) params.ep_id = String(context.epid);
    if (context.sid) params.season_id = String(context.sid);
    const data = await requestSignedWbiData("/x/player/wbi/v2", params, {
      endpoint: "player progress",
      headers: { Referer: context.referer },
      signal,
      legacyUrl: `https://api.bilibili.com/x/player/v2?${new URLSearchParams(params)}`,
    });
    const lastCid = Number(data?.last_play_cid) || 0;
    const lastTimeMs = Number(data?.last_play_time) || 0;
    if (lastCid !== context.cid || lastTimeMs <= 0) return null;
    return lastTimeMs / 1000;
  }

  async function resolveResumePosition(context, signal) {
    if (!context || !isLoggedIn()) return null;
    try {
      const remote = await getRemoteWatchProgress(context, signal);
      return remote != null && isResumablePosition(remote, context.duration) ? remote : null;
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.debug(`${LOG_PREFIX} account watch position is unavailable`, error);
      return null;
    }
  }

  function sendBeaconForm(url, fields) {
    try {
      if (typeof navigator.sendBeacon !== "function") return false;
      const body = new Blob([new URLSearchParams(fields).toString()], {
        type: "application/x-www-form-urlencoded",
      });
      return navigator.sendBeacon(url, body);
    } catch {
      return false;
    }
  }

  function createWatchHistoryReporter(context) {
    if (!context) return null;
    const HEARTBEAT_URL = "https://api.bilibili.com/x/click-interface/web/heartbeat";
    const LEGACY_REPORT_URL = "https://api.bilibili.com/x/v2/history/report";
    let started = false;
    let finished = false;
    let startTs = 0;
    let realPlayed = 0;
    let maxProgress = 0;
    let lastObservedTime = null;
    let lastSentAt = 0;
    let lastSentSignature = "";

    function observe(snapshot) {
      const time = Number(snapshot.time) || 0;
      if (snapshot.playing && lastObservedTime != null) {
        const delta = time - lastObservedTime;
        if (delta > 0 && delta < 3) realPlayed += delta;
      }
      lastObservedTime = time;
      maxProgress = Math.max(maxProgress, time);
    }

    function reportLegacy(fields, progress) {
      if (context.type !== 3) return;
      void gmPostFormJSON(
        LEGACY_REPORT_URL,
        { aid: fields.aid, cid: fields.cid, progress, platform: "web", csrf: fields.csrf },
        { headers: { Origin: "https://www.bilibili.com", Referer: context.referer } },
      ).catch((error) => console.debug(`${LOG_PREFIX} watch history report failed`, error));
    }

    function send(snapshot, playType, { ended = false, beacon = false } = {}) {
      const duration = Number(snapshot.duration) || context.duration || 0;
      lastSentAt = Date.now();
      if (!isLoggedIn()) return;
      const csrf = getCookieValue("bili_jct");
      if (!csrf) return;

      const position = Math.max(0, Math.floor(Number(snapshot.time) || 0));
      // A pause followed by a flush (screen lock, route change) would
      // otherwise send the same report twice.
      const signature = `${ended ? -1 : position}:${playType === 0 ? 0 : 2}`;
      if (signature === lastSentSignature && playType !== 1 && playType !== 3) return;
      lastSentSignature = signature;
      const realSeconds = Math.floor(realPlayed);
      const fields = {
        aid: context.aid,
        cid: context.cid,
        mid: getCurrentUserId(),
        played_time: ended ? -1 : position,
        realtime: realSeconds,
        real_played_time: realSeconds,
        video_duration: Math.round(duration),
        last_play_progress_time: position,
        max_play_progress_time: Math.floor(maxProgress),
        start_ts: startTs || Math.floor(Date.now() / 1000),
        type: context.type,
        sub_type: context.subType,
        dt: 2,
        outer: 0,
        play_type: playType,
        refer_url: context.referer,
        csrf,
      };
      if (context.bvid) fields.bvid = context.bvid;
      if (context.epid) fields.epid = context.epid;
      if (context.sid) fields.sid = context.sid;

      if (beacon && sendBeaconForm(HEARTBEAT_URL, fields)) return;
      void gmPostFormJSON(HEARTBEAT_URL, fields, {
        headers: { Origin: "https://www.bilibili.com", Referer: context.referer },
      })
        .then((response) => {
          if (!response || response.code !== 0) throw createBilibiliAPIError(response, "watch heartbeat");
        })
        .catch((error) => {
          console.debug(`${LOG_PREFIX} watch heartbeat failed`, error);
          reportLegacy(fields, ended ? Math.round(duration) : position);
        });
    }

    return {
      context,
      onPlay(snapshot) {
        observe(snapshot);
        if (finished) {
          // Replaying after the end starts a fresh viewing.
          finished = false;
          started = false;
        }
        if (!started) {
          started = true;
          startTs = Math.floor(Date.now() / 1000);
          send(snapshot, 1);
        } else {
          send(snapshot, 3);
        }
      },
      onPause(snapshot) {
        observe(snapshot);
        if (started && !finished) send(snapshot, 2);
      },
      onTick(snapshot) {
        if (!started && snapshot.playing) {
          // Swapping the source of an already-playing element does not always
          // fire a new "play" event, so the first playing tick starts the view.
          this.onPlay(snapshot);
          return;
        }
        observe(snapshot);
        if (started && !finished && snapshot.playing && Date.now() - lastSentAt >= WATCH_HEARTBEAT_INTERVAL_MS) {
          send(snapshot, 0);
        }
      },
      onEnded(snapshot) {
        observe(snapshot);
        if (!started || finished) return;
        finished = true;
        send(snapshot, 4, { ended: true });
      },
      flush(snapshot, { beacon = false } = {}) {
        observe(snapshot);
        if (started && !finished) send(snapshot, snapshot.playing ? 0 : 2, { beacon });
      },
    };
  }

  // === module: image-viewer ===
  // A full-screen viewer in the spirit of iOS Photos: native snap scrolling to
  // swipe between images, double-tap to zoom, swipe down or Back to close.

  function openImageViewer(urls, startIndex = 0, { returnFocus = null } = {}) {
    const images = (Array.isArray(urls) ? urls : []).filter(Boolean);
    if (images.length === 0) return;
    closeImageViewer({ fromHistory: true });

    const total = images.length;
    let index = Math.min(Math.max(0, Number(startIndex) || 0), total - 1);
    let scrollFrame = 0;
    let zoomedSlide = null;
    let lastTap = { time: 0, x: 0, y: 0 };
    let drag = null;
    let closed = false;

    const root = createElement("div", "bm-image-viewer");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", t("imageViewer"));
    applyUILanguage(root);
    root.style.fontFamily = 'var(--bm-font, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif)';

    const track = createElement("div", "bm-image-viewer-track");
    const slides = images.map((url, slideIndex) => {
      const slide = createElement("div", "bm-image-viewer-slide");
      slide.dataset.index = String(slideIndex);
      const spinner = createElement("span", "bm-image-viewer-spinner");
      spinner.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.className = "bm-image-viewer-image";
      image.alt = total > 1 ? t("imageCounter", { index: slideIndex + 1, total }) : "";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.draggable = false;
      // Load the opened image and its neighbours first; the rest load as you swipe.
      image.loading = Math.abs(slideIndex - index) <= 1 ? "eager" : "lazy";
      image.addEventListener("load", () => slide.classList.add("is-loaded"), { once: true });
      image.addEventListener("error", () => {
        slide.classList.add("is-error");
        slide.dataset.error = t("imageLoadFailed");
      }, { once: true });
      image.src = url;
      slide.append(spinner, image);
      track.appendChild(slide);
      return slide;
    });

    const topBar = createElement("div", "bm-image-viewer-bar");
    const counter = createElement("div", "bm-image-viewer-counter");
    counter.setAttribute("aria-live", "polite");
    counter.hidden = total < 2;
    const closeButton = createElement("button", "bm-image-viewer-close");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", t("closeImageViewer"));
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
    topBar.append(closeButton, counter);

    const previousButton = createElement("button", "bm-image-viewer-nav is-previous");
    previousButton.type = "button";
    previousButton.setAttribute("aria-label", t("previousImage"));
    previousButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>';
    const nextButton = createElement("button", "bm-image-viewer-nav is-next");
    nextButton.type = "button";
    nextButton.setAttribute("aria-label", t("nextImage"));
    nextButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg>';
    previousButton.hidden = nextButton.hidden = total < 2;

    root.append(track, topBar, previousButton, nextButton);

    function updateChrome() {
      counter.textContent = t("imageCounter", { index: index + 1, total });
      previousButton.disabled = index <= 0;
      nextButton.disabled = index >= total - 1;
      // Start loading the neighbours of the image now in view.
      for (const neighbour of [index - 1, index + 1]) {
        const image = slides[neighbour]?.querySelector("img");
        if (image && image.loading === "lazy") image.loading = "eager";
      }
    }

    function goTo(nextIndex, behavior = "smooth") {
      const target = Math.min(Math.max(0, nextIndex), total - 1);
      if (zoomedSlide) resetZoom();
      track.scrollTo({ left: target * track.clientWidth, behavior });
      index = target;
      updateChrome();
    }

    function onScroll() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const width = track.clientWidth || 1;
        const nextIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
        if (nextIndex !== index) {
          index = nextIndex;
          updateChrome();
        }
      });
    }

    function onResize() {
      track.scrollLeft = index * track.clientWidth;
    }

    function resetZoom() {
      if (!zoomedSlide) return;
      const image = zoomedSlide.querySelector("img");
      if (image) {
        image.style.removeProperty("width");
        image.style.removeProperty("height");
      }
      zoomedSlide.classList.remove("is-zoomed");
      zoomedSlide.scrollTo(0, 0);
      zoomedSlide = null;
      root.classList.remove("is-zoomed");
    }

    function toggleZoom(slide, clientX, clientY) {
      if (zoomedSlide) {
        resetZoom();
        return;
      }
      const image = slide.querySelector("img");
      if (!image || !slide.classList.contains("is-loaded")) return;
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scale = 2.5;
      const pointX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const pointY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
      image.style.width = `${rect.width * scale}px`;
      image.style.height = `${rect.height * scale}px`;
      slide.classList.add("is-zoomed");
      root.classList.add("is-zoomed");
      zoomedSlide = slide;
      // Keep the tapped point under the finger.
      slide.scrollLeft = pointX * scale - slide.clientWidth / 2;
      slide.scrollTop = pointY * scale - slide.clientHeight / 2;
    }

    // Single tap on the backdrop closes; double tap on an image zooms.
    function onPointerUp(event) {
      if (drag?.moved) return;
      const now = performance.now();
      const isDoubleTap = now - lastTap.time < 300 &&
        Math.abs(event.clientX - lastTap.x) < 30 && Math.abs(event.clientY - lastTap.y) < 30;
      lastTap = { time: isDoubleTap ? 0 : now, x: event.clientX, y: event.clientY };
      const slide = event.target instanceof Element ? event.target.closest(".bm-image-viewer-slide") : null;
      if (isDoubleTap && slide && event.target instanceof HTMLImageElement) {
        toggleZoom(slide, event.clientX, event.clientY);
        return;
      }
      if (!zoomedSlide && slide && !(event.target instanceof HTMLImageElement)) {
        const tappedAt = now;
        window.setTimeout(() => {
          if (lastTap.time === tappedAt) close();
        }, 300);
      }
    }

    // Swipe down to dismiss, following the finger like iOS Photos.
    function onPointerDown(event) {
      if (zoomedSlide || !event.isPrimary) return;
      drag = { startX: event.clientX, startY: event.clientY, dy: 0, moved: false, vertical: null };
    }

    function onPointerMove(event) {
      if (!drag || zoomedSlide) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.vertical == null && Math.hypot(dx, dy) > 8) drag.vertical = Math.abs(dy) > Math.abs(dx);
      if (Math.hypot(dx, dy) > 8) drag.moved = true;
      if (!drag.vertical) return;
      drag.dy = Math.max(0, dy);
      root.style.setProperty("--bm-viewer-drag", `${drag.dy}px`);
      root.style.setProperty("--bm-viewer-fade", String(Math.max(0.2, 1 - drag.dy / 400)));
      root.classList.add("is-dragging");
    }

    function onPointerEnd() {
      if (!drag) return;
      const shouldClose = drag.vertical && drag.dy > 110;
      root.classList.remove("is-dragging");
      if (shouldClose) {
        close();
      } else {
        root.style.removeProperty("--bm-viewer-drag");
        root.style.removeProperty("--bm-viewer-fade");
      }
      window.setTimeout(() => { drag = null; }, 0);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "Tab") {
        // Keep focus inside the dialog.
        const focusable = [closeButton, previousButton, nextButton].filter((button) => !button.hidden && !button.disabled);
        const position = focusable.indexOf(document.activeElement);
        event.preventDefault();
        const step = event.shiftKey ? -1 : 1;
        focusable[(position + step + focusable.length) % focusable.length]?.focus();
      }
    }

    function onPopState() {
      close({ fromHistory: true });
    }

    const previousOverflow = document.documentElement.style.overflow;
    function close({ fromHistory = false } = {}) {
      if (closed) return;
      closed = true;
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKeyDown, true);
      root.remove();
      document.documentElement.style.overflow = previousOverflow;
      if (activeImageViewer?.close === close) activeImageViewer = null;
      // Drop the history entry the viewer added, so Back keeps working as before.
      if (!fromHistory && history.state?.bmImageViewer) history.back();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }

    closeButton.addEventListener("click", () => close());
    previousButton.addEventListener("click", () => goTo(index - 1));
    nextButton.addEventListener("click", () => goTo(index + 1));
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", (event) => {
      onPointerUp(event);
      onPointerEnd();
    });
    track.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown, true);

    // iOS back-swipe should close the viewer, not leave the video.
    try {
      suppressedRouteNotifications += 1;
      history.pushState({ ...(history.state || {}), bmImageViewer: true }, "", location.href);
    } catch {
    } finally {
      suppressedRouteNotifications -= 1;
    }
    window.addEventListener("popstate", onPopState);

    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(root);
    track.scrollLeft = index * track.clientWidth;
    updateChrome();
    closeButton.focus({ preventScroll: true });
    activeImageViewer = { close };
  }

  function closeImageViewer(options) {
    activeImageViewer?.close(options);
  }

  // === module: comments ===
  function createVideoCommentsSection({ aid, uploaderId = "", initialCount = 0, signal }) {
    const videoAid = extractCreatorId(aid);
    const ownerId = extractCreatorId(uploaderId);
    const section = createElement("section", "bm-video-comments");
    section.setAttribute("aria-label", t("commentsAria"));

    const header = createElement("header", "bm-comments-header");
    const heading = createElement("div", "bm-comments-heading");
    const titleRow = createElement("div", "bm-comments-title-row");
    const title = createElement("h2", "bm-comments-title");
    title.textContent = t("commentsTitle");
    const countBadge = createElement("span", "bm-comments-count");
    countBadge.hidden = true;
    titleRow.append(title, countBadge);
    heading.appendChild(titleRow);

    const sortGroup = createElement("div", "bm-comments-sort");
    sortGroup.setAttribute("role", "group");
    sortGroup.setAttribute("aria-label", t("commentsSort"));
    const hotButton = createElement("button", "bm-comments-sort-button");
    hotButton.type = "button";
    hotButton.dataset.mode = "3";
    hotButton.textContent = t("commentsHot");
    const newestButton = createElement("button", "bm-comments-sort-button");
    newestButton.type = "button";
    newestButton.dataset.mode = "2";
    newestButton.textContent = t("commentsNewest");
    sortGroup.append(hotButton, newestButton);
    header.append(heading, sortGroup);

    const list = createElement("div", "bm-comments-list");
    const status = createElement("div", "bm-comments-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "bm-comments-sentinel");
    sentinel.setAttribute("aria-hidden", "true");
    section.append(header, list, status, sentinel);

    let mode = 3;
    let nextOffset = "";
    let loading = false;
    let ended = false;
    let disposed = false;
    let page = 0;
    let requestGeneration = 0;
    const seen = new Set();

    function formatCommentCount(count) {
      const numeric = Math.max(0, Number(count) || 0);
      return t(numeric === 1 ? "commentsCountOne" : "commentsCountOther", {
        count: formatCount(numeric),
      });
    }

    function updateCount(count) {
      const numeric = Number(count);
      if (!Number.isFinite(numeric) || numeric < 0) return;
      // The heading already says "Comments"; show just the number beside it.
      countBadge.textContent = formatCount(numeric);
      countBadge.setAttribute("aria-label", formatCommentCount(numeric));
      countBadge.hidden = false;
    }

    function updateSortButtons() {
      for (const button of [hotButton, newestButton]) {
        const active = Number(button.dataset.mode) === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    function showSkeletons() {
      if (list.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 3; index += 1) {
        fragment.appendChild(createCommentSkeleton());
      }
      list.appendChild(fragment);
    }

    function clearSkeletons() {
      list.querySelectorAll(".bm-comment-skeleton").forEach((node) => node.remove());
    }

    function setStatus(message = "", state = "") {
      status.replaceChildren();
      status.textContent = message;
      if (state) status.dataset.state = state;
      else delete status.dataset.state;
    }

    function showLoadError(error) {
      clearSkeletons();
      const closed = Number(error?.code) === 12002;
      if (closed) {
        ended = true;
        setStatus(t("commentsClosed"), "done");
        return;
      }
      status.replaceChildren();
      status.dataset.state = "error";
      const message = createElement("span", "bm-status-message");
      message.textContent = t("commentsLoadFailed");
      const retry = createElement("button", "bm-button bm-comments-retry");
      retry.type = "button";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => void loadMore(), { once: true });
      status.append(message, retry);
    }

    async function loadMore() {
      if (!videoAid || disposed || signal?.aborted || loading || ended || page >= COMMENT_MAX_PAGES) return;
      loading = true;
      const generation = requestGeneration;
      if (page === 0) {
        showSkeletons();
        setStatus(t("commentsLoading"), "loading");
      } else {
        setStatus(t("loadingMore"), "loading");
      }

      try {
        const data = await getVideoCommentsPage(videoAid, mode, nextOffset, signal);
        if (disposed || signal?.aborted || generation !== requestGeneration) return;

        const cursor = data?.cursor || {};
        updateCount(cursor.all_count ?? initialCount);
        const topReplies = page === 0
          ? [
              ...(Array.isArray(data?.top_replies) ? data.top_replies : []),
              ...(Array.isArray(data?.hots) ? data.hots : []),
            ]
          : [];
        const regularReplies = Array.isArray(data?.replies) ? data.replies : [];
        const candidates = [
          ...topReplies.map((reply) => ({ reply, pinned: true })),
          ...regularReplies.map((reply) => ({ reply, pinned: false })),
        ];
        const fresh = [];
        for (const candidate of candidates) {
          const comment = normalizeVideoComment(candidate.reply, {
            uploaderId: ownerId,
            pinned: candidate.pinned,
          });
          if (!comment || seen.has(comment.id)) continue;
          seen.add(comment.id);
          fresh.push(comment);
        }

        clearSkeletons();
        const fragment = document.createDocumentFragment();
        for (const comment of fresh) fragment.appendChild(createVideoCommentCard(comment));
        list.appendChild(fragment);

        page += 1;
        nextOffset = String(cursor?.pagination_reply?.next_offset || "");
        ended = Boolean(cursor.is_end) || !nextOffset || regularReplies.length === 0 || page >= COMMENT_MAX_PAGES;

        if (list.childElementCount === 0) {
          ended = true;
          setStatus(t("commentsNoComments"), "done");
        } else if (ended) {
          setStatus(t("commentsEnd"), "done");
        } else {
          setStatus();
        }
      } catch (error) {
        if (disposed || isAbortError(error) || generation !== requestGeneration) return;
        console.warn(`${LOG_PREFIX} video comments failed`, error);
        showLoadError(error);
      } finally {
        if (generation === requestGeneration) loading = false;
      }
    }

    function reset(nextMode) {
      if (disposed || mode === nextMode) return;
      mode = nextMode;
      requestGeneration += 1;
      nextOffset = "";
      page = 0;
      loading = false;
      ended = false;
      seen.clear();
      list.replaceChildren();
      updateSortButtons();
      void loadMore();
    }

    function onSortClick(event) {
      const button = event.currentTarget;
      reset(Number(button?.dataset?.mode) || 3);
    }

    hotButton.addEventListener("click", onSortClick);
    newestButton.addEventListener("click", onSortClick);
    updateSortButtons();
    updateCount(initialCount);

    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          if (entries[0]?.isIntersecting) void loadMore();
        }, { rootMargin: "700px 0px" })
      : null;
    observer?.observe(sentinel);

    return {
      element: section,
      start() {
        void loadMore();
      },
      cleanup() {
        if (disposed) return;
        disposed = true;
        closeImageViewer({ fromHistory: true });
        requestGeneration += 1;
        observer?.disconnect();
        hotButton.removeEventListener("click", onSortClick);
        newestButton.removeEventListener("click", onSortClick);
      },
    };
  }

  function normalizeVideoComment(reply, { uploaderId = "", pinned = false } = {}) {
    if (!reply || typeof reply !== "object") return null;
    const id = String(reply.rpid_str || reply.rpid || "").trim();
    if (!id) return null;
    const member = reply.member || {};
    const creatorId = extractCreatorId(member.mid, reply.mid);
    const content = reply.content || {};
    const pictures = Array.isArray(content.pictures)
      ? content.pictures
          .map((picture) => fixCover(picture?.img_src || picture?.img_url || picture?.url || ""))
          .filter(Boolean)
          .slice(0, 9)
      : [];
    const childReplies = (Array.isArray(reply.replies) ? reply.replies : [])
      .slice(0, COMMENT_REPLY_PREVIEW_LIMIT)
      .map((child) => normalizeCompactCommentReply(child))
      .filter(Boolean);
    return {
      id,
      creatorId,
      creatorUrl: createCreatorUrl(creatorId),
      name: String(member.uname || member.name || t("commentsAnonymous")).trim(),
      avatar: fixCover(member.avatar || member.face || ""),
      message: String(content.message || "").trim(),
      emotes: content.emote && typeof content.emote === "object" ? content.emote : {},
      pictures,
      createdAt: Number(reply.ctime || 0),
      location: String(reply.reply_control?.location || reply.reply_control?.ip_location || "").trim(),
      likes: Math.max(0, Number(reply.like || reply.like_count || 0) || 0),
      replyCount: Math.max(0, Number(reply.count || 0) || 0),
      childReplies,
      pinned: Boolean(pinned || reply.reply_control?.is_up_top || reply.reply_control?.is_admin_top),
      uploader: Boolean(creatorId && uploaderId && creatorId === uploaderId),
    };
  }

  function normalizeCompactCommentReply(reply) {
    if (!reply || typeof reply !== "object") return null;
    const member = reply.member || {};
    const creatorId = extractCreatorId(member.mid, reply.mid);
    return {
      name: String(member.uname || member.name || t("commentsAnonymous")).trim(),
      creatorUrl: createCreatorUrl(creatorId),
      message: String(reply.content?.message || "").trim(),
      emotes: reply.content?.emote && typeof reply.content.emote === "object" ? reply.content.emote : {},
    };
  }

  function createVideoCommentCard(comment) {
    const article = createElement("article", "bm-comment-card");
    article.dataset.commentId = comment.id;

    const avatarLink = comment.creatorUrl
      ? createElement("a", "bm-comment-avatar-link")
      : createElement("span", "bm-comment-avatar-link");
    if (comment.creatorUrl) {
      avatarLink.href = comment.creatorUrl;
      avatarLink.setAttribute("aria-label", t("openCreatorProfile", { name: comment.name }));
    }
    const avatar = document.createElement("img");
    avatar.className = "bm-comment-avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.referrerPolicy = "no-referrer";
    if (comment.avatar) avatar.src = sizedImage(comment.avatar, 120, 120);
    avatarLink.appendChild(avatar);

    const content = createElement("div", "bm-comment-content");
    const top = createElement("div", "bm-comment-top");
    const authorRow = createElement("div", "bm-comment-author-row");
    const author = comment.creatorUrl
      ? createElement("a", "bm-comment-author")
      : createElement("span", "bm-comment-author");
    if (comment.creatorUrl) author.href = comment.creatorUrl;
    author.textContent = comment.name;
    authorRow.appendChild(author);
    if (comment.uploader) {
      const uploader = createElement("span", "bm-comment-badge is-uploader");
      uploader.textContent = t("commentsUploader");
      authorRow.appendChild(uploader);
    }
    if (comment.pinned) {
      const pinned = createElement("span", "bm-comment-badge");
      pinned.textContent = t("commentsPinned");
      authorRow.appendChild(pinned);
    }

    const time = createElement("div", "bm-comment-time");
    time.textContent = [formatCommentDate(comment.createdAt), comment.location].filter(Boolean).join(" · ");
    top.append(authorRow, time);

    const message = createElement("div", "bm-comment-message");
    appendCommentRichText(message, comment.message, comment.emotes);
    content.append(top, message);

    if (comment.pictures.length > 0) {
      const gallery = createElement("div", "bm-comment-gallery");
      gallery.dataset.count = String(comment.pictures.length);
      comment.pictures.forEach((url, index) => {
        const total = comment.pictures.length;
        const button = createElement("button", "bm-comment-picture-button");
        button.type = "button";
        button.setAttribute("aria-label", t("viewImage", { index: index + 1, total }));
        const image = document.createElement("img");
        image.className = "bm-comment-picture";
        image.src = total === 1 ? sizedImage(url, 720, 540) : sizedImage(url, 360, 360);
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        button.appendChild(image);
        button.addEventListener("click", () => openImageViewer(comment.pictures, index, { returnFocus: button }));
        gallery.appendChild(button);
      });
      content.appendChild(gallery);
    }

    if (comment.childReplies.length > 0) {
      const replies = createElement("div", "bm-comment-replies");
      for (const child of comment.childReplies) {
        const row = createElement("div", "bm-comment-reply");
        const childAuthor = child.creatorUrl
          ? createElement("a", "bm-comment-reply-author")
          : createElement("span", "bm-comment-reply-author");
        if (child.creatorUrl) childAuthor.href = child.creatorUrl;
        childAuthor.textContent = child.name;
        const separator = document.createTextNode(": ");
        row.append(childAuthor, separator);
        appendCommentRichText(row, child.message, child.emotes);
        replies.appendChild(row);
      }
      content.appendChild(replies);
    }

    const actions = createElement("div", "bm-comment-actions");
    if (comment.likes > 0) {
      const likes = createElement("span", "bm-comment-action");
      likes.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5 11 3.8c.5-1 2-.7 2 .5V9h4.8a2.2 2.2 0 0 1 2.1 2.8l-1.5 5.5a2.3 2.3 0 0 1-2.2 1.7H7.5zM3.5 10.5h4v8.5h-4z"/></svg>`;
      const label = createElement("span");
      label.textContent = t("commentsLikeCount", { count: formatCount(comment.likes) });
      likes.appendChild(label);
      actions.appendChild(likes);
    }
    if (comment.replyCount > 0) {
      const replies = createElement("span", "bm-comment-action");
      replies.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3z"/></svg>`;
      const label = createElement("span");
      label.textContent = t(comment.replyCount === 1 ? "commentsReplyCountOne" : "commentsReplyCountOther", {
        count: formatCount(comment.replyCount),
      });
      replies.appendChild(label);
      actions.appendChild(replies);
    }
    if (actions.childElementCount > 0) content.appendChild(actions);

    article.append(avatarLink, content);
    return article;
  }

  function appendCommentRichText(container, message, emotes) {
    const source = String(message || "");
    const entries = Object.entries(emotes || {})
      .map(([token, value]) => [String(token), fixCover(value?.url || value?.gif_url || value?.webp || "")])
      .filter(([token, url]) => token && url && source.includes(token))
      .sort(([left], [right]) => right.length - left.length)
      .slice(0, 64);
    if (entries.length === 0) {
      container.appendChild(document.createTextNode(source));
      return;
    }
    const lookup = new Map(entries);
    const pattern = new RegExp(`(${entries.map(([token]) => escapeRegExp(token)).join("|")})`, "g");
    for (const part of source.split(pattern)) {
      const url = lookup.get(part);
      if (!url) {
        container.appendChild(document.createTextNode(part));
        continue;
      }
      const image = document.createElement("img");
      image.className = "bm-comment-emote";
      image.src = url;
      image.alt = part;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      container.appendChild(image);
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createCommentSkeleton() {
    const card = createElement("div", "bm-comment-card bm-comment-skeleton");
    card.setAttribute("aria-hidden", "true");
    const avatar = createElement("div", "bm-comment-avatar bm-skeleton-block");
    const content = createElement("div", "bm-comment-content");
    const author = createElement("div", "bm-skeleton-line is-comment-author");
    const line = createElement("div", "bm-skeleton-line is-comment-line");
    const shortLine = createElement("div", "bm-skeleton-line is-comment-short");
    content.append(author, line, shortLine);
    card.append(avatar, content);
    return card;
  }

  async function getVideoCommentsPage(aid, mode, offset, signal) {
    const params = {
      oid: String(aid),
      type: "1",
      mode: String(mode),
      pagination_str: JSON.stringify({ offset: String(offset || "") }),
      plat: "1",
      seek_rpid: "",
      web_location: "1315875",
    };
    const headers = { Referer: location.href || `https://www.bilibili.com/video/av${aid}` };
    return requestSignedWbiData("/x/v2/reply/wbi/main", params, {
      endpoint: "video comments",
      headers,
      signal,
      legacyUrl: `https://api.bilibili.com/x/v2/reply/main?${new URLSearchParams(params)}`,
    });
  }

  // === module: media-api ===
  function parseUGCIdentifier(pathname) {
    const match = /^\/video\/(BV[0-9A-Za-z]+|av\d+)/i.exec(pathname);
    if (!match) return null;
    return /^BV/i.test(match[1])
      ? { bvid: match[1] }
      : { aid: Number(match[1].slice(2)) };
  }

  function parseBangumiIdentifier(pathname) {
    const match = /^\/bangumi\/play\/(ep|ss)(\d+)/i.exec(pathname);
    if (!match) return null;
    return { type: match[1].toLowerCase(), id: Number(match[2]) };
  }

  function getCookieValue(name) {
    try {
      const prefix = `${String(name || "")}=`;
      for (const part of String(document.cookie || "").split(";")) {
        const entry = part.trim();
        if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
      }
      return "";
    } catch {
      return "";
    }
  }

  function getCurrentUserId() {
    return extractCreatorId(getCookieValue("DedeUserID"));
  }

  function isLoggedIn() {
    return Boolean(getCurrentUserId());
  }

  function createBilibiliLoginUrl() {
    return `https://passport.bilibili.com/h5-app/passport/login?gourl=${encodeURIComponent(location.href)}`;
  }

  async function getVideoInfo(identifier, signal) {
    const params = new URLSearchParams();
    if ("bvid" in identifier) params.set("bvid", identifier.bvid);
    else params.set("aid", String(identifier.aid));
    const response = await gmGetJSON(`https://api.bilibili.com/x/web-interface/view?${params}`, { signal });
    return unwrapData(response, "video info");
  }

  // Bilibili's own "related videos" list, the source of the autoplay pick.
  async function getRelatedVideos(identifier, signal) {
    const params = new URLSearchParams();
    if (identifier.bvid) params.set("bvid", identifier.bvid);
    else params.set("aid", String(identifier.aid));
    const response = await gmGetJSON(`https://api.bilibili.com/x/web-interface/archive/related?${params}`, { signal });
    const items = unwrapData(response, "related videos");
    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.bvid && Number(item.cid) > 0 && !item.is_ogv && !item.redirect_url)
      .map((item) => ({
        aid: Number(item.aid) || 0,
        bvid: String(item.bvid),
        cid: Number(item.cid),
        title: decodeSearchText(item.title || ""),
        pic: item.pic || "",
        duration: Number(item.duration) || 0,
        owner: item.owner || null,
      }));
  }

  async function getUGCPlaySource(identifier, cid, signal) {
    await loadShaka();
    throwIfAborted(signal);
    const baseParams = {
      cid: String(cid),
      qn: "127",
      high_quality: "1",
      fnver: "0",
      fourk: "1",
      otype: "json",
      try_look: isLoggedIn() ? "0" : "1",
    };
    if ("bvid" in identifier) baseParams.bvid = identifier.bvid;
    else baseParams.avid = String(identifier.aid);

    const headers = { Referer: location.href || "https://www.bilibili.com/" };
    const dashParams = {
      ...baseParams,
      fnval: "4048",
      ...getWbiDeviceParams(),
    };
    const legacyDashParams = new URLSearchParams({ ...baseParams, fnval: "4048" });
    const progressiveFallback = () => getUGCProgressiveSource(identifier, cid, signal);
    const errors = [];

    try {
      const dashData = await requestSignedWbiData(
        "/x/player/wbi/playurl",
        dashParams,
        {
          endpoint: "video DASH URL",
          headers,
          signal,
          legacyUrl: `https://api.bilibili.com/x/player/playurl?${legacyDashParams}`,
        },
      );
      const dashCandidate = await normalizeDashSource(dashData);
      const audioCandidates = normalizeAudioSource(dashData);
      if (dashCandidate && isDashPlaybackSupported()) {
        return {
          candidates: [dashCandidate],
          audioCandidates,
          loadProgressiveFallback: progressiveFallback,
        };
      }
      errors.push(new Error("No Safari-compatible DASH video representation was returned"));
    } catch (error) {
      if (isAbortError(error)) throw error;
      errors.push(error);
      console.warn(`${LOG_PREFIX} signed DASH video source is unavailable`, error);
    }

    try {
      const progressive = await progressiveFallback();
      if (progressive.candidates.length > 0) {
        return { candidates: progressive.candidates, audioCandidates: [] };
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      errors.push(error);
    }
    throw errors.find(Boolean) || new Error("Bilibili returned no playable video source");
  }

  async function getUGCProgressiveSource(identifier, cid, signal) {
    const params = new URLSearchParams({
      cid: String(cid),
      qn: "127",
      high_quality: "1",
      fnval: "1",
      fnver: "0",
      fourk: "1",
      platform: "html5",
      otype: "json",
      try_look: isLoggedIn() ? "0" : "1",
    });
    if ("bvid" in identifier) params.set("bvid", identifier.bvid);
    else params.set("avid", String(identifier.aid));
    const response = await gmGetJSON(`https://api.bilibili.com/x/player/playurl?${params}`, {
      headers: { Referer: location.href || "https://www.bilibili.com/" },
      signal,
    });
    return normalizePlaySource(unwrapData(response, "video HTML5 fallback URL"), { allowEmpty: true });
  }

  async function getBangumiSeason(identifier, signal) {
    const params = new URLSearchParams();
    params.set(identifier.type === "ep" ? "ep_id" : "season_id", String(identifier.id));
    const response = await gmGetJSON(`https://api.bilibili.com/pgc/view/web/season?${params}`, {
      headers: { Referer: "https://www.bilibili.com/" },
      signal,
    });
    return unwrapResult(response, "Bangumi season info");
  }

  function collectBangumiEpisodeGroups(season) {
    const rawGroups = [];
    const mainEpisodes = Array.isArray(season?.episodes) ? season.episodes : [];
    if (mainEpisodes.length > 0) {
      rawGroups.push({
        id: `main-${season?.positive?.id || season?.season_id || 0}`,
        title: normalizeBangumiEpisodeGroupTitle(season?.positive?.title, { isMain: true }),
        episodes: mainEpisodes,
      });
    }

    if (Array.isArray(season?.section)) {
      season.section.forEach((section, index) => {
        if (!Array.isArray(section?.episodes) || section.episodes.length === 0) return;
        rawGroups.push({
          id: `section-${section?.id || index}`,
          title: normalizeBangumiEpisodeGroupTitle(section?.title, { index }),
          episodes: section.episodes,
        });
      });
    }

    const seenEpisodes = new Set();
    const groupsByTitle = new Map();
    for (const rawGroup of rawGroups) {
      const validEpisodes = rawGroup.episodes.filter((episode) => {
        const id = Number(episode?.id);
        const aid = Number(episode?.aid);
        const cid = Number(episode?.cid);
        if (!id || !aid || !cid || seenEpisodes.has(id)) return false;
        seenEpisodes.add(id);
        return true;
      });
      if (validEpisodes.length === 0) continue;

      const groupKey = rawGroup.title.toLocaleLowerCase();
      const existing = groupsByTitle.get(groupKey);
      if (existing) {
        existing.episodes.push(...validEpisodes);
      } else {
        groupsByTitle.set(groupKey, {
          id: rawGroup.id,
          title: rawGroup.title,
          episodes: validEpisodes,
        });
      }
    }
    return [...groupsByTitle.values()];
  }

  function normalizeBangumiEpisodeGroupTitle(rawTitle, { isMain = false, index = 0 } = {}) {
    const title = String(rawTitle || "").replace(/\s+/g, " ").trim();
    if (isMain || /^(正片|本篇|main|tv)$/i.test(title)) return "TV";
    if (/中配|中文配音|国语|國語/.test(title) && !/^TV(?:\s|[（(])/i.test(title)) return "TV（中配）";
    return title || `其他 ${index + 1}`;
  }

  function collectBangumiEpisodes(season) {
    return collectBangumiEpisodeGroups(season).flatMap((group) => group.episodes);
  }

  function finiteNumberOrNull(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeBangumiV2PlayResponse(response) {
    let statusCode = finiteNumberOrNull(response?.code);
    let payload = response;

    if (payload?.raw && typeof payload.raw === "object") payload = payload.raw;
    if (payload?.data && typeof payload.data === "object") {
      payload = payload.data;
      if (statusCode == null) statusCode = finiteNumberOrNull(payload.code);
    }
    if (payload?.result && typeof payload.result === "object") payload = payload.result;

    const videoInfo = payload?.video_info && typeof payload.video_info === "object"
      ? payload.video_info
      : (payload?.dash || payload?.durl || payload?.durls ? payload : null);

    return {
      statusCode,
      payload: payload && typeof payload === "object" ? payload : {},
      videoInfo,
    };
  }

  function normalizeBangumiAccessValue(rawValue) {
    const value = String(rawValue || "").trim().toUpperCase();
    if (!value) return "unknown";
    if (value === "PLAY_PREVIEW" || value === "PREVIEW") return "preview";
    if (value === "PLAY_WHOLE" || value === "WHOLE") return "whole";
    if (value === "PLAY_NONE" || value === "NONE") return "none";
    return "unknown";
  }

  function getBangumiPlaybackAccess(payload, videoInfo) {
    const rawValues = [
      payload?.play_check?.play_detail,
      payload?.play_check?.playDetail,
      payload?.play_detail,
      payload?.play_video_type,
      payload?.playVideoType,
      videoInfo?.play_check?.play_detail,
      videoInfo?.play_video_type,
    ];

    for (const rawValue of rawValues) {
      const access = normalizeBangumiAccessValue(rawValue);
      if (access !== "unknown") return access;
    }

    const previewFlags = [
      payload?.is_preview,
      payload?.isPreview,
      payload?.preview,
      videoInfo?.is_preview,
      videoInfo?.isPreview,
      videoInfo?.preview,
    ];
    if (previewFlags.some((value) => value === true || value === 1 || String(value).toLowerCase() === "true")) {
      return "preview";
    }

    const descriptions = [
      ...(Array.isArray(payload?.accept_description) ? payload.accept_description : []),
      ...(Array.isArray(videoInfo?.accept_description) ? videoInfo.accept_description : []),
    ];
    if (descriptions.some((value) => /试看|preview/i.test(String(value || "")))) return "preview";
    return "unknown";
  }

  function isBangumiAreaBlocked(payload) {
    return (Array.isArray(payload?.plugins) ? payload.plugins : []).some((plugin) =>
      plugin?.name === "AreaLimitPanel" && Boolean(plugin?.config?.is_block),
    );
  }

  function isLikelyBangumiPreview(videoInfo, episode) {
    const expectedDuration = Number(episode?.duration || 0);
    const actualDuration = Number(videoInfo?.timelength || 0);
    return expectedDuration >= 10 * 60 * 1000 &&
      actualDuration > 0 &&
      actualDuration <= 7 * 60 * 1000 &&
      actualDuration < expectedDuration * 0.6;
  }

  function createBangumiAccessError(message, code) {
    const error = new Error(message);
    error.code = code;
    error.bangumiAccessRestricted = true;
    return error;
  }

  function createBangumiUnsupportedError(message, code = "BANGUMI_NATIVE_UNSUPPORTED") {
    const error = new Error(message);
    error.code = code;
    error.bangumiNativeUnsupported = true;
    return error;
  }

  function assertBangumiPlaybackAllowed(statusCode, payload, videoInfo, episode) {
    if (isBangumiAreaBlocked(payload)) {
      throw createBangumiAccessError(
        "This Bangumi episode is unavailable in the current region; keeping Bilibili's official player.",
        "BANGUMI_REGION_RESTRICTED",
      );
    }

    const access = getBangumiPlaybackAccess(payload, videoInfo);
    if (statusCode === -10403 || access === "preview" || isLikelyBangumiPreview(videoInfo, episode)) {
      throw createBangumiAccessError(
        "Bilibili returned preview-only access. Full playback requires this signed-in account to own the episode or have the required membership; keeping Bilibili's official player.",
        "BANGUMI_PREVIEW_ONLY",
      );
    }
    if (access === "none") {
      throw createBangumiAccessError(
        "Bilibili did not authorize playback for this episode; keeping Bilibili's official player.",
        "BANGUMI_PLAYBACK_NOT_AUTHORIZED",
      );
    }
    if (statusCode != null && statusCode !== 0) {
      throw createBangumiAccessError(
        `Bilibili rejected Bangumi playback with code ${statusCode}; keeping Bilibili's official player.`,
        statusCode,
      );
    }
    if (!videoInfo) {
      throw new Error("Bilibili returned no Bangumi video_info payload");
    }
  }

  function createPlaybackSessionId() {
    try {
      const bytes = new Uint8Array(16);
      PAGE_WINDOW.crypto?.getRandomValues?.(bytes);
      if (bytes.some(Boolean)) return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    } catch {
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32).padEnd(32, "0");
  }

  function getEmbeddedBangumiPlayResponse() {
    try {
      const direct = PAGE_WINDOW.playurlSSRData;
      if (direct && typeof direct === "object") return direct;
    } catch {
    }

    const assignmentPattern = /(?:window\.)?playurlSSRData\s*=\s*/g;
    for (const script of document.scripts || []) {
      const source = String(script.textContent || "");
      assignmentPattern.lastIndex = 0;
      const match = assignmentPattern.exec(source);
      if (!match) continue;
      const start = match.index + match[0].length;
      const jsonText = extractBalancedJSON(source, start);
      if (!jsonText) continue;
      try {
        return JSON.parse(jsonText);
      } catch {
      }
    }
    return null;
  }

  function extractBalancedJSON(source, startIndex) {
    let index = startIndex;
    while (/\s/.test(source[index] || "")) index += 1;
    const opening = source[index];
    const closing = opening === "{" ? "}" : opening === "[" ? "]" : "";
    if (!closing) return "";

    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let cursor = index; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === opening) depth += 1;
      else if (char === closing) {
        depth -= 1;
        if (depth === 0) return source.slice(index, cursor + 1);
      }
    }
    return "";
  }

  async function pageGetJSON(url, { signal } = {}) {
    const pageFetch = PAGE_WINDOW.fetch;
    if (typeof pageFetch !== "function") throw new Error("Page-context fetch is unavailable");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await pageFetch.call(PAGE_WINDOW, url, {
        method: "GET",
        credentials: "include",
        mode: "cors",
        cache: "no-store",
        headers: { Accept: "application/json, text/plain, */*" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText || url}`);
        error.status = response.status;
        error.url = url;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (signal?.aborted) throw createAbortError();
      if (controller.signal.aborted && error?.name === "AbortError") {
        throw new Error(`Page-context request timed out: ${url}`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  function buildBangumiPlayURLs(episode, season) {
    const commonParams = {
      avid: String(episode.aid),
      cid: String(episode.cid),
      ep_id: String(episode.id),
      season_id: String(season?.season_id || ""),
      qn: "127",
      fnver: "0",
      fourk: "1",
      otype: "json",
      module: "bangumi",
      session: createPlaybackSessionId(),
    };
    if (!commonParams.season_id) delete commonParams.season_id;

    const webDashParams = new URLSearchParams({
      ...commonParams,
      fnval: "4048",
      from_client: "BROWSER",
      is_main_page: "true",
    });
    const broadDashParams = new URLSearchParams({ ...commonParams, fnval: "12240" });
    const legacyDashParams = new URLSearchParams({ ...commonParams, fnval: "4048" });
    const html5Params = new URLSearchParams({
      avid: commonParams.avid,
      cid: commonParams.cid,
      ep_id: commonParams.ep_id,
      bsource: "",
    });
    const progressiveParams = new URLSearchParams({
      ...commonParams,
      qn: "127",
      high_quality: "1",
      fnval: "1",
      platform: "html5",
    });

    return [
      `https://api.bilibili.com/pgc/player/web/v2/playurl?${webDashParams}`,
      `https://api.bilibili.com/pgc/player/web/v2/playurl?${broadDashParams}`,
      `https://api.bilibili.com/pgc/player/web/playurl?${legacyDashParams}`,
      `https://api.bilibili.com/pgc/player/web/playurl/html5?${html5Params}`,
      `https://api.bilibili.com/pgc/player/web/playurl?${progressiveParams}`,
    ];
  }

  async function normalizeBangumiPlaySourceResponse(response, episode) {
    const { statusCode, payload, videoInfo } = normalizeBangumiV2PlayResponse(response);
    assertBangumiPlaybackAllowed(statusCode, payload, videoInfo, episode);

    const candidates = [];
    const dashCandidate = await normalizeDashSource(videoInfo);
    const audioCandidates = normalizeAudioSource(videoInfo);
    if (dashCandidate && isDashPlaybackSupported()) candidates.push(dashCandidate);

    const progressive = normalizePlaySource(videoInfo, { allowEmpty: true });
    candidates.push(...progressive.candidates);

    if (candidates.length === 0) {
      throw createBangumiUnsupportedError(
        "Bilibili returned no Safari-compatible clear Bangumi stream; keeping the official player.",
      );
    }
    return { candidates, audioCandidates };
  }

  async function getBangumiPlaySource(episode, season, signal, { allowEmbedded = false } = {}) {
    await loadShaka();
    throwIfAborted(signal);
    const headers = {
      Referer: `https://www.bilibili.com/bangumi/play/ep${episode.id}`,
    };
    const errors = [];

    // The server-rendered play data describes only the episode the page was
    // first loaded for, so it is unsafe after any in-app episode change.
    const embedded = allowEmbedded ? getEmbeddedBangumiPlayResponse() : null;
    if (embedded) {
      try {
        return await normalizeBangumiPlaySourceResponse(embedded, episode);
      } catch (error) {
        if (isAbortError(error)) throw error;
        errors.push(error);
        console.debug(`${LOG_PREFIX} embedded Bangumi playback data is unusable`, error);
      }
    }

    for (const url of buildBangumiPlayURLs(episode, season)) {
      for (const request of [
        () => pageGetJSON(url, { signal }),
        () => gmGetJSON(url, { headers, signal }),
      ]) {
        try {
          const response = await request();
          return await normalizeBangumiPlaySourceResponse(response, episode);
        } catch (error) {
          if (isAbortError(error)) throw error;
          errors.push(error);
          console.debug(`${LOG_PREFIX} Bangumi playback attempt failed`, error);
        }
      }
    }

    throw errors.find((error) => error?.bangumiAccessRestricted) ||
      errors.find((error) => error?.bangumiNativeUnsupported) ||
      errors.find(Boolean) ||
      new Error("Bilibili returned no playable Bangumi source");
  }

  function normalizePlaySource(data, { allowEmpty = false } = {}) {
    const groupsByQuality = new Map();

    const addGroup = (qualityValue, entries) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      const quality = Number(qualityValue || 0);
      const group = groupsByQuality.get(quality) || new Map();
      for (const entry of entries) {
        const urls = [entry?.url, ...(Array.isArray(entry?.backup_url) ? entry.backup_url : [])].filter(Boolean);
        if (urls.length === 0) continue;
        const key = urls.join("\n");
        if (!group.has(key)) group.set(key, entry);
      }
      if (group.size > 0) groupsByQuality.set(quality, group);
    };

    if (Array.isArray(data?.durls)) {
      for (const group of data.durls) addGroup(group?.quality, group?.durl);
    }
    addGroup(data?.quality, data?.durl);

    const qualityGroups = [...groupsByQuality.entries()]
      .map(([quality, entries]) => ({ quality, entries: [...entries.values()] }))
      .filter((group) => group.entries.length > 0)
      .sort((left, right) => right.quality - left.quality);

    const candidates = [];
    const seenURLs = new Set();
    let segmentedGroupCount = 0;

    for (const group of qualityGroups) {
      if (group.entries.length !== 1) {
        segmentedGroupCount += 1;
        continue;
      }

      const entry = group.entries[0];
      const urls = [entry?.url, ...(Array.isArray(entry?.backup_url) ? entry.backup_url : [])].filter(Boolean);
      const qualityLabel = getQualityLabel(data, group.quality);
      for (const url of urls) {
        if (seenURLs.has(url)) continue;
        seenURLs.add(url);
        candidates.push({ kind: "progressive", url, quality: group.quality, qualityLabel });
      }
    }

    if (candidates.length === 0 && !allowEmpty) {
      if (segmentedGroupCount > 0) {
        throw new Error("Bilibili returned only segmented MP4 streams");
      }
      throw new Error("Bilibili did not return a native HTML5 MP4 URL");
    }

    return { candidates };
  }

  function getShaka() {
    return globalThis.shaka || PAGE_WINDOW.shaka || null;
  }

  // Resolves to the Shaka namespace, or null if it could not be loaded; callers
  // then fall back to progressive MP4 playback.
  function loadShaka() {
    if (getShaka()) return Promise.resolve(getShaka());
    if (shakaLoadPromise) return shakaLoadPromise;
    shakaLoadPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (!value) shakaLoadPromise = null;
        resolve(value);
      };
      const timer = window.setTimeout(() => {
        console.warn(`${LOG_PREFIX} Shaka Player took too long to load; using MP4 playback`);
        finish(null);
      }, SHAKA_LOAD_TIMEOUT_MS);
      const append = () => {
        try {
          const script = document.createElement("script");
          script.src = SHAKA_URL;
          script.integrity = SHAKA_INTEGRITY;
          script.crossOrigin = "anonymous";
          script.async = true;
          script.addEventListener("load", () => finish(getShaka()), { once: true });
          script.addEventListener("error", () => {
            console.warn(`${LOG_PREFIX} Shaka Player failed to load; using MP4 playback`);
            finish(null);
          }, { once: true });
          (document.head || document.documentElement).appendChild(script);
        } catch (error) {
          console.warn(`${LOG_PREFIX} unable to load Shaka Player`, error);
          finish(null);
        }
      };
      // At document-start the page may not have an <html> element yet.
      if (document.documentElement) {
        append();
      } else {
        const waitForRoot = new MutationObserver(() => {
          if (!document.documentElement) return;
          waitForRoot.disconnect();
          append();
        });
        waitForRoot.observe(document, { childList: true });
      }
    });
    return shakaLoadPromise;
  }

  function ensureShakaPolyfills() {
    const shaka = getShaka();
    if (shakaPolyfillsInstalled || typeof shaka?.polyfill?.installAll !== "function") return;
    shaka.polyfill.installAll();
    shakaPolyfillsInstalled = true;
  }

  function isDashPlaybackSupported() {
    if (typeof dashPlaybackSupportedCache === "boolean") return dashPlaybackSupportedCache;
    try {
      ensureShakaPolyfills();
      const shaka = getShaka();
      if (!shaka?.Player) return false;
      dashPlaybackSupportedCache = Boolean(shaka.Player.isBrowserSupported());
      return dashPlaybackSupportedCache;
    } catch (error) {
      console.debug(`${LOG_PREFIX} DASH capability detection failed`, error);
      dashPlaybackSupportedCache = false;
      return false;
    }
  }

  async function normalizeDashSource(data) {
    const dash = data?.dash;
    if (!dash || !Array.isArray(dash.video) || dash.video.length === 0) return null;

    const rawVideoRepresentations = dash.video
      .map((entry, index) => normalizeDashRepresentation(entry, "video", index))
      .filter(Boolean);
    const videoRepresentations = await filterCompatibleVideoRepresentations(rawVideoRepresentations);
    const audioEntries = [
      ...(Array.isArray(dash.audio) ? dash.audio : []),
      ...(Array.isArray(dash.dolby?.audio) ? dash.dolby.audio : []),
      ...(dash.flac?.audio ? [dash.flac.audio] : []),
    ];
    const audioRepresentations = audioEntries
      .map((entry, index) => normalizeDashRepresentation(entry, "audio", index))
      .filter(Boolean);

    if (videoRepresentations.length === 0 || audioRepresentations.length === 0) return null;

    const sortedAudioRepresentations = [...audioRepresentations]
      .filter(isDashRepresentationSupported)
      .sort((left, right) => right.bandwidth - left.bandwidth);
    const highestSupportedAudio = sortedAudioRepresentations[0];
    if (!highestSupportedAudio) return null;
    const selectedAudioRepresentations = [highestSupportedAudio];

    const duration = Number(dash.duration || (Number(data?.timelength) > 0 ? Number(data.timelength) / 1000 : 0));
    if (!Number.isFinite(duration) || duration <= 0) return null;

    const highestVideo = [...videoRepresentations].sort(compareVideoRepresentations)[0];
    const qualityLabel = getQualityLabel(data, highestVideo.quality) ||
      (highestVideo.height ? `${highestVideo.height}P` : t("highQuality"));
    const audioLabel = formatReportedAudioLabel(highestSupportedAudio, true);
    const heights = [...new Set(videoRepresentations.map((item) => item.height).filter((height) => height > 0))]
      .sort((left, right) => right - left);

    return {
      kind: "dash",
      quality: highestVideo.quality,
      qualityLabel: `${qualityLabel} · ${audioLabel} · DASH`,
      audioBandwidth: highestSupportedAudio.bandwidth,
      audioLabel,
      qualityOptions: [
        { value: "auto", label: t("qualityAuto") },
        { value: "highest", label: t("qualityHighest") },
        ...heights.map((height) => ({ value: `height:${height}`, label: `${height}P` })),
      ],
      manifest: buildDashManifest(
        videoRepresentations,
        selectedAudioRepresentations,
        duration,
        Number(dash.minBufferTime),
      ),
    };
  }

  async function filterCompatibleVideoRepresentations(representations) {
    const probed = await Promise.all(representations.map(async (representation) => ({
      representation,
      capability: await probeVideoDecodingCapability(representation),
    })));

    const compatible = probed.filter(({ representation, capability }) => {
      if (!isDashRepresentationSupported(representation) || !capability.supported) return false;
      if (representation.codecFamily === "av1") {
        return capability.verified && capability.smooth && capability.powerEfficient;
      }
      return true;
    });
    if (compatible.length === 0) return [];

    const selectedByFormat = new Map();
    for (const item of compatible) {
      const representation = { ...item.representation, capability: item.capability };
      const key = [
        representation.quality,
        representation.width,
        representation.height,
        representation.frameRate,
        representation.dynamicRange,
      ].join(":");
      const previous = selectedByFormat.get(key);
      if (!previous || scoreVideoRepresentation(representation) > scoreVideoRepresentation(previous)) {
        selectedByFormat.set(key, representation);
      }
    }
    return [...selectedByFormat.values()].sort(compareVideoRepresentations);
  }

  function videoCapabilityCacheKey(representation) {
    return [
      representation.mimeType,
      representation.codecs,
      representation.width,
      representation.height,
      representation.bandwidth,
      representation.frameRate,
      representation.dynamicRange,
    ].join("|");
  }

  function runMediaCapabilityProbe(task) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeMediaCapabilityProbes += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            activeMediaCapabilityProbes -= 1;
            mediaCapabilityQueue.shift()?.();
          });
      };
      if (activeMediaCapabilityProbes < MEDIA_CAPABILITIES_MAX_CONCURRENCY) run();
      else mediaCapabilityQueue.push(run);
    });
  }

  function probeVideoDecodingCapability(representation) {
    const key = videoCapabilityCacheKey(representation);
    const cached = videoDecodingCapabilityCache.get(key);
    if (cached) return cached;

    const probe = runMediaCapabilityProbe(async () => {
      const fallback = {
        supported: isDashRepresentationSupported(representation),
        smooth: true,
        powerEfficient: representation.codecFamily !== "av1",
        verified: false,
      };
      const mediaCapabilities = PAGE_NAVIGATOR.mediaCapabilities;
      if (!mediaCapabilities || typeof mediaCapabilities.decodingInfo !== "function") return fallback;
      try {
        const result = await mediaCapabilities.decodingInfo({
          type: "media-source",
          video: {
            contentType: `${representation.mimeType}; codecs="${representation.codecs}"`,
            width: Math.max(1, representation.width),
            height: Math.max(1, representation.height),
            bitrate: Math.max(1, representation.bandwidth),
            framerate: Math.max(1, parseFrameRate(representation.frameRate)),
          },
        });
        return {
          supported: Boolean(result.supported),
          smooth: Boolean(result.smooth),
          powerEfficient: Boolean(result.powerEfficient),
          verified: true,
        };
      } catch (error) {
        console.debug(`${LOG_PREFIX} MediaCapabilities probe failed for ${representation.codecs}`, error);
        return fallback;
      }
    });

    videoDecodingCapabilityCache.set(key, probe);
    if (videoDecodingCapabilityCache.size > VIDEO_CAPABILITY_CACHE_LIMIT) {
      videoDecodingCapabilityCache.delete(videoDecodingCapabilityCache.keys().next().value);
    }
    return probe;
  }

  function parseFrameRate(value) {
    const source = String(value || "").trim();
    if (!source) return 30;
    const ratio = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(source);
    if (ratio) {
      const denominator = Number(ratio[2]);
      return denominator > 0 ? Number(ratio[1]) / denominator : 30;
    }
    const numeric = Number(source);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 30;
  }

  function classifyCodec(codecs) {
    const value = String(codecs || "").toLowerCase();
    if (/^(hvc1|hev1)|(^|\.)hevc/.test(value)) return "hevc";
    if (/^(avc1|avc3)|(^|\.)h264/.test(value)) return "avc";
    if (/^(av01)|(^|\.)av1/.test(value)) return "av1";
    if (/^(dvhe|dvh1)/.test(value)) return "dolby-vision";
    return "other";
  }

  function scoreVideoRepresentation(representation) {
    const capability = representation.capability || {};
    const codecScore = {
      hevc: capability.powerEfficient ? 50 : 28,
      avc: 40,
      av1: capability.smooth && capability.powerEfficient ? 45 : 0,
      "dolby-vision": capability.powerEfficient ? 46 : 20,
      other: 10,
    }[representation.codecFamily] || 0;
    return codecScore + (capability.smooth ? 5 : 0) + (capability.powerEfficient ? 5 : 0);
  }

  function compareVideoRepresentations(left, right) {
    const pixelDelta = (right.width * right.height) - (left.width * left.height);
    if (pixelDelta) return pixelDelta;
    const frameRateDelta = parseFrameRate(right.frameRate) - parseFrameRate(left.frameRate);
    return frameRateDelta || right.bandwidth - left.bandwidth;
  }

  function chooseQualityTrack(tracks, mode) {
    const playable = (Array.isArray(tracks) ? tracks : []).filter((track) => track && track.type === "variant");
    if (playable.length === 0 || mode === "auto") return null;
    const sorted = [...playable].sort((left, right) => {
      const heightDelta = Number(right.height || 0) - Number(left.height || 0);
      const frameRateDelta = Number(right.frameRate || 0) - Number(left.frameRate || 0);
      return heightDelta || frameRateDelta || Number(right.bandwidth || 0) - Number(left.bandwidth || 0);
    });
    if (mode === "highest") return sorted[0];
    const match = /^height:(\d+)$/.exec(String(mode || ""));
    if (!match) return sorted[0];
    const target = Number(match[1]);
    return sorted.find((track) => Number(track.height || 0) === target) ||
      sorted.find((track) => Number(track.height || 0) < target) ||
      sorted.at(-1);
  }

  function buildDashManifest(videoRepresentations, audioRepresentations, duration, minBufferTime) {
    const bufferTime = Number.isFinite(minBufferTime) && minBufferTime > 0 ? minBufferTime : 1.5;
    const adaptation = (type, representations) => {
      const rendered = representations.map((representation) => {
        const dimensions = type === "video"
          ? `${representation.width ? ` width="${representation.width}"` : ""}${representation.height ? ` height="${representation.height}"` : ""}${representation.frameRate ? ` frameRate="${escapeXML(representation.frameRate)}"` : ""}`
          : `${representation.audioSamplingRate ? ` audioSamplingRate="${representation.audioSamplingRate}"` : ""}`;
        const baseURLs = representation.urls
          .map((url, index) => `<BaseURL serviceLocation="cdn-${index}">${escapeXML(url)}</BaseURL>`)
          .join("");
        const audioChannels = type === "audio"
          ? `<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${representation.audioChannels || 2}" />`
          : "";
        return `<Representation id="${escapeXML(representation.id)}" bandwidth="${representation.bandwidth}" mimeType="${escapeXML(representation.mimeType)}" codecs="${escapeXML(representation.codecs)}" startWithSAP="${representation.startWithSAP}"${dimensions}>${baseURLs}<SegmentBase indexRange="${escapeXML(representation.indexRange)}"><Initialization range="${escapeXML(representation.initialization)}" /></SegmentBase>${audioChannels}</Representation>`;
      }).join("");
      return `<AdaptationSet id="${type}" contentType="${type}" segmentAlignment="true" subsegmentAlignment="true">${rendered}</AdaptationSet>`;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" mediaPresentationDuration="PT${duration.toFixed(3)}S" minBufferTime="PT${bufferTime}S">
  <Period id="0" start="PT0S">
    ${adaptation("video", videoRepresentations)}
    ${adaptation("audio", audioRepresentations)}
  </Period>
  </MPD>`;
  }

  function escapeXML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function classifyAudioCodec(codecs) {
    const value = String(codecs || "").toLowerCase();
    if (value.includes("mp4a")) return "AAC";
    if (value.includes("ec-3") || value.includes("eac3")) return "Dolby Digital Plus";
    if (value.includes("ac-3") || value.includes("ac3")) return "Dolby Digital";
    if (value.includes("flac")) return "FLAC";
    if (value.includes("opus")) return "Opus";
    return value ? value.toUpperCase() : t("audioGeneric");
  }

  function formatReportedAudioLabel(representation, highestAvailable = false) {
    const codec = classifyAudioCodec(representation?.codecs || representation?.codecFamily || "");
    const bandwidth = Number(representation?.bandwidth || 0);
    const bitrate = bandwidth > 0 ? Math.max(1, Math.round(bandwidth / 1000)) : 0;
    return [
      codec,
      bitrate ? t("bitrateReported", { bitrate }) : t("bitrateUnavailable"),
      highestAvailable ? t("highestAvailable") : "",
    ].filter(Boolean).join(" · ");
  }

  function isWbiRetryableError(error) {
    return Number(error?.status) === 412 || [-403, -352, -401].includes(Number(error?.code));
  }

  function isDashRepresentationSupported(representation) {
    if (!representation?.mimeType || !representation?.codecs) return false;
    const fullType = `${representation.mimeType}; codecs="${representation.codecs}"`;
    const mediaSource = PAGE_WINDOW.ManagedMediaSource || PAGE_WINDOW.MediaSource ||
      globalThis.ManagedMediaSource || globalThis.MediaSource;
    try {
      if (mediaSource && typeof mediaSource.isTypeSupported === "function") {
        return mediaSource.isTypeSupported(fullType);
      }
    } catch {
    }

    try {
      const probe = document.createElement(representation.mimeType.startsWith("audio/") ? "audio" : "video");
      return probe.canPlayType(fullType) !== "";
    } catch {
      return false;
    }
  }

  function normalizeDashRepresentation(entry, type, index) {
    if (!entry || typeof entry !== "object") return null;
    const segmentBase = entry.SegmentBase || entry.segment_base || {};
    const initialization = segmentBase.Initialization || segmentBase.initialization;
    const indexRange = segmentBase.indexRange || segmentBase.index_range;
    const primary = entry.base_url || entry.baseUrl || entry.url;
    const backups = entry.backup_url || entry.backupUrl || [];
    const urls = [primary, ...(Array.isArray(backups) ? backups : [])].filter(Boolean);
    if (!initialization || !indexRange || urls.length === 0) return null;

    const mimeType = entry.mime_type || entry.mimeType || (type === "video" ? "video/mp4" : "audio/mp4");
    const codecs = String(entry.codecs || "").trim();
    if (!codecs) return null;
    const quality = Number(entry.id || 0);

    return {
      id: `${type === "video" ? "v" : "a"}-${entry.id || index}-${index}`,
      quality,
      bandwidth: Math.max(1, Number(entry.bandwidth || entry.band_width || 1)),
      mimeType,
      codecs,
      codecFamily: type === "video" ? classifyCodec(codecs) : classifyAudioCodec(codecs),
      dynamicRange: quality === 126 ? "DV" : quality === 125 ? "HDR10" : "SDR",
      urls,
      initialization: String(initialization),
      indexRange: String(indexRange),
      width: Math.max(0, Number(entry.width || 0)),
      height: Math.max(0, Number(entry.height || 0)),
      frameRate: String(entry.frame_rate || entry.frameRate || "").trim(),
      audioSamplingRate: Math.max(0, Number(entry.audio_sampling_rate || entry.audioSamplingRate || 0)),
      audioChannels: Math.max(1, Number(
        entry.audio_channels || entry.audioChannels || entry.channels || entry.channel_count || 2,
      )),
      startWithSAP: Math.max(1, Number(entry.start_with_sap || entry.startWithSap || 1)),
    };
  }

  function isRawAudioEntrySupported(entry) {
    if (!entry || typeof entry !== "object") return false;
    const mimeType = entry.mime_type || entry.mimeType || "audio/mp4";
    const codecs = String(entry.codecs || "").trim();
    if (!codecs) return true;
    const fullType = `${mimeType}; codecs="${codecs}"`;
    if (audioTypeSupportCache.has(fullType)) return audioTypeSupportCache.get(fullType);
    let supported = false;
    try {
      audioSupportProbe ||= document.createElement("audio");
      supported = audioSupportProbe.canPlayType(fullType) !== "";
    } catch {
    }
    audioTypeSupportCache.set(fullType, supported);
    return supported;
  }

  function normalizeAudioSource(data) {
    const entries = [];
    const appendEntries = (items) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (item && typeof item === "object") entries.push(item);
      }
    };

    appendEntries(data?.dash?.audio);
    appendEntries(data?.dash?.dolby?.audio);
    if (data?.dash?.flac?.audio) appendEntries([data.dash.flac.audio]);
    appendEntries(data?.audio);

    const candidates = [];
    const seen = new Set();
    const sortedEntries = entries
      .map((entry) => ({
        entry,
        supported: isRawAudioEntrySupported(entry),
        bandwidth: Number(entry?.bandwidth || entry?.band_width || 0),
      }))
      .sort((left, right) => {
        if (left.supported !== right.supported) return Number(right.supported) - Number(left.supported);
        return right.bandwidth - left.bandwidth;
      });

    for (let entryIndex = 0; entryIndex < sortedEntries.length; entryIndex += 1) {
      const { entry, bandwidth } = sortedEntries[entryIndex];
      const primary = entry.base_url || entry.baseUrl || entry.url;
      const backups = entry.backup_url || entry.backupUrl || [];
      const urls = [primary, ...(Array.isArray(backups) ? backups : [])].filter(Boolean);
      const descriptor = {
        bandwidth,
        codecs: entry.codecs || "",
        codecFamily: classifyAudioCodec(entry.codecs || ""),
      };
      const qualityLabel = formatReportedAudioLabel(descriptor, entryIndex === 0);
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        candidates.push({
          url,
          quality: Number(entry.id || bandwidth || 0),
          qualityLabel,
          bandwidth,
          mimeType: entry.mime_type || entry.mimeType || "audio/mp4",
          codecs: entry.codecs || "",
        });
      }
    }
    return candidates;
  }

  function getQualityLabel(data, quality) {
    void data;
    return QUALITY_LABELS[quality] || (quality ? `QN ${quality}` : "HTML5");
  }

  // === module: content-api ===

  async function getCreatorRelation(creatorId, signal) {
    const params = new URLSearchParams({ fid: String(creatorId) });
    const response = await gmGetJSON(`https://api.bilibili.com/x/relation?${params}`, {
      headers: { Referer: `https://space.bilibili.com/${creatorId}` },
      signal,
    });
    const data = unwrapData(response, "creator relationship");
    const attribute = Math.max(0, Number(data?.attribute) || 0);
    return {
      following: attribute === 1 || attribute === 2 || attribute === 6,
      mutual: attribute === 6,
    };
  }

  async function getCreatorFollowerCount(creatorId, signal) {
    const params = new URLSearchParams({ vmid: String(creatorId) });
    const response = await gmGetJSON(`https://api.bilibili.com/x/relation/stat?${params}`, {
      headers: { Referer: `https://space.bilibili.com/${creatorId}` },
      signal,
    });
    const data = unwrapData(response, "creator follower count");
    return Math.max(0, Number(data?.follower) || 0);
  }

  async function modifyCreatorRelation(creatorId, shouldFollow, csrf, signal) {
    const response = await gmPostFormJSON(
      "https://api.bilibili.com/x/relation/modify",
      {
        fid: String(creatorId),
        act: shouldFollow ? "1" : "2",
        re_src: "11",
        csrf,
        csrf_token: csrf,
      },
      {
        headers: {
          Origin: "https://space.bilibili.com",
          Referer: `https://space.bilibili.com/${creatorId}`,
        },
        signal,
      },
    );
    if (!response || response.code !== 0) throw createBilibiliAPIError(response, "creator follow action");
    return response.data ?? null;
  }

  async function getCreatorProfile(creatorId, signal) {
    const headers = { Referer: `https://space.bilibili.com/${creatorId}` };
    const params = {
      mid: creatorId,
      token: "",
      platform: "web",
      web_location: "1550101",
      ...getWbiDeviceParams(),
    };
    const legacyParams = new URLSearchParams({ mid: creatorId });
    const data = await requestSignedWbiData(
      "/x/space/wbi/acc/info",
      params,
      {
        endpoint: "creator profile",
        headers,
        signal,
        legacyUrl: `https://api.bilibili.com/x/space/acc/info?${legacyParams}`,
      },
    );
    return normalizeCreatorProfile(data, creatorId);
  }

  async function getCreatorVideos(creatorId, page, signal) {
    const headers = { Referer: `https://space.bilibili.com/${creatorId}` };
    const basicParams = {
      mid: creatorId,
      pn: String(page),
      ps: String(PROFILE_PAGE_SIZE),
      tid: "0",
      keyword: "",
      order: "pubdate",
      platform: "web",
      web_location: "1550101",
      order_avoided: "true",
    };
    const data = await requestSignedWbiData(
      "/x/space/wbi/arc/search",
      { ...basicParams, ...getWbiDeviceParams() },
      {
        endpoint: "creator videos",
        headers,
        signal,
        legacyUrl: `https://api.bilibili.com/x/space/arc/search?${new URLSearchParams(basicParams)}`,
      },
    );
    const rawItems = Array.isArray(data.list?.vlist) ? data.list.vlist : [];
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.max(1, Number(data.page?.ps ?? PROFILE_PAGE_SIZE) || PROFILE_PAGE_SIZE);
    const reportedTotal = Math.max(0, Number(data.page?.count ?? data.page?.total ?? 0) || 0);
    const inferredMinimum = (pageNumber - 1) * pageSize + rawItems.length;
    const total = Math.max(reportedTotal, inferredMinimum);
    const totalPages = reportedTotal > 0
      ? Math.ceil(reportedTotal / pageSize)
      : (rawItems.length < pageSize ? pageNumber : pageNumber + 1);
    return {
      items: rawItems.map((item) => normalizeCreatorVideo(item, creatorId)).filter(Boolean),
      total,
      totalPages,
    };
  }

  function normalizeCreatorProfile(data, creatorId) {
    // Profile fields are plain API text, so preserve literal tags and entity spellings.
    const official = String(data?.official?.title || data?.official?.desc || "").trim();
    return {
      id: extractCreatorId(data?.mid, creatorId),
      name: String(data?.name || "").trim(),
      avatar: fixCover(data?.face || ""),
      cover: fixCover(data?.top_photo || data?.topPhoto || ""),
      signature: String(data?.sign || "").trim(),
      official,
    };
  }

  function normalizeCreatorVideo(item, creatorId) {
    if (!item) return null;
    const bvid = String(item.bvid || "").trim();
    const aid = Number(item.aid || item.id || 0);
    const title = decodeSearchText(item.title || "");
    const cover = fixCover(item.pic || item.cover || "");
    if ((!bvid && !aid) || !title || !cover) return null;
    return {
      id: bvid || `av${aid}`,
      url: bvid ? `/video/${bvid}` : `/video/av${aid}`,
      cover,
      title,
      author: formatPublishedDate(item.created || item.pubdate || item.senddate),
      authorPrefix: "",
      playText: formatCount(item.play ?? item.stat?.view),
      danmakuText: formatCount(item.video_review ?? item.danmaku ?? item.stat?.danmaku),
      durationText: String(item.length || "").trim() || formatDuration(item.duration),
      kind: "video",
      creatorId: extractCreatorId(item.mid, creatorId),
    };
  }

  async function getRecommendations(page, signal) {
    try {
      const webItems = await getWebRecommendations(page, signal);
      if (webItems.length > 0) return webItems;
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn(`${LOG_PREFIX} web recommendation API failed; trying app feed`, error);
    }
    return getAppRecommendations(page, signal);
  }


  async function getSearchResults(
    keyword,
    page,
    order,
    signal,
    searchTypes = ["media_bangumi", "media_ft", "video"],
  ) {
    const settled = await Promise.allSettled(
      searchTypes.map((searchType) => getSearchTypeResults(keyword, page, order, searchType, signal)),
    );
    throwIfAborted(signal);

    const groupsByType = new Map();
    const failures = [];
    let firstFailure = null;
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const searchType = searchTypes[index];
      if (result.status === "fulfilled") {
        groupsByType.set(searchType, result.value);
        continue;
      }
      firstFailure ||= result.reason;
      failures.push({ searchType, error: result.reason });
      if (!isAbortError(result.reason)) {
        console.warn(`${LOG_PREFIX} ${searchType} search failed`, result.reason);
      }
    }

    const successful = searchTypes.map((searchType) => groupsByType.get(searchType)).filter(Boolean);
    if (successful.length === 0) {
      throw firstFailure || new Error("Bilibili search returned no usable result groups");
    }

    return {
      items: successful.flatMap((result) => result.items),
      total: successful.reduce((sum, result) => sum + result.total, 0),
      totalPages: successful.reduce((maximum, result) => Math.max(maximum, result.totalPages), 0),
      failures,
    };
  }

  async function getSearchTypeResults(keyword, page, order, searchType, signal) {
    const params = {
      Search_key: keyword,
      keyword,
      page: String(page),
      context: "",
      duration: "0",
      tids_2: "",
      __refresh__: "true",
      search_type: searchType,
      tids: "0",
      highlight: "1",
    };
    if (searchType === "video") params.order = order;

    const headers = { Referer: "https://m.bilibili.com/" };
    const data = await requestSignedWbiData(
      "/x/web-interface/wbi/search/type",
      params,
      {
        endpoint: `${searchType} search`,
        headers,
        signal,
        legacyUrl: `https://api.bilibili.com/x/web-interface/search/type?${new URLSearchParams(params)}`,
      },
    );

    const rawItems = Array.isArray(data.result) ? data.result : [];
    const normalizer =
      searchType === "video"
        ? normalizeSearchVideo
        : (item) => normalizeSearchMedia(item, searchType === "media_bangumi" ? "bangumi" : "film");

    return {
      items: rawItems.map(normalizer).filter(Boolean),
      total: Math.max(0, Number(data.numResults ?? data.num_results ?? data.total ?? 0) || 0),
      totalPages: Math.max(0, Number(data.numPages ?? data.num_pages ?? data.pages ?? 0) || 0),
    };
  }

  async function requestSignedWbiData(
    path,
    params,
    { endpoint = "WBI request", headers = {}, signal, legacyUrl = "" } = {},
  ) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const signedParams = await signWbiParams(params, signal);
        const response = await gmGetJSON(`https://api.bilibili.com${path}?${signedParams}`, { headers, signal });
        return unwrapData(response, endpoint);
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastError = error;
        if (!isWbiRetryableError(error) || attempt > 0) break;
        invalidateWbiMixinKey();
        ensureBuvid3Cookie();
      }
    }

    if (legacyUrl) {
      try {
        const response = await gmGetJSON(legacyUrl, { headers, signal });
        return unwrapData(response, `${endpoint} legacy fallback`);
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error(`${endpoint}: request failed`);
  }

  function invalidateWbiMixinKey() {
    cachedWbiMixinKey = "";
    cachedWbiMixinKeyExpiresAt = 0;
    cachedWbiMixinKeyPromise = null;
    wbiMixinKeyGeneration += 1;
  }

  function getWbiDeviceParams() {
    const width = Math.max(1, Math.round(PAGE_WINDOW.screen?.width || PAGE_WINDOW.innerWidth || 390));
    const height = Math.max(1, Math.round(PAGE_WINDOW.screen?.height || PAGE_WINDOW.innerHeight || 844));
    const whRandom = Math.floor(114 * Math.random());
    const offsetRandom = Math.floor(514 * Math.random());
    const scrollTop = Math.max(0, Math.round(PAGE_WINDOW.scrollY || 0));
    return {
      dm_img_list: "[]",
      dm_img_str: randomBase64Token(32),
      dm_cover_img_str: randomBase64Token(64),
      dm_img_inter: JSON.stringify({
        ds: [],
        wh: [2 * width + 2 * height + 3 * whRandom, 4 * width - height + whRandom, whRandom],
        of: [3 * scrollTop + offsetRandom, 4 * scrollTop + 2 * offsetRandom, offsetRandom],
      }),
    };
  }

  function randomBase64Token(length) {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let value = "";
    for (let index = 0; index < length; index += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    try {
      return PAGE_WINDOW.btoa(value).replace(/=+$/g, "");
    } catch {
      return value;
    }
  }

  async function signWbiParams(params, signal) {
    const mixinKey = await getWbiMixinKey(signal);
    throwIfAborted(signal);

    const entries = Object.entries({
      ...params,
      wts: String(Math.floor(Date.now() / 1000)),
    })
      .map(([key, value]) => [key, String(value ?? "").replace(/[!'()*]/g, "")])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    const signed = new URLSearchParams();
    for (const [key, value] of entries) signed.append(key, value);
    signed.append("w_rid", md5Hex(`${signed.toString()}${mixinKey}`));
    return signed;
  }

  function waitForPromiseWithAbort(promise, signal) {
    if (!signal) return promise;
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(createAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  async function getWbiMixinKey(signal) {
    if (cachedWbiMixinKey && Date.now() < cachedWbiMixinKeyExpiresAt) {
      return cachedWbiMixinKey;
    }

    if (!cachedWbiMixinKeyPromise) {
      ensureBuvid3Cookie();
      const generation = wbiMixinKeyGeneration;
      const request = (async () => {
        const response = await gmGetJSON("https://api.bilibili.com/x/web-interface/nav", {
          headers: { Referer: "https://m.bilibili.com/" },
        });
        const data = unwrapData(response, "WBI key");
        const imgKey = extractWbiFileKey(data.wbi_img?.img_url);
        const subKey = extractWbiFileKey(data.wbi_img?.sub_url);
        const rawKey = `${imgKey}${subKey}`;
        if (rawKey.length < 64) throw new Error("Bilibili returned an invalid WBI key");

        const mixinKey = WBI_MIXIN_KEY_ENC_TAB.map((index) => rawKey[index]).join("").slice(0, 32);
        if (generation === wbiMixinKeyGeneration) {
          cachedWbiMixinKey = mixinKey;
          cachedWbiMixinKeyExpiresAt = Date.now() + WBI_MIXIN_KEY_TTL_MS;
        }
        return mixinKey;
      })();
      const sharedRequest = request.finally(() => {
        if (cachedWbiMixinKeyPromise === sharedRequest) cachedWbiMixinKeyPromise = null;
      });
      cachedWbiMixinKeyPromise = sharedRequest;
    }

    return waitForPromiseWithAbort(cachedWbiMixinKeyPromise, signal);
  }

  function extractWbiFileKey(url) {
    const match = /\/([^/?#]+)\.[^./?#]+(?:[?#]|$)/.exec(String(url || ""));
    return match?.[1] || "";
  }

  function ensureBuvid3Cookie() {
    try {
      if (/(?:^|;\s*)buvid3=/.test(document.cookie)) return;
      const randomId = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID().replaceAll("-", "")
        : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
      document.cookie = `buvid3=${randomId}infoc; Domain=.bilibili.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    } catch {
      // Search can still work when Bilibili or the userscript manager supplies
      // the cookie independently.
    }
  }

  function md5Hex(input) {
    const bytes = new TextEncoder().encode(String(input));
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const view = new DataView(padded.buffer);
    const bitLengthLow = (bytes.length * 8) >>> 0;
    const bitLengthHigh = Math.floor(bytes.length / 0x20000000) >>> 0;
    view.setUint32(paddedLength - 8, bitLengthLow, true);
    view.setUint32(paddedLength - 4, bitLengthHigh, true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const rotateLeft = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let index = 0; index < 64; index += 1) {
        let f;
        let wordIndex;
        if (index < 16) {
          f = (b & c) | (~b & d);
          wordIndex = index;
        } else if (index < 32) {
          f = (d & b) | (~d & c);
          wordIndex = (5 * index + 1) % 16;
        } else if (index < 48) {
          f = b ^ c ^ d;
          wordIndex = (3 * index + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          wordIndex = (7 * index) % 16;
        }

        const nextD = d;
        d = c;
        c = b;
        const sum = (a + f + MD5_CONSTANTS[index] + words[wordIndex]) >>> 0;
        b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
        a = nextD;
      }

      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    const toLittleEndianHex = (value) => [0, 8, 16, 24]
      .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
      .join("");
    return [a0, b0, c0, d0].map(toLittleEndianHex).join("");
  }

  function normalizeSearchVideo(item) {
    if (!item) return null;
    const aid = Number(item.aid || item.id || 0);
    const bvid = item.bvid || "";
    const title = decodeSearchText(item.title);
    const cover = fixCover(item.pic || item.cover);
    if ((!aid && !bvid) || !title || !cover) return null;

    const published = formatPublishedDate(item.pubdate || item.senddate);
    const creatorName = decodeSearchText(item.author || item.up_name || "");
    const creatorId = extractCreatorId(item.mid, item.author_mid, item.up_id, item.uid, item.owner?.mid);
    const author = [creatorName, published].filter(Boolean).join(" · ");
    const durationValue = String(item.duration || "").trim();

    return {
      id: bvid || `av${aid}`,
      url: bvid ? `/video/${bvid}` : `/video/av${aid}`,
      cover,
      title,
      author,
      creatorName,
      creatorMeta: published,
      creatorUrl: createCreatorUrl(creatorId),
      playText: formatCount(item.play ?? item.stat?.view),
      danmakuText: formatCount(item.video_review ?? item.danmaku ?? item.stat?.danmaku),
      durationText: /^\d{1,3}:\d{2}(?::\d{2})?$/.test(durationValue)
        ? durationValue
        : formatDuration(durationValue),
      kind: "video",
    };
  }

  function normalizeSearchMedia(item, kind) {
    if (!item) return null;

    const seasonId = Number(item.season_id || item.seasonId || 0);
    const episodes = Array.isArray(item.eps) ? item.eps : [];
    const firstEpisodeId = Number(
      item.ep_id ||
      item.episode_id ||
      item.new_ep?.id ||
      episodes.find((episode) => Number(episode?.id))?.id ||
      0,
    );
    const title = decodeSearchText(item.title || item.org_title || item.media_title || "");
    const cover = fixCover(item.cover || item.pic || item.square_cover || item.horizontal_cover);
    if ((!seasonId && !firstEpisodeId) || !title || !cover) return null;

    const scoreValue = Number(item.media_score?.score ?? item.score ?? 0);
    const scoreText = Number.isFinite(scoreValue) && scoreValue > 0
      ? t("scoreValue", { score: scoreValue.toFixed(1) })
      : "";
    const areas = Array.isArray(item.areas)
      ? item.areas.map((area) => area?.name || area).filter(Boolean).slice(0, 2).join(" / ")
      : decodeSearchText(item.areas || item.area || "");
    const styles = Array.isArray(item.styles)
      ? item.styles.map((style) => style?.name || style).filter(Boolean).slice(0, 2).join(" / ")
      : decodeSearchText(item.styles || item.style || "");
    const published = formatPublishedDate(item.pubtime || item.pubdate || item.senddate);
    const author = [areas, styles, published].filter(Boolean).join(" · ");
    const episodeLabel = decodeSearchText(
      item.index_show ||
      item.angle_title ||
      item.new_ep?.index_show ||
      item.new_ep?.long_title ||
      episodes[0]?.long_title ||
      "",
    );

    return {
      id: `${kind}-${seasonId || firstEpisodeId}`,
      url: firstEpisodeId ? `/bangumi/play/ep${firstEpisodeId}` : `/bangumi/play/ss${seasonId}`,
      cover,
      title,
      author,
      stats: scoreText ? [{ kind: "score", value: scoreText }] : [],
      playText: "",
      danmakuText: "",
      durationText: episodeLabel,
      kind,
    };
  }

  async function getWebRecommendations(page, signal) {
    const params = new URLSearchParams({
      fresh_type: "4",
      ps: "20",
      fresh_idx: String(page + 1),
      fresh_idx_1h: String(page + 1),
      homepage_ver: "1",
      web_location: "1430650",
    });
    const response = await gmGetJSON(
      `https://api.bilibili.com/x/web-interface/index/top/feed/rcmd?${params}`,
      { signal },
    );
    const data = unwrapData(response, "recommendations");
    const items = data.item || data.items || [];
    return items.map(normalizeWebRecommendation).filter(Boolean);
  }

  function normalizeWebRecommendation(item) {
    if (!item?.title || !item?.pic) return null;
    const bvid = item.bvid;
    const aid = item.aid || item.id;
    if (!bvid && !aid) return null;
    const creatorName = item.owner?.name || "";
    const creatorId = extractCreatorId(item.owner?.mid, item.mid, item.up_id, item.uid);
    return {
      id: bvid || `av${aid}`,
      url: bvid ? `/video/${bvid}` : `/video/av${aid}`,
      cover: fixCover(item.pic),
      title: item.title,
      author: creatorName,
      creatorName,
      creatorUrl: createCreatorUrl(creatorId),
      playText: formatCount(item.stat?.view),
      danmakuText: formatCount(item.stat?.danmaku),
      durationText: formatDuration(item.duration),
      kind: "video",
    };
  }

  async function getAppRecommendations(page, signal) {
    const params = new URLSearchParams({
      appkey: "27eb53fc9058f8c3",
      access_key: "",
      idx: String(Date.now() + page),
    });
    const response = await gmGetJSON(`https://app.bilibili.com/x/v2/feed/index?${params}`, { signal });
    const data = unwrapData(response, "app recommendations");
    return (data.items || []).map(normalizeAppRecommendation).filter(Boolean);
  }

  function normalizeAppRecommendation(item) {
    if (!item?.title || !item?.cover) return null;
    const creatorName = item.args?.up_name || item.owner?.name || "";
    const creatorId = extractCreatorId(
      item.args?.up_id,
      item.args?.mid,
      item.player_args?.mid,
      item.owner?.mid,
      item.mid,
      item.uid,
    );
    const creatorUrl = createCreatorUrl(creatorId);
    if (item.goto === "picture" && item.param) {
      return {
        id: `picture-${item.param}`,
        url: `/opus/${item.param}`,
        cover: fixCover(item.cover),
        title: item.title,
        author: creatorName,
        creatorName,
        creatorUrl,
        playText: item.cover_left_text_1 || "",
        danmakuText: "",
        durationText: t("categoryPicture"),
        kind: "picture",
      };
    }
    if (item.goto !== "av") return null;
    const aid = item.player_args?.aid || item.args?.aid || Number(item.param);
    if (!aid) return null;
    return {
      id: `av${aid}`,
      url: `/video/av${aid}`,
      cover: fixCover(item.cover),
      title: item.title,
      author: creatorName,
      creatorName,
      creatorUrl,
      playText: item.cover_left_text_1 || "",
      danmakuText: item.cover_left_text_2 || "",
      durationText: item.cover_right_text || "",
      kind: "video",
    };
  }

  function createRecommendationCard(item) {
    const card = createElement("article", "bm-recommend-card is-image-loading");
    card.dataset.coverError = t("coverLoadFailed");

    const cover = createElement("div", "bm-recommend-cover");
    const image = document.createElement("img");
    image.src = sizedImage(item.cover, 560, 350);
    image.alt = item.title || "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => card.classList.remove("is-image-loading"), { once: true });
    image.addEventListener(
      "error",
      () => {
        card.classList.remove("is-image-loading");
        card.classList.add("is-image-error");
      },
      { once: true },
    );
    cover.appendChild(image);

    const overlay = createElement("div", "bm-recommend-overlay");
    const stats = createElement("span", "bm-recommend-stats");
    const statItems = Array.isArray(item.stats)
      ? item.stats.map((stat) => [stat?.kind || "", stat?.value || ""])
      : [
          ["view", item.playText],
          ["danmaku", item.danmakuText],
        ];
    for (const [kind, value] of statItems) {
      if (!value) continue;
      const stat = createElement("span", "bm-recommend-stat");
      stat.dataset.kind = kind;
      stat.textContent = value;
      stats.appendChild(stat);
    }

    const duration = createElement("span", "bm-recommend-duration");
    duration.textContent = item.durationText;
    overlay.append(stats, duration);
    cover.appendChild(overlay);

    const body = createElement("div", "bm-recommend-body");
    const title = createElement("div", "bm-recommend-title");
    title.textContent = item.title;

    const meta = createElement("div", "bm-recommend-meta");
    const author = createElement("div", "bm-recommend-author");
    const categoryKey = {
      picture: "categoryPicture",
      bangumi: "categoryBangumi",
      film: "categoryFilm",
    }[item.kind];
    const tagText = Object.prototype.hasOwnProperty.call(item, "authorPrefix")
      ? String(item.authorPrefix || "")
      : categoryKey
        ? t(categoryKey)
        : t("creatorPrefix");
    if (tagText) {
      const tag = createElement("span", "bm-recommend-tag");
      if (categoryKey) tag.dataset.kind = item.kind;
      tag.textContent = tagText;
      author.appendChild(tag);
    }
    if (item.creatorUrl && (item.creatorName || item.author)) {
      const creatorLink = createElement("a", "bm-recommend-author-link");
      const creatorName = item.creatorName || item.author;
      creatorLink.href = item.creatorUrl;
      creatorLink.textContent = creatorName;
      creatorLink.setAttribute("aria-label", t("openCreatorProfile", { name: creatorName }));
      creatorLink.title = t("openCreatorProfile", { name: creatorName });
      author.appendChild(creatorLink);
      if (item.creatorMeta) {
        const creatorMeta = createElement("span", "bm-recommend-author-meta");
        creatorMeta.textContent = item.creatorMeta;
        author.appendChild(creatorMeta);
      }
    } else if (item.author) {
      const authorText = createElement("span", "bm-recommend-author-text");
      authorText.textContent = item.author;
      author.appendChild(authorText);
    }
    meta.append(author);
    body.append(title, meta);

    const cardLink = createElement("a", "bm-recommend-card-link");
    cardLink.href = item.url;
    cardLink.setAttribute("aria-label", item.title || t("recommendedVideos"));
    card.append(cover, body, cardLink);
    return card;
  }

  function createRecommendationSkeletonCard() {
    const card = createElement("div", "bm-recommend-card bm-recommend-skeleton");
    card.setAttribute("aria-hidden", "true");

    const cover = createElement("div", "bm-recommend-cover bm-skeleton-block");
    const body = createElement("div", "bm-recommend-body");
    const titleLine = createElement("div", "bm-skeleton-line is-title");
    const titleLineShort = createElement("div", "bm-skeleton-line is-title-short");
    const authorLine = createElement("div", "bm-skeleton-line is-author");
    body.append(titleLine, titleLineShort, authorLine);
    card.append(cover, body);
    return card;
  }

  // === module: platform-utils ===
  function gmGetJSON(url, { headers = {}, signal } = {}) {
    return gmRequestJSON("GET", url, { headers, signal });
  }

  function gmPostFormJSON(url, fields, { headers = {}, signal } = {}) {
    const data = fields instanceof URLSearchParams
      ? fields.toString()
      : new URLSearchParams(Object.entries(fields || {}).map(([key, value]) => [key, String(value ?? "")])).toString();
    return gmRequestJSON("POST", url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers,
      },
      signal,
      data,
    });
  }

  function gmRequestJSON(method, url, { headers = {}, signal, data = null } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      let request;
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };

      const onAbort = () => {
        try {
          request?.abort();
        } catch {
        }
        finish(reject, createAbortError());
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        request = GM_xmlhttpRequest({
          method,
          url,
          data: data == null ? undefined : data,
          responseType: "json",
          timeout: API_TIMEOUT_MS,
          anonymous: false,
          headers: {
            Accept: "application/json, text/plain, */*",
            ...headers,
          },
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              const error = new Error(`HTTP ${response.status}: ${response.statusText || url}`);
              error.status = response.status;
              error.url = url;
              finish(reject, error);
              return;
            }
            try {
              const result =
                response.response && typeof response.response === "object"
                  ? response.response
                  : JSON.parse(response.response || response.responseText || "null");
              finish(resolve, result);
            } catch (error) {
              finish(reject, error);
            }
          },
          onerror() {
            finish(reject, new Error(`Network request failed: ${url}`));
          },
          ontimeout() {
            finish(reject, new Error(`Network request timed out: ${url}`));
          },
          onabort() {
            finish(reject, createAbortError());
          },
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function createBilibiliAPIError(response, endpoint) {
    const error = new Error(`${endpoint}: ${response?.message || `code ${response?.code ?? "unknown"}`}`);
    error.code = response?.code;
    error.apiResponse = response;
    return error;
  }

  function unwrapData(response, endpoint) {
    if (!response || response.code !== 0) throw createBilibiliAPIError(response, endpoint);
    if (response.data == null) throw new Error(`${endpoint}: response data is empty`);
    return response.data;
  }

  function unwrapResult(response, endpoint) {
    if (!response || response.code !== 0) throw createBilibiliAPIError(response, endpoint);
    if (response.result == null) throw new Error(`${endpoint}: response result is empty`);
    return response.result;
  }

  function waitForAny(selectors, timeoutMs = ELEMENT_TIMEOUT_MS, signal) {
    throwIfAborted(signal);
    for (const selector of selectors) {
      const existing = document.querySelector(selector);
      if (existing instanceof HTMLElement) return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const observer = new MutationObserver(findMatch);
      const timeout = window.setTimeout(() => {
        finish(reject, new Error(`Timed out waiting for: ${selectors.join(", ")}`));
      }, timeoutMs);

      const onAbort = () => finish(reject, createAbortError());

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        observer.disconnect();
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      }

      function findMatch() {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) continue;
          finish(resolve, element);
          return;
        }
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      observer.observe(document, { childList: true, subtree: true });
      findMatch();
    });
  }

  function waitForNextFrame(signal) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      const frame = window.requestAnimationFrame(() => finish(resolve));
      const onAbort = () => {
        window.cancelAnimationFrame(frame);
        finish(reject, createAbortError());
      };

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      }

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function extractCreatorId(...values) {
    for (const value of values) {
      const candidate = String(value ?? "").trim();
      if (/^[1-9]\d*$/.test(candidate)) return candidate;
    }
    return "";
  }

  function createCreatorUrl(creatorId) {
    const id = extractCreatorId(creatorId);
    return id ? `/space/${encodeURIComponent(id)}` : "";
  }

  function createElement(tagName, className = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
  }

  // Bilibili's image CDN resizes on request ("<path>@560w_350h_1c.webp"). Asking
  // for roughly the displayed size cuts a feed cover from ~260 KB to ~25 KB.
  // GIFs are left alone so they keep animating.
  function sizedImage(url, width, height) {
    const value = String(url || "");
    if (!value) return value;
    try {
      const parsed = new URL(value, location.href);
      if (
        !/(^|\.)hdslb\.com$/i.test(parsed.hostname) ||
        !parsed.pathname.startsWith("/bfs/") ||
        parsed.pathname.includes("@") ||
        /\.gif$/i.test(parsed.pathname)
      ) {
        return value;
      }
      return `https://${parsed.host}${parsed.pathname}@${Math.round(width)}w_${Math.round(height)}h_1c.webp`;
    } catch {
      return value;
    }
  }

  function fixCover(url) {
    const value = String(url || "");
    if (value.startsWith("//")) return `https:${value}`;
    return value.replace(/^http:\/\//, "https://");
  }

  function decodeSearchText(value) {
    const source = String(value || "");
    if (!source) return "";
    return source
      // Remove only complete keyword highlights, preserving other literal markup.
      .replace(/<em\b([^>]*)>([\s\S]*?)<\/em\s*>/gi, (tag, attributes, content) => {
        const className = attributes.match(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
        const classes = className ? className[1] ?? className[2] ?? className[3] : "";
        return classes.split(/\s+/).includes("keyword") ? content : tag;
      })
      .replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27|#\d+|#x[\da-f]+);/gi, (entity) => {
        const lower = entity.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, lower)) return HTML_ENTITIES[lower];
        const hex = lower.startsWith("&#x");
        const code = Number.parseInt(lower.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
        // Invalid scalars must not throw or introduce lone surrogates into a title.
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
          return entity;
        }
        return String.fromCodePoint(code);
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatPublishedDate(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    try {
      if (!publishedDateFormatterInitialized) {
        publishedDateFormatterInitialized = true;
        publishedDateFormatter = new Intl.DateTimeFormat(UI_LANGUAGE_TAG, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
      return publishedDateFormatter?.format(new Date(timestamp * 1000)) || "";
    } catch {
      return "";
    }
  }

  function formatCommentDate(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    try {
      if (!commentDateFormatterInitialized) {
        commentDateFormatterInitialized = true;
        commentDateFormatter = new Intl.DateTimeFormat(UI_LANGUAGE_TAG, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return commentDateFormatter?.format(new Date(timestamp * 1000)) || "";
    } catch {
      return "";
    }
  }

  function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count)) return "";
    try {
      if (!compactCountFormatterInitialized) {
        compactCountFormatterInitialized = true;
        compactCountFormatter = new Intl.NumberFormat(UI_LANGUAGE_TAG, {
          notation: "compact",
          maximumFractionDigits: 1,
        });
      }
      return compactCountFormatter?.format(count) || String(count);
    } catch {
      if (UI_LOCALE === "zh-TW") {
        if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}億`;
        if (count >= 10_000) return `${(count / 10_000).toFixed(1)}萬`;
      } else if (UI_LOCALE === "zh-CN") {
        if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}亿`;
        if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`;
      } else if (UI_LOCALE === "ja") {
        if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}億`;
        if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`;
      } else {
        if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
        if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
        if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
      }
      return String(count);
    }
  }

  function formatDuration(value) {
    const totalSeconds = Number(value);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor(totalSeconds / 3600);
    const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
    return parts
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
      .join(":");
  }

  // === module: styles ===
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* ===== Tokens: iOS grouped surfaces; pink only for active and primary states ===== */
      html.bm-native-home-active,
      html.bm-native-search-active,
      html.bm-native-profile-active,
      html.bm-native-bangumi-active,
      html.bm-native-video-active,
      html.bm-native-takeover {
        --bm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "PingFang TC", "Hiragino Sans", "Helvetica Neue", sans-serif;
        --bm-brand: #fb7299;
        --bm-accent: #d9336d;
        --bm-accent-text: #c9306a;
        --bm-accent-soft: rgb(251 114 153 / 14%);
        --bm-label: #000;
        --bm-secondary: rgb(60 60 67 / 62%);
        --bm-tertiary: rgb(60 60 67 / 45%);
        --bm-page: #f2f2f7;
        --bm-surface: #fff;
        --bm-surface-2: #f2f2f7;
        --bm-fill: rgb(118 118 128 / 12%);
        --bm-fill-strong: rgb(118 118 128 / 20%);
        --bm-separator: rgb(60 60 67 / 22%);
        --bm-bar: rgb(249 249 249 / 82%);
        --bm-thumb: #fff;
        --bm-thumb-shadow: 0 3px 8px rgb(0 0 0 / 12%), 0 3px 1px rgb(0 0 0 / 4%);
        --bm-float-shadow: 0 6px 18px rgb(0 0 0 / 12%), 0 1px 3px rgb(0 0 0 / 8%);
        --bm-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3' fill='none' stroke='%233c3c43' stroke-opacity='.6' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        --bm-radius-card: 10px;
        --bm-radius-group: 12px;
        --bm-hairline: 0.5px;
        color-scheme: light;
      }

      @media (prefers-color-scheme: dark) {
        html.bm-native-home-active,
        html.bm-native-search-active,
        html.bm-native-profile-active,
        html.bm-native-bangumi-active,
        html.bm-native-video-active,
        html.bm-native-takeover {
          --bm-accent: #d9336d;
          --bm-accent-text: #ff7aa2;
          --bm-accent-soft: rgb(251 114 153 / 20%);
          --bm-label: #fff;
          --bm-secondary: rgb(235 235 245 / 60%);
          --bm-tertiary: rgb(235 235 245 / 42%);
          --bm-page: #000;
          --bm-surface: #1c1c1e;
          --bm-surface-2: #2c2c2e;
          --bm-fill: rgb(118 118 128 / 24%);
          --bm-fill-strong: rgb(118 118 128 / 36%);
          --bm-separator: rgb(84 84 88 / 60%);
          --bm-bar: rgb(22 22 24 / 82%);
          --bm-thumb: #636366;
          --bm-thumb-shadow: 0 3px 8px rgb(0 0 0 / 24%);
          --bm-float-shadow: 0 6px 18px rgb(0 0 0 / 50%);
          --bm-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3' fill='none' stroke='%23ebebf5' stroke-opacity='.6' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          color-scheme: dark;
        }
      }

      /* ===== Page takeover (functional) ===== */
      html.bm-native-home-active *,
      html.bm-native-search-active *,
      html.bm-native-profile-active *,
      html.bm-native-bangumi-active *,
      html.bm-native-video-active * {
        -webkit-tap-highlight-color: transparent;
      }

      .bm-original-player-hidden {
        display: none !important;
      }

      html.bm-native-home-active #app .m-head .channel-menu,
      html.bm-native-home-active #app .m-head [class*="channel-menu"],
      html.bm-native-home-active #app .m-head .m-home {
        display: none !important;
      }

      html.bm-native-home-active,
      html.bm-native-home-active body,
      html.bm-native-home-active #app,
      html.bm-native-search-active,
      html.bm-native-search-active body,
      html.bm-native-search-active #app,
      html.bm-native-profile-active,
      html.bm-native-profile-active body,
      html.bm-native-profile-active #app,
      html.bm-native-bangumi-active,
      html.bm-native-bangumi-active body {
        background: var(--bm-page) !important;
      }

      html.bm-native-search-active #app,
      html.bm-native-profile-active #app {
        min-height: 100vh !important;
      }

      html.bm-native-profile-active body,
      html.bm-native-bangumi-active body {
        min-height: 100vh !important;
        margin: 0 !important;
        overflow-x: hidden !important;
      }

      html.bm-native-search-active #app > :not(.bm-search-shell),
      html.bm-native-profile-active #app > :not(.bm-profile-shell),
      html.bm-native-bangumi-active body > :not(.bm-bangumi-shell, .bm-image-viewer, .bm-takeover-failure) {
        display: none !important;
      }

      html.bm-native-home-active :is(#app .m-open-app.m-nav-openapp, #app .openapp-dialog),
      html.bm-native-search-active :is(#app .m-open-app.m-nav-openapp, #app .openapp-dialog),
      html.bm-native-profile-active :is(#app .m-open-app.m-nav-openapp, #app .openapp-dialog),
      html.bm-native-bangumi-active :is(#app .m-open-app.m-nav-openapp, #app .openapp-dialog),
      html.bm-native-video-active :is(#app .m-open-app.m-nav-openapp, #app .openapp-dialog),
      html.bm-native-home-active :is(#app .m-footer, #app > .footer, #app footer, body > footer, #bili-footer, .international-footer),
      html.bm-native-search-active :is(#app .m-footer, #app > .footer, #app footer, body > footer, #bili-footer, .international-footer),
      html.bm-native-profile-active :is(#app .m-footer, #app > .footer, #app footer, body > footer, #bili-footer, .international-footer),
      html.bm-native-bangumi-active :is(#app .m-footer, #app > .footer, #app footer, body > footer, #bili-footer, .international-footer),
      html.bm-native-video-active :is(#app .m-footer, #app > .footer, #app footer, body > footer, #bili-footer, .international-footer) {
        display: none !important;
      }

      html.bm-native-video-active #app .m-video-player {
        display: block !important;
        width: 100% !important;
        max-width: 100vw !important;
        min-width: 1px !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        visibility: visible !important;
        background: transparent !important;
      }

      html.bm-native-video-active .bm-native-video-ancestor-visible,
      html.bm-native-video-active #app .video-share.bm-native-video-ancestor-visible,
      html.bm-native-video-active .m-video-normal .video-share.bm-native-video-ancestor-visible {
        display: block !important;
        visibility: visible !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }

      html.bm-native-video-active #app .m-video-player > :not(.bm-native-player),
      html.bm-native-video-active .m-video-normal > :not(.bm-native-player) {
        display: none !important;
      }

      html.bm-native-video-active .m-video-normal {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        min-width: 1px !important;
        min-height: 0 !important;
        height: auto !important;
        overflow: visible !important;
        background: transparent !important;
      }

      /* The video page keeps Bilibili's own header above the player. The script
         measures that header and sets --bm-player-top-offset to clear it exactly. */
      html.bm-native-video-active #app .m-video-player > .bm-native-player,
      html.bm-native-video-active .m-video-normal > .bm-native-player {
        display: block !important;
        position: relative !important;
        z-index: 10 !important;
        width: 100% !important;
        max-width: 960px !important;
        margin: var(--bm-player-top-offset, 0px) auto 0 !important;
      }

      .bm-home-shell,
      .bm-search-shell,
      .bm-profile-shell,
      .bm-bangumi-shell,
      .bm-native-player {
        font-family: var(--bm-font);
        -webkit-font-smoothing: antialiased;
        -webkit-text-size-adjust: 100%;
      }

      /* Pages drawn without Bilibili's app have no site stylesheet underneath. */
      html.bm-native-takeover {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        background: var(--bm-page);
      }

      html.bm-native-takeover body {
        min-height: 100vh;
        margin: 0;
        color: var(--bm-label);
        background: var(--bm-page);
        font-family: var(--bm-font);
        -webkit-font-smoothing: antialiased;
      }

      html.bm-native-takeover-failed #app { display: none !important; }

      .bm-takeover-failure {
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 10px;
        min-height: 100vh;
        padding: 32px max(24px, env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
        color: var(--bm-label);
        background: var(--bm-page);
        font-family: var(--bm-font);
        text-align: center;
        box-sizing: border-box;
      }

      .bm-takeover-failure-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        line-height: 25px;
      }

      .bm-takeover-failure-hint {
        max-width: 22rem;
        margin: 0 0 8px;
        color: var(--bm-secondary);
        font-size: 15px;
        line-height: 21px;
        text-wrap: balance;
      }

      .bm-takeover-failure-actions {
        display: grid;
        justify-items: center;
        gap: 6px;
      }

      .bm-takeover-failure-original {
        appearance: none;
        min-height: 36px;
        padding: 0 12px;
        border: 0;
        color: var(--bm-accent-text);
        background: transparent;
        font: inherit;
        font-size: 15px;
        font-weight: 500;
      }

      .bm-visually-hidden {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        clip: rect(0 0 0 0) !important;
        white-space: nowrap !important;
      }

      /* ===== Shared controls ===== */
      .bm-button {
        appearance: none;
        min-height: 36px;
        padding: 0 16px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: var(--bm-accent);
        font: inherit;
        font-size: 15px;
        font-weight: 600;
        touch-action: manipulation;
      }

      .bm-button:active { opacity: 0.7; }

      :is(.bm-home-shell, .bm-search-shell, .bm-profile-shell, .bm-bangumi-shell, .bm-native-player) :is(a, button, select, input):focus-visible {
        outline: 2px solid var(--bm-brand);
        outline-offset: 2px;
      }

      /* Navigation bar: sticky iOS bar material with a hairline. */
      .bm-profile-nav,
      .bm-bangumi-header {
        position: sticky;
        top: 0;
        z-index: 40;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 44px;
        align-items: center;
        gap: 4px;
        min-height: 44px;
        padding: env(safe-area-inset-top) max(4px, env(safe-area-inset-right)) 0 max(4px, env(safe-area-inset-left));
        border-bottom: var(--bm-hairline) solid var(--bm-separator);
        color: var(--bm-label);
        background: var(--bm-bar);
        box-sizing: content-box;
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .bm-search-back,
      .bm-bangumi-back,
      .bm-bangumi-home {
        appearance: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        color: var(--bm-accent-text);
        background: transparent;
        text-decoration: none;
        touch-action: manipulation;
      }

      .bm-search-back:active,
      .bm-bangumi-back:active,
      .bm-bangumi-home:active { opacity: 0.4; }

      .bm-search-back svg,
      .bm-bangumi-back svg,
      .bm-bangumi-home svg {
        width: 24px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-profile-home svg path,
      .bm-bangumi-home svg path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
      }

      /* Segmented control (search sort, comment sort). */
      .bm-search-sort,
      .bm-comments-sort {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        gap: 2px;
        padding: 2px;
        border-radius: 9px;
        background: var(--bm-fill);
      }

      .bm-search-sort-option,
      .bm-comments-sort-button {
        appearance: none;
        min-width: 0;
        height: 28px;
        padding: 0 10px;
        border: 0;
        border-radius: 7px;
        color: var(--bm-label);
        background: transparent;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        touch-action: manipulation;
      }

      .bm-search-sort-option.is-active,
      .bm-comments-sort-button.is-active {
        background: var(--bm-thumb);
        box-shadow: var(--bm-thumb-shadow);
        font-weight: 600;
      }

      /* ===== Video grid (home, search, profile) ===== */
      .bm-home-shell {
        display: block !important;
        position: relative;
        z-index: 1;
        width: 100%;
        min-width: 0;
        color: var(--bm-label);
        box-sizing: border-box;
      }

      .bm-recommend-view {
        min-height: 100vh;
        padding: 8px max(8px, env(safe-area-inset-right)) calc(88px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
        box-sizing: border-box;
      }

      .bm-recommend-grid,
      .bm-recommend-status,
      .bm-recommend-sentinel {
        width: 100%;
        max-width: 1320px;
        margin-inline: auto;
        box-sizing: border-box;
      }

      .bm-recommend-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .bm-recommend-card {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border-radius: var(--bm-radius-card);
        color: var(--bm-label);
        background: var(--bm-surface);
        text-decoration: none;
        transform: translateZ(0);
      }

      .bm-recommend-card-link {
        position: absolute;
        z-index: 1;
        inset: 0;
        border-radius: inherit;
        color: inherit;
        text-decoration: none;
      }

      .bm-recommend-card-link:focus-visible {
        outline: 2px solid var(--bm-brand) !important;
        outline-offset: -2px !important;
      }

      .bm-recommend-card:active { opacity: 0.72; }

      .bm-recommend-cover {
        position: relative;
        overflow: hidden;
        width: 100%;
        aspect-ratio: 16 / 10;
        background: var(--bm-fill);
      }

      .bm-recommend-cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 220ms ease;
      }

      .bm-recommend-card.is-image-loading .bm-recommend-cover img { opacity: 0; }
      .bm-recommend-card.is-image-error .bm-recommend-cover img { visibility: hidden; }

      .bm-recommend-card.is-image-loading .bm-recommend-cover::after,
      .bm-skeleton-block::after,
      .bm-skeleton-line::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 28%) 44%, transparent 67%);
        transform: translateX(-120%);
        animation: bm-shimmer 1.4s ease-in-out infinite;
      }

      .bm-recommend-card.is-image-error .bm-recommend-cover::before {
        content: attr(data-cover-error);
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--bm-secondary);
        font-size: 12px;
      }

      .bm-recommend-overlay {
        position: absolute;
        inset: auto 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 18px 7px 5px;
        color: #fff;
        font-size: 11px;
        line-height: 14px;
        font-variant-numeric: tabular-nums;
        background: linear-gradient(transparent, rgb(0 0 0 / 62%));
        box-sizing: border-box;
      }

      .bm-recommend-stats {
        display: flex;
        min-width: 0;
        gap: 8px;
        overflow: hidden;
      }

      .bm-recommend-stat,
      .bm-recommend-duration {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-recommend-stat {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .bm-recommend-stat::before {
        content: "";
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        background: currentColor;
        -webkit-mask: var(--bm-stat-icon) center / contain no-repeat;
        mask: var(--bm-stat-icon) center / contain no-repeat;
      }

      .bm-recommend-stat[data-kind="view"] {
        --bm-stat-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='1.5' y='3' width='13' height='10' rx='2.5' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cpath d='M6.6 5.9v4.2L10 8z' fill='%23000'/%3E%3C/svg%3E");
      }

      .bm-recommend-stat[data-kind="danmaku"] {
        --bm-stat-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='1.5' y='3' width='13' height='10' rx='2.5' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cpath d='M4.5 6.5h4M4.5 9.5h7' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
      }

      .bm-recommend-stat[data-kind="score"] {
        color: #ffcc4d;
        font-weight: 600;
        --bm-stat-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z' fill='%23000'/%3E%3C/svg%3E");
      }

      .bm-recommend-duration { flex: 0 0 auto; }
      .bm-recommend-duration:empty { display: none; }

      .bm-recommend-body {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
        padding: 7px 8px 9px;
      }

      .bm-recommend-title {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        min-height: 38px;
        color: var(--bm-label);
        font-size: 14px;
        font-weight: 400;
        line-height: 19px;
        overflow-wrap: anywhere;
      }

      .bm-recommend-meta {
        display: flex;
        align-items: center;
        min-width: 0;
      }

      .bm-recommend-author {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        overflow: hidden;
        color: var(--bm-secondary);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
      }

      .bm-recommend-tag {
        flex: 0 0 auto;
        padding: 0 3px;
        border: 1px solid currentColor;
        border-radius: 3px;
        color: var(--bm-tertiary);
        font-size: 9px;
        font-weight: 600;
        line-height: 12px;
      }

      .bm-recommend-tag[data-kind="bangumi"],
      .bm-recommend-tag[data-kind="film"],
      .bm-recommend-tag[data-kind="picture"] {
        border-color: transparent;
        color: var(--bm-accent-text);
        background: var(--bm-accent-soft);
      }

      .bm-recommend-author-text,
      .bm-recommend-author-link {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bm-recommend-author-link {
        position: relative;
        z-index: 2;
        flex: 0 1 auto;
        margin: -8px 0;
        padding: 8px 0;
        color: inherit;
        text-decoration: none;
      }

      .bm-recommend-author-link:active { color: var(--bm-accent-text); }

      .bm-recommend-author-meta {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--bm-tertiary);
      }

      .bm-recommend-skeleton { pointer-events: none; }

      .bm-skeleton-block,
      .bm-skeleton-line {
        position: relative;
        overflow: hidden;
        background: var(--bm-fill);
      }

      .bm-skeleton-line {
        height: 12px;
        border-radius: 4px;
      }

      .bm-skeleton-line + .bm-skeleton-line { margin-top: 7px; }
      .bm-skeleton-line.is-title { width: 92%; }
      .bm-skeleton-line.is-title-short { width: 64%; }
      .bm-skeleton-line.is-author { width: 42%; height: 10px; margin-top: 12px; }

      .bm-recommend-status {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
        min-height: 64px;
        padding: 12px 16px;
        color: var(--bm-secondary);
        font-size: 13px;
        line-height: 18px;
        text-align: center;
      }

      .bm-recommend-status[data-state="initial"] {
        min-height: 12px;
        padding: 0;
      }

      .bm-recommend-status[data-state="loading"]::before {
        content: "";
        width: 16px;
        height: 16px;
        border: 2px solid var(--bm-fill-strong);
        border-top-color: var(--bm-secondary);
        border-radius: 50%;
        animation: bm-spin 760ms linear infinite;
      }

      .bm-recommend-status[data-state="error"] {
        flex-direction: column;
        min-height: 160px;
      }

      .bm-recommend-status[data-state="empty"] {
        min-height: 200px;
        padding: 40px 32px;
        text-wrap: balance;
        font-size: 15px;
        line-height: 21px;
      }

      .bm-status-message {
        max-width: 100%;
        overflow-wrap: anywhere;
      }

      .bm-recommend-sentinel { height: 1px; }

      .bm-recommend-fab {
        appearance: none;
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: calc(20px + env(safe-area-inset-bottom));
        z-index: 1000;
        display: grid;
        place-items: center;
        width: 50px;
        height: 50px;
        padding: 0;
        border: var(--bm-hairline) solid var(--bm-separator);
        border-radius: 50%;
        color: var(--bm-accent-text);
        background: var(--bm-bar);
        box-shadow: var(--bm-float-shadow);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
        touch-action: manipulation;
        transition: transform 160ms ease;
      }

      .bm-recommend-fab svg {
        width: 24px;
        height: 24px;
        overflow: visible;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-recommend-fab svg path:nth-of-type(1) {
        fill: currentColor;
        stroke: none;
      }

      .bm-recommend-fab:active:not(:disabled) { transform: scale(0.92); }
      .bm-recommend-fab:disabled { opacity: 0.6; }
      .bm-recommend-fab.is-refreshing svg { animation: bm-fab-turn 900ms ease-in-out infinite; }

      /* ===== Search ===== */
      .bm-search-shell {
        display: block !important;
        position: relative;
        z-index: 50;
        width: 100%;
        min-height: 100vh;
        padding-bottom: calc(40px + env(safe-area-inset-bottom));
        color: var(--bm-label);
        box-sizing: border-box;
      }

      .bm-search-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        align-items: center;
        gap: 8px 4px;
        padding: calc(6px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 10px max(4px, env(safe-area-inset-left));
        border-bottom: var(--bm-hairline) solid var(--bm-separator);
        background: var(--bm-bar);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .bm-search-header-top { display: contents; }

      .bm-search-back {
        width: 36px;
        height: 36px;
      }

      .bm-search-heading {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }

      .bm-search-form {
        position: relative;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        min-width: 0;
        height: 36px;
      }

      /* The field fill spans icon, input and clear, so the button sizes to its label. */
      .bm-search-icon,
      .bm-search-input,
      .bm-search-clear { background: var(--bm-fill) !important; }
      .bm-search-icon { border-radius: 10px 0 0 10px; }
      .bm-search-clear { border-radius: 0 10px 10px 0; }

      .bm-search-icon {
        position: relative;
        display: grid;
        place-items: center;
        height: 36px;
        width: 30px;
        padding-left: 4px;
        color: var(--bm-secondary);
      }

      .bm-search-icon svg {
        width: 17px;
        height: 17px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
      }

      .bm-search-input {
        position: relative;
        appearance: none;
        min-width: 0;
        width: 100%;
        height: 36px;
        padding: 0;
        border: 0;
        outline: 0;
        color: var(--bm-label);
        background: transparent;
        font: inherit;
        font-size: 17px;
      }

      .bm-search-input::-webkit-search-cancel-button { display: none; }
      .bm-search-input:focus-visible { outline: none !important; }
      .bm-search-shell.is-empty .bm-search-summary { display: none; }
      .bm-search-input::placeholder { color: var(--bm-secondary); }

      .bm-search-clear {
        position: relative;
        appearance: none;
        display: grid;
        place-items: center;
        width: 30px;
        height: 36px;
        padding: 0;
        border: 0;
        color: var(--bm-tertiary);
        background: transparent;
        touch-action: manipulation;
      }

      .bm-search-clear[hidden] { display: grid !important; pointer-events: none; }
      .bm-search-clear[hidden] svg { visibility: hidden; }

      .bm-search-clear svg {
        width: 17px;
        height: 17px;
        fill: currentColor;
        stroke: var(--bm-surface);
        stroke-width: 1.6;
        stroke-linecap: round;
      }

      .bm-search-submit {
        position: relative;
        appearance: none;
        min-width: 44px;
        height: 36px;
        padding: 0 0 0 12px;
        border: 0;
        color: var(--bm-accent-text);
        background: transparent;
        font: inherit;
        font-size: 17px;
        font-weight: 500;
        text-align: right;
        touch-action: manipulation;
      }

      .bm-search-submit:active:not(:disabled) { opacity: 0.4; }
      .bm-search-submit:disabled { color: var(--bm-tertiary); }

      .bm-search-sort {
        grid-column: 1 / -1;
        margin-left: 8px;
      }

      .bm-search-content { min-height: 70vh; }

      .bm-search-summary {
        display: flex;
        align-items: baseline;
        gap: 8px;
        max-width: 1320px;
        margin: 0 auto;
        padding: 18px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left));
        box-sizing: border-box;
      }

      .bm-search-summary-copy { min-width: 0; }
      .bm-search-summary-label { display: none; }

      .bm-search-summary-title {
        overflow: hidden;
        color: var(--bm-label);
        font-size: 20px;
        font-weight: 700;
        line-height: 25px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-search-count {
        flex: 0 0 auto;
        color: var(--bm-secondary);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      .bm-search-count[hidden] { display: none !important; }

      .bm-search-warning {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        max-width: 1304px;
        margin: 0 max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
        padding: 10px 12px;
        border-radius: var(--bm-radius-card);
        color: var(--bm-label);
        background: color-mix(in srgb, #ff9f0a 14%, var(--bm-surface));
        font-size: 13px;
        line-height: 18px;
      }

      .bm-search-warning[hidden] { display: none !important; }
      .bm-search-warning-message { min-width: 0; }

      .bm-search-warning-retry {
        appearance: none;
        flex: 0 0 auto;
        padding: 6px 2px;
        border: 0;
        color: #c46a00;
        background: transparent;
        font: inherit;
        font-weight: 600;
      }

      .bm-search-warning[data-loading="true"] .bm-search-warning-retry { opacity: 0.45; }

      .bm-search-grid,
      .bm-search-status,
      .bm-search-sentinel {
        width: auto;
        margin-inline: max(8px, env(safe-area-inset-left));
      }

      /* ===== Creator profile ===== */
      .bm-profile-shell {
        display: block !important;
        position: relative;
        z-index: 50;
        width: 100%;
        min-height: 100vh;
        padding-bottom: calc(40px + env(safe-area-inset-bottom));
        color: var(--bm-label);
        box-sizing: border-box;
      }

      .bm-profile-nav-heading {
        min-width: 0;
        text-align: center;
      }

      .bm-profile-nav-title {
        overflow: hidden;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-profile-back,
      .bm-profile-home {
        width: 44px;
        height: 44px;
      }

      .bm-profile-hero {
        position: relative;
        padding-bottom: 16px;
        background: var(--bm-surface);
      }

      .bm-profile-cover {
        position: relative;
        height: clamp(96px, 30vw, 200px);
        overflow: hidden;
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--bm-brand) 30%, var(--bm-surface)), color-mix(in srgb, #7fb8ff 28%, var(--bm-surface)));
      }

      .bm-profile-cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .bm-profile-cover img[hidden] { display: none; }

      .bm-profile-hero-content {
        position: relative;
        display: flow-root;
        max-width: 1320px;
        margin: 0 auto;
        padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
        box-sizing: border-box;
      }

      .bm-profile-avatar-frame {
        width: 76px;
        height: 76px;
        margin-top: -38px;
        padding: 3px;
        border-radius: 50%;
        background: var(--bm-surface);
        box-sizing: border-box;
      }

      .bm-profile-avatar-frame img {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        background: var(--bm-fill);
      }

      .bm-profile-hero.is-loading .bm-profile-avatar-frame img,
      .bm-profile-hero.is-loading .bm-profile-name {
        animation: bm-profile-pulse 1.1s ease-in-out infinite alternate;
      }

      .bm-profile-identity {
        min-width: 0;
        margin-top: 10px;
      }

      .bm-profile-name-row {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 2px 8px;
        min-width: 0;
      }

      .bm-profile-name {
        min-width: 0;
        overflow: hidden;
        margin: 0;
        color: var(--bm-label);
        font-size: 22px;
        font-weight: 700;
        line-height: 28px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-profile-official {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--bm-accent-text);
        font-size: 13px;
        font-weight: 500;
        line-height: 18px;
      }

      .bm-profile-official::before {
        content: "";
        width: 13px;
        height: 13px;
        background: currentColor;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1 9.8 2.4 12 2.3l.7 2.1 1.8 1.3-.7 2.1.7 2.1-1.8 1.3L12 13.3l-2.2-.1L8 14.6l-1.8-1.4-2.2.1-.7-2.1L1.5 9.9l.7-2.1-.7-2.1 1.8-1.3L4 2.3l2.2.1z' fill='%23000'/%3E%3Cpath d='m5.4 8 1.8 1.8 3.4-3.6' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1 9.8 2.4 12 2.3l.7 2.1 1.8 1.3-.7 2.1.7 2.1-1.8 1.3L12 13.3l-2.2-.1L8 14.6l-1.8-1.4-2.2.1-.7-2.1L1.5 9.9l.7-2.1-.7-2.1 1.8-1.3L4 2.3l2.2.1z' fill='%23000'/%3E%3C/svg%3E") center / contain no-repeat;
      }

      .bm-profile-official[hidden],
      .bm-profile-signature[hidden] { display: none; }

      .bm-profile-signature {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        margin: 6px 0 0;
        color: var(--bm-secondary);
        font-size: 15px;
        line-height: 21px;
      }

      .bm-profile-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        margin-top: 10px;
        color: var(--bm-secondary);
        font-size: 13px;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
      }

      .bm-profile-meta-pill:first-child { color: var(--bm-tertiary); }

      .bm-profile-actions {
        position: absolute;
        top: 12px;
        right: max(16px, env(safe-area-inset-right));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }

      .bm-profile-follow {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 88px;
        height: 32px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: var(--bm-accent);
        font: inherit;
        font-size: 15px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        touch-action: manipulation;
      }

      .bm-profile-follow:active:not(:disabled) { opacity: 0.7; }
      .bm-profile-follow:disabled { cursor: default; opacity: 0.55; }

      .bm-profile-follow.is-following,
      .bm-profile-follow.is-mutual {
        color: var(--bm-secondary);
        background: var(--bm-fill);
      }

      .bm-profile-follow-icon,
      .bm-profile-follow-icon svg {
        display: block;
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .bm-profile-follow-icon svg path {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-profile-follow-message {
        max-width: 180px;
        color: #d70015;
        font-size: 12px;
        line-height: 16px;
        text-align: right;
      }

      .bm-profile-actions[hidden],
      .bm-profile-follow[hidden],
      .bm-profile-follow-message[hidden],
      .bm-profile-meta-pill[hidden] { display: none !important; }

      .bm-profile-content { min-height: 42vh; }

      .bm-profile-section-header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        max-width: 1320px;
        margin: 0 auto;
        padding: 20px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left));
        box-sizing: border-box;
      }

      .bm-profile-section-title {
        margin: 0;
        color: var(--bm-label);
        font-size: 20px;
        font-weight: 700;
        line-height: 25px;
      }

      .bm-profile-count {
        color: var(--bm-secondary);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      .bm-profile-count[hidden] { display: none; }

      .bm-profile-grid,
      .bm-profile-status,
      .bm-profile-sentinel {
        width: auto;
        margin-inline: max(8px, env(safe-area-inset-left));
      }

      /* ===== Bangumi ===== */
      .bm-bangumi-shell {
        display: block !important;
        position: relative;
        z-index: 100;
        width: 100%;
        min-height: 100vh;
        padding-bottom: calc(40px + env(safe-area-inset-bottom));
        color: var(--bm-label);
        box-sizing: border-box;
      }

      .bm-bangumi-heading {
        display: grid;
        min-width: 0;
        text-align: center;
      }

      .bm-bangumi-title {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-bangumi-current {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        color: var(--bm-secondary);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-bangumi-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        width: 100%;
        max-width: 960px;
        margin: 0 auto;
      }

      .bm-bangumi-content > * { min-width: 0; }

      .bm-bangumi-player-host {
        display: block;
        width: 100%;
        min-height: 1px;
      }

      .bm-bangumi-player-host > .bm-native-player {
        width: 100% !important;
        margin: 0 !important;
      }

      /* The episode grid below is the episode picker on this page. */
      .bm-bangumi-player-host .bm-native-selector { display: none !important; }

      .bm-bangumi-detail-card,
      .bm-bangumi-episodes {
        margin: 12px max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));
        border-radius: var(--bm-radius-group);
        background: var(--bm-surface);
      }

      .bm-bangumi-detail-card { padding: 14px 16px 16px; }

      .bm-bangumi-detail-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .bm-bangumi-detail-copy {
        display: grid;
        min-width: 0;
        gap: 3px;
      }

      .bm-bangumi-detail-label,
      .bm-bangumi-badge { display: none; }

      .bm-bangumi-detail-title {
        margin: 0;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
      }

      .bm-bangumi-detail-meta {
        color: var(--bm-secondary);
        font-size: 13px;
        line-height: 18px;
      }

      .bm-bangumi-evaluate {
        margin: 10px 0 0;
        color: var(--bm-secondary);
        font-size: 15px;
        line-height: 21px;
      }

      .bm-bangumi-episodes { padding: 14px 0; }

      .bm-bangumi-episodes-header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 0 16px 12px;
      }

      .bm-bangumi-episodes-title {
        margin: 0;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
      }

      .bm-bangumi-episodes-count {
        color: var(--bm-secondary);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      .bm-bangumi-group-tabs {
        display: flex;
        gap: 18px;
        overflow-x: auto;
        margin: -2px 0 12px;
        padding: 0 16px;
        border-bottom: var(--bm-hairline) solid var(--bm-separator);
        scroll-padding-inline: 16px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .bm-bangumi-group-tabs::-webkit-scrollbar { display: none; }

      .bm-bangumi-group-tab {
        appearance: none;
        position: relative;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: baseline;
        gap: 4px;
        height: 36px;
        padding: 0;
        border: 0;
        color: var(--bm-secondary);
        background: transparent;
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        touch-action: manipulation;
      }

      .bm-bangumi-group-tab.is-current { color: var(--bm-label); font-weight: 600; }

      .bm-bangumi-group-tab.is-current::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -0.5px;
        height: 2px;
        border-radius: 2px;
        background: var(--bm-brand);
      }

      .bm-bangumi-group-tab-label {
        align-self: center;
        overflow: hidden;
        max-width: 15rem;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-bangumi-group-tab-count {
        align-self: center;
        color: var(--bm-tertiary);
        font-size: 12px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }

      .bm-bangumi-group-panels,
      .bm-bangumi-group-panel { min-width: 0; }
      .bm-bangumi-group-panel[hidden] { display: none !important; }

      .bm-bangumi-episode-rail {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 0 16px;
        scroll-padding-inline: 16px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .bm-bangumi-episode-rail::-webkit-scrollbar { display: none; }

      .bm-bangumi-episode-button {
        appearance: none;
        flex: 0 0 auto;
        min-width: 48px;
        height: 40px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        color: var(--bm-label);
        background: var(--bm-fill);
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        touch-action: manipulation;
      }

      .bm-bangumi-episode-button.is-current {
        color: #fff;
        background: var(--bm-accent);
        font-weight: 600;
      }

      .bm-bangumi-episode-button:active { opacity: 0.6; }

      /* ===== Native player ===== */
      .bm-native-player {
        display: block !important;
        position: relative;
        min-width: 1px;
        overflow: hidden;
        color: var(--bm-label);
        background: var(--bm-page);
      }

      .bm-native-video-box {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        min-height: 168px;
        overflow: hidden;
        background: #000;
        transform: translateZ(0);
      }

      .bm-native-video {
        display: block;
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
        pointer-events: auto !important;
      }

      .bm-native-video[hidden] { display: none !important; }

      .bm-native-player-meta {
        display: grid;
        gap: 12px;
        padding: 12px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left));
        color: var(--bm-label);
        background: var(--bm-surface);
      }

      .bm-native-player-info {
        display: grid;
        min-width: 0;
        gap: 4px;
      }

      /* Only shown as a status line while audio-only mode is on. */
      .bm-native-player-kicker {
        display: none;
        color: var(--bm-accent-text);
        font-size: 13px;
        font-weight: 600;
        line-height: 18px;
      }

      .bm-native-player.is-audio-mode .bm-native-player-kicker { display: block; }

      .bm-native-player-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        min-width: 0;
        gap: 2px 8px;
      }

      .bm-native-player-title {
        flex: 1 1 100%;
        min-width: 0;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
        overflow-wrap: anywhere;
      }

      .bm-native-quality {
        min-width: 0;
        overflow: hidden;
        color: var(--bm-secondary);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-native-quality[hidden] { display: none !important; }

      .bm-native-player-creator {
        display: inline-flex;
        align-items: center;
        justify-self: start;
        min-width: 0;
        max-width: 100%;
        gap: 8px;
        margin-top: 6px;
        color: var(--bm-label);
        font-size: 15px;
        font-weight: 500;
        line-height: 20px;
        text-decoration: none;
      }

      .bm-native-player-creator-avatar {
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--bm-fill);
      }

      .bm-native-player-creator-name {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-native-player-creator-disclosure {
        flex: 0 0 auto;
        color: var(--bm-tertiary);
        font-size: 20px;
        font-weight: 400;
        line-height: 1;
      }

      .bm-native-player-creator:active { opacity: 0.5; }
      .bm-native-player-creator[hidden],
      .bm-native-player-creator-avatar[hidden],
      .bm-native-selector[hidden] { display: none !important; }

      /* ===== Video queue: collection videos or parts, between player and comments ===== */
      .bm-playlist-section {
        margin-top: 8px;
        padding: 14px 0;
        color: var(--bm-label);
        background: var(--bm-surface);
      }

      .bm-playlist-section[hidden] { display: none !important; }

      .bm-playlist-header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 0 max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
      }

      .bm-playlist-title {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-playlist-count {
        flex: 0 0 auto;
        color: var(--bm-secondary);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      .bm-playlist-rail {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
        scroll-padding-inline: 16px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .bm-playlist-rail::-webkit-scrollbar { display: none; }

      .bm-playlist-item-button {
        appearance: none;
        flex: 0 0 auto;
        max-width: min(240px, 64vw);
        height: 40px;
        padding: 0 12px;
        overflow: hidden;
        border: 0;
        border-radius: 8px;
        color: var(--bm-label);
        background: var(--bm-fill);
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
        text-overflow: ellipsis;
        touch-action: manipulation;
      }

      .bm-playlist-item-button.is-current {
        color: #fff;
        background: var(--bm-accent);
        font-weight: 600;
      }

      .bm-playlist-item-button:active { opacity: 0.6; }

      .bm-native-player-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow-x: auto;
        margin: 0 -16px;
        padding: 0 16px;
        scrollbar-width: none;
      }

      .bm-native-player-actions::-webkit-scrollbar { display: none; }

      .bm-native-selector,
      .bm-native-quality-selector,
      .bm-audio-mode-button,
      .bm-fullscreen-button {
        appearance: none;
        flex: 0 0 auto;
        height: 32px;
        border: 0;
        border-radius: 999px;
        color: var(--bm-label);
        background-color: var(--bm-fill);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        touch-action: manipulation;
      }

      .bm-native-selector,
      .bm-native-quality-selector {
        max-width: 46vw;
        padding: 0 28px 0 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        background-image: var(--bm-chevron);
        background-repeat: no-repeat;
        background-position: right 10px center;
        background-size: 12px;
      }

      .bm-native-quality-selector { max-width: 40vw; }
      .bm-native-quality-selector[hidden] { display: none !important; }

      .bm-audio-mode-button,
      .bm-fullscreen-button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0 13px 0 11px;
      }

      .bm-audio-mode-button svg,
      .bm-fullscreen-button svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-audio-mode-button.is-active {
        color: var(--bm-accent-text);
        background-color: var(--bm-accent-soft);
        font-weight: 600;
      }

      .bm-native-selector:active,
      .bm-native-quality-selector:active,
      .bm-audio-mode-button:active:not(:disabled),
      .bm-fullscreen-button:active:not(:disabled) { opacity: 0.6; }

      .bm-audio-mode-button[hidden],
      .bm-fullscreen-button[hidden] { display: none !important; }

      .bm-audio-mode-button:disabled,
      .bm-fullscreen-button:disabled { opacity: 0.4; }

      /* Audio-only: the cover, softened, behind Now Playing-style controls. */
      .bm-audio-only-view {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        align-content: center;
        overflow: hidden;
        padding: 16px max(20px, env(safe-area-inset-right)) 14px max(20px, env(safe-area-inset-left));
        background: #111;
        box-sizing: border-box;
      }

      .bm-audio-only-view[hidden] { display: none !important; }

      .bm-audio-only-artwork {
        position: absolute;
        inset: -20%;
        width: 140%;
        height: 140%;
        object-fit: cover;
        filter: blur(36px) saturate(160%);
        opacity: 0.7;
      }

      .bm-audio-only-artwork[hidden] { display: none; }

      .bm-audio-only-scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgb(0 0 0 / 18%), rgb(0 0 0 / 55%));
      }

      .bm-audio-only-panel {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: 14px;
        width: min(100%, 520px);
        margin: 0 auto;
        color: #fff;
      }

      .bm-audio-only-icon { display: none; }

      .bm-audio-only-copy {
        display: grid;
        justify-items: center;
        min-width: 0;
        max-width: 100%;
        gap: 2px;
        text-align: center;
      }

      .bm-audio-only-title {
        overflow: hidden;
        max-width: 100%;
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-audio-only-subtitle {
        overflow: hidden;
        max-width: 100%;
        color: rgb(255 255 255 / 68%);
        font-size: 13px;
        line-height: 18px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-audio-transport {
        display: grid;
        grid-template-columns: 1fr auto auto auto 1fr;
        grid-template-areas:
          "timeline timeline timeline timeline timeline"
          ". previous play next time";
        align-items: center;
        gap: 6px 22px;
        width: 100%;
      }

      .bm-audio-timeline { grid-area: timeline; }
      .bm-audio-skip-button.is-previous { grid-area: previous; }
      .bm-audio-play-button { grid-area: play; }
      .bm-audio-skip-button.is-next { grid-area: next; }

      .bm-audio-time {
        grid-area: time;
        justify-self: end;
        color: rgb(255 255 255 / 68%);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .bm-audio-play-button {
        appearance: none;
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #111;
        background: #fff;
        touch-action: manipulation;
      }

      .bm-audio-play-button svg {
        width: 22px;
        height: 22px;
        fill: currentColor;
      }

      .bm-audio-play-button .bm-audio-play-glyph { transform: translateX(1px); }
      .bm-audio-play-button .bm-audio-pause-glyph { display: none; }
      .bm-audio-play-button.is-playing .bm-audio-play-glyph { display: none; }
      .bm-audio-play-button.is-playing .bm-audio-pause-glyph { display: block; }

      .bm-audio-skip-button {
        appearance: none;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: transparent;
        touch-action: manipulation;
      }

      .bm-audio-skip-button[hidden] { display: none !important; }
      .bm-audio-skip-button:disabled { opacity: 0.3; }

      .bm-audio-skip-button svg {
        width: 22px;
        height: 22px;
        fill: currentColor;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-audio-play-button:active,
      .bm-audio-skip-button:active:not(:disabled) { opacity: 0.6; }

      .bm-audio-timeline {
        appearance: none;
        width: 100%;
        height: 4px;
        margin: 0;
        border-radius: 999px;
        background: rgb(255 255 255 / 28%);
        accent-color: #fff;
      }

      .bm-audio-timeline::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        border: 0;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 4px rgb(0 0 0 / 30%);
      }

      .bm-background-audio-host {
        position: fixed;
        left: 0;
        bottom: 0;
        z-index: -2147483647;
        width: 1px;
        height: 1px;
        overflow: hidden;
        opacity: 0.001;
        pointer-events: none;
      }

      .bm-native-audio {
        display: block;
        width: 1px;
        height: 1px;
      }

      .bm-player-loading {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 10px;
        color: rgb(255 255 255 / 80%);
        background: rgb(0 0 0 / 45%);
        font-size: 13px;
        pointer-events: none;
      }

      .bm-player-loading[hidden] { display: none !important; }

      .bm-player-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgb(255 255 255 / 24%);
        border-top-color: #fff;
        border-radius: 50%;
        animation: bm-spin 760ms linear infinite;
      }

      .bm-resume-toast {
        position: absolute;
        left: 50%;
        bottom: 52px;
        z-index: 3;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: calc(100% - 32px);
        padding: 6px 6px 6px 14px;
        border-radius: 999px;
        color: #fff;
        background: rgb(30 30 30 / 72%);
        font-size: 13px;
        line-height: 18px;
        white-space: nowrap;
        transform: translateX(-50%);
        -webkit-backdrop-filter: blur(16px);
        backdrop-filter: blur(16px);
      }

      .bm-resume-toast[hidden] { display: none !important; }

      .bm-resume-toast-text {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bm-resume-toast-button {
        appearance: none;
        flex: 0 0 auto;
        padding: 4px 11px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: rgb(255 255 255 / 20%);
        font: inherit;
        font-weight: 600;
      }

      .bm-player-error {
        min-height: 220px;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 14px;
        padding: 32px 24px;
        color: rgb(255 255 255 / 86%);
        background: #111;
        font-size: 15px;
        line-height: 21px;
        text-align: center;
        box-sizing: border-box;
      }

      .bm-player-error[hidden] { display: none !important; }

      /* ===== Comments ===== */
      .bm-video-comments {
        position: relative;
        z-index: 1;
        margin-top: 8px;
        padding: 14px max(16px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        color: var(--bm-label);
        background: var(--bm-surface);
        box-sizing: border-box;
      }

      .bm-comments-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
      }

      .bm-comments-heading { min-width: 0; }

      .bm-comments-title-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .bm-comments-title {
        margin: 0;
        color: var(--bm-label);
        font-size: 17px;
        font-weight: 600;
        line-height: 22px;
      }

      .bm-comments-count {
        color: var(--bm-secondary);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      .bm-comments-count[hidden] { display: none !important; }

      .bm-comments-sort { flex: 0 0 auto; }
      .bm-comments-sort-button { height: 26px; font-size: 12px; }

      .bm-comments-list { display: grid; }

      .bm-comment-card {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 10px;
        padding: 12px 0;
      }

      .bm-comment-card + .bm-comment-card .bm-comment-content {
        position: relative;
      }

      .bm-comment-card + .bm-comment-card::before {
        content: "";
        grid-column: 2;
        grid-row: 1;
        align-self: start;
        height: var(--bm-hairline);
        margin-top: -12px;
        background: var(--bm-separator);
      }

      .bm-comment-avatar-link {
        grid-column: 1;
        grid-row: 1;
        display: block;
        align-self: start;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        text-decoration: none;
      }

      .bm-comment-avatar {
        display: block;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--bm-fill);
      }

      .bm-comment-content {
        grid-column: 2;
        grid-row: 1;
        display: grid;
        min-width: 0;
        gap: 6px;
      }

      .bm-comment-top {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      .bm-comment-author-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        min-width: 0;
        gap: 5px;
      }

      .bm-comment-author {
        min-width: 0;
        overflow: hidden;
        color: var(--bm-secondary);
        font-size: 13px;
        font-weight: 600;
        line-height: 18px;
        text-decoration: none;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-comment-author:active,
      .bm-comment-reply-author:active { opacity: 0.5; }

      .bm-comment-badge {
        flex: 0 0 auto;
        padding: 0 4px;
        border-radius: 3px;
        color: var(--bm-accent-text);
        background: var(--bm-accent-soft);
        font-size: 10px;
        font-weight: 600;
        line-height: 15px;
      }

      .bm-comment-badge.is-uploader {
        color: #fff;
        background: var(--bm-accent);
      }

      .bm-comment-time {
        overflow: hidden;
        color: var(--bm-tertiary);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .bm-comment-message {
        color: var(--bm-label);
        font-size: 15px;
        line-height: 22px;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }

      .bm-comment-emote {
        display: inline-block;
        width: 22px;
        height: 22px;
        margin: -3px 1px;
        object-fit: contain;
        vertical-align: middle;
      }

      .bm-comment-gallery {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        max-width: 320px;
      }

      .bm-comment-gallery[data-count="1"] {
        grid-template-columns: minmax(0, 1fr);
        max-width: 220px;
      }

      .bm-comment-gallery[data-count="2"],
      .bm-comment-gallery[data-count="4"] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        max-width: 240px;
      }

      .bm-comment-picture-button {
        appearance: none;
        display: block;
        min-width: 0;
        padding: 0;
        border: 0;
        border-radius: 6px;
        overflow: hidden;
        background: var(--bm-fill);
        cursor: zoom-in;
        touch-action: manipulation;
      }

      .bm-comment-picture-button:active { opacity: 0.7; }

      .bm-comment-picture {
        display: block;
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
      }

      .bm-comment-gallery[data-count="1"] .bm-comment-picture { aspect-ratio: 4 / 3; }

      /* ===== Image viewer ===== */
      .bm-image-viewer {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        color: #fff;
        background: rgb(0 0 0 / var(--bm-viewer-fade, 1));
        -webkit-font-smoothing: antialiased;
        animation: bm-viewer-in 180ms ease-out;
      }

      .bm-image-viewer-track {
        display: flex;
        width: 100%;
        height: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior: contain;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        touch-action: pan-x pinch-zoom;
        transform: translateY(var(--bm-viewer-drag, 0px));
      }

      .bm-image-viewer-track::-webkit-scrollbar { display: none; }
      .bm-image-viewer.is-zoomed .bm-image-viewer-track { overflow-x: hidden; }
      .bm-image-viewer:not(.is-dragging) .bm-image-viewer-track { transition: transform 200ms ease; }

      .bm-image-viewer-slide {
        position: relative;
        display: flex;
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        overflow: hidden;
        scroll-snap-align: center;
        scroll-snap-stop: always;
      }

      .bm-image-viewer-slide.is-zoomed {
        overflow: auto;
        touch-action: pan-x pan-y pinch-zoom;
        scrollbar-width: none;
      }

      .bm-image-viewer-slide.is-zoomed::-webkit-scrollbar { display: none; }

      .bm-image-viewer-image {
        display: block;
        flex: 0 0 auto;
        max-width: 100%;
        max-height: 100%;
        margin: auto;
        object-fit: contain;
        opacity: 0;
        transition: opacity 160ms ease;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        cursor: zoom-in;
      }

      .bm-image-viewer-slide.is-loaded .bm-image-viewer-image { opacity: 1; }
      .bm-image-viewer-slide.is-zoomed .bm-image-viewer-image { max-width: none; max-height: none; cursor: zoom-out; }

      .bm-image-viewer-spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border: 2px solid rgb(255 255 255 / 22%);
        border-top-color: #fff;
        border-radius: 50%;
        animation: bm-spin 760ms linear infinite;
      }

      .bm-image-viewer-slide.is-loaded .bm-image-viewer-spinner,
      .bm-image-viewer-slide.is-error .bm-image-viewer-spinner { display: none; }

      .bm-image-viewer-slide.is-error::after {
        content: attr(data-error);
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: rgb(255 255 255 / 70%);
        font-size: 15px;
      }

      .bm-image-viewer-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: grid;
        grid-template-columns: 44px 1fr 44px;
        align-items: center;
        padding: calc(4px + env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) 4px max(8px, env(safe-area-inset-left));
        pointer-events: none;
        transition: opacity 160ms ease;
      }

      .bm-image-viewer.is-dragging .bm-image-viewer-bar,
      .bm-image-viewer.is-dragging .bm-image-viewer-nav { opacity: 0; }

      .bm-image-viewer-close {
        appearance: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: transparent;
        pointer-events: auto;
        touch-action: manipulation;
      }

      .bm-image-viewer-close::before {
        content: "";
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgb(255 255 255 / 16%);
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
      }

      .bm-image-viewer-close svg,
      .bm-image-viewer-nav svg {
        position: relative;
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-image-viewer-counter {
        grid-column: 2;
        justify-self: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgb(255 255 255 / 16%);
        font-size: 13px;
        font-weight: 600;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
      }

      .bm-image-viewer-counter[hidden] { display: none; }

      /* Arrow buttons only where there is a mouse; touch uses swipe. */
      .bm-image-viewer-nav {
        appearance: none;
        position: absolute;
        top: 50%;
        display: none;
        place-items: center;
        width: 44px;
        height: 44px;
        margin-top: -22px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: rgb(255 255 255 / 16%);
        cursor: pointer;
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
      }

      .bm-image-viewer-nav.is-previous { left: max(16px, env(safe-area-inset-left)); }
      .bm-image-viewer-nav.is-next { right: max(16px, env(safe-area-inset-right)); }
      .bm-image-viewer-nav:disabled { opacity: 0.25; cursor: default; }

      @media (hover: hover) and (pointer: fine) {
        .bm-image-viewer-nav:not([hidden]) { display: grid; }
      }

      .bm-image-viewer :focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }

      @keyframes bm-viewer-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .bm-comment-replies {
        display: grid;
        gap: 4px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--bm-surface-2);
      }

      .bm-comment-reply {
        min-width: 0;
        color: var(--bm-label);
        font-size: 14px;
        line-height: 20px;
        overflow-wrap: anywhere;
      }

      .bm-comment-reply-author {
        display: inline;
        color: var(--bm-accent-text);
        font-size: inherit;
        font-weight: 500;
        line-height: inherit;
        text-decoration: none;
      }

      .bm-comment-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 18px;
      }

      .bm-comment-action {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--bm-secondary);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      .bm-comment-action svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .bm-comments-status {
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px;
        color: var(--bm-secondary);
        font-size: 13px;
        text-align: center;
        box-sizing: border-box;
      }

      .bm-comments-status:empty { min-height: 12px; padding: 0; }

      .bm-comments-status[data-state="loading"]::before {
        content: "";
        width: 15px;
        height: 15px;
        border: 2px solid var(--bm-fill-strong);
        border-top-color: var(--bm-secondary);
        border-radius: 50%;
        animation: bm-spin 760ms linear infinite;
      }

      .bm-comments-status[data-state="done"] { color: var(--bm-tertiary); }
      .bm-comments-retry { min-height: 32px; padding-inline: 14px; font-size: 13px; }
      .bm-comments-sentinel { height: 1px; }

      .bm-comment-skeleton .bm-comment-avatar,
      .bm-comment-skeleton .bm-skeleton-line { animation: bm-profile-pulse 1.1s ease-in-out infinite alternate; }
      .bm-skeleton-line.is-comment-author { width: 30%; height: 11px; }
      .bm-skeleton-line.is-comment-line { width: 94%; height: 11px; }
      .bm-skeleton-line.is-comment-short { width: 68%; height: 11px; }

      /* ===== Wider screens ===== */
      @media (min-width: 600px) {
        .bm-recommend-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .bm-recommend-view { padding-inline: max(16px, env(safe-area-inset-left)); }
      }

      @media (min-width: 900px) {
        .bm-recommend-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }

      @media (min-width: 1200px) {
        .bm-recommend-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      }

      @media (min-width: 720px) {
        html.bm-native-video-active #app .m-video-player > .bm-native-player,
        html.bm-native-video-active .m-video-normal > .bm-native-player,
        .bm-bangumi-content { padding-inline: 16px; box-sizing: border-box; }
        .bm-native-video-box { border-radius: var(--bm-radius-group); }
        .bm-native-player-meta,
        .bm-video-comments { margin-top: 12px; border-radius: var(--bm-radius-group); }
        .bm-native-player { background: transparent; }
        .bm-bangumi-detail-card,
        .bm-bangumi-episodes { margin-inline: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .bm-recommend-fab,
        .bm-recommend-cover img {
          transition: none;
        }

        .bm-recommend-card.is-image-loading .bm-recommend-cover::after,
        .bm-skeleton-block::after,
        .bm-skeleton-line::after,
        .bm-profile-hero.is-loading .bm-profile-avatar-frame img,
        .bm-profile-hero.is-loading .bm-profile-name,
        .bm-recommend-fab.is-refreshing svg {
          animation: none;
        }

        .bm-player-spinner,
        .bm-recommend-status[data-state="loading"]::before,
        .bm-comments-status[data-state="loading"]::before {
          animation-duration: 2.4s;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .bm-image-viewer { animation: none; }
        .bm-image-viewer-track { scroll-behavior: auto; }
      }

      @keyframes bm-fab-turn {
        to { transform: rotate(360deg); }
      }

      @keyframes bm-profile-pulse {
        from { opacity: 0.55; }
        to { opacity: 1; }
      }

      @keyframes bm-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes bm-shimmer {
        to { transform: translateX(120%); }
      }
    `;

    const appendStyle = () => {
      if (style.isConnected || document.getElementById(STYLE_ID)) return true;
      const mount = document.head || document.documentElement;
      if (!mount) return false;
      mount.appendChild(style);
      return true;
    };

    if (appendStyle()) return;
    const observer = new MutationObserver(() => {
      if (!appendStyle()) return;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }

})();