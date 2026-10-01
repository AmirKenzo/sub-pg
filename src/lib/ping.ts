import type { ParsedLink } from '@/lib/linkParser';

export type PingResult =
  | { status: 'ok'; latency: number }
  | { status: 'timeout' }
  | { status: 'unavailable' };

// UDP-based protocols cannot be probed from a browser
const UDP_PROTOCOLS = new Set<ParsedLink['protocol']>(['hysteria', 'wireguard']);

// Errors faster than this are the browser refusing the request (e.g. blocked port), not a network round trip
const MIN_REAL_LATENCY_MS = 3;

/** Returns a "host:port" key for the server behind a config, or null when it can't be probed. */
export const getPingTarget = (link: ParsedLink): string | null => {
  if (UDP_PROTOCOLS.has(link.protocol) || !link.server) return null;

  const host = link.server.includes(':') && !link.server.startsWith('[') ? `[${link.server}]` : link.server;
  const port = link.port && /^\d+$/.test(link.port) ? link.port : '443';
  return `${host}:${port}`;
};

/** Measures how long it takes to reach the target. Returns null on timeout. */
const probe = async (target: string, timeoutMs: number): Promise<number | null> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    await fetch(`https://${target}/?_=${Date.now()}`, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
  } catch {
    // Non-HTTPS servers reject the TLS handshake; the elapsed time still reflects the round trip
    if (controller.signal.aborted) return null;
  } finally {
    window.clearTimeout(timer);
  }

  return performance.now() - start;
};

/**
 * Approximates latency to a server by timing a connection attempt from the browser.
 * The first attempt warms up DNS/TCP, so the best of two attempts is reported.
 */
export const pingTarget = async (target: string, timeoutMs: number = 5000): Promise<PingResult> => {
  const first = await probe(target, timeoutMs);
  if (first === null) return { status: 'timeout' };

  const second = await probe(target, timeoutMs);
  const latency = Math.round(Math.min(first, second ?? first));
  if (latency < MIN_REAL_LATENCY_MS) return { status: 'unavailable' };

  return { status: 'ok', latency };
};

/** Runs async tasks with a concurrency limit. */
export const runWithConcurrency = async <T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item);
    }
  });
  await Promise.all(workers);
};
