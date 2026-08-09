# Agent Operating Rules

## Current Collaboration Model

- The root Codex agent is the project orchestration center. It owns user alignment, Claude audit feedback intake, architecture direction, implementation planning, task decomposition, subtask boundaries, integration review, validation strategy, commit boundaries, and final delivery reports.
- When product implementation or file modification is needed, the root agent must delegate code-writing and file-editing work to `gpt-5.5` subagents whenever subagent execution is available.
- The root agent must split work into clear, bounded subtasks before delegation. Each subtask must define scope, expected files or modules, acceptance criteria, and validation commands.
- Independent subtasks should be assigned to multiple subagents in parallel when the boundaries are clear and the shared workspace can be kept conflict-free.
- Subagents must report exact changes, test results, risks, and unresolved assumptions.
- The root agent must review subagent output before accepting it, resolve overlapping edits, decide whether more validation is required, and remain responsible for the final integrated state.

## Boundaries

- Do not parallelize work blindly. Avoid assigning multiple agents to overlapping files or contracts unless the root agent explicitly coordinates the merge path.
- Do not mix slice scopes. A frozen slice must not absorb work from the next slice, and a current slice must not begin until the previous slice is explicitly PASS / FROZEN.
- Claude audit feedback is treated as an external acceptance signal. Blocking items must be closed in the current slice before moving forward.
- Process-only documentation changes must be kept separate from product code candidates where practical, and delivery reports must make the distinction explicit.
