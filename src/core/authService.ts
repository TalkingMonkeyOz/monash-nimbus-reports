/**
 * Authentication Service
 * Handles Nimbus authentication and credential management
 */

import { invoke } from "@tauri-apps/api/core";
import type { NimbusCredentials, NimbusAuthResponse, HttpResponse } from "./types";

interface TauriCredentials {
  base_url: string;
  user_id: number;
  auth_token: string;
}

interface TauriLoginCredentials {
  username: string;
  password: string;
}

export class AuthService {
  /**
   * Authenticate with Nimbus server
   */
  static async authenticateWithNimbus(
    baseUrl: string,
    username: string,
    password: string
  ): Promise<NimbusCredentials> {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, "");
    const authUrl = `${normalizedBaseUrl}/RESTApi/Authenticate`;

    console.log("Authenticating to:", authUrl);

    const response = await invoke<HttpResponse>("execute_rest_post", {
      url: authUrl,
      body: { Username: username, Password: password },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      userId: null,
      authToken: null,
      timeoutSeconds: 30,
    });

    console.log("Auth response status:", response.status);

    if (response.status === 401) {
      throw new Error("Invalid username or password");
    }
    if (response.status === 403) {
      throw new Error("Access denied. Your network may not be whitelisted.");
    }
    if (response.status !== 200) {
      throw new Error(`Authentication failed with status ${response.status}`);
    }

    // Check for HTML error page
    const body = response.body.trim();
    if (body.startsWith("<!") || body.startsWith("<html")) {
      if (body.includes("denied") || body.includes("403")) {
        throw new Error("Access denied. Check network whitelist.");
      }
      throw new Error("Server returned error page. Check URL.");
    }

    let authResponse: NimbusAuthResponse;
    try {
      authResponse = JSON.parse(response.body);
    } catch {
      console.error("Failed to parse auth response:", response.body.substring(0, 500));
      throw new Error("Invalid response from Nimbus server");
    }

    if (!authResponse.UserID || !authResponse.AuthenticationToken) {
      throw new Error("Invalid response - missing UserID or AuthenticationToken");
    }

    return {
      baseUrl: normalizedBaseUrl,
      userId: authResponse.UserID,
      authToken: authResponse.AuthenticationToken,
    };
  }

  /**
   * Test connection by querying a simple OData endpoint
   */
  static async testConnection(credentials: NimbusCredentials): Promise<boolean> {
    try {
      const response = await invoke<unknown>("execute_odata_query", {
        baseUrl: credentials.baseUrl,
        entity: "User",
        top: 1,
        filter: "",
        select: "Id",
        orderby: "",
        userId: credentials.userId,
        authToken: credentials.authToken,
      });

      if (Array.isArray(response)) return response.length > 0;
      if (response && typeof response === "object" && "value" in response) {
        return Array.isArray((response as { value: unknown[] }).value);
      }
      return false;
    } catch (error) {
      console.error("Connection test failed:", error);
      return false;
    }
  }

  /**
   * Save session credentials to Windows Credential Manager
   */
  static async saveCredentialsToKeyring(
    profileName: string,
    credentials: NimbusCredentials
  ): Promise<void> {
    const tauriCredentials: TauriCredentials = {
      base_url: credentials.baseUrl,
      user_id: credentials.userId,
      auth_token: credentials.authToken,
    };

    await invoke("save_credentials", { profileName, credentials: tauriCredentials });
  }

  /**
   * Load session credentials from Windows Credential Manager
   */
  static async loadCredentialsFromKeyring(profileName: string): Promise<NimbusCredentials | null> {
    try {
      const tauriCredentials = await invoke<TauriCredentials>("load_credentials", { profileName });
      return {
        baseUrl: tauriCredentials.base_url,
        userId: tauriCredentials.user_id,
        authToken: tauriCredentials.auth_token,
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete session credentials from Windows Credential Manager
   */
  static async deleteCredentialsFromKeyring(profileName: string): Promise<void> {
    try {
      await invoke("delete_credentials", { profileName });
    } catch {
      // Ignore - credentials may not exist
    }
  }

  /**
   * Save login credentials (username/password)
   */
  static async saveLoginCredentials(
    profileName: string,
    username: string,
    password: string
  ): Promise<void> {
    const loginCredentials: TauriLoginCredentials = { username, password };
    await invoke("save_login_credentials", { profileName, credentials: loginCredentials });
  }

  /**
   * Load login credentials
   */
  static async loadLoginCredentials(
    profileName: string
  ): Promise<{ username: string; password: string } | null> {
    try {
      const creds = await invoke<TauriLoginCredentials>("load_login_credentials", { profileName });
      return { username: creds.username, password: creds.password };
    } catch {
      return null;
    }
  }

  /**
   * Delete login credentials
   */
  static async deleteLoginCredentials(profileName: string): Promise<void> {
    try {
      await invoke("delete_login_credentials", { profileName });
    } catch {
      // Ignore
    }
  }

  /**
   * Validate URL format
   */
  static validateUrl(url: string): boolean {
    try {
      const normalized = url.trim().replace(/\/$/, "");
      const urlObj = new URL(normalized);
      return urlObj.protocol === "http:" || urlObj.protocol === "https:";
    } catch {
      return false;
    }
  }
}
