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


gold = material("MLI · champagne gold", (.43, .25, .074), .91, .28)
silver = material("Anodized aluminium", (.42, .49, .52), .9, .27)
white = material("Thermal radiator", (.62, .67, .65), .13, .67)
dark = material("Instrument carbon", (.014, .021, .027), .5, .34)
cells = material("Photovoltaic cells", (.008, .029, .058), .68, .21, .48)
glass = material("Recessed optical glass", (.005, .025, .029), .26, .14, .9)
copper = material("Harness copper", (.24, .10, .035), .75, .37)
soil = material("Dry earth", (.18, .118, .067), 0, .96)
track = material("Field tracks", (.24, .16, .095), 0, .94)
wet_bank = material("Wet channel earth", (.075, .060, .040), 0, .88)
water = material("Irrigation water", (.026, .041, .027), 0, .18, .48)
foliage = material("Tree foliage", (.18, .285, .075), 0, .96)
foliage_light = material("Tree foliage · sunlit leaves", (.285, .385, .105), 0, .94)
bark = material("Tree bark", (.17, .11, .062), 0, .96)
greens = [material(f"Rice field {i}", c, 0, .92) for i, c in enumerate([
    (.095, .17, .066), (.13, .19, .073), (.18, .195, .070),
    (.105, .156, .059), (.17, .21, .082),
])]
crop = material("Rice rows", (.10, .165, .059), 0, .97)


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
v, f = [], []
nx, ny = 28, 32
for j in range(ny + 1):
    y = -.96 + j / ny * 1.94
    for i in range(nx + 1):
        x = -.74 + i / nx * 1.48
        fold = .012 * math.sin(x * 14 + y * 9 + math.sin(y*11)) + .006 * math.sin(y * 23 - x * 7 + math.sin(x*9))
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


def channel_depth(x, z):
    # Cut the continuous soil mesh below the actual water plane. The sample
    # footprint is untouched; the lowest point of a canal is .15 scene units.
    side = min(abs(x-3.12), abs(x+3.12)) if -5.4 < z < 3.12 else 99
    cross = min(abs(z-2.95), abs(z+2.95)) if abs(x) < 3.32 else 99
    distance = min(side, cross)
    return .17 * max(0, min(1, (.34-distance)/.18))


def ground_mesh():
    xs=sorted(set([i*.5 for i in range(-36,37)]+[v for c in (-3.12,3.12) for v in (c-.25,c-.15,c,c+.15,c+.25)]))
    zs=sorted(set([i*.5 for i in range(-36,37)]+[v for c in (-2.95,2.95) for v in (c-.25,c-.15,c,c+.15,c+.25)]))
    # Keep the continuous subsoil clearly below cultivated parcel surfaces.
    # A sub-centimetre visual offset caused depth interference from the high
    # descent camera even though the meshes never intersected.
    v=[(x,height(x,z)-.028-channel_depth(x,z),z) for z in zs for x in xs];f=[]
    for j in range(len(zs)-1):
        for i in range(len(xs)-1):
            a=j*len(xs)+i;f.append((a,a+len(xs),a+len(xs)+1,a+1))
    mesh_obj('Continuous earth with recessed channels',v,f,soil,land,True)


def parcel_point(corners,u,v):
    a,b,c,d=corners
    return ((a[0]*(1-u)+b[0]*u)*(1-v)+(d[0]*(1-u)+c[0]*u)*v,
            (a[1]*(1-u)+b[1]*u)*(1-v)+(d[1]*(1-u)+c[1]*u)*v)


def ribbon(name,points,width,crest,mat=track):
    v=[];f=[]
    for i,(x,z) in enumerate(points):
        a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)]
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
        for offset,lift in ((-width,0),(-width*.45,crest),(width*.45,crest),(width,0)):
            px,pz=x-dz/length*offset,z+dx/length*offset
            v.append((px,height(px,pz)+lift,pz))
    for i in range(len(points)-1):
        for j in range(3):
            a=i*4+j;f.extend(upward_triangles(v,(a,a+4,a+5,a+1)))
    mesh_obj(name,v,f,mat,land,True)


