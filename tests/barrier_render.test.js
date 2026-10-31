import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barrierSvg, renderWorldmapSvg } from '../src/map/render.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';

const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
const barrier = (kind = 'wall', options = {}) => ({
  id: `drawn-${kind}`, name: kind === 'wall' ? 'Gartenmauer' : 'Weidezaun',
  kind, variant: kind === 'wall' ? 'kit-stone' : 'kit-wood',
  points: [[0, 0], [20, 0]], scale: 1, gaps: [], ...options,
});
const withBarriers = items => ({ ...structuredClone(base), barriers: items });
const solidPath = svg => svg.match(/class="barrier-solid" d="([^"]*)"/)[1];

test('visible wall strokes preserve a truly open doorway and expose the editable route', () => {
  const item = barrier('wall', { gaps: [{ at: 10, width: 3 }] });
  const original = structuredClone(item);
  const svg = barrierSvg(item);
  assert.equal(solidPath(svg), 'M0,0L8.5,0 M11.5,0L20,0');
  assert.match(svg, /id="feature-barrier-drawn-wall" data-feature-type="barrier" data-feature-id="drawn-wall"/);
  assert.match(svg, /class="barrier-hit" points="0,0 20,0" fill="none" stroke="transparent"/);
  assert.match(svg, /stroke-width="14" vector-effect="non-scaling-stroke" pointer-events="stroke"/);
  for (const [path] of svg.matchAll(/<path[^>]*>/g)) {
    assert.ok(path.includes('d="M0,0L8.5,0 M11.5,0L20,0"'));
    assert.ok(path.includes('stroke-linecap="butt"'), 'stroke caps must not close a passage');
  }
  assert.deepEqual(item, original);
});

test('a passage at a bend cuts both adjoining wall sections', () => {
  const svg = barrierSvg(barrier('fence', {
    points: [[0, 0], [10, 0], [10, 10]], gaps: [{ at: 10, width: 4 }],
  }));
  assert.equal(solidPath(svg), 'M0,0L8,0 M10,2L10,10');
  assert.match(svg, /data-barrier-kind="fence" data-barrier-variant="kit-wood"/);
});

test('SVG thickness follows the normalized GLB footprint and selected scale', () => {
  for (const kind of ['wall', 'fence']) {
    const item = barrier(kind, { scale: 1.5 });
    const definition = getEnvironmentKitDefinition(kind, item.variant);
    const width = Math.round(definition.footprint.halfDepth * 2 * item.scale * 1000) / 1000;
    const solid = barrierSvg(item).match(/<path class="barrier-solid"[^>]*>/)[0];
    assert.ok(solid.includes(`stroke-width="${width}"`));
  }
});

test('drawn barriers obey object visibility and kind filters without losing authored metadata', () => {
  const map = withBarriers([barrier(), barrier('fence', { points: [[0, 12], [20, 12]] })]);
  const full = renderWorldmapSvg(map);
  assert.match(full, /id="barriers" data-layer="barriers" inkscape:groupmode="layer" inkscape:label="Mauern und Zäune"/);
  assert.match(full, /id="feature-barrier-drawn-wall"/);
  assert.match(full, /id="feature-barrier-drawn-fence"/);
  for (const [options, wall, fence] of [
    [{ showObjects: false }, false, false],
    [{ showObjectKinds: ['wall'] }, true, false],
    [{ showObjectKinds: ['fence'] }, false, true],
    [{ showObjectKinds: ['grass'] }, false, false],
  ]) {
    const svg = renderWorldmapSvg(map, options);
    assert.equal(svg.includes('id="feature-barrier-drawn-wall"'), wall);
    assert.equal(svg.includes('id="feature-barrier-drawn-fence"'), fence);
    assert.match(svg, /<metadata id="barrier-settings">/);
    assert.match(svg, /&quot;id&quot;:&quot;drawn-wall&quot;/);
    assert.match(svg, /&quot;id&quot;:&quot;drawn-fence&quot;/);
  }
});

test('barrier names and metadata remain literal XML text', () => {
  const name = '</title><script>alert("wall")</script>&';
  const svg = renderWorldmapSvg(withBarriers([barrier('wall', { name })]));
  assert.ok(svg.includes('&lt;/title&gt;&lt;script&gt;alert(&quot;wall&quot;)&lt;/script&gt;&amp;'));
  assert.ok(!/<script|<foreignObject/.test(svg));
  // Direct group rendering is also safe before the editor has validated a name.
  const group = barrierSvg(barrier('wall', { id: 'bad"/><script>' }));
  assert.match(group, /feature-barrier-bad&quot;\/&gt;&lt;script&gt;/);
  assert.ok(!group.includes('<script>'));
});

test('SVG exports do not mutate route or map data; maps without routes stay unchanged', () => {
  const map = withBarriers([barrier('wall', { gaps: [{ at: 10, width: 3 }] })]);
  const before = JSON.stringify(map);
  renderWorldmapSvg(map, { editor: true });
  assert.equal(JSON.stringify(map), before);
  const original = renderWorldmapSvg(base);
  assert.equal(renderWorldmapSvg({ ...base, barriers: [] }), original);
});
