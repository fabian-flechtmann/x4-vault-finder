#!/usr/bin/env python3
import gzip
import json
import pathlib
import re
import sys
import webbrowser
import xml.etree.ElementTree as ET


CWD = pathlib.Path(__file__).parent.resolve()

component_positions = {}
data = {
    'sectors': {}
}
current_sector = None
x4_sector_names = None
x4_ship_names = None
x4_positions = None
x4_strings = None

REFERENCE = re.compile(r'{(\d*),\s*(\d+)}')
PARENTHESES = re.compile(r'^(.*)\([^)]*\)(.*)$')


def resolve_name(s):
    seen = set()
    while True:
        matchobj = REFERENCE.search(s)
        if matchobj is None:
            break
        left = s[:matchobj.start()]
        right = s[matchobj.end():]
        first = matchobj.group(1) if matchobj.group(1) != '' else page_id
        second = matchobj.group(2)
        tag = f'{first},{second}'
        replacement = ''
        if tag not in seen:
            seen.add(tag)
            try:
                replacement = x4_strings[first][second]
            except:
                pass
        s = left + replacement + right
    while True:
        matchobj = PARENTHESES.match(s)
        if matchobj is None:
            break
        s = matchobj.group(1) + matchobj.group(2)
    return s


def get_ship_name(ship_id):
    raw_name = x4_ship_names.get(ship_id, ship_id)
    return resolve_name(raw_name)


def get_sector_name(sector_id):
    raw_name = x4_sector_names.get(current_sector, current_sector)
    return resolve_name(raw_name)


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
            'name': get_sector_name(current_sector),
            'objects': {}
        }
    elif is_station(path) or is_sector_gate(path) or is_super_highway_gate(path) or is_vault(path) or is_abandoned_ship(path):
        code = attrib['code']
        if is_sector_gate(path):
            macro = path[-2].attrib.get('connection', '').lower()
        elif is_abandoned_ship(path):
            macro = get_ship_name(attrib.get('macro', ''))
        else:
            macro = attrib.get('macro', '')
        data['sectors'][current_sector]['objects'][code] = {
            'class': attrib.get('class', ''),
            'code': code,
            'has_blueprints': False,
            'has_signalleak': False,
            'has_wares': False,
            'macro': macro,
            'owner': attrib.get('owner', '')
        }
        if is_sector_gate(path):
            if f'cluster_{macro[-3:]}_macro' in x4_sector_names:
                target_name = resolve_name(x4_sector_names[f'cluster_{macro[-3:]}_macro'])
            elif macro[-3] == '0' and f'cluster_{macro[-2:]}_macro' in x4_sector_names:
                target_name = resolve_name(x4_sector_names[f'cluster_{macro[-2:]}_macro'])
            else:
                target_name = 'unknown sector'
            data['sectors'][current_sector]['objects'][code]['target_name'] = target_name
    elif is_vault_loot(path):
        vault_code = path[-4].attrib['code']
        if path[-1].attrib.get('class', '') == 'collectableblueprints':
            data['sectors'][current_sector]['objects'][vault_code]['has_blueprints'] = True
        if path[-1].attrib.get('class', '') == 'signalleak':
            data['sectors'][current_sector]['objects'][vault_code]['has_signalleak'] = True
        if path[-1].attrib.get('class', '') == 'collectablewares':
            data['sectors'][current_sector]['objects'][vault_code]['has_wares'] = True


def maybe_store_position(path):
    if not (is_station(path) or is_sector_gate(path) or is_super_highway_gate(path) or is_vault(path) or is_abandoned_ship(path)):
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
        macro = elem.attrib.get('macro', None)
        offset = x4_positions.get(macro, None)
        if offset is None:
            continue
        position[0] += offset['x']
        position[1] += offset['y']
        position[2] += offset['z']
    for elem in path:
        if elem.tag != 'connection':
            continue
        gate_id = elem.attrib.get('connection', None)
        if gate_id is None or not gate_id.startswith('connection_clustergate'):
            continue
        offset = x4_positions.get(gate_id, None)
        if offset is None:
            continue
        position[0] += offset['x']
        position[1] += offset['y']
        position[2] += offset['z']
    code = path[-1].attrib.get('code')
    data['sectors'][current_sector]['objects'][code]['x'] = position[0]
    data['sectors'][current_sector]['objects'][code]['y'] = position[1]
    data['sectors'][current_sector]['objects'][code]['z'] = position[2]


def maybe_print_dot(path):
    if len(path) == 2:
        sys.stdout.write('.')
        sys.stdout.flush()


def is_sector(path):
    return path[-1].tag == 'component' and path[-1].attrib.get('class', '') == 'sector'


def is_station(path):
    return path[-1].tag == 'component' and path[-1].attrib.get('class', '') == 'station'


def is_abandoned_ship(path):
    return (
        path[-1].tag == 'component' and
        path[-1].attrib.get('class', '').startswith('ship_') and
        path[-1].attrib.get("owner") == "ownerless"
    )


def is_sector_gate(path):
    return (
        path[-1].tag == 'component' and
        path[-2].tag == 'connection' and
        path[-2].attrib.get('connection', '').startswith('connection_clustergate')
    )


def is_super_highway_gate(path):
    return (
        False and
        path[-1].tag == 'component' and
        path[-1].attrib.get('class', '') == 'highway'
    )


def is_vault(path):
    return path[-1].tag == 'component' and (
        path[-1].attrib.get('class', '') == 'datavault' or
        'erlking_vault' in path[-1].attrib.get('macro', '')
    )


def is_vault_loot(path):
    return (
        len(path) >= 4 and
        path[-1].tag == 'component' and
        path[-1].attrib.get('class', '') in ['collectablewares', 'collectableblueprints', 'signalleak'] and
        is_vault(path[:-3])
    )


def main():
    global x4_sector_names, x4_ship_names, x4_positions, x4_strings
    with open(CWD / 'x4-sector-names.json', 'r') as f:
        x4_sector_names = json.load(f)
    with open(CWD / 'x4-ship-names.json', 'r') as f:
        x4_ship_names = json.load(f)
    with open(CWD / 'x4-positions.json', 'r') as f:
        x4_positions = json.load(f)
    with open(CWD / 'x4-strings.json', 'r') as f:
        x4_strings = json.load(f)
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
    with open(CWD / 'view/data.js', 'w') as f:
        f.write('let data = ' + json.dumps(data, sort_keys=True, indent=4))
    print()
    index_path = str(CWD / 'view/index.html')
    print('Opening browser window at', index_path)
    webbrowser.open(index_path)


if __name__ == '__main__':
    main()
