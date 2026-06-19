# STYLE.md

## General

* Match existing project style before introducing new patterns
* Prefer readability over cleverness
* Keep functions focused and single-purpose
* Avoid deeply nested logic
* Use descriptive names

---

## Naming

* Components: `PascalCase`
* Types/Interfaces: `PascalCase`
* Variables: `camelCase`
* Functions: `camelCase`
* Hooks: `useCamelCase`
* Constants: `UPPER_SNAKE_CASE`
* Files: `kebab-case`

---

## TypeScript

* Avoid `any`
* Prefer explicit types for public APIs
* Let TypeScript infer obvious local types
* Use interfaces for object contracts
* Keep types close to where they are used

---

## React

* Functional components only
* One component per file
* File name matches component name
* Use hooks at the top level only
* Use `useEffect` only for side effects
* Keep component state minimal

---

## Backend

* Keep route handlers simple
* Extract reusable logic only when repetition exists
* Return appropriate HTTP status codes
* Validate external input

---

## Imports

Order imports:

1. External packages
2. Internal modules
3. Local files

* No wildcard imports
* Remove unused imports

---

## Formatting

* 2-space indentation
* Semicolons required
* Single quotes preferred
* Trailing commas allowed in multiline structures
* Keep lines reasonably short

---

## Route Comments

All Express routes should have a comment above them describing their purpose and API contract.

Include:

* What the route does
* Who/what calls it (frontend, Google OAuth, webhook, etc.)
* Expected headers
* Query parameters
* Route parameters
* Request body format
* Response format
* Important side effects (database writes, token creation, emails sent, etc.)

Example:

```js
/* This route is called by Google after a user accepts
 * the OAuth consent screen. It exchanges the authorization
 * code for access and refresh tokens.
 *
 * Query:
 *   code: string
 *
 * Headers:
 *   None
 *
 * Request Body:
 *   None
 *
 * Response:
 *   {
 *     success: true
 *   }
 *
 * Side Effects:
 *   - Creates OAuth tokens
 *   - Stores refresh token in database
 */
```
---

## Git Rules

AI assistants must never create commits, amend commits, rebase, merge, push, force-push, or perform any other Git operation that modifies repository history.

AI assistants may inspect Git status, logs, branches, and diffs when needed, but must leave all version control actions to the developer.

Never commit code automatically. Always allow the developer to review and commit changes manually.
