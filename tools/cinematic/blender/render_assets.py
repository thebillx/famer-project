"""Render and save an inspectable Blender source with separate asset collections.

AGRISCOPE_BLENDER_OUTPUT selects the output directory used by build_assets.py.
Run after that script with Blender --background --python or the official bpy.
"""
import math
import os
from pathlib import Path
import random
import bpy
from mathutils import Vector

folder=Path(os.environ.get('AGRISCOPE_BLENDER_OUTPUT', str(Path(__file__).resolve().parent/'output')))
bpy.ops.wm.open_mainfile(filepath=str(folder/'AgriScope-Cinematic-Assets.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background');background.inputs['Color'].default_value=(.018,.025,.04,1);background.inputs['Strength'].default_value=.4
presentation=bpy.data.collections.new('04 · Preview camera and lights');scene.collection.children.link(presentation)
def relocate(obj):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 presentation.objects.link(obj)
def coords(p):return Vector((p[0],-p[2],p[1]))
def point(obj,target):obj.rotation_euler=(coords(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name,where,power,color,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
 obj=bpy.data.objects.new(name,data);presentation.objects.link(obj);obj.location=coords(where);point(obj,(0,0,0));return obj
light('Solar key',(-12,16,14),2600,(1,.84,.65),5)
light('Earth bounce',(8,-4,8),650,(.40,.63,1),10)
light('Rim',(4,8,-10),1700,(.65,.81,1),5)
data=bpy.data.cameras.new('Cinematic asset inspection');camera=bpy.data.objects.new('Cinematic asset inspection',data);presentation.objects.link(camera)
camera.location=coords((6,5.5,17));point(camera,(0,.1,0));data.lens=38;scene.camera=camera
ship=bpy.data.collections['01 · Spacecraft / editable parts'];land=bpy.data.collections['02 · Agricultural surface / editable parts']
tree_variants=[bpy.data.collections[f'Tree · {name}'] for name in ('Round canopy','Tall canopy','Open crown')]
land.hide_render=True;land.hide_viewport=True
for tree in tree_variants:tree.hide_render=True;tree.hide_viewport=True
bpy.ops.object.select_all(action='DESELECT')
# Opening the .blend presents the spacecraft, not all assets overlapping at origin.
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=18
  area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
  area.spaces.active.region_3d.view_location=coords((0,0,0))
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'AgriScope-Cinematic-Assets.blend'))
scene.render.filepath=str(folder/'spacecraft-blender.png');bpy.ops.render.render(write_still=True)
ship.hide_render=True;land.hide_render=False
# Original prototype instances on the surrounding landscape, away from the sample.
r=random.Random(21)
for i in range(36):
 x=(r.random()-.5)*30;z=(r.random()-.5)*30
 if abs(x)<3.2 and abs(z)<3.2:x+=5
 h=-(x*x+z*z)/80+.05+math.sin(x*.52)*math.sin(z*.43)*.035
 angle=r.random()*math.tau;scale=.65+r.random()*.7
 tree=tree_variants[i%len(tree_variants)]
 for source in list(tree.objects):
  obj=source.copy();obj.data=source.data;presentation.objects.link(obj)
  # Keep origin prototypes hidden; only the landscape copies belong in this render.
  obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
  from mathutils import Matrix
  obj.matrix_world=Matrix.Translation(coords((x,h,z)))@Matrix.Rotation(angle,4,'Z')@Matrix.Diagonal((scale,scale,scale,1))@source.matrix_basis
camera.location=coords((12,16,17));point(camera,(0,-1,0));data.lens=35
scene.render.filepath=str(folder/'farmland-blender.png');bpy.ops.render.render(write_still=True)
print('Rendered original Blender spacecraft and agricultural surface',flush=True)
