import Link from "next/link";
import { ExhibitionBetta } from "./_components/ExhibitionBetta";
import { WaterBackdrop } from "./_components/PaintedWater";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.root}>
      <div className={styles.cover}>
        <WaterBackdrop />
        <div className={styles.intro}>
          <h1 lang="en">Betta</h1>
          <p>휴대폰에서 태어난 나의 베타를<br />하나의 수조에 풀어놓는 참여형 전시.</p>
        </div>
        <div className={styles.specimen} aria-hidden><ExhibitionBetta /></div>
        <nav className={styles.routes} aria-label="전시 입장">
          <Link href="/phone">휴대폰으로 참여하기 <span aria-hidden>↗</span></Link>
          <Link href="/screen">프로젝션 열기 <span aria-hidden>→</span></Link>
        </nav>
      </div>
    </main>
  );
}
