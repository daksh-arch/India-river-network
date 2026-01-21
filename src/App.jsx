import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import './App.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from "pmtiles";

const watershedNames = [
  "Area of Inland drainage in Rajasthan", "Barak and Others", "Brahamaputra",
  "Brahmani and Baitarni", "Cauvery", "East flowing rivers between Mahanadi and Pennar",
  "East flowing rivers between Pennar and Kanyakumari", "Ganga", "Godavari",
  "Indus (Up to border)", "Krishna", "Mahanadi", "Mahi",
  "Minor rivers draining into Myanmar and Bangladesh", "Narmada", "Pennar",
  "Sabarmati", "Subernarekha", "Tapi", "West flowing rivers from Tadri to Kanyakumari",
  "West flowing rivers from Tapi to Tadri", "West flowing rivers of Kutch and Saurashtra including Luni"
];

// Global timestamp bounds (full data range)
const GLOBAL_MIN_TIMESTAMP = 1704067260;
const GLOBAL_MAX_TIMESTAMP = 1704372500;

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(79);
  const [lat] = useState(22.5);
  const [zoom] = useState(4);

  // Dynamic timestamp range based on selected watersheds
  const [minTimestamp, setMinTimestamp] = useState(GLOBAL_MIN_TIMESTAMP);
  const [maxTimestamp, setMaxTimestamp] = useState(GLOBAL_MAX_TIMESTAMP);
  const [timeValue, setTimeValue] = useState(GLOBAL_MIN_TIMESTAMP);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed] = useState(1);
  const [isCalculatingRange, setIsCalculatingRange] = useState(false);

  const [selectedWatersheds, setSelectedWatersheds] = useState(watershedNames);
  const [hoveredWatershed, setHoveredWatershed] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  // UI State
  const [isWatershedDrawerOpen, setIsWatershedDrawerOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Tooltip state for river click
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, text: '' });

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
      return;
    }

    setIsCalculatingRange(true);

    const features = map.current.querySourceFeatures('rivers-data', {
      sourceLayer: 'rivers_for_web'
    });

    if (features.length === 0) {
      setIsCalculatingRange(false);
      return;
    }

    let newMin = Infinity;
    let newMax = -Infinity;

    features.forEach(feature => {
      const basinName = feature.properties?.ba_name;
      const timestamp = feature.properties?.timestamp;

      if (selectedWatersheds.includes(basinName) && timestamp !== undefined) {
        if (timestamp < newMin) newMin = timestamp;
        if (timestamp > newMax) newMax = timestamp;
      }
    });

    if (newMin !== Infinity && newMax !== -Infinity && newMin < newMax) {
      setMinTimestamp(newMin);
      setMaxTimestamp(newMax);
      setTimeValue(newMin);
      setIsPlaying(false);
    }

    setIsCalculatingRange(false);
  }, [selectedWatersheds]);

  const handleWatershedToggle = (name) => {
    setSelectedWatersheds(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  // Panel controls - opening one closes the other
  const openWatershedDrawer = () => {
    setIsAboutOpen(false);
    setIsWatershedDrawerOpen(true);
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

  // Animation loop
  useEffect(() => {
    let animationFrameId;
    let lastTimestamp = null;
    const animate = (currentTimestamp) => {
      if (!lastTimestamp) lastTimestamp = currentTimestamp;
      const elapsed = currentTimestamp - lastTimestamp;

      if (isPlaying && map.current && map.current.isStyleLoaded()) {
        const range = maxTimestamp - minTimestamp;
        const animationStep = (range / 7) * animationSpeed;

        setTimeValue(prevTime => {
          let newTime = prevTime + (elapsed / 1000) * animationStep;
          if (newTime >= maxTimestamp) {
            newTime = maxTimestamp;
            setIsPlaying(false);
          }
          return newTime;
        });
      }
      lastTimestamp = currentTimestamp;
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, animationSpeed, minTimestamp, maxTimestamp]);

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
      attributionControl: false,


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
      ? 'https://pub-c2e50f4332a34bc1ad4b621cf701719a.r2.dev/rivers.pmtiles'
      : `${window.location.origin}/rivers.pmtiles`;

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

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
        'source-layer': 'rivers_for_web',
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
          ['<=', ['get', 'timestamp'], GLOBAL_MAX_TIMESTAMP],
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
          // Auto-hide after 3 seconds
          setTimeout(() => {
            setTooltip(prev => ({ ...prev, show: false }));
          }, 3000);
        }
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

  // Update timestamp range when watershed selection changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const timeoutId = setTimeout(() => {
      updateTimestampRange();
    }, 300);

    const handleIdle = () => {
      updateTimestampRange();
    };
    map.current.once('idle', handleIdle);

    return () => {
      clearTimeout(timeoutId);
      if (map.current) {
        map.current.off('idle', handleIdle);
      }
    };
  }, [selectedWatersheds, updateTimestampRange]);

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

  useEffect(() => {
    if (!map.current) return;

    const applyFilter = () => {
      if (!map.current.isStyleLoaded() || !map.current.getLayer('rivers-layer')) return;

      const filter = [
        'all',
        ['<=', ['get', 'timestamp'], filterRef.current.timeValue],
        ['in', ['get', 'ba_name'], ['literal', filterRef.current.selectedWatersheds]]
      ];

      map.current.setFilter('rivers-layer', filter);
    };

    const now = Date.now();
    if (isPlaying && now - lastFilterUpdate.current < 50) return;
    lastFilterUpdate.current = now;

    applyFilter();

    const onIdle = () => applyFilter();
    map.current.once('idle', onIdle);

    return () => {
      if (map.current) {
        map.current.off('idle', onIdle);
      }
    };
  }, [timeValue, selectedWatersheds, isPlaying]);

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
      <div ref={mapContainer} className="map-container" />

      {/* River click tooltip */}
      {tooltip.show && (
        <div
          className="basin-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Watershed drawer */}
      <div className={`watershed-drawer ${isWatershedDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>Watersheds</h3>
          <span className="drawer-count">{selectedWatersheds.length}/{watershedNames.length}</span>
        </div>
        <div className="drawer-actions">
          <button onClick={() => setSelectedWatersheds(watershedNames)}>All</button>
          <button onClick={() => setSelectedWatersheds([])}>None</button>
        </div>
        <div className="watershed-list">
          {watershedNames.map(name => (
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
      </div>

      {/* About bottom sheet */}
      <div className={`about-sheet ${isAboutOpen ? 'open' : ''}`}>
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

      {/* Bottom control bar */}
      <div className="bottom-controls">
        {/* Watersheds button - left */}
        <button
          className={`control-btn ${isWatershedDrawerOpen ? 'active' : ''}`}
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
              if (!isPlaying && timeValue >= maxTimestamp) {
                setTimeValue(minTimestamp);
              }
              setIsPlaying(!isPlaying);
            }}
          />
          <div className="timeline-track">
            <div
              className="timeline-progress"
              style={{ width: `${progressPercent}%` }}
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
