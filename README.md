# Relisten Hide List

A Chrome extension that lets you **skip songs on [Relisten](https://relisten.net)**. Add words to your hide list — like `tuning`, `drums`, or `space` — and any matching song is skipped automatically. Works for **every band on Relisten** (Phish, the Grateful Dead, and thousands more), and your list **saves across every show**.

**[Website](https://matts8008.github.io/relisten-hide-list/) · [Download](https://github.com/matts8008/relisten-hide-list/releases/latest)** · Chrome Web Store: _coming soon_

## How It Works

- A `Hide` pill appears in the corner of the Relisten page.
- Click the chip to toggle the extension and manage your hide list on the page.
- You can also click the extension toolbar button to manage the same list.
- Any song whose title matches a **checked (active)** word gets skipped.
- **Uncheck** a word to reverse it — it stays in your list but stops hiding songs.
- **Remove** (`x`) a word to delete it entirely.

### Wildcards

- Plain words match anywhere: `dire` matches `Dire Wolf`.
- `*` matches any amount of text: `*rider` matches titles ending in "rider".
- `?` matches exactly one character.

### Hide / Unhide from the track list

- **Hover any track** in a show's track list to reveal a button:
  - Shown tracks get a **Hide** button — click it to add that exact song title to your hide list.
  - Hidden (struck-through) tracks get an **Unhide** button — click it to turn off the word(s) that were hiding it. The extension remembers which word did the hiding and disables it for you.

## Install For Testing

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `relisten-keyword-skipper`.
5. Open a Relisten show page, e.g. `https://relisten.net/grateful-dead/1977/05/08`.
6. The `HIDE ON` chip appears beside the player. Click it, add a word (e.g. `dire`), and matching songs will be skipped and struck through.

## Reload After Changes

If the extension was already loaded:

1. Go to `chrome://extensions`.
2. Find **Relisten Hide List**.
3. Click the circular **Reload** button on that extension card.
4. Refresh the Relisten tab.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `content.js` | Runs on Relisten: skipping, marking, hover actions, in-page panel |
| `styles.css` | Styles for the in-page chip/panel and track marks |
| `popup.html` / `popup.js` / `popup.css` | Toolbar popup for managing the hide list |
| `icons/` | 16 / 48 / 128 px toolbar and store icons |

See `STORE_LISTING.md` for the Chrome Web Store submission text and `PRIVACY.md` for the privacy policy.

## License

[MIT](LICENSE) — free to use, copy, modify, and share. No attribution required, but appreciated.
