# Owner handoff capsule

```text
MISSION: <objective>
PHASE: <current lifecycle phase>
STATUS: <task status> | FINAL_STATUS: <allowed final status>
SCOPE: <one sentence> | BOUNDARY: base=<sha/worktree> paths=<exact paths>
AGENTS: <role/model/reasoning used, or NONE>
CHECKED: <exact paths>
CHANGED: <exact paths or NONE>
IMPLEMENTATION: <one sentence or NO_CHANGE>
VALIDATION:
- <command> | PASS|FAIL|NOT_RUN | <one-line result> | <log/path ref>
LOCAL_NATIVE: <APPROVED|CHANGES_REQUIRED|NOT_RUN> | <receipt/findings ref>
EVIDENCE: <immutable URL/path> sha256=<digest> retention=<policy>, or NONE
ASSUMPTIONS/RISKS: <maximum three compact bullets>
UNRESOLVED: <blockers only or NONE>
SENSITIVE DATA: <NONE or bounded impact; never include values>
GIT: <branch, HEAD, concise working-tree state>
OWNER DECISION: <smallest decision required>
NEXT: <one exact owner action>
```

Allowed final statuses:

- `READY_FOR_OWNER_REVIEW`
- `CHANGES_REQUIRED`
- `HUMAN_GATE`
- `BLOCKED`
- `NO_CHANGE_REQUIRED`

This capsule supersedes earlier handoffs. Do not save it in the repository unless
the owner explicitly requests that.
