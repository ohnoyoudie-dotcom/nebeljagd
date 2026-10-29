"""Nebeljagd neutral Adventurer, original deterministic Blender authoring.
Run blender -b --python scripts/build-avatar.py [--render].
Metres, Blender Z-up/-Y forward; glTF Y-up/+Z forward. No external assets.
"""
import bpy, bmesh, math, random, json, hashlib, struct, sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'assets/characters'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(4219); bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
MATS=[]
for name,rough,metal in [('Warm skin',.86,0),('Sculpted walnut hair',.84,0),('Woven indigo and linen',.94,0),('Worn chestnut leather',.68,0),('Brushed aged iron',.43,.75)]:
 m=bpy.data.materials.new(name);m.use_nodes=True; bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='Color';m.node_tree.links.new(a.outputs['Color'],bs.inputs['Base Color']);MATS.append(m)
PAL={'skin':(.49,.286,.172,1),'lip':(.32,.135,.105,1),'lid':(.31,.16,.105,1),'hair':(.065,.035,.021,1),'strand':(.10,.053,.027,1),'cloth':(.025,.046,.077,1),'clothlight':(.042,.078,.12,1),'hem':(.035,.065,.095,1),'linen':(.29,.25,.18,1),'pants':(.093,.105,.12,1),'leather':(.16,.083,.039,1),'edge':(.24,.13,.066,1),'sole':(.044,.035,.03,1),'metal':(.28,.285,.275,1),'rust':(.24,.075,.042,1),'eye':(.32,.29,.23,1),'iris':(.065,.07,.04,1),'pupil':(.014,.012,.009,1)}
class Builder:
 def __init__(self,name):self.name=name;self.v=[];self.f=[];self.c=[];self.w=[];self.mi=[]
 def add(self,v,f,color,weights,mat=2):
  off=len(self.v);self.v+=list(v);self.f += [tuple(off+i for i in q) for q in f];self.mi += [mat]*len(f)
  base=PAL.get(color,color) if isinstance(color,str) else color
  self.c += [base]*len(v) if isinstance(base,tuple) else base
  self.w += [{weights:1} for _ in v] if isinstance(weights,str) else weights
 def obj(self):
  me=bpy.data.meshes.new(self.name+' topology');me.from_pydata(self.v,[],self.f);me.update();o=bpy.data.objects.new(self.name,me);bpy.context.collection.objects.link(o)
  for m in MATS:me.materials.append(m)
  for p,mi in zip(me.polygons,self.mi):p.material_index=mi;p.use_smooth=True
  ca=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for i,c in enumerate(self.c):ca.data[i].color=c
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();return o
B={name:Builder(name) for name in ['Skin_Head_Neck','Skin_Hands','Hair_Clumps','Tailored_Jacket','Linen_Shirt','Fitted_Trousers','Leather_Boots','Belt_and_Pouch']}
def clamp(v,a=0,b=1):return min(b,max(a,v))
def smooth(v):v=clamp(v);return v*v*(3-2*v)
def mixw(a,b,t):return {a:1-clamp(t),b:clamp(t)}
def torso(z):
 if z<1.02:return {'Pelvis':1}
 if z<1.23:return mixw('Spine','Chest',(z-1.11)/.17) if z>1.11 else mixw('Pelvis','Spine',(z-1.02)/.09)
 return {'Chest':1}
def loft(b,levels,color,weight,mat=2,sides=32,fold=0,centerx=0):
 v=[];w=[];c=[];f=[];base=PAL[color]
 for j,(z,rx,ry,cy) in enumerate(levels):
  for i in range(sides):
   a=math.tau*i/sides; radial=1+fold*(math.sin(a*7+z*18)+.45*math.sin(a*11-z*12));x=centerx+rx*math.sin(a)*radial;y=cy-ry*math.cos(a)*radial
   v.append((x,y,z));w.append(weight(z,x,y) if callable(weight) else {weight:1}); shade=.97+.045*math.cos(a*3+z*10)+.02*(z-1)
   c.append(tuple(k*shade for k in base[:3])+(1,))
 for j in range(len(levels)-1):
  for i in range(sides):a=j*sides+i;d=j*sides+(i+1)%sides;f.append((a,d,d+sides,a+sides))
 f += [tuple(reversed(range(sides))),tuple((len(levels)-1)*sides+i for i in range(sides))]
 b.add(v,f,c,w,mat)
def tube(b,points,radii,color,weight,mat=2,sides=16,flatten=1,fold=0):
 v=[];w=[];c=[];f=[];base=PAL[color]
 for j,p in enumerate(points):
  p=Vector(p);t=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)]);t.normalize();u=t.cross(Vector((0,1,0)))
  if u.length<.01:u=t.cross(Vector((1,0,0)))
  u.normalize();q=t.cross(u).normalized()
  r=radii[j]
  for i in range(sides):
   a=i*math.tau/sides; rr=1+fold*math.cos(a*5+j*1.1);pos=p+u*math.cos(a)*r*rr+q*math.sin(a)*r*flatten*rr
   v.append(tuple(pos));w.append(weight(j/(len(points)-1),pos) if callable(weight) else {weight:1});shade=.92+.08*math.cos(a)+.04*math.sin(j*1.4)
   c.append(tuple(k*shade for k in base[:3])+(1,))
 for j in range(len(points)-1):
  for i in range(sides):a=j*sides+i;d=j*sides+(i+1)%sides;f.append((a,d,d+sides,a+sides))
 f += [tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))]
 b.add(v,f,c,w,mat)
