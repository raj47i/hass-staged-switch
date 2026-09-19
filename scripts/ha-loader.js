const stamp = Date.now();
let version = stamp;
try {
  const data = await fetch(`/local/staged-switch-version.json?t=${stamp}`, {
    cache: "no-store",
  }).then((response) => response.json());
  if (data?.v) {
    version = data.v;
  }
} catch {
  // Fall back to the request time so a missing stamp still bypasses cache.
}
await import(`/local/staged-switch-card.js?v=${version}`);
