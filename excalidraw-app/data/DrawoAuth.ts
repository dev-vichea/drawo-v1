import { initializeApp, getApps, deleteApp } from "firebase/app";
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
} from "./DrawoWorkspace";

import type { User } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";

import type { DrawoBoardScene, DrawoWorkspaceState } from "./DrawoWorkspace";

export interface DrawoUserProfile {
  uid: string;
  displayName: string;
  email: string;
  avatar: string;
  photoURL?: string | null;
  workspaceName: string;
  role: string;
  provider: "local" | "google" | "github" | "email";
  isCloudAuthenticated: boolean;
  firebaseProjectId?: string;
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

const USER_PROFILE_STORAGE_KEY = "drawo-user-profile-v1";
const CUSTOM_FIREBASE_CONFIG_KEY = "drawo-firebase-config-v1";
const DRAWO_FIREBASE_APP_NAME = "drawo-spark-auth-app";

const DEFAULT_PROJECT_ID = "drawo-e4ac6";

const loadSavedFirebaseConfig = (): FirebaseConfigData | null => {
  try {
    const saved = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  try {
    const envRaw = import.meta.env.VITE_APP_FIREBASE_CONFIG;
    if (envRaw) {
      const parsed = JSON.parse(envRaw);
      // Only use env config if it's not the OSS placeholder project
      if (
        parsed &&
        parsed.apiKey &&
        parsed.projectId &&
        parsed.projectId !== "excalidraw-oss-dev"
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  return null;
};

/**
 * Parses either:
 * 1. Full JS snippet from Firebase Console (`const firebaseConfig = { apiKey: "...", ... }`)
 * 2. JSON object (`{"apiKey": "...", ...}`)
 * 3. Just the raw `AIza...` apiKey string (auto-fills `drawo-e4ac6` project defaults)
 */
export const parseFirebaseConfigInput = (
  rawInput: string,
  defaultProjectId = DEFAULT_PROJECT_ID,
): FirebaseConfigData | null => {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  // Case 1: Raw API key starting with AIza
  if (/^AIza[0-9A-Za-z-_]{30,}$/.test(trimmed)) {
    return {
      apiKey: trimmed,
      authDomain: `${defaultProjectId}.firebaseapp.com`,
      projectId: defaultProjectId,
      storageBucket: `${defaultProjectId}.firebasestorage.app`,
    };
  }

  // Case 2: Try strict JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.apiKey) {
      const pid = parsed.projectId || defaultProjectId;
      return {
        apiKey: parsed.apiKey,
        authDomain: parsed.authDomain || `${pid}.firebaseapp.com`,
        projectId: pid,
        storageBucket: parsed.storageBucket || `${pid}.firebasestorage.app`,
        messagingSenderId: parsed.messagingSenderId,
        appId: parsed.appId,
      };
    }
  } catch {
    // Continue to regex extraction for JS object literal
  }

  // Case 3: Extract key-value pairs from Firebase Console JS snippet
  const extractField = (key: string): string | undefined => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
    const match = trimmed.match(regex);
    return match?.[1];
  };

  const apiKey = extractField("apiKey");
  if (!apiKey) {
    return null;
  }

  const projectId = extractField("projectId") || defaultProjectId;
  return {
    apiKey,
    authDomain: extractField("authDomain") || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket:
      extractField("storageBucket") || `${projectId}.firebasestorage.app`,
    messagingSenderId: extractField("messagingSenderId"),
    appId: extractField("appId"),
  };
};

const loadInitialUserProfile = (): DrawoUserProfile => {
  const collabName = importUsernameFromLocalStorage();
  const fbConfig = loadSavedFirebaseConfig();

  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DrawoUserProfile;
      if (parsed && parsed.displayName) {
        return {
          ...parsed,
          firebaseProjectId: fbConfig?.projectId || DEFAULT_PROJECT_ID,
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    uid: "local-owner",
    displayName: collabName || "Torvalds Unix",
    email: "torvalds@drawo.local",
    avatar: "🐧",
    photoURL: null,
    workspaceName: "drawo",
    role: "Workspace Owner • Admin",
    provider: "local",
    isCloudAuthenticated: false,
    firebaseProjectId: fbConfig?.projectId || DEFAULT_PROJECT_ID,
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
export const isAuthModalOpenAtom = atom<boolean>(false);

let drawoFirebaseApp: FirebaseApp | null = null;
let authUnsubscribe: (() => void) | null = null;

const getOrInitDrawoFirebaseApp = (): FirebaseApp | null => {
  const config = loadSavedFirebaseConfig();
  if (!config || !config.apiKey) {
    return null;
  }

  const existing = getApps().find((a) => a.name === DRAWO_FIREBASE_APP_NAME);
  if (existing) {
    drawoFirebaseApp = existing;
    return existing;
  }

  try {
    drawoFirebaseApp = initializeApp(config, DRAWO_FIREBASE_APP_NAME);
    return drawoFirebaseApp;
  } catch (err) {
    console.error("Failed to initialize Drawo Firebase Spark app:", err);
    return null;
  }
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
    user.email?.split("@")[0] ||
    existing.displayName ||
    "Drawo User";

  return {
    ...existing,
    uid: user.uid,
    displayName,
    email: user.email || existing.email,
    photoURL: user.photoURL || null,
    provider,
    isCloudAuthenticated: true,
    firebaseProjectId:
      loadSavedFirebaseConfig()?.projectId || DEFAULT_PROJECT_ID,
  };
};

export const DrawoAuth = {
  getProfile(): DrawoUserProfile {
    return appJotaiStore.get(drawoAuthAtom);
  },

  getFirebaseConfig(): FirebaseConfigData | null {
    return loadSavedFirebaseConfig();
  },

  isFirebaseConfigured(): boolean {
    const cfg = loadSavedFirebaseConfig();
    return Boolean(cfg && cfg.apiKey && cfg.projectId);
  },

  async saveFirebaseConfig(configInput: string): Promise<FirebaseConfigData> {
    const parsed = parseFirebaseConfigInput(configInput);
    if (!parsed) {
      throw new Error(
        "Could not parse Firebase config. Paste the firebaseConfig object from Firebase Console or your AIza... apiKey.",
      );
    }

    localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(parsed));

    // Re-initialize app if already created
    const existing = getApps().find((a) => a.name === DRAWO_FIREBASE_APP_NAME);
    if (existing) {
      if (authUnsubscribe) {
        authUnsubscribe();
        authUnsubscribe = null;
      }
      await deleteApp(existing);
      drawoFirebaseApp = null;
    }

    this.initAuthListener();

    const current = this.getProfile();
    const updated: DrawoUserProfile = {
      ...current,
      firebaseProjectId: parsed.projectId,
    };
    saveUserProfile(updated);
    appJotaiStore.set(drawoAuthAtom, updated);

    return parsed;
  },

  async clearFirebaseConfig(): Promise<void> {
    localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
    const existing = getApps().find((a) => a.name === DRAWO_FIREBASE_APP_NAME);
    if (existing) {
      if (authUnsubscribe) {
        authUnsubscribe();
        authUnsubscribe = null;
      }
      await deleteApp(existing);
      drawoFirebaseApp = null;
    }
    const current = this.getProfile();
    const next: DrawoUserProfile = {
      ...current,
      provider: "local",
      isCloudAuthenticated: false,
      photoURL: null,
    };
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
  },

  initAuthListener(): void {
    const app = getOrInitDrawoFirebaseApp();
    if (!app || authUnsubscribe) {
      return;
    }

    try {
      const auth = getAuth(app);
      authUnsubscribe = onAuthStateChanged(auth, async (user) => {
        const current = this.getProfile();
        if (user) {
          const next = mapFirebaseUserToProfile(user, current);
          saveUserProfile(next);
          appJotaiStore.set(drawoAuthAtom, next);
          // Pull cloud workspace on login
          await this.pullWorkspaceFromCloud().catch(() => {
            // Firestore might not be enabled yet; ignore silently
          });
        } else if (current.isCloudAuthenticated) {
          const next: DrawoUserProfile = {
            ...current,
            uid: "local-owner",
            provider: "local",
            isCloudAuthenticated: false,
            photoURL: null,
          };
          saveUserProfile(next);
          appJotaiStore.set(drawoAuthAtom, next);
        }
      });
    } catch (err) {
      console.warn("Firebase Auth listener setup skipped:", err);
    }
  },

  updateLocalProfile(
    updates: Partial<
      Pick<
        DrawoUserProfile,
        "displayName" | "email" | "avatar" | "workspaceName" | "role"
      >
    >,
  ): DrawoUserProfile {
    const current = this.getProfile();
    const oldName = current.displayName;
    const next: DrawoUserProfile = {
      ...current,
      ...updates,
      displayName: updates.displayName?.trim() || current.displayName,
      workspaceName: updates.workspaceName?.trim() || current.workspaceName,
    };

    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);

    // Also update Firebase Auth profile if signed in
    const app = getOrInitDrawoFirebaseApp();
    if (app && next.isCloudAuthenticated && updates.displayName) {
      const auth = getAuth(app);
      if (auth.currentUser) {
        updateProfile(auth.currentUser, {
          displayName: next.displayName,
        }).catch(() => {});
      }
    }

    // Update author attribution on boards owned by the user
    if (updates.displayName && updates.displayName.trim() !== oldName) {
      const ws = DrawoWorkspace.getState();
      const updatedBoards = ws.boards.map((b) =>
        !b.author || b.author === oldName || b.author === "Torvalds Unix"
          ? { ...b, author: next.displayName }
          : b,
      );
      const nextWs: DrawoWorkspaceState = {
        ...ws,
        boards: updatedBoards,
      };
      appJotaiStore.set(drawoWorkspaceAtom, nextWs);
    }

    return next;
  },

  async signInWithGoogle(): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    if (!app) {
      throw new Error("Please configure your Firebase Spark API key first.");
    }
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.syncWorkspaceToCloud().catch(() => {});
    return next;
  },

  async signInWithGithub(): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    if (!app) {
      throw new Error("Please configure your Firebase Spark API key first.");
    }
    const auth = getAuth(app);
    const provider = new GithubAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.syncWorkspaceToCloud().catch(() => {});
    return next;
  },

  async signInWithEmail(
    email: string,
    password: string,
  ): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    if (!app) {
      throw new Error("Please configure your Firebase Spark API key first.");
    }
    const auth = getAuth(app);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const next = mapFirebaseUserToProfile(cred.user, this.getProfile());
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.pullWorkspaceFromCloud().catch(() => {});
    return next;
  },

  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
  ): Promise<DrawoUserProfile> {
    const app = getOrInitDrawoFirebaseApp();
    if (!app) {
      throw new Error("Please configure your Firebase Spark API key first.");
    }
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
      displayName: displayName.trim() || this.getProfile().displayName,
    });
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
    await this.syncWorkspaceToCloud().catch(() => {});
    return next;
  },

  async signOut(): Promise<void> {
    const app = getOrInitDrawoFirebaseApp();
    if (app) {
      const auth = getAuth(app);
      await signOut(auth).catch(() => {});
    }
    const current = this.getProfile();
    const next: DrawoUserProfile = {
      ...current,
      uid: "local-owner",
      provider: "local",
      isCloudAuthenticated: false,
      photoURL: null,
    };
    saveUserProfile(next);
    appJotaiStore.set(drawoAuthAtom, next);
  },

  /**
   * Syncs workspace metadata and board scenes to Cloud Firestore (100% Spark Free Tier).
   */
  async syncWorkspaceToCloud(): Promise<void> {
    const app = getOrInitDrawoFirebaseApp();
    const profile = this.getProfile();
    if (!app || !profile.isCloudAuthenticated || !profile.uid) {
      throw new Error(
        "Sign in with Firebase first to sync to Cloud Firestore.",
      );
    }

    const db = getFirestore(app);
    const ws = DrawoWorkspace.getState();
    const now = Date.now();

    // 1. Save workspace metadata document
    const metaRef = doc(db, "users", profile.uid, "workspace", "meta");
    await setDoc(
      metaRef,
      {
        activeBoardId: ws.activeBoardId,
        boards: ws.boards,
        collections: ws.collections,
        workspaceName: profile.workspaceName,
        updatedAt: now,
      },
      { merge: true },
    );

    // 2. Save board scenes (up to 15 most recent boards to stay conservative on daily Spark writes)
    const boardsToSync = [...ws.boards]
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
      lastSyncedAt: now,
    };
    saveUserProfile(nextProfile);
    appJotaiStore.set(drawoAuthAtom, nextProfile);
  },

  /**
   * Pulls workspace metadata and board scenes from Cloud Firestore into local IndexedDB.
   */
  async pullWorkspaceFromCloud(): Promise<boolean> {
    const app = getOrInitDrawoFirebaseApp();
    const profile = this.getProfile();
    if (!app || !profile.isCloudAuthenticated || !profile.uid) {
      return false;
    }

    const db = getFirestore(app);
    const metaRef = doc(db, "users", profile.uid, "workspace", "meta");
    const snap = await getDoc(metaRef);

    if (!snap.exists()) {
      // First login: push local workspace to cloud
      await this.syncWorkspaceToCloud();
      return true;
    }

    const cloudData = snap.data();
    if (cloudData && Array.isArray(cloudData.boards)) {
      const boardsCol = collection(db, "users", profile.uid, "boards");
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
            // ignore malformed JSON
          }
        }
      }

      const currentWs = DrawoWorkspace.getState();
      const mergedBoards = [...cloudData.boards];
      for (const localBoard of currentWs.boards) {
        if (!mergedBoards.some((b: any) => b.id === localBoard.id)) {
          mergedBoards.push(localBoard);
        }
      }

      const nextWs: DrawoWorkspaceState = {
        activeBoardId: cloudData.activeBoardId || currentWs.activeBoardId,
        boards: mergedBoards,
        collections: Array.isArray(cloudData.collections)
          ? cloudData.collections
          : currentWs.collections,
      };
      appJotaiStore.set(drawoWorkspaceAtom, nextWs);
      localStorage.setItem("drawo-workspace-meta-v1", JSON.stringify(nextWs));

      const nextProfile: DrawoUserProfile = {
        ...profile,
        workspaceName: cloudData.workspaceName || profile.workspaceName,
        lastSyncedAt: Date.now(),
      };
      saveUserProfile(nextProfile);
      appJotaiStore.set(drawoAuthAtom, nextProfile);
      return true;
    }

    return false;
  },
};
