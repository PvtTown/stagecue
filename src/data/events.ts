import type { ShowEvent } from '../lib/types';
import { attachCollisions, mapYueliRow } from '../lib/yueliMap';
import type { YueliPayload } from '../lib/yueliMap';
import yueli from './yueli.json' with { type: 'json' };

/** Manual blurb overrides keyed by 上海乐历 slug (optional polish). */
const BLURB_OVERRIDE: Record<string, string> = {
  'schiff-staatskapelle-dresden':
    '席夫与德累斯顿国家管弦乐团——很老牌的乐团配一位极较真的钢琴家；适合想听「正经大场」交响的人。',
  'merry-widow-concert-version':
    '音乐会版《风流寡妇》：轻歌剧名作，去掉大布景后更好听清配器，轻松好入口。',
  'piano-romance-bertrand-chamayou-recital':
    '沙马尤钢琴独奏：法国学派代表，独奏会才是他的主场，偏浪漫细腻。',
};

const payload = yueli as YueliPayload;

const mapped = payload.items
  .map((row) => {
    const event = mapYueliRow(row);
    if (!event) return null;
    const override = BLURB_OVERRIDE[row.slug];
    return override ? { ...event, blurb: override } : event;
  })
  .filter((e): e is ShowEvent => e !== null);

/** Live-synced catalog from 上海乐历（上海 / 苏州 / 杭州等多馆，含撞车日场次）. */
export const CATALOG: ShowEvent[] = attachCollisions(mapped);

export const YUELI_SYNCED_AT = payload.syncedAt;
export const YUELI_ATTRIBUTION = payload.attribution;

export const GENRE_LABEL: Record<string, string> = {
  opera: '歌剧',
  ballet: '芭蕾',
  musical: '音乐剧',
  symphony: '交响',
  drama: '话剧',
  chinese_opera: '戏曲',
  dance: '舞剧/现当',
  chamber: '室内乐',
};

export const CITY_LABEL: Record<string, string> = {
  shanghai: '上海',
  hongkong: '香港',
  singapore: '新加坡',
  beijing: '北京',
  suzhou: '苏州',
  hangzhou: '杭州',
};
