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
  const ourF = state.ourFormation || DEFAULT_FORMATION;
  const enemyF = state.enemyFormation || DEFAULT_FORMATION;
  const ourSlots = $("#team-our");
  const enemySlots = $("#team-enemy");
  if (ourSlots) ourSlots.dataset.formation = ourF;
  if (enemySlots) enemySlots.dataset.formation = enemyF;
  renderFormationPicker("our");
  renderFormationPicker("enemy");
  renderOurTeam();
  renderEnemyTeam();
  renderTeamPetsBar("our");
  renderTeamPetsBar("enemy");
  renderOurLoadout();
  renderEnemyLoadout();
  renderSkillOrder();
  $("#our-total-spd").textContent = ourTotalSpd();
}

function renderFormationPicker(side) {
  const root = $(side === "our" ? "#formation-picker-our" : "#formation-picker-enemy");
  if (!root) return;
  root.replaceChildren();
  const current = (side === "our" ? state.ourFormation : state.enemyFormation) || DEFAULT_FORMATION;
  for (const [key, f] of Object.entries(FORMATIONS)) {
    const card = el("button", {
      class: "fp-card" + (current === key ? " on" : ""),
      disabled: !isEditor,
      onclick: () => changeFormation(side, key),
      title: f.label
    },
      el("div", {
        class: "fp-preview fp-" + side,
        "data-formation": key,
        "data-side": side
      }, ...fpPreviewDots(key)),
      el("div", { class: "fp-label" }, f.label)
    );
    root.append(card);
  }
}

function fpPreviewDots(key) {
  const size = formationSize(key);
  const dots = [];
  for (let i = 0; i < size; i++) {
    dots.push(el("span", { class: "fp-dot", "data-i": i + 1 }));
  }
  return dots;
}

function changeFormation(side, key) {
  if (!isEditor) return;
  if (!FORMATIONS[key]) return;
  const size = formationSize(key);
  if (side === "our") {
    state.ourFormation = key;
    state.ourTeam = resizeTeam(state.ourTeam, size);
  } else {
    state.enemyFormation = key;
    state.enemyTeam = resizeTeam(state.enemyTeam, size);
  }
  saveCurrent();
  renderTeams();
}
function resizeTeam(arr, size) {
  const out = (arr || []).slice(0, size);
  while (out.length < size) out.push(null);
  return out;
}

function renderPetsStrip(side) {
  const pets = (side === "our" ? state.ourPets : state.enemyPets) || [];
  const wrap = el("button", {
    class: "pets-strip" + (pets.length ? " filled" : " empty"),
    title: pets.length ? pets.join(" / ") : "Click to pick pet(s)",
    onclick: () => openPetModal(side)
  });
  if (!pets.length) {
    wrap.append(el("span", { class: "pets-strip-label" }, "+ Pet"));
  } else {
    const icons = el("div", { class: "pets-strip-icons" });
    for (const p of pets) {
      icons.append(el("img", {
        class: "pets-strip-img",
        src: petImgSrc(p), alt: p, title: p,
        onerror: (e) => { e.target.style.display = "none"; }
      }));
    }
    wrap.append(icons);
    wrap.append(el("span", { class: "pets-strip-name" }, pets.join(" / ")));
  }
  return wrap;
}