def ell(b,center,radii,color,bone,mat=0,sides=24,rings=12):
 v=[];f=[]
 for j in range(rings+1):
  p=math.pi*j/rings
  for i in range(sides):
   a=math.tau*i/sides;v.append((center[0]+radii[0]*math.sin(p)*math.cos(a),center[1]+radii[1]*math.sin(p)*math.sin(a),center[2]+radii[2]*math.cos(p)))
 for j in range(rings):
  for i in range(sides):a=j*sides+i;d=j*sides+(i+1)%sides;f.append((a,d,d+sides,a+sides))
 b.add(v,f,color,bone,mat)
def ribbon(b,points,width,color,bone,mat=2):
 # Thick softened ribbon section, rather than a flat decal.
 tube(b,points,[width]*len(points),color,bone,mat,8,.22)
def sample(points,n=12):
 ps=[Vector(points[0])]+[Vector(p) for p in points]+[Vector(points[-1])];out=[]
 for k in range(n):
  q=k/(n-1)*(len(points)-1);i=min(len(points)-2,int(q));t=q-i;p0,p1,p2,p3=ps[i:i+4]
  out.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
 return out
# Head: one shaped facial surface including cheeks, brow shelves, eye sockets,
# nasal bridge, philtrum, chin and neck; dense loops across facial features.
levels=[(1.465,.047,.045,0),(1.51,.045,.044,0),(1.55,.047,.047,0),(1.576,.060,.052,-.005),(1.59,.071,.060,-.009),(1.61,.084,.068,-.005),(1.635,.091,.078,0),(1.657,.099,.085,.003),(1.68,.103,.087,.004),(1.696,.101,.089,.004),(1.711,.100,.090,.005),(1.728,.101,.09,.006),(1.75,.102,.09,.007),(1.773,.097,.084,.009),(1.795,.082,.072,.01),(1.812,.057,.05,.012),(1.825,.012,.012,.012)]
# Subdivide vertical profile for smooth shading and deliberately local sculpting.
lev=[]
for a,c in zip(levels,levels[1:]):
 for t in (0,.5):lev.append(tuple(x*(1-t)+y*t for x,y in zip(a,c)))
lev.append(levels[-1]);v=[];f=[];w=[];colors=[];sides=64
for z,rx,ry,cy in lev:
 for i in range(sides):
  a=i*math.tau/sides;x=rx*math.sin(a);y=cy-ry*math.cos(a);front=max(0,math.cos(a))**5
  ga=lambda xc,zc,sx,sz:math.exp(-((x-xc)/sx)**2-((z-zc)/sz)**2)
  # Bridge and tip blend directly into the face, not a pasted primitive nose.
  sculpt=.028*ga(0,1.679,.018,.043)+.019*ga(0,1.66,.022,.013)+.005*ga(0,1.635,.033,.013)+.006*ga(0,1.599,.04,.013)
  for s in (-1,1):sculpt+=.008*ga(s*.06,1.665,.027,.021)+.009*ga(s*.043,1.718,.033,.010)-.007*ga(s*.043,1.697,.025,.011)
  y-=sculpt*front;v.append((x,y,z));w.append(mixw('Neck','Head',smooth((z-1.51)/.055)));blush=sum(ga(s*.067,1.663,.027,.025) for s in (-1,1))*front
  base=PAL['skin'];stubble=.12*math.exp(-((z-1.615)/.025)**2)*front;colors.append((base[0]*(1+.07*blush-stubble),base[1]*(1-.07*blush-stubble),base[2]*(1-.05*blush-stubble),1))
for j in range(len(lev)-1):
 for i in range(sides):a=j*sides+i;d=j*sides+(i+1)%sides;f.append((a,d,d+sides,a+sides))
