"use strict";

function $(sel) { return document.querySelector(sel); }
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return n;
}

function renderAll() {
  renderHeader();
  renderTeams();
  renderSavedList();
}

function renderHeader() {
  $("#m-name").value = state.name;
  $("#m-result").value = state.result;
  $("#m-note").value = state.note;
  $("#enemy-total-spd").value = state.enemyTotalSpd || 0;
  $("#our-total-spd").textContent = ourTotalSpd();
}

function renderTeams() {
  renderOurTeam();
  renderEnemyTeam();
  $("#our-total-spd").textContent = ourTotalSpd();
}

function portraitImg(name) {
  return el("img", {
    src: portraitSrc(name), alt: name, loading: "lazy",
    onerror: (e) => { e.target.style.display = "none"; }
  });
}

function renderOurTeam() {
  const root = $("#team-our");
  root.innerHTML = "";
  state.ourTeam.forEach((s, idx) => {
    if (!s) {
      root.append(emptySlot("our", idx));
      return;
    }
    const card = el("div", { class: "slot filled" },
      el("button", {
        class: "slot-x", title: "Remove",
        onclick: () => setSlotName("our", idx, null)
      }, "×"),
      el("div", {
        class: "slot-portrait",
        onclick: () => openPicker("our", idx),
        title: "Click to change"
      }, portraitImg(s.name)),
      el("div", { class: "slot-name" }, s.name),
      renderSetPicker(s, "our", idx),
      el("div", { class: "stats-grid" },
        statInput("ATK", s, "atk"),
        statInput("DEF", s, "def"),
        statInput("HP",  s, "hp"),
        statInput("SPD", s, "spd"),
        statInput("CRIT %", s, "crit"),
        statInput("BLOCK %", s, "block"),
        statInput("DMG RED %", s, "dmgRed"),
        statInput("WEAK %", s, "weak"),
        statInput("EHR %", s, "ehr"),
        statInput("RES %", s, "res")
      )
    );
    root.append(card);
  });
}

function renderSetPicker(slot, side, idx) {
  const sets = slot.sets || [];
  const wrap = el("button", {
    class: "set-display" + (sets.length ? " filled" : " empty"),
    title: sets.length ? sets.join(" / ") : "Click to pick set(s)",
    onclick: (e) => { e.stopPropagation(); openSetModal(side, idx); }
  });
  if (!sets.length) {
    wrap.append(el("div", { class: "set-display-empty" }, "+ Set"));
  } else {
    const icons = el("div", { class: "set-display-icons n" + Math.min(sets.length, 4) });
    for (const name of sets) {
      icons.append(el("img", {
        src: setIconSrc(name), alt: name, title: name, loading: "lazy",
        onerror: (e) => { e.target.style.display = "none"; }
      }));
    }
    wrap.append(icons);
    wrap.append(el("div", { class: "set-display-name" }, sets.join(" / ")));
  }
  return wrap;
}

