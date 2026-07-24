const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RESEARCH_PATH = path.join(__dirname, "player-profile-honor-transfermarkt.json");
const SUPPLEMENTAL_PATH = path.join(__dirname, "player-profile-honor-assets-supplemental.json");
const OUTPUT_PATH = path.join(__dirname, "player-profile-honor-assets-verified.json");
const ASSET_DIRECTORY = path.join(ROOT, "static/assets/trophies/verified");
const PUBLIC_DIRECTORY = "/static/assets/trophies/verified";
const VERIFIED_AT = "2026-07-24";
const USER_AGENT = "WC26HonorAssetVerifier/1.0 (https://mike-hub1.github.io)";

// These search results contained the requested words but resolved to a different
// competition. Keeping the rejection list next to the importer prevents a later
// bulk refresh from silently reintroducing a visually plausible wrong badge.
const REJECTED = new Set([
  "King's Cup",
  "Irish Cup Winner",
  "哥伦比亚超级杯冠军",
  "哈萨克斯坦足球超级联赛冠军",
  "巴西巴拉纳甲级联赛冠军",
  "巴西丙组联赛冠军",
  "瑞士足球挑战联赛冠军",
  "英足总锦标赛冠军",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pngMetadata(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Downloaded competition mark is not a PNG");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function validatePng(buffer, label) {
  const { width, height } = pngMetadata(buffer);
  if (buffer.length < 256 || buffer.length > 256 * 1024) {
    throw new Error(`Unexpected competition mark size (${buffer.length} bytes): ${label}`);
  }
  if (width < 24 || height < 24 || width > 1024 || height > 1024) {
    throw new Error(`Unexpected competition mark dimensions (${width}x${height}): ${label}`);
  }
  return { width, height };
}

async function fetchPng(sourceImageUrl, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(sourceImageUrl, {
        headers: {
          Accept: "image/png",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${sourceImageUrl}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      validatePng(buffer, label);
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function readCachedPng(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  validatePng(buffer, label);
  return buffer;
}

async function download(row) {
  const code = String(row.code || "").toLowerCase();
  const sourceImageUrl = `https://tmssl.akamaized.net/images/logo/normal/${code}.png`;
  const fileName = `${code}.png`;
  const filePath = path.join(ASSET_DIRECTORY, fileName);
  const cached = readCachedPng(filePath, sourceImageUrl);
  const buffer = cached || (await fetchPng(sourceImageUrl, sourceImageUrl));
  if (!cached) fs.writeFileSync(filePath, buffer);
  const { width, height } = pngMetadata(buffer);
  return {
    assetUrl: `${PUBLIC_DIRECTORY}/${fileName}`,
    source: "Transfermarkt 公开赛事标识",
    sourcePage: row.sourcePage,
    sourceImageUrl,
    assetKind: "public-competition-logo",
    sourceCode: row.code,
    verifiedAt: VERIFIED_AT,
    bytes: buffer.length,
    width,
    height,
  };
}

async function downloadSupplemental(name, row) {
  if (!row.fileName) {
    if (!row.assetUrl?.startsWith("/static/assets/")) return { ...row };
    const filePath = path.join(ROOT, row.assetUrl.slice(1));
    const buffer = readCachedPng(filePath, name);
    if (!buffer) throw new Error(`Missing local supplemental mark: ${row.assetUrl}`);
    const { width, height } = pngMetadata(buffer);
    return {
      ...row,
      bytes: buffer.length,
      width,
      height,
    };
  }
  if (!row.sourceImageUrl) {
    throw new Error(`Missing source image URL for supplemental mark: ${name}`);
  }
  const filePath = path.join(ASSET_DIRECTORY, row.fileName);
  const cached = readCachedPng(filePath, name);
  const buffer = cached || (await fetchPng(row.sourceImageUrl, name));
  if (!cached) fs.writeFileSync(filePath, buffer);
  const { width, height } = pngMetadata(buffer);
  const { fileName, ...catalogRow } = row;
  return {
    ...catalogRow,
    assetUrl: `${PUBLIC_DIRECTORY}/${fileName}`,
    bytes: buffer.length,
    width,
    height,
  };
}

async function main() {
  const research = readJson(RESEARCH_PATH);
  const supplemental = readJson(SUPPLEMENTAL_PATH);
  const previous = fs.existsSync(OUTPUT_PATH) ? readJson(OUTPUT_PATH) : { honors: {} };
  const rows = Object.values(research.honors)
    .filter((row) => row.status === "exact-code-candidate" && !REJECTED.has(row.name))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  fs.mkdirSync(ASSET_DIRECTORY, { recursive: true });
  const honors = {};
  const failures = [];
  for (const [index, row] of rows.entries()) {
    try {
      honors[row.name] = await download(row);
    } catch (error) {
      const fallback = previous.honors?.[row.name];
      if (fallback) honors[row.name] = fallback;
      failures.push({
        name: row.name,
        sourceCode: row.code,
        reusedPrevious: Boolean(fallback),
        error: error.message,
      });
    }
    if ((index + 1) % 20 === 0 || index + 1 === rows.length) {
      console.log(
        `Verified competition marks ${index + 1}/${rows.length} · failures ${failures.length}`
      );
    }
  }
  const supplementalRows = Object.entries(supplemental.honors || {}).sort((left, right) =>
    left[0].localeCompare(right[0], "zh-CN")
  );
  for (const [index, [name, row]] of supplementalRows.entries()) {
    try {
      honors[name] = await downloadSupplemental(name, row);
    } catch (error) {
      const fallback = previous.honors?.[name];
      if (fallback) honors[name] = fallback;
      failures.push({
        name,
        sourceCode: row.sourceCode || "",
        reusedPrevious: Boolean(fallback),
        error: error.message,
      });
    }
    if ((index + 1) % 10 === 0 || index + 1 === supplementalRows.length) {
      console.log(
        `Verified supplemental marks ${index + 1}/${supplementalRows.length} · failures ${failures.length}`
      );
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: VERIFIED_AT,
    policy: {
      source:
        "Exact English honor phrase mapped to a unique Transfermarkt public competition page and image code.",
      validation:
        "Every downloaded file must be a non-empty PNG within the accepted byte and dimension limits.",
      rejectedSearchCollisions: [...REJECTED].sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
      supplemental:
        "Public competition marks with exact competition identity verified separately and recorded with direct source metadata.",
    },
    summary: {
      verifiedHonors: Object.keys(honors).length,
      rejectedSearchCollisions: REJECTED.size,
      supplementalHonors: supplementalRows.length,
      failedHonors: failures.length,
    },
    failures,
    honors,
  };
  fs.writeFileSync(OUTPUT_PATH, stableJson(report));
  console.log(
    `Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${Object.keys(honors).length} verified marks.`
  );
  if (failures.some((failure) => !failure.reusedPrevious)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
