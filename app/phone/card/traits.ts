// Genome → the lines printed on a visitor's betta card.

import type { Genome } from "@/lib/protocol";

export type Trait = { label: string; text: string };

const level = (v: number) => (v < 0.34 ? 0 : v > 0.66 ? 2 : 1);
const pick = (v: number, words: [string, string, string]) => words[level(v)];

const COLOURS: [number, string][] = [
  [0.04, "red"], [0.1, "coral"], [0.16, "amber"], [0.24, "gold"], [0.42, "green"],
  [0.52, "teal"], [0.66, "blue"], [0.78, "violet"], [0.92, "magenta"], [1, "red"],
];

export function colourName(hue: number): string {
  const h = ((hue % 1) + 1) % 1;
  return COLOURS.find(([until]) => h <= until)?.[1] ?? "red";
}

export function traits(genome: Genome): Trait[] {
  const lines: Trait[] = [
    { label: "Colour", text: colourName(genome.hue).replace(/^./, (c) => c.toUpperCase()) },
    { label: "Finish", text: pick(genome.saturation, ["Plain, wild colouring", "A little polished", "Bred bright, every scale chosen"]) },
    { label: "Fins", text: pick(genome.finLength, ["Short, keeps to itself", "A fair length", "Long, made to be seen"]) },
    { label: "Space", text: pick(genome.boundary, ["Lets others swim close", "Keeps a little room", "Needs wide water of its own"]) },
    { label: "Company", text: pick(genome.sociability, ["Swims alone", "Joins in now and then", "Drifts toward the others"]) },
  ];
  return lines;
}
