"use client";

import Link from "next/link";

export default function GlobalErrorPage() {
  return (
    <section className="lgb-status-page">
      <h1>Something went wrong</h1>
      <p>Try refreshing this page. If the issue continues, contact technical support.</p>
      <div className="lgb-status-actions">
        <Link href="/" className="btn btn-p">
          Go to home
        </Link>
        <a className="btn btn-g" href="mailto:miravparekhedu@gmail.com">
          Contact support
        </a>
      </div>
    </section>
  );
}
