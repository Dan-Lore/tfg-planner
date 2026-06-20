import { TICKS_PER_SECOND } from '@/calculator/flow-solver';

export function formatRecipeDuration(ticks: number, lang: 'ru' | 'en'): string {
  const sec = ticks / TICKS_PER_SECOND;
  if (sec < 1) {
    return lang === 'ru' ? `${ticks} тик` : `${ticks} t`;
  }
  if (sec < 60) {
    const s = Number.isInteger(sec) ? sec : Math.round(sec * 10) / 10;
    return lang === 'ru' ? `${s} с` : `${s}s`;
  }
  if (sec < 3600) {
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    if (rem === 0) return lang === 'ru' ? `${min} мин` : `${min}m`;
    return lang === 'ru' ? `${min} мин ${rem} с` : `${min}m ${rem}s`;
  }
  const h = Math.floor(sec / 3600);
  const min = Math.round((sec % 3600) / 60);
  if (min === 0) return lang === 'ru' ? `${h} ч` : `${h}h`;
  return lang === 'ru' ? `${h} ч ${min} мин` : `${h}h ${min}m`;
}
