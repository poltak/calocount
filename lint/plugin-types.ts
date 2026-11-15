// The parts of the oxlint JS plugin API, the AST, and the rule options that
// the rules use. oxlint ships no types for them in this repository.

/** A list that a rule probes with a value that may be absent. */
export type Lookup = readonly (string | null | undefined)[];

export interface Node {
  type: string;
  parent?: Node;
  range?: [number, number];
  start?: number;
}

/** A node of any kind. A rule narrows it with `type` and the fields it reads. */
export interface AstNode extends Node {
  name?: string;
  value?: unknown;
  computed?: boolean;
  object?: AstNode;
  property?: AstNode;
  callee?: AstNode;
  arguments?: AstNode[];
  elements?: AstNode[];
  expression?: AstNode;
  expressions?: AstNode[];
  quasis?: Template[];
  consequent?: AstNode;
  alternate?: AstNode;
  left?: AstNode;
  right?: AstNode;
  literal?: AstNode;
  types?: AstNode[];
  superClass?: AstNode | null;
  properties?: ObjectMember[];
}

/** A property or a spread element of an object expression. */
interface ObjectMember extends Node {
  key?: Name;
  value?: AstNode;
}

export interface Template extends Node {
  value: { raw: string };
}

interface Name {
  name?: string;
  value?: string;
}

export interface Specifier extends Node {
  importKind?: string;
  exportKind?: string;
  imported?: Name;
  local?: Name;
}

export interface ImportDeclaration extends Node {
  source: { value: string };
  specifiers: Specifier[];
  importKind?: string;
}

export interface ExportNamedDeclaration extends Node {
  source?: { value: string } | null;
  specifiers: Specifier[];
  exportKind?: string;
}

export interface ExportAllDeclaration extends Node {
  source: { value: string };
  exportKind?: string;
}

export interface ImportExpression extends Node {
  source: { type: string; value: string };
}

export interface CallExpression extends Node {
  callee: AstNode;
  arguments: AstNode[];
}

interface TypeArguments {
  params: TypeReference[];
}

export interface TypeReference extends AstNode {
  typeName?: Name;
  typeArguments?: TypeArguments;
  typeParameters?: TypeArguments;
}

export interface ClassDeclaration extends Node {
  id?: Name | null;
  superClass?: AstNode | null;
  implements?: { expression?: Name }[];
}

interface ConstructorParameter extends Node {
  name?: string;
  parameter?: Name;
  accessibility?: string;
  readonly?: boolean;
}

export interface MethodDefinition extends Node {
  kind: string;
  value: { params: ConstructorParameter[] };
}

export interface NewExpression extends Node {
  callee: AstNode;
}

export interface MemberExpression extends AstNode {
  computed: boolean;
  object: AstNode;
  property: AstNode;
}

export interface Property extends Node {
  computed: boolean;
  key: Name;
  value?: AstNode;
}

export interface Literal extends Node {
  value: unknown;
}

export interface VariableDeclarator extends Node {
  id: AstNode;
  init?: AstNode | null;
}

interface JsxAttribute extends Node {
  parent?: Node & { name?: Name };
  name: Name;
  value?: AstNode | null;
}

export interface Visitors {
  Program?(node: Node): void;
  "Program:exit"?(node: Node): void;
  ImportDeclaration?(node: ImportDeclaration): void;
  ExportNamedDeclaration?(node: ExportNamedDeclaration): void;
  ExportAllDeclaration?(node: ExportAllDeclaration): void;
  ImportExpression?(node: ImportExpression): void;
  CallExpression?(node: CallExpression): void;
  "CallExpression:exit"?(node: CallExpression): void;
  ClassDeclaration?(node: ClassDeclaration): void;
  MethodDefinition?(node: MethodDefinition): void;
  NewExpression?(node: NewExpression): void;
  MemberExpression?(node: MemberExpression): void;
  Property?(node: Property): void;
  VariableDeclarator?(node: VariableDeclarator): void;
  TSTypeReference?(node: TypeReference): void;
  Literal?(node: Literal): void;
  TemplateElement?(node: Template): void;
  JSXAttribute?(node: JsxAttribute): void;
}

export interface RuleContext<Options extends object = object> {
  filename?: string;
  getFilename(): string;
  options: [Options?];
  report(problem: {
    node: Node;
    messageId: string;
    data?: Record<string, unknown>;
  }): void;
}

export interface Rule<Options extends object = object> {
  meta: {
    type: string;
    docs?: { description: string };
    schema: object[];
    messages: Record<string, string>;
  };
  create(context: RuleContext<Options>): Visitors;
}

export interface Plugin {
  meta: { name: string };
  rules: Record<string, Rule>;
}

export interface ArchitectureOptions {
  compositionFiles?: string[];
  sharedFeatures?: string[];
  sharedRoles?: Lookup;
  collectionTypeFiles?: string[];
  coreServiceFeatures?: Lookup;
  propsTypes?: Lookup;
  exemptFeatures?: Lookup;
  serviceCollections?: Lookup;
  storageCollections?: Lookup;
  coreServices?: Lookup;
  sessionFiles?: string[];
  srcRootFiles?: string[];
  featureRootFiles?: string[];
  featureRootFilesByFeature?: Record<string, string[]>;
  roles?: string[];
  rolesByFeature?: Record<string, string[]>;
}

export interface Vendor {
  workspace?: string;
  packages: string[];
  allowedIn: string[];
  where: string;
}

export interface StackOptions {
  vendors?: Vendor[];
  hooks?: Lookup;
  spacing?: string[];
}

export interface TestingOptions {
  fixtureName?: string;
  fixtureFile?: string;
  screensFile?: string;
  forbiddenPackages?: Lookup;
  forbiddenFiles?: string[];
  exemptFiles?: string[];
}
