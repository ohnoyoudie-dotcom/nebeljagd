"""Build the editable second palace scheme. Plan coordinates are metres, x/z."""
from pathlib import Path
import hashlib
import html
import json
import statistics

ROOT = Path(__file__).resolve().parent
COLORS = {'north': '#d9e4eb', 'west': '#ead7b8', 'east': '#e7ded0', 'south': '#ddddea'}
rooms, doors = [], []


def room(number, name, rect, wing):
    rooms.append({'id': f'R{number:02}', 'number': number, 'name': name, 'rect': rect, 'wing': wing})


def door(a, b, x, z, axis='h', width=4):
    doors.append({'id': f'D{len(doors)+1:02}', 'connects': [a, b],
                  'position': [x, z], 'axis': axis, 'width': width})


# Deliberately different depths and room groups, with a separate library passage.
for wing, entries in [
    ('north', [
        (1, 'Bibliothek', [0, 0, 40, 26]), (2, 'Archiv', [0, 34, 40, 24]),
        (3, 'Schreibstube', [48, 18, 28, 40]), (4, 'Ratssaal', [76, 22, 32, 36]),
        (5, 'Thronsaal', [116, 0, 48, 58]), (6, 'Audienzsaal', [164, 24, 36, 34]),
        (7, 'Schatzkammer', [164, 0, 36, 24]), (8, 'Kapelle', [200, 4, 40, 28]),
        (9, 'Sakristei', [200, 32, 40, 26])]),
    ('west', [
        (10, 'Großer Ballsaal', [0, 66, 54, 40]),
        (11, 'Musiksalon', [0, 114, 26, 24]), (12, 'Galerie', [26, 114, 28, 24])]),
    ('east', [
        (13, 'Speisesaal', [158, 66, 40, 34]), (14, 'Küche', [158, 100, 40, 38]),
        (15, 'Vorräte', [206, 66, 34, 34]), (16, 'Backstube', [206, 108, 34, 30]),
        (17, 'Vorratslager', [240, 66, 30, 34])]),
    ('south', [
        (18, 'Wintergarten', [0, 146, 32, 30]), (19, 'Empfangssalon', [32, 146, 30, 30]),
        (20, 'Gästesalon', [62, 146, 30, 30]), (21, 'Gästezimmer A', [104, 146, 40, 30]),
        (22, 'Gästezimmer B', [144, 146, 30, 30]), (23, 'Waffenkammer', [174, 146, 32, 30]),
        (24, 'Personalraum', [206, 138, 34, 38]),
        (25, 'Wachstube West', [0, 184, 36, 34]), (26, 'Übungsraum', [36, 184, 32, 28]),
        (27, 'Garderobe', [68, 184, 24, 26]), (28, 'Gästezimmer C', [104, 184, 36, 36]),
        (29, 'Gästezimmer D', [140, 184, 38, 26]), (30, 'Wachstube Ost', [178, 184, 40, 34])]),
]:
    for number, name, rect in entries:
        room(number, name, rect, wing)

corridors = [{'id': key, 'rect': rect, 'name': name} for key, rect, name in [
    ('CN', [0, 58, 240, 8], 'Nordgalerie'), ('CS', [0, 138, 206, 8], 'Gartengalerie'),
    ('CW', [54, 66, 8, 72], 'Westgang'), ('CE', [150, 66, 8, 72], 'Ostgang'),
    ('NW', [40, 0, 8, 58], 'Bibliotheksgang'), ('NL', [0, 26, 40, 8], 'Lesegang'),
    ('PN', [108, 0, 8, 58], 'Nordzugang'), ('PW', [0, 106, 54, 8], 'Festzugang'),
    ('EC', [198, 66, 8, 72], 'Versorgungsgang'), ('PE', [206, 100, 64, 8], 'Lieferzugang'),
    ('PS', [92, 146, 12, 74], 'Große Vorhalle'),
    ('SW', [0, 176, 92, 8], 'Westlicher Gästegang'),
    ('SE', [104, 176, 136, 8], 'Östlicher Gästegang')]]
garden = {'id': 'G', 'rect': [62, 66, 88, 72], 'name': 'Versetzter Gartenhof'}

