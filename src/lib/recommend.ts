import type { RankedEvent, ShowEvent, TasteProfile } from './types';

function venueMatch(eventVenue: string, preferred: string[]): boolean {
  if (preferred.length === 0) return true;
  return preferred.some((v) => eventVenue.includes(v) || v.includes(eventVenue));
}

export type OnsaleUrgency = 'today' | 'soon' | 'later' | 'TBA';

export interface UpcomingOnsale {
  event: ShowEvent;
  hoursUntil: number;
  urgency: OnsaleUrgency;
}

export interface RankedUpcoming extends RankedEvent, UpcomingOnsale {}

/**
 * Unsold / not-yet: future onSaleAt, or 上海乐历 ticketStatus=not_yet
 * (开票时刻可能尚未公布).
 */
export function isUpcomingOnsale(event: ShowEvent, now = new Date()): boolean {
  if (event.ticketStatus === 'not_yet') return true;
  if (event.onsaleAt && new Date(event.onsaleAt).getTime() > now.getTime()) return true;
  return false;
}

function urgencyFor(hoursUntil: number): OnsaleUrgency {
  if (!Number.isFinite(hoursUntil)) return 'TBA';
  if (hoursUntil <= 24) return 'today';
  if (hoursUntil <= 72) return 'soon';
  return 'later';
}

/** Future / not-yet ticket drops, soonest first (TBA last). */
export function listUpcomingOnsales(catalog: ShowEvent[], now = new Date()): UpcomingOnsale[] {
  const out: UpcomingOnsale[] = [];
  for (const event of catalog) {
    if (!isUpcomingOnsale(event, now)) continue;
    const hoursUntil = event.onsaleAt
      ? (new Date(event.onsaleAt).getTime() - now.getTime()) / 3600_000
      : Number.POSITIVE_INFINITY;
    if (event.onsaleAt && hoursUntil <= 0 && event.ticketStatus !== 'not_yet') continue;
    out.push({
      event,
      hoursUntil: event.onsaleAt && hoursUntil > 0 ? hoursUntil : Number.POSITIVE_INFINITY,
      urgency: urgencyFor(
        event.onsaleAt && hoursUntil > 0 ? hoursUntil : Number.POSITIVE_INFINITY,
      ),
    });
  }
  return out.sort((a, b) => a.hoursUntil - b.hoursUntil || a.event.startsAt.localeCompare(b.event.startsAt));
}

export function rankEvents(catalog: ShowEvent[], taste: TasteProfile, now = new Date()): RankedEvent[] {
  return rankUpcomingOnsales(catalog, taste, now).map(({ event, score, reasons }) => ({
    event,
    score,
    reasons,
  }));
}

/** Upcoming / not-yet onsales ranked by taste + how soon tickets drop. */
export function rankUpcomingOnsales(
  catalog: ShowEvent[],
  taste: TasteProfile,
  now = new Date(),
): RankedUpcoming[] {
  const ranked: RankedUpcoming[] = [];

  for (const event of catalog) {
    if (!isUpcomingOnsale(event, now)) continue;

    const end = new Date(event.endsAt ?? event.startsAt);
    if (end.getTime() < now.getTime() - 12 * 3600_000) continue;

    const hoursUntil = event.onsaleAt
      ? (new Date(event.onsaleAt).getTime() - now.getTime()) / 3600_000
      : Number.POSITIVE_INFINITY;
    const urgency = urgencyFor(hoursUntil > 0 ? hoursUntil : Number.POSITIVE_INFINITY);
    const reasons: string[] = [];
    let score = 0;

    const genreHits = event.genres.filter((g) => taste.genres.includes(g));
    if (genreHits.length) {
      score += 40 * genreHits.length;
      reasons.push(`匹配品类 ×${genreHits.length}`);
    } else if (taste.genres.length) {
      score -= 15;
    }

    if (taste.cities.includes(event.city)) {
      score += 25;
      reasons.push('城市匹配');
    }

    if (venueMatch(event.venue, taste.venues)) {
      score += 20;
      reasons.push('场馆偏好');
    }

    if (event.priceMin <= taste.budgetMax) {
      score += 15;
      if (event.priceMax <= taste.budgetMax) {
        score += 5;
        reasons.push('预算内');
      } else {
        reasons.push('有预算内票档');
      }
    } else {
      score -= 20;
    }

    const hay = `${event.title} ${event.summary} ${event.tags.join(' ')}`.toLowerCase();
    for (const kw of taste.keywords) {
      const k = kw.trim().toLowerCase();
      if (k && hay.includes(k)) {
        score += 18;
        reasons.push(`关键词「${kw}」`);
      }
    }

    if (Number.isFinite(hoursUntil) && hoursUntil > 0) {
      if (hoursUntil <= 24) {
        score += 55;
        reasons.push('24 小时内开票');
      } else if (hoursUntil <= 72) {
        score += 40;
        reasons.push('即将开票');
      } else if (hoursUntil <= 24 * 14) {
        score += 28;
        reasons.push('两周内开票');
      } else {
        score += 16;
        reasons.push('已排开票日');
      }
    } else {
      score += 12;
      reasons.push('未开票（时刻待公布）');
    }

    const daysToShow = (new Date(event.startsAt).getTime() - now.getTime()) / 86400_000;
    if (daysToShow >= 0 && daysToShow <= 21) {
      score += 12;
      reasons.push('三周内开演');
    }

    if (event.collisions?.length) {
      score += 4;
      reasons.push(`同日另有 ${event.collisions.length} 场撞车`);
    }

    ranked.push({
      event,
      score,
      reasons: reasons.slice(0, 4),
      hoursUntil: Number.isFinite(hoursUntil) && hoursUntil > 0 ? hoursUntil : Number.POSITIVE_INFINITY,
      urgency,
    });
  }

  return ranked.sort(
    (a, b) =>
      b.score - a.score || a.hoursUntil - b.hoursUntil || a.event.startsAt.localeCompare(b.event.startsAt),
  );
}
