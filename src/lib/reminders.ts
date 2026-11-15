import type { Reminder, ReminderKind, ShowEvent } from './types';

export function makeId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function formatPrice(min: number, max: number): string {
  return `¥${min}–${max}`;
}

/** Four required fields for every onsale alert. */
export function reminderDetails(event: ShowEvent): string {
  const sale = event.onsaleAt ? formatWhen(event.onsaleAt) : '待公布';
  const link = event.ticketUrl ?? '购票链接待公布';
  return [
    `开票时间 ${sale}`,
    `场馆 ${event.venue}`,
    `票价 ${formatPrice(event.priceMin, event.priceMax)}`,
    `购票 ${link}`,
  ].join('\n');
}

export function reminderDetailsOneLine(event: ShowEvent): string {
  return reminderDetails(event).replace(/\n/g, ' · ');
}

/**
 * Day-before: exactly 24h before onsale.
 * Drop nudge: 5 minutes before onsale.
 */
export function defaultFireAt(event: ShowEvent, kind: ReminderKind, now = new Date()): string {
  if ((kind === 'onsale_day_before' || kind === 'onsale') && event.onsaleAt) {
    const onsale = new Date(event.onsaleAt);
    if (kind === 'onsale_day_before') {
      const t = new Date(onsale.getTime() - 24 * 3600_000);
      // Missed the day-before window → catch up immediately.
      return (t.getTime() < now.getTime() ? now : t).toISOString();
    }
    const t = new Date(onsale.getTime() - 5 * 60_000);
    return (t.getTime() < now.getTime() ? now : t).toISOString();
  }
  if (kind === 'show') {
    const t = new Date(event.startsAt);
    t.setHours(t.getHours() - 3);
    return t.toISOString();
  }
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setMinutes(0, 0, 0);
  return t.toISOString();
}

export function reminderLabel(event: ShowEvent, kind: ReminderKind): string {
  if (kind === 'onsale_day_before') return `开票前一天 · ${event.title}`;
  if (kind === 'onsale') return `开票前 5 分钟 · ${event.title}`;
  if (kind === 'show') return `开演提醒 · ${event.title}`;
  return `自定义提醒 · ${event.title}`;
}

export function kindLabel(kind: ReminderKind): string {
  if (kind === 'onsale_day_before') return '开票前一天';
  if (kind === 'onsale') return '开票前 5 分钟';
  if (kind === 'show') return '开演';
  return '自定义';
}

function attachEventFields(event: ShowEvent): Pick<
  Reminder,
  'onsaleAt' | 'venue' | 'priceMin' | 'priceMax' | 'ticketUrl'
> {
  return {
    onsaleAt: event.onsaleAt,
    venue: event.venue,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    ticketUrl: event.ticketUrl,
  };
}

/** After interest=yes: day-before + T-5min, both carrying the four required fields. */
export function createOnsaleReminders(event: ShowEvent, now = new Date()): Reminder[] {
  if (!event.onsaleAt) return [];
  const createdAt = now.toISOString();
  const fields = attachEventFields(event);
  const dayBefore: Reminder = {
    id: makeId(),
    eventId: event.id,
    kind: 'onsale_day_before',
    fireAt: defaultFireAt(event, 'onsale_day_before', now),
    label: reminderLabel(event, 'onsale_day_before'),
    createdAt,
    ...fields,
  };
  const fiveMin: Reminder = {
    id: makeId(),
    eventId: event.id,
    kind: 'onsale',
    fireAt: defaultFireAt(event, 'onsale', now),
    label: reminderLabel(event, 'onsale'),
    createdAt,
    ...fields,
  };

  const onsaleMs = new Date(event.onsaleAt).getTime();
  if (onsaleMs <= now.getTime()) {
    return [];
  }

  // If day-before and T-5min collapse to the same instant, keep T-5min only.
  if (dayBefore.fireAt === fiveMin.fireAt) {
    return [fiveMin];
  }
  return [dayBefore, fiveMin];
}

/** Display times in China Standard Time (matches Shanghai box-office clocks). */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${Number(get('month'))}月${Number(get('day'))}日 ${get('hour')}:${get('minute')}`;
}

export function dueReminders(reminders: Reminder[], now = new Date()): Reminder[] {
  return reminders.filter((r) => new Date(r.fireAt).getTime() <= now.getTime());
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function pingReminder(reminder: Reminder, event?: ShowEvent): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const details = event
    ? reminderDetails(event)
    : [
        reminder.onsaleAt ? `开票时间 ${formatWhen(reminder.onsaleAt)}` : '',
        reminder.venue ? `场馆 ${reminder.venue}` : '',
        reminder.priceMin != null && reminder.priceMax != null
          ? `票价 ${formatPrice(reminder.priceMin, reminder.priceMax)}`
          : '',
        reminder.ticketUrl ? `购票 ${reminder.ticketUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');
  new Notification('StageCue 提醒', {
    body: `${reminder.label}\n提醒 ${formatWhen(reminder.fireAt)}\n${details}`,
    tag: reminder.id,
  });
}

/** Mail draft for iPhone Mail — until server-side email is wired. */
export function buildInterestMailto(email: string, event: ShowEvent): string {
  const subject = encodeURIComponent(`StageCue 已标记感兴趣：${event.title}`);
  const body = encodeURIComponent(
    [
      `你已标记感兴趣：${event.title}`,
      '',
      event.blurb,
      '',
      reminderDetails(event),
      '',
      '提醒计划：开票前一天 + 开票前 5 分钟',
      '请同时把日历文件导入 iPhone，锁屏闹钟更稳。',
    ].join('\n'),
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

/**
 * Calendar event at onsale time with:
 * - alarm 1 day before
 * - alarm 5 minutes before
 * Description always includes the four required fields.
 */
export function buildIcs(event: ShowEvent, kind: ReminderKind, fireAt: string): string {
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const isOnsale = kind === 'onsale' || kind === 'onsale_day_before';
  const start =
    isOnsale && event.onsaleAt ? new Date(event.onsaleAt) : new Date(fireAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const summary = isOnsale
    ? `开票：${event.title}`
    : kind === 'show'
      ? `观演：${event.title}`
      : event.title;
  const desc = [
    event.blurb,
    reminderDetails(event).replace(/\n/g, '\\n'),
    '提醒：开票前一天 + 开票前 5 分钟',
  ].join('\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StageCue//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}-${isOnsale ? 'onsale' : kind}@stagecue`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${event.venue}`,
  ];
  if (event.ticketUrl) {
    lines.push(`URL:${event.ticketUrl}`);
  }
  if (isOnsale && event.onsaleAt) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      `DESCRIPTION:开票前一天：${event.title}\\n${reminderDetails(event).replace(/\n/g, '\\n')}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT5M',
      `DESCRIPTION:开票前 5 分钟：${event.title}\\n${reminderDetails(event).replace(/\n/g, '\\n')}`,
      'END:VALARM',
    );
  } else if (kind === 'show') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT3H',
      `DESCRIPTION:开演提醒：${event.title}`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
