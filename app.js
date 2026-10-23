import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTION_NAME } from "./config.js";

const $ = (id) => document.getElementById(id);

const authPanel = $("authPanel");
const gamePanel = $("gamePanel");
const authForm = $("authForm");
const authMessage = $("authMessage");
const gameMessage = $("gameMessage");
const welcomeModal = $("welcomeModal");
const closeWelcomeModal = $("closeWelcomeModal");

let supabase;
let isSignup = false;
let activeRound = null;
let animationFrame = null;
let roundStartedAt = null;
let displayMultiplier = 1;
let lastBalance = 0;
let roundsPlayed = 0;
let creditsEarned = 0;
let currentUser = null;

function setMessage(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`.trim();
}

function fmt(n) {
  return Math.max(0, Number(n) || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}

function showWelcomeModal() {
  welcomeModal?.classList.remove("hidden");
}

function hideWelcomeModal() {
  welcomeModal?.classList.add("hidden");
}

closeWelcomeModal?.addEventListener("click", hideWelcomeModal);

welcomeModal?.addEventListener("click", (event) => {
  if (event.target === welcomeModal) hideWelcomeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideWelcomeModal();
});

function setAuthMode(signup) {
  isSignup = signup;

  $("loginTab").classList.toggle("active", !signup);
  $("signupTab").classList.toggle("active", signup);
  $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("authSubmit").innerHTML = signup
    ? 'Create account <span>→</span>'
    : 'Log in <span>→</span>';
  $("password").autocomplete = signup ? "new-password" : "current-password";

  setMessage(authMessage, "");
}

$("loginTab").addEventListener("click", () => setAuthMode(false));
$("signupTab").addEventListener("click", () => setAuthMode(true));

async function invokeGame(body) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Your session expired. Please log in again.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "The game request failed.");
  }

  return data;
}

async function refreshWallet() {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .single();

  if (error) throw error;

  lastBalance = Number(data.balance);
  $("balance").textContent = fmt(lastBalance);
}

async function refreshHistory() {
  const { data, error } = await supabase
    .from("round_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("Could not load history", error);
    return;
  }

  $("historyCount").textContent = String(data.length);
  $("historyList").replaceChildren();

  if (!data.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Your rounds will appear here.";
    $("historyList").append(p);
    return;
  }

  for (const item of data) {
    const row = document.createElement("div");
    row.className = "history-item";

    const left = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent =
      item.status === "cashed_out"
        ? `${Number(item.cashed_out_multiplier).toFixed(2)}×`
        : "Crashed";

    const small = document.createElement("small");
    small.textContent =
      `${fmt(item.bet_amount)} CR · ${new Date(item.created_at).toLocaleString()}`;

    left.append(title, small);

    const result = document.createElement("span");
    result.className =
      `result ${item.status === "cashed_out" ? "win" : "loss"}`;

    result.textContent =
      item.status === "cashed_out"
        ? `+${fmt(Number(item.payout_amount) - Number(item.bet_amount))} CR`
        : `−${fmt(item.bet_amount)} CR`;

    row.append(left, result);
    $("historyList").append(row);
  }

  $("roundCount").textContent = String(roundsPlayed + data.length);
}

function resetChart() {
  $("linePath").setAttribute("d", "M 36 294");
  $("areaPath").setAttribute(
    "d",
    "M 36 294 L 36 294 L 36 310 L 36 310 Z"
  );
  $("chartDot").setAttribute("cx", "36");
  $("chartDot").setAttribute("cy", "294");
  $("multiplier").textContent = "1.00×";
  $("crashOverlay").classList.add("hidden");
}

function drawChart(multiplier) {
  const t = Math.min(1, Math.max(0, (multiplier - 1) / 5));
  const x = 36 + Math.min(700, (multiplier - 1) * 125);
  const y =
    294 - Math.min(250, t * 250 + Math.max(0, multiplier - 6) * 5);

  const points = [];
  const count = Math.max(2, Math.min(45, Math.floor((x - 36) / 16) + 2));

  for (let i = 0; i < count; i++) {
    const p = i / (count - 1);
    const px = 36 + (x - 36) * p;
    const py = 294 - (294 - y) * p * p;

    points.push(`${i ? "L" : "M"} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }

  const d = points.join(" ");

  $("linePath").setAttribute("d", d);
  $("areaPath").setAttribute(
    "d",
    `${d} L ${x.toFixed(1)} 315 L 36 315 Z`
  );
  $("chartDot").setAttribute("cx", x.toFixed(1));
  $("chartDot").setAttribute("cy", y.toFixed(1));
}

function stopAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function animate() {
  if (!activeRound || !roundStartedAt) return;

  const elapsed =
    (Date.now() - new Date(roundStartedAt).getTime()) / 1000;

  displayMultiplier = Math.exp(Math.max(0, elapsed) * 0.12);
  $("multiplier").textContent = `${displayMultiplier.toFixed(2)}×`;

  drawChart(displayMultiplier);
  animationFrame = requestAnimationFrame(animate);
}

