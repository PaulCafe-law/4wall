# Codex Authentication

This project does not use an OpenAI API key for Codex authentication.

Use Codex through your ChatGPT account:

```bash
codex login
```

You can also sign in through Codex App or the Codex IDE extension with **Continue with ChatGPT**.

Do not put `OPENAI_API_KEY` in `.env` for this project. If Codex asks for an API key, switch the Codex surface to ChatGPT OAuth login instead.

The Industrial Data Engine worker can also use Codex CLI with ChatGPT OAuth for trusted text JSON generation. Run this once as the worker service user:

```shell
codex login --device-auth
```

Use a current Codex CLI release on the worker. The production default text model is `gpt-5.5`; older CLI builds may reject that model even when ChatGPT OAuth is valid.

If the worker uses a non-default auth directory, set `CODEX_HOME` in the worker environment. Treat the Codex auth cache like a password.

Text-to-world reference images are a separate OAuth surface. The worker calls `GPT_IMAGE_OAUTH_COMMAND` for GPT Image 2 generation and still must not use `OPENAI_API_KEY`. Configure and authenticate that command bridge as the same worker service user, then verify:

```shell
$GPT_IMAGE_OAUTH_COMMAND --health
```

The health output must be JSON with `authenticated: true`.

The bundled bridge script is `planner-server/scripts/industrial_engine/gpt_image_oauth_bridge.mjs`. It uses a dedicated Chrome profile on the worker host and ChatGPT web OAuth state. It is intentionally an external command because Codex CLI has text output and image input support, but no stable image-output contract.

Install the bridge dependencies on the worker host:

```shell
mkdir -p ~/4wall-worker/gpt-image-bridge
cd ~/4wall-worker/gpt-image-bridge
npm init -y
npm install playwright-core
```

Authenticate once in the worker desktop session:

```shell
export GPT_IMAGE_OAUTH_COMMAND=/path/to/gpt-image-oauth-bridge
$GPT_IMAGE_OAUTH_COMMAND --login
```

Complete ChatGPT login in the opened Chrome window. After login, `--health` should return `authenticated: true`. Treat the bridge Chrome profile like a credential store.

On worker desktops that are blocked by browser automation checks, run the bridge in CDP mode: start a normal Chrome process with the dedicated bridge profile and `--remote-debugging-port`, then set `GPT_IMAGE_OAUTH_CDP_URL=http://127.0.0.1:<port>`. The bridge will connect to that browser instead of launching its own Playwright-managed session.
