/** Edge-safe auth config (no Node built-ins). Used by middleware. */

export const SESSION_COOKIE = "lgb_session";

export function isAuthEnabled(): boolean {
  return process.env.LGB_AUTH_ENABLED === "true";
}

export function getAuthSecret(): string {
  const secret = process.env.LGB_AUTH_SECRET?.trim();
  if (isAuthEnabled()) {
    if (!secret || secret.length < 16) {
      throw new Error("LGB_AUTH_SECRET must be set (min 16 chars) when LGB_AUTH_ENABLED=true");
    }
    return secret;
  }
  return secret || "lgb-dev-secret-change-in-production";
}
