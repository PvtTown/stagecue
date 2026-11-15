import { useEffect, useMemo, useState } from 'react';
import { CATALOG, CITY_LABEL, GENRE_LABEL } from './data/events';
import { rankUpcomingOnsales } from './lib/recommend';
import {
  buildIcs,
  defaultFireAt,
  downloadIcs,
  dueReminders,
  ensureNotificationPermission,
  formatWhen,
  makeId,
  pingReminder,
  reminderLabel,
} from './lib/reminders';
import {
  DEFAULT_TASTE,
  loadReminders,
  loadTaste,
  saveReminders,
  saveTaste,
} from './lib/storage';
import type { City, Genre, Reminder, ReminderKind, ShowEvent, TasteProfile } from './lib/types';

const ALL_GENRES = Object.keys(GENRE_LABEL) as Genre[];
const ALL_CITIES = Object.keys(CITY_LABEL) as City[];
const VENUE_PRESETS = ['上海大歌剧院', '上海大剧院', '上海文化广场', '东方艺术中心'];

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function urgencyLabel(urgency: 'today' | 'soon' | 'later', hoursUntil: number): string {
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

export default function App() {
  const [taste, setTaste] = useState<TasteProfile>(() => loadTaste());
  const [reminders, setReminders] = useState<Reminder[]>(() => loadReminders());
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
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const due = dueReminders(reminders, new Date(nowTick));
    for (const r of due) {
      const flag = `stagecue.pinged.${r.id}`;
      if (sessionStorage.getItem(flag)) continue;
      pingReminder(r);
      sessionStorage.setItem(flag, '1');
      setToast(`提醒到点：${r.label}`);
    }
  }, [reminders, nowTick]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const ranked = useMemo(() => rankUpcomingOnsales(CATALOG, taste, now), [taste, now]);

  function updateTaste(patch: Partial<TasteProfile>) {
    setTaste((prev) => ({ ...prev, ...patch }));
  }

  function applyKeywords() {
    const keywords = keywordDraft
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    updateTaste({ keywords });
    setToast('口味已更新，未开票推荐已刷新');
  }

  async function addReminder(event: ShowEvent, kind: ReminderKind) {
    let resolved = kind;
    if (resolved === 'onsale' && !event.onsaleAt) {
      resolved = 'show';
      setToast('该场次暂无开票时间，已改为开演提醒');
    }
    const fireAt = defaultFireAt(event, resolved, now);
    const reminder: Reminder = {
      id: makeId(),
      eventId: event.id,
      kind: resolved,
      fireAt,
      label: reminderLabel(event, resolved),
      createdAt: new Date().toISOString(),
    };
    setReminders((prev) => [
      reminder,
      ...prev.filter((r) => !(r.eventId === event.id && r.kind === resolved)),
    ]);
    const ok = await ensureNotificationPermission();
    if (resolved === 'onsale') {
      pingReminder(reminder);
      sessionStorage.setItem(`stagecue.pinged.${reminder.id}`, '1');
      const sale = event.onsaleAt ? formatWhen(event.onsaleAt) : '';
      setToast(
        ok
          ? `已尽早提醒：开票 ${sale || '时间待定'}`
          : `已记下开票 ${sale || ''}（请允许浏览器通知以便下次推送）`,
      );
      return;
    }
    setToast(
      ok
        ? `已添加提醒（${formatWhen(fireAt)}）`
        : `已添加提醒（请允许浏览器通知）· ${formatWhen(fireAt)}`,
    );
  }

  function removeReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  function exportCalendar(event: ShowEvent, kind: ReminderKind) {
    const resolved = kind === 'onsale' && !event.onsaleAt ? 'show' : kind;
    const fireAt = defaultFireAt(event, resolved, now);
    downloadIcs(`${event.id}-${resolved}.ics`, buildIcs(event, resolved, fireAt, now));
    setToast(
      resolved === 'onsale'
        ? '已下载日历：开票日事件 + 尽早闹钟（最多提前 14 天）'
        : '已下载日历文件',
    );
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

  return (
    <div className="app">
      <header className="hero">
        <div className="spot" aria-hidden />
        <p className="brand">StageCue</p>
        <h2>只盯还没开票的场次</h2>
        <p>已开票往往秒空。这里只推未开票演出，按口味排序，提醒一设即达。</p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#for-you">
            看未开票推荐
          </a>
          <a className="btn btn-ghost" href="#reminders">
            管理提醒
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
                  {v.replace('上海', '')}
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
          <div className="actions">
            <button type="button" className="btn btn-primary btn-small" onClick={applyKeywords}>
              应用口味
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={resetTaste}>
              重置
            </button>
          </div>
        </aside>

        <main className="stack">
          <section className="panel panel-hot" id="for-you">
            <div className="section-head">
              <h3>未开票推荐</h3>
              <p>
                {ranked.length === 0
                  ? '暂无未开票场次'
                  : `${ranked.length} 场待开票 · 已开票不展示（秒空难追）`}
              </p>
            </div>
            <div className="stack">
              {ranked.length === 0 && (
                <p className="muted">目录里没有仍未开票的场次。有新开票日时会自动出现在这里。</p>
              )}
              {ranked.map(({ event, score, reasons, hoursUntil, urgency }) => (
                <article key={event.id} className={`event event-onsale urgency-${urgency}`}>
                  <div className="event-top">
                    <h4>{event.title}</h4>
                    <div className="badges">
                      <span className="badge-onsale">{urgencyLabel(urgency, hoursUntil)}</span>
                      <span className="score">{Math.round(score)}</span>
                    </div>
                  </div>
                  <div className="meta">
                    {event.venue} · {CITY_LABEL[event.city]}
                    <br />
                    开票 {formatWhen(event.onsaleAt!)} · 开演 {formatWhen(event.startsAt)}
                    <br />
                    ¥{event.priceMin}–{event.priceMax}
                    {event.genres.map((g) => ` · ${GENRE_LABEL[g]}`).join('')}
                  </div>
                  <p className="meta">{event.summary}</p>
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
                      onClick={() => addReminder(event, 'onsale')}
                    >
                      尽早提醒开票
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => exportCalendar(event, 'onsale')}
                    >
                      导出日历
                    </button>
                    {event.ticketUrl && (
                      <a
                        className="btn btn-ghost btn-small"
                        href={event.ticketUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        购票信息
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="reminders">
            <div className="section-head">
              <h3>提醒清单</h3>
              <p>{reminders.length} 条 · 开票尽早通知 + 浏览器 / ICS</p>
            </div>
            {reminders.length === 0 ? (
              <p className="muted">还没有提醒。从上方未开票推荐点「尽早提醒开票」。</p>
            ) : (
              <div className="stack">
                {reminders.map((r) => (
                  <div key={r.id} className={`reminder ${dueIds.has(r.id) ? 'due' : ''}`}>
                    <strong>{r.label}</strong>
                    <span className="muted">
                      {r.kind === 'onsale' ? '开票·尽早' : r.kind === 'show' ? '开演' : '自定义'} ·{' '}
                      {formatWhen(r.fireAt)}
                      {dueIds.has(r.id) ? ' · 已通知' : ''}
                    </span>
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
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
