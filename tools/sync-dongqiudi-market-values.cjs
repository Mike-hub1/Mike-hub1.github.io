const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const API_INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const REPORT_PATH = path.join(__dirname, "dongqiudi-market-value-report.json");
const MATERIAL_API_ROOT = "https://api.dongqiudi.com/data/v1/detail/person";
const PUBLIC_PLAYER_ROOT = "https://pc.dongqiudi.com/player";
const USER_AGENT = "Mozilla/5.0 (compatible; WC26StaticArchive/3.0)";
const HIGH_VALUE_THRESHOLD = 100_000_000;
const LEADERBOARD_LIMIT = 100;

const options = parseOptions(process.argv.slice(2));

function parseOptions(argv) {
  const valueOf = (name, fallback) => {
    const prefix = `--${name}=`;
    const value = argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
    return value === undefined ? fallback : value;
  };
  const integerOf = (name, fallback, minimum = 0) => {
    const value = Number.parseInt(valueOf(name, String(fallback)), 10);
    return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
  };
  return {
    checkOnly: argv.includes("--check"),
    refresh: argv.includes("--refresh"),
    concurrency: integerOf("concurrency", 8, 1),
    retries: integerOf("retries", 3, 0),
    limit: integerOf("limit", Number.MAX_SAFE_INTEGER, 1),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function writeIfChanged(filePath, value) {
  const next = stableJson(value);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (current === next) return false;
  if (!options.checkOnly) fs.writeFileSync(filePath, next);
  return true;
}

function archivePath(url) {
  return path.join(ROOT, String(url || "").replace(/^\/+/, ""));
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMarketValue(value) {
  const amount = asNumber(value);
  if (amount === null || amount <= 0) return { label: "", labelZh: "" };
  const label =
    amount >= 1_000_000
      ? `€${(amount / 1_000_000).toFixed(2)}m`
      : `€${new Intl.NumberFormat("en-US").format(amount)}`;
  const labelZh =
    amount >= 100_000_000
      ? `${(amount / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}亿欧`
      : amount >= 10_000
        ? `${Math.round(amount / 10_000)}万欧`
        : `${new Intl.NumberFormat("zh-CN").format(amount)}欧`;
  return { label, labelZh };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchMarketValue(entry) {
  const url = `${MATERIAL_API_ROOT}/${encodeURIComponent(entry.personId)}?app=dqd&lang=zh-cn`;
  let lastError = null;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      const personId = String(payload.base_info?.person_id || "");
      if (personId !== entry.personId) throw new Error(`person ID mismatch: ${personId || "empty"}`);
      const rawValue = asNumber(payload.base_info?.market_value);
      const marketValue = rawValue === null ? null : rawValue * 10_000;
      if (marketValue === null || marketValue < 0) throw new Error("market value missing");
      return {
        marketValue,
        rawLabel:
          (Array.isArray(payload.base_info_v_1)
            ? payload.base_info_v_1.find((row) => String(row?.type || "").trim() === "身价")?.value
            : "") || "",
      };
    } catch (error) {
      lastError = error;
      if (attempt >= options.retries || (!error.retryable && error.name !== "AbortError")) break;
      await wait(Math.min(6_000, 450 * 2 ** attempt + Math.round(Math.random() * 300)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${lastError?.message || "unknown fetch error"}: ${url}`);
}

function discoverEntries(index, players) {
  return players.map((player) => {
    const detailUrl = index.details?.players?.[player.id] || index.paths?.[`/players/${player.id}`];
    if (!detailUrl) throw new Error(`player detail missing: ${player.id}`);
    const detailPath = archivePath(detailUrl);
    const detail = readJson(detailPath);
    const personId = String(detail.dongqiudiProfile?.externalPersonId || "");
    if (!/^\d+$/.test(personId)) throw new Error(`Dongqiudi person ID missing: ${player.id}`);
    const currentValue = asNumber(detail.marketValue);
    return {
      player,
      detail,
      detailPath,
      personId,
      currentValue: currentValue === null || currentValue < 0 ? 0 : currentValue,
      currentCheckedAt:
        player.marketValueCheckedAt ||
        detail.marketValueCheckedAt ||
        detail.dongqiudiProfile?.checkedAt ||
        "",
    };
  });
}

async function refreshEntries(entries) {
  if (!options.refresh) {
    return entries.map((entry) => ({
      entry,
      marketValue: entry.currentValue,
      checkedAt: entry.currentCheckedAt,
      fresh: false,
      rawLabel: entry.detail.dongqiudiProfile?.profile?.identity?.marketValue || "",
    }));
  }

  const selected = entries.slice(0, options.limit);
  if (selected.length !== entries.length) {
    throw new Error(`--limit cannot be used for a production refresh (${selected.length}/${entries.length})`);
  }
  const checkedAt = new Date().toISOString();
  const results = new Array(entries.length);
  const failures = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      const entry = entries[index];
      try {
        const fresh = await fetchMarketValue(entry);
        results[index] = { entry, ...fresh, checkedAt, fresh: true };
      } catch (error) {
        failures.push({
          playerId: entry.player.id,
          name: entry.player.name,
          personId: entry.personId,
          message: error.message,
        });
      } finally {
        completed += 1;
        if (completed % 100 === 0 || completed === entries.length) {
          console.log(`Market values ${completed}/${entries.length} · failed ${failures.length}`);
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, entries.length) }, () => worker()),
  );
  if (failures.length) {
    const preview = failures.slice(0, 8).map((failure) => `${failure.playerId}: ${failure.message}`).join("\n");
    throw new Error(`market value refresh failed for ${failures.length} player(s)\n${preview}`);
  }
  return results;
}

function applyValueToDetail(result) {
  const { entry, marketValue, checkedAt, rawLabel } = result;
  const detail = entry.detail;
  const changed =
    Number(detail.marketValue) !== marketValue ||
    detail.marketValueSource !== "懂球帝" ||
    detail.marketValueStatus !== (marketValue > 0 ? "verified" : "unavailable");
  if (!changed) return { detail, changed: false };
  const labels = formatMarketValue(marketValue);
  detail.marketValue = marketValue;
  detail.marketValueLabel = labels.label;
  detail.marketValueLabelZh = labels.labelZh;
  detail.marketValueRawLabel = labels.label;
  detail.marketValueSource = "懂球帝";
  detail.marketValueUrl = `${PUBLIC_PLAYER_ROOT}/${entry.personId}`;
  detail.marketValueCheckedAt = checkedAt;
  detail.marketValueConfidence = "high";
  detail.marketValueStatus = marketValue > 0 ? "verified" : "unavailable";
  if (detail.dongqiudiProfile) {
    detail.dongqiudiProfile.marketValueCheckedAt = checkedAt;
    const identity = detail.dongqiudiProfile.profile?.identity;
    if (identity) {
      identity.marketValueEuro = marketValue;
      if (rawLabel) identity.marketValue = rawLabel;
    }
  }
  return { detail, changed: true };
}

function applyValueToListPlayer(result) {
  const { entry, marketValue, checkedAt } = result;
  const labels = formatMarketValue(marketValue);
  return {
    ...entry.player,
    marketValue,
    marketValueLabel: labels.label,
    marketValueLabelZh: labels.labelZh,
    marketValueRawLabel: labels.label,
    marketValueSource: "懂球帝",
    marketValueUrl: `${PUBLIC_PLAYER_ROOT}/${entry.personId}`,
    marketValueCheckedAt: checkedAt,
    marketValueConfidence: "high",
    marketValueStatus: marketValue > 0 ? "verified" : "unavailable",
  };
}

function leaderboardPlayer(player) {
  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    shortName: player.shortName,
    fullName: player.fullName,
    birthDate: player.birthDate,
    nationalityCode: player.nationalityCode,
    position: player.position,
    photoUrl: player.photoUrl,
    photoUrlOriginal: player.photoUrlOriginal,
    headshotUrl: player.headshotUrl,
    marketValue: player.marketValue,
    marketValueLabel: player.marketValueLabel,
    marketValueLabelZh: player.marketValueLabelZh,
    marketValueRawLabel: player.marketValueRawLabel,
    marketValueSource: player.marketValueSource,
    marketValueUrl: player.marketValueUrl,
    marketValueCheckedAt: player.marketValueCheckedAt,
    marketValueConfidence: player.marketValueConfidence,
    marketValueStatus: player.marketValueStatus,
  };
}

function buildLeaderboard(players, current, generatedAt) {
  const ranked = [...players]
    .filter((player) => Number(player.marketValue) > 0)
    .sort(
      (left, right) =>
        Number(right.marketValue) - Number(left.marketValue) ||
        String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"),
    )
    .slice(0, LEADERBOARD_LIMIT);
  let previousValue = null;
  let previousRank = 0;
  const items = ranked.map((player, index) => {
    const value = Number(player.marketValue);
    const rank = value === previousValue ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return {
      rank,
      player: leaderboardPlayer(player),
      team: player.team,
      value,
      valueLabel: player.marketValueLabelZh,
      tieBreak: { marketValueEur: value },
    };
  });
  return {
    ...current,
    metric: "market_values",
    items,
    generatedAt,
    snapshotMode: "dongqiudi-market-values",
    sourceNote: "懂球帝 App 公开数据层身价快照",
    realtime: {
      ...(current.realtime || {}),
      active: false,
      locked: true,
    },
    freshness: {
      ...(current.freshness || {}),
      generatedAt,
      cache: "static-archive",
    },
  };
}

async function main() {
  const index = readJson(API_INDEX_PATH);
  const playersPath = archivePath(index.resources?.players);
  const leaderboardPath = archivePath(index.resources?.leaderboards?.market_values);
  const playersPayload = readJson(playersPath);
  const leaderboardPayload = readJson(leaderboardPath);
  const previousReport = fs.existsSync(REPORT_PATH) ? readJson(REPORT_PATH) : null;
  const entries = discoverEntries(index, playersPayload.items || []);
  const results = await refreshEntries(entries);
  const generatedAt = options.refresh
    ? results[0]?.checkedAt || new Date().toISOString()
    : results.map((result) => result.checkedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();

  let detailFilesChanged = 0;
  let marketValuesChanged = 0;
  results.forEach((result) => {
    const applied = applyValueToDetail(result);
    if (applied.changed) marketValuesChanged += 1;
    if (writeIfChanged(result.entry.detailPath, applied.detail)) detailFilesChanged += 1;
  });

  const updatedPlayers = results.map(applyValueToListPlayer);
  const leaderboard = buildLeaderboard(updatedPlayers, leaderboardPayload, generatedAt);
  const playersChanged = writeIfChanged(playersPath, { ...playersPayload, items: updatedPlayers });
  const leaderboardChanged = writeIfChanged(leaderboardPath, leaderboard);
  const highValuePlayers = updatedPlayers
    .filter((player) => Number(player.marketValue) >= HIGH_VALUE_THRESHOLD)
    .sort((left, right) => Number(right.marketValue) - Number(left.marketValue));
  const report = {
    schemaVersion: 1,
    source: "懂球帝 App 公开数据层",
    refreshedFromNetwork: options.refresh || Boolean(previousReport?.refreshedFromNetwork),
    checkedAt: generatedAt,
    totalPlayers: updatedPlayers.length,
    changedMarketValues: options.refresh
      ? marketValuesChanged
      : Number(previousReport?.changedMarketValues || 0),
    changedDetailFiles: options.refresh
      ? detailFilesChanged
      : Number(previousReport?.changedDetailFiles || 0),
    highValueThreshold: HIGH_VALUE_THRESHOLD,
    highValuePlayers: highValuePlayers.map((player) => ({
      id: player.id,
      name: player.name,
      marketValue: player.marketValue,
      marketValueLabelZh: player.marketValueLabelZh,
    })),
    unavailablePlayers: updatedPlayers
      .filter((player) => Number(player.marketValue) <= 0)
      .map((player) => ({ id: player.id, name: player.name })),
    leaderboardItems: leaderboard.items.length,
    failures: [],
  };
  const reportChanged = writeIfChanged(REPORT_PATH, report);

  console.log(
    `${options.checkOnly ? "Check" : "Sync"} complete · players ${updatedPlayers.length} · ` +
      `value changes ${marketValuesChanged} · detail files ${detailFilesChanged} · ` +
      `>=1亿 ${highValuePlayers.length} · outputs ${[playersChanged, leaderboardChanged, reportChanged].filter(Boolean).length}`,
  );
  if (options.checkOnly && (detailFilesChanged || playersChanged || leaderboardChanged || reportChanged)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
