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

export function getWelcomeDemoElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const cx = 100;
  const cy = 100;

  const title = newTextElement({
    x: cx + 180,
    y: cy,
    text: "✏️ Welcome to Drawo",
    fontSize: 28,
    fontFamily: 1,
    strokeColor: "#0284c7",
    textAlign: "left",
  });
  elements.push(title);

  const card1 = newElement({
    type: "rectangle",
    x: cx,
    y: cy + 80,
    width: 200,
    height: 120,
    strokeColor: "#0284c7",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(card1);

  const card1Text = newTextElement({
    x: cx + 15,
    y: cy + 105,
    text: "🎨 Drawing Tools\n\nRectangles, arrows\nFreehand sketch\nSolid and hatch fills",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#0369a1",
  });
  elements.push(card1Text);

  const card2 = newElement({
    type: "rectangle",
    x: cx + 240,
    y: cy + 80,
    width: 200,
    height: 120,
    strokeColor: "#38bdf8",
    backgroundColor: "#f0f9ff",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(card2);

  const card2Text = newTextElement({
    x: cx + 255,
    y: cy + 105,
    text: "⚡ Offline First\n\nPersistent boards\nReal-time workspace\nZero external cloud",
    fontSize: 14,
    fontFamily: 1,
    strokeColor: "#0284c7",
  });
  elements.push(card2Text);

  return elements;
}

export function getYouTubeScenarioElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const cx = 80;
  const cy = 80;

  const title = newTextElement({
    x: cx,
    y: cy,
    text: "🎬 YouTube Content Pipeline",
    fontSize: 24,
    fontFamily: 1,
    strokeColor: "#0284c7",
  });
  elements.push(title);

  const step1 = newElement({
    type: "rectangle",
    x: cx,
    y: cy + 60,
    width: 160,
    height: 90,
    strokeColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(step1);
  elements.push(
    newTextElement({
      x: cx + 15,
      y: cy + 90,
      text: "1. Brainstorming\nTopic & title ideas",
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#0369a1",
    }),
  );

  const arrow1 = newArrowElement({
    type: "arrow",
    x: cx + 160,
    y: cy + 105,
    width: 60,
    height: 0,
    strokeColor: "#0284c7",
    points: [pointFrom(0, 0), pointFrom(60, 0)],
  });
  elements.push(arrow1);

  const step2 = newElement({
    type: "rectangle",
    x: cx + 220,
    y: cy + 60,
    width: 160,
    height: 90,
    strokeColor: "#0284c7",
    backgroundColor: "#f0f9ff",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(step2);
  elements.push(
    newTextElement({
      x: cx + 235,
      y: cy + 90,
      text: "2. Scripting\nHook & 3 core points",
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#0284c7",
    }),
  );

  const arrow2 = newArrowElement({
    type: "arrow",
    x: cx + 380,
    y: cy + 105,
    width: 60,
    height: 0,
    strokeColor: "#0284c7",
    points: [pointFrom(0, 0), pointFrom(60, 0)],
  });
  elements.push(arrow2);

  const step3 = newElement({
    type: "rectangle",
    x: cx + 440,
    y: cy + 60,
    width: 160,
    height: 90,
    strokeColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(step3);
  elements.push(
    newTextElement({
      x: cx + 455,
      y: cy + 90,
      text: "3. Publish & Clip\nShorts & Community",
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#047857",
    }),
  );

  return elements;
}

export function getDisputeAnalysisElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const cx = 80;
  const cy = 80;

  const header = newTextElement({
    x: cx,
    y: cy,
    text: "⚖️ Payment Dispute Resolution Flow",
    fontSize: 22,
    fontFamily: 1,
    strokeColor: "#0284c7",
  });
  elements.push(header);

  const startBox = newElement({
    type: "rectangle",
    x: cx + 180,
    y: cy + 50,
    width: 180,
    height: 60,
    strokeColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(startBox);
  elements.push(
    newTextElement({
      x: cx + 200,
      y: cy + 70,
      text: "Dispute Ticket Filed",
      fontSize: 14,
      fontFamily: 1,
      strokeColor: "#0284c7",
    }),
  );

  const diamond = newElement({
    type: "diamond",
    x: cx + 170,
    y: cy + 150,
    width: 200,
    height: 100,
    strokeColor: "#f59e0b",
    backgroundColor: "#fffbeb",
    fillStyle: "solid",
    roughness: 1,
  });
  elements.push(diamond);
  elements.push(
    newTextElement({
      x: cx + 205,
      y: cy + 190,
      text: "Fraud Evidence?",
      fontSize: 14,
      fontFamily: 1,
      strokeColor: "#b45309",
    }),
  );

  const passBox = newElement({
    type: "rectangle",
    x: cx,
    y: cy + 290,
    width: 170,
    height: 70,
    strokeColor: "#ef4444",
    backgroundColor: "#fef2f2",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(passBox);
  elements.push(
    newTextElement({
      x: cx + 15,
      y: cy + 310,
      text: "Yes: Issue Chargeback\n& Freeze Account",
      fontSize: 12,
      fontFamily: 1,
      strokeColor: "#b91c1c",
    }),
  );

  const okBox = newElement({
    type: "rectangle",
    x: cx + 370,
    y: cy + 290,
    width: 170,
    height: 70,
    strokeColor: "#10b981",
    backgroundColor: "#ecfdf5",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(okBox);
  elements.push(
    newTextElement({
      x: cx + 385,
      y: cy + 310,
      text: "No: Release Escrow\nTo Verified Merchant",
      fontSize: 12,
      fontFamily: 1,
      strokeColor: "#047857",
    }),
  );

  return elements;
}

export function getOnboardingProcessElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const cx = 80;
  const cy = 80;

  const header = newTextElement({
    x: cx,
    y: cy,
    text: "🚀 Engineer Onboarding Roadmap",
    fontSize: 22,
    fontFamily: 1,
    strokeColor: "#0284c7",
  });
  elements.push(header);

  const stages = [
    {
      title: "Day 1",
      desc: "Hardware, SSH keys, Repo setup",
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.12)",
    },
    {
      title: "Week 1",
      desc: "First PR merged & Mentor check-in",
      color: "#0284c7",
      bg: "#f0f9ff",
    },
    {
      title: "Month 1",
      desc: "On-call shadow & feature delivery",
      color: "#10b981",
      bg: "#ecfdf5",
    },
  ];

  stages.forEach((st, idx) => {
    const box = newElement({
      type: "rectangle",
      x: cx + idx * 190,
      y: cy + 60,
      width: 170,
      height: 100,
      strokeColor: st.color,
      backgroundColor: st.bg,
      fillStyle: "solid",
      roundness: { type: 3 },
      roughness: 1,
    });
    elements.push(box);
    elements.push(
      newTextElement({
        x: cx + idx * 190 + 15,
        y: cy + 85,
        text: `${st.title}\n\n${st.desc}`,
        fontSize: 13,
        fontFamily: 1,
        strokeColor: "#0c2338",
      }),
    );
  });

  return elements;
}

export function getMindMapElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const cx = 300;
  const cy = 180;

  // Center node
  const center = newElement({
    type: "ellipse",
    x: cx - 90,
    y: cy - 40,
    width: 180,
    height: 80,
    strokeColor: "#0284c7",
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    fillStyle: "solid",
    roughness: 1,
    strokeWidth: 2,
  });
  elements.push(center);
  elements.push(
    newTextElement({
      x: cx - 70,
      y: cy - 10,
      text: "🧠 Core Product\nStrategy 2026",
      fontSize: 14,
      fontFamily: 1,
      strokeColor: "#0284c7",
      textAlign: "center",
    }),
  );

  // Left branch
  const left = newElement({
    type: "rectangle",
    x: cx - 260,
    y: cy - 35,
    width: 130,
    height: 70,
    strokeColor: "#10b981",
    backgroundColor: "#ecfdf5",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(left);
  elements.push(
    newTextElement({
      x: cx - 245,
      y: cy - 15,
      text: "⚡ Offline PWA\nZero Latency",
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#047857",
    }),
  );

  // Right branch
  const right = newElement({
    type: "rectangle",
    x: cx + 130,
    y: cy - 35,
    width: 140,
    height: 70,
    strokeColor: "#f59e0b",
    backgroundColor: "#fffbeb",
    fillStyle: "solid",
    roundness: { type: 3 },
    roughness: 1,
  });
  elements.push(right);
  elements.push(
    newTextElement({
      x: cx + 145,
      y: cy - 15,
      text: "🎨 Cyan Modern\nDesign System",
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#b45309",
    }),
  );

  return elements;
}
