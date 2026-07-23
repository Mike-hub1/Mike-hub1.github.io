const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const API_INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const MANIFEST_PATH = path.join(__dirname, "dongqiudi-player-profiles.json");
const CHECK_ONLY = process.argv.includes("--check");
const MATERIAL_API_ROOT = "https://api.dongqiudi.com/data/v1/detail/person";
const ABILITY_API_ROOT = "https://sport-data.dongqiudi.com/soccer/data/sofifa/v1/player_ability";
const PUBLIC_PLAYER_ROOT = "https://pc.dongqiudi.com/player";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function changedValuePaths(current, next, prefix = "", result = []) {
  if (Object.is(current, next)) return result;
  if (
    current === null ||
    next === null ||
    typeof current !== "object" ||
    typeof next !== "object" ||
    Array.isArray(current) !== Array.isArray(next)
  ) {
    result.push(prefix || "<root>");
    return result;
  }
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of keys) {
    changedValuePaths(current[key], next[key], prefix ? `${prefix}.${key}` : key, result);
    if (result.length >= 12) break;
  }
  return result;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactText(value) {
  return String(value ?? "").trim();
}

function formatMarketValueLabels(value) {
  const amount = asNumber(value);
  if (amount === null) return { label: "", labelZh: "" };
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

function flattenMarketValues(history = {}) {
  return Object.values(history)
    .flatMap((rows) => asArray(rows))
    .map((row) => ({
      date: compactText(row.record_date),
      valueEuro: asNumber(row.market_value),
      label: compactText(row.market_value_text),
      age: asNumber(row.age),
      team: {
        id: compactText(row.team_info?.id),
        name: compactText(row.team_info?.name),
      },
    }))
    .filter((row) => row.date && row.valueEuro !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeAbility(payload = {}) {
  const data = payload.data || {};
  return {
    version: compactText(data.version),
    lastUpdatedAt: compactText(data.last_grab_time),
    overall: asNumber(data.average?.val),
    radar: asArray(data.redar).map((row) => ({
      name: compactText(row.name),
      value: asNumber(row.val),
      level: compactText(row.lv),
    })),
    categories: asArray(data.bar_info).map((group) => ({
      name: compactText(group.title),
      total: asNumber(group.total),
      metrics: asArray(group.detail).map((metric) => ({
        name: compactText(metric.name),
        value: asNumber(metric.val),
        level: compactText(metric.lv || metric.lv_),
      })),
    })),
    preferredFoot: compactText(data.foot_info?.val) === "R" ? "右脚" : compactText(data.foot_info?.val) === "L" ? "左脚" : compactText(data.foot_info?.val),
    stars: asArray(data.star_bar).map((row) => ({
      name: compactText(row.name),
      value: asNumber(row.val),
    })),
    registeredPositions: compactText(data.good_pos?.val)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    positionRatings: asArray(data.fields)
      .map((row) => ({
        name: compactText(row.name),
        value: asNumber(row.val),
        code: compactText(row.css),
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  };
}

function normalizeMaterial(material = {}) {
  const base = material.base_info || {};
  const facts = Object.fromEntries(
    asArray(material.base_info_v_1)
      .map((row) => [compactText(row.type), compactText(row.value)])
      .filter(([key, value]) => key && value)
  );
  return {
    identity: {
      fullName: facts["全名"] || compactText(base.person_en_name),
      nationality: facts["国籍/会籍"] || compactText(base.nationality),
      dateOfBirth: facts["生日"] || compactText(base.date_of_birth),
      age: compactText(base.age),
      heightCm: asNumber(base.height),
      weightKg: asNumber(base.weight),
      preferredFoot: compactText(base.foot),
      position: compactText(base.team_info?.role),
      shirtNumber: compactText(base.team_info?.shirtnumber),
      club: compactText(base.team_info?.team_name),
      annualSalary: facts["年薪"],
      marketValue: facts["身价"],
      marketValueEuro: asNumber(base.market_value) === null ? null : asNumber(base.market_value) * 10_000,
      contractUntil: facts["合同到期"] || compactText(base.contract),
    },
    marketValueHistory: flattenMarketValues(material.history_market_values),
    characteristics: {
      styles: asArray(material.character_info?.styles).map(compactText).filter(Boolean),
      veryStrong: asArray(material.character_info?.strength?.very_strong).map(compactText).filter(Boolean),
      strong: asArray(material.character_info?.strength?.strong).map(compactText).filter(Boolean),
      weak: asArray(material.character_info?.weakness?.weak).map(compactText).filter(Boolean),
      veryWeak: asArray(material.character_info?.weakness?.very_weak).map(compactText).filter(Boolean),
    },
    transfers: asArray(material.transfer_info).map((row) => ({
      date: compactText(row.announced_date),
      type: compactText(row.type) || "梯队调整",
      fee: compactText(row.money) || "未披露",
      from: compactText(row.from_club_name),
      to: compactText(row.to_club_name),
    })),
    honors: asArray(material.honor_info).map((row) => ({
      name: compactText(row.name),
      times: asNumber(row.times),
      importance: asNumber(row.importance),
      records: asArray(row.honor_list).map((record) => ({
        competition: compactText(record.competition_name),
        team: compactText(record.team_name),
        season: compactText(record.season_name),
      })),
    })),
    injuries: asArray(material.injury_records?.history).map((row) => ({
      injury: compactText(row.injury),
      from: compactText(row.date_from),
      until: compactText(row.date_until),
      days: asNumber(row.days),
      gamesMissed: asNumber(row.games_missed),
      teams: asArray(row.teams).map((team) => compactText(team.name)).filter(Boolean),
    })),
  };
}

function validateSource(entry, abilityPayload, material) {
  if (abilityPayload.errno !== 0) throw new Error(`Ability API failed for ${entry.playerId}`);
  if (compactText(material.base_info?.person_id) !== entry.personId) {
    throw new Error(`Person ID mismatch for ${entry.playerId}`);
  }
  if (entry.expectedName && compactText(material.base_info?.person_name) !== entry.expectedName) {
    throw new Error(`Player name mismatch for ${entry.playerId}`);
  }
  if (!asArray(abilityPayload.data?.redar).length || !asArray(abilityPayload.data?.bar_info).length) {
    throw new Error(`Ability data is incomplete for ${entry.playerId}`);
  }
  if (!Object.keys(material.history_market_values || {}).length || !material.character_info) {
    throw new Error(`Profile material is incomplete for ${entry.playerId}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; WC26StaticArchive/1.0)",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function playerSnapshotPath(index, playerId) {
  const relativeUrl = index.details?.players?.[playerId] || index.paths?.[`/players/${playerId}`];
  if (!relativeUrl) throw new Error(`Player snapshot not found: ${playerId}`);
  return path.join(ROOT, relativeUrl.replace(/^\/+/, ""));
}

async function buildProfile(entry, checkedAt) {
  const abilityUrl = `${ABILITY_API_ROOT}/${encodeURIComponent(entry.abilityId)}?player_type=`;
  const materialUrl = `${MATERIAL_API_ROOT}/${encodeURIComponent(entry.personId)}?app=dqd&lang=zh-cn`;
  const [abilityPayload, material] = await Promise.all([fetchJson(abilityUrl), fetchJson(materialUrl)]);
  validateSource(entry, abilityPayload, material);
  return {
    schemaVersion: 1,
    status: "available",
    externalPersonId: entry.personId,
    externalAbilityId: entry.abilityId,
    checkedAt,
    ability: normalizeAbility(abilityPayload),
    profile: normalizeMaterial(material),
    sources: {
      playerPage: `${PUBLIC_PLAYER_ROOT}/${encodeURIComponent(entry.personId)}`,
      ability: abilityUrl,
      profile: materialUrl,
      provider: "懂球帝 App 公开数据层",
      runtimeCalls: false,
      note: "数据已写入静态封存快照；访问球员页时不会实时调用第三方接口。",
    },
  };
}

async function main() {
  const manifest = readJson(MANIFEST_PATH);
  const index = readJson(API_INDEX_PATH);
  const syncCheckedAt = new Date().toISOString();
  let changed = 0;
  for (const entry of manifest.players || []) {
    const snapshotPath = playerSnapshotPath(index, entry.playerId);
    const player = readJson(snapshotPath);
    const checkedAt = CHECK_ONLY ? player.dongqiudiProfile?.checkedAt || syncCheckedAt : syncCheckedAt;
    const profile = await buildProfile(entry, checkedAt);
    player.dongqiudiProfile = profile;
    player.fullName = profile.profile.identity.fullName || player.fullName;
    player.birthDate = profile.profile.identity.dateOfBirth || player.birthDate;
    if (profile.profile.identity.marketValueEuro) {
      const marketValue = profile.profile.identity.marketValueEuro;
      const marketValueLabels = formatMarketValueLabels(marketValue);
      player.marketValue = marketValue;
      player.marketValueLabel = marketValueLabels.label;
      player.marketValueLabelZh = marketValueLabels.labelZh;
      player.marketValueRawLabel = marketValueLabels.label;
      player.marketValueSource = "懂球帝";
      player.marketValueUrl = profile.sources.playerPage;
      player.marketValueCheckedAt = CHECK_ONLY ? player.marketValueCheckedAt || checkedAt : checkedAt;
      player.marketValueConfidence = "high";
      player.marketValueStatus = "verified";
    }
    const next = stableJson(player);
    const current = fs.readFileSync(snapshotPath, "utf8");
    if (current !== next) {
      changed += 1;
      if (CHECK_ONLY) {
        const paths = changedValuePaths(JSON.parse(current), player);
        console.log(`${entry.playerId}: ${paths.join(", ")}`);
      }
      if (!CHECK_ONLY) fs.writeFileSync(snapshotPath, next);
    }
  }
  console.log(`${CHECK_ONLY ? "Check" : "Sync"} complete: ${changed} player snapshot${changed === 1 ? "" : "s"} ${CHECK_ONLY ? "need" : "received"} updates.`);
  if (CHECK_ONLY && changed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
