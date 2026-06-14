"use client";

// Settings — profile + theme. A second working page so the nav pattern is obvious.
import { useEffect, useState } from "react";
import { getUser, signIn, type User } from "@/lib/auth";
import { Card, Field, Input, Button } from "@/components/ui";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    signIn(user);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-muted">Manage your profile and preferences.</p>
      </div>

      <Card>
        <form onSubmit={save} className="space-y-4">
          <Field label="Display name">
            <Input value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit">Save changes</Button>
            {saved ? <span className="text-sm text-muted">Saved.</span> : null}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ink">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Switch the color palette from the theme picker in the top bar — it applies instantly across
          the whole app and is remembered next visit.
        </p>
      </Card>
    </div>
  );
}
