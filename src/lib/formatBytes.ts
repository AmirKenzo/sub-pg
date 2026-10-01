import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const UNITS: Record<string, string[]> = {
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
  fa: ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'],
};

/**
 * Format a byte count into a human-readable string.
 * Persian uses localized digits and full unit names (e.g. "۳۱٫۸۱ گیگابایت").
 */
export const formatBytes = (bytes: number | null | undefined, language: string = 'en'): string => {
  const isFa = language.startsWith('fa');
  const units = isFa ? UNITS.fa : UNITS.en;
  const locale = isFa ? 'fa-IR' : 'en-US';

  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) {
    return `${(0).toLocaleString(locale)} ${units[0]}`;
  }

  const k = 1024;
  const i = Math.min(Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0), units.length - 1);
  const value = bytes / Math.pow(k, i);

  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: i === 0 ? 0 : 2,
    maximumFractionDigits: i === 0 ? 0 : 2,
    useGrouping: false,
  });

  return `${formatted} ${units[i]}`;
};

/** Byte formatter bound to the active i18n language. */
export const useFormatBytes = () => {
  const { i18n } = useTranslation();
  const language = i18n.language || 'en';
  return useCallback((bytes: number | null | undefined) => formatBytes(bytes, language), [language]);
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Replace ASCII digits (and the list comma) with Persian equivalents when the language is Persian. */
export const localizeDigits = (value: string, language: string = 'en'): string => {
  if (!language.startsWith('fa')) return value;
  return value.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]).replace(/,\s/g, '، ');
};