f.extend([tuple(reversed(range(sides))),tuple((len(lev)-1)*sides+i for i in range(sides))]);B['Skin_Head_Neck'].add(v,f,colors,w,0)
# Almond eyes, lids, eyebrows, lips and shaped ear helix/concha.
for s in (-1,1):
 x=s*.043;z=1.697
 ell(B['Skin_Head_Neck'],(x,-.085,z),(.020,.008,.007),'eye','Head',0,20,8)
 ell(B['Skin_Head_Neck'],(x,-.092,z),(.007,.002,.0064),'iris','Head',0,16,8)
 ell(B['Skin_Head_Neck'],(x,-.0935,z),(.003,.001,.0045),'pupil','Head',0,12,6)
 for top in (True,False):
  pts=[(x-.022+i*.044/10,-.0895-.003*math.sin(math.pi*i/10),z+(.008 if top else -.006)*math.sin(math.pi*i/10)) for i in range(11)]
  tube(B['Skin_Head_Neck'],pts,[.0025]*11,'skin' if not top else 'lid','Head',0,6)
 pts=[(x-.023+i*.046/8,-.089,1.72+.006*math.sin(math.pi*i/8)-s*.003*(i/8-.5)) for i in range(9)]
 tube(B['Hair_Clumps'],pts,[.001+.003*math.sin(math.pi*i/8) for i in range(9)],'hair','Head',1,8,.55)
 # Ear bowl plus substantial outer helix ridge with organic asymmetric outline.
 ev=[];ef=[]
 for j in range(6):
  r=j/5
  for i in range(20):
   a=i*math.tau/20;ev.append((s*(.101+.024*r*(.9+.1*math.sin(a))),-.003-.008*(1-r*r)+.009*r*math.cos(a),1.681+.035*r*math.sin(a)))
 for j in range(5):
  for i in range(20):a=j*20+i;d=j*20+(i+1)%20;ef.append((a,d,d+20,a+20))
 B['Skin_Head_Neck'].add(ev,ef,'skin','Head',0)
 pts=[(s*(.101+.025*(.9+.1*math.sin(a))),-.003+.009*math.cos(a),1.681+.035*math.sin(a)) for a in [math.tau*i/24 for i in range(25)]]
 tube(B['Skin_Head_Neck'],pts,[.004]*25,'skin','Head',0,6)
 # Tiny shadow at nostril, rendered as inset anatomical detail.
 ell(B['Skin_Head_Neck'],(s*.012,-.113,1.655),(.004,.0015,.002),'lid','Head',0,12,6)
for dz,col,rad in [(0,'lip',.0035),(-.004,'skin',.004)]:
 pts=[(-.026+i*.052/12,-.084-.006*math.sin(math.pi*i/12),1.625+dz+.002*math.cos(i*math.tau/12)) for i in range(13)]
 tube(B['Skin_Head_Neck'],pts,[rad*math.sin(math.pi*i/12)+.0004 for i in range(13)],col,'Head',0,6,.7)
# Tailored torso uses continuous anatomical profiles; sleeves overlap only under
# the sculpted shoulder seam, as actual sewn garment panels do.
lev=[(.90,.18,.106,.004),(.94,.181,.108,0),(.98,.173,.105,0),(1.02,.164,.105,0),(1.065,.166,.108,0),(1.11,.173,.115,0),(1.16,.187,.127,0),(1.21,.199,.132,0),(1.27,.211,.135,0),(1.32,.222,.132,0),(1.36,.23,.123,0),(1.40,.235,.112,0),(1.435,.218,.095,0),(1.46,.167,.075,0),(1.48,.089,.058,0)]
loft(B['Tailored_Jacket'],lev,'cloth',lambda z,x,y:torso(z),2,40,.018)
# Collar, linen opening and split leather-trimmed jacket hem.
loft(B['Linen_Shirt'],[(1.43,.078,.063,-.012),(1.48,.067,.053,-.008),(1.50,.054,.048,0)],'linen','Neck',2,24,.015)
for s in (-1,1):
 pts=sample([(s*.065,-.068,1.49),(s*.085,-.09,1.455),(s*.047,-.131,1.40),(s*.027,-.139,1.32)],12)
 ribbon(B['Linen_Shirt'],pts,.024,'hem','Chest')
 ribbon(B['Linen_Shirt'],sample([(s*.026,-.139,1.32),(s*.025,-.139,1.2),(s*.022,-.116,1.07)],12),.009,'clothlight','Spine')
