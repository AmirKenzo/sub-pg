import { useState, memo, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Files, Download, Link2 } from 'lucide-react';
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card animate-fadeIn">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <h2 className="page-section-title flex items-center gap-2">
          <Link2 className="size-5 text-primary" />
          {t('config.title')}
        </h2>
        <button
          onClick={handleCopyAll}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            copyAllSuccess
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'text-foreground hover:bg-muted'
          )}
          title={copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}
        >
          {copyAllSuccess ? <Check className="size-4" /> : <Files className="size-4" />}
          {copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}
        </button>
      </div>

      <div className="max-h-[420px] flex-1 divide-y overflow-y-auto">
        {/* Subscription Link */}
        <div className="flex items-center gap-3 bg-primary/5 px-4 py-3 sm:px-5">
          <span className="page-badge shrink-0 rounded-md bg-primary px-2 py-0.5 text-primary-foreground">
            SUB
          </span>
          <div className="page-item-title min-w-0 flex-1 truncate">
            {t('config.subscriptionLink')}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <button
              onClick={handleCopySubscription}
              className={cn(iconButtonClass, isCopied(subscriptionUrl) && 'text-primary')}
              title={t('qr.copy')}
            >
              {isCopied(subscriptionUrl) ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
            <button
              onClick={() => handleShowQR({
                protocol: 'unknown',
                name: t('config.subscriptionLink'),
                emoji: '📱',
                raw: subscriptionUrl
              })}
              className={iconButtonClass}
              title={t('qr.show')}
            >
              <ScanQrCode className="size-4" />
            </button>
          </div>
        </div>

        {parsedLinks.map((link, index) => {
          const copied = isCopied(`${link.raw}:config`);

          return (
            <div
              key={index}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
            >
              {/* Protocol Badge */}
              <span className="page-badge min-w-11 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-center text-primary">
                {getProtocolBadge(link.protocol)}
              </span>

              {/* Name */}
              <div dir="ltr" className={cn('page-item-title flex min-w-0 flex-1 items-center gap-2', dir === 'rtl' ? 'justify-end text-right' : 'text-left')}>
                {link.emoji && <span className="shrink-0 text-sm">{link.emoji}</span>}
                <span className="truncate">{link.name}</span>
              </div>

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

