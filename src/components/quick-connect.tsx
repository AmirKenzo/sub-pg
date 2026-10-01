import { memo, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download, DownloadCloud, Power, Sparkles } from 'lucide-react';
import { useApps } from '@/hooks/useUserData';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { detectOS, mapOSToPlatform } from '@/lib/osDetector';
import { cn } from '@/lib/utils';
import type { AppClient } from '@/types/user';

const getLanguageKey = (language: string | undefined): string => {
  if (language?.startsWith('fa')) return 'fa';
  if (language?.startsWith('ru')) return 'ru';
  if (language?.startsWith('zh')) return 'zh';
  return 'en';
};

// Prefer recommended apps that support one-tap import
const rankApp = (app: AppClient): number => (app.recommended ? 2 : 0) + (app.import_url ? 1 : 0);

export const QuickConnect = memo(function QuickConnect() {
  const { t, i18n } = useTranslation();
  const { apps } = useApps();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const platform = useMemo(() => mapOSToPlatform(detectOS()), []);
  const subscriptionUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname.replace(/\/info$/, '')}`,
    []
  );

  const platformApps = useMemo(
    () =>
      (apps ?? [])
        .filter((app) => (app.platform || 'other').toLowerCase() === platform)
        .sort((a, b) => rankApp(b) - rankApp(a)),
    [apps, platform]
  );

  const selectedApp = platformApps.find((app) => app.name === selectedName) ?? platformApps[0];
  const languageKey = getLanguageKey(i18n.language);

  const downloadLinks = useMemo(() => {
    const all = selectedApp?.download_links ?? [];
    const forLanguage = all.filter((link) => link.language === languageKey);
    const forEnglish = all.filter((link) => link.language === 'en');
    return forLanguage.length > 0 ? forLanguage : forEnglish.length > 0 ? forEnglish : all;
  }, [selectedApp, languageKey]);

  const copied = isCopied(subscriptionUrl);

  return (
    <section className="surface p-5 sm:p-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip size-9">
            <Sparkles className="size-4.5" />
          </span>
          <div>
            <h2 className="page-section-title">{t('quickConnect.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('quickConnect.subtitle')}</p>
          </div>
        </div>

        {platformApps.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {platformApps.map((app) => (
              <button
                key={app.name}
                onClick={() => setSelectedName(app.name)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  app.name === selectedApp?.name
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {app.icon_url && <img src={app.icon_url} alt="" className="size-4 rounded" />}
                {app.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {/* Step 1: install */}
        <Step number={1} title={t('quickConnect.step1')}>
          {selectedApp ? (
            <div className="flex flex-wrap gap-1.5">
              {downloadLinks.map((link) => (
                <a
                  key={`${link.name}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Download className="size-3.5" />
                  {link.name}
                </a>
              ))}
            </div>
          ) : (
            <a href="#apps" className="text-xs font-medium text-primary hover:underline">
              {t('quickConnect.otherApps')}
            </a>
          )}
        </Step>

        {/* Step 2: add subscription */}
        <Step number={2} title={t('quickConnect.step2')}>
          <div className="flex flex-wrap gap-1.5">
            {selectedApp?.import_url && (
              <a
                href={selectedApp.import_url}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <DownloadCloud className="size-3.5" />
                {t('quickConnect.addTo', { app: selectedApp.name })}
              </a>
            )}
            <button
              onClick={() => copyToClipboard(subscriptionUrl, subscriptionUrl)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                copied ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-muted'
              )}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {t('quickConnect.copyLink')}
            </button>
          </div>
        </Step>

        {/* Step 3: connect */}
        <Step number={3} title={t('quickConnect.step3')}>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Power className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            {t('quickConnect.step3Hint')}
          </p>
        </Step>
      </ol>
    </section>
  );
});

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  const { i18n } = useTranslation();

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {number.toLocaleString(i18n.language?.startsWith('fa') ? 'fa-IR' : 'en-US')}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </li>
  );
}
