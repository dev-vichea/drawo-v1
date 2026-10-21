import { DefaultSidebar, Sidebar, THEME } from "@excalidraw/excalidraw";
import {
  checkIcon,
  DuplicateIcon,
  messageCircleIcon,
  pencilIcon,
  PlusIcon,
  presentationIcon,
  searchIcon,
  TrashIcon,
} from "@excalidraw/excalidraw/components/icons";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { DEFAULT_SIDEBAR } from "@excalidraw/common";
import React, { useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtomValue } from "../app-jotai";
import { DrawoWorkspace, drawoWorkspaceAtom } from "../data/DrawoWorkspace";

import "./AppSidebar.scss";

const workspaceFolderIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="18"
    height="18"
  >
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
  </svg>
);

const folderIcon = (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
  </svg>
);

const boardIcon = (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="14" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21h6" />
    <path d="M12 17v4" />
  </svg>
);

const starIcon = (filled: boolean) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill={filled ? "#f59f00" : "none"}
    stroke={filled ? "#f59f00" : "currentColor"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const formatRelativeTime = (timestamp: number): string => {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) {
    return "Just now";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

export const DrawoWorkspaceTopPill: React.FC<{
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}> = ({ excalidrawAPI }) => {
  const workspace = useAtomValue(drawoWorkspaceAtom);
  const activeBoard =
    workspace.boards.find((b) => b.id === workspace.activeBoardId) ||
    workspace.boards[0];

  return (
    <button
      type="button"
      className="drawo-workspace-top-pill"
      data-testid="drawo-workspace-top-pill"
      title="Open Drawo Workspace"
      onClick={() => {
        excalidrawAPI?.toggleSidebar({
          name: DEFAULT_SIDEBAR.name,
          tab: "workspace",
        });
      }}
    >
      <span className="drawo-workspace-top-pill__icon">{boardIcon}</span>
      <span className="drawo-workspace-top-pill__title">
        {activeBoard?.title || "Main Whiteboard"}
      </span>
      <span className="drawo-workspace-top-pill__count">
        {workspace.boards.length}{" "}
        {workspace.boards.length === 1 ? "board" : "boards"}
      </span>
    </button>
  );
};

export const AppSidebar: React.FC<{
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
}> = ({ excalidrawAPI }) => {
  const { theme, openSidebar } = useUIAppState();
  const workspace = useAtomValue(drawoWorkspaceAtom);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [isCreatingCol, setIsCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const filteredBoards = workspace.boards.filter((board) => {
    const matchesSearch = board.title
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());
    if (!matchesSearch) {
      return false;
    }
    if (selectedFilter === "all") {
      return true;
    }
    if (selectedFilter === "favorites") {
      return board.isFavorite;
    }
    return board.collectionId === selectedFilter;
  });

  const handleCreateCollection = () => {
    const created = DrawoWorkspace.createCollection(newColName);
    if (created) {
      setNewColName("");
      setIsCreatingCol(false);
      setSelectedFilter(created.id);
    }
  };

  const handleRenameSubmit = (boardId: string) => {
    if (editingTitle.trim()) {
      DrawoWorkspace.renameBoard(boardId, editingTitle);
    }
    setEditingBoardId(null);
    setEditingTitle("");
  };

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="workspace"
          title="Workspace Boards"
          data-testid="workspace-tab-trigger"
          style={{ opacity: openSidebar?.tab === "workspace" ? 1 : 0.55 }}
        >
          {workspaceFolderIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="comments"
          style={{ opacity: openSidebar?.tab === "comments" ? 1 : 0.4 }}
        >
          {messageCircleIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="presentation"
          style={{ opacity: openSidebar?.tab === "presentation" ? 1 : 0.4 }}
        >
          {presentationIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>

      <Sidebar.Tab tab="workspace">
        <div
          className="drawo-workspace-panel"
          data-testid="drawo-workspace-panel"
        >
          <div className="drawo-workspace-header">
            <h3 className="drawo-workspace-header__title">
              <span className="drawo-workspace-header__icon">{folderIcon}</span>
              <span>Workspace</span>
            </h3>
            <FilledButton
              size="medium"
              variant="filled"
              color="primary"
              icon={PlusIcon}
              label="New Board"
              onClick={() => {
                if (excalidrawAPI) {
                  const colId =
                    selectedFilter !== "all" && selectedFilter !== "favorites"
                      ? selectedFilter
                      : null;
                  DrawoWorkspace.createBoard(excalidrawAPI, {
                    collectionId: colId,
                  });
                }
              }}
            >
              New Board
            </FilledButton>
          </div>

          <div className="drawo-workspace-search-wrap">
            <TextField
              type="search"
              icon={searchIcon}
              placeholder="Search boards..."
              value={searchQuery}
              onChange={(value) => setSearchQuery(value)}
              fullWidth
            />
          </div>

          <div className="drawo-workspace-collections">
            <button
              type="button"
              className={`drawo-collection-chip ${
                selectedFilter === "all" ? "is-active" : ""
              }`}
              onClick={() => setSelectedFilter("all")}
            >
              <span>All</span>
              <span className="drawo-chip-badge">
                {workspace.boards.length}
              </span>
            </button>
            <button
              type="button"
              className={`drawo-collection-chip ${
                selectedFilter === "favorites" ? "is-active" : ""
              }`}
              onClick={() => setSelectedFilter("favorites")}
            >
              <span className="drawo-chip-icon">
                {starIcon(selectedFilter === "favorites")}
              </span>
              <span>Favorites</span>
            </button>

            {workspace.collections.map((col) => (
              <button
                key={col.id}
                type="button"
                className={`drawo-collection-chip ${
                  selectedFilter === col.id ? "is-active" : ""
                }`}
                onClick={() => setSelectedFilter(col.id)}
              >
                <span className="drawo-chip-icon" style={{ color: col.color }}>
                  {folderIcon}
                </span>
                <span>{col.name}</span>
                {selectedFilter === col.id && workspace.collections.length > 1 && (
                  <span
                    className="drawo-collection-del"
                    title="Delete collection"
                    onClick={(e) => {
                      e.stopPropagation();
                      DrawoWorkspace.deleteCollection(col.id);
                      setSelectedFilter("all");
                    }}
                  >
                    ✕
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              className="drawo-collection-chip drawo-collection-chip--new"
              onClick={() => setIsCreatingCol((prev) => !prev)}
            >
              <span className="drawo-chip-icon">{PlusIcon}</span>
              <span>Folder</span>
            </button>
          </div>

          {isCreatingCol && (
            <div className="drawo-workspace-new-col-row">
              <TextField
                placeholder="Folder name..."
                value={newColName}
                onChange={(value) => setNewColName(value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateCollection();
                  }
                }}
              />
              <FilledButton
                size="medium"
                variant="outlined"
                color="primary"
                label="Add"
                onClick={handleCreateCollection}
              >
                Add
              </FilledButton>
            </div>
          )}

          <div className="drawo-workspace-boards-list">
            {filteredBoards.map((board) => {
              const isActive = board.id === workspace.activeBoardId;
              const isEditing = editingBoardId === board.id;

              return (
                <div
                  key={board.id}
                  data-testid={`drawo-board-card-${board.id}`}
                  className={`drawo-board-card ${isActive ? "is-active" : ""}`}
                  onClick={() => {
                    if (excalidrawAPI && !isEditing) {
                      DrawoWorkspace.switchBoard(board.id, excalidrawAPI);
                    }
                  }}
                >
                  <div className="drawo-board-card__top">
                    {isEditing ? (
                      <input
                        type="text"
                        className="drawo-board-card__rename-input"
                        value={editingTitle}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleRenameSubmit(board.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleRenameSubmit(board.id);
                          }
                        }}
                      />
                    ) : (
                      <span className="drawo-board-card__title">
                        {board.title}
                      </span>
                    )}
                    {isActive && (
                      <span
                        className="drawo-board-card__active-indicator"
                        title="Active Whiteboard"
                      >
                        <span className="drawo-active-icon">{checkIcon}</span>
                        <span>Active</span>
                      </span>
                    )}
                  </div>

                  <div className="drawo-board-card__meta">
                    <span>
                      {board.elementCount}{" "}
                      {board.elementCount === 1 ? "element" : "elements"}
                    </span>
                    <span>{formatRelativeTime(board.updatedAt)}</span>
                  </div>

                  <div
                    className="drawo-board-card__actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      className="drawo-board-card__select"
                      value={board.collectionId || ""}
                      onChange={(e) => {
                        DrawoWorkspace.moveBoardToCollection(
                          board.id,
                          e.target.value || null,
                        );
                      }}
                    >
                      <option value="">No folder</option>
                      {workspace.collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="drawo-board-card__btns">
                      <button
                        type="button"
                        className={`drawo-card-btn ${
                          board.isFavorite ? "is-fav" : ""
                        }`}
                        title={
                          board.isFavorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        onClick={() => DrawoWorkspace.toggleFavorite(board.id)}
                      >
                        {starIcon(board.isFavorite)}
                      </button>
                      <button
                        type="button"
                        className="drawo-card-btn"
                        title="Rename board"
                        onClick={() => {
                          setEditingBoardId(board.id);
                          setEditingTitle(board.title);
                        }}
                      >
                        {pencilIcon}
                      </button>
                      <button
                        type="button"
                        className="drawo-card-btn"
                        title="Duplicate board"
                        onClick={() => {
                          if (excalidrawAPI) {
                            DrawoWorkspace.duplicateBoard(
                              board.id,
                              excalidrawAPI,
                            );
                          }
                        }}
                      >
                        {DuplicateIcon}
                      </button>
                      <button
                        type="button"
                        className="drawo-card-btn drawo-card-btn--danger"
                        title="Delete board"
                        onClick={() => {
                          if (excalidrawAPI) {
                            DrawoWorkspace.deleteBoard(board.id, excalidrawAPI);
                          }
                        }}
                      >
                        {TrashIcon}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Sidebar.Tab>

      <Sidebar.Tab tab="comments">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/sidebar-comments-promo-${
                theme === THEME.DARK ? "dark" : "light"
              }.jpg)`,
              opacity: 0.9,
            }}
          />
          <div className="app-sidebar-promo-text">
            Canvas Comments for Drawo
          </div>
        </div>
      </Sidebar.Tab>

      <Sidebar.Tab tab="presentation" className="px-3">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/sidebar-presentation-promo-${
                theme === THEME.DARK ? "dark" : "light"
              }.jpg)`,
              opacity: 0.7,
            }}
          />
          <div className="app-sidebar-promo-text">
            Presentation Slides for Drawo
          </div>
        </div>
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
