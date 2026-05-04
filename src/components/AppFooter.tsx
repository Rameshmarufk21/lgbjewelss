import { APP_VERSION, copyrightYear } from "@/lib/version";

/**
 * Sticky footer mounted by `src/app/layout.tsx` on every page.
 * Carries the copyright notice, support contact, and the build version
 * (so support requests can reference exactly which release is live).
 */
export function AppFooter() {
  return (
    <footer className="lgb-footer" role="contentinfo">
      <p>
        © {copyrightYear()} LabGrownBox, Inc. All rights reserved. · v{APP_VERSION} ·
        Tech support:{" "}
        <a href="mailto:miravparekhedu@gmail.com">miravparekhedu@gmail.com</a>
      </p>
    </footer>
  );
}
