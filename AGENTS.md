# Agent Operating Rules

## Current Collaboration Model

- The root Codex agent is the project orchestration center. It owns user alignment, Claude audit feedback intake, architecture direction, implementation planning, task decomposition, integration review, validation strategy, commit boundaries, and final delivery reports.
- When implementation work is needed, the root agent should split clear, bounded tasks and assign code-writing or file-editing work to `gpt-5.5` subagents whenever subagent execution is available.
- Independent tasks should be parallelized across multiple subagents when the boundaries are clear and the shared workspace can be kept conflict-free.
- Subagents must receive precise scope, expected files or modules, acceptance criteria, and validation commands. They should report exact changes, test results, and any risks or unresolved assumptions.
- The root agent reviews subagent output before accepting it, resolves overlapping edits, decides whether more validation is required, and is responsible for the final integrated state.

## Boundaries

- Do not parallelize work blindly. Avoid assigning multiple agents to overlapping files or contracts unless the root agent explicitly coordinates the merge path.
- Do not mix slice scopes. A frozen slice must not absorb work from the next slice, and a current slice must not begin until the previous slice is explicitly PASS / FROZEN.
- Claude audit feedback is treated as an external acceptance signal. Blocking items must be closed in the current slice before moving forward.
- Process-only documentation changes must be kept separate from product code changes where practical, and delivery reports must make the distinction explicit.
