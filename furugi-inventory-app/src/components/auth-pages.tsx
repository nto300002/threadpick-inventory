"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import styles from "./auth-page.module.css";

const sessionKey = "threadpick-session";
const emailSchema = z
  .string()
  .regex(
    /^[^\s@]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
    "メールアドレスは xx@xxx.com の形式で入力してください。",
  );
const loginSchema = z.object({
  email: emailSchema,
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

function saveSession(email: string) {
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify({
      email,
      startedAt: new Date().toISOString(),
    }),
  );
}

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
          <Link className={styles.backLink} href="/">
            在庫管理へ戻る
          </Link>
        </div>
        {children}
      </section>
    </main>
  );
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isSignup = mode === "signup";

  function submitSession() {
    const result = isSignup
      ? signupSchema.safeParse({
          email,
          password,
          passwordConfirm,
        })
      : loginSchema.safeParse({
          email,
        });

    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message));
      setIsAuthenticated(false);
      return;
    }

    setErrors([]);
    saveSession(email || "owner@example.com");
    setIsAuthenticated(true);
  }

  return (
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
      <button onClick={submitSession} type="button">
        {isSignup ? "サインアップ" : "ログイン"}
      </button>
      {isAuthenticated ? (
        <p className={styles.sessionMessage} role="status">
          簡易セッションを開始しました。
        </p>
      ) : null}
      <p className={styles.switchLink}>
        {isSignup ? "アカウントをお持ちの場合" : "アカウントを作成する場合"}
        <Link href={isSignup ? "/auth/login" : "/auth/signup"}>
          {isSignup ? "ログインへ" : "サインアップへ"}
        </Link>
      </p>
    </form>
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
