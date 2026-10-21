import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import clsx from "clsx";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  DrawoWorkspace,
  drawoWorkspaceAtom,
  isWorkspaceDashboardOpenAtom,
  DEFAULT_COLLECTIONS,
  type DrawoBoardMeta,
  type DrawoCollection,
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

// Inline SVG icons
const SearchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const DashboardGridIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const SettingsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const UsersIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrashIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ChevronUpDownIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="7 15 12 20 17 15" />
    <polyline points="7 9 12 4 17 9" />
  </svg>
);

const SortIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M6 12h12m-9 6h6" />
  </svg>
);

const ImportArrowIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <polyline points="9 15 12 12 15 15" />
  </svg>
);

const CreateDocumentIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const CloseIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const LinkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const PlayIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const MoreVerticalIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({
  excalidrawAPI,
}) => {
  const [isOpen, setIsOpen] = useAtom(isWorkspaceDashboardOpenAtom);
  const workspace = useAtomValue(drawoWorkspaceAtom);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newColInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape, toggle on Cmd+P / Cmd+O
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "o")) {
        // Only prevent default if we're in the app
        if (!e.shiftKey && !e.altKey) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Focus new collection input when creating
  useEffect(() => {
    if (isCreatingCollection) {
      newColInputRef.current?.focus();
    }
  }, [isCreatingCollection]);

  // Current active collection
  const activeCollection = useMemo(() => {
    return (
      workspace.collections.find((c) => c.id === selectedCollectionId) ||
      workspace.collections[0] ||
      DEFAULT_COLLECTIONS[0]
    );
  }, [workspace.collections, selectedCollectionId]);

  // Filtered & sorted boards
  const displayBoards = useMemo(() => {
    let boards = workspace.boards;

    if (selectedNav === "trash") {
      boards = boards.filter((b) => b.isTrash);
    } else {
      boards = boards.filter((b) => !b.isTrash);

      if (selectedNav === "collection") {
        boards = boards.filter((b) => b.collectionId === selectedCollectionId);
      }
      // if selectedNav === "dashboard", show all non-trash boards
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
          <div className="drawo-ws-header">
            <div className="drawo-ws-header__avatar">F</div>
            <div className="drawo-ws-header__info">
              <div className="drawo-ws-header__title">fireside</div>
              <div className="drawo-ws-header__plan">Enterprise Plan</div>
            </div>
            <button
              className="drawo-ws-header__switcher"
              title="Switch Workspace"
            >
              {ChevronUpDownIcon}
            </button>
          </div>

          {/* Quick Search Input */}
          <div className="drawo-ws-search">
            <span className="drawo-ws-search__icon">{SearchIcon}</span>
            <input
              type="text"
              placeholder="Quick search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="drawo-ws-search__input"
            />
            <span className="drawo-ws-search__shortcut">⌘P</span>
          </div>

          {/* Core Navigation Items */}
          <nav className="drawo-ws-nav">
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "dashboard",
              })}
              onClick={() => setSelectedNav("dashboard")}
            >
              <span className="drawo-ws-nav__icon">{DashboardGridIcon}</span>
              <span>Dashboard</span>
            </button>
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "settings",
              })}
              onClick={() => setSelectedNav("settings")}
            >
              <span className="drawo-ws-nav__icon">{SettingsIcon}</span>
              <span>Workspace settings</span>
            </button>
            <button
              className={clsx("drawo-ws-nav__item", {
                "drawo-ws-nav__item--active": selectedNav === "members",
              })}
              onClick={() => setSelectedNav("members")}
            >
              <span className="drawo-ws-nav__icon">{UsersIcon}</span>
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
              +
            </button>
          </div>

          <div className="drawo-ws-collections-list">
            {workspace.collections.map((col) => {
              const isSelected =
                selectedNav === "collection" &&
                selectedCollectionId === col.id;
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
          <div className="drawo-ws-user-footer">
            <div className="drawo-ws-user-badge">
              <span className="drawo-ws-user-avatar">🐧</span>
              <span className="drawo-ws-user-name">Torvalds Unix</span>
            </div>
            <button className="drawo-ws-user-bell" title="Notifications">
              🔔
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
                  ? "Manage workspace preferences, storage limits, and export backups."
                  : selectedNav === "members"
                  ? "Manage collaborators, permission roles, and guest links."
                  : selectedNav === "trash"
                  ? "Deleted boards are saved here. You can restore them or empty the trash."
                  : activeCollection.description ||
                    "This is your collection. Drag a scene to a different collection to reorganize."}
              </p>
            </div>

            <div className="drawo-main-header__actions">
              {/* Sort Dropdown */}
              {(selectedNav === "collection" || selectedNav === "dashboard") && (
                <div className="drawo-sort-select-wrap">
                  <span className="drawo-sort-icon">{SortIcon}</span>
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

          {/* Quick Action Banners (Import Scenes + / Create Scene +) */}
          {(selectedNav === "collection" || selectedNav === "dashboard") && (
            <div className="drawo-action-banners-row">
              <button
                className="drawo-action-banner"
                onClick={handleImportClick}
              >
                <div className="drawo-action-banner__icon drawo-action-banner__icon--import">
                  {ImportArrowIcon}
                </div>
                <div className="drawo-action-banner__content">
                  <div className="drawo-action-banner__title">
                    Import scenes +
                  </div>
                  <div className="drawo-action-banner__sub">
                    Upload .excalidraw or .json
                  </div>
                </div>
              </button>

              <button
                className="drawo-action-banner"
                onClick={handleCreateScene}
              >
                <div className="drawo-action-banner__icon drawo-action-banner__icon--create">
                  {CreateDocumentIcon}
                </div>
                <div className="drawo-action-banner__content">
                  <div className="drawo-action-banner__title">
                    Create scene +
                  </div>
                  <div className="drawo-action-banner__sub">
                    Start a fresh blank canvas
                  </div>
                </div>
              </button>

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
                    <button
                      className="drawo-scenes-empty__btn"
                      onClick={handleCreateScene}
                    >
                      Create First Scene
                    </button>
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
                        {/* Thumbnail Canvas Box */}
                        <div className="drawo-scene-card__thumb">
                          {/* Play button indicator in top-left */}
                          <div className="drawo-scene-card__badge-play">
                            {PlayIcon}
                          </div>

                          {/* Thumbnail preview vector diagram / drawing representation */}
                          <div className="drawo-scene-card__svg-mock">
                            <svg
                              viewBox="0 0 200 125"
                              className="drawo-mock-diagram"
                            >
                              {/* Background subtle grid lines */}
                              <line
                                x1="0"
                                y1="30"
                                x2="200"
                                y2="30"
                                stroke="#f1f3f5"
                                strokeDasharray="3 3"
                              />
                              <line
                                x1="0"
                                y1="70"
                                x2="200"
                                y2="70"
                                stroke="#f1f3f5"
                                strokeDasharray="3 3"
                              />
                              <line
                                x1="0"
                                y1="100"
                                x2="200"
                                y2="100"
                                stroke="#f1f3f5"
                                strokeDasharray="3 3"
                              />

                              {/* Stylized diagram nodes */}
                              <rect
                                x="20"
                                y="25"
                                width="40"
                                height="22"
                                rx="4"
                                fill="#e0f2fe"
                                stroke="#38bdf8"
                                strokeWidth="1.2"
                              />
                              <text
                                x="40"
                                y="39"
                                fontSize="7"
                                fill="#0369a1"
                                textAnchor="middle"
                                fontFamily="sans-serif"
                              >
                                Client
                              </text>

                              <path
                                d="M60 36 L85 36"
                                stroke="#94a3b8"
                                strokeWidth="1.2"
                                markerEnd="url(#arrow)"
                              />

                              <rect
                                x="85"
                                y="20"
                                width="46"
                                height="32"
                                rx="5"
                                fill="#f5f3ff"
                                stroke="#818cf8"
                                strokeWidth="1.2"
                              />
                              <text
                                x="108"
                                y="35"
                                fontSize="7"
                                fill="#4f46e5"
                                textAnchor="middle"
                                fontFamily="sans-serif"
                              >
                                Gateway
                              </text>

                              <path
                                d="M131 36 L155 36"
                                stroke="#94a3b8"
                                strokeWidth="1.2"
                              />

                              <rect
                                x="155"
                                y="25"
                                width="35"
                                height="22"
                                rx="4"
                                fill="#dcfce7"
                                stroke="#34d399"
                                strokeWidth="1.2"
                              />
                              <text
                                x="172"
                                y="39"
                                fontSize="7"
                                fill="#059669"
                                textAnchor="middle"
                                fontFamily="sans-serif"
                              >
                                API
                              </text>

                              {/* Lower row */}
                              <path
                                d="M108 52 L108 75"
                                stroke="#94a3b8"
                                strokeWidth="1.2"
                              />

                              <rect
                                x="85"
                                y="75"
                                width="46"
                                height="26"
                                rx="4"
                                fill="#fef3c7"
                                stroke="#fbbf24"
                                strokeWidth="1.2"
                              />
                              <text
                                x="108"
                                y="91"
                                fontSize="7"
                                fill="#b45309"
                                textAnchor="middle"
                                fontFamily="sans-serif"
                              >
                                Database
                              </text>
                            </svg>
                          </div>

                          {/* Relative Time badge in bottom right */}
                          <div className="drawo-scene-card__time">
                            {formatRelativeTime(board.updatedAt || board.createdAt)}
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
                              by {board.author || "Torvalds Unix"}
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
                                {MoreVerticalIcon}
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
                  <span className="val">fireside</span>
                </div>
                <div className="drawo-ws-setting-row">
                  <span className="label">Plan:</span>
                  <span className="badge-plan">Enterprise Plan (Offline)</span>
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
                  <span className="label">Local Storage:</span>
                  <span className="val">Persistent IndexedDB</span>
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
                  <span className="drawo-member-avatar">🐧</span>
                  <div className="drawo-member-info">
                    <div className="drawo-member-name">Torvalds Unix</div>
                    <div className="drawo-member-role">Workspace Owner • Admin</div>
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
