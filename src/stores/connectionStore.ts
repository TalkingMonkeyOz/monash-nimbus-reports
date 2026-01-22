import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface Connection {
  name: string;
  baseUrl: string;
  environment: "production" | "uat" | "test";
}

export interface SessionCredentials {
  base_url: string;
  user_id: number;
  auth_token: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

interface ConnectionState {
  // Saved connections
  connections: Connection[];
  activeConnectionName: string | null;

  // Session state
  isAuthenticated: boolean;
  session: SessionCredentials | null;

  // Actions
  addConnection: (connection: Connection) => void;
  removeConnection: (name: string) => void;
  setActiveConnection: (name: string | null) => void;
  getActiveConnection: () => Connection | null;

  // Auth actions
  authenticate: (connection: Connection, username: string, password: string) => Promise<void>;
  logout: () => void;

  // Credential storage
  saveLoginCredentials: (connectionName: string, creds: LoginCredentials) => Promise<void>;
  loadLoginCredentials: (connectionName: string) => Promise<LoginCredentials | null>;
  deleteLoginCredentials: (connectionName: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionName: null,
      isAuthenticated: false,
      session: null,

      addConnection: (connection) => {
        set((state) => ({
          connections: [...state.connections.filter(c => c.name !== connection.name), connection],
        }));
      },

      removeConnection: (name) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.name !== name),
          activeConnectionName: state.activeConnectionName === name ? null : state.activeConnectionName,
        }));
      },

      setActiveConnection: (name) => {
        set({ activeConnectionName: name, isAuthenticated: false, session: null });
      },

      getActiveConnection: () => {
        const state = get();
        return state.connections.find((c) => c.name === state.activeConnectionName) || null;
      },

      authenticate: async (connection, username, password) => {
        // Nimbus auth endpoint returns JSON with UserID and AuthenticationToken
        const response = await invoke<{ status: number; body: string }>("execute_rest_post", {
          baseUrl: connection.baseUrl,
          endpoint: "/RESTApi/Authenticate",
          body: { Username: username, Password: password },
        });

        if (response.status === 401) {
          throw new Error("Invalid username or password");
        }
        if (response.status === 403) {
          throw new Error("Access denied. Your network may not be whitelisted.");
        }
        if (response.status !== 200) {
          throw new Error(`Authentication failed with status ${response.status}`);
        }

        // Parse JSON response: {UserID: 123, AuthenticationToken: "xxx", Authenticated: true}
        let authResponse: { UserID: number; AuthenticationToken: string; Authenticated?: boolean };
        try {
          // Check if response is HTML error page
          if (response.body.trim().startsWith("<!") || response.body.includes("<html")) {
            throw new Error("Server returned error page. Check URL and try again.");
          }
          authResponse = JSON.parse(response.body);
        } catch {
          console.error("Auth response body:", response.body);
          throw new Error("Failed to parse authentication response");
        }

        if (!authResponse.UserID || !authResponse.AuthenticationToken) {
          throw new Error("Invalid response - missing UserID or AuthenticationToken");
        }

        const session: SessionCredentials = {
          base_url: connection.baseUrl,
          user_id: authResponse.UserID,
          auth_token: authResponse.AuthenticationToken,
        };

        // Save session credentials to keyring
        await invoke("save_credentials", {
          profileName: connection.name,
          credentials: session,
        });

        set({ isAuthenticated: true, session });
      },

      logout: () => {
        set({ isAuthenticated: false, session: null });
      },

      saveLoginCredentials: async (connectionName, creds) => {
        await invoke("save_login_credentials", {
          profileName: connectionName,
          credentials: creds,
        });
      },

      loadLoginCredentials: async (connectionName) => {
        try {
          return await invoke<LoginCredentials>("load_login_credentials", {
            profileName: connectionName,
          });
        } catch {
          return null;
        }
      },

      deleteLoginCredentials: async (connectionName) => {
        await invoke("delete_login_credentials", {
          profileName: connectionName,
        });
      },
    }),
    {
      name: "monash-nimbus-connections",
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionName: state.activeConnectionName,
      }),
    }
  )
);
