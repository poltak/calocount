import type { DialogServiceInterface } from "./types.js";

export class BrowserDialogService implements DialogServiceInterface {
  confirm(question: string): boolean {
    return window.confirm(question);
  }
}
