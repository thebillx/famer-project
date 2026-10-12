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


gold = material("MLI · champagne gold", (.50, .305, .082), .84, .34)
silver = material("Anodized aluminium", (.42, .49, .52), .9, .27)
white = material("Thermal radiator", (.62, .67, .65), .13, .67)
dark = material("Instrument carbon", (.014, .021, .027), .5, .34)
cells = material("Photovoltaic cells", (.026, .082, .205), .48, .19, .72)
glass = material("Recessed optical glass", (.005, .025, .029), .26, .14, .9)
copper = material("Harness copper", (.24, .10, .035), .75, .37)
soil = material("Dry earth", (.18, .118, .067), 0, .96)
track = material("Field tracks", (.195, .140, .090), 0, .94)
damp_bank = material("Damp channel shoulder", (.170, .120, .078), 0, .91)
wet_bank = material("Wet channel earth", (.145, .105, .070), 0, .86)
green_verge = material("Vegetated sample verge", (.105, .145, .063), 0, .93)
water = material("Irrigation water", (.018, .052, .055), 0, .12, .82)
foliage = material("Tree foliage", (.135, .275, .070), 0, .77, .06)
foliage_light = material("Tree foliage · sunlit leaves", (.270, .405, .120), 0, .73, .08)
bark = material("Tree bark", (.17, .11, .062), 0, .96)
greens = [material(f"Rice field {i}", c, 0, .92) for i, c in enumerate([
    (.085, .145, .060), (.110, .165, .065), (.145, .180, .074),
    (.090, .140, .057), (.135, .180, .076),
])]
crop_rows = material("Rice rows", (.090, .145, .052), 0, .90)


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


def upward_triangles(vertices, face):
    """Triangulate a terrain face with every visible surface normal upward.

    Vertex tuples use the runtime's (x, height, z) convention. Explicitly
    orienting each triangle here avoids axis/side-specific winding mistakes
    on the irrigation branches and keeps Three.js front-face culling correct.
    """
    triangles = [(face[0], face[i], face[i + 1]) for i in range(1, len(face) - 1)]
    result = []
    for triangle in triangles:
        a, b, c = (vertices[index] for index in triangle)
        ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        normal_y = ab[2] * ac[0] - ab[0] * ac[2]
        if abs(normal_y) < 1e-10:
            raise ValueError(f"Degenerate upward-facing terrain triangle: {triangle}")
        result.append(triangle if normal_y > 0 else (triangle[0], triangle[2], triangle[1]))
    return result


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
# Broad slack folds carry the silhouette, secondary buckling changes their
# direction, and a restrained fine wrinkle keeps highlights from reading as
# one triangulated quilt. The surface normal map adds smaller creases later.
v, f = [], []
nx, ny = 28, 32
for j in range(ny + 1):
    y = -.96 + j / ny * 1.94
    for i in range(nx + 1):
        x = -.74 + i / nx * 1.48
        primary = .018 * math.sin(x * 4.2 + y * 2.1 + .55 * math.sin(y * 3.0))
        buckle = .008 * math.sin(y * 8.6 - x * 5.1 + .35 * math.sin(x * 4.4))
        wrinkle = .0028 * math.sin(x * 21.0 + y * 15.5)
        gather = .004 * math.sin(math.atan2(y - .18, x) * 7.0) * max(0, 1 - math.hypot(x, y - .18) / .86)
        fold = primary + buckle + wrinkle + gather
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
# The channel continues beyond the authored 36-unit landscape so neither bank
# terminates as a pair of raised rails inside the shot-6 camera frustum.
CHANNEL_CENTERLINE = [
    (-18.65, 3.02), (-14.0, 3.02), (-9.4, 3.02), (-5.2, 3.02), (-3.0, 3.02), (-.8, 3.02),
    (1.2, 3.02), (3.18, 3.02), (3.18, 1.1), (3.18, -1.0),
    (3.18, -3.2), (3.18, -5.5), (3.18, -8.0), (3.18, -12.0),
    (3.18, -16.0), (3.18, -18.65),
]
CHANNEL_WATER_HALF_WIDTH = .15
CHANNEL_SLOPE_OUTER = .23
CHANNEL_BANK_CREST = .30
CHANNEL_OUTER = .38
CHANNEL_PARCEL_CLEARANCE = .565
CHANNEL_LONGITUDINAL_STEP = .28
CROP_LONGITUDINAL_STEP = .82


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


def point_segment_distance(x, z, a, b):
    dx, dz = b[0]-a[0], b[1]-a[1]
    length_squared = dx*dx+dz*dz
    t = max(0, min(1, ((x-a[0])*dx+(z-a[1])*dz)/length_squared))
    return math.hypot(x-(a[0]+dx*t), z-(a[1]+dz*t))


