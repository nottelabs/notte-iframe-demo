"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Smooth indeterminate progress: ramp toward 92% asymptotically while loading,
  // then jump to 100% once the session is ready.
  useEffect(() => {
    if (loading) {
      setProgress(4);
      progressTimer.current = setInterval(() => {
        setProgress((p) => p + (92 - p) * 0.07);
      }, 120);
    } else if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 400);
      return () => clearTimeout(t);
    }
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [loading]);

  async function startSession() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start session");
      setSessionId(data.sessionId);
      setViewerUrl(data.viewerUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function stopSession() {
    if (!sessionId) return;
    setLoading(true);
    try {
      await fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } finally {
      setSessionId(null);
      setViewerUrl(null);
      setLoading(false);
    }
  }

  // Skip the broken `console.notte.cc/static/viewer` wrapper (its embed-minimal
  // mode uses h-full which collapses inside an iframe) and point straight at
  // the underlying CDP inspector. The wrapper is just an authentication shim
  // that appends the JWT to the WS URL — we replicate that here.
  const embeddedUrl = (() => {
    if (!viewerUrl) return null;
    try {
      const u = new URL(viewerUrl);
      const ws = u.searchParams.get("ws");
      const jwt = u.searchParams.get("jwt");
      if (!ws || !jwt) return viewerUrl;
      const wsUrl = new URL(ws);
      const wsPath = wsUrl.pathname.replace(/\/debug\/recording$/, "/debug");
      const wsValue = `${wsUrl.host}${wsPath}?token=${jwt}`;
      const wsParam = wsUrl.protocol === "wss:" ? "wss" : "ws";
      return `${u.origin}/cdp-viewer/inspector.html?${wsParam}=${encodeURIComponent(wsValue)}&interactive=true`;
    } catch {
      return viewerUrl;
    }
  })();

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <header
        className="relative w-full border-b"
        style={{
          background: "color-mix(in srgb, var(--navbar-bg) 95%, transparent)",
          borderColor: "var(--navbar-border)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {/* Diagonal lines pattern (matches notte-landing-v1) */}
        <div
          aria-hidden
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background:
              "repeating-linear-gradient(45deg, transparent, transparent 9px, var(--navbar-stripe) 9px, var(--navbar-stripe) 10px)",
          }}
        />

        <div className="relative z-10 max-w-7xl mx-auto flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <h1 className="text-lg font-semibold text-zinc-900">
            Embed Notte Browser Demo
          </h1>
          <div className="flex items-center gap-2">
            <a
              href="https://docs.notte.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Docs
            </a>
            <a
              href="https://github.com/nottelabs/notte-iframe-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Clone Me
            </a>
            {viewerUrl ? (
              <button
                onClick={stopSession}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Stopping…" : "Stop Browser"}
              </button>
            ) : (
              <button
                onClick={startSession}
                disabled={loading}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {loading ? "Starting…" : "Start Browser"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center p-4">
        {error && (
          <div className="m-auto rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!error && !embeddedUrl && (
          <div
            className="m-auto flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-10 py-12 text-center shadow-sm"
            style={{
              aspectRatio: "1440 / 940",
              width: "min(80vw, calc((100vh - 100px) * 0.8 * 1440 / 940))",
              maxHeight: "calc((100vh - 100px) * 0.8)",
            }}
          >
            {loading ? (
              <div className="w-56 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{
                    width: `${progress}%`,
                    transition: "width 0.4s ease-out",
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-600">
                Click <span className="font-medium text-zinc-900">Start Browser</span> to spin one up.
              </p>
            )}
          </div>
        )}

        {embeddedUrl && (
          <>
            {/* Cartoon arrow + caption pointing at the browser */}
            <div
              aria-hidden
              className="hidden lg:flex absolute left-12 top-1/2 -translate-y-1/2 flex-col items-start gap-2 select-none pointer-events-none"
              style={{ maxWidth: "180px" }}
            >
              <p
                className="text-zinc-900 leading-tight"
                style={{
                  fontFamily: "'Comic Sans MS', 'Marker Felt', 'Patrick Hand', cursive",
                  fontSize: "20px",
                  transform: "rotate(-4deg)",
                }}
              >
                Just use the browser now!
              </p>
              <svg
                viewBox="0 0 220 100"
                width="200"
                height="90"
                fill="none"
                stroke="#171717"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginLeft: "55px" }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#171717" stroke="none" />
                  </marker>
                </defs>
                {/* Single clean arc from text down toward the browser */}
                <path
                  d="M 14 20 Q 110 95 200 70"
                  markerEnd="url(#arrowhead)"
                />
              </svg>
            </div>

            <div
              className="m-auto max-w-[80%] max-h-[calc((100vh-100px)*0.8)] overflow-hidden rounded-lg border-2 border-blue-500 bg-white shadow-sm"
              style={{ aspectRatio: "1440 / 940", width: "min(80vw, calc((100vh - 100px) * 0.8 * 1440 / 940))" }}
            >
              <iframe
                src={embeddedUrl}
                title="Notte Browser"
                className="block w-full h-full border-none"
                allow="clipboard-read; clipboard-write"
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
