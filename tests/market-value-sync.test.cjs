const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const apiRoot = path.join(root, "static", "api", "v1");
const apiIndex = JSON.parse(fs.readFileSync(path.join(apiRoot, "index.json"), "utf8"));

function readArchive(url) {
  return JSON.parse(fs.readFileSync(path.join(root, String(url).replace(/^\/+/, "")), "utf8"));
}

const playersPayload = readArchive(apiIndex.resources.players);
const leaderboard = readArchive(apiIndex.resources.leaderboards.market_values);
const report = JSON.parse(
  fs.readFileSync(path.join(root, "tools", "dongqiudi-market-value-report.json"), "utf8"),
);
const source = fs.readFileSync(path.join(root, "static", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "static", "styles.css"), "utf8");

const players = playersPayload.items || [];
const byId = new Map(players.map((player) => [player.id, player]));
const expectedLatest = new Map([
  ["fifa_player_419652", [220_000_000, "2.2亿欧"]],
  ["fifa_player_484320", [220_000_000, "2.2亿欧"]],
  ["fifa_player_389867", [200_000_000, "2亿欧"]],
  ["fifa_player_485655", [170_000_000, "1.7亿欧"]],
  ["fifa_player_448202", [160_000_000, "1.6亿欧"]],
]);

assert.equal(players.length, 1247);
for (const [id, [value, label]] of expectedLatest) {
  const player = byId.get(id);
  assert.ok(player, `${id} must be present`);
  assert.equal(player.marketValue, value);
  assert.equal(player.marketValueLabelZh, label);
  assert.equal(player.marketValueSource, "懂球帝");
  assert.equal(player.marketValueStatus, "verified");
  assert.ok(player.marketValueCheckedAt.startsWith("2026-07-27T"));
}

assert.equal(leaderboard.metric, "market_values");
assert.equal(leaderboard.snapshotMode, "dongqiudi-market-values");
assert.match(leaderboard.sourceNote, /懂球帝/);
assert.equal(leaderboard.items.length, 100);
assert.equal(leaderboard.items[0].rank, 1);
assert.equal(leaderboard.items[1].rank, 1);
assert.equal(leaderboard.items[2].rank, 3);

for (let index = 1; index < leaderboard.items.length; index += 1) {
  assert.ok(
    leaderboard.items[index - 1].value >= leaderboard.items[index].value,
    `market values must be descending at row ${index + 1}`,
  );
}

for (const row of leaderboard.items) {
  const sourcePlayer = byId.get(row.player.id);
  assert.ok(sourcePlayer, `${row.player.id} must resolve to the global player list`);
  assert.equal(row.value, sourcePlayer.marketValue);
  assert.equal(row.valueLabel, sourcePlayer.marketValueLabelZh);
  assert.equal(row.player.marketValueSource, "懂球帝");
}

const elite = leaderboard.items.filter((row) => row.value >= 100_000_000);
assert.equal(elite.length, 22);
assert.equal(report.highValuePlayers.length, 22);
assert.equal(report.highValueThreshold, 100_000_000);
assert.equal(report.totalPlayers, 1247);
assert.equal(report.failures.length, 0);

const unavailable = new Set(report.unavailablePlayers.map((player) => player.id));
assert.equal(unavailable.size, 5);
for (const id of unavailable) {
  const player = byId.get(id);
  assert.equal(player.marketValue, 0);
  assert.equal(player.marketValueStatus, "unavailable");
  assert.ok(!leaderboard.items.some((row) => row.player.id === id));
}

assert.match(source, /MARKET_VALUE_ELITE_THRESHOLD = 100_000_000/);
assert.match(source, /renderMarketValueOverview/);
assert.match(source, /leaderboard-list-row-market-elite/);
assert.match(source, /market-elite-badge/);
assert.match(source, /最新身价/);
assert.match(css, /\.market-value-overview/);
assert.match(css, /\.leaderboard-list-row-market-elite/);
assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.market-value-overview/);

console.log("latest Dongqiudi market values, tied ranking, and €100m presentation: ok");