def planted_parcel(corners,mat,index,sample=False):
    v=[];f=[];steps=12 if sample else 8
    for j in range(steps+1):
        for i in range(steps+1):
            x,z=parcel_point(corners,i/steps,j/steps);v.append((x,height(x,z)+.001,z))
    for j in range(steps):
        for i in range(steps):
            a=j*(steps+1)+i;f.append((a,a+steps+1,a+steps+2,a+1))
    mesh_obj('Sample field' if sample else 'Adjoining cultivated parcel',v,f,mat,land,True)
    # Crops follow each parcel's planting axis. Distant rows remain low ribbons;
    # low uneven ridges retain depth without subpixel plant triangles.
    if index%7==0 and not sample:return
    if index%3==1 and not sample:corners=[corners[1],corners[2],corners[3],corners[0]]
    width=math.dist(corners[0],corners[3])
    # The demonstration parcel keeps enough rows to read as cultivated land.
    # Neighbouring parcels use wider, varied spacing so the aerial view does
    # not collapse into an implausibly uniform pinstripe grid.
    spacing=.145 if sample else (.21,.255,.29)[index%3]
    rows=max(6,round(width/spacing))
    vertices=[];faces=[]
    for row in range(1,rows):
        vv=row/rows;start=len(vertices)
        for j in range(7):
            u=.012+.976*j/6
            for lateral,lift in ((-.012,.008),(0,.021),(.012,.008)):
                x,z=parcel_point(corners,u,vv+(lateral+.006*math.sin(row*1.7+j*2.1))/width)
                vertices.append((x,height(x,z)+lift*(.87+.13*math.sin(row*2.3+j*1.9)),z))
        for j in range(6):
            a=start+j*3
            faces.extend(upward_triangles(vertices,(a,a+1,a+4,a+3)))
            faces.extend(upward_triangles(vertices,(a+1,a+2,a+5,a+4)))
    mesh_obj('Batched uneven crop furrows',vertices,faces,crop,land,True)


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
        ribbon('Shared parcel bank',[(bottom[i],z0),mid,(top[i],z1)],.085,.062)


top_bands=[
    (3.45,8.25,[-18,-10.8,-4.4,3.45,10.7,18],[-18,-12.2,-5.1,2.85,9.15,18]),
    (8.25,13.15,[-18,-12.2,-5.1,2.85,9.15,18],[-18,-9.7,-2.25,6.25,12.9,18]),
    (13.15,18,[-18,-9.7,-2.25,6.25,12.9,18],[-18,-11.6,-4.6,4.7,11.1,18]),
]
bottom_bands=[
    (-18,-12.7,[-18,-11.8,-4.2,4.5,11.4,18],[-18,-9.8,-2.7,5.8,12.7,18]),
    (-12.7,-7.35,[-18,-9.8,-2.7,5.8,12.7,18],[-18,-12.8,-6.1,2.4,9.8,18]),
    (-7.35,-3.45,[-18,-12.8,-6.1,2.4,9.8,18],[-18,-10.5,-3.45,3.45,11.4,18]),
]
for band in bottom_bands+top_bands:parcel_band(*band)
for _,z,_,edge in bottom_bands[:-1]+top_bands[:-1]:
    ribbon('Shared parcel bank',[(x,z) for x in edge],.09,.064)

# Side parcels close the agricultural fabric around the unchanged field and
# its irrigation loop. Their single shared cross-bank connects to the outer
# band network without creating another repeated row.
for x0,x1 in [(-18,-3.45),(3.45,18)]:
    split=-.2 if x0<0 else .35
    for z0,z1 in [(-3.45,split),(split,3.45)]:
        corners=[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]
        inset=[parcel_point(corners,u,v) for u,v in ((.018,.018),(.982,.018),(.982,.982),(.018,.982))]
        planted_parcel(inset,greens[(parcel_index*3)%len(greens)],parcel_index)
        parcel_index+=1
    ribbon('Shared parcel bank',[(x0,split),(x1,split)],.09,.064)

IRRIGATION_X=3.12
IRRIGATION_Z=2.95

def irrigation_branch(axis,coordinate,low,high):
    v=[];f=[];shoulder_v=[];shoulder_f=[];slope_v=[];slope_f=[];steps=48
    for i in range(steps+1):
        t=low+(high-low)*i/steps
        # Water sits above a visible channel toe. Raised dry shoulders and
        # darker soil slopes create real contact edges from the descent view.
        for offset in (-.155,.155):
            x,z=(t,coordinate+offset) if axis=='x' else (coordinate+offset,t)
            v.append((x,height(x,z)-.078,z))
        cross= ((-.34,.012),(-.27,.085),(-.20,.005),(-.155,-.10),
                (.155,-.10),(.20,.005),(.27,.085),(.34,.012))
        for offset,lift in cross:
            x,z=(t,coordinate+offset) if axis=='x' else (coordinate+offset,t)
            target=shoulder_v if abs(offset)>=.27 else slope_v
            target.append((x,height(x,z)+lift,z))
    for i in range(steps):
        a=i*2;f.extend(upward_triangles(v,(a,a+2,a+3,a+1)))
        # Two vertices per dry shoulder and four per wet inner slope, per step.
        for base in (0,):
            a=i*4+base;shoulder_f.extend(upward_triangles(shoulder_v,(a,a+4,a+5,a+1)))
            a=i*4+2;shoulder_f.extend(upward_triangles(shoulder_v,(a,a+4,a+5,a+1)))
        for base in (0,2):
            a=i*4+base;slope_f.extend(upward_triangles(slope_v,(a,a+4,a+5,a+1)))
    mesh_obj('Recessed connected irrigation',v,f,water,land,True)
    mesh_obj('Raised irrigation bank shoulders',shoulder_v,shoulder_f,track,land,True)
    mesh_obj('Wet channel slopes',slope_v,slope_f,wet_bank,land,True)
