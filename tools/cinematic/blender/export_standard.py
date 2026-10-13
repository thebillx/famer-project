"""Export and round-trip-check standard glTF 2.0 prototypes.

The browser continues to use the measured compact container in this milestone.
GLB is evaluated as the authored interchange candidate because it preserves
hierarchy, UVs, normals and PBR bindings without a second permanent loader.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import struct

import bpy


folder = Path(os.environ.get("AGRISCOPE_BLENDER_OUTPUT", str(Path(__file__).resolve().parent / "output")))
blend_source = folder / "AgriScope-Cinematic-Assets.blend"

exports = [("02_SPACECRAFT", "spacecraft.glb"), ("08_EXPORT", "farmland.glb")]
repeat_tolerance = {
    "POSITION": 1e-6, "NORMAL": 1e-6, "TEXCOORD_0": 1e-6,
    "NODE_TRANSFORM": 1e-6, "MATERIAL": 1e-6,
}
import_roundtrip_tolerance = {
    "POSITION": 1e-6, "NORMAL": 6e-4, "TEXCOORD_0": 1e-6,
    "NODE_TRANSFORM": 1e-6, "MATERIAL": 1e-6,
}
report = {
    "schema": 3,
    "interchange": "glTF 2.0 binary",
    "productionLoaderChanged": False,
    "determinismContract": {
        "mode": "semantic-tolerance",
        "byteStableRequired": False,
        "topologyHierarchySceneRootsMaterialBindingsAndTexturePayloads": "exact",
        "repeatExportMaxAbsoluteDelta": repeat_tolerance,
        "importRoundTripMaxAbsoluteDelta": import_roundtrip_tolerance,
        "reason": "Repeat exports allow one float32 unit. Blender's glTF importer renormalizes and re-encodes split normals, so the import round trip allows 6e-4 per normal component while positions, UVs, node transforms and PBR values retain the 1e-6 limit.",
    },
    "assets": [],
}


def read_glb(path: Path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or length != len(raw):
        raise RuntimeError(f"Invalid GLB header: {path.name}")
    offset = 12
    chunks = {}
    while offset < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        chunks[chunk_type] = raw[offset:offset + chunk_length]
        offset += chunk_length
    document = json.loads(chunks[b"JSON"].rstrip(b" \x00"))
    return document, chunks.get(b"BIN\x00", b"")


component_formats = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def accessor_values(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    if "sparse" in accessor:
        raise RuntimeError("Sparse GLB accessors are outside this prototype contract")
    view = document["bufferViews"][accessor["bufferView"]]
    code, width = component_formats[accessor["componentType"]]
    components = component_counts[accessor["type"]]
    item_width = width * components
    stride = view.get("byteStride", item_width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack = struct.Struct("<" + code * components).unpack_from
    return tuple(value for index in range(accessor["count"])
                 for value in unpack(binary, start + index * stride))


def node_matrix(node):
    if "matrix" in node:
        return tuple(node["matrix"])
    tx, ty, tz = node.get("translation", (0.0, 0.0, 0.0))
    x, y, z, w = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    sx, sy, sz = node.get("scale", (1.0, 1.0, 1.0))
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return (
        sx * (1 - 2 * (yy + zz)), sx * (2 * (xy + wz)), sx * (2 * (xz - wy)), 0.0,
        sy * (2 * (xy - wz)), sy * (1 - 2 * (xx + zz)), sy * (2 * (yz + wx)), 0.0,
        sz * (2 * (xz + wy)), sz * (2 * (yz - wx)), sz * (1 - 2 * (xx + yy)), 0.0,
        tx, ty, tz, 1.0,
    )


def buffer_view_bytes(document, binary, view_index):
    view = document["bufferViews"][view_index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def image_signature(document, binary, image_index):
    image = document["images"][image_index]
    if "bufferView" in image:
        payload = buffer_view_bytes(document, binary, image["bufferView"])
    else:
        payload = image.get("uri", "").encode()
    return {
        "mimeType": image.get("mimeType"),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def sampler_signature(sampler):
    return {
        "magFilter": sampler.get("magFilter"),
        "minFilter": sampler.get("minFilter"),
        "wrapS": sampler.get("wrapS", 10497),
        "wrapT": sampler.get("wrapT", 10497),
    }


def texture_signature(document, binary, texture_index):
    texture = document["textures"][texture_index]
    sampler = document.get("samplers", [])[texture["sampler"]] if "sampler" in texture else {}
    return {
        "source": image_signature(document, binary, texture["source"]),
        "sampler": sampler_signature(sampler),
    }


def material_signature(document, binary, material):
    """Resolve texture indices so PBR properties and their payloads are bound."""
    def resolve(value, parent_key=None):
        if isinstance(value, dict):
            resolved = {}
            for key in sorted(value):
                if key == "name":
                    continue
                item = value[key]
                if key == "index" and parent_key and parent_key.lower().endswith("texture"):
                    resolved[key] = texture_signature(document, binary, item)
                else:
                    resolved[key] = resolve(item, key)
            return resolved
        if isinstance(value, list):
            return [resolve(item, parent_key) for item in value]
        return value
    return resolve(material)


def semantic_snapshot(path: Path):
    document, binary = read_glb(path)
    nodes = document.get("nodes", [])
    hierarchy = tuple((node.get("name"), tuple(node.get("children", [])), node.get("mesh")) for node in nodes)
    materials = tuple(material.get("name") for material in document.get("materials", []))
    node_transforms = tuple(node_matrix(node) for node in nodes)
    scenes = document.get("scenes", [])
    active_scene_index = document.get("scene", 0 if scenes else None)
    active_scene = None if active_scene_index is None else (
        scenes[active_scene_index].get("name"),
        tuple(nodes[index].get("name") for index in scenes[active_scene_index].get("nodes", [])),
    )
    material_properties = tuple(
        material_signature(document, binary, material)
        for material in document.get("materials", [])
    )
    primitives = []
    attribute_counts = {"POSITION": 0, "NORMAL": 0, "TEXCOORD_0": 0}
    triangle_count = 0
    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            mode = primitive.get("mode", 4)
            if isinstance(mode, bool) or not isinstance(mode, int) or mode not in range(7):
                raise RuntimeError(
                    f"{path.name} mesh {mesh.get('name', mesh_index)} primitive {primitive_index} "
                    f"has invalid glTF mode {mode}"
                )
            if mode != 4:
                raise RuntimeError(
                    f"{path.name} mesh {mesh.get('name', mesh_index)} primitive {primitive_index} "
                    f"uses mode {mode}; this interchange contract requires TRIANGLES (4)"
                )
            attributes = primitive.get("attributes", {})
            missing = [semantic for semantic in attribute_counts if semantic not in attributes]
            if missing:
                raise RuntimeError(f"{path.name} mesh {mesh.get('name', mesh_index)} misses {missing}")
            values = {}
            counts = {}
            for semantic in attribute_counts:
                accessor_index = attributes[semantic]
                counts[semantic] = document["accessors"][accessor_index]["count"]
                attribute_counts[semantic] += counts[semantic]
                values[semantic] = accessor_values(document, binary, accessor_index)
            if len(set(counts.values())) != 1:
                raise RuntimeError(f"{path.name} vertex attribute counts diverge in mesh {mesh_index}")
            indices = accessor_values(document, binary, primitive["indices"])
            if len(indices) % 3:
                raise RuntimeError(f"{path.name} has a non-triangular index stream")
            triangle_count += len(indices) // 3
            primitives.append({
                "identity": (mesh.get("name"), primitive_index, primitive.get("material")),
                "mode": mode,
                "indices": indices,
                "attributes": values,
            })
    return {
        "document": document,
        "hierarchy": hierarchy,
        "materials": materials,
        "nodeTransforms": node_transforms,
        "activeScene": active_scene,
        "materialProperties": material_properties,
        "materialExtensionsUsed": tuple(sorted(document.get("extensionsUsed", []))),
        "primitives": primitives,
        "attributeCounts": attribute_counts,
        "triangles": triangle_count,
    }


def compare_nested(left, right, tolerance):
    if isinstance(left, bool) or isinstance(right, bool):
        return left == right, left == right, 0.0
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        delta = abs(left - right)
        return delta == 0.0, delta <= tolerance, delta
    if isinstance(left, dict) and isinstance(right, dict):
        if set(left) != set(right):
            return False, False, 0.0
        results = [compare_nested(left[key], right[key], tolerance) for key in sorted(left)]
    elif isinstance(left, (list, tuple)) and isinstance(right, (list, tuple)):
        if len(left) != len(right):
            return False, False, 0.0
        results = [compare_nested(a, b, tolerance) for a, b in zip(left, right)]
    else:
        return left == right, left == right, 0.0
    return (
        all(result[0] for result in results),
        all(result[1] for result in results),
        max((result[2] for result in results), default=0.0),
    )


def compare_structure(primary, candidate, tolerance):
    exact = (
        primary["hierarchy"] == candidate["hierarchy"]
        and primary["materials"] == candidate["materials"]
        and primary["activeScene"] == candidate["activeScene"]
        and primary["materialExtensionsUsed"] == candidate["materialExtensionsUsed"]
        and len(primary["primitives"]) == len(candidate["primitives"])
    )
    if not exact:
        return False, False, {"NODE_TRANSFORM": 0.0, "MATERIAL": 0.0}
    transform = compare_nested(primary["nodeTransforms"], candidate["nodeTransforms"], tolerance["NODE_TRANSFORM"])
    material = compare_nested(primary["materialProperties"], candidate["materialProperties"], tolerance["MATERIAL"])
    return (
        transform[0] and material[0],
        transform[1] and material[1],
        {"NODE_TRANSFORM": transform[2], "MATERIAL": material[2]},
    )


def compare_semantics(primary, repeat, tolerance):
    structure_exact, structure_within_tolerance, maximum = compare_structure(primary, repeat, tolerance)
    exact = structure_exact
    geometry = {"POSITION": 0.0, "NORMAL": 0.0, "TEXCOORD_0": 0.0}
    if structure_within_tolerance:
        for left, right in zip(primary["primitives"], repeat["primitives"]):
            if (
                left["identity"] != right["identity"]
                or left.get("mode", 4) != right.get("mode", 4)
                or left["indices"] != right["indices"]
            ):
                return False, False, {**geometry, **maximum}
            for semantic in geometry:
                a, b = left["attributes"][semantic], right["attributes"][semantic]
                if len(a) != len(b):
                    return False, False, {**geometry, **maximum}
                delta = max((abs(x - y) for x, y in zip(a, b)), default=0.0)
                geometry[semantic] = max(geometry[semantic], delta)
                exact = exact and delta == 0.0
    combined = {**geometry, **maximum}
    within_tolerance = structure_within_tolerance and all(
        combined[semantic] <= tolerance[semantic] for semantic in combined
    )
    return exact, within_tolerance, combined


def grouped(values, width):
    return [tuple(values[index:index + width]) for index in range(0, len(values), width)]


def triangle_records(primitive):
    positions = grouped(primitive["attributes"]["POSITION"], 3)
    normals = grouped(primitive["attributes"]["NORMAL"], 3)
    uvs = grouped(primitive["attributes"]["TEXCOORD_0"], 2)
    indices = primitive["indices"]
    records = []
    for offset in range(0, len(indices), 3):
        records.append(tuple({
            "position": positions[indices[offset + step]],
            "normal": normals[indices[offset + step]],
            "uv": uvs[indices[offset + step]],
        } for step in range(3)))
    return records


def triangle_deltas(left, right):
    deltas = {"POSITION": 0.0, "NORMAL": 0.0, "TEXCOORD_0": 0.0}
    for left_corner, right_corner in zip(left, right):
        deltas["POSITION"] = max(
            deltas["POSITION"],
            max(abs(a - b) for a, b in zip(left_corner["position"], right_corner["position"])),
        )
        deltas["NORMAL"] = max(
            deltas["NORMAL"],
            max(abs(a - b) for a, b in zip(left_corner["normal"], right_corner["normal"])),
        )
        deltas["TEXCOORD_0"] = max(
            deltas["TEXCOORD_0"],
            max(abs(a - b) for a, b in zip(left_corner["uv"], right_corner["uv"])),
        )
    return deltas


primitive_mode_names = {
    0: "POINTS", 1: "LINES", 2: "LINE_LOOP", 3: "LINE_STRIP",
    4: "TRIANGLES", 5: "TRIANGLE_STRIP", 6: "TRIANGLE_FAN",
}


def primitive_label(primitive):
    mesh_name, primitive_index, _ = primitive["identity"]
    return f"mesh {mesh_name!r} primitive {primitive_index}"


def complete_triangle_matching(left_primitive, right_primitive, tolerance):
    """Return a deterministic tolerance-valid bijection or a useful diagnostic.

    Candidate edges preserve triangle winding through cyclic rotations. A
    breadth-first augmenting path finds a complete one-to-one matching whenever
    one exists; unlike a greedy assignment, an earlier match may be reassigned.
    """
    left_triangles = triangle_records(left_primitive)
    right_triangles = triangle_records(right_primitive)
    label = primitive_label(left_primitive)
    if len(left_triangles) != len(right_triangles):
        return None, (
            f"{label}: triangle count mismatch "
            f"{len(left_triangles)} != {len(right_triangles)}"
        )

    position_tolerance = tolerance["POSITION"]
    bucket_width = position_tolerance * 4
    buckets = {}
    for index, triangle in enumerate(right_triangles):
        centroid = tuple(sum(corner["position"][axis] for corner in triangle) / 3 for axis in range(3))
        key = tuple(math.floor(value / bucket_width) for value in centroid)
        buckets.setdefault(key, []).append(index)

    adjacency = []
    nearest = []
    for left_triangle in left_triangles:
        centroid = tuple(sum(corner["position"][axis] for corner in left_triangle) / 3 for axis in range(3))
        origin = tuple(math.floor(value / bucket_width) for value in centroid)
        best_by_target = {}
        closest = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for candidate_index in buckets.get((origin[0] + dx, origin[1] + dy, origin[2] + dz), []):
                        right_triangle = right_triangles[candidate_index]
                        for rotation in range(3):
                            rotated = right_triangle[rotation:] + right_triangle[:rotation]
                            deltas = triangle_deltas(left_triangle, rotated)
                            normalized_error = max(
                                deltas[semantic] / tolerance[semantic] for semantic in deltas
                            )
                            edge = (normalized_error, candidate_index, rotation, deltas)
                            if closest is None or edge[:3] < closest[:3]:
                                closest = edge
                            if all(deltas[semantic] <= tolerance[semantic] for semantic in deltas):
                                previous = best_by_target.get(candidate_index)
                                if previous is None or edge[:3] < previous[:3]:
                                    best_by_target[candidate_index] = edge
        adjacency.append(sorted(best_by_target.values(), key=lambda edge: edge[:3]))
        nearest.append(closest)

    match_left = [-1] * len(left_triangles)
    match_right = [-1] * len(right_triangles)
    chosen_edges = [None] * len(left_triangles)
    for start in range(len(left_triangles)):
        pending = [start]
        pending_offset = 0
        visited_left = {start}
        visited_right = set()
        parent_right = {}
        free_right = None
        while pending_offset < len(pending) and free_right is None:
            left_index = pending[pending_offset]
            pending_offset += 1
            for edge in adjacency[left_index]:
                right_index = edge[1]
                if right_index in visited_right:
                    continue
                visited_right.add(right_index)
                parent_right[right_index] = (left_index, edge)
                matched_left = match_right[right_index]
                if matched_left == -1:
                    free_right = right_index
                    break
                if matched_left not in visited_left:
                    visited_left.add(matched_left)
                    pending.append(matched_left)
        if free_right is None:
            candidate_indices = [edge[1] for edge in adjacency[start]]
            closest = nearest[start]
            closest_detail = "no spatial candidate"
            if closest is not None:
                failing = [
                    semantic for semantic, delta in closest[3].items()
                    if delta > tolerance[semantic]
                ]
                closest_detail = (
                    f"closest target {closest[1]} fails {','.join(failing) or 'one-to-one assignment'} "
                    f"with deltas {closest[3]}"
                )
            assigned = {
                target: match_right[target] for target in candidate_indices
                if match_right[target] != -1
            }
            return None, (
                f"{label}: unmatched source triangle {start}; no complete one-to-one "
                f"POSITION/NORMAL/TEXCOORD_0 match; tolerance-valid targets "
                f"{candidate_indices}, assigned sources {assigned}; {closest_detail}"
            )

        right_index = free_right
        while right_index != -1:
            left_index, edge = parent_right[right_index]
            previous_right = match_left[left_index]
            match_left[left_index] = right_index
            match_right[right_index] = left_index
            chosen_edges[left_index] = edge
            right_index = previous_right

    return chosen_edges, None


def compare_import_semantics(primary, imported, tolerance):
    """Compare semantic geometry after Blender imports and re-exports the GLB.

    Blender may split an imported vertex at a smooth/hard-normal boundary, so
    raw vertex indices and duplicate counts are not stable. A centroid spatial
    index finds candidate triangles without tolerance-bucket boundary errors.
    Only cyclic corner rotations are allowed, preserving winding, and each
    corresponding position, UV and normal is then compared directly.
    """
    structure_exact, structure_within_tolerance, structure_maximum = compare_structure(primary, imported, tolerance)
    maximum = {
        "POSITION": 0.0, "NORMAL": 0.0, "TEXCOORD_0": 0.0,
        **structure_maximum,
    }
    if not structure_within_tolerance:
        return False, False, maximum, "Hierarchy, scene roots, transforms, or material bindings differ"
    for left, right in zip(primary["primitives"], imported["primitives"]):
        if left["identity"] != right["identity"]:
            return False, False, maximum, (
                f"Primitive identity mismatch: {left['identity']} != {right['identity']}"
            )
        left_mode = left.get("mode", 4)
        right_mode = right.get("mode", 4)
        if left_mode != right_mode:
            return False, False, maximum, (
                f"{primitive_label(left)} mode mismatch: "
                f"{primitive_mode_names.get(left_mode, left_mode)} ({left_mode}) != "
                f"{primitive_mode_names.get(right_mode, right_mode)} ({right_mode})"
            )
        if left_mode != 4:
            return False, False, maximum, (
                f"{primitive_label(left)} uses {primitive_mode_names.get(left_mode, left_mode)} "
                f"({left_mode}); the semantic geometry contract requires TRIANGLES (4)"
            )
        matches, diagnostic = complete_triangle_matching(left, right, tolerance)
        if matches is None:
            return False, False, maximum, diagnostic
        for _, _, _, deltas in matches:
            for semantic, delta in deltas.items():
                maximum[semantic] = max(maximum[semantic], delta)
    within_tolerance = all(maximum[semantic] <= tolerance[semantic] for semantic in maximum)
    semantic_identity = structure_exact and all(delta == 0.0 for delta in maximum.values())
    return semantic_identity, within_tolerance, maximum, None


def verify_semantic_guard_controls(snapshot, tolerance):
    """Exercise the semantic guard's positive and negative regression cases."""
    controls = []

    translated = dict(snapshot)
    transforms = [list(values) for values in snapshot["nodeTransforms"]]
    transforms[0][12] += 100.0
    translated["nodeTransforms"] = tuple(tuple(values) for values in transforms)
    if compare_structure(snapshot, translated, tolerance)[1]:
        raise RuntimeError("Semantic guard failed to reject a 100-unit node translation")
    controls.append("reject-node-translation")

    rerooted = dict(snapshot)
    scene_name, roots = snapshot["activeScene"]
    rerooted["activeScene"] = (scene_name, roots + ("SEMANTIC_GUARD_INVALID_ROOT",))
    if compare_structure(snapshot, rerooted, tolerance)[1]:
        raise RuntimeError("Semantic guard failed to reject a changed active-scene root")
    controls.append("reject-active-scene-root-change")

    material_changed = dict(snapshot)
    properties = json.loads(json.dumps(snapshot["materialProperties"]))
    properties[0]["pbrMetallicRoughness"]["roughnessFactor"] += 0.1
    material_changed["materialProperties"] = tuple(properties)
    if compare_structure(snapshot, material_changed, tolerance)[1]:
        raise RuntimeError("Semantic guard failed to reject a PBR roughness change")
    controls.append("reject-pbr-property-change")

    common = {
        "hierarchy": (), "materials": (), "nodeTransforms": (),
        "activeScene": None, "materialProperties": (),
        "materialExtensionsUsed": (), "attributeCounts": {}, "triangles": 1,
    }
    primitive = {
        "identity": ("tolerance-boundary", 0, None), "indices": (0, 1, 2),
        "attributes": {
            "POSITION": (0.49e-6, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0),
            "NORMAL": (0.0, 0.0, 1.0) * 3,
            "TEXCOORD_0": (0.0, 0.0, 1.0, 0.0, 0.0, 1.0),
        },
    }
    shifted_primitive = json.loads(json.dumps(primitive))
    shifted_primitive["identity"] = tuple(shifted_primitive["identity"])
    shifted_primitive["indices"] = tuple(shifted_primitive["indices"])
    shifted_primitive["attributes"] = {
        key: tuple(values) for key, values in shifted_primitive["attributes"].items()
    }
    positions = list(shifted_primitive["attributes"]["POSITION"])
    positions[0] = 1.47e-6
    shifted_primitive["attributes"]["POSITION"] = tuple(positions)
    left = {**common, "primitives": [primitive]}
    right = {**common, "primitives": [shifted_primitive]}
    if not compare_import_semantics(left, right, tolerance)[1]:
        raise RuntimeError("Semantic guard rejected a within-tolerance value across a spatial-bin boundary")
    controls.append("accept-within-tolerance-bin-boundary")

    reversed_primitive = dict(primitive)
    reversed_primitive["indices"] = (0, 2, 1)
    reversed_snapshot = {**common, "primitives": [reversed_primitive]}
    if compare_import_semantics(left, reversed_snapshot, tolerance)[1]:
        raise RuntimeError("Semantic guard failed to reject reversed triangle winding")
    controls.append("reject-reversed-winding")

    def offset_primitive(identity, offsets, *, mode=4, explicit_mode=True):
        positions = []
        normals = []
        uvs = []
        indices = []
        base_positions = ((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0))
        base_uvs = ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0))
        for offset in offsets:
            first = len(positions) // 3
            for position, uv in zip(base_positions, base_uvs):
                positions.extend((position[0] + offset, position[1], position[2]))
                normals.extend((0.0, 0.0, 1.0))
                uvs.extend(uv)
            indices.extend((first, first + 1, first + 2))
        result = {
            "identity": identity,
            "indices": tuple(indices),
            "attributes": {
                "POSITION": tuple(positions),
                "NORMAL": tuple(normals),
                "TEXCOORD_0": tuple(uvs),
            },
        }
        if explicit_mode:
            result["mode"] = mode
        return result

    def control_snapshot(*primitives):
        return {
            **common,
            "primitives": list(primitives),
            "triangles": sum(len(item["indices"]) // 3 for item in primitives),
        }

    adversarial_left = offset_primitive(("adversarial-bijection", 0, None), (0.0, 0.25e-6))
    adversarial_right = offset_primitive(("adversarial-bijection", 0, None), (0.1e-6, -0.8e-6))
    adversarial_left_snapshot = control_snapshot(adversarial_left)
    adversarial_right_snapshot = control_snapshot(adversarial_right)
    if not compare_import_semantics(
        adversarial_left_snapshot, adversarial_right_snapshot, tolerance
    )[1]:
        raise RuntimeError(
            "Semantic guard rejected an adversarial valid bijection that requires reassignment"
        )
    controls.append("accept-adversarial-complete-bijection")

    reordered_left = dict(adversarial_left)
    reordered_left["indices"] = (3, 4, 5, 0, 1, 2)
    if not compare_import_semantics(
        control_snapshot(reordered_left), adversarial_right_snapshot, tolerance
    )[1]:
        raise RuntimeError("Semantic guard rejected reordered triangles with a valid bijection")
    controls.append("accept-reordered-valid-bijection")

    no_match_left = offset_primitive(("no-complete-bijection", 0, None), (0.0, 10e-6))
    no_match_right = offset_primitive(("no-complete-bijection", 0, None), (0.0, 20e-6))
    no_match_result = compare_import_semantics(
        control_snapshot(no_match_left), control_snapshot(no_match_right), tolerance
    )
    if no_match_result[1] or not no_match_result[3] or "unmatched source triangle" not in no_match_result[3]:
        raise RuntimeError("Semantic guard failed to diagnose an input with no complete bijection")
    controls.append("reject-no-complete-bijection")

    duplicate_left = offset_primitive(("duplicate-candidate", 0, None), (0.0, 0.0))
    duplicate_right = offset_primitive(("duplicate-candidate", 0, None), (0.0, 10e-6))
    duplicate_result = compare_import_semantics(
        control_snapshot(duplicate_left), control_snapshot(duplicate_right), tolerance
    )
    if duplicate_result[1] or not duplicate_result[3] or "assigned sources" not in duplicate_result[3]:
        raise RuntimeError("Semantic guard allowed two source triangles to reuse one target")
    controls.append("reject-target-reuse-for-duplicates")

    omitted_mode = offset_primitive(("default-triangle-mode", 0, None), (0.0,), explicit_mode=False)
    explicit_triangles = offset_primitive(("default-triangle-mode", 0, None), (0.0,), mode=4)
    if omitted_mode.get("mode", 4) != 4:
        raise RuntimeError("Semantic guard did not normalize omitted primitive mode to TRIANGLES (4)")
    controls.append("normalize-omitted-mode-to-triangles")
    if not compare_import_semantics(
        control_snapshot(omitted_mode), control_snapshot(explicit_triangles), tolerance
    )[1]:
        raise RuntimeError("Semantic guard treated omitted mode and explicit TRIANGLES as different")
    controls.append("accept-explicit-vs-omitted-triangles-mode")

    changed_modes = (
        (0, "reject-triangles-to-points"),
        (1, "reject-triangles-to-lines"),
        (2, "reject-triangles-to-line-loop"),
        (3, "reject-triangles-to-line-strip"),
        (5, "reject-triangles-to-triangle-strip"),
        (6, "reject-triangles-to-triangle-fan"),
    )
    for changed_mode, control_name in changed_modes:
        changed = dict(explicit_triangles)
        changed["mode"] = changed_mode
        mode_result = compare_import_semantics(
            control_snapshot(explicit_triangles), control_snapshot(changed), tolerance
        )
        expected_name = primitive_mode_names[changed_mode]
        if mode_result[1] or not mode_result[3] or expected_name not in mode_result[3]:
            raise RuntimeError(f"Semantic guard failed to reject TRIANGLES to {expected_name}")
        controls.append(control_name)

    first_mode_primitive = offset_primitive(("per-primitive-mode-a", 0, None), (0.0,), mode=4)
    second_mode_primitive = offset_primitive(("per-primitive-mode-b", 1, None), (3.0,), mode=4)
    changed_second = dict(second_mode_primitive)
    changed_second["mode"] = 6
    per_primitive_result = compare_import_semantics(
        control_snapshot(first_mode_primitive, second_mode_primitive),
        control_snapshot(first_mode_primitive, changed_second),
        tolerance,
    )
    if (
        per_primitive_result[1]
        or not per_primitive_result[3]
        or "per-primitive-mode-b" not in per_primitive_result[3]
        or "primitive 1" not in per_primitive_result[3]
    ):
        raise RuntimeError("Semantic guard failed to identify a mode change on the second primitive")
    controls.append("reject-mode-change-per-primitive")
    return controls


def export_selected(path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_normals=True,
        export_materials="EXPORT", export_texcoords=True,
    )


for collection_name, filename in exports:
    bpy.ops.wm.open_mainfile(filepath=str(blend_source))
    bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    bpy.ops.object.select_all(action="DESELECT")
    collection = bpy.data.collections[collection_name]
    stage_root = collection.objects.get("SPACECRAFT_STAGE_ROOT") if collection_name == "02_SPACECRAFT" else None
    selected = [obj for obj in collection.all_objects if obj.type == "MESH" or obj is stage_root]
    if collection_name == "02_SPACECRAFT" and stage_root is None:
        raise RuntimeError("SPACECRAFT_STAGE_ROOT is required by the authored interchange contract")
    for obj in selected:
        obj.hide_set(False)
        obj.select_set(True)

    output = folder / filename
    repeat_output = folder / f".{output.stem}-semantic-repeat.glb"
    export_selected(output)
    export_selected(repeat_output)
    primary = semantic_snapshot(output)
    repeat = semantic_snapshot(repeat_output)
    exact_semantics, within_tolerance, maximum_deltas = compare_semantics(primary, repeat, repeat_tolerance)
    repeat_output.unlink()
    if not within_tolerance:
        raise RuntimeError(f"{filename} repeat export exceeds the semantic determinism contract: {maximum_deltas}")

    exported_triangles = 0
    exported_materials = set()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in selected:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        exported_triangles += len(mesh.loop_triangles)
        exported_materials.update(material.name for material in obj.data.materials if material)
        evaluated.to_mesh_clear()

    document = primary["document"]
    root_node = next((index for index, node in enumerate(document.get("nodes", []))
                      if node.get("name") == "SPACECRAFT_STAGE_ROOT"), None)
    root_mesh_descendants = 0
    if root_node is not None:
        pending = list(document["nodes"][root_node].get("children", []))
        while pending:
            index = pending.pop()
            node = document["nodes"][index]
            root_mesh_descendants += int("mesh" in node)
            pending.extend(node.get("children", []))

    # Import into an empty data model so Blender name collision suffixes cannot
    # mask hierarchy or material-binding changes. Re-exporting that imported
    # scene then exercises both sides of the actual glTF round trip.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    bpy.ops.import_scene.gltf(filepath=str(output))
    imported = list(bpy.data.objects)
    imported_meshes = [obj for obj in imported if obj.type == "MESH"]
    imported_triangles = 0
    imported_materials = set()
    for obj in imported_meshes:
        obj.data.calc_loop_triangles()
        imported_triangles += len(obj.data.loop_triangles)
        imported_materials.update(material.name for material in obj.data.materials if material)
    imported_root = next((obj for obj in imported if obj.type == "EMPTY" and obj.name.startswith("SPACECRAFT_STAGE_ROOT")), None)
    imported_root_mesh_descendants = 0
    if imported_root:
        imported_root_mesh_descendants = sum(1 for obj in imported_meshes if obj in imported_root.children_recursive)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.select_set(True)
    roundtrip_output = folder / f".{output.stem}-import-roundtrip.glb"
    export_selected(roundtrip_output)
    imported_snapshot = semantic_snapshot(roundtrip_output)
    (
        roundtrip_exact,
        roundtrip_within_tolerance,
        roundtrip_maximum_deltas,
        roundtrip_diagnostic,
    ) = compare_import_semantics(primary, imported_snapshot, import_roundtrip_tolerance)
    semantic_guard_controls = verify_semantic_guard_controls(primary, import_roundtrip_tolerance)

    hierarchy_required = collection_name == "02_SPACECRAFT"
    hierarchy_preserved = not hierarchy_required or (
        root_node is not None
        and root_mesh_descendants == len(imported_meshes)
        and imported_root_mesh_descendants == len(imported_meshes)
    )
    attributes_complete = all(count > 0 for count in primary["attributeCounts"].values())
    triangle_match = imported_triangles == exported_triangles == primary["triangles"] == imported_snapshot["triangles"]
    material_match = imported_materials == exported_materials and primary["materials"] == imported_snapshot["materials"]
    if not (hierarchy_preserved and attributes_complete and triangle_match and material_match and roundtrip_within_tolerance):
        raise RuntimeError(
            f"{filename} failed glTF import round trip: hierarchy={hierarchy_preserved}, "
            f"attributes={attributes_complete}, triangles={triangle_match}, materials={material_match}, "
            f"semanticTolerance={roundtrip_within_tolerance}, deltas={roundtrip_maximum_deltas}, "
            f"diagnostic={roundtrip_diagnostic}"
        )
    roundtrip_output.unlink()

    report["assets"].append({
        "file": filename,
        "bytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "sourceCollection": collection_name,
        "exportedTriangles": exported_triangles,
        "importedTriangles": imported_triangles,
        "exportedMaterials": len(exported_materials),
        "importedMaterials": len(imported_materials),
        "roundTripTriangleMatch": triangle_match,
        "roundTripMaterialBindingMatch": material_match,
        "primitiveModes": [primitive["mode"] for primitive in primary["primitives"]],
        "requiredVertexAttributes": primary["attributeCounts"],
        "vertexAttributesComplete": attributes_complete,
        "stageRootRequired": hierarchy_required,
        "stageRootExported": root_node is not None,
        "stageRootMeshDescendants": root_mesh_descendants,
        "stageRootImported": imported_root is not None,
        "stageRootImportedMeshDescendants": imported_root_mesh_descendants,
        "hierarchyPreserved": hierarchy_preserved,
        "repeatExportSemanticIdentity": exact_semantics,
        "repeatExportMaximumAbsoluteDelta": maximum_deltas,
        "repeatExportWithinTolerance": within_tolerance,
        "importRoundTripSemanticIdentity": roundtrip_exact,
        "importRoundTripMaximumAbsoluteDelta": roundtrip_maximum_deltas,
        "importRoundTripWithinTolerance": roundtrip_within_tolerance,
        "importRoundTripDiagnostic": roundtrip_diagnostic,
        "semanticGuardNegativeControls": semantic_guard_controls,
    })
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    print(f"Exported and checked {filename}: {exported_triangles} triangles", flush=True)

(folder / "glb-prototype-report.json").write_text(json.dumps(report, indent=2) + "\n")
