/**
 * Authentication Service
 * Handles Nimbus authentication and credential management
 */

import { invoke } from "@tauri-apps/api/core";
import type { NimbusCredentials, NimbusAuthResponse, NimbusAppTokenAuthResponse, HttpResponse } from "./types";

interface TauriCredentials {
  base_url: string;
  auth_mode: "credential" | "apptoken";
  // Credential-based
  user_id?: number;
  auth_token?: string;
  // App Token based
  app_token?: string;
  username?: string;
}

interface TauriLoginCredentials {
  username: string;
  password: string;
}

interface TauriAppTokenCredentials {
  app_token: string;
  username: string;
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
      authMode: "credential",
      userId: authResponse.UserID,
      authToken: authResponse.AuthenticationToken,
    };
  }

  /**
   * Authenticate with Nimbus using App Token
   * Per Nimbus API Guide: POST /Authenticate?task=AuthenticateApp
   */
  static async authenticateWithAppToken(
    baseUrl: string,
    appToken: string,
    username: string
  ): Promise<NimbusCredentials> {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, "");
    const authUrl = `${normalizedBaseUrl}/RESTApi/Authenticate?task=AuthenticateApp`;

    console.log("Authenticating with App Token to:", authUrl);

    const response = await invoke<HttpResponse>("execute_rest_post", {
      url: authUrl,
      body: {
        AppToken: appToken,
        Username: username,
        UsernameSource: "Fixed",
        AppName: "MonashNimbusReports",
      },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      userId: null,
      authToken: null,
      timeoutSeconds: 30,
    });

    console.log("App Token auth response status:", response.status);

    if (response.status === 401) {
      throw new Error("Invalid App Token or Username");
    }
    if (response.status === 403) {
      throw new Error("Access denied. App Token may be restricted by IP or permissions.");
    }
    if (response.status !== 200) {
      throw new Error(`App Token authentication failed with status ${response.status}`);
    }

    // Check for HTML error page
    const body = response.body.trim();
    if (body.startsWith("<!") || body.startsWith("<html")) {
      if (body.includes("denied") || body.includes("403")) {
        throw new Error("Access denied. Check App Token configuration.");
      }
      throw new Error("Server returned error page. Check URL.");
    }

    let authResponse: NimbusAppTokenAuthResponse;
    try {
      authResponse = JSON.parse(response.body);
    } catch {
      console.error("Failed to parse App Token auth response:", response.body.substring(0, 500));
      throw new Error("Invalid response from Nimbus server");
    }

    if (!authResponse.Authenticated) {
      throw new Error("App Token authentication failed - not authenticated");
    }

    return {
      baseUrl: normalizedBaseUrl,
      authMode: "apptoken",
      appToken: appToken,
      username: username,
      userId: authResponse.UserID,
    };
  }

  /**
   * Test connection by querying a simple OData endpoint
   * Works with both credential-based and App Token auth modes
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
        // Credential-based auth
        userId: credentials.authMode === "credential" ? credentials.userId : null,
        authToken: credentials.authMode === "credential" ? credentials.authToken : null,
        // App Token auth
        appToken: credentials.authMode === "apptoken" ? credentials.appToken : null,
        username: credentials.authMode === "apptoken" ? credentials.username : null,
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
   * Supports both credential-based and App Token auth modes
   */
  static async saveCredentialsToKeyring(
    profileName: string,
    credentials: NimbusCredentials
  ): Promise<void> {
    const tauriCredentials: TauriCredentials = {
      base_url: credentials.baseUrl,
      auth_mode: credentials.authMode,
      user_id: credentials.userId,
      auth_token: credentials.authToken,
      app_token: credentials.appToken,
      username: credentials.username,
    };

    await invoke("save_credentials", { profileName, credentials: tauriCredentials });
  }

  /**
   * Load session credentials from Windows Credential Manager
   * Returns credentials with appropriate auth mode
   */
  static async loadCredentialsFromKeyring(profileName: string): Promise<NimbusCredentials | null> {
    try {
      const tauriCredentials = await invoke<TauriCredentials>("load_credentials", { profileName });
      return {
        baseUrl: tauriCredentials.base_url,
        authMode: tauriCredentials.auth_mode || "credential", // Default for backward compat
        userId: tauriCredentials.user_id,
        authToken: tauriCredentials.auth_token,
        appToken: tauriCredentials.app_token,
        username: tauriCredentials.username,
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
   * Save App Token credentials
   */
  static async saveAppTokenCredentials(
    profileName: string,
    appToken: string,
    username: string
  ): Promise<void> {
    const appTokenCredentials: TauriAppTokenCredentials = { app_token: appToken, username };
    await invoke("save_apptoken_credentials", { profileName, credentials: appTokenCredentials });
  }

  /**
   * Load App Token credentials
   */
  static async loadAppTokenCredentials(
    profileName: string
  ): Promise<{ appToken: string; username: string } | null> {
    try {
      const creds = await invoke<TauriAppTokenCredentials>("load_apptoken_credentials", { profileName });
      return { appToken: creds.app_token, username: creds.username };
    } catch {
      return null;
    }
  }

  /**
   * Delete App Token credentials
   */
  static async deleteAppTokenCredentials(profileName: string): Promise<void> {
    try {
      await invoke("delete_apptoken_credentials", { profileName });
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
