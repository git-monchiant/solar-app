# Legacy SQL history

This directory contains the original database bootstrap and legacy migrations
through migration 124. Keep these files for historical reference and for
reconstructing an old database baseline; do not add new migrations here.

New forward-only migrations belong in `scripts/migrations/`. After a migration
has been applied to production successfully, move it to
`scripts/_archive/migrations/`.
