#!/usr/bin/env python3

# Original file copied from https://github.com/TuxInvader/X4-Info-Miner/blob/main/x4-cat-miner.py
#
# Modifications:
# * Replaced lxml with built-in xml library
#
# --- Original license below ---
#
# Copyright (c) 2025 Mark Boddington
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions
# are met:
# 1. Redistributions of source code must retain the above copyright
#    notice, this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright
#    notice, this list of conditions and the following disclaimer in the
#    documentation and/or other materials provided with the distribution.
# 3. Neither the name of the author nor the names of its contributors may
#    be used to endorse or promote products derived from this software
#
# THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
# ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
# OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
# HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
# LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
# OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
# SUCH DAMAGE.

import xml.etree.ElementTree as ET
import gzip
import sys
import argparse
from os import listdir
from os.path import isfile, join
import json
import re
import glob

parser = argparse.ArgumentParser()
parser.add_argument("x4folder", help="The location of your X4 installation")
parser.add_argument("-l", "--langid", default="44", help="The language ID for names (default == 44 (English))")
args = parser.parse_args()

offsetFiles = [
    "02.cat",
    "06.cat",
]

nameFiles = [
    "09.cat",
]

nameMappingFiles = [
    "08.cat",
]

if len(sys.argv) < 2:
    parser.print_usage()
    sys.exit(1)

def fetchXmlwithCat(x4dir, filename):
    catfile = join(x4dir, filename)
    datfile = catfile[0:-3] + "dat"
    offset = 0
    xmlfiles = []
    print("Processing catfile: " + catfile)
    with open(catfile, 'r') as cat:
        for line in cat.readlines():
            deets = line.rsplit(" ", 3)
            if (len(deets) < 4):
                print("Error: failed to parse catfile: " + line)
                continue
            if deets[0].endswith(".xml"):
                with open(datfile, 'rb') as dat:
                    dat.seek(offset)
                    data = dat.read(int(deets[1])).decode('utf-8')
                    xmlfiles += [{'name': deets[0], 'content': data}]
                    print("Added: " + deets[0])
            offset += int(deets[1])
    return xmlfiles

def processOffsets( xmlstrings ):
    offsets = {}
    count = 0
    for rawxml in xmlstrings:
        count += 1
        try:
            print("Checking for offset data in: " + rawxml['name'])
            root = ET.fromstring(rawxml["content"])
            connections = root.findall(".//connection[@ref='zones']")
            for conn in connections:
                position = {'x':0.0, 'y':0.0, 'z':0.0, 'pitch':0.0, 'roll':0.0, 'yaw':0.0}
                conn_has_offset = False
                objpos = conn.find("./offset/position")
                objrot = conn.find("./offset/rotation")
                if objpos != None:
                    conn_has_offset = True
                    position['x'] += float(objpos.get('x')) if 'x' in objpos.attrib else 0.0
                    position['y'] += float(objpos.get('y')) if 'y' in objpos.attrib else 0.0
                    position['z'] += float(objpos.get('z')) if 'z' in objpos.attrib else 0.0
                if conn_has_offset:
                    macro = conn.find("./macro")
                    if macro != None:
                        name = macro.get('ref')
                        if name != None:
                            offsets[ name.lower() ] = position
                            continue
                    print("Warning: Found offset with zone reference: " + conn)
        except:
            print("Warning: Failed to parse xmldoc #" + str(count) + ": " + rawxml['name'])
    return offsets

def fetchNames( xmlstrings, langid ):
    names = {}
    count = 0
    for rawxml in xmlstrings:
        count +=1
        print("Checking for name-mappings data in: " + rawxml['name'])
        root = ET.fromstring(rawxml["content"])
        xmlid = root.get('id')
        if xmlid != langid:
            xmlid = "none" if xmlid == None else xmlid
            print("Skipping language: " + xmlid)
            continue
        for page in root.findall(".//page"):
            pid = page.get('id')
            if pid != None:
                names[pid] = {}
                for t in page.findall('./t'):
                    tid = t.get('id')
                    if tid != None:
                        name = t.text
                        names[pid][tid] = name
    return names

def recurseName( identity, names ):
    text = identity
    for segment in re.findall(r"({[^}]+})", identity):
        pageEntry = segment.split(",")
        segmentText = recurseName( names[pageEntry[0][1:]][pageEntry[1][:-1]], names )
        text = text.replace(segment, segmentText)
    text = re.sub(r"(.*)\([^\(]*\)", r"\1", text)
    return text

def nameSectors( xmlstrings, names):
    sectorNames = {}
    count = 0
    for rawxml in xmlstrings:
        count +=1
        print("Checking for sector naming data in: " + rawxml['name'])
        root = ET.fromstring(rawxml["content"])
        sectors = root.findall(".//dataset")
        for sector in sectors:
            name = sector.get('macro')
            if name != None:
                id = sector.find('.//properties/identification')
                if id != None:
                    identity = id.get('name')
                    if identity != None:
                        sectorNames[name.lower()] = str(recurseName(identity, names))
                        continue
                    else:
                        print("Warning: Failed to find name entry for: " + str(name) + ", page: " + page + ", entry: " + entry)
                else:
                    print("Warning: Found dataset without identification: " + str(name))
    return sectorNames

offsets = {}
names = {}
sectorNames = {}

offsetFiles += glob.glob(args.x4folder + "/extensions/*/*0[123].cat")
nameFiles += glob.glob(args.x4folder + "/extensions/*/*0[123].cat")
nameMappingFiles += glob.glob(args.x4folder + "/extensions/*/*0[123].cat")

for file in offsetFiles:
    xmlstrings = fetchXmlwithCat(args.x4folder, file)
    offsets.update(processOffsets( xmlstrings ))

for file in nameFiles:
   xmlstrings = fetchXmlwithCat(args.x4folder, file)
   names.update( fetchNames(xmlstrings, args.langid ))

for file in nameMappingFiles:
   xmlstrings = fetchXmlwithCat(args.x4folder, file)
   sectorNames.update( nameSectors(xmlstrings, names ))

with open("x4-offsets.json", "w", encoding='utf-8') as jsonfile:
    jsonfile.write( json.dumps(offsets, indent=3, ensure_ascii=False) )

with open("x4-sector-names.json", "w", encoding='utf-8') as jsonfile:
    jsonfile.write( json.dumps(sectorNames, indent=3, ensure_ascii=False) )
