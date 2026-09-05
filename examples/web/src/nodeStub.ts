/**
 * A stand-in for `node:fs` and `node:path` in the browser.
 *
 * `HospitalResident.save()` and `HospitalResident.load()` read and write
 * instance files, so the module imports the two Node built-ins at its top —
 * which a browser has not got.  This page never calls either method (it uses
 * `toText()` / `fromText()` on strings instead), so `vite.config.ts` aliases
 * the built-ins to this module; anything that does reach them fails loudly
 * rather than silently doing nothing.
 */

function unavailable(name: string): never {
  throw new Error(`${name}() needs Node.js and is not available in the browser`);
}

// node:fs
export const existsSync = (): never => unavailable("existsSync");
export const mkdirSync = (): never => unavailable("mkdirSync");
export const readFileSync = (): never => unavailable("readFileSync");
export const writeFileSync = (): never => unavailable("writeFileSync");

// node:path
export const dirname = (): never => unavailable("dirname");