let _setModalCtx = null;
function openSetModal(side, idx) {
  if (!isEditor) return;
  _setModalCtx = { side, idx };
  $("#set-modal").classList.add("open");
  renderSetModalGrid();
}
function closeSetModal() {
  _setModalCtx = null;
  $("#set-modal").classList.remove("open");
}
function renderSetModalGrid() {
  if (!_setModalCtx) return;
  const { side, idx } = _setModalCtx;
  const team = side === "our" ? state.ourTeam : state.enemyTeam;
  const slot = team[idx];
  if (!slot) { closeSetModal(); return; }
  $("#set-modal-title").textContent =
    `${side === "our" ? "Our" : "Enemy"} — ${slot.name}`;
  const grid = $("#set-grid");
  grid.innerHTML = "";
  const sets = DATA.runeSets || [];
  const cur = new Set(slot.sets || []);
  for (const name of sets) {
    const active = cur.has(name);
    const b2 = DATA.setBonus2pc?.[name];
    const b4 = DATA.setBonus4pc?.[name] || [];
    const b2txt = b2 ? fmtSetBonusLite(b2) : "—";
    const b4txt = b4.map(fmtSetBonusLite).join(" · ") || "—";
    const card = el("button", {
      class: "set-card" + (active ? " selected" : ""),
      onclick: () => toggleSet(name)
    },
      el("img", { src: setIconSrc(name), alt: name, loading: "lazy",
                  onerror: (e) => { e.target.style.display = "none"; } }),
      el("div", { class: "set-card-body" },
        el("div", { class: "set-card-name" }, name),
        el("div", { class: "set-card-bonus" },
          el("b", {}, "2pc"), " ", b2txt),
        el("div", { class: "set-card-bonus" },
          el("b", {}, "4pc"), " ", b4txt)
      )
    );
    grid.append(card);
  }
}
function toggleSet(name) {
  if (!_setModalCtx) return;
  const { side, idx } = _setModalCtx;
  const team = side === "our" ? state.ourTeam : state.enemyTeam;
  const slot = team[idx];
  if (!slot) return;
  slot.sets = slot.sets || [];
  const i = slot.sets.indexOf(name);
  if (i >= 0) slot.sets.splice(i, 1);
  else slot.sets.push(name);
  saveCurrent();
  renderTeams();
  renderSetModalGrid();
}
function fmtSetBonusLite(b) {
  if (!b) return "—";
  if (b.text) return b.text;
  const LBL = {
    atkPct: "ATK", defPct: "DEF", hpPct: "HP",
    critRate: "CRIT", block: "BLOCK",
    weaknessHit: "WEAK HIT",
    effectHitRate: "EFF HIT", effectResistance: "EFF RES"
  };
  const lbl = LBL[b.stat] || b.stat;
  return `${lbl} +${b.value}%`;
}

function statInput(label, slot, key) {
  const input = el("input", {
    type: "number",
    step: "1",
    value: slot[key],
    oninput: (e) => {
      if (!isEditor) { e.target.value = slot[key]; return; }
      const v = +e.target.value;
      slot[key] = Number.isFinite(v) ? v : 0;
      if (key === "spd") $("#our-total-spd").textContent = ourTotalSpd();
      saveCurrent();
    }
  });
  if (!isEditor) input.setAttribute("readonly", "");
  return el("label", { class: "stat-cell" },
    el("span", { class: "stat-lbl" }, label),
    input
  );
}

function renderEnemyTeam() {
  const root = $("#team-enemy");
  root.innerHTML = "";
  state.enemyTeam.forEach((s, idx) => {
    if (!s) {
      root.append(emptySlot("enemy", idx));
      return;
    }
    const card = el("div", { class: "slot filled enemy-slot" },
      el("button", {
        class: "slot-x", title: "Remove",
        onclick: () => setSlotName("enemy", idx, null)
      }, "×"),
      el("div", {
        class: "slot-portrait",
        onclick: () => openPicker("enemy", idx),
        title: "Click to change"
      }, portraitImg(s.name)),
      el("div", { class: "slot-name" }, s.name),
      renderSetPicker(s, "enemy", idx)
    );
    root.append(card);
  });
}

function emptySlot(side, idx) {
  return el("div", {
    class: "slot empty",
    onclick: () => openPicker(side, idx)
  }, el("div", { class: "plus" }, "+"));
}

function setSlotName(side, idx, name) {
  if (!isEditor) return;
  const team = side === "our" ? state.ourTeam : state.enemyTeam;
  if (name == null) {
    team[idx] = null;
  } else {
    team[idx] = side === "our" ? newOurSlot(name) : newEnemySlot(name);
  }
  saveCurrent();
  renderTeams();
}

function openPicker(side, idx) {
  if (!isEditor) return;
  activeSlot = { side, idx };
  $("#picker").classList.add("open");
  $("#picker-q").value = filterState.q;
  renderPickerGrid();
}

function closePicker() {
  activeSlot = null;
  $("#picker").classList.remove("open");
}

