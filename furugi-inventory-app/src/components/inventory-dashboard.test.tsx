import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryDashboard } from "./inventory-dashboard";

const pushMock = vi.fn();
const scrollIntoViewMock = vi.fn();
let logoutFails = false;
let productCreateUnauthorized = false;
let apiProducts: Array<{
  id: number;
  managementNumber: string;
  imageKey: string | null;
  mainCategory: string;
  subCategory: string | null;
  size: string;
  status: string;
  price: number | null;
  note: string | null;
  deletedAt?: string | null;
}>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    }),
  );
}

async function openRegisterForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("商品登録フォームを開閉"));
  return screen.getByRole("form", { name: "商品登録フォーム" });
}

describe("InventoryDashboard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    pushMock.mockReset();
    scrollIntoViewMock.mockReset();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    logoutFails = false;
    productCreateUnauthorized = false;
    apiProducts = [
      {
        id: 1,
        managementNumber: "TP-1042",
        imageKey: null,
        mainCategory: "アウター",
        subCategory: null,
        size: "L",
        status: "selling",
        price: null,
        note: null,
        deletedAt: null,
      },
      {
        id: 2,
        managementNumber: "TP-1038",
        imageKey: null,
        mainCategory: "トップス",
        subCategory: "スウェット",
        size: "M",
        status: "measured",
        price: 6800,
        note: "首元に小さな使用感あり",
        deletedAt: null,
      },
      {
        id: 3,
        managementNumber: "TP-1029",
        imageKey: null,
        mainCategory: "ボトムス",
        subCategory: null,
        size: "FREE",
        status: "sold",
        price: 5400,
        note: null,
        deletedAt: "2026-06-25T01:00:00.000Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/auth/logout") {
          return jsonResponse(logoutFails ? { error: "failed" } : { ok: true }, logoutFails ? 500 : 200);
        }
        if ((url === "/api/products" || url === "/api/products?includeDeleted=true") && method === "GET") {
          return jsonResponse({ products: apiProducts });
        }
        if (url === "/api/products" && method === "POST") {
          if (productCreateUnauthorized) {
            return jsonResponse({ error: "unauthorized" }, 401);
          }
          const body = JSON.parse(String(init?.body)) as {
            managementNumber: string;
            imageKey: string | null;
            mainCategory: string;
            subCategory: string | null;
            size: string;
            price: number | null;
            note: string | null;
            deletedAt?: string | null;
          };
          const product = {
            id: 4,
            status: "unmeasured",
            deletedAt: null,
            ...body,
          };
          apiProducts = [product, ...apiProducts];
          return jsonResponse({ product }, 201);
        }
        if (url.endsWith("/measurement") && method === "GET") {
          return jsonResponse({
            measurement: {
              lengthCm: 68,
              bodyWidthCm: 54.5,
              shoulderWidthCm: 47,
              sleeveLengthCm: 59,
            },
          });
        }
        if (url.endsWith("/measurement") && method === "PUT") {
          return jsonResponse({ measurement: {} });
        }
        if (url.endsWith("/status") && method === "PATCH") {
          const id = Number(url.split("/")[3]);
          const body = JSON.parse(String(init?.body)) as { status: string };
          apiProducts = apiProducts.map((product) =>
            product.id === id
              ? {
                  ...product,
                  status: body.status,
                  deletedAt: body.status === "sold" ? product.deletedAt ?? "2026-06-25T01:00:00.000Z" : null,
                }
              : product,
          );
          return jsonResponse({ product: apiProducts.find((product) => product.id === id) });
        }
        if (url === "/api/products/bulk/status" && method === "POST") {
          const body = JSON.parse(String(init?.body)) as { ids: number[]; status: string };
          apiProducts = apiProducts.map((product) =>
            body.ids.includes(product.id)
              ? {
                  ...product,
                  status: body.status,
                  deletedAt: body.status === "sold" ? product.deletedAt ?? "2026-06-25T01:00:00.000Z" : null,
                }
              : product,
          );
          return jsonResponse({
            count: body.ids.length,
            products: apiProducts.filter((product) => body.ids.includes(product.id)),
          });
        }
        if (url === "/api/products/bulk/delete" && method === "POST") {
          const soldProducts = apiProducts.filter((product) => product.status === "sold");
          apiProducts = apiProducts.filter((product) => product.status !== "sold");
          return jsonResponse({ count: soldProducts.length, products: soldProducts });
        }
        if (url.startsWith("/api/products/") && method === "DELETE") {
          const id = Number(url.split("/")[3]);
          apiProducts = apiProducts.filter((product) => product.id !== id);
          return jsonResponse({ product: { id } });
        }
        return jsonResponse({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the primary inventory workflow from the product API", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    expect(
      screen.getByRole("heading", { name: "古着在庫・販売管理" }),
    ).toBeInTheDocument();
    expect(screen.getByText("在庫・ステータス")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "セクション移動" })).toBeInTheDocument();
    expect(await screen.findByText("在庫数 3")).toBeInTheDocument();
    expect(screen.getByLabelText("小カテゴリ")).toBeInTheDocument();
    expect(screen.getByLabelText("画像")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "商品登録" })).toBeInTheDocument();
    expect(document.getElementById("product-register")).not.toHaveAttribute("open");
    const registerForm = await openRegisterForm(user);
    expect(document.getElementById("product-register")).toHaveAttribute("open");
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.getByText("採寸入力(cm)")).toBeInTheDocument();
    expect(within(registerForm).getByLabelText("管理番号")).toHaveValue("");
    expect(within(registerForm).getByLabelText("管理番号")).toHaveAttribute("placeholder", "例: TP-1043");
    expect(within(registerForm).getByLabelText("着丈")).toHaveValue("0");
    expect(within(registerForm).getByLabelText("身幅")).toHaveValue("0");
    expect(
      within(registerForm).getByRole("button", {
        name: "商品登録",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "商品一覧" })).toBeInTheDocument();
    expect(screen.getByText("TP-1042")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /商品画像/ })).toHaveLength(3);
    expect(screen.getAllByText("登録済み").length).toBeGreaterThan(0);
    expect(screen.getAllByText("売却済み").length).toBeGreaterThan(0);
  });

  it("scrolls to each section from the fixed header controls", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    const navigation = screen.getByRole("navigation", { name: "セクション移動" });

    await user.click(within(navigation).getByRole("button", { name: "在庫" }));
    await user.click(within(navigation).getByRole("button", { name: "商品登録" }));
    await user.click(within(navigation).getByRole("button", { name: "商品一覧" }));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(3);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("paginates products every 20 items", async () => {
    const user = userEvent.setup();
    apiProducts = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      managementNumber: `TP-${String(index + 1).padStart(4, "0")}`,
      imageKey: null,
      mainCategory: "トップス",
      subCategory: null,
      size: "M",
      status: "selling",
      price: null,
      note: null,
      deletedAt: null,
    }));

    render(<InventoryDashboard />);

    expect(await screen.findByText("1-20 / 21件")).toBeInTheDocument();
    expect(screen.getByTestId("product-card-TP-0001")).toBeInTheDocument();
    expect(screen.queryByTestId("product-card-TP-0021")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("21-21 / 21件")).toBeInTheDocument();
    expect(screen.getByTestId("product-card-TP-0021")).toBeInTheDocument();
    expect(screen.queryByTestId("product-card-TP-0001")).not.toBeInTheDocument();
  });

  it("expands a product card to show details", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = await screen.findByTestId("product-card-TP-1038");
    expect(card).toHaveAttribute("aria-expanded", "false");

    await user.click(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("TP-1038")).toBeInTheDocument();
    expect(screen.getByText("¥6,800")).toBeInTheDocument();
    expect(screen.getByText("首元に小さな使用感あり")).toBeInTheDocument();
    expect(within(card).getByText("採寸")).toBeInTheDocument();
    expect(within(card).getByText("着丈 68.0")).toBeInTheDocument();
    expect(within(card).getByText("身幅 54.5")).toBeInTheDocument();
  });

  it("marks a registered product as sold from the status tooltip", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = await screen.findByTestId("product-card-TP-1042");
    await user.hover(within(card).getByRole("button", { name: "登録済み" }));
    await user.click(within(card).getByRole("button", { name: "売却する" }));

    await waitFor(() =>
      expect(within(card).getByRole("button", { name: "売却済み" })).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/products/1/status", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getAllByText("売却済み").length).toBeGreaterThan(0);
  });

  it("confirms before deleting a sold product", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);

    const card = await screen.findByTestId("product-card-TP-1029");
    await user.hover(within(card).getByRole("button", { name: "売却済み" }));
    await user.click(within(card).getByRole("button", { name: "完全削除" }));

    expect(screen.getByRole("dialog", { name: "商品を完全削除しますか" })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("dialog", { name: "商品を完全削除しますか" })).getByRole(
        "button",
        { name: "完全削除" },
      ),
    );

    await waitFor(() => expect(screen.queryByTestId("product-card-TP-1029")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/products/3", expect.objectContaining({ method: "DELETE" }));
  });

  it("sells all registered products at once", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByTestId("product-card-TP-1042");

    await user.click(screen.getByRole("button", { name: "登録済みを一括売却" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登録済みを一括売却" })).toBeDisabled(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/products/bulk/status", expect.objectContaining({ method: "POST" }));
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
    await screen.findByTestId("product-card-TP-1029");

    await user.click(screen.getByRole("button", { name: "売却済みを一括削除" }));

    expect(screen.getByRole("dialog", { name: "商品を完全削除しますか" })).toHaveTextContent(
      "売却済みの商品 1 件を完全削除します。",
    );

    await user.click(
      within(screen.getByRole("dialog", { name: "商品を完全削除しますか" })).getByRole(
        "button",
        { name: "完全削除" },
      ),
    );

    await waitFor(() => expect(screen.queryByTestId("product-card-TP-1029")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/products/bulk/delete", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("在庫数 2")).toBeInTheDocument();
  });

  it("shows an empty state when all products are deleted", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByTestId("product-card-TP-1042");

    await user.click(screen.getByRole("button", { name: "登録済みを一括売却" }));
    await user.click(screen.getByRole("button", { name: "売却済みを一括削除" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "商品を完全削除しますか" })).getByRole(
        "button",
        { name: "完全削除" },
      ),
    );

    expect(await screen.findByText("商品がありません")).toBeInTheDocument();
    expect(screen.getByText("在庫数 0")).toBeInTheDocument();
  });

  it("filters product cards by status", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByTestId("product-card-TP-1042");
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

  it("logs out through the auth API and queues a success popup", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");

    await user.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", {
      credentials: "include",
      method: "POST",
    });
    expect(window.sessionStorage.getItem("threadpick-auth-toast")).toContain(
      "ログアウトに成功しました。",
    );
    expect(pushMock).toHaveBeenCalledWith("/auth/login");
  });

  it("shows a failure popup when logout fails", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    logoutFails = true;

    await user.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(screen.getByRole("alert")).toHaveTextContent("ログアウトに失敗しました。");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("registers a product through the product API and refreshes the list", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    const registerForm = await openRegisterForm(user);
    const imageFile = new File(["fake-image"], "shirt.png", { type: "image/png" });

    await user.clear(within(registerForm).getByLabelText("管理番号"));
    await user.type(within(registerForm).getByLabelText("管理番号"), "TP-2000");
    await user.clear(within(registerForm).getByLabelText("販売価格"));
    await user.type(within(registerForm).getByLabelText("販売価格"), "7200");
    await user.upload(within(registerForm).getByLabelText("画像"), imageFile);
    await user.click(within(registerForm).getByRole("button", { name: "商品登録" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/products", expect.objectContaining({ method: "POST" })),
    );
    const createRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => url === "/api/products" && init?.method === "POST");
    expect(JSON.parse(String(createRequest?.[1]?.body))).toMatchObject({
      imageKey: expect.stringContaining("data:image/png;base64"),
    });
    expect(fetch).toHaveBeenCalledWith("/api/products/4/measurement", expect.objectContaining({ method: "PUT" }));
    expect(fetch).toHaveBeenCalledWith("/api/products/4/status", expect.objectContaining({ method: "PATCH" }));
    const createdCard = await screen.findByTestId("product-card-TP-2000");
    expect(within(createdCard).getByRole("img", { name: "TP-2000の商品画像" })).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/png;base64"),
    );
    expect(screen.getByText("在庫数 4")).toBeInTheDocument();
  });

  it("redirects to login when the session expires during product registration", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    const registerForm = await openRegisterForm(user);
    productCreateUnauthorized = true;

    await user.clear(within(registerForm).getByLabelText("管理番号"));
    await user.type(within(registerForm).getByLabelText("管理番号"), "TP-9000");
    await user.click(within(registerForm).getByRole("button", { name: "商品登録" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/auth/login"));
    expect(window.sessionStorage.getItem("threadpick-auth-toast")).toContain(
      "セッションの有効期限が切れました。再度ログインしてください。",
    );
  });

  it("shows a Japanese validation message before posting a duplicate management number", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    const registerForm = await openRegisterForm(user);

    await user.clear(within(registerForm).getByLabelText("管理番号"));
    await user.type(within(registerForm).getByLabelText("管理番号"), "TP-1042");
    await user.click(within(registerForm).getByRole("button", { name: "商品登録" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "管理番号「TP-1042」はすでに登録されています。別の管理番号を入力してください。",
    );
    expect(fetch).not.toHaveBeenCalledWith("/api/products", expect.objectContaining({ method: "POST" }));
  });

  it("keeps price and measurement inputs numeric while typing", async () => {
    const user = userEvent.setup();
    render(<InventoryDashboard />);
    await screen.findByText("在庫数 3");
    const registerForm = await openRegisterForm(user);
    const priceInput = within(registerForm).getByLabelText("販売価格");
    const lengthInput = within(registerForm).getByLabelText("着丈");

    await user.type(priceInput, "68a00円");
    await user.clear(lengthInput);
    await user.type(lengthInput, "68.a5cm");

    expect(priceInput).toHaveValue("6800");
    expect(lengthInput).toHaveValue("68.5");
  });
});
