// X4 Save File Parser - Web Worker
// Uses sax.js for proper XML parsing

// Construct absolute path to sax.js based on this worker's location
// This ensures cross-browser compatibility (Chrome/Edge resolve paths differently than Firefox)
const workerPath = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
importScripts(workerPath + 'sax.js');

class X4SaveParser {
    constructor(sectorNames, shipNames, positions, strings) {
        this.sectorNames = sectorNames;
        this.shipNames = shipNames;
        this.positions = positions;
        this.strings = strings;
        
        this.componentPositions = {};
        this.currentSector = null;
        this.currentResourceArea = null;
        this.data = { sectors: {} };
        this.sectorMacroOfConnectionId = {};
        
        this.lastEntrygateId = null;
        this.lastExitgateId = null;
        this.superHighwayStep = {};
        
        // Pre-compiled regexes for name resolution
        this.REFERENCE = /\{(\d*),\s*(\d+)\}/g;
        this.PARENTHESES = /^(.*)\([^)]*\)(.*)$/;
    }

    resolveName(s) {
        const seen = new Set();
        while (true) {
            this.REFERENCE.lastIndex = 0;
            const matchObj = this.REFERENCE.exec(s);
            if (matchObj === null) break;
            
            const left = s.substring(0, matchObj.index);
            const right = s.substring(matchObj.index + matchObj[0].length);
            const first = matchObj[1] || '20';  // Default page ID for X4 strings
            const second = matchObj[2];
            const tag = `${first},${second}`;
            
            let replacement = '';
            if (!seen.has(tag)) {
                seen.add(tag);
                replacement = this.strings[first]?.[second] || '';
            }
            s = left + replacement + right;
        }
        
        while (true) {
            const matchObj = this.PARENTHESES.exec(s);
            if (matchObj === null) break;
            s = matchObj[1] + matchObj[2];
        }
        
        return s;
    }

    getShipName(shipId) {
        const rawName = this.shipNames[shipId] || shipId;
        return this.resolveName(rawName);
    }

    getSectorName(sectorMacro) {
        const rawName = this.sectorNames[sectorMacro] || sectorMacro;
        return this.resolveName(rawName);
    }

    // Check if path ends with specific tag sequence
    isAtTags(path, ...tags) {
        const n = tags.length;
        if (path.length < n) return false;
        for (let i = 0; i < n; i++) {
            if (path[path.length - n + i].name !== tags[i]) return false;
        }
        return true;
    }

    isSector(path) {
        const last = path[path.length - 1];
        return last.name === 'component' && last.attributes.class === 'sector';
    }

    isStation(path) {
        const last = path[path.length - 1];
        return last.name === 'component' && last.attributes.class === 'station';
    }

    isAbandonedShip(path) {
        const last = path[path.length - 1];
        return (
            last.name === 'component' &&
            (last.attributes.class || '').startsWith('ship_') &&
            last.attributes.owner === 'ownerless'
        );
    }

    isSectorGate(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        return (
            last.name === 'component' &&
            secondLast?.name === 'connection' &&
            (secondLast.attributes.connection || '').startsWith('connection_clustergate')
        );
    }

    isSuperHighwayGate(path) {
        const last = path[path.length - 1];
        return (
            last.name === 'component' &&
            ['highwayentrygate', 'highwayexitgate'].includes(last.attributes.class || '') &&
            (last.attributes.macro || '').includes('superhighway')
        );
    }

    isVault(path) {
        const last = path[path.length - 1];
        return last.name === 'component' && (
            last.attributes.class === 'datavault' ||
            (last.attributes.macro || '').includes('erlking_vault')
        );
    }

    isVaultLoot(path) {
        if (path.length < 4) return false;
        const last = path[path.length - 1];
        const clazz = last.attributes.class || '';
        return (
            last.name === 'component' &&
            ['collectablewares', 'collectableblueprints', 'signalleak'].includes(clazz) &&
            this.isVault(path.slice(0, -3))
        );
    }

    isGateConnected(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        
        return (
            (last.name === 'connected' &&
             ((secondLast?.attributes.connection || '') === 'destination' ||
              (secondLast?.attributes.connection || '').startsWith('clustergate')) &&
             this.isSectorGate(path.slice(0, -3)))
        ) || (
            last.name === 'connected' &&
            this.isSuperHighwayGate(path.slice(0, -3))
        );
    }

    isSuperHighwayStepEntry(path) {
        const last = path[path.length - 1];
        return last.name === 'connection' && last.attributes.connection === 'entrygate';
    }

    isSuperHighwayStepExit(path) {
        const last = path[path.length - 1];
        return last.name === 'connection' && last.attributes.connection === 'exitgate';
    }

    isGateActivity(path) {
        const last = path[path.length - 1];
        return last.name === 'object' && (
            this.isSectorGate(path.slice(0, -1)) ||
            this.isSuperHighwayGate(path.slice(0, -1))
        );
    }
    
    isModule(path) {
        const last = path[path.length - 1];
        return last.name === 'component' && 
            ['production', 'storage', 'dockarea', 'pier', 'defence', 'module', 'buildmodule'].includes(last.attributes.class || '');
    }

    getAncestorStation(path) {
        for (let i = path.length - 2; i >= 0; i--) {
            if (path[i].name === 'component' && path[i].attributes.class === 'station') {
                return path[i];
            }
        }
        return null;
    }

    maybeStoreComponentPosition(path) {
        if (this.isAtTags(path, 'component', 'offset', 'position')) {
            const last = path[path.length - 1];
            const x = parseFloat(last.attributes.x || '0');
            const y = parseFloat(last.attributes.y || '0');
            const z = parseFloat(last.attributes.z || '0');
            const code = path[path.length - 3].attributes.code;
            this.componentPositions[code] = [x, y, z];
        }
    }

    maybeStoreObject(path) {
        const last = path[path.length - 1];
        const attrib = last.attributes;
        
        if (this.isSector(path)) {
            this.currentSector = attrib.macro;
            this.data.sectors[this.currentSector] = {
                name: this.getSectorName(this.currentSector),
                is_known: attrib.known === '1' || attrib.knownto === 'player',
                objects: {},
                resource_areas: []
            };
            return;
        }
        
        // Cache condition results to avoid repeated checks
        const isStation = this.isStation(path);
        const isSectorGate = this.isSectorGate(path);
        const isSuperHighwayGate = this.isSuperHighwayGate(path);
        const isVault = this.isVault(path);
        const isAbandonedShip = this.isAbandonedShip(path);
        
        if (isStation || isSectorGate || isSuperHighwayGate || isVault || isAbandonedShip) {
            const code = attrib.code;
            let macro;
            
            if (isSectorGate) {
                macro = (path[path.length - 2].attributes.connection || '').toLowerCase();
            } else if (isAbandonedShip) {
                macro = this.getShipName(attrib.macro || '');
            } else {
                macro = attrib.macro || '';
            }
            
            if (!this.data.sectors[this.currentSector]) return;
            
            const obj = {
                class: attrib.class || '',
                code: code,
                macro: macro,
                owner: attrib.owner || ''
            };
            
            if (attrib.name) {
                obj.name = this.resolveName(attrib.name);
            }
            
            if (isStation && attrib.state === 'wreck') {
                obj.is_wreck = true;
            }
            if (isVault) {
                obj.has_blueprints = false;
                obj.has_signalleak = false;
                obj.has_wares = false;
            }
            if (isSectorGate || isSuperHighwayGate) {
                obj.is_active = true;
            }
            if (isStation && attrib.factionheadquarters === '1') {
                obj.is_headquarter = true;
            }
            
            this.data.sectors[this.currentSector].objects[code] = obj;
        } else if (this.isVaultLoot(path)) {
            const vaultCode = path[path.length - 4].attributes.code;
            const clazz = path[path.length - 1].attributes.class || '';
            
            if (!this.data.sectors[this.currentSector]?.objects[vaultCode]) return;
            
            if (clazz === 'collectableblueprints') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_blueprints = true;
            }
            if (clazz === 'signalleak') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_signalleak = true;
            }
            if (clazz === 'collectablewares') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_wares = true;
            }
        } else if (this.isGateConnected(path)) {
            const gateComponent = path[path.length - 4];
            const code = gateComponent.attributes.code;
            const clazz = gateComponent.attributes.class;
            const connection = path[path.length - 2];
            const outerId = connection.attributes.id;
            const connected = path[path.length - 1];
            const innerId = connected.attributes.connection;
            
            this.sectorMacroOfConnectionId[innerId] = this.currentSector;
            
            if (!this.data.sectors[this.currentSector]?.objects[code]) return;
            
            if (clazz === 'gate') {
                this.data.sectors[this.currentSector].objects[code].target_id = outerId;
            } else {
                this.data.sectors[this.currentSector].objects[code].target_id = innerId;
            }
        } else if (this.isSuperHighwayStepEntry(path)) {
            this.lastEntrygateId = path[path.length - 1].attributes.id;
        } else if (this.isSuperHighwayStepExit(path)) {
            this.lastExitgateId = path[path.length - 1].attributes.id;
        } else if (this.isGateActivity(path)) {
            const code = path[path.length - 2].attributes.code;
            if (this.data.sectors[this.currentSector]?.objects[code]) {
                this.data.sectors[this.currentSector].objects[code].is_active = 
                    path[path.length - 1].attributes.active !== '0';
            }
        } else if (this.isModule(path)) {
            const stationNode = this.getAncestorStation(path);
            if (stationNode) {
                const stationCode = stationNode.attributes.code;
                const stationObj = this.data.sectors[this.currentSector]?.objects[stationCode];
                if (stationObj) {
                    if (!stationObj.modules) stationObj.modules = {};
                    const macro = attrib.macro || 'unknown';
                    stationObj.modules[macro] = (stationObj.modules[macro] || 0) + 1;
                }
            }
        }
    }

    maybeStoreSuperHighwayStep(path) {
        const last = path[path.length - 1];
        if (last.name !== 'component' || last.attributes.class !== 'highway') return;
        
        this.superHighwayStep[this.lastEntrygateId] = this.lastExitgateId;
        this.superHighwayStep[this.lastExitgateId] = this.lastEntrygateId;
    }

    maybeStorePosition(path) {
        // Match Python: recalculate conditions (don't rely on cached flags)
        if (!(this.isStation(path) || this.isSectorGate(path) || this.isSuperHighwayGate(path) || this.isVault(path) || this.isAbandonedShip(path))) {
            return;
        }
        
        const position = [0, 0, 0];
        
        // First pass: component positions and macro offsets
        for (const elem of path) {
            if (elem.name !== 'component') continue;
            const code = elem.attributes.code;
            const p = this.componentPositions[code] || [0, 0, 0];
            position[0] += p[0];
            position[1] += p[1];
            position[2] += p[2];
            
            const macro = elem.attributes.macro || null;
            const offset = this.positions[macro];
            if (offset) {
                position[0] += offset.x;
                position[1] += offset.y;
                position[2] += offset.z;
            }
        }
        
        // Second pass: connection gate offsets
        for (const elem of path) {
            if (elem.name !== 'connection') continue;
            const gateId = elem.attributes.connection || null;
            if (gateId === null || !gateId.startsWith('connection_clustergate')) continue;
            
            const offset = this.positions[gateId];
            if (offset) {
                position[0] += offset.x;
                position[1] += offset.y;
                position[2] += offset.z;
            }
        }
        
        const last = path[path.length - 1];
        const code = last.attributes.code;
        if (this.data.sectors[this.currentSector]?.objects[code]) {
            this.data.sectors[this.currentSector].objects[code].x = position[0];
            this.data.sectors[this.currentSector].objects[code].y = position[1];
            this.data.sectors[this.currentSector].objects[code].z = position[2];
        }
    }

    maybeStoreResourceStart(path) {
        if (this.isAtTags(path, 'resourceareas', 'area')) {
            const last = path[path.length - 1];
            this.currentResourceArea = {
                x: parseInt(last.attributes.x || '0'),
                y: parseInt(last.attributes.y || '0'),
                z: parseInt(last.attributes.z || '0'),
                resources: {}
            };
        } else if (this.currentResourceArea) {
            // Only check these if we're inside a resource area
            if (this.isAtTags(path, 'resourceareas', 'area', 'wares', 'ware', 'recharge')) {
                const resourceName = path[path.length - 2].attributes.ware;
                if (!this.currentResourceArea.resources[resourceName]) {
                    this.currentResourceArea.resources[resourceName] = {};
                }
                const last = path[path.length - 1];
                const rechargeMax = parseInt(last.attributes.max || '0');
                const rechargeCurrent = last.attributes.current;
                
                this.currentResourceArea.resources[resourceName].recharge_max = rechargeMax;
                this.currentResourceArea.resources[resourceName].recharge_current = 
                    rechargeCurrent === undefined ? rechargeMax : parseInt(rechargeCurrent);
                this.currentResourceArea.resources[resourceName].recharge_time = parseInt(last.attributes.time || '0');
            } else if (this.isAtTags(path, 'resourceareas', 'area', 'yields', 'ware', 'yield')) {
                const resourceName = path[path.length - 2].attributes.ware;
                if (!this.currentResourceArea.resources[resourceName]) {
                    this.currentResourceArea.resources[resourceName] = {};
                }
                this.currentResourceArea.resources[resourceName].yield = 
                    path[path.length - 1].attributes.name || '';
            }
        }
    }

    maybeStoreResourceEnd(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        
        if (last.name === 'area' && secondLast?.name === 'resourceareas') {
            if (this.currentResourceArea && this.data.sectors[this.currentSector]) {
                this.data.sectors[this.currentSector].resource_areas.push(this.currentResourceArea);
            }
            this.currentResourceArea = null;
        }
    }

    writeGateTargetSectors() {
        for (const sector of Object.values(this.data.sectors)) {
            for (const o of Object.values(sector.objects)) {
                if (!['gate', 'highwayentrygate', 'highwayexitgate'].includes(o.class)) continue;
                
                let targetId = o.target_id || null;
                if (['highwayentrygate', 'highwayexitgate'].includes(o.class)) {
                    targetId = this.superHighwayStep[targetId];
                }
                if (targetId === null || targetId === undefined) continue;
                
                const targetSectorMacro = this.sectorMacroOfConnectionId[targetId] || '';
                const targetSectorName = this.resolveName(this.sectorNames[targetSectorMacro] || '');
                o.target_sector_macro = targetSectorMacro;
                o.target_sector_name = targetSectorName;
            }
        }
    }

    // Creates and configures a SAX parser with handlers
    createSAXParser() {
        const parser = sax.parser(false, { lowercase: true, position: false });
        const path = [];
        let tagCount = 0;
        
        const self = this;
        
        parser.onopentag = function(node) {
            tagCount++;
            path.push(node);
            
            self.maybeStoreComponentPosition(path);
            self.maybeStoreObject(path);
            self.maybeStoreResourceStart(path);
        };
        
        parser.onclosetag = function(tagName) {
            if (path.length > 0) {
                self.maybeStoreSuperHighwayStep(path);
                self.maybeStorePosition(path);
                self.maybeStoreResourceEnd(path);
                path.pop();
            }
        };
        
        parser.onerror = function(err) {
            console.error('SAX parser error:', err);
            parser.resume();
        };
        
        return { parser, getTagCount: () => tagCount };
    }
}