# Broad front seam and three understated metal buttons.
for z in (1.29,1.205,1.12):ell(B['Belt_and_Pouch'],(.012,-(.142 if z>1.15 else .12),z),(.006,.003,.006),'metal','Spine',4,10,6)
for s,suf in ((1,'L'),(-1,'R')):
 up=f'UpperArm.{suf}';low=f'Forearm.{suf}';hand=f'Hand.{suf}'
 pts=sample([(s*.177,0,1.403),(s*.247,0,1.37),(s*.30,0,1.28),(s*.341,-.002,1.16),(s*.355,-.006,1.07),(s*.368,-.01,.972)],20)
 radii=[]
 for i,p in enumerate(pts):
  t=i/19;r=(.071*(1-t)+.040*t)*(1+.06*math.sin(math.pi*t));r+=.0035*math.sin(t*math.pi*10)*(math.sin(math.pi*t)**2);radii.append(r)
 def sw(t,p):
  if t<.16:return mixw('Chest',up,smooth(t/.16))
  return mixw(up,low,smooth((t-.48)/.24))
 tube(B['Tailored_Jacket'],pts,radii,'cloth',sw,2,24,.89,.04)
 # folded linen cuff with seam rim and natural thickness
 tube(B['Linen_Shirt'],[(s*.367,-.01,.99),(s*.371,-.011,.965),(s*.373,-.011,.953)],[.045,.047,.042],'linen',low,2,24,.9,.02)
 # Bare wrist, softly shaped palm and five recognizable fingers.
 loft(B['Skin_Hands'],[(.864,.034,.024,-.017),(.88,.039,.028,-.015),(.91,.039,.027,-.012),(.94,.029,.024,-.011),(.961,.032,.025,-.010)],'skin',hand,0,20,0,s*.376)
 for j in range(4):
  xx=s*.376+(-.025+j*.016);length=[.054,.071,.068,.054][j]
  pts=sample([(xx,-.014,.882),(xx,-.019,.866),(xx,-.025,.882-length*.65),(xx,-.036,.882-length)],7)
  tube(B['Skin_Hands'],pts,[.010,.010,.0095,.009,.0085,.007,.0035],'skin',hand,0,10,.85)
 # Thumb branches naturally from palm rather than a mitten/block.
 pts=sample([(s*.349,-.01,.922),(s*.334,-.019,.906),(s*.327,-.035,.885),(s*.334,-.043,.871)],9)
 tube(B['Skin_Hands'],pts,[.015,.015,.014,.013,.012,.010,.009,.007,.003],'skin',hand,0,12,.85)
# Hip region plus continuous shaped legs, blended weights through hips and knees.
loft(B['Fitted_Trousers'],[(.86,.132,.072,0),(.90,.169,.105,0),(.96,.164,.104,0),(1.02,.162,.103,0)],'pants','Pelvis',2,32,.015)
for s,suf in ((1,'L'),(-1,'R')):
 thigh=f'Thigh.{suf}';shin=f'Shin.{suf}';foot=f'Foot.{suf}'
 def lw(z,x,y):
  if z>.81:return mixw(thigh,'Pelvis',smooth((z-.81)/.16))
  return mixw(shin,thigh,smooth((z-.46)/.13))
 lev=[(.29,.057,.063,0),(.36,.063,.069,.007),(.41,.067,.075,.009),(.46,.068,.072,.004),(.495,.066,.068,-.005),(.52,.071,.077,-.007),(.545,.077,.075,-.008),(.58,.081,.079,-.003),(.63,.087,.084,0),(.69,.094,.088,0),(.76,.1,.093,0),(.83,.101,.096,0),(.90,.098,.095,0),(.948,.091,.088,0)]
 lev=[(z,rx*(.72 if z<.43 else 1),ry*(.72 if z<.43 else 1),cy) for z,rx,ry,cy in lev]
 loft(B['Fitted_Trousers'],lev,'pants',lw,2,28,.025,s*.116)
 # Knee and hip folds have broad ridges and changing anatomical cross-sections.
 # Boots loft from broad planted toe to fitted ankle/calf; no box feet.
 def bw(z,x,y):return mixw(foot,shin,smooth((z-.135)/.12))
 lev=[(.025,.076,.144,-.055),(.052,.078,.147,-.056),(.077,.074,.141,-.054),(.11,.072,.132,-.049),(.145,.068,.111,-.035),(.18,.056,.075,-.008),(.215,.053,.061,.007),(.25,.056,.063,.011),(.28,.062,.068,.01),(.31,.064,.071,.011),(.35,.066,.074,.008),(.39,.066,.072,.005),(.415,.069,.075,.003),(.43,.071,.077,.002)]
 loft(B['Leather_Boots'],lev,'leather',bw,3,28,.02,s*.116)
 loft(B['Leather_Boots'],[(.022,.079,.146,-.055),(.04,.079,.149,-.056),(.056,.078,.148,-.056)],'sole',foot,3,28,0,s*.116)
 loft(B['Leather_Boots'],[(.402,.07,.076,.004),(.415,.073,.079,.003),(.432,.071,.077,.002)],'edge',shin,3,28,.01,s*.116)
 # broad stitched vamp and two worn fold accents along the instep
 pts=[(s*.116-.065+i*.13/12,-.14-.032*math.sin(math.pi*i/12),.119+.015*math.sin(math.pi*i/12)) for i in range(13)]
 tube(B['Leather_Boots'],pts,[.003]*13,'edge',foot,3,6)
 # Clean boot shaft; seam is modeled along the vamp, no intersecting straps.
