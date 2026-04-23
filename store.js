"use strict";
/* Supabase-backed store. Replaces old localStorage list. */

let sb = null;
let matchupsCache = [];

function initSupabaseClient() {
  const cfg = window.SKRE_GW_CONFIG;
  if (!cfg || cfg.SUPABASE_URL.includes("YOUR_PROJECT") || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("Supabase config missing. Edit config.js with your project URL and anon key.");
  }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } }
  });
  return sb;
}
function db() { return sb; }

function rowToMatchup(row) {
  return sanitizeMatchup({
    id: row.id,
    name: row.name,
    ourFormation: row.our_formation,
    enemyFormation: row.enemy_formation,
    ourTeam: row.our_team,
    enemyTeam: row.enemy_team,
    enemyTotalSpd: row.enemy_total_spd,
    ourPets: row.our_pets,
    enemyPets: row.enemy_pets,
    skillOrder: row.skill_order,
    note: row.note,
    result: row.result,
    authorId: row.author_id,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  });
}

function matchupToRow(m) {
  return {
    id: m.id,
    name: m.name,
    our_formation: m.ourFormation || "plan1",
    enemy_formation: m.enemyFormation || "plan1",
    our_team: m.ourTeam,
    enemy_team: m.enemyTeam,
    enemy_total_spd: m.enemyTotalSpd || 0,
    our_pets: m.ourPets || [],
    enemy_pets: m.enemyPets || [],
    skill_order: m.skillOrder || [null, null, null],
    note: m.note,
    result: m.result,
    updated_at: new Date().toISOString()
  };
}

async function fetchAllMatchups() {
  const { data, error } = await sb.from("matchups").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  matchupsCache = (data || []).map(rowToMatchup);
  return matchupsCache;
}

function loadMatchups() { return matchupsCache.slice(); }

function currentMatchupIdFromLocal() {
  return localStorage.getItem(CURRENT_KEY);
}
function rememberCurrent(id) {
  localStorage.setItem(CURRENT_KEY, id);
}

async function loadCurrent() {
  await fetchAllMatchups();
  const id = currentMatchupIdFromLocal();
  if (id) {
    const m = matchupsCache.find(x => x.id === id);
    if (m) return m;
  }
  return matchupsCache[0] || newMatchup();
}

let _saveTimer = null;
function saveCurrent() {
  if (!state) return;
  state.updatedAt = Date.now();
  // Optimistic local cache update so UI stays snappy.
  const i = matchupsCache.findIndex(x => x.id === state.id);
  if (i >= 0) matchupsCache[i] = JSON.parse(JSON.stringify(state));
  else matchupsCache.unshift(JSON.parse(JSON.stringify(state)));
  rememberCurrent(state.id);
  renderSavedList();

  if (!isEditor) return; // viewers can't persist
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const row = matchupToRow(state);
    if (currentUser) row.author_id = currentUser.id;
    const { error } = await sb.from("matchups").upsert(row);
    if (error) console.error("Save failed:", error.message);
  }, 350);
}

async function deleteMatchup(id) {
  if (!isEditor) return;
  if (state.id === id) {
    // pick another first
    matchupsCache = matchupsCache.filter(x => x.id !== id);
    state = matchupsCache[0] || newMatchup();
    rememberCurrent(state.id);
    renderAll();
  } else {
    matchupsCache = matchupsCache.filter(x => x.id !== id);
    renderSavedList();
  }
  const { error } = await sb.from("matchups").delete().eq("id", id);
  if (error) console.error("Delete failed:", error.message);
}

async function duplicateMatchup(id) {
  if (!isEditor) return;
  const src = matchupsCache.find(x => x.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = crypto.randomUUID();
  copy.name = (src.name || "Untitled") + " (copy)";
  copy.createdAt = copy.updatedAt = Date.now();
  state = sanitizeMatchup(copy);
  saveCurrent();
  renderAll();
}

function loadMatchupById(id) {
  const m = matchupsCache.find(x => x.id === id);
  if (!m) return;
  state = sanitizeMatchup(JSON.parse(JSON.stringify(m)));
  rememberCurrent(state.id);
  renderAll();
}

function subscribeMatchups() {
  sb.channel("matchups-rt")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "matchups" },
        (payload) => {
          const evt = payload.eventType;
          if (evt === "DELETE") {
            matchupsCache = matchupsCache.filter(x => x.id !== payload.old.id);
            if (state.id === payload.old.id) {
              state = matchupsCache[0] || newMatchup();
              rememberCurrent(state.id);
              renderAll();
              return;
            }
          } else {
            const m = rowToMatchup(payload.new);
            const i = matchupsCache.findIndex(x => x.id === m.id);
            if (i >= 0) matchupsCache[i] = m; else matchupsCache.unshift(m);
            // If this is the open matchup and I'm not editing right now, refresh.
            // Heuristic: if not focused input/textarea, re-render teams.
            if (state.id === m.id) {
              const active = document.activeElement;
              const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
              if (!typing) {
                state = sanitizeMatchup(JSON.parse(JSON.stringify(m)));
                renderAll();
                return;
              }
            }
          }
          renderSavedList();
        })
    .subscribe();
}
