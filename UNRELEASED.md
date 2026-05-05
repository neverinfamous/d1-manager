## [Unreleased]

### Fixed

- Fixed Query Console blank page with `Uncaught ReferenceError: Prism is not defined` in production builds since v2.6.5 ([#124](https://github.com/neverinfamous/d1-manager/issues/124))
  - Split `prismjs` into its own `vendor-prism` chunk to prevent Rolldown from reordering module initialization when co-bundled with `sql-formatter` in the `vendor-sql` chunk

### Changed
**Dependency Updates**
- Bump `@cloudflare/workers-types` from 4.20260422.1 to 4.20260505.1
- Bump `eslint` from 10.2.1 to 10.3.0
- Bump `globals` from 17.5.0 to 17.6.0
- Bump `jose` from 6.2.2 to 6.2.3
- Bump `lucide-react` from 1.8.0 to 1.14.0
- Bump `postcss` from 8.5.10 to 8.5.14
- Bump `typescript-eslint` from 8.59.0 to 8.59.2
- Bump `vite` from 8.0.9 to 8.0.10
- Bump `wrangler` from 4.84.1 to 4.88.0
