// The types of `template-files.mjs`, which stays JavaScript because an agent
// hook imports it. TypeScript reads this file in place of the JavaScript.

export declare const VERSION_FILE: "template-version.json";
export declare const GUARDED_FILES: string[];
export declare const PATHS_FILE: "scripts/template-paths.json";

export interface OwnPath {
  path: string;
  reason: string;
}

export interface SkippedCommit {
  commit: string;
  subject?: string | undefined;
  reason: string;
}

export interface CommitConflicts {
  commit: string;
  files: string[];
}

export interface VersionFile {
  template: string;
  commit: string;
  skipped: SkippedCommit[];
  unchanged?: string[];
  conflicts?: CommitConflicts[];
  ownPaths?: OwnPath[];
}

export interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export declare function fail(message: string): never;

export declare function matchesPath(options: {
  entry: string;
  file: string;
}): boolean;

export declare const isGate: (entry: string) => boolean;

export declare const isProjectPath: (options: {
  ownPaths?: OwnPath[] | undefined;
  file: string;
}) => boolean;

export declare function git(options: {
  root: string;
  args: string[];
  input?: string | undefined;
  allowFailure?: boolean | undefined;
}): GitResult;

export declare function sameRepository(options: {
  left: string;
  right: string;
}): boolean;

export declare function readVersionFile(options: {
  root: string;
}): VersionFile | undefined;

export declare function writeVersionFile(options: {
  root: string;
  version: VersionFile;
}): Promise<void>;

export declare function formatted(options: {
  file: string;
  text: string;
}): Promise<string>;
