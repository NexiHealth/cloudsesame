# AI agents

cloudsesame is designed to be agent-friendly: without a terminal it never hangs on a prompt. It fails with exit code 4 and prints the exact commands to run, or continues with `--skip`.

## Skill

The package ships an [Agent Skill](https://github.com/NexiHealth/cloudsesame/blob/main/skills/cloudsesame/SKILL.md) that teaches agents to set cloudsesame up in a project and to handle its failures: ask you to run the login rather than attempting it, and use `--skip` when the task doesn't need the cloud.

Install it for Claude Code in a project:

```sh
mkdir -p .claude/skills
cp -r node_modules/cloudsesame/skills/cloudsesame .claude/skills/
```

Or for all your projects, copy it to `~/.claude/skills/` instead. Other agents that support skills read the same `SKILL.md` format.