for args in [
    ('R01', 'NL', 16, 26), ('R01', 'NW', 40, 14, 'v'),
    ('R02', 'CN', 18, 58), ('R02', 'NL', 20, 34),
    ('R03', 'CN', 60, 58), ('R03', 'NW', 48, 40, 'v'),
    ('R04', 'CN', 90, 58), ('R04', 'PN', 108, 40, 'v'), ('R03', 'R04', 76, 42, 'v'),
    ('R05', 'CN', 140, 58, 'h', 8), ('R05', 'PN', 116, 32, 'v', 6),
    ('R05', 'R06', 164, 44, 'v', 6), ('R06', 'CN', 182, 58, 'h', 6),
    ('R07', 'R05', 164, 14, 'v'), ('R07', 'R06', 180, 24),
    ('R08', 'R07', 200, 16, 'v'), ('R08', 'R06', 200, 28, 'v'),
    ('R08', 'R09', 222, 32), ('R09', 'CN', 222, 58),
    ('R10', 'CN', 24, 66, 'h', 8), ('R10', 'CW', 54, 84, 'v', 8),
    ('R10', 'PW', 22, 106, 'h', 6),
    ('R11', 'PW', 12, 114), ('R11', 'CS', 12, 138),
    ('R12', 'CW', 54, 126, 'v'), ('R12', 'CS', 40, 138), ('R11', 'R12', 26, 124, 'v'),
    ('R13', 'CN', 178, 66, 'h', 6), ('R13', 'CE', 158, 84, 'v', 6),
    ('R13', 'EC', 198, 84, 'v'), ('R14', 'CE', 158, 120, 'v', 6),
    ('R14', 'EC', 198, 122, 'v'), ('R13', 'R14', 178, 100, 'h', 6),
    ('R15', 'EC', 206, 78, 'v'), ('R15', 'PE', 222, 100),
    ('R15', 'R17', 240, 82, 'v'), ('R17', 'PE', 255, 100),
    ('R16', 'PE', 220, 108), ('R16', 'EC', 206, 126, 'v'),
    ('R16', 'R24', 222, 138), ('R24', 'SE', 222, 176),
    ('R18', 'CS', 16, 146, 'h', 6), ('R18', 'SW', 18, 176, 'h', 6),
    ('R19', 'CS', 46, 146), ('R19', 'SW', 46, 176), ('R18', 'R19', 32, 164, 'v'),
    ('R20', 'CS', 78, 146), ('R20', 'PS', 92, 162, 'v'), ('R20', 'SW', 78, 176),
    ('R21', 'CS', 124, 146), ('R21', 'PS', 104, 162, 'v'), ('R21', 'SE', 126, 176),
    ('R22', 'CS', 158, 146), ('R22', 'SE', 160, 176), ('R21', 'R22', 144, 162, 'v'),
    ('R23', 'CS', 188, 146), ('R23', 'SE', 190, 176),
    ('R25', 'SW', 18, 184), ('R25', 'R26', 36, 200, 'v'),
    ('R26', 'SW', 54, 184), ('R26', 'R27', 68, 198, 'v'),
    ('R27', 'SW', 80, 184), ('R27', 'PS', 92, 198, 'v'),
    ('R28', 'SE', 122, 184), ('R28', 'PS', 104, 202, 'v'), ('R28', 'R29', 140, 198, 'v'),
    ('R29', 'SE', 158, 184), ('R29', 'R30', 178, 198, 'v'), ('R30', 'SE', 200, 184),
    ('CN', 'G', 126, 66, 'h', 8), ('CS', 'G', 82, 138, 'h', 8),
    ('CW', 'G', 62, 110, 'v', 8), ('CE', 'G', 150, 88, 'v', 8),
]:
    door(*args)

exits = [
    {'id': 'north', 'corridor': 'PN', 'position': [112, 0], 'axis': 'h', 'width': 8, 'label': 'NORDTOR'},
    {'id': 'south', 'corridor': 'PS', 'position': [98, 220], 'axis': 'h', 'width': 12, 'label': 'HAUPTEINGANG'},
    {'id': 'west', 'corridor': 'PW', 'position': [0, 110], 'axis': 'v', 'width': 8, 'label': 'FESTZUGANG'},
    {'id': 'east', 'corridor': 'PE', 'position': [270, 104], 'axis': 'v', 'width': 8, 'label': 'LIEFERZUGANG'}]


