import Link from "next/link";
import { WaterBackdrop } from "./_components/PaintedWater";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.root}>
      <div className={styles.cover}>
        <WaterBackdrop />
        <nav className={styles.routes} aria-label="Enter the exhibition">
          <Link href="/phone">Join on your phone <span aria-hidden>↗</span></Link>
          <Link href="/screen">Open the projection <span aria-hidden>→</span></Link>
        </nav>
      </div>
    </main>
  );
}
