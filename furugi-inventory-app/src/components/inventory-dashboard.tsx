"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./inventory-dashboard.module.css";
import { AuthToast, queueAuthToast, useQueuedAuthToast } from "./auth-toast";

type ProductStatus = "登録済み" | "売却済み";
type ProductFilter = "all" | ProductStatus;

type Measurement = {
  label: string;
  value: string;
};

type Product = {
  number: string;
  category: string;
  image: string;
  measurements: Measurement[];
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
  { label: "着丈", value: "68.0" },
  { label: "身幅", value: "54.5" },
  { label: "肩幅", value: "47.0" },
  { label: "袖丈", value: "59.0" },
];

const initialProducts: Product[] = [
  {
    number: "TP-1042",
    category: "アウター",
    image: "/images/dummy-vintage-sweatshirt.png",
    measurements,
    size: "L",
    status: "登録済み",
    price: "未設定",
  },
  {
    number: "TP-1038",
    category: "トップス",
    image: "/images/dummy-vintage-sweatshirt.png",
    measurements,
    size: "M",
    status: "登録済み",
    price: "¥6,800",
  },
  {
    number: "TP-1029",
    category: "ボトムス",
    image: "/images/dummy-vintage-sweatshirt.png",
    measurements,
    size: "FREE",
    status: "売却済み",
    price: "¥5,400",
  },
];

export function InventoryDashboard() {
  const router = useRouter();
  const [toast, setToast] = useQueuedAuthToast();
  const [products, setProducts] = useState(initialProducts);
  const [expandedProduct, setExpandedProduct] = useState(initialProducts[0].number);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const registeredCount = products.filter((product) => product.status === "登録済み").length;
  const soldCount = products.filter((product) => product.status === "売却済み").length;
  const filteredProducts = products.filter((product) =>
    productFilter === "all" ? true : product.status === productFilter,
  );
  const inventoryOverview = [
    { label: "在庫数", value: String(products.length) },
    { label: "登録済み", value: String(registeredCount) },
    { label: "売却済み", value: String(soldCount) },
  ];

  function updateProductStatus(productNumber: string, status: ProductStatus) {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.number === productNumber ? { ...product, status } : product,
      ),
    );
  }

  function deleteProduct(productNumber: string) {
    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.number !== productNumber),
    );
    setExpandedProduct((current) => (current === productNumber ? "" : current));
    setDeleteTarget(null);
  }

  function sellRegisteredProducts() {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.status === "登録済み" ? { ...product, status: "売却済み" } : product,
      ),
    );
  }

  function deleteSoldProducts() {
    const soldProductNumbers = products
      .filter((product) => product.status === "売却済み")
      .map((product) => product.number);

    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.status !== "売却済み"),
    );
    setExpandedProduct((current) => (soldProductNumbers.includes(current) ? "" : current));
    setDeleteTarget(null);
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
        <div>
          <p className={styles.kicker}>Threadpick Inventory</p>
          <h1>古着在庫・販売管理</h1>
        </div>
        <button className={styles.primaryButton} onClick={logout} type="button">
          ログアウト
        </button>
      </header>

      <details className={styles.overviewDropdown}>
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
        <section className={styles.formPanel} aria-labelledby="register-heading">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>Register</p>
              <h2 id="register-heading">商品登録</h2>
            </div>
          </div>

          <form aria-label="商品登録フォーム" className={styles.formGrid}>
            <label>
              管理番号
              <input defaultValue="TP-1043" />
            </label>
            <label>
              大カテゴリ
              <select defaultValue="トップス">
                <option>トップス</option>
                <option>アウター</option>
                <option>ボトムス</option>
                <option>バッグ</option>
              </select>
            </label>
            <label>
              小カテゴリ
              <input placeholder="例: スウェット / デニム / ショルダー" />
            </label>
            <label>
              サイズ
              <select defaultValue="M">
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
              <input inputMode="numeric" placeholder="6800" />
            </label>

            <fieldset className={styles.measurementFieldset}>
              <legend>採寸入力(cm)</legend>
              <div className={styles.measureGrid}>
                {measurements.map((item) => (
                  <label key={item.label}>
                    {item.label}
                    <input defaultValue={item.value} inputMode="decimal" />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.fullWidth}>
              画像
              <input accept="image/*" type="file" />
            </label>
            <label className={styles.fullWidth}>
              備考
              <textarea rows={3} placeholder="素材感、ダメージ、販売メモ" />
            </label>
            <div className={styles.formActions}>
              <button type="button">商品登録</button>
            </div>
          </form>
        </section>
      </section>

      <section className={styles.inventoryArea} aria-labelledby="list-heading">
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
                onClick={() => setProductFilter("all")}
                type="button"
              >
                すべて
              </button>
              <button
                aria-pressed={productFilter === "登録済み"}
                className={productFilter === "登録済み" ? styles.activeSegment : ""}
                onClick={() => setProductFilter("登録済み")}
                type="button"
              >
                登録済み
              </button>
              <button
                aria-pressed={productFilter === "売却済み"}
                className={productFilter === "売却済み" ? styles.activeSegment : ""}
                onClick={() => setProductFilter("売却済み")}
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
          <p className={styles.emptyState}>商品がありません</p>
        ) : (
          <div className={styles.productGrid}>
            {filteredProducts.map((product) => {
              const isExpanded = expandedProduct === product.number;

              return (
                <article
                  aria-expanded={isExpanded}
                  className={`${styles.productCard} ${isExpanded ? styles.expandedCard : ""}`}
                  data-testid={`product-card-${product.number}`}
                  key={product.number}
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
                            updateProductStatus(product.number, "売却済み");
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
                            onClick={() => updateProductStatus(product.number, "売却済み")}
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
                            削除
                          </button>
                          <button
                            className={styles.tooltipRestoreButton}
                            onClick={() => updateProductStatus(product.number, "登録済み")}
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
            <h2 id="delete-dialog-title">商品を削除しますか</h2>
            <p>
              {deleteTarget.type === "single"
                ? `${deleteTarget.product.number} を一覧から削除します。`
                : `売却済みの商品 ${deleteTarget.count} 件を一覧から削除します。`}
            </p>
            <div className={styles.dialogActions}>
              <button onClick={() => setDeleteTarget(null)} type="button">
                キャンセル
              </button>
              <button
                className={styles.deleteButton}
                onClick={() => {
                  if (deleteTarget.type === "single") {
                    deleteProduct(deleteTarget.product.number);
                    return;
                  }
                  deleteSoldProducts();
                }}
                type="button"
              >
                削除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
