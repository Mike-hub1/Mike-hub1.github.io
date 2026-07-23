const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = readJson(path.join(root, "tools", "dongqiudi-player-profiles.json"));
const archiveIndex = readJson(path.join(root, "static", "api", "v1", "index.json"));

assert.ok(manifest.players.length > 0, "at least one Dongqiudi player mapping must be retained");

for (const entry of manifest.players) {
  const archiveUrl = archiveIndex.details.players[entry.playerId];
  assert.ok(archiveUrl, `${entry.playerId} must resolve to an archived player snapshot`);
  const player = readJson(path.join(root, archiveUrl.replace(/^\/+/, "")));
  const data = player.dongqiudiProfile;
  assert.equal(data.status, "available");
  assert.equal(data.externalPersonId, entry.personId);
  assert.equal(data.externalAbilityId, entry.abilityId);
  assert.equal(data.sources.runtimeCalls, false, "the archived page must not call Dongqiudi at runtime");
  assert.match(data.sources.playerPage, new RegExp(`${entry.personId}$`));
}

const mbappeEntry = manifest.players.find((entry) => entry.playerId === "fifa_player_389867");
assert.ok(mbappeEntry, "Mbappe must remain in the Dongqiudi manifest");
const mbappe = readJson(
  path.join(root, archiveIndex.details.players[mbappeEntry.playerId].replace(/^\/+/, ""))
);
const snapshot = mbappe.dongqiudiProfile;

assert.equal(mbappe.name, "姆巴佩");
assert.equal(mbappe.fullName, "Kylian Mbappé Lottin");
assert.equal(mbappe.birthDate, "1998-12-20");
assert.equal(mbappe.marketValue, 200_000_000);
assert.equal(snapshot.ability.overall, 91);
assert.deepEqual(
  Object.fromEntries(snapshot.ability.radar.map((metric) => [metric.name, metric.value])),
  { 速度: 96, 力量: 76, 防守: 37, 盘带: 92, 传球: 81, 射门: 91 }
);
assert.equal(snapshot.ability.categories.length, 7);
assert.equal(
  snapshot.ability.categories.reduce((total, category) => total + category.metrics.length, 0),
  33
);
assert.deepEqual(snapshot.ability.registeredPositions, ["ST", "LW", "LM"]);
assert.deepEqual(
  snapshot.ability.positionRatings.map((rating) => rating.code),
  snapshot.ability.positionRatings.map((rating) => rating.code).toSorted(),
  "position ratings must be deterministic"
);

assert.deepEqual(snapshot.profile.identity, {
  fullName: "Kylian Mbappé Lottin",
  nationality: "法国 / 喀麦隆",
  dateOfBirth: "1998-12-20",
  age: "27岁",
  heightCm: 178,
  weightKg: 75,
  preferredFoot: "右脚",
  position: "前锋",
  shirtNumber: "10",
  club: "皇家马德里",
  annualSalary: "3125万欧元",
  marketValue: "20000万欧元",
  marketValueEuro: 200_000_000,
  contractUntil: "2029-06-30",
});

