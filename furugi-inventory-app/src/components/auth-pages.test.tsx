import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthLoginPage, AuthSignupPage } from "./auth-pages";

describe("Auth pages", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders login controls and starts a simple session", async () => {
    const user = userEvent.setup();
    render(<AuthLoginPage />);

    expect(screen.getByRole("heading", { level: 1, name: "ログイン" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "サインアップへ" })).toHaveAttribute(
      "href",
      "/auth/signup",
    );

    const loginForm = screen.getByRole("form", { name: "ログインフォーム" });
    await user.type(within(loginForm).getByLabelText("メールアドレス"), "owner@example.com");
    await user.type(within(loginForm).getByLabelText("パスワード"), "password123");
    await user.click(within(loginForm).getByRole("button", { name: "ログイン" }));

    expect(screen.getByRole("status")).toHaveTextContent("簡易セッションを開始しました。");
    expect(window.localStorage.getItem("threadpick-session")).toContain("owner@example.com");
  });

  it("validates login email format", async () => {
    const user = userEvent.setup();
    render(<AuthLoginPage />);
    const loginForm = screen.getByRole("form", { name: "ログインフォーム" });

    await user.type(within(loginForm).getByLabelText("メールアドレス"), "owner");
    await user.type(within(loginForm).getByLabelText("パスワード"), "password123");
    await user.click(within(loginForm).getByRole("button", { name: "ログイン" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "メールアドレスは xx@xxx.com の形式で入力してください。",
    );
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("renders signup controls and links back to login", () => {
    render(<AuthSignupPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "サインアップ" }),
    ).toBeInTheDocument();
    const signupForm = screen.getByRole("form", { name: "サインアップフォーム" });
    expect(within(signupForm).queryByLabelText("店舗名")).not.toBeInTheDocument();
    expect(within(signupForm).getByLabelText("パスワード確認")).toBeInTheDocument();
    expect(
      within(signupForm).getByText(
        "パスワードは8文字以上で、大文字・小文字・記号をそれぞれ1文字以上含めてください。",
      ),
    ).toBeInTheDocument();
    expect(within(signupForm).getByRole("button", { name: "サインアップ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("validates signup passwords with zod", async () => {
    const user = userEvent.setup();
    render(<AuthSignupPage />);
    const signupForm = screen.getByRole("form", { name: "サインアップフォーム" });

    await user.type(within(signupForm).getByLabelText("メールアドレス"), "owner@example.co.jp");
    await user.type(within(signupForm).getByLabelText("パスワード"), "password");
    await user.type(within(signupForm).getByLabelText("パスワード確認"), "password1");
    await user.click(within(signupForm).getByRole("button", { name: "サインアップ" }));

    expect(screen.getByRole("alert")).toHaveTextContent("パスワードには大文字を含めてください。");
    expect(screen.getByRole("alert")).toHaveTextContent("パスワードには記号を含めてください。");
    expect(screen.getByRole("alert")).toHaveTextContent("確認用パスワードが一致しません。");
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("starts a simple session after valid signup", async () => {
    const user = userEvent.setup();
    render(<AuthSignupPage />);
    const signupForm = screen.getByRole("form", { name: "サインアップフォーム" });

    await user.type(within(signupForm).getByLabelText("メールアドレス"), "owner@example.co.jp");
    await user.type(within(signupForm).getByLabelText("パスワード"), "Password!");
    await user.type(within(signupForm).getByLabelText("パスワード確認"), "Password!");
    await user.click(within(signupForm).getByRole("button", { name: "サインアップ" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("簡易セッションを開始しました。");
    expect(window.localStorage.getItem("threadpick-session")).toContain("owner@example.co.jp");
  });
});