// Collect statistics from parsed data
function collectStats(data) {
    const stats = {
        vaults: { empty: 0, with_blueprints: 0, with_wares: 0, with_signalleaks: 0 },
        stations_by_faction: {}
    };
    
    for (const sector of Object.values(data.sectors)) {
        for (const obj of Object.values(sector.objects)) {
            // Count vaults
            if (obj.class === 'datavault' || (obj.macro && obj.macro.includes('erlking_vault'))) {
                if (obj.has_blueprints) stats.vaults.with_blueprints++;
                if (obj.has_wares) stats.vaults.with_wares++;
                if (obj.has_signalleak) stats.vaults.with_signalleaks++;
                if (!obj.has_blueprints && !obj.has_wares && !obj.has_signalleak) {
                    stats.vaults.empty++;
                }
            }
            
            // Count stations by faction
            if (obj.class === 'station' && !obj.is_wreck) {
                const faction = obj.owner || 'unknown';
                stats.stations_by_faction[faction] = (stats.stations_by_faction[faction] || 0) + 1;
            }
        }
    }
    
    return stats;
}

// Worker message handler
self.onmessage = async function(e) {
    const { type, arrayBuffer, config } = e.data;
    
    if (type === 'parse') {
        try {
            
            // Create parser and SAX handler
            const x4Parser = new X4SaveParser(
                config.sectorNames,
                config.shipNames,
                config.positions,
                config.strings
            );
            const { parser: saxParser, getTagCount } = x4Parser.createSAXParser();
            
            // Check if gzipped
            const header = new Uint8Array(arrayBuffer.slice(0, 2));
            const isGzipped = header[0] === 0x1f && header[1] === 0x8b;
            
            // Create text stream from input
            const blob = new Blob([arrayBuffer]);
            let textStream;
            
            if (isGzipped) {
                // Streaming decompression + text decoding
                const ds = new DecompressionStream('gzip');
                const decompressedStream = blob.stream().pipeThrough(ds);
                textStream = decompressedStream.pipeThrough(new TextDecoderStream());
            } else {
                // Just text decoding for non-gzipped
                textStream = blob.stream().pipeThrough(new TextDecoderStream());
            }
            
            // Stream through SAX parser - no need to hold entire XML in memory
            const reader = textStream.getReader();
            let bytesProcessed = 0;
            let lastReportedMB = -1;
            let firstChunk = true;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // Validate first chunk looks like XML
                if (firstChunk) {
                    firstChunk = false;
                    if (!value.trimStart().startsWith('<')) {
                        throw new Error('Data does not appear to be XML');
                    }
                }
                
                // Feed chunk directly to SAX parser
                saxParser.write(value);
                
                // Show MB processed (more accurate than estimated percentage)
                bytesProcessed += value.length;
                const currentMB = Math.floor(bytesProcessed / (1024 * 1024));
                if (currentMB > lastReportedMB) {
                    lastReportedMB = currentMB;
                    self.postMessage({ type: 'progress', status: `Processing ... ${currentMB} MB` });
                }
            }
            
            saxParser.close();
            
            // Validate results
            const tagCount = getTagCount();
            const sectorCount = Object.keys(x4Parser.data.sectors).length;
            
            if (tagCount === 0) {
                throw new Error('No XML tags found in file');
            }
            
            // Post-processing
            self.postMessage({ type: 'progress', status: 'Finishing ...' });
            x4Parser.writeGateTargetSectors();
            
            // Collect statistics
            const stats = collectStats(x4Parser.data);
            
            // Send result
            self.postMessage({ type: 'complete', data: x4Parser.data, stats });
            
        } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
        }
    }
};
