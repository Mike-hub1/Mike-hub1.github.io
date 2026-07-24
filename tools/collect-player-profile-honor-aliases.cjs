const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const REGISTRY_PATH = path.join(__dirname, "player-profile-asset-registry.json");
const OUTPUT_PATH = path.join(__dirname, "player-profile-honor-aliases.json");
const USER_AGENT = "WC26HonorResearch/1.0 (public football honor name audit)";
const CONCURRENCY = 8;
const RETRIES = 3;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function snapshotPath(relativeUrl) {
  return path.join(ROOT, relativeUrl.replace(/^\/+/, ""));
}

async function fetchProfile(externalPersonId) {
  const url = new URL(`https://api.dongqiudi.com/data/v1/detail/person/${externalPersonId}`);
  url.searchParams.set("app", "dqd");
  url.searchParams.set("lang", "en");
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { url: url.href, payload: await response.json() };
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await wait(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function mapConcurrent(values, callback) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, () => worker()));
  return results;
}

function chooseRepresentativePlayers(players, honorIds) {
  const remaining = new Set(honorIds);
  const candidates = [...players];
  const selected = [];
  while (remaining.size) {
    let bestIndex = -1;
    let bestCoverage = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const coverage = [...candidates[index].honorIds].filter((id) => remaining.has(id)).length;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const [best] = candidates.splice(bestIndex, 1);
    selected.push(best);
    best.honorIds.forEach((id) => remaining.delete(id));
  }
  return { selected, missingHonorIds: [...remaining].sort() };
}

async function main() {
  const index = readJson(INDEX_PATH);
  const registry = readJson(REGISTRY_PATH);
  const unresolvedRows = Object.values(registry.honors).filter((row) => !row.assetUrl);
  const unresolvedHonorIds = new Set(unresolvedRows.flatMap((row) => row.honorIds.map(String)));
  const chineseNameByHonorId = new Map(
    unresolvedRows.flatMap((row) => row.honorIds.map((honorId) => [String(honorId), row.name]))
  );
  const players = [];

  for (const [playerId, relativeUrl] of Object.entries(index.details?.players || {})) {
    const snapshot = readJson(snapshotPath(relativeUrl));
    const profile = snapshot.dongqiudiProfile;
    const honorIds = new Set(
      (profile?.profile?.honors || [])
        .map((honor) => String(honor.honorId || ""))
        .filter((honorId) => unresolvedHonorIds.has(honorId))
    );
    if (!honorIds.size || !profile?.externalPersonId) continue;
    players.push({
      playerId,
      playerName: profile.profile?.identity?.fullNameZh || snapshot.name || playerId,
      externalPersonId: String(profile.externalPersonId),
      honorIds,
    });
  }

  const selection = chooseRepresentativePlayers(players, unresolvedHonorIds);
  let completed = 0;
  const responses = await mapConcurrent(selection.selected, async (player) => {
    try {
      return { player, ...(await fetchProfile(player.externalPersonId)) };
    } catch (error) {
      return { player, error: error.message };
    } finally {
      completed += 1;
      if (completed % 20 === 0 || completed === selection.selected.length) {
        console.log(`English honor names ${completed}/${selection.selected.length}`);
      }
    }
  });

  const aliasesByHonorId = new Map();
  const sourcePages = new Set();
  const errors = [];
  for (const response of responses) {
    if (response.error) {
      errors.push({
        playerId: response.player.playerId,
        externalPersonId: response.player.externalPersonId,
        error: response.error,
      });
      continue;
    }
    sourcePages.add(response.url);
    for (const honor of response.payload?.honor_info || []) {
      const honorId = String(honor.honor_id || "");
      if (!unresolvedHonorIds.has(honorId) || !honor.name) continue;
      const aliases = aliasesByHonorId.get(honorId) || new Set();
      aliases.add(String(honor.name).trim());
      aliasesByHonorId.set(honorId, aliases);
    }
  }

  const honors = {};
  for (const row of unresolvedRows.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))) {
    honors[row.name] = {
      honorIds: row.honorIds.map(String),
      aliases: [
        ...new Set(
          row.honorIds.flatMap((honorId) => [...(aliasesByHonorId.get(String(honorId)) || [])])
        ),
      ].sort(),
    };
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "懂球帝 App 公开数据层",
      locale: "en",
      representativePlayers: selection.selected.length,
      pagesFetched: sourcePages.size,
    },
    summary: {
      unresolvedHonors: unresolvedRows.length,
      honorIds: unresolvedHonorIds.size,
      honorsWithEnglishAliases: Object.values(honors).filter((row) => row.aliases.length).length,
      missingHonorIds: [
        ...new Set([
          ...selection.missingHonorIds,
          ...[...unresolvedHonorIds].filter((honorId) => !aliasesByHonorId.has(honorId)),
        ]),
      ].sort(),
      errors,
    },
    honors,
  };
  fs.writeFileSync(OUTPUT_PATH, stableJson(report));
  console.log(
    `Honor aliases complete: ${report.summary.honorsWithEnglishAliases}/${report.summary.unresolvedHonors}; ` +
      `${report.summary.missingHonorIds.length} missing honor IDs.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
