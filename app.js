/**
 * drawo: Hand-drawn Whiteboard with Smart Arrow Binding
 * Inspired by Excalidraw's architecture reversed with REA.
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const BASE_BINDING_GAP = 5;
  const MAX_BINDING_DISTANCE = 25; // in scene pixels
  const ARROW_HEAD_LENGTH = 15;
  const ARROW_HEAD_ANGLE = 0.45; // radians (~25 deg)

  // --- State ---
  const state = {
    elements: [],
    selectedIds: new Set(),
    activeTool: 'selection',
    isLocked: false,

    // Viewport transform
    scrollX: 0,
    scrollY: 0,
    zoom: 1.0,

    // Interaction flags
    isDragging: false,
    dragMode: null, // 'draw' | 'move' | 'pan' | 'boxSelect' | 'resize'
    dragStart: { x: 0, y: 0 },
    lastPointerScreen: { x: 0, y: 0 },
    lastPointerScene: { x: 0, y: 0 },
    spacePressed: false,
    resizingHandle: null,

    // Live drawing / binding
    currentElement: null,
    bindingCandidate: null, // { elementId, fixedPoint: [rx, ry], point: [x,y] }
    boxSelectBounds: null,

    // Styling defaults
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    strokeWidth: 2,
    roughness: 1,

    // Active text editing session
    editingText: null, // { element, container, sceneX, sceneY }

    // Undo/Redo
    history: [],
    historyIndex: -1,
  };

  // --- DOM References ---
  const staticCanvas = document.getElementById('staticCanvas');
  const interactiveCanvas = document.getElementById('interactiveCanvas');
  const staticCtx = staticCanvas.getContext('2d');
  const interactiveCtx = interactiveCanvas.getContext('2d');
  const textEditor = document.getElementById('textEditor');
  const zoomDisplay = document.getElementById('zoomDisplay');

  // Rough.js generator & canvases
  let roughStatic = null;
  let roughInteractive = null;

  // --- Helper Math Functions ---
  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function screenToScene(screenX, screenY) {
    return {
      x: screenX / state.zoom - state.scrollX,
      y: screenY / state.zoom - state.scrollY,
    };
  }

  function sceneToScreen(sceneX, sceneY) {
    return {
      x: (sceneX + state.scrollX) * state.zoom,
      y: (sceneY + state.scrollY) * state.zoom,
    };
  }

  function generateId() {
    return 'el_' + Math.random().toString(36).substring(2, 11);
  }

  function generateSeed() {
    return Math.floor(Math.random() * 2147483647);
  }

  // --- Canvas Sizing & Retina Setup ---
  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    staticCanvas.width = width * dpr;
    staticCanvas.height = height * dpr;
    staticCanvas.style.width = width + 'px';
    staticCanvas.style.height = height + 'px';

    interactiveCanvas.width = width * dpr;
    interactiveCanvas.height = height * dpr;
    interactiveCanvas.style.width = width + 'px';
    interactiveCanvas.style.height = height + 'px';

    if (window.rough) {
      roughStatic = rough.canvas(staticCanvas);
      roughInteractive = rough.canvas(interactiveCanvas);
    }

    renderAll();
  }

  window.addEventListener('resize', resizeCanvases);

  // --- Geometry & Intersection Routines ---

  /**
   * Calculates ray/segment intersection with axis-aligned rectangle
   */
  function intersectSegmentWithRect(x, y, w, h, p1, p2) {
    const minX = Math.min(x, x + w);
    const maxX = Math.max(x, x + w);
    const minY = Math.min(y, y + h);
    const maxY = Math.max(y, y + h);

    const edges = [
      // Top
      { p1: { x: minX, y: minY }, p2: { x: maxX, y: minY } },
      // Right
      { p1: { x: maxX, y: minY }, p2: { x: maxX, y: maxY } },
      // Bottom
      { p1: { x: minX, y: maxY }, p2: { x: maxX, y: maxY } },
      // Left
      { p1: { x: minX, y: minY }, p2: { x: minX, y: maxY } },
    ];

    let closest = null;
    let minD = Infinity;

    for (const edge of edges) {
      const pt = lineIntersection(p1, p2, edge.p1, edge.p2);
      if (pt) {
        const d = distance(p1.x, p1.y, pt.x, pt.y);
        if (d < minD) {
          minD = d;
          closest = pt;
        }
      }
    }
    return closest;
  }

  /**
   * Calculates intersection with diamond edges
   */
  function intersectSegmentWithDiamond(x, y, w, h, p1, p2) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const top = { x: cx, y: y };
    const right = { x: x + w, y: cy };
    const bottom = { x: cx, y: y + h };
    const left = { x: x, y: cy };

    const edges = [
      { p1: top, p2: right },
      { p1: right, p2: bottom },
      { p1: bottom, p2: left },
      { p1: left, p2: top },
    ];

    let closest = null;
    let minD = Infinity;

    for (const edge of edges) {
      const pt = lineIntersection(p1, p2, edge.p1, edge.p2);
      if (pt) {
        const d = distance(p1.x, p1.y, pt.x, pt.y);
        if (d < minD) {
          minD = d;
          closest = pt;
        }
      }
    }
    return closest;
  }

  /**
   * Calculates intersection with ellipse boundary
   */
  function intersectSegmentWithEllipse(x, y, w, h, p1, p2) {
    const rx = Math.abs(w / 2);
    const ry = Math.abs(h / 2);
    if (rx < 1 || ry < 1) return null;

    const cx = x + w / 2;
    const cy = y + h / 2;

    // Vector from center to p1 (the external point)
    const dx = p1.x - cx;
    const dy = p1.y - cy;
    if (dx === 0 && dy === 0) return { x: cx + rx, y: cy };

    const angle = Math.atan2(dy / ry, dx / rx);
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    };
  }

  /**
   * Generic line segment intersection (p1-p2 with p3-p4)
   */
  function lineIntersection(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-6) return null;

    const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      return {
        x: p1.x + u * (p2.x - p1.x),
        y: p1.y + u * (p2.y - p1.y),
      };
    }
    return null;
  }

  /**
   * Calculates intersection of arrow segment (pFrom -> pTo) with shape perimeter
   */
  function getShapePerimeterIntersection(shape, pFrom, pTo) {
    if (shape.type === 'rectangle') {
      const minX = Math.min(shape.x, shape.x + shape.width);
      const maxX = Math.max(shape.x, shape.x + shape.width);
      const minY = Math.min(shape.y, shape.y + shape.height);
      const maxY = Math.max(shape.y, shape.y + shape.height);

      const edges = [
        { p1: { x: minX, y: minY }, p2: { x: maxX, y: minY } }, // top
        { p1: { x: maxX, y: minY }, p2: { x: maxX, y: maxY } }, // right
        { p1: { x: maxX, y: maxY }, p2: { x: minX, y: maxY } }, // bottom
        { p1: { x: minX, y: maxY }, p2: { x: minX, y: minY } }, // left
      ];

      for (const edge of edges) {
        const pt = lineIntersection(pFrom, pTo, edge.p1, edge.p2);
        if (pt) return pt;
      }
    } else if (shape.type === 'diamond') {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const top = { x: cx, y: shape.y };
      const right = { x: shape.x + shape.width, y: cy };
      const bottom = { x: cx, y: shape.y + shape.height };
      const left = { x: shape.x, y: cy };

      const edges = [
        { p1: top, p2: right },
        { p1: right, p2: bottom },
        { p1: bottom, p2: left },
        { p1: left, p2: top },
      ];

      for (const edge of edges) {
        const pt = lineIntersection(pFrom, pTo, edge.p1, edge.p2);
        if (pt) return pt;
      }
    } else if (shape.type === 'ellipse') {
      const rx = Math.abs(shape.width / 2);
      const ry = Math.abs(shape.height / 2);
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;

      // Vector from shape center toward other point (pFrom if pTo is inside, or pTo)
      const targetPt = (Math.abs(pFrom.x - cx) < 2 && Math.abs(pFrom.y - cy) < 2) ? pTo : pFrom;
      const angle = Math.atan2(targetPt.y - cy, targetPt.x - cx);

      return {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      };
    }
    return null;
  }

  // --- Smart Arrow Binding Subsystem ---

  /**
   * Check if a point is close enough to bind to a shape
   */
  function findBindingTarget(scenePoint, excludeId = null) {
    const threshold = MAX_BINDING_DISTANCE;

    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i];
      if (el.id === excludeId) continue;
      if (el.type === 'arrow' || el.type === 'line' || el.type === 'text') continue;

      const minX = Math.min(el.x, el.x + el.width) - threshold;
      const maxX = Math.max(el.x, el.x + el.width) + threshold;
      const minY = Math.min(el.y, el.y + el.height) - threshold;
      const maxY = Math.max(el.y, el.y + el.height) + threshold;

      if (scenePoint.x >= minX && scenePoint.x <= maxX && scenePoint.y >= minY && scenePoint.y <= maxY) {
        // Candidate found! Compute closest anchor point:
        const anchors = [
          { name: 'north', fixedPoint: [0.5, 0], x: el.x + el.width * 0.5, y: el.y },
          { name: 'south', fixedPoint: [0.5, 1], x: el.x + el.width * 0.5, y: el.y + el.height },
          { name: 'west', fixedPoint: [0, 0.5], x: el.x, y: el.y + el.height * 0.5 },
          { name: 'east', fixedPoint: [1, 0.5], x: el.x + el.width, y: el.y + el.height * 0.5 },
          { name: 'center', fixedPoint: [0.5, 0.5], x: el.x + el.width * 0.5, y: el.y + el.height * 0.5 },
        ];

        let bestAnchor = anchors[0];
        let minD = Infinity;
        for (const a of anchors) {
          const d = distance(scenePoint.x, scenePoint.y, a.x, a.y);
          if (d < minD) {
            minD = d;
            bestAnchor = a;
          }
        }

        return {
          element: el,
          elementId: el.id,
          fixedPoint: bestAnchor.fixedPoint,
          snapPoint: { x: bestAnchor.x, y: bestAnchor.y },
        };
      }
    }
    return null;
  }

  /**
   * Recalculates arrow endpoints based on its bindings
   */
  function updateArrowPoints(arrow) {
    if (arrow.type !== 'arrow') return;

    const startBinding = arrow.startBinding;
    const endBinding = arrow.endBinding;

    const startShape = startBinding ? state.elements.find((e) => e.id === startBinding.elementId) : null;
    const endShape = endBinding ? state.elements.find((e) => e.id === endBinding.elementId) : null;

    let pStart = { x: arrow.x + arrow.points[0][0], y: arrow.y + arrow.points[0][1] };
    let pEnd = { x: arrow.x + arrow.points[1][0], y: arrow.y + arrow.points[1][1] };

    // If start is bound, compute its center/fixed point
    let startAnchor = pStart;
    if (startShape) {
      startAnchor = {
        x: startShape.x + startShape.width * startBinding.fixedPoint[0],
        y: startShape.y + startShape.height * startBinding.fixedPoint[1],
      };
    }

    // If end is bound, compute its center/fixed point
    let endAnchor = pEnd;
    if (endShape) {
      endAnchor = {
        x: endShape.x + endShape.width * endBinding.fixedPoint[0],
        y: endShape.y + endShape.height * endBinding.fixedPoint[1],
      };
    }

    // Calculate connecting angle between anchors
    const angle = Math.atan2(endAnchor.y - startAnchor.y, endAnchor.x - startAnchor.x);

    // Calculate actual perimeter intersections
    if (startShape) {
      const isect = getShapePerimeterIntersection(startShape, startAnchor, endAnchor);
      if (isect) {
        const gap = BASE_BINDING_GAP + (startShape.strokeWidth || 2) / 2;
        pStart = {
          x: isect.x + Math.cos(angle) * gap,
          y: isect.y + Math.sin(angle) * gap,
        };
      } else {
        pStart = startAnchor;
      }
    } else {
      pStart = startAnchor;
    }

    if (endShape) {
      const isect = getShapePerimeterIntersection(endShape, startAnchor, endAnchor);
      if (isect) {
        const gap = BASE_BINDING_GAP + (endShape.strokeWidth || 2) / 2;
        pEnd = {
          x: isect.x - Math.cos(angle) * gap,
          y: isect.y - Math.sin(angle) * gap,
        };
      } else {
        pEnd = endAnchor;
      }
    } else {
      pEnd = endAnchor;
    }

    // Update arrow root (x,y) and relative points
    arrow.x = pStart.x;
    arrow.y = pStart.y;
    arrow.points = [
      [0, 0],
      [pEnd.x - pStart.x, pEnd.y - pStart.y],
    ];
  }

  /**
   * Updates all arrows bound to a specific shape
   */
  function updateBoundArrowsForShape(shape) {
    for (const el of state.elements) {
      if (el.type === 'arrow') {
        if (el.startBinding?.elementId === shape.id || el.endBinding?.elementId === shape.id) {
          updateArrowPoints(el);
        }
      }
    }
  }

  // --- Rendering Pipeline ---

  function renderAll() {
    renderStatic();
    renderInteractive();
  }

  /**
   * Static Canvas: All committed scene elements rendered with Rough.js
   */
  function renderStatic() {
    const dpr = window.devicePixelRatio || 1;
    staticCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

    staticCtx.scale(dpr * state.zoom, dpr * state.zoom);
    staticCtx.translate(state.scrollX, state.scrollY);

    if (!roughStatic) return;

    for (const el of state.elements) {
      drawElement(staticCtx, roughStatic, el);
    }
  }

  /**
   * Draws a single element with hand-drawn aesthetic
   */
  function drawElement(ctx, rc, el) {
    const roughOpts = {
      seed: el.seed,
      stroke: el.strokeColor,
      strokeWidth: el.strokeWidth,
      roughness: el.roughness,
      fill: el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined,
      fillStyle: el.backgroundColor !== 'transparent' ? 'solid' : undefined,
    };

    if (el.type === 'rectangle') {
      const minX = Math.min(el.x, el.x + el.width);
      const minY = Math.min(el.y, el.y + el.height);
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      rc.rectangle(minX, minY, w, h, roughOpts);
      drawContainerText(ctx, el);
    } else if (el.type === 'diamond') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      rc.polygon(
        [
          [cx, el.y],
          [el.x + el.width, cy],
          [cx, el.y + el.height],
          [el.x, cy],
        ],
        roughOpts
      );
      drawContainerText(ctx, el);
    } else if (el.type === 'ellipse') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      rc.ellipse(cx, cy, w, h, roughOpts);
      drawContainerText(ctx, el);
    } else if (el.type === 'line') {
      const p1 = [el.x + el.points[0][0], el.y + el.points[0][1]];
      const p2 = [el.x + el.points[1][0], el.y + el.points[1][1]];
      rc.line(p1[0], p1[1], p2[0], p2[1], roughOpts);
    } else if (el.type === 'arrow') {
      const p1 = [el.x + el.points[0][0], el.y + el.points[0][1]];
      const p2 = [el.x + el.points[1][0], el.y + el.points[1][1]];
      // Draw main stem
      rc.line(p1[0], p1[1], p2[0], p2[1], roughOpts);

      // Draw hand-drawn arrow heads
      const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      const leftX = p2[0] - ARROW_HEAD_LENGTH * Math.cos(angle - ARROW_HEAD_ANGLE);
      const leftY = p2[1] - ARROW_HEAD_LENGTH * Math.sin(angle - ARROW_HEAD_ANGLE);
      const rightX = p2[0] - ARROW_HEAD_LENGTH * Math.cos(angle + ARROW_HEAD_ANGLE);
      const rightY = p2[1] - ARROW_HEAD_LENGTH * Math.sin(angle + ARROW_HEAD_ANGLE);

      rc.line(p2[0], p2[1], leftX, leftY, roughOpts);
      rc.line(p2[0], p2[1], rightX, rightY, roughOpts);
    } else if (el.type === 'text') {
      drawTextElement(ctx, el);
    }
  }

  /**
   * Draws text inside a container shape (e.g. step cards)
   */
  function drawContainerText(ctx, el) {
    if (!el.text) return;
    if (state.editingText && state.editingText.container?.id === el.id) return;
    ctx.save();
    ctx.font = `${el.fontSize || 16}px 'Excalifont', cursive, sans-serif`;
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    const lines = el.text.split('\n');
    const lineHeight = (el.fontSize || 16) * 1.35;
    const startY = cy - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, cx, startY + i * lineHeight);
    });
    ctx.restore();
  }

  function drawTextElement(ctx, el) {
    if (!el.text) return;
    if (state.editingText && state.editingText.element?.id === el.id) return;
    ctx.save();
    ctx.font = `${el.fontSize || 18}px 'Excalifont', cursive, sans-serif`;
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = el.text.split('\n');
    const lineHeight = (el.fontSize || 18) * 1.35;
    lines.forEach((line, i) => {
      ctx.fillText(line, el.x, el.y + i * lineHeight);
    });
    ctx.restore();
  }

  /**
   * Interactive Canvas: Selection outlines, handles, live drag previews, snap targets
   */
  function renderInteractive() {
    const dpr = window.devicePixelRatio || 1;
    interactiveCtx.setTransform(1, 0, 0, 1, 0, 0);
    interactiveCtx.clearRect(0, 0, interactiveCanvas.width, interactiveCanvas.height);

    interactiveCtx.scale(dpr * state.zoom, dpr * state.zoom);
    interactiveCtx.translate(state.scrollX, state.scrollY);

    // 1. Draw live element being created
    if (state.currentElement && state.dragMode === 'draw') {
      if (roughInteractive) {
        drawElement(interactiveCtx, roughInteractive, state.currentElement);
      }
    }

    // 2. Draw Smart Arrow Snap / Binding Candidate Highlight
    if (state.bindingCandidate) {
      const cand = state.bindingCandidate;
      const el = cand.element;

      interactiveCtx.save();
      interactiveCtx.lineWidth = 2 / state.zoom;
      interactiveCtx.strokeStyle = '#6965db';
      interactiveCtx.setLineDash([4 / state.zoom, 4 / state.zoom]);

      // Highlight target shape perimeter
      if (el.type === 'rectangle') {
        interactiveCtx.strokeRect(el.x, el.y, el.width, el.height);
      } else if (el.type === 'ellipse') {
        interactiveCtx.beginPath();
        interactiveCtx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.abs(el.width / 2),
          Math.abs(el.height / 2),
          0,
          0,
          2 * Math.PI
        );
        interactiveCtx.stroke();
      } else if (el.type === 'diamond') {
        interactiveCtx.beginPath();
        interactiveCtx.moveTo(el.x + el.width / 2, el.y);
        interactiveCtx.lineTo(el.x + el.width, el.y + el.height / 2);
        interactiveCtx.lineTo(el.x + el.width / 2, el.y + el.height);
        interactiveCtx.lineTo(el.x, el.y + el.height / 2);
        interactiveCtx.closePath();
        interactiveCtx.stroke();
      }

      // Draw snap focus dot
      interactiveCtx.setLineDash([]);
      interactiveCtx.fillStyle = '#6965db';
      interactiveCtx.beginPath();
      interactiveCtx.arc(cand.snapPoint.x, cand.snapPoint.y, 5 / state.zoom, 0, Math.PI * 2);
      interactiveCtx.fill();

      // Outer ripple
      interactiveCtx.strokeStyle = 'rgba(105, 101, 219, 0.4)';
      interactiveCtx.lineWidth = 1.5 / state.zoom;
      interactiveCtx.beginPath();
      interactiveCtx.arc(cand.snapPoint.x, cand.snapPoint.y, 9 / state.zoom, 0, Math.PI * 2);
      interactiveCtx.stroke();

      interactiveCtx.restore();
    }

    // 3. Draw Selection Box and Handles for selected elements
    if (state.selectedIds.size > 0 && state.activeTool === 'selection') {
      for (const id of state.selectedIds) {
        const el = state.elements.find((e) => e.id === id);
        if (!el) continue;

        const bounds = getElementBounds(el);
        interactiveCtx.save();
        interactiveCtx.strokeStyle = '#6965db';
        interactiveCtx.lineWidth = 1.5 / state.zoom;
        interactiveCtx.setLineDash([]);
        interactiveCtx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // Draw resize handles
        interactiveCtx.setLineDash([]);
        interactiveCtx.fillStyle = '#ffffff';
        interactiveCtx.strokeStyle = '#6965db';
        interactiveCtx.lineWidth = 1.5 / state.zoom;

        const handles = getHandleCoordinates(bounds);
        const handleSize = 7 / state.zoom;

        for (const h of Object.values(handles)) {
          interactiveCtx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          interactiveCtx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        }
        interactiveCtx.restore();
      }
    }

    // 4. Draw Marquee Selection Box
    if (state.dragMode === 'boxSelect' && state.boxSelectBounds) {
      const b = state.boxSelectBounds;
      interactiveCtx.save();
      interactiveCtx.fillStyle = 'rgba(105, 101, 219, 0.08)';
      interactiveCtx.strokeStyle = '#6965db';
      interactiveCtx.lineWidth = 1 / state.zoom;
      interactiveCtx.fillRect(b.x, b.y, b.w, b.h);
      interactiveCtx.strokeRect(b.x, b.y, b.w, b.h);
      interactiveCtx.restore();
    }
  }

  function getElementBounds(el) {
    if (el.type === 'arrow' || el.type === 'line') {
      const p1 = { x: el.x + el.points[0][0], y: el.y + el.points[0][1] };
      const p2 = { x: el.x + el.points[1][0], y: el.y + el.points[1][1] };
      const minX = Math.min(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxX = Math.max(p1.x, p2.x);
      const maxY = Math.max(p1.y, p2.y);
      return { x: minX - 6, y: minY - 6, width: maxX - minX + 12, height: maxY - minY + 12 };
    }
    const minX = Math.min(el.x, el.x + el.width);
    const minY = Math.min(el.y, el.y + el.height);
    const w = Math.abs(el.width);
    const h = Math.abs(el.height);
    return { x: minX - 4, y: minY - 4, width: w + 8, height: h + 8 };
  }

  function getHandleCoordinates(b) {
    return {
      nw: { x: b.x, y: b.y },
      ne: { x: b.x + b.width, y: b.y },
      se: { x: b.x + b.width, y: b.y + b.height },
      sw: { x: b.x, y: b.y + b.height },
    };
  }

  // --- Hit Testing ---

  function hitTestElement(el, pt) {
    if (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse' || el.type === 'text') {
      const minX = Math.min(el.x, el.x + el.width);
      const maxX = Math.max(el.x, el.x + el.width);
      const minY = Math.min(el.y, el.y + el.height);
      const maxY = Math.max(el.y, el.y + el.height);
      return pt.x >= minX - 4 && pt.x <= maxX + 4 && pt.y >= minY - 4 && pt.y <= maxY + 4;
    } else if (el.type === 'arrow' || el.type === 'line') {
      const p1 = { x: el.x + el.points[0][0], y: el.y + el.points[0][1] };
      const p2 = { x: el.x + el.points[1][0], y: el.y + el.points[1][1] };
      // Distance from point to line segment
      const d = distToSegment(pt, p1, p2);
      return d <= 8;
    }
    return false;
  }

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return distance(p.x, p.y, v.x, v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distance(p.x, p.y, v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
  }

  function hitTestTopElement(pt) {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      if (hitTestElement(state.elements[i], pt)) {
        return state.elements[i];
      }
    }
    return null;
  }

  // --- Pointer Event Handlers ---

  interactiveCanvas.addEventListener('pointerdown', (e) => {
    // If text editor is currently open and user clicked outside, commit active text
    if (state.editingText) {
      commitTextEditor();
      state.isDragging = false;
      return;
    }

    interactiveCanvas.setPointerCapture(e.pointerId);
    const scenePt = screenToScene(e.clientX, e.clientY);
    state.dragStart = { x: scenePt.x, y: scenePt.y };
    state.lastPointerScreen = { x: e.clientX, y: e.clientY };
    state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
    state.isDragging = true;

    // Middle click or Spacebar => Pan canvas
    if (e.button === 1 || state.spacePressed || state.activeTool === 'hand') {
      state.dragMode = 'pan';
      interactiveCanvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return; // Only left click for tools

    // Tool: Eraser
    if (state.activeTool === 'eraser') {
      state.dragMode = 'erase';
      eraseAtPoint(scenePt);
      return;
    }

    // Tool: Text Creation (SINGLE CLICK!)
    if (state.activeTool === 'text') {
      const hitEl = hitTestTopElement(scenePt);
      if (hitEl) {
        if (hitEl.type === 'text') {
          openTextEditor(hitEl.x, hitEl.y, hitEl);
        } else if (
          (hitEl.type === 'rectangle' || hitEl.type === 'diamond' || hitEl.type === 'ellipse') &&
          !e.ctrlKey &&
          !e.metaKey
        ) {
          const cx = hitEl.x + hitEl.width / 2;
          const cy = hitEl.y + hitEl.height / 2;
          const distToCenter = Math.hypot(scenePt.x - cx, scenePt.y - cy);
          // Only bind as container center text if clicking within 30px of the shape's center OR if container already has text
          if (hitEl.text || distToCenter < 30) {
            openTextEditorForContainer(hitEl);
          } else {
            // Free-floating text placed exactly at the click coordinates!
            openTextEditor(scenePt.x, scenePt.y);
          }
        } else {
          openTextEditor(scenePt.x, scenePt.y);
        }
      } else {
        openTextEditor(scenePt.x, scenePt.y);
      }
      state.isDragging = false;
      return;
    }

    // Tool: Shapes & Arrows (Drawing mode)
    if (state.activeTool !== 'selection') {
      state.dragMode = 'draw';
      const newEl = {
        id: generateId(),
        type: state.activeTool,
        x: scenePt.x,
        y: scenePt.y,
        width: 1,
        height: 1,
        strokeColor: state.strokeColor,
        backgroundColor: state.backgroundColor,
        strokeWidth: state.strokeWidth,
        roughness: state.roughness,
        seed: generateSeed(),
        points: [[0, 0], [1, 1]],
        startBinding: null,
        endBinding: null,
        boundElements: [],
        text: '',
        fontSize: 16,
      };

      // Check if arrow starts bound to an existing shape
      if (state.activeTool === 'arrow') {
        const target = findBindingTarget(scenePt);
        if (target) {
          newEl.startBinding = {
            elementId: target.elementId,
            fixedPoint: target.fixedPoint,
            gap: BASE_BINDING_GAP,
          };
          // Track on target element
          if (!target.element.boundElements) target.element.boundElements = [];
          target.element.boundElements.push({ id: newEl.id, type: 'arrow' });
        }
      }

      state.currentElement = newEl;
      renderInteractive();
      return;
    }

    // Tool: Selection
    const hitEl = hitTestTopElement(scenePt);
    if (hitEl) {
      if (!state.selectedIds.has(hitEl.id)) {
        if (!e.shiftKey) state.selectedIds.clear();
        state.selectedIds.add(hitEl.id);
      }
      state.dragMode = 'move';
      renderAll();
    } else {
      if (!e.shiftKey) state.selectedIds.clear();
      state.dragMode = 'boxSelect';
      state.boxSelectBounds = { x: scenePt.x, y: scenePt.y, w: 0, h: 0 };
      renderAll();
    }
  });

  interactiveCanvas.addEventListener('pointermove', (e) => {
    const scenePt = screenToScene(e.clientX, e.clientY);

    // Pan Mode
    if (state.dragMode === 'pan') {
      const dx = (e.clientX - state.lastPointerScreen.x) / state.zoom;
      const dy = (e.clientY - state.lastPointerScreen.y) / state.zoom;
      state.scrollX += dx;
      state.scrollY += dy;
      state.lastPointerScreen = { x: e.clientX, y: e.clientY };
      state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
      renderAll();
      return;
    }

    // Hover effect for Arrow Tool: live snap indicator
    if (state.activeTool === 'arrow' || (state.dragMode === 'draw' && state.currentElement?.type === 'arrow')) {
      const candidate = findBindingTarget(scenePt, state.currentElement?.id);
      if (candidate) {
        state.bindingCandidate = candidate;
      } else {
        state.bindingCandidate = null;
      }
      renderInteractive();
    }

    if (!state.isDragging) return;

    // Erase Mode
    if (state.dragMode === 'erase') {
      eraseAtPoint(scenePt);
      return;
    }

    // Move Mode (Dragging selected shapes)
    if (state.dragMode === 'move') {
      const dx = scenePt.x - state.lastPointerScene.x;
      const dy = scenePt.y - state.lastPointerScene.y;

      const selectedIdSet = state.selectedIds;
      const selectedElements = state.elements.filter((e) => selectedIdSet.has(e.id));
      const shapesMoved = new Set();

      // 1. Move non-arrow elements (rectangles, diamonds, ellipses, text)
      for (const el of selectedElements) {
        if (el.type !== 'arrow') {
          el.x += dx;
          el.y += dy;
          shapesMoved.add(el);
        }
      }

      // 2. Move arrows
      for (const el of selectedElements) {
        if (el.type === 'arrow') {
          const startShapeMoved = el.startBinding && selectedIdSet.has(el.startBinding.elementId);
          const endShapeMoved = el.endBinding && selectedIdSet.has(el.endBinding.elementId);

          if (startShapeMoved && endShapeMoved) {
            // Both bound shapes are moving together with the arrow;
            // updateBoundArrowsForShape will reposition arrow endpoints accurately
            continue;
          } else if (!el.startBinding && !el.endBinding) {
            // Free arrow without any bindings - translate points directly
            el.x += dx;
            el.y += dy;
          } else {
            // Partially bound arrow being dragged - translate and re-evaluate
            el.x += dx;
            el.y += dy;
            updateArrowPoints(el);
          }
        }
      }

      // 3. Update all bound arrows for shapes that moved
      for (const shape of shapesMoved) {
        updateBoundArrowsForShape(shape);
      }

      state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
      state.lastPointerScreen = { x: e.clientX, y: e.clientY };
      renderAll();
      return;
    }

    // Box Select Mode
    if (state.dragMode === 'boxSelect') {
      const minX = Math.min(state.dragStart.x, scenePt.x);
      const minY = Math.min(state.dragStart.y, scenePt.y);
      const w = Math.abs(scenePt.x - state.dragStart.x);
      const h = Math.abs(scenePt.y - state.dragStart.y);
      state.boxSelectBounds = { x: minX, y: minY, w, h };

      state.selectedIds.clear();
      for (const el of state.elements) {
        const b = getElementBounds(el);
        if (b.x < minX + w && b.x + b.width > minX && b.y < minY + h && b.y + b.height > minY) {
          state.selectedIds.add(el.id);
        }
      }
      renderInteractive();
      return;
    }

    // Draw Mode (Active element creation)
    if (state.dragMode === 'draw' && state.currentElement) {
      const el = state.currentElement;
      if (el.type === 'arrow' || el.type === 'line') {
        let endPt = scenePt;
        // Snap to target if hovering candidate
        if (state.bindingCandidate) {
          endPt = state.bindingCandidate.snapPoint;
        }
        el.points[1] = [endPt.x - el.x, endPt.y - el.y];
      } else {
        el.width = scenePt.x - el.x;
        el.height = scenePt.y - el.y;
      }
      renderInteractive();
    }
  });

  interactiveCanvas.addEventListener('pointerup', (e) => {
    if (!state.isDragging) return;
    state.isDragging = false;
    const scenePt = screenToScene(e.clientX, e.clientY);

    if (state.dragMode === 'pan') {
      state.dragMode = null;
      interactiveCanvas.style.cursor = state.activeTool === 'hand' ? 'grab' : 'default';
      return;
    }

    if (state.dragMode === 'move') {
      const movedDistance = distance(state.dragStart.x, state.dragStart.y, scenePt.x, scenePt.y);
      if (movedDistance > 2) {
        saveHistory();
      }
    }

    if (state.dragMode === 'draw' && state.currentElement) {
      const el = state.currentElement;

      // Finalize arrow end binding
      if (el.type === 'arrow') {
        const target = findBindingTarget(scenePt, el.id);
        if (target) {
          el.endBinding = {
            elementId: target.elementId,
            fixedPoint: target.fixedPoint,
            gap: BASE_BINDING_GAP,
          };
          if (!target.element.boundElements) target.element.boundElements = [];
          target.element.boundElements.push({ id: el.id, type: 'arrow' });
        }
        updateArrowPoints(el);
      }

      // Commit element if non-zero size
      const isTiny = (el.type === 'arrow' || el.type === 'line')
        ? distance(0, 0, el.points[1][0], el.points[1][1]) < 5
        : Math.abs(el.width) < 5 && Math.abs(el.height) < 5;

      if (!isTiny) {
        state.elements.push(el);
        saveHistory();
        if (!state.isLocked) {
          setTool('selection');
          state.selectedIds.clear();
          state.selectedIds.add(el.id);
        }
      }

      state.currentElement = null;
      state.bindingCandidate = null;
    }

    state.dragMode = null;
    state.boxSelectBounds = null;
    renderAll();
  });

  // --- Double-click to Edit Text or Create Container Text ---
  interactiveCanvas.addEventListener('dblclick', (e) => {
    const scenePt = screenToScene(e.clientX, e.clientY);
    const hitEl = hitTestTopElement(scenePt);

    if (hitEl) {
      if (hitEl.type === 'rectangle' || hitEl.type === 'diamond' || hitEl.type === 'ellipse') {
        openTextEditorForContainer(hitEl);
      } else if (hitEl.type === 'text') {
        openTextEditor(hitEl.x, hitEl.y, hitEl);
      }
    } else {
      openTextEditor(scenePt.x, scenePt.y);
    }
  });

  let isCommittingText = false;
  function commitTextEditor() {
    if (!state.editingText || isCommittingText) return;
    isCommittingText = true;

    const val = textEditor.value.trim();
    const { element, container, sceneX, sceneY } = state.editingText;
    state.editingText = null;
    textEditor.style.display = 'none';

    if (container) {
      container.text = val;
      saveHistory();
    } else if (element) {
      if (val) {
        element.text = val;
        updateTextElementSize(element);
      } else {
        state.elements = state.elements.filter((e) => e.id !== element.id);
        state.selectedIds.delete(element.id);
      }
      saveHistory();
    } else if (val) {
      const newText = {
        id: generateId(),
        type: 'text',
        x: sceneX,
        y: sceneY,
        width: 100,
        height: 30,
        text: val,
        strokeColor: state.strokeColor,
        fontSize: 18,
        roughness: 0,
        seed: generateSeed(),
      };
      updateTextElementSize(newText);
      state.elements.push(newText);
      state.selectedIds.clear(); // Seamless: no dashed selection boxes!
      saveHistory();
    }

    if (!state.isLocked) {
      setTool('selection');
    }

    renderAll();
    isCommittingText = false;
  }

  function updateTextElementSize(el) {
    if (!el || !el.text) return;
    staticCtx.save();
    staticCtx.font = `${el.fontSize || 18}px 'Excalifont', cursive, sans-serif`;
    const lines = el.text.split('\n');
    let maxW = 0;
    for (const line of lines) {
      const m = staticCtx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    }
    staticCtx.restore();
    const lineHeight = (el.fontSize || 18) * 1.35;
    el.width = Math.max(maxW + 16, 40);
    el.height = Math.max(lines.length * lineHeight, 28);
  }

  function openTextEditorForContainer(containerEl) {
    if (state.editingText) {
      commitTextEditor();
    }

    state.selectedIds.clear();
    state.editingText = {
      element: null,
      container: containerEl,
      sceneX: containerEl.x,
      sceneY: containerEl.y,
    };

    const cx = containerEl.x + containerEl.width / 2;
    const cy = containerEl.y + containerEl.height / 2;
    const screenCenter = sceneToScreen(cx, cy);
    const screenW = containerEl.width * state.zoom;
    const fontSize = (containerEl.fontSize || 16) * state.zoom;
    const lineHeight = fontSize * 1.35;
    const lines = (containerEl.text || 'A').split('\n');
    const estimatedH = Math.max(lines.length * lineHeight + 14, 38);
    const editorW = Math.max(screenW - 20, 120);

    textEditor.style.display = 'block';
    textEditor.style.width = editorW + 'px';
    textEditor.style.left = (screenCenter.x - editorW / 2) + 'px';
    textEditor.style.top = (screenCenter.y - estimatedH / 2) + 'px';
    textEditor.style.height = estimatedH + 'px';
    textEditor.style.textAlign = 'center';
    textEditor.style.fontSize = fontSize + 'px';
    textEditor.style.color = containerEl.strokeColor || '#1e1e1e';
    textEditor.value = containerEl.text || '';
    textEditor.scrollTop = 0;
    textEditor.scrollLeft = 0;

    renderAll();

    setTimeout(() => {
      textEditor.focus();
      if (containerEl.text) textEditor.select();
      textEditor.scrollTop = 0;
    }, 10);
  }

  function openTextEditor(sceneX, sceneY, existingEl = null) {
    if (state.editingText) {
      commitTextEditor();
    }

    state.selectedIds.clear();
    const x = existingEl ? existingEl.x : sceneX;
    const y = existingEl ? existingEl.y : sceneY;

    state.editingText = {
      element: existingEl,
      container: null,
      sceneX: x,
      sceneY: y,
    };

    const screenPos = sceneToScreen(x, y);
    const fontSize = (existingEl?.fontSize || 18) * state.zoom;
    const lineHeight = fontSize * 1.35;
    const lines = (existingEl?.text || 'A').split('\n');
    const height = Math.max(lines.length * lineHeight + 14, 38);
    const width = existingEl ? Math.max(existingEl.width * state.zoom + 24, 160) : 240;

    textEditor.style.display = 'block';
    textEditor.style.left = screenPos.x + 'px';
    textEditor.style.top = screenPos.y - 2 + 'px';
    textEditor.style.width = width + 'px';
    textEditor.style.height = height + 'px';
    textEditor.style.textAlign = 'left';
    textEditor.style.fontSize = fontSize + 'px';
    textEditor.style.color = existingEl ? (existingEl.strokeColor || state.strokeColor) : state.strokeColor;
    textEditor.value = existingEl ? existingEl.text : '';
    textEditor.scrollTop = 0;
    textEditor.scrollLeft = 0;

    renderAll();

    setTimeout(() => {
      textEditor.focus();
      if (existingEl) textEditor.select();
      textEditor.scrollTop = 0;
    }, 10);
  }

  textEditor.onblur = () => {
    commitTextEditor();
  };

  textEditor.onkeydown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      commitTextEditor();
    }
  };

  textEditor.addEventListener('input', () => {
    if (state.editingText?.container) {
      const containerEl = state.editingText.container;
      const cy = containerEl.y + containerEl.height / 2;
      const screenCenter = sceneToScreen(containerEl.x + containerEl.width / 2, cy);
      textEditor.style.height = 'auto';
      const newH = Math.max(textEditor.scrollHeight + 10, 38);
      textEditor.style.height = newH + 'px';
      textEditor.style.top = screenCenter.y - newH / 2 + 'px';
    } else {
      textEditor.style.width = 'auto';
      textEditor.style.width = Math.max(textEditor.scrollWidth + 24, 160) + 'px';
      textEditor.style.height = 'auto';
      textEditor.style.height = Math.max(textEditor.scrollHeight + 10, 38) + 'px';
    }
    textEditor.scrollTop = 0;
  });

  function eraseAtPoint(pt) {
    const hitEl = hitTestTopElement(pt);
    if (hitEl) {
      // Remove any bindings referencing this element
      for (const el of state.elements) {
        if (el.type === 'arrow') {
          if (el.startBinding?.elementId === hitEl.id) el.startBinding = null;
          if (el.endBinding?.elementId === hitEl.id) el.endBinding = null;
        }
      }
      state.elements = state.elements.filter((e) => e.id !== hitEl.id);
      state.selectedIds.delete(hitEl.id);
      saveHistory();
      renderAll();
    }
  }

  // --- Pan / Zoom Wheel Handler ---

  window.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (state.editingText) {
      commitTextEditor();
    }

    // Ctrl/Cmd + Wheel => Zoom around mouse cursor
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.1), 10.0);

      // Anchor zoom to mouse location
      const mouseSceneBefore = screenToScene(e.clientX, e.clientY);
      state.zoom = newZoom;
      const mouseSceneAfter = screenToScene(e.clientX, e.clientY);

      state.scrollX += mouseSceneAfter.x - mouseSceneBefore.x;
      state.scrollY += mouseSceneAfter.y - mouseSceneBefore.y;

      updateZoomDisplay();
      renderAll();
    } else {
      // Regular scroll => Pan canvas
      state.scrollX -= e.deltaX / state.zoom;
      state.scrollY -= e.deltaY / state.zoom;
      renderAll();
    }
  }, { passive: false });

  // --- Keyboard Shortcuts ---

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === textEditor) return;

    if (e.code === 'Space' && !state.spacePressed) {
      state.spacePressed = true;
      interactiveCanvas.style.cursor = 'grab';
    }

    if (e.key === 'v' || e.key === 'V' || e.key === '1') setTool('selection');
    if (e.key === 'h' || e.key === 'H') setTool('hand');
    if (e.key === 'r' || e.key === 'R' || e.key === '2') setTool('rectangle');
    if (e.key === 'd' || e.key === 'D' || e.key === '3') setTool('diamond');
    if (e.key === 'o' || e.key === 'O' || e.key === '4') setTool('ellipse');
    if (e.key === 'a' || e.key === 'A' || e.key === '5') setTool('arrow');
    if (e.key === 'l' || e.key === 'L' || e.key === '6') setTool('line');
    if (e.key === 't' || e.key === 'T' || e.key === '8') setTool('text');
    if (e.key === 'e' || e.key === 'E' || e.key === '0') setTool('eraser');

    // Delete selected elements
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (state.selectedIds.size > 0) {
        state.elements = state.elements.filter((el) => !state.selectedIds.has(el.id));
        state.selectedIds.clear();
        saveHistory();
        renderAll();
      }
    }

    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spacePressed = false;
      interactiveCanvas.style.cursor = state.activeTool === 'hand' ? 'grab' : 'default';
    }
  });

  // --- Toolbar & UI Binding ---

  function setTool(toolName) {
    state.activeTool = toolName;
    document.querySelectorAll('.tool-button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    interactiveCanvas.style.cursor = toolName === 'hand' ? 'grab' : (toolName === 'selection' ? 'default' : 'crosshair');
  }

  document.getElementById('toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-button');
    if (btn && btn.dataset.tool) {
      setTool(btn.dataset.tool);
    }
  });

  // Color Swatches
  document.getElementById('strokeColorPalette').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll('#strokeColorPalette .color-swatch').forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    state.strokeColor = swatch.dataset.color;

    // Apply to selected elements
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.strokeColor = state.strokeColor;
    }
    renderAll();
  });

  document.getElementById('bgColorPalette').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll('#bgColorPalette .color-swatch').forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    state.backgroundColor = swatch.dataset.color;

    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.backgroundColor = state.backgroundColor;
    }
    renderAll();
  });

  // Stroke Width
  document.getElementById('strokeWidthGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.group-btn');
    if (!btn) return;
    document.querySelectorAll('#strokeWidthGroup .group-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.strokeWidth = parseInt(btn.dataset.val, 10);

    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.strokeWidth = state.strokeWidth;
    }
    renderAll();
  });

  // Roughness
  document.getElementById('roughnessGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.group-btn');
    if (!btn) return;
    document.querySelectorAll('#roughnessGroup .group-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.roughness = parseFloat(btn.dataset.val);

    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.roughness = state.roughness;
    }
    renderAll();
  });

  // Zoom Controls
  document.getElementById('btnZoomIn').addEventListener('click', () => {
    state.zoom = Math.min(state.zoom * 1.2, 5.0);
    updateZoomDisplay();
    renderAll();
  });

  document.getElementById('btnZoomOut').addEventListener('click', () => {
    state.zoom = Math.max(state.zoom / 1.2, 0.2);
    updateZoomDisplay();
    renderAll();
  });

  zoomDisplay.addEventListener('click', () => {
    state.zoom = 1.0;
    state.scrollX = 0;
    state.scrollY = 0;
    updateZoomDisplay();
    renderAll();
  });

  function updateZoomDisplay() {
    zoomDisplay.textContent = Math.round(state.zoom * 100) + '%';
  }

  // Clear Canvas
  document.getElementById('btnClear').addEventListener('click', () => {
    if (confirm('Clear the entire canvas?')) {
      state.elements = [];
      state.selectedIds.clear();
      saveHistory();
      renderAll();
    }
  });

  // Export to PNG
  document.getElementById('btnExportPng').addEventListener('click', () => {
    exportToPng();
  });

  function exportToPng() {
    if (state.elements.length === 0) {
      alert('Canvas is empty.');
      return;
    }

    // Compute bounding box enclosing all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of state.elements) {
      const b = getElementBounds(el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    const padding = 50;
    const exportW = maxX - minX + padding * 2;
    const exportH = maxY - minY + padding * 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = exportW * 2;
    offscreen.height = exportH * 2;
    const ctx = offscreen.getContext('2d');
    ctx.scale(2, 2);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportW, exportH);

    ctx.translate(-minX + padding, -minY + padding);
    const rc = rough.canvas(offscreen);

    for (const el of state.elements) {
      drawElement(ctx, rc, el);
    }

    const link = document.createElement('a');
    link.download = 'mini-excalidraw-diagram.png';
    link.href = offscreen.toDataURL('image/png');
    link.click();
  }

  // --- History (Undo / Redo) ---
  function saveHistory() {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(JSON.stringify(state.elements));
    if (state.history.length > 50) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      state.elements = JSON.parse(state.history[state.historyIndex]);
      state.selectedIds.clear();
      renderAll();
    }
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      state.elements = JSON.parse(state.history[state.historyIndex]);
      state.selectedIds.clear();
      renderAll();
    }
  }

  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);

  // --- Demo Diagram Generator (Matches User's Screenshot!) ---
  document.getElementById('btnLoadDemo').addEventListener('click', loadDemoSecurityDiagram);

  function loadDemoSecurityDiagram() {
    state.elements = [];
    state.selectedIds.clear();

    const cx = window.innerWidth / 2 - 300;
    const cy = 180;

    // 1. Top Box: Attack
    const boxAttack = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 180,
      y: cy - 90,
      width: 150,
      height: 60,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 2,
      roughness: 1,
      seed: generateSeed(),
      text: 'Attack\n(Motive (goal) - Method - Vulnerability)',
      fontSize: 13,
      boundElements: [],
    };

    // 2. Middle Central: Security Principles
    const boxSec = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 160,
      y: cy + 70,
      width: 170,
      height: 85,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 2,
      roughness: 1,
      seed: generateSeed(),
      text: 'Security Principles\nConfidentiality\nIntegrity\nAvailability',
      fontSize: 13,
      boundElements: [],
    };

    // 3. Middle Left: (unlocked router)
    const elUnlocked = {
      id: generateId(),
      type: 'ellipse',
      x: cx - 20,
      y: cy + 40,
      width: 130,
      height: 40,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'unlocked router',
      fontSize: 13,
      boundElements: [],
    };

    // 4. Middle Bottom: (Notification after transfer money)
    const elNotification = {
      id: generateId(),
      type: 'ellipse',
      x: cx - 40,
      y: cy + 180,
      width: 190,
      height: 40,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'Notification after transfer money',
      fontSize: 12,
      boundElements: [],
    };

    // 5. Middle Right Top: (secure by default) -> install third party app -> open port
    const elSecure = {
      id: generateId(),
      type: 'ellipse',
      x: cx + 420,
      y: cy + 85,
      width: 110,
      height: 38,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'secure by default',
      fontSize: 12,
      boundElements: [],
    };

    const elOpenPort = {
      id: generateId(),
      type: 'ellipse',
      x: cx + 670,
      y: cy + 85,
      width: 90,
      height: 38,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'open port',
      fontSize: 12,
      boundElements: [],
    };

    const txtInstallApp = {
      id: generateId(),
      type: 'text',
      x: cx + 540,
      y: cy + 70,
      width: 120,
      height: 25,
      strokeColor: '#1e1e1e',
      text: 'install third party app',
      fontSize: 12,
      seed: generateSeed(),
    };

    // 6. Middle Right Bottom: ssl/tls encryption -> https
    const txtSSL = {
      id: generateId(),
      type: 'text',
      x: cx + 460,
      y: cy + 150,
      width: 100,
      height: 30,
      strokeColor: '#1e1e1e',
      text: 'ssl/tls encryption',
      fontSize: 13,
      seed: generateSeed(),
    };

    const elHttps = {
      id: generateId(),
      type: 'ellipse',
      x: cx + 670,
      y: cy + 145,
      width: 75,
      height: 38,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'https',
      fontSize: 13,
      boundElements: [],
    };

    // 7. Bottom Workflow Sequence (4 green rounded boxes connected by green arrows!)
    const stepY = cy + 320;
    const boxStep1 = {
      id: generateId(),
      type: 'rectangle',
      x: cx - 180,
      y: stepY,
      width: 130,
      height: 44,
      strokeColor: '#2b8a3e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'check the documents',
      fontSize: 12,
      boundElements: [],
    };

    const boxStep2 = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 40,
      y: stepY,
      width: 130,
      height: 44,
      strokeColor: '#2b8a3e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'Check CKO / SEF list',
      fontSize: 12,
      boundElements: [],
    };

    const boxStep3 = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 250,
      y: stepY,
      width: 140,
      height: 44,
      strokeColor: '#2b8a3e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'Prepare escort documents',
      fontSize: 12,
      boundElements: [],
    };

    const boxStep4 = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 470,
      y: stepY,
      width: 160,
      height: 44,
      strokeColor: '#2b8a3e',
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      text: 'Customs clearance and delivery',
      fontSize: 12,
      boundElements: [],
    };

    // Helper to create smart bound arrow
    function createBoundArrow(fromEl, toEl, color = '#1e1e1e') {
      const arrow = {
        id: generateId(),
        type: 'arrow',
        x: fromEl.x + fromEl.width / 2,
        y: fromEl.y + fromEl.height / 2,
        width: 10,
        height: 10,
        strokeColor: color,
        backgroundColor: 'transparent',
        strokeWidth: 1.5,
        roughness: 1,
        seed: generateSeed(),
        points: [[0, 0], [10, 10]],
        startBinding: {
          elementId: fromEl.id,
          fixedPoint: [0.5, 0.5],
          gap: BASE_BINDING_GAP,
        },
        endBinding: {
          elementId: toEl.id,
          fixedPoint: [0.5, 0.5],
          gap: BASE_BINDING_GAP,
        },
      };

      if (!fromEl.boundElements) fromEl.boundElements = [];
      if (!toEl.boundElements) toEl.boundElements = [];
      fromEl.boundElements.push({ id: arrow.id, type: 'arrow' });
      toEl.boundElements.push({ id: arrow.id, type: 'arrow' });

      updateArrowPoints(arrow);
      return arrow;
    }

    // Connect middle elements with bound arrows
    const arrow1 = createBoundArrow(elUnlocked, boxSec);
    const arrow2 = createBoundArrow(boxSec, elNotification);
    const arrow3 = createBoundArrow(elSecure, elOpenPort);
    const arrow4 = {
      id: generateId(),
      type: 'arrow',
      x: cx + 580,
      y: cy + 162,
      width: 70,
      height: 10,
      strokeColor: '#1e1e1e',
      strokeWidth: 1.5,
      roughness: 1,
      seed: generateSeed(),
      points: [[0, 0], [70, 0]],
      startBinding: null,
      endBinding: {
        elementId: elHttps.id,
        fixedPoint: [0, 0.5],
        gap: BASE_BINDING_GAP,
      },
    };
    updateArrowPoints(arrow4);

    // Connect workflow step sequence with green bound arrows!
    const arrowWorkflow1 = createBoundArrow(boxStep1, boxStep2, '#2b8a3e');
    const arrowWorkflow2 = createBoundArrow(boxStep2, boxStep3, '#2b8a3e');
    const arrowWorkflow3 = createBoundArrow(boxStep3, boxStep4, '#2b8a3e');

    // Register all elements
    state.elements = [
      boxAttack,
      boxSec,
      elUnlocked,
      elNotification,
      elSecure,
      txtInstallApp,
      elOpenPort,
      txtSSL,
      elHttps,
      boxStep1,
      boxStep2,
      boxStep3,
      boxStep4,
      arrow1,
      arrow2,
      arrow3,
      arrow4,
      arrowWorkflow1,
      arrowWorkflow2,
      arrowWorkflow3,
    ];

    // Recalculate all arrow endpoints now that shapes exist in state.elements!
    for (const el of state.elements) {
      if (el.type === 'arrow') {
        updateArrowPoints(el);
      }
    }

    saveHistory();
    renderAll();
  }

  // --- Initialize ---
  resizeCanvases();
  saveHistory();

  // Load the initial demo so the user immediately sees the diagram from the screenshot!
  loadDemoSecurityDiagram();

  window.drawo = { state, renderAll, screenToScene, sceneToScreen };
  window.__miniExcalidraw = window.drawo;
})();
