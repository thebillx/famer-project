"""Original regional color bake sharing the authored farmland's parcel layout.

An intermediate spatial scale for the existing Earth/terrain material handoff,
not observed imagery. Outside the modeled 64-unit core, smaller holdings extend
its agricultural fabric. No external pixels or new runtime geometry.
"""
import math
import bpy
import numpy as np


def build_regional_map(output, parcels, channels, tracks):
    size=2048
    extent=64.0
    axis=(np.arange(size,dtype=np.float32)+.5)/size*2*extent-extent
    pixels=np.empty((size,size,3),dtype=np.float32)
    pixels[:]=(.11,.16,.06)

    def paint(corners,color,planting=True):
        xmin,xmax=min(p[0] for p in corners),max(p[0] for p in corners)
        zmin,zmax=min(p[1] for p in corners),max(p[1] for p in corners)
        x0=max(0,int((xmin+extent)/(2*extent)*size));x1=min(size,math.ceil((xmax+extent)/(2*extent)*size))
        z0=max(0,int((zmin+extent)/(2*extent)*size));z1=min(size,math.ceil((zmax+extent)/(2*extent)*size))
        if x1<=x0 or z1<=z0:return
        x,z=np.meshgrid(axis[x0:x1],axis[z0:z1])
        mask=np.ones(x.shape,dtype=bool)
        for a,b in zip(corners,corners[1:]+corners[:1]):
            mask&=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-6
        u=(x-xmin)/max(.001,xmax-xmin);v=(z-zmin)/max(.001,zmax-zmin)
        tone=np.ones(x.shape,dtype=np.float32)
        if planting:
            # Parallel planting passes and narrow headlands, not random noise.
            tone=.85+.06*np.cos(v*math.tau*29+.14*np.sin(u*math.tau))
            tone*=1-.10*np.exp(-((u-.3)/.19)**6-((v-.34)/.14)**4)
            edge=np.minimum.reduce([u,1-u,v,1-v])
            tone*=.80+.20*np.clip(edge/.012,0,1)
        patch=pixels[z0:z1,x0:x1]
        patch[mask]=(tone[...,None]*np.asarray(color))[mask]

    palette=[(.09,.152,.056),(.17,.235,.078),(.235,.270,.103),(.205,.145,.084),(.10,.135,.052)]
    # Far continuation only. The core below overwrites it with the actual
    # exported holding footprints, retaining all shared edges and the sample.
    for row in range(40):
        z0=-64+row*3.2;z1=z0+3.2
        cuts=[-64]
        for col in range(1,33):
            cuts.append(-64+col*4+.55*math.sin(row*.7+col*1.9) if col<32 else 64)
        for col,(x0,x1) in enumerate(zip(cuts,cuts[1:])):
            paint([(x0,z0),(x1,z0),(x1,z1),(x0,z1)],palette[3 if (row*7+col*3)%19==0 else (row//3+col//4)%3])
    for corners,color in parcels:paint(corners,color)

    def route(path,width,color):
        for a,b in zip(path,path[1:]):
            dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
            nx,nz=-dz/length*width,dx/length*width
            paint([(a[0]+nx,a[1]+nz),(a[0]-nx,a[1]-nz),
                   (b[0]-nx,b[1]-nz),(b[0]+nx,b[1]+nz)],color,False)
    for path,width,color in tracks:route(path,width,color)
    # Shared primary/secondary centerlines retain position and water width.
    # Paint wet shoulders first, water last, including connected junctions.
    for path,half_width in channels:
        route(path,half_width+.23,(.17,.12,.078))
        route(path,half_width,(.028,.074,.072))
    image=bpy.data.images.new('Regional agricultural layout · original illustrative artwork',width=size,height=size,alpha=False)
    image.colorspace_settings.name='sRGB'
    rgba=np.concatenate((pixels,np.ones((size,size,1))),axis=-1).astype(np.float32)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw=str(output);image.file_format='PNG';image.save();image.pack()
    return {'file':output.name,'size':[size,size],'extent':[-extent,extent],
            'coreParcelCount':len(parcels),'source':'original authored farmland layout; illustrative, not observed data'}
