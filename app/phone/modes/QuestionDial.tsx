"use client";

import { useState } from "react";
import { ANSWER_SCALE, SNS_QUESTIONS } from "@/lib/questions";
import { shortTag } from "@/lib/playerId";
import type { PlayerQuestion } from "@/lib/protocol";
import { BettaPreview } from "../BettaPreview";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import styles from "./QuestionDial.module.css";

export function QuestionDial({ question, playerId, onAnswer }: {
  question: PlayerQuestion;
  playerId: string;
  onAnswer: (index: number, value: number) => void;
}) {
  const item = SNS_QUESTIONS[question.index];
  const formation = (question.index + Number(question.answered)) / SNS_QUESTIONS.length;
  return (
    <main className={styles.root}>
      <WaterBackdrop />
      <header className={styles.question}>
        <p className={styles.progress}>{question.index + 1} / {SNS_QUESTIONS.length}</p>
        <h1>{item.prompt}</h1>
        <div className={styles.scale}>
          <span><b>0</b> {ANSWER_SCALE.low}</span>
          <span><b>10</b> {ANSWER_SCALE.high}</span>
        </div>
      </header>
      <div className={styles.preview}>
        <div className={styles.formation} style={{ opacity: 0.80 + formation * 0.20, transform: `scale(${0.84 + formation * 0.16})` }}>
          <BettaPreview genome={question.preview} playerId={playerId} tag={shortTag(playerId)} width={240} />
        </div>
        <p className={styles.feedback} aria-live="polite">
          {question.answered ? `Your answer shaped its ${item.effect}.` : "Pick a number, then press Send."}
        </p>
      </div>
      <DialPad key={question.index} answered={question.answered} onSend={(value) => onAnswer(question.index, value)} />
    </main>
  );
}

function DialPad({ answered, onSend }: { answered: boolean; onSend: (value: number) => void }) {
  const [digits, setDigits] = useState("");
  const press = (digit: number) => {
    setDigits((value) => value === "1" && digit === 0 ? "10" : String(digit));
  };
  return (
    <form className={styles.dial} onSubmit={(event) => {
      event.preventDefault();
      if (!answered && digits !== "") onSend(Number(digits));
    }}>
      <output className={styles.value} aria-live="polite">{answered ? "Sent" : digits || "—"}</output>
      <div className={styles.keys}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button key={digit} type="button" disabled={answered} onClick={() => press(digit)}>{digit}</button>
        ))}
        <button type="button" className={styles.action} disabled={answered || digits === ""} onClick={() => setDigits("")}>Clear</button>
        <button type="button" disabled={answered} onClick={() => press(0)}>0</button>
        <button type="submit" className={styles.send} disabled={answered || digits === ""}>Send</button>
      </div>
    </form>
  );
}
