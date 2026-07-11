declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

declare module "hanzi-writer" {
  interface HanziWriterOptions {
    width?: number;
    height?: number;
    padding?: number;
    strokeAnimationSpeed?: number;
    delayBetweenStrokes?: number;
    strokeColor?: string;
    outlineColor?: string;
    drawingColor?: string;
    drawingThickness?: number;
    showOutline?: boolean;
    showCharacter?: boolean;
    charDataLoader?: (
      char: string,
      onLoad: (data: unknown) => void,
      onError?: (err: unknown) => void
    ) => void;
    [key: string]: unknown;
  }

  interface StrokeData {
    strokeNum: number;
    mistakesOnStroke: number;
    totalMistakes: number;
    strokesRemaining: number;
    isBackwards: boolean;
  }

  interface QuizOptions {
    onStrokeCorrect?: (strokeData: StrokeData) => void;
    onStrokeIncorrect?: (strokeData: Partial<StrokeData>) => void;
    onComplete?: (summaryData: { totalMistakes: number }) => void;
    [key: string]: unknown;
  }

  export default class HanziWriter {
    static create(
      element: string | HTMLElement,
      character: string,
      options?: HanziWriterOptions
    ): HanziWriter;
    animateCharacter(options?: Record<string, unknown>): void;
    quiz(options?: QuizOptions): void;
    cancelQuiz(): void;
    hideCharacter(): void;
    showCharacter(): void;
  }
}
