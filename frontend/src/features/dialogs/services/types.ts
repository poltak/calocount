/** The questions that the page asks the owner before it does something that cannot be undone. */
export interface DialogServiceInterface {
  /** Ask a yes or no question. `true` means yes. */
  confirm(question: string): boolean;
}
