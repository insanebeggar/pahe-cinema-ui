// ==UserScript==
// @name         Cinema UI for Pahe
// @namespace    https://github.com/insanebeggar/pahe-cinema-ui
// @version      1.2.1
// @description  Editorial film-catalogue redesign with optional TMDb posters, cast and live search.
// @author       insane.beggar
// @license      MIT
// @icon         https://raw.githubusercontent.com/insanebeggar/pahe-cinema-ui/main/icon.png
// @homepageURL  https://github.com/insanebeggar/pahe-cinema-ui
// @supportURL   https://github.com/insanebeggar/pahe-cinema-ui/issues
// @downloadURL  https://raw.githubusercontent.com/insanebeggar/pahe-cinema-ui/main/pahe-cinema-ui.user.js
// @updateURL    https://raw.githubusercontent.com/insanebeggar/pahe-cinema-ui/main/pahe-cinema-ui.user.js
// @match        https://pahe.ink/*
// @match        https://pahe.in/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.themoviedb.org
// @connect      letterboxd.com
// ==/UserScript==

(function () {
  'use strict';

  const root = document.documentElement;

  const store = {
    get(k, d) {
      try {
        return GM_getValue(k, d);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        GM_setValue(k, v);
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  const DEFAULTS = {
    theme: 'dark',
    view: 'grid',
    q: '',
    host: '',
    bg: 'on',
    veil: 0.8,
    desc: 'on',
    mast: 'cinema',
    tmdb: 'on',
    tmdbKey: '',
    tmdbPosters: 'on',
    tmdbPage: 'on',
    tmdbMast: 'on',
    tmdbExact: 'on',
    cols: 5,
    live: 'on',
    runtime: 'min',
    letterboxd: 'on',
    lbrating: 'on',
  };
  const state = {};
  Object.keys(DEFAULTS).forEach((k) => {
    const v = store.get(k, DEFAULTS[k]);
    state[k] = typeof DEFAULTS[k] === 'number' ? Number(v) || DEFAULTS[k] : v;
  });

  function apply() {
    root.setAttribute('data-pm-theme', state.theme);
    root.setAttribute('data-pm-view', state.view);
    root.setAttribute('data-pm-bg', state.bg);
    root.setAttribute('data-pm-desc', state.desc);
    root.setAttribute('data-pm-mast', state.mast);
    root.style.setProperty('--veil', String(state.veil));
    root.style.setProperty('--cols', String(state.cols));
  }
  apply();

  const UI = [];
  let NEED_RELOAD = false;
  const refreshUI = () => UI.forEach((f) => f());

  function setSetting(k, v) {
    state[k] = v;
    store.set(k, v);
    apply();
    if (k === 'theme') {
      resetGuard();
      requestAnimationFrame(() => runGuard(false));
    }
    refreshUI();
  }

  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ---- runtime formatting (minutes or hours) ---- */
  const RT = [];
  function parseMins(txt) {
    txt = String(txt || '');
    const h = txt.match(/(\d+)\s*h(?:ours?|rs?)?\b/i);
    const m = txt.match(/(\d+)\s*(?:min(?:ute)?s?|mn|m)\b/i);
    if (!h && !m) return null;
    return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  }
  function fmtRuntime(raw) {
    const mins = parseMins(raw);
    if (mins == null) return raw;
    const approx = /~/.test(raw) ? '~' : '';
    if (state.runtime === 'hours' && mins >= 60) {
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      return approx + hh + 'h' + (mm ? ' ' + String(mm).padStart(2, '0') + 'm' : '');
    }
    return approx + mins + ' min';
  }
  function trackRuntime(node, raw) {
    node.dataset.raw = raw;
    node.textContent = fmtRuntime(raw);
    RT.push(node);
  }
  UI.push(() => RT.forEach((n) => (n.textContent = fmtRuntime(n.dataset.raw))));

  const letterboxdUrl = (h) =>
    h.imdb
      ? 'https://letterboxd.com/imdb/' + h.imdb + '/'
      : 'https://letterboxd.com/search/films/' + encodeURIComponent(h.name + (h.year ? ' ' + h.year : '')) + '/';
  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }
  function iconIMDb() {
    const s = svgEl('svg', { viewBox: '0 0 40 20', width: '34', height: '17', 'aria-hidden': 'true', class: 'pm-ico' });
    s.appendChild(svgEl('rect', { width: '40', height: '20', rx: '3', fill: '#F5C518' }));
    const t = svgEl('text', { x: '20', y: '15', 'text-anchor': 'middle', 'font-family': 'Arial Black, Arial, sans-serif', 'font-weight': '900', 'font-size': '13', fill: '#000' });
    t.textContent = 'IMDb';
    s.appendChild(t);
    return s;
  }
  function iconLetterboxd(size) {
    const k = size || 16;
    const s = svgEl('svg', { viewBox: '0 0 30 16', width: String(Math.round(k * 1.875)), height: String(k), 'aria-hidden': 'true', class: 'pm-ico' });
    s.appendChild(svgEl('circle', { cx: '8', cy: '8', r: '7', fill: '#FF8000' }));
    s.appendChild(svgEl('circle', { cx: '15', cy: '8', r: '7', fill: '#00E054', 'fill-opacity': '.92' }));
    s.appendChild(svgEl('circle', { cx: '22', cy: '8', r: '7', fill: '#40BCF4', 'fill-opacity': '.92' }));
    return s;
  }

  function letterboxdLink(h) {
    const a = el('a', 'pm-cta pm-lb');
    a.append(iconLetterboxd(16), document.createTextNode('Letterboxd \u2197'));
    a.href = letterboxdUrl(h);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function gmText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('no GM_xmlhttpRequest'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        headers: { Accept: 'text/html' },
        onload: (r) => {
          if (r.status >= 400) reject(Object.assign(new Error('HTTP ' + r.status), { status: r.status }));
          else resolve({ text: String(r.responseText || ''), finalUrl: r.finalUrl || url });
        },
        onerror: reject,
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function parseLetterboxd(html) {
    const blk = (html.match(/"aggregateRating"\s*:\s*\{[\s\S]*?\}/) || [])[0];
    if (blk) {
      const rv = (blk.match(/"ratingValue"\s*:\s*"?([\d.]+)/) || [])[1];
      const rc = (blk.match(/"ratingCount"\s*:\s*"?(\d+)/) || [])[1];
      if (rv) return { r: Number(rv), n: rc ? Number(rc) : 0 };
    }
    const m = html.match(/name="twitter:data2"\s+content="([\d.]+)\s+out of 5"/i) || html.match(/content="([\d.]+)\s+out of 5"\s+name="twitter:data2"/i);
    return m ? { r: Number(m[1]), n: 0 } : null;
  }

  const shortCount = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));

  async function letterboxdInfo(tt, tmdbId) {
    const key = tt ? 'i:' + tt : tmdbId ? 't:' + tmdbId : '';
    if (!key) return null;
    const cache = store.get('lbcache', {}) || {};
    const c = cache[key];
    if (c && Date.now() - c.t < 3 * 864e5) return c.v || null;
    const url = tt ? 'https://letterboxd.com/imdb/' + tt + '/' : 'https://letterboxd.com/tmdb/' + tmdbId + '/';
    let v = null;
    try {
      const res = await gmText(url);
      v = parseLetterboxd(res.text);
      if (v) v.u = res.finalUrl || url;
    } catch (e) {
      return null;
    }
    const fresh = store.get('lbcache', {}) || {};
    fresh[key] = { t: Date.now(), v: v || 0 };
    const keys = Object.keys(fresh);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete fresh[k]);
    store.set('lbcache', fresh);
    return v;
  }

  async function enrichLetterboxd(tt, tmdbId) {
    if (state.letterboxd !== 'on' || state.lbrating !== 'on' || document.querySelector('.pm-lbr')) return;
    const v = await letterboxdInfo(tt, tmdbId);
    const rates = document.querySelector('.pm-rates');
    if (!v || !rates || rates.querySelector('.pm-lbr')) return;
    const box = el('a', 'pm-rating pm-lbr');
    box.href = v.u;
    box.target = '_blank';
    box.rel = 'noopener noreferrer';
    box.title = 'Open on Letterboxd';
    const cap = el('span', '');
    cap.append(iconLetterboxd(11), document.createTextNode(' Letterboxd' + (v.n ? ' \u00B7 ' + shortCount(v.n) + ' ratings' : '') + ' \u00B7 out of 5'));
    box.append(el('b', '', v.r.toFixed(1)), cap);
    rates.appendChild(box);
    const lb = document.querySelector('.pm-lb');
    if (lb && v.u) lb.href = v.u;
  }

  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href =
    'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
  (document.head || root).appendChild(fonts);

  /* ------------------------------------------------------------------ */
  /*  CSS                                                                */
  /* ------------------------------------------------------------------ */

  const CSS = `
  :root{
    --serif:"Instrument Serif","Times New Roman",Georgia,serif;
    --sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --bg:#0a0a0a;--bg-rgb:10,10,10;--bg2:#151515;--ink:#f1ede4;--mu:#8f8b82;--rule:rgba(241,237,228,.16);
    --sig:#ff4d3d;--strip:#000;--hole:#ece7da;--gut:clamp(18px,4vw,64px);--veil:.88;--nav-h:47px;--cols:5;
    color-scheme:dark;
  }
  html[data-pm-theme="light"]{
    --bg:#f4f2ec;--bg-rgb:244,242,236;--bg2:#eae7df;--ink:#0d0d0d;--mu:#625f58;--rule:rgba(13,13,13,.2);
    --strip:#0d0d0d;--hole:#f4f2ec;color-scheme:light;
  }

  html{background-color:var(--bg);scroll-behavior:smooth;overflow-x:clip;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
  ::selection{background:var(--sig);color:#fff}
  body,body.dark-skin{background-color:transparent;color:var(--ink);font:400 15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
  body .wrapper-outer{background:transparent}
  body #wrapper.boxed-all,body .inner-wrapper{background:transparent;box-shadow:none;border:0;width:auto;max-width:none;margin:0;padding:0;overflow:visible}
  [hidden][hidden][hidden][hidden]{display:none}

  body .background-cover{display:block;position:fixed;inset:0;width:auto;height:auto;z-index:-1;pointer-events:none;background-size:cover;background-position:center}
  body .background-cover::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:var(--veil)}
  html[data-pm-bg="off"] body .background-cover{display:none}
  html[data-pm-bgsrc="body"] body{background-image:linear-gradient(rgba(var(--bg-rgb),var(--veil)),rgba(var(--bg-rgb),var(--veil))),var(--pm-body-img);background-size:auto,var(--pm-body-size);background-position:0 0,var(--pm-body-pos);background-repeat:no-repeat,var(--pm-body-repeat);background-attachment:fixed,var(--pm-body-att)}
  html[data-pm-bgsrc="body"][data-pm-bg="off"] body{background-image:none}

  body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:9990;opacity:.07;mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
  html[data-pm-theme="light"] body::after{opacity:.05;mix-blend-mode:multiply}

  /* colour reset: whatever the theme paints inside these regions, we repaint */
  body :where(#main-content,#sidebar,#slide-out,#top-nav,#main-nav,.footer-bottom) :where(*:not([style*="background-image"])){color:inherit;background-color:transparent;background-image:none;text-shadow:none;box-shadow:none;filter:none;border-radius:0;border-color:var(--rule)}
  html:not([data-pm-mast="orig"]) body :where(.header-content) :where(*:not(.pm-mast,.pm-mast *)){color:inherit;background-color:transparent;background-image:none;text-shadow:none;box-shadow:none;border-radius:0;border-color:var(--rule)}
  body :where(#main-content,#sidebar,#slide-out,#top-nav,#main-nav,.footer-bottom){color:var(--ink)}
  body :where(#main-content,#sidebar,#slide-out) :where(input,textarea,select){color:var(--ink)}
  body h1,body h2,body h3,body h4{font-family:var(--serif);font-weight:400}
  body a:not(.shortc-button){color:inherit;text-decoration:none}
  body a:not(.shortc-button):hover{text-decoration:underline;text-underline-offset:.2em;text-decoration-thickness:1px}
  body img{max-width:100%}
  body .clear{display:none}
  body .stripe-line{display:none}

  body .container{width:auto;max-width:1680px;margin:0 auto;padding-left:var(--gut);padding-right:var(--gut);box-sizing:border-box}

  /* ---------- masthead ---------- */
  body #top-nav{background:var(--bg);border:0;border-bottom:1px solid var(--rule);box-shadow:none;height:auto}
  body #top-nav a{font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  body #top-nav a:hover{color:var(--ink)}
  body #top-nav .container{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 24px;padding-top:10px;padding-bottom:10px}
  body #top-nav .top-menu{float:none}
  body #top-nav .top-menu ul{display:flex;flex-wrap:wrap;gap:4px 22px;list-style:none;margin:0;padding:0}
  body #top-nav .top-menu li{float:none;border:0;background:none;padding:0;margin:0}
  body #top-nav .top-menu a{padding:0;height:auto;background:none;line-height:1}
  body #top-nav .search-block{float:none;position:relative;margin:0 0 0 auto;width:auto}
  body #top-nav .search-block input{background:none;border:0;border-bottom:1px solid var(--rule);border-radius:0;color:var(--ink);font:500 11px/1.4 var(--mono);letter-spacing:.1em;padding:6px 26px 6px 0;width:170px;height:auto;box-shadow:none;transition:width .25s,border-color .25s}
  body #top-nav .search-block input:focus{border-bottom-color:var(--ink);width:260px;outline:0}
  body #top-nav .search-block .search-button{position:absolute;right:0;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--mu);box-shadow:none;padding:0;width:24px;height:24px}
  body #top-nav .search-block .search-button i{color:var(--mu)}
  body #top-nav .social-icons{float:none;display:flex;gap:14px}
  body #top-nav .social-icons a{background:none;border:0;padding:0;margin:0;width:auto;height:auto;line-height:1}

  html:not([data-pm-mast="orig"]) body .header-content{background:none;border:0;text-align:center;padding:clamp(22px,4vw,46px) var(--gut) clamp(16px,2.5vw,30px);height:auto}
  html:not([data-pm-mast="orig"]) body .header-content .logo{float:none;margin:0;width:auto;max-width:none;height:auto;text-align:center;position:relative;z-index:3;background:none}
  html:not([data-pm-mast="orig"]) body .logo :where(h1,h2){margin:0;line-height:1;width:auto;height:auto;text-indent:0;font-size:inherit;background:none}
  html:not([data-pm-mast="orig"]) body .logo :where(img,strong){display:none}
  html:not([data-pm-mast="orig"]) body .logo a{display:inline-block;text-indent:0;overflow:visible;width:auto;height:auto;background:none;font-size:inherit;line-height:1}
  html:not([data-pm-mast="orig"]) body .logo a::before{content:"Pahe";display:block;font:400 clamp(60px,10vw,140px)/.82 var(--serif);letter-spacing:-.035em;color:var(--ink);text-indent:0}
  html:not([data-pm-mast="orig"]) body .logo a::after{content:"HQ films \\00b7  affordable size";display:block;margin-top:16px;font:500 11px/1 var(--mono);letter-spacing:.32em;text-transform:uppercase;color:var(--mu);text-indent:0}
  html[data-pm-mast="cinema"] body .header-content{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:clamp(210px,25vw,330px);padding:0 var(--gut);background-color:#060606}
  html[data-pm-mast="cinema"] body .logo a::before{color:#f1ede4;text-shadow:0 2px 40px rgba(0,0,0,.65)}
  html[data-pm-mast="cinema"] body .logo a::after{color:rgba(241,237,228,.72)}
  html[data-pm-mast="orig"] body .logo img{display:inline-block}
  body #slide-out-open span,body #slide-out-open span:before,body #slide-out-open span:after{background:var(--ink)}
  html[data-pm-mast="cinema"] body #slide-out-open span,html[data-pm-mast="cinema"] body #slide-out-open span:before,html[data-pm-mast="cinema"] body #slide-out-open span:after{background:#f1ede4}
  html[data-pm-mast="cinema"] body #slide-out-open span,html[data-pm-mast="cinema"] body #slide-out-open span:before,html[data-pm-mast="cinema"] body #slide-out-open span:after{background:#f1ede4}

  body #main-nav{background:rgba(var(--bg-rgb),.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);box-shadow:none;height:auto}
  body #main-nav :where(.main-menu,ul,li){background:transparent;list-style:none}
  body #main-nav a{font:500 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);background:none;border:0;text-indent:0;text-decoration:none;white-space:nowrap;visibility:visible}
  body #main-nav a::before,body #main-nav a::after,body #main-nav li::before,body #main-nav li::after,body #main-nav .sf-sub-indicator,body #main-nav .menu-sub-content::before,body #main-nav .menu-sub-content::after,body #top-nav a::before,body #top-nav a::after,body #top-nav li::before,body #top-nav li::after{content:none;display:none}
  body #main-nav a i{display:inline-block;position:static;float:none;margin:0 8px 0 0;font-size:13px;width:auto;height:auto;line-height:1;color:inherit;text-indent:0;visibility:visible}
  body #main-nav ul ul{position:absolute;top:100%;left:0;margin:0;z-index:1000;width:max-content;min-width:220px;max-width:min(380px,92vw);box-sizing:border-box;background:var(--bg);border:1px solid var(--ink);border-radius:0;box-shadow:6px 6px 0 var(--rule);padding:6px 0}
  body #main-nav ul ul ul{top:-7px;left:100%}
  body #main-nav ul ul.pm-flip{left:auto;right:0}
  body #main-nav ul ul ul.pm-flip{left:auto;right:100%}
  body #main-nav ul ul li{position:relative;display:block;float:none;width:auto;margin:0;border:0;background:var(--bg)}
  body #main-nav ul ul a{display:block;white-space:nowrap;padding:11px 18px;line-height:1.3;height:auto;color:var(--ink);position:static;top:0;border:0}
  body #main-nav ul ul li:hover>a{background:var(--ink);color:var(--bg);text-decoration:none}
  @media (min-width:1000px){
    body #theme-header{display:contents}
    body #main-nav{position:sticky;top:0;z-index:999}
    body #main-nav .main-menu>ul{display:flex;align-items:stretch;justify-content:center;margin:0;padding:0;float:none;width:auto}
    body #main-nav .main-menu>ul>li{float:none;display:flex;align-items:stretch;margin:0;padding:0;border:0;position:relative;top:0;height:auto}
    body #main-nav .main-menu>ul>li>a{display:flex;align-items:center;box-sizing:border-box;height:48px;padding:0 22px;margin:0;line-height:1;position:static;top:0;transform:none;overflow:visible;width:auto;max-width:none}
    body #main-nav .main-menu>ul>li:hover>a,body #main-nav .main-menu>ul>li.current-menu-item>a,body #main-nav .main-menu>ul>li.current-menu-ancestor>a,body #main-nav .main-menu>ul>li.current-menu-parent>a,body #main-nav .main-menu>ul>li.sfHover>a{box-shadow:inset 0 -3px 0 var(--ink);text-decoration:none}
  }
  body #slide-out{background:var(--bg)}
  body #slide-out a{color:var(--ink)}
  body #slide-out input{background:none;border:0;border-bottom:1px solid var(--ink);color:var(--ink);border-radius:0}

  /* ---------- layout ---------- */
  body #main-content{display:block;width:auto;max-width:1680px;margin:0 auto;padding:clamp(24px,4vw,56px) var(--gut) 140px;box-sizing:border-box;background:none}
  body #main-content>.clear{display:none}
  body .content{float:none;width:auto;margin:0;padding:0;background:none}
  body #crumbs{background:none;border:0;padding:0 0 26px;margin:0;font:500 10px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu);box-shadow:none}
  body #crumbs .delimiter{margin:0 8px;opacity:.5}

  /* ---------- drawer ---------- */
  body #sidebar{position:fixed;top:0;right:0;height:100vh;width:min(440px,92vw);overflow-y:auto;float:none;margin:0;padding:0 28px 140px;box-sizing:border-box;background:var(--bg);border-left:1px solid var(--ink);z-index:10020;visibility:hidden;transform:translateX(102%);transition:transform .45s cubic-bezier(.7,0,.2,1),visibility 0s .45s}
  html.pm-index body #sidebar{visibility:visible;transform:none;transition:transform .45s cubic-bezier(.7,0,.2,1),visibility 0s}
  body #sidebar .theiaStickySidebar{position:static;transform:none;width:auto;padding:0}
  .pm-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .35s;z-index:10015}
  html.pm-index .pm-scrim{opacity:1;pointer-events:auto}
  .pm-dh{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;margin:0 -28px 8px;padding:22px 28px 16px;background:var(--bg);border-bottom:1px solid var(--ink)}
  .pm-dh span{font:400 40px/1 var(--serif)}
  .pm-dh button,.pm-search .pm-x,.pm-mini{all:unset;cursor:pointer;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--ink)}

  .pm-set{padding:18px 0;border-bottom:1px solid var(--rule)}
  .pm-set h4,.pm-rec h4{font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin:0 0 14px}
  .pm-set-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 0}
  .pm-set-l{font:400 22px/1 var(--serif)}
  .pm-seg{display:flex;border:1px solid var(--ink)}
  .pm-seg button{all:unset;cursor:pointer;padding:8px 12px;font:500 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink)}
  .pm-seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
  .pm-set input[type=range]{width:150px;accent-color:var(--ink)}
  .pm-rec{padding:18px 0;border-bottom:1px solid var(--rule)}
  .pm-rec ul{list-style:none;margin:0;padding:0}
  .pm-rec li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--rule)}
  .pm-rec a{font:400 19px/1.15 var(--serif)}
  .pm-rec small{font:400 10px/1.6 var(--mono);letter-spacing:.1em;color:var(--mu);white-space:nowrap}
  .pm-rec .pm-mini{margin-top:12px;display:inline-block}

  body #sidebar .widget,body #sidebar .text-html-box{background:none;border:0;border-bottom:1px solid var(--rule);border-radius:0;margin:0;padding:22px 0;box-shadow:none;overflow:visible}
  body #sidebar .text-html-box{display:flex;gap:12px;align-items:center}
  body #sidebar .text-html-box img{height:auto;max-width:46%;filter:grayscale(1);opacity:.8;transition:filter .2s,opacity .2s}
  body #sidebar .text-html-box img:hover{filter:none;opacity:1}
  body #sidebar .widget-top{padding:0 0 12px;margin:0;border:0;background:none}
  body #sidebar .widget-top h4{font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin:0;padding:0;border:0}
  body #sidebar .widget-container{padding:0;background:none;border:0;margin:0}
  body #sidebar ul.tabs{display:flex;gap:18px;list-style:none;margin:0 0 10px;padding:0;border:0;background:none}
  body #sidebar ul.tabs li{float:none;margin:0;padding:0;border:0;background:none}
  body #sidebar ul.tabs li a{display:block;padding:0 0 6px;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);border-bottom:2px solid transparent;background:none;height:auto}
  body #sidebar ul.tabs li.active a{color:var(--ink);border-bottom-color:var(--ink)}
  body #sidebar .widget ul{list-style:none;margin:0;padding:0}
  body #sidebar .tabs-wrap ul li,body #sidebar .posts-list ul li{display:grid;grid-template-columns:44px 1fr;column-gap:14px;padding:12px 0;margin:0;border:0;border-top:1px solid var(--rule);background:none;overflow:visible}
  body #sidebar .post-thumbnail{float:none;grid-row:1/3;width:44px;margin:0;padding:0}
  body #sidebar .post-thumbnail img{width:44px;height:auto;display:block;border:0}
  body #sidebar .post-thumbnail img.avatar{height:44px;object-fit:cover;filter:grayscale(1)}
  body #sidebar li h3{font:400 18px/1.15 var(--serif);margin:0}
  body #sidebar .tie-date{display:block;font:400 10px/1.6 var(--mono);letter-spacing:.1em;color:var(--mu);margin-top:2px}
  body #sidebar .tabs-wrap li>a{font-size:13px;line-height:1.4}
  body #sidebar select{width:100%;background:none;color:var(--ink);border:0;border-bottom:1px solid var(--ink);border-radius:0;padding:8px 0;font:500 12px var(--mono)}
  body #sidebar select option{background:var(--bg);color:var(--ink)}
  body #sidebar .tagcloud{padding:0}
  body #sidebar .tagcloud a{display:inline-block;margin:0 14px 8px 0;font:400 11px/1.4 var(--mono) !important;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}
  body #sidebar .tagcloud a:hover{color:var(--ink)}

  /* ---------- section heads ---------- */
  .pm-head,body .page-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border:0;border-bottom:1px solid var(--ink);padding:0 0 14px;margin:0 0 clamp(24px,4vw,44px);background:none}
  .pm-head h2,body .page-head .page-title{font:400 clamp(40px,7vw,96px)/.9 var(--serif);margin:0;padding:0;border:0;letter-spacing:-.025em;background:none}
  body .page-head .page-title span{font-style:italic;border-bottom:3px solid var(--sig)}
  .pm-head span,.pm-count{font:500 10px/1.6 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);text-align:right}

  /* ---------- film strip ---------- */
  body .pic-grid{margin:0 0 clamp(36px,6vw,84px);padding:0;border:0;background:none}
  body .pic-grid::before{content:"New on the shelf";display:block;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin-bottom:12px}
  body .pic-grid .cat-box-content{padding:0;background:none;border:0}
  body .pic-grid ul{display:flex;gap:6px;overflow-x:auto;list-style:none;margin:0;padding:28px 14px;scrollbar-width:none;
    background:
      linear-gradient(90deg,var(--hole) 0 12px,transparent 12px) 0 9px/28px 9px repeat-x local,
      linear-gradient(90deg,var(--hole) 0 12px,transparent 12px) 0 calc(100% - 9px)/28px 9px repeat-x local,
      var(--strip)}
  body .pic-grid ul::-webkit-scrollbar{display:none}
  body .pic-grid li{flex:0 0 auto;float:none;width:112px;margin:0;padding:0;border:0;background:none}
  body .pic-grid .post-thumbnail{float:none;margin:0;width:112px}
  body .pic-grid img{width:112px;height:168px;object-fit:cover;display:block;filter:grayscale(.45) contrast(1.05);transition:filter .3s,transform .3s}
  body .pic-grid a:hover img{filter:none;transform:scale(1.04)}

  /* ---------- catalogue cards (home, archives, search) ---------- */
  body .recent-box{background:none;border:0;padding:0;margin:0}
  body .recent-box .cat-box-content,body .timeline-contents{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:clamp(34px,4vw,56px) clamp(18px,2vw,30px);padding:0;margin:0;list-style:none;background:none;border:0}
  body .recent-box .cat-box-content>.clear{display:none}
  body ul.timeline{display:contents;list-style:none;margin:0;padding:0}
  body .timeline-head{grid-column:1/-1}
  body ul.timeline::before,body ul.timeline::after,body li.timeline-post::before,body li.timeline-post::after,body .timeline-content::before,body .timeline-content::after{content:none;display:none}
  body li.timeline-post{float:none;width:auto;margin:0;padding:0;border:0;background:none;min-width:0}
  body .timeline-content{float:none;width:auto;margin:0;padding:0;border:0;background:none}
  body .archive-box,body .archive-box .post-inner{background:none;border:0;box-shadow:none;padding:0;margin:0}
  body .timeline-head{display:flex;align-items:baseline;gap:18px;margin:clamp(34px,5vw,64px) 0 22px;padding:0;border:0;font:400 clamp(30px,4vw,54px)/1 var(--serif);background:none}
  body .timeline-head::after{content:"";flex:1;border-top:1px solid var(--rule)}
  body .timeline-head:first-child{margin-top:0}

  body .pm-card{position:relative;display:flex;flex-direction:column;background:none;border:0;padding:0;margin:0;animation:pmUp .6s cubic-bezier(.2,.7,.2,1) var(--d,0ms) backwards}
  @keyframes pmUp{from{opacity:0;transform:translateY(16px)}}
  body .pm-card .post-thumbnail{order:0;position:relative;float:none;width:100%;margin:0;padding:0;aspect-ratio:2/3;overflow:hidden;background-color:var(--bg2);box-shadow:0 22px 36px -24px rgba(0,0,0,.75);transition:transform .35s cubic-bezier(.2,.7,.2,1)}
  body .pm-card .post-thumbnail::after{content:"";position:absolute;inset:0 auto 0 0;width:9px;background:linear-gradient(90deg,rgba(255,255,255,.3),rgba(255,255,255,0) 90%);mix-blend-mode:overlay;pointer-events:none;z-index:2}
  body .pm-card .post-thumbnail a{display:block;height:100%}
  body .pm-card .post-thumbnail img{width:100%;height:100%;object-fit:cover;display:block;border:0;padding:0;border-radius:0;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
  body .pm-card:hover .post-thumbnail{transform:translateY(-6px)}
  body .pm-card:hover .post-thumbnail img{transform:scale(1.05)}

  .pm-row{order:1;display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding:10px 0 8px;border-top:1px solid var(--ink);font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  body .pm-card .post-box-title{order:2;margin:0;padding:0;border:0;background:none;font:400 24px/1.02 var(--serif);letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  body .pm-card .post-box-title a:visited{color:var(--mu)}
  .pm-sub{order:3;display:block;margin-top:10px;font:400 10.5px/1.7 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}
  .pm-sub span{display:block}
  .pm-fmt{color:var(--ink);opacity:.8}
  body .pm-card .post-meta{order:4;display:none;font:400 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu);padding:0;margin:0;border:0;background:none}
  body .pm-card .timeline-date{order:4;display:block;margin-top:8px;font:400 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  body .pm-card .post-meta *{color:var(--mu)}
  body .pm-card .post-cats,body .pm-card .post-comments{display:none}
  .pm-flag{position:absolute;top:10px;left:14px;z-index:4;background:var(--sig);color:#fff;padding:5px 8px;font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase}

  body .pm-card .entry{position:absolute;top:0;left:0;right:0;aspect-ratio:2/3;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;padding:20px;overflow:hidden;background:linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,.9));color:#f1ede4;opacity:0;pointer-events:none;transition:opacity .35s;z-index:3;margin:0}
  body .pm-card .entry :where(*){color:#f1ede4}
  body .pm-card .entry p{margin:0;font:italic 400 17px/1.3 var(--serif);display:-webkit-box;-webkit-line-clamp:9;-webkit-box-orient:vertical;overflow:hidden}
  body .pm-card .entry a.more-link{display:none}
  @media (hover:hover){body .pm-card:hover .entry{opacity:1}}

  /* ledger layout */
  html[data-pm-view="ledger"] body .recent-box .cat-box-content,html[data-pm-view="ledger"] body .timeline-contents,html[data-pm-view="ledger"] body .pt-cv-page{grid-template-columns:1fr;gap:0}
  html[data-pm-view="ledger"] body .pm-card{display:grid;grid-template-columns:96px 64px minmax(0,1fr) minmax(150px,240px) 150px;grid-template-areas:"no th ti fm dt" "no th b fm dt" "no th de fm dt";grid-template-rows:auto auto 1fr;column-gap:30px;row-gap:4px;align-items:start;padding:24px 0;border-top:1px solid var(--rule);transition:background .2s}
  html[data-pm-view="ledger"] body .pm-card:hover{background:var(--bg2)}
  html[data-pm-view="ledger"] .pm-row,html[data-pm-view="ledger"] .pm-sub{display:contents}
  html[data-pm-view="ledger"] .pm-no{grid-area:no;align-self:center;font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  html[data-pm-view="ledger"] .pm-yr{display:none}
  html[data-pm-view="ledger"] .pm-b{grid-area:b;font:400 10.5px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}
  html[data-pm-view="ledger"] .pm-fmt{grid-area:fm;align-self:center;font:400 10.5px/1.5 var(--mono);letter-spacing:.06em;text-transform:uppercase}
  html[data-pm-view="ledger"] body .pm-card .post-thumbnail{grid-area:th;width:64px;box-shadow:none}
  html[data-pm-view="ledger"] body .pm-card:hover .post-thumbnail{transform:none}
  html[data-pm-view="ledger"] body .pm-card .post-thumbnail::after,html[data-pm-view="ledger"] .pm-flag{display:none}
  html[data-pm-view="ledger"] body .pm-card .post-box-title{grid-area:ti;font-size:28px;-webkit-line-clamp:1}
  html[data-pm-view="ledger"] body .pm-card .post-meta,html[data-pm-view="ledger"] body .pm-card .timeline-date{grid-area:dt;align-self:center;display:block;margin:0;white-space:nowrap}
  html[data-pm-view="ledger"] body .pm-card .post-meta i,html[data-pm-view="ledger"] body .pm-card .timeline-date i{display:none}
  html[data-pm-view="ledger"][data-pm-desc="off"] body .pm-card .entry{display:none}
  html[data-pm-view="ledger"][data-pm-desc="on"] body .pm-card .entry{display:block;position:static;grid-area:de;aspect-ratio:auto;opacity:1;pointer-events:auto;background:none;padding:8px 0 0;margin:0;overflow:visible;color:var(--mu)}
  html[data-pm-view="ledger"][data-pm-desc="on"] body .pm-card .entry :where(*){color:var(--mu)}
  html[data-pm-view="ledger"][data-pm-desc="on"] body .pm-card .entry p{font:italic 400 17px/1.4 var(--serif);-webkit-line-clamp:2;max-width:62ch}
  @media (max-width:1100px){
    html[data-pm-view="ledger"] body .pm-card{grid-template-columns:80px 56px minmax(0,1fr) 130px;grid-template-areas:"no th ti dt" "no th b dt" "no th fm dt" "no th de dt";grid-template-rows:auto;column-gap:22px}
    html[data-pm-view="ledger"] body .pm-card .post-thumbnail{width:56px}
  }

  /* pagination */
  body .recent-box-pagination{margin-top:clamp(40px,6vw,80px)}
  body .pagination{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:baseline;padding:18px 0 0;border:0;border-top:1px solid var(--ink);background:none;margin-top:clamp(40px,6vw,80px)}
  body .recent-box-pagination .pagination{margin-top:0}
  body .pagination .pages{font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);margin-right:auto;padding:0;background:none;border:0;float:none}
  body .pagination a,body .pagination .current,body .pagination .extend,body .pagination #tie-next-page a{float:none;margin:0;padding:0 0 4px;background:none;border:0;border-bottom:2px solid transparent;border-radius:0;font:400 24px/1 var(--serif);color:var(--mu);box-shadow:none;min-width:0;height:auto}
  body .pagination a:hover{color:var(--ink);text-decoration:none;border-bottom-color:var(--ink)}
  body .pagination .current{color:var(--ink);border-bottom-color:var(--sig)}
  body .pagination #tie-next-page{float:none;margin:0;padding:0;background:none;border:0}

  /* ---------- A-Z lists ---------- */
  body #the-post.type-page .post-title{font:400 clamp(48px,8vw,120px)/.9 var(--serif);letter-spacing:-.03em;margin:0 0 28px;padding:0 0 18px;border:0;border-bottom:1px solid var(--ink)}
  body #the-post.type-page .post-meta:empty{display:none}
  body #the-post.type-page{background:none;border:0;box-shadow:none;padding:0;margin:0 0 40px}
  body #the-post.type-page .post-inner{background:none;padding:0;border:0}
  body #the-post.type-page .entry{font:400 17px/1.7 var(--sans)}
  body #the-post.type-page .entry :where(h2,h3,h4){font-family:var(--serif)}
  body #the-post.type-page .entry p a{text-decoration:underline;text-underline-offset:.2em}

  .pm-filter{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 28px;border-bottom:1px solid var(--ink);margin:0 0 18px;padding-bottom:10px}
  .pm-filter input{all:unset;box-sizing:border-box;flex:1 1 280px;font:400 clamp(28px,4vw,48px)/1.1 var(--serif);color:var(--ink);caret-color:var(--sig)}
  .pm-filter input::placeholder{color:var(--mu);opacity:.55}
  .pm-filter span{font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  body .az-letters-wrap{position:sticky;top:var(--nav-h);z-index:50;background:var(--bg);border-bottom:1px solid var(--ink);padding:8px 0;margin:0 0 6px}
  body .az-links{display:flex;flex-wrap:wrap;gap:2px 4px;list-style:none;margin:0;padding:0}
  body .az-links li{float:none;margin:0;padding:0;border:0;background:none;display:block}
  body .az-links li>a,body .az-links li>span{display:block;min-width:30px;padding:4px 6px;text-align:center;font:400 26px/1 var(--serif);color:var(--ink)}
  body .az-links li.no-posts>span,body .az-links li.pm-dim>a{opacity:.25}
  body .az-links li>a:hover,body .az-links li>a.pm-on{background:var(--ink);color:var(--bg);text-decoration:none}
  body .items-outer,body .items-inner{background:none;border:0;padding:0;margin:0}
  body .letter-section{display:grid;grid-template-columns:clamp(90px,13vw,190px) minmax(0,1fr);column-gap:clamp(18px,3vw,48px);border-top:1px solid var(--ink);padding:28px 0 18px;scroll-margin-top:calc(var(--nav-h) + 74px);float:none;width:auto}
  body .letter-title{grid-row:1/3;margin:0;padding:0;border:0;background:none;font:400 clamp(72px,12vw,170px)/.8 var(--serif)}
  body .letter-title span{position:sticky;top:calc(var(--nav-h) + 90px);display:block;background:none}
  body ul.az-columns{column-width:300px;column-gap:44px;list-style:none;margin:0;padding:0;display:block;width:auto}
  body ul.az-columns li{display:block;break-inside:avoid;margin:0;padding:9px 0;border-top:1px solid var(--rule);float:none;width:auto;background:none}
  body ul.az-columns li a{display:block}
  body ul.az-columns .pm-t{font:400 21px/1.15 var(--serif)}
  body ul.az-columns .pm-y{margin-left:8px;font:500 11px/1 var(--mono);letter-spacing:.06em;color:var(--mu)}
  body ul.az-columns .pm-fm2{display:block;margin-top:3px;font:400 10px/1.5 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mu)}
  body ul.az-columns li a:visited .pm-t{color:var(--mu)}
  body .letter-section .back-to-top{grid-column:2;margin:12px 0 0;text-align:right;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);background:none;border:0;padding:0;position:static;float:none;width:auto;height:auto}
  body .letter-section .back-to-top a{color:var(--mu)}

  /* ---------- film page ---------- */
  body #the-post{background:none;border:0;box-shadow:none;padding:0;margin:0 0 40px}
  body #the-post .post-inner{padding:0;background:none;border:0}
  body #the-post .entry{margin:0;padding:0}
  body #the-post.pm-hero-ok .imdbwp{display:none}
  body #the-post .imdbwp{background:none;border:1px solid var(--rule);color:var(--ink);padding:16px;margin-bottom:24px;box-shadow:none}

  .pm-hero{display:grid;grid-template-columns:minmax(200px,400px) minmax(0,1fr);gap:clamp(28px,6vw,96px);padding:6px 0 clamp(40px,6vw,80px)}
  .pm-poster{position:sticky;top:calc(var(--nav-h) + 24px);align-self:start;margin:0;box-shadow:0 40px 70px -30px rgba(0,0,0,.8)}
  .pm-poster::after{content:"";position:absolute;inset:0 auto 0 0;width:14px;background:linear-gradient(90deg,rgba(255,255,255,.3),rgba(255,255,255,0));mix-blend-mode:overlay;pointer-events:none}
  .pm-poster img{display:block;width:100%;height:auto}
  .pm-kicker{font:500 10px/1.6 var(--mono);letter-spacing:.22em;text-transform:uppercase;color:var(--mu);margin:0 0 18px}
  .pm-stat{display:inline-block;margin:0 0 18px;padding:5px 9px;background:var(--sig);color:#fff;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase}
  .pm-film{font:400 clamp(52px,8.5vw,128px)/.88 var(--serif);letter-spacing:-.03em;margin:0 0 22px;overflow-wrap:anywhere}
  .pm-line{font:500 11px/1.8 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu);margin:0 0 30px;padding-bottom:22px;border-bottom:1px solid var(--ink)}
  .pm-rating{display:flex;align-items:baseline;gap:16px;margin:0 0 26px}
  .pm-rating b{font:400 clamp(56px,7vw,92px)/.8 var(--serif)}
  .pm-rating span{font:500 10px/1.6 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  .pm-teaser{font:400 clamp(21px,2.1vw,28px)/1.35 var(--serif);max-width:34em;margin:0 0 30px}
  .pm-credits{display:grid;grid-template-columns:120px 1fr;margin:0 0 34px;max-width:720px}
  .pm-credits dt,.pm-credits dd{margin:0;padding:12px 0;border-top:1px solid var(--rule)}
  .pm-credits dt{font:500 10px/1.9 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  .pm-credits dd{font-size:15px}
  .pm-actions{display:flex;flex-wrap:wrap;gap:12px}
  body a.pm-cta{display:inline-flex;align-items:center;gap:10px;padding:15px 24px;border:1px solid var(--ink);font:500 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);transition:background .2s,color .2s}
  body a.pm-cta:hover{background:var(--ink);color:var(--bg);text-decoration:none}
  body a.pm-cta.pm-solid{background:var(--ink);color:var(--bg)}
  body a.pm-cta.pm-solid:hover{background:var(--sig);border-color:var(--sig);color:#fff}

  .pm-spec{display:grid;grid-template-columns:170px minmax(0,1fr);max-width:860px;margin:0 0 clamp(40px,6vw,80px)}
  .pm-spec::before{content:"Technical specifications";grid-column:1/-1;font:400 clamp(28px,3.4vw,44px)/1 var(--serif);padding-bottom:16px}
  .pm-spec dt,.pm-spec dd{margin:0;padding:12px 0;border-top:1px solid var(--rule)}
  .pm-spec dt{font:500 10px/1.9 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  .pm-spec dd{font:400 13px/1.7 var(--mono);letter-spacing:.02em;overflow-wrap:anywhere}
  .pm-spec dd a{text-decoration:underline;text-underline-offset:.25em}
  body #the-post .entry code.pm-gone,body #the-post .entry p:has(>code.pm-gone){display:none}
  body #the-post .entry code{display:block;background:none;border:1px solid var(--rule);padding:14px 16px;font:13px/1.85 var(--mono);color:var(--ink);white-space:normal;margin:0 0 18px}
  body #the-post .e3lan:empty{display:none}

  /* editions section */
  .pm-ed{border-top:1px solid var(--ink);padding-top:22px;margin:0}
  .pm-edlabel{margin:0 0 16px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  body .pm-ed .post-title{margin:0 0 8px;padding:0;border:0;background:none;font:400 clamp(24px,3vw,40px)/1.1 var(--serif);letter-spacing:-.01em}
  body #the-post.pm-nohero .pm-ed .post-title{font-size:clamp(40px,6vw,88px);line-height:.95}
  body .pm-ed .post-meta{display:flex;flex-wrap:wrap;gap:6px 24px;margin:0 0 22px;padding:0;border:0;background:none;font:400 10px/1.6 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mu)}
  body .pm-ed .post-meta *{color:var(--mu)}
  .pm-qbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 34px;margin:14px 0 8px;padding:12px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
  .pm-qg{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px}
  .pm-qg>b{font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin-right:6px}
  .pm-qg button{all:unset;cursor:pointer;padding:6px 0;border-bottom:2px solid transparent;font:500 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mu)}
  .pm-qg button:hover{color:var(--ink)}
  .pm-qg button[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--ink)}
  .pm-newbar{margin:16px 0;padding:12px 16px;border:1px solid var(--sig);font:500 11px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase}
  .pm-newbar::before{content:"New";background:var(--sig);color:#fff;padding:3px 8px;margin-right:12px}
  body .post-tabs-ver{background:none;border:0;padding:0;margin:0;display:block;width:auto;overflow:visible}
  body ul.tabs-nav{display:flex;flex-wrap:wrap;gap:6px 26px;list-style:none;margin:0 0 6px;padding:0;border:0;float:none;width:auto;background:none}
  body ul.tabs-nav li{float:none;margin:0;padding:10px 0;width:auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--mu);cursor:pointer;font:500 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase}
  body ul.tabs-nav li:hover{color:var(--ink)}
  body ul.tabs-nav li.current{color:var(--ink);border-bottom-color:var(--ink)}
  body ul.tabs-nav li.pm-new::after{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--sig);margin-left:8px;vertical-align:middle}
  body .post-tabs-ver .pane{float:none;width:auto;margin:0;padding:0;border:0;min-height:0;background:none;overflow:visible}

  body .box.download{background:none;border:0;border-top:1px solid var(--rule);border-radius:0;margin:0;padding:0;box-shadow:none;color:var(--ink)}
  body .box.download .box-inner-block{padding:6px 0 18px;margin:0;background:none;color:var(--ink);font:400 13px/1.7 var(--mono)}
  body .box.download .box-inner-block>i.fa{display:none}
  body .box.download b,body .box.download strong{font-weight:500;color:var(--ink)}
  .pm-qt{padding:10px 0 4px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  .pm-q{display:grid;grid-template-columns:minmax(150px,230px) minmax(120px,1fr) auto;gap:8px 28px;align-items:center;padding:16px 0;border-top:1px solid var(--rule)}
  .pm-ql small{display:block;margin-bottom:4px;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  .pm-ql b{font:400 38px/1 var(--serif)}
  .pm-ql i{margin-left:12px;font:500 11px/1 var(--mono);font-style:normal;letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-qz{font:500 13px/1.3 var(--mono);letter-spacing:.04em}
  .pm-qz small{display:block;margin-top:3px;font:400 10px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  .pm-qb{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
  .pm-qx{padding:6px 0;font:400 11px/1.6 var(--mono);color:var(--mu)}
  .pm-box.pm-none::after{content:"Nothing matches your quality / host filter in this tab. Choose All.";display:block;padding:18px 0;font:500 11px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-box.pm-none .pm-qt{display:none}
  .pm-q[hidden][hidden][hidden][hidden],.pm-ed a.shortc-button[hidden][hidden][hidden][hidden]{display:none}

  body a.shortc-button{display:inline-flex;align-items:center;gap:8px;min-width:48px;justify-content:center;padding:7px 13px;margin:3px 6px 3px 0;background:transparent;background-image:none;border:1px solid var(--ink);border-radius:0;box-shadow:none;text-shadow:none;color:var(--ink);font:500 11px/1.3 var(--mono);letter-spacing:.12em;transition:background .15s,color .15s}
  body .pm-qb a.shortc-button{margin:0}
  body a.shortc-button::before{content:"";width:6px;height:6px;background:var(--dot,var(--ink));flex:none}
  body a.shortc-button.red{--dot:#e5484d}body a.shortc-button.green{--dot:#3fb67a}body a.shortc-button.purple{--dot:#9b83ff}body a.shortc-button.orange{--dot:#f29a3a}body a.shortc-button.blue{--dot:#4aa3ff}body a.shortc-button.white{--dot:var(--mu)}
  body a.shortc-button:hover{background:var(--ink);color:var(--bg);text-decoration:none}

  body .post-modified-info{margin:22px 0 0;font:400 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  body .yarpp-related{margin:clamp(40px,6vw,80px) 0 0;padding-top:22px;border-top:1px solid var(--ink);background:none}
  body .yarpp-related h3{font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin:0 0 16px}
  body .yarpp-related ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));column-gap:40px}
  body .yarpp-related li{margin:0;padding:0;background:none;border:0;border-top:1px solid var(--rule)}
  body .yarpp-related li a{display:block;padding:13px 0;font:400 20px/1.15 var(--serif)}
  body .yarpp-related li a::after{content:" \\2192";color:var(--mu)}

  body .post-tag{margin:0 0 40px;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  body .post-tag a{margin-left:14px;border-bottom:1px solid var(--rule)}
  body .post-navigation{display:grid;grid-template-columns:1fr 1fr;margin:0 0 clamp(40px,6vw,80px);padding:0;border:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);background:none}
  body .post-navigation .post-previous,body .post-navigation .post-next{float:none;width:auto;margin:0;padding:0;position:static;min-width:0;background:none;border:0}
  body .post-navigation .post-next{border-left:1px solid var(--rule)}
  body .post-navigation a{display:flex;align-items:center;gap:18px;box-sizing:border-box;height:100%;min-width:0;margin:0;padding:24px 22px;position:static;text-indent:0;font:400 clamp(15px,1.45vw,21px)/1.2 var(--serif)}
  body .post-navigation .post-next a{flex-direction:row;justify-content:flex-end;text-align:right}
  body .post-navigation a::before,body .post-navigation a::after{content:none;display:none}
  body .post-navigation .post-previous a::before{content:"\\2190";position:static;top:auto;left:auto;right:auto;bottom:auto;margin:0;transform:none;width:auto;height:auto;display:block;flex:none;font:400 30px/1 var(--serif);color:var(--mu)}
  body .post-navigation .post-next a::after{content:"\\2192";position:static;top:auto;left:auto;right:auto;bottom:auto;margin:0;transform:none;width:auto;height:auto;display:block;flex:none;font:400 30px/1 var(--serif);color:var(--mu)}
  body .post-navigation a:hover{text-decoration:none;background:var(--bg2)}
  body .post-navigation a:hover::before,body .post-navigation a:hover::after{color:var(--ink)}
  body .post-navigation span{display:none}
  body .post-navigation .pm-nt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-width:0;font-style:normal}

  /* ---------- comments ---------- */
  body #comments-box,body #respond{background:none;border:0;box-shadow:none;padding:0;margin:0 0 56px}
  body #comments-box .post-listing{background:none;border:0;padding:0;margin:0;box-shadow:none}
  body #comments-box .block-head{margin:0 0 10px;background:none;border:0}
  body #comments-title,body #reply-title{font:400 clamp(32px,4vw,56px)/1 var(--serif);margin:0 0 22px;padding:0;border:0}
  body #reply-title small a{font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;margin-left:16px}
  body ol.commentlist{list-style:none;margin:0;padding:0}
  body ol.commentlist li{margin:0;padding:0;background:none;border:0;list-style:none}
  body .comment-wrap{display:grid;grid-template-columns:36px 1fr;gap:2px 18px;background:none;border:0;border-top:1px solid var(--rule);border-radius:0;padding:20px 0;margin:0}
  body .comment-avatar{float:none;grid-row:1/3;width:auto;margin:0;padding:0}
  body .comment-avatar img{width:36px;height:36px;border:0;padding:0;filter:grayscale(1)}
  body .comment-content{margin:0;float:none;min-width:0;overflow-wrap:anywhere}
  body .comment-content p{margin:6px 0 0;font:400 20px/1.35 var(--serif)}
  body .author-comment cite{font:500 11px/1 var(--mono);font-style:normal;letter-spacing:.14em;text-transform:uppercase;margin-right:14px}
  body .comment-meta,body .comment-meta a{font:400 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  body .comment .reply{grid-column:2;margin:6px 0 0;padding:0;text-align:left}
  body .comment-reply-link{font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);border-bottom:1px solid var(--rule)}
  body ul.children{list-style:none;margin:0 0 0 22px;padding:0 0 0 20px;border-left:1px solid var(--rule)}
  body .navigation{display:flex;justify-content:space-between;margin-bottom:14px;font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase}
  body #commentform p{margin:0 0 20px}
  body #commentform label{display:block;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);margin-bottom:6px}
  body #commentform .comment-notes{font:400 11px/1.6 var(--mono);color:var(--mu)}
  body #commentform input[type=text],body #commentform input[type=email],body #commentform input[type=url],body #commentform textarea{width:100%;max-width:100%;box-sizing:border-box;background:none;border:0;border-bottom:1px solid var(--ink);border-radius:0;color:var(--ink);padding:8px 0;font:400 20px/1.4 var(--serif);box-shadow:none}
  body #commentform textarea{border:1px solid var(--rule);padding:14px}
  body #commentform input:focus,body #commentform textarea:focus{border-color:var(--ink);outline:0}
  body #commentform input#submit{background:var(--ink);color:var(--bg);border:1px solid var(--ink);border-radius:0;padding:15px 28px;font:500 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;width:auto;box-shadow:none}
  body #commentform input#submit:hover{background:var(--sig);border-color:var(--sig);color:#fff}

  /* ---------- cinema masthead ---------- */
  .pm-mast{display:none;position:absolute;inset:0;z-index:0;overflow:hidden;background:radial-gradient(circle at 18% 120%,rgba(255,77,61,.38),transparent 55%),radial-gradient(circle at 88% -30%,rgba(255,244,214,.22),transparent 50%),#060606}
  html[data-pm-mast="cinema"] .pm-mast{display:block}
  .pm-wall{position:absolute;inset:0;display:flex;align-items:center}
  .pm-track{display:flex;gap:16px;height:100%;width:max-content;animation:pmWall 140s linear infinite}
  .pm-track img{height:100%;width:auto;aspect-ratio:2/3;object-fit:cover;max-width:none;filter:grayscale(.45) brightness(.66) contrast(1.12);opacity:.95}
  @keyframes pmWall{to{transform:translateX(-50%)}}
  .pm-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.72) 0,rgba(0,0,0,.36) 52%,rgba(0,0,0,.88) 100%)}
  .pm-beam{position:absolute;inset:-20% -10%;background:linear-gradient(100deg,rgba(255,243,214,.24),rgba(255,243,214,0) 38%);mix-blend-mode:screen;animation:pmFlick 5s steps(1) infinite}
  @keyframes pmFlick{0%{opacity:.9}7%{opacity:.7}9%{opacity:1}55%{opacity:.85}57%{opacity:.6}60%{opacity:.95}100%{opacity:.9}}
  .pm-bar{position:absolute;left:0;right:0;height:24px;z-index:2;background:linear-gradient(90deg,#d8d2c2 0 10px,transparent 10px) 0 7px/26px 10px repeat-x,#000}
  .pm-bar.t{top:0}
  .pm-bar.b{bottom:0}

  /* ambient poster glow (the Backdrop setting) */
  .pm-amb{position:fixed;inset:-12%;z-index:-1;pointer-events:none;background-size:cover;background-position:center;filter:blur(50px) saturate(1.2);transform:scale(1.12);opacity:calc((1 - var(--veil)) * 1.25);transition:opacity .4s}
  html[data-pm-bg="off"] .pm-amb{display:none}
  .pm-hint{margin:0;padding:2px 0 12px;font:400 10px/1.6 var(--mono);letter-spacing:.04em;color:var(--mu)}

  /* ---------- Content Views grids (Other menu, grid pages) ---------- */
  body .pt-cv-wrapper{background:none;border:0;padding:0;margin:0}
  body .cvp-live-filter{display:flex;align-items:baseline;gap:18px;margin:0 0 22px;padding:0 0 10px;border-bottom:1px solid var(--ink);float:none;width:auto}
  body .cvp-live-filter .cvp-label{font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin:0;padding:0;width:auto}
  body .cvp-live-filter select{background:none;border:0;border-bottom:1px solid var(--rule);border-radius:0;color:var(--ink);font:500 12px var(--mono);padding:6px 24px 6px 0;width:auto;height:auto;box-shadow:none}
  body .cvp-live-filter select option{background:var(--bg);color:var(--ink)}
  body .pt-cv-view{background:none;border:0;padding:0;margin:0}
  body .pt-cv-view.pt-cv-grid .pt-cv-page{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:clamp(34px,4vw,56px) clamp(18px,2vw,30px);margin:0;padding:0;float:none;width:auto}
  body .pt-cv-page::before,body .pt-cv-page::after{content:none;display:none}
  body .pt-cv-page .pt-cv-content-item{float:none;width:auto;max-width:none;margin:0;padding:0;min-width:0}
  body .pt-cv-ifield{display:flex;flex-direction:column;margin:0;padding:0;background:none;border:0;text-align:left}
  body .pt-cv-ifield .post-thumbnail{display:block;position:relative;width:100%;max-width:none;height:auto;max-height:none;aspect-ratio:2/3;padding:0;margin:0;overflow:hidden;background-size:cover;background-position:center}
  body .pt-cv-ifield .post-thumbnail img{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;opacity:1;visibility:visible;display:block;margin:0;border:0}
  body .pt-cv-ifield .pt-cv-title{text-align:left;clear:none;float:none}
  body .pt-cv-title a{display:inline;text-align:left;clear:none}
  body .pt-cv-pagination-wrapper{margin-top:clamp(36px,5vw,64px);background:none}
  body .pt-cv-pagination-wrapper .pagination{display:flex;flex-wrap:wrap;gap:6px 22px;list-style:none;margin:0;padding:18px 0 0;border:0;border-top:1px solid var(--ink)}
  body .pt-cv-pagination-wrapper .pagination li{float:none;margin:0;padding:0;background:none;border:0;list-style:none}
  body .pt-cv-pagination-wrapper .pagination a,body .pt-cv-pagination-wrapper .pt-cv-more,body .pt-cv-pagination-wrapper .pt-cv-more-inactive{display:inline-block;float:none;margin:0;padding:0 0 4px;background:none;border:0;border-bottom:2px solid transparent;border-radius:0;box-shadow:none;font:400 22px/1 var(--serif);color:var(--mu);cursor:pointer}
  body .pt-cv-pagination-wrapper .pagination a:hover{color:var(--ink);text-decoration:none;border-bottom-color:var(--ink)}
  body .pt-cv-pagination-wrapper .pagination .active a{color:var(--ink);border-bottom-color:var(--sig)}

  @media (max-width:1180px){body .recent-box .cat-box-content,body .timeline-contents{grid-template-columns:repeat(4,minmax(0,1fr))}}
  @media (max-width:900px){body .recent-box .cat-box-content,body .timeline-contents{grid-template-columns:repeat(3,minmax(0,1fr))}}

  .pm-track.pm-land img{aspect-ratio:16/9}
  .pm-still{margin:0 0 clamp(40px,6vw,80px)}
  .pm-still img{display:block;width:100%;aspect-ratio:21/9;object-fit:cover;max-width:none}
  .pm-still figcaption{margin-top:12px;font:italic 400 clamp(20px,2.4vw,30px)/1.2 var(--serif);color:var(--mu)}
  .pm-credit{display:block;margin-top:12px;font:400 10px/1.6 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mu)}

  .pm-people{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(28px,5vw,80px);margin:0 0 clamp(40px,6vw,80px);align-items:start}
  .pm-people h3,.pm-cast h3{font:400 clamp(28px,3.4vw,44px)/1 var(--serif);margin:0 0 18px}
  .pm-dirrow{display:flex;flex-wrap:wrap;gap:24px;list-style:none;margin:0;padding:0}
  .pm-dirrow li{flex:0 0 clamp(150px,14vw,200px);list-style:none;margin:0;padding:0}
  .pm-pc{display:block;position:relative;text-decoration:none}
  .pm-pf{display:block;position:relative;aspect-ratio:3/4;overflow:hidden;background:var(--bg2)}
  .pm-pf img{display:block;width:100%;height:100%;object-fit:cover;max-width:none;filter:grayscale(.8);transition:filter .35s,transform .6s cubic-bezier(.2,.7,.2,1)}
  .pm-pc:hover .pm-pf img{filter:none;transform:scale(1.05)}
  .pm-ph{display:grid;place-items:center;width:100%;height:100%;font:400 64px/1 var(--serif);color:var(--mu)}
  .pm-pc b{display:block;margin-top:10px;font:500 11px/1.3 var(--mono);letter-spacing:.08em;text-transform:uppercase}
  .pm-pc:hover b::after{content:" \\2197"}
  .pm-pc i{display:block;margin-top:3px;font:italic 400 16px/1.2 var(--serif);color:var(--mu)}
  .pm-ci{position:absolute;top:0;left:0;z-index:2;padding:6px 9px;background:rgba(0,0,0,.62);color:#f1ede4;font:500 10px/1 var(--mono);font-style:normal;letter-spacing:.14em}
  .pm-keycrew{display:grid;grid-template-columns:150px minmax(0,1fr);margin:0;max-width:640px}
  .pm-keycrew dt,.pm-keycrew dd{margin:0;padding:13px 0;border-top:1px solid var(--rule)}
  .pm-keycrew dt{font:500 10px/1.9 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
  .pm-keycrew dd{font-size:15px}
  .pm-keycrew dd a{text-decoration:underline;text-underline-offset:.25em}

  .pm-cast{margin:0 0 clamp(40px,6vw,80px)}
  .pm-ch{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin:0 0 20px;padding-bottom:14px;border-bottom:1px solid var(--ink)}
  .pm-ch h3{margin:0}
  .pm-cc{display:flex;gap:8px;align-items:center}
  .pm-cc button{all:unset;cursor:pointer;box-sizing:border-box;display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--ink);font:400 22px/1 var(--mono);color:var(--ink);transition:background .15s,color .15s}
  .pm-cc button.pm-cv{width:auto;padding:0 16px;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase}
  .pm-cc button:hover{background:var(--ink);color:var(--bg)}
  .pm-cc button[disabled]{opacity:.3;pointer-events:none}
  .pm-cwrap{position:relative}
  .pm-cwrap::before,.pm-cwrap::after{content:"";position:absolute;top:0;bottom:12px;width:80px;pointer-events:none;z-index:3;opacity:0;transition:opacity .25s}
  .pm-cwrap::before{left:0;background:linear-gradient(90deg,var(--bg),rgba(var(--bg-rgb),0))}
  .pm-cwrap::after{right:0;background:linear-gradient(270deg,var(--bg),rgba(var(--bg-rgb),0))}
  .pm-cwrap.pm-l::before,.pm-cwrap.pm-r::after{opacity:1}
  .pm-castrow{display:flex;gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;margin:0;padding:4px 0 12px;list-style:none;cursor:grab}
  .pm-castrow::-webkit-scrollbar{display:none}
  .pm-castrow.pm-drag{scroll-snap-type:none;scroll-behavior:auto;cursor:grabbing}
  .pm-castrow li{flex:0 0 clamp(150px,15vw,200px);scroll-snap-align:start;margin:0;padding:0;list-style:none}
  .pm-cast.pm-all .pm-castrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:30px 22px;overflow:visible;cursor:auto}
  .pm-cast.pm-all .pm-castrow li{flex:none}
  .pm-cast.pm-all .pm-cwrap::before,.pm-cast.pm-all .pm-cwrap::after{display:none}
  .pm-cast.pm-all .pm-pr,.pm-cast.pm-all .pm-nx{display:none}
  @media (max-width:800px){.pm-people{grid-template-columns:1fr}}

  /* ---------- footer & floating controls ---------- */
  body .footer-bottom{background:none;border:0;border-top:1px solid var(--ink);margin-top:0;padding:28px 0 150px;font:500 10px/1.6 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mu);overflow:hidden}
  body .footer-bottom::before{content:"Pahe";display:block;margin:0 0 28px var(--gut);font:400 clamp(140px,30vw,480px)/.78 var(--serif);letter-spacing:-.04em;color:transparent;-webkit-text-stroke:1px var(--rule);white-space:nowrap}
  body .footer-bottom *{color:var(--mu)}
  body .footer-bottom a:hover{color:var(--ink)}
  body #topcontrol{position:fixed;right:22px;bottom:26px;width:40px;height:40px;box-sizing:border-box;padding:0;margin:0;overflow:hidden;background:var(--bg);color:var(--ink);border:1px solid var(--ink);border-radius:0;text-align:center;text-indent:0;font-size:0;line-height:0;z-index:10005;scrollbar-width:none;box-shadow:none}
  body #topcontrol::before{content:none;display:none}
  body #topcontrol::after{content:"\\2191";display:block;font:500 18px/38px var(--mono);color:var(--ink)}
  body #topcontrol::-webkit-scrollbar{display:none}

  .pm-pill{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;z-index:10010;background:var(--ink);border-radius:999px;padding:4px;box-shadow:0 16px 44px rgba(0,0,0,.5);max-width:calc(100vw - 100px);overflow-x:auto;scrollbar-width:none}
  .pm-pill::-webkit-scrollbar{display:none}
  .pm-pill button{all:unset;box-sizing:border-box;cursor:pointer;flex:none;padding:12px 15px;border-radius:999px;font:500 10px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--bg);white-space:nowrap}
  .pm-pill button:hover{background:var(--bg);color:var(--ink)}
  .pm-pill button:focus-visible{outline:2px solid var(--sig);outline-offset:-2px}

  .pm-search{position:fixed;inset:0;z-index:10030;background:var(--bg);display:none;flex-direction:column;justify-content:flex-start;overflow-y:auto;padding:clamp(90px,20vh,200px) var(--gut) 80px;color:var(--ink)}
  html.pm-searching .pm-search{display:flex}
  .pm-search .pm-x{position:absolute;top:28px;right:var(--gut)}
  .pm-search form{margin:0}
  .pm-inwrap{position:relative}
  .pm-ghost,.pm-search input{box-sizing:border-box;display:block;width:100%;font:400 clamp(40px,7.5vw,120px)/1.05 var(--serif);letter-spacing:-.03em;padding-bottom:.1em;border-bottom:1px solid transparent}
  .pm-ghost{position:absolute;inset:0;pointer-events:none;white-space:pre;overflow:hidden;color:var(--mu);opacity:.55}
  .pm-gv{visibility:hidden}
  .pm-search input{all:unset;position:relative;z-index:1;box-sizing:border-box;display:block;width:100%;font:400 clamp(40px,7.5vw,120px)/1.05 var(--serif);letter-spacing:-.03em;color:var(--ink);caret-color:var(--sig);border-bottom:1px solid var(--ink);padding-bottom:.1em}
  .pm-search input::placeholder{color:var(--mu);opacity:.5}
  .pm-search small{display:block;margin-top:18px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  .pm-live{margin-top:30px}
  .pm-lbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 26px;padding:12px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
  .pm-lbar button{all:unset;cursor:pointer;padding:6px 0;border-bottom:2px solid transparent;font:500 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  .pm-lbar button:hover{color:var(--ink)}
  .pm-lbar button[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--ink)}
  .pm-lcount{margin-left:auto;font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}
  body a.pm-lall{font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;border-bottom:1px solid var(--ink)}
  .pm-lcols{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:clamp(24px,5vw,72px)}
  .pm-lcol h4{margin:20px 0 8px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  .pm-lres,.pm-lsug{list-style:none;margin:0;padding:0}
  .pm-lres li,.pm-lsug li{margin:0;padding:0;border-top:1px solid var(--rule);list-style:none;transition:background .15s}
  .pm-lres li.pm-act,.pm-lsug li.pm-act,.pm-lres li:hover,.pm-lsug li:hover{background:var(--bg2);box-shadow:inset 3px 0 0 var(--sig)}
  body a.pm-lr{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:18px;align-items:center;padding:14px 12px;text-decoration:none}
  .pm-lr img{display:block;width:52px;height:78px;object-fit:cover;background:var(--bg2)}
  .pm-lt{font:400 clamp(22px,2.4vw,32px)/1.05 var(--serif)}
  .pm-lt mark,.pm-sl mark{background:linear-gradient(transparent 62%,rgba(255,77,61,.5) 62%);color:inherit}
  .pm-lm{margin-top:5px;font:400 10px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-lf{font:400 10.5px/1.5 var(--mono);letter-spacing:.06em;text-transform:uppercase;text-align:right;max-width:200px}
  .pm-lsug li button{all:unset;cursor:pointer;box-sizing:border-box;display:grid;grid-template-columns:40px minmax(0,1fr);gap:14px;align-items:center;width:100%;padding:10px 12px;color:var(--ink)}
  .pm-lsug li button img{display:block;width:40px;height:60px;object-fit:cover;background:var(--bg2)}
  .pm-sm{display:block}
  .pm-sl{display:block;font:400 22px/1.1 var(--serif)}
  .pm-ss{display:block;margin-top:3px;font:400 10px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-lmsg{margin:0;padding:18px 12px;font:500 11px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-lhint{margin:26px 0 0;font:400 10px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
  .pm-lrec h4{margin:0 0 12px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  .pm-lrec button{all:unset;cursor:pointer;display:inline-block;margin:0 10px 10px 0;padding:8px 14px;border:1px solid var(--rule);font:400 20px/1 var(--serif);color:var(--ink)}
  .pm-lrec button:hover{border-color:var(--ink)}
  @media (max-width:760px){.pm-lcols{grid-template-columns:1fr}.pm-lf{display:none}body a.pm-lr{grid-template-columns:52px minmax(0,1fr)}}

  .pm-toast{position:fixed;left:20px;bottom:90px;z-index:10050;max-width:360px;padding:16px 18px;background:var(--ink);color:var(--bg);box-shadow:0 16px 44px rgba(0,0,0,.5)}
  .pm-toast p{margin:0 0 12px;font:500 11px/1.6 var(--mono);letter-spacing:.06em;color:var(--bg)}
  .pm-trow{display:flex;gap:16px}
  .pm-toast button{all:unset;cursor:pointer;font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--bg);border-bottom:1px solid var(--bg);padding:4px 0}

  .pm-modal{position:fixed;inset:0;z-index:10040;display:none;overflow-y:auto;background:var(--bg);color:var(--ink)}
  html.pm-settings .pm-modal:not(.pm-pick){display:block}
  .pm-sheet{max-width:900px;margin:0 auto;padding:clamp(28px,7vh,80px) var(--gut) 120px}
  .pm-mh{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding-bottom:14px;border-bottom:1px solid var(--ink)}
  .pm-mh h2{margin:0;font:400 clamp(48px,8vw,100px)/.9 var(--serif);letter-spacing:-.03em;color:var(--ink)}
  .pm-msub{margin:14px 0 0;font:400 11px/1.7 var(--mono);letter-spacing:.06em;color:var(--mu)}
  .pm-mreload{display:flex;align-items:center;gap:20px;margin:18px 0 0;padding:12px 16px;border:1px solid var(--sig);font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase}
  .pm-ms{padding:26px 0 10px;border-bottom:1px solid var(--rule)}
  .pm-ms h3{margin:0 0 12px;font:500 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
  .pm-mrow{display:grid;grid-template-columns:minmax(150px,260px) minmax(0,1fr);gap:8px 32px;align-items:start;padding:14px 0}
  .pm-ml b{display:block;font:400 24px/1.1 var(--serif);font-weight:400}
  .pm-ml small{display:block;margin-top:6px;font:400 10px/1.6 var(--mono);letter-spacing:.04em;color:var(--mu)}
  .pm-mc .pm-seg{display:inline-flex}
  .pm-mc input[type=range]{width:220px;accent-color:var(--ink)}
  .pm-keybox{max-width:520px}
  .pm-keyinput{all:unset;box-sizing:border-box;width:100%;padding:10px 0;border-bottom:1px solid var(--ink);font:400 14px/1.4 var(--mono);letter-spacing:.04em;color:var(--ink)}
  .pm-keyinput::placeholder{color:var(--mu);opacity:.6}
  .pm-keybtns{display:flex;gap:22px;margin-top:12px}
  .pm-mstatus{min-height:1.4em;margin:12px 0 0;font:500 11px/1.4 var(--mono);letter-spacing:.06em;color:var(--mu)}
  .pm-mstatus.ok{color:var(--ink)}
  .pm-mstatus.ok::before{content:"\\2713  "}
  .pm-mstatus.bad{color:var(--sig)}
  body a.pm-link{font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid var(--ink)}
  .pm-mbtns{display:flex;flex-wrap:wrap;gap:12px 28px}
  html.pm-picking .pm-pick{display:block}
  .pm-match{margin:20px 0 0;font:400 10px/1.7 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mu)}
  .pm-match a{color:var(--ink);border-bottom:1px solid var(--ink)}
  .pm-pickin{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:26px;padding:10px 0;border-bottom:1px solid var(--ink);font:400 clamp(26px,4vw,44px)/1.1 var(--serif);color:var(--ink);caret-color:var(--sig)}
  .pm-pickin::placeholder{color:var(--mu);opacity:.5}
  .pm-pickres{list-style:none;margin:14px 0 24px;padding:0}
  .pm-pickres li{margin:0;padding:0;border-top:1px solid var(--rule);list-style:none}
  .pm-pickres button{all:unset;cursor:pointer;box-sizing:border-box;display:grid;grid-template-columns:52px minmax(0,1fr);gap:18px;align-items:center;width:100%;padding:14px 12px;color:var(--ink);transition:background .15s}
  .pm-pickres button:hover{background:var(--bg2);box-shadow:inset 3px 0 0 var(--sig)}
  .pm-pickres img{display:block;width:52px;height:78px;object-fit:cover;background:var(--bg2)}
  .pm-pt{display:block;font:400 26px/1.1 var(--serif)}
  .pm-ps{display:block;margin-top:5px;font:400 11px/1.5 var(--mono);letter-spacing:.03em;color:var(--mu)}
  .pm-ico{display:block;flex:none;max-width:none}
  .pm-ico text{text-transform:none;letter-spacing:0;font-style:normal}
  .pm-rates{display:flex;flex-wrap:wrap;gap:14px 56px;margin:0 0 26px}
  .pm-rates:empty{display:none}
  .pm-rates .pm-rating{margin:0}
  body a.pm-lbr{text-decoration:none;color:inherit}
  .pm-lbr span{display:inline-flex;align-items:center;gap:4px}
  .pm-pbtn{all:unset;cursor:pointer;display:inline-block;margin-top:10px;padding:5px 0;border-bottom:1px solid var(--ink);font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
  .pm-pbtn:hover{color:var(--sig);border-bottom-color:var(--sig)}
  .pm-lsug li button.pm-lalt{display:block;padding:14px 12px;font:500 10px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase}
  body a.pm-lpa{display:grid;grid-template-columns:40px minmax(0,1fr);gap:14px;align-items:center;padding:10px 12px;text-decoration:none}
  .pm-lpa img{display:block;width:40px;height:60px;object-fit:cover;background:var(--bg2)}
  .pm-lmore{all:unset;cursor:pointer;display:inline-block;margin:14px 12px;padding:10px 0;border-bottom:1px solid var(--ink);font:500 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
  .pm-mfine{margin:34px 0 0;font:400 10px/1.7 var(--mono);letter-spacing:.06em;color:var(--mu)}
  @media (max-width:700px){.pm-mrow{grid-template-columns:1fr}}

  body .pm-card .post-box-title a:focus-visible,body .pm-spec a:focus-visible{outline:2px solid var(--sig);outline-offset:3px}

  @media (max-width:999px){
    body #top-nav .container{justify-content:flex-start}
    .pm-hero{grid-template-columns:1fr}
    .pm-poster{position:relative;top:0;max-width:300px}
  }
  @media (max-width:700px){
    .pm-q{grid-template-columns:1fr auto}
    .pm-qb{grid-column:1/-1;justify-content:flex-start}
    body .letter-section{grid-template-columns:1fr}
    body .letter-section .back-to-top{grid-column:1}
    body .letter-title{grid-row:auto}
    body .letter-title span{position:static;font-size:84px}
  }
  @media (max-width:640px){
    body .recent-box .cat-box-content,body .timeline-contents{grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 14px}
    body .pm-card .post-box-title{font-size:20px}
    html[data-pm-view="ledger"] body .pm-card{grid-template-columns:52px minmax(0,1fr);grid-template-areas:"th ti" "th b" "th fm" "th de";column-gap:14px}
    html[data-pm-view="ledger"] body .pm-card .post-thumbnail{width:52px}
    html[data-pm-view="ledger"] .pm-no,html[data-pm-view="ledger"] body .pm-card .post-meta,html[data-pm-view="ledger"] body .pm-card .timeline-date{display:none}
    .pm-spec,.pm-credits{grid-template-columns:110px 1fr}
    body .post-navigation{grid-template-columns:1fr}
    body .post-navigation .post-next{border-left:0;border-top:1px solid var(--rule)}
    .pm-head,body .page-head{flex-direction:column;align-items:flex-start}
    .pm-head span,.pm-count{text-align:left}
  }
  @media (prefers-reduced-motion:reduce){
    *{animation:none;transition:none}
    html{scroll-behavior:auto}
  }
  `;

  /* Every rule gets an id-level specificity bump and !important, so the
     theme's own dark-skin rules cannot win in either colour mode. */
  function splitTop(s, sep) {
    const out = [];
    let depth = 0;
    let quote = null;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quote) {
        cur += c;
        if (c === '\\') cur += s[++i] || '';
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        cur += c;
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      if (c === sep && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  function hardSelector(prelude) {
    return splitTop(prelude, ',')
      .map((s) => {
        s = s.trim();
        if (s.startsWith(':root')) return s;
        if (/^html(?![\w-])/.test(s)) return s.replace(/^html/, 'html:not(#pm):not(#pm)');
        return 'html:not(#pm):not(#pm) ' + s;
      })
      .join(',');
  }

  function hardDeclarations(body) {
    return splitTop(body, ';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => (/!\s*important\s*$/i.test(d) ? d : d + ' !important'))
      .join(';');
  }

  function harden(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let out = '';
    let i = 0;
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open < 0) break;
      const prelude = css.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      let quote = null;
      for (; j < css.length && depth; j++) {
        const c = css[j];
        if (quote) {
          if (c === '\\') j++;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      const block = css.slice(open + 1, j - 1);
      if (/^@(media|supports)/.test(prelude)) out += prelude + '{' + harden(block) + '}';
      else if (prelude.startsWith('@')) out += prelude + '{' + block + '}';
      else if (prelude.startsWith(':root')) out += prelude + '{' + block + '}';
      else out += hardSelector(prelude) + '{' + hardDeclarations(block) + '}';
      i = j;
    }
    return out;
  }

  GM_addStyle(harden(CSS));

  /* ------------------------------------------------------------------ */
  /*  helpers                                                            */
  /* ------------------------------------------------------------------ */

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const safe = (fn) => {
    try {
      return fn();
    } catch (e) {
      console.warn('[Pahe Cinema UI]', fn.name, e);
    }
  };

  const SRC_RE = /\b(UHD BluRay|BluRay|NF WEB-DL|WEB-DL|WEB-HD|HDRip|HDTV|DVDRip)\b/i;
  const CUT_RE = /\s*(\(\d{4}\)|\bSeason\s+\d|\b(?:UHD |NF )?(?:BluRay|WEB-DL|WEB-HD|HDRip|HDTV|DVDRip)\b|\bComplete\b|\b\d{3,4}p\b)/i;

  function parseTitle(raw) {
    const bracket = (raw.match(/\[([^\]]+)\]/) || [])[1] || '';
    const t = raw.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    const year = (t.match(/\((\d{4})\)/) || [])[1] || '';
    const res = [];
    (t.match(/\b(480|720|1080|2160)p\b/g) || []).forEach((r) => {
      const v = r.replace('p', '');
      if (!res.includes(v)) res.push(v);
    });
    const source = (t.match(SRC_RE) || [])[1] || '';
    const season = (t.match(/\bSeason\s+(\d+(?:-\d+)?)/i) || [])[1] || '';
    const complete = /\bComplete\b/i.test(t);
    const cut = t.search(CUT_RE);
    const name = (cut > 0 ? t.slice(0, cut) : t).trim();
    let edition = '';
    if (year) {
      edition = (t.split('(' + year + ')')[1] || '')
        .replace(/\b(?:UHD |NF )?(?:BluRay|WEB-DL|WEB-HD|HDRip|HDTV|DVDRip)\b[\s\S]*$/i, '')
        .replace(/\b\d{3,4}p\b[\s\S]*$/, '')
        .trim();
    }
    return { name, year, res, source, season, complete, edition, bracket };
  }

  const pageInfo = () => {
    const pg = (document.querySelector('.pagination .pages') || {}).textContent || '';
    const m = pg.match(/Page\s+([\d,]+)\s+of\s+([\d,]+)/i);
    return {
      text: pg.trim(),
      has: !!m,
      page: m ? parseInt(m[1].replace(/,/g, ''), 10) : 1,
      last: m ? parseInt(m[2].replace(/,/g, ''), 10) : 1,
    };
  };

  /* ------------------------------------------------------------------ */
  /*  catalogue cards: home, archives, search                            */
  /* ------------------------------------------------------------------ */

  const CARDS = [];

  function decorateCards() {
    document.querySelectorAll('.pt-cv-ifield').forEach((f) => {
      const h = f.querySelector('.pt-cv-title');
      const t = f.querySelector('a.pt-cv-href-thumbnail');
      if (h) h.classList.add('post-box-title');
      if (t) t.classList.add('post-thumbnail');
    });
    const all = [...document.querySelectorAll('.recent-box .item-list, .timeline-content, .pt-cv-ifield')];
    if (!all.length) return CARDS;
    const pi = pageInfo();
    const per = Math.max(all.length, 10);

    all.forEach((card, i) => {
      const title = card.querySelector('.post-box-title');
      const a = title && title.querySelector('a');
      if (!a || card.dataset.pm) return;
      card.dataset.pm = '1';
      card.classList.add('pm-card');
      card.style.setProperty('--d', Math.min(i, 12) * 40 + 'ms');
      CARDS.push(card);

      const raw = a.textContent.trim();
      const p = parseTitle(raw);
      card.dataset.pmName = p.name || '';
      card.dataset.pmYear = p.year || '';
      card.dataset.pmTv = p.season || /\bSeason\b|\bComplete\b/i.test(raw) ? '1' : '';
      card.dataset.pmSeason = p.season || '';
      card.dataset.pmHref = a.href || '';
      const dEl = card.querySelector('.timeline-date, .tie-date');
      card.dataset.pmPost = ((dEl ? dEl.textContent : '').match(/\b(?:19|20)\d{2}\b/) || [''])[0];
      let spine;
      if (card.classList.contains('timeline-content')) spine = 'Match ' + String((pi.page - 1) * per + i + 1).padStart(2, '0');
      else if (card.classList.contains('pt-cv-ifield')) spine = 'No. ' + String(i + 1).padStart(2, '0');
      else spine = 'No. ' + String(pi.has ? (pi.last - pi.page) * per + (per - i) : all.length - i).padStart(5, '0');

      a.title = raw;
      a.textContent = p.name || raw;

      const row = el('div', 'pm-row');
      row.append(
        el('span', 'pm-no', spine),
        el('span', 'pm-yr', p.year || (p.season ? 'S' + p.season : ''))
      );
      title.before(row);

      const b = [p.season && 'Season ' + p.season, p.complete && 'Complete', p.edition].filter(Boolean).join(' \u00B7 ');
      const fmt = [p.source, p.res.length ? p.res.join(' / ') : ''].filter(Boolean).join(' \u2014 ');
      const sub = el('div', 'pm-sub');
      sub.append(el('span', 'pm-b', b), el('span', 'pm-fmt', fmt));
      title.after(sub);

      const thumb = card.querySelector('.post-thumbnail');
      if (thumb && p.bracket) {
        const ep = p.bracket.match(/Episode\s+(\d+)/i);
        thumb.appendChild(el('span', 'pm-flag', ep ? 'Ep. ' + ep[1] : p.bracket.slice(0, 16)));
      }
    });
    return CARDS;
  }

  function fixPostNav() {
    document.querySelectorAll('.post-navigation a').forEach((a) => {
      if (a.dataset.pm) return;
      a.dataset.pm = '1';
      const lab = a.querySelector('span');
      const kind = lab ? lab.textContent.trim() : '';
      const t = a.textContent.replace(kind, '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      a.setAttribute('aria-label', (kind ? kind + ': ' : '') + t);
      a.title = t;
      a.textContent = '';
      a.appendChild(el('em', 'pm-nt', t));
    });
  }

  /* ---- filter box for Content Views grids (Other menu pages) ---- */

  function enhanceGrids() {
    const wrap = document.querySelector('.pt-cv-wrapper');
    if (!wrap || wrap.dataset.pmf) return null;
    wrap.dataset.pmf = '1';
    const bar = el('div', 'pm-filter');
    const input = el('input');
    input.type = 'text';
    input.placeholder = 'Filter this list';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Filter this list');
    const count = el('span', '', '');
    bar.append(input, count);
    wrap.before(bar);
    const run = () => {
      const q = input.value.trim().toLowerCase();
      const items = [...wrap.querySelectorAll('.pt-cv-content-item')];
      let n = 0;
      items.forEach((it) => {
        const im = it.querySelector('img');
        const hit = !q || it.textContent.toLowerCase().includes(q) || (im && (im.alt || '').toLowerCase().includes(q));
        it.hidden = !hit;
        if (hit) n++;
      });
      count.textContent = (q ? n + ' / ' : '') + items.length + ' titles';
    };
    input.addEventListener('input', run);
    run();
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        decorateCards();
        upgradePosters();
        run();
      }, 150);
    }).observe(wrap, { childList: true, subtree: true });
    return input;
  }

  function sectionHeads() {
    const pi = pageInfo();
    const box = document.querySelector('.recent-box');
    if (box && !document.querySelector('.pm-head')) {
      const head = el('div', 'pm-head');
      head.append(el('h2', '', 'The collection'), el('span', '', pi.text));
      box.before(head);
    }
    const ph = document.querySelector('.page-head');
    if (ph && !ph.querySelector('.pm-count')) {
      const n = document.querySelectorAll('.timeline-post').length;
      const bits = [pi.text, n && !pi.has ? n + ' results' : ''].filter(Boolean).join(' \u00B7 ');
      if (bits) ph.appendChild(el('span', 'pm-count', bits));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  A-Z list pages                                                     */
  /* ------------------------------------------------------------------ */

  function enhanceLists() {
    const az = document.querySelector('.az-listing');
    if (!az || az.dataset.pm) return;
    az.dataset.pm = '1';

    az.querySelectorAll('.az-columns li a').forEach((a) => {
      const raw = a.textContent.trim();
      const p = parseTitle(raw);
      a.title = raw;
      a.textContent = '';
      a.appendChild(el('span', 'pm-t', p.name || raw));
      const y = [p.year, p.edition].filter(Boolean).join(' \u00B7 ');
      if (y) a.appendChild(el('span', 'pm-y', y));
      const f = [p.source, p.res.length ? p.res.join(' / ') : ''].filter(Boolean).join(' \u2014 ');
      if (f) a.appendChild(el('span', 'pm-fm2', f));
    });

    const items = [...az.querySelectorAll('.az-columns li')];
    const sections = [...az.querySelectorAll('.letter-section')];
    const bar = el('div', 'pm-filter');
    const input = el('input');
    input.type = 'text';
    input.placeholder = 'Filter this list';
    input.setAttribute('aria-label', 'Filter this list');
    input.autocomplete = 'off';
    const count = el('span', '', items.length + ' titles');
    bar.append(input, count);
    az.before(bar);

    const run = () => {
      const q = input.value.trim().toLowerCase();
      let n = 0;
      items.forEach((li) => {
        const hit = !q || li.textContent.toLowerCase().includes(q) || (li.querySelector('a') && li.querySelector('a').title.toLowerCase().includes(q));
        li.hidden = !hit;
        if (hit) n++;
      });
      sections.forEach((s) => {
        s.hidden = !s.querySelector('li:not([hidden])');
        const link = az.querySelector('.az-links a[href="#' + s.id + '"]');
        if (link) link.parentElement.classList.toggle('pm-dim', s.hidden);
      });
      count.textContent = q ? n + ' / ' + items.length + ' titles' : items.length + ' titles';
    };
    input.addEventListener('input', run);

    if ('IntersectionObserver' in window) {
      const navH = (document.getElementById('main-nav') || {}).offsetHeight || 0;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            az.querySelectorAll('.az-links a.pm-on').forEach((x) => x.classList.remove('pm-on'));
            const link = az.querySelector('.az-links a[href="#' + en.target.id + '"]');
            if (link) link.classList.add('pm-on');
          });
        },
        { rootMargin: '-' + (navH + 90) + 'px 0px -70% 0px' }
      );
      sections.forEach((s) => io.observe(s));
    }
    return input;
  }

  /* ------------------------------------------------------------------ */
  /*  film / series page                                                 */
  /* ------------------------------------------------------------------ */

  function bigPoster(src) {
    const m = src.match(/_(U[XY])(\d+)_CR(\d+),(\d+),(\d+),(\d+)_/);
    if (!m) return src;
    const k = 2;
    return src.replace(m[0], `_${m[1]}${m[2] * k}_CR${m[3] * k},${m[4] * k},${m[5] * k},${m[6] * k}_`);
  }

  function buildHero() {
    const post = document.getElementById('the-post');
    const imdb = post && post.querySelector('.imdbwp');
    if (!imdb || post.querySelector('.pm-hero')) return false;

    const txt = (s) => {
      const n = imdb.querySelector(s);
      return n ? n.textContent.trim() : '';
    };
    const name = txt('.imdbwp__title');
    if (!name) return false;
    const header = imdb.querySelector('.imdbwp__header');
    const year = ((header.textContent.replace(name, '').match(/\(([^)]+)\)/)) || [])[1] || '';
    const metas = [...imdb.querySelectorAll('.imdbwp__meta span')]
      .map((s) => s.textContent.trim())
      .filter((x) => x && x.toLowerCase() !== 'n/a');
    const runtime = metas.find((x) => /\bmin\b/i.test(x)) || '';
    const released = metas.find((x) => /^\d{1,2}\s+\w{3}\s+\d{4}$/.test(x)) || '';
    const genres = metas.find((x) => x !== runtime && x !== released) || '';
    const score = txt('.imdbwp__star');
    const votes = ((txt('.imdbwp__rating').match(/from\s+([\d,]+)/)) || [])[1] || '';
    const teaser = txt('.imdbwp__teaser');
    const imdbLink = imdb.querySelector('.imdbwp__link');
    const h1 = post.querySelector('.post-title');
    const rel = h1 ? parseTitle(h1.textContent) : null;

    const hero = el('section', 'pm-hero');
    const fig = el('figure', 'pm-poster');
    const srcImg = imdb.querySelector('.imdbwp__img');
    if (srcImg) {
      const img = new Image();
      const orig = srcImg.getAttribute('src');
      img.alt = name;
      img.onerror = () => {
        img.onerror = null;
        img.src = orig;
      };
      img.src = bigPoster(orig);
      fig.appendChild(img);
    }
    const info = el('div', 'pm-info');
    info.appendChild(el('p', 'pm-kicker', genres.replace(/,\s*/g, '  \u00B7  ')));
    if (rel) {
      const stat = [rel.season && 'Season ' + rel.season, rel.complete && 'Complete', rel.bracket].filter(Boolean).join(' \u00B7 ');
      if (stat) info.appendChild(el('p', 'pm-stat', stat));
    }
    info.appendChild(el('div', 'pm-film', name));
    const parts = [];
    if (year) parts.push(document.createTextNode(year));
    if (runtime) {
      const rs = el('span', 'pm-rt');
      trackRuntime(rs, runtime);
      parts.push(rs);
    }
    if (released) parts.push(document.createTextNode('Released ' + released));
    if (parts.length) {
      const line = el('p', 'pm-line');
      parts.forEach((n, i) => {
        if (i) line.appendChild(document.createTextNode('  \u00B7  '));
        line.appendChild(n);
      });
      info.appendChild(line);
    }
    const rates = el('div', 'pm-rates');
    if (score) {
      const r = el('div', 'pm-rating');
      r.append(el('b', '', score), el('span', '', 'IMDb' + (votes ? ' \u00B7 ' + votes + ' votes' : '')));
      rates.appendChild(r);
    }
    info.appendChild(rates);
    if (teaser) info.appendChild(el('p', 'pm-teaser', teaser));

    const credits = el('dl', 'pm-credits');
    imdb.querySelectorAll('.imdbwp__footer strong').forEach((s) => {
      const v = s.nextElementSibling;
      if (v && v.textContent.trim()) {
        credits.append(el('dt', '', s.textContent.replace(':', '').trim()), el('dd', '', v.textContent.trim()));
      }
    });
    if (credits.children.length) info.appendChild(credits);

    const actions = el('div', 'pm-actions');
    const cta = el('a', 'pm-cta pm-solid', 'Get this edition \u2193');
    cta.href = '#pm-editions';
    actions.appendChild(cta);
    if (imdbLink && imdbLink.href) {
      const ia = el('a', 'pm-cta pm-imdb');
      ia.setAttribute('aria-label', 'Open on IMDb');
      ia.append(iconIMDb(), document.createTextNode('\u2197'));
      ia.href = imdbLink.href;
      ia.target = '_blank';
      ia.rel = 'noopener noreferrer';
      actions.appendChild(ia);
    }
    info.appendChild(actions);

    hero.append(fig, info);
    imdb.before(hero);
    post.classList.add('pm-hero-ok');

    const postEl = post.querySelector('.post-meta .tie-date');
    HERO = {
      name,
      year: (year.match(/\d{4}/) || [''])[0],
      tv: /[\u2013\u2014-]/.test(year) || !!(rel && (rel.season || rel.complete)),
      imdb: imdbIdFrom(imdbLink && imdbLink.href),
      post: ((postEl ? postEl.textContent : '').match(/\b(?:19|20)\d{2}\b/) || [''])[0],
      season: (rel && rel.season) || '',
      start: /[\u2013\u2014-]/.test(year) ? (year.match(/\d{4}/) || [''])[0] : '',
    };
    if (state.letterboxd === 'on' && !HERO.tv) actions.appendChild(letterboxdLink(HERO));
    remember(name + (rel && rel.season ? ' S' + rel.season : ''), year);
    return true;
  }

  function buildSpec() {
    const code = document.querySelector('#the-post .entry code');
    if (!code || code.dataset.pm) return;
    code.dataset.pm = '1';
    const rows = [];
    let cur = [];
    [...code.childNodes].forEach((n) => {
      if (n.nodeName === 'BR') {
        rows.push(cur);
        cur = [];
      } else cur.push(n);
    });
    if (cur.length) rows.push(cur);

    const dl = el('dl', 'pm-spec');
    rows.forEach((r) => {
      const first = r[0];
      if (!first || first.nodeType !== 3) return;
      const m = first.textContent.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*\.+\s*:\s*([\s\S]*)$/);
      if (!m) return;
      const dd = el('dd');
      const rest = m[2].trim();
      if (rest) dd.appendChild(document.createTextNode(rest));
      r.slice(1).forEach((n) => dd.appendChild(n));
      if (!dd.textContent.trim() && !dd.querySelector('a')) return;
      first.remove();
      dl.append(el('dt', '', m[1]), dd);
    });
    if (!dl.children.length) return;
    [...dl.querySelectorAll('dt')].forEach((dt) => {
      if (!/^runtime$/i.test(dt.textContent.trim())) return;
      const dd = dt.nextElementSibling;
      if (dd && !dd.querySelector('a') && parseMins(dd.textContent) != null) trackRuntime(dd, dd.textContent.trim());
    });
    (code.closest('p') || code).after(dl);
    if (!code.textContent.trim()) code.classList.add('pm-gone');
  }

  /* ---- download boxes -> quality rows ---- */

  function parseBox(inner) {
    const lines = [];
    let cur = [];
    [...inner.childNodes].forEach((n) => {
      if (n.nodeName === 'BR') {
        lines.push(cur);
        cur = [];
      } else cur.push(n);
    });
    if (cur.length) lines.push(cur);

    const text = (l) => l.map((n) => n.textContent).join('').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const isBtn = (n) => n.nodeType === 1 && n.tagName === 'A' && n.classList.contains('shortc-button');
    const SIZE = /\b(MB|GB)\b/i;

    let title = '';
    let head = null;
    let size = '';
    const rows = [];
    const extras = [];

    lines.forEach((l) => {
      const btns = l.filter(isBtn);
      if (btns.length) {
        rows.push({ head, size, btns });
        size = '';
        return;
      }
      const t = text(l);
      if (!t || t === '|') return;
      if (/\b\d{3,4}p\b/.test(t)) {
        const parts = t.split('|');
        const note = parts.slice(1).join('|').trim();
        head = { label: parts[0].trim(), note: SIZE.test(note) ? '' : note };
        size = SIZE.test(note) ? note : '';
        return;
      }
      if (SIZE.test(t)) {
        size = t;
        return;
      }
      if (!rows.length && !head && !title) {
        title = t;
        return;
      }
      extras.push(t);
    });
    return { title, rows, extras };
  }

  function rowEl(r) {
    const lab = r.head ? r.head.label : '';
    const rm = lab.match(/^(.*?)\s*[\u2013\-]?\s*(\d{3,4})p\s*(.*)$/);
    const res = rm ? rm[2] : '';
    const pre = rm ? rm[1].trim() : '';
    const codec = rm ? rm[3].trim() : lab;

    const q = el('div', 'pm-q');
    q.dataset.res = res;

    const left = el('div', 'pm-ql');
    if (pre) left.appendChild(el('small', '', pre));
    if (res) left.appendChild(el('b', '', res + 'p'));
    if (codec) left.appendChild(el('i', '', codec));

    const mid = el('div', 'pm-qz');
    const sm = r.size.match(/^(.*?)(\d[\d.,]*\s*(?:MB|GB))\s*$/i);
    if (sm) {
      mid.appendChild(document.createTextNode(sm[2]));
      if (sm[1].trim()) mid.appendChild(el('small', '', sm[1].trim()));
    } else if (r.size) mid.appendChild(document.createTextNode(r.size));
    if (r.head && r.head.note) mid.appendChild(el('small', '', r.head.note));

    const right = el('div', 'pm-qb');
    r.btns.forEach((b) => {
      b.dataset.h = b.textContent.trim();
      right.appendChild(b);
    });
    q.append(left, mid, right);
    return q;
  }

  function restructureBoxes(scope) {
    scope.querySelectorAll('.box.download').forEach((box) => {
      const inner = box.querySelector('.box-inner-block');
      if (!inner || box.classList.contains('pm-box')) return;
      const parsed = parseBox(inner);
      const total = parsed.rows.reduce((n, r) => n + r.btns.length, 0);
      if (!parsed.rows.length || total !== inner.querySelectorAll('a.shortc-button').length) return;

      const nodes = [];
      if (parsed.title) nodes.push(el('div', 'pm-qt', parsed.title));
      parsed.rows.forEach((r) => nodes.push(rowEl(r)));
      parsed.extras.forEach((t) => nodes.push(el('div', 'pm-qx', t)));
      inner.replaceChildren(...nodes);
      box.classList.add('pm-box');
    });
  }

  function buildEditions() {
    const post = document.getElementById('the-post');
    const inner = post && post.querySelector('.post-inner');
    const entry = inner && inner.querySelector('.entry');
    if (!entry || document.getElementById('pm-editions')) return;
    const tabs = entry.querySelector(':scope > .post-tabs-ver');
    const boxes = [...entry.querySelectorAll(':scope > .box.download')];
    if (!tabs && !boxes.length) return;

    const h1 = inner.querySelector('.post-title');
    const meta = inner.querySelector('.post-meta');
    const sec = el('section', 'pm-ed');
    sec.id = 'pm-editions';
    (tabs || boxes[0]).before(sec);
    sec.appendChild(el('p', 'pm-edlabel', 'Editions & downloads'));
    if (h1) sec.appendChild(h1);
    if (meta) sec.appendChild(meta);
    if (!post.classList.contains('pm-hero-ok')) post.classList.add('pm-nohero');

    restructureBoxes(tabs || entry);
    if (!tabs) boxes.forEach((b) => sec.appendChild(b));

    const bar = filterBar(sec, tabs || boxes[0]);
    if (bar) sec.appendChild(bar);
    if (tabs) {
      const nb = trackTabs(tabs);
      if (nb) sec.appendChild(nb);
      sec.appendChild(tabs);
    }
    applyFilters(sec);
  }

  function filterBar(sec, anchor) {
    const scope = anchor.closest('.post-tabs-ver') || sec;
    const rows = [...scope.querySelectorAll('.pm-q')];
    if (!rows.length) return null;
    const ress = [...new Set(rows.map((r) => r.dataset.res).filter(Boolean))].sort((a, b) => a - b);
    const hosts = [...new Set([...scope.querySelectorAll('a.shortc-button')].map((a) => a.dataset.h || a.textContent.trim()).filter(Boolean))];
    if (ress.length < 2 && hosts.length < 2) return null;

    const bar = el('div', 'pm-qbar');
    const mk = (label, key, values, fmt) => {
      const g = el('div', 'pm-qg');
      g.appendChild(el('b', '', label));
      ['', ...values].forEach((v) => {
        const b = el('button', '', v ? fmt(v) : 'All');
        b.type = 'button';
        b.dataset.k = key;
        b.dataset.v = v;
        b.addEventListener('click', () => {
          state[key] = v;
          store.set(key, v);
          applyFilters(document.getElementById('pm-editions'));
        });
        g.appendChild(b);
      });
      bar.appendChild(g);
    };
    if (ress.length > 1) mk('Quality', 'q', ress, (v) => v + 'p');
    if (hosts.length > 1) mk('Host', 'host', hosts, (v) => v);
    return bar;
  }

  function applyFilters(sec) {
    if (!sec) return;
    const q = state.q;
    const h = state.host;
    const rows = [...sec.querySelectorAll('.pm-q')];
    const hasQ = rows.some((r) => r.dataset.res === q);
    const hasH = !!sec.querySelector('a.shortc-button[data-h="' + (h || '').replace(/"/g, '') + '"]');
    const useQ = q && hasQ ? q : '';
    const useH = h && hasH ? h : '';

    sec.querySelectorAll('.pm-qb a.shortc-button').forEach((a) => {
      a.hidden = !!useH && a.dataset.h !== useH;
    });
    rows.forEach((r) => {
      const resMiss = !!useQ && r.dataset.res !== useQ;
      const allGone = [...r.querySelectorAll('a.shortc-button')].every((a) => a.hidden);
      r.hidden = resMiss || allGone;
    });
    sec.querySelectorAll('.pm-box').forEach((b) => {
      b.classList.toggle('pm-none', ![...b.querySelectorAll('.pm-q')].some((r) => !r.hidden));
    });
    sec.querySelectorAll('.pm-qbar button').forEach((b) => {
      const cur = b.dataset.k === 'q' ? useQ : useH;
      b.setAttribute('aria-pressed', String(b.dataset.v === cur));
    });
  }

  function trackTabs(tabs) {
    const lis = [...tabs.querySelectorAll('ul.tabs-nav li')];
    if (!lis.length) return null;
    const labels = lis.map((li) => li.textContent.trim());
    const key = location.pathname;
    const seen = store.get('seen', {}) || {};
    const prev = seen[key];
    let bar = null;
    if (Array.isArray(prev)) {
      const fresh = labels.filter((l) => !prev.includes(l));
      if (fresh.length) {
        lis.forEach((li) => {
          if (fresh.includes(li.textContent.trim())) li.classList.add('pm-new');
        });
        bar = el('div', 'pm-newbar', 'Since your last visit: ' + fresh.join(', '));
      }
    }
    delete seen[key];
    seen[key] = labels;
    const keys = Object.keys(seen);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete seen[k]);
    store.set('seen', seen);
    return bar;
  }

  /* ---- recently opened ---- */

  function remember(title, year) {
    const list = store.get('recent', []) || [];
    const path = location.pathname;
    const next = [{ p: path, t: title, y: year || '' }, ...list.filter((x) => x.p !== path)].slice(0, 14);
    store.set('recent', next);
  }

  /* ------------------------------------------------------------------ */
  /*  TMDb: sharper posters, stills, cast, trailer                       */
  /* ------------------------------------------------------------------ */

  const TMDB = 'https://api.themoviedb.org/3';
  const IMG = 'https://image.tmdb.org/t/p/';
  let HERO = null;
  let SEARCH = null;

  function gmJSON(url, headers) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: headers || {},
          timeout: 12000,
          onload: (r) => {
            if (r.status >= 400) {
              reject(Object.assign(new Error('HTTP ' + r.status), { status: r.status }));
              return;
            }
            try {
              resolve(typeof r.response === 'object' && r.response ? r.response : JSON.parse(r.responseText));
            } catch (e) {
              reject(e);
            }
          },
          onerror: reject,
          ontimeout: () => reject(new Error('timeout')),
        });
      } else {
        fetch(url, { headers: headers || {} })
          .then((r) => {
            if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
            return r.json();
          })
          .then(resolve, reject);
      }
    });
  }

  const tmdbKey = () => String(state.tmdbKey || '').trim();
  const isV4 = (k) => /^eyJ/.test(k) || k.length > 40;
  let tmdbBad = false;
  const tmdbOn = () => state.tmdb === 'on' && !!tmdbKey() && !tmdbBad;

  function tmdbGet(path, params, keyOverride) {
    const key = (keyOverride != null ? keyOverride : tmdbKey()).trim();
    if (!key) return Promise.reject(new Error('no key'));
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => qs.set(k, String(params[k])));
    const headers = {};
    if (isV4(key)) headers.Authorization = 'Bearer ' + key;
    else qs.set('api_key', key);
    return limited(() => gmJSON(TMDB + path + '?' + qs.toString(), headers)).catch((e) => {
      if (e && e.status === 401 && keyOverride == null && !tmdbBad) {
        tmdbBad = true;
        whenReady(() => toast('TMDb rejected your key. Open Settings to fix it.', [['Open settings', () => openSettings(true)], ['Dismiss']]));
      }
      throw e;
    });
  }

  let activeReq = 0;
  const waiting = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeReq++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            activeReq--;
            const next = waiting.shift();
            if (next) next();
          });
      };
      if (activeReq < 3) run();
      else waiting.push(run);
    });
  }

  const norm = (v) =>
    String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  function pickResult(results, name, year, tv, ctx) {
    ctx = ctx || {};
    const n = norm(name);
    const yr = (r) => Number(String((tv ? r.first_air_date : r.release_date) || '').slice(0, 4)) || 0;
    const titles = (r) => [r.title, r.original_title, r.name, r.original_name].filter(Boolean).map(norm);
    let pool = results.filter((r) => titles(r).includes(n));
    if (!pool.length && year) pool = results.filter((r) => String(yr(r)) === String(year) && titles(r).some((t) => t.includes(n) || n.includes(t)));
    if (!pool.length) return null;

    const post = Number(ctx.post) || 0;
    const start = Number(ctx.start) || 0;
    const first = tv && !start && post && (!ctx.season || String(ctx.season) === '1');
    if (tv && post) pool = pool.filter((r) => !yr(r) || yr(r) <= post + 1);
    if (!pool.length) return null;
    if (tv && (start || first)) {
      const want = start || post;
      const win = pool.filter((r) => (start ? yr(r) === want : yr(r) === want || yr(r) === want - 1));
      if (win.length) pool = win;
      else if (pool.length > 1) return null;
    }
    const score = (r) => {
      let sc = 0;
      if (year && String(yr(r)) === String(year)) sc += 100;
      if (tv && start && yr(r) === start) sc += 100;
      if (tv && first) sc += yr(r) === post ? 60 : 30;
      sc += Math.log10((r.vote_count || 0) + 1) * 10 + Math.log10((r.popularity || 0) + 1) * 6;
      return sc;
    };
    return pool.slice().sort((x, y) => score(y) - score(x))[0];
  }

  const packHit = (r, type) => ({
    i: r.id,
    t: type,
    p: r.poster_path || '',
    b: r.backdrop_path || '',
    r: r.vote_average ? Number(r.vote_average.toFixed(1)) : 0,
    n: r.vote_count || 0,
  });

  function cacheSet(key, val) {
    const fresh = store.get('tmdbcache', {}) || {};
    fresh[key] = val;
    const keys = Object.keys(fresh);
    if (keys.length > 800) keys.slice(0, keys.length - 800).forEach((k) => delete fresh[k]);
    store.set('tmdbcache', fresh);
  }

  const fixes = () => store.get('tmdbfix', {}) || {};
  const imdbIdFrom = (txt) => ((String(txt || '').match(/imdb\.com\\?\/title\\?\/(tt\d+)/) || [])[1] || '');

  async function tmdbFind(name, year, tv, ctx) {
    if (!tmdbOn() || !name) return null;
    ctx = ctx || {};
    const hint = tv ? (ctx.start || ctx.post || '') + '|' + (ctx.season || '') : year || '';
    const key = (tv ? 't|' : 'm|') + norm(name) + '|' + hint;
    const cache = store.get('tmdbcache', {}) || {};
    if (key in cache) return cache[key] || null;
    const type = tv ? 'tv' : 'movie';
    let hit = null;
    try {
      const params = { query: name, include_adult: false };
      if (!tv && year) params.year = year;
      if (tv && ctx.start) params.first_air_date_year = ctx.start;
      const d = await tmdbGet('/search/' + type, params);
      hit = pickResult(d.results || [], name, tv ? '' : year, tv, ctx);
      if (!hit && !tv && year) {
        const d2 = await tmdbGet('/search/movie', { query: name, include_adult: false });
        hit = pickResult(d2.results || [], name, year, false, ctx);
      }
      if (!hit && tv && ctx.start) {
        const d3 = await tmdbGet('/search/tv', { query: name, include_adult: false });
        hit = pickResult(d3.results || [], name, '', true, ctx);
      }
    } catch (e) {
      return null;
    }
    const val = hit ? packHit(hit, type) : 0;
    cacheSet(key, val);
    return val || null;
  }

  async function tmdbByImdb(tt, tv) {
    if (!tmdbOn() || !tt) return null;
    const key = 'i|' + tt;
    const cache = store.get('tmdbcache', {}) || {};
    if (key in cache) return cache[key] || null;
    let d;
    try {
      d = await tmdbGet('/find/' + tt, { external_source: 'imdb_id' });
    } catch (e) {
      return null;
    }
    const m = (d.movie_results || [])[0];
    const t = (d.tv_results || [])[0];
    const r = tv ? t || m : m || t;
    const val = r ? packHit(r, r === m ? 'movie' : 'tv') : 0;
    cacheSet(key, val);
    return val || null;
  }

  const imdbQueue = [];
  let imdbActive = 0;
  function imdbFromPage(href) {
    const path = new URL(href, location.href).pathname;
    const map = store.get('imdbmap', {}) || {};
    if (map[path]) return Promise.resolve(map[path]);
    if (map[path] === 0) return Promise.resolve('');
    return new Promise((resolve) => {
      const run = async () => {
        imdbActive++;
        try {
          const res = await fetch(href, { credentials: 'same-origin' });
          if (res.ok) {
            const tt = imdbIdFrom(await res.text());
            const m2 = store.get('imdbmap', {}) || {};
            m2[path] = tt || 0;
            const keys = Object.keys(m2);
            if (keys.length > 1500) keys.slice(0, keys.length - 1500).forEach((k) => delete m2[k]);
            store.set('imdbmap', m2);
            resolve(tt);
          } else resolve('');
        } catch (e) {
          resolve('');
        }
        imdbActive--;
        const next = imdbQueue.shift();
        if (next) next();
      };
      if (imdbActive < 2) run();
      else imdbQueue.push(run);
    });
  }

  const wpFull = (src) => src.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))(\?[^#]*)?$/i, '$1$2');

  function swapImg(img, url) {
    const t = new Image();
    t.onload = () => {
      img.removeAttribute('srcset');
      img.src = url;
    };
    t.src = url;
  }

  async function enrichCard(card) {
    const name = card.dataset.pmName;
    if (!name) return;
    const href = card.dataset.pmHref || '';
    const path = href ? new URL(href, location.href).pathname : '';
    const tv = card.dataset.pmTv === '1';
    let hit = (path && fixes()[path]) || null;
    if (!hit && state.tmdbExact === 'on' && href) {
      const tt = await imdbFromPage(href);
      if (tt) hit = await tmdbByImdb(tt, tv);
    }
    if (!hit) hit = await tmdbFind(name, card.dataset.pmYear, tv, { post: card.dataset.pmPost, season: card.dataset.pmSeason });
    if (!hit) return;
    const img = card.querySelector('.post-thumbnail img');
    if (img && hit.p) swapImg(img, IMG + 'w500' + hit.p);
    const yr = card.querySelector('.pm-yr');
    if (yr && hit.r && hit.n >= 10 && !yr.dataset.rt) {
      yr.dataset.rt = '1';
      yr.textContent = (yr.textContent ? yr.textContent + ' \u00B7 ' : '') + '\u2605 ' + hit.r;
    }
  }

  function upgradePosters() {
    document.querySelectorAll('.pm-card .post-thumbnail img').forEach((img) => {
      if (img.dataset.pmUp) return;
      img.dataset.pmUp = '1';
      const cur = img.currentSrc || img.src;
      const full = wpFull(cur);
      if (full !== cur) swapImg(img, full);
    });
    document.querySelectorAll('.pic-grid img').forEach((img) => {
      if (img.dataset.pmUp) return;
      img.dataset.pmUp = '1';
      const cur = img.currentSrc || img.src;
      const bigger = cur.replace(/-110x153(\.\w+)(\?[^#]*)?$/i, '-165x253$1$2');
      if (bigger !== cur) swapImg(img, bigger);
    });
    if (!tmdbOn() || state.tmdbPosters !== 'on' || !('IntersectionObserver' in window)) return;
    const todo = CARDS.filter((c) => !c.dataset.pmT);
    if (!todo.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          enrichCard(en.target);
        }),
      { rootMargin: '700px 0px' }
    );
    todo.forEach((c) => {
      c.dataset.pmT = '1';
      io.observe(c);
    });
  }

  function renderWall(urls, land) {
    const mast = document.querySelector('.pm-mast');
    if (!mast || !urls.length) return;
    let wall = mast.querySelector('.pm-wall');
    if (!wall) {
      wall = el('div', 'pm-wall');
      mast.prepend(wall);
    }
    wall.textContent = '';
    const track = el('div', 'pm-track' + (land ? ' pm-land' : ''));
    [...urls, ...urls].forEach((u) => {
      const im = new Image();
      im.alt = '';
      im.decoding = 'async';
      im.onerror = () => im.remove();
      im.src = u;
      track.appendChild(im);
    });
    wall.appendChild(track);
  }

  function setAmbient(url) {
    let a = document.querySelector('.pm-amb');
    if (!a) {
      a = el('div', 'pm-amb');
      document.body.prepend(a);
    }
    a.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
  }

  async function refreshTrending() {
    if (!tmdbOn() || state.tmdbMast !== 'on') return;
    const c = store.get('trend', null);
    if (c && c.t && c.l && c.l.length && Date.now() - c.t < 12 * 3600e3) return;
    try {
      const d = await tmdbGet('/trending/movie/week');
      const l = (d.results || []).filter((r) => r.backdrop_path).slice(0, 14).map((r) => IMG + 'w780' + r.backdrop_path);
      if (l.length) {
        store.set('trend', { t: Date.now(), l });
        if (!c && !HERO) renderWall(l, true);
      }
    } catch (e) {
      /* offline: keep whatever is cached */
    }
  }

  const personUrl = (id) => 'https://www.themoviedb.org/person/' + id;
  const uniqBy = (arr) => {
    const seen = new Set();
    return arr.filter((x) => x && x.id != null && !seen.has(x.id) && seen.add(x.id));
  };

  function personCard(p, cls, role) {
    const li = el('li', cls || '');
    const a = el('a', 'pm-pc');
    a.href = personUrl(p.id);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = p.name + ' on TMDb';
    const fig = el('span', 'pm-pf');
    if (p.profile_path) {
      const im = new Image();
      im.alt = '';
      im.loading = 'lazy';
      im.src = IMG + 'w342' + p.profile_path;
      fig.appendChild(im);
    } else {
      fig.appendChild(el('span', 'pm-ph', (p.name || '?').trim().charAt(0)));
    }
    a.append(fig, el('b', '', p.name), el('i', '', p.role || ''));
    li.appendChild(a);
    if (role) {
      const b = el('button', 'pm-pbtn', 'Find on Pahe');
      b.type = 'button';
      b.title = 'Every film and series with ' + p.name + ' that Pahe has';
      b.addEventListener('click', () => {
        if (SEARCH) SEARCH.openPerson({ id: p.id, name: p.name, role, photo: p.profile_path });
      });
      li.appendChild(b);
    }
    return li;
  }

  function peopleSection(d, hit) {
    const crew = (d.credits && d.credits.crew) || [];
    const pick = (jobs) => uniqBy(crew.filter((c) => jobs.includes(c.job)));
    let dirs = [];
    let label = 'Directed by';
    if (hit.t === 'tv') {
      dirs = uniqBy((d.created_by || []).map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, role: 'Creator' })));
      label = 'Created by';
    }
    if (!dirs.length) {
      dirs = pick(['Director']).map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, role: 'Director' }));
      label = 'Directed by';
    }
    const roles = [
      ['Writing', ['Screenplay', 'Writer', 'Story', 'Novel']],
      ['Cinematography', ['Director of Photography']],
      ['Music', ['Original Music Composer', 'Music']],
      ['Editing', ['Editor']],
      ['Producers', ['Producer']],
    ];
    const key = el('dl', 'pm-keycrew');
    roles.forEach(([name, jobs]) => {
      const list = pick(jobs).slice(0, 3);
      if (!list.length) return;
      const dd = el('dd');
      list.forEach((p, i) => {
        if (i) dd.appendChild(document.createTextNode(', '));
        const a = el('a', '', p.name);
        a.href = personUrl(p.id);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        dd.appendChild(a);
      });
      key.append(el('dt', '', name), dd);
    });
    if (!dirs.length && !key.children.length) return null;

    const sec = el('section', 'pm-people');
    if (dirs.length) {
      const left = el('div', 'pm-dir');
      left.appendChild(el('h3', '', label));
      const ul = el('ul', 'pm-dirrow');
      dirs.slice(0, 4).forEach((p) => ul.appendChild(personCard(p, '', p.role === 'Creator' ? 'creator' : 'director')));
      left.appendChild(ul);
      sec.appendChild(left);
    }
    if (key.children.length) {
      const right = el('div', 'pm-key');
      right.appendChild(el('h3', '', 'Key crew'));
      right.appendChild(key);
      sec.appendChild(right);
    }
    return sec;
  }

  function castSection(cast) {
    const sec = el('section', 'pm-cast');
    const head = el('div', 'pm-ch');
    head.appendChild(el('h3', '', 'Cast'));
    const ctr = el('div', 'pm-cc');
    const mkb = (txt, label) => {
      const b = el('button', '', txt);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      return b;
    };
    const prev = mkb('\u2190', 'Previous cast members');
    const next = mkb('\u2192', 'Next cast members');
    prev.classList.add('pm-pr');
    next.classList.add('pm-nx');
    const all = mkb('View all', 'Show the whole cast');
    all.classList.add('pm-cv');
    ctr.append(prev, next, all);
    head.appendChild(ctr);

    const wrap = el('div', 'pm-cwrap');
    const ul = el('ul', 'pm-castrow');
    cast.forEach((c, i) => {
      const li = personCard({ id: c.id, name: c.name, profile_path: c.profile_path, role: c.character }, '', 'actor');
      const a = li.querySelector('a');
      a.querySelector('.pm-pf').appendChild(el('em', 'pm-ci', String(i + 1).padStart(2, '0')));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    sec.append(head, wrap);

    const upd = () => {
      const max = ul.scrollWidth - ul.clientWidth;
      wrap.classList.toggle('pm-l', ul.scrollLeft > 4);
      wrap.classList.toggle('pm-r', ul.scrollLeft < max - 4);
      prev.disabled = ul.scrollLeft <= 4;
      next.disabled = ul.scrollLeft >= max - 4;
    };
    ul.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    setTimeout(upd, 80);
    prev.addEventListener('click', () => ul.scrollBy({ left: -ul.clientWidth * 0.85, behavior: 'smooth' }));
    next.addEventListener('click', () => ul.scrollBy({ left: ul.clientWidth * 0.85, behavior: 'smooth' }));
    all.addEventListener('click', () => {
      sec.classList.toggle('pm-all');
      all.textContent = sec.classList.contains('pm-all') ? 'Carousel' : 'View all';
      upd();
    });

    let down = false;
    let moved = false;
    let sx = 0;
    let sl = 0;
    ul.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || sec.classList.contains('pm-all')) return;
      down = true;
      moved = false;
      sx = e.clientX;
      sl = ul.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 4) {
        moved = true;
        ul.classList.add('pm-drag');
        ul.scrollLeft = sl - dx;
      }
    });
    window.addEventListener('pointerup', () => {
      down = false;
      ul.classList.remove('pm-drag');
    });
    ul.addEventListener(
      'click',
      (e) => {
        if (moved) {
          e.preventDefault();
          moved = false;
        }
      },
      true
    );
    return sec;
  }

  function addMatchNote(d, how) {
    const info = document.querySelector('.pm-info');
    if (!info || info.querySelector('.pm-match')) return;
    const p = el('p', 'pm-match');
    if (d) {
      const title = d.title || d.name || '';
      const yr = String(d.release_date || d.first_air_date || '').slice(0, 4);
      p.appendChild(document.createTextNode('TMDb match: ' + title + (yr ? ' (' + yr + ')' : '') + ' \u00B7 ' + (how === 'imdb' ? 'exact, by IMDb ID' : how === 'manual' ? 'chosen by you' : 'by title and year') + ' \u00B7 '));
    } else p.appendChild(document.createTextNode('No TMDb match found \u00B7 '));
    const a = el('a', '', how === 'imdb' ? 'Change' : 'Wrong match?');
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openPicker();
    });
    p.appendChild(a);
    info.appendChild(p);
  }

  function closePicker() {
    root.classList.remove('pm-picking');
  }

  function openPicker() {
    whenReady(() => {
      let m = document.querySelector('.pm-pick');
      if (!m) m = buildPicker();
      root.classList.remove('pm-index', 'pm-searching', 'pm-settings');
      root.classList.add('pm-picking');
      const inp = m.querySelector('.pm-pickin');
      inp.value = HERO ? HERO.name : '';
      inp.dispatchEvent(new Event('input'));
      setTimeout(() => inp.focus(), 60);
    });
  }

  function buildPicker() {
    const modal = el('div', 'pm-modal pm-pick');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Choose the TMDb match');
    const sheet = el('div', 'pm-sheet');
    modal.appendChild(sheet);
    const head = el('div', 'pm-mh');
    const x = el('button', 'pm-mini', 'Close');
    x.type = 'button';
    x.addEventListener('click', closePicker);
    head.append(el('h2', '', 'Right film?'), x);
    sheet.append(head, el('p', 'pm-msub', 'Pick the correct title. It is remembered for this page and used on the listings too. You can also paste a TMDb link or an IMDb ID.'));
    const inp = el('input', 'pm-pickin');
    inp.type = 'text';
    inp.placeholder = 'Search TMDb, or paste a link / tt1234567';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    const status = el('p', 'pm-mstatus', '');
    const ul = el('ul', 'pm-pickres');
    const auto = el('button', 'pm-mini', 'Use automatic match');
    auto.type = 'button';
    auto.addEventListener('click', () => {
      const fx = fixes();
      delete fx[location.pathname];
      store.set('tmdbfix', fx);
      location.reload();
    });
    sheet.append(inp, status, ul, auto);

    const save = (r, type) => {
      const fx = fixes();
      fx[location.pathname] = packHit(r, type);
      store.set('tmdbfix', fx);
      status.textContent = 'Saved. Reloading\u2026';
      setTimeout(() => location.reload(), 500);
    };
    const row = (r, type) => {
      const li = el('li');
      const b = el('button');
      b.type = 'button';
      const im = el('img');
      im.alt = '';
      if (r.poster_path) im.src = IMG + 'w92' + r.poster_path;
      const mid = el('span', 'pm-pm');
      const yr = String(r.release_date || r.first_air_date || '').slice(0, 4);
      mid.append(el('span', 'pm-pt', (r.title || r.name || '') + (yr ? ' (' + yr + ')' : '')), el('span', 'pm-ps', (type === 'tv' ? 'Series' : 'Film') + (r.overview ? ' \u00B7 ' + r.overview.slice(0, 140) : '')));
      b.append(im, mid);
      b.addEventListener('click', () => save(r, type));
      li.appendChild(b);
      return li;
    };

    let timer = 0;
    let seq = 0;
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = inp.value.trim();
        const my = ++seq;
        ul.textContent = '';
        if (q.length < 2) {
          status.textContent = '';
          return;
        }
        status.textContent = 'Searching\u2026';
        try {
          const url = q.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
          const tt = imdbIdFrom('imdb.com/title/' + (q.match(/tt\d+/) || [''])[0]);
          let rows = [];
          if (url) {
            const d = await tmdbGet('/' + url[1] + '/' + url[2], {});
            rows = [row(d, url[1])];
          } else if (tt) {
            const d = await tmdbGet('/find/' + tt, { external_source: 'imdb_id' });
            rows = [...(d.movie_results || []).map((r) => row(r, 'movie')), ...(d.tv_results || []).map((r) => row(r, 'tv'))];
          } else {
            const d = await tmdbGet('/search/multi', { query: q, include_adult: false });
            rows = (d.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10).map((r) => row(r, r.media_type));
          }
          if (my !== seq) return;
          rows.forEach((li) => ul.appendChild(li));
          status.textContent = rows.length ? '' : 'Nothing found.';
        } catch (e) {
          if (my === seq) status.textContent = 'Could not reach TMDb.';
        }
      }, 250);
    });
    document.body.appendChild(modal);
    return modal;
  }

  async function enrichFilm() {
    if (!HERO || !tmdbOn() || state.tmdbPage !== 'on') return;
    const post = document.getElementById('the-post');
    if (!post) return;
    const path = location.pathname;
    let how = 'title';
    let hit = fixes()[path] || null;
    if (hit) how = 'manual';
    if (!hit && HERO.imdb) {
      hit = await tmdbByImdb(HERO.imdb, HERO.tv);
      if (hit) how = 'imdb';
    }
    if (!hit) hit = await tmdbFind(HERO.name, HERO.tv ? '' : HERO.year, HERO.tv, { start: HERO.tv ? HERO.start : '', post: HERO.post, season: HERO.season });
    if (!hit && !HERO.imdb) hit = await tmdbFind(HERO.name, HERO.tv ? HERO.year : '', !HERO.tv, {});
    if (!hit) {
      addMatchNote(null, how);
      return;
    }
    if (HERO.imdb) {
      const map = store.get('imdbmap', {}) || {};
      if (map[path] !== HERO.imdb) {
        map[path] = HERO.imdb;
        store.set('imdbmap', map);
      }
    }
    if (!HERO.imdb && hit.t === 'movie') enrichLetterboxd('', hit.i).catch(() => {});
    const lb = document.querySelector('.pm-lb');
    if (lb) {
      if (hit.t === 'tv') lb.remove();
      else if (!HERO.imdb) lb.href = 'https://letterboxd.com/tmdb/' + hit.i + '/';
    } else if (hit.t === 'movie' && state.letterboxd === 'on') {
      const acts = document.querySelector('.pm-actions');
      if (acts) {
        const a = letterboxdLink(HERO);
        if (!HERO.imdb) a.href = 'https://letterboxd.com/tmdb/' + hit.i + '/';
        acts.appendChild(a);
      }
    }
    let d = null;
    try {
      d = await tmdbGet('/' + hit.t + '/' + hit.i, { append_to_response: 'credits,videos,images', include_image_language: 'en,null' });
    } catch (e) {
      return;
    }
    if (!d) return;

    const pimg = post.querySelector('.pm-poster img');
    if (pimg && hit.p) swapImg(pimg, IMG + 'w780' + hit.p);

    const bd = d.backdrop_path || hit.b;
    if (bd) setAmbient(IMG + 'w780' + bd);

    const hero = post.querySelector('.pm-hero');
    let anchor = hero;
    if (hero && bd && !post.querySelector('.pm-still')) {
      const fig = el('figure', 'pm-still');
      const im = new Image();
      im.alt = '';
      im.src = IMG + 'w1280' + bd;
      fig.appendChild(im);
      if (d.tagline) fig.appendChild(el('figcaption', '', d.tagline));
      hero.after(fig);
      anchor = fig;
    }
    if (anchor && !post.querySelector('.pm-people')) {
      const people = peopleSection(d, hit);
      if (people) {
        anchor.after(people);
        anchor = people;
      }
    }
    const cast = ((d.credits && d.credits.cast) || []).filter((c) => c.profile_path).slice(0, 30);
    if (anchor && cast.length && !post.querySelector('.pm-cast')) anchor.after(castSection(cast));

    const vids = ((d.videos && d.videos.results) || []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer');
    const tr = vids.find((v) => v.official) || vids[0];
    const actions = post.querySelector('.pm-actions');
    if (tr && actions && !actions.querySelector('.pm-trailer')) {
      const a = el('a', 'pm-cta pm-trailer', 'Trailer \u25B6');
      a.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(tr.key);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      actions.appendChild(a);
    }

    addMatchNote(d, how);

    if (state.tmdbMast === 'on') {
      const stills = ((d.images && d.images.backdrops) || []).filter((b) => !b.iso_639_1).slice(0, 10).map((b) => IMG + 'w780' + b.file_path);
      if (stills.length >= 3) renderWall(stills, true);
    }
    runGuard(false);
  }

  /* ------------------------------------------------------------------ */
  /*  cinema masthead + ambient glow                                     */
  /* ------------------------------------------------------------------ */

  function posterUrls() {
    const sels = ['.pic-grid img', '.pm-poster img', '.imdbwp__img', '.pm-card .post-thumbnail img', '.pt-cv-thumbnail', '#sidebar .posts-list img'];
    const urls = [];
    sels.forEach((sel) =>
      document.querySelectorAll(sel).forEach((im) => {
        const u = im.currentSrc || im.src;
        if (u && /^https?:/.test(u) && !/gravatar|avatar/.test(u) && !urls.includes(u)) urls.push(u);
      })
    );
    const cached = store.get('posters', []) || [];
    const merged = [...urls, ...cached.filter((u) => !urls.includes(u))];
    if (urls.length) store.set('posters', merged.slice(0, 24));
    return merged.slice(0, 16);
  }

  function buildMast() {
    const hc = document.querySelector('.header-content');
    if (!hc || hc.querySelector('.pm-mast')) return;
    const mast = el('div', 'pm-mast');
    mast.setAttribute('aria-hidden', 'true');
    mast.append(el('div', 'pm-vig'), el('div', 'pm-beam'), el('div', 'pm-bar t'), el('div', 'pm-bar b'));
    hc.prepend(mast);
    const trend = tmdbOn() && state.tmdbMast === 'on' ? store.get('trend', null) : null;
    if (trend && trend.l && trend.l.length >= 3) renderWall(trend.l, true);
    else {
      const urls = posterUrls();
      if (urls.length >= 3) renderWall(urls, false);
    }
  }

  function buildAmbient() {
    if (document.querySelector('.pm-amb')) return;
    const pick = document.querySelector('.imdbwp__img, .pm-card .post-thumbnail img, .pt-cv-thumbnail, .pic-grid img');
    const src = (pick && (pick.currentSrc || pick.src)) || (store.get('posters', []) || [])[0];
    if (!src || !/^https?:/.test(src)) return;
    setAmbient(src);
  }

  function dropdownFlip() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    nav.addEventListener('mouseover', (e) => {
      const li = e.target.closest && e.target.closest('li');
      const ul = li && [...li.children].find((c) => c.tagName === 'UL');
      if (!ul) return;
      const check = () => {
        ul.classList.remove('pm-flip');
        const r = ul.getBoundingClientRect();
        if (r.width && r.right > window.innerWidth - 8) ul.classList.add('pm-flip');
      };
      setTimeout(check, 40);
      setTimeout(check, 200);
    });
  }

  function tmdbCredit() {
    if (!tmdbOn()) return;
    const fb = document.querySelector('.footer-bottom .container') || document.querySelector('.footer-bottom');
    if (!fb || fb.querySelector('.pm-credit')) return;
    fb.appendChild(el('span', 'pm-credit', 'Film data and images courtesy of TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.'));
  }

  /* ------------------------------------------------------------------ */
  /*  background detection + nav height                                  */
  /* ------------------------------------------------------------------ */

  function detectBackdrop() {
    if (root.hasAttribute('data-pm-bgsrc')) return;
    const cover = document.querySelector('.background-cover');
    const coverImg = cover ? getComputedStyle(cover).backgroundImage : 'none';
    if (coverImg && coverImg !== 'none') {
      root.setAttribute('data-pm-bgsrc', 'cover');
      return;
    }
    const cs = getComputedStyle(document.body);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      root.style.setProperty('--pm-body-img', cs.backgroundImage);
      root.style.setProperty('--pm-body-size', cs.backgroundSize);
      root.style.setProperty('--pm-body-pos', cs.backgroundPosition);
      root.style.setProperty('--pm-body-repeat', cs.backgroundRepeat);
      root.style.setProperty('--pm-body-att', cs.backgroundAttachment);
      root.setAttribute('data-pm-bgsrc', 'body');
    }
  }

  function navHeight() {
    const nav = document.getElementById('main-nav');
    const h = nav && nav.offsetParent !== null ? nav.offsetHeight : 0;
    root.style.setProperty('--nav-h', h + 'px');
  }

  /* ------------------------------------------------------------------ */
  /*  contrast guard                                                     */
  /* ------------------------------------------------------------------ */

  function rgbOf(str) {
    if (!str) return null;
    let m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = str.match(/color\(srgb\s+([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  }
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  let guardTimer = 0;
  function runGuard(first) {
    clearTimeout(guardTimer);
    guardTimer = setTimeout(() => {
      const pageBg = rgbOf(getComputedStyle(root).backgroundColor) || { r: 10, g: 10, b: 10, a: 1 };
      const inkC = rgbOf(getComputedStyle(root).getPropertyValue('--ink').trim() ? cssVarColor('--ink') : '') || { r: 241, g: 237, b: 228, a: 1 };
      const bgC = pageBg;
      const cache = new Map();

      const bgOf = (e) => {
        if (!e || e === document.documentElement) return pageBg;
        if (cache.has(e)) return cache.get(e);
        const cs = getComputedStyle(e);
        let res;
        if (cs.backgroundImage && cs.backgroundImage !== 'none') res = null;
        else {
          const c = rgbOf(cs.backgroundColor);
          res = c && c.a >= 0.5 ? c : bgOf(e.parentElement);
        }
        cache.set(e, res);
        return res;
      };

      const scopes = document.querySelectorAll('#main-content, #sidebar, #top-nav, #main-nav, .header-content, .footer-bottom, #slide-out');
      const els = new Set();
      scopes.forEach((s) => {
        const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.nodeValue.trim() && n.parentElement && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName) ? 1 : 2),
        });
        let n;
        while ((n = w.nextNode())) els.add(n.parentElement);
      });

      const list = [...els];
      let i = 0;
      const step = () => {
        const end = Math.min(i + 400, list.length);
        for (; i < end; i++) {
          const e = list[i];
          if (e.closest('.pm-pill,.pm-search,.pm-flag,.pm-stat,.entry,svg')) continue;
          const cs = getComputedStyle(e);
          const fg = rgbOf(cs.color);
          if (!fg || fg.a < 0.1) continue;
          const bg = bgOf(e);
          if (!bg) continue;
          if (ratio(fg, bg) >= 3) continue;
          const cands = [inkC, bgC, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
          let best = cands[0];
          let bestR = 0;
          for (const c of cands) {
            const r = ratio(c, bg);
            if (r >= 4.5) {
              best = c;
              bestR = r;
              break;
            }
            if (r > bestR) {
              best = c;
              bestR = r;
            }
          }
          e.style.setProperty('color', `rgb(${best.r},${best.g},${best.b})`, 'important');
          e.setAttribute('data-pm-fix', '1');
        }
        if (i < list.length) (window.requestIdleCallback || setTimeout)(step);
      };
      step();
    }, first ? 400 : 120);
  }

  function cssVarColor(name) {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    probe.style.display = 'none';
    root.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }

  function resetGuard() {
    document.querySelectorAll('[data-pm-fix]').forEach((e) => {
      e.style.removeProperty('color');
      e.removeAttribute('data-pm-fix');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  chrome: drawer, search, pill, keys                                 */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /*  toast + settings modal                                             */
  /* ------------------------------------------------------------------ */

  function toast(msg, actions) {
    document.querySelectorAll('.pm-toast').forEach((t) => t.remove());
    const t = el('div', 'pm-toast');
    t.appendChild(el('p', '', msg));
    if (actions && actions.length) {
      const row = el('div', 'pm-trow');
      actions.forEach(([label, fn]) => {
        const b = el('button', '', label);
        b.type = 'button';
        b.addEventListener('click', () => {
          t.remove();
          if (fn) fn();
        });
        row.appendChild(b);
      });
      t.appendChild(row);
    } else {
      setTimeout(() => t.remove(), 4000);
    }
    document.body.appendChild(t);
  }

  function seg(label, opts, get, set) {
    const row = el('div', 'pm-set-row');
    row.appendChild(el('span', 'pm-set-l', label));
    const g = el('div', 'pm-seg');
    opts.forEach(([val, txt]) => {
      const b = el('button', '', txt);
      b.type = 'button';
      b.dataset.v = String(val);
      b.addEventListener('click', () => set(val));
      g.appendChild(b);
    });
    row.appendChild(g);
    UI.push(() => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(get())))));
    return row;
  }

  function closeSettings() {
    root.classList.remove('pm-settings');
  }

  function openSettings(focusKey) {
    whenReady(() => {
      let modal = document.querySelector('.pm-modal:not(.pm-pick)');
      if (!modal) modal = buildSettings();
      root.classList.remove('pm-index', 'pm-searching', 'pm-picking');
      root.classList.add('pm-settings');
      refreshUI();
      if (focusKey) {
        const k = modal.querySelector('.pm-keyinput');
        if (k) setTimeout(() => k.focus(), 60);
      }
    });
  }

  function buildSettings() {
    const modal = el('div', 'pm-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Pahe Cinema UI settings');
    const sheet = el('div', 'pm-sheet');
    modal.appendChild(sheet);

    const head = el('div', 'pm-mh');
    const x = el('button', 'pm-mini', 'Close');
    x.type = 'button';
    x.addEventListener('click', closeSettings);
    head.append(el('h2', '', 'Settings'), x);
    sheet.append(head, el('p', 'pm-msub', 'Stored in Tampermonkey for your own browser profile. They apply to every Pahe page you open, and each user keeps a separate set.'));

    const reloadBar = el('div', 'pm-mreload');
    reloadBar.hidden = true;
    const rb = el('button', 'pm-mini', 'Reload to apply');
    rb.type = 'button';
    rb.addEventListener('click', () => location.reload());
    reloadBar.append(el('span', '', 'Some changes need a reload.'), rb);
    const markReload = () => {
      NEED_RELOAD = true;
      reloadBar.hidden = false;
    };
    sheet.appendChild(reloadBar);

    const section = (title) => {
      const s = el('section', 'pm-ms');
      s.appendChild(el('h3', '', title));
      sheet.appendChild(s);
      return s;
    };
    const row = (label, hint, ...controls) => {
      const r = el('div', 'pm-mrow');
      const l = el('div', 'pm-ml');
      l.appendChild(el('b', '', label));
      if (hint) l.appendChild(el('small', '', hint));
      const c = el('div', 'pm-mc');
      c.append(...controls);
      r.append(l, c);
      return r;
    };
    const segc = (key, opts, reload) => {
      const g = el('div', 'pm-seg');
      opts.forEach(([v, t]) => {
        const b = el('button', '', t);
        b.type = 'button';
        b.dataset.v = String(v);
        b.addEventListener('click', () => {
          setSetting(key, typeof DEFAULTS[key] === 'number' ? Number(v) : v);
          if (reload) markReload();
        });
        g.appendChild(b);
      });
      UI.push(() => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(state[key])))));
      return g;
    };
    const btn = (label, fn) => {
      const b = el('button', 'pm-mini', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    const ONOFF = [['on', 'On'], ['off', 'Off']];

    /* TMDb */
    const t = section('TMDb');
    const keyIn = el('input', 'pm-keyinput');
    keyIn.type = 'password';
    keyIn.value = state.tmdbKey || '';
    keyIn.placeholder = 'v3 API key or v4 read access token';
    keyIn.autocomplete = 'off';
    keyIn.spellcheck = false;
    const status = el('p', 'pm-mstatus', '');
    status.setAttribute('aria-live', 'polite');
    const setStatus = (msg, cls) => {
      status.textContent = msg;
      status.className = 'pm-mstatus' + (cls ? ' ' + cls : '');
    };
    const show = btn('Show', () => {
      keyIn.type = keyIn.type === 'password' ? 'text' : 'password';
      show.textContent = keyIn.type === 'password' ? 'Show' : 'Hide';
    });
    const save = btn('Save', () => {
      tmdbBad = false;
      setSetting('tmdbKey', keyIn.value.trim());
      markReload();
      setStatus(keyIn.value.trim() ? 'Saved. Reload to start using it.' : 'Key removed.', 'ok');
    });
    const test = btn('Test', async () => {
      const v = keyIn.value.trim();
      if (!v) {
        setStatus('Enter a key first.', 'bad');
        return;
      }
      setStatus('Checking\u2026', '');
      try {
        await tmdbGet('/configuration', {}, v);
        setStatus('TMDb accepted this key.', 'ok');
      } catch (e) {
        setStatus(e && e.status === 401 ? 'TMDb rejected this key (401).' : 'Could not reach TMDb. Check your connection.', 'bad');
      }
    });
    const keyBox = el('div', 'pm-keybox');
    keyBox.append(keyIn, el('div', 'pm-keybtns'), status);
    keyBox.querySelector('.pm-keybtns').append(show, save, test);
    const get = el('a', 'pm-link', 'Get a free key \u2197');
    get.href = 'https://www.themoviedb.org/settings/api';
    get.target = '_blank';
    get.rel = 'noopener noreferrer';
    t.appendChild(row('API key or token', 'Each user adds their own. It never leaves your browser except to talk to TMDb.', keyBox));
    t.appendChild(row('', '', get));
    t.appendChild(row('Use TMDb', 'Master switch for everything below.', segc('tmdb', ONOFF, true)));
    t.appendChild(row('Posters and ratings', 'Sharper posters and a star rating on each card.', segc('tmdbPosters', ONOFF, true)));
    t.appendChild(row('Exact matching', 'Reads each title\u2019s IMDb ID from its own page so TMDb always picks the right film. Extra, cached requests to Pahe.', segc('tmdbExact', ONOFF)));
    t.appendChild(row('Film and series pages', 'Still, directors, key crew, cast, trailer link and poster glow.', segc('tmdbPage', ONOFF, true)));
    t.appendChild(row('Header stills', 'The Cinema header shows trending films, or this film\u2019s own stills.', segc('tmdbMast', ONOFF, true)));

    /* Appearance */
    const a = section('Appearance');
    a.appendChild(row('Mood', 'MUBI is dark, Criterion is paper.', segc('theme', [['dark', 'MUBI'], ['light', 'Criterion']])));
    a.appendChild(row('Header', 'Cinema: moving film wall. Plain: wordmark. Original: the site\u2019s own header.', segc('mast', [['cinema', 'Cinema'], ['plain', 'Plain'], ['orig', 'Original']])));
    a.appendChild(row('Layout', 'Posters or the ledger list.', segc('view', [['grid', 'Posters'], ['ledger', 'Ledger']])));
    a.appendChild(row('Poster columns', 'On wide screens. Smaller screens step down on their own.', segc('cols', [[4, '4'], [5, '5'], [6, '6']])));
    a.appendChild(row('Descriptions', 'Synopsis under each title in the ledger.', segc('desc', ONOFF)));
    a.appendChild(row('Runtime', 'Show film length as 125 min or as 2h 05m on film pages.', segc('runtime', [['min', 'Minutes'], ['hours', 'Hours']])));
    a.appendChild(row('Letterboxd link', 'Adds a Letterboxd button to film pages. Letterboxd lists films only, so series get none.', segc('letterboxd', ONOFF, true)));
    a.appendChild(row('Letterboxd rating', 'Shows the Letterboxd average next to the IMDb score. Reads the film page on letterboxd.com, cached for three days.', segc('lbrating', ONOFF, true)));
    a.appendChild(row('Backdrop', 'A soft glow from the current poster or still, plus the site\u2019s own background picture.', segc('bg', [['on', 'Show'], ['off', 'Hide']])));
    const range = el('input');
    range.type = 'range';
    range.min = '50';
    range.max = '100';
    range.value = String(Math.round(state.veil * 100));
    range.setAttribute('aria-label', 'Backdrop dimming');
    range.addEventListener('input', () => setSetting('veil', Number(range.value) / 100));
    UI.push(() => (range.value = String(Math.round(state.veil * 100))));
    a.appendChild(row('Dimming', 'How strongly the page colour covers the backdrop. Lower means more glow.', range));

    /* Search */
    const s = section('Search');
    s.appendChild(row('Live search', 'Results from Pahe and name suggestions appear while you type.', segc('live', ONOFF)));

    /* Data */
    const dsec = section('Data');
    const clearT = btn('Clear TMDb cache', () => {
      store.set('tmdbcache', {});
      store.set('trend', null);
      store.set('lbcache', {});
      toast('Caches cleared.');
    });
    const clearM = btn('Clear manual matches', () => {
      store.set('tmdbfix', {});
      store.set('imdbmap', {});
      toast('Manual matches cleared.');
    });
    const clearH = btn('Clear history', () => {
      store.set('recent', []);
      store.set('seen', {});
      store.set('searches', []);
      toast('History cleared.');
    });
    const exp = btn('Export', () => {
      const data = {};
      Object.keys(DEFAULTS)
        .filter((k) => k !== 'tmdbKey')
        .forEach((k) => (data[k] = state[k]));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = el('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'pahe-cinema-ui-settings.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    });
    const file = el('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.hidden = true;
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(String(fr.result));
          Object.keys(DEFAULTS).forEach((k) => {
            if (k !== 'tmdbKey' && k in data) setSetting(k, typeof DEFAULTS[k] === 'number' ? Number(data[k]) || DEFAULTS[k] : data[k]);
          });
          markReload();
          toast('Settings imported.');
        } catch (e) {
          toast('That file is not a valid settings export.');
        }
      };
      fr.readAsText(f);
    });
    const imp = btn('Import', () => file.click());
    const reset = btn('Reset display settings', () => {
      if (!confirm('Reset every setting except your TMDb key?')) return;
      Object.keys(DEFAULTS)
        .filter((k) => k !== 'tmdbKey')
        .forEach((k) => setSetting(k, DEFAULTS[k]));
      markReload();
    });
    const btns = el('div', 'pm-mbtns');
    btns.append(clearT, clearM, clearH, exp, imp, file, reset);
    dsec.appendChild(row('Maintenance', 'Export leaves your TMDb key out.', btns));

    sheet.appendChild(el('p', 'pm-mfine', 'Film data and images courtesy of TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    document.body.appendChild(modal);
    return modal;
  }

  /* ------------------------------------------------------------------ */
  /*  live search                                                        */
  /* ------------------------------------------------------------------ */

  const siteCache = new Map();
  async function siteSearch(q) {
    if (siteCache.has(q)) return siteCache.get(q);
    const res = await fetch('/?s=' + encodeURIComponent(q), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const nodes = [...doc.querySelectorAll('.timeline-post, .recent-box .item-list')];
    const list = nodes
      .slice(0, 10)
      .map((n) => {
        const a = n.querySelector('.post-box-title a');
        if (!a) return null;
        const img = n.querySelector('.post-thumbnail img');
        const raw = a.textContent.trim();
        return { raw, p: parseTitle(raw), href: a.href, img: img ? img.getAttribute('src') : '' };
      })
      .filter(Boolean);
    const out = { list, pages: ((doc.querySelector('.pagination .pages') || {}).textContent || '').trim() };
    siteCache.set(q, out);
    return out;
  }

  const sugCache = new Map();
  async function tmdbSuggest(q) {
    if (!tmdbOn()) return [];
    if (sugCache.has(q)) return sugCache.get(q);
    const d = await tmdbGet('/search/multi', { query: q, include_adult: false });
    const yr = (r) => String(r.release_date || r.first_air_date || '').slice(0, 4);
    const out = [];
    (d.results || [])
      .filter((r) => ['movie', 'tv', 'person'].includes(r.media_type))
      .slice(0, 7)
      .forEach((r) => {
        if (r.media_type === 'person') {
          out.push({
            type: 'person',
            id: r.id,
            label: r.name,
            sub: r.known_for_department || 'Person',
            img: r.profile_path,
            known: (r.known_for || []).filter((k) => k.title || k.name).map((k) => ({ label: k.title || k.name, year: yr(k), tv: k.media_type === 'tv', img: k.poster_path })),
          });
        } else {
          out.push({ type: r.media_type, id: r.id, label: r.title || r.name, sub: (r.media_type === 'tv' ? 'Series' : 'Film') + (yr(r) ? ' \u00B7 ' + yr(r) : ''), img: r.poster_path });
        }
      });
    sugCache.set(q, out);
    return out;
  }

  function buildSearch(closeIndex) {
    const search = el('div', 'pm-search');
    const sx = el('button', 'pm-x', 'Close');
    sx.type = 'button';
    const form = el('form');
    form.method = 'get';
    form.action = location.origin + '/';
    const wrap = el('div', 'pm-inwrap');
    const ghost = el('div', 'pm-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    const input = el('input');
    input.type = 'text';
    input.name = 's';
    input.placeholder = 'Search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search the collection');
    wrap.append(ghost, input);
    form.append(wrap, el('small', '', 'Press enter to search \u00B7 esc to close'));

    const live = el('div', 'pm-live');
    live.hidden = true;
    const bar = el('div', 'pm-lbar');
    const chips = [['all', 'All'], ['film', 'Films'], ['tv', 'Series']].map(([v, tx]) => {
      const b = el('button', '', tx);
      b.type = 'button';
      b.dataset.v = v;
      return b;
    });
    const count = el('span', 'pm-lcount', '');
    const seeAll = el('a', 'pm-lall', 'See all results \u2192');
    bar.append(...chips, count, seeAll);
    const cols = el('div', 'pm-lcols');
    const left = el('section', 'pm-lcol');
    const resUl = el('ul', 'pm-lres');
    const msg = el('p', 'pm-lmsg', '');
    const resH = el('h4', '', 'On Pahe');
    const moreBtn = el('button', 'pm-lmore', '');
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    left.append(resH, resUl, msg, moreBtn);
    const right = el('section', 'pm-lcol');
    const sugH = el('h4', '', 'Suggestions');
    const sugUl = el('ul', 'pm-lsug');
    right.append(sugH, sugUl);
    cols.append(left, right);
    const recent = el('div', 'pm-lrec');
    live.append(bar, cols, recent, el('p', 'pm-lhint', '\u2191 \u2193 navigate \u00B7 enter open \u00B7 tab complete \u00B7 esc close'));
    search.append(sx, form, live);
    document.body.appendChild(search);

    let timer = 0;
    let seq = 0;
    let chip = 'all';
    let data = null;
    let ghostFull = '';
    let mode = null;
    let act = -1;
    let person = null;
    const liveOn = () => state.live === 'on';
    const remember = (q) => {
      q = (q || '').trim();
      if (q.length < 2) return;
      const list = store.get('searches', []) || [];
      store.set('searches', [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8));
    };
    const hl = (text, q) => {
      const frag = document.createDocumentFragment();
      const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
      if (i < 0) {
        frag.appendChild(document.createTextNode(text));
        return frag;
      }
      frag.append(document.createTextNode(text.slice(0, i)), el('mark', '', text.slice(i, i + q.length)), document.createTextNode(text.slice(i + q.length)));
      return frag;
    };
    const items = () => [...search.querySelectorAll('.pm-lres li, .pm-lsug li')];
    const setAct = (n) => {
      const list = items();
      list.forEach((li) => li.classList.remove('pm-act'));
      if (!list.length) {
        act = -1;
        return;
      }
      act = (n + list.length) % list.length;
      list[act].classList.add('pm-act');
      list[act].scrollIntoView({ block: 'nearest' });
    };

    function updateGhost() {
      ghost.textContent = '';
      ghostFull = '';
      const q = input.value;
      if (!q || !data || !data.sug) return;
      const top = data.sug.find((s) => s.type !== 'person' && s.label.length > q.length && s.label.toLowerCase().startsWith(q.toLowerCase()));
      if (!top) return;
      ghostFull = top.label;
      ghost.append(el('span', 'pm-gv', q), document.createTextNode(top.label.slice(q.length)));
    }

    const seriesLike = (r) => !!(r.p.season || /\bSeason\b/i.test(r.raw));

    function makeRow(r, q, note) {
      const li = el('li');
      const a = el('a', 'pm-lr');
      a.href = r.href;
      a.addEventListener('click', () => remember(input.value));
      const im = el('img');
      im.alt = '';
      im.loading = 'lazy';
      if (r.img) im.src = r.img;
      const mid = el('div', 'pm-lmid');
      const tt = el('div', 'pm-lt');
      tt.appendChild(hl(r.p.name || r.raw, q));
      const metaBits = [r.p.year, r.p.season && 'Season ' + r.p.season, r.p.complete && 'Complete', r.p.edition, note].filter(Boolean).join(' \u00B7 ');
      mid.append(tt, el('div', 'pm-lm', metaBits));
      const f = el('div', 'pm-lf', [r.p.source, r.p.res.length ? r.p.res.join(' / ') : ''].filter(Boolean).join(' \u2014 '));
      a.append(im, mid, f);
      li.appendChild(a);
      return li;
    }

    function renderSite() {
      resUl.textContent = '';
      msg.textContent = '';
      if (!data) return;
      const { q, site } = data;
      if (!site) {
        msg.textContent = 'Could not reach the site search. Press enter to search normally.';
        count.textContent = '';
        return;
      }
      let list = site.list;
      if (chip !== 'all') list = list.filter((r) => (chip === 'tv') === seriesLike(r));
      list.forEach((r) => resUl.appendChild(makeRow(r, q, '')));
      if (!list.length) msg.textContent = site.list.length ? 'Nothing of that kind here. Try All.' : 'Nothing on Pahe for \u201C' + q + '\u201D yet. Try a suggestion.';
      count.textContent = list.length + ' shown' + (site.pages ? ' \u00B7 ' + site.pages : '');
      seeAll.hidden = false;
      seeAll.href = '/?s=' + encodeURIComponent(q);
    }

    function choose(label) {
      input.value = label;
      mode = null;
      ghost.textContent = '';
      ghostFull = '';
      run(label);
      input.focus();
    }

    function renderSug() {
      sugUl.textContent = '';
      if (!data) return;
      const list = mode ? mode.known : data.sug;
      sugH.textContent = mode ? 'Known for \u00B7 ' + mode.name : 'Suggestions';
      sugH.hidden = !list.length && !mode;
      if (mode) {
        const li = el('li');
        const b = el('button', 'pm-lalt', '\u2190 Back');
        b.type = 'button';
        b.addEventListener('click', () => {
          mode = null;
          renderSug();
        });
        li.appendChild(b);
        sugUl.appendChild(li);
        if (mode.id) {
          const li2 = el('li');
          const b2 = el('button', 'pm-lalt', 'All of ' + mode.name + ' on Pahe \u2192');
          b2.type = 'button';
          b2.addEventListener('click', () => startPerson({ id: mode.id, name: mode.name, role: mode.role, photo: mode.photo }));
          li2.appendChild(b2);
          sugUl.appendChild(li2);
        }
      }
      list.forEach((sg) => {
        const li = el('li');
        const b = el('button');
        b.type = 'button';
        const im = el('img');
        im.alt = '';
        if (sg.img) im.src = IMG + 'w92' + sg.img;
        const mid = el('span', 'pm-sm');
        const l = el('span', 'pm-sl');
        l.appendChild(hl(sg.label, data.q));
        mid.append(l, el('span', 'pm-ss', sg.sub));
        b.append(im, mid);
        b.addEventListener('click', () => {
          if (sg.type === 'person') {
            mode = {
              id: sg.id,
              role: /direct/i.test(sg.sub) ? 'director' : 'actor',
              photo: sg.img,
              name: sg.label,
              known: sg.known.map((k) => ({ type: k.tv ? 'tv' : 'movie', label: k.label, sub: (k.tv ? 'Series' : 'Film') + (k.year ? ' \u00B7 ' + k.year : ''), img: k.img })),
            };
            renderSug();
            setAct(-1);
          } else choose(sg.label);
        });
        li.appendChild(b);
        sugUl.appendChild(li);
      });
    }

    const JOBS = { director: ['Director'], creator: ['Creator', 'Director'] };

    async function loadCredits(p) {
      const d = await tmdbGet('/person/' + p.id + '/combined_credits');
      const thisYear = new Date().getFullYear();
      let raw;
      if (p.role === 'actor') raw = (d.cast || []).filter((c) => !/^(self|himself|herself|themselves)\b/i.test(c.character || '') && !(c.genre_ids || []).some((g) => g === 10767 || g === 10763));
      else raw = (d.crew || []).filter((c) => (JOBS[p.role] || JOBS.director).includes(c.job));
      const seen = new Set();
      const out = [];
      raw.forEach((c) => {
        const type = c.media_type === 'tv' ? 'tv' : 'movie';
        const title = c.title || c.name;
        const yr = String(c.release_date || c.first_air_date || '').slice(0, 4);
        const k = type + c.id;
        if (!title || seen.has(k) || (yr && Number(yr) > thisYear)) return;
        seen.add(k);
        out.push({ type, title, year: yr, votes: c.vote_count || 0, note: c.character ? 'as ' + c.character.replace(/\s*\(.*?\)\s*/g, ' ').trim() : c.job || '' });
      });
      out.sort((x, y) => y.votes - x.votes);
      return out.slice(0, 200);
    }

    const credMatch = (c, r) => {
      if (norm(r.p.name || r.raw) !== norm(c.title)) return false;
      if (c.type === 'tv') return seriesLike(r);
      if (seriesLike(r)) return false;
      return !c.year || !r.p.year || String(r.p.year) === String(c.year);
    };

    function renderPersonSide(P) {
      sugUl.textContent = '';
      sugH.textContent = 'Filmography';
      sugH.hidden = false;
      const li = el('li');
      const a = el('a', 'pm-lpa');
      a.href = 'https://www.themoviedb.org/person/' + P.id;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const im = el('img');
      im.alt = '';
      if (P.photo) im.src = IMG + 'w92' + P.photo;
      const mid = el('span', 'pm-sm');
      mid.append(el('span', 'pm-sl', P.name), el('span', 'pm-ss', (P.role === 'actor' ? 'Cast' : P.role === 'creator' ? 'Creator' : 'Director') + ' \u00B7 open on TMDb \u2197'));
      a.append(im, mid);
      li.appendChild(a);
      sugUl.appendChild(li);
      const li2 = el('li');
      const b = el('button', 'pm-lalt', P.role === 'actor' ? 'Also as director' : 'Also as actor');
      b.type = 'button';
      b.addEventListener('click', () => startPerson({ id: P.id, name: P.name, role: P.role === 'actor' ? 'director' : 'actor', photo: P.photo }));
      li2.appendChild(b);
      sugUl.appendChild(li2);
    }

    function renderPerson() {
      const P = person;
      if (!P) return;
      resUl.textContent = '';
      let list = P.found.slice().sort((x, y) => (Number(y.c.year) || 0) - (Number(x.c.year) || 0));
      if (chip !== 'all') list = list.filter(({ r }) => (chip === 'tv') === seriesLike(r));
      list.forEach(({ r, c }) => resUl.appendChild(makeRow(r, '', c.note)));
      count.textContent = P.found.length + ' on Pahe';
      seeAll.hidden = true;
      seeAll.href = '/?s=' + encodeURIComponent(P.name);
      const left = P.credits ? P.credits.length - P.pos : 0;
      if (P.scanning) msg.textContent = 'Checking ' + P.done + ' of ' + P.pos + ' titles\u2026';
      else if (!P.found.length) msg.textContent = 'None of the ' + P.pos + ' titles checked are on Pahe.' + (left ? ' Check more below.' : '');
      else msg.textContent = 'Checked ' + P.done + ' titles.' + (left ? ' ' + left + ' more not checked yet.' : '');
      moreBtn.hidden = P.scanning || !left;
      moreBtn.textContent = 'Check ' + Math.min(30, left) + ' more titles';
    }

    async function scanMore(my) {
      const P = person;
      if (!P || !P.credits || P.scanning) return;
      P.scanning = true;
      moreBtn.hidden = true;
      const batch = P.credits.slice(P.pos, P.pos + 30);
      P.pos += batch.length;
      let i = 0;
      const worker = async () => {
        while (i < batch.length) {
          const c = batch[i++];
          if (my !== seq) return;
          try {
            const site = await siteSearch(c.type === 'movie' && c.year ? c.title + ' ' + c.year : c.title);
            site.list.forEach((r) => {
              if (credMatch(c, r) && !P.seen.has(r.href)) {
                P.seen.add(r.href);
                P.found.push({ r, c });
              }
            });
          } catch (e) {
            /* skip this title */
          }
          P.done++;
          if (my === seq) renderPerson();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (my !== seq) return;
      P.scanning = false;
      renderPerson();
    }

    async function startPerson(p) {
      const my = ++seq;
      person = Object.assign({ found: [], seen: new Set(), pos: 0, done: 0, credits: null, scanning: false }, p);
      mode = null;
      data = null;
      ghost.textContent = '';
      ghostFull = '';
      live.hidden = false;
      bar.hidden = false;
      cols.hidden = false;
      recent.hidden = true;
      resH.textContent = p.name + ' on Pahe';
      resUl.textContent = '';
      moreBtn.hidden = true;
      count.textContent = '';
      renderPersonSide(person);
      setAct(-1);
      if (!tmdbOn()) {
        msg.textContent = 'Filmographies come from TMDb. Add a key in Settings to use this.';
        return;
      }
      msg.textContent = 'Loading filmography\u2026';
      try {
        person.credits = await loadCredits(p);
      } catch (e) {
        if (my === seq) msg.textContent = 'Could not load the filmography from TMDb.';
        return;
      }
      if (my !== seq) return;
      if (!person.credits.length) {
        msg.textContent = 'TMDb lists no ' + (p.role === 'actor' ? 'acting' : 'directing') + ' credits for this person.';
        return;
      }
      scanMore(my);
    }

    moreBtn.addEventListener('click', () => scanMore(seq));

    function showRecent() {
      recent.textContent = '';
      const list = store.get('searches', []) || [];
      if (!list.length) {
        live.hidden = true;
        return;
      }
      live.hidden = false;
      bar.hidden = true;
      cols.hidden = true;
      recent.hidden = false;
      recent.appendChild(el('h4', '', 'Recent searches'));
      list.forEach((q) => {
        const b = el('button', '', q);
        b.type = 'button';
        b.addEventListener('click', () => choose(q));
        recent.appendChild(b);
      });
    }

    async function run(q) {
      const my = ++seq;
      person = null;
      resH.textContent = 'On Pahe';
      moreBtn.hidden = true;
      live.hidden = false;
      bar.hidden = false;
      cols.hidden = false;
      recent.hidden = true;
      mode = null;
      resUl.textContent = '';
      msg.textContent = 'Searching\u2026';
      const [site, sug] = await Promise.all([siteSearch(q).catch(() => null), tmdbSuggest(q).catch(() => [])]);
      if (my !== seq) return;
      data = { q, site, sug };
      renderSite();
      renderSug();
      updateGhost();
      setAct(-1);
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      if (person) {
        person = null;
        seq++;
        resH.textContent = 'On Pahe';
        moreBtn.hidden = true;
      }
      const q = input.value.trim();
      updateGhost();
      if (!liveOn()) return;
      if (q.length < 2) {
        seq++;
        data = null;
        ghost.textContent = '';
        showRecent();
        return;
      }
      timer = setTimeout(() => run(q), 220);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAct(act + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAct(act - 1);
      } else if (e.key === 'Tab' && ghostFull && input.value.toLowerCase() !== ghostFull.toLowerCase()) {
        e.preventDefault();
        choose(ghostFull);
      } else if (e.key === 'Enter' && act >= 0) {
        const li = items()[act];
        const target = li && li.querySelector('a,button');
        if (target) {
          e.preventDefault();
          target.click();
        }
      }
    });
    form.addEventListener('submit', () => remember(input.value));
    chips[0].setAttribute('aria-pressed', 'true');
    chips.forEach((b) =>
      b.addEventListener('click', () => {
        chip = b.dataset.v;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
        if (person) renderPerson();
        else renderSite();
        setAct(-1);
      })
    );

    const open = () => {
      closeIndex();
      closeSettings();
      const q = new URLSearchParams(location.search).get('s');
      if (q && !input.value) input.value = q;
      root.classList.add('pm-searching');
      setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
      if (liveOn()) {
        const v = input.value.trim();
        if (v.length >= 2) run(v);
        else showRecent();
      }
    };
    const close = () => {
      root.classList.remove('pm-searching');
      seq++;
      person = null;
    };
    const openPerson = (pp) => {
      closeIndex();
      closeSettings();
      closePicker();
      root.classList.add('pm-searching');
      input.value = pp.name;
      startPerson(pp);
    };
    sx.addEventListener('click', close);
    return { open, close, openPerson };
  }

  /* ------------------------------------------------------------------ */
  /*  chrome: drawer, pill, keys                                         */
  /* ------------------------------------------------------------------ */

  function boot(cards, filterInput) {
    if (document.querySelector('.pm-pill')) return;

    const scrim = el('div', 'pm-scrim');
    document.body.appendChild(scrim);

    const side = document.getElementById('sidebar');
    const closeIndex = () => root.classList.remove('pm-index');
    scrim.addEventListener('click', closeIndex);

    if (side && !side.querySelector('.pm-dh')) {
      const dh = el('div', 'pm-dh');
      const x = el('button', '', 'Close');
      x.type = 'button';
      x.addEventListener('click', closeIndex);
      dh.append(el('span', '', 'Index'), x);

      const set = el('div', 'pm-set');
      set.appendChild(el('h4', '', 'Display'));
      set.appendChild(seg('Mood', [['dark', 'MUBI'], ['light', 'Criterion']], () => state.theme, (v) => setSetting('theme', v)));
      set.appendChild(seg('Header', [['cinema', 'Cinema'], ['plain', 'Plain'], ['orig', 'Original']], () => state.mast, (v) => setSetting('mast', v)));
      if (cards.length) {
        set.appendChild(seg('Layout', [['grid', 'Posters'], ['ledger', 'Ledger']], () => state.view, (v) => setSetting('view', v)));
        set.appendChild(seg('Descriptions', [['on', 'Show'], ['off', 'Hide']], () => state.desc, (v) => setSetting('desc', v)));
      }
      set.appendChild(seg('Backdrop', [['on', 'Show'], ['off', 'Hide']], () => state.bg, (v) => setSetting('bg', v)));
      const vr = el('div', 'pm-set-row');
      vr.appendChild(el('span', 'pm-set-l', 'Dimming'));
      const range = el('input');
      range.type = 'range';
      range.min = '50';
      range.max = '100';
      range.value = String(Math.round(state.veil * 100));
      range.setAttribute('aria-label', 'Backdrop dimming');
      range.addEventListener('input', () => setSetting('veil', Number(range.value) / 100));
      UI.push(() => (range.value = String(Math.round(state.veil * 100))));
      vr.appendChild(range);
      set.appendChild(vr);
      const all = el('button', 'pm-mini', 'All settings');
      all.type = 'button';
      all.addEventListener('click', () => openSettings());
      set.appendChild(all);

      const recent = store.get('recent', []) || [];
      const rec = el('div', 'pm-rec');
      if (recent.length) {
        rec.appendChild(el('h4', '', 'Recently opened'));
        const ul = el('ul');
        recent.forEach((r) => {
          const li = el('li');
          const a = el('a', '', r.t);
          a.href = r.p;
          li.append(a, el('small', '', r.y));
          ul.appendChild(li);
        });
        rec.appendChild(ul);
        const clr = el('button', 'pm-mini', 'Clear history');
        clr.type = 'button';
        clr.addEventListener('click', () => {
          store.set('recent', []);
          rec.remove();
        });
        rec.appendChild(clr);
      }
      side.prepend(dh, set);
      if (recent.length) set.after(rec);
    }

    const S = buildSearch(closeIndex);
    SEARCH = S;

    const pill = el('nav', 'pm-pill');
    pill.setAttribute('aria-label', 'Quick controls');
    const mk = (label, fn, title) => {
      const b = el('button', '', label);
      b.type = 'button';
      if (title) b.title = title;
      b.addEventListener('click', fn);
      pill.appendChild(b);
      return b;
    };

    const goHome = () => window.location.assign("/");
    if (window.location.pathname !== "/") {
        mk('Home', goHome, 'Go to the home page (h)');
    }

    const toggleIndex = () => root.classList.toggle('pm-index');
    mk('Index', toggleIndex, 'Open the index drawer (i)');

    let viewBtn = null;
    const toggleView = () => setSetting('view', state.view === 'grid' ? 'ledger' : 'grid');
    if (cards.length) {
      viewBtn = mk('', toggleView, 'Switch between posters and ledger (v)');
      UI.push(() => (viewBtn.textContent = state.view === 'grid' ? 'Ledger' : 'Posters'));
    }
    if (document.getElementById('pm-editions')) {
      mk('Editions \u2193', () => document.getElementById('pm-editions').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    if (filterInput) mk('Filter', () => filterInput.focus(), 'Filter this list (f)');
    mk('Search', S.open, 'Search (/)');

    const toggleTheme = () => setSetting('theme', state.theme === 'dark' ? 'light' : 'dark');
    const themeBtn = mk('', toggleTheme, 'Switch between MUBI (dark) and Criterion (paper) (t)');
    UI.push(() => (themeBtn.textContent = '\u25D0 ' + (state.theme === 'dark' ? 'Criterion' : 'MUBI')));
    document.body.appendChild(pill);
    refreshUI();

    let cursor = -1;
    const step = (d) => {
      if (!cards.length) return;
      cursor = Math.max(0, Math.min(cards.length - 1, cursor + d));
      const link = cards[cursor].querySelector('.post-box-title a');
      if (link) {
        link.focus({ preventScroll: true });
        cards[cursor].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeIndex();
        S.close();
        closeSettings();
        closePicker();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      switch (e.key) {
        case '/':
          e.preventDefault();
          S.open();
          break;
        case ',':
          openSettings();
          break;
        case 'i':
          toggleIndex();
          break;
        case 't':
          toggleTheme();
          break;
        case 'v':
          if (viewBtn) toggleView();
          break;
        case 'h':
          goHome();
          break;
        case 'f':
          if (filterInput) {
            e.preventDefault();
            filterInput.focus();
          }
          break;
        case 'j':
          step(1);
          break;
        case 'k':
          step(-1);
          break;
      }
    });

    if (!tmdbKey() && state.tmdb === 'on' && !store.get('nag', false)) {
      setTimeout(
        () =>
          toast('Add a free TMDb key for sharper posters, directors, cast and trailers.', [
            ['Add key', () => openSettings(true)],
            ['Not now', () => store.set('nag', true)],
          ]),
        1200
      );
    }
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    try {
      GM_registerMenuCommand('Pahe Cinema UI \u2014 Settings', () => openSettings());
      GM_registerMenuCommand('Switch MUBI / Criterion', () => setSetting('theme', state.theme === 'dark' ? 'light' : 'dark'));
      GM_registerMenuCommand('Turn TMDb on / off', () => {
        setSetting('tmdb', state.tmdb === 'on' ? 'off' : 'on');
        location.reload();
      });
      GM_registerMenuCommand('Clear TMDb cache', () => {
        store.set('tmdbcache', {});
        store.set('trend', null);
        whenReady(() => toast('TMDb cache cleared.'));
      });
    } catch (e) {
      /* menu unavailable */
    }
  }

  /* ------------------------------------------------------------------ */

  function init() {
    detectBackdrop();
    navHeight();
    const cards = safe(decorateCards) || CARDS;
    safe(sectionHeads);
    const heroOk = safe(buildHero);
    safe(buildSpec);
    safe(buildEditions);
    safe(fixPostNav);
    safe(() => {
      if (HERO && !HERO.tv && HERO.imdb) enrichLetterboxd(HERO.imdb, '').catch(() => {});
    });
    const filterInput = safe(enhanceLists) || safe(enhanceGrids);
    safe(buildMast);
    safe(buildAmbient);
    safe(upgradePosters);
    safe(dropdownFlip);
    safe(tmdbCredit);
    safe(() => {
      enrichFilm().catch(() => {});
      refreshTrending().catch(() => {});
    });
    safe(() => boot(cards, filterInput));
    runGuard(true);

    window.addEventListener('load', () => {
      detectBackdrop();
      navHeight();
      runGuard(false);
    });
    window.addEventListener('resize', navHeight);
    void heroOk;
  }

  registerMenu();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();