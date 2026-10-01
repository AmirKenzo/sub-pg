import { useState, memo, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Files, Download, Link2, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { parseLinks, type ParsedLink } from '@/lib/linkParser';
import {
  downloadTextFile,
  getWireGuardDownloadPayload,
  prepareSubscriptionContentForCopy,
} from '@/lib/subscriptionConfig';
import { QRModal } from '@/components/qr-modal';
import { useDir } from '@/hooks/useDir';
import { cn } from '@/lib/utils';
import { getPingTarget, pingTarget, runWithConcurrency, type PingResult } from '@/lib/ping';

interface ConnectionLinksProps {
  links: string[];
}

export const ConnectionLinks = memo(({ links }: ConnectionLinksProps) => {
  const { t } = useTranslation();
  const dir = useDir();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [selectedLink, setSelectedLink] = useState<ParsedLink | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const copyAllTimeoutRef = useRef<number | null>(null);

  // Memoize parsed links to avoid re-parsing on every render
  const parsedLinks = useMemo(() => parseLinks(links), [links]);

  // Ping results keyed by "host:port" so configs sharing a server are probed once
  const [pingResults, setPingResults] = useState<Record<string, PingResult | 'pending'>>({});
  const [isPinging, setIsPinging] = useState(false);

  const handlePingAll = useCallback(async () => {
    if (isPinging) return;

    const targets = Array.from(
      new Set(parsedLinks.map(getPingTarget).filter((target): target is string => !!target))
    );
    if (targets.length === 0) return;

    setIsPinging(true);
    setPingResults(Object.fromEntries(targets.map((target) => [target, 'pending' as const])));

    try {
      await runWithConcurrency(targets, 6, async (target) => {
        const result = await pingTarget(target);
        setPingResults((prev) => ({ ...prev, [target]: result }));
      });
    } finally {
      setIsPinging(false);
    }
  }, [isPinging, parsedLinks]);

  // Memoize subscription URL to avoid recalculating on every render
  const subscriptionUrl = useMemo(() =>
    `${window.location.origin}${window.location.pathname.replace(/\/info$/, '')}`,
    []
  );

  // Memoize all configs text to avoid recalculating on every render
  const allConfigsText = useMemo(() => {
    const allConfigs = parsedLinks.map(link => link.raw);
    return allConfigs.join('\n');
  }, [parsedLinks]);

  const handleCopy = useCallback((link: ParsedLink) => {
    const prepared = prepareSubscriptionContentForCopy(link.raw);
    copyToClipboard(prepared.content, `${link.raw}:config`);
  }, [copyToClipboard]);

  const handleCopySubscription = useCallback(() => {
    copyToClipboard(subscriptionUrl, subscriptionUrl);
  }, [copyToClipboard, subscriptionUrl]);

  const handleShowQR = useCallback((link: ParsedLink) => {
    setSelectedLink(link);
    setQrModalOpen(true);
  }, []);

  const handleCopyAll = useCallback(() => {
    // Clear any existing timeout
    if (copyAllTimeoutRef.current) {
      clearTimeout(copyAllTimeoutRef.current);
    }

    const prepared = prepareSubscriptionContentForCopy(allConfigsText);
    copyToClipboard(prepared.content, allConfigsText);
    setCopyAllSuccess(true);

    // Debounce the success state reset
    copyAllTimeoutRef.current = setTimeout(() => {
      setCopyAllSuccess(false);
    }, 2000);
  }, [copyToClipboard, allConfigsText]);

  const handleDownloadWireGuard = useCallback((link: ParsedLink) => {
    try {
      const payload = getWireGuardDownloadPayload(link.raw);
      if (!payload) {
        throw new Error('WireGuard config not available');
      }

      downloadTextFile(payload.content, payload.fileName);
      toast.success(t('configActions.downloadStarted'));
    } catch (error) {
      console.error('Failed to download WireGuard config:', error);
      toast.error(t('configActions.downloadFailed'));
    }
  }, [t]);

  const getProtocolBadge = useCallback((protocol: ParsedLink['protocol']) => {
    if (protocol === 'unknown') return 'SUB';
    if (protocol === 'shadowsocks') return 'SS';
    if (protocol === 'wireguard') return 'WG';
    if (protocol === 'hysteria') return 'HY2';
    return protocol;
  }, []);

  const iconButtonClass = 'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground';

  return (
    <div className="surface flex h-full flex-col overflow-hidden animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="icon-chip size-9">
            <Link2 className="size-4.5" />
          </span>
          <h2 className="page-section-title whitespace-nowrap">{t('config.title')}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
            {parsedLinks.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={handlePingAll}
          disabled={isPinging}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-70"
          title={t('configActions.ping')}
        >
          {isPinging ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          <span className="hidden sm:inline">{isPinging ? t('configActions.pinging') : t('configActions.ping')}</span>
        </button>
        <button
          onClick={handleCopyAll}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
            copyAllSuccess
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'bg-card text-foreground hover:bg-muted'
          )}
          title={copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}
        >
          {copyAllSuccess ? <Check className="size-4" /> : <Files className="size-4" />}
          <span className="hidden sm:inline">{copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}</span>
        </button>
        </div>
      </div>

      {/* Subscription Link */}
      <div className="px-5 pt-4 sm:px-6">
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{t('config.subscriptionLink')}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => handleShowQR({
                  protocol: 'unknown',
                  name: t('config.subscriptionLink'),
                  emoji: '📱',
                  raw: subscriptionUrl
                })}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:bg-muted"
                title={t('qr.show')}
              >
                <ScanQrCode className="size-4" />
              </button>
              <button
                onClick={handleCopySubscription}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                title={t('qr.copy')}
              >
                {isCopied(subscriptionUrl) ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="hidden sm:inline">{t('qr.copy')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Config list */}
      <div className="mt-3 max-h-[380px] flex-1 space-y-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {parsedLinks.map((link, index) => {
          const copied = isCopied(`${link.raw}:config`);
          const pingKey = getPingTarget(link);
          const ping = pingKey ? pingResults[pingKey] : undefined;

          return (
            <div
              key={index}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70"
            >
              {/* Protocol Badge */}
              <span className={cn('page-badge min-w-12 shrink-0 rounded-lg px-2 py-1 text-center text-[11px] ring-1 ring-inset', getProtocolColor(link.protocol))}>
                {getProtocolBadge(link.protocol)}
              </span>

              {/* Name */}
              <div dir="ltr" className={cn('flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground', dir === 'rtl' ? 'justify-end text-right' : 'text-left')}>
                {link.emoji && <span className="shrink-0 text-sm">{link.emoji}</span>}
                <span className="truncate">{link.name}</span>
              </div>

              {/* Ping result */}
              {(ping || (!pingKey && Object.keys(pingResults).length > 0)) && (
                <PingBadge result={ping ?? { status: 'unavailable' }} />
              )}

              {/* Action Buttons */}
              <div className="flex shrink-0 gap-0.5">
                {getWireGuardDownloadPayload(link.raw) && (
                  <button
                    onClick={() => handleDownloadWireGuard(link)}
                    className={iconButtonClass}
                    title={t('configActions.downloadWireGuard')}
                  >
                    <Download className="size-4" />
                  </button>
                )}
                <button
                  onClick={() => handleCopy(link)}
                  className={cn(iconButtonClass, copied && 'text-primary')}
                  title={link.protocol === 'unknown' ? t('qr.copy') : t('configActions.copyConfig')}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
                <button
                  onClick={() => handleShowQR(link)}
                  className={iconButtonClass}
                  title={t('qr.show')}
                >
                  <ScanQrCode className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Keep the dialog mounted after close so Radix can play exit animations */}
      {selectedLink && (
        <QRModal
          link={selectedLink}
          open={qrModalOpen}
          onOpenChange={setQrModalOpen}
        />
      )}
    </div>
  );
});

const PROTOCOL_COLORS: Partial<Record<ParsedLink['protocol'], string>> = {
  vless: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400',
  vmess: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400',
  trojan: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400',
  shadowsocks: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400',
  hysteria: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
  wireguard: 'bg-teal-500/10 text-teal-600 ring-teal-500/20 dark:text-teal-400',
};

const getProtocolColor = (protocol: ParsedLink['protocol']): string =>
  PROTOCOL_COLORS[protocol] ?? 'bg-primary/10 text-primary ring-primary/20';

const PingBadge = memo(({ result }: { result: PingResult | 'pending' }) => {
  const { t, i18n } = useTranslation();

  if (result === 'pending') {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  }

  if (result.status !== 'ok') {
    return (
      <span className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        result.status === 'timeout' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'
      )}>
        {result.status === 'timeout' ? t('configActions.pingTimeout') : t('configActions.pingUnavailable')}
      </span>
    );
  }

  const tone = result.latency < 300
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : result.latency < 800
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : 'bg-red-500/10 text-red-600 dark:text-red-400';
  const isFa = i18n.language?.startsWith('fa');

  return (
    <span dir="auto" className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', tone)}>
      {result.latency.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {isFa ? 'میلی‌ثانیه' : 'ms'}
    </span>
  );
});

PingBadge.displayName = 'PingBadge';
