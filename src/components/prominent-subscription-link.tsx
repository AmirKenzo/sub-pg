import { useState, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Link2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { QRModal } from '@/components/qr-modal';
import { cn } from '@/lib/utils';
import type { ParsedLink } from '@/lib/linkParser';

interface ProminentSubscriptionLinkProps {
  hasChart?: boolean;
}

export const ProminentSubscriptionLink = memo(({ hasChart }: ProminentSubscriptionLinkProps) => {
  const { t } = useTranslation();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  
  const subscriptionUrl = useMemo(() => 
    `${window.location.origin}${window.location.pathname.replace(/\/info$/, '')}`, 
    []
  );

  const handleCopy = useCallback(() => {
    copyToClipboard(subscriptionUrl, subscriptionUrl);
  }, [copyToClipboard, subscriptionUrl]);

  const handleShowQR = useCallback(() => {
    setQrModalOpen(true);
  }, []);

  const subscriptionLinkData = useMemo<ParsedLink>(() => ({
    protocol: 'unknown',
    name: t('config.subscriptionLink'),
    emoji: '📱',
    raw: subscriptionUrl
  }), [subscriptionUrl, t]);

  return (
    <div className={cn(
      "animate-fadeIn",
      hasChart ? 'order-2 lg:order-1' : ''
    )}>
      <div className="surface overflow-hidden p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip size-9">
            <Link2 className="size-4.5" />
          </span>
          <h2 className="page-section-title">{t('config.title')}</h2>
        </div>

        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{t('config.subscriptionLink')}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={handleShowQR}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:bg-muted"
                title={t('qr.show')}
              >
                <ScanQrCode className="size-4" />
              </button>
              <button
                onClick={handleCopy}
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

      <QRModal
        link={subscriptionLinkData}
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
      />
    </div>
  );
});

ProminentSubscriptionLink.displayName = 'ProminentSubscriptionLink';

