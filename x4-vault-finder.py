#!/usr/bin/env python3
import gzip
import json
import pathlib
import sys
import webbrowser
import xml.etree.ElementTree as ET


CWD = pathlib.Path(__file__).parent.resolve()

component_positions = {}
data = {
    'sectors': {}
}
current_sector = None
x4_names = None
x4_offsets = None


def maybe_store_component_position(path):
    if len(path) >= 3 and path[-1].tag == 'position' and path[-2].tag == 'offset' and path[-3].tag == 'component':
        x = float(path[-1].attrib.get('x', '0'))
        y = float(path[-1].attrib.get('y', '0'))
        z = float(path[-1].attrib.get('z', '0'))
        code = path[-3].attrib.get('code')
        component_positions[code] = [x, y, z]


def maybe_store_object(path):
    global current_sector
    attrib = path[-1].attrib
    if is_sector(path):
        current_sector = attrib['macro']
        data['sectors'][current_sector] = {
            'name': x4_names.get(current_sector, current_sector),
            'objects': {}
        }
    elif is_station(path) or is_vault(path):
        code = attrib['code']
        data['sectors'][current_sector]['objects'][code] = {
            'class': attrib.get('class', ''),
            'code': code,
            'has_blueprints': False,
            'has_signalleak': False,
            'has_wares': False,
            'macro': attrib.get('macro', ''),
            'owner': attrib.get('owner', '')
        }
    elif is_vault_loot(path):
        vault_code = path[-4].attrib['code']
        if path[-1].attrib.get('class', '') == 'collectableblueprints':
            data['sectors'][current_sector]['objects'][vault_code]['has_blueprints'] = True
        if path[-1].attrib.get('class', '') == 'signalleak':
            data['sectors'][current_sector]['objects'][vault_code]['has_signalleak'] = True
        if path[-1].attrib.get('class', '') == 'collectablewares':
            data['sectors'][current_sector]['objects'][vault_code]['has_wares'] = True


def maybe_store_position(path):
    if not (is_station(path) or is_vault(path)):
        return
    position = [0, 0, 0]
    for elem in path:
        if elem.tag != 'component':
            continue
        code = elem.attrib.get('code')
        p = component_positions.get(code, [0, 0, 0])
        position[0] += p[0]
        position[1] += p[1]
        position[2] += p[2]
        offset = x4_offsets.get(elem.attrib.get('macro', None), None)
        if offset is not None:
            position[0] += offset['x']
            position[1] += offset['y']
            position[2] += offset['z']
    code = path[-1].attrib.get('code')
    data['sectors'][current_sector]['objects'][code]['x'] = position[0]
    data['sectors'][current_sector]['objects'][code]['y'] = position[1]
    data['sectors'][current_sector]['objects'][code]['z'] = position[2]


def maybe_print_dot(path):
    if is_sector(path):
        sys.stdout.write('.')
        sys.stdout.flush()


def is_sector(path):
    return path[-1].tag == 'component' and path[-1].attrib.get('class', '') == 'sector'


def is_station(path):
    return path[-1].tag == 'component' and path[-1].attrib.get('class', '') == 'station'


def is_vault(path):
    return path[-1].tag == 'component' and (
        path[-1].attrib.get('class', '') == 'datavault' or 'erlking_vault' in path[-1].attrib.get('macro', '')
    )


def is_vault_loot(path):
    return (
        len(path) >= 4 and
        path[-1].tag == 'component' and
        path[-1].attrib.get('class', '') in ['collectablewares', 'collectableblueprints', 'signalleak'] and
        is_vault(path[:-3])
    )


def main():
    global x4_names, x4_offsets
    with open(CWD / 'x4-names.json', 'r') as f:
        x4_names = json.load(f)
    with open(CWD / 'x4-offsets.json', 'r') as f:
        x4_offsets = json.load(f)
    sys.stdout.write('Reading save file ')
    sys.stdout.flush()
    with gzip.open(sys.stdin.buffer, mode='rt') as f:
        context = ET.iterparse(f, events=('start', 'end'))
        path = []
        for event, elem in context:
            if event == 'start':
                path.append(elem)
                maybe_store_component_position(path)
                maybe_store_object(path)
                maybe_print_dot(path)
            elif event == 'end':
                maybe_store_position(path)
                path.pop()
                elem.clear()
    print()
    with open(CWD / 'view/data.js', 'w') as f:
        f.write('let data = ' + json.dumps(data, sort_keys=True, indent=4))
    webbrowser.open(str(CWD / 'view/index.html'))


if __name__ == '__main__':
    main()
