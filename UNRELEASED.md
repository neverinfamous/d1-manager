## [Unreleased]

### Security
- Patched Docker build transitive dependencies `tar` to `v7.5.13` to resolve known vulnerabilities.
- Added explicit npm overrides for `flatted` (v3.4.2), `picomatch` (v4.0.4), `tar` (v7.5.13), and `minimatch` (v10.2.5) to secure dependency chains against severe CVEs.

### Changed
- **Dependency Updates:**
  - Upgraded `vite` to `v8.0.4` and `@vitejs/plugin-react` to `v6.0.1`, including a refactor of `vite.config.ts` to use functional `manualChunks` definition for Rollup 4 compatibility.
  - Upgraded `typescript` to `v6.0.2` and updated TS `useState`/`useRef` strict inferences in contexts and `aiSearch` usage definitions to resolve deprecation/TypeScript 6 strictness.
  - Upgraded `esbuild` to `v0.28.0`.
  - Upgraded `lucide-react` to `v1.7.0`.