def contact(a, b):
    """Shared boundary: axis, fixed coordinate, start, end."""
    x, z, w, d = a
    X, Z, W, D = b
    if x+w == X or X+W == x:
        lo, hi = max(z, Z), min(z+d, Z+D)
        if hi > lo:
            return 'v', max(x, X), lo, hi
    if z+d == Z or Z+D == z:
        lo, hi = max(x, X), min(x+w, X+W)
        if hi > lo:
            return 'h', max(z, Z), lo, hi
    return None


links = [[a['id'], b['id']] for i, a in enumerate(corridors) for b in corridors[i+1:]
         if contact(a['rect'], b['rect'])]
areas = {r['id']: r['rect'] for r in rooms+corridors+[garden]}
rectangles = list(areas.values())
# Compute the actual stepped exterior outline. The garden is included in the footprint.
xs = sorted({a for x, z, w, d in rectangles for a in (x, x+w)})
zs = sorted({a for x, z, w, d in rectangles for a in (z, z+d)})
occupied = {(i, j) for i in range(len(xs)-1) for j in range(len(zs)-1)
            if any(x <= (xs[i]+xs[i+1])/2 <= x+w and z <= (zs[j]+zs[j+1])/2 <= z+d
                   for x, z, w, d in rectangles)}
edges = {}
for i, j in occupied:
    x, X, z, Z = xs[i], xs[i+1], zs[j], zs[j+1]
    for neighbor, start, end in [((i, j-1), (x, z), (X, z)), ((i+1, j), (X, z), (X, Z)),
                                 ((i, j+1), (X, Z), (x, Z)), ((i-1, j), (x, Z), (x, z))]:
        if neighbor not in occupied:
            assert start not in edges, 'Self-touching exterior corner.'
            edges[start] = end
start = min(edges)
outline, point = [], start
while True:
    outline.append(point)
    point = edges[point]
    if point == start:
        break
    assert len(outline) <= len(edges)
assert len(outline) == len(edges), 'Unexpected hole or disconnected wing.'
outline = [p for i, p in enumerate(outline)
           if not (outline[i-1][0] == p[0] == outline[(i+1) % len(outline)][0]
                   or outline[i-1][1] == p[1] == outline[(i+1) % len(outline)][1])]
plan = {
    'schemaVersion': 2, 'revision': 2, 'name': 'Nebeljagd · Großes Gartenschloss',
    'status': 'schematic concept, not runtime map data', 'units': 'metres', 'coordinateAxes': ['x', 'z'],
    'footprint': [270, 220], 'footprintMeaning': 'bounding extents, not a filled rectangle',
    'footprintPolygon': outline, 'footprintAreaM2': sum(w*d for x, z, w, d in rectangles),
    'floorCount': 1, 'roof': 'open for later top-down game rendering',
    'rooms': rooms, 'corridors': corridors, 'corridorWidths': [8, 12], 'corridorLinks': links,
    'courtyard': garden,
    'lawn': {'rect': [66, 70, 80, 64], 'description': 'planting envelope, crossed by paths'},
    'gardenPaths': [
        {'id': 'west-north', 'width': 7, 'svgPath': 'M62,110 C80,110 73,93 96,94 S125,94 126,66'},
        {'id': 'south-east', 'width': 7, 'svgPath': 'M82,138 C82,117 111,122 118,104 S135,88 150,88'}],
    'doors': doors, 'exits': exits, 'ringWalkLength': 352,
    'notes': ['30 rooms exclude corridors and garden.', 'Garden and gates intentionally offset.',
              'Stepped exterior with projecting eastern service wing.',
              'All rooms have at least two connections.',
              'Structures, navigation and collision must be built later.']}

# Validate the drawing's topology, not merely the room-to-room graph.
assert len(rooms) == 30 and len(exits) == 4
for i, (x, z, w, d) in enumerate(rectangles):
    assert x >= 0 and z >= 0 and x+w <= 270 and z+d <= 220
    for X, Z, W, D in rectangles[i+1:]:
        assert min(x+w, X+W) <= max(x, X) or min(z+d, Z+D) <= max(z, Z), 'Areas overlap.'
for opening in doors:
    boundary = contact(*(areas[k] for k in opening['connects']))
    assert boundary is not None, opening
    axis, fixed, lo, hi = boundary
    x, z = opening['position']
    along, across = (x, z) if axis == 'h' else (z, x)
    assert axis == opening['axis'] and across == fixed, opening
    assert lo <= along-opening['width']/2 and along+opening['width']/2 <= hi, opening
