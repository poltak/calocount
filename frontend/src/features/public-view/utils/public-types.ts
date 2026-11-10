import type {
  ApiResponseBody,
  BackendApi,
} from "../../api/client/api-client.js";

type PublicSummary = ApiResponseBody<
  BackendApi["public"]["summary"]["$get"],
  200
>;
export type PublicDay = Extract<PublicSummary, { view: "day" }>;
