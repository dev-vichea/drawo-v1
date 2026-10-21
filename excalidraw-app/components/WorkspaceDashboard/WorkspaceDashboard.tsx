import React, { useState, useRef, useEffect, useMemo } from "react";
import clsx from "clsx";
import { get } from "idb-keyval";

import { exportScene } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import {
  searchIcon,
  gridIcon,
  settingsIcon,
  usersIcon,
  TrashIcon,
  PlusIcon,
  DuplicateIcon,
  LinkIcon,
  CloseIcon,
  DotsHorizontalIcon,
  presentationIcon,
} from "@excalidraw/excalidraw/components/icons";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtom, useAtomValue } from "../../app-jotai";
import { DrawoAuth, drawoAuthAtom } from "../../data/DrawoAuth";
import {
  DrawoWorkspace,
  drawoWorkspaceAtom,
  isWorkspaceDashboardOpenAtom,
  workspaceBoardsStore,
  DEFAULT_COLLECTIONS,
  type DrawoBoardMeta,
  type DrawoBoardScene,
} from "../../data/DrawoWorkspace";

import "./WorkspaceDashboard.scss";

interface WorkspaceDashboardProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMins < 1) {
    return "Just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  }
  return `${diffYears === 1 ? "a" : diffYears} year${
    diffYears > 1 ? "s" : ""
  } ago`;
};

const thumbnailSvgCache = new Map<string, string>();

/**
 * Dynamic board thumbnail component that generates a live SVG preview
 * from the board's real Excalidraw elements stored in IndexedDB.
 */
