// The old sync of a project starts itself again at this path after the commit
// that moved the code to `.ts`. Delete this file when no project has a sync
// from before that commit.
await import("./sync-template.ts");
