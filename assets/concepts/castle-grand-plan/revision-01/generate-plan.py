"""Build the editable 30-room palace concept. Coordinates are metres, x/z."""
from pathlib import Path
import json, html, math
ROOT=Path(__file__).resolve().parent
colors={'north':'#dbe4ed','west':'#e8d8bd','east':'#e9ded1','south':'#dedee9'}
rooms=[]; doors=[]
def room(i,name,rect,wing):
    rooms.append({'id':f'R{i:02}','number':i,'name':name,'rect':rect,'wing':wing})
def door(a,b,x,z,axis='h',width=4):
    doors.append({'id':f'D{len(doors)+1:02}','connects':[a,b],'position':[round(x,3),round(z,3)],'axis':axis,'width':width})
north=['Bibliothek','Archiv','Schreibstube','Kartenraum','Ratssaal','Thronsaal','Audienzsaal','Kapelle','Sakristei','Schatzkammer']
south=['Wachstube West','Waffenkammer','Gästezimmer A','Gästezimmer B','Gästesalon West','Gästesalon Ost','Gästezimmer C','Gästezimmer D','Garderobe','Wachstube Ost']
for row,names,y,offset,wing,corridor,door_z in [(0,north,0,0,'north','CN',35),(1,south,115,20,'south','CS',115)]:
    for i,name in enumerate(names):
        x=round(i*17.2+(8 if i>=5 else 0),3)
        room(offset+i+1,name,[x,y,17.2,35],wing)
        door(f'R{offset+i+1:02}',corridor,x+8.6,door_z)
    for start in [0,5]:
        for i in range(start,start+4):
            x=round((i+1)*17.2+(8 if i>=5 else 0),3)
            door(f'R{offset+i+1:02}',f'R{offset+i+2:02}',x,y+17.5,'v')
room(11,'Großer Ballsaal',[0,43,42,28],'west')
door('R11','CN',12,43,width=6);door('R11','CW',42,57,'v',6)
for i,name in enumerate(['Musiksalon','Empfangssalon','Galerie']):
    room(12+i,name,[i*14,79,14,28],'west');door(f'R{12+i:02}','CS',i*14+7,107)
door('R12','R13',14,93,'v');door('R13','R14',28,93,'v');door('R14','CW',42,93,'v')
for i,name in enumerate(['Speisesaal','Küche','Vorräte','Backstube','Personalraum','Lager']):
    x=138+(i%3)*14;y=43 if i<3 else 79
    room(15+i,name,[x,y,14,28],'east');door(f'R{15+i:02}','CN' if i<3 else 'CS',x+7,43 if i<3 else 107)
for start,y in [(15,57),(18,93)]:
    door(f'R{start:02}',f'R{start+1:02}',152,y,'v');door(f'R{start+1:02}',f'R{start+2:02}',166,y,'v')
door('R15','CE',138,57,'v');door('R18','CE',138,93,'v')
rooms.sort(key=lambda r:r['number'])
corridors=[{'id':i,'rect':r,'name':n} for i,r,n in [
('CN',[0,35,180,8],'Nordgalerie'),('CS',[0,107,180,8],'Südgalerie'),
('CW',[42,43,8,64],'Westgang'),('CE',[130,43,8,64],'Ostgang'),
('PN',[86,0,8,35],'Nordzugang'),('PS',[86,115,8,35],'Hauptzugang'),
('PW',[0,71,42,8],'Westzugang'),('PE',[138,71,42,8],'Ostzugang')]]
for c,x,z,a in [('CN',90,43,'h'),('CS',90,107,'h'),('CW',50,75,'v'),('CE',130,75,'v')]:door(c,'G',x,z,a,8)
exits=[{'id':'north','corridor':'PN','position':[90,0],'label':'NORDTOR'},
{'id':'south','corridor':'PS','position':[90,150],'label':'HAUPTEINGANG'},
{'id':'west','corridor':'PW','position':[0,75],'label':'WESTTOR'},
{'id':'east','corridor':'PE','position':[180,75],'label':'OSTTOR'}]
links=[['CN','CW'],['CN','CE'],['CS','CW'],['CS','CE'],['CN','PN'],['CS','PS'],['CW','PW'],['CE','PE']]
plan={'schemaVersion':1,'name':'Nebeljagd · Großes Gartenschloss','status':'schematic concept, not runtime map data','units':'metres','coordinateAxes':['x','z'],'footprint':[180,150],'floorCount':1,'roof':'open for later top-down game rendering','rooms':rooms,'corridors':corridors,'corridorWidth':8,'corridorLinks':links,'courtyard':{'id':'G','rect':[50,43,80,64]},'lawn':{'rect':[54,47,72,56]},'doors':doors,'exits':exits,'ringWalkLength':320,'notes':['30 rooms exclude corridors and garden.','All rooms are accessible from public corridors.','Paired room doors provide secondary routes.','Exact structures, navigation and collision must be built later.']}
# Basic concept checks: complete non-overlapping tiling, 30 rooms, four exits,
# every room reaches every gate via the door/corridor graph.
assert len(rooms)==30 and len(exits)==4
rects=[r['rect'] for r in rooms+corridors]+[plan['courtyard']['rect']]
assert math.isclose(sum(w*d for x,z,w,d in rects),180*150)
for i,(x,z,w,d) in enumerate(rects):
    assert x>=0 and z>=0 and x+w<=180.001 and z+d<=150.001
    for X,Z,W,D in rects[i+1:]:assert min(x+w,X+W)-max(x,X)<.001 or min(z+d,Z+D)-max(z,Z)<.001
