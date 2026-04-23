// --- 1. Map Initialization ---
const map = L.map('map', {
    zoomControl: false // We'll add custom position
}).setView([-41.2, 173], 6);

// Add zoom control under the custom map action buttons on the top-left
L.control.zoom({ position: 'topleft' }).addTo(map);

// Add scale control
L.control.scale({
    position: 'bottomleft',
    imperial: false,
    metric: true
}).addTo(map);

// Store initial view for home button
const initialView = { center: [-41.2, 173], zoom: 6 };

// --- Multi-select state ---
const selectedRows = new Set();
let filteredBySelection = false;

// --- Per-row visibility state ---
const hiddenSheets = new Set();

// --- Excluded fields and field ordering ---
const EXCLUDE_FIELDS = [
    'OBJECTID', 'MinPS', 'MaxPS', 'LowPS', 'HighPS',
    'Category', 'CenterX', 'CenterY', 'ZOrder', 'TypeID',
    'ItemTS', 'UriHash', 'Shape_Leng', 'Shape_Area', 'Shape_Length',
    'Name', 'Tag', 'GroupName', 'ProductName', 'TILES', 'MAP', 'TIF'
];

function getDisplayFields(properties) {
    let fields = Object.keys(properties).filter(f => !EXCLUDE_FIELDS.includes(f));
    const lyrIndex = fields.indexOf('LYR');
    if (lyrIndex > -1) {
        fields.splice(lyrIndex, 1);
        fields.push('LYR');
    }
    return fields;
}

// --- 2. Base Maps Setup ---
const basemaps = {
    Gray: L.esri.basemapLayer('Gray'),
    Imagery: L.esri.basemapLayer('Imagery'),
    Streets: L.esri.basemapLayer('Streets')
};

let currentBasemap = basemaps.Gray;
currentBasemap.addTo(map);

const imageryLabels = L.esri.basemapLayer('ImageryLabels');

window.setBasemap = function(type, btnElement) {
    document.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    if (map.hasLayer(currentBasemap)) map.removeLayer(currentBasemap);
    if (map.hasLayer(imageryLabels)) map.removeLayer(imageryLabels);

    currentBasemap = basemaps[type];
    map.addLayer(currentBasemap);

    if (type === 'Imagery') {
        map.addLayer(imageryLabels);
    }
    
    if (map.hasLayer(footprintsLayer)) footprintsLayer.bringToFront();
    if (map.hasLayer(geologyLayer)) geologyLayer.bringToFront();
};

// --- 3. Service URLs ---
const urls = {
    image: 'https://gis.gns.cri.nz/server/rest/services/geology/rgmad_mosaic/ImageServer',
    footprints: 'https://gis.gns.cri.nz/server/rest/services/geology/rgmad_footprints/MapServer'
};

// --- 4. Layers ---
const footprintsLayer = L.esri.dynamicMapLayer({
    url: urls.footprints,
    opacity: 1, 
    layers: [0], 
    useCors: true,
    format: 'png32',
    transparent: true,
    f: 'image',
    maxZoom: 18
}).addTo(map);

// Filter to show only -l4 tiles (one per map sheet)
footprintsLayer.setLayerDefs({
    0: "Name LIKE '%-l4'"
});

const geologyLayer = L.esri.imageMapLayer({
    url: urls.image,
    opacity: 1.0,
    attribution: 'GNS Science',
    format: 'jpgpng',
    compression: 75,
    maxZoom: 18
}); // Off by default — enabled on first sheet selection or manual toggle

// Set mosaic rule to let server choose appropriate tile level based on scale
// This allows all L1-L4 tiles to be visible, with the server selecting the best one
geologyLayer.setMosaicRule({
    mosaicMethod: 'esriMosaicClosestToCenter'
});

// Query object for footprints (needed early for zoom functions)
const footprintsQuery = L.esri.query({ url: urls.footprints + '/0' });

// --- 5. Loading Indicators ---
const loadingDiv = document.getElementById('loading');
const loadingText = document.querySelector('.loading-text');
const showLoading = (msg) => { 
    if (loadingText) loadingText.textContent = msg || 'Loading...';
    loadingDiv.style.display = 'flex';
};
const hideLoading = () => { loadingDiv.style.display = 'none'; };

geologyLayer.on('loading', () => showLoading('Loading Map Imagery...'));
geologyLayer.on('load', hideLoading);

// --- 6. Map Enhancement Controls ---

// Home button - reset to initial extent
const homeBtn = document.getElementById('home-btn');
if (homeBtn) {
    homeBtn.addEventListener('click', () => {
        map.setView(initialView.center, initialView.zoom, { animate: true });
    });
}

// Fullscreen button
const fullscreenBtn = document.getElementById('fullscreen-btn');
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        const mapContainer = document.getElementById('map-container');
        if (!document.fullscreenElement) {
            mapContainer.requestFullscreen().then(() => {
                map.invalidateSize();
                fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
            }).catch(err => console.error('Fullscreen error:', err));
        } else {
            document.exitFullscreen().then(() => {
                map.invalidateSize();
                fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
            });
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore if typing in input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.key.toLowerCase()) {
        case 'h':
            if (homeBtn) homeBtn.click();
            break;
        case 'f':
            if (fullscreenBtn) fullscreenBtn.click();
            break;
    }
});

// Notification function
function showNotification(message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => document.body.removeChild(notification), 300);
    }, duration);
}

// --- 6. UI Controls ---
const slider = document.getElementById('opacity-slider');
const opacityLabel = document.getElementById('opacity-label');
slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    geologyLayer.setOpacity(val);
    opacityLabel.textContent = Math.round(val * 100) + '% Opacity';
});

document.getElementById('layer-toggle').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(geologyLayer); else map.removeLayer(geologyLayer);
});

document.getElementById('footprints-toggle').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(footprintsLayer); else map.removeLayer(footprintsLayer);
});

const panel = document.getElementById('main-panel');
const minimizePanelBtn = document.getElementById('minimize-panel');
const panelHeader = panel ? panel.querySelector('.panel-header') : null;
window.togglePanel = function() {
    panel.classList.toggle('minimized');
};

