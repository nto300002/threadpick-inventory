import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./home-page";

vi.mock("./inventory-dashboard", () => ({
  InventoryDashboard: () => <div>在庫管理ダッシュボード</div>,
}));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    }),
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the public top page when the user is not logged in", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(await jsonResponse({ user: null }, 401));

    render(<HomePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "古着在庫・販売管理" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "できること" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "使い方" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/auth/login");
    expect(screen.getByRole("link", { name: "サインアップ" })).toHaveAttribute("href", "/auth/signup");
    expect(screen.queryByText("在庫管理ダッシュボード")).not.toBeInTheDocument();
  });

  it("shows the inventory dashboard when the user is logged in", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(await jsonResponse({ user: { email: "owner@example.com" } }));

    render(<HomePage />);

    expect(await screen.findByText("在庫管理ダッシュボード")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "古着在庫・販売管理" })).not.toBeInTheDocument();
  });

  it("falls back to the public top page when auth status cannot be checked", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network failed"));

    render(<HomePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "古着在庫・販売管理" })).toBeInTheDocument();
    expect(screen.getByText("古着商品の登録、画像確認、採寸、売却済み管理をひとつの画面で進めるための在庫管理アプリです。")).toBeInTheDocument();
  });

  it("shows the public top page if the auth check does not return", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => undefined));

    render(<HomePage />);

    expect(screen.getByText("ログイン状態を確認中")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("heading", { level: 1, name: "古着在庫・販売管理" })).toBeInTheDocument();
  });
});
