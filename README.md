# India River Network

An animated visualization of India's river systems flowing from their mountain sources to the ocean.

## Features

- **Interactive map** with 22 major Indian watersheds organized into 4 categories
- **Auto-play animation** showing river flow from mountain sources to the ocean
- **Watershed categories**: Himalayan Rivers, Peninsular Rivers, Coastal Rivers, Rajasthan & Gujarat
- **Toggle watersheds**: Select/deselect individual basins or entire categories
- **Hover to highlight**: Hover over categories or individual basins to highlight them on the map
- **Click to identify**: Click on any river segment to see its watershed name
- **Smart timeline**: Automatically adjusts animation range based on selected watersheds
- **Color gradient** based on stream order (small tributaries to main rivers)
- **Intro screen** with interactive tutorial

## Tech Stack

- React + Vite
- MapLibre GL JS
- PMTiles (cloud-optimized vector tiles)
- Cloudflare Pages + R2

## Data Sources

- River network: [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers)
- Basin boundaries: [HydroBASINS](https://www.hydrosheds.org/products/hydrobasins)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
