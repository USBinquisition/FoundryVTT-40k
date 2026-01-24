const STORAGE_KEYS = {
  user: "USB_ACTIVE_USER",
  profile: "USB_ACTIVE_PROFILE",
  access: "USB_ACCESS_LEVEL",
};

const ACCESS_LEVELS = ["viewer", "operator", "admin", "root"];
const ACCESS_RANK = new Map(ACCESS_LEVELS.map((level, idx) => [level, idx]));

const hubStatus = document.getElementById("hubStatus");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const activeUser = document.getElementById("activeUser");
const programSelect = document.getElementById("programSelect");
const loadProgramBtn = document.getElementById("loadProgramBtn");
const programMeta = document.getElementById("programMeta");
const programFrame = document.getElementById("programFrame");
const thoughtOfDay = document.getElementById("thoughtOfDay");
const imperialDate = document.getElementById("imperialDate");

let usersRegistry = null;
let programsRegistry = [];

function setStatus(message, tone = "ok") {
  hubStatus.textContent = message;
  hubStatus.classList.remove("status--ok", "status--warn", "status--err");
  hubStatus.classList.add(`status--${tone}`);
}

function currentAccessLevel() {
  const stored = localStorage.getItem(STORAGE_KEYS.access);
  return ACCESS_RANK.has(stored) ? stored : "viewer";
}

function currentAccessRank() {
  return ACCESS_RANK.get(currentAccessLevel()) ?? 0;
}

function setActiveUserDisplay() {
  const user = localStorage.getItem(STORAGE_KEYS.user) ?? "guest";
  const profile = localStorage.getItem(STORAGE_KEYS.profile) ?? "default";
  const access = currentAccessLevel();
  activeUser.textContent = `Active user: ${user} | Profile: ${profile} | Access: ${access}`;
}

async function loadThoughtOfDay() {
  try {
    const resp = await fetch("./data/thoughts.txt", { cache: "no-store" });
    if (!resp.ok) throw new Error(`thoughts.txt ${resp.status}`);
    const text = await resp.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    thoughtOfDay.textContent = lines[0] ? `Thought of the Day: ${lines[0]}` : "Thought of the Day: Vigilance is victory.";
  } catch (err) {
    thoughtOfDay.textContent = "Thought of the Day: Vigilance is victory.";
    console.warn("Unable to load thoughts.txt", err);
  }
}

function renderImperialDate(now = new Date()) {
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const fraction = Math.min(999, Math.floor(((now.getTime() - start) / (end - start)) * 1000));
  const millennium = Math.floor(year / 1000) + 1;
  const yearWithinMillennium = year % 1000;
  const checkNumber = 0;
  const formatted = `${checkNumber}.${String(fraction).padStart(3, "0")}.${String(yearWithinMillennium).padStart(3, "0")}.M${millennium}`;
  imperialDate.textContent = `Imperial Date: ${formatted}`;
}

async function loadUsersRegistry() {
  const resp = await fetch("./data/oclara/users.json", { cache: "no-store" });
  if (!resp.ok) throw new Error(`users registry ${resp.status}`);
  usersRegistry = await resp.json();
  return usersRegistry;
}

async function pbkdf2Hash(password, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const bytes = new Uint8Array(bits);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

async function verifyPassword(userRecord, password) {
  const derived = await pbkdf2Hash(password, userRecord.salt_b64, userRecord.iterations);
  return derived === userRecord.hash_b64;
}

function programAllowed(program) {
  const neededRank = ACCESS_RANK.get(program.min_access ?? "viewer") ?? 0;
  return currentAccessRank() >= neededRank;
}

function describeProgram(program) {
  const tags = (program.tags ?? []).join(", ");
  return [
    `<strong>${program.title}</strong>`,
    program.description ?? "No description provided.",
    `Minimum access: ${program.min_access ?? "viewer"}`,
    tags ? `Tags: ${tags}` : "",
  ]
    .filter(Boolean)
    .join("<br />");
}

function populateProgramSelect() {
  programSelect.innerHTML = "";
  const allowedPrograms = programsRegistry.filter(programAllowed);
  if (!allowedPrograms.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No programs available for current access level";
    programSelect.appendChild(opt);
    programMeta.innerHTML = "";
    return;
  }

  allowedPrograms.forEach((program, idx) => {
    const opt = document.createElement("option");
    opt.value = program.path;
    opt.textContent = program.title;
    opt.dataset.index = String(idx);
    programSelect.appendChild(opt);
  });
  programSelect.selectedIndex = 0;
  programMeta.innerHTML = describeProgram(allowedPrograms[0]);

  programSelect.addEventListener("change", () => {
    const selected = allowedPrograms[programSelect.selectedIndex];
    if (selected) {
      programMeta.innerHTML = describeProgram(selected);
    }
  });
}

async function loadProgramsRegistry() {
  const resp = await fetch("./data/usb-programs.json", { cache: "no-store" });
  if (!resp.ok) throw new Error(`program registry ${resp.status}`);
  const data = await resp.json();
  programsRegistry = data.programs ?? [];
  populateProgramSelect();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    setStatus("Provide both username and password.", "warn");
    return;
  }

  const userRecord = usersRegistry?.users?.find((user) => user.username === username);
  if (!userRecord) {
    setStatus("Unknown user.", "err");
    return;
  }

  const ok = await verifyPassword(userRecord, password);
  if (!ok) {
    setStatus("Access denied.", "err");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.user, userRecord.username);
  localStorage.setItem(STORAGE_KEYS.profile, userRecord.default_profile ?? userRecord.username);
  localStorage.setItem(STORAGE_KEYS.access, userRecord.access_level);

  setActiveUserDisplay();
  populateProgramSelect();
  setStatus(`Access granted for ${userRecord.username}.`, "ok");
}

function handleLogout() {
  localStorage.setItem(STORAGE_KEYS.user, "guest");
  localStorage.setItem(STORAGE_KEYS.profile, "guest");
  localStorage.setItem(STORAGE_KEYS.access, "viewer");
  programFrame.removeAttribute("src");
  setActiveUserDisplay();
  populateProgramSelect();
  setStatus("Logged out to guest viewer.", "warn");
}

function openProgram() {
  const selectedPath = programSelect.value;
  const program = programsRegistry.find((entry) => entry.path === selectedPath);
  if (!program) {
    setStatus("Select a valid program first.", "warn");
    return;
  }
  if (!programAllowed(program)) {
    setStatus("Current user lacks the required access level.", "err");
    return;
  }
  programFrame.src = program.path;
  setStatus(`Loaded ${program.title}.`, "ok");
}

async function bootstrap() {
  setStatus("Bootstrapping hub registries...", "warn");
  try {
    await loadUsersRegistry();
    await loadProgramsRegistry();
    renderImperialDate();
    loadThoughtOfDay();
    setActiveUserDisplay();
    setStatus("Hub online. Choose a program to begin.", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Hub bootstrap failed. Check registries and paths.", "err");
  }
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);
loadProgramBtn.addEventListener("click", openProgram);

if (!localStorage.getItem(STORAGE_KEYS.user)) {
  handleLogout();
}

bootstrap();