async function startRound() {
  if (activeRound) return;

  const bet = Number($("betAmount").value);

  if (!Number.isInteger(bet) || bet < 1 || bet > 1000) {
    setMessage(
      gameMessage,
      "Choose a whole-number amount from 1 to 1,000 credits.",
      "error"
    );
    return;
  }

  $("startBtn").disabled = true;
  setMessage(gameMessage, "Starting a virtual round…");

  try {
    const data = await invokeGame({
      action: "start",
      bet_amount: bet
    });

    activeRound = data.round;
    roundStartedAt = data.round.started_at;

    $("roundLabel").textContent = "ROUND IN PROGRESS";
    $("startBtn").classList.add("hidden");
    $("cashoutBtn").classList.remove("hidden");
    $("betAmount").disabled = true;
    $("lastResult").textContent = "In progress";

    await refreshWallet();

    setMessage(
      gameMessage,
      "The multiplier is rising. Collect before the round crashes."
    );

    stopAnimation();
    animate();
  } catch (e) {
    setMessage(gameMessage, e.message || "Could not start round.", "error");
  } finally {
    $("startBtn").disabled = false;
  }
}

async function cashoutRound() {
  if (!activeRound) return;

  $("cashoutBtn").disabled = true;
  setMessage(gameMessage, "Checking the round on the server…");

  try {
    const data = await invokeGame({
      action: "cashout",
      round_id: activeRound.id
    });

    stopAnimation();

    activeRound = null;
    roundStartedAt = null;

    $("cashoutBtn").classList.add("hidden");
    $("startBtn").classList.remove("hidden");
    $("betAmount").disabled = false;

    if (data.result === "cashed_out") {
      const m = Number(data.cashed_out_multiplier);

      $("multiplier").textContent = `${m.toFixed(2)}×`;
      $("lastResult").textContent = `${m.toFixed(2)}×`;

      $("crashOverlay").classList.remove("hidden");
      $("crashText").textContent =
        `COLLECTED ${fmt(data.payout_amount)} CR`;
      $("crashText").style.color = "var(--green)";

      creditsEarned += Number(data.payout_amount);

      setMessage(
        gameMessage,
        `Round collected at ${m.toFixed(2)}×. +${fmt(data.payout_amount)} virtual credits returned to your wallet.`,
        "success"
      );
    } else {
      $("lastResult").textContent = "Crashed";
      $("crashOverlay").classList.remove("hidden");
      $("crashText").textContent = "CRASHED";
      $("crashText").style.color = "var(--red)";

      setMessage(
        gameMessage,
        "The server confirmed the round had already crashed. Try another virtual round."
      );
    }

    $("earned").textContent = fmt(creditsEarned);
    $("roundLabel").textContent = "ROUND COMPLETE";

    roundsPlayed += 1;

    await refreshWallet();
    await refreshHistory();
  } catch (e) {
    setMessage(
      gameMessage,
      e.message || "Could not collect this round.",
      "error"
    );
  } finally {
    $("cashoutBtn").disabled = false;
  }
}

async function handleAuth(event) {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("authSubmit").disabled = true;

  setMessage(
    authMessage,
    isSignup ? "Creating your account…" : "Signing you in…"
  );

  try {
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (!data.session) {
        setMessage(
          authMessage,
          "Account created. Check your email to confirm, then log in.",
          "success"
        );
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    }

    await showApp();
    showWelcomeModal();
  } catch (e) {
    setMessage(authMessage, e.message || "Authentication failed.", "error");
  } finally {
    $("authSubmit").disabled = false;
  }
}

async function showApp() {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return showLoggedOut();

  currentUser = user;

  authPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  try {
    await refreshWallet();
    await refreshHistory();
  } catch (e) {
    setMessage(
      gameMessage,
      "Wallet is not ready yet. Confirm the schema is installed and your account is confirmed. " +
        e.message,
      "error"
    );
  }
}

function showLoggedOut() {
  currentUser = null;
  activeRound = null;
  roundStartedAt = null;

  stopAnimation();
  hideWelcomeModal();

  authPanel.classList.remove("hidden");
  gamePanel.classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

authForm.addEventListener("submit", handleAuth);

$("startBtn").addEventListener("click", startRound);
$("cashoutBtn").addEventListener("click", cashoutRound);

$("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLoggedOut();
});

$("betMinus").addEventListener("click", () => {
  $("betAmount").value = String(
    Math.max(1, Number($("betAmount").value || 1) - 5)
  );
});

$("betPlus").addEventListener("click", () => {
  $("betAmount").value = String(
    Math.min(1000, Number($("betAmount").value || 1) + 5)
  );
});

document.querySelectorAll("[data-bet]").forEach((button) => {
  button.addEventListener("click", () => {
    $("betAmount").value = button.dataset.bet;
  });
});

function init() {
  if (
    SUPABASE_URL.includes("YOUR_PROJECT_REF") ||
    SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  ) {
    setMessage(
      authMessage,
      "Setup needed: add your Supabase project URL and publishable/anon key in config.js.",
      "error"
    );
    return;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      setTimeout(() => showApp(), 0);
    } else {
      showLoggedOut();
    }
  });

  supabase.auth
    .getSession()
    .then(({ data }) => (data.session ? showApp() : showLoggedOut()));
}

init();