import type { InterestMap, Reminder, TasteProfile } from './types';

const TASTE_KEY = 'stagecue.taste.v1';
const REMINDER_KEY = 'stagecue.reminders.v1';
const INTEREST_KEY = 'stagecue.interest.v1';
const EMAIL_KEY = 'stagecue.email.v1';

export const DEFAULT_TASTE: TasteProfile = {
  genres: ['opera', 'ballet', 'musical', 'chamber', 'symphony'],
  cities: ['shanghai', 'suzhou'],
  venues: [
    '上海大歌剧院',
    '上海大剧院',
    '东方',
    '上海交响乐团',
    '上音歌剧院',
    '上海音乐厅',
    '金鸡湖',
    '苏州文化艺术中心',
  ],
  budgetMax: 1280,
  keywords: [],
};

export function loadTaste(): TasteProfile {
  try {
    const raw = localStorage.getItem(TASTE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_TASTE,
        genres: [...DEFAULT_TASTE.genres],
        cities: [...DEFAULT_TASTE.cities],
        venues: [...DEFAULT_TASTE.venues],
      };
    }
    return { ...DEFAULT_TASTE, ...JSON.parse(raw) } as TasteProfile;
  } catch {
    return { ...DEFAULT_TASTE };
  }
}

export function saveTaste(taste: TasteProfile): void {
  localStorage.setItem(TASTE_KEY, JSON.stringify(taste));
}

export function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Reminder[];
  } catch {
    return [];
  }
}

export function saveReminders(reminders: Reminder[]): void {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
}

export function loadInterest(): InterestMap {
  try {
    const raw = localStorage.getItem(INTEREST_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as InterestMap;
  } catch {
    return {};
  }
}

export function saveInterest(map: InterestMap): void {
  localStorage.setItem(INTEREST_KEY, JSON.stringify(map));
}

export function loadEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveEmail(email: string): void {
  localStorage.setItem(EMAIL_KEY, email.trim());
}
