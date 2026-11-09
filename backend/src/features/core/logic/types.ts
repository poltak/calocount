import type { BackendServices, BackendStorage } from "../types.js";

export interface BackendLogicProps<
  StorageKeys extends keyof BackendStorage = never,
  ServiceKeys extends keyof BackendServices = never,
> {
  storage: Pick<BackendStorage, StorageKeys>;
  services: Pick<BackendServices, ServiceKeys>;
}
