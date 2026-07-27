const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appPath = process.env.APP_FILE || path.join(root, "static", "app.js");
const source = fs.readFileSync(appPath, "utf8");
const css = fs.readFileSync(path.join(root, "static", "styles.css"), "utf8");

function sourceBlock(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, `${startNeedle} block must be present`);
  return source.slice(start, end);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function testArchiveSearchEnrichment() {
  const resources = {
    competitions: {
      items: [{
        id: "comp_wc2026",
        slug: "world-cup-2026",
        name: "2026 FIFA 世界杯",
        nameEn: "FIFA World Cup 2026",
        governingBody: "FIFA",
        active: true,
      }],
    },
    teams: {
      items: [{
        id: "fifa_team_43946",
        name: "法国",
        nameEn: "France",
        code: "FRA",
        flagUrl: "/static/assets/flags/fra.png",
        flagEmoji: "🇫🇷",
      }],
    },
    players: {
      items: [{
        id: "fifa_player_389867",
        name: "姆巴佩",
        position: "FW",
        nationalityCode: "FRA",
        photoUrl: "https://example.com/mbappe.png",
        team: {
          name: "法国",
          code: "FRA",
          flagUrl: "/static/assets/flags/fra.png",
        },
        club: {
          name: "皇家马德里",
          logoUrl: "https://example.com/real-madrid.png",
        },
        marketValueLabelZh: "2亿欧",
        marketValueStatus: "verified",
        marketValueSource: "懂球帝",
        marketValueCheckedAt: "2026-07-27T13:48:13.372Z",
      }],
    },
  };
  const context = {
    URLSearchParams,
    archivePathParams: (value) => new URLSearchParams(String(value).split("?")[1] || ""),
    archiveResource: async (_index, key) => resources[key],
    archiveText: (row) => Object.values(row || {})
      .flatMap((value) => (value && typeof value === "object" ? Object.values(value) : [value]))
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase(),
  };
  vm.createContext(context);
  vm.runInContext(sourceBlock("async function archiveSearchApi", "\nasync function archiveApi"), context);

  const playerResult = await context.archiveSearchApi({}, "/search?q=姆巴佩");
  assert.equal(playerResult.items.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(playerResult.items[0])),
    {
      type: "player",
      id: "fifa_player_389867",
      label: "姆巴佩",
      subLabel: "FW",
      imageUrl: "https://example.com/mbappe.png",
      nationalityCode: "FRA",
      teamName: "法国",
      teamCode: "FRA",
      teamLogoUrl: "/static/assets/flags/fra.png",
      clubName: "皇家马德里",
      clubLogoUrl: "https://example.com/real-madrid.png",
      marketValueLabel: "2亿欧",
      marketValueStatus: "verified",
      marketValueSource: "懂球帝",
      marketValueCheckedAt: "2026-07-27T13:48:13.372Z",
      href: "/players/fifa_player_389867",
    },
  );

  const teamResult = await context.archiveSearchApi({}, "/search?q=France");
  assert.equal(teamResult.items[0].type, "team");
  assert.equal(teamResult.items[0].subLabel, "France");
  assert.equal(teamResult.items[0].imageUrl, "/static/assets/flags/fra.png");

  const emptyResult = await context.archiveSearchApi({}, "/search?q=");
  assert.deepEqual(JSON.parse(JSON.stringify(emptyResult)), { q: "", items: [] });
}

function testSearchCardRendering() {
  const context = {
    escapeHtml,
    hashHref: (value) => `#${value}`,
    positionLabel: (value) => ({ FW: "前锋" }[value] || value || "未公布"),
  };
  vm.createContext(context);
  vm.runInContext(sourceBlock("const searchResultTypes", "\nasync function renderSearch(params)"), context);

  const html = context.renderSearchResult({
    type: "player",
    label: "姆巴佩<script>",
    subLabel: "FW",
    imageUrl: "https://example.com/a.png",
    teamName: "法国",
    clubName: "皇家马德里",
    clubLogoUrl: "https://example.com/club.png",
    marketValueLabel: "2亿欧",
    marketValueStatus: "verified",
    href: "/players/fifa_player_389867",
  }, "姆巴佩");

  assert.match(html, /class="search-result-card is-player"/);
  assert.match(html, /<mark>姆巴佩<\/mark>&lt;script&gt;/);
  assert.doesNotMatch(html, /姆巴佩<script>/);
  assert.match(html, />球员</);
  assert.match(html, />前锋</);
  assert.match(html, />法国</);
  assert.match(html, /皇家马德里/);
  assert.match(html, /最新身价/);
  assert.match(html, />2亿欧</);
  assert.match(html, /href="#\/players\/fifa_player_389867"/);

  const unavailableHtml = context.renderSearchResult({
    type: "player",
    label: "测试门将",
    subLabel: "GK",
    teamName: "测试队",
    marketValueStatus: "unavailable",
    href: "/players/test-player",
  }, "门将");
  assert.match(unavailableHtml, /最新身价/);
  assert.match(unavailableHtml, /暂无报价/);
  assert.match(unavailableHtml, /is-unavailable/);
}

function testCommercialSearchShellAndResponsiveStyles() {
  assert.match(source, /class="search-page"/);
  assert.match(source, /class="search-hero"/);
  assert.match(source, /class="search-filter-list"/);
  assert.match(source, /class="search-empty-state"/);
  assert.match(source, /initSearchResultFilters\(\)/);
  assert.match(source, /input\.value = path === "\/search" \? params\.get\("q"\) \|\| "" : "";/);
  assert.doesNotMatch(
    sourceBlock("async function renderSearch(params)", "\nasync function renderAdmin"),
    /<p class="eyebrow">Search<\/p>/,
  );

  assert.match(css, /body\[data-route="search"\] \.main/);
  assert.match(css, /\.search-result-card:focus-visible/);
  assert.match(css, /\.search-result-card\[hidden\]/);
  assert.match(css, /\.search-result-value\.is-unavailable/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.search-hero/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.search-result-card/);
}

(async () => {
  await testArchiveSearchEnrichment();
  testSearchCardRendering();
  testCommercialSearchShellAndResponsiveStyles();
  console.log("commercial search experience, enriched archive results, and responsive states: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
