const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appFile = process.env.APP_FILE || new URL("../static/app.js", `file://${__filename}`);
const source = fs.readFileSync(appFile, "utf8");
const start = source.indexOf("function renderTimelineEvents");
const end = source.indexOf("function renderLineups", start);
assert.ok(start >= 0 && end > start, "timeline function block must be present");

const context = {
  eventLabels: { full_time: "全场", goal: "进球" },
  statusLabels: { ft: "已结束" },
  escapeHtml: (value) => String(value),
  formatDate: () => "07/20 03:00",
  venueDisplay: () => "纽约/新泽西体育场",
  teamDisplayName: (team, fallback) => team?.name || fallback,
  scoreText: (match) => `${match.score.home}-${match.score.away}`,
  attackEventMinute: (event) => Number(event.minute || 0) + Number(event.extraMinute || 0),
  statsEventMatchesTeam: (event, team) => Boolean(team && event.team?.id === team.id),
  statsEventRawText: (event) => `${event.qualifiers?.espnText || ""} ${event.description || ""}`,
  statsEventIsPenaltyShootout: (event) => event.period === "penalty",
  statsEventIsOwnGoal: () => false,
  statsEventIsPenalty: () => false,
  statsEventIsDirectFreeKickGoal: () => false,
  statsEventIsSetPieceGoal: () => false,
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const homeTeam = { id: "esp", name: "西班牙" };
const awayTeam = { id: "arg", name: "阿根廷" };
const regulationEnd = {
  eventType: "full_time",
  period: "full_time",
  minute: 90,
  extraMinute: 9,
  description: "全场结束。 比分 1-0。",
  score: { home: 1, away: 0 },
  qualifiers: { espnText: "Second Half ends, Spain 0, Argentina 0." },
};
const extraTimeGoal = {
  eventType: "goal",
  period: "extra_time_second_half",
  minute: 106,
  team: homeTeam,
};
const extraTimeMatch = {
  status: "ft",
  statusDetail: "加时赛后",
  score: { home: 1, away: 0 },
  homeTeam,
  awayTeam,
  events: [regulationEnd, extraTimeGoal],
};

const regulationHtml = context.renderTimelineEvent(regulationEnd, extraTimeMatch);
assert.match(regulationHtml, /90分钟常规赛结束/);
assert.match(regulationHtml, /比分 0-0/);
assert.match(regulationHtml, /timeline-score-badge">0-0/);
assert.match(regulationHtml, /timeline-event-dot">90/);
assert.doesNotMatch(regulationHtml, /全场结束/);
assert.equal(context.timelineDisplayPeriodLabel(regulationEnd, extraTimeMatch), "90分钟结束");

const finalBoundary = context.renderTimelineBoundary("end", extraTimeMatch, extraTimeMatch.events);
assert.match(finalBoundary, /比赛结束/);
assert.match(finalBoundary, /全场比分 1-0/);

const normalFullTime = {
  ...regulationEnd,
  extraMinute: 4,
  description: "全场结束。 比分 2-1。",
  score: { home: 2, away: 1 },
  qualifiers: { espnText: "Full Time, Spain 2, Argentina 1." },
};
const normalMatch = {
  status: "ft",
  statusDetail: "全场",
  score: { home: 2, away: 1 },
  homeTeam,
  awayTeam,
  events: [normalFullTime],
};
const normalHtml = context.renderTimelineEvent(normalFullTime, normalMatch);
assert.match(normalHtml, /timeline-event-label">全场/);
assert.match(normalHtml, /比分 2-1/);
assert.match(normalHtml, /timeline-event-dot">FT/);
assert.equal(context.timelineDisplayPeriodLabel(normalFullTime, normalMatch), "终场");

const unsortedEvents = [
  { id: "pre", period: "pre_match", eventType: "lineups_announced", description: "赛前阵容" },
  { id: "first-start", period: "first_half", minute: 0, eventType: "kickoff", description: "上半场开球" },
  { id: "halftime-sub", period: "second_half", minute: 45, eventType: "substitution", description: "中场换人" },
  { id: "first-stoppage", period: "first_half", minute: 45, extraMinute: 3, eventType: "foul", description: "上半场补时事件" },
  { id: "half-time", period: "half_time", minute: 45, extraMinute: 4, eventType: "half_time", description: "上半场结束" },
  { id: "second-start", period: "second_half", minute: 45, eventType: "kickoff", description: "下半场开球" },
  { id: "et-foul", period: "extra_time_first_half", minute: 92, eventType: "foul", description: "加时犯规" },
  regulationEnd,
  {
    id: "et1-stoppage",
    period: "second_half",
    minute: 105,
    extraMinute: 3,
    eventType: "added_time",
    description: "加时上半场补时",
    qualifiers: { espnText: "Fourth official has announced 3 minutes of added time." },
  },
  { id: "et-goal", ...extraTimeGoal, description: "加时进球" },
  {
    id: "et2-stoppage",
    period: "second_half",
    minute: 120,
    extraMinute: 5,
    eventType: "added_time",
    description: "加时下半场补时",
    qualifiers: { espnText: "Fourth official has announced 5 minutes of added time." },
  },
];
const unsortedMatch = { ...extraTimeMatch, events: unsortedEvents };

const kickoffHtml = context.renderTimelineEvent(unsortedEvents[1], unsortedMatch);
assert.match(kickoffHtml, /timeline-event-time">0'/);
assert.doesNotMatch(kickoffHtml, /timeline-event-time">上半场/);
const preMatchHtml = context.renderTimelineEvent(unsortedEvents[0], unsortedMatch);
assert.match(preMatchHtml, /timeline-event-time">-/);
assert.doesNotMatch(preMatchHtml, /timeline-event-time">赛前/);
assert.equal(context.timelineEffectivePeriod(unsortedEvents[8], unsortedMatch), "extra_time_first_half");
assert.equal(context.timelineEffectivePeriod(unsortedEvents[10], unsortedMatch), "extra_time_second_half");
const extraTimeAddedHtml = context.renderTimelineEvent(unsortedEvents[8], unsortedMatch);
assert.match(extraTimeAddedHtml, /timeline-event-time">105'/);
assert.doesNotMatch(extraTimeAddedHtml, /timeline-event-time">105\+3'/);
assert.equal(
  context.timelineCanonicalEvents(unsortedEvents, unsortedMatch).map((event) => event.id || "regulation-end").join(","),
  "pre,first-start,first-stoppage,half-time,halftime-sub,second-start,regulation-end,et-foul,et1-stoppage,et-goal,et2-stoppage",
);

const timelineHtml = context.renderTimelineEvents(unsortedEvents, unsortedMatch);
const phaseHeadings = [...timelineHtml.matchAll(/timeline-period"><span>([^<]+)<\/span>/g)].map((match) => match[1]);
assert.deepEqual(phaseHeadings, ["赛前", "上半场", "半场", "下半场", "90分钟结束", "加时上半场", "加时下半场"]);
phaseHeadings.forEach((heading) => {
  assert.equal(phaseHeadings.filter((item) => item === heading).length, 1, `${heading} must render once`);
});
assert.ok(timelineHtml.indexOf("上半场补时事件") < timelineHtml.indexOf("上半场结束"));
assert.ok(timelineHtml.indexOf("上半场结束") < timelineHtml.indexOf("中场换人"));
assert.ok(timelineHtml.indexOf("90分钟常规赛结束") < timelineHtml.indexOf("加时犯规"));
assert.ok(timelineHtml.indexOf("加时上半场补时") < timelineHtml.indexOf("加时进球"));
assert.ok(timelineHtml.indexOf("加时进球") < timelineHtml.indexOf("加时下半场补时"));

const archivedMatch = JSON.parse(
  fs.readFileSync(new URL("../static/api/v1/by-path/match-543-corrected.json", `file://${__filename}`), "utf8"),
);
const archivedTimelineHtml = context.renderTimelineEvents(archivedMatch.events, archivedMatch);
const archivedPhaseHeadings = [...archivedTimelineHtml.matchAll(/timeline-period"><span>([^<]+)<\/span>/g)].map((match) => match[1]);
assert.deepEqual(archivedPhaseHeadings, ["赛前", "上半场", "半场", "下半场", "90分钟结束", "加时上半场", "加时下半场"]);
assert.equal(archivedMatch.events.find((event) => event.minute === 105 && event.extraMinute === 3 && event.eventType === "added_time").period, "extra_time_first_half");
assert.equal(archivedMatch.events.find((event) => event.minute === 120 && event.extraMinute === 5 && event.eventType === "added_time").period, "extra_time_second_half");
assert.ok(archivedTimelineHtml.indexOf("90分钟常规赛结束") < archivedTimelineHtml.indexOf("费兰·托雷斯破门"));

console.log("timeline regulation/full-time rendering and canonical phase order: ok");
