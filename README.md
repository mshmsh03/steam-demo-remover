# Steam Demo Remover

A browser console script that finds and removes **every demo license** from your Steam account — automatically, across all pages of your license list, no matter how many thousands you have.

## Why?

Steam has no bulk-remove option. If your account has accumulated hundreds or thousands of demos, removing them means clicking "Remove" one by one on [your licenses page](https://store.steampowered.com/account/licenses/). This script does it all for you, and it handles the two things that break naive scripts:

- **Pagination** — Steam shows only 100 licenses per page, and its pagination tokens only work for real page navigations. The script drives a small popup window through every page like a real user to collect all demos.
- **Rate limiting** — Steam only allows a small batch of removals at a time (error `84`). The script waits out each cooldown and resumes automatically, for as long as it takes.
- **Session expiry** — on long runs Steam's session token can go stale mid-run (error `21`). The script silently re-fetches a fresh token and keeps going, instead of dying.
- **Already-removed items** — if an item was already removed (by an earlier run, or elsewhere) Steam returns error `29` ("duplicate request") instead of success. The script recognizes this as *done* and moves on immediately, instead of getting stuck retrying something that's already gone.

## Safety

- Only removes licenses whose title contains the **whole word "Demo"** — it will never match games like *Demon Slayer* or *Demolition Derby*.
- Only touches **free licenses** (rows with a Remove link). Paid games don't have one, so they can never be selected.
- Shows a **confirmation popup** listing what will be removed before anything is deleted — one click, once per run.
- Progress is saved to `localStorage` after **every single removal**, so an interruption never loses progress.

> Note: removing a demo license is permanent, but demos are free — you can always add them back from their store page.

## Usage

1. **One-time setup:** allow popups for `store.steampowered.com`
   (Chrome/Brave: `chrome://settings/content/popups` → add to "Allowed", or click the blocked-popup icon in the address bar when prompted).
2. Log into Steam in your browser and go to
   `https://store.steampowered.com/account/licenses/`
3. Open the developer console (`F12` → **Console** tab).
4. Paste the entire contents of [`steam-demo-remover.js`](steam-demo-remover.js) and press **Enter**.
5. A small popup opens and walks through all your license pages collecting demos (~100 licenses per page — a big account takes 15–25 minutes). **Don't touch the popup.**
6. Click **OK** on the confirmation dialog.
7. Leave the tab open. That's it — the script removes demos, waits out every rate limit, and logs progress with timestamps.

### While it runs

- Keep the tab open (refreshing kills the script — but you can just paste it again to resume).
- Don't let your PC sleep (screen off is fine).
- Watch progress in the console: `✅ Removed (123 done, 456 left): ...`

### Controls

| Action | Command (in console) |
|---|---|
| Stop the script | `stopDemoRemoval = true` |
| See the remaining queue | `console.table(JSON.parse(localStorage.getItem('demoRemovalQueue')))` |
| Force a fresh rescan | `localStorage.removeItem('demoRemovalQueue')` then paste the script again |

### Configuration

Tweak the constants at the top of the script:

| Constant | Default | Meaning |
|---|---|---|
| `RETRY_MINUTES` | `1` | How often to re-check when Steam rate-limits removals. Steam frees roughly one removal slot every ~10 minutes; checking every minute grabs each slot as soon as it opens and catches any faster windows Steam occasionally allows. |
| `REMOVE_DELAY_MS` | `3000` | Pause between individual removals |
| `PAGE_SETTLE_MS` | `800` | Pause after each page load during the scan |

## How it works

1. **Scan** — opens a popup on the licenses page and clicks Steam's real *Next* link page after page (direct URL fetches get redirected — Steam requires genuine navigations with the right referrer). On each page it parses the `RemoveFreeLicense(packageid, base64Name)` links, base64-decodes the names, and keeps only whole-word "Demo" titles.
2. **Confirm** — shows the count and a sample of names; nothing is removed until you click OK.
3. **Remove** — POSTs each package to Steam's own `account/removelicense` endpoint with your session ID, and reads the numeric `success` code it returns:
   - `1` → removed. Next item.
   - `84` → genuinely rate-limited. Wait, then retry the *same* item.
   - `29` → "duplicate request" — this item was already removed (by an earlier run, or otherwise). Counted as done, no wait, move on immediately.
   - `21` → session token expired. Silently fetch a fresh token and retry the same item.
   - anything else → unknown error. The item is moved to the back of the queue and retried later (never dropped), with a running tally of error codes logged to the console.

## Troubleshooting

- **"Popup blocked"** — allow popups for `store.steampowered.com` and paste the script again.
- **Scan keeps restarting** — Steam's pagination tokens expire quickly; the script retries up to 5 times. Check your connection and rerun.
- **Rate-limited forever (`⏳ Rate-limited (code 84)`)** — normal. Steam's sustained limit varies over time — sometimes roughly one removal per 10 minutes, sometimes bursts of dozens per hour. Hundreds of demos may take days; tens of thousands can take months at the slow end. The script is built for exactly this — leave it running, or stop and resume whenever you like (progress is never lost).
- **Lots of `✅ Already removed previously` lines** — expected right after resuming a queue that's been running a while, or after a rescan. It just means Steam confirms those licenses are already gone; the script is clearing stale entries, not doing new work. It should give way to genuine new removals shortly after.
- **Repeating `❌ Error N` lines** (any code other than 1, 21, 29, 84) — Steam refused those removals with error code `N`; the script keeps them in the queue and retries automatically. If a code repeats endlessly and nothing else is progressing, refresh the page, confirm you're still logged in, and paste the script again.
- **`🔒 You are logged out of Steam`** — the script detected your session is gone rather than just stale. Log back in and paste the script again; it resumes from where it stopped.
- **Massive accounts** — if you have tens of thousands of demos, consider also asking [Steam Support](https://help.steampowered.com) to bulk-remove them; they have tools users don't. The script can keep running in the meantime — nothing is lost by doing both.

## Disclaimer

Not affiliated with Valve. Uses the same endpoint as the Remove button on Steam's own licenses page, on your own account, at a throttled pace. Use at your own risk.

## License

MIT
