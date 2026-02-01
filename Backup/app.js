// --- 1. Map Initialization ---
const map = L.map('map').setView([-41.2, 173], 6);

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
    useCors: false,
    format: 'png32',
    transparent: true,
    f: 'image',
    maxZoom: 18
}).addTo(map);

const geologyLayer = L.esri.imageMapLayer({
    url: urls.image,
    opacity: 0.8,
    attribution: 'GNS Science',
    format: 'jpgpng',
    compression: 75,
    maxZoom: 18
}).addTo(map);

// Set mosaic rule to let server choose appropriate tile level based on scale
// This allows all L1-L4 tiles to be visible, with the server selecting the best one
geologyLayer.setMosaicRule({
    mosaicMethod: 'esriMosaicClosestToCenter'
});

// Query object for footprints (needed early for zoom functions)
const footprintsQuery = L.esri.query({ url: urls.footprints + '/0' });

// --- 5. Loading Indicators ---
const loadingDiv = document.getElementById('loading');
const showLoading = (msg) => { loadingDiv.textContent = msg || 'Loading...'; loadingDiv.style.display = 'block'; };
const hideLoading = () => { loadingDiv.style.display = 'none'; };

geologyLayer.on('loading', () => showLoading('Loading Geology...'));
geologyLayer.on('load', hideLoading);
footprintsLayer.on('loading', () => showLoading('Loading Footprints...'));
footprintsLayer.on('load', hideLoading);

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
window.togglePanel = function() {
    panel.classList.toggle('minimized');
};

const resetBtn = document.getElementById('btn-reset');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

resetBtn.addEventListener('click', () => {
    showLoading('Clearing filters...');
    // Reset to default mosaic rule
    geologyLayer.setMosaicRule({
        mosaicMethod: 'esriMosaicClosestToCenter'
    });
    footprintsLayer.setLayerDefs({});
    
    resetBtn.style.display = 'none';
    searchInput.value = '';
    searchResults.style.display = 'none';
    map.closePopup();
    
    // Clear table selection
    document.querySelectorAll('#table-body tr').forEach(r => r.classList.remove('active-row'));
    
    setTimeout(hideLoading, 500);
});

// --- 7. Core Selection Logic ---
// Helper function to strip tile level suffix (e.g., "17834-l3" -> "17834")
function getBaseName(name) {
    if (!name) return '';
    return name.replace(/-l[1-4]$/i, '');
}

