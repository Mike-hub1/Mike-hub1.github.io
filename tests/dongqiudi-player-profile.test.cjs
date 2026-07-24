const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = readJson(path.join(root, "tools", "dongqiudi-player-profiles.json"));
const archiveIndex = readJson(path.join(root, "static", "api", "v1", "index.json"));
const coverageReport = readJson(path.join(root, "tools", "dongqiudi-player-profile-report.json"));
const assetRegistry = readJson(path.join(root, "tools", "player-profile-asset-registry.json"));

assert.ok(manifest.players.length > 0, "at least one Dongqiudi player mapping must be retained");
assert.equal(
  manifest.players.length,
  Object.keys(archiveIndex.details.players).length,
  "every archived player must be present in the Dongqiudi manifest"
);
assert.equal(coverageReport.availableProfiles, coverageReport.totalPlayers);
assert.equal(coverageReport.totalPlayers, manifest.players.length);
assert.ok(
  coverageReport.availableAbilities >= Math.floor(coverageReport.totalPlayers * 0.9),
  "ability coverage must remain above 90%"
);
assert.ok(assetRegistry.summary.honorNames >= 400);
assert.ok(assetRegistry.summary.honorAssetsAvailable >= 200);
assert.ok(assetRegistry.summary.teamAssetsAvailable >= 1_000);
assert.equal(assetRegistry.summary.honorContentCollisions, 0);
assert.equal(assetRegistry.summary.teamContentCollisions, 0);

const generatedAssetUrls = new Set(
  [...Object.values(assetRegistry.honors), ...Object.values(assetRegistry.teams)]
    .map((row) => row.assetUrl)
    .filter((url) => url?.includes("/catalog/"))
);
for (const assetUrl of generatedAssetUrls) {
  assert.match(assetUrl, /^\/static\/assets\/(?:clubs|trophies)\/catalog\/[a-f0-9]{20}\.(?:png|jpg|webp)$/);
  const asset = fs.readFileSync(path.join(root, assetUrl.replace(/^\/+/, "")));
  const maximumBytes = assetUrl.includes("/trophies/") ? 256 * 1024 : 192 * 1024;
  assert.ok(asset.length <= maximumBytes, `${assetUrl} must remain web-sized`);
  const isPng = asset.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = asset[0] === 0xff && asset[1] === 0xd8;
  const isWebp =
    asset.subarray(0, 4).toString("ascii") === "RIFF" &&
    asset.subarray(8, 12).toString("ascii") === "WEBP";
  assert.ok(isPng || isJpeg || isWebp, `${assetUrl} must use a browser-compatible raster format`);
}

