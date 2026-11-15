import type { City, Genre, ShowEvent, TicketStatus } from './types';

export interface YueliRow {
  slug: string;
  titleZh: string;
  titleEn?: string;
  venue: string;
  city: string;
  tags: string;
  descriptionZh: string;
  recommendationNote: string;
  priceMin?: number;
  priceMax?: number;
  onSaleAt?: string;
  ticketSaleNote: string;
  ticketStatus: TicketStatus;
  ticketUrl: string;
  startsAt?: string;
  endsAt?: string;
  sourceUrl: string;
}

export interface YueliPayload {
  syncedAt: string;
  source: string;
  attribution: string;
  count: number;
  items: YueliRow[];
}

const CITY_SET = new Set<City>([
  'shanghai',
  'hongkong',
  'singapore',
  'beijing',
  'suzhou',
  'hangzhou',
]);

function mapCity(raw: string): City {
  const c = raw.toLowerCase() as City;
  return CITY_SET.has(c) ? c : 'shanghai';
}

/** Map 上海乐历 tags → StageCue genres. */
export function mapGenres(tags: string, title: string): Genre[] {
  const hay = `${tags} ${title}`.toLowerCase();
  const out = new Set<Genre>();
  if (/芭蕾|ballet/.test(hay)) out.add('ballet');
  if (/舞剧|现代舞|舞蹈/.test(hay)) out.add('dance');
  if (/音乐剧|musical/.test(hay)) out.add('musical');
  if (/歌剧|轻歌剧|opera/.test(hay) && !/音乐剧/.test(hay)) out.add('opera');
  if (/京剧|昆曲|越剧|戏曲|评弹/.test(hay)) out.add('chinese_opera');
  if (/话剧|戏剧/.test(hay)) out.add('drama');
  if (/室内乐|独奏|吉他|钢琴|四重奏|chamber|recital/.test(hay)) out.add('chamber');
  if (/交响|管弦|乐团|新年音乐会|交响乐/.test(hay)) out.add('symphony');
  if (/音乐会/.test(hay) && out.size === 0) out.add('symphony');
  if (out.size === 0) out.add('chamber');
  return [...out];
}

function firstSentences(text: string, max = 120): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const cut = cleaned.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
  return stop > 40 ? cut.slice(0, stop + 1) : cut + (cleaned.length > max ? '…' : '');
}

export function blurbFor(row: YueliRow): string {
  if (row.recommendationNote.trim()) return row.recommendationNote.trim();
  const fromDesc = firstSentences(row.descriptionZh, 140);
  if (fromDesc) return fromDesc;
  return `${row.venue}演出《${row.titleZh}》。开票时间以官方渠道为准。`;
}

export function mapYueliRow(row: YueliRow): ShowEvent | null {
  if (!row.startsAt) return null;
  const priceMin = row.priceMin ?? 80;
  const priceMax = row.priceMax ?? row.priceMin ?? 1280;
  return {
    id: `yueli-${row.slug}`,
    title: row.titleZh,
    titleEn: row.titleEn,
    venue: row.venue,
    city: mapCity(row.city),
    genres: mapGenres(row.tags, row.titleZh),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    priceMin,
    priceMax,
    onsaleAt: row.onSaleAt,
    ticketUrl: row.ticketUrl,
    summary: firstSentences(row.descriptionZh, 100) || row.titleZh,
    blurb: blurbFor(row),
    tags: row.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    ticketStatus: row.ticketStatus,
    sourceUrl: row.sourceUrl,
  };
}

/** Attach same-day collisions across the mapped catalog (撞车场次). */
export function attachCollisions(events: ShowEvent[]): ShowEvent[] {
  const byDay = new Map<string, ShowEvent[]>();
  for (const e of events) {
    const day = e.startsAt.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  return events.map((e) => {
    const day = e.startsAt.slice(0, 10);
    const peers = (byDay.get(day) ?? []).filter((x) => x.id !== e.id);
    if (!peers.length) return e;
    return {
      ...e,
      collisions: peers.slice(0, 6).map((p) => `${p.title}（${p.venue}）`),
    };
  });
}