adj={id:set() for id in [r['id'] for r in rooms+corridors]+['G']}
for a,b in links+[d['connects'] for d in doors]:adj[a].add(b);adj[b].add(a)
for e in exits:
    seen={e['corridor']};stack=list(seen)
    while stack:
        for n in adj[stack.pop()]-seen:seen.add(n);stack.append(n)
    assert all(r['id'] in seen for r in rooms)
(ROOT/'floorplan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
# Plan-only vector sheet, deliberately no furniture, roofs or perspective.
S=7.8;OX=92;OY=235;W=1900;H=1547
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
'<rect width="100%" height="100%" fill="#f5f2e9"/>','<style>text{font-family:DejaVu Sans,Arial,sans-serif;fill:#233936}.muted{fill:#687871}.room-label{font-size:12px;font-weight:600}.number{font-size:17px;font-weight:700;fill:#fff}.dim{font-size:17px;fill:#526c63}.legend{font-size:15px}</style>',
'<text x="92" y="56" font-size="17" letter-spacing="4" fill="#4d6858">NEBELJAGD · GRUNDRISSENTWURF 01</text>',
'<text x="92" y="100" font-size="34" font-weight="700">Das große Gartenschloss</text>',
'<text x="92" y="132" font-size="18" class="muted">30 Räume · vier Außenzugänge · lange Galerien · eine offene Etage</text>']
def xy(x,z):return OX+x*S,OY+z*S
def rect(r,fill,stroke=None,sw=2):
    x,z,w,d=r;X,Y=xy(x,z);svg.append(f'<rect x="{X}" y="{Y}" width="{w*S}" height="{d*S}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')
def text(x,z,t,size=14,anchor='middle',extra=''):
    X,Y=xy(x,z);svg.append(f'<text x="{X}" y="{Y}" font-size="{size}" text-anchor="{anchor}" {extra}>{html.escape(t)}</text>')
def line(x1,z1,x2,z2,stroke,width,dash=''):
    a,b=xy(x1,z1);c,d=xy(x2,z2);svg.append(f'<line x1="{a}" y1="{b}" x2="{c}" y2="{d}" stroke="{stroke}" stroke-width="{width}"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>')
rect([0,0,180,150],'#f7ebcf','#31443e',4)
for c in corridors:rect(c['rect'],'#f7ebcf')
rect(plan['courtyard']['rect'],'#d0dfb5','#31443e',3)
rect(plan['lawn']['rect'],'#a3c48e')
rect([86,43,8,64],'#e6d6b0');rect([50,71,80,8],'#e6d6b0')
# Four green parterres and a simple central fountain symbol.
for x,z in [(58,51),(100,51),(58,83),(100,83)]:rect([x,z,22,16],'#91b67b','#73995f',1)
for x,z in [(58,51),(122,51),(58,99),(122,99)]:
    X,Y=xy(x,z);svg.append(f'<circle cx="{X}" cy="{Y}" r="22" fill="#759b69" stroke="#577d52" stroke-width="2"/>')
X,Y=xy(90,75);svg.append(f'<circle cx="{X}" cy="{Y}" r="29" fill="#a3cad0" stroke="#597a7c" stroke-width="3"/>')
for r in rooms:
    rect(r['rect'],colors[r['wing']],'#31443e',3)
    x,z,w,d=r['rect'];X,Y=xy(x+w/2,z+d/2-2)
    svg.append(f'<circle cx="{X}" cy="{Y}" r="17" fill="#435e53"/>')
    svg.append(f'<text x="{X}" y="{Y+6}" text-anchor="middle" class="number">{r["number"]:02}</text>')
    # Long names split to keep room labels out of neighboring walls.
    name=r['name'];parts=name.split() if len(name)>13 else [name]
    for j,p in enumerate(parts):text(x+w/2,z+d/2+3+j*2.2,p,12,extra='class="room-label"')
# Door gaps are real gaps in the drawn walls; colored slim thresholds mark passage.
for d in doors:
    x,z=d['position'];half=d['width']/2
    if d['axis']=='h':
        line(x-half,z,x+half,z,'#f7ebcf',7);line(x-half,z,x+half,z,'#92a995',1.4,'3 3')
    else:
        line(x,z-half,x,z+half,'#f7ebcf',7);line(x,z-half,x,z+half,'#92a995',1.4,'3 3')