def channel_distance(x, z):
    return min(point_segment_distance(x, z, a, b)
               for a, b in zip(CHANNEL_CENTERLINE, CHANNEL_CENTERLINE[1:]))


def channel_depth(x, z):
    # A shallow subsoil cut supports the water and wet slopes. The compact
    # cross-section keeps the channel below grade without producing a raised
    # retaining-wall silhouette around the sample plot.
    distance = channel_distance(x, z)
    return .020 * max(0, min(1, (CHANNEL_OUTER-distance)/.28))


def ground_mesh():
    # Exact channel profile coordinates keep the subsoil under the authored
    # slopes without paying for a dense grid across the whole landscape.
    offsets=(-CHANNEL_OUTER,-CHANNEL_BANK_CREST,-CHANNEL_SLOPE_OUTER,
             -CHANNEL_WATER_HALF_WIDTH,0,CHANNEL_WATER_HALF_WIDTH,
             CHANNEL_SLOPE_OUTER,CHANNEL_BANK_CREST,CHANNEL_OUTER)
    xs=sorted(set([i*.5 for i in range(-36,37)]+[3.18+v for v in offsets]+[-18,3.18]))
    zs=sorted(set([i*.5 for i in range(-36,37)]+[3.02+v for v in offsets]+[-18,3.02]))
    # Keep the continuous subsoil clearly below cultivated parcel surfaces.
    # A sub-centimetre visual offset caused depth interference from the high
    # descent camera even though the meshes never intersected.
    v=[(x,height(x,z)-.018-channel_depth(x,z),z) for z in zs for x in xs];f=[]
    for j in range(len(zs)-1):
        for i in range(len(xs)-1):
            a=j*len(xs)+i;f.append((a,a+len(xs),a+len(xs)+1,a+1))
    mesh_obj('Continuous earth with recessed channels',v,f,soil,land,True)


def parcel_point(corners,u,v):
    a,b,c,d=corners
    return ((a[0]*(1-u)+b[0]*u)*(1-v)+(d[0]*(1-u)+c[0]*u)*v,
            (a[1]*(1-u)+b[1]*u)*(1-v)+(d[1]*(1-u)+c[1]*u)*v)


def ribbon_mesh(name,points,width,crest,mat=track,taper_start=False,taper_end=False):
    v=[];f=[]
    for i,(x,z) in enumerate(points):
        a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)]
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
        taper=.18 if (i==0 and taper_start) or (i==len(points)-1 and taper_end) else 1
        for offset,lift in ((-width,0),(-width*.45,crest),(width*.45,crest),(width,0)):
            px,pz=x-dz/length*offset*taper,z+dx/length*offset*taper
            v.append((px,height(px,pz)+lift*max(.25,taper),pz))
    for i in range(len(points)-1):
        for j in range(3):
            a=i*4+j;f.extend(upward_triangles(v,(a,a+4,a+5,a+1)))
    mesh_obj(name,v,f,mat,land,True)


def ribbon(name,points,width,crest,mat=track):
    """Author connected banks while leaving the supply channel unobstructed."""
    dense=[]
    for segment,(a,b) in enumerate(zip(points,points[1:])):
        steps=max(1,math.ceil(math.dist(a,b)/.32))
        for step in range(steps+(1 if segment==len(points)-2 else 0)):
            t=step/steps
            dense.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    runs=[];current=[];current_start=0;clearance=.43+width
    for index,point in enumerate(dense):
        distance=channel_distance(*point)
        if distance>=clearance:
            if not current:current_start=index
            current.append(point)
        elif current:
            if len(current)>1:runs.append((current,current_start>0,True))
            current=[]
    if len(current)>1:runs.append((current,current_start>0,len(dense)-1>current_start+len(current)-1))
    for run,taper_start,taper_end in runs:ribbon_mesh(name,run,width,crest,mat,taper_start,taper_end)


def path_crosses_channel(points,clearance=.50):
    for a,b in zip(points,points[1:]):
        steps=max(1,math.ceil(math.dist(a,b)/.24))
        for step in range(steps+1):
            t=step/steps;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
            if channel_distance(x,z)<clearance:
                return True
    return False


def parcel_relief(index,u,v,sample=False):
    """Broad raised cultivation relief shared by parcel soil and crop beds.

    The continuous ground is the subsoil datum. Keeping the cultivation relief
    above that datum prevents the ground from surfacing through parcel triangles
    when their tessellation differs during the globe-to-field deformation.
    """
    amplitude=.018 if sample else .028
    phase=index*.71
    wave=(.72*math.sin(u*math.tau*1.15+phase)*math.sin(v*math.pi*.82+phase*.37)
          +.28*math.sin((u*.55+v)*math.tau*1.7-phase*.41))
    return amplitude*(.55+.45*wave)


