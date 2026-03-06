'use client';

/**
 * No longer auto-creates orgs. Orgs are only created by:
 * 1. Admin creating an org (with leader)
 * 2. Leader accepting invite
 * Users without an org will see a message to contact their admin.
 */
export function EnsureOrg() {
  return null;
}
