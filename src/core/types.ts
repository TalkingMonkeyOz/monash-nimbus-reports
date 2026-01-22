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
}

export interface NimbusCredentials {
  baseUrl: string;
  userId: number;
  authToken: string;
}

export interface NimbusAuthResponse {
  UserID: number;
  AuthenticationToken: string;
  Authenticated?: boolean;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}