function renderPickerGrid() {
  const grid = $("#picker-grid");
  grid.innerHTML = "";
  const q = filterState.q.toLowerCase().trim();
  const team = activeSlot?.side === "our" ? state.ourTeam : state.enemyTeam;
  const used = new Set(team.filter(Boolean).map(s => s.name));

  const matches = (c) => {
    if (filterState.grades.size && !filterState.grades.has(c.grade)) return false;
    if (filterState.types.size && !filterState.types.has(c.type)) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  };

  const chars = DATA.characters.filter(matches);
  chars.sort((a, b) => a.name.localeCompare(b.name));

  const recentNames = loadRecent()
    .map(n => DATA.characters.find(c => c.name === n))
    .filter(c => c && matches(c));

  if (recentNames.length) {
    grid.append(el("div", { class: "picker-section" }, "Recently used"));
    const row = el("div", { class: "picker-row" });
    for (const c of recentNames) row.append(pickerCard(c, used));
    grid.append(row);
    grid.append(el("div", { class: "picker-section" }, "All characters"));
  }

  const all = el("div", { class: "picker-row" });
  for (const c of chars) all.append(pickerCard(c, used));
  grid.append(all);

  $("#picker-count").textContent = `${chars.length} / ${DATA.characters.length}`;
}

function pickerCard(c, used) {
  const dup = used.has(c.name);
  return el("div", {
    class: "pcard" + (dup ? " dup" : ""),
    title: dup ? "Already on this team" : c.name,
    onclick: () => { if (!dup) pickChar(c.name); }
  },
    el("img", { src: portraitSrc(c.name), alt: c.name, loading: "lazy",
                onerror: (e) => { e.target.style.display = "none"; } }),
    el("div", { class: "pcard-name" }, c.name),
    el("div", { class: "pcard-meta" },
      `${TYPE_ICON[c.type] || ""}${GRADE_ICON[c.grade] || ""}`)
  );
}

function pickChar(name) {
  if (!activeSlot) return;
  pushRecent(name);
  setSlotName(activeSlot.side, activeSlot.idx, name);
  closePicker();
}

function renderSavedList() {
  const root = $("#saved-list");
  root.innerHTML = "";
  const list = loadMatchups().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    root.append(el("div", { class: "muted" }, "No saved matchups yet."));
    return;
  }
  for (const m of list) {
    const isCurrent = m.id === state.id;
    const ourCount = (m.ourTeam || []).filter(Boolean).length;
    const enemyCount = (m.enemyTeam || []).filter(Boolean).length;
    const row = el("div", { class: "saved-row" + (isCurrent ? " current" : "") },
      el("div", { class: "saved-main", onclick: () => loadMatchupById(m.id) },
        el("div", { class: "saved-name" }, m.name || "(untitled)"),
        el("div", { class: "saved-sub" },
          `${RESULT_LABEL[m.result] || m.result} · ${ourCount}v${enemyCount}`)
      ),
      el("div", { class: "saved-actions" },
        el("button", { onclick: () => duplicateMatchup(m.id), title: "Duplicate" }, "⎘"),
        el("button", {
          class: "danger",
          onclick: () => { if (confirm("Delete this matchup?")) deleteMatchup(m.id); },
          title: "Delete"
        }, "🗑")
      )
    );
    root.append(row);
  }
}

function renderFilters() {
  const gRoot = $("#filter-grades");
  gRoot.innerHTML = "";
  for (const g of ["LEGEND", "RARE"]) {
    gRoot.append(filterChip(g, GRADE_LABEL[g], filterState.grades));
  }
  const tRoot = $("#filter-types");
  tRoot.innerHTML = "";
  for (const t of ["ATTACK", "MAGIC", "DEFENSE", "SUPPORT", "UNIVERSAL"]) {
    tRoot.append(filterChip(t, TYPE_LABEL[t], filterState.types));
  }
}
function filterChip(val, label, set) {
  const active = set.has(val);
  return el("button", {
    class: "chip" + (active ? " on" : ""),
    onclick: () => {
      if (set.has(val)) set.delete(val); else set.add(val);
      renderFilters();
      renderPickerGrid();
    }
  }, label);
}
