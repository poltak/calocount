/**
 * A browser test runs the built frontend and the test backend on these two
 * origins. They differ on purpose: the page then calls the API on another
 * origin, as it does when the API has a host of its own.
 */
export const FRONTEND_PORT = 43110;
export const BACKEND_PORT = 43120;
export const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
export const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
