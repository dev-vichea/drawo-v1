import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";
import { createStore, del, get, set } from "idb-keyval";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { appJotaiStore, atom } from "../app-jotai";
import {
  getWelcomeDemoElements,
  getYouTubeScenarioElements,
  getDisputeAnalysisElements,
  getOnboardingProcessElements,
  getMindMapElements,
} from "../drawoDemo";

export interface DrawoCollection {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  color: string;
  createdAt: number;
}

export interface DrawoBoardMeta {
  id: string;
  title: string;
  collectionId: string | null;
  isFavorite: boolean;
  isTrash?: boolean;
  author?: string;
  previewSvg?: string;
  elementCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface DrawoBoardScene {
  elements: readonly ExcalidrawElement[];
  appState?: {
    viewBackgroundColor?: string;
  };
}

export interface DrawoWorkspaceState {
  activeBoardId: string;
  boards: DrawoBoardMeta[];
  collections: DrawoCollection[];
}

const WORKSPACE_META_KEY = "drawo-workspace-meta-v1";
export const workspaceBoardsStore = createStore(
  "drawo-workspace-db",
  "drawo-boards-store",
);

export const isWorkspaceDashboardOpenAtom = atom<boolean>(false);

const COLLECTION_COLORS = [
  "#558ec5",
  "#6A89A7",
  "#88BDF2",
  "#384959",
  "#4679ab",
  "#7faad2",
];

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const DEFAULT_COLLECTIONS: DrawoCollection[] = [
  {
    id: "col-private",
    name: "Private",
    icon: "🔒",
    description:
      "This is your private collection. No other team members can see it. Drag a scene to a different collection to make it visible to other team members.",
    color: "#6366f1",
    createdAt: 1700000000000,
  },
  {
    id: "col-features",
    name: "Features",
    icon: "🚀",
    description: "Feature specs, user stories, and architecture roadmaps.",
    color: "#f97316",
    createdAt: 1700000001000,
  },
  {
    id: "col-things",
    name: "Things",
    icon: "❓",
    description: "Explorations, experiments, and scratchpad diagrams.",
    color: "#eab308",
    createdAt: 1700000002000,
  },
  {
    id: "col-main",
    name: "Main",
    icon: "🚩",
    description: "Production diagrams, company assets, and shared standards.",
    color: "#ef4444",
    createdAt: 1700000003000,
  },
  {
    id: "col-wireframes",
    name: "Wireframes",
    icon: "📐",
    description: "User journey flows, low-fidelity wireframes, and UI mockups.",
    color: "#3b82f6",
    createdAt: 1700000004000,
  },
  {
    id: "col-marketing",
    name: "Marketing",
    icon: "🧠",
    description: "Campaign visuals, brand collateral, and presentation decks.",
    color: "#ec4899",
    createdAt: 1700000005000,
  },
  {
    id: "col-engineering",
    name: "Engineering",
    icon: "🏗",
    description:
      "System topologies, cloud microservices, and database schemas.",
    color: "#10b981",
    createdAt: 1700000006000,
  },
  {
    id: "col-design",
    name: "Design",
    icon: "🎨",
    description: "Design systems, layout sketches, and color schemes.",
    color: "#8b5cf6",
    createdAt: 1700000007000,
  },
  {
    id: "col-components",
    name: "Components",
    icon: "🧩",
    description: "Reusable diagram elements, templates, and libraries.",
    color: "#06b6d4",
    createdAt: 1700000008000,
  },
];

const getSeedBoards = (now: number): DrawoBoardMeta[] => [
  {
    id: "board-youtube",
    title: "YouTube scenario",
    collectionId: "col-private",
    isFavorite: false,
    author: "Torvalds Unix",
    elementCount: 14,
    updatedAt: now - 1000 * 60 * 60 * 24 * 60, // 2 months ago
    createdAt: now - 1000 * 60 * 60 * 24 * 60,
  },
  {
    id: "board-dispute",
    title: "Dispute Analysis",
    collectionId: "col-private",
    isFavorite: false,
    author: "Torvalds Unix",
    elementCount: 28,
    updatedAt: now - 1000 * 60 * 60 * 24 * 120, // 4 months ago
    createdAt: now - 1000 * 60 * 60 * 24 * 120,
  },
  {
    id: "board-untitled-1",
    title: "Untitled scene",
    collectionId: "col-private",
    isFavorite: false,
    author: "Torvalds Unix",
    elementCount: 6,
    updatedAt: now - 1000 * 60 * 60 * 24 * 60, // 2 months ago
    createdAt: now - 1000 * 60 * 60 * 24 * 60,
  },
  {
    id: "board-onboarding",
    title: "Employee Onboarding Process",
    collectionId: "col-private",
    isFavorite: true,
    author: "Torvalds Unix",
    elementCount: 42,
    updatedAt: now - 1000 * 60 * 60 * 24 * 365, // a year ago
    createdAt: now - 1000 * 60 * 60 * 24 * 365,
  },
  {
    id: "board-untitled-2",
    title: "Untitled scene",
    collectionId: "col-private",
    isFavorite: false,
    author: "Torvalds Unix",
    elementCount: 18,
    updatedAt: now - 1000 * 60 * 60 * 24 * 365, // a year ago
    createdAt: now - 1000 * 60 * 60 * 24 * 365,
  },
  {
    id: "board-mindmap",
    title: "Mind Map",
    collectionId: "col-private",
    isFavorite: true,
    author: "Torvalds Unix",
    elementCount: 35,
    updatedAt: now - 1000 * 60 * 60 * 24 * 365, // a year ago
    createdAt: now - 1000 * 60 * 60 * 24 * 365,
  },
];

const loadWorkspaceMeta = (): DrawoWorkspaceState => {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(WORKSPACE_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DrawoWorkspaceState;
      if (
        parsed &&
        Array.isArray(parsed.boards) &&
        parsed.boards.length > 0 &&
        parsed.activeBoardId
      ) {
        // Merge or upgrade collections
        const existingCols = Array.isArray(parsed.collections)
          ? parsed.collections
          : [];
        const mergedCols = [...DEFAULT_COLLECTIONS];
        for (const ec of existingCols) {
          if (!mergedCols.some((c) => c.id === ec.id)) {
            mergedCols.push(ec);
          }
        }

        // Ensure boards have author & collectionId mapped to private if null
        const upgradedBoards = parsed.boards.map((b) => ({
          ...b,
          author: b.author || "Torvalds Unix",
          collectionId: b.collectionId || "col-private",
        }));

        // If user only had 1-2 boards, add seed boards so the dashboard looks full
        const finalBoards =
          upgradedBoards.length <= 2
            ? [
                ...upgradedBoards,
                ...getSeedBoards(now).filter(
                  (sb) => !upgradedBoards.some((ub) => ub.id === sb.id),
                ),
              ]
            : upgradedBoards;

        return {
          activeBoardId: parsed.activeBoardId,
          boards: finalBoards,
          collections: mergedCols,
        };
      }
    }
  } catch {
    // fallback to default state
  }

