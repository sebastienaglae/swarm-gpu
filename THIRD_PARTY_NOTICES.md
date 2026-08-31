# Third-party notices

SwarmGPU has no production JavaScript dependencies and downloads no runtime assets. The generated
drone meshes, shaders, favicon, pipeline diagram, screenshots, and showcase media are original project
outputs released under the repository's MIT license.

Development and verification use these direct dependencies:

| Package                  | Version | License      | Purpose                                 |
| ------------------------ | ------: | ------------ | --------------------------------------- |
| `@playwright/test`       |  1.62.1 | Apache-2.0   | Browser and hardware automation         |
| `@eslint/js`             |  10.0.1 | MIT          | Lint configuration                      |
| `@types/node`            | 24.13.3 | MIT          | Node.js type declarations               |
| `@webgpu/types`          |  0.1.72 | BSD-3-Clause | WebGPU type declarations                |
| `eslint`                 |  10.9.1 | MIT          | Static analysis                         |
| `eslint-config-prettier` |  10.1.8 | MIT          | Formatter/linter compatibility          |
| `prettier`               |   3.9.6 | MIT          | Formatting                              |
| `typescript`             |   6.0.3 | Apache-2.0   | Type checking                           |
| `typescript-eslint`      |  8.68.0 | MIT          | TypeScript lint integration             |
| `vite`                   |   8.2.2 | MIT          | Development server and production build |
| `vitest`                 |  4.1.11 | MIT          | Unit tests                              |

Transitive package notices and exact integrity hashes are preserved in `package-lock.json`. Chrome,
graphics drivers, Node.js, npm, GitHub Actions, and FFmpeg are tools/environments and are not bundled
with the released static site.

The [Code of Conduct](CODE_OF_CONDUCT.md) is adapted from Contributor Covenant 2.1, available under
the Creative Commons Attribution 4.0 license. Its attribution link is included in that document.
