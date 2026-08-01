"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/Button";
import { PageShell } from "../../components/PageShell";
import { Card, FormInput } from "../../components/Primitives";
import { apiFetch } from "../../lib/api";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  display_name: z.string().min(1),
  organization_name: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

type RegisterForm = z.infer<typeof registerSchema>;
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [error, setError] = useState<string | null>(null);
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
      organization_name: ""
    }
  });
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  async function register(values: RegisterForm) {
    setError(null);
    try {
      await apiFetch("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      });
      router.push("/farms");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed");
    }
  }

  async function login(values: LoginForm) {
    setError(null);
    try {
      await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      router.push("/farms");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    }
  }

  return (
    <PageShell>
      <div className="grid min-h-[calc(100dvh-6rem)] items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="max-w-2xl">
          <p className="as-kicker">Premium field intelligence</p>
          <h1 className="as-display mt-4">See every saved field with calm confidence.</h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--as-ink-muted)]">
            Draw farm boundaries, preserve field geometry, and check the latest Sentinel-2 acquisition metadata
            from one polished workspace.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Insight label="Map-first" value="Boundaries" />
            <Insight label="Source" value="Sentinel-2" />
            <Insight label="Language" value="Safe Thai" />
          </div>
          <div className="mt-8 overflow-hidden rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-surface-map)] shadow-[var(--as-shadow-lg)]">
            <div className="grid min-h-72 grid-cols-[1fr_0.8fr] gap-0">
              <div className="relative p-5">
                <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--as-border)_1px,transparent_1px),linear-gradient(90deg,var(--as-border)_1px,transparent_1px)] [background-size:34px_34px]" />
                <div className="relative mt-8 rounded-[32px] border-2 border-[var(--as-primary)] bg-[rgba(63,141,77,0.18)] p-12 shadow-[var(--as-shadow-md)]" />
              </div>
              <div className="border-l border-[var(--as-border)] bg-white/80 p-5">
                <p className="as-kicker">Latest satellite check</p>
                <p className="mt-4 text-3xl font-bold text-[var(--as-ink)]">12.4%</p>
                <p className="text-sm text-[var(--as-ink-muted)]">Cloud cover metadata</p>
                <div className="mt-8 space-y-3">
                  <div className="h-3 rounded-full bg-[var(--as-surface-soft)]" />
                  <div className="h-3 w-2/3 rounded-full bg-[var(--as-surface-soft)]" />
                  <div className="h-3 w-4/5 rounded-full bg-[var(--as-surface-soft)]" />
                </div>
              </div>
            </div>
          </div>
        </section>
        <Card premium className="mx-auto w-full max-w-md p-5 sm:p-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--as-ink)]">Start managing fields</h2>
            <p className="mt-2 text-[var(--as-ink-muted)]">Create an account or log in to save farm boundaries.</p>
          </div>
          <div className="mt-6 grid grid-cols-2 rounded-[var(--as-radius-md)] border border-[var(--as-border)] bg-[var(--as-surface-soft)] p-1">
            <button
              type="button"
              className={`min-h-10 rounded-[var(--as-radius-sm)] px-3 py-2 text-sm font-bold transition ${
                mode === "register" ? "bg-white text-[var(--as-primary)] shadow-[var(--as-shadow-sm)]" : "text-[var(--as-ink-muted)]"
              }`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
            <button
              type="button"
              className={`min-h-10 rounded-[var(--as-radius-sm)] px-3 py-2 text-sm font-bold transition ${
                mode === "login" ? "bg-white text-[var(--as-primary)] shadow-[var(--as-shadow-sm)]" : "text-[var(--as-ink-muted)]"
              }`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
          </div>
          {error ? (
            <p className="mt-4 rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
              {error}
            </p>
          ) : null}
          {mode === "register" ? (
            <form className="mt-6 space-y-4" onSubmit={registerForm.handleSubmit(register)}>
              <FormInput label="Email" type="email" autoComplete="email" {...registerForm.register("email")} />
              <FormInput label="Password" type="password" autoComplete="new-password" {...registerForm.register("password")} />
              <FormInput label="Your name" autoComplete="name" {...registerForm.register("display_name")} />
              <FormInput label="Organization name" {...registerForm.register("organization_name")} />
              <Button className="w-full" type="submit" size="lg">
                Register
              </Button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={loginForm.handleSubmit(login)}>
              <FormInput label="Email" type="email" autoComplete="email" {...loginForm.register("email")} />
              <FormInput label="Password" type="password" autoComplete="current-password" {...loginForm.register("password")} />
              <Button className="w-full" type="submit" size="lg">
                Login
              </Button>
            </form>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--as-radius-md)] border border-[var(--as-border)] bg-white/70 p-4">
      <p className="text-xs font-bold text-[var(--as-ink-muted)]">{label}</p>
      <p className="mt-1 font-bold text-[var(--as-ink)]">{value}</p>
    </div>
  );
}
