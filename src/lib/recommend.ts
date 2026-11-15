import type { RankedEvent, ShowEvent, TasteProfile } from './types';

function venueMatch(eventVenue: string, preferred: string[]): boolean {
  if (preferred.length === 0) return true;
  return preferred.some((v) => eventVenue.includes(v) || v.includes(eventVenue));
}

export interface UpcomingOnsale {
  event: ShowEvent;
  hoursUntil: number;
  urgency: 'today' | 'soon' | 'later';
}

/** Future ticket drops, soonest first — for the dedicated “即将开票” lane. */
export function listUpcomingOnsales(catalog: ShowEvent[], now = new Date()): UpcomingOnsale[] {
  const out: UpcomingOnsale[] = [];
  for (const event of catalog) {
    if (!event.onsaleAt) continue;
    const hoursUntil = (new Date(event.onsaleAt).getTime() - now.getTime()) / 3600_000;
    if (hoursUntil <= 0) continue;
    const urgency: UpcomingOnsale['urgency'] =
      hoursUntil <= 24 ? 'today' : hoursUntil <= 72 ? 'soon' : 'later';
    out.push({ event, hoursUntil, urgency });
  }
  return out.sort((a, b) => a.hoursUntil - b.hoursUntil);
}

export function rankEvents(catalog: ShowEvent[], taste: TasteProfile, now = new Date()): RankedEvent[] {
  const ranked: RankedEvent[] = [];

  for (const event of catalog) {
    const reasons: string[] = [];
    let score = 0;

    const end = new Date(event.endsAt ?? event.startsAt);
    if (end.getTime() < now.getTime() - 12 * 3600_000) {
      continue; // skip finished
    }

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

    if (event.onsaleAt) {
      const onsale = new Date(event.onsaleAt);
      const hours = (onsale.getTime() - now.getTime()) / 3600_000;
      if (hours > 0 && hours <= 24) {
        score += 55;
        reasons.push('24 小时内开票');
      } else if (hours > 24 && hours <= 72) {
        score += 40;
        reasons.push('即将开票');
      } else if (hours > 72 && hours <= 24 * 14) {
        score += 28;
        reasons.push('两周内开票');
      } else if (hours > 24 * 14) {
        score += 16;
        reasons.push('已排开票日');
      } else if (hours <= 0 && hours > -24 * 14) {
        score += 10;
        reasons.push('近期已开票');
      }
    }

    const daysToShow = (new Date(event.startsAt).getTime() - now.getTime()) / 86400_000;
    if (daysToShow >= 0 && daysToShow <= 21) {
      score += 12;
      reasons.push('三周内开演');
    }

    if (event.tags.includes('热门') || event.tags.includes('长档')) {
      score += 6;
    }

    ranked.push({ event, score, reasons: reasons.slice(0, 4) });
  }

  return ranked.sort((a, b) => b.score - a.score || a.event.startsAt.localeCompare(b.event.startsAt));
}
