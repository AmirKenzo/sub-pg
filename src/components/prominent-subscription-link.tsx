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
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-4 sm:px-5">
          <h2 className="page-section-title flex items-center gap-2">
            <Link2 className="size-5 text-primary" />
            {t('config.title')}
          </h2>
        </div>

        <div className="flex items-center gap-3 bg-primary/5 px-4 py-3 sm:px-5">
          <span className="page-badge shrink-0 rounded-md bg-primary px-2 py-0.5 text-primary-foreground">
            SUB
          </span>
          <div className="page-item-title min-w-0 flex-1 truncate">
            {t('config.subscriptionLink')}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <button
              onClick={handleCopy}
              className={cn(
                'inline-flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted',
                isCopied(subscriptionUrl) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              title={t('qr.copy')}
            >
              {isCopied(subscriptionUrl) ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
            <button
              onClick={handleShowQR}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t('qr.show')}
            >
              <ScanQrCode className="size-4" />
            </button>
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

