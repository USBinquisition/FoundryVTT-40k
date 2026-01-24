const STORAGE_KEYS = {
  user: "USB_ACTIVE_USER",
  profile: "USB_ACTIVE_PROFILE",
  access: "USB_ACCESS_LEVEL",
};

const ACCESS_ORDER = ["viewer", "operator", "admin", "root"];
const ACCESS_RANK = new Map(ACCESS_ORDER.map((level, idx) => [level, idx]));

const LIBRARY_ROOT = "../data/library";
const METADATA_PATH = `${LIBRARY_ROOT}/metadata.json`;

const REQUIRED_CATEGORIES = ["reports", "intel", "books", "transcriptions", "other"];
const ADDITIONAL_CATEGORIES = ["dossiers", "doctrine", "schematics", "communiques", "xenology"];
const ALL_CATEGORIES = [...REQUIRED_CATEGORIES, ...ADDITIONAL_CATEGORIES];

const app = document.querySelector(".library");
const libraryStatus = document.getElementById("libraryStatus");
const splashPanel = document.getElementById("splashPanel");
const tabsPanel = document.getElementById("tabsPanel");
const checkList = document.getElementById("checkList");
const retryBootstrap = document.getElementById("retryBootstrap");

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabPanels = new Map(
  Array.from(document.querySelectorAll(".tabpanel")).map((panel) => [panel.dataset.panel, panel]),
);

let metadata = null;
let metadataDirty = false;

function setStatus(message, tone = "ok") {
  libraryStatus.textContent = message;
  libraryStatus.dataset.tone = tone;
}

function accessRank() {
  const level = localStorage.getItem(STORAGE_KEYS.access) ?? "viewer";
  return ACCESS_RANK.get(level) ?? 0;
}

function ensureLocalStorageDefaults() {
  if (!localStorage.getItem(STORAGE_KEYS.user)) localStorage.setItem(STORAGE_KEYS.user, "guest");
  if (!localStorage.getItem(STORAGE_KEYS.profile)) localStorage.setItem(STORAGE_KEYS.profile, "guest");
  if (!localStorage.getItem(STORAGE_KEYS.access)) localStorage.setItem(STORAGE_KEYS.access, "viewer");
}

function addCheck(message, tone) {
  const li = document.createElement("li");
  li.textContent = message;
  li.dataset.tone = tone;
  checkList.appendChild(li);
}

async function loadMetadata() {
  const resp = await fetch(METADATA_PATH, { cache: "no-store" });
  if (!resp.ok) throw new Error(`metadata.json ${resp.status}`);
  metadata = await resp.json();
  metadata.items = Array.isArray(metadata.items) ? metadata.items : [];
  return metadata;
}

function metadataStats() {
  const counts = metadata.items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.byType[item.type] = (acc.byType[item.type] ?? 0) + 1;
      acc.byCategory[item.category] = (acc.byCategory[item.category] ?? 0) + 1;
      return acc;
    },
    { total: 0, byType: {}, byCategory: {} },
  );
  return counts;
}