const BoardThumbnail: React.FC<{
  board: DrawoBoardMeta;
  isActive: boolean;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}> = ({ board, isActive, excalidrawAPI }) => {
  const [svgHtml, setSvgHtml] = useState<string | null>(() => {
    return thumbnailSvgCache.get(board.id) || board.previewSvg || null;
  });

  useEffect(() => {
    let isMounted = true;

    const generatePreview = async () => {
      try {
        let elements: readonly ExcalidrawElement[] = [];

        if (isActive && excalidrawAPI) {
          elements = excalidrawAPI.getSceneElements();
        } else {
          const saved = await get<DrawoBoardScene>(
            board.id,
            workspaceBoardsStore,
          );
          if (saved && Array.isArray(saved.elements)) {
            elements = saved.elements;
          }
        }

        const nonDeleted = getNonDeletedElements(elements);
        if (!nonDeleted || nonDeleted.length === 0) {
          if (isMounted) {
            setSvgHtml(null);
          }
          return;
        }

        const svg = await exportScene({
          type: "svg",
          data: {
            elements: nonDeleted,
            files: null,
          },
          config: {
            skipInliningFonts: true,
            canvasBackgroundColor: false,
          },
        });

        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.objectFit = "contain";

        const html = svg.outerHTML;
        thumbnailSvgCache.set(board.id, html);

        if (isMounted) {
          setSvgHtml(html);
        }
      } catch {
        // Fallback to empty placeholder if export fails
      }
    };

    generatePreview();

    return () => {
      isMounted = false;
    };
  }, [board.id, board.updatedAt, board.elementCount, isActive, excalidrawAPI]);

  if (!svgHtml) {
    return (
      <div className="drawo-thumb-empty">
        <span>Empty scene</span>
      </div>
    );
  }

  return (
    <div
      className="drawo-thumb-svg-wrapper"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
};

/**
 * Playful hand-drawn background doodles matching Excalidraw+ onboarding.
 */
const DoodleBackground: React.FC = () => (
  <div className="drawo-onboard-doodles" aria-hidden="true">
    <svg className="doodle d-1" viewBox="0 0 40 40">
      <rect
        x="10"
        y="10"
        width="18"
        height="18"
        transform="rotate(35 19 19)"
        fill="none"
        stroke="#f87171"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-2" viewBox="0 0 50 30">
      <path
        d="M5 15 Q 15 2, 25 15 T 45 15"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-3" viewBox="0 0 40 40">
      <path
        d="M8 22 L30 14 M24 9 L31 14 L26 21"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
    <svg className="doodle d-4" viewBox="0 0 40 40">
      <path
        d="M20 6 L24 16 L34 20 L24 24 L20 34 L16 24 L6 20 L16 16 Z"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-5" viewBox="0 0 40 40">
      <polygon
        points="20,6 24,15 34,16 26,23 28,33 20,28 12,33 14,23 6,16 16,15"
        fill="none"
        stroke="#f87171"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-6" viewBox="0 0 50 35">
      <path
        d="M14 26 H34 A8 8 0 0 0 35 10 A10 10 0 0 0 16 8 A7 7 0 0 0 14 26 Z"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-7" viewBox="0 0 40 40">
      <text x="6" y="26" fill="#34d399" fontSize="20" fontFamily="monospace">
        {"{ }"}
      </text>
    </svg>
    <svg className="doodle d-8" viewBox="0 0 40 40">
      <path
        d="M12 28 L26 14 L30 18 L16 32 L10 34 Z"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-9" viewBox="0 0 40 40">
      <circle
        cx="20"
        cy="20"
        r="11"
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-10" viewBox="0 0 40 40">
      <path
        d="M20 32 C10 24, 6 14, 13 10 C17 8, 20 12, 20 14 C20 12, 23 8, 27 10 C34 14, 30 24, 20 32 Z"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
    </svg>
    <svg className="doodle d-11" viewBox="0 0 40 40">
      <path
        d="M20 8 V32 M8 20 H32"
        stroke="#9ca3af"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
    <svg className="doodle d-12" viewBox="0 0 40 40">
      <rect
        x="8"
        y="10"
        width="22"
        height="18"
        rx="3"
        transform="rotate(-12 19 19)"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
      />
    </svg>
  </div>
);

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({
  excalidrawAPI,
}) => {
  const [isOpen, setIsOpen] = useAtom(isWorkspaceDashboardOpenAtom);
  const workspace = useAtomValue(drawoWorkspaceAtom);
  const userProfile = useAtomValue(drawoAuthAtom);

  // Onboarding / screen flow state synced with browser pathname:
  // "/login" | "/signup" | "/no-workspace" | "/create-workspace" | "/user-settings" | "/workspace"
  const [screenOverride, setScreenOverride] = useState<
    "auto" | "no-workspace" | "create-workspace" | "user-settings"
  >(() => {
    const path = window.location.pathname;
    if (path === "/no-workspace") {
      return "no-workspace";
    }
    if (path === "/create-workspace") {
      return "create-workspace";
    }
    if (path === "/user-settings") {
      return "user-settings";
    }
    return "auto";
  });

  const navigatePage = (
    nextOverride:
      | "auto"
      | "no-workspace"
      | "create-workspace"
      | "user-settings",
    explicitPath?: string,
  ) => {
    setScreenOverride(nextOverride);
    const targetPath =
      explicitPath ||
      (nextOverride === "no-workspace"
        ? "/no-workspace"
        : nextOverride === "create-workspace"
        ? "/create-workspace"
        : nextOverride === "user-settings"
        ? "/user-settings"
        : !userProfile.isCloudAuthenticated
        ? "/login"
        : userProfile.workspaces.length === 0
        ? "/no-workspace"
        : "/workspace");
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, "", targetPath);
    }
  };

  const closeToEditor = () => {
    setIsOpen(false);
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", `/${window.location.hash || ""}`);
    }
  };

  const [isWsSwitcherOpen, setIsWsSwitcherOpen] = useState(false);

  const [selectedNav, setSelectedNav] = useState<
    "collection" | "dashboard" | "settings" | "members" | "trash"
  >("collection");
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<string>("col-private");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<
    "last-created" | "recently-edited" | "title"
  >("last-created");

  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [activeMenuBoardId, setActiveMenuBoardId] = useState<string | null>(
    null,
  );
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Sign In / Sign Up & Create Workspace form state (pre-filled with Firebase demo account for instant testing)
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("vicheachheng001@gmail.com");
  const [authPassword, setAuthPassword] = useState("drawo123456");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [authStatusMsg, setAuthStatusMsg] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);

  // Create Workspace state
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [includeStarterScenes, setIncludeStarterScenes] = useState(true);

  // User Settings state
  const [profileNameInput, setProfileNameInput] = useState(
    userProfile.displayName,
  );
  const [selectedAvatar, setSelectedAvatar] = useState(userProfile.avatar);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newColInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    DrawoAuth.initAuthListener();

    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/" || path === "") {
        setIsOpen(false);
      } else {
        setIsOpen(true);
        if (path === "/no-workspace") {
          setScreenOverride("no-workspace");
        } else if (path === "/create-workspace") {
          setScreenOverride("create-workspace");
        } else if (path === "/user-settings") {
          setScreenOverride("user-settings");
        } else {
          setScreenOverride("auto");
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setIsOpen]);

  // Keep browser URL pathname synced with the active full-page view
  useEffect(() => {
    if (!isOpen) {
      if (window.location.pathname !== "/") {
        window.history.replaceState({}, "", `/${window.location.hash || ""}`);
      }
      return;
    }

    const desiredPath = !userProfile.isCloudAuthenticated
      ? authMode === "signup"
        ? "/signup"
        : "/login"
      : screenOverride === "no-workspace"
      ? "/no-workspace"
      : screenOverride === "create-workspace"
      ? "/create-workspace"
      : screenOverride === "user-settings"
      ? "/user-settings"
      : userProfile.workspaces.length === 0
      ? "/no-workspace"
      : "/workspace";

    if (window.location.pathname !== desiredPath) {
      window.history.pushState({}, "", desiredPath);
    }
  }, [
    isOpen,
    userProfile.isCloudAuthenticated,
    userProfile.workspaces.length,
    screenOverride,
    authMode,
  ]);

  useEffect(() => {
    setProfileNameInput(userProfile.displayName);
    setSelectedAvatar(userProfile.avatar);
  }, [userProfile.displayName, userProfile.avatar]);

  // Keyboard navigation: Escape closes, Cmd+P or Cmd+O toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "o")) {
        if (!e.shiftKey && !e.altKey) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    if (isCreatingCollection) {
      newColInputRef.current?.focus();
    }
  }, [isCreatingCollection]);

  const activeWorkspaceEntry = useMemo(() => {
    return (
      userProfile.workspaces.find(
        (w) => w.id === userProfile.activeWorkspaceId,
      ) ||
      userProfile.workspaces[0] ||
      null
    );
  }, [userProfile.workspaces, userProfile.activeWorkspaceId]);

  const activeCollection = useMemo(() => {
    return (
      workspace.collections.find((c) => c.id === selectedCollectionId) ||
      workspace.collections[0] ||
      DEFAULT_COLLECTIONS[0]
    );
  }, [workspace.collections, selectedCollectionId]);

  const displayBoards = useMemo(() => {
    let boards = workspace.boards;

    if (selectedNav === "trash") {
      boards = boards.filter((b) => b.isTrash);
    } else {
      boards = boards.filter((b) => !b.isTrash);

      if (selectedNav === "collection") {
        boards = boards.filter((b) => b.collectionId === selectedCollectionId);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      boards = boards.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q)),
      );
    }

    const sorted = [...boards];
    if (sortMode === "last-created") {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortMode === "recently-edited") {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortMode === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }

    return sorted;
  }, [
    workspace.boards,
    selectedNav,
    selectedCollectionId,
    searchQuery,
    sortMode,
  ]);

  const handleSelectBoard = async (boardId: string) => {
    if (excalidrawAPI) {
      await DrawoWorkspace.switchBoard(boardId, excalidrawAPI);
    }
    closeToEditor();
  };

  const handleCreateScene = async () => {
    if (excalidrawAPI) {
      const colId =
        selectedNav === "collection" ? selectedCollectionId : "col-private";
      await DrawoWorkspace.createBoard(excalidrawAPI, {
        collectionId: colId,
      });
      await DrawoAuth.syncWorkspacesToCloud().catch(() => {});
      closeToEditor();
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !excalidrawAPI) {
      return;
    }
    const colId =
      selectedNav === "collection" ? selectedCollectionId : "col-private";
    for (let i = 0; i < files.length; i++) {
      await DrawoWorkspace.importBoardFile(files[i], excalidrawAPI, colId);
    }
    await DrawoAuth.syncWorkspacesToCloud().catch(() => {});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveNewCollection = () => {
    if (newColName.trim()) {
      const newCol = DrawoWorkspace.createCollection(
        newColName.trim(),
        "📁",
        "Custom collection",
      );
      if (newCol) {
        setSelectedNav("collection");
        setSelectedCollectionId(newCol.id);
      }
      DrawoAuth.syncWorkspacesToCloud().catch(() => {});
    }
    setNewColName("");
    setIsCreatingCollection(false);
  };

  // Auth handlers
  const handleGoogleSignIn = async () => {
    setAuthErrorMsg(null);
    setIsAuthBusy(true);
    try {
      await DrawoAuth.signInWithGoogle();
      setScreenOverride("auto");
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Google Sign-In failed.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleGithubSignIn = async () => {
    setAuthErrorMsg(null);
    setIsAuthBusy(true);
    try {
      await DrawoAuth.signInWithGithub();
      setScreenOverride("auto");
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "GitHub Sign-In failed.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErrorMsg(null);
    if (!authEmail.trim() || !authPassword) {
      setAuthErrorMsg("Please enter your email and password.");
      return;
    }
    setIsAuthBusy(true);
    try {
      if (authMode === "signup") {
        await DrawoAuth.signUpWithEmail(
          authEmail,
          authPassword,
          authDisplayName,
        );
      } else {
        await DrawoAuth.signInWithEmail(authEmail, authPassword);
      }
      setAuthPassword("");
      setScreenOverride("auto");
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Authentication failed.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleCreateWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthBusy(true);
    try {
      const defaultName =
        newWorkspaceName.trim() ||
        `${userProfile.displayName || "My"}'s Workspace`;
      await DrawoAuth.createWorkspace(defaultName, includeStarterScenes);
      setNewWorkspaceName("");
      setScreenOverride("auto");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSaveUserSettings = (e: React.FormEvent) => {
    e.preventDefault();
    DrawoAuth.updateUserProfile({
      displayName: profileNameInput,
      avatar: selectedAvatar,
    });
    setAuthStatusMsg("User settings saved!");
    setTimeout(() => {
      setAuthStatusMsg(null);
      setScreenOverride("auto");
    }, 900);
  };

  if (!isOpen) {
    return null;
  }

  // Determine which view to show:
  // 1. Not signed in -> Sign In / Sign Up screen
  // 2. Signed in, but 0 workspaces (or screenOverride === "no-workspace") -> "No workspace yet" screen
  // 3. screenOverride === "create-workspace" -> Create Workspace screen
  // 4. screenOverride === "user-settings" -> User Settings screen
  // 5. Signed in and has >=1 workspaces -> Full Workspace Dashboard
  const activeScreen = !userProfile.isCloudAuthenticated
    ? "auth"
    : screenOverride !== "auto"
    ? screenOverride
    : userProfile.workspaces.length === 0
    ? "no-workspace"
    : "dashboard";

  // =========================================================================
  // ONBOARDING / AUTH / NO-WORKSPACE / CREATE-WORKSPACE SCREENS
  // =========================================================================
  if (activeScreen !== "dashboard") {
    return (
      <div className="drawo-dashboard-backdrop drawo-fullpage-view">
        <div
          className="drawo-dashboard-modal drawo-onboard-surface"
          data-testid="drawo-workspace-onboarding"
        >
          <DoodleBackground />

          {/* Top Bar (Logo left, User avatar/Close right) */}
          <header className="drawo-onboard-topbar">
            <button
              type="button"
              className="drawo-onboard-logo"
              title="Back to Drawo Editor"
              onClick={closeToEditor}
            >
              <svg viewBox="0 0 28 28" width="28" height="28" fill="none">
                <path
                  d="M6 22L22 6M6 6l16 16"
                  stroke="var(--color-primary)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="drawo-onboard-topbar__right">
              {userProfile.isCloudAuthenticated && (
                <button
                  type="button"
                  className="drawo-onboard-avatar-btn"
                  title={`${userProfile.displayName} (${userProfile.email})`}
                  onClick={() =>
                    navigatePage(
                      activeScreen === "user-settings"
                        ? "auto"
                        : "user-settings",
                    )
                  }
                >
                  {userProfile.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.displayName}
                    />
                  ) : (
                    <span>{userProfile.avatar || "🐧"}</span>
                  )}
                </button>
              )}
            </div>
          </header>

          {/* Center Floating Card */}
          <div className="drawo-onboard-center-wrap">
            <div className="drawo-onboard-card">
              {/* Tilted Purple "Welcome!" Badge */}
              <div className="drawo-onboard-welcome-tag">Welcome!</div>

              {/* Dashed Shapes Illustration */}
              <div className="drawo-onboard-illustration">
                <svg viewBox="0 0 160 88" width="148" height="82" fill="none">
                  <rect
                    x="4"
                    y="4"
                    width="152"
                    height="80"
                    rx="10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    opacity="0.35"
                  />
                  <rect
                    x="26"
                    y="18"
                    width="24"
                    height="24"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity="0.45"
                  />
                  <path
                    d="M80 34V54M70 44H90"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                  <polygon
                    points="118,18 134,46 102,46"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    opacity="0.45"
                  />
                  <rect
                    x="74"
                    y="58"
                    width="12"
                    height="12"
                    transform="rotate(45 80 64)"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity="0.45"
                  />
                </svg>
              </div>

              {/* ========================================================= */}
              {/* SCREEN 1: SIGN IN / SIGN UP                               */}
              {/* ========================================================= */}
              {activeScreen === "auth" && (
                <>
                  <h1 className="drawo-onboard-title">
                    {authMode === "signup"
                      ? "Create your account"
                      : "Sign in to Drawo"}
                    <span className="drawo-onboard-title__swoosh" />
                  </h1>
                  <p className="drawo-onboard-subtitle">
                    {authMode === "signup"
                      ? "Sign up to create cloud workspaces and sync your scenes."
                      : "Welcome back! Sign in to access your workspaces."}
                  </p>

                  {authErrorMsg && (
                    <div className="drawo-onboard-alert drawo-onboard-alert--error">
                      {authErrorMsg}
                    </div>
                  )}

                  <div className="drawo-onboard-oauth-stack">
                    <button
                      type="button"
                      className="drawo-onboard-oauth-btn"
                      onClick={handleGoogleSignIn}
                      disabled={isAuthBusy}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.98-2.19-6.96-5.14H1.04v3.14C3.05 21.14 7.2 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.04 14.01A7.3 7.3 0 0 1 4.66 12c0-.7.13-1.38.38-2.01V6.85H1.04A11.98 11.98 0 0 0 0 12c0 1.92.46 3.74 1.04 5.15l4-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.2 0 3.05 2.86 1.04 6.85l4 3.14c.98-2.95 3.72-5.24 6.96-5.24Z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </button>

                    <button
                      type="button"
                      className="drawo-onboard-oauth-btn"
                      onClick={handleGithubSignIn}
                      disabled={isAuthBusy}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                      </svg>
                      <span>Continue with GitHub</span>
                    </button>
                  </div>

                  <div className="drawo-onboard-or">
                    <span>or with email</span>
                  </div>

                  <form
                    className="drawo-onboard-form"
                    onSubmit={handleEmailSubmit}
                  >
                    {authMode === "signup" && (
                      <TextField
                        label="Name"
                        placeholder="Your display name"
                        value={authDisplayName}
                        onChange={(val) => setAuthDisplayName(val)}
                        fullWidth
                      />
                    )}
                    <TextField
                      label="Email"
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(val) => setAuthEmail(val)}
                      fullWidth
                    />
                    <TextField
                      label="Password"
                      isRedacted
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(val) => setAuthPassword(val)}
                      fullWidth
                    />

                    <button
                      type="submit"
                      className="drawo-onboard-primary-btn"
                      disabled={isAuthBusy}
                    >
                      {isAuthBusy
                        ? "Please wait..."
                        : authMode === "signup"
                        ? "+ Sign up & continue"
                        : "Sign in"}
                    </button>
                  </form>

                  {/* 1-Click Firebase Demo Account Quick Switcher */}
                  <div className="drawo-demo-accounts-row">
                    <span className="drawo-demo-accounts-label">
                      Demo accounts:
                    </span>
                    <button
                      type="button"
                      className="drawo-demo-chip"
                      disabled={isAuthBusy}
                      onClick={async () => {
                        setAuthEmail("orizyy08@gmail.com");
                        setAuthPassword("drawo123456");
                        setAuthErrorMsg(null);
                        setIsAuthBusy(true);
                        try {
                          await DrawoAuth.signInWithEmail(
                            "orizyy08@gmail.com",
                            "drawo123456",
                          );
                          setScreenOverride("auto");
                        } catch (err: any) {
                          setAuthErrorMsg(err?.message || "Sign in failed.");
                        } finally {
                          setIsAuthBusy(false);
                        }
                      }}
                    >
                      ⚡ orizyy08@gmail.com
                    </button>
                    <button
                      type="button"
                      className="drawo-demo-chip"
                      disabled={isAuthBusy}
                      onClick={async () => {
                        setAuthEmail("vicheachheng001@gmail.com");
                        setAuthPassword("drawo123456");
                        setAuthErrorMsg(null);
                        setIsAuthBusy(true);
                        try {
                          await DrawoAuth.signInWithEmail(
                            "vicheachheng001@gmail.com",
                            "drawo123456",
                          );
                          setScreenOverride("auto");
                        } catch (err: any) {
                          setAuthErrorMsg(err?.message || "Sign in failed.");
                        } finally {
                          setIsAuthBusy(false);
                        }
                      }}
                    >
                      ⚡ vicheachheng001@gmail.com
                    </button>
                    <button
                      type="button"
                      className="drawo-demo-chip"
                      disabled={isAuthBusy}
                      onClick={async () => {
                        setAuthEmail("demo@drawo.app");
                        setAuthPassword("drawo123456");
                        setAuthErrorMsg(null);
                        setIsAuthBusy(true);
                        try {
                          await DrawoAuth.signInWithEmail(
                            "demo@drawo.app",
                            "drawo123456",
                          );
                          setScreenOverride("auto");
                        } catch (err: any) {
                          setAuthErrorMsg(err?.message || "Sign in failed.");
                        } finally {
                          setIsAuthBusy(false);
                        }
                      }}
                    >
                      ⚡ demo@drawo.app
                    </button>
                  </div>

                  <button
                    type="button"
                    className="drawo-onboard-link-btn"
                    onClick={() => {
                      setAuthErrorMsg(null);
                      setAuthMode(authMode === "signin" ? "signup" : "signin");
                    }}
                  >
                    {authMode === "signin"
                      ? "Don't have an account? Create account"
                      : "Already have an account? Sign in"}
                  </button>
                </>
              )}

              {/* ========================================================= */}
              {/* SCREEN 2: NO WORKSPACE YET (Matches screenshot!)          */}
              {/* ========================================================= */}
              {activeScreen === "no-workspace" && (
                <>
                  <h1 className="drawo-onboard-title">
                    No workspace yet
                    <span className="drawo-onboard-title__swoosh" />
                  </h1>
                  <p className="drawo-onboard-subtitle">
                    You haven't created any workspace yet. Let's change that!
                  </p>

                  {/* Signed In As Pill Box */}
                  <div className="drawo-signed-in-pill">
                    <div className="drawo-signed-in-pill__left">
                      <span className="drawo-signed-in-pill__label">
                        SIGNED IN AS
                      </span>
                      <span className="drawo-signed-in-pill__email">
                        {userProfile.email || userProfile.displayName}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="drawo-signed-in-pill__signout"
                      onClick={() => DrawoAuth.signOut()}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>Sign out</span>
                    </button>
                  </div>

                  {/* Primary CTA: + Create workspace */}
                  <button
                    type="button"
                    className="drawo-onboard-primary-btn"
                    onClick={() => navigatePage("create-workspace")}
                  >
                    <span>+</span>
                    <span>Create workspace</span>
                  </button>

                  {/* Secondary link: User settings */}
                  <button
                    type="button"
                    className="drawo-onboard-link-btn"
                    onClick={() => navigatePage("user-settings")}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>User settings</span>
                  </button>

                  {userProfile.workspaces.length > 0 && (
                    <button
                      type="button"
                      className="drawo-onboard-link-btn"
                      onClick={() => navigatePage("auto")}
                    >
                      ← Back to {activeWorkspaceEntry?.name || "workspace"}
                    </button>
                  )}
                </>
              )}

              {/* ========================================================= */}
              {/* SCREEN 3: CREATE WORKSPACE                                */}
              {/* ========================================================= */}
              {activeScreen === "create-workspace" && (
                <>
                  <h1 className="drawo-onboard-title">
                    Create workspace
                    <span className="drawo-onboard-title__swoosh" />
                  </h1>
                  <p className="drawo-onboard-subtitle">
                    Give your workspace a name to organize your boards and
                    collections.
                  </p>

                  <form
                    className="drawo-onboard-form"
                    onSubmit={handleCreateWorkspaceSubmit}
                  >
                    <div className="drawo-create-ws-preview">
                      <div className="drawo-ws-header__avatar">
                        {(
                          newWorkspaceName.trim() ||
                          userProfile.displayName ||
                          "D"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <span>
                        {newWorkspaceName.trim() ||
                          `${userProfile.displayName || "My"}'s Workspace`}
                      </span>
                    </div>

                    <TextField
                      label="Workspace name"
                      placeholder={`${
                        userProfile.displayName || "My"
                      }'s Workspace`}
                      value={newWorkspaceName}
                      onChange={(val) => setNewWorkspaceName(val)}
                      selectOnRender
                      fullWidth
                    />

                    <label className="drawo-create-ws-checkbox">
                      <input
                        type="checkbox"
                        checked={includeStarterScenes}
                        onChange={(e) =>
                          setIncludeStarterScenes(e.target.checked)
                        }
                      />
                      <span>Include starter example scenes & templates</span>
                    </label>

                    <button
                      type="submit"
                      className="drawo-onboard-primary-btn"
                      disabled={isAuthBusy}
                    >
                      <span>+</span>
                      <span>
                        {isAuthBusy
                          ? "Creating workspace..."
                          : "Create workspace"}
                      </span>
                    </button>
                  </form>

                  <button
                    type="button"
                    className="drawo-onboard-link-btn"
                    onClick={() =>
                      setScreenOverride(
                        userProfile.workspaces.length === 0
                          ? "no-workspace"
                          : "auto",
                      )
                    }
                  >
                    ← Back
                  </button>
                </>
              )}

              {/* ========================================================= */}
              {/* SCREEN 4: USER SETTINGS                                   */}
              {/* ========================================================= */}
              {activeScreen === "user-settings" && (
                <>
                  <h1 className="drawo-onboard-title">
                    User settings
                    <span className="drawo-onboard-title__swoosh" />
                  </h1>
                  <p className="drawo-onboard-subtitle">
                    Customize your display name and avatar across workspaces.
                  </p>

                  {authStatusMsg && (
                    <div className="drawo-onboard-alert drawo-onboard-alert--success">
                      {authStatusMsg}
                    </div>
                  )}

                  <form
                    className="drawo-onboard-form"
                    onSubmit={handleSaveUserSettings}
                  >
                    <div className="drawo-auth-avatar-picker">
                      {["🐧", "🚀", "⚡", "🦊", "🎨", "🤖", "🐱", "💎"].map(
                        (emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={clsx("drawo-auth-avatar-btn", {
                              "drawo-auth-avatar-btn--active":
                                selectedAvatar === emoji,
                            })}
                            onClick={() => setSelectedAvatar(emoji)}
                          >
                            {emoji}
                          </button>
                        ),
                      )}
                    </div>

                    <TextField
                      label="Display name"
                      placeholder="Your name"
                      value={profileNameInput}
                      onChange={(val) => setProfileNameInput(val)}
                      fullWidth
                    />

                    <button type="submit" className="drawo-onboard-primary-btn">
                      Save settings
                    </button>
                  </form>

                  <button
                    type="button"
                    className="drawo-onboard-link-btn"
                    onClick={() => navigatePage("auto")}
                  >
                    ← Back
                  </button>
                </>
              )}

              {/* Card Footer matching screenshot */}
              <div className="drawo-onboard-footer">
                <p className="drawo-onboard-footer__note">
                  Don't want to{" "}
                  {activeScreen === "auth" ? "sign in" : "create a workspace"}{" "}
                  just yet? You are welcome to use our free open source editor
                  over at{" "}
                  <button
                    type="button"
                    className="drawo-onboard-inline-link"
                    onClick={closeToEditor}
                  >
                    drawo.app
                  </button>{" "}
                  in the meantime.
                </p>

                <div className="drawo-onboard-footer__divider">
                  <span>Need help?</span>
                </div>

                <div className="drawo-onboard-footer__links">
                  <a href="mailto:support@excalidraw.com">
                    ✉ support@excalidraw.com
                  </a>
                  <span className="sep">|</span>
                  <a
                    href="https://discord.gg/UexuTaE"
                    target="_blank"
                    rel="noreferrer"
                  >
                    💬 Get help on Discord
                  </a>
                  <span className="sep">|</span>
                  <a
                    href="https://github.com/excalidraw/excalidraw/issues"
                    target="_blank"
                    rel="noreferrer"
                  >
                    🐙 Report issue on GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FULL WORKSPACE DASHBOARD (Signed in & has >= 1 Workspace)
  // =========================================================================
  const currentWorkspaceName = activeWorkspaceEntry?.name || "drawo";

  return (
    <div className="drawo-dashboard-backdrop" onClick={closeToEditor}>
      <div
        className="drawo-dashboard-modal"
        onClick={(e) => {
          e.stopPropagation();
          setActiveMenuBoardId(null);
          setIsWsSwitcherOpen(false);
        }}
        data-testid="drawo-workspace-dashboard"
      >
        {/* Left Sidebar */}
        <aside className="drawo-dashboard-sidebar">
          {/* Workspace Switcher Header */}
          <div
            className="drawo-ws-switcher-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="drawo-ws-header"
              onClick={() => setIsWsSwitcherOpen((prev) => !prev)}
              title="Switch or create workspace"
            >
              <div className="drawo-ws-header__avatar">
                {currentWorkspaceName.charAt(0).toUpperCase()}
              </div>
              <div className="drawo-ws-header__info">
                <div className="drawo-ws-header__title">
                  {currentWorkspaceName}
                </div>
                <div className="drawo-ws-header__plan">
                  {userProfile.workspaces.length} workspace
                  {userProfile.workspaces.length > 1 ? "s" : ""} ▾
                </div>
              </div>
            </div>

            {isWsSwitcherOpen && (
              <div className="drawo-ws-switcher-menu">
                <div className="drawo-ws-switcher-menu__label">
                  Your Workspaces
                </div>
                {userProfile.workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    className={clsx("drawo-ws-switcher-item", {
                      active: ws.id === activeWorkspaceEntry?.id,
                    })}
                    onClick={() => {
                      DrawoAuth.switchWorkspace(ws.id);
                      setIsWsSwitcherOpen(false);
                    }}
                  >
                    <span className="ws-avatar">
                      {ws.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="ws-name">{ws.name}</span>
                  </button>
                ))}
                <div className="drawo-ws-switcher-divider" />
                <button
                  type="button"
                  className="drawo-ws-switcher-action"
                  onClick={() => {
                    setIsWsSwitcherOpen(false);
                    setScreenOverride("create-workspace");
                  }}
                >
                  + Create new workspace
                </button>
                <button
                  type="button"
                  className="drawo-ws-switcher-action"
                  onClick={() => {
                    setIsWsSwitcherOpen(false);
                    setScreenOverride("no-workspace");
                  }}
                >
                  Welcome / Account screen
                </button>
              </div>
            )}
          </div>

          {/* Native TextField component for search */}
          <div className="drawo-ws-search-wrap">
            <TextField
              type="search"
              icon={searchIcon}
              placeholder="Quick search"
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              fullWidth
            />
          </div>

          {/* Core Navigation Items */}
          <nav className="drawo-ws-nav">
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "dashboard",
              })}
              onClick={() => setSelectedNav("dashboard")}
            >
              <span className="drawo-ws-nav__icon">{gridIcon}</span>
              <span>Dashboard</span>
            </button>
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "settings",
              })}
              onClick={() => setSelectedNav("settings")}
            >
              <span className="drawo-ws-nav__icon">{settingsIcon}</span>
              <span>Workspace settings</span>
            </button>
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "members",
              })}
              onClick={() => setSelectedNav("members")}
            >
              <span className="drawo-ws-nav__icon">{usersIcon}</span>
              <span>Team members</span>
            </button>
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "trash",
              })}
              onClick={() => setSelectedNav("trash")}
            >
              <span className="drawo-ws-nav__icon">{TrashIcon}</span>
              <span>Trash</span>
            </button>
          </nav>

          {/* Collections Section */}
          <div className="drawo-ws-collections-header">
            <span className="drawo-ws-collections-title">Collections</span>
            <button
              className="drawo-ws-collections-add"
              title="Add collection"
              onClick={() => setIsCreatingCollection(true)}
            >
              {PlusIcon}
            </button>
          </div>

          <div className="drawo-ws-collections-list">
            {workspace.collections.map((col) => {
              const isSelected =
                selectedNav === "collection" && selectedCollectionId === col.id;
              return (
                <button
                  key={col.id}
                  className={clsx("drawo-ws-col-item", {
                    "drawo-ws-col-item--active": isSelected,
                  })}
                  onClick={() => {
                    setSelectedNav("collection");
                    setSelectedCollectionId(col.id);
                  }}
                >
                  <span className="drawo-ws-col-item__icon">
                    {col.icon || "📁"}
                  </span>
                  <span className="drawo-ws-col-item__name">{col.name}</span>
                </button>
              );
            })}

            {isCreatingCollection && (
              <div className="drawo-ws-col-new-row">
                <input
                  ref={newColInputRef}
                  type="text"
                  placeholder="Collection name..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveNewCollection();
                    } else if (e.key === "Escape") {
                      setIsCreatingCollection(false);
                      setNewColName("");
                    }
                  }}
                  className="drawo-ws-col-new-input"
                />
                <button
                  onClick={handleSaveNewCollection}
                  className="drawo-ws-col-new-btn"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* User Profile Footer */}
          <div
            className="drawo-ws-user-footer"
            onClick={() => setScreenOverride("user-settings")}
            title="User settings & account"
          >
            <div className="drawo-ws-user-badge">
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="drawo-ws-user-photo"
                />
              ) : (
                <span className="drawo-ws-user-avatar">
                  {userProfile.avatar || "🐧"}
                </span>
              )}
              <span className="drawo-ws-user-name">
                {userProfile.displayName || userProfile.email}
              </span>
            </div>
            <button
              type="button"
              className="drawo-ws-user-status-pill"
              onClick={(e) => {
                e.stopPropagation();
                DrawoAuth.signOut();
              }}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="drawo-dashboard-main">
          {/* Main Top Header */}
          <header className="drawo-main-header">
            <div className="drawo-main-header__left">
              <div className="drawo-main-header__title-row">
                <span className="drawo-main-header__icon">
                  {selectedNav === "dashboard"
                    ? "⊞"
                    : selectedNav === "settings"
                    ? "⚙"
                    : selectedNav === "members"
                    ? "👥"
                    : selectedNav === "trash"
                    ? "🗑"
                    : activeCollection.icon || "🔒"}
                </span>
                <h2 className="drawo-main-header__title">
                  {selectedNav === "dashboard"
                    ? "Dashboard"
                    : selectedNav === "settings"
                    ? "Workspace Settings"
                    : selectedNav === "members"
                    ? "Team Members"
                    : selectedNav === "trash"
                    ? "Trash"
                    : activeCollection.name}
                </h2>
              </div>
              <p className="drawo-main-header__subtitle">
                {selectedNav === "dashboard"
                  ? "Overview of all your boards and drawings across all collections."
                  : selectedNav === "settings"
                  ? "Manage workspace preferences, create new workspaces, and sync to Firebase."
                  : selectedNav === "members"
                  ? "Manage collaborators, permission roles, and guest links."
                  : selectedNav === "trash"
                  ? "Deleted boards are saved here. You can restore them or empty the trash."
                  : activeCollection.description ||
                    "This is your collection. Drag a scene to a different collection to reorganize."}
              </p>
            </div>

            <div className="drawo-main-header__actions">
              {(selectedNav === "collection" ||
                selectedNav === "dashboard") && (
                <div className="drawo-sort-select-wrap">
                  <select
                    className="drawo-sort-select"
                    value={sortMode}
                    onChange={(e: any) => setSortMode(e.target.value)}
                  >
                    <option value="last-created">Last created ⇅</option>
                    <option value="recently-edited">Recently edited</option>
                    <option value="title">Alphabetical (A-Z)</option>
                  </select>
                </div>
              )}

              <button
                className="drawo-close-modal-btn"
                title="Back to canvas editor (Esc)"
                onClick={closeToEditor}
              >
                {CloseIcon}
              </button>
            </div>
          </header>

          {/* Quick Action Banners */}
          {(selectedNav === "collection" || selectedNav === "dashboard") && (
            <div className="drawo-action-banners-row">
              <div className="drawo-action-banner" onClick={handleImportClick}>
                <div className="drawo-action-banner__icon drawo-action-banner__icon--import">
                  {presentationIcon}
                </div>
                <div className="drawo-action-banner__content">
                  <div className="drawo-action-banner__title">
                    Import scenes +
                  </div>
                  <div className="drawo-action-banner__sub">
                    Upload .excalidraw or .json
                  </div>
                </div>
              </div>

              <div className="drawo-action-banner" onClick={handleCreateScene}>
                <div className="drawo-action-banner__icon drawo-action-banner__icon--create">
                  {PlusIcon}
                </div>
                <div className="drawo-action-banner__content">
                  <div className="drawo-action-banner__title">
                    Create scene +
                  </div>
                  <div className="drawo-action-banner__sub">
                    Start a fresh blank canvas
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".excalidraw,.json"
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* Scenes Grid */}
          {(selectedNav === "collection" ||
            selectedNav === "dashboard" ||
            selectedNav === "trash") && (
            <div className="drawo-scenes-grid-container">
              {displayBoards.length === 0 ? (
                <div className="drawo-scenes-empty">
                  <div className="drawo-scenes-empty__icon">
                    {selectedNav === "trash" ? "🗑️" : "🎨"}
                  </div>
                  <h3>
                    {selectedNav === "trash"
                      ? "Trash is empty"
                      : "No scenes in this collection yet"}
                  </h3>
                  <p>
                    {selectedNav === "trash"
                      ? "Deleted boards will appear here."
                      : "Click 'Create scene +' above or import existing .excalidraw files."}
                  </p>
                  {selectedNav !== "trash" && (
                    <FilledButton
                      size="large"
                      variant="filled"
                      color="primary"
                      icon={PlusIcon}
                      label="Create First Scene"
                      onClick={handleCreateScene}
                    >
                      Create First Scene
                    </FilledButton>
                  )}
                </div>
              ) : (
                <div className="drawo-scenes-grid">
                  {displayBoards.map((board) => {
                    const isActive = board.id === workspace.activeBoardId;
                    const isEditing = editingBoardId === board.id;
                    const isMenuOpen = activeMenuBoardId === board.id;

                    return (
                      <div
                        key={board.id}
                        className={clsx("drawo-scene-card", {
                          "drawo-scene-card--active": isActive,
                          "drawo-scene-card--menu-open": isMenuOpen,
                        })}
                        onClick={() => handleSelectBoard(board.id)}
                      >
                        <div className="drawo-scene-card__thumb">
                          <BoardThumbnail
                            board={board}
                            isActive={isActive}
                            excalidrawAPI={excalidrawAPI}
                          />
                          <div className="drawo-scene-card__time">
                            {formatRelativeTime(
                              board.updatedAt || board.createdAt,
                            )}
                          </div>
                        </div>

                        <div className="drawo-scene-card__info">
                          <div className="drawo-scene-card__title-row">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTitle}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setEditingTitle(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    DrawoWorkspace.renameBoard(
                                      board.id,
                                      editingTitle,
                                    );
                                    setEditingBoardId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingBoardId(null);
                                  }
                                }}
                                onBlur={() => {
                                  DrawoWorkspace.renameBoard(
                                    board.id,
                                    editingTitle,
                                  );
                                  setEditingBoardId(null);
                                }}
                                className="drawo-scene-card__title-input"
                              />
                            ) : (
                              <span
                                className="drawo-scene-card__title"
                                title={board.title}
                              >
                                {board.title}
                              </span>
                            )}
                          </div>

                          <div className="drawo-scene-card__sub-row">
                            <span className="drawo-scene-card__author">
                              by {board.author || userProfile.displayName}
                            </span>

                            <div
                              className="drawo-scene-card__actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="drawo-scene-btn"
                                title="Copy link"
                                onClick={() => {
                                  navigator.clipboard?.writeText(
                                    `${window.location.origin}/#board=${board.id}`,
                                  );
                                }}
                              >
                                {LinkIcon}
                              </button>

                              <button
                                className="drawo-scene-btn"
                                title="More options"
                                onClick={() =>
                                  setActiveMenuBoardId(
                                    activeMenuBoardId === board.id
                                      ? null
                                      : board.id,
                                  )
                                }
                              >
                                {DotsHorizontalIcon}
                              </button>

                              {activeMenuBoardId === board.id && (
                                <div className="drawo-card-context-menu">
                                  {board.isTrash ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          DrawoWorkspace.restoreFromTrash(
                                            board.id,
                                          );
                                          setActiveMenuBoardId(null);
                                        }}
                                      >
                                        Restore Scene
                                      </button>
                                      <button
                                        className="danger"
                                        onClick={() => {
                                          if (excalidrawAPI) {
                                            DrawoWorkspace.deleteBoard(
                                              board.id,
                                              excalidrawAPI,
                                            );
                                          }
                                          setActiveMenuBoardId(null);
                                        }}
                                      >
                                        Delete Permanently
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingBoardId(board.id);
                                          setEditingTitle(board.title);
                                          setActiveMenuBoardId(null);
                                        }}
                                      >
                                        <span className="menu-icon">✎</span>
                                        <span>Rename</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (excalidrawAPI) {
                                            DrawoWorkspace.duplicateBoard(
                                              board.id,
                                              excalidrawAPI,
                                            );
                                          }
                                          setActiveMenuBoardId(null);
                                        }}
                                      >
                                        <span className="menu-icon">
                                          {DuplicateIcon}
                                        </span>
                                        <span>Duplicate</span>
                                      </button>
                                      <div className="drawo-menu-divider" />
                                      <div className="drawo-menu-label">
                                        Move to Collection
                                      </div>
                                      <div className="drawo-menu-collections-scroll">
                                        {workspace.collections.map((col) => (
                                          <button
                                            key={col.id}
                                            className={clsx("drawo-menu-sub", {
                                              active:
                                                board.collectionId === col.id,
                                            })}
                                            onClick={() => {
                                              DrawoWorkspace.moveBoardToCollection(
                                                board.id,
                                                col.id,
                                              );
                                              setActiveMenuBoardId(null);
                                            }}
                                          >
                                            <span className="menu-col-icon">
                                              {col.icon || "📁"}
                                            </span>
                                            <span>{col.name}</span>
                                          </button>
                                        ))}
                                      </div>
                                      <div className="drawo-menu-divider" />
                                      <button
                                        className="danger"
                                        onClick={() => {
                                          DrawoWorkspace.moveToTrash(board.id);
                                          setActiveMenuBoardId(null);
                                        }}
                                      >
                                        <span className="menu-icon">
                                          {TrashIcon}
                                        </span>
                                        <span>Move to Trash</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab Content */}
          {selectedNav === "settings" && (
            <div className="drawo-ws-settings-panel">
              <div className="drawo-ws-settings-card">
                <h3>Workspace Details</h3>
                <div className="drawo-ws-setting-row">
                  <span className="label">Active Workspace:</span>
                  <span className="val">{currentWorkspaceName}</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Signed In As:</span>
                  <span className="val">{userProfile.email}</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Firebase Project:</span>
                  <span className="badge-plan">drawo-e4ac6 (Spark)</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Total Boards:</span>
                  <span className="val">{workspace.boards.length}</span>
                </div>
                <div className="drawo-ws-actions-row" style={{ marginTop: 18 }}>
                  <FilledButton
                    size="large"
                    variant="filled"
                    color="primary"
                    label="+ Create New Workspace"
                    onClick={() => setScreenOverride("create-workspace")}
                  >
                    + Create New Workspace
                  </FilledButton>
                  <FilledButton
                    size="large"
                    variant="outlined"
                    color="primary"
                    label="User Settings"
                    onClick={() => setScreenOverride("user-settings")}
                  >
                    User Settings
                  </FilledButton>
                </div>
              </div>
            </div>
          )}

          {/* Team Members Tab Content */}
          {selectedNav === "members" && (
            <div className="drawo-ws-settings-panel">
              <div className="drawo-ws-settings-card">
                <h3>Workspace Members</h3>
                <div className="drawo-member-item">
                  {userProfile.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.displayName}
                      className="drawo-ws-user-photo"
                    />
                  ) : (
                    <span className="drawo-member-avatar">
                      {userProfile.avatar || "🐧"}
                    </span>
                  )}
                  <div className="drawo-member-info">
                    <div className="drawo-member-name">
                      {userProfile.displayName}
                    </div>
                    <div className="drawo-member-role">
                      {userProfile.email} • Workspace Owner
                    </div>
                  </div>
                  <span className="drawo-member-status">Active</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
