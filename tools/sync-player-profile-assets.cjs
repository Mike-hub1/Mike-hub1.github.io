const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const API_INDEX_PATH = path.join(ROOT, "static/api/v1/index.json");
const CURATED_PATH = path.join(__dirname, "player-profile-assets-curated.json");
const VERIFIED_PATH = path.join(__dirname, "player-profile-honor-assets-verified.json");
const REGISTRY_PATH = path.join(__dirname, "player-profile-asset-registry.json");
const TROPHY_DIR = path.join(ROOT, "static/assets/trophies/catalog");
const CLUB_DIR = path.join(ROOT, "static/assets/clubs/catalog");
const USER_AGENT = "Mozilla/5.0 (compatible; WC26StaticArchiveAssets/1.0)";
const CONCURRENCY = optionInteger("concurrency", 10, 1);
const RETRIES = optionInteger("retries", 3, 0);
const CHECK_ONLY = process.argv.includes("--check");
const HONOR_SHARED_LIMIT = 8;
const TEAM_SHARED_LIMIT = 12;

function optionInteger(name, fallback, minimum) {
  const prefix = `--${name}=`;
  const value = Number.parseInt(
    process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "",
    10
  );
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function compactText(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function playerSnapshotPath(index, playerId) {
  const relativeUrl = index.details?.players?.[playerId] || index.paths?.[`/players/${playerId}`];
  if (!relativeUrl) throw new Error(`Player snapshot not found: ${playerId}`);
  return path.join(ROOT, relativeUrl.replace(/^\/+/, ""));
}

function sourceKey(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 20);
}

function bufferHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function imageType(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return {
      extension: "png",
      mimeType: "image/png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          extension: "jpg",
          mimeType: "image/jpeg",
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      if (!length) break;
      offset += length + 2;
    }
    return { extension: "jpg", mimeType: "image/jpeg", width: null, height: null };
  }
  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp", width: null, height: null };
  }
  return null;
}

