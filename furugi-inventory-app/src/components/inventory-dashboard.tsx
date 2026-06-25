"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./inventory-dashboard.module.css";
import { AuthToast, queueAuthToast, useQueuedAuthToast } from "./auth-toast";

type ApiProductStatus = "unmeasured" | "measured" | "selling" | "sold" | "returned";
type ProductSize = "XS" | "S" | "M" | "L" | "XL" | "2XL" | "3XL" | "FREE" | "不明";
type ProductStatus = "登録済み" | "売却済み";
type ProductFilter = "all" | ProductStatus;

type ApiProduct = {
  id: number;
  managementNumber: string;
  imageKey: string | null;
  mainCategory: string;
  subCategory: string | null;
  size: ProductSize;
  status: ApiProductStatus;
  price: number | null;
  note: string | null;
  deletedAt?: string | null;
};

type ApiMeasurement = {
  lengthCm: number | null;
  bodyWidthCm: number | null;
  shoulderWidthCm: number | null;
  sleeveLengthCm: number | null;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

type Measurement = {
  label: string;
  value: string;
};

type Product = {
  id: number;
  apiStatus: ApiProductStatus;
  number: string;
  category: string;
  image: string;
  measurements: Measurement[];
  note: string;
  size: string;
  status: ProductStatus;
  price: string;
};

type DeleteTarget =
  | {
      type: "single";
      product: Product;
    }
  | {
      type: "sold";
      count: number;
    };

const measurements: Measurement[] = [
  { label: "着丈", value: "0" },
  { label: "身幅", value: "0" },
  { label: "肩幅", value: "0" },
  { label: "袖丈", value: "0" },
];

const registeredApiStatuses: ApiProductStatus[] = ["unmeasured", "measured", "selling", "returned"];
const dummyImage = "/images/dummy-vintage-sweatshirt.png";
const productsPerPage = 20;

function uiStatus(status: ApiProductStatus): ProductStatus {
  return status === "sold" ? "売却済み" : "登録済み";
}

function formatPrice(price: number | null) {
  return price == null ? "未設定" : `¥${price.toLocaleString("ja-JP")}`;
}

function formatMeasurement(label: string, value: number | null | undefined) {
  if (value == null) return { label, value: "-" };
  return { label, value: Number.isInteger(value) ? value.toFixed(1) : String(value) };
}

function productImage(imageKey: string | null) {
  if (!imageKey) return dummyImage;
  if (imageKey.startsWith("/") || imageKey.startsWith("http") || imageKey.startsWith("data:")) {
    return imageKey;
  }
  return dummyImage;
}

function toUiProduct(product: ApiProduct, measurement?: ApiMeasurement | null): Product {
  return {
    id: product.id,
    apiStatus: product.status,
    number: product.managementNumber,
    category: product.subCategory ? `${product.mainCategory} / ${product.subCategory}` : product.mainCategory,
    image: productImage(product.imageKey),
    measurements: [
      formatMeasurement("着丈", measurement?.lengthCm),
      formatMeasurement("身幅", measurement?.bodyWidthCm),
      formatMeasurement("肩幅", measurement?.shoulderWidthCm),
      formatMeasurement("袖丈", measurement?.sleeveLengthCm),
    ],
    note: product.note ?? "",
    size: product.size,
    status: uiStatus(product.status),
    price: formatPrice(product.price),
  };
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function readApiError(response: Response) {
  try {
    const body = await readJson<ApiErrorResponse>(response);
    return body.message;
  } catch {
    return null;
  }
}

function optionalNumber(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}

function keepDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function keepDecimalNumberOnly(value: string) {
  const numeric = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = numeric.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
}

function sanitizeInput(event: FormEvent<HTMLInputElement>, sanitizer: (value: string) => string) {
  const sanitized = sanitizer(event.currentTarget.value);
  if (event.currentTarget.value !== sanitized) {
    event.currentTarget.value = sanitized;
  }
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    Number(value.size) > 0
  );
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

export function InventoryDashboard() {
  const router = useRouter();
  const [toast, setToast] = useQueuedAuthToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [expandedProduct, setExpandedProduct] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const registeredCount = products.filter((product) => product.status === "登録済み").length;
  const soldCount = products.filter((product) => product.status === "売却済み").length;
  const filteredProducts = products.filter((product) =>
    productFilter === "all" ? true : product.status === productFilter,
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * productsPerPage;
  const paginatedProducts = filteredProducts.slice(pageStartIndex, pageStartIndex + productsPerPage);
  const visibleStart = filteredProducts.length === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + productsPerPage, filteredProducts.length);
  const inventoryOverview = [
    { label: "在庫数", value: String(products.length) },
    { label: "登録済み", value: String(registeredCount) },
    { label: "売却済み", value: String(soldCount) },
  ];

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function changeProductFilter(filter: ProductFilter) {
    setProductFilter(filter);
    setCurrentPage(1);
  }

  const handleExpiredSession = useCallback(() => {
    queueAuthToast({
      intent: "error",
      message: "セッションの有効期限が切れました。再度ログインしてください。",
    });
    router.push("/auth/login");
  }, [router]);

  async function fetchProductsFromApi() {
    let response: Response;
    try {
      response = await fetch("/api/products?includeDeleted=true", {
        credentials: "include",
      });
    } catch {
      return null;
    }

    if (response.status === 401) {
      return "unauthorized" as const;
    }

    if (!response.ok) {
      return null;
    }

    const body = await readJson<{ products: ApiProduct[] }>(response);
    return Promise.all(
      body.products.map(async (product) => {
        const measurementResponse = await fetch(`/api/products/${product.id}/measurement`, {
          credentials: "include",
        });
        const measurement =
          measurementResponse.ok
            ? (await readJson<{ measurement: ApiMeasurement | null }>(measurementResponse)).measurement
            : null;
        return toUiProduct(product, measurement);
      }),
    );
  }

  function applyProducts(productsWithMeasurements: Product[]) {
    setProducts(productsWithMeasurements);
    setExpandedProduct((current) =>
      current && productsWithMeasurements.some((product) => product.number === current)
        ? current
        : (productsWithMeasurements[0]?.number ?? ""),
    );
    setIsLoading(false);
  }

  async function loadProducts() {
    const result = await fetchProductsFromApi();
    if (result === "unauthorized") {
      handleExpiredSession();
      return;
    }
    if (!result) {
      setToast({ intent: "error", message: "商品一覧の取得に失敗しました。" });
      setIsLoading(false);
      return;
    }
    applyProducts(result);
  }

  useEffect(() => {
    let isCancelled = false;

    void fetchProductsFromApi().then((result) => {
      if (isCancelled) return;
      if (result === "unauthorized") {
        handleExpiredSession();
        return;
      }
      if (!result) {
        setToast({ intent: "error", message: "商品一覧の取得に失敗しました。" });
        setIsLoading(false);
        return;
      }
      applyProducts(result);
    });

    return () => {
      isCancelled = true;
    };
  }, [handleExpiredSession, setToast]);

  async function registerProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const managementNumber = String(formData.get("managementNumber") ?? "").trim();
    const mainCategory = String(formData.get("mainCategory") ?? "").trim();
    const size = String(formData.get("size") ?? "M") as ProductSize;
    const image = formData.get("image");
    const imageKey = selectedImageDataUrl ?? (isUploadedFile(image) ? await fileToDataUrl(image) : null);
    const price = optionalNumber(formData, "price");

    if (products.some((product) => product.number === managementNumber)) {
      setToast({
        intent: "error",
        message: `管理番号「${managementNumber}」はすでに登録されています。別の管理番号を入力してください。`,
      });
      return;
    }

    const response = await fetch("/api/products", {
      body: JSON.stringify({
        managementNumber,
        imageKey,
        mainCategory,
        subCategory: String(formData.get("subCategory") ?? "").trim() || null,
        size,
        price: Number.isFinite(price) ? price : null,
        note: String(formData.get("note") ?? "").trim() || null,
      }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      setToast({ intent: "error", message: (await readApiError(response)) ?? "商品登録に失敗しました。" });
      return;
    }

    const body = await readJson<{ product: ApiProduct }>(response);
    const measurementBody = {
      lengthCm: optionalNumber(formData, "lengthCm"),
      bodyWidthCm: optionalNumber(formData, "bodyWidthCm"),
      shoulderWidthCm: optionalNumber(formData, "shoulderWidthCm"),
      sleeveLengthCm: optionalNumber(formData, "sleeveLengthCm"),
    };
    const measurementResponse = await fetch(`/api/products/${body.product.id}/measurement`, {
      body: JSON.stringify(measurementBody),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    if (measurementResponse.status === 401) {
      handleExpiredSession();
      return;
    }

    const statusResponse = await fetch(`/api/products/${body.product.id}/status`, {
      body: JSON.stringify({ status: "selling" }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    if (statusResponse.status === 401) {
      handleExpiredSession();
      return;
    }
    setToast({ intent: "success", message: "商品登録に成功しました。" });
    form.reset();
    setSelectedImageDataUrl(null);
    await loadProducts();
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setSelectedImageDataUrl(file ? await fileToDataUrl(file) : null);
  }

  async function updateProductStatus(product: Product, status: ProductStatus) {
    const apiStatus: ApiProductStatus = status === "売却済み" ? "sold" : "selling";
    const response = await fetch(`/api/products/${product.id}/status`, {
      body: JSON.stringify({ status: apiStatus }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      setToast({ intent: "error", message: "ステータス変更に失敗しました。" });
      return;
    }

    setToast({ intent: "success", message: "ステータス変更に成功しました。" });
    await loadProducts();
  }

  async function deleteProduct(product: Product) {
    const response = await fetch(`/api/products/${product.id}`, {
      credentials: "include",
      method: "DELETE",
    });

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      setToast({ intent: "error", message: "商品の削除に失敗しました。" });
      return;
    }

    setToast({ intent: "success", message: "商品を完全削除しました。" });
    setDeleteTarget(null);
    await loadProducts();
  }

  async function sellRegisteredProducts() {
    const ids = products
      .filter((product) => registeredApiStatuses.includes(product.apiStatus))
      .map((product) => product.id);
    const response = await fetch("/api/products/bulk/status", {
      body: JSON.stringify({ ids, status: "sold" }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      setToast({ intent: "error", message: "一括売却に失敗しました。" });
      return;
    }

    setToast({ intent: "success", message: "一括売却に成功しました。" });
    await loadProducts();
  }

  async function deleteSoldProducts() {
    const response = await fetch("/api/products/bulk/delete", {
      body: JSON.stringify({ status: "sold" }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      setToast({
        intent: "error",
        message: "一括削除に失敗しました。",
      });
      return;
    }

    setToast({ intent: "success", message: "売却済み商品を完全削除しました。" });
    setDeleteTarget(null);
    await loadProducts();
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", {
      credentials: "include",
      method: "POST",
    });

    if (!response.ok) {
      setToast({
        intent: "error",
        message: "ログアウトに失敗しました。",
      });
      return;
    }

    queueAuthToast({
      intent: "success",
      message: "ログアウトに成功しました。",
    });
    router.push("/auth/login");
  }

  return (
    <main className={styles.page}>
      <AuthToast toast={toast} />
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <p className={styles.kicker}>Threadpick Inventory</p>
          <h1>古着在庫・販売管理</h1>
        </div>
        <div className={styles.headerActions}>
          <nav aria-label="セクション移動" className={styles.sectionNav}>
            <button onClick={() => scrollToSection("inventory-summary")} type="button">
              在庫
            </button>
            <button onClick={() => scrollToSection("product-register")} type="button">
              商品登録
            </button>
            <button onClick={() => scrollToSection("product-list")} type="button">
              商品一覧
            </button>
          </nav>
          <button className={styles.primaryButton} onClick={logout} type="button">
            ログアウト
          </button>
        </div>
      </header>

      <details className={styles.overviewDropdown} id="inventory-summary">
        <summary>
          <span>在庫・ステータス</span>
          <strong>在庫数 {products.length}</strong>
        </summary>
        <div className={styles.overviewMenu} aria-label="在庫と作業ステータス">
          {inventoryOverview.map((item) => (
            <div className={styles.overviewItem} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </details>

      <section className={styles.workspace}>
        <details className={styles.formPanel} id="product-register">
          <summary aria-label="商品登録フォームを開閉" className={styles.registerSummary}>
            <div>
              <p className={styles.sectionLabel}>Register</p>
              <h2 id="register-heading">商品登録</h2>
            </div>
          </summary>

          <form aria-label="商品登録フォーム" className={styles.formGrid} onSubmit={registerProduct}>
            <label>
              管理番号
              <input name="managementNumber" placeholder="例: TP-1043" required />
            </label>
            <label>
              大カテゴリ
              <select defaultValue="トップス" name="mainCategory">
                <option>トップス</option>
                <option>アウター</option>
                <option>ボトムス</option>
                <option>バッグ</option>
              </select>
            </label>
            <label>
              小カテゴリ
              <input name="subCategory" placeholder="例: スウェット / デニム / ショルダー" />
            </label>
            <label>
              サイズ
              <select defaultValue="M" name="size">
                <option>XS</option>
                <option>S</option>
                <option>M</option>
                <option>L</option>
                <option>XL</option>
                <option>FREE</option>
              </select>
            </label>
            <label>
              販売価格
              <input
                inputMode="numeric"
                name="price"
                onInput={(event) => sanitizeInput(event, keepDigitsOnly)}
                pattern="[0-9]*"
                placeholder="6800"
              />
            </label>

            <fieldset className={styles.measurementFieldset}>
              <legend>採寸入力(cm)</legend>
              <div className={styles.measureGrid}>
                {[
                  { ...measurements[0], name: "lengthCm" },
                  { ...measurements[1], name: "bodyWidthCm" },
                  { ...measurements[2], name: "shoulderWidthCm" },
                  { ...measurements[3], name: "sleeveLengthCm" },
                ].map((item) => (
                  <label key={item.label}>
                    {item.label}
                    <input
                      defaultValue={item.value}
                      inputMode="decimal"
                      name={item.name}
                      onInput={(event) => sanitizeInput(event, keepDecimalNumberOnly)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.imageField}>
              画像
              <input accept="image/*" name="image" onChange={handleImageChange} type="file" />
            </label>
            <label className={styles.noteField}>
              備考
              <textarea name="note" rows={3} placeholder="素材感、ダメージ、販売メモ" />
            </label>
            <div className={styles.formActions}>
              <button type="submit">商品登録</button>
            </div>
          </form>
        </details>
      </section>

      <section className={styles.inventoryArea} id="product-list" aria-labelledby="list-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>Inventory</p>
            <h2 id="list-heading">商品一覧</h2>
          </div>
          <div className={styles.listControls}>
            <div className={styles.segmented} aria-label="状態フィルター">
              <button
                aria-pressed={productFilter === "all"}
                className={productFilter === "all" ? styles.activeSegment : ""}
                onClick={() => changeProductFilter("all")}
                type="button"
              >
                すべて
              </button>
              <button
                aria-pressed={productFilter === "登録済み"}
                className={productFilter === "登録済み" ? styles.activeSegment : ""}
                onClick={() => changeProductFilter("登録済み")}
                type="button"
              >
                登録済み
              </button>
              <button
                aria-pressed={productFilter === "売却済み"}
                className={productFilter === "売却済み" ? styles.activeSegment : ""}
                onClick={() => changeProductFilter("売却済み")}
                type="button"
              >
                売却済み
              </button>
            </div>
            <div className={styles.bulkActions} aria-label="一括操作">
              <button
                disabled={registeredCount === 0}
                onClick={sellRegisteredProducts}
                type="button"
              >
                登録済みを一括売却
              </button>
              <button
                className={styles.bulkDeleteButton}
                disabled={soldCount === 0}
                onClick={() => setDeleteTarget({ type: "sold", count: soldCount })}
                type="button"
              >
                売却済みを一括削除
              </button>
            </div>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <p className={styles.emptyState}>{isLoading ? "読み込み中" : "商品がありません"}</p>
        ) : (
          <>
            <div className={styles.paginationInfo}>
              {visibleStart}-{visibleEnd} / {filteredProducts.length}件
            </div>
            <div className={styles.productGrid}>
              {paginatedProducts.map((product) => {
                const isExpanded = expandedProduct === product.number;

                return (
                  <article
                    aria-expanded={isExpanded}
                    className={`${styles.productCard} ${isExpanded ? styles.expandedCard : ""}`}
                    data-testid={`product-card-${product.number}`}
                    key={product.id}
                    onClick={() => setExpandedProduct(isExpanded ? "" : product.number)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedProduct(isExpanded ? "" : product.number);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Image
                      alt={`${product.number}の商品画像`}
                      className={styles.productImage}
                      height={640}
                      src={product.image}
                      width={640}
                    />
                    <div className={styles.cardCompactInfo}>
                      <span>{product.size}</span>
                      <div
                        className={styles.statusAction}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className={`${styles.statusPill} ${
                            product.status === "売却済み" ? styles.soldStatus : ""
                          }`}
                          onClick={() => {
                            if (product.status === "登録済み") {
                              void updateProductStatus(product, "売却済み");
                            }
                          }}
                          type="button"
                        >
                          {product.status}
                        </button>
                        {product.status === "登録済み" ? (
                          <div
                            className={`${styles.statusTooltip} ${styles.registeredTooltip}`}
                            role="tooltip"
                          >
                            <button
                              onClick={() => void updateProductStatus(product, "売却済み")}
                              type="button"
                            >
                              売却する
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`${styles.statusTooltip} ${styles.soldTooltip}`}
                            role="tooltip"
                          >
                            <button
                              className={styles.tooltipDeleteButton}
                              onClick={() => setDeleteTarget({ type: "single", product })}
                              type="button"
                            >
                              完全削除
                            </button>
                            <button
                              className={styles.tooltipRestoreButton}
                              onClick={() => void updateProductStatus(product, "登録済み")}
                              type="button"
                            >
                              登録済みに戻す
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <dl className={styles.productDetails}>
                        <div>
                          <dt>管理番号</dt>
                          <dd>{product.number}</dd>
                        </div>
                        <div>
                          <dt>カテゴリ</dt>
                          <dd>{product.category}</dd>
                        </div>
                        <div>
                          <dt>サイズ</dt>
                          <dd>{product.size}</dd>
                        </div>
                        <div>
                          <dt>状態</dt>
                          <dd>{product.status}</dd>
                        </div>
                        <div>
                          <dt>価格</dt>
                          <dd>{product.price}</dd>
                        </div>
                        <div>
                          <dt>備考</dt>
                          <dd>{product.note || "-"}</dd>
                        </div>
                        <div className={styles.productMeasurements}>
                          <dt>採寸</dt>
                          <dd>
                            {product.measurements.map((item) => (
                              <span key={item.label}>
                                {item.label} {item.value}
                              </span>
                            ))}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="商品一覧ページ">
                <button
                  disabled={visiblePage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  前へ
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    aria-current={visiblePage === page ? "page" : undefined}
                    className={visiblePage === page ? styles.activePage : ""}
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ))}
                <button
                  disabled={visiblePage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  type="button"
                >
                  次へ
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {deleteTarget ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            aria-labelledby="delete-dialog-title"
            aria-modal="true"
            className={styles.dialog}
            role="dialog"
          >
            <h2 id="delete-dialog-title">商品を完全削除しますか</h2>
            <p>
              {deleteTarget.type === "single"
                ? `${deleteTarget.product.number} を完全削除します。`
                : `売却済みの商品 ${deleteTarget.count} 件を完全削除します。`}
            </p>
            <div className={styles.dialogActions}>
              <button onClick={() => setDeleteTarget(null)} type="button">
                キャンセル
              </button>
              <button
                className={styles.deleteButton}
                onClick={() => {
                  if (deleteTarget.type === "single") {
                    void deleteProduct(deleteTarget.product);
                    return;
                  }
                  void deleteSoldProducts();
                }}
                type="button"
              >
                完全削除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
