// ==UserScript==
// @name         Max: Always Highest Video Quality
// @name:zh-CN   Max：始终使用最高画质
// @namespace    https://github.com/hxueh
// @version      0.2.0
// @description  Makes Max (HBO Max) stream at the highest resolution the title offers by trimming each tier of the DASH manifest to its top rung, so adaptive bitrate cannot fall back to 234p–480p.
// @description:zh-CN 将 DASH 清单中每个档位裁剪到最高一档，让 Max（HBO Max）始终以设备可用的最高分辨率播放，自适应码率无法降到 234p–480p。
// @author       hxueh
// @license      MIT
// @match        https://play.max.com/*
// @match        https://play.hbomax.com/*
// @match        https://www.max.com/*
// @match        https://www.hbomax.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @icon         https://www.max.com/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  // Max has no quality picker. Its player starts at a low rung (360p) and lets
  // adaptive bitrate (ABR) climb, and ABR also steps down on any throughput
  // dip. The only reliable lever is the manifest itself: if each tier of the
  // DASH MPD lists nothing but its top resolution, ABR has nothing to drop to.
  // The tiers a device may use are still decided by its DRM license: Widevine
  // L3 (macOS/Linux Chrome, Firefox) gets the SD tier (576p), L1 devices get
  // the 720p and 1080p tiers as well.
  // With @grant none this runs in the page context, so patching fetch/XHR here
  // changes what the player's own code receives.

  const MPD_URL = /\.mpd(?:$|[?#])/i;
  const XML_NS = "urn:mpeg:dash:schema:mpd:2011";

  const isVideoSet = (set) => {
    const type = set.getAttribute("contentType") || set.getAttribute("mimeType") || "";
    if (type) return type.startsWith("video");
    // Fall back to the Representations when the set itself carries no type.
    const rep = set.getElementsByTagNameNS(XML_NS, "Representation")[0];
    return !!rep && (rep.getAttribute("mimeType") || "").startsWith("video");
  };

  // Everything the script does is logged here so a problem on a device I
  // cannot test (Safari, Windows L1) can be diagnosed from the console alone.
  const log = (...args) => console.log("[max-hq]", ...args);

  // Dropping the lower tiers is only attempted where the license is likely to
  // grant the top tier's key (not Widevine L3), and is switched off for good
  // if it ever ends in a DRM error. localStorage can throw (private mode).
  const FALLBACK_KEY = "max-hq-keep-all-tiers";
  const readFlag = () => {
    try {
      return localStorage.getItem(FALLBACK_KEY) === "1";
    } catch (_) {
      return false;
    }
  };

  const probeDrm = async (system, robustness) => {
    try {
      await navigator.requestMediaKeySystemAccess(system, [
        {
          initDataTypes: ["cenc"],
          videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.640029"', robustness }],
        },
      ]);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Resolved once; fetch/XHR hooks wait on it before rewriting a manifest.
  const drmSupport = (async () => {
    if (!navigator.requestMediaKeySystemAccess) return {};
    const widevineL1 = await probeDrm("com.widevine.alpha", "HW_SECURE_ALL");
    const widevineL3 = await probeDrm("com.widevine.alpha", "SW_SECURE_CRYPTO");
    const fairplay = await probeDrm("com.apple.fps", "");
    const support = { widevineL1, widevineL3, fairplay };
    log("DRM support:", support);
    return support;
  })();

  async function wantTopTierOnly() {
    if (readFlag()) return false;
    const { widevineL1, fairplay } = await drmSupport;
    return !!(widevineL1 || fairplay);
  }

  const heightOf = (rep) => Number(rep.getAttribute("height")) || 0;

  // Returns the rewritten MPD text, or the original text if there is nothing
  // to rewrite or anything looks off (a broken manifest is worse than ABR).
  function keepHighestResolution(text, topTierOnly) {
    try {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return text;
      const root = doc.documentElement;
      if (!root || root.localName !== "MPD") return text;

      let changed = false;
      const summary = [];
      for (const period of root.getElementsByTagNameNS(XML_NS, "Period")) {
        if (topTierOnly) {
          // Remove every video AdaptationSet whose best rung is below the
          // best rung of the period, so the player has only the top tier.
          const videoSets = [...period.getElementsByTagNameNS(XML_NS, "AdaptationSet")].filter(isVideoSet);
          const best = (set) => Math.max(0, ...[...set.getElementsByTagNameNS(XML_NS, "Representation")].map(heightOf));
          const top = Math.max(0, ...videoSets.map(best));
          for (const set of videoSets) {
            if (top && best(set) < top) {
              set.remove();
              changed = true;
            }
          }
        }
        // Max splits the ladder over several AdaptationSets, one per
        // resolution tier, each with its own DRM key (SD / 720p / 1080p).
        // Which tiers a device may use is decided by the license, so the sets
        // are left in place and only the rungs inside each set are trimmed.
        // Dropping a whole tier breaks playback with a "DRM System
        // Encountered a Problem" error when the license denies the keys of
        // the tier left behind.
        for (const set of [...period.getElementsByTagNameNS(XML_NS, "AdaptationSet")].filter(isVideoSet)) {
          const reps = [...set.getElementsByTagNameNS(XML_NS, "Representation")];
          const top = Math.max(0, ...reps.map(heightOf));
          summary.push(`${reps.map(heightOf).sort((a, b) => a - b).join("/")}p -> ${top}p`);
          for (const rep of reps) {
            // Representations without a height are left alone.
            if (heightOf(rep) && heightOf(rep) < top) {
              rep.remove();
              changed = true;
            }
          }
        }
      }
      log(changed ? "manifest trimmed, video tiers:" : "manifest left unchanged, video tiers:", summary, topTierOnly ? "(top tier only)" : "(all tiers kept)");
      return changed ? new XMLSerializer().serializeToString(doc) : text;
    } catch (e) {
      log("manifest rewrite failed, using the original", e);
      return text;
    }
  }

  // fetch: hand the player a fresh Response built from the rewritten body.
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await nativeFetch.call(this, input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (!MPD_URL.test(url) || !response.ok) return response;
      const text = keepHighestResolution(await response.clone().text(), await wantTopTierOnly());
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (_) {
      return response;
    }
  };

  // XMLHttpRequest: shadow response/responseText on the instance once the
  // request is known to be a manifest, so reads return the rewritten body.
  // XHR reads are synchronous, so the decision is cached as soon as the DRM
  // probe settles (it settles long before a manifest request is answered).
  let topTierOnlyNow = false;
  wantTopTierOnly().then((v) => (topTierOnlyNow = v));

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (MPD_URL.test(String(url))) {
      this.addEventListener("readystatechange", () => {
        if (this.readyState !== 4 || this.status < 200 || this.status >= 300) return;
        if (this.responseType !== "" && this.responseType !== "text") return;
        const rewritten = keepHighestResolution(this.responseText, topTierOnlyNow);
        for (const prop of ["response", "responseText"]) {
          Object.defineProperty(this, prop, { configurable: true, get: () => rewritten });
        }
      });
    }
    return nativeOpen.call(this, method, url, ...rest);
  };

  // The resolution the player is actually showing. "resize" does not bubble,
  // so it is caught in the capture phase on the document.
  document.addEventListener(
    "resize",
    (e) => {
      const v = e.target;
      if (v instanceof HTMLVideoElement && v.videoWidth) log(`playing ${v.videoWidth}x${v.videoHeight}`);
    },
    true
  );

  // If the license refuses the top tier the player shows a DRM error page.
  // Remember that, and reload once with every tier kept so playback recovers.
  const watchForDrmError = () => {
    new MutationObserver(() => {
      if (readFlag() || !/DRM System Encountered a Problem/i.test(document.body?.innerText || "")) return;
      if (!topTierOnlyNow) return;
      log("DRM error with top tier only, keeping all tiers from now on");
      try {
        localStorage.setItem(FALLBACK_KEY, "1");
      } catch (_) {
        return;
      }
      location.reload();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  };
  watchForDrmError();
})();