if (minimizePanelBtn) {
    minimizePanelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.togglePanel();
    });
}

if (panelHeader) {
    panelHeader.addEventListener('click', (e) => {
        // Keep button click behavior isolated; otherwise allow header click to toggle.
        if (e.target.closest('#minimize-panel')) return;
        window.togglePanel();
    });
}

// --- 7. Core Selection Logic ---
// Helper function to strip tile level suffix (e.g., "17834-l3" -> "17834")
function getBaseName(name) {
    if (!name) return '';
    return name.replace(/-l[1-4]$/i, '');
}

function escapeSql(value) {
    return String(value).replace(/'/g, "''");
}

// Build geology filter to include all tile levels for each selected sheet base name.
function buildGeologyWhereForSheetNames(sheetNames) {
    const baseNames = Array.from(new Set(sheetNames.map(getBaseName).filter(Boolean)));
    if (baseNames.length === 0) return '1=0';
    return baseNames.map(base => `Name LIKE '${escapeSql(base)}-l%'`).join(' OR ');
}

function applyGeologyMosaic(whereClause) {
    const rule = { mosaicMethod: 'esriMosaicClosestToCenter' };
    if (whereClause) rule.where = whereClause;
    geologyLayer.setMosaicRule(rule);
}

// Single highlighted row name (from row click, not checkbox)
let activeHighlightName = null;

// Central function: decide what imagery to show based on current highlight + checkboxes.
// Footprints are always kept showing all sheets.
function applySelectionMosaic() {
    const checkedCount = selectedRows.size;

    if (checkedCount > 1) {
        // Multiple checkboxed → show imagery for all checked sheets
        if (!map.hasLayer(geologyLayer)) {
            map.addLayer(geologyLayer);
            const toggle = document.getElementById('layer-toggle');
            if (toggle) toggle.checked = true;
        }
        applyGeologyMosaic(buildGeologyWhereForSheetNames(Array.from(selectedRows)));
    } else if (checkedCount === 1) {
        // Exactly one checkbox ticked → show that sheet
        if (!map.hasLayer(geologyLayer)) {
            map.addLayer(geologyLayer);
            const toggle = document.getElementById('layer-toggle');
            if (toggle) toggle.checked = true;
        }
        applyGeologyMosaic(buildGeologyWhereForSheetNames(Array.from(selectedRows)));
    } else if (activeHighlightName) {
        // No checkboxes, but a row is highlighted → show that sheet
        if (!map.hasLayer(geologyLayer)) {
            map.addLayer(geologyLayer);
            const toggle = document.getElementById('layer-toggle');
            if (toggle) toggle.checked = true;
        }
        applyGeologyMosaic(buildGeologyWhereForSheetNames([activeHighlightName]));
    } else {
        // Nothing selected → hide imagery
        if (map.hasLayer(geologyLayer)) {
            map.removeLayer(geologyLayer);
            const toggle = document.getElementById('layer-toggle');
            if (toggle) toggle.checked = false;
        }
    }

    // Footprints: filter to selected sheets only when Filter Selected is active
    if (filteredBySelection && selectedRows.size > 0) {
        const visibleNames = Array.from(selectedRows).filter(n => !hiddenSheets.has(n));
        if (visibleNames.length > 0) {
            const fpClause = Array.from(new Set(visibleNames.map(getBaseName).filter(Boolean)))
                .map(b => `Name LIKE '${escapeSql(b)}-l4'`).join(' OR ');
            footprintsLayer.setLayerDefs({ 0: fpClause });
        } else {
            footprintsLayer.setLayerDefs({ 0: "1=0" });
        }
    } else {
        footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
    }
}

// Store currently selected feature for zoom button
let currentlySelectedFeature = null;
let currentlySelectedName = null;

function selectAndIsolate(name, feature, autoZoom = false) {
    if (!name) return;
    const baseName = getBaseName(name);

    // Store the selected feature and name
    currentlySelectedFeature = feature;
    currentlySelectedName = name;

    // Track the highlighted row and update imagery accordingly
    activeHighlightName = name;
    applySelectionMosaic();

    // Highlight in Table - match by base name
    const rows = document.querySelectorAll('#table-body tr');
    rows.forEach(row => {
        const rowBaseName = getBaseName(row.dataset.name);
        if (rowBaseName === baseName) {
            row.classList.add('active-row');
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            row.classList.remove('active-row');
        }
    });

    // Only zoom if autoZoom flag is true (from map click)
    if (autoZoom) {
        performZoomToSelected(baseName, feature);
    }
}

// Separate function to perform zoom
function performZoomToSelected(baseName, feature) {
    if (!baseName) baseName = getBaseName(currentlySelectedName);
    if (!feature) feature = currentlySelectedFeature;
    
    showLoading(`Zooming to ${baseName}...`);
    
    // Zoom - ensure we have geometry
    if (feature && feature.geometry) {
        try {
            const geoJsonLayer = L.geoJSON(feature);
            const bounds = geoJsonLayer.getBounds();
            if (bounds.isValid()) {
                console.log('Zooming to feature bounds:', bounds);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
                hideLoading();
            } else {
                console.warn('Invalid bounds, fetching geometry');
                fetchAndZoom(baseName);
            }
        } catch (error) {
            console.error('Error creating bounds from feature:', error);
            fetchAndZoom(baseName);
        }
    } else {
        console.log('No geometry in feature, fetching...');
        fetchAndZoom(baseName);
    }
}

// Helper function to fetch geometry and zoom
function fetchAndZoom(baseName) {
    console.log('Fetching geometry for:', baseName);
    const sqlSafeBaseName = baseName.replace(/'/g, "''");
    L.esri.query({ url: urls.footprints + '/0' })
        .where(`Name LIKE '${sqlSafeBaseName}%'`)
        .returnGeometry(true)
        .limit(1)
        .run((error, featureCollection) => {
            hideLoading();
            if (error) {
                console.error('Error fetching geometry:', error);
                return;
            }
            if (!featureCollection.features || featureCollection.features.length === 0) {
                console.warn('No features found for:', baseName);
                return;
            }
            
            const fetchedFeature = featureCollection.features[0];
            console.log('Found feature:', fetchedFeature);
            
            if (!fetchedFeature.geometry) {
                console.error('Feature has no valid geometry');
                return;
            }
            
            try {
                const geoJsonLayer = L.geoJSON(fetchedFeature);
                const bounds = geoJsonLayer.getBounds();
                
                if (bounds.isValid()) {
                    console.log('Zooming to bounds:', bounds);
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
                } else {
                    console.error('Invalid bounds calculated');
                }
            } catch (error) {
                console.error('Error processing geometry:', error, fetchedFeature.geometry);
            }
        });
}

// --- 8. Map Click Interaction ---
map.on('click', function(e) {
    if (!map.hasLayer(footprintsLayer)) return;
    showLoading('Identifying...');
    footprintsLayer.identify().at(e.latlng).layers('visible:0').run(function(error, featureCollection) {
        hideLoading();
        if (error || featureCollection.features.length === 0) return;

        const feature = featureCollection.features[0];
        const props = feature.properties;
        window.lastClickedFeature = feature;

        // Highlight in table
        if (props.Name) {
            const baseName = getBaseName(props.Name);
            const rows = document.querySelectorAll('#table-body tr');
            rows.forEach(r => r.classList.remove('active-row'));
            const targetRow = Array.from(rows).find(r => getBaseName(r.dataset.name) === baseName);
            if (targetRow) {
                targetRow.classList.add('active-row');
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        const displayName = getBaseName(props.Name);
        const popupContent = `
            <div style="min-width: 200px;">
                <h4 style="margin:0 0 5px 0;">${displayName}</h4>
                <table class="popup-table">
                    <tr><td>Year:</td><td>${props.Year || ''}</td></tr>
                    <tr><td>Scale:</td><td>${props.Scale || ''}</td></tr>
                </table>
                <button class="popup-btn" onclick="selectFromPopup()">Isolate & Zoom</button>
            </div>
        `;
        L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
    });
});

window.selectFromPopup = function() {
    if (window.lastClickedFeature) {
        const props = window.lastClickedFeature.properties;
        selectAndIsolate(props.Name, window.lastClickedFeature, true); // Auto-zoom from map click
        map.closePopup();
    }
};

// --- 10. Attribute Table Logic ---
let isFetching = false;
let tableHeadersGenerated = false;
let totalRecordsLoaded = 0;
let allLoadedFeatures = []; 

// Function to load features visible in current map extent
function loadVisibleFeatures() {
    if (isFetching) return;
    isFetching = true;
    
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    const countSpan = document.getElementById('table-count');
    
    tbody.innerHTML = '';
    countSpan.textContent = '(Loading visible features...)';
    
    const bounds = map.getBounds();
    
    footprintsQuery
        .where("Name LIKE '%-l4'")  // Only fetch -l4 tiles (one per sheet)
        .intersects(bounds)
        .fields(['*'])
        .returnGeometry(true)
        .run((error, featureCollection) => {
            isFetching = false;
            
            if (error) {
                console.error('Error loading visible features:', error);
                countSpan.textContent = `(Error: ${error.message})`;
                return;
            }
            
            if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
                countSpan.textContent = '(No features in current view)';
                thead.innerHTML = '';
                tableHeadersGenerated = false;
                // Clear map filters when no features in view
                footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
                geologyLayer.setMosaicRule({ mosaicMethod: 'esriMosaicClosestToCenter' });
                return;
            }
            
            allLoadedFeatures = featureCollection.features;
            totalRecordsLoaded = allLoadedFeatures.length;
            
            // Generate headers
            if (!tableHeadersGenerated) {
                generateTableHeaders(allLoadedFeatures[0]);
                tableHeadersGenerated = true;
            }
            
            // Render all visible features
            renderVisibleFeatures();
            
            // Count unique base names for accurate display
            const baseNameSet = new Set();
            allLoadedFeatures.forEach(f => {
                const baseName = getBaseName(f.properties.Name || '');
                baseNameSet.add(baseName);
            });
            
            countSpan.textContent = `(${baseNameSet.size} unique sheets in view, ${totalRecordsLoaded} total tiles)`;
            
            // Filter map layers to show only visible sheets when extent filter is enabled
            if (extentFilterEnabled && allLoadedFeatures.length > 0) {
                const visibleNames = [];
                allLoadedFeatures.forEach(f => {
                    const name = f.properties.Name;
                    if (name) visibleNames.push(name);
                });
                
                if (visibleNames.length > 0) {
                    // Build SQL where clause
                    const nameConditions = visibleNames.map(name => {
                        const sqlSafeName = name.replace(/'/g, "''");
                        return `Name = '${sqlSafeName}'`;
                    }).join(' OR ');
                    
                    // Filter both footprints and geology layers
                    footprintsLayer.setLayerDefs({ 0: `(${nameConditions})` });
                    applyGeologyMosaic(`(${buildGeologyWhereForSheetNames(visibleNames)})`);
                }
            }
        });
}

function renderVisibleFeatures() {
    const tbody = document.getElementById('table-body');
    const fragment = document.createDocumentFragment();
    
    if (allLoadedFeatures.length === 0) return;
    
    const fields = getDisplayFields(allLoadedFeatures[0].properties);
    
    // Deduplicate by base name (group -l1, -l2, -l3, -l4 together)
    const baseNameMap = new Map();
    allLoadedFeatures.forEach(feature => {
        const baseName = getBaseName(feature.properties.Name || '');
        if (!baseNameMap.has(baseName)) {
            baseNameMap.set(baseName, feature);
        }
    });
    
    const uniqueFeatures = Array.from(baseNameMap.values());
    
    uniqueFeatures.forEach(feature => {
        const tr = createRow(feature, fields);
        fragment.appendChild(tr);
    });
    
    tbody.appendChild(fragment);
}

function loadAttributes() {
    if (isFetching) return;
    isFetching = true;
    
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    const countSpan = document.getElementById('table-count');
    const BATCH_SIZE = 1000;
    
    tbody.innerHTML = '';
    thead.innerHTML = '';
    tableHeadersGenerated = false;
    totalRecordsLoaded = 0;
    allLoadedFeatures = []; 
    
    countSpan.textContent = '(Loading data...)';
    
    // Step 1: Get all matching ObjectIDs first, then fetch in batches by ID
    const idsUrl = urls.footprints + '/0/query';
    fetch(idsUrl + '?' + new URLSearchParams({
        where: "Name LIKE '%-l4'",
        returnIdsOnly: 'true',
        f: 'json'
    }))
    .then(resp => resp.json())
    .then(data => {
        if (!data.objectIds || data.objectIds.length === 0) {
            countSpan.textContent = '(No records found)';
            isFetching = false;
            return;
        }
        
        const allIds = data.objectIds.sort((a, b) => a - b);
        const totalExpected = allIds.length;
        countSpan.textContent = `(Found ${totalExpected} records, loading...)`;
        
        // Step 2: Fetch features in batches by ObjectID chunks
        let batchIndex = 0;
        
        function fetchBatchByIds() {
            const start = batchIndex * BATCH_SIZE;
            if (start >= allIds.length) {
                finalizeLoading();
                return;
            }
            
            const batchIds = allIds.slice(start, start + BATCH_SIZE);
            countSpan.textContent = `(Loading ${totalRecordsLoaded} of ${totalExpected} sheets...)`;
            
            const queryUrl = idsUrl + '?' + new URLSearchParams({
                objectIds: batchIds.join(','),
                outFields: '*',
                returnGeometry: 'false',
                f: 'geojson'
            });
            
            fetch(queryUrl)
            .then(resp => resp.json())
            .then(featureCollection => {
                const features = featureCollection.features || [];
                const batchCount = features.length;
                
                if (batchCount > 0) {
                    allLoadedFeatures = allLoadedFeatures.concat(features);
                    totalRecordsLoaded += batchCount;
                    
                    if (!tableHeadersGenerated) {
                        generateTableHeaders(features[0]);
                    }
                    
                    renderBatch(features);
                }
                
                batchIndex++;
                fetchBatchByIds();
            })
            .catch(err => {
                console.error("Batch fetch error", err);
                // Try to continue with remaining batches
                batchIndex++;
                if (batchIndex * BATCH_SIZE < allIds.length) {
                    fetchBatchByIds();
                } else {
                    finalizeLoading();
                }
            });
        }
        
        fetchBatchByIds();
    })
    .catch(err => {
        console.error("ObjectID fetch error", err);
        isFetching = false;
        countSpan.textContent = `(Error: ${err.message})`;
    });
}

function generateTableHeaders(feature) {
    const thead = document.getElementById('table-head');
    const fields = getDisplayFields(feature.properties);
    
    const headerRow = document.createElement('tr');
    
    // Add checkbox column header
    const checkboxTh = document.createElement('th');
    checkboxTh.className = 'checkbox-col';
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'select-all-checkbox';
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    checkboxTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(checkboxTh);
    
    // Add eye (visibility) column header
    const eyeTh = document.createElement('th');
    eyeTh.className = 'eye-col';
    eyeTh.title = 'Toggle tile visibility on map';
    eyeTh.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    headerRow.appendChild(eyeTh);

    // Add zoom column header
    const zoomTh = document.createElement('th');
    zoomTh.className = 'zoom-col';
    zoomTh.title = 'Zoom to sheet';
    zoomTh.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>';
    headerRow.appendChild(zoomTh);
    
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        th.setAttribute('data-field', field);
        th.style.userSelect = 'none';
        if (field !== 'LYR') {
            th.title = 'Click to sort';

            // Add sort indicator
            const sortIndicator = document.createElement('span');
            sortIndicator.style.marginLeft = '5px';
            sortIndicator.style.fontSize = '10px';
            sortIndicator.style.color = '#94a3b8';
            sortIndicator.textContent = '⇅';
            th.appendChild(sortIndicator);

            // Add click event for sorting with drag detection
            let mouseDownX = 0;
            let mouseDownY = 0;
            let isDragging = false;

            th.addEventListener('mousedown', (e) => {
                mouseDownX = e.clientX;
                mouseDownY = e.clientY;
                isDragging = false;
            });

            th.addEventListener('mousemove', (e) => {
                if (mouseDownX !== 0) {
                    const moveX = Math.abs(e.clientX - mouseDownX);
                    const moveY = Math.abs(e.clientY - mouseDownY);
                    if (moveX > 5 || moveY > 5) {
                        isDragging = true;
                    }
                }

                // Update cursor based on position
                const rect = th.getBoundingClientRect();
                const edgeThreshold = 5;
                const isNearRightEdge = (e.clientX - rect.left) > (rect.width - edgeThreshold);
                th.style.cursor = isNearRightEdge ? 'col-resize' : 'pointer';
            });

            th.addEventListener('mouseup', (e) => {
                // Only sort if not dragging and not clicking on the resize edge
                const rect = th.getBoundingClientRect();
                const edgeThreshold = 5; // pixels from edge
                const isNearRightEdge = (e.clientX - rect.left) > (rect.width - edgeThreshold);

                if (!isDragging && !isNearRightEdge) {
                    sortTable(field, th);
                }

                mouseDownX = 0;
                mouseDownY = 0;
                isDragging = false;
            });
        } else {
            th.title = 'Layer file download';
            th.style.cursor = 'default';
        }
        
        headerRow.appendChild(th);

        // Add MAP (TIF download) header immediately after LYR
        if (field === 'LYR') {
            const mapTh = document.createElement('th');
            mapTh.className = 'map-col';
            mapTh.textContent = 'MAP';
            mapTh.title = 'Download map TIFF';
            headerRow.appendChild(mapTh);
        }
    });
    thead.appendChild(headerRow);
    tableHeadersGenerated = true;
}

function renderBatch(features) {
    const tbody = document.getElementById('table-body');
    const fragment = document.createDocumentFragment();
    const fields = getDisplayFields(features[0].properties);

    features.forEach(feature => {
        const tr = createRow(feature, fields);
        fragment.appendChild(tr);
    });
    
    tbody.appendChild(fragment);
}

function createRow(feature, fields) {
    const p = feature.properties;
    const tr = document.createElement('tr');
    const name = p.Name || '';
    tr.dataset.name = name;

    // Add checkbox column
    const checkboxTd = document.createElement('td');
    checkboxTd.className = 'checkbox-col';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'row-checkbox';
    checkbox.checked = selectedRows.has(name);
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation(); // Don't trigger row click
        handleRowCheckboxChange(name, checkbox.checked);
    });
    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);

    // Add eye (visibility) toggle cell
    const eyeTd = document.createElement('td');
    eyeTd.className = 'eye-col';
    const isHidden = hiddenSheets.has(name);
    eyeTd.innerHTML = isHidden
        ? '<svg class="eye-icon eye-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg class="eye-icon eye-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    if (isHidden) tr.classList.add('row-hidden-tile');
    eyeTd.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSheetVisibility(name, eyeTd, tr);
    });
    tr.appendChild(eyeTd);

    // Add zoom-to-sheet cell
    const zoomTd = document.createElement('td');
    zoomTd.className = 'zoom-col';
    zoomTd.innerHTML = '<button class="zoom-row-btn" title="Zoom to map sheet"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg></button>';
    zoomTd.addEventListener('click', (e) => {
        e.stopPropagation();
        if (feature.geometry) {
            selectAndIsolate(name, feature, true);
        } else {
            L.esri.query({ url: urls.footprints + '/0' })
                .where(`Name = '${name.replace(/'/g, "''")}'`)
                .returnGeometry(true)
                .run((error, featureCollection) => {
                    if (!error && featureCollection.features.length > 0) {
                        selectAndIsolate(name, featureCollection.features[0], true);
                    }
                });
        }
    });
    tr.appendChild(zoomTd);

    fields.forEach(field => {
        const td = document.createElement('td');
        td.setAttribute('data-field', field);
        let val = p[field];
        
        if (val === null || val === undefined) {
            val = '';
        } else if (typeof val === 'object') {
            val = JSON.stringify(val); 
        }

        // Render LYR field and insert MAP (TIF) download column immediately after it.
        if (field === 'LYR') {
            if (val) {
                const link = document.createElement('a');
                link.href = val;
                link.title = 'Download .lyr file for ArcGIS Pro';
                link.className = 'lyr-download-link';
                link.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                link.addEventListener('click', (e) => e.stopPropagation());
                td.appendChild(link);
            }

            td.style.whiteSpace = 'nowrap';
            tr.appendChild(td);

            const mapTd = document.createElement('td');
            mapTd.className = 'map-col';
            const tifUrl = p.TIF || '';
            if (tifUrl) {
                const mapLink = document.createElement('a');
                mapLink.href = tifUrl;
                mapLink.title = 'Download map TIFF';
                mapLink.className = 'map-download-link';
                mapLink.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 11v6"/><path d="M9.5 14.5 12 17l2.5-2.5"/></svg>';
                mapLink.addEventListener('click', (e) => e.stopPropagation());
                mapTd.appendChild(mapLink);
            }
            tr.appendChild(mapTd);
            return;
        }

        td.textContent = val;
        
        // Allow wrapping for TITLE field, keep nowrap for others
        if (field !== 'TITLE') {
            td.style.whiteSpace = 'nowrap';
        }
        
        tr.appendChild(td);
    });
    
    tr.addEventListener('click', (e) => {
        // Don't trigger if clicking checkbox
        if (e.target.type === 'checkbox') return;
        
        // Fetch geometry on demand
        if (feature.geometry) {
            selectAndIsolate(name, feature);
        } else {
            L.esri.query({ url: urls.footprints + '/0' })
                .where(`Name = '${name.replace(/'/g, "''")}'`)
                .returnGeometry(true)
                .run((error, featureCollection) => {
                    if (!error && featureCollection.features.length > 0) {
                        selectAndIsolate(name, featureCollection.features[0]);
                    } else {
                        selectAndIsolate(name, feature);
                    }
                });
        }
    });
    
    return tr;
}

