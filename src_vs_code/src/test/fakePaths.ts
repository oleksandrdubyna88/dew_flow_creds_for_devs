// Fake paths for test worlds that never touch the disk. They sit under a root that does not
// exist and is not world-writable, so an accidental write fails loudly instead of leaving a
// file in /tmp (Sonar S5443). Real files belong in an owned run folder (mkdtemp), not here.
export const FAKE_ROOT = '/nonexistent/creds-test';
export const fakePath = (name: string): string => `${FAKE_ROOT}/${name}`;

export const FAKE_STORAGE_DIR = fakePath('storage');
export const OUR_SOCKET = fakePath('ours.sock');
export const HOST_SOCKET = fakePath('host-agent.sock');
export const KEY_FILE = fakePath('k.key');