for z in (-IRRIGATION_Z,IRRIGATION_Z):irrigation_branch('x',z,-3.265,3.265)
for x in (-IRRIGATION_X,IRRIGATION_X):irrigation_branch('z',x,-5.35,3.095)
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


def canopy_lobe(parent,name,center,scale,mat,rng):
    """Create one soft, asymmetric foliage mass with a deterministic outline."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=to_blender(center))
    obj=bpy.context.object;obj.name=name
    obj.scale=(scale[0],scale[2],scale[1])
    obj.rotation_euler=(rng.uniform(-.24,.24),rng.uniform(-.35,.35),rng.uniform(-.20,.20))
    for vertex in obj.data.vertices:
        co=vertex.co
        warp=1+rng.uniform(-.055,.055)+.045*math.sin(co.x*4.1+co.y*2.7)
        co*=warp
        co.z*=.9+.10*math.sin(co.x*2.8-co.y*3.6)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    move_collection(obj,parent)
    return obj



# Three branched silhouettes at a believable crop-edge scale. Overlapping,
# asymmetric foliage lobes carry the crown at aerial distance; a bounded set
# of folded leaves breaks the outer contour without turning into point noise.
tree_specs=[(.98,.54,1.48),(1.18,.43,1.85),(.78,.65,1.29)]
for variant_index,(trunk_height,spread,crown_height) in enumerate(tree_specs):
    parent=tree_variants[variant_index];rng=random.Random(730+variant_index);leaf_batches={}
    tapered_branch(parent,'Tapered living trunk',(0,0,0),(.045,trunk_height,0),.049,.013,sides=9)
    canopy_lobe(parent,'Continuous asymmetric crown',(0,trunk_height*1.07,0),
                 (spread*.92,crown_height*.23,spread*.84),foliage,rng)
    for branch in range(10):
        angle=branch*2.399+rng.uniform(-.25,.25)
        start=(.02,trunk_height*rng.uniform(.46,.90),0)
        end=(math.cos(angle)*spread*rng.uniform(.65,1),rng.uniform(trunk_height*.9,crown_height),math.sin(angle)*spread*rng.uniform(.65,1))
        tapered_branch(parent,'Primary branching limb',start,end,.018,.004,sides=7)
        if branch%2==0:
            lobe_center=(end[0]*.64,end[1]*.74+trunk_height*.26,end[2]*.64)
            lobe_scale=(rng.uniform(.27,.36)*(spread/.54),rng.uniform(.21,.29)*(crown_height/1.48),rng.uniform(.26,.34)*(spread/.54))
            canopy_lobe(parent,'Overlapping crown edge',lobe_center,lobe_scale,foliage_light if branch in (0,4) else foliage,rng)
        for twig in range(3):
            t=.45+twig*.23;origin=tuple(start[k]+(end[k]-start[k])*t for k in range(3))
            twig_angle=angle+rng.uniform(-1.5,1.5)
            tip=(origin[0]+math.cos(twig_angle)*.20,origin[1]+rng.uniform(.08,.22),origin[2]+math.sin(twig_angle)*.20)
            tapered_branch(parent,'Fine secondary branch',origin,tip,.006,.0015,sides=5)
            for leaf in range(5):
                a=rng.random()*math.tau;r=rng.random()**.5*.19
                location=(tip[0]+math.cos(a)*r,tip[1]+rng.uniform(-.11,.14),tip[2]+math.sin(a)*r)
                direction=(math.cos(a),rng.uniform(-.15,.8),math.sin(a))
                length=rng.uniform(.065,.13)
                shade=foliage_light if rng.random()>.67 else foliage
                add_leaf(location,direction,length,length*rng.uniform(.19,.30),shade,leaf_batches,rng.uniform(-1.4,1.4))
    for leaf_batch in leaf_batches.values():
        mesh_obj('Small folded leaves in branching crown',leaf_batch['vertices'],leaf_batch['faces'],leaf_batch['material'],parent,True)


# Shared original texture inputs and UV projection are saved into the .blend.
import sys
sys.path.insert(0,str(Path(__file__).parent))
from surface_maps import build_surfaces, apply_surface
surface_output=OUT.parent/'textures'/'surfaces'
surface_images=build_surfaces(surface_output)
for mat in bpy.data.materials:
    role=('foil' if mat==gold else 'metal' if mat==silver else 'water' if mat==water else 'leaf' if mat in (foliage,foliage_light) else 'crop' if mat in greens or mat==crop else 'soil' if mat in (soil,track,wet_bank,bark) else None)
    if role:apply_surface(mat,role,surface_images,.42 if role=='foil' else .65 if role=='water' else .18 if mat==track else .4)
    if mat in (foliage,foliage_light,crop):mat['doubleSided']=True
for obj in bpy.data.objects:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Authored surface UV')
    for polygon in obj.data.polygons:
        n=(obj.matrix_world.to_3x3()@polygon.normal).normalized()
        axis=max(range(3),key=lambda k:abs(n[k]));axes=[k for k in range(3) if k!=axis]
        mat=obj.data.materials[polygon.material_index]
        scale=.72 if mat==water else 2.8 if obj in land.objects[:] else 1.0
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
