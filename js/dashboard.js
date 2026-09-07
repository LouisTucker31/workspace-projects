document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('project-grid');
  const emptyState = document.getElementById('empty-state');
  const newProjectForm = document.getElementById('new-project-form');
  const newProjectInput = document.getElementById('new-project-name');
  const exportBtn = document.getElementById('export-data-btn');
  const importBtn = document.getElementById('import-data-btn');
  const importInput = document.getElementById('import-data-input');

  function docCountLabel(project) {
    const n = project.documents.length;
    if (n === 0) return 'No documents yet';
    if (n === 1) return '1 document';
    return `${n} documents`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDeadline(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function resizeImageFile(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function openEditDialog(project) {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = `
      <form method="dialog">
        <h3>Edit project</h3>
        <label>Name
          <input type="text" class="edit-name" maxlength="100" required />
        </label>
        <label>Progress (%)
          <input type="number" class="edit-progress" min="0" max="100" step="1" />
        </label>
        <label>Deadline
          <input type="date" class="edit-deadline" />
        </label>
        <label>Cover photo
          <input type="file" class="edit-cover" accept="image/*" />
        </label>
        <div class="edit-cover-preview-wrap">
          <img class="edit-cover-preview" hidden />
          <button type="button" class="edit-cover-remove" hidden>Remove cover photo</button>
        </div>
        <div class="dialog-actions">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="confirm">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('.edit-name').value = project.name;
    dialog.querySelector('.edit-progress').value = project.progress || 0;
    dialog.querySelector('.edit-deadline').value = project.deadline || '';

    let coverPhoto = project.coverPhoto || null;
    const coverInput = dialog.querySelector('.edit-cover');
    const coverPreview = dialog.querySelector('.edit-cover-preview');
    const coverRemove = dialog.querySelector('.edit-cover-remove');

    function refreshCoverPreview() {
      if (coverPhoto) {
        coverPreview.src = coverPhoto;
        coverPreview.hidden = false;
        coverRemove.hidden = false;
      } else {
        coverPreview.hidden = true;
        coverRemove.hidden = true;
      }
    }
    refreshCoverPreview();

    coverInput.addEventListener('change', () => {
      const file = coverInput.files && coverInput.files[0];
      if (!file) return;
      resizeImageFile(file, 640, 360).then((dataUrl) => {
        coverPhoto = dataUrl;
        refreshCoverPreview();
      });
    });

    coverRemove.addEventListener('click', () => {
      coverPhoto = null;
      coverInput.value = '';
      refreshCoverPreview();
    });

    dialog.querySelector('.cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').addEventListener('submit', () => {
      const name = dialog.querySelector('.edit-name').value.trim() || project.name;
      let progress = Number(dialog.querySelector('.edit-progress').value);
      if (Number.isNaN(progress)) progress = 0;
      progress = Math.max(0, Math.min(100, Math.round(progress)));
      const deadline = dialog.querySelector('.edit-deadline').value || null;
      const saved = Store.updateProjectDetails(project.id, { name, progress, deadline, coverPhoto });
      if (!saved) {
        window.alert("Couldn't save your changes — storage is full. Try a smaller cover photo or remove one from another project.");
      }
      render();
    });

    dialog.showModal();
  }

  function render() {
    const projects = Store.listProjects();
    grid.innerHTML = '';
    emptyState.hidden = projects.length > 0;

    projects.forEach((project) => {
      const card = document.createElement('article');
      card.className = 'project-card';
      card.innerHTML = `
        <h2 class="project-card-title"></h2>
        <p class="project-card-meta"></p>
        <div class="project-card-progress">
          <div class="project-card-progress-bar"><div class="project-card-progress-fill"></div></div>
          <span class="project-card-progress-label"></span>
        </div>
        <p class="project-card-deadline"></p>
        <img class="project-card-cover" hidden />
        <div class="project-card-actions">
          <button type="button" class="open-btn">Open</button>
          <button type="button" class="edit-btn">Edit</button>
          <button type="button" class="delete-btn">Delete</button>
        </div>
      `;
      card.querySelector('.project-card-title').textContent = project.name;
      card.querySelector('.project-card-meta').textContent = `${docCountLabel(project)} · Updated ${formatDate(project.updatedAt)}`;

      const progress = Math.max(0, Math.min(100, project.progress || 0));
      card.querySelector('.project-card-progress-fill').style.width = `${progress}%`;
      card.querySelector('.project-card-progress-label').textContent = `${progress}%`;

      const deadlineEl = card.querySelector('.project-card-deadline');
      if (project.deadline) {
        deadlineEl.textContent = `Deadline: ${formatDeadline(project.deadline)}`;
      } else {
        deadlineEl.hidden = true;
      }

      const coverEl = card.querySelector('.project-card-cover');
      if (project.coverPhoto) {
        coverEl.src = project.coverPhoto;
        coverEl.alt = `${project.name} cover photo`;
        coverEl.hidden = false;
      } else {
        coverEl.hidden = true;
      }

      card.querySelector('.open-btn').addEventListener('click', () => {
        window.location.href = `pages/workspace.html?project=${encodeURIComponent(project.id)}`;
      });
      card.querySelector('.edit-btn').addEventListener('click', () => {
        openEditDialog(project);
      });
      card.querySelector('.delete-btn').addEventListener('click', () => {
        if (window.confirm(`Delete "${project.name}" and everything in it? This can't be undone.`)) {
          Store.deleteProject(project.id);
          render();
        }
      });

      grid.appendChild(card);
    });
  }

  exportBtn.addEventListener('click', () => {
    const data = Store.load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => {
    importInput.value = '';
    importInput.click();
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        window.alert("That file isn't valid exported data.");
        return;
      }
      if (!data || !Array.isArray(data.projects)) {
        window.alert("That file isn't valid exported data.");
        return;
      }
      const existing = Store.load();
      const mode = existing.projects.length === 0
        ? 'replace'
        : window.confirm(`You already have ${existing.projects.length} project(s) here. Click OK to ADD the imported projects alongside them, or Cancel to REPLACE everything with the imported data.`)
          ? 'merge'
          : 'replace';

      const finalData = mode === 'merge'
        ? { projects: existing.projects.concat(data.projects) }
        : data;

      const saved = Store.saveAll(finalData);
      if (!saved) {
        window.alert("Couldn't import — storage is full.");
        return;
      }
      render();
    };
    reader.readAsText(file);
  });

  newProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newProjectInput.value.trim();
    if (!name) return;
    const project = Store.createProject(name);
    newProjectInput.value = '';
    window.location.href = `pages/workspace.html?project=${encodeURIComponent(project.id)}`;
  });

  render();
});
