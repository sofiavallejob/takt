// Anonymous visit counting with GoatCounter (no cookies, nothing personal):
// the page view is counted by the script in index.html; these are the few
// things worth knowing beyond it, as GoatCounter "events". If the script is
// blocked or has not loaded, nothing happens.

export function track(path, title = path) {
  try { window.goatcounter?.count?.({ path, title, event: true }); } catch { /* never let counting break the page */ }
}
