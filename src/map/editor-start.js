// The caller validates map documents before planning startup. This selection
// never writes browser storage or mutates a map: opening the project must not
// replace someone's saved work.
export function requestedEditorStart(search = '') {
  const value = new URLSearchParams(search).get('start');
  return value === 'project' || value === 'draft' ? value : null;
}

export function planEditorStart({ project, snapshot = null, draft = null, requested = null }) {
  const source = requested === 'draft' ? (draft ? 'draft' : 'project')
    : requested === 'project' ? 'project'
      : snapshot ? 'snapshot' : 'project';
  const map = source === 'draft' ? draft : source === 'snapshot' ? snapshot : project;
  const pendingDraft = draft && JSON.stringify(draft) !== JSON.stringify(map) ? draft : null;
  return {
    map, source, pendingDraft,
    offerChoice: !requested && !snapshot && Boolean(pendingDraft),
    missingDraft: requested === 'draft' && !draft,
  };
}

export function editorVersionLabel(info) {
  return typeof info?.buildId === 'string' && info.buildId
    ? `Editor ${info.buildId.slice(0, 12)}` : 'Editor · Entwicklung';
}

export function editorMapSourceLabel(source, changed = false) {
  const label = { project: 'Projektkarte', draft: 'Eigener Entwurf', snapshot: 'Mitgenommene Karte', imported: 'Geöffnete Karte' }[source] ?? 'Eigene Karte';
  return changed ? `${label} · bearbeitet` : label;
}
