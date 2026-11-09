import type { App } from "../types.js";

export interface FrontendLogicProps<
  StorageKeys extends keyof App["storage"] = never,
  ServiceKeys extends keyof App["services"] = never,
  ApiKeys extends keyof App["api"] = never,
> {
  storage: Pick<App["storage"], StorageKeys>;
  services: Pick<App["services"], ServiceKeys>;
  api: Pick<App["api"], ApiKeys>;
}
