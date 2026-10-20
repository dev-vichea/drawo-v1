import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";
import { createStore, del, get, set } from "idb-keyval";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { appJotaiStore, atom } from "../app-jotai";

export interface DrawoCollection {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface DrawoBoardMeta {
  id: string;
  title: string;
  collectionId: string | null;
  isFavorite: boolean;
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
const workspaceBoardsStore = createStore(
  "drawo-workspace-db",
  "drawo-boards-store",
);

const COLLECTION_COLORS = [
  "#4c6ef5",
  "#0ca678",
  "#f59f00",
  "#e64980",
  "#7950f2",
  "#15aabf",
];

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getDefaultCollections = (): DrawoCollection[] => {
  const now = Date.now();
  return [
    { id: "col-work", name: "Work", color: "#4c6ef5", createdAt: now },
    {
      id: "col-design",
      name: "System Design",
      color: "#0ca678",
      createdAt: now,
    },
    { id: "col-personal", name: "Personal", color: "#f59f00", createdAt: now },
  ];
};

const loadWorkspaceMeta = (): DrawoWorkspaceState => {
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
        return {
          activeBoardId: parsed.activeBoardId,
          boards: parsed.boards,
          collections: Array.isArray(parsed.collections)
            ? parsed.collections
            : getDefaultCollections(),
        };
      }
    }
  } catch {
    // fallback to default state
  }

  const now = Date.now();
  const initialBoard: DrawoBoardMeta = {
    id: "board-main",
    title: "Main Whiteboard",
    collectionId: "col-work",
    isFavorite: true,
    elementCount: 0,
    updatedAt: now,
    createdAt: now,
  };

  const initialState: DrawoWorkspaceState = {
    activeBoardId: initialBoard.id,
    boards: [initialBoard],
    collections: getDefaultCollections(),
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

  static createCollection(name: string) {
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
