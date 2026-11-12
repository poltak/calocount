import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function checkScreenCoverage(outputDirectory, routes) {
  const names = await readdir(outputDirectory);
  const screens = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        JSON.parse(await readFile(path.join(outputDirectory, name), "utf8")),
      ),
  );
  for (const route of routes) {
    if (!screens.some((screen) => screen.route === route)) {
      throw new Error(
        `Missing screen for route "${route}". Add its screen entry.`,
      );
    }
  }
  for (const screen of screens) {
    for (const width of ["desktop", "phone"]) {
      for (const theme of ["light", "dark"]) {
        const result = screen.results?.find(
          (entry) => entry.width === width && entry.theme === theme,
        );
        const label = `${screen.route} ${screen.state ?? ""} ${width} ${theme}`;
        if (!result?.file) {
          throw new Error(
            `Missing screen result: ${label}. Run the capture again.`,
          );
        }
        await access(path.join(outputDirectory, result.file)).catch(() => {
          throw new Error(`Missing PNG: ${label}. Run the capture again.`);
        });
      }
    }
  }
}
