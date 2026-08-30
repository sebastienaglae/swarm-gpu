# Architecture decision records

Architecture decision records (ADRs) capture decisions that affect SwarmGPU's scope, GPU/CPU boundary, data layouts, pass graph, resource lifetime, portability, or benchmark meaning.

## Status values

- `Proposed`: under discussion and not safe to build upon.
- `Accepted`: current project contract.
- `Superseded`: replaced by a newer ADR that links back to it.
- `Rejected`: evaluated but not adopted.

## Index

| ADR                                   | Status   | Decision                                              |
| ------------------------------------- | -------- | ----------------------------------------------------- |
| [0001](0001-raw-webgpu.md)            | Accepted | Use raw WebGPU as the only rendering API              |
| [0002](0002-structure-of-arrays.md)   | Accepted | Start with Structure of Arrays for GPU instance state |
| [0003](0003-rendering-conventions.md) | Accepted | Freeze camera, clip-space, and depth conventions      |

## Process

Copy [the template](template.md), assign the next four-digit number, and open it as `Proposed`. The pull request must include alternatives, consequences, validation, and links to the affected phase. An ADR becomes `Accepted` only when the change is approved. Never rewrite the conclusion of an accepted ADR; supersede it with a new record.
