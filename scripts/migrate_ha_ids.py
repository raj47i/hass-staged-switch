#!/usr/bin/env python3
"""Rewrite Lovelace card types and resource URLs. Does not touch HA scenes."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/config")
STORAGE = ROOT / ".storage"

# Longer / more specific tokens first. Do not rewrite scene.ssl_ / sst_ / ssm_ / sla_.
REPLACEMENTS = [
    ("custom:staged-lights-mini-card", "custom:scene-studio-room-lights-mini-card"),
    ("custom:staged-lights-card", "custom:scene-studio-room-lights-card"),
    ("custom:staged-switch-card", "custom:scene-studio-room-switches-card"),
    ("/local/staged-switch-loader.js", "/local/scene-studio-loader.js"),
    ("/local/staged-switch-version.json", "/local/scene-studio-version.json"),
    ("/local/staged-switch-card.js", "/local/hass-scene-studio.js"),
    (
        "/hacsfiles/hass-staged-switch/staged-switch-card.js",
        "/hacsfiles/hass-staged-switch/hass-scene-studio.js",
    ),
]

SKIP_NAMES = {
    "scene",
    "core.restore_state",
    "core.entity_registry",
    "core.device_registry",
    "auth",
    "auth_provider.homeassistant",
}


def rewrite_text(text: str) -> str:
    next_text = text
    for old, new in REPLACEMENTS:
        next_text = next_text.replace(old, new)
    return next_text


def should_skip_storage(path: Path) -> bool:
    name = path.name
    if name in SKIP_NAMES or name.startswith("scene."):
        return True
    return False


def rewrite_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = rewrite_text(original)
    if updated == original:
        return False
    backup = path.with_suffix(path.suffix + ".pre-scene-studio")
    if not backup.exists():
        shutil.copy2(path, backup)
    if path.name.startswith("lovelace") or path.suffix == ".json":
        json.loads(updated)
    path.write_text(updated, encoding="utf-8")
    return True


def collect_targets() -> list[Path]:
    targets: list[Path] = []
    if STORAGE.is_dir():
        for path in STORAGE.iterdir():
            if not path.is_file() or should_skip_storage(path):
                continue
            name = path.name
            if name.startswith("lovelace"):
                targets.append(path)
    skip_yaml_parts = {".storage", "deps", "custom_components", "esphome"}
    for path in ROOT.rglob("*.yaml"):
        if path.name == "secrets.yaml" or skip_yaml_parts.intersection(path.parts):
            continue
        targets.append(path)
    return targets


def main() -> int:
    changed = []
    for path in collect_targets():
        try:
            if rewrite_file(path):
                changed.append(str(path))
        except Exception as error:
            print(f"skip {path}: {error}", file=sys.stderr)
    if not changed:
        print("No Lovelace card types or resource URLs needed rewriting.")
        return 0
    print("Updated:")
    for path in changed:
        print(f"  {path}")
    print("Home Assistant scene entities were not changed.")
    print("Reload Lovelace (or restart Home Assistant) after this.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
