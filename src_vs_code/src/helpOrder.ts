/**
 * The catalog order, which is deliberately NOT alphabetical: the less guessable a feature is from
 * its menu entry, the earlier it goes. (The owner's own examples led — what are *MCP logs*? what
 * does *Install…* install?) Data rather than an accident of file layout, so a language file can be
 * rewritten without moving the index.
 */
export const HELP_ARTICLE_IDS: readonly string[] = [
  'getting-started',
  'protection',
  'recovery-code',
  'backup',
  'restore',
  'sync-vs-snapshots',
  'install-menu',
  'git-storage',
  'basics',
  'import-existing',
  'trash',
  'project-folders',
  'share-with-agent',
  'agents-mcp',
  'agent-surface',
  'mcp-logs',
  'mcp-in-wsl',
  'config-entities',
  'ephemeral',
  'totp',
  'secret-references',
  'ssh-agent',
  'cli',
  'remote-bridge',
  'wsl-relay',
  'sharing',
  'corporate-recovery',
  'corporate-roles',
  'filters',
  'health',
  'secret-scan',
  'clipboard',
  'entity-pin',
  'woven-password',
  'payment-instruments',
];
