// Helpers that more than one lint test file uses.
export interface OxlintOutput {
  diagnostics: { code: string; filename: string }[];
}

export const feature = (name: string) => `backend/src/features/${name}`;

/** Stand-ins for the shared Logic base class and props type, as core provides them. */
export const coreFiles = (workspace: string) => ({
  [`${workspace}/src/features/core/logic/logic.ts`]:
    "export class Logic<T = unknown> {\n  constructor(readonly options?: T) {}\n}\n",
  [`${workspace}/src/features/core/logic/types.ts`]:
    "export type BackendLogicProps<S, T> = { s: S; t: T };\n",
});
export const importLogic =
  'import { Logic } from "../../core/logic/logic.js";\n';
export const importProps =
  'import type { BackendLogicProps } from "../../core/logic/types.js";\n';

/** A UI Logic test that follows docs/agents/testing.md. */
export const logicTest =
  'import { setupLogicTest } from "../../core/tests/full-application.js";\nexport const setupTest = () => setupLogicTest({}, () => null);\n';
