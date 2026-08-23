"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/Button";
import { FormInput } from "../../components/Primitives";
import { apiFetch } from "../../lib/api";

const LOGIN_FAILURE = "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง";
const REGISTER_FAILURE = "สร้างบัญชีไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง";

const TENANT_QUERY_ROOTS = new Set([
  "current-user",
  "organizations",
  "organization-members",
  "farms",
  "farm",
  "fields",
  "field",
  "satellite-latest"
]);

const emailSchema = z.string().trim().min(1, "กรุณากรอกอีเมล").email("กรุณากรอกอีเมลให้ถูกต้อง");

const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(12, "รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร")
    .regex(/[A-Z]/, "รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
    .regex(/[a-z]/, "รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว")
    .regex(/[0-9]/, "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว"),
  display_name: z.string().trim().min(1, "กรุณากรอกชื่อของคุณ"),
  organization_name: z.string().trim().min(1, "กรุณากรอกชื่อองค์กร")
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน")
});

type RegisterForm = z.infer<typeof registerSchema>;
type LoginForm = z.infer<typeof loginSchema>;
type AuthMode = "register" | "login";

function clearTenantAuthCache(queryClient: QueryClient) {
  const isTenantQuery = (query: { queryKey: readonly unknown[] }) =>
    typeof query.queryKey[0] === "string" && TENANT_QUERY_ROOTS.has(query.queryKey[0]);
  queryClient.removeQueries({ predicate: isTenantQuery });
}

function schemaResolver<T extends FieldValues>(schema: z.ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const fieldName = String(issue.path[0] ?? "");
      const fieldErrors = errors as Record<string, FieldError | undefined>;
      if (fieldName && !fieldErrors[fieldName]) {
        fieldErrors[fieldName] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {} as T, errors };
  };
}

