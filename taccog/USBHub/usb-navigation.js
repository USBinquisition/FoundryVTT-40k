(function () {
  const prompt = document.createElement("div");
  prompt.className = "nav-prompt hidden";
  prompt.innerHTML = `
    <div class="nav-prompt__panel">
      <div class="nav-prompt__title">CONFIRM NAVIGATION</div>
      <div class="nav-prompt__message"></div>
      <div class="nav-prompt__actions">
        <button class="btn-primary" data-nav="inline">OPEN HERE</button>
        <button class="btn-secondary" data-nav="new">OPEN IN NEW TAB</button>
        <button class="btn-tertiary" data-nav="cancel">CANCEL</button>
      </div>
    </div>
  `;

  const message = prompt.querySelector(".nav-prompt__message");
  const inlineBtn = prompt.querySelector("[data-nav='inline']");
  const newBtn = prompt.querySelector("[data-nav='new']");
  const cancelBtn = prompt.querySelector("[data-nav='cancel']");

  const showPrompt = ({ label, url, onInline, onNew }) => {
    message.textContent = label ? `Open ${label}?` : "Open destination?";
    prompt.classList.remove("hidden");

    const cleanup = () => {
      prompt.classList.add("hidden");
      inlineBtn.onclick = null;
      newBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    inlineBtn.onclick = () => {
      cleanup();
      if (typeof onInline === "function") {
        onInline();
      } else if (url) {
        window.location.href = url;
      }
    };

    newBtn.onclick = () => {
      cleanup();
      if (typeof onNew === "function") {
        onNew();
      } else if (url) {
        window.open(url, "_blank", "noopener");
      }
    };

    cancelBtn.onclick = () => {
      cleanup();
    };
  };

  if (!document.querySelector(".nav-prompt")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(prompt);
    });
  }

  window.USBNav = {
    confirm: showPrompt,
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-program-link]");
    if (!link) return;
    event.preventDefault();

    const url = link.getAttribute("href");
    const label = link.dataset.programName || link.textContent.trim();
    showPrompt({
      label,
      url,
    });
  });
})();