for e in exits:
    x,z=e['position']
    if e['id'] in ['north','south']:line(x-4,z,x+4,z,'#f7ebcf',8)
    else:line(x,z-4,x,z+4,'#f7ebcf',8)
# Corridor direction lines show the ring, not new walls.
for a,b,c,d in [(46,39,134,39),(134,39,134,111),(134,111,46,111),(46,111,46,39)]:line(a,b,c,d,'#ae976c',1.8,'8 8')
text(90,64,'INNENGARTEN',22,extra='font-weight="700"');text(90,68,'Grünfläche 72 × 56 m',15)
text(90,91,'Gartenwege als Abkürzung',14)
text(90,38.9,'NORDGALERIE · 8 m breit',13)
text(90,112.6,'SÜDGALERIE · 8 m breit',13)
text(21,76,'WESTZUGANG',12);text(159,76,'OSTZUGANG',12)
# External access arrows and names.
for label,x,z,rot in [('NORDTOR',90,-3,0),('HAUPTEINGANG',90,153,180),('WESTTOR',-3,75,270),('OSTTOR',183,75,90)]:
    X,Y=xy(x,z);svg.append(f'<g transform="translate({X},{Y}) rotate({rot})"><path d="M0,-12 L-9,3 H-4 V15 H4 V3 H9 Z" fill="#447a58"/></g>')
    if rot in [0,180]:text(x,z-2.5 if rot==0 else z+5,label,15,extra='font-weight="700"')
# Dimension cues, scale, and legend.
line(0,-8,180,-8,'#84938b',1);text(90,-9.4,'180 m',18)
for x in [0,180]:line(x,-9.5,x,-6.5,'#84938b',1)
X,Y=xy(-7,75);svg.append(f'<text x="{X}" y="{Y}" font-size="18" text-anchor="middle" transform="rotate(-90 {X} {Y})">150 m</text>')
LX=1555
svg.append(f'<text x="{LX}" y="253" font-size="22" font-weight="700">RAUMVERZEICHNIS</text>')
labels=[('NORD · WISSEN & HERRSCHAFT',range(1,11),'north'),('WEST · FESTFLÜGEL',range(11,15),'west'),('OST · VERSORGUNG',range(15,21),'east'),('SÜD · GÄSTE & ANKUNFT',range(21,31),'south')]
y=283
for title,indices,wing in labels:
    svg.append(f'<rect x="{LX}" y="{y-17}" width="300" height="27" rx="4" fill="{colors[wing]}"/><text x="{LX+9}" y="{y+2}" font-size="13" font-weight="700">{html.escape(title)}</text>');y+=35
    for i in indices:
        name=rooms[i-1]['name'];svg.append(f'<text x="{LX+8}" y="{y}" class="legend">{i:02}  {html.escape(name)}</text>');y+=24
    y+=12
svg.append(f'<text x="{LX}" y="{y+20}" font-size="17" font-weight="700">WEGE & MASSSTAB</text>')
for j,t in enumerate(['Ringgang: ca. 320 m pro Runde','Gänge und Außentore: 8 m breit','Raumtüren: meist 4 m breit','Ballsaal: 42 × 28 m','Grundfläche: 27.000 m²']):svg.append(f'<text x="{LX}" y="{y+51+j*25}" class="legend">{t}</text>')
for j,(color,t) in enumerate([('#f7ebcf','Begehbare Gänge'),('#a3c48e','Garten / Grünfläche'),('#435e53','Wände; Lücken sind Türen')]):
    yy=y+200+j*29;svg.append(f'<rect x="{LX}" y="{yy-13}" width="20" height="15" fill="{color}" stroke="#7d8e7b"/><text x="{LX+30}" y="{yy}" class="legend">{t}</text>')
# Bottom scale bar uses the plan scale exactly.
baseY=H-50;svg.append(f'<path d="M92,{baseY-6} V{baseY+6} M92,{baseY} H{92+20*S} M{92+20*S},{baseY-6} V{baseY+6}" stroke="#435e53" stroke-width="3"/><text x="{92+10*S}" y="{baseY+27}" text-anchor="middle" font-size="15">20 Meter</text>')
svg.append(f'<text x="400" y="{baseY+3}" font-size="15" class="muted">Schematische Planungsbasis · Räume ohne Möbel · keine fertige Spielgeometrie</text>')
svg.append('</svg>');(ROOT/'floorplan.svg').write_text('\n'.join(svg)+'\n')
print(json.dumps({'rooms':len(rooms),'doors':len(doors),'exits':len(exits),'footprintM2':27000,'gardenM2':72*56,'ringMetres':320,'allRoomsReachAllExits':True}))
