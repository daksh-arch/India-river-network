import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import './App.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from "pmtiles";

// Watershed categories grouped by geography
const watershedCategories = {
  "Himalayan Rivers": [
    "Ganga",
    "Indus (Up to border)",
    "Brahamaputra",
    "Barak and Others"
  ],
  "Peninsular Rivers": [
    "Godavari",
    "Krishna",
    "Cauvery",
    "Mahanadi",
    "Narmada",
    "Tapi",
    "Pennar",
    "Brahmani and Baitarni",
    "Subernarekha",
    "Mahi",
    "Sabarmati"
  ],
  "Coastal Rivers": [ // Renamed from "Coastal & Regional"
    "East flowing rivers between Mahanadi and Pennar",
    "East flowing rivers between Pennar and Kanyakumari",
    "West flowing rivers from Tadri to Kanyakumari",
    "West flowing rivers from Tapi to Tadri"
  ],
  "Rajasthan & Gujarat": [ // New category
    "West flowing rivers of Kutch and Saurashtra including Luni",
    "Area of Inland drainage in Rajasthan"
  ]
};

// Flat list of all watershed names (for filtering)
const watershedNames = Object.values(watershedCategories).flat();

// Global timestamp bounds (full data range)
const GLOBAL_MIN_TIMESTAMP = 1704067260;
const GLOBAL_MAX_TIMESTAMP = 1704372500;

