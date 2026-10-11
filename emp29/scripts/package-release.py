#!/usr/bin/env python3
"""Create the corresponding-source download and a self-contained EMP29 release."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

PROJECT = Path(__file__).resolve().parents[2]
APP = PROJECT / "emp29"
SKIP_DIRS = {".git", "node_modules", "target", ".rust-target", "__pycache__", ".cache", "coverage"}


def files(source_only=False):
    for folder, dirs, names in os.walk(PROJECT):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not (source_only and d == "dist"))
        for name in sorted(names):
            path = Path(folder) / name
            if path.is_symlink():
                raise ValueError(f"Unexpected symlink: {path.relative_to(PROJECT)}")
            if ((name.startswith(".env") and name != ".env.example")
                    or name.endswith((".log", ".tmp", ".zip")) and path != APP / "dist/source.zip"
                    or name == ".DS_Store"):
                continue
            yield path, path.relative_to(PROJECT)


def archive(destination, source_only, prefix):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for path, relative in files(source_only):
                if path in {destination, temporary}:
                    continue
                z.write(path, (Path(prefix) / relative).as_posix())
        with zipfile.ZipFile(temporary) as z:
            if z.testzip():
                raise ValueError("ZIP integrity check failed")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(PROJECT):
        raise ValueError("Release output must be outside the source project")
    build = json.loads((APP / "dist/build.json").read_text())
    expected = json.loads((APP / "vendor/provenance.json").read_text())
    wasm = APP / ("dist" + build["runtime"]["wasm"])
    if hashlib.sha256(wasm.read_bytes()).hexdigest() != expected["sha256"]:
        raise ValueError("Built WASM does not match provenance; rebuild or update provenance")
    source = APP / "dist/source.zip"
    archive(source, True, "EMP29_Scramjet")
    archive(output, False, "EMP29_Scramjet")
    print(json.dumps({"release": str(output), "bytes": output.stat().st_size,
                      "sourceBytes": source.stat().st_size,
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