async function fetchBuffer(url) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/png,image/webp,image/jpeg;q=0.9,*/*;q=0.5", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}: ${url}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt >= RETRIES || (!error.retryable && error.name !== "AbortError")) break;
      await wait(Math.min(5_000, 350 * 2 ** attempt + Math.round(Math.random() * 250)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function existingAsset(directory, key) {
  for (const extension of ["png", "jpg", "webp"]) {
    const filePath = path.join(directory, `${key}.${extension}`);
    if (!fs.existsSync(filePath)) continue;
    const buffer = fs.readFileSync(filePath);
    const type = imageType(buffer);
    if (!type) continue;
    return { buffer, type, filePath };
  }
  return null;
}

async function acquireAsset({ url, kind }) {
  const directory = kind === "honor" ? TROPHY_DIR : CLUB_DIR;
  const publicDirectory =
    kind === "honor" ? "/static/assets/trophies/catalog" : "/static/assets/clubs/catalog";
  const byteLimit = kind === "honor" ? 256 * 1024 : 192 * 1024;
  const key = sourceKey(url);
  let asset = existingAsset(directory, key);
  if (!asset) {
    const buffer = await fetchBuffer(url);
    const type = imageType(buffer);
    if (!type) throw new Error(`Unsupported image format: ${url}`);
    asset = { buffer, type, filePath: path.join(directory, `${key}.${type.extension}`) };
    if (!CHECK_ONLY && buffer.length <= byteLimit) fs.writeFileSync(asset.filePath, buffer);
  }
  const { buffer, type } = asset;
  if (buffer.length > byteLimit) {
    return {
      sourceUrl: url,
      status: "withheld-oversize",
      assetUrl: "",
      bytes: buffer.length,
      width: type.width,
      height: type.height,
      sha256: bufferHash(buffer),
      mimeType: type.mimeType,
    };
  }
  if ((type.width && type.width > 2048) || (type.height && type.height > 2048)) {
    return {
      sourceUrl: url,
      status: "withheld-oversize-dimensions",
      assetUrl: "",
      bytes: buffer.length,
      width: type.width,
      height: type.height,
      sha256: bufferHash(buffer),
      mimeType: type.mimeType,
    };
  }
  return {
    sourceUrl: url,
    status: "available",
    assetUrl: `${publicDirectory}/${key}.${type.extension}`,
    bytes: buffer.length,
    width: type.width,
    height: type.height,
    sha256: bufferHash(buffer),
    mimeType: type.mimeType,
  };
}

function addUsage(map, key, value = {}) {
  if (!key) return;
  const row = map.get(key) || {
    uses: 0,
    names: new Map(),
    ids: new Set(),
    categories: new Map(),
  };
  row.uses += 1;
  if (value.name) row.names.set(value.name, (row.names.get(value.name) || 0) + 1);
  if (value.id) row.ids.add(value.id);
  if (value.category) {
    row.categories.set(value.category, (row.categories.get(value.category) || 0) + 1);
  }
  map.set(key, row);
}

function mostUsed(map) {
  return [...map.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN")
  )[0]?.[0];
}

function collectSources(index) {
  const honorNames = new Map();
  const honorUrls = new Map();
  const teamUrls = new Map();
  const teamNames = new Map();
  for (const [playerId] of Object.entries(index.details?.players || {})) {
    const player = readJson(playerSnapshotPath(index, playerId));
    const profile = player.dongqiudiProfile?.profile;
    if (!profile) continue;
    for (const honor of asArray(profile.honors)) {
      const name = compactText(honor.name);
      const sourceUrl = compactText(honor.logoSourceUrl);
      const row = honorNames.get(name) || {
        name,
        uses: 0,
        honorIds: new Set(),
        sourceUrls: new Map(),
        categories: new Map(),
      };
      row.uses += 1;
      if (honor.honorId) row.honorIds.add(compactText(honor.honorId));
      if (sourceUrl) row.sourceUrls.set(sourceUrl, (row.sourceUrls.get(sourceUrl) || 0) + 1);
      if (honor.category) {
        row.categories.set(honor.category, (row.categories.get(honor.category) || 0) + 1);
      }
      honorNames.set(name, row);
      addUsage(honorUrls, sourceUrl, { name, id: honor.honorId, category: honor.category });
    }
    const identity = profile.identity || {};
    addUsage(teamUrls, compactText(identity.clubLogoSourceUrl), {
      name: compactText(identity.club),
      id: compactText(identity.clubId),
    });
    for (const point of asArray(profile.marketValueHistory)) {
      addUsage(teamUrls, compactText(point.team?.logoSourceUrl), {
        name: compactText(point.team?.name),
        id: compactText(point.team?.id),
      });
    }
  }
  for (const [url, row] of teamUrls) {
    for (const [name, count] of row.names) {
      const nameRow = teamNames.get(name) || new Map();
      nameRow.set(url, (nameRow.get(url) || 0) + count);
      teamNames.set(name, nameRow);
    }
  }
  return { honorNames, honorUrls, teamUrls, teamNames };
}

async function acquireAll(sourceRows, kind) {
  const urls = [...sourceRows.keys()].filter(Boolean).sort();
  const results = new Map();
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      try {
        results.set(url, await acquireAsset({ url, kind }));
      } catch (error) {
        failed += 1;
        results.set(url, {
          sourceUrl: url,
          status: "fetch-failed",
          assetUrl: "",
          error: error.message,
        });
      } finally {
        completed += 1;
        if (completed % 100 === 0 || completed === urls.length) {
          console.log(`${kind} assets ${completed}/${urls.length} · failed ${failed}`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, urls.length)) }, () => worker()));
  return results;
}

function applyContentCollisionGuard(registryRows, limit) {
  const hashes = new Map();
  for (const row of Object.values(registryRows)) {
    if (!row.sha256 || !row.assetUrl || row.status === "curated") continue;
    const names = hashes.get(row.sha256) || [];
    names.push(row.name);
    hashes.set(row.sha256, names);
  }
  const collisions = [];
  for (const [sha256, names] of hashes) {
    if (names.length <= limit) continue;
    collisions.push({ sha256, names: names.toSorted((left, right) => left.localeCompare(right, "zh-CN")) });
    for (const name of names) {
      registryRows[name].assetUrl = "";
      registryRows[name].status = "withheld-shared-artwork";
    }
  }
  return collisions;
}

function honorRegistryRows(sources, acquired, curated) {
  const rows = {};
  const blocked = new Set(curated.blockedSourceUrls || []);
  for (const [name, source] of [...sources.honorNames.entries()].sort((left, right) =>
    left[0].localeCompare(right[0], "zh-CN")
  )) {
    const curatedAsset = curated.honors?.[name];
    const sourceUrl = mostUsed(source.sourceUrls);
    const sourceUsage = sources.honorUrls.get(sourceUrl);
    const sharedNames = sourceUsage ? [...sourceUsage.names.keys()] : [];
    if (curatedAsset && !curatedAsset.playerIds?.length) {
      rows[name] = {
        name,
        honorIds: [...source.honorIds].toSorted(),
        category: mostUsed(source.categories) || "club",
        uses: source.uses,
        sourceUrl,
        assetUrl: curatedAsset.assetUrl,
        status: "curated",
        source: curatedAsset.source,
        sourcePage: curatedAsset.sourcePage,
        sourceImageUrl: curatedAsset.sourceImageUrl,
        assetKind: curatedAsset.assetKind,
        credit: curatedAsset.credit,
        license: curatedAsset.license,
        verifiedAt: curatedAsset.verifiedAt,
      };
      continue;
    }
    if (!sourceUrl || blocked.has(sourceUrl) || sharedNames.length > HONOR_SHARED_LIMIT) {
      rows[name] = {
        name,
        honorIds: [...source.honorIds].toSorted(),
        category: mostUsed(source.categories) || "club",
        uses: source.uses,
        sourceUrl,
        assetUrl: "",
        status: "withheld-shared-artwork",
        sharedNames: sharedNames.length,
        source: "懂球帝公开数据 · 自动碰撞拦截",
      };
      continue;
    }
    const asset = acquired.get(sourceUrl) || {};
    rows[name] = {
      name,
      honorIds: [...source.honorIds].toSorted(),
      category: mostUsed(source.categories) || "club",
      uses: source.uses,
      sourceUrl,
      assetUrl: asset.assetUrl || "",
      status: asset.status || "missing",
      source: "懂球帝 App 公开数据层",
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      error: asset.error,
    };
  }
  return rows;
}

function teamRegistryRows(sources, acquired) {
  const rows = {};
  for (const [name, sourceUrls] of [...sources.teamNames.entries()].sort((left, right) =>
    left[0].localeCompare(right[0], "zh-CN")
  )) {
    if (!name) continue;
    const sourceUrl = mostUsed(sourceUrls);
    const sourceUsage = sources.teamUrls.get(sourceUrl);
    const sharedNames = sourceUsage ? [...sourceUsage.names.keys()] : [];
    const asset = acquired.get(sourceUrl) || {};
    const withheld = !sourceUrl || sharedNames.length > TEAM_SHARED_LIMIT;
    rows[name] = {
      name,
      teamIds: sourceUsage ? [...sourceUsage.ids].toSorted() : [],
      uses: [...sourceUrls.values()].reduce((total, count) => total + count, 0),
      sourceUrl,
      assetUrl: withheld ? "" : asset.assetUrl || "",
      status: withheld ? "withheld-shared-artwork" : asset.status || "missing",
      source: "懂球帝 App 公开数据层",
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      error: asset.error,
    };
  }
  return rows;
}

function updateSnapshots(index, honorRows, teamRows, curated) {
  let changed = 0;
  for (const [playerId] of Object.entries(index.details?.players || {})) {
    const snapshotPath = playerSnapshotPath(index, playerId);
    const player = readJson(snapshotPath);
    const profile = player.dongqiudiProfile?.profile;
    if (!profile) continue;
    const current = stableJson(player);
    const identityTeam = teamRows[compactText(profile.identity?.club)];
    if (profile.identity) {
      profile.identity.clubLogoUrl = identityTeam?.assetUrl || "";
      profile.identity.clubLogoStatus = identityTeam?.status || "missing";
    }
    for (const point of asArray(profile.marketValueHistory)) {
      const team = teamRows[compactText(point.team?.name)];
      if (!point.team) continue;
      point.team.logoUrl = team?.assetUrl || "";
      point.team.logoStatus = team?.status || "missing";
    }
    for (const transfer of asArray(profile.transfers)) {
      transfer.fromLogoUrl = teamRows[compactText(transfer.from)]?.assetUrl || "";
      transfer.toLogoUrl = teamRows[compactText(transfer.to)]?.assetUrl || "";
    }
    for (const honor of asArray(profile.honors)) {
      const registry = honorRows[compactText(honor.name)];
      const scoped = curated.honors?.[compactText(honor.name)];
      const scopedMatch = scoped?.playerIds?.includes(playerId);
      honor.logoUrl = scopedMatch ? scoped.assetUrl : registry?.assetUrl || "";
      honor.logoStatus = scopedMatch ? "curated" : registry?.status || "missing";
      honor.logoSource = scopedMatch ? scoped.source : registry?.source || "图标待核验";
      if (registry?.category) honor.category = registry.category;
    }
    const next = stableJson(player);
    if (current === next) continue;
    changed += 1;
    if (!CHECK_ONLY) fs.writeFileSync(snapshotPath, next);
  }
  return changed;
}

function eligibleSources(sourceRows, blocked = new Set(), sharedLimit = Number.POSITIVE_INFINITY) {
  return new Map(
    [...sourceRows].filter(
      ([url, row]) => url && !blocked.has(url) && row.names.size <= sharedLimit
    )
  );
}

function pruneGeneratedAssets(registry) {
  const referenced = new Set(
    [
      ...Object.values(registry.honors),
      ...Object.values(registry.teams),
    ]
      .map((row) => row.assetUrl)
      .filter(Boolean)
  );
  let pruned = 0;
  for (const [directory, publicDirectory] of [
    [TROPHY_DIR, "/static/assets/trophies/catalog"],
    [CLUB_DIR, "/static/assets/clubs/catalog"],
  ]) {
    if (!fs.existsSync(directory)) continue;
    for (const fileName of fs.readdirSync(directory)) {
      const publicUrl = `${publicDirectory}/${fileName}`;
      if (referenced.has(publicUrl)) continue;
      pruned += 1;
      if (!CHECK_ONLY) fs.unlinkSync(path.join(directory, fileName));
    }
  }
  return pruned;
}

async function main() {
  const index = readJson(API_INDEX_PATH);
  const curated = readJson(CURATED_PATH);
  const verified = fs.existsSync(VERIFIED_PATH) ? readJson(VERIFIED_PATH) : { honors: {} };
  curated.honors = {
    ...(verified.honors || {}),
    ...(curated.honors || {}),
  };
  const sources = collectSources(index);
  if (!CHECK_ONLY) {
    fs.mkdirSync(TROPHY_DIR, { recursive: true });
    fs.mkdirSync(CLUB_DIR, { recursive: true });
  }
  const blockedHonorUrls = new Set(curated.blockedSourceUrls || []);
  const [honorAssets, teamAssets] = await Promise.all([
    acquireAll(
      eligibleSources(sources.honorUrls, blockedHonorUrls, HONOR_SHARED_LIMIT),
      "honor"
    ),
    acquireAll(eligibleSources(sources.teamUrls, new Set(), TEAM_SHARED_LIMIT), "team"),
  ]);
  const honors = honorRegistryRows(sources, honorAssets, curated);
  const teams = teamRegistryRows(sources, teamAssets);
  const honorContentCollisions = applyContentCollisionGuard(honors, HONOR_SHARED_LIMIT);
  const teamContentCollisions = applyContentCollisionGuard(teams, TEAM_SHARED_LIMIT);
  const snapshotsChanged = updateSnapshots(index, honors, teams, curated);
  const registry = {
    schemaVersion: 1,
    policy: curated.policy,
    summary: {
      honorNames: Object.keys(honors).length,
      honorAssetsAvailable: Object.values(honors).filter((row) => row.assetUrl).length,
      honorAssetsWithheld: Object.values(honors).filter((row) => !row.assetUrl).length,
      teamNames: Object.keys(teams).length,
      teamAssetsAvailable: Object.values(teams).filter((row) => row.assetUrl).length,
      teamAssetsWithheld: Object.values(teams).filter((row) => !row.assetUrl).length,
      honorContentCollisions: honorContentCollisions.length,
      teamContentCollisions: teamContentCollisions.length,
    },
    honorContentCollisions,
    teamContentCollisions,
    honors,
    teams,
  };
  const prunedAssets = pruneGeneratedAssets(registry);
  const registryChanged =
    !fs.existsSync(REGISTRY_PATH) || fs.readFileSync(REGISTRY_PATH, "utf8") !== stableJson(registry);
  if (registryChanged && !CHECK_ONLY) fs.writeFileSync(REGISTRY_PATH, stableJson(registry));
  console.log(
    `${CHECK_ONLY ? "Check" : "Asset sync"} complete: ${snapshotsChanged} snapshots changed; ` +
      `${registry.summary.honorAssetsAvailable}/${registry.summary.honorNames} honor assets and ` +
      `${registry.summary.teamAssetsAvailable}/${registry.summary.teamNames} team assets available; ` +
      `${prunedAssets} unreferenced generated assets pruned.`
  );
  if (CHECK_ONLY && (snapshotsChanged || registryChanged || prunedAssets)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
