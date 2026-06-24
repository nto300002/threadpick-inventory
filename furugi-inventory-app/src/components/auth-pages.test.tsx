import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthLoginPage, AuthSignupPage } from "./auth-pages";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("Auth pages", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    pushMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ user: { email: "owner@example.com" } }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders login controls and redirects to inventory after cookie login", async () => {
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

    expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
      body: JSON.stringify({
        email: "owner@example.com",
        password: "password123",
      }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(pushMock).toHaveBeenCalledWith("/");
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("validates login email format", async () => {
    const user = userEvent.setup();
    render(<AuthLoginPage />);
    const loginForm = screen.getByRole("form", { name: "ログインフォーム" });

    await user.type(within(loginForm).getByLabelText("メールアドレス"), "owner");
    await user.type(within(loginForm).getByLabelText("パスワード"), "password123");
    await user.click(within(loginForm).getByRole("button", { name: "ログイン" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "メールアドレスは xx@xxx.com の形式で入力してください。",
    );
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "ログインに失敗しました。",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("renders signup controls and links back to login", () => {
    render(<AuthSignupPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "サインアップ" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "在庫管理へ戻る" })).not.toBeInTheDocument();
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

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "パスワードには大文字を含めてください。",
    );
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "パスワードには記号を含めてください。",
    );
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "確認用パスワードが一致しません。",
    );
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "サインアップに失敗しました。",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("creates an account through the auth API and redirects to login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { email: "owner@example.co.jp" } }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const user = userEvent.setup();
    render(<AuthSignupPage />);
    const signupForm = screen.getByRole("form", { name: "サインアップフォーム" });

    await user.type(within(signupForm).getByLabelText("メールアドレス"), "owner@example.co.jp");
    await user.type(within(signupForm).getByLabelText("パスワード"), "Password!");
    await user.type(within(signupForm).getByLabelText("パスワード確認"), "Password!");
    await user.click(within(signupForm).getByRole("button", { name: "サインアップ" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/auth/signup", {
      body: JSON.stringify({
        email: "owner@example.co.jp",
        name: "Owner",
        password: "Password!",
      }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(pushMock).toHaveBeenCalledWith("/auth/login");
    expect(window.sessionStorage.getItem("threadpick-auth-toast")).toContain(
      "サインアップに成功しました。",
    );
    expect(window.localStorage.getItem("threadpick-session")).toBeNull();
  });

  it("shows API errors without redirecting", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "email_already_exists" }), {
        headers: { "content-type": "application/json" },
        status: 409,
      }),
    );
    const user = userEvent.setup();
    render(<AuthSignupPage />);
    const signupForm = screen.getByRole("form", { name: "サインアップフォーム" });

    await user.type(within(signupForm).getByLabelText("メールアドレス"), "owner@example.co.jp");
    await user.type(within(signupForm).getByLabelText("パスワード"), "Password!");
    await user.type(within(signupForm).getByLabelText("パスワード確認"), "Password!");
    await user.click(within(signupForm).getByRole("button", { name: "サインアップ" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "このメールアドレスは既に登録されています。",
    );
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "サインアップに失敗しました。",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a queued auth popup on the redirected page", () => {
    window.sessionStorage.setItem(
      "threadpick-auth-toast",
      JSON.stringify({
        intent: "success",
        message: "サインアップに成功しました。",
      }),
    );

    render(<AuthLoginPage />);

    expect(screen.getByRole("status")).toHaveTextContent("サインアップに成功しました。");
    expect(window.sessionStorage.getItem("threadpick-auth-toast")).toBeNull();
  });
});