// IntroScreen Component
function IntroScreen({ onEnter, isMapReady }) {
  return (
    <div className="intro-screen">
      <div className="intro-content">
        <h1 className="intro-title">India River Network</h1>
        <p className="intro-description">
          An animated visualization of India's river systems flowing from their
          mountain sources to the ocean.
        </p>

        <div className="intro-instructions">
          <div className="instruction-item">
            <span className="instruction-icon">▶</span>
            <span>Animation plays automatically — scrub the timeline to explore</span>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">
              <span className="icon-layers-mini">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </span>
            <span>Toggle watersheds to explore different drainage basins</span>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">?</span>
            <span>Click info for legend and data sources</span>
          </div>
        </div>

        <button
          className={`intro-cta ${isMapReady ? 'ready' : ''}`}
          onClick={onEnter}
          disabled={!isMapReady}
        >
          {isMapReady ? 'View Map' : (
            <>
              <span className="loading-river"></span>
              Loading Map
            </>
          )}
        </button>
      </div>

      <div className="intro-footer">
        <span>Data: HydroRIVERS & HydroBASINS</span>
      </div>
    </div>
  );
}

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(79);
  const [lat] = useState(22.5);
  const [zoom] = useState(4);

  // Intro screen state
  const [isIntroVisible, setIsIntroVisible] = useState(true);
  const [hasEnteredMap, setHasEnteredMap] = useState(false);

  // Dynamic timestamp range based on selected watersheds
  const [minTimestamp, setMinTimestamp] = useState(GLOBAL_MIN_TIMESTAMP);
  const [maxTimestamp, setMaxTimestamp] = useState(GLOBAL_MAX_TIMESTAMP);
  const [timeValue, setTimeValue] = useState(GLOBAL_MIN_TIMESTAMP);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCalculatingRange, setIsCalculatingRange] = useState(false);
  const [selectedWatersheds, setSelectedWatersheds] = useState(watershedNames);
  const [hoveredWatershed, setHoveredWatershed] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  // UI State
  const [isWatershedDrawerOpen, setIsWatershedDrawerOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [showWatershedPulse, setShowWatershedPulse] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState([]); // All collapsed by default

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Toggle all watersheds in a category
  const toggleCategoryWatersheds = (category, e) => {
    e.stopPropagation();
    const categoryWatersheds = watershedCategories[category];
    const allSelected = categoryWatersheds.every(w => selectedWatersheds.includes(w));

    if (allSelected) {
      // Deselect all in this category
      setSelectedWatersheds(prev => prev.filter(w => !categoryWatersheds.includes(w)));
    } else {
      // Select all in this category
      setSelectedWatersheds(prev => [...new Set([...prev, ...categoryWatersheds])]);
    }
  };

  // Tooltip state for river click
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, text: '' });

  // Handle entering the map from intro screen
  const handleEnterMap = useCallback(() => {
    setIsIntroVisible(false);
    setHasEnteredMap(true);
    // Start animation after a brief delay
    setTimeout(() => {
      setIsPlaying(true);
      // Show watershed pulse after animation completes (15 seconds)
      setTimeout(() => {
        setShowWatershedPulse(true);
        // Hide pulse after 6 seconds (4 complete 1.5s pulse cycles)
        setTimeout(() => setShowWatershedPulse(false), 6000);
      }, 15000);
    }, 300);
  }, []);

  // Function to query features and find timestamp range for selected watersheds
  const updateTimestampRange = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      return;
    }

    if (selectedWatersheds.length === watershedNames.length) {
      setMinTimestamp(GLOBAL_MIN_TIMESTAMP);
      setMaxTimestamp(GLOBAL_MAX_TIMESTAMP);
      setTimeValue(GLOBAL_MIN_TIMESTAMP);
      setIsPlaying(false);
      return;
    }

    if (selectedWatersheds.length === 0) {
      // Set a non-animating state if nothing is selected
      setMinTimestamp(GLOBAL_MIN_TIMESTAMP);
      setMaxTimestamp(GLOBAL_MIN_TIMESTAMP + 1); // Avoids division by zero
      setTimeValue(GLOBAL_MIN_TIMESTAMP);
      setIsPlaying(false);
      return;
    }

    setIsCalculatingRange(true);

    // Use a slight delay to allow the map to process the filter change first
    setTimeout(() => {
      if (!map.current) {
        setIsCalculatingRange(false);
        return;
      }
      
      const features = map.current.querySourceFeatures('rivers-data', {
        sourceLayer: 'rivers',
        filter: ['in', ['get', 'ba_name'], ['literal', selectedWatersheds]]
      });

      if (features.length === 0) {
        setIsCalculatingRange(false);
        return;
      }

      let newMin = Infinity;
      let newMax = -Infinity;

      features.forEach(feature => {
        const timestamp = feature.properties?.timestamp;
        if (timestamp !== undefined) {
          if (timestamp < newMin) newMin = timestamp;
          if (timestamp > newMax) newMax = timestamp;
        }
      });
      
      if (newMin !== Infinity && newMax !== -Infinity && newMin < newMax) {
        setMinTimestamp(newMin);
        setMaxTimestamp(newMax);
        setTimeValue(newMin);
        setIsPlaying(false);
      } else {
        // Fallback if no valid range found
        setMinTimestamp(GLOBAL_MIN_TIMESTAMP);
        setMaxTimestamp(GLOBAL_MAX_TIMESTAMP);
        setTimeValue(GLOBAL_MIN_TIMESTAMP);
      }
      
      setIsCalculatingRange(false);
    }, 100); // A small delay can help ensure features are available after a filter change
  }, [selectedWatersheds]);

  // Update timestamp range when watershed selection changes
  useEffect(() => {
    if (!hasEnteredMap) return; // Don't run on initial load
    updateTimestampRange();
  }, [selectedWatersheds, hasEnteredMap]);

  const handleWatershedToggle = (name) => {
    setSelectedWatersheds(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  // Panel controls - opening one closes the other
  const openWatershedDrawer = () => {
    setIsAboutOpen(false);
    setIsWatershedDrawerOpen(true);
    setShowWatershedPulse(false); // Stop pulse when user clicks
  };

  const openAbout = () => {
    setIsWatershedDrawerOpen(false);
    setIsAboutOpen(true);
  };

  const closeAllPanels = () => {
    setIsWatershedDrawerOpen(false);
    setIsAboutOpen(false);
    setHoveredWatershed(null);
    hideBasinHighlight();
  };

  const progressPercent = maxTimestamp > minTimestamp
    ? ((timeValue - minTimestamp) / (maxTimestamp - minTimestamp)) * 100
    : 0;

  // Animation loop - use absolute time for consistent 12-second duration
  const animationStartTime = useRef(null);
  const timeValueRef = useRef(timeValue);

  // Keep ref in sync with state
  useEffect(() => {
    timeValueRef.current = timeValue;
  }, [timeValue]);

  useEffect(() => {
    if (!isPlaying || selectedWatersheds.length === 0) {
      animationStartTime.current = null;
      if (selectedWatersheds.length === 0) setIsPlaying(false);
      return;
    }

    let animationFrameId;
    const animate = (currentTimestamp) => {
      if (!isPlaying) return;

      if (animationStartTime.current === null) {
        animationStartTime.current = currentTimestamp;
      }

      const coastalRivers = watershedCategories["Coastal Rivers"]; // Changed key
      const himalayanRivers = watershedCategories["Himalayan Rivers"];

      const isOnlyCoastalSelected = selectedWatersheds.length === coastalRivers.length &&
                                  coastalRivers.every(r => selectedWatersheds.includes(r));
      const isOnlyHimalayanSelected = selectedWatersheds.length === himalayanRivers.length &&
                                    himalayanRivers.every(r => selectedWatersheds.includes(r));

      let duration;
      if (selectedWatersheds.length === watershedNames.length) {
        duration = 15000; // All rivers selected
      } else if (isOnlyCoastalSelected) {
        duration = 5000; // Only Coastal Rivers selected (changed from 7s to 5s)
      } else if (isOnlyHimalayanSelected) {
        duration = 13000; // Only Himalayan Rivers selected
      } else {
        duration = 10000; // Default for other selections
      }
      const elapsed = currentTimestamp - animationStartTime.current;
      const progress = Math.min(elapsed / duration, 1);

      const totalRange = maxTimestamp - minTimestamp;
      const newTime = minTimestamp + totalRange * progress;

      if (progress >= 1) {
        setTimeValue(maxTimestamp);
        setIsPlaying(false);
      } else {
        setTimeValue(newTime);
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, minTimestamp, maxTimestamp, selectedWatersheds.length]);

  // Reset animation when watershed selection changes
  useEffect(() => {
    setTimeValue(GLOBAL_MIN_TIMESTAMP);
    setIsPlaying(false);
  }, [selectedWatersheds]);
      
  // Map initialization
  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [lng, lat],
      zoom: zoom,
      minZoom: 3,
      maxZoom: 12,
      antialias: false,
      fadeDuration: 0,
      trackResize: true,
      maxTileCacheSize: 100,
      refreshExpiredTiles: false
    });

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", (params) => {
      return new Promise((resolve, reject) => {
        const callback = (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve({ data });
          }
        };
        protocol.tile(params, callback);
      });
    });

    const pmtilesUrl = import.meta.env.PROD
      ? 'https://pub-c2e50f4332a34bc1ad4b621cf701719a.r2.dev/more_detail_rivers.pmtiles'
      : `${window.location.origin}/more_detail_rivers.pmtiles`;

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      map.current.addSource('rivers-data', {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        minzoom: 0,
        maxzoom: 14
      });

      map.current.addSource('basins-data', {
        type: 'geojson',
        data: `${window.location.origin}/basins.geojson`
      });

      map.current.addLayer({
        id: 'basin-highlight',
        type: 'fill',
        source: 'basins-data',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.25
        },
        filter: ['==', ['get', 'ba_name'], '']
      });

      map.current.addLayer({
        id: 'basin-highlight-outline',
        type: 'line',
        source: 'basins-data',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1,
          'line-opacity': 0.3
        },
        filter: ['==', ['get', 'ba_name'], '']
      });

      map.current.addLayer({
        id: 'rivers-layer',
        type: 'line',
        source: 'rivers-data',
        'source-layer': 'rivers',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['get', 'ORD_STRA'],
            1, '#1e3a5f',
            2, '#1e5a7e',
            3, '#1a7a9e',
            4, '#2196b8',
            5, '#4fc3c7',
            6, '#80deea',
            7, '#b2ebf2'
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['get', 'ORD_STRA'],
            1, 0.3,
            3, 0.8,
            5, 1.5,
            7, 3
          ]
        },
        filter: [
          'all',
          ['<=', ['get', 'timestamp'], GLOBAL_MIN_TIMESTAMP],
          ['in', ['get', 'ba_name'], ['literal', watershedNames]]
        ]
      });

      // Click handler for river basin tooltip
      map.current.on('click', 'rivers-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const basinName = e.features[0].properties.ba_name;
          setTooltip({
            show: true,
            x: e.point.x,
            y: e.point.y,
            text: basinName
          });
        }
      });

      // Hide tooltip on mouse move
      map.current.on('mousemove', () => {
        setTooltip(prev => prev.show ? { ...prev, show: false } : prev);
      });

      map.current.on('mouseenter', 'rivers-layer', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'rivers-layer', () => {
        map.current.getCanvas().style.cursor = '';
      });

      map.current.on('sourcedata', (e) => {
        if (e.sourceId === 'rivers-data' && e.isSourceLoaded) {
          map.current.triggerRepaint();
        }
      });

      setMapReady(true);
    });
  }, [lng, lat, zoom]);

  // Basin highlight functions - only work when drawer is open
  const showBasinHighlight = (basinName) => {
    if (!mapReady || !map.current || !isWatershedDrawerOpen) return;
    const filter = ['==', ['get', 'ba_name'], basinName];
    map.current.setFilter('basin-highlight', filter);
    map.current.setFilter('basin-highlight-outline', filter);
  };

  const hideBasinHighlight = () => {
    if (!mapReady || !map.current) return;
    const filter = ['==', ['get', 'ba_name'], ''];
    map.current.setFilter('basin-highlight', filter);
    map.current.setFilter('basin-highlight-outline', filter);
  };

  const handleWatershedHover = (name) => {
    setHoveredWatershed(name);
    showBasinHighlight(name);
  };

  const handleWatershedLeave = () => {
    setHoveredWatershed(null);
    hideBasinHighlight();
  };

  // Filter update for rivers
  const lastFilterUpdate = useRef(0);
  const filterRef = useRef({ timeValue, selectedWatersheds });

  useEffect(() => {
    filterRef.current = { timeValue, selectedWatersheds };
  }, [timeValue, selectedWatersheds]);

  const pendingFilterUpdate = useRef(null);

  const applyFilter = useCallback(() => {
    if (!map.current || !map.current.getLayer('rivers-layer')) return false;
    const timeWithBuffer = filterRef.current.timeValue + 100;
    const filter = [
      'all',
      ['<=', ['get', 'timestamp'], timeWithBuffer],
      ['in', ['get', 'ba_name'], ['literal', filterRef.current.selectedWatersheds]]
    ];
    map.current.setFilter('rivers-layer', filter);
    return true;
  }, []);

  useEffect(() => {
    if (!map.current || !map.current.getLayer('rivers-layer')) return;

    const now = Date.now();
    // Throttle only during animation playback
    if (isPlaying && now - lastFilterUpdate.current < 60) return;
    lastFilterUpdate.current = now;

    // Try to apply immediately
    if (!applyFilter()) {
      // If map not ready, retry after style loads
      clearTimeout(pendingFilterUpdate.current);
      pendingFilterUpdate.current = setTimeout(() => applyFilter(), 50);
    }
  }, [timeValue, selectedWatersheds, isPlaying, applyFilter]);

  // Close panels when clicking outside
  const handleMapClick = (e) => {
    // Don't close if clicking on UI elements
    if (e.target.closest('.control-btn') ||
        e.target.closest('.watershed-drawer') ||
        e.target.closest('.about-sheet') ||
        e.target.closest('.timeline-bar') ||
        e.target.closest('.bottom-controls')) {
      return;
    }
    closeAllPanels();
  };

  return (
    <div className="App" onClick={handleMapClick}>
      {/* Intro Screen */}
      {isIntroVisible && (
        <IntroScreen onEnter={handleEnterMap} isMapReady={mapReady} />
      )}

      <div ref={mapContainer} className={`map-container ${isIntroVisible ? 'hidden' : ''}`} />

      {/* River click tooltip - only show after entering map */}
      {!isIntroVisible && tooltip.show && (
        <div
          className="basin-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Watershed drawer - only show after entering map */}
      <div className={`watershed-drawer ${isWatershedDrawerOpen ? 'open' : ''} ${isIntroVisible ? 'intro-hidden' : ''}`}>
        <div className="drawer-header">
          <h3>Watersheds</h3>
          <span className="drawer-count">{selectedWatersheds.length}/{watershedNames.length}</span>
        </div>
        <div className="drawer-actions">
          <button onClick={() => setSelectedWatersheds(watershedNames)}>All</button>
          <button onClick={() => setSelectedWatersheds([])}>None</button>
        </div>
        <div className="watershed-list">
          {Object.entries(watershedCategories).map(([category, rivers]) => {
            const isExpanded = expandedCategories.includes(category);
            const allSelected = rivers.every(r => selectedWatersheds.includes(r));
            const someSelected = rivers.some(r => selectedWatersheds.includes(r));

            return (
              <div key={category} className="watershed-category">
                <div
                  className={`category-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleCategory(category)}
                >
                  <span className={`category-arrow ${isExpanded ? 'expanded' : ''}`}>›</span>
                  <span
                    className={`checkbox ${allSelected ? 'checked' : ''} ${someSelected && !allSelected ? 'partial' : ''}`}
                    onClick={(e) => toggleCategoryWatersheds(category, e)}
                  />
                  <span className="category-name">{category}</span>
                  <span className="category-count">{rivers.filter(r => selectedWatersheds.includes(r)).length}/{rivers.length}</span>
                </div>
                {isExpanded && (
                  <div className="category-rivers">
                    {rivers.map(name => (
                      <div
                        key={name}
                        className={`watershed-item ${selectedWatersheds.includes(name) ? 'selected' : ''} ${hoveredWatershed === name ? 'hovered' : ''}`}
                        onClick={() => handleWatershedToggle(name)}
                        onMouseEnter={() => handleWatershedHover(name)}
                        onMouseLeave={handleWatershedLeave}
                      >
                        <span className={`checkbox ${selectedWatersheds.includes(name) ? 'checked' : ''}`} />
                        <span className="watershed-name">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        </div>
      </div>

      {/* About bottom sheet - only show after entering map */}
      <div className={`about-sheet ${isAboutOpen ? 'open' : ''} ${isIntroVisible ? 'intro-hidden' : ''}`}>
        <div className="about-content">
          <h2>India River Network</h2>
          <p>
            An animated visualization of India's river systems flowing from
            their mountain sources to the ocean. Toggle watersheds to explore
            different drainage systems.
          </p>

          <div className="legend">
            <h4>River Size (Stream Order)</h4>
            <div className="legend-bar">
              <div className="legend-gradient" />
              <div className="legend-labels">
                <span>Small tributaries</span>
                <span>Main rivers</span>
              </div>
            </div>
          </div>

          <div className="about-footer">
            <a href="https://github.com/daksh-arch/India-river-network" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
            <span className="data-source">Data: HydroRIVERS & HydroBASINS</span>
          </div>
        </div>
      </div>

      {/* Bottom control bar - only show after entering map */}
      <div className={`bottom-controls ${isIntroVisible ? 'intro-hidden' : ''}`}>
        {/* Watersheds button - left */}
        <button
          className={`control-btn ${isWatershedDrawerOpen ? 'active' : ''} ${showWatershedPulse ? 'pulse' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            isWatershedDrawerOpen ? closeAllPanels() : openWatershedDrawer();
          }}
        >
          <div className="icon-layers">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="tooltip">Watersheds</span>
        </button>

        {/* Timeline bar - center */}
        <div className="timeline-bar">
          <button
            className={`play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={() => {
              // Don't allow play if no watersheds selected
              if (selectedWatersheds.length === 0) return;
              if (!isPlaying && timeValue >= maxTimestamp) {
                setTimeValue(minTimestamp);
              }
              setIsPlaying(!isPlaying);
            }}
          />
          <div className="timeline-track">
            <div
              className="timeline-progress"
              style={{ transform: `translateY(-50%) scaleX(${progressPercent / 100})` }}
            />
            <input
              type="range"
              min={minTimestamp}
              max={maxTimestamp}
              value={timeValue}
              onChange={(e) => {
                setTimeValue(parseInt(e.target.value, 10));
                setIsPlaying(false);
              }}
            />
          </div>
          {isCalculatingRange && <span className="loading-indicator" />}
        </div>

        {/* Info button - right */}
        <button
          className={`control-btn ${isAboutOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            isAboutOpen ? closeAllPanels() : openAbout();
          }}
        >
          <div className="icon-info"></div>
          <span className="tooltip">Info</span>
        </button>
      </div>
    </div>
  );
}

export default App;
