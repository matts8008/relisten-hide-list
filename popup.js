const DEFAULT_SETTINGS = {
  enabled: true,
  hideList: [],
  maxConsecutiveSkips: 50
};

const enabled = document.getElementById("enabled");
const addInput = document.getElementById("add-input");
const addBtn = document.getElementById("add-btn");
const listEl = document.getElementById("list");
const saved = document.getElementById("saved");

let hideList = [];

function getSettings() {
  return new Promise((resolve) => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve));
}

function setSettings(partial) {
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

function flash(message) {
  saved.textContent = message;
  setTimeout(() => {
    saved.textContent = "";
  }, 1200);
}

async function persist() {
  await setSettings({ hideList });
  flash("Saved");
}

function renderList() {
  listEl.innerHTML = "";

  if (!hideList.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No words yet. Add one above.";
    listEl.appendChild(empty);
    return;
  }

  hideList.forEach((word, index) => {
    const row = document.createElement("label");
    row.className = "word" + (word.enabled ? "" : " word-off");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(word.enabled);
    checkbox.title = word.enabled ? "Active (hiding matches)" : "Reversed (not hiding)";
    checkbox.addEventListener("change", () => {
      hideList[index].enabled = checkbox.checked;
      row.classList.toggle("word-off", !checkbox.checked);
      persist();
    });

    const text = document.createElement("span");
    text.className = "word-text";
    text.textContent = word.text;
    text.title = word.text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "word-remove";
    remove.textContent = "x";
    remove.title = "Remove this word";
    remove.addEventListener("click", () => {
      hideList.splice(index, 1);
      renderList();
      persist();
    });

    row.appendChild(checkbox);
    row.appendChild(text);
    row.appendChild(remove);
    listEl.appendChild(row);
  });
}

function addWord() {
  const text = addInput.value.trim();
  addInput.value = "";
  addInput.focus();
  if (!text) return;

  const norm = normalize(text);
  if (!norm) return;

  const existing = hideList.find((w) => normalize(w.text) === norm);
  if (existing) {
    existing.enabled = true;
  } else {
    hideList.push({ text, enabled: true });
  }
  renderList();
  persist();
}

async function init() {
  const settings = await getSettings();
  enabled.checked = Boolean(settings.enabled);
  hideList = Array.isArray(settings.hideList) ? settings.hideList : [];
  renderList();

  enabled.addEventListener("change", () => {
    setSettings({ enabled: enabled.checked });
    flash("Saved");
  });

  addBtn.addEventListener("click", addWord);
  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addWord();
    }
  });

  // Reflect changes made on the page (hover Hide/Unhide) live in the popup.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.hideList) {
      hideList = Array.isArray(changes.hideList.newValue) ? changes.hideList.newValue : [];
      renderList();
    }
    if (changes.enabled) {
      enabled.checked = Boolean(changes.enabled.newValue);
    }
  });
}

init();