# A plain belt and just one small pouch; no class insignia, armor or fixed weapon.
loft(B['Belt_and_Pouch'],[(.997,.174,.116,0),(1.018,.174,.117,0),(1.042,.172,.116,0)],'leather','Pelvis',3,40,.005)
# rounded buckle frame made as a continuous thin rim
pts=[(-.027,-.122,1.002),(.027,-.122,1.002),(.03,-.122,1.007),(.03,-.122,1.035),(.025,-.122,1.04),(-.025,-.122,1.04),(-.03,-.122,1.035),(-.03,-.122,1.007),(-.027,-.122,1.002)]
tube(B['Belt_and_Pouch'],pts,[.004]*len(pts),'metal','Pelvis',4,6)
loft(B['Belt_and_Pouch'],[(.86,.043,.027,-.078),(.88,.055,.037,-.078),(.94,.058,.036,-.078),(1.0,.051,.032,-.078),(1.023,.042,.025,-.078)],'leather','Pelvis',3,20,.025,.178)
ribbon(B['Belt_and_Pouch'],sample([(.13,-.11,1.01),(.178,-.123,.982),(.223,-.108,1.01)],10),.008,'edge','Pelvis',3)
ell(B['Belt_and_Pouch'],(.178,-.12,.976),(.007,.003,.007),'metal','Pelvis',4,10,6)
# Hair cap is scalloped at the temples and nape. Broad swept clumps carry the
# visible silhouette, grooves and highlighted ridges instead of a spherical cap.
v=[];f=[];co=[];rings=13;segs=40
head_profile=[(1.62,.092,.081),(1.67,.105,.091),(1.72,.104,.094),(1.76,.104,.092),(1.795,.087,.079),(1.82,.06,.054),(1.84,.032,.029),(1.855,.001,.001)]
def scalp(z):
 for a,b in zip(head_profile,head_profile[1:]):
  if a[0]<=z<=b[0]:
   t=(z-a[0])/(b[0]-a[0]);return (a[1]*(1-t)+b[1]*t,a[2]*(1-t)+b[2]*t)
 return head_profile[0][1:] if z<1.62 else (.001,.001)
for j in range(rings):
 t=j/(rings-1)
 for i in range(segs):
  a=math.tau*i/segs;front=max(0,math.cos(a));zbase=1.643+.096*front+.007*math.sin(a*3+.4);z=zbase+(1.855-zbase)*t;rx,ry=scalp(z);rx+=.007*(1-t);ry+=.010*(1-t)
  v.append((rx*math.sin(a),.007-ry*math.cos(a),z));base=PAL['hair'];shade=.8+.12*t+.06*math.sin(a*6);co.append(tuple(k*shade for k in base[:3])+(1,))
for j in range(rings-1):
 for i in range(segs):a=j*segs+i;d=j*segs+(i+1)%segs;f.append((a,d,d+segs,a+segs))
B['Hair_Clumps'].add(v,f,co,'Head',1)
def hairlock(points,idx):
 pts=[Vector(p) for p in sample(points,11)];v=[];f=[];co=[];base=PAL['strand' if idx%3==0 else 'hair']
 for j,p in enumerate(pts):
  tangent=(pts[min(10,j+1)]-pts[max(0,j-1)]).normalized();out=p-Vector((0,.015,1.704));out=(out-tangent*out.dot(tangent)).normalized();side=tangent.cross(out).normalized()
  width=[.007,.022,.03,.032,.033,.031,.027,.023,.018,.010,.001][j]
  for i in range(10):
   a=math.tau*i/10;pos=p+side*(math.cos(a)*width)+out*(math.sin(a)*width*.18);v.append(tuple(pos));sh=.80+.20*max(0,math.sin(a));co.append(tuple(k*sh for k in base[:3])+(1,))
 for j in range(10):
  for i in range(10):a=j*10+i;d=j*10+(i+1)%10;f.append((a,d,d+10,a+10))
 B['Hair_Clumps'].add(v,f,co,'Head',1)
paths=[]
for i in range(7):
 x=-.085+i*.026
 paths.append([(x*.45,.015,1.844),(x*.7-.018,-.026,1.862-abs(x)*.10),(x-.022,-.075,1.827),(x-.030,-.095,1.765+(i%3)*.012)])
for s in (-1,1):
 for j in range(3):paths.append([(s*.03,.02+j*.022,1.838-j*.014),(s*.09,.032+j*.018,1.798-j*.025),(s*.116,.02+j*.027,1.73-j*.026),(s*.106,.014+j*.03,1.665-j*.008)])
for idx,path in enumerate(paths):hairlock(path,idx)
# Rig. Local X axes on limbs aligned consistently, positive knee X bends back.
rigdata=bpy.data.armatures.new('Neutral humanoid 22 joint rig');rig=bpy.data.objects.new('Adventurer_Rig',rigdata);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None,down=False):
 b=rigdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=rigdata.edit_bones[parent]
 b.align_roll(Vector((0,1 if down else -1,0)));return b
