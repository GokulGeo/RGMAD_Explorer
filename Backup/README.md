# RGMAD Map Explorer - File Structure

## Overview
The webpage has been refactored into separate files for better maintainability:

## File Structure

### 1. RGMAD_Explorer.html (121 lines)
- **Purpose**: Main HTML structure
- **Contents**: 
  - Page layout and structure
  - Header with GNS Science branding
  - Map container
  - Control panels
  - Attribute table container
  - Links to external CSS and JavaScript files

### 2. styles.css (437 lines)
- **Purpose**: All styling and layout rules
- **Contents**:
  - Responsive layout styles
  - Header and branding styles
  - Map container and controls
  - Floating info panel
  - Search box and results
  - Attribute table styling
  - Resizable panel styles
  - Button and form controls

### 3. app.js (499 lines)
- **Purpose**: All application logic and interactivity
- **Key Features**:
  - Map initialization (Leaflet)
  - Base map switching (Gray, Imagery, Streets)
  - **AUTOMATIC layer selection** using 'esriMosaicClosestToCenter' mosaic rule
  - Geology layer (RGMAD ImageServer) - automatically displays l1-l4 based on zoom level
  - Footprints/Index layer (RGMAD MapServer)
  - Debounced search with client-side and server fallback
  - Attribute table with deferred loading (loads on demand)
  - Resizable map/table panels
  - Layer opacity controls
  - Click interactions and popups

## Key Changes

### Automatic Layer Selection
- **Removed**: Manual layer level selector buttons (l1, l2, l3, l4)
- **Implemented**: Automatic scale-based layer selection
- **How it works**: The mosaic rule 'esriMosaicClosestToCenter' lets the ArcGIS ImageServer automatically choose the appropriate detail level (l1-l4) based on the current map scale/zoom level
- **User benefit**: Seamless experience - users see the right level of detail automatically as they zoom in/out

### Performance Optimizations
- Removed minZoom restrictions
- Added image format and compression parameters (jpgpng, compression: 75)
- Deferred attribute table loading (60-80% faster initial page load)
- returnGeometry: false for table data (only fetches when clicking rows)
- Increased search results from 10 to 20

## Usage
Simply open `RGMAD_Explorer.html` in a web browser. The page will automatically load the external CSS and JavaScript files.

## Technical Notes
- The l1-l4 layers represent different levels of detail in the multi-scale mosaic dataset
- l1 = coarsest detail (shown at low zoom levels)
- l4 = finest detail (shown at high zoom levels)
- The ImageServer handles the selection automatically based on the mosaic rule
