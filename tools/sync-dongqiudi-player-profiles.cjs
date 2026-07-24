const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const API_INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const MANIFEST_PATH = path.join(__dirname, "dongqiudi-player-profiles.json");
const REPORT_PATH = path.join(__dirname, "dongqiudi-player-profile-report.json");
const MATERIAL_API_ROOT = "https://api.dongqiudi.com/data/v1/detail/person";
const ABILITY_API_ROOT = "https://sport-data.dongqiudi.com/soccer/data/sofifa/v1/player_ability";
const PUBLIC_PLAYER_ROOT = "https://pc.dongqiudi.com/player";
const USER_AGENT = "Mozilla/5.0 (compatible; WC26StaticArchive/2.0)";

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
    resume: argv.includes("--resume"),
    concurrency: integerOf("concurrency", 6, 1),
    offset: integerOf("offset", 0, 0),
    limit: integerOf("limit", Number.MAX_SAFE_INTEGER, 1),
    retries: integerOf("retries", 3, 0),
    playerIds: valueOf("player", "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function playerSnapshotPath(index, playerId) {
  const relativeUrl = index.details?.players?.[playerId] || index.paths?.[`/players/${playerId}`];
  if (!relativeUrl) throw new Error(`Player snapshot not found: ${playerId}`);
  return path.join(ROOT, relativeUrl.replace(/^\/+/, ""));
}