// Sorting state
let currentSortField = null;
let currentSortOrder = 'asc'; // 'asc' or 'desc'

function sortTable(field, headerElement) {
    const tbody = document.getElementById('table-body');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Toggle sort order if clicking the same column
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    
    // Get field index from header
    const headers = Array.from(document.querySelectorAll('#table-head th'));
    const fieldIndex = headers.findIndex(th => th.textContent.includes(field));
    
    // Sort rows
    rows.sort((a, b) => {
        const aVal = a.children[fieldIndex]?.textContent || '';
        const bVal = b.children[fieldIndex]?.textContent || '';
        
        // Try numeric comparison first
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
            return currentSortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // Fall back to string comparison
        const comparison = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return currentSortOrder === 'asc' ? comparison : -comparison;
    });
    
    // Update sort indicators
    headers.forEach(th => {
        const indicator = th.querySelector('span');
        if (indicator) {
            if (th === headerElement) {
                indicator.textContent = currentSortOrder === 'asc' ? '\u25b2' : '\u25bc';
                indicator.style.color = '#3b82f6';
            } else {
                indicator.textContent = '\u21c5';
                indicator.style.color = '#94a3b8';
            }
        }
    });
    
    // Re-append sorted rows
    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.appendChild(row));
    tbody.appendChild(fragment);
}