function BrandMark() {
  return (
    <span className="as-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M24.8 6.5C16.9 6.7 10.2 10.2 7.7 16c-1.8 4.2.6 8.9 5.2 9.6 4.7.7 8.2-2.4 9-6.5.9-4.5-1.2-7.9 2.9-12.6Z" />
        <path d="M9.2 23.4c3.2-5.8 6.9-9.4 11.5-12.1M12.1 17.4c1.9.1 3.8.5 5.6 1.2M15.6 13.2c-.1 1.7.1 3.2.6 4.7" />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("register");
  const [serverError, setServerError] = useState<string | null>(null);
  const registerForm = useForm<RegisterForm>({
    resolver: schemaResolver(registerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
      organization_name: ""
    }
  });
  const loginForm = useForm<LoginForm>({
    resolver: schemaResolver(loginSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" }
  });
  const pending = registerForm.formState.isSubmitting || loginForm.formState.isSubmitting;

  function selectMode(nextMode: AuthMode) {
    if (pending || nextMode === mode) return;
    setServerError(null);
    registerForm.clearErrors();
    loginForm.clearErrors();
    setMode(nextMode);
  }

  async function register(values: RegisterForm) {
    setServerError(null);
    try {
      await apiFetch("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      });
      clearTenantAuthCache(queryClient);
      router.push("/farms");
    } catch {
      setServerError(REGISTER_FAILURE);
    }
  }

  async function login(values: LoginForm) {
    setServerError(null);
    try {
      await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      clearTenantAuthCache(queryClient);
      router.push("/farms");
    } catch {
      setServerError(LOGIN_FAILURE);
    }
  }

  return (
    <div className="as-auth-page">
      <a className="as-skip-link" href="#main-content">
        ข้ามไปยังเนื้อหา
      </a>
      <header className="as-auth-header">
        <Link className="as-public-brand" href="/" prefetch={false} aria-label="AgriScope Thailand หน้าหลัก">
          <BrandMark />
          <span>
            <strong>AgriScope</strong>
            <small>THAILAND · FARM INTELLIGENCE</small>
          </span>
        </Link>
      </header>

      <main id="main-content" className="as-auth-main" tabIndex={-1}>
        <div className="as-auth-layout">
          <section className="as-auth-form-panel" aria-labelledby="auth-title">
            <p className="as-kicker">พื้นที่ทำงาน AgriScope</p>
            <h1 id="auth-title" className="as-auth-title">
              {mode === "register" ? "สร้างบัญชี AgriScope" : "เข้าสู่ระบบ AgriScope"}
            </h1>
            <p className="as-auth-intro">
              {mode === "register"
                ? "เริ่มจัดเก็บฟาร์มและขอบเขตแปลงในพื้นที่ทำงานขององค์กรคุณ"
                : "กลับไปยังฟาร์มและขอบเขตแปลงที่องค์กรของคุณจัดเก็บไว้"}
            </p>

            <div className="as-auth-modes" role="group" aria-label="เลือกรูปแบบการเข้าใช้งาน">
              <button
                type="button"
                aria-pressed={mode === "register"}
                disabled={pending}
                onClick={() => selectMode("register")}
              >
                สร้างบัญชี
              </button>
              <button
                type="button"
                aria-pressed={mode === "login"}
                disabled={pending}
                onClick={() => selectMode("login")}
              >
                เข้าสู่ระบบ
              </button>
            </div>

            {serverError ? (
              <p className="as-server-error" role="alert">
                {serverError}
              </p>
            ) : null}

            {mode === "register" ? (
              <form className="as-auth-form" noValidate onSubmit={registerForm.handleSubmit(register)}>
                <FormInput
                  label="อีเมล"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-required="true"
                  hint="ใช้สำหรับเข้าสู่ระบบ"
                  error={registerForm.formState.errors.email?.message}
                  disabled={pending}
                  {...registerForm.register("email")}
                />
                <FormInput
                  label="รหัสผ่าน"
                  type="password"
                  autoComplete="new-password"
                  aria-required="true"
                  hint="อย่างน้อย 12 ตัวอักษร พร้อมตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข"
                  error={registerForm.formState.errors.password?.message}
                  disabled={pending}
                  {...registerForm.register("password")}
                />
                <FormInput
                  label="ชื่อของคุณ"
                  autoComplete="name"
                  aria-required="true"
                  hint="ชื่อที่จะแสดงในพื้นที่ทำงาน"
                  error={registerForm.formState.errors.display_name?.message}
                  disabled={pending}
                  {...registerForm.register("display_name")}
                />
                <FormInput
                  label="ชื่อองค์กร"
                  autoComplete="organization"
                  aria-required="true"
                  hint="ชื่อฟาร์มหรือองค์กรของคุณ"
                  error={registerForm.formState.errors.organization_name?.message}
                  disabled={pending}
                  {...registerForm.register("organization_name")}
                />
                <Button
                  className="as-auth-submit"
                  type="submit"
                  size="lg"
                  isLoading={registerForm.formState.isSubmitting}
                  loadingLabel="กำลังสร้างบัญชี…"
                >
                  สร้างบัญชี
                </Button>
              </form>
            ) : (
              <form className="as-auth-form" noValidate onSubmit={loginForm.handleSubmit(login)}>
                <FormInput
                  label="อีเมล"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-required="true"
                  hint="อีเมลที่ใช้สมัครบัญชี"
                  error={loginForm.formState.errors.email?.message}
                  disabled={pending}
                  {...loginForm.register("email")}
                />
                <FormInput
                  label="รหัสผ่าน"
                  type="password"
                  autoComplete="current-password"
                  aria-required="true"
                  hint="กรอกรหัสผ่านของคุณ"
                  error={loginForm.formState.errors.password?.message}
                  disabled={pending}
                  {...loginForm.register("password")}
                />
                <Button
                  className="as-auth-submit"
                  type="submit"
                  size="lg"
                  isLoading={loginForm.formState.isSubmitting}
                  loadingLabel="กำลังเข้าสู่ระบบ…"
                >
                  เข้าสู่ระบบ
                </Button>
              </form>
            )}
          </section>

          <aside className="as-auth-proof" aria-labelledby="sample-title">
            <p className="as-kicker">ข้อมูลตัวอย่าง</p>
            <h2 id="sample-title">ขอบเขตแปลงที่อ่านง่ายในพื้นที่ทำงานเดียว</h2>
            <p>
              ภาพประกอบนี้แสดงรูปแบบการจัดวางเท่านั้น ไม่ใช่ข้อมูลฟาร์มจริงหรือผลวิเคราะห์จากดาวเทียม
            </p>
            <div
              className="as-sample-map"
              role="img"
              aria-label="ภาพประกอบขอบเขตแปลงตัวอย่างบนพื้นผิวแผนที่"
            >
              <svg viewBox="0 0 560 360" focusable="false" aria-hidden="true">
                <path className="as-sample-road" d="M-20 285C115 235 170 270 264 206c78-53 164-39 318-136" />
                <path className="as-sample-water" d="M32-24c78 96 44 156 132 214 72 47 128 31 198 131" />
                <path className="as-sample-boundary" d="m156 72 221 25 57 129-99 79-208-42-35-108Z" />
                <path className="as-sample-row" d="m148 108 227 27M128 150l268 34M120 197l290 37M136 244l225 30" />
              </svg>
              <span>ตัวอย่างขอบเขตแปลง</span>
            </div>
            <ul className="as-proof-list">
              <li>จัดเก็บขอบเขตแปลงที่บันทึกไว้</li>
              <li>ตรวจข้อมูลเมทาดาทา Sentinel-2 ตามคำขอ</li>
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
