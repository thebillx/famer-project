from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "tools/cinematic/blender/runtime_art_transfer.py"


def load_transfer_module():
    bpy = types.ModuleType("bpy")
    mathutils = types.ModuleType("mathutils")
    mathutils.Vector = object
    spec = importlib.util.spec_from_file_location("agriscope_runtime_art_transfer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"bpy": bpy, "mathutils": mathutils}):
        spec.loader.exec_module(module)
    return module


TRANSFER = load_transfer_module()
TRANSFER_ENV = {
    "AGRISCOPE_RUNTIME_TRANSFER_VARIANT",
    "AGRISCOPE_RUNTIME_TRANSFER_SOURCE",
    "AGRISCOPE_RUNTIME_TRANSFER_MASTER",
    "AGRISCOPE_RUNTIME_TRANSFER_EVIDENCE",
    "AGRISCOPE_RUNTIME_TRANSFER_RUNTIME",
    "AGRISCOPE_RUNTIME_TRANSFER_OVERWRITE",
}


def parse_with(argv: list[str], env: dict[str, str] | None = None):
    clean_env = {key: value for key, value in os.environ.items() if key not in TRANSFER_ENV}
    clean_env.update(env or {})
    with patch.dict(os.environ, clean_env, clear=True), patch.object(sys, "argv", ["blender", "--", *argv]):
        return TRANSFER.parse_args()


class RuntimeTransferArgumentTests(unittest.TestCase):
    def test_default_variant_uses_regional_output(self):
        *_, runtime, variant, overwrite = parse_with([])
        self.assertEqual(variant, "regional")
        self.assertEqual(runtime.name, "scene4-regional.mesh.json")
        self.assertFalse(overwrite)

    def test_environment_hero_uses_hero_output(self):
        *_, runtime, variant, _ = parse_with([], {"AGRISCOPE_RUNTIME_TRANSFER_VARIANT": "hero"})
        self.assertEqual(variant, "hero")
        self.assertEqual(runtime.name, "scene4-hero.mesh.json")

    def test_cli_variant_is_resolved_before_default_output(self):
        *_, runtime, variant, _ = parse_with(
            ["--variant=hero"],
            {"AGRISCOPE_RUNTIME_TRANSFER_VARIANT": "regional"},
        )
        self.assertEqual(variant, "hero")
        self.assertEqual(runtime.name, "scene4-hero.mesh.json")

    def test_explicit_runtime_override_precedence(self):
        *_, runtime, variant, _ = parse_with(
            ["--variant=hero"],
            {"AGRISCOPE_RUNTIME_TRANSFER_RUNTIME": "/tmp/env-runtime.mesh.json"},
        )
        self.assertEqual(variant, "hero")
        self.assertEqual(runtime, Path("/tmp/env-runtime.mesh.json"))

        *_, runtime, variant, _ = parse_with(
            ["--variant=hero", "--runtime=/tmp/cli-runtime.mesh.json"],
            {"AGRISCOPE_RUNTIME_TRANSFER_RUNTIME": "/tmp/env-runtime.mesh.json"},
        )
        self.assertEqual(variant, "hero")
        self.assertEqual(runtime, Path("/tmp/cli-runtime.mesh.json"))


if __name__ == "__main__":
    unittest.main()