function finalizeLoading() {
    isFetching = false;
    const countSpan = document.getElementById('table-count');
    countSpan.textContent = `(Deduplicating ${totalRecordsLoaded} records...)`;
    
    // Deduplicate by base name (group -l1, -l2, -l3, -l4 together)
    const baseNameMap = new Map();
    allLoadedFeatures.forEach(feature => {
        const baseName = getBaseName(feature.properties.Name || '');
        if (!baseNameMap.has(baseName)) {
            baseNameMap.set(baseName, feature);
        }
    });
    
    const uniqueFeatures = Array.from(baseNameMap.values());
    
    countSpan.textContent = `(Sorting ${uniqueFeatures.length} unique sheets...)`;
    
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    uniqueFeatures.sort((a, b) => {
        const nameA = getBaseName(a.properties.Name || '');
        const nameB = getBaseName(b.properties.Name || '');
        return collator.compare(nameA, nameB);
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    if (uniqueFeatures.length > 0) {
         const fields = getDisplayFields(uniqueFeatures[0].properties);
         
         let i = 0;
         const chunk = 1000; // Increased for faster rendering
         function renderChunk() {
             const fragment = document.createDocumentFragment();
             const limit = Math.min(i + chunk, uniqueFeatures.length);
             for (; i < limit; i++) {
                 fragment.appendChild(createRow(uniqueFeatures[i], fields));
             }
             tbody.appendChild(fragment);
             
             if (i < uniqueFeatures.length) {
                 requestAnimationFrame(renderChunk);
                 countSpan.textContent = `(Loading ${i}/${uniqueFeatures.length} sheets...)`;
             } else {
                 countSpan.textContent = `(${uniqueFeatures.length} sheets loaded)`;
             }
         }
         renderChunk();
    } else {
         countSpan.textContent = `(0 records loaded)`;
    }
}

// --- 11. Table Search/Filter Functionality ---
let currentTableFilter = '';
let extentFilterEnabled = false; // Track whether extent-based filtering is enabled

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const tableSearchInput = document.getElementById('table-search-input');
const clearTableFilterBtn = document.getElementById('clear-table-filter');
const extentFilterBtn = document.getElementById('extent-filter-btn');

// Debounced filter function
const performTableFilter = debounce((filterText) => {
    currentTableFilter = filterText.toLowerCase().trim();
    
    if (currentTableFilter.length === 0) {
        clearTableFilterBtn.style.display = 'none';
        applyTableFilter();
        return;
    }
    
    clearTableFilterBtn.style.display = 'block';
    applyTableFilter();
}, 300);

// Apply the filter to table rows and footprints
function applyTableFilter() {
    const tbody = document.getElementById('table-body');
    const rows = tbody.querySelectorAll('tr');
    const countSpan = document.getElementById('table-count');
    
    if (!currentTableFilter) {
        // Show all rows
        rows.forEach(row => row.style.display = '');
        
        // Reset footprints filter to default -l4 only
        footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
        
        // Update count
        const visibleCount = rows.length;
        const extentNote = extentFilterEnabled ? ' in view' : '';
        countSpan.textContent = totalRecordsLoaded > 0 
            ? `(${visibleCount} unique sheets, ${totalRecordsLoaded} total tiles)`
            : `(${visibleCount} unique sheets${extentNote})`;
        return;
    }
    
    // Filter rows and collect matching sheet names
    let visibleCount = 0;
    const matchingNames = [];
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        let rowText = '';
        
        // Build searchable text from all cells
        cells.forEach(cell => {
            rowText += cell.textContent.toLowerCase() + ' ';
        });
        
        // Check if filter matches
        if (rowText.includes(currentTableFilter)) {
            row.style.display = '';
            visibleCount++;
            
            // Get the base name for this row to filter footprints
            const name = row.dataset.name;
            if (name) {
                const baseName = getBaseName(name);
                if (baseName && !matchingNames.includes(baseName)) {
                    matchingNames.push(baseName);
                }
            }
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update footprints layer to show only matching sheets
    if (matchingNames.length > 0) {
        // Build SQL where clause to match any of the filtered sheets
        const nameConditions = matchingNames.map(name => {
            const sqlSafeName = name.replace(/'/g, "''");
            return `Name LIKE '${sqlSafeName}%'`;
        }).join(' OR ');
        
        footprintsLayer.setLayerDefs({ 0: `(${nameConditions})` });
    } else {
        // No matches - hide all footprints
        footprintsLayer.setLayerDefs({ 0: "1=0" });
    }
    
    // Update count display
    countSpan.textContent = totalRecordsLoaded > 0
        ? `(${visibleCount} of ${rows.length} sheets match filter)`
        : `(${visibleCount} sheets match filter)`;
}

// Event listeners for table search
tableSearchInput.addEventListener('input', (e) => {
    performTableFilter(e.target.value);
});

clearTableFilterBtn.addEventListener('click', () => {
    tableSearchInput.value = '';
    currentTableFilter = '';
    clearTableFilterBtn.style.display = 'none';
    applyTableFilter();
});

// Handle extent filter button toggle
extentFilterBtn.addEventListener('click', () => {
    extentFilterEnabled = !extentFilterEnabled;
    const countSpan = document.getElementById('table-count');
    
    if (extentFilterEnabled) {
        // Enable extent filtering - clear selection filter if active
        if (filteredBySelection) {
            filteredBySelection = false;
            selectedRows.clear();
            updateMultiSelectUI();
        }
        
        extentFilterBtn.classList.add('active');
        extentFilterBtn.title = 'Following map - table updates with visible extent';
        countSpan.textContent = '(Switching to extent-based view...)';
        loadVisibleFeatures();
    } else {
        // Disable extent filtering - restore full map view
        extentFilterBtn.classList.remove('active');
        extentFilterBtn.title = 'Filter table to the visible extent';
        
        // Reset map filters - but respect active selection filter
        if (filteredBySelection && selectedRows.size > 0) {
            const names = Array.from(selectedRows);
            const whereClause = names.map(n => `Name = '${n.replace(/'/g, "''")}'`).join(' OR ');
            const fullClause = `(${whereClause}) AND Name LIKE '%-l4'`;
            footprintsLayer.setLayerDefs({ 0: fullClause });
        } else {
            footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
        }
        geologyLayer.setMosaicRule({ mosaicMethod: 'esriMosaicClosestToCenter' });
        
        // Keep current records but update message
        if (totalRecordsLoaded === 0) {
            countSpan.textContent = '(Loading data...)';
        } else {
            const tbody = document.getElementById('table-body');
            const rows = tbody.querySelectorAll('tr');
            const visibleRows = Array.from(rows).filter(r => r.style.display !== 'none');
            countSpan.textContent = currentTableFilter 
                ? `(${visibleRows.length} of ${rows.length} sheets match filter)`
                : filteredBySelection
                ? `(${selectedRows.size} sheets filtered)`
                : `(${rows.length} sheets loaded)`;
        }
    }
});

// Update table when map is moved or zoomed (only if extent filter is enabled)
let updateTimeout;
map.on('moveend', function() {
    if (!extentFilterEnabled) return; // Skip if extent filtering is disabled
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        loadVisibleFeatures();
    }, 500); // Debounce to avoid too many requests
});

// --- Multi-select functionality ---
function handleSelectAll(e) {
    const isChecked = e.target.checked;
    const tbody = document.getElementById('table-body');
    const visibleRows = Array.from(tbody.querySelectorAll('tr')).filter(row => {
        return row.style.display !== 'none';
    });
    
    visibleRows.forEach(row => {
        const name = row.dataset.name;
        const checkbox = row.querySelector('.row-checkbox');
        if (checkbox) {
            checkbox.checked = isChecked;
            if (isChecked) {
                selectedRows.add(name);
            } else {
                selectedRows.delete(name);
            }
        }
    });
    
    updateMultiSelectUI();
}

function handleRowCheckboxChange(name, isChecked) {
    if (isChecked) {
        selectedRows.add(name);
    } else {
        selectedRows.delete(name);
    }

    // Update imagery based on new selection state
    applySelectionMosaic();

    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const tbody = document.getElementById('table-body');
    const visibleRows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.style.display !== 'none');
    const visibleChecked = visibleRows.filter(row => {
        const checkbox = row.querySelector('.row-checkbox');
        return checkbox && checkbox.checked;
    });
    
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = visibleRows.length > 0 && visibleChecked.length === visibleRows.length;
        selectAllCheckbox.indeterminate = visibleChecked.length > 0 && visibleChecked.length < visibleRows.length;
    }
    
    updateMultiSelectUI();
}

