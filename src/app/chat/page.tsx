"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, ImagePlus, Mic, Trash2 } from "lucide-react";

type ChatMessage = {
  seq: number;
  id: string;
  user: string;
  kind: "text" | "image" | "audio";
  text?: string;
  mediaId?: string;
  mediaMime?: string;
  createdAt: string;
  mine?: boolean;
};

const SEEN_KEY = "lgb_chat_seen";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Resize a photo client-side so uploads stay small. */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const lastSeqRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const atBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const markSeen = useCallback((seq: number) => {
    try {
      window.localStorage.setItem(SEEN_KEY, String(seq));
      window.dispatchEvent(new CustomEvent("lgb:chat-seen"));
    } catch {
      /* ignore */
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/messages?after=${lastSeqRef.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[]; lastSeq: number; me: string };
      if (data.me) setMe(data.me);
      if (data.messages.length) {
        const stick = atBottom();
        setMessages((prev) => [...prev, ...data.messages]);
        if (stick) requestAnimationFrame(() => scrollToBottom(true));
      }
      lastSeqRef.current = data.lastSeq;
      markSeen(data.lastSeq);
    } catch {
      /* offline / transient — keep polling */
    }
  }, [markSeen]);

  // Initial load
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        const data = (await res.json()) as { messages: ChatMessage[]; lastSeq: number; me: string };
        setMe(data.me || "");
        setMessages(data.messages || []);
        lastSeqRef.current = data.lastSeq || 0;
        markSeen(data.lastSeq || 0);
        requestAnimationFrame(() => scrollToBottom(false));
      } catch {
        setError("Could not load messages");
      }
    })();
  }, [markSeen]);

  // Polling loop (pauses when tab hidden)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 3000);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error || "Send failed");
        return;
      }
      setMessages((prev) => [...prev, data.message!]);
      lastSeqRef.current = Math.max(lastSeqRef.current, data.message.seq);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch {
      setError("Could not reach server");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBlob(blob: Blob, filename: string) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const res = await fetch("/api/chat/media", { method: "POST", body: fd });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error || "Upload failed");
        return;
      }
      setMessages((prev) => [...prev, data.message!]);
      lastSeqRef.current = Math.max(lastSeqRef.current, data.message.seq);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch {
      setError("Could not upload");
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const blob = await compressImage(file);
    await uploadBlob(blob, "photo.jpg");
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported on this device/browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        if (blob.size > 0) void uploadBlob(blob, `voice.${ext}`);
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setError("Microphone permission denied");
    }
  }

  function stopRecording(cancel = false) {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    setRecording(false);
    const mr = recRef.current;
    recRef.current = null;
    if (!mr) return;
    if (cancel) mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    mr.stop();
  }

  useEffect(() => () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  return (
    <div className="chat-page">
      <div className="chat-head">
        <h1 className="page-title">Team chat</h1>
        <p className="page-sub">Group chat · photos &amp; voice notes</p>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet — say hello 👋</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-row${m.mine ? " mine" : ""}`}>
              <div className="chat-bubble">
                {!m.mine ? <div className="chat-author">{m.user}</div> : null}
                {m.kind === "image" && m.mediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-gated media route
                  <img className="chat-img" src={`/api/chat/media/${m.mediaId}`} alt="photo" loading="lazy" />
                ) : null}
                {m.kind === "audio" && m.mediaId ? (
                  <audio className="chat-audio" controls preload="none" src={`/api/chat/media/${m.mediaId}`} />
                ) : null}
                {m.text ? <div className="chat-text">{m.text}</div> : null}
                <div className="chat-time">{fmtTime(m.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {error ? <div className="chat-error">{error}</div> : null}

      {recording ? (
        <div className="chat-recording">
          <span className="chat-rec-dot" /> Recording… {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
          <button type="button" className="btn btn-g btn-sm" onClick={() => stopRecording(true)}>
            <Trash2 size={14} /> Cancel
          </button>
          <button type="button" className="btn btn-p btn-sm" onClick={() => stopRecording(false)}>
            <Send size={14} /> Send
          </button>
        </div>
      ) : (
        <form className="chat-input" onSubmit={sendText}>
          <button type="button" className="chat-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Add photo" disabled={busy}>
            <ImagePlus size={20} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickPhoto} />
          <input
            className="fc chat-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            autoComplete="off"
          />
          {text.trim() ? (
            <button type="submit" className="chat-icon-btn chat-send" aria-label="Send" disabled={busy}>
              <Send size={20} />
            </button>
          ) : (
            <button type="button" className="chat-icon-btn chat-mic" onClick={() => void startRecording()} aria-label="Record voice note" disabled={busy}>
              <Mic size={20} />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
