const stamp = Date.now();
let version = stamp;
for (const file of [
  "/local/scene-studio-version.json",
  "/local/staged-switch-version.json",
]) {
  try {
    const data = await fetch(`${file}?t=${stamp}`, { cache: "no-store" }).then(
      (response) => response.json(),
    );
    if (data?.v) {
      version = data.v;
      break;
    }
  } catch {
    // Try the next stamp file, then fall back to the request time.
  }
}
let loaded = false;
for (const file of [
  "/local/hass-scene-studio.js",
  "/local/staged-switch-card.js",
]) {
  try {
    await import(`${file}?v=${version}`);
    loaded = true;
    break;
  } catch {
    // Keep the old filename working until Lovelace resources are migrated.
  }
}
if (!loaded) {
  throw new Error("Hass Scene Studio bundle not found under /local");
}