def planted_parcel(corners,mat,index,sample=False):
    v=[];f=[];vertex_cache={};steps=12 if sample else 8

    def parcel_vertex(u,vv):
        key=(round(u,8),round(vv,8))
        if key not in vertex_cache:
            x,z=parcel_point(corners,u,vv)
            vertex_cache[key]=len(v)
            v.append((x,height(x,z)+.001+parcel_relief(index,u,vv,sample),z))
        return vertex_cache[key]

    def channel_clearance(parameter):
        x,z=parcel_point(corners,*parameter)
        return channel_distance(x,z)-CHANNEL_PARCEL_CLEARANCE

    def channel_boundary_point(start,end,start_clearance,end_clearance):
        # Both adjacent triangles solve the same shared edge, so the clipped
        # parcel boundary remains watertight instead of following discarded
        # grid cells as a repeated sawtooth. Bisection follows the actual
        # channel-distance contour, including the mitered corner.
        inside,outside=(start,end) if start_clearance>=0 else (end,start)
        kept_endpoint=inside
        for _ in range(14):
            midpoint=((inside[0]+outside[0])*.5,(inside[1]+outside[1])*.5)
            if channel_clearance(midpoint)>=0:inside=midpoint
            else:outside=midpoint
        boundary=((inside[0]+outside[0])*.5,(inside[1]+outside[1])*.5)
        # A contour that passes extremely close to a retained vertex otherwise
        # exports a sub-pixel triangle whose quantized corners can read as an
        # isolated green fleck. Snap only toward the safe, retained endpoint;
        # never move a point into the channel clearance.
        if math.dist(parcel_point(corners,*boundary),parcel_point(corners,*kept_endpoint))<.008:
            return kept_endpoint
        return boundary

    def add_clipped_triangle(parameters):
        clearances=[channel_clearance(parameter) for parameter in parameters]
        clipped=[]
        previous,previous_clearance=parameters[-1],clearances[-1]
        for current,current_clearance in zip(parameters,clearances):
            previous_kept=previous_clearance>=0
            current_kept=current_clearance>=0
            if current_kept:
                if not previous_kept:
                    clipped.append(channel_boundary_point(previous,current,previous_clearance,current_clearance))
                clipped.append(current)
            elif previous_kept:
                clipped.append(channel_boundary_point(previous,current,previous_clearance,current_clearance))
            previous,previous_clearance=current,current_clearance
        cleaned=[]
        for parameter in clipped:
            point=parcel_point(corners,*parameter)
            # The runtime container quantizes positions to roughly 0.0006
            # scene units. Collapse contour intersections closer than that so
            # export cannot turn a microscopic sliver into a vertical face.
            if not cleaned or math.dist(point,parcel_point(corners,*cleaned[-1]))>7e-4:
                cleaned.append(parameter)
        if len(cleaned)>1 and math.dist(parcel_point(corners,*cleaned[0]),parcel_point(corners,*cleaned[-1]))<=7e-4:
            cleaned.pop()
        world=[parcel_point(corners,*parameter) for parameter in cleaned]
        signed_area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(world,world[1:]+world[:1]))
        if len(cleaned)>=3 and abs(signed_area)>1e-6:
            f.append(tuple(parcel_vertex(u,vv) for u,vv in cleaned))

    def add_surface_cell(u0,u1,v0,v1,depth=0):
        # Keep the runtime winding upward after Blender's axis conversion.
        # The order matches the original connected parcel grid: advance along
        # v first, then u, so front-face culling retains the cultivated surface.
        params=((u0,v0),(u0,v1),(u1,v1),(u1,v0))
        points=[parcel_point(corners,u,vv) for u,vv in params]
        if sample:
            f.append(tuple(parcel_vertex(u,vv) for u,vv in params));return
        uc,vc=(u0+u1)/2,(v0+v1)/2
        center=parcel_point(corners,uc,vc)
        radius=max(math.dist(center,point) for point in points)
        distance=channel_distance(*center)
        if distance-radius>=CHANNEL_PARCEL_CLEARANCE:
            f.append(tuple(parcel_vertex(u,vv) for u,vv in params));return
        if distance+radius<=CHANNEL_PARCEL_CLEARANCE:return
        if depth<3:
            for bounds in ((u0,uc,v0,vc),(uc,u1,v0,vc),(uc,u1,vc,v1),(u0,uc,vc,v1)):
                add_surface_cell(*bounds,depth+1)
            return
        # Clip only the final boundary cells against the authored clearance.
        # Dropping a whole mixed cell exposed its diagonal grid edge and made
        # the right-hand canal read as repeated triangular teeth. Two stable
        # triangles give the distance contour a continuous local boundary
        # without adding subdivisions to unaffected parcel surfaces.
        add_clipped_triangle((params[0],params[1],params[2]))
        add_clipped_triangle((params[0],params[2],params[3]))

    for j in range(steps):
        for i in range(steps):add_surface_cell(i/steps,(i+1)/steps,j/steps,(j+1)/steps)
    if not sample:
        # A parcel that crosses the L-channel can leave a minute disconnected
        # corner after contour clipping. It renders as a lone green triangle at
        # the bank junction, so remove only components below visible parcel
        # scale while retaining every coherent surface on either channel side.
        faces_by_vertex={}
        for face_index,face in enumerate(f):
            for vertex in face:faces_by_vertex.setdefault(vertex,[]).append(face_index)
        seen=set();kept_faces=[]
        for start in range(len(f)):
            if start in seen:continue
            pending=[start];seen.add(start);component=[];area=0
            while pending:
                face_index=pending.pop();component.append(face_index);face=f[face_index]
                points=[(v[vertex][0],v[vertex][2]) for vertex in face]
                area+=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1])))/2
                for vertex in face:
                    for neighbor in faces_by_vertex[vertex]:
                        if neighbor not in seen:seen.add(neighbor);pending.append(neighbor)
            if area>=.012:kept_faces.extend(f[index] for index in component)
        f[:]=kept_faces
    mesh_obj('Sample field' if sample else 'Adjoining cultivated parcel',v,f,mat,land,True)
    # Crops follow each parcel's planting axis. Distant rows remain low ribbons;
    # low uneven ridges retain depth without subpixel plant triangles.
    if index%7==0 and not sample:return
    if index%3==1 and not sample:corners=[corners[1],corners[2],corners[3],corners[0]]
    width=math.dist(corners[0],corners[3])
    # The demonstration parcel keeps enough rows to read as cultivated land.
    # Neighbouring parcels use wider, varied spacing so the aerial view does
    # not collapse into an implausibly uniform pinstripe grid.
    spacing=.15 if sample else (.34,.43,.54)[index%3]
    rows=max(6,round(width/spacing))
    center=parcel_point(corners,.5,.5)
    distance=math.hypot(center[0],center[1])
    # Static distance-based simplification drops subpixel ridges on far parcels;
    # it is authored geometry rather than a dynamic runtime LOD system.
    row_step=3 if not sample and distance>12 else 2 if not sample and distance>7.5 else 1
    vertices=[];faces=[]
    for row in range(1,rows,row_step):
        # Low-frequency spacing drift reads as planting passes rather than a
        # mathematically repeated stripe field. It stays deterministic and is
        # bounded well inside the parcel edge.
        vv=(row+.105*math.sin(row*.73+index*.43)+.035*math.sin(row*2.11-index*.29))/rows
        start=len(vertices)
        row_scale=.82+.18*math.sin(row*.61+index*.83)**2
        ridge_half=min(spacing*.14,.025 if sample else .048)*row_scale
        crown_height=(.0105 if sample else .015 if distance<7.5 else .007 if distance<12 else .0045)*row_scale
        cross=((-ridge_half,.003),(-ridge_half*.52,crown_height*.48),(0,crown_height),
               (ridge_half*.52,crown_height*.48),(ridge_half,.003))
        row_near_channel=not sample and any(
            channel_distance(*parcel_point(corners,step/24,vv))<CHANNEL_PARCEL_CLEARANCE+.20
            for step in range(25)
        )
        authored_longitudinal=10 if sample else (20 if row_near_channel else (5 if distance<9 else 3))
        # Long crop ribbons otherwise interpolate the curved field several
        # centimetres below the denser subsoil mesh during shot 5. Retain the
        # static row-count simplification, but bound each surviving ribbon's
        # chord length so its rendered surface remains above the ground.
        row_length=math.dist(corners[0],corners[1])
        longitudinal=max(authored_longitudinal,math.ceil(row_length/CROP_LONGITUDINAL_STEP))
        end_inset=.018+.040*(.5+.5*math.sin(row*.81+index*.61))
        for j in range(longitudinal+1):
            u=end_inset+(1-2*end_inset)*j/longitudinal
            drift=.010*math.sin(row*1.31+j*.73+index*.49)
            for lateral,lift in cross:
                adjusted_v=vv+(lateral+drift)/width
                x,z=parcel_point(corners,u,adjusted_v)
                crown=lift*(.88+.12*math.sin(row*1.7+j*1.1))
                vertices.append((x,height(x,z)+parcel_relief(index,u,adjusted_v,sample)+crown,z))
        for j in range(longitudinal):
            for k in range(len(cross)-1):
                a=start+j*len(cross)+k
                face=(a,a+len(cross),a+len(cross)+1,a+1)
                if sample or all(channel_distance(vertices[n][0],vertices[n][2])>=CHANNEL_PARCEL_CLEARANCE for n in face):
                    faces.extend(upward_triangles(vertices,face))
    # One shared row material preserves batching; the parcel colors beneath and
    # the varied authored spacing carry the coherent plot-to-plot variation.
    mesh_obj('Batched raised planting beds',vertices,faces,crop_rows,land,True)


