# India River Network

An animated visualization of India's river systems flowing from their mountain sources to the ocean.

## Features

- Interactive map with 22 Indian watersheds
- Time-based animation showing river flow from source to sea
- Toggle individual basins on/off
- Adjustable playback speed (0.5x, 1x, 2x, 4x)
- Color gradient based on stream order (tributaries to main rivers)

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
