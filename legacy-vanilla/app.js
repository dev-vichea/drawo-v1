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
    dragMode: null, // 'draw' | 'move' | 'pan' | 'boxSelect' | 'resize' | 'rotate' | 'dragPoint'
    dragStart: { x: 0, y: 0 },
    lastPointerScreen: { x: 0, y: 0 },
    lastPointerScene: { x: 0, y: 0 },
    spacePressed: false,
    resizeHandle: null,
    resizeOrigBounds: null,
    resizeOrigElement: null,
    rotateElement: null,
    draggingPoint: null,

    // Live drawing / binding
    currentElement: null,
    multiPointElement: null,
    bindingCandidate: null, // { elementId, fixedPoint: [rx, ry], point: [x,y] }
    boxSelectBounds: null,

    // Eraser state
    elementsToErase: new Set(),
    eraserTrail: [],
    pointerInsideCanvas: false,

    // Styling defaults
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    stickyBgColor: '#fff3bf',
    strokeWidth: 2,
    strokeStyle: 'solid', // 'solid' | 'dashed' | 'dotted'
    roughness: 1,
    arrowType: 'straight', // 'straight' | 'curved' | 'elbow'
    startArrowhead: 'none', // 'none' | 'arrow'
    endArrowhead: 'arrow', // 'none' | 'arrow'
    roundness: 'round', // 'sharp' | 'round'
    opacity: 100, // 0 - 100

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
    if (shape.type === 'rectangle' || shape.type === 'stickynote') {
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

    const lastIdx = arrow.points.length - 1;
    let pStart = { x: arrow.x + arrow.points[0][0], y: arrow.y + arrow.points[0][1] };
    let pEnd = { x: arrow.x + arrow.points[lastIdx][0], y: arrow.y + arrow.points[lastIdx][1] };

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

    // Update arrow root (x,y) and relative points preserving intermediate points
    if (arrow.points.length === 2) {
      arrow.x = pStart.x;
      arrow.y = pStart.y;
      arrow.points = [
        [0, 0],
        [pEnd.x - pStart.x, pEnd.y - pStart.y],
      ];
    } else {
      const dx = pStart.x - arrow.x;
      const dy = pStart.y - arrow.y;
      arrow.x = pStart.x;
      arrow.y = pStart.y;
      for (let i = 1; i < lastIdx; i++) {
        arrow.points[i] = [arrow.points[i][0] - dx, arrow.points[i][1] - dy];
      }
      arrow.points[0] = [0, 0];
      arrow.points[lastIdx] = [pEnd.x - pStart.x, pEnd.y - pStart.y];
    }
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
    updatePropertiesPanel();
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

  function getRoundedRectPath(x, y, w, h, r = 10) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    return `M ${x + r} ${y} ` +
           `L ${x + w - r} ${y} ` +
           `A ${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
           `L ${x + w} ${y + h - r} ` +
           `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
           `L ${x + r} ${y + h} ` +
           `A ${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
           `L ${x} ${y + r} ` +
           `A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }

  /**
   * Draws custom arrowheads matching Excalidraw's exact geometry and types
   */
  function drawArrowhead(ctx, rc, tipX, tipY, angle, type, color, strokeWidth, roughOpts) {
    if (!type || type === 'none') return;
    const baseLen = Math.max(12, 14 + (strokeWidth - 1) * 2);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const bx = -dx;
    const by = -dy;
    const nx = -dy;
    const ny = dx;

    if (type === 'arrow') {
      const arrowAngle = 0.45;
      const barb1X = tipX + baseLen * Math.cos(angle + Math.PI - arrowAngle);
      const barb1Y = tipY + baseLen * Math.sin(angle + Math.PI - arrowAngle);
      const barb2X = tipX + baseLen * Math.cos(angle + Math.PI + arrowAngle);
      const barb2Y = tipY + baseLen * Math.sin(angle + Math.PI + arrowAngle);
      rc.line(tipX, tipY, barb1X, barb1Y, roughOpts);
      rc.line(tipX, tipY, barb2X, barb2Y, roughOpts);
    } else if (type === 'triangle' || type === 'triangle_outline') {
      const triLen = baseLen * 0.95;
      const halfW = triLen * 0.45;
      const baseX = tipX + triLen * bx;
      const baseY = tipY + triLen * by;
      const c1 = [baseX + halfW * nx, baseY + halfW * ny];
      const c2 = [baseX - halfW * nx, baseY - halfW * ny];
      rc.polygon([[tipX, tipY], c1, c2], {
        ...roughOpts,
        fill: type === 'triangle' ? color : '#ffffff',
        fillStyle: 'solid',
      });
    } else if (type === 'circle' || type === 'circle_outline') {
      const diam = baseLen * 0.65;
      const radius = diam / 2;
      const cx = tipX + radius * bx;
      const cy = tipY + radius * by;
      rc.circle(cx, cy, diam, {
        ...roughOpts,
        fill: type === 'circle' ? color : '#ffffff',
        fillStyle: 'solid',
      });
    } else if (type === 'bar') {
      const barW = baseLen * 0.6;
      rc.line(tipX + barW * nx, tipY + barW * ny, tipX - barW * nx, tipY - barW * ny, roughOpts);
    } else if (type === 'diamond' || type === 'diamond_outline') {
      const dLen = baseLen * 0.95;
      const halfW = dLen * 0.4;
      const midX = tipX + (dLen / 2) * bx;
      const midY = tipY + (dLen / 2) * by;
      const backX = tipX + dLen * bx;
      const backY = tipY + dLen * by;
      const c1 = [midX + halfW * nx, midY + halfW * ny];
      const c2 = [midX - halfW * nx, midY - halfW * ny];
      rc.polygon([[tipX, tipY], c1, [backX, backY], c2], {
        ...roughOpts,
        fill: type === 'diamond' ? color : '#ffffff',
        fillStyle: 'solid',
      });
    } else if (type === 'crowfoot_many') {
      const forkLen = baseLen * 0.95;
      const halfW = forkLen * 0.45;
      const baseX = tipX + forkLen * bx;
      const baseY = tipY + forkLen * by;
      const left = [baseX + halfW * nx, baseY + halfW * ny];
      const right = [baseX - halfW * nx, baseY - halfW * ny];
      rc.line(tipX, tipY, left[0], left[1], roughOpts);
      rc.line(tipX, tipY, right[0], right[1], roughOpts);
      rc.line(tipX, tipY, baseX, baseY, roughOpts);
    } else if (type === 'crowfoot_one') {
      const barW = baseLen * 0.55;
      const b1X = tipX + (baseLen * 0.35) * bx;
      const b1Y = tipY + (baseLen * 0.35) * by;
      const b2X = tipX + (baseLen * 0.75) * bx;
      const b2Y = tipY + (baseLen * 0.75) * by;
      rc.line(b1X + barW * nx, b1Y + barW * ny, b1X - barW * nx, b1Y - barW * ny, roughOpts);
      rc.line(b2X + barW * nx, b2Y + barW * ny, b2X - barW * nx, b2Y - barW * ny, roughOpts);
    } else if (type === 'crowfoot_one_or_many') {
      const forkLen = baseLen * 0.95;
      const halfW = forkLen * 0.45;
      const baseX = tipX + forkLen * bx;
      const baseY = tipY + forkLen * by;
      const left = [baseX + halfW * nx, baseY + halfW * ny];
      const right = [baseX - halfW * nx, baseY - halfW * ny];
      rc.line(tipX, tipY, left[0], left[1], roughOpts);
      rc.line(tipX, tipY, right[0], right[1], roughOpts);
      rc.line(tipX, tipY, baseX, baseY, roughOpts);
      const barW = baseLen * 0.55;
      const barX = tipX + (baseLen * 1.1) * bx;
      const barY = tipY + (baseLen * 1.1) * by;
      rc.line(barX + barW * nx, barY + barW * ny, barX - barW * nx, barY - barW * ny, roughOpts);
    }
  }

  /**
   * Draws a single element with hand-drawn aesthetic
   */
  function drawElement(ctx, rc, el) {
    ctx.save();
    let alpha = 1.0;
    if (el.opacity !== undefined && el.opacity !== null) {
      alpha = Math.max(0, Math.min(1, el.opacity / 100));
    }
    if (state.elementsToErase && state.elementsToErase.has(el.id)) {
      alpha = Math.min(alpha, 0.22);
    }
    ctx.globalAlpha = alpha;

    if (el.angle) {
      const b = getElementBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(el.angle);
      ctx.translate(-cx, -cy);
    }

    let strokeLineDash = [];
    if (el.strokeStyle === 'dashed') strokeLineDash = [8, 8];
    else if (el.strokeStyle === 'dotted') strokeLineDash = [2, 6];

    const roughOpts = {
      seed: el.seed,
      stroke: el.strokeColor || '#1e1e1e',
      strokeWidth: el.strokeWidth || 2,
      roughness: el.roughness ?? 1,
      strokeLineDash,
      fill: el.backgroundColor !== 'transparent' && el.backgroundColor ? el.backgroundColor : undefined,
      fillStyle: el.backgroundColor !== 'transparent' && el.backgroundColor ? 'solid' : undefined,
    };

    if (el.type === 'rectangle') {
      const minX = Math.min(el.x, el.x + el.width);
      const minY = Math.min(el.y, el.y + el.height);
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      if (el.roundness === 'round') {
        rc.path(getRoundedRectPath(minX, minY, w, h, 10), roughOpts);
      } else {
        rc.rectangle(minX, minY, w, h, roughOpts);
      }
      drawContainerText(ctx, el);
    } else if (el.type === 'stickynote') {
      const minX = Math.min(el.x, el.x + el.width);
      const minY = Math.min(el.y, el.y + el.height);
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;
      if (el.roundness === 'round') {
        rc.path(getRoundedRectPath(minX, minY, w, h, 8), roughOpts);
      } else {
        rc.rectangle(minX, minY, w, h, roughOpts);
      }
      ctx.restore();
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
    } else if (el.type === 'line' || el.type === 'arrow') {
      const absPoints = el.points.map((pt) => [el.x + pt[0], el.y + pt[1]]);
      const arrowType = el.arrowType || 'straight';
      let endAngle = 0;
      let startAngle = 0;

      if (absPoints.length === 2) {
        const p1 = absPoints[0];
        const p2 = absPoints[1];

        if (arrowType === 'curved') {
          const mx = (p1[0] + p2[0]) / 2;
          const my = (p1[1] + p2[1]) / 2;
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const dist = Math.hypot(dx, dy) || 1;
          const curveOffset = Math.min(dist * 0.22, 45);
          const nx = -dy / dist;
          const ny = dx / dist;
          const cx = mx + nx * curveOffset;
          const cy = my + ny * curveOffset;

          rc.curve([p1, [cx, cy], p2], roughOpts);
          endAngle = Math.atan2(p2[1] - cy, p2[0] - cx);
          startAngle = Math.atan2(p1[1] - cy, p1[0] - cx);
        } else if (arrowType === 'elbow') {
          const midX = (p1[0] + p2[0]) / 2;
          const c1 = [midX, p1[1]];
          const c2 = [midX, p2[1]];
          rc.linearPath([p1, c1, c2, p2], roughOpts);
          endAngle = Math.atan2(p2[1] - c2[1], p2[0] - c2[0]);
          startAngle = Math.atan2(p1[1] - c1[1], p1[0] - c1[0]);
        } else {
          rc.line(p1[0], p1[1], p2[0], p2[1], roughOpts);
          endAngle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
          startAngle = Math.atan2(p1[1] - p2[1], p1[0] - p2[0]);
        }
      } else {
        // Multi-point linear element! (3 or more vertices)
        if (arrowType === 'curved') {
          rc.curve(absPoints, roughOpts);
        } else if (arrowType === 'elbow') {
          const elbowPath = [absPoints[0]];
          for (let i = 0; i < absPoints.length - 1; i++) {
            const pA = absPoints[i];
            const pB = absPoints[i + 1];
            const midX = (pA[0] + pB[0]) / 2;
            elbowPath.push([midX, pA[1]]);
            elbowPath.push([midX, pB[1]]);
            elbowPath.push(pB);
          }
          rc.linearPath(elbowPath, roughOpts);
        } else {
          rc.linearPath(absPoints, roughOpts);
        }

        const last = absPoints.length - 1;
        endAngle = Math.atan2(absPoints[last][1] - absPoints[last - 1][1], absPoints[last][0] - absPoints[last - 1][0]);
        startAngle = Math.atan2(absPoints[0][1] - absPoints[1][1], absPoints[0][0] - absPoints[1][0]);
      }

      // Draw custom arrowheads if type === 'arrow'
      if (el.type === 'arrow') {
        const last = absPoints.length - 1;
        if (el.startArrowhead && el.startArrowhead !== 'none') {
          drawArrowhead(
            ctx,
            rc,
            absPoints[0][0],
            absPoints[0][1],
            startAngle,
            el.startArrowhead,
            el.strokeColor || '#1e1e1e',
            el.strokeWidth || 2,
            roughOpts
          );
        }
        if (el.endArrowhead && el.endArrowhead !== 'none') {
          drawArrowhead(
            ctx,
            rc,
            absPoints[last][0],
            absPoints[last][1],
            endAngle,
            el.endArrowhead,
            el.strokeColor || '#1e1e1e',
            el.strokeWidth || 2,
            roughOpts
          );
        }
      }
    } else if (el.type === 'text') {
      drawTextElement(ctx, el);
    }

    ctx.restore();
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
    const fontSize = el.fontSize || 20;
    ctx.font = `${fontSize}px 'Excalifont', cursive, sans-serif`;
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const lines = el.text.split('\n');
    const lineHeight = fontSize * 1.25;
    // Excalidraw font metrics: unitsPerEm = 1000, ascender = 886, descender = -374
    const fontSizeEm = fontSize / 1000;
    const lineGap = (lineHeight - fontSizeEm * 886 - fontSizeEm * 374) / 2;
    const verticalOffset = fontSizeEm * 886 + lineGap;

    lines.forEach((line, i) => {
      ctx.fillText(line, el.x, el.y + i * lineHeight + verticalOffset);
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

    // 1. Draw live element being created (single stroke drag)
    if (state.currentElement && state.dragMode === 'draw') {
      if (roughInteractive) {
        drawElement(interactiveCtx, roughInteractive, state.currentElement);
      }
    }

    // 1b. Draw active multi-point arrow or line being drawn (click-to-draw mode)
    if (state.multiPointElement) {
      if (roughInteractive) {
        drawElement(interactiveCtx, roughInteractive, state.multiPointElement);
      }
      const el = state.multiPointElement;
      interactiveCtx.save();
      for (let i = 0; i < el.points.length; i++) {
        const px = el.x + el.points[i][0];
        const py = el.y + el.points[i][1];
        const isTrailing = (i === el.points.length - 1);
        interactiveCtx.fillStyle = isTrailing ? 'rgba(76, 110, 245, 0.3)' : '#ffffff';
        interactiveCtx.strokeStyle = '#4c6ef5';
        interactiveCtx.lineWidth = 1.6 / state.zoom;
        interactiveCtx.beginPath();
        interactiveCtx.arc(px, py, (isTrailing ? 4 : 5) / state.zoom, 0, Math.PI * 2);
        interactiveCtx.fill();
        interactiveCtx.stroke();
      }
      interactiveCtx.restore();
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
      if (el.type === 'rectangle' || el.type === 'stickynote') {
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

        if (el.type === 'arrow' || el.type === 'line') {
          const isStraight2Pt = el.points.length === 2 && (el.arrowType === 'straight' || el.arrowType === 'sharp' || !el.arrowType);

          interactiveCtx.save();

          // Curved or multi-point linear elements HAVE bounding box, corner handles, and rotation handle!
          // Straight 2-point linear elements have NO bounding box, NO corner handles, NO rotation handle!
          if (!isStraight2Pt) {
            const bounds = getElementBounds(el);
            interactiveCtx.strokeStyle = 'rgba(105, 101, 219, 0.5)';
            interactiveCtx.lineWidth = 1 / state.zoom;
            interactiveCtx.setLineDash([]);
            interactiveCtx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

            // Corner handles on bounds
            const handles = getHandleCoordinates(bounds);
            const handleSize = 6 / state.zoom;
            interactiveCtx.fillStyle = '#ffffff';
            interactiveCtx.strokeStyle = '#6965db';
            interactiveCtx.lineWidth = 1.2 / state.zoom;
            for (const h of Object.values(handles)) {
              interactiveCtx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
              interactiveCtx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            }

            // Top rotation handle
            const rotX = bounds.x + bounds.width / 2;
            const rotY = bounds.y - 18 / state.zoom;
            interactiveCtx.fillStyle = '#ffffff';
            interactiveCtx.strokeStyle = '#6965db';
            interactiveCtx.lineWidth = 1.2 / state.zoom;
            interactiveCtx.beginPath();
            interactiveCtx.arc(rotX, rotY, 3.5 / state.zoom, 0, Math.PI * 2);
            interactiveCtx.fill();
            interactiveCtx.stroke();
          }

          const absPts = el.points.map((p) => ({ x: el.x + p[0], y: el.y + p[1] }));

          // Midpoint handles (insert new vertex by dragging)
          // Solid lavender circle directly on line / curve (matching Image 2)
          for (let i = 0; i < absPts.length - 1; i++) {
            let mx = (absPts[i].x + absPts[i + 1].x) / 2;
            let my = (absPts[i].y + absPts[i + 1].y) / 2;
            if (el.arrowType === 'curved' && el.points.length === 2) {
              const dx = absPts[1].x - absPts[0].x;
              const dy = absPts[1].y - absPts[0].y;
              const dist = Math.hypot(dx, dy) || 1;
              const curveOffset = Math.min(dist * 0.22, 45);
              mx += (-dy / dist) * curveOffset;
              my += (dx / dist) * curveOffset;
            }
            interactiveCtx.fillStyle = '#b2b0ec';
            interactiveCtx.beginPath();
            interactiveCtx.arc(mx, my, 4.5 / state.zoom, 0, Math.PI * 2);
            interactiveCtx.fill();
          }

          // Vertex handles (movable control points/dots) - matching Image 1 & 2
          for (let i = 0; i < absPts.length; i++) {
            interactiveCtx.fillStyle = '#ffffff';
            interactiveCtx.strokeStyle = '#4c6ef5';
            interactiveCtx.lineWidth = 1.8 / state.zoom;
            interactiveCtx.beginPath();
            interactiveCtx.arc(absPts[i].x, absPts[i].y, 5.5 / state.zoom, 0, Math.PI * 2);
            interactiveCtx.fill();
            interactiveCtx.stroke();
          }

          interactiveCtx.restore();
        } else {
          // Standard Box Elements (Rectangles, Ellipses, Sticky Notes, Diamonds, Text)
          const bounds = getElementBounds(el);
          interactiveCtx.save();
          if (el.angle) {
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            interactiveCtx.translate(cx, cy);
            interactiveCtx.rotate(el.angle);
            interactiveCtx.translate(-cx, -cy);
          }

          // Tight selection box (0 padding, matching Excalidraw exactly!)
          interactiveCtx.strokeStyle = '#6965db';
          interactiveCtx.lineWidth = 1.5 / state.zoom;
          interactiveCtx.setLineDash([]);
          interactiveCtx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

          // 4 Corner handles
          interactiveCtx.fillStyle = '#ffffff';
          interactiveCtx.strokeStyle = '#6965db';
          interactiveCtx.lineWidth = 1.5 / state.zoom;

          const handles = getHandleCoordinates(bounds);
          const handleSize = 7 / state.zoom;

          for (const h of Object.values(handles)) {
            interactiveCtx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            interactiveCtx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          }

          // Top rotation handle
          const rotX = bounds.x + bounds.width / 2;
          const rotY = bounds.y - 18 / state.zoom;
          interactiveCtx.fillStyle = '#ffffff';
          interactiveCtx.strokeStyle = '#6965db';
          interactiveCtx.lineWidth = 1.5 / state.zoom;
          interactiveCtx.beginPath();
          interactiveCtx.arc(rotX, rotY, 4 / state.zoom, 0, Math.PI * 2);
          interactiveCtx.fill();
          interactiveCtx.stroke();

          interactiveCtx.restore();
        }
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

    // 5. Draw Eraser Trail
    const now = performance.now();
    if (state.eraserTrail && state.eraserTrail.length > 0) {
      state.eraserTrail = state.eraserTrail.filter((pt) => now - pt.time < 260);

      if (state.eraserTrail.length >= 2) {
        interactiveCtx.save();
        interactiveCtx.lineCap = 'round';
        interactiveCtx.lineJoin = 'round';

        const trail = state.eraserTrail;
        const total = trail.length;

        for (let i = 0; i < total - 1; i++) {
          const p1 = trail[i];
          const p2 = trail[i + 1];
          const age = now - p2.time;
          const timeFade = Math.max(0, 1 - age / 260);
          const posRatio = (i + 1) / total;
          const factor = posRatio * timeFade;

          const strokeW = Math.max(2, (3 + factor * 13) / state.zoom);
          const alpha = Math.min(0.25, 0.04 + factor * 0.18);

          interactiveCtx.beginPath();
          interactiveCtx.moveTo(p1.x, p1.y);
          interactiveCtx.lineTo(p2.x, p2.y);
          interactiveCtx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
          interactiveCtx.lineWidth = strokeW;
          interactiveCtx.stroke();
        }

        interactiveCtx.restore();
      }

      if (state.eraserTrail.length > 0) {
        requestAnimationFrame(renderInteractive);
      }
    }

    // 6. Draw Eraser Circular Cursor Reticle
    if (state.activeTool === 'eraser' && state.pointerInsideCanvas) {
      const pt = state.lastPointerScene;
      if (pt && pt.x !== undefined && pt.y !== undefined) {
        interactiveCtx.save();

        interactiveCtx.beginPath();
        interactiveCtx.arc(pt.x, pt.y, 9 / state.zoom, 0, Math.PI * 2);
        interactiveCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        interactiveCtx.fill();
        interactiveCtx.lineWidth = 1.4 / state.zoom;
        interactiveCtx.strokeStyle = 'rgba(30, 30, 30, 0.65)';
        interactiveCtx.stroke();

        interactiveCtx.beginPath();
        interactiveCtx.arc(pt.x, pt.y, 1.4 / state.zoom, 0, Math.PI * 2);
        interactiveCtx.fillStyle = 'rgba(30, 30, 30, 0.75)';
        interactiveCtx.fill();

        interactiveCtx.restore();
      }
    }
  }

  function getElementBounds(el) {
    if (el.type === 'arrow' || el.type === 'line') {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const pt of el.points) {
        const px = el.x + pt[0];
        const py = el.y + pt[1];
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      if (el.type === 'arrow' && el.arrowType === 'curved' && el.points.length === 2) {
        const p1 = { x: el.x + el.points[0][0], y: el.y + el.points[0][1] };
        const p2 = { x: el.x + el.points[1][0], y: el.y + el.points[1][1] };
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const curveOffset = Math.min(dist * 0.22, 45);
        const cx = mx + (-dy / dist) * curveOffset;
        const cy = my + (dx / dist) * curveOffset;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
      }
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
    const minX = Math.min(el.x, el.x + el.width);
    const minY = Math.min(el.y, el.y + el.height);
    const w = Math.abs(el.width);
    const h = Math.abs(el.height);
    // Zero arbitrary padding: frame selection hugs shapes directly!
    return { x: minX, y: minY, width: Math.max(1, w), height: Math.max(1, h) };
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

  function hitTestLinearHandles(pt) {
    if (state.selectedIds.size !== 1) return null;
    const selectedId = Array.from(state.selectedIds)[0];
    const el = state.elements.find((e) => e.id === selectedId);
    if (!el || (el.type !== 'arrow' && el.type !== 'line')) return null;

    const threshold = 10 / state.zoom;
    const absPts = el.points.map((p) => ({ x: el.x + p[0], y: el.y + p[1] }));

    // 1. Check existing vertex handles first
    for (let i = 0; i < absPts.length; i++) {
      if (distance(pt.x, pt.y, absPts[i].x, absPts[i].y) <= threshold) {
        return {
          type: 'vertex',
          element: el,
          pointIndex: i,
        };
      }
    }

    // 2. Check midpoint handles
    for (let i = 0; i < absPts.length - 1; i++) {
      let midX = (absPts[i].x + absPts[i + 1].x) / 2;
      let midY = (absPts[i].y + absPts[i + 1].y) / 2;
      if (el.arrowType === 'curved' && el.points.length === 2) {
        const dx = absPts[1].x - absPts[0].x;
        const dy = absPts[1].y - absPts[0].y;
        const dist = Math.hypot(dx, dy) || 1;
        const curveOffset = Math.min(dist * 0.22, 45);
        midX += (-dy / dist) * curveOffset;
        midY += (dx / dist) * curveOffset;
      }
      if (distance(pt.x, pt.y, midX, midY) <= threshold) {
        return {
          type: 'midpoint',
          element: el,
          insertIndex: i + 1,
          point: { x: midX, y: midY },
        };
      }
    }

    return null;
  }

  function hitTestSelectionHandles(scenePt) {
    if (state.selectedIds.size !== 1) return null;
    const selectedId = Array.from(state.selectedIds)[0];
    const el = state.elements.find((e) => e.id === selectedId);
    if (!el) return null;

    // Normal straight 2-point arrow has NO bounding box frame and NO corner/rotation handles!
    const isStraight2Pt = (el.type === 'arrow' || el.type === 'line') &&
                          el.points.length === 2 &&
                          (el.arrowType === 'straight' || el.arrowType === 'sharp' || !el.arrowType);
    if (isStraight2Pt) return null;

    const b = getElementBounds(el);
    let testPt = scenePt;
    if (el.angle) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const cos = Math.cos(-el.angle);
      const sin = Math.sin(-el.angle);
      const dx = scenePt.x - cx;
      const dy = scenePt.y - cy;
      testPt = {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      };
    }

    const threshold = 10 / state.zoom;

    // 1. Rotation handle at top center
    const rotX = b.x + b.width / 2;
    const rotY = b.y - 18 / state.zoom;
    if (distance(testPt.x, testPt.y, rotX, rotY) <= threshold) {
      return { type: 'rotation', element: el };
    }

    // 2. Corner resize handles
    const handles = {
      nw: { x: b.x, y: b.y },
      ne: { x: b.x + b.width, y: b.y },
      se: { x: b.x + b.width, y: b.y + b.height },
      sw: { x: b.x, y: b.y + b.height },
    };

    for (const [key, pt] of Object.entries(handles)) {
      if (distance(testPt.x, testPt.y, pt.x, pt.y) <= threshold) {
        return { type: 'resize', handle: key, element: el, bounds: b };
      }
    }

    return null;
  }

  function hitTestElement(el, pt, padding = 4) {
    let testPt = pt;
    if (el.angle && (el.type === 'rectangle' || el.type === 'stickynote' || el.type === 'diamond' || el.type === 'ellipse' || el.type === 'text')) {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const cos = Math.cos(-el.angle);
      const sin = Math.sin(-el.angle);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      testPt = {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      };
    }

    if (el.type === 'rectangle' || el.type === 'stickynote' || el.type === 'diamond' || el.type === 'ellipse' || el.type === 'text') {
      const minX = Math.min(el.x, el.x + el.width);
      const maxX = Math.max(el.x, el.x + el.width);
      const minY = Math.min(el.y, el.y + el.height);
      const maxY = Math.max(el.y, el.y + el.height);
      return testPt.x >= minX - padding && testPt.x <= maxX + padding && testPt.y >= minY - padding && testPt.y <= maxY + padding;
    } else if (el.type === 'arrow' || el.type === 'line') {
      const threshold = (12 / state.zoom) + padding;
      const pts = el.points.map((p) => ({ x: el.x + p[0], y: el.y + p[1] }));
      if (el.arrowType === 'curved' && pts.length === 2) {
        const p1 = pts[0];
        const p2 = pts[1];
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const curveOffset = Math.min(dist * 0.22, 45);
        const cx = mx + (-dy / dist) * curveOffset;
        const cy = my + (dx / dist) * curveOffset;
        for (let t = 0; t <= 1; t += 0.05) {
          const qx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cx + t * t * p2.x;
          const qy = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cy + t * t * p2.y;
          if (distance(pt.x, pt.y, qx, qy) <= threshold) return true;
        }
        return false;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegment(pt, pts[i], pts[i + 1]);
        if (d <= threshold) return true;
      }
      return false;
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

  function checkEraserCollision(p1, p2, isRevert) {
    const dist = distance(p1.x, p1.y, p2.x, p2.y);
    const stepSize = Math.max(4, 8 / state.zoom);
    const steps = Math.max(1, Math.ceil(dist / stepSize));
    const padding = 9 / state.zoom;
    let changed = false;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const pt = {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };

      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        if (hitTestElement(el, pt, padding)) {
          if (isRevert) {
            if (state.elementsToErase.has(el.id)) {
              state.elementsToErase.delete(el.id);
              changed = true;
            }
          } else {
            if (!state.elementsToErase.has(el.id)) {
              state.elementsToErase.add(el.id);
              changed = true;
            }
          }
        }
      }
    }
    return changed;
  }

  function commitEraser() {
    if (state.elementsToErase.size === 0) return;
    const toDelete = new Set(state.elementsToErase);
    for (const el of state.elements) {
      if (el.type === 'arrow') {
        if (el.startBinding && toDelete.has(el.startBinding.elementId)) el.startBinding = null;
        if (el.endBinding && toDelete.has(el.endBinding.elementId)) el.endBinding = null;
      }
    }
    state.elements = state.elements.filter((e) => !toDelete.has(e.id));
    for (const id of toDelete) {
      state.selectedIds.delete(id);
    }
    state.elementsToErase.clear();
    saveHistory();
    renderAll();
  }

  // --- Multi-point Arrow / Line Lifecycle ---

  function finishMultiPointDrawing() {
    if (!state.multiPointElement) return;
    const el = state.multiPointElement;
    state.multiPointElement = null;

    // Pop trailing preview point
    if (el.points.length > 2) {
      el.points.pop();
    }

    let totalLen = 0;
    for (let i = 1; i < el.points.length; i++) {
      totalLen += distance(el.points[i - 1][0], el.points[i - 1][1], el.points[i][0], el.points[i][1]);
    }

    if (totalLen > 6 && el.points.length >= 2) {
      if (el.type === 'arrow') {
        const lastPt = el.points[el.points.length - 1];
        const endScenePt = { x: el.x + lastPt[0], y: el.y + lastPt[1] };
        const target = findBindingTarget(endScenePt, el.id);
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

      state.elements.push(el);
      saveHistory();
      if (!state.isLocked) {
        setTool('selection');
        state.selectedIds.clear();
        state.selectedIds.add(el.id);
      }
    }

    state.bindingCandidate = null;
    renderAll();
    updatePropertiesPanel();
    updateToolbarHint();
  }

  function cancelOrFinishMultiPointDrawing() {
    if (!state.multiPointElement) return;
    if (state.multiPointElement.points.length > 2) {
      finishMultiPointDrawing();
    } else {
      state.multiPointElement = null;
      state.bindingCandidate = null;
      renderAll();
      updateToolbarHint();
    }
  }

  // --- Pointer Event Handlers ---

  interactiveCanvas.addEventListener('pointerdown', (e) => {
    // If text editor is currently open and user clicked outside, commit active text
    if (state.editingText) {
      commitTextEditor();
      state.isDragging = false;
      return;
    }

    try {
      interactiveCanvas.setPointerCapture(e.pointerId);
    } catch (_) {}
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

    // Active multi-point drawing mode (Arrow or Line)
    if (state.multiPointElement) {
      const el = state.multiPointElement;
      const pts = el.points;
      const lastPlacedIdx = pts.length - 2;
      const lastPlacedPt = {
        x: el.x + pts[lastPlacedIdx][0],
        y: el.y + pts[lastPlacedIdx][1],
      };
      const distToLast = distance(scenePt.x, scenePt.y, lastPlacedPt.x, lastPlacedPt.y);
      if (distToLast <= 14 / state.zoom) {
        finishMultiPointDrawing();
        return;
      }

      // Lock current point and append a new trailing preview point
      let targetPt = scenePt;
      if (state.bindingCandidate) targetPt = state.bindingCandidate.snapPoint;
      pts[pts.length - 1] = [targetPt.x - el.x, targetPt.y - el.y];
      pts.push([targetPt.x - el.x, targetPt.y - el.y]);
      renderInteractive();
      return;
    }

    // Tool: Eraser
    if (state.activeTool === 'eraser') {
      state.dragMode = 'erase';
      state.elementsToErase.clear();
      state.eraserTrail = [{ x: scenePt.x, y: scenePt.y, time: performance.now() }];
      const changed = checkEraserCollision(scenePt, scenePt, e.altKey);
      if (changed) renderAll();
      else renderInteractive();
      return;
    }

    // Tool: Text Creation (SINGLE CLICK!)
    if (state.activeTool === 'text') {
      const hitEl = hitTestTopElement(scenePt);
      if (hitEl) {
        if (hitEl.type === 'text') {
          openTextEditor(hitEl.x, hitEl.y, hitEl);
        } else if (
          (hitEl.type === 'rectangle' || hitEl.type === 'stickynote' || hitEl.type === 'diamond' || hitEl.type === 'ellipse') &&
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

    // Tool: Shapes, Sticky Notes & Arrows (Drawing mode)
    if (state.activeTool !== 'selection') {
      state.dragMode = 'draw';
      const isSticky = state.activeTool === 'stickynote';
      const newEl = {
        id: generateId(),
        type: state.activeTool,
        x: scenePt.x,
        y: scenePt.y,
        width: isSticky ? 180 : 1,
        height: isSticky ? 180 : 1,
        strokeColor: state.strokeColor,
        backgroundColor: isSticky ? (state.stickyBgColor || '#fff3bf') : state.backgroundColor,
        strokeWidth: state.strokeWidth,
        strokeStyle: state.strokeStyle,
        roughness: state.roughness,
        roundness: state.roundness,
        opacity: state.opacity,
        arrowType: state.arrowType,
        startArrowhead: state.startArrowhead,
        endArrowhead: state.endArrowhead,
        seed: generateSeed(),
        points: [[0, 0], [0, 0]],
        startBinding: null,
        endBinding: null,
        boundElements: [],
        text: '',
        fontSize: isSticky ? 18 : 16,
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
          if (!target.element.boundElements) target.element.boundElements = [];
          target.element.boundElements.push({ id: newEl.id, type: 'arrow' });
        }
      }

      state.currentElement = newEl;
      renderInteractive();
      return;
    }

    // Tool: Selection
    if (state.activeTool === 'selection') {
      // 1. Check linear handles (movable control dots)
      const handleHit = hitTestLinearHandles(scenePt);
      if (handleHit) {
        if (handleHit.type === 'midpoint') {
          const el = handleHit.element;
          const newPt = [scenePt.x - el.x, scenePt.y - el.y];
          el.points.splice(handleHit.insertIndex, 0, newPt);
          state.dragMode = 'dragPoint';
          state.draggingPoint = {
            elementId: el.id,
            pointIndex: handleHit.insertIndex,
          };
        } else {
          state.dragMode = 'dragPoint';
          state.draggingPoint = {
            elementId: handleHit.element.id,
            pointIndex: handleHit.pointIndex,
          };
        }
        renderAll();
        return;
      }

      // 2. Check selection handles (corner resize and top rotation)
      const selHandle = hitTestSelectionHandles(scenePt);
      if (selHandle) {
        if (selHandle.type === 'rotation') {
          state.dragMode = 'rotate';
          state.rotateElement = selHandle.element;
        } else if (selHandle.type === 'resize') {
          state.dragMode = 'resize';
          state.resizeHandle = selHandle.handle;
          state.resizeOrigBounds = { ...selHandle.bounds };
          state.resizeOrigElement = { ...selHandle.element };
        }
        return;
      }
    }

    const hitEl = hitTestTopElement(scenePt);
    if (hitEl) {
      if (!state.selectedIds.has(hitEl.id)) {
        if (!e.shiftKey) state.selectedIds.clear();
        state.selectedIds.add(hitEl.id);
      }
      state.dragMode = 'move';
      renderAll();
      updatePropertiesPanel();
    } else {
      if (!e.shiftKey) state.selectedIds.clear();
      state.dragMode = 'boxSelect';
      state.boxSelectBounds = { x: scenePt.x, y: scenePt.y, w: 0, h: 0 };
      renderAll();
      updatePropertiesPanel();
    }
  });

  interactiveCanvas.addEventListener('pointermove', (e) => {
    const scenePt = screenToScene(e.clientX, e.clientY);

    // 0. Active multi-point drawing preview follows cursor
    if (state.multiPointElement) {
      const el = state.multiPointElement;
      let targetPt = scenePt;
      if (el.type === 'arrow') {
        const cand = findBindingTarget(scenePt, el.id);
        state.bindingCandidate = cand;
        if (cand) targetPt = cand.snapPoint;
      }
      el.points[el.points.length - 1] = [targetPt.x - el.x, targetPt.y - el.y];
      renderInteractive();
      return;
    }

    // Rotate Mode
    if (state.dragMode === 'rotate' && state.rotateElement) {
      const el = state.rotateElement;
      const b = getElementBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      el.angle = Math.atan2(scenePt.y - cy, scenePt.x - cx) + Math.PI / 2;
      renderAll();
      return;
    }

    // Resize Mode
    if (state.dragMode === 'resize' && state.resizeOrigElement) {
      const el = state.elements.find((item) => item.id === state.resizeOrigElement.id);
      if (el) {
        const orig = state.resizeOrigBounds;
        const handle = state.resizeHandle;

        if (handle === 'se') {
          el.width = Math.max(10, scenePt.x - el.x);
          el.height = Math.max(10, scenePt.y - el.y);
        } else if (handle === 'sw') {
          const right = orig.x + orig.width;
          const newW = right - scenePt.x;
          if (newW > 10) {
            el.x = scenePt.x;
            el.width = newW;
          }
          el.height = Math.max(10, scenePt.y - el.y);
        } else if (handle === 'ne') {
          el.width = Math.max(10, scenePt.x - el.x);
          const bottom = orig.y + orig.height;
          const newH = bottom - scenePt.y;
          if (newH > 10) {
            el.y = scenePt.y;
            el.height = newH;
          }
        } else if (handle === 'nw') {
          const right = orig.x + orig.width;
          const bottom = orig.y + orig.height;
          const newW = right - scenePt.x;
          const newH = bottom - scenePt.y;
          if (newW > 10) {
            el.x = scenePt.x;
            el.width = newW;
          }
          if (newH > 10) {
            el.y = scenePt.y;
            el.height = newH;
          }
        }

        if (el.boundElements) {
          updateBoundArrowsForShape(el);
        }
        renderAll();
        return;
      }
    }

    // Dragging point handle of arrow/line
    if (state.dragMode === 'dragPoint' && state.draggingPoint) {
      const el = state.elements.find((elItem) => elItem.id === state.draggingPoint.elementId);
      if (el) {
        const idx = state.draggingPoint.pointIndex;
        let targetX = scenePt.x;
        let targetY = scenePt.y;

        // If dragging start or end point of an arrow, check for snap binding
        if (el.type === 'arrow' && (idx === 0 || idx === el.points.length - 1)) {
          const cand = findBindingTarget(scenePt, el.id);
          state.bindingCandidate = cand;
          if (cand) {
            targetX = cand.snapPoint.x;
            targetY = cand.snapPoint.y;
            if (idx === 0) {
              el.startBinding = {
                elementId: cand.elementId,
                fixedPoint: cand.fixedPoint,
                gap: BASE_BINDING_GAP,
              };
            } else {
              el.endBinding = {
                elementId: cand.elementId,
                fixedPoint: cand.fixedPoint,
                gap: BASE_BINDING_GAP,
              };
            }
          } else {
            if (idx === 0) el.startBinding = null;
            else el.endBinding = null;
          }
        }

        el.points[idx] = [targetX - el.x, targetY - el.y];
        renderAll();
        return;
      }
    }

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
    if (state.activeTool === 'arrow' || (state.dragMode === 'draw' && state.currentElement?.type === 'arrow') || state.multiPointElement?.type === 'arrow') {
      const candidate = findBindingTarget(scenePt, state.currentElement?.id || state.multiPointElement?.id);
      if (candidate) {
        state.bindingCandidate = candidate;
      } else {
        state.bindingCandidate = null;
      }
      renderInteractive();
    }

    if (!state.isDragging) {
      if (state.activeTool === 'eraser') {
        interactiveCanvas.style.cursor = 'none';
        state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
        state.lastPointerScreen = { x: e.clientX, y: e.clientY };
        renderInteractive();
        return;
      }
      if (state.activeTool === 'selection') {
        const handleHit = hitTestLinearHandles(scenePt);
        if (handleHit) {
          interactiveCanvas.style.cursor = 'grab';
        } else {
          const selHandle = hitTestSelectionHandles(scenePt);
          if (selHandle) {
            if (selHandle.type === 'rotation') {
              interactiveCanvas.style.cursor = 'grab';
            } else if (selHandle.handle === 'nw' || selHandle.handle === 'se') {
              interactiveCanvas.style.cursor = 'nwse-resize';
            } else {
              interactiveCanvas.style.cursor = 'nesw-resize';
            }
          } else {
            const hit = hitTestTopElement(scenePt);
            interactiveCanvas.style.cursor = hit ? 'move' : 'default';
          }
        }
      }
      return;
    }

    // Erase Mode
    if (state.dragMode === 'erase') {
      state.eraserTrail.push({ x: scenePt.x, y: scenePt.y, time: performance.now() });
      const changed = checkEraserCollision(state.lastPointerScene, scenePt, e.altKey);
      state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
      state.lastPointerScreen = { x: e.clientX, y: e.clientY };
      if (changed) renderAll();
      else renderInteractive();
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

    if (state.dragMode === 'erase') {
      state.dragMode = null;
      commitEraser();
      renderInteractive();
      return;
    }

    if (state.dragMode === 'rotate' || state.dragMode === 'resize') {
      saveHistory();
      state.dragMode = null;
      state.rotateElement = null;
      state.resizeHandle = null;
      state.resizeOrigBounds = null;
      state.resizeOrigElement = null;
      renderAll();
      return;
    }

    if (state.dragMode === 'dragPoint') {
      saveHistory();
      state.dragMode = null;
      state.draggingPoint = null;
      state.bindingCandidate = null;
      renderAll();
      return;
    }

    if (state.dragMode === 'pan') {
      state.dragMode = null;
      interactiveCanvas.style.cursor = state.activeTool === 'eraser' ? 'none' : (state.activeTool === 'hand' ? 'grab' : 'default');
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

      // Handle Arrow / Line creation: Single-stroke drag vs Click-to-draw
      if (el.type === 'arrow' || el.type === 'line') {
        const movedDist = distance(state.dragStart.x, state.dragStart.y, scenePt.x, scenePt.y);
        if (movedDist <= 6) {
          // USER CLICKED! Switch to active multi-point drawing mode
          state.multiPointElement = el;
          state.currentElement = null;
          state.dragMode = null;
          state.isDragging = false;
          updateToolbarHint();
          renderInteractive();
          return;
        } else {
          // USER DRAGGED! Finalize single-stroke arrow/line immediately
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
          state.elements.push(el);
          saveHistory();
          if (!state.isLocked) {
            setTool('selection');
            state.selectedIds.clear();
            state.selectedIds.add(el.id);
          }
          state.currentElement = null;
          state.bindingCandidate = null;
          state.dragMode = null;
          renderAll();
          updatePropertiesPanel();
          return;
        }
      }

      if (el.type === 'stickynote') {
        if (Math.abs(el.width) < 20 || Math.abs(el.height) < 20) {
          el.width = 180;
          el.height = 180;
        }
        state.elements.push(el);
        saveHistory();
        state.currentElement = null;
        state.bindingCandidate = null;
        state.dragMode = null;
        state.boxSelectBounds = null;
        if (!state.isLocked) {
          setTool('selection');
          state.selectedIds.clear();
          state.selectedIds.add(el.id);
        }
        renderAll();
        openTextEditorForContainer(el);
        return;
      }

      // Commit element if non-zero size
      const isTiny = Math.abs(el.width) < 5 && Math.abs(el.height) < 5;

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
    updatePropertiesPanel();
  });

  interactiveCanvas.addEventListener('pointerenter', (e) => {
    state.pointerInsideCanvas = true;
    if (state.activeTool === 'eraser') {
      interactiveCanvas.style.cursor = 'none';
      const scenePt = screenToScene(e.clientX, e.clientY);
      state.lastPointerScene = { x: scenePt.x, y: scenePt.y };
      renderInteractive();
    }
  });

  interactiveCanvas.addEventListener('pointerleave', () => {
    state.pointerInsideCanvas = false;
    if (state.activeTool === 'eraser') {
      renderInteractive();
    }
  });

  // --- Double-click to Edit Text or Create / Delete Linear Vertices ---
  interactiveCanvas.addEventListener('dblclick', (e) => {
    // If multi-point drawing is active, double click finishes drawing!
    if (state.multiPointElement) {
      finishMultiPointDrawing();
      return;
    }

    const scenePt = screenToScene(e.clientX, e.clientY);
    const hitEl = hitTestTopElement(scenePt);

    if (hitEl) {
      if (hitEl.type === 'arrow' || hitEl.type === 'line') {
        const handleHit = hitTestLinearHandles(scenePt);
        if (handleHit && handleHit.type === 'vertex' && handleHit.pointIndex > 0 && handleHit.pointIndex < hitEl.points.length - 1) {
          // Double-clicking an intermediate vertex removes it!
          hitEl.points.splice(handleHit.pointIndex, 1);
          saveHistory();
          renderAll();
          return;
        }

        // Double-clicking the line itself adds a new vertex at click point!
        const absPts = hitEl.points.map((p) => ({ x: hitEl.x + p[0], y: hitEl.y + p[1] }));
        let bestIdx = 1;
        let minD = Infinity;
        for (let i = 0; i < absPts.length - 1; i++) {
          const d = distToSegment(scenePt, absPts[i], absPts[i + 1]);
          if (d < minD) {
            minD = d;
            bestIdx = i + 1;
          }
        }
        hitEl.points.splice(bestIdx, 0, [scenePt.x - hitEl.x, scenePt.y - hitEl.y]);
        saveHistory();
        renderAll();
        return;
      } else if (hitEl.type === 'rectangle' || hitEl.type === 'diamond' || hitEl.type === 'ellipse' || hitEl.type === 'stickynote') {
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
        width: 0,
        height: 0,
        text: val,
        strokeColor: state.strokeColor,
        fontSize: 20,
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
    const fontSize = el.fontSize || 20;
    staticCtx.font = `${fontSize}px 'Excalifont', cursive, sans-serif`;
    const lines = el.text.split('\n');
    let maxW = 0;
    for (const line of lines) {
      const m = staticCtx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    }
    staticCtx.restore();
    const lineHeight = fontSize * 1.25;
    el.width = Math.ceil(maxW);
    el.height = Math.ceil(lines.length * lineHeight);
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
    const lineHeight = fontSize * 1.25;
    const lines = (containerEl.text || 'A').split('\n');
    const estimatedH = Math.max(lines.length * lineHeight, 28);
    const editorW = Math.max(screenW - 20, 120);

    textEditor.style.display = 'block';
    textEditor.style.width = editorW + 'px';
    textEditor.style.left = (screenCenter.x - editorW / 2) + 'px';
    textEditor.style.top = (screenCenter.y - estimatedH / 2) + 'px';
    textEditor.style.height = estimatedH + 'px';
    textEditor.style.textAlign = 'center';
    textEditor.style.fontSize = fontSize + 'px';
    textEditor.style.lineHeight = '1.25';
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
    const fontSize = (existingEl?.fontSize || 20) * state.zoom;
    const lineHeight = fontSize * 1.25;
    const lines = (existingEl?.text || 'A').split('\n');
    const height = Math.max(lines.length * lineHeight, 25);
    const width = existingEl ? Math.max(existingEl.width * state.zoom + 20, 120) : 200;

    textEditor.style.display = 'block';
    textEditor.style.left = screenPos.x + 'px';
    textEditor.style.top = screenPos.y + 'px';
    textEditor.style.width = width + 'px';
    textEditor.style.height = height + 'px';
    textEditor.style.textAlign = 'left';
    textEditor.style.fontSize = fontSize + 'px';
    textEditor.style.lineHeight = '1.25';
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
      const newH = Math.max(textEditor.scrollHeight, 28);
      textEditor.style.height = newH + 'px';
      textEditor.style.top = screenCenter.y - newH / 2 + 'px';
    } else {
      textEditor.style.width = 'auto';
      textEditor.style.width = Math.max(textEditor.scrollWidth + 20, 120) + 'px';
      textEditor.style.height = 'auto';
      textEditor.style.height = Math.max(textEditor.scrollHeight, 25) + 'px';
    }
    textEditor.scrollTop = 0;
  });

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

    // Arrowhead popover shortcuts (q, w, e, r)
    const keyMap = { q: 'none', w: 'arrow', e: 'triangle', r: 'triangle_outline' };
    const popStart = document.getElementById('popoverStartArrowhead');
    const popEnd = document.getElementById('popoverEndArrowhead');
    if (popStart && popStart.style.display !== 'none' && keyMap[e.key.toLowerCase()]) {
      const head = keyMap[e.key.toLowerCase()];
      state.startArrowhead = head;
      for (const id of state.selectedIds) {
        const el = state.elements.find((item) => item.id === id);
        if (el && el.type === 'arrow') el.startArrowhead = head;
      }
      saveHistory();
      renderAll();
      closeAllArrowheadPopovers();
      return;
    }
    if (popEnd && popEnd.style.display !== 'none' && keyMap[e.key.toLowerCase()]) {
      const head = keyMap[e.key.toLowerCase()];
      state.endArrowhead = head;
      for (const id of state.selectedIds) {
        const el = state.elements.find((item) => item.id === id);
        if (el && el.type === 'arrow') el.endArrowhead = head;
      }
      saveHistory();
      renderAll();
      closeAllArrowheadPopovers();
      return;
    }

    // Enter or Esc to finish or cancel multi-point drawing
    if (e.key === 'Enter') {
      if (state.multiPointElement) {
        finishMultiPointDrawing();
        return;
      }
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (state.multiPointElement) {
        cancelOrFinishMultiPointDrawing();
        return;
      }
    }

    if (e.code === 'Space' && !state.spacePressed) {
      state.spacePressed = true;
      interactiveCanvas.style.cursor = 'grab';
    }

    // Cycle arrow type if pressing 'a' while arrow tool is already active
    if (e.key === 'a' || e.key === 'A') {
      if (state.activeTool === 'arrow') {
        const types = ['straight', 'curved', 'elbow'];
        const nextIdx = (types.indexOf(state.arrowType) + 1) % types.length;
        state.arrowType = types[nextIdx];
        for (const id of state.selectedIds) {
          const el = state.elements.find(el => el.id === id);
          if (el && el.type === 'arrow') el.arrowType = state.arrowType;
        }
        renderAll();
        updatePropertiesPanel();
      } else {
        setTool('arrow');
      }
      return;
    }

    if (e.key === 'n' || e.key === 'N') setTool('stickynote');
    if (e.key === 'v' || e.key === 'V' || e.key === '1') setTool('selection');
    if (e.key === 'h' || e.key === 'H') setTool('hand');
    if (e.key === 'r' || e.key === 'R' || e.key === '2') setTool('rectangle');
    if (e.key === 'd' || e.key === 'D' || e.key === '3') setTool('diamond');
    if (e.key === 'o' || e.key === 'O' || e.key === '4') setTool('ellipse');
    if (e.key === 'l' || e.key === 'L' || e.key === '6') setTool('line');
    if (e.key === 't' || e.key === 'T' || e.key === '8') setTool('text');
    if (e.key === 'e' || e.key === 'E' || e.key === '0') setTool('eraser');

    // Duplicate (Cmd + D / Ctrl + D)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      document.getElementById('btnDuplicate').click();
      return;
    }

    // Delete selected elements
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (state.selectedIds.size > 0) {
        document.getElementById('btnDelete').click();
        return;
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
      interactiveCanvas.style.cursor = state.activeTool === 'eraser' ? 'none' : (state.activeTool === 'hand' ? 'grab' : 'default');
    }
  });

  // --- Toolbar & Dynamic Properties Panel ---

  function setTool(toolName) {
    if (state.multiPointElement && toolName !== state.multiPointElement.type) {
      cancelOrFinishMultiPointDrawing();
    }
    state.activeTool = toolName;
    document.querySelectorAll('.tool-button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    interactiveCanvas.style.cursor = toolName === 'eraser' ? 'none' : (toolName === 'hand' ? 'grab' : (toolName === 'selection' ? 'default' : 'crosshair'));
    updatePropertiesPanel();
    updateToolbarHint();
    renderInteractive();
  }

  function updateToolbarHint() {
    const hintEl = document.getElementById('toolbarHint');
    if (!hintEl) return;
    if (state.multiPointElement) {
      hintEl.innerHTML = 'Click on last point or press <kbd>Esc</kbd> or <kbd>Enter</kbd> to finish';
      return;
    }
    const tool = state.activeTool;
    if (tool === 'arrow') {
      hintEl.innerHTML = 'Click to start multiple points, drag for single line. Press <kbd>A</kbd> again to change arrow type.';
    } else if (tool === 'line') {
      hintEl.innerHTML = 'Click to start multiple points, drag for single line';
    } else if (tool === 'stickynote') {
      hintEl.innerHTML = 'Click anywhere to place a note, or drag to size it';
    } else if (tool === 'text') {
      hintEl.innerHTML = 'Click anywhere to write text, or double-click any shape to edit';
    } else if (tool === 'selection') {
      if (state.selectedIds.size > 0) {
        hintEl.innerHTML = 'Drag corners to resize, or drag top handle to rotate';
      } else {
        hintEl.innerHTML = 'To move canvas, hold <kbd>Space</kbd> while dragging, or use the hand tool';
      }
    } else if (tool === 'hand') {
      hintEl.innerHTML = 'Drag canvas to pan, or use mouse wheel to zoom';
    } else if (tool === 'eraser') {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const optKey = isMac ? 'Option' : 'Alt';
      hintEl.innerHTML = `Hold <kbd>${optKey}</kbd> to revert the elements marked for deletion`;
    } else if (tool === 'rectangle') {
      hintEl.innerHTML = 'Hold <kbd>Shift</kbd> to draw a square';
    } else if (tool === 'diamond') {
      hintEl.innerHTML = 'Hold <kbd>Shift</kbd> to draw a proportional diamond';
    } else if (tool === 'ellipse') {
      hintEl.innerHTML = 'Hold <kbd>Shift</kbd> to draw a circle';
    } else {
      hintEl.innerHTML = 'Hold <kbd>Shift</kbd> for fixed proportions';
    }
  }

  const updateBottomHint = updateToolbarHint;

  const ARROWHEAD_ICONS = {
    start: {
      none: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="5" y1="8" x2="11" y2="16" stroke="currentColor" stroke-width="1.8"/><line x1="11" y1="8" x2="5" y2="16" stroke="currentColor" stroke-width="1.8"/><line x1="11" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      arrow: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M20 12H4M11 5L4 12l7 7" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`,
      triangle: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="4,12 12,6 12,18" fill="currentColor"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      triangle_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="4,12 12,6 12,18" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      circle: `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="8" cy="12" r="4" fill="currentColor"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      circle_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="8" cy="12" r="4" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      bar: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" stroke-width="2"/><line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      diamond: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="3,12 8,7 13,12 8,17" fill="currentColor"/><line x1="13" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      diamond_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="3,12 8,7 13,12 8,17" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="13" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_many: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 6L4 12l8 6" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_one: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" stroke-width="1.8"/><line x1="9" y1="6" x2="9" y2="18" stroke="currentColor" stroke-width="1.8"/><line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_one_or_many: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M11 6L4 12l7 6" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="15" y1="6" x2="15" y2="18" stroke="currentColor" stroke-width="1.8"/></svg>`,
    },
    end: {
      none: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="13" y1="8" x2="19" y2="16" stroke="currentColor" stroke-width="1.8"/><line x1="19" y1="8" x2="13" y2="16" stroke="currentColor" stroke-width="1.8"/></svg>`,
      arrow: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12h16M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`,
      triangle: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="20,12 12,6 12,18" fill="currentColor"/><line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      triangle_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="20,12 12,6 12,18" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      circle: `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="16" cy="12" r="4" fill="currentColor"/><line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      circle_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="16" cy="12" r="4" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      bar: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" stroke-width="2"/><line x1="4" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      diamond: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="21,12 16,7 11,12 16,17" fill="currentColor"/><line x1="4" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      diamond_outline: `<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="21,12 16,7 11,12 16,17" fill="#ffffff" stroke="currentColor" stroke-width="1.8"/><line x1="4" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_many: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 6l8 6-8 6" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_one: `<svg width="22" height="22" viewBox="0 0 24 24"><line x1="15" y1="6" x2="15" y2="18" stroke="currentColor" stroke-width="1.8"/><line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" stroke-width="1.8"/><line x1="4" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.8"/></svg>`,
      crowfoot_one_or_many: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M13 6l7 6-7 6" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="9" y1="6" x2="9" y2="18" stroke="currentColor" stroke-width="1.8"/></svg>`,
    },
  };

  function updateArrowheadTriggerButton(side, headType) {
    const btn = side === 'start' ? document.getElementById('btnStartArrowhead') : document.getElementById('btnEndArrowhead');
    if (!btn) return;
    const icon = (ARROWHEAD_ICONS[side] && ARROWHEAD_ICONS[side][headType]) || ARROWHEAD_ICONS[side].none;
    btn.innerHTML = icon;
  }

  function updatePropertiesPanel() {
    const selectedElements = state.elements.filter((e) => state.selectedIds.has(e.id));
    const target = selectedElements[0] || null;
    const tool = state.activeTool;

    const groupStroke = document.getElementById('groupStroke');
    const groupBackground = document.getElementById('groupBackground');
    const groupStrokeWidth = document.getElementById('groupStrokeWidth');
    const groupStrokeStyle = document.getElementById('groupStrokeStyle');
    const groupRoughness = document.getElementById('groupRoughness');
    const groupArrowType = document.getElementById('groupArrowType');
    const groupArrowheads = document.getElementById('groupArrowheads');
    const groupEdges = document.getElementById('groupEdges');
    const groupOpacity = document.getElementById('groupOpacity');
    const groupLayers = document.getElementById('groupLayers');
    const groupActions = document.getElementById('groupActions');

    const labelStroke = document.getElementById('labelStroke');
    const labelBackground = document.getElementById('labelBackground');
    const bgColorPalette = document.getElementById('bgColorPalette');
    const stickyColorPalette = document.getElementById('stickyColorPalette');

    const isSticky = target ? target.type === 'stickynote' : tool === 'stickynote';
    const isArrow = target ? target.type === 'arrow' : tool === 'arrow';
    const isLine = target ? target.type === 'line' : tool === 'line';
    const isRect = target ? target.type === 'rectangle' : tool === 'rectangle';
    const isText = target ? target.type === 'text' : tool === 'text';

    // Label: Text color vs Stroke
    labelStroke.textContent = (isSticky || isText) ? 'Text color' : 'Stroke';

    // Palette: Show Pastel Palette for sticky notes, standard palette for shapes
    if (isSticky) {
      bgColorPalette.style.display = 'none';
      stickyColorPalette.style.display = 'flex';
      labelBackground.textContent = 'Background';
    } else {
      bgColorPalette.style.display = 'flex';
      stickyColorPalette.style.display = 'none';
      labelBackground.textContent = 'Background';
    }

    // Dynamic visibility matching Excalidraw
    groupStroke.style.display = 'flex';
    groupBackground.style.display = (isArrow || isLine || isText) ? 'none' : 'flex';
    groupStrokeWidth.style.display = (isSticky || isText) ? 'none' : 'flex';
    groupStrokeStyle.style.display = (isSticky || isText) ? 'none' : 'flex';
    groupRoughness.style.display = isText ? 'none' : 'flex';
    groupArrowType.style.display = isArrow ? 'flex' : 'none';
    groupArrowheads.style.display = isArrow ? 'flex' : 'none';
    groupEdges.style.display = (isRect || isSticky) ? 'flex' : 'none';
    groupOpacity.style.display = 'flex';
    groupLayers.style.display = selectedElements.length > 0 ? 'flex' : 'none';
    groupActions.style.display = selectedElements.length > 0 ? 'flex' : 'none';

    // Sync button active states
    const curStroke = target ? target.strokeColor : state.strokeColor;
    document.querySelectorAll('#strokeColorPalette .color-swatch:not(.color-custom-btn)').forEach((s) => {
      s.classList.toggle('active', s.dataset.color === curStroke);
    });

    const curBg = target ? target.backgroundColor : (isSticky ? state.stickyBgColor : state.backgroundColor);
    document.querySelectorAll('#bgColorPalette .color-swatch, #stickyColorPalette .color-swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.color === curBg);
    });

    const curWidth = target ? target.strokeWidth : state.strokeWidth;
    document.querySelectorAll('#strokeWidthGroup .icon-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.val, 10) === curWidth);
    });

    const curStyle = target ? target.strokeStyle : state.strokeStyle;
    document.querySelectorAll('#strokeStyleGroup .icon-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.val === curStyle);
    });

    const curRough = target ? target.roughness : state.roughness;
    document.querySelectorAll('#roughnessGroup .icon-btn').forEach((b) => {
      b.classList.toggle('active', parseFloat(b.dataset.val) === curRough);
    });

    const curArrowType = target ? target.arrowType : state.arrowType;
    document.querySelectorAll('#arrowTypeGroup .icon-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.val === curArrowType);
    });

    const curStartHead = target ? (target.startArrowhead || 'none') : (state.startArrowhead || 'none');
    const curEndHead = target ? (target.endArrowhead || 'none') : (state.endArrowhead || 'arrow');
    updateArrowheadTriggerButton('start', curStartHead);
    updateArrowheadTriggerButton('end', curEndHead);

    document.querySelectorAll('#popoverStartArrowhead .arrowhead-opt-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.head === curStartHead);
    });
    document.querySelectorAll('#popoverEndArrowhead .arrowhead-opt-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.head === curEndHead);
    });

    const curRound = target ? target.roundness : state.roundness;
    document.querySelectorAll('#edgesGroup .icon-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.val === curRound);
    });

    const curOpacity = target ? (target.opacity ?? 100) : state.opacity;
    document.getElementById('opacitySlider').value = curOpacity;
    document.getElementById('opacityLabel').textContent = curOpacity;
  }

  document.getElementById('toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-button');
    if (btn && btn.dataset.tool) {
      setTool(btn.dataset.tool);
    }
  });

  // Stroke Color Swatches
  document.getElementById('strokeColorPalette').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch:not(.color-custom-btn)');
    if (!swatch) return;
    state.strokeColor = swatch.dataset.color;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.strokeColor = state.strokeColor;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Custom Color Picker
  const customColorPicker = document.getElementById('customColorPicker');
  customColorPicker.addEventListener('input', (e) => {
    state.strokeColor = e.target.value;
    for (const id of state.selectedIds) {
      const el = state.elements.find((el) => el.id === id);
      if (el) el.strokeColor = state.strokeColor;
    }
    renderAll();
    updatePropertiesPanel();
  });
  customColorPicker.addEventListener('change', () => {
    saveHistory();
  });

  // Background Color Swatches (Standard)
  document.getElementById('bgColorPalette').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    state.backgroundColor = swatch.dataset.color;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.backgroundColor = state.backgroundColor;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Background Color Swatches (Pastel Sticky Note)
  document.getElementById('stickyColorPalette').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    state.stickyBgColor = swatch.dataset.color;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el && el.type === 'stickynote') el.backgroundColor = state.stickyBgColor;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Stroke Width
  document.getElementById('strokeWidthGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    state.strokeWidth = parseInt(btn.dataset.val, 10);
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.strokeWidth = state.strokeWidth;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Stroke Style (Solid, Dashed, Dotted)
  document.getElementById('strokeStyleGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    state.strokeStyle = btn.dataset.val;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.strokeStyle = state.strokeStyle;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Sloppiness (Roughness)
  document.getElementById('roughnessGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    state.roughness = parseFloat(btn.dataset.val);
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) el.roughness = state.roughness;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Arrow Type (Straight, Curved, Elbow)
  document.getElementById('arrowTypeGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    state.arrowType = btn.dataset.val;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el && el.type === 'arrow') el.arrowType = state.arrowType;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Arrowhead Popovers & Pickers
  function closeAllArrowheadPopovers() {
    const popStart = document.getElementById('popoverStartArrowhead');
    const popEnd = document.getElementById('popoverEndArrowhead');
    if (popStart) popStart.style.display = 'none';
    if (popEnd) popEnd.style.display = 'none';
    document.getElementById('btnStartArrowhead')?.classList.remove('open');
    document.getElementById('btnEndArrowhead')?.classList.remove('open');
  }

  document.getElementById('btnStartArrowhead')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverStartArrowhead');
    const isShown = pop.style.display !== 'none';
    closeAllArrowheadPopovers();
    if (!isShown) {
      pop.style.display = 'flex';
      document.getElementById('btnStartArrowhead').classList.add('open');
    }
  });

  document.getElementById('btnEndArrowhead')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverEndArrowhead');
    const isShown = pop.style.display !== 'none';
    closeAllArrowheadPopovers();
    if (!isShown) {
      pop.style.display = 'flex';
      document.getElementById('btnEndArrowhead').classList.add('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.arrowhead-btn-wrapper')) {
      closeAllArrowheadPopovers();
    }
  });

  document.getElementById('toggleMoreStart')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const grid = document.getElementById('gridMoreStart');
    const arrow = document.querySelector('#toggleMoreStart .more-arrow');
    const isOpen = grid.style.display !== 'none';
    grid.style.display = isOpen ? 'none' : 'grid';
    if (arrow) arrow.textContent = isOpen ? '⌵' : '˄';
  });

  document.getElementById('toggleMoreEnd')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const grid = document.getElementById('gridMoreEnd');
    const arrow = document.querySelector('#toggleMoreEnd .more-arrow');
    const isOpen = grid.style.display !== 'none';
    grid.style.display = isOpen ? 'none' : 'grid';
    if (arrow) arrow.textContent = isOpen ? '⌵' : '˄';
  });

  document.getElementById('popoverStartArrowhead')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.arrowhead-opt-btn');
    if (!btn) return;
    const head = btn.dataset.head;
    state.startArrowhead = head;
    for (const id of state.selectedIds) {
      const el = state.elements.find((item) => item.id === id);
      if (el && el.type === 'arrow') el.startArrowhead = head;
    }
    saveHistory();
    renderAll();
    closeAllArrowheadPopovers();
  });

  document.getElementById('popoverEndArrowhead')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.arrowhead-opt-btn');
    if (!btn) return;
    const head = btn.dataset.head;
    state.endArrowhead = head;
    for (const id of state.selectedIds) {
      const el = state.elements.find((item) => item.id === id);
      if (el && el.type === 'arrow') el.endArrowhead = head;
    }
    saveHistory();
    renderAll();
    closeAllArrowheadPopovers();
  });

  // Edges (Sharp vs Round)
  document.getElementById('edgesGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    state.roundness = btn.dataset.val;
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el && (el.type === 'rectangle' || el.type === 'stickynote')) el.roundness = state.roundness;
    }
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  // Opacity Slider
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityLabel = document.getElementById('opacityLabel');
  opacitySlider.addEventListener('input', (e) => {
    state.opacity = parseInt(e.target.value, 10);
    opacityLabel.textContent = state.opacity;
    for (const id of state.selectedIds) {
      const el = state.elements.find((el) => el.id === id);
      if (el) el.opacity = state.opacity;
    }
    renderAll();
  });
  opacitySlider.addEventListener('change', () => {
    saveHistory();
  });

  // Layers Ordering
  document.getElementById('btnSendToBack').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    const selected = state.elements.filter((e) => state.selectedIds.has(e.id));
    const rest = state.elements.filter((e) => !state.selectedIds.has(e.id));
    state.elements = [...selected, ...rest];
    saveHistory();
    renderAll();
  });

  document.getElementById('btnSendBackward').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    for (let i = 1; i < state.elements.length; i++) {
      if (state.selectedIds.has(state.elements[i].id) && !state.selectedIds.has(state.elements[i - 1].id)) {
        const temp = state.elements[i];
        state.elements[i] = state.elements[i - 1];
        state.elements[i - 1] = temp;
      }
    }
    saveHistory();
    renderAll();
  });

  document.getElementById('btnBringForward').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    for (let i = state.elements.length - 2; i >= 0; i--) {
      if (state.selectedIds.has(state.elements[i].id) && !state.selectedIds.has(state.elements[i + 1].id)) {
        const temp = state.elements[i];
        state.elements[i] = state.elements[i + 1];
        state.elements[i + 1] = temp;
      }
    }
    saveHistory();
    renderAll();
  });

  document.getElementById('btnBringToFront').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    const selected = state.elements.filter((e) => state.selectedIds.has(e.id));
    const rest = state.elements.filter((e) => !state.selectedIds.has(e.id));
    state.elements = [...rest, ...selected];
    saveHistory();
    renderAll();
  });

  // Actions
  document.getElementById('btnDuplicate').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    const clones = [];
    const newSelected = new Set();
    for (const id of state.selectedIds) {
      const orig = state.elements.find((e) => e.id === id);
      if (!orig) continue;
      const clone = JSON.parse(JSON.stringify(orig));
      clone.id = generateId();
      clone.seed = generateSeed();
      clone.x += 20;
      clone.y += 20;
      clones.push(clone);
      newSelected.add(clone.id);
    }
    state.elements.push(...clones);
    state.selectedIds = newSelected;
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  document.getElementById('btnDelete').addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    state.elements = state.elements.filter((e) => !state.selectedIds.has(e.id));
    state.selectedIds.clear();
    saveHistory();
    renderAll();
    updatePropertiesPanel();
  });

  document.getElementById('btnCopyJson').addEventListener('click', () => {
    const selected = state.elements.filter((e) => state.selectedIds.has(e.id));
    const dataToCopy = selected.length > 0 ? selected : state.elements;
    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2)).then(() => {
      alert('Copied element(s) JSON to clipboard!');
    }).catch(() => {
      alert('Could not copy to clipboard.');
    });
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

  // --- Welcome Diagram for Drawo ---
  document.getElementById('btnLoadDemo').addEventListener('click', loadDrawoWelcomeDiagram);

  function loadDrawoWelcomeDiagram() {
    state.elements = [];
    state.selectedIds.clear();

    const cx = Math.max(50, Math.floor((window.innerWidth - 760) / 2));
    const cy = Math.max(70, Math.floor((window.innerHeight - 520) / 2));

    // 1. Header Title & Subtitle
    const txtTitle = {
      id: generateId(),
      type: 'text',
      x: cx + 225,
      y: cy,
      width: 310,
      height: 40,
      strokeColor: '#1e1e1e',
      text: 'Welcome to drawo 🎨',
      fontSize: 32,
      seed: generateSeed(),
    };

    const txtSubtitle = {
      id: generateId(),
      type: 'text',
      x: cx + 215,
      y: cy + 45,
      width: 330,
      height: 25,
      strokeColor: '#868e96',
      text: 'Hand-drawn whiteboard, free, local and private',
      fontSize: 15,
      seed: generateSeed(),
    };

    // 2. Left Card: Hand-drawn Shapes
    const cardShapes = {
      id: generateId(),
      type: 'rectangle',
      x: cx,
      y: cy + 105,
      width: 230,
      height: 155,
      strokeColor: '#364fc7',
      backgroundColor: '#edf2ff',
      strokeWidth: 2,
      roundness: 'round',
      roughness: 1,
      seed: generateSeed(),
      text: '✏️ Shapes & Fills\n\nDraw boxes, ellipses & lines\nCustom pastel palettes\nHand-sketched rough look',
      fontSize: 13,
      boundElements: [],
    };

    // 3. Center Card: Sticky Note with Quick Shortcuts
    const cardSticky = {
      id: generateId(),
      type: 'stickynote',
      x: cx + 275,
      y: cy + 95,
      width: 210,
      height: 175,
      strokeColor: '#e67700',
      backgroundColor: '#fff3bf',
      strokeWidth: 1.5,
      roundness: 'round',
      roughness: 1,
      seed: generateSeed(),
      text: '💡 Shortcuts\n\nV  Selection    T  Text\nR  Rectangle    O  Ellipse\nN  Sticky Note  L  Line\nA  Cycle Arrows\n⌘D  Duplicate',
      fontSize: 13,
      boundElements: [],
    };

    // 4. Right Card: Smart Arrows
    const cardArrows = {
      id: generateId(),
      type: 'rectangle',
      x: cx + 530,
      y: cy + 105,
      width: 230,
      height: 155,
      strokeColor: '#099268',
      backgroundColor: '#ebfbee',
      strokeWidth: 2,
      roundness: 'round',
      roughness: 1,
      seed: generateSeed(),
      text: '⚡ Smart Arrows\n\nStraight, Curved & Elbow\nAuto-binds to shapes\nFollows when you drag!',
      fontSize: 13,
      boundElements: [],
    };

    // 5. Bottom Card: Diamond CTA
    const cardTry = {
      id: generateId(),
      type: 'diamond',
      x: cx + 270,
      y: cy + 325,
      width: 220,
      height: 120,
      strokeColor: '#d6336c',
      backgroundColor: '#fff0f6',
      strokeWidth: 2,
      roughness: 1,
      seed: generateSeed(),
      text: '✨ Try it!\n\nDrag any shape\nArrows follow!',
      fontSize: 13,
      boundElements: [],
    };

    // 6. Bottom Hint
    const txtHint = {
      id: generateId(),
      type: 'text',
      x: cx + 185,
      y: cy + 475,
      width: 390,
      height: 25,
      strokeColor: '#868e96',
      text: 'Double-click any shape to edit text, or press Delete to clear',
      fontSize: 14,
      seed: generateSeed(),
    };

    // Helper to create smart bound arrow
    function createBoundArrow(
      fromEl,
      toEl,
      color = '#1e1e1e',
      arrowType = 'straight',
      strokeStyle = 'solid',
      strokeWidth = 1.5,
      startAnchorPoint = [0.5, 0.5],
      endAnchorPoint = [0.5, 0.5]
    ) {
      const arrow = {
        id: generateId(),
        type: 'arrow',
        x: fromEl.x + fromEl.width / 2,
        y: fromEl.y + fromEl.height / 2,
        width: 10,
        height: 10,
        strokeColor: color,
        backgroundColor: 'transparent',
        strokeWidth,
        strokeStyle,
        arrowType,
        startArrowhead: 'none',
        endArrowhead: 'arrow',
        roundness: 'round',
        opacity: 100,
        roughness: 1,
        seed: generateSeed(),
        points: [[0, 0], [10, 10]],
        startBinding: {
          elementId: fromEl.id,
          fixedPoint: startAnchorPoint,
          gap: BASE_BINDING_GAP,
        },
        endBinding: {
          elementId: toEl.id,
          fixedPoint: endAnchorPoint,
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

    // Connect cards with smart bound arrows
    const arrowLeftToSticky = createBoundArrow(cardShapes, cardSticky, '#364fc7', 'curved', 'solid', 2, [1, 0.5], [0, 0.5]);
    const arrowStickyToRight = createBoundArrow(cardSticky, cardArrows, '#099268', 'curved', 'solid', 2, [1, 0.5], [0, 0.5]);
    const arrowLeftToTry = createBoundArrow(cardShapes, cardTry, '#868e96', 'elbow', 'dashed', 1.5, [0.5, 1], [0, 0.5]);
    const arrowRightToTry = createBoundArrow(cardArrows, cardTry, '#868e96', 'elbow', 'dashed', 1.5, [0.5, 1], [1, 0.5]);

    // Register all elements
    state.elements = [
      txtTitle,
      txtSubtitle,
      cardShapes,
      cardSticky,
      cardArrows,
      cardTry,
      txtHint,
      arrowLeftToSticky,
      arrowStickyToRight,
      arrowLeftToTry,
      arrowRightToTry,
    ];

    // Recalculate all arrow endpoints now that shapes exist in state.elements!
    for (const el of state.elements) {
      if (el.type === 'arrow') {
        updateArrowPoints(el);
      } else if (el.type === 'text') {
        updateTextElementSize(el);
      }
    }

    saveHistory();
    renderAll();
  }

  // --- Initialize ---
  resizeCanvases();
  saveHistory();

  // Load the initial welcome demo showcasing drawo
  loadDrawoWelcomeDiagram();
  updatePropertiesPanel();
  updateBottomHint();

  if (document.fonts) {
    document.fonts.ready.then(() => {
      for (const el of state.elements) {
        if (el.type === 'text') {
          updateTextElementSize(el);
        }
      }
      renderAll();
    });
  }

  window.drawo = { state, renderAll, screenToScene, sceneToScreen, setTool, getElementBounds };
  window.__miniExcalidraw = window.drawo;
  window.state = state;
  window.renderAll = renderAll;
  window.setTool = setTool;
})();
