# AgriScope Agent System

## Purpose

This directory defines the lightweight agent, skill, workflow, ownership, and quality-gate system for AgriScope. It is framework-neutral and intended for Codex CLI, OpenCode CLI, and agents that read `AGENTS.md` plus Markdown instruction files.

## Agents

- `agriscope-orchestrator`: reads requirements, creates vertical slices, assigns ownership, checks contracts, routes work, and controls status.
- `frontend-product-agent`: owns assigned Product UX and frontend work.
- `backend-geospatial-agent`: owns assigned backend, geospatial, and satellite-provider work.
- `qa-security-agent`: owns QA, review, and security gate decisions.

## Skills vs agents

Agents define ownership and responsibilities. Skills define repeatable procedures. An agent may use one or more skills for a task, but file ownership still comes from the task brief.

## Orchestration model

The orchestrator turns a requirement into a vertical-slice task brief, defines contracts and file ownership, routes implementation to specialist agents, requires handoff, sends work to QA/Security Review, and verifies status before `DONE`.

## Creating a task brief

Use `.agents/templates/task-brief.md`. Every task brief must include scope, out of scope, contracts, agent owners, file ownership, security requirements, test requirements, acceptance criteria, and Definition of Done.

## File ownership

Allowed paths in agent definitions are default capability boundaries. Actual ownership is assigned per task brief. Do not edit files owned by another active task.

## Calling agents

Example:

```text
@agriscope-orchestrator

Read the product requirement and create the first vertical slice.

Follow:
- AGENTS.md
- .agents/skills/vertical-slice-planning/SKILL.md
- .agents/workflows/feature-development.md

Inspect the repository first.
Create a task brief.
Define contracts and file ownership before implementation.
Do not mark the task done without QA and security review.
```

## Handoff

Use `.agents/templates/handoff-report.md`. Include changed files, commands, passed/failed tests, assumptions, risks, remaining work, and recommended next agent.

## Review

Use `.agents/templates/review-report.md`. Decisions are `APPROVED`, `APPROVED_WITH_NOTES`, `CHANGES_REQUIRED`, and `BLOCKED`.

## Statuses

- `PLANNED`
- `CONTRACT_READY`
- `IN_PROGRESS`
- `IMPLEMENTED`
- `IN_REVIEW`
- `CHANGES_REQUIRED`
- `VERIFIED`
- `DONE`
- `BLOCKED`

## Adding skills later

Add a folder under `.agents/skills/<skill-name>/SKILL.md`, keep it procedural, and update `.agents/registry.yaml` only when an agent needs that skill.

## When to split agents later

Split an agent only when ownership or review load creates repeated conflict. Candidate future splits include DevOps, Database, UX, Sentinel-1, AI/ML, Billing, Report, Notification, Mobile, Drone, or IoT, but none are active at bootstrap.

## Codex/OpenCode usage

- Start with `AGENTS.md`.
- Load the assigned agent definition.
- Load only the skills named by that agent and task.
- Follow the workflow file named in the task brief.
- Produce the required handoff or review report before status changes.
