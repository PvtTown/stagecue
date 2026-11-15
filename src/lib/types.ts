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

/** onsale_early = notify ASAP; onsale = at the ticket-drop moment. */
export type ReminderKind = 'onsale_early' | 'onsale' | 'show' | 'custom';

export interface Reminder {
  id: string;
  eventId: string;
  kind: ReminderKind;
  fireAt: string;
  label: string;
  createdAt: string;
  /** Real box-office open time, when known — shown alongside fireAt. */
  onsaleAt?: string;
}

export interface RankedEvent {
  event: ShowEvent;
  score: number;
  reasons: string[];
}
