const DAY_MS = 24 * 60 * 60 * 1000;

/** A session that nobody uses for this long ends. Each renewal moves the end. */
export const SESSION_IDLE_TTL_MS = 180 * DAY_MS;

/** A session that was last seen longer ago than this gets a new end when it is used. */
export const SESSION_RENEW_AFTER_MS = DAY_MS;
