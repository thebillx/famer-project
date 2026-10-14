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
gold_dull = material("MLI · shaded fold panels", (.31, .175, .045), .78, .48)
silver = material("Anodized aluminium", (.42, .49, .52), .9, .27)
white = material("Thermal radiator", (.62, .67, .65), .13, .67)
dark = material("Instrument carbon", (.014, .021, .027), .5, .34)
cells = material("Photovoltaic cells", (.026, .082, .205), .48, .19, .72)
cells_oblique = material("Photovoltaic cells · oblique response", (.020, .052, .132), .42, .29, .52)
glass = material("Recessed optical glass", (.005, .025, .029), .26, .14, .9)
copper = material("Harness copper", (.24, .10, .035), .75, .37)
soil = material("Dry earth", (.18, .118, .067), 0, .96)
track = material("Field tracks", (.195, .140, .090), 0, .94)
damp_bank = material("Damp channel shoulder", (.170, .120, .078), 0, .91)
wet_bank = material("Wet channel earth", (.145, .105, .070), 0, .86)
green_verge = material("Vegetated sample verge", (.105, .145, .063), 0, .93)
water = material("Irrigation water", (.028, .074, .072), 0, .095, .74)
water_bsdf = water.node_tree.nodes.get("Principled BSDF")
for input_name, value in (("IOR", 1.333), ("Transmission Weight", .18),
                          ("Specular IOR Level", .46), ("Coat Roughness", .08)):
    if input_name in water_bsdf.inputs:
        water_bsdf.inputs[input_name].default_value = value
foliage = material("Tree foliage", (.125, .255, .064), 0, .82, .025)
foliage_light = material("Tree foliage · sunlit leaves", (.285, .420, .126), 0, .69, .045)
bark = material("Tree bark", (.17, .11, .062), 0, .96)
greens = [material(f"Rice field {i}", c, 0, rough) for i, (c, rough) in enumerate([
    ((.070, .128, .045), .94),
    ((.118, .174, .060), .92),
    ((.151, .198, .072), .90),
])]
crop_rows = material("Rice rows", (.122, .184, .068), 0, .89)
crop_bsdf = crop_rows.node_tree.nodes.get("Principled BSDF")
crop_bsdf.inputs["Emission Color"].default_value = (.018, .035, .010, 1)
crop_bsdf.inputs["Emission Strength"].default_value = .035
fallow = material("Rice field · fallow earth", (.205, .145, .084), 0, .95)
low_growth = material("Rice field · low growth", (.100, .135, .052), 0, .94)
wet_paddy = material("Rice field · shallow wet", (.072, .108, .072), 0, .58, .12)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


cameras_root = collection("00_CAMERAS")
earth_root = collection("01_EARTH")
ship = collection("02_SPACECRAFT")
thailand_root = collection("03_THAILAND_FOCUS")
descent_root = collection("04_DESCENT_LANDSCAPE")
hero_root = collection("05_HERO_FARMLAND")
tree_root = collection("06_VEGETATION")
lighting_root = collection("07_LIGHTING")
land = collection("08_EXPORT")
reference_root = collection("09_REFERENCE")
tree_variants = []
for name in ("Round canopy", "Tall canopy", "Open crown", "Palmyra palm"):
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
    v, rings = [], []
    for radius, z in profile:
        if abs(radius) < 1e-9:
            rings.append([len(v)])
            v.append((center[0], center[1], center[2] + z))
        else:
            ring = []
            for i in range(segments):
                a = i * math.tau / segments
                ring.append(len(v))
                v.append((center[0] + math.cos(a) * radius, center[1] + math.sin(a) * radius, center[2] + z))
            rings.append(ring)
    f = []
    for before, after in zip(rings, rings[1:]):
        if len(before) == 1:
            for i in range(segments):
                f.append((before[0], after[(i + 1) % segments], after[i]))
        elif len(after) == 1:
            for i in range(segments):
                f.append((before[i], before[(i + 1) % segments], after[0]))
        else:
            for i in range(segments):
                f.append((before[i], before[(i + 1) % segments], after[(i + 1) % segments], after[i]))
    return mesh_obj(name, v, f, mat, parent, True)


# The original landscape and vegetation remain unchanged. The spacecraft is a
# new owner-directed original survey craft; its articulated parts export together.
import sys
sys.path.insert(0, str(Path(__file__).parent))
from survey_craft import author_survey_craft
survey_materials = author_survey_craft(material, box, tube, lathe, mesh_obj, ship)


LANDSCAPE_EXTENT = 32.0
TERRAIN_CURVE_DIVISOR = 1800.0
# Material-batched runtime positions span the complete 64-unit landscape and
# are encoded as signed 16-bit values.  Keep clipped contour slivers wider than
# one reconstruction step so quantization cannot collapse a visible triangle
# onto a line after Blender has triangulated it.
LANDSCAPE_POSITION_STEP = 2 * LANDSCAPE_EXTENT / 65534


