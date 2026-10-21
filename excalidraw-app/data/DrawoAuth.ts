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

export interface DrawoUserProfile {
  uid: string;
  displayName: string;
  email: string;
  avatar: string;
  photoURL?: string | null;
  role: string;
  provider: "local" | "google" | "github" | "email";
  isCloudAuthenticated: boolean;
  authLoading?: boolean;
  workspaces: DrawoWorkspaceEntry[];
  activeWorkspaceId: string | null;
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

  return {
    ...existing,
    uid: user.uid,
    displayName,
    email: user.email || existing.email,
    photoURL: user.photoURL || null,
    provider,
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
  }): DrawoUserProfile {
    const current = this.getProfile();
    const next: DrawoUserProfile = {
      ...current,
      displayName: updates.displayName?.trim() || current.displayName,
      avatar: updates.avatar || current.avatar,
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

    return next;
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
