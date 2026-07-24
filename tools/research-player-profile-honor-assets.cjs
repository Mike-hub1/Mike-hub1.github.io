const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(__dirname, "player-profile-asset-registry.json");
const ALIASES_PATH = path.join(__dirname, "player-profile-honor-aliases.json");
const OUTPUT_PATH = path.join(__dirname, "player-profile-honor-research.json");
const USER_AGENT = "WC26HonorResearch/1.0 (public football trophy asset audit)";
const CONCURRENCY = 2;
const RETRIES = 4;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function compactSearchName(value) {
  return String(value || "")
    .replace(/冠军$/u, "")
    .replace(/冠军杯$/u, "杯")
    .replace(/\b(?:champion|winner)$/iu, "")
    .trim();
}

function normalized(value) {
  return String(value || "")
    .toLocaleLowerCase("en")
    .replace(/冠军|champions?|winners?|football|soccer|de|of|the/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function footballDescription(value) {
  return /football|soccer|association|league|cup|tournament|competition|supercup|championship|award|足球|联赛|杯|锦标|赛事|奖/iu.test(
    String(value || "")
  );
}

function candidateScore(query, candidate) {
  const queryKey = normalized(query);
  const labelKey = normalized(candidate.label);
  const aliasKeys = (candidate.aliases || []).map(normalized);
  let score = 0;
  if (queryKey && labelKey === queryKey) score += 120;
  else if (queryKey && aliasKeys.includes(queryKey)) score += 110;
  else if (queryKey && (labelKey.includes(queryKey) || queryKey.includes(labelKey))) score += 65;
  if (candidate.match?.type === "label") score += 12;
  if (footballDescription(candidate.description)) score += 30;
  return score;
}

async function fetchJson(url) {
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
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await wait(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function wikidataApi(parameters) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  Object.entries({ format: "json", ...parameters }).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return url;
}

async function discoverHonor(name, aliases = []) {
  const primaryAlias = aliases[0] || "";
  const queries = [...new Set([compactSearchName(primaryAlias), compactSearchName(name)].filter(Boolean))];
  const candidates = new Map();
  for (const query of queries) {
    const language = hasCjk(query) ? "zh" : "en";
    const payload = await fetchJson(
      wikidataApi({
        action: "wbsearchentities",
        search: query,
        language,
        uselang: language,
        type: "item",
        limit: "8",
      })
    );
    for (const candidate of payload.search || []) {
      const score = candidateScore(query, candidate);
      const current = candidates.get(candidate.id);
      if (!current || score > current.score) candidates.set(candidate.id, { ...candidate, score, query });
    }
    await wait(180);
  }
  return [...candidates.values()].sort((left, right) => right.score - left.score).slice(0, 5);
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

function claimValue(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value || "";
}

function sitelinkUrl(entity) {
  const preferences = [
    ["zhwiki", "zh"],
    ["enwiki", "en"],
    ["eswiki", "es"],
    ["frwiki", "fr"],
    ["dewiki", "de"],
    ["ptwiki", "pt"],
  ];
  for (const [key, language] of preferences) {
    const title = entity?.sitelinks?.[key]?.title;
    if (title) return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
  }
  return "";
}

async function loadEntities(ids) {
  const entities = {};
  for (let index = 0; index < ids.length; index += 40) {
    const batch = ids.slice(index, index + 40);
    const payload = await fetchJson(
      wikidataApi({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "labels|descriptions|claims|sitelinks",
        languages: "zh|en|es|fr|de|pt",
      })
    );
    Object.assign(entities, payload.entities || {});
  }
  return entities;
}

function publicImageUrl(fileName) {
  if (!fileName) return "";
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}?width=512`;
}

async function main() {
  const registry = readJson(REGISTRY_PATH);
  const aliases = fs.existsSync(ALIASES_PATH) ? readJson(ALIASES_PATH).honors || {} : {};
  const unresolved = Object.values(registry.honors)
    .filter((row) => !row.assetUrl)
    .sort((left, right) => right.uses - left.uses || left.name.localeCompare(right.name, "zh-CN"));
  let completed = 0;
  const discoveries = await mapConcurrent(unresolved, async (row) => {
    try {
      const candidates = await discoverHonor(row.name, aliases[row.name]?.aliases || []);
      return { row, candidates };
    } catch (error) {
      return { row, candidates: [], error: error.message };
    } finally {
      completed += 1;
      if (completed % 20 === 0 || completed === unresolved.length) {
        console.log(`Wikidata discovery ${completed}/${unresolved.length}`);
      }
    }
  });
  const entityIds = [
    ...new Set(discoveries.flatMap((result) => result.candidates.map((candidate) => candidate.id))),
  ];
  const entities = await loadEntities(entityIds);
  const honors = {};
  for (const { row, candidates, error } of discoveries) {
    const enriched = candidates.map((candidate) => {
      const entity = entities[candidate.id] || {};
      const logoFile = claimValue(entity, "P154");
      const imageFile = claimValue(entity, "P18");
      const assetFile = logoFile || imageFile;
      return {
        id: candidate.id,
        label: candidate.label,
        description: candidate.description || "",
        score: candidate.score,
        query: candidate.query,
        assetKind: logoFile ? "competition-logo" : imageFile ? "public-image" : "",
        assetFile,
        assetSourceUrl: publicImageUrl(assetFile),
        sourcePage: sitelinkUrl(entity) || `https://www.wikidata.org/wiki/${candidate.id}`,
        officialWebsite: claimValue(entity, "P856"),
      };
    });
    const selected = ["年度最佳球员", "赛季最佳球员"].includes(row.name)
      ? null
      : enriched.find(
          (candidate) =>
            candidate.score >= 95 &&
            candidate.assetKind === "competition-logo" &&
            candidate.assetSourceUrl &&
            footballDescription(candidate.description)
        );
    honors[row.name] = {
      name: row.name,
      honorIds: row.honorIds,
      category: row.category,
      uses: row.uses,
      aliases: aliases[row.name]?.aliases || [],
      status: selected ? "candidate" : "needs-manual-review",
      selected: selected || null,
      candidates: enriched,
      error,
    };
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      sourcePriority: ["competition organizer", "official federation or award owner", "Wikimedia structured public asset"],
      automaticAcceptance:
        "Only an exact high-scoring football competition entity with a dedicated public logo or image becomes a candidate; every candidate remains reviewable.",
      noSyntheticMarks: true,
    },
    summary: {
      unresolvedHonors: unresolved.length,
      candidates: Object.values(honors).filter((row) => row.status === "candidate").length,
      manualReview: Object.values(honors).filter((row) => row.status !== "candidate").length,
    },
    honors,
  };
  fs.writeFileSync(OUTPUT_PATH, stableJson(report));
  console.log(
    `Honor research complete: ${report.summary.candidates}/${report.summary.unresolvedHonors} structured candidates; ` +
      `${report.summary.manualReview} manual reviews.`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
