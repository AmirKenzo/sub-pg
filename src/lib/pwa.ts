/**
 * Best-effort "Add to Home Screen" support.
 * The template ships as a single HTML file served by the panel, so the manifest and
 * icon are generated at runtime instead of being separate static files.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ICON_SIZES = [192, 512] as const;

const readCssColor = (variable: string, fallback: string): string => {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color || fallback;
  probe.remove();
  return color;
};

/** Draws a rounded app icon with the user's initial on the brand color. */
const createIconDataUrl = (size: number, letter: string, background: string, foreground: string): string | null => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = foreground;
  ctx.font = `700 ${Math.round(size * 0.48)}px Vazirmatn, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter.toUpperCase(), size / 2, size / 2 + size * 0.03);

  return canvas.toDataURL('image/png');
};

const upsertElement = <T extends HTMLElement>(selector: string, create: () => T): T => {
  const existing = document.head.querySelector<T>(selector);
  if (existing) return existing;
  const element = create();
  document.head.appendChild(element);
  return element;
};

const setMeta = (name: string, content: string) => {
  const meta = upsertElement(`meta[name="${name}"]`, () => {
    const element = document.createElement('meta');
    element.name = name;
    return element;
  });
  meta.content = content;
};

/** Injects the manifest, icons and mobile web-app meta tags for the current subscription page. */
export const setupWebAppManifest = (username: string): void => {
  if (typeof document === 'undefined') return;

  try {
    const background = readCssColor('--primary', '#3b82f6');
    const foreground = readCssColor('--primary-foreground', '#ffffff');
    const pageBackground = readCssColor('--background', '#0b1020');
    const letter = username.trim().charAt(0) || 'S';

    const icons = ICON_SIZES.map((size) => ({
      src: createIconDataUrl(size, letter, background, foreground),
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable',
    })).filter((icon): icon is { src: string; sizes: string; type: string; purpose: string } => !!icon.src);

    const startUrl = `${window.location.origin}${window.location.pathname}`;
    const manifest = {
      name: username,
      short_name: username.slice(0, 12),
      start_url: startUrl,
      scope: startUrl,
      display: 'standalone',
      background_color: pageBackground,
      theme_color: pageBackground,
      icons,
    };

    const manifestLink = upsertElement('link[rel="manifest"]', () => {
      const element = document.createElement('link');
      element.rel = 'manifest';
      return element;
    });
    manifestLink.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;

    if (icons[0]) {
      const touchIcon = upsertElement('link[rel="apple-touch-icon"]', () => {
        const element = document.createElement('link');
        element.rel = 'apple-touch-icon';
        return element;
      });
      touchIcon.href = icons[0].src;
    }

    setMeta('theme-color', pageBackground);
    setMeta('mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    setMeta('apple-mobile-web-app-title', username);
  } catch (error) {
    console.warn('Failed to set up web app manifest:', error);
  }
};

export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIosSafari = (): boolean => {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};