def height(x, z):
    """A broad descent landscape with gentle relief instead of a terrain cap."""
    macro = (.034 * math.sin(x * .115 + .4)
             + .027 * math.cos(z * .097 - .8)
             + .016 * math.sin((x + z) * .205))
    return -(x * x + z * z) / TERRAIN_CURVE_DIVISOR + .07 + macro


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
    (-32.65, 3.02), (-24.0, 3.02), (-18.65, 3.02), (-14.0, 3.02), (-9.4, 3.02), (-5.2, 3.02), (-3.0, 3.02), (-.8, 3.02),
    (1.2, 3.02), (3.18, 3.02), (3.18, 1.1), (3.18, -1.0),
    (3.18, -3.2), (3.18, -5.5), (3.18, -8.0), (3.18, -12.0),
    (3.18, -16.0), (3.18, -24.0), (3.18, -32.65),
]
SECONDARY_CHANNELS = [
    [(-18.65, 3.02), (-18.9, 6.8), (-19.7, 10.8), (-20.8, 16.4)],
    [(3.18, -12.0), (7.4, -12.6), (12.1, -13.5), (18.2, -15.1)],
]
CHANNEL_WATER_HALF_WIDTH = .15
CHANNEL_SLOPE_OUTER = .23
CHANNEL_BANK_CREST = .30
CHANNEL_OUTER = .38
CHANNEL_PARCEL_CLEARANCE = .565
CHANNEL_LONGITUDINAL_STEP = .28
CROP_LONGITUDINAL_STEP = 1.28


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


def secondary_channel_distance(x, z):
    return min(point_segment_distance(x, z, a, b)
               for path in SECONDARY_CHANNELS for a, b in zip(path, path[1:]))


def parcel_channel_clearance(x, z):
    """Signed clearance from the primary route and two shallow branches."""
    return min(channel_distance(x, z)-CHANNEL_PARCEL_CLEARANCE,
               secondary_channel_distance(x, z)-.255)


def channel_depth(x, z):
    # A shallow subsoil cut supports the water and wet slopes. The compact
    # cross-section keeps the channel below grade without producing a raised
    # retaining-wall silhouette around the sample plot.
    distance = channel_distance(x, z)
    return .026 * max(0, min(1, (CHANNEL_OUTER-distance)/.28))


def ground_mesh():
    # Exact channel profile coordinates keep the subsoil under the authored
    # slopes without paying for a dense grid across the whole landscape.
    offsets=(-CHANNEL_OUTER,-CHANNEL_BANK_CREST,-CHANNEL_SLOPE_OUTER,
             -CHANNEL_WATER_HALF_WIDTH,0,CHANNEL_WATER_HALF_WIDTH,
             CHANNEL_SLOPE_OUTER,CHANNEL_BANK_CREST,CHANNEL_OUTER)
    core=[i*.5 for i in range(-36,37)]
    outer=[float(i) for i in range(-32,33) if abs(i)>18]
    xs=sorted(set(core+outer+[3.18+v for v in offsets]+[-LANDSCAPE_EXTENT,3.18,LANDSCAPE_EXTENT]))
    zs=sorted(set(core+outer+[3.02+v for v in offsets]+[-LANDSCAPE_EXTENT,3.02,LANDSCAPE_EXTENT]))
    # Keep the continuous subsoil below every authored surface, but close
    # enough to the parcel datum that a field join reads as soil rather than a
    # deep black slot from the high descent camera.  The channel depression
    # still provides the required triangle-interior water clearance.
    v=[(x,height(x,z)-.012-channel_depth(x,z),z) for z in zs for x in xs];f=[]
    for j in range(len(zs)-1):
        for i in range(len(xs)-1):
            a=j*len(xs)+i
            f.extend(upward_triangles(v,(a,a+len(xs),a+len(xs)+1,a+1)))
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
            if channel_distance(x,z)<clearance or secondary_channel_distance(x,z)<.25:
                return True
    return False


def parcel_relief(index,u,v,sample=False):
    """Broad raised cultivation relief shared by parcel soil and crop beds.

    The continuous ground is the subsoil datum. Keeping the cultivation relief
    above that datum prevents the ground from surfacing through parcel triangles
    when their tessellation differs during the globe-to-field deformation.
    """
    # A paddy is nearly level at this scale. Keep only broad drainage fall and
    # shallow cultivation relief so neighboring parcels do not read as thick
    # floating plates in the locked field cameras.
    amplitude=.0045 if sample else .006
    phase=index*.71
    wave=(.72*math.sin(u*math.tau*1.15+phase)*math.sin(v*math.pi*.82+phase*.37)
          +.28*math.sin((u*.55+v)*math.tau*1.7-phase*.41))
    edge_distance=max(0,min(u,1-u,v,1-v))
    edge_blend=min(1,edge_distance/.16)
    edge_blend=edge_blend*edge_blend*(3-2*edge_blend)
    # Adjacent parcels share one height along their join. Broad cultivation
    # relief develops only inside the field, avoiding vertical black seams.
    return (.0065 if sample else .004)+amplitude*edge_blend*wave