function renderSkillOrder() {
  const root = $("#skill-order");
  if (!root) return;
  root.innerHTML = "";
  const order = state.skillOrder || [null, null, null];
  const team = state.ourTeam;

  // Queue slots
  const queue = el("div", { class: "sq-queue" });
  for (let i = 0; i < 3; i++) {
    const step = order[i];
    const slot = el("div", {
      class: "sq-slot" + (step ? " filled" : " empty"),
      onclick: () => {
        if (!isEditor || !step) return;
        state.skillOrder[i] = null;
        saveCurrent();
        renderSkillOrder();
      },
      title: step ? "Click to clear" : ""
    },
      el("div", { class: "sq-num" }, i + 1),
      step
        ? el("div", { class: "sq-body" },
            el("img", {
              class: "sq-portrait",
              src: portraitSrc(step.charName), alt: step.charName,
              onerror: (e) => { e.target.style.display = "none"; }
            }),
            el("div", { class: "sq-meta" },
              el("div", { class: "sq-name" }, step.charName),
              el("div", { class: "sq-skill sk-" + step.skill },
                step.skill === "top" ? "Skill 1" : "Skill 2")
            ),
            el("img", {
              class: "sq-skill-icon sk-" + step.skill,
              src: skillIconSrc(step.charName, step.skill),
              alt: step.skill,
              onerror: (e) => { e.target.style.display = "none"; }
            })
          )
        : el("div", { class: "sq-placeholder" }, "Tap a skill below →")
    );
    queue.append(slot);
  }
  root.append(queue);

  // Palette
  const filled = team.filter(Boolean);
  if (!filled.length) {
    root.append(el("div", { class: "sq-hint" }, "Add characters to Our Team to build skill order."));
    return;
  }
  const palette = el("div", { class: "sq-palette" });
  for (const s of filled) {
    const card = el("div", { class: "sq-pchar" },
      el("img", {
        class: "sq-pchar-img",
        src: portraitSrc(s.name), alt: s.name,
        onerror: (e) => { e.target.style.display = "none"; }
      }),
      el("div", { class: "sq-pchar-name" }, s.name),
      el("div", { class: "sq-pchar-btns" },
        skillBtn(s.name, "top"),
        skillBtn(s.name, "bottom")
      )
    );
    palette.append(card);
  }
  root.append(palette);
}

function skillBtn(charName, skill) {
  return el("button", {
    class: "sq-skbtn sk-" + skill,
    title: (skill === "top" ? "Skill 1" : "Skill 2") + " — " + charName,
    onclick: () => {
      if (!isEditor) return;
      const free = state.skillOrder.findIndex(x => !x);
      if (free < 0) return;
      state.skillOrder[free] = { charName, skill };
      saveCurrent();
      renderSkillOrder();
    }
  },
    el("img", {
      src: skillIconSrc(charName, skill),
      alt: skill,
      onerror: (e) => { e.target.style.display = "none"; }
    })
  );
}

function portraitImg(name) {
  return el("img", {
    src: portraitSrc(name), alt: name, loading: "lazy",
    onerror: (e) => { e.target.style.display = "none"; }
  });
}

function renderOurTeam() {
  const root = $("#team-our");
  root.replaceChildren();
  state.ourTeam.forEach((s, idx) => {
    if (!s) {
      root.append(emptySlot("our", idx));
      return;
    }
    const card = el("div", {
      class: "slot filled",
      onclick: () => openPicker("our", idx),
      title: s.name
    },
      el("button", {
        class: "slot-x", title: "Remove",
        onclick: (e) => { e.stopPropagation(); setSlotName("our", idx, null); }
      }, "×"),
      el("div", { class: "slot-portrait" }, portraitImg(s.name)),
      el("div", { class: "slot-name" }, s.name)
    );
    root.append(card);
  });
}

