"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import styles from "./auth-page.module.css";
import { AuthToast, queueAuthToast, useQueuedAuthToast } from "./auth-toast";

const emailSchema = z
  .string()
  .regex(
    /^[^\s@]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
    "メールアドレスは xx@xxx.com の形式で入力してください。",
  );
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "パスワードを入力してください。"),
});
const passwordRequirements =
  "パスワードは8文字以上で、大文字・小文字・記号をそれぞれ1文字以上含めてください。";
const signupSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください。")
      .regex(/[A-Z]/, "パスワードには大文字を含めてください。")
      .regex(/[a-z]/, "パスワードには小文字を含めてください。")
      .regex(/[^A-Za-z0-9]/, "パスワードには記号を含めてください。"),
    passwordConfirm: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: "確認用パスワードが一致しません。",
    path: ["passwordConfirm"],
  });

type AuthMode = "login" | "signup";

function AuthShell({
  children,
  heading,
}: {
  children: React.ReactNode;
  heading: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="auth-heading">
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Threadpick Auth</p>
            <h1 id="auth-heading">{heading}</h1>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

async function readErrorMessage(response: Response, isSignup: boolean) {
  let errorCode = "";
  try {
    const body = (await response.json()) as { error?: string };
    errorCode = body.error ?? "";
  } catch {
    errorCode = "";
  }

  if (errorCode === "email_already_exists") {
    return "このメールアドレスは既に登録されています。";
  }
  if (errorCode === "invalid_credentials") {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (errorCode === "invalid_request") {
    return "入力内容を確認してください。";
  }
  return isSignup ? "サインアップに失敗しました。" : "ログインに失敗しました。";
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [toast, setToast] = useQueuedAuthToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function submitSession() {
    const result = isSignup
      ? signupSchema.safeParse({
          email,
          password,
          passwordConfirm,
        })
      : loginSchema.safeParse({
          email,
          password,
        });

    if (!result.success) {
      const validationErrors = result.error.issues.map((issue) => issue.message);
      setErrors(validationErrors);
      setToast({
        intent: "error",
        message: `${isSignup ? "サインアップ" : "ログイン"}に失敗しました。入力内容を確認してください。`,
      });
      return;
    }

    setErrors([]);
    setIsSubmitting(true);
    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
    const response = await fetch(endpoint, {
      body: JSON.stringify(
        isSignup
          ? {
              email,
              name: "Owner",
              password,
            }
          : {
              email,
              password,
            },
      ),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response, isSignup);
      setErrors([errorMessage]);
      setToast({
        intent: "error",
        message: `${isSignup ? "サインアップ" : "ログイン"}に失敗しました。${errorMessage}`,
      });
      return;
    }

    queueAuthToast({
      intent: "success",
      message: `${isSignup ? "サインアップ" : "ログイン"}に成功しました。`,
    });
    router.push(isSignup ? "/auth/login" : "/");
  }

  return (
    <>
      <AuthToast toast={toast} />
      <form
        aria-label={isSignup ? "サインアップフォーム" : "ログインフォーム"}
        className={styles.authCard}
      >
        <div>
          <p className={styles.sectionLabel}>{isSignup ? "Signup" : "Login"}</p>
          <h2>{isSignup ? "サインアップ" : "ログイン"}</h2>
        </div>
        <label>
          メールアドレス
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@example.com"
            value={email}
          />
        </label>
        <label>
          パスワード
          <input
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-describedby={isSignup ? "password-requirements" : undefined}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignup ? "Aa!12345" : "8文字以上"}
            type="password"
            value={password}
          />
        </label>
        {isSignup ? (
          <>
            <p className={styles.passwordHint} id="password-requirements">
              {passwordRequirements}
            </p>
            <label>
              パスワード確認
              <input
                autoComplete="new-password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="もう一度入力"
                type="password"
                value={passwordConfirm}
              />
            </label>
          </>
        ) : null}
        {errors.length > 0 ? (
          <ul className={styles.errorList} role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        <button disabled={isSubmitting} onClick={submitSession} type="button">
          {isSubmitting ? "送信中" : isSignup ? "サインアップ" : "ログイン"}
        </button>
        <p className={styles.switchLink}>
          {isSignup ? "アカウントをお持ちの場合" : "アカウントを作成する場合"}
          <Link href={isSignup ? "/auth/login" : "/auth/signup"}>
            {isSignup ? "ログインへ" : "サインアップへ"}
          </Link>
        </p>
      </form>
    </>
  );
}

export function AuthLoginPage() {
  return (
    <AuthShell heading="ログイン">
      <AuthForm mode="login" />
    </AuthShell>
  );
}

export function AuthSignupPage() {
  return (
    <AuthShell heading="サインアップ">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