function selectAndIsolate(name, feature) {
    if (!name) return;
    const baseName = getBaseName(name);
    showLoading(`Isolating ${baseName}...`);
    resetBtn.style.display = 'block';
    searchResults.style.display = 'none';
    searchInput.value = baseName;

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

    // Filter - use base name pattern to match all levels
    const cleanBaseName = baseName.trim();
    const sqlSafeBaseName = cleanBaseName.replace(/'/g, "''");
    footprintsLayer.setLayerDefs({ 0: `Name LIKE '${sqlSafeBaseName}%'` });
    geologyLayer.setMosaicRule({ 
        mosaicMethod: 'esriMosaicClosestToCenter',
        where: `Name LIKE '${sqlSafeBaseName}%'` 
    });
    
    // Show preview panel with map information
    showPreviewPanel(feature || { properties: { Name: name } });
}

// Helper function to fetch geometry and zoom
function fetchAndZoom(baseName) {
    console.log('Fetching geometry for:', baseName);
    const sqlSafeBaseName = baseName.replace(/'/g, "''");
    footprintsQuery
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

// Function to show preview panel
function showPreviewPanel(feature) {
    const props = feature.properties || {};
    const previewPanel = document.getElementById('preview-panel');
    const sheetNo = document.getElementById('preview-sheet-no');
    const title = document.getElementById('preview-title');
    const downloadBtn = document.getElementById('download-btn');
    const previewImg = document.getElementById('preview-img');
    const previewPlaceholder = document.getElementById('preview-placeholder');
    
    const baseName = getBaseName(props.Name || '');
    const fullName = props.Name || '';
    
    // Set sheet number and title
    sheetNo.textContent = baseName || 'Unknown Sheet';
    title.textContent = props.TITLE || 'No title available';
    
    // Handle thumbnail - try THUMBNAIL field first, then generate from l4 tile
    if (props.THUMBNAIL) {
        previewImg.src = props.THUMBNAIL;
        previewImg.style.display = 'block';
        previewPlaceholder.style.display = 'none';
        previewImg.onerror = function() {
            // If THUMBNAIL fails, try generating from ImageServer
            generateThumbnailFromL4(fullName, previewImg, previewPlaceholder);
        };
    } else {
        // Generate thumbnail from ImageServer using l4 tile
        generateThumbnailFromL4(fullName, previewImg, previewPlaceholder);
    }
    
    // Handle download button
    if (props.TIF) {
        downloadBtn.style.display = 'flex';
        downloadBtn.onclick = function() {
            window.open(props.TIF, '_blank');
        };
    } else {
        downloadBtn.style.display = 'none';
    }
    
    // Show the panel
    previewPanel.style.display = 'block';
}

// Function to generate thumbnail from l4 tile
function generateThumbnailFromL4(name, imgElement, placeholderElement) {
    if (!name) {
        imgElement.style.display = 'none';
        placeholderElement.style.display = 'block';
        return;
    }
    
    placeholderElement.textContent = 'Loading preview...';
    placeholderElement.style.display = 'block';
    imgElement.style.display = 'none';
    
    const baseName = getBaseName(name);
    const l4Name = baseName + '-l4';
    
    // First, get the geometry of the l4 tile
    footprintsQuery
        .where(`Name = '${l4Name.replace(/'/g, "''")}'`)
        .returnGeometry(true)
        .run((error, featureCollection) => {
            if (error || !featureCollection.features || featureCollection.features.length === 0) {
                // Try with base name if l4 specific doesn't exist
                footprintsQuery
                    .where(`Name LIKE '${baseName.replace(/'/g, "''")}%'`)
                    .returnGeometry(true)
                    .limit(1)
                    .run((error2, featureCollection2) => {
                        if (error2 || !featureCollection2.features || featureCollection2.features.length === 0) {
                            imgElement.style.display = 'none';
                            placeholderElement.textContent = 'No preview available';
                            placeholderElement.style.display = 'block';
                            return;
                        }
                        exportImageFromBounds(featureCollection2.features[0], imgElement, placeholderElement, baseName);
                    });
                return;
            }
            
            exportImageFromBounds(featureCollection.features[0], imgElement, placeholderElement, l4Name);
        });
}

// Function to export image using feature bounds
function exportImageFromBounds(feature, imgElement, placeholderElement, tileName) {
    if (!feature.geometry) {
        imgElement.style.display = 'none';
        placeholderElement.textContent = 'No preview available';
        placeholderElement.style.display = 'block';
        return;
    }
    
    // Calculate bounds from geometry - handle both Esri and GeoJSON formats
    let coords;
    if (feature.geometry.rings) {
        // Esri format
        coords = feature.geometry.rings[0];
    } else if (feature.geometry.coordinates) {
        // GeoJSON format
        coords = feature.geometry.coordinates[0];
    } else {
        imgElement.style.display = 'none';
        placeholderElement.textContent = 'Invalid geometry format';
        placeholderElement.style.display = 'block';
        return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    coords.forEach(coord => {
        minX = Math.min(minX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxX = Math.max(maxX, coord[0]);
        maxY = Math.max(maxY, coord[1]);
    });
    
    // Get spatial reference from geometry (default to 4326 if not specified)
    const spatialRef = feature.geometry.spatialReference || { wkid: 4326 };
    const srValue = spatialRef.wkid || spatialRef.latestWkid || 4326;
    
    // Calculate bounds with padding to show full map image
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Add 10% buffer around the bounds to ensure full image is visible
    const bufferX = width * 0.1;
    const bufferY = height * 0.1;
    
    const paddedMinX = minX - bufferX;
    const paddedMaxX = maxX + bufferX;
    const paddedMinY = minY - bufferY;
    const paddedMaxY = maxY + bufferY;
    
    // Calculate aspect ratio from padded bounds
    const paddedWidth = paddedMaxX - paddedMinX;
    const paddedHeight = paddedMaxY - paddedMinY;
    const aspectRatio = paddedWidth / paddedHeight;
    
    // Set thumbnail dimensions while maintaining aspect ratio
    const thumbnailWidth = 290;
    const thumbnailHeight = Math.round(thumbnailWidth / aspectRatio);
    
    // Build export URL with padded bbox to show full map image
    const bboxString = `${paddedMinX},${paddedMinY},${paddedMaxX},${paddedMaxY}`;
    
    // Use where clause to filter to exact tile name
    const sqlSafeTileName = tileName.replace(/'/g, "''");
    const thumbnailUrl = `${urls.image}/exportImage?` +
        `bbox=${bboxString}` +
        `&bboxSR=${srValue}` +
        `&size=${thumbnailWidth},${thumbnailHeight}` +
        `&imageSR=${srValue}` +
        `&format=png` +
        `&transparent=false` +
        `&mosaicRule=${encodeURIComponent(JSON.stringify({
            mosaicMethod: 'esriMosaicLockRaster',
            lockRasterIds: [],
            where: `Name = '${sqlSafeTileName}'`
        }))}` +
        `&f=image`;
    
    imgElement.src = thumbnailUrl;
    imgElement.style.display = 'block';
    placeholderElement.style.display = 'none';
    
    imgElement.onerror = function() {
        imgElement.style.display = 'none';
        placeholderElement.textContent = 'Preview not available';
        placeholderElement.style.display = 'block';
    };
}

// Function to close preview panel
window.closePreview = function() {
    document.getElementById('preview-panel').style.display = 'none';
}

// --- 8. Search Implementation ---
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const performSearch = debounce((text) => {
    if (!text || text.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    console.log('Searching for:', text);

    // Always use server search for consistency and to ensure we get geometry
    const sqlSafeText = text.replace(/'/g, "''");
    
    // Build a more flexible search query
    // Search in Name (base name without -l1,-l2 etc) and TITLE fields
    const whereClause = `UPPER(Name) LIKE UPPER('%${sqlSafeText}%') OR UPPER(TITLE) LIKE UPPER('%${sqlSafeText}%')`;
    
    footprintsQuery
        .where(whereClause)
        .returnGeometry(true)
        .limit(50)  // Increase limit to get more results before deduplication
        .run((error, featureCollection) => {
            if (error) { 
                console.error('Search error:', error); 
                renderSearchResults({ features: [] });
                return; 
            }
            
            console.log('Search returned:', featureCollection.features ? featureCollection.features.length : 0, 'features');
            
            // Deduplicate by base name
            if (featureCollection.features && featureCollection.features.length > 0) {
                const baseNameMap = new Map();
                featureCollection.features.forEach(f => {
                    const baseName = getBaseName(f.properties.Name || '');
                    if (!baseNameMap.has(baseName)) {
                        baseNameMap.set(baseName, f);
                    }
                });
                
                const uniqueFeatures = Array.from(baseNameMap.values()).slice(0, 20);
                renderSearchResults({ features: uniqueFeatures });
            } else {
                renderSearchResults(featureCollection);
            }
        });
}, 300);

function renderSearchResults(featureCollection) {
    searchResults.innerHTML = '';
    searchResults.style.display = 'block';
    
    const features = featureCollection.features || [];

    if (features.length === 0) {
        const div = document.createElement('div');
        div.className = 'result-item no-result';
        div.textContent = "No map sheets found matching that name.";
        searchResults.appendChild(div);
        return;
    }

    features.forEach(feature => {
        const props = feature.properties;
        const fullName = props.Name || "Unknown Map";
        const title = props.TITLE || "";
        const displayName = getBaseName(fullName);
        
        const div = document.createElement('div');
        div.className = 'result-item';
        
        // Show both sheet number and title if title exists
        if (title) {
            div.innerHTML = `<strong>${displayName}</strong><br><span style="font-size: 11px; color: #64748b;">${title}</span>`;
        } else {
            div.textContent = displayName;
        }
        
        div.addEventListener('click', () => selectAndIsolate(fullName, feature));
        searchResults.appendChild(div);
    });
}

searchInput.addEventListener('input', (e) => performSearch(e.target.value));
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) searchResults.style.display = 'none';
});

// --- 9. Map Click Interaction ---
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
        selectAndIsolate(props.Name, window.lastClickedFeature);
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
            
            countSpan.textContent = `(${totalRecordsLoaded} features in view)`;
        });
}

function renderVisibleFeatures() {
    const tbody = document.getElementById('table-body');
    const fragment = document.createDocumentFragment();
    
    if (allLoadedFeatures.length === 0) return;
    
    const fields = Object.keys(allLoadedFeatures[0].properties);
    
    allLoadedFeatures.forEach(feature => {
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
    
    countSpan.textContent = '(Starting fetch...)';
    
    function fetchBatch(offset) {
        countSpan.textContent = `(Fetching records ${offset} to ${offset + BATCH_SIZE}...)`;

        footprintsQuery
            .where("1=1")
            .orderBy('Name', 'ASC') 
            .limit(BATCH_SIZE)
            .offset(offset)
            .returnGeometry(false)
            .run((error, featureCollection) => {
                if (error) {
                    console.error("Fetch error", error);
                    isFetching = false;
                    countSpan.textContent = `(Error: ${error.message} - Loaded ${totalRecordsLoaded})`;
                    
                    if (totalRecordsLoaded === 0) {
                        tbody.innerHTML = '<tr><td colspan="100%" style="color:red; text-align:center; padding:20px;">Error loading data.</td></tr>';
                    }
                    return;
                }

                const batchCount = featureCollection.features.length;
                
                if (batchCount === 0) {
                    finalizeLoading();
                    return;
                }

                allLoadedFeatures = allLoadedFeatures.concat(featureCollection.features);
                totalRecordsLoaded += batchCount;

                if (!tableHeadersGenerated && batchCount > 0) {
                    generateTableHeaders(featureCollection.features[0]);
                }

                renderBatch(featureCollection.features);

                if (batchCount === BATCH_SIZE) {
                    fetchBatch(offset + BATCH_SIZE);
                } else {
                    finalizeLoading();
                }
            });
    }
    fetchBatch(0);
}

function generateTableHeaders(feature) {
    const thead = document.getElementById('table-head');
    const fields = Object.keys(feature.properties);
    
    const headerRow = document.createElement('tr');
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        th.style.whiteSpace = 'nowrap'; 
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tableHeadersGenerated = true;
}

function renderBatch(features) {
    const tbody = document.getElementById('table-body');
    const fragment = document.createDocumentFragment();
    const fields = Object.keys(features[0].properties);

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

    fields.forEach(field => {
        const td = document.createElement('td');
        let val = p[field];
        
        if (val === null || val === undefined) {
            val = '';
        } else if (typeof val === 'object') {
            val = JSON.stringify(val); 
        }
        
        td.textContent = val;
        td.style.whiteSpace = 'nowrap'; 
        tr.appendChild(td);
    });
    
    tr.addEventListener('click', () => {
        // Fetch geometry on demand
        if (feature.geometry) {
            selectAndIsolate(name, feature);
        } else {
            footprintsQuery
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

function finalizeLoading() {
    isFetching = false;
    const countSpan = document.getElementById('table-count');
    countSpan.textContent = `(Sorting ${totalRecordsLoaded} records...)`;
    
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    allLoadedFeatures.sort((a, b) => {
        const nameA = a.properties.Name || '';
        const nameB = b.properties.Name || '';
        return collator.compare(nameA, nameB);
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    if (allLoadedFeatures.length > 0) {
         const fields = Object.keys(allLoadedFeatures[0].properties);
         let i = 0;
         const chunk = 500;
         function renderChunk() {
             const fragment = document.createDocumentFragment();
             const limit = Math.min(i + chunk, allLoadedFeatures.length);
             for (; i < limit; i++) {
                 fragment.appendChild(createRow(allLoadedFeatures[i], fields));
             }
             tbody.appendChild(fragment);
             
             if (i < allLoadedFeatures.length) {
                 requestAnimationFrame(renderChunk);
                 countSpan.textContent = `(Rendering sorted table ${i}/${totalRecordsLoaded}...)`;
             } else {
                 countSpan.textContent = `(${totalRecordsLoaded} total records loaded)`;
             }
         }
         renderChunk();
    } else {
         countSpan.textContent = `(0 records loaded)`;
    }
}

// Auto-load visible features after a short delay to ensure map is fully loaded
setTimeout(function() {
    loadVisibleFeatures();
}, 1000);

// Update table when map is moved or zoomed
let updateTimeout;
map.on('moveend', function() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        loadVisibleFeatures();
    }, 500); // Debounce to avoid too many requests
});

map.on('zoomend', function() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        loadVisibleFeatures();
    }, 500);
});

// --- 11. Resizable Logic ---
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
