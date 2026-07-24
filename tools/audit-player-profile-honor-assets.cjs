const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const args = new Set(process.argv.slice(2));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function localAssetPath(assetUrl) {
  if (!String(assetUrl || "").startsWith("/")) return "";
  return path.join(ROOT, assetUrl.replace(/^\/+/, ""));
}

const index = readJson(INDEX_PATH);
const playerPaths = Object.entries(index.paths || {})
  .filter(([apiPath]) => /^\/players\/fifa_player_\d+$/.test(apiPath))
  .sort(([left], [right]) => left.localeCompare(right, "en"));

const missingByName = new Map();
const broken = [];
let honorEntries = 0;
let withAsset = 0;

for (const [apiPath, assetPath] of playerPaths) {
  const snapshotPath = path.join(ROOT, String(assetPath).replace(/^\/+/, ""));
  const snapshot = readJson(snapshotPath);
  const honors = snapshot.dongqiudiProfile?.profile?.honors || [];

  for (const honor of honors) {
    honorEntries += 1;
    const logoUrl = String(honor.logoUrl || "");
    if (logoUrl) {
      withAsset += 1;
      const filePath = localAssetPath(logoUrl);
      if (filePath && !fs.existsSync(filePath)) {
        broken.push({
          apiPath,
          playerId: snapshot.id,
          playerName: snapshot.name,
          honorId: String(honor.honorId || ""),
          honorName: honor.name,
          logoUrl,
        });
      }
      continue;
    }

    const name = String(honor.name || "未命名荣誉");
    const row = missingByName.get(name) || {
      name,
      entries: 0,
      wins: 0,
      honorIds: new Set(),
      category: honor.category || "",
      players: [],
    };
    row.entries += 1;
    row.wins += Number(honor.times) || 0;
    if (honor.honorId) row.honorIds.add(String(honor.honorId));
    row.players.push({
      id: snapshot.id,
      name: snapshot.name,
      records: honor.records || [],
    });
    missingByName.set(name, row);
  }
}

const missing = [...missingByName.values()]
  .map((row) => ({
    ...row,
    honorIds: [...row.honorIds].sort(),
  }))
  .sort((left, right) => right.entries - left.entries || left.name.localeCompare(right.name, "zh-CN"));

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    playerPages: playerPaths.length,
    honorEntries,
    withAsset,
    missingEntries: honorEntries - withAsset,
    uniqueMissingNames: missing.length,
    brokenLocalAssets: broken.length,
  },
  missing,
  broken,
};

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(
    [
      `${report.summary.playerPages} player pages`,
      `${report.summary.honorEntries} honor entries`,
      `${report.summary.withAsset} with verified/localized assets`,
      `${report.summary.missingEntries} unresolved entries`,
      `${report.summary.uniqueMissingNames} unresolved names`,
      `${report.summary.brokenLocalAssets} broken local assets`,
    ].join(" · ")
  );
  for (const row of missing) {
    const contexts = row.players
      .slice(0, 3)
      .map((player) => {
        const record = player.records[0];
        const suffix = record
          ? ` (${[record.team, record.season].filter(Boolean).join(" · ")})`
          : "";
        return `${player.name}${suffix}`;
      })
      .join("；");
    console.log(`${row.entries}\t${row.name}\t${row.honorIds.join(",")}\t${contexts}`);
  }
}

if (args.has("--strict") && broken.length) {
  process.exitCode = 1;
}
