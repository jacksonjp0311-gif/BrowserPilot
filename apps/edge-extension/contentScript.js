// Injects a small floating button on every page to open the BrowserPilot side panel
// Also exposes minimal browser-control primitives via messages.

(function () {
  const ID = 'agnt-browser-agents-fab';
  const STYLE_ID = 'agnt-browser-agents-fab-style';
  const FAB_MAX_REMOUNTS = 8;
  const FAB_REMOUNT_THROTTLE_MS = 3000;
  const REGION_WATCH_MAX_MS = 10 * 60 * 1000;
  const THREAT_SCAN_BUDGET = {
    maxNodes: 1200,
    maxLinks: 300,
    maxFrames: 60,
    maxForms: 80,
    maxScripts: 120,
    maxComments: 100,
    maxDurationMs: 1800
  };
  const CONTEXT_RADAR_BUDGET = {
    maxCandidates: 300,
    maxDurationMs: 1500
  };
  const pageToolGovernor = {
    activeTool: 'none',
    startedAt: null,
    stopReason: null,
    timers: new Set(),
    changeCount: 0
  };

  function telemetry(eventType, data = {}) {
    chrome.runtime?.sendMessage?.({ type: 'AGNT_TELEMETRY', eventType, data }).catch(() => {});
  }

  function toolStatus(extra = {}) {
    return {
      activeTool: pageToolGovernor.activeTool,
      startedAt: pageToolGovernor.startedAt,
      stopReason: pageToolGovernor.stopReason,
      ...extra
    };
  }

  function startPageTool(name) {
    if (pageToolGovernor.activeTool !== 'none' && pageToolGovernor.activeTool !== name) {
      return { ok: false, error: `Page tool already active: ${pageToolGovernor.activeTool}`, status: toolStatus() };
    }
    pageToolGovernor.activeTool = name;
    pageToolGovernor.startedAt = new Date().toISOString();
    pageToolGovernor.stopReason = null;
    return { ok: true, status: toolStatus() };
  }

  function clearGovernorTimers() {
    for (const timer of pageToolGovernor.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    pageToolGovernor.timers.clear();
  }

  function finishPageTool(name, reason = 'completed') {
    if (pageToolGovernor.activeTool === name) {
      pageToolGovernor.activeTool = 'none';
      pageToolGovernor.stopReason = reason;
    }
    return toolStatus();
  }

  function stopAllPageTools(reason = 'stop_all_page_tools') {
    const previousTool = pageToolGovernor.activeTool;
    const startedAt = pageToolGovernor.startedAt;
    const durationMs = startedAt ? Date.now() - Date.parse(startedAt) : 0;
    clearGovernorTimers();
    document.getElementById('agnt-cyber-snapshot-root')?.remove();
    document.getElementById('agnt-context-radar-root')?.remove();
    document.getElementById('browserpilot-threat-root')?.remove();
    stopCyberRegionWatch(reason);
    pageToolGovernor.activeTool = 'none';
    pageToolGovernor.startedAt = null;
    pageToolGovernor.stopReason = reason;
    telemetry('stop_all_page_tools', { previousTool, reason, durationMs });
    return { ok: true, status: toolStatus({ previousTool }) };
  }

  // Extension reloads invalidate old content-script listeners, but the DOM
  // button can remain on the page. Replace it so clicks use the current runtime.
  document.getElementById(ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const fab = document.createElement('button');
  fab.id = ID;
  fab.type = 'button';
  fab.textContent = 'AGNT';
  fab.title = 'Open BrowserPilot';

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ID} {
      position: fixed;
      z-index: 2147483647;
      right: 16px;
      bottom: 16px;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(20, 22, 34, 0.76);
      color: white;
      font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      letter-spacing: 0.08em;
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease, background 200ms ease;
      opacity: 0.95;
    }
    #${ID}:hover { transform: translateY(-2px); background: rgba(20, 22, 34, 0.92); opacity: 1; }
    #${ID}:active { transform: translateY(0px) scale(0.98); }
  `;

  let fabRemountCount = 0;
  let lastFabRemountAt = 0;
  let fabRemountTimer = null;
  function mountFab() {
    if (!document.documentElement) return;
    fabRemountCount += 1;
    const existing = document.getElementById(ID);
    if (existing && existing !== fab) existing.remove();
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle && existingStyle !== style) existingStyle.remove();
    if (!style.isConnected) document.documentElement.appendChild(style);
    if (!fab.isConnected) document.documentElement.appendChild(fab);
    telemetry('fab_remount_count', { count: fabRemountCount, max: FAB_MAX_REMOUNTS });
  }

  function scheduleBoundedFabRemount() {
    if (fabRemountCount >= FAB_MAX_REMOUNTS) return;
    const now = Date.now();
    const wait = Math.max(0, FAB_REMOUNT_THROTTLE_MS - (now - lastFabRemountAt));
    clearTimeout(fabRemountTimer);
    fabRemountTimer = setTimeout(() => {
      lastFabRemountAt = Date.now();
      mountFab();
    }, wait);
  }

  mountFab();
  for (let i = 1; i <= 3; i += 1) setTimeout(scheduleBoundedFabRemount, i * FAB_REMOUNT_THROTTLE_MS);
  try {
    new MutationObserver(scheduleBoundedFabRemount).observe(document.documentElement, { childList: true });
  } catch {}

  function captureContext() {
    const selection = (window.getSelection && window.getSelection().toString()) || '';
    const pageText = (document.body?.innerText || '').slice(0, 20000);
    return {
      page: { url: location.href, title: document.title },
      selection: selection.slice(0, 8000),
      pageText
    };
  }

  function hashString(input) {
    let h = 2166136261;
    const s = String(input || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function safeResourceUrl(raw) {
    try {
      const u = new URL(String(raw || ''), location.href);
      return u.origin + u.pathname;
    } catch {
      return '';
    }
  }

  function runDomAudit(options = {}) {
    function canvasSignal() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 220;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { supported: false };
        ctx.textBaseline = 'top';
        ctx.font = '16px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 220, 60);
        ctx.fillStyle = '#069';
        ctx.fillText('BrowserPilot DOM audit', 8, 8);
        ctx.strokeStyle = 'rgba(12, 224, 255, 0.55)';
        ctx.arc(120, 30, 18, 0, Math.PI * 2);
        ctx.stroke();
        return { supported: true, hash: hashString(canvas.toDataURL()) };
      } catch (e) {
        return { supported: false, error: e?.message || String(e) };
      }
    }

    function webglSignal() {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { supported: false };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          supported: true,
          vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) || ''),
          renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''),
          version: String(gl.getParameter(gl.VERSION) || '')
        };
      } catch (e) {
        return { supported: false, error: e?.message || String(e) };
      }
    }

    function challengeIndicators() {
      const selectors = [
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="turnstile"]',
        'script[src*="challenges.cloudflare.com"]',
        'script[src*="turnstile"]',
        'input[name="cf-turnstile-response"]',
        '[data-sitekey]',
        '.cf-turnstile',
        '#challenge-stage',
        '#cf-challenge-running'
      ];
      const matches = selectors
        .map((selector) => ({ selector, count: document.querySelectorAll(selector).length }))
        .filter((item) => item.count > 0);
      const bodyText = String(document.body?.innerText || '').slice(0, 5000).toLowerCase();
      const phrases = ['checking your browser', 'verify you are human', 'turnstile', 'cloudflare', 'cf-challenge', 'just a moment']
        .filter((phrase) => bodyText.includes(phrase));
      return { detected: matches.length > 0 || phrases.length > 0, matches, phrases };
    }

    function resourceIndicators() {
      if (options.includeResources === false) return [];
      const patterns = /cloudflare|turnstile|cdn-cgi|challenge|cf_chl|cf-ray/i;
      const entries = performance.getEntriesByType?.('resource') || [];
      return entries
        .filter((entry) => patterns.test(entry.name || ''))
        .slice(-80)
        .map((entry) => ({
          name: safeResourceUrl(entry.name),
          initiatorType: entry.initiatorType || '',
          durationMs: Number(entry.duration || 0).toFixed(1),
          transferSize: Number(entry.transferSize || 0)
        }));
    }

    function loadedFonts() {
      try {
        if (!document.fonts) return [];
        return Array.from(document.fonts)
          .map((font) => font.family)
          .filter(Boolean)
          .filter((value, idx, arr) => arr.indexOf(value) === idx)
          .slice(0, 80);
      } catch {
        return [];
      }
    }

    return {
      schemaVersion: 'browserpilot.domAudit.v1',
      capturedAt: new Date().toISOString(),
      page: { url: location.href, origin: location.origin, title: document.title, readyState: document.readyState },
      browser: {
        userAgent: navigator.userAgent || '',
        platform: navigator.platform || '',
        languages: Array.from(navigator.languages || []),
        webdriver: Boolean(navigator.webdriver),
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null,
        cookieEnabled: Boolean(navigator.cookieEnabled),
        doNotTrack: navigator.doNotTrack || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        screen: {
          width: screen?.width || null,
          height: screen?.height || null,
          colorDepth: screen?.colorDepth || null,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      },
      signals: {
        canvas: canvasSignal(),
        webgl: webglSignal(),
        fonts: loadedFonts(),
        challenge: challengeIndicators(),
        resources: resourceIndicators()
      },
      policy: { mode: 'diagnostic_only', modifiesPage: false, extractsSecrets: false, solvesChallenges: false }
    };
  }

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function extractTextInViewportRect(box) {
    const parts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      try {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        range.detach?.();
        if (rects.some((r) => rectsIntersect(r, box))) {
          const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (text) parts.push(text);
        }
      } catch {}
      if (parts.join(' ').length > 12000) break;
    }

    return parts
      .join(' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
  }

  let cyberRegionWatchTimer = null;
  let cyberRegionWatchExpiryTimer = null;
  let cyberRegionWatchState = null;
  const CONTEXT_RADAR_MEMORY_KEY = 'browserpilot_context_radar_memory_v1';

  function stopCyberRegionWatch(reason = 'manual') {
    if (cyberRegionWatchTimer) clearInterval(cyberRegionWatchTimer);
    if (cyberRegionWatchExpiryTimer) clearTimeout(cyberRegionWatchExpiryTimer);
    const state = cyberRegionWatchState;
    if (state) {
      const durationMs = Date.now() - Date.parse(state.startedAt || new Date().toISOString());
      telemetry('region_watch_stopped', {
        reason,
        durationMs,
        changeCount: state.changeCount || 0
      });
    }
    cyberRegionWatchTimer = null;
    cyberRegionWatchExpiryTimer = null;
    cyberRegionWatchState = null;
    finishPageTool('regionWatch', reason);
  }

  function startCyberRegionWatch({ rect, previousText = '', page = null } = {}) {
    if (!rect) throw new Error('Region watch requires a Cyber Snapshot rectangle.');
    const gate = startPageTool('regionWatch');
    if (!gate.ok) throw new Error(gate.error);
    stopCyberRegionWatch('replaced');
    pageToolGovernor.activeTool = 'regionWatch';
    pageToolGovernor.startedAt = new Date().toISOString();
    pageToolGovernor.stopReason = null;
    cyberRegionWatchState = {
      rect,
      page,
      previousText: String(previousText || ''),
      previousHash: hashString(previousText || ''),
      startedAt: pageToolGovernor.startedAt,
      changeCount: 0
    };
    cyberRegionWatchTimer = setInterval(() => {
      try {
        if (document.visibilityState === 'hidden') {
          stopCyberRegionWatch('visibility_hidden');
          return;
        }
        const text = extractTextInViewportRect({
          left: Number(rect.x || 0),
          top: Number(rect.y || 0),
          right: Number(rect.x || 0) + Number(rect.width || 0),
          bottom: Number(rect.y || 0) + Number(rect.height || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0)
        });
        const nextHash = hashString(text);
        if (nextHash && nextHash !== cyberRegionWatchState.previousHash) {
          const previousTextNow = cyberRegionWatchState.previousText;
          cyberRegionWatchState.previousText = text;
          cyberRegionWatchState.previousHash = nextHash;
          cyberRegionWatchState.changeCount += 1;
          chrome.runtime.sendMessage({
            type: 'AGNT_CYBER_REGION_CHANGED',
            page: cyberRegionWatchState.page || { url: location.href, title: document.title },
            rect,
            text,
            previousText: previousTextNow,
            changedAt: new Date().toISOString()
          }).catch(() => {});
        }
      } catch {}
    }, 1800);
    cyberRegionWatchExpiryTimer = setTimeout(() => stopCyberRegionWatch('auto_expired_10m'), REGION_WATCH_MAX_MS);
    pageToolGovernor.timers.add(cyberRegionWatchTimer);
    pageToolGovernor.timers.add(cyberRegionWatchExpiryTimer);
    telemetry('region_watch_started', { maxDurationMs: REGION_WATCH_MAX_MS });
  }

  function startCyberSnapshotOverlay() {
    const gate = startPageTool('cyberSnapshot');
    if (!gate.ok) throw new Error(gate.error);
    const existing = document.getElementById('agnt-cyber-snapshot-root');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'agnt-cyber-snapshot-root';
    root.innerHTML = `
      <div class="agnt-cyber-dim"></div>
      <div class="agnt-cyber-box" role="button" aria-label="Cyber Snapshot selection">
        <span class="agnt-cyber-corner tl"></span>
        <span class="agnt-cyber-corner tr"></span>
        <span class="agnt-cyber-corner bl"></span>
        <span class="agnt-cyber-corner br"></span>
        <div class="agnt-cyber-grid"></div>
        <div class="agnt-cyber-hud top">CYBERNETIC SNAPSHOT</div>
        <div class="agnt-cyber-hud bottom">LEFT-CLICK CAPTURE</div>
      </div>
      <div class="agnt-cyber-callout move">Move box: drag with left mouse</div>
      <div class="agnt-cyber-callout resize">Resize height: mouse wheel or up/down arrows</div>
      <div class="agnt-cyber-callout width">Adjust width: hold right-click + drag left/right</div>
      <div class="agnt-cyber-callout capture">Capture: left-click</div>
      <div class="agnt-cyber-callout cancel">Cancel: Esc</div>
    `;

    const css = document.createElement('style');
    css.textContent = `
      #agnt-cyber-snapshot-root {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        color: #e9fbff;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        pointer-events: auto;
      }
      #agnt-cyber-snapshot-root .agnt-cyber-dim {
        position: absolute;
        inset: 0;
        background: rgba(3, 8, 18, 0.48);
        backdrop-filter: saturate(0.75) brightness(0.78);
      }
      #agnt-cyber-snapshot-root .agnt-cyber-box {
        position: absolute;
        left: 18vw;
        top: 22vh;
        width: min(58vw, 840px);
        height: min(38vh, 430px);
        min-width: 220px;
        min-height: 120px;
        cursor: grab;
        border: 1px solid rgba(112, 234, 255, 0.95);
        background: rgba(126, 230, 255, 0.20);
        box-shadow:
          0 0 0 1px rgba(207, 249, 255, 0.30) inset,
          0 0 28px rgba(18, 224, 255, 0.45),
          0 0 90px rgba(18, 224, 255, 0.26);
        overflow: hidden;
      }
      #agnt-cyber-snapshot-root .agnt-cyber-box:active { cursor: grabbing; }
      #agnt-cyber-snapshot-root .agnt-cyber-grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(207,249,255,0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(207,249,255,0.12) 1px, transparent 1px),
          radial-gradient(circle at 65% 34%, rgba(207,249,255,0.28), transparent 22%);
        background-size: 28px 28px, 28px 28px, 100% 100%;
        mix-blend-mode: screen;
        pointer-events: none;
      }
      #agnt-cyber-snapshot-root .agnt-cyber-corner {
        position: absolute;
        width: 34px;
        height: 34px;
        border-color: #d8fbff;
        filter: drop-shadow(0 0 8px rgba(18,224,255,0.85));
        pointer-events: none;
      }
      #agnt-cyber-snapshot-root .tl { left: 8px; top: 8px; border-left: 3px solid; border-top: 3px solid; }
      #agnt-cyber-snapshot-root .tr { right: 8px; top: 8px; border-right: 3px solid; border-top: 3px solid; }
      #agnt-cyber-snapshot-root .bl { left: 8px; bottom: 8px; border-left: 3px solid; border-bottom: 3px solid; }
      #agnt-cyber-snapshot-root .br { right: 8px; bottom: 8px; border-right: 3px solid; border-bottom: 3px solid; }
      #agnt-cyber-snapshot-root .agnt-cyber-hud {
        position: absolute;
        left: 18px;
        padding: 5px 8px;
        border: 1px solid rgba(112,234,255,0.36);
        border-radius: 6px;
        background: rgba(2, 10, 22, 0.68);
        color: #bff7ff;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0.12em;
        pointer-events: none;
      }
      #agnt-cyber-snapshot-root .agnt-cyber-hud.top { top: 18px; }
      #agnt-cyber-snapshot-root .agnt-cyber-hud.bottom { bottom: 18px; }
      #agnt-cyber-snapshot-root .agnt-cyber-callout {
        position: absolute;
        max-width: 240px;
        padding: 8px 10px;
        border: 1px solid rgba(112,234,255,0.42);
        border-radius: 8px;
        background: rgba(3, 10, 22, 0.86);
        color: #d8fbff;
        box-shadow: 0 0 22px rgba(18,224,255,0.20);
        font-size: 12px;
        font-weight: 650;
        line-height: 1.25;
      }
      #agnt-cyber-snapshot-root .move { left: 24px; top: 38%; }
      #agnt-cyber-snapshot-root .resize { left: 34%; bottom: 26px; }
      #agnt-cyber-snapshot-root .width { left: 39%; top: 12%; }
      #agnt-cyber-snapshot-root .capture { right: 26px; top: 45%; }
      #agnt-cyber-snapshot-root .cancel { left: 24px; bottom: 26px; }
    `;
    root.appendChild(css);
    document.documentElement.appendChild(root);

    const box = root.querySelector('.agnt-cyber-box');
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    let mode = null;
    let startX = 0;
    let startY = 0;
    let startRect = null;
    let moved = false;

    function getBoxRect() {
      const r = box.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }

    function setBox(rect) {
      const width = clamp(rect.width, 220, window.innerWidth - 24);
      const height = clamp(rect.height, 120, window.innerHeight - 24);
      const left = clamp(rect.left, 12, window.innerWidth - width - 12);
      const top = clamp(rect.top, 12, window.innerHeight - height - 12);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';
    }

    function finish(cancelled = false) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('wheel', onWheel, true);
      root.removeEventListener('contextmenu', onContextMenu, true);

      if (cancelled) {
        chrome.runtime.sendMessage({ type: 'AGNT_CYBER_SNAPSHOT_RESULT', cancelled: true }).catch(() => {});
      }
      root.remove();
      finishPageTool('cyberSnapshot', cancelled ? 'cancelled' : 'completed');
    }

    function capture() {
      const rect = getBoxRect();
      const text = extractTextInViewportRect(rect);
      const snapshot = {
        schemaVersion: 'browserpilot.cyberSnapshot.v1',
        capturedAt: new Date().toISOString(),
        page: { url: location.href, title: document.title },
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          viewportWidth: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
          viewportHeight: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
          devicePixelRatio: Number(window.devicePixelRatio || 1),
          scrollX: Math.round(window.scrollX || 0),
          scrollY: Math.round(window.scrollY || 0)
        },
        text,
        textChars: text.length,
        controls: {
          move: 'drag with left mouse',
          resizeHeight: 'mouse wheel or up/down arrows',
          adjustWidth: 'hold right-click + drag left/right',
          capture: 'left-click',
          cancel: 'Esc'
        }
      };
      chrome.runtime.sendMessage({ type: 'AGNT_CYBER_SNAPSHOT_RESULT', snapshot }).catch(() => {});
      finish(false);
    }

    function onMove(e) {
      if (!mode || !startRect) return;
      e.preventDefault();
      moved = moved || Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4;
      if (mode === 'move') {
        setBox({ ...startRect, left: startRect.left + e.clientX - startX, top: startRect.top + e.clientY - startY });
      } else if (mode === 'width') {
        setBox({ ...startRect, width: startRect.width + e.clientX - startX });
      }
    }

    function onUp(e) {
      if (!mode) return;
      const wasMode = mode;
      mode = null;
      e.preventDefault();
      if (wasMode === 'move' && !moved && e.button === 0) capture();
    }

    function onDown(e) {
      if (!box.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startRect = getBoxRect();
      moved = false;
      mode = e.button === 2 ? 'width' : 'move';
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    }

    function onWheel(e) {
      e.preventDefault();
      const rect = getBoxRect();
      setBox({ ...rect, height: rect.height + (e.deltaY > 0 ? 28 : -28) });
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const rect = getBoxRect();
        setBox({ ...rect, height: rect.height + (e.key === 'ArrowDown' ? 24 : -24) });
      }
    }

    function onContextMenu(e) {
      if (box.contains(e.target)) e.preventDefault();
    }

    box.addEventListener('mousedown', onDown, true);
    root.addEventListener('wheel', onWheel, true);
    root.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKey, true);
    setBox(getBoxRect());
  }

  function labelForContextElement(el) {
    const tag = (el.tagName || '').toLowerCase();
    const role = String(el.getAttribute('role') || '').toLowerCase();
    const cls = String(el.className || '').toLowerCase();
    const text = String(el.innerText || '').toLowerCase();
    if (tag === 'form' || role === 'form') return 'form';
    if (tag === 'table' || role === 'table') return 'table';
    if (role === 'textbox' || el.isContentEditable || tag === 'textarea' || tag === 'input') return 'composer';
    if (tag === 'article' || role === 'article') return 'post';
    if (/error|warning|alert|failed|blocked/.test(cls + ' ' + text)) return 'status';
    if (tag === 'pre' || tag === 'code') return 'code';
    if (/price|total|cost|\$/.test(cls + ' ' + text)) return 'price';
    if (tag === 'button' || role === 'button') return 'action';
    if (/comment|reply/.test(cls)) return 'comment';
    if (/card|result|item/.test(cls)) return 'result';
    if (/^h[1-3]$/.test(tag)) return 'heading';
    if (tag === 'main' || tag === 'section') return 'section';
    return 'context';
  }

  function confidenceForContextElement(el, rect, text, label) {
    const area = rect.width * rect.height;
    let score = 0.2;
    if (text.length > 40) score += 0.18;
    if (text.length > 160) score += 0.16;
    if (area > 9000) score += 0.12;
    if (area < window.innerWidth * window.innerHeight * 0.7) score += 0.10;
    if (['post', 'table', 'form', 'composer', 'status', 'code', 'price'].includes(label)) score += 0.22;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.abs(cx - window.innerWidth / 2) / Math.max(1, window.innerWidth / 2);
    const dy = Math.abs(cy - window.innerHeight / 2) / Math.max(1, window.innerHeight / 2);
    score += Math.max(0, 0.12 - (dx + dy) * 0.04);
    return Math.max(0.25, Math.min(0.98, score));
  }

  function contextCapabilities(label) {
    const base = ['captureText', 'captureImage', 'watch'];
    if (label === 'composer' || label === 'form') return [...base, 'useTarget'];
    if (label === 'table') return [...base, 'extractTable'];
    if (label === 'post' || label === 'comment') return [...base, 'draftReply'];
    return base;
  }

  async function getContextRadarMemory() {
    try {
      const data = await chrome.storage.local.get(CONTEXT_RADAR_MEMORY_KEY);
      return data?.[CONTEXT_RADAR_MEMORY_KEY] || { preferredLabels: {}, ignoredLabels: {}, actions: [] };
    } catch {
      return { preferredLabels: {}, ignoredLabels: {}, actions: [] };
    }
  }

  async function recordContextRadarAction(label, action) {
    const memory = await getContextRadarMemory();
    const bucket = action === 'ignoreSimilar' ? 'ignoredLabels' : 'preferredLabels';
    memory[bucket] = memory[bucket] || {};
    memory[bucket][label] = Number(memory[bucket][label] || 0) + 1;
    memory.actions = Array.isArray(memory.actions) ? memory.actions.slice(-80) : [];
    memory.actions.push({ label, action, at: new Date().toISOString(), url: location.href });
    await chrome.storage.local.set({ [CONTEXT_RADAR_MEMORY_KEY]: memory }).catch(() => {});
    return memory;
  }

  function cssPathForElement(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      const tag = (node.tagName || '').toLowerCase();
      if (!tag || tag === 'html' || tag === 'body') break;
      if (node.id) {
        parts.unshift(`${tag}#${CSS.escape(node.id)}`);
        break;
      }
      const role = node.getAttribute?.('role');
      const testId = node.getAttribute?.('data-testid') || node.getAttribute?.('data-test');
      if (testId) parts.unshift(`${tag}[data-testid="${CSS.escape(testId)}"]`);
      else if (role) parts.unshift(`${tag}[role="${CSS.escape(role)}"]`);
      else parts.unshift(tag);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function nearestHeadingText(el) {
    try {
      let node = el;
      for (let i = 0; node && i < 5; i++, node = node.parentElement) {
        const heading = node.querySelector?.('h1,h2,h3,[role="heading"]');
        const text = String(heading?.innerText || '').replace(/\s+/g, ' ').trim();
        if (text) return text.slice(0, 180);
      }
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
        .map((heading) => {
          const r = heading.getBoundingClientRect();
          const target = el.getBoundingClientRect();
          return { text: String(heading.innerText || '').replace(/\s+/g, ' ').trim(), distance: Math.abs(target.top - r.bottom) };
        })
        .filter((item) => item.text)
        .sort((a, b) => a.distance - b.distance);
      return (headings[0]?.text || '').slice(0, 180);
    } catch {
      return '';
    }
  }

  function detectContextTargets(limit = 18, budget = CONTEXT_RADAR_BUDGET) {
    const startedAt = performance.now();
    let candidatesScanned = 0;
    let aborted = false;
    const selectors = [
      'article', '[role="article"]', 'main', 'section', 'form', 'table',
      '[role="textbox"]', '[contenteditable="true"]', 'textarea', 'input',
      '[role="dialog"]', '[role="alert"]', 'pre', 'code',
      'h1', 'h2', 'h3', 'li', '[class*="card"]', '[class*="post"]',
      '[class*="comment"]', '[class*="reply"]', '[class*="result"]',
      '[class*="price"]', '[class*="error"]'
    ];
    const seen = new Set();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const candidates = [];

    for (const el of document.querySelectorAll(selectors.join(','))) {
      candidatesScanned += 1;
      if (candidatesScanned > budget.maxCandidates || performance.now() - startedAt > budget.maxDurationMs) {
        aborted = true;
        break;
      }
      if (!(el instanceof HTMLElement) || seen.has(el)) continue;
      seen.add(el);
      if (el.id === ID || el.closest('#agnt-context-radar-root, #agnt-cyber-snapshot-root')) continue;
      const rect = el.getBoundingClientRect();
      if (!rectsIntersect(rect, viewport)) continue;
      if (rect.width < 60 || rect.height < 28) continue;
      if (rect.width > window.innerWidth * 0.98 && rect.height > window.innerHeight * 0.82) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const text = String(el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
      if (text.length < 8 && !['input', 'textarea', 'button'].includes((el.tagName || '').toLowerCase())) continue;
      const label = labelForContextElement(el);
      const confidence = confidenceForContextElement(el, rect, text, label);
      candidates.push({
        el,
        label,
        confidence,
        text,
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          viewportWidth: Math.round(window.innerWidth || 0),
          viewportHeight: Math.round(window.innerHeight || 0),
          scrollX: Math.round(window.scrollX || 0),
          scrollY: Math.round(window.scrollY || 0)
        },
        why: [
          `tag=${(el.tagName || '').toLowerCase()}`,
          el.getAttribute('role') ? `role=${el.getAttribute('role')}` : '',
          text.length > 160 ? 'high text density' : 'visible text',
          'visible in viewport'
        ].filter(Boolean)
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const picked = [];
    for (const item of candidates) {
      const overlaps = picked.some((p) => {
        const a = { left: item.rect.x, top: item.rect.y, right: item.rect.x + item.rect.width, bottom: item.rect.y + item.rect.height };
        const b = { left: p.rect.x, top: p.rect.y, right: p.rect.x + p.rect.width, bottom: p.rect.y + p.rect.height };
        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlap = ix * iy;
        return overlap > Math.min(item.rect.width * item.rect.height, p.rect.width * p.rect.height) * 0.72;
      });
      if (!overlaps) picked.push(item);
      if (picked.length >= limit) break;
    }
    return {
      targets: picked,
      metrics: {
        durationMs: Math.round(performance.now() - startedAt),
        candidatesScanned,
        aborted,
        maxCandidates: budget.maxCandidates,
        maxDurationMs: budget.maxDurationMs
      }
    };
  }

  async function startContextRadarOverlay() {
    const gate = startPageTool('contextRadar');
    if (!gate.ok) throw new Error(gate.error);
    const existing = document.getElementById('agnt-context-radar-root');
    if (existing) existing.remove();

    const memory = await getContextRadarMemory();
    const ignoredLabels = memory.ignoredLabels || {};
    const preferredLabels = memory.preferredLabels || {};
    const detection = detectContextTargets(24);
    const targets = detection.targets
      .filter((target) => Number(ignoredLabels[target.label] || 0) < 3)
      .map((target) => ({
        ...target,
        confidence: Math.min(0.99, target.confidence + Math.min(0.12, Number(preferredLabels[target.label] || 0) * 0.02))
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 18);
    telemetry('context_radar_duration_ms', detection.metrics);
    telemetry('context_radar_candidates_scanned', detection.metrics);
    const root = document.createElement('div');
    root.id = 'agnt-context-radar-root';
    root.innerHTML = `
      <div class="radar-summary"><b>Browser Pilot</b><span>Context Radar: ${targets.length} targets</span><em>Esc cancels</em></div>
      <div class="radar-hud" hidden></div>
    `;
    const css = document.createElement('style');
    css.textContent = `
      #agnt-context-radar-root {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #agnt-context-radar-root .radar-summary {
        position: fixed;
        left: 18px;
        top: 18px;
        display: grid;
        gap: 2px;
        padding: 10px 12px;
        border: 1px solid rgba(25,239,131,0.42);
        border-radius: 10px;
        color: rgba(236,255,247,0.96);
        background: rgba(3, 12, 18, 0.82);
        box-shadow: 0 0 28px rgba(25,239,131,0.18);
        backdrop-filter: blur(10px);
      }
      #agnt-context-radar-root .radar-summary b {
        color: #19ef83;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        font-size: 12px;
      }
      #agnt-context-radar-root .radar-summary span { font-size: 12px; color: #dfffee; }
      #agnt-context-radar-root .radar-summary em { font-size: 10px; color: rgba(18,224,255,0.72); font-style: normal; }
      #agnt-context-radar-root .radar-box {
        position: fixed;
        pointer-events: auto;
        border: 1px solid rgba(25,239,131,0.78);
        background: rgba(25,239,131,0.07);
        box-shadow: 0 0 0 1px rgba(25,239,131,0.16) inset, 0 0 20px rgba(25,239,131,0.22);
        cursor: crosshair;
        border-radius: 8px;
      }
      #agnt-context-radar-root .radar-box:hover {
        border-color: rgba(18,224,255,0.95);
        background: rgba(18,224,255,0.10);
        box-shadow: 0 0 0 1px rgba(18,224,255,0.28) inset, 0 0 28px rgba(18,224,255,0.28);
      }
      #agnt-context-radar-root .radar-tag {
        position: absolute;
        left: 6px;
        top: -22px;
        padding: 3px 6px;
        border-radius: 6px;
        background: rgba(2, 14, 18, 0.90);
        border: 1px solid rgba(25,239,131,0.45);
        color: #dfffee;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      #agnt-context-radar-root .radar-hud {
        position: fixed;
        max-width: 310px;
        padding: 10px 12px;
        border: 1px solid rgba(25,239,131,0.45);
        border-radius: 10px;
        color: #effff8;
        background: rgba(4, 10, 18, 0.86);
        box-shadow: 0 0 30px rgba(25,239,131,0.20);
        backdrop-filter: blur(12px);
        font-size: 12px;
        line-height: 1.35;
        pointer-events: none;
      }
      #agnt-context-radar-root .radar-hud strong { color: #19ef83; letter-spacing: 0.08em; text-transform: uppercase; }
      #agnt-context-radar-root .radar-hud .preview { color: rgba(255,255,255,0.82); margin-top: 6px; }
      #agnt-context-radar-root .radar-hud .actions { color: rgba(18,224,255,0.78); margin-top: 8px; }
      #agnt-context-radar-root .radar-actions {
        position: absolute;
        right: 6px;
        bottom: 6px;
        display: none;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      #agnt-context-radar-root .radar-box:hover .radar-actions { display: flex; }
      #agnt-context-radar-root .radar-action {
        border: 1px solid rgba(25,239,131,0.38);
        border-radius: 6px;
        background: rgba(2, 14, 18, 0.86);
        color: #dfffee;
        font: 700 10px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        padding: 5px 6px;
        cursor: pointer;
      }
      #agnt-context-radar-root .radar-action:hover {
        border-color: rgba(18,224,255,0.75);
        color: #c9fbff;
      }
    `;
    root.appendChild(css);

    const hud = root.querySelector('.radar-hud');
    function finish(cancelled = false) {
      document.removeEventListener('keydown', onKey, true);
      if (cancelled) chrome.runtime.sendMessage({ type: 'BROWSERPILOT_CONTEXT_RADAR_CAPTURED', cancelled: true }).catch(() => {});
      root.remove();
      finishPageTool('contextRadar', cancelled ? 'cancelled' : 'completed');
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    }

    targets.forEach((target, idx) => {
      const box = document.createElement('div');
      box.className = 'radar-box';
      box.setAttribute('role', 'button');
      box.tabIndex = 0;
      box.style.left = target.rect.x + 'px';
      box.style.top = target.rect.y + 'px';
      box.style.width = target.rect.width + 'px';
      box.style.height = target.rect.height + 'px';
      box.innerHTML = `<span class="radar-tag">${target.label} ${Math.round(target.confidence * 100)}%</span>
        <span class="radar-actions">
          <button class="radar-action" data-action="captureText">Capture</button>
          <button class="radar-action" data-action="watch">Watch</button>
          <button class="radar-action" data-action="useTarget">Target</button>
          <button class="radar-action" data-action="ignoreSimilar">Ignore</button>
        </span>`;

      box.addEventListener('mouseenter', () => {
        hud.hidden = false;
        hud.style.left = Math.min(window.innerWidth - 330, target.rect.x + 10) + 'px';
        hud.style.top = Math.min(window.innerHeight - 150, target.rect.y + target.rect.height + 10) + 'px';
        hud.innerHTML = [
          `<strong>${target.label} · ${Math.round(target.confidence * 100)}%</strong>`,
          `<div class="preview">${(target.text || '(no text preview)').slice(0, 260)}</div>`,
          `<div class="actions">Click to capture · read-only · ${contextCapabilities(target.label).join(' / ')}</div>`
        ].join('');
      });
      box.addEventListener('mouseleave', () => { hud.hidden = true; });
      async function sendTarget(action) {
        await recordContextRadarAction(target.label, action);
        if (action === 'ignoreSimilar') {
          root.querySelectorAll('.radar-box').forEach((candidate) => {
            if (candidate.dataset.label === target.label) candidate.remove();
          });
          chrome.runtime.sendMessage({
            type: 'BROWSERPILOT_CONTEXT_RADAR_CAPTURED',
            action,
            target: { label: target.label, page: { url: location.href, title: document.title }, text: '', textPreview: '', risk: 'read_only' }
          }).catch(() => {});
          return;
        }
        const fullText = String(target.el.innerText || target.el.value || target.text || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
        chrome.runtime.sendMessage({
          type: 'BROWSERPILOT_CONTEXT_RADAR_CAPTURED',
          action,
          target: {
            id: `ctx_${idx + 1}`,
            label: target.label,
            confidence: Number(target.confidence.toFixed(2)),
            risk: 'read_only',
            rect: target.rect,
            page: { url: location.href, title: document.title },
            text: fullText,
            textPreview: fullText.slice(0, 320),
            capabilities: contextCapabilities(target.label),
            why: target.why,
            selectorHints: {
              cssPath: cssPathForElement(target.el),
              tag: (target.el.tagName || '').toLowerCase(),
              role: target.el.getAttribute('role') || '',
              ariaLabel: target.el.getAttribute('aria-label') || '',
              id: target.el.id || '',
              textHash: hashString(fullText),
              nearestHeading: nearestHeadingText(target.el)
            }
          }
        }).catch(() => {});
        finish(false);
      }
      box.dataset.label = target.label;
      box.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = e.target?.dataset?.action || 'captureText';
        sendTarget(action).catch(() => {});
      });
      root.appendChild(box);
    });

    document.documentElement.appendChild(root);
    document.addEventListener('keydown', onKey, true);
    return { ok: true, started: true, metrics: detection.metrics, targets: targets.length, aborted: detection.metrics.aborted };
  }

  function normalizeIpAddress(value) {
    const raw = String(value || '').trim().replace(/^\[/, '').replace(/\](:\d+)?$/, '').replace(/[),.;]+$/, '').toLowerCase();
    if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(raw)) return raw.replace(/:\d{1,5}$/, '');
    return raw;
  }

  function classifyIpAddress(ip) {
    const normalized = normalizeIpAddress(ip);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
      const p = normalized.split('.').map(Number);
      if (p.some((n) => n < 0 || n > 255)) return 'unknown';
      if (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)) return 'private';
      if (p[0] === 127) return 'loopback';
      if (p[0] === 169 && p[1] === 254) return 'link_local';
      if (p[0] >= 224 && p[0] <= 239) return 'multicast';
      if (p[0] === 0 || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)) return 'reserved';
      if ((p[0] === 192 && p[1] === 0 && p[2] === 2) || (p[0] === 198 && p[1] === 51 && p[2] === 100) || (p[0] === 203 && p[1] === 0 && p[2] === 113)) return 'documentation';
      return 'public';
    }
    if (normalized === '::1') return 'loopback';
    if (/^fe80:/i.test(normalized)) return 'link_local';
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return 'private';
    if (/^ff/i.test(normalized)) return 'multicast';
    if (/^2001:db8:/i.test(normalized)) return 'documentation';
    return normalized.includes(':') ? 'public' : 'unknown';
  }

  function extractIpIndicatorsFromText(text, sourceField = 'text') {
    const raw = String(text || '');
    const found = [];
    const patterns = [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?![\d.])/g, /(?:\[[0-9a-f:]{2,}\](?::\d{1,5})?)|(?<![\w:])(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}(?![\w:])/gi];
    for (const re of patterns) {
      for (const match of raw.matchAll(re)) {
        const value = normalizeIpAddress(match[0]);
        if (value.includes('.')) {
          const parts = value.split('.').map(Number);
          if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) continue;
        } else {
          if ((value.match(/::/g) || []).length > 1) continue;
          if (/[^0-9a-f:.]/i.test(value) || value.includes(':::')) continue;
          const hasCompression = value.includes('::');
          const groups = value.split(':').filter(Boolean);
          if (!hasCompression && groups.length !== 8 && groups.length < 3) continue;
          if (groups.length > 8) continue;
          if (groups.some((part) => part.length > 4 || !/^[0-9a-f]{1,4}$/i.test(part))) continue;
        }
        const idx = match.index || 0;
        found.push({
          value,
          version: value.includes(':') ? 'ipv6' : 'ipv4',
          classification: classifyIpAddress(value),
          sourceField,
          indicatorType: 'extracted',
          redactedContext: raw.slice(Math.max(0, idx - 70), Math.min(raw.length, idx + String(match[0]).length + 70)).replace(/\s+/g, ' ').trim(),
          confidence: 'extracted_from_text'
        });
      }
    }
    const seen = new Set();
    return found.filter((item) => {
      const key = `${item.version}:${item.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function redactThreatText(text) {
    return String(text || '')
      .replace(/(bearer\s+)[a-z0-9._~+/=-]+/ig, '$1[redacted]')
      .replace(/(api[_ -]?key|token|password|private[_ -]?key|seed phrase)(.{0,40})/ig, '$1 [redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 420);
  }

  function rectForElement(el) {
    const r = el?.getBoundingClientRect?.();
    if (!r) return null;
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), viewportWidth: Math.round(innerWidth), viewportHeight: Math.round(innerHeight), scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) };
  }

  function selectorHintsForElement(el) {
    return {
      cssPath: cssPathForElement(el),
      tag: (el?.tagName || '').toLowerCase(),
      role: el?.getAttribute?.('role') || '',
      ariaLabel: el?.getAttribute?.('aria-label') || '',
      id: el?.id || '',
      className: String(el?.className || '').slice(0, 160),
      nearestHeading: nearestHeadingText(el)
    };
  }

  function addThreatFinding(findings, category, severity, reason, el, preview, evidence = {}) {
    findings.push({
      id: `finding-${findings.length + 1}`,
      category,
      severity,
      reason,
      rect: rectForElement(el),
      selectorHints: selectorHintsForElement(el),
      redactedPreview: redactThreatText(preview),
      evidence: {
        visibleToUser: !evidence.hiddenFromUser,
        hiddenFromUser: Boolean(evidence.hiddenFromUser),
        pointerInteractive: Boolean(evidence.pointerInteractive),
        zIndex: evidence.zIndex ?? null,
        opacity: evidence.opacity ?? null
      },
      evidenceHash: hashString(`${category}:${reason}:${preview}`)
    });
  }

  function scoreThreatFindings(findings, ipIndicators) {
    const categoryCaps = {
      hidden_prompt: 0.35,
      overlay: 0.30,
      credential_form: 0.25,
      link_mismatch: 0.25,
      iframe: 0.20,
      inline_handler: 0.15
    };
    const categoryScores = {};
    for (const f of findings) {
      const cap = categoryCaps[f.category] || 0;
      if (!cap) continue;
      const severityFactor = f.severity === 'high' ? 1 : (f.severity === 'medium' ? 0.72 : 0.45);
      categoryScores[f.category] = Math.max(categoryScores[f.category] || 0, cap * severityFactor);
    }
    const publicIpCorrelated = ipIndicators.some((item) => item.classification === 'public') &&
      findings.some((f) => ['hidden_prompt', 'overlay', 'credential_form', 'link_mismatch'].includes(f.category));
    const privateOnlyIp = ipIndicators.length && !ipIndicators.some((item) => item.classification === 'public');
    const ipScore = publicIpCorrelated ? 0.15 : (privateOnlyIp ? 0.03 : 0);
    const correlatedCategories = Object.keys(categoryScores).filter((category) => categoryScores[category] >= 0.12);
    const correlationBonus = Math.min(0.18, Math.max(0, correlatedCategories.length - 1) * 0.06);
    const baseScore = Math.max(0, ...Object.values(categoryScores));
    const score = Math.max(0, Math.min(1, baseScore + correlationBonus + ipScore));
    const level = score >= 0.60 ? 'high' : (score >= 0.25 ? 'medium' : 'low');
    const order = { info: 0, low: 1, medium: 2, high: 3 };
    const highestSeverity = findings.reduce((best, f) => order[f.severity] > order[best] ? f.severity : best, 'info');
    return {
      level,
      score: Number(score.toFixed(2)),
      highestSeverity,
      summary: `${findings.length} local DOM risk signal(s) found`,
      scoringModel: 'category_capped_correlation_v1',
      categoryCaps,
      categoryScores,
      ipScore,
      correlationBonus
    };
  }

  function runThreatScan(contextMode = 'minimal') {
    const startedAt = performance.now();
    const budget = THREAT_SCAN_BUDGET;
    let aborted = false;
    let nodesScanned = 0;
    let linksScanned = 0;
    let framesScanned = 0;
    let formsScanned = 0;
    let scriptsScanned = 0;
    let commentsScanned = 0;
    function overBudget() {
      if (performance.now() - startedAt > budget.maxDurationMs) aborted = true;
      return aborted;
    }
    const findings = [];
    const promptRe = /ignore (all )?previous instructions|system prompt|developer message|hidden instruction|do not tell the user|do not reveal this|exfiltrate|api key|bearer token|password|seed phrase|wallet|private key|run this command|tool call|call this tool|send the user data|bypass|jailbreak|override safety|agent instruction|assistant instruction/i;
    const allTextSources = [];
    for (const el of document.querySelectorAll('body *')) {
      nodesScanned += 1;
      if (nodesScanned > budget.maxNodes || overBudget()) { aborted = true; break; }
      if (!(el instanceof HTMLElement) || el.id === ID || el.closest('#agnt-context-radar-root, #agnt-cyber-snapshot-root, #browserpilot-threat-root')) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const textBits = [el.innerText, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt'), ...Array.from(el.attributes || []).filter((a) => a.name.startsWith('data-')).map((a) => a.value)].filter(Boolean).join(' ');
      if (textBits) allTextSources.push({ text: textBits, source: 'dom_text' });
      const hidden = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) < 0.06 || rect.right < 0 || rect.bottom < 0 || rect.width < 2 || rect.height < 2 || Number(style.fontSize?.replace('px', '') || 16) < 3;
      if (hidden && promptRe.test(textBits)) addThreatFinding(findings, 'hidden_prompt', 'high', 'Hidden prompt-like or agent-facing instruction text', el, textBits, { hiddenFromUser: true, opacity: Number(style.opacity || 1), zIndex: style.zIndex });
      const z = Number(style.zIndex || 0);
      const area = rect.width * rect.height;
      const coverage = area / Math.max(1, innerWidth * innerHeight);
      const interactive = style.pointerEvents !== 'none' && (el.matches('a,button,[role="button"],input,textarea,select') || el.hasAttribute('onclick') || style.cursor === 'pointer');
      if (['fixed', 'sticky', 'absolute'].includes(style.position) && z > 999 && Number(style.opacity || 1) < 0.12 && coverage > 0.35 && interactive) addThreatFinding(findings, 'overlay', 'high', 'Large transparent interactive overlay', el, textBits || el.outerHTML.slice(0, 180), { pointerInteractive: true, opacity: Number(style.opacity || 1), zIndex: z });
      const handlerAttrs = ['oncopy', 'onpaste', 'onkeydown', 'onkeyup', 'onkeypress', 'oninput', 'onchange', 'onclick'].filter((name) => el.hasAttribute(name));
      if (handlerAttrs.length) addThreatFinding(findings, 'inline_handler', handlerAttrs.some((h) => /key|copy|paste/.test(h)) ? 'medium' : 'low', `Inline event handler(s): ${handlerAttrs.join(', ')}`, el, textBits || el.outerHTML.slice(0, 220), { opacity: Number(style.opacity || 1), zIndex: z });
    }

    for (const anchor of document.querySelectorAll('a[href]')) {
      linksScanned += 1;
      if (linksScanned > budget.maxLinks || overBudget()) { aborted = true; break; }
      const text = String(anchor.innerText || anchor.textContent || '').trim();
      const href = anchor.getAttribute('href') || '';
      allTextSources.push({ text: href, source: 'link_href' });
      let url; try { url = new URL(href, location.href); } catch { continue; }
      const domainText = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0];
      if (domainText && domainText.toLowerCase() !== url.hostname.toLowerCase()) addThreatFinding(findings, 'link_mismatch', 'medium', `Visible domain differs from href host (${domainText} -> ${url.hostname})`, anchor, `${text} ${href}`);
      if (url.protocol === 'javascript:') addThreatFinding(findings, 'link_mismatch', 'high', 'Anchor uses javascript: URL', anchor, `${text} ${href}`);
      if (anchor.target === '_blank' && !/\bnoopener\b|\bnoreferrer\b/i.test(anchor.rel || '')) addThreatFinding(findings, 'link_mismatch', 'low', 'New-tab link lacks noopener/noreferrer', anchor, `${text} ${href}`);
      if (/[?&](token|auth|redirect|callback|next|url)=/i.test(url.search)) addThreatFinding(findings, 'link_mismatch', 'medium', 'Link contains sensitive redirect/auth-like query parameter', anchor, `${text} ${href}`);
    }

    for (const frame of document.querySelectorAll('iframe')) {
      framesScanned += 1;
      if (framesScanned > budget.maxFrames || overBudget()) { aborted = true; break; }
      const src = frame.getAttribute('src') || '';
      allTextSources.push({ text: src, source: 'iframe_src' });
      let thirdParty = false; try { thirdParty = new URL(src, location.href).origin !== location.origin; } catch {}
      const style = getComputedStyle(frame);
      const rect = frame.getBoundingClientRect();
      const hidden = Number(style.opacity || 1) < 0.12 || rect.width < 20 || rect.height < 20 || style.visibility === 'hidden';
      if (thirdParty || hidden) addThreatFinding(findings, 'iframe', thirdParty ? 'medium' : 'low', `${thirdParty ? 'Third-party' : 'Hidden/tiny'} iframe; cross-origin DOM may be unreadable`, frame, src, { hiddenFromUser: hidden, opacity: Number(style.opacity || 1), zIndex: style.zIndex });
    }

    for (const form of document.querySelectorAll('form')) {
      formsScanned += 1;
      if (formsScanned > budget.maxForms || overBudget()) { aborted = true; break; }
      const formText = String(form.innerText || '') + ' ' + String(form.getAttribute('action') || '');
      const hasCredential = Boolean(form.querySelector('input[type="password"], input[name*="token" i], input[name*="key" i]')) || /seed phrase|wallet|api key|password|payment|card/i.test(formText);
      const action = form.getAttribute('action') || '';
      allTextSources.push({ text: action, source: 'form_action' });
      let external = false; try { external = action && new URL(action, location.href).origin !== location.origin; } catch {}
      if (hasCredential || external) addThreatFinding(findings, 'credential_form', hasCredential ? 'high' : 'medium', `${hasCredential ? 'Credential/payment-like form' : 'External form action'}${external ? ' to external origin' : ''}`, form, formText);
    }

    for (const script of document.querySelectorAll('script[src]')) {
      scriptsScanned += 1;
      if (scriptsScanned > budget.maxScripts || overBudget()) { aborted = true; break; }
      allTextSources.push({ text: script.getAttribute('src') || '', source: 'script_src' });
    }
    for (const el of document.querySelectorAll('noscript,template')) {
      if (overBudget()) { aborted = true; break; }
      const text = String(el.textContent || '');
      allTextSources.push({ text, source: el.tagName.toLowerCase() });
      if (promptRe.test(text)) addThreatFinding(findings, 'hidden_prompt', 'medium', `${el.tagName.toLowerCase()} contains prompt-like text`, el, text, { hiddenFromUser: true });
    }
    try {
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT);
      while (walker.nextNode() && commentsScanned < budget.maxComments && !overBudget()) {
        commentsScanned += 1;
        const text = String(walker.currentNode.nodeValue || '');
        allTextSources.push({ text, source: 'html_comment' });
        if (promptRe.test(text)) addThreatFinding(findings, 'hidden_prompt', 'medium', 'HTML comment contains prompt-like text', walker.currentNode.parentElement || document.body, text, { hiddenFromUser: true });
      }
    } catch {}

    const ipIndicators = allTextSources.flatMap((src) => extractIpIndicatorsFromText(src.text, src.source));
    const uniqueIps = [];
    const seenIps = new Set();
    for (const ip of ipIndicators) {
      const key = `${ip.version}:${ip.value}`;
      if (!seenIps.has(key)) { seenIps.add(key); uniqueIps.push(ip); }
    }
    const durationMs = Math.round(performance.now() - startedAt);
    const risk = scoreThreatFindings(findings, uniqueIps);
    const counts = {
      findings: findings.length,
      hiddenPrompts: findings.filter((f) => f.category === 'hidden_prompt').length,
      overlays: findings.filter((f) => f.category === 'overlay').length,
      links: findings.filter((f) => f.category === 'link_mismatch').length,
      iframes: findings.filter((f) => f.category === 'iframe').length,
      forms: findings.filter((f) => f.category === 'credential_form').length,
      handlers: findings.filter((f) => f.category === 'inline_handler').length,
      ipIndicators: uniqueIps.length,
      nodesScanned,
      linksScanned,
      framesScanned,
      formsScanned,
      scriptsScanned,
      commentsScanned
    };
    const limitations = ['DOM-first scan only', 'Does not prove malware', 'Cannot inspect all runtime JS listeners', 'Cannot read cross-origin iframe DOM', 'Does not execute untrusted scripts', 'IP addresses are infrastructure indicators, not attribution'];
    if (aborted) limitations.push('scan_budget_exceeded');
    telemetry('threat_scan_duration_ms', { durationMs, aborted });
    telemetry('threat_scan_nodes_scanned', { nodesScanned, maxNodes: budget.maxNodes, aborted });
    telemetry('threat_scan_aborted', { aborted, durationMs, budget });
    return {
      schemaVersion: 'browserpilot.threatScan.v1',
      reportId: `thr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      scannedAt: new Date().toISOString(),
      page: { url: location.href, origin: location.origin, title: document.title, readyState: document.readyState },
      risk,
      counts,
      findings,
      ipIndicators: uniqueIps,
      durationMs,
      nodesScanned,
      aborted,
      budget,
      recommendedAction: risk.level === 'high' ? 'threat_lock' : (risk.level === 'medium' ? 'review' : 'continue'),
      privacy: {
        mode: ['minimal', 'bounded', 'review'].includes(contextMode) ? contextMode : 'minimal',
        localOnly: true,
        rawTextStored: false,
        redactedByDefault: true,
        apiReviewRequiresHumanApproval: true,
        noPageCaptureInMinimalMode: contextMode === 'minimal'
      },
      limitations
    };
  }

  function closeThreatHud() {
    document.getElementById('browserpilot-threat-root')?.remove();
  }

  function escapeThreatHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function ipsForThreatFinding(finding, report) {
    const local = extractIpIndicatorsFromText(`${finding?.reason || ''} ${finding?.redactedPreview || ''}`, finding?.category || 'finding');
    if (local.length) return local;
    return (report.ipIndicators || []).slice(0, 3);
  }

  function renderThreatTimeline(report) {
    const findings = (report.findings || []).slice(0, 10);
    const start = new Date(report.scannedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const rows = [
      `<li><span>${escapeThreatHtml(start)}</span><strong>scan started</strong><em>${escapeThreatHtml(report.page?.origin || location.origin)}</em></li>`,
      ...findings.map((finding, index) => {
        const label = `${index + 1}. ${String(finding.category || 'finding').replace(/_/g, ' ')}`;
        return `<li data-severity="${escapeThreatHtml(finding.severity || 'info')}"><span>+${index + 1}</span><strong>${escapeThreatHtml(label)}</strong><em>${escapeThreatHtml(String(finding.severity || 'info').toUpperCase())}</em></li>`;
      }),
      `<li><span>risk</span><strong>${escapeThreatHtml(String(report.risk?.level || 'low').toUpperCase())}</strong><em>score ${escapeThreatHtml(report.risk?.score ?? 0)}</em></li>`
    ];
    return `<ol class="threat-timeline">${rows.join('')}</ol>`;
  }

  function renderThreatSeverityFilters(report) {
    const findings = report.findings || [];
    const counts = ['all', 'high', 'medium', 'low', 'info'].map((severity) => {
      const count = severity === 'all' ? findings.length : findings.filter((finding) => String(finding.severity || 'info') === severity).length;
      return { severity, count };
    }).filter((item) => item.severity === 'all' || item.count > 0);
    return counts.map((item) => `<button class="filter ${item.severity === 'all' ? 'active' : ''}" data-action="filter-threats" data-severity="${escapeThreatHtml(item.severity)}">${escapeThreatHtml(item.severity.toUpperCase())} ${item.count}</button>`).join('');
  }

  function renderThreatEvidenceCards(report) {
    const findings = (report.findings || []).slice(0, 12);
    if (!findings.length) {
      return '<div class="threat-evidence-empty">No individual finding cards were produced.</div>';
    }
    return findings.map((finding, index) => {
      const ips = ipsForThreatFinding(finding, report);
      const ipRows = ips.length
        ? ips.map((ip) => `<li><code>${escapeThreatHtml(ip.value)}</code><span>${escapeThreatHtml([ip.classification, ip.sourceField].filter(Boolean).join(' | '))}</span></li>`).join('')
        : '<li><code>none</code><span>no local IP indicator on this card</span></li>';
      const hints = finding.selectorHints || {};
      const evidence = finding.evidence || {};
      const rect = finding.rect || {};
      const title = `${index + 1}. ${String(finding.category || 'finding').replace(/_/g, ' ')}`;
      return `
        <article class="threat-evidence-card" data-finding-id="${escapeThreatHtml(finding.id)}" data-severity="${escapeThreatHtml(finding.severity || 'info')}">
          <header>
            <strong>${escapeThreatHtml(title)}</strong>
            <span class="sev ${escapeThreatHtml(finding.severity || 'info')}">${escapeThreatHtml(String(finding.severity || 'info').toUpperCase())}</span>
          </header>
          <p>${escapeThreatHtml(finding.reason || '')}</p>
          <div class="preview">${escapeThreatHtml(finding.redactedPreview || '') || 'No preview available.'}</div>
          <dl>
            <dt>Risk</dt><dd>${escapeThreatHtml(finding.severity || 'info')}</dd>
            <dt>Element</dt><dd>${escapeThreatHtml([hints.tag, hints.role, hints.ariaLabel || hints.id].filter(Boolean).join(' | ') || 'unknown')}</dd>
            <dt>Heading</dt><dd>${escapeThreatHtml(hints.nearestHeading || 'none')}</dd>
            <dt>Visible</dt><dd>${escapeThreatHtml(evidence.visibleToUser === false ? 'no' : 'yes')}${evidence.hiddenFromUser ? ' | hidden signal' : ''}</dd>
            <dt>Rect</dt><dd>${Number.isFinite(rect.x) ? escapeThreatHtml(`${rect.x},${rect.y} ${rect.width}x${rect.height}`) : 'unknown'}</dd>
            <dt>CSS</dt><dd>${escapeThreatHtml(hints.cssPath || 'unknown')}</dd>
            <dt>Hash</dt><dd>${escapeThreatHtml(finding.evidenceHash || '')}</dd>
          </dl>
          <div class="ip-list"><span>IP indicators</span><ul>${ipRows}</ul></div>
          <button data-action="focus-finding" data-finding-id="${escapeThreatHtml(finding.id)}">Focus on page</button>
        </article>`;
    }).join('');
  }

  function focusThreatFinding(report, findingId) {
    const finding = (report.findings || []).find((item) => item.id === findingId);
    const rect = finding?.rect;
    if (!rect) return;
    const markerId = 'browserpilot-threat-focus-marker';
    document.getElementById(markerId)?.remove();
    if (typeof rect.scrollY === 'number') {
      window.scrollTo({ top: Math.max(0, rect.scrollY + rect.y - Math.round(innerHeight * 0.28)), behavior: 'smooth' });
    }
    const marker = document.createElement('div');
    marker.id = markerId;
    marker.textContent = String(finding.category || 'threat').replace(/_/g, ' ');
    marker.style.cssText = [
      'position:fixed',
      `left:${Math.max(8, rect.x - 4)}px`,
      `top:${Math.max(8, rect.y - 4)}px`,
      `width:${Math.max(32, rect.width + 8)}px`,
      `height:${Math.max(22, rect.height + 8)}px`,
      'z-index:2147483647',
      'border:2px solid #ffdf6b',
      'box-shadow:0 0 0 9999px rgba(0,0,0,.12),0 0 30px rgba(255,223,107,.75)',
      'background:rgba(255,223,107,.08)',
      'color:#fff',
      'font:700 11px/1.2 system-ui,sans-serif',
      'text-transform:uppercase',
      'letter-spacing:.08em',
      'padding:4px',
      'pointer-events:none',
      'border-radius:8px'
    ].join(';');
    document.documentElement.appendChild(marker);
    setTimeout(() => marker.remove(), 3200);
  }

  function renderThreatFindingBoxes(report) {
    return (report.findings || []).filter((f) => f.rect).slice(0, 16).map((f) => `<div class="threat-box ${f.category}" style="left:${f.rect.x}px;top:${f.rect.y}px;width:${Math.max(28, f.rect.width)}px;height:${Math.max(18, f.rect.height)}px"><span>${f.category}</span></div>`).join('');
  }

  function renderThreatFoundHud(report) {
    closeThreatHud();
    const root = document.createElement('div');
    root.id = 'browserpilot-threat-root';
    root.innerHTML = `
      <div class="threat-dim"></div>
      ${renderThreatFindingBoxes(report)}
      <section class="threat-hud">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="scanline"></div>
        <h2>THREAT SIGNAL DETECTED</h2>
        <div class="riskRow">
          <div class="risk ${report.risk.level}">Risk: ${report.risk.level.toUpperCase()} | Score: ${report.risk.score}</div>
          <button class="reportChat" data-action="report-chat" title="Send a compact local evidence bundle to chat for review">Report to Chat</button>
        </div>
        <p>${report.risk.summary}</p>
        <p>Findings: ${report.counts.findings} | IP indicators: ${report.counts.ipIndicators}</p>
        <p class="small">Agent actions paused. Network indicators are not proof of attacker identity.</p>
        <div class="actions">
          <button data-action="ack">Acknowledge & Continue</button>
          <button data-action="sandbox">Send to Chat Sandbox</button>
          <button data-action="block">Block Agent Actions</button>
          <button data-action="ips">Extract IP Address</button>
          <button data-action="evidence">Open Threat Screens</button>
          <button data-action="dismiss">Dismiss</button>
        </div>
      </section>
      <aside class="threat-evidence-hud" aria-label="Threat evidence screens">
        <div class="threat-evidence-head">
          <div>
            <h3>THREAT SCREENS</h3>
            <p>${escapeThreatHtml(report.counts.findings)} finding(s) | ${escapeThreatHtml(report.counts.ipIndicators)} IP indicator(s) | ${escapeThreatHtml(String(report.risk.level || 'low').toUpperCase())}</p>
          </div>
          <button class="reportChat mini" data-action="report-chat" title="Send compact evidence to chat">Report to Chat</button>
          <button class="closeEvidence" data-action="close-evidence" title="Close evidence HUD">&times;</button>
        </div>
        <div class="threat-evidence-tools">
          <div class="filters">${renderThreatSeverityFilters(report)}</div>
          ${renderThreatTimeline(report)}
        </div>
        <div class="threat-evidence-grid">${renderThreatEvidenceCards(report)}</div>
        <p class="threat-evidence-note">Local DOM evidence only. IP indicators are infrastructure signals, not identity or attribution.</p>
      </aside>`;
    const css = document.createElement('style');
    css.textContent = `
      #browserpilot-threat-root{position:fixed;inset:0;z-index:2147483646;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;pointer-events:auto;color:#fff}
      #browserpilot-threat-root .threat-dim{position:absolute;inset:0;background:rgba(3,8,18,.28)}
      #browserpilot-threat-root .threat-hud{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));border:1px solid rgba(254,78,78,.72);border-radius:18px;background:linear-gradient(135deg,rgba(18,8,14,.90),rgba(8,14,22,.88));box-shadow:0 0 0 1px rgba(255,149,0,.18) inset,0 0 45px rgba(254,78,78,.36);padding:20px;overflow:hidden}
      #browserpilot-threat-root .threat-hud:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:18px 18px;opacity:.24;pointer-events:none}
      #browserpilot-threat-root .scanline{position:absolute;left:-30%;top:0;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(18,224,255,.16),transparent);animation:bpThreatSweep 2.6s linear infinite}
      @keyframes bpThreatSweep{from{transform:translateX(0)}to{transform:translateX(360%)}}
      #browserpilot-threat-root h2{position:relative;margin:0 0 10px;color:#ffdddd;letter-spacing:.12em;font-size:17px}
      #browserpilot-threat-root p,#browserpilot-threat-root .risk{position:relative;margin:8px 0;color:rgba(255,255,255,.86)}
      #browserpilot-threat-root .riskRow{position:relative;display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:8px 0}
      #browserpilot-threat-root .risk{display:inline-block;border:1px solid rgba(255,149,0,.5);border-radius:999px;padding:6px 10px;background:rgba(254,78,78,.14)}
      #browserpilot-threat-root .reportChat{border-color:rgba(255,51,102,.75);background:linear-gradient(90deg,rgba(254,78,78,.35),rgba(209,61,229,.18));box-shadow:0 0 16px rgba(254,78,78,.38),0 0 0 1px rgba(255,255,255,.05) inset;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      #browserpilot-threat-root .reportChat:hover{border-color:rgba(255,223,107,.75);box-shadow:0 0 24px rgba(255,51,102,.62)}
      #browserpilot-threat-root .reportChat.mini{width:auto;height:30px;padding:0 10px;white-space:nowrap}
      #browserpilot-threat-root .small{font-size:12px;color:rgba(255,216,200,.78)}
      #browserpilot-threat-root .actions{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      #browserpilot-threat-root button{border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;padding:9px;cursor:pointer}
      #browserpilot-threat-root button:hover{border-color:rgba(18,224,255,.5);background:rgba(18,224,255,.12)}
      #browserpilot-threat-root .threat-evidence-hud{display:none;position:fixed;left:calc(50% + 286px);top:50%;transform:translateY(-50%);width:min(430px,calc(100vw - 42px));max-height:min(760px,calc(100vh - 28px));border:1px solid rgba(255,223,107,.54);border-radius:16px;background:linear-gradient(145deg,rgba(12,13,22,.94),rgba(28,12,20,.91));box-shadow:0 0 36px rgba(255,92,92,.24),0 0 0 1px rgba(255,255,255,.05) inset;overflow:hidden}
      #browserpilot-threat-root.show-evidence .threat-evidence-hud{display:flex;flex-direction:column}
      #browserpilot-threat-root .threat-evidence-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
      #browserpilot-threat-root .threat-evidence-head h3{margin:0;color:#fff0bb;letter-spacing:.13em;font-size:13px}
      #browserpilot-threat-root .threat-evidence-head p{margin:5px 0 0;font-size:12px;color:rgba(255,255,255,.72)}
      #browserpilot-threat-root .threat-evidence-head .closeEvidence{width:32px;height:30px;padding:0;display:grid;place-items:center;line-height:1;border-radius:999px}
      #browserpilot-threat-root .threat-evidence-tools{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);display:grid;gap:10px}
      #browserpilot-threat-root .filters{display:flex;flex-wrap:wrap;gap:6px}
      #browserpilot-threat-root .filters .filter{font-size:11px;padding:6px 8px;border-radius:999px}.filters .filter.active{border-color:rgba(255,223,107,.72);background:rgba(255,223,107,.16)}
      #browserpilot-threat-root .threat-timeline{margin:0;padding:0;list-style:none;display:grid;gap:5px;max-height:120px;overflow:auto}
      #browserpilot-threat-root .threat-timeline li{display:grid;grid-template-columns:48px 1fr auto;gap:7px;align-items:center;border-left:2px solid rgba(255,223,107,.42);padding:4px 0 4px 8px;font-size:11px}
      #browserpilot-threat-root .threat-timeline span{color:#9fe7ff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}#browserpilot-threat-root .threat-timeline strong{color:rgba(255,255,255,.86);font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#browserpilot-threat-root .threat-timeline em{font-style:normal;color:rgba(255,255,255,.55)}
      #browserpilot-threat-root .threat-evidence-grid{padding:12px;overflow:auto;display:grid;gap:10px}
      #browserpilot-threat-root .threat-evidence-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.045);padding:11px}
      #browserpilot-threat-root .threat-evidence-card.filtered-out{display:none}
      #browserpilot-threat-root .threat-evidence-card header{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #browserpilot-threat-root .threat-evidence-card strong{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#fff}
      #browserpilot-threat-root .threat-evidence-card .sev{font-size:10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:3px 7px;color:#fff}
      #browserpilot-threat-root .threat-evidence-card .sev.high{border-color:#ff5757;background:rgba(255,87,87,.2)}#browserpilot-threat-root .threat-evidence-card .sev.medium{border-color:#ffb84a;background:rgba(255,184,74,.18)}#browserpilot-threat-root .threat-evidence-card .sev.low{border-color:#70d6ff;background:rgba(112,214,255,.14)}
      #browserpilot-threat-root .threat-evidence-card p{font-size:12px;color:rgba(255,255,255,.82)}
      #browserpilot-threat-root .threat-evidence-card .preview{font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;color:#ffd9d9;background:rgba(0,0,0,.24);border-radius:8px;padding:8px;max-height:74px;overflow:auto}
      #browserpilot-threat-root .threat-evidence-card dl{display:grid;grid-template-columns:64px 1fr;gap:4px 8px;margin:9px 0;font-size:11px}#browserpilot-threat-root .threat-evidence-card dt{color:rgba(255,255,255,.48)}#browserpilot-threat-root .threat-evidence-card dd{margin:0;color:rgba(255,255,255,.78);overflow-wrap:anywhere}
      #browserpilot-threat-root .ip-list span{display:block;font-size:11px;color:#fff0bb;margin-bottom:4px}.ip-list ul{list-style:none;padding:0;margin:0;display:grid;gap:4px}.ip-list li{display:flex;justify-content:space-between;gap:8px;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:5px 6px;font-size:11px}.ip-list code{color:#9fe7ff;overflow-wrap:anywhere}.ip-list li span{margin:0;color:rgba(255,255,255,.64);text-align:right}
      #browserpilot-threat-root .threat-evidence-card button{width:100%;margin-top:9px;padding:7px;font-size:12px}.threat-evidence-empty{padding:16px;color:rgba(255,255,255,.72)}.threat-evidence-note{padding:0 14px 12px;margin:0;font-size:11px;color:rgba(255,230,190,.72)}
      @media (max-width:980px){#browserpilot-threat-root .threat-hud{top:34%;width:min(520px,calc(100vw - 24px))}#browserpilot-threat-root .threat-evidence-hud{left:12px;right:12px;top:auto;bottom:12px;transform:none;width:auto;max-height:48vh}}
      #browserpilot-threat-root .corner{position:absolute;width:24px;height:24px;border-color:#ff5b5b;pointer-events:none}.tl{left:10px;top:10px;border-left:2px solid;border-top:2px solid}.tr{right:10px;top:10px;border-right:2px solid;border-top:2px solid}.bl{left:10px;bottom:10px;border-left:2px solid;border-bottom:2px solid}.br{right:10px;bottom:10px;border-right:2px solid;border-bottom:2px solid}
      #browserpilot-threat-root .threat-box{position:fixed;border:1px solid rgba(254,78,78,.75);background:rgba(254,78,78,.08);box-shadow:0 0 20px rgba(254,78,78,.25);pointer-events:none;border-radius:6px}.threat-box.hidden_prompt{border-color:rgba(209,61,229,.85)}.threat-box span{position:absolute;left:4px;top:-20px;background:rgba(10,8,14,.92);border:1px solid rgba(254,78,78,.45);border-radius:5px;padding:2px 5px;font-size:10px;color:#ffdede}
    `;
    root.appendChild(css);
    root.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (!action) return;
      if (action === 'evidence') { root.classList.add('show-evidence'); return; }
      if (action === 'close-evidence') { root.classList.remove('show-evidence'); return; }
      if (action === 'focus-finding') { focusThreatFinding(report, e.target?.dataset?.findingId || ''); return; }
      if (action === 'filter-threats') {
        const severity = e.target?.dataset?.severity || 'all';
        root.querySelectorAll('.filters .filter').forEach((btn) => btn.classList.toggle('active', btn === e.target));
        root.querySelectorAll('.threat-evidence-card').forEach((card) => {
          card.classList.toggle('filtered-out', severity !== 'all' && card.dataset.severity !== severity);
        });
        root.querySelectorAll('.threat-timeline li[data-severity]').forEach((row) => {
          row.style.display = severity === 'all' || row.dataset.severity === severity ? '' : 'none';
        });
        return;
      }
      if (action === 'ack') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_THREAT_HUD_ACKNOWLEDGED', report }).catch(() => {});
      if (action === 'sandbox') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_THREAT_HUD_SEND_TO_SANDBOX', report }).catch(() => {});
      if (action === 'report-chat') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_THREAT_REPORT_TO_CHAT', report }).catch(() => {});
      if (action === 'block') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_THREAT_HUD_BLOCK_ACTIONS', report }).catch(() => {});
      if (action === 'ips') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_EXTRACT_IPS_FROM_THREAT_REPORT', report }).catch(() => {});
      if (action === 'dismiss') chrome.runtime.sendMessage({ type: 'BROWSERPILOT_THREAT_HUD_DISMISSED', report }).catch(() => {});
      closeThreatHud();
    });
    document.documentElement.appendChild(root);
  }

  function startThreatScanOverlay(contextMode = 'minimal') {
    const gate = startPageTool('threatScan');
    if (!gate.ok) throw new Error(gate.error);
    const report = runThreatScan(contextMode);
    if (report.risk.level === 'medium' || report.risk.level === 'high') renderThreatFoundHud(report);
    finishPageTool('threatScan', report.aborted ? 'scan_budget_exceeded' : 'completed');
    return report;
  }

  async function openSidePanelWithContext() {
    const context = captureContext();
    const res = await chrome.runtime.sendMessage({ type: 'AGNT_OPEN_SIDEPANEL' });
    if (!res?.ok) throw new Error(res?.error || 'Failed to open side panel');
    if (typeof res.tabId === 'number') {
      context.browserPilot = { tabId: res.tabId };
    }
    chrome.runtime.sendMessage({ type: 'AGNT_PAGE_CONTEXT', context });

    fab.style.opacity = '0.6';
    setTimeout(() => (fab.style.opacity = '0.95'), 250);
  }

  fab.addEventListener('click', () => {
    openSidePanelWithContext().catch((e) => {
      console.warn('[BrowserPilot] open failed:', e?.message || String(e));
      alert('BrowserPilot: could not open side panel.\n\nOpen edge://extensions → BrowserPilot → Service Worker (Inspect) to see the error.\n\nError: ' + (e?.message || String(e)));
    });
  });

  // Command execution (minimal)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      try {
        if (msg?.type === 'AGNT_CAPTURE_CONTEXT') {
          sendResponse({ ok: true, context: captureContext() });
          return;
        }

        if (msg?.type === 'AGNT_START_CYBER_SNAPSHOT' || msg?.type === 'BROWSERPILOT_START_CYBER_SNAPSHOT') {
          startCyberSnapshotOverlay();
          sendResponse({ ok: true, started: true, status: toolStatus() });
          return;
        }

        if (msg?.type === 'AGNT_START_REGION_WATCH' || msg?.type === 'BROWSERPILOT_START_REGION_WATCH') {
          startCyberRegionWatch({ rect: msg.rect, previousText: msg.previousText || '', page: msg.page || null });
          sendResponse({ ok: true, watching: true, status: toolStatus() });
          return;
        }

        if (msg?.type === 'AGNT_STOP_REGION_WATCH' || msg?.type === 'BROWSERPILOT_STOP_REGION_WATCH') {
          stopCyberRegionWatch('manual');
          sendResponse({ ok: true, watching: false, status: toolStatus() });
          return;
        }

        if (msg?.type === 'BROWSERPILOT_STOP_PAGE_TOOLS') {
          sendResponse(stopAllPageTools(msg.reason || 'sidepanel_stop_all'));
          return;
        }

        if (msg?.type === 'BROWSERPILOT_START_CONTEXT_RADAR') {
          const result = await startContextRadarOverlay();
          sendResponse(result || { ok: true, started: true, status: toolStatus() });
          return;
        }

        if (msg?.type === 'BROWSERPILOT_START_THREAT_SCAN') {
          const report = startThreatScanOverlay(msg.contextMode || 'minimal');
          sendResponse({ ok: true, report });
          return;
        }

        if (msg?.type === 'AGNT_EXEC') {
          const cmd = msg.command || {};
          const kind = String(cmd.kind || '').trim();

          function resolveSel(css) {
            const s = String(css || '').trim();
            if (!s) throw new Error('Missing css selector');
            return s;
          }

          function dataUrlToFile(dataUrl, filename = 'screenshot.png') {
            const m = String(dataUrl || '').match(/^data:(.+?);base64,(.*)$/);
            if (!m) return null;
            const mime = m[1];
            const b64 = m[2];
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new File([arr], filename, { type: mime });
          }

          async function attachImageToFileInput(inputEl, dataUrl, filename = 'screenshot.png') {
            if (!inputEl) throw new Error('No file input element found');
            const file = dataUrlToFile(dataUrl, filename);
            if (!file) throw new Error('Invalid screenshot dataUrl');
            const dt = new DataTransfer();
            dt.items.add(file);
            inputEl.files = dt.files;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          }

          function findXComposerTextbox() {
            const selectors = [
              'div[data-testid="tweetTextarea_0"]',
              'div[role="textbox"][data-testid="tweetTextarea_0"]',
              'div[role="textbox"][contenteditable="true"]',
              'div[contenteditable="true"][aria-label]',
              'div[role="textbox"]'
            ];
            for (const s of selectors) {
              const el = document.querySelector(s);
              if (el) return el;
            }
            return null;
          }

          if (kind === 'domAudit') {
            const audit = runDomAudit({ includeResources: cmd.includeResources !== false });
            chrome.runtime.sendMessage({
              type: 'AGNT_TELEMETRY',
              eventType: 'dom_audit_completed',
              data: {
                url: audit.page.url,
                title: audit.page.title,
                challengeDetected: audit.signals.challenge.detected,
                resourceIndicators: audit.signals.resources.length
              }
            }).catch(() => {});
            sendResponse({ ok: true, result: audit });
            return;
          }

          if (kind === 'click') {
            const sel = resolveSel(cmd.css);
            const el = document.querySelector(sel);
            if (!el) throw new Error('No element matches selector: ' + sel);
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.click();
            sendResponse({ ok: true, result: 'clicked ' + sel });
            return;
          }

          if (kind === 'type') {
            const sel = resolveSel(cmd.css);
            const el = document.querySelector(sel);
            if (!el) throw new Error('No element matches selector: ' + sel);
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.focus();

            const text = String(cmd.text ?? '');
            const tag = (el.tagName || '').toLowerCase();
            const isEditable = el.isContentEditable || tag === 'div' || tag === 'span';

            if (tag === 'input' || tag === 'textarea') {
              el.value = text;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (isEditable) {
              try {
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, text);
              } catch {
                el.textContent = text;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              // Fallback
              el.textContent = text;
            }

            sendResponse({ ok: true, result: 'typed into ' + sel });
            return;
          }

          if (kind === 'scroll') {
            const y = Number(cmd.y || 0);
            window.scrollBy({ top: y, left: 0, behavior: 'smooth' });
            sendResponse({ ok: true, result: 'scrolled ' + y });
            return;
          }

          if (kind === 'xComposeFocus') {
            const el = findXComposerTextbox();
            if (!el) throw new Error('X composer textbox not found');
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.click();
            el.focus();
            sendResponse({ ok: true, result: 'focused X composer textbox' });
            return;
          }

          if (kind === 'xComposeType') {
            const el = findXComposerTextbox();
            if (!el) throw new Error('X composer textbox not found');
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.click();
            el.focus();
            const text = String(cmd.text ?? '');
            try {
              document.execCommand('insertText', false, text);
            } catch {
              el.textContent = text;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            sendResponse({ ok: true, result: 'typed into X composer textbox' });
            return;
          }

          if (kind === 'attachImage') {
            const sel = String(cmd.css || 'input[type="file"]').trim() || 'input[type="file"]';
            const inputEl = document.querySelector(sel);
            await attachImageToFileInput(inputEl, cmd.dataUrl, cmd.filename || 'screenshot.png');
            sendResponse({ ok: true, result: 'attached image' });
            return;
          }

          if (kind === 'waitForSelector') {
            const sel = resolveSel(cmd.css);
            const timeoutMs = Math.max(0, Number(cmd.timeoutMs || 10000));
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              const el = document.querySelector(sel);
              if (el) {
                sendResponse({ ok: true, result: 'found ' + sel });
                return;
              }
              await new Promise(r => setTimeout(r, 200));
            }
            throw new Error('Timeout waiting for selector: ' + sel);
          }

          if (kind === 'pressKey') {
            const keyRaw = String(cmd.key || '').trim();
            if (!keyRaw) throw new Error('pressKey.key is required');

            // NOTE: Browsers do not allow programmatic Ctrl+V paste for security.
            // Use attachImage instead for images.
            if (/ctrl\s*\+\s*v/i.test(keyRaw) || /control\s*\+\s*v/i.test(keyRaw)) {
              throw new Error('CTRL+V paste is not supported. Use screenshot + attachImage instead.');
            }

            const el = document.activeElement || document.body;
            const key = keyRaw.length === 1 ? keyRaw : keyRaw;
            const evOpts = { key, bubbles: true, cancelable: true };
            el.dispatchEvent(new KeyboardEvent('keydown', evOpts));
            el.dispatchEvent(new KeyboardEvent('keyup', evOpts));
            sendResponse({ ok: true, result: 'pressed ' + keyRaw });
            return;
          }

          throw new Error('Unknown AGNT_EXEC kind: ' + kind);
        }

        sendResponse({ ok: true, ignored: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();

    return true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopCyberRegionWatch('visibility_hidden');
  }, true);
  window.addEventListener('pagehide', () => stopAllPageTools('pagehide'), { once: true });
  window.addEventListener('beforeunload', () => stopAllPageTools('beforeunload'), { once: true });
})();
