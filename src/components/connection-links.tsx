import { useState, memo, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Files, Download, Link2, Zap, Loader2, Search, Rocket, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { parseLinks, isInfoLink, getCountryCode, type ParsedLink } from '@/lib/linkParser';
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

type ViewMode = 'all' | 'country' | 'fastest';
type PingState = PingResult | 'pending';

const getLatency = (state: PingState | undefined): number =>
  state && state !== 'pending' && state.status === 'ok' ? state.latency : Number.POSITIVE_INFINITY;

const getCountryName = (code: string, language: string): string => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const ConnectionLinks = memo(({ links }: ConnectionLinksProps) => {
  const { t, i18n } = useTranslation();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [selectedLink, setSelectedLink] = useState<ParsedLink | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const copyAllTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Memoize parsed links to avoid re-parsing on every render
  const parsedLinks = useMemo(() => parseLinks(links), [links]);
  // Informational entries (usage/expiry notes) are already shown in the overview card
  const serverLinks = useMemo(() => parsedLinks.filter((link) => !isInfoLink(link)), [parsedLinks]);

  // Ping results keyed by "host:port" so configs sharing a server are probed once
  const [pingResults, setPingResults] = useState<Record<string, PingState>>({});
  const [isPinging, setIsPinging] = useState(false);
  const hasPingResults = Object.keys(pingResults).length > 0;

  const handlePingAll = useCallback(async () => {
    if (isPinging) return;

    const targets = Array.from(
      new Set(serverLinks.map(getPingTarget).filter((target): target is string => !!target))
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
  }, [isPinging, serverLinks]);

  const getPing = useCallback((link: ParsedLink): PingState | undefined => {
    const target = getPingTarget(link);
    return target ? pingResults[target] : undefined;
  }, [pingResults]);

  const filteredLinks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return serverLinks;

    return serverLinks.filter((link) => {
      const code = getCountryCode(link);
      const haystack = [
        link.name,
        link.protocol,
        link.server ?? '',
        code ?? '',
        code ? getCountryName(code, i18n.language) : '',
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [serverLinks, query, i18n.language]);

  const sortedByLatency = useMemo(
    () => [...filteredLinks].sort((a, b) => getLatency(getPing(a)) - getLatency(getPing(b))),
    [filteredLinks, getPing]
  );

  const countryGroups = useMemo(() => {
    const groups = new Map<string, ParsedLink[]>();
    filteredLinks.forEach((link) => {
      const code = getCountryCode(link) ?? '';
      groups.set(code, [...(groups.get(code) ?? []), link]);
    });
    // Known countries first (by size), unknown ones at the end
    return Array.from(groups.entries()).sort(([a, la], [b, lb]) => {
      if (!a) return 1;
      if (!b) return -1;
      return lb.length - la.length;
    });
  }, [filteredLinks]);

  const fastestLink = useMemo(() => {
    const best = [...serverLinks].sort((a, b) => getLatency(getPing(a)) - getLatency(getPing(b)))[0];
    return best && Number.isFinite(getLatency(getPing(best))) ? best : null;
  }, [serverLinks, getPing]);

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

  const handleCopyFastest = useCallback(() => {
    if (!fastestLink) return;
    handleCopy(fastestLink);
    toast.success(`${t('linksView.copyFastest')}: ${fastestLink.name}`);
  }, [fastestLink, handleCopy, t]);

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

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    // Sorting by speed needs results, so start a test automatically
    if (mode === 'fastest' && !hasPingResults) {
      void handlePingAll();
    }
  }, [hasPingResults, handlePingAll]);

  const renderRow = (link: ParsedLink, index: number) => (
    <ConfigRow
      key={`${link.raw}-${index}`}
      link={link}
      ping={getPing(link)}
      showPing={hasPingResults}
      copied={isCopied(`${link.raw}:config`)}
      onCopy={handleCopy}
      onShowQR={handleShowQR}
      onDownloadWireGuard={handleDownloadWireGuard}
    />
  );

  const viewModes: Array<{ value: ViewMode; label: string }> = [
    { value: 'all', label: t('linksView.all') },
    { value: 'country', label: t('linksView.byCountry') },
    { value: 'fastest', label: t('linksView.fastest') },
  ];

  return (
    <div className="surface flex h-full flex-col overflow-hidden animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="icon-chip size-9">
            <Link2 className="size-4.5" />
          </span>
          <h2 className="page-section-title whitespace-nowrap">{t('config.title')}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
            {serverLinks.length}
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

      {/* Search & view controls */}
      <div className="space-y-2.5 px-5 pt-4 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('linksView.searchPlaceholder')}
            className="h-10 w-full rounded-xl border bg-muted/40 ps-9 pe-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-xl bg-muted p-1">
            {viewModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => handleViewModeChange(mode.value)}
                className={cn(
                  'flex-1 cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-all sm:text-sm',
                  viewMode === mode.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {fastestLink && (
            <button
              onClick={handleCopyFastest}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/20 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400"
            >
              {isCopied(`${fastestLink.raw}:config`) ? <Check className="size-4" /> : <Rocket className="size-4" />}
              {t('linksView.copyFastest')}
            </button>
          )}
        </div>
        {viewMode === 'fastest' && isPinging && (
          <p className="text-xs text-muted-foreground">{t('linksView.pingFirst')}</p>
        )}
      </div>

      {/* Config list */}
      <div className="mt-3 max-h-[420px] flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {filteredLinks.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('linksView.noResults')}</p>
        ) : viewMode === 'country' ? (
          <div className="space-y-3">
            {countryGroups.map(([code, groupLinks]) => (
              <div key={code || 'other'}>
                <div className="sticky top-0 z-[1] flex items-center gap-2 bg-card/95 px-2 py-1.5 backdrop-blur">
                  {code && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">{code}</span>
                  )}
                  <span className="text-xs font-semibold text-foreground">
                    {code ? getCountryName(code, i18n.language) : t('linksView.otherCountry')}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">({groupLinks.length})</span>
                </div>
                <div className="space-y-1">{groupLinks.map(renderRow)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {(viewMode === 'fastest' ? sortedByLatency : filteredLinks).map(renderRow)}
          </div>
        )}
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

interface ConfigRowProps {
  link: ParsedLink;
  ping: PingState | undefined;
  showPing: boolean;
  copied: boolean;
  onCopy: (link: ParsedLink) => void;
  onShowQR: (link: ParsedLink) => void;
  onDownloadWireGuard: (link: ParsedLink) => void;
}

const iconButtonClass = 'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground';

const getProtocolBadge = (protocol: ParsedLink['protocol']): string => {
  if (protocol === 'unknown') return 'SUB';
  if (protocol === 'shadowsocks') return 'SS';
  if (protocol === 'wireguard') return 'WG';
  if (protocol === 'hysteria') return 'HY2';
  return protocol;
};

const ConfigRow = memo(({ link, ping, showPing, copied, onCopy, onShowQR, onDownloadWireGuard }: ConfigRowProps) => {
  const { t } = useTranslation();
  const dir = useDir();
  const hasWireGuardPayload = useMemo(() => !!getWireGuardDownloadPayload(link.raw), [link.raw]);

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70">
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
      {showPing && <PingBadge result={ping ?? { status: 'unavailable' }} />}

      {/* Action Buttons */}
      <div className="flex shrink-0 gap-0.5">
        {hasWireGuardPayload && (
          <button
            onClick={() => onDownloadWireGuard(link)}
            className={iconButtonClass}
            title={t('configActions.downloadWireGuard')}
          >
            <Download className="size-4" />
          </button>
        )}
        <button
          onClick={() => onCopy(link)}
          className={cn(iconButtonClass, copied && 'text-primary')}
          title={link.protocol === 'unknown' ? t('qr.copy') : t('configActions.copyConfig')}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
        <button
          onClick={() => onShowQR(link)}
          className={iconButtonClass}
          title={t('qr.show')}
        >
          <ScanQrCode className="size-4" />
        </button>
      </div>
    </div>
  );
});

ConfigRow.displayName = 'ConfigRow';

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

const PingBadge = memo(({ result }: { result: PingState }) => {
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
