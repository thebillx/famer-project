"""Build compact Scene 4 regional or Hero Field runtime derivatives.

This script is intentionally separate from build_assets.py. It reads the
SHA-bound Scene 4 authoring copy, duplicates only the regional forms into a
review collection, applies fixed decimation ratios to those duplicates, and
exports the existing mesh-assets.js schema=1 container. The source blend and
its Hero/NDVI registration remain in the saved editable copy.

Run in Blender 4.5.3 background mode, for example:

    blender --background --python tools/cinematic/blender/runtime_art_transfer.py

Set AGRISCOPE_RUNTIME_TRANSFER_VARIANT=hero together with fresh evidence and
runtime paths to export the bounded 08_EXPORT Hero Field derivative. The
default remains the existing regional export for backwards compatibility.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
from typing import Any

import bpy
from mathutils import Vector


MASTER_SHA256 = "5ef375387e51165c45e41f08db19c737b40709207e80a901443c3e35bd9f35c5"
BLENDER_BINARY = "/Users/bill/Tools/blender-4.5.3/Blender.app/Contents/MacOS/Blender"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MASTER = Path(
    "/Users/bill/final-project-cinematic-refinement-evidence/"
    "20261022-scene4-establishing/fresh-extracted/"
    "AgriScope-Scene4-Establishing.blend"
)
DEFAULT_AUTHORING = Path(
    "/Users/bill/final-project-cinematic-refinement-evidence/"
    "20261023-runtime-art-transfer/authoring/AgriScope-Runtime-Art-Transfer.blend"
)
DEFAULT_EVIDENCE = Path(
    "/Users/bill/final-project-cinematic-refinement-evidence/"
    "20261023-runtime-art-transfer"
)

RUNTIME_COLLECTIONS = {
    "regional": "RUNTIME_ART_TRANSFER · Scene 4 regional",
    "hero": "RUNTIME_ART_TRANSFER · Scene 4 Hero Field",
}
REGIONAL_SOURCE_COLLECTIONS = (
    "C4_04_REGIONAL_TERRAIN",
    "C4_ESTABLISHING_DISTANT_RELIEF",
    "C4_ESTABLISHING_WOODLAND_MASSES",
    "C4_REGIONAL_CONNECTED_BELTS",
    "C4_COMPOSITION_REGIONAL_MASSES",
)
HERO_SOURCE_COLLECTIONS = ("08_EXPORT",)

# Fixed ratios preserve the low-poly water ribbons and belts while reducing
# the two dense broad surfaces enough for a browser payload. Source objects are
# never modified.
DECIMATION_RATIOS = {
    "C4_S4_Connected_Valley": 0.18,
    "C4_S4_Far_Land_Continuation": 0.16,
    "C4_Establishing_Ridge_0": 0.35,
    "C4_Establishing_Ridge_1": 0.35,
    "C4_Establishing_Ridge_2": 0.35,
    "C4_Establishing_Woodland_0": 0.45,
    "C4_Establishing_Woodland_1": 0.45,
    "C4_Establishing_Woodland_2": 0.45,
    "C4_Establishing_Woodland_3": 0.45,
    "C4_Establishing_Woodland_4": 0.45,
    "C4_Establishing_Woodland_5": 0.45,
    "C4_Connected_River_Margin_00": 0.45,
    "C4_Connected_River_Margin_01": 0.45,
    "C4_Connected_River_Margin_02": 0.45,
    "C4_Connected_River_Margin_03": 0.45,
    "C4_Connected_River_Margin_04": 0.45,
    "C4_Connected_River_Margin_05": 0.45,
    "C4_Connected_River_Margin_06": 0.45,
    "C4_Connected_River_Margin_07": 0.45,
    "C4_Woodland_Mass_00.001": 0.45,
    "C4_Woodland_Mass_01": 0.45,
    "C4_Woodland_Mass_02": 0.45,
    "C4_Woodland_Mass_03": 0.45,
    "C4_Woodland_Mass_04": 0.45,
    "C4_Low_Woodland_00": 0.45,
    "C4_Low_Woodland_01": 0.45,
    "C4_Low_Woodland_02": 0.45,
}
HERO_DECIMATION_RATIOS: dict[str, float] = {}

# Runtime material roles are limited to the established loader's surface set.
# Values come from the authored Principled materials and stay fixed so an
# exporter run does not depend on Blender color management.
MATERIAL_PROFILES: dict[str, dict[str, Any]] = {
    "regional-ground": {
        "surface": "soil",
        "color": [0.12, 0.18, 0.075],
        "roughness": 0.86,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "ridge-near": {
        "surface": "soil",
        "color": [0.10, 0.15, 0.13],
        "roughness": 0.95,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "ridge-mid": {
        "surface": "soil",
        "color": [0.13, 0.19, 0.19],
        "roughness": 0.95,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "ridge-far": {
        "surface": "soil",
        "color": [0.18, 0.24, 0.27],
        "roughness": 0.95,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "regional-ridges": {
        "surface": "soil",
        "color": [0.13, 0.19, 0.19],
        "roughness": 0.95,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "regional-access": {
        "surface": "soil",
        "color": [0.24, 0.23, 0.16],
        "roughness": 0.80,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "regional-water": {
        "surface": "water",
        "color": [0.025, 0.065, 0.060],
        "roughness": 0.28,
        "clearcoat": 0.74,
        "doubleSided": True,
    },
    "regional-canopy": {
        "surface": "leaf",
        "color": [0.045, 0.090, 0.035],
        "roughness": 0.91,
        "clearcoat": 0.0,
        "doubleSided": True,
    },
    "riparian-land-cover": {
        "surface": "crop",
        "color": [0.055, 0.100, 0.065],
        "roughness": 0.88,
        "clearcoat": 0.0,
        "doubleSided": True,
    },
}

MATERIAL_TO_PROFILE = {
    "C4_Establishing_Regional_Material": "regional-ground",
    "S4_Valley_ground": "regional-ground",
    "C4_Establishing_Ridge_Material_0": "regional-ridges",
    "C4_Establishing_Ridge_Material_1": "regional-ridges",
    "C4_Establishing_Ridge_Material_2": "regional-ridges",
    "S4_Regional_access": "regional-access",
    "S4_Regional_water": "regional-water",
    "C4_Regional_Water_C4_Meander_Water": "regional-water",
    "C4_Regional_Water_C4_Regional_West_Water": "regional-water",
    "C4_Reflection_S4_Regional_water": "regional-water",
    "C4_Reflection_S4_Regional_water.001": "regional-water",
    "C4_Reflection_S4_Regional_water.002": "regional-water",
    "C4_Reflection_S4_Regional_water.003": "regional-water",
    "C4_Establishing_Grouped_Canopy": "regional-canopy",
    "C4_Regional_Riparian_Canopy": "regional-canopy",
    "C4_Riparian_Canopy_Masses.001": "regional-canopy",
    "C4_Regional_Low_Woodland": "regional-canopy",
    "C4_Composition_Riparian_Grain": "riparian-land-cover",
}

HERO_MATERIAL_PROFILES: dict[str, dict[str, Any]] = {
    "hero-ground": {
        "surface": "soil",
        "color": [0.180, 0.118, 0.067],
        "roughness": 0.96,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-fallow": {
        "surface": "soil",
        "color": [0.205, 0.145, 0.084],
        "roughness": 0.95,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-field-0": {
        "surface": "crop",
        "color": [0.090, 0.152, 0.056],
        "roughness": 0.94,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-field-1": {
        "surface": "crop",
        "color": [0.170, 0.234, 0.078],
        "roughness": 0.92,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-field-2": {
        "surface": "crop",
        "color": [0.235, 0.270, 0.103],
        "roughness": 0.90,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-field-3": {
        "surface": "crop",
        "color": [0.260, 0.235, 0.120],
        "roughness": 0.94,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-field-4": {
        "surface": "crop",
        "color": [0.080, 0.125, 0.061],
        "roughness": 0.94,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-access": {
        "surface": "soil",
        "color": [0.195, 0.140, 0.090],
        "roughness": 0.94,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-water": {
        "surface": "water",
        "color": [0.028, 0.074, 0.072],
        "roughness": 0.095,
        "clearcoat": 0.74,
        "doubleSided": False,
    },
    "hero-bank": {
        "surface": "soil",
        "color": [0.145, 0.105, 0.070],
        "roughness": 0.86,
        "clearcoat": 0.0,
        "doubleSided": False,
    },
    "hero-rows": {
        "surface": "crop",
        "color": [0.170, 0.235, 0.078],
        "roughness": 0.89,
        "clearcoat": 0.0,
        "doubleSided": True,
    },
    "hero-verge": {
        "surface": "crop",
        "color": [0.105, 0.145, 0.063],
        "roughness": 0.93,
        "clearcoat": 0.0,
        "doubleSided": True,
    },
}

HERO_MATERIAL_TO_PROFILE = {
    "HF_Compacted_access": "hero-access",
    "HF_Fallow_cultivated_loam": "hero-fallow",
    "HF_Field_state_0": "hero-field-0",
    "HF_Field_state_1": "hero-field-1",
    "HF_Field_state_2": "hero-field-2",
    "HF_Field_state_3": "hero-field-3",
    "HF_Field_state_4": "hero-field-4",
    "HF_Irrigation_water": "hero-water",
    "HF_Mineral_earth": "hero-ground",
    "HF_Moist_bank": "hero-bank",
    "HF_R_Fallow_Upper_stage0": "hero-fallow",
    "HF_R_Mature_West_stage0": "hero-field-1",
    "HF_R_Verge_Soil_Patches": "hero-verge",
    "HF_R_Wet_East_stage0": "hero-field-2",
    "HF_R_Young_North_stage0": "hero-field-0",
    "Rice rows": "hero-rows",
    "Vegetated sample verge": "hero-verge",
}

VARIANT_SOURCE_COLLECTIONS = {
    "regional": REGIONAL_SOURCE_COLLECTIONS,
    "hero": HERO_SOURCE_COLLECTIONS,
}
VARIANT_DECIMATION_RATIOS = {
    "regional": DECIMATION_RATIOS,
    "hero": HERO_DECIMATION_RATIOS,
}
VARIANT_MATERIAL_TO_PROFILE = {
    "regional": MATERIAL_TO_PROFILE,
    "hero": HERO_MATERIAL_TO_PROFILE,
}
VARIANT_MATERIAL_PROFILES = {
    "regional": MATERIAL_PROFILES,
    "hero": {**MATERIAL_PROFILES, **HERO_MATERIAL_PROFILES},
}

UV_WORLD_SCALE = 0.018


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_args() -> tuple[Path, Path, Path, Path, str, bool]:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    variant = os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_VARIANT", "regional")
    # Resolve the final variant before selecting an implicit runtime output.
    # Explicit runtime paths remain authoritative and are applied below.
    for arg in argv:
        if arg.startswith("--variant="):
            variant = arg.split("=", 1)[1]
    if variant not in VARIANT_SOURCE_COLLECTIONS:
        raise ValueError(f"Unknown runtime transfer variant: {variant}")
    runtime_override = os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_RUNTIME")
    default_runtime = REPO_ROOT / (
        "apps/web/public/cinematic/models/scene4-hero.mesh.json"
        if variant == "hero"
        else "apps/web/public/cinematic/models/scene4-regional.mesh.json"
    )
    values = {
        "source": Path(os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_SOURCE", str(DEFAULT_AUTHORING))),
        "master": Path(os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_MASTER", str(DEFAULT_MASTER))),
        "evidence": Path(os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_EVIDENCE", str(DEFAULT_EVIDENCE))),
        "runtime": Path(runtime_override) if runtime_override else default_runtime,
    }
    overwrite = os.environ.get("AGRISCOPE_RUNTIME_TRANSFER_OVERWRITE", "0") == "1"
    for arg in argv:
        if arg == "--overwrite":
            overwrite = True
        elif arg.startswith("--source="):
            values["source"] = Path(arg.split("=", 1)[1])
        elif arg.startswith("--master="):
            values["master"] = Path(arg.split("=", 1)[1])
        elif arg.startswith("--evidence="):
            values["evidence"] = Path(arg.split("=", 1)[1])
        elif arg.startswith("--runtime="):
            values["runtime"] = Path(arg.split("=", 1)[1])
        elif arg.startswith("--variant="):
            continue
        else:
            raise ValueError(f"Unknown argument: {arg}")
    return values["source"], values["master"], values["evidence"], values["runtime"], variant, overwrite


def triangles_for_mesh(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def runtime_point(point: Vector) -> tuple[float, float, float]:
    # Authoring uses Blender (x, depth, height); runtime uses (x, height, z).
    return float(point.x), float(point.z), float(-point.y)


def runtime_normal(normal: Vector) -> tuple[float, float, float]:
    return float(normal.x), float(normal.z), float(-normal.y)


def profile_for(material_name: str, variant: str = "regional") -> str:
    try:
        return VARIANT_MATERIAL_TO_PROFILE[variant][material_name]
    except KeyError as exc:
        raise ValueError(f"Unmapped Scene 4 {variant} material: {material_name}") from exc


def profile_material(profile_id: str, variant: str = "regional") -> dict[str, Any]:
    profile = VARIANT_MATERIAL_PROFILES[variant][profile_id]
    return {
        "color": list(profile["color"]),
        "metalness": 0.0,
        "roughness": profile["roughness"],
        "clearcoat": profile["clearcoat"],
        "surface": profile["surface"],
        "normalStrength": 0.5,
        "doubleSided": profile["doubleSided"],
    }


def make_runtime_copies(variant: str) -> tuple[bpy.types.Collection, list[dict[str, Any]], list[str]]:
    runtime_collection_name = RUNTIME_COLLECTIONS[variant]
    existing = bpy.data.collections.get(runtime_collection_name)
    if existing:
        raise FileExistsError(f"Runtime collection already exists: {runtime_collection_name}")
    runtime_collection = bpy.data.collections.new(runtime_collection_name)
    bpy.context.scene.collection.children.link(runtime_collection)

    source_records: list[dict[str, Any]] = []
    hidden_collections: list[str] = []
    source_collections = VARIANT_SOURCE_COLLECTIONS[variant]
    decimation_ratios = VARIANT_DECIMATION_RATIOS[variant]
    for collection_name in source_collections:
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            raise ValueError(f"Missing required source collection: {collection_name}")
        hidden_collections.append(collection_name)
        for source_object in sorted((o for o in collection.objects if o.type == "MESH"), key=lambda o: o.name):
            if not source_object.data.materials:
                raise ValueError(f"Source mesh has no material: {source_object.name}")
            source_material_names = [m.name for m in source_object.data.materials]
            for material_name in source_material_names:
                profile_for(material_name, variant)

            copy = source_object.copy()
            copy.data = source_object.data.copy()
            copy.name = f"RT_{source_object.name}"
            runtime_collection.objects.link(copy)
            ratio = decimation_ratios.get(source_object.name, 1.0)
            before_triangles = triangles_for_mesh(copy.data)
            if ratio < 1.0:
                bpy.ops.object.select_all(action="DESELECT")
                copy.select_set(True)
                bpy.context.view_layer.objects.active = copy
                modifier = copy.modifiers.new("Deterministic runtime reduction", "DECIMATE")
                modifier.ratio = ratio
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            after_triangles = triangles_for_mesh(copy.data)
            copy["runtime_source_collection"] = collection_name
            copy["runtime_source_object"] = source_object.name
            copy["runtime_decimation_ratio"] = ratio
            source_records.append({
                "collection": collection_name,
                "object": source_object.name,
                "runtimeObject": copy.name,
                "sourceTriangles": before_triangles,
                "runtimeTriangles": after_triangles,
                "decimationRatio": ratio,
                "materials": source_material_names,
                "profiles": sorted({profile_for(name, variant) for name in source_material_names}),
            })

    # Originals remain in this editable derivative for comparison and
    # rollback. Hiding only regional collections keeps Hero/NDVI and the
    # source cameras/registration available while runtime copies are visible.
    for collection_name in hidden_collections:
        collection = bpy.data.collections[collection_name]
        collection.hide_render = True
        collection.hide_viewport = True
    runtime_collection.hide_render = False
    runtime_collection.hide_viewport = False
    return runtime_collection, source_records, hidden_collections


def export_runtime_asset(
    runtime_collection: bpy.types.Collection,
    source_records: list[dict[str, Any]],
    variant: str,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    groups: dict[str, dict[str, Any]] = {}
    source_by_runtime = {record["runtimeObject"]: record for record in source_records}
    skipped_triangles = 0

    for obj in sorted(runtime_collection.objects, key=lambda item: item.name):
        if obj.type != "MESH":
            continue
        source_record = source_by_runtime[obj.name]
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        transform = evaluated.matrix_world
        normal_matrix = transform.to_3x3().inverted().transposed()
        uv_layer = mesh.uv_layers.active
        object_profiles = set()
        for triangle in mesh.loop_triangles:
            material_index = triangle.material_index
            material = obj.data.materials[material_index] if material_index < len(obj.data.materials) else None
            if material is None:
                evaluated.to_mesh_clear()
                raise ValueError(f"Mesh triangle has no material: {obj.name}")
            profile_id = profile_for(material.name, variant)
            object_profiles.add(profile_id)
            group = groups.setdefault(profile_id, {"vertices": [], "indices": [], "lookup": {}, "sources": set()})
            group["sources"].add(obj.name)
            triangle_points: list[tuple[float, float, float]] = []
            triangle_values: list[tuple[float, ...]] = []
            for loop_index in triangle.loops:
                point = runtime_point(transform @ mesh.vertices[mesh.loops[loop_index].vertex_index].co)
                normal = runtime_normal((normal_matrix @ mesh.corner_normals[loop_index].vector).normalized())
                if uv_layer:
                    uv = tuple(float(value) for value in uv_layer.data[loop_index].uv)
                else:
                    uv = (point[0] * UV_WORLD_SCALE, point[2] * UV_WORLD_SCALE)
                values = (*point, *normal, *uv)
                triangle_points.append(point)
                triangle_values.append(values)
            edge_a = Vector(triangle_points[1]) - Vector(triangle_points[0])
            edge_b = Vector(triangle_points[2]) - Vector(triangle_points[0])
            if edge_a.cross(edge_b).length <= 1e-10:
                skipped_triangles += 1
                continue
            triangle_indices: list[int] = []
            for values in triangle_values:
                key = tuple(round(value, 6) for value in values)
                index = group["lookup"].get(key)
                if index is None:
                    index = len(group["vertices"])
                    group["lookup"][key] = index
                    group["vertices"].append(values)
                triangle_indices.append(index)
            if len(set(triangle_indices)) != 3:
                skipped_triangles += 1
                continue
            group["indices"].extend(triangle_indices)
        evaluated.to_mesh_clear()
        source_record["exportProfiles"] = sorted(object_profiles)

    meshes = []
    group_stats: dict[str, dict[str, Any]] = {}
    total_triangles = 0
    total_vertices = 0
    for profile_id in sorted(groups):
        group = groups[profile_id]
        points = group["vertices"]
        lower = [min(point[index] for point in points) for index in range(3)]
        upper = [max(point[index] for point in points) for index in range(3)]
        offset = [(a + b) / 2 for a, b in zip(lower, upper)]
        scale = [max((b - a) / 2, 0.00001) for a, b in zip(lower, upper)]
        position_bytes = bytearray()
        normal_bytes = bytearray()
        uv_bytes = bytearray()
        for point in points:
            position_bytes.extend(struct.pack(
                "<hhh",
                *[max(-32767, min(32767, round((point[index] - offset[index]) / scale[index] * 32767))) for index in range(3)],
            ))
            normal_bytes.extend(struct.pack(
                "<bbb",
                *[max(-127, min(127, round(point[index] * 127))) for index in range(3, 6)],
            ))
            uv_bytes.extend(struct.pack(
                "<hh",
                *[max(-32767, min(32767, round(point[index] * 512))) for index in (6, 7)],
            ))
        indices = group["indices"]
        use32 = len(points) > 65535
        index_bytes = struct.pack(f"<{len(indices)}{'I' if use32 else 'H'}", *indices)
        meshes.append({
            "name": f"Scene 4 {variant} · {profile_id}",
            "material": profile_material(profile_id, variant),
            "offset": offset,
            "scale": scale,
            "position": base64.b64encode(position_bytes).decode(),
            "uv": base64.b64encode(uv_bytes).decode(),
            "normal": base64.b64encode(normal_bytes).decode(),
            "index": base64.b64encode(index_bytes).decode(),
            "index32": use32,
        })
        triangles = len(indices) // 3
        total_triangles += triangles
        total_vertices += len(points)
        group_stats[profile_id] = {
            "triangles": triangles,
            "vertices": len(points),
            "sourceRuntimeObjects": sorted(group["sources"]),
            "payloadBytes": len(position_bytes) + len(uv_bytes) + len(normal_bytes) + len(index_bytes),
        }

    asset = {
        "schema": 1,
        "generator": f"Blender {bpy.app.version_string} · Scene 4 {variant} runtime derivative",
        "conceptual": True,
        "triangles": total_triangles,
        "meshes": meshes,
    }
    return asset, {
        "groups": group_stats,
        "triangles": total_triangles,
        "vertices": total_vertices,
        "skippedDegenerateTriangles": skipped_triangles,
    }


def preserved_inventory() -> dict[str, Any]:
    collections = (
        "00_CAMERAS",
        "05_HERO_FARMLAND",
        "HF_HERO_FIELD",
        "HF_REVEAL_ACQUISITION",
        "HF_REVEAL_ARRIVAL",
        "HF_REVEAL_SETTLED",
    )
    return {
        name: sorted(o.name for o in bpy.data.collections[name].objects)
        for name in collections
        if bpy.data.collections.get(name)
    }


def main() -> None:
    source, master, evidence, runtime_path, variant, overwrite = parse_args()
    if not master.exists() or sha256(master) != MASTER_SHA256:
        raise RuntimeError(f"Verified Scene 4 master hash mismatch: {master}")
    if not source.exists() or sha256(source) != MASTER_SHA256:
        raise RuntimeError(f"Authoring source must match the verified Scene 4 master: {source}")
    evidence.mkdir(parents=True, exist_ok=True)
    derivative_path = evidence / "derivative" / f"AgriScope-Runtime-Art-Transfer-{variant}.blend"
    manifest_path = evidence / "runtime-art-transfer-manifest.json"
    if not overwrite:
        for path in (runtime_path, derivative_path, manifest_path):
            if path.exists():
                raise FileExistsError(f"Refusing to overwrite existing output: {path}")
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    derivative_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False)
    if bpy.data.filepath != str(source):
        raise RuntimeError("Blender did not open the SHA-bound authoring source")
    original_preserved = preserved_inventory()
    runtime_collection, source_records, hidden_collections = make_runtime_copies(variant)
    asset, stats = export_runtime_asset(runtime_collection, source_records, variant)
    runtime_path.write_text(json.dumps(asset, separators=(",", ":")))

    bpy.context.scene["Runtime derivative"] = f"Scene 4 {variant} forms; schema=1 mesh-assets.js"
    bpy.context.scene["Runtime source SHA-256"] = MASTER_SHA256
    bpy.context.scene["Runtime coordinate system"] = "x,height,z = Blender x,z,-y"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(derivative_path), check_existing=False)
    post_save_preserved = preserved_inventory()
    if original_preserved != post_save_preserved:
        raise RuntimeError("Accepted Hero/NDVI registration inventory changed in derivative")

    manifest = {
        "identity": "AgriScope Scene 4 runtime art transfer",
        "generatedBy": str(Path(__file__).relative_to(REPO_ROOT)),
        "blender": bpy.app.version_string,
        "blenderBinary": BLENDER_BINARY,
        "variant": variant,
        "schema": 1,
        "source": {
            "verifiedMaster": str(master),
            "verifiedMasterSha256": MASTER_SHA256,
            "authoringCopy": str(source),
            "authoringCopySha256": sha256(source),
            "sourceCollections": list(VARIANT_SOURCE_COLLECTIONS[variant]),
            "hiddenSourceCollectionsInDerivative": hidden_collections,
        },
        "derivative": {
            "path": str(derivative_path),
            "sha256": sha256(derivative_path),
            "bytes": derivative_path.stat().st_size,
            "runtimeCollection": RUNTIME_COLLECTIONS[variant],
            "dependenciesPacked": sum(1 for image in bpy.data.images if image.source == "FILE" and image.packed_file),
        },
        "runtimeAsset": {
            "path": str(runtime_path),
            "sha256": sha256(runtime_path),
            "bytes": runtime_path.stat().st_size,
            **stats,
        },
        "sourceBindings": source_records,
        "preservedRegistration": {
            "inventoryBefore": original_preserved,
            "inventoryAfter": post_save_preserved,
            "heroAndNdviRegistrationPreserved": True,
        },
        "integration": {
            "loader": "apps/web/public/cinematic/mesh-assets.js decodeMeshAsset schema=1",
            "coordinateTransform": "Blender (x, depth, height) -> runtime (x, height, z) = (x, z, -depth)",
            "recommendedTransform": {
                "position": [0.0, 0.0, 0.0],
                "scale": [1.0, 1.0, 1.0],
                "rotationEuler": [0.0, 0.0, 0.0],
                "inheritDescentSurfaceScale": True,
                "reason": "Scene 4 forms were authored in the existing tangent coordinates; the browser descent scale is the shared affine transition.",
            },
            "surfaceRoles": sorted({
                VARIANT_MATERIAL_PROFILES[variant][profile_id]["surface"]
                for profile_id in set(VARIANT_MATERIAL_TO_PROFILE[variant].values())
            }),
            "sourceBoundary": "08_EXPORT only; HF_LANDSCAPE_COMPOSITION and HF_CROPS are excluded" if variant == "hero" else "C4 regional source collections",
            "oldAssetsUnchanged": True,
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({
        "runtime": str(runtime_path),
        "runtimeBytes": runtime_path.stat().st_size,
        "triangles": stats["triangles"],
        "batches": len(asset["meshes"]),
        "derivative": str(derivative_path),
        "manifest": str(manifest_path),
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
