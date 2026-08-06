"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await api.post("/api/auth/logout").catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className="btn-secondary py-1.5 text-xs">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
