export type Genre =
  | 'opera'
  | 'ballet'
  | 'musical'
  | 'symphony'
  | 'drama'
  | 'chinese_opera'
  | 'dance'
  | 'chamber';

export type City = 'shanghai' | 'hongkong' | 'singapore' | 'beijing';

export interface ShowEvent {
  id: string;
  title: string;
  titleEn?: string;
  venue: string;
  city: City;
  genres: Genre[];
  startsAt: string; // ISO
  endsAt?: string;
  priceMin: number;
  priceMax: number;
  onsaleAt?: string;
  ticketUrl?: string;
  summary: string;
  tags: string[];
}

export interface TasteProfile {
  genres: Genre[];
  cities: City[];
  venues: string[];
  budgetMax: number;
  keywords: string[];
}

export type ReminderKind = 'onsale' | 'show' | 'custom';

export interface Reminder {
  id: string;
  eventId: string;
  kind: ReminderKind;
  fireAt: string;
  label: string;
  createdAt: string;
}

export interface RankedEvent {
  event: ShowEvent;
  score: number;
  reasons: string[];
}
