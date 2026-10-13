# Security policy

## Supported version

Security fixes target the latest public beta, currently 1.0.0-beta.1 (schema 1). Earlier development releases are not supported release lines. The beta has incomplete clinical and device review; automated tests do not guarantee security or data durability.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/workmanl/manley-farms-herd-records/security/advisories/new) through Security Advisories. The maintainers must enable private vulnerability reporting when creating the repository. While `https://github.com/workmanl/manley-farms-herd-records` is unresolved, this private channel is not yet available; do not substitute a public issue containing vulnerability details or private data. No email reporting address is provided.

Include affected app/browser versions, a minimal synthetic reproduction, expected and actual behavior, impact, and any safe mitigation. Never attach real herd records, credentials or identifiable backups. Do not exploit other users or access their data. Please allow the maintainers to investigate and coordinate a fix and advisory before public disclosure. Response or fix timing is not guaranteed.

For ordinary feature/documentation problems use public issues. Data-loss or withdrawal defects belong in the dedicated issue template unless they expose a vulnerability, in which case report privately. Preserve an external verified backup and the affected browser profile. Do not clear site data as a workaround.

## Boundaries

The app has no accounts, backend, record uploads or application encryption. Device/profile access and same-origin scripts can expose local records. Reports and calculations require independent checking. Security fixes must preserve committed data, safe restore/update behavior and the isolated service-worker scope.
