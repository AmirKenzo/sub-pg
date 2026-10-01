import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserInfo, useConfigData, useChartData, useSupportUrl } from '@/hooks/useUserData';
import { useLanguage } from '@/hooks/useLanguage';
import { Layout } from '@/components/layout';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OnlineBadge } from '@/components/online-badge';
import { TrafficChart } from '@/components/traffic-chart';
import { ConnectionLinks } from '@/components/connection-links';
import { ProminentSubscriptionLink } from '@/components/prominent-subscription-link';
import { AppsList } from '@/components/AppsList';
import { QuickConnect } from '@/components/quick-connect';
import { InstallAppButton } from '@/components/install-app-button';
import { formatRelativeExpiry, formatDate } from '@/lib/dateFormatter';
import { RefreshCcw, ExternalLink, Smartphone, AlertTriangle, Megaphone, Gauge, CalendarClock, Activity, Wifi, TrendingUp, RotateCcw, CalendarPlus } from 'lucide-react';
import { useFormatBytes, localizeDigits } from '@/lib/formatBytes';
import { useDir } from '@/hooks/useDir';
import { cn } from './lib/utils';
import type { UsageDataPoint } from '@/types/user';

const DAY_MS = 24 * 60 * 60 * 1000;
const FORECAST_WINDOW_DAYS = 7;
const EXPIRY_WARNING_DAYS = 3;
const LOW_DATA_WARNING_PERCENT = 10;

