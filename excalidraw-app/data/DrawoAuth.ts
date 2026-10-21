import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { get, set } from "idb-keyval";

import { appJotaiStore, atom } from "../app-jotai";

import {
  saveUsernameToLocalStorage,
  importUsernameFromLocalStorage,
} from "./localStorage";
import {
  DrawoWorkspace,
  drawoWorkspaceAtom,
  workspaceBoardsStore,
  DEFAULT_COLLECTIONS,
} from "./DrawoWorkspace";

import type { User } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";

import type {
  DrawoBoardMeta,
  DrawoBoardScene,
  DrawoCollection,
  DrawoWorkspaceState,
} from "./DrawoWorkspace";

export interface DrawoWorkspaceEntry {
  id: string;
  name: string;
  icon?: string;
  createdAt: number;
  boards: DrawoBoardMeta[];
  collections: DrawoCollection[];
  activeBoardId: string;
}

export interface DrawoUserPreferences {
  theme: "light" | "dark" | "system";
  initialRedirect:
    | "dashboard"
    | "privateCollection"
    | "lastEditedScene"
    | "lastVisitedScene";
  autoRedirect: boolean;
  emailNotifications: boolean;
  aiSceneNaming: boolean;
  showOldFonts: boolean;
  pushToTalk: boolean;
}

