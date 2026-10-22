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
  viewBackgroundColor?: string;
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

export const WORKSPACE_PAGE_PATHS = [
  "/login",
  "/sign-in",
  "/signup",
  "/no-workspace",
  "/create-workspace",
  "/user-settings",
  "/account",
  "/account/my-profile",
  "/account/preferences",
  "/account/api-keys",
  "/account/export",
  "/account/my-workspaces",
  "/account/delete",
  "/workspace",
] as const;

export const isWorkspaceDashboardOpenAtom = atom<boolean>(
  typeof window !== "undefined" &&
    (WORKSPACE_PAGE_PATHS.includes(window.location.pathname as any) ||
      window.location.pathname.startsWith("/account/")),
);

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
      "This is your private collection. Drag a scene here or to other collections you create.",
    color: "#6366f1",
    createdAt: 1700000000000,
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
        // Filter out legacy mock seed boards and Torvalds mock author
        const cleanBoards = parsed.boards
          .filter(
            (b) =>
              ![
                "board-youtube",
                "board-dispute",
                "board-onboarding",
                "board-mindmap",
                "board-untitled-1",
                "board-untitled-2",
                "board-main",
              ].includes(b.id) && b.author !== "Torvalds Unix",
          )
          .map((b) => ({
            ...b,
            author: b.author && b.author !== "Torvalds Unix" ? b.author : "Me",
            collectionId: b.collectionId || "col-private",
          }));

        // Preserve user collections and col-private
        const existingCols = Array.isArray(parsed.collections)
          ? parsed.collections
          : [];
        const mergedCols = [...DEFAULT_COLLECTIONS];
        for (const ec of existingCols) {
          if (
            !mergedCols.some((c) => c.id === ec.id) &&
            (ec.createdAt > 1700000010000 || !ec.id.startsWith("col-"))
          ) {
            mergedCols.push(ec);
          }
        }

        if (cleanBoards.length > 0) {
          const activeBoardId = cleanBoards.some(
            (b) => b.id === parsed.activeBoardId,
          )
            ? parsed.activeBoardId
            : cleanBoards[0].id;

          return {
            activeBoardId,
            boards: cleanBoards,
            collections: mergedCols,
          };
        }
      }
    }
  } catch {
    // fallback to default state
  }

  const initialBoard: DrawoBoardMeta = {
    id: `board-${createId()}`,
    title: "Untitled scene",
    collectionId: "col-private",
    isFavorite: false,
    author: "Me",
    elementCount: 0,
    updatedAt: now,
    createdAt: now,
  };

  const initialState: DrawoWorkspaceState = {
    activeBoardId: initialBoard.id,
    boards: [initialBoard],
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
    const canvasBg = appState.viewBackgroundColor || "#ffffff";

    try {
      const scene: DrawoBoardScene = {
        elements: nonDeleted,
        appState: {
          viewBackgroundColor: canvasBg,
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
        currentBoard.viewBackgroundColor !== canvasBg ||
        now - lastMetaSyncTime > 5000)
    ) {
      lastMetaSyncTime = now;
      const nextBoards = state.boards.map((b) =>
        b.id === activeId
          ? {
              ...b,
              elementCount: nonDeleted.length,
              viewBackgroundColor: canvasBg,
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
      viewBackgroundColor?: string;
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
    const initialBg = opts?.viewBackgroundColor || "#ffffff";

    const newBoard: DrawoBoardMeta = {
      id: newBoardId,
      title: opts?.title?.trim() || `Untitled Board ${nextNumber}`,
      collectionId: opts?.collectionId !== undefined ? opts.collectionId : null,
      isFavorite: false,
      elementCount: elementsToSave.length,
      updatedAt: now,
      createdAt: now,
      viewBackgroundColor: initialBg,
    };

    try {
      const scene: DrawoBoardScene = {
        elements: elementsToSave,
        appState: { viewBackgroundColor: initialBg },
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
        viewBackgroundColor: initialBg,
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

    const sourceBg =
      boardId === state.activeBoardId
        ? api.getAppState().viewBackgroundColor || "#ffffff"
        : sourceScene?.appState?.viewBackgroundColor ||
          sourceBoard.viewBackgroundColor ||
          "#ffffff";

    const elements =
      boardId === state.activeBoardId
        ? getNonDeletedElements(api.getSceneElements())
        : sourceScene?.elements || [];

    await this.createBoard(api, {
      title: `${sourceBoard.title} Copy`,
      collectionId: sourceBoard.collectionId,
      initialElements: elements,
      viewBackgroundColor: sourceBg,
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
        title: "Untitled scene",
        collectionId: "col-private",
        isFavorite: false,
        author: "Me",
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

