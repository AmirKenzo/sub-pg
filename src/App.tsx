import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserInfo, useConfigData, useChartData } from '@/hooks/useUserData';
import { useLanguage } from '@/hooks/useLanguage';
import { Layout } from '@/components/layout';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OnlineBadge } from '@/components/online-badge';
import { TrafficChart } from '@/components/traffic-chart';
import { ConnectionLinks } from '@/components/connection-links';
import { ProminentSubscriptionLink } from '@/components/prominent-subscription-link';
import { AppsList } from '@/components/AppsList';
import { formatRelativeExpiry, formatDate } from '@/lib/dateFormatter';
import { RefreshCcw, Bell, ExternalLink, Smartphone } from 'lucide-react';
import { useDir } from '@/hooks/useDir';
import { cn } from './lib/utils';
import type { UsageDataPoint } from '@/types/user';

const isUsageDataSeries = (value: unknown): value is UsageDataPoint[] => Array.isArray(value);

const getChartUsageData = (stats: unknown): UsageDataPoint[] => {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return [];
  }

  return Object.values(stats).find(isUsageDataSeries) ?? [];
};

function App() {
  const { t, i18n } = useTranslation();
  useLanguage();
  const [timeRange, setTimeRange] = useState('7d');



  const { startTime, period } = useMemo(() => {
    const now = new Date();
    const start = new Date();
    let selectedPeriod = 'hour';

    switch (timeRange) {
      case "1h":
        start.setTime(now.getTime() - 1 * 60 * 60 * 1000);
        selectedPeriod = 'minute';
        break;
      case "12h":
        start.setTime(now.getTime() - 12 * 60 * 60 * 1000);
        selectedPeriod = 'hour';
        break;
      case "24h":
        start.setTime(now.getTime() - 24 * 60 * 60 * 1000);
        selectedPeriod = 'hour';
        break;
      case "7d":
        start.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        selectedPeriod = 'day';
        break;
      case "30d":
        start.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        selectedPeriod = 'day';
        break;
      case "90d":
        start.setTime(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        selectedPeriod = 'day';
        break;
      default:
        start.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        selectedPeriod = 'day';
    }

    return { startTime: start, period: selectedPeriod };
  }, [timeRange]);

  const { data, headers, error, isLoading, isValidating, refresh } = useUserInfo();
  const { data: configData } = useConfigData();

  // Check if we have initial/fallback data to use even if there's an error
  const hasInitialData = typeof window !== 'undefined' && window.__INITIAL_DATA__?.user;
  const hasData = data || hasInitialData;
  const effectiveData = data || (hasInitialData ? window.__INITIAL_DATA__?.user : undefined);

  // Get raw announce header value
  const rawAnnounceHeader = useMemo(() => {
    if (!headers) return null;
    return headers.announce ?? null;
  }, [headers]);

  // Decode announcement message (can be URL-encoded or base64)
  const announcementMessage = useMemo(() => {
    if (!rawAnnounceHeader || typeof rawAnnounceHeader !== 'string') return null;

    const announce = rawAnnounceHeader;

    // Check if it's base64 encoded (format: "base64:...")
    if (announce.startsWith('base64:')) {
      try {
        const base64Data = announce.substring(7).trim(); // Remove "base64:" prefix and trim whitespace
        if (!base64Data) return null;

        // Decode base64
        const decoded = decodeURIComponent(escape(atob(base64Data)));
        return decoded;
      } catch (error) {
        console.warn('Failed to decode base64 announcement:', error, 'Raw value:', announce);
        // If decoding fails, return the original value without the prefix
        return announce.substring(7);
      }
    }

    // Otherwise, try URL decoding
    try {
      return decodeURIComponent(announce);
    } catch {
      return announce;
    }
  }, [rawAnnounceHeader]);

  const announceUrl = useMemo(() => {
    const url = headers?.['announce-url'];
    return typeof url === 'string' && url.trim().length > 0 ? url : null;
  }, [headers]);

  const hasAnnouncement = useMemo(() => {
    const hasMessage = typeof announcementMessage === 'string' && announcementMessage.trim().length > 0;
    return hasMessage || !!announceUrl;
  }, [announcementMessage, announceUrl]);

  // Fetch chart data independently - don't wait for user info
  const { chartData, chartError } = useChartData(startTime, period, true);
  const dir = useDir();
  const normalizedStatus = useMemo(() => {
    if (!effectiveData?.status) return 'active';
    const status = String(effectiveData.status).toLowerCase();
    const validStatuses = ['active', 'disabled', 'limited', 'expired', 'on_hold'];
    return validStatuses.includes(status) ? status : 'active';
  }, [effectiveData?.status]);


  // Calculate usage percentage
  const usagePercentage = useMemo(() => {
    if (!effectiveData || !effectiveData.data_limit || effectiveData.data_limit === 0 || !effectiveData.used_traffic) return 0;
    const percentage = (effectiveData.used_traffic / effectiveData.data_limit) * 100;
    return Math.min(isNaN(percentage) ? 0 : percentage, 100);
  }, [effectiveData]);

  // Calculate expiry information
  const expiryInfo = useMemo(() => {
    if (!effectiveData) return { status: '', time: '', isExpired: false };

    // For on_hold status, show available duration instead of expiry
    if (effectiveData.status === 'on_hold') {
      if (!effectiveData.on_hold_expire_duration || effectiveData.on_hold_expire_duration === 0) {
        return {
          status: t('userInfo.available'),
          time: t('userInfo.noTimeLimit'),
          isExpired: false
        };
      }

      const days = Math.floor(effectiveData.on_hold_expire_duration / 86400); // Convert seconds to days
      const hours = Math.floor((effectiveData.on_hold_expire_duration % 86400) / 3600);

      let timeText = '';
      if (days > 0) {
        timeText = `${days} ${t(days === 1 ? 'time.day' : 'time.days')}`;
        if (hours > 0 && days < 30) {
          timeText += ` ${hours} ${t(hours === 1 ? 'time.hour' : 'time.hours')}`;
        }
      } else if (hours > 0) {
        timeText = `${hours} ${t(hours === 1 ? 'time.hour' : 'time.hours')}`;
      }

      return {
        status: t('userInfo.available'),
        time: timeText,
        isExpired: false
      };
    }

    return formatRelativeExpiry(effectiveData.expire, t);
  }, [effectiveData, t]);

  // Status color mapping
  const statusConfig = {
    active: { text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10', fill: 'bg-emerald-500' },
    disabled: { text: 'text-muted-foreground', soft: 'bg-muted', fill: 'bg-muted-foreground' },
    limited: { text: 'text-red-600 dark:text-red-400', soft: 'bg-red-500/10', fill: 'bg-red-500' },
    expired: { text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10', fill: 'bg-amber-500' },
    on_hold: { text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10', fill: 'bg-violet-500' },
  };


  // Format bytes to human-readable
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0 || i >= sizes.length) return '0 B';
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

  // Show loading only if we have no data at all (not even initial data) and are still loading
  if (isLoading && !hasData) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-10 h-10 border-[3px] border-muted border-t-primary rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  // Only show error page if we have no data at all (not even initial/fallback) and we're not loading/retrying
  // If we have data (even from initial/fallback), continue showing it and retry in background
  if (error && !hasData && !isLoading && !isValidating) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="text-center space-y-3 animate-fadeIn p-8 rounded-2xl bg-card border max-w-md">
            <p className="text-lg font-semibold text-destructive">{t('dashboard.error')}</p>
            <p className="page-meta">{error.message}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!effectiveData) return null;

  const statusStyle = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.disabled;
  const hasDataLimit = !!effectiveData.data_limit && effectiveData.data_limit > 0;
  const remainingTraffic = !hasDataLimit
    ? '∞'
    : formatBytes(Math.max(0, effectiveData.data_limit! - (effectiveData.used_traffic || 0)));
  const dateLocale = i18n.language === 'fa' ? 'fa-IR' : i18n.language;

  // Expiry date for regular users, available duration for on_hold users
  const renderExpiryValue = () => {
    if (effectiveData.status === 'on_hold') {
      if (!effectiveData.on_hold_expire_duration || effectiveData.on_hold_expire_duration === 0) {
        return t('userInfo.noTimeLimit');
      }

      const days = Math.floor(effectiveData.on_hold_expire_duration / 86400);
      const hours = Math.floor((effectiveData.on_hold_expire_duration % 86400) / 3600);

      return days > 0
        ? `${days} ${t(days === 1 ? 'time.day' : 'time.days')}`
        : hours > 0
          ? `${hours} ${t(hours === 1 ? 'time.hour' : 'time.hours')}`
          : t('userInfo.noTimeLimit');
    }

    const isUnlimited = !effectiveData.expire || effectiveData.expire === '0' || effectiveData.expire === '';
    return isUnlimited ? t('userInfo.noTimeLimit') : formatDate(effectiveData.expire, dateLocale);
  };

  const hasLinks = !!configData?.links && configData.links.length > 0;
  const hasChartContainer = !chartError; // Always show chart container if no error (even during loading)
  const usageData = getChartUsageData(chartData?.stats);
  const isChartLoading = !chartError && !chartData;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:pt-10 space-y-5 sm:space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 animate-fadeIn">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold uppercase text-primary">
              {effectiveData.username?.charAt(0) || '?'}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1
                  dir="ltr"
                  title={effectiveData.username}
                  className="truncate text-lg font-semibold text-foreground sm:text-xl max-w-[45vw] sm:max-w-sm"
                >
                  {effectiveData.username}
                </h1>
                <button
                  onClick={() => {
                    if (!isValidating && normalizedStatus !== 'disabled') {
                      refresh();
                    }
                  }}
                  disabled={isValidating || normalizedStatus === 'disabled'}
                  className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                  title={normalizedStatus === 'disabled' ? 'Account disabled' : 'Refresh data'}
                  aria-label={normalizedStatus === 'disabled' ? 'Account disabled' : 'Refresh data'}
                >
                  <RefreshCcw className={cn('size-3.5', isValidating && 'animate-spin text-primary')} />
                </button>
              </div>
              <OnlineBadge lastOnline={effectiveData.online_at} showText />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Announcements */}
        {hasAnnouncement && (
          <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 animate-fadeIn">
            <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-semibold text-foreground">{t('userInfo.announcement')}</div>
              {announcementMessage && (
                <p className="page-meta whitespace-pre-wrap break-words">{announcementMessage}</p>
              )}
              {announceUrl && (
                <a
                  href={announceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t('userInfo.viewAnnouncement')}
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Status & usage */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6 animate-fadeIn">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-4">
              <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold', statusStyle.soft, statusStyle.text)}>
                <span className={cn('size-1.5 rounded-full', statusStyle.fill, normalizedStatus === 'active' && 'animate-pulse')} />
                {t(`status.${normalizedStatus}`)}
              </span>
              <div>
                <p className="page-label">{t('userInfo.usedTraffic')}</p>
                <div dir="ltr" className={cn('mt-1 flex items-baseline gap-2', dir === 'rtl' && 'justify-end')}>
                  <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums sm:text-4xl">
                    {formatBytes(effectiveData.used_traffic || 0)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground sm:text-base">
                    / {hasDataLimit ? formatBytes(effectiveData.data_limit!) : t('userInfo.unlimited')}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-start sm:text-end">
              <p className={cn('page-label', expiryInfo.isExpired && 'text-destructive')}>{expiryInfo.status}</p>
              <p className="mt-1 text-lg font-semibold text-foreground sm:text-xl">{expiryInfo.time}</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all duration-1000 ease-out', statusStyle.fill)}
                style={{ width: `${hasDataLimit ? usagePercentage : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <span dir="ltr" className="font-semibold text-foreground tabular-nums">
                  {hasDataLimit ? `${usagePercentage.toFixed(0)}%` : '∞'}
                </span>{' '}
                {t('userInfo.used')}
              </span>
              <span className="text-muted-foreground">
                {t('remaining')}:{' '}
                <span dir="ltr" className="font-semibold text-foreground tabular-nums">{remainingTraffic}</span>
              </span>
            </div>
          </div>
        </section>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 animate-fadeIn">
          <StatTile label={t('userInfo.lifetimeTraffic')}>
            <span dir="ltr">{formatBytes(effectiveData.lifetime_used_traffic || 0)}</span>
          </StatTile>
          <StatTile label={effectiveData.status === 'on_hold' ? t('userInfo.duration') : t('userInfo.expiryDate')}>
            <span dir={effectiveData.status === 'on_hold' ? dir : 'ltr'}>{renderExpiryValue()}</span>
          </StatTile>
          <StatTile label={t('userInfo.lastOnline')} className="col-span-2 sm:col-span-1">
            <span dir="ltr" className="inline-flex items-center gap-2">
              <OnlineBadge lastOnline={effectiveData.online_at} />
              {effectiveData.online_at ? formatDate(effectiveData.online_at, dateLocale) : t('notConnectedYet')}
            </span>
          </StatTile>
        </div>

        {/* Links & usage chart */}
        {(hasLinks || hasChartContainer) && (
          <div className={cn('grid grid-cols-1 gap-5 sm:gap-6 w-full', hasLinks && hasChartContainer && 'lg:grid-cols-2')}>
            {hasLinks ? (
              <div className={cn('min-w-0', hasChartContainer && 'order-2 lg:order-1')}>
                <ConnectionLinks links={configData.links} />
              </div>
            ) : (
              <ProminentSubscriptionLink hasChart={hasChartContainer} />
            )}

            {hasChartContainer && (
              <div className={cn('min-w-0 w-full animate-fadeIn', hasLinks && 'order-1 lg:order-2')}>
                <TrafficChart
                  data={usageData}
                  isLoading={isChartLoading}
                  error={chartError}
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                />
              </div>
            )}
          </div>
        )}

        {/* Apps */}
        <section className="space-y-3 pt-2 animate-fadeIn">
          <h2 className="page-section-title flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            {t('apps.title')}
          </h2>
          <AppsList />
        </section>
      </div>
    </Layout>
  );
}

function StatTile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-4 sm:p-5', className)}>
      <p className="page-label">{label}</p>
      <div className="mt-1.5 text-base font-semibold text-foreground break-words">{children}</div>
    </div>
  );
}

export default App;
