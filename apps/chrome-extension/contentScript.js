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