  const seed = getSeedBoards(now);
  const initialBoard: DrawoBoardMeta = {
    id: "board-main",
    title: "Drawo Welcome Demo",
    collectionId: "col-private",
    isFavorite: true,
    author: "Torvalds Unix",
    elementCount: 15,
    updatedAt: now,
    createdAt: now,
  };

  const initialState: DrawoWorkspaceState = {
    activeBoardId: initialBoard.id,
    boards: [initialBoard, ...seed],
    collections: DEFAULT_COLLECTIONS,
  };

  try {
    localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify(initialState));
  } catch {
    // ignore storage errors
  }

  return initialState;
};

export const drawoWorkspaceAtom = atom<DrawoWorkspaceState>(
  loadWorkspaceMeta(),
);

const persistState = (nextState: DrawoWorkspaceState) => {
  appJotaiStore.set(drawoWorkspaceAtom, nextState);
  try {
    localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify(nextState));
  } catch {
    // ignore quota errors
  }
};

let lastMetaSyncTime = 0;

export class DrawoWorkspace {
  static getState(): DrawoWorkspaceState {
    return appJotaiStore.get(drawoWorkspaceAtom);
  }

  static getActiveBoard(): DrawoBoardMeta {
    const state = this.getState();
    return (
      state.boards.find((b) => b.id === state.activeBoardId) || state.boards[0]
    );
  }

  static async syncActiveBoardFromCanvas(
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    forceMetaUpdate = false,
  ) {
    const state = this.getState();
    const activeId = state.activeBoardId;
    const nonDeleted = getNonDeletedElements(elements);

    try {
      const scene: DrawoBoardScene = {
        elements: nonDeleted,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
        },
      };
      await set(activeId, scene, workspaceBoardsStore);
    } catch {
      // ignore IndexedDB error in restricted environments
    }

