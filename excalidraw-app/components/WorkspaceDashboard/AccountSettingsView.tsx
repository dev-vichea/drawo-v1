import React, { useState, useRef, useEffect, useMemo } from "react";
import clsx from "clsx";
import { get } from "idb-keyval";

import { THEME } from "@excalidraw/excalidraw";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  searchIcon,
  CloseIcon,
  TrashIcon,
  settingsIcon,
  PlusIcon,
} from "@excalidraw/excalidraw/components/icons";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../../app_constants";
import {
  DrawoAuth,
  type DrawoUserProfile,
  type DrawoUserPreferences,
} from "../../data/DrawoAuth";
import {
  workspaceBoardsStore,
  type DrawoBoardScene,
} from "../../data/DrawoWorkspace";

export type AccountSettingsTab =
  | "my-profile"
  | "preferences"
  | "api-keys"
  | "export"
  | "my-workspaces";

interface AccountSettingsViewProps {
  userProfile: DrawoUserProfile;
  activeTab: AccountSettingsTab;
  onChangeTab: (tab: AccountSettingsTab) => void;
  onBack: () => void;
  onOpenCreateWorkspace: () => void;
  onOpenWorkspaceDashboard: (workspaceId?: string) => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

interface SearchableSettingItem {
  id: string;
  title: string;
  description: string;
  category: string;
  tab: AccountSettingsTab;
  sectionId: string;
  keywords: string[];
}

const SEARCHABLE_SETTINGS: SearchableSettingItem[] = [
  {
    id: "profile-picture",
    title: "Profile Picture",
    description: "Upload a profile picture.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-profile-picture",
    keywords: ["avatar", "photo", "image", "picture"],
  },
  {
    id: "profile-name",
    title: "Profile Name",
    description: "Change your profile name.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-profile-name",
    keywords: ["username", "display name", "rename"],
  },
  {
    id: "account-email",
    title: "Account email",
    description: "Change your account email address.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-account-email",
    keywords: ["email", "address", "contact"],
  },
  {
    id: "linked-accounts",
    title: "Linked accounts",
    description: "View connected sign-in providers.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-linked-accounts",
    keywords: ["social login", "oauth", "google", "github"],
  },
  {
    id: "sign-in-providers",
    title: "Connect more sign-in providers",
    description:
      "You can also link sign-in provider accounts associated with a different email.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-signin-providers",
    keywords: ["link account", "google", "github", "provider"],
  },
  {
    id: "sign-out",
    title: "Sign out",
    description: "Sign out of your current session or all sessions.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-sign-out",
    keywords: ["log out", "log off", "sessions"],
  },
  {
    id: "delete-account",
    title: "Delete account",
    description:
      "Deleting your account will permanently erase all your data, settings, and preferences.",
    category: "Profile",
    tab: "my-profile",
    sectionId: "section-delete-account",
    keywords: ["danger zone", "remove account", "erase"],
  },
  {
    id: "theme",
    title: "App theme",
    description: "Switch between Light, Dark, and System theme (Alt+Shift+D).",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-theme",
    keywords: ["dark mode", "light mode", "appearance", "color"],
  },
  {
    id: "language",
    title: "Language",
    description: "Choose the language used by Drawo.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-language",
    keywords: ["locale", "translation", "english"],
  },
  {
    id: "initial-page",
    title: "Initial app page",
    description: "What page to load when you open Drawo.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-initial-page",
    keywords: ["startup", "redirect", "dashboard", "private collection"],
  },
  {
    id: "email-notifications",
    title: "Email notifications",
    description: "Choose what email notifications you want to receive.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-notifications",
    keywords: ["comment notifications", "mention notifications"],
  },
  {
    id: "ai-naming-private-scenes",
    title: "AI preferences for private collections",
    description: "Enable automatic scene naming for your private collections.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-ai",
    keywords: ["ai", "auto naming"],
  },
  {
    id: "old-fonts",
    title: "Show old fonts",
    description: "Show old fonts in the font picker.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-fonts",
    keywords: ["deprecated fonts", "legacy fonts"],
  },
  {
    id: "push-to-talk",
    title: "Push to talk",
    description:
      "Enable push-to-talk mode for voice calls. Hold Space to speak, release to mute.",
    category: "Preferences",
    tab: "preferences",
    sectionId: "section-pref-ptt",
    keywords: ["ptt", "voice", "microphone", "mute"],
  },
  {
    id: "api-keys",
    title: "Personal MCP/API keys",
    description: "Manage your personal API keys across workspaces.",
    category: "Personal MCP/API keys",
    tab: "api-keys",
    sectionId: "section-api-keys",
    keywords: ["mcp", "personal api key", "token", "claude", "cursor"],
  },
  {
    id: "my-export",
    title: "Export private collection",
    description:
      "Download the scenes of your private collection from any Workspace you belong to.",
    category: "Export private collection",
    tab: "export",
    sectionId: "section-export-private",
    keywords: ["export", "download my scenes", "private collection", "backup"],
  },
  {
    id: "my-workspaces",
    title: "My workspaces",
    description: "View, open, create, or leave the workspaces you belong to.",
    category: "My workspaces",
    tab: "my-workspaces",
    sectionId: "section-my-workspaces",
    keywords: ["workspace list", "leave workspace", "switch workspace"],
  },
];

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  userProfile,
  activeTab,
  onChangeTab,
  onBack,
  onOpenCreateWorkspace,
  onOpenWorkspaceDashboard,
  excalidrawAPI,
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(
    null,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modals in My Profile
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isConnectProviderModalOpen, setIsConnectProviderModalOpen] =
    useState(false);
  const [nameDraft, setNameDraft] = useState(userProfile.displayName);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // API key reveal modal state
  const [revealedKeyData, setRevealedKeyData] = useState<{
    key: string;
    workspaceName: string;
  } | null>(null);
  const [selectedMcpClient, setSelectedMcpClient] = useState<
    "claude" | "cursor" | "vscode"
  >("claude");