const FOOTER_GRID_COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

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
  const formatBytes = useFormatBytes();
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

  // Last 7 days of usage drive the daily average and the data forecast
  const [forecastStart] = useState(() => new Date(Date.now() - FORECAST_WINDOW_DAYS * DAY_MS));
  const { chartData: weeklyChartData } = useChartData(forecastStart, 'day', true);
  const { supportUrl } = useSupportUrl();

  const daysUntilExpiry = useMemo(() => {
    if (!effectiveData?.expire || effectiveData.status === 'on_hold') return null;
    const expireTime = new Date(effectiveData.expire).getTime();
    return Number.isFinite(expireTime) ? (expireTime - Date.now()) / DAY_MS : null;
  }, [effectiveData?.expire, effectiveData?.status]);

  const usageInsights = useMemo(() => {
    if (!effectiveData) return null;
    const points = getChartUsageData(weeklyChartData?.stats);
    if (points.length === 0) return null;

    const total = points.reduce((sum, point) => sum + (point.total_traffic || 0), 0);
    // Newer accounts haven't had a full week yet, so average over their actual age
    const createdAt = effectiveData.created_at ? new Date(effectiveData.created_at).getTime() : Number.NaN;
    const accountAgeDays = Number.isFinite(createdAt) ? (Date.now() - createdAt) / DAY_MS : FORECAST_WINDOW_DAYS;
    const dailyAverage = total / Math.min(FORECAST_WINDOW_DAYS, Math.max(1, accountAgeDays));

    const remaining = effectiveData.data_limit > 0
      ? Math.max(0, effectiveData.data_limit - (effectiveData.used_traffic || 0))
      : null;
    const daysUntilDataRunsOut = remaining !== null && dailyAverage > 0 ? remaining / dailyAverage : null;

    return { dailyAverage, daysUntilDataRunsOut };
  }, [effectiveData, weeklyChartData]);

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
    active: { text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10 ring-emerald-500/20', fill: 'bg-emerald-500', bar: 'from-emerald-400 to-emerald-500' },
    disabled: { text: 'text-muted-foreground', soft: 'bg-muted ring-border', fill: 'bg-muted-foreground', bar: 'from-muted-foreground/60 to-muted-foreground' },
    limited: { text: 'text-red-600 dark:text-red-400', soft: 'bg-red-500/10 ring-red-500/20', fill: 'bg-red-500', bar: 'from-red-400 to-red-500' },
    expired: { text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10 ring-amber-500/20', fill: 'bg-amber-500', bar: 'from-amber-400 to-amber-500' },
    on_hold: { text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10 ring-violet-500/20', fill: 'bg-violet-500', bar: 'from-violet-400 to-violet-500' },
  };

  // Show loading only if we have no data at all (not even initial data) and are still loading
  if (isLoading && !hasData) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="size-10 rounded-full border-[3px] border-muted border-t-primary animate-spin"></div>
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
          <div className="surface max-w-md space-y-3 p-8 text-center animate-fadeIn">
            <div className="icon-chip mx-auto size-12 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </div>
            <p className="text-lg font-semibold text-foreground">{t('dashboard.error')}</p>
            <p className="page-meta">{error.message}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!effectiveData) return null;

  const statusStyle = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.disabled;
  const hasDataLimit = !!effectiveData.data_limit && effectiveData.data_limit > 0;
  const usedTraffic = formatBytes(effectiveData.used_traffic || 0);
  const totalLimit = hasDataLimit ? formatBytes(effectiveData.data_limit) : t('userInfo.unlimited');
  const remainingTraffic = hasDataLimit
    ? formatBytes(Math.max(0, effectiveData.data_limit - (effectiveData.used_traffic || 0)))
    : '∞';
  const dateLocale = i18n.language === 'fa' ? 'fa-IR' : i18n.language;
  const usagePercentLabel = hasDataLimit
    ? `${Math.round(usagePercentage).toLocaleString(i18n.language === 'fa' ? 'fa-IR' : 'en-US')}%`
    : '∞';

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

  const numberLocale = i18n.language === 'fa' ? 'fa-IR' : 'en-US';
  const remainingPercent = 100 - usagePercentage;
  const isActive = normalizedStatus === 'active';
  const warnings: string[] = [];
  if (isActive && daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry < EXPIRY_WARNING_DAYS) {
    warnings.push(t('insights.expiringSoon', { days: EXPIRY_WARNING_DAYS.toLocaleString(numberLocale) }));
  }
  if (isActive && hasDataLimit && remainingPercent < LOW_DATA_WARNING_PERCENT) {
    warnings.push(t('insights.lowData', { percent: Math.max(0, Math.round(remainingPercent)).toLocaleString(numberLocale) }));
  }

  // Forecast sentence based on the recent daily average
  let forecastText: string | null = null;
  if (usageInsights?.daysUntilDataRunsOut != null) {
    forecastText = daysUntilExpiry !== null && usageInsights.daysUntilDataRunsOut >= daysUntilExpiry
      ? t('insights.forecastEnough')
      : t('insights.forecastRunsOut', { days: Math.max(1, Math.ceil(usageInsights.daysUntilDataRunsOut)).toLocaleString(numberLocale) });
  }

  const resetStrategy = effectiveData.data_limit_reset_strategy;
  const showResetStrategy = !!resetStrategy && resetStrategy !== 'no_reset';
  const nextPlan = effectiveData.next_plan;
  const nextPlanDays = nextPlan?.expire ? Math.round(nextPlan.expire / 86400) : 0;
  const nextPlanText = nextPlan
    ? [
        nextPlan.data_limit > 0 ? formatBytes(nextPlan.data_limit) : t('userInfo.unlimited'),
        nextPlanDays > 0 ? `${nextPlanDays.toLocaleString(numberLocale)} ${t(nextPlanDays === 1 ? 'time.day' : 'time.days')}` : null,
      ].filter(Boolean).join(' · ')
    : null;
  const footerItemCount = 2 + (showResetStrategy ? 1 : 0) + (nextPlanText ? 1 : 0);

  const hasLinks = !!configData?.links && configData.links.length > 0;
  const hasChartContainer = !chartError; // Always show chart container if no error (even during loading)
  const usageData = getChartUsageData(chartData?.stats);
  const isChartLoading = !chartError && !chartData;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-6 sm:space-y-6 sm:px-6 sm:pt-10">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 animate-fadeIn">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-lg font-bold uppercase text-primary-foreground shadow-lg shadow-primary/20">
              {effectiveData.username?.charAt(0) || '?'}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h1
                  dir="ltr"
                  title={effectiveData.username}
                  className="max-w-[45vw] truncate text-lg font-bold tracking-tight text-foreground sm:max-w-sm sm:text-xl"
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
                  className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
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
            <InstallAppButton username={effectiveData.username} />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Account warnings */}
        {warnings.length > 0 && (
          <div className="flex items-start gap-3.5 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 animate-fadeIn">
            <span className="icon-chip size-9 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              {warnings.map((warning) => (
                <p key={warning} className="text-sm font-semibold text-foreground">{warning}</p>
              ))}
              <p className="text-sm text-muted-foreground">
                {t('insights.renewHint')}
                {supportUrl && (
                  <>
                    {' '}
                    <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      {t('userInfo.supportUrl')}
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Announcements */}
        {hasAnnouncement && (
          <div className="surface flex items-start gap-3.5 p-4 sm:p-5 animate-fadeIn">
            <span className="icon-chip size-9">
              <Megaphone className="size-4.5" />
            </span>
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

        {/* Account overview */}
        <section className="surface overflow-hidden animate-fadeIn">
          <div className="grid md:grid-cols-[1.6fr_1fr]">
            {/* Data usage */}
            <div className="p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="icon-chip size-9">
                    <Gauge className="size-4.5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">{t('userInfo.usedTraffic')}</span>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', statusStyle.soft, statusStyle.text)}>
                  <span className={cn('size-1.5 rounded-full', statusStyle.fill, normalizedStatus === 'active' && 'animate-pulse')} />
                  {t(`status.${normalizedStatus}`)}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span dir="auto" className="text-4xl font-bold tracking-tight text-foreground tabular-nums sm:text-5xl">
                  {usedTraffic}
                </span>
                <span className="text-sm font-medium text-muted-foreground sm:text-base">
                  / <span dir="auto">{totalLimit}</span>
                </span>
              </div>

              <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-1000 ease-out rtl:bg-gradient-to-l', statusStyle.bar)}
                  style={{ width: `${hasDataLimit ? Math.max(usagePercentage, usagePercentage > 0 ? 2 : 0) : 0}%` }}
                />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <MiniStat label={t('userInfo.used')} value={usagePercentLabel} />
                <MiniStat label={t('remaining')} value={remainingTraffic} accent />
                <MiniStat label={t('userInfo.totalLimit')} value={totalLimit} />
              </div>

              {usageInsights && (
                <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>
                    {t('insights.dailyAverage')}:{' '}
                    <span dir="auto" className="font-semibold text-foreground">{formatBytes(usageInsights.dailyAverage)}</span>
                    {forecastText && <span> · {forecastText}</span>}
                  </p>
                </div>
              )}
            </div>

            {/* Time */}
            <div className="flex flex-col border-t bg-muted/40 p-5 sm:p-7 md:border-t-0 md:border-s">
              <div className="flex items-center gap-2.5">
                <span className="icon-chip size-9">
                  <CalendarClock className="size-4.5" />
                </span>
                <span className={cn('text-sm font-medium text-muted-foreground', expiryInfo.isExpired && 'text-destructive')}>
                  {expiryInfo.status}
                </span>
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight sm:mt-6 text-foreground sm:text-3xl">{localizeDigits(expiryInfo.time, i18n.language)}</p>
              <div className="mt-auto pt-4 sm:pt-6">
                <p className="text-xs font-medium text-muted-foreground">
                  {effectiveData.status === 'on_hold' ? t('userInfo.duration') : t('userInfo.expiryDate')}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  <span dir={effectiveData.status === 'on_hold' ? dir : 'ltr'}>{localizeDigits(renderExpiryValue(), i18n.language)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Footer strip */}
          <div className={cn('grid grid-cols-2 gap-px border-t bg-border', FOOTER_GRID_COLUMNS[footerItemCount])}>
            <FooterStat icon={<Activity className="size-4" />} label={t('userInfo.lifetimeTraffic')}>
              <span dir="auto">{formatBytes(effectiveData.lifetime_used_traffic || 0)}</span>
            </FooterStat>
            <FooterStat icon={<Wifi className="size-4" />} label={t('userInfo.lastOnline')}>
              <span dir="ltr">
                {effectiveData.online_at ? localizeDigits(formatDate(effectiveData.online_at, dateLocale), i18n.language) : t('notConnectedYet')}
              </span>
            </FooterStat>
            {showResetStrategy && (
              <FooterStat icon={<RotateCcw className="size-4" />} label={t('insights.resetStrategy')}>
                {t(`insights.reset.${resetStrategy}`, { defaultValue: resetStrategy })}
              </FooterStat>
            )}
            {nextPlanText && (
              <FooterStat icon={<CalendarPlus className="size-4" />} label={t('insights.nextPlan')}>
                <span dir="auto">{nextPlanText}</span>
              </FooterStat>
            )}
          </div>
        </section>

        <QuickConnect />

        {/* Links & usage chart */}
        {(hasLinks || hasChartContainer) && (
          <div className={cn('grid w-full grid-cols-1 gap-5 sm:gap-6', hasLinks && hasChartContainer && 'lg:grid-cols-2')}>
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
        <section id="apps" className="scroll-mt-6 space-y-4 pt-2 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip size-9">
              <Smartphone className="size-4.5" />
            </span>
            <h2 className="page-section-title">{t('apps.title')}</h2>
          </div>
          <AppsList />
        </section>
      </div>
    </Layout>
  );
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/60 px-3 py-2.5">
      <p className="text-xs leading-tight text-muted-foreground">{label}</p>
      <p
        dir="auto"
        className={cn(
          'mt-1 break-words text-sm font-semibold leading-snug tabular-nums sm:text-base',
          accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FooterStat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card px-5 py-4 sm:px-7">
      <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:inline-flex">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{children}</p>
      </div>
    </div>
  );
}

export default App;
