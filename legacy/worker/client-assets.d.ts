/** The built browser files, as the build names them. vite.config.ts supplies this module. */
declare module "virtual:client-assets" {
  const assets: {
    /** Module scripts to run, in order. */
    scripts: string[];
    styles: string[];
    /** Modules the entry script imports, to fetch early. */
    preloads: string[];
  };
  export default assets;
}
