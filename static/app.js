const API = "/api/v1";
const STATIC_DATA_VERSION = "289";
const PLAYER_STAT_WINDOW_SIZE = 6;
const ARCHIVE_CONFIG = window.WC26_ARCHIVE_CONFIG || {};
const ARCHIVE_MODE = Boolean(ARCHIVE_CONFIG.enabled);
const LIVE_MATCH_ID = "match_mex_can_wc26_group_a";
const bootApiPromises = window.WC26_BOOT_API_PROMISES instanceof Map ? window.WC26_BOOT_API_PROMISES : new Map();

const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toast = document.getElementById("toast");
const lookups = { competitions: [], teams: [], players: [], formationConfig: null };
let activeStream = null;
let activeMatchPollTimer = null;
let knockoutRefreshTimer = null;
let leaderboardRefreshTimer = null;
let leaderboardSliderState = null;
let playerStatSliderState = null;
let toastTimer = null;
let formationConfigLoaded = false;
let formationConfigPromise = null;
let archiveApiIndexPromise = null;
const lookupPromises = { competitions: null, teams: null, players: null };
const archiveApiCache = new Map();

const leaderboardCategories = [
  { metric: "goals", label: "进球榜", unit: "球", sourceMetric: "goals", limit: 50, displayLimit: 50, noFallback: true, emptySourceNote: "进球榜暂时读取失败" },
  { metric: "assists", label: "助攻榜", unit: "次", sourceMetric: "assists", limit: 50, displayLimit: 50, noFallback: true, emptySourceNote: "助攻榜暂时读取失败" },
  { metric: "players", label: "球员榜", unit: "", sourceMetric: "players", limit: 50, displayLimit: 50, noFallback: true, emptySourceNote: "懂球帝球员统计暂时读取失败" },
  { metric: "market_values", label: "身价榜", unit: "", sourceMetric: "market_values", limit: 50, displayLimit: 50, sliderWindow: 8, noFallback: true, emptySourceNote: "身价榜暂时读取失败" },
  { metric: "teams", label: "球队榜", unit: "CSI", sourceMetric: "teams", subject: "team", limit: 32, displayLimit: 32, sliderWindow: 8, noFallback: true, emptySourceNote: "W32-CSI 球队榜暂时读取失败" },
];

const playerPosterMap = {
  fifa_player_389867: "/static/assets/players/posters/fifa_player_389867.webp",
  "389867-kylian-mbappe": "/static/assets/players/posters/fifa_player_389867.webp",
  fifa_player_229397: "/static/assets/players/posters/fifa_player_229397.webp",
  "229397-lionel-messi": "/static/assets/players/posters/fifa_player_229397.webp",
  fifa_player_369419: "/static/assets/players/posters/fifa_player_369419.webp",
  "369419-harry-kane": "/static/assets/players/posters/fifa_player_369419.webp",
  fifa_player_419652: "/static/assets/players/posters/fifa_player_419652.webp",
  "419652-erling-haaland": "/static/assets/players/posters/fifa_player_419652.webp",
  fifa_player_430751: "/static/assets/players/posters/fifa_player_430751.webp",
  "430751-mikel-oyarzabal": "/static/assets/players/posters/fifa_player_430751.webp",
  fifa_player_398680: "/static/assets/players/posters/fifa_player_398680.webp",
  "398680-ousmane-dembele": "/static/assets/players/posters/fifa_player_398680.webp",
  fifa_player_405742: "/static/assets/players/posters/fifa_player_405742.webp",
  "405742-vinicius-junior": "/static/assets/players/posters/fifa_player_405742.webp",
};

const assistPosterMap = {
  fifa_player_485655: "/static/assets/players/posters/assist_fifa_player_485655.webp",
  "485655-michael-olise": "/static/assets/players/posters/assist_fifa_player_485655.webp",
  fifa_player_430605: "/static/assets/players/posters/assist_fifa_player_430605.webp",
  "430605-bruno-guimaraes": "/static/assets/players/posters/assist_fifa_player_430605.webp",
  fifa_player_403585: "/static/assets/players/posters/assist_fifa_player_403585.webp",
  "403585-roberto-alvarado": "/static/assets/players/posters/assist_fifa_player_403585.webp",
  fifa_player_400716: "/static/assets/players/posters/assist_fifa_player_400716.webp",
  "400716-martin-odegaard": "/static/assets/players/posters/assist_fifa_player_400716.webp",
  fifa_player_398680: "/static/assets/players/posters/assist_fifa_player_398680.webp",
  "398680-ousmane-dembele": "/static/assets/players/posters/assist_fifa_player_398680.webp",
  fifa_player_502727: "/static/assets/players/posters/assist_fifa_player_502727.webp",
  "502727-johan-manzambi": "/static/assets/players/posters/assist_fifa_player_502727.webp",
  fifa_player_430735: "/static/assets/players/posters/assist_fifa_player_430735.webp",
  "430735-marc-cucurella": "/static/assets/players/posters/assist_fifa_player_430735.webp",
  fifa_player_448189: "/static/assets/players/posters/assist_fifa_player_448189.webp",
  "448189-anthony-gordon": "/static/assets/players/posters/assist_fifa_player_448189.webp",
};

const playerPosterMaps = {
  goals: playerPosterMap,
  assists: assistPosterMap,
};

const metricLabels = {
  ...Object.fromEntries(leaderboardCategories.map((category) => [category.metric, category.label])),
  goals: "进球榜",
  assists: "助攻榜",
  market_values: "身价榜",
};

const leaderboardMetricAliases = {
  ratings: "players",
  cards: "players",
  saves: "players",
  yellow_cards: "players",
  red_cards: "players",
};

const leaderboardFallbackRows = {
  goals: [
    { rank: 1, player: { id: "fallback_goals_1", name: "卢卡斯·莫雷诺", shortName: "莫雷诺", position: "FW" }, team: { id: "fallback_team_blue", name: "蓝湾联队", code: "FRA", flagUrl: "/static/assets/flags/fra.png" }, value: 7, trend: 0 },
    { rank: 2, player: { id: "fallback_goals_2", name: "伊万·费雷拉", shortName: "费雷拉", position: "FW" }, team: { id: "fallback_team_south", name: "南岸竞技", code: "ARG", flagUrl: "/static/assets/flags/arg.png" }, value: 6, trend: 1 },
    { rank: 3, player: { id: "fallback_goals_3", name: "卡约·里贝罗", shortName: "里贝罗", position: "FW" }, team: { id: "fallback_team_rio", name: "里约之星", code: "BRA", flagUrl: "/static/assets/flags/bra.png" }, value: 5, trend: -1 },
    { rank: 4, player: { id: "fallback_goals_4", name: "阿尔瓦雷斯", shortName: "阿尔瓦雷斯", position: "MF" }, team: { id: "fallback_team_harbor", name: "海港联", code: "ESP", flagUrl: "/static/assets/flags/esp.png" }, value: 4, trend: 1 },
    { rank: 5, player: { id: "fallback_goals_5", name: "雷昂", shortName: "雷昂", position: "FW" }, team: { id: "fallback_team_north", name: "北境之光", code: "POR", flagUrl: "/static/assets/flags/por.png" }, value: 4, trend: 2 },
    { rank: 6, player: { id: "fallback_goals_6", name: "马丁斯", shortName: "马丁斯", position: "FW" }, team: { id: "fallback_team_orange", name: "橙色风暴", code: "NED", flagUrl: "/static/assets/flags/ned.png" }, value: 3, trend: -1 },
    { rank: 7, player: { id: "fallback_goals_7", name: "索拉诺", shortName: "索拉诺", position: "MF" }, team: { id: "fallback_team_mex", name: "墨城雄鹰", code: "MEX", flagUrl: "/static/assets/flags/mex.png" }, value: 3, trend: 3 },
    { rank: 8, player: { id: "fallback_goals_8", name: "卡米洛", shortName: "卡米洛", position: "FW" }, team: { id: "fallback_team_andes", name: "安第斯联", code: "COL", flagUrl: "/static/assets/flags/col.png" }, value: 3, trend: -2 },
    { rank: 9, player: { id: "fallback_goals_9", name: "安德烈·席尔瓦", shortName: "席尔瓦", position: "FW" }, team: { id: "fallback_team_lake", name: "湖城竞技", code: "ENG", flagUrl: "/static/assets/flags/eng.png" }, value: 2, trend: 1 },
    { rank: 10, player: { id: "fallback_goals_10", name: "乔纳森·戴维", shortName: "戴维", position: "FW" }, team: { id: "fallback_team_blue", name: "蓝湾联队", code: "FRA", flagUrl: "/static/assets/flags/fra.png" }, value: 2, trend: 0 },
  ],
  assists: [
    { rank: 1, player: { id: "fallback_assists_1", name: "米格尔·桑托斯", shortName: "桑托斯", position: "MF" }, team: { id: "fallback_team_blue", name: "蓝湾联队", code: "FRA", flagUrl: "/static/assets/flags/fra.png" }, value: 6, trend: 2 },
    { rank: 2, player: { id: "fallback_assists_2", name: "奥斯卡·佩雷拉", shortName: "佩雷拉", position: "MF" }, team: { id: "fallback_team_harbor", name: "海港联", code: "ESP", flagUrl: "/static/assets/flags/esp.png" }, value: 5, trend: 1 },
    { rank: 3, player: { id: "fallback_assists_3", name: "诺亚·维克托", shortName: "维克托", position: "MF" }, team: { id: "fallback_team_north", name: "北境之光", code: "POR", flagUrl: "/static/assets/flags/por.png" }, value: 4, trend: -1 },
    { rank: 4, player: { id: "fallback_assists_4", name: "法比奥", shortName: "法比奥", position: "MF" }, team: { id: "fallback_team_rio", name: "里约之星", code: "BRA", flagUrl: "/static/assets/flags/bra.png" }, value: 4, trend: 1 },
    { rank: 5, player: { id: "fallback_assists_5", name: "卡斯特罗", shortName: "卡斯特罗", position: "MF" }, team: { id: "fallback_team_mex", name: "墨城雄鹰", code: "MEX", flagUrl: "/static/assets/flags/mex.png" }, value: 3, trend: 2 },
    { rank: 6, player: { id: "fallback_assists_6", name: "德容", shortName: "德容", position: "MF" }, team: { id: "fallback_team_orange", name: "橙色风暴", code: "NED", flagUrl: "/static/assets/flags/ned.png" }, value: 3, trend: -1 },
    { rank: 7, player: { id: "fallback_assists_7", name: "罗德里", shortName: "罗德里", position: "MF" }, team: { id: "fallback_team_lake", name: "湖城竞技", code: "ENG", flagUrl: "/static/assets/flags/eng.png" }, value: 3, trend: 1 },
    { rank: 8, player: { id: "fallback_assists_8", name: "马特奥", shortName: "马特奥", position: "MF" }, team: { id: "fallback_team_andes", name: "安第斯联", code: "COL", flagUrl: "/static/assets/flags/col.png" }, value: 2, trend: -2 },
    { rank: 9, player: { id: "fallback_assists_9", name: "布鲁诺·费尔南德斯", shortName: "费尔南德斯", position: "MF" }, team: { id: "fallback_team_north", name: "北境之光", code: "POR", flagUrl: "/static/assets/flags/por.png" }, value: 2, trend: 1 },
    { rank: 10, player: { id: "fallback_assists_10", name: "贝林厄姆", shortName: "贝林厄姆", position: "MF" }, team: { id: "fallback_team_lake", name: "湖城竞技", code: "ENG", flagUrl: "/static/assets/flags/eng.png" }, value: 2, trend: 0 },
  ],
  cards: [
    { rank: 1, player: { id: "fallback_cards_1", name: "迭戈·桑切斯", shortName: "桑切斯", position: "DF" }, team: { id: "fallback_team_mex", name: "墨城雄鹰", code: "MEX", flagUrl: "/static/assets/flags/mex.png" }, value: 5, trend: 1 },
    { rank: 2, player: { id: "fallback_cards_2", name: "马丁斯", shortName: "马丁斯", position: "DF" }, team: { id: "fallback_team_orange", name: "橙色风暴", code: "NED", flagUrl: "/static/assets/flags/ned.png" }, value: 4, trend: -1 },
    { rank: 3, player: { id: "fallback_cards_3", name: "布鲁诺·席尔瓦", shortName: "席尔瓦", position: "MF" }, team: { id: "fallback_team_rio", name: "里约之星", code: "BRA", flagUrl: "/static/assets/flags/bra.png" }, value: 4, trend: 2 },
    { rank: 4, player: { id: "fallback_cards_4", name: "卡斯特罗", shortName: "卡斯特罗", position: "DF" }, team: { id: "fallback_team_harbor", name: "海港联", code: "ESP", flagUrl: "/static/assets/flags/esp.png" }, value: 3, trend: 1 },
    { rank: 5, player: { id: "fallback_cards_5", name: "贝克", shortName: "贝克", position: "DF" }, team: { id: "fallback_team_lake", name: "湖城竞技", code: "ENG", flagUrl: "/static/assets/flags/eng.png" }, value: 3, trend: 2 },
    { rank: 6, player: { id: "fallback_cards_6", name: "佩雷斯", shortName: "佩雷斯", position: "MF" }, team: { id: "fallback_team_south", name: "南岸竞技", code: "ARG", flagUrl: "/static/assets/flags/arg.png" }, value: 2, trend: -1 },
    { rank: 7, player: { id: "fallback_cards_7", name: "罗查", shortName: "罗查", position: "DF" }, team: { id: "fallback_team_andes", name: "安第斯联", code: "COL", flagUrl: "/static/assets/flags/col.png" }, value: 2, trend: 3 },
    { rank: 8, player: { id: "fallback_cards_8", name: "尼古拉", shortName: "尼古拉", position: "DF" }, team: { id: "fallback_team_north", name: "北境之光", code: "POR", flagUrl: "/static/assets/flags/por.png" }, value: 2, trend: -2 },
  ],
  teams: [
    { rank: 1, team: { id: "fallback_team_fra", name: "法国", code: "FRA", flagUrl: "/static/assets/flags/fra.png" }, value: 9, trend: 1, detail: "3赛 · +8" },
    { rank: 2, team: { id: "fallback_team_arg", name: "阿根廷", code: "ARG", flagUrl: "/static/assets/flags/arg.png" }, value: 9, trend: 0, detail: "3赛 · +7" },
    { rank: 3, team: { id: "fallback_team_bra", name: "巴西", code: "BRA", flagUrl: "/static/assets/flags/bra.png" }, value: 7, trend: 2, detail: "3赛 · +6" },
    { rank: 4, team: { id: "fallback_team_sui", name: "瑞士", code: "SUI", flagUrl: "/static/assets/flags/sui.png" }, value: 7, trend: 1, detail: "3赛 · +4" },
    { rank: 5, team: { id: "fallback_team_eng", name: "英格兰", code: "ENG", flagUrl: "/static/assets/flags/eng.png" }, value: 7, trend: 2, detail: "3赛 · +4" },
    { rank: 6, team: { id: "fallback_team_ger", name: "德国", code: "GER", flagUrl: "/static/assets/flags/ger.png" }, value: 6, trend: -1, detail: "3赛 · +6" },
    { rank: 7, team: { id: "fallback_team_por", name: "葡萄牙", code: "POR", flagUrl: "/static/assets/flags/por.png" }, value: 5, trend: 3, detail: "3赛 · +5" },
    { rank: 8, team: { id: "fallback_team_bel", name: "比利时", code: "BEL", flagUrl: "/static/assets/flags/bel.png" }, value: 5, trend: -2, detail: "3赛 · +4" },
  ],
};

const eventLabels = {
  goal: "进球",
  goal_disallowed: "进球无效",
  yellow_card: "黄牌",
  red_card: "红牌",
  substitution: "换人",
  half_time: "半场",
  full_time: "全场",
  penalty_win: "点球",
  kickoff: "开球",
  lineups_announced: "阵容",
  added_time: "补时",
  shot_on_target: "射正",
  shot_off_target: "射偏",
  shot_blocked: "封堵",
  foul: "犯规",
  corner: "角球",
  offside: "越位",
  var: "VAR",
  delay_start: "暂停",
  delay_end: "恢复",
};

const statusLabels = {
  live: "进行中",
  scheduled: "未开始",
  ft: "已完场",
};

const positionLabels = {
  GK: "门将",
  LB: "左后卫",
  LCB: "左中卫",
  CCB: "中间中卫",
  RCB: "右中卫",
  RB: "右后卫",
  LWB: "左翼卫",
  RWB: "右翼卫",
  LDM: "左后腰",
  DM: "后腰",
  RDM: "右后腰",
  LCM: "左中场",
  CM: "中场",
  RCM: "右中场",
  LAM: "左前腰",
  CAM: "前腰",
  RAM: "右前腰",
  LM: "左中场",
  RM: "右中场",
  LW: "左边锋",
  RW: "右边锋",
  LS: "左前锋",
  ST: "中锋",
  RS: "右前锋",
  SS: "影锋",
  DF: "后卫",
  MF: "中场",
  FW: "前锋",
  G: "门将",
  Goalkeeper: "门将",
  CB: "中卫",
  CD: "中卫",
  "CB-L": "左中卫",
  "CB-R": "右中卫",
  "CD-L": "左中卫",
  "CD-R": "右中卫",
  Defender: "后卫",
  DMF: "后腰",
  CDM: "后腰",
  "DM-L": "左后腰",
  "DM-R": "右后腰",
  LDMF: "左后腰",
  RDMF: "右后腰",
  CMF: "中场",
  "CM-L": "左中场",
  "CM-R": "右中场",
  LCMF: "左中场",
  RCMF: "右中场",
  AM: "前腰",
  AMF: "前腰",
  "AM-L": "左前腰",
  "AM-R": "右前腰",
  LAMF: "左前腰",
  RAMF: "右前腰",
  LMF: "左中场",
  RMF: "右中场",
  Midfielder: "中场",
  F: "中锋",
  CF: "中锋",
  "CF-L": "左路前锋",
  "CF-R": "右路前锋",
  LWF: "左边锋",
  RWF: "右边锋",
  LF: "左前锋",
  RF: "右前锋",
  Forward: "前锋",
  NA: "未公布",
};

const roleAliases = {
  G: "GK",
  GOALKEEPER: "GK",
  CB: "CCB",
  CD: "CCB",
  SW: "CCB",
  "CB-C": "CCB",
  "CD-C": "CCB",
  "CB-L": "LCB",
  "CD-L": "LCB",
  "CB-R": "RCB",
  "CD-R": "RCB",
  DMF: "DM",
  CDM: "DM",
  "DM-L": "LDM",
  LDMF: "LDM",
  "DM-R": "RDM",
  RDMF: "RDM",
  CMF: "CM",
  "CM-L": "LCM",
  LCMF: "LCM",
  "CM-R": "RCM",
  RCMF: "RCM",
  AM: "CAM",
  AMF: "CAM",
  "AM-C": "CAM",
  "AM-L": "LAM",
  LAMF: "LAM",
  "AM-R": "RAM",
  RAMF: "RAM",
  LMF: "LM",
  RMF: "RM",
  LWF: "LW",
  LF: "LW",
  RWF: "RW",
  RF: "RW",
  "CF-L": "LS",
  "CF-R": "RS",
  RCF: "RS",
  CF: "ST",
  F: "ST",
  FW: "FW",
  DF: "DF",
  MF: "MF",
  M: "MF",
};

const fallbackFormationSpecs = {
  "4-2-3-1": ["LB", "LCB", "RCB", "RB", "LDM", "RDM", "LW", "CAM", "RW", "ST"],
  "4-1-2-3": ["LB", "LCB", "RCB", "RB", "DM", "LCM", "RCM", "LW", "ST", "RW"],
  "4-1-4-1": ["LB", "LCB", "RCB", "RB", "DM", "LM", "LCM", "RCM", "RM", "ST"],
  "4-1-3-2": ["LB", "LCB", "RCB", "RB", "DM", "LM", "CAM", "RM", "LS", "RS"],
  "4-3-3": ["LB", "LCB", "RCB", "RB", "LCM", "DM", "RCM", "LW", "ST", "RW"],
  "4-3-1-2": ["LB", "LCB", "RCB", "RB", "LCM", "DM", "RCM", "CAM", "LS", "RS"],
  "4-4-1-1": ["LB", "LCB", "RCB", "RB", "LM", "LCM", "RCM", "RM", "CAM", "ST"],
  "3-4-3": ["LCB", "CCB", "RCB", "LWB", "LCM", "RCM", "RWB", "LW", "ST", "RW"],
  "3-1-4-2": ["LCB", "CCB", "RCB", "DM", "LM", "LCM", "RCM", "RM", "LS", "RS"],
  "3-4-2-1": ["LCB", "CCB", "RCB", "LWB", "LDM", "RDM", "RWB", "LAM", "RAM", "ST"],
  "3-5-2": ["LCB", "CCB", "RCB", "LWB", "LCM", "DM", "RCM", "RWB", "LS", "RS"],
  "4-4-2": ["LB", "LCB", "RCB", "RB", "LM", "LCM", "RCM", "RM", "LS", "RS"],
  "4-2-2-2": ["LB", "LCB", "RCB", "RB", "LDM", "RDM", "LAM", "RAM", "LS", "RS"],
  "5-3-2": ["LWB", "LCB", "CCB", "RCB", "RWB", "LCM", "DM", "RCM", "LS", "RS"],
  "5-4-1": ["LWB", "LCB", "CCB", "RCB", "RWB", "LM", "LCM", "RCM", "RM", "ST"],
};

let formationSpecs = { ...fallbackFormationSpecs };

const fallbackFormationRoleCoords = {
  LB: [17, 15],
  LCB: [15, 38],
  CCB: [15, 50],
  RCB: [15, 62],
  RB: [17, 85],
  LWB: [23, 14],
  RWB: [23, 86],
  LDM: [28, 35],
  DM: [27, 50],
  RDM: [28, 65],
  LCM: [32, 33],
  CM: [32, 50],
  RCM: [32, 67],
  LM: [33, 15],
  RM: [33, 85],
  LAM: [37, 36],
  CAM: [38, 50],
  RAM: [37, 64],
  LW: [39, 22],
  RW: [39, 78],
  LS: [41, 39],
  ST: [43, 50],
  RS: [41, 61],
  SS: [40, 50],
};

let formationRoleCoords = { ...fallbackFormationRoleCoords };

const defaultLineupPositioningRules = {
  version: "axis-lock-4",
  axisLockedTemplateRoles: ["ST", "CAM", "DM", "CM", "CCB"],
  fallbackAxisLockedRoles: ["ST", "CAM"],
  sameDepthLineRoles: ["LCB", "CCB", "RCB"],
  overlapAvoidance: {
    passes: 4,
    xBreakDistance: 7.6,
    yCollisionDistance: 12.5,
    normalDepthGap: 6.4,
    axisDepthGap: 9.2,
    softYPush: 2.4,
    hardYPush: 4.2,
    depthPush: 1.6,
  },
};

let lineupPositioningRules = {
  ...defaultLineupPositioningRules,
  overlapAvoidance: { ...defaultLineupPositioningRules.overlapAvoidance },
};

const defaultFormationMicroAdjustments = {
  lineGroupTriggers: [],
  patterns: [],
};

let formationMicroAdjustments = {
  lineGroupTriggers: [],
  patterns: [],
};

function applyFormationConfig(config) {
  const configuredFormations = config?.formations || {};
  const nextFormationSpecs = {};
  Object.entries(configuredFormations).forEach(([key, value]) => {
    const roles = Array.isArray(value) ? value : value?.roles;
    if (Array.isArray(roles) && roles.length) nextFormationSpecs[key] = roles.map((role) => normalizeRoleCode(role));
  });
  formationSpecs = Object.keys(nextFormationSpecs).length ? nextFormationSpecs : { ...fallbackFormationSpecs };

  const configuredCoords = config?.roleCoordinates || {};
  const nextCoords = { ...fallbackFormationRoleCoords };
  Object.entries(configuredCoords).forEach(([role, coord]) => {
    if (Array.isArray(coord) && coord.length >= 2) {
      const x = Number(coord[0]);
      const y = Number(coord[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) nextCoords[normalizeRoleCode(role)] = [x, y];
    }
  });
  formationRoleCoords = nextCoords;

  const rules = config?.positioningRules || {};
  lineupPositioningRules = {
    ...defaultLineupPositioningRules,
    ...rules,
    overlapAvoidance: {
      ...defaultLineupPositioningRules.overlapAvoidance,
      ...(rules.overlapAvoidance || {}),
    },
  };

  const micro = config?.microAdjustments || config?.formationMicroAdjustments || {};
  formationMicroAdjustments = {
    ...defaultFormationMicroAdjustments,
    ...micro,
    lineGroupTriggers: Array.isArray(micro.lineGroupTriggers) ? micro.lineGroupTriggers : [],
    patterns: Array.isArray(micro.patterns) ? micro.patterns : [],
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeInfo() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, query = ""] = raw.split("?");
  return { path: pathPart || "/", params: new URLSearchParams(query) };
}

function toQuery(obj) {
  const params = new URLSearchParams();
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") params.set(key, value);
  });
  return params.toString();
}

function hashHref(path, params = {}) {
  const query = toQuery(params);
  return `#${path}${query ? `?${query}` : ""}`;
}

let activeMatchReturnTarget = "";

function normalizeMatchReturnTarget(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("#/")) return "";
  const [path, query = ""] = raw.slice(1).split("?");
  const params = new URLSearchParams(query);
  if (path === "/knockout") {
    const next = {};
    const round = normalizeKnockoutRoundParam(params.get("round"));
    const view = params.get("view");
    const filter = params.get("filter");
    const half = params.get("half");
    if (round) next.round = round;
    if (knockoutViewModes.some((item) => item.key === view)) next.view = view;
    if (knockoutFilterChips.some((item) => item.key === filter)) next.filter = filter;
    if (knockoutHalfFilterChips.some((item) => item.key === half)) next.half = half;
    if (params.get("team")) next.team = params.get("team");
    return hashHref(path, next);
  }
  if (path === "/competitions/world-cup-2026") {
    return groupStageHref(normalizeGroupStageState(params));
  }
  return "";
}

function setActiveMatchReturnTarget(value) {
  activeMatchReturnTarget = normalizeMatchReturnTarget(value);
}

function matchDetailHref(matchId, params = {}) {
  const current = routeInfo();
  const inheritedTarget = current.path.startsWith("/matches/")
    ? normalizeMatchReturnTarget(current.params.get("returnTo"))
    : activeMatchReturnTarget || normalizeMatchReturnTarget(location.hash);
  return hashHref(`/matches/${matchId}`, {
    ...params,
    returnTo: inheritedTarget || undefined,
  });
}

function safeRouteId(value) {
  const raw = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : "";
}

function lineupPlayerAnchor(playerId, area = "roster") {
  const safePlayerId = safeRouteId(playerId);
  if (!safePlayerId) return "";
  return `${area === "pitch" ? "pitch" : "lineup"}-player-${safePlayerId}`;
}

function normalizePlayerReturnTarget(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("#/matches/")) return "";
  const [path, query = ""] = raw.slice(1).split("?");
  const matchId = safeRouteId(path.slice("/matches/".length));
  if (!matchId || path !== `/matches/${matchId}`) return "";
  const params = new URLSearchParams(query);
  const focusPlayer = safeRouteId(params.get("focusPlayer"));
  const focusArea = params.get("focusArea") === "pitch" ? "pitch" : "roster";
  const matchReturnTarget = normalizeMatchReturnTarget(params.get("returnTo"));
  return hashHref(`/matches/${matchId}`, {
    tab: "lineups",
    focusPlayer: focusPlayer || undefined,
    focusArea: focusPlayer ? focusArea : undefined,
    returnTo: matchReturnTarget || undefined,
  });
}

function cleanHomeUrl() {
  if (location.pathname !== "/") return;
  const isHomeHash = !location.hash || location.hash === "#/" || location.hash === "#";
  if (isHomeHash && (location.search || location.hash)) {
    history.replaceState(null, "", "/");
  }
}

function archiveVersionParam() {
  const archiveStamp = ARCHIVE_CONFIG.generatedAt || "archive";
  return encodeURIComponent(`${archiveStamp}-${STATIC_DATA_VERSION}`);
}

function withArchiveVersion(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}archive=${archiveVersionParam()}`;
}

function canonicalApiPath(path) {
  const url = new URL(path, location.origin);
  const params = new URLSearchParams(url.search);
  params.sort();
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function archivePathParams(canonicalPath) {
  const [, query = ""] = canonicalPath.split("?");
  return new URLSearchParams(query);
}

async function loadArchiveApiIndex() {
  if (!archiveApiIndexPromise) {
    const indexUrl = ARCHIVE_CONFIG.apiIndexUrl || "/static/api/v1/index.json";
    archiveApiIndexPromise = fetch(withArchiveVersion(indexUrl), { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`归档索引不可用 HTTP ${response.status}`);
      return response.json();
    });
  }
  return archiveApiIndexPromise;
}

async function fetchArchiveJson(url) {
  const versionedUrl = withArchiveVersion(url);
  if (!archiveApiCache.has(versionedUrl)) {
    archiveApiCache.set(
      versionedUrl,
      fetch(versionedUrl, { cache: "no-cache" }).then((response) => {
        if (!response.ok) throw new Error(`归档快照不可用 HTTP ${response.status}`);
        return response.json();
      })
    );
  }
  return archiveApiCache.get(versionedUrl);
}

async function archiveResource(index, key) {
  const url = index.resources?.[key];
  if (!url) throw new Error(`归档资源缺失：${key}`);
  return fetchArchiveJson(url);
}

function archiveDetailUrl(index, group, id) {
  const detailGroup = index.details?.[group] || {};
  return detailGroup[id] || detailGroup[decodeURIComponent(id)] || "";
}

function archiveText(row) {
  return Object.values(row || {})
    .flatMap((value) => {
      if (value && typeof value === "object") return Object.values(value);
      return [value];
    })
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
}

function archiveMatchMatches(match, params) {
  const competition = params.get("competition");
  if (competition) {
    const comp = match.competition || {};
    if (![comp.id, comp.slug, comp.name].includes(competition)) return false;
  }
  const season = params.get("season");
  if (season) {
    const item = match.season || {};
    if (![item.id, item.year].includes(season)) return false;
  }
  const stage = params.get("stage");
  if (stage) {
    const item = match.stage || {};
    if (![item.id, item.type, item.name].includes(stage)) return false;
  }
  const group = params.get("group");
  if (group) {
    const item = match.group || {};
    if (![item.id, item.name].includes(group)) return false;
  }
  const status = params.get("status");
  if (status && match.status !== status) return false;
  const team = params.get("team");
  if (team) {
    const teams = [match.homeTeam, match.awayTeam].filter(Boolean);
    if (!teams.some((item) => [item.id, item.slug, item.code].includes(team) || item.code === team.toUpperCase())) return false;
  }
  const dateFrom = params.get("dateFrom");
  if (dateFrom && String(match.kickoffAt || "") < dateFrom) return false;
  const dateTo = params.get("dateTo");
  if (dateTo && String(match.kickoffAt || "") > dateTo) return false;
  const q = (params.get("q") || "").trim().toLowerCase();
  return !q || archiveText(match).includes(q);
}

function archiveMatchSortValue(status) {
  if (status === "live") return 0;
  if (status === "scheduled") return 1;
  return 2;
}

async function archiveMatchesApi(index, canonicalPath) {
  const params = archivePathParams(canonicalPath);
  const base = await archiveResource(index, "matches");
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize") || 20)));
  const filtered = (base.items || [])
    .filter((match) => archiveMatchMatches(match, params))
    .sort((a, b) => {
      const statusDiff = archiveMatchSortValue(a.status) - archiveMatchSortValue(b.status);
      if (statusDiff) return statusDiff;
      const aTime = String(a.kickoffAt || "");
      const bTime = String(b.kickoffAt || "");
      return a.status === "scheduled" ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime);
    });
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  return {
    ...base,
    page,
    pageSize,
    total: filtered.length,
    items,
    filters: Object.fromEntries([...params.entries()].filter(([key, value]) => value && !key.startsWith("_"))),
    freshness: { generatedAt: index.generatedAt || ARCHIVE_CONFIG.generatedAt || "", cache: "static-archive" },
  };
}

async function archiveLeaderboardApi(index, canonicalPath) {
  const path = canonicalPath.split("?")[0];
  const metric = path.split("/").pop();
  const params = archivePathParams(canonicalPath);
  const stat = params.get("stat") || "goals";
  const url = metric === "players"
    ? index.resources?.playerLeaderboardStats?.[stat] || index.resources?.leaderboards?.players
    : index.resources?.leaderboards?.[metric];
  if (!url) throw new Error(`归档榜单缺失：${metric}`);
  const base = await fetchArchiveJson(url);
  const q = (params.get("q") || "").trim().toLowerCase();
  const team = params.get("team");
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") || 20)));
  const items = (base.items || [])
    .filter((row) => {
      if (team) {
        const rowTeam = row.team || {};
        if (![rowTeam.id, rowTeam.slug, rowTeam.code].includes(team) && rowTeam.code !== team.toUpperCase()) return false;
      }
      return !q || archiveText(row).includes(q);
    })
    .slice(0, limit);
  return {
    ...base,
    items,
    filters: Object.fromEntries([...params.entries()].filter(([, value]) => value)),
    realtime: { ...(base.realtime || {}), active: false, locked: true, mode: "static-archive" },
    freshness: { generatedAt: index.generatedAt || ARCHIVE_CONFIG.generatedAt || "", cache: "static-archive" },
  };
}

async function archiveListApi(index, resourceKey, params, matcher) {
  const base = await archiveResource(index, resourceKey);
  const q = (params.get("q") || "").trim().toLowerCase();
  const items = (base.items || []).filter((item) => (!q || archiveText(item).includes(q)) && (!matcher || matcher(item, params)));
  return { ...base, items };
}

async function archiveSearchApi(index, canonicalPath) {
  const params = archivePathParams(canonicalPath);
  const q = (params.get("q") || "").trim().toLowerCase();
  if (!q) return { q, items: [] };
  const [competitions, teams, players] = await Promise.all([
    archiveResource(index, "competitions"),
    archiveResource(index, "teams"),
    archiveResource(index, "players"),
  ]);
  const items = [];
  (competitions.items || []).forEach((row) => {
    if (archiveText(row).includes(q)) items.push({ type: "competition", id: row.id, label: row.name, subLabel: row.nameEn, href: `/competitions/${row.slug}` });
  });
  (teams.items || []).forEach((row) => {
    if (archiveText(row).includes(q)) items.push({ type: "team", id: row.id, label: row.name, subLabel: row.code, href: `/teams/${row.id}` });
  });
  (players.items || []).forEach((row) => {
    if (archiveText(row).includes(q)) items.push({ type: "player", id: row.id, label: row.name, subLabel: row.position, href: `/players/${row.id}` });
  });
  return { q, items: items.slice(0, 20) };
}

async function archiveApi(path) {
  const index = await loadArchiveApiIndex();
  const canonicalPath = canonicalApiPath(path);
  const exactUrl = index.paths?.[canonicalPath];
  if (exactUrl) return fetchArchiveJson(exactUrl);

  const plainPath = canonicalPath.split("?")[0];
  if (plainPath === "/matches") return archiveMatchesApi(index, canonicalPath);
  if (plainPath === "/teams") return archiveListApi(index, "teams", archivePathParams(canonicalPath));
  if (plainPath === "/players") {
    return archiveListApi(index, "players", archivePathParams(canonicalPath), (item, params) => {
      const team = params.get("team");
      return !team || item.teamId === team || item.team?.id === team || item.team?.code === team.toUpperCase();
    });
  }
  if (plainPath === "/search") return archiveSearchApi(index, canonicalPath);
  if (plainPath.startsWith("/leaderboards/")) return archiveLeaderboardApi(index, canonicalPath);
  if (plainPath.startsWith("/matches/")) {
    const id = decodeURIComponent(plainPath.split("/").pop());
    const url = archiveDetailUrl(index, "matches", id);
    if (url) return fetchArchiveJson(url);
  }
  if (plainPath.startsWith("/teams/")) {
    const id = decodeURIComponent(plainPath.split("/").pop());
    const url = archiveDetailUrl(index, "teams", id);
    if (url) return fetchArchiveJson(url);
  }
  if (plainPath.startsWith("/players/")) {
    const id = decodeURIComponent(plainPath.split("/").pop());
    const url = archiveDetailUrl(index, "players", id);
    if (url) return fetchArchiveJson(url);
  }
  if (plainPath.startsWith("/competitions/")) {
    const slug = decodeURIComponent(plainPath.split("/").pop());
    const url = archiveDetailUrl(index, "competitions", slug);
    if (url) return fetchArchiveJson(url);
  }
  if (plainPath === "/predictions/knockout") return archiveResource(index, "knockoutPredictions");
  if (plainPath === "/formation-specs") return archiveResource(index, "formationSpecs");
  if (plainPath === "/admin/providers/health") return archiveResource(index, "providerHealth");
  throw new Error(`归档快照未覆盖：${canonicalPath}`);
}

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (ARCHIVE_MODE) {
    if (method === "GET") return archiveApi(path);
    throw new Error("归档模式已停止后台写入");
  }
  if (method === "GET" && bootApiPromises.has(path)) {
    const prefetched = await bootApiPromises.get(path);
    bootApiPromises.delete(path);
    if (prefetched?.ok) return prefetched.data;
  }
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function loadLookup(key, path) {
  if (lookups[key]?.length) return;
  if (!lookupPromises[key]) {
    lookupPromises[key] = api(path)
      .then((payload) => {
        lookups[key] = payload.items || [];
      })
      .catch((error) => {
        lookupPromises[key] = null;
        throw error;
      });
  }
  await lookupPromises[key];
}

async function loadLookups({ competitions = false, teams = false, players = false, formation = false } = {}) {
  const tasks = [];
  if (competitions) tasks.push(loadLookup("competitions", "/competitions"));
  if (teams) tasks.push(loadLookup("teams", "/teams"));
  if (players) tasks.push(loadLookup("players", "/players"));
  if (formation) tasks.push(loadFormationConfig());
  await Promise.all(tasks);
}

async function loadFormationConfig() {
  if (formationConfigLoaded) return;
  if (!formationConfigPromise) {
    formationConfigPromise = api("/formation-specs")
      .then((formationConfig) => {
        if (formationConfig) applyFormationConfig(formationConfig);
        lookups.formationConfig = formationConfig || null;
      })
      .catch(() => {
        lookups.formationConfig = null;
      })
      .finally(() => {
        formationConfigLoaded = true;
      });
  }
  await formationConfigPromise;
}

async function loadRouteLookups(path) {
  if (path.startsWith("/matches/")) {
    return;
  }
  if (path === "/matches") {
    await loadLookups({ competitions: true, teams: true });
    return;
  }
  if (path.startsWith("/competitions/")) {
    await loadLookups({ teams: true });
    return;
  }
  if (path.startsWith("/leaderboards/")) return;
}

function setActiveNav(path) {
  document.querySelectorAll(".main-nav a").forEach((link) => {
    const root = link.dataset.navRoot;
    link.classList.toggle("active", root === "/" ? path === "/" : path.startsWith(root));
  });
}

function initMainNav3d() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".main-nav a").forEach((link) => {
    if (reducedMotion) return;
    link.addEventListener("pointermove", (event) => {
      const rect = link.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      link.style.setProperty("--mx", `${Math.round(x * 100)}%`);
      link.style.setProperty("--my", `${Math.round(y * 100)}%`);
      link.style.setProperty("--rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
      link.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
    });
    link.addEventListener("pointerleave", () => {
      link.style.setProperty("--mx", "50%");
      link.style.setProperty("--my", "50%");
      link.style.setProperty("--rx", "0deg");
      link.style.setProperty("--ry", "0deg");
    });
  });
}

function stopStream() {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
  stopMatchPolling();
  stopKnockoutRefresh();
  stopLeaderboardRefresh();
}

function stopMatchPolling() {
  if (activeMatchPollTimer) {
    clearTimeout(activeMatchPollTimer);
    activeMatchPollTimer = null;
  }
}

function stopKnockoutRefresh() {
  if (knockoutRefreshTimer) {
    clearTimeout(knockoutRefreshTimer);
    knockoutRefreshTimer = null;
  }
}

function scheduleKnockoutRefresh(payload) {
  stopKnockoutRefresh();
  if (ARCHIVE_MODE) return;
  const realtime = payload?.summary?.realtime || {};
  const seconds = Number(realtime.nextRefreshInSeconds ?? realtime.refreshEverySeconds);
  if (realtime.locked || !realtime.active || !Number.isFinite(seconds) || seconds <= 0) return;

  knockoutRefreshTimer = setTimeout(async () => {
    knockoutRefreshTimer = null;
    const { path } = routeInfo();
    if (path !== "/knockout") return;
    const scrollY = window.scrollY;
    try {
      await renderKnockoutPage();
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }));
    } catch (error) {
      console.warn("Knockout auto refresh failed", error);
      scheduleKnockoutRefresh({ summary: { realtime: { active: true, nextRefreshInSeconds: 60 } } });
    }
  }, Math.max(5, seconds) * 1000);
}

function stopLeaderboardRefresh() {
  if (leaderboardRefreshTimer) {
    clearTimeout(leaderboardRefreshTimer);
    leaderboardRefreshTimer = null;
  }
}

function scheduleLeaderboardRefresh(payload, metric, filters = {}) {
  stopLeaderboardRefresh();
  if (ARCHIVE_MODE) return;
  const realtime = payload?.realtime || {};
  const seconds = Number(realtime.nextRefreshInSeconds ?? realtime.refreshEverySeconds);
  if (realtime.locked || !realtime.active || !Number.isFinite(seconds) || seconds <= 0) return;

  leaderboardRefreshTimer = setTimeout(async () => {
    leaderboardRefreshTimer = null;
    const { path } = routeInfo();
    if (!path.startsWith("/leaderboards/")) return;
    const scrollY = window.scrollY;
    try {
      await renderLeaderboard(metric, new URLSearchParams(filters));
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }));
    } catch (error) {
      console.warn("Leaderboard auto refresh failed", error);
      scheduleLeaderboardRefresh({ realtime: { active: true, nextRefreshInSeconds: 60 } }, metric, filters);
    }
  }, Math.max(5, seconds) * 1000);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function formatDate(iso, mode = "datetime") {
  if (!iso) return "待定";
  const date = new Date(iso);
  const options =
    mode === "date"
      ? { month: "2-digit", day: "2-digit" }
      : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formatFullDate(iso) {
  if (!iso) return "待定";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function positionLabel(code) {
  return positionLabels[code] || code || "未公布";
}

function statusBadge(match) {
  const status = match.status || "scheduled";
  const baseLabel = statusLabels[status] || match.statusDetail || status;
  const detail =
    status === "live"
      ? match.currentMinute
        ? `${match.currentMinute}' ${match.statusDetail || baseLabel}`
        : match.statusDetail || baseLabel
      : match.statusDetail && match.statusDetail !== baseLabel
        ? match.statusDetail
        : baseLabel;
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(detail)}</span>`;
}

function sourceBadge(provider) {
  const label = provider?.name || provider?.code || "Source";
  return `<span class="source-badge">${escapeHtml(label)}</span>`;
}

function scoreText(match) {
  const home = match.score?.home;
  const away = match.score?.away;
  if (home === null || home === undefined || away === null || away === undefined) return "-";
  return `${home} - ${away}`;
}

function teamDisplayName(team, fallback = "待定") {
  return team?.name || team?.nameEn || team?.code || fallback;
}

const compactTeamNamesByCode = {
  BIH: "波黑",
  CAF: "中非",
  COD: "刚果",
  COG: "刚果",
  CZE: "捷克",
  DOM: "多米尼加",
  EQG: "赤几",
  PNG: "巴新",
  TTO: "特多",
  UAE: "阿联酋",
};

const compactTeamNamesByName = {
  "阿拉伯联合酋长国": "阿联酋",
  "巴布亚新几内亚": "巴新",
  "波斯尼亚和黑塞哥维那": "波黑",
  "赤道几内亚": "赤几",
  "多米尼加共和国": "多米尼加",
  "刚果共和国": "刚果",
  "刚果民主共和国": "刚果",
  "捷克共和国": "捷克",
  "特立尼达和多巴哥": "特多",
  "中非共和国": "中非",
};

function teamCompactName(team, fallback = "待定") {
  const fullName = teamDisplayName(team, fallback);
  const code = String(team?.code || "").toUpperCase();
  if (compactTeamNamesByCode[code]) return compactTeamNamesByCode[code];
  if (compactTeamNamesByName[fullName]) return compactTeamNamesByName[fullName];
  return fullName;
}

function teamDisplayCode(team, fallback = "-") {
  return team?.code || team?.nameEn || team?.name || fallback;
}

function venueDisplay(venue, fallback = "场地未公布") {
  return [venue?.name, venue?.city].filter(Boolean).join(" · ") || fallback;
}

function venueCityStadiumDisplay(venue, fallback = "城市与球场待定") {
  return [venue?.city, venue?.name].filter(Boolean).join(" · ") || fallback;
}

function teamLogo(team, className = "team-logo") {
  const src = team?.flagUrl || team?.logoUrl;
  if (src) {
    return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(team.name || team.code || "flag")}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className: this.className + ' flag-logo', textContent: '${escapeHtml(team?.flagEmoji || "🏳️")}', role: 'img'}))" />`;
  }
  if (team?.flagEmoji) {
    return `<span class="${className} flag-logo" role="img" aria-label="${escapeHtml(team.name || team.code || "flag")}">${escapeHtml(team.flagEmoji)}</span>`;
  }
  return `<img class="${className}" src="${escapeHtml(team?.logoUrl || "/static/assets/team-placeholder.png")}" alt="${escapeHtml(teamDisplayName(team, "team"))}" loading="lazy" />`;
}

function playerAvatar(player) {
  const sourceClass = photoSourceClass(player);
  return `<span class="avatar player-headshot"><img class="${escapeHtml(sourceClass)}" src="${escapeHtml(player.photoUrl || "/static/assets/player-placeholder.png")}" alt="${escapeHtml(player.name || player.fullName)}" loading="lazy" onerror="this.src='/static/assets/player-placeholder.png'" /></span>`;
}

function playerMeta(player) {
  return [positionLabel(player.standardPosition || player.position), player.nationalityCode].filter(Boolean).join(" · ");
}

function shortPlayerName(player) {
  const shortName = String(player?.shortName || "").trim();
  if (shortName) return shortName;
  const name = String(player?.name || player?.fullName || "").trim();
  if (!name.includes("·")) return name;
  const parts = name.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return name;
  return parts[parts.length - 1];
}

function pitchNameVisualWidth(name) {
  return Array.from(String(name || "").trim()).reduce((total, char) => {
    if (/\s/.test(char)) return total + 0.32;
    if (/[\u2e80-\u9fff\uf900-\ufaff]/.test(char)) return total + 1;
    if (/[A-Z0-9]/.test(char)) return total + 0.68;
    if (/[a-z]/.test(char)) return total + 0.56;
    return total + 0.48;
  }, 0);
}

function pitchNameMobileFontSize(name) {
  const visualWidth = Math.max(1, pitchNameVisualWidth(name));
  return Math.max(6, Math.min(8.5, 42 / visualWidth));
}

function captainBadge(row) {
  return row?.isCaptain ? `<span class="captain-badge" title="队长" aria-label="队长">C</span>` : "";
}

function marketValueLabel(player) {
  const label = player?.marketValueLabelZh || player?.marketValueLabel || "";
  return label && label !== "\u5f85\u6821\u9a8c" ? label : "暂无身价";
}

function playerClubLabel(player) {
  const club = player?.club || {};
  return club.label || club.name || "俱乐部暂缺";
}

function playerClubTitle(player) {
  const club = player?.club || {};
  const parts = [club.label || club.name, club.nameOriginal && club.nameOriginal !== club.name ? club.nameOriginal : "", club.source ? `来源：${club.source}` : ""].filter(Boolean);
  return parts.join(" · ") || "俱乐部暂缺";
}

function compactLogoText(value, fallback = "俱乐部") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (/[\u4e00-\u9fff]/.test(text)) {
    const compact = Array.from(text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "")).slice(0, 2).join("");
    return compact || fallback;
  }
  const tokens = text
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return text.slice(0, 2).toUpperCase() || fallback;
  const initials = tokens.slice(0, 2).map((token) => token[0]).join("");
  return (initials || tokens[0].slice(0, 2)).slice(0, 3).toUpperCase();
}

function leagueLogoText(league) {
  const normalized = String(league || "").trim().replace(/\s+/g, "");
  const labels = {
    英超: "PL",
    西甲: "LL",
    德甲: "BL",
    意甲: "SA",
    法甲: "L1",
    葡超: "LP",
    荷甲: "ED",
    美职联: "MLS",
    美国职业大联盟: "MLS",
    沙特联: "SPL",
    土超: "TS",
    K联赛: "K1",
    J联赛: "J1",
    巴甲: "BR",
    阿甲: "AR",
  };
  return labels[normalized] || compactLogoText(normalized, "联");
}

function clubLogoText(clubName) {
  return compactLogoText(clubName, "队");
}

function lineupLogoMarkup(src, className, fallbackText, altText) {
  const source = String(src || "").trim();
  return `
    <span class="${className} ${source ? "has-image" : "fallback-only"}">
      ${source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(altText)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('fallback-only')" />` : ""}
      <span class="lineup-logo-fallback">${escapeHtml(fallbackText)}</span>
    </span>
  `;
}

function renderPlayerClubBadge(player) {
  const club = player?.club || {};
  const status = club.status === "verified" ? "verified" : "missing";
  const league = String(club.league || "").trim() || "未知联赛";
  const clubName = String(club.name || playerClubLabel(player) || "").trim() || "俱乐部暂缺";
  return `
    <span class="lineup-club-badge ${status}" title="${escapeHtml(playerClubTitle(player))}">
      ${lineupLogoMarkup(club.leagueLogoUrl, "lineup-league-logo", leagueLogoText(league), `${league} logo`)}
      <span class="lineup-league-name">${escapeHtml(league)}</span>
      ${lineupLogoMarkup(club.logoUrl, "lineup-club-logo", clubLogoText(clubName), `${clubName} logo`)}
      <span class="lineup-club-name">${escapeHtml(clubName)}</span>
    </span>
  `;
}

function formatMarketValueYiEuro(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "";
  const yiEuro = value / 100_000_000;
  const digits = yiEuro >= 10 ? 1 : yiEuro >= 1 ? 2 : 3;
  return `${yiEuro.toFixed(digits).replace(/\.?0+$/, "")}亿欧`;
}

function starterMarketValueLabel(rows) {
  const total = (rows || [])
    .filter((row) => row.started)
    .reduce((sum, row) => {
      const value = Number(row.player?.marketValue);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
  return formatMarketValueYiEuro(total);
}

function photoSourceClass(player) {
  const url = player?.photoUrl || "";
  if (url.includes("espncdn.com")) return "espn-headshot";
  if (url.includes("digitalhub.fifa.com")) return "fifa-headshot";
  return "generic-headshot";
}

function marketValueNote(player) {
  const value = Number(player?.marketValue);
  if (!Number.isFinite(value) || value <= 0) return "身价暂未匹配";
  const source = player?.marketValueSource || "身价来源";
  const checked = player?.marketValueCheckedAt ? formatDate(player.marketValueCheckedAt, "date") : "";
  return checked ? `${source} · ${checked}` : source;
}

function selected(value, current) {
  return String(value ?? "") === String(current ?? "") ? "selected" : "";
}

function renderOptions(items, current, label = "全部") {
  return [`<option value="">${label}</option>`]
    .concat(items.map((item) => `<option value="${escapeHtml(item.id || item.slug)}" ${selected(item.id || item.slug, current)}>${escapeHtml(item.name)}${item.code ? ` · ${escapeHtml(item.code)}` : ""}</option>`))
    .join("");
}

function statTiles(items, className = "") {
  return `<section class="stat-row${className ? ` ${escapeHtml(className)}` : ""}">${items
    .map(
      (item) => `
        <div class="stat-tile">
          <small>${escapeHtml(item.label)}</small>
          <strong>${escapeHtml(item.value)}</strong>
          <span class="muted mini">${escapeHtml(item.note || "")}</span>
        </div>
      `
    )
    .join("")}</section>`;
}

function renderMatchCards(matches, emptyText = "暂无比赛") {
  if (!matches.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="match-list">${matches.map(renderMatchCard).join("")}</div>`;
}

function renderMatchCard(match) {
  return `
    <a class="match-card" href="${matchDetailHref(match.id)}">
      <div class="match-team">
        ${teamLogo(match.homeTeam)}
        <div>
          <strong>${escapeHtml(match.homeTeam.name)}</strong>
          <div class="muted mini">${escapeHtml(match.homeTeam.code)}</div>
        </div>
      </div>
      <div class="match-score">${escapeHtml(scoreText(match))}</div>
      <div class="match-team">
        ${teamLogo(match.awayTeam)}
        <div>
          <strong>${escapeHtml(match.awayTeam.name)}</strong>
          <div class="muted mini">${escapeHtml(match.awayTeam.code)}</div>
        </div>
      </div>
      <div class="match-meta">
        <span>${statusBadge(match)} ${match.needsReview ? '<span class="badge review">待复核</span>' : ""}</span>
        <span>${escapeHtml(formatDate(match.kickoffAt))} · ${escapeHtml(match.venue?.city || "")}</span>
        <span>${escapeHtml(match.competition.name)} · ${escapeHtml(match.stage.name)}</span>
      </div>
    </a>
  `;
}

function renderLeaderboardTable(items, metric) {
  if (!items.length) return `<div class="empty">暂无${escapeHtml(metricLabels[metric] || "榜单")}数据</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>球员</th>
            <th>球队</th>
            <th>${escapeHtml(metricLabels[metric] || metric)}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (row) => `
                <tr class="clickable" data-href="${hashHref(`/players/${row.player.id}`)}">
                  <td class="nowrap">${row.rank}</td>
                  <td>
                    <span class="leader-player">
                      ${playerAvatar(row.player)}
                      <span>
                        <strong title="${escapeHtml(row.player.name || row.player.fullName || "")}">${escapeHtml(shortPlayerName(row.player))}</strong>
                        <span class="muted mini">${escapeHtml(positionLabel(row.player.position))} · 身价 ${escapeHtml(marketValueLabel(row.player))}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="split">${teamLogo(row.team)} <span>${escapeHtml(row.team.name)}<br><span class="muted mini">${escapeHtml(row.team.code)}</span></span></span></td>
                  <td><strong>${escapeHtml(metric === "market_values" ? row.valueLabel || marketValueLabel(row.player) : row.value)}</strong></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function normalizeLeaderboardMetric(metric) {
  const normalized = leaderboardMetricAliases[metric] || metric || "players";
  return leaderboardCategories.some((category) => category.metric === normalized) ? normalized : "players";
}

function leaderboardCategoryConfig(metric) {
  const normalized = normalizeLeaderboardMetric(metric);
  return leaderboardCategories.find((category) => category.metric === normalized) || leaderboardCategories[0];
}

function leaderboardCategoryParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
  );
}

function renderMetricSwitch(activeMetric, params = {}) {
  const active = normalizeLeaderboardMetric(activeMetric);
  const linkParams = leaderboardCategoryParams(params);
  return `<nav class="leaderboard-category-chips" aria-label="榜单分类">${leaderboardCategories
    .map((category) => {
      const className = category.metric === active ? "active" : "";
      const categoryParams = { ...linkParams };
      if (category.metric !== "players") delete categoryParams.stat;
      return `<a class="${className}" href="${hashHref(`/leaderboards/${category.metric}`, categoryParams)}">${escapeHtml(category.label)}</a>`;
    })
    .join("")}</nav>`;
}

function syncGlobalSearchForRoute(path, params = new URLSearchParams()) {
  const input = document.getElementById("global-search-input");
  if (!input) return;
  if (path.startsWith("/leaderboards/")) {
    input.placeholder = "搜索球员、球队、榜单";
    input.value = params.get("q") || "";
    return;
  }
  input.placeholder = "搜索球队、球员、小组赛";
  if (path !== "/search") input.value = "";
}

function leaderboardFallbackData(metric) {
  const config = leaderboardCategoryConfig(metric);
  const rows = leaderboardFallbackRows[config.metric] || leaderboardFallbackRows.goals;
  return {
    metric: config.metric,
    items: rows.map((row, index) => normalizeLeaderboardRow(row, config, index)),
    generatedAt: new Date().toISOString(),
    sourceNote: "本地 fallback 榜单数据",
    realtime: { active: false, locked: true },
    fallback: true,
  };
}

function leaderboardEmptyData(config, sourceNote = "暂无官方可计算数据") {
  return {
    metric: config.metric,
    items: [],
    generatedAt: new Date().toISOString(),
    sourceNote,
    realtime: { active: false, locked: false },
    fallback: false,
  };
}

function normalizeLeaderboardRow(row, config, index) {
  const subject = config.subject || row.subject || "player";
  const value = row.value ?? row.points ?? 0;
  return {
    ...row,
    subject,
    rank: Number(row.rank || index + 1),
    displayRank: index + 1,
    value,
    trend: row.trend ?? leaderboardTrendForIndex(index),
    player: row.player ? { ...row.player } : null,
    team: row.team ? { ...row.team } : null,
  };
}

function normalizeLeaderboardRows(items, config) {
  return (items || []).map((row, index) => normalizeLeaderboardRow(row, config, index));
}

function leaderboardTrendForIndex(index) {
  const trendPattern = [1, 2, -1, 3, -2, 1, -1, 2];
  return trendPattern[index % trendPattern.length] || 0;
}

function filterLeaderboardRows(rows, query, config) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => leaderboardSearchText(row, config).toLowerCase().includes(term));
}

function leaderboardSearchText(row, config) {
  const identity = leaderboardIdentity(row, config);
  return [
    config.label,
    identity.name,
    identity.fullName,
    identity.teamName,
    identity.teamCode,
    row.player?.position,
    row.detail,
  ]
    .filter(Boolean)
    .join(" ");
}

async function loadLeaderboardData(metric, filters) {
  const config = leaderboardCategoryConfig(metric);
  if (config.metric === "teams") return loadTeamLeaderboardData(filters);
  if (config.fallbackOnly) return leaderboardFallbackData(config.metric);
  try {
    const data = await api(`/leaderboards/${config.sourceMetric}?${toQuery({ limit: config.limit || 8, ...filters })}`);
    const normalized = normalizeLeaderboardRows(data.items, config);
    if (!normalized.length) return config.noFallback ? { ...data, metric: config.metric, items: [], fallback: false } : leaderboardFallbackData(config.metric);
    return { ...data, metric: config.metric, items: normalized, fallback: false };
  } catch (error) {
    console.warn("Leaderboard API fallback", error);
    if (config.noFallback) return leaderboardEmptyData(config, config.emptySourceNote || "官方榜单统计暂时读取失败");
    return leaderboardFallbackData(config.metric);
  }
}

async function loadTeamLeaderboardData(filters) {
  const config = leaderboardCategoryConfig("teams");
  try {
    const data = await api(`/leaderboards/teams?${toQuery({ limit: config.limit || 32, ...filters })}`);
    const normalized = normalizeLeaderboardRows(data.items, config);
    if (!normalized.length) return leaderboardEmptyData(config, data.sourceNote || config.emptySourceNote);
    return { ...data, metric: config.metric, items: normalized, fallback: false };
  } catch (error) {
    console.warn("Team leaderboard empty", error);
    return leaderboardEmptyData(config, config.emptySourceNote);
  }
}

function leaderboardIdentity(row, config) {
  if (row.subject === "team" || config.subject === "team") {
    const team = row.team || {};
    return {
      name: teamCompactName(team, "球队"),
      fullName: teamDisplayName(team, "球队"),
      teamName: row.summary || row.conclusion || (row.rank ? `综合实力第 ${row.rank} 名` : teamDisplayName(team, "球队")),
      teamCode: team.code || "",
      team,
      href: team.id && !team.id.startsWith("fallback") ? hashHref(`/teams/${team.id}`) : "",
    };
  }
  const player = row.player || {};
  const team = row.team || {};
  return {
    name: shortPlayerName(player) || "球员",
    fullName: player.name || player.fullName || shortPlayerName(player) || "球员",
    teamName: teamDisplayName(team, "球队"),
    teamCode: team.code || player.nationalityCode || "",
    team,
    href: player.id && !player.id.startsWith("fallback") ? hashHref(`/players/${player.id}`) : "",
  };
}

function leaderboardAvatarHue(text) {
  let hash = 0;
  Array.from(String(text || "榜单")).forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  });
  return 165 + (hash % 110);
}

function leaderboardInitials(name) {
  const clean = String(name || "榜单").replace(/\s+/g, "");
  const parts = clean.includes("·") ? clean.split("·").filter(Boolean).pop() : clean;
  return Array.from(parts || clean).slice(0, 2).join("");
}

function renderLeaderboardAvatar(row, config, className = "leaderboard-avatar") {
  const identity = leaderboardIdentity(row, config);
  if (row.subject === "team" || config.subject === "team") {
    return `<span class="${className} leaderboard-avatar-team">${teamLogo(identity.team, "leaderboard-avatar-flag")}</span>`;
  }
  const photoUrl = row.player?.photoUrl || "";
  if (photoUrl) {
    const sourceClass = photoSourceClass(row.player);
    return `<span class="${className}"><img class="${escapeHtml(sourceClass)}" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(identity.fullName)}" loading="lazy" referrerpolicy="no-referrer" data-fallback="${escapeHtml(leaderboardInitials(identity.name))}" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'), {textContent: this.dataset.fallback || ''}))" /></span>`;
  }
  const hue = leaderboardAvatarHue(identity.fullName);
  return `<span class="${className}" style="--avatar-hue:${hue}"><span>${escapeHtml(leaderboardInitials(identity.name))}</span></span>`;
}

function leaderboardValueText(row) {
  const value = row.valueLabel || row.value;
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(1);
  return String(value ?? "-");
}

function renderLeaderboardTrend(row) {
  const trend = Number(row.trend || 0);
  if (!trend) return `<span class="leaderboard-trend neutral">-</span>`;
  const direction = trend > 0 ? "up" : "down";
  const icon = trend > 0 ? "▲" : "▼";
  return `<span class="leaderboard-trend ${direction}">${icon} ${Math.abs(trend)}</span>`;
}

function renderLeaderboardHero(config, data) {
  if (config.metric === "players") return renderPlayerStatHero(data);
  const badges = config.metric === "teams" ? [] : ["实时更新", "官方数据", "全赛事统计"];
  const title = config.metric === "teams" ? "球队综合实力榜" : "榜单中心";
  return `
    <section class="leaderboard-hero" aria-label="榜单中心">
      <span class="leaderboard-hero-light light-left" aria-hidden="true"></span>
      <span class="leaderboard-hero-light light-right" aria-hidden="true"></span>
      <span class="leaderboard-trophy-glow" aria-hidden="true"></span>
      <span class="leaderboard-particles" aria-hidden="true"></span>
      <p class="leaderboard-kicker">2026 World Cup Data Hall</p>
      <h1>${escapeHtml(title)}</h1>
      ${badges.length ? `<div class="leaderboard-hero-badges" aria-label="榜单说明">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

function playerStatCategoryHref(category, filters = {}) {
  const params = { ...filters, stat: category.key };
  delete params.position;
  return hashHref("/leaderboards/players", leaderboardCategoryParams(params));
}

function renderPlayerStatHero() {
  return `
    <header class="player-stat-hero" aria-labelledby="player-stat-title">
      <span class="player-stat-hero-grid" aria-hidden="true"></span>
      <div class="player-stat-hero-copy">
        <p class="player-stat-kicker"><span></span> DONGQIUDI APP PUBLIC DATA</p>
        <div class="player-stat-title-row">
          <h1 id="player-stat-title">球员数据榜</h1>
          <span class="player-stat-raw-badge">原始统计</span>
        </div>
        <p>汇集黄牌、红牌、点球、射门等世界杯公开累计统计，选择指标即可查看对应球员排名。</p>
        <div class="player-stat-hero-tags" aria-label="球员数据榜指标分组">
          <span><i aria-hidden="true"></i>纪律</span>
          <span><i aria-hidden="true"></i>进攻</span>
          <span><i aria-hidden="true"></i>创造</span>
        </div>
      </div>
      <div class="player-stat-hero-signal" aria-hidden="true">
        <span class="player-stat-signal-orbit orbit-one"></span>
        <span class="player-stat-signal-orbit orbit-two"></span>
        <span class="player-stat-signal-node node-one"></span>
        <span class="player-stat-signal-node node-two"></span>
        <span class="player-stat-signal-core"><strong>RAW</strong><small>PLAYER STATS</small></span>
      </div>
    </header>
  `;
}

function renderPlayerStatMenu(data = {}, filters = {}) {
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const activeKey = data.activeStat?.key || filters.stat || categories[0]?.key || "yellowCards";
  return `
    <aside class="player-stat-menu" aria-label="球员统计指标">
      <header><span>排行项目</span><small>${categories.length} 项</small></header>
      <nav>
        ${categories
          .map((category, index) => `
            <a class="${category.key === activeKey ? "active" : ""}" href="${playerStatCategoryHref(category, filters)}" data-stat-key="${escapeHtml(category.key)}" style="--stat-index:${index}">
              <span class="player-stat-menu-dot" aria-hidden="true"></span>
              <strong>${escapeHtml(category.label)}</strong>
              <small>${Number(category.playerCount || 0)}</small>
            </a>
          `)
          .join("")}
      </nav>
    </aside>
  `;
}

function renderPlayerStatRow(row, config, activeStat, index, staggerIndex = index) {
  const identity = leaderboardIdentity(row, config);
  const hrefAttr = identity.href ? ` data-href="${identity.href}" role="row link" tabindex="0"` : ' role="row"';
  const place = index < 3 ? ` player-stat-row-top player-stat-row-${index + 1}` : "";
  const rankLabel = Number(row.rank || index + 1);
  return `
    <article class="player-stat-row${place}"${hrefAttr} style="--stagger:${staggerIndex}">
      <span class="player-stat-rank" role="cell"><b>${rankLabel}</b></span>
      <span class="player-stat-identity" role="cell">
        ${renderLeaderboardAvatar(row, config, "player-stat-avatar")}
        <span>
          <strong title="${escapeHtml(identity.fullName)}">${escapeHtml(identity.name)}</strong>
          <small>${escapeHtml(row.positionLabel || positionLabel(row.player?.position))} · ${escapeHtml(row.appearances || 0)} 场 · ${escapeHtml(row.minutesPlayed || 0)}′</small>
        </span>
      </span>
      <span class="player-stat-team" role="cell">${teamLogo(identity.team, "leaderboard-flag")}<span><strong>${escapeHtml(identity.teamName)}</strong><small>${escapeHtml(identity.teamCode)}</small></span></span>
      <span class="player-stat-value" role="cell"><strong>${escapeHtml(leaderboardValueText(row))}</strong><small>${escapeHtml(row.unit || activeStat.unit || "")}</small></span>
    </article>
  `;
}

function playerStatWindowSize(items = []) {
  return Math.max(1, Math.min(items.length, PLAYER_STAT_WINDOW_SIZE));
}

function updatePlayerStatSlider(offsetValue) {
  const panel = document.querySelector("[data-player-stat-slider]");
  if (!panel || !playerStatSliderState) return;
  const { items, config, activeStat } = playerStatSliderState;
  if (!items.length) return;
  const windowSize = playerStatWindowSize(items);
  const maxOffset = Math.max(0, items.length - windowSize);
  const offset = Math.max(0, Math.min(maxOffset, Math.round(Number(offsetValue || 0))));
  const visibleItems = items.slice(offset, offset + windowSize);
  const firstPosition = offset + 1;
  const lastPosition = offset + visibleItems.length;
  const track = panel.querySelector("[data-player-stat-slider-track]");
  const range = panel.querySelector("[data-player-stat-slider-range]");
  const start = panel.querySelector("[data-player-stat-slider-start]");
  const end = panel.querySelector("[data-player-stat-slider-end]");
  if (track) {
    track.innerHTML = visibleItems
      .map((row, index) => renderPlayerStatRow(row, config, activeStat, offset + index, index))
      .join("");
  }
  if (range) {
    range.max = String(maxOffset);
    range.value = String(offset);
    range.style.setProperty("--player-stat-progress", `${maxOffset ? (offset / maxOffset) * 100 : 0}%`);
  }
  if (start) start.textContent = String(firstPosition);
  if (end) end.textContent = String(lastPosition);
  panel.dataset.offset = String(offset);
  panel.setAttribute("aria-label", `${activeStat.label}第 ${firstPosition} 至 ${lastPosition} 位球员`);
  panel.querySelectorAll("[data-player-stat-slider-step]").forEach((button) => {
    const step = Number(button.dataset.playerStatSliderStep || 0);
    button.disabled = (step < 0 && offset <= 0) || (step > 0 && offset >= maxOffset);
  });
}

function initPlayerStatSlider(items, config, data = {}) {
  const activeStat = data.activeStat || { key: "yellowCards", label: "黄牌", unit: "张" };
  playerStatSliderState = { items: items || [], config, activeStat };
  updatePlayerStatSlider(0);
}

function renderPlayerStatTable(items, config, data = {}) {
  const activeStat = data.activeStat || { key: "yellowCards", label: "黄牌", unit: "张", description: "世界杯累计黄牌" };
  const activeCategory = (data.categories || []).find((category) => category.key === activeStat.key);
  const totalPlayers = Number(activeCategory?.playerCount || items.length);
  const countLabel = totalPlayers > items.length
    ? `<b>前 ${items.length}</b> / 共 ${totalPlayers} 名`
    : `<b>${totalPlayers}</b> 名球员上榜`;
  if (!items.length) {
    return `<div class="player-stat-empty"><strong>暂无${escapeHtml(activeStat.label)}数据</strong><span>懂球帝公开层当前没有大于 0 的记录</span></div>`;
  }
  const windowSize = playerStatWindowSize(items);
  const visibleItems = items.slice(0, windowSize);
  const maxOffset = Math.max(0, items.length - windowSize);
  return `
    <section class="player-stat-board" data-player-stat-slider data-window-size="${windowSize}" data-max-offset="${maxOffset}" data-offset="0" aria-labelledby="player-stat-board-title" aria-label="${escapeHtml(activeStat.label)}第 1 至 ${visibleItems.length} 位球员">
      <header class="player-stat-board-head">
        <div class="player-stat-board-summary">
          <div class="player-stat-board-title">
            <p>${escapeHtml(activeStat.group || "球员数据")}</p>
            <h2 id="player-stat-board-title">${escapeHtml(activeStat.label)}</h2>
            <span>${escapeHtml(activeStat.description || "懂球帝公开统计累计值")}</span>
          </div>
          <span class="player-stat-board-badge">${countLabel}</span>
        </div>
        <div class="player-stat-window" aria-label="球员排名滑动窗口">
          <div class="player-stat-window-copy">
            <span>排名浏览</span>
            <small>拖动浏览全部排名</small>
            <strong><span>第</span><b data-player-stat-slider-start>1</b><i aria-hidden="true">—</i><b data-player-stat-slider-end>${visibleItems.length}</b><em>位</em></strong>
          </div>
          <div class="player-stat-window-controls" aria-label="切换球员排名窗口">
            <button type="button" data-player-stat-slider-step="-1" aria-label="上一组球员" disabled>‹</button>
            <button type="button" data-player-stat-slider-step="1" aria-label="下一组球员"${maxOffset ? "" : " disabled"}>›</button>
          </div>
          <div class="player-stat-window-range">
            <span>1</span>
            <input type="range" min="0" max="${maxOffset}" value="0" step="1" data-player-stat-slider-range aria-label="选择${escapeHtml(activeStat.label)}排名窗口" style="--player-stat-progress:0%" />
            <span>${items.length}</span>
          </div>
        </div>
      </header>
      <div class="player-stat-table" role="table" aria-label="${escapeHtml(activeStat.label)}">
        <div class="player-stat-table-head" role="row">
          <span role="columnheader">排名</span>
          <span role="columnheader">球员</span>
          <span role="columnheader">球队</span>
          <span role="columnheader">总计</span>
        </div>
        <div class="player-stat-table-body" role="rowgroup">
          <div data-player-stat-slider-track>
            ${visibleItems.map((row, index) => renderPlayerStatRow(row, config, activeStat, index)).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderPlayerStatHub(data, filters, config, items) {
  return `
    ${renderPlayerStatHero(data)}
    <div class="player-stat-layout">
      ${renderPlayerStatMenu(data, filters)}
      ${renderPlayerStatTable(items, config, data)}
    </div>
  `;
}

function rankingNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function normalizeScorer(row, index = 0, metricType = "goals") {
  const player = row?.player || {};
  const team = row?.team || {};
  const rankNumber = Number(row?.rank);
  const hasOfficialRank = Number.isFinite(rankNumber) && rankNumber > 0;
  const goals = rankingNumber(row?.goals, metricType === "goals" ? row?.value : undefined, player.goals);
  const assists = rankingNumber(row?.assists, metricType === "assists" ? row?.value : undefined, player.assists);
  return {
    row,
    sourceIndex: index,
    id: player.id || player.slug || `scorer-${index}`,
    rank: hasOfficialRank ? rankNumber : null,
    hasOfficialRank,
    playerName: shortPlayerName(player) || player.name || player.fullName || "球员",
    fullName: player.name || player.fullName || shortPlayerName(player) || "球员",
    teamName: teamDisplayName(team, "球队"),
    countryCode: team.code || player.nationalityCode || "",
    flag: team.flagUrl || team.logoUrl || "",
    goals,
    assists,
    minutes: rankingNumber(row?.minutes, player.minutes, 999999),
    poster: row?.poster || player.poster || player.posterUrl || "",
    avatar: player.photoUrl || "",
  };
}

function sortScorers(scorers, metricType = "goals") {
  return [...(scorers || [])].sort((a, b) => {
    if (a.hasOfficialRank || b.hasOfficialRank) {
      const rankDelta = Number(a.rank || 9999) - Number(b.rank || 9999);
      if (rankDelta) return rankDelta;
    }
    const primaryKey = metricType === "assists" ? "assists" : "goals";
    const secondaryKey = metricType === "assists" ? "goals" : "assists";
    const primaryDelta = Number(b[primaryKey] || 0) - Number(a[primaryKey] || 0);
    if (primaryDelta) return primaryDelta;
    const secondaryDelta = Number(b[secondaryKey] || 0) - Number(a[secondaryKey] || 0);
    if (secondaryDelta) return secondaryDelta;
    const minutesDelta = Number(a.minutes || 999999) - Number(b.minutes || 999999);
    if (minutesDelta) return minutesDelta;
    const sourceDelta = a.sourceIndex - b.sourceIndex;
    if (sourceDelta) return sourceDelta;
    return String(a.playerName || "").localeCompare(String(b.playerName || ""), "zh-Hans");
  });
}

function getSortedScorers(rows, metricType = "goals") {
  return sortScorers((rows || []).map((row, index) => normalizeScorer(row, index, metricType)), metricType);
}

function getTopScorers(rows, count = 3, metricType = "goals") {
  return getSortedScorers(rows, metricType).slice(0, count);
}

function sortRankingRows(rows, metricType = "goals") {
  return getSortedScorers(rows, metricType).map((scorer) => scorer.row);
}

function getScorerPoster(scorer, config = {}) {
  const player = scorer?.row?.player || {};
  const metricPosterMap = playerPosterMaps[config?.metric] || playerPosterMap;
  return (
    metricPosterMap[player.id] ||
    metricPosterMap[player.slug] ||
    playerPosterMap[player.id] ||
    playerPosterMap[player.slug] ||
    scorer?.poster ||
    player.photoUrlOriginal ||
    player.photoUrl ||
    ""
  );
}

function getScorerDisplayName(scorer) {
  return scorer?.playerName || "球员";
}

function getScorerTeamLabel(scorer) {
  return scorer?.teamName || "球队";
}

function getScorerFlag(scorer) {
  return scorer?.flag || "";
}

function renderRankingRibbonLayer(layerType = "back") {
  const ribbons = layerType === "front" ? ["c", "d"] : ["a", "b"];
  return `
    <div class="ribbon-layer ribbon-layer-${layerType}" aria-hidden="true">
      ${ribbons.map((name) => `<span class="ranking-ribbon ribbon-${name}"></span>`).join("")}
    </div>
  `;
}

function renderRankingMetricBadge(row, config) {
  return `<div class="scorer-goals ranking-metric-badge"><strong>${escapeHtml(leaderboardValueText(row))}</strong><span>${escapeHtml(config.unit || "")}</span></div>`;
}

function renderPosterImage(poster, displayName, place) {
  if (!poster) return "";
  return `<img data-poster-image class="scorer-poster-image" src="${escapeHtml(poster)}" alt="${escapeHtml(displayName)}海报" loading="${place === 1 ? "eager" : "lazy"}" decoding="async" fetchpriority="${place === 1 ? "high" : "low"}" onerror="const frame=this.closest('[data-poster-frame]');if(frame){frame.classList.add('poster-missing');this.remove();}" />`;
}

function renderTopScorersPodium(items, config) {
  const scorers = getTopScorers(items, 3, config.metric);
  const label = config.label || "榜单";
  const actionName = config.metric === "assists" ? "助攻" : "进球";
  if (!scorers.length) {
    return `
      <section class="scorer-podium-empty" aria-label="${escapeHtml(label)}空状态">
        <strong>${escapeHtml(label)}数据暂未生成</strong>
        <span>比赛开始后，这里将显示球员${escapeHtml(actionName)}排行。</span>
      </section>
    `;
  }
  const placements = [
    { scorer: scorers[1], place: 2, theme: "silver" },
    { scorer: scorers[0], place: 1, theme: "gold" },
    { scorer: scorers[2], place: 3, theme: "bronze" },
  ].filter((placement) => placement.scorer);
  return `
    <section class="scorer-podium-wrap" aria-label="${escapeHtml(label)}前三名领奖台">
      <div class="scorer-podium count-${placements.length}">
        ${placements.map((placement, index) => renderTopScorerCard3D(placement.scorer, config, placement.place, placement.theme, index)).join("")}
      </div>
    </section>
  `;
}

function renderTopScorerCard(scorer, config, place, theme, index) {
  const row = scorer.row || {};
  const identity = leaderboardIdentity(row, config);
  const poster = getScorerPoster(scorer, config);
  const displayName = getScorerDisplayName(scorer);
  const teamLabel = getScorerTeamLabel(scorer);
  const hrefAttr = identity.href ? ` data-href="${identity.href}" role="link" tabindex="0"` : "";
  const fallbackInitials = leaderboardInitials(displayName);
  const posterClass = poster ? "" : " poster-missing";
  return `
    <article class="scorer-podium-card scorer-podium-card-${theme}" style="--stagger:${index}"${hrefAttr}>
      <div class="scorer-podium-rank">
        <span class="scorer-crown" aria-hidden="true">♕</span>
        <strong>#${place}</strong>
      </div>
      <div class="scorer-poster-frame${posterClass}">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(displayName)}海报" loading="${place === 1 ? "eager" : "lazy"}" onerror="this.closest('.scorer-poster-frame').classList.add('poster-missing');this.remove();" />` : ""}
        <span class="scorer-poster-fallback" aria-hidden="${poster ? "true" : "false"}">
          <b>${escapeHtml(fallbackInitials)}</b>
          <small>海报待添加</small>
        </span>
      </div>
      <div class="scorer-card-info">
        <div class="scorer-name-line">
          ${teamLogo(identity.team, "scorer-team-flag")}
          <strong title="${escapeHtml(scorer.fullName || displayName)}">${escapeHtml(displayName)}</strong>
        </div>
        <span class="scorer-team-label" title="${escapeHtml(teamLabel)}">${escapeHtml(teamLabel)}</span>
        <div class="scorer-goals"><strong>${escapeHtml(leaderboardValueText(row))}</strong><span>${escapeHtml(config.unit || "球")}</span></div>
      </div>
    </article>
  `;
}

function renderTopScorerCard3D(scorer, config, place, theme, index) {
  const row = scorer.row || {};
  const identity = leaderboardIdentity(row, config);
  const poster = getScorerPoster(scorer, config);
  const displayName = getScorerDisplayName(scorer);
  const teamLabel = getScorerTeamLabel(scorer);
  const hrefAttr = identity.href ? ` data-href="${identity.href}" role="link" tabindex="0"` : "";
  const fallbackInitials = leaderboardInitials(displayName);
  const posterClass = poster ? "" : " poster-missing";
  const rankLabel = `#${place}`;
  const maxTilt = place === 1 ? "5.5" : "7";
  return `
    <article class="scorer-podium-card scorer-podium-card-${theme}" data-scorer-card-3d data-rank-place="${place}" data-max-tilt="${maxTilt}" style="--stagger:${index}" aria-label="${escapeHtml(displayName)} ${rankLabel}"${hrefAttr}>
      <div class="scorer-card-perspective">
        <div class="scorer-card-inner scorer-poster-frame${posterClass}" data-poster-frame>
          ${renderRankingRibbonLayer("back")}
          <div class="poster-depth-layer poster-depth-main">
            ${renderPosterImage(poster, displayName, place)}
            <span class="scorer-poster-fallback" aria-hidden="${poster ? "true" : "false"}">
              <b>${escapeHtml(fallbackInitials)}</b>
              <small>Poster pending</small>
            </span>
          </div>
          <div class="poster-light-layer" aria-hidden="true"></div>
          <div class="poster-shadow-layer" aria-hidden="true"></div>
          <div class="particle-layer" aria-hidden="true"></div>
          ${renderRankingRibbonLayer("front")}
          <div class="edge-shine-layer" aria-hidden="true"></div>
          <div class="stage-glow-layer" aria-hidden="true"></div>
          <div class="scorer-podium-rank">
            <span class="scorer-crown" aria-hidden="true">&#9813;</span>
            <strong>${rankLabel}</strong>
          </div>
          <div class="scorer-card-info">
            <div class="scorer-name-line">
              ${teamLogo(identity.team, "scorer-team-flag")}
              <strong title="${escapeHtml(scorer.fullName || displayName)}">${escapeHtml(displayName)}</strong>
            </div>
            <span class="scorer-team-label" title="${escapeHtml(teamLabel)}">${escapeHtml(teamLabel)}</span>
            ${renderRankingMetricBadge(row, config)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function initScorerPodium3D() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const lightweightMode = window.matchMedia?.("(max-width: 640px), (hover: none), (pointer: coarse)")?.matches;
  document.querySelectorAll("[data-scorer-card-3d]").forEach((card) => {
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--shine-x", "50%");
    card.style.setProperty("--shine-y", "35%");
    if (reduceMotion || lightweightMode) {
      card.dataset.motion = lightweightMode ? "lightweight" : "reduced";
      return;
    }
    let rafId = 0;
    let lastEvent = null;
    const maxTilt = Number(card.dataset.maxTilt || 7);
    const resetTilt = () => {
      lastEvent = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      card.classList.remove("is-tilting");
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      card.style.setProperty("--shine-x", "50%");
      card.style.setProperty("--shine-y", "35%");
    };
    const updateTilt = () => {
      rafId = 0;
      if (!lastEvent) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const relativeX = (lastEvent.clientX - rect.left) / rect.width - 0.5;
      const relativeY = (lastEvent.clientY - rect.top) / rect.height - 0.5;
      const shineX = Math.max(14, Math.min(86, (relativeX + 0.5) * 100));
      const shineY = Math.max(12, Math.min(74, (relativeY + 0.5) * 100));
      card.classList.add("is-tilting");
      card.style.setProperty("--tilt-x", `${(-relativeY * maxTilt).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(relativeX * maxTilt).toFixed(2)}deg`);
      card.style.setProperty("--shine-x", `${shineX.toFixed(1)}%`);
      card.style.setProperty("--shine-y", `${shineY.toFixed(1)}%`);
    };
    card.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      lastEvent = event;
      if (!rafId) rafId = requestAnimationFrame(updateTilt);
    });
    card.addEventListener("pointerleave", resetTilt);
    card.addEventListener("pointercancel", resetTilt);
    card.addEventListener("blur", resetTilt);
  });
}

function renderTopThreePodium(items, config) {
  if (["goals", "assists"].includes(config.metric)) return renderTopScorersPodium(items, config);
  if (!items.length) return `<div class="leaderboard-empty">暂无${escapeHtml(config.label)}数据</div>`;
  const placements = [
    { row: items[1], place: 2, theme: "silver" },
    { row: items[0], place: 1, theme: "gold" },
    { row: items[2], place: 3, theme: "bronze" },
  ].filter((placement) => placement.row);
  return `
    <section class="leaderboard-podium-wrap" aria-label="前三名领奖台">
      <div class="leaderboard-podium">
        ${placements.map((placement, index) => renderPodiumCard(placement.row, config, placement.place, placement.theme, index)).join("")}
      </div>
    </section>
  `;
}

function renderPodiumCard(row, config, place, theme, index) {
  const identity = leaderboardIdentity(row, config);
  const isTeamMetric = row.subject === "team" || config.subject === "team";
  const hrefAttr = identity.href ? ` data-href="${identity.href}" role="link" tabindex="0"` : "";
  return `
    <article class="podium-card podium-card-${theme}${isTeamMetric ? " podium-card-team" : ""}" style="--stagger:${index}"${hrefAttr}>
      <span class="podium-crown" aria-hidden="true">♕</span>
      <span class="podium-rank">#${place}</span>
      ${renderLeaderboardAvatar(row, config, "podium-avatar")}
      <div class="podium-name-row">
        ${isTeamMetric ? "" : teamLogo(identity.team, "leaderboard-flag")}
        <strong title="${escapeHtml(identity.fullName)}">${escapeHtml(identity.name)}</strong>
      </div>
      <span class="podium-team" title="${escapeHtml(identity.teamName)}">${escapeHtml(identity.teamName)}</span>
      <div class="podium-value"><strong>${escapeHtml(leaderboardValueText(row))}</strong>${config.unit ? `<span>${escapeHtml(config.unit)}</span>` : ""}</div>
    </article>
  `;
}

function renderLeaderboardList(items, config) {
  if (config.sliderWindow) return renderLeaderboardSliderList(items, config);
  const displayLimit = Math.max(3, Number(config.displayLimit || 8));
  const sourceItems = ["goals", "assists"].includes(config.metric) ? sortRankingRows(items, config.metric) : items;
  const rows = sourceItems.slice(3, displayLimit);
  const listEnd = Math.min(sourceItems.length, displayLimit);
  if (!rows.length) return `<div class="leaderboard-empty">暂无更多${escapeHtml(config.label)}数据</div>`;
  return `
    <section class="leaderboard-list-panel" aria-label="第4到第${listEnd}名榜单">
      ${rows.map((row, index) => renderLeaderboardListRow(row, config, index + 4, index)).join("")}
    </section>
  `;
}

function leaderboardSliderRows(items, config) {
  const displayLimit = Math.max(3, Number(config.displayLimit || items.length || 3));
  return (items || []).slice(3, displayLimit);
}

function leaderboardSliderWindowSize(rows, config) {
  return Math.max(1, Math.min(rows.length, Number(config.sliderWindow || 8)));
}

function renderLeaderboardSliderList(items, config) {
  const rows = leaderboardSliderRows(items, config);
  if (!rows.length) return `<div class="leaderboard-empty">暂无更多${escapeHtml(config.label)}数据</div>`;
  const windowSize = leaderboardSliderWindowSize(rows, config);
  const visibleRows = rows.slice(0, windowSize);
  const maxOffset = Math.max(0, rows.length - windowSize);
  const firstRank = 4;
  const lastRank = firstRank + visibleRows.length - 1;
  return `
    <section class="leaderboard-list-panel leaderboard-slider-panel" data-leaderboard-slider data-max-offset="${maxOffset}" data-window-size="${windowSize}" aria-label="${escapeHtml(config.label)}第4到第${rows.length + 3}名滑块">
      <div class="leaderboard-slider-head">
        <div class="leaderboard-slider-title">
          <span>${escapeHtml(config.label)}窗口</span>
          <strong>第 <b data-leaderboard-slider-start>${firstRank}</b>-<b data-leaderboard-slider-end>${lastRank}</b> 名</strong>
          <small>共 ${items.length} 名</small>
        </div>
        <div class="leaderboard-slider-controls" aria-label="切换排名窗口">
          <button class="leaderboard-slider-button" type="button" data-leaderboard-slider-step="-1" aria-label="上一组">‹</button>
          <button class="leaderboard-slider-button" type="button" data-leaderboard-slider-step="1" aria-label="下一组">›</button>
        </div>
      </div>
      <input class="leaderboard-slider-range" type="range" min="0" max="${maxOffset}" value="0" step="1" data-leaderboard-slider-range aria-label="选择${escapeHtml(config.label)}排名窗口" />
      <div class="leaderboard-slider-track" data-leaderboard-slider-track>
        ${visibleRows.map((row, index) => renderLeaderboardListRow(row, config, firstRank + index, index)).join("")}
      </div>
    </section>
  `;
}

function updateLeaderboardSlider(offsetValue) {
  const panel = document.querySelector("[data-leaderboard-slider]");
  if (!panel || !leaderboardSliderState) return;
  const rows = leaderboardSliderRows(leaderboardSliderState.items, leaderboardSliderState.config);
  if (!rows.length) return;
  const windowSize = leaderboardSliderWindowSize(rows, leaderboardSliderState.config);
  const maxOffset = Math.max(0, rows.length - windowSize);
  const offset = Math.max(0, Math.min(maxOffset, Number(offsetValue || 0)));
  const visibleRows = rows.slice(offset, offset + windowSize);
  const firstRank = offset + 4;
  const lastRank = firstRank + visibleRows.length - 1;
  const range = panel.querySelector("[data-leaderboard-slider-range]");
  const track = panel.querySelector("[data-leaderboard-slider-track]");
  const start = panel.querySelector("[data-leaderboard-slider-start]");
  const end = panel.querySelector("[data-leaderboard-slider-end]");
  if (track) {
    track.innerHTML = visibleRows.map((row, index) => renderLeaderboardListRow(row, leaderboardSliderState.config, firstRank + index, index)).join("");
  }
  if (range) {
    range.max = String(maxOffset);
    range.value = String(offset);
  }
  if (start) start.textContent = String(firstRank);
  if (end) end.textContent = String(lastRank);
  panel.dataset.offset = String(offset);
  panel.querySelectorAll("[data-leaderboard-slider-step]").forEach((button) => {
    const step = Number(button.dataset.leaderboardSliderStep || 0);
    button.disabled = (step < 0 && offset <= 0) || (step > 0 && offset >= maxOffset);
  });
}

function initLeaderboardSlider(items, config) {
  leaderboardSliderState = { items: items || [], config };
  updateLeaderboardSlider(0);
}

function renderLeaderboardListRow(row, config, displayRank, index) {
  const identity = leaderboardIdentity(row, config);
  const isTeamMetric = row.subject === "team" || config.subject === "team";
  const hrefAttr = identity.href ? ` data-href="${identity.href}" role="link" tabindex="0"` : "";
  return `
    <article class="leaderboard-list-row${isTeamMetric ? " leaderboard-list-row-team" : ""}" style="--stagger:${index}"${hrefAttr}>
      <span class="leaderboard-row-rank">${displayRank}</span>
      ${renderLeaderboardAvatar(row, config, "leaderboard-row-avatar")}
      <span class="leaderboard-row-main">
        <strong title="${escapeHtml(identity.fullName)}">${escapeHtml(identity.name)}</strong>
        <small>
          ${isTeamMetric ? "" : teamLogo(identity.team, "leaderboard-flag")}
          <span title="${escapeHtml(identity.teamName)}">${escapeHtml(identity.teamName)}</span>
        </small>
      </span>
      ${renderLeaderboardTrend(row)}
      <span class="leaderboard-row-value"><strong>${escapeHtml(leaderboardValueText(row))}</strong>${config.unit ? `<small>${escapeHtml(config.unit)}</small>` : ""}</span>
    </article>
  `;
}

function renderLeaderboardFooter(data) {
  const generatedAt = data.generatedAt ? formatFullDate(data.generatedAt) : "即时同步";
  if (data.snapshotMode === "dongqiudi-player-stats") return "";
  if (data.snapshotMode === "w32-csi") {
    return `
      <footer class="leaderboard-update-note">
        <span aria-hidden="true">ⓘ</span>
        <span>W32-CSI 已同步 · ${escapeHtml(generatedAt)}</span>
      </footer>
    `;
  }
  const sourceNote = data.fallback && data.sourceNote ? ` · ${escapeHtml(data.sourceNote)}` : "";
  const prefix = data.snapshotMode === "w32-csi" ? "W32-CSI 模型输出" : data.fallback ? "当前分类使用本地备用数据" : "数据每分钟更新";
  return `
    <footer class="leaderboard-update-note">
      <span aria-hidden="true">ⓘ</span>
      <span>${prefix} · ${escapeHtml(generatedAt)}${sourceNote}</span>
    </footer>
  `;
}

function renderRouteLoading() {
  return `
    <div class="route-loader" role="status" aria-live="polite">
      <span class="route-loader-mark" aria-hidden="true"></span>
      <span>正在载入赛事数据</span>
    </div>
  `;
}

function beginRouteLoading() {
  const alreadyBooting = app.childElementCount === 1 && app.firstElementChild?.classList.contains("route-loader");
  app.setAttribute("aria-busy", "true");
  if (!alreadyBooting) app.replaceChildren();
  let finished = false;
  const timer = window.setTimeout(() => {
    if (!finished && app.childElementCount === 0) app.innerHTML = renderRouteLoading();
  }, 140);
  return () => {
    finished = true;
    window.clearTimeout(timer);
    app.removeAttribute("aria-busy");
  };
}

function leaderboardExportMetric(config) {
  return ["players", "goals", "assists", "teams"].includes(config.sourceMetric) ? config.sourceMetric : "";
}

async function render() {
  stopStream();
  setActiveMatchReturnTarget("");
  const { path, params } = routeInfo();
  if (path === "/matches") {
    location.hash = hashHref("/competitions/world-cup-2026", Object.fromEntries(params.entries()));
    return;
  }
  document.body.dataset.route = path === "/" ? "home" : path.split("/").filter(Boolean)[0] || "home";
  delete document.body.dataset.subroute;
  if (path.startsWith("/competitions/")) document.body.dataset.subroute = "group-stage";
  setActiveNav(path);
  syncGlobalSearchForRoute(path, params);
  const finishRouteLoading = beginRouteLoading();
  try {
    await loadRouteLookups(path);
    if (path === "/") await renderHome();
    else if (path === "/standings") await renderStandingsPage();
    else if (path === "/knockout") await renderKnockoutPage();
    else if (path.startsWith("/matches/")) await renderMatchDetail(path.split("/")[2], params);
    else if (path.startsWith("/competitions/")) await renderCompetition(path.split("/")[2], params);
    else if (path.startsWith("/leaderboards/")) await renderLeaderboard(path.split("/")[2] || "players", params);
    else if (path.startsWith("/teams/")) await renderTeam(path.split("/")[2], params);
    else if (path.startsWith("/players/")) await renderPlayer(path.split("/")[2], params);
    else if (path === "/search") await renderSearch(params);
    else if (path === "/admin") await renderAdmin();
    else renderNotFound();
  } catch (error) {
    app.innerHTML = path.startsWith("/competitions/") ? renderGroupStageError(error) : `<div class="error">页面载入失败：${escapeHtml(error.message)}</div>`;
  } finally {
    finishRouteLoading();
  }
}

async function renderHome() {
  const matches = await api("/matches?pageSize=8");
  const focusMatch = homeFocusMatch(matches.items);
  app.innerHTML = `
    <section class="home-cover" aria-label="世界杯传奇海报首页">
      <div class="home-cover-scene" aria-hidden="true">
        <div class="home-cover-poster"></div>
        <div class="home-cover-vignette"></div>
        <span class="home-spotlight left"></span>
        <span class="home-spotlight right"></span>
        <span class="home-trophy-glow"></span>
        <div class="hero-particles">${renderHeroParticles(32)}</div>
      </div>
      <div class="home-cover-content">
        <span class="home-focus-chip"><span aria-hidden="true">✦</span> 今日焦点</span>
        ${renderHomeFocusCard(focusMatch)}
      </div>
    </section>
  `;
  initHomeHeroTilt();
  cleanHomeUrl();
}

function homeFocusMatch(items = []) {
  return items.find((item) => item.status === "live") || items[0] || {
    id: "",
    homeTeam: { name: "科特迪瓦", code: "CIV", flagUrl: "/static/assets/team-civ.png" },
    awayTeam: { name: "挪威", code: "NOR", flagUrl: "/static/assets/team-nor.png" },
    kickoffAt: "2026-07-01T01:00:00+08:00",
    score: { home: null, away: null },
  };
}

function renderHomeFocusCard(match) {
  const href = match.id ? matchDetailHref(match.id) : hashHref("/competitions/world-cup-2026");
  const knockoutRound = knockoutRoundKey(match);
  const scheduleHref = knockoutRound ? hashHref("/knockout", { round: knockoutRound }) : hashHref("/competitions/world-cup-2026");
  const scheduleLabel = knockoutRound ? "查看淘汰赛" : "更多小组赛";
  const venueText = venueCityStadiumDisplay(match.venue);
  const homeName = teamCompactName(match.homeTeam, "科特迪瓦");
  const awayName = teamCompactName(match.awayTeam, "挪威");
  const homeFullName = teamDisplayName(match.homeTeam, "科特迪瓦");
  const awayFullName = teamDisplayName(match.awayTeam, "挪威");
  return `
    <article class="home-focus-card" aria-label="焦点比赛">
      <div class="home-focus-card-head">
        <span>焦点比赛</span>
        <a href="${scheduleHref}">${scheduleLabel} &gt;</a>
      </div>
      <a class="home-focus-match" href="${href}">
        <span class="home-focus-team">
          ${teamLogo(match.homeTeam, "team-logo home-focus-flag")}
          <strong title="${escapeHtml(homeFullName)}">${escapeHtml(homeName)}</strong>
        </span>
        <span class="home-focus-versus">${escapeHtml(scoreText(match))}</span>
        <span class="home-focus-team right">
          ${teamLogo(match.awayTeam, "team-logo home-focus-flag")}
          <strong title="${escapeHtml(awayFullName)}">${escapeHtml(awayName)}</strong>
        </span>
      </a>
      <div class="home-focus-meta">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <span class="home-focus-venue">${escapeHtml(venueText)}</span>
      </div>
    </article>
  `;
}

function renderHeroParticles(count = 32) {
  const colors = [
    "rgba(255, 210, 92, 0.86)",
    "rgba(255, 255, 255, 0.72)",
    "rgba(87, 158, 255, 0.58)",
  ];
  return Array.from({ length: count }, (_, index) => {
    const x = 3 + Math.random() * 94;
    const y = -8 + Math.random() * 108;
    const size = 2 + Math.random() * 5;
    const duration = 12 + Math.random() * 12;
    const delay = -Math.random() * duration;
    const drift = -24 + Math.random() * 48;
    const rotate = Math.round(Math.random() * 360);
    const color = colors[index % colors.length];
    const style = `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--s:${size.toFixed(1)}px;--d:${duration.toFixed(1)}s;--delay:${delay.toFixed(1)}s;--drift:${drift.toFixed(1)}px;--rot:${rotate}deg;--c:${color}`;
    return `<span style="${style}"></span>`;
  }).join("");
}

function initHomeHeroTilt() {
  const cover = document.querySelector(".home-cover");
  if (!cover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!canHover) return;
  const maxTilt = 6;
  let frame = 0;
  const setTilt = (event) => {
    const rect = cover.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const rotateY = px * maxTilt;
    const rotateX = -py * maxTilt;
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      cover.style.setProperty("--hero-tilt-x", `${rotateX.toFixed(2)}deg`);
      cover.style.setProperty("--hero-tilt-y", `${rotateY.toFixed(2)}deg`);
      cover.style.setProperty("--hero-depth-x", `${(px * 16).toFixed(1)}px`);
      cover.style.setProperty("--hero-depth-y", `${(py * 12).toFixed(1)}px`);
    });
  };
  const resetTilt = () => {
    window.cancelAnimationFrame(frame);
    cover.style.setProperty("--hero-tilt-x", "0deg");
    cover.style.setProperty("--hero-tilt-y", "0deg");
    cover.style.setProperty("--hero-depth-x", "0px");
    cover.style.setProperty("--hero-depth-y", "0px");
  };
  cover.addEventListener("mousemove", setTilt, { passive: true });
  cover.addEventListener("mouseleave", resetTilt, { passive: true });
}

function renderLiveStrip(match) {
  if (!match) return `<aside class="live-score-strip"><span class="badge">暂无比赛</span></aside>`;
  return `
    <aside class="live-score-strip">
      <div class="live-meta">${statusBadge(match)} ${sourceBadge(match.provider)} <span>${escapeHtml(match.competition.name)}</span></div>
      <a class="scoreline" href="${matchDetailHref(match.id)}">
        <span class="score-team">${teamLogo(match.homeTeam)}<strong>${escapeHtml(match.homeTeam.name)}</strong></span>
        <span class="score-number">${escapeHtml(scoreText(match))}</span>
        <span class="score-team">${teamLogo(match.awayTeam)}<strong>${escapeHtml(match.awayTeam.name)}</strong></span>
      </a>
      <div class="live-meta">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <span>${escapeHtml(match.venue?.name || "")}</span>
      </div>
    </aside>
  `;
}

async function renderMatches(params) {
  const filters = Object.fromEntries(params.entries());
  const data = await api(`/matches?${toQuery({ pageSize: 50, ...filters })}`);
  app.innerHTML = `
    <section class="page-head">
      <div class="page-title">
        <p class="eyebrow">Schedule</p>
        <h1>赛程与结果</h1>
        <p class="muted">仅展示 2026 FIFA 世界杯赛程，可按年份、球队、状态和日期筛选。</p>
      </div>
      <div class="button-row">
        <button class="btn" data-export-resource="matches">导出</button>
        <a class="btn" href="#/matches">重置</a>
      </div>
    </section>
    <form id="match-filter-form" class="filters">
      <label>赛事
        <select name="competition">${renderOptions(lookups.competitions.map((item) => ({ ...item, id: item.slug })), filters.competition)}</select>
      </label>
      <label>年份
        <input name="season" value="${escapeHtml(filters.season || "")}" placeholder="2026" />
      </label>
      <label>球队
        <select name="team">${renderOptions(lookups.teams, filters.team)}</select>
      </label>
      <label>状态
        <select name="status">
          <option value="">全部</option>
          <option value="live" ${selected("live", filters.status)}>进行中</option>
          <option value="scheduled" ${selected("scheduled", filters.status)}>未开始</option>
          <option value="ft" ${selected("ft", filters.status)}>已完场</option>
        </select>
      </label>
      <label>开始
        <input type="date" name="dateFrom" value="${escapeHtml(filters.dateFrom || "")}" />
      </label>
      <label>结束
        <input type="date" name="dateTo" value="${escapeHtml(filters.dateTo || "")}" />
      </label>
      <button class="btn primary" type="submit">筛选</button>
    </form>
    <section class="panel">
      <div class="panel-header">
        <h2>共 ${data.total} 场</h2>
        <span class="muted mini">生成时间 ${escapeHtml(formatDate(data.freshness.generatedAt))}</span>
      </div>
      <div class="panel-body">${renderMatchCards(data.items)}</div>
    </section>
  `;
  document.getElementById("match-filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    location.hash = hashHref("/matches", Object.fromEntries(formData.entries()));
  });
}

async function renderCompetition(slug, params = new URLSearchParams()) {
  if (slug === "world-cup-2026") {
    await renderGroupStagePage(slug, params);
    return;
  }
  await renderCompetitionSchedulePage(slug, params);
}

async function renderCompetitionSchedulePage(slug, params = new URLSearchParams()) {
  const filters = Object.fromEntries(params.entries());
  const comp = await api(`/competitions/${slug}`);
  const matches = await api(`/matches?${toQuery({ pageSize: 80, competition: comp.slug, ...filters })}`);
  const split = splitCompetitionMatches(matches.items);
  app.innerHTML = `
    <section class="page-head">
      <div class="page-title">
        <p class="eyebrow">赛事</p>
        <h1>${escapeHtml(comp.name)}</h1>
        <p class="muted">赛程工作台按比赛状态分栏，进行中的比赛会自动置顶。</p>
      </div>
      <div class="button-row">
        ${comp.sourceUrl ? `<a class="btn" href="${escapeHtml(comp.sourceUrl)}" target="_blank" rel="noreferrer">来源</a>` : ""}
        <button class="btn" data-export-resource="matches">导出赛程</button>
        <a class="btn" href="#/competitions/world-cup-2026">查看小组总览</a>
      </div>
    </section>
    <form id="competition-filter-form" class="filters competition-filters">
      <label>球队
        <select name="team">${renderOptions(lookups.teams, filters.team)}</select>
      </label>
      <label>状态
        <select name="status">
          <option value="">全部</option>
          <option value="live" ${selected("live", filters.status)}>进行中</option>
          <option value="scheduled" ${selected("scheduled", filters.status)}>未开始</option>
          <option value="ft" ${selected("ft", filters.status)}>已完场</option>
        </select>
      </label>
      <label>开始
        <input type="date" name="dateFrom" value="${escapeHtml(filters.dateFrom || "")}" />
      </label>
      <label>结束
        <input type="date" name="dateTo" value="${escapeHtml(filters.dateTo || "")}" />
      </label>
      <button class="btn primary" type="submit">筛选</button>
      <a class="btn" href="${hashHref(`/competitions/${comp.slug}`)}">重置</a>
    </form>
    <section class="competition-schedule-grid">
      <section class="panel schedule-column live-upcoming">
        <div class="panel-header">
          <div>
            <h2>未开赛 / 进行中</h2>
            <p class="muted mini">进行中的比赛置顶，随后按开球时间排列。</p>
          </div>
          <span class="badge">${split.active.length} 场</span>
        </div>
        <div class="panel-body">${renderMatchCards(split.active, "暂无未开赛或进行中的比赛")}</div>
      </section>
      <section class="panel schedule-column completed">
        <div class="panel-header">
          <div>
            <h2>已完赛</h2>
            <p class="muted mini">按最近完赛时间优先展示。</p>
          </div>
          <span class="badge">${split.completed.length} 场</span>
        </div>
        <div class="panel-body">${renderMatchCards(split.completed, "暂无已完赛比赛")}</div>
      </section>
    </section>
  `;
  document.getElementById("competition-filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    location.hash = hashHref(`/competitions/${comp.slug}`, Object.fromEntries(formData.entries()));
  });
}

function splitCompetitionMatches(items) {
  const matches = [...(items || [])];
  const kickoff = (match) => new Date(match.kickoffAt || 0).getTime() || 0;
  return {
    active: matches
      .filter((match) => match.status !== "ft")
      .sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0) || kickoff(a) - kickoff(b)),
    completed: matches.filter((match) => match.status === "ft").sort((a, b) => kickoff(b) - kickoff(a)),
  };
}

const groupStageGroupIds = "ABCDEFGHIJKL".split("");

const groupStageViews = [
  { key: "overview", label: "总览" },
  { key: "timeline", label: "时间线" },
  { key: "groups", label: "分组" },
  { key: "qualification", label: "出线" },
  { key: "teams", label: "球队" },
];

const groupStageFilters = [
  { key: "all", label: "全部" },
  { key: "today", label: "今日" },
  { key: "live", label: "直播中" },
  { key: "scheduled", label: "未开始" },
  { key: "finished", label: "已结束" },
];

const groupStageStatusLabels = {
  scheduled: "未开始",
  live: "直播中",
  halftime: "中场",
  extra_time: "加时",
  penalties: "点球",
  finished: "已结束",
  postponed: "延期",
  cancelled: "取消",
  unknown: "待确认",
};

async function renderGroupStagePage(slug, params = new URLSearchParams()) {
  document.body.dataset.subroute = "group-stage";
  const comp = await api(`/competitions/${slug}`);
  const matches = normalizeGroupStageMatches(comp.matches || []);
  const standings = normalizeGroupStandings(comp.standings || {}, matches);
  const thirdPlaceRanking = buildThirdPlaceRanking(standings, matches);
  applyThirdPlaceQualification(standings, thirdPlaceRanking, matches);
  const groupOverview = buildGroupOverview(standings, matches);
  const summary = buildGroupStageSummary(matches, standings, thirdPlaceRanking, groupOverview);
  const state = normalizeGroupStageState(params);
  const filteredMatches = filterGroupStageMatches(matches, state.filter, state.group, state.team);
  setActiveMatchReturnTarget(groupStageHref(state));

  app.innerHTML = `
    <section class="group-stage-page">
      ${renderGroupStageHero(summary)}
      ${renderGroupStageViewSwitch(state)}
      ${renderGroupStageFilters(state, summary)}
      ${renderGroupTabs(state, groupOverview)}
      <section class="group-stage-content">
        ${renderGroupStageContent(state, matches, filteredMatches, standings, groupOverview, thirdPlaceRanking, summary)}
      </section>
    </section>
  `;
  initGroupStageInteractions(state);
}

function normalizeGroupStageState(params = new URLSearchParams()) {
  const view = normalizeGroupStageView(params.get("view"));
  const filter = normalizeGroupStageFilter(params.get("filter") || params.get("status"));
  const groupCandidate = String(params.get("group") || "all").toUpperCase();
  const group = groupStageGroupIds.includes(groupCandidate) ? groupCandidate : "all";
  return {
    view,
    filter,
    group,
    team: params.get("team") || "",
    q: params.get("q") || "",
  };
}

function normalizeGroupStageView(value) {
  return groupStageViews.some((item) => item.key === value) ? value : "overview";
}

function normalizeGroupStageFilter(value) {
  const aliases = { ft: "finished", full_time: "finished", in_progress: "live", not_started: "scheduled", "": "all" };
  const normalized = aliases[value || ""] || value || "all";
  return groupStageFilters.some((item) => item.key === normalized) ? normalized : "all";
}

function groupStageHref(state, overrides = {}) {
  const next = { ...state, ...overrides };
  const params = {};
  if (next.view && next.view !== "overview") params.view = next.view;
  if (next.filter && next.filter !== "all") params.filter = next.filter;
  if (next.group && next.group !== "all") params.group = next.group;
  if (next.team) params.team = next.team;
  if (next.q) params.q = next.q;
  return hashHref("/competitions/world-cup-2026", params);
}

function isGroupStageMatch(match) {
  return (match?.stage?.type === "group" || match?.group) && Boolean(getMatchGroup(match));
}

function normalizeGroupStageMatches(rawMatches = []) {
  const normalized = rawMatches
    .filter(isGroupStageMatch)
    .map((match) => {
      const groupId = getMatchGroup(match);
      const status = getGroupStageMatchStatus(match);
      return {
        ...match,
        groupId,
        groupLabel: groupStageGroupLabel(groupId),
        matchday: numberOr(match.matchday || match.round || match.roundNo, 0) || null,
        status,
        statusLabel: groupStageStatusLabels[status] || match.statusDetail || "待确认",
        homeTeam: normalizeTeam(match.homeTeam),
        awayTeam: normalizeTeam(match.awayTeam),
        score: {
          home: match.score?.home ?? match.homeScore ?? null,
          away: match.score?.away ?? match.awayScore ?? null,
        },
      };
    });
  const byGroup = groupMatchesByGroup(normalized);
  Object.values(byGroup).forEach((items) => {
    sortGroupStageMatches(items).forEach((match, index) => {
      if (!match.matchday) match.matchday = Math.min(3, Math.floor(index / 2) + 1);
      match.roundLabel = getMatchRoundLabel(match);
    });
  });
  return sortGroupStageMatches(normalized);
}

function normalizeGroupStandings(rawStandings = {}, matches = []) {
  const matchesByGroup = groupMatchesByGroup(matches);
  return groupStageGroupIds.reduce((result, groupId) => {
    const rows = rawStandings[groupId] || rawStandings[groupStageGroupLabel(groupId)] || [];
    const groupComplete = isGroupComplete(matchesByGroup[groupId] || []);
    result[groupId] = rows
      .map((row, index) => ({
        groupId,
        groupLabel: groupStageGroupLabel(groupId),
        groupComplete,
        rank: numberOr(row.rank, index + 1),
        team: normalizeTeam(row.team),
        played: numberOr(row.played),
        wins: numberOr(row.wins ?? row.won),
        draws: numberOr(row.draws ?? row.drawn),
        losses: numberOr(row.losses ?? row.lost),
        goalsFor: numberOr(row.goalsFor),
        goalsAgainst: numberOr(row.goalsAgainst),
        goalDifference: numberOr(row.goalDifference),
        points: numberOr(row.points),
        zone: row.zone || "",
        zoneLabel: row.zoneLabel || "",
        qualificationStatus: "unknown",
        qualificationLabel: "待确认",
      }))
      .sort((a, b) => a.rank - b.rank);
    return result;
  }, {});
}

function normalizeTeam(team = {}) {
  return {
    id: team?.id || team?.teamId || team?.slug || team?.code || "",
    slug: team?.slug || "",
    name: teamDisplayName(team, "待定球队"),
    shortName: team?.shortName || team?.short_name || team?.name || team?.code || "待定球队",
    nameEn: team?.nameEn || team?.name_en || "",
    code: team?.code || team?.fifaCode || team?.fifa_code || "-",
    flagEmoji: team?.flagEmoji || "",
    flagUrl: team?.flagUrl || team?.logoUrl || "",
    logoUrl: team?.logoUrl || team?.flagUrl || "",
  };
}

function getMatchGroup(match) {
  const raw = match?.group?.name || match?.group?.code || match?.groupId || match?.group || "";
  const letter = String(raw).toUpperCase().match(/[A-L]/)?.[0] || "";
  return groupStageGroupIds.includes(letter) ? letter : "";
}

function getMatchRoundLabel(match) {
  const day = numberOr(match.matchday, 0);
  return day ? `第 ${day} 轮` : "轮次待确认";
}

function getGroupStageMatchStatus(match) {
  const status = String(match?.status || "").toLowerCase();
  if (["ft", "finished", "full_time"].includes(status)) return "finished";
  if (["live", "in_progress"].includes(status)) return "live";
  if (["halftime", "half_time", "ht"].includes(status)) return "halftime";
  if (["extra_time", "extra-time"].includes(status)) return "extra_time";
  if (["penalties", "penalty", "pso"].includes(status)) return "penalties";
  if (["postponed", "delayed"].includes(status)) return "postponed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["scheduled", "not_started", "notstarted", "pre", "preview"].includes(status)) return "scheduled";
  return status || "unknown";
}

function getMatchScore(match) {
  const home = match?.score?.home;
  const away = match?.score?.away;
  if (home === null || home === undefined || away === null || away === undefined) return "-";
  return `${home} - ${away}`;
}

function groupStageGroupLabel(groupId) {
  return groupId && groupStageGroupIds.includes(groupId) ? `${groupId}组` : "待确认";
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function groupStageTeamKey(team = {}) {
  return String(team.id || team.code || team.name || "").trim();
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupStageDateTitle(key) {
  if (!key || key === "unknown") return "时间待确认";
  const today = localDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const prefix = key === today ? "今天" : key === localDateKey(tomorrowDate) ? "明天" : "";
  const [year, month, day] = key.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || Number.isNaN(date.getTime())) return key;
  const label = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
  return prefix ? `${prefix} · ${label}` : label;
}

function formatGroupStageKickoff(iso) {
  if (!iso) return "时间待确认";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function sortGroupStageMatches(matches = []) {
  return [...matches].sort((a, b) => {
    const timeA = new Date(a.kickoffAt || 0).getTime() || 0;
    const timeB = new Date(b.kickoffAt || 0).getTime() || 0;
    return timeA - timeB || numberOr(a.matchNumber) - numberOr(b.matchNumber);
  });
}

function groupMatchesByGroup(matches = []) {
  return matches.reduce((groups, match) => {
    const key = match.groupId || getMatchGroup(match) || "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(match);
    return groups;
  }, {});
}

function groupStageMatchesByDate(matches = []) {
  return sortGroupStageMatches(matches).reduce((groups, match) => {
    const key = match.kickoffAt ? localDateKey(match.kickoffAt) : "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(match);
    return groups;
  }, {});
}

function getTodayMatches(matches = []) {
  const today = localDateKey(new Date());
  return matches.filter((match) => match.kickoffAt && localDateKey(match.kickoffAt) === today);
}

function getLiveMatches(matches = []) {
  return matches.filter((match) => ["live", "halftime", "extra_time", "penalties"].includes(match.status));
}

function isFinishedMatch(match) {
  return match.status === "finished";
}

function isGroupComplete(matches = []) {
  return matches.length >= 6 && matches.every(isFinishedMatch);
}

function filterGroupStageMatches(matches = [], filter = "all", selectedGroup = "all", selectedTeam = "") {
  const today = localDateKey(new Date());
  const teamKey = String(selectedTeam || "");
  return sortGroupStageMatches(
    matches.filter((match) => {
      if (selectedGroup !== "all" && match.groupId !== selectedGroup) return false;
      if (teamKey && ![groupStageTeamKey(match.homeTeam), groupStageTeamKey(match.awayTeam), match.homeTeam.code, match.awayTeam.code].includes(teamKey)) return false;
      if (filter === "today") return match.kickoffAt && localDateKey(match.kickoffAt) === today;
      if (filter === "live") return getLiveMatches([match]).length > 0;
      if (filter === "scheduled") return match.status === "scheduled";
      if (filter === "finished") return match.status === "finished";
      return true;
    })
  );
}

function buildThirdPlaceRanking(standings = {}) {
  return groupStageGroupIds
    .map((groupId) => (standings[groupId] || []).find((row) => row.rank === 3))
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name, "zh-CN"))
    .map((row, index) => ({
      ...row,
      thirdPlaceRank: index + 1,
      thirdPlaceZone: index < 8 ? "advancing" : "danger",
    }));
}

function applyThirdPlaceQualification(standings = {}, thirdPlaceRanking = [], matches = []) {
  const byTeam = new Map(thirdPlaceRanking.map((row) => [groupStageTeamKey(row.team), row]));
  const matchesByGroup = groupMatchesByGroup(matches);
  Object.entries(standings).forEach(([groupId, rows]) => {
    const groupComplete = isGroupComplete(matchesByGroup[groupId] || []);
    rows.forEach((row) => {
      row.groupComplete = groupComplete;
      const thirdRow = byTeam.get(groupStageTeamKey(row.team));
      const status = inferQualificationStatus(row, groupComplete, thirdRow);
      row.qualificationStatus = status.status;
      row.qualificationLabel = status.label;
      if (thirdRow) {
        row.thirdPlaceRank = thirdRow.thirdPlaceRank;
        row.thirdPlaceZone = thirdRow.thirdPlaceZone;
      }
    });
  });
}

function inferQualificationStatus(row, groupComplete, thirdRow) {
  if (row.rank <= 2) return groupComplete ? { status: "qualified", label: "已出线" } : { status: "advancing", label: "晋级区" };
  if (row.rank === 3) {
    if (thirdRow?.thirdPlaceRank <= 8) return groupComplete ? { status: "qualified-third", label: "最佳第三" } : { status: "third", label: "第三竞争" };
    return groupComplete ? { status: "danger", label: "危险" } : { status: "third", label: "第三竞争" };
  }
  if (groupComplete && (row.zone === "outside" || row.rank >= 4)) return { status: "eliminated", label: "已出局" };
  return row.rank >= 4 ? { status: "danger", label: "危险" } : { status: "unknown", label: "待确认" };
}

function buildGroupOverview(standings = {}, matches = []) {
  const matchesByGroup = groupMatchesByGroup(matches);
  return groupStageGroupIds.map((groupId) => {
    const groupMatches = sortGroupStageMatches(matchesByGroup[groupId] || []);
    const played = groupMatches.filter(isFinishedMatch).length;
    const nextMatch = groupMatches.find((match) => !isFinishedMatch(match)) || null;
    return {
      groupId,
      label: groupStageGroupLabel(groupId),
      rows: standings[groupId] || [],
      matches: groupMatches,
      played,
      total: groupMatches.length || 6,
      complete: isGroupComplete(groupMatches),
      liveCount: getLiveMatches(groupMatches).length,
      nextMatch,
      story: buildGroupStory(standings[groupId] || [], groupMatches, nextMatch),
    };
  });
}

function buildGroupStory(rows = [], matches = [], nextMatch = null) {
  if (!rows.length) return "出线形势待确认";
  if (isGroupComplete(matches)) {
    const topTwo = rows.slice(0, 2).map((row) => row.team.name).join("、");
    return topTwo ? `${topTwo} 位于小组前二；第三名进入最佳第三名比较。` : "小组赛已完成，排名等待确认。";
  }
  if (nextMatch) return `${nextMatch.homeTeam.name} vs ${nextMatch.awayTeam.name} 将影响${nextMatch.groupLabel}排名。`;
  return "胜负将影响小组排名";
}

function buildGroupStageSummary(matches = [], standings = {}, thirdPlaceRanking = [], groupOverview = []) {
  const allRows = Object.values(standings).flat();
  const qualifiedCount = allRows.filter((row) => ["qualified", "qualified-third"].includes(row.qualificationStatus)).length;
  const eliminatedCount = allRows.filter((row) => row.qualificationStatus === "eliminated").length;
  return {
    total: matches.length,
    today: getTodayMatches(matches).length,
    live: getLiveMatches(matches).length,
    finished: matches.filter(isFinishedMatch).length,
    scheduled: matches.filter((match) => match.status === "scheduled").length,
    qualified: qualifiedCount,
    eliminated: eliminatedCount,
    suspense: Math.max(0, allRows.length - qualifiedCount - eliminatedCount),
    completeGroups: groupOverview.filter((group) => group.complete).length,
    thirdCount: thirdPlaceRanking.length,
  };
}

function renderGroupStageHero(summary) {
  const progress = summary.total ? Math.round((summary.finished / summary.total) * 100) : 0;
  return `
    <section class="group-stage-hero" aria-label="小组赛中心状态">
      <div class="group-stage-hero-copy">
        <p class="group-stage-kicker">2026 WORLD CUP GROUP STAGE</p>
        <h1>小组赛中心</h1>
        <p>12 组争夺 32 强席位</p>
      </div>
      <div class="group-stage-hero-stats">
        <span><strong>${summary.today}</strong><small>今日</small></span>
        <span class="live"><strong>${summary.live}</strong><small>直播中</small></span>
        <span><strong>${summary.finished}</strong><small>已结束</small></span>
        <span><strong>${summary.scheduled}</strong><small>未开始</small></span>
      </div>
      <div class="group-stage-progress">
        <div>
          <span>小组赛进度</span>
          <strong>${summary.finished} / ${summary.total || 72}</strong>
        </div>
        <i><b style="width:${progress}%"></b></i>
      </div>
      <div class="group-stage-rule">
        <span class="qualified">已出线 ${summary.qualified} 队</span>
        <span>已出局 ${summary.eliminated} 队</span>
        <span class="third">每组前两名 + 8 个最佳第三名晋级 32 强</span>
      </div>
    </section>
  `;
}

function renderGroupStageViewSwitch(state) {
  return `
    <nav class="group-stage-view-switch" role="tablist" aria-label="小组赛视图">
      ${groupStageViews
        .map(
          (view) => `
            <a role="tab" aria-selected="${state.view === view.key ? "true" : "false"}" ${state.view === view.key ? 'aria-current="page"' : ""} class="${state.view === view.key ? "active" : ""}" href="${groupStageHref(state, { view: view.key, team: view.key === "teams" ? state.team : "", q: view.key === "teams" ? state.q : "" })}">
              ${escapeHtml(view.label)}
            </a>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderGroupStageFilters(state, summary) {
  const counts = {
    all: summary.total,
    today: summary.today,
    live: summary.live,
    scheduled: summary.scheduled,
    finished: summary.finished,
  };
  return `
    <nav class="group-stage-filters" aria-label="小组赛状态筛选">
      ${groupStageFilters
        .map(
          (filter) => `
            <a ${state.filter === filter.key ? 'aria-current="true"' : ""} class="${state.filter === filter.key ? "active" : ""}" href="${groupStageHref(state, { filter: filter.key })}">
              <span>${escapeHtml(filter.label)}</span>
              <small>${counts[filter.key] ?? 0}</small>
            </a>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderGroupTabs(state, groupOverview = []) {
  const overviewById = new Map(groupOverview.map((group) => [group.groupId, group]));
  return `
    <label class="group-select-control">
      <span class="group-select-copy">
        <strong>小组</strong>
        <small>快速定位 A–L 组</small>
      </span>
      <span class="group-select-native">
        <select data-group-stage-select aria-label="选择小组">
          <option value="all" ${selected("all", state.group)}>全部 12 组</option>
          ${groupStageGroupIds.map((groupId) => `<option value="${groupId}" ${selected(groupId, state.group)}>${groupId} 组</option>`).join("")}
        </select>
      </span>
    </label>
    <nav class="group-tabs" aria-label="A-L 小组导航">
      <a ${state.group === "all" ? 'aria-current="true"' : ""} class="${state.group === "all" ? "active" : ""}" href="${groupStageHref(state, { group: "all" })}">
        <strong>全部</strong><small>12组</small>
      </a>
      ${groupStageGroupIds
        .map((groupId) => {
          const group = overviewById.get(groupId) || {};
          return `
            <a ${state.group === groupId ? 'aria-current="true"' : ""} class="${state.group === groupId ? "active" : ""}" href="${groupStageHref(state, { group: groupId })}">
              ${group.liveCount ? `<i class="live-dot" aria-label="有直播中比赛"></i>` : ""}
              <strong>${groupId}组</strong>
              <small>${group.complete ? "已完成" : `${group.played || 0}/${group.total || 6}`}</small>
            </a>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderGroupStageContent(state, matches, filteredMatches, standings, groupOverview, thirdPlaceRanking, summary) {
  if (!matches.length) return renderGroupStageEmpty("小组赛尚未开始", "开赛后，这里将显示 12 个小组的赛程、比分和出线形势。");
  if (state.view === "timeline") return renderTimelineView(filteredMatches);
  if (state.view === "groups") return renderGroupDetailView(state, groupOverview, standings);
  if (state.view === "qualification") return renderQualificationView(standings, thirdPlaceRanking, summary);
  if (state.view === "teams") return renderTeamGroupPathView(state, standings, matches);
  return renderGroupStageOverview(state, matches, filteredMatches, groupOverview, thirdPlaceRanking, summary);
}

function renderGroupStageOverview(state, matches, filteredMatches, groupOverview, thirdPlaceRanking, summary) {
  const filteredMode = state.filter !== "all" || state.group !== "all";
  const visibleGroups = state.group === "all" ? groupOverview : groupOverview.filter((group) => group.groupId === state.group);
  if (filteredMode) {
    return `
      ${renderGroupStageSection("筛选结果", `${groupStageFilterLabel(state.filter)} · ${state.group === "all" ? "全部小组" : groupStageGroupLabel(state.group)}`, renderGroupMatchCards(filteredMatches, "没有符合条件的小组赛"))}
      ${renderGroupStageSection("小组概览", "完整积分与出线状态", renderGroupOverviewGrid(visibleGroups))}
      ${renderThirdPlaceRanking(thirdPlaceRanking)}
    `;
  }
  const liveMatches = getLiveMatches(matches);
  const todayMatches = getTodayMatches(matches);
  return `
    ${liveMatches.length ? renderGroupStageSection("直播中的小组赛", "实时比分优先展示", renderGroupMatchCards(liveMatches)) : ""}
    ${renderGroupStageSection("今日小组赛", "按当前日期筛选", renderGroupMatchCards(todayMatches, "今日暂无小组赛"))}
    ${renderGroupStageSection("小组总览", "A-L 组完整积分与出线状态", renderGroupOverviewGrid(visibleGroups))}
    ${renderThirdPlaceRanking(thirdPlaceRanking)}
    ${renderQualificationMini(summary)}
  `;
}

function groupStageFilterLabel(filter) {
  return groupStageFilters.find((item) => item.key === filter)?.label || "全部";
}

function renderGroupStageSection(title, subtitle, body) {
  return `
    <section class="group-stage-section">
      <header>
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </header>
      ${body}
    </section>
  `;
}

function renderGroupOverviewGrid(groups = []) {
  if (!groups.length) return renderGroupStageEmpty("该小组赛程暂未生成", "赛程确认后会显示完整对阵。");
  return `<div class="group-overview-grid group-standings-grid">${groups.map(renderGroupOverviewCard).join("")}</div>`;
}

const groupStageCardColors = ["#0f8b5f", "#2563eb", "#c2410c", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f", "#b45309", "#4338ca", "#047857", "#a21caf", "#0369a1"];

function renderGroupOverviewCard(group, index = 0) {
  const nextLine = group.nextMatch ? `${group.nextMatch.homeTeam.name} vs ${group.nextMatch.awayTeam.name}` : group.complete ? "小组赛已完成" : "对阵待确认";
  return `
    <article class="group-card group-overview-card group-stage-standings-card" style="--group-color: ${groupStageCardColors[index % groupStageCardColors.length]}">
      <div class="group-card-head">
        <span class="group-chip">${escapeHtml(group.label)}</span>
        <span class="group-stage-progress-pill ${group.complete ? "complete" : ""}">${group.complete ? "已完成" : "进行中"} · ${group.played}/${group.total || 6}</span>
      </div>
      ${renderGroupStandingsTable(group.rows || [])}
      <p class="group-card-note"><strong>下一场：</strong>${escapeHtml(nextLine)}</p>
      <p class="group-card-note"><strong>出线形势：</strong>${escapeHtml(group.story)}</p>
      <div class="group-card-actions">
        <a href="${groupStageHref({ view: "groups", filter: "all", group: group.groupId })}">查看${escapeHtml(group.label)}</a>
      </div>
    </article>
  `;
}

function renderGroupStandingsTable(rows = []) {
  if (!rows.length) return `<div class="group-stage-empty compact">排名待确认</div>`;
  return `
    <div class="standings-table group-stage-standings-table">
      <div class="standing-row standing-row-head group-stage-standing-row">
        <span>排名</span><span>球队</span><span>赛</span><span>胜</span><span>平</span><span>负</span><span>净</span><span>分</span><span>状态</span>
      </div>
      ${rows.map(renderGroupStandingOverviewRow).join("")}
    </div>
  `;
}

function renderGroupStandingOverviewRow(row) {
  const display = groupStageQualificationDisplay(row);
  return `
    <a class="standing-row group-stage-standing-row zone-${escapeHtml(display.zone)} status-${escapeHtml(row.qualificationStatus || "unknown")}" href="${hashHref(`/teams/${row.team.id}`)}">
      <span class="rank">${row.rank}</span>
      <span class="standing-team">${teamLogo(row.team, "team-logo small")} <strong>${escapeHtml(row.team.name)}</strong></span>
      <span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${formatSignedNumber(row.goalDifference)}</span><span><strong>${row.points}</strong></span>
      <span><em class="zone-badge group-stage-zone-badge ${escapeHtml(display.badgeClass)}">${escapeHtml(display.label)}</em></span>
    </a>
  `;
}

function groupStageQualificationDisplay(row) {
  const status = row.qualificationStatus || "unknown";
  if (["qualified", "qualified-third", "advancing"].includes(status)) {
    return { zone: "qualify", badgeClass: "qualified", label: "已出线" };
  }
  if (status === "eliminated") return { zone: "outside", badgeClass: "eliminated", label: "已出局" };
  if (["danger", "third"].includes(status)) return { zone: "pending", badgeClass: "danger", label: "危险" };
  return { zone: "outside", badgeClass: "unknown", label: row.qualificationLabel || "待确认" };
}

function formatSignedNumber(value) {
  const number = numberOr(value, 0);
  return number > 0 ? `+${number}` : String(number);
}

function renderGroupStandingMiniRow(row) {
  return `
    <a class="group-standing-row status-${escapeHtml(row.qualificationStatus)}" href="${hashHref(`/teams/${row.team.id}`)}">
      <span class="rank">${row.rank}</span>
      ${teamLogo(row.team, "team-logo small")}
      <strong>${escapeHtml(teamCompactName(row.team))}</strong>
      <span>${row.points}分</span>
      ${renderQualificationBadge(row)}
    </a>
  `;
}

function renderQualificationBadge(row) {
  return `<em class="qualification-badge ${escapeHtml(row.qualificationStatus || "unknown")}">${escapeHtml(row.qualificationLabel || "待确认")}</em>`;
}

function renderGroupMatchCards(matches = [], emptyText = "暂无小组赛") {
  if (!matches.length) return renderGroupStageEmpty(emptyText, "试试切换小组、日期或比赛状态。");
  return `<div class="group-match-list">${matches.map(renderGroupMatchCard).join("")}</div>`;
}

function renderGroupMatchCard(match) {
  const score = getMatchScore(match);
  const venue = venueCityStadiumDisplay(match.venue, "城市与球场待确认");
  const impact = getGroupStageImpactText(match);
  const homeWinner = match.status === "finished" && match.score?.home > match.score?.away;
  const awayWinner = match.status === "finished" && match.score?.away > match.score?.home;
  return `
    <article class="group-match-card ${escapeHtml(match.status)}">
      <a href="${matchDetailHref(match.id)}">
        <header>
          <span>${escapeHtml(match.groupLabel)} · ${escapeHtml(match.roundLabel || getMatchRoundLabel(match))}</span>
          ${renderGroupStageStatusBadge(match)}
        </header>
        <p class="group-match-time">${escapeHtml(formatGroupStageKickoff(match.kickoffAt))} · ${escapeHtml(venue)}</p>
        <div class="group-match-teams">
          ${renderGroupMatchTeamRow(match.homeTeam, match.score?.home, homeWinner, awayWinner)}
          ${renderGroupMatchTeamRow(match.awayTeam, match.score?.away, awayWinner, homeWinner)}
        </div>
        <p class="group-match-impact">${escapeHtml(impact)}</p>
        <div class="group-match-actions">
          <span>数据</span>
          <span>小组积分</span>
        </div>
      </a>
    </article>
  `;
}

function renderGroupMatchTeamRow(team, score, isWinner, isLoser) {
  const scoreTextValue = score === null || score === undefined ? "-" : score;
  return `
    <div class="group-match-team ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""}">
      ${teamLogo(team, "team-logo small")}
      <strong>${escapeHtml(teamDisplayName(team, "待定球队"))}</strong>
      <small>${escapeHtml(teamDisplayCode(team))}</small>
      <b>${escapeHtml(scoreTextValue)}</b>
    </div>
  `;
}

function renderGroupStageStatusBadge(match) {
  const label = match.status === "live" && match.currentMinute ? `${match.currentMinute}' 直播中` : groupStageStatusLabels[match.status] || "待确认";
  return `<em class="group-stage-status ${escapeHtml(match.status)}">${match.status === "live" ? `<i></i>` : ""}${escapeHtml(label)}</em>`;
}

function getGroupStageImpactText(match) {
  if (match.status === "live") return `实时影响：${match.groupLabel}排名待更新`;
  if (match.status === "finished") return `结果已计入${match.groupLabel}排名`;
  if (match.status === "scheduled") return `胜负将影响${match.groupLabel}排名`;
  return "出线形势待确认";
}

function renderTimelineView(matches = []) {
  const byDate = groupStageMatchesByDate(matches);
  const keys = Object.keys(byDate);
  if (!keys.length) return renderGroupStageEmpty("没有符合条件的小组赛", "试试切换小组、日期或比赛状态。");
  return keys
    .map((key) => renderGroupStageSection(groupStageDateTitle(key), `${byDate[key].length} 场`, renderGroupMatchCards(byDate[key])))
    .join("");
}

function renderGroupDetailView(state, groupOverview = []) {
  const groups = state.group === "all" ? groupOverview : groupOverview.filter((group) => group.groupId === state.group);
  if (!groups.length) return renderGroupStageEmpty("当前小组无数据", "该小组赛程暂未生成。");
  if (state.group === "all") return renderGroupStageSection("分组概览", "选择 A-L 组查看详情", renderGroupOverviewGrid(groups));
  return groups
    .map(
      (group) => `
        <section class="group-detail-card">
          <header>
            <div>
              <h2>${escapeHtml(group.label)}详情</h2>
              <p>${escapeHtml(group.story)}</p>
            </div>
            <a href="${groupStageHref({ view: "overview", filter: "all", group: group.groupId })}">小组总览</a>
          </header>
          <div class="group-detail-standings">${(group.rows || []).map(renderGroupStandingMiniRow).join("")}</div>
          ${renderMatchesByMatchday(group.matches)}
        </section>
      `
    )
    .join("");
}

function renderMatchesByMatchday(matches = []) {
  const byRound = sortGroupStageMatches(matches).reduce((groups, match) => {
    const key = match.matchday || 0;
    if (!groups[key]) groups[key] = [];
    groups[key].push(match);
    return groups;
  }, {});
  return Object.keys(byRound)
    .sort((a, b) => Number(a) - Number(b))
    .map((round) => renderGroupStageSection(round === "0" ? "轮次待确认" : `第 ${round} 轮`, `${byRound[round].length} 场`, renderGroupMatchCards(byRound[round])))
    .join("");
}

function renderThirdPlaceRanking(thirdPlaceRanking = []) {
  if (!thirdPlaceRanking.length) return renderGroupStageSection("最佳第三名", "前 8 名晋级 32 强", renderGroupStageEmpty("第三名榜待确认", "小组排名生成后会自动更新。"));
  return `
    <section class="third-place-ranking">
      <header>
        <div>
          <h2>最佳第三名</h2>
          <p>前 8 名晋级 32 强</p>
        </div>
      </header>
      <div class="third-place-list">
        ${thirdPlaceRanking
          .map(
            (row, index) => `
              ${index === 8 ? `<div class="third-place-line"><span>晋级线</span></div>` : ""}
              <a class="third-place-row ${index < 8 ? "advancing" : "danger"}" href="${hashHref(`/teams/${row.team.id}`)}">
                <span class="rank">${row.thirdPlaceRank}</span>
                ${teamLogo(row.team, "team-logo small")}
                <strong>${escapeHtml(teamCompactName(row.team))}</strong>
                <small>${escapeHtml(row.groupLabel)}</small>
                <span>${row.points}分</span>
                <span>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</span>
                <em>${index < 8 ? "晋级区" : "危险"}</em>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderQualificationMini(summary) {
  return `
    <section class="qualification-mini">
      <span><strong>${summary.qualified}</strong><small>已出线</small></span>
      <span><strong>${summary.suspense}</strong><small>仍需确认</small></span>
      <span><strong>${summary.eliminated}</strong><small>已出局</small></span>
      <p>出线结论优先使用当前积分与小组完成状态；复杂同分规则未确认时保持保守显示。</p>
    </section>
  `;
}

function renderQualificationView(standings = {}, thirdPlaceRanking = [], summary = {}) {
  const rows = Object.values(standings).flat();
  const qualified = rows.filter((row) => ["qualified", "qualified-third"].includes(row.qualificationStatus));
  const alive = rows.filter((row) => ["advancing", "third", "danger", "unknown"].includes(row.qualificationStatus));
  const eliminated = rows.filter((row) => row.qualificationStatus === "eliminated");
  return `
    ${renderQualificationMini(summary)}
    ${renderQualificationTeamBucket("已出线球队", "小组前二与最佳第三名区", qualified)}
    ${renderQualificationTeamBucket("仍需关注", "同分或第三名比较保持保守展示", alive)}
    ${renderQualificationTeamBucket("已出局球队", "灰色弱化但保留可读信息", eliminated)}
    ${renderThirdPlaceRanking(thirdPlaceRanking)}
  `;
}

function renderQualificationTeamBucket(title, subtitle, rows = []) {
  return renderGroupStageSection(
    title,
    subtitle,
    rows.length
      ? `<div class="qualification-team-grid">${rows
          .map(
            (row) => `
              <a class="qualification-team status-${escapeHtml(row.qualificationStatus)}" href="${hashHref(`/teams/${row.team.id}`)}">
                ${teamLogo(row.team, "team-logo small")}
                <strong>${escapeHtml(teamCompactName(row.team))}</strong>
                <small>${escapeHtml(row.groupLabel)} · ${row.points}分</small>
                ${renderQualificationBadge(row)}
              </a>
            `
          )
          .join("")}</div>`
      : renderGroupStageEmpty("暂无球队", "后续赛果确认后会自动更新。")
  );
}

function groupStageTeamRows(standings = {}) {
  return Object.values(standings)
    .flat()
    .sort((a, b) => a.groupId.localeCompare(b.groupId) || a.rank - b.rank);
}

function renderTeamGroupPathView(state, standings = {}, matches = []) {
  const teams = groupStageTeamRows(standings);
  const query = state.q.trim().toLowerCase();
  const selected = teams.find((row) => [groupStageTeamKey(row.team), row.team.code, row.team.name].includes(state.team));
  const filteredTeams = query
    ? teams.filter((row) => [row.team.name, row.team.code, row.groupLabel].some((value) => String(value || "").toLowerCase().includes(query)))
    : teams;
  return `
    <section class="team-group-path">
      <form id="group-stage-team-search" class="team-group-search">
        <input name="q" value="${escapeHtml(state.q)}" placeholder="搜索球队，查看小组赛路径" aria-label="搜索球队" />
        <button type="submit">搜索</button>
      </form>
      ${selected ? renderSelectedTeamPath(selected, matches, state) : renderTeamSelectionList(filteredTeams, state)}
    </section>
  `;
}

function renderTeamSelectionList(teams = [], state) {
  if (!teams.length) return renderGroupStageEmpty("未找到相关球队", "请尝试输入球队中文名或简称。");
  return `
    <section class="group-stage-section">
      <header>
        <div>
          <h2>选择球队</h2>
          <p>查看它的小组赛赛程和出线形势</p>
        </div>
      </header>
      <div class="team-path-list">
        ${teams
          .map(
            (row) => `
              <a href="${groupStageHref(state, { view: "teams", team: groupStageTeamKey(row.team) })}">
                ${teamLogo(row.team, "team-logo small")}
                <strong>${escapeHtml(row.team.name)}</strong>
                <span>${escapeHtml(row.groupLabel)}第${row.rank} · ${row.points}分</span>
                ${renderQualificationBadge(row)}
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSelectedTeamPath(row, matches = [], state) {
  const teamKey = groupStageTeamKey(row.team);
  const teamMatches = sortGroupStageMatches(
    matches.filter((match) => [groupStageTeamKey(match.homeTeam), groupStageTeamKey(match.awayTeam), match.homeTeam.code, match.awayTeam.code].includes(teamKey))
  );
  return `
    <section class="selected-team-path">
      <header>
        ${teamLogo(row.team, "team-logo")}
        <div>
          <h2>${escapeHtml(row.team.name)}</h2>
          <p>${escapeHtml(row.groupLabel)}第 ${row.rank} · ${row.points}分</p>
          ${renderQualificationBadge(row)}
        </div>
        <a href="${groupStageHref(state, { team: "", q: "" })}">重选</a>
      </header>
      <p class="team-path-note">出线形势：${escapeHtml(row.qualificationLabel || "待确认")}，仍需结合完整积分规则复核。</p>
      ${renderGroupStageSection("小组赛路径", `${teamMatches.length} 场`, renderTeamPathMatches(teamMatches, row.team))}
      <div class="group-card-actions"><a href="${groupStageHref({ view: "overview", filter: "all", group: row.groupId })}">查看小组总览</a></div>
    </section>
  `;
}

function renderTeamPathMatches(matches = [], team = {}) {
  if (!matches.length) return renderGroupStageEmpty("该球队暂无小组赛路径", "对阵确认后更新。");
  const selectedKey = groupStageTeamKey(team);
  return `<div class="team-path-matches">${matches
    .map((match) => {
      const isHome = groupStageTeamKey(match.homeTeam) === selectedKey || match.homeTeam.code === selectedKey;
      const opponent = isHome ? match.awayTeam : match.homeTeam;
      const score = getMatchScore(match);
      return `
        <a href="${matchDetailHref(match.id)}">
          <span>${escapeHtml(match.roundLabel || getMatchRoundLabel(match))}</span>
          <strong>vs ${escapeHtml(opponent.name)}</strong>
          <em>${match.status === "finished" ? escapeHtml(score) : escapeHtml(formatGroupStageKickoff(match.kickoffAt))}</em>
        </a>
      `;
    })
    .join("")}</div>`;
}

function renderGroupStageEmpty(title, detail) {
  return `
    <div class="group-stage-empty">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail || "")}</span>
    </div>
  `;
}

function renderGroupStageError(error) {
  return `
    <section class="group-stage-page">
      <div class="group-stage-error">
        <strong>小组赛数据加载失败</strong>
        <span>${escapeHtml(error?.message || "请稍后重试")}</span>
      </div>
    </section>
  `;
}

function initGroupStageInteractions(state) {
  const form = document.getElementById("group-stage-team-search");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      location.hash = groupStageHref(state, { view: "teams", q: String(formData.get("q") || "").trim(), team: "" });
    });
  }
  const groupSelect = document.querySelector("[data-group-stage-select]");
  if (groupSelect) {
    groupSelect.addEventListener("change", () => {
      location.hash = groupStageHref(state, { group: groupSelect.value || "all" });
    });
  }
}

const knockoutRoundConfigs = [
  { key: "r32", code: "R32", label: "32强", shortLabel: "32强", nextLabel: "16强", stage: "Round of 32", emptyCount: 16 },
  { key: "r16", code: "R16", label: "16强", shortLabel: "16强", nextLabel: "8强", stage: "Round of 16", emptyCount: 8 },
  { key: "qf", code: "QF", label: "1/4决赛", shortLabel: "8强", nextLabel: "半决赛", stage: "Quarter-final", emptyCount: 4 },
  { key: "sf", code: "SF", label: "半决赛", shortLabel: "4强", nextLabel: "决赛", stage: "Semi-final", emptyCount: 2 },
  { key: "third", code: "THIRD_PLACE", label: "三四名决赛", shortLabel: "三四名", nextLabel: "名次确认", stage: "Play-off for third place", emptyCount: 1 },
  { key: "final", code: "FINAL", label: "决赛", shortLabel: "决赛", nextLabel: "冠军", stage: "Final", emptyCount: 1 },
];

const knockoutBracketLayout = {
  left: {
    r32Pairs: [
      ["GER", "PAR"],
      ["FRA", "SWE"],
      ["RSA", "CAN"],
      ["NED", "MAR"],
      ["POR", "CRO"],
      ["ESP", "AUT"],
      ["USA", "BIH"],
      ["BEL", "SEN"],
    ],
    r16: [89, 90, 93, 94],
    qf: [97, 98],
    sf: [101],
  },
  right: {
    r32Pairs: [
      ["BRA", "JPN"],
      ["CIV", "NOR"],
      ["MEX", "ECU"],
      ["ENG", "COD"],
      ["ARG", "CPV"],
      ["AUS", "EGY"],
      ["SUI", "ALG"],
      ["COL", "GHA"],
    ],
    r16: [91, 92, 95, 96],
    qf: [99, 100],
    sf: [102],
  },
};

const knockoutHalfConfigs = [
  { key: "left", label: "左半区", note: "胜者进入左半区晋级路径" },
  { key: "right", label: "右半区", note: "胜者进入右半区晋级路径" },
];

const knockoutHalfMatchNumbers = {
  left: {
    r32: [73, 74, 75, 77, 81, 82, 83, 84],
    r16: [89, 90, 93, 94],
    qf: [97, 98],
    sf: [101],
  },
  right: {
    r32: [76, 78, 79, 80, 85, 86, 87, 88],
    r16: [91, 92, 95, 96],
    qf: [99, 100],
    sf: [102],
  },
};

const knockoutFallbackMatchNumbers = {
  fifa_match_400021518: 73,
  fifa_match_400021513: 74,
  fifa_match_400021522: 75,
  fifa_match_400021516: 76,
  fifa_match_400021523: 77,
  fifa_match_400021514: 78,
  fifa_match_400021520: 79,
  fifa_match_400021512: 80,
  fifa_match_400021524: 81,
  fifa_match_400021525: 82,
  fifa_match_400021526: 83,
  fifa_match_400021519: 84,
  fifa_match_400021527: 85,
  fifa_match_400021521: 86,
  fifa_match_400021517: 87,
  fifa_match_400021515: 88,
  fifa_match_400021533: 89,
  fifa_match_400021530: 90,
  fifa_match_400021532: 91,
  fifa_match_400021531: 92,
  fifa_match_400021529: 93,
  fifa_match_400021534: 94,
  fifa_match_400021528: 95,
  fifa_match_400021535: 96,
  fifa_match_400021536: 97,
  fifa_match_400021538: 98,
  fifa_match_400021539: 99,
  fifa_match_400021537: 100,
  fifa_match_400021541: 101,
  fifa_match_400021540: 102,
  fifa_match_400021542: 103,
  fifa_match_400021543: 104,
};

const knockoutProgressionSlots = [
  { target: 90, home: 73, away: 75 },
  { target: 89, home: 74, away: 77 },
  { target: 91, home: 76, away: 78 },
  { target: 92, home: 79, away: 80 },
  { target: 93, home: 83, away: 84 },
  { target: 94, home: 81, away: 82 },
  { target: 95, home: 86, away: 88 },
  { target: 96, home: 85, away: 87 },
  { target: 97, home: 89, away: 90 },
  { target: 98, home: 93, away: 94 },
  { target: 99, home: 91, away: 92 },
  { target: 100, home: 95, away: 96 },
  { target: 101, home: 97, away: 98 },
  { target: 102, home: 99, away: 100 },
  { target: 103, homeLoser: 101, awayLoser: 102 },
  { target: 104, home: 101, away: 102 },
];

const knockoutRealtimeWinnerCodes = {
  79: "MEX",
  82: "BEL",
};

function knockoutRoundKey(match) {
  const name = String(match?.stage?.name || "").toLowerCase();
  if (name.includes("round of 32") || name.includes("32")) return "r32";
  if (name.includes("round of 16") || name.includes("16")) return "r16";
  if (name.includes("quarter")) return "qf";
  if (name.includes("semi")) return "sf";
  if (name.includes("third")) return "third";
  if (name === "final" || name.includes("final")) return "final";
  return "";
}

function knockoutSort(a, b) {
  return (new Date(a.kickoffAt || 0).getTime() || 0) - (new Date(b.kickoffAt || 0).getTime() || 0);
}

function groupedKnockoutRounds(matches) {
  const rounds = Object.fromEntries(knockoutRoundConfigs.map((round) => [round.key, []]));
  (matches || []).forEach((match) => {
    const key = knockoutRoundKey(match);
    if (key) rounds[key].push(match);
  });
  Object.values(rounds).forEach((items) => items.sort(knockoutSort));
  return rounds;
}

function matchNumber(match) {
  const official = Number(match?.matchNumber);
  if (Number.isFinite(official) && official > 0) return official;
  return knockoutFallbackMatchNumbers[match?.id] || 0;
}

function matchesByOfficialNumbers(matches, numbers) {
  const byNumber = new Map((matches || []).map((match) => [matchNumber(match), match]));
  return numbers.map((number) => byNumber.get(number)).filter(Boolean);
}

function teamCode(team) {
  return String(team?.code || "").toUpperCase();
}

function matchMatchesTeamPair(match, pair) {
  const expected = pair.map((code) => String(code || "").toUpperCase());
  return teamCode(match?.homeTeam) === expected[0] && teamCode(match?.awayTeam) === expected[1];
}

function matchesByTeamPairs(matches, pairs) {
  return pairs.map((pair) => (matches || []).find((match) => matchMatchesTeamPair(match, pair))).filter(Boolean);
}

function knockoutMatchHalf(match) {
  const round = getRoundFromMatch(match);
  const number = Number(match?.matchNo || matchNumber(match?.raw || match));
  if (round === "r32") {
    const pairMatcher = (pair) => {
      const expected = pair.map((code) => String(code || "").toUpperCase());
      return teamCode(match?.homeTeam) === expected[0] && teamCode(match?.awayTeam) === expected[1];
    };
    if (knockoutBracketLayout.left.r32Pairs.some(pairMatcher)) return "left";
    if (knockoutBracketLayout.right.r32Pairs.some(pairMatcher)) return "right";
  }
  if (Number.isFinite(number)) {
    if ((knockoutHalfMatchNumbers.left[round] || []).includes(number)) return "left";
    if ((knockoutHalfMatchNumbers.right[round] || []).includes(number)) return "right";
  }
  return "";
}

function buildKnockoutHalves(rounds) {
  return [
    {
      key: "left",
      label: "左半区",
      accent: "#0f8b5f",
      r32: matchesByTeamPairs(rounds.r32, knockoutBracketLayout.left.r32Pairs),
      r16: matchesByOfficialNumbers(rounds.r16, knockoutBracketLayout.left.r16),
      qf: matchesByOfficialNumbers(rounds.qf, knockoutBracketLayout.left.qf),
      sf: matchesByOfficialNumbers(rounds.sf, knockoutBracketLayout.left.sf),
    },
    {
      key: "right",
      label: "右半区",
      accent: "#2563eb",
      r32: matchesByTeamPairs(rounds.r32, knockoutBracketLayout.right.r32Pairs),
      r16: matchesByOfficialNumbers(rounds.r16, knockoutBracketLayout.right.r16),
      qf: matchesByOfficialNumbers(rounds.qf, knockoutBracketLayout.right.qf),
      sf: matchesByOfficialNumbers(rounds.sf, knockoutBracketLayout.right.sf),
    },
  ];
}

async function renderKnockoutPage() {
  try {
    const [data, predictions] = await Promise.all([
      api("/matches?pageSize=120&competition=world-cup-2026"),
      api("/predictions/knockout"),
    ]);
    const { params } = routeInfo();
    const matches = normalizeKnockoutMatches(data.items, predictions.items);
    const currentRound = getCurrentKnockoutRound(matches);
    const round = normalizeKnockoutRoundParam(params.get("round")) || currentRound || "r32";
    const view = normalizeKnockoutViewParam(params.get("view"));
    const filter = normalizeKnockoutFilterParam(params.get("filter"));
    const half = normalizeKnockoutHalfParam(params.get("half"));
    const selectedTeamId = params.get("team") || "";
    setActiveMatchReturnTarget(hashHref("/knockout", {
      round,
      view,
      filter,
      half: roundHasHalfSwitch(round) ? half : "",
      team: view === "path" ? selectedTeamId : "",
    }));
    app.innerHTML = renderKnockoutPageShell({
      matches,
      predictions,
      round,
      view,
      filter,
      half,
      selectedTeamId,
      currentRound,
    });
    scheduleKnockoutRefresh(predictions);
  } catch (error) {
    app.innerHTML = renderKnockoutErrorState(error);
  }
}

const knockoutViewModes = [
  { key: "schedule", label: "赛程" },
  { key: "bracket", label: "晋级图" },
  { key: "path", label: "球队路径" },
];

const knockoutFilterChips = [
  { key: "all", label: "全部" },
  { key: "today", label: "今日" },
  { key: "live", label: "直播中" },
  { key: "finished", label: "已结束" },
];

const knockoutHalfFilterChips = [
  { key: "left", label: "左半区" },
  { key: "right", label: "右半区" },
];

const knockoutStatusMeta = {
  scheduled: { label: "未开始", tone: "scheduled" },
  live: { label: "直播中", tone: "live" },
  extra_time: { label: "加时赛", tone: "live" },
  penalties: { label: "点球大战", tone: "live" },
  finished: { label: "已结束", tone: "finished" },
  postponed: { label: "延期", tone: "postponed" },
  unknown: { label: "待确认", tone: "unknown" },
};

function knockoutRoundConfig(key) {
  return knockoutRoundConfigs.find((round) => round.key === key) || knockoutRoundConfigs[0];
}

function normalizeKnockoutRoundParam(value) {
  return knockoutRoundConfigs.some((round) => round.key === value) ? value : "";
}

function normalizeKnockoutViewParam(value) {
  return knockoutViewModes.some((mode) => mode.key === value) ? value : "schedule";
}

function normalizeKnockoutFilterParam(value) {
  return knockoutFilterChips.some((chip) => chip.key === value) ? value : "all";
}

function normalizeKnockoutHalfParam(value) {
  return knockoutHalfFilterChips.some((chip) => chip.key === value) ? value : "left";
}

function knockoutHref(next = {}) {
  const { params } = routeInfo();
  const merged = Object.fromEntries(params.entries());
  Object.entries(next).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") delete merged[key];
    else merged[key] = value;
  });
  return hashHref("/knockout", merged);
}

function getRoundFromMatch(match) {
  const name = String(match?.stage?.name || match?.roundLabel || match?.round || "").toLowerCase();
  if (match?.roundKey && knockoutRoundConfigs.some((round) => round.key === match.roundKey)) return match.roundKey;
  if (name.includes("round of 32") || name.includes("32")) return "r32";
  if (name.includes("round of 16") || name.includes("16")) return "r16";
  if (name.includes("quarter") || name.includes("1/4") || name.includes("8强")) return "qf";
  if (name.includes("semi") || name.includes("半决赛") || name.includes("4强")) return "sf";
  if (name.includes("third") || name.includes("三四")) return "third";
  if (name === "final" || name.includes("final") || name.includes("决赛")) return "final";
  return "";
}

function getMatchStatus(match) {
  const raw = String(match?.status || "").toLowerCase();
  const detail = String(match?.statusDetail || match?.officialResult?.winMethod || match?.winMethod || "").toLowerCase();
  if (raw === "postponed" || detail.includes("延期")) return "postponed";
  if (raw === "live") {
    if (detail.includes("pen") || detail.includes("点球")) return "penalties";
    if (detail.includes("extra") || detail.includes("加时")) return "extra_time";
    return "live";
  }
  if (raw === "ft" || raw === "finished" || detail.includes("完场") || detail.includes("全场")) return "finished";
  if (raw === "scheduled" || raw === "pre" || raw === "notstarted" || detail.includes("未开始")) return "scheduled";
  return raw ? "unknown" : "scheduled";
}

function knockoutScoreValue(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function normalizeKnockoutTeam(team, fallbackName) {
  const name = teamDisplayName(team, fallbackName || "待定球队");
  return {
    id: team?.id || "",
    slug: team?.slug || "",
    name,
    shortName: teamCompactName(team, name),
    code: team?.code || "",
    flagEmoji: team?.flagEmoji || "",
    flagUrl: team?.flagUrl || team?.logoUrl || "",
    logoUrl: team?.logoUrl || team?.flagUrl || "",
  };
}

function normalizeTeamKey(team) {
  const raw = typeof team === "string"
    ? team
    : team?.id || team?.code || team?.fifaCode || team?.shortName || team?.name || team?.cnName || "";
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
}

function teamKeyVariants(team) {
  if (!team) return [];
  const values = typeof team === "string"
    ? [team]
    : [team.id, team.code, team.fifaCode, team.shortName, team.name, team.cnName].filter(Boolean);
  return [...new Set(values.map(normalizeTeamKey).filter(Boolean))];
}

function buildTeamStatsMap(rawStats = []) {
  const map = new Map();
  (rawStats || []).forEach((item) => {
    const match = item.match || {};
    const teamStats = item.teamStats || {};
    [
      { team: match.homeTeam, stats: teamStats.home },
      { team: match.awayTeam, stats: teamStats.away },
    ].forEach(({ team, stats }) => {
      if (!team || !stats) return;
      teamKeyVariants(team).forEach((key) => map.set(key, stats));
    });
  });
  return map;
}

function getPenaltyPayload(match, prediction) {
  const result = prediction?.officialResult || {};
  const shootout = result.penaltyShootout || match?.penaltyShootout || null;
  if (shootout) {
    return {
      home: knockoutScoreValue(shootout.home),
      away: knockoutScoreValue(shootout.away),
      label: shootout.label || result.penaltyLabel || `点球 ${shootout.home ?? "-"}-${shootout.away ?? "-"}`,
    };
  }
  const aggregate = match?.aggregateScore || {};
  if ((match?.statusDetail || "").includes("点球") && aggregate.home !== null && aggregate.home !== undefined && aggregate.away !== null && aggregate.away !== undefined) {
    return {
      home: knockoutScoreValue(aggregate.home),
      away: knockoutScoreValue(aggregate.away),
      label: `点球 ${aggregate.home}-${aggregate.away}`,
    };
  }
  return null;
}

function getWinner(match) {
  if (!match) return null;
  if (getMatchStatus(match) !== "finished") return null;
  if (match.winnerTeamId) return match.winnerTeamId;
  if (match.actualWinnerTeamId) return match.actualWinnerTeamId;
  if (match.officialResult?.winnerTeamId) return match.officialResult.winnerTeamId;
  const home = knockoutScoreValue(match.homeScore ?? match.score?.home ?? match.officialResult?.home);
  const away = knockoutScoreValue(match.awayScore ?? match.score?.away ?? match.officialResult?.away);
  if (home !== null && away !== null && home !== away) return home > away ? match.homeTeam?.id : match.awayTeam?.id;
  const penalty = match.penaltyShootout || match.officialResult?.penaltyShootout || match.penalty;
  if (penalty?.home !== undefined && penalty?.away !== undefined && penalty.home !== penalty.away) {
    return Number(penalty.home) > Number(penalty.away) ? match.homeTeam?.id : match.awayTeam?.id;
  }
  return null;
}

function predictionUnavailableText(item) {
  if (!item) return "预测待定";
  return item.reason || item.rationale?.[0] || (item.predictionStatus === "waiting_teams" ? "对阵确认后生成预测" : "预测待定");
}

function isPredictionDebugEnabled() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) || new URLSearchParams(window.location.search).get("debugPredictions") === "1";
}

function logKnockoutPredictionInputs(matches = [], predictionItems = []) {
  if (!isPredictionDebugEnabled() || !console?.table) return;
  const teamStatsMap = buildTeamStatsMap(predictionItems);
  const rows = matches
    .filter((match) => match.prediction)
    .map((match) => {
      const prediction = match.prediction || {};
      const homeKey = normalizeTeamKey(match.homeTeam);
      const awayKey = normalizeTeamKey(match.awayTeam);
      const homeStats = prediction.teamStats?.home || teamStatsMap.get(homeKey) || {};
      const awayStats = prediction.teamStats?.away || teamStatsMap.get(awayKey) || {};
      return {
        homeName: match.homeTeam?.name,
        awayName: match.awayTeam?.name,
        homeKey,
        awayKey,
        homeStatsFound: Boolean(homeStats.found),
        awayStatsFound: Boolean(awayStats.found),
        homeAttack: homeStats.attack ?? null,
        awayAttack: awayStats.attack ?? null,
        homeDefense: homeStats.defense ?? null,
        awayDefense: awayStats.defense ?? null,
        homeXG: prediction.expectedGoals?.home ?? null,
        awayXG: prediction.expectedGoals?.away ?? null,
        prediction: prediction.available === false ? predictionUnavailableText(prediction) : prediction.predictedScore?.label,
      };
    });
  if (rows.length) console.table(rows);
}

function normalizeKnockoutMatches(rawMatches = [], predictionItems = []) {
  const predictionsByMatch = new Map((predictionItems || []).map((item) => [item.match?.id || item.matchId, item]));
  const matches = sortKnockoutMatches(
    (rawMatches || [])
      .filter((match) => getRoundFromMatch(match))
      .map((match) => {
        const prediction = predictionsByMatch.get(match.id) || null;
        const result = prediction?.officialResult || {};
        const round = getRoundFromMatch(match);
        const roundConfig = knockoutRoundConfig(round);
        const status = getMatchStatus(match);
        const penalty = getPenaltyPayload(match, prediction);
        const homeScore = knockoutScoreValue(result.home ?? match.score?.home);
        const awayScore = knockoutScoreValue(result.away ?? match.score?.away);
        const homeTeam = normalizeKnockoutTeam(match.homeTeam, "主队待定");
        const awayTeam = normalizeKnockoutTeam(match.awayTeam, "客队待定");
        const winnerTeamId = getWinner({ ...match, officialResult: result, penaltyShootout: penalty });
        const winnerTeam = winnerTeamId === homeTeam.id ? homeTeam : winnerTeamId === awayTeam.id ? awayTeam : null;
        const loserTeam = winnerTeamId === homeTeam.id ? awayTeam : winnerTeamId === awayTeam.id ? homeTeam : null;
        const half = knockoutMatchHalf(match);
        return {
          id: String(match.id),
          round,
          half,
          roundCode: roundConfig.code,
          roundLabel: roundConfig.label,
          roundShortLabel: roundConfig.shortLabel,
          nextRoundLabel: roundConfig.nextLabel,
          roundOrder: knockoutRoundConfigs.findIndex((item) => item.key === round),
          matchNo: matchNumber(match) || match.matchNumber || "",
          status,
          statusLabel: knockoutStatusMeta[status]?.label || "待确认",
          kickoffTime: match.kickoffAt || "",
          kickoffTs: new Date(match.kickoffAt || 0).getTime() || 0,
          city: match.venue?.city || "",
          stadium: match.venue?.name || "",
          venueLine: venueCityStadiumDisplay(match.venue, "城市与球场待定"),
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          homePenaltyScore: penalty?.home ?? null,
          awayPenaltyScore: penalty?.away ?? null,
          penaltyLabel: penalty?.label || result.penaltyLabel || "",
          winnerTeamId: winnerTeamId || null,
          winnerTeam,
          loserTeamId: loserTeam?.id || null,
          nextMatchId: match.nextMatchId || prediction?.nextMatchId || null,
          raw: match,
          prediction,
        };
      })
  );
  const enriched = enrichKnockoutProgression(matches);
  logKnockoutPredictionInputs(enriched, predictionItems);
  return enriched;
}

function cloneKnockoutTeam(team) {
  return team ? { ...team } : team;
}

function realtimeWinnerTeam(match) {
  const expectedCode = knockoutRealtimeWinnerCodes[Number(match?.matchNo)];
  if (!expectedCode) return null;
  const code = String(expectedCode).toUpperCase();
  if (teamCode(match?.homeTeam) === code) return match.homeTeam;
  if (teamCode(match?.awayTeam) === code) return match.awayTeam;
  return null;
}

function realtimeLoserTeam(match) {
  const winner = realtimeWinnerTeam(match);
  if (!winner) return null;
  if (winner.id === match?.homeTeam?.id) return match.awayTeam;
  if (winner.id === match?.awayTeam?.id) return match.homeTeam;
  return null;
}

function sourceTeamForProgression(match, sideKey) {
  if (!match) return null;
  if (match.status !== "finished") return null;
  if (sideKey === "homeLoser" || sideKey === "awayLoser") {
    if (match.loserTeamId === match.homeTeam?.id) return match.homeTeam;
    if (match.loserTeamId === match.awayTeam?.id) return match.awayTeam;
    return realtimeLoserTeam(match);
  }
  if (match.winnerTeam) return match.winnerTeam;
  if (match.winnerTeamId === match.homeTeam?.id) return match.homeTeam;
  if (match.winnerTeamId === match.awayTeam?.id) return match.awayTeam;
  return realtimeWinnerTeam(match);
}

function sameKnockoutTeam(a, b) {
  if (!a || !b) return false;
  const aKeys = [a.id, a.code, a.name].filter(Boolean).map(normalizeTeamKey);
  const bKeys = new Set([b.id, b.code, b.name].filter(Boolean).map(normalizeTeamKey));
  return aKeys.some((key) => bKeys.has(key));
}

function applyProgressionSlot(match, side, team) {
  if (!match || !team || !isKnownTeam(team)) return match;
  const key = side === "home" ? "homeTeam" : "awayTeam";
  if (isKnownTeam(match[key]) && sameKnockoutTeam(match[key], team)) return match;
  return {
    ...match,
    [key]: cloneKnockoutTeam(team),
    derivedTeams: {
      ...(match.derivedTeams || {}),
      [side]: true,
    },
  };
}

function winnerProgressionSlot(matchNo) {
  const number = Number(matchNo);
  if (!number) return null;
  return knockoutProgressionSlots.find((slot) => Number(slot.home) === number || Number(slot.away) === number) || null;
}

function nextOpponentForWinner(match, byNumber) {
  const slot = winnerProgressionSlot(match?.matchNo);
  if (!slot) return null;
  const target = byNumber.get(Number(slot.target));
  if (!target) return null;
  const sourceSide = Number(slot.home) === Number(match.matchNo) ? "home" : "away";
  const ownTeam = sourceSide === "home" ? target.homeTeam : target.awayTeam;
  const opponentTeam = sourceSide === "home" ? target.awayTeam : target.homeTeam;
  if (match.winnerTeam && isKnownTeam(ownTeam) && !sameKnockoutTeam(ownTeam, match.winnerTeam)) return null;
  return {
    matchId: target.id,
    matchNo: target.matchNo,
    round: target.round,
    roundLabel: target.roundLabel,
    opponentTeam: isKnownTeam(opponentTeam) ? cloneKnockoutTeam(opponentTeam) : null,
  };
}

function enrichKnockoutProgression(matches = []) {
  const byNumber = new Map(matches.map((match) => [Number(match.matchNo), match]));
  knockoutProgressionSlots.forEach((slot) => {
    let target = byNumber.get(slot.target);
    if (!target) return;
    const homeSource = byNumber.get(slot.home || slot.homeLoser);
    const awaySource = byNumber.get(slot.away || slot.awayLoser);
    const homeTeam = sourceTeamForProgression(homeSource, slot.homeLoser ? "homeLoser" : "home");
    const awayTeam = sourceTeamForProgression(awaySource, slot.awayLoser ? "awayLoser" : "away");
    target = applyProgressionSlot(target, "home", homeTeam);
    target = applyProgressionSlot(target, "away", awayTeam);
    byNumber.set(slot.target, target);
  });
  const progressed = matches.map((match) => byNumber.get(Number(match.matchNo)) || match);
  return sortKnockoutMatches(
    progressed.map((match) => {
      const next = nextOpponentForWinner(match, byNumber);
      return next ? { ...match, nextMatch: next, nextOpponentTeam: next.opponentTeam } : match;
    })
  );
}

function sortKnockoutMatches(matches = []) {
  return [...matches].sort((a, b) => {
    const roundDelta = (a.roundOrder ?? 99) - (b.roundOrder ?? 99);
    if (roundDelta) return roundDelta;
    const timeDelta = (a.kickoffTs || 0) - (b.kickoffTs || 0);
    if (timeDelta) return timeDelta;
    return Number(a.matchNo || 0) - Number(b.matchNo || 0);
  });
}

function groupMatchesByDate(matches = []) {
  const groups = new Map();
  matches.forEach((match) => {
    const key = match.kickoffTime ? new Date(match.kickoffTime).toLocaleDateString("zh-CN") : "待定";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  });
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: knockoutDateGroupLabel(items[0]?.kickoffTime),
    items: sortKnockoutMatches(items),
  }));
}

function filterMatches(matches = [], filter = "all") {
  const todayKey = new Date().toLocaleDateString("zh-CN");
  return matches.filter((match) => {
    if (filter === "today") return match.kickoffTime && new Date(match.kickoffTime).toLocaleDateString("zh-CN") === todayKey;
    if (filter === "live") return ["live", "extra_time", "penalties"].includes(match.status);
    if (filter === "finished") return match.status === "finished";
    return true;
  });
}

function roundHasHalfSwitch(round) {
  return ["r32", "r16", "qf", "sf"].includes(round);
}

function filterMatchesByHalf(matches = [], round = "r32", half = "left") {
  if (!roundHasHalfSwitch(round)) return matches;
  return matches.filter((match) => match.half === half);
}

function knockoutHalfExpectedCount(round, half = "left") {
  if (!roundHasHalfSwitch(round)) return 0;
  return knockoutHalfMatchNumbers[half]?.[round]?.length || 0;
}

function getCurrentKnockoutRound(matches = []) {
  const sorted = sortKnockoutMatches(matches);
  const live = sorted.find((match) => ["live", "extra_time", "penalties"].includes(match.status));
  if (live) return live.round;
  const active = sorted.find((match) => match.status !== "finished" && match.status !== "postponed");
  if (active) return active.round;
  const latest = [...sorted].reverse().find((match) => match.status === "finished");
  return latest?.round || "r32";
}

function buildBracketColumns(matches = []) {
  const rounds = groupedKnockoutRounds(matches.map((match) => match.raw || match));
  return knockoutRoundConfigs
    .map((round) => ({
      ...round,
      matches: sortKnockoutMatches(matches.filter((match) => match.round === round.key)),
      legacyMatches: rounds[round.key] || [],
    }));
}

function visibleBracketColumns(columns = [], activeRound = "r32") {
  const activeColumn = columns.find((column) => column.key === activeRound);
  return activeColumn ? [activeColumn] : columns.slice(0, 1);
}

function bracketColumnCountLabel(column) {
  return column.matches.length ? `${column.matches.length} 场` : `${column.emptyCount} 席`;
}

const bracketPredictionRoundKeys = new Set(["qf", "sf", "final"]);

function buildTeamPath(matches = [], teamId = "") {
  const teamMatches = sortKnockoutMatches(matches.filter((match) => [match.homeTeam.id, match.awayTeam.id].includes(teamId)));
  const team = teamMatches[0]?.homeTeam.id === teamId ? teamMatches[0]?.homeTeam : teamMatches[0]?.awayTeam.id === teamId ? teamMatches[0]?.awayTeam : getKnockoutTeams(matches).find((item) => item.id === teamId);
  const eliminatedMatch = teamMatches.find((match) => match.status === "finished" && match.winnerTeamId && match.winnerTeamId !== teamId);
  const latestKnown = [...teamMatches].reverse().find(Boolean);
  const isAlive = Boolean(team) && !eliminatedMatch;
  const pathRounds = knockoutRoundConfigs.filter((round) => round.key !== "third");
  const latestRoundIndex = latestKnown ? pathRounds.findIndex((round) => round.key === latestKnown.round) : -1;
  const eliminatedRoundIndex = eliminatedMatch ? pathRounds.findIndex((round) => round.key === eliminatedMatch.round) : -1;
  const nodes = pathRounds.map((round, index) => {
    const match = teamMatches.find((item) => item.round === round.key);
    const afterElimination = eliminatedRoundIndex >= 0 && index > eliminatedRoundIndex;
    const beforeKnown = latestRoundIndex >= 0 && index < latestRoundIndex && !match;
    let state = "future";
    if (match?.status === "finished") state = match.winnerTeamId === teamId ? "completed" : "eliminated";
    else if (match) state = "current";
    else if (afterElimination) state = "disabled";
    else if (beforeKnown) state = "unknown";
    return {
      round,
      match: match || null,
      state,
      label: match ? knockoutMatchPairLabel(match) : afterElimination ? "已淘汰" : "对手待定",
    };
  });
  const latestIsCompletedWin = latestKnown?.status === "finished" && latestKnown?.winnerTeamId === teamId;
  const remaining = isAlive
    ? Math.max(0, latestRoundIndex >= 0 ? pathRounds.length - latestRoundIndex - (latestIsCompletedWin ? 1 : 0) : pathRounds.length)
    : 0;
  return {
    team,
    matches: teamMatches,
    nodes,
    isAlive,
    eliminatedRound: eliminatedMatch ? knockoutRoundConfig(eliminatedMatch.round) : null,
    remaining,
    statusText: team
      ? eliminatedMatch
        ? `止步 ${knockoutRoundConfig(eliminatedMatch.round).shortLabel}`
        : remaining === 0
          ? "已夺冠"
          : `距离冠军还差 ${remaining} 场`
      : "路径待确认",
  };
}

function getKnockoutTeams(matches = []) {
  const byId = new Map();
  matches.forEach((match) => {
    [match.homeTeam, match.awayTeam].forEach((team) => {
      if (team?.id && isKnownTeam(team)) byId.set(team.id, team);
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function knockoutPageSummary(matches = [], predictions = {}) {
  const todayKey = new Date().toLocaleDateString("zh-CN");
  const today = matches.filter((match) => match.kickoffTime && new Date(match.kickoffTime).toLocaleDateString("zh-CN") === todayKey).length;
  const live = matches.filter((match) => ["live", "extra_time", "penalties"].includes(match.status)).length;
  const finished = matches.filter((match) => match.status === "finished").length;
  const scheduled = matches.filter((match) => match.status === "scheduled").length;
  return {
    today,
    live,
    finished,
    scheduled,
    total: matches.length,
    predictionReady: predictions?.summary?.ready || 0,
    realtime: predictions?.summary?.realtime || {},
  };
}

function renderKnockoutPageShell({ matches, predictions, round, view, filter, half, selectedTeamId, currentRound }) {
  const summary = knockoutPageSummary(matches, predictions);
  const roundMatches = matches.filter((match) => match.round === round);
  const statusFilteredRoundMatches = filterMatches(roundMatches, filter);
  const filteredRoundMatches = filterMatchesByHalf(statusFilteredRoundMatches, round, half);
  return `
    <section class="knockout-page" data-knockout-view="${escapeHtml(view)}">
      ${renderKnockoutHero(matches, summary, currentRound)}
      ${renderRoundTabs(matches, round, currentRound)}
      ${renderKnockoutToolbar(view, filter, round, selectedTeamId)}
      <section class="knockout-content" aria-live="polite">
        ${view === "bracket"
          ? renderBracketView(statusFilteredRoundMatches, round, selectedTeamId, filter)
          : view === "path"
            ? renderTeamPathView(matches, selectedTeamId, round, filter)
            : renderScheduleView(filteredRoundMatches, round, filter, half, statusFilteredRoundMatches)}
      </section>
    </section>
  `;
}

function renderKnockoutHero(matches, summary, currentRound) {
  const round = knockoutRoundConfig(currentRound);
  const completedRounds = new Set(knockoutRoundConfigs
    .filter((item) => matches.some((match) => match.round === item.key) && matches.filter((match) => match.round === item.key).every((match) => match.status === "finished"))
    .map((item) => item.key));
  const subtitle = matches.length ? "单场淘汰 · 胜者晋级下一轮" : "淘汰赛尚未开始";
  const totalMatches = Math.max(Number(summary.total || 0), 1);
  const completedPercent = Math.round((Number(summary.finished || 0) / totalMatches) * 100);
  const roundDetail = currentRound === "third"
    ? "季军席位争夺"
    : currentRound === "final"
      ? "冠军归属之战"
      : `通往${round.nextLabel}`;
  const statusItems = [
    {
      key: "today",
      label: "今日",
      value: summary.today,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>',
    },
    {
      key: "live",
      label: "直播中",
      value: summary.live,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.2-5 4.1 10 2.2-5H21"/><circle cx="12" cy="12" r="9"/></svg>',
    },
    {
      key: "finished",
      label: "已结束",
      value: summary.finished,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>',
    },
    {
      key: "scheduled",
      label: "未开始",
      value: summary.scheduled,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    },
  ];
  const progressRounds = knockoutRoundConfigs.map((item) => ({
    ...item,
    progressLabel: item.key === "qf" ? "8强" : item.key === "third" ? "三四名决赛" : item.shortLabel,
  }));
  const currentProgressIndex = Math.max(0, progressRounds.findIndex((item) => item.key === currentRound));
  const progressFill = `${((currentProgressIndex / progressRounds.length) * 100).toFixed(4)}%`;
  const progressState = (key) => {
    const isActive = key === currentRound;
    const isDone = completedRounds.has(key);
    return {
      isActive,
      state: isActive ? "active" : isDone ? "done" : "future",
      label: isActive ? "当前轮次" : isDone ? "已完成" : "待进行",
    };
  };
  return `
    <section class="knockout-hero" aria-label="淘汰赛状态">
      <div class="knockout-hero-copy">
        <div class="knockout-hero-heading">
          <span class="knockout-kicker">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4m7-5h3v1a4 4 0 0 1-4 4M12 13v4m-4 3h8m-6-3h4"/></svg>
            <span>2026 · KNOCKOUT STAGE</span>
          </span>
          <h1>淘汰赛 <span>通往冠军</span></h1>
          <p><i aria-hidden="true"></i>${escapeHtml(subtitle)}</p>
        </div>
        <div class="knockout-current-round" aria-label="当前轮次 ${escapeHtml(round.label)}，已完成 ${escapeHtml(summary.finished)} 场，共 ${escapeHtml(summary.total)} 场">
          <div class="knockout-current-copy">
            <small><i aria-hidden="true"></i>当前轮次</small>
            <strong>${escapeHtml(round.label)}</strong>
            <span>${escapeHtml(roundDetail)}</span>
          </div>
          <div class="knockout-completion-ring" style="--ko-complete: ${escapeHtml(completedPercent)}%" aria-hidden="true">
            <b>${escapeHtml(completedPercent)}<small>%</small></b>
          </div>
        </div>
      </div>
      <div class="knockout-hero-stats" aria-label="比赛状态概览">
        ${statusItems.map((item) => `
          <article class="${escapeHtml(item.key)}">
            <i class="knockout-stat-icon">${item.icon}</i>
            <span><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}<em>场</em></strong></span>
          </article>
        `).join("")}
      </div>
      <div class="knockout-progress-panel">
        <div class="knockout-progress-meta">
          <span>赛事进程</span>
          <strong>${escapeHtml(summary.finished)}<small> / ${escapeHtml(summary.total)} 场完成</small></strong>
        </div>
        <div class="knockout-progress" style="--ko-progress-fill: ${escapeHtml(progressFill)}" aria-label="淘汰赛进度">
          ${progressRounds
          .map((item) => {
            const itemState = progressState(item.key);
            const finalPhase = ["third", "final"].includes(item.key) ? " final-phase" : "";
            return `<span ${itemState.isActive ? 'aria-current="step"' : ""} class="${itemState.state} ${escapeHtml(item.key)}${finalPhase}"><i></i><b>${escapeHtml(item.progressLabel)}</b><em>${escapeHtml(itemState.label)}</em></span>`;
          })
          .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderRoundTabs(matches, activeRound, currentRound) {
  return `
    <nav class="knockout-round-tabs" aria-label="淘汰赛轮次">
      ${knockoutRoundConfigs
        .map((round) => {
          const roundMatches = matches.filter((match) => match.round === round.key);
          const done = roundMatches.length && roundMatches.every((match) => match.status === "finished");
          const future = !roundMatches.length || knockoutRoundConfigs.findIndex((item) => item.key === round.key) > knockoutRoundConfigs.findIndex((item) => item.key === currentRound);
          const state = activeRound === round.key ? "active" : done ? "done" : future ? "future" : "ready";
          return `
            <a class="${state}" href="${knockoutHref({ round: round.key })}" aria-current="${activeRound === round.key ? "true" : "false"}">
              <strong>${escapeHtml(round.label)}</strong>
              <small>${done ? "完成" : roundMatches.length ? `${roundMatches.length}场` : "待定"}</small>
            </a>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderKnockoutToolbar(view, filter, round, selectedTeamId) {
  return `
    <section class="knockout-toolbar" aria-label="淘汰赛视图与筛选">
      <div class="knockout-view-switch" role="tablist" aria-label="视图切换">
        ${knockoutViewModes
          .map((mode) => `<a role="tab" aria-selected="${view === mode.key ? "true" : "false"}" class="${view === mode.key ? "active" : ""}" href="${knockoutHref({ view: mode.key, team: mode.key === "path" ? selectedTeamId : "" })}">${escapeHtml(mode.label)}</a>`)
          .join("")}
      </div>
      <div class="knockout-filters" aria-label="比赛筛选">
        ${knockoutFilterChips
          .map((chip) => `<a class="${filter === chip.key ? "active" : ""}" href="${knockoutHref({ filter: chip.key })}">${escapeHtml(chip.label)}</a>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderScheduleView(matches, round, filter, half = "left", halfSourceMatches = matches) {
  const halfSwitch = roundHasHalfSwitch(round) ? renderKnockoutHalfSwitch(halfSourceMatches, half, round) : "";
  if (!matches.length) {
    return `
      <section class="knockout-schedule-view" aria-label="${escapeHtml(knockoutRoundConfig(round).label)}赛程">
        ${halfSwitch}
        ${renderKnockoutEmptyState(
          filter === "all" ? "该半区对阵尚未生成" : "没有符合条件的比赛",
          filter === "all" ? "请稍后查看最新晋级形势" : "可切换筛选或查看全部比赛",
          filter === "all" ? "" : knockoutHref({ filter: "all", half })
        )}
      </section>
    `;
  }
  if (round === "r32") return renderR32ScheduleByHalves(matches, half, halfSwitch);
  return `
    <section class="knockout-schedule-view" aria-label="${escapeHtml(knockoutRoundConfig(round).label)}赛程">
      ${halfSwitch}
      ${groupMatchesByDate(matches)
        .map((group) => `
          <div class="knockout-date-group">
            <div class="knockout-date-title">
              <strong>${escapeHtml(group.label)}</strong>
              <span>${group.items.length} 场</span>
            </div>
            <div class="knockout-match-list">
              ${group.items.map(renderKnockoutMatchCard).join("")}
            </div>
          </div>
        `)
        .join("")}
    </section>
  `;
}

function renderKnockoutHalfSwitch(matches, activeHalf, round) {
  return `
    <nav class="knockout-half-switch" aria-label="半区切换">
      ${knockoutHalfFilterChips
        .map((chip) => {
          const count = matches.filter((match) => match.half === chip.key).length;
          const expected = knockoutHalfExpectedCount(round, chip.key);
          const href = knockoutHref({ half: chip.key });
          return `
            <a class="${activeHalf === chip.key ? "active" : ""}" href="${href}" aria-current="${activeHalf === chip.key ? "true" : "false"}">
              <strong>${escapeHtml(chip.label)}</strong>
              <small>${escapeHtml(`${count}/${expected || count} 场`)}</small>
            </a>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderR32ScheduleByHalves(matches, activeHalf = "left", halfSwitch = "") {
  const visibleHalfConfigs = knockoutHalfConfigs.filter((half) => half.key === activeHalf);
  const halves = visibleHalfConfigs.map((half) => ({
    ...half,
    items: sortKnockoutMatches(matches.filter((match) => match.half === half.key)),
  }));
  const unknown = sortKnockoutMatches(matches.filter((match) => !match.half));
  return `
    <section class="knockout-schedule-view knockout-r32-schedule" aria-label="32强赛程左右半区">
      ${halfSwitch}
      <div class="knockout-schedule-halves">
        ${halves.map(renderR32HalfSchedule).join("")}
      </div>
      ${unknown.length && !halves.length ? `
        <article class="knockout-schedule-half unknown">
          <header>
            <div><span>半区待确认</span><small>部分对阵暂未匹配到左右半区</small></div>
            <strong>${unknown.length} 场</strong>
          </header>
          ${renderHalfDateGroups(unknown)}
        </article>
      ` : ""}
    </section>
  `;
}

function renderR32HalfSchedule(half) {
  return `
    <article class="knockout-schedule-half ${escapeHtml(half.key)}">
      <header>
        <div>
          <span>${escapeHtml(half.label)}</span>
          <small>${escapeHtml(half.note)}</small>
        </div>
        <strong>${half.items.length}/8 场</strong>
      </header>
      ${half.items.length ? renderHalfDateGroups(half.items) : renderKnockoutEmptyState("该半区暂无符合条件的比赛", "可切换筛选或查看全部比赛", knockoutHref({ filter: "all" }))}
    </article>
  `;
}

function renderHalfDateGroups(matches) {
  return `
    <div class="knockout-half-date-groups">
      ${groupMatchesByDate(matches)
        .map((group) => `
          <div class="knockout-date-group">
            <div class="knockout-date-title">
              <strong>${escapeHtml(group.label)}</strong>
              <span>${group.items.length} 场</span>
            </div>
            <div class="knockout-match-list">
              ${group.items.map(renderKnockoutMatchCard).join("")}
            </div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderKnockoutMatchCard(match) {
  const predictionLine = knockoutPredictionLine(match);
  const predictionVisual = renderSpmPredictionVisual(match.prediction, match, "card");
  const nextLine = knockoutNextLine(match);
  return `
    <article class="knockout-match-card ${escapeHtml(match.status)}">
      <a class="knockout-card-link" href="${matchDetailHref(match.id)}" aria-label="${escapeHtml(`${match.homeTeam.name} 对阵 ${match.awayTeam.name}`)}">
        <header class="knockout-match-head">
          <span>${escapeHtml(match.roundLabel)} · ${renderKnockoutStatusPill(match)}</span>
          <em>${match.matchNo ? `第 ${escapeHtml(match.matchNo)} 场` : "比赛编号待定"}</em>
        </header>
        <div class="knockout-match-time">${escapeHtml(formatDate(match.kickoffTime))} · ${escapeHtml(match.venueLine)}</div>
        <div class="knockout-team-rows">
          ${renderKnockoutTeamRow(match, match.homeTeam, "home")}
          ${renderKnockoutTeamRow(match, match.awayTeam, "away")}
        </div>
        ${match.penaltyLabel ? `<div class="knockout-penalty">${escapeHtml(match.penaltyLabel)}</div>` : ""}
        ${predictionVisual}
        <footer class="knockout-match-foot">
          <strong>${escapeHtml(knockoutAdvanceLine(match))}</strong>
          ${nextLine ? `<span>${escapeHtml(nextLine)}</span>` : ""}
          ${!predictionVisual && predictionLine ? `<span class="knockout-model-line">${escapeHtml(predictionLine)}</span>` : ""}
        </footer>
      </a>
    </article>
  `;
}

function renderKnockoutStatusPill(match) {
  const meta = knockoutStatusMeta[match.status] || knockoutStatusMeta.unknown;
  return `<span class="knockout-status-pill ${escapeHtml(meta.tone)}">${match.status === "live" ? "<i></i>" : ""}${escapeHtml(meta.label)}</span>`;
}

function renderKnockoutTeamRow(match, team, side) {
  const isWinner = match.winnerTeamId && match.winnerTeamId === team.id;
  const isLoser = match.winnerTeamId && match.winnerTeamId !== team.id;
  const score = side === "home" ? match.homeScore : match.awayScore;
  return `
    <div class="knockout-team-row ${isWinner ? "winner" : isLoser ? "loser" : ""}">
      ${teamLogo(team, "team-logo small")}
      <span class="knockout-team-name"><strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(team.code || "待定")}</small></span>
      <b>${score === null || score === undefined ? "-" : escapeHtml(score)}</b>
      ${isWinner ? `<em>晋级</em>` : ""}
    </div>
  `;
}

function knockoutAdvanceLine(match) {
  if (match.status === "finished" && match.winnerTeam) {
    return `${match.winnerTeam.name} 晋级 ${match.nextRoundLabel}`;
  }
  if (["live", "extra_time", "penalties"].includes(match.status)) return `胜者将晋级 ${match.nextRoundLabel}`;
  if (match.status === "scheduled") return `胜者晋级 ${match.nextRoundLabel}`;
  return "晋级形势待确认";
}

const spmPredictionVisualRounds = new Set(["r32", "r16", "qf", "sf", "third", "final"]);

function knockoutPredictionLine(match) {
  const prediction = match.prediction;
  if (!prediction) return "";
  if (prediction.available === false) return `W32-SPM：${predictionUnavailableText(prediction)}`;
  if (prediction.predictedWinner?.name && prediction.predictedScore?.label) {
    return `W32-SPM：${prediction.predictedWinner.name} \u664b\u7ea7 · ${prediction.predictedScore.label}`;
    return `W32-SPM：${prediction.predictedWinner.name} 晋级 · ${prediction.predictedScore.label}`;
    return `W32-SPM：${prediction.predictedWinner.name} 晋级 · ${prediction.predictedScore.label}`;
  }
  if (prediction.predictedScore?.label) return `W32-SPM：预测比分 ${prediction.predictedScore.label}`;
  return "";
}

function spmPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function shouldRenderSpmPredictionVisual(item, fallbackMatch) {
  if (item?.available === false) return false;
  if (!item || !["ready", "final"].includes(item.predictionStatus)) return false;
  const match = item.match || fallbackMatch || {};
  const round = item.roundKey || match.round || getRoundFromMatch(match);
  if (!spmPredictionVisualRounds.has(round)) return false;
  const homeTeam = match.homeTeam || fallbackMatch?.homeTeam;
  const awayTeam = match.awayTeam || fallbackMatch?.awayTeam;
  if (!isKnownTeam(homeTeam) || !isKnownTeam(awayTeam)) return false;
  return Boolean(item.predictedScore?.label || item.officialResult?.label || item.scorelineProbabilities?.items?.length);
}

function renderSpmPredictionUnavailable(item, fallbackMatch, mode = "card") {
  if (!item || item.available !== false) return "";
  const reason = predictionUnavailableText(item);
  return `
    <section class="spm-visual spm-visual-${escapeHtml(mode)} pending" aria-label="W32-SPM 预测待定">
      <div class="spm-visual-head">
        <span>W32-SPM 比分预测</span>
        <em>待定</em>
      </div>
      <div class="spm-visual-main">
        <div class="spm-score-box model">
          <small>预测待定</small>
          <strong>--</strong>
          <em>${escapeHtml(reason)}</em>
        </div>
      </div>
    </section>
  `;
}

function spmMatchStatusText(match) {
  if (!match) return "状态待定";
  const status = match.status || "scheduled";
  const baseLabel = statusLabels[status] || match.statusDetail || status;
  const detail =
    status === "live"
      ? match.currentMinute
        ? `${match.currentMinute}' ${match.statusDetail || baseLabel}`
        : match.statusDetail || baseLabel
      : match.statusDetail && match.statusDetail !== baseLabel
        ? match.statusDetail
        : baseLabel;
  return match.needsReview ? `${detail} · 待复核` : detail;
}

function spmMatchVersionText(match) {
  if (!match) return "";
  const version = match.versionNo === null || match.versionNo === undefined ? "-" : match.versionNo;
  return `版本 ${version} · ${match.updatedAt || "更新时间待定"}`;
}

function renderSpmMetaItem(item) {
  const idAttr = item.id ? ` id="${escapeHtml(item.id)}"` : "";
  const classAttr = item.className ? ` class="${escapeHtml(item.className)}"` : "";
  return `<span${idAttr}${classAttr}>${escapeHtml(item.text)}</span>`;
}

function renderSpmPredictionVisual(item, fallbackMatch, mode = "card") {
  if (!shouldRenderSpmPredictionVisual(item, fallbackMatch)) return "";
  const match = item.match || fallbackMatch;
  const final = item.predictionStatus === "final";
  const actual = final ? predictionActualScore(item) : null;
  const actualWinner = item.actualWinner || item.officialResult?.winner || null;
  const scoreLabel = item.predictedScore?.label || item.scorelineProbabilities?.predicted?.label || item.officialResult?.label || "-";
  const scoreProbability = Number(item.scorelineProbabilities?.predicted?.probability ?? item.predictedScore?.probability);
  const predictedWinner = item.predictedWinner || null;
  const methodValue = item.modelWinMethod || item.winMethod || "";
  const method = methodValue && !["常规时间", "官方赛果"].includes(methodValue) ? methodValue : "";
  const scoreParts = String(scoreLabel).split("-").map((part) => Number(part));
  const isDrawPrediction = item.isDrawPrediction || (scoreParts.length === 2 && Number.isFinite(scoreParts[0]) && scoreParts[0] === scoreParts[1]);
  const scoreBoxLabel = final ? "赛前预测" : isDrawPrediction ? "90分钟预测" : "预测比分";
  const advanceLabel = item.advancePick?.label || (predictedWinner ? `晋级倾向：${predictedWinner.name}` : "晋级倾向待确认");
  const verdictTitle = predictedWinner ? (isDrawPrediction ? advanceLabel : `${predictedWinner.name} 晋级`) : "胜者待确认";
  const verdictDetail = isDrawPrediction ? [`90分钟 ${scoreLabel}`, advanceLabel, method].filter(Boolean).join(" · ") : [scoreLabel, method].filter(Boolean).join(" · ");
  const confidenceLabel = item.modelConfidenceLabel || item.confidenceLabel || "待定";
  const confidenceClass = predictionConfidenceClass(confidenceLabel);
  const homeAdvance = spmPercent(item.probabilities?.homeAdvance);
  const awayAdvance = spmPercent(item.probabilities?.awayAdvance);
  const homeWidth = homeAdvance ?? (awayAdvance !== null ? 100 - awayAdvance : 50);
  const awayWidth = awayAdvance ?? (homeAdvance !== null ? 100 - homeAdvance : 50);
  const scorelines = (item.scorelineProbabilities?.items || []).slice(0, mode === "detail" ? 6 : 4);
  const factors = (item.factors || []).slice(0, mode === "detail" ? 7 : 5);
  const reasons = (item.rationale || []).slice(0, mode === "detail" ? 4 : 0);
  const detailMeta = [
    mode === "detail" && match ? { id: "score-status", className: "spm-match-status-meta", text: spmMatchStatusText(match) } : null,
    mode === "detail" && match ? { id: "score-version", className: "spm-match-version-meta", text: spmMatchVersionText(match) } : null,
    { text: item.modelVersion || "W32-SPM v1.0" },
    item.scorelineProbabilities?.basis ? { text: "Poisson/Dixon-Coles" } : null,
    item.w32Spm?.warningCount ? { text: `${item.w32Spm.warningCount} 条输入警告` } : null,
  ].filter(Boolean);
  return `
    <section class="spm-visual spm-visual-${escapeHtml(mode)}" aria-label="W32-SPM 完整比分预测">
      <div class="spm-visual-head">
        <span>W32-SPM 比分预测</span>
        <em class="${escapeHtml(confidenceClass)}">${escapeHtml(confidenceLabel)}</em>
      </div>
      <div class="spm-visual-main">
        ${final ? `
          <div class="spm-score-box actual">
            <small>官方赛果</small>
            <strong${mode === "detail" ? ' id="score-numbers"' : ""}>${escapeHtml(actual?.label || "-")}</strong>
            <em>${escapeHtml(actualWinner ? `${actualWinner.name} 晋级` : "赛果已确认")}</em>
          </div>
        ` : ""}
        <div class="spm-score-box model">
          <small>${escapeHtml(scoreBoxLabel)}</small>
          <strong>${escapeHtml(scoreLabel)}</strong>
          <em>${Number.isFinite(scoreProbability) ? `${escapeHtml(scoreProbability.toFixed(1))}%` : "比分分布"}</em>
        </div>
        <div class="spm-verdict">
          <small>${escapeHtml(final ? "模型复盘" : "模型结论")}</small>
          <strong>${escapeHtml(verdictTitle)}</strong>
          <span>${escapeHtml(verdictDetail)}</span>
        </div>
      </div>
      ${homeAdvance !== null && awayAdvance !== null ? `
        <div class="spm-probability">
          <div class="spm-prob-row">
            <span>${teamLogo(match.homeTeam, "team-logo tiny")} ${escapeHtml(match.homeTeam.code || match.homeTeam.name)}</span>
            <strong>${escapeHtml(homeAdvance.toFixed(1))}%</strong>
          </div>
          <div class="spm-prob-track">
            <span class="home" style="width: ${homeWidth}%"></span>
            <span class="away" style="width: ${awayWidth}%"></span>
          </div>
          <div class="spm-prob-row away">
            <span>${teamLogo(match.awayTeam, "team-logo tiny")} ${escapeHtml(match.awayTeam.code || match.awayTeam.name)}</span>
            <strong>${escapeHtml(awayAdvance.toFixed(1))}%</strong>
          </div>
        </div>
      ` : ""}
      ${scorelines.length ? `
        <div class="spm-scorelines">
          ${scorelines.map((row) => `
            <span class="${row.isPredicted ? "active" : ""}">
              <b>${escapeHtml(row.label)}</b>
              <em>${escapeHtml(Number(row.probability || 0).toFixed(1))}%</em>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${factors.length ? `
        <div class="spm-factors">
          ${factors.map((factor) => `
            <span class="${escapeHtml(factor.edge || "even")}">
              <small>${escapeHtml(factor.label)}</small>
              <strong>${escapeHtml(factor.home)}</strong>
              <em>${escapeHtml(factor.away)}</em>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${reasons.length ? `<ul class="spm-reasons">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
      ${mode === "detail" && detailMeta.length ? `<div class="spm-meta">${detailMeta.map(renderSpmMetaItem).join("")}</div>` : ""}
    </section>
  `;
}

function knockoutNextLine(match) {
  if (match.status !== "finished" || !match.nextMatch) return "";
  if (match.nextOpponentTeam) return `下一轮对手：${match.nextOpponentTeam.name}`;
  return "下一轮对手待定";
}

function renderBracketView(matches, activeRound, selectedTeamId, filter = "all") {
  if (!matches.length && filter !== "all") {
    return `
      <section class="knockout-bracket round-filtered" aria-label="${escapeHtml(knockoutRoundConfig(activeRound).label)}晋级图">
        ${renderKnockoutEmptyState("没有符合条件的比赛", "可切换筛选或查看全部比赛", knockoutHref({ filter: "all" }))}
      </section>
    `;
  }
  const columns = visibleBracketColumns(buildBracketColumns(matches), activeRound);
  const selectedPath = selectedTeamId ? buildTeamPath(matches, selectedTeamId).matches.map((match) => match.id) : [];
  return `
    <section class="knockout-bracket round-filtered" aria-label="${escapeHtml(knockoutRoundConfig(activeRound).label)}晋级图">
      <div class="knockout-bracket-scroll">
        ${columns
          .map((column) => `
            <article class="knockout-bracket-column active">
              <header>
                <strong>${escapeHtml(column.label)}</strong>
                <span>${escapeHtml(bracketColumnCountLabel(column))}</span>
              </header>
              <div class="knockout-bracket-stack">
                ${(column.matches.length ? column.matches : Array.from({ length: column.emptyCount }, (_, index) => ({ placeholder: true, id: `${column.key}-${index}`, roundLabel: column.label, index })))
                  .map((match) => match.placeholder ? renderBracketPlaceholder(column, match.index) : renderBracketMiniCard(match, selectedTeamId, selectedPath.includes(match.id)))
                  .join("")}
              </div>
            </article>
          `)
          .join("")}
      </div>
      <p class="knockout-muted-note">部分晋级关系会在官方下一轮对阵确认后自动补全。</p>
    </section>
  `;
}

function renderBracketMiniCard(match, selectedTeamId, onPath) {
  const dimmed = selectedTeamId && !onPath && ![match.homeTeam.id, match.awayTeam.id].includes(selectedTeamId);
  return `
    <a class="knockout-bracket-card ${onPath ? "on-path" : ""} ${dimmed ? "dimmed" : ""}" href="${matchDetailHref(match.id)}">
      <span>${escapeHtml(match.matchNo ? `第 ${match.matchNo} 场` : match.roundLabel)} · ${escapeHtml(match.statusLabel)}</span>
      ${renderBracketTeamLine(match, match.homeTeam, "home")}
      ${renderBracketTeamLine(match, match.awayTeam, "away")}
      <em>${escapeHtml(match.winnerTeam ? `${match.winnerTeam.name} 晋级` : "胜者晋级")}</em>
      ${renderBracketPredictionVisual(match)}
    </a>
  `;
}

function shouldRenderBracketPrediction(match) {
  const prediction = match?.prediction;
  if (prediction?.available === false) return false;
  if (!bracketPredictionRoundKeys.has(match?.round)) return false;
  if (!isKnownTeam(match?.homeTeam) || !isKnownTeam(match?.awayTeam)) return false;
  if (!prediction || !["ready", "final"].includes(prediction.predictionStatus)) return false;
  return Boolean(prediction.predictedScore?.label || prediction.probabilities || prediction.scorelineProbabilities?.items?.length);
}

function bracketProbabilityValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function renderBracketPredictionVisual(match) {
  if (!shouldRenderBracketPrediction(match)) return "";
  const item = match.prediction;
  const scoreLabel = item.predictedScore?.label || item.scorelineProbabilities?.predicted?.label || "-";
  const scoreProbability = Number(item.scorelineProbabilities?.predicted?.probability ?? item.predictedScore?.probability);
  const winner = item.predictedWinner || item.actualWinner || null;
  const methodValue = item.modelWinMethod || item.winMethod || "";
  const method = methodValue && methodValue !== "常规时间" && methodValue !== "官方赛果" ? ` · ${methodValue}` : "";
  const scoreParts = String(scoreLabel).split("-").map((part) => Number(part));
  const isDrawPrediction = item.isDrawPrediction || (scoreParts.length === 2 && Number.isFinite(scoreParts[0]) && scoreParts[0] === scoreParts[1]);
  const advanceLabel = item.advancePick?.label || (winner ? `晋级倾向：${winner.name}` : "晋级倾向待确认");
  const verdictTitle = winner ? (isDrawPrediction ? advanceLabel : `${winner.name}晋级`) : "胜者待确认";
  const verdictDetail = isDrawPrediction ? `90分钟 ${scoreLabel} · ${advanceLabel}${method}` : `${scoreLabel}${method}`;
  const confidenceLabel = item.modelConfidenceLabel || item.confidenceLabel || "待定";
  const confidenceClass = predictionConfidenceClass(confidenceLabel);
  const homeAdvance = bracketProbabilityValue(item.probabilities?.homeAdvance);
  const awayAdvance = bracketProbabilityValue(item.probabilities?.awayAdvance);
  const homeWidth = homeAdvance ?? (awayAdvance !== null ? 100 - awayAdvance : 50);
  const awayWidth = awayAdvance ?? (homeAdvance !== null ? 100 - homeAdvance : 50);
  const scoreOptions = (item.scorelineProbabilities?.items || []).slice(0, 4);
  const factors = (item.factors || []).slice(0, 3);
  return `
    <div class="knockout-bracket-prediction" aria-label="W32-SPM 比分预测">
      <div class="knockout-bracket-prediction-head">
        <span>W32-SPM 比分预测</span>
        <em class="${escapeHtml(confidenceClass)}">${escapeHtml(confidenceLabel)}</em>
      </div>
      <div class="knockout-bracket-prediction-main">
        <div class="knockout-bracket-score">
          <small>预测比分</small>
          <strong>${escapeHtml(scoreLabel)}</strong>
          ${Number.isFinite(scoreProbability) ? `<em>${escapeHtml(scoreProbability.toFixed(1))}%</em>` : ""}
        </div>
        <div class="knockout-bracket-verdict">
          <strong>${escapeHtml(verdictTitle)}</strong>
          <span>${escapeHtml(verdictDetail)}</span>
        </div>
      </div>
      ${homeAdvance !== null && awayAdvance !== null ? `
        <div class="knockout-bracket-probability" aria-label="晋级概率">
          <div class="knockout-bracket-prob-row">
            <span>${escapeHtml(match.homeTeam.code || match.homeTeam.shortName || match.homeTeam.name)}</span>
            <strong>${escapeHtml(homeAdvance.toFixed(1))}%</strong>
          </div>
          <div class="knockout-bracket-prob-track">
            <span class="home" style="width: ${homeWidth}%"></span>
            <span class="away" style="width: ${awayWidth}%"></span>
          </div>
          <div class="knockout-bracket-prob-row away">
            <span>${escapeHtml(match.awayTeam.code || match.awayTeam.shortName || match.awayTeam.name)}</span>
            <strong>${escapeHtml(awayAdvance.toFixed(1))}%</strong>
          </div>
        </div>
      ` : ""}
      ${scoreOptions.length ? `
        <div class="knockout-bracket-scorelines" aria-label="候选比分概率">
          ${scoreOptions.map((row) => `
            <span class="${row.isPredicted ? "active" : ""}">
              <b>${escapeHtml(row.label)}</b>
              <em>${escapeHtml(Number(row.probability || 0).toFixed(1))}%</em>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${factors.length ? `
        <div class="knockout-bracket-factors" aria-label="关键预测因子">
          ${factors.map((factor) => `
            <span class="${escapeHtml(factor.edge || "even")}">
              <small>${escapeHtml(factor.label)}</small>
              <strong>${escapeHtml(factor.home)}</strong>
              <em>${escapeHtml(factor.away)}</em>
            </span>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderBracketTeamLine(match, team, side) {
  const score = side === "home" ? match.homeScore : match.awayScore;
  const winner = match.winnerTeamId === team.id;
  return `
    <div class="bracket-team-line ${winner ? "winner" : ""}">
      ${teamLogo(team, "team-logo small")}
      <strong>${escapeHtml(team.shortName || team.name)}</strong>
      <b>${score === null || score === undefined ? "-" : escapeHtml(score)}</b>
    </div>
  `;
}

function renderBracketPlaceholder(column, index) {
  return `
    <div class="knockout-bracket-card placeholder">
      <span>${escapeHtml(column.label)} 席位 ${index + 1}</span>
      <div class="bracket-team-line"><i class="slot-dot"></i><strong>待定球队</strong><b>-</b></div>
      <div class="bracket-team-line"><i class="slot-dot"></i><strong>对手待定</strong><b>-</b></div>
      <em>对阵待定</em>
    </div>
  `;
}

function renderTeamPathView(matches, selectedTeamId, round, filter) {
  const teams = getKnockoutTeams(matches);
  const activeTeamId = selectedTeamId || teams[0]?.id || "";
  const path = activeTeamId ? buildTeamPath(matches, activeTeamId) : null;
  return `
    <section class="knockout-team-path" aria-label="球队冠军之路">
      <form class="knockout-team-picker" data-knockout-team-form>
        <label>
          <span>冠军之路</span>
          <input name="teamQuery" type="search" list="knockout-team-options" placeholder="搜索球队，查看冠军之路" value="${escapeHtml(path?.team?.name || "")}" />
        </label>
        <button type="submit">查看</button>
        <datalist id="knockout-team-options">
          ${teams.map((team) => `<option value="${escapeHtml(team.name)}" data-team-id="${escapeHtml(team.id)}">${escapeHtml(team.code || "")}</option>`).join("")}
        </datalist>
      </form>
      <div class="knockout-team-chips">
        ${teams
          .slice(0, 12)
          .map((team) => `<a class="${activeTeamId === team.id ? "active" : ""}" href="${knockoutHref({ view: "path", team: team.id, round, filter })}">${teamLogo(team, "team-logo tiny")}${escapeHtml(team.shortName || team.name)}</a>`)
          .join("")}
      </div>
      ${path?.team ? renderTeamPathTimeline(path) : renderKnockoutEmptyState("选择一支球队", "查看它通往决赛的路径", "")}
    </section>
  `;
}

function renderTeamPathTimeline(path) {
  return `
    <article class="knockout-path-card">
      <header>
        <div>${teamLogo(path.team, "team-logo")}<span><strong>${escapeHtml(path.team.name)}</strong><small>${escapeHtml(path.team.code || "淘汰赛球队")}</small></span></div>
        <em class="${path.isAlive ? "alive" : "out"}">${escapeHtml(path.statusText)}</em>
      </header>
      <div class="knockout-path-timeline">
        ${path.nodes
          .map((node) => `
            <div class="knockout-path-node ${escapeHtml(node.state)}">
              <span>${escapeHtml(node.round.label)}</span>
              <strong>${escapeHtml(node.label)}</strong>
              <small>${node.match ? escapeHtml(knockoutPathMatchDetail(node.match)) : escapeHtml(node.state === "disabled" ? "已无后续赛程" : "可能对阵待确认")}</small>
            </div>
          `)
          .join("")}
      </div>
    </article>
  `;
}

function knockoutMatchPairLabel(match) {
  return `${match.homeTeam.shortName || match.homeTeam.name} vs ${match.awayTeam.shortName || match.awayTeam.name}`;
}

function knockoutPathMatchDetail(match) {
  const score = match.homeScore === null || match.homeScore === undefined ? "比分待定" : `${match.homeScore}-${match.awayScore}`;
  const method = match.penaltyLabel ? ` · ${match.penaltyLabel}` : "";
  const result = match.status === "finished" && match.winnerTeam ? ` · ${match.winnerTeam.name}晋级` : "";
  return `${score}${method}${result}`;
}

function knockoutDateGroupLabel(iso) {
  if (!iso) return "时间待定";
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const key = date.toLocaleDateString("zh-CN");
  const monthDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
  if (key === today.toLocaleDateString("zh-CN")) return `今天 · ${monthDay}`;
  if (key === tomorrow.toLocaleDateString("zh-CN")) return `明天 · ${monthDay}`;
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
  return `${monthDay} · ${weekday}`;
}

function renderKnockoutEmptyState(title, detail, href = "") {
  return `
    <div class="knockout-empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
      ${href ? `<a class="btn" href="${href}">查看全部比赛</a>` : ""}
    </div>
  `;
}

function renderKnockoutErrorState(error) {
  return `
    <section class="knockout-page">
      <div class="knockout-empty-state error">
        <strong>淘汰赛数据加载失败</strong>
        <span>${escapeHtml(error?.message || "请稍后重试")}</span>
      </div>
    </section>
  `;
}

function renderKnockoutPredictionColumn(payload) {
  const items = payload?.items || [];
  const rounds = Object.fromEntries(knockoutRoundConfigs.map((round) => [round.key, []]));
  items.forEach((item) => {
    const key = item.roundKey || knockoutRoundKey(item.match);
    if (rounds[key]) rounds[key].push(item);
  });
  const model = payload?.model || {};
  return `
    <section class="prediction-column">
      <div class="standings-head prediction-head">
        <div>
          <div class="prediction-head-meta">
            <span class="source-badge">专栏预测</span>
            ${renderKnockoutRealtimeBadge(payload?.summary?.realtime)}
          </div>
          <h2>逐场胜负与比分预测</h2>
          <p class="muted mini">${escapeHtml(model.name || "淘汰赛专栏可解释预测模型")} · ${escapeHtml((payload?.summary || {}).notice || "仅供内容策划")}</p>
        </div>
        <div class="prediction-model-tags">
          ${(model.features || []).slice(0, 6).map((feature) => `<span>${escapeHtml(feature)}</span>`).join("")}
        </div>
      </div>
      <div class="prediction-rounds">
        ${knockoutRoundConfigs
          .map((round) => renderPredictionRound(round, rounds[round.key] || []))
          .join("")}
      </div>
    </section>
  `;
}

function renderKnockoutRealtimeBadge(realtime = {}) {
  const live = Number(realtime.live || 0);
  const pendingScore = Number(realtime.completedPendingScore || 0);
  const nextSeconds = Number(realtime.nextRefreshInSeconds || realtime.refreshEverySeconds || 0);
  const label = realtime.locked
    ? `更新已停止 · ${realtime.stopAtLabel || "2026-07-20 10:00 北京时间"}`
    : live
      ? `赛中自动更新 · ${realtime.refreshEverySeconds || nextSeconds || 30}s`
      : realtime.active && nextSeconds
        ? `自动更新 · ${nextSeconds}s`
        : "赛程已同步";
  const suffix = pendingScore ? ` · ${pendingScore} 场待比分` : "";
  return `<span class="source-badge realtime-badge">${escapeHtml(label + suffix)}</span>`;
}

function renderPredictionRound(round, items) {
  if (!items.length) return "";
  return `
    <article class="prediction-round">
      <div class="prediction-round-head">
        <strong>${escapeHtml(round.label)}</strong>
        <span>${items.length} 场</span>
      </div>
      <div class="prediction-card-grid">
        ${items.map(renderPredictionCard).join("")}
      </div>
    </article>
  `;
}

function renderPredictionCard(item) {
  const match = item.match;
  const ready = item.predictionStatus === "ready";
  const final = item.predictionStatus === "final";
  if (final) return renderFinalPredictionCard(item);
  const homeAdvance = Number(item.probabilities?.homeAdvance || 0);
  const awayAdvance = Number(item.probabilities?.awayAdvance || 0);
  const homeWidth = Math.max(4, Math.min(96, ready ? homeAdvance : 50));
  const awayWidth = Math.max(4, Math.min(96, ready ? awayAdvance : 50));
  const winner = item.predictedWinner || null;
  const unavailable = item.available === false;
  const scoreLabel = unavailable ? "预测待定" : item.predictedScore?.label || "-";
  const method = item.winMethod && item.winMethod !== "常规时间" ? ` · ${item.winMethod}` : "";
  const headline = ready
    ? `${winner?.name || "待定"}晋级 · ${scoreLabel}${method}`
    : final
      ? `官方赛果 · ${winner?.name || "胜者"} ${scoreLabel}`
      : predictionUnavailableText(item);
  return `
    <article class="prediction-card ${escapeHtml(item.predictionStatus || "pending")}">
      <a class="prediction-match-line" href="${matchDetailHref(match.id)}">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <strong>${escapeHtml(match.homeTeam.name)} vs ${escapeHtml(match.awayTeam.name)}</strong>
        <em>${statusBadge(match)}</em>
      </a>
      <div class="prediction-verdict">
        ${renderPredictionScoreBox(item, ready, final, scoreLabel)}
        <div class="prediction-copy">
          <h3>${escapeHtml(headline)}</h3>
        </div>
        <span class="confidence ${predictionConfidenceClass(item.confidenceLabel)}"><span>${escapeHtml(item.confidenceLabel || "待定")}</span></span>
      </div>
      ${ready ? renderPredictionProbability(match, homeAdvance, awayAdvance, homeWidth, awayWidth) : ""}
      ${ready ? renderPredictionFactors(item.factors || []) : ""}
      ${(item.rationale || []).length > 1 ? `<ul class="prediction-reasons">${item.rationale.slice(1, 3).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}

function predictionActualScore(item) {
  const match = item.match || {};
  const result = item.officialResult || {};
  const home = result.home ?? match.score?.home;
  const away = result.away ?? match.score?.away;
  const baseLabel = result.label || (home !== undefined && home !== null && away !== undefined && away !== null ? `${home}-${away}` : "-");
  const penaltyLabel = result.penaltyLabel || result.penaltyShootout?.label || "";
  const extraTimeLabel = result.extraTimeLabel || result.extraTime?.label || "";
  const detailLabel = penaltyLabel || extraTimeLabel;
  const label = baseLabel !== "-" && detailLabel ? `${baseLabel} · ${detailLabel}` : baseLabel;
  return { home, away, label };
}

function renderFinalPredictionCard(item) {
  const match = item.match;
  const actual = predictionActualScore(item);
  const actualWinner = item.actualWinner || item.officialResult?.winner || null;
  const actualWinnerId = item.actualWinnerTeamId || item.officialResult?.winnerTeamId || actualWinner?.id;
  const modelWinner = item.predictedWinner || null;
  const modelScoreLabel = item.predictedScore?.label || "-";
  const officialMethod = item.officialResult?.winMethod || item.winMethod || "";
  const modelMethodValue = item.modelWinMethod || item.winMethod || "";
  const modelMethod = modelMethodValue && modelMethodValue !== "常规时间" && modelMethodValue !== "官方赛果" ? ` · ${modelMethodValue}` : "";
  const homeAdvance = Number(item.probabilities?.homeAdvance || 0);
  const awayAdvance = Number(item.probabilities?.awayAdvance || 0);
  const homeWidth = Math.max(4, Math.min(96, homeAdvance || 50));
  const awayWidth = Math.max(4, Math.min(96, awayAdvance || 50));
  const hasModel = Boolean(item.scorelineProbabilities?.items?.length || (item.factors || []).length || item.probabilities);
  const modelHeadline = modelWinner ? `${modelWinner.name}晋级 · ${modelScoreLabel}${modelMethod}` : `模型预测 · ${modelScoreLabel}`;
  const winnerLine = actualWinner
    ? `${actualWinner.name}${officialMethod === "点球" ? "点球晋级" : officialMethod === "加时" ? "加时晋级" : "晋级"}`
    : officialMethod === "点球"
      ? "点球结果待确认"
      : officialMethod === "加时"
        ? "加时结果待确认"
        : "官方完赛";
  return `
    <article class="prediction-card final result-showcase">
      <a class="prediction-match-line" href="${matchDetailHref(match.id)}">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <strong>${escapeHtml(match.homeTeam.name)} vs ${escapeHtml(match.awayTeam.name)}</strong>
        <em>${statusBadge(match)}</em>
      </a>
      <div class="final-result-stage">
        <span class="result-net-3d" aria-hidden="true"></span>
        <span class="football-3d" aria-hidden="true"></span>
        <div class="final-result-team home ${actualWinnerId === match.homeTeam.id ? "winner" : ""}">
          ${teamLogo(match.homeTeam, "team-logo")}
          <span><strong>${escapeHtml(match.homeTeam.name)}</strong><small>${escapeHtml(match.homeTeam.code)}</small></span>
          <b>${escapeHtml(actual.home ?? "-")}</b>
        </div>
        <div class="final-score-core">
          <span>官方赛果</span>
          <strong>${escapeHtml(actual.label)}</strong>
          <em>${escapeHtml(winnerLine)}</em>
        </div>
        <div class="final-result-team away ${actualWinnerId === match.awayTeam.id ? "winner" : ""}">
          ${teamLogo(match.awayTeam, "team-logo")}
          <span><strong>${escapeHtml(match.awayTeam.name)}</strong><small>${escapeHtml(match.awayTeam.code)}</small></span>
          <b>${escapeHtml(actual.away ?? "-")}</b>
        </div>
      </div>
      ${hasModel ? `
        <div class="final-model-panel">
          ${renderPredictionScoreBox(item, true, false, modelScoreLabel)}
          <div class="prediction-copy final-model-copy">
            <span>赛前模型</span>
            <h3>${escapeHtml(modelHeadline)}</h3>
          </div>
          <span class="confidence done"><span>${escapeHtml(item.confidenceLabel || "已完赛")}</span></span>
        </div>
        ${item.probabilities ? renderPredictionProbability(match, homeAdvance, awayAdvance, homeWidth, awayWidth) : ""}
        ${(item.factors || []).length ? renderPredictionFactors(item.factors || []) : ""}
      ` : ""}
      ${(item.rationale || []).length > 1 ? `<ul class="prediction-reasons">${item.rationale.slice(1, 3).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}

function renderPredictionScoreBox(item, ready, final, scoreLabel) {
  const distribution = item.scorelineProbabilities || {};
  const predicted = distribution.predicted || {};
  const probability = Number(predicted.probability ?? item.predictedScore?.probability);
  if (!ready || !distribution.items?.length) {
    return `
      <div class="prediction-score">
        <div class="prediction-score-main simple">
          <span>${escapeHtml(final ? "结果" : ready ? "预测比分" : "状态")}</span>
          <strong>${escapeHtml(scoreLabel)}</strong>
        </div>
      </div>
    `;
  }
  const options = distribution.items.slice(0, 5);
  return `
    <div class="prediction-score with-probabilities">
      <div class="prediction-score-main">
        <span>预测比分</span>
        <strong>${escapeHtml(scoreLabel)}</strong>
        <em>${Number.isFinite(probability) ? `${escapeHtml(probability.toFixed(1))}%` : ""}</em>
      </div>
      <div class="scoreline-options" aria-label="不同比分概率">
        ${options
          .map(
            (row) => `
              <span class="scoreline-option ${row.isPredicted ? "active" : ""}">
                <b>${escapeHtml(row.label)}</b>
                <i>${escapeHtml(Number(row.probability || 0).toFixed(1))}%</i>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function predictionConfidenceClass(label) {
  if (label === "高") return "high";
  if (label === "中") return "medium";
  if (label === "低") return "low";
  if (label === "已完赛") return "done";
  return "";
}

function renderPredictionProbability(match, homeAdvance, awayAdvance, homeWidth, awayWidth) {
  return `
    <div class="prediction-probability">
      <div class="prediction-prob-row">
        <span>${teamLogo(match.homeTeam, "team-logo small")} ${escapeHtml(match.homeTeam.code)}</span>
        <strong>${escapeHtml(homeAdvance.toFixed(1))}%</strong>
      </div>
      <div class="probability-track" aria-label="晋级概率">
        <span class="home" style="width: ${homeWidth}%"></span>
        <span class="away" style="width: ${awayWidth}%"></span>
      </div>
      <div class="prediction-prob-row away">
        <span>${teamLogo(match.awayTeam, "team-logo small")} ${escapeHtml(match.awayTeam.code)}</span>
        <strong>${escapeHtml(awayAdvance.toFixed(1))}%</strong>
      </div>
    </div>
  `;
}

function renderPredictionFactors(factors) {
  if (!factors.length) return "";
  return `
    <div class="prediction-factors">
      ${factors.slice(0, 5).map((factor) => `
        <span class="prediction-factor ${escapeHtml(factor.edge || "even")}">
          <small>${escapeHtml(factor.label)}</small>
          <strong>${escapeHtml(factor.home)}</strong>
          <em>${escapeHtml(factor.away)}</em>
        </span>
      `).join("")}
    </div>
  `;
}

function renderKnockoutOverview(rounds) {
  const halves = buildKnockoutHalves(rounds);
  return `
    <section class="knockout-overview">
      ${renderFinalRail(rounds)}
      <div class="knockout-halves">
        ${halves.map(renderKnockoutHalf).join("")}
      </div>
    </section>
  `;
}

function renderFinalRail(rounds) {
  const finalMatch = rounds.final[0];
  const thirdMatch = rounds.third[0];
  return `
    <div class="final-rail">
      <div class="final-copy">
        <span class="source-badge">冠军路径</span>
        <h2>决赛与冠军席位</h2>
        <p class="muted mini">半决赛胜者进入决赛；冠军席位会在官方结果确认后显示。</p>
      </div>
      <div class="final-cards">
        ${renderBracketMatch(finalMatch, "final", "决赛", 0, "冠军争夺")}
        ${renderChampionSlot(finalMatch)}
        ${thirdMatch ? renderBracketMatch(thirdMatch, "third", "三四名", 0, "三四名决赛") : ""}
      </div>
    </div>
  `;
}

function renderChampionSlot(finalMatch) {
  const winner = finalMatch?.winnerTeamId
    ? [finalMatch.homeTeam, finalMatch.awayTeam].find((team) => team.id === finalMatch.winnerTeamId)
    : null;
  return `
    <div class="champion-slot ${winner ? "known" : "pending"}">
      <span class="champion-kicker">冠军</span>
      ${winner ? teamLogo(winner, "team-logo small") : '<span class="champion-mark">C</span>'}
      <strong>${escapeHtml(winner?.name || "冠军席位")}</strong>
      <span>${winner ? escapeHtml(winner.code) : "待决赛结果确认"}</span>
    </div>
  `;
}

function renderKnockoutHalf(half) {
  return `
    <article class="bracket-half" style="--half-accent: ${half.accent}">
      <div class="bracket-half-head">
        <span>${escapeHtml(half.label)}</span>
        <strong>${half.r32.length} 组 32强对战</strong>
      </div>
      <div class="bracket-columns">
        ${renderBracketRound("32强", half.r32, 8, "r32")}
        ${renderBracketRound("16强", half.r16, 4, "r16")}
        ${renderBracketRound("8强", half.qf, 2, "qf")}
        ${renderFourSeedColumn(half)}
        ${renderBracketRound("半决赛", half.sf, 1, "sf")}
      </div>
    </article>
  `;
}

function renderBracketRound(label, matches, count, key) {
  const slots = Array.from({ length: count }, (_, index) => matches[index] || null);
  return `
    <div class="bracket-round ${escapeHtml(key)}">
      <div class="bracket-round-title">
        <span>${escapeHtml(label)}</span>
        <small>${matches.length ? `${matches.length}/${count}` : "预留席位"}</small>
      </div>
      <div class="bracket-stack">
        ${slots.map((match, index) => renderBracketMatch(match, key, label, index)).join("")}
      </div>
    </div>
  `;
}

function renderFourSeedColumn(half) {
  const seedTeams = half.sf.flatMap((match) => [match.homeTeam, match.awayTeam]).slice(0, 2);
  const slots = Array.from({ length: 2 }, (_, index) => seedTeams[index] || null);
  return `
    <div class="bracket-round four-seeds">
      <div class="bracket-round-title">
        <span>4强</span>
        <small>半决赛席位</small>
      </div>
      <div class="bracket-stack seed-stack">
        ${slots.map((team, index) => renderBracketSeed(team, `4强席位 ${index + 1}`)).join("")}
      </div>
    </div>
  `;
}

function isKnownTeam(team) {
  if (!team) return false;
  const name = String(team.name || "");
  return team.code !== "TBD" && name !== "待定" && !name.includes("待定");
}

function renderBracketSeed(team, fallbackLabel) {
  const known = isKnownTeam(team);
  return `
    <div class="bracket-seed ${known ? "known" : "pending"}">
      ${known ? teamLogo(team, "team-logo small") : '<span class="slot-dot"></span>'}
      <strong>${escapeHtml(known ? team.name : fallbackLabel)}</strong>
      <span>${escapeHtml(known ? team.code : "待官方确认")}</span>
    </div>
  `;
}

function renderBracketTeam(team, fallbackLabel) {
  const known = isKnownTeam(team);
  return `
    <span class="bracket-team ${known ? "known" : "pending"}">
      ${known ? teamLogo(team, "team-logo small") : '<span class="slot-dot"></span>'}
      <span>
        <strong>${escapeHtml(known ? team.name : fallbackLabel)}</strong>
        <small>${escapeHtml(known ? team.code : "待官方确认")}</small>
      </span>
    </span>
  `;
}

function renderBracketMatch(match, key, label, index, customTitle = "") {
  if (!match) {
    return `
      <div class="bracket-match placeholder">
        <div class="bracket-match-code">${escapeHtml(label)} ${index + 1}</div>
        ${renderBracketTeam(null, `${label}席位`)}
        ${renderBracketTeam(null, "对手待定")}
        <div class="bracket-match-meta"><span>待官方赛程</span></div>
      </div>
    `;
  }
  const venue = [match.venue?.city, match.venue?.name].filter(Boolean).join(" · ");
  return `
    <a class="bracket-match ${escapeHtml(key)} ${escapeHtml(match.status || "scheduled")}" href="${matchDetailHref(match.id)}">
      <div class="bracket-match-code">${escapeHtml(customTitle || `${label} ${index + 1}`)} ${statusBadge(match)}</div>
      ${renderBracketTeam(match.homeTeam, "主队待定")}
      ${renderBracketTeam(match.awayTeam, "客队待定")}
      <div class="bracket-match-meta">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <span>${escapeHtml(venue || "场地待定")}</span>
      </div>
    </a>
  `;
}

function renderKnockoutSchedule(rounds) {
  const scheduleRounds = ["r32", "r16", "qf", "sf", "third", "final"].map((key) => knockoutRoundConfigs.find((round) => round.key === key));
  return `
    <section class="knockout-schedule">
      <div class="standings-head">
        <div>
          <h2>具体赛程安排</h2>
          <p class="muted mini">按轮次展示开球时间、场馆和状态，点击任意比赛可进入详情。</p>
        </div>
      </div>
      <div class="knockout-schedule-grid">
        ${scheduleRounds
          .map((round) => renderKnockoutScheduleRound(round, rounds[round.key] || []))
          .join("")}
      </div>
    </section>
  `;
}

function renderKnockoutScheduleRound(round, matches) {
  const slots = matches.length ? matches : Array.from({ length: round.emptyCount }, () => null);
  return `
    <article class="schedule-round">
      <div class="schedule-round-head">
        <strong>${escapeHtml(round.label)}</strong>
        <span>${matches.length ? `${matches.length} 场` : "预留"}</span>
      </div>
      <div class="schedule-round-list">
        ${slots.map((match, index) => (match ? renderKnockoutScheduleMatch(match) : renderKnockoutSchedulePlaceholder(round, index))).join("")}
      </div>
    </article>
  `;
}

function renderKnockoutScheduleMatch(match) {
  const venue = [match.venue?.name, match.venue?.city].filter(Boolean).join(" · ");
  return `
    <a class="schedule-match-row" href="${matchDetailHref(match.id)}">
      <span class="schedule-date">${escapeHtml(formatDate(match.kickoffAt))}</span>
      <span class="schedule-teams">${teamLogo(match.homeTeam, "team-logo small")} <strong>${escapeHtml(match.homeTeam.name)}</strong><em>${escapeHtml(scoreText(match))}</em><strong>${escapeHtml(match.awayTeam.name)}</strong> ${teamLogo(match.awayTeam, "team-logo small")}</span>
      <span class="schedule-venue">${escapeHtml(venue || "场地待定")}</span>
      <span>${statusBadge(match)}</span>
    </a>
  `;
}

function renderKnockoutSchedulePlaceholder(round, index) {
  return `
    <div class="schedule-match-row placeholder">
      <span class="schedule-date">待定</span>
      <span class="schedule-teams"><strong>${escapeHtml(round.label)}席位 ${index + 1}</strong></span>
      <span class="schedule-venue">等待 FIFA 官方确认</span>
      <span class="badge scheduled">预留</span>
    </div>
  `;
}

async function renderStandingsPage() {
  const comp = await api("/competitions/world-cup-2026");
  app.innerHTML = `
    <section class="page-head">
      <div class="page-title">
        <p class="eyebrow">Group Standings</p>
        <h1>小组积分</h1>
        <p class="muted">按 FIFA 小组赛赛果计算，前两名为出线区，小组第三为待定区。</p>
      </div>
      <div class="button-row">
        <a class="btn" href="#/competitions/world-cup-2026">返回小组赛</a>
      </div>
    </section>
    <section class="standings-page">
      <div class="standings-head standings-page-head">
        <div>
          <h2>2026 FIFA 世界杯</h2>
          <p class="muted mini">胜负、净胜球和积分统一按小组分色展示。</p>
        </div>
        <div class="standing-legend">
          <span><i class="legend-dot qualify"></i>出线区</span>
          <span><i class="legend-dot pending"></i>待定区</span>
        </div>
      </div>
      ${renderStandings(comp.standings, "standings-grid")}
    </section>
  `;
}

function renderStandings(groups, className = "") {
  const names = Object.keys(groups || {});
  if (!names.length) return `<div class="empty">暂无积分榜</div>`;
  const colors = ["#0f8b5f", "#2563eb", "#c2410c", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f", "#b45309", "#4338ca", "#047857", "#a21caf", "#0369a1"];
  return `<div class="${escapeHtml(className)}">${names
    .map(
      (name, index) => `
        <div class="group-card" style="--group-color: ${colors[index % colors.length]}">
          <div class="group-card-head">
            <span class="group-chip">${escapeHtml(name)} 组</span>
            <span class="muted mini">${groups[name].filter((row) => row.played > 0).length ? "已计算" : "待开赛"}</span>
          </div>
          <div class="standings-table">
            <div class="standing-row standing-row-head">
              <span>排名</span><span>球队</span><span>赛</span><span>胜</span><span>平</span><span>负</span><span>净</span><span>分</span><span>状态</span>
            </div>
            ${groups[name]
              .map(
                (row) => `
                  <a class="standing-row zone-${escapeHtml(row.zone || "outside")}" href="${hashHref(`/teams/${row.team.id}`)}">
                    <span class="rank">${row.rank}</span>
                    <span class="standing-team">${teamLogo(row.team, "team-logo small")} <strong>${escapeHtml(row.team.name)}</strong></span>
                    <span>${row.played}</span><span>${row.won}</span><span>${row.drawn}</span><span>${row.lost}</span><span>${row.goalDifference}</span><span><strong>${row.points}</strong></span>
                    <span>${row.zoneLabel ? `<em class="zone-badge ${escapeHtml(row.zone)}">${escapeHtml(row.zoneLabel)}</em>` : `<span class="muted mini">-</span>`}</span>
                  </a>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("")}</div>`;
}

function matchBackNavigation(match, params = new URLSearchParams()) {
  const returnTarget = normalizeMatchReturnTarget(params.get("returnTo"));
  if (returnTarget) {
    return {
      href: returnTarget,
      label: returnTarget.startsWith("#/knockout") ? "返回淘汰赛" : "返回小组赛",
    };
  }
  const round = knockoutRoundKey(match);
  if (round) {
    return {
      href: hashHref("/knockout", { round }),
      label: "返回淘汰赛",
    };
  }
  return {
    href: hashHref("/competitions/world-cup-2026"),
    label: "返回小组赛",
  };
}

async function renderMatchDetail(matchId, params) {
  const requestedTab = params.get("tab") || "timeline";
  const tabAliases = { source: "timeline", prediction: "score-prediction", spm: "score-prediction" };
  const matchTabs = [
    ["score-prediction", "比分预测"],
    ["timeline", "时间线"],
    ["lineups", "首发"],
    ["stats", "统计"],
    ["h2h", "历史交战"],
  ];
  const normalizedTab = tabAliases[requestedTab] || requestedTab;
  const tab = matchTabs.some(([key]) => key === normalizedTab) ? normalizedTab : "timeline";
  const h2hFilter = params.get("h2hFilter") || "all";
  const h2hExpanded = params.get("h2hExpanded") === "1";
  const includeByTab = {
    "score-prediction": ["source"],
    timeline: ["events", "source"],
    lineups: ["events", "stats", "source", "lineups"],
    stats: ["events", "stats", "source"],
    h2h: ["h2h", "source"],
  };
  const include = includeByTab[tab] || includeByTab.timeline;
  const predictionRequest = tab === "score-prediction" ? api("/predictions/knockout").catch(() => ({ items: [] })) : Promise.resolve({ items: [] });
  const formationRequest = tab === "lineups" ? loadFormationConfig() : Promise.resolve();
  const [matchPayload, predictionPayload] = await Promise.all([
    api(`/matches/${matchId}?${toQuery({ include: include.join(",") })}`),
    predictionRequest,
    formationRequest,
  ]);
  const matchPrediction = (predictionPayload.items || []).find((item) => (item.match?.id || item.matchId) === matchId) || null;
  let match = matchPayload;
  if (matchPrediction?.match && isKnownTeam(matchPrediction.match.homeTeam) && isKnownTeam(matchPrediction.match.awayTeam)) {
    match = {
      ...match,
      homeTeam: matchPrediction.match.homeTeam,
      awayTeam: matchPrediction.match.awayTeam,
      stage: matchPrediction.match.stage || match.stage,
      venue: matchPrediction.match.venue || match.venue,
      kickoffAt: matchPrediction.match.kickoffAt || match.kickoffAt,
    };
  }
  match = withComputedGoalScores(match);
  const competitionName = match.competition?.name || "赛事";
  const stageName = match.stage?.name || "阶段待定";
  const homeName = teamDisplayName(match.homeTeam, "主队");
  const awayName = teamDisplayName(match.awayTeam, "客队");
  const venueLine = venueDisplay(match.venue);
  const backNavigation = matchBackNavigation(match, params);
  app.innerHTML = `
    <section class="page-head match-page-head">
      <div class="page-title">
        <p class="eyebrow">${escapeHtml(competitionName)} · ${escapeHtml(stageName)}</p>
        <h1>${escapeHtml(homeName)} vs ${escapeHtml(awayName)}</h1>
        <p class="muted">${escapeHtml(formatDate(match.kickoffAt))} · ${escapeHtml(venueLine)}</p>
      </div>
      <div class="button-row">
        <button class="btn" data-export-resource="events" data-export-match="${escapeHtml(match.id)}">导出事件</button>
        <a class="btn" href="${backNavigation.href}">${backNavigation.label}</a>
      </div>
    </section>
    ${renderScoreHeader(match)}
    <section class="match-mobile-utility" aria-label="比赛快捷操作">
      <span>${escapeHtml(venueLine)}</span>
      <div>
        <button class="btn" data-export-resource="events" data-export-match="${escapeHtml(match.id)}">导出</button>
        <a class="btn" href="${backNavigation.href}">${backNavigation.label}</a>
      </div>
    </section>
    <nav class="tabs">
      ${matchTabs
        .map(([key, label]) => `<a class="${tab === key ? "active" : ""}" href="${matchDetailHref(match.id, { tab: key })}">${label}</a>`)
        .join("")}
    </nav>
    <section id="match-tab">${renderMatchTab(match, tab, { h2hFilter, h2hExpanded, matchPrediction })}</section>
  `;
  if (tab === "timeline") initTimelineScroller();
  initLineupPitchGesture();
  if (tab === "lineups") restoreLineupPlayerFocus(params);
  if (match.status === "live") connectMatchStream(match.id);
}

function restoreLineupPlayerFocus(params = new URLSearchParams()) {
  const playerId = safeRouteId(params.get("focusPlayer"));
  if (!playerId) return;
  const area = params.get("focusArea") === "pitch" ? "pitch" : "roster";
  const target = document.getElementById(lineupPlayerAnchor(playerId, area));
  if (!target) return;
  requestAnimationFrame(() => {
    target.classList.add("lineup-return-focus");
    target.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    target.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove("lineup-return-focus"), 1800);
  });
}

function renderScoreHeader(match) {
  const homeLineup = match.lineups?.[match.homeTeam.id] || [];
  const awayLineup = match.lineups?.[match.awayTeam.id] || [];
  const homeFormation = lineupFormation(homeLineup) || match.formations?.[match.homeTeam.id] || "-";
  const awayFormation = lineupFormation(awayLineup) || match.formations?.[match.awayTeam.id] || "-";
  return `
    <section class="score-header" id="score-header">
      ${renderScoreTeamLink(match.homeTeam, homeFormation, "home")}
      <div class="result">
        <div id="score-status">${statusBadge(match)} ${match.needsReview ? '<span class="badge review">待复核</span>' : ""}</div>
        <div class="numbers" id="score-numbers">${escapeHtml(scoreText(match))}</div>
        <div class="score-kickoff">${escapeHtml(formatDate(match.kickoffAt))}</div>
      </div>
      ${renderScoreTeamLink(match.awayTeam, awayFormation, "away")}
    </section>
  `;
}

function renderScoreTeamLink(team, formation, side) {
  const teamName = teamDisplayName(team, side === "home" ? "主队" : "客队");
  const content = `
    ${teamLogo(team)}
    <div class="score-team-copy">
      <h2>${escapeHtml(teamName)}</h2>
      <span class="score-team-meta">${escapeHtml(team?.code || (side === "home" ? "主队" : "客队"))} · ${escapeHtml(formation)}</span>
    </div>
  `;
  if (!team?.id || !isKnownTeam(team)) return `<div class="club ${escapeHtml(side)}">${content}</div>`;
  return `
    <a
      class="club ${escapeHtml(side)} score-team-link"
      href="${hashHref(`/teams/${team.id}`)}"
      aria-label="查看${escapeHtml(teamName)}球队详情"
      title="查看${escapeHtml(teamName)}球队详情"
    >
      ${content}
      <span class="score-team-link-indicator" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path d="M3 13h10M4.25 13V7.1L8 4.6l3.75 2.5V13M6.25 8.4h3.5M8 8.4V13" />
        </svg>
        <span>球队主页</span>
      </span>
    </a>
  `;
}

function renderMatchTab(match, tab, options = {}) {
  if (tab === "score-prediction") return renderScorePredictionTab(match, options.matchPrediction);
  if (tab === "lineups") return renderLineups(match);
  if (tab === "stats") return renderStats(match);
  if (tab === "h2h") return renderH2H(match.h2h, match, options);
  if (tab === "source") return renderSources(match);
  return renderTimeline(match);
}

function renderScorePredictionTab(match, prediction) {
  return renderSpmPredictionVisual(prediction, match, "detail") || renderSpmPredictionUnavailable(prediction, match, "detail") || `<div class="empty">本场暂未生成 W32-SPM 比分预测</div>`;
}

function renderTimeline(matchOrEvents) {
  const match = Array.isArray(matchOrEvents) ? { events: matchOrEvents } : matchOrEvents || {};
  const events = match.events || [];
  if (!events.length) return `<div class="empty">暂无事件</div>`;
  const homeEvents = match.homeTeam ? events.filter((event) => statsEventMatchesTeam(event, match.homeTeam)).length : 0;
  const awayEvents = match.awayTeam ? events.filter((event) => statsEventMatchesTeam(event, match.awayTeam)).length : 0;
  const goals = events.filter((event) => (event.eventType || event.type) === "goal" && !statsEventIsPenaltyShootout(event)).length;
  const shots = events.filter((event) => ["shot_on_target", "shot_off_target", "shot_blocked"].includes(event.eventType || event.type)).length;
  const discipline = events.filter((event) => ["yellow_card", "red_card", "foul"].includes(event.eventType || event.type)).length;
  const substitutions = events.filter((event) => (event.eventType || event.type) === "substitution").length;
  const lastMinute = Math.max(0, ...events.map((event) => attackEventMinute(event) || 0));
  const timelineBody = renderTimelineEvents(events, match);
  return `
    <section class="timeline-panel" id="timeline-content" aria-label="比赛时间线">
      <div class="timeline-overview">
        <div class="timeline-title">
          <span>比赛脉络</span>
          <strong>${escapeHtml(match.homeTeam?.code || "主队")} / ${escapeHtml(match.awayTeam?.code || "客队")} · ${events.length} 个事件</strong>
        </div>
        <div class="timeline-teams">
          ${renderTimelineTeamSummary(match.homeTeam, "home", homeEvents)}
          <div class="timeline-score-chip">
            <span>${escapeHtml(statusLabels[match.status] || match.statusDetail || "比赛")}</span>
            <strong>${escapeHtml(scoreText(match))}</strong>
            <small>${lastMinute ? `${lastMinute}'` : escapeHtml(formatDate(match.kickoffAt || ""))}</small>
          </div>
          ${renderTimelineTeamSummary(match.awayTeam, "away", awayEvents)}
        </div>
        <div class="timeline-metrics" aria-label="时间线事件概览">
          ${renderTimelineMetric("进球", goals, "score")}
          ${renderTimelineMetric("射门事件", shots, "attack")}
          ${renderTimelineMetric("对抗", discipline, "duel")}
          ${renderTimelineMetric("换人", substitutions, "sub")}
        </div>
      </div>
      <div class="timeline-scroll-shell" data-timeline-scroll-shell>
        <div class="timeline-scroll-boundary-head">
          <span class="timeline-scroll-boundary-title">
            <span class="timeline-scroll-boundary-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 4.5h8M8 19.5h8M6 8.5h12M6 15.5h12"/><path d="m4 6 2-2 2 2M16 18l2 2 2-2"/></svg>
            </span>
            <span>
              <strong>比赛事件阅读区</strong>
              <small>在彩色边框内上下滑动</small>
            </span>
          </span>
          <span class="timeline-scroll-boundary-hint"><i aria-hidden="true"></i>独立滚动</span>
        </div>
        <div class="timeline-scroll" data-timeline-scroll role="region" aria-label="比赛事件，可上下滑动查看" tabindex="0">
          <div class="timeline" id="timeline-list">${timelineBody}</div>
        </div>
        <div class="timeline-scroll-controller" data-timeline-scroll-controller aria-label="时间线滚动控制">
          <button type="button" data-timeline-scroll-step="-1" aria-label="向上翻阅时间线" title="向上翻阅">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 12.5 4.5-5 4.5 5"/></svg>
          </button>
          <div class="timeline-scroll-rail" data-timeline-scroll-rail>
            <span class="timeline-scroll-track" aria-hidden="true"></span>
            <span class="timeline-scroll-progress" aria-hidden="true"></span>
            <span class="timeline-scroll-thumb" aria-hidden="true"><i></i><i></i><i></i></span>
            <input
              class="timeline-scroll-range"
              data-timeline-scroll-range
              type="range"
              min="0"
              max="1000"
              step="1"
              value="0"
              aria-label="时间线阅读位置"
              aria-valuetext="顶部"
            />
          </div>
          <button type="button" data-timeline-scroll-step="1" aria-label="向下翻阅时间线" title="向下翻阅">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 5 4.5-5"/></svg>
          </button>
        </div>
      </div>
    </section>
  `;
}

let activeTimelineResizeObserver = null;
let activeTimelineScrollFrame = null;
let activeTimelineScrollStateTimer = null;
let activeTimelineEventAbortController = null;

function initTimelineScroller() {
  if (activeTimelineResizeObserver) {
    activeTimelineResizeObserver.disconnect();
    activeTimelineResizeObserver = null;
  }
  if (activeTimelineScrollFrame !== null) {
    window.cancelAnimationFrame(activeTimelineScrollFrame);
    activeTimelineScrollFrame = null;
  }
  if (activeTimelineScrollStateTimer !== null) {
    window.clearTimeout(activeTimelineScrollStateTimer);
    activeTimelineScrollStateTimer = null;
  }
  if (activeTimelineEventAbortController) {
    activeTimelineEventAbortController.abort();
    activeTimelineEventAbortController = null;
  }

  const shell = document.querySelector("[data-timeline-scroll-shell]");
  const viewport = shell?.querySelector("[data-timeline-scroll]");
  const controller = shell?.querySelector("[data-timeline-scroll-controller]");
  const rail = shell?.querySelector("[data-timeline-scroll-rail]");
  const range = shell?.querySelector("[data-timeline-scroll-range]");
  const buttons = Array.from(shell?.querySelectorAll("[data-timeline-scroll-step]") || []);
  if (!shell || !viewport || !controller || !rail || !range) return;

  shell.classList.add("is-enhanced");
  activeTimelineEventAbortController = new AbortController();
  const eventOptions = { signal: activeTimelineEventAbortController.signal };
  const passiveEventOptions = { passive: true, signal: activeTimelineEventAbortController.signal };
  const blockingEventOptions = { passive: false, signal: activeTimelineEventAbortController.signal };
  let activeTouchY = null;

  const maximumScroll = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const applyRangeValue = () => {
    const maximum = maximumScroll();
    const ratio = Math.max(0, Math.min(1, Number(range.value || 0) / 1000));
    viewport.scrollTop = maximum * ratio;
  };
  const update = () => {
    activeTimelineScrollFrame = null;
    const maximum = maximumScroll();
    const inactive = maximum <= 1;
    const ratio = inactive ? 0 : Math.max(0, Math.min(1, viewport.scrollTop / maximum));
    const percentage = Math.round(ratio * 100);
    const atStart = inactive || ratio <= 0.003;
    const atEnd = inactive || ratio >= 0.997;
    const thumbHeight = 46;
    const railInset = 8;
    const travel = Math.max(0, rail.clientHeight - railInset * 2 - thumbHeight);
    const progressTravel = Math.max(0, rail.clientHeight - railInset * 2);

    range.value = String(Math.round(ratio * 1000));
    range.disabled = inactive;
    range.setAttribute("aria-valuetext", inactive ? "全部事件已显示" : `${percentage}% · ${ratio <= 0.01 ? "顶部" : ratio >= 0.99 ? "底部" : "时间线中段"}`);
    controller.style.setProperty("--timeline-thumb-y", `${railInset + ratio * travel}px`);
    controller.style.setProperty("--timeline-progress-height", `${Math.max(8, ratio * progressTravel)}px`);
    shell.classList.toggle("is-inactive", inactive);
    shell.classList.toggle("is-at-start", atStart);
    shell.classList.toggle("is-at-end", atEnd);
    buttons.forEach((button) => {
      const direction = Number(button.dataset.timelineScrollStep || 0);
      button.disabled = inactive || (direction < 0 && atStart) || (direction > 0 && atEnd);
    });
  };
  const scheduleUpdate = () => {
    if (activeTimelineScrollFrame !== null) return;
    activeTimelineScrollFrame = window.requestAnimationFrame(update);
  };
  const markScrolling = () => {
    shell.classList.add("is-scrolling");
    if (activeTimelineScrollStateTimer !== null) window.clearTimeout(activeTimelineScrollStateTimer);
    activeTimelineScrollStateTimer = window.setTimeout(() => {
      shell.classList.remove("is-scrolling");
      activeTimelineScrollStateTimer = null;
    }, 520);
    scheduleUpdate();
  };
  const beginInteraction = () => shell.classList.add("is-interacting");
  const endInteraction = () => shell.classList.remove("is-interacting");
  const setRangeFromPointer = (event) => {
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    range.value = String(Math.round(ratio * 1000));
    applyRangeValue();
    update();
  };

  viewport.addEventListener("scroll", markScrolling, passiveEventOptions);
  viewport.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    viewport.scrollTop += event.deltaY * unit;
    markScrolling();
  }, blockingEventOptions);
  viewport.addEventListener("pointerdown", beginInteraction, passiveEventOptions);
  viewport.addEventListener("touchstart", (event) => {
    activeTouchY = event.touches[0]?.clientY ?? null;
    beginInteraction();
  }, passiveEventOptions);
  viewport.addEventListener("touchmove", (event) => {
    const currentY = event.touches[0]?.clientY;
    if (!Number.isFinite(currentY) || !Number.isFinite(activeTouchY)) return;
    const movement = currentY - activeTouchY;
    const maximum = maximumScroll();
    const leavingTop = viewport.scrollTop <= 1 && movement > 0;
    const leavingBottom = viewport.scrollTop >= maximum - 1 && movement < 0;
    if (leavingTop || leavingBottom) event.preventDefault();
    activeTouchY = currentY;
  }, blockingEventOptions);
  viewport.addEventListener("touchend", () => {
    activeTouchY = null;
    endInteraction();
  }, passiveEventOptions);
  viewport.addEventListener("touchcancel", () => {
    activeTouchY = null;
    endInteraction();
  }, passiveEventOptions);
  document.addEventListener("pointerup", endInteraction, passiveEventOptions);
  document.addEventListener("pointercancel", endInteraction, passiveEventOptions);
  viewport.addEventListener("blur", endInteraction, eventOptions);
  range.addEventListener("input", () => {
    applyRangeValue();
    update();
  }, eventOptions);
  rail.addEventListener("pointerdown", (event) => {
    if (range.disabled) return;
    beginInteraction();
    rail.setPointerCapture(event.pointerId);
    range.focus({ preventScroll: true });
    setRangeFromPointer(event);
  }, eventOptions);
  rail.addEventListener("pointermove", (event) => {
    if (!rail.hasPointerCapture(event.pointerId)) return;
    setRangeFromPointer(event);
  }, eventOptions);
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.timelineScrollStep || 0);
      viewport.scrollBy({ top: direction * viewport.clientHeight * 0.82, behavior: "smooth" });
    }, eventOptions);
  });

  if (typeof ResizeObserver === "function") {
    activeTimelineResizeObserver = new ResizeObserver(scheduleUpdate);
    activeTimelineResizeObserver.observe(viewport);
    const timeline = viewport.querySelector(".timeline");
    if (timeline) activeTimelineResizeObserver.observe(timeline);
  }
  window.requestAnimationFrame(update);
}

function renderTimelineTeamSummary(team, side, count) {
  return `
    <div class="timeline-team-summary ${escapeHtml(side)}">
      ${team ? teamLogo(team, "team-logo small") : '<span class="team-logo small placeholder"></span>'}
      <span>
        <strong>${escapeHtml(teamDisplayName(team, side === "home" ? "主队" : "客队"))}</strong>
        <small>${escapeHtml(team?.code || (side === "home" ? "主场" : "客场"))} · ${count} 事件</small>
      </span>
    </div>
  `;
}

function renderTimelineMetric(label, value, kind) {
  return `
    <span class="timeline-metric ${escapeHtml(kind)}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </span>
  `;
}

function renderTimelineEvents(events, match = {}) {
  const timelineMatch = {
    ...match,
    events: Array.isArray(match.events) ? match.events : events,
  };
  const orderedEvents = timelineCanonicalEvents(events, timelineMatch);
  let currentPeriod = "";
  let startInserted = false;
  const blocks = [];
  orderedEvents.forEach((event) => {
    const effectivePeriod = timelineEffectivePeriod(event, timelineMatch);
    const period = timelineDisplayPeriodLabel(event, timelineMatch);
    if (period && period !== currentPeriod) {
      blocks.push(`<div class="timeline-period"><span>${escapeHtml(period)}</span></div>`);
      currentPeriod = period;
    }
    if (!startInserted && timelineIsMatchPlayPeriod(effectivePeriod)) {
      blocks.push(renderTimelineBoundary("start", timelineMatch, orderedEvents));
      startInserted = true;
    }
    blocks.push(renderTimelineEvent(event, timelineMatch));
  });
  if (timelineHasFinished(timelineMatch, orderedEvents)) blocks.push(renderTimelineBoundary("end", timelineMatch, orderedEvents));
  return blocks.join("");
}

function timelineCanonicalEvents(events, match = {}) {
  return (Array.isArray(events) ? events : [])
    .map((event, sourceIndex) => ({
      event,
      sourceIndex,
      period: timelineEffectivePeriod(event, match),
    }))
    .sort((left, right) => {
      const phaseOrder = timelinePeriodRank(left.period) - timelinePeriodRank(right.period);
      if (phaseOrder) return phaseOrder;
      const minuteOrder = timelineEventSortMinute(left.event) - timelineEventSortMinute(right.event);
      return minuteOrder || left.sourceIndex - right.sourceIndex;
    })
    .map(({ event }) => event);
}

function timelinePeriodRank(period) {
  const ranks = {
    pre_match: 0,
    first_half: 10,
    half_time: 20,
    second_half: 30,
    match: 35,
    regulation_end: 40,
    extra_time_first_half: 50,
    extra_time_half_time: 60,
    extra_time_second_half: 70,
    penalty: 80,
    full_time: 90,
  };
  return ranks[period] ?? 95;
}

function timelineEventSortMinute(event = {}) {
  const minute = Number(event.minute);
  const extraMinute = Number(event.extraMinute);
  const base = Number.isFinite(minute) ? minute : -1;
  const type = event.eventType || event.type || "";
  return base + (type !== "added_time" && Number.isFinite(extraMinute) ? extraMinute / 100 : 0);
}

function renderEvent(event) {
  return renderTimelineEvent(event, {});
}

function renderTimelineBoundary(kind, match = {}, events = []) {
  const isStart = kind === "start";
  const homeName = teamDisplayName(match.homeTeam, "主队");
  const awayName = teamDisplayName(match.awayTeam, "客队");
  const kickoff = formatDate(match.kickoffAt || "");
  const venue = venueDisplay(match.venue, "场地待确认");
  const lastMinute = Math.max(0, ...events.map((event) => attackEventMinute(event) || 0));
  const chips = isStart
    ? [kickoff, venue]
    : [`全场比分 ${scoreText(match)}`, lastMinute ? `比赛时长 ${lastMinute}'` : "", statusLabels[match.status] || match.statusDetail || ""];
  return `
    <article class="timeline-boundary ${escapeHtml(kind)}">
      <span class="timeline-boundary-marker">${isStart ? "始" : "终"}</span>
      <div class="timeline-boundary-card">
        <strong>${isStart ? "比赛开始" : "比赛结束"}</strong>
        <p>${escapeHtml(isStart ? `${homeName} vs ${awayName} 正式开球` : `${homeName} ${scoreText(match)} ${awayName}`)}</p>
        <div class="timeline-boundary-meta">
          ${chips.filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderTimelineEvent(event, match = {}) {
  const type = event.eventType || event.type || "";
  const minute = Number(event.minute);
  const hasMinute = event.minute !== null && event.minute !== undefined && event.minute !== "" && Number.isFinite(minute);
  const time = hasMinute ? `${minute}${type !== "added_time" && event.extraMinute ? `+${event.extraMinute}` : ""}'` : "";
  const side = timelineEventSide(event, match);
  const isRegulationEnd = timelineIsRegulationEnd(event, match);
  const label = timelineEventLabel(event, match);
  const score = isRegulationEnd ? timelineRegulationScore(event, match) : eventScore(event);
  const description = isRegulationEnd
    ? `90分钟常规赛结束。 比分 ${score?.label || "待确认"}。`
    : event.description || label;
  const teamName = event.team ? teamDisplayName(event.team, "") : "";
  const playerName = event.player?.name || "";
  const relatedName = event.relatedPlayer?.name || "";
  const meta = [
    teamName,
    playerName,
    relatedName ? `${relatedEventLabel(type)} ${relatedName}` : "",
  ].filter(Boolean);
  return `
    <article class="timeline-event ${escapeHtml(side)} ${escapeHtml(type)}">
      <div class="timeline-event-rail">
        <span class="timeline-event-time">${escapeHtml(time || "-")}</span>
        <span class="timeline-event-dot">${escapeHtml(isRegulationEnd ? "90" : shortEvent(type))}</span>
      </div>
      <div class="timeline-event-card">
        <div class="timeline-event-head">
          <span class="timeline-event-label">${escapeHtml(label)}</span>
          ${score ? `<span class="timeline-score-badge">${escapeHtml(score.label)}</span>` : ""}
        </div>
        <p>${escapeHtml(description)}</p>
        ${meta.length ? `<div class="timeline-event-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function timelineEventSide(event, match) {
  if (match.homeTeam && statsEventMatchesTeam(event, match.homeTeam)) return "home";
  if (match.awayTeam && statsEventMatchesTeam(event, match.awayTeam)) return "away";
  return "neutral";
}

function timelineIsMatchPlayPeriod(period) {
  return [
    "first_half",
    "second_half",
    "extra_time_first_half",
    "extra_time_second_half",
    "penalty",
    "match",
  ].includes(period);
}

function timelineHasFinished(match = {}, events = []) {
  const status = String(match.status || "").toLowerCase();
  const detail = String(match.statusDetail || "").toLowerCase();
  if (["finished", "ft", "full_time"].includes(status)) return true;
  if (detail.includes("完场") || detail.includes("全场") || detail.includes("full time")) return true;
  return events.some((event) => {
    const type = event.eventType || event.type || "";
    return type === "full_time" || type === "penalty_win" || event.period === "full_time";
  });
}

function timelineEventLabel(event, match = {}) {
  const type = event.eventType || event.type || "";
  if (timelineIsRegulationEnd(event, match)) return "90分钟常规赛结束";
  if (type === "goal" && statsEventIsOwnGoal(event)) return "乌龙球";
  if (type === "goal" && statsEventIsPenalty(event)) return "点球进球";
  if (type === "goal" && statsEventIsDirectFreeKickGoal(event)) return "任意球破门";
  if (type === "goal" && statsEventIsSetPieceGoal(event)) return "定位球进球";
  return eventLabels[type] || type || "事件";
}

function timelineDisplayPeriodLabel(event, match = {}) {
  return timelinePeriodLabel(timelineEffectivePeriod(event, match));
}

function timelineEffectivePeriod(event = {}, match = {}) {
  const rawPeriod = String(event.period || "").toLowerCase();
  const rawText = statsEventRawText(event).toLowerCase();
  if (timelineIsRegulationEnd(event, match)) return "regulation_end";
  if (rawText.includes("second half extra time")) return "extra_time_second_half";
  if (rawText.includes("first half extra time")) {
    return rawText.includes(" ends") ? "extra_time_half_time" : "extra_time_first_half";
  }
  if (["penalty_shootout", "penalty_shoot-out", "shootout"].includes(rawPeriod)) return "penalty";

  const minute = Number(event.minute);
  if (rawPeriod === "extra_time") {
    return Number.isFinite(minute) && minute > 105 ? "extra_time_second_half" : "extra_time_first_half";
  }
  if (rawPeriod === "second_half" && timelineHasExtraTime(match) && Number.isFinite(minute)) {
    if (minute > 105) return "extra_time_second_half";
    if (minute > 90) return "extra_time_first_half";
  }
  return rawPeriod;
}

function timelineHasExtraTime(match = {}) {
  const detail = String(match.statusDetail || "").toLowerCase();
  if (detail.includes("加时") || detail.includes("extra time")) return true;
  return (match.events || []).some((event) => [
    "extra_time",
    "extra_time_first_half",
    "extra_time_second_half",
  ].includes(String(event.period || "").toLowerCase()) || statsEventRawText(event).toLowerCase().includes("extra time"));
}

function timelineIsRegulationEnd(event, match = {}) {
  const type = event.eventType || event.type || "";
  if (type !== "full_time" || !timelineHasExtraTime(match)) return false;
  const minute = Number(event.minute);
  const raw = statsEventRawText(event).toLowerCase();
  return raw.includes("second half ends") || (Number.isFinite(minute) && minute <= 90);
}

function timelineRegulationScore(event, match = {}) {
  const raw = statsEventRawText(event);
  const rawScore = raw.match(/second half ends,\s+.+?\s+(\d+),\s+.+?\s+(\d+)\.?$/i);
  if (rawScore) {
    const home = Number(rawScore[1]);
    const away = Number(rawScore[2]);
    return { home, away, label: `${home}-${away}` };
  }

  let home = 0;
  let away = 0;
  (match.events || []).forEach((item) => {
    if ((item.eventType || item.type) !== "goal" || statsEventIsPenaltyShootout(item)) return;
    const period = timelineEffectivePeriod(item, match);
    if (period.startsWith("extra_time") || period === "extra_time") return;
    if (statsEventMatchesTeam(item, match.homeTeam)) home += 1;
    else if (statsEventMatchesTeam(item, match.awayTeam)) away += 1;
  });
  return { home, away, label: `${home}-${away}` };
}

function timelinePeriodLabel(period) {
  return {
    pre_match: "赛前",
    first_half: "上半场",
    half_time: "半场",
    second_half: "下半场",
    regulation_end: "90分钟结束",
    extra_time_first_half: "加时上半场",
    extra_time_half_time: "加时半场",
    extra_time_second_half: "加时下半场",
    penalty: "点球大战",
    full_time: "终场",
    match: "比赛",
  }[period] || period || "";
}

function withComputedGoalScores(match) {
  if (!match || !Array.isArray(match.events) || !match.events.length) return match;
  let home = 0;
  let away = 0;
  const events = match.events.map((event) => {
    const next = { ...event };
    if ((event.eventType || event.type) !== "goal") return next;
    if (statsEventIsPenaltyShootout(event)) return next;
    if (statsEventMatchesTeam(event, match.homeTeam)) {
      home += 1;
    } else if (statsEventMatchesTeam(event, match.awayTeam)) {
      away += 1;
    }
    next.computedScore = { home, away };
    return next;
  });
  return { ...match, events };
}

function eventScore(event) {
  const score = event?.computedScore || event?.score;
  if (score?.home === null || score?.home === undefined || score?.away === null || score?.away === undefined) return null;
  return { home: score.home, away: score.away, label: `${score.home}-${score.away}` };
}

function relatedEventLabel(type) {
  if (type === "substitution") return "换下";
  if (type === "foul") return "被侵犯";
  if (type === "shot_on_target" || type === "shot_off_target" || type === "shot_blocked" || type === "goal" || type === "goal_disallowed") return "参与";
  return "关联";
}

function shortEvent(type) {
  return {
    goal: "G",
    goal_disallowed: "X",
    yellow_card: "Y",
    red_card: "R",
    substitution: "S",
    half_time: "HT",
    full_time: "FT",
    penalty_win: "P",
    kickoff: "KO",
    lineups_announced: "XI",
    added_time: "+",
    shot_on_target: "ST",
    shot_off_target: "SH",
    shot_blocked: "BL",
    foul: "F",
    corner: "C",
    offside: "O",
    var: "VAR",
    delay_start: "D",
    delay_end: "▶",
  }[type] || "E";
}

function renderLineups(match) {
  const home = match.lineups?.[match.homeTeam.id] || [];
  const away = match.lineups?.[match.awayTeam.id] || [];
  if (!home.length && !away.length) return `<div class="empty">百度体育当前未提供本场首发阵容站位</div>`;
  const homeFormation = lineupFormation(home);
  const awayFormation = lineupFormation(away);
  return `
    <section class="lineup-overview">
      ${renderLineupMatchMeta(match)}
      ${renderLineupPitch(match, home, away, homeFormation, awayFormation)}
    </section>
    <section class="lineup-rosters">
      ${renderLineupTeam(match.homeTeam, home, homeFormation, match.coaches?.[match.homeTeam.id])}
      ${renderLineupTeam(match.awayTeam, away, awayFormation, match.coaches?.[match.awayTeam.id])}
    </section>
  `;
}

function renderLineupMatchMeta(match) {
  const venue = [match.venue?.name, match.venue?.city, match.venue?.countryName].filter(Boolean).join(" · ");
  return `
    <section class="lineup-match-context">
      <div class="lineup-detail-strip">
        <span>${escapeHtml(formatDate(match.kickoffAt))}</span>
        <span>${escapeHtml(venue || "场地未公布")}</span>
      </div>
      ${renderLineupOfficials(match.officials)}
    </section>
  `;
}

function currentRoleViewMode() {
  return "display";
}

function renderLineupOfficials(officials) {
  const available = Array.isArray(officials)
    ? officials.filter((official) => official?.name && official?.roleLabel)
    : [];
  if (!available.length) return "";
  return `
    <div class="lineup-officials" aria-label="比赛官员">
      <span class="lineup-officials-heading"><i aria-hidden="true"></i><span><small>MATCH OFFICIALS</small><strong>比赛官员</strong></span></span>
      <span class="lineup-officials-list">
        ${available.map((official) => `
          <span class="lineup-official-chip" title="${escapeHtml([
            official.source || "比赛官方数据",
            official.nameOriginal ? `原名：${official.nameOriginal}` : "",
          ].filter(Boolean).join(" · "))}">
            <small>${escapeHtml(official.roleLabel)}</small>
            <strong>${escapeHtml(official.name)}</strong>
          </span>
        `).join("")}
      </span>
    </div>
  `;
}

function lineupRatingInfo(row) {
  const raw = row?.rating;
  const detail = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const candidate = detail
    ? (detail.value ?? detail.rating ?? detail.score)
    : raw;
  if (candidate === null || candidate === undefined || candidate === "") return null;
  const value = Number(candidate);
  if (!Number.isFinite(value) || value <= 0 || value > 10) return null;
  const rounded = Math.round(value * 10) / 10;
  const tier = rounded >= 8
    ? { className: "elite", label: "顶级表现" }
    : rounded >= 7
      ? { className: "strong", label: "出色表现" }
      : rounded >= 6
        ? { className: "steady", label: "稳定表现" }
        : { className: "low", label: "低于平均" };
  const capturedAt = detail?.capturedAt
    || detail?.captured_at
    || row?.ratingCapturedAt
    || row?.rating_captured_at
    || row?.capturedAt
    || "";
  return {
    value: rounded,
    label: String(rounded).replace(/\.0$/, ""),
    className: tier.className,
    tierLabel: tier.label,
    capturedAt,
  };
}

function formatLineupRatingCapturedAt(capturedAt) {
  if (!capturedAt) return "";
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return String(capturedAt);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function lineupRatingAccessibleLabel(info) {
  if (!info) return "";
  const capturedAt = formatLineupRatingCapturedAt(info.capturedAt);
  return [
    `API-Football 评分 ${info.label}/10`,
    info.tierLabel,
    capturedAt ? `抓取于 ${capturedAt}` : "",
  ].filter(Boolean).join(" · ");
}

function renderLineupRatingBadge(row, mode = "roster") {
  const info = lineupRatingInfo(row);
  if (!info) return "";
  const accessibleLabel = lineupRatingAccessibleLabel(info);
  return `<span class="lineup-rating-badge ${escapeHtml(info.className)} ${mode === "pitch" ? "pitch-rating" : "roster-rating"}" title="${escapeHtml(accessibleLabel)}" aria-label="${escapeHtml(accessibleLabel)}">${escapeHtml(info.label)}</span>`;
}

function lineupFormation(rows) {
  const formation = lineupFormationRaw(rows);
  return displayFormation(rows, formation);
}

function lineupFormationRaw(rows) {
  return rows.find((row) => row.teamFormation)?.teamFormation || "";
}

function displayFormation(rows, formation) {
  if (!formation) return "";
  return normalizedFormationLines(rows, formation).join("-") || formation || "";
}

function renderLineupPitch(match, homeRows, awayRows, homeFormation, awayFormation) {
  return `
    <div class="lineup-pitch-card" data-lineup-pitch-card role="region" aria-label="首发阵容触控浏览区">
      <button class="lineup-pitch-lock" type="button" data-lineup-pitch-lock aria-pressed="true" aria-label="阵容触控已固定，点击解除固定">
        <span class="lineup-pitch-lock-led" aria-hidden="true"></span>
        <span class="lineup-pitch-lock-copy">
          <strong data-lineup-pitch-lock-label>已固定</strong>
          <small data-lineup-pitch-lock-hint>拖动巡视</small>
        </span>
      </button>
      <div class="pitch-meta left">${teamLogo(match.homeTeam, "team-logo small")}${renderPitchMetaText(homeFormation, homeRows)}</div>
      <div class="pitch-meta right">${renderPitchMetaText(awayFormation, awayRows)}${teamLogo(match.awayTeam, "team-logo small")}</div>
      <div class="lineup-pitch" data-lineup-pitch aria-label="首发阵型图">
        <div class="pitch-line half"></div>
        <div class="pitch-circle"></div>
        <div class="pitch-box left"></div>
        <div class="pitch-box right"></div>
        ${renderPitchPlayers(homeRows, "home", homeFormation)}
        ${renderPitchPlayers(awayRows, "away", awayFormation)}
        <span class="lineup-touch-cursor" data-lineup-touch-cursor aria-hidden="true"><i></i></span>
      </div>
      <span class="lineup-gesture-announcer" data-lineup-gesture-announcer aria-live="polite"></span>
      ${renderPitchDirectionHint(match)}
    </div>
  `;
}

let activeLineupGestureAbortController = null;
let lineupGestureLockedPreference = true;

function initLineupPitchGesture() {
  if (activeLineupGestureAbortController) {
    activeLineupGestureAbortController.abort();
    activeLineupGestureAbortController = null;
  }

  const cards = Array.from(document.querySelectorAll("[data-lineup-pitch-card]"));
  if (!cards.length) return;
  const mobileViewport = window.matchMedia?.("(max-width: 900px), (hover: none) and (pointer: coarse)");
  if (!mobileViewport?.matches) return;

  activeLineupGestureAbortController = new AbortController();
  const eventOptions = { signal: activeLineupGestureAbortController.signal };
  const blockingEventOptions = { passive: false, signal: activeLineupGestureAbortController.signal };

  cards.forEach((card) => {
    const pitch = card.querySelector("[data-lineup-pitch]");
    const lockButton = card.querySelector("[data-lineup-pitch-lock]");
    const lockLabel = card.querySelector("[data-lineup-pitch-lock-label]");
    const lockHint = card.querySelector("[data-lineup-pitch-lock-hint]");
    const cursor = card.querySelector("[data-lineup-touch-cursor]");
    const announcer = card.querySelector("[data-lineup-gesture-announcer]");
    const players = Array.from(card.querySelectorAll(".pitch-player"));
    if (!pitch || !lockButton || !cursor || !players.length) return;

    let activePointerId = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let dragged = false;
    let suppressPlayerClick = false;
    let inspectedPlayer = null;

    const clearInspection = () => {
      players.forEach((player) => player.classList.remove("is-touch-inspected"));
      inspectedPlayer = null;
      cursor.classList.remove("is-visible");
    };

    const playerSpokenLabel = (player) => {
      const number = player.querySelector(".pitch-number")?.textContent?.trim();
      const name = player.querySelector(".pitch-name-text")?.textContent?.trim();
      const rating = player.querySelector(".pitch-rating")?.textContent?.trim();
      return [number ? `${number}号` : "", name || "球员", rating ? `评分 ${rating}` : ""].filter(Boolean).join(" · ");
    };

    const setInspectedPlayer = (player) => {
      if (player === inspectedPlayer) return;
      players.forEach((item) => item.classList.toggle("is-touch-inspected", item === player));
      inspectedPlayer = player;
      if (announcer && player) announcer.textContent = `已定位 ${playerSpokenLabel(player)}`;
    };

    const inspectAt = (clientX, clientY) => {
      const pitchRect = pitch.getBoundingClientRect();
      const localX = Math.max(8, Math.min(pitchRect.width - 8, clientX - pitchRect.left));
      const localY = Math.max(8, Math.min(pitchRect.height - 8, clientY - pitchRect.top));
      cursor.style.setProperty("--lineup-touch-x", `${localX}px`);
      cursor.style.setProperty("--lineup-touch-y", `${localY}px`);
      cursor.classList.add("is-visible");

      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      players.forEach((player) => {
        const rect = player.getBoundingClientRect();
        const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = player;
        }
      });
      if (nearest) setInspectedPlayer(nearest);
    };

    const setLocked = (locked, announce = false) => {
      lineupGestureLockedPreference = locked;
      card.classList.add("is-gesture-enhanced");
      card.classList.toggle("is-gesture-locked", locked);
      card.classList.toggle("is-gesture-unlocked", !locked);
      lockButton.setAttribute("aria-pressed", String(locked));
      lockButton.setAttribute("aria-label", locked ? "阵容触控已固定，点击解除固定" : "阵容触控未固定，点击固定阵容区");
      if (lockLabel) lockLabel.textContent = locked ? "已固定" : "未固定";
      if (lockHint) lockHint.textContent = locked ? "拖动巡视" : "页面滑动";
      if (!locked) {
        activePointerId = null;
        dragged = false;
        card.classList.remove("is-gesture-active");
        clearInspection();
      }
      if (announce && announcer) {
        announcer.textContent = locked
          ? "阵容触控固定已开启，在球场内拖动可巡视球员，页面不会移动"
          : "阵容触控固定已关闭，可正常滑动页面";
      }
    };

    lockButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setLocked(!card.classList.contains("is-gesture-locked"), true);
    }, eventOptions);

    card.addEventListener("pointerdown", (event) => {
      if (!card.classList.contains("is-gesture-locked") || event.target.closest("[data-lineup-pitch-lock]")) return;
      activePointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      dragged = false;
      suppressPlayerClick = false;
      card.classList.add("is-gesture-active");
      inspectAt(event.clientX, event.clientY);
    }, eventOptions);

    document.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId || !card.classList.contains("is-gesture-locked")) return;
      const travel = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
      if (travel > 7) dragged = true;
      if (event.cancelable) event.preventDefault();
      inspectAt(event.clientX, event.clientY);
    }, blockingEventOptions);

    const endPointerInspection = (event) => {
      if (event.pointerId !== activePointerId) return;
      suppressPlayerClick = dragged;
      activePointerId = null;
      dragged = false;
      card.classList.remove("is-gesture-active");
      cursor.classList.remove("is-visible");
      window.setTimeout(() => {
        suppressPlayerClick = false;
      }, 0);
    };

    document.addEventListener("pointerup", endPointerInspection, eventOptions);
    document.addEventListener("pointercancel", endPointerInspection, eventOptions);
    card.addEventListener("click", (event) => {
      if (!suppressPlayerClick || !event.target.closest(".pitch-player")) return;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true, signal: activeLineupGestureAbortController.signal });

    setLocked(lineupGestureLockedPreference);
  });
}

function renderPitchDirectionHint(match) {
  const homeName = teamDisplayName(match.homeTeam, "主队");
  const awayName = teamDisplayName(match.awayTeam, "客队");
  return `
    <footer class="pitch-direction-hint" aria-label="攻向提示">
      <span class="pitch-direction-team home" title="${escapeHtml(homeName)}向右进攻">
        ${teamLogo(match.homeTeam, "pitch-direction-flag")}
        <span class="pitch-direction-copy"><b>${escapeHtml(homeName)}</b><small>主队进攻</small></span>
        <strong class="pitch-direction-arrow" aria-hidden="true">→</strong>
      </span>
      <span class="pitch-direction-title"><i aria-hidden="true">⇄</i><small>攻向提示</small></span>
      <span class="pitch-direction-team away" title="${escapeHtml(awayName)}向左进攻">
        <strong class="pitch-direction-arrow" aria-hidden="true">←</strong>
        <span class="pitch-direction-copy"><b>${escapeHtml(awayName)}</b><small>客队进攻</small></span>
        ${teamLogo(match.awayTeam, "pitch-direction-flag")}
      </span>
    </footer>
  `;
}

function renderPitchMetaText(formation, rows) {
  const marketValue = starterMarketValueLabel(rows);
  return `
    <span class="pitch-meta-copy">
      <span class="pitch-meta-formation">${escapeHtml(formation || "-")}</span>
      ${marketValue ? `<span class="pitch-meta-market"><span>首发总身价</span><strong>${escapeHtml(marketValue)}</strong></span>` : ""}
    </span>
  `;
}

function parseFormation(formation) {
  const numbers = String(formation || "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (!numbers?.length || numbers.reduce((sum, item) => sum + item, 0) !== 10) return [4, 3, 3];
  return numbers;
}

function normalizedFormationLines(rows, formation) {
  const numbers = parseFormation(formation);
  if (shouldCollapseFrontPair(rows, numbers)) {
    return [...numbers.slice(0, -2), numbers[numbers.length - 2] + numbers[numbers.length - 1]];
  }
  return numbers;
}

function shouldCollapseFrontPair(rows, numbers) {
  if (numbers.length !== 4 || numbers[numbers.length - 2] !== 2 || numbers[numbers.length - 1] !== 1) return false;
  const outfield = rows.filter((row) => row.started && playerSlot(row) !== "GK");
  const supportLine = outfield.filter((row) => Number(row.tacticalLine) === numbers.length - 1);
  const strikerLine = outfield.filter((row) => Number(row.tacticalLine) === numbers.length);
  if (supportLine.length !== 2 || strikerLine.length !== 1) return false;
  const supportRoles = new Set(["RF", "LF", "RW", "LW", "CF-R", "CF-L"]);
  const centralRoles = new Set(["F", "ST", "CF"]);
  return supportLine.every((row) => supportRoles.has(tacticalRole(row))) && centralRoles.has(tacticalRole(strikerLine[0]));
}

const layoutDefenderRoles = new Set(["DF", "DEFENDER", "CB", "CCB", "LCB", "RCB", "CD", "CD-L", "CD-R", "CB-L", "CB-R", "LB", "RB", "LWB", "RWB", "SW"]);
const layoutMidfielderRoles = new Set(["MF", "MIDFIELDER", "M", "DMF", "LDMF", "RDMF", "DM", "LDM", "RDM", "DM-L", "DM-R", "CMF", "LCMF", "RCMF", "CM", "LCM", "RCM", "CM-L", "CM-R", "AMF", "LAMF", "RAMF", "AM", "CAM", "LAM", "RAM", "AM-L", "AM-R", "LM", "RM", "LMF", "RMF"]);
const layoutForwardRoles = new Set(["FW", "FORWARD", "F", "ST", "CF", "LS", "RS", "CF-L", "CF-R", "RCF", "LF", "RF", "LW", "RW", "LWF", "RWF", "SS"]);

function normalizeRoleCode(code) {
  const raw = String(code || "").trim().toUpperCase();
  if (["DF", "DEFENDER", "MF", "MIDFIELDER", "FW", "FORWARD"].includes(raw)) return raw;
  return roleAliases[raw] || raw;
}

function rawRole(row) {
  return String(row.specificPosition || row.tacticalRole || row.baiduPosition?.code || row.rawSlot || row.slot || row.player?.position || "").toUpperCase();
}

function canonicalRole(row) {
  return normalizeRoleCode(row.canonicalRole || row.standardPosition || row.displayRole || row.specificPosition || row.tacticalRole || row.player?.position || "");
}

function roleForMode(row) {
  return normalizeRoleCode(row.displayRole || row.canonicalRole || row.standardPosition || row.specificPosition || row.tacticalRole || row.baiduPosition?.code || row.player?.position || "") || "NA";
}

function roleConfidence(row) {
  return "";
}

function roleTooltip(row, displayRole = "") {
  const raw = rawRole(row) || "NA";
  const standard = canonicalRole(row) || "NA";
  const display = roleForMode(row);
  const slot = normalizeRoleCode(displayRole);
  const source = row.baiduPosition?.source || row.standardPositionSource || row.specificPositionSource || "百度体育";
  const baiduText = row.baiduPosition?.text || row.baiduPosition?.label || "";
  return [
    `司职: ${positionLabel(display)}`,
    baiduText ? `百度原始: ${baiduText}` : "",
    raw && raw !== display ? `原始: ${positionLabel(raw)}` : "",
    standard && standard !== display ? `标准: ${positionLabel(standard)}` : "",
    slot && slot !== display ? `站位槽: ${positionLabel(slot)}` : "",
    `来源: ${source}`,
  ].filter(Boolean).join(" | ");
}

function playerSlot(row) {
  const role = zoneRole(row);
  if (role === "GK" || role === "G" || role === "GOALKEEPER") return "GK";
  if (layoutForwardRoles.has(role)) return "FW";
  if (layoutDefenderRoles.has(role)) return "DF";
  if (layoutMidfielderRoles.has(role)) return "MF";
  const slot = String(row.slot || row.player?.position || "NA").toUpperCase();
  return ["GK", "DF", "MF", "FW"].includes(slot) ? slot : "NA";
}

function lineYPositions(count) {
  const presets = {
    1: [50],
    2: [34, 66],
    3: [24, 50, 76],
    4: [15, 38, 62, 85],
    5: [12, 31, 50, 69, 88],
  };
  return presets[count] || Array.from({ length: count }, (_, index) => Math.round(((index + 1) * 100) / (count + 1)));
}

function formationLineX(index, lineCount, side) {
  const presets = {
    1: [30],
    2: [18, 43],
    3: [17, 30, 43],
    4: [17, 30, 37, 43],
    5: [16, 28, 34.5, 39.5, 43],
  };
  const values = presets[lineCount];
  const step = lineCount > 1 ? 28 / (lineCount - 1) : 0;
  const x = values?.[index] ?? 17 + index * step;
  return side === "home" ? x : 100 - x;
}

function tacticalRole(row) {
  return rawRole(row);
}

function zoneRole(row) {
  return canonicalRole(row);
}

function roleLaneBand(role) {
  const code = String(role || "").toUpperCase();
  const wideLeft = new Set(["LB", "LWB", "LM", "LMF", "LMF", "LW", "LWF", "LF"]);
  const wideRight = new Set(["RB", "RWB", "RM", "RMF", "RMF", "RW", "RWF", "RF"]);
  const insideLeft = new Set(["LCB", "CD-L", "CB-L", "LDMF", "LDM", "DM-L", "LCMF", "LCM", "CM-L", "LAMF", "LAM", "AM-L", "LS", "CF-L"]);
  const insideRight = new Set(["RCB", "CD-R", "CB-R", "RDMF", "RDM", "DM-R", "RCMF", "RCM", "CM-R", "RAMF", "RAM", "AM-R", "RS", "CF-R", "RCF"]);
  if (wideLeft.has(code)) return "wide-left";
  if (wideRight.has(code)) return "wide-right";
  if (insideLeft.has(code)) return "inside-left";
  if (insideRight.has(code)) return "inside-right";
  return "center";
}

function roleLaneBase(side, laneBand) {
  const homeOrder = {
    "wide-left": 10,
    "inside-left": 22,
    center: 30,
    "inside-right": 38,
    "wide-right": 50,
  };
  const awayOrder = {
    "wide-right": 10,
    "inside-right": 22,
    center: 30,
    "inside-left": 38,
    "wide-left": 50,
  };
  return (side === "home" ? homeOrder : awayOrder)[laneBand] || 30;
}

function roleLaneOrder(row, side) {
  const role = zoneRole(row);
  return roleLaneBase(side, roleLaneBand(role));
}

function sortLinePlayers(line, fallbackSort, side) {
  return [...line].sort((a, b) => roleLaneOrder(a, side) - roleLaneOrder(b, side) || fallbackSort(a, b));
}

function roleDepthOffset(row, lineIndex, lineCount, lineSize = 0) {
  const role = zoneRole(row);
  const firstLine = lineIndex === 0;
  const lastLine = lineIndex === lineCount - 1;
  const penultimateLine = lineIndex === lineCount - 2;
  const centralForward = new Set(["FW", "F", "ST", "CF"]);
  const sideForward = new Set(["LS", "RS", "CF-L", "CF-R", "RCF"]);
  const wideForward = new Set(["RF", "LF", "RW", "LW", "RWF", "LWF"]);
  const wideMid = new Set(["LM", "RM", "LMF", "RMF"]);
  const wingBack = new Set(["RWB", "LWB"]);
  const fullBack = new Set(["RB", "LB"]);
  const centerBack = new Set(["CB", "CCB", "LCB", "RCB", "CB-R", "CB-L", "CD", "CD-R", "CD-L"]);
  const defensiveMid = new Set(["DMF", "LDMF", "RDMF", "DM", "LDM", "RDM", "DM-L", "DM-R"]);
  const attackingMid = new Set(["AMF", "CAM", "LAMF", "RAMF", "AM", "LAM", "RAM", "AM-L", "AM-R"]);

  if (lastLine && wideForward.has(role)) return lineSize >= 3 ? 3.2 : -4.6;
  if (lastLine && wideMid.has(role)) return -4.2;
  if (lastLine && sideForward.has(role)) return lineSize >= 3 ? 2.6 : 2.4;
  if (lastLine && centralForward.has(role)) return 4.5;
  if (lastLine && attackingMid.has(role)) return -2;
  if (!firstLine && !lastLine && defensiveMid.has(role)) return -2.5;
  if (!firstLine && !lastLine && attackingMid.has(role)) return penultimateLine ? -1 : 2;
  if (firstLine && wingBack.has(role)) return 4.5;
  if (firstLine && fullBack.has(role)) return 3.5;
  if (firstLine && centerBack.has(role)) return -2;
  return 0;
}

function clampPitchValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampToOwnHalf(x, side) {
  const halfMargin = 6.8;
  return side === "home" ? Math.min(x, 50 - halfMargin) : Math.max(x, 50 + halfMargin);
}

function clampOutfieldX(x, side) {
  return side === "home"
    ? clampPitchValue(x, 14, 50 - 6.8)
    : clampPitchValue(x, 50 + 6.8, 86);
}

function applyDepthOffset(x, offset, side, stayInOwnHalf = false) {
  const direction = side === "home" ? 1 : -1;
  const adjustedX = x + offset * direction;
  const boundedX = stayInOwnHalf ? clampToOwnHalf(adjustedX, side) : adjustedX;
  return clampOutfieldX(boundedX, side);
}

function assignmentRole(item) {
  return normalizeRoleCode(item?.displayRole || (item?.row ? roleForMode(item.row, "display") : ""));
}

function assignmentRoleCandidates(item) {
  const row = item?.row || {};
  return [
    item?.displayRole,
    row.displayRole,
    row.standardPosition,
    row.specificPosition,
    row.tacticalRole,
    roleForMode(row, "display"),
    canonicalRole(row),
    rawRole(row),
  ]
    .map((role) => normalizeRoleCode(role))
    .filter(Boolean);
}

function uniqueNormalizedRoles(roles) {
  return Array.from(new Set((roles || []).map((role) => normalizeRoleCode(role)).filter(Boolean)));
}

function knownFormationKey(formation) {
  const numbers = String(formation || "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
  return numbers?.length && numbers.reduce((sum, item) => sum + item, 0) === 10 ? numbers.join("-") : "";
}

function lineupRoleSet(rows) {
  const roles = new Set();
  rows
    .filter((row) => row.started && playerSlot(row) !== "GK")
    .forEach((row) => {
      assignmentRoleCandidates({ row }).forEach((role) => roles.add(role));
    });
  return roles;
}

function roleSetContainsAll(roleSet, roles) {
  const required = uniqueNormalizedRoles(roles);
  return required.length > 0 && required.every((role) => roleSet.has(role));
}

function lineGroupTriggerMatches(trigger, rows, formation) {
  if (trigger?.layoutMode && trigger.layoutMode !== "line-groups") return false;
  const formationKeyValue = knownFormationKey(formation);
  const allowedFormations = Array.isArray(trigger?.formations)
    ? trigger.formations.map((item) => knownFormationKey(item)).filter(Boolean)
    : [];
  if (allowedFormations.length && !allowedFormations.includes(formationKeyValue)) return false;
  const roleSet = lineupRoleSet(rows);
  const requiredSets = Array.isArray(trigger?.requiredRoleSets) ? trigger.requiredRoleSets : [];
  return requiredSets.length > 0 && requiredSets.every((roles) => roleSetContainsAll(roleSet, roles));
}

function shouldUseMicroLineGroups(rows, formation) {
  if (rows.some((row) => row.lineupLayoutMode === "line-groups")) return true;
  return (formationMicroAdjustments.lineGroupTriggers || []).some((trigger) => lineGroupTriggerMatches(trigger, rows, formation));
}

function findAssignmentsForRoles(assignments, roles) {
  const used = new Set();
  const matched = new Map();
  uniqueNormalizedRoles(roles).forEach((role) => {
    const item = assignments.find((candidate) => !used.has(candidate) && assignmentRoleCandidates(candidate).includes(role));
    if (item) {
      used.add(item);
      matched.set(role, item);
    }
  });
  return matched.size === uniqueNormalizedRoles(roles).length ? matched : null;
}

function microPatternPassesLineCheck(pattern, matchedItems) {
  if (pattern?.sameTacticalLine !== true && pattern?.sameTacticalLine !== "when-known") return true;
  const lines = matchedItems
    .map((item) => Number(item?.row?.tacticalLine))
    .filter((line) => Number.isFinite(line) && line >= 1);
  if (!lines.length) return true;
  return new Set(lines).size === 1;
}

function applyFormationMicroAdjustments(assignments, side) {
  const adjusted = assignments.map((item) => ({ ...item }));
  (formationMicroAdjustments.patterns || []).forEach((pattern) => {
    const roles = uniqueNormalizedRoles(pattern?.requiredRoles);
    if (!roles.length) return;
    const matchedByRole = findAssignmentsForRoles(adjusted, roles);
    if (!matchedByRole) return;
    const matchedItems = roles.map((role) => matchedByRole.get(role)).filter(Boolean);
    if (!microPatternPassesLineCheck(pattern, matchedItems)) return;

    if (pattern.sameDepth) {
      const depth = matchedItems.reduce((sum, item) => sum + Number(item.x || 0), 0) / matchedItems.length;
      matchedItems.forEach((item) => {
        item.x = clampOutfieldX(depth, side);
      });
    }

    const sideLanes = pattern?.lanesBySide?.[side] || {};
    roles.forEach((role) => {
      const lane = Number(sideLanes[role]);
      const item = matchedByRole.get(role);
      if (item && Number.isFinite(lane)) item.y = clampPitchValue(lane, 8, 92);
    });
  });
  return adjusted;
}

function positioningRuleList(key, fallback) {
  const value = lineupPositioningRules?.[key];
  return Array.isArray(value) && value.length ? value.map((role) => normalizeRoleCode(role)) : fallback;
}

function overlapRuleNumber(key, fallback) {
  const value = Number(lineupPositioningRules?.overlapAvoidance?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function isAxisLockedAssignment(item) {
  const slotRole = normalizeRoleCode(item?.displayRole || "");
  if (slotRole) {
    return positioningRuleList("axisLockedTemplateRoles", defaultLineupPositioningRules.axisLockedTemplateRoles).includes(slotRole);
  }
  return positioningRuleList("fallbackAxisLockedRoles", defaultLineupPositioningRules.fallbackAxisLockedRoles).includes(assignmentRole(item));
}

function lockAxisIfNeeded(item) {
  if (isAxisLockedAssignment(item)) item.y = 50;
  return item;
}

function spreadFromAxis(item, push) {
  if (isAxisLockedAssignment(item)) {
    item.y = 50;
    return;
  }
  const role = assignmentRole(item);
  const band = roleLaneBand(role);
  const naturalDirection = band.includes("left") ? -1 : band.includes("right") ? 1 : 0;
  const currentDirection = item.y > 50 ? 1 : item.y < 50 ? -1 : 0;
  const direction = naturalDirection || currentDirection || 1;
  item.y = clampPitchValue(item.y + direction * push, 9, 91);
}

function shouldPreserveSameDepth(left, right) {
  const sameDepthRoles = positioningRuleList("sameDepthLineRoles", defaultLineupPositioningRules.sameDepthLineRoles);
  const leftRole = assignmentRole(left);
  const rightRole = assignmentRole(right);
  return sameDepthRoles.includes(leftRole) && sameDepthRoles.includes(rightRole);
}

function avoidPitchOverlaps(assignments, side) {
  const relaxed = assignments.map((item) => ({ ...item }));
  const players = relaxed.filter((item) => item.row && playerSlot(item.row) !== "GK");
  const xDirection = side === "home" ? 1 : -1;
  const passes = Math.max(1, Math.round(overlapRuleNumber("passes", 4)));
  const xBreakDistance = overlapRuleNumber("xBreakDistance", 7.6);
  const yCollisionDistance = overlapRuleNumber("yCollisionDistance", 12.5);
  const normalDepthGap = overlapRuleNumber("normalDepthGap", 6.4);
  const axisDepthGap = overlapRuleNumber("axisDepthGap", 9.2);
  const softYPush = overlapRuleNumber("softYPush", 2.4);
  const hardYPush = overlapRuleNumber("hardYPush", 4.2);
  const depthPush = overlapRuleNumber("depthPush", 1.6);
  for (let pass = 0; pass < passes; pass += 1) {
    players.sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const left = players[i];
        const right = players[j];
        const dx = Math.abs(left.x - right.x);
        if (dx > xBreakDistance) break;
        const dy = Math.abs(left.y - right.y);
        if (dy > yCollisionDistance) continue;

        const upperFirst = left.y <= right.y;
        const yPush = dy < 4 ? hardYPush : softYPush;
        const leftLocked = isAxisLockedAssignment(left);
        const rightLocked = isAxisLockedAssignment(right);
        if (leftLocked || rightLocked) {
          lockAxisIfNeeded(left);
          lockAxisIfNeeded(right);
          if (!leftLocked) spreadFromAxis(left, yPush);
          if (!rightLocked) spreadFromAxis(right, yPush);
        } else {
          left.y = clampPitchValue(left.y + (upperFirst ? -yPush : yPush), 9, 91);
          right.y = clampPitchValue(right.y + (upperFirst ? yPush : -yPush), 9, 91);
        }

        const preserveSameDepth = shouldPreserveSameDepth(left, right);
        const minDepthGap = leftLocked && rightLocked ? axisDepthGap : normalDepthGap;
        if (!preserveSameDepth && dx < minDepthGap) {
          const deeper = side === "home"
            ? (left.x < right.x ? left : right)
            : (left.x > right.x ? left : right);
          const advanced = deeper === left ? right : left;
          deeper.x = clampOutfieldX(deeper.x - (xDirection * depthPush), side);
          advanced.x = clampOutfieldX(clampToOwnHalf(advanced.x + (xDirection * depthPush), side), side);
        }
      }
    }
  }
  return relaxed.map(lockAxisIfNeeded);
}

function hasRole(row, roles) {
  return roles.has(zoneRole(row));
}

const centralForwardRoles = new Set(["F", "ST", "CF"]);
const sideForwardRoles = new Set(["LS", "RS", "CF-L", "CF-R", "RCF"]);
const wideForwardRoles = new Set(["RF", "LF", "RW", "LW", "RWF", "LWF"]);
const attackingMidRoles = new Set(["AMF", "CAM", "LAMF", "RAMF", "AM", "LAM", "RAM", "AM-L", "AM-R"]);
const defensiveMidRoles = new Set(["DMF", "LDMF", "RDMF", "DM", "LDM", "RDM", "DM-L", "DM-R"]);
const centralMidRoles = new Set(["CMF", "LCMF", "RCMF", "CM", "LCM", "RCM", "CM-L", "CM-R", "MF", "M"]);
const wideMidRoles = new Set(["LM", "RM", "LMF", "RMF"]);

function roleAwareSort(side, fallbackSort) {
  return (a, b) => roleLaneOrder(a, side) - roleLaneOrder(b, side) || fallbackSort(a, b);
}

function buildFallbackLineGroups(outfield, lines, side, fallbackSort) {
  const lineGroups = lines.map(() => []);
  let remaining = [...outfield].sort(fallbackSort);
  const laneSort = roleAwareSort(side, fallbackSort);

  const take = (count, predicate, sorter = fallbackSort) => {
    if (count <= 0) return [];
    const picked = remaining.filter(predicate).sort(sorter).slice(0, count);
    if (!picked.length) return [];
    const pickedSet = new Set(picked);
    remaining = remaining.filter((row) => !pickedSet.has(row));
    return picked;
  };

  const fillLine = (lineIndex, filters) => {
    if (lineIndex < 0 || lineIndex >= lineGroups.length) return;
    const target = lines[lineIndex] || 0;
    filters.forEach(([predicate, sorter]) => {
      if (lineGroups[lineIndex].length < target) {
        lineGroups[lineIndex].push(...take(target - lineGroups[lineIndex].length, predicate, sorter));
      }
    });
    if (lineGroups[lineIndex].length < target) {
      lineGroups[lineIndex].push(...take(target - lineGroups[lineIndex].length, () => true, laneSort));
    }
  };

  const firstIndex = 0;
  const lastIndex = lineGroups.length - 1;
  fillLine(firstIndex, [
    [(row) => playerSlot(row) === "DF", laneSort],
    [(row) => playerSlot(row) === "MF" && hasRole(row, defensiveMidRoles), laneSort],
  ]);

  const lastCount = lines[lastIndex] || 0;
  const lastFilters = lastCount <= 1
    ? [
        [(row) => playerSlot(row) === "FW" && hasRole(row, centralForwardRoles), laneSort],
        [(row) => playerSlot(row) === "FW" && hasRole(row, sideForwardRoles), laneSort],
        [(row) => playerSlot(row) === "FW", laneSort],
        [(row) => playerSlot(row) === "MF" && hasRole(row, attackingMidRoles), laneSort],
      ]
    : [
        [(row) => playerSlot(row) === "FW", laneSort],
        [(row) => playerSlot(row) === "MF" && hasRole(row, attackingMidRoles), laneSort],
        [(row) => playerSlot(row) === "MF" && hasRole(row, wideMidRoles), laneSort],
      ];
  fillLine(lastIndex, lastFilters);

  for (let lineIndex = 1; lineIndex < lastIndex; lineIndex += 1) {
    const penultimateLine = lineIndex === lastIndex - 1;
    fillLine(
      lineIndex,
      penultimateLine && lineGroups.length >= 4
        ? [
            [(row) => playerSlot(row) === "MF" && hasRole(row, attackingMidRoles), laneSort],
            [(row) => playerSlot(row) === "FW" && hasRole(row, wideForwardRoles), laneSort],
            [(row) => playerSlot(row) === "MF" && hasRole(row, wideMidRoles), laneSort],
            [(row) => playerSlot(row) === "FW" && hasRole(row, sideForwardRoles), laneSort],
            [(row) => playerSlot(row) === "MF", laneSort],
            [(row) => playerSlot(row) === "FW", laneSort],
            [(row) => playerSlot(row) === "DF", laneSort],
          ]
        : [
            [(row) => playerSlot(row) === "MF" && hasRole(row, defensiveMidRoles), laneSort],
            [(row) => playerSlot(row) === "MF" && hasRole(row, centralMidRoles), laneSort],
            [(row) => playerSlot(row) === "MF", laneSort],
            [(row) => playerSlot(row) === "DF", laneSort],
            [(row) => playerSlot(row) === "FW", laneSort],
          ]
    );
  }

  if (remaining.length) {
    const spareLine = Math.min(lastIndex, Math.max(0, Math.floor(lineGroups.length / 2)));
    lineGroups[spareLine].push(...remaining.sort(laneSort));
  }
  return lineGroups;
}

function formationKey(formation) {
  const numbers = parseFormation(formation);
  return numbers.join("-");
}

function roleFamily(role) {
  const code = normalizeRoleCode(role);
  if (code === "GK") return "GK";
  if (["DF", "DEFENDER"].includes(code)) return "DF";
  if (["MF", "MIDFIELDER", "M"].includes(code)) return "MF";
  if (["FW", "FORWARD"].includes(code)) return "FW";
  if (["LB", "LCB", "CCB", "RCB", "RB", "LWB", "RWB"].includes(code)) return "DF";
  if (["LW", "RW", "LS", "ST", "RS", "SS"].includes(code)) return "FW";
  if (["LDM", "DM", "RDM", "LCM", "CM", "RCM", "LAM", "CAM", "RAM", "LM", "RM"].includes(code)) return "MF";
  return "";
}

function semanticSide(role) {
  const band = roleLaneBand(role);
  if (band.includes("left")) return "left";
  if (band.includes("right")) return "right";
  return "center";
}

function roleCompatibleScore(row, targetRole) {
  const target = normalizeRoleCode(targetRole);
  const canonical = canonicalRole(row);
  const raw = normalizeRoleCode(rawRole(row));
  const rawLiteral = rawRole(row);
  let score = 0;

  if (canonical === target) score += 120;
  if (raw === target) score += 90;
  if (row.displayRole && normalizeRoleCode(row.displayRole) === target) score += 60;
  if (roleFamily(canonical) === roleFamily(target)) score += 26;
  if (roleFamily(raw) === roleFamily(target)) score += 14;

  const candidateSide = semanticSide(canonical || raw);
  const rawSide = semanticSide(raw);
  const targetSide = semanticSide(target);
  if (targetSide !== "center") {
    if (candidateSide === targetSide || rawSide === targetSide) score += 26;
    if ((candidateSide !== "center" && candidateSide !== targetSide) || (rawSide !== "center" && rawSide !== targetSide)) score -= 90;
  } else if (candidateSide === "center" || rawSide === "center") {
    score += 12;
  }

  if (target === "ST") {
    if (["F", "ST", "CF"].includes(rawLiteral)) score += 18;
    if (["FW", "FORWARD"].includes(rawLiteral)) score -= 10;
  }
  if (["LW", "RW"].includes(target) && ["LM", "RM"].includes(canonical)) score += 12;
  if (["LWB", "RWB"].includes(target) && ["LB", "RB"].includes(canonical)) score += 12;
  if (["LDM", "RDM"].includes(target) && ["LCM", "RCM", "DM", "CM"].includes(canonical)) score += 14;
  if (["LCM", "RCM"].includes(target) && ["LDM", "RDM", "CM"].includes(canonical)) score += 10;
  if (["LAM", "RAM"].includes(target) && ["LW", "RW", "CAM"].includes(canonical)) score += 12;

  const order = Number(row.tacticalOrder);
  if (Number.isFinite(order)) score -= order * 0.01;
  return score;
}

function pitchCoordForRole(role, side) {
  const [baseX = 32, baseY = 50] = formationRoleCoords[normalizeRoleCode(role)] || [];
  const x = side === "home" ? baseX : 100 - baseX;
  const y = side === "home" ? baseY : 100 - baseY;
  return { x: clampOutfieldX(clampToOwnHalf(x, side), side), y: clampPitchValue(y, 8, 92) };
}

function assignByFormationTemplate(outfield, side, formation, fallbackSort) {
  const key = formationKey(formation);
  const roles = formationSpecs[key];
  if (!roles || roles.length !== outfield.length) return null;

  const remaining = [...outfield].sort(fallbackSort);
  const assignments = [];
  roles.forEach((targetRole) => {
    if (!remaining.length) return;
    let bestIndex = 0;
    let bestScore = -Infinity;
    remaining.forEach((row, index) => {
      const score = roleCompatibleScore(row, targetRole);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const [row] = remaining.splice(bestIndex, 1);
    const coord = pitchCoordForRole(targetRole, side);
    assignments.push({ row, x: coord.x, y: coord.y, displayRole: targetRole });
  });

  if (remaining.length) return null;
  return assignments;
}

function formationAssignments(rows, side, formation) {
  const starters = rows.filter((row) => row.started);
  if (!starters.length) return [];
  const goalkeeper = starters.find((row) => playerSlot(row) === "GK") || starters[0];
  const outfield = starters.filter((row) => row !== goalkeeper);
  const preferLineGroups = shouldUseMicroLineGroups(rows, formation);
  const rawFormation = preferLineGroups ? formation : (lineupFormationRaw(rows) || formation);
  const rawLines = parseFormation(rawFormation);
  const lines = normalizedFormationLines(starters, rawFormation);
  const collapseFrontPair = shouldCollapseFrontPair(starters, rawLines);
  const sortByTacticalOrder = (a, b) => {
    const orderA = Number.isFinite(Number(a.tacticalOrder)) ? Number(a.tacticalOrder) : 999;
    const orderB = Number.isFinite(Number(b.tacticalOrder)) ? Number(b.tacticalOrder) : 999;
    return orderA - orderB || Number(a.shirtNo || 99) - Number(b.shirtNo || 99);
  };
  const displayFormationKey = lines.join("-");
  const templateAssignments = preferLineGroups ? null : assignByFormationTemplate(outfield, side, displayFormationKey || rawFormation, sortByTacticalOrder);
  if (templateAssignments) {
    const microAdjusted = applyFormationMicroAdjustments(
      [{ row: goalkeeper, x: side === "home" ? 4.8 : 95.2, y: 50, displayRole: "GK" }, ...templateAssignments],
      side
    );
    return avoidPitchOverlaps(microAdjusted, side);
  }
  let lineGroups = [];
  if (rawLines.length && outfield.every((row) => Number.isFinite(Number(row.tacticalLine)) && Number(row.tacticalLine) >= 1)) {
    const groupedByRawLine = rawLines.map((_, index) =>
      outfield
        .filter((row) => Number(row.tacticalLine) === index + 1)
        .sort(sortByTacticalOrder)
    );
    if (groupedByRawLine.reduce((sum, line) => sum + line.length, 0) === outfield.length) {
      lineGroups = collapseFrontPair
        ? [...groupedByRawLine.slice(0, -2), [...groupedByRawLine[groupedByRawLine.length - 2], ...groupedByRawLine[groupedByRawLine.length - 1]]]
        : groupedByRawLine;
    }
  }
  if (!lineGroups.length) lineGroups = buildFallbackLineGroups(outfield, lines, side, sortByTacticalOrder);

  lineGroups = lineGroups.map((line) => sortLinePlayers(line, sortByTacticalOrder, side));

  const assignments = [{ row: goalkeeper, x: side === "home" ? 4.8 : 95.2, y: 50 }];
  lineGroups.forEach((line, lineIndex) => {
    const yValues = lineYPositions(line.length);
    const baseX = formationLineX(lineIndex, lineGroups.length, side);
    line.forEach((row, playerIndex) => {
      const xOffset = roleDepthOffset(row, lineIndex, lineGroups.length, line.length);
      const stayInOwnHalf = lineIndex === lineGroups.length - 1;
      assignments.push({
        row,
        x: applyDepthOffset(baseX, xOffset, side, stayInOwnHalf),
        y: yValues[playerIndex],
      });
    });
  });
  return avoidPitchOverlaps(applyFormationMicroAdjustments(assignments, side), side);
}

function renderPitchPlayers(rows, side, formation) {
  return formationAssignments(rows, side, formation)
    .map(({ row, x, y, displayRole }) => renderPitchPlayer(row, x, y, side, displayRole))
    .join("");
}

function renderPitchPlayer(row, x, y, side, displayRole = "") {
  const fullName = row.player.name || row.player.fullName || "";
  const shortName = shortPlayerName(row.player);
  const shirtNumber = String(row.shirtNo || "").padStart(2, "0");
  const mobileNameFont = pitchNameMobileFontSize(shortName).toFixed(2);
  const role = roleForMode(row);
  const anchorId = lineupPlayerAnchor(row.player.id, "pitch");
  const title = `${fullName} | ${roleTooltip(row, displayRole)}`;
  return `
    <a class="pitch-player ${escapeHtml(side)}" id="${escapeHtml(anchorId)}" style="--x:${x}; --y:${y}" href="${playerHrefForLineup(row, "pitch")}" title="${escapeHtml(title)}" data-role="${escapeHtml(role)}">
      ${renderLineupRatingBadge(row, "pitch")}
      <span class="pitch-photo">${playerPhoto(row.player)}</span>
      <span class="pitch-name" title="${escapeHtml(fullName)}" style="--pitch-name-mobile-font:${mobileNameFont}px">
        <span class="pitch-number">${escapeHtml(shirtNumber)}</span>
        <span class="pitch-name-text">${escapeHtml(shortName)}</span>
        ${captainBadge(row)}
      </span>
      <span class="pitch-role">${escapeHtml(positionLabel(role))}</span>
      <span class="pitch-player-events">${lineupEventChips(row, "compact")}</span>
    </a>
  `;
}

function playerHrefForLineup(row, focusArea = "roster") {
  const matchId = safeRouteId(row.matchId);
  const playerId = safeRouteId(row.player?.id);
  const area = focusArea === "pitch" ? "pitch" : "roster";
  const returnTo = matchId && playerId
    ? matchDetailHref(matchId, { tab: "lineups", focusPlayer: playerId, focusArea: area })
    : "";
  return hashHref(`/players/${row.player.id}`, {
    match: matchId || undefined,
    returnTo: returnTo || undefined,
  });
}

function playerPhoto(player) {
  const src = player?.photoUrl || "/static/assets/player-placeholder.png";
  return `<img class="${escapeHtml(photoSourceClass(player))}" src="${escapeHtml(src)}" alt="${escapeHtml(player?.name || "player")}" loading="lazy" onerror="this.src='/static/assets/player-placeholder.png'" />`;
}

function renderLineupTeam(team, rows, formation, coach) {
  const starters = rows.filter((row) => row.started);
  const bench = rows.filter((row) => !row.started);
  return `
    <div class="lineup-team-card">
      <div class="lineup-team-head">
        <span class="split">${teamLogo(team, "team-logo small")} <strong>${escapeHtml(team.name)}</strong></span>
        <span class="source-badge">${escapeHtml(formation || "-")}</span>
      </div>
      ${renderCoachBadge(coach)}
      ${renderLineupGroup("首发", starters)}
      ${bench.length ? renderLineupGroup("替补", bench) : ""}
    </div>
  `;
}

function renderCoachBadge(coach) {
  if (!coach?.name) return "";
  const photo = coach.photoUrl
    ? `<span class="coach-avatar"><img class="${escapeHtml(photoSourceClass({ photoUrl: coach.photoUrl }))}" src="${escapeHtml(coach.photoUrl)}" alt="${escapeHtml(coach.name)}" loading="lazy" onerror="this.parentElement.classList.add('empty');this.remove();this.parentElement.textContent='教'" /></span>`
    : `<span class="coach-avatar empty">教</span>`;
  return `
    <div class="coach-card">
      ${photo}
      <span>
        <span class="muted mini">主教练</span>
        <strong>${escapeHtml(coach.name)}</strong>
      </span>
    </div>
  `;
}

function renderLineupGroup(title, rows) {
  return `
    <div class="lineup-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="lineup-list">
        ${rows.map(renderLineupPlayer).join("") || `<div class="muted mini">暂无球员</div>`}
      </div>
    </div>
  `;
}

function renderLineupPlayer(row) {
  const fullName = row.player.name || row.player.fullName || "";
  const shortName = shortPlayerName(row.player);
  const role = roleForMode(row);
  const roleTitle = roleTooltip(row);
  const anchorId = lineupPlayerAnchor(row.player.id, "roster");
  return `
    <a class="lineup-player-card" id="${escapeHtml(anchorId)}" href="${playerHrefForLineup(row, "roster")}" title="${escapeHtml(roleTitle)}">
        <span class="lineup-avatar">${playerPhoto(row.player)}</span>
        <span class="lineup-player-main">
          <span class="lineup-player-name-row">
            <strong title="${escapeHtml(fullName)}"><span class="lineup-name-text">${String(row.shirtNo || "").padStart(2, "0")} ${escapeHtml(shortName)}</span>${captainBadge(row)}</strong>
            ${renderLineupRatingBadge(row)}
          </span>
          <span class="muted mini">${escapeHtml(positionLabel(role))} · ${escapeHtml(row.roleLabel || "")} · 身价 ${escapeHtml(marketValueLabel(row.player))}</span>
          <span class="lineup-chip-row">${lineupEventChips(row)}</span>
        </span>
        ${renderPlayerClubBadge(row.player)}
      </a>
  `;
}

function lineupEventChips(row, mode = "full") {
  const events = row.events || [];
  if (!events.length) return mode === "compact" ? "" : `<span class="lineup-chip quiet">无事件</span>`;
  if (mode === "compact") return compactLineupEventChips(events);
  return events
    .map((event) => {
      const minute = event.minuteLabel ? ` ${event.minuteLabel}` : "";
      const title = `${event.label}${minute}`;
      return `<span class="lineup-chip ${escapeHtml(event.type)}" title="${escapeHtml(title)}"><span class="event-symbol">${eventIcon(event.type)}</span><span>${escapeHtml(minute.trim())}</span></span>`;
    })
    .join("");
}

function compactLineupEventChips(events) {
  const groups = [];
  events.forEach((event) => {
    let group = groups.find((item) => item.type === event.type);
    if (!group) {
      group = { type: event.type, label: event.label, minutes: [] };
      groups.push(group);
    }
    if (event.minuteLabel) group.minutes.push(event.minuteLabel);
  });
  return groups
    .map((group) => {
      const count = group.minutes.length > 1 ? group.minutes.length : "";
      const title = `${group.label}${group.minutes.length ? ` ${group.minutes.join(", ")}` : ""}`;
      return `<span class="lineup-chip icon-only ${escapeHtml(group.type)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><span class="event-symbol">${eventIcon(group.type)}</span>${count ? `<span class="event-count">${count}</span>` : ""}</span>`;
    })
    .join("");
}

function eventIcon(type) {
  return { goal: "G", yellow_card: "Y", red_card: "R", sub_in: "↑", sub_out: "↓" }[type] || "•";
}

function renderStats(match) {
  const left = buildStatsTeam(match, match.homeTeam);
  const right = buildStatsTeam(match, match.awayTeam);
  const metricGroups = [
    {
      title: "进攻威胁",
      note: "射门、射正、封堵和定位球压力",
      metrics: [
        { label: "危险进攻", keys: ["dangerousAttacks", "dangerous_attacks"] },
        { label: "射门", key: "totalShots", eventKey: "shots" },
        { label: "射正", key: "shotsOnTarget", eventKey: "shotsOnTarget" },
        { label: "射偏", key: "shotsOffTarget" },
        { label: "被封堵", key: "blockedShots", eventKey: "blockedShots" },
        { label: "角球", key: "wonCorners", eventKey: "corners" },
        { label: "任意球(非角球)", eventKey: "freeKicksWon" },
        { label: "任意球破门", eventKey: "directFreeKickGoals" },
        { label: "越位", key: "offsides", eventKey: "offsides" },
      ],
    },
    {
      title: "控制与传导",
      note: "控球、传球、传中和长传质量",
      metrics: [
        { label: "控球率", key: "possessionPct", unit: "%", precision: 1 },
        { label: "传球", key: "totalPasses" },
        { label: "成功传球", key: "accuratePasses" },
        { label: "关键传球", key: "shotAssists" },
        { label: "传球成功率", key: "passAccuracy", unit: "%", precision: 1, compute: (stats) => statPercentValue(stats, "passPct", "accuratePasses", "totalPasses") },
        { label: "传中成功率", key: "crossAccuracy", unit: "%", precision: 1, compute: (stats) => statPercentValue(stats, "crossPct", "accurateCrosses", "totalCrosses") },
        { label: "长传成功率", key: "longBallAccuracy", unit: "%", precision: 1, compute: (stats) => statPercentValue(stats, "longballPct", "accurateLongBalls", "totalLongBalls") },
      ],
    },
    {
      title: "防守动作",
      note: "扑救、抢断、拦截和解围",
      metrics: [
        { label: "扑救", key: "saves" },
        { label: "抢断", key: "totalTackles" },
        { label: "有效抢断", key: "effectiveTackles" },
        { label: "抢断成功率", key: "tackleSuccess", unit: "%", precision: 1, compute: (stats) => statPercentValue(stats, "tacklePct", "effectiveTackles", "totalTackles") },
        { label: "拦截", key: "interceptions" },
        { label: "解围", key: "totalClearance" },
      ],
    },
    {
      title: "纪律与节奏",
      note: "犯规、牌、换人、VAR 和点球节点",
      metrics: [
        { label: "犯规", key: "foulsCommitted", eventKey: "fouls" },
        { label: "黄牌", key: "yellowCards", eventKey: "yellowCards" },
        { label: "红牌", key: "redCards", eventKey: "redCards" },
        { label: "点球尝试", key: "penaltyKickShots", eventKey: "penaltyKickShots", compute: (stats, events) => correctedStatCount(stats, events, "penaltyKickShots") },
        { label: "点球进球", key: "penaltyKickGoals", eventKey: "penaltyKickGoals", compute: (stats, events) => correctedStatCount(stats, events, "penaltyKickGoals") },
        { label: "换人", key: "substitutions", eventKey: "substitutions" },
        { label: "VAR", eventKey: "varChecks" },
      ],
    },
  ];
  const headlineMetrics = [
    { label: "控球率", key: "possessionPct", unit: "%", precision: 1 },
    { label: "射门", key: "totalShots", eventKey: "shots" },
    { label: "射正", key: "shotsOnTarget", eventKey: "shotsOnTarget" },
    { label: "传球成功率", key: "passAccuracy", unit: "%", precision: 1, compute: (stats) => statPercentValue(stats, "passPct", "accuratePasses", "totalPasses") },
    { label: "角球", key: "wonCorners", eventKey: "corners" },
    { label: "扑救", key: "saves" },
  ];
  const visibleMetrics = metricGroups.flatMap((group) => group.metrics).filter((metric) => statsMetricAvailable(left, right, metric));
  const hasUsableData = visibleMetrics.length || left.formation !== "-" || right.formation !== "-" || (match.events || []).length;
  const attendance = matchAttendanceInfo(match);
  if (!hasUsableData) return `<div class="empty">暂无统计快照</div>`;
  return `
    <section class="match-stats-panel" aria-label="比赛统计">
      <div class="match-stats-status compact">
        ${renderStatsStatusTile("上座人数", attendance.value, attendance.detail)}
      </div>
      ${renderAttackEcg(match, left, right)}
      <div class="match-stats-headlines">
        ${headlineMetrics.map((metric) => renderStatsHeadline(left, right, metric)).join("")}
      </div>
      <div class="match-stats-grid">
        ${metricGroups.map((group) => renderStatsGroup(left, right, group)).join("")}
      </div>
    </section>
  `;
}

function buildStatsTeam(match, team) {
  const rows = (match.stats || []).filter((row) => row.scope === "team" && statsTeamMatches(row.team, team));
  const boxscoreRow = rows.find(hasStatsStatistics) || rows.find((row) => row.period === "full_time") || rows[0] || null;
  const statsRows = rows.filter(hasStatsStatistics);
  const lineupRow = rows.find((row) => row.period === "lineup") || rows.find((row) => row.stats?.tactics) || null;
  const stats = statsRows.reduce((merged, row) => ({ ...merged, ...flattenStatsPayload(row?.stats || {}) }), {});
  const lineupStats = flattenStatsPayload(lineupRow?.stats || {});
  const lineupRows = match.lineups?.[team.id] || [];
  const events = countStatsEvents(match.events || [], team);
  const formation = stats.tactics || lineupStats.tactics || lineupFormation(lineupRows) || "-";
  return {
    team,
    row: boxscoreRow,
    stats,
    lineupStats,
    events,
    formation,
    lineupCount: lineupRows.length,
    hasBoxscore: statsRows.length > 0 || hasStatsStatistics(boxscoreRow),
    capturedAt: boxscoreRow?.capturedAt || lineupRow?.capturedAt || "",
    source: stats.source || lineupStats.source || boxscoreRow?.period || lineupRow?.period || "官方数据",
  };
}

function renderAttackEcg(match, left, right) {
  const ecg = buildAttackEcgModel(match, left, right);
  if (!ecg.hasSignal) {
    return `
      <section class="attack-ecg-card attack-ecg-unavailable" aria-label="进攻心率图">
        <div class="attack-ecg-head">
          <h3>进攻心率图</h3>
        </div>
        <div class="attack-ecg-empty" role="status">
          <strong>公开攻势数据尚未同步</strong>
          <p>比赛结束后自动读取并缓存懂球帝 tendencies.data；本站不会用事件流或技术统计估算曲线。</p>
        </div>
      </section>
    `;
  }
  const homeShareName = teamDisplayName(match.homeTeam, "主队");
  const awayShareName = teamDisplayName(match.awayTeam, "客队");
  return `
    <section class="attack-ecg-card" aria-label="进攻心率图">
      <div class="attack-ecg-head">
        <h3>进攻心率图</h3>
      </div>
      ${renderAttackEcgSvg(ecg, match)}
      ${renderAttackEcgIconLegend()}
      <div class="attack-ecg-summary">
        <article class="attack-ecg-summary-item sustained-pressure" aria-label="连续施压结论：${escapeHtml(ecg.sustainedPressureLabel)}">
          <small>连续施压</small>
          <strong>${escapeHtml(ecg.sustainedPressureLabel)}</strong>
          <em>${escapeHtml(ecg.sustainedPressureDetail)}</em>
        </article>
        <article
          class="attack-ecg-summary-item attack-share"
          style="--home-share:${ecg.homeShare}%;--away-share:${ecg.awayShare}%"
          aria-label="攻势占比：${escapeHtml(homeShareName)} ${ecg.homeShare}%，${escapeHtml(awayShareName)} ${ecg.awayShare}%"
        >
          <small>攻势占比</small>
          <div class="attack-ecg-share-values">
            <span class="home"><b>${escapeHtml(homeShareName)}</b><strong>${ecg.homeShare}%</strong></span>
            <span class="away"><strong>${ecg.awayShare}%</strong><b>${escapeHtml(awayShareName)}</b></span>
          </div>
          <span class="attack-ecg-share-track" aria-hidden="true"><i class="home"></i><i class="away"></i></span>
        </article>
        <article class="attack-ecg-summary-item control-time"><small>攻势占优时间</small><strong>${escapeHtml(ecg.controlTimeLabel)}</strong><em>${escapeHtml(ecg.controlTimeDetail)}</em></article>
        <article class="attack-ecg-summary-item attack-ecg-conclusion" aria-label="心率图结论：${escapeHtml(ecg.tempoLabel)}">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <path d="M4 20h6l3-8 5 15 4-11 3 4h7" />
          </svg>
          <small>心率图结论</small>
          <strong>${escapeHtml(ecg.tempoLabel)}</strong>
          <em>${escapeHtml(ecg.tempoDetail)}</em>
        </article>
      </div>
    </section>
  `;
}

function renderAttackEcgIconLegend() {
  const items = [
    { type: "goal", label: "普通进球", asset: "goal" },
    { type: "penalty", label: "点球", asset: "penalty" },
    { type: "own-goal", label: "乌龙球", asset: "own-goal" },
    { type: "corner", label: "角球", asset: "corner" },
  ];
  return `
    <div class="attack-ecg-icon-legend" aria-label="进攻心率图事件图例">
      <strong>事件图例</strong>
      <div>
        ${items
          .map(
            (item) => `<span class="${item.type}"><img src="/static/assets/attack-ecg-icons/${item.asset}.svg?v=${STATIC_DATA_VERSION}" width="25" height="25" alt="" aria-hidden="true" decoding="async" draggable="false" />${item.label}</span>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildAttackEcgModel(match, left, right) {
  const tendency = match.attackTendency;
  if (
    !tendency ||
    tendency.status !== "available" ||
    tendency.metric !== "signed_attack_tendency" ||
    !Array.isArray(tendency.points)
  ) {
    return { hasSignal: false };
  }
  const samples = tendency.points
    .map((point) => {
      const minute = Number(point?.minute);
      const value = Number(point?.value);
      if (!Number.isFinite(minute) || !Number.isFinite(value)) return null;
      return {
        minute,
        value,
        label: String(point?.label || ""),
        home: Math.max(0, value),
        away: Math.max(0, -value),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.minute - b.minute);
  if (samples.length < 2) return { hasSignal: false };
  const duration = Number(tendency.duration) || samples[samples.length - 1].minute;
  const totals = samples.reduce(
    (sum, sample) => ({ home: sum.home + sample.home, away: sum.away + sample.away }),
    { home: 0, away: 0 }
  );
  const homeTotal = Number(tendency.homeTotal) || totals.home;
  const awayTotal = Number(tendency.awayTotal) || totals.away;
  const totalPressure = homeTotal + awayTotal;
  if (!totalPressure) return { hasSignal: false };
  const homeShare = Math.round((homeTotal / totalPressure) * 100);
  const awayShare = 100 - homeShare;
  const sampleByMinute = new Map(samples.map((sample) => [sample.minute, sample]));
  const keyEvents = (Array.isArray(tendency.markers) ? tendency.markers : [])
    .filter((marker) => String(marker?.code || "").toUpperCase() === "G")
    .map((marker) => {
      const minute = Number(marker.minute) || 0;
      const side = marker.side === "home" ? "home" : "away";
      const sample = sampleByMinute.get(minute);
      const playerName = String(marker.playerName || "");
      return {
        minute,
        side,
        weight: 10,
        value: sample?.[side] || 0,
        label: String(marker.label || "进球"),
        scoreLabel: String(marker.score || ""),
        event: {
          eventType: "goal",
          player: playerName ? { name: playerName } : null,
        },
      };
    })
    .sort((a, b) => a.minute - b.minute);
  const dominant = homeShare === awayShare ? "双方攻势接近" : homeShare > awayShare ? `${match.homeTeam.name}攻势更强` : `${match.awayTeam.name}攻势更强`;
  const leaderName = homeShare >= awayShare ? match.homeTeam.name : match.awayTeam.name;
  const leaderShare = Math.max(homeShare, awayShare);
  const shareMargin = Math.abs(homeShare - awayShare);
  const tempoDetail = shareMargin === 0
    ? `双方攻势占比均为 ${homeShare}%`
    : `${leaderName} ${leaderShare}% · 领先 ${shareMargin} 个百分点`;
  const controlTime = attackControlTime(samples, duration);
  const homeCode = match.homeTeam.code || match.homeTeam.name || "主队";
  const awayCode = match.awayTeam.code || match.awayTeam.name || "客队";
  const controlTimeLabel = `${homeCode} ${formatAttackMinute(controlTime.home)}′ · ${awayCode} ${formatAttackMinute(controlTime.away)}′`;
  const controlTimeDetail = controlTime.neutral > 0
    ? `均势 ${formatAttackMinute(controlTime.neutral)}′ · 按曲线符号逐段累计`
    : "按曲线符号逐段累计";
  const pressureStreaks = attackPressureStreaks(samples, duration);
  const streakDifference = Math.abs(pressureStreaks.home.longest - pressureStreaks.away.longest);
  const streakLeader = pressureStreaks.home.longest >= pressureStreaks.away.longest ? match.homeTeam : match.awayTeam;
  const sustainedPressureLabel = streakDifference < 1
    ? "双方连续施压接近"
    : `${streakLeader.name}连续施压更久`;
  const sustainedPressureDetail = `最长：${homeCode} ${formatAttackMinute(pressureStreaks.home.longest)}′ · ${awayCode} ${formatAttackMinute(pressureStreaks.away.longest)}′`;
  return {
    hasSignal: true,
    duration,
    samples,
    keyEvents,
    goalEvents: keyEvents.filter((item) => (item.event.eventType || item.event.type) === "goal"),
    maxValue: Math.max(1, ...samples.flatMap((sample) => [sample.home, sample.away])),
    homeTotal,
    awayTotal,
    homeShare,
    awayShare,
    figureUrl: tendency.figureUrl || "",
    figureVersion: tendency.figureVersion || "",
    tempoLabel: dominant,
    tempoDetail,
    controlTimeLabel,
    controlTimeDetail,
    sustainedPressureLabel,
    sustainedPressureDetail,
  };
}

function attackPressureStreaks(samples, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const result = {
    home: { longest: 0, start: 0, end: 0 },
    away: { longest: 0, start: 0, end: 0 },
  };
  let active = null;

  const commit = () => {
    if (!active) return;
    const span = Math.max(0, active.end - active.start);
    if (span > result[active.side].longest) {
      result[active.side] = { longest: span, start: active.start, end: active.end };
    }
    active = null;
  };

  samples.forEach((sample, index) => {
    const start = Math.max(0, Math.min(safeDuration, Number(sample.minute) || 0));
    const nextMinute = index + 1 < samples.length ? Number(samples[index + 1].minute) : safeDuration;
    const end = Math.max(start, Math.min(safeDuration, Number.isFinite(nextMinute) ? nextMinute : start));
    const side = sample.value > 0 ? "home" : sample.value < 0 ? "away" : "";
    if (!side || end <= start) {
      commit();
      return;
    }
    if (active?.side === side && Math.abs(active.end - start) < 0.001) {
      active.end = end;
      return;
    }
    commit();
    active = { side, start, end };
  });
  commit();

  Object.values(result).forEach((streak) => {
    streak.longest = Math.round(streak.longest * 10) / 10;
  });
  return result;
}

function attackControlTime(samples, duration) {
  const result = { home: 0, away: 0, neutral: 0 };
  const safeDuration = Math.max(0, Number(duration) || 0);
  samples.forEach((sample, index) => {
    const start = Math.max(0, Math.min(safeDuration, Number(sample.minute) || 0));
    const nextMinute = index + 1 < samples.length ? Number(samples[index + 1].minute) : safeDuration;
    const end = Math.max(start, Math.min(safeDuration, Number.isFinite(nextMinute) ? nextMinute : start));
    const span = end - start;
    if (!span) return;
    if (sample.value > 0) result.home += span;
    else if (sample.value < 0) result.away += span;
    else result.neutral += span;
  });
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

function formatAttackMinute(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function attackMatchDuration(match) {
  const eventMax = Math.max(0, ...(match.events || []).map((event) => attackEventMinute(event) || 0));
  const liveMinute = Number(match.currentMinute);
  return Math.max(90, Math.min(120, Math.max(eventMax, Number.isFinite(liveMinute) ? liveMinute : 0)));
}

function attackEventMinute(event) {
  const minute = Number(event.minute);
  if (!Number.isFinite(minute)) return null;
  const extra = Number(event.extraMinute || 0);
  return Math.max(0, Math.min(120, Math.round(minute + (Number.isFinite(extra) ? extra : 0))));
}

function attackEventWeight(event) {
  const type = event.eventType || event.type || "";
  if (statsEventIsPenaltyShootout(event)) return 0;
  if (type === "goal") {
    const goalType = attackGoalType(event);
    if (goalType === "penalty") return 11.4;
    if (goalType === "direct_free_kick") return 10.8;
    if (goalType === "set_piece") return 9.8;
    return 9;
  }
  return {
    penalty_win: 6.4,
    shot_on_target: 5.2,
    shot_off_target: 3.4,
    shot_blocked: 3,
    corner: 2.6,
    offside: 1.4,
  }[type] || 0;
}

function attackEventShortLabel(event) {
  const type = event.eventType || event.type || "";
  if (type === "goal") {
    const goalType = attackGoalType(event);
    return {
      penalty: "点球进球",
      direct_free_kick: "任意球破门",
      set_piece: "定位球进球",
      own_goal: "乌龙球",
    }[goalType] || "进球";
  }
  return { goal: "进球", penalty_win: "点球", shot_on_target: "射正", shot_off_target: "射门", shot_blocked: "封堵", corner: "角球", offside: "越位" }[type] || eventLabels[type] || "事件";
}

function attackGoalType(event) {
  if (statsEventIsOwnGoal(event)) return "own_goal";
  if (statsEventIsPenalty(event)) return "penalty";
  if (statsEventIsDirectFreeKickGoal(event)) return "direct_free_kick";
  if (statsEventIsSetPieceGoal(event)) return "set_piece";
  return "goal";
}

function seedAttackEcgFromStats(samples, left, right, match, profiles, intensity = 1) {
  seedAttackEcgSide(samples, left, "home", profiles.home || attackStatsProfile(left), match.id, intensity);
  seedAttackEcgSide(samples, right, "away", profiles.away || attackStatsProfile(right), match.id, intensity);
}

function attackStatsProfile(teamInfo) {
  const shots = attackStatValue(teamInfo, "totalShots", "shots");
  const shotsOnTarget = attackStatValue(teamInfo, "shotsOnTarget", "shotsOnTarget");
  const shotsOffTarget = attackStatValue(teamInfo, "shotsOffTarget", "shotsOffTarget");
  const blocked = attackStatValue(teamInfo, "blockedShots", "blockedShots");
  const corners = attackStatValue(teamInfo, "wonCorners", "corners");
  const offsides = attackStatValue(teamInfo, "offsides", "offsides");
  const dangerousAttacks = attackStatValue(teamInfo, "dangerousAttacks", "dangerousAttacks");
  const attacks = attackStatValue(teamInfo, "attacks", "attacks");
  const shotAssists = attackStatValue(teamInfo, "shotAssists", "shotAssists");
  const possession = attackStatValue(teamInfo, "possessionPct", "possessionPct");
  const passAccuracy = statPercentValue(teamInfo.stats || {}, "passPct", "accuratePasses", "totalPasses") || 0;
  const goals = teamInfo.events?.goals || 0;
  const shotQuality = shots > 0 ? shotsOnTarget / shots : 0;
  const creation = dangerousAttacks * 0.22 + attacks * 0.05 + shotAssists * 1.7;
  const finishing = shots * 1.65 + shotsOnTarget * 2.45 + shotsOffTarget * 0.85 + blocked * 1.15 + goals * 4.5;
  const territory = corners * 1.45 + offsides * 0.45 + Math.max(0, possession - 50) * 0.08 + Math.max(0, passAccuracy - 75) * 0.05;
  return {
    shots,
    shotsOnTarget,
    shotsOffTarget,
    blocked,
    corners,
    offsides,
    dangerousAttacks,
    attacks,
    shotAssists,
    possession,
    shotQuality,
    pressure: creation + finishing + territory,
  };
}

function attackRelativeScales(homeProfile, awayProfile) {
  const homePressure = homeProfile.pressure || 0;
  const awayPressure = awayProfile.pressure || 0;
  const average = Math.max(1, (homePressure + awayPressure) / 2);
  return {
    home: Math.max(0.74, Math.min(1.34, 0.94 + (homePressure / average - 1) * 0.22)),
    away: Math.max(0.74, Math.min(1.34, 0.94 + (awayPressure / average - 1) * 0.22)),
  };
}

function attackProfilesHaveExpandedStats(profiles) {
  return ["home", "away"].some((side) => {
    const profile = profiles?.[side] || {};
    return (profile.dangerousAttacks || 0) > 0 || (profile.shotAssists || 0) > 0;
  });
}

function attackAdjustedEventWeight(baseWeight, profile, relativeScale, event) {
  const type = event.eventType || event.type || "";
  const creationLift = Math.min(1.28, 1 + (profile.shotAssists || 0) * 0.018 + (profile.dangerousAttacks || 0) * 0.0025);
  const qualityLift = type === "shot_on_target" || type === "goal" ? 1 + Math.min(0.22, (profile.shotQuality || 0) * 0.22) : 1;
  const blockedLift = type === "shot_blocked" ? 1 + Math.min(0.18, (profile.blocked || 0) * 0.012) : 1;
  return Math.max(0.8, baseWeight * relativeScale * creationLift * qualityLift * blockedLift);
}

function attackStatValue(teamInfo, statKey, eventKey) {
  const direct = statNumber(teamInfo.stats, statKey);
  if (direct !== null) return direct;
  const eventValue = Number(teamInfo.events?.[eventKey]);
  return Number.isFinite(eventValue) ? eventValue : 0;
}

function seedAttackEcgSide(samples, teamInfo, side, profile, matchId, intensity = 1) {
  if (!profile.pressure) return;
  const seed = hashString(`${matchId}-${teamInfo.team.id}-${side}`);
  const pulseBase = profile.shots + profile.corners * 0.55 + profile.shotAssists * 0.35 + profile.dangerousAttacks * 0.035;
  const pulseCount = Math.max(4, Math.min(12, Math.round(pulseBase)));
  for (let index = 0; index < pulseCount; index += 1) {
    const minute = 7 + Math.round(((index + 0.5) / pulseCount) * 78 + (((seed >> (index % 12)) & 7) - 3));
    const emphasis = 1 + (index % 3) * 0.12 + (profile.shotAssists ? 0.06 : 0);
    const weight = Math.max(0.8, Math.min(6.5, (profile.pressure / Math.max(6, pulseCount) + emphasis) * intensity));
    samples.forEach((sample) => {
      const distance = sample.minute - minute;
      sample[side] += weight * Math.exp(-(distance * distance) / 12);
    });
  }
}

function hashString(value) {
  return Array.from(String(value || "")).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function attackKeyEvents(events) {
  return events
    .filter((item) => item.weight >= 2.6)
    .sort((a, b) => b.weight - a.weight || a.minute - b.minute)
    .slice(0, 10)
    .sort((a, b) => a.minute - b.minute);
}

function attackAssignGoalLabelSlots(events, duration = 90) {
  ["home", "away"].forEach((side) => {
    const goals = events
      .filter((item) => item.side === side && (item.event.eventType || item.event.type) === "goal")
      .sort((a, b) => a.minute - b.minute);
    let cluster = [];
    const flush = () => {
      const clusterSize = cluster.length;
      cluster.forEach((item, index) => {
        item.goalLabelSlot = index;
        item.goalLabelClusterSize = clusterSize;
      });
      cluster = [];
    };
    goals.forEach((item) => {
      if (cluster.length && item.minute - cluster[cluster.length - 1].minute > 6) flush();
      cluster.push(item);
    });
    flush();
    attackAssignGoalLabelLanes(goals, duration);
  });
  return events;
}

function attackAssignGoalLabelLanes(goals, duration) {
  const laneRightEdges = [];
  const gap = 10;
  goals.forEach((item) => {
    const label = attackGoalMarkerLabel(item);
    const bounds = attackGoalLabelAbsoluteBounds(item, label, duration);
    let lane = 0;
    while (Number.isFinite(laneRightEdges[lane]) && bounds.left < laneRightEdges[lane] + gap) lane += 1;
    item.goalLabelLane = lane;
    laneRightEdges[lane] = Math.max(laneRightEdges[lane] || -Infinity, bounds.right);
  });
}

function renderAttackKeyEvent(item, match) {
  const team = item.side === "home" ? match.homeTeam : match.awayTeam;
  const score = item.scoreLabel || (item.event.eventType === "goal" ? eventScore(item.event)?.label || "" : "");
  const player = item.event.player?.name || "";
  const detail = [player, score ? `比分 ${score}` : ""].filter(Boolean).join(" · ");
  return `
    <span class="attack-ecg-key-event ${escapeHtml(item.side)} ${escapeHtml(item.event.eventType || "")}">
      <em>${item.minute}'</em>
      <strong>${escapeHtml(team.code || team.name || "")} · ${escapeHtml(item.label)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </span>
  `;
}

function renderAttackEcgSvg(ecg, match) {
  if (!ecg.figureUrl) {
    return `<div class="attack-ecg-figure attack-ecg-figure-missing" role="status">进攻心率图正在生成，请稍后刷新。</div>`;
  }
  const separator = ecg.figureUrl.includes("?") ? "&" : "?";
  const figureSrc = `${ecg.figureUrl}${ecg.figureVersion ? `${separator}v=${encodeURIComponent(ecg.figureVersion)}` : ""}`;
  const homeName = match.homeTeam.name || match.homeTeam.code || "主队";
  const awayName = match.awayTeam.name || match.awayTeam.code || "客队";
  return `
    <div class="attack-ecg-figure">
      <img src="${escapeHtml(figureSrc)}" alt="${escapeHtml(`${homeName}对阵${awayName}的懂球帝逐分钟进攻心率图；主队位于上方，客队位于下方；普通进球、点球、乌龙球和角球由不同图标标注`)}" loading="lazy" />
    </div>
  `;
}

function attackPath(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function renderAttackEventMarker(item, xForMinute, yFor, baseY) {
  const type = item.event.eventType || item.event.type || "";
  const isGoal = type === "goal";
  const goalType = isGoal ? attackGoalType(item.event) : "";
  const x = xForMinute(item.minute);
  const eventValue = item.value || 0;
  const curveY = yFor(eventValue, item.side);
  const y = isGoal ? (item.side === "home" ? baseY - 88 : baseY + 88) : curveY;
  const goalLabel = isGoal ? attackGoalMarkerLabel(item) : "";
  const labelPosition = isGoal ? attackGoalLabelPosition(item, goalLabel) : null;
  return `
    <g class="attack-ecg-event ${escapeHtml(item.side)} ${escapeHtml(type)} ${escapeHtml(goalType)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      ${isGoal ? `<line x1="0" x2="0" y1="${item.side === "home" ? 9 : -9}" y2="${item.side === "home" ? 70 : -70}" />` : ""}
      <circle r="${isGoal ? 5.7 : 4.1}" />
      ${
        isGoal
          ? `<g class="attack-ecg-goal-label">
              <rect x="${labelPosition.rectX.toFixed(1)}" y="${labelPosition.rectY.toFixed(1)}" width="${labelPosition.width.toFixed(1)}" height="16" rx="5" />
              <text x="${labelPosition.textX.toFixed(1)}" y="${labelPosition.textY.toFixed(1)}" text-anchor="${labelPosition.textAnchor}">${escapeHtml(goalLabel)}</text>
            </g>`
          : ""
      }
    </g>
  `;
}

function attackGoalMarkerLabel(item) {
  const scoreLabel = eventScore(item.event)?.label || item.label || "";
  return `${item.minute}' ${scoreLabel}`;
}

function attackGoalLabelAbsoluteBounds(item, label, duration) {
  const width = 720;
  const padX = 54;
  const plotWidth = width - padX * 2;
  const safeDuration = Math.max(1, Number(duration) || 90);
  const x = padX + (item.minute / safeDuration) * plotWidth;
  const position = attackGoalLabelHorizontalPosition(item, label);
  return {
    left: x + position.rectX,
    right: x + position.rectX + position.width,
  };
}

function attackGoalLabelPosition(item, label) {
  const horizontal = attackGoalLabelHorizontalPosition(item, label);
  const lane = Math.max(0, Number(item.goalLabelLane || 0));
  const laneOffsets = item.side === "home" ? [-14, -30, 18, 34] : [17, 33, -14, -30];
  const textY = laneOffsets[lane % laneOffsets.length];
  return {
    ...horizontal,
    textY,
    rectY: textY - 12,
  };
}

function attackGoalLabelHorizontalPosition(item, label) {
  const clusterSize = Math.max(1, Number(item.goalLabelClusterSize || 1));
  const slot = Math.max(0, Number(item.goalLabelSlot || 0));
  const clusteredOffsets = clusterSize === 1 ? [0] : clusterSize === 2 ? [-24, 24] : [-32, 32, 0];
  const offsetX = clusteredOffsets[slot % clusteredOffsets.length] || 0;
  const nearRightEdge = item.minute >= 86;
  const nearLeftEdge = item.minute <= 6;
  const textAnchor = nearRightEdge ? "end" : nearLeftEdge ? "start" : "middle";
  const edgeX = nearRightEdge ? -8 : nearLeftEdge ? 8 : 0;
  const textX = edgeX + (textAnchor === "middle" ? offsetX : offsetX * 0.35);
  const width = Math.max(40, Math.min(74, String(label || "").length * 6.2 + 12));
  let rectX = textX - width / 2;
  if (textAnchor === "start") rectX = textX - 5;
  if (textAnchor === "end") rectX = textX - width + 5;
  return {
    textAnchor,
    textX,
    rectX,
    width,
  };
}

function hasStatsStatistics(row) {
  const statistics = row?.stats?.statistics;
  return Array.isArray(statistics) || Boolean(statistics && typeof statistics === "object");
}

function statsTeamMatches(rowTeam, team) {
  const wanted = statsTeamKeys(team);
  return Array.from(statsTeamKeys(rowTeam)).some((key) => wanted.has(key));
}

function statsTeamKeys(team) {
  return new Set(
    [team?.id, team?.code, team?.name, team?.nameEn, team?.displayName]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
  );
}

function flattenStatsPayload(payload) {
  const flattened = { ...(payload || {}) };
  if (Array.isArray(payload?.statistics)) {
    payload.statistics.forEach((item) => {
      const key = item.name || item.abbreviation || item.shortDisplayName || item.displayName;
      if (!key) return;
      assignFlattenedStat(flattened, key, item);
    });
    return flattened;
  }
  if (!payload?.statistics || typeof payload.statistics !== "object") return flattened;
  Object.entries(payload.statistics).forEach(([key, item]) => {
    if (!key) return;
    assignFlattenedStat(flattened, key, item);
  });
  return flattened;
}

function assignFlattenedStat(flattened, key, item) {
  const displayValue = item?.displayValue ?? item?.value ?? item;
  const normalized = parseStatNumber(displayValue);
  flattened[key] = normalized === null ? displayValue : normalized;
  if (item?.displayValue !== undefined && item.displayValue !== null) flattened[`${key}Display`] = String(item.displayValue);
  if (item?.value !== undefined && item.value !== null) flattened[`${key}Raw`] = item.value;
}

function parseStatNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "-") return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function statNumber(stats, key) {
  const value = parseStatNumber(stats?.[key]);
  return value === null ? null : value;
}

function firstStatNumber(stats, keys) {
  for (const key of keys || []) {
    const value = statNumber(stats, key);
    if (value !== null) return value;
  }
  return null;
}

function statPercentValue(stats, pctKey, numeratorKey, denominatorKey) {
  const numerator = statNumber(stats, numeratorKey);
  const denominator = statNumber(stats, denominatorKey);
  if (numerator !== null && denominator > 0) return (numerator / denominator) * 100;
  const direct = statNumber(stats, pctKey);
  if (direct === null) return null;
  return direct > 0 && direct <= 1 ? direct * 100 : direct;
}

function countStatsEvents(events, team) {
  const counts = {
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    shotsOffTarget: 0,
    blockedShots: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    substitutions: 0,
    offsides: 0,
    varChecks: 0,
    penaltyKickShots: 0,
    penaltyKickGoals: 0,
    freeKicksWon: 0,
    directFreeKickGoals: 0,
  };
  events.forEach((event) => {
    if (statsEventIsPenaltyShootout(event)) return;
    if (statsEventFreeKickWonMatchesTeam(event, team)) counts.freeKicksWon += 1;
    if (!statsEventMatchesTeam(event, team)) return;
    const type = event.eventType || event.type || "";
    if (type === "goal") {
      counts.goals += 1;
      counts.shots += 1;
      counts.shotsOnTarget += 1;
      if (statsEventIsPenalty(event)) {
        counts.penaltyKickShots += 1;
        counts.penaltyKickGoals += 1;
      }
      if (statsEventIsDirectFreeKickGoal(event)) counts.directFreeKickGoals += 1;
    } else if (type === "shot_on_target") {
      counts.shots += 1;
      counts.shotsOnTarget += 1;
    } else if (type === "shot_off_target") {
      counts.shots += 1;
      counts.shotsOffTarget += 1;
    } else if (type === "shot_blocked") {
      counts.shots += 1;
      counts.blockedShots += 1;
    } else if (type === "corner") {
      counts.corners += 1;
    } else if (type === "foul") {
      counts.fouls += 1;
    } else if (type === "yellow_card") {
      counts.yellowCards += 1;
    } else if (type === "red_card") {
      counts.redCards += 1;
    } else if (type === "substitution") {
      counts.substitutions += 1;
    } else if (type === "offside") {
      counts.offsides += 1;
    } else if (type === "var") {
      counts.varChecks += 1;
    }
  });
  return counts;
}

function statsEventRawText(event) {
  const qualifiers = event.qualifiers || {};
  return `${qualifiers.espnRawType || ""} ${qualifiers.espnText || ""} ${qualifiers.espnShortText || ""} ${event.description || ""}`;
}

function statsEventIsPenaltyShootout(event) {
  const period = String(event?.period || "").toLowerCase();
  return ["penalty", "penalties", "shootout", "penalty_shootout"].includes(period);
}

function statsEventIsOwnGoal(event) {
  if (event?.qualifiers?.ownGoal) return true;
  const raw = statsEventRawText(event).toLowerCase();
  return raw.includes("own goal") || raw.includes("own-goal") || raw.includes("乌龙");
}

function statsEventIsPenalty(event) {
  if (event?.qualifiers?.penaltyKick) return true;
  const raw = statsEventRawText(event).toLowerCase();
  return raw.includes("penalty") || raw.includes("点球");
}

function statsEventIsDirectFreeKickGoal(event) {
  const raw = statsEventRawText(event).toLowerCase();
  return raw.includes("goal---free-kick") || raw.includes("goal - free-kick") || raw.includes("direct free kick") || raw.includes("from a free kick") || raw.includes("任意球直接");
}

function statsEventIsSetPieceGoal(event) {
  const raw = statsEventRawText(event).toLowerCase();
  return raw.includes("set piece") || raw.includes("set-piece") || raw.includes("following a free kick") || raw.includes("following a corner") || raw.includes("定位球");
}

function statsEventFreeKickWonMatchesTeam(event, team) {
  const type = event.eventType || event.type || "";
  if (type !== "foul") return false;
  const raw = statsEventRawText(event);
  const match = raw.match(/\(([^)]+)\)\s+wins a free kick/i);
  return Boolean(match && statsTeamNameMatches(match[1], team));
}

function statsEventMatchesTeam(event, team) {
  const wanted = statsTeamKeys(team);
  return Array.from(statsTeamKeys(event.team)).some((key) => wanted.has(key));
}

function normalizeStatsTeamName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function statsTeamNameMatches(value, team) {
  const normalized = normalizeStatsTeamName(value);
  if (!normalized) return false;
  return [team?.name, team?.nameEn, team?.code, team?.displayName]
    .filter(Boolean)
    .some((item) => normalizeStatsTeamName(item) === normalized);
}

function correctedStatCount(stats, events, key) {
  const direct = statNumber(stats, key);
  const eventValue = events?.[key];
  if (direct === null && eventValue === undefined) return null;
  return Math.max(direct ?? 0, eventValue ?? 0);
}

function statsMetricValue(teamData, metric) {
  const computed = metric.compute ? metric.compute(teamData.stats, teamData.events, teamData) : null;
  if (computed !== null && computed !== undefined && Number.isFinite(Number(computed))) return Number(computed);
  const alternate = firstStatNumber(teamData.stats, metric.keys);
  if (alternate !== null) return alternate;
  const direct = metric.key ? statNumber(teamData.stats, metric.key) : null;
  if (direct !== null) return direct;
  if (metric.eventKey && teamData.events[metric.eventKey] !== undefined) return teamData.events[metric.eventKey];
  return null;
}

function statsMetricAvailable(left, right, metric) {
  return statsMetricValue(left, metric) !== null || statsMetricValue(right, metric) !== null;
}

function formatStatsValue(value, metric) {
  if (value === null || value === undefined) return "-";
  const precision = metric.precision ?? (Number.isInteger(value) ? 0 : 1);
  const text = Number(value).toLocaleString("zh-CN", { maximumFractionDigits: precision, minimumFractionDigits: metric.unit === "%" ? Math.min(precision, 1) : 0 });
  return `${text}${metric.unit || ""}`;
}

function parseAttendanceValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return parseAttendanceValue(value.attendance ?? value.value ?? value.displayValue);
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const parsed = Number(String(value).replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function formatAttendanceValue(value, display) {
  const attendance = parseAttendanceValue(value);
  if (attendance === null) return "待公布";
  if (display && parseAttendanceValue(display) === attendance) return display;
  return `${attendance.toLocaleString("zh-CN")} 人`;
}

function matchAttendanceInfo(match) {
  const attendance = parseAttendanceValue(match?.attendance ?? match?.attendanceCount);
  if (attendance === null) return { value: "待公布", detail: "FIFA 官方暂未公布" };
  return {
    value: formatAttendanceValue(attendance, match?.attendanceDisplay),
    detail: match?.attendanceSource || "FIFA 官方统计",
  };
}

function renderStatsHeroTeam(teamData, side) {
  return `
    <div class="match-stats-team ${escapeHtml(side)}">
      ${teamLogo(teamData.team, "team-logo")}
      <div>
        <strong>${escapeHtml(teamDisplayName(teamData.team))}</strong>
        <span>${escapeHtml(teamDisplayCode(teamData.team))} · ${escapeHtml(teamData.formation)}</span>
      </div>
    </div>
  `;
}

function renderStatsStatusTile(label, value, detail) {
  return `
    <div class="match-stats-status-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </div>
  `;
}

function renderStatsHeadline(left, right, metric) {
  const leftValue = statsMetricValue(left, metric);
  const rightValue = statsMetricValue(right, metric);
  const lead = leftValue === null || rightValue === null ? null : leftValue === rightValue ? "balanced" : leftValue > rightValue ? "home" : "away";
  const detail = lead === "balanced" ? "均势" : lead === "home" ? `${teamCompactName(left.team)}占优` : lead === "away" ? `${teamCompactName(right.team)}占优` : "数据待补齐";
  const leftText = formatStatsValue(leftValue, metric);
  const rightText = formatStatsValue(rightValue, metric);
  return `
    <div class="match-stats-headline ${lead || ""}">
      <span>${escapeHtml(metric.label)}</span>
      <strong>
        <span class="match-stats-headline-value home-value">${escapeHtml(leftText)}</span>
        <i>:</i>
        <span class="match-stats-headline-value away-value">${escapeHtml(rightText)}</span>
      </strong>
      <em>${escapeHtml(detail)}</em>
    </div>
  `;
}

function renderStatsGroup(left, right, group) {
  const rows = group.metrics.map((metric) => renderStatsCompareRow(left, right, metric)).filter(Boolean).join("");
  if (!rows) return "";
  return `
    <section class="match-stats-group">
      <div class="match-stats-group-head">
        <div>
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(group.note)}</p>
        </div>
      </div>
      <div class="match-stats-rows">${rows}</div>
    </section>
  `;
}

function renderStatsCompareRow(left, right, metric) {
  const leftValue = statsMetricValue(left, metric);
  const rightValue = statsMetricValue(right, metric);
  if (leftValue === null && rightValue === null) return "";
  const leftNumber = leftValue ?? 0;
  const rightNumber = rightValue ?? 0;
  const total = leftNumber + rightNumber;
  const leftShare = total > 0 ? Math.min(100, Math.max(0, (leftNumber / total) * 100)) : 50;
  return `
    <div class="match-stats-row">
      <strong>${escapeHtml(formatStatsValue(leftValue, metric))}</strong>
      <div class="match-stats-row-main">
        <span>${escapeHtml(metric.label)}</span>
        <div class="match-stats-track" aria-hidden="true">
          <i class="home" style="width:${leftShare}%"></i>
          <i class="away" style="width:${100 - leftShare}%"></i>
        </div>
      </div>
      <strong>${escapeHtml(formatStatsValue(rightValue, metric))}</strong>
    </div>
  `;
}

function renderStatBar(label, left, right) {
  const total = Math.max(left + right, 1);
  const pct = Math.round((left / total) * 100);
  return `
    <div class="bar-stat">
      <div class="split"><strong>${escapeHtml(label)}</strong></div>
      <div class="bar-row">
        <strong>${left}</strong>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <strong>${right}</strong>
      </div>
    </div>
  `;
}

function h2hTeamKey(team) {
  return String(team?.id || team?.code || team?.fifaCode || team?.nameEn || team?.name || "").toLowerCase();
}

function h2hScoreForTeam(item, team) {
  const key = h2hTeamKey(team);
  if (!key) return null;
  if (h2hTeamKey(item.homeTeam) === key) return item.score?.home ?? null;
  if (h2hTeamKey(item.awayTeam) === key) return item.score?.away ?? null;
  return null;
}

function h2hIsWorldCup(item) {
  const label = `${item.competition?.nameEn || ""} ${item.competition?.name || ""}`.toLowerCase();
  return item.competitionCategory === "worldCup" || label.includes("world cup") || label.includes("世界杯");
}

function h2hIsFriendly(item) {
  const label = `${item.competition?.nameEn || ""} ${item.competition?.name || ""} ${item.stage?.name || ""}`.toLowerCase();
  return item.competitionCategory === "friendly" || label.includes("friendl") || label.includes("友谊");
}

const H2H_COMPETITION_NAME_ZH = new Map([
  ["fifa world cup", "世界杯"],
  ["fifa world cup qualifier", "世界杯预选赛"],
  ["fifa world cup qualifiers", "世界杯预选赛"],
  ["world cup qualifier", "世界杯预选赛"],
  ["world cup qualifiers", "世界杯预选赛"],
  ["uefa nations league", "欧国联"],
  ["uefa european championship", "欧洲杯"],
  ["friendlies", "国际友谊赛"],
  ["international friendly", "国际友谊赛"],
  ["international friendlies", "国际友谊赛"],
  ["olympic football tournament final", "奥运会足球决赛"],
  ["olympic football tournament", "奥运会足球赛"],
  ["kirin cup", "麒麟杯"],
  ["kirin challenge cup", "麒麟挑战杯"],
  ["pan american games", "泛美运动会男足"],
  ["conmebol-uefa cup of champions", "南美欧洲超级杯"],
  ["fifa series", "国际足联系列赛"],
  ["fifa系列赛", "国际足联系列赛"],
  ["u20世界杯", "20岁以下世界杯"],
  ["国际友谊", "国际友谊赛"],
  ["球会友谊", "国际友谊赛"],
  ["世欧预", "世界杯欧洲区预选赛"],
  ["欧杯预", "欧洲杯预选赛"],
  ["美金杯", "中北美洲及加勒比海金杯赛"],
]);

function h2hCompetitionDisplayName(competition) {
  const raw = String(competition?.name || competition?.nameEn || "国际足联赛事").trim();
  const normalized = raw.replaceAll("™", "").replace(/\s+/g, " ").trim().toLowerCase();
  const exact = H2H_COMPETITION_NAME_ZH.get(normalized);
  if (exact) return exact;
  if (normalized.includes("world cup") && normalized.includes("qualif")) return "世界杯预选赛";
  if (normalized.includes("world cup")) return "世界杯";
  if (normalized.includes("nations league")) return "欧国联";
  if (normalized.includes("european championship")) return "欧洲杯";
  if (normalized.includes("friendl")) return "国际友谊赛";
  if (normalized.includes("olympic football")) return "奥运会足球赛";
  if (normalized.includes("africa cup of nations")) return "非洲杯";
  if (normalized.includes("asian cup")) return "亚洲杯";
  if (normalized.includes("copa america")) return "美洲杯";
  if (normalized.includes("gold cup")) return "中北美洲及加勒比海金杯赛";
  if (normalized.includes("confederations cup")) return "联合会杯";
  return raw;
}

function h2hIdentityTeamKey(team) {
  return String(team?.code || team?.fifaCode || team?.id || team?.nameEn || team?.name || "").toUpperCase();
}

function h2hItemsAreDuplicate(left, right) {
  const leftTeams = [h2hIdentityTeamKey(left?.homeTeam), h2hIdentityTeamKey(left?.awayTeam)].sort();
  const rightTeams = [h2hIdentityTeamKey(right?.homeTeam), h2hIdentityTeamKey(right?.awayTeam)].sort();
  if (leftTeams.some((team) => !team) || leftTeams.join("|") !== rightTeams.join("|")) return false;
  const leftTime = Date.parse(left?.kickoffAt || "");
  const rightTime = Date.parse(right?.kickoffAt || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return Math.abs(leftTime - rightTime) <= 36 * 60 * 60 * 1000;
  }
  return String(left?.kickoffAt || "").slice(0, 10) === String(right?.kickoffAt || "").slice(0, 10)
    && String(left?.score?.home ?? "") === String(right?.score?.home ?? "")
    && String(left?.score?.away ?? "") === String(right?.score?.away ?? "");
}

function h2hItemQuality(item) {
  const official = item?.isOfficial ? 300 : 0;
  const source = item?.sourceType === "fifaPublicApi" ? 300 : item?.sourceType === "dongqiudiPublicData" ? 200 : item?.sourceType === "qtxPublicPage" ? 0 : 100;
  const richness = [item?.competition?.name, item?.stage?.name, item?.venue?.name, item?.sourceUrl].filter(Boolean).length;
  return official + source + richness;
}

function h2hDedupeItems(items) {
  const deduped = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const index = deduped.findIndex((existing) => h2hItemsAreDuplicate(existing, item));
    if (index < 0) {
      deduped.push(item);
    } else if (h2hItemQuality(item) > h2hItemQuality(deduped[index])) {
      deduped[index] = item;
    }
  });
  return deduped;
}

function h2hFilterItems(items, filter) {
  const sorted = [...items].sort((a, b) => String(b.kickoffAt || "").localeCompare(String(a.kickoffAt || "")));
  if (filter === "worldCup") return sorted.filter(h2hIsWorldCup);
  if (filter === "fifa") return sorted.filter((item) => item.isOfficial || item.sourceType === "fifaPublicApi" || item.dataScope === "fifaCompetitions" || h2hIsWorldCup(item));
  if (filter === "friendly" || filter === "qtx") return sorted.filter(h2hIsFriendly);
  if (filter === "recent5") return sorted.slice(0, 5);
  if (filter === "recent10") return sorted.slice(0, 10);
  if (filter === "neutral") return sorted.filter((item) => item.neutral);
  return sorted;
}

function h2hCalculateSummary(items, teamA, teamB, fallback = {}) {
  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let teamAGoals = 0;
  let teamBGoals = 0;
  let highestScoringMatch = null;
  let biggestMarginMatch = null;
  const recentForm = [];
  const competitionCounts = {};
  let neutralCount = 0;
  items.forEach((item) => {
    const aScore = h2hScoreForTeam(item, teamA);
    const bScore = h2hScoreForTeam(item, teamB);
    if (aScore === null || bScore === null) return;
    const a = Number(aScore);
    const b = Number(bScore);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    teamAGoals += a;
    teamBGoals += b;
    if (a > b) {
      teamAWins += 1;
      if (recentForm.length < 5) recentForm.push("A");
    } else if (b > a) {
      teamBWins += 1;
      if (recentForm.length < 5) recentForm.push("B");
    } else {
      draws += 1;
      if (recentForm.length < 5) recentForm.push("D");
    }
    const totalGoals = a + b;
    if (!highestScoringMatch || totalGoals > highestScoringMatch.totalGoals) {
      highestScoringMatch = { match: item, label: scoreText(item), totalGoals };
    }
    const margin = Math.abs(a - b);
    if (!biggestMarginMatch || margin > biggestMarginMatch.margin) {
      biggestMarginMatch = { match: item, label: scoreText(item), margin };
    }
    const competitionName = h2hCompetitionDisplayName(item.competition);
    competitionCounts[competitionName] = (competitionCounts[competitionName] || 0) + 1;
    if (item.neutral) neutralCount += 1;
  });
  const total = items.length;
  const totalGoals = teamAGoals + teamBGoals;
  return {
    ...fallback,
    total,
    teamAWins,
    teamBWins,
    homeWins: teamAWins,
    awayWins: teamBWins,
    draws,
    teamAGoals,
    teamBGoals,
    totalGoals,
    averageGoals: total ? Number((totalGoals / total).toFixed(2)) : 0,
    latestMatch: items[0] || null,
    highestScoringMatch,
    biggestMarginMatch,
    recentForm,
    neutralCount,
    competitionBreakdown: Object.entries(competitionCounts).map(([name, count]) => ({ name, count })),
  };
}

function h2hResultLabel(item, teamA, teamB) {
  const aScore = h2hScoreForTeam(item, teamA);
  const bScore = h2hScoreForTeam(item, teamB);
  if (aScore === null || bScore === null) return "真实赛果";
  if (aScore > bScore) return `${teamDisplayName(teamA)}胜`;
  if (bScore > aScore) return `${teamDisplayName(teamB)}胜`;
  return "常规时间平局";
}

function h2hPenaltyText(item) {
  const home = item.penaltyScore?.home;
  const away = item.penaltyScore?.away;
  if (home === null || home === undefined || away === null || away === undefined) return "";
  return `点球 ${home}-${away}`;
}

function h2hDateLabel(iso) {
  if (!iso) return "日期待定";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function h2hRecentFormToken(code, summary) {
  const value = String(code || "").toUpperCase();
  if (value === "A") {
    const label = `${teamCompactName(summary.teamA)}胜`;
    return { label, title: `${teamDisplayName(summary.teamA)}获胜`, className: "team-a" };
  }
  if (value === "B") {
    const label = `${teamCompactName(summary.teamB)}胜`;
    return { label, title: `${teamDisplayName(summary.teamB)}获胜`, className: "team-b" };
  }
  if (value === "D") return { label: "平", title: "常规时间平局", className: "draw" };
  return { label: value || "-", title: "赛果待核验", className: "unknown" };
}

function renderH2HRecentForm(summary) {
  const form = Array.isArray(summary.recentForm) ? summary.recentForm : [];
  if (!form.length) return `<strong>暂无</strong>`;
  return `
    <strong class="h2h-form-list" aria-label="近5场走势">
      ${form
        .map((item) => {
          const token = h2hRecentFormToken(item, summary);
          return `<em class="h2h-form-pill ${escapeHtml(token.className)}" title="${escapeHtml(token.title)}">${escapeHtml(token.label)}</em>`;
        })
        .join("")}
    </strong>
  `;
}

function renderH2H(h2h, match, options = {}) {
  const metadata = h2h?.metadata || {};
  const backendSummary = h2h?.summary || {};
  const teamA = backendSummary.teamA || match.homeTeam;
  const teamB = backendSummary.teamB || match.awayTeam;
  const rawItems = h2hDedupeItems(h2h?.items);
  const currentFilter = options.h2hFilter || "all";
  const filteredItems = h2hFilterItems(rawItems, currentFilter);
  const summary = h2hCalculateSummary(filteredItems, teamA, teamB, backendSummary);
  const displayItems = options.h2hExpanded ? filteredItems : filteredItems.slice(0, 5);
  const unavailable = h2h && h2h.available === false;
  const emptyReason = h2h?.reason || "暂未找到两队的历史交锋记录";

  return `
    <section class="h2h-panel" aria-label="历史交锋统计">
      ${renderH2HHero(teamA, teamB, summary, metadata)}
      ${renderH2HScopeNotice(metadata, backendSummary, h2h)}
      ${unavailable ? renderH2HEmptyState("官方历史交锋数据暂不可用", emptyReason, "error") : ""}
      ${!unavailable ? renderH2HSummaryBar(summary, teamA, teamB) : ""}
      ${!unavailable ? renderH2HStatGrid(summary) : ""}
      ${renderH2HFilterChips(match, currentFilter)}
      ${!unavailable ? renderH2HMatchTimeline(displayItems, teamA, teamB, filteredItems.length, options.h2hExpanded, currentFilter, match, emptyReason) : ""}
      ${!unavailable ? renderH2HCompetitionBreakdown(summary) : ""}
      ${renderH2HSourceNote(metadata, backendSummary)}
    </section>
  `;
}

function renderH2HHero(teamA, teamB, summary, metadata) {
  return `
    <section class="h2h-hero">
      <div class="h2h-hero-team">
        ${teamLogo(teamA, "team-logo h2h-flag")}
        <strong>${escapeHtml(teamDisplayName(teamA, "待定球队"))}</strong>
        <span>${escapeHtml(teamDisplayCode(teamA, "-"))}</span>
      </div>
      <div class="h2h-versus">
        <span>${escapeHtml(metadata.scopeLabel || "全历史交锋")}</span>
        <strong>${escapeHtml(summary.total ?? 0)}</strong>
        <em>场真实赛果</em>
      </div>
      <div class="h2h-hero-team right">
        ${teamLogo(teamB, "team-logo h2h-flag")}
        <strong>${escapeHtml(teamDisplayName(teamB, "待定球队"))}</strong>
        <span>${escapeHtml(teamDisplayCode(teamB, "-"))}</span>
      </div>
    </section>
  `;
}

function renderH2HScopeNotice(metadata, summary, h2h) {
  const sourceStatus = summary.sourceStatus || (h2h?.available === false ? "failed" : "ok");
  return `
    <section class="h2h-scope-notice">
      <div>
        <strong>${escapeHtml(metadata.scopeLabel || summary.scopeLabel || "全历史交锋")}</strong>
        <p>${escapeHtml(summary.sourceNote || "历史记录来自懂球帝 App 公开全量球队赛历（含友谊赛），并以 FIFA 公开赛事接口交叉核验。")}</p>
      </div>
      <span class="h2h-status ${escapeHtml(sourceStatus)}">${sourceStatus === "ok" ? "真实数据" : sourceStatus === "partial" ? "部分同步" : "待同步"}</span>
    </section>
  `;
}

function renderH2HSummaryBar(summary, teamA, teamB) {
  const total = Math.max(Number(summary.total || 0), 0);
  const aPct = total && summary.teamAWins ? Math.max(4, Math.round((summary.teamAWins / total) * 100)) : 0;
  const drawPct = total && summary.draws ? Math.max(4, Math.round((summary.draws / total) * 100)) : 0;
  const bPct = total && summary.teamBWins ? Math.max(4, Math.max(0, 100 - aPct - drawPct)) : 0;
  return `
    <section class="h2h-summary-card">
      <div class="h2h-wdl-labels">
        <strong>${escapeHtml(teamCompactName(teamA))} ${escapeHtml(summary.teamAWins ?? 0)}胜</strong>
        <strong>平 ${escapeHtml(summary.draws ?? 0)}</strong>
        <strong>${escapeHtml(teamCompactName(teamB))} ${escapeHtml(summary.teamBWins ?? 0)}胜</strong>
      </div>
      <div class="h2h-summary-bar" aria-label="胜平负比例">
        ${total ? `<span class="team-a" style="width:${aPct}%"></span><span class="draw" style="width:${drawPct}%"></span><span class="team-b" style="width:${bPct}%"></span>` : `<span class="empty" style="width:100%"></span>`}
      </div>
      <div class="h2h-goal-row">
        <span>${escapeHtml(teamCompactName(teamA))}进球 <strong>${escapeHtml(summary.teamAGoals ?? 0)}</strong></span>
        <span>场均 <strong>${escapeHtml(summary.averageGoals ?? 0)}</strong></span>
        <span>${escapeHtml(teamCompactName(teamB))}进球 <strong>${escapeHtml(summary.teamBGoals ?? 0)}</strong></span>
      </div>
    </section>
  `;
}

function renderH2HStatGrid(summary) {
  const latest = summary.latestMatch ? h2hDateLabel(summary.latestMatch.kickoffAt) : "暂无";
  const biggest = summary.biggestMarginMatch?.label || summary.highestScoringMatch?.label || "暂无";
  return `
    <section class="h2h-stat-grid">
      <div><span>总进球</span><strong>${escapeHtml(summary.totalGoals ?? 0)}</strong></div>
      <div><span>最近交锋</span><strong>${escapeHtml(latest)}</strong></div>
      <div><span>最大比分</span><strong>${escapeHtml(biggest)}</strong></div>
      <div><span>近5场走势</span>${renderH2HRecentForm(summary)}</div>
    </section>
  `;
}

function renderH2HFilterChips(match, currentFilter) {
  const filters = [
    ["all", "全部"],
    ["worldCup", "世界杯"],
    ["fifa", "FIFA赛事"],
    ["friendly", "友谊赛"],
    ["recent5", "近5场"],
    ["recent10", "近10场"],
    ["neutral", "中立场"],
  ];
  return `
    <nav class="h2h-filter-chips" aria-label="历史交锋筛选">
      ${filters
        .map(([key, label]) => {
          const active = currentFilter === key;
          return `<a class="${active ? "active" : ""}" aria-selected="${active}" href="${matchDetailHref(match.id, { tab: "h2h", h2hFilter: key })}">${escapeHtml(label)}</a>`;
        })
        .join("")}
    </nav>
  `;
}

function renderH2HMatchTimeline(items, teamA, teamB, total, expanded, currentFilter, match, emptyReason) {
  if (!items.length) return renderH2HEmptyState("暂无交锋记录", currentFilter === "all" ? emptyReason : "当前筛选下暂无真实交锋记录", "empty");
  const toggle =
    total > 5 && currentFilter !== "recent5"
      ? `<a class="h2h-expand-link" href="${matchDetailHref(match.id, { tab: "h2h", h2hFilter: currentFilter, h2hExpanded: expanded ? "" : "1" })}">${expanded ? "收起" : `查看全部 ${total} 场`}</a>`
      : "";
  return `
    <section class="h2h-timeline">
      <div class="h2h-section-title">
        <div>
          <strong>最近交锋</strong>
          <span>按比赛日期倒序</span>
        </div>
        ${toggle}
      </div>
      <div class="h2h-list">${items.map((item) => renderH2HItem(item, teamA, teamB)).join("")}</div>
    </section>
  `;
}

function renderH2HItem(match, teamA, teamB) {
  const venue = [match.venue?.city, match.venue?.countryName || match.venue?.countryCode, match.venue?.name].filter(Boolean).join(" · ");
  const penaltyText = h2hPenaltyText(match);
  const sourceLinkLabel = match.sourceLabel || (match.sourceType === "dongqiudiPublicData" ? "懂球帝比赛页" : match.sourceType === "qtxPublicPage" ? "球天下页面" : "官方页面");
  const sourceBadge = h2hIsWorldCup(match) ? `<em>世界杯</em>` : h2hIsFriendly(match) ? `<em>友谊赛</em>` : match.sourceType === "dongqiudiPublicData" ? `<em>公开数据</em>` : match.sourceType === "qtxPublicPage" ? "" : `<em>FIFA赛事</em>`;
  const resultLabel = h2hResultLabel(match, teamA, teamB);
  return `
    <article class="h2h-card">
      <div class="h2h-date">
        <div>
          <strong>${escapeHtml(h2hDateLabel(match.kickoffAt))}</strong>
          <span>${escapeHtml(h2hCompetitionDisplayName(match.competition))}</span>
        </div>
        ${sourceBadge}
      </div>
      <div class="h2h-scoreline">
        <span class="h2h-team">${teamLogo(match.homeTeam, "team-logo small")} <strong>${escapeHtml(teamDisplayName(match.homeTeam, "待定球队"))}</strong></span>
        <span class="h2h-score"><small>比分</small><strong>${escapeHtml(scoreText(match))}</strong></span>
        <span class="h2h-team right">${teamLogo(match.awayTeam, "team-logo small")} <strong>${escapeHtml(teamDisplayName(match.awayTeam, "待定球队"))}</strong></span>
      </div>
      <div class="h2h-info">
        <span>${escapeHtml(match.stage?.name || "阶段待定")}</span>
        <span>${escapeHtml(venue || "场地未公布")}</span>
        <span class="h2h-result">${escapeHtml(resultLabel)}</span>
        ${match.neutral ? `<span>中立场</span>` : ""}
        ${penaltyText ? `<span>${escapeHtml(penaltyText)}</span>` : ""}
        ${match.sourceUrl ? `<a class="h2h-source-link" href="${escapeHtml(match.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceLinkLabel)}</a>` : ""}
      </div>
    </article>
  `;
}

function renderH2HCompetitionBreakdown(summary) {
  const items = Array.isArray(summary.competitionBreakdown) ? summary.competitionBreakdown : [];
  if (!items.length && !summary.neutralCount) return "";
  return `
    <section class="h2h-breakdown">
      <div class="h2h-section-title"><strong>赛事分布</strong><span>来自当前筛选结果</span></div>
      <div class="h2h-breakdown-grid">
        ${items.map((item) => `<div><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.count)} 场</strong></div>`).join("")}
        <div><span>中立场</span><strong>${escapeHtml(summary.neutralCount || 0)} 场</strong></div>
      </div>
    </section>
  `;
}

function renderH2HSourceNote(metadata, summary) {
  const generated = metadata.generatedAt ? h2hDateLabel(metadata.generatedAt) : "待同步";
  const verifyUrl = metadata.verificationLinks?.headToHead || "https://inside.fifa.com/data-centre/head-to-head";
  const archiveUrl = metadata.verificationLinks?.matches || "https://inside.fifa.com/data-centre/matches";
  const dongqiudiUrl = summary.dongqiudiSource?.sourceUrl || metadata.verificationLinks?.dongqiudi || "https://pc.dongqiudi.com/match-new";
  const qtxUrl = summary.qtxSource?.sourceUrl || metadata.verificationLinks?.qtx || "https://www.qtx.com/worldcup/";
  return `
    <section class="h2h-source-note">
      <strong>数据来源</strong>
      <p>来源：${escapeHtml(metadata.source || summary.source || "懂球帝 App 公开数据层 + FIFA 公开赛事接口")}；范围：${escapeHtml(metadata.scopeLabel || summary.scopeLabel || "全历史交锋")}；最后更新：${escapeHtml(generated)}。</p>
      <p>说明：懂球帝全量球队赛历覆盖正式比赛与友谊赛；FIFA 用于交叉核验。点球大战不计入常规胜负，如有点球数据会单独标注。</p>
      <div>
        <a href="${escapeHtml(dongqiudiUrl)}" target="_blank" rel="noreferrer">懂球帝公开赛历</a>
        <a href="${escapeHtml(verifyUrl)}" target="_blank" rel="noreferrer">前往 FIFA Data Centre 核验</a>
        <a href="${escapeHtml(archiveUrl)}" target="_blank" rel="noreferrer">国际比赛档案</a>
        ${summary.qtxCount ? `<a href="${escapeHtml(qtxUrl)}" target="_blank" rel="noreferrer">球天下回退来源</a>` : ""}
      </div>
    </section>
  `;
}

function renderH2HEmptyState(title, description, type = "empty") {
  return `
    <section class="h2h-empty ${escapeHtml(type)}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description || "对阵确认后可查看历史交锋。")}</p>
    </section>
  `;
}

function renderSources(match) {
  const source = match.source || {};
  return `
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><h2>供应商映射</h2></div>
        <div class="panel-body source-list">
          ${(source.mappings || [])
            .map(
              (item) => `
                <div class="source-item">
                  <div>
                    <strong>${escapeHtml(item.provider.name)}</strong>
                    <div class="muted mini">${escapeHtml(item.entityType)} · ${escapeHtml(item.externalId)} · ${escapeHtml(item.rawRef)}</div>
                  </div>
                  ${sourceBadge(item.provider)}
                </div>
              `
            )
            .join("") || `<div class="empty">暂无映射</div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>归档与授权</h2><a class="btn" href="${escapeHtml(match.sourceUrl)}" target="_blank" rel="noreferrer">官方回链</a></div>
        <div class="panel-body">
          <p class="muted">${escapeHtml(source.licenseNotice || "")}</p>
          <div class="source-list">
            ${(source.payloadArchive || [])
              .map((item) => `<div class="source-item"><strong>${escapeHtml(item.entity_type)}</strong><span class="muted mini">${escapeHtml(item.checksum.slice(0, 16))}</span></div>`)
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function connectMatchStream(matchId) {
  if (ARCHIVE_MODE) return;
  let receivedStreamEvent = false;
  let hasFallenBack = false;
  stopMatchPolling();
  activeStream = new EventSource(`${API}/stream/matches/${encodeURIComponent(matchId)}`);
  activeStream.addEventListener("match_update", (event) => {
    receivedStreamEvent = true;
    const match = JSON.parse(event.data);
    patchLiveMatch(match);
  });
  activeStream.addEventListener("hello", () => {
    receivedStreamEvent = true;
    showToast("实时连接已建立");
  });
  activeStream.onerror = () => {
    if (receivedStreamEvent || hasFallenBack) {
      showToast("实时连接正在重试");
      return;
    }
    hasFallenBack = true;
    activeStream.close();
    activeStream = null;
    startMatchPolling(matchId);
    showToast("实时连接不可用，已切换为轮询刷新");
  };
}

function startMatchPolling(matchId) {
  if (ARCHIVE_MODE) return;
  stopMatchPolling();
  const poll = async () => {
    activeMatchPollTimer = null;
    const { path } = routeInfo();
    if (path !== `/matches/${matchId}`) return;
    try {
      const match = await api(`/matches/${matchId}?${toQuery({ include: "events,stats,source" })}`);
      patchLiveMatch(match);
    } catch (error) {
      console.warn("Match polling failed", error);
    }
    activeMatchPollTimer = setTimeout(poll, 15000);
  };
  poll();
}

function patchLiveMatch(match) {
  match = withComputedGoalScores(match);
  const numbers = document.getElementById("score-numbers");
  const status = document.getElementById("score-status");
  const version = document.getElementById("score-version");
  if (numbers) numbers.textContent = scoreText(match);
  if (status) {
    if (status.classList.contains("spm-match-status-meta")) {
      status.textContent = spmMatchStatusText(match);
    } else {
      status.innerHTML = `${statusBadge(match)} ${match.needsReview ? '<span class="badge review">待复核</span>' : ""}`;
    }
  }
  if (version) version.textContent = spmMatchVersionText(match);
  const timelineContent = document.getElementById("timeline-content");
  if (timelineContent && match.events) {
    timelineContent.outerHTML = renderTimeline(match);
    initTimelineScroller();
  }
}

async function renderLeaderboard(metric, params) {
  const activeMetric = normalizeLeaderboardMetric(metric);
  const config = leaderboardCategoryConfig(activeMetric);
  const filters = Object.fromEntries(params.entries());
  const data = await loadLeaderboardData(activeMetric, filters);
  const visibleItems = filterLeaderboardRows(data.items, filters.q, config);
  const exportMetric = leaderboardExportMetric(config);
  if (config.metric === "players") {
    app.innerHTML = `
      <section class="leaderboard-page player-stat-page" data-leaderboard-metric="players" data-player-stat="${escapeHtml(data.activeStat?.key || filters.stat || "yellowCards")}">
        ${renderMetricSwitch(activeMetric, filters)}
        ${filters.q ? `<a class="leaderboard-query-pill" href="${hashHref("/leaderboards/players", { ...filters, q: "" })}">搜索：${escapeHtml(filters.q)} ×</a>` : ""}
        ${renderPlayerStatHub(data, filters, config, visibleItems)}
      </section>
    `;
    leaderboardSliderState = null;
    initPlayerStatSlider(visibleItems, config, data);
    if (!data.fallback) scheduleLeaderboardRefresh(data, config.sourceMetric, filters);
    return;
  }
  app.innerHTML = `
    <section class="leaderboard-page" data-leaderboard-metric="${escapeHtml(activeMetric)}">
      ${renderMetricSwitch(activeMetric, filters)}
      ${filters.q ? `<a class="leaderboard-query-pill" href="${hashHref(`/leaderboards/${activeMetric}`, { ...filters, q: "" })}">搜索：${escapeHtml(filters.q)} ×</a>` : ""}
      ${renderLeaderboardHero(config, data)}
      ${renderTopThreePodium(visibleItems, config)}
      ${renderLeaderboardList(visibleItems, config)}
      <div class="leaderboard-actions">
        ${renderLeaderboardRealtimeBadge(data.realtime)}
        ${exportMetric ? `<button class="btn" data-export-resource="leaderboard" data-export-metric="${escapeHtml(exportMetric)}">导出</button>` : ""}
      </div>
      ${renderLeaderboardFooter(data)}
    </section>
  `;
  playerStatSliderState = null;
  if (["goals", "assists"].includes(config.metric)) initScorerPodium3D();
  if (config.sliderWindow) initLeaderboardSlider(visibleItems, config);
  else leaderboardSliderState = null;
  if (!data.fallback && config.sourceMetric && config.sourceMetric !== "teams" && config.sourceMetric !== "cards") {
    scheduleLeaderboardRefresh(data, config.sourceMetric, filters);
  }
}

function renderLeaderboardRealtimeBadge(realtime = {}) {
  const liveMatches = Number(realtime.liveMatches || 0);
  const nextSeconds = Number(realtime.nextRefreshInSeconds || realtime.refreshEverySeconds || 0);
  const label = realtime.locked
    ? `更新已停止 · ${realtime.stopAtLabel || "2026-07-20 10:00 北京时间"}`
    : liveMatches
      ? `赛中自动更新 · ${realtime.refreshEverySeconds || nextSeconds || 30}s`
      : realtime.active && nextSeconds
        ? `自动更新 · ${nextSeconds}s`
        : "榜单已同步";
  const suffix = liveMatches ? ` · ${liveMatches} 场进行中` : "";
  return `<span class="source-badge realtime-badge">${escapeHtml(label + suffix)}</span>`;
}

function renderTeamW32Csi(model) {
  if (!model) return "";
  const moduleLabels = {
    B: "基础",
    F: "近期",
    A: "进攻",
    D: "防守",
    S: "阵容",
    H: "健康",
    T: "战术",
    K: "淘汰赛",
    C: "环境",
  };
  const modules = model.modules || {};
  return `
    <section class="panel w32-csi-panel">
      <div class="panel-header">
        <div>
          <h2>W32-CSI 球队模型</h2>
          <p class="muted mini">${escapeHtml(model.generatedAt ? `${formatFullDate(model.generatedAt)} 更新` : "球队榜同步")}</p>
        </div>
        <span class="source-badge">球队榜 #${escapeHtml(model.rank || "-")}</span>
      </div>
      <div class="panel-body">
        <div class="w32-csi-summary">
          <strong>${escapeHtml(model.summary || `CSI ${model.valueLabel || model.csi || "-"}`)}</strong>
          <span>${escapeHtml(model.detail || "")}</span>
        </div>
        <div class="w32-csi-module-grid">
          ${Object.entries(moduleLabels)
            .map(([key, label]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(Number(modules[key] || 0).toFixed(2))}</strong></div>`)
            .join("")}
        </div>
        <p class="muted mini">数据质量 ${escapeHtml(model.dataQualityScore ?? "-")} · ${escapeHtml(model.warningCount ?? 0)} 项输入待补全</p>
      </div>
    </section>
  `;
}

const teamDetailTabs = [
  { key: "overview", label: "总览" },
  { key: "schedule", label: "赛程" },
  { key: "squad", label: "阵容" },
  { key: "model", label: "数据模型" },
];

function normalizeTeamDetailTab(value) {
  const aliases = {
    matches: "schedule",
    players: "squad",
    data: "model",
    csi: "model",
    strength: "model",
  };
  const normalized = aliases[String(value || "").toLowerCase()] || String(value || "").toLowerCase();
  return teamDetailTabs.some((tab) => tab.key === normalized) ? normalized : "overview";
}

function teamDetailTabHref(teamId, tabKey, params = new URLSearchParams()) {
  const nextParams = Object.fromEntries(params.entries());
  if (tabKey === "overview") delete nextParams.tab;
  else nextParams.tab = tabKey;
  return hashHref(`/teams/${teamId}`, nextParams);
}

function teamDetailMatchTimestamp(match) {
  const value = Date.parse(match?.kickoffAt || "");
  return Number.isFinite(value) ? value : 0;
}

function teamDetailMatchGroups(matches = []) {
  const liveStatuses = new Set(["live", "halftime", "extra_time", "penalties"]);
  return {
    live: matches
      .filter((match) => liveStatuses.has(match.status))
      .sort((a, b) => teamDetailMatchTimestamp(a) - teamDetailMatchTimestamp(b)),
    scheduled: matches
      .filter((match) => match.status === "scheduled")
      .sort((a, b) => teamDetailMatchTimestamp(a) - teamDetailMatchTimestamp(b)),
    completed: matches
      .filter((match) => match.status === "ft" || match.status === "finished")
      .sort((a, b) => teamDetailMatchTimestamp(b) - teamDetailMatchTimestamp(a)),
  };
}

function sameTeamIdentity(left, right) {
  if (!left || !right) return false;
  const leftKeys = [left.id, left.code, left.slug].filter(Boolean).map((value) => String(value).toLowerCase());
  const rightKeys = new Set([right.id, right.code, right.slug].filter(Boolean).map((value) => String(value).toLowerCase()));
  return leftKeys.some((value) => rightKeys.has(value));
}

function teamDetailRecord(team, completedMatches = []) {
  return completedMatches.reduce(
    (record, match) => {
      const isHome = sameTeamIdentity(team, match.homeTeam);
      const isAway = sameTeamIdentity(team, match.awayTeam);
      if (!isHome && !isAway) return record;
      const rawHomeScore = match.score?.home;
      const rawAwayScore = match.score?.away;
      if (rawHomeScore === null || rawHomeScore === undefined || rawAwayScore === null || rawAwayScore === undefined) return record;
      const homeScore = Number(rawHomeScore);
      const awayScore = Number(rawAwayScore);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return record;
      const goalsFor = isHome ? homeScore : awayScore;
      const goalsAgainst = isHome ? awayScore : homeScore;
      record.played += 1;
      record.goalsFor += goalsFor;
      record.goalsAgainst += goalsAgainst;
      if (goalsFor > goalsAgainst) record.wins += 1;
      else if (goalsFor < goalsAgainst) record.losses += 1;
      else record.draws += 1;
      return record;
    },
    { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
  );
}

function renderTeamDetailTabs(team, activeTab, params) {
  const counts = {
    schedule: (team.recentMatches || []).length,
    squad: (team.players || []).length,
    model: team.w32Csi?.rank ? `#${team.w32Csi.rank}` : "",
  };
  return `
    <div class="team-detail-tabs-shell">
      <nav class="team-detail-tabs" role="tablist" aria-label="${escapeHtml(team.name)}球队详情">
        ${teamDetailTabs
          .map((tab) => {
            const active = tab.key === activeTab;
            const count = counts[tab.key];
            const countLabel = tab.key === "schedule" ? `${count}场` : tab.key === "squad" ? `${count}人` : count;
            return `
              <a
                id="team-tab-${tab.key}"
                class="team-detail-tab ${active ? "active" : ""}"
                href="${teamDetailTabHref(team.id, tab.key, params)}"
                role="tab"
                aria-selected="${active ? "true" : "false"}"
                aria-controls="team-tab-panel"
                ${active ? 'aria-current="page"' : ""}
                tabindex="${active ? "0" : "-1"}"
                data-team-detail-tab
              >
                <span>${escapeHtml(tab.label)}</span>
                ${countLabel ? `<small aria-hidden="true">${escapeHtml(countLabel)}</small>` : ""}
              </a>
            `;
          })
          .join("")}
      </nav>
    </div>
  `;
}

function renderTeamOverviewKpis(team, groups) {
  const record = teamDetailRecord(team, groups.completed);
  const model = team.w32Csi;
  const activeCount = groups.live.length + groups.scheduled.length;
  return `
    <section class="team-overview-kpis" aria-label="球队世界杯概览">
      <article class="team-overview-kpi">
        <span>世界杯战绩</span>
        <strong>${escapeHtml(`${record.wins}胜 ${record.draws}平 ${record.losses}负`)}</strong>
        <small>${escapeHtml(`${record.played} 场已结束`)}</small>
      </article>
      <article class="team-overview-kpi">
        <span>进攻与防守</span>
        <strong>${escapeHtml(`${record.goalsFor} : ${record.goalsAgainst}`)}</strong>
        <small>进球 : 失球</small>
      </article>
      <article class="team-overview-kpi">
        <span>当前赛程</span>
        <strong>${escapeHtml(String((team.recentMatches || []).length))} 场</strong>
        <small>${activeCount ? `${escapeHtml(activeCount)} 场待进行` : "当前赛程已结束"}</small>
      </article>
      <article class="team-overview-kpi accent">
        <span>W32-CSI</span>
        <strong>${escapeHtml(model?.valueLabel || model?.csi || "-")}</strong>
        <small>${model?.rank ? `球队榜第 ${escapeHtml(model.rank)} 名` : "模型正在同步"}</small>
      </article>
    </section>
  `;
}

function renderTeamCompactMatchCard(match, team) {
  const homeCurrent = sameTeamIdentity(team, match.homeTeam);
  const awayCurrent = sameTeamIdentity(team, match.awayTeam);
  const score = match.status === "scheduled" ? "VS" : scoreText(match);
  return `
    <a class="team-compact-match" href="${matchDetailHref(match.id)}">
      <header>
        <span>${escapeHtml(playerWorldCupMatchStageLabel(match))}</span>
        ${statusBadge(match)}
      </header>
      <div class="team-compact-scoreline">
        <span class="team-compact-side ${homeCurrent ? "is-current" : ""}">
          ${teamLogo(match.homeTeam, "team-compact-flag")}
          <strong title="${escapeHtml(teamDisplayName(match.homeTeam))}">${escapeHtml(teamCompactName(match.homeTeam))}</strong>
        </span>
        <strong class="team-compact-score">${escapeHtml(score)}</strong>
        <span class="team-compact-side away ${awayCurrent ? "is-current" : ""}">
          ${teamLogo(match.awayTeam, "team-compact-flag")}
          <strong title="${escapeHtml(teamDisplayName(match.awayTeam))}">${escapeHtml(teamCompactName(match.awayTeam))}</strong>
        </span>
      </div>
      <footer>
        <time datetime="${escapeHtml(match.kickoffAt || "")}">${escapeHtml(formatDate(match.kickoffAt))}</time>
        <span>${escapeHtml(match.venue?.city || match.venue?.name || "场地待定")}</span>
      </footer>
    </a>
  `;
}

function renderTeamLeaderCard(items = [], metric = "goals", limit = 3) {
  const isAssist = metric === "assists";
  const title = isAssist ? "助攻榜" : "射手榜";
  const unit = isAssist ? "次助攻" : "球";
  const visibleItems = items.slice(0, limit);
  return `
    <section class="team-leader-card" aria-label="队内${title}">
      <header>
        <div>
          <span class="eyebrow">世界杯</span>
          <h3>${title}</h3>
        </div>
        <span class="team-leader-metric">${isAssist ? "A" : "G"}</span>
      </header>
      ${visibleItems.length ? `
        <ol class="team-leader-list">
          ${visibleItems
            .map(
              (row, index) => `
                <li>
                  <a href="${hashHref(`/players/${row.player.id}`)}">
                    <span class="team-leader-rank">${escapeHtml(row.rank || index + 1)}</span>
                    ${playerAvatar(row.player)}
                    <span class="team-leader-name">
                      <strong title="${escapeHtml(row.player.name || row.player.fullName || "")}">${escapeHtml(shortPlayerName(row.player))}</strong>
                      <small>${escapeHtml(positionLabel(row.player.position))}</small>
                    </span>
                    <strong class="team-leader-value">${escapeHtml(row.value)}<small>${unit}</small></strong>
                  </a>
                </li>
              `
            )
            .join("")}
        </ol>
      ` : `<div class="team-semantic-empty">暂无世界杯${title.replace("榜", "")}记录</div>`}
    </section>
  `;
}

function renderTeamOverviewTab(team, params) {
  const groups = teamDetailMatchGroups(team.recentMatches || []);
  const focusMatches = [];
  const nextMatch = groups.live[0] || groups.scheduled[0];
  const latestMatch = groups.completed[0];
  if (nextMatch) focusMatches.push({ label: groups.live.length ? "正在进行" : "下一场", match: nextMatch });
  if (latestMatch) focusMatches.push({ label: "上一场", match: latestMatch });
  return `
    ${renderTeamOverviewKpis(team, groups)}
    <section class="team-overview-grid">
      <article class="panel team-overview-focus">
        <div class="panel-header">
          <div>
            <h2>比赛焦点</h2>
            <p class="muted mini">下一场与最近赛果</p>
          </div>
          <a class="team-panel-link" href="${teamDetailTabHref(team.id, "schedule", params)}">全部 ${escapeHtml((team.recentMatches || []).length)} 场</a>
        </div>
        <div class="panel-body team-focus-match-list">
          ${focusMatches.length ? focusMatches.map((item) => `<div class="team-focus-match"><span>${item.label}</span>${renderTeamCompactMatchCard(item.match, team)}</div>`).join("") : '<div class="team-semantic-empty">赛程公布后将在这里显示</div>'}
        </div>
      </article>
      <article class="panel team-overview-leaders">
        <div class="panel-header">
          <div>
            <h2>队内领跑者</h2>
            <p class="muted mini">进球与助攻实时汇总</p>
          </div>
          <a class="team-panel-link" href="${teamDetailTabHref(team.id, "model", params)}">完整数据</a>
        </div>
        <div class="panel-body team-leader-pair">
          ${renderTeamLeaderCard(team.leaders?.goals || [], "goals", 3)}
          ${renderTeamLeaderCard(team.leaders?.assists || [], "assists", 3)}
        </div>
      </article>
    </section>
  `;
}

function renderTeamScheduleSection(title, note, matches, team, emptyText, tone = "") {
  return `
    <section class="panel team-schedule-section ${escapeHtml(tone)}">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted mini">${escapeHtml(note)}</p>
        </div>
        <span class="source-badge">${escapeHtml(matches.length)} 场</span>
      </div>
      <div class="panel-body">
        ${matches.length ? `<div class="team-match-grid">${matches.map((match) => renderTeamCompactMatchCard(match, team)).join("")}</div>` : `<div class="team-semantic-empty">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>
  `;
}

function renderTeamScheduleTab(team) {
  const groups = teamDetailMatchGroups(team.recentMatches || []);
  return `
    <header class="team-tab-heading">
      <div>
        <span class="eyebrow">2026 FIFA 世界杯</span>
        <h2>球队完整赛程</h2>
      </div>
      <p>按比赛状态整理，赛果与开球时间随官方数据更新。</p>
    </header>
    <div class="team-schedule-sections">
      ${groups.live.length ? renderTeamScheduleSection("正在进行", "实时比分与比赛状态", groups.live, team, "当前没有进行中的比赛", "live") : ""}
      ${renderTeamScheduleSection("接下来", "已公布的后续比赛", groups.scheduled, team, "后续赛程公布后将在这里显示", "upcoming")}
      ${renderTeamScheduleSection("已结束", "本届世界杯全部完赛记录", groups.completed, team, "暂无已结束的世界杯比赛", "completed")}
    </div>
  `;
}

function teamPlayerGroupKey(player) {
  const role = normalizeRoleCode(player.standardPosition || player.position || "");
  if (["GK", "G", "GOALKEEPER"].includes(role)) return "GK";
  if (layoutDefenderRoles.has(role) || ["DF", "DEFENDER"].includes(role)) return "DF";
  if (layoutMidfielderRoles.has(role) || ["MF", "MIDFIELDER"].includes(role)) return "MF";
  if (layoutForwardRoles.has(role) || ["FW", "FORWARD"].includes(role)) return "FW";
  return "OTHER";
}

function renderTeamSquadPlayer(player) {
  const clubName = player?.club?.name || "俱乐部暂缺";
  return `
    <a class="team-squad-player" href="${hashHref(`/players/${player.id}`)}">
      ${playerAvatar(player)}
      <span class="team-squad-player-main">
        <strong title="${escapeHtml(player.name || player.fullName || "")}">${escapeHtml(shortPlayerName(player))}</strong>
        <small>${escapeHtml(positionLabel(player.standardPosition || player.position))} · ${escapeHtml(clubName)}</small>
      </span>
      <span class="team-squad-player-value">${escapeHtml(marketValueLabel(player))}</span>
    </a>
  `;
}

function renderTeamSquadGroup(group, players) {
  return `
    <section class="panel team-squad-group ${escapeHtml(group.key.toLowerCase())}">
      <div class="panel-header">
        <div>
          <span class="eyebrow">${escapeHtml(group.code)}</span>
          <h2>${escapeHtml(group.label)}</h2>
        </div>
        <span class="source-badge">${escapeHtml(players.length)} 人</span>
      </div>
      <div class="panel-body">
        ${players.length ? `<div class="team-squad-list">${players.map(renderTeamSquadPlayer).join("")}</div>` : `<div class="team-semantic-empty">暂无${escapeHtml(group.label)}名单</div>`}
      </div>
    </section>
  `;
}

function renderTeamSquadTab(team) {
  const groupConfig = [
    { key: "GK", code: "GK", label: "门将" },
    { key: "DF", code: "DF", label: "后卫" },
    { key: "MF", code: "MF", label: "中场" },
    { key: "FW", code: "FW", label: "前锋" },
  ];
  const grouped = Object.fromEntries(groupConfig.map((group) => [group.key, []]));
  const otherPlayers = [];
  (team.players || []).forEach((player) => {
    const key = teamPlayerGroupKey(player);
    if (grouped[key]) grouped[key].push(player);
    else otherPlayers.push(player);
  });
  Object.values(grouped).forEach((players) => players.sort((a, b) => shortPlayerName(a).localeCompare(shortPlayerName(b), "zh-CN")));
  const renderedGroups = groupConfig.map((group) => ({ group, html: renderTeamSquadGroup(group, grouped[group.key]) }));
  return `
    <header class="team-tab-heading">
      <div>
        <span class="eyebrow">世界杯参赛阵容</span>
        <h2>${escapeHtml((team.players || []).length)} 人名单</h2>
      </div>
      <p>按场上位置分组，点击球员可查看个人数据与每场比赛记录。</p>
    </header>
    ${(team.players || []).length ? `
      <div class="team-squad-columns">
        <div>${renderedGroups.slice(0, 2).map((item) => item.html).join("")}</div>
        <div>${renderedGroups.slice(2).map((item) => item.html).join("")}${otherPlayers.length ? renderTeamSquadGroup({ key: "OTHER", code: "—", label: "位置待确认" }, otherPlayers) : ""}</div>
      </div>
    ` : '<div class="panel"><div class="team-semantic-empty team-semantic-empty-large">参赛名单同步后将在这里显示</div></div>'}
  `;
}

function renderTeamModelTab(team) {
  return `
    <header class="team-tab-heading">
      <div>
        <span class="eyebrow">W32-CSI</span>
        <h2>球队数据模型</h2>
      </div>
      <p>模型与队内榜单会在比赛结束、官方数据同步后自动更新。</p>
    </header>
    ${team.w32Csi ? renderTeamW32Csi(team.w32Csi) : '<div class="panel"><div class="team-semantic-empty team-semantic-empty-large">球队模型正在同步，比赛数据齐备后自动生成</div></div>'}
    <section class="team-model-leaders" aria-label="队内世界杯榜单">
      ${renderTeamLeaderCard(team.leaders?.goals || [], "goals", 5)}
      ${renderTeamLeaderCard(team.leaders?.assists || [], "assists", 5)}
    </section>
  `;
}

function renderTeamDetailTabContent(team, activeTab, params) {
  if (activeTab === "schedule") return renderTeamScheduleTab(team);
  if (activeTab === "squad") return renderTeamSquadTab(team);
  if (activeTab === "model") return renderTeamModelTab(team);
  return renderTeamOverviewTab(team, params);
}

function initTeamDetailTabs() {
  const tablist = document.querySelector(".team-detail-tabs");
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll("[data-team-detail-tab]"));
  tablist.addEventListener("keydown", (event) => {
    const currentIndex = tabs.indexOf(event.target.closest("[data-team-detail-tab]"));
    if (currentIndex < 0) return;
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      tabs.forEach((tab, index) => tab.setAttribute("tabindex", index === nextIndex ? "0" : "-1"));
      tabs[nextIndex].focus();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      event.target.closest("[data-team-detail-tab]")?.click();
    }
  });
}

async function renderTeam(teamId, params = new URLSearchParams()) {
  const activeTab = normalizeTeamDetailTab(params.get("tab"));
  const team = await api(`/teams/${teamId}`);
  const currentRoute = routeInfo();
  if (currentRoute.path !== `/teams/${teamId}` || normalizeTeamDetailTab(currentRoute.params.get("tab")) !== activeTab) return;
  app.innerHTML = `
    <div class="team-detail-page" data-team-detail-tab="${escapeHtml(activeTab)}">
      <section class="identity-hero team-identity-hero">
        <div class="identity-media">${teamLogo(team, "identity-team-logo")}</div>
        <div class="identity-copy">
          <p class="eyebrow">${escapeHtml(team.code || "国家队")} 国家队</p>
          <h1>${escapeHtml(team.name)}</h1>
          <p class="muted">${escapeHtml([team.nameEn, team.countryCode].filter(Boolean).join(" · "))}</p>
          <div class="identity-tags">
            <span>2026 世界杯</span>
            ${team.w32Csi?.rank ? `<span>球队榜 #${escapeHtml(team.w32Csi.rank)}</span>` : ""}
          </div>
        </div>
      </section>
      ${renderTeamDetailTabs(team, activeTab, params)}
      <section
        id="team-tab-panel"
        class="team-tab-panel"
        role="tabpanel"
        aria-labelledby="team-tab-${escapeHtml(activeTab)}"
        tabindex="0"
      >
        ${renderTeamDetailTabContent(team, activeTab, params)}
      </section>
    </div>
  `;
  initTeamDetailTabs();
}

function renderPlayerRows(players) {
  if (!players.length) return `<div class="empty">暂无球员</div>`;
  return players
    .map(
      (player) => `
        <a class="player-row" href="${hashHref(`/players/${player.id}`)}">
          <span class="split">${playerAvatar(player)} <span><strong title="${escapeHtml(player.name || player.fullName || "")}">${escapeHtml(shortPlayerName(player))}</strong><br><span class="muted mini">${escapeHtml(playerMeta(player))} · 身价 ${escapeHtml(marketValueLabel(player))}</span></span></span>
          <span class="source-badge">${escapeHtml(positionLabel(player.standardPosition || player.position))}</span>
        </a>
      `
    )
    .join("");
}

function playerPagePosition(player, params) {
  const matchId = params?.get?.("match");
  const matchSample = matchId ? (player.standardPositionSamples || []).find((sample) => sample.matchId === matchId) : null;
  return matchSample?.standardPosition || player.standardPosition || player.position;
}

function groupPlayerRecentEvents(events = []) {
  const groups = [];
  const byMatch = new Map();
  events.forEach((event) => {
    const key = event.matchId || `${event.matchLabel}-${event.kickoffAt}`;
    if (!byMatch.has(key)) {
      const group = {
        matchId: event.matchId,
        matchLabel: event.matchLabel,
        competitionName: event.competitionName,
        kickoffAt: event.kickoffAt,
        events: [],
      };
      byMatch.set(key, group);
      groups.push(group);
    }
    byMatch.get(key).events.push(event);
  });
  return groups;
}

function playerWorldCupMatchStageLabel(match = {}) {
  const stage = String(match.stage?.name || "").toLowerCase();
  const group = match.group?.name;
  if (match.stage?.type === "group" || stage.includes("first stage")) return group ? `${group}组 · 小组赛` : "小组赛";
  if (stage.includes("round of 32")) return "32强";
  if (stage.includes("round of 16")) return "16强";
  if (stage.includes("quarter")) return "1/4决赛";
  if (stage.includes("semi")) return "半决赛";
  if (stage.includes("third")) return "三四名决赛";
  if (stage === "final" || stage.endsWith(" final")) return "决赛";
  return match.stage?.name || "世界杯";
}

function playerWorldCupAppearanceLabel(match = {}) {
  const appearance = match.appearance || {};
  const captain = appearance.isCaptain ? " · 队长" : "";
  const enteredMinute = `${appearance.enteredMinute ?? ""}${Number(appearance.enteredExtraMinute || 0) > 0 ? `+${appearance.enteredExtraMinute}` : ""}`;
  const exitedMinute = `${appearance.exitedMinute ?? ""}${Number(appearance.exitedExtraMinute || 0) > 0 ? `+${appearance.exitedExtraMinute}` : ""}`;
  if (appearance.started) {
    if (appearance.exitedMinute !== null && appearance.exitedMinute !== undefined) {
      return `首发 · ${exitedMinute}′换下${captain}`;
    }
    return `${match.status === "ft" ? "首发 · 打满全场" : "首发出场"}${captain}`;
  }
  if (appearance.enteredMinute !== null && appearance.enteredMinute !== undefined) {
    return `替补 · ${enteredMinute}′登场${captain}`;
  }
  if (appearance.inferredFromEvent) return `替补登场${captain}`;
  return `比赛出场${captain}`;
}

function playerWorldCupMatchScore(match = {}) {
  const home = match.score?.home;
  const away = match.score?.away;
  if (home === null || home === undefined || away === null || away === undefined) return "";
  return `${home}–${away}`;
}

function playerWorldCupMatchGroups(events = [], matchRecords = []) {
  if (Array.isArray(matchRecords) && matchRecords.length) {
    return matchRecords.map((match) => ({
      ...match,
      competitionName: match.competition?.name || "2026 FIFA 世界杯",
      events: Array.isArray(match.events) ? match.events : [],
    }));
  }
  return groupPlayerRecentEvents(events);
}

function renderPlayerMatchHeatmap(match = {}, open = false) {
  const heatmap = match.heatmap;
  if (!heatmap || heatmap.status !== "available" || !Array.isArray(heatmap.points) || !heatmap.points.length) return "";
  const direction = heatmap.direction === "left" ? "left" : "right";
  const directionLabel = direction === "left" ? "向左" : "向右";
  return `
    <details class="player-match-heatmap" data-player-heatmap-match="${escapeHtml(match.matchId || "")}"${open ? " open" : ""}>
      <summary>
        <span class="player-match-heatmap-title">
          <span class="player-match-heatmap-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 17.5c2.3-4.8 4.5-7.1 7-7.1 2.1 0 3 1.6 4.8 1.6 1.2 0 2.5-.7 4.2-2.2"/><circle cx="7" cy="7" r="2"/><circle cx="17.5" cy="6.5" r="1.5"/></svg>
          </span>
          <span><strong>球员热点图</strong><small>${escapeHtml(heatmap.pointCount || heatmap.points.length)} 个位置点 · 进攻${directionLabel}</small></span>
        </span>
        <span class="player-match-heatmap-toggle" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg></span>
      </summary>
      <div class="player-match-heatmap-body">
        <canvas class="player-match-heatmap-canvas" role="img" aria-label="${escapeHtml(match.matchLabel || "本场比赛")}球员热点图，进攻${directionLabel}"></canvas>
        <footer class="player-match-heatmap-meta">
          <span class="player-match-heatmap-direction is-${direction}">
            <span class="player-match-heatmap-direction-icon" aria-hidden="true">${direction === "left" ? "←" : "→"}</span>
            <span><small>进攻方向</small><b>${directionLabel}</b></span>
          </span>
          <span class="player-match-heatmap-density" role="img" aria-label="活动密度由低到高">
            <b class="player-match-heatmap-density-title">活动密度</b>
            <span class="player-match-heatmap-density-scale-row">
              <small>低</small>
              <span class="player-match-heatmap-scale" aria-hidden="true"></span>
              <small>高</small>
            </span>
          </span>
        </footer>
      </div>
    </details>
  `;
}

function renderPlayerRecentEventGroups(events = [], matchRecords = [], options = {}) {
  const groups = playerWorldCupMatchGroups(events, matchRecords);
  if (!groups.length) return `<div class="empty">暂无世界杯出场记录</div>`;
  const selectedMatchId = String(options.selectedMatchId || "");
  const defaultOpenMatchId = selectedMatchId || String(groups.find((group) => group.heatmap?.status === "available")?.matchId || "");
  return `<div class="player-event-groups">${groups
    .map(
      (group) => `
        <article class="player-event-match${group.events.length ? "" : " has-no-events"}">
          <a class="player-event-match-header" href="${matchDetailHref(group.matchId)}">
            <span>
              <strong>${escapeHtml(group.matchLabel || "比赛详情")}</strong>
              <small>${escapeHtml(group.competitionName || "世界杯")}</small>
            </span>
            <span class="player-event-match-result">
              ${playerWorldCupMatchScore(group) ? `<strong>${escapeHtml(playerWorldCupMatchScore(group))}</strong>` : ""}
              <time>${escapeHtml(formatDate(group.kickoffAt, "date"))}</time>
            </span>
          </a>
          ${group.appearance ? `
            <div class="player-event-participation">
              <strong>${escapeHtml(playerWorldCupMatchStageLabel(group))}</strong>
              <span>${escapeHtml(playerWorldCupAppearanceLabel(group))}</span>
              ${group.matchNumber ? `<span>第 ${escapeHtml(group.matchNumber)} 场</span>` : ""}
            </div>
          ` : ""}
          <div class="player-event-list${group.events.length ? "" : " is-empty"}">
            ${
              group.events.length
                ? group.events
                    .map(
                      (event) => `
                        <span class="player-event-chip">
                          <b>${escapeHtml(event.minuteLabel || `${event.minute ?? "-"}${Number(event.extraMinute || 0) > 0 ? `+${event.extraMinute}` : ""}'`)}</b>
                          <span>${escapeHtml(eventLabels[event.eventType] || event.eventType)}</span>
                          ${event.description ? `<small>${escapeHtml(event.description)}</small>` : ""}
                        </span>
                      `
                    )
                    .join("")
                : `<div class="player-event-empty"><strong>本场暂无个人事件</strong><span>已保留该球员的实际出场记录</span></div>`
            }
          </div>
          ${renderPlayerMatchHeatmap(group, String(group.matchId || "") === defaultOpenMatchId)}
        </article>
      `
    )
    .join("")}</div>`;
}

// A fine, perceptually ordered football-heatmap scale. The denser stop spacing
// keeps isolated movement, sustained occupation and local maxima visually
// distinct instead of pushing most non-zero cells into the same yellow/red band.
const PLAYER_HEATMAP_PALETTE_STOPS = [
  [0, [7, 105, 94, 0]],
  [0.055, [8, 151, 126, 0.045]],
  [0.12, [17, 187, 124, 0.17]],
  [0.2, [39, 210, 111, 0.32]],
  [0.3, [91, 226, 94, 0.48]],
  [0.4, [157, 232, 81, 0.62]],
  [0.5, [215, 226, 70, 0.72]],
  [0.61, [248, 199, 62, 0.82]],
  [0.72, [255, 158, 53, 0.89]],
  [0.82, [252, 110, 65, 0.94]],
  [0.91, [240, 72, 89, 0.975]],
  [1, [218, 46, 119, 1]],
];

function interpolatePlayerHeatmapPalette(value) {
  const normalizedValue = Math.max(0, Math.min(1, Number(value) || 0));
  if (normalizedValue <= PLAYER_HEATMAP_PALETTE_STOPS[0][0]) return [...PLAYER_HEATMAP_PALETTE_STOPS[0][1]];
  for (let index = 1; index < PLAYER_HEATMAP_PALETTE_STOPS.length; index += 1) {
    if (normalizedValue > PLAYER_HEATMAP_PALETTE_STOPS[index][0]) continue;
    const [leftValue, leftColor] = PLAYER_HEATMAP_PALETTE_STOPS[index - 1];
    const [rightValue, rightColor] = PLAYER_HEATMAP_PALETTE_STOPS[index];
    const ratio = (normalizedValue - leftValue) / Math.max(0.0001, rightValue - leftValue);
    return leftColor.map((channel, channelIndex) => {
      const rightChannel = rightColor[channelIndex];
      if (channelIndex === 3) return channel + (rightChannel - channel) * ratio;
      // Interpolate colour in linear light so neighbouring density levels do
      // not develop the muddy bands produced by direct sRGB interpolation.
      const leftLinear = (channel / 255) ** 2.2;
      const rightLinear = (rightChannel / 255) ** 2.2;
      return 255 * (leftLinear + (rightLinear - leftLinear) * ratio) ** (1 / 2.2);
    });
  }
  return [...PLAYER_HEATMAP_PALETTE_STOPS[PLAYER_HEATMAP_PALETTE_STOPS.length - 1][1]];
}

const PLAYER_HEATMAP_PALETTE_LUT = Array.from({ length: 512 }, (_, index) =>
  interpolatePlayerHeatmapPalette(index / 511)
);

function playerHeatmapPalette(value, densityLevels = PLAYER_HEATMAP_PALETTE_LUT.length) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const levels = Math.max(2, Math.round(Number(densityLevels) || PLAYER_HEATMAP_PALETTE_LUT.length));
  const quantized = Math.round(normalized * (levels - 1)) / (levels - 1);
  const index = Math.round(quantized * (PLAYER_HEATMAP_PALETTE_LUT.length - 1));
  return PLAYER_HEATMAP_PALETTE_LUT[index];
}

function playerHeatmapRenderProfile(heatmap) {
  const isTournamentAverage = heatmap?.aggregation === "all_available_world_cup_match_points";
  const columns = isTournamentAverage ? 288 : 256;
  const pointCount = Array.isArray(heatmap?.points) ? heatmap.points.length : Math.max(0, Number(heatmap?.pointCount) || 0);
  const sparseMatchFactor = Math.max(0, Math.min(1, (95 - pointCount) / 70));
  const matchSigma = 4.1 + sparseMatchFactor * 1.4;
  return {
    name: isTournamentAverage ? "tournament-detail" : "match-detail",
    columns,
    rows: Math.round(columns / 1.58),
    // Tournament averages retain the narrow detail kernel. Sparse single-match
    // records use a wider, point-count-aware kernel so nearby observations read
    // as an occupied zone without moving or synthesising source coordinates.
    sigma: isTournamentAverage ? 2.2 : matchSigma,
    cutoff: isTournamentAverage ? 0.032 : 0.024,
    gamma: isTournamentAverage ? 0.94 : 0.92,
    maximumQuantile: isTournamentAverage ? 0.999 : 0.9975,
    pointAlpha: isTournamentAverage ? 0.13 : 0.09,
    pointCount,
    densityLevels: PLAYER_HEATMAP_PALETTE_LUT.length,
    kernelMode: isTournamentAverage ? "tournament-detail" : "adaptive-single-match",
  };
}

function drawPlayerHeatmapPitch(context, width, height) {
  const field = { x: 8, y: 8, width: width - 16, height: height - 16 };
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#063b36");
  background.addColorStop(0.5, "#075247");
  background.addColorStop(1, "#073a3b");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  const stripeWidth = field.width / 8;
  for (let stripe = 0; stripe < 8; stripe += 1) {
    context.fillStyle = stripe % 2 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.035)";
    context.fillRect(field.x + stripe * stripeWidth, field.y, stripeWidth, field.height);
  }
  context.save();
  context.strokeStyle = "rgba(221, 255, 243, 0.52)";
  context.lineWidth = Math.max(1, width / 520);
  context.lineJoin = "round";
  context.strokeRect(field.x, field.y, field.width, field.height);
  context.beginPath();
  context.moveTo(field.x + field.width / 2, field.y);
  context.lineTo(field.x + field.width / 2, field.y + field.height);
  context.stroke();
  context.beginPath();
  context.arc(field.x + field.width / 2, field.y + field.height / 2, field.height * 0.13, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "rgba(221, 255, 243, 0.65)";
  context.beginPath();
  context.arc(field.x + field.width / 2, field.y + field.height / 2, 1.6, 0, Math.PI * 2);
  context.fill();
  const penaltyWidth = field.width * 0.17;
  const penaltyHeight = field.height * 0.58;
  const goalAreaWidth = field.width * 0.07;
  const goalAreaHeight = field.height * 0.29;
  context.strokeRect(field.x, field.y + (field.height - penaltyHeight) / 2, penaltyWidth, penaltyHeight);
  context.strokeRect(field.x + field.width - penaltyWidth, field.y + (field.height - penaltyHeight) / 2, penaltyWidth, penaltyHeight);
  context.strokeRect(field.x, field.y + (field.height - goalAreaHeight) / 2, goalAreaWidth, goalAreaHeight);
  context.strokeRect(field.x + field.width - goalAreaWidth, field.y + (field.height - goalAreaHeight) / 2, goalAreaWidth, goalAreaHeight);
  context.beginPath();
  context.arc(field.x + field.width * 0.11, field.y + field.height / 2, 1.5, 0, Math.PI * 2);
  context.arc(field.x + field.width * 0.89, field.y + field.height / 2, 1.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
  return field;
}

function drawPlayerHeatmapCanvas(canvas, heatmap) {
  if (!canvas || !heatmap || !Array.isArray(heatmap.points) || !heatmap.points.length) return;
  const measuredWidth = Math.round(canvas.getBoundingClientRect().width || canvas.parentElement?.getBoundingClientRect().width || 0);
  if (measuredWidth < 120) return;
  const cssWidth = measuredWidth;
  const cssHeight = Math.round(cssWidth / 1.58);
  const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * deviceScale);
  canvas.height = Math.round(cssHeight * deviceScale);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const field = drawPlayerHeatmapPitch(context, cssWidth, cssHeight);

  const profile = playerHeatmapRenderProfile(heatmap);
  const { columns, rows, sigma } = profile;
  const density = new Float32Array(columns * rows);
  const radius = Math.ceil(sigma * 3.2);
  const validPoints = [];
  heatmap.points.forEach((point) => {
    const pointX = Number(point?.[0]);
    const pointY = Number(point?.[1]);
    if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return;
    const normalizedX = Math.max(0, Math.min(100, pointX));
    const normalizedY = Math.max(0, Math.min(100, pointY));
    validPoints.push([normalizedX, normalizedY]);
    const gridX = (normalizedX / 100) * (columns - 1);
    const gridY = (normalizedY / 100) * (rows - 1);
    const startX = Math.max(0, Math.floor(gridX - radius));
    const endX = Math.min(columns - 1, Math.ceil(gridX + radius));
    const startY = Math.max(0, Math.floor(gridY - radius));
    const endY = Math.min(rows - 1, Math.ceil(gridY + radius));
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const distanceSquared = (x - gridX) ** 2 + (y - gridY) ** 2;
        density[y * columns + x] += Math.exp(-distanceSquared / (2 * sigma * sigma));
      }
    }
  });
  const sortedDensity = Array.from(density).filter((value) => value > 0).sort((left, right) => left - right);
  const robustMaximum = sortedDensity[Math.max(0, Math.floor(sortedDensity.length * profile.maximumQuantile) - 1)] || 1;
  const layer = document.createElement("canvas");
  layer.width = columns;
  layer.height = rows;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  const pixels = layerContext.createImageData(columns, rows);
  density.forEach((rawValue, index) => {
    const normalized = Math.max(0, Math.min(1, rawValue / robustMaximum));
    const thresholded = normalized <= profile.cutoff ? 0 : (normalized - profile.cutoff) / (1 - profile.cutoff);
    const detailedDensity = Math.pow(Math.max(0, Math.min(1, thresholded)), profile.gamma);
    const [red, green, blue, alpha] = playerHeatmapPalette(detailedDensity, profile.densityLevels);
    pixels.data[index * 4] = Math.round(red);
    pixels.data[index * 4 + 1] = Math.round(green);
    pixels.data[index * 4 + 2] = Math.round(blue);
    pixels.data[index * 4 + 3] = Math.round(alpha * 255);
  });
  layerContext.putImageData(pixels, 0, 0);
  context.save();
  context.globalCompositeOperation = "screen";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(layer, field.x, field.y, field.width, field.height);
  context.restore();
  context.save();
  context.beginPath();
  context.rect(field.x, field.y, field.width, field.height);
  context.clip();
  context.fillStyle = `rgba(210, 255, 237, ${profile.pointAlpha})`;
  validPoints.forEach(([pointX, pointY]) => {
    const canvasX = field.x + (pointX / 100) * field.width;
    const canvasY = field.y + (pointY / 100) * field.height;
    context.beginPath();
    context.arc(canvasX, canvasY, profile.name === "tournament-detail" ? 0.75 : 0.65, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
  canvas.dataset.renderWidth = String(cssWidth);
  canvas.dataset.renderProfile = profile.name;
  canvas.dataset.paletteStops = String(PLAYER_HEATMAP_PALETTE_STOPS.length);
  canvas.dataset.densityLevels = String(profile.densityLevels);
  canvas.dataset.maximumQuantile = String(profile.maximumQuantile);
  canvas.dataset.kernelSigma = profile.sigma.toFixed(3);
  canvas.dataset.kernelMode = profile.kernelMode;
}

let activePlayerHeatmapResizeHandler = null;

function initPlayerHeatmaps(matchRecords = [], averageHeatmap = null) {
  const recordByMatch = new Map((matchRecords || []).map((match) => [String(match.matchId || ""), match]));
  const detailsElements = Array.from(app.querySelectorAll(".player-match-heatmap[data-player-heatmap-match]"));
  const averageCanvas = app.querySelector(".player-average-heatmap-canvas");
  const renderDetails = (details, force = false) => {
    if (!details.open) return;
    const match = recordByMatch.get(String(details.dataset.playerHeatmapMatch || ""));
    const canvas = details.querySelector(".player-match-heatmap-canvas");
    if (!match?.heatmap || !canvas) return;
    const width = Math.round(canvas.getBoundingClientRect().width || 0);
    if (!force && width > 0 && canvas.dataset.renderWidth === String(width)) return;
    window.requestAnimationFrame(() => drawPlayerHeatmapCanvas(canvas, match.heatmap));
  };
  detailsElements.forEach((details) => {
    details.addEventListener("toggle", () => renderDetails(details, true));
    renderDetails(details, true);
  });
  const renderAverage = (force = false) => {
    if (!averageCanvas || !averageHeatmap?.points?.length) return;
    const width = Math.round(averageCanvas.getBoundingClientRect().width || 0);
    if (!force && width > 0 && averageCanvas.dataset.renderWidth === String(width)) return;
    window.requestAnimationFrame(() => drawPlayerHeatmapCanvas(averageCanvas, averageHeatmap));
  };
  renderAverage(true);
  if (activePlayerHeatmapResizeHandler) window.removeEventListener("resize", activePlayerHeatmapResizeHandler);
  let resizeFrame = 0;
  activePlayerHeatmapResizeHandler = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      detailsElements.forEach((details) => renderDetails(details, true));
      renderAverage(true);
    });
  };
  window.addEventListener("resize", activePlayerHeatmapResizeHandler, { passive: true });
}

const PLAYER_ABILITY_RADAR_ORDER = ["速度", "射门", "传球", "盘带", "防守", "力量"];

function playerDongqiudiAvailable(data) {
  return Boolean(data && data.status === "available" && data.ability && data.profile);
}

function playerAbilityLevel(value) {
  const score = Number(value);
  if (score >= 90) return "elite";
  if (score >= 80) return "strong";
  if (score >= 70) return "solid";
  if (score >= 50) return "developing";
  return "low";
}

function playerAbilityPositionLabel(code) {
  const labels = {
    ST: "中锋",
    LW: "左边锋",
    LM: "左中场",
    RW: "右边锋",
    RM: "右中场",
    CAM: "前腰",
    CF: "影锋",
  };
  return labels[String(code || "").toUpperCase()] || code;
}

function renderPlayerAbilityStars(item = {}) {
  const value = Math.max(0, Math.min(5, Math.round(Number(item.value) || 0)));
  return `
    <div class="player-ability-star-row" aria-label="${escapeHtml(item.name)} ${value} 星">
      <span>${escapeHtml(item.name)}</span>
      <b aria-hidden="true">${"★".repeat(value)}${"☆".repeat(5 - value)}</b>
    </div>
  `;
}

function renderPlayerAbilityCategory(group = {}, index = 0) {
  return `
    <section class="player-ability-category" aria-labelledby="player-ability-category-${index}">
      <header>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h4 id="player-ability-category-${index}">${escapeHtml(group.name)}</h4>
        <small>${group.metrics?.length || 0} 项</small>
      </header>
      <dl>
        ${(group.metrics || [])
          .map(
            (metric) => `
              <div class="player-ability-metric is-${playerAbilityLevel(metric.value)}">
                <dt>${escapeHtml(metric.name)}</dt>
                <dd>
                  <span class="player-ability-meter" aria-hidden="true"><i style="--ability-value:${Math.max(0, Math.min(100, Number(metric.value) || 0))}%"></i></span>
                  <strong>${escapeHtml(metric.value ?? "—")}</strong>
                </dd>
              </div>
            `
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderPlayerAbilityPanel(data = {}) {
  const ability = data.ability || {};
  const positionLabels = (ability.registeredPositions || []).map(playerAbilityPositionLabel).filter(Boolean);
  return `
    <div id="player-dqd-panel-ability" class="player-dqd-tab-panel player-ability-panel" data-player-dqd-panel="ability" role="tabpanel" aria-labelledby="player-dqd-tab-ability">
      <div class="player-ability-overview">
        <div class="player-ability-score">
          <span>综合能力</span>
          <strong>${escapeHtml(ability.overall ?? "—")}</strong>
          <small>${escapeHtml(ability.version || "能力档案")}</small>
        </div>
        <figure class="player-ability-radar">
          <canvas class="player-ability-radar-canvas" role="img" aria-label="球员六维能力雷达图"></canvas>
          <figcaption>速度、射门、传球、盘带、防守与力量</figcaption>
        </figure>
        <div class="player-ability-essentials">
          <div>
            <span>惯用脚</span>
            <strong>${escapeHtml(ability.preferredFoot || "—")}</strong>
          </div>
          <div>
            <span>注册位置</span>
            <strong>${escapeHtml(positionLabels.join(" · ") || "—")}</strong>
          </div>
          ${(ability.stars || []).map(renderPlayerAbilityStars).join("")}
        </div>
      </div>
      <div class="player-ability-radar-values">
        ${PLAYER_ABILITY_RADAR_ORDER.map((name) => (ability.radar || []).find((item) => item.name === name))
          .filter(Boolean)
          .map(
            (metric) => `
              <div class="is-${playerAbilityLevel(metric.value)}">
                <span>${escapeHtml(metric.name)}</span>
                <strong>${escapeHtml(metric.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="player-ability-category-grid">
        ${(ability.categories || []).map(renderPlayerAbilityCategory).join("")}
      </div>
    </div>
  `;
}

function formatPlayerArchiveMarketValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}亿欧`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000)}万欧`;
  return `${new Intl.NumberFormat("zh-CN").format(amount)}欧`;
}

function renderPlayerProfileFacts(identity = {}) {
  const facts = [
    ["全名", identity.fullName],
    ["国籍 / 会籍", identity.nationality],
    ["出生日期", identity.dateOfBirth],
    ["年龄", identity.age],
    ["身高", identity.heightCm ? `${identity.heightCm} cm` : ""],
    ["体重", identity.weightKg ? `${identity.weightKg} kg` : ""],
    ["惯用脚", identity.preferredFoot],
    ["位置 / 号码", [identity.position, identity.shirtNumber ? `${identity.shirtNumber}号` : ""].filter(Boolean).join(" · ")],
    ["俱乐部", identity.club],
    ["合同到期", identity.contractUntil],
    ["年薪", identity.annualSalary],
    ["身价", identity.marketValue],
  ].filter(([, value]) => value);
  return `
    <dl class="player-profile-facts">
      ${facts
        .map(
          ([label, value]) => `
            <div>
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

function renderPlayerCharacteristicTags(items = [], className = "") {
  return items.map((item) => `<span class="${escapeHtml(className)}">${escapeHtml(item)}</span>`).join("");
}

function renderPlayerProfileArchives(profile = {}) {
  return `
    <div class="player-profile-archives">
      <details class="player-profile-archive">
        <summary><span>转会记录</span><b>${profile.transfers?.length || 0} 条</b></summary>
        <div class="player-profile-transfer-list">
          ${(profile.transfers || [])
            .map(
              (row) => `
                <div>
                  <time>${escapeHtml(row.date)}</time>
                  <strong>${escapeHtml(row.from || "青训")} <span aria-hidden="true">→</span> ${escapeHtml(row.to || "待定")}</strong>
                  <span>${escapeHtml(row.type)} · ${escapeHtml(row.fee)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </details>
      <details class="player-profile-archive">
        <summary><span>荣誉档案</span><b>${profile.honors?.length || 0} 项</b></summary>
        <div class="player-profile-honor-list">
          ${(profile.honors || [])
            .map(
              (row) => `
                <div>
                  <strong>${escapeHtml(row.name)}</strong>
                  <span>${escapeHtml(row.times ?? row.records?.length ?? 0)} 次</span>
                  <small>${escapeHtml((row.records || []).map((record) => [record.season, record.team || record.competition].filter(Boolean).join(" · ")).filter(Boolean).join(" / ") || "赛季记录待补")}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </details>
      <details class="player-profile-archive">
        <summary><span>伤病记录</span><b>${profile.injuries?.length || 0} 条</b></summary>
        <div class="player-profile-injury-list">
          ${(profile.injuries || [])
            .map(
              (row) => `
                <div>
                  <time>${escapeHtml([row.from, row.until].filter(Boolean).join(" - "))}</time>
                  <strong>${escapeHtml(row.injury)}</strong>
                  <span>${escapeHtml([
                    row.days ? `${row.days} 天` : "",
                    row.gamesMissed !== null && row.gamesMissed !== undefined ? `缺席 ${row.gamesMissed} 场` : "",
                    (row.teams || []).join(" / "),
                  ].filter(Boolean).join(" · "))}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </details>
    </div>
  `;
}

function renderPlayerProfilePanel(data = {}) {
  const profile = data.profile || {};
  const identity = profile.identity || {};
  const history = profile.marketValueHistory || [];
  const first = history[0];
  const current = history[history.length - 1];
  const peak = history.reduce((best, row) => (!best || Number(row.valueEuro) > Number(best.valueEuro) ? row : best), null);
  const character = profile.characteristics || {};
  return `
    <div id="player-dqd-panel-profile" class="player-dqd-tab-panel player-profile-panel" data-player-dqd-panel="profile" role="tabpanel" aria-labelledby="player-dqd-tab-profile" hidden>
      ${renderPlayerProfileFacts(identity)}
      <section class="player-market-history" aria-labelledby="player-market-history-title">
        <header>
          <div>
            <span class="eyebrow">Market value history</span>
            <h3 id="player-market-history-title">身价变化</h3>
          </div>
          <span class="source-badge">${history.length} 个公开节点</span>
        </header>
        <dl>
          <div><dt>起始</dt><dd>${escapeHtml(formatPlayerArchiveMarketValue(first?.valueEuro))}</dd></div>
          <div><dt>峰值</dt><dd>${escapeHtml(formatPlayerArchiveMarketValue(peak?.valueEuro))}</dd></div>
          <div><dt>当前</dt><dd>${escapeHtml(formatPlayerArchiveMarketValue(current?.valueEuro))}</dd></div>
        </dl>
        <canvas class="player-market-history-canvas" role="img" aria-label="球员历年身价变化折线图"></canvas>
      </section>
      <section class="player-characteristics" aria-labelledby="player-characteristics-title">
        <header>
          <span class="eyebrow">Playing profile</span>
          <h3 id="player-characteristics-title">技术特点</h3>
        </header>
        <div class="player-characteristic-styles">
          ${renderPlayerCharacteristicTags(character.styles)}
        </div>
        <div class="player-characteristic-levels">
          <div><strong>超强</strong>${renderPlayerCharacteristicTags(character.veryStrong, "very-strong")}</div>
          <div><strong>强项</strong>${renderPlayerCharacteristicTags(character.strong, "strong")}</div>
          <div><strong>弱项</strong>${renderPlayerCharacteristicTags(character.weak, "weak")}</div>
          <div><strong>超弱</strong>${renderPlayerCharacteristicTags(character.veryWeak, "very-weak")}</div>
        </div>
      </section>
      ${renderPlayerProfileArchives(profile)}
    </div>
  `;
}

function renderPlayerDongqiudiProfile(data) {
  if (!playerDongqiudiAvailable(data)) return "";
  const source = data.sources || {};
  return `
    <section class="panel player-dqd-panel" aria-labelledby="player-dqd-title">
      <div class="panel-header player-dqd-header">
        <div>
          <p class="eyebrow">Player scouting file</p>
          <h2 id="player-dqd-title">能力与资料</h2>
          <p>公开数据快照 · 页面不实时调用第三方接口</p>
        </div>
        <span class="source-badge player-dqd-source">${escapeHtml(source.provider || "懂球帝 App 公开数据层")}</span>
      </div>
      <nav class="player-dqd-tabs" role="tablist" aria-label="球员能力与资料">
        <button id="player-dqd-tab-ability" type="button" role="tab" aria-selected="true" aria-controls="player-dqd-panel-ability" data-player-dqd-tab="ability">能力值</button>
        <button id="player-dqd-tab-profile" type="button" role="tab" aria-selected="false" aria-controls="player-dqd-panel-profile" data-player-dqd-tab="profile">资料</button>
      </nav>
      <div class="player-dqd-body">
        ${renderPlayerAbilityPanel(data)}
        ${renderPlayerProfilePanel(data)}
      </div>
      <footer class="player-dqd-footer">
        <div>
          <strong>数据口径</strong>
          <span>${escapeHtml(source.note || "懂球帝公开球员资料与能力快照。")}</span>
        </div>
        <div>
          <time>${escapeHtml(playerWorldCupCheckedAt(data.checkedAt))}</time>
          ${source.playerPage ? `<a class="btn" href="${escapeHtml(source.playerPage)}" target="_blank" rel="noreferrer">查看来源</a>` : ""}
        </div>
      </footer>
    </section>
  `;
}

function playerRadarOrderedValues(ability = {}) {
  return PLAYER_ABILITY_RADAR_ORDER.map((name) => (ability.radar || []).find((item) => item.name === name))
    .filter(Boolean)
    .map((item) => ({ name: item.name, value: Math.max(0, Math.min(100, Number(item.value) || 0)) }));
}

function drawPlayerAbilityRadar(canvas, ability = {}) {
  const values = playerRadarOrderedValues(ability);
  if (!canvas || values.length < 3) return;
  const cssWidth = Math.round(canvas.getBoundingClientRect().width || 0);
  if (cssWidth < 160) return;
  const cssHeight = Math.max(270, Math.min(360, Math.round(cssWidth * 0.72)));
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const centerX = cssWidth / 2;
  const centerY = cssHeight / 2 + 4;
  const radius = Math.min(cssWidth * 0.31, cssHeight * 0.34);
  const angleAt = (index) => -Math.PI / 2 + (Math.PI * 2 * index) / values.length;
  const pointAt = (index, ratio) => ({
    x: centerX + Math.cos(angleAt(index)) * radius * ratio,
    y: centerY + Math.sin(angleAt(index)) * radius * ratio,
  });
  context.lineWidth = 1;
  for (let ring = 1; ring <= 5; ring += 1) {
    context.beginPath();
    values.forEach((_, index) => {
      const point = pointAt(index, ring / 5);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.strokeStyle = ring === 5 ? "rgba(35, 95, 206, 0.28)" : "rgba(99, 116, 139, 0.18)";
    context.stroke();
  }
  values.forEach((_, index) => {
    const point = pointAt(index, 1);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(point.x, point.y);
    context.strokeStyle = "rgba(99, 116, 139, 0.18)";
    context.stroke();
  });
  const fill = context.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius);
  fill.addColorStop(0, "rgba(27, 184, 202, 0.48)");
  fill.addColorStop(1, "rgba(36, 95, 206, 0.28)");
  context.beginPath();
  values.forEach((item, index) => {
    const point = pointAt(index, item.value / 100);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = "#168fb4";
  context.lineWidth = 2;
  context.stroke();
  values.forEach((item, index) => {
    const point = pointAt(index, item.value / 100);
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = "#168fb4";
    context.lineWidth = 2;
    context.stroke();
    const label = pointAt(index, 1.22);
    const cosine = Math.cos(angleAt(index));
    context.textAlign = Math.abs(cosine) < 0.25 ? "center" : cosine > 0 ? "left" : "right";
    context.textBaseline = "middle";
    context.fillStyle = "#5f6f84";
    context.font = "700 12px system-ui, sans-serif";
    context.fillText(item.name, label.x, label.y - 8);
    context.fillStyle = "#12243d";
    context.font = "900 15px system-ui, sans-serif";
    context.fillText(String(item.value), label.x, label.y + 9);
  });
  canvas.dataset.renderWidth = String(cssWidth);
}

function drawPlayerMarketHistory(canvas, history = []) {
  const points = (history || []).filter((row) => row.date && Number.isFinite(Number(row.valueEuro)));
  if (!canvas || points.length < 2) return;
  const cssWidth = Math.round(canvas.getBoundingClientRect().width || 0);
  if (cssWidth < 220) return;
  const cssHeight = Math.max(230, Math.min(320, Math.round(cssWidth * 0.42)));
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const frame = { left: 54, right: 16, top: 18, bottom: 38 };
  const width = cssWidth - frame.left - frame.right;
  const height = cssHeight - frame.top - frame.bottom;
  const maximum = Math.max(...points.map((row) => Number(row.valueEuro)), 1);
  const dateValues = points.map((row) => new Date(`${row.date}T00:00:00Z`).getTime());
  const minimumDate = Math.min(...dateValues);
  const maximumDate = Math.max(...dateValues);
  const pointAt = (row, index) => ({
    x: frame.left + ((dateValues[index] - minimumDate) / Math.max(1, maximumDate - minimumDate)) * width,
    y: frame.top + height - (Number(row.valueEuro) / maximum) * height,
  });
  context.font = "700 10px system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = frame.top + height - ratio * height;
    context.beginPath();
    context.moveTo(frame.left, y);
    context.lineTo(frame.left + width, y);
    context.strokeStyle = "rgba(99, 116, 139, 0.16)";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#7a8798";
    context.fillText(formatPlayerArchiveMarketValue(maximum * ratio), frame.left - 8, y);
  }
  const years = [...new Set(points.map((row) => row.date.slice(0, 4)))];
  const yearStep = cssWidth < 520 ? 2 : 1;
  context.textAlign = "center";
  context.textBaseline = "top";
  years.forEach((year, index) => {
    if (index % yearStep && index !== years.length - 1) return;
    const timestamp = new Date(`${year}-07-01T00:00:00Z`).getTime();
    const x = frame.left + ((timestamp - minimumDate) / Math.max(1, maximumDate - minimumDate)) * width;
    context.fillStyle = "#7a8798";
    context.fillText(year, Math.max(frame.left, Math.min(frame.left + width, x)), frame.top + height + 12);
  });
  const area = context.createLinearGradient(0, frame.top, 0, frame.top + height);
  area.addColorStop(0, "rgba(239, 114, 42, 0.22)");
  area.addColorStop(1, "rgba(239, 114, 42, 0.01)");
  context.beginPath();
  points.forEach((row, index) => {
    const point = pointAt(row, index);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  const lastPoint = pointAt(points[points.length - 1], points.length - 1);
  const firstPoint = pointAt(points[0], 0);
  context.lineTo(lastPoint.x, frame.top + height);
  context.lineTo(firstPoint.x, frame.top + height);
  context.closePath();
  context.fillStyle = area;
  context.fill();
  context.beginPath();
  points.forEach((row, index) => {
    const point = pointAt(row, index);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = "#ef722a";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  points.forEach((row, index) => {
    const point = pointAt(row, index);
    context.beginPath();
    context.arc(point.x, point.y, index === points.length - 1 ? 4.5 : 2.3, 0, Math.PI * 2);
    context.fillStyle = index === points.length - 1 ? "#d94c20" : "#ffffff";
    context.fill();
    context.strokeStyle = "#ef722a";
    context.lineWidth = 1.5;
    context.stroke();
  });
  canvas.dataset.renderWidth = String(cssWidth);
}

let activePlayerDongqiudiResizeHandler = null;

function initPlayerDongqiudiProfile(data) {
  if (!playerDongqiudiAvailable(data)) return;
  const tabs = Array.from(app.querySelectorAll("[data-player-dqd-tab]"));
  const panels = Array.from(app.querySelectorAll("[data-player-dqd-panel]"));
  const radarCanvas = app.querySelector(".player-ability-radar-canvas");
  const marketCanvas = app.querySelector(".player-market-history-canvas");
  const renderVisuals = (force = false) => {
    if (radarCanvas && !radarCanvas.closest("[hidden]")) {
      const width = Math.round(radarCanvas.getBoundingClientRect().width || 0);
      if (force || radarCanvas.dataset.renderWidth !== String(width)) drawPlayerAbilityRadar(radarCanvas, data.ability);
    }
    if (marketCanvas && !marketCanvas.closest("[hidden]")) {
      const width = Math.round(marketCanvas.getBoundingClientRect().width || 0);
      if (force || marketCanvas.dataset.renderWidth !== String(width)) drawPlayerMarketHistory(marketCanvas, data.profile?.marketValueHistory);
    }
  };
  const activate = (name) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.playerDqdTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.playerDqdPanel !== name;
    });
    window.requestAnimationFrame(() => renderVisuals(true));
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.playerDqdTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      activate(next.dataset.playerDqdTab);
    });
  });
  renderVisuals(true);
  if (activePlayerDongqiudiResizeHandler) window.removeEventListener("resize", activePlayerDongqiudiResizeHandler);
  let resizeFrame = 0;
  activePlayerDongqiudiResizeHandler = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => renderVisuals(true));
  };
  window.addEventListener("resize", activePlayerDongqiudiResizeHandler, { passive: true });
}

const playerWorldCupStatSections = [
  {
    key: "attack",
    label: "进攻",
    metrics: [
      { key: "goals", label: "进球", format: "integer" },
      { key: "expectedGoals", label: "预期进球", format: "decimal2" },
      { key: "averageGoals", label: "场均进球", format: "decimal2" },
      { key: "minutesPerGoal", label: "每球耗时", format: "minutes" },
      { key: "bigChancesMissed", label: "错失绝佳机会", format: "integer" },
      { key: "shots", label: "射门", format: "integer" },
      { key: "shotsOnTargetRate", label: "射正率", format: "percent" },
      { key: "penaltiesWon", label: "造点球", format: "integer" },
      { key: "averageDribblesWon", label: "场均成功过人", format: "decimal2" },
      { key: "dribbleSuccessRate", label: "过人成功率", format: "percent" },
      { key: "fouled", label: "被犯规", format: "integer" },
      { key: "offsides", label: "越位", format: "integer" },
    ],
  },
  {
    key: "passing",
    label: "传球",
    metrics: [
      { key: "assists", label: "助攻", format: "integer" },
      { key: "expectedAssists", label: "预期助攻", format: "decimal2" },
      { key: "bigChancesCreated", label: "创造进球机会", format: "integer" },
      { key: "keyPasses", label: "关键传球", format: "integer" },
      { key: "averagePasses", label: "场均传球", format: "decimal1" },
      { key: "passSuccessRate", label: "传球成功率", format: "percent" },
      { key: "averageLongBalls", label: "场均长传", format: "decimal2" },
      { key: "longBallSuccessRate", label: "长传成功率", format: "percent" },
      { key: "averageCrosses", label: "场均传中", format: "decimal2" },
      { key: "crossSuccessRate", label: "传中成功率", format: "percent" },
      { key: "averageTouches", label: "场均触球", format: "decimal1" },
      { key: "averageDispossessed", label: "场均丢失球权", format: "decimal1" },
    ],
  },
  {
    key: "defense",
    label: "防守",
    metrics: [
      { key: "averageTackles", label: "场均抢断", format: "decimal2" },
      { key: "averageInterceptions", label: "场均拦截", format: "decimal2" },
      { key: "averageClearances", label: "场均解围", format: "decimal2" },
      { key: "averageAerialDuels", label: "场均争顶", format: "decimal2" },
      { key: "aerialDuelSuccessRate", label: "争顶成功率", format: "percent" },
      { key: "blockedShots", label: "封堵射门", format: "integer" },
      { key: "errorsLeadingToGoal", label: "失误导致丢球", format: "integer" },
      { key: "averageDribbledPast", label: "场均被过", format: "decimal2" },
    ],
  },
  {
    key: "discipline",
    label: "纪律",
    metrics: [
      { key: "minutesPlayed", label: "出场时间", format: "minutes" },
      { key: "fouls", label: "犯规", format: "integer" },
      { key: "yellowCards", label: "黄牌", format: "integer" },
      { key: "redCards", label: "红牌", format: "integer" },
    ],
  },
];

function playerWorldCupStatNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPlayerWorldCupStat(value, format) {
  const number = playerWorldCupStatNumber(value);
  if (number === null) return "—";
  if (format === "decimal2") return number.toFixed(2);
  if (format === "decimal1") return number.toFixed(1);
  if (format === "percent") return `${number.toFixed(1)}%`;
  if (format === "minutes") return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(number)}′`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(number);
}

function playerWorldCupScopeValue(value, keys = []) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value).trim();
  for (const key of keys) {
    if (value[key] !== null && value[key] !== undefined && String(value[key]).trim()) return String(value[key]).trim();
  }
  return "";
}

function playerWorldCupScope(stats = {}) {
  const season = playerWorldCupScopeValue(stats.season, ["name", "label", "year"]);
  const competition = playerWorldCupScopeValue(stats.competition, ["name", "label"]);
  if (season && competition && !competition.includes(season)) return `${season} ${competition}`;
  return competition || season || "2026 世界杯";
}

function playerWorldCupCheckedAt(value) {
  if (!value) return "更新时间待同步";
  try {
    return `抓取于 ${formatFullDate(value)}`;
  } catch (_error) {
    return "更新时间待同步";
  }
}

function playerWorldCupStatusMeta(status) {
  const items = {
    ok: { label: "已同步", className: "is-ok" },
    partial: { label: "部分字段待同步", className: "is-partial" },
    stale: { label: "更新暂延迟", className: "is-stale" },
    pending: { label: "等待赛后统计", className: "is-pending" },
  };
  return items[status] || null;
}

function playerWorldCupEmptyCopy(status) {
  if (status === "unmatched") {
    return { title: "暂未匹配到该球员的懂球帝统计", detail: "球员身份完成核对后，这里会自动补充世界杯数据。" };
  }
  if (status === "not_started") {
    return { title: "世界杯暂未产生统计", detail: "球员完成比赛并由来源页面结算后，这里会自动更新。" };
  }
  if (status === "pending") {
    return { title: "正在等待赛后统计", detail: "对应比赛结束并完成来源结算后，这里会重新读取数据。" };
  }
  if (status === "error") {
    return { title: "本次统计更新未完成", detail: "当前没有可用快照，稍后会再次尝试同步。" };
  }
  return { title: "暂无 2026 世界杯统计", detail: "有可核验的赛后数据后，这里会自动展示。" };
}

function playerWorldCupHasValues(stats = {}) {
  return playerWorldCupStatSections.some((section) => {
    const group = stats.groups?.[section.key] || {};
    return section.metrics.some((metric) => playerWorldCupStatNumber(group[metric.key]) !== null);
  });
}

function renderPlayerWorldCupMetric(group, metric) {
  const missing = playerWorldCupStatNumber(group?.[metric.key]) === null;
  return `
    <div class="player-world-cup-metric${missing ? " is-missing" : ""}">
      <dt>${escapeHtml(metric.label)}</dt>
      <dd aria-label="${escapeHtml(missing ? `${metric.label}暂无数据` : `${metric.label} ${formatPlayerWorldCupStat(group[metric.key], metric.format)}`)}">${escapeHtml(formatPlayerWorldCupStat(group?.[metric.key], metric.format))}</dd>
    </div>
  `;
}

function renderPlayerWorldCupSection(stats, section, index) {
  const group = stats.groups?.[section.key] || {};
  const sectionId = `player-world-cup-${section.key}`;
  return `
    <section class="player-world-cup-section is-${escapeHtml(section.key)}" id="${sectionId}" tabindex="-1" aria-labelledby="${sectionId}-title">
      <div class="player-world-cup-section-head">
        <span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <h3 id="${sectionId}-title">${escapeHtml(section.label)}</h3>
        <small>${section.metrics.length} 项</small>
      </div>
      <dl class="player-world-cup-metric-grid">
        ${section.metrics.map((metric) => renderPlayerWorldCupMetric(group, metric)).join("")}
      </dl>
    </section>
  `;
}

function renderPlayerWorldCupAverageHeatmap(heatmap, stats = {}) {
  if (!heatmap || heatmap.status !== "available" || !Array.isArray(heatmap.points) || !heatmap.points.length) return "";
  const appearances = playerWorldCupStatNumber(stats.appearances);
  const starts = playerWorldCupStatNumber(stats.starts);
  const minutes = playerWorldCupStatNumber(stats.minutesPlayed);
  const goals = playerWorldCupStatNumber(stats.groups?.attack?.goals);
  const assists = playerWorldCupStatNumber(stats.groups?.passing?.assists);
  const averageMinutes = appearances && minutes !== null ? Math.round(minutes / appearances) : null;
  const coverage = `${heatmap.matchCount || 0}${appearances ? `/${formatPlayerWorldCupStat(appearances, "integer")}` : ""}`;
  const metrics = [
    { label: "热图覆盖", value: coverage },
    { label: "场均时间", value: averageMinutes === null ? "—" : `${averageMinutes}′` },
    { label: "进球", value: goals === null ? "—" : formatPlayerWorldCupStat(goals, "integer") },
    { label: "助攻", value: assists === null ? "—" : formatPlayerWorldCupStat(assists, "integer") },
  ];
  return `
    <section class="player-average-heatmap" aria-labelledby="player-average-heatmap-title">
      <header class="player-average-heatmap-head">
        <div>
          <span class="player-average-heatmap-kicker">Tournament positioning</span>
          <h3 id="player-average-heatmap-title">本届世界杯平均热点图</h3>
          <p>逐场真实位置点聚合 · 精细密度 · 统一为进攻向右</p>
        </div>
        <span class="source-badge">懂球帝 · ${escapeHtml(heatmap.matchCount || 0)} 场</span>
      </header>
      <dl class="player-average-heatmap-stats">
        ${metrics
          .map(
            (metric) => `
              <div>
                <dt>${escapeHtml(metric.label)}</dt>
                <dd>${escapeHtml(metric.value)}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
      <div class="player-average-heatmap-figure">
        <canvas class="player-average-heatmap-canvas" role="img" aria-label="本届世界杯平均热点图，${escapeHtml(heatmap.pointCount || heatmap.points.length)} 个真实位置点，进攻向右"></canvas>
        <footer class="player-average-heatmap-meta player-match-heatmap-meta">
          <span class="player-match-heatmap-direction">
            <span class="player-match-heatmap-direction-icon" aria-hidden="true">→</span>
            <span><small>统一方向</small><b>向右</b></span>
          </span>
          <span class="player-match-heatmap-density" role="img" aria-label="活动密度由低到高">
            <b class="player-match-heatmap-density-title">活动密度</b>
            <span class="player-match-heatmap-density-scale-row">
              <small>低</small>
              <span class="player-match-heatmap-scale" aria-hidden="true"></span>
              <small>高</small>
            </span>
          </span>
        </footer>
      </div>
    </section>
  `;
}

function renderPlayerWorldCupStats(stats, averageHeatmap = null) {
  const data = stats && typeof stats === "object" ? stats : {};
  const status = String(data.status || "missing").toLowerCase();
  const hasValues = playerWorldCupHasValues(data);
  const source = data.source && typeof data.source === "object" ? data.source : {};
  const sourceName = source.name || "懂球帝";
  const sourceUrl = source.url || (data.externalPlayerId ? `https://pc.dongqiudi.com/player/${encodeURIComponent(data.externalPlayerId)}` : "");
  const statusMeta = playerWorldCupStatusMeta(status);
  const appearances = playerWorldCupStatNumber(data.appearances);
  const starts = playerWorldCupStatNumber(data.starts);
  const participation = [
    appearances === null ? "" : `出场 ${formatPlayerWorldCupStat(appearances, "integer")}`,
    starts === null ? "" : `首发 ${formatPlayerWorldCupStat(starts, "integer")}`,
  ].filter(Boolean);
  const emptyCopy = playerWorldCupEmptyCopy(status);
  return `
    <section class="panel player-world-cup-panel" aria-labelledby="player-world-cup-title">
      <div class="panel-header player-world-cup-header">
        <div class="player-world-cup-heading">
          <p class="eyebrow">Player performance</p>
          <h2 id="player-world-cup-title">2026 世界杯球员数据</h2>
          <p>${escapeHtml([playerWorldCupScope(data), ...participation].join(" · "))}</p>
        </div>
        <div class="player-world-cup-badges">
          <span class="source-badge player-world-cup-provider">${escapeHtml(sourceName)} · 第三方统计</span>
          ${statusMeta ? `<span class="source-badge player-world-cup-status ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>` : ""}
        </div>
      </div>
      <div class="panel-body player-world-cup-body">
        ${renderPlayerWorldCupAverageHeatmap(averageHeatmap, data)}
        ${
          hasValues
            ? `
              <nav class="player-world-cup-nav" aria-label="世界杯球员数据分类">
                ${playerWorldCupStatSections
                  .map(
                    (section) => `
                      <button type="button" data-player-world-cup-target="player-world-cup-${escapeHtml(section.key)}" aria-controls="player-world-cup-${escapeHtml(section.key)}">
                        ${escapeHtml(section.label)}
                      </button>
                    `
                  )
                  .join("")}
              </nav>
              <div class="player-world-cup-sections">
                ${playerWorldCupStatSections.map((section, index) => renderPlayerWorldCupSection(data, section, index)).join("")}
              </div>
            `
            : `
              <div class="player-world-cup-empty" role="status">
                <span aria-hidden="true">—</span>
                <strong>${escapeHtml(emptyCopy.title)}</strong>
                <p>${escapeHtml(emptyCopy.detail)}</p>
              </div>
            `
        }
      </div>
      <footer class="player-world-cup-footer">
        <div>
          <strong>第三方统计口径</strong>
          <span>场均值按${escapeHtml(sourceName)}页面口径展示；比赛结束后重新读取。</span>
          ${status === "stale" && hasValues ? `<span>当前显示上次成功同步的结果。</span>` : ""}
        </div>
        <div class="player-world-cup-source-meta">
          <time>${escapeHtml(playerWorldCupCheckedAt(source.checkedAt))}</time>
          ${sourceUrl ? `<a class="btn" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">查看数据来源</a>` : ""}
        </div>
      </footer>
    </section>
  `;
}

function initPlayerWorldCupStatsNavigation() {
  app.querySelectorAll("[data-player-world-cup-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.playerWorldCupTarget || "");
      if (!target) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      target.focus({ preventScroll: true });
    });
  });
}

function playerBackNavigation(params = new URLSearchParams()) {
  const returnTarget = normalizePlayerReturnTarget(params.get("returnTo"));
  if (!returnTarget) return null;
  return { href: returnTarget, label: "返回本场首发" };
}

async function renderPlayer(playerId, params = new URLSearchParams()) {
  const player = await api(`/players/${playerId}`);
  const pagePosition = playerPagePosition(player, params);
  const worldCupMatches = Array.isArray(player.worldCupMatches) ? player.worldCupMatches : [];
  const backNavigation = playerBackNavigation(params);
  app.innerHTML = `
    <section class="identity-hero player-identity-hero">
      <div class="identity-media player-identity-photo">
        <img class="${escapeHtml(photoSourceClass(player))}" src="${escapeHtml(player.photoUrl || "/static/assets/player-placeholder.png")}" alt="${escapeHtml(player.name)}" loading="eager" referrerpolicy="no-referrer" onerror="this.src='/static/assets/player-placeholder.png'" />
      </div>
      <div class="identity-copy">
        <p class="eyebrow">${escapeHtml(positionLabel(pagePosition))} · ${escapeHtml(player.nationalityCode)}</p>
        <h1>${escapeHtml(player.name)}</h1>
        <a class="identity-team-link" href="${hashHref(`/teams/${player.team.id}`)}">${teamLogo(player.team, "team-logo small")}<span>${escapeHtml(player.team.name)}</span></a>
        ${renderPlayerClubBadge(player)}
      </div>
      <div class="identity-actions">
        ${backNavigation ? `<a class="btn player-return-btn" href="${backNavigation.href}"><span aria-hidden="true">←</span>${backNavigation.label}</a>` : ""}
        <a class="btn" href="${hashHref("/competitions/world-cup-2026", { player: player.id })}">相关比赛</a>
      </div>
    </section>
    ${statTiles([
      { label: "司职", value: positionLabel(pagePosition), note: pagePosition },
      { label: "进球", value: player.stats.goals },
      { label: "助攻", value: player.stats.assists },
      { label: "黄牌", value: player.stats.yellowCards },
      { label: "红牌", value: player.stats.redCards },
      { label: "身价", value: marketValueLabel(player), note: marketValueNote(player) },
    ], "player-stat-grid")}
    ${renderPlayerDongqiudiProfile(player.dongqiudiProfile)}
    ${renderPlayerWorldCupStats(player.worldCupStats, player.worldCupHeatmap)}
    <section class="panel player-events-panel">
      <div class="panel-header player-match-records-header">
        <div>
          <h2>近期事件</h2>
          <p>世界杯完整比赛记录 · 小组赛与淘汰赛</p>
        </div>
        ${worldCupMatches.length ? `<span class="source-badge">实际出场 ${worldCupMatches.length} 场</span>` : ""}
      </div>
      <div class="panel-body">
        ${renderPlayerRecentEventGroups(player.recentEvents, worldCupMatches, { selectedMatchId: params.get("match") })}
      </div>
    </section>
  `;
  initPlayerDongqiudiProfile(player.dongqiudiProfile);
  initPlayerWorldCupStatsNavigation();
  initPlayerHeatmaps(worldCupMatches, player.worldCupHeatmap);
}

async function renderSearch(params) {
  const q = params.get("q") || "";
  const data = await api(`/search?q=${encodeURIComponent(q)}`);
  app.innerHTML = `
    <section class="page-head">
      <div class="page-title">
        <p class="eyebrow">Search</p>
        <h1>搜索结果</h1>
        <p class="muted">${escapeHtml(q || "请输入关键词")}</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body source-list">
        ${data.items
          .map(
            (item) => `
              <a class="search-item" href="#${escapeHtml(item.href)}">
                <div>
                  <strong>${escapeHtml(item.label)}</strong>
                  <div class="muted mini">${escapeHtml(item.type)} · ${escapeHtml(item.subLabel || "")}</div>
                </div>
                <span class="source-badge">打开</span>
              </a>
            `
          )
          .join("") || `<div class="empty">暂无结果</div>`}
      </div>
    </section>
  `;
}

async function renderAdmin() {
  const health = await api("/admin/providers/health");
  app.innerHTML = `
    <section class="page-head">
      <div class="page-title">
        <p class="eyebrow">Data Operations</p>
        <h1>FIFA 官方数据</h1>
        <p class="muted">查看官方快照、单场详情归档和榜单字段同步说明。</p>
      </div>
      <a class="btn primary" href="#/leaderboards/players">查看球员榜</a>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><h2>供应商健康</h2><span class="badge">${health.rawPayloadArchiveCount} payload</span></div>
        <div class="panel-body health-list">
          ${health.items
            .map(
              (item) => `
                <div class="health-item">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <div class="muted mini">${escapeHtml(item.contractNote)}</div>
                  </div>
                  <span class="badge ${item.status === "ok" ? "live" : item.status === "degraded" ? "review" : ""}">${escapeHtml(item.status)} · ${item.latencyMs}ms</span>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>同步节奏</h2></div>
        <div class="panel-body">
          <div class="source-list">
            ${health.policy.cadence
              .map((row) => `<div class="source-item"><strong>${escapeHtml(row.status)}</strong><span class="muted mini">${escapeHtml(row.strategy)}</span></div>`)
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderNotFound() {
  app.innerHTML = `<div class="empty">没有找到这个页面。</div>`;
}

function flattenArchiveExportValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function archiveRowsToCsv(rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].sort();
  const quote = (value) => `"${flattenArchiveExportValue(value).replace(/"/g, '""')}"`;
  return [keys.map(quote).join(","), ...rows.map((row) => keys.map((key) => quote(row?.[key])).join(","))].join("\n");
}

function archiveDownloadPayload(rows, format, filenameBase) {
  const normalizedFormat = format === "json" ? "json" : "csv";
  const body = normalizedFormat === "json" ? JSON.stringify(rows, null, 2) : archiveRowsToCsv(rows);
  const type = normalizedFormat === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8";
  const blob = new Blob([normalizedFormat === "csv" ? `\ufeff${body}` : body], { type });
  return {
    format: normalizedFormat,
    rows: rows.length,
    downloadUrl: URL.createObjectURL(blob),
    filename: `${filenameBase}.${normalizedFormat}`,
  };
}

async function createArchiveExport({ resource, format, filters }) {
  if (resource === "matches") {
    const data = await archiveApi(`/matches?${toQuery({ pageSize: 200, ...filters })}`);
    return archiveDownloadPayload(data.items || [], format, "worldcup-matches-archive");
  }
  if (resource === "leaderboard") {
    const metric = filters.metric || "goals";
    const data = await archiveApi(`/leaderboards/${metric}?${toQuery({ limit: 100, ...filters })}`);
    return archiveDownloadPayload(data.items || [], format, `worldcup-leaderboard-${metric}-archive`);
  }
  if (resource === "events") {
    const matchId = filters.matchId || LIVE_MATCH_ID;
    const data = await archiveApi(`/matches/${encodeURIComponent(matchId)}?${toQuery({ include: "events,stats,source,h2h,lineups" })}`);
    return archiveDownloadPayload(data.events || [], format, `worldcup-events-${matchId}-archive`);
  }
  if (resource === "teams") {
    const data = await archiveApi("/teams");
    return archiveDownloadPayload(data.items || [], format, "worldcup-teams-archive");
  }
  throw new Error("归档模式不支持该导出资源");
}

function openExportModal(config) {
  const filters = config.filters || {};
  modalRoot.hidden = false;
  modalRoot.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <header>
        <h2>导出</h2>
        <button class="btn icon" data-close-modal title="关闭">×</button>
      </header>
      <form id="export-form">
        <div class="body">
          <label class="field">资源
            <select name="resource">
              <option value="matches" ${selected(config.resource, "matches")}>赛程</option>
              <option value="leaderboard" ${selected(config.resource, "leaderboard")}>榜单</option>
              <option value="events" ${selected(config.resource, "events")}>事件</option>
              <option value="teams" ${selected(config.resource, "teams")}>球队</option>
            </select>
          </label>
          <label class="field">格式
            <select name="format">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <div class="muted mini">筛选：${escapeHtml(JSON.stringify(filters))}</div>
          <div id="export-result"></div>
        </div>
        <footer>
          <button class="btn" type="button" data-close-modal>取消</button>
          <button class="btn primary" type="submit">创建导出</button>
        </footer>
      </form>
    </section>
  `;
  document.getElementById("export-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = document.getElementById("export-result");
    result.innerHTML = `<span class="muted">正在生成...</span>`;
    try {
      const request = {
        resource: form.get("resource"),
        format: form.get("format"),
        filters,
      };
      const payload = ARCHIVE_MODE
        ? await createArchiveExport(request)
        : await api("/exports", {
            method: "POST",
            body: JSON.stringify(request),
          });
      const downloadAttr = payload.filename ? ` download="${escapeHtml(payload.filename)}"` : "";
      const lifeText = ARCHIVE_MODE ? "归档快照生成" : "24 小时有效";
      result.innerHTML = `<a class="btn primary" href="${escapeHtml(payload.downloadUrl)}"${downloadAttr}>下载 ${escapeHtml(payload.format.toUpperCase())}</a><span class="muted mini"> ${payload.rows} 行，${lifeText}</span>`;
    } catch (error) {
      result.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
  });
}

function renderNotificationMatch(match) {
  const href = match.id ? matchDetailHref(match.id) : hashHref("/competitions/world-cup-2026");
  const teams = `${teamDisplayName(match.homeTeam, "主队")} vs ${teamDisplayName(match.awayTeam, "客队")}`;
  const venue = venueCityStadiumDisplay(match.venue);
  return `
    <a class="notification-row" href="${href}" data-notification-link>
      <span>
        <strong>${escapeHtml(teams)}</strong>
        <small>${escapeHtml(formatDate(match.kickoffAt))} · ${escapeHtml(venue)}</small>
      </span>
      <span class="badge ${escapeHtml(match.status || "scheduled")}">${escapeHtml(match.statusDetail || "未开始")}</span>
    </a>
  `;
}

async function openNotificationsModal() {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `
    <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <header>
        <h2 id="notification-title">赛程提醒</h2>
        <button class="btn icon" data-close-modal title="关闭">×</button>
      </header>
      <div class="body">
        <div class="muted">用于查看临近比赛、场地信息和数据同步状态。</div>
        <div class="loading">正在读取提醒...</div>
      </div>
    </section>
  `;
  try {
    const payload = await api("/matches?pageSize=4");
    const matches = payload.items || [];
    const liveCount = matches.filter((match) => match.status === "live").length;
    const nextMatch = matches[0];
    modalRoot.innerHTML = `
      <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <header>
          <h2 id="notification-title">赛程提醒</h2>
          <button class="btn icon" data-close-modal title="关闭">×</button>
        </header>
        <div class="body">
          <div class="notification-summary">
            <span><strong>${escapeHtml(String(liveCount))}</strong><small>进行中</small></span>
            <span><strong>${escapeHtml(nextMatch ? formatDate(nextMatch.kickoffAt) : "待定")}</strong><small>下一场</small></span>
          </div>
          <div class="notification-list">
            ${matches.length ? matches.map(renderNotificationMatch).join("") : `<div class="muted">暂无可提醒的比赛</div>`}
          </div>
          <div class="muted mini">点击比赛可进入详情页；场地和比分随官方数据同步更新。</div>
        </div>
      </section>
    `;
  } catch (error) {
    modalRoot.innerHTML = `
      <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <header>
          <h2 id="notification-title">赛程提醒</h2>
          <button class="btn icon" data-close-modal title="关闭">×</button>
        </header>
        <div class="body">
          <div class="error">提醒读取失败：${escapeHtml(error.message)}</div>
        </div>
      </section>
    `;
  }
}

function notificationKnockoutScoreText(match) {
  const hasScore = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;
  if (hasScore) {
    const penalty = match.penaltyLabel ? ` · ${match.penaltyLabel}` : "";
    const winner = match.status === "finished" && match.winnerTeam ? ` · ${match.winnerTeam.name}晋级` : "";
    return `${match.homeScore}-${match.awayScore}${penalty}${winner}`;
  }
  if (["live", "extra_time", "penalties"].includes(match.status)) return "比分同步中";
  if (match.status === "scheduled") return "未开始";
  return "待确认";
}

function renderKnockoutNotificationMatch(match) {
  const href = match.id ? matchDetailHref(match.id) : hashHref("/knockout");
  const teams = knockoutMatchPairLabel(match);
  const score = notificationKnockoutScoreText(match);
  const matchNo = match.matchNo ? `第 ${match.matchNo} 场` : "";
  const statusClass = match.status || "scheduled";
  const statusLabel = match.statusLabel || knockoutStatusMeta[match.status]?.label || "待确认";
  return `
    <a class="notification-row knockout-notification-row" href="${href}" data-notification-link>
      <span>
        <strong>${escapeHtml(teams)}</strong>
        <small>${escapeHtml([match.roundLabel, matchNo, score].filter(Boolean).join(" · "))}</small>
        <small>${escapeHtml(formatDate(match.kickoffTime))} · ${escapeHtml(match.venueLine || "场地待定")}</small>
      </span>
      <span class="badge ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
    </a>
  `;
}

function getNotificationKnockoutMatches(matches = [], limit = 6) {
  const sorted = sortKnockoutMatches(matches);
  const live = sorted.filter((match) => ["live", "extra_time", "penalties"].includes(match.status));
  const scheduled = sorted.filter((match) => match.status === "scheduled");
  const postponed = sorted.filter((match) => match.status === "postponed");
  const finished = sorted.filter((match) => match.status === "finished").reverse();
  const seen = new Set();
  return [...live, ...scheduled, ...postponed, ...finished]
    .filter((match) => {
      if (seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    })
    .slice(0, limit);
}

async function openKnockoutNotificationsModal() {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `
    <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <header>
        <h2 id="notification-title">赛程提醒</h2>
        <button class="btn icon" data-close-modal title="关闭">×</button>
      </header>
      <div class="body">
        <div class="muted">正在同步淘汰赛赛程、场地和实时状态。</div>
        <div class="loading">正在读取提醒...</div>
      </div>
    </section>
  `;
  try {
    const [schedulePayload, predictions] = await Promise.all([
      api("/matches?pageSize=120&competition=world-cup-2026"),
      api("/predictions/knockout"),
    ]);
    const allMatches = normalizeKnockoutMatches(schedulePayload.items || [], predictions.items || []);
    const matches = getNotificationKnockoutMatches(allMatches, 6);
    const summary = knockoutPageSummary(allMatches, predictions);
    const currentRound = knockoutRoundConfig(getCurrentKnockoutRound(allMatches));
    const nextMatch = matches.find((match) => match.status === "scheduled") || matches[0];
    modalRoot.innerHTML = `
      <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <header>
          <h2 id="notification-title">淘汰赛提醒</h2>
          <button class="btn icon" data-close-modal title="关闭">×</button>
        </header>
        <div class="body">
          <div class="notification-summary notification-summary-knockout">
            <span><strong>${escapeHtml(String(summary.live))}</strong><small>直播中</small></span>
            <span><strong>${escapeHtml(currentRound.label)}</strong><small>当前轮次</small></span>
            <span><strong>${escapeHtml(String(summary.scheduled))}</strong><small>未开始</small></span>
            <span><strong>${escapeHtml(nextMatch ? formatDate(nextMatch.kickoffTime) : "待定")}</strong><small>下一场</small></span>
          </div>
          <div class="notification-list">
            ${matches.length ? matches.map(renderKnockoutNotificationMatch).join("") : `<div class="muted">暂无可提醒的淘汰赛比赛</div>`}
          </div>
          <div class="muted mini">内容与“淘汰赛”专栏赛程同步；点击比赛可进入详情页。</div>
        </div>
      </section>
    `;
  } catch (error) {
    modalRoot.innerHTML = `
      <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <header>
          <h2 id="notification-title">赛程提醒</h2>
          <button class="btn icon" data-close-modal title="关闭">×</button>
        </header>
        <div class="body">
          <div class="error">提醒读取失败：${escapeHtml(error.message)}</div>
        </div>
      </section>
    `;
  }
}

document.getElementById("global-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const q = document.getElementById("global-search-input").value.trim();
  const { path, params } = routeInfo();
  if (path.startsWith("/leaderboards/")) {
    const nextParams = Object.fromEntries(params.entries());
    if (q) nextParams.q = q;
    else delete nextParams.q;
    location.hash = hashHref(path, nextParams);
    return;
  }
  location.hash = hashHref("/search", { q });
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-knockout-team-form]");
  if (!form) return;
  event.preventDefault();
  const value = String(form.querySelector('[name="teamQuery"]')?.value || "").trim();
  const option = Array.from(document.querySelectorAll("#knockout-team-options option")).find((item) => item.value === value);
  const teamId = option?.dataset.teamId || "";
  if (!teamId) {
    showToast("未找到这支淘汰赛球队");
    return;
  }
  location.hash = knockoutHref({ view: "path", team: teamId });
});

document.getElementById("global-search-input").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const form = event.currentTarget.form;
  if (form?.requestSubmit) {
    form.requestSubmit();
  } else {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest('[data-knockout-team-form] input[name="teamQuery"]');
  if (!input) return;
  event.preventDefault();
  input.form?.requestSubmit();
});

document.addEventListener("input", (event) => {
  const playerStatSlider = event.target.closest("[data-player-stat-slider-range]");
  if (playerStatSlider) {
    updatePlayerStatSlider(playerStatSlider.value);
    return;
  }
  const slider = event.target.closest("[data-leaderboard-slider-range]");
  if (!slider) return;
  updateLeaderboardSlider(slider.value);
});

document.addEventListener("click", async (event) => {
  const playerStatSliderStep = event.target.closest("[data-player-stat-slider-step]");
  if (playerStatSliderStep) {
    const panel = playerStatSliderStep.closest("[data-player-stat-slider]");
    const range = panel?.querySelector("[data-player-stat-slider-range]");
    const current = Number(range?.value || panel?.dataset.offset || 0);
    const step = Number(playerStatSliderStep.dataset.playerStatSliderStep || 0);
    const windowSize = Number(panel?.dataset.windowSize || PLAYER_STAT_WINDOW_SIZE);
    updatePlayerStatSlider(current + step * windowSize);
    return;
  }
  const sliderStep = event.target.closest("[data-leaderboard-slider-step]");
  if (sliderStep) {
    const panel = sliderStep.closest("[data-leaderboard-slider]");
    const range = panel?.querySelector("[data-leaderboard-slider-range]");
    const current = Number(range?.value || panel?.dataset.offset || 0);
    const step = Number(sliderStep.dataset.leaderboardSliderStep || 0);
    const windowSize = Number(panel?.dataset.windowSize || 1);
    updateLeaderboardSlider(current + step * windowSize);
    return;
  }

  const row = event.target.closest("[data-href]");
  if (row) {
    location.hash = row.dataset.href;
    return;
  }

  const notificationLink = event.target.closest("[data-notification-link]");
  if (notificationLink) {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    return;
  }

  const close = event.target.closest("[data-close-modal]");
  if (close) {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    return;
  }

  const notifyButton = event.target.closest("[data-notify]");
  if (notifyButton) {
    notifyButton.disabled = true;
    try {
      await openKnockoutNotificationsModal();
    } finally {
      notifyButton.disabled = false;
    }
    return;
  }

  const exportButton = event.target.closest("[data-export-resource]");
  if (exportButton) {
    const { path, params } = routeInfo();
    const filters = Object.fromEntries(params.entries());
    if (exportButton.dataset.exportMetric) filters.metric = exportButton.dataset.exportMetric;
    if (exportButton.dataset.exportCompetition) filters.competition = exportButton.dataset.exportCompetition;
    if (exportButton.dataset.exportMatch) filters.matchId = exportButton.dataset.exportMatch;
    openExportModal({ resource: exportButton.dataset.exportResource, filters, path });
    return;
  }

  const reingest = event.target.closest("[data-reingest]");
  if (reingest) {
    reingest.disabled = true;
    try {
      await api(`/admin/reingest/matches/${encodeURIComponent(reingest.dataset.reingest)}`, { method: "POST", body: "{}" });
      showToast("重拉完成，payload 已归档");
      await render();
    } catch (error) {
      showToast(`重拉失败：${error.message}`);
    } finally {
      reingest.disabled = false;
    }
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", stopStream);
initMainNav3d();
registerAppServiceWorker();
render();

function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
