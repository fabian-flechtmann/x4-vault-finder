#!/usr/bin/env python3

import argparse
import json
import pathlib
import sys
import re
import xml.etree.ElementTree as ET


CWD = pathlib.Path(__file__).parent.resolve()


class PositionExtractor:
    def __init__(self):
        self.positions = {}
    def check(self, resource_id, root):
        connections = root.findall(".//connection")
        for c in connections:
            ref = c.attrib.get('ref')
            if ref not in ['zones', 'gates', 'sechighways']:
                continue
            macro = c.find('./macro')
            if macro is None:
                continue
            if ref == 'gates':
                key = c.attrib.get('name')
            else:
                key = macro.attrib.get('ref')
            if key is None:
                continue
            position = c.find('./offset/position')
            if position is None:
                continue
            value = {
                'x': float(position.attrib.get('x', '0')),
                'y': float(position.attrib.get('y', '0')),
                'z': float(position.attrib.get('z', '0'))
            }
            self.positions[key.lower()] = value
    def finish(self):
        with open(CWD / 'x4-positions.json', 'w') as f:
            json.dump(self.positions, f, sort_keys=True, indent=4)


class StringExtractor:
    def __init__(self):
        self.pages = {}
    def check(self, resource_id, root):
        if root.tag != 'language' or root.attrib.get('id') != '44':
            # Only english language
            return
        for page in root.iter("page"):
            page_id = page.attrib.get("id")
            page_obj = {}
            for t in page.iter("t"):
                key = t.attrib.get("id")
                value = t.text
                page_obj[key] = value
            self.pages[page_id] = page_obj
    def finish(self):
        with open(CWD / 'x4-strings.json', 'w') as f:
            json.dump(self.pages, f, sort_keys=True, indent=4)


class SectorNameExtractor:
    def __init__(self):
        self.sector_names = {}
    def check(self, resource_id, root):
        sectors = root.findall("dataset")
        for sector in sectors:
            key = sector.attrib.get('macro')
            if key is None:
                continue
            identification = sector.findall('.//identification')
            if len(identification) == 0:
                continue
            value = identification[0].attrib.get('name')
            if value is None:
                continue
            self.sector_names[key.lower()] = value
    def finish(self):
        with open(CWD / 'x4-sector-names.json', 'w') as f:
            json.dump(self.sector_names, f, sort_keys=True, indent=4)


class ShipNameExtractor:
    def __init__(self):
        self.ship_names = {}
        self.key_filter = re.compile(r'^assets/units/size_[lmsx]+/macros/[a-z0-9_]+\.xml$')
    def check(self, resource_id, root):
        if not self.key_filter.match(resource_id):
            return
        try:
            macro = root.find('macro')
            properties = macro.find('properties')
            identification = properties.find('identification')
            key = macro.attrib.get('name')
            value = identification.attrib.get('name')
            if value is None:
                return
            self.ship_names[key.lower()] = value
        except:
            pass
    def finish(self):
        with open(CWD / 'x4-ship-names.json', 'w') as f:
            json.dump(self.ship_names, f, sort_keys=True, indent=4)


def read_cat_file(cat_path, extractors):
    if str(cat_path).endswith('_sig.cat'):
        return
    dat_path = cat_path.with_suffix('.dat')
    with open(cat_path, 'r') as cat_file:
        with open(dat_path, 'rb') as dat_file:
            print(f'Reading {cat_path} ...')
            for line in cat_file:
                parts = line.split(" ")
                byte_size = int(parts[-3])
                if byte_size == 0:
                    continue
                resource_id = " ".join(parts[:-3])
                content_bytes = dat_file.read(byte_size)
                if not resource_id.endswith('.xml'):
                    continue
                content = content_bytes.decode('utf8')
                root = ET.fromstring(content)
                for e in extractors:
                    e.check(resource_id, root)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("x4path")
    args = parser.parse_args()
    x4path = pathlib.Path(args.x4path)
    cat_paths = x4path.glob('**/*.cat')
    extractors = [
        PositionExtractor(),
        SectorNameExtractor(),
        ShipNameExtractor(),
        StringExtractor()
    ]
    for cat_path in cat_paths:
        read_cat_file(cat_path, extractors)
    for e in extractors:
        e.finish()


if __name__ == '__main__':
    main()
