"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PROFILE, loadProfile, saveProfile, type UserProfile } from "@/lib/client/profile";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setLoaded(true);
  }, []);

  function onChange(field: keyof UserProfile, value: string) {
    setProfile((p) => ({ ...p, [field]: value }));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: UserProfile = {
      name: profile.name.trim() || DEFAULT_PROFILE.name,
      email: profile.email.trim(),
      phone: profile.phone.trim(),
    };
    saveProfile(next);
    setProfile(next);
    setSaved(true);
    window.dispatchEvent(new CustomEvent("lgb:profile-updated"));
  }

  return (
    <div className="lgb-page-stack max-w-lg">
      <div className="page-hd lgb-page-hd-block">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-sub">Your account details for LabGrownBox.</p>
        </div>
      </div>

      {!loaded ? (
        <p className="page-sub">Loading…</p>
      ) : (
        <form className="profile-form-card" onSubmit={onSubmit}>
          <label className="profile-field">
            <span>Name</span>
            <input
              className="fc"
              value={profile.name}
              onChange={(e) => onChange("name", e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label className="profile-field">
            <span>Email</span>
            <input
              className="fc"
              type="email"
              value={profile.email}
              onChange={(e) => onChange("email", e.target.value)}
              autoComplete="email"
              placeholder="you@labgrownbox.com"
            />
          </label>
          <label className="profile-field">
            <span>Number</span>
            <input
              className="fc"
              type="tel"
              value={profile.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              autoComplete="tel"
              placeholder="+1 (555) 000-0000"
            />
          </label>
          <div className="profile-form-actions">
            <button type="submit" className="btn btn-p">
              Save profile
            </button>
            {saved ? <span className="profile-saved">Saved</span> : null}
          </div>
        </form>
      )}
    </div>
  );
}
