import type {
  AIServiceInterface,
  ModelRequest,
} from "../../ai/services/types.js";

export type EvalMode = "api" | "oracle" | "null";

export interface EvalCall {
  purpose: string;
  role: string;
  /** The model that answered, or `replay` for a recorded output. */
  model: string;
  /** The model of the role. A fallback of the provider answers with another one. */
  requestedModel: string;
  inputTokens: number | null;
  outputTokens: number | null;
  ms: number;
  /** Of the system prompt, the schema, and the token limit. The same for each case of one prompt version. */
  promptHash: string;
  /**
   * Of the whole request, with the hash of each file. A request that holds
   * the answer of an earlier call can differ between the runs of one case.
   */
  requestHash: string;
  /** The text parts of the request. */
  content: string;
  output: unknown;
}

/** The model that answers: the real provider, or an answer for each purpose. */
export type EvalModel<Role extends string> =
  | {
      kind: "anthropic";
      models: Record<Role, string>;
      apiKey: string;
      thinkingOffRoles?: readonly Role[];
      fallbackOnRefusal?: boolean;
      /** The recorded output of each purpose that the provider does not answer. */
      replay?: Record<string, unknown>;
    }
  | {
      kind: "scripted";
      answers: Record<string, (request: ModelRequest<Role>) => unknown>;
    };

/** The model service of one run of one case, with the record of its calls. */
export interface EvalAIService<Role extends string> {
  ai: AIServiceInterface<Role>;
  calls: EvalCall[];
  /** Waits for the calls that still run, so that `calls` has their cost. */
  settle(): Promise<void>;
}

/** One file in the answers folder: one run of one case. */
export interface EvalAnswer<Result> {
  caseId: string;
  rep: number;
  /** The name of the answers folder of the models, such as `claude-haiku-5-5+match-claude-sonnet-5-5`. */
  model: string;
  /** Each prompt version of the eval, by its name. */
  promptVersions: Record<string, string>;
  /** Such as `detect`, for a run in which the eval reads the case in another way. */
  variant: string | null;
  /** The purposes whose request must be the same in each run of the case. */
  fixedPurposes: string[];
  ms: number;
  cost: number;
  calls: EvalCall[];
  result: Result;
}

/**
 * What a project gives the harness for one eval. `Case` is one input with
 * its key. `Result` is what one run of a case gave, and the answer file keeps
 * it. `Score` is the score of one answer.
 */
export interface EvalDefinition<
  Role extends string,
  Case extends { id: string },
  Result,
  Score,
> {
  /** Such as `documents`. The command line and the messages use it. */
  name: string;
  /** The folder of the cases, the keys, the answers, and the scores. */
  dataDir: string;
  /**
   * The data holds private data, such as patient data. The harness then
   * refuses a data folder that Git can track.
   */
  privateData: boolean;
  /** Each prompt version of the eval, by its name. A new version gets a new answers folder. */
  promptVersions: Record<string, string>;
  /** The roles of the requests. The first one names the answers folder. */
  roles: readonly [Role, ...Role[]];
  /** The model of each role when the command line gives none. Use the models of production. */
  defaultModels: Record<Role, string>;
  /** The settings of the provider, the same as in production. */
  provider?: {
    thinkingOffRoles?: readonly Role[];
    fallbackOnRefusal?: boolean;
  };
  /** Boolean options of the eval itself, such as `detect` for `--detect`. */
  flags?: readonly string[];
  /** Such as `detect`, when the flags read each case in another way. The answers then go to a folder of their own. */
  variant?(flags: Set<string>): string | null;
  /** The purposes whose request depends only on the case and the code, so that each run of a case must send the same one. */
  fixedPurposes?(flags: Set<string>): string[];
  /** The purposes that `--replay-from` gives from recorded answers, and the prompt versions that they must share. */
  replay?: { purposes: readonly string[]; promptVersions: readonly string[] };
  /** `all`, or case IDs and set names, separated by commas. */
  loadCases(selection: string): Case[];
  /** Each problem of a case or its key. A wrong key makes each model look wrong, so `run` refuses to start on one. */
  check(evalCase: Case): string[];
  /** The cost in dollars of one run of each case, before the run. `priceOf` gives the price of a model. */
  estimate(input: {
    cases: Case[];
    models: Record<Role, string>;
    /** The purposes that a replay answers, at no cost. */
    replayed: readonly string[];
    flags: Set<string>;
  }): number;
  /** One run of one case. Construct the real Logic in `core/evals/index.ts`, with `ai`, and call it. */
  run(input: {
    evalCase: Case;
    rep: number;
    ai: AIServiceInterface<Role>;
    flags: Set<string>;
  }): Promise<Result>;
  /**
   * The answer of each purpose in the modes with no provider. The oracle
   * answers from the key, and must score 100%. The null mode gives nothing,
   * and must score 0%.
   */
  answers(input: {
    evalCase: Case;
    mode: "oracle" | "null";
    flags: Set<string>;
  }): Record<string, (request: ModelRequest<Role>) => unknown>;
  score(input: { evalCase: Case; answer: EvalAnswer<Result> }): Score;
  results: {
    /** The two lines of the head of the results table. */
    head: readonly [string, string];
    /** The scores of one group have one row for each prompt version and model, such as a kind of document. */
    group?(score: Score): string;
    row(input: {
      prompts: string;
      model: string;
      group: string;
      scores: Score[];
    }): string;
    /** The text of the report of one prompt version, such as each wrong field. */
    report?(scores: Score[]): string[];
  };
}