adj = {key: set() for key in areas}
for a, b in links+[d['connects'] for d in doors]:
    adj[a].add(b)
    adj[b].add(a)
for gate in exits:
    x, z = gate['position']
    a, b, w, d = areas[gate['corridor']]
    axis, half = gate['axis'], gate['width']/2
    if axis == 'h':
        assert z in (b, b+d) and a <= x-half and x+half <= a+w
    else:
        assert x in (a, a+w) and b <= z-half and z+half <= b+d
    assert any((axis == 'h' and p[1] == q[1] == z and min(p[0], q[0]) <= x-half and x+half <= max(p[0], q[0]))
               or (axis == 'v' and p[0] == q[0] == x and min(p[1], q[1]) <= z-half and z+half <= max(p[1], q[1]))
               for p, q in zip(outline, outline[1:]+outline[:1])), gate
    seen, stack = {gate['corridor']}, [gate['corridor']]
    while stack:
        for nxt in adj[stack.pop()]-seen:
            seen.add(nxt)
            stack.append(nxt)
    assert len(seen) == len(areas), 'An area cannot be reached.'
assert all(len(adj[r['id']]) >= 2 for r in rooms)
assert all(min(r['rect'][2:]) >= 24 for r in rooms)
assert max(max(r['rect'][2:])/min(r['rect'][2:]) for r in rooms) <= 1.67
(ROOT/'floorplan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2)+'\n')


def stats(data):
    return {
        'roomAreaMeanM2': round(statistics.mean(r['rect'][2]*r['rect'][3] for r in data['rooms']), 1),
        'shortSideMeanM': round(statistics.mean(min(r['rect'][2:]) for r in data['rooms']), 1),
        'shortSideMinM': min(min(r['rect'][2:]) for r in data['rooms']),
        'aspectRatioMax': round(max(max(r['rect'][2:])/min(r['rect'][2:]) for r in data['rooms']), 2)}


old = json.loads((ROOT/'revision-01/floorplan.json').read_text())
validation = {
    'status': 'passed', 'revision': 2, 'rooms': len(rooms), 'doors': len(doors), 'outerExits': len(exits),
    'allRoomsReachAllExits': True, 'allRoomsHaveTwoConnections': True,
    'footprintBoundingMetres': plan['footprint'], 'footprintAreaM2': plan['footprintAreaM2'],
    'courtyardMetres': garden['rect'][2:], 'ringWalkMetres': plan['ringWalkLength'],
    'comparison': {'revision01': stats(old), 'revision02': stats(plan)},
    'checks': ['No overlapping rooms, corridors or courtyard.', 'One connected closed exterior outline.',
               'Every door lies wholly on the shared boundary of its areas.',
               'Every exterior portal lies wholly on the exterior outline.',
               'Every area is reachable from each gate.', 'Each room has at least two connections.',
               'Every room has a short side of at least 24 metres.'],
    'floorplanSha256': hashlib.sha256((ROOT/'floorplan.json').read_bytes()).hexdigest(),
    'boundary': 'Schematic geometry/connectivity only; no game-engine collision or navigation validation.'}
(ROOT/'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2)+'\n')

# The vector drawing is the authoritative schematic; all dimensions follow JSON.
S, OX, OY, W, H = 6, 106, 242, 2200, 1710
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
       '<rect width="100%" height="100%" fill="#f5f2e9"/>',
       '<style>text{font-family:DejaVu Sans,Arial,sans-serif;fill:#263e38}.muted{fill:#708076}.label{font-size:13px;font-weight:600}.dim{font-size:12px;fill:#607169}</style>',
       '<text x="106" y="55" font-size="16" letter-spacing="4">NEBELJAGD · GRUNDRISSENTWURF 02</text>',
       '<text x="106" y="99" font-size="36" font-weight="700">Das große Gartenschloss</text>',
       '<text x="106" y="133" font-size="18" class="muted">Breitere Räume · versetzte Flügel · ein frei gestalteter Gartenhof</text>']


def xy(x, z):
    return OX+x*S, OY+z*S


def rect(r, fill, stroke=None, sw=2):
    x, z, w, d = r
    X, Y = xy(x, z)
    svg.append(f'<rect x="{X}" y="{Y}" width="{w*S}" height="{d*S}" fill="{fill}"'+
               (f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')


def text(x, z, value, size=14, anchor='middle', extra=''):
    X, Y = xy(x, z)
    svg.append(f'<text x="{X}" y="{Y}" font-size="{size}" text-anchor="{anchor}" {extra}>{html.escape(value)}</text>')


def line(x1, z1, x2, z2, color, width, dash=''):
    a, b = xy(x1, z1)
    c, d = xy(x2, z2)
    svg.append(f'<line x1="{a}" y1="{b}" x2="{c}" y2="{d}" stroke="{color}" stroke-width="{width}"'+
               (f' stroke-dasharray="{dash}"' if dash else '')+'/>')


for c in corridors:
    rect(c['rect'], '#f4e6c8')
rect(garden['rect'], '#cadbb6', '#42544a', 3)
rect(plan['lawn']['rect'], '#aacb94')
svg.append(f'<g transform="translate({OX} {OY}) scale({S})">')
svg.append('<path d="M69,73 Q90,69 108,73 Q112,79 104,84 Q90,83 78,94 L68,96Z" fill="#87ae79"/>')
svg.append('<path d="M127,101 Q140,93 145,101 L145,132 Q130,135 115,131 Q110,118 127,101Z" fill="#94b982"/>')
for path in plan['gardenPaths']:
    svg.append(f'<path d="{path["svgPath"]}" fill="none" stroke="#e9d8b1" stroke-width="{path["width"]}" stroke-linecap="butt"/>')
for x, z, radius in [(72, 77, 3.7), (83, 76, 4.2), (97, 77, 3.4), (140, 125, 4.1), (132, 128, 3.2), (119, 128, 3.5)]:
    svg.append(f'<circle cx="{x}" cy="{z}" r="{radius}" fill="#6e9764" stroke="#567d50" stroke-width=".35"/>')
svg.append('<circle cx="99" cy="101" r="5.2" fill="#a4ccd0" stroke="#658c88" stroke-width=".6"/>')
svg.append('</g>')

for r in rooms:
    rect(r['rect'], COLORS[r['wing']], '#42544a', 2.7)
    x, z, w, d = r['rect']
    X, Y = xy(x+w/2, z+d/2-4.5)
    svg.append(f'<circle cx="{X}" cy="{Y}" r="16" fill="#466457"/>')
    svg.append(f'<text x="{X}" y="{Y+5}" text-anchor="middle" font-size="16" font-weight="700" style="fill:white">{r["number"]:02}</text>')
    words = r['name'].split()
    labels = [r['name']] if len(r['name']) <= 13 else [' '.join(words[:-1]), words[-1]]
    for j, label in enumerate(labels):
        text(x+w/2, z+d/2+1.2+j*2.7, label, extra='class="label"')
    text(x+w/2, z+d/2+1.2+len(labels)*2.7+1, f'{w} × {d} m', extra='class="dim"')

for a, b, c, d in [(58, 62, 154, 62), (154, 62, 154, 142), (154, 142, 58, 142), (58, 142, 58, 62)]:
    line(a, b, c, d, '#af976f', 1.6, '6 7')
polygon = ' '.join(f'{xy(x, z)[0]},{xy(x, z)[1]}' for x, z in outline)
svg.append(f'<polygon points="{polygon}" fill="none" stroke="#334e42" stroke-width="4" stroke-linejoin="round"/>')
for opening in doors+exits:
    x, z = opening['position']
    half = opening['width']/2
    if opening['axis'] == 'h':
        line(x-half, z, x+half, z, '#f4e6c8', 7)
        if 'connects' in opening:
            line(x-half, z, x+half, z, '#99b197', 1.3, '3 3')
    else:
        line(x, z-half, x, z+half, '#f4e6c8', 7)
        if 'connects' in opening:
            line(x, z-half, x, z+half, '#99b197', 1.3, '3 3')

text(108, 116, 'GARTENHOF', 22, extra='font-weight="700"')
text(110, 120, '88 × 72 m · freie Wegeführung', 13)
text(80, 62.9, 'NORDGALERIE', 11)
text(98, 142.9, 'GARTENGALERIE · 8 m', 11)
text(45, 180.9, 'GÄSTEGANG', 11)
text(169, 180.9, 'GÄSTEGANG', 11)
text(27, 111, 'FESTZUGANG', 11)
text(241, 105, 'LIEFERZUGANG', 11)
X, Y = xy(98, 181)
svg.append(f'<text x="{X}" y="{Y}" font-size="11" text-anchor="middle" transform="rotate(-90 {X} {Y})">VORHALLE · 12 m</text>')
for gate in exits:
    x, z = gate['position']
    rotation, dx, dz = {'north': (0, 0, -4), 'south': (180, 0, 4), 'west': (270, -4, 0), 'east': (90, 4, 0)}[gate['id']]
    X, Y = xy(x+dx, z+dz)
    svg.append(f'<g transform="translate({X},{Y}) rotate({rotation})"><path d="M0,-12 L-9,3 H-4 V15 H4 V3 H9 Z" fill="#447a58"/></g>')
    if gate['id'] in ('north', 'south'):
        text(x, z-8 if gate['id'] == 'north' else z+10, gate['label'], 14, extra='font-weight="700"')

line(0, -12, 270, -12, '#9aa89b', 1)
for x in (0, 270):
    line(x, -13.5, x, -10.5, '#9aa89b', 1)
text(135, -14.5, '270 m · größte Ausdehnung einschließlich Versorgungsflügel', 15)
X, Y = xy(-10, 110)
svg.append(f'<text x="{X}" y="{Y}" font-size="16" text-anchor="middle" transform="rotate(-90 {X} {Y})">220 m</text>')
LX, ly = 1810, 242
svg.append(f'<text x="{LX}" y="{ly}" font-size="22" font-weight="700">30 RÄUME · VIER FLÜGEL</text>')
ly += 34
for title, wing in [('NORD · HERRSCHAFT & WISSEN', 'north'), ('WEST · FESTFLÜGEL', 'west'),
                     ('OST · VERSORGUNG', 'east'), ('SÜD · GÄSTE & ANKUNFT', 'south')]:
    svg.append(f'<rect x="{LX}" y="{ly-17}" width="338" height="27" rx="4" fill="{COLORS[wing]}"/><text x="{LX+8}" y="{ly+2}" font-size="13" font-weight="700">{html.escape(title)}</text>')
    ly += 34
    for r in (entry for entry in rooms if entry['wing'] == wing):
        svg.append(f'<text x="{LX+8}" y="{ly}" font-size="15">{r["number"]:02}  {html.escape(r["name"])}</text>')
        ly += 24
    ly += 14
ly += 10
svg.append(f'<text x="{LX}" y="{ly}" font-size="18" font-weight="700">MEHR PLATZ, MEHR VARIATION</text>')
for j, value in enumerate(['Kurze Raumseite: mindestens 24 m', 'Ballsaal: 54 × 40 m', 'Thronsaal: 48 × 58 m',
                           'Gänge: 8 m · Vorhalle: 12 m', 'Gartenrunde: ca. 352 m', 'Vier versetzte Außenzugänge']):
    svg.append(f'<text x="{LX}" y="{ly+32+j*24}" font-size="15">{value}</text>')
for j, (color, label) in enumerate([('#f4e6c8', 'Gänge und Durchgänge'), ('#aacb94', 'Garten / Grünfläche'), ('#42544a', 'Wände · Lücken sind Türen')]):
    yy = ly+199+j*29
    svg.append(f'<rect x="{LX}" y="{yy-13}" width="20" height="15" fill="{color}" stroke="#899884"/><text x="{LX+30}" y="{yy}" font-size="15">{label}</text>')
base = H-52
svg.append(f'<path d="M106,{base-6} V{base+6} M106,{base} H{106+20*S} M{106+20*S},{base-6} V{base+6}" stroke="#466457" stroke-width="3"/><text x="{106+10*S}" y="{base+27}" text-anchor="middle" font-size="15">20 Meter</text>')
svg.append(f'<text x="330" y="{base+3}" font-size="15" class="muted">Editierbare Planungsbasis · 30 Räume ohne Möbel · eine offene Etage · noch keine Spielgeometrie</text>')
svg.append('</svg>')
(ROOT/'floorplan.svg').write_text('\n'.join(svg)+'\n')
print(json.dumps(validation, ensure_ascii=False))