function renderOurLoadout() {
  const root = $("#our-loadout");
  if (!root) return;
  root.replaceChildren();
  const filled = state.ourTeam.map((s, i) => ({ s, i })).filter(x => x.s);
  if (!filled.length) {
    root.append(el("div", { class: "loadout-empty" }, "Add characters to Our Team to configure stats & sets."));
    return;
  }
  for (const { s, i } of filled) {
    const row = el("div", { class: "loadout-row" },
      el("div", { class: "loadout-char" },
        el("img", {
          class: "loadout-portrait",
          src: portraitSrc(s.name), alt: s.name,
          onerror: (e) => { e.target.style.display = "none"; }
        }),
        el("div", { class: "loadout-meta" },
          el("div", { class: "loadout-name" }, s.name),
          el("div", { class: "loadout-slot-idx" }, "Slot " + (i + 1))
        )
      ),
      el("div", { class: "loadout-sets" }, renderSetPicker(s, "our", i)),
      el("div", { class: "loadout-stats" },
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
    root.append(row);
  }
}

function renderEnemyLoadout() {
  const root = $("#enemy-loadout");
  if (!root) return;
  root.replaceChildren();
  const filled = state.enemyTeam.map((s, i) => ({ s, i })).filter(x => x.s);
  if (!filled.length) {
    root.append(el("div", { class: "loadout-empty" }, "Add characters to Enemy Team to configure sets."));
    return;
  }
  for (const { s, i } of filled) {
    const row = el("div", { class: "loadout-row enemy-row" },
      el("div", { class: "loadout-char" },
        el("img", {
          class: "loadout-portrait",
          src: portraitSrc(s.name), alt: s.name,
          onerror: (e) => { e.target.style.display = "none"; }
        }),
        el("div", { class: "loadout-meta" },
          el("div", { class: "loadout-name" }, s.name),
          el("div", { class: "loadout-slot-idx" }, "Slot " + (i + 1))
        )
      ),
      el("div", { class: "loadout-sets full" }, renderSetPicker(s, "enemy", i))
    );
    root.append(row);
  }
}

function renderPetsRow(side) {
  return el("div", { class: "loadout-pets-row" },
    el("div", { class: "loadout-pets-label" }, "Pets"),
    renderPetsStrip(side)
  );
}

function renderTeamPetsBar(side) {
  const root = $(side === "our" ? "#team-pets-our" : "#team-pets-enemy");
  if (!root) return;
  root.replaceChildren();
  root.append(
    el("span", { class: "team-pets-bar-label" }, "Pets"),
    renderPetsStrip(side)
  );
}


let _petModalCtx = null;
function openPetModal(side) {
  if (!isEditor) return;
  _petModalCtx = { side };
  $("#pet-modal").classList.add("open");
  renderPetModalGrid();
}
function closePetModal() {
  _petModalCtx = null;
  $("#pet-modal").classList.remove("open");
}
function renderPetModalGrid() {
  if (!_petModalCtx) return;
  const { side } = _petModalCtx;
  $("#pet-modal-title").textContent =
    `${side === "our" ? "Our" : "Enemy"} team — Pick pet(s)`;
  const grid = $("#pet-grid");
  grid.replaceChildren();
  const pets = DATA.pets || [];
  const cur = new Set((side === "our" ? state.ourPets : state.enemyPets) || []);

  for (const p of pets) {
    const active = cur.has(p.name);
    grid.append(el("button", {
      class: "pet-card" + (active ? " selected" : ""),
      onclick: () => togglePet(p.name)
    },
      el("img", {
        class: "pet-card-img",
        src: p.image || petImgSrc(p.name), alt: p.name,
        onerror: (e) => { e.target.style.display = "none"; }
      }),
      el("div", { class: "pet-card-body" },
        el("div", { class: "pet-card-name" }, p.name),
        p.grade ? el("div", { class: "pet-card-stars" }, "★".repeat(p.grade)) : null
      )
    ));
  }
}
function togglePet(name) {
  if (!_petModalCtx || !isEditor) return;
  const { side } = _petModalCtx;
  const key = side === "our" ? "ourPets" : "enemyPets";
  state[key] = state[key] || [];
  const i = state[key].indexOf(name);
  if (i >= 0) state[key].splice(i, 1);
  else state[key].push(name);
  saveCurrent();
  renderPetModalGrid();
  renderTeams();
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
  root.replaceChildren();
  state.enemyTeam.forEach((s, idx) => {
    if (!s) {
      root.append(emptySlot("enemy", idx));
      return;
    }
    const card = el("div", {
      class: "slot filled enemy-slot",
      onclick: () => openPicker("enemy", idx),
      title: s.name
    },
      el("button", {
        class: "slot-x", title: "Remove",
        onclick: (e) => { e.stopPropagation(); setSlotName("enemy", idx, null); }
      }, "×"),
      el("div", { class: "slot-portrait" }, portraitImg(s.name)),
      el("div", { class: "slot-name" }, s.name)
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
    const dotClass = m.result === "win" ? " win-dot" : m.result === "loss" ? " loss-dot" : "";
    const row = el("div", { class: "saved-row" + (isCurrent ? " current" : "") },
      el("div", { class: "saved-main", onclick: () => loadMatchupById(m.id) },
        el("div", { class: "saved-name" }, m.name || "(untitled)"),
        el("div", { class: "saved-sub" + dotClass },
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
