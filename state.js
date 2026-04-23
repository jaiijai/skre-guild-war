"use strict";

const CURRENT_KEY = "skre-gw:current";
const RECENT_KEY = "skre-gw:recent-chars";
const RECENT_MAX = 12;

function loadRecent() {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
  } catch { return []; }
}
function pushRecent(name) {
  if (!name) return;
  const list = loadRecent().filter(x => x !== name);
  list.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}
const THEME_KEY = "skre-gw:theme";
const TEAM_SIZE = 3;
const STAT_KEYS = ["atk", "def", "hp", "spd", "crit", "block", "dmgRed", "weak", "ehr", "res"];

const TYPE_LABEL = {
  ATTACK: "Attack", MAGIC: "Magic", DEFENSE: "Defense",
  SUPPORT: "Support", UNIVERSAL: "Universal"
};
const TYPE_ICON = {
  ATTACK: "⚔️", MAGIC: "🔮", DEFENSE: "🛡️",
  SUPPORT: "💠", UNIVERSAL: "⭐"
};
const GRADE_LABEL = { LEGEND: "Legendary", RARE: "Rare" };
const GRADE_ICON = { LEGEND: "🏅", RARE: "💎" };
const RESULT_LABEL = { win: "Win", loss: "Loss", untested: "Untested" };

let DATA = null;
let state = null;
const filterState = { grades: new Set(), types: new Set(), q: "" };
let activeSlot = null;

function portraitSrc(name) {
  const safe = String(name).replace(/\s*&\s*/g, "_").replace(/\s+/g, "_").replace(/[^\w_]/g, "");
  return `img/chars/${safe}.png`;
}
function charByName(name) {
  return DATA.characters.find(c => c.name === name) || null;
}

function newOurSlot(name) {
  const c = charByName(name);
  if (!c) return null;
  return {
    name, sets: [],
    atk: c.atk, def: c.def, hp: c.hp, spd: c.spd,
    crit: 0, block: 0, dmgRed: 0, weak: 0, ehr: 0, res: 0
  };
}
function newEnemySlot(name) {
  if (!charByName(name)) return null;
  return { name, sets: [] };
}

function setIconSrc(setName) {
  if (!setName) return null;
  const safe = String(setName).replace(/\s+/g, "_");
  return `img/sets/armor/${safe}.png`;
}

function newMatchup() {
  return {
    id: crypto.randomUUID(),
    name: "New Matchup",
    ourTeam: Array(TEAM_SIZE).fill(null),
    enemyTeam: Array(TEAM_SIZE).fill(null),
    enemyTotalSpd: 0,
    note: "",
    result: "untested",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function normalizeSets(s) {
  if (Array.isArray(s.sets)) return s.sets.filter(x => typeof x === "string" && x);
  if (typeof s.set === "string" && s.set) return [s.set];
  return [];
}
function migrateSlot(s, side) {
  if (!s) return null;
  if (typeof s === "string") {
    return side === "our" ? newOurSlot(s) : newEnemySlot(s);
  }
  const c = charByName(s.name);
  if (!c) return null;
  if (side === "our") {
    const base = {
      atk: c.atk, def: c.def, hp: c.hp, spd: c.spd,
      crit: 0, block: 0, dmgRed: 0, weak: 0, ehr: 0, res: 0
    };
    const out = { name: s.name, sets: normalizeSets(s) };
    for (const k of STAT_KEYS) {
      const v = +s[k];
      out[k] = Number.isFinite(v) ? v : base[k];
    }
    return out;
  }
  return { name: s.name, sets: normalizeSets(s) };
}

function sanitizeMatchup(m) {
  if (!m) return newMatchup();
  const our = Array.isArray(m.ourTeam) ? m.ourTeam.slice(0, TEAM_SIZE) : [];
  const enemy = Array.isArray(m.enemyTeam) ? m.enemyTeam.slice(0, TEAM_SIZE) : [];
  while (our.length < TEAM_SIZE) our.push(null);
  while (enemy.length < TEAM_SIZE) enemy.push(null);
  m.ourTeam = our.map(s => migrateSlot(s, "our"));
  m.enemyTeam = enemy.map(s => migrateSlot(s, "enemy"));
  m.enemyTotalSpd = Number.isFinite(+m.enemyTotalSpd) ? +m.enemyTotalSpd : 0;
  if (!m.result) m.result = "untested";
  if (typeof m.note !== "string") m.note = "";
  return m;
}

function ourTotalSpd() {
  return state.ourTeam.reduce((sum, s) => sum + (s ? +s.spd || 0 : 0), 0);
}