bone('Root',(0,0,.94),(0,0,1.04));bone('Pelvis',(0,0,.94),(0,0,1.07),'Root');bone('Spine',(0,0,1.07),(0,0,1.27),'Pelvis');bone('Chest',(0,0,1.27),(0,0,1.47),'Spine');bone('Neck',(0,0,1.47),(0,0,1.56),'Chest');bone('Head',(0,0,1.56),(0,0,1.825),'Neck')
for s,suf in ((1,'L'),(-1,'R')):
 bone(f'Clavicle.{suf}',(0,0,1.43),(s*.235,0,1.43),'Chest')
 bone(f'UpperArm.{suf}',(s*.235,0,1.43),(s*.341,0,1.16),f'Clavicle.{suf}',True)
 bone(f'Forearm.{suf}',(s*.341,0,1.16),(s*.371,-.01,.953),f'UpperArm.{suf}',True)
 bone(f'Hand.{suf}',(s*.371,-.01,.953),(s*.376,-.017,.867),f'Forearm.{suf}',True)
 bone(f'Thigh.{suf}',(s*.116,0,.94),(s*.116,-.003,.52),'Pelvis',True)
 bone(f'Shin.{suf}',(s*.116,-.003,.52),(s*.116,0,.18),f'Thigh.{suf}',True)
 bone(f'Foot.{suf}',(s*.116,0,.18),(s*.116,-.14,.07),f'Shin.{suf}',True)
 bone(f'Toe.{suf}',(s*.116,-.14,.07),(s*.116,-.2,.055),f'Foot.{suf}',True)
bpy.ops.object.mode_set(mode='OBJECT');objects=[]
for name,b in B.items():
 o=b.obj();objects.append(o)
 skinweights=b.w
 if name in ('Tailored_Jacket','Fitted_Trousers'):
  # Fuse sleeve/shoulder and pelvis/leg junctions into true continuous surfaces.
  # Transfer smooth colors and skin influence from the shaped source panels.
  tree=KDTree(len(b.v))
  for i,v in enumerate(b.v):tree.insert(v,i)
  tree.balance();bpy.context.view_layer.objects.active=o
  rm=o.modifiers.new('Continuous tailored garment surface','REMESH');rm.mode='VOXEL';rm.voxel_size=.009;rm.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rm.name)
  sm=o.modifiers.new('Relax shoulder and crotch transitions','SMOOTH');sm.factor=.7;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
  o.data.calc_loop_triangles();target=3900 if name=='Tailored_Jacket' else 2700
  de=o.modifiers.new('Retain silhouette budget','DECIMATE');de.ratio=min(1,target/max(1,len(o.data.loop_triangles)));bpy.ops.object.modifier_apply(modifier=de.name)
  skinweights=[]
  ca=o.data.color_attributes.get('Color')
  if ca:o.data.color_attributes.remove(ca)
  ca=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for v in o.data.vertices:
   near=tree.find_n(v.co,4);sws={};cs=[0,0,0,0];total=sum(1/max(.002,d) for _,_,d in near)
   for _,idx,d in near:
    fac=1/max(.002,d)/total
    for bone_name,w in b.w[idx].items():sws[bone_name]=sws.get(bone_name,0)+w*fac
    for k in range(4):cs[k]+=b.c[idx][k]*fac
   if name=='Fitted_Trousers':
    z=v.co.z;left=smooth((v.co.x+.045)/.09);hip=smooth((z-.76)/.22);knee=smooth((z-.43)/.18)
    sws={'Pelvis':hip,'Thigh.L':(1-hip)*left*knee,'Thigh.R':(1-hip)*(1-left)*knee,'Shin.L':(1-hip)*left*(1-knee),'Shin.R':(1-hip)*(1-left)*(1-knee)}
   skinweights.append(sws);ca.data[v.index].color=cs
  for poly in o.data.polygons:poly.material_index=2;poly.use_smooth=True
 for n in rigdata.bones.keys():o.vertex_groups.new(name=n)
 for i,ws in enumerate(skinweights):
  total=sum(ws.values())
  for n,w in ws.items():
   if w>1e-6:o.vertex_groups[n].add([i],w/total,'REPLACE')
 mod=o.modifiers.new('Smooth humanoid skin','ARMATURE');mod.object=rig;o.parent=rig
# Animation uses a compressed physical tuck and actual root turn around local X.
rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=30
for p in rig.pose.bones:p.rotation_mode='XYZ'
def reset():
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
def idle(t):
 p=math.sin(t*math.tau);rig.pose.bones['Chest'].rotation_euler.x=.008*p;rig.pose.bones['Pelvis'].rotation_euler.y=.012*p;rig.pose.bones['Head'].rotation_euler.y=-.015*p
 for s,suf in ((1,'L'),(-1,'R')):rig.pose.bones[f'Forearm.{suf}'].rotation_euler.x=-.08-.012*p

def run(t):
 p=math.sin(t*math.tau);rig.pose.bones['Root'].location.y=.025*math.cos(t*math.tau*2)-.045;rig.pose.bones['Chest'].rotation_euler.x=.14;rig.pose.bones['Pelvis'].rotation_euler.y=.055*p;rig.pose.bones['Chest'].rotation_euler.y=-.05*p
 for s,suf in ((1,'L'),(-1,'R')):
  q=s*p;rig.pose.bones[f'Thigh.{suf}'].rotation_euler.x=-.65*q;rig.pose.bones[f'Shin.{suf}'].rotation_euler.x=.10+max(0,-q)*.95;rig.pose.bones[f'Foot.{suf}'].rotation_euler.x=-.10-.18*q
  rig.pose.bones[f'UpperArm.{suf}'].rotation_euler.x=.60*q;rig.pose.bones[f'Forearm.{suf}'].rotation_euler.x=-.47-max(0,q)*.3
 rig.pose.bones['Head'].rotation_euler.x=-.075

