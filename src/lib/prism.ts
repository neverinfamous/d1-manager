/**
 * Prism.js initialization wrapper.
 *
 * Rolldown (Vite 8) wraps the prismjs CJS core inside a factory closure,
 * but converts prism-sql's bare `Prism.languages.sql = {...}` into a
 * top-level statement that references the `Prism` global *before* the
 * core factory has executed. This module ensures globalThis.Prism is set
 * from the ESM default export before any plugins are loaded.
 *
 * Consumers MUST import from this module instead of "prismjs" directly.
 *
 * @see https://github.com/neverinfamous/d1-manager/issues/124
 */
import Prism from "prismjs";

// Expose Prism on globalThis so CJS plugins that reference the bare
// `Prism` identifier can find it during module evaluation.
(globalThis as unknown as Record<string, unknown>)["Prism"] = Prism;

export default Prism;
