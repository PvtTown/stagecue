import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { Reminder, ReminderKind, ShowEvent } from './types';

export function makeId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function defaultFireAt(event: ShowEvent, kind: ReminderKind): string {
  if (kind === 'onsale' && event.onsaleAt) {
    const t = new Date(event.onsaleAt);
    t.setMinutes(t.getMinutes() - 15);
    return t.toISOString();
  }
  if (kind === 'show') {
    const t = new Date(event.startsAt);
    t.setHours(t.getHours() - 3);
    return t.toISOString();
  }
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setMinutes(0, 0, 0);
  return t.toISOString();
}

export function reminderLabel(event: ShowEvent, kind: ReminderKind): string {
  if (kind === 'onsale') return `开票提醒 · ${event.title}`;
  if (kind === 'show') return `开演提醒 · ${event.title}`;
  return `自定义提醒 · ${event.title}`;
}

export function formatWhen(iso: string): string {
  return format(new Date(iso), 'M月d日 HH:mm', { locale: zhCN });
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

/** Build a simple .ics for calendar import. */
export function buildIcs(event: ShowEvent, kind: ReminderKind, fireAt: string): string {
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(fireAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const summary =
    kind === 'onsale' ? `开票：${event.title}` : kind === 'show' ? `观演：${event.title}` : event.title;
  const desc = [event.venue, event.summary, event.ticketUrl ?? ''].filter(Boolean).join('\\n');
  return [
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
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
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