function updateMultiSelectUI() {
    const filterBtn = document.getElementById('filter-selected-btn');
    const clearFilterBtn = document.getElementById('clear-filter-selected-btn');
    
    if (filterBtn) {
        filterBtn.disabled = selectedRows.size === 0;
    }
    
    if (clearFilterBtn) {
        clearFilterBtn.style.display = filteredBySelection ? 'flex' : 'none';
    }
}

// --- Per-row tile visibility toggle ---
function toggleSheetVisibility(name, eyeTd, tr) {
    if (hiddenSheets.has(name)) {
        hiddenSheets.delete(name);
        eyeTd.innerHTML = '<svg class="eye-icon eye-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        tr.classList.remove('row-hidden-tile');
    } else {
        hiddenSheets.add(name);
        eyeTd.innerHTML = '<svg class="eye-icon eye-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        tr.classList.add('row-hidden-tile');
    }
    refreshMosaicFromVisibility();
}

function refreshMosaicFromVisibility() {
    if (hiddenSheets.size === 0) {
        // No hidden sheets — restore based on current filter state
        if (filteredBySelection && selectedRows.size > 0) {
            const names = Array.from(selectedRows);
            const whereClause = names.map(n => `Name = '${n.replace(/'/g, "''")}'`).join(' OR ');
            const fullClause = `(${whereClause}) AND Name LIKE '%-l4'`;
            applyGeologyMosaic(buildGeologyWhereForSheetNames(names));
            footprintsLayer.setLayerDefs({ 0: fullClause });
        } else {
            applyGeologyMosaic();
            footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
        }
        return;
    }

    // Build exclusion clause
    const hiddenClause = Array.from(hiddenSheets).map(n => `Name <> '${n.replace(/'/g, "''")}'`).join(' AND ');

    if (filteredBySelection && selectedRows.size > 0) {
        const visibleNames = Array.from(selectedRows).filter(n => !hiddenSheets.has(n));
        if (visibleNames.length === 0) {
            applyGeologyMosaic('1=0');
            footprintsLayer.setLayerDefs({ 0: "1=0" });
        } else {
            const whereClause = visibleNames.map(n => `Name = '${n.replace(/'/g, "''")}'`).join(' OR ');
            const fullClause = `(${whereClause}) AND Name LIKE '%-l4'`;
            applyGeologyMosaic(buildGeologyWhereForSheetNames(visibleNames));
            footprintsLayer.setLayerDefs({ 0: fullClause });
        }
    } else {
        const fullClause = `(${hiddenClause}) AND Name LIKE '%-l4'`;
        const hiddenBaseClause = Array.from(new Set(Array.from(hiddenSheets).map(getBaseName).filter(Boolean)))
            .map(base => `Name NOT LIKE '${escapeSql(base)}-l%'`)
            .join(' AND ');
        applyGeologyMosaic(hiddenBaseClause || null);
        footprintsLayer.setLayerDefs({ 0: fullClause });
    }
}