  // Export state
  const [selectedExportWsId, setSelectedExportWsId] = useState<string>(
    userProfile.activeWorkspaceId || userProfile.workspaces[0]?.id || "",
  );
  const [isExporting, setIsExporting] = useState(false);

  // Workspaces table sort state
  const [wsSort, setWsSort] = useState<{
    key: "name" | "created";
    order: "asc" | "desc";
  }>({ key: "created", order: "desc" });

  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  useEffect(() => {
    setNameDraft(userProfile.displayName);
  }, [userProfile.displayName]);

  useEffect(() => {
    if (
      !selectedExportWsId &&
      (userProfile.activeWorkspaceId || userProfile.workspaces[0]?.id)
    ) {
      setSelectedExportWsId(
        userProfile.activeWorkspaceId || userProfile.workspaces[0]?.id || "",
      );
    }
  }, [
    selectedExportWsId,
    userProfile.activeWorkspaceId,
    userProfile.workspaces,
  ]);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => {
      setStatusToast(null);
    }, 2600);
  };

  const prefs: DrawoUserPreferences = useMemo(
    () =>
      userProfile.preferences || {
        theme:
          (localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_THEME) as
            | "light"
            | "dark"
            | "system") || "system",
        initialRedirect: "dashboard",
        autoRedirect: false,
        emailNotifications: true,
        aiSceneNaming: true,
        showOldFonts: false,
        pushToTalk: false,
      },
    [userProfile.preferences],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return SEARCHABLE_SETTINGS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  const handleSelectSearchResult = (item: SearchableSettingItem) => {
    onChangeTab(item.tab);
    setSearchQuery("");
    setIsSearchFocused(false);
    setHighlightedSection(item.sectionId);
    setTimeout(() => {
      const el = document.getElementById(item.sectionId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    setTimeout(() => {
      setHighlightedSection(null);
    }, 2200);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        DrawoAuth.updateUserProfile({ photoURL: reader.result });
        setIsAvatarModalOpen(false);
        showToast("Profile picture updated!");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfileName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameDraft.trim()) {
      DrawoAuth.updateUserProfile({ displayName: nameDraft.trim() });
      setIsNameModalOpen(false);
      showToast("Profile name updated!");
    }
  };

  const handleThemeChange = (nextTheme: "light" | "dark" | "system") => {
    DrawoAuth.updatePreferences({ theme: nextTheme });
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_THEME, nextTheme);
    const resolvedTheme =
      nextTheme === "system"
        ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? THEME.DARK
          : THEME.LIGHT
        : nextTheme === "dark"
        ? THEME.DARK
        : THEME.LIGHT;
    excalidrawAPI?.updateScene({
      appState: { theme: resolvedTheme },
    });
    showToast(`Theme set to ${nextTheme}`);
  };

  const handleExportPrivateCollection = async () => {
    const targetWs =
      userProfile.workspaces.find((w) => w.id === selectedExportWsId) ||
      userProfile.workspaces[0];
    if (!targetWs) {
      return;
    }
    setIsExporting(true);
    try {
      const privateBoards = targetWs.boards.filter(
        (b) =>
          !b.isTrash && (b.collectionId === "col-private" || !b.collectionId),
      );
      const exportedScenes = [];
      for (const board of privateBoards) {
        const scene = await get<DrawoBoardScene>(
          board.id,
          workspaceBoardsStore,
        );
        exportedScenes.push({
          meta: board,
          elements: scene?.elements || [],
          appState: scene?.appState || { viewBackgroundColor: "#ffffff" },
        });
      }

      const bundle = {
        type: "drawo-private-collection-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        workspace: {
          id: targetWs.id,
          name: targetWs.name,
        },
        user: {
          uid: userProfile.uid,
          email: userProfile.email,
          displayName: userProfile.displayName,
        },
        sceneCount: exportedScenes.length,
        scenes: exportedScenes,
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${targetWs.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-private-collection.drawo.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      DrawoAuth.recordExport(targetWs.id, exportedScenes.length);
      showToast(
        `Exported ${exportedScenes.length} private scene${
          exportedScenes.length === 1 ? "" : "s"
        }!`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const linkedProviders = useMemo(() => {
    if (userProfile.linkedProviders && userProfile.linkedProviders.length > 0) {
      return userProfile.linkedProviders;
    }
    return [
      userProfile.provider === "google"
        ? "google.com"
        : userProfile.provider === "github"
        ? "github.com"
        : "password",
    ];
  }, [userProfile.linkedProviders, userProfile.provider]);

  const availableProvidersToConnect = useMemo(() => {
    const all = ["google.com", "github.com"];
    return all.filter((p) => !linkedProviders.includes(p));
  }, [linkedProviders]);

  const sortedWorkspaces = useMemo(() => {
    const list = [...userProfile.workspaces];
    list.sort((a, b) => {
      if (wsSort.key === "name") {
        return wsSort.order === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      return wsSort.order === "asc"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    });
    return list;
  }, [userProfile.workspaces, wsSort]);

  const formatDateMedium = (ts: number) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
      }).format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleDateString();
    }
  };

  return (
    <div
      className="drawo-dashboard-backdrop drawo-fullpage-view drawo-account-settings-shell"
      data-testid="drawo-account-settings"
    >
      {/* Status Toast */}
      {statusToast && <div className="drawo-account-toast">{statusToast}</div>}

      {/* Left Fixed Sidebar matching SettingsContainer-DhW50fZ0.js */}
      <aside className="drawo-account-sidebar">
        <button
          type="button"
          className="drawo-account-sidebar__user"
          onClick={onBack}
          title="Back to workspace"
        >
          <div className="drawo-account-sidebar__avatar">
            {userProfile.photoURL ? (
              <img src={userProfile.photoURL} alt={userProfile.displayName} />
            ) : (
              <span>{userProfile.avatar || "🐧"}</span>
            )}
          </div>
          <span className="drawo-account-sidebar__username">
            {userProfile.displayName || userProfile.email}
          </span>
        </button>

        <nav className="drawo-account-sidebar__nav">
          <div className="drawo-account-sidebar__heading">User Settings</div>
          <button
            type="button"
            className={clsx("drawo-account-sidebar__link", {
              active: activeTab === "my-profile",
            })}
            onClick={() => onChangeTab("my-profile")}
          >
            My profile
          </button>
          <button
            type="button"
            className={clsx("drawo-account-sidebar__link", {
              active: activeTab === "preferences",
            })}
            onClick={() => onChangeTab("preferences")}
          >
            Preferences
          </button>
          <button
            type="button"
            className={clsx("drawo-account-sidebar__link", {
              active: activeTab === "api-keys",
            })}
            onClick={() => onChangeTab("api-keys")}
          >
            Personal MCP/API keys
          </button>
          <button
            type="button"
            className={clsx("drawo-account-sidebar__link", {
              active: activeTab === "export",
            })}
            onClick={() => onChangeTab("export")}
          >
            Export private collection
          </button>

          <div className="drawo-account-sidebar__heading drawo-account-sidebar__heading--spaced">
            Workspaces
          </div>
          <button
            type="button"
            className={clsx("drawo-account-sidebar__link", {
              active: activeTab === "my-workspaces",
            })}
            onClick={() => onChangeTab("my-workspaces")}
          >
            My workspaces
          </button>
          <button
            type="button"
            className="drawo-account-sidebar__link"
            onClick={() => DrawoAuth.signOut()}
          >
            Sign out
          </button>
        </nav>
      </aside>

      {/* Top Fixed Header Bar with Centered Search & ESC Close */}
      <header className="drawo-account-topbar">
        <div className="drawo-account-topbar__search-wrap">
          <div
            className={clsx("drawo-account-searchbox", {
              focused: isSearchFocused,
            })}
          >
            <span className="drawo-account-searchbox__icon">{searchIcon}</span>
            <input
              ref={searchInputRef}
              id="quicksearch-search-input"
              type="text"
              placeholder="Search settings: profile, theme, workspaces, etc."
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 180)}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <kbd className="drawo-account-searchbox__kbd">⌘P</kbd>
          </div>

          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="drawo-account-search-results">
              {searchResults.length === 0 ? (
                <div className="drawo-account-search-empty">
                  No matching settings found for "{searchQuery}"
                </div>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="drawo-account-search-result-item"
                    onMouseDown={() => handleSelectSearchResult(item)}
                  >
                    <div className="res-top">
                      <span className="res-title">{item.title}</span>
                      <span className="res-cat">{item.category}</span>
                    </div>
                    <div className="res-desc">{item.description}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="drawo-account-esc-btn"
          onClick={onBack}
          title="Close settings (Esc)"
        >
          <span className="esc-label">ESC</span>
          <span className="esc-icon">{CloseIcon}</span>
        </button>
      </header>

      {/* Main Scrollable Content Area */}
      <main className="drawo-account-main">
        <div className="drawo-account-container">
          {/* =============================================================== */}
          {/* TAB 1: MY PROFILE (/account/my-profile)                         */}
          {/* =============================================================== */}
          {activeTab === "my-profile" && (
            <div className="drawo-account-page">
              <h1 className="drawo-account-page__title">My profile</h1>

              <div className="drawo-account-sections">
                {/* Profile Picture */}
                <section
                  id="section-profile-picture"
                  className={clsx("drawo-account-section", {
                    highlighted:
                      highlightedSection === "section-profile-picture",
                  })}
                >
                  <h3 className="drawo-account-section__title">
                    Profile Picture
                  </h3>
                  <p className="drawo-account-section__desc">
                    Upload a profile picture.
                  </p>
                  <div className="drawo-account-section__body">
                    <button
                      type="button"
                      className="drawo-profile-avatar-edit"
                      onClick={() => setIsAvatarModalOpen(true)}
                    >
                      <div className="drawo-profile-avatar-box">
                        {userProfile.photoURL ? (
                          <img
                            src={userProfile.photoURL}
                            alt={userProfile.displayName}
                          />
                        ) : (
                          <span>{userProfile.avatar || "🐧"}</span>
                        )}
                      </div>
                      <span className="drawo-profile-avatar-edit__label">
                        Edit
                      </span>
                    </button>
                  </div>
                </section>

                {/* Profile Name */}
                <section
                  id="section-profile-name"
                  className={clsx("drawo-account-section", {
                    highlighted: highlightedSection === "section-profile-name",
                  })}
                >
                  <h3 className="drawo-account-section__title">Profile Name</h3>
                  <p className="drawo-account-section__desc">
                    Change your profile name.
                  </p>
                  <div className="drawo-account-section__body">
                    <button
                      type="button"
                      className="drawo-profile-name-field"
                      onClick={() => {
                        setNameDraft(userProfile.displayName);
                        setIsNameModalOpen(true);
                      }}
                    >
                      <span className="drawo-profile-name-field__left">
                        <svg
                          width="16"
                          height="16"
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
                        <span>{userProfile.displayName}</span>
                      </span>
                      <svg
                        className="drawo-profile-name-field__edit-icon"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </div>
                </section>

                {/* Account email */}
                <section
                  id="section-account-email"
                  className={clsx("drawo-account-section", {
                    highlighted: highlightedSection === "section-account-email",
                  })}
                >
                  <h3 className="drawo-account-section__title">
                    Account email
                  </h3>
                  <p className="drawo-account-section__desc">
                    Change your account email address.
                  </p>
                  <div className="drawo-account-section__body">
                    <div className="drawo-account-email-row">
                      <svg
                        className="drawo-account-email-row__icon"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <div>
                        <div className="drawo-account-email-row__addr">
                          {userProfile.email || "Not linked to an email"}
                        </div>
                        <div className="drawo-account-email-row__note">
                          Email change is disabled at the moment. Please contact{" "}
                          <a href="mailto:support@excalidraw.com">
                            support@excalidraw.com
                          </a>{" "}
                          for assistance.
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Linked accounts */}
                <section
                  id="section-linked-accounts"
                  className={clsx("drawo-account-section", {
                    highlighted:
                      highlightedSection === "section-linked-accounts",
                  })}
                >
                  <h3 className="drawo-account-section__title">
                    Linked accounts
                  </h3>
                  <div className="drawo-account-section__body">
                    <div className="drawo-linked-accounts-table">
                      <div className="drawo-linked-accounts-table__head">
                        <span>Email</span>
                        <span>Sign-in provider</span>
                      </div>
                      {linkedProviders.map((provId) => (
                        <div
                          key={provId}
                          className="drawo-linked-accounts-table__row"
                        >
                          <span>{userProfile.email}</span>
                          <span>
                            {provId === "password"
                              ? "Email and passwordless link"
                              : provId}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Connect more sign-in providers */}
                {availableProvidersToConnect.length > 0 && (
                  <section
                    id="section-signin-providers"
                    className={clsx("drawo-account-section", {
                      highlighted:
                        highlightedSection === "section-signin-providers",
                    })}
                  >
                    <h3 className="drawo-account-section__title">
                      Connect more sign-in providers
                    </h3>
                    <p className="drawo-account-section__desc">
                      You can also link sign-in provider accounts associated
                      with a different email.
                    </p>
                    <div className="drawo-account-section__body">
                      <button
                        type="button"
                        className="drawo-account-btn drawo-account-btn--primary"
                        onClick={() => setIsConnectProviderModalOpen(true)}
                      >
                        Connect sign-in provider
                      </button>
                    </div>
                  </section>
                )}

                {/* Sign out */}
                <section
                  id="section-sign-out"
                  className={clsx("drawo-account-section", {
                    highlighted: highlightedSection === "section-sign-out",
                  })}
                >
                  <h3 className="drawo-account-section__title">Sign out</h3>
                  <p className="drawo-account-section__desc">Sign out</p>
                  <div className="drawo-account-section__body drawo-account-btn-group">
                    <button
                      type="button"
                      className="drawo-account-btn drawo-account-btn--primary"
                      onClick={() => DrawoAuth.signOut()}
                    >
                      Sign out
                    </button>
                    <button
                      type="button"
                      className="drawo-account-btn drawo-account-btn--muted-red"
                      onClick={() => {
                        DrawoAuth.signOut();
                      }}
                    >
                      Sign out all sessions
                    </button>
                  </div>
                </section>
              </div>

              {/* Danger Zone */}
              <h2 className="drawo-account-page__title drawo-account-page__title--danger">
                Danger zone
              </h2>

              <div className="drawo-danger-banner">
                <div className="drawo-danger-banner__title">Danger Zone</div>
                <div className="drawo-danger-banner__text">
                  Proceed with caution as these actions permanently affect your
                  account.
                </div>
              </div>

              <section
                id="section-delete-account"
                className={clsx("drawo-account-section", {
                  highlighted: highlightedSection === "section-delete-account",
                })}
              >
                <h3 className="drawo-account-section__title">Delete account</h3>
                <p className="drawo-account-section__desc">
                  Deleting your account will permanently erase all your data,
                  settings, and preferences from our system. This action is
                  irreversible.
                </p>
                <div className="drawo-account-section__body">
                  {userProfile.workspaces.length > 0 && (
                    <div className="drawo-danger-workspace-box">
                      <h4>Action required</h4>
                      <p>
                        You are the sole admin of these workspaces. Delete them
                        or assign another admin first:
                      </p>
                      <div className="drawo-danger-workspace-chips">
                        {userProfile.workspaces.map((ws) => (
                          <button
                            key={ws.id}
                            type="button"
                            className="drawo-danger-ws-chip"
                            onClick={() => onChangeTab("my-workspaces")}
                          >
                            {ws.name} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="drawo-delete-account-footer">
                    <span>
                      {userProfile.workspaces.length === 0
                        ? "This will permanently delete your account."
                        : "Resolve workspace issues to continue."}
                    </span>
                    <button
                      type="button"
                      className="drawo-account-btn drawo-account-btn--muted-red"
                      disabled={userProfile.workspaces.length > 0}
                      onClick={() => {
                        DrawoAuth.signOut();
                      }}
                    >
                      Delete account
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: PREFERENCES (/account/preferences)                       */}
          {/* =============================================================== */}
          {activeTab === "preferences" && (
            <div className="drawo-account-page">
              <h1 className="drawo-account-page__title">My preferences</h1>

              <div className="drawo-account-sections">
                {/* App theme */}
                <section
                  id="section-pref-theme"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted: highlightedSection === "section-pref-theme",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">App theme</h3>
                    <p className="drawo-account-section__desc">Alt+Shift+D</p>
                  </div>
                  <select
                    className="drawo-account-select"
                    value={prefs.theme}
                    onChange={(e) =>
                      handleThemeChange(
                        e.target.value as "light" | "dark" | "system",
                      )
                    }
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </section>

                {/* Language */}
                <section
                  id="section-pref-language"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted:
                        highlightedSection === "section-pref-language",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      Language <span className="drawo-account-badge">NEW</span>
                    </h3>
                    <p className="drawo-account-section__desc">
                      Choose the language used by Drawo.
                    </p>
                  </div>
                  <select
                    className="drawo-account-select"
                    value={selectedLanguage}
                    onChange={(e) => {
                      setSelectedLanguage(e.target.value);
                      showToast("Language preference saved");
                    }}
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="ja">日本語</option>
                    <option value="zh">简体中文</option>
                  </select>
                </section>

                {/* Initial app page */}
                <section
                  id="section-pref-initial-page"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted:
                        highlightedSection === "section-pref-initial-page",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      Initial app page
                    </h3>
                    <p className="drawo-account-section__desc">
                      What page to load when you open Drawo
                    </p>
                  </div>
                  <select
                    className="drawo-account-select"
                    value={prefs.initialRedirect}
                    onChange={(e) => {
                      DrawoAuth.updatePreferences({
                        initialRedirect: e.target
                          .value as DrawoUserPreferences["initialRedirect"],
                      });
                      showToast("Initial app page updated");
                    }}
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="privateCollection">
                      Private collection
                    </option>
                    <option value="lastEditedScene">Last edited scene</option>
                    <option value="lastVisitedScene">Last visited scene</option>
                  </select>
                </section>

                {/* Auto-redirect */}
                <section className="drawo-account-section drawo-account-section--row">
                  <div>
                    <h3 className="drawo-account-section__title">
                      Auto-redirect from excalidraw.com
                    </h3>
                    <p className="drawo-account-section__desc">
                      When you access the free editor you will be
                      auto-redirected to your workspace
                    </p>
                  </div>
                  <label className="drawo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.autoRedirect}
                      onChange={() =>
                        DrawoAuth.updatePreferences({
                          autoRedirect: !prefs.autoRedirect,
                        })
                      }
                    />
                    <span className="drawo-toggle-slider" />
                  </label>
                </section>

                {/* Email notifications */}
                <section
                  id="section-pref-notifications"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted:
                        highlightedSection === "section-pref-notifications",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      Email notifications
                    </h3>
                    <p className="drawo-account-section__desc">
                      Choose what email notifications you want to receive
                    </p>
                    <p className="drawo-account-section__subnote">
                      Toggle whether to receive email notifications for comments
                      and mentions.
                    </p>
                  </div>
                  <label className="drawo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.emailNotifications}
                      onChange={() =>
                        DrawoAuth.updatePreferences({
                          emailNotifications: !prefs.emailNotifications,
                        })
                      }
                    />
                    <span className="drawo-toggle-slider" />
                  </label>
                </section>

                {/* AI preferences */}
                <section
                  id="section-pref-ai"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted: highlightedSection === "section-pref-ai",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      AI preferences for private collections
                    </h3>
                    <p className="drawo-account-section__desc">
                      Enable automatic scene naming for your private collections
                    </p>
                  </div>
                  <label className="drawo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.aiSceneNaming}
                      onChange={() =>
                        DrawoAuth.updatePreferences({
                          aiSceneNaming: !prefs.aiSceneNaming,
                        })
                      }
                    />
                    <span className="drawo-toggle-slider" />
                  </label>
                </section>

                {/* Show old fonts */}
                <section
                  id="section-pref-fonts"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted: highlightedSection === "section-pref-fonts",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      Show old fonts
                    </h3>
                    <p className="drawo-account-section__desc">
                      Show old fonts in the font picker
                    </p>
                    <p className="drawo-account-section__subnote">
                      You will be able to pick old fonts inside the font picker
                      which have been replaced or removed from the editor.
                    </p>
                  </div>
                  <label className="drawo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.showOldFonts}
                      onChange={() =>
                        DrawoAuth.updatePreferences({
                          showOldFonts: !prefs.showOldFonts,
                        })
                      }
                    />
                    <span className="drawo-toggle-slider" />
                  </label>
                </section>

                {/* Push to talk */}
                <section
                  id="section-pref-ptt"
                  className={clsx(
                    "drawo-account-section drawo-account-section--row",
                    {
                      highlighted: highlightedSection === "section-pref-ptt",
                    },
                  )}
                >
                  <div>
                    <h3 className="drawo-account-section__title">
                      Push to talk
                    </h3>
                    <p className="drawo-account-section__desc">
                      Enable push-to-talk mode for voice calls. Hold Space to
                      speak, release to mute.
                    </p>
                  </div>
                  <label className="drawo-toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.pushToTalk}
                      onChange={() =>
                        DrawoAuth.updatePreferences({
                          pushToTalk: !prefs.pushToTalk,
                        })
                      }
                    />
                    <span className="drawo-toggle-slider" />
                  </label>
                </section>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: PERSONAL MCP/API KEYS (/account/api-keys)                */}
          {/* =============================================================== */}
          {activeTab === "api-keys" && (
            <div className="drawo-account-page" id="section-api-keys">
              <h1 className="drawo-account-page__title">
                Personal MCP/API keys
              </h1>

              <div className="drawo-info-callout">
                <div className="drawo-info-callout__title">Beta</div>
                <div className="drawo-info-callout__text">
                  MCP/API keys are in beta and may still change. Generated
                  output may still be a bit rough, but we're actively working on
                  improvements.
                </div>
              </div>

              <div className="drawo-account-sections">
                <section className="drawo-account-section">
                  <h3 className="drawo-account-section__title">
                    Personal MCP/API keys
                  </h3>
                  <p className="drawo-account-section__desc">
                    Use your personal key with MCP clients and scripts. Includes
                    access to your private collection.
                  </p>

                  <div className="drawo-apikey-list">
                    {userProfile.workspaces.length === 0 ? (
                      <div className="drawo-apikey-empty">
                        You do not belong to any workspace yet. Create a
                        workspace first to generate personal MCP/API keys.
                      </div>
                    ) : (
                      userProfile.workspaces.map((ws) => {
                        const keyRecord = userProfile.apiKeys?.[ws.id];
                        return (
                          <div key={ws.id} className="drawo-apikey-card">
                            <div className="drawo-apikey-card__accent" />
                            <div className="drawo-apikey-card__info">
                              <div className="drawo-apikey-card__ws-label">
                                WORKSPACE
                              </div>
                              <div className="drawo-apikey-card__ws-name">
                                {ws.name}
                              </div>
                              {keyRecord ? (
                                <div className="drawo-apikey-card__meta">
                                  <code>{keyRecord.partialKey}</code>
                                  <span>
                                    Created{" "}
                                    {formatDateMedium(keyRecord.createdAt)}
                                  </span>
                                </div>
                              ) : (
                                <div className="drawo-apikey-card__empty-msg">
                                  You do not have a personal MCP/API key for
                                  this workspace yet.
                                </div>
                              )}
                            </div>

                            <div className="drawo-apikey-card__actions">
                              {keyRecord ? (
                                <>
                                  <button
                                    type="button"
                                    className="drawo-account-btn drawo-account-btn--outline"
                                    onClick={() => {
                                      const { fullKey } =
                                        DrawoAuth.createOrRotateApiKey(ws.id);
                                      setRevealedKeyData({
                                        key: fullKey,
                                        workspaceName: ws.name,
                                      });
                                    }}
                                  >
                                    ↻ Rotate
                                  </button>
                                  <button
                                    type="button"
                                    className="drawo-account-btn drawo-account-btn--muted-red"
                                    onClick={() => {
                                      DrawoAuth.deleteApiKey(ws.id);
                                      showToast("API key deleted");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="drawo-account-btn drawo-account-btn--primary"
                                  onClick={() => {
                                    const { fullKey } =
                                      DrawoAuth.createOrRotateApiKey(ws.id);
                                    setRevealedKeyData({
                                      key: fullKey,
                                      workspaceName: ws.name,
                                    });
                                  }}
                                >
                                  + Create key
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* MCP Configuration Snippet */}
                <section className="drawo-account-section">
                  <h3 className="drawo-account-section__title">
                    MCP configuration
                  </h3>
                  <p className="drawo-account-section__desc">
                    Pick your MCP client and replace the placeholder with your
                    personal MCP/API key.
                  </p>
                  <div className="drawo-mcp-config-box">
                    <div className="drawo-mcp-config-tabs">
                      {(["claude", "cursor", "vscode"] as const).map(
                        (client) => (
                          <button
                            key={client}
                            type="button"
                            className={clsx("drawo-mcp-tab", {
                              active: selectedMcpClient === client,
                            })}
                            onClick={() => setSelectedMcpClient(client)}
                          >
                            {client === "claude"
                              ? "Claude Desktop"
                              : client === "cursor"
                              ? "Cursor"
                              : "VS Code / Antigravity"}
                          </button>
                        ),
                      )}
                    </div>
                    <pre className="drawo-mcp-code">
                      {JSON.stringify(
                        {
                          mcpServers: {
                            drawo: {
                              url: "https://api.drawo.app/api/v1/mcp",
                              headers: {
                                Authorization: "Bearer <PERSONAL_API_KEY>",
                              },
                            },
                          },
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 4: EXPORT PRIVATE COLLECTION (/account/export)              */}
          {/* =============================================================== */}
          {activeTab === "export" && (
            <div className="drawo-account-page" id="section-export-private">
              <h1 className="drawo-account-page__title">
                Export private collection
              </h1>

              <div className="drawo-account-sections">
                <section className="drawo-account-section">
                  <h3 className="drawo-account-section__title">
                    Export private collection
                  </h3>
                  <p className="drawo-account-section__desc">
                    Download the scenes of your private collection from any
                    Workspace you belong to. Scenes you created in public
                    collections stay with the Workspace and are not included.
                  </p>

                  {userProfile.workspaces.length === 0 ? (
                    <div className="drawo-apikey-empty">
                      You do not belong to any Workspace.
                    </div>
                  ) : (
                    <div className="drawo-export-controls">
                      <div className="drawo-export-ws-picker">
                        <label>Workspace to export from</label>
                        <select
                          className="drawo-account-select"
                          value={selectedExportWsId}
                          onChange={(e) =>
                            setSelectedExportWsId(e.target.value)
                          }
                        >
                          {userProfile.workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>
                              {ws.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="drawo-info-callout">
                        <div className="drawo-info-callout__text">
                          The export packages all scenes from your Private
                          collection into a downloadable JSON archive compatible
                          with Drawo and Excalidraw.
                        </div>
                      </div>

                      <div>
                        <button
                          type="button"
                          className="drawo-account-btn drawo-account-btn--primary"
                          disabled={isExporting}
                          onClick={handleExportPrivateCollection}
                        >
                          {isExporting
                            ? "Exporting scenes..."
                            : "Export private collection"}
                        </button>
                      </div>

                      <div className="drawo-export-history">
                        <h4>Export history</h4>
                        {!userProfile.exportHistory ||
                        userProfile.exportHistory.length === 0 ? (
                          <p className="drawo-export-history__empty">
                            You have not exported your scenes yet.
                          </p>
                        ) : (
                          <div className="drawo-workspaces-table-wrap">
                            <table className="drawo-workspaces-table">
                              <thead>
                                <tr>
                                  <th>Workspace</th>
                                  <th>Scenes</th>
                                  <th>Exported</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {userProfile.exportHistory.map((exp) => (
                                  <tr key={exp.id}>
                                    <td className="font-semibold">
                                      {exp.workspaceName}
                                    </td>
                                    <td>{exp.sceneCount} scenes</td>
                                    <td>{formatDateMedium(exp.createdAt)}</td>
                                    <td>
                                      <span className="drawo-role-pill">
                                        Downloaded
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 5: MY WORKSPACES (/account/my-workspaces)                   */}
          {/* =============================================================== */}
          {activeTab === "my-workspaces" && (
            <div className="drawo-account-page" id="section-my-workspaces">
              <div className="drawo-account-page__header-row">
                <h1 className="drawo-account-page__title">My workspaces</h1>
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--primary"
                  onClick={onOpenCreateWorkspace}
                >
                  {PlusIcon}
                  <span>Create new workspace</span>
                </button>
              </div>

              {sortedWorkspaces.length === 0 ? (
                <div className="drawo-workspaces-empty">
                  <p>You are not a member of any workspace.</p>
                  <button
                    type="button"
                    className="drawo-account-btn drawo-account-btn--primary"
                    onClick={onOpenCreateWorkspace}
                  >
                    Create workspace
                  </button>
                </div>
              ) : (
                <div className="drawo-workspaces-table-wrap">
                  <table className="drawo-workspaces-table">
                    <thead>
                      <tr>
                        <th>
                          <button
                            type="button"
                            className="drawo-th-sort-btn"
                            onClick={() =>
                              setWsSort((prev) => ({
                                key: "name",
                                order:
                                  prev.key === "name" && prev.order === "asc"
                                    ? "desc"
                                    : "asc",
                              }))
                            }
                          >
                            Workspace{" "}
                            {wsSort.key === "name"
                              ? wsSort.order === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </button>
                        </th>
                        <th>Your role</th>
                        <th>Members</th>
                        <th>
                          <button
                            type="button"
                            className="drawo-th-sort-btn"
                            onClick={() =>
                              setWsSort((prev) => ({
                                key: "created",
                                order:
                                  prev.key === "created" && prev.order === "asc"
                                    ? "desc"
                                    : "asc",
                              }))
                            }
                          >
                            Created{" "}
                            {wsSort.key === "created"
                              ? wsSort.order === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </button>
                        </th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedWorkspaces.map((ws) => {
                        const isCurrent =
                          ws.id === userProfile.activeWorkspaceId;
                        return (
                          <tr key={ws.id}>
                            <td>
                              <div className="drawo-ws-table-cell-name">
                                <div className="drawo-ws-header__avatar">
                                  {ws.name.charAt(0).toUpperCase()}
                                </div>
                                <button
                                  type="button"
                                  className="drawo-ws-table-link"
                                  onClick={() => {
                                    DrawoAuth.switchWorkspace(ws.id);
                                    onOpenWorkspaceDashboard(ws.id);
                                  }}
                                >
                                  {ws.name}
                                </button>
                                {isCurrent && (
                                  <span className="drawo-current-pill">
                                    Current
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="drawo-role-pill">Admin</span>
                            </td>
                            <td>1</td>
                            <td>{formatDateMedium(ws.createdAt)}</td>
                            <td>
                              <div className="drawo-ws-table-actions">
                                <button
                                  type="button"
                                  className="drawo-ws-icon-action"
                                  title="Workspace settings"
                                  onClick={() => {
                                    DrawoAuth.switchWorkspace(ws.id);
                                    onOpenWorkspaceDashboard(ws.id);
                                  }}
                                >
                                  {settingsIcon}
                                </button>
                                <button
                                  type="button"
                                  className="drawo-ws-icon-action danger"
                                  title="Delete workspace"
                                  onClick={() => {
                                    DrawoAuth.deleteWorkspace(ws.id);
                                    showToast(`Deleted workspace "${ws.name}"`);
                                  }}
                                >
                                  {TrashIcon}
                                </button>
                                <button
                                  type="button"
                                  className="drawo-ws-open-btn"
                                  onClick={() => {
                                    DrawoAuth.switchWorkspace(ws.id);
                                    onOpenWorkspaceDashboard(ws.id);
                                  }}
                                >
                                  <span>Open</span>
                                  <span>→</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ================================================================= */}
      {/* MODAL 1: UPLOAD / CHOOSE PROFILE PHOTO                            */}
      {/* ================================================================= */}
      {isAvatarModalOpen && (
        <div
          className="drawo-account-modal-backdrop"
          onClick={() => setIsAvatarModalOpen(false)}
        >
          <div
            className="drawo-account-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawo-account-modal__header">
              <h3>Upload profile photo</h3>
              <button type="button" onClick={() => setIsAvatarModalOpen(false)}>
                {CloseIcon}
              </button>
            </div>
            <div className="drawo-account-modal__body">
              <p className="drawo-account-modal__sub">
                Upload a custom image or pick an avatar icon below.
              </p>
              <div className="drawo-auth-avatar-picker">
                {["🐧", "🚀", "⚡", "🦊", "🎨", "🤖", "🐱", "💎"].map(
                  (emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={clsx("drawo-auth-avatar-btn", {
                        "drawo-auth-avatar-btn--active":
                          !userProfile.photoURL && userProfile.avatar === emoji,
                      })}
                      onClick={() => {
                        DrawoAuth.updateUserProfile({
                          avatar: emoji,
                          photoURL: null,
                        });
                        setIsAvatarModalOpen(false);
                        showToast("Avatar updated!");
                      }}
                    >
                      {emoji}
                    </button>
                  ),
                )}
              </div>

              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarUpload}
              />

              <div className="drawo-account-modal__actions">
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--outline"
                  onClick={() => setIsAvatarModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--primary"
                  onClick={() => avatarFileInputRef.current?.click()}
                >
                  Upload image...
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: CHANGE PROFILE NAME                                      */}
      {/* ================================================================= */}
      {isNameModalOpen && (
        <div
          className="drawo-account-modal-backdrop"
          onClick={() => setIsNameModalOpen(false)}
        >
          <div
            className="drawo-account-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawo-account-modal__header">
              <h3>Change name</h3>
              <button type="button" onClick={() => setIsNameModalOpen(false)}>
                {CloseIcon}
              </button>
            </div>
            <form
              className="drawo-account-modal__body"
              onSubmit={handleSaveProfileName}
            >
              <TextField
                label="Name"
                value={nameDraft}
                onChange={(val) => setNameDraft(val)}
                selectOnRender
                fullWidth
              />
              <div className="drawo-account-modal__actions">
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--outline"
                  onClick={() => setIsNameModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="drawo-account-btn drawo-account-btn--primary"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: CONNECT SIGN-IN PROVIDER                                 */}
      {/* ================================================================= */}
      {isConnectProviderModalOpen && (
        <div
          className="drawo-account-modal-backdrop"
          onClick={() => setIsConnectProviderModalOpen(false)}
        >
          <div
            className="drawo-account-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawo-account-modal__header">
              <h3>Connect sign-in provider</h3>
              <button
                type="button"
                onClick={() => setIsConnectProviderModalOpen(false)}
              >
                {CloseIcon}
              </button>
            </div>
            <div className="drawo-account-modal__body">
              <p className="drawo-account-modal__sub">
                Connect another identity provider for easier sign-in flow.
              </p>
              <div className="drawo-connect-providers-stack">
                {availableProvidersToConnect.map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    className="drawo-account-btn drawo-account-btn--primary"
                    onClick={() => {
                      DrawoAuth.connectProvider(prov);
                      setIsConnectProviderModalOpen(false);
                      showToast(`Connected ${prov}!`);
                    }}
                  >
                    Connect {prov === "google.com" ? "Google" : "GitHub"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: REVEAL PERSONAL MCP/API KEY                              */}
      {/* ================================================================= */}
      {revealedKeyData && (
        <div
          className="drawo-account-modal-backdrop"
          onClick={() => setRevealedKeyData(null)}
        >
          <div
            className="drawo-account-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawo-account-modal__header">
              <h3>Your personal MCP/API key</h3>
              <button type="button" onClick={() => setRevealedKeyData(null)}>
                {CloseIcon}
              </button>
            </div>
            <div className="drawo-account-modal__body">
              <p className="drawo-account-modal__sub">
                Copy this key now for{" "}
                <strong>{revealedKeyData.workspaceName}</strong>. For security,
                the full key is only shown once.
              </p>
              <div className="drawo-revealed-key-box">
                <code>{revealedKeyData.key}</code>
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(revealedKeyData.key);
                    showToast("API key copied to clipboard!");
                  }}
                >
                  Copy
                </button>
              </div>
              <div className="drawo-account-modal__actions">
                <button
                  type="button"
                  className="drawo-account-btn drawo-account-btn--primary"
                  onClick={() => setRevealedKeyData(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
