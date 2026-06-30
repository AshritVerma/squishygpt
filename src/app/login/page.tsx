"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(params.get("from") || "/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Incorrect password");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <form
        onSubmit={submit}
        className="glass squish-shadow w-full max-w-sm rounded-3xl p-7 text-center"
      >
        <div className="accent-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl squish-shadow">
          🩷
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span className="accent-text">SquishyGPT</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Serena&apos;s optometry brain
        </p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className="glass mt-6 w-full rounded-2xl px-4 py-3 text-center text-[15px] outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />

        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="accent-gradient mt-4 w-full rounded-2xl py-3 font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {loading ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