ground_mesh()
# A small number of connected, irregular parcel bands replace the repeated
# seven-by-seven tile matrix. Adjacent bands share the exact same edge points,
# while their cross-field divisions drift or merge between bands. This reads
# as one farm landscape from the descent camera and leaves only the actual
# sample footprint clear at the centre.
parcel_index=0


def parcel_band(z0,z1,bottom,top):
    global parcel_index
    assert len(bottom)==len(top)
    for i in range(len(bottom)-1):
        corners=[(bottom[i],z0),(bottom[i+1],z0),(top[i+1],z1),(top[i],z1)]
        inset=[parcel_point(corners,u,v) for u,v in ((.018,.018),(.982,.018),(.982,.982),(.018,.982))]
        planted_parcel(inset,greens[(parcel_index*5+i*2)%len(greens)],parcel_index)
        parcel_index+=1
    # Dividers terminate at shared band edges instead of continuing as a
    # rectangular grid across the entire landscape.
    for i in range(1,len(bottom)-1):
        mid=((bottom[i]+top[i])*.5+terrain_random.uniform(-.12,.12),(z0+z1)*.5)
        points=[(bottom[i],z0),mid,(top[i],z1)]
        # The channel already separates these parcels. Keeping clipped halves
        # of a crossing divider creates paired rails at the bank junction.
        if not path_crosses_channel(points):ribbon('Shared parcel bank',points,.085,.062)


