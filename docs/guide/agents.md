# AI agents

cloudsesame is designed to be agent-friendly: without a terminal it never hangs on a prompt. It fails with exit code 4 and prints the exact commands to run, or continues with `--skip`.

## Skill

cloudsesame ships an [Agent Skill](https://github.com/NexiHealth/cloudsesame/blob/main/skills/cloudsesame/SKILL.md) that teaches agents to set it up in a project and to handle its failures: ask you to run logins rather than attempting them, and use `--skip` when the task doesn't need the cloud.

`cloudsesame init` offers to install it. Or install it with the [`skills` CLI](https://github.com/vercel-labs/skills), which supports Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and many more:

```sh
bunx skills add NexiHealth/cloudsesame          # or: npx skills add NexiHealth/cloudsesame
bunx skills add NexiHealth/cloudsesame -g       # for all your projects
bunx skills update                              # pull the latest version later
```

Without the `skills` CLI, copy `skills/cloudsesame/` (also in the npm package, under `node_modules/cloudsesame/skills/`) into your agent's skills folder, e.g. `.claude/skills/`.
