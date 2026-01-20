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

// Icons as components
const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6"/>
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4M12 8h.01"/>
  </svg>
);

const LayersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const DatabaseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

// Global timestamp bounds (full data range)
const GLOBAL_MIN_TIMESTAMP = 1704067260;
const GLOBAL_MAX_TIMESTAMP = 1704372500;

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(77.5946);
  const [lat] = useState(12.9716);
  const [zoom] = useState(5);

  // Dynamic timestamp range based on selected watersheds
  const [minTimestamp, setMinTimestamp] = useState(GLOBAL_MIN_TIMESTAMP);
  const [maxTimestamp, setMaxTimestamp] = useState(GLOBAL_MAX_TIMESTAMP);
  const [timeValue, setTimeValue] = useState(GLOBAL_MIN_TIMESTAMP);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [isCalculatingRange, setIsCalculatingRange] = useState(false);

  const [selectedWatersheds, setSelectedWatersheds] = useState(watershedNames);
  const [isInfoOpen, setIsInfoOpen] = useState(true);
  const [isWatershedOpen, setIsWatershedOpen] = useState(true);

  // Function to query features and find timestamp range for selected watersheds
  const updateTimestampRange = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      return;
    }

    // If all watersheds selected, use global range
    if (selectedWatersheds.length === watershedNames.length) {
      setMinTimestamp(GLOBAL_MIN_TIMESTAMP);
      setMaxTimestamp(GLOBAL_MAX_TIMESTAMP);
      setTimeValue(GLOBAL_MIN_TIMESTAMP);
      setIsPlaying(false);
      return;
    }

    // If no watersheds selected, keep current range
    if (selectedWatersheds.length === 0) {
      return;
    }

    setIsCalculatingRange(true);

    // Query all loaded features from the source
    const features = map.current.querySourceFeatures('rivers-data', {
      sourceLayer: 'rivers_for_web'
    });

    if (features.length === 0) {
      setIsCalculatingRange(false);
      return;
    }

    // Find min/max timestamps for selected watersheds
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

    // Only update if we found valid values
    if (newMin !== Infinity && newMax !== -Infinity && newMin < newMax) {
      setMinTimestamp(newMin);
      setMaxTimestamp(newMax);
      // Reset to start of new range
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

  const handleReset = () => {
    setTimeValue(minTimestamp);
    setIsPlaying(false);
  };

  const progressPercent = maxTimestamp > minTimestamp
    ? ((timeValue - minTimestamp) / (maxTimestamp - minTimestamp)) * 100
    : 0;

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
            setIsPlaying(false); // Pause at the end
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

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [lng, lat],
      zoom: zoom,
      minZoom: 4,                 // Prevent zooming out too far
      maxZoom: 12,                // Optional: limit max zoom too
      antialias: false,           // Disable antialiasing for better performance
      fadeDuration: 0,            // Disable fade animations
      trackResize: true,
      maxTileCacheSize: 100,      // Limit tile cache to reduce memory
      refreshExpiredTiles: false  // Don't refresh tiles automatically
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

    // Use R2 in production, local file in development
    const pmtilesUrl = import.meta.env.PROD
      ? 'https://pub-c2e50f4332a34bc1ad4b621cf701719a.r2.dev/rivers.pmtiles'
      : `${window.location.origin}/rivers.pmtiles`;

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      map.current.addSource('rivers-data', {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        minzoom: 0,
        maxzoom: 14
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
            1, '#1e3a5f',    // Darkest blue (smallest tributaries)
            2, '#1e5a7e',
            3, '#1a7a9e',
            4, '#2196b8',
            5, '#4fc3c7',
            6, '#80deea',
            7, '#b2ebf2'     // Brightest cyan (main rivers)
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
        // Apply initial filter showing all data at max timestamp
        filter: [
          'all',
          ['<=', ['get', 'timestamp'], GLOBAL_MAX_TIMESTAMP],
          ['in', ['get', 'ba_name'], ['literal', watershedNames]]
        ]
      });

      // Re-apply filter when new tiles load (fixes edge geometry issue)
      map.current.on('sourcedata', (e) => {
        if (e.sourceId === 'rivers-data' && e.isSourceLoaded) {
          map.current.triggerRepaint();
        }
      });
    });
  }, [lng, lat, zoom]);

  // Update timestamp range when watershed selection changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Small delay to allow tiles to load
    const timeoutId = setTimeout(() => {
      updateTimestampRange();
    }, 300);

    // Also update on map idle (when more tiles finish loading)
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

  // Throttled filter update to reduce GPU load during animation
  const lastFilterUpdate = useRef(0);
  const filterRef = useRef({ timeValue, selectedWatersheds });

  // Keep refs in sync
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

    // Throttle filter updates during animation (update every 50ms max)
    const now = Date.now();
    if (isPlaying && now - lastFilterUpdate.current < 50) return;
    lastFilterUpdate.current = now;

    applyFilter();

    // Also apply filter on idle to catch any missed tiles
    const onIdle = () => applyFilter();
    map.current.once('idle', onIdle);

    return () => {
      if (map.current) {
        map.current.off('idle', onIdle);
      }
    };
  }, [timeValue, selectedWatersheds, isPlaying]);

  return (
    <div className="App">
      <div ref={mapContainer} className="map-container" />

      {/* Info Panel - Top Left */}
      <div className="panel info-panel">
        <div className="panel-header" onClick={() => setIsInfoOpen(!isInfoOpen)}>
          <div className="panel-title">
            <InfoIcon />
            <h3>About</h3>
          </div>
          <button className={`collapse-btn ${!isInfoOpen ? 'collapsed' : ''}`}>
            <ChevronIcon />
          </button>
        </div>
        <div className={`panel-content ${!isInfoOpen ? 'collapsed' : ''}`}>
          <div className="info-content">
            <h2>India River Network</h2>
            <p>
              An animated visualization of India's river systems flowing from
              their mountain sources to the ocean. Watch the rivers come alive
              as water traces its path through 22 major watersheds.
            </p>
            <p>
              Toggle individual basins to explore different drainage systems,
              or use the timeline to control the animation flow.
            </p>
            <div className="data-source">
              <DatabaseIcon />
              <span>Data: HydroRIVERS & HydroBASINS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Watershed Panel - Top Right */}
      <div className="panel watershed-panel">
        <div className="panel-header" onClick={() => setIsWatershedOpen(!isWatershedOpen)}>
          <div className="panel-title">
            <LayersIcon />
            <h3>Watersheds</h3>
          </div>
          <button className={`collapse-btn ${!isWatershedOpen ? 'collapsed' : ''}`}>
            <ChevronIcon />
          </button>
        </div>
        <div className={`panel-content ${!isWatershedOpen ? 'collapsed' : ''}`}>
          <div className="watershed-actions">
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedWatersheds(watershedNames);
              }}
            >
              Select All
            </button>
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedWatersheds([]);
              }}
            >
              Clear All
            </button>
          </div>
          <div className="watershed-count">
            {selectedWatersheds.length} of {watershedNames.length} basins selected
          </div>
          <div className="watershed-list">
            {watershedNames.map(name => (
              <div
                key={name}
                className={`watershed-item ${selectedWatersheds.includes(name) ? 'selected' : ''}`}
                onClick={() => handleWatershedToggle(name)}
              >
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedWatersheds.includes(name)}
                    onChange={() => handleWatershedToggle(name)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className="watershed-name">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Panel */}
      <div className="panel timeline-panel">
        <div className="timeline-top">
          <div className="timeline-controls">
            <button
              className={`play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            />
            <button
              className="reset-btn"
              onClick={handleReset}
              title="Reset to start"
              aria-label="Reset"
            />
            <div className="speed-controls">
              {[0.5, 1, 2, 4].map(speed => (
                <button
                  key={speed}
                  className={`speed-btn ${animationSpeed === speed ? 'active' : ''}`}
                  onClick={() => setAnimationSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
          <div className="animation-indicator">
            <span className={`indicator-dot ${isPlaying ? 'active' : ''}`}></span>
            {isCalculatingRange ? 'Loading...' : isPlaying ? 'Playing' : 'Paused'}
          </div>
        </div>
        <div className="timeline-slider">
          <div className="slider-track">
            <div
              className="slider-progress"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
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
      </div>
    </div>
  );
}

export default App;
