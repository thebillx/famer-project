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

The automated lifecycle ends after Ponytail LOCAL_NATIVE review. Local review is
transport context, not a permanent repository report. Only owner-requested durable
reviews belong under `docs/reviews/`.

`READY_FOR_OWNER_REVIEW` means focused validation and LOCAL_NATIVE review passed.
It does not mean staged, committed, pushed, CI-approved, security-approved,
deployed, merged, or `DONE`; those are owner-controlled decisions outside the
automated lifecycle.
