// Steam: auto-remove ALL demo licenses (works with Steam's paginated license list)
//
// ONE-TIME SETUP: allow popups for store.steampowered.com
//   Brave/Chrome: go to  brave://settings/content/popups  (or chrome://settings/content/popups)
//   and add store.steampowered.com to "Allowed", OR click the blocked-popup
//   icon in the address bar after the script complains, choose "Always allow".
//
// HOW TO USE:
// 1. Log into Steam, go to https://store.steampowered.com/account/licenses/
// 2. Open console (F12 -> Console), paste this whole script, press Enter
// 3. A small popup window opens and walks through all license pages (~460 pages,
//    15-25 min). DON'T touch the popup. Then click OK on the confirmation and
//    leave the tab open — it removes demos, waiting out rate limits automatically.
// 4. Progress is saved. If anything closes, paste the script again to resume
//    (the scan is NOT repeated once complete).
//    To stop: run  stopDemoRemoval = true
//    To force a fresh rescan: run  localStorage.removeItem('demoRemovalQueue')

(async () => {
  window.stopDemoRemoval = false;

  const RETRY_MINUTES = 10;      // wait when rate-limited
  const REMOVE_DELAY_MS = 3000;  // pause between removals
  const PAGE_SETTLE_MS = 800;    // pause after each popup page load
  const QUEUE_KEY = 'demoRemovalQueue';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

  // STRICT filter: only rows with a RemoveFreeLicense link AND the whole word
  // "Demo" in the name (never "Demon", "Demolition", etc.). Paid licenses have
  // no Remove link, so they can never be selected.
  // Note: Steam base64-encodes the name inside the RemoveFreeLicense link.
  const b64decode = s => {
    try { return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); }
    catch (e) { return null; }
  };
  const extractDemos = doc => [...doc.querySelectorAll('.account_table tr')].map(row => {
    const a = row.querySelector('a[href*="RemoveFreeLicense"], a[onclick*="RemoveFreeLicense"]');
    if (!a) return null;
    const src = (a.getAttribute('href') || '') + (a.getAttribute('onclick') || '');
    const m = src.match(/RemoveFreeLicense\(\s*(\d+)\s*,\s*["']([^"']*)["']/) ||
              src.match(/RemoveFreeLicense\(\s*(\d+)/);
    if (!m) return null;
    const name = (m[2] && b64decode(m[2])) ||
                 row.textContent.replace(/\s+/g, ' ').replace('Remove', '').trim();
    if (!/\bdemo\b/i.test(name)) return null;
    return { packageid: m[1], name };
  }).filter(Boolean);

  const waitForPage = async (w, prevMarker) => {
    for (let i = 0; i < 60; i++) {   // up to 30s
      await sleep(500);
      if (w.closed) return 'closed';
      try {
        if (w.document.readyState === 'complete') {
          if (w.location.pathname === '/') return 'redirected';
          if (w.location.pathname.includes('/account/licenses')) {
            const marker = w.document.body.textContent.match(/Showing licenses [\d,]+-[\d,]+/)?.[0] || '';
            if (marker && marker !== prevMarker) return 'ok';
          }
        }
      } catch (e) { /* mid-navigation; keep polling */ }
    }
    return 'timeout';
  };

  // ---- PHASE 1: scan all pages via popup (or resume saved queue) ----
  let demos = null;
  const saved = localStorage.getItem(QUEUE_KEY);
  if (saved) {
    try { demos = JSON.parse(saved); } catch (e) {}
    if (demos && demos.length) log(`Resuming saved queue: ${demos.length} demo(s) left. (Run localStorage.removeItem('${QUEUE_KEY}') for a fresh rescan.)`);
    else demos = null;
  }

  if (!demos) {
    const found = new Map();
    let attempt = 0;
    scan: while (true) {
      attempt++;
      if (attempt > 5) return log('❌ Scan failed 5 times — check your connection and rerun the script.');
      const w = window.open('https://store.steampowered.com/account/licenses/', 'demoScanWin', 'width=600,height=500');
      if (!w) {
        alert('Popup blocked!\n\nAllow popups for store.steampowered.com\n(brave://settings/content/popups or the popup icon in the address bar),\nthen paste the script again.');
        return log('❌ Popup blocked. Allow popups for store.steampowered.com, then rerun.');
      }
      log(`Scanning license pages in the popup (attempt ${attempt}). Do not touch the popup window...`);
      let page = 0, marker = '';
      while (true) {
        if (window.stopDemoRemoval) { w.close(); return log('Stopped by user during scan.'); }
        const state = await waitForPage(w, marker);
        if (state === 'closed') { log('⚠️ Popup was closed — reopening and rescanning (already-found demos are kept)...'); continue scan; }
        if (state === 'redirected' || state === 'timeout') {
          log(`⚠️ Page ${page + 1} ${state} — restarting scan from page 1 (progress kept, duplicates skipped)...`);
          w.close(); await sleep(2000); continue scan;
        }
        page++;
        marker = w.document.body.textContent.match(/Showing licenses [\d,]+-[\d,]+/)?.[0] || '';
        for (const d of extractDemos(w.document)) found.set(d.packageid, d);
        if (page % 10 === 0) log(`  ${marker || page + ' pages'} — ${found.size} demos found so far`);
        // Click the real Next link inside the popup — Steam rejects direct URL
        // navigation of these token links (redirects to homepage), but accepts
        // a genuine link click with the right referrer.
        const nextA = [...w.document.querySelectorAll('a')].find(x => x.textContent.trim() === 'Next');
        if (!nextA) { w.close(); break scan; }   // last page reached
        await sleep(PAGE_SETTLE_MS);
        try { nextA.click(); } catch (e) { w.close(); continue scan; }
      }
    }
    demos = [...found.values()];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(demos));
    log(`Scan complete: ${demos.length} demo license(s) found.`);
  }

  if (!demos.length) {
    localStorage.removeItem(QUEUE_KEY);
    return log('No removable demo licenses found. Done!');
  }

  // ---- Confirmation ----
  const preview = demos.slice(0, 15).map(d => '  • ' + d.name).join('\n');
  const more = demos.length > 15 ? `\n  ...and ${demos.length - 15} more` : '';
  if (!confirm(`${demos.length} DEMO licenses will be removed. Examples:\n\n${preview}${more}\n\nOnly titles containing the word "Demo" — nothing else. Proceed?`)) {
    return log('Cancelled — nothing was removed. Queue kept; rerun the script to continue.');
  }
  log(`Full list: console.table(JSON.parse(localStorage.getItem('${QUEUE_KEY}')))`);

  // ---- PHASE 2: remove with rate-limit backoff ----
  const remove = d =>
    fetch('https://store.steampowered.com/account/removelicense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `sessionid=${encodeURIComponent(g_sessionID)}&packageid=${d.packageid}`,
      credentials: 'include'
    }).then(r => r.json()).catch(() => ({ success: -1 }));

  let removed = 0, failed = [];
  while (demos.length) {
    if (window.stopDemoRemoval) return log(`Stopped. ${removed} removed this run, ${demos.length} left (saved — rerun to resume).`);
    const d = demos[0];
    const res = await remove(d);
    if (res.success === 1) {
      demos.shift(); removed++;
      localStorage.setItem(QUEUE_KEY, JSON.stringify(demos));
      log(`✅ Removed (${removed} done, ${demos.length} left):`, d.name);
      await sleep(REMOVE_DELAY_MS);
    } else if (res.success === 84) {
      log(`⏳ Rate-limited. ${removed} removed this run, ${demos.length} left. Waiting ${RETRY_MINUTES} min...`);
      await sleep(RETRY_MINUTES * 60 * 1000);
    } else {
      demos.shift(); failed.push(d);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(demos));
      log('❌ Failed (skipped):', d.name, res);
      await sleep(REMOVE_DELAY_MS);
    }
  }

  localStorage.removeItem(QUEUE_KEY);
  log(`🎉 Finished. ${removed} demos removed this run.`);
  if (failed.length) {
    log(`⚠️ ${failed.length} failed — listed below. Rerun the script later to retry them (a rescan will find them again).`);
    console.table(failed);
  }
})();
