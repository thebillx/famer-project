"""Original AgriScope orbital survey craft, authored in runtime coordinates.

The broad silhouette, panel overlaps and asymmetric radiator are deliberate
composition choices. No downloaded spacecraft geometry or reference pixels.
"""
import math
import bpy


def author_survey_craft(material, box, tube, lathe, mesh_obj, ship):
    ceramic = material('Survey / ceramic armour', (.060, .079, .097), .62, .27, .22)
    ceramic_side = material('Survey / satin ceramic', (.080, .096, .112), .48, .38)
    titanium = material('Survey / brushed titanium', (.38, .43, .47), .88, .26)
    edge = material('Survey / machined edges', (.62, .68, .70), .94, .19)
    solar = material('Survey / blue-black energy cells', (.055, .105, .185), .62, .24, .55)
    optic = material('Survey / multispectral glass', (.007, .045, .072), .46, .13, .82)
    gold = material('Survey / status gold', (.55, .29, .07), .75, .26)
    cool = material('Survey / optical activation', (.20, .58, .75), .35, .25)
    for mat, color, strength in [(gold,(1,.48,.08),1.2),(cool,(.25,.68,1),1.8)]:
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Emission Color'].default_value=(*color,1)
        bsdf.inputs['Emission Strength'].default_value=strength
        mat['emissive']=color;mat['emissiveStrength']=strength
    titanium['surface']='metal';edge['surface']='metal';solar['surface']='solar'

    def part(obj, name, pivot):
        obj['mechanism']=name;obj['pivot']=pivot
        return obj

    # A tapered octagonal keel. Layers remain separated by real shadow gaps.
    lathe('Survey / octagonal pressure bus',[(.61,-1.70),(.83,-1.3),(.83,.65),(.65,1.0)],ceramic,segments=8)
    box('Survey / upper ceramic deck',(0,.66,-.34),(1.48,.19,2.48),ceramic,bevel=.075)
    box('Survey / lower heat shield',(0,-.64,-.48),(1.30,.15,2.2),ceramic_side,bevel=.055)
    for side in (-1,1):
        for index in range(4):
            z=-1.35+index*.53
            box('Survey / overlapping side armour',(side*.73,0,z),(.15,1.04,.48),ceramic_side,bevel=.035)
            box('Survey / titanium edge rail',(side*.80,.47,z),(.038,.045,.43),edge,bevel=.008)
        tube('Survey / load-bearing longitudinal spar',(side*.58,-.48,-1.55),(side*.58,-.48,.84),.045,titanium,sides=12)
    for z in (-1.13,-.61,-.09,.43):
        box('Survey / top service cover',(0,.777,z),(1.08,.025,.43),ceramic_side,bevel=.016)
        for x in (-.48,.48):
            tube('Survey / captive deck fastener',(x,.79,z),(x,.805,z),.025,edge,sides=8)
    # Intentional asymmetry: one raised radiator comb and one navigation pod.
    box('Survey / radiator spine',(-.54,.96,-.73),(.35,.29,1.53),titanium,bevel=.035)
    for i in range(13):
        box('Survey / radiator fin',(-.54,1.15,-1.39+i*.11),(.52,.31,.025),ceramic,bevel=.006)
    box('Survey / star-tracker pod',(.54,.91,-.85),(.43,.43,.60),ceramic,bevel=.045)
    lathe('Survey / tracker bezel',[(.14,0),(.14,.07),(.10,.085)],edge,(.54,.91,-.53),segments=24)
    lathe('Survey / tracker optic',[(.10,0),(0,.008)],optic,(.54,.91,-.45),segments=24)
    tube('Survey / antenna mast',(-.53,.94,-1.2),(-.70,1.82,-1.36),.017,edge,sides=8)
    tube('Survey / cross antenna',(-1.03,1.72,-1.34),(-.38,1.72,-1.34),.012,titanium,sides=8)

    # Layered wings have shared material batches per articulated side. Separate
    # cells are large enough to read in the under-wing camera; no subpixel bolts.
    for side,count in [(-1,3),(1,4)]:
        pivot=(side*.78,0,-.5);name='wing-left' if side<0 else 'wing-right'
        part(tube('Survey / wing root hinge',(side*.78,-.34,-.5),(side*.78,.34,-.5),.10,edge),name,pivot)
        for i in range(count):
            x=side*(1.42+i*.91);z=-.18-i*.32;y=.13+i*.11
            width=.86;height=1.62-i*.18
            # Swept outer corners give the wing a feather-like layered silhouette.
            def panel(label, w, h, depth, mat):
                outline=[(-w*.5,-h*.5),(w*.34,-h*.5),(w*.5,-h*.28),(w*.5,h*.48),(-w*.32,h*.5),(-w*.5,h*.29)]
                vertices=[(x+side*px,y+py,z+dz) for dz in (-depth/2,depth/2) for px,py in outline]
                faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(j,(j+1)%6,(j+1)%6+6,j+6) for j in range(6)]
                if side<0:faces=[tuple(reversed(face)) for face in faces]
                obj=mesh_obj(label,vertices,faces,mat,ship)
                bevel=obj.modifiers.new('Panel edge bevel','BEVEL');bevel.width=.012;bevel.segments=2
                return part(obj,name,pivot)
            panel('Survey / swept titanium wing frame',width,height,.075,titanium)
            panel('Survey / swept ceramic wing back',width-.07,height-.07,.082,ceramic)
            for row in range(6):
                for col in range(3):
                    if (row==0 and col==2) or (row==5 and col==0):continue
                    xx=x+(col-1)*.25;yy=y-height*.40+row*height*.16
                    part(box('Survey / energy-cell tile',(xx,yy,z+.048),(.233,height*.145,.012),solar,bevel=.006),name,pivot)
            part(tube('Survey / wing diagonal brace',(x-side*.38,y-height*.42,z-.09),(x+side*.38,y+height*.42,z-.09),.023,edge,sides=8),name,pivot)
            part(box('Survey / wing status strip',(x,y-height*.48,z+.05),(.65,.016,.018),gold,bevel=.004),name,pivot)
            if i:
                part(tube('Survey / inter-panel linkage',(x-side*.55,y-.26,z+.05),(x-side*.36,y-.26,z+.05),.045,titanium),name,pivot)

    # A shallow large iris, not a black telescope tube. Nested machined rings
    # leave a visible optical well; eight blades open by a deterministic angle.
    lathe('Survey / payload shoulder',[(.61,.78),(.72,.91),(.72,1.05),(.64,1.13)],titanium,segments=64)
    lathe('Survey / payload light trap',[(.62,1.05),(.61,1.40),(.53,1.40),(.49,1.15)],ceramic,segments=64)
    for j in range(2):
        z=1.18+j*.19;r=.66+j*.035
        obj=lathe('Survey / alignment ring',[(r-.045,z),(r,z),(r,z+.052),(r-.045,z+.052)],edge,segments=72)
        part(obj,'ring-'+str(j),(0,0,z))
        for i in range(6):
            angle=i*math.tau/6+j*.25
            obj=box('Survey / alignment actuator',(math.cos(angle)*(r+.035),math.sin(angle)*(r+.035),z+.03),(.11,.11,.11),ceramic,bevel=.018)
            part(obj,'ring-'+str(j),(0,0,z))
    for i in range(8):
        a=i*math.tau/8;ca,sa=math.cos(a),math.sin(a)
        pivot=(ca*.49,sa*.49,1.415)
        points=[]
        for x,y in [(0,-.11),(-.36,-.08),(-.37,.035),(-.05,.16)]:
            points.append((pivot[0]+x*ca-y*sa,pivot[1]+x*sa+y*ca,pivot[2]))
        obj=mesh_obj('Survey / iris blade',points,[(0,1,2,3)],ceramic_side,ship)
        obj.data.materials[0]['doubleSided']=True
        part(obj,'iris-'+str(i),pivot)
    lathe('Survey / optical retaining rim',[(.46,1.17),(.47,1.20),(.43,1.21)],gold,segments=64)
    lathe('Survey / multispectral objective',[(0,1.186),(.18,1.184),(.35,1.176),(.43,1.17)][::-1],optic,segments=64)
    for i in range(12):
        a=i*math.tau/12
        box('Survey / optical status key',(math.cos(a)*.57,math.sin(a)*.57,1.44),(.028,.028,.018),cool,bevel=.006)
    for side in (-1,1):
        box('Survey / gold identification bar',(side*.71,-.28,.69),(.024,.42,.034),gold,bevel=.007)
        for y in (-.40,.40):
            lathe('Survey / attitude nozzle',[(.10,-1.71),(.12,-1.87),(.09,-1.89)],titanium,(side*.44,y,0),segments=20)
    return {'metal':[titanium,edge], 'solar':[solar]}
