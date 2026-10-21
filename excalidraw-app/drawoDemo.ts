import {
  newElement,
  newTextElement,
  newArrowElement,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export function loadDrawoDemo(api: ExcalidrawImperativeAPI) {
  const elements: ExcalidrawElement[] = [];

  const cx = 100;
  const cy = 100;

  // Title text
  const title = newTextElement({
    x: cx + 180,
    y: cy,
    text: "✏️ Welcome to Drawo",
    fontSize: 28,
    fontFamily: 1,
    strokeColor: "#384959",
    textAlign: "left",
  });
  elements.push(title);

  // Subtitle text
  const subtitle = newTextElement({
    x: cx + 180,
    y: cy + 45,
    text: "Hand-drawn whiteboard, free, local and private",
    fontSize: 16,
    fontFamily: 1,
    strokeColor: "#6A89A7",
    textAlign: "left",
  });
  elements.push(subtitle);

  // Card 1
  const card1 = newElement({
    type: "rectangle",
    x: cx,
    y: cy + 100,
    width: 220,
    height: 160,
    strokeColor: "#384959",
    backgroundColor: "#BDDDFC",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(card1);

  const card1Text = newTextElement({
    x: cx + 15,
    y: cy + 120,
    text: "🎨 Drawing Tools\n\nRectangles and diamonds\nEllipses and lines\nFreehand sketch\nSolid and hatch fills",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#384959",
    textAlign: "left",
  });
  elements.push(card1Text);

  // Card 2
  const card2 = newElement({
    type: "rectangle",
    x: cx + 260,
    y: cy + 100,
    width: 220,
    height: 160,
    strokeColor: "#558ec5",
    backgroundColor: "#eaf2f9",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(card2);

  const card2Text = newTextElement({
    x: cx + 275,
    y: cy + 120,
    text: "💡 Quick Shortcuts\n\nV  Selection\nR  Rectangle\nO  Ellipse\nP  Freehand pencil\nE  Eraser",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#384959",
    textAlign: "left",
  });
  elements.push(card2Text);

  // Card 3
  const card3 = newElement({
    type: "rectangle",
    x: cx + 520,
    y: cy + 100,
    width: 220,
    height: 160,
    strokeColor: "#6A89A7",
    backgroundColor: "#f4f8fb",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(card3);

  const card3Text = newTextElement({
    x: cx + 535,
    y: cy + 120,
    text: "⚡ Smart Connectors\n\nStraight arrows\nCurved and elbow paths\nAuto-binding to shapes\nStays connected!",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#384959",
    textAlign: "left",
  });
  elements.push(card3Text);

  // Connecting Arrow 1
  const arrow1 = newArrowElement({
    type: "arrow",
    x: cx + 220,
    y: cy + 180,
    width: 40,
    height: 0,
    points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(40, 0)],
    endArrowhead: "arrow",
    strokeColor: "#6A89A7",
    strokeWidth: 2,
    roughness: 1,
  });
  elements.push(arrow1);

  // Connecting Arrow 2
  const arrow2 = newArrowElement({
    type: "arrow",
    x: cx + 480,
    y: cy + 180,
    width: 40,
    height: 0,
    points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(40, 0)],
    endArrowhead: "arrow",
    strokeColor: "#6A89A7",
    strokeWidth: 2,
    roughness: 1,
  });
  elements.push(arrow2);

  // Diamond CTA at the bottom
  const diamond = newElement({
    type: "diamond",
    x: cx + 270,
    y: cy + 300,
    width: 200,
    height: 120,
    strokeColor: "#384959",
    backgroundColor: "#BDDDFC",
    fillStyle: "solid",
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(diamond);

  const diamondText = newTextElement({
    x: cx + 320,
    y: cy + 340,
    text: "✨ 100% Local\nDrag to edit!",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#384959",
    textAlign: "center",
  });
  elements.push(diamondText);

  api.updateScene({
    elements,
  });
}

