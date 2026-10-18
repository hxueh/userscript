// ==UserScript==
// @name         WSJ Dark Mode
// @namespace    https://greasyfork.org/users/36282-hxueh
// @version      0.1.2
// @description  A calm dark mode for The Wall Street Journal that follows the system theme. It covers every page, including menus, paywalls, charts and market tables, without relying on WSJ class names.
// @author       hxueh
// @license      MIT
// @icon         https://s.wsj.net/img/meta/wsj_favicon.svg
// @match        https://wsj.com/*
// @match        https://*.wsj.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    // WSJ builds its UI with hashed CSS-in-JS class names. Rules that target
    // class names break on every site release and miss new components. This
    // script darkens the whole page with one filter instead. The filter
    // inverts all colors, so any white surface becomes dark and any dark text
    // becomes light, whatever its class name is.
    //
    // The CSS lives inside a media query. The browser then switches the theme
    // when the system theme changes, and the script needs no JavaScript
    // listeners or MutationObserver.
    const CSS = `
@media (prefers-color-scheme: dark) {
    /* invert(.92) maps white to about #141414. Pure black would look harsh
       and would smear on OLED screens. hue-rotate(180deg) undoes the hue
       change that inversion causes, so blue stays blue and red stays red.
       This keeps the green and red of stock quotes correct. */
    html {
        background: #fff;
        filter: invert(.92) hue-rotate(180deg);
        /* The page scrollbar is outside the filter, so color it directly. */
        scrollbar-color: #4a4a4a #141414;
    }

    /* Undo the filter on content that carries its own colors, so photos
       and video keep their real colors instead of looking like negatives.
       invert(1) hue-rotate(180deg) cancels the root filter. brightness(.85)
       runs before the root filter, so it dims the final image a little,
       which suits a dark page. */
    img,
    picture,
    video,
    [style*="background-image"] {
        filter: brightness(.85) invert(1) hue-rotate(180deg);
    }

    /* Restore only the outermost media element. WSJ wraps photos as
       <picture><img></picture>, and filters stack, so restoring both would
       invert the photo again. */
    :is(img, picture, video, [style*="background-image"])
        :is(img, picture, video, [style*="background-image"]) {
        filter: none;
    }

    /* SVG logos and icons loaded as images are usually dark art on a light
       surface. Leave them with only the root filter so they turn light on
       the dark page. */
    img[src$=".svg"],
    img[src*=".svg?"] {
        filter: none;
    }

    /* Text selection: the filter would invert the default highlight. */
    ::selection {
        background: #b3d4fc;
        color: #000;
    }
}
`;

    // Add the style as early as possible, before the first paint, so the page
    // never flashes white. At document-start <head> does not exist yet, so
    // attach to the root element.
    const style = document.createElement('style');
    style.id = 'wsj-dark-mode';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);

    // Some WSJ scripts replace the document head on navigation. Put the style
    // back if that removes it.
    new MutationObserver(() => {
        if (!style.isConnected) {
            (document.head || document.documentElement).appendChild(style);
        }
    }).observe(document.documentElement, { childList: true });
})();