top_bands=[
    (3.52,8.25,[-18,-10.8,-4.4,3.45,10.7,18],[-18,-12.2,-5.1,2.85,9.15,18]),
    (8.25,13.15,[-18,-12.2,-5.1,2.85,9.15,18],[-18,-9.7,-2.25,6.25,12.9,18]),
    (13.15,18,[-18,-9.7,-2.25,6.25,12.9,18],[-18,-11.6,-4.6,4.7,11.1,18]),
]
bottom_bands=[
    (-18,-12.7,[-18,-11.8,-4.2,4.5,11.4,18],[-18,-9.8,-2.7,5.8,12.7,18]),
    (-12.7,-7.35,[-18,-9.8,-2.7,5.8,12.7,18],[-18,-12.8,-6.1,2.4,9.8,18]),
    (-7.35,-2.65,[-18,-12.8,-6.1,2.4,9.8,18],[-18,-10.5,-2.82,3.76,11.4,18]),
]
for band in bottom_bands+top_bands:parcel_band(*band)
for _,z,_,edge in bottom_bands[:-1]+top_bands[:-1]:
    ribbon('Shared parcel bank',[(x,z) for x in edge],.09,.064)

# Side parcels close the agricultural fabric around the unchanged field and
# its irrigation loop. Their single shared cross-bank connects to the outer
# band network without creating another repeated row.
for x0,x1,central_top in [(-18,-2.82,2.58),(3.64,18,3.52)]:
    split=-.2 if x0<0 else .35
    for z0,z1 in [(-2.65,split),(split,central_top)]:
        corners=[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]
        inset=[parcel_point(corners,u,v) for u,v in ((.018,.018),(.982,.018),(.982,.982),(.018,.982))]
        planted_parcel(inset,greens[(parcel_index*3)%len(greens)],parcel_index)
        parcel_index+=1
    ribbon('Shared parcel bank',[(x0,split),(x1,split)],.09,.064)

def channel_offset_points(points,offset):
    result=[]
    for i,point in enumerate(points):
        before=points[max(0,i-1)];after=points[min(len(points)-1,i+1)]
        incoming=Vector((point[0]-before[0],point[1]-before[1])) if i else Vector((after[0]-point[0],after[1]-point[1]))
        outgoing=Vector((after[0]-point[0],after[1]-point[1])) if i<len(points)-1 else incoming.copy()
        incoming.normalize();outgoing.normalize()
        normal_a=Vector((-incoming.y,incoming.x));normal_b=Vector((-outgoing.y,outgoing.x))
        miter=(normal_a+normal_b).normalized() if (normal_a+normal_b).length>.001 else normal_b
        divisor=max(.55,abs(miter.dot(normal_a)))
        displaced=Vector(point)+miter*(offset/divisor)
        result.append((displaced.x,displaced.y))
    return result


