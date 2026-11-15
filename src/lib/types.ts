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
  /** Plain-language intro for deciding interest. */
  blurb: string;
  tags: string[];
}

export interface TasteProfile {
  genres: Genre[];
  cities: City[];
  venues: string[];
  budgetMax: number;
  keywords: string[];
}

/** onsale_day_before = 前一天; onsale = 开票前 5 分钟. */
export type ReminderKind = 'onsale_day_before' | 'onsale' | 'show' | 'custom';

export type InterestVote = 'yes' | 'no';

export interface InterestMap {
  [eventId: string]: InterestVote;
}

export interface Reminder {
  id: string;
  eventId: string;
  kind: ReminderKind;
  fireAt: string;
  label: string;
  createdAt: string;
  onsaleAt?: string;
  venue?: string;
  priceMin?: number;
  priceMax?: number;
  ticketUrl?: string;
}

export interface RankedEvent {
  event: ShowEvent;
  score: number;
  reasons: string[];
}
