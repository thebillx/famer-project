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
    if name.startswith(("Dry earth", "Field tracks", "Rice field", "Rice rows", "Tree foliage", "Tree bark")):
        # The editable Blender scene keeps physically restrained surface grain.
        # The web renderer applies a scale-matched procedural equivalent because
        # the compact runtime mesh format intentionally carries no bitmap maps.
        geometry = m.node_tree.nodes.new("ShaderNodeNewGeometry")
        noise = m.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 7.0 if "Rows" not in name else 11.0
        noise.inputs["Detail"].default_value = 2.2
        noise.inputs["Roughness"].default_value = .68
        m.node_tree.links.new(geometry.outputs["Position"], noise.inputs["Vector"])
        bump = m.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .14
        bump.inputs["Distance"].default_value = .009 if "Tree" not in name else .025
        m.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        m.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        roughness = m.node_tree.nodes.new("ShaderNodeMapRange")
        roughness.inputs["From Min"].default_value = .18
        roughness.inputs["From Max"].default_value = .82
        roughness.inputs["To Min"].default_value = max(.58, rough - .12)
        roughness.inputs["To Max"].default_value = min(.99, rough + .06)
        m.node_tree.links.new(noise.outputs["Fac"], roughness.inputs["Value"])
        m.node_tree.links.new(roughness.outputs["Result"], bsdf.inputs["Roughness"])
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
soil = material("Dry earth", (.13, .084, .046), 0, .96)
track = material("Field tracks", (.23, .16, .088), 0, .94)
water = material("Irrigation water", (.025, .085, .082), .08, .24, .12)
foliage = material("Tree foliage", (.22, .30, .095), 0, .96)
foliage_light = material("Tree foliage · sunlit leaves", (.34, .43, .145), 0, .94)
bark = material("Tree bark", (.12, .083, .049), 0, .96)
greens = [material(f"Rice field {i}", c, 0, .92) for i, c in enumerate([
    (.105, .19, .058), (.12, .205, .063), (.16, .205, .061),
    (.094, .164, .049), (.18, .216, .072), (.11, .179, .052),
])]
crop = material("Rice rows", (.11, .174, .051), 0, .97)


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


SAMPLE_BOUNDS = (-2.50, 2.45, -2.30, 2.27)


def overlaps_sample(cx, cz, half_x, half_z, angle, clearance=.32):
    """SAT clearance between a rotated parcel and the unchanged sample footprint."""
    sx0, sx1, sz0, sz1 = SAMPLE_BOUNDS
    scx, scz = (sx0 + sx1) / 2, (sz0 + sz1) / 2
    shx, shz = (sx1 - sx0) / 2 + clearance, (sz1 - sz0) / 2 + clearance
    dx, dz = cx - scx, cz - scz
    cosine, sine = abs(math.cos(angle)), abs(math.sin(angle))
    # Sample axes, then the candidate parcel's two rotated axes.
    separated_x = abs(dx) >= half_x * cosine + half_z * sine + shx
    separated_z = abs(dz) >= half_x * sine + half_z * cosine + shz
    parcel_x = abs(dx * math.cos(angle) + dz * math.sin(angle))
    parcel_z = abs(-dx * math.sin(angle) + dz * math.cos(angle))
    sample_on_parcel_x = shx * cosine + shz * sine
    sample_on_parcel_z = shx * sine + shz * cosine
    separated_parcel_x = parcel_x >= half_x + sample_on_parcel_x
    separated_parcel_z = parcel_z >= half_z + sample_on_parcel_z
    return not (separated_x or separated_z or separated_parcel_x or separated_parcel_z)


