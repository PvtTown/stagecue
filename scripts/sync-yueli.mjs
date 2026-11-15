#!/usr/bin/env node
/**
 * Pull upcoming / not-yet-on-sale concerts from 上海乐历 (shanghaiconcerts.com)
 * into src/data/yueli.json for StageCue. CC BY 4.0 — attribution in README.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'StageCue/0.1 (+https://github.com/PvtTown/stagecue; sync-yueli)';
const BASE = 'https://shanghaiconcerts.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/yueli.json');

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`${path} → ${body.message}`);
  return body.data;
}

async function allConcerts() {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await fetchJson(`/api/concerts?page=${page}&pageSize=100`);
    items.push(...data.items);
    if (page * 100 >= data.total || data.items.length === 0) break;
    page += 1;
  }
  return items;
}

function offerAvailability(concert) {
  const offers = concert.ticketOffers ?? [];
  if (offers.some((o) => o.availability === 'not_yet')) return 'not_yet';
  if (offers.some((o) => o.availability === 'on_sale')) return 'on_sale';
  if (offers.some((o) => o.availability === 'sold_out')) return 'sold_out';
  return 'unknown';
}

function firstBookingUrl(concert) {
  for (const o of concert.ticketOffers ?? []) {
    if (o.bookingUrl) return o.bookingUrl;
  }
  return `${BASE}/concerts/${concert.slug}`;
}

function toRow(concert) {
  const venue = concert.venue ?? {};
  const perfs = [...(concert.performances ?? [])].sort((a, b) =>
    `${a.date}T${a.time ?? ''}`.localeCompare(`${b.date}T${b.time ?? ''}`),
  );
  const p0 = perfs[0];
  const pN = perfs[perfs.length - 1];
  const startsAt =
    p0?.date && p0?.time
      ? `${p0.date}T${p0.time}:00+08:00`
      : p0?.date
        ? `${p0.date}T19:30:00+08:00`
        : undefined;
  const endsAt =
    pN?.date && pN?.time
      ? `${pN.date}T${pN.time}:00+08:00`
      : pN?.date
        ? `${pN.date}T19:30:00+08:00`
        : startsAt;

  return {
    slug: concert.slug,
    titleZh: concert.titleZh,
    titleEn: concert.titleEn ?? undefined,
    venue: venue.nameZh ?? '未知场馆',
    city: venue.city ?? 'shanghai',
    tags: concert.tags ?? '',
    descriptionZh: concert.descriptionZh ?? '',
    recommendationNote: concert.recommendationNote ?? '',
    priceMin: concert.priceMin ?? undefined,
    priceMax: concert.priceMax ?? undefined,
    onSaleAt: concert.onSaleAt ?? undefined,
    ticketSaleNote: concert.ticketSaleNote ?? '',
    ticketStatus: offerAvailability(concert),
    ticketUrl: firstBookingUrl(concert),
    startsAt,
    endsAt,
    sourceUrl: `${BASE}/concerts/${concert.slug}`,
  };
}

function keepForStageCue(row, nowMs) {
  if (row.ticketStatus === 'not_yet') return true;
  if (row.onSaleAt && Date.parse(row.onSaleAt) > nowMs) return true;
  return false;
}

const concerts = await allConcerts();
const nowMs = Date.now();
const rows = concerts.map(toRow).filter((r) => keepForStageCue(r, nowMs));
rows.sort((a, b) => {
  const ao = a.onSaleAt ? Date.parse(a.onSaleAt) : Number.POSITIVE_INFINITY;
  const bo = b.onSaleAt ? Date.parse(b.onSaleAt) : Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
});

mkdirSync(dirname(OUT), { recursive: true });
const payload = {
  syncedAt: new Date().toISOString(),
  source: BASE,
  attribution: '上海乐历 · Shanghai Concerts (CC BY 4.0)',
  count: rows.length,
  items: rows,
};
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${rows.length} not-yet / future-onsale rows → ${OUT}`);
