# Coding Rules

- Follow existing TypeScript and repository conventions.
- Prefer small, composable changes.
- Reuse existing services, utilities, types, and abstractions.
- Do not add speculative abstractions or dependencies.
- Do not refactor unrelated code during feature work.
- Validate inputs at trust boundaries.
- Keep business logic out of controllers when an existing service/domain pattern exists.
- Use structured error handling consistent with the existing API.
- Never swallow errors merely to make execution appear successful.
- Never hard-code environment-specific values.
- Treat generated code as generated; fix its source/configuration and regenerate.
