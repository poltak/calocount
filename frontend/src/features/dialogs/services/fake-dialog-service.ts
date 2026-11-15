import type { DialogServiceInterface } from "./types.js";

/** Says yes to each question, unless a test tells it to say no. */
export class FakeDialogService implements DialogServiceInterface {
  readonly questions: string[] = [];
  private answer = true;

  confirm(question: string): boolean {
    this.questions.push(question);
    return this.answer;
  }

  answerWith(answer: boolean): void {
    this.answer = answer;
  }
}