// Filter Selected button
const filterSelectedBtn = document.getElementById('filter-selected-btn');
if (filterSelectedBtn) {
    filterSelectedBtn.addEventListener('click', () => {
        if (selectedRows.size === 0) return;
        
        filteredBySelection = true;
        const tbody = document.getElementById('table-body');
        const rows = tbody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const name = row.dataset.name;
            if (selectedRows.has(name)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
        
        // Update footprints and geology layers to show only selected (and visible) features
        // applySelectionMosaic handles both imagery and footprints now that filteredBySelection=true
        applySelectionMosaic();
        
        // Update count
        const countSpan = document.getElementById('table-count');
        if (countSpan) {
            countSpan.textContent = `(${selectedRows.size} sheets filtered)`;
        }
        
        updateMultiSelectUI();
        showNotification(`Filtered to ${selectedRows.size} selected sheets`);
    });
}

// Clear Filter button
const clearFilterSelectedBtn = document.getElementById('clear-filter-selected-btn');
if (clearFilterSelectedBtn) {
    clearFilterSelectedBtn.addEventListener('click', () => {
        filteredBySelection = false;
        
        // Show all rows
        const tbody = document.getElementById('table-body');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            row.style.display = '';
            row.classList.remove('row-hidden-tile');
            const eyeTd = row.querySelector('.eye-col');
            if (eyeTd) {
                eyeTd.innerHTML = '<svg class="eye-icon eye-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            }
        });
        
        // Reset hidden sheets
        hiddenSheets.clear();

        // Clear active highlight
        activeHighlightName = null;
        currentlySelectedFeature = null;
        currentlySelectedName = null;
        rows.forEach(row => row.classList.remove('active-row'));

        // Clear selections
        selectedRows.clear();
        rows.forEach(row => {
            const checkbox = row.querySelector('.row-checkbox');
            if (checkbox) checkbox.checked = false;
        });

        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }

        // Hide imagery — nothing is selected, back to default state
        if (map.hasLayer(geologyLayer)) {
            map.removeLayer(geologyLayer);
        }
        const layerToggle = document.getElementById('layer-toggle');
        if (layerToggle) layerToggle.checked = false;

        // Reset footprints to show all sheets
        footprintsLayer.setLayerDefs({ 0: "Name LIKE '%-l4'" });
        
        // Update count
        const countSpan = document.getElementById('table-count');
        if (countSpan) {
            countSpan.textContent = `(${rows.length} sheets loaded)`;
        }
        
        updateMultiSelectUI();
        showNotification('Filter cleared');
    });
}