def roll(t):
 tuck=smooth(t/.18)*(1-smooth((t-.78)/.22)); turn=smooth((t-.10)/.80)
 rig.pose.bones['Root'].rotation_euler.x=math.tau*turn
 rig.pose.bones['Root'].location.y=-.40*tuck
 rig.pose.bones['Pelvis'].rotation_euler.x=.20*tuck
 rig.pose.bones['Spine'].rotation_euler.x=.45*tuck;rig.pose.bones['Chest'].rotation_euler.x=.55*tuck;rig.pose.bones['Neck'].rotation_euler.x=.30*tuck;rig.pose.bones['Head'].rotation_euler.x=.35*tuck
 for s,suf in ((1,'L'),(-1,'R')):
  rig.pose.bones[f'Thigh.{suf}'].rotation_euler.x=-1.95*tuck;rig.pose.bones[f'Shin.{suf}'].rotation_euler.x=2.38*tuck;rig.pose.bones[f'Foot.{suf}'].rotation_euler.x=-.24*tuck
  rig.pose.bones[f'UpperArm.{suf}'].rotation_euler.x=-1.5*tuck;rig.pose.bones[f'Forearm.{suf}'].rotation_euler.x=-1.7*tuck
 # Match the rolling contact to the floor using the actually deformed mesh.
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();low=1e9
 for o in objects:
  eo=o.evaluated_get(dg);me=eo.to_mesh();low=min(low,min((eo.matrix_world@v.co).z for v in me.vertices));eo.to_mesh_clear()
 rig.pose.bones['Root'].location.y+=.022-low

def action(name,last,sampler):
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for fr in range(last+1):
  reset();sampler(fr/last)
  for p in rig.pose.bones:
   p.keyframe_insert(data_path='rotation_euler',frame=fr,group=p.name)
   if p.name=='Root':p.keyframe_insert(data_path='location',frame=fr,group=p.name)
 for fc in a.fcurves:
  for k in fc.keyframe_points:k.interpolation='LINEAR'
 track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,a);strip.action_frame_start=0;strip.action_frame_end=last;track.mute=True
 return a
A={'Idle_Nebeljagd':action('Idle_Nebeljagd',60,idle),'Run_Nebeljagd':action('Run_Nebeljagd',18,run),'Roll_Nebeljagd':action('Roll_Nebeljagd',24,roll)}
rig.animation_data.action=None;reset();bpy.context.view_layer.update()
# Editable underlying mannequin is an actual fused organic body, excluded from
# runtime export because it would add fully occluded triangles beneath clothes.
# Its smooth connected topology is retained for future outfit authoring.
base=Builder('Authoring_Connected_Body_Base')
loft(base,[(.83,.145,.09,0),(.98,.155,.10,0),(1.10,.15,.10,0),(1.25,.195,.115,0),(1.40,.215,.09,0),(1.48,.055,.045,0)],'skin','Spine',0,24)
for s,suf in ((1,'L'),(-1,'R')):
 tube(base,[(s*.20,0,1.41),(s*.29,0,1.3),(s*.34,0,1.16),(s*.37,0,.96)],[.082,.076,.058,.03],'skin','Spine',0,20)
 tube(base,[(s*.10,0,.94),(s*.12,0,.75),(s*.116,0,.52),(s*.116,0,.18)],[.095,.083,.06,.045],'skin','Pelvis',0,20)
base.add(B['Skin_Head_Neck'].v,B['Skin_Head_Neck'].f,'skin','Head',0)
base.add(B['Skin_Hands'].v,B['Skin_Hands'].f,'skin','Pelvis',0)
for s in (-1,1):ell(base,(s*.116,-.065,.105),(.065,.135,.09),'skin','Pelvis',0,20,10)
core=base.obj();bpy.context.view_layer.objects.active=core
rem=core.modifiers.new('Fuse anatomical transitions','REMESH');rem.mode='VOXEL';rem.voxel_size=.018;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=core.modifiers.new('Relax joined topology','SMOOTH');sm.factor=.65;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
# Weight source body by proximity to complete bone segments.
for n in rigdata.bones.keys():core.vertex_groups.new(name=n)
for v in core.data.vertices:
 candidates=[]
 for bone_data in rigdata.bones:
  if bone_data.name=='Root':continue
  a=bone_data.head_local;delta=bone_data.tail_local-a;u=clamp((v.co-a).dot(delta)/delta.length_squared);dist=(v.co-(a+u*delta)).length
  candidates.append((dist,bone_data.name))
 selected=sorted(candidates)[:2];total=sum(1/max(.015,d)**4 for d,_ in selected)
 for d,n in selected:core.vertex_groups[n].add([v.index],(1/max(.015,d)**4)/total,'REPLACE')