export interface DrawoPersonalApiKey {
  workspaceId: string;
  partialKey: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface DrawoExportRecord {
  id: string;
  workspaceId: string;
  workspaceName: string;
  sceneCount: number;
  createdAt: number;
}

export interface DrawoUserProfile {
  uid: string;
  displayName: string;
  email: string;
  avatar: string;
  photoURL?: string | null;
  role: string;
  provider: "local" | "google" | "github" | "email";
  linkedProviders?: string[];
  isCloudAuthenticated: boolean;
  authLoading?: boolean;
  workspaces: DrawoWorkspaceEntry[];
  activeWorkspaceId: string | null;
  preferences?: DrawoUserPreferences;
  apiKeys?: Record<string, DrawoPersonalApiKey>;
  exportHistory?: DrawoExportRecord[];
  lastSyncedAt?: number | null;
}

export interface FirebaseConfigData {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const USER_PROFILE_STORAGE_KEY = "drawo-user-profile-v2";
const DRAWO_FIREBASE_APP_NAME = "drawo-spark-auth-app";

// Provisioned via firebase-mcp-server for orizyy08@gmail.com (project: drawo-e4ac6)
const DEFAULT_FIREBASE_CONFIG: FirebaseConfigData = {
  projectId: "drawo-e4ac6",
  appId: "1:113505088362:web:9fde3db5ef9a55f3e4eb13",
  storageBucket: "drawo-e4ac6.firebasestorage.app",
  apiKey: "AIzaSyBwsAoWleQMy9UwlivwJ9f7S7buMHexnFI",
  authDomain: "drawo-e4ac6.firebaseapp.com",
  messagingSenderId: "113505088362",
};

const getActiveFirebaseConfig = (): FirebaseConfigData => {
  return DEFAULT_FIREBASE_CONFIG;
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const loadInitialUserProfile = (): DrawoUserProfile => {
  const collabName = importUsernameFromLocalStorage();

  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DrawoUserProfile;
      if (parsed && typeof parsed === "object") {
        return {
          ...parsed,
          workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
          activeWorkspaceId: parsed.activeWorkspaceId || null,
          authLoading: false,
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    uid: "",
    displayName: collabName || "Drawo User",
    email: "",
    avatar: "🐧",
    photoURL: null,
    role: "Workspace Owner",
    provider: "local",
    isCloudAuthenticated: false,
    authLoading: true,
    workspaces: [],
    activeWorkspaceId: null,
    lastSyncedAt: null,
  };
};

const saveUserProfile = (profile: DrawoUserProfile) => {
  try {
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    if (profile.displayName) {
      saveUsernameToLocalStorage(profile.displayName);
    }
  } catch {
    // ignore
  }
};

export const drawoAuthAtom = atom<DrawoUserProfile>(loadInitialUserProfile());

let drawoFirebaseApp: FirebaseApp | null = null;
let authUnsubscribe: (() => void) | null = null;

const getOrInitDrawoFirebaseApp = (): FirebaseApp => {
  const existing = getApps().find((a) => a.name === DRAWO_FIREBASE_APP_NAME);
  if (existing) {
    drawoFirebaseApp = existing;
    return existing;
  }
  const config = getActiveFirebaseConfig();
  drawoFirebaseApp = initializeApp(config, DRAWO_FIREBASE_APP_NAME);
  return drawoFirebaseApp;
};

const mapFirebaseUserToProfile = (
  user: User,
  existing: DrawoUserProfile,
): DrawoUserProfile => {
  const providerId = user.providerData[0]?.providerId || "email";
  const provider: DrawoUserProfile["provider"] = providerId.includes("google")
    ? "google"
    : providerId.includes("github")
    ? "github"
    : "email";

  const displayName =
    user.displayName ||
    existing.displayName ||
    user.email?.split("@")[0] ||
    "Drawo User";

  // Load any saved workspaces for this specific user uid
  let userWorkspaces = existing.workspaces;
  let activeWsId = existing.activeWorkspaceId;
  try {
    const perUserRaw = localStorage.getItem(`drawo-workspaces-${user.uid}`);
    if (perUserRaw) {
      const parsed = JSON.parse(perUserRaw);
      if (Array.isArray(parsed.workspaces)) {
        userWorkspaces = parsed.workspaces;
        activeWsId = parsed.activeWorkspaceId || userWorkspaces[0]?.id || null;
      }
    }
  } catch {
    // ignore
  }

  const linkedProviders =
    user.providerData.length > 0
      ? user.providerData.map((p) => p.providerId)
      : [
          provider === "google"
            ? "google.com"
            : provider === "github"
            ? "github.com"
            : "password",
        ];

  return {
    ...existing,
    uid: user.uid,
    displayName,
    email: user.email || existing.email,
    photoURL: user.photoURL || existing.photoURL || null,
    provider,
    linkedProviders,
    isCloudAuthenticated: true,
    authLoading: false,
    workspaces: userWorkspaces,
    activeWorkspaceId: activeWsId,
  };
};

const persistUserWorkspaces = (profile: DrawoUserProfile) => {
  saveUserProfile(profile);
  if (profile.uid) {
    try {
      localStorage.setItem(
        `drawo-workspaces-${profile.uid}`,
        JSON.stringify({
          workspaces: profile.workspaces,
          activeWorkspaceId: profile.activeWorkspaceId,
        }),
      );
    } catch {
      // ignore
    }
  }
};

export const DrawoAuth = {
  getProfile(): DrawoUserProfile {
    return appJotaiStore.get(drawoAuthAtom);
  },

  initAuthListener(): void {
    if (authUnsubscribe) {
      return;
    }

    try {
      const app = getOrInitDrawoFirebaseApp();
      const auth = getAuth(app);
      authUnsubscribe = onAuthStateChanged(auth, async (user) => {
        const current = this.getProfile();
        if (user) {
          const next = mapFirebaseUserToProfile(user, current);
          persistUserWorkspaces(next);
          appJotaiStore.set(drawoAuthAtom, next);

          // Sync workspaces from Cloud Firestore
          await this.pullWorkspacesFromCloud(user.uid).catch(() => {});
        } else {
          const next: DrawoUserProfile = {
            ...current,
            uid: "",
            email: "",
            provider: "local",
            isCloudAuthenticated: false,
            authLoading: false,
            photoURL: null,
          };
          saveUserProfile(next);
          appJotaiStore.set(drawoAuthAtom, next);
        }
      });
    } catch (err) {
      console.warn("Firebase Auth listener error:", err);
      const current = this.getProfile();
      appJotaiStore.set(drawoAuthAtom, { ...current, authLoading: false });
    }
  },

  /**
   * Creates a new Workspace for the signed-in user and activates it.
   */
  async createWorkspace(
    name: string,
    includeStarterScenes = true,
  ): Promise<DrawoWorkspaceEntry> {
    const profile = this.getProfile();
    const trimmedName = name.trim() || "My Workspace";
    const now = Date.now();
    const wsId = `ws-${createId()}`;

    const currentWsState = DrawoWorkspace.getState();
    const authorName =
      profile.displayName || profile.email?.split("@")[0] || "Owner";

    let initialBoards: DrawoBoardMeta[];
    if (includeStarterScenes && currentWsState.boards.length > 0) {
      initialBoards = currentWsState.boards.map((b) => ({
        ...b,
        author: authorName,
      }));
    } else {
      const firstBoardId = `board-${createId()}`;
      initialBoards = [
        {
          id: firstBoardId,
          title: "Untitled scene",
          collectionId: "col-private",
          isFavorite: false,
          author: authorName,
          elementCount: 0,
          updatedAt: now,
          createdAt: now,
        },
      ];
    }

    const newWs: DrawoWorkspaceEntry = {
      id: wsId,
      name: trimmedName,
      createdAt: now,
      boards: initialBoards,
      collections: [...DEFAULT_COLLECTIONS],
      activeBoardId: initialBoards[0].id,
    };

    const nextWorkspaces = [...profile.workspaces, newWs];
    const nextProfile: DrawoUserProfile = {
      ...profile,
      workspaces: nextWorkspaces,
      activeWorkspaceId: newWs.id,
    };

    persistUserWorkspaces(nextProfile);
    appJotaiStore.set(drawoAuthAtom, nextProfile);

    // Sync active workspace into DrawoWorkspace state
    const nextWsState: DrawoWorkspaceState = {
      activeBoardId: newWs.activeBoardId,
      boards: newWs.boards,
      collections: newWs.collections,
    };
    appJotaiStore.set(drawoWorkspaceAtom, nextWsState);
    localStorage.setItem(
      "drawo-workspace-meta-v1",
      JSON.stringify(nextWsState),
    );

    // Persist to Cloud Firestore if authenticated
    if (nextProfile.isCloudAuthenticated && nextProfile.uid) {
      await this.syncWorkspacesToCloud().catch(() => {});
    }

    return newWs;
  },

  /**
   * Switches between the user's created Workspaces.
   */
  switchWorkspace(workspaceId: string): void {
    const profile = this.getProfile();
    const currentWsState = DrawoWorkspace.getState();

    // Save current workspace boards/collections back into the active workspace entry
    const updatedWorkspaces = profile.workspaces.map((ws) =>
      ws.id === profile.activeWorkspaceId
        ? {
            ...ws,
            boards: currentWsState.boards,
            collections: currentWsState.collections,
            activeBoardId: currentWsState.activeBoardId,
          }
        : ws,
    );

    const target = updatedWorkspaces.find((ws) => ws.id === workspaceId);
    if (!target) {
      return;
    }

    const nextProfile: DrawoUserProfile = {
      ...profile,
      workspaces: updatedWorkspaces,
      activeWorkspaceId: target.id,
    };
    persistUserWorkspaces(nextProfile);
    appJotaiStore.set(drawoAuthAtom, nextProfile);

    const nextWsState: DrawoWorkspaceState = {
      activeBoardId: target.activeBoardId,
      boards: target.boards,
      collections: target.collections,
    };
    appJotaiStore.set(drawoWorkspaceAtom, nextWsState);
    localStorage.setItem(
      "drawo-workspace-meta-v1",
      JSON.stringify(nextWsState),
    );
  },

  /**
   * Updates user display name & avatar and syncs with Firebase Auth + Collab.
   */
  updateUserProfile(updates: {
    displayName?: string;
    avatar?: string;
    photoURL?: string | null;
  }): DrawoUserProfile {
    const current = this.getProfile();
    const next: DrawoUserProfile = {
      ...current,
      displayName: updates.displayName?.trim() || current.displayName,
      avatar: updates.avatar || current.avatar,
      photoURL:
        updates.photoURL !== undefined ? updates.photoURL : current.photoURL,
    };

    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);

    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    if (auth.currentUser && updates.displayName) {
      updateProfile(auth.currentUser, {
        displayName: next.displayName,
      }).catch(() => {});
    }

    if (next.isCloudAuthenticated && next.uid) {
      this.syncWorkspacesToCloud().catch(() => {});
    }

    return next;
  },

  updatePreferences(partial: Partial<DrawoUserPreferences>): DrawoUserProfile {
    const current = this.getProfile();
    const basePrefs: DrawoUserPreferences = current.preferences || {
      theme: "system",
      initialRedirect: "dashboard",
      autoRedirect: false,
      emailNotifications: true,
      aiSceneNaming: true,
      showOldFonts: false,
      pushToTalk: false,
    };
    const next: DrawoUserProfile = {
      ...current,
      preferences: { ...basePrefs, ...partial },
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    if (next.isCloudAuthenticated && next.uid) {
      this.syncWorkspacesToCloud().catch(() => {});
    }
    return next;
  },

  createOrRotateApiKey(workspaceId: string): {
    fullKey: string;
    record: DrawoPersonalApiKey;
  } {
    const current = this.getProfile();
    const randA = Math.random().toString(36).slice(2, 12);
    const randB = Math.random().toString(36).slice(2, 12);
    const randC = Math.random().toString(36).slice(2, 10);
    const fullKey = `drawo_pat_${randA}${randB}${randC}`;
    const partialKey = `drawo_pat_${randA.slice(0, 4)}••••••••${randC.slice(
      -4,
    )}`;
    const record: DrawoPersonalApiKey = {
      workspaceId,
      partialKey,
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    const next: DrawoUserProfile = {
      ...current,
      apiKeys: {
        ...(current.apiKeys || {}),
        [workspaceId]: record,
      },
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    return { fullKey, record };
  },

  deleteApiKey(workspaceId: string): void {
    const current = this.getProfile();
    const nextKeys = { ...(current.apiKeys || {}) };
    delete nextKeys[workspaceId];
    const next: DrawoUserProfile = {
      ...current,
      apiKeys: nextKeys,
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
  },

  recordExport(workspaceId: string, sceneCount: number): DrawoExportRecord {
    const current = this.getProfile();
    const ws = current.workspaces.find((w) => w.id === workspaceId);
    const entry: DrawoExportRecord = {
      id: `exp-${createId()}`,
      workspaceId,
      workspaceName: ws?.name || "My Workspace",
      sceneCount,
      createdAt: Date.now(),
    };
    const next: DrawoUserProfile = {
      ...current,
      exportHistory: [entry, ...(current.exportHistory || [])].slice(0, 20),
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    return entry;
  },

  renameWorkspace(workspaceId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    const current = this.getProfile();
    const nextWorkspaces = current.workspaces.map((ws) =>
      ws.id === workspaceId ? { ...ws, name: trimmed } : ws,
    );
    const next: DrawoUserProfile = {
      ...current,
      workspaces: nextWorkspaces,
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    if (next.isCloudAuthenticated && next.uid) {
      this.syncWorkspacesToCloud().catch(() => {});
    }
  },

  deleteWorkspace(workspaceId: string): void {
    const current = this.getProfile();
    const remaining = current.workspaces.filter((ws) => ws.id !== workspaceId);
    const nextActiveId =
      current.activeWorkspaceId === workspaceId
        ? remaining[0]?.id || null
        : current.activeWorkspaceId;
    const next: DrawoUserProfile = {
      ...current,
      workspaces: remaining,
      activeWorkspaceId: nextActiveId,
    };
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    if (next.isCloudAuthenticated && next.uid) {
      this.syncWorkspacesToCloud().catch(() => {});
    }
  },

  connectProvider(providerId: string): void {
    const current = this.getProfile();
    const existing = current.linkedProviders || [
      current.provider === "google"
        ? "google.com"
        : current.provider === "github"
        ? "github.com"
        : "password",
    ];
    if (!existing.includes(providerId)) {
      const next: DrawoUserProfile = {
        ...current,
        linkedProviders: [...existing, providerId],
      };
      persistUserWorkspaces(next);
      appJotaiStore.set(drawoAuthAtom, next);
    }
  },

  async signInWithGoogle(): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.pullWorkspacesFromCloud(cred.user.uid).catch(() => {});
    return this.getProfile();
  },

  async signInWithGithub(): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    const provider = new GithubAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.pullWorkspacesFromCloud(cred.user.uid).catch(() => {});
    return this.getProfile();
  },

  async signInWithEmail(
    email: string,
    password: string,
  ): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.pullWorkspacesFromCloud(cred.user.uid).catch(() => {});
    return this.getProfile();
  },

  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
  ): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    const cred = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password,
    );
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    const next = mapFirebaseUserToProfile(cred.user, {
      ...this.getProfile(),
      displayName: displayName.trim() || email.split("@")[0],
      workspaces: [],
      activeWorkspaceId: null,
    });
    persistUserWorkspaces(next);
    appJotaiStore.set(drawoAuthAtom, next);
    return next;
  },

  async signOut(): Promise<void> {
    const app = getOrInitDrawoFirebaseApp();
    const auth = getAuth(app);
    await signOut(auth).catch(() => {});

    const current = this.getProfile();
    const next: DrawoUserProfile = {
      ...current,
      uid: "",
      email: "",
      provider: "local",
      isCloudAuthenticated: false,
      photoURL: null,
    };
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
  },

  async syncWorkspacesToCloud(): Promise<void> {
    const app = getOrInitDrawoFirebaseApp();
    const profile = this.getProfile();
    if (!profile.isCloudAuthenticated || !profile.uid) {
      return;
    }

    // Ensure latest active DrawoWorkspace state is synced into profile.workspaces
    const currentWsState = DrawoWorkspace.getState();
    const updatedWorkspaces = profile.workspaces.map((ws) =>
      ws.id === profile.activeWorkspaceId
        ? {
            ...ws,
            boards: currentWsState.boards,
            collections: currentWsState.collections,
            activeBoardId: currentWsState.activeBoardId,
          }
        : ws,
    );

    const db = getFirestore(app);
    const now = Date.now();
    const userDocRef = doc(db, "users", profile.uid);
    await setDoc(
      userDocRef,
      {
        uid: profile.uid,
        displayName: profile.displayName,
        email: profile.email,
        avatar: profile.avatar,
        activeWorkspaceId: profile.activeWorkspaceId,
        workspaces: updatedWorkspaces,
        updatedAt: now,
      },
      { merge: true },
    );

    // Sync active workspace board scenes
    const boardsToSync = [...currentWsState.boards]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 15);

    for (const board of boardsToSync) {
      const scene = await get<DrawoBoardScene>(board.id, workspaceBoardsStore);
      if (scene && scene.elements) {
        const boardRef = doc(db, "users", profile.uid, "boards", board.id);
        await setDoc(boardRef, {
          id: board.id,
          title: board.title,
          elementsJson: JSON.stringify(scene.elements),
          viewBackgroundColor: scene.appState?.viewBackgroundColor || "#ffffff",
          updatedAt: board.updatedAt,
        });
      }
    }

    const nextProfile: DrawoUserProfile = {
      ...profile,
      workspaces: updatedWorkspaces,
      lastSyncedAt: now,
    };
    persistUserWorkspaces(nextProfile);
    appJotaiStore.set(drawoAuthAtom, nextProfile);
  },

  async pullWorkspacesFromCloud(uid: string): Promise<void> {
    const app = getOrInitDrawoFirebaseApp();
    const db = getFirestore(app);
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      return;
    }

    const data = snap.data();
    if (data && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
      const boardsCol = collection(db, "users", uid, "boards");
      const boardSnaps = await getDocs(boardsCol);
      for (const bDoc of boardSnaps.docs) {
        const bData = bDoc.data();
        if (bData.elementsJson) {
          try {
            const elements = JSON.parse(bData.elementsJson);
            await set(
              bDoc.id,
              {
                elements,
                appState: {
                  viewBackgroundColor: bData.viewBackgroundColor || "#ffffff",
                },
              },
              workspaceBoardsStore,
            );
          } catch {
            // ignore
          }
        }
      }

      const current = this.getProfile();
      const activeWsId = data.activeWorkspaceId || data.workspaces[0].id;
      const activeWs: DrawoWorkspaceEntry =
        data.workspaces.find((w: any) => w.id === activeWsId) ||
        data.workspaces[0];

      const nextProfile: DrawoUserProfile = {
        ...current,
        workspaces: data.workspaces,
        activeWorkspaceId: activeWs.id,
        lastSyncedAt: Date.now(),
      };
      persistUserWorkspaces(nextProfile);
      appJotaiStore.set(drawoAuthAtom, nextProfile);

      const nextWsState: DrawoWorkspaceState = {
        activeBoardId: activeWs.activeBoardId,
        boards: activeWs.boards,
        collections: activeWs.collections || DEFAULT_COLLECTIONS,
      };
      appJotaiStore.set(drawoWorkspaceAtom, nextWsState);
      localStorage.setItem(
        "drawo-workspace-meta-v1",
        JSON.stringify(nextWsState),
      );
    }
  },
};