def planted_parcel(corners,mat,index,sample=False):
    # The high-altitude fields need coherent silhouettes, not uniform interior
    # subdivision.  Boundary cells still recurse locally around irrigation.
    v=[];f=[];vertex_cache={};steps=12 if sample else 4

    def parcel_vertex(u,vv):
        key=(round(u,8),round(vv,8))
        if key not in vertex_cache:
            x,z=parcel_point(corners,u,vv)
            vertex_cache[key]=len(v)
            v.append((x,height(x,z)+.002+parcel_relief(index,u,vv,sample),z))
        return vertex_cache[key]

    def channel_clearance(parameter):
        x,z=parcel_point(corners,*parameter)
        return parcel_channel_clearance(x,z)

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
            # Collapse contour intersections within one reconstructed runtime
            # position step.  The previous fixed threshold predated the wider
            # descent landscape and allowed an almost-closed polygon to become
            # a zero-area triangle after signed-16-bit quantization.
            if not cleaned or math.dist(point,parcel_point(corners,*cleaned[-1]))>LANDSCAPE_POSITION_STEP*1.25:
                cleaned.append(parameter)
        if len(cleaned)>1 and math.dist(parcel_point(corners,*cleaned[0]),parcel_point(corners,*cleaned[-1]))<=LANDSCAPE_POSITION_STEP*1.25:
            cleaned.pop()
        world=[parcel_point(corners,*parameter) for parameter in cleaned]
        signed_area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(world,world[1:]+world[:1]))
        if len(cleaned)>=3 and abs(signed_area)>1e-6:
            face=tuple(parcel_vertex(u,vv) for u,vv in cleaned)
            for triangle in upward_triangles(v,face):
                points=[v[index] for index in triangle]
                edges=[math.hypot(a[0]-b[0],a[2]-b[2])
                       for a,b in zip(points,points[1:]+points[:1])]
                area_twice=abs((points[1][0]-points[0][0])*(points[2][2]-points[0][2])
                               -(points[1][2]-points[0][2])*(points[2][0]-points[0][0]))
                projected_altitude=area_twice/max(edges)
                if projected_altitude>LANDSCAPE_POSITION_STEP*1.25:
                    f.append(triangle)

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
        signed_clearance=parcel_channel_clearance(*center)
        if signed_clearance-radius>=0:
            f.append(tuple(parcel_vertex(u,vv) for u,vv in params));return
        if signed_clearance+radius<=0:return
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
    # Alternate distant parcels rely on the authored crop material maps.  Real
    # raised beds remain on the other plots to carry direction changes without
    # paying near-field geometry cost across the entire descent landscape.
    if (index%2==0 or mat in (fallow,wet_paddy)) and not sample:return
    if sample:
        # Shared vertices keep each planting pass visually continuous.  Two
        # broad, row-grouped misses read as uneven establishment; the previous
        # per-segment mesh produced a regular chain of dark points and dashes.
        vertices=[];faces=[];row_count=19;longitudinal=28
        for row in range(row_count):
            vv=.060+(row+.5)/row_count*.88+.0045*math.sin(row*.77)
            half_width=.0075+.0018*math.sin(row*.51)**2
            start=len(vertices)
            gap=None
            if 4<=row<=7:gap=(.20,.36)
            elif 12<=row<=15:gap=(.62,.79)
            elif row in (1,17):gap=(.44,.50)
            for segment in range(longitudinal+1):
                u=.045+.91*segment/longitudinal
                bend=.0048*math.sin(segment*.31+row*.53)+(.006*(u-.5) if row>13 else 0)
                growth=1.0
                if gap:
                    if gap[0]<=u<=gap[1]:growth=.10
                    else:
                        distance=min(abs(u-gap[0]),abs(u-gap[1]))
                        if distance<.055:
                            blend=distance/.055
                            growth=.10+.90*blend*blend*(3-2*blend)
                for lateral,lift in ((-half_width,.002),(0,.009),(half_width,.002)):
                    adjusted_v=vv+bend+lateral
                    x,z=parcel_point(corners,u,adjusted_v)
                    base=height(x,z)+.002+parcel_relief(index,u,adjusted_v,True)
                    vertices.append((x,base+lift*growth,z))
            for segment in range(longitudinal):
                segment_u=.045+.91*(segment+.5)/longitudinal
                if gap and gap[0]<=segment_u<=gap[1]:
                    continue
                for lateral in range(2):
                    a=start+segment*3+lateral
                    faces.extend(upward_triangles(vertices,(a,a+3,a+4,a+1)))
        mesh_obj('Batched coherent rice rows',vertices,faces,crop_rows,land,False)
        return
    if index%3==1 and not sample:corners=[corners[1],corners[2],corners[3],corners[0]]
    width=math.dist(corners[0],corners[3])
    # The demonstration parcel keeps enough rows to read as cultivated land.
    # Neighbouring parcels use wider, varied spacing so the aerial view does
    # not collapse into an implausibly uniform pinstripe grid.
    spacing=.15 if sample else (.26,.34,.42)[index%3]
    rows=max(6,round(width/spacing))
    center=parcel_point(corners,.5,.5)
    distance=math.hypot(center[0],center[1])
    # Static distance-based simplification drops subpixel ridges on far parcels;
    # it is authored geometry rather than a dynamic runtime LOD system.
    row_step=4 if not sample and distance>14 else 3 if not sample and distance>9 else 2 if not sample and distance>5.5 else 1
    vertices=[];faces=[]
    row_material = crop_rows
    for row in range(1,rows,row_step):
        # Low-frequency spacing drift reads as planting passes rather than a
        # mathematically repeated stripe field. It stays deterministic and is
        # bounded well inside the parcel edge.
        vv=(row+.105*math.sin(row*.73+index*.43)+.035*math.sin(row*2.11-index*.29))/rows
        start=len(vertices)
        row_scale=.82+.18*math.sin(row*.61+index*.83)**2
        ridge_half=min(spacing*.12,.025 if sample else .032)*row_scale
        crown_height=(.0105 if sample else .012 if distance<7.5 else .006 if distance<12 else .0035)*row_scale
        cross=((-ridge_half,.003),(-ridge_half*.52,crown_height*.48),(0,crown_height),
               (ridge_half*.52,crown_height*.48),(ridge_half,.003))
        row_near_channel=not sample and any(
            parcel_channel_clearance(*parcel_point(corners,step/24,vv))<.20
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
        # Real planting passes have headlands and occasional short misses.
        # Three bounded gaps break the model-like full-width ribbons while the
        # shared planting direction remains legible from shots 5 and 6.
        gap_centers = (
            .23 + .035 * math.sin(index * .71 + row * .43),
            .52 + .028 * math.sin(index * .37 - row * .61),
            .78 + .032 * math.sin(index * .53 + row * .29),
        )
        gap_half = .010 if sample else .014
        for j in range(longitudinal):
            segment_center=(j+.5)/longitudinal
            if any(abs(segment_center-center)<gap_half for center in gap_centers):
                continue
            for k in range(len(cross)-1):
                a=start+j*len(cross)+k
                face=(a,a+len(cross),a+len(cross)+1,a+1)
                if sample or all(parcel_channel_clearance(vertices[n][0],vertices[n][2])>=0 for n in face):
                    faces.extend(upward_triangles(vertices,face))
    # One shared row material preserves batching; the parcel colors beneath and
    # the varied authored spacing carry the coherent plot-to-plot variation.
    mesh_obj('Batched raised planting beds',vertices,faces,row_material,land,True)


ground_mesh()
# A small number of connected, irregular parcel bands replace the repeated
# seven-by-seven tile matrix. Adjacent bands share the exact same edge points,
# while their cross-field divisions drift or merge between bands. This reads
# as one farm landscape from the descent camera and leaves only the actual
# sample footprint clear at the centre.
parcel_index=0


def parcel_material(index, corners):
    """Deterministic land-cover states for the descent composition.

    Materials change in coherent whole parcels.  This avoids the previous
    wall-to-wall green plates while retaining one authored agricultural fabric.
    """
    cx=sum(point[0] for point in corners)/len(corners)
    cz=sum(point[1] for point in corners)/len(corners)
    zone=math.sin(cx*.115+cz*.061)+.55*math.sin(cx*.037-cz*.143)
    if index % 23 in (5, 17):
        return fallow
    if index % 29 in (9, 21):
        return wet_paddy
    if index % 17 in (4, 12):
        return low_growth
    return greens[0 if zone<-.38 else 2 if zone>.52 else 1]


def parcel_edge(points, index, *, cross_band=False):
    """Author field-scale separators without surrounding every plot by a wall.

    Most joins are low vegetated seams.  Sparse, wider earth tracks establish
    access hierarchy, while the accepted recessed L-channel remains the only
    strongly legible irrigation route near the sample field.
    """
    if path_crosses_channel(points):
        # Continue the field join up to the accepted channel clearance as a
        # flush soil seam.  Skipping the entire join exposed the lowered
        # subsoil as a black slot; the previous raised clipped ribbons read as
        # paired rails.  The existing ribbon clip and taper retain water and
        # bank clearance without either artifact.
        ribbon('Flush earth join at irrigation',points,.034,.001,damp_bank)
        return
    # Only the access hierarchy and selected vegetated seams receive authored
    # geometry.  Drawing every shared boundary as a ribbon recreated the model
    # board grid even after the parcels themselves became smaller.
    if cross_band and index%3:
        return
    if not cross_band and index%4:
        return
    if index % 7 == 0:
        ribbon('Shared flat access track',points,.115 if cross_band else .095,.009,track)
    elif index % 3 == 0:
        ribbon('Low grassy parcel edge',points,.052,.006,green_verge)
    else:
        ribbon('Low earth parcel edge',points,.042,.004,damp_bank)


def parcel_band(z0,z1,bottom,top):
    global parcel_index
    assert len(bottom)==len(top)
    for i in range(len(bottom)-1):
        corners=[(bottom[i],z0),(bottom[i+1],z0),(top[i+1],z1),(top[i],z1)]
        inset=corners
        planted_parcel(inset,parcel_material(parcel_index, inset),parcel_index)
        parcel_index+=1
    # Dividers terminate at shared band edges instead of continuing as a
    # rectangular grid across the entire landscape.
    for i in range(1,len(bottom)-1):
        mid=((bottom[i]+top[i])*.5+terrain_random.uniform(-.12,.12),(z0+z1)*.5)
        points=[(bottom[i],z0),mid,(top[i],z1)]
        # The channel already separates these parcels. Keeping clipped halves
        # of a crossing divider creates paired rails at the bank junction.
        parcel_edge(points, parcel_index+i)


def band_boundaries(levels, phase):
    """Shared, irregular field divisions derived from Thai aerial scale cues.

    The fixed outer anchors and low-frequency drift create elongated plots at
    several scales while adjacent bands retain exactly shared boundaries.
    """
    anchors=[-32,-27.4,-22.7,-18.2,-14.0,-10.1,-6.5,-3.0,.55,4.35,8.65,13.5,19.0,25.1,32]
    result=[]
    for level,z in enumerate(levels):
        boundary=[anchors[0]]
        for column,x in enumerate(anchors[1:-1],1):
            drift=(.48*math.sin(level*.83+column*1.37+phase)
                   +.20*math.sin(level*1.91-column*.57+phase*.4))
            boundary.append(x+drift)
        boundary.append(anchors[-1]);result.append(boundary)
    return result


top_levels=[3.52,5.85,8.45,11.35,14.65,18.45,22.75,27.35,32.0]
bottom_levels=[-32.0,-27.10,-22.65,-18.55,-14.90,-11.55,-8.45,-5.55,-2.65]
top_boundaries=band_boundaries(top_levels,.37)
bottom_boundaries=band_boundaries(bottom_levels,1.71)
top_bands=[(a,b,top_boundaries[index],top_boundaries[index+1])
           for index,(a,b) in enumerate(zip(top_levels,top_levels[1:]))]
bottom_bands=[(a,b,bottom_boundaries[index],bottom_boundaries[index+1])
              for index,(a,b) in enumerate(zip(bottom_levels,bottom_levels[1:]))]
for band in bottom_bands+top_bands:parcel_band(*band)
for edge_index,(_,z,_,edge) in enumerate(bottom_bands[:-1]+top_bands[:-1]):
    parcel_edge([(x,z) for x in edge], edge_index, cross_band=True)

# Side parcels close the agricultural fabric around the unchanged field and
# its irrigation loop. Their single shared cross-bank connects to the outer
# band network without creating another repeated row.
for x_edges, central_top, splits in [([-32,-18.5,-10.4,-2.82],2.58,[-2.65,-.72,.84,2.58]),
                                     ([3.64,10.8,19.2,32],3.52,[-2.65,-.38,1.25,3.52])]:
    for zi,(z0,z1) in enumerate(zip(splits,splits[1:])):
        drift=.20*math.sin(zi*.9)
        for xi,(x0,x1) in enumerate(zip(x_edges,x_edges[1:])):
            corners=[(x0,z0),(x1,z0),(x1+drift*(xi%2-.5),z1),(x0+drift*((xi+1)%2-.5),z1)]
            inset=corners
            planted_parcel(inset,parcel_material(parcel_index, inset),parcel_index)
            parcel_index+=1
        parcel_edge([(x_edges[0],z1),(x_edges[-1],z1)], parcel_index+zi, cross_band=True)
    for x in x_edges[1:-1]:
        parcel_edge([(x,splits[0]),(x+terrain_random.uniform(-.18,.18),splits[-1])], parcel_index+round(x*3))

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
        for side,((x,z),lift) in enumerate(((inner[i],inner_lift),(outer[i],outer_lift))):
            if mat==water:
                # Millimetre-scale, multi-directional ripples shape real
                # specular normals. They preserve the approved water footprint
                # and replace a perfectly flat ribbon without painted bands.
                lift+=(.0024*math.sin(x*1.73+z*.63+side*1.4)
                       +.0012*math.sin(x*.58-z*2.31+side*.7))
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
# Two shallow branches connect to the primary route outside the hero field.
# Their compact cross-section supplies irrigation hierarchy in shot 5 while
# the accepted L-channel footprint and sample clearance remain unchanged.
for secondary in SECONDARY_CHANNELS:
    channel_strip('Secondary irrigation water',-.070,.070,.002,.002,water,secondary)
    channel_strip('Secondary wet ditch edge',-.125,-.070,.005,.002,wet_bank,secondary)
    channel_strip('Secondary wet ditch edge',.070,.125,.002,.005,wet_bank,secondary)
    channel_strip('Secondary grassy shoulder',-.235,-.125,.004,.005,green_verge,secondary)
    channel_strip('Secondary grassy shoulder',.125,.235,.005,.004,green_verge,secondary)
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
# A second, gently wandering lane establishes a larger landscape hierarchy in
# the high descent camera.  It stays well clear of the accepted sample boundary
# and is clipped by the existing channel-aware ribbon helper.
ribbon('Secondary farm access track',[(-11.6,-18),(-10.6,-11),(-10.9,-3.4),(-10.1,4.2),(-11.0,11.8),(-9.4,18)],.17,.038)


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


# Three branched silhouettes at a believable crop-edge scale. Variant one is
# the representative shot-6 tree. Foliage is built from branch-attached leaf
# sprays rather than closed ellipsoids, leaving genuine crown gaps and visible
# first-order structure at the presentation cameras.
tree_specs=[(.98,.54,1.48),(1.18,.43,1.85),(.78,.65,1.29)]
for variant_index,(trunk_height,spread,crown_height) in enumerate(tree_specs):
    parent=tree_variants[variant_index];rng=random.Random(730+variant_index);leaf_batches={}
    tapered_branch(parent,'Tapered living trunk',(0,0,0),(.045,trunk_height,0),.049,.013,sides=9)
    primary_ends=[]
    branch_count=(11,9,10)[variant_index]
    for branch in range(branch_count):
        angle=branch*2.399+rng.uniform(-.25,.25)
        start=(.02,trunk_height*rng.uniform(.46,.90),0)
        end=(math.cos(angle)*spread*rng.uniform(.62,.92),rng.uniform(trunk_height*.86,crown_height),math.sin(angle)*spread*rng.uniform(.62,.92))
        primary_ends.append(end)
        tapered_branch(parent,'Primary branching limb',start,end,.018,.004,sides=7)
        # Small edge sprays break the near-camera silhouette without the large
        # disconnected leaf cards visible in the previous lower-right crown.
        for spray in (-.34,0,.34):
            leaf_angle=angle+spray
            direction=(math.cos(leaf_angle),rng.uniform(.24,.62),math.sin(leaf_angle))
            length=rng.uniform(.135,.205) if variant_index==0 else rng.uniform(.120,.185)
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
                    length=rng.uniform(.085,.135)
                    shade=foliage_light if side>0 and rng.random()>.38 else foliage
                    add_leaf(location,direction,length,length*rng.uniform(.20,.27),shade,leaf_batches,side*rng.uniform(.35,.95))
    # Branch-attached fans overlap into an open crown at distance. Their
    # irregular elevation and scale retain negative spaces instead of forming
    # another smooth solid blob.
    for cluster,end in enumerate(primary_ends+[(0,trunk_height*.96,0)]):
        leaf_count=(26 if cluster<len(primary_ends) else 32) if variant_index==0 else (20 if cluster<len(primary_ends) else 26)
        for leaf in range(leaf_count):
            angle=math.tau*(leaf/leaf_count)+rng.uniform(-.16,.16)+cluster*.71
            direction=(math.cos(angle)*rng.uniform(.66,1.0),rng.uniform(-.22,.88),math.sin(angle)*rng.uniform(.66,1.0))
            length=rng.uniform(.135,.235) if variant_index==0 else rng.uniform(.115,.205)
            shade=foliage_light if (leaf+cluster)%3 else foliage
            add_leaf(end,direction,length,length*rng.uniform(.24,.34),shade,leaf_batches,rng.uniform(-1.1,1.1))
    for leaf_batch in leaf_batches.values():
        mesh_obj('Small folded leaves in branching crown',leaf_batch['vertices'],leaf_batch['faces'],leaf_batch['material'],parent,True)

# A restrained field-edge palm supplies a regional scale cue without turning
# every crown into the same broadleaf mass.  Each frond has an authored petiole
# and a compact fan at its end; the earlier full-length radial blades formed a
# bright star from the shot-6 camera instead of a believable palm crown.
palm_parent=tree_variants[3];palm_batches={};palm_rng=random.Random(761)
palm_segments=[((0,0,0),(.018,.66,.014),.048,.036),
               ((.018,.66,.014),(.042,1.22,.004),.036,.025),
               ((.042,1.22,.004),(.012,1.76,-.016),.025,.014)]
for start,end,base_radius,tip_radius in palm_segments:
    tapered_branch(palm_parent,'Palmyra segmented trunk',start,end,base_radius,tip_radius,sides=10)
crown=(.012,1.76,-.016)
for frond in range(11):
    angle=frond*math.tau/11+palm_rng.uniform(-.12,.12)
    elevation=palm_rng.uniform(-.20,.30)
    petiole_length=palm_rng.uniform(.20,.31)
    direction=Vector((math.cos(angle),elevation,math.sin(angle))).normalized()
    fan_hub=tuple(Vector(crown)+direction*petiole_length)
    tapered_branch(palm_parent,'Palmyra leaf petiole',crown,fan_hub,.010,.003,
                   mat=foliage,sides=5)
    fan_count=5+(frond%3==0)
    for blade in range(fan_count):
        spread=(blade-(fan_count-1)/2)*.17
        blade_angle=angle+spread
        blade_direction=(math.cos(blade_angle),
                         elevation+palm_rng.uniform(.05,.28)-abs(spread)*.08,
                         math.sin(blade_angle))
        blade_length=palm_rng.uniform(.16,.27)*(1-.12*abs(spread))
        shade=foliage_light if blade>=fan_count//2 and frond%3 else foliage
        add_leaf(fan_hub,blade_direction,blade_length,blade_length*.18,shade,
                 palm_batches,spread*.9+palm_rng.uniform(-.18,.18))
# A few restrained drooping fans break the crown's upper ring while retaining
# visible air between the main frond groups.
for frond in range(3):
    angle=.7+frond*2.15
    hub=tuple(Vector(crown)+Vector((math.cos(angle),-.18,math.sin(angle))).normalized()*.21)
    tapered_branch(palm_parent,'Palmyra drooping petiole',crown,hub,.009,.0025,
                   mat=foliage,sides=5)
    for blade in range(4):
        blade_angle=angle+(blade-1.5)*.16
        add_leaf(hub,(math.cos(blade_angle),-.34+blade*.055,math.sin(blade_angle)),
                 .15+blade*.018,.027,foliage,palm_batches,(blade-1.5)*.2)
for leaf_batch in palm_batches.values():
    mesh_obj('Palmyra attached fan leaves',leaf_batch['vertices'],leaf_batch['faces'],leaf_batch['material'],palm_parent,True)

# Low, batched hedgerows remain visible in the locked descent shot before the
# hero tree instances appear.  Their grouped spacing gives the broad landscape
# a scale cue without cloning the near-camera crowns or adding new materials.
distant_rng=random.Random(992);distant_batches={}
distant_anchors=[(-15.5,9.4),(-10.2,14.1),(-3.8,16.3),(4.8,15.4),(11.8,12.2),(16.0,7.5),
                 (-15.0,-10.8),(-8.4,-15.0),(9.8,-15.2),(15.2,-10.4),
                 (-7.2,5.9),(7.9,6.3),(-8.8,-6.5),(9.4,-5.8)]
for cluster,(anchor_x,anchor_z) in enumerate(distant_anchors):
    count=2+(cluster%3==0)
    for member in range(count):
        x=anchor_x+(member-(count-1)/2)*distant_rng.uniform(.30,.52)
        z=anchor_z+distant_rng.uniform(-.24,.24)
        ground=height(x,z);near_scale=.15 if cluster>=10 else 0
        trunk_height=distant_rng.uniform(.42+near_scale,.68+near_scale)
        tapered_branch(land,'Distant field-edge trunk',(x,ground,z),
                       (x+distant_rng.uniform(-.025,.025),ground+trunk_height,z+distant_rng.uniform(-.025,.025)),
                       .025,.007,mat=soil,sides=6)
        crown=(x,ground+trunk_height,z)
        leaf_count=7+(member+cluster)%4
        for leaf in range(leaf_count):
            angle=math.tau*leaf/leaf_count+distant_rng.uniform(-.22,.22)
            direction=(math.cos(angle),distant_rng.uniform(.12,.78),math.sin(angle))
            length=distant_rng.uniform(.16+near_scale*.25,.29+near_scale*.35)
            shade=low_growth if (leaf+member)%3 else green_verge
            add_leaf(crown,direction,length,length*distant_rng.uniform(.20,.30),shade,
                     distant_batches,distant_rng.uniform(-.8,.8))
for leaf_batch in distant_batches.values():
    mesh_obj('Batched distant field-edge foliage',leaf_batch['vertices'],leaf_batch['faces'],
             leaf_batch['material'],land,True)

# Low field-edge hedgerows establish a readable vegetation hierarchy in shot 5
# before the reusable hero trees enter.  They follow selected parcel joins,
# keep genuine gaps between groups, and reuse existing land materials so the
# scale cue does not add runtime draw calls.
hedge_rng=random.Random(1441);hedge_batches={}
hedgerow_lines=[
    [(-15.2,6.0),(-13.8,6.2),(-12.1,6.1),(-10.5,6.35)],
    [(7.4,6.5),(8.8,6.45),(10.3,6.7),(12.0,6.6)],
    [(-13.8,-9.2),(-12.2,-9.05),(-10.7,-9.25)],
    [(8.0,-6.15),(9.5,-6.0),(11.2,-6.3),(12.7,-6.15)],
]
for line_index,line in enumerate(hedgerow_lines):
    for member,(x,z) in enumerate(line):
        x+=hedge_rng.uniform(-.12,.12);z+=hedge_rng.uniform(-.10,.10)
        ground=height(x,z);height_scale=hedge_rng.uniform(.34,.54)
        top=(x+hedge_rng.uniform(-.035,.035),ground+height_scale,z+hedge_rng.uniform(-.035,.035))
        tapered_branch(land,'Field-edge shrub stem',(x,ground,z),top,.020,.004,
                       mat=soil,sides=5)
        spray_count=9+(line_index+member)%4
        for spray in range(spray_count):
            angle=math.tau*spray/spray_count+hedge_rng.uniform(-.20,.20)
            direction=(math.cos(angle),hedge_rng.uniform(.08,.70),math.sin(angle))
            length=hedge_rng.uniform(.12,.22)
            shade=green_verge if (spray+member)%3 else low_growth
            add_leaf(top,direction,length,length*hedge_rng.uniform(.23,.32),shade,
                     hedge_batches,hedge_rng.uniform(-.75,.75))
for leaf_batch in hedge_batches.values():
    mesh_obj('Batched open field-edge hedgerow',leaf_batch['vertices'],leaf_batch['faces'],
             leaf_batch['material'],land,True)


# Shared original texture inputs and UV projection are saved into the .blend.
import sys
sys.path.insert(0,str(Path(__file__).parent))
from surface_maps import build_surfaces, apply_surface
surface_output=OUT.parent/'textures'/'surfaces'
surface_images=build_surfaces(surface_output)
for mat in bpy.data.materials:
    role=('foil' if mat in (gold,gold_dull) else 'solar' if mat in (cells,cells_oblique) else 'metal' if mat==silver else 'water' if mat in (water,wet_paddy) else 'leaf' if mat in (foliage,foliage_light) else 'crop' if mat in greens or mat in (crop_rows,green_verge,low_growth) else 'soil' if mat in (soil,track,damp_bank,wet_bank,bark,fallow) else None)
    role = mat.get('surface', role)
    if role:apply_surface(mat,role,surface_images,.38 if role=='foil' else .16 if role=='solar' else .82 if role=='water' else .20 if mat==crop_rows else .16 if mat in (track,damp_bank,green_verge) else .4)
    if mat in (foliage,foliage_light,crop_rows,green_verge,low_growth):mat['doubleSided']=True
for obj in bpy.data.objects:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Authored surface UV')
    for polygon in obj.data.polygons:
        n=(obj.matrix_world.to_3x3()@polygon.normal).normalized()
        axis=max(range(3),key=lambda k:abs(n[k]));axes=[k for k in range(3) if k!=axis]
        mat=obj.data.materials[polygon.material_index]
        # World-scale projections keep soil/crop detail from repeating as tiny
        # wallpaper across large parcels. Water uses still broader wave bands.
        scale=(.15 if mat in (water,wet_paddy) else 2.6 if mat in (foliage,foliage_light) else .24 if mat in greens or mat in (crop_rows,green_verge,low_growth) else
               .22 if mat==track else .27 if mat==damp_bank else .31 if mat==wet_bank else .16 if mat in (soil,fallow) else 1.0)
        for loop in polygon.loop_indices:
            point=obj.matrix_world@obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(point[axes[0]]*scale,point[axes[1]]*scale)


# Add the locked-camera master scene after runtime UV authoring.  The compact
# exporter below still reads only 02_SPACECRAFT, 08_EXPORT and the three tree
# prototype collections, so review-only Earth/camera/light objects cannot leak
# into the browser payload.
from static_scene import author_master_scene
master_report = author_master_scene(
    repo_root=ROOT,
    evidence_root=EVIDENCE,
    collections={
        "cameras": cameras_root,
        "earth": earth_root,
        "spacecraft": ship,
        "thailand": thailand_root,
        "descent": descent_root,
        "hero": hero_root,
        "vegetation": tree_root,
        "lighting": lighting_root,
        "export": land,
        "reference": reference_root,
    },
    tree_variants=tree_variants,
    sample_bounds=SAMPLE_BOUNDS,
    height_fn=height,
    curvature_divisor=TERRAIN_CURVE_DIVISOR,
)


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
            group = groups.setdefault((mat.name, obj.get("mechanism", "")), {"part": obj.get("mechanism"), "pivot": list(obj.get("pivot", (0,0,0))), "material": mat, "vertices": [], "indices": [], "lookup": {}})
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
    for (name, _part), group in groups.items():
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
        meshes.append({"name": name, **({"part": group["part"], "pivot": group["pivot"]} if group["part"] else {}), "material": {"color": list(mat.diffuse_color[:3]), "metalness": mat["metalness"], "roughness": mat["roughness"], "clearcoat": mat["clearcoat"], "surface": mat.get("surface"), "normalStrength": mat.get("normalStrength", .5), "doubleSided": bool(mat.get("doubleSided", False)), **({"emissive": list(mat["emissive"]), "emissiveStrength": mat["emissiveStrength"]} if "emissive" in mat else {})}, "offset": offset, "scale": scale, "position": base64.b64encode(pos).decode(), "uv": base64.b64encode(uvs).decode(), "normal": base64.b64encode(norms).decode(), "index": base64.b64encode(indices).decode(), "index32": use32})
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
(EVIDENCE / "asset-build.json").write_text(json.dumps({"blender": bpy.app.version_string, "assets": stats, "staticScene": master_report}, indent=2))
print("Saved editable Blender source", flush=True)