function discoverPlayerEntries(index) {
  const entries = Object.keys(index.details?.players || {})
    .map((playerId) => {
      const snapshotPath = playerSnapshotPath(index, playerId);
      const player = readJson(snapshotPath);
      const sourceText = JSON.stringify(player);
      const personId =
        compactText(player.worldCupStats?.externalPlayerId) ||
        (sourceText.match(/https:\/\/pc\.dongqiudi\.com\/player\/(\d+)/) || [])[1] ||
        "";
      const abilityId = personId ? String(Number(personId) - 50_000_000) : "";
      if (!/^\d+$/.test(personId) || !/^\d+$/.test(abilityId) || Number(abilityId) <= 0) {
        throw new Error(`Cannot derive Dongqiudi IDs for ${playerId}`);
      }
      return {
        playerId,
        personId,
        abilityId,
        displayName: compactText(player.name || player.fullName),
      };
    })
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  const personIds = new Set();
  for (const entry of entries) {
    if (personIds.has(entry.personId)) throw new Error(`Duplicate person ID: ${entry.personId}`);
    personIds.add(entry.personId);
  }
  return entries;
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
        logoSourceUrl: compactText(row.team_info?.logo),
        logoUrl: "",
      },
    }))
    .filter((row) => row.date && row.valueEuro !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function inferHonorCategory(name = "") {
  const label = compactText(name);
  if (
    /最佳|金靴|银靴|铜靴|金球|银球|铜球|金童|新秀|射手|球员|先生|门将|阵容|MVP|奖$|奖杯$|奖章$/.test(
      label
    )
  ) {
    return "individual";
  }
  if (label.includes("俱乐部")) return "club";
  if (
    /世界杯冠军|欧洲杯冠军|美洲杯冠军|非洲杯冠军|亚洲杯冠军|国家联赛冠军|联合会杯冠军|奥运会冠军|世青赛冠军|U\d{2}.*(?:世界杯|欧洲杯|美洲杯|非洲杯|亚洲杯)冠军/.test(
      label
    )
  ) {
    return "national";
  }
  return "club";
}

function normalizeHonors(honors = []) {
  return asArray(honors)
    .map((row) => ({
      honorId: compactText(row.honor_id),
      name: compactText(row.name),
      category: inferHonorCategory(row.name),
      logoSourceUrl: compactText(row.logo),
      logoUrl: "",
      times: asNumber(row.times),
      importance: asNumber(row.importance),
      records: asArray(row.honor_list)
        .map((record) => ({
          competition: compactText(record.competition_name),
          team: compactText(record.team_name),
          season: compactText(record.season_name),
        }))
        .sort(
          (left, right) =>
            right.season.localeCompare(left.season) ||
            left.team.localeCompare(right.team, "zh-CN") ||
            left.competition.localeCompare(right.competition, "zh-CN")
        ),
    }))
    .filter((row) => row.name)
    .sort(
      (left, right) =>
        (right.importance || 0) - (left.importance || 0) ||
        left.name.localeCompare(right.name, "zh-CN")
    );
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
    preferredFoot:
      compactText(data.foot_info?.val) === "R"
        ? "右脚"
        : compactText(data.foot_info?.val) === "L"
          ? "左脚"
          : compactText(data.foot_info?.val),
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

function normalizeMaterial(material = {}, entry = {}) {
  const base = material.base_info || {};
  const facts = Object.fromEntries(
    asArray(material.base_info_v_1)
      .map((row) => [compactText(row.type), compactText(row.value)])
      .filter(([key, value]) => key && value)
  );
  return {
    identity: {
      fullName: facts["全名"] || compactText(base.person_en_name),
      fullNameZh: entry.playerId === "fifa_player_389867" ? "基利安·姆巴佩·洛坦" : entry.displayName,
      nationality: facts["国籍/会籍"] || compactText(base.nationality),
      dateOfBirth: facts["生日"] || compactText(base.date_of_birth),
      age: compactText(base.age),
      heightCm: asNumber(base.height),
      weightKg: asNumber(base.weight),
      preferredFoot: compactText(base.foot),
      position: compactText(base.team_info?.role),
      shirtNumber: compactText(base.team_info?.shirtnumber),
      clubId: compactText(base.team_info?.team_id).replace(/^5000/, ""),
      club: compactText(base.team_info?.team_name),
      clubLogoSourceUrl: compactText(base.team_info?.team_logo),
      clubLogoUrl: "",
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
    honors: normalizeHonors(material.honor_info),
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

function validateMaterial(entry, material) {
  if (compactText(material.base_info?.person_id) !== entry.personId) {
    throw new Error(`Person ID mismatch for ${entry.playerId}`);
  }
  if (!compactText(material.base_info?.person_name) && !compactText(material.base_info?.person_en_name)) {
    throw new Error(`Profile material has no identity for ${entry.playerId}`);
  }
}

function abilityIsComplete(payload) {
  return (
    payload?.errno === 0 &&
    asArray(payload.data?.redar).length >= 3 &&
    asArray(payload.data?.bar_info).length > 0
  );
}

async function fetchJson(url, { optional = false } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}: ${url}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= options.retries || (!error.retryable && error.name !== "AbortError")) break;
      await wait(Math.min(5_000, 350 * 2 ** attempt + Math.round(Math.random() * 250)));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (optional) return { __fetchError: lastError?.message || "unknown error" };
  throw lastError;
}

async function buildProfile(entry, checkedAt) {
  const abilityUrl = `${ABILITY_API_ROOT}/${encodeURIComponent(entry.abilityId)}?player_type=`;
  const materialUrl = `${MATERIAL_API_ROOT}/${encodeURIComponent(entry.personId)}?app=dqd&lang=zh-cn`;
  const [abilityPayload, material] = await Promise.all([
    fetchJson(abilityUrl, { optional: true }),
    fetchJson(materialUrl),
  ]);
  validateMaterial(entry, material);
  const abilityAvailable = abilityIsComplete(abilityPayload);
  return {
    schemaVersion: 2,
    status: "available",
    externalPersonId: entry.personId,
    externalAbilityId: entry.abilityId,
    checkedAt,
    coverage: {
      ability: abilityAvailable ? "available" : "unavailable",
      profile: "available",
    },
    ability: abilityAvailable ? normalizeAbility(abilityPayload) : null,
    profile: normalizeMaterial(material, entry),
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

function applyProfileToPlayer(player, profile, checkedAt) {
  player.dongqiudiProfile = profile;
  const identity = profile.profile.identity;
  if (!player.fullName && identity.fullName) player.fullName = identity.fullName;
  if (identity.dateOfBirth) player.birthDate = identity.dateOfBirth;
  if (identity.marketValueEuro) {
    const marketValue = identity.marketValueEuro;
    const marketValueLabels = formatMarketValueLabels(marketValue);
    player.marketValue = marketValue;
    player.marketValueLabel = marketValueLabels.label;
    player.marketValueLabelZh = marketValueLabels.labelZh;
    player.marketValueRawLabel = marketValueLabels.label;
    player.marketValueSource = "懂球帝";
    player.marketValueUrl = profile.sources.playerPage;
    player.marketValueCheckedAt = checkedAt;
    player.marketValueConfidence = "high";
    player.marketValueStatus = "verified";
  }
}

function selectEntries(entries) {
  const filtered = options.playerIds.length
    ? entries.filter(
        (entry) => options.playerIds.includes(entry.playerId) || options.playerIds.includes(entry.personId)
      )
    : entries;
  return filtered.slice(options.offset, options.offset + options.limit);
}

function existingProfileCanResume(player, entry) {
  const profile = player.dongqiudiProfile;
  return (
    profile?.schemaVersion >= 2 &&
    profile?.status === "available" &&
    profile?.externalPersonId === entry.personId &&
    profile?.externalAbilityId === entry.abilityId &&
    profile?.profile?.identity
  );
}

function writeIfChanged(filePath, value, checkOnly = false) {
  const next = stableJson(value);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (current === next) return false;
  if (!checkOnly) fs.writeFileSync(filePath, next);
  return true;
}

function buildCoverageReport(index, entries, failures = []) {
  const report = {
    schemaVersion: 1,
    totalPlayers: entries.length,
    availableProfiles: 0,
    availableAbilities: 0,
    unavailableAbilities: 0,
    honors: 0,
    marketValueHistories: 0,
    failures,
  };
  for (const entry of entries) {
    const player = readJson(playerSnapshotPath(index, entry.playerId));
    const profile = player.dongqiudiProfile;
    if (profile?.status !== "available" || !profile.profile) continue;
    report.availableProfiles += 1;
    if (profile.ability) report.availableAbilities += 1;
    else report.unavailableAbilities += 1;
    report.honors += asArray(profile.profile.honors).length;
    if (asArray(profile.profile.marketValueHistory).length) report.marketValueHistories += 1;
  }
  return report;
}

async function main() {
  const index = readJson(API_INDEX_PATH);
  const allEntries = discoverPlayerEntries(index);
  const manifest = {
    schemaVersion: 2,
    source: "archived worldCupStats.externalPlayerId",
    players: allEntries,
  };
  const manifestChanged = writeIfChanged(MANIFEST_PATH, manifest, options.checkOnly);
  if (options.checkOnly && manifestChanged) console.log("Manifest needs an update.");

  const entries = selectEntries(allEntries);
  const syncCheckedAt = new Date().toISOString();
  const failures = [];
  let cursor = 0;
  let changed = 0;
  let skipped = 0;
  let completed = 0;

  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      const snapshotPath = playerSnapshotPath(index, entry.playerId);
      const player = readJson(snapshotPath);
      if (options.resume && existingProfileCanResume(player, entry)) {
        skipped += 1;
        completed += 1;
        continue;
      }
      try {
        const checkedAt = options.checkOnly
          ? player.dongqiudiProfile?.checkedAt || syncCheckedAt
          : syncCheckedAt;
        const profile = await buildProfile(entry, checkedAt);
        const current = JSON.parse(JSON.stringify(player));
        applyProfileToPlayer(player, profile, checkedAt);
        const playerChanged = stableJson(current) !== stableJson(player);
        if (playerChanged) {
          changed += 1;
          if (options.checkOnly) {
            console.log(`${entry.playerId}: ${changedValuePaths(current, player).join(", ")}`);
          } else {
            fs.writeFileSync(snapshotPath, stableJson(player));
          }
        }
      } catch (error) {
        failures.push({
          playerId: entry.playerId,
          personId: entry.personId,
          message: error.message,
        });
        console.error(`FAILED ${entry.playerId} (${entry.displayName}): ${error.message}`);
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === entries.length) {
          console.log(
            `Progress ${completed}/${entries.length} · changed ${changed} · skipped ${skipped} · failed ${failures.length}`
          );
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, Math.max(1, entries.length)) }, () => worker())
  );

  const report = buildCoverageReport(index, allEntries, failures);
  writeIfChanged(REPORT_PATH, report, options.checkOnly);
  console.log(
    `${options.checkOnly ? "Check" : "Sync"} complete: ${changed} changed, ${skipped} resumed, ${failures.length} failed. ` +
      `Coverage ${report.availableProfiles}/${report.totalPlayers} profiles, ${report.availableAbilities}/${report.totalPlayers} abilities.`
  );
  if (options.checkOnly && (changed || manifestChanged)) process.exitCode = 1;
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
