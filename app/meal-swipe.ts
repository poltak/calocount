export const MEAL_SWIPE_THRESHOLD_PX = 44;

export type MealSwipeAction = "open" | "close" | "none";

export function getMealSwipeAction({
  deltaX,
  deltaY,
  threshold = MEAL_SWIPE_THRESHOLD_PX,
}: {
  deltaX: number;
  deltaY: number;
  threshold?: number;
}): MealSwipeAction {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return "none";
  return deltaX < 0 ? "open" : "close";
}
