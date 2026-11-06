"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api-client";

export function PreferencesForm() {
  const router = useRouter();
  const { data, refresh } = useReferenceData();
  if (!data) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return <PreferencesFields key={data.user.name + data.user.defaultAccountId + data.user.voiceAutoSave} onSaved={() => { void refresh(); router.refresh(); }} />;
}

function PreferencesFields({ onSaved }: { onSaved: () => void }) {
  const { data } = useReferenceData();
  const user = data!.user;
  const [name, setName] = useState(user.name);
  const [defaultAccountId, setDefault] = useState(user.defaultAccountId);
  const [voiceAutoSave, setAutoSave] = useState(user.voiceAutoSave);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/settings", { method: "PATCH", body: { name, defaultAccountId, voiceAutoSave } });
      toast.success("Preferencias guardadas");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setChanging(true);
    try {
      await api("/api/settings/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      toast.success("Contraseña actualizada. Volvé a ingresar.");
      window.location.replace("/login");
    } catch (error) {
      setPasswordError(error instanceof ApiError && error.fields ? Object.values(error.fields)[0]! : errorMessage(error));
      setChanging(false);
    }
  }

  const accounts = data!.accounts.filter((a) => a.isActive);

  return (
    <>
      <form onSubmit={save} className="grid gap-5">
        <FormField id="pref-name" label="Tu nombre">
          <Input id="pref-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Cuenta habitual</span>
          <p className="text-[13px] text-muted-foreground">Se preselecciona al cargar y se usa en la voz cuando no mencionás cómo pagaste.</p>
          <ChoiceChips label="Cuenta habitual" value={defaultAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} onChange={setDefault} />
          {defaultAccountId && (
            <button type="button" className="justify-self-start text-[13px] font-semibold text-muted-foreground underline" onClick={() => setDefault(null)}>
              Sin cuenta habitual
            </button>
          )}
        </div>
        <label className="flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3">
          <span>
            <span className="block text-[15px] font-semibold">Guardar automáticamente lo dictado</span>
            <span className="block text-[13px] text-muted-foreground">Solo si importe, fecha, tipo, categoría y cuenta quedaron claros.</span>
          </span>
          <Switch checked={voiceAutoSave} onCheckedChange={setAutoSave} />
        </label>
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Guardar preferencias
        </Button>
      </form>

      <Section title="Contraseña" className="mt-10">
        <form onSubmit={changePassword} className="grid gap-4">
          <FormField id="current-password" label="Contraseña actual">
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </FormField>
          <FormField id="new-password" label="Contraseña nueva" hint="Mínimo 10 caracteres." error={passwordError ?? undefined}>
            <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </FormField>
          <Button type="submit" variant="outline" disabled={changing || !current || !next}>
            {changing && <Loader2 className="animate-spin" />} Cambiar contraseña
          </Button>
        </form>
      </Section>
    </>
  );
}
