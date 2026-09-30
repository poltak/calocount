import type { BackendServices, BackendStorage } from "../index.js";

/** Constructor dependencies shared by backend Logic classes. */
export interface BackendLogicProps<
  StorageKeys extends keyof BackendStorage = never,
  ServiceKeys extends keyof BackendServices = never,
> {
  storage: Pick<BackendStorage, StorageKeys>;
  services: Pick<BackendServices, ServiceKeys>;
}
