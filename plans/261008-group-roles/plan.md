# Group roles and invitations

Status: complete

## Implementation

- Preserve existing conversation responses and derive legacy group leadership from group.createdBy.
- Store leader/member roles; require group membership for conversation data and leadership for management.
- Add leader-only name/description updates, member removal, group deletion and invitation rotation.
- Use a random invitation token for authenticated preview/join; join atomically without duplicate members.
- Generate QR locally from the invitation URL and retain invitation navigation through authentication.
- Update Group Info with roles, management controls, invitation URL/QR and live membership updates.
- Revoke chat/call access and clear client caches when removed or deleted.

## Acceptance

- Creator is the leader; other and invited participants are members, including existing groups.
- Members cannot modify/delete groups or remove participants; a leader cannot remove themselves.
- Valid URL/QR joins once; invalid or rotated invitations fail and joining requires authentication.
- Info and participant counts update in all connected clients; removed users lose access to messages/media/pins/calls.
- Check server permissions/invitation edge cases, client tests, lint of changed code and production build.

No deployment, commits or unrelated existing changes are included.

## Verification results

- 10 integration tests passed using an isolated MongoDB instance: role compatibility, group creation, permission denial, self-removal protection, concurrent/idempotent joins, token hiding/rotation, revocation of message access and call rooms, authenticated socket identity, and group/history deletion.
- 8 existing client regression tests passed.
- Production client build passed; existing bundle-size and mixed static/dynamic import warnings remain.
- ESLint passed for all changed client JavaScript/JSX files.
- Full client lint reports 35 existing errors and 7 warnings in unaffected files.
- Server syntax checks and git diff whitespace checks passed.
- Browser UI and physical camera QR scanning were not exercised.
- Usage/API documentation added in docs/group-roles.md.
