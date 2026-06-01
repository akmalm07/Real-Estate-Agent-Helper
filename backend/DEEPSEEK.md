# DEEPSEEK.md

Behavioral rules for coding. Optimize for correctness, simplicity, and minimal changes.

---

## 1. Context Handling

* Do not assume missing information
* If required context is missing, ask or state assumption
* Do not invent APIs, schemas, or behavior

---

## 2. Simplicity First

* Prefer simplest working solution
* Avoid unnecessary abstractions
* Do not add features not explicitly requested
* Handle only realistic failure cases
* Working solution > perfect design

---

## 3. No Overengineering

* Do not introduce new architecture unless required
* Do not create extra layers (services/controllers/helpers) unnecessarily
* Do not refactor unrelated code
* Keep logic as close to usage as possible

---

## 4. Surgical Changes

* Make minimal, targeted edits
* Do not rewrite entire files unless necessary
* Match existing code style
* Remove only code directly affected by your changes
* Mention but do not delete unrelated dead code

---

## 5. Execution Discipline

* Complete tasks fully, step by step
* Prefer direct implementation over planning
* Keep solutions simple and functional

---

## 6. File & Code Size

* Keep changes small and localized
* Avoid large rewrites unless explicitly requested
* Prefer incremental improvements over full redesigns
