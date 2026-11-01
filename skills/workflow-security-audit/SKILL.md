---
name: workflow-security-audit
description: Workflow for auditing the security of an existing codebase - map the attack surface, plan the audit by area with a strong model, collect evidence with scanners and cheaper auditors in parallel, judge every candidate finding, and deliver a prioritized list of findings (High, Medium, Low) to choose follow-up work from. Changes no production code.
---

# Security audit workflow

Study an existing codebase and produce a prioritized list of what to do to make it more secure. Apply `workflow-rules` throughout.

The output is `security-findings.md`: confirmed findings, each with a severity, its evidence and a recommended fix, grouped into proposed follow-up work. The audit changes no code; fixing is the work of the `fix` and `feature` workflows started from its findings.

The audit is split like the closure review: a strong model plans and judges, cheaper ones do the volume.

| Role | Does |
|---|---|
| `@scout` | maps the attack surface |
| `@security-reviewer` | plan mode: threat model and audit plan by area; verdict mode: confirms or dismisses every candidate finding and rates it |
| `@security-auditor` | executes the plan of one area, or the scanners: runs commands, quotes code, reports facts, never a verdict |

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 scope** | after the audit plan | perimeter, areas, scanners, runtime checks, out of scope |
| **G2 delivery** | after the verdict | which findings become work, whether the findings are committed |

From G1 the audit runs to G2 without stopping (see Run to completion in `workflow-rules`).

## Limits

These hold for the whole workflow and are passed to every agent:

- **No change to project files.** No fixes, no patches, no dependency upgrades, no lockfile changes. Scanners run without writing into the project; their outputs go to `.canovaccio/tmp/<work directory name>/scans/`.
- **Local only.** Nothing is sent to a host the project does not own, beyond what scanners need to fetch rules and vulnerability databases. Runtime checks run only against the app started locally by this workflow, never against a deployed environment, production or staging, whatever the request says.
- **No exploitation.** A finding is shown with code, configuration or a harmless local request (a header, a cookie flag, a CORS response, an error page), never with an exploit that alters data, escalates privileges or degrades a service.
- **Secrets stay hidden.** A secret found in the code or in the git history is reported with its location, type and the first four characters only, in every artifact and report.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`, recording in it the branch checked out now. The audit creates no branch: the only commits it may make (the `.gitignore` rules and `.canovaccio/tmp/.gitignore` of `workflow-rules`, and the findings if the user chooses so at G2) go on that branch.

### 1. Attack surface

Follow the `project-docs` reading protocol when the project has docs, and record doc/code discrepancies in `state.md` Notes.

Dispatch `@scout` to map the attack surface, with the doc paths as starting points:

- stack, frameworks and their versions; how the app is built, started and deployed (Dockerfiles, compose, CI, IaC, hosting configuration);
- entry points: HTTP routes and APIs, webhooks, background jobs, queues, CLIs, scheduled tasks, file and message consumers;
- authentication and session handling, roles and permissions, multi-tenancy;
- data stores and what sensitive data they hold (credentials, personal data, payments);
- external integrations and outbound requests;
- how secrets and configuration are loaded, and which config files, env files or keys are in the repository;
- dependency manifests and lockfiles of every ecosystem in the repository;
- file uploads, downloads, templating, serialization, anything that executes or evaluates;
- which security scanners are already installed or configured in the project, and which runners are available (`npx`, `uvx` or `pipx`, `docker`).

Write `surface.md` from its report. Keep it factual, with paths.

### 2. Audit plan

Dispatch `@security-reviewer` in plan mode with the request, `brief.md`, `surface.md` and the work directory. It writes `audit-plan.md`: a short threat model, the areas with their checks and hotspots, the scanner commands and the runtime checks.

Check the plan yourself: every area of `surface.md` is either in an area or listed as out of scope with the reason; every scanner command writes its output under `scans/`; no command changes the project or reaches a host outside the Limits.

Present **G1** with:

- the perimeter and what is out of scope;
- the threat model in a few lines;
- the areas, one line each;
- the scanners, saying for each whether it is already available, runs through an ephemeral runner (`npx`, `uvx`, `docker run --rm`), or would need installing on the machine, which needs the user's permission here;
- the runtime checks, if any, and that they need the app started locally;
- that `security-findings.md` stays out of version control unless the user chooses otherwise at G2.

### 3. Evidence

1. **Environment.** Only when runtime checks were approved: bring the environment up (see Environment in `workflow-rules`), start the app detached on a local port, wait for its ready check and note the command and process in `state.md`.
2. **Scanners.** Dispatch `@security-auditor` in scan mode with the work directory and the ready check if any. It runs every scanner command of the plan and writes `evidence/scans.md`. A scanner that cannot run is reported with the reason; the audit continues without it, and G2 says which scanners did not run.
3. **Areas.** Dispatch one `@security-auditor` per area in area mode, with the work directory, the area id, the app URL when the area has runtime checks, and the scanner results of its area from `evidence/scans.md`. Dispatch them in parallel, in the foreground, in batches of at most five, each batch awaited before the next. Each writes `evidence/<area id>.md`.
4. Stop the app if you started it. Give a CHECKPOINT with the evidence collected, by area and status, and the scanners that did not run.

### 4. Verdict

Dispatch `@security-reviewer` in verdict mode with the work directory: it reads `audit-plan.md`, `evidence/` and the raw outputs in `scans/`, and writes `security-findings.md`.

On NEEDS-EVIDENCE, dispatch `@security-auditor` in follow-up mode with the requests, start the app again first when they need it, then ask for the verdict again. At most twice; after that, the open items are reported as unverified in `security-findings.md`.

A phase that fails for a reason outside the audit, such as a harness or provider error, is repeated alone from the saved artifacts.

### 5. Delivery

Check `security-findings.md` yourself: every finding has a severity, a location, evidence and a fix; no secret appears in full; counts by severity match the list.

Present **G2** with:

- counts by severity, then every High finding in one line each, then Medium and Low as counts with their titles;
- the proposed follow-up work, as `security-findings.md` groups it, each with its workflow (`fix` or `feature`, rarely `refactor`) and the findings it covers;
- the scanners that did not run and the items left unverified;
- the doc/code discrepancies recorded, if any;
- two questions: which follow-up work to start (none is a valid answer), and whether to commit `security-findings.md` (default no: it lists open vulnerabilities, and the repository may be public or become so).

Then:

- **commit chosen** → `git add -f` the file on the branch recorded in `state.md`, as a standalone commit;
- **follow-up work chosen** → set `state.md` to `closed`, then start the first chosen workflow in a new work directory, with the findings it covers quoted in its `brief.md` (the findings file may not be versioned) and a reference to this work directory; the others are listed in its `brief.md` as next, and each one starts after the previous is delivered. Each follow-up has its own gates;
- otherwise set `state.md` to `closed`.

Whenever `state.md` becomes `closed`, bring the environment down and delete the temporary directory as `workflow-rules` describes: the raw scanner outputs go with it, the findings carry their evidence.

## Switching

- The user asks to fix a finding during the audit → note it, finish the audit, and offer it at G2.
- The request is about one known vulnerability, not the codebase → propose `workflow-fix`.
- A question needs an experiment to settle (does this library sanitize this input?) → keep it as an unverified item, and propose a `workflow-spike` at G2 when it matters.
