"""Render the six locked static acceptance cameras from the master .blend."""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import time

import bpy
from mathutils import Matrix, Quaternion, Vector


folder = Path(os.environ.get("AGRISCOPE_BLENDER_OUTPUT", str(Path(__file__).resolve().parent / "output")))
source = folder / "AgriScope-Cinematic-Assets.blend"
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
contract = json.loads((Path(__file__).resolve().parent / "camera-contract.json").read_text())
locked = [record for record in contract["cameras"] if record["viewport"] == "desktop"]
requested_shots = {int(value) for value in os.environ.get("AGRISCOPE_RENDER_SHOTS", "").split(",") if value.strip()}
if requested_shots:
    locked = [record for record in locked if record["shot"] in requested_shots]
runtime_to_blender = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def to_blender(point):
    return Vector((point[0], -point[2], point[1]))


def runtime_rotation(quaternion):
    q = Quaternion((quaternion[3], quaternion[0], quaternion[1], quaternion[2]))
    return runtime_to_blender @ q.to_matrix() @ runtime_to_blender.transposed()


def set_material_opacity(material_name, value):
    material = bpy.data.materials.get(material_name)
    if not material or not material.use_nodes:
        return
    opacity = material.node_tree.nodes.get("GLOBAL_OPACITY")
    if opacity:
        opacity.inputs[1].default_value = value
    else:
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = value


def color_mix(first, second, amount):
    def value(hex_color):
        return tuple(int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5))
    a, b = value(first), value(second)
    return tuple(a[index] + (b[index] - a[index]) * amount for index in range(3))


def configure(record):
    state = record["scene"]
    scene.camera = bpy.data.objects[f"CAM_SHOT_{record['shot']:02d}_DESKTOP_{record['slug'].upper().replace('-', '_')}"]
    spacecraft = bpy.data.objects["SPACECRAFT_STAGE_ROOT"]
    spacecraft.location = to_blender(state["spacecraft"]["position"])
    spacecraft.rotation_euler = runtime_rotation(state["spacecraft"]["quaternion"]).to_euler()
    for obj in bpy.data.collections["02_SPACECRAFT"].objects:
        obj.hide_render = not state["spacecraft"]["visible"]

    earth_visible = state["earth"]["surfaceVisible"]
    bpy.data.objects["EARTH_SURFACE"].hide_render = not earth_visible
    bpy.data.objects["EARTH_CLOUD_SHADOW"].hide_render = not state["earth"]["cloudVisible"] or state["earth"]["cloudShadowOpacity"] < .025
    bpy.data.objects["EARTH_CLOUD_LAYER"].hide_render = not state["earth"]["cloudVisible"] or state["earth"]["cloudOpacity"] < .025
    bpy.data.objects["EARTH_ATMOSPHERE_SHELL"].hide_render = state["earth"]["atmosphereOpacity"] < .025
    # The outline is a geographic locator on the Earth surface.  Once the Earth
    # clears during descent it must not remain as an unsupported floating mark.
    bpy.data.objects["THAILAND_RELIEF_OUTLINE"].hide_render = not earth_visible or record["shot"] != 4
    set_material_opacity("MAT_EARTH_CLOUDS", state["earth"]["cloudOpacity"])
    set_material_opacity("MAT_EARTH_CLOUD_SHADOW", state["earth"]["cloudShadowOpacity"])
    set_material_opacity("MAT_THAILAND_FOCUS_GOLD", state["earth"]["thailandFocusOpacity"])

    terrain_visible = state["terrain"]["visible"]
    for obj in bpy.data.collections["08_EXPORT"].objects:
        obj.hide_render = not terrain_visible
        if obj.type == "MESH" and obj.data.shape_keys:
            obj.data.shape_keys.key_blocks["FIELD_FLATTEN_MAX"].value = state["terrain"]["flatten"] / .92
    for obj in bpy.data.collections["VEGETATION_PLACEMENTS_DESKTOP"].objects:
        obj.hide_render = not (terrain_visible and record["progress"] >= .465)
        x, z = obj["runtime_x"], obj["runtime_z"]
        obj.location.z = obj["runtime_base_height"] + (x * x + z * z) / 80 * state["terrain"]["flatten"]
    boundary = bpy.data.objects["SAMPLE_BOUNDARY_STATIC_PARITY"]
    boundary.hide_render = not (terrain_visible and record["progress"] >= .50)

    background = color_mix(state["atmosphere"]["from"], state["atmosphere"]["to"], state["atmosphere"]["backgroundMix"])
    world_background = scene.world.node_tree.nodes.get("Background")
    world_background.inputs["Color"].default_value = (*background, 1)
    world_background.inputs["Strength"].default_value = ((.30 + .10 * state["atmosphere"]["backgroundMix"])
                                                           if terrain_visible else
                                                           (.18 + .08 * state["atmosphere"]["backgroundMix"]))
    bpy.data.objects["LIGHT_SOLAR_KEY"].data.energy = state["lighting"]["sun"] * 1.75
    bpy.data.objects["LIGHT_SKY_FILL"].data.energy = state["lighting"]["fill"] * 1450
    bpy.data.objects["LIGHT_FIELD_BOUNCE"].data.energy = state["lighting"]["hemisphere"] * 950


scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 5
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 2
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.compression = 30
scene.render.use_file_extension = True
for light in bpy.data.lights:
    light.use_shadow = True

output_dirs = {kind: folder / "renders" / kind for kind in ("beauty", "clay", "material-id", "wireframe")}
for output in output_dirs.values():
    output.mkdir(parents=True, exist_ok=True)

clay = bpy.data.materials.new("REVIEW_CLAY")
clay.use_nodes = True
clay_bsdf = clay.node_tree.nodes.get("Principled BSDF")
clay_bsdf.inputs["Base Color"].default_value = (.34, .34, .32, 1)
clay_bsdf.inputs["Roughness"].default_value = .72

palette = [(0.90,.19,.12,1),(0.12,.60,.93,1),(0.18,.78,.36,1),(0.91,.63,.10,1),
           (0.58,.25,.88,1),(0.05,.72,.70,1),(0.93,.36,.64,1),(0.60,.66,.14,1)]
review_materials = [material for material in bpy.data.materials if not material.name.startswith("REVIEW_")]
original_diffuse = {material.name: tuple(material.diffuse_color) for material in review_materials}

frames = []


def render(kind, record):
    filename = f"shot-{record['shot']:02d}-{record['slug']}.png"
    path = output_dirs[kind] / filename
    scene.render.filepath = str(path)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - started
    frames.append({"kind": kind, "shot": record["shot"], "file": str(path.relative_to(folder)),
                   "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                   "renderSeconds": round(elapsed, 3)})
    print(f"Rendered {kind} shot {record['shot']} in {elapsed:.2f}s", flush=True)


for record in locked:
    configure(record)
    scene.view_layers[0].material_override = None
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 20
    render("beauty", record)

    scene.view_layers[0].material_override = None
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (.36, .35, .32)
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    render("clay", record)

    scene.view_layers[0].material_override = None
    # Workbench reads material.diffuse_color directly.  Changing linked mesh
    # slots corrupted later beauty frames because the review tree copies share
    # their prototype mesh data.  Palette and restore the materials instead.
    for index, material in enumerate(review_materials):
        material.diffuse_color = palette[index % len(palette)]
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = False
    render("material-id", record)
    for material in review_materials:
        material.diffuse_color = original_diffuse[material.name]

    if record["shot"] in (5, 6):
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
        scene.display.shading.cavity_type = "BOTH"
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.show_wire = True
                obj.show_all_edges = True
        render("wireframe", record)
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.show_wire = False

report = {
    "schema": 1,
    "sourceBlend": source.name,
    "sourceBlendBytes": source.stat().st_size,
    "sourceBlendSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "engine": "Cycles CPU for beauty; Blender Workbench for clay, material ID and diagnostic wireframe",
    "colorManagement": {"viewTransform": "AgX", "look": "AgX - Medium High Contrast"},
    "resolution": [1440, 900],
    "lockedShots": [record["shot"] for record in locked],
    "frames": frames,
    "motionRendered": False,
}
(folder / "static-render-report.json").write_text(json.dumps(report, indent=2) + "\n")
