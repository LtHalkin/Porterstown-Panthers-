// Minimal GitHub git-data client. One admin save = one commit = one Cloudflare rebuild.

export interface Env {
  ADMIN_PASSWORD?: string;
  GITHUB_TOKEN?: string;
  SESSION_SECRET?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_API?: string;
}

export class GitHub {
  env: Env;
  constructor(env: Env) { this.env = env; }
  get repo() { return this.env.GITHUB_REPO || 'LtHalkin/Porterstown-Panthers-'; }
  get branch() { return this.env.GITHUB_BRANCH || 'main'; }
  private async call(path: string, init: RequestInit = {}) {
    const base = this.env.GITHUB_API || 'https://api.github.com';
    const res = await fetch(`${base}/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'porterstown-panthers-admin',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`GitHub ${res.status} on ${path.split('?')[0]}: ${t.slice(0, 200)}`);
    }
    return res.json() as Promise<any>;
  }
  async head() {
    const ref = await this.call(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const commit = await this.call(`/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha as string, tree: commit.tree.sha as string };
  }
  async tree(treeSha: string) {
    const t = await this.call(`/git/trees/${treeSha}?recursive=1`);
    const map = new Map<string, string>();
    for (const e of t.tree) if (e.type === 'blob') map.set(e.path, e.sha);
    return map;
  }
  async blob(sha: string): Promise<{ content: string; encoding: string }> { return this.call(`/git/blobs/${sha}`); }
  async readText(sha: string) {
    const b = await this.blob(sha);
    const bin = atob(b.content.replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  async commit(message: string, parent: { commit: string; tree: string },
    changes: { path: string; text?: string; base64?: string; remove?: boolean }[]) {
    const entries: any[] = [];
    for (const c of changes) {
      if (c.remove) { entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const blob = await this.call('/git/blobs', {
        method: 'POST',
        body: JSON.stringify(c.base64 !== undefined ? { content: c.base64, encoding: 'base64' } : { content: c.text, encoding: 'utf-8' }),
      });
      entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.call('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree, tree: entries }) });
    const commit = await this.call('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [parent.commit] }),
    });
    await this.call(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    return commit.sha as string;
  }
}
