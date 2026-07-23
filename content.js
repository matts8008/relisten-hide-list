(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    // hideList: [{ text: string, enabled: boolean }]
    // A song is hidden/skipped when its title matches ANY enabled word.
    hideList: [],
    maxConsecutiveSkips: 50
  };

  const ROOT_ID = "rks-root";
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    panelOpen: false,
    lastTitle: "",
    lastHref: "",
    lastSkipAt: 0,
    skipCount: 0,
    skipTarget: "",
    skipAttemptAt: 0,
    lastMarkKey: "",
    lastListSig: "__init__",
    lastAutoStartPath: "",
    startedAt: Date.now()
  };

  function storageGet() {
    return new Promise((resolve) => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve));
  }

  function storageSet(partial) {
    return new Promise((resolve) => chrome.storage.sync.set(partial, resolve));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9*?]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function wildcardToRegExp(rawPattern) {
    const normalized = normalize(rawPattern);
    if (!normalized) return null;

    const hasWildcard = /[*?]/.test(normalized);
    const source = normalized
      .split("")
      .map((char) => {
        if (char === "*") return ".*";
        if (char === "?") return ".";
        if (char === " ") return "\\s+";
        return char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      })
      .join("");

    return new RegExp(hasWildcard ? source : `.*${source}.*`, "i");
  }

  // ---- Hide-list helpers -------------------------------------------------

  function getHideList() {
    return Array.isArray(state.settings.hideList) ? state.settings.hideList : [];
  }

  // Returns [{ word, re }] for every enabled, non-empty word.
  function getActivePatterns() {
    return getHideList()
      .map((word) => ({ word, re: word && word.enabled ? wildcardToRegExp(word.text) : null }))
      .filter((entry) => entry.re);
  }

  // A title is hidden when it matches any ENABLED word.
  function titleHidden(title) {
    if (!title) return false;
    const clean = normalize(title);
    return getActivePatterns().some((entry) => entry.re.test(clean));
  }

  // Returns the actual word objects (from hideList) responsible for hiding a title.
  function wordsHiding(title) {
    const clean = normalize(title);
    return getActivePatterns()
      .filter((entry) => entry.re.test(clean))
      .map((entry) => entry.word);
  }

  function listSignature() {
    return getHideList()
      .map((w) => `${w.enabled ? 1 : 0}:${w.text}`)
      .join("||");
  }

  async function persistHideList(list) {
    state.settings.hideList = list;
    await storageSet({ hideList: list });
    state.lastMarkKey = "";
    render();
    markTrackList(true);
  }

  function addHideWord(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return;
    const norm = normalize(text);
    if (!norm) return;

    const list = getHideList().map((w) => ({ ...w }));
    const existing = list.find((w) => normalize(w.text) === norm);
    if (existing) {
      existing.enabled = true; // re-enable a matching word instead of duplicating
    } else {
      list.push({ text, enabled: true });
    }
    persistHideList(list);
  }

  function setWordEnabled(index, enabled) {
    const list = getHideList().map((w) => ({ ...w }));
    if (!list[index]) return;
    list[index].enabled = Boolean(enabled);
    persistHideList(list);
  }

  function removeWord(index) {
    const list = getHideList().map((w) => ({ ...w }));
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    persistHideList(list);
  }

  // Disable every enabled word that currently matches this title, so it un-hides.
  function unhideTitle(title) {
    const clean = normalize(title);
    let changed = 0;
    const list = getHideList().map((w) => {
      if (w && w.enabled) {
        const re = wildcardToRegExp(w.text);
        if (re && re.test(clean)) {
          changed += 1;
          return { ...w, enabled: false };
        }
      }
      return { ...w };
    });
    if (changed) persistHideList(list);
    return changed;
  }

  // ---- Player / DOM ------------------------------------------------------

  function getPlayer() {
    return document.querySelector(".song-title")?.closest(".content") || null;
  }

  function getCurrentTitle() {
    // Relisten renders the active track title in `.song-title` (player bar).
    const title = document.querySelector(".song-title")?.textContent?.trim();
    return title || "";
  }

  function getNextButton() {
    // Relisten's player "next" control is a lucide FastForwardIcon <svg> that
    // calls player.next(); it has no aria-label/title. It lives in the
    // right-hand `.timing.duration` block (the rewind icon is the left `.timing`).
    return (
      document.querySelector('svg[class*="fast-forward" i]') ||
      document.querySelector(".timing.duration svg") ||
      document.querySelector('[aria-label*="next" i]') ||
      null
    );
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // ---- In-page UI --------------------------------------------------------

  function ensureUi() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button id="rks-chip" class="rks-chip" type="button" aria-label="Relisten Hide List">
        <span class="rks-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="13" height="13">
            <polygon class="rks-glyph-tri" points="4,5 11,12 4,19"></polygon>
            <polygon class="rks-glyph-tri" points="11,5 18,12 11,19"></polygon>
            <rect class="rks-glyph-bar" x="18.4" y="5" width="2.4" height="14"></rect>
          </svg>
        </span>
        <span class="rks-chip-text">Hide</span>
        <span class="rks-dot"></span>
      </button>
      <div id="rks-panel" class="rks-panel" hidden>
        <div class="rks-panel-header">
          <strong>Hide List</strong>
          <button class="rks-close" type="button" aria-label="Close">x</button>
        </div>
        <label class="rks-toggle">
          <input class="rks-enabled" type="checkbox">
          <span>Enabled on Relisten</span>
        </label>
        <div class="rks-add">
          <input class="rks-add-input" type="text" placeholder="Add a word to hide (e.g. dire)" spellcheck="false">
          <button class="rks-add-btn" type="button">Add</button>
        </div>
        <div class="rks-list"></div>
        <div class="rks-help">Any song whose title matches a checked word is skipped. Uncheck to reverse a word without deleting it. Plain words match anywhere; use <code>*</code> and <code>?</code> as wildcards. Hover a track to Hide or Unhide it.</div>
        <div class="rks-status"></div>
      </div>
    `;

    root.querySelector(".rks-chip").addEventListener("click", () => {
      state.panelOpen = !state.panelOpen;
      render();
    });

    root.querySelector(".rks-close").addEventListener("click", () => {
      state.panelOpen = false;
      render();
    });

    root.querySelector(".rks-enabled").addEventListener("change", async (event) => {
      state.settings.enabled = event.target.checked;
      await storageSet({ enabled: state.settings.enabled });
      render();
      markTrackList(true);
    });

    const addInput = root.querySelector(".rks-add-input");
    const addBtn = root.querySelector(".rks-add-btn");
    const commitAdd = () => {
      const value = addInput.value;
      addInput.value = "";
      addInput.focus();
      addHideWord(value);
    };
    addBtn.addEventListener("click", commitAdd);
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitAdd();
      }
    });

    // Event delegation for the word rows (checkbox toggle + remove).
    const list = root.querySelector(".rks-list");
    list.addEventListener("change", (event) => {
      const checkbox = event.target.closest(".rks-word-enabled");
      if (!checkbox) return;
      const index = Number(checkbox.dataset.index);
      setWordEnabled(index, checkbox.checked);
    });
    list.addEventListener("click", (event) => {
      const remove = event.target.closest(".rks-word-remove");
      if (!remove) return;
      removeWord(Number(remove.dataset.index));
    });

    document.documentElement.appendChild(root);
    return root;
  }

  function buildListRows(container) {
    const words = getHideList();
    container.innerHTML = "";

    if (!words.length) {
      const empty = document.createElement("div");
      empty.className = "rks-empty";
      empty.textContent = "No words yet. Add one above, or hover a track and click Hide.";
      container.appendChild(empty);
      return;
    }

    words.forEach((word, index) => {
      const row = document.createElement("label");
      row.className = "rks-word" + (word.enabled ? "" : " rks-word-off");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "rks-word-enabled";
      checkbox.dataset.index = String(index);
      checkbox.checked = Boolean(word.enabled);
      checkbox.title = word.enabled ? "Active (hiding matches)" : "Reversed (not hiding)";

      const text = document.createElement("span");
      text.className = "rks-word-text";
      text.textContent = word.text;
      text.title = word.text;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "rks-word-remove";
      remove.dataset.index = String(index);
      remove.textContent = "x";
      remove.title = "Remove this word";

      row.appendChild(checkbox);
      row.appendChild(text);
      row.appendChild(remove);
      container.appendChild(row);
    });
  }

  function positionUi(root) {
    // Docked to the bottom-right corner via CSS so it never overlaps
    // Relisten's top navigation. Clear any legacy inline positioning.
    root.classList.remove("rks-floating");
    root.style.top = "";
    root.style.left = "";
    root.style.right = "";
    root.style.bottom = "";
  }

  function render() {
    const root = ensureUi();
    positionUi(root);

    const chip = root.querySelector(".rks-chip");
    const panel = root.querySelector(".rks-panel");
    const enabled = root.querySelector(".rks-enabled");
    const listEl = root.querySelector(".rks-list");
    const status = root.querySelector(".rks-status");
    const title = getCurrentTitle();
    const hidden = title ? titleHidden(title) : false;

    chip.classList.toggle("rks-on", Boolean(state.settings.enabled));
    chip.classList.toggle("rks-off", !state.settings.enabled);
    chip.classList.toggle("rks-skip", Boolean(state.settings.enabled && title && hidden));
    chip.querySelector(".rks-chip-text").textContent = state.settings.enabled ? "Hide On" : "Hide Off";

    panel.hidden = !state.panelOpen;
    enabled.checked = Boolean(state.settings.enabled);

    // Rebuild the word rows only when the list actually changed (avoids churn/focus loss).
    const sig = listSignature();
    if (sig !== state.lastListSig) {
      state.lastListSig = sig;
      buildListRows(listEl);
    }

    if (!state.settings.enabled) {
      status.textContent = "Disabled.";
    } else if (!title) {
      status.textContent = "Waiting for playback. Track list marking still works.";
    } else if (hidden) {
      status.textContent = `Hiding: ${title}`;
    } else {
      status.textContent = `Playing: ${title}`;
    }
  }

  // ---- Skipping ----------------------------------------------------------

  function clickNext() {
    const button = getNextButton();
    if (!button) return false;
    // React binds onClick on the svg via root delegation, so a bubbling click
    // on the icon triggers player.next().
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  // Find the currently-playing track's position in the setlist column.
  function activeTrackIndex(links) {
    const active = normalize(getCurrentTitle());
    if (!active) return -1;
    return links.findIndex((link) => normalize(getTitleFromLink(link)) === active);
  }

  // Jump straight to the next NON-hidden track in the column. This skips a whole
  // run of hidden tracks in one hop, so Relisten only has to load the keeper
  // (instead of buffering each hidden track on the way). Returns true if it acted.
  function skipViaColumn() {
    const links = getSongLinks();
    if (!links.length) return false;

    const idx = activeTrackIndex(links);
    if (idx < 0) return false;

    for (let i = idx + 1; i < links.length; i += 1) {
      const title = getTitleFromLink(links[i]);
      if (title && !titleHidden(title)) {
        links[i].click();
        return true;
      }
    }
    return false;
  }

  function maybeSkipCurrentTrack() {
    if (!state.settings.enabled) return;

    const title = getCurrentTitle();
    if (!title) return;

    if (!titleHidden(title)) {
      // Landed on a keeper — clear skip state.
      state.skipTarget = "";
      state.skipCount = 0;
      return;
    }

    const now = Date.now();

    // Global rate limit between skip actions.
    if (now - state.lastSkipAt < 700) return;

    // Retry guard: if we already tried to skip THIS exact hidden track, wait a
    // beat before trying again. This is what makes loading tracks work — the
    // first click can be swallowed while buffering, so we retry until it takes,
    // but we don't spam a click that already landed.
    if (title === state.skipTarget && now - state.skipAttemptAt < 1500) return;

    if (state.skipCount >= Number(state.settings.maxConsecutiveSkips || DEFAULT_SETTINGS.maxConsecutiveSkips)) {
      return;
    }

    state.skipTarget = title;
    state.skipAttemptAt = now;

    // Prefer the direct column jump; fall back to the player's next button.
    const acted = skipViaColumn() || clickNext();
    if (acted) {
      state.lastSkipAt = now;
      state.skipCount += 1;
    }
  }

  // ---- Track-list marking ------------------------------------------------

  function getShowPathMatch() {
    return location.pathname.match(/^\/([^/]+)\/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/([^/?#]+))?\/?$/);
  }

  function isBareShowPage() {
    const match = getShowPathMatch();
    return Boolean(match && !match[5]);
  }

  function getSongLinks() {
    const showPath = getShowPathMatch();
    if (!showPath) return [];

    const prefix = `/${showPath[1]}/${showPath[2]}/${showPath[3]}/${showPath[4]}/`;
    return Array.from(document.querySelectorAll(`a[href^="${prefix.replace(/"/g, '\\"')}"]`))
      .filter((link) => {
        if (link.closest(`#${ROOT_ID}`)) return false;
        const text = link.innerText || link.textContent || "";
        return /\d{1,2}:\d{2}/.test(text);
      })
      .slice(0, 80);
  }

  function getTitleFromLink(link) {
    const lines = (link.innerText || link.textContent || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const durationIndex = lines.findIndex((line) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(line));
    return durationIndex > 0 ? lines[durationIndex - 1] : lines[0] || "";
  }

  function clearTrackListMarks() {
    document.querySelectorAll(".rks-track-hide, .rks-track-match").forEach((el) => {
      el.classList.remove("rks-track-hide", "rks-track-match");
      el.querySelectorAll(":scope > .rks-track-badge, :scope > .rks-track-action").forEach((node) => node.remove());
    });
  }

  function addTrackAction(link, title, hidden) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "rks-track-action " + (hidden ? "rks-unhide" : "rks-hide");
    action.textContent = hidden ? "Unhide" : "Hide";
    action.title = hidden
      ? "Unhide this song (turns off the word that hid it)"
      : `Hide this song: ${title}`;

    // Keep clicks off the Relisten link itself.
    action.addEventListener("mousedown", stopEvent);
    action.addEventListener("click", (event) => {
      stopEvent(event);
      if (hidden) {
        unhideTitle(title);
      } else {
        addHideWord(title);
      }
    });

    link.appendChild(action);
  }

  function markTrackList(force = false) {
    if (Date.now() - state.startedAt < 1500 && !force) return;

    const links = getSongLinks();
    const markKey = [
      location.href,
      state.settings.enabled ? "on" : "off",
      listSignature(),
      links.length,
      links.map((link) => link.getAttribute("href")).join("|")
    ].join("::");

    if (!force && markKey === state.lastMarkKey) return;
    state.lastMarkKey = markKey;

    clearTrackListMarks();

    for (const link of links) {
      const title = getTitleFromLink(link);
      if (!title) continue;

      const hidden = state.settings.enabled && titleHidden(title);
      link.classList.add(hidden ? "rks-track-hide" : "rks-track-match");

      // Hover action only: Unhide (hidden tracks) / Hide (shown tracks).
      // The strikethrough itself marks a hidden track, so no separate badge.
      addTrackAction(link, title, hidden);
    }
  }

  function clickFirstAllowedTrackOnBareShow() {
    if (!state.settings.enabled || !isBareShowPage()) return;
    if (state.lastAutoStartPath === location.pathname) return;

    const links = getSongLinks();
    if (!links.length) return;

    const firstAllowed = links.find((link) => !titleHidden(getTitleFromLink(link)));
    if (!firstAllowed) return;

    state.lastAutoStartPath = location.pathname;
    firstAllowed.click();
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  async function init() {
    state.settings = { ...DEFAULT_SETTINGS, ...(await storageGet()) };
    if (!Array.isArray(state.settings.hideList)) state.settings.hideList = [];
    render();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (changes[key]) state.settings[key] = changes[key].newValue;
      }
      if (!Array.isArray(state.settings.hideList)) state.settings.hideList = [];
      state.lastMarkKey = "";
      render();
      markTrackList(true);
    });

    // Fast lane: react to track changes quickly so a hidden track is skipped
    // before much of it plays. Cheap (reads the title, maybe one click).
    setInterval(() => {
      if (!isBareShowPage()) maybeSkipCurrentTrack();
    }, 600);

    // Slow lane: UI, track-list marking, and auto-start on bare show pages.
    setInterval(() => {
      render();
      markTrackList();
      clickFirstAllowedTrackOnBareShow();
    }, 1500);

    window.addEventListener("resize", render);
    window.addEventListener("scroll", debounce(render, 100), true);
  }

  init();
})();
