"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { api, describeError } from "@/lib/api-client";

/**
 * Used for both sign-in and sign-up.
 *
 * The post-login destination arrives as a prop rather than from
 * `useSearchParams()`. That hook would opt this subtree into client-only
 * rendering, which shipped a login page whose HTML contained no form at all —
 * blank until hydration, and impossible to use if JavaScript failed. Reading
 * the query string on the server instead keeps the form in the initial HTML.
 */
export function AuthForm({ mode, nextPath }: { mode: "login" | "register"; nextPath?: string }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const path = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body = isRegister ? { name, email, password } : { email, password };
      await api.post(path, body);
      router.replace(nextPath ?? "/dashboard");
      router.refresh();
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {isRegister ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {isRegister ? "Start tracking your projects and tasks." : "Welcome back."}
      </p>

      <div className="mt-6 space-y-4">
        {isRegister && (
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="field mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ada Lovelace"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@college.edu"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="field mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "At least 10 characters" : ""}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-[#fdf1f0] px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <button type="button" onClick={submit} disabled={busy} className="btn-primary w-full">
          {busy ? "Working…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </div>

      <p className="mt-5 text-center text-sm text-ink-soft">
        {isRegister ? "Already have an account? " : "No account yet? "}
        <Link href={isRegister ? "/login" : "/register"} className="font-medium text-accent hover:underline">
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
