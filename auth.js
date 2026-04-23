"use strict";

let currentUser = null;
let isEditor = false;

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  await applySession(session);
  sb.auth.onAuthStateChange(async (_e, s) => {
    await applySession(s);
    renderAuthUi();
    renderAll();
  });
  renderAuthUi();
}

async function applySession(session) {
  currentUser = session?.user || null;
  if (currentUser?.email) {
    const { data, error } = await sb
      .from("editors")
      .select("email")
      .ilike("email", currentUser.email)
      .maybeSingle();
    isEditor = !!data && !error;
  } else {
    isEditor = false;
  }
  document.body.classList.toggle("is-editor", isEditor);
  document.body.classList.toggle("is-viewer", !isEditor);
}

async function sendOtp(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });
  if (error) throw error;
}

async function verifyOtp(email, token) {
  const { data, error } = await sb.auth.verifyOtp({
    email, token, type: "email"
  });
  if (error) throw error;
  if (!data?.session) throw new Error("Verification failed: no session.");
}

async function signOut() { await sb.auth.signOut(); }

function openAuthModal() {
  closeAuthModal();
  const wrap = document.createElement("div");
  wrap.id = "auth-modal";
  wrap.className = "picker open";
  wrap.innerHTML = `
    <div class="picker-backdrop" data-close></div>
    <div class="picker-panel auth-panel">
      <div class="picker-head">
        <h2>Editor sign in</h2>
        <span class="grow"></span>
        <button class="picker-close" data-close>Cancel</button>
      </div>
      <div class="auth-form">
        <div id="auth-step-email">
          <label>Email
            <input id="auth-email" type="email" required autocomplete="email">
          </label>
          <div class="auth-msg" id="auth-msg"></div>
          <div class="auth-actions">
            <button type="button" id="btn-send-otp">Send code</button>
          </div>
          <div class="muted" style="margin-top:8px">
            We'll email you a 6-digit code. Only emails in <code>editors</code> can edit.
          </div>
        </div>
        <div id="auth-step-code" style="display:none">
          <div class="muted" id="auth-sent-to"></div>
          <label>6-digit code
            <input id="auth-code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code">
          </label>
          <div class="auth-msg" id="auth-msg2"></div>
          <div class="auth-actions">
            <button type="button" id="btn-verify-otp">Verify</button>
            <button type="button" id="btn-resend">Resend</button>
          </div>
          <button type="button" class="auth-back" id="btn-back">← Change email</button>
        </div>
      </div>
    </div>`;
  document.body.append(wrap);
  wrap.querySelectorAll("[data-close]").forEach(el => el.onclick = closeAuthModal);

  const stepEmail = wrap.querySelector("#auth-step-email");
  const stepCode = wrap.querySelector("#auth-step-code");
  const emailInput = wrap.querySelector("#auth-email");
  const codeInput = wrap.querySelector("#auth-code");
  const msg1 = wrap.querySelector("#auth-msg");
  const msg2 = wrap.querySelector("#auth-msg2");
  let pendingEmail = "";

  async function doSend() {
    const email = emailInput.value.trim();
    if (!email) return;
    msg1.textContent = "Sending code...";
    try {
      await sendOtp(email);
      pendingEmail = email;
      wrap.querySelector("#auth-sent-to").textContent = `Code sent to ${email}`;
      stepEmail.style.display = "none";
      stepCode.style.display = "";
      setTimeout(() => codeInput.focus(), 50);
    } catch (err) {
      msg1.textContent = err.message || "Failed to send code.";
    }
  }
  async function doVerify() {
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) { msg2.textContent = "Enter 6-digit code."; return; }
    msg2.textContent = "Verifying...";
    try {
      await verifyOtp(pendingEmail, code);
      closeAuthModal();
    } catch (err) {
      msg2.textContent = err.message || "Invalid or expired code.";
    }
  }

  wrap.querySelector("#btn-send-otp").onclick = doSend;
  wrap.querySelector("#btn-verify-otp").onclick = doVerify;
  wrap.querySelector("#btn-resend").onclick = () => {
    msg2.textContent = "Resending...";
    sendOtp(pendingEmail).then(() => msg2.textContent = "Code resent.")
      .catch(err => msg2.textContent = err.message);
  };
  wrap.querySelector("#btn-back").onclick = () => {
    stepCode.style.display = "none";
    stepEmail.style.display = "";
    msg1.textContent = "";
    emailInput.focus();
  };
  emailInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doVerify(); });

  setTimeout(() => emailInput.focus(), 50);
}
function closeAuthModal() {
  document.getElementById("auth-modal")?.remove();
}

function renderAuthUi() {
  const el = document.getElementById("auth-status");
  if (!el) return;
  el.innerHTML = "";
  if (currentUser) {
    const badge = isEditor ? "editor" : "viewer";
    el.append(
      Object.assign(document.createElement("span"),
        { className: "auth-user", textContent: `${currentUser.email} (${badge})` }),
      Object.assign(document.createElement("button"),
        { textContent: "Sign out", onclick: () => signOut() })
    );
  } else {
    const btn = document.createElement("button");
    btn.textContent = "Sign in";
    btn.onclick = openAuthModal;
    el.append(btn);
  }
}
