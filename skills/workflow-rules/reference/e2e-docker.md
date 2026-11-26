# E2E in Docker

How E2E tests run when the machine lacks what their runner needs (browsers, the system libraries browsers need, the runner's own binary). The rule is in Testing of `AGENTS.md`: those are never installed; the tests run in Docker, or are reported as not run.

Only what is missing goes into the container. The project's runtime, its dependencies, its app and its test database stay where the project defined them, on the host, with the ports of the checkout's slot.

Commands run from the directory of the package that holds the E2E configuration. Containers get no name and publish on a random port of `127.0.0.1`, so checkouts never collide; record each under Throwaway in `state.md` and stop it when the run ends.

## Playwright

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

- Run the block as one command (`sh -c '<block>'`, or one argument of `verify.mjs run`): the container is stopped whatever the result of the tests, and the block exits with their status, so a failing run is never recorded as passed.

- Readiness is the `Listening on` line of the server log. The published port accepts connections before the server listens, so a probe on the port is not a ready check.
- When the image tag does not exist for that version, use `-jammy` instead of `-noble`.
- A config that sets `use.connectOptions` already connects to a browser server: give it the endpoint the way it reads it.

## Cypress

Cypress has no remote browser: the run itself goes into the container, with the image at the exact version of the project's `cypress` package, the project mounted and the host network, so it reaches the app on the host. Start the app as the project's E2E script does, on its usual port, and run only Cypress in the container:

```sh
v=$(node -p "require('cypress/package.json').version")
docker run --rm --network host -e E2E_PORT -v "$PWD":/e2e -w /e2e "cypress/included:$v"   # arguments after the image go to `cypress run`
```

- The container does not inherit the host's variables: pass with `-e NAME` each one the config reads, the slot's ports first (`E2E_PORT` here is an example), or `--env-file` with the env file the project uses.
- Host networking needs a Linux host, or Docker Desktop with host networking enabled.
- The config and plugins run on the image's Node, not the project's. When that matters, build the image from `cypress/factory` with the project's Node version, as follow-up work for the user to approve.

## When Docker cannot run them

Docker missing or not running, the image not available, host networking not available: the E2E tests are not run. Report it with the command and its error. Do not work around it: no install, no other runner, no skipped tests.
