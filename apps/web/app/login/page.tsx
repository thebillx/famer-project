"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/Button";
import { PageShell } from "../../components/PageShell";
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
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#173f35]">Start managing fields</h1>
          <p className="mt-2 text-[#526057]">Create an account or log in to save farm boundaries.</p>
        </div>
        <div className="flex rounded-md border border-[#b8c5b0] bg-white p-1">
          <button
            className={`flex-1 rounded px-3 py-2 ${mode === "register" ? "bg-[#173f35] text-white" : ""}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
          <button
            className={`flex-1 rounded px-3 py-2 ${mode === "login" ? "bg-[#173f35] text-white" : ""}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
        </div>
        {error ? <p className="rounded-md border border-[#8f2435] bg-white p-3 text-[#8f2435]">{error}</p> : null}
        {mode === "register" ? (
          <form className="space-y-4" onSubmit={registerForm.handleSubmit(register)}>
            <Input label="Email" type="email" {...registerForm.register("email")} />
            <Input label="Password" type="password" {...registerForm.register("password")} />
            <Input label="Your name" {...registerForm.register("display_name")} />
            <Input label="Organization name" {...registerForm.register("organization_name")} />
            <Button className="w-full" type="submit">
              Register
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={loginForm.handleSubmit(login)}>
            <Input label="Email" type="email" {...loginForm.register("email")} />
            <Input label="Password" type="password" {...loginForm.register("password")} />
            <Button className="w-full" type="submit">
              Login
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#173f35]">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-md border border-[#b8c5b0] bg-white px-3 outline-none focus:border-[#2f8f55] focus:ring-2 focus:ring-[#2f8f55]/25"
      />
    </label>
  );
}
