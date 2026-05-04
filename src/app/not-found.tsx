import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="lgb-status-page">
      <h1>Page not found</h1>
      <p>The page you requested does not exist or may have moved.</p>
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
