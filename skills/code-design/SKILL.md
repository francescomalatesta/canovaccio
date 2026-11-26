---
name: code-design
description: Pragmatic code design for whoever writes or reviews production code - when to separate responsibilities, open an extension point, check a substitute's contract, narrow a dependency or invert it (the SOLID principles), read from signals in the task instead of applied as a checklist, and the over-engineering to refuse.
---

# Code design

For whoever writes or reviews production code: `@implementer` on a task, `@escalator` diagnosing a task that did not converge, `@task-reviewer` reviewing one, the controller writing the target design of a refactor. It does not apply to spike experiments, which are thrown away.

The terms are language-neutral. A **module** is whatever unit the language groups code in (class, module, package, file, group of functions). An **interface** is any contract a caller relies on: an interface or protocol, a type or function signature, the shape a duck-typed caller expects.

## Precedence

What is already decided wins over this guidance:

1. the task, the approved artifacts and `docs/conventions.md`;
2. the established structure of the surrounding code: its layering, how it passes dependencies, how it handles variants. Follow it; never introduce a second way of doing what the codebase already does one way;
3. this guidance.

It applies to the code the task writes or changes, never as a reason to restructure code outside the task: that is `workflow-refactor`.

## The rule

**Structure follows real reasons to change.** Separate, extend or abstract when a signal in the task calls for it, never in anticipation. An abstraction without a present need is a defect, as much as a missing one. With no signal, write the plain code.

## The principles, by signal

### S — Single responsibility: one module, one reason to change

- **Signal**: the task puts in one unit things that change for different reasons: transport (HTTP handler, CLI parsing), business rules, persistence, formatting. Or the task's tests must start a database or a server to check a calculation.
- **Move**: extract the part the task changes or tests into its own function or module, next to its caller and in the project's layering.
- **Not**: splitting a small cohesive unit into many files; one function per file; reorganizing modules the task does not touch.

### O — Open/closed: add a variant without editing what works

- **Signal**: the task adds a case to a branch on kind (type, format, provider, status) that already has two or more and is edited by every feature; or the same branch on kind appears in several places that must change together.
- **Move**: one dispatch point (a table of handlers, a strategy per variant, polymorphism), whichever the language and codebase already use; gather the scattered branches into it.
- **Not**: the first or second variant (rule of three); plugin systems, registries or hooks for variants nobody asked for.

### L — Liskov substitution: a substitute honours the contract it stands in for

- **Signal**: the task writes a subtype, an alternative implementation, an adapter or a test double.
- **Check**: it accepts what the contract accepts (no stricter preconditions), guarantees what it guarantees (results, errors, side effects), has no "not supported" overrides, and no caller needs to check its concrete type. A test double behaves like the real thing on what the test relies on: a fake that never fails where the real one raises hides an error path.
- **Move**: fix the substitute; if it cannot honour the contract, it is not a substitute: give it its own interface.
- This is correctness, not style.

### I — Interface segregation: depend only on what you use

- **Signal**: a function receives a whole large object (request, configuration, context, service) to read one or two fields; a test double must implement many members the code never calls; changing an interface for one caller forces unrelated implementations to change.
- **Move**: pass the values, or a narrow interface declared where it is consumed.
- **Not**: splitting an interface whose callers use it whole; one interface per method.

### D — Dependency inversion: business logic does not depend on details

- **Signal**: logic the task writes calls I/O directly (database client, HTTP, filesystem, clock, randomness, environment) and that blocks a test the task needs; or a second implementation exists or is required (two providers, sandbox and live).
- **Move**: pass the dependency in (parameter, constructor, or the injection the project already uses); keep I/O at the edges and the logic it feeds free of it where that is cheap. Shape the abstraction on what the consumer needs, not as a copy of a vendor SDK.
- **Not**: a DI container or framework the project does not use; an interface for every class "for testability" when the test can use the real thing or the isolated test database (see Test data isolation in `AGENTS.md`); wrappers around the standard library.

## Over-engineering to refuse

- an interface or abstract base with a single implementation and no test that needs a double;
- a factory, builder, manager, registry or service layer that only forwards calls;
- parameters, options, generics or hooks that no caller uses;
- a layer that exists in this one place only, unlike the rest of the codebase;
- code split so finely that following one behavior takes opening five files.

## Writing

Apply it while writing, without announcing it. In your report, list in one line each the structural moves you made, with the principle and the signal (`D: clock passed into InvoiceScheduler, the due-date tests need a fixed time`), and any signal you judged too weak to act on. No moves is a normal outcome: say "none".

## Reviewing

Review only the code the task wrote or changed. Tag the findings `structure`. Each one names the principle (or "over-engineering"), the signal in the diff with file:line, and the smallest fix.

Severity:

- **Important**, only with a concrete consequence today:
  - a substitute that breaks its contract in a way that can produce wrong behavior;
  - a branch on kind, or a rule, that the task spreads across places that must change together, where missing one is a realistic bug;
  - logic wired to I/O so that a test the task requires is missing, or runs against the development database;
- **Minor**: every other violation with a real signal, and over-engineering;
- **not a finding**: a principle without a signal in the diff, structure the task did not touch, an equivalent structure to the one you would have chosen.
