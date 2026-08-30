# Security policy

## Supported versions

Until the first stable release, only the latest commit on the default branch is supported. After v1.0, the latest minor release of the current major version will receive security fixes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository owner through the private contact method shown on their GitHub profile and include “SwarmGPU security report” in the subject.

Include affected commit/version, environment, impact, reproduction steps, and any suggested mitigation. Do not include secrets or unrelated personal data.

You should receive acknowledgement within seven days. Validation and remediation timelines depend on severity and reproducibility. Coordinated disclosure is preferred; please allow maintainers to prepare a fix before publishing details.

## Project security boundaries

SwarmGPU is a static client-side demonstration. It does not require accounts, a backend, secrets, analytics, or user data. A contribution adding any of those changes the product boundary and requires an explicit project-contract decision before implementation.

