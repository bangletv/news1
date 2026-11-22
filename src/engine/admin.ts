// Administrator-only registry operations. Every operation requires an `admin:<name>` actor and
// returns a new registry plus an audit entry. Agents are never handed these functions.

import type { AuditEntry, Registry, Source } from './types.ts';
import { validateRegistry } from './registry.ts';
import { AuthorityError, ConfigError, clone, iso } from './util.ts';

const ADMIN_RE = /^admin:[A-Za-z0-9._-]+$/;

export function assertAdmin(actor: string): void {
  if (!ADMIN_RE.test(actor)) {
    throw new AuthorityError(
      `"${actor}" is not an administrator; registry changes require an admin:<name> actor`
    );
  }
}

type AuditDraft = Omit<AuditEntry, 'id' | 'at'>;

export interface AdminResult {
  registry: Registry;
  audit: AuditDraft;
}

function mutate(
  reg: Registry,
  id: string,
  actor: string,
  action: string,
  reason: string | undefined,
  fn: (s: Source) => void
): AdminResult {
  assertAdmin(actor);
  const next = clone(reg);
  const s = next.sources.find((x) => x.id === id);
  if (!s) throw new ConfigError('Unknown source', [`no source with id "${id}"`]);
  const before = { enabled: s.enabled, approval: clone(s.approval) };
  fn(s);
  const { errors } = validateRegistry(next);
  if (errors.length) {
    throw new ConfigError(`Operation "${action}" would produce an invalid registry`, errors);
  }
  return {
    registry: next,
    audit: {
      actor,
      action,
      target: { type: 'source', id },
      reason,
      before,
      after: { enabled: s.enabled, approval: clone(s.approval) },
    },
  };
}

export const approveSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string,
  now = new Date()
): AdminResult =>
  mutate(reg, id, actor, 'source.approve', reason, (s) => {
    s.approval = { status: 'approved', by: actor, at: iso(now), reason };
  });

export const enableSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string
): AdminResult =>
  mutate(reg, id, actor, 'source.enable', reason, (s) => {
    if (s.approval.status !== 'approved') {
      throw new AuthorityError('Only an approved source can be enabled');
    }
    s.enabled = true;
  });

export const disableSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string
): AdminResult =>
  mutate(reg, id, actor, 'source.disable', reason, (s) => {
    s.enabled = false;
  });

export const revokeSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string,
  now = new Date()
): AdminResult =>
  mutate(reg, id, actor, 'source.revoke', reason, (s) => {
    s.enabled = false;
    s.approval = { status: 'revoked', by: actor, at: iso(now), reason };
  });

/** Soft delete. The source and its history remain in the registry file and can be restored. */
export const removeSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string,
  now = new Date()
): AdminResult =>
  mutate(reg, id, actor, 'source.remove', reason, (s) => {
    s.enabled = false;
    s.approval = { status: 'removed', by: actor, at: iso(now), reason };
  });

/** Restores a removed/revoked source to "pending": a fresh approval is still required. */
export const restoreSource = (
  reg: Registry,
  id: string,
  actor: string,
  reason?: string
): AdminResult =>
  mutate(reg, id, actor, 'source.restore', reason, (s) => {
    if (s.approval.status !== 'removed' && s.approval.status !== 'revoked') {
      throw new AuthorityError('Only removed or revoked sources can be restored');
    }
    s.enabled = false;
    s.approval = { status: 'pending', reason: `restored by ${actor}` };
  });

/** Adds a source as "pending", disabled. It cannot collect until an administrator approves and enables it. */
export function addSource(reg: Registry, source: Source, actor: string): AdminResult {
  assertAdmin(actor);
  const next = clone(reg);
  if (next.sources.some((s) => s.id === source.id)) {
    throw new ConfigError('Duplicate source', [`"${source.id}" already exists`]);
  }
  const s = clone(source);
  s.enabled = false;
  s.approval = { status: 'pending' };
  next.sources.push(s);
  const { errors } = validateRegistry(next);
  if (errors.length) throw new ConfigError('New source is invalid', errors);
  return { registry: next, audit: { actor, action: 'source.add', target: { type: 'source', id: s.id } } };
}

const EDITABLE = [
  'name',
  'frequencyMinutes',
  'trustTier',
  'permittedMetadata',
  'mediaPermission',
  'mediaHosts',
  'notes',
  'flags',
  'defaultCategory',
  'endpoints',
  'domains',
  'feedHosts',
  'language',
] as const;

/** Edits descriptive and permission fields. Approval and enabled state have their own operations. */
export function updateSource(
  reg: Registry,
  id: string,
  actor: string,
  patch: Partial<Pick<Source, (typeof EDITABLE)[number]>>,
  reason?: string
): AdminResult {
  for (const k of Object.keys(patch)) {
    if (!(EDITABLE as readonly string[]).includes(k)) {
      throw new AuthorityError(`Field "${k}" cannot be changed through updateSource`);
    }
  }
  return mutate(reg, id, actor, 'source.update', reason, (s) => Object.assign(s, clone(patch)));
}
