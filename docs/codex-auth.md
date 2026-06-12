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
