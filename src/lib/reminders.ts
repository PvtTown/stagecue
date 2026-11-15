import type { Reminder, ReminderKind, ShowEvent } from './types';

export function makeId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Show alerts: 3 hours before curtain.
 * Onsale alerts are created as a pair via createOnsaleReminders (early + drop).
 */
export function defaultFireAt(event: ShowEvent, kind: ReminderKind, now = new Date()): string {
  if (kind === 'onsale_early') {
    return now.toISOString();
  }
  if (kind === 'onsale' && event.onsaleAt) {
    return new Date(event.onsaleAt).toISOString();
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
  const sale = event.onsaleAt ? formatWhen(event.onsaleAt) : '';
  if (kind === 'onsale_early') {
    return sale ? `尽早提醒 · ${event.title}（开票 ${sale}）` : `尽早提醒 · ${event.title}`;
  }
  if (kind === 'onsale') {
    return sale ? `开票时刻 · ${event.title}（${sale}）` : `开票时刻 · ${event.title}`;
  }
  if (kind === 'show') return `开演提醒 · ${event.title}`;
  return `自定义提醒 · ${event.title}`;
}

export function kindLabel(kind: ReminderKind): string {
  if (kind === 'onsale_early') return '尽早提醒';
  if (kind === 'onsale') return '开票时刻';
  if (kind === 'show') return '开演';
  return '自定义';
}

/** One early ping (now) + one at the real onsale clock. */
export function createOnsaleReminders(event: ShowEvent, now = new Date()): Reminder[] {
  if (!event.onsaleAt) return [];
  const createdAt = now.toISOString();
  const onsaleAt = event.onsaleAt;
  const early: Reminder = {
    id: makeId(),
    eventId: event.id,
    kind: 'onsale_early',
    fireAt: defaultFireAt(event, 'onsale_early', now),
    label: reminderLabel(event, 'onsale_early'),
    createdAt,
    onsaleAt,
  };
  const drop: Reminder = {
    id: makeId(),
    eventId: event.id,
    kind: 'onsale',
    fireAt: defaultFireAt(event, 'onsale', now),
    label: reminderLabel(event, 'onsale'),
    createdAt,
    onsaleAt,
  };
  // If sale is already due, keep a single drop row (early would duplicate).
  if (new Date(onsaleAt).getTime() <= now.getTime()) {
    return [drop];
  }
  return [early, drop];
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

export function pingReminder(reminder: Reminder): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const saleLine = reminder.onsaleAt ? `\n开票时间 ${formatWhen(reminder.onsaleAt)}` : '';
  new Notification('StageCue 提醒', {
    body: `${reminder.label}\n提醒 ${formatWhen(reminder.fireAt)}${saleLine}`,
    tag: reminder.id,
  });
}

/** ICS VALARM: trigger as early as possible before onsale (up to 14 days). */
function earlyOnsaleAlarmTrigger(onsaleAt: string, now = new Date()): string {
  const onsale = new Date(onsaleAt).getTime();
  const msUntil = onsale - now.getTime();
  if (msUntil <= 0) return '-PT0S';
  const maxEarlyMs = 14 * 24 * 3600_000;
  const earlyMs = Math.min(msUntil, maxEarlyMs);
  const minutes = Math.max(1, Math.round(earlyMs / 60_000));
  return `-PT${minutes}M`;
}

/**
 * Calendar file for an onsale: event at real drop time, with
 * early alarm + at-the-moment alarm so both times are covered.
 */
export function buildIcs(event: ShowEvent, kind: ReminderKind, fireAt: string, now = new Date()): string {
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const isOnsale = kind === 'onsale' || kind === 'onsale_early';
  const start =
    isOnsale && event.onsaleAt ? new Date(event.onsaleAt) : new Date(fireAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const summary = isOnsale
    ? `开票：${event.title}`
    : kind === 'show'
      ? `观演：${event.title}`
      : event.title;
  const desc = [
    event.venue,
    event.summary,
    event.onsaleAt ? `开票时间 ${formatWhen(event.onsaleAt)}` : '',
    event.ticketUrl ?? '',
  ]
    .filter(Boolean)
    .join('\\n');
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
  if (isOnsale && event.onsaleAt) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${earlyOnsaleAlarmTrigger(event.onsaleAt, now)}`,
      `DESCRIPTION:尽早提醒开票：${event.title}（开票 ${formatWhen(event.onsaleAt)}）`,
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT0S',
      `DESCRIPTION:开票时刻：${event.title}（${formatWhen(event.onsaleAt)}）`,
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