// --- 11. Resizable Logic (Row - Map/Table split) ---
const handle = document.getElementById('resize-handle');
const mapContainer = document.getElementById('map-container');
const tableContainer = document.getElementById('table-container');
const contentWrapper = document.getElementById('content-wrapper');

let isDragging = false;

handle.addEventListener('mousedown', function(e) {
    isDragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;

    const wrapperRect = contentWrapper.getBoundingClientRect();
    let newMapHeight = e.clientY - wrapperRect.top;
    
    const minHeight = 100;
    const maxMapHeight = wrapperRect.height - minHeight - handle.offsetHeight;
    
    if (newMapHeight < minHeight) newMapHeight = minHeight;
    if (newMapHeight > maxMapHeight) newMapHeight = maxMapHeight;
    
    const newTableHeight = wrapperRect.height - newMapHeight - handle.offsetHeight;

    mapContainer.style.flexGrow = '0';
    mapContainer.style.height = newMapHeight + 'px';
    
    tableContainer.style.height = newTableHeight + 'px';
    
    map.invalidateSize();
});

document.addEventListener('mouseup', function() {
    if (isDragging) {
        isDragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        map.invalidateSize();
    }
});

// --- 12. Column Resizing Logic ---
let resizingColumn = null;
let startX = 0;
let startWidth = 0;

