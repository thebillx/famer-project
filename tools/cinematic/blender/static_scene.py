"""Build the durable static-review scene around the compact runtime assets.

The production journey remains the camera and state source of truth.  This
module adds review cameras, Earth, Thailand focus, lighting and presentation
instances to the editable Blender file without changing runtime timing.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


RUNTIME_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def to_blender(point):
    return Vector((point[0], -point[2], point[1]))


def runtime_rotation(quaternion):
    q = Quaternion((quaternion[3], quaternion[0], quaternion[1], quaternion[2]))
    return RUNTIME_TO_BLENDER @ q.to_matrix() @ RUNTIME_TO_BLENDER.transposed()


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def link_once(obj, collection):
    if collection not in obj.users_collection:
        collection.objects.link(obj)


def point_at(obj, target):
    obj.rotation_euler = (to_blender(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def image_node_material(name, image_path, *, roughness=0.8, emission_path=None,
                        emission_strength=0.0, alpha_path=None, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = roughness
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = f"{name} · authored color"
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    texture.image.pack()
    links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    if emission_path:
        night = nodes.new("ShaderNodeTexImage")
        night.name = f"{name} · restrained night response"
        night.image = bpy.data.images.load(str(emission_path), check_existing=True)
        night.image.pack()
        links.new(night.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha_path:
        alpha_texture = nodes.new("ShaderNodeTexImage")
        alpha_texture.name = f"{name} · cloud alpha"
        alpha_texture.image = bpy.data.images.load(str(alpha_path), check_existing=True)
        alpha_texture.image.pack()
        opacity = nodes.new("ShaderNodeMath")
        opacity.name = "GLOBAL_OPACITY"
        opacity.operation = "MULTIPLY"
        opacity.inputs[1].default_value = alpha
        links.new(alpha_texture.outputs["Alpha"], opacity.inputs[0])
        links.new(opacity.outputs[0], bsdf.inputs["Alpha"])
        try:
            material.surface_render_method = "DITHERED"
        except (AttributeError, TypeError):
            pass
    material.diffuse_color = (1, 1, 1, alpha)
    return material


def atmosphere_material():
    material = bpy.data.materials.new("MAT_EARTH_ATMOSPHERE_LIMB")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (0.12, 0.43, 0.78, 1)
    emission.inputs["Strength"].default_value = 0.36
    layer = nodes.new("ShaderNodeLayerWeight")
    layer.inputs["Blend"].default_value = 0.30
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.12
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].color = (0.42, 0.68, 1.0, 1)
    mix = nodes.new("ShaderNodeMixShader")
    links.new(layer.outputs["Facing"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    try:
        material.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    material.diffuse_color = (0.12, 0.43, 0.78, 0.25)
    return material


def earth_system(root, collection, thailand_collection, repo_root):
    earth_root = bpy.data.objects.new("EARTH_SYSTEM_ROOT", None)
    collection.objects.link(earth_root)
    earth_root.location = to_blender((0, -40, 0))
    lat, lon = math.radians(15.87), math.radians(100.99)
    thailand = Vector((math.cos(lon) * math.cos(lat), math.sin(lat), -math.sin(lon) * math.cos(lat)))
    rotation = thailand.rotation_difference(Vector((0, 1, 0))).to_matrix()
    earth_root.rotation_euler = (RUNTIME_TO_BLENDER @ rotation @ RUNTIME_TO_BLENDER.transposed()).to_euler()

    texture_root = repo_root / "apps/web/public/cinematic/textures"
    surface_material = image_node_material(
        "MAT_EARTH_SURFACE", texture_root / "earth-day.jpg", roughness=.91,
        emission_path=texture_root / "earth-night.png", emission_strength=.055)
    cloud_material = image_node_material(
        "MAT_EARTH_CLOUDS", texture_root / "earth-clouds.png", roughness=1,
        alpha_path=texture_root / "earth-clouds.png", alpha=.36)
    shadow_material = bpy.data.materials.new("MAT_EARTH_CLOUD_SHADOW")
    shadow_material.use_nodes = True
    shadow_nodes, shadow_links = shadow_material.node_tree.nodes, shadow_material.node_tree.links
    shadow_bsdf = shadow_nodes.get("Principled BSDF")
    shadow_bsdf.inputs["Base Color"].default_value = (.005, .012, .022, 1)
    shadow_bsdf.inputs["Roughness"].default_value = 1
    shadow_bsdf.inputs["Alpha"].default_value = .16
    shadow_alpha = shadow_nodes.new("ShaderNodeTexImage")
    shadow_alpha.image = bpy.data.images.load(str(texture_root / "earth-clouds.png"), check_existing=True)
    shadow_alpha.image.pack()
    shadow_opacity = shadow_nodes.new("ShaderNodeMath")
    shadow_opacity.name = "GLOBAL_OPACITY"
    shadow_opacity.operation = "MULTIPLY"
    shadow_opacity.inputs[1].default_value = .16
    shadow_links.new(shadow_alpha.outputs["Alpha"], shadow_opacity.inputs[0])
    shadow_links.new(shadow_opacity.outputs[0], shadow_bsdf.inputs["Alpha"])
    try:
        shadow_material.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    atmo_material = atmosphere_material()
    for name, radius, segments, rings, material in (
        ("EARTH_SURFACE", 40, 128, 80, surface_material),
        ("EARTH_CLOUD_SHADOW", 40.035, 96, 64, shadow_material),
        ("EARTH_CLOUD_LAYER", 40.15, 112, 72, cloud_material),
        ("EARTH_ATMOSPHERE_SHELL", 40.72, 112, 72, atmo_material),
    ):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius)
        obj = bpy.context.object
        obj.name = name
        obj.data.name = f"MESH_{name}"
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        move_to_collection(obj, collection)
        obj.parent = earth_root

    geojson = json.loads((repo_root / "tools/cinematic/references/natural-earth-thailand.geojson").read_text())
    geometry = geojson["features"][0]["geometry"]
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    ring = max((polygon[0] for polygon in polygons), key=len)
    curve = bpy.data.curves.new("CURVE_THAILAND_GEOGRAPHIC_OUTLINE", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    # Keep the geographic cue attached to the basemap.  At the locked shot-4
    # camera a thicker tube reads as a floating badge rather than a locator.
    curve.bevel_depth = .012
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(ring) - 1)
    for point, (longitude, latitude) in zip(spline.points, ring):
        lat_r, lon_r = math.radians(latitude), math.radians(longitude)
        runtime = Vector((math.cos(lon_r) * math.cos(lat_r), math.sin(lat_r), -math.sin(lon_r) * math.cos(lat_r))) * 40.09
        blender = RUNTIME_TO_BLENDER @ runtime
        point.co = (*blender, 1)
    outline = bpy.data.objects.new("THAILAND_RELIEF_OUTLINE", curve)
    thailand_collection.objects.link(outline)
    outline.parent = earth_root
    focus_material = bpy.data.materials.new("MAT_THAILAND_FOCUS_GOLD")
    focus_material.use_nodes = True
    focus_bsdf = focus_material.node_tree.nodes.get("Principled BSDF")
    focus_bsdf.inputs["Base Color"].default_value = (.70, .38, .10, 1)
    focus_bsdf.inputs["Emission Color"].default_value = (.72, .30, .055, 1)
    focus_bsdf.inputs["Emission Strength"].default_value = .62
    focus_bsdf.inputs["Roughness"].default_value = .45
    focus_bsdf.inputs["Alpha"].default_value = 0
    try:
        focus_material.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    outline.data.materials.append(focus_material)
    outline["source"] = "Natural Earth 5.1.2 public-domain country boundary"
    return earth_root


def author_cameras(collection, contract_path):
    contract = json.loads(contract_path.read_text())
    cameras = {}
    for record in contract["cameras"]:
        name = f"CAM_SHOT_{record['shot']:02d}_{record['viewport'].upper()}_{record['slug'].upper().replace('-', '_')}"
        data = bpy.data.cameras.new(f"DATA_{name}")
        # Three.js PerspectiveCamera.fov is vertical.  Blender's default AUTO
        # sensor fit treats ``angle`` as horizontal for a landscape render,
        # which cropped the locked review cameras and invalidated parity.
        data.sensor_fit = "VERTICAL"
        data.angle_y = math.radians(record["fov"])
        data.lens_unit = "FOV"
        data.clip_start = .08
        data.clip_end = 450
        data.show_passepartout = True
        data.passepartout_alpha = .78
        camera = bpy.data.objects.new(name, data)
        collection.objects.link(camera)
        camera.location = to_blender(record["position"])
        point_at(camera, record["target"])
        camera["locked_progress"] = record["progress"]
        camera["viewport"] = record["viewport"]
        camera["review_width"] = record["width"]
        camera["review_height"] = record["height"]
        camera["text_safe_json"] = json.dumps(record["textSafe"], separators=(",", ":"))
        camera["source_contract"] = str(contract_path.name)
        cameras[(record["shot"], record["viewport"])] = camera
    return contract, cameras


def author_lighting(collection):
    def light(name, kind, location, energy, color, *, angle=.1, size=5,
              diffuse_factor=1.0, specular_factor=1.0):
        data = bpy.data.lights.new(f"DATA_{name}", kind)
        data.energy = energy
        data.color = color
        if kind == "SUN":
            data.angle = angle
        else:
            data.shape = "DISK"
            data.size = size
        data.diffuse_factor = diffuse_factor
        data.specular_factor = specular_factor
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = to_blender(location)
        point_at(obj, (0, 0, 0))
        return obj
    light("LIGHT_SOLAR_KEY", "SUN", (-30, 30, 18), 4.2, (1.0, .86, .72), angle=.08)
    light("LIGHT_SKY_FILL", "AREA", (20, 18, -15), 1150, (.34, .58, .82), size=16)
    light("LIGHT_FIELD_BOUNCE", "AREA", (-8, 5, 10), 700, (.52, .64, .35), size=14)
    light("LIGHT_SKY_REFLECTION", "AREA", (-4, 24, 18), 560, (.48, .66, .78),
          size=24, diffuse_factor=.10, specular_factor=1.0)


def add_flatten_shape_keys(export_collection):
    count = 0
    for obj in export_collection.objects:
        if obj.type != "MESH" or len(obj.data.vertices) == 0:
            continue
        basis = obj.shape_key_add(name="BASIS")
        flattened = obj.shape_key_add(name="FIELD_FLATTEN_MAX")
        for base, target in zip(basis.data, flattened.data):
            target.co.z = base.co.z + (base.co.x * base.co.x + base.co.y * base.co.y) / 80 * .92
        flattened.value = 0
        obj["runtime_flatten_max"] = .92
        count += 1
    return count


def js_seeded_random(seed=21):
    """Yield the exact 32-bit Mulberry32 sequence used by timeline.js."""
    def signed(value):
        value &= 0xFFFFFFFF
        return value if value < 0x80000000 else value - 0x100000000
    state = signed(seed)
    while True:
        state = signed(state + 0x6D2B79F5)
        t = signed((state ^ (state & 0xFFFFFFFF) >> 15) * (1 | state))
        t = signed(t + signed((t ^ (t & 0xFFFFFFFF) >> 7) * (61 | t)) ^ t)
        yield ((t ^ (t & 0xFFFFFFFF) >> 14) & 0xFFFFFFFF) / 4294967296


def author_tree_placements(vegetation_collection, variants, height_fn):
    placements = bpy.data.collections.new("VEGETATION_PLACEMENTS_DESKTOP")
    vegetation_collection.children.link(placements)
    for variant in variants:
        variant.hide_render = True
        variant.hide_viewport = True
    random = js_seeded_random(21)
    grove_anchors = [(-5.3,4.0),(5.25,4.7),(-9.8,8.2),(10.2,8.8),(-7.2,-7.9),(7.4,-7.8),
                     (-12.8,2.0),(13.2,1.1),(-10.5,-12.8),(-1.2,-12.3),(10.7,-12.0),(-14,-1)]
    anchor = None
    previous_cluster = -1
    instances = []
    for index in range(30):
        cluster = math.floor(index / 3)
        if anchor is None or cluster != previous_cluster:
            ax, az = grove_anchors[cluster]
            anchor = (ax + (next(random) - .5) * 1.15, az + (next(random) - .5) * 1.15)
            previous_cluster = cluster
        angle, radius = next(random) * math.tau, .34 + next(random) * 1.12
        x = max(-13, min(13, anchor[0] + math.cos(angle) * radius))
        z = max(-13, min(13, anchor[1] + math.sin(angle) * radius))
        if -2.95 < x < 2.90 and -2.75 < z < 2.72:
            x = max(-15.5, min(15.5, x + (-4 if x < 0 else 4)))
        rotation, scale = next(random) * math.tau, (.86 + next(random) * .36, .79 + next(random) * .31, .86 + next(random) * .36)
        variant = variants[index % len(variants)]
        for source in variant.objects:
            obj = source.copy()
            obj.data = source.data
            obj.name = f"{source.name} · INSTANCE_{index:02d}"
            placements.objects.link(obj)
            obj.location = to_blender((x, height_fn(x, z), z))
            obj.rotation_euler.z = rotation
            obj.scale = scale
            obj["runtime_x"] = x
            obj["runtime_z"] = z
            obj["runtime_base_height"] = height_fn(x, z)
            obj["runtime_instance"] = index
            instances.append(obj)
    return instances


def add_sample_boundary(hero_collection, bounds, height_fn):
    x0, x1, z0, z1 = bounds
    points = []
    corners = ((x0, z0), (x1, z0), (x1, z1), (x0, z1))
    for edge in range(4):
        a, b = corners[edge], corners[(edge + 1) % 4]
        for index in range(24):
            t = index / 24
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            points.append(to_blender((x, height_fn(x, z) + .052, z)))
    curve = bpy.data.curves.new("CURVE_SAMPLE_BOUNDARY", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = .014
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new("SAMPLE_BOUNDARY_STATIC_PARITY", curve)
    hero_collection.objects.link(obj)
    material = bpy.data.materials.new("MAT_SAMPLE_BOUNDARY_GOLD")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (.92, .58, .24, 1)
    bsdf.inputs["Emission Color"].default_value = (.92, .48, .12, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = .42
    obj.data.materials.append(material)
    return obj


def author_master_scene(*, repo_root, evidence_root, collections, tree_variants, sample_bounds, height_fn):
    contract_path = repo_root / "tools/cinematic/blender/camera-contract.json"
    contract, cameras = author_cameras(collections["cameras"], contract_path)
    earth = earth_system(None, collections["earth"], collections["thailand"], repo_root)
    author_lighting(collections["lighting"])

    spacecraft_stage = bpy.data.objects.new("SPACECRAFT_STAGE_ROOT", None)
    collections["spacecraft"].objects.link(spacecraft_stage)
    for obj in list(collections["spacecraft"].objects):
        if obj is not spacecraft_stage:
            obj.parent = spacecraft_stage

    hero_names = ("Sample field", "irrigation", "channel", "sample verge")
    for obj in collections["export"].objects:
        destination = collections["hero"] if any(token.lower() in obj.name.lower() for token in hero_names) else collections["descent"]
        link_once(obj, destination)
    flatten_meshes = add_flatten_shape_keys(collections["export"])
    instances = author_tree_placements(collections["vegetation"], tree_variants, height_fn)
    boundary = add_sample_boundary(collections["hero"], sample_bounds, height_fn)
    boundary.hide_render = True

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.0048, .009, .015, 1)
    background.inputs["Strength"].default_value = .20
    scene.camera = cameras[(1, "desktop")]
    scene["static_asset_contract"] = contract_path.name
    scene["motion_status"] = "Locked production transforms only; final motion polish intentionally excluded"
    scene["source_of_truth"] = "Blender master + deterministic compact runtime exports"
    scene["mobile_safe_guides"] = "Stored on CAM_*_MOBILE custom properties from production sampleCamera()"
    scene["editable_source_delivery"] = "SHA-bound GitHub Actions artifact because Git LFS is unavailable"
    report = {
        "schema": 1,
        "cameraRecords": len(contract["cameras"]),
        "lockedShots": sorted({record["shot"] for record in contract["cameras"]}),
        "flattenShapeKeyMeshes": flatten_meshes,
        "desktopTreeInstanceObjects": len(instances),
        "spacecraftStageRoot": spacecraft_stage.name,
        "collections": sorted(collections),
        "earthTexturesPacked": ["earth-day.jpg", "earth-clouds.png", "earth-night.png"],
        "thailandReference": "natural-earth-thailand.geojson",
        "motionPolishExcluded": True,
    }
    (evidence_root / "static-scene-build.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
