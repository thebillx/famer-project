"""Export editable original collections as standard glTF 2.0 GLB deliverables.

These interchange files are optional. The web runtime uses batched mesh JSON.
"""
import os
from pathlib import Path
import bpy
folder=Path(os.environ.get('AGRISCOPE_BLENDER_OUTPUT', str(Path(__file__).resolve().parent/'output')))
bpy.ops.wm.open_mainfile(filepath=str(folder/'AgriScope-Cinematic-Assets.blend'))
bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
for collection_name,filename in [('01 · Spacecraft / editable parts','spacecraft.glb'),('02 · Agricultural surface / editable parts','farmland.glb')]:
 bpy.ops.object.select_all(action='DESELECT')
 collection=bpy.data.collections[collection_name];collection.hide_viewport=False
 for obj in collection.objects:obj.hide_set(False);obj.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(folder/filename),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_materials='EXPORT')
 print(f'Exported standard GLB: {filename}',flush=True)
