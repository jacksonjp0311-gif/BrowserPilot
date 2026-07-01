// Injects a small floating button on every page to open the BrowserPilot side panel
// Also exposes minimal browser-control primitives via messages.

(function () {
  const ID = 'agnt-browser-agents-fab';
  if (document.getElementById(ID)) return;

  const fab = document.createElement('button');
  fab.id = ID;
  fab.type = 'button';
  fab.textContent = 'AGNT';
  fab.title = 'Open BrowserPilot';

  const style = document.createElement('style');
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

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(fab);

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
  let cyberRegionWatchState = null;

  function stopCyberRegionWatch() {
    if (cyberRegionWatchTimer) clearInterval(cyberRegionWatchTimer);
    cyberRegionWatchTimer = null;
    cyberRegionWatchState = null;
  }

  function startCyberRegionWatch({ rect, previousText = '', page = null } = {}) {
    if (!rect) throw new Error('Region watch requires a Cyber Snapshot rectangle.');
    stopCyberRegionWatch();
    cyberRegionWatchState = {
      rect,
      page,
      previousText: String(previousText || ''),
      previousHash: hashString(previousText || ''),
      startedAt: new Date().toISOString()
    };
    cyberRegionWatchTimer = setInterval(() => {
      try {
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
  }

  function startCyberSnapshotOverlay() {
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
      console.error('[BrowserPilot] open failed:', e);
      alert('BrowserPilot: could not open side panel.\n\nOpen chrome://extensions → BrowserPilot for Chrome → Service Worker (Inspect) to see the error.\n\nError: ' + (e?.message || String(e)));
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
          sendResponse({ ok: true, started: true });
          return;
        }

        if (msg?.type === 'AGNT_START_REGION_WATCH' || msg?.type === 'BROWSERPILOT_START_REGION_WATCH') {
          startCyberRegionWatch({ rect: msg.rect, previousText: msg.previousText || '', page: msg.page || null });
          sendResponse({ ok: true, watching: true });
          return;
        }

        if (msg?.type === 'AGNT_STOP_REGION_WATCH' || msg?.type === 'BROWSERPILOT_STOP_REGION_WATCH') {
          stopCyberRegionWatch();
          sendResponse({ ok: true, watching: false });
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
})();
