/**
 * Profile Manager
 * Handles profile persistence to localStorage
 */

import type { Profile } from "./types";

const STORAGE_KEY = "monash-nimbus-profiles";

export class ProfileManager {
  static loadProfiles(): Profile[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const profiles = JSON.parse(stored) as Profile[];
      return profiles.map((profile) => ({
        ...profile,
        lastUsed: profile.lastUsed ? new Date(profile.lastUsed) : undefined,
      }));
    } catch (error) {
      console.error("Failed to load profiles:", error);
      return [];
    }
  }

  static saveProfile(profile: Profile): void {
    try {
      const profiles = this.loadProfiles();
      const filtered = profiles.filter((p) => p.name !== profile.name);
      const updated = [...filtered, { ...profile, lastUsed: new Date() }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to save profile:", error);
      throw new Error("Failed to save profile");
    }
  }

  static deleteProfile(name: string): void {
    try {
      const profiles = this.loadProfiles();
      const filtered = profiles.filter((p) => p.name !== name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Failed to delete profile:", error);
      throw new Error("Failed to delete profile");
    }
  }

  static getProfile(name: string): Profile | null {
    const profiles = this.loadProfiles();
    return profiles.find((p) => p.name === name) || null;
  }

  static updateLastUsed(name: string): void {
    const profile = this.getProfile(name);
    if (profile) {
      this.saveProfile({ ...profile, lastUsed: new Date() });
    }
  }

  static markCredentialsStored(name: string, hasCredentials: boolean): void {
    const profile = this.getProfile(name);
    if (profile) {
      this.saveProfile({ ...profile, hasStoredCredentials: hasCredentials });
    }
  }
}
