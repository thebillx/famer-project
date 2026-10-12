"""Original tileable surface maps, generated in Blender; no external artwork.

Maps encode shaped furrows, soil clods, leaf veins, foil creases and water waves.
They are material inputs in both the editable .blend and the browser export.
"""
from pathlib import Path
import bpy
import numpy as np


def build_surfaces(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    size = 256
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rng = np.random.default_rng(41073)
    grain = rng.random((size, size)).astype(np.float32)
    broad = sum(np.sin(2*np.pi*(x*a+y*b)+c) * w for a,b,c,w in [(2,1,.7,.13),(3,-2,1.2,.09),(7,5,2.6,.06),(15,-11,.4,.03)])
    # Periodic cell edges create soil clods, unlike unstructured color noise.
    distances=[]
    for px,py in rng.random((28,2)):
        dx=np.minimum(abs(x-px),1-abs(x-px));dy=np.minimum(abs(y-py),1-abs(y-py))
        distances.append(dx*dx+dy*dy)
    ordered=np.partition(np.stack(distances),1,axis=0)
    cracks=np.exp(-np.maximum(0,np.sqrt(ordered[1])-np.sqrt(ordered[0]))*220)
    soil=(.54+broad*.65+grain*.10-cracks*.16)
    blades=np.maximum(0,np.sin(2*np.pi*(x*13+y*3))-.72)*np.maximum(0,np.sin(2*np.pi*(y*9-x*2))-.28)
    crop=.48+broad*.20+grain*.09+blades*.24
    water=sum(np.sin(2*np.pi*(x*a+y*b)+c)*w for a,b,c,w in [(3,1,.2,.10),(7,-2,1,.045),(17,3,.8,.02),(31,-5,2,.008)])
    # Hierarchical slack, buckling and crease scales produce an irregular metal
    # blanket highlight without turning the whole face into large triangles.
    slack=np.sin(2*np.pi*(x*1.08+y*.31)+.45*np.sin(2*np.pi*y*.82))
    buckle=np.sin(2*np.pi*(x*.58-y*2.05)+.31*np.sin(2*np.pi*x*1.7))
    crinkle=np.sin(2*np.pi*(x*6.8+y*4.7)+.40*np.sin(2*np.pi*(x-y)*1.3))
    crease_a=np.exp(-np.abs(np.sin(2*np.pi*(x*.92+y*1.37)+.4))*34)
    crease_b=np.exp(-np.abs(np.sin(2*np.pi*(x*2.1-y*.63)+1.1))*48)
    foil=.075*slack+.035*buckle+.010*crinkle-.020*crease_a-.010*crease_b
    solar=.5+.018*np.sin(2*np.pi*x*52)+.010*np.sin(2*np.pi*(y*11+x*2))
    vein=np.exp(-abs(x-.5)*180)+.45*np.exp(-abs(np.sin((y-abs(x-.5)*.7)*np.pi*12))*30)
    leaf=.55+.12*broad+.09*vein+.02*grain
    brushed=.5+.025*np.sin(y*np.pi*300)+grain*.018
    roles={'soil':(soil,.86,1.7),'crop':(crop,.88,.72),'water':(water,.19,.52),'foil':(foil,.29,.86),'solar':(solar,.17,.24),'metal':(brushed,.28,.18),'leaf':(leaf,.87,.5)}
    result={}
    for role,(height,rough,strength) in roles.items():
        dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*strength
        dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*strength
        normal=np.stack((-dx*12,-dy*12,np.ones_like(dx)),axis=-1)
        normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
        normal=normal*.5+.5
        if role=='crop': color=np.stack((.80+blades*.08,.87+blades*.07,.70+blades*.05),axis=-1)*(.86+grain[...,None]*.08+broad[...,None]*.14)
        elif role=='soil': color=np.stack((soil*.40+.66,soil*.35+.61,soil*.28+.54),axis=-1)
        elif role=='leaf': color=np.stack((leaf*.32+.61,leaf*.30+.72,leaf*.24+.45),axis=-1)
        elif role=='solar': color=np.stack((.54+solar*.10,.68+solar*.16,.88+solar*.10),axis=-1)
        else: color=np.repeat((.92+height*.10)[...,None],3,axis=-1)
        roughness=np.repeat(np.clip(rough+(height-np.mean(height))*.18,.08,.98)[...,None],3,axis=-1)
        # Three.js multiplies roughnessMap.g by exported roughness.
        roughness=np.clip(roughness/rough,0,1)
        result[role]={}
        for suffix,pixels in [('color',color),('normal',normal),('roughness',roughness)]:
            image=bpy.data.images.new(f'{role}-{suffix}',width=size,height=size,alpha=False)
            image.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
            rgba=np.concatenate([np.clip(pixels,0,1),np.ones((size,size,1))],axis=-1).astype(np.float32)
            image.pixels.foreach_set(rgba.ravel())
            image.filepath_raw=str(output/f'{role}-{suffix}.png');image.file_format='PNG';image.save()
            image.pack();result[role][suffix]=image
    return result


def apply_surface(material,role,maps,normal_strength=.5):
    nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
    color=nodes.new('ShaderNodeTexImage');color.image=maps[role]['color']
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    multiply.inputs[1].default_value=material.diffuse_color
    links.new(color.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
    normal=nodes.new('ShaderNodeTexImage');normal.image=maps[role]['normal']
    normal_map=nodes.new('ShaderNodeNormalMap');normal_map.inputs['Strength'].default_value=normal_strength
    links.new(normal.outputs['Color'],normal_map.inputs['Color']);links.new(normal_map.outputs['Normal'],bsdf.inputs['Normal'])
    rough=nodes.new('ShaderNodeTexImage');rough.image=maps[role]['roughness']
    scale=nodes.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=material['roughness']
    links.new(rough.outputs['Color'],scale.inputs[0]);links.new(scale.outputs[0],bsdf.inputs['Roughness'])
    material['surface']=role;material['normalStrength']=normal_strength
