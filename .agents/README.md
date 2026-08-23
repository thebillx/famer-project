# AgriScope agent system

## Canonical files

- Rules: `AGENTS.md`
- Lifecycle: `.agents/workflows/delivery.md`
- Orchestrator: `.agents/agents/agriscope-orchestrator.md`
- Runtime roles: `.codex/agents/*.toml`
- Task template: `.agents/templates/task-brief.md`
- Latest owner-handoff shape: `.agents/templates/handoff-report.md`
- Ponytail LOCAL_NATIVE receipt: `.agents/templates/review-report.md`
- Reusable procedures: `.agents/skills/*/SKILL.md`

Task briefs grant ownership; role profiles only describe capabilities.

The lifecycle continuously delivers bounded non-production features after
Ponytail LOCAL_NATIVE approval and green CI. Local review is transport context, not
a permanent repository report. Production security review is a release-candidate
gate and its durable record belongs under `docs/reviews/`.

Feature merge means local validation, LOCAL_NATIVE, and matching CI passed. It does
not mean production-ready, security-approved, deployed, or `DONE`.
