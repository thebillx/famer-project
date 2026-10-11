"""Author editable Blender meshes and compact local Three.js assets.

Run with Blender --background --python tools/cinematic/blender/build_assets.py
or with a Python environment containing the official bpy 4.5 LTS package.
Outputs are original conceptual artwork, not a Sentinel-2 engineering replica.
"""
from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path
import random
import struct

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(os.environ.get("AGRISCOPE_RUNTIME_OUTPUT", str(ROOT / "apps/web/public/cinematic/models")))
EVIDENCE = Path(os.environ.get("AGRISCOPE_BLENDER_OUTPUT", str(ROOT / "tools/cinematic/blender/output")))
OUT.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)
random.seed(41)
terrain_random = random.Random(20261011)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)


def material(name, color, metal=0, rough=.7, coat=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Coat Weight"].default_value = coat
    m["metalness"] = metal
    m["roughness"] = rough
    m["clearcoat"] = coat
    return m


gold = material("MLI · champagne gold", (.43, .25, .074), .86, .34)
silver = material("Anodized aluminium", (.42, .49, .52), .88, .3)
white = material("Thermal radiator", (.62, .67, .65), .13, .67)
dark = material("Instrument carbon", (.014, .021, .027), .5, .34)
cells = material("Photovoltaic cells", (.008, .029, .058), .65, .27, .42)
glass = material("Recessed optical glass", (.005, .025, .029), .26, .14, .9)
copper = material("Harness copper", (.24, .10, .035), .75, .37)
soil = material("Dry earth", (.17, .15, .105), 0, .96)
track = material("Field tracks", (.25, .22, .16), 0, .93)
water = material("Irrigation water", (.032, .068, .066), .08, .31, .12)
foliage = material("Tree foliage", (.11, .145, .066), 0, .96)
bark = material("Tree bark", (.12, .083, .049), 0, .96)
greens = [material(f"Rice field {i}", c, 0, .92) for i, c in enumerate([
    (.17, .19, .086), (.155, .181, .076), (.202, .203, .091),
    (.142, .171, .078), (.184, .192, .084), (.151, .174, .07),
])]
crop = material("Rice rows", (.082, .145, .044), 0, .97)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


ship = collection("01 · Spacecraft / editable parts")
land = collection("02 · Agricultural surface / editable parts")
tree_root = collection("03 · Tree silhouettes")
tree_variants = []
for name in ("Round canopy", "Tall canopy", "Open crown"):
    variant = bpy.data.collections.new(f"Tree · {name}")
    tree_root.children.link(variant)
    tree_variants.append(variant)


def to_blender(p):
    return (p[0], -p[2], p[1])


def move_collection(obj, parent):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    parent.objects.link(obj)


def mesh_obj(name, vertices, faces, mat, parent, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(v) for v in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    parent.objects.link(obj)
    obj.data.materials.append(mat)
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    return obj


def box(name, center, size, mat, parent=ship, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=to_blender(center))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    move_collection(o, parent)
    if bevel:
        b = o.modifiers.new("Manufactured edge radii", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.affect = "EDGES"
        n = o.modifiers.new("Weighted engineering normals", "WEIGHTED_NORMAL")
        n.keep_sharp = True
    return o


def tube(name, a, b, radius, mat, parent=ship, sides=12):
    start, end = Vector(to_blender(a)), Vector(to_blender(b))
    d = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=d.length, location=(start + end) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    move_collection(o, parent)
    return o


def lathe(name, profile, mat, center=(0, 0, 0), parent=ship, segments=64):
    v = []
    for radius, z in profile:
        for i in range(segments):
            a = i * math.tau / segments
            v.append((center[0] + math.cos(a) * radius, center[1] + math.sin(a) * radius, center[2] + z))
    f = []
    for j in range(len(profile) - 1):
        for i in range(segments):
            k = j * segments + i
            n = j * segments + (i + 1) % segments
            f.append((k, n, n + segments, k + segments))
    return mesh_obj(name, v, f, mat, parent, True)


# Structural bus, separate folded blankets, radiator fins and harness routing.
box("Load-bearing bus", (0, 0, 0), (1.64, 2.05, 1.46), dark, bevel=.075)
box("Upper equipment deck", (0, 1.055, 0), (1.78, .13, 1.59), silver, bevel=.022)
box("Lower launch adapter", (0, -1.09, 0), (1.62, .12, 1.5), silver, bevel=.018)
for x in [-.79, .79]:
    for z in [-.70, .70]:
        box("Corner rail", (x, 0, z), (.067, 2.06, .067), silver, bevel=.009)
for side in [-1, 1]:
    nx, ny = 12, 20
    v, f = [], []
    for j in range(ny + 1):
        y = -.94 + j / ny * 1.91
        for i in range(nx + 1):
            z = -.68 + i / nx * 1.36
            folds = .018 * math.sin(i * .95 + j * .31) + .009 * math.cos(i * .4 - j * 1.34)
            folds *= math.sin(math.pi * i / nx) * math.sin(math.pi * j / ny)
            v.append((side * (.832 + folds), y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            f.append((a + nx + 1, a + nx + 2, a + 1, a) if side > 0 else (a, a + 1, a + nx + 2, a + nx + 1))
    mesh_obj("Wrinkled MLI side blanket", v, f, gold, ship, True)
    box("Radiator plate", (side * .861, .34, -.13), (.035, .95, .86), white, bevel=.012)
    for j in range(9):
        box("Radiator fin", (side * .884, -.075 + j * .101, -.13), (.022, .016, .86), silver)
    for y in [-.93, .97]:
        tube("MLI seam", (side * .856, y, -.68), (side * .856, y, .68), .014, copper)
for y in [-.69, .81]:
    box("Instrument blanket", (0, y, .765), (1.43, .31, .054), gold, bevel=.025)
for x in [-.68, .68]:
    box("Instrument blanket side", (x, .05, .765), (.20, 1.21, .054), gold, bevel=.02)
for j in range(5):
    tube("Harness bundle", (-.78 + j * .035, -.90, .79), (-.78 + j * .035, .95, .79), .009, copper, sides=8)

# A deep black baffle and recessed optic, not a protruding camera bulb.
lathe("Payload outer shroud", [(.50, -.02), (.50, .15), (.46, .68), (.44, .71)], dark, (0, .18, .94))
lathe("Payload front bezel", [(.45, .64), (.46, .66), (.46, .71), (.40, .71), (.40, .66)], silver, (0, .18, .94))
for z in [.02, .18, .34, .52]:
    lathe("Baffle collar", [(.495, z), (.51, z), (.51, z + .022), (.495, z + .022)], dark, (0, .18, .94))
lathe("Internal light trap", [(.40, .70), (.37, .48), (.34, .46)], dark, (0, .18, .94))
lathe("Optical retaining ring", [(.33, .48), (.34, .49), (.34, .505), (.305, .505), (.305, .48)], copper, (0, .18, .94))
profile = [(i / 20 * .305, .479 + .018 * (1 - (i / 20) ** 2)) for i in range(21)]
lathe("Optical element", profile[::-1], glass, (0, .18, .94))
for x in [-.63, .63]:
    for y in [-.71, -.25, .27, .79]:
        tube("Fastener", (x, y, .78), (x, y, .797), .018, silver, sides=12)

# Actual folded front thermal blanket, with an opening for the recessed optic.
v, f = [], []
nx, ny = 28, 32
for j in range(ny + 1):
    y = -.96 + j / ny * 1.94
    for i in range(nx + 1):
        x = -.74 + i / nx * 1.48
        fold = .012 * math.sin(x * 29 + y * 17) + .006 * math.sin(y * 47 - x * 13)
        v.append((x, y, .773 + fold))
for j in range(ny):
    for i in range(nx):
        x = -.74 + (i + .5) / nx * 1.48
        y = -.96 + (j + .5) / ny * 1.94
        if math.hypot(x, y - .18) < .57:
            continue
        k = j * (nx + 1) + i
        f.append((k, k + 1, k + nx + 2, k + nx + 1))
mesh_obj("Folded front MLI blanket", v, f, gold, ship, True)

# Six solar leaves: separate cells, busbars, backsheets and deployment hinges.
for sign in [-1, 1]:
    tube("Solar deployment boom", (sign * .79, 0, 0), (sign * 2.03, 0, 0), .056, silver)
    tube("Boom brace", (sign * .78, -.47, -.30), (sign * 1.92, 0, 0), .023, silver)
    for j in range(3):
        x = sign * (2.45 + j * 1.45)
        box("Solar panel frame", (x, 0, -.015), (1.40, 2.36, .074), silver, bevel=.016)
        box("Carbon backsheet", (x, 0, -.013), (1.31, 2.27, .078), dark, bevel=.008)
        for row in range(10):
            for col in range(5):
                xx, yy = x - .515 + col * .258, -1.00 + row * .222
                box("Solar cell", (xx, yy, .033), (.242, .204, .008), cells, bevel=.003)
                box("Cell busbar", (xx, yy, .039), (.227, .0024, .002), silver)
        for y in [-.89, .89]:
            tube("Panel hinge", (x + sign * .66, y, -.014), (x + sign * .71, y, -.014), .035, silver)
        for y in [-.83, .83]:
            tube("Backsheet brace", (x - .60, y, -.07), (x + .60, -y, -.07), .014, dark)

# Parabolic telemetry dish and real support rods.
dish = lathe("Telemetry reflector", [(i / 18 * .36, (i / 18 * .36) ** 2 * .8) for i in range(19)][::-1], white, (.32, 1.38, -.38), segments=48)
tube("Dish mast", (.32, 1.03, -.38), (.32, 1.45, -.38), .035, silver)
for a in [0, math.tau / 3, 2 * math.tau / 3]:
    tube("Reflector feed support", (.32 + math.cos(a) * .32, 1.38 + math.sin(a) * .32, -.30), (.32, 1.38, .02), .007, silver, sides=8)
tube("Feed", (.32, 1.38, -.02), (.32, 1.38, .07), .021, dark)
tube("Telemetry antenna", (-.55, 1.05, -.42), (-.55, 2.05, -.42), .012, silver, sides=10)
for x in [-.54, .54]:
    for z in [-.47, .47]:
        tube("Attitude thruster", (x, -1.10, z), (x, -1.25, z), .068, dark)


def height(x, z):
    return -(x * x + z * z) / 80 + .05 + math.sin(x * .52) * math.sin(z * .43) * .035


def patch(name, x0, x1, z0, z1, mat, parent=land, segments=4, lift=0):
    sx, sz = segments if isinstance(segments, tuple) else (segments, segments)
    v, f = [], []
    for j in range(sz + 1):
        z = z0 + (z1 - z0) * j / sz
        for i in range(sx + 1):
            x = x0 + (x1 - x0) * i / sx
            v.append((x, height(x, z) + lift, z))
    for j in range(sz):
        for i in range(sx):
            a = j * (sx + 1) + i
            f.append((a, a + sx + 1, a + sx + 2, a + 1))
    return mesh_obj(name, v, f, mat, parent, True)


def local_point(cx, cz, lx, lz, angle):
    return (cx + lx * math.cos(angle) - lz * math.sin(angle),
            cz + lx * math.sin(angle) + lz * math.cos(angle))


def crop_plot(cx, cz, half_x, half_z, mat, angle, row_count):
    """A softly irregular, deterministic plot with curved rows in its local frame."""
    nx, nz = 12, 12
    v, f = [], []
    for j in range(nz + 1):
        vz = j / nz * 2 - 1
        for i in range(nx + 1):
            ux = i / nx * 2 - 1
            edge = max(abs(ux), abs(vz))
            wobble = (math.sin(vz * 4.1 + cx * .31 + math.sin(ux * 2.1)) * .11
                      + math.sin(ux * 5.1 + cz * .27) * .075
                      + math.sin((ux + vz) * 7.3 + cx * .13) * .035)
            edge_weight = max(0, (edge - .38) / .62)
            scale = 1 + wobble * edge_weight
            # Cut back parcel corners and soften long straight sides. This uses
            # the existing grid resolution, so visible outline gains no triangles.
            rounded_x = ux * (1 - .13 * abs(vz) ** 3)
            rounded_z = vz * (1 - .11 * abs(ux) ** 3)
            lx, lz = rounded_x * half_x * scale, rounded_z * half_z * scale
            x, z = local_point(cx, cz, lx, lz, angle)
            v.append((x, height(x, z) + .001, z))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            f.append((a, a + nx + 1, a + nx + 2, a + 1))
    mesh_obj("Irregular crop plot", v, f, mat, land, True)

    # Aggregate all ridges for this plot into one mesh object. Gentle bends and
    # spacing drift break the comb-like repetition without changing the sample field.
    row_v, row_f = [], []
    for row in range(row_count):
        row_margin = .14
        base = -half_z + row_margin + (row + terrain_random.uniform(-.14, .14)) * (2 * half_z - 2 * row_margin) / row_count
        start = len(row_v)
        for step in range(5):
            t = step / 4
            lx = -half_x + .14 + t * (2 * half_x - .28)
            bend = .036 * math.sin(t * math.pi * 2 + row * .63 + cx) + .016 * math.sin(t * math.pi * 5 + cz)
            for side in (-.009, .009):
                x, z = local_point(cx, cz, lx, base + bend + side, angle)
                row_v.append((x, height(x, z) + .016, z))
        for step in range(4):
            a = start + step * 2
            row_f.append((a, a + 2, a + 3, a + 1))
    if row_f:
        mesh_obj("Curved planting ridges", row_v, row_f, crop, land, True)


patch("Continuous agricultural ground", -18, 18, -18, 18, soil, segments=48, lift=-.004)
for ix in range(-4, 5):
    for iz in range(-4, 5):
        # Broad, staggered parcels follow a loose landscape rhythm instead of a
        # repeated tile grid. The fixed seed retains exact rebuilds.
        if terrain_random.random() < .14 or (abs(ix) <= 1 and abs(iz) <= 1):
            continue
        x = ix * 3.82 + (iz % 2) * .76 + .31 * math.sin(iz * .71 + ix * .39) + terrain_random.uniform(-.48, .48)
        z = iz * 3.73 + .29 * math.sin(ix * .57 - iz * .31) + terrain_random.uniform(-.48, .48)
        half_x = 1.08 + terrain_random.random() * .38
        half_z = .91 + terrain_random.random() * .37
        angle = terrain_random.uniform(-.72, .72) + .07 * math.sin(ix * .6 + iz * .38)
        rows = terrain_random.randint(8, 14)
        crop_plot(x, z, half_x, half_z, greens[(ix * 3 + iz * 7) % len(greens)], angle, rows)
# One continuous sample field: boundary and comparison cover the same geometry.
patch("AgriScope sample field", -2.50, 2.45, -2.30, 2.27, greens[1], segments=18)
for j in range(37):
    z = -2.23 + j * .12
    patch("Sample planting row", -2.47, 2.42, z - .009, z + .009, crop, segments=(12, 1), lift=.016)
for z in [-3.66, 3.64]:
    patch("Farm access track", -16, 16, z - .07, z + .07, track, segments=(40, 1), lift=.022)
def canal_ribbon(name, side, mat, width, lift):
    v, f = [], []
    steps = 128
    for i in range(steps + 1):
        z = -16 + 32 * i / steps
        center = -4.42 + .09 * math.sin(z * .19) + .035 * math.sin(z * .53 + .7)
        if side == 0:
            edges = (-width / 2, width / 2)
        else:
            bank = center + side * (.10 + width / 2)
            edges = (-width / 2, width / 2)
        for offset in edges:
            x = center + offset if side == 0 else bank + offset
            v.append((x, height(x, z) + lift, z))
    for i in range(steps):
        a = i * 2
        f.append((a, a + 2, a + 3, a + 1))
    mesh_obj(name, v, f, mat, land, True)


canal_ribbon("Meandering irrigation canal", 0, water, .20, .024)
for side in (-1, 1):
    canal_ribbon("Uneven canal bank", side, track, .06, .032)

def canopy_blob(parent, name, center, scale, rng):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    for vertex in obj.data.vertices:
        vertex.co *= .76 + rng.random() * .50
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(foliage)
    move_collection(obj, parent)


# Three clearly distinct silhouettes share the same two material batches at runtime.
tree_specs = [
    ("Round canopy", .94, [((.02, 1.06, .01), (.49, .32, .43)), ((-.28, 1.02, .06), (.36, .30, .37)), ((.30, .97, -.14), (.37, .31, .34)), ((.02, 1.30, -.08), (.34, .29, .36))]),
    ("Tall canopy", 1.12, [((.01, 1.25, .02), (.37, .38, .31)), ((-.22, 1.20, .09), (.31, .34, .27)), ((.24, 1.31, -.10), (.31, .39, .27)), ((.04, 1.56, -.02), (.30, .31, .27))]),
    ("Open crown", 1.10, [((-.27, 1.39, .10), (.34, .31, .35)), ((.27, 1.40, -.13), (.33, .32, .30)), ((.03, 1.62, .04), (.32, .30, .34))]),
]
for variant_index, (name, trunk_height, blobs) in enumerate(tree_specs):
    parent = tree_variants[variant_index]
    rng = random.Random(730 + variant_index)
    tube("Visible tapered trunk", (0, 0, 0), (0, trunk_height, 0), .035, bark, parent, sides=9)
    for index, (center, scale) in enumerate(blobs):
        if index < len(blobs) - 1:
            tube("Forked branch", (0, trunk_height * .42, 0), center, .012, bark, parent, sides=7)
        canopy_blob(parent, "Varied leaf crown", center, scale, rng)


def export_collection(coll, filename, include_data=False, destination=OUT):
    """Material-batch evaluated Blender geometry, preserving split normals.

    The custom asset is a local mesh container, not a runtime dependency.
    Signed 16-bit positions and normalized 8-bit normals keep mobile transfers
    small; every position reconstructs a real Blender-authored vertex.
    """
    deps = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for obj in coll.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        transform = evaluated.matrix_world
        normal_matrix = transform.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            mat = obj.data.materials[tri.material_index]
            group = groups.setdefault(mat.name, {"material": mat, "vertices": [], "indices": [], "lookup": {}})
            for loop in tri.loops:
                p = transform @ mesh.vertices[mesh.loops[loop].vertex_index].co
                n = (normal_matrix @ mesh.corner_normals[loop].vector).normalized()
                values = (p.x, p.z, -p.y, n.x, n.z, -n.y)
                key = tuple(round(v, 6) for v in values)
                idx = group["lookup"].get(key)
                if idx is None:
                    idx = len(group["vertices"])
                    group["lookup"][key] = idx
                    group["vertices"].append(values)
                group["indices"].append(idx)
        evaluated.to_mesh_clear()
    meshes = []
    total = 0
    for name, group in groups.items():
        points = group["vertices"]
        lower = [min(p[k] for p in points) for k in range(3)]
        upper = [max(p[k] for p in points) for k in range(3)]
        offset = [(a + b) / 2 for a, b in zip(lower, upper)]
        scale = [max((b - a) / 2, .00001) for a, b in zip(lower, upper)]
        pos, norms = bytearray(), bytearray()
        for p in points:
            pos.extend(struct.pack("<hhh", *[round((p[k] - offset[k]) / scale[k] * 32767) for k in range(3)]))
            norms.extend(struct.pack("<bbb", *[max(-127, min(127, round(p[k] * 127))) for k in range(3, 6)]))
        use32 = len(points) > 65535
        indices = struct.pack(f"<{len(group['indices'])}{'I' if use32 else 'H'}", *group["indices"])
        mat = group["material"]
        meshes.append({"name": name, "material": {"color": list(mat.diffuse_color[:3]), "metalness": mat["metalness"], "roughness": mat["roughness"], "clearcoat": mat["clearcoat"]}, "offset": offset, "scale": scale, "position": base64.b64encode(pos).decode(), "normal": base64.b64encode(norms).decode(), "index": base64.b64encode(indices).decode(), "index32": use32})
        total += len(group["indices"]) // 3
    data = {"schema": 1, "generator": f"Blender {bpy.app.version_string}", "conceptual": True, "triangles": total, "meshes": meshes}
    destination.mkdir(parents=True, exist_ok=True)
    (destination / filename).write_text(json.dumps(data, separators=(",", ":")))
    print(f"Exported {filename}: {total} real triangles in {len(meshes)} material batches", flush=True)
    result = {"file": filename, "triangles": total, "batches": len(meshes)}
    if include_data:
        result["data"] = data
    return result


ship_stats = export_collection(ship, "spacecraft.mesh.json")
land_stats = export_collection(land, "farmland.mesh.json")
variant_output = EVIDENCE / "tree-variants"
variants = [export_collection(tree, f"tree-variant-{i + 1}.mesh.json", include_data=True, destination=variant_output)["data"] for i, tree in enumerate(tree_variants)]
tree_asset = {"schema": 1, "generator": f"Blender {bpy.app.version_string}", "conceptual": True,
              "triangles": variants[0]["triangles"], "meshes": variants[0]["meshes"], "variants": variants}
(OUT / "tree.mesh.json").write_text(json.dumps(tree_asset, separators=(",", ":")))
stats = [ship_stats, land_stats, {"file": "tree.mesh.json", "triangles": sum(v["triangles"] for v in variants),
                                  "batches": max(len(v["meshes"]) for v in variants), "variants": len(variants)}]
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.world.color = (.035, .04, .055)
scene["AgriScope"] = "Original conceptual EO spacecraft and synthetic agricultural landscape"
scene["Asset license"] = "Original project artwork; no third-party spacecraft model"
scene["Export schema"] = "Material-batched quantized true meshes, decoded by mesh-assets.js"
bpy.ops.wm.save_as_mainfile(filepath=str(EVIDENCE / "AgriScope-Cinematic-Assets.blend"))
(EVIDENCE / "asset-build.json").write_text(json.dumps({"blender": bpy.app.version_string, "assets": stats}, indent=2))
print("Saved editable Blender source", flush=True)
