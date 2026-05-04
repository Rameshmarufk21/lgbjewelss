/**
 * Single source of truth for the app's release version.
 *
 * Bump on every production deploy. The footer reads this so users (and
 * support) can quickly tell which build is live without checking GitHub.
 *
 * Convention: semver — `MAJOR.MINOR.PATCH`.
 *   - PATCH: bug fix, no schema change
 *   - MINOR: new feature, backwards-compatible
 *   - MAJOR: breaking change (schema migration, removed feature)
 */
export const APP_VERSION = "1.0.0";

/** Year used in the copyright notice — updates automatically each Jan 1. */
export function copyrightYear(): number {
  return new Date().getFullYear();
}