def densify_path(points,max_step):
    dense=[]
    for a,b in zip(points,points[1:]):
        steps=max(1,math.ceil(math.dist(a,b)/max_step))
        for step in range(steps):
            t=step/steps
            dense.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    dense.append(points[-1])
    return dense


def channel_strip(name,inner_offset,outer_offset,inner_lift,outer_lift,mat,centerline=None):
    # The ground has a half-unit local grid around the channel. Sampling the
    # channel more finely keeps its water, slopes and shoulders on the same
    # curved surface between control points instead of spanning multi-metre
    # chords that the ground can visibly pierce.
    path=densify_path(centerline or CHANNEL_CENTERLINE,CHANNEL_LONGITUDINAL_STEP)
    inner=channel_offset_points(path,inner_offset)
    outer=channel_offset_points(path,outer_offset)
    vertices=[];faces=[]
    for i in range(len(path)):
        for (x,z),lift in ((inner[i],inner_lift),(outer[i],outer_lift)):
            vertices.append((x,height(x,z)+lift,z))
    for i in range(len(path)-1):
        a=i*2
        faces.extend(upward_triangles(vertices,(a,a+2,a+3,a+1)))
    mesh_obj(name,vertices,faces,mat,land,True)


# One connected supply channel follows the north and east parcel edges. Its
# mitered cross-section keeps water continuous through the turn. Narrow wet and
# dry bands now occupy less screen space than the water itself at shot 6, while
# a low vegetated verge joins the sample edge to the soil profile locally.
channel_strip('Recessed connected irrigation',-CHANNEL_WATER_HALF_WIDTH,CHANNEL_WATER_HALF_WIDTH,-.025,-.025,water)
channel_strip('Wet channel slopes',-CHANNEL_SLOPE_OUTER,-CHANNEL_WATER_HALF_WIDTH,-.008,-.025,wet_bank)
channel_strip('Wet channel slopes',CHANNEL_WATER_HALF_WIDTH,CHANNEL_SLOPE_OUTER,-.025,-.008,wet_bank)
channel_strip('Raised irrigation bank shoulders',-CHANNEL_OUTER,-CHANNEL_BANK_CREST,0,.004,track)
channel_strip('Damp irrigation bank transition',-CHANNEL_BANK_CREST,-CHANNEL_SLOPE_OUTER,.004,-.008,damp_bank)
channel_strip('Damp irrigation bank transition',CHANNEL_SLOPE_OUTER,CHANNEL_BANK_CREST,-.008,.004,damp_bank)
channel_strip('Raised irrigation bank shoulders',CHANNEL_BANK_CREST,CHANNEL_OUTER,.004,0,track)
# The negative side of this short L is the sample-facing side of both arms.
# It fills only the authored margin between the low soil shoulder and the
# unchanged sample footprint; adjoining cultivated parcels keep their original
# channel clearance and clipping contour.
channel_strip('Vegetated sample verge',-.70,-CHANNEL_OUTER,.004,0,green_verge,
              [(-2.68,3.02),(3.18,3.02),(3.18,-2.48)])

planted_parcel([(-2.50,-2.30),(2.45,-2.30),(2.45,2.27),(-2.50,2.27)],greens[1],1,sample=True)
# A farm track joins the outer banks. It follows a shared parcel edge and stays
# entirely outside the sample/NDVI boundary and descending camera corridor.
ribbon('Farm access track',[(-18,-7.1),(-7.7,-7.1),(-3.45,-7.1),(3.45,-7.1),(8,-7.1),(18,-7.1)],.13,.045)


def tapered_branch(parent, name, start, end, base_radius, tip_radius, mat=bark, sides=8):
    a, b = Vector(to_blender(start)), Vector(to_blender(end))
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=base_radius, radius2=tip_radius,
                                    depth=direction.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:polygon.use_smooth=True
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


