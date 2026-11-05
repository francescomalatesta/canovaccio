# Isolation recipes

Usual changes to meet the isolation contract, by tool. Each keeps today's value as the default, so slot 0 behaves as before. Variable names are examples: use the ones in `.canovaccio/isolation.json`.

## Docker Compose

```yaml
services:
  db:
    image: postgres:16
    ports:
      - "127.0.0.1:${DB_PORT:-5432}:5432"   # host side from the slot, container side unchanged
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:                                  # no `name:`: Compose prefixes it with the project name
```

- Remove `container_name`. Scripts that used it switch to `docker compose exec <service>`.
- Healthchecks run inside the container and keep the container port.
- An app container that reaches another service uses the service name (`db:5432`), which does not change.
- An app container bind-mounting the project mounts the current worktree by itself. Keep `node_modules` or `deps` in a named volume of the project.

## Phoenix and Ecto

```elixir
# config/dev.exs
port = String.to_integer(System.get_env("PORT", "4000"))

config :my_app, MyAppWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: port],
  url: [host: "localhost", port: port]

config :my_app, MyApp.Repo,
  port: String.to_integer(System.get_env("DB_PORT", "5432")),
  database: "my_app_dev"

# config/test.exs
config :my_app, MyAppWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: String.to_integer(System.get_env("TEST_PORT", "4002"))]

config :my_app, MyApp.Repo,
  port: String.to_integer(System.get_env("DB_PORT", "5432")),
  database: "my_app_test#{System.get_env("MIX_TEST_PARTITION")}"
```

- With the database in the slot's Compose project, the database names can stay as they are: each slot has its own server. With a Postgres installed on the host, make the name a `name` variable (`DEV_DB`, suffixed per slot).
- Mix does not read `.env`. Load it with `dotenvy` in `config/runtime.exs`, or start through a wrapper that the docs use as the start command:

  ```sh
  #!/bin/sh
  # bin/dev
  set -a; [ -f .env ] && . ./.env; set +a
  exec mix phx.server
  ```

- The session cookie key is set in a module attribute of the endpoint, at compile time. Derive it from `CANOVACCIO_SLOT`, and do not list `_build` in `include`: a copy would keep the main checkout's key.
- `check_origin`, when it lists origins, uses the same port variable.

## Vite

```js
// vite.config.js
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")   // the env file is not in process.env here
  return {
    server: {
      port: Number(env.VITE_PORT ?? 5173),
      strictPort: true,                          // fail instead of moving to a port nobody knows
      proxy: { "/api": `http://127.0.0.1:${env.PORT ?? 4000}` },
    },
  }
})
```

## Next.js and Node servers

- Node servers: `const port = Number(process.env.PORT ?? 3000)`, with the env file loaded by the project's loader (`dotenv`, `node --env-file-if-exists=.env` on Node 22+).
- `next dev` takes the port from `-p` or from `PORT` in the process environment, not from `.env`. Load the file in the script that starts it (`dotenv -e .env -- next dev`, or the wrapper above), or pass `-p "${PORT:-3000}"` from a shell that has it.

## Rails

- `config/puma.rb` usually reads `ENV.fetch("PORT", 3000)` already. `dotenv-rails` loads `.env` in development and test.
- `config/database.yml`: `port: <%= ENV.fetch("DB_PORT", 5432) %>`.
- `Procfile.dev` entries use `$PORT` and the other variables instead of literals.

## Django

- `manage.py runserver "127.0.0.1:${PORT:-8000}"` from a script that loads `.env`, or read it in settings with `django-environ` or `python-dotenv`.
- `DATABASES[...]["PORT"]` from `DB_PORT`; `CSRF_TRUSTED_ORIGINS` and CORS origins built from `PORT`.

## Playwright

```js
// playwright.config.js
const port = Number(process.env.E2E_PORT ?? 4100)

export default {
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: "npm run start:e2e",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,     // E2E start their own app, never a running dev server
    env: { PORT: String(port) },
  },
}
```

Load the env file at the top of the config when the variables come from it.

## Storybook and prototype systems

`storybook dev -p "${STORYBOOK_PORT:-6006}"` from a script that has the variable, and the same for any dev-only playground. The URLs given at a prototype gate use the slot's port.

## Cookies on localhost

Name the session cookie with the slot (`_my_app_key` becomes `_my_app_key_2` in slot 2, and keeps its name in slot 0), or use one host name per slot (`slot2.localhost`), which browsers resolve to the local machine. The cookie name is the smaller change.
