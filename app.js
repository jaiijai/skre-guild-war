"use strict";

async function boot() {
  const res = await fetch("data.json");
  if (!res.ok) throw new Error("failed to load data.json");
  DATA = await res.json();

  initSupabaseClient();
  await initAuth();
  state = await loadCurrent();
  subscribeMatchups();

  $("#m-name").addEventListener("input", (e) => {
    if (!isEditor) return;
    state.name = e.target.value;
    saveCurrent();
  });
  $("#m-result").addEventListener("change", (e) => {
    if (!isEditor) return;
    state.result = e.target.value;
    saveCurrent();
  });
  $("#m-note").addEventListener("input", (e) => {
    if (!isEditor) return;
    state.note = e.target.value;
    saveCurrent();
  });
  $("#enemy-total-spd").addEventListener("input", (e) => {
    if (!isEditor) return;
    const v = +e.target.value;
    state.enemyTotalSpd = Number.isFinite(v) ? v : 0;
    saveCurrent();
  });

  $("#btn-new").addEventListener("click", () => {
    if (!isEditor) return;
    state = newMatchup();
    saveCurrent();
    renderAll();
  });
  $("#btn-clear").addEventListener("click", () => {
    if (!isEditor) return;
    if (!confirm("Clear both teams and note?")) return;
    state.ourTeam = Array(ourSize()).fill(null);
    state.enemyTeam = Array(enemySize()).fill(null);
    state.note = "";
    saveCurrent();
    renderAll();
  });

  $("#picker-close").addEventListener("click", closePicker);
  $("#picker-backdrop").addEventListener("click", closePicker);
  $("#set-modal-close").addEventListener("click", closeSetModal);
  $("#set-modal-backdrop").addEventListener("click", closeSetModal);
  $("#pet-modal-close").addEventListener("click", closePetModal);
  $("#pet-modal-backdrop").addEventListener("click", closePetModal);
  $("#formation-modal-close").addEventListener("click", closeFormationModal);
  $("#formation-modal-backdrop").addEventListener("click", closeFormationModal);
  $("#picker-q").addEventListener("input", (e) => {
    filterState.q = e.target.value;
    renderPickerGrid();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("#picker").classList.contains("open")) closePicker();
      if ($("#set-modal").classList.contains("open")) closeSetModal();
      if ($("#pet-modal").classList.contains("open")) closePetModal();
      if ($("#formation-modal").classList.contains("open")) closeFormationModal();
    }
  });

  renderFilters();
  renderAll();
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f66;padding:2rem;white-space:pre-wrap">${err.message}\n\n` +
    `Setup checklist:\n` +
    `1. Create Supabase project at supabase.com\n` +
    `2. Open SQL Editor → run supabase-schema.sql\n` +
    `3. Add editor emails to 'editors' table\n` +
    `4. Edit config.js with your Project URL + anon key (Project Settings → API)\n` +
    `5. Reload this page</pre>`;
});
