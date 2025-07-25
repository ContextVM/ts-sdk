# Code Style Guidelines

- **TypeScript**:
  - Strict type checking enabled.
  - Use ES modules (`import`/`export`).
  - All public functions and methods must have explicit return types.
- **Naming Conventions**:
  - `PascalCase` for classes, interfaces, and types.
  - `camelCase` for functions, methods, and variables.
- **File Naming**:
  - All source files should be lowercase with hyphens (kebab-case). E.g., `relay-handler.ts`.
  - Test files must be co-located with source files and use the `.test.ts` suffix. E.g., `relay-handler.test.ts`.
- **Imports**:
  - Use ES module style (`import { x } from './y.js'`).
  - All relative imports must include the `.js` extension to ensure ESM compatibility.
- **Error Handling**:
  - Use TypeScript's `strict` mode to catch null/undefined errors.
  - Tests must explicitly check for expected errors.
- **Formatting**:
  - 2-space indentation.
  - Semicolons are required.
  - Single quotes (`'`) are preferred over double quotes (`"`).
- **Testing**:
  - Tests must be co-located with source files.
  - Use descriptive test names that clearly state what is being tested.
- **Comments**:
  - JSDoc for all public APIs (classes, methods, interfaces, types).
  - Inline comments for complex or non-obvious logic.
- **Environment**:
  - The library must be compatible with Node.js version 18 or higher.
  - Use `bun` as the package manager and test suite.