for (const entry of manifest.players) {
  const archiveUrl = archiveIndex.details.players[entry.playerId];
  assert.ok(archiveUrl, `${entry.playerId} must resolve to an archived player snapshot`);
  const player = readJson(path.join(root, archiveUrl.replace(/^\/+/, "")));
  const data = player.dongqiudiProfile;
  assert.equal(data.status, "available");
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.externalPersonId, entry.personId);
  assert.equal(data.externalAbilityId, entry.abilityId);
  assert.equal(data.coverage.profile, "available");
  assert.ok(data.profile?.identity, `${entry.playerId} must retain a normalized profile identity`);
  assert.ok(data.profile.identity.fullNameZh, `${entry.playerId} must retain a Chinese display name`);
  if (data.coverage.ability === "available") {
    assert.ok(data.ability?.radar?.length >= 3, `${entry.playerId} must retain its ability radar`);
  } else {
    assert.equal(data.ability, null, `${entry.playerId} must use the shared ability empty state`);
  }
  for (const point of data.profile.marketValueHistory || []) {
    if (point.team?.logoStatus === "available") {
      assert.match(point.team.logoUrl, /^\/static\/assets\/clubs\//);
      assert.ok(
        fs.existsSync(path.join(root, point.team.logoUrl.replace(/^\/+/, ""))),
        `${point.team.name} must resolve to a local club crest`
      );
    }
  }
  for (const honor of data.profile.honors || []) {
    assert.match(honor.logoSourceUrl, /^https:\/\//, `${honor.name} must retain upstream evidence`);
    if (honor.logoUrl) {
      assert.match(honor.logoUrl, /^\/static\/assets\/trophies\//);
      assert.ok(
        fs.existsSync(path.join(root, honor.logoUrl.replace(/^\/+/, ""))),
        `${honor.name} must resolve to a local trophy asset`
      );
    }
    if (honor.logoStatus === "withheld-shared-artwork") {
      assert.equal(honor.logoUrl, "", `${honor.name} must not expose a known shared placeholder`);
    }
  }
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

assert.deepEqual(
  Object.fromEntries(
    [
      "fullName",
      "fullNameZh",
      "nationality",
      "dateOfBirth",
      "age",
      "heightCm",
      "weightKg",
      "preferredFoot",
      "position",
      "shirtNumber",
      "club",
      "annualSalary",
      "marketValue",
      "marketValueEuro",
      "contractUntil",
    ].map((key) => [key, snapshot.profile.identity[key]])
  ),
  {
  fullName: "Kylian Mbappé Lottin",
  fullNameZh: "基利安·姆巴佩·洛坦",
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
  }
);
assert.match(snapshot.profile.identity.clubLogoUrl, /^\/static\/assets\/clubs\//);
assert.equal(snapshot.profile.identity.clubLogoStatus, "available");

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
for (const honor of snapshot.profile.honors) {
  assert.match(honor.logoSourceUrl, /^https:\/\//, `${honor.name} must retain its upstream icon evidence`);
}

const app = fs.readFileSync(path.join(root, "static", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "static", "styles.css"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
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
assert.match(app, /function playerAbilityAvailable/);
assert.match(app, /function playerProfileAvailable/);
assert.match(app, /const initialTab = abilityAvailable \? "ability" : profileAvailable \? "profile" : "world-cup"/);
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
assert.match(app, /function playerMarketTimelineLogoLayout/);
assert.doesNotMatch(app, /function playerMarketAdaptiveLogoSizes/);
assert.match(app, /const PLAYER_MARKET_TEAM_ASSETS = new Map/);
assert.match(app, /function initPlayerMarketHistory/);
assert.match(app, /function selectPlayerMarketHistoryPoint/);
assert.match(app, /function revealPlayerMarketHistoryPoint/);
assert.match(app, /canvas\.addEventListener\("click"/);
assert.match(app, /canvas\.addEventListener\("keydown"/);
assert.match(app, /data-player-market-selection/);
assert.match(app, /class="player-market-chart-scroll"/);
assert.match(app, /横向滑动查看完整走势/);
assert.match(app, /点击上方队徽或图中节点/);
assert.match(app, /class="player-profile-fact is-/);
assert.match(app, /class="player-characteristic-card is-/);
assert.match(app, /function groupPlayerHonors/);
assert.match(app, /class="player-profile-transfer-item"/);
assert.match(app, /class="player-profile-honor-groups"/);
assert.match(app, /class="player-profile-honor-card"/);
assert.match(app, /if \(isRecord && row\.logoUrl\)/);
assert.match(app, /Object\.hasOwn\(row, "logoStatus"\)/);
assert.match(app, /label: "国家队荣誉"/);
assert.match(app, /label: "俱乐部荣誉"/);
assert.match(app, /label: "个人奖项"/);
assert.doesNotMatch(app, /class="player-profile-honor-list"/);
assert.doesNotMatch(app, /Market value history/i);
assert.doesNotMatch(app, /Playing profile/i);
assert.doesNotMatch(app, /个公开节点/);
assert.match(app, /暂无可核验的历年身价节点/);
assert.match(app, /暂无公开技术特点标签/);
assert.match(app, /暂无已公开的冠军或个人奖项记录/);
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
assert.match(css, /\.player-profile-transfer-item\s*\{/);
assert.match(css, /\.player-profile-honor-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
assert.match(css, /\.player-profile-honor-card figure img\s*\{/);
assert.match(css, /\.player-injury-overview\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
assert.match(css, /\.player-profile-injury-item\s*\{/);
assert.match(css, /\.player-profile-injury-track::after\s*\{/);
assert.doesNotMatch(css, /\.player-profile-injury-list\s*\{/);
assert.match(css, /@media \(max-width: 480px\)\s*\{[\s\S]*?\.player-profile-honor-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
assert.match(css, /@media \(max-width: 480px\)\s*\{[\s\S]*?\.player-profile-facts\s*\{\s*grid-template-columns:\s*repeat\(2,/);
assert.doesNotMatch(css, /\.player-dqd-header-meta\s*\{/);
assert.doesNotMatch(css, /\.player-dqd-footer\s*\{/);

const archiveHelperSource = app.slice(
  app.indexOf("const PLAYER_PROFILE_CLUB_ASSETS"),
  app.indexOf("function renderPlayerProfileArchives")
);
const archiveHelperContext = {};
vm.runInNewContext(
  `${archiveHelperSource}
  this.groupHonors = groupPlayerHonors;
  this.honorCategory = playerHonorCategory;
  this.honorAsset = playerHonorAsset;`,
  archiveHelperContext
);
const mergedHonors = archiveHelperContext.groupHonors([
  { name: "测试奖杯", times: 1, importance: 2, records: [{ season: "2024", team: "甲队" }] },
  { name: "测试奖杯", times: 1, importance: 3, records: [{ season: "2025", team: "乙队" }] },
]);
assert.equal(mergedHonors.length, 1, "same-named trophies must render as one honor card");
assert.equal(mergedHonors[0].times, 2);
assert.equal(mergedHonors[0].records.length, 2);
assert.equal(archiveHelperContext.honorCategory("世界杯冠军"), "national");
assert.equal(archiveHelperContext.honorCategory("法国杯冠军"), "club");
assert.equal(archiveHelperContext.honorCategory("欧洲金靴"), "individual");
assert.equal(archiveHelperContext.honorAsset("世界杯冠军").url, "/static/assets/trophies/world-cup.png");
assert.equal(archiveHelperContext.honorAsset("欧洲金靴").url, "/static/assets/trophies/european-golden-shoe.png");
assert.equal(archiveHelperContext.honorAsset("盖德-穆勒奖").url, "/static/assets/trophies/gerd-muller-trophy.png");
assert.equal(
  archiveHelperContext.honorAsset("年度最佳球员").url,
  "/static/assets/trophies/france-football-player-of-year.png"
);
assert.equal(archiveHelperContext.honorAsset("年度最佳球员").kind, "trophy");
assert.equal(archiveHelperContext.honorAsset("科帕奖").url, "/static/assets/trophies/kopa-trophy.png");
assert.notEqual(
  archiveHelperContext.honorAsset("盖德-穆勒奖").url,
  archiveHelperContext.honorAsset("科帕奖").url,
  "Gerd Müller and Kopa must not reuse the same upstream icon"
);
assert.equal(archiveHelperContext.honorAsset("未核验奖项").kind, "fallback");
assert.equal(
  archiveHelperContext.honorAsset({
    name: "年度最佳球员",
    logoUrl: "",
    logoStatus: "withheld-shared-artwork",
  }).kind,
  "fallback",
  "a scoped or shared upstream placeholder must not fall back to a globally named trophy"
);

const archiveRenderSource = app.slice(
  app.indexOf("const PLAYER_PROFILE_CLUB_ASSETS"),
  app.indexOf("function renderPlayerProfilePanel")
);
const archiveRenderContext = {};
vm.runInNewContext(
  `function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function formatPlayerArchiveMarketValue(value) {
    const amount = Number(value);
    if (amount >= 100_000_000) return \`\${Number((amount / 100_000_000).toFixed(2))}亿欧\`;
    if (amount >= 10_000) return \`\${Number((amount / 10_000).toFixed(1))}万欧\`;
    return \`\${amount}欧\`;
  }
  ${archiveRenderSource}
  this.renderArchives = renderPlayerProfileArchives;`,
  archiveRenderContext
);
const archiveMarkup = archiveRenderContext.renderArchives(snapshot.profile);
assert.equal((archiveMarkup.match(/class="player-profile-transfer-item"/g) || []).length, 8);
assert.equal((archiveMarkup.match(/class="player-profile-honor-card"/g) || []).length, 18);
assert.doesNotMatch(archiveMarkup, /<figcaption>/, "honor cards must not render provenance captions");
assert.doesNotMatch(archiveMarkup, /懂球帝公开数据|官网实物|France Football 实物/);
assert.equal((archiveMarkup.match(/class="player-profile-honor-group is-/g) || []).length, 3);
assert.equal((archiveMarkup.match(/class="player-profile-injury-item is-/g) || []).length, 26);
assert.match(archiveMarkup, /class="player-injury-overview"/);
assert.match(archiveMarkup, /累计伤停/);
assert.match(archiveMarkup, /301<small>天<\/small>/);
assert.match(archiveMarkup, /62<small>场<\/small>/);
assert.match(archiveMarkup, /<small>类 · 50 次<\/small>/);
assert.match(archiveMarkup, />1\.8亿欧<\/b>/);

for (const trophyName of [
  "world-cup.png",
  "fifa-intercontinental-cup.png",
  "uefa-super-cup.png",
  "european-golden-shoe.png",
  "ligue-1-champion.png",
  "fifa-world-cup-golden-boot.png",
  "coupe-de-la-ligue.png",
  "coupe-de-france.png",
  "trophee-des-champions.png",
  "golden-boy.png",
  "top-scorer.png",
  "kopa-trophy.png",
  "uefa-nations-league.png",
  "uefa-u19-euro.png",
]) {
  const trophy = fs.readFileSync(path.join(root, "static", "assets", "trophies", trophyName));
  assert.ok(trophy.length > 1_000, `${trophyName} must retain a real trophy illustration`);
  assert.deepEqual([...trophy.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${trophyName} must be a PNG`);
}
for (const trophyName of [
  "gerd-muller-trophy.png",
  "france-football-player-of-year.png",
  "unfp-player-of-season.png",
  "coupe-gambardella.png",
]) {
  const trophy = fs.readFileSync(path.join(root, "static", "assets", "trophies", trophyName));
  assert.ok(trophy.length > 1_000, `${trophyName} must retain its official-source trophy cutout`);
  assert.ok(trophy.length < 96 * 1024, `${trophyName} must remain web-sized`);
  assert.deepEqual([...trophy.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${trophyName} must be a PNG`);
  assert.equal(trophy.readUInt32BE(16), 256, `${trophyName} must be 256px wide`);
  assert.equal(trophy.readUInt32BE(20), 256, `${trophyName} must be 256px high`);
  assert.equal(trophy[25], 6, `${trophyName} must retain an RGBA transparency channel`);
  assert.doesNotMatch(serviceWorker, new RegExp(`/static/assets/trophies/${trophyName.replaceAll(".", "\\.")}`));
}
assert.ok(
  fs.existsSync(path.join(root, "static", "assets", "trophies", "ATTRIBUTION.md")),
  "trophy asset licenses must be retained"
);

const marketChartSource = app.slice(
  app.indexOf("function drawPlayerMarketHistory"),
  app.indexOf("function updatePlayerMarketSelection")
);
assert.match(marketChartSource, /const timelineLogos = playerMarketTimelineLogoLayout\(positions, selectedIndex\)/);
assert.match(marketChartSource, /context\.fillText\(year, yearX, 4\)/);
assert.doesNotMatch(marketChartSource, /frame\.top \+ height \+ 14/);
assert.match(marketChartSource, /context\.setLineDash\(selected \? \[4, 4\] : \[2, 5\]\)/);
assert.match(marketChartSource, /context\.arc\(point\.x, point\.y, selected \? 4\.2 : 2\.2/);
assert.match(marketChartSource, /logoX: timelineLogos\[index\]\.x/);
assert.match(app, /const logoDistance = \(area\.logoX - x\) \*\* 2 \+ \(area\.logoY - y\) \*\* 2/);
const timelineLogoDrawingSource = marketChartSource.slice(
  marketChartSource.indexOf("const drawTimelineLogo"),
  marketChartSource.indexOf("nodeOrder.forEach(drawTimelineLogo)")
);
assert.doesNotMatch(timelineLogoDrawingSource, /context\.arc/);

const timelineLogoLayoutSource = app.slice(
  app.indexOf("function playerMarketTimelineLogoLayout"),
  app.indexOf("function drawPlayerMarketHistory")
);
const timelineLogoLayoutContext = {};
vm.runInNewContext(
  `${timelineLogoLayoutSource}
  this.getTimelineLogoLayout = playerMarketTimelineLogoLayout;`,
  timelineLogoLayoutContext
);
assert.deepEqual(
  Array.from(
    timelineLogoLayoutContext
      .getTimelineLogoLayout(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 22, y: 0 },
        { x: 40, y: 0 },
      ],
      2
    )
      .map(({ y, size, lane }) => ({ y, size, lane }))
  ),
  [
    { y: 37, size: 15, lane: 0 },
    { y: 58, size: 15, lane: 1 },
    { y: 37, size: 20, lane: 0 },
    { y: 58, size: 15, lane: 1 },
  ]
);
const marketHistoryTimes = marketHistory.map((row) => new Date(`${row.date}T00:00:00Z`).getTime());
const marketHistoryMinimumTime = Math.min(...marketHistoryTimes);
const marketHistoryMaximumTime = Math.max(...marketHistoryTimes);
const marketHistoryTimelinePositions = marketHistoryTimes.map((timestamp) => ({
  x: 58 + ((timestamp - marketHistoryMinimumTime) / (marketHistoryMaximumTime - marketHistoryMinimumTime)) * 644,
  y: 0,
}));
const marketHistoryTimelineLogos = Array.from(
  timelineLogoLayoutContext.getTimelineLogoLayout(
    marketHistoryTimelinePositions,
    marketHistoryTimelinePositions.length - 1
  )
);
for (let index = 0; index < marketHistoryTimelineLogos.length; index += 1) {
  for (let otherIndex = index + 1; otherIndex < marketHistoryTimelineLogos.length; otherIndex += 1) {
    const logo = marketHistoryTimelineLogos[index];
    const otherLogo = marketHistoryTimelineLogos[otherIndex];
    if (logo.lane !== otherLogo.lane) continue;
    const requiredDistance = logo.size / 2 + otherLogo.size / 2 + 3;
    assert.ok(
      Math.abs(logo.x - otherLogo.x) >= requiredDistance,
      `market timeline logos ${index} and ${otherIndex} must not overlap`
    );
  }
}

console.log("Dongqiudi player ability and profile archive: ok");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
