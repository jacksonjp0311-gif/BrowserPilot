export function createDomAuditProbe() {
  function hashString(input) {
    let h = 2166136261;
    const s = String(input || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function safeUrl(raw) {
    try {
      const u = new URL(String(raw || ''), location.href);
      return u.origin + u.pathname;
    } catch {
      return '';
    }
  }

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
    } catch (error) {
      return { supported: false, error: error?.message || String(error) };
    }
  }

  function webglSignal() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { supported: false };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return {
        supported: true,
        vendor: String(vendor || ''),
        renderer: String(renderer || ''),
        version: String(gl.getParameter(gl.VERSION) || ''),
      };
    } catch (error) {
      return { supported: false, error: error?.message || String(error) };
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
      '#cf-challenge-running',
    ];
    const matches = selectors
      .map((selector) => ({ selector, count: document.querySelectorAll(selector).length }))
      .filter((item) => item.count > 0);

    const text = String(document.body?.innerText || '').slice(0, 5000).toLowerCase();
    const phrases = [
      'checking your browser',
      'verify you are human',
      'turnstile',
      'cloudflare',
      'cf-challenge',
      'just a moment',
    ].filter((phrase) => text.includes(phrase));

    return {
      detected: matches.length > 0 || phrases.length > 0,
      matches,
      phrases,
    };
  }

  function resourceIndicators(limit = 80) {
    const patterns = /cloudflare|turnstile|cdn-cgi|challenge|cf_chl|cf-ray/i;
    const entries = performance.getEntriesByType?.('resource') || [];
    return entries
      .filter((entry) => patterns.test(entry.name || ''))
      .slice(-limit)
      .map((entry) => ({
        name: safeUrl(entry.name),
        initiatorType: entry.initiatorType || '',
        durationMs: Number(entry.duration || 0).toFixed(1),
        transferSize: Number(entry.transferSize || 0),
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

  return function runDomAudit({ includeResources = true } = {}) {
    const nav = navigator || {};
    return {
      schemaVersion: 'browserpilot.domAudit.v1',
      capturedAt: new Date().toISOString(),
      page: {
        url: location.href,
        origin: location.origin,
        title: document.title,
        readyState: document.readyState,
      },
      browser: {
        userAgent: nav.userAgent || '',
        platform: nav.platform || '',
        languages: Array.from(nav.languages || []),
        webdriver: Boolean(nav.webdriver),
        hardwareConcurrency: nav.hardwareConcurrency || null,
        deviceMemory: nav.deviceMemory || null,
        cookieEnabled: Boolean(nav.cookieEnabled),
        doNotTrack: nav.doNotTrack || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        screen: {
          width: screen?.width || null,
          height: screen?.height || null,
          colorDepth: screen?.colorDepth || null,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
      },
      signals: {
        canvas: canvasSignal(),
        webgl: webglSignal(),
        fonts: loadedFonts(),
        challenge: challengeIndicators(),
        resources: includeResources ? resourceIndicators() : [],
      },
      policy: {
        mode: 'diagnostic_only',
        modifiesPage: false,
        extractsSecrets: false,
        solvesChallenges: false,
      },
    };
  };
}
