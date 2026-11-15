# StageCue

演绎活动的**个性化推荐**与**开票提醒**（面向 iPhone：日历 + 邮件草稿）。

目录同步自 [上海乐历](https://shanghaiconcerts.com/)（CC BY 4.0）：覆盖上海、苏州、杭州等场馆的**未开票**场次，并标注同日撞车。

## 功能

- **只推未开票**：`ticketStatus=not_yet` 或未来开票时刻；已开票默认不进推荐
- **多馆**：大歌剧院 / 大剧院 / 东艺 / 上交音乐厅 / 上音 / 上海音乐厅 / 金鸡湖 / 杭州大剧院等
- **先问兴趣**：每场带外行可读简介，再选「感兴趣 / 跳过」；同日撞车一并展示
- **感兴趣后排提醒**：开票**前一天** + 开票**前 5 分钟**（时刻待公布则先记账）
- **提醒四要素**：开票时间、场馆、票价、购票链接
- **手机通道**：导出 `.ics`（主）+ 邮箱草稿（辅）+ 浏览器通知

> 不做自动抢票或代下单。

## 开发

```bash
npm install
npm run sync:yueli   # 从上海乐历拉取未开票目录 → src/data/yueli.json
npm run dev
```

```bash
npm run build
npm run preview
```

## 数据

- 同步脚本：`scripts/sync-yueli.mjs` → `src/data/yueli.json`
- 映射：`src/lib/yueliMap.ts`（品类、简介、撞车）
- 来源 API：`https://shanghaiconcerts.com/api/concerts`（请节制请求）

## 技术

Vite · React 19 · TypeScript