// Add resize functionality to table headers
document.addEventListener('mousedown', function(e) {
    const th = e.target.closest('th');
    if (!th || th.classList.contains('checkbox-col')) return;
    
    const rect = th.getBoundingClientRect();
    const offsetX = e.clientX - rect.right;
    
    // Check if mouse is near the right edge (within 6px)
    if (offsetX >= -6 && offsetX <= 0) {
        e.preventDefault();
        resizingColumn = th;
        startX = e.clientX;
        startWidth = th.offsetWidth;
        th.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }
});

document.addEventListener('mousemove', function(e) {
    // If resizing, adjust column width
    if (resizingColumn) {
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff); // Minimum width 50px
        
        // Set width on the header
        resizingColumn.style.width = newWidth + 'px';
        resizingColumn.style.minWidth = newWidth + 'px';
        resizingColumn.style.maxWidth = newWidth + 'px';
        return;
    }
    
    // Change cursor when hovering near column edge
    const th = e.target.closest('th');
    if (th && !th.classList.contains('checkbox-col')) {
        const rect = th.getBoundingClientRect();
        const offsetX = e.clientX - rect.right;
        
        if (offsetX >= -6 && offsetX <= 0) {
            document.body.style.cursor = 'col-resize';
        } else if (document.body.style.cursor === 'col-resize' && !resizingColumn) {
            document.body.style.cursor = '';
        }
    } else if (document.body.style.cursor === 'col-resize' && !resizingColumn) {
        document.body.style.cursor = '';
    }
});

document.addEventListener('mouseup', function() {
    if (resizingColumn) {
        resizingColumn.classList.remove('resizing');
        resizingColumn = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
});

// --- 13. Context Menu for Table Rows ---
const contextMenu = document.getElementById('row-context-menu');
const contextZoom = document.getElementById('context-zoom');
let contextMenuTarget = null;

// Show context menu on right-click on table rows
document.addEventListener('contextmenu', function(e) {
    // Check if right-click is on a table row
    const row = e.target.closest('#table-body tr');
    
    if (row) {
        e.preventDefault();
        contextMenuTarget = row;
        
        // Position the context menu at cursor
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
    } else {
        // Hide context menu if clicking elsewhere
        contextMenu.style.display = 'none';
        contextMenuTarget = null;
    }
});

// Handle context menu item clicks
contextZoom.addEventListener('click', function() {
    if (contextMenuTarget) {
        const name = contextMenuTarget.dataset.name;
        if (name) {
            // Check if this row is selected
            const isSelected = contextMenuTarget.classList.contains('active-row');
            
            if (isSelected && currentlySelectedName && currentlySelectedFeature) {
                // Use stored feature if available
                performZoomToSelected();
            } else {
                // Fetch geometry and zoom
                L.esri.query({ url: urls.footprints + '/0' })
                    .where(`Name = '${name.replace(/'/g, "''")}'`)
                    .returnGeometry(true)
                    .run((error, featureCollection) => {
                        if (!error && featureCollection.features.length > 0) {
                            const baseName = getBaseName(name);
                            performZoomToSelected(baseName, featureCollection.features[0]);
                        }
                    });
            }
        }
    }
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
});

// Hide context menu when clicking elsewhere
document.addEventListener('click', function(e) {
    if (!e.target.closest('.context-menu')) {
        contextMenu.style.display = 'none';
        contextMenuTarget = null;
    }
});

// --- 14. Initialization ---
// Auto-load all records on page load
setTimeout(() => {
    loadAttributes();
}, 500); // Small delay to ensure map is initialized
