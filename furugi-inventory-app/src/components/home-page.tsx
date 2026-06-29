"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api/client";
import { InventoryDashboard } from "./inventory-dashboard";
import styles from "./home-page.module.css";

type AuthState = "checking" | "authenticated" | "guest";

const overviewItems = [
  {
    title: "古着在庫を一元管理",
    body: "管理番号、カテゴリ、サイズ、状態、販売価格、備考をまとめて登録し、商品カードで確認できます。",
  },
  {
    title: "画像と採寸をまとめて保存",
    body: "商品画像と着丈・身幅・肩幅・袖丈を同じ登録フローで残せます。",
  },
  {
    title: "販売後の整理を簡単に",
    body: "登録済み・売却済みの切り替え、一括売却、完全削除まで画面上で操作できます。",
  },
];

const usageSteps = [
  {
    title: "アカウント作成",
    body: "サインアップ後、ログインして在庫管理画面へ進みます。",
  },
  {
    title: "商品登録",
    body: "管理番号やカテゴリ、価格、画像、採寸、備考を入力します。",
  },
  {
    title: "一覧で確認",
    body: "カードを開くと管理番号、カテゴリ、価格、採寸、備考を確認できます。",
  },
  {
    title: "販売処理",
    body: "商品ごとの売却、登録済みへの戻し、一括売却や完全削除を行います。",
  },
];

function PublicHomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.kicker}>Threadpick Inventory</p>
          <h1>古着在庫・販売管理</h1>
          <p className={styles.lead}>
            古着商品の登録、画像確認、採寸、売却済み管理をひとつの画面で進めるための在庫管理アプリです。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/auth/login">
              ログイン
            </Link>
            <Link className={styles.secondaryLink} href="/auth/signup">
              サインアップ
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        <section aria-labelledby="overview-heading">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Overview</p>
            <h2 id="overview-heading">できること</h2>
          </div>
          <div className={styles.overview}>
            {overviewItems.map((item) => (
              <article className={styles.overviewItem} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="usage-heading" className={styles.usage}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>How to use</p>
            <h2 id="usage-heading">使い方</h2>
          </div>
          <ol className={styles.steps}>
            {usageSteps.map((step, index) => (
              <li key={step.title}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

export function HomePage() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!isCancelled) setAuthState("guest");
    }, 3000);

    void fetch(apiUrl("/api/auth/me"), {
      credentials: "include",
    })
      .then((response) => {
        if (isCancelled) return;
        window.clearTimeout(timeoutId);
        setAuthState(response.ok ? "authenticated" : "guest");
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        if (!isCancelled) setAuthState("guest");
      });

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (authState === "checking") {
    return <main className={styles.loading}>ログイン状態を確認中</main>;
  }

  return authState === "authenticated" ? <InventoryDashboard /> : <PublicHomePage />;
}
