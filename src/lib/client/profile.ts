export type UserProfile = {
  name: string;
  email: string;
  phone: string;
};

const STORAGE_KEY = "lgb_profile";

export const DEFAULT_PROFILE: UserProfile = {
  name: "Mirav",
  email: "",
  phone: "",
};

export function loadProfile(): UserProfile {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      name: String(parsed.name ?? DEFAULT_PROFILE.name).trim() || DEFAULT_PROFILE.name,
      email: String(parsed.email ?? "").trim(),
      phone: String(parsed.phone ?? "").trim(),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: UserProfile): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
