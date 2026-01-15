// X4 Save File Parser - Main thread interface

// Initialize empty data structure
window.data = { sectors: {} };

// Base path for loading assets
const basePath = window.location.pathname.replace(/\/[^\/]*$/, '') || '.';

// IndexedDB Configuration
const DB_NAME = 'X4VaultFinderDB';
const DB_VERSION = 1;
const STORE_NAME = 'saveData';

// IndexedDB Helpers
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveToDB(data) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data, 'currentSave');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (e) {
        console.warn('Failed to save to IndexedDB:', e);
    }
}

async function loadFromDB() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('currentSave');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    } catch (e) {
        console.warn('Failed to load from IndexedDB:', e);
        return null;
    }
}

// Load configuration files
async function loadConfig() {
    const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status}`);
        }
        return response.json();
    };
    
    const [sectorNames, shipNames, positions, strings] = await Promise.all([
        fetchJson(`${basePath}/assets/x4-sector-names.json`),
        fetchJson(`${basePath}/assets/x4-ship-names.json`),
        fetchJson(`${basePath}/assets/x4-positions.json`),
        fetchJson(`${basePath}/assets/x4-strings.json`)
    ]);
    
    return { sectorNames, shipNames, positions, strings };
}

// Main upload handler
async function handleFileUpload(file) {
    const progressEl = document.getElementById('upload-progress');
    const statusEl = document.getElementById('upload-status');
    statusEl.style.color = '#aaa';
    
    const startTime = performance.now();
    const fileSize = file.size;
    
    try {
        progressEl.style.display = 'block';
        statusEl.textContent = 'Starting ...';
        
        const config = await loadConfig();
        
        // Create worker
        const worker = new Worker(`${basePath}/assets/parser-worker.js`);
        
        // Handle worker messages
        worker.onmessage = function(e) {
            const { type, status, data, stats, message } = e.data;
            
            if (type === 'progress') {
                statusEl.textContent = status;
            } else if (type === 'complete') {
                const processingTime = Math.round(performance.now() - startTime);
                const sectorCount = Object.keys(data.sectors).length;
                
                if (sectorCount === 0) {
                    statusEl.textContent = 'Warning: No sectors found in save file';
                    statusEl.style.color = 'orange';
                    // Track failed parsing (no sectors)
                    if (typeof trackSaveFileStats === 'function') {
                        trackSaveFileStats(false, processingTime, fileSize, null);
                    }
                    worker.terminate();
                    return;
                }
                
                // Track successful parsing
                if (typeof trackSaveFileStats === 'function') {
                    trackSaveFileStats(true, processingTime, fileSize, stats);
                }
                
                // Update global data and refresh UI
                window.data = data;
                saveToDB(data);
                updateSidebar();
                
                // Show the filter input
                const filterInput = document.getElementById('sector-filter');
                if (filterInput) {
                    filterInput.style.display = 'block';
                }
                
                progressEl.style.display = 'none';
                worker.terminate();
            } else if (type === 'error') {
                const processingTime = Math.round(performance.now() - startTime);
                console.error('Worker error:', message);
                statusEl.textContent = 'Error: ' + message;
                statusEl.style.color = 'crimson';
                // Track failed parsing
                if (typeof trackSaveFileStats === 'function') {
                    trackSaveFileStats(false, processingTime, fileSize, null);
                }
                worker.terminate();
            }
        };
        
        worker.onerror = function(error) {
            const processingTime = Math.round(performance.now() - startTime);
            console.error('Worker error:', error);
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.style.color = 'crimson';
            // Track failed parsing
            if (typeof trackSaveFileStats === 'function') {
                trackSaveFileStats(false, processingTime, fileSize, null);
            }
            worker.terminate();
        };
        
        // Read file as ArrayBuffer on main thread (File objects don't transfer reliably to workers in all browsers)
        const arrayBuffer = await file.arrayBuffer();
        
        // Start parsing - transfer the ArrayBuffer for efficiency
        worker.postMessage({ type: 'parse', arrayBuffer, config }, [arrayBuffer]);
        
    } catch (error) {
        const processingTime = Math.round(performance.now() - startTime);
        console.error('Error parsing save file:', error);
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = 'crimson';
        // Track failed parsing
        if (typeof trackSaveFileStats === 'function') {
            trackSaveFileStats(false, processingTime, fileSize, null);
        }
    }
}

function updateSidebar() {
    const sidebar = document.getElementById('sidebar');
    
    // Remove existing sector links (keep title and upload button)
    const existingSectors = sidebar.querySelectorAll('.sector');
    existingSectors.forEach(el => el.remove());
    
    // Clear the filter
    const filterInput = document.getElementById('sector-filter');
    if (filterInput) {
        filterInput.value = '';
    }
    
    // Clear the plot
    const plotDiv = document.getElementById('plot');
    plotDiv.innerHTML = 'Please select a sector from the list';
    
    // Sort sectors by name
    const sectorNames = Object.keys(window.data.sectors)
        .map(k => ({ name: window.data.sectors[k].name, id: k }))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    // Add sector links
    for (const { id: sectorId, name: sectorName } of sectorNames) {
        const sectorData = window.data.sectors[sectorId];
        const tags = [
            maybe_loot_tag(sectorData),
            maybe_ship_tag(sectorData),
            maybe_khaak_tag(sectorData),
            maybe_headquarter_tag(sectorData),
            maybe_unexplored_tag(sectorData),
            maybe_player_tag(sectorData)
        ].join('');
        
        // Create searchable text from name and tag contents
        const searchText = (sectorName + ' ' + tags.replace(/<[^>]*>/g, ' ')).toLowerCase();
        
        const html = `
        <a class="sector" id="${sectorId}" onclick="show('${sectorId}')" data-search="${searchText}">
        ${sectorName}
        ${tags}
        </a>
        `;
        sidebar.insertAdjacentHTML('beforeend', html);
    }
}

function filterSectors(query) {
    const normalizedQuery = query.toLowerCase().trim();
    const sectors = document.querySelectorAll('.sector');
    
    sectors.forEach(sector => {
        const searchText = sector.getAttribute('data-search') || '';
        if (normalizedQuery === '' || searchText.includes(normalizedQuery)) {
            sector.classList.remove('hidden');
        } else {
            sector.classList.add('hidden');
        }
    });
}

// Initialize from storage if available
document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('upload-status');
    
    // Only attempt load if we haven't already loaded something
    if (Object.keys(window.data.sectors).length === 0) {
        const savedData = await loadFromDB();
        if (savedData && savedData.sectors && Object.keys(savedData.sectors).length > 0) {
            window.data = savedData;
            updateSidebar();
            
            const filterInput = document.getElementById('sector-filter');
            if (filterInput) {
                filterInput.style.display = 'block';
            }
            
            if (statusEl) {
                statusEl.textContent = 'Restored from browser storage';
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        }
    }
});
