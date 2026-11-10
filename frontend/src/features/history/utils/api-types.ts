import type {
  ApiResponseBody,
  BackendApi,
} from "../../api/client/api-client.js";

export type MonthRead = ApiResponseBody<BackendApi["days"]["$get"], 200>;