def crop_plot(cx, cz, half_x, half_z, mat, angle, row_count):
    """A softly irregular, deterministic plot with curved rows in its local frame."""
    nx, nz = 12, 12
    v, f = [], []
    for j in range(nz + 1):
        vz = j / nz * 2 - 1
        for i in range(nx + 1):
            ux = i / nx * 2 - 1
            edge = max(abs(ux), abs(vz))
            wobble = (math.sin(vz * 4.1 + cx * .31 + math.sin(ux * 2.1)) * .045
                      + math.sin(ux * 5.1 + cz * .27) * .030
                      + math.sin((ux + vz) * 7.3 + cx * .13) * .015)
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
        base = -half_z + row_margin + (row + terrain_random.uniform(-.12, .12)) * (2 * half_z - 2 * row_margin) / row_count
        start = len(row_v)
        for step in range(5):
            t = step / 4
            lx = -half_x + .14 + t * (2 * half_x - .28)
            bend = .036 * math.sin(t * math.pi * 2 + row * .63 + cx) + .016 * math.sin(t * math.pi * 5 + cz)
            # Broader, low crop ridges remain legible in the wide descent view;
            # their shallow crown still reads as planted ground, not toy rails.
            for lateral, crown in ((-.045, 0), (0, .024), (.045, 0)):
                x, z = local_point(cx, cz, lx, base + bend + lateral, angle)
                row_v.append((x, height(x, z) + .015 + crown, z))
        for step in range(4):
            a = start + step * 3
            b = a + 3
            # This strip's points advance along local X, then across local Z.
            # Reversing the winding keeps the evaluated normals facing up after
            # the Blender-to-runtime axis conversion.
            row_f.extend(((a, a + 1, b + 1), (a, b + 1, b),
                          (a + 1, a + 2, b + 2), (a + 1, b + 2, b + 1)))
    if row_f:
        mesh_obj("Curved planting ridges", row_v, row_f, crop, land, True)


patch("Continuous agricultural ground", -18, 18, -18, 18, soil, segments=48, lift=-.004)
# Neighboring paddies follow the measured sample footprint with a narrow,
# uniform clearance. These make the focal parcel part of a cultivated landscape
# instead of leaving an empty 3×3 hole in the surrounding scene.
nearby_plots = []
for side in (-1, 1):
    for z in (-1.15, 1.05):
        nearby_plots.append((side * 3.88 + terrain_random.uniform(-.06, .06),
                             z + terrain_random.uniform(-.07, .07),
                             .88 + terrain_random.uniform(-.06, .05),
                             .73 + terrain_random.uniform(-.05, .06),
                             side * terrain_random.uniform(-.16, .16)))
for side in (-1, 1):
    for x in (-1.48, 0.0, 1.48):
        nearby_plots.append((x + terrain_random.uniform(-.04, .04),
                             side * 3.55 + terrain_random.uniform(-.05, .05),
                             .69 + terrain_random.uniform(-.04, .04),
                             .68 + terrain_random.uniform(-.04, .04),
                             terrain_random.uniform(-.10, .10)))
for index, (x, z, half_x, half_z, angle) in enumerate(nearby_plots):
    if overlaps_sample(x, z, half_x, half_z, angle):
        continue
    crop_plot(x, z, half_x, half_z, greens[index % len(greens)], angle,
              terrain_random.randint(8, 10))
for ix in range(-4, 5):
    for iz in range(-4, 5):
        # Broad, staggered parcels follow a loose landscape rhythm instead of a
        # repeated tile grid. The fixed seed retains exact rebuilds.
        if terrain_random.random() < .08:
            continue
        x = ix * 3.48 + (iz % 2) * .62 + .25 * math.sin(iz * .71 + ix * .39) + terrain_random.uniform(-.30, .30)
        z = iz * 3.46 + .25 * math.sin(ix * .57 - iz * .31) + terrain_random.uniform(-.30, .30)
        half_x = 1.40 + terrain_random.random() * .30
        half_z = 1.15 + terrain_random.random() * .25
        angle = terrain_random.uniform(-.64, .64) + .07 * math.sin(ix * .6 + iz * .38)
        if overlaps_sample(x, z, half_x, half_z, angle):
            continue
        rows = terrain_random.randint(9, 12)
        crop_plot(x, z, half_x, half_z, greens[(ix * 3 + iz * 7) % len(greens)], angle, rows)
