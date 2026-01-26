/**
 * Core types for Monash Nimbus Reports
 */

export interface Profile {
  name: string;
  displayName: string;
  environment: "UAT" | "Production";
  baseUrl: string;
  hasStoredCredentials: boolean;
  lastUsed?: Date;
  authMode?: AuthMode; // Default to 'apptoken' if not set
}

export type AuthMode = "credential" | "apptoken";

export interface NimbusCredentials {
  baseUrl: string;
  authMode: AuthMode;
  // Credential-based auth
  userId?: number;
  authToken?: string;
  // App Token auth
  appToken?: string;
  username?: string;
}

export interface NimbusAuthResponse {
  UserID: number;
  AuthenticationToken: string;
  Authenticated?: boolean;
}

export interface NimbusAppTokenAuthResponse {
  UserID: number;
  Authenticated: boolean;
  AuthenticationToken?: string;
  Brand?: string;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}