    const now = Date.now();
    const currentBoard = state.boards.find((b) => b.id === activeId);
    if (
      currentBoard &&
      (forceMetaUpdate ||
        currentBoard.elementCount !== nonDeleted.length ||
        now - lastMetaSyncTime > 5000)
    ) {
      lastMetaSyncTime = now;
      const nextBoards = state.boards.map((b) =>
        b.id === activeId
          ? {
              ...b,
              elementCount: nonDeleted.length,
              updatedAt: now,
            }
          : b,
      );
      persistState({
        ...state,
        boards: nextBoards,
      });
    }
  }

  static async switchBoard(boardId: string, api: ExcalidrawImperativeAPI) {
    const state = this.getState();
    if (boardId === state.activeBoardId) {
      return;
    }

    const targetBoard = state.boards.find((b) => b.id === boardId);
    if (!targetBoard) {
      return;
    }

    await this.syncActiveBoardFromCanvas(
      api.getSceneElements(),
      api.getAppState(),
      true,
    );

    let savedScene: DrawoBoardScene | undefined;
    try {
      savedScene = await get<DrawoBoardScene>(boardId, workspaceBoardsStore);
    } catch {
      savedScene = undefined;
    }

    const restoredElements = restoreElements(savedScene?.elements || [], null);

    persistState({
      ...state,
      activeBoardId: boardId,
    });

    api.updateScene({
      elements: restoredElements,
      appState: {
        viewBackgroundColor:
          savedScene?.appState?.viewBackgroundColor || "#ffffff",
        selectedElementIds: {},
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.history.clear();
  }

  static async createBoard(
    api: ExcalidrawImperativeAPI,
    opts?: {
      title?: string;
      collectionId?: string | null;
      initialElements?: readonly ExcalidrawElement[];
    },
  ) {
    await this.syncActiveBoardFromCanvas(
      api.getSceneElements(),
      api.getAppState(),
      true,
    );

    const state = this.getState();
    const now = Date.now();
    const nextNumber = state.boards.length + 1;
    const newBoardId = `board-${createId()}`;
    const elementsToSave = getNonDeletedElements(opts?.initialElements || []);

    const newBoard: DrawoBoardMeta = {
      id: newBoardId,
      title: opts?.title?.trim() || `Untitled Board ${nextNumber}`,
      collectionId: opts?.collectionId !== undefined ? opts.collectionId : null,
      isFavorite: false,
      elementCount: elementsToSave.length,
      updatedAt: now,
      createdAt: now,
    };

    try {
      const scene: DrawoBoardScene = {
        elements: elementsToSave,
        appState: { viewBackgroundColor: "#ffffff" },
      };
      await set(newBoardId, scene, workspaceBoardsStore);
    } catch {
      // ignore IndexedDB error
    }

    persistState({
      ...state,
      activeBoardId: newBoardId,
      boards: [newBoard, ...state.boards],
    });

    const restoredElements = restoreElements(elementsToSave, null);
    api.updateScene({
      elements: restoredElements,
      appState: {
        viewBackgroundColor: "#ffffff",
        selectedElementIds: {},
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.history.clear();

    return newBoard;
  }

  static async duplicateBoard(boardId: string, api: ExcalidrawImperativeAPI) {
    await this.syncActiveBoardFromCanvas(
      api.getSceneElements(),
      api.getAppState(),
      true,
    );

    const state = this.getState();
    const sourceBoard = state.boards.find((b) => b.id === boardId);
    if (!sourceBoard) {
      return;
    }

    let sourceScene: DrawoBoardScene | undefined;
    try {
      sourceScene = await get<DrawoBoardScene>(boardId, workspaceBoardsStore);
    } catch {
      sourceScene = undefined;
    }

    const elements =
      boardId === state.activeBoardId
        ? getNonDeletedElements(api.getSceneElements())
        : sourceScene?.elements || [];

    await this.createBoard(api, {
      title: `${sourceBoard.title} Copy`,
      collectionId: sourceBoard.collectionId,
      initialElements: elements,
    });
  }

  static renameBoard(boardId: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      return;
    }
    const state = this.getState();
    persistState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === boardId ? { ...b, title: trimmed, updatedAt: Date.now() } : b,
      ),
    });
  }

  static toggleFavorite(boardId: string) {
    const state = this.getState();
    persistState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === boardId ? { ...b, isFavorite: !b.isFavorite } : b,
      ),
    });
  }

  static moveBoardToCollection(boardId: string, collectionId: string | null) {
    const state = this.getState();
    persistState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === boardId ? { ...b, collectionId, updatedAt: Date.now() } : b,
      ),
    });
  }

  static async deleteBoard(boardId: string, api: ExcalidrawImperativeAPI) {
    const state = this.getState();
    try {
      await del(boardId, workspaceBoardsStore);
    } catch {
      // ignore
    }

    const remaining = state.boards.filter((b) => b.id !== boardId);
    if (remaining.length === 0) {
      const now = Date.now();
      const fallback: DrawoBoardMeta = {
        id: `board-${createId()}`,
        title: "Untitled Board 1",
        collectionId: null,
        isFavorite: false,
        elementCount: 0,
        updatedAt: now,
        createdAt: now,
      };
      persistState({
        ...state,
        activeBoardId: fallback.id,
        boards: [fallback],
      });
      api.updateScene({
        elements: [],
        appState: { selectedElementIds: {} },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      api.history.clear();
      return;
    }

    if (state.activeBoardId === boardId) {
      const nextBoard = remaining[0];
      let nextScene: DrawoBoardScene | undefined;
      try {
        nextScene = await get<DrawoBoardScene>(
          nextBoard.id,
          workspaceBoardsStore,
        );
      } catch {
        nextScene = undefined;
      }
      persistState({
        ...state,
        activeBoardId: nextBoard.id,
        boards: remaining,
      });
      api.updateScene({
        elements: restoreElements(nextScene?.elements || [], null),
        appState: {
          viewBackgroundColor:
            nextScene?.appState?.viewBackgroundColor || "#ffffff",
          selectedElementIds: {},
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      api.history.clear();
    } else {
      persistState({
        ...state,
        boards: remaining,
      });
    }
  }

  static openDashboard() {
    appJotaiStore.set(isWorkspaceDashboardOpenAtom, true);
  }

  static closeDashboard() {
    appJotaiStore.set(isWorkspaceDashboardOpenAtom, false);
  }

  static moveToTrash(boardId: string) {
    const state = this.getState();
    persistState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === boardId ? { ...b, isTrash: true, updatedAt: Date.now() } : b,
      ),
    });
  }

  static restoreFromTrash(boardId: string) {
    const state = this.getState();
    persistState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === boardId ? { ...b, isTrash: false, updatedAt: Date.now() } : b,
      ),
    });
  }

  static async emptyTrash(api?: ExcalidrawImperativeAPI) {
    const state = this.getState();
    const trashed = state.boards.filter((b) => b.isTrash);
    for (const b of trashed) {
      try {
        await del(b.id, workspaceBoardsStore);
      } catch {
        // ignore
      }
    }
    const remaining = state.boards.filter((b) => !b.isTrash);
    if (remaining.length === 0) {
      const now = Date.now();
      const fallback: DrawoBoardMeta = {
        id: `board-${createId()}`,
        title: "Untitled Board 1",
        collectionId: "col-private",
        isFavorite: false,
        author: "Torvalds Unix",
        elementCount: 0,
        updatedAt: now,
        createdAt: now,
      };
      persistState({
        ...state,
        activeBoardId: fallback.id,
        boards: [fallback],
      });
      if (api) {
        api.updateScene({ elements: [], appState: { selectedElementIds: {} } });
      }
    } else {
      persistState({
        ...state,
        boards: remaining,
        activeBoardId: remaining.some((b) => b.id === state.activeBoardId)
          ? state.activeBoardId
          : remaining[0].id,
      });
    }
  }

  static async importBoardFile(
    file: File,
    api: ExcalidrawImperativeAPI,
    collectionId?: string | null,
  ) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const elements = parsed.elements || [];
      const title =
        file.name.replace(/\.(excalidraw|json)$/i, "") || "Imported Scene";
      return await this.createBoard(api, {
        title,
        collectionId: collectionId || "col-private",
        initialElements: elements,
      });
    } catch (err) {
      console.error("Failed to import board file:", err);
      return null;
    }
  }

  static createCollection(name: string, icon = "📁", description = "") {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const state = this.getState();
    const color =
      COLLECTION_COLORS[state.collections.length % COLLECTION_COLORS.length];
    const newCol: DrawoCollection = {
      id: `col-${createId()}`,
      name: trimmed,
      icon,
      description,
      color,
      createdAt: Date.now(),
    };
    persistState({
      ...state,
      collections: [...state.collections, newCol],
    });
    return newCol;
  }

  static deleteCollection(collectionId: string) {
    const state = this.getState();
    persistState({
      ...state,
      collections: state.collections.filter((c) => c.id !== collectionId),
      boards: state.boards.map((b) =>
        b.collectionId === collectionId ? { ...b, collectionId: null } : b,
      ),
    });
  }
}

export const seedInitialBoardScenes = async () => {
  const seeds = [
    { id: "board-main", getElements: getWelcomeDemoElements },
    { id: "board-youtube", getElements: getYouTubeScenarioElements },
    { id: "board-dispute", getElements: getDisputeAnalysisElements },
    { id: "board-onboarding", getElements: getOnboardingProcessElements },
    { id: "board-mindmap", getElements: getMindMapElements },
  ];

  for (const s of seeds) {
    try {
      const existing = await get<DrawoBoardScene>(s.id, workspaceBoardsStore);
      if (!existing || !existing.elements || existing.elements.length === 0) {
        const elements = s.getElements();
        await set(
          s.id,
          {
            elements,
            appState: { viewBackgroundColor: "#ffffff" },
          },
          workspaceBoardsStore,
        );
      }
    } catch {
      // ignore IndexedDB error
    }
  }
};

if (typeof window !== "undefined") {
  seedInitialBoardScenes().catch(() => {});
}
