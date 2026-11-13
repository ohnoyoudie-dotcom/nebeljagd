"""Snap static GLB attributes to half precision, retaining standard float32 storage.

This removes sub-millimetre noise for ZIP compression without a decoder extension,
texture changes or topology changes. Only bounded, finite float attributes qualify.
"""
import hashlib
import json
import math
from pathlib import Path
import struct


def snap_glb(path):
    path = Path(path)
    raw = path.read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    binary_start = 20 + size
    binary_size, kind = struct.unpack_from('<II', raw, binary_start)
    assert kind == 0x004E4942 and binary_start + 8 + binary_size == len(raw)
    binary = bytearray(raw[binary_start + 8:])
    accessors = {index for mesh in doc['meshes'] for primitive in mesh['primitives']
                 for semantic, index in primitive['attributes'].items()
                 if semantic in ('POSITION', 'NORMAL', 'TEXCOORD_0')}
    maximum_error = 0
    for index in accessors:
        accessor = doc['accessors'][index]
        assert accessor['componentType'] == 5126 and 'sparse' not in accessor
        components = {'VEC2': 2, 'VEC3': 3}[accessor['type']]
        view = doc['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', components * 4)
        minimum, maximum = [math.inf] * components, [-math.inf] * components
        for vertex in range(accessor['count']):
            for axis in range(components):
                offset = start + vertex * stride + axis * 4
                value = struct.unpack_from('<f', binary, offset)[0]
                assert math.isfinite(value) and abs(value) <= 1, 'Only normalized static models qualify'
                snapped = struct.unpack('<e', struct.pack('<e', value))[0]
                maximum_error = max(maximum_error, abs(value - snapped))
                struct.pack_into('<f', binary, offset, snapped)
                minimum[axis] = min(minimum[axis], snapped)
                maximum[axis] = max(maximum[axis], snapped)
        if 'min' in accessor: accessor['min'] = minimum
        if 'max' in accessor: accessor['max'] = maximum
    assert maximum_error <= .00025
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), kind) + binary
    path.write_bytes(result)
    return {'method': 'float16 grid retained in float32 attributes', 'maxAbsoluteError': maximum_error,
            'topologyUnchanged': True, 'texturesUnchanged': True, 'decoderRequired': False}


def refresh_package(directory, runtime_path, inspection_path):
    """Post-export precision step for the existing projectile pipeline."""
    root = Path(directory)
    runtime_path = Path(runtime_path)
    precision = snap_glb(runtime_path)
    inspection = root / inspection_path
    data = json.loads(inspection.read_text())
    data['runtime'].update(bytes=runtime_path.stat().st_size,
        sha256=hashlib.sha256(runtime_path.read_bytes()).hexdigest())
    prior = data.get('precision', {}).get('maxAbsoluteError', 0)
    precision['maxAbsoluteError'] = max(prior, precision['maxAbsoluteError'])
    raw = runtime_path.read_bytes()
    doc = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    bounds = [{'min': doc['accessors'][part['attributes']['POSITION']]['min'],
               'max': doc['accessors'][part['attributes']['POSITION']]['max']}
              for mesh in doc['meshes'] for part in mesh['primitives']]
    if 'bounds' in data['runtime']: data['runtime']['bounds'] = bounds
    data['precision'] = precision
    inspection.write_text(json.dumps(data, indent=2) + '\n')
    manifest = root / 'runtime-manifest.json'
    data = json.loads(manifest.read_text())
    for record in data['files']:
        file = root / record['path']
        record.update(bytes=file.stat().st_size, sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    manifest.write_text(json.dumps(data, indent=2) + '\n')
