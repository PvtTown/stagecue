import { useEffect, useMemo, useState } from 'react';
import { CATALOG, CITY_LABEL, GENRE_LABEL, YUELI_ATTRIBUTION, YUELI_SYNCED_AT } from './data/events';
import { rankUpcomingOnsales, type OnsaleUrgency } from './lib/recommend';
import {
  buildIcs,
  buildInterestMailto,
  createOnsaleReminders,
  downloadIcs,
  dueReminders,
  ensureNotificationPermission,
  formatPrice,
  formatWhen,
  kindLabel,
  pingReminder,
  reminderDetails,
} from './lib/reminders';
import {
  DEFAULT_TASTE,
  loadEmail,
  loadInterest,
  loadReminders,
  loadTaste,
  saveEmail,
  saveInterest,
  saveReminders,
  saveTaste,
} from './lib/storage';
import type {
  City,
  Genre,
  InterestMap,
  InterestVote,
  Reminder,
  ShowEvent,
  TasteProfile,
} from './lib/types';

const ALL_GENRES = Object.keys(GENRE_LABEL) as Genre[];
const ALL_CITIES = Object.keys(CITY_LABEL) as City[];
const VENUE_PRESETS = [
  '上海大歌剧院',
  '上海大剧院',
  '东方',
  '上海交响乐团',
  '上音歌剧院',
  '上海音乐厅',
  '金鸡湖',
  '苏州文化艺术中心',
  '杭州大剧院',
];

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function urgencyLabel(urgency: OnsaleUrgency, hoursUntil: number): string {
  if (urgency === 'TBA' || !Number.isFinite(hoursUntil)) return '开票时刻待公布';
  if (urgency === 'today') {
    const h = Math.max(1, Math.round(hoursUntil));
    return h <= 1 ? '约 1 小时内开票' : `${h} 小时内开票`;
  }
  if (urgency === 'soon') {
    const d = Math.max(1, Math.round(hoursUntil / 24));
    return `${d} 天内开票`;
  }
  const d = Math.max(1, Math.round(hoursUntil / 24));
  return `${d} 天后开票`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function App() {
  const [taste, setTaste] = useState<TasteProfile>(() => loadTaste());
  const [reminders, setReminders] = useState<Reminder[]>(() => loadReminders());
  const [interest, setInterest] = useState<InterestMap>(() => loadInterest());
  const [email, setEmail] = useState(() => loadEmail());
  const [keywordDraft, setKeywordDraft] = useState(taste.keywords.join(' '));
  const [toast, setToast] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    saveTaste(taste);
  }, [taste]);

  useEffect(() => {
    saveReminders(reminders);
  }, [reminders]);

  useEffect(() => {
    saveInterest(interest);
  }, [interest]);

  useEffect(() => {
    saveEmail(email);
  }, [email]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const due = dueReminders(reminders, new Date(nowTick));
    for (const r of due) {
      const flag = `stagecue.pinged.${r.id}`;
      if (sessionStorage.getItem(flag)) continue;
      const event = CATALOG.find((e) => e.id === r.eventId);
      pingReminder(r, event);
      sessionStorage.setItem(flag, '1');
      setToast(`提醒到点：${r.label}`);
    }
  }, [reminders, nowTick]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const ranked = useMemo(() => rankUpcomingOnsales(CATALOG, taste, now), [taste, now]);
  const pendingInterest = ranked.filter((r) => !interest[r.event.id]);
  const interestedShows = ranked.filter((r) => interest[r.event.id] === 'yes');

  function updateTaste(patch: Partial<TasteProfile>) {
    setTaste((prev) => ({ ...prev, ...patch }));
  }

  function applyKeywords() {
    const keywords = keywordDraft
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    updateTaste({ keywords });
    setToast('口味已更新');
  }

  async function voteInterest(event: ShowEvent, vote: InterestVote) {
    setInterest((prev) => ({ ...prev, [event.id]: vote }));
    if (vote === 'no') {
      setReminders((prev) =>
        prev.filter(
          (r) =>
            !(r.eventId === event.id && (r.kind === 'onsale' || r.kind === 'onsale_day_before')),
        ),
      );
      setToast(`已跳过：${event.title}`);
      return;
    }

    if (!event.onsaleAt) {
      const ok = await ensureNotificationPermission();
      if (email.trim() && isValidEmail(email)) {
        window.location.href = buildInterestMailto(email.trim(), event);
      }
      setToast(
        ok
          ? '感兴趣已记下。开票时刻待公布——一有确切时间再排「前一天 + 前 5 分钟」。'
          : '感兴趣已记下（开票时刻待公布）。可先允许通知。',
      );
      return;
    }

    const pair = createOnsaleReminders(event, now);
    setReminders((prev) => [
      ...pair,
      ...prev.filter(
        (r) =>
          !(r.eventId === event.id && (r.kind === 'onsale' || r.kind === 'onsale_day_before')),
      ),
    ]);

    downloadIcs(`${event.id}-onsale.ics`, buildIcs(event, 'onsale', pair[0]?.fireAt ?? event.onsaleAt));

    const ok = await ensureNotificationPermission();
    if (email.trim() && isValidEmail(email)) {
      window.location.href = buildInterestMailto(email.trim(), event);
    }

    const sale = formatWhen(event.onsaleAt);
    setToast(
      ok
        ? `感兴趣已记下：前一天 + 开票前 5 分钟（开票 ${sale}）。日历已下载。`
        : `感兴趣已记下（开票 ${sale}）。请允许通知，并导入刚下载的日历。`,
    );
  }

  function removeReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  function resetTaste() {
    const next = {
      ...DEFAULT_TASTE,
      genres: [...DEFAULT_TASTE.genres],
      cities: [...DEFAULT_TASTE.cities],
      venues: [...DEFAULT_TASTE.venues],
      keywords: [],
    };
    setTaste(next);
    setKeywordDraft('');
    setToast('已恢复默认口味');
  }

  const dueIds = new Set(dueReminders(reminders, now).map((r) => r.id));
  const eventById = useMemo(() => new Map(CATALOG.map((e) => [e.id, e])), []);

  return (
    <div className="app">
      <header className="hero">
        <div className="spot" aria-hidden />
        <p className="brand">StageCue</p>
        <h2>先读简介，再决定感不感兴趣</h2>
        <p>
          目录同步自上海乐历：上海 / 苏州 / 杭州多馆未开票场次（含同日撞车）。感兴趣后排「开票前一天 + 前 5
          分钟」；日历进 iPhone 最稳。
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#ask-interest">
            看待确认场次
          </a>
          <a className="btn btn-ghost" href="#how-alert">
            提醒方式
          </a>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <h3>我的口味</h3>
          <div className="field">
            <label>品类</label>
            <div className="chips">
              {ALL_GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`chip ${taste.genres.includes(g) ? 'on' : ''}`}
                  onClick={() => updateTaste({ genres: toggleIn(taste.genres, g) })}
                >
                  {GENRE_LABEL[g]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>城市</label>
            <div className="chips">
              {ALL_CITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip ${taste.cities.includes(c) ? 'on' : ''}`}
                  onClick={() => updateTaste({ cities: toggleIn(taste.cities, c) })}
                >
                  {CITY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>场馆偏好</label>
            <div className="chips">
              {VENUE_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`chip ${taste.venues.includes(v) ? 'on' : ''}`}
                  onClick={() => updateTaste({ venues: toggleIn(taste.venues, v) })}
                >
                  {v.replace(/^上海/, '').replace('文化艺术中心', '文艺中心')}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>预算上限（¥ / 张）</label>
            <input
              type="number"
              min={80}
              max={5000}
              step={20}
              value={taste.budgetMax}
              onChange={(e) => updateTaste({ budgetMax: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label>关键词（空格分隔）</label>
            <input
              type="text"
              value={keywordDraft}
              placeholder="如：巴赫 早鸟 艾夫曼"
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyKeywords();
              }}
            />
          </div>
          <div className="field">
            <label>个人邮箱（感兴趣时发一封摘要到邮件 App）</label>
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary btn-small" onClick={applyKeywords}>
              应用口味
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={resetTaste}>
              重置
            </button>
          </div>

          <div className="how-alert" id="how-alert">
            <h4>怎么提醒你（iPhone）</h4>
            <ol>
              <li>
                <strong>先读简介</strong>，点「感兴趣」或「跳过」。
              </li>
              <li>
                <strong>感兴趣</strong>→ 排「开票前一天 + 开票前 5 分钟」，并下载日历（请导入
                iPhone）。
              </li>
              <li>
                <strong>邮件</strong>：填写邮箱后，感兴趣会打开邮件草稿（四要素齐全）。自动发信需后续接邮箱服务。
              </li>
              <li>
                每条提醒必含：开票时间、场馆、票价、购票链接。不做自动抢票。
              </li>
            </ol>
          </div>
        </aside>

        <main className="stack">
          <section className="panel panel-hot" id="ask-interest">
            <div className="section-head">
              <h3>这些要不要看？</h3>
              <p>
                {pendingInterest.length === 0
                  ? '待确认场次已清空'
                  : `${pendingInterest.length} 场待你决定 · 先读简介再选`}
              </p>
            </div>
            <div className="stack">
              {pendingInterest.length === 0 && (
                <p className="muted">
                  没有待确认场次。可在下方「已感兴趣」管理提醒，或重置口味后再看。
                </p>
              )}
              {pendingInterest.map(({ event, hoursUntil, urgency, score, reasons }) => (
                <article key={event.id} className={`event event-onsale urgency-${urgency}`}>
                  <div className="event-top">
                    <h4>{event.title}</h4>
                    <div className="badges">
                      <span className="badge-onsale">{urgencyLabel(urgency, hoursUntil)}</span>
                      <span className="score">{Math.round(score)}</span>
                    </div>
                  </div>
                  <p className="blurb">{event.blurb}</p>
                  <div className="meta time-block">
                    <div>
                      <span className="time-label">开票时间</span>
                      <strong>{event.onsaleAt ? formatWhen(event.onsaleAt) : '待公布'}</strong>
                    </div>
                    <div>
                      <span className="time-label">场馆</span>
                      <span>
                        {event.venue} · {CITY_LABEL[event.city] ?? event.city}
                      </span>
                    </div>
                    <div>
                      <span className="time-label">票价</span>
                      <span>{formatPrice(event.priceMin, event.priceMax)}</span>
                    </div>
                    <div>
                      <span className="time-label">购票</span>
                      <span>
                        {event.ticketUrl ? (
                          <a href={event.ticketUrl} target="_blank" rel="noreferrer">
                            打开购票页
                          </a>
                        ) : (
                          '待公布'
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="time-label">开演</span>
                      <span>{formatWhen(event.startsAt)}</span>
                    </div>
                    <div>
                      <span className="time-label">提醒若选是</span>
                      <strong>
                        {event.onsaleAt ? '开票前一天 + 开票前 5 分钟' : '时刻待公布后自动可排'}
                      </strong>
                    </div>
                    {!!event.collisions?.length && (
                      <div>
                        <span className="time-label">同日撞车</span>
                        <span>{event.collisions.join('；')}</span>
                      </div>
                    )}
                  </div>
                  <div className="reasons">
                    {reasons.map((r) => (
                      <span key={r} className="reason">
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => voteInterest(event, 'yes')}
                    >
                      感兴趣，排提醒
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => voteInterest(event, 'no')}
                    >
                      跳过
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="interested">
            <div className="section-head">
              <h3>已感兴趣</h3>
              <p>{interestedShows.length} 场 · 已排前一天 / 开票前 5 分钟</p>
            </div>
            {interestedShows.length === 0 ? (
              <p className="muted">还没有感兴趣的场次。先在上方读简介并选择。</p>
            ) : (
              <div className="stack">
                {interestedShows.map(({ event }) => (
                  <article key={event.id} className="event">
                    <div className="event-top">
                      <h4>{event.title}</h4>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => voteInterest(event, 'no')}
                      >
                        取消兴趣
                      </button>
                    </div>
                    <p className="meta">{reminderDetails(event)}</p>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() =>
                          downloadIcs(
                            `${event.id}-onsale.ics`,
                            buildIcs(event, 'onsale', event.onsaleAt!),
                          )
                        }
                      >
                        再导出日历
                      </button>
                      {event.ticketUrl && (
                        <a
                          className="btn btn-ghost btn-small"
                          href={event.ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          购票链接
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <p className="muted source-note">
            数据 {YUELI_ATTRIBUTION} · 同步于{' '}
            {new Date(YUELI_SYNCED_AT).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ·{' '}
            <code>npm run sync:yueli</code>
          </p>

          <section className="panel" id="reminders">
            <div className="section-head">
              <h3>提醒清单</h3>
              <p>{reminders.length} 条 · 含开票时间 / 场馆 / 票价 / 链接</p>
            </div>
            {reminders.length === 0 ? (
              <p className="muted">点「感兴趣，排提醒」后会出现在这里。</p>
            ) : (
              <div className="stack">
                {reminders.map((r) => {
                  const event = eventById.get(r.eventId);
                  return (
                    <div key={r.id} className={`reminder ${dueIds.has(r.id) ? 'due' : ''}`}>
                      <strong>{r.label}</strong>
                      <div className="meta time-block compact">
                        <div>
                          <span className="time-label">提醒时间</span>
                          <strong>{formatWhen(r.fireAt)}</strong>
                          {dueIds.has(r.id) ? ' · 已通知' : ''}
                        </div>
                        <div>
                          <span className="time-label">类型</span>
                          <span>{kindLabel(r.kind)}</span>
                        </div>
                        {(event || r.onsaleAt) && (
                          <>
                            <div>
                              <span className="time-label">开票时间</span>
                              <strong>
                                {formatWhen((event?.onsaleAt ?? r.onsaleAt)!)}
                              </strong>
                            </div>
                            <div>
                              <span className="time-label">场馆</span>
                              <span>{event?.venue ?? r.venue}</span>
                            </div>
                            <div>
                              <span className="time-label">票价</span>
                              <span>
                                {formatPrice(
                                  event?.priceMin ?? r.priceMin ?? 0,
                                  event?.priceMax ?? r.priceMax ?? 0,
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="time-label">购票</span>
                              <span>
                                {(event?.ticketUrl ?? r.ticketUrl) ? (
                                  <a
                                    href={(event?.ticketUrl ?? r.ticketUrl)!}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    打开链接
                                  </a>
                                ) : (
                                  '待公布'
                                )}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => removeReminder(r.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