# One continuous sample field: boundary and comparison cover the same geometry.
patch("AgriScope sample field", -2.50, 2.45, -2.30, 2.27, greens[1], segments=18)
for j in range(37):
    z = -2.23 + j * .12
    patch("Sample planting row", -2.47, 2.42, z - .009, z + .009, crop, segments=(12, 1), lift=.016)
for lane, z in enumerate([-5.05]):
    # This winding service path crosses the irrigation channel between parcel
    # rows, clear of both the sample field and its immediately adjoining plots.
    v, f = [], []
    steps = 128
    for i in range(steps + 1):
        x = -16 + 32 * i / steps
        center = z + .075 * math.sin(x * .21 + lane * 1.7) + .027 * math.sin(x * .63 - lane)
        width = .13 * (1 + .12 * math.sin(x * .41 + lane * .9))
        for side in (-1, 1):
            px = x
            pz = center + side * width
            v.append((px, height(px, pz) + .022, pz))
    for i in range(steps):
        a = i * 2
        f.append((a, a + 1, a + 3, a + 2))
    mesh_obj("Winding farm access path", v, f, track, land, True)
def canal_ribbon(name, side, mat, width, lift):
    v, f = [], []
    steps = 160
    for i in range(steps + 1):
        z = -16 + 32 * i / steps
        center = -4.42 + .16 * math.sin(z * .19) + .055 * math.sin(z * .53 + .7)
        local_width = width * (.90 + .10 * math.sin(z * .31 + .4))
        if side == 0:
            edges = (-local_width / 2, 0, local_width / 2)
        else:
            bank = center + side * (.10 + local_width / 2)
            edges = (-width / 2, width / 2)
        for edge_index, offset in enumerate(edges):
            x = center + offset if side == 0 else bank + offset
            y = height(x, z) + lift
            if side == 0:
                y += -.046 if edge_index == 1 else -.018
            v.append((x, y, z))
    for i in range(steps):
        if side == 0:
            a = i * 3
            b = a + 3
            f.extend(((a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)))
        else:
            a = i * 2
            f.append((a, a + 2, a + 3, a + 1))
    mesh_obj(name, v, f, mat, land, True)


canal_ribbon("Meandering irrigation canal", 0, water, .28, .018)
for side in (-1, 1):
    canal_ribbon("Raised canal bank", side, track, .15, .035)

def tapered_branch(parent, name, start, end, base_radius, tip_radius, mat=bark, sides=8):
    a, b = Vector(to_blender(start)), Vector(to_blender(end))
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=base_radius, radius2=tip_radius,
                                    depth=direction.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    move_collection(obj, parent)
    return obj


def add_leaf(base, direction, length, width, material, batches, roll=0):
    """Build a thin, pointed leaf with a raised midrib and two visible faces."""
    origin = Vector(base)
    axis = Vector(direction).normalized()
    across = Vector((-axis.z, .16, axis.x)).normalized()
    if across.length < .1:
        across = Vector((1, 0, 0))
    side = axis.cross(across).normalized()
    across = (across * math.cos(roll) + side * math.sin(roll)).normalized()
    lift = Vector((0, .035 * length, 0))
    points = [origin,
              origin + axis * (length * .40) - across * width,
              origin + axis * (length * .62) + lift,
              origin + axis * (length * .40) + across * width,
              origin + axis * length]
    group = batches.setdefault(material.name, {"material": material, "vertices": [], "faces": []})
    offset = len(group["vertices"])
    group["vertices"].extend(tuple(point) for point in points)
    top = [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)]
    group["faces"].extend(tuple(offset + i for i in face) for face in top)
    group["faces"].extend(tuple(offset + i for i in reversed(face)) for face in top)


