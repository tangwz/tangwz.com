interface Letter {
  sample: boolean;
  slug: string;
  number: string;
  title: string;
  intro: string;
  paragraphs: string[];
  question: string;
}

export const letters: Letter[] = [];

export function getLetters(_locale: string): Letter[] {
  return letters;
}
