"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { clearLocalData } from "@/modules/offline/storage";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        await clearLocalData();
        window.location.replace("/login");
      }}
    >
      <LogOut /> Cerrar sesión
    </Button>
  );
}
