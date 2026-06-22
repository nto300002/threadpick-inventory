import { StatusBoard } from "@/components/status-board";
import { PRODUCT_STATUSES } from "@/lib/domain/status";

export default function Home() {
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Threadpick Inventory</p>
        <h1>古着在庫・販売管理</h1>
        <p className="lead">
          商品登録、採寸、販売、売却済み管理を一つの作業画面にまとめるための
          MVP です。
        </p>
        <StatusBoard statuses={PRODUCT_STATUSES} />
      </section>
    </main>
  );
}