mod=core.modifiers.new('Editable source body skin','ARMATURE');mod.object=rig;core.parent=rig
core.hide_render=True;core.hide_set(True);core['purpose']='Complete connected and rigged body base including head, hands and feet for editing future clothing; excluded from game export to avoid hidden triangles.'
# Review studio cameras: neutral close view and matched top-down inclination.
bpy.ops.object.camera_add(location=(2.7,-5,2.9));cam=bpy.context.object;cam.name='Review_ThreeQuarter';cam.data.type='ORTHO';cam.data.ortho_scale=2.22
cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
bpy.ops.object.camera_add(location=(0,-4.4,7.5));top=bpy.context.object;top.name='Review_GameTopDown';top.data.type='ORTHO';top.data.ortho_scale=2.35;top.rotation_euler=(Vector((0,0,.9))-top.location).to_track_quat('-Z','Y').to_euler()
for loc,power,size in [((-3,-4,5),380,4),((3,-1,3),230,3),((0,3,4),420,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.10,.12,.15);scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.film_transparent=False;scene.view_settings.view_transform='AgX'
rig.animation_data.action=A['Idle_Nebeljagd'];scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'adventurer.blend'))
# Only portable meshes and the rig are selected for game export.
rig.animation_data.action=None
for tr in rig.animation_data.nla_tracks:tr.mute=False
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'adventurer.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_apply=False,export_all_vertex_colors=True)
for tr in rig.animation_data.nla_tracks:tr.mute=True
rig.animation_data.action=A['Idle_Nebeljagd'];scene.frame_set(0)
tris=0
for o in objects:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
component_parent=list(range(len(core.data.vertices)))
def component_root(i):
 while component_parent[i]!=i:component_parent[i]=component_parent[component_parent[i]];i=component_parent[i]
 return i
for e in core.data.edges:component_parent[component_root(e.vertices[1])]=component_root(e.vertices[0])
component_count=len({component_root(i) for i in range(len(component_parent))})
report={'sourceBasemesh':{'object':core.name,'connectedComponents':component_count,'vertices':len(core.data.vertices),'skinned':True,'exported':False},'name':'Nebeljagd neutral human Adventurer','authoring':'Original procedural sculpted/lofted topology, no external meshes/textures or mocap','triangles':tris,'visibleMeshes':[o.name for o in objects],'bones':list(rigdata.bones.keys()),'clips':{k:(max(fc.range()[1] for fc in a.fcurves)-min(fc.range()[0] for fc in a.fcurves))/30 for k,a in A.items()},'heightMetres':round(max(v[2] for b in B.values() for v in b.v)-min(v[2] for b in B.values() for v in b.v),4),'materials':[m.name for m in MATS],'forward':'Blender -Y; glTF +Z','up':'Blender Z; glTF Y','roll':'In-place forward X full revolution with physical tuck; vertical root compensation keeps deformed mesh touching ground; gameplay moves horizontal root','sha256':hashlib.sha256((OUT/'adventurer.glb').read_bytes()).hexdigest()}
(OUT/'adventurer-inspection.json').write_text(json.dumps(report,indent=2)+'\n');print('AVATAR_REPORT '+json.dumps(report))
if '--render' in sys.argv:
 scene.cycles.samples=48;scene.camera=cam;scene.render.filepath=str(OUT/'adventurer-preview.png');bpy.ops.render.render(write_still=True)
 front_location=cam.location.copy();front_rotation=cam.rotation_euler.copy();cam.location=(2.7,5,2.9);cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'adventurer-back.png');bpy.ops.render.render(write_still=True);cam.location=front_location;cam.rotation_euler=front_rotation
 scene.camera=top;scene.render.filepath=str(OUT/'adventurer-topdown.png');bpy.ops.render.render(write_still=True)
 scene.camera=cam;rig.animation_data.action=A['Run_Nebeljagd'];scene.frame_set(5);scene.render.filepath=str(OUT/'adventurer-run.png');bpy.ops.render.render(write_still=True)
 rig.animation_data.action=A['Idle_Nebeljagd'];scene.frame_set(0)
 scene.camera=cam;cam.location=(1.9,-4,2.3);cam.rotation_euler=(Vector((0,-.02,1.55))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.68;scene.render.resolution_x=384;scene.render.resolution_y=384;scene.cycles.samples=64;scene.render.filepath=str(OUT/'adventurer-portrait.png');bpy.ops.render.render(write_still=True)
 scene.camera=cam;cam.location=(3.3,-5,2.3);cam.rotation_euler=(Vector((0,0,.88))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=2.08
 rig.animation_data.action=A['Roll_Nebeljagd'];scene.cycles.samples=32;scene.render.resolution_x=480;scene.render.resolution_y=480
 for fr in (0,4,8,12,16,20,24):scene.frame_set(fr);scene.render.filepath=str(OUT/f'adventurer-roll-{fr:02d}.png');bpy.ops.render.render(write_still=True)
