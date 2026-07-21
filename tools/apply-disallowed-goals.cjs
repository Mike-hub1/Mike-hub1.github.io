#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const apiRoot = path.join(root, "static", "api", "v1");
const indexPath = path.join(apiRoot, "index.json");
const manifestPath = path.join(__dirname, "disallowed-goals.json");
const correctedFinalPath = path.join(apiRoot, "by-path", "match-543-corrected.json");
const checkOnly = process.argv.includes("--check");

const archiveIndex = readJson(indexPath);
const manifest = readJson(manifestPath);
const entriesByMatch = groupBy(manifest.entries, (entry) => entry.matchId);
const changedFiles = [];

validateManifest(manifest.entries);

for (const [matchId, entries] of entriesByMatch) {
  const canonicalUrl = archiveIndex.details?.matches?.[matchId];
  if (!canonicalUrl) throw new Error(`Archive index is missing ${matchId}`);

  const canonicalPath = archiveUrlToPath(canonicalUrl);
  const match = readJson(canonicalPath);
  if (match.id !== matchId) throw new Error(`${canonicalPath} contains ${match.id}, expected ${matchId}`);

  const originalEvents = Array.isArray(match.events) ? match.events : [];
  const retainedEvents = originalEvents.filter((event) => event.eventType !== "goal_disallowed");
  const verifiedEvents = entries.map((entry) => buildDisallowedGoal(match, entry, manifest.reviewedAt));
  const updatedMatch = {
    ...match,
    events: [...retainedEvents, ...verifiedEvents],
    eventsCount: retainedEvents.length + verifiedEvents.length,
  };

  const snapshotUrls = Object.entries(archiveIndex.paths || {})
    .filter(([apiPath]) => apiPath === `/matches/${matchId}` || apiPath.startsWith(`/matches/${matchId}?`))
    .map(([, archiveUrl]) => archiveUrl);
  snapshotUrls.push(canonicalUrl);

  const snapshotPaths = [...new Set(snapshotUrls.map(archiveUrlToPath))];
  if (matchId === "fifa_match_400021543") snapshotPaths.push(correctedFinalPath);

  for (const snapshotPath of [...new Set(snapshotPaths)]) {
    writeJsonIfChanged(snapshotPath, updatedMatch);
  }
}

const summary = `${manifest.entries.length} verified disallowed goals across ${entriesByMatch.size} matches`;
if (checkOnly && changedFiles.length) {
  throw new Error(`${summary} are not synchronized in ${changedFiles.length} archive snapshots`);
}

console.log(`${checkOnly ? "Checked" : "Applied"} ${summary}; ${changedFiles.length} file(s) ${checkOnly ? "need changes" : "updated"}.`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function archiveUrlToPath(archiveUrl) {
  return path.join(root, String(archiveUrl).replace(/^\/+/, ""));
}

function groupBy(items, keyFor) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return grouped;
}

function validateManifest(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error("Disallowed-goal manifest is empty");
  const identities = new Set();
  for (const entry of entries) {
    if (!/^fifa_match_\d+$/.test(entry.matchId || "")) throw new Error(`Invalid matchId: ${entry.matchId}`);
    if (!/^fifa_player_\d+$/.test(entry.playerId || "")) throw new Error(`Invalid playerId: ${entry.playerId}`);
    if (!Number.isInteger(entry.minute) || entry.minute < 0) throw new Error(`Invalid minute for ${entry.matchId}`);
    if (entry.extraMinute !== undefined && (!Number.isInteger(entry.extraMinute) || entry.extraMinute < 1)) {
      throw new Error(`Invalid extraMinute for ${entry.matchId}`);
    }
    if (!["home", "away"].includes(entry.teamSide)) throw new Error(`Invalid teamSide for ${entry.matchId}`);
    if (!entry.score || !Number.isInteger(entry.score.home) || !Number.isInteger(entry.score.away)) {
      throw new Error(`Invalid score for ${entry.matchId}`);
    }
    if (!entry.sourceUrl?.startsWith("https://www.fifa.com/")) throw new Error(`Non-FIFA source for ${entry.matchId}`);
    const identity = entryIdentity(entry);
    if (identities.has(identity)) throw new Error(`Duplicate manifest entry: ${identity}`);
    identities.add(identity);
  }
}

function entryIdentity(entry) {
  return [entry.matchId, entry.minute, entry.extraMinute || 0, entry.playerId].join(":");
}

function findObjectById(value, id) {
  if (!value || typeof value !== "object") return null;
  if (value.id === id) return value;
  for (const child of Object.values(value)) {
    const found = findObjectById(child, id);
    if (found) return found;
  }
  return null;
}

function compactTeam(team) {
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    flagEmoji: team.flagEmoji,
  };
}

function compactPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    shortName: player.shortName || player.name,
    fullName: player.fullName || player.name,
  };
}

function buildDisallowedGoal(match, entry, createdAt) {
  const player = findObjectById(match, entry.playerId);
  if (!player) throw new Error(`${entry.playerId} was not found in ${match.id}`);
  const team = entry.teamSide === "home" ? match.homeTeam : match.awayTeam;
  if (!team?.id) throw new Error(`${match.id} is missing its ${entry.teamSide} team`);

  const timeKey = entry.extraMinute ? `${entry.minute}_${entry.extraMinute}` : String(entry.minute);
  const reason = entry.reasonText || defaultReason(entry.reason);
  const description = entry.reason === "offside" && !entry.reasonText
    ? `${player.name}破门，但因越位进球被取消。比分仍为 ${entry.score.home}-${entry.score.away}。`
    : `${player.name}破门，但因${reason}，进球被取消。比分仍为 ${entry.score.home}-${entry.score.away}。`;

  return {
    id: `evt_${entry.matchId}_verified_disallowed_goal_${timeKey}`,
    period: periodFor(entry.minute),
    minute: entry.minute,
    extraMinute: entry.extraMinute ?? null,
    eventType: "goal_disallowed",
    team: compactTeam(team),
    player: compactPlayer(player),
    relatedPlayer: null,
    score: { home: entry.score.home, away: entry.score.away },
    qualifiers: {
      espnRawType: "verified-disallowed-goal",
      espnText: entry.evidence,
      espnShortText: `${player.fullName || player.name} Goal Disallowed`,
      reason: entry.reason,
      disallowed: true,
      source: "FIFA Official Match Report + FIFA Official Timeline + ESPN Public Summary",
      officialSourceUrl: entry.sourceUrl,
    },
    description,
    isConfirmed: true,
    supersededBy: null,
    createdAt,
  };
}

function defaultReason(reason) {
  const labels = {
    offside: "越位",
    attacking_foul: "进攻阶段犯规",
    handball: "进攻阶段手球",
  };
  return labels[reason] || "复核判罚无效";
}

function periodFor(minute) {
  if (minute <= 45) return "first_half";
  if (minute <= 90) return "second_half";
  if (minute <= 105) return "extra_time_first_half";
  return "extra_time_second_half";
}

function writeJsonIfChanged(filePath, value) {
  const next = JSON.stringify(value);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (current === next) return;
  changedFiles.push(path.relative(root, filePath));
  if (!checkOnly) fs.writeFileSync(filePath, next);
}
