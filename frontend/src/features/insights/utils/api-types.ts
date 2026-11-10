import type {
  ApiResponseBody,
  BackendApi,
} from "../../api/client/api-client.js";

export type InsightsRead = ApiResponseBody<BackendApi["insights"]["$get"], 200>;