const marketHistory = snapshot.profile.marketValueHistory;
assert.equal(marketHistory.length, 32);
assert.equal(marketHistory[0].date, "2015-12-02");
assert.equal(marketHistory[0].valueEuro, 50_000);
assert.equal(marketHistory.at(-1).date, "2026-07-22");
assert.equal(marketHistory.at(-1).valueEuro, 200_000_000);
assert.deepEqual(
  marketHistory.map((point) => point.date),
  marketHistory.map((point) => point.date).toSorted(),
  "market value history must be chronological"
);
for (const logoName of ["as-monaco.png", "paris-saint-germain.png", "real-madrid.png"]) {
  const logoPath = path.join(root, "static", "assets", "clubs", logoName);
  const logo = fs.readFileSync(logoPath);
  assert.ok(logo.length > 1_000, `${logoName} must retain a real club crest`);
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${logoName} must be a PNG`);
}

assert.equal(snapshot.profile.characteristics.styles.length, 8);
assert.ok(snapshot.profile.characteristics.veryStrong.includes("终结能力"));
assert.ok(snapshot.profile.characteristics.strong.includes("直接任意球"));
assert.ok(snapshot.profile.characteristics.weak.includes("争顶"));
assert.ok(snapshot.profile.characteristics.veryWeak.includes("防守贡献"));
assert.equal(snapshot.profile.transfers.length, 8);
assert.equal(snapshot.profile.honors.length, 18);
assert.equal(snapshot.profile.injuries.length, 26);

const app = fs.readFileSync(path.join(root, "static", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "static", "styles.css"), "utf8");
const profileLabelHelpers = app.slice(
  app.indexOf("function formatPlayerArchiveMarketValue"),
  app.indexOf("function renderPlayerProfileFacts")
);
const profileLabelContext = {};
vm.runInNewContext(
  `${profileLabelHelpers}
  this.fullNameLabel = playerProfileFullNameLabel;
  this.marketValueLabel = playerProfileMarketValueLabel;
  this.marketDateLabel = formatPlayerMarketDate;
  this.marketTeamAsset = playerMarketTeamAsset;`,
  profileLabelContext
);
assert.equal(
  profileLabelContext.fullNameLabel({ fullName: "Kylian Mbappé Lottin" }),
  "基利安·姆巴佩·洛坦"
);
assert.equal(
  profileLabelContext.marketValueLabel({ marketValue: "20000万欧元", marketValueEuro: 200_000_000 }),
  "2亿欧"
);
assert.equal(profileLabelContext.marketDateLabel("2026-07-22"), "2026年7月22日");
assert.equal(profileLabelContext.marketTeamAsset({ id: "1755" }).logoUrl, "/static/assets/clubs/real-madrid.png");
assert.match(app, /function renderPlayerDongqiudiProfile/);
assert.match(app, /id="player-dqd-panel-ability"/);
assert.match(app, /id="player-dqd-panel-profile"/);
assert.match(app, /id="player-dqd-panel-world-cup"/);
assert.match(app, /data-player-dqd-tab="ability"/);
assert.match(app, /data-player-dqd-tab="profile"/);
assert.match(app, /data-player-dqd-tab="world-cup"/);
assert.match(app, />球员能力<\/strong>/);
assert.match(app, />球员资料<\/strong>/);
assert.match(app, />世界杯数据<\/strong>/);
assert.match(app, /function renderPlayerWorldCupSchedule/);
assert.match(app, /class="player-world-cup-schedule"/);
assert.match(app, /id="player-world-cup-schedule-title">赛程<\/h2>/);
assert.doesNotMatch(app, /<h2>近期事件<\/h2>/);
assert.doesNotMatch(app, /class="panel player-events-panel"/);
assert.match(app, /\["Kylian Mbappé Lottin", "基利安·姆巴佩·洛坦"\]/);
assert.match(app, /function playerProfileMarketValueLabel/);
assert.match(app, /label: "身价", value: playerProfileMarketValueLabel\(identity\)/);
assert.match(app, /function drawPlayerAbilityRadar/);
assert.match(app, /function drawPlayerMarketHistory/);
assert.match(app, /function playerMarketAdaptiveLogoSizes/);
assert.match(app, /const PLAYER_MARKET_TEAM_ASSETS = new Map/);
assert.match(app, /function initPlayerMarketHistory/);
assert.match(app, /function selectPlayerMarketHistoryPoint/);
assert.match(app, /function revealPlayerMarketHistoryPoint/);
assert.match(app, /canvas\.addEventListener\("click"/);
assert.match(app, /canvas\.addEventListener\("keydown"/);
assert.match(app, /data-player-market-selection/);
assert.match(app, /class="player-market-chart-scroll"/);
assert.match(app, /横向滑动查看完整走势/);
assert.match(app, /class="player-profile-fact is-/);
assert.match(app, /class="player-characteristic-card is-/);
assert.doesNotMatch(app, /Market value history/i);
assert.doesNotMatch(app, /Playing profile/i);
assert.doesNotMatch(app, /个公开节点/);
assert.match(app, /class="player-ability-fact-grid"/);
assert.match(app, /class="player-ability-star-grid"/);
assert.doesNotMatch(app, /<figcaption>速度、射门、传球、盘带、防守与力量<\/figcaption>/);
assert.doesNotMatch(app, /class="player-dqd-header-meta"/);
assert.doesNotMatch(app, /class="player-dqd-footer"/);
assert.match(css, /\.player-dqd-panel\s*\{/);
assert.match(css, /\.player-dqd-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
assert.match(css, /\.player-world-cup-schedule\s*\{/);
assert.match(css, /\.player-ability-radar-canvas\s*\{/);
assert.match(css, /\.player-ability-star-grid\s*\{/);
assert.match(css, /\.player-market-history-canvas\s*\{/);
assert.match(css, /\.player-market-chart-scroll\s*\{[\s\S]*?overflow-x:\s*auto/);
assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.player-market-history-canvas\s*\{[\s\S]*?min-width:\s*720px/);
assert.match(css, /\.player-market-selection\s*\{/);
assert.match(css, /\.player-characteristic-card\s*\{/);
assert.match(css, /@media \(max-width: 480px\)\s*\{[\s\S]*?\.player-profile-facts\s*\{\s*grid-template-columns:\s*repeat\(2,/);
assert.doesNotMatch(css, /\.player-dqd-header-meta\s*\{/);
assert.doesNotMatch(css, /\.player-dqd-footer\s*\{/);

const marketChartSource = app.slice(
  app.indexOf("function drawPlayerMarketHistory"),
  app.indexOf("function updatePlayerMarketSelection")
);
assert.match(marketChartSource, /const logoSizes = playerMarketAdaptiveLogoSizes\(positions, selectedIndex\)/);
assert.match(marketChartSource, /const logoSize = logoSizes\[index\]/);
assert.doesNotMatch(marketChartSource, /context\.arc\(point\.x, point\.y/);

const adaptiveLogoSizeSource = app.slice(
  app.indexOf("function playerMarketAdaptiveLogoSizes"),
  app.indexOf("function drawPlayerMarketHistory")
);
const adaptiveLogoSizeContext = {};
vm.runInNewContext(
  `${adaptiveLogoSizeSource}
  this.getAdaptiveLogoSizes = playerMarketAdaptiveLogoSizes;`,
  adaptiveLogoSizeContext
);
assert.deepEqual(
  Array.from(
    adaptiveLogoSizeContext.getAdaptiveLogoSizes(
      [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
        { x: 45, y: 0 },
      ],
      -1
    )
  ),
  [8, 8, 26]
);
const selectedAdaptiveSizes = Array.from(
  adaptiveLogoSizeContext.getAdaptiveLogoSizes(
    [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 45, y: 0 },
    ],
    2
  )
);
assert.deepEqual(selectedAdaptiveSizes, [8, 8, 30]);
assert.ok(selectedAdaptiveSizes[0] / 2 + selectedAdaptiveSizes[1] / 2 <= 9);
assert.deepEqual(
  Array.from(
    adaptiveLogoSizeContext.getAdaptiveLogoSizes(
      [
        { x: 0, y: 0 },
        { x: 21, y: 21 },
      ],
      -1
    )
  ),
  [18, 18]
);

console.log("Dongqiudi player ability and profile archive: ok");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
