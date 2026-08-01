# Handoff Workflow

## Purpose

Make work transferable between agents without losing scope, evidence, or ownership context.

## Required format

Use `.agents/templates/handoff-report.md`.

## Minimum content

- Task ID
- Agent
- Summary
- Completed scope
- Files changed
- Commands executed
- Tests passed
- Tests failed
- Assumptions
- Known limitations
- Risks
- Remaining work
- Recommended next agent

## Rules

- Handoff must happen before QA/Security Review.
- Handoff must name unresolved contract assumptions.
- Handoff must not claim production completion for mock behavior.
- Handoff must preserve active file ownership until orchestrator reassigns or closes it.
