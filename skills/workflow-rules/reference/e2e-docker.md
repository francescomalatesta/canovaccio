# E2E in Docker

How E2E tests run when the machine lacks what their runner needs (browsers, the system libraries browsers need, the runner's own binary). The rule is in Testing of `AGENTS.md`: those are never installed; the tests run in Docker, or are reported as not run.

Only what is missing goes into the container. The project's runtime, its dependencies, its app and its test database stay where the project defined them, on the host, with the ports of the checkout's slot.

## Any runner

The project chose its E2E runner; this works with that runner, whatever it is, and never replaces it with another. Build the Docker command from these rules and the runner's own documentation:

1. **Image.** The runner's official image, or the browser's, at the exact version the project's lockfile pins: runners and browsers must match.
2. **Only what is missing.** When the runner can drive a remote browser (a browser server, a WebDriver endpoint), only the browser runs in the container and the tests stay on the host. Otherwise the run itself goes into the container, with the project mounted.
3. **Network.** The browser reaches the app on the host's `127.0.0.1` at its usual port: through the runner's own tunnel when it has one, otherwise through the host network.
4. **Variables.** The container does not inherit the host's variables: pass with `-e NAME` each one the tests or the config read, the slot's ports first, or `--env-file` with the env file the project uses.
5. **Readiness.** Wait for an observable signal (a log line, a status endpoint). A published port accepts connections before the server listens, so a probe on the port is not a ready check.
6. **Lifetime.** Containers get no name and publish on a random port of `127.0.0.1`, so checkouts never collide; record each under Throwaway in `state.md`. The block that runs the tests stops the container whatever their result and exits with their status, so a failing run is never recorded as passed.

Commands run from the directory of the package that holds the E2E configuration. Once the command works, it is the `E2E: docker` line of `state.md`, and the docs sync writes it in `docs/environment.md`.

## Examples

Two runners, verified with these exact commands. They show the two cases of rule 2; they are not a choice of runner.

### Playwright: only the browser in the container

Only the browser runs in the container: the official image, at the exact version of the project's `playwright-core`, serves it with the project's own `playwright-core` mounted read-only (nothing is downloaded at start). The tests run on the host and connect to it; `<loopback>` lets the browser reach the host's `127.0.0.1`, so the app started by the `webServer` of the config is reachable on its usual port.

```sh
core=$(node -e "const p=require('path'),r=(m,d)=>p.dirname(require.resolve(m+'/package.json',{paths:[d]}));console.log(r('playwright-core',r('playwright',r('@playwright/test',process.cwd()))))")
v=$(node -p "require('$core/package.json').version")
cid=$(docker run -d --rm --init --ipc=host --user pwuser -v "$core":/opt/playwright-core:ro -p 127.0.0.1::3000 "mcr.microsoft.com/playwright:v$v-noble" node /opt/playwright-core/cli.js run-server --port 3000 --host 0.0.0.0)
for i in $(seq 60); do docker logs "$cid" 2>&1 | grep -q "Listening on" && break; sleep 1; done
port=$(docker port "$cid" 3000/tcp | head -1 | sed 's/.*://')
PW_TEST_CONNECT_WS_ENDPOINT="ws://127.0.0.1:$port/" PW_TEST_CONNECT_EXPOSE_NETWORK='<loopback>' npm run e2e; status=$?   # the project's E2E command
docker stop "$cid" >/dev/null
exit "$status"
```

- Run the block as one command (`sh -c '<block>'`, or one argument of `verify.mjs run`), so that rule 6 holds.
- Readiness is the `Listening on` line of the server log.
- When the image tag does not exist for that version, use `-jammy` instead of `-noble`.
- A config that sets `use.connectOptions` already connects to a browser server: give it the endpoint the way it reads it.

### Cypress: the whole run in the container

Cypress has no remote browser: the run itself goes into the container, with the image at the exact version of the project's `cypress` package, the project mounted and the host network, so it reaches the app on the host. Start the app as the project's E2E script does, on its usual port, and run only Cypress in the container:

```sh
v=$(node -p "require('cypress/package.json').version")
docker run --rm --network host -e E2E_PORT -v "$PWD":/e2e -w /e2e "cypress/included:$v"   # arguments after the image go to `cypress run`
```

- `-e E2E_PORT` is rule 4: pass the variables this project's config reads.
- Host networking needs a Linux host, or Docker Desktop with host networking enabled.
- The config and plugins run on the image's Node, not the project's. When that matters, build the image from `cypress/factory` with the project's Node version, as follow-up work for the user to approve.

## When Docker cannot run them

Docker missing or not running, the image not available, host networking not available: the E2E tests are not run. Report it with the command and its error. Do not work around it: no install, no switch to another runner, no skipped tests.
