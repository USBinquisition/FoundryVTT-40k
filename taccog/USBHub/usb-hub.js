const Hub = {
  dashboard: document.getElementById("dashboard"),
  topBar: document.getElementById("topBar"),
  frame: document.getElementById("moduleFrame"),
  title: document.getElementById("activeModuleTitle"),
  loginScreen: document.getElementById("loginScreen"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  profileList: document.getElementById("profileList"),
  profileField: document.getElementById("profileField"),
  authStatus: document.getElementById("authStatus"),
  securityTags: document.getElementById("securityTags"),
  welcomeTitle: document.getElementById("welcomeTitle"),
  welcomeSub: document.getElementById("welcomeSub"),
  enterHub: document.getElementById("enterHub"),
  activeProfileName: document.getElementById("activeProfileName"),
  activeProfileTag: document.getElementById("activeProfileTag"),
  activeProfileStatus: document.getElementById("activeProfileStatus"),
  activeUserName: document.getElementById("activeUserName"),
  loginForm: document.getElementById("loginForm"),
  userLoginForm: document.getElementById("userLoginForm"),
  userField: document.getElementById("userField"),
  userPassField: document.getElementById("userPassField"),
  userStatus: document.getElementById("userStatus"),
  userList: document.getElementById("userList"),
  modulePrompt: document.getElementById("modulePrompt"),
  modulePromptMessage: document.getElementById("modulePromptMessage"),
  modulePromptInline: document.getElementById("modulePromptInline"),
  modulePromptNewTab: document.getElementById("modulePromptNewTab"),
  modulePromptCancel: document.getElementById("modulePromptCancel"),
  isAuthenticated: false,
  pendingModule: null,
  activeProfile: null,
  activeUser: null,
  userIndex: [],
  profiles: [
    {
      id: "mechanicus",
      name: "Adeptus Mechanicus",
      subtitle: "Tech Priests",
      tags: ["Noosphere", "Forge-Seal", "Machina", "Reductus"],
      welcomeTitle: "Cogitator Link Established",
      welcomeSub: "Welcome, Tech Priests of Mars. USB rites engaged.",
      status: "MAGOS-PRIME CLEARANCE",
    },
    {
      id: "sororitas",
      name: "Adeptus Soritos",
      subtitle: "Sisters",
      tags: ["Ecclesia", "Sanctum", "Order Sigil", "Purity"],
      welcomeTitle: "Sanctum Protocol Engaged",
      welcomeSub: "Sisters authenticated. USB sanctity preserved.",
      status: "CANONESSA CLEARANCE",
    },
    {
      id: "ministorum",
      name: "Adeptus Ministorum",
      subtitle: "Eccelsiarchy",
      tags: ["Sermon", "Tithe", "Cathedral", "Confessor"],
      welcomeTitle: "Pulpit Access Granted",
      welcomeSub: "Ministorum credentials verified. USB liturgy aligned.",
      status: "ARCH-CLERIC CLEARANCE",
    },
    {
      id: "orphis",
      name: "Orphis Dynasty",
      subtitle: "Rogue Trader",
      tags: ["Charter", "Void-Tithe", "Dynasty", "Navis"],
      welcomeTitle: "Warrant Validated",
      welcomeSub: "Dynastic keys accepted. USB charter secured.",
      status: "ROGUE TRADER CLEARANCE",
    },
    {
      id: "inquisition",
      name: "Inquisition [REDACTED]",
      subtitle: "Ordo Cell",
      tags: ["Seal: BLACK", "Cipher-7", "Inquisitorial", "Watch"],
      welcomeTitle: "Seal Accepted",
      welcomeSub: "Inquisitorial channel open. USB silence enforced.",
      status: "INQUISITORIAL CLEARANCE",
    },
    {
      id: "militarum",
      name: "Astra Militarum",
      subtitle: "Imperial Guard",
      tags: ["Regimental", "Frontline", "Line-Cmd", "Supply"],
      welcomeTitle: "Command Channel Active",
      welcomeSub: "Militarum protocols synced. USB battlegrid ready.",
      status: "REGIMENTAL CLEARANCE",
    },
    {
      id: "imperial_navy",
      name: "Imperial Navy",
      subtitle: "Battlefleet",
      tags: ["Voidfleet", "Picket", "Bridgewatch", "Navis"],
      welcomeTitle: "Fleet Channel Online",
      welcomeSub: "Navy credentials confirmed. USB void registry synced.",
      status: "BATTLEFLEET CLEARANCE",
    },
    {
      id: "administratum",
      name: "Adeptus Administratum",
      subtitle: "Bureaucracy",
      tags: ["Census", "Ledger", "Seal-Prime", "Archivum"],
      welcomeTitle: "Ledger Synchronised",
      welcomeSub: "Administratum audit complete. USB records steady.",
      status: "SCRIBE-MAJOR CLEARANCE",
    },
    {
      id: "munitorum",
      name: "Departmento Munitorum",
      subtitle: "Quartermasters",
      tags: ["Supply", "Inventory", "Stockpile", "Logis"],
      welcomeTitle: "Supply Chain Linked",
      welcomeSub: "Munitorum vaults engaged. USB logistics aligned.",
      status: "QUARTERMASTER CLEARANCE",
    },
    {
      id: "custodes",
      name: "Adeptus Custodes",
      subtitle: "LOCKED-GENE-SEAL",
      tags: ["Golden Throne", "Gene-Lock", "Praesidium", "Silent"],
      welcomeTitle: "Gene-Seal Verified",
      welcomeSub: "Custodes gate open. USB protocols sanctified.",
      status: "LOCKED-GENE-SEAL",
    },
    {
      id: "telepathica",
      name: "Adeptus Telepathica",
      subtitle: "Scholasta Psykana",
      tags: ["Psykana", "Soul-Binding", "Astral", "Choir"],
      welcomeTitle: "Warpward Online",
      welcomeSub: "Telepathica signatures accepted. USB psychometry stable.",
      status: "PSYKANA CLEARANCE",
    },
    {
      id: "titanicus",
      name: "Adeptus Titanicus",
      subtitle: "Ordo Reductor",
      tags: ["God-Engines", "Forgeworld", "Princeps", "Battleline"],
      welcomeTitle: "Manifold Linked",
      welcomeSub: "Titanicus access granted. USB war-suites awake.",
      status: "PRINCEPS CLEARANCE",
    },
    {
      id: "assassinorum",
      name: "Officious Assassinorum",
      subtitle: "Death Cults",
      tags: ["Execution", "Clade", "Void-Silence", "Override"],
      welcomeTitle: "Directive Accepted",
      welcomeSub: "Assassinorum channel secured. USB silence absolute.",
      status: "CLANDESTINE CLEARANCE",
    },
  ],

  init: function () {
    this.renderProfiles();
    this.bindLogin();
    this.loadUserIndex();

    const hash = window.location.hash.substring(1);
    if (hash) {
      this.pendingModule = hash;
    }
  },

  renderProfiles: function () {
    this.profileList.innerHTML = "";
    this.profiles.forEach((profile, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "profile-card";
      if (index === 0) card.classList.add("active");
      card.dataset.profile = profile.id;
      card.innerHTML = `
        <div class="profile-title">${profile.name}</div>
        <div class="profile-subtitle">${profile.subtitle}</div>
        <div class="tag-row">
          ${profile.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
        </div>
      `;
      card.addEventListener("click", () => this.setActiveProfile(profile.id));
      this.profileList.appendChild(card);
    });
    this.setActiveProfile(this.profiles[0].id);
  },

  setActiveProfile: function (profileId) {
    const selected = this.profiles.find((profile) => profile.id === profileId);
    if (!selected) return;
    this.activeProfile = selected;
    document.body.dataset.profile = selected.id;
    this.profileField.value = `${selected.name} // ${selected.subtitle}`;
    this.authStatus.textContent = `${selected.status}`;

    this.securityTags.innerHTML = selected.tags
      .map((tag) => `<span class="security-tag">${tag}</span>`)
      .join("");

    const cards = this.profileList.querySelectorAll(".profile-card");
    cards.forEach((card) => {
      card.classList.toggle("active", card.dataset.profile === selected.id);
    });
  },

  bindLogin: function () {
    this.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.activeProfile) return;

      this.welcomeTitle.textContent = this.activeProfile.welcomeTitle;
      this.welcomeSub.textContent = this.activeProfile.welcomeSub;
      this.welcomeScreen.classList.remove("hidden");
    });

    this.enterHub.addEventListener("click", () => {
      this.authenticate();
    });

    this.userLoginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleUserLogin();
    });
  },

  authenticate: function () {
    this.isAuthenticated = true;
    this.loginScreen.classList.add("hidden");
    this.welcomeScreen.classList.add("hidden");
    this.dashboard.classList.remove("hidden");
    this.activeProfileName.textContent = this.activeProfile.name;
    this.activeProfileTag.textContent = this.activeProfile.subtitle;
    this.activeProfileStatus.textContent = this.activeProfile.status;
    this.activeUserName.textContent = this.activeUser ? this.activeUser.name : "UNASSIGNED";

    if (this.pendingModule) {
      this.requestLoad(this.pendingModule, this.pendingModule.toUpperCase());
      this.pendingModule = null;
    }
  },

  loadUserIndex: function () {
    fetch("data/personell/records/people/users.json")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load user index");
        return response.json();
      })
      .then((data) => {
        this.userIndex = Array.isArray(data.users) ? data.users : [];
        this.userList.innerHTML = "";
        this.userIndex.forEach((user) => {
          const option = document.createElement("option");
          option.value = user.username;
          option.label = user.name;
          this.userList.appendChild(option);
        });
        if (this.userIndex.length) {
          this.userStatus.textContent = "USER LIST LOADED";
        }
      })
      .catch(() => {
        this.userStatus.textContent = "USER LIST UNAVAILABLE";
      });
  },

  handleUserLogin: function () {
    const username = this.userField.value.trim();
    const password = this.userPassField.value.trim();
    const match = this.userIndex.find((user) => user.username === username);

    if (!match) {
      this.userStatus.textContent = "USER NOT FOUND";
      this.userStatus.classList.add("warn");
      return;
    }

    if (password !== "password") {
      this.userStatus.textContent = "INVALID PASSWORD";
      this.userStatus.classList.add("warn");
      return;
    }

    this.activeUser = match;
    localStorage.setItem("usbActiveUser", JSON.stringify(match));
    this.userStatus.textContent = `ACTIVE USER: ${match.name.toUpperCase()}`;
    this.userStatus.classList.remove("warn");
    this.activeUserName.textContent = match.name;
  },

  requestLoad: function (path, name) {
    if (!this.isAuthenticated) {
      this.pendingModule = path;
      return;
    }

    this.modulePromptMessage.textContent = `Launch ${name}? Choose a destination.`;
    this.modulePrompt.classList.remove("hidden");

    const cleanup = () => {
      this.modulePrompt.classList.add("hidden");
      this.modulePromptInline.onclick = null;
      this.modulePromptNewTab.onclick = null;
      this.modulePromptCancel.onclick = null;
    };

    this.modulePromptInline.onclick = () => {
      cleanup();
      this.load(path, name);
    };

    this.modulePromptNewTab.onclick = () => {
      cleanup();
      window.open(`${path}/index.html`, "_blank", "noopener");
    };

    this.modulePromptCancel.onclick = () => {
      cleanup();
    };
  },

  load: function (path, name) {
    if (!this.isAuthenticated) {
      this.pendingModule = path;
      return;
    }

    this.dashboard.classList.add("hidden");
    this.topBar.classList.remove("hidden");
    this.frame.classList.remove("hidden");

    this.title.innerText = `// ${name}`;
    this.frame.onload = () => {
      try {
        if (this.frame.contentDocument?.body && this.activeProfile) {
          this.frame.contentDocument.body.dataset.profile = this.activeProfile.id;
        }
      } catch (error) {
        // Ignore cross-origin or access errors.
      }
    };
    this.frame.src = `${path}/index.html`;
    window.location.hash = path;
  },

  closeModule: function () {
    this.frame.src = "about:blank";
    this.topBar.classList.add("hidden");
    this.frame.classList.add("hidden");
    this.dashboard.classList.remove("hidden");
    history.pushState("", document.title, window.location.pathname + window.location.search);
  },
};

document.addEventListener("DOMContentLoaded", () => Hub.init());
