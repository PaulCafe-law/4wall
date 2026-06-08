# Codex Authentication

This project does not use an OpenAI API key for Codex development authentication.

Use Codex through your ChatGPT account:

```bash
codex login
```

You can also sign in through Codex App or the Codex IDE extension with **Continue with ChatGPT**.

Do not put `OPENAI_API_KEY` in `.env` for this project. If Codex asks for an API key, switch the Codex surface to ChatGPT OAuth login instead.

Codex usage is managed by the user's ChatGPT subscription and Codex allowance. The 4WALL backend does not own or meter Codex development usage.
