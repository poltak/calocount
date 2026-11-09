// The Worker modules that this workspace imports. `@cloudflare/workers-types`
// cannot share a TypeScript project with `@types/node`, because each declares
// the same globals, and the frontend reads the types of this project. So only
// the few names that the code uses are here.

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
