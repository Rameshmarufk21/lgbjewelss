"use client";

import { useEffect, useState } from "react";
import { loadCompanies, saveCompanies, type Company } from "@/lib/companies";

export default function SettingsPage() {
  const [makers, setMakers] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [version, setVersion] = useState<string>("");
  const [geminiMsg, setGeminiMsg] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesSaved, setCompaniesSaved] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Record<string, { set: boolean; source: string }>>({});
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState("");
  const [role, setRole] = useState<string>("user");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function changeMyPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("Saving…");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPwMsg(data.error || "Could not change password");
        return;
      }
      setPwMsg("Password changed ✓");
      setCurPw("");
      setNewPw("");
    } catch {
      setPwMsg("Could not reach server");
    }
  }
  const [users, setUsers] = useState<{ username: string; role: string; createdAt: string }[]>([]);
  const [nu, setNu] = useState<{ username: string; password: string; role: string }>({ username: "", password: "", role: "user" });
  const [userMsg, setUserMsg] = useState("");

  const isAdmin = role === "admin";

  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as { role?: string };
      if (data.role) setRole(data.role);
    } catch {
      /* ignore */
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch("/api/settings/users");
      if (!res.ok) return;
      const data = (await res.json()) as { users?: { username: string; role: string; createdAt: string }[] };
      setUsers(data.users ?? []);
    } catch {
      /* ignore */
    }
  }

  async function addUserAccount() {
    setUserMsg("Saving…");
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nu),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; users?: typeof users };
      if (!res.ok || !data.ok) {
        setUserMsg(data.error || "Could not add user");
        return;
      }
      setUserMsg(`Added ${nu.username} ✓`);
      setNu({ username: "", password: "", role: "user" });
      if (data.users) setUsers(data.users);
    } catch {
      setUserMsg("Could not reach server");
    }
  }

  async function resetPassword(username: string) {
    const pw = prompt(`New password for ${username}:`);
    if (!pw) return;
    const res = await fetch("/api/settings/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pw }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setUserMsg(res.ok && data.ok ? `Password reset for ${username} ✓` : data.error || "Failed");
  }

  async function removeUserAccount(username: string) {
    if (!confirm(`Remove user ${username}?`)) return;
    const res = await fetch(`/api/settings/users?username=${encodeURIComponent(username)}`, { method: "DELETE" });
    const data = (await res.json()) as { ok?: boolean; error?: string; users?: typeof users };
    if (!res.ok || !data.ok) {
      setUserMsg(data.error || "Could not remove user");
      return;
    }
    setUserMsg(`Removed ${username}`);
    if (data.users) setUsers(data.users);
  }

  async function loadKeyStatus() {
    try {
      const res = await fetch("/api/settings/keys");
      if (!res.ok) return;
      const data = (await res.json()) as { keys?: Record<string, { set: boolean; source: string }> };
      setKeyStatus(data.keys ?? {});
    } catch {
      /* ignore */
    }
  }

  async function saveKey(service: "gemini" | "groq", value: string) {
    setKeyMsg("Saving…");
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setKeyMsg(data.error || "Could not save key");
        return;
      }
      setKeyMsg(value.trim() ? `${service} key saved ✓` : `${service} key cleared`);
      if (service === "gemini") setGeminiKeyInput("");
      else setGroqKeyInput("");
      void loadKeyStatus();
    } catch {
      setKeyMsg("Could not reach server");
    }
  }

  function updateCompany(id: string, patch: Partial<Company>) {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setCompaniesSaved(false);
  }

  function persistCompanies() {
    saveCompanies(companies);
    setCompaniesSaved(true);
    window.dispatchEvent(new CustomEvent("lgb:companies-updated"));
  }

  async function loadMakers() {
    try {
      const res = await fetch("/api/makers");
      if (!res.ok) {
        setMakers([]);
        return;
      }
      const text = await res.text();
      if (!text) {
        setMakers([]);
        return;
      }
      const data = JSON.parse(text) as { makers?: { id: string; name: string }[] };
      setMakers(data.makers ?? []);
    } catch {
      setMakers([]);
    }
  }

  useEffect(() => {
    void loadMakers();
    void loadKeyStatus();
    void loadMe();
    void loadUsers();
    setCompanies(loadCompanies());
    void (async () => {
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const v = (await res.json()) as { name?: string; version?: string };
        setVersion(`${v.name ?? "app"}@${v.version ?? "?"}`);
      } catch {
        setVersion("");
      }
    })();
    try {
      localStorage.removeItem("lgb_gemini_key");
    } catch {
      /* ignore */
    }
  }, []);

  async function testGemini() {
    setGeminiMsg("Testing…");
    const res = await fetch("/api/extraction/gemini-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; detail?: string; model?: string };
    if (j.ok) setGeminiMsg(`Gemini responded OK (model ${j.model ?? "?"}).`);
    else
      setGeminiMsg(
        `Failed: ${j.error ?? res.statusText}${j.detail ? ` — ${String(j.detail).slice(0, 160)}` : ""}`,
      );
  }

  async function addMaker(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      let msg = res.statusText || "Failed";
      try {
        const text = await res.text();
        if (text) {
          const err = JSON.parse(text) as { error?: string };
          if (err.error) msg = err.error;
        }
      } catch {
        /* keep statusText */
      }
      alert(msg);
      return;
    }
    setName("");
    await loadMakers();
  }

  return (
    <div className="lgb-page-stack mx-auto max-w-2xl">
      <div className="lgb-page-hd-block">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="lgb-section">
        <h2>My account{role ? ` · ${role}` : ""}</h2>
        <form className="mt-3 fg2" onSubmit={changeMyPassword}>
          <label className="payment-field">
            <span>Current password</span>
            <input className="fc" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="payment-field">
            <span>New password</span>
            <input className="fc" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <div className="mt-3 flex items-center gap-3" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-p" disabled={!curPw || newPw.length < 6}>Change password</button>
            {pwMsg ? <span className="text-xs text-[var(--text2)]">{pwMsg}</span> : null}
          </div>
        </form>
      </section>

      <section className="lgb-section">
        <h2>Companies</h2>
        <p className="mt-1 text-xs lgb-muted">
          These names, colors, and details drive the company sections, dashboard/statement toggles, and the
          letterhead on printed memos &amp; statements.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {companies.map((c) => (
            <div key={c.id} className="lgb-company-card">
              <div className="lgb-company-card-hd">
                <span className="lgb-company-dot" style={{ background: c.accent }} />
                <strong>{c.name || c.id}</strong>
              </div>
              <div className="fg2 mt-3">
                <label className="payment-field">
                  <span>Display name</span>
                  <input className="fc" value={c.name} onChange={(e) => updateCompany(c.id, { name: e.target.value })} />
                </label>
                <label className="payment-field">
                  <span>Short label (toggles)</span>
                  <input className="fc" value={c.short} onChange={(e) => updateCompany(c.id, { short: e.target.value })} />
                </label>
                <label className="payment-field">
                  <span>Tax / GST ID</span>
                  <input
                    className="fc"
                    value={c.taxId ?? ""}
                    onChange={(e) => updateCompany(c.id, { taxId: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <label className="payment-field">
                  <span>Accent color</span>
                  <input
                    className="fc"
                    type="color"
                    value={c.accent}
                    onChange={(e) => updateCompany(c.id, { accent: e.target.value })}
                    style={{ height: 38, padding: 4 }}
                  />
                </label>
                <label className="payment-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Logo URL (for letterhead)</span>
                  <input
                    className="fc"
                    value={c.logo ?? ""}
                    onChange={(e) => updateCompany(c.id, { logo: e.target.value })}
                    placeholder="/lgb/nav-logo.png or https://…"
                  />
                </label>
                <label className="payment-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Address</span>
                  <input
                    className="fc"
                    value={c.address ?? ""}
                    onChange={(e) => updateCompany(c.id, { address: e.target.value })}
                    placeholder="Street, City, State ZIP"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn btn-p" onClick={persistCompanies}>
            Save companies
          </button>
          {companiesSaved ? <span className="text-xs" style={{ color: "var(--success)" }}>Saved ✓</span> : null}
        </div>
      </section>

      <section className="lgb-section">
        <h2>Version</h2>
        <p className="mt-2 font-mono text-sm text-[var(--text)]">{version || "…"}</p>
      </section>

      <section className="lgb-section">
        <h2>Makers</h2>
        <form onSubmit={addMaker} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Maker name"
            className="fc flex-1 text-sm"
            required
          />
          <button type="submit" className="btn btn-p shrink-0">
            Add
          </button>
        </form>
        <ul className="mt-4 space-y-1 text-sm text-[var(--text2)]">
          {makers.map((m) => (
            <li key={m.id} className="lgb-row flex justify-between px-2 py-1">
              <span>{m.name}</span>
              <button
                type="button"
                className="text-xs text-[var(--danger)] hover:underline"
                onClick={async () => {
                  if (!confirm(`Delete maker ${m.name}?`)) return;
                  await fetch(`/api/makers?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
                  await loadMakers();
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin ? (
      <section className="lgb-section">
        <h2>AI keys (admin)</h2>
        <p className="mt-1 text-xs lgb-muted">
          Powers AI invoice parsing. Keys are stored <strong>encrypted on the server</strong> — never in the browser
          and never shown again after saving. With login enabled, only the signed-in admin can open Settings. Get a free
          Gemini key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
          .
        </p>

        <div className="mt-4 fg2">
          <label className="payment-field" style={{ gridColumn: "1 / -1" }}>
            <span>
              Gemini API key{" "}
              <span className="lgb-key-status">
                {keyStatus.gemini?.set
                  ? `· saved (${keyStatus.gemini.source === "env" ? "from env" : "stored"})`
                  : "· not set"}
              </span>
            </span>
            <div className="lgb-key-row">
              <input
                className="fc"
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder={keyStatus.gemini?.set ? "•••••••• (saved — paste to replace)" : "Paste Gemini key"}
                autoComplete="off"
              />
              <button type="button" className="btn btn-p" onClick={() => void saveKey("gemini", geminiKeyInput)} disabled={!geminiKeyInput.trim()}>
                Save
              </button>
              {keyStatus.gemini?.set && keyStatus.gemini.source === "stored" ? (
                <button type="button" className="btn btn-g" onClick={() => void saveKey("gemini", "")}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>

          <label className="payment-field" style={{ gridColumn: "1 / -1" }}>
            <span>
              Groq API key (optional fallback){" "}
              <span className="lgb-key-status">{keyStatus.groq?.set ? "· saved" : "· not set"}</span>
            </span>
            <div className="lgb-key-row">
              <input
                className="fc"
                type="password"
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                placeholder="Paste Groq key (optional)"
                autoComplete="off"
              />
              <button type="button" className="btn btn-p" onClick={() => void saveKey("groq", groqKeyInput)} disabled={!groqKeyInput.trim()}>
                Save
              </button>
              {keyStatus.groq?.set && keyStatus.groq.source === "stored" ? (
                <button type="button" className="btn btn-g" onClick={() => void saveKey("groq", "")}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="btn btn-g" onClick={() => void testGemini()}>
            Test Gemini
          </button>
          {keyMsg ? <span className="text-xs text-[var(--text2)]">{keyMsg}</span> : null}
          {geminiMsg ? <span className="text-xs text-[var(--text2)]">{geminiMsg}</span> : null}
        </div>
      </section>
      ) : null}

      {isAdmin ? (
        <section className="lgb-section">
          <h2>Users (admin)</h2>
          <p className="mt-1 text-xs lgb-muted">
            Accounts that can sign in. Admins can manage users &amp; AI keys; users can&apos;t. New users get the
            password you set here.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {users.map((u) => (
              <li key={u.username} className="lgb-row flex items-center justify-between px-2 py-1">
                <span>
                  <strong>{u.username}</strong>{" "}
                  <span className="lgb-key-status">· {u.role}</span>
                </span>
                <span className="flex gap-3">
                  <button type="button" className="text-xs text-[var(--peacock)] hover:underline" onClick={() => void resetPassword(u.username)}>
                    Reset password
                  </button>
                  <button type="button" className="text-xs text-[var(--danger)] hover:underline" onClick={() => void removeUserAccount(u.username)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 fg2">
            <label className="payment-field">
              <span>New username</span>
              <input className="fc" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} placeholder="e.g. Priya" />
            </label>
            <label className="payment-field">
              <span>Temporary password</span>
              <input className="fc" type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="they can change later" />
            </label>
            <label className="payment-field">
              <span>Role</span>
              <select className="fc" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className="btn btn-p" onClick={() => void addUserAccount()} disabled={!nu.username.trim() || !nu.password.trim()}>
              Add user
            </button>
            {userMsg ? <span className="text-xs text-[var(--text2)]">{userMsg}</span> : null}
          </div>
        </section>
      ) : null}

    </div>
  );
}
