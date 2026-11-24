// Talks to the Poreen Worker (github.com/LtHalkin/Poreen).

export function createApi(base) {
  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        cache: 'no-store',
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Couldn't reach Poreen. Check your connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const auth = (token, admin) => (admin ? { 'x-admin-code': admin } : { 'x-run-token': token || '' });

  return {
    list: () => call('/api/runs'),
    create: (run) => call('/api/runs', { method: 'POST', body: run }),
    edit: (id, changes, token, admin) => call(`/api/runs/${id}`, { method: 'PATCH', body: changes, headers: auth(token, admin) }),
    remove: (id, token, admin) => call(`/api/runs/${id}`, { method: 'DELETE', headers: auth(token, admin) }),
    kudos: (id) => call(`/api/runs/${id}/kudos`, { method: 'POST' }),
    checkAdmin: (code) => call('/api/admin/check', { method: 'POST', headers: { 'x-admin-code': code } }),
    rename: (from, to, admin) => call('/api/admin/rename', { method: 'POST', body: { from, to }, headers: { 'x-admin-code': admin } }),
  };
}
