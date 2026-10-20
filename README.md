# ✏️ Drawo

An open-source virtual hand-drawn style whiteboard application. Free, local, private, and fully customizable.

## Features

- ✏️ Hand-drawn sketching with freehand pencil and smart smoothing
- 📐 Shapes: rectangles, diamonds, ellipses, lines, and arrows
- ⚡ Smart arrow binding with straight, curved, and elbow paths
- 📝 Sticky notes and rich text styling
- 🧹 Smart interactive eraser
- 🎨 Custom palettes, pastel fills, and rough sketch rendering
- 🔄 Infinite canvas with zoom, pan, and mini-map
- 💾 Local storage autosave, image export PNG/SVG, and scene backup
- 🚀 Zero tracking, zero ads, zero external upsells

## Project Structure

This repository is organized as a monorepo containing the full raw TypeScript drawing engine source code:

- `excalidraw-app/` - The web application entry point and UI
- `packages/excalidraw/` - Drawing canvas component, tools, actions, and dialogs
- `packages/element/` - Element data model, geometry, and rendering
- `packages/math/` - Coordinates, collision detection, and mathematical transformations
- `packages/common/` - Shared constants, utilities, and types
- `legacy-vanilla/` - Safe archive of the initial vanilla prototype

## Getting Started

### Prerequisites

- Node.js 18 or higher
- Yarn 1.22

### Installation

```bash
corepack yarn install
```

### Development

Start the local development server:

```bash
corepack yarn start
```

Open `http://localhost:5173` in your browser. Any change in `packages/` or `excalidraw-app/` hot-reloads live directly from source.

### Production Build

```bash
corepack yarn build
```

## License

MIT
