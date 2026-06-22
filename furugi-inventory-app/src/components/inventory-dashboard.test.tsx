import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InventoryDashboard } from "./inventory-dashboard";

describe("InventoryDashboard", () => {
  it("renders the primary inventory workflow", () => {
    render(<InventoryDashboard />);

    expect(
      screen.getByRole("heading", { name: "古着在庫・販売管理" }),
    ).toBeInTheDocument();
    expect(screen.getByText("在庫・ステータス")).toBeInTheDocument();
    expect(screen.getByText("在庫数 3")).toBeInTheDocument();
    expect(screen.getByLabelText("小カテゴリ")).toBeInTheDocument();
    expect(screen.getByLabelText("画像")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "商品登録" })).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.getByText("採寸入力(cm)")).toBeInTheDocument();
    expect(
      within(screen.getByRole("form", { name: "商品登録フォーム" })).getByRole("button", {
        name: "商品登録",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "商品一覧" })).toBeInTheDocument();
    expect(screen.getByText("TP-1042")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /商品画像/ })).toHaveLength(3);
    expect(screen.getAllByText("登録済み").length).toBeGreaterThan(0);
    expect(screen.getAllByText("売却済み").length).toBeGreaterThan(0);
  });

  it("expands a product card to show details", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = screen.getByTestId("product-card-TP-1038");
    expect(card).toHaveAttribute("aria-expanded", "false");

    await user.click(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("TP-1038")).toBeInTheDocument();
    expect(screen.getByText("¥6,800")).toBeInTheDocument();
    expect(within(card).getByText("採寸")).toBeInTheDocument();
    expect(within(card).getByText("着丈 68.0")).toBeInTheDocument();
    expect(within(card).getByText("身幅 54.5")).toBeInTheDocument();
  });

  it("marks a registered product as sold from the status tooltip", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = screen.getByTestId("product-card-TP-1042");
    await user.hover(within(card).getByRole("button", { name: "登録済み" }));
    await user.click(within(card).getByRole("button", { name: "売却する" }));

    expect(within(card).getByRole("button", { name: "売却済み" })).toBeInTheDocument();
    expect(screen.getAllByText("売却済み").length).toBeGreaterThan(0);
  });

  it("confirms before deleting a sold product", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = screen.getByTestId("product-card-TP-1029");
    await user.hover(within(card).getByRole("button", { name: "売却済み" }));
    await user.click(within(card).getByRole("button", { name: "削除" }));

    expect(screen.getByRole("dialog", { name: "商品を削除しますか" })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("dialog", { name: "商品を削除しますか" })).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(screen.queryByTestId("product-card-TP-1029")).not.toBeInTheDocument();
  });

  it("sells all registered products at once", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    await user.click(screen.getByRole("button", { name: "登録済みを一括売却" }));

    expect(screen.getByRole("button", { name: "登録済みを一括売却" })).toBeDisabled();
    expect(
      within(screen.getByTestId("product-card-TP-1042")).getByRole("button", {
        name: "売却済み",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("product-card-TP-1038")).getByRole("button", {
        name: "売却済み",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("product-card-TP-1029")).getByRole("button", {
        name: "売却済み",
      }),
    ).toBeInTheDocument();
  });

  it("confirms before deleting all sold products", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    await user.click(screen.getByRole("button", { name: "売却済みを一括削除" }));

    expect(screen.getByRole("dialog", { name: "商品を削除しますか" })).toHaveTextContent(
      "売却済みの商品 1 件を一覧から削除します。",
    );

    await user.click(
      within(screen.getByRole("dialog", { name: "商品を削除しますか" })).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(screen.queryByTestId("product-card-TP-1029")).not.toBeInTheDocument();
    expect(screen.getByText("在庫数 2")).toBeInTheDocument();
  });

  it("shows an empty state when all products are deleted", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    await user.click(screen.getByRole("button", { name: "登録済みを一括売却" }));
    await user.click(screen.getByRole("button", { name: "売却済みを一括削除" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "商品を削除しますか" })).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(screen.getByText("商品がありません")).toBeInTheDocument();
    expect(screen.getByText("在庫数 0")).toBeInTheDocument();
  });

  it("filters product cards by status", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    const statusFilter = screen.getByLabelText("状態フィルター");

    await user.click(within(statusFilter).getByRole("button", { name: "売却済み" }));

    expect(screen.queryByTestId("product-card-TP-1042")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-card-TP-1038")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-card-TP-1029")).toBeInTheDocument();

    await user.click(within(statusFilter).getByRole("button", { name: "登録済み" }));

    expect(screen.getByTestId("product-card-TP-1042")).toBeInTheDocument();
    expect(screen.getByTestId("product-card-TP-1038")).toBeInTheDocument();
    expect(screen.queryByTestId("product-card-TP-1029")).not.toBeInTheDocument();
  });
});
