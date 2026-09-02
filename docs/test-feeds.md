# FeedLens 测试用例与验证源列表

本文档收录了用于测试和回归验证 FeedLens 的常用 RSS/Atom 订阅源及容易误触发的反向对比用例。

---

## 一、正向测试用例（应当正常触发阅读器）

| 序号 | 名称 | 测试 URL | 格式类型 | 特点 / 验证点 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **V2EX 全站精华** | `https://www.v2ex.com/index.xml` | Atom 1.0 (`application/atom+xml`) | 经典论坛流，更新频率高，Atom 格式解析验证 |
| 2 | **GitHub 官方博客** | `https://github.blog/feed/` | RSS 2.0 (`application/rss+xml`) | 典型 WordPress `/feed/` 结构，丰富图文与代码块 |
| 3 | **少数派** | `https://sspai.com/feed` | RSS 2.0 (`application/xml`) | 中文科技排版，高清文章配图与摘要 |
| 4 | **The Verge** | `https://www.theverge.com/rss/index.xml` | RSS 2.0 (`application/xml`) | 国际科技外媒，带有详细封面与副标题 |
| 5 | **BBC 新闻** | `https://feeds.bbci.co.uk/news/rss.xml` | RSS 2.0 (`text/xml`) | 权威国际资讯，新闻单条流 |
| 6 | **阮一峰的网络日志** | `https://www.ruanyifeng.com/blog/atom.xml` | Atom 1.0 (`application/xml`) | 经典独立技术博客，长文与外部超链接 |
| 7 | **pyRSSHub 演示源** | `https://pyrsshub.vercel.app/feeds` | RSS 2.0 (`application/xml`) | 验证非标准 URL 后缀、完全依靠响应头识别的订阅源 |

---

## 二、反向对比测试用例（应当坚决排除、绝不误触发）

| 序号 | 场景 | 测试 URL | 预期表现 | 解决的误触发风险 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **动态 SVG 徽章** | `https://img.shields.io/badge/Format-4%20Days%20Intensive%20Camp-orange?style=flat-square` | 浏览器直接渲染矢量徽章图片，不跳转 | 避免 `image/svg+xml` 响应头命中正则 |
| 2 | **站点地图 (Sitemap)** | `https://github.blog/sitemap.xml` 或 `https://sspai.com/sitemap.xml` | 正常展示浏览器默认的 XML 结构或站点地图 | 排除 `sitemap*.xml` 误当成 Feed 报错 |
| 3 | **社交/系统 Web Feed** | `https://www.linkedin.com/feed` 或 `https://facebook.com/feed` | 正常浏览社交平台动态网页，不被劫持 | 避免纯粹按 `/feed` 路径无视 `text/html` 劫持网页 |
| 4 | **RSSHub 官方文档** | `https://docs.rsshub.app/guide/` | 正常阅读官方文档网站 | 排除 `docs.*` 等文档子域名及非 Feed 页面 |
| 5 | **代码平台构建配置** | `https://raw.githubusercontent.com/user/repo/main/pom.xml` | 正常查看 `pom.xml` / `web.xml` 代码 | 排除 Maven、Java Web 等开发配置文件 |
| 6 | **带 feed 路径的数据接口** | `https://example.com/feed/data.json` 或 `.../rss/export.csv` | 正常展示 JSON / 下载 CSV | 扩充静态资源后缀排除列表 |

---

## 三、自动化回归测试

上述所有用例均已纳入自动化测试：
```bash
node --test tests/*.test.cjs
```