def canopy_mass(parent,name,center,scale,mat,rng,phase,yaw=0):
    """Create one branch-aligned foliage shell with a smooth screen silhouette.

    Five overlapping shells sit around the primary limbs. Extra segments are limited
    to these visible crown surfaces so the lower-right shot-6 tree retains a
    smooth highlight and silhouette without subdividing terrain or branches.
    """
    longitude=16;latitude=8;vertices=[];faces=[]
    # Shared poles prevent the top and underside from becoming radial caps.
    vertices.append((center[0],center[1]+scale[1],center[2]))
    for ring in range(1,latitude):
        theta=math.pi*ring/latitude
        shoulder=math.sin(theta)
        vertical=math.cos(theta)
        for segment in range(longitude):
            angle=yaw+math.tau*segment/longitude
            lobes=(.14*math.sin(angle*3+phase)+.055*math.sin(angle*5-theta*1.7+phase*.4))
            crown_taper=.88+.12*math.sin(theta*.78)
            radial=shoulder*crown_taper*(1+lobes*shoulder+.025*rng.uniform(-1,1))
            x=center[0]+math.cos(angle)*scale[0]*radial
            z=center[2]+math.sin(angle)*scale[2]*radial
            # A shallow asymmetric underside exposes trunk and first-order limbs.
            y=(center[1]+vertical*scale[1]
               +scale[1]*(.115*math.sin(angle*3+phase)+.052*math.sin(angle*5-phase*.6))*shoulder**1.35)
            if vertical<-.45:y+=scale[1]*.16*(-vertical-.45)
            vertices.append((x,y,z))
    bottom=len(vertices);vertices.append((center[0]-.025,center[1]-scale[1]*.83,center[2]+.018))
    for segment in range(longitude):
        nxt=(segment+1)%longitude
        faces.append((0,1+nxt,1+segment))
    for ring in range(latitude-2):
        row=1+ring*longitude;next_row=row+longitude
        for segment in range(longitude):
            nxt=(segment+1)%longitude
            faces.extend(((row+segment,next_row+segment,next_row+nxt),(row+segment,next_row+nxt,row+nxt)))
    last=1+(latitude-2)*longitude
    for segment in range(longitude):
        nxt=(segment+1)%longitude
        faces.append((last+segment,bottom,last+nxt))
    return mesh_obj(name,vertices,faces,mat,parent,True)



# Three branched silhouettes at a believable crop-edge scale. Five smoother,
# branch-aligned shells form a coherent crown while leaving sky gaps around
# primary limbs at the actual shot-6 desktop and mobile distances.
tree_specs=[(.98,.54,1.48),(1.18,.43,1.85),(.78,.65,1.29)]
for variant_index,(trunk_height,spread,crown_height) in enumerate(tree_specs):
    parent=tree_variants[variant_index];rng=random.Random(730+variant_index);leaf_batches={}
    tapered_branch(parent,'Tapered living trunk',(0,0,0),(.045,trunk_height,0),.049,.013,sides=9)
    crown_layouts=[
        [(-.48,-.03,.12,.45,.21,.39),(-.24,.10,-.13,.53,.24,.45),(.06,.18,.02,.58,.27,.51),(.36,.08,-.10,.48,.23,.43),(.53,-.05,.15,.39,.20,.35)],
        [(-.44,-.06,-.10,.41,.21,.37),(-.21,.09,.13,.49,.24,.42),(.04,.20,-.02,.54,.28,.47),(.33,.10,.12,.45,.23,.40),(.50,-.04,-.11,.38,.20,.34)],
        [(-.51,-.04,.14,.47,.21,.41),(-.25,.09,-.12,.53,.23,.46),(.04,.17,.03,.56,.26,.50),(.36,.08,-.13,.49,.22,.43),(.55,-.05,.12,.41,.19,.36)],
    ]
    for cluster,(ox,oy,oz,sx,sy,sz) in enumerate(crown_layouts[variant_index]):
        canopy_mass(parent,'Layered asymmetric foliage crown',
                    (ox*spread,trunk_height*1.02+crown_height*(.08+oy),oz*spread),
                    (spread*sx,crown_height*sy,spread*sz),
                    foliage_light if cluster in (1,2,3) else foliage,rng,
                    variant_index*.93+cluster*.71+.4,yaw=cluster*.62-variant_index*.31)
    for branch in range(9):
        angle=branch*2.399+rng.uniform(-.25,.25)
        start=(.02,trunk_height*rng.uniform(.46,.90),0)
        end=(math.cos(angle)*spread*rng.uniform(.62,.92),rng.uniform(trunk_height*.86,crown_height),math.sin(angle)*spread*rng.uniform(.62,.92))
        tapered_branch(parent,'Primary branching limb',start,end,.018,.004,sides=7)
        # Small edge sprays break the near-camera silhouette without the large
        # disconnected leaf cards visible in the previous lower-right crown.
        for spray in (-.34,0,.34):
            leaf_angle=angle+spray
            direction=(math.cos(leaf_angle),rng.uniform(.24,.62),math.sin(leaf_angle))
            length=rng.uniform(.085,.125)
            shade=foliage_light if spray>=0 else foliage
            add_leaf(end,direction,length,length*.24,shade,leaf_batches,spray*.8)
        for twig in range(2):
            t=.52+twig*.27;origin=tuple(start[k]+(end[k]-start[k])*t for k in range(3))
            twig_angle=angle+rng.uniform(-1.5,1.5)
            tip=(origin[0]+math.cos(twig_angle)*.20,origin[1]+rng.uniform(.08,.22),origin[2]+math.sin(twig_angle)*.20)
            tapered_branch(parent,'Fine secondary branch',origin,tip,.006,.0015,sides=5)
            # Paired leaves grow from the authored twig instead of floating at
            # random points around it. At close range this reads as one coherent
            # spray; at distance it becomes a fine, stable crown edge.
            for node in (.52,.82):
                location=tuple(origin[k]+(tip[k]-origin[k])*node for k in range(3))
                for side in (-1,1):
                    leaf_angle=twig_angle+side*rng.uniform(.48,.82)
                    direction=(math.cos(leaf_angle),rng.uniform(.24,.72),math.sin(leaf_angle))
                    length=rng.uniform(.070,.105)
                    shade=foliage_light if side>0 and rng.random()>.38 else foliage
                    add_leaf(location,direction,length,length*rng.uniform(.20,.27),shade,leaf_batches,side*rng.uniform(.35,.95))
    for leaf_batch in leaf_batches.values():
        mesh_obj('Small folded leaves in branching crown',leaf_batch['vertices'],leaf_batch['faces'],leaf_batch['material'],parent,True)


