import type { Reminder, ReminderKind, ShowEvent } from './types';

export function makeId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Onsale alerts fire as soon as possible (now) so you hear about a sale
 * the moment you care — not 15 minutes before tickets drop.
 * Show alerts stay at 3 hours before curtain.
 */
export function defaultFireAt(event: ShowEvent, kind: ReminderKind, now = new Date()): string {
  if (kind === 'onsale' && event.onsaleAt) {
    // Notify as early as possible: the moment the user opts in.
    return now.toISOString();
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
  if (kind === 'onsale') {
    const when = event.onsaleAt ? formatWhen(event.onsaleAt) : '';
    return when ? `开票尽早提醒 · ${event.title}（开票 ${when}）` : `开票尽早提醒 · ${event.title}`;
  }
  if (kind === 'show') return `开演提醒 · ${event.title}`;
  return `自定义提醒 · ${event.title}`;
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
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('StageCue 提醒', {
      body: `${reminder.label}\n${formatWhen(reminder.fireAt)}`,
      tag: reminder.id,
    });
  }
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

/** Build a simple .ics for calendar import. */
export function buildIcs(event: ShowEvent, kind: ReminderKind, fireAt: string, now = new Date()): string {
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // For onsale, calendar event sits on the real sale time; alarm fires as early as possible.
  const start =
    kind === 'onsale' && event.onsaleAt ? new Date(event.onsaleAt) : new Date(fireAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const summary =
    kind === 'onsale' ? `开票：${event.title}` : kind === 'show' ? `观演：${event.title}` : event.title;
  const desc = [event.venue, event.summary, event.ticketUrl ?? ''].filter(Boolean).join('\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StageCue//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}-${kind}@stagecue`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${event.venue}`,
  ];
  if (kind === 'onsale' && event.onsaleAt) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${earlyOnsaleAlarmTrigger(event.onsaleAt, now)}`,
      `DESCRIPTION:开票尽早提醒：${event.title}`,
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