function isoNow() {
  return new Date().toISOString();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function nextId(prefix = "lib") {
  const base = `${prefix}-${slugify(localStorage.getItem(STORAGE_KEYS.user) ?? "guest")}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

function markDirty() {
  metadataDirty = true;
  setStatus("Metadata updated locally. Use Export Metadata to persist changes.", "warn");
  renderArchiveViewer();
  renderArchiveManager();
  renderPdfReader();
}

function exportMetadata() {
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "metadata.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Exported metadata.json. Merge it with the canonical file via tooling.", "ok");
}

function archiveTableRows(items) {
  if (!items.length) {
    return "<tr><td colspan=6>No items match the current filters.</td></tr>";
  }
  return items
    .map(
      (item) => `
      <tr>
        <td>${item.title}</td>
        <td>${item.type}</td>
        <td>${item.category}</td>
        <td>${item.status}</td>
        <td>${(item.tags ?? []).map((tag) => `<span class="pill">${tag}</span>`).join(" ")}</td>
        <td>${item.path ?? item.url ?? ""}</td>
      </tr>
    `,
    )
    .join("");
}

function wireTabButtons() {
  tabButtons.forEach((btn, idx) => {
    btn.setAttribute("aria-selected", idx === 0 ? "true" : "false");
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.tab === tabId ? "true" : "false");
  });
  tabPanels.forEach((panel, id) => {
    panel.hidden = id !== tabId;
  });
}

function renderTxtEditor() {
  const panel = tabPanels.get("txt");
  panel.innerHTML = `
    <section class="panel-block">
      <h3>TXT Editor</h3>
      <p>Open a cataloged TXT item to view or stage edits. Persist changes using the intake tooling.</p>
      <div class="panel-grid panel-grid--cols">
        <label>
          Library TXT items
          <select id="txtItemSelect"></select>
        </label>
        <div class="panel-grid">
          <button class="btn" id="txtLoadBtn">Load TXT</button>
          <button class="btn btn--ghost" id="txtExportBtn">Export Edited TXT</button>
        </div>
      </div>
      <label>
        Contents
        <textarea id="txtEditor" placeholder="Select a TXT item to load..."></textarea>
      </label>
      <div class="status" id="txtStatus" data-tone="warn">No TXT loaded.</div>
    </section>
  `;

  const txtItems = metadata.items.filter((item) => item.type === "txt" && item.path);
  const select = panel.querySelector("#txtItemSelect");
  select.innerHTML = txtItems
    .map((item) => `<option value="${item.id}">${item.title}</option>`)
    .join("");

  const txtEditor = panel.querySelector("#txtEditor");
  const txtStatus = panel.querySelector("#txtStatus");

  panel.querySelector("#txtLoadBtn").addEventListener("click", async () => {
    const selected = txtItems.find((item) => item.id === select.value);
    if (!selected) {
      txtStatus.textContent = "Select a TXT item first.";
      txtStatus.dataset.tone = "warn";
      return;
    }
    try {
      const resp = await fetch(`..${selected.path.replace("/systems/taccog/USBHub", "")}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`TXT fetch ${resp.status}`);
      txtEditor.value = await resp.text();
      txtStatus.textContent = `Loaded ${selected.title}.`;
      txtStatus.dataset.tone = "ok";
    } catch (err) {
      console.warn(err);
      txtStatus.textContent = "Unable to load TXT. Check the path or run intake tooling.";
      txtStatus.dataset.tone = "err";
    }
  });

  panel.querySelector("#txtExportBtn").addEventListener("click", () => {
    const blob = new Blob([txtEditor.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "library-edit.txt";
    a.click();
    URL.revokeObjectURL(url);
    txtStatus.textContent = "Exported edited TXT. Merge using tooling.";
    txtStatus.dataset.tone = "ok";
  });
}

function renderArchiveViewer() {
  const panel = tabPanels.get("archive");
  const stats = metadataStats();
  panel.innerHTML = `
    <section class="panel-block">
      <h3>Archive Viewer</h3>
      <p>Browse catalog entries without moving files. Intake scripts handle safe relocation.</p>
      <div class="panel-grid panel-grid--cols">
        <div>
          <strong>Total items:</strong> ${stats.total}
        </div>
        <div>
          <strong>By type:</strong> ${Object.entries(stats.byType)
            .map(([type, count]) => `${type}:${count}`)
            .join(" | ") || "none"}
        </div>
      </div>
      <div class="panel-grid panel-grid--cols">
        <label>
          Filter by category
          <select id="archiveCategoryFilter">
            <option value="">All categories</option>
            ${ALL_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join("")}
          </select>
        </label>
        <label>
          Filter by status
          <select id="archiveStatusFilter">
            <option value="">All statuses</option>
            ${["active", "archived", "quarantined"].map((status) => `<option value="${status}">${status}</option>`).join("")}
          </select>
        </label>
      </div>
      <table class="table" id="archiveTable">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Category</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Path / URL</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  `;

  const tbody = panel.querySelector("tbody");
  const categoryFilter = panel.querySelector("#archiveCategoryFilter");
  const statusFilter = panel.querySelector("#archiveStatusFilter");

  const applyFilters = () => {
    const filtered = metadata.items.filter((item) => {
      if (categoryFilter.value && item.category !== categoryFilter.value) return false;
      if (statusFilter.value && item.status !== statusFilter.value) return false;
      return true;
    });
    tbody.innerHTML = archiveTableRows(filtered);
  };

  categoryFilter.addEventListener("change", applyFilters);
  statusFilter.addEventListener("change", applyFilters);
  applyFilters();
}

function renderTranscription() {
  const panel = tabPanels.get("transcription");
  panel.innerHTML = `
    <section class="panel-block">
      <h3>Transcription</h3>
      <p>Stage transcription notes here, then file them through Archive Manager.</p>
      <label>
        Transcription draft
        <textarea id="transcriptionDraft" placeholder="Paste or write transcription notes..."></textarea>
      </label>
      <div class="panel-grid panel-grid--cols">
        <button class="btn" id="transcriptionExport">Export Draft</button>
        <div class="status" id="transcriptionStatus" data-tone="warn">Draft not exported.</div>
      </div>
    </section>
  `;

  const draft = panel.querySelector("#transcriptionDraft");
  const status = panel.querySelector("#transcriptionStatus");

  panel.querySelector("#transcriptionExport").addEventListener("click", () => {
    const blob = new Blob([draft.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.txt";
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "Draft exported. File it via Archive Manager tooling.";
    status.dataset.tone = "ok";
  });
}

function renderArchiveManager() {
  const panel = tabPanels.get("manager");
  const stats = metadataStats();
  panel.innerHTML = `
    <section class="panel-block">
      <h3>Archive Manager</h3>
      <p>Manage metadata entries. Local changes can be exported and merged via scripts.</p>
      <div class="panel-grid panel-grid--cols">
        <div><strong>Total:</strong> ${stats.total}</div>
        <div><strong>Dirty state:</strong> ${metadataDirty ? "Yes" : "No"}</div>
      </div>
      <div class="panel-grid panel-grid--cols">
        <button class="btn" id="exportMetadataBtn">Export Metadata</button>
        <button class="btn btn--ghost" id="refreshMetadataBtn">Reload Metadata</button>
      </div>
    </section>

    <section class="panel-block">
      <h4>Add TXT Entry (Reference)</h4>
      <form id="addTxtForm" class="panel-grid panel-grid--cols">
        <label>
          Title
          <input name="title" required />
        </label>
        <label>
          Category
          <select name="category">
            ${ALL_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join("")}
          </select>
        </label>
        <label>
          Local path
          <input name="path" placeholder="/systems/taccog/USBHub/data/library/reports/example.txt" required />
        </label>
        <label>
          Tags (comma separated)
          <input name="tags" placeholder="intel,session-01" />
        </label>
        <label class="panel-grid" style="grid-column: 1 / -1">
          Notes
          <textarea name="notes" placeholder="Source, summary, intake notes..."></textarea>
        </label>
        <div>
          <button class="btn" type="submit">Add TXT Entry</button>
        </div>
      </form>
    </section>

    <section class="panel-block">
      <h4>Add PDF or Link Entry</h4>
      <form id="addPdfForm" class="panel-grid panel-grid--cols">
        <label>
          Title
          <input name="title" required />
        </label>
        <label>
          Entry type
          <select name="type">
            <option value="pdf">Local PDF reference</option>
            <option value="link">Remote PDF link</option>
          </select>
        </label>
        <label>
          Category
          <select name="category">
            ${ALL_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join("")}
          </select>
        </label>
        <label>
          Path or URL
          <input name="pathOrUrl" placeholder="/path/to/file.pdf OR https://drive.google.com/..." required />
        </label>
        <label>
          Tags (comma separated)
          <input name="tags" placeholder="pdf,reference" />
        </label>
        <label class="panel-grid" style="grid-column: 1 / -1">
          Notes
          <textarea name="notes" placeholder="Embedding notes, access restrictions, etc."></textarea>
        </label>
        <div>
          <button class="btn" type="submit">Add PDF/Link Entry</button>
        </div>
      </form>
    </section>
  `;

  panel.querySelector("#exportMetadataBtn").addEventListener("click", exportMetadata);
  panel.querySelector("#refreshMetadataBtn").addEventListener("click", () => bootstrap());

  panel.querySelector("#addTxtForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (accessRank() < ACCESS_RANK.get("operator")) {
      setStatus("Operator access is required to modify metadata.", "err");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const item = {
      id: nextId("txt"),
      title: String(formData.get("title") ?? "Untitled"),
      type: "txt",
      category: String(formData.get("category") ?? "other"),
      path: String(formData.get("path") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      created_at: isoNow(),
      updated_at: isoNow(),
      source: "manual",
      notes: String(formData.get("notes") ?? ""),
      hash: null,
      status: "active",
    };
    metadata.items.unshift(item);
    markDirty();
    event.currentTarget.reset();
  });

  panel.querySelector("#addPdfForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (accessRank() < ACCESS_RANK.get("operator")) {
      setStatus("Operator access is required to modify metadata.", "err");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get("type") ?? "pdf");
    const pathOrUrl = String(formData.get("pathOrUrl") ?? "");
    const item = {
      id: nextId(type),
      title: String(formData.get("title") ?? "Untitled"),
      type,
      category: String(formData.get("category") ?? "other"),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      created_at: isoNow(),
      updated_at: isoNow(),
      source: "manual",
      notes: String(formData.get("notes") ?? ""),
      hash: null,
      status: "active",
    };
    if (type === "link") {
      item.url = pathOrUrl;
      item.path = null;
    } else {
      item.path = pathOrUrl;
      item.url = null;
    }
    metadata.items.unshift(item);
    markDirty();
    event.currentTarget.reset();
  });
}

function pdfCandidates() {
  return metadata.items.filter((item) => item.type === "pdf" || item.type === "link");
}

function renderPdfReader() {
  const panel = tabPanels.get("pdf");
  const candidates = pdfCandidates();
  panel.innerHTML = `
    <section class="panel-block">
      <h3>PDF Reader</h3>
      <p>Local PDF references render via embed/iframe. Remote links attempt iframe embedding and always provide a safe open-in-new-tab option.</p>
      <div class="panel-grid panel-grid--cols">
        <label>
          PDF entries
          <select id="pdfSelect">
            ${candidates.map((item) => `<option value="${item.id}">${item.title} (${item.type})</option>`).join("")}
          </select>
        </label>
        <div class="panel-grid">
          <button class="btn" id="pdfLoadBtn">Load PDF</button>
          <a class="btn btn--ghost" id="pdfOpenLink" target="_blank" rel="noopener noreferrer">Open in new tab</a>
        </div>
      </div>
      <div class="viewer" id="pdfViewer"></div>
      <div class="status" id="pdfStatus" data-tone="warn">No PDF loaded.</div>
    </section>
  `;

  const select = panel.querySelector("#pdfSelect");
  const viewer = panel.querySelector("#pdfViewer");
  const status = panel.querySelector("#pdfStatus");
  const openLink = panel.querySelector("#pdfOpenLink");

  const load = () => {
    const item = candidates.find((entry) => entry.id === select.value);
    if (!item) {
      status.textContent = "No PDF entries available.";
      status.dataset.tone = "warn";
      viewer.innerHTML = "";
      openLink.removeAttribute("href");
      return;
    }
    const target = item.type === "link" ? item.url : item.path;
    if (!target) {
      status.textContent = "Selected entry has no path or URL.";
      status.dataset.tone = "err";
      return;
    }
    openLink.href = target;

    const embedTarget = item.type === "link" ? target : `..${target.replace("/systems/taccog/USBHub", "")}`;
    viewer.innerHTML = `<iframe src="${embedTarget}" title="${item.title}"></iframe>`;
    status.textContent = `Loaded ${item.title}. If the embed fails, use Open in new tab.`;
    status.dataset.tone = "ok";
  };

  panel.querySelector("#pdfLoadBtn").addEventListener("click", load);
  load();
}

async function bootstrap() {
  ensureLocalStorageDefaults();
  checkList.innerHTML = "";
  setStatus("Running library bootstrap checks...", "warn");

  const checks = [];

  try {
    addCheck("LocalStorage keys verified.", "ok");
    if (accessRank() < ACCESS_RANK.get("viewer")) {
      throw new Error("Access level missing.");
    }

    await loadMetadata();
    checks.push({ message: "metadata.json loaded.", tone: "ok" });

    const missingCategories = ALL_CATEGORIES.filter((category) => !metadata.categories?.includes(category));
    if (missingCategories.length) {
      checks.push({
        message: `metadata.json missing categories: ${missingCategories.join(", ")}. Intake tooling can patch this safely.`,
        tone: "warn",
      });
    } else {
      checks.push({ message: "All required categories present.", tone: "ok" });
    }

    const intakeReportPath = `${LIBRARY_ROOT}/intake_reports/intake_scan_report.json`;
    const intakeResp = await fetch(intakeReportPath, { cache: "no-store" });
    checks.push({
      message: intakeResp.ok
        ? "Latest intake scan report detected."
        : "No intake scan report detected yet (run library_intake_scan.py).",
      tone: intakeResp.ok ? "ok" : "warn",
    });

    checks.forEach((check) => addCheck(check.message, check.tone));

    splashPanel.hidden = true;
    tabsPanel.hidden = false;
    app.dataset.state = "ready";

    wireTabButtons();
    renderTxtEditor();
    renderArchiveViewer();
    renderTranscription();
    renderArchiveManager();
    renderPdfReader();

    setStatus("Library online. Tabs unlocked.", "ok");
  } catch (err) {
    console.warn(err);
    addCheck(`Bootstrap failure: ${err.message}`, "err");
    splashPanel.hidden = false;
    tabsPanel.hidden = true;
    app.dataset.state = "error";
    setStatus("Library bootstrap failed. See integrity checks.", "err");
  }
}

retryBootstrap.addEventListener("click", bootstrap);

bootstrap();
