/*
  Store: the only place that touches localStorage.
  Everything is kept in one key so a project (doc + sheet + checklist) saves
  and loads as a single unit. If localStorage is unavailable (private
  browsing, disabled storage) we fall back to an in-memory copy for the
  session rather than throwing on every save.
*/

const STORAGE_KEY = 'workspace-data-v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

function emptyData() {
  return { projects: [] };
}

let memoryFallback = null;

function readRaw() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptyData();
  } catch (err) {
    // Storage disabled or the saved JSON is corrupt. Don't lose the session,
    // just stop persisting across reloads.
    console.error('Store: falling back to in-memory data', err);
    return memoryFallback || emptyData();
  }
}

function writeRaw(data) {
  memoryFallback = data;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Store: could not save (storage full or disabled)', err);
    return false;
  }
}

const Store = {
  load() {
    return readRaw();
  },

  saveAll(data) {
    return writeRaw(data);
  },

  listProjects() {
    return readRaw().projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  getProject(projectId) {
    return readRaw().projects.find((p) => p.id === projectId) || null;
  },

  createProject(name) {
    const data = readRaw();
    const project = {
      id: uid(),
      name: name || 'Untitled project',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      documents: [],
      layout: 1,
      paneAssignments: [null, null, null],
      progress: 0,
      deadline: null,
      coverPhoto: null,
    };
    data.projects.push(project);
    writeRaw(data);
    return project;
  },

  renameProject(projectId, name) {
    return this.updateProjectDetails(projectId, { name });
  },

  updateProjectDetails(projectId, { name, progress, deadline, coverPhoto }) {
    const data = readRaw();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    if (name !== undefined) project.name = name;
    if (progress !== undefined) project.progress = progress;
    if (deadline !== undefined) project.deadline = deadline;
    if (coverPhoto !== undefined) project.coverPhoto = coverPhoto;
    project.updatedAt = nowIso();
    const saved = writeRaw(data);
    return saved ? project : null;
  },

  deleteProject(projectId) {
    const data = readRaw();
    data.projects = data.projects.filter((p) => p.id !== projectId);
    writeRaw(data);
  },

  createDocument(projectId, type, title, content) {
    const data = readRaw();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const doc = {
      id: uid(),
      type, // 'document' | 'sheet' | 'checklist'
      title: title || 'Untitled',
      content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    project.documents.push(doc);
    project.updatedAt = nowIso();
    writeRaw(data);
    return doc;
  },

  getDocument(projectId, docId) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return project.documents.find((d) => d.id === docId) || null;
  },

  updateDocument(projectId, docId, patch) {
    const data = readRaw();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) return null;
    Object.assign(doc, patch, { updatedAt: nowIso() });
    project.updatedAt = nowIso();
    writeRaw(data);
    return doc;
  },

  updateLayout(projectId, layout, paneAssignments) {
    const data = readRaw();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    project.layout = layout;
    project.paneAssignments = paneAssignments;
    project.updatedAt = nowIso();
    writeRaw(data);
    return project;
  },

  deleteDocument(projectId, docId) {
    const data = readRaw();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.documents = project.documents.filter((d) => d.id !== docId);
    project.paneAssignments = project.paneAssignments.map((id) => (id === docId ? null : id));
    project.updatedAt = nowIso();
    writeRaw(data);
  },
};
