(() => {
  'use strict';

  // Declare timer before every function that can schedule/cancel project saves.
  let saveTimer = 0;
  const STORAGE_KEY = 'visualization_workspace_v1';
  const STORAGE_PROJECT_ID_KEY = 'visualization_workspace_project_id_v1';
  const PROJECT_INDEX_KEY = 'netnotrh_projects_index_v1';
  const PROJECT_KEY_PREFIX = 'netnotrh_project_';
  const THEME_KEY = 'netnotrh_theme_v1';
  const AUTO_ARRANGE_KEY = 'netnotrh_auto_arrange_v1';
  const EMPTY_HINT_DISMISSED_KEY = 'netnotrh_empty_hint_dismissed_v1';
  const stage = document.getElementById('stage');
  const workspace = document.getElementById('workspace');
  const world = document.getElementById('world');
  const nodeContextMenu = document.getElementById('nodeContextMenu');
  const canvasContextActions = document.getElementById('canvasContextActions');
  const nodeContextActions = document.getElementById('nodeContextActions');
  const textNodeContextActions = document.getElementById('textNodeContextActions');
  const zoomIndicator = document.getElementById('zoomIndicator');
  const CANVAS_PAD = 1400;
  let zoom = 1;
  let contextNodeId = null;
  const emptyState = document.getElementById('emptyState');
  const emptyStateCloseBtn = document.getElementById('emptyStateCloseBtn');
  let emptyHintDismissed = false;
  const projectTitle = document.getElementById('projectTitle');
  const modeIndicator = document.getElementById('modeIndicator');
  const toastEl = document.getElementById('toast');
  const playbackPanel = document.getElementById('playbackPanel');
  const playbackRange = document.getElementById('playbackRange');
  const playbackTime = document.getElementById('playbackTime');
  const playbackStep = document.getElementById('playbackStep');
  const playbackSubtitle = document.getElementById('playbackSubtitle');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const importFile = document.getElementById('importFile');
  const imageFile = document.getElementById('imageFile');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const exitConfirmBackdrop = document.getElementById('exitConfirmBackdrop');
  const exitSaveBtn = document.getElementById('exitSaveBtn');
  const exitWithoutSaveBtn = document.getElementById('exitWithoutSaveBtn');
  const exitCancelBtn = document.getElementById('exitCancelBtn');
  const startScreen = document.getElementById('startScreen');
  const projectActionsMenu = document.getElementById('projectActionsMenu');
  const projectRenameBackdrop = document.getElementById('projectRenameBackdrop');
  const projectRenameForm = document.getElementById('projectRenameForm');
  const projectRenameInput = document.getElementById('projectRenameInput');
  const projectRenameCancelBtn = document.getElementById('projectRenameCancelBtn');
  const projectDeleteBackdrop = document.getElementById('projectDeleteBackdrop');
  const projectDeleteCancelBtn = document.getElementById('projectDeleteCancelBtn');
  const projectDeleteConfirmBtn = document.getElementById('projectDeleteConfirmBtn');
  const exportScreen = document.getElementById('exportScreen');
  const selectedIds = [];
  const selectedEdgeIds = [];
  let currentProjectId = null;
  let boxSelect = null;
  let suppressContextMenuUntil = 0;
  let contextCanvasPoint = { x: 0, y: 0 };
  let pendingImagePoint = { x: 0, y: 0 };
  let activeProjectActionId = null;
  let activeProjectActionButton = null;
  let renameTargetProjectId = null;
  let deleteTargetProjectId = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const freshScene = () => ({ nodes: [], edges: [] });
  let scene = freshScene();
  let selectedId = null;
  let editingId = null;
  let editingOriginalText = null;
  let mode = 'select';
  let connectionSourceId = null;
  let drag = null;
  // Track movement during the active pointer gesture. The flag is cleared on pointerup;
  // a one-shot capture listener separately blocks the synthetic click after dragging a link.
  let wasDragging = false;
  let linkDraft = null;
  let currentRenderScene = null;
  // Cached DOM/model indexes let drag operations update only affected nodes and edges.
  // This avoids rebuilding the whole DOM/SVG on every pointermove for large graphs.
  let renderedNodeElements = new Map();
  let renderedNodeModels = new Map();
  let renderedEdgeElements = new Map();
  let renderedNodeToEdges = new Map();
  let renderedConnectionsSvg = null;
  let dragPaintRaf = 0;
  let undoStack = [];
  let undoIndex = -1;
  let timeline = [];
  let projectStartedAt = Date.now();
  let playback = { active: false, playing: false, completed: false, generation: 0, startedAt: 0, pausedAt: 0, duration: 8000, frameIndex: 0, raf: 0, savedScrollLeft: 0, savedScrollTop: 0 };
  let toastTimer = 0;
  // Снимок ожидающей записи захватывается в момент saveProject(), а не внутри таймера.
  // Это не позволяет сохранению проекта A записать уже активное состояние проекта B.
  let pendingSave = null;
  let shouldFocusNewNode = false;
  let confirmCallback = null;
  let localStorageAvailable = true;
  let autoArrangeEnabled = true;

  const icons = {
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>'
  };

  function safeId() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nodeById(id, model = scene) { return model.nodes.find(n => n.id === id); }
  function snapshot(model = scene) { return clone({ nodes: model.nodes, edges: model.edges }); }
  function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function nowRelative() { return Math.max(0, Date.now() - projectStartedAt); }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2300);
  }

  function makeProjectId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function readProjectIndex() {
    try {
      const value = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
    } catch (_) { return []; }
  }

  function writeProjectIndex(index) {
    const retained = index.slice(0, 30);
    try {
      const previous = readProjectIndex();
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(retained));
      const retainedIds = new Set(retained.map(item => item.id));
      previous.forEach(item => {
        if (item && typeof item.id === 'string' && !retainedIds.has(item.id)) {
          localStorage.removeItem(PROJECT_KEY_PREFIX + item.id);
        }
      });
    } catch (error) {
      console.warn('Project index save failed:', error);
    }
  }

  function upsertProjectIndex(data, id = currentProjectId) {
    if (!localStorageAvailable || !id) return;
    const index = readProjectIndex().filter(item => item.id !== id);
    index.unshift({ id, title: data.title || 'Новая схема', updatedAt: Date.now() });
    writeProjectIndex(index);
  }

  function migrateLegacyProject() {
    if (!localStorageAvailable) return;
    try {
      let index = readProjectIndex();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!index.length && raw) {
        const data = JSON.parse(raw);
        if (data && data.scene && Array.isArray(data.scene.nodes) && Array.isArray(data.scene.edges)) {
          const known = index.some(item => item.id === 'previous-session');
          if (!known) {
            localStorage.setItem(PROJECT_KEY_PREFIX + 'previous-session', raw);
            localStorage.setItem(STORAGE_PROJECT_ID_KEY, 'previous-session');
            index.unshift({ id: 'previous-session', title: data.title || 'Предыдущая схема', updatedAt: Date.now() });
            writeProjectIndex(index);
          }
        }
      }
    } catch (error) { console.warn('Legacy project migration failed:', error); }
  }

  function persistProjectSnapshot(payload) {
    if (!localStorageAvailable || !payload || !payload.id) return false;
    const serialized = JSON.stringify(payload.data);
    // Каждая схема сохраняется по собственному ID независимо от текущего проекта.
    localStorage.setItem(PROJECT_KEY_PREFIX + payload.id, serialized);
    // STORAGE_KEY — только копия последнего активного проекта. Не даём старому
    // таймеру перезаписать её данными проекта, который пользователь уже покинул.
    if (currentProjectId === payload.id) {
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_PROJECT_ID_KEY, payload.id);
    }
    upsertProjectIndex(payload.data, payload.id);
    if (startScreen.classList.contains('visible') && !document.getElementById('startProjectsPanel').hidden) renderProjectList();
    return true;
  }

  function flushPendingSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = 0;
    const payload = pendingSave;
    pendingSave = null;
    if (!payload) return false;
    try {
      return persistProjectSnapshot(payload);
    } catch (error) {
      // Сохраняем снимок в памяти, чтобы следующая попытка могла повторить запись.
      pendingSave = payload;
      console.warn('Local save failed:', error);
      return false;
    }
  }

  function cancelPendingProjectSave(id) {
    if (pendingSave && pendingSave.id === id) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = 0;
      pendingSave = null;
    }
  }

  function removeProjectRecord(id, cleanupLegacy = false) {
    if (!id || !localStorageAvailable) return false;

    try {
      localStorage.removeItem(PROJECT_KEY_PREFIX + id);
      const updatedIndex = readProjectIndex().filter(item => item.id !== id);
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(updatedIndex));

      const legacyId = localStorage.getItem(STORAGE_PROJECT_ID_KEY);
      if (legacyId === id) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_PROJECT_ID_KEY);
      } else if (cleanupLegacy) {
        const legacyRaw = localStorage.getItem(STORAGE_KEY);
        let legacyIsEmpty = false;
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw);
            legacyIsEmpty = Boolean(legacy && legacy.scene && Array.isArray(legacy.scene.nodes) && legacy.scene.nodes.length === 0);
          } catch (_) { legacyIsEmpty = false; }
        }
        // If the index is now empty, the untagged legacy mirror can only be a stale duplicate.
        if (legacyIsEmpty || updatedIndex.length === 0) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_PROJECT_ID_KEY);
        }
      }

      if (startScreen.classList.contains('visible') && !document.getElementById('startProjectsPanel').hidden) {
        renderProjectList();
      }
      return true;
    } catch (error) {
      console.warn('Project cleanup failed:', error);
      return false;
    }
  }

  function deleteEmptyProject(id = currentProjectId) {
    if (!id) return false;
    cancelPendingProjectSave(id);
    const removed = removeProjectRecord(id, true);
    if (currentProjectId === id) currentProjectId = null;
    return removed;
  }

  function hasUnsavedChanges() {
    // Empty canvases are handled separately and never produce a save prompt.
    if (!scene.nodes.length) return false;
    if (!currentProjectId || !localStorageAvailable) return true;

    try {
      const raw = localStorage.getItem(PROJECT_KEY_PREFIX + currentProjectId);
      if (!raw) return true;
      const stored = JSON.parse(raw);
      if (!stored || !stored.scene || !Array.isArray(stored.scene.nodes) || !Array.isArray(stored.scene.edges)) return true;

      const currentTitle = projectTitle.value.trim() || 'Новая схема';
      if ((stored.title || 'Новая схема') !== currentTitle) return true;
      // Normalize legacy snapshots so added model defaults do not look like user edits.
      if (!sameJson(sanitizeScene(stored.scene), snapshot())) return true;

      if (Array.isArray(stored.timeline) && stored.timeline.length) {
        const storedTimeline = stored.timeline
          .filter(frame => frame && frame.scene && Array.isArray(frame.scene.nodes) && Array.isArray(frame.scene.edges))
          .map(frame => ({ at: Math.max(0, Number(frame.at) || 0), scene: sanitizeScene(frame.scene) }));
        if (storedTimeline.length && !sameJson(storedTimeline, timeline)) return true;
      }

      const storedStartedAt = Number(stored.projectStartedAt) || Number(projectStartedAt);
      if (storedStartedAt !== Number(projectStartedAt)) return true;
      return false;
    } catch (_) {
      return true;
    }
  }

  function saveProject() {
    if (!localStorageAvailable || !currentProjectId) return;

    // A blank canvas is not a project yet. Cancel any older queued write for this ID
    // so an outdated non-empty snapshot cannot bring the project back later.
    if (!scene.nodes.length) {
      cancelPendingProjectSave(currentProjectId);
      return;
    }

    // На случай, если ID уже сменился в другом вызывающем коде, сначала
    // записываем ожидающий снимок прежнего проекта под его собственным ID.
    if (pendingSave && pendingSave.id !== currentProjectId) flushPendingSave();

    // Фиксируем все данные прямо сейчас. Таймер ниже только записывает готовый
    // снимок и больше не читает изменившиеся currentProjectId или scene.
    const payload = {
      id: currentProjectId,
      data: {
        version: 1,
        title: projectTitle.value.trim() || 'Новая схема',
        scene: snapshot(),
        timeline: clone(timeline),
        projectStartedAt,
        updatedAt: Date.now()
      }
    };
    pendingSave = payload;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushPendingSave, 140);
  }

  function pushUndoSnapshot() {
    const snap = snapshot();
    if (undoIndex >= 0 && sameJson(undoStack[undoIndex], snap)) return;
    undoStack = undoStack.slice(0, undoIndex + 1);
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
    undoIndex = undoStack.length - 1;
  }

  function recordTimeline() {
    const snap = snapshot();
    const last = timeline[timeline.length - 1];
    if (last && sameJson(last.scene, snap)) return;
    timeline.push({ at: nowRelative(), scene: snap });
    if (timeline.length > 500) timeline.splice(1, timeline.length - 500);
  }

  function commitScene(message) {
    pushUndoSnapshot();
    recordTimeline();
    renderScene();
    saveProject();
    updateActionButtons();
    if (message) showToast(message);
  }

  function updateActionButtons() {
    document.getElementById('undoBtn').disabled = undoIndex <= 0 || playback.active;
    document.getElementById('redoBtn').disabled = undoIndex >= undoStack.length - 1 || playback.active;
    const deleteButton = document.getElementById('deleteBtn');
    const selectedNodeCount = selectedIds.length || (selectedId ? 1 : 0);
    const selectedEdgeCount = selectedEdgeIds.length;
    deleteButton.disabled = !(selectedNodeCount || selectedEdgeCount) || playback.active;
    const deleteLabel = document.querySelector('#deleteBtn .label');
    if (deleteLabel) {
      if (selectedNodeCount && selectedEdgeCount) {
        deleteLabel.textContent = `Удалить выбранное (${selectedNodeCount} узл., ${selectedEdgeCount} связ.)`;
      } else if (selectedEdgeCount) {
        deleteLabel.textContent = selectedEdgeCount > 1 ? `Удалить связи (${selectedEdgeCount})` : 'Удалить связь';
      } else if (selectedNodeCount > 1) {
        deleteLabel.textContent = `Удалить выбранные (${selectedNodeCount})`;
      } else {
        deleteLabel.textContent = 'Удалить выбранное';
      }
    }
  }

  function showStartPanel(panelName) {
    ['startMainPanel', 'startProjectsPanel', 'startSettingsPanel'].forEach(id => {
      document.getElementById(id).hidden = id !== panelName;
    });
    if (panelName === 'startProjectsPanel') renderProjectList();
    if (panelName === 'startSettingsPanel') {
      updateThemeChoices();
      updateAutoArrangeChoice();
    }
  }

  function renderProjectList() {
    const list = document.getElementById('savedProjectList');
    if (!list) return;
    list.replaceChildren();

    const projects = readProjectIndex().sort(
      (a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
    );

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'start-empty';
      empty.textContent = 'Сохранённых проектов пока нет. Создай холст, а он появится здесь автоматически.';
      list.appendChild(empty);
      return;
    }

    projects.forEach(item => {
      const row = document.createElement('div');
      row.className = 'saved-project';
      row.dataset.projectId = item.id;

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'saved-project-open';
      openButton.dataset.projectOpenId = item.id;
      openButton.setAttribute('aria-label', `Открыть проект ${item.title || 'Без названия'}`);

      const title = document.createElement('span');
      title.className = 'saved-project-title';
      title.textContent = item.title || 'Без названия';

      const date = document.createElement('span');
      date.className = 'saved-project-date';
      date.textContent = item.updatedAt
        ? new Date(item.updatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
        : 'Локальный проект';
      openButton.append(title, date);

      const actionsButton = document.createElement('button');
      actionsButton.type = 'button';
      actionsButton.className = 'saved-project-actions-button';
      actionsButton.dataset.projectActionsId = item.id;
      actionsButton.textContent = '⋯';
      actionsButton.title = 'Действия с проектом';
      actionsButton.setAttribute('aria-label', `Действия с проектом ${item.title || 'Без названия'}`);
      actionsButton.setAttribute('aria-haspopup', 'menu');
      actionsButton.setAttribute('aria-expanded', 'false');

      row.append(openButton, actionsButton);
      list.appendChild(row);
    });
  }

  function closeProjectActionsMenu() {
    projectActionsMenu.classList.remove('visible');
    if (activeProjectActionButton && activeProjectActionButton.isConnected) {
      activeProjectActionButton.setAttribute('aria-expanded', 'false');
    }
    activeProjectActionButton = null;
    activeProjectActionId = null;
  }

  function openProjectActionsMenu(id, button) {
    if (!id || !button) return;
    if (projectActionsMenu.classList.contains('visible') && activeProjectActionId === id) {
      closeProjectActionsMenu();
      return;
    }

    closeProjectActionsMenu();
    activeProjectActionId = id;
    activeProjectActionButton = button;
    button.setAttribute('aria-expanded', 'true');
    projectActionsMenu.classList.add('visible');

    const rect = button.getBoundingClientRect();
    const menuWidth = 158;
    const menuHeight = 82;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8));
    projectActionsMenu.style.left = `${left}px`;
    projectActionsMenu.style.top = `${top}px`;
  }

  function openRenameProjectModal(id) {
    const item = readProjectIndex().find(project => project.id === id);
    if (!item) {
      showToast('Проект не найден');
      renderProjectList();
      return;
    }

    renameTargetProjectId = id;
    projectRenameInput.value = typeof item.title === 'string' ? item.title : '';
    projectRenameBackdrop.classList.add('visible');
    projectRenameBackdrop.setAttribute('aria-hidden', 'false');

    // Let the modal finish opening before forcing focus into the input.
    window.setTimeout(() => {
      if (!projectRenameBackdrop.classList.contains('visible')) return;
      projectRenameInput.focus({ preventScroll: true });
      projectRenameInput.select();
    }, 50);
  }

  function closeRenameProjectModal() {
    projectRenameBackdrop.classList.remove('visible');
    projectRenameBackdrop.setAttribute('aria-hidden', 'true');
    renameTargetProjectId = null;
  }

  function openDeleteProjectModal(id) {
    const item = readProjectIndex().find(project => project.id === id);
    if (!item) {
      showToast('Проект не найден');
      renderProjectList();
      return;
    }

    deleteTargetProjectId = id;
    projectDeleteBackdrop.classList.add('visible');
    projectDeleteBackdrop.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => projectDeleteConfirmBtn.focus({ preventScroll: true }));
  }

  function closeDeleteProjectModal() {
    projectDeleteBackdrop.classList.remove('visible');
    projectDeleteBackdrop.setAttribute('aria-hidden', 'true');
    deleteTargetProjectId = null;
  }

  function renameProject(id, title) {
    const cleanTitle = String(title ?? '').trim().slice(0, 90);
    if (!cleanTitle) {
      showToast('Введи название проекта');
      // Empty input is recoverable: keep the modal open and return the caret
      // to the field so the user can immediately type a project name.
      if (projectRenameBackdrop.classList.contains('visible')) {
        projectRenameInput.focus({ preventScroll: true });
      }
      return false;
    }
    if (!id) {
      showToast('Проект не найден');
      return false;
    }

    const isActiveProject = currentProjectId === id;

    // A new empty canvas exists only in memory. Rename it there, but do not
    // create a project record or an index entry until the first node is added.
    if (isActiveProject && scene.nodes.length === 0) {
      projectTitle.value = cleanTitle;
      closeRenameProjectModal();
      renderProjectList();
      showToast('Название проекта обновлено');
      return true;
    }

    if (!localStorageAvailable) {
      showToast('Локальное хранилище недоступно');
      return false;
    }

    try {
      const updatedAt = Date.now();
      const projectKey = PROJECT_KEY_PREFIX + id;
      let storedData;

      if (isActiveProject) {
        projectTitle.value = cleanTitle;

        // Persist the latest active scene, then never read pendingSave after flush.
        saveProject();
        if (!flushPendingSave()) {
          throw new Error('Не удалось сохранить активный проект перед переименованием');
        }

        const savedRaw = localStorage.getItem(projectKey);
        if (!savedRaw) {
          throw new Error('Сохранённый активный проект не найден после записи');
        }
        storedData = JSON.parse(savedRaw);
      } else {
        // Finish a queued write for this target before reading its stored snapshot.
        const hasQueuedSaveForTarget = Boolean(pendingSave && pendingSave.id === id);
        if (hasQueuedSaveForTarget && !flushPendingSave()) {
          throw new Error('Не удалось завершить ожидающее сохранение проекта');
        }

        const raw = localStorage.getItem(projectKey);
        if (!raw) {
          showToast('Сохранённый проект не найден');
          renderProjectList();
          return false;
        }
        storedData = JSON.parse(raw);
      }

      if (!storedData || typeof storedData !== 'object') {
        throw new Error('Некорректные данные проекта');
      }

      storedData.title = cleanTitle;
      storedData.updatedAt = updatedAt;
      localStorage.setItem(projectKey, JSON.stringify(storedData));

      if (localStorage.getItem(STORAGE_PROJECT_ID_KEY) === id) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
      }

      // Update the index only after the actual project snapshot is stored.
      const index = readProjectIndex();
      let indexItem = index.find(project => project.id === id);
      if (indexItem) {
        indexItem.title = cleanTitle;
        indexItem.updatedAt = updatedAt;
      } else {
        indexItem = { id, title: cleanTitle, updatedAt };
        index.unshift(indexItem);
      }
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));

      closeRenameProjectModal();
      renderProjectList();
      showToast('Название проекта обновлено');
      return true;
    } catch (error) {
      console.warn('Project rename failed:', error);
      showToast('Не удалось переименовать проект');
      return false;
    }
  }

  function deleteProject(id) {
    if (!id) return false;
    if (!localStorageAvailable) {
      showToast('Локальное хранилище недоступно');
      return false;
    }

    const isActiveProject = currentProjectId === id;

    // Cancel the pending debounced write before deleting storage or clearing scene.
    cancelPendingProjectSave(id);
    const removed = removeProjectRecord(id, true);
    if (!removed) {
      showToast('Не удалось удалить проект');
      return false;
    }

    if (isActiveProject) {
      projectTitle.value = 'Новая схема';
      currentProjectId = null;
      scene = freshScene();
      selectedId = null;
      selectedIds.splice(0);
      editingId = null;
      editingOriginalText = null;
      connectionSourceId = null;
      linkDraft = null;
      drag = null;
      boxSelect = null;
      contextNodeId = null;
      timeline = [{ at: 0, scene: snapshot() }];
      undoStack = [snapshot()];
      undoIndex = 0;
      closeNodeContextMenu();
      renderScene();
      updateActionButtons();
    }

    closeDeleteProjectModal();
    renderProjectList();
    showToast('Проект удалён');
    return true;
  }

  function applyTheme(theme, persist = true) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', normalized === 'dark');
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === normalized));
    if (persist && localStorageAvailable) {
      try { localStorage.setItem(THEME_KEY, normalized); } catch (_) {}
    }
    if (stage) renderScene(currentRenderScene || scene);
  }

  function updateThemeChoices() {
    const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === theme));
  }

  function updateAutoArrangeChoice() {
    const toggle = document.getElementById('autoArrangeToggle');
    if (toggle) toggle.checked = autoArrangeEnabled;
  }

  function setAutoArrangeEnabled(enabled, persist = true) {
    autoArrangeEnabled = Boolean(enabled);
    updateAutoArrangeChoice();
    if (persist && localStorageAvailable) {
      try { localStorage.setItem(AUTO_ARRANGE_KEY, autoArrangeEnabled ? '1' : '0'); } catch (_) {}
    }
  }

  function generateNewProjectTitle() {
    const baseTitle = 'Новая схема';
    const titlePattern = /^Новая схема(?: \((\d+)\))?$/;
    let maxNumber = 0;

    for (const project of readProjectIndex()) {
      const title = String(project.title || '').trim();
      const match = title.match(titlePattern);
      if (!match) continue;

      // Legacy projects named exactly "Новая схема" count as the first entry.
      const number = match[1] ? Number(match[1]) : 1;
      if (Number.isSafeInteger(number) && number >= 1 && number > maxNumber) {
        maxNumber = number;
      }
    }

    return `${baseTitle} (${maxNumber + 1})`;
  }

  function beginNewProject() {
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (editingId) finishEditing(editingId, true);
    // Сбрасываем последнее сохранение старого проекта до смены ID.
    flushPendingSave();
    const newTitle = generateNewProjectTitle();
    currentProjectId = makeProjectId();
    scene = freshScene(); selectedId = null; selectedIds.splice(0); editingId = null; editingOriginalText = null;
    connectionSourceId = null; linkDraft = null; drag = null; boxSelect = null; contextNodeId = null;
    projectTitle.value = newTitle; projectStartedAt = Date.now();
    timeline = [{ at: 0, scene: snapshot() }];
    undoStack = [snapshot()]; undoIndex = 0;
    mode = 'select'; syncModeButtons();
    startScreen.classList.remove('visible'); closeNodeContextMenu(); closeConfirm();
    renderScene();
    requestAnimationFrame(() => { workspace.scrollLeft = CANVAS_PAD * zoom; workspace.scrollTop = CANVAS_PAD * zoom; });
    // Do not persist an empty canvas. The first real node creation will save it.
    updateActionButtons();
  }

  function openSavedProject(id) {
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (!localStorageAvailable) { showToast('Локальные проекты недоступны в этом браузере'); return; }
    try {
      if (editingId) finishEditing(editingId, true);
      // Важно сбросить изменения текущего проекта до чтения/переключения на другой.
      flushPendingSave();
      const raw = localStorage.getItem(PROJECT_KEY_PREFIX + id);
      if (!raw) { showToast('Проект не найден'); renderProjectList(); return; }
      const data = JSON.parse(raw);
      if (!data || !data.scene || !Array.isArray(data.scene.nodes) || !Array.isArray(data.scene.edges)) throw new Error('Invalid project');
      currentProjectId = id;
      scene = sanitizeScene(data.scene);
      projectTitle.value = typeof data.title === 'string' && data.title.trim() ? data.title : 'Новая схема';
      timeline = Array.isArray(data.timeline) ? data.timeline.filter(f => f && f.scene && Array.isArray(f.scene.nodes) && Array.isArray(f.scene.edges)).map(f => ({ at: Math.max(0, Number(f.at) || 0), scene: sanitizeScene(f.scene) })) : [];
      projectStartedAt = Number(data.projectStartedAt) || Date.now();
      if (!timeline.length) timeline = [{ at: 0, scene: freshScene() }, { at: 1, scene: snapshot() }];
      if (!sameJson(timeline[timeline.length - 1].scene, snapshot())) timeline.push({ at: nowRelative(), scene: snapshot() });
      selectedId = null; selectedIds.splice(0); editingId = null; editingOriginalText = null; linkDraft = null; connectionSourceId = null;
      undoStack = [snapshot()]; undoIndex = 0;
      mode = 'select'; syncModeButtons();
      startScreen.classList.remove('visible'); renderScene(); updateActionButtons();
      requestAnimationFrame(() => { workspace.scrollLeft = CANVAS_PAD * zoom; workspace.scrollTop = CANVAS_PAD * zoom; });
    } catch (error) { console.warn('Project could not be opened:', error); showToast('Не удалось открыть проект'); }
  }

  function completeExitToStartScreen() {
    closeExitConfirm();
    // The start menu is no longer editing an active project. Keeping the scene in
    // memory is harmless; clearing its ID prevents pagehide from saving discarded edits.
    currentProjectId = null;
    showStartScreen(true);
  }

  function confirmExit() {
    if (editingId) finishEditing(editingId, true);

    if (!currentProjectId) {
      showStartScreen(true);
      return;
    }

    // Пустые холсты удаляются без подтверждения и не засоряют список проектов.
    if (!scene.nodes.length) {
      deleteEmptyProject(currentProjectId);
      completeExitToStartScreen();
      return;
    }

    const hasPendingWrite = !!(pendingSave && pendingSave.id === currentProjectId);
    const hasChanges = hasUnsavedChanges();

    if (!hasChanges) {
      // Даже если изменений нет, не оставляем таймер сохранения висеть при выходе.
      if (hasPendingWrite && !flushPendingSave()) {
        showToast('Не удалось завершить сохранение. Попробуй ещё раз');
        return;
      }
      completeExitToStartScreen();
      return;
    }

    // Этот HTML-модал нужен для переходов внутри приложения. При закрытии вкладки
    // браузер использует собственный beforeunload-диалог.
    exitConfirmBackdrop.classList.add('visible');
    exitConfirmBackdrop.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      if (exitConfirmBackdrop.classList.contains('visible')) {
        exitSaveBtn.focus({ preventScroll: true });
      }
    });
  }

  function showStartScreen(skipExitConfirmation = false) {
    if (!skipExitConfirmation && !startScreen.classList.contains('visible') && currentProjectId) {
      confirmExit();
      return;
    }
    showStartPanel('startMainPanel');
    startScreen.classList.add('visible');
  }

  function closeExitConfirm() {
    exitConfirmBackdrop.classList.remove('visible');
    exitConfirmBackdrop.setAttribute('aria-hidden', 'true');
  }

  function saveAndExitToStartScreen() {
    if (editingId) finishEditing(editingId, true);
    if (!scene.nodes.length) {
      deleteEmptyProject(currentProjectId);
      completeExitToStartScreen();
      return;
    }
    if (!localStorageAvailable) {
      showToast('Не удалось сохранить: локальное хранилище недоступно');
      return;
    }

    saveProject();
    const saved = flushPendingSave();
    if (!saved) {
      showToast('Не удалось сохранить проект. Попробуй ещё раз');
      return;
    }
    completeExitToStartScreen();
  }

  function exitWithoutSavingToStartScreen() {
    const id = currentProjectId;
    if (id) {
      cancelPendingProjectSave(id);
      // A brand-new unsaved project has no baseline to keep. Remove any orphaned
      // index entry, but preserve an existing stored version of an edited project.
      if (localStorageAvailable) {
        let hasStoredBaseline = false;
        try { hasStoredBaseline = Boolean(localStorage.getItem(PROJECT_KEY_PREFIX + id)); } catch (_) {}
        if (!hasStoredBaseline) removeProjectRecord(id, false);
      }
    }
    completeExitToStartScreen();
  }

  function sanitizeNode(n) {
    const clean = {
      id: String(n && n.id || safeId()),
      x: clamp(Number(n && n.x) || 0, 0, 100000),
      y: clamp(Number(n && n.y) || 0, 0, 100000),
      text: String(n && n.text || '').slice(0, 10000),
      width: clamp(Number(n && n.width) || 180, 10, 2000),
      height: clamp(Number(n && n.height) || 42, 10, 1200),
      fontSize: clamp(Number(n && n.fontSize) || 16, 8, 80),
      autoSize: !n || n.autoSize !== false,
      color: ['#111111','#4b4b4b','#888888','#bf2929','#185abc','#267344','#7a35a2'].includes(n && n.color) ? n.color : '#111111',
      underline: !!(n && n.underline),
      highlight: !!(n && n.highlight),
      type: n && n.type === 'image' ? 'image' : 'text',
      image: n && n.type === 'image' && typeof n.image === 'string' ? n.image.slice(0, 12000000) : '',
      aspectRatio: n && n.type === 'image' && Number(n.aspectRatio) > 0
        ? clamp(Number(n.aspectRatio), 0.01, 100)
        : (n && n.type === 'image' && Number(n.width) > 0 && Number(n.height) > 0 ? clamp(Number(n.width) / Number(n.height), 0.01, 100) : 1)
    };
    return clean;
  }

  function sanitizeScene(input) {
    const nodes = Array.isArray(input && input.nodes) ? input.nodes.slice(0, 500).map(n => sanitizeNode(n)) : [];
    const ids = new Set(nodes.map(n => n.id));
    const edges = Array.isArray(input && input.edges) ? input.edges.slice(0, 2000).filter(e => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to).map(e => ({
      id: String(e.id || safeId()), from: String(e.from), to: String(e.to),
      fromSide: validSide(e.fromSide) ? e.fromSide : 'right',
      toSide: validSide(e.toSide) ? e.toSide : 'left'
    })) : [];
    return { nodes, edges };
  }
  function validSide(s) { return ['top','right','bottom','left'].includes(s); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function syncModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(next) {
    if (playback.active) exitPlayback();
    closeNodeContextMenu();
    mode = next;
    if (selectedId && next !== 'select') selectedIds.splice(0, selectedIds.length, selectedId);
    else if (!selectedId && next !== 'select') selectedIds.splice(0);
    connectionSourceId = null;
    syncModeButtons();
    if (mode === 'text') {
      modeIndicator.innerHTML = '<b>Текстовый узел</b> · нажмите на свободное место';
      modeIndicator.classList.add('visible');
      stage.style.cursor = 'crosshair'; workspace.style.cursor = 'crosshair';
    } else if (mode === 'connect') {
      modeIndicator.innerHTML = '<b>Связь</b> · выберите начальный и конечный узел';
      modeIndicator.classList.add('visible');
      stage.style.cursor = 'crosshair';
    } else {
      modeIndicator.classList.remove('visible');
      stage.style.cursor = 'grab'; workspace.style.cursor = 'grab';
    }
    renderScene();
  }

  function getStagePoint(event) {
    const rect = stage.getBoundingClientRect();
    return { x: Math.max(0, (event.clientX - rect.left) / zoom), y: Math.max(0, (event.clientY - rect.top) / zoom) };
  }
  function syncZoomLayout(baseWidth, baseHeight) {
    stage.style.left = `${CANVAS_PAD * zoom}px`;
    stage.style.top = `${CANVAS_PAD * zoom}px`;
    stage.style.transform = `scale(${zoom})`;
    world.style.width = `${(baseWidth + CANVAS_PAD * 2) * zoom}px`;
    world.style.height = `${(baseHeight + CANVAS_PAD * 2) * zoom}px`;
    zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
  }
  function setZoom(nextZoom, clientX, clientY) {
    const next = clamp(nextZoom, .25, 2.5);
    if (Math.abs(next - zoom) < .001) return;
    const rect = workspace.getBoundingClientRect();
    const offsetX = (clientX ?? (rect.left + rect.width / 2)) - rect.left;
    const offsetY = (clientY ?? (rect.top + rect.height / 2)) - rect.top;
    const worldX = (workspace.scrollLeft + offsetX) / zoom;
    const worldY = (workspace.scrollTop + offsetY) / zoom;
    zoom = next;
    // Zooming only transforms the existing stage. Rebuilding every node and SVG path
    // on each wheel tick made large graphs unnecessarily expensive.
    const model = currentRenderScene || scene;
    const maxX = model.nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0);
    const maxY = model.nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
    const baseWidth = Math.max((workspace.clientWidth || 1000) / zoom, 1200, Math.ceil(maxX + 500));
    const baseHeight = Math.max((workspace.clientHeight || 700) / zoom, 800, Math.ceil(maxY + 400));
    stage.style.width = `${baseWidth}px`;
    stage.style.height = `${baseHeight}px`;
    syncZoomLayout(baseWidth, baseHeight);
    if (renderedConnectionsSvg) {
      renderedConnectionsSvg.setAttribute('width', String(Math.max(baseWidth, 1)));
      renderedConnectionsSvg.setAttribute('height', String(Math.max(baseHeight, 1)));
    }
    workspace.scrollLeft = worldX * zoom - offsetX;
    workspace.scrollTop = worldY * zoom - offsetY;
  }
  function getStageNodePoint(n, side) {
    const el = renderedNodeElements.get(n.id);
    const width = el ? el.offsetWidth : n.width;
    const height = el ? el.offsetHeight : n.height;
    if (side === 'top') return { x: n.x + width / 2, y: n.y };
    if (side === 'right') return { x: n.x + width, y: n.y + height / 2 };
    if (side === 'bottom') return { x: n.x + width / 2, y: n.y + height };
    return { x: n.x, y: n.y + height / 2 };
  }
  function chooseSides(a, b) {
    const ea = renderedNodeElements.get(a.id);
    const eb = renderedNodeElements.get(b.id);
    const aw = ea ? ea.offsetWidth : a.width, ah = ea ? ea.offsetHeight : a.height;
    const bw = eb ? eb.offsetWidth : b.width, bh = eb ? eb.offsetHeight : b.height;
    const dx = (b.x + bw/2) - (a.x + aw/2);
    const dy = (b.y + bh/2) - (a.y + ah/2);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
    return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
  }
  function pathFor(aPoint, bPoint, fromSide, toSide) {
    const curve = Math.max(28, Math.min(110, Math.max(Math.abs(bPoint.x - aPoint.x), Math.abs(bPoint.y - aPoint.y)) * .42));
    let c1x = aPoint.x, c1y = aPoint.y, c2x = bPoint.x, c2y = bPoint.y;
    if (fromSide === 'right') c1x += curve;
    if (fromSide === 'left') c1x -= curve;
    if (fromSide === 'top') c1y -= curve;
    if (fromSide === 'bottom') c1y += curve;
    if (toSide === 'right') c2x += curve;
    if (toSide === 'left') c2x -= curve;
    if (toSide === 'top') c2y -= curve;
    if (toSide === 'bottom') c2y += curve;
    return `M ${aPoint.x} ${aPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bPoint.x} ${bPoint.y}`;
  }

  function addResizeHandles(element, nodeId) {
    ['nw', 'ne', 'sw', 'se'].forEach(handle => {
      const control = document.createElement('span');
      control.className = `resize-handle ${handle}`;
      control.setAttribute('aria-label', 'Изменить размер');
      control.addEventListener('pointerdown', event => startResize(event, nodeId, handle));
      element.appendChild(control);
    });
  }

  function addNodeAnchors(element, nodeId) {
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const anchor = document.createElement('button');
      anchor.type = 'button';
      anchor.className = `anchor ${side}`;
      anchor.title = `Привязать связь к стороне: ${side}`;
      anchor.setAttribute('aria-label', `Подключить к стороне ${side}`);
      anchor.addEventListener('pointerdown', event => startLink(event, nodeId, side));
      element.appendChild(anchor);
    });
  }

  function refreshNodeSelectionDecorations(model = scene, isPlayback = playback.active) {
    const nodesById = new Map(model.nodes.map(node => [node.id, node]));
    renderedNodeElements.forEach((element, id) => {
      const node = nodesById.get(id);
      if (!node) return;
      const selected = !isPlayback && (id === selectedId || selectedIds.includes(id));
      element.classList.toggle('selected', selected);
      element.classList.toggle('link-target', !isPlayback && !!linkDraft && id !== linkDraft.fromId && id !== editingId);
      element.querySelectorAll('.resize-handle, .anchor').forEach(control => control.remove());

      if (!isPlayback && id === selectedId && id !== editingId) addResizeHandles(element, id);
      const canShowAnchors = !isPlayback && id !== editingId &&
        (id === selectedId || (!!linkDraft && id !== linkDraft.fromId));
      if (canShowAnchors) addNodeAnchors(element, id);
    });
  }

  function refreshEdgeSelectionDecorations(model = scene, isPlayback = playback.active) {
    const selected = new Set(isPlayback ? [] : selectedEdgeIds);
    renderedEdgeElements.forEach((entry, id) => {
      if (entry && entry.line) entry.line.classList.toggle('selected', selected.has(id));
    });
  }

  function suppressImmediateDraggedLinkClick() {
    // A browser may emit click after pointerup even though the user dragged the node.
    // Catch only that immediate click in capture phase; auto-remove the guard if no click follows.
    const suppressClick = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('a.node-link')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener('click', suppressClick, true);
    };

    document.addEventListener('click', suppressClick, true);
    window.setTimeout(() => {
      document.removeEventListener('click', suppressClick, true);
    }, 0);
  }

  function appendTextWithLinks(container, value) {
    const text = String(value ?? '');
    const urlPattern = /(?:https?:\/\/|www\.)[^\s<>\"']+/gi;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text))) {
      const rawUrl = match[0];
      const matchEnd = urlPattern.lastIndex;
      const trailingMatch = rawUrl.match(/[.,!?;:)\]}]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const visibleUrl = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
      if (!visibleUrl) continue;

      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const anchor = document.createElement('a');
      anchor.className = 'node-link';
      anchor.textContent = visibleUrl;
      anchor.href = /^www\./i.test(visibleUrl) ? `https://${visibleUrl}` : visibleUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      // Keep pointer events bubbling so select-text and connect-node interactions work.
      // Handle the link click ourselves to prevent native navigation from opening a duplicate tab.
      anchor.addEventListener('click', event => {
        // Avoid opening twice on a double-click; leave the normal selection intact.
        if (event.detail > 1) {
          event.preventDefault();
          return;
        }

        // Disable native navigation: the app controls when links open.
        event.preventDefault();

        if (mode !== 'select') return;

        // Do not open a link while a drag is still active.
        if (drag && drag.moved) return;

        // If the user is selecting text, do not turn that gesture into navigation.
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;

        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      });
      container.appendChild(anchor);
      if (trailing) container.appendChild(document.createTextNode(trailing));
      lastIndex = matchEnd;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function updateEmptyState(model = scene, isPlayback = playback.active) {
    if (!emptyState) return;
    const isHidden = emptyHintDismissed || model.nodes.length > 0 || isPlayback;
    emptyState.classList.toggle('hidden', isHidden);
    emptyState.setAttribute('aria-hidden', String(isHidden));
  }

  function renderScene(model = scene, options = {}) {
    currentRenderScene = model;
    const isPlayback = !!options.playback;
    if (!isPlayback && model === scene) {
      const validEdgeIds = new Set(model.edges.map(edge => edge.id));
      selectedEdgeIds.splice(0, selectedEdgeIds.length, ...selectedEdgeIds.filter(id => validEdgeIds.has(id)));
    }
    const modelNodesById = new Map(model.nodes.map(node => [node.id, node]));
    const maxX = model.nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
    const maxY = model.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);
    const baseWidth = Math.max((workspace.clientWidth || 1000) / zoom, 1200, Math.ceil(maxX + 500));
    const baseHeight = Math.max((workspace.clientHeight || 700) / zoom, 800, Math.ceil(maxY + 400));
    stage.style.width = `${baseWidth}px`;
    stage.style.height = `${baseHeight}px`;
    syncZoomLayout(baseWidth, baseHeight);
    const docFrag = document.createDocumentFragment();
    const nodeEls = new Map();
    model.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'node';
      if (Number(n.width) <= 18 || Number(n.height) <= 18) el.classList.add('tiny-node');
      el.dataset.nodeId = n.id;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      const isImage = n.type === 'image' && !!n.image;
      const autoSize = n.autoSize !== false && !isImage;
      if (isImage) {
        el.classList.add('image-node');
        el.style.width = `${Math.max(10, Number(n.width) || 360)}px`;
        el.style.height = `${Math.max(10, Number(n.height) || 240)}px`;
        el.style.maxWidth = 'none';
        el.style.minWidth = '10px';
        el.style.minHeight = '10px';
        const imageEl = document.createElement('img');
        imageEl.className = 'node-image';
        imageEl.alt = 'Изображение';
        imageEl.draggable = false;
        imageEl.src = n.image;
        imageEl.addEventListener('load', () => {
          const liveNode = nodeById(n.id);
          if (!liveNode || liveNode.type !== 'image') return;
          // Geometry is captured when the file is inserted. Only recover missing dimensions.
          if (!(liveNode.width > 0) || !(liveNode.height > 0)) {
            const ratio = imageEl.naturalWidth / Math.max(1, imageEl.naturalHeight);
            liveNode.aspectRatio = ratio;
            liveNode.width = Math.min(360, imageEl.naturalWidth || 360);
            liveNode.height = liveNode.width / Math.max(0.01, ratio || 1);
            el.style.width = `${liveNode.width}px`;
            el.style.height = `${liveNode.height}px`;
          }
        }, { once: true });
        el.appendChild(imageEl);
      } else {
        // Text nodes wrap to content; images use explicit pixel dimensions above.
        el.style.width = autoSize ? 'max-content' : `${n.width}px`;
        el.style.height = 'auto';
        el.style.maxWidth = 'none';
        el.style.minWidth = autoSize ? '0' : '10px';
        el.style.minHeight = '0';
        el.style.fontSize = `${n.fontSize || 16}px`;
        el.style.color = (document.body.classList.contains('dark-theme') && (!n.color || n.color === '#111111')) ? '#f2f2f2' : (n.color || '#111111');
        if (n.underline) el.classList.add('underlined');
        if (n.highlight) el.classList.add('highlight');
        const textSpan = document.createElement('span');
        textSpan.className = 'node-text';
        if (!isPlayback && n.id !== editingId) {
          appendTextWithLinks(textSpan, n.text);
        } else {
          textSpan.textContent = n.text;
        }
        el.appendChild(textSpan);
        let placeholderEl = null;
        if (!isPlayback && n.id === editingId && !n.text.trim()) {
          placeholderEl = document.createElement('span');
          placeholderEl.className = 'node-placeholder';
          placeholderEl.textContent = 'Введите текст…';
          el.appendChild(placeholderEl);
        }
        if (!isPlayback && n.id === editingId) {
          el.classList.add('editing');
          textSpan.contentEditable = 'true';
          textSpan.spellcheck = false;
          textSpan.setAttribute('role', 'textbox');
          textSpan.setAttribute('aria-label', 'Текстовый узел');
          textSpan.addEventListener('input', () => {
            const target = nodeById(n.id);
            const liveText = textSpan.innerText.replace(/\r/g, '').replace(/\n+$/, '');
            if (target) target.text = liveText;
            if (placeholderEl) placeholderEl.classList.toggle('hidden', !!liveText.trim());
            saveProject();
          });
          textSpan.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEditing(n.id, true); }
            if (event.key === 'Escape') { event.preventDefault(); finishEditing(n.id, false); }
            event.stopPropagation();
          });
          textSpan.addEventListener('blur', () => {
            if (editingId === n.id) finishEditing(n.id, true);
          });
        }
      }
      if (!isPlayback && n.id !== editingId) {
        el.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;

          const pointerTarget = event.target instanceof Element ? event.target : null;
          const linkTarget = pointerTarget?.closest('a.node-link');

          // A link can also be the drag handle for its node. Keep the event bubbling
          // (in particular, do not call stopPropagation) while starting the drag here.
          if (linkTarget && mode === 'select') {
            const preserveMultiSelection = selectedIds.length > 1 && selectedIds.includes(n.id);
            selectNode(n.id, preserveMultiSelection, false);
            startNodeDrag(event, n.id);
            return;
          }

          if (mode === 'connect') {
            // Prevent native text selection when starting a connection from a link-bearing node.
            event.preventDefault();
            if (linkTarget) {
              linkTarget.style.setProperty('user-select', 'none');
              linkTarget.style.setProperty('-webkit-user-select', 'none');
            }
            event.stopPropagation();
            handleConnectClick(n.id);
            return;
          }
          if (mode !== 'select') return;
          event.stopPropagation();
          const preserveMultiSelection = selectedIds.length > 1 && selectedIds.includes(n.id);
          selectNode(n.id, preserveMultiSelection, false);
          if (event.target.closest('.resize-handle') || event.target.closest('.anchor')) return;
          if (event.target.closest('.node')) startNodeDrag(event, n.id);
        });
        el.addEventListener('dblclick', event => {
          const target = event.target instanceof Element ? event.target : null;
          // Double-clicking a URL must not enter node text-edit mode.
          if (target?.closest('a.node-link')) return;
          if (event.button !== 0 || mode !== 'select') return;
          event.preventDefault(); event.stopPropagation();
          if (n.type !== 'image') startEditing(n.id);
        });
        el.addEventListener('contextmenu', event => {
          event.preventDefault(); event.stopPropagation();
          showNodeContextMenu(n.id, event.clientX, event.clientY);
        });
      }
      nodeEls.set(n.id, el);
      docFrag.appendChild(el);
    });
    stage.replaceChildren(docFrag);
    renderedNodeElements = nodeEls;
    renderedNodeModels = modelNodesById;
    refreshNodeSelectionDecorations(model, isPlayback);
    // Сохраняем реальные размеры текста. Высота — только по содержимому, без пустой области.
    model.nodes.forEach(n => {
      const el = nodeEls.get(n.id);
      if (!el) return;
      if (n.type === 'image') {
        // Images use explicit model dimensions to preserve their aspect ratio.
        el.classList.toggle('tiny-node', n.width <= 18 || n.height <= 18);
        return;
      }
      n.width = Math.max(10, el.offsetWidth);
      n.height = Math.max(10, el.offsetHeight);
      el.classList.toggle('tiny-node', n.width <= 18 || n.height <= 18);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'connections');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(Math.max(stage.clientWidth, 1)));
    svg.setAttribute('height', String(Math.max(stage.clientHeight, 1)));
    // Release references to detached DOM nodes before building fresh render indexes.
    renderedNodeToEdges.clear();
    renderedEdgeElements.clear();
    const edgeElements = new Map();
    const nodeToEdges = new Map();
    const addNodeEdgeIndex = (nodeId, edgeId) => {
      if (!nodeToEdges.has(nodeId)) nodeToEdges.set(nodeId, []);
      nodeToEdges.get(nodeId).push(edgeId);
    };
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'edgeArrow'); marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse'); marker.setAttribute('markerUnits', 'userSpaceOnUse');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 1 L 9 5 L 0 9 z'); arrow.setAttribute('fill', '#171717');
    marker.appendChild(arrow); defs.appendChild(marker); svg.appendChild(defs);
    model.edges.forEach(edge => {
      const a = modelNodesById.get(edge.from), b = modelNodesById.get(edge.to);
      if (!a || !b) return;
      const aPoint = getStageNodePoint(a, edge.fromSide);
      const bPoint = getStageNodePoint(b, edge.toSide);
      const d = pathFor(aPoint, bPoint, edge.fromSide, edge.toSide);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('class', 'edge-hit');
      hit.setAttribute('d', d);
      hit.dataset.edgeId = edge.id;
      hit.addEventListener('pointerdown', event => {
        if (event.button !== 0 || isPlayback) return;
        event.preventDefault();
        event.stopPropagation();
        selectedId = null;
        selectedIds.splice(0);
        selectedEdgeIds.splice(0, selectedEdgeIds.length, edge.id);
        closeNodeContextMenu();
        renderScene();
      });
      hit.addEventListener('contextmenu', event => {
        // Block the browser's native context menu before doing any UI work.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openSelectedEdgesActions(edge.id, event);
      });
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('class', !isPlayback && selectedEdgeIds.includes(edge.id) ? 'edge selected' : 'edge');
      p.setAttribute('d', d);
      p.dataset.edgeId = edge.id;
      p.setAttribute('marker-end', 'url(#edgeArrow)');
      svg.appendChild(hit); svg.appendChild(p);
      edgeElements.set(edge.id, { edge, hit, line: p });
      addNodeEdgeIndex(edge.from, edge.id);
      addNodeEdgeIndex(edge.to, edge.id);
    });
    if (!isPlayback && linkDraft) {
      const origin = nodeById(linkDraft.fromId, scene);
      if (origin) {
        const aPoint = getStageNodePoint(origin, linkDraft.fromSide);
        const bPoint = { x: linkDraft.x, y: linkDraft.y };
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('class', 'edge-preview');
        p.setAttribute('id', 'linkPreview');
        p.setAttribute('d', pathFor(aPoint, bPoint, linkDraft.fromSide, 'left'));
        svg.appendChild(p);
      }
    }
    stage.prepend(svg);
    renderedEdgeElements = edgeElements;
    renderedNodeToEdges = nodeToEdges;
    renderedConnectionsSvg = svg;
    if (!isPlayback && editingId) {
      const editingEl = stage.querySelector(`[data-node-id="${CSS.escape(editingId)}"]`);
      const editingText = editingEl && editingEl.querySelector('.node-text');
      if (editingText && shouldFocusNewNode) {
        shouldFocusNewNode = false;
        editingText.focus({ preventScroll: true });
        placeCaretAtEnd(editingText);
      }
    }
    updateEmptyState(model, isPlayback);
    updateActionButtons();
  }

  function placeCaretAtEnd(el) {
    try {
      const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    } catch (_) {}
  }

  function createNodeAt(x, y) {
    if (playback.active) exitPlayback();
    const n = { id: safeId(), x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), text: '', width: 120, height: 30, fontSize: 16, autoSize: true, color: '#111111', underline: false, highlight: false };
    scene.nodes.push(n);
    selectedId = n.id; selectedIds.splice(0, selectedIds.length, n.id);
    editingId = n.id;
    editingOriginalText = '';
    mode = 'select';
    syncModeButtons();
    modeIndicator.classList.remove('visible'); stage.style.cursor = 'default';
    shouldFocusNewNode = true;
    pushUndoSnapshot();
    renderScene();
    saveProject();
  }

  function finishEditing(id, save) {
    if (editingId !== id) return;
    const el = stage.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
    const textEl = el && el.querySelector('.node-text');
    const n = nodeById(id);
    if (n) {
      if (save && textEl) {
        n.text = textEl.innerText.replace(/\r/g, '').replace(/\n+$/, '');
      } else if (!save && editingOriginalText !== null) {
        n.text = editingOriginalText;
      }
    }
    editingId = null;
    editingOriginalText = null;
    selectedId = null; selectedIds.splice(0);
    if (n && !n.text.trim()) {
      scene.nodes = scene.nodes.filter(item => item.id !== id);
      scene.edges = scene.edges.filter(e => e.from !== id && e.to !== id);
      closeNodeContextMenu();
    }
    if (save && n && n.text.trim()) {
      commitScene();
    } else {
      renderScene(); saveProject(); updateActionButtons();
    }
  }

  function startEditing(id) {
    const n = nodeById(id);
    if (!n || playback.active) return;
    selectedId = id; selectedIds.splice(0, selectedIds.length, id); editingId = id; editingOriginalText = n.text; shouldFocusNewNode = true;
    renderScene();
  }

  function selectNode(id, preserveMultiSelection = false, render = true) {
    if (playback.active) exitPlayback();
    if (editingId && editingId !== id) finishEditing(editingId, true);
    selectedEdgeIds.splice(0);
    selectedId = id;
    if (!preserveMultiSelection || !selectedIds.includes(id)) {
      selectedIds.splice(0, selectedIds.length, id);
    }
    if (render) renderScene();
    else {
      refreshNodeSelectionDecorations(scene, false);
      refreshEdgeSelectionDecorations(scene, false);
      updateActionButtons();
    }
  }

  function detachPointerGestureListeners() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointermove', onBoxSelectionMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointerup', onBoxSelectionUp);
    window.removeEventListener('pointercancel', cancelPointerGesture);
  }

  function attachPointerGesture(moveHandler, upHandler) {
    detachPointerGestureListeners();
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler, { once: true });
    window.addEventListener('pointercancel', cancelPointerGesture, { once: true });
  }

  function cancelPointerGesture() {
    const activeDrag = drag;
    const activeBox = boxSelect;
    detachPointerGestureListeners();
    if (dragPaintRaf) {
      cancelAnimationFrame(dragPaintRaf);
      dragPaintRaf = 0;
    }

    if (activeDrag) {
      if (activeDrag.type === 'move') {
        const node = nodeById(activeDrag.id);
        if (node) { node.x = activeDrag.originX; node.y = activeDrag.originY; }
      } else if (activeDrag.type === 'moveSelection') {
        activeDrag.ids.forEach(origin => {
          const node = nodeById(origin.id);
          if (node) { node.x = origin.x; node.y = origin.y; }
        });
      } else if (activeDrag.type === 'resize') {
        const node = nodeById(activeDrag.id);
        if (node) {
          node.x = activeDrag.originX;
          node.y = activeDrag.originY;
          node.width = activeDrag.originW;
          node.height = activeDrag.originH;
          if (Number.isFinite(activeDrag.originFontSize)) node.fontSize = activeDrag.originFontSize;
          node.autoSize = activeDrag.originAutoSize;
        }
      } else if (activeDrag.type === 'pan') {
        workspace.scrollLeft = activeDrag.originScrollLeft;
        workspace.scrollTop = activeDrag.originScrollTop;
      }
    }

    drag = null;
    wasDragging = false;
    linkDraft = null;
    if (activeBox && activeBox.element.isConnected) activeBox.element.remove();
    boxSelect = null;
    workspace.classList.remove('panning');
    stage.style.cursor = mode === 'select' ? 'grab' : (mode === 'text' || mode === 'connect' ? 'crosshair' : 'default');
    renderScene();
  }

  window.addEventListener('blur', () => {
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
  });

  function startNodeDrag(event, id) {
    if (event.button !== 0 || editingId || mode !== 'select' || drag || linkDraft || boxSelect) return;
    // Each new pointer gesture begins with a clean drag flag. If this is a click,
    // wasDragging will remain false and the link can open normally.
    wasDragging = false;
    const n = nodeById(id); if (!n) return;
    const startedOnLink = event.target instanceof Element && !!event.target.closest('a.node-link');
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      const origins = selectedIds.map(nodeId => nodeById(nodeId)).filter(Boolean).map(node => ({ id: node.id, x: node.x, y: node.y }));
      drag = { type: 'moveSelection', ids: origins, startX: event.clientX, startY: event.clientY, startZoom: zoom, moved: false, startedOnLink };
    } else {
      drag = { type: 'move', id, startX: event.clientX, startY: event.clientY, startZoom: zoom, originX: n.x, originY: n.y, moved: false, startedOnLink };
    }
    attachPointerGesture(onPointerMove, onPointerUp);
  }
  function startResize(event, id, handle) {
    event.preventDefault(); event.stopPropagation();
    if (playback.active || linkDraft || drag || boxSelect) return;
    const n = nodeById(id); if (!n) return;
    selectedId = id; selectedIds.splice(0, selectedIds.length, id);
    // Text scales by font size and stays content-sized; images use explicit pixel dimensions.
    const originAutoSize = n.autoSize;
    n.width = Math.max(10, Number(n.width) || 10);
    n.height = Math.max(10, Number(n.height) || 10);
    const originW = n.width;
    const originH = n.height;
    const originFontSize = clamp(Number(n.fontSize) || 16, 8, 80);
    n.autoSize = n.type === 'image' ? false : true;
    drag = { type: 'resize', id, handle, startX: event.clientX, startY: event.clientY, startZoom: zoom, originX: n.x, originY: n.y, originW, originH, originFontSize, originAutoSize, moved: false };
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function startPan(event) {
    if (event.button !== 0 || editingId || playback.active || mode !== 'select' || drag || linkDraft || boxSelect) return;
    wasDragging = false;
    event.preventDefault();
    stage.style.cursor = 'grabbing';
    drag = { type: 'pan', startX: event.clientX, startY: event.clientY, startZoom: zoom, originScrollLeft: workspace.scrollLeft, originScrollTop: workspace.scrollTop, moved: false };
    workspace.classList.add('panning');
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function startLink(event, id, side) {
    event.preventDefault(); event.stopPropagation();
    if (playback.active || drag || linkDraft || boxSelect || editingId) return;
    selectedEdgeIds.splice(0);
    selectedId = id; selectedIds.splice(0, selectedIds.length, id);
    const p = getStagePoint(event);
    linkDraft = { fromId: id, fromSide: side, x: p.x, y: p.y };
    // Один рендер для создания пунктирной линии; во время перетаскивания узлы не пересоздаются.
    renderScene();
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function ensureStageBoundsForDrag() {
    // Extend the drawing surface only when a node is dragged beyond its current edge.
    // Growing (never shrinking) avoids scrollbar oscillation while dragging.
    const currentWidth = Number.parseFloat(stage.style.width) || 1200;
    const currentHeight = Number.parseFloat(stage.style.height) || 800;
    const maxX = scene.nodes.reduce((max, node) => Math.max(max, node.x + Math.max(10, node.width || 10)), 0);
    const maxY = scene.nodes.reduce((max, node) => Math.max(max, node.y + Math.max(10, node.height || 10)), 0);
    const nextWidth = Math.max(currentWidth, Math.ceil((workspace.clientWidth || 1000) / zoom), Math.ceil(maxX + 500));
    const nextHeight = Math.max(currentHeight, Math.ceil((workspace.clientHeight || 700) / zoom), Math.ceil(maxY + 400));
    if (nextWidth !== currentWidth || nextHeight !== currentHeight) {
      stage.style.width = `${nextWidth}px`;
      stage.style.height = `${nextHeight}px`;
      syncZoomLayout(nextWidth, nextHeight);
      if (renderedConnectionsSvg) {
        renderedConnectionsSvg.setAttribute('width', String(nextWidth));
        renderedConnectionsSvg.setAttribute('height', String(nextHeight));
      }
    }
  }

  function updateRenderedEdgesForNodes(nodeIds) {
    const edgeIds = new Set();
    nodeIds.forEach(id => (renderedNodeToEdges.get(id) || []).forEach(edgeId => edgeIds.add(edgeId)));
    edgeIds.forEach(edgeId => {
      const bundle = renderedEdgeElements.get(edgeId);
      if (!bundle) return;
      const edge = bundle.edge;
      const from = renderedNodeModels.get(edge.from);
      const to = renderedNodeModels.get(edge.to);
      if (!from || !to) return;
      const d = pathFor(getStageNodePoint(from, edge.fromSide), getStageNodePoint(to, edge.toSide), edge.fromSide, edge.toSide);
      bundle.hit.setAttribute('d', d);
      bundle.line.setAttribute('d', d);
    });
  }

  function paintDragGeometry() {
    if (!drag || drag.type === 'pan') return;
    let ids = [];
    if (drag.type === 'move') ids = [drag.id];
    else if (drag.type === 'moveSelection') ids = drag.ids.map(item => item.id);
    else if (drag.type === 'resize') ids = [drag.id];

    ids.forEach(id => {
      const node = renderedNodeModels.get(id) || nodeById(id);
      const el = renderedNodeElements.get(id);
      if (!node || !el) return;

      if (drag.type === 'resize' && id === drag.id) {
        const west = drag.handle.includes('w');
        const north = drag.handle.includes('n');
        el.style.maxWidth = 'none';
        el.style.minWidth = '0';
        el.style.minHeight = '0';

        if (node.type === 'image') {
          // Image dimensions are calculated from the same scale in onPointerMove.
          el.style.width = `${Math.max(10, node.width)}px`;
          el.style.height = `${Math.max(10, node.height)}px`;
        } else {
          // Scale the text itself. The node follows max-content dimensions so
          // shrinking changes font size rather than wrapping letters vertically.
          el.style.width = 'max-content';
          el.style.height = 'auto';
          el.style.overflowWrap = 'normal';
          el.style.whiteSpace = 'pre';
          el.style.fontSize = `${clamp(Number(node.fontSize) || 16, 8, 80)}px`;

          // Measure only the currently resized node. Convert viewport dimensions
          // back to graph coordinates to avoid rounding drift at non-100% zoom.
          const rect = el.getBoundingClientRect();
          node.width = Math.max(10, rect.width / (zoom || 1));
          node.height = Math.max(10, rect.height / (zoom || 1));
        }

        // Keep the opposite corner anchored as the node changes size.
        node.x = west
          ? Math.max(0, drag.originX + drag.originW - node.width)
          : drag.originX;
        node.y = north
          ? Math.max(0, drag.originY + drag.originH - node.height)
          : drag.originY;
        el.classList.toggle('tiny-node', node.width <= 18 || node.height <= 18);
      }

      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    });

    ensureStageBoundsForDrag();
    updateRenderedEdgesForNodes(ids);
  }

  function scheduleDragGeometryPaint() {
    if (dragPaintRaf) return;
    dragPaintRaf = requestAnimationFrame(() => {
      dragPaintRaf = 0;
      paintDragGeometry();
    });
  }

  function onPointerMove(event) {
    if (drag) {
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        // Mark only the first movement. This also covers pan because the state
        // check happens before branching on drag.type.
        if (!drag.moved) {
          drag.moved = true;
          wasDragging = true;
        }
        if (event.cancelable) event.preventDefault();
      }
      if (drag.type === 'pan') {
        workspace.scrollLeft = drag.originScrollLeft - dx;
        workspace.scrollTop = drag.originScrollTop - dy;
        return;
      }
      // Use the zoom captured when this gesture started. This keeps model-space movement
      // stable even if the browser dispatches extra wheel/resize events during a drag.
      const scale = drag.startZoom || zoom;
      const modelDx = dx / scale, modelDy = dy / scale;
      if (drag.type === 'moveSelection') {
        drag.ids.forEach(origin => {
          const node = renderedNodeModels.get(origin.id) || nodeById(origin.id);
          if (!node) return;
          // Keep fractional model coordinates so low zoom levels do not feel jumpy.
          node.x = Math.max(0, origin.x + modelDx);
          node.y = Math.max(0, origin.y + modelDy);
        });
      } else if (drag.type === 'move') {
        const n = renderedNodeModels.get(drag.id) || nodeById(drag.id); if (!n) return;
        // Free movement; model coordinates are scaled by the current canvas zoom only once.
        n.x = Math.max(0, drag.originX + modelDx);
        n.y = Math.max(0, drag.originY + modelDy);
      } else if (drag.type === 'resize') {
        const n = renderedNodeModels.get(drag.id) || nodeById(drag.id); if (!n) return;
        const west = drag.handle.includes('w');
        const north = drag.handle.includes('n');
        const horizontalDelta = west ? -modelDx : modelDx;
        const verticalDelta = north ? -modelDy : modelDy;
        n.autoSize = false;
        if (n.type === 'image') {
          // Resize the image uniformly. Clamp the shared scale so both dimensions
          // stay within 10–2000px without distorting the stored aspect ratio.
          const originW = Math.max(10, drag.originW);
          const aspect = Math.max(0.01, Number(n.aspectRatio) || (originW / Math.max(1, drag.originH)));
          const originH = originW / aspect;
          const targetW = Math.max(10, drag.originW + horizontalDelta);
          const targetH = Math.max(10, drag.originH + verticalDelta);
          const originDiagonal = Math.max(1, Math.hypot(originW, originH));
          const proposedScale = Math.hypot(targetW, targetH) / originDiagonal;
          const minScale = Math.max(10 / originW, 10 / originH);
          const maxScale = Math.min(2000 / originW, 2000 / originH);
          const imageScale = clamp(proposedScale, minScale, maxScale);
          n.width = Math.round(originW * imageScale * 10) / 10;
          n.height = Math.round((n.width / aspect) * 10) / 10;
          n.x = west ? Math.max(0, drag.originX + drag.originW - n.width) : drag.originX;
          n.y = north ? Math.max(0, drag.originY + drag.originH - n.height) : drag.originY;
        } else {
          // Scale the complete text node from the dragged corner instead of
          // constraining width. Content dimensions are measured in paintDragGeometry.
          const originW = Math.max(10, drag.originW);
          const originH = Math.max(10, drag.originH);
          const targetW = Math.max(10, originW + horizontalDelta);
          const targetH = Math.max(10, originH + verticalDelta);
          const originDiagonal = Math.max(1, Math.hypot(originW, originH));
          const scaleFactor = Math.hypot(targetW, targetH) / originDiagonal;
          const originFontSize = clamp(Number(drag.originFontSize) || Number(n.fontSize) || 16, 8, 80);
          n.fontSize = Math.round(clamp(originFontSize * scaleFactor, 8, 80) * 10) / 10;
          // Text keeps natural content width; font size is its scaling source.
          n.autoSize = true;
        }
      }
      scheduleDragGeometryPaint();
    } else if (linkDraft) {
      const point = getStagePoint(event);
      linkDraft.x = point.x; linkDraft.y = point.y;
      const preview = stage.querySelector('#linkPreview');
      const origin = nodeById(linkDraft.fromId);
      if (preview && origin) {
        const aPoint = getStageNodePoint(origin, linkDraft.fromSide);
        preview.setAttribute('d', pathFor(aPoint, point, linkDraft.fromSide, 'left'));
      }
    }
  }
  function onPointerUp(event) {
    // Snapshot the active gesture's movement before clearing its global state.
    const movementWasTracked = wasDragging;
    wasDragging = false;
    detachPointerGestureListeners();
    if (dragPaintRaf) { cancelAnimationFrame(dragPaintRaf); dragPaintRaf = 0; }
    if (drag) {
      const finished = drag;
      const changed = finished.moved;
      const suppressPostDragLinkClick = movementWasTracked && !!finished.startedOnLink;
      drag = null;
      workspace.classList.remove('panning');
      stage.style.cursor = mode === 'select' ? 'grab' : (mode === 'text' || mode === 'connect' ? 'crosshair' : 'default');
      if (finished.type === 'pan') {
        if (!changed) { selectedId = null; selectedIds.splice(0); renderScene(); }
        return;
      }
      if (changed) {
        if (suppressPostDragLinkClick) suppressImmediateDraggedLinkClick();
        commitScene();
      } else if (finished.type === 'resize') {
        const node = nodeById(finished.id);
        if (node) node.autoSize = finished.originAutoSize;
      }
      // Keep the existing node element on a simple click so the browser can dispatch dblclick.
      return;
    }
    if (linkDraft) {
      const draft = linkDraft; linkDraft = null;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = under && under.closest ? under.closest('.node[data-node-id]') : null;
      const targetId = nodeEl ? nodeEl.dataset.nodeId : null;
      let targetSide = null;
      const anchorEl = under && under.closest ? under.closest('.anchor') : null;
      if (anchorEl) targetSide = [...anchorEl.classList].find(c => validSide(c));
      if (targetId && targetId !== draft.fromId) {
        const source = nodeById(draft.fromId), target = nodeById(targetId);
        if (source && target) {
          let sides = chooseSides(source, target);
          if (targetSide) sides.toSide = targetSide;
          addEdge(draft.fromId, targetId, draft.fromSide, sides.toSide);
          return;
        }
      }
      renderScene();
    }
  }

  // Когда у одного узла появляется несколько исходящих связей с одной стороны,
  // раскладываем дочерние узлы в ровную колонку/строку с одинаковыми промежутками.
  // Это происходит только при создании связи: последующее ручное перемещение остаётся свободным.
  function autoArrangeBranch(sourceId, side) {
    const source = nodeById(sourceId);
    if (!source) return false;

    const outgoing = scene.edges.filter(edge => edge.from === sourceId && edge.fromSide === side);
    const targetIds = [...new Set(outgoing.map(edge => edge.to))];
    if (targetIds.length < 2) return false;

    // Only arrange siblings that belong to this same branch. Nodes connected
    // from another side of the source may have an intentional, different role.
    const conflictingTargets = new Set(scene.edges
      .filter(edge => edge.from === sourceId && edge.fromSide !== side)
      .map(edge => edge.to));
    const targets = targetIds
      .filter(id => !conflictingTargets.has(id))
      .map(id => nodeById(id))
      .filter(Boolean);
    if (targets.length < 2) return false;

    // Arrange around the siblings' existing center, not around the parent.
    // This removes small placement inconsistencies while preserving the
    // approximate location the user chose for the whole branch.
    const horizontalGap = 56;
    const verticalGap = 13.5;
    const before = new Map(targets.map(node => [node.id, { x: node.x, y: node.y }]));
    const widthOf = node => Math.max(10, Number(node.width) || 10);
    const heightOf = node => Math.max(10, Number(node.height) || 10);
    let ordered;

    if (side === 'right' || side === 'left') {
      // Keep the existing vertical order. Snap siblings to a shared vertical
      // alignment and compact the gaps around their current vertical centroid.
      ordered = [...targets].sort((a, b) => (a.y + heightOf(a) / 2) - (b.y + heightOf(b) / 2));
      const totalHeight = ordered.reduce((sum, node) => sum + heightOf(node), 0)
        + verticalGap * (ordered.length - 1);
      const currentCenterY = ordered.reduce((sum, node) => sum + node.y + heightOf(node) / 2, 0) / ordered.length;
      let y = Math.max(0, currentCenterY - totalHeight / 2);

      // Align the edge facing the parent, but derive the position from the
      // nodes' existing coordinates instead of imposing a parent-relative offset.
      const alignedEdge = side === 'right'
        ? ordered.reduce((sum, node) => sum + node.x, 0) / ordered.length
        : ordered.reduce((sum, node) => sum + node.x + widthOf(node), 0) / ordered.length;
      const leftEdge = side === 'right'
        ? Math.max(0, alignedEdge)
        : Math.max(Math.max(...ordered.map(widthOf)), alignedEdge);

      ordered.forEach(node => {
        node.x = side === 'right' ? leftEdge : leftEdge - widthOf(node);
        node.y = y;
        y += heightOf(node) + verticalGap;
      });
    } else {
      // For top/bottom branches, retain left-to-right order, align siblings
      // horizontally and compact them around their current horizontal centroid.
      ordered = [...targets].sort((a, b) => (a.x + widthOf(a) / 2) - (b.x + widthOf(b) / 2));
      const totalWidth = ordered.reduce((sum, node) => sum + widthOf(node), 0)
        + horizontalGap * (ordered.length - 1);
      const currentCenterX = ordered.reduce((sum, node) => sum + node.x + widthOf(node) / 2, 0) / ordered.length;
      let x = Math.max(0, currentCenterX - totalWidth / 2);

      const alignedEdge = side === 'bottom'
        ? ordered.reduce((sum, node) => sum + node.y, 0) / ordered.length
        : ordered.reduce((sum, node) => sum + node.y + heightOf(node), 0) / ordered.length;
      const topEdge = side === 'bottom'
        ? Math.max(0, alignedEdge)
        : Math.max(Math.max(...ordered.map(heightOf)), alignedEdge);

      ordered.forEach(node => {
        node.x = x;
        node.y = side === 'bottom' ? topEdge : topEdge - heightOf(node);
        x += widthOf(node) + horizontalGap;
      });
    }

    // Keep arrowheads attached to the side facing the source branch.
    const targetSide = ({ right: 'left', left: 'right', top: 'bottom', bottom: 'top' })[side];
    const arrangedIds = new Set(targets.map(node => node.id));
    scene.edges.forEach(edge => {
      if (edge.from === sourceId && edge.fromSide === side && arrangedIds.has(edge.to)) {
        edge.toSide = targetSide;
      }
    });

    return targets.some(node => {
      const old = before.get(node.id);
      return old && (Math.abs(old.x - node.x) > 0.25 || Math.abs(old.y - node.y) > 0.25);
    });
  }

  function addEdge(from, to, fromSide, toSide) {
    if (from === to) { renderScene(); return; }
    const exists = scene.edges.some(e => e.from === from && e.to === to && e.fromSide === fromSide && e.toSide === toSide);
    if (exists) { renderScene(); showToast('Такая связь уже существует'); return; }
    scene.edges.push({ id: safeId(), from, to, fromSide, toSide });
    const autoArranged = autoArrangeEnabled ? autoArrangeBranch(from, fromSide) : false;
    selectedId = from; selectedIds.splice(0, selectedIds.length, from);
    commitScene(autoArranged ? 'Ветки выровнены с равными отступами' : 'Связь добавлена');
  }

  function handleConnectClick(id) {
    if (!connectionSourceId) {
      connectionSourceId = id; selectedId = id; selectedIds.splice(0, selectedIds.length, id); renderScene();
      showToast('Теперь выберите второй узел');
      return;
    }
    const fromId = connectionSourceId; connectionSourceId = null;
    if (fromId === id) { showToast('Выберите другой узел'); renderScene(); return; }
    const a = nodeById(fromId), b = nodeById(id); if (!a || !b) return;
    const sides = chooseSides(a,b);
    addEdge(fromId,id,sides.fromSide,sides.toSide);
    setMode('select');
  }

  function removeNodesById(ids, message) {
    const removedIds = new Set(ids);
    if (!removedIds.size) return;
    if (drag || linkDraft || boxSelect) cancelPointerGesture();

    scene.nodes = scene.nodes.filter(node => !removedIds.has(node.id));
    scene.edges = scene.edges.filter(edge => !removedIds.has(edge.from) && !removedIds.has(edge.to));
    const remainingEdgeIds = new Set(scene.edges.map(edge => edge.id));
    selectedEdgeIds.splice(0, selectedEdgeIds.length, ...selectedEdgeIds.filter(id => remainingEdgeIds.has(id)));

    if (editingId && removedIds.has(editingId)) {
      editingId = null;
      editingOriginalText = null;
      shouldFocusNewNode = false;
    }
    if (connectionSourceId && removedIds.has(connectionSourceId)) connectionSourceId = null;
    if (contextNodeId && removedIds.has(contextNodeId)) closeNodeContextMenu();
    if (linkDraft && removedIds.has(linkDraft.fromId)) linkDraft = null;

    const remainingSelection = selectedIds.filter(id => !removedIds.has(id));
    selectedIds.splice(0, selectedIds.length, ...remainingSelection);
    if (selectedId && removedIds.has(selectedId)) {
      selectedId = remainingSelection[remainingSelection.length - 1] || null;
    }
    selectedEdgeIds.splice(
      0,
      selectedEdgeIds.length,
      ...selectedEdgeIds.filter(id => scene.edges.some(edge => edge.id === id))
    );

    closeNodeContextMenu();
    // Закрываем модальное окно действия со связями и при удалении узлов из него.
    closeConfirm();
    commitScene(message);
  }

  function removeEdgesById(ids, message = 'Связи удалены') {
    const requested = new Set(Array.isArray(ids) ? ids : []);
    if (!requested.size) return;
    if (drag || linkDraft || boxSelect) cancelPointerGesture();

    const originalCount = scene.edges.length;
    scene.edges = scene.edges.filter(edge => !requested.has(edge.id));
    const removedCount = originalCount - scene.edges.length;

    selectedEdgeIds.splice(
      0,
      selectedEdgeIds.length,
      ...selectedEdgeIds.filter(id => !requested.has(id))
    );

    // Закрываем подтверждение даже если часть выделенных связей уже отсутствует.
    closeConfirm();

    if (!removedCount) {
      updateActionButtons();
      return;
    }

    commitScene(message);
  }

  function deleteSelected() {
    if (playback.active) return;
    const nodeIds = [...new Set(selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []))];
    const edgeIds = [...new Set(selectedEdgeIds)];
    if (!nodeIds.length && !edgeIds.length) return;

    closeNodeContextMenu();
    if (editingId) finishEditing(editingId, true);

    if (nodeIds.length && edgeIds.length) {
      if (drag || linkDraft || boxSelect) cancelPointerGesture();
      const removedNodes = new Set(nodeIds);
      const removedEdges = new Set(edgeIds);
      const beforeEdgeCount = scene.edges.length;
      scene.nodes = scene.nodes.filter(node => !removedNodes.has(node.id));
      scene.edges = scene.edges.filter(edge =>
        !removedEdges.has(edge.id) &&
        !removedNodes.has(edge.from) &&
        !removedNodes.has(edge.to)
      );
      const deletedEdges = beforeEdgeCount - scene.edges.length;
      selectedId = null;
      selectedIds.splice(0);
      selectedEdgeIds.splice(0);
      if (editingId && removedNodes.has(editingId)) {
        editingId = null;
        editingOriginalText = null;
      }
      // Удаление смешанного выделения тоже закрывает открытое подтверждение.
      closeConfirm();
      commitScene(`Удалено узлов: ${nodeIds.length}, связей: ${deletedEdges}`);
      return;
    }

    if (nodeIds.length) {
      removeNodesById(nodeIds, nodeIds.length > 1 ? 'Узлы удалены' : 'Узел удалён');
    } else {
      removeEdgesById(edgeIds, edgeIds.length > 1 ? 'Связи удалены' : 'Связь удалена');
    }
  }
  function undo() {
    if (undoIndex <= 0 || playback.active) return;
    if (editingId) finishEditing(editingId, true);
    undoIndex--;
    scene = snapshot(undoStack[undoIndex]); selectedId = null; selectedIds.splice(0); editingId = null;
    recordTimeline(); renderScene(); saveProject(); updateActionButtons();
    showToast('Действие отменено');
  }
  function redo() {
    if (undoIndex >= undoStack.length - 1 || playback.active) return;
    undoIndex++;
    scene = snapshot(undoStack[undoIndex]); selectedId = null; selectedIds.splice(0); editingId = null;
    recordTimeline(); renderScene(); saveProject(); updateActionButtons();
    showToast('Действие повторено');
  }

  function openImageFilePicker(point = pendingImagePoint) {
    if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
      pendingImagePoint = { x: Number(point.x), y: Number(point.y) };
    }
    imageFile.value = '';
    imageFile.click();
  }

  function insertImageFile(file, point = pendingImagePoint) {
    if (!file) return;
    const mime = String(file.type || '').toLowerCase();
    const fileName = String(file.name || 'image').toLowerCase();
    const allowedMime = mime === 'image/png' || mime === 'image/jpeg';
    const allowedExtension = /\.(png|jpe?g)$/.test(fileName);
    if (!allowedMime && !allowedExtension) {
      showToast('Поддерживаются только PNG и JPG');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      showToast('Изображение слишком большое (максимум 40 МБ)');
      return;
    }

    const insertAt = {
      x: clamp(Math.round(Number(point && point.x) || 0), 0, 100000),
      y: clamp(Math.round(Number(point && point.y) || 0), 0, 100000)
    };
    const reader = new FileReader();
    reader.onerror = () => showToast('Не удалось прочитать изображение');
    reader.onload = () => {
      let dataUrl = String(reader.result || '');
      if (!/^data:image\/(png|jpeg);base64,/i.test(dataUrl)) {
        // Some systems return an empty/generic MIME type for local .jpg files.
        // Normalize the data URL using the already validated filename extension.
        if (!allowedExtension || !dataUrl.includes(',')) {
          showToast('Файл не является корректным PNG или JPG');
          return;
        }
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const normalizedMime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        dataUrl = `data:${normalizedMime};base64,${base64}`;
      }

      const sourceImage = new Image();
      sourceImage.onerror = () => showToast('Не удалось открыть изображение');
      sourceImage.onload = () => {
        let imageData = dataUrl;
        let pixelWidth = sourceImage.naturalWidth;
        let pixelHeight = sourceImage.naturalHeight;
        if (!pixelWidth || !pixelHeight) {
          showToast('У изображения некорректные размеры');
          return;
        }

        if (pixelWidth > 800 || pixelHeight > 800) {
          const resizeScale = Math.min(800 / pixelWidth, 800 / pixelHeight);
          const targetWidth = Math.max(1, Math.round(pixelWidth * resizeScale));
          const targetHeight = Math.max(1, Math.round(pixelHeight * resizeScale));
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = targetWidth;
          tempCanvas.height = targetHeight;
          const ctx = tempCanvas.getContext('2d');
          if (!ctx) {
            showToast('Не удалось подготовить изображение');
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
          try {
            imageData = tempCanvas.toDataURL('image/jpeg', 0.7);
          } catch (error) {
            console.warn('Image compression failed:', error);
            showToast('Не удалось сжать изображение');
            return;
          }
          pixelWidth = targetWidth;
          pixelHeight = targetHeight;
        }

        // Fit image proportionally into the 360x600 display box without upscaling.
        const aspectRatio = pixelWidth / pixelHeight;
        const scale = Math.min(360 / pixelWidth, 600 / pixelHeight, 1);
        const displayWidth = Math.max(10, Math.round(pixelWidth * scale));
        const displayHeight = Math.max(10, Math.round(pixelHeight * scale));
        if (playback.active) exitPlayback();
        if (editingId) finishEditing(editingId, true);

        const node = {
          id: safeId(),
          x: insertAt.x,
          y: insertAt.y,
          text: '',
          type: 'image',
          image: imageData,
          aspectRatio,
          width: displayWidth,
          height: displayHeight,
          fontSize: 16,
          autoSize: false,
          color: '#111111',
          underline: false,
          highlight: false
        };
        scene.nodes.push(node);
        selectedId = node.id;
        selectedIds.splice(0, selectedIds.length, node.id);
        editingId = null;
        editingOriginalText = null;
        mode = 'select';
        syncModeButtons();
        closeNodeContextMenu();
        commitScene('Изображение добавлено');
      };
      sourceImage.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function getVisibleCanvasCenter() {
    const rect = workspace.getBoundingClientRect();
    return getStagePoint({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
  }

  function positionContextMenu(x, y) {
    const menuWidth = nodeContextMenu.offsetWidth || 216;
    const menuHeight = nodeContextMenu.offsetHeight || 210;
    nodeContextMenu.style.left = `${Math.min(x, window.innerWidth - menuWidth - 8)}px`;
    nodeContextMenu.style.top = `${Math.min(y, window.innerHeight - menuHeight - 8)}px`;
  }

  function showCanvasContextMenu(x, y) {
    contextNodeId = null;
    pendingImagePoint = { ...contextCanvasPoint };
    canvasContextActions.hidden = false;
    nodeContextActions.hidden = true;
    nodeContextMenu.classList.add('visible');
    positionContextMenu(x, y);
  }

  function showNodeContextMenu(id, x, y) {
    pendingImagePoint = getStagePoint({ clientX: x, clientY: y });
    contextCanvasPoint = { ...pendingImagePoint };
    selectedEdgeIds.splice(0);
    refreshEdgeSelectionDecorations(scene, false);
    if (editingId === id) finishEditing(id, true);
    const preserveMultiSelection = selectedIds.length > 1 && selectedIds.includes(id);
    if (preserveMultiSelection) {
      selectedId = id;
      refreshNodeSelectionDecorations(scene, false);
      updateActionButtons();
    } else {
      selectNode(id);
    }
    contextNodeId = id;
    canvasContextActions.hidden = true;
    nodeContextActions.hidden = false;
    updateNodeContextMenu();
    nodeContextMenu.classList.add('visible');
    positionContextMenu(x, y);
  }

  function closeNodeContextMenu() {
    nodeContextMenu.classList.remove('visible');
    contextNodeId = null;
  }

  function updateNodeContextMenu() {
    const n = nodeById(contextNodeId);
    nodeContextMenu.querySelectorAll('[data-node-color]').forEach(btn => btn.classList.toggle('active', !!n && btn.dataset.nodeColor === (n.color || '#111111')));
    [['underline', !!(n && n.underline)], ['highlight', !!(n && n.highlight)]].forEach(([action, active]) => {
      const btn = nodeContextMenu.querySelector(`[data-node-action="${action}"]`);
      if (!btn) return;
      btn.classList.toggle('active', active); btn.setAttribute('aria-checked', String(active));
      const check = btn.querySelector('.check'); if (check) check.textContent = active ? '✓' : '';
    });
  }

  nodeContextMenu.addEventListener('click', event => {
    const canvasButton = event.target.closest('[data-canvas-action]');
    if (canvasButton) {
      const action = canvasButton.dataset.canvasAction;
      if (action === 'create-text') {
        closeNodeContextMenu();
        createNodeAt(contextCanvasPoint.x, contextCanvasPoint.y);
        return;
      }
      if (action === 'upload-image') {
        closeNodeContextMenu();
        openImageFilePicker(contextCanvasPoint);
        return;
      }
    }

    const swatch = event.target.closest('[data-node-color]');
    const actionButton = event.target.closest('[data-node-action]');
    const n = nodeById(contextNodeId);
    if (swatch) {
      if (!n) { closeNodeContextMenu(); return; }
      n.color = swatch.dataset.nodeColor;
      commitScene(); updateNodeContextMenu(); return;
    }
    if (!actionButton) return;
    if (!n) { closeNodeContextMenu(); return; }
    const action = actionButton.dataset.nodeAction;
    if (action === 'underline') n.underline = !n.underline;
    else if (action === 'highlight') n.highlight = !n.highlight;
    else if (action === 'delete') {
      const id = n.id;
      closeNodeContextMenu();
      openConfirm('Удалить узел?', 'Узел и все его связи будут удалены. Это действие можно отменить.', 'Удалить', () => {
        closeNodeContextMenu();
        removeNodesById([id], 'Узел удалён');
      });
      return;
    } else if (action === 'upload-image') {
      closeNodeContextMenu();
      openImageFilePicker(pendingImagePoint);
      return;
    }
    commitScene(); updateNodeContextMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest) { closeNodeContextMenu(); return; }
    if (event.target.closest('#nodeContextMenu')) return;
    const clickedNode = event.target.closest('.node[data-node-id]');
    // ЛКМ по другому узлу закрывает старое меню, ПКМ оставляет его до открытия нового.
    if (!clickedNode || event.button === 0) closeNodeContextMenu();
  });

  let confirmCancelCallback = null;

  function openConfirm(title, message, confirmLabel, callback, cancelLabel = 'Отмена', cancelCallback = null) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalText').textContent = message;
    document.getElementById('modalConfirm').textContent = confirmLabel;
    document.getElementById('modalCancel').textContent = cancelLabel;
    confirmCallback = callback;
    confirmCancelCallback = cancelCallback;
    modalBackdrop.classList.add('visible');
  }

  function closeConfirm(runCancelAction = false) {
    const cancelAction = runCancelAction ? confirmCancelCallback : null;
    modalBackdrop.classList.remove('visible');
    confirmCallback = null;
    confirmCancelCallback = null;
    document.getElementById('modalCancel').textContent = 'Отмена';
    if (cancelAction) cancelAction();
  }

  function clearSelection() {
    selectedId = null;
    selectedIds.splice(0);
    selectedEdgeIds.splice(0);
    closeNodeContextMenu();
    renderScene();
    updateActionButtons();
  }

  function openSelectedEdgesActions(edgeId = null, sourceEvent = null) {
    // Pointerup/contextmenu handlers pass their event so native browser actions
    // are suppressed before opening the application modal.
    if (sourceEvent) {
      if (sourceEvent.cancelable) sourceEvent.preventDefault();
      if (typeof sourceEvent.stopPropagation === 'function') sourceEvent.stopPropagation();
    }

    if (edgeId && !selectedEdgeIds.includes(edgeId)) {
      selectedId = null;
      selectedIds.splice(0);
      selectedEdgeIds.splice(0, selectedEdgeIds.length, edgeId);
      renderScene();
    }
    if (!selectedEdgeIds.length) return;

    closeNodeContextMenu();
    const selectedEdgeSnapshot = [...selectedEdgeIds];
    const edgeCount = selectedEdgeSnapshot.length;
    openConfirm(
      edgeCount > 1 ? `Выбрано связей: ${edgeCount}` : 'Выбрана связь',
      'Можно отменить выделение или удалить выбранные связи.',
      'Удалить',
      () => removeEdgesById(selectedEdgeSnapshot, edgeCount > 1 ? 'Связи удалены' : 'Связь удалена'),
      'Отменить выделение',
      clearSelection
    );
  }

  function exportProject() {
    if (editingId) finishEditing(editingId, true);
    if (!scene.nodes.length) { showToast('Добавь хотя бы один узел для экспорта'); return; }
    exportScreen.classList.add('visible');
  }

  function exportProjectJSON() {
    const data = { format: 'osint-visualization', version: 1, title: projectTitle.value.trim() || 'Новая схема', scene: snapshot(), timeline, projectStartedAt };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (data.title || 'NetNotrh').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'NetNotrh';
    a.href = url; a.download = `${name}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Проект сохранён в JSON');
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const result = [];
    String(text || '').split('\n').forEach(paragraph => {
      if (!paragraph) { result.push(''); return; }
      const words = paragraph.split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (ctx.measureText(candidate).width <= maxWidth || !line) {
          line = candidate;
        } else {
          result.push(line); line = word;
        }
        if (ctx.measureText(line).width > maxWidth && line.length > 1) {
          let piece = '';
          for (const char of line) {
            if (piece && ctx.measureText(piece + char).width > maxWidth) { result.push(piece); piece = char; }
            else piece += char;
          }
          line = piece;
        }
      }
      result.push(line);
    });
    return result.length ? result : [''];
  }

  async function exportPng(format = 'png') {
    exportScreen.classList.remove('visible');
    if (editingId) finishEditing(editingId, true);
    if (!scene.nodes.length) { showToast('Добавь хотя бы один узел для экспорта'); return; }

    try {
      const PADDING = 100;             // итоговые пиксели с каждой стороны
      const DESIRED_SCALE = 2;         // отрисовка в 2x для чёткого текста и линий
      const MAX_CANVAS_SIDE = 32767;   // технический предел одного измерения canvas
      const MAX_CANVAS_PIXELS = 64 * 1024 * 1024;
      const nodes = scene.nodes;
      const dark = document.body.classList.contains('dark-theme');
      const background = dark ? '#000000' : '#ffffff';
      const outputFormat = format === 'jpeg' ? 'jpeg' : 'png';
      const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const extension = outputFormat === 'jpeg' ? 'jpg' : 'png';
      const formatLabel = outputFormat === 'jpeg' ? 'JPG' : 'PNG';

      function nodePoint(node, side) {
        const x = Number(node.x) || 0;
        const y = Number(node.y) || 0;
        const w = Math.max(10, Number(node.width) || 10);
        const h = Math.max(10, Number(node.height) || 10);
        if (side === 'top') return { x: x + w / 2, y };
        if (side === 'right') return { x: x + w, y: y + h / 2 };
        if (side === 'bottom') return { x: x + w / 2, y: y + h };
        return { x, y: y + h / 2 };
      }

      function edgeCurve(point, side, curve) {
        const result = { x: point.x, y: point.y };
        if (side === 'right') result.x += curve;
        if (side === 'left') result.x -= curve;
        if (side === 'top') result.y -= curve;
        if (side === 'bottom') result.y += curve;
        return result;
      }

      // Bounds start with every node's rectangle, then include curve control
      // points and arrowheads so links at the outside of a graph aren't clipped.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      function includePoint(x, y, radius = 0) {
        minX = Math.min(minX, x - radius);
        minY = Math.min(minY, y - radius);
        maxX = Math.max(maxX, x + radius);
        maxY = Math.max(maxY, y + radius);
      }

      nodes.forEach(node => {
        const x = Number(node.x) || 0;
        const y = Number(node.y) || 0;
        includePoint(x, y);
        includePoint(x + Math.max(10, Number(node.width) || 10),
                     y + Math.max(10, Number(node.height) || 10));
      });

      const edgeGeometry = [];
      scene.edges.forEach(edge => {
        const a = nodeById(edge.from), b = nodeById(edge.to);
        if (!a || !b) return;
        const ap = nodePoint(a, edge.fromSide);
        const bp = nodePoint(b, edge.toSide);
        const curve = Math.max(28, Math.min(110,
          Math.max(Math.abs(bp.x - ap.x), Math.abs(bp.y - ap.y)) * .42));
        const c1 = edgeCurve(ap, edge.fromSide, curve);
        const c2 = edgeCurve(bp, edge.toSide, curve);
        edgeGeometry.push({ edge, ap, bp, c1, c2 });
        includePoint(c1.x, c1.y);
        includePoint(c2.x, c2.y);
        // Exported arrowhead has a 7px tip length and 4.2px wings in scene units.
        includePoint(bp.x, bp.y, 12);
      });

      if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        throw new Error('Invalid graph bounds');
      }

      const contentW = Math.max(1, maxX - minX);
      const contentH = Math.max(1, maxY - minY);
      let scale = Math.min(
        DESIRED_SCALE,
        (MAX_CANVAS_SIDE - PADDING * 2) / contentW,
        (MAX_CANVAS_SIDE - PADDING * 2) / contentH,
        Math.sqrt(MAX_CANVAS_PIXELS / (contentW * contentH))
      );
      let W = Math.ceil(contentW * scale + PADDING * 2);
      let H = Math.ceil(contentH * scale + PADDING * 2);

      // Account for padding when checking the browser's canvas limits.
      while ((W > MAX_CANVAS_SIDE || H > MAX_CANVAS_SIDE || W * H > MAX_CANVAS_PIXELS) && scale > 0.01) {
        scale *= .98;
        W = Math.ceil(contentW * scale + PADDING * 2);
        H = Math.ceil(contentH * scale + PADDING * 2);
      }
      if (W > MAX_CANVAS_SIDE || H > MAX_CANVAS_SIDE || W * H > MAX_CANVAS_PIXELS) {
        throw new Error('Graph is too large to export safely');
      }

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // Translate the graph's actual top-left to a 100px margin. The size is
      // derived from content bounds, not from a fixed 1920x1080 format.
      const tx = PADDING - minX * scale;
      const ty = PADDING - minY * scale;
      // Keep the export background clean and opaque; no workspace grid is drawn.
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);

      edgeGeometry.forEach(({ edge, ap, bp, c1, c2 }) => {
        ctx.beginPath();
        ctx.moveTo(tx + ap.x * scale, ty + ap.y * scale);
        ctx.bezierCurveTo(
          tx + c1.x * scale, ty + c1.y * scale,
          tx + c2.x * scale, ty + c2.y * scale,
          tx + bp.x * scale, ty + bp.y * scale
        );
        ctx.strokeStyle = dark ? '#e7e7e7' : '#111111';
        ctx.lineWidth = Math.max(1, 1.7 * scale);
        ctx.stroke();

        const angles = { left: 0, right: Math.PI, top: Math.PI / 2, bottom: -Math.PI / 2 };
        const angle = angles[edge.toSide] ?? 0;
        const tipX = tx + bp.x * scale, tipY = ty + bp.y * scale;
        // Keep arrowheads proportional to export scale while limiting extremes.
        const arrowSize = Math.max(4, Math.min(14, 7 * scale));
        const wing = arrowSize * 0.6;
        const baseX = tipX - Math.cos(angle) * arrowSize;
        const baseY = tipY - Math.sin(angle) * arrowSize;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX - Math.sin(angle) * wing, baseY + Math.cos(angle) * wing);
        ctx.lineTo(baseX + Math.sin(angle) * wing, baseY - Math.cos(angle) * wing);
        ctx.closePath();
        ctx.fillStyle = dark ? '#e7e7e7' : '#111111';
        ctx.fill();
      });

      const imageAssets = new Map();
      await Promise.all(nodes.filter(node => node.type === 'image' && node.image).map(node => new Promise(resolve => {
        const imageEl = new Image();
        imageEl.onload = () => { imageAssets.set(node.id, imageEl); resolve(); };
        imageEl.onerror = () => resolve();
        imageEl.src = node.image;
      })));

      nodes.forEach(node => {
        if (node.type === 'image') {
          const imageEl = imageAssets.get(node.id);
          if (imageEl) {
            ctx.drawImage(
              imageEl,
              tx + (Number(node.x) || 0) * scale,
              ty + (Number(node.y) || 0) * scale,
              Math.max(1, Number(node.width) || imageEl.naturalWidth) * scale,
              Math.max(1, Number(node.height) || imageEl.naturalHeight) * scale
            );
          }
          return;
        }
        const fontSize = Math.max(10, Number(node.fontSize) || 16) * scale;
        ctx.font = `720 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = 'alphabetic';
        const px = tx + (Number(node.x) || 0) * scale + 4 * scale;
        const py = ty + (Number(node.y) || 0) * scale + 2 * scale;
        const nodeWidth = Math.max(10, Number(node.width) || 10);
        const maxTextW = Math.max(fontSize * 2, (nodeWidth - 8) * scale);
        const lines = wrapCanvasText(ctx, node.text, maxTextW);
        const lineHeight = fontSize * 1.28;

        lines.forEach((line, i) => {
          const baseline = py + fontSize * .98 + i * lineHeight;
          const lineWidth = Math.min(maxTextW, ctx.measureText(line).width);
          if (node.highlight) {
            ctx.fillStyle = '#ffea00';
            ctx.fillRect(px - 2 * scale, baseline - fontSize * .86,
                         lineWidth + 4 * scale, fontSize * 1.13);
          }
          ctx.fillStyle = (dark && (!node.color || node.color === '#111111'))
            ? '#f2f2f2' : (node.color || '#111111');
          ctx.fillText(line, px, baseline, maxTextW);
          if (node.underline) {
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            ctx.beginPath();
            ctx.moveTo(px, baseline + 2 * scale);
            ctx.lineTo(px + lineWidth, baseline + 2 * scale);
            ctx.stroke();
          }
        });
      });

      const name = (projectTitle.value.trim() || 'NetNotrh').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'NetNotrh';
      canvas.toBlob(blob => {
        if (!blob) { showToast(`Не удалось подготовить ${formatLabel}`); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast(`${formatLabel} экспортирован (${W} × ${H})`);
      }, mimeType, outputFormat === 'jpeg' ? 0.9 : undefined);
    } catch (error) {
      console.warn('Image export failed:', error);
      showToast('Не удалось экспортировать изображение');
    }
  }

  function importProjectFile(file) {
    if (!file) return;
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (!data || !data.scene || !Array.isArray(data.scene.nodes) || !Array.isArray(data.scene.edges)) throw new Error('Некорректный формат');
        if (editingId) finishEditing(editingId, true);
        flushPendingSave();
        scene = sanitizeScene(data.scene);
        currentProjectId = makeProjectId();
        projectTitle.value = typeof data.title === 'string' && data.title.trim() ? data.title.slice(0,90) : 'Импортированная схема';
        timeline = Array.isArray(data.timeline) ? data.timeline.filter(f => f && f.scene).map(f => ({ at: Math.max(0, Number(f.at) || 0), scene: sanitizeScene(f.scene) })) : [];
        projectStartedAt = Number(data.projectStartedAt) || Date.now();
        if (!timeline.length) timeline = [{ at: 0, scene: freshScene() }, { at: 1, scene: snapshot() }];
        selectedId = editingId = null; selectedIds.splice(0); mode = 'select';
        undoStack = [snapshot()]; undoIndex = 0;
        syncModeButtons();
        startScreen.classList.remove('visible');
        renderScene(); saveProject(); updateActionButtons(); showToast('Проект открыт');
      } catch (error) {
        showToast('Не удалось открыть файл проекта');
      }
      importFile.value = '';
    };
    reader.onerror = () => showToast('Ошибка чтения файла');
    reader.readAsText(file);
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }
  function resetPlaybackPosition() {
    // Invalidate every callback from the previous run before resetting the timeline.
    playback.generation += 1;
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = 0;
    playback.playing = false;
    playback.completed = false;
    playback.startedAt = 0;
    playback.pausedAt = 0;
    playback.frameIndex = 0;
    playbackRange.value = '0';
    playbackTime.textContent = '0:00';
    playbackStep.textContent = `Шаг 1 из ${timeline.length}`;
    if (timeline.length) renderScene(timeline[0].scene, { playback: true });
    updatePlaybackControls();
  }

  function openPlayback() {
    if (playback.active) {
      togglePlayback();
      return;
    }
    if (editingId) finishEditing(editingId, true);
    if (timeline.length < 2 || timeline.every((f, i) => i === 0 || sameJson(f.scene, timeline[0].scene))) {
      showToast('Сначала внесите несколько изменений в схему');
      return;
    }
    playback.active = true;
    playback.savedScrollLeft = workspace.scrollLeft;
    playback.savedScrollTop = workspace.scrollTop;
    playback.duration = clamp(3800 + timeline.length * 180, 5000, 10000);
    playbackPanel.classList.add('visible');
    playbackSubtitle.textContent = `Ускоренное воспроизведение · ${Math.round(playback.duration / 1000)} сек.`;
    resetPlaybackPosition();
    updateActionButtons();
    startPlayback();
  }

  function updatePlaybackControls() {
    playPauseIcon.innerHTML = playback.playing ? icons.pause : icons.play;
    const playPauseButton = document.getElementById('playPauseBtn');
    const label = playback.playing ? 'Приостановить' : 'Воспроизвести';
    playPauseButton.setAttribute('aria-label', label);
    playPauseButton.setAttribute('title', label);
    playbackStep.textContent = `Шаг ${Math.min(timeline.length, playback.frameIndex + 1)} из ${timeline.length}`;
  }

  function togglePlayback() {
    if (!playback.active) return;
    // The same control pauses a running animation and resumes/restarts a stopped one.
    if (playback.playing) {
      pausePlayback();
      return;
    }
    startPlayback();
  }

  function startPlayback() {
    if (!playback.active || timeline.length < 2 || playback.playing) return;

    // A completed run (or a slider parked at its end) always starts from frame zero.
    if (playback.completed || Number(playbackRange.value) >= 1000) {
      resetPlaybackPosition();
    }

    // Ensure only one animation frame loop can be active for this run.
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = 0;
    playback.generation += 1;
    const generation = playback.generation;
    const progress = clamp(Number(playbackRange.value) / 1000, 0, 1);
    playback.playing = true;
    playback.completed = false;
    playback.pausedAt = 0;
    playback.startedAt = performance.now() - progress * playback.duration;
    playback.raf = requestAnimationFrame(now => tickPlayback(now, generation));
    updatePlaybackControls();
  }

  function tickPlayback(now, generation) {
    if (generation !== playback.generation || !playback.active || !playback.playing) return;
    const linear = clamp((now - playback.startedAt) / playback.duration, 0, 1);
    // Calm start/end with a faster middle section.
    const eased = linear < .5 ? 4 * linear * linear * linear : 1 - Math.pow(-2 * linear + 2, 3) / 2;
    const lastIndex = timeline.length - 1;
    const idx = Math.min(lastIndex, Math.floor(eased * lastIndex));
    if (idx !== playback.frameIndex) {
      playback.frameIndex = idx;
      renderScene(timeline[idx].scene, { playback: true });
    }
    playbackRange.value = String(Math.round(linear * 1000));
    playbackTime.textContent = formatTime(linear * playback.duration / 1000);
    playbackStep.textContent = `Шаг ${idx + 1} из ${timeline.length}`;

    if (linear >= 1) {
      playback.playing = false;
      playback.completed = true;
      playback.frameIndex = lastIndex;
      playback.raf = 0;
      playback.startedAt = 0;
      playback.pausedAt = 0;
      playbackRange.value = '1000';
      playbackTime.textContent = formatTime(playback.duration / 1000);
      // Render the final frame only if it was not already drawn above.
      if (idx !== lastIndex) renderScene(timeline[lastIndex].scene, { playback: true });
      updatePlaybackControls();
      return;
    }
    playback.raf = requestAnimationFrame(nextNow => tickPlayback(nextNow, generation));
  }

  function pausePlayback() {
    if (!playback.active || !playback.playing) return;
    playback.playing = false;
    playback.generation += 1;
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = 0;
    updatePlaybackControls();
  }

  function exitPlayback() {
    if (!playback.active) return;
    playback.generation += 1;
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = 0;
    playback.active = false;
    playback.playing = false;
    playback.completed = false;
    playbackPanel.classList.remove('visible');
    selectedId = null; selectedIds.splice(0); editingId = null;
    renderScene();
    workspace.scrollLeft = playback.savedScrollLeft;
    workspace.scrollTop = playback.savedScrollTop;
    updateActionButtons();
  }

  function seekPlayback(value) {
    if (!playback.active) return;
    const linear = clamp(Number(value) / 1000, 0, 1);
    pausePlayback();
    playback.startedAt = performance.now() - linear * playback.duration;
    const eased = linear < .5 ? 4 * linear * linear * linear : 1 - Math.pow(-2 * linear + 2, 3) / 2;
    playback.frameIndex = Math.min(timeline.length - 1, Math.floor(eased * (timeline.length - 1)));
    playback.completed = linear >= 1;
    renderScene(timeline[playback.frameIndex].scene, { playback: true });
    playbackTime.textContent = formatTime(linear * playback.duration / 1000);
    playbackRange.value = String(Math.round(linear * 1000));
    if (playback.completed) {
      playback.frameIndex = timeline.length - 1;
      playbackRange.value = '1000';
      playbackTime.textContent = formatTime(playback.duration / 1000);
      renderScene(timeline[playback.frameIndex].scene, { playback: true });
    }
    updatePlaybackControls();
  }

  function segmentIntersectsRect(x0, y0, x1, y1, left, top, right, bottom) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - left, right - x0, y0 - top, bottom - y0];

    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) return false;
        continue;
      }
      const r = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
    return true;
  }

  function edgeIntersectsRect(edge, left, top, right, bottom) {
    const fromNode = nodeById(edge.from);
    const toNode = nodeById(edge.to);
    if (!fromNode || !toNode) return false;

    const a = getStageNodePoint(fromNode, edge.fromSide);
    const b = getStageNodePoint(toNode, edge.toSide);
    const curve = Math.max(28, Math.min(110, Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 0.42));
    let c1x = a.x, c1y = a.y, c2x = b.x, c2y = b.y;
    if (edge.fromSide === 'right') c1x += curve;
    if (edge.fromSide === 'left') c1x -= curve;
    if (edge.fromSide === 'top') c1y -= curve;
    if (edge.fromSide === 'bottom') c1y += curve;
    if (edge.toSide === 'right') c2x += curve;
    if (edge.toSide === 'left') c2x -= curve;
    if (edge.toSide === 'top') c2y -= curve;
    if (edge.toSide === 'bottom') c2y += curve;

    const inside = point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    let previous = a;
    if (inside(previous)) return true;
    const samples = 48;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const mt = 1 - t;
      const point = {
        x: mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x,
        y: mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y
      };
      if (inside(point) || segmentIntersectsRect(previous.x, previous.y, point.x, point.y, left, top, right, bottom)) return true;
      previous = point;
    }
    return false;
  }

  function startBoxSelection(event) {
    if (event.button !== 2 || playback.active || mode !== 'select' || drag || linkDraft || boxSelect) return;
    const target = event.target;
    if (target.closest && (target.closest('.node[data-node-id]') || target.closest('.edge-hit') || target.closest('.anchor') || target.closest('.resize-handle'))) return;
    if (editingId) finishEditing(editingId, true);
    event.preventDefault();
    closeNodeContextMenu();
    const point = getStagePoint(event);
    const rect = document.createElement('div'); rect.className = 'selection-rect';
    rect.style.left = `${point.x}px`; rect.style.top = `${point.y}px`; rect.style.width = '0'; rect.style.height = '0';
    stage.appendChild(rect);
    boxSelect = { startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false, element: rect };
    attachPointerGesture(onBoxSelectionMove, onBoxSelectionUp);
  }

  function onBoxSelectionMove(event) {
    if (!boxSelect) return;
    const p = getStagePoint(event);
    boxSelect.x = p.x; boxSelect.y = p.y;
    boxSelect.moved = boxSelect.moved || Math.abs(p.x-boxSelect.startX) + Math.abs(p.y-boxSelect.startY) > 4;
    const left = Math.min(boxSelect.startX, p.x), top = Math.min(boxSelect.startY, p.y);
    boxSelect.element.style.left = `${left}px`; boxSelect.element.style.top = `${top}px`;
    boxSelect.element.style.width = `${Math.abs(p.x-boxSelect.startX)}px`;
    boxSelect.element.style.height = `${Math.abs(p.y-boxSelect.startY)}px`;
  }

  function onBoxSelectionUp(event) {
    // Prevent native context-menu behavior immediately, before any DOM updates.
    if (event && event.cancelable) event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    // This function is only attached for a right-button marquee gesture.
    // Keep suppressing the delayed contextmenu event even if the browser retargets it.
    suppressContextMenuUntil = Date.now() + 1200;
    detachPointerGestureListeners();
    if (!boxSelect) return;
    const box = boxSelect;
    boxSelect = null;
    if (box.element.isConnected) box.element.remove();

    if (!box.moved) {
      contextCanvasPoint = { x: box.startX, y: box.startY };
      if (selectedEdgeIds.length) {
        openSelectedEdgesActions(null, event);
      } else {
        showCanvasContextMenu(event && event.clientX || 0, event && event.clientY || 0);
      }
      return;
    }

    const left = Math.min(box.startX, box.x);
    const right = Math.max(box.startX, box.x);
    const top = Math.min(box.startY, box.y);
    const bottom = Math.max(box.startY, box.y);

    const selected = scene.nodes.filter(node => {
      const nx1 = node.x;
      const ny1 = node.y;
      const nx2 = node.x + Math.max(10, node.width || 10);
      const ny2 = node.y + Math.max(10, node.height || 10);
      return nx2 >= left && nx1 <= right && ny2 >= top && ny1 <= bottom;
    }).map(node => node.id);

    const selectedEdges = scene.edges
      .filter(edge => edgeIntersectsRect(edge, left, top, right, bottom))
      .map(edge => edge.id);

    selectedIds.splice(0, selectedIds.length, ...selected);
    selectedEdgeIds.splice(0, selectedEdgeIds.length, ...selectedEdges);
    selectedId = selected.length ? selected[selected.length - 1] : null;

    renderScene();

    if (selected.length || selectedEdges.length) {
      showToast(`Выбрано узлов: ${selected.length}, связей: ${selectedEdges.length}`);
    }
    // Right-button marquee selection of lines opens the actions modal immediately.
    if (selectedEdges.length) openSelectedEdgesActions(null, event);
  }

  stage.addEventListener('pointerdown', startBoxSelection);

  // ПКМ по пустому холсту открывает меню создания текстового узла или изображения.
  // Capture context-menu events before SVG/node handlers so the browser's
  // native menu never appears over the canvas. We route the intended app action
  // here as well, because stopPropagation() prevents later stage/node listeners.
  document.addEventListener('contextmenu', event => {
    const target = event.target;
    const targetElement = target instanceof Element ? target : null;
    const canvasTarget = targetElement && targetElement.closest(
      '.stage, #stage, #workspace, .selection-rect'
    );
    const marqueeActive = !!boxSelect;
    const marqueeSuppressionActive = Date.now() < suppressContextMenuUntil;

    // Some browsers retarget contextmenu during a right-drag to document/body.
    // While marquee selection is active, block it regardless of event.target.
    if (!canvasTarget && !marqueeSuppressionActive && !marqueeActive) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!canvasTarget && marqueeSuppressionActive) return;

    // During a right-button marquee, pointerup handles selection and app actions.
    if (boxSelect) {
      boxSelect.contextFired = true;
      return;
    }

    // Suppress the contextmenu that is dispatched after pointerup.
    if (marqueeSuppressionActive) return;
    if (playback.active) exitPlayback();

    const edgeHit = targetElement && targetElement.closest('.edge-hit');
    if (edgeHit) {
      openSelectedEdgesActions(edgeHit.dataset.edgeId, event);
      return;
    }

    const nodeEl = targetElement && targetElement.closest('.node[data-node-id]');
    if (nodeEl) {
      showNodeContextMenu(nodeEl.dataset.nodeId, event.clientX, event.clientY);
      return;
    }

    if (selectedEdgeIds.length) {
      openSelectedEdgesActions(null, event);
      return;
    }

    contextCanvasPoint = getStagePoint(event);
    showCanvasContextMenu(event.clientX, event.clientY);
  }, { capture: true });
  // During history playback, prevent wheel scrolling anywhere on the document,
  // including when the pointer is over the playback panel. Capture + passive:false
  // ensures the browser has not already committed to its default scroll action.
  document.addEventListener('wheel', event => {
    if (playback.active && event.cancelable) event.preventDefault();
  }, { passive: false, capture: true });

  workspace.addEventListener('wheel', event => {
    if (playback.active) return;
    event.preventDefault();
    // Keep the coordinate frame stable until a drag/link gesture is released.
    if (drag || linkDraft) return;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(zoom * factor, event.clientX, event.clientY);
  }, { passive: false });

  stage.addEventListener('pointerdown', event => {
    if (playback.active) return;
    if (event.button !== 0) return;
    if (event.target.closest && (event.target.closest('.node') || event.target.closest('.edge-hit'))) return;
    if (selectedEdgeIds.length) {
      selectedEdgeIds.splice(0);
      refreshEdgeSelectionDecorations(scene, false);
      updateActionButtons();
    }
    if (mode === 'text') {
      const p = getStagePoint(event); createNodeAt(p.x, p.y); return;
    }
    if (mode === 'connect') { connectionSourceId = null; showToast('Нажмите на начальный узел, затем на второй'); return; }
    if (editingId) finishEditing(editingId, true);
    startPan(event);
  });
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('exportBtn').addEventListener('click', exportProject);
  document.getElementById('themeToggleBtn').addEventListener('click', () => applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'));
  document.getElementById('exportJsonBtn').addEventListener('click', exportProjectJSON);
  document.getElementById('cancelPngExportBtn').addEventListener('click', () => exportScreen.classList.remove('visible'));
  document.getElementById('downloadPngBtn').addEventListener('click', () => {
    const option = document.querySelector('input[name="exportFormat"]:checked');
    exportPng(option ? option.value : 'png');
  });
  exportScreen.addEventListener('pointerdown', event => { if (event.target === exportScreen) exportScreen.classList.remove('visible'); });
  document.getElementById('importBtn').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => importProjectFile(importFile.files && importFile.files[0]));
  imageFile.addEventListener('change', event => {
    const file = event.currentTarget.files && event.currentTarget.files[0];
    event.currentTarget.value = ''; // Allows choosing the same image again later.
    if (file) insertImageFile(file, pendingImagePoint);
  });
  document.addEventListener('paste', event => {
    const target = event.target;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return;
    let imageFileFromClipboard = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && ['image/png', 'image/jpeg'].includes(String(item.type || '').toLowerCase())) {
        imageFileFromClipboard = item.getAsFile();
        if (imageFileFromClipboard) break;
      }
    }
    if (!imageFileFromClipboard) return;
    event.preventDefault();
    pendingImagePoint = getVisibleCanvasCenter();
    insertImageFile(imageFileFromClipboard, pendingImagePoint);
  });
  document.getElementById('playHistoryBtn').addEventListener('click', () => playback.active ? togglePlayback() : openPlayback());
  document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
  document.getElementById('exitPlaybackBtn').addEventListener('click', exitPlayback);
  playbackRange.addEventListener('input', event => seekPlayback(event.target.value));
  projectTitle.addEventListener('input', saveProject);
  projectTitle.addEventListener('blur', () => { if (!projectTitle.value.trim()) projectTitle.value = 'Новая схема'; saveProject(); });
  document.getElementById('clearBtn').addEventListener('click', () => openConfirm('Очистить рабочее поле?', 'Все узлы и связи будут удалены из текущей схемы. Это действие можно отменить.', 'Очистить', () => {
    if (editingId) finishEditing(editingId, true);
    scene = freshScene(); selectedId = editingId = null; selectedIds.splice(0); linkDraft = null; connectionSourceId = null;
    commitScene('Рабочее поле очищено');
  }));
  document.getElementById('modalCancel').addEventListener('click', () => closeConfirm(true));
  document.getElementById('modalConfirm').addEventListener('click', () => { const fn = confirmCallback; closeConfirm(false); if (fn) fn(); });
  modalBackdrop.addEventListener('pointerdown', event => { if (event.target === modalBackdrop) closeConfirm(true); });

  exitSaveBtn.addEventListener('click', saveAndExitToStartScreen);
  exitWithoutSaveBtn.addEventListener('click', exitWithoutSavingToStartScreen);
  exitCancelBtn.addEventListener('click', closeExitConfirm);
  exitConfirmBackdrop.addEventListener('pointerdown', event => {
    if (event.target === exitConfirmBackdrop) closeExitConfirm();
  });

  emptyStateCloseBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    emptyHintDismissed = true;
    emptyStateCloseBtn.blur();
    if (localStorageAvailable) {
      try { localStorage.setItem(EMPTY_HINT_DISMISSED_KEY, '1'); } catch (_) {}
    }
    updateEmptyState();
  });

  document.getElementById('createCanvasBtn').addEventListener('click', () => {
    closeProjectActionsMenu();
    beginNewProject();
  });
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    closeProjectActionsMenu();
    confirmExit();
  });
  document.getElementById('openPreviousBtn').addEventListener('click', () => {
    closeProjectActionsMenu();
    showStartPanel('startProjectsPanel');
  });
  document.getElementById('settingsBtn').addEventListener('click', () => {
    closeProjectActionsMenu();
    showStartPanel('startSettingsPanel');
  });
  document.querySelectorAll('[data-start-back]').forEach(button => button.addEventListener('click', () => {
    closeProjectActionsMenu();
    if (!startScreen.classList.contains('visible')) showStartScreen();
    else showStartPanel('startMainPanel');
  }));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.themeChoice)));
  document.getElementById('autoArrangeToggle').addEventListener('change', event => setAutoArrangeEnabled(event.currentTarget.checked));
  document.getElementById('savedProjectList').addEventListener('click', event => {
    const actionsButton = event.target.closest('[data-project-actions-id]');
    if (actionsButton) {
      event.preventDefault();
      event.stopPropagation();
      openProjectActionsMenu(actionsButton.dataset.projectActionsId, actionsButton);
      return;
    }

    const openButton = event.target.closest('[data-project-open-id]');
    if (openButton) {
      closeProjectActionsMenu();
      openSavedProject(openButton.dataset.projectOpenId);
    }
  });

  projectActionsMenu.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-project-menu-action]');
    if (!actionButton || !activeProjectActionId) return;
    event.preventDefault();
    event.stopPropagation();

    const id = activeProjectActionId;
    const action = actionButton.dataset.projectMenuAction;
    closeProjectActionsMenu();

    if (action === 'rename') openRenameProjectModal(id);
    if (action === 'delete') openDeleteProjectModal(id);
  });

  document.addEventListener('pointerdown', event => {
    if (!projectActionsMenu.classList.contains('visible')) return;
    if (event.target.closest('#projectActionsMenu') || event.target.closest('[data-project-actions-id]')) return;
    closeProjectActionsMenu();
  });
  window.addEventListener('resize', closeProjectActionsMenu);
  document.getElementById('savedProjectList').addEventListener('scroll', closeProjectActionsMenu, { passive: true });

  // Handle validation in JavaScript so an empty title reaches our toast instead
  // of being blocked by the browser's native `required` validation.
  projectRenameForm.noValidate = true;
  projectRenameForm.addEventListener('submit', event => {
    event.preventDefault();
    const submittedTitle = projectRenameInput.value;
    const renamed = renameProject(renameTargetProjectId, submittedTitle);

    if (renamed) {
      projectRenameInput.blur();
      return;
    }

    // Submission does not depend on input focus. When it fails, force focus
    // back to the field, whether Save was clicked or Enter was pressed.
    if (projectRenameBackdrop.classList.contains('visible')) {
      projectRenameInput.focus({ preventScroll: true });
    }
  });
  projectRenameCancelBtn.addEventListener('click', closeRenameProjectModal);
  projectRenameBackdrop.addEventListener('pointerdown', event => {
    if (event.target === projectRenameBackdrop) closeRenameProjectModal();
  });

  projectDeleteCancelBtn.addEventListener('click', closeDeleteProjectModal);
  projectDeleteConfirmBtn.addEventListener('click', () => deleteProject(deleteTargetProjectId));
  projectDeleteBackdrop.addEventListener('pointerdown', event => {
    if (event.target === projectDeleteBackdrop) closeDeleteProjectModal();
  });
  document.getElementById('importFromStartBtn').addEventListener('click', () => importFile.click());

  document.addEventListener('keydown', event => {
    const target = event.target;
    const inTextField = target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
    if (event.key === 'Escape') {
      if (projectRenameBackdrop.classList.contains('visible')) { closeRenameProjectModal(); return; }
      if (projectDeleteBackdrop.classList.contains('visible')) { closeDeleteProjectModal(); return; }
      if (projectActionsMenu.classList.contains('visible')) { closeProjectActionsMenu(); return; }
      if (exitConfirmBackdrop.classList.contains('visible')) { closeExitConfirm(); return; }
      if (drag || linkDraft || boxSelect) { cancelPointerGesture(); return; }
      if (modalBackdrop.classList.contains('visible')) closeConfirm(true);
      else if (nodeContextMenu.classList.contains('visible')) closeNodeContextMenu();
      else if (playback.active) exitPlayback();
      else if (editingId) finishEditing(editingId, true);
      else if (mode !== 'select') setMode('select');
      else { selectedId = null; selectedIds.splice(0); selectedEdgeIds.splice(0); renderScene(); }
      return;
    }
    if (inTextField) return;
    // Физическая клавиша работает одинаково при русской и английской раскладке.
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.key.toLowerCase() === 'z')) {
      event.preventDefault(); if (event.shiftKey) redo(); else undo(); return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyY' || event.key.toLowerCase() === 'y')) { event.preventDefault(); redo(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { deleteSelected(); return; }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.code === 'KeyV') setMode('select');
      if (event.code === 'KeyT') setMode('text');
      if (event.code === 'KeyC') setMode('connect');
    }
  });
  function flushBeforeLeavingPage(event) {
    // Finalize inline editing so dirty-state detection includes the last keystrokes.
    if (editingId) finishEditing(editingId, true);

    const id = currentProjectId;
    if (id && scene.nodes.length === 0) {
      deleteEmptyProject(id);
      return;
    }

    const dirty = !!(id && scene.nodes.length > 0 && hasUnsavedChanges());

    if (event && event.type === 'beforeunload') {
      if (dirty) {
        // Browsers do not reliably allow custom HTML dialogs during unload.
        // Ask for the native confirmation instead; pagehide saves only if unload proceeds.
        event.preventDefault();
        event.returnValue = '';
        return '';
      }

      // If the model is already saved, complete a queued write without prompting.
      if (pendingSave && (!id || pendingSave.id === id)) flushPendingSave();
      return;
    }

    // pagehide means navigation/closing is proceeding. Persist the latest snapshot
    // synchronously here, because the 140 ms debounce may never fire.
    if (id && scene.nodes.length > 0 && dirty) saveProject();
    if (pendingSave) flushPendingSave();
  }
  window.addEventListener('beforeunload', flushBeforeLeavingPage);
  window.addEventListener('pagehide', flushBeforeLeavingPage);
  window.addEventListener('resize', () => renderScene(currentRenderScene || scene));

  // Initial state: projects are opened from the start menu, rather than loaded invisibly.
  try {
    const storage = window.localStorage;
    const testKey = STORAGE_KEY + '_test';
    storage.setItem(testKey, '1'); storage.removeItem(testKey);
    localStorageAvailable = true;
  } catch (_) { localStorageAvailable = false; }
  if (localStorageAvailable) {
    migrateLegacyProject();
    try {
      applyTheme(localStorage.getItem(THEME_KEY) || 'light', false);
      autoArrangeEnabled = localStorage.getItem(AUTO_ARRANGE_KEY) !== '0';
      emptyHintDismissed = localStorage.getItem(EMPTY_HINT_DISMISSED_KEY) === '1';
    } catch (_) {
      applyTheme('light', false);
      autoArrangeEnabled = true;
    }
  } else {
    applyTheme('light', false);
    autoArrangeEnabled = true;
  }
  updateAutoArrangeChoice();
  scene = freshScene();
  projectTitle.value = 'Новая схема';
  projectStartedAt = Date.now();
  timeline = [{ at: 0, scene: freshScene() }];
  undoStack = [snapshot()]; undoIndex = 0;
  renderScene();
  updateActionButtons();
  showStartScreen();
})();
