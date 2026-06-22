import type { ProductStatusDefinition } from "@/lib/domain/status";
import styles from "./status-board.module.css";

type StatusBoardProps = {
  statuses: ProductStatusDefinition[];
};

export function StatusBoard({ statuses }: StatusBoardProps) {
  return (
    <section className={styles.board} aria-label="商品ステータス">
      {statuses.map((status) => (
        <article className={styles.card} key={status.value}>
          <div className={styles.cardTop}>
            <p className={styles.label}>{status.label}</p>
            <span aria-hidden="true" />
          </div>
          <p className={styles.description}>{status.description}</p>
        </article>
      ))}
    </section>
  );
}
