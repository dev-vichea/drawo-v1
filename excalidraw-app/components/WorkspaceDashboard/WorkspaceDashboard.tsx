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
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) {
    return "Just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDay === 1) {
    return "Yesterday";
  }
  if (diffDay < 30) {
    return `${diffDay}d ago`;
  }
  if (diffMonth === 1) {
    return "1 month ago";
  }
  if (diffMonth < 12) {
    return `${diffMonth} months ago`;
  }
  if (diffYear === 1) {
    return "a year ago";
  }
  return `${diffYear} years ago`;
};

// Global memory cache for rendered thumbnails to avoid lag
const thumbnailSvgCache = new Map<string, string>();

interface BoardThumbnailProps {
  board: DrawoBoardMeta;
  isActive: boolean;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

const BoardThumbnail: React.FC<BoardThumbnailProps> = ({
  board,
  isActive,
  excalidrawAPI,
}) => {
  const [svgHtml, setSvgHtml] = useState<string | null>(() => {
    return thumbnailSvgCache.get(board.id) || null;
  });
  const [loading, setLoading] = useState<boolean>(!svgHtml);

  useEffect(() => {
    let cancelled = false;

    async function generateSvg() {
      try {
        let elements: readonly ExcalidrawElement[] = [];

        if (isActive && excalidrawAPI) {
          elements = excalidrawAPI.getSceneElements();
        } else {
          const scene = await get<DrawoBoardScene>(
            board.id,
            workspaceBoardsStore,
          );
          elements = scene?.elements || [];
        }

        const nonDeleted = getNonDeletedElements(elements);
        if (nonDeleted.length === 0) {
          if (!cancelled) {
            setSvgHtml(null);
            setLoading(false);
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

        if (!cancelled) {
          setSvgHtml(html);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    generateSvg();

    return () => {
      cancelled = true;
    };
  }, [board.id, isActive, excalidrawAPI, board.updatedAt]);

  if (loading) {
    return (
      <div className="drawo-thumb-skeleton">
        <div className="drawo-thumb-skeleton__pulse" />
      </div>
    );
  }

  if (svgHtml) {
    return (
      <div
        className="drawo-thumb-rendered"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    );
  }

  return (
    <div className="drawo-thumb-empty">
      <div className="drawo-thumb-empty__grid" />
      <div className="drawo-thumb-empty__content">
        <span className="drawo-thumb-empty__icon">✏️</span>
        <span className="drawo-thumb-empty__text">Blank Canvas</span>
      </div>
    </div>
  );
};

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({
  excalidrawAPI,
}) => {
  const [isOpen, setIsOpen] = useAtom(isWorkspaceDashboardOpenAtom);
  const workspace = useAtomValue(drawoWorkspaceAtom);
  const userProfile = useAtomValue(drawoAuthAtom);

  const [selectedNav, setSelectedNav] = useState<
    "collection" | "dashboard" | "settings" | "members" | "trash" | "auth"
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

  // Auth & Profile state
  const [profileNameInput, setProfileNameInput] = useState(
    userProfile.displayName,
  );
  const [workspaceNameInput, setWorkspaceNameInput] = useState(
    userProfile.workspaceName,
  );
  const [selectedAvatar, setSelectedAvatar] = useState(userProfile.avatar);
  const [firebaseConfigInput, setFirebaseConfigInput] = useState(() => {
    const cfg = DrawoAuth.getFirebaseConfig();
    return cfg ? JSON.stringify(cfg, null, 2) : "";
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authStatusMsg, setAuthStatusMsg] = useState<string | null>(null);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newColInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    DrawoAuth.initAuthListener();
  }, []);

  useEffect(() => {
    setProfileNameInput(userProfile.displayName);
    setWorkspaceNameInput(userProfile.workspaceName);
    setSelectedAvatar(userProfile.avatar);
  }, [userProfile.displayName, userProfile.workspaceName, userProfile.avatar]);

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
    setIsOpen(false);
  };

  const handleCreateScene = async () => {
    if (excalidrawAPI) {
      const colId =
        selectedNav === "collection" ? selectedCollectionId : "col-private";
      await DrawoWorkspace.createBoard(excalidrawAPI, {
        collectionId: colId,
      });
      setIsOpen(false);
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
    }
    setNewColName("");
    setIsCreatingCollection(false);
  };

  const handleSaveLocalProfile = () => {
    setAuthErrorMsg(null);
    DrawoAuth.updateLocalProfile({
      displayName: profileNameInput,
      workspaceName: workspaceNameInput,
      avatar: selectedAvatar,
    });
    setAuthStatusMsg("Profile & workspace identity updated!");
    setTimeout(() => setAuthStatusMsg(null), 3500);
  };

  const handleSaveFirebaseConfig = async () => {
    setAuthErrorMsg(null);
    setAuthStatusMsg(null);
    try {
      const saved = await DrawoAuth.saveFirebaseConfig(firebaseConfigInput);
      setFirebaseConfigInput(JSON.stringify(saved, null, 2));
      setAuthStatusMsg(
        `Connected to Firebase Spark project "${saved.projectId}"! You can now sign in below.`,
      );
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Invalid Firebase config.");
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthErrorMsg(null);
    setAuthStatusMsg(null);
    try {
      const prof = await DrawoAuth.signInWithGoogle();
      setAuthStatusMsg(`Signed in as ${prof.displayName} via Google!`);
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Google Sign-In failed.");
    }
  };

  const handleGithubSignIn = async () => {
    setAuthErrorMsg(null);
    setAuthStatusMsg(null);
    try {
      const prof = await DrawoAuth.signInWithGithub();
      setAuthStatusMsg(`Signed in as ${prof.displayName} via GitHub!`);
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "GitHub Sign-In failed.");
    }
  };

  const handleEmailAuth = async () => {
    setAuthErrorMsg(null);
    setAuthStatusMsg(null);
    if (!authEmail.trim() || !authPassword) {
      setAuthErrorMsg("Please enter both email and password.");
      return;
    }
    try {
      if (authMode === "signup") {
        const prof = await DrawoAuth.signUpWithEmail(
          authEmail,
          authPassword,
          profileNameInput,
        );
        setAuthStatusMsg(`Account created! Signed in as ${prof.displayName}.`);
      } else {
        const prof = await DrawoAuth.signInWithEmail(authEmail, authPassword);
        setAuthStatusMsg(`Signed in as ${prof.displayName}!`);
      }
      setAuthPassword("");
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Email authentication failed.");
    }
  };

  const handleCloudSync = async () => {
    setAuthErrorMsg(null);
    setAuthStatusMsg(null);
    setIsSyncingCloud(true);
    try {
      await DrawoAuth.syncWorkspaceToCloud();
      setAuthStatusMsg("Workspace & boards synced to Cloud Firestore!");
    } catch (err: any) {
      setAuthErrorMsg(err?.message || "Firestore sync failed.");
    } finally {
      setIsSyncingCloud(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="drawo-dashboard-backdrop" onClick={() => setIsOpen(false)}>
      <div
        className="drawo-dashboard-modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="drawo-workspace-dashboard"
      >
        {/* Left Sidebar */}
        <aside className="drawo-dashboard-sidebar">
          {/* Workspace Switcher / Profile Header */}
          <div
            className="drawo-ws-header"
            onClick={() => setSelectedNav("auth")}
            title="Click to manage Workspace & Authentication"
          >
            <div className="drawo-ws-header__avatar">
              {(userProfile.workspaceName || "D").charAt(0).toUpperCase()}
            </div>
            <div className="drawo-ws-header__info">
              <div className="drawo-ws-header__title">
                {userProfile.workspaceName || "drawo"}
              </div>
              <div className="drawo-ws-header__plan">
                {userProfile.isCloudAuthenticated
                  ? "Firebase Spark Cloud"
                  : "Local Workspace"}
              </div>
            </div>
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

          {/* User Profile Footer — clickable to open Authentication & Profile */}
          <div
            className={clsx("drawo-ws-user-footer", {
              "drawo-ws-user-footer--active": selectedNav === "auth",
            })}
            onClick={() => setSelectedNav("auth")}
            title="Account & Firebase Spark Authentication"
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
                {userProfile.displayName}
              </span>
            </div>
            <span className="drawo-ws-user-status-pill">
              {userProfile.isCloudAuthenticated ? "Cloud" : "Auth"}
            </span>
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
                    : selectedNav === "auth"
                    ? "🔐"
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
                    : selectedNav === "auth"
                    ? "Authentication & Cloud Sync"
                    : selectedNav === "trash"
                    ? "Trash"
                    : activeCollection.name}
                </h2>
              </div>
              <p className="drawo-main-header__subtitle">
                {selectedNav === "dashboard"
                  ? "Overview of all your boards and drawings across all collections."
                  : selectedNav === "settings"
                  ? "Manage workspace preferences, storage limits, and export backups."
                  : selectedNav === "members"
                  ? "Manage collaborators, permission roles, and guest links."
                  : selectedNav === "auth"
                  ? "Connect your Firebase Spark free project (drawo-e4ac6) for Google, GitHub, or Email sign-in and Cloud Firestore sync."
                  : selectedNav === "trash"
                  ? "Deleted boards are saved here. You can restore them or empty the trash."
                  : activeCollection.description ||
                    "This is your collection. Drag a scene to a different collection to reorganize."}
              </p>
            </div>

            <div className="drawo-main-header__actions">
              {/* Sort Dropdown */}
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

              {/* Close Button */}
              <button
                className="drawo-close-modal-btn"
                title="Close dashboard (Esc)"
                onClick={() => setIsOpen(false)}
              >
                {CloseIcon}
              </button>
            </div>
          </header>

          {/* Quick Action Banners (Import Scenes + / Create Scene +) using Native FilledButton */}
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

              {/* Hidden file input for import */}
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

                    return (
                      <div
                        key={board.id}
                        className={clsx("drawo-scene-card", {
                          "drawo-scene-card--active": isActive,
                        })}
                        onClick={() => handleSelectBoard(board.id)}
                      >
                        {/* Dynamic Live Board Thumbnail */}
                        <div className="drawo-scene-card__thumb">
                          <BoardThumbnail
                            board={board}
                            isActive={isActive}
                            excalidrawAPI={excalidrawAPI}
                          />

                          {/* Relative Time badge in bottom right */}
                          <div className="drawo-scene-card__time">
                            {formatRelativeTime(
                              board.updatedAt || board.createdAt,
                            )}
                          </div>
                        </div>

                        {/* Card Metadata */}
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

                              {/* Context Dropdown Menu */}
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
                                        Rename
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
                                        Duplicate
                                      </button>
                                      <div className="drawo-menu-divider" />
                                      <div className="drawo-menu-label">
                                        Move to Collection
                                      </div>
                                      {workspace.collections.map((col) => (
                                        <button
                                          key={col.id}
                                          className="drawo-menu-sub"
                                          onClick={() => {
                                            DrawoWorkspace.moveBoardToCollection(
                                              board.id,
                                              col.id,
                                            );
                                            setActiveMenuBoardId(null);
                                          }}
                                        >
                                          {col.icon || "📁"} {col.name}
                                        </button>
                                      ))}
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
                                        Move to Trash
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
                  <span className="label">Workspace Name:</span>
                  <span className="val">{userProfile.workspaceName}</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Plan:</span>
                  <span className="badge-plan">
                    {userProfile.isCloudAuthenticated
                      ? `Firebase Spark (${userProfile.firebaseProjectId})`
                      : "Local-First + Spark Ready"}
                  </span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Total Boards:</span>
                  <span className="val">{workspace.boards.length}</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Collections:</span>
                  <span className="val">{workspace.collections.length}</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Storage Engine:</span>
                  <span className="val">
                    {userProfile.isCloudAuthenticated
                      ? "IndexedDB + Cloud Firestore"
                      : "Persistent IndexedDB"}
                  </span>
                </div>
                <div style={{ marginTop: 18 }}>
                  <FilledButton
                    size="large"
                    variant="filled"
                    color="primary"
                    label="Configure Authentication & Cloud Sync"
                    onClick={() => setSelectedNav("auth")}
                  >
                    Configure Authentication & Cloud Sync
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
                      {userProfile.email} • {userProfile.role}
                    </div>
                  </div>
                  <span className="drawo-member-status">
                    {userProfile.isCloudAuthenticated
                      ? `Verified (${userProfile.provider})`
                      : "Local Owner"}
                  </span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <FilledButton
                    size="medium"
                    variant="outlined"
                    color="primary"
                    label="Edit Profile or Sign In"
                    onClick={() => setSelectedNav("auth")}
                  >
                    Edit Profile or Sign In
                  </FilledButton>
                </div>
              </div>
            </div>
          )}

          {/* Authentication & Firebase Spark Cloud Sync Tab Content */}
          {selectedNav === "auth" && (
            <div className="drawo-ws-settings-panel drawo-auth-grid">
              {authStatusMsg && (
                <div className="drawo-auth-banner drawo-auth-banner--success">
                  {authStatusMsg}
                </div>
              )}
              {authErrorMsg && (
                <div className="drawo-auth-banner drawo-auth-banner--error">
                  {authErrorMsg}
                </div>
              )}

              {/* Card 1: Profile & Workspace Identity */}
              <div className="drawo-ws-settings-card">
                <h3>1. Profile & Workspace Identity</h3>
                <p className="drawo-auth-card-desc">
                  Your display name is used across all boards and synced with
                  Live Collaboration rooms.
                </p>

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

                <div className="drawo-auth-field">
                  <TextField
                    label="Display Name"
                    placeholder="Your name"
                    value={profileNameInput}
                    onChange={(val) => setProfileNameInput(val)}
                    fullWidth
                  />
                </div>

                <div className="drawo-auth-field">
                  <TextField
                    label="Workspace Name"
                    placeholder="drawo"
                    value={workspaceNameInput}
                    onChange={(val) => setWorkspaceNameInput(val)}
                    fullWidth
                  />
                </div>

                <div className="drawo-auth-actions-row">
                  <FilledButton
                    size="large"
                    variant="filled"
                    color="primary"
                    label="Save Profile"
                    onClick={handleSaveLocalProfile}
                  >
                    Save Profile
                  </FilledButton>
                </div>
              </div>

              {/* Card 2: Firebase Spark Auth & Cloud Sync (drawo-e4ac6) */}
              <div className="drawo-ws-settings-card">
                <h3>2. Firebase Spark Authentication (drawo-e4ac6)</h3>
                <p className="drawo-auth-card-desc">
                  In your{" "}
                  <a
                    href="https://console.firebase.google.com/project/drawo-e4ac6/settings/general"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Firebase Console (drawo-e4ac6)
                  </a>
                  , click the Web <code>&lt;/&gt;</code> icon to register a web
                  app, then paste your <code>firebaseConfig</code> or{" "}
                  <code>AIza...</code> API key below:
                </p>

                <textarea
                  className="drawo-auth-config-textarea"
                  rows={4}
                  placeholder={`Paste firebaseConfig or AIza... API key for project "drawo-e4ac6"`}
                  value={firebaseConfigInput}
                  onChange={(e) => setFirebaseConfigInput(e.target.value)}
                />

                <div className="drawo-auth-actions-row">
                  <FilledButton
                    size="medium"
                    variant="outlined"
                    color="primary"
                    label="Save Firebase Config"
                    onClick={handleSaveFirebaseConfig}
                  >
                    Save Firebase Config
                  </FilledButton>
                </div>

                <div className="drawo-auth-divider" />

                {userProfile.isCloudAuthenticated ? (
                  <div className="drawo-auth-signed-in-box">
                    <div className="drawo-ws-setting-row">
                      <span className="label">Signed In As:</span>
                      <span className="val">
                        {userProfile.displayName} ({userProfile.email})
                      </span>
                    </div>
                    <div className="drawo-ws-setting-row">
                      <span className="label">Auth Provider:</span>
                      <span className="badge-plan">{userProfile.provider}</span>
                    </div>
                    <div className="drawo-ws-setting-row">
                      <span className="label">Last Cloud Sync:</span>
                      <span className="val">
                        {userProfile.lastSyncedAt
                          ? formatRelativeTime(userProfile.lastSyncedAt)
                          : "Not synced yet"}
                      </span>
                    </div>
                    <div className="drawo-auth-actions-row">
                      <FilledButton
                        size="large"
                        variant="filled"
                        color="primary"
                        label={
                          isSyncingCloud
                            ? "Syncing..."
                            : "Sync Workspace to Firestore"
                        }
                        onClick={handleCloudSync}
                      >
                        {isSyncingCloud
                          ? "Syncing..."
                          : "Sync Workspace to Firestore"}
                      </FilledButton>
                      <FilledButton
                        size="large"
                        variant="outlined"
                        color="danger"
                        label="Sign Out"
                        onClick={() => DrawoAuth.signOut()}
                      >
                        Sign Out
                      </FilledButton>
                    </div>
                  </div>
                ) : (
                  <div className="drawo-auth-login-box">
                    <div className="drawo-auth-oauth-row">
                      <FilledButton
                        size="large"
                        variant="filled"
                        color="primary"
                        label="Sign in with Google"
                        onClick={handleGoogleSignIn}
                      >
                        Sign in with Google
                      </FilledButton>
                      <FilledButton
                        size="large"
                        variant="outlined"
                        color="primary"
                        label="Sign in with GitHub"
                        onClick={handleGithubSignIn}
                      >
                        Sign in with GitHub
                      </FilledButton>
                    </div>

                    <div className="drawo-auth-email-section">
                      <div className="drawo-auth-mode-tabs">
                        <button
                          type="button"
                          className={clsx({ active: authMode === "signin" })}
                          onClick={() => setAuthMode("signin")}
                        >
                          Email Sign In
                        </button>
                        <button
                          type="button"
                          className={clsx({ active: authMode === "signup" })}
                          onClick={() => setAuthMode("signup")}
                        >
                          Create Account
                        </button>
                      </div>
                      <div className="drawo-auth-field">
                        <TextField
                          label="Email"
                          placeholder="you@example.com"
                          value={authEmail}
                          onChange={(val) => setAuthEmail(val)}
                          fullWidth
                        />
                      </div>
                      <div className="drawo-auth-field">
                        <TextField
                          label="Password"
                          isRedacted
                          placeholder="••••••••"
                          value={authPassword}
                          onChange={(val) => setAuthPassword(val)}
                          fullWidth
                        />
                      </div>
                      <div className="drawo-auth-actions-row">
                        <FilledButton
                          size="large"
                          variant="filled"
                          color="primary"
                          label={
                            authMode === "signup"
                              ? "Create Firebase Account"
                              : "Sign In with Email"
                          }
                          onClick={handleEmailAuth}
                        >
                          {authMode === "signup"
                            ? "Create Firebase Account"
                            : "Sign In with Email"}
                        </FilledButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
