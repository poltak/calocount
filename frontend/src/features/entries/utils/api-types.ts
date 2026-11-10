import type {
  ApiResponseBody,
  BackendApi,
} from "../../api/client/api-client.js";

type DashboardSummary = ApiResponseBody<
  BackendApi["dashboard"]["summary"]["$get"],
  200
>;
export type SummaryDay = DashboardSummary["days"][number];
export type SerializedEntry = ApiResponseBody<
  BackendApi["days"][":date"]["$get"],
  200
>["meals"][number];
export type SavedEntry = ApiResponseBody<
  BackendApi["saved-entries"]["$get"],
  200
>["entries"][number];
export type SummaryTargets = DashboardSummary["targets"];
type DayRead = ApiResponseBody<BackendApi["days"][":date"]["$get"], 200>;
export type DayWeightRow = NonNullable<DayRead["weight"]>;
export type ProteinGoalOfDay = DayRead["proteinGoal"];
