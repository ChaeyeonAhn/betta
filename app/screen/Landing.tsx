import styles from "./Landing.module.css";

export function Landing({ diving, onDiveEnd, joined }: { diving: boolean; onDiveEnd: () => void; joined: number }) {
  return (
    <section
      className={styles.landing}
      data-diving={diving}
      onAnimationEnd={(event) => {
        // The DOM clock completes the entry even without a WebGL context.
        if (diving && event.target === event.currentTarget) onDiveEnd();
      }}
    >
      <div className={styles.air} aria-hidden />
      <div className={styles.invitation}>
        <h1>Scan to dive into the Betta Project</h1>
        <div className={styles.qrCard}>
          <img src="/qr-code.svg" alt="QR code to join Betta on your phone" width={66} height={66} />
        </div>
        <p className={styles.joined} aria-label={`${joined} joined`}>{joined}</p>
      </div>
    </section>
  );
}