# Three branched silhouettes at a believable crop-edge scale. Batched leaves
# grow along tapering limbs; no sphere crowns or individual runtime plant calls.
tree_specs = [
    {"name": "Broad irregular crown", "trunk": 1.02, "spread": (.59, .55), "height": (.80, 1.48), "branches": 8, "leaf_density": 1.0},
    {"name": "Tall layered crown", "trunk": 1.28, "spread": (.45, .42), "height": (1.14, 1.90), "branches": 7, "leaf_density": .94},
    {"name": "Airy forked crown", "trunk": 1.17, "spread": (.62, .54), "height": (1.05, 1.82), "branches": 7, "leaf_density": .74},
]
for variant_index, spec in enumerate(tree_specs):
    parent = tree_variants[variant_index]
    rng = random.Random(730 + variant_index)
    trunk_height = spec["trunk"]
    tapered_branch(parent, "Tapered central trunk", (0, 0, 0), (0, trunk_height, 0), .071, .029, sides=9)
    leaf_batches = {}
    for index in range(spec["branches"]):
        azimuth = index * math.tau / spec["branches"] + rng.uniform(-.22, .22)
        spread = rng.uniform(.68, 1.0)
        start_height = trunk_height * rng.uniform(.48, .82)
        end = (math.cos(azimuth) * spec["spread"][0] * spread,
               rng.uniform(*spec["height"]),
               math.sin(azimuth) * spec["spread"][1] * spread)
        start = (0, start_height, 0)
        tapered_branch(parent, "Tapered primary limb", start, end, .030, .008, sides=7)
        split = rng.uniform(.56, .78)
        fork_start = tuple(start[k] + (end[k] - start[k]) * split for k in range(3))
        fork_angle = azimuth + rng.choice((-1, 1)) * rng.uniform(.42, .70)
        fork_end = (end[0] + math.cos(fork_angle) * .17,
                    end[1] + rng.uniform(.08, .22),
                    end[2] + math.sin(fork_angle) * .17)
        tapered_branch(parent, "Forked secondary limb", fork_start, fork_end, .013, .004, sides=6)
        for step in range(1, 6):
            t = step / 6
            center = tuple(start[k] + (end[k] - start[k]) * t for k in range(3))
            for side in (-1, 1):
                for layer in range(3):
                    leaf_angle = azimuth + side * rng.uniform(.42, 1.26) + rng.uniform(-.36, .36)
                    leaf_direction = (math.cos(leaf_angle) * .58 + math.cos(azimuth) * .34,
                                      rng.uniform(.48, .90),
                                      math.sin(leaf_angle) * .58 + math.sin(azimuth) * .34)
                    length = rng.uniform(.26, .40) * spec["leaf_density"]
                    leaf_origin = (center[0] + math.cos(leaf_angle) * rng.uniform(.025, .075),
                                   center[1] + rng.uniform(-.035, .035),
                                   center[2] + math.sin(leaf_angle) * rng.uniform(.025, .075))
                    shade = foliage_light if rng.random() > .48 else foliage
                    add_leaf(leaf_origin, leaf_direction, length, length * rng.uniform(.40, .60), shade, leaf_batches, rng.uniform(-math.pi, math.pi))
        # A small, upward-facing terminal spray breaks the repeated radial outline.
        for _ in range(5):
            leaf_angle = azimuth + rng.uniform(-1.15, 1.15)
            direction = (math.cos(leaf_angle) * rng.uniform(.36, .72),
                         rng.uniform(.60, .95),
                         math.sin(leaf_angle) * rng.uniform(.36, .72))
            length = rng.uniform(.27, .40) * spec["leaf_density"]
            shade = foliage_light if rng.random() > .48 else foliage
            add_leaf(end, direction, length, length * rng.uniform(.40, .60), shade, leaf_batches, rng.uniform(-math.pi, math.pi))
    for foliage_index, leaf_batch in enumerate(leaf_batches.values()):
        mesh_obj("Batched pointed leaves", leaf_batch["vertices"], leaf_batch["faces"],
                 leaf_batch["material"], parent, False)


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
