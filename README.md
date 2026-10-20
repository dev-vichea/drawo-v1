# drawo ✏️

> **drawo** is a fast, lightweight, hand-drawn whiteboard with smart arrow binding, container text, and an infinite canvas — reverse-engineered and built inspired by Excalidraw's core architecture.

![drawo Whiteboard](https://raw.githubusercontent.com/dev-vichea/drawo/main/preview.png)

---

## ✨ Features

- **Hand-Drawn Aesthetics**: Authentic sketchy rendering powered by Rough.js with customizable roughness (Architect, Artist, Cartoonist).
- **Authentic Excalifont**: Embedded native Excalidraw font for clean, organic annotations.
- **Smart Arrow Binding**:
  - Proximity magnet snaps arrow endpoints to shape perimeters.
  - Multi-shape ray intersection calculation (`intersectSegmentWithRect`, `intersectSegmentWithDiamond`, `intersectSegmentWithEllipse`).
  - Constant gap offset calculation (`gap = BASE_BINDING_GAP + strokeWidth / 2`).
  - **Reactive Updating**: Drag any shape and all connected arrows automatically update and stretch in real-time.
- **Seamless Text Tool**:
  - Press `T` and single-click anywhere on the canvas to write immediately.
  - Double-click any shape to edit its container text.
  - Borderless WYSIWYG text editing matching Excalidraw (no dashed boxes, pure text caret).
- **Infinite Canvas & Viewport**:
  - Smooth pan (`Space` + drag, or Middle mouse click).
  - Zoom to cursor with mouse wheel or trackpad pinch (`Ctrl`/`Cmd` + Wheel).
- **Full History**: Undo (`Ctrl + Z` / `Cmd + Z`) and Redo (`Ctrl + Y` / `Cmd + Shift + Z`).
- **Export**: One-click PNG export with auto-trimmed bounding box and padding.

---

## 🚀 Getting Started

No build tools or heavy installations required. Runs right out of the box with any static file server:

```bash
# Using npx serve (recommended)
npx serve -l 5173 .

# Or using Python built-in server
python3 -m http.server 5173
```

Open your browser and navigate to:
```
http://localhost:5173
```

---

## ⌨️ Shortcuts & Controls

| Tool / Action | Shortcut |
| :--- | :--- |
| **Selection** | `V` or `1` |
| **Rectangle** | `R` or `2` |
| **Diamond** | `D` or `3` |
| **Ellipse / Circle** | `O` or `4` |
| **Arrow** | `A` or `5` |
| **Line** | `L` or `6` |
| **Text** | `T` or `7` |
| **Eraser** | `E` or `8` |
| **Hand (Pan)** | `H` or hold `Space` |
| **Undo / Redo** | `Cmd+Z` / `Cmd+Y` |
| **Delete Selected** | `Backspace` or `Delete` |
| **Zoom In / Out** | `Cmd +` / `Cmd -` or `Cmd + Scroll` |
| **Reset Zoom** | `Cmd + 0` |

---

## 🛠️ Architecture & Under the Hood

- **Dual-Canvas Rendering Pipeline**:
  - `staticCanvas`: Renders all committed scene elements using Rough.js cache.
  - `interactiveCanvas`: High-frequency layer (60 FPS) rendering live element drag previews, selection outlines, and smart arrow snap focus rings.
- **State Separation**:
  - `lastPointerScene`: 1:1 scene coordinate tracking for element translation.
  - `lastPointerScreen`: Screen coordinate tracking for canvas panning.

---

## 📄 License

MIT © dev-vichea
