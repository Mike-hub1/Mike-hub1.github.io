const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const archiveIndex = readJson(path.join(root, "static", "api", "v1", "index.json"));
const manifest = readJson(path.join(root, "tools", "disallowed-goals.json"));
const expectedByMatch = groupBy(manifest.entries, (entry) => entry.matchId);

assert.equal(manifest.entries.length, 34, "the reviewed audit must retain all 34 disallowed goals");
assert.equal(expectedByMatch.size, 25, "the reviewed audit must retain all 25 affected matches");

let archivedTotal = 0;
const archivedMatches = new Set();

for (const [matchId, canonicalUrl] of Object.entries(archiveIndex.details.matches)) {
  const detail = readJson(archivePath(canonicalUrl));
  const disallowed = detail.events.filter((event) => event.eventType === "goal_disallowed");
  if (!disallowed.length) continue;
  archivedTotal += disallowed.length;
  archivedMatches.add(matchId);
}

assert.equal(archivedTotal, manifest.entries.length, "canonical archive must contain exactly the reviewed events");
assert.deepEqual([...archivedMatches].sort(), [...expectedByMatch.keys()].sort(), "no unreviewed match may contain synthetic disallowed goals");

for (const [matchId, expectedEntries] of expectedByMatch) {
  const canonicalUrl = archiveIndex.details.matches[matchId];
  const canonical = readJson(archivePath(canonicalUrl));
  const actualEvents = canonical.events.filter((event) => event.eventType === "goal_disallowed");

  assert.equal(canonical.eventsCount, canonical.events.length, `${matchId} eventsCount must match the event array`);
  assert.equal(actualEvents.length, expectedEntries.length, `${matchId} disallowed-goal count must match the manifest`);

  for (const expected of expectedEntries) {
    const actual = actualEvents.find((event) => eventIdentity(matchId, event) === entryIdentity(expected));
    assert.ok(actual, `${entryIdentity(expected)} must exist exactly once`);
    assert.equal(actual.isConfirmed, true);
    assert.equal(actual.qualifiers.disallowed, true);
    assert.equal(actual.qualifiers.reason, expected.reason);
    assert.equal(actual.qualifiers.officialSourceUrl, expected.sourceUrl);
    assert.deepEqual(actual.score, expected.score);
    assert.match(actual.description, /进球被取消/);
  }

  const snapshotUrls = Object.entries(archiveIndex.paths)
    .filter(([apiPath]) => apiPath === `/matches/${matchId}` || apiPath.startsWith(`/matches/${matchId}?`))
    .map(([, archiveUrl]) => archiveUrl);
  assert.equal(new Set(snapshotUrls).size, 5, `${matchId} must retain all five detail URL variants`);
  for (const snapshotUrl of snapshotUrls) {
    assert.deepEqual(readJson(archivePath(snapshotUrl)), canonical, `${snapshotUrl} must match its canonical detail`);
  }
}

const css = fs.readFileSync(path.join(root, "static", "styles.css"), "utf8");
assert.match(css, /\.timeline-event\.goal_disallowed\s*\{/);
assert.match(css, /\.timeline-event\.goal_disallowed\s+\.timeline-event-dot\s*\{/);

const node = process.execPath;
const check = spawnSync(node, [path.join(root, "tools", "apply-disallowed-goals.cjs"), "--check"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(check.status, 0, check.stderr || check.stdout);
assert.match(check.stdout, /0 file\(s\) need changes/);

console.log("disallowed-goal evidence manifest and all archive variants: ok");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function archivePath(archiveUrl) {
  return path.join(root, archiveUrl.replace(/^\/+/, ""));
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

function entryIdentity(entry) {
  return [entry.matchId, entry.minute, entry.extraMinute || 0, entry.playerId].join(":");
}

function eventIdentity(matchId, event) {
  return [matchId, event.minute, event.extraMinute || 0, event.player.id].join(":");
}