# Shared original texture inputs and UV projection are saved into the .blend.
import sys
sys.path.insert(0,str(Path(__file__).parent))
from surface_maps import build_surfaces, apply_surface
surface_output=OUT.parent/'textures'/'surfaces'
surface_images=build_surfaces(surface_output)
for mat in bpy.data.materials:
    role=('foil' if mat==gold else 'solar' if mat==cells else 'metal' if mat==silver else 'water' if mat==water else 'leaf' if mat in (foliage,foliage_light) else 'crop' if mat in greens or mat in (crop_rows,green_verge) else 'soil' if mat in (soil,track,damp_bank,wet_bank,bark) else None)
    if role:apply_surface(mat,role,surface_images,.38 if role=='foil' else .16 if role=='solar' else .84 if role=='water' else .22 if mat==crop_rows else .18 if mat in (track,damp_bank,green_verge) else .4)
    if mat in (foliage,foliage_light,crop_rows):mat['doubleSided']=True
for obj in bpy.data.objects:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Authored surface UV')
    for polygon in obj.data.polygons:
        n=(obj.matrix_world.to_3x3()@polygon.normal).normalized()
        axis=max(range(3),key=lambda k:abs(n[k]));axes=[k for k in range(3) if k!=axis]
        mat=obj.data.materials[polygon.material_index]
        # World-scale projections keep soil/crop detail from repeating as tiny
        # wallpaper across large parcels. Water uses still broader wave bands.
        scale=(.32 if mat==water else 3.0 if mat in (foliage,foliage_light) else .46 if mat in greens or mat in (crop_rows,green_verge) else
               .62 if mat==track else .72 if mat==damp_bank else .82 if mat==wet_bank else .40 if mat==soil else 1.0)
        for loop in polygon.loop_indices:
            point=obj.matrix_world@obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(point[axes[0]]*scale,point[axes[1]]*scale)


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
                uv = mesh.uv_layers.active.data[loop].uv if mesh.uv_layers.active else (0, 0)
                values = (p.x, p.z, -p.y, n.x, n.z, -n.y, uv[0], uv[1])
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
        pos, norms, uvs = bytearray(), bytearray(), bytearray()
        for p in points:
            pos.extend(struct.pack("<hhh", *[round((p[k] - offset[k]) / scale[k] * 32767) for k in range(3)]))
            norms.extend(struct.pack("<bbb", *[max(-127, min(127, round(p[k] * 127))) for k in range(3, 6)]))
            uvs.extend(struct.pack("<hh", *[round(p[k]*512) for k in (6,7)]))
        use32 = len(points) > 65535
        indices = struct.pack(f"<{len(group['indices'])}{'I' if use32 else 'H'}", *group["indices"])
        mat = group["material"]
        meshes.append({"name": name, "material": {"color": list(mat.diffuse_color[:3]), "metalness": mat["metalness"], "roughness": mat["roughness"], "clearcoat": mat["clearcoat"], "surface": mat.get("surface"), "normalStrength": mat.get("normalStrength", .5), "doubleSided": bool(mat.get("doubleSided", False))}, "offset": offset, "scale": scale, "position": base64.b64encode(pos).decode(), "uv": base64.b64encode(uvs).decode(), "normal": base64.b64encode(norms).decode(), "index": base64.b64encode(indices).decode(), "index32": use32})
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
