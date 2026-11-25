(() => {
  'use strict';

  // Keep the application viewport fixed; canvas navigation is handled by #workspace.
  window.addEventListener('scroll', () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }, { passive: true });

  // Declare timer before every function that can schedule/cancel project saves.
  let saveTimer = 0;
  const STORAGE_KEY = 'visualization_workspace_v1';
  const STORAGE_PROJECT_ID_KEY = 'visualization_workspace_project_id_v1';
  const PROJECT_INDEX_KEY = 'netnorth_projects_index_v1';
  const PROJECT_KEY_PREFIX = 'netnorth_project_';
  const THEME_KEY = 'netnorth_theme_v1';
  const AUTO_ARRANGE_KEY = 'netnorth_auto_arrange_v1';
  const EMPTY_HINT_DISMISSED_KEY = 'netnorth_empty_hint_dismissed_v1';
  // Older builds used the transposed spelling `netnotrh_`. Keep these names
  // only for a one-time, loss-safe migration of existing browser data.
  const LEGACY_PROJECT_INDEX_KEY = 'netnotrh_projects_index_v1';
  const LEGACY_PROJECT_KEY_PREFIX = 'netnotrh_project_';
  const LEGACY_THEME_KEY = 'netnotrh_theme_v1';
  const LEGACY_AUTO_ARRANGE_KEY = 'netnotrh_auto_arrange_v1';
  const LEGACY_EMPTY_HINT_DISMISSED_KEY = 'netnotrh_empty_hint_dismissed_v1';
  const PROJECT_VIEW_KEY = 'netnorth_projects_view_v1';
  const PROJECT_DB_NAME = 'netnorth_db';
  const PROJECT_DB_VERSION = 1;
  const PROJECT_DB_STORE = 'projects';
  let projectDatabasePromise = null;
  let projectStorageMigrationPromise = Promise.resolve();
  let activeSavePromise = null;
  let activeSavedProjectId = null;
  let activeSavedProjectData = null;
  // Distinguish imported/new session projects from projects opened from storage.
  // The opened baseline is immutable for the whole editing session, even when
  // autosave updates activeSavedProjectData in the background.
  let isNewUnsavedSessionProject = false;
  let initialOpenedProjectBaseline = null;
  let lastLocalSaveErrorToastAt = 0;
  let presentationMode = false;
  let presentationPreviousState = null;
  let imageLightboxScale = 1;
  let imageLightboxOffsetX = 0;
  let imageLightboxOffsetY = 0;
  const imageLightboxPointers = new Map();
  let imageLightboxPinchStart = null;
  let imageLightboxPanStart = null;
  let imageLightboxSrcCleanupTimer = null;
  let lastDraggedImageNodeIds = new Set();
  let lastImageDragAt = 0;
  const stage = document.getElementById('stage');
  const workspace = document.getElementById('workspace');
  const imageLightbox = document.getElementById('imageLightbox');
  const imageLightboxClose = document.getElementById('imageLightboxClose');
  const imageLightboxStage = imageLightbox?.querySelector('.image-lightbox-stage') || null;
  const imageLightboxImg = document.getElementById('imageLightboxImg');
  const world = document.getElementById('world');
  const nodeContextMenu = document.getElementById('nodeContextMenu');
  const canvasContextActions = document.getElementById('canvasContextActions');
  const nodeContextActions = document.getElementById('nodeContextActions');
  const textNodeContextActions = document.getElementById('textNodeContextActions');
  const zoomIndicator = document.getElementById('zoomIndicator');
  const cameraBookmarksPanel = document.getElementById('cameraBookmarks');
  const CANVAS_PAD = 1400;
  let zoom = 1;
  let stageContentBounds = { maxX: 1200, maxY: 800 };
  // Coalesce high-frequency pan/zoom input into one viewport update per frame.
  let isTicking = false;
  let pendingViewportPan = null;
  let pendingViewportZoom = null;
  // Coalesce expensive pointer geometry work to one update per display frame.
  let pointerMoveRaf = 0;
  let pendingPointerMove = null;
  let pendingPointerMoveHandler = null;
  let processingPointerMoveFrame = false;
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
  const edgeStyleOptions = document.getElementById('edgeStyleOptions');
  const edgeColorToggle = document.getElementById('edgeColorToggle');
  const edgeColorPalette = document.getElementById('edgeColorPalette');
  const edgeColorPreview = document.getElementById('edgeColorPreview');
  const edgeCustomColorInput = document.getElementById('edgeCustomColor');
  const edgeBidirectionalInput = document.getElementById('edgeBidirectional');
  const edgeArrowheadInput = document.getElementById('edgeArrowhead');
  const EDGE_COLORS = ['#111111', '#4b4b4b', '#888888', '#bf2929', '#185abc', '#267344', '#7a35a2', '#e67e22', '#ff9f1c', '#25a9e0', '#00a6a6', '#2ec4b6', '#e64980', '#f1c40f', '#8d5a3b', '#c65d3a'];
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
  const exportFileNameInput = document.getElementById('exportFileNameInput');
  const mainArea = document.getElementById('mainArea');
  const presentationModeBtn = document.getElementById('presentationModeBtn');
  const presentationExitBtn = document.getElementById('presentationExitBtn');
  const projectNotesToggle = document.getElementById('projectNotesToggle');
  const projectNotesPanel = document.getElementById('projectNotesPanel');
  const projectNotesBackdrop = document.getElementById('projectNotesBackdrop');
  const projectNotesClose = document.getElementById('projectNotesClose');
  const projectNotesInput = document.getElementById('projectNotesInput');
  const projectChecklistForm = document.getElementById('projectChecklistForm');
  const projectChecklistInput = document.getElementById('projectChecklistInput');
  const projectChecklistList = document.getElementById('projectChecklistList');
  const projectCreatedDate = document.getElementById('projectCreatedDate');
  const projectWorkedTime = document.getElementById('projectWorkedTime');
  const projectChecklistProgress = document.getElementById('projectChecklistProgress');
  const selectedIds = [];
  const selectedEdgeIds = [];
  // The internal clipboard intentionally outlives project-runtime cache resets.
  // Image payloads are embedded in copied image nodes so cross-project pastes
  // remain valid even after imageStore is cleared for the next project.
  let internalClipboard = null;
  let internalClipboardPasteRequested = false;
  let currentProjectId = null;
  let boxSelect = null;
  let suppressContextMenuUntil = 0;
  let editorVisibilityRaf = 0;
  let lastEditorScrollTarget = null;
  let editorScrollResetTimer = 0;
  let cameraFlightRaf = 0;
  let cameraFlightToken = 0;
  let contextCanvasPoint = { x: 0, y: 0 };
  let pendingImagePoint = { x: 0, y: 0 };
  let activeProjectActionId = null;
  let activeProjectActionButton = null;
  let renameTargetProjectId = null;
  let deleteTargetProjectId = null;
  let projectViewMode = 'list';
  const cameraState = { bookmarks: { '1': null, '2': null, '3': null } };
  const projectPreviewCache = new Map();

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const freshScene = () => ({ nodes: [], edges: [] });

  function normalizeTextNodeDefaults(value) {
    const hasBorder = value && typeof value.hasBorder === 'boolean'
      ? value.hasBorder
      : false;
    const borderColor = value && typeof value.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.borderColor.trim())
      ? value.borderColor.trim().toLowerCase()
      : '#111111';
    return { hasBorder, borderColor };
  }

  function getTextNodeDefaults() {
    return {
      hasBorder: defaultTextNodeHasBorder,
      borderColor: defaultTextNodeBorderColor
    };
  }

  function setTextNodeDefaults(value) {
    const normalized = normalizeTextNodeDefaults(value);
    defaultTextNodeHasBorder = normalized.hasBorder;
    defaultTextNodeBorderColor = normalized.borderColor;
  }

  let scene = freshScene();
  let selectedId = null;
  let editingId = null;
  let editingOriginalText = null;
  let mode = 'select';
  let lastCreatedNodeTime = 0;
  let connectionSourceId = null;
  let drag = null;
  let activeMoveHandler = null;
  let activeUpHandler = null;
  // Track movement during the active pointer gesture. The flag is cleared on pointerup;
  // a one-shot capture listener separately blocks the synthetic click after dragging a link.
  let wasDragging = false;
  let linkDraft = null;
  // Touch pointers are tracked separately from the existing mouse/pen drag state.
  // A second finger cancels a one-finger gesture and takes exclusive ownership for pinch zoom.
  const activeTouchPointers = new Map();
  let pinchState = null;
  let longPressTimer = 0;
  let longPressCandidate = null;
  // Mobile canvas taps are tracked separately from marquee/drag gestures so a
  // one-finger double tap can open the canvas action sheet without breaking
  // box selection or pinch zoom.
  let mobileCanvasTapCandidate = null;
  let lastMobileCanvasTap = null;
  const MOBILE_DOUBLE_TAP_DELAY = 420;
  const MOBILE_DOUBLE_TAP_DISTANCE = 36;
  let currentRenderScene = null;
  // Cached DOM/model indexes let drag operations update only affected nodes and edges.
  // This avoids rebuilding the whole DOM/SVG on every pointermove for large graphs.
  let renderedNodeElements = new Map();
  let renderedNodeModels = new Map();
  let renderedEdgeElements = new Map();
  let renderedNodeToEdges = new Map();
  let renderedSquareGroups = new Map();
  let renderedConnectionsSvg = null;
  let smartGuidesLayer = null;
  // Spatial buckets keep viewport culling proportional to visible graph cells.
  const VIEWPORT_GRID_CELL_SIZE = 640;
  let viewportNodeGrid = new Map();
  let viewportEdgeGrid = new Map();
  let viewportLargeNodeIds = new Set();
  let viewportLargeEdgeIds = new Set();
  let viewportNodeBounds = new Map();
  let viewportEdgeBounds = new Map();
  let visibleViewportNodeIds = new Set();
  let visibleViewportEdgeIds = new Set();
  let renderedLinkPreviewEl = null;
  let dragPaintRaf = 0;
  let viewportCullRaf = 0;
  let resizeRenderTimer = 0;
  // Base64 payloads stay in one shared store; undo/timeline snapshots keep only imageKey.
  const imageStore = new Map();
  let undoStack = [];
  let undoIndex = -1;
  let timeline = [];
  let projectStartedAt = Date.now();
  let projectNotes = '';
  let projectChecklist = [];
  let projectWorkedMs = 0;
  let projectSessionStartedAt = 0;
  let playback = { active: false, playing: false, completed: false, generation: 0, startedAt: 0, pausedAt: 0, duration: 8000, frameIndex: 0, raf: 0, savedScrollLeft: 0, savedScrollTop: 0 };
  let toastTimer = 0;
  // Снимок ожидающей записи захватывается в момент saveProject(), а не внутри таймера.
  // Это не позволяет сохранению проекта A записать уже активное состояние проекта B.
  let pendingSave = null;
  let shouldFocusNewNode = false;
  let pendingEditingCaretCoords = null;
  let confirmCallback = null;
  let localStorageAvailable = true;
  let autoArrangeEnabled = true;
  // Project-scoped defaults affect only newly created text nodes. Per-node edits
  // intentionally do not mutate these defaults.
  let defaultTextNodeHasBorder = false;
  let defaultTextNodeBorderColor = '#111111';

  const icons = {
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>'
  };

  function safeId() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nodeById(id, model = scene) { return model.nodes.find(n => n.id === id); }

  function getImageNodeSource(node) {
    if (!node || node.type !== 'image') return '';
    if (typeof node.image === 'string' && node.image) return node.image;
    const key = typeof node.imageKey === 'string' ? node.imageKey : '';
    return key ? (imageStore.get(key) || '') : '';
  }

  function clearImageExpandButtons() {
    renderedNodeElements.forEach(element => element.classList.remove('image-expand-visible'));
  }

  function clampImageLightboxOffsets() {
    if (!imageLightboxImg || !imageLightboxStage) return;
    if (imageLightboxScale <= 1) {
      imageLightboxOffsetX = 0;
      imageLightboxOffsetY = 0;
      return;
    }

    // offsetWidth/offsetHeight are layout dimensions and do not include the CSS scale.
    const baseWidth = imageLightboxImg.offsetWidth || 0;
    const baseHeight = imageLightboxImg.offsetHeight || 0;
    const stageWidth = imageLightboxStage.clientWidth || window.innerWidth;
    const stageHeight = imageLightboxStage.clientHeight || window.innerHeight;

    const scaledWidth = baseWidth * imageLightboxScale;
    const scaledHeight = baseHeight * imageLightboxScale;
    const maxOffsetX = Math.max(0, (scaledWidth - stageWidth) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - stageHeight) / 2);

    imageLightboxOffsetX = clamp(imageLightboxOffsetX, -maxOffsetX, maxOffsetX);
    imageLightboxOffsetY = clamp(imageLightboxOffsetY, -maxOffsetY, maxOffsetY);
  }

  function updateImageLightboxTransform() {
    if (!imageLightboxImg) return;
    clampImageLightboxOffsets();
    imageLightboxImg.style.transform = `translate3d(${imageLightboxOffsetX}px, ${imageLightboxOffsetY}px, 0) scale(${imageLightboxScale})`;
    imageLightboxImg.dataset.zoom = String(imageLightboxScale);
  }

  function resetImageLightboxView() {
    imageLightboxScale = 1;
    imageLightboxOffsetX = 0;
    imageLightboxOffsetY = 0;
    imageLightboxPointers.clear();
    imageLightboxPinchStart = null;
    imageLightboxPanStart = null;
    updateImageLightboxTransform();
  }

  function openImageLightbox(nodeId) {
    if (!imageLightbox || !imageLightboxImg || presentationMode || playback.active) return;
    const node = nodeById(nodeId);
    if (!node || node.type !== 'image') return;
    const source = getImageNodeSource(node);
    if (!source) {
      showToast('Не удалось открыть изображение');
      return;
    }
    // Cancel any pending source cleanup when the viewer is opened again.
    if (imageLightboxSrcCleanupTimer !== null) {
      window.clearTimeout(imageLightboxSrcCleanupTimer);
      imageLightboxSrcCleanupTimer = null;
    }
    imageLightboxImg.src = source;
    resetImageLightboxView();
    imageLightbox.classList.add('visible');
    imageLightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('image-lightbox-open');
    window.setTimeout(() => {
      if (imageLightbox.classList.contains('visible')) {
        try { imageLightboxClose?.focus({ preventScroll: true }); } catch (_) { imageLightboxClose?.focus(); }
      }
    }, 0);
  }

  function closeImageLightbox() {
    if (!imageLightbox || !imageLightbox.classList.contains('visible')) return;
    imageLightbox.classList.remove('visible');
    imageLightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('image-lightbox-open');
    resetImageLightboxView();
    // Keep the image source while the lightbox fades out, so the browser
    // never flashes the image's alt fallback during the closing transition.
    if (imageLightboxSrcCleanupTimer !== null) {
      window.clearTimeout(imageLightboxSrcCleanupTimer);
    }
    imageLightboxSrcCleanupTimer = window.setTimeout(() => {
      if (!imageLightbox.classList.contains('visible') && imageLightboxImg) {
        imageLightboxImg.removeAttribute('src');
      }
      imageLightboxSrcCleanupTimer = null;
    }, 220);
  }

  function setImageLightboxZoom(nextScale) {
    imageLightboxScale = clamp(nextScale, 1, 5);
    if (imageLightboxScale <= 1) {
      imageLightboxOffsetX = 0;
      imageLightboxOffsetY = 0;
    }
    updateImageLightboxTransform();
  }

  function getLightboxPointerDistance() {
    const points = [...imageLightboxPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  function handleImageLightboxPointerDown(event) {
    if (!imageLightbox?.classList.contains('visible')) return;
    if (event.target !== imageLightboxImg) {
      closeImageLightbox();
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    imageLightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { imageLightboxImg.setPointerCapture(event.pointerId); } catch (_) {}
    if (imageLightboxPointers.size >= 2) {
      imageLightboxPinchStart = {
        distance: Math.max(1, getLightboxPointerDistance()),
        scale: imageLightboxScale
      };
      imageLightboxPanStart = null;
    } else if (imageLightboxScale > 1) {
      imageLightboxPanStart = {
        x: event.clientX,
        y: event.clientY,
        offsetX: imageLightboxOffsetX,
        offsetY: imageLightboxOffsetY
      };
    }
  }

  function handleImageLightboxPointerMove(event) {
    if (!imageLightboxPointers.has(event.pointerId)) return;
    imageLightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imageLightboxPointers.size >= 2 && imageLightboxPinchStart) {
      event.preventDefault();
      const distance = Math.max(1, getLightboxPointerDistance());
      setImageLightboxZoom(imageLightboxPinchStart.scale * distance / imageLightboxPinchStart.distance);
      return;
    }
    if (imageLightboxScale > 1 && imageLightboxPanStart) {
      event.preventDefault();
      imageLightboxOffsetX = imageLightboxPanStart.offsetX + event.clientX - imageLightboxPanStart.x;
      imageLightboxOffsetY = imageLightboxPanStart.offsetY + event.clientY - imageLightboxPanStart.y;
      updateImageLightboxTransform();
    }
  }

  function handleImageLightboxPointerEnd(event) {
    if (!imageLightboxPointers.has(event.pointerId)) return;
    imageLightboxPointers.delete(event.pointerId);
    if (imageLightboxPointers.size < 2) imageLightboxPinchStart = null;
    if (imageLightboxPointers.size === 1 && imageLightboxScale > 1) {
      const remaining = [...imageLightboxPointers.values()][0];
      imageLightboxPanStart = {
        x: remaining.x,
        y: remaining.y,
        offsetX: imageLightboxOffsetX,
        offsetY: imageLightboxOffsetY
      };
    } else {
      imageLightboxPanStart = null;
    }
  }

  function ensureNodeImageKey(node) {
    if (!node || node.type !== 'image') return '';
    let key = typeof node.imageKey === 'string' && node.imageKey
      ? node.imageKey
      : `image:${String(node.id || safeId())}`;
    const inlineImageData = typeof node.image === 'string' && node.image ? node.image : '';
    let imageData = inlineImageData || imageStore.get(key) || '';

    // If an image node's payload changes, give the new payload its own key.
    // Earlier undo/timeline snapshots keep pointing at the previous immutable asset.
    if (inlineImageData && imageStore.has(key) && imageStore.get(key) !== inlineImageData) {
      key = `image:${String(node.id || safeId())}:${safeId()}`;
      imageData = inlineImageData;
    }

    if (imageData) {
      imageStore.set(key, imageData);
      node.imageKey = key;
      return key;
    }
    return '';
  }

  // Lightweight snapshots intentionally omit large data URLs. Immutable strings
  // remain in imageStore and snapshots retain only a short stable imageKey.
  function snapshot(model = scene) {
    return {
      nodes: (model.nodes || []).map(node => {
        const copy = { ...node };
        if (copy.type === 'image') {
          const imageKey = ensureNodeImageKey(node);
          if (imageKey) copy.imageKey = imageKey;
          else delete copy.imageKey;
        } else {
          delete copy.imageKey;
        }
        delete copy.image;
        return copy;
      }),
      edges: (model.edges || []).map(edge => ({ ...edge }))
    };
  }

  function materializeSceneSnapshot(model) {
    if (!model || !Array.isArray(model.nodes)) return freshScene();
    return {
      nodes: model.nodes.map(node => {
        const copy = { ...node };
        if (copy.type === 'image') {
          const imageKey = typeof copy.imageKey === 'string' && copy.imageKey
            ? copy.imageKey
            : `image:${String(copy.id || '')}`;
          const imageData = typeof copy.image === 'string' && copy.image
            ? copy.image
            : (imageStore.get(imageKey) || '');
          if (imageData) imageStore.set(imageKey, imageData);
          copy.imageKey = imageKey;
          copy.image = imageData;
        }
        return copy;
      }),
      edges: (model.edges || []).map(edge => ({ ...edge }))
    };
  }

  function collectProjectImageAssets(scenes) {
    const assets = {};
    const keys = new Set();
    (scenes || []).filter(Boolean).forEach(model => {
      (model.nodes || []).forEach(node => {
        if (node && node.type === 'image' && typeof node.imageKey === 'string' && node.imageKey) {
          keys.add(node.imageKey);
        }
      });
    });
    keys.forEach(key => {
      const imageData = imageStore.get(key);
      if (typeof imageData === 'string' && imageData) assets[key] = imageData;
    });
    return assets;
  }

  function normalizeProjectImageAssets(input) {
    if (input == null) return {};
    if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid image asset dictionary');
    const entries = Object.entries(input);
    if (entries.length > 500) throw new Error('Too many project image assets');
    // A null-prototype dictionary avoids special-property assignment while reading untrusted JSON keys.
    const assets = Object.create(null);
    entries.forEach(([key, value]) => {
      if (!key || key.length > 256 || ['__proto__', 'prototype', 'constructor'].includes(key) ||
          typeof value !== 'string' || value.length > 12000000 ||
          !/^data:image\/(?:png|jpeg);base64,/i.test(value)) {
        throw new Error('Invalid project image asset');
      }
      assets[key] = value;
    });
    return assets;
  }

  // Validate untrusted project JSON before changing the active project or its caches.
  // Keep the limits aligned with sanitizeScene() so imports stay bounded and predictable.
  function validateProjectSceneStructure(input, label = 'scene') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Invalid ${label}`);
    }
    if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
      throw new Error(`Invalid ${label} collections`);
    }
    if (input.nodes.length > 500 || input.edges.length > 2000) {
      throw new Error(`Project ${label} exceeds size limits`);
    }

    const nodeIds = new Set();
    const optionalNumericFields = ['x', 'y', 'width', 'height', 'fontSize', 'aspectRatio'];
    input.nodes.forEach((node, index) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error(`Invalid node at ${label}[${index}]`);
      }
      if (typeof node.id !== 'string' || !node.id.trim() || node.id.length > 160) {
        throw new Error(`Invalid node id at ${label}[${index}]`);
      }
      if (nodeIds.has(node.id)) throw new Error(`Duplicate node id in ${label}`);
      nodeIds.add(node.id);

      if (node.type != null && !['text', 'image'].includes(node.type)) {
        throw new Error(`Invalid node type at ${label}[${index}]`);
      }
      if (node.text != null && typeof node.text !== 'string') {
        throw new Error(`Invalid node text at ${label}[${index}]`);
      }
      if (typeof node.text === 'string' && node.text.length > 10000) {
        throw new Error(`Node text is too long at ${label}[${index}]`);
      }
      optionalNumericFields.forEach(field => {
        if (node[field] == null) return;
        const value = Number(node[field]);
        if (!Number.isFinite(value)) throw new Error(`Invalid node ${field} at ${label}[${index}]`);
      });
      if (node.image != null && typeof node.image !== 'string') {
        throw new Error(`Invalid image data at ${label}[${index}]`);
      }
      if (typeof node.image === 'string' && node.image &&
          (node.image.length > 12000000 || !/^data:image\/(?:png|jpeg);base64,/i.test(node.image))) {
        throw new Error(`Invalid image payload at ${label}[${index}]`);
      }
      if (node.imageKey != null && (typeof node.imageKey !== 'string' || node.imageKey.length > 256)) {
        throw new Error(`Invalid image key at ${label}[${index}]`);
      }
      if (node.color != null && typeof node.color !== 'string') {
        throw new Error(`Invalid node color at ${label}[${index}]`);
      }
      if (node.framed != null && typeof node.framed !== 'boolean') {
        throw new Error(`Invalid node frame flag at ${label}[${index}]`);
      }
      if (node.borderColor != null &&
          (typeof node.borderColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(node.borderColor.trim()))) {
        throw new Error(`Invalid node border color at ${label}[${index}]`);
      }
    });

    const edgeIds = new Set();
    input.edges.forEach((edge, index) => {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
        throw new Error(`Invalid edge at ${label}[${index}]`);
      }
      if (typeof edge.from !== 'string' || typeof edge.to !== 'string' ||
          !edge.from || !edge.to || edge.from === edge.to ||
          !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        throw new Error(`Invalid edge endpoints at ${label}[${index}]`);
      }
      if (edge.id != null) {
        if (typeof edge.id !== 'string' || !edge.id.trim() || edge.id.length > 160) {
          throw new Error(`Invalid edge id at ${label}[${index}]`);
        }
        if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id in ${label}`);
        edgeIds.add(edge.id);
      }
      ['fromSide', 'toSide', 'style', 'color'].forEach(field => {
        if (edge[field] != null && typeof edge[field] !== 'string') {
          throw new Error(`Invalid edge ${field} at ${label}[${index}]`);
        }
      });
      ['bidirectional', 'arrowhead'].forEach(field => {
        if (edge[field] != null && typeof edge[field] !== 'boolean') {
          throw new Error(`Invalid edge ${field} at ${label}[${index}]`);
        }
      });
    });
    return true;
  }

  function validateProjectDataStructure(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid project envelope');
    }
    validateProjectSceneStructure(data.scene, 'scene');
    normalizeProjectImageAssets(data.images);
    if (data.timeline != null) {
      if (!Array.isArray(data.timeline) || data.timeline.length > 500) {
        throw new Error('Invalid project timeline');
      }
      data.timeline.forEach((frame, index) => {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
          throw new Error(`Invalid timeline frame ${index}`);
        }
        if (frame.at != null && !Number.isFinite(Number(frame.at))) {
          throw new Error(`Invalid timeline timestamp ${index}`);
        }
        validateProjectSceneStructure(frame.scene, `timeline frame ${index}`);
      });
    }
    if (data.cameraBookmarks != null && (typeof data.cameraBookmarks !== 'object' || Array.isArray(data.cameraBookmarks))) {
      throw new Error('Invalid camera bookmarks');
    }
    if (data.textNodeDefaults != null) {
      const defaults = data.textNodeDefaults;
      if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
        throw new Error('Invalid text node defaults');
      }
      if (defaults.hasBorder != null && typeof defaults.hasBorder !== 'boolean') {
        throw new Error('Invalid default text node frame flag');
      }
      if (defaults.borderColor != null &&
          (typeof defaults.borderColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(defaults.borderColor.trim()))) {
        throw new Error('Invalid default text node border color');
      }
    }
    if (data.title != null && typeof data.title !== 'string') throw new Error('Invalid project title');
    if (data.notes != null && (typeof data.notes !== 'string' || data.notes.length > 100000)) {
      throw new Error('Invalid project notes');
    }
    if (data.workedMs != null && (!Number.isFinite(Number(data.workedMs)) || Number(data.workedMs) < 0)) {
      throw new Error('Invalid project work time');
    }
    if (data.projectStartedAt != null && !Number.isFinite(Number(data.projectStartedAt))) {
      throw new Error('Invalid project start time');
    }
    if (data.checklist != null) {
      if (!Array.isArray(data.checklist) || data.checklist.length > 300) throw new Error('Invalid project checklist');
      data.checklist.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) ||
            (item.id != null && typeof item.id !== 'string') ||
            (item.text != null && typeof item.text !== 'string') ||
            (item.done != null && typeof item.done !== 'boolean')) {
          throw new Error(`Invalid checklist item ${index}`);
        }
      });
    }
    return true;
  }

  function clearProjectRuntimeCaches(clearImages = false) {
    // Keep internalClipboard intact for cross-project copy/paste; only discard
    // the one-shot keyboard-to-paste-event handoff when changing project state.
    internalClipboardPasteRequested = false;
    cancelCameraFlight();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    clearQueuedGesturePointerMove();
    if (editorScrollResetTimer) window.clearTimeout(editorScrollResetTimer);
    editorScrollResetTimer = 0;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = 0;
    if (editorVisibilityRaf) cancelAnimationFrame(editorVisibilityRaf);
    editorVisibilityRaf = 0;
    lastEditorScrollTarget = null;
    if (toastEl) toastEl.classList.remove('show');
    if (dragPaintRaf) cancelAnimationFrame(dragPaintRaf);
    dragPaintRaf = 0;
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = 0;
    playback.generation += 1;
    if (viewportCullRaf) cancelAnimationFrame(viewportCullRaf);
    viewportCullRaf = 0;
    if (resizeRenderTimer) clearTimeout(resizeRenderTimer);
    resizeRenderTimer = 0;
    detachPointerGestureListeners();
    clearLongPress();
    clearSmartGuides();
    drag = null;
    linkDraft = null;
    boxSelect = null;
    wasDragging = false;
    pinchState = null;
    workspace.classList.remove('panning', 'pinching');
    renderedNodeElements.clear();
    renderedNodeModels.clear();
    renderedEdgeElements.clear();
    renderedNodeToEdges.clear();
    renderedSquareGroups.clear();
    viewportNodeGrid.clear();
    viewportEdgeGrid.clear();
    viewportNodeBounds.clear();
    viewportEdgeBounds.clear();
    visibleViewportNodeIds.clear();
    visibleViewportEdgeIds.clear();
    renderedConnectionsSvg = null;
    renderedLinkPreviewEl = null;
    currentRenderScene = null;
    activeTouchPointers.clear();
    if (clearImages) imageStore.clear();
  }

  function pruneImageStore() {
    const referenced = new Set();
    const collect = model => {
      if (!model || !Array.isArray(model.nodes)) return;
      model.nodes.forEach(node => {
        if (node && node.type === 'image' && typeof node.imageKey === 'string' && node.imageKey) {
          referenced.add(node.imageKey);
        }
      });
    };
    collect(scene);
    undoStack.forEach(collect);
    timeline.forEach(frame => collect(frame && frame.scene));
    collect(currentRenderScene);
    imageStore.forEach((value, key) => { if (!referenced.has(key)) imageStore.delete(key); });
  }

  function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function emptyCameraBookmarks() {
    return { '1': null, '2': null, '3': null };
  }

  function getCameraBookmarkNodeCenter(node) {
    if (!node) return null;
    const element = renderedNodeElements.get(node.id) || null;
    const width = Math.max(10, Number(element?.offsetWidth) || Number(node.width) || 120);
    const height = Math.max(10, Number(element?.offsetHeight) || Number(node.height) || 30);
    return {
      x: (Number(node.x) || 0) + width / 2,
      y: (Number(node.y) || 0) + height / 2
    };
  }

  function findNearestCameraBookmarkNode(point, nodes = scene.nodes) {
    if (!point || !Array.isArray(nodes) || !nodes.length) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    nodes.forEach(node => {
      const center = getCameraBookmarkNodeCenter(node);
      if (!center) return;
      const dx = center.x - point.x;
      const dy = center.y - point.y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = node;
      }
    });
    return nearest;
  }

  function normalizeCameraBookmarks(input, nodes = scene.nodes) {
    const normalized = emptyCameraBookmarks();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return normalized;
    const availableNodes = Array.isArray(nodes) ? nodes : [];
    const nodeIds = new Set(availableNodes.map(node => node.id));
    ['1', '2', '3'].forEach(slot => {
      const bookmark = input[slot];
      if (!bookmark || typeof bookmark !== 'object' || Array.isArray(bookmark)) return;
      const x = Number(bookmark.x);
      const y = Number(bookmark.y);
      const savedZoom = Number(bookmark.zoom);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(savedZoom)) return;
      if (Math.abs(x) > 10000000 || Math.abs(y) > 10000000 || savedZoom < .25 || savedZoom > 2.5) return;

      let nodeId = null;
      if (bookmark.nodeId != null) {
        if (typeof bookmark.nodeId !== 'string' || !bookmark.nodeId.trim() || bookmark.nodeId.length > 160) return;
        nodeId = bookmark.nodeId;
        // A known-but-missing ID means the referenced node was deleted. Never
        // silently retarget that bookmark to an unrelated node.
        if (!nodeIds.has(nodeId)) return;
      } else {
        // Upgrade bookmarks saved by the previous camera-only format by binding
        // them to the node nearest their former camera center.
        const nearest = findNearestCameraBookmarkNode({ x, y }, availableNodes);
        nodeId = nearest ? nearest.id : null;
      }
      if (!nodeId) return;
      normalized[slot] = { x, y, zoom: savedZoom, nodeId };
    });
    return normalized;
  }

  function pruneInvalidCameraBookmarks(nodes = scene.nodes) {
    // `scene.nodes` is authoritative. Call this only after a scene mutation has
    // finished, so transient intermediate node lists cannot invalidate IDs.
    const finalizedNodes = Array.isArray(nodes) ? nodes : [];
    const validNodeIds = new Set(
      finalizedNodes
        .filter(node => node && typeof node.id === 'string' && node.id.trim())
        .map(node => node.id)
    );
    const removed = [];
    ['1', '2', '3'].forEach(slot => {
      const bookmark = cameraState.bookmarks[slot];
      if (!bookmark) return;
      const nodeId = typeof bookmark.nodeId === 'string' ? bookmark.nodeId.trim() : '';
      if (!nodeId || !validNodeIds.has(nodeId)) {
        cameraState.bookmarks[slot] = null;
        removed.push(slot);
      }
    });
    if (removed.length) cancelCameraFlight();
    // UI and persistence are synchronized by the caller after the final scene
    // render/snapshot. This avoids observing a partially mutated scene.
    return removed;
  }

  function hasCameraBookmarks(bookmarks = cameraState.bookmarks) {
    return !!bookmarks && ['1', '2', '3'].some(slot => !!bookmarks[slot]);
  }

  function nowRelative() { return Math.max(0, Date.now() - projectStartedAt); }


  function hasProjectContent() {
    const hasNonDefaultTextNodeStyle = defaultTextNodeHasBorder || defaultTextNodeBorderColor !== '#111111';
    return scene.nodes.length > 0 || Boolean(String(projectNotes || '').trim()) || projectChecklist.length > 0 ||
      hasCameraBookmarks() || hasNonDefaultTextNodeStyle;
  }

  function currentProjectWorkedMs() {
    const activeMs = currentProjectId && projectSessionStartedAt
      ? Math.max(0, Date.now() - projectSessionStartedAt)
      : 0;
    return Math.max(0, Number(projectWorkedMs) || 0) + activeMs;
  }

  function checkpointProjectWorkTime() {
    if (!currentProjectId || !projectSessionStartedAt) return;
    projectWorkedMs = currentProjectWorkedMs();
    projectSessionStartedAt = Date.now();
    updateProjectNotesMeta();
  }

  function sanitizeProjectChecklist(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, 300).map(item => ({
      id: item && typeof item.id === 'string' && item.id ? item.id : safeId(),
      text: String(item && item.text || '').trim().slice(0, 240),
      done: Boolean(item && item.done === true)
    })).filter(item => item.text);
  }

  function formatProjectDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.floor((Number(milliseconds) || 0) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) return `${days} д ${hours} ч`;
    if (hours) return `${hours} ч ${minutes} мин`;
    return `${totalMinutes} мин`;
  }

  function updateProjectNotesMeta() {
    if (projectCreatedDate) {
      const created = new Date(Number(projectStartedAt) || Date.now());
      projectCreatedDate.textContent = created.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    }
    if (projectWorkedTime) projectWorkedTime.textContent = formatProjectDuration(currentProjectWorkedMs());
  }

  function renderProjectChecklist() {
    if (!projectChecklistList) return;
    projectChecklistList.replaceChildren();
    const completed = projectChecklist.filter(item => item.done).length;
    if (projectChecklistProgress) projectChecklistProgress.textContent = `${completed} / ${projectChecklist.length}`;

    if (!projectChecklist.length) {
      const empty = document.createElement('p');
      empty.className = 'project-checklist-empty';
      empty.textContent = 'Пока нет задач. Добавьте первый пункт выше.';
      projectChecklistList.appendChild(empty);
      return;
    }

    projectChecklist.forEach(task => {
      const row = document.createElement('div');
      row.className = `project-checklist-item${task.done ? ' is-done' : ''}`;
      row.dataset.taskId = task.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.done;
      checkbox.className = 'project-checklist-checkbox';
      checkbox.dataset.checklistToggle = task.id;
      checkbox.setAttribute('aria-label', `Отметить задачу: ${task.text}`);

      const text = document.createElement('span');
      text.className = 'project-checklist-text';
      text.textContent = task.text;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'project-checklist-delete';
      remove.dataset.checklistDelete = task.id;
      remove.setAttribute('aria-label', `Удалить задачу: ${task.text}`);
      remove.title = 'Удалить задачу';
      remove.textContent = '×';

      row.append(checkbox, text, remove);
      projectChecklistList.appendChild(row);
    });
  }

  function syncProjectNotesPanel() {
    if (projectNotesInput && projectNotesInput.value !== projectNotes) projectNotesInput.value = projectNotes;
    updateProjectNotesMeta();
    renderProjectChecklist();
  }

  function setProjectNotesOpen(open) {
    if (presentationMode && open) return;
    const isOpen = Boolean(open);
    if (!mainArea || !projectNotesPanel) return;
    if (isOpen) {
      closeNodeContextMenu();
      closeProjectActionsMenu();
    }
    mainArea.classList.toggle('project-notes-open', isOpen);
    projectNotesPanel.setAttribute('aria-hidden', String(!isOpen));
    if (projectNotesBackdrop) projectNotesBackdrop.setAttribute('aria-hidden', String(!isOpen));
    if (projectNotesToggle) {
      projectNotesToggle.setAttribute('aria-expanded', String(isOpen));
      projectNotesToggle.classList.toggle('active', isOpen);
    }
    if (isOpen) syncProjectNotesPanel();
  }

  function showToast(message, duration = 2300) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), Math.max(1000, Number(duration) || 2300));
  }

  function makeProjectId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function migrateLegacyStorageKey(legacyKey, currentKey) {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue === null) return;

    // The canonical value wins if both spellings exist. Otherwise move the
    // value by freeing the old key first, then restore it if the new write fails.
    if (localStorage.getItem(currentKey) !== null) {
      localStorage.removeItem(legacyKey);
      return;
    }

    localStorage.removeItem(legacyKey);
    try {
      localStorage.setItem(currentKey, legacyValue);
    } catch (error) {
      try {
        localStorage.setItem(legacyKey, legacyValue);
      } catch (restoreError) {
        console.error('Legacy localStorage key could not be restored:', legacyKey, restoreError);
      }
      throw error;
    }
  }

  function migrateLegacyNetNorthStorage() {
    if (!localStorageAvailable) return;

    const fixedKeys = [
      [LEGACY_PROJECT_INDEX_KEY, PROJECT_INDEX_KEY],
      [LEGACY_THEME_KEY, THEME_KEY],
      [LEGACY_AUTO_ARRANGE_KEY, AUTO_ARRANGE_KEY],
      [LEGACY_EMPTY_HINT_DISMISSED_KEY, EMPTY_HINT_DISMISSED_KEY]
    ];
    fixedKeys.forEach(([legacyKey, currentKey]) => {
      try {
        migrateLegacyStorageKey(legacyKey, currentKey);
      } catch (error) {
        console.warn('Could not migrate legacy localStorage key:', legacyKey, error);
      }
    });

    // Collect keys before moving them because localStorage indexes change when
    // entries are removed. Project IDs and their serialized data stay intact.
    const legacyProjectKeys = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && key.startsWith(LEGACY_PROJECT_KEY_PREFIX)) legacyProjectKeys.push(key);
      }
    } catch (error) {
      console.warn('Could not enumerate legacy project keys:', error);
    }
    legacyProjectKeys.forEach(legacyKey => {
      const projectId = legacyKey.slice(LEGACY_PROJECT_KEY_PREFIX.length);
      if (!projectId) return;
      try {
        migrateLegacyStorageKey(legacyKey, PROJECT_KEY_PREFIX + projectId);
      } catch (error) {
        console.warn('Could not migrate legacy project record:', projectId, error);
      }
    });
  }

  function openProjectDatabase() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB is not available'));
    if (projectDatabasePromise) return projectDatabasePromise;

    const opening = new Promise((resolve, reject) => {
      let request;
      try {
        request = window.indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_DB_STORE)) {
          database.createObjectStore(PROJECT_DB_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('Could not open the project database'));
      request.onblocked = () => reject(new Error('The project database is blocked by another tab'));
    });

    projectDatabasePromise = opening.catch(error => {
      projectDatabasePromise = null;
      throw error;
    });
    return projectDatabasePromise;
  }

  function runProjectDbTransaction(mode, createRequest) {
    return openProjectDatabase().then(database => new Promise((resolve, reject) => {
      let transaction;
      let request;
      let result;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error || new Error('Project database transaction failed'));
      };

      try {
        transaction = database.transaction(PROJECT_DB_STORE, mode);
        const store = transaction.objectStore(PROJECT_DB_STORE);
        request = createRequest(store);
        if (request) {
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => fail(request.error);
        }
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        transaction.onerror = () => fail(transaction.error);
        transaction.onabort = () => fail(transaction.error || new Error('Project database transaction was aborted'));
      } catch (error) {
        fail(error);
      }
    }));
  }

  function projectRecordKey(id) {
    return PROJECT_KEY_PREFIX + String(id);
  }

  async function readProjectDataFromIndexedDB(id) {
    const record = await runProjectDbTransaction('readonly', store => store.get(projectRecordKey(id)));
    return record && record.data && typeof record.data === 'object' ? record.data : null;
  }

  async function readAllProjectRecordsFromIndexedDB() {
    const records = await runProjectDbTransaction('readonly', store => store.getAll());
    return Array.isArray(records) ? records : [];
  }

  async function putProjectDataInIndexedDB(id, data) {
    await runProjectDbTransaction('readwrite', store => store.put({
      key: projectRecordKey(id),
      id: String(id),
      data,
      updatedAt: Number(data && data.updatedAt) || Date.now()
    }));
    return true;
  }

  async function deleteProjectDataFromIndexedDB(id) {
    if (!window.indexedDB) return false;
    await runProjectDbTransaction('readwrite', store => store.delete(projectRecordKey(id)));
    return true;
  }

  // Synchronous localStorage fallback retained for older projects and browsers
  // where IndexedDB is unavailable. New project bodies are stored in IndexedDB.
  function getStoredProjectRecord(id) {
    try {
      const currentValue = localStorage.getItem(PROJECT_KEY_PREFIX + id);
      return currentValue !== null ? currentValue : localStorage.getItem(LEGACY_PROJECT_KEY_PREFIX + id);
    } catch (_) {
      return null;
    }
  }

  async function getStoredProjectData(id) {
    if (!id) return null;
    let indexedDbError = null;
    try {
      const indexedData = await readProjectDataFromIndexedDB(id);
      if (indexedData) return indexedData;
    } catch (error) {
      indexedDbError = error;
    }

    const raw = getStoredProjectRecord(id);
    if (!raw) {
      if (indexedDbError) console.warn('IndexedDB read failed and no localStorage fallback exists:', indexedDbError);
      return null;
    }

    const data = JSON.parse(raw);
    validateProjectDataStructure(data);
    try {
      await putProjectDataInIndexedDB(id, data);
      if (localStorageAvailable) {
        localStorage.removeItem(PROJECT_KEY_PREFIX + id);
        localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + id);
        if (localStorage.getItem(STORAGE_PROJECT_ID_KEY) === id) localStorage.removeItem(STORAGE_KEY);
      }
    } catch (migrationError) {
      // Keep the localStorage copy intact when IndexedDB cannot accept it.
      console.warn('Could not migrate the opened project to IndexedDB:', id, migrationError);
    }
    return data;
  }

  function readProjectIndex() {
    try {
      const currentRaw = localStorage.getItem(PROJECT_INDEX_KEY);
      const raw = currentRaw !== null ? currentRaw : (localStorage.getItem(LEGACY_PROJECT_INDEX_KEY) || '[]');
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
    } catch (_) { return []; }
  }

  async function writeProjectIndex(index) {
    const retained = index.slice(0, 30);
    const previous = readProjectIndex();
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(retained));
    localStorage.removeItem(LEGACY_PROJECT_INDEX_KEY);

    const retainedIds = new Set(retained.map(item => item.id));
    const evictedIds = previous
      .filter(item => item && typeof item.id === 'string' && !retainedIds.has(item.id))
      .map(item => item.id);

    for (const id of evictedIds) {
      localStorage.removeItem(PROJECT_KEY_PREFIX + id);
      localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + id);
      projectPreviewCache.delete(id);
      try {
        await deleteProjectDataFromIndexedDB(id);
      } catch (error) {
        // The index is authoritative for visibility. A database cleanup failure
        // must not turn an otherwise successful new-project save into a failure.
        console.warn('Could not remove an evicted IndexedDB project:', id, error);
      }
    }
    return retained;
  }

  function buildProjectPreviewData(inputScene) {
    if (!inputScene || !Array.isArray(inputScene.nodes) || !Array.isArray(inputScene.edges)) return null;
    const sourceNodes = inputScene.nodes;
    const previewNodeCount = Math.min(sourceNodes.length, 72);
    const sourceIndexes = new Map();
    sourceNodes.forEach((node, index) => {
      if (node && typeof node.id === 'string' && node.id) sourceIndexes.set(node.id, index);
    });
    const sampledIndexes = [];
    const nodes = [];
    for (let sampleIndex = 0; sampleIndex < previewNodeCount; sampleIndex++) {
      const index = sourceNodes.length <= 72
        ? sampleIndex
        : Math.floor(sampleIndex * (sourceNodes.length - 1) / (previewNodeCount - 1));
      const node = sourceNodes[index];
      if (!node || typeof node.id !== 'string' || !node.id ||
          !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y))) continue;
      sampledIndexes.push(index);
      // Compact numeric tuples keep the project index small and never copy text/images.
      nodes.push([
        clamp(Number(node.x), -100000, 100000),
        clamp(Number(node.y), -100000, 100000),
        clamp(Number(node.width) || 180, 10, 2000),
        clamp(Number(node.height) || 42, 10, 1200),
        node.type === 'image' ? 1 : 0
      ]);
    }
    if (!nodes.length) return { nodes: [], edges: [] };
    const edges = [];
    const edgeKeys = new Set();
    const sourceRange = Math.max(1, sourceNodes.length - 1);
    const previewRange = Math.max(1, nodes.length - 1);
    for (const edge of inputScene.edges) {
      if (!edge || !sourceIndexes.has(edge.from) || !sourceIndexes.has(edge.to) || edge.from === edge.to) continue;
      const fromIndex = sourceIndexes.get(edge.from);
      const toIndex = sourceIndexes.get(edge.to);
      const from = Math.round(fromIndex * previewRange / sourceRange);
      const to = Math.round(toIndex * previewRange / sourceRange);
      if (from === to) continue;
      const key = `${from}>${to}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push([from, to]);
      if (edges.length >= 150) break;
    }
    return { nodes, edges };
  }

  async function upsertProjectIndex(data, id = currentProjectId) {
    if (!localStorageAvailable || !id) return;
    projectPreviewCache.delete(id);
    const index = readProjectIndex().filter(item => item.id !== id);
    index.unshift({
      id,
      title: data.title || 'Новая схема',
      updatedAt: Date.now(),
      preview: buildProjectPreviewData(data.scene)
    });
    await writeProjectIndex(index);
  }

  async function migrateLegacyProject() {
    if (!localStorageAvailable) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (!data || !data.scene || !Array.isArray(data.scene.nodes) || !Array.isArray(data.scene.edges)) {
        // STORAGE_KEY is no longer used for project bodies. Remove stale non-project values.
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      validateProjectDataStructure(data);
      const id = localStorage.getItem(STORAGE_PROJECT_ID_KEY) || 'previous-session';
      let alreadyStored = false;
      try { alreadyStored = Boolean(await readProjectDataFromIndexedDB(id)); } catch (_) {}

      if (!alreadyStored) {
        try {
          await putProjectDataInIndexedDB(id, data);
        } catch (databaseError) {
          // Fallback for browsers without a working IndexedDB implementation.
          // Avoid writing a second full copy when the per-project local key exists.
          if (getStoredProjectRecord(id) === null) localStorage.setItem(PROJECT_KEY_PREFIX + id, raw);
          console.warn('Legacy project retained in localStorage because IndexedDB is unavailable:', databaseError);
        }
      } else {
        localStorage.removeItem(PROJECT_KEY_PREFIX + id);
        localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + id);
      }

      // Keep the legacy snapshot until the compact project index is committed.
      // If index storage fails, the original source remains discoverable for retry.
      const index = readProjectIndex();
      const existing = index.find(item => item.id === id);
      if (existing) {
        existing.title = data.title || existing.title || 'Предыдущая схема';
        existing.preview = existing.preview || buildProjectPreviewData(data.scene);
        existing.updatedAt = Number(data.updatedAt) || existing.updatedAt || Date.now();
      } else {
        index.unshift({
          id,
          title: data.title || 'Предыдущая схема',
          updatedAt: Number(data.updatedAt) || Date.now(),
          preview: buildProjectPreviewData(data.scene)
        });
      }
      await writeProjectIndex(index);
      // The IndexedDB/local fallback body and its index are durable now. Remove
      // the old full active-project mirror only after both steps have succeeded.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_PROJECT_ID_KEY, id);
    } catch (error) {
      // Leave the original legacy snapshot in place if migration could not be completed.
      console.warn('Legacy project migration failed:', error);
    }
  }

  async function migrateLocalStorageProjectRecordsToIndexedDB() {
    if (!localStorageAvailable || !window.indexedDB) return;
    const keys = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && (key.startsWith(PROJECT_KEY_PREFIX) || key.startsWith(LEGACY_PROJECT_KEY_PREFIX))) {
          keys.push(key);
        }
      }
    } catch (error) {
      console.warn('Could not enumerate local project records for IndexedDB migration:', error);
      return;
    }

    let projectIndex = readProjectIndex();
    let indexChanged = false;
    for (const key of keys) {
      const isLegacyKey = key.startsWith(LEGACY_PROJECT_KEY_PREFIX);
      const prefix = isLegacyKey ? LEGACY_PROJECT_KEY_PREFIX : PROJECT_KEY_PREFIX;
      const id = key.slice(prefix.length);
      if (!id) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const data = JSON.parse(raw);
        validateProjectDataStructure(data);
        await putProjectDataInIndexedDB(id, data);
        localStorage.removeItem(key);
        const item = projectIndex.find(project => project.id === id);
        if (item && (!item.preview || !Array.isArray(item.preview.nodes))) {
          item.preview = buildProjectPreviewData(data.scene);
          indexChanged = true;
        }
      } catch (error) {
        // Keep a local copy if IndexedDB is unavailable or the record is invalid.
        console.warn('Project remains in localStorage after migration attempt:', id, error);
      }
    }
    // Rebuild missing index entries from IndexedDB too. This recovers projects
    // whose bodies survived in the database while their compact local index was
    // cleared, partially written, or lost during a previous migration.
    try {
      const indexedRecords = await readAllProjectRecordsFromIndexedDB();
      const indexedById = new Map();
      indexedRecords.forEach(record => {
        const id = String(record && (record.id || (typeof record.key === 'string' && record.key.startsWith(PROJECT_KEY_PREFIX)
          ? record.key.slice(PROJECT_KEY_PREFIX.length)
          : '')) || '');
        const data = record && record.data;
        if (!id || !data || typeof data !== 'object' || !data.scene ||
            !Array.isArray(data.scene.nodes) || !Array.isArray(data.scene.edges)) return;
        indexedById.set(id, { id, data, updatedAt: Number(data.updatedAt || record.updatedAt) || Date.now() });
      });

      for (const { id, data, updatedAt } of indexedById.values()) {
        const existing = projectIndex.find(item => item.id === id);
        if (!existing) {
          projectIndex.push({
            id,
            title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Новая схема',
            updatedAt,
            preview: buildProjectPreviewData(data.scene)
          });
          indexChanged = true;
        } else {
          if (!existing.preview || !Array.isArray(existing.preview.nodes)) {
            existing.preview = buildProjectPreviewData(data.scene);
            indexChanged = true;
          }
          if (!existing.title && data.title) {
            existing.title = data.title;
            indexChanged = true;
          }
          if (!Number(existing.updatedAt) && updatedAt) {
            existing.updatedAt = updatedAt;
            indexChanged = true;
          }
        }
      }

      if (indexChanged) {
        projectIndex.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
      }
    } catch (error) {
      console.warn('Could not recover missing project index entries from IndexedDB:', error);
    }

    // Retry small legacy settings/index moves after large project bodies have been transferred.
    migrateLegacyNetNorthStorage();
    if (indexChanged) await writeProjectIndex(projectIndex);
  }

  function reportLocalStorageSaveFailure(error) {
    const now = Date.now();
    if (now - lastLocalSaveErrorToastAt < 4000) return;
    lastLocalSaveErrorToastAt = now;

    const isQuotaError = !!(error && (
      error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 || error.code === 1014 || /quota|storage.{0,12}full/i.test(String(error.message || ''))
    ));
    const message = isQuotaError
      ? 'IndexedDB недоступна, а резервное хранилище браузера заполнено. Экспортируйте проект через «Экспорт проекта JSON» и освободите место.'
      : 'Не удалось сохранить проект в IndexedDB или резервное хранилище браузера. Экспортируйте его через «Экспорт проекта JSON», чтобы не потерять изменения.';

    window.setTimeout(() => showToast(message, 6500), 0);
  }

  async function persistProjectSnapshot(payload) {
    if (!localStorageAvailable || !payload || !payload.id) {
      throw new Error('Project storage is unavailable');
    }

    if (projectStorageMigrationPromise) {
      try { await projectStorageMigrationPromise; } catch (_) {}
    }

    let indexedDbStored = false;
    let indexedDbError = null;
    try {
      await putProjectDataInIndexedDB(payload.id, payload.data);
      indexedDbStored = true;
    } catch (error) {
      indexedDbError = error;
      // Transparent localStorage fallback for older/restricted browsers.
      const serialized = JSON.stringify(payload.data);
      try {
        localStorage.setItem(PROJECT_KEY_PREFIX + payload.id, serialized);
        localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + payload.id);
      } catch (fallbackError) {
        fallbackError.indexedDBError = indexedDbError;
        throw fallbackError;
      }
    }

    if (indexedDbStored) {
      // The object store is now the single source of truth for project bodies.
      localStorage.removeItem(PROJECT_KEY_PREFIX + payload.id);
      localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + payload.id);
    }

    if (currentProjectId === payload.id) {
      // Free the old duplicated body first: localStorage may be full precisely
      // because older builds mirrored the entire active project into STORAGE_KEY.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_PROJECT_ID_KEY, payload.id);
    }

    await upsertProjectIndex(payload.data, payload.id);
    if (currentProjectId === payload.id) {
      activeSavedProjectId = payload.id;
      activeSavedProjectData = payload.data;
    }
    if (startScreen.classList.contains('visible') && !document.getElementById('startProjectsPanel').hidden) renderProjectList();
    return true;
  }

  async function flushPendingSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = 0;

    if (activeSavePromise) {
      const inFlight = activeSavePromise;
      const result = await inFlight;
      if (!result) return false;
      if (pendingSave) return flushPendingSave();
      return true;
    }

    const payload = pendingSave;
    pendingSave = null;
    if (!payload) return true;

    const writePromise = (async () => {
      try {
        await persistProjectSnapshot(payload);
        return true;
      } catch (error) {
        // A newer queued snapshot wins; otherwise retain this one for retry/export.
        if (!pendingSave) pendingSave = payload;
        console.warn('Project save failed:', error);
        reportLocalStorageSaveFailure(error);
        return false;
      }
    })();
    activeSavePromise = writePromise;
    const result = await writePromise;
    if (activeSavePromise === writePromise) activeSavePromise = null;
    if (!result) return false;
    if (pendingSave) return flushPendingSave();
    return true;
  }

  function cancelPendingProjectSave(id) {
    if (pendingSave && pendingSave.id === id) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = 0;
      pendingSave = null;
    }
  }

  async function removeProjectRecord(id, cleanupLegacy = false) {
    if (!id || !localStorageAvailable) return false;
    projectPreviewCache.delete(id);

    try {
      await projectStorageMigrationPromise;
      // Wait for an already-started write so it cannot recreate a record after deletion.
      if (activeSavePromise) {
        const activeSaved = await activeSavePromise;
        if (!activeSaved) throw new Error('A project write is still pending');
      }
      // A debounced save may have been queued while an in-flight write settled.
      // Explicit deletion wins: cancel that snapshot before removing either copy.
      cancelPendingProjectSave(id);
      let indexedDbDeleteError = null;
      try {
        await deleteProjectDataFromIndexedDB(id);
      } catch (error) {
        indexedDbDeleteError = error;
      }
      const localFallbackRecord = getStoredProjectRecord(id);
      if (indexedDbDeleteError && localFallbackRecord === null) {
        throw indexedDbDeleteError;
      }
      if (indexedDbDeleteError) {
        console.warn('IndexedDB was unavailable during deletion; removing the local fallback copy:', id, indexedDbDeleteError);
      }
      localStorage.removeItem(PROJECT_KEY_PREFIX + id);
      localStorage.removeItem(LEGACY_PROJECT_KEY_PREFIX + id);
      const updatedIndex = readProjectIndex().filter(item => item.id !== id);
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(updatedIndex));
      localStorage.removeItem(LEGACY_PROJECT_INDEX_KEY);

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
            const hasNodes = Array.isArray(legacy?.scene?.nodes) && legacy.scene.nodes.length > 0;
            const hasNotes = Boolean(String(legacy?.notes || '').trim());
            const hasTasks = Array.isArray(legacy?.checklist) && legacy.checklist.length > 0;
            const hasBookmarks = !!legacy?.cameraBookmarks && ['1', '2', '3'].some(slot => !!legacy.cameraBookmarks[slot]);
            legacyIsEmpty = Boolean(legacy && !hasNodes && !hasNotes && !hasTasks && !hasBookmarks);
          } catch (_) { legacyIsEmpty = false; }
        }
        if (!legacyRaw || legacyIsEmpty) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_PROJECT_ID_KEY);
        }
      }

      if (activeSavedProjectId === id) {
        activeSavedProjectId = null;
        activeSavedProjectData = null;
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

  async function deleteEmptyProject(id = currentProjectId) {
    if (!id) return false;
    cancelPendingProjectSave(id);
    const removed = await removeProjectRecord(id, true);
    if (removed && currentProjectId === id) currentProjectId = null;
    return removed;
  }

  function hasUnsavedChanges() {
    // A notes-only or checklist-only project is still meaningful project content.
    if (!hasProjectContent()) return false;
    if (!currentProjectId || !localStorageAvailable) return true;
    if (activeSavedProjectId !== currentProjectId || !activeSavedProjectData) return true;

    try {
      const stored = activeSavedProjectData;
      if (!stored || !stored.scene || !Array.isArray(stored.scene.nodes) || !Array.isArray(stored.scene.edges)) return true;

      const currentTitle = projectTitle.value.trim() || 'Новая схема';
      if ((stored.title || 'Новая схема') !== currentTitle) return true;
      if (String(stored.notes || '') !== projectNotes) return true;
      if (!sameJson(sanitizeProjectChecklist(stored.checklist), projectChecklist)) return true;
      if (!sameJson(normalizeCameraBookmarks(stored.cameraBookmarks, scene.nodes), cameraState.bookmarks)) return true;
      if (!sameJson(normalizeTextNodeDefaults(stored.textNodeDefaults), getTextNodeDefaults())) return true;
      if (!sameJson(snapshot(sanitizeScene(stored.scene)), snapshot())) return true;

      if (stored.images && Array.isArray(stored.timeline) && stored.timeline.length) {
        const storedTimeline = stored.timeline
          .filter(frame => frame && frame.scene && Array.isArray(frame.scene.nodes) && Array.isArray(frame.scene.edges))
          .map(frame => ({ at: Math.max(0, Number(frame.at) || 0), scene: snapshot(sanitizeScene(frame.scene)) }));
        if (storedTimeline.length && !sameJson(storedTimeline, timeline)) return true;
      }

      const storedStartedAt = Number(stored.projectStartedAt) || Number(projectStartedAt);
      return storedStartedAt !== Number(projectStartedAt);
    } catch (_) {
      return true;
    }
  }

  function hasChangesSinceInitialOpenedBaseline() {
    const stored = initialOpenedProjectBaseline;
    if (!stored || isNewUnsavedSessionProject) return false;

    try {
      if (!stored.scene || !Array.isArray(stored.scene.nodes) || !Array.isArray(stored.scene.edges)) return true;
      const currentTitle = projectTitle.value.trim() || 'Новая схема';
      if ((stored.title || 'Новая схема') !== currentTitle) return true;
      if (String(stored.notes || '') !== projectNotes) return true;
      if (!sameJson(sanitizeProjectChecklist(stored.checklist), projectChecklist)) return true;
      if (!sameJson(normalizeCameraBookmarks(stored.cameraBookmarks, scene.nodes), cameraState.bookmarks)) return true;
      if (!sameJson(normalizeTextNodeDefaults(stored.textNodeDefaults), getTextNodeDefaults())) return true;
      if (!sameJson(snapshot(sanitizeScene(stored.scene)), snapshot())) return true;
      const openedAt = Number(stored.projectStartedAt) || Number(projectStartedAt);
      return openedAt !== Number(projectStartedAt);
    } catch (_) {
      return true;
    }
  }

  function saveProject() {
    if (!localStorageAvailable || !currentProjectId) return false;

    if (!hasProjectContent()) {
      cancelPendingProjectSave(currentProjectId);
      return true;
    }

    try {
      // Project switches await the previous snapshot before changing currentProjectId.
      // Keep a defensive guard so a stale snapshot is never overwritten by another ID.
      if (pendingSave && pendingSave.id !== currentProjectId) {
        console.warn('A previous project snapshot is still queued; refusing to replace it.');
        return false;
      }

      const sceneSnapshot = snapshot();
      const timelineSnapshot = timeline.map(frame => ({
        at: Math.max(0, Number(frame.at) || 0),
        scene: snapshot(frame.scene)
      }));
      const imageAssets = collectProjectImageAssets([
        sceneSnapshot,
        ...timelineSnapshot.map(frame => frame.scene)
      ]);
      const payload = {
        id: currentProjectId,
        data: {
          version: 2,
          title: projectTitle.value.trim() || 'Новая схема',
          scene: sceneSnapshot,
          timeline: timelineSnapshot,
          images: imageAssets,
          projectStartedAt,
          workedMs: currentProjectWorkedMs(),
          notes: projectNotes,
          checklist: clone(projectChecklist),
          cameraBookmarks: clone(cameraState.bookmarks),
          textNodeDefaults: getTextNodeDefaults(),
          updatedAt: Date.now()
        }
      };
      pendingSave = payload;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { void flushPendingSave(); }, 140);
      return true;
    } catch (error) {
      console.warn('Project snapshot creation failed:', error);
      reportLocalStorageSaveFailure(error);
      return false;
    }
  }

  function pushUndoSnapshot() {
    const snap = snapshot();
    if (undoIndex >= 0 && sameJson(undoStack[undoIndex], snap)) return;
    undoStack = undoStack.slice(0, undoIndex + 1);
    undoStack.push(snap);
    if (undoStack.length > 100) {
      undoStack.shift();
      pruneImageStore();
    }
    undoIndex = undoStack.length - 1;
  }

  function recordTimeline() {
    const snap = snapshot();
    const last = timeline[timeline.length - 1];
    if (last && sameJson(last.scene, snap)) return;
    timeline.push({ at: nowRelative(), scene: snap });
    if (timeline.length > 500) {
      timeline.splice(1, timeline.length - 500);
      pruneImageStore();
    }
  }

  function commitScene(message) {
    const invalidBookmarkSlots = pruneInvalidCameraBookmarks(scene.nodes);
    pushUndoSnapshot();
    recordTimeline();
    renderScene();
    updateCameraBookmarksUI();
    saveProject();
    updateActionButtons();
    if (invalidBookmarkSlots.length) {
      showToast(`Закладки ${invalidBookmarkSlots.join(', ')} сброшены: связанный узел удалён`);
    } else if (message) {
      showToast(message);
    }
  }

  function updateActionButtons() {
    document.getElementById('undoBtn').disabled = undoIndex <= 0 || playback.active;
    document.getElementById('redoBtn').disabled = undoIndex >= undoStack.length - 1 || playback.active;
    const deleteButton = document.getElementById('deleteBtn');
    const selectedNodeCount = selectedIds.length || (selectedId ? 1 : 0);
    const selectedEdgeCount = selectedEdgeIds.length;
    deleteButton.disabled = !(selectedNodeCount || selectedEdgeCount) || playback.active;
    let deleteLabel = 'Удалить выбранное · Del';
    if (selectedNodeCount && selectedEdgeCount) {
      deleteLabel = `Удалить выбранное (${selectedNodeCount} узл., ${selectedEdgeCount} связ.) · Del`;
    } else if (selectedEdgeCount) {
      deleteLabel = selectedEdgeCount > 1
        ? `Удалить связи (${selectedEdgeCount}) · Del`
        : 'Удалить связь · Del';
    } else if (selectedNodeCount > 1) {
      deleteLabel = `Удалить выбранные (${selectedNodeCount}) · Del`;
    }
    deleteButton.dataset.tooltip = deleteLabel;
    deleteButton.setAttribute('aria-label', deleteLabel);
  }

  async function showStartPanel(panelName) {
    ['startMainPanel', 'startProjectsPanel', 'startSettingsPanel'].forEach(id => {
      document.getElementById(id).hidden = id !== panelName;
    });
    if (panelName === 'startProjectsPanel') {
      // The index may be incomplete until legacy bodies have migrated and
      // IndexedDB-only records have been recovered into it.
      try { await projectStorageMigrationPromise; } catch (_) {}
      if (!document.getElementById('startProjectsPanel').hidden) renderProjectList();
    }
    if (panelName === 'startSettingsPanel') {
      updateThemeChoices();
      updateAutoArrangeChoice();
    }
  }

  function normalizeProjectViewMode(value) {
    return ['list', 'horizontal', 'vertical'].includes(value) ? value : 'list';
  }

  function updateProjectViewSwitcher() {
    document.querySelectorAll('[data-project-view]').forEach(button => {
      const active = button.dataset.projectView === projectViewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const list = document.getElementById('savedProjectList');
    if (list) list.dataset.view = projectViewMode;
  }

  function setProjectViewMode(value) {
    const nextMode = normalizeProjectViewMode(value);
    if (nextMode === projectViewMode) return;
    projectViewMode = nextMode;
    try {
      if (localStorageAvailable) localStorage.setItem(PROJECT_VIEW_KEY, projectViewMode);
    } catch (error) {
      console.warn('Project view preference save failed:', error);
    }
    updateProjectViewSwitcher();
    renderProjectList();
  }

  function makeProjectPreview(item) {
    const projectId = item && item.id;
    if (!projectId || !localStorageAvailable || projectViewMode === 'list') return null;
    const cached = projectPreviewCache.get(projectId);
    if (cached) return cached.cloneNode(true);

    let previewData = item.preview;
    if (!previewData || !Array.isArray(previewData.nodes) || !Array.isArray(previewData.edges)) {
      // Legacy project-index entries have no thumbnail projection. Parse their
      // project payload only once, then keep a tiny projection in the cache.
      try {
        const raw = getStoredProjectRecord(projectId);
        if (!raw || raw.length > 16000000) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || !data.scene ||
            !Array.isArray(data.scene.nodes) || !Array.isArray(data.scene.edges)) return null;
        previewData = buildProjectPreviewData(data.scene);
      } catch (_) {
        return null;
      }
    }
    if (!previewData || !Array.isArray(previewData.nodes) || !Array.isArray(previewData.edges)) return null;

    const nodes = previewData.nodes.filter(node => Array.isArray(node) && node.length >= 5 &&
      node.slice(0, 4).every(value => Number.isFinite(Number(value))));
    if (!nodes.length) return null;

    const centers = nodes.map((node, index) => ({
      index,
      node: { width: Number(node[2]), height: Number(node[3]), type: node[4] === 1 ? 'image' : 'text' },
      x: Number(node[0]) + Math.max(10, Number(node[2]) || 180) / 2,
      y: Number(node[1]) + Math.max(10, Number(node[3]) || 42) / 2
    }));
    const minX = Math.min(...centers.map(point => point.x));
    const maxX = Math.max(...centers.map(point => point.x));
    const minY = Math.min(...centers.map(point => point.y));
    const maxY = Math.max(...centers.map(point => point.y));
    const width = 320;
    const height = 126;
    const padding = 18;
    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
    const contentWidth = rangeX * scale;
    const contentHeight = rangeY * scale;
    const offsetX = (width - contentWidth) / 2;
    const offsetY = (height - contentHeight) / 2;
    const points = new Map();
    centers.forEach(point => {
      points.set(point.index, {
        x: offsetX + (point.x - minX) * scale,
        y: offsetY + (point.y - minY) * scale,
        node: point.node
      });
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'saved-project-preview-svg');
    svg.setAttribute('aria-hidden', 'true');

    const background = document.createElementNS(svgNS, 'rect');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('rx', '5');
    background.setAttribute('class', 'saved-project-preview-bg');
    svg.appendChild(background);

    // One SVG path keeps the preview lightweight even when a project has many links.
    const edgePath = document.createElementNS(svgNS, 'path');
    edgePath.setAttribute('class', 'saved-project-preview-edges');
    const edges = Array.isArray(previewData.edges) ? previewData.edges : [];
    const edgeSegments = [];
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length < 2) continue;
      const from = points.get(Number(edge[0]));
      const to = points.get(Number(edge[1]));
      if (!from || !to) continue;
      edgeSegments.push(`M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      if (edgeSegments.length >= 150) break;
    }
    edgePath.setAttribute('d', edgeSegments.join(' '));
    svg.appendChild(edgePath);

    const nodeGroup = document.createElementNS(svgNS, 'g');
    nodeGroup.setAttribute('class', 'saved-project-preview-nodes');
    points.forEach(point => {
      const node = point.node;
      const rect = document.createElementNS(svgNS, 'rect');
      const nodeWidth = Math.max(7, Math.min(24, 6 + Math.sqrt(Math.max(10, Number(node.width) || 180)) * 0.65));
      const nodeHeight = Math.max(5, Math.min(11, 3 + Math.sqrt(Math.max(10, Number(node.height) || 42)) * 0.45));
      rect.setAttribute('x', (point.x - nodeWidth / 2).toFixed(2));
      rect.setAttribute('y', (point.y - nodeHeight / 2).toFixed(2));
      rect.setAttribute('width', nodeWidth.toFixed(2));
      rect.setAttribute('height', nodeHeight.toFixed(2));
      rect.setAttribute('rx', '1.8');
      rect.setAttribute('class', node.type === 'image' ? 'saved-project-preview-node image' : 'saved-project-preview-node');
      nodeGroup.appendChild(rect);
    });
    svg.appendChild(nodeGroup);

    projectPreviewCache.set(projectId, svg);
    if (projectPreviewCache.size > 60) {
      const oldestKey = projectPreviewCache.keys().next().value;
      projectPreviewCache.delete(oldestKey);
    }
    return svg.cloneNode(true);
  }

  function createProjectPreview(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'saved-project-preview';
    wrapper.setAttribute('aria-hidden', 'true');
    const svg = makeProjectPreview(item);
    if (svg) {
      wrapper.appendChild(svg);
    } else {
      const empty = document.createElement('span');
      empty.className = 'saved-project-preview-empty';
      empty.textContent = 'Предпросмотр недоступен';
      wrapper.appendChild(empty);
    }
    return wrapper;
  }

  function renderProjectList() {
    const list = document.getElementById('savedProjectList');
    if (!list) return;
    updateProjectViewSwitcher();
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
      const titleText = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Без названия';
      row.className = `saved-project${projectViewMode === 'horizontal' ? ' is-horizontal' : ''}${projectViewMode === 'vertical' ? ' is-vertical' : ''}`;
      row.dataset.projectId = item.id;

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'saved-project-open';
      openButton.dataset.projectOpenId = item.id;
      openButton.setAttribute('aria-label', `Открыть проект ${titleText}`);

      if (projectViewMode !== 'list') openButton.appendChild(createProjectPreview(item));
      const details = document.createElement('span');
      details.className = 'saved-project-details';
      const title = document.createElement('span');
      title.className = 'saved-project-title';
      title.textContent = titleText;

      const date = document.createElement('span');
      date.className = 'saved-project-date';
      const updatedAt = Number(item.updatedAt);
      date.textContent = Number.isFinite(updatedAt) && updatedAt > 0
        ? new Date(updatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
        : 'Локальный проект';
      details.append(title, date);
      openButton.appendChild(details);

      const actionsButton = document.createElement('button');
      actionsButton.type = 'button';
      actionsButton.className = 'saved-project-actions-button';
      actionsButton.dataset.projectActionsId = item.id;
      actionsButton.textContent = '⋯';
      actionsButton.title = 'Действия с проектом';
      actionsButton.setAttribute('aria-label', `Действия с проектом ${titleText}`);
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

  async function renameProject(id, title) {
    const cleanTitle = String(title ?? '').trim().slice(0, 90);
    if (!cleanTitle) {
      showToast('Введи название проекта');
      if (projectRenameBackdrop.classList.contains('visible')) projectRenameInput.focus({ preventScroll: true });
      return false;
    }
    if (!id) {
      showToast('Проект не найден');
      return false;
    }

    const isActiveProject = currentProjectId === id;
    if (isActiveProject && !hasProjectContent()) {
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
      await projectStorageMigrationPromise;
      let storedData;
      if (isActiveProject) {
        projectTitle.value = cleanTitle;
        if (!saveProject() || !await flushPendingSave()) {
          throw new Error('Не удалось сохранить активный проект перед переименованием');
        }
        storedData = activeSavedProjectId === id ? activeSavedProjectData : await getStoredProjectData(id);
      } else {
        // Wait for any asynchronous write before reading and renaming a stored body.
        // This avoids a late save replacing the renamed IndexedDB record with stale data.
        if ((activeSavePromise || pendingSave) && !await flushPendingSave()) {
          throw new Error('Не удалось завершить ожидающее сохранение проекта');
        }
        storedData = await getStoredProjectData(id);
      }

      if (!storedData || typeof storedData !== 'object') {
        showToast('Сохранённый проект не найден');
        renderProjectList();
        return false;
      }

      const updatedData = JSON.parse(JSON.stringify(storedData));
      updatedData.title = cleanTitle;
      updatedData.updatedAt = Date.now();
      await persistProjectSnapshot({ id, data: updatedData });

      closeRenameProjectModal();
      renderProjectList();
      showToast('Название проекта обновлено');
      return true;
    } catch (error) {
      console.warn('Project rename failed:', error);
      reportLocalStorageSaveFailure(error);
      showToast('Не удалось переименовать проект');
      return false;
    }
  }

  async function deleteProject(id) {
    if (!id) return false;
    if (!localStorageAvailable) {
      showToast('Локальное хранилище недоступно');
      return false;
    }

    const isActiveProject = currentProjectId === id;
    if (isActiveProject && playback.active) exitPlayback();

    // Cancel a debounced snapshot and wait for any already-started IDB transaction.
    cancelPendingProjectSave(id);
    if (activeSavePromise && !await activeSavePromise) {
      showToast('Не удалось завершить сохранение перед удалением');
      return false;
    }
    // Also cancel any snapshot queued while the active transaction was finishing.
    cancelPendingProjectSave(id);
    const removed = await removeProjectRecord(id, true);
    if (!removed) {
      showToast('Не удалось удалить проект');
      return false;
    }

    if (isActiveProject) {
      clearProjectRuntimeCaches(true);
      projectTitle.value = 'Новая схема';
      currentProjectId = null;
      activeSavedProjectId = null;
      activeSavedProjectData = null;
      isNewUnsavedSessionProject = false;
      initialOpenedProjectBaseline = null;
      projectSessionStartedAt = 0;
      projectNotes = '';
      projectChecklist = [];
      projectWorkedMs = 0;
      projectStartedAt = Date.now();
      syncProjectNotesPanel();
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
    // Rebuild every node after the theme class changes so default text colors are recalculated.
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

  async function beginNewProject() {
    if (playback.active) exitPlayback();
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (editingId) finishEditing(editingId, true);
    // Finish the previous project's asynchronous IndexedDB write before changing its ID.
    if (!await flushPendingSave()) {
      showToast('Не удалось сохранить предыдущий проект. Новый холст не создан');
      return;
    }
    clearProjectRuntimeCaches(true);
    const newTitle = generateNewProjectTitle();
    currentProjectId = makeProjectId();
    isNewUnsavedSessionProject = true;
    initialOpenedProjectBaseline = null;
    scene = freshScene(); selectedId = null; selectedIds.splice(0); editingId = null; editingOriginalText = null;
    connectionSourceId = null; linkDraft = null; drag = null; boxSelect = null; contextNodeId = null;
    projectTitle.value = newTitle; projectStartedAt = Date.now();
    activeSavedProjectId = null; activeSavedProjectData = null;
    projectNotes = '';
    projectChecklist = [];
    setTextNodeDefaults(null);
    cameraState.bookmarks = emptyCameraBookmarks();
    updateCameraBookmarksUI();
    projectWorkedMs = 0;
    projectSessionStartedAt = Date.now();
    syncProjectNotesPanel();
    timeline = [{ at: 0, scene: snapshot() }];
    undoStack = [snapshot()]; undoIndex = 0;
    mode = 'select'; syncModeButtons();
    startScreen.classList.remove('visible'); closeNodeContextMenu(); closeConfirm();
    renderScene();
    requestAnimationFrame(() => { workspace.scrollLeft = CANVAS_PAD * zoom; workspace.scrollTop = CANVAS_PAD * zoom; scheduleViewportCulling(); });
    // Do not persist an empty canvas. The first real node creation will save it.
    updateActionButtons();
  }

  async function openSavedProject(id) {
    if (playback.active) exitPlayback();
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (!localStorageAvailable) { showToast('Локальные проекты недоступны в этом браузере'); return; }
    const previousImageStore = new Map(imageStore);
    let imageStoreReplaced = false;
    try {
      if (editingId) finishEditing(editingId, true);
      // Commit the active project before reading another record from IndexedDB.
      if (!await flushPendingSave()) {
        showToast('Не удалось сохранить текущий проект перед переключением');
        return;
      }
      await projectStorageMigrationPromise;
      const data = await getStoredProjectData(id);
      if (!data) { showToast('Проект не найден'); renderProjectList(); return; }
      validateProjectDataStructure(data);
      const imageAssets = normalizeProjectImageAssets(data.images);

      clearProjectRuntimeCaches(false);
      imageStore.clear();
      Object.entries(imageAssets).forEach(([key, value]) => imageStore.set(key, value));
      imageStoreReplaced = true;

      currentProjectId = id;
      isNewUnsavedSessionProject = false;
      // Keep a private immutable copy of the exact project as it was opened.
      // Autosaves may replace activeSavedProjectData, but this baseline is used
      // by "Exit without saving" to restore the original stored version.
      initialOpenedProjectBaseline = clone(data);
      scene = sanitizeScene(data.scene);
      activeSavedProjectId = id;
      activeSavedProjectData = data;
      projectTitle.value = typeof data.title === 'string' && data.title.trim() ? data.title : 'Новая схема';
      timeline = Array.isArray(data.timeline)
        ? data.timeline
            .filter(frame => frame && frame.scene && Array.isArray(frame.scene.nodes) && Array.isArray(frame.scene.edges))
            .map(frame => ({ at: Math.max(0, Number(frame.at) || 0), scene: snapshot(sanitizeScene(frame.scene)) }))
        : [];
      projectStartedAt = Number(data.projectStartedAt) || Date.now();
      projectNotes = typeof data.notes === 'string' ? data.notes.slice(0, 100000) : '';
      projectChecklist = sanitizeProjectChecklist(data.checklist);
      setTextNodeDefaults(data.textNodeDefaults);
      cameraState.bookmarks = normalizeCameraBookmarks(data.cameraBookmarks, scene.nodes);
      updateCameraBookmarksUI();
      projectWorkedMs = Math.max(0, Number(data.workedMs) || 0);
      projectSessionStartedAt = Date.now();
      syncProjectNotesPanel();
      if (!timeline.length) timeline = [{ at: 0, scene: snapshot(freshScene()) }, { at: 1, scene: snapshot() }];
      if (!sameJson(timeline[timeline.length - 1].scene, snapshot())) timeline.push({ at: nowRelative(), scene: snapshot() });
      selectedId = null; selectedIds.splice(0); editingId = null; editingOriginalText = null; linkDraft = null; connectionSourceId = null;
      undoStack = [snapshot()]; undoIndex = 0;
      currentRenderScene = null;
      mode = 'select'; syncModeButtons();
      startScreen.classList.remove('visible'); renderScene(); updateActionButtons();
      requestAnimationFrame(() => { workspace.scrollLeft = CANVAS_PAD * zoom; workspace.scrollTop = CANVAS_PAD * zoom; scheduleViewportCulling(); });
    } catch (error) {
      if (imageStoreReplaced) {
        imageStore.clear();
        previousImageStore.forEach((value, key) => imageStore.set(key, value));
        currentRenderScene = null;
        try { renderScene(scene); } catch (_) {}
      }
      console.warn('Project could not be opened:', error);
      showToast('Не удалось открыть проект');
    }
  }

  function completeExitToStartScreen() {
    closeExitConfirm();
    // The start menu is no longer editing an active project. Keeping the scene in
    // memory is harmless; clearing its ID prevents pagehide from saving discarded edits.
    currentProjectId = null;
    activeSavedProjectId = null;
    activeSavedProjectData = null;
    isNewUnsavedSessionProject = false;
    initialOpenedProjectBaseline = null;
    projectSessionStartedAt = 0;
    setProjectNotesOpen(false);
    showStartScreen(true);
  }

  async function confirmExit() {
    if (editingId) finishEditing(editingId, true);

    if (!currentProjectId) {
      showStartScreen(true);
      return;
    }

    const hasContent = hasProjectContent();
    const isNewProjectWithContent = isNewUnsavedSessionProject && hasContent;
    const changedSinceOpened = !isNewUnsavedSessionProject && hasChangesSinceInitialOpenedBaseline();

    // A new/imported session must be explicitly saved or discarded even if
    // autosave has already created its first IndexedDB record. For opened
    // projects compare with the immutable open-time baseline, not the latest
    // autosaved snapshot, so "Exit without saving" remains meaningful.
    if (isNewProjectWithContent || changedSinceOpened) {
      exitConfirmBackdrop.classList.add('visible');
      exitConfirmBackdrop.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        if (exitConfirmBackdrop.classList.contains('visible')) {
          exitSaveBtn.focus({ preventScroll: true });
        }
      });
      return;
    }

    // Empty new canvases are not retained. An opened project that was already
    // empty remains in the list; an emptied existing project was handled above
    // as a change against its original baseline and can be saved or discarded.
    if (!hasContent) {
      if (isNewUnsavedSessionProject) {
        const removed = await deleteEmptyProject(currentProjectId);
        if (!removed && currentProjectId) {
          showToast('Не удалось удалить пустой проект');
          return;
        }
      }
      completeExitToStartScreen();
      return;
    }

    const hasPendingWrite = !!(pendingSave && pendingSave.id === currentProjectId);
    const hasChanges = hasUnsavedChanges();

    if (!hasChanges) {
      // Даже если изменений нет, не оставляем таймер сохранения висеть при выходе.
      if ((hasPendingWrite || activeSavePromise) && !await flushPendingSave()) {
        showToast('Не удалось завершить сохранение. Попробуй ещё раз');
        return;
      }
      checkpointProjectWorkTime();
      if (!saveProject() || !await flushPendingSave()) {
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
      void confirmExit();
      return;
    }
    showStartPanel('startMainPanel');
    startScreen.classList.add('visible');
  }

  function closeExitConfirm() {
    exitConfirmBackdrop.classList.remove('visible');
    exitConfirmBackdrop.setAttribute('aria-hidden', 'true');
  }

  async function saveAndExitToStartScreen() {
    if (editingId) finishEditing(editingId, true);
    if (!hasProjectContent()) {
      const removed = await deleteEmptyProject(currentProjectId);
      if (!removed && currentProjectId) {
        showToast('Не удалось удалить пустой проект');
        return;
      }
      completeExitToStartScreen();
      return;
    }
    if (!localStorageAvailable) {
      showToast('Не удалось сохранить: локальное хранилище недоступно');
      return;
    }

    checkpointProjectWorkTime();
    if (!saveProject()) {
      showToast('Не удалось подготовить проект к сохранению');
      return;
    }
    const saved = await flushPendingSave();
    if (!saved) {
      showToast('Не удалось сохранить проект. Попробуй ещё раз');
      return;
    }
    isNewUnsavedSessionProject = false;
    initialOpenedProjectBaseline = null;
    completeExitToStartScreen();
  }

  async function exitWithoutSavingToStartScreen() {
    const id = currentProjectId;
    if (id) {
      const discardEntireProject = isNewUnsavedSessionProject;
      // Resolve migration before canceling queued work or restoring the baseline.
      try { await projectStorageMigrationPromise; } catch (_) {}
      const baseline = discardEntireProject
        ? null
        : (initialOpenedProjectBaseline
            ? clone(initialOpenedProjectBaseline)
            : (activeSavedProjectId === id && activeSavedProjectData
                ? clone(activeSavedProjectData)
                : (localStorageAvailable ? await getStoredProjectData(id).catch(() => null) : null)));

      cancelPendingProjectSave(id);
      if (activeSavePromise) {
        try { await activeSavePromise; } catch (_) {}
        cancelPendingProjectSave(id);
      }

      if (discardEntireProject) {
        if (!await removeProjectRecord(id, true)) {
          showToast('Не удалось удалить несохранённый проект');
          return;
        }
      } else if (baseline) {
        // Always restore the open-time version. Autosave may already have
        // committed edits to IndexedDB even when no write is currently pending.
        try {
          await persistProjectSnapshot({ id, data: baseline });
        } catch (error) {
          console.warn('Could not restore the saved project baseline after discard:', error);
          reportLocalStorageSaveFailure(error);
          showToast('Не удалось отменить последнее сохранение');
          return;
        }
      } else {
        showToast('Не удалось восстановить исходную версию проекта');
        return;
      }
    }
    completeExitToStartScreen();
  }

  function sanitizeNode(n) {
    const id = String(n && n.id || safeId());
    const type = n && n.type === 'image' ? 'image' : 'text';
    let imageKey = type === 'image'
      ? (typeof (n && n.imageKey) === 'string' && n.imageKey ? n.imageKey : `image:${id}`)
      : '';
    const imageData = type === 'image'
      ? (typeof (n && n.image) === 'string' && n.image
          ? n.image.slice(0, 12000000)
          : (imageStore.get(imageKey) || ''))
      : '';
    // Older imported timelines may contain different image payloads for the same
    // node id. Keep each payload immutable so snapshots never alias the wrong image.
    if (imageData && imageStore.has(imageKey) && imageStore.get(imageKey) !== imageData) {
      imageKey = `image:${id}:${safeId()}`;
    }
    if (imageData) imageStore.set(imageKey, imageData);
    const clean = {
      id,
      x: clamp(Number(n && n.x) || 0, 0, 100000),
      y: clamp(Number(n && n.y) || 0, 0, 100000),
      text: String(n && n.text || '').slice(0, 10000),
      width: clamp(Number(n && n.width) || 180, 10, 2000),
      height: clamp(Number(n && n.height) || 42, 10, 1200),
      fontSize: clamp(Number(n && n.fontSize) || 16, 8, 80),
      autoSize: !n || n.autoSize !== false,
      color: typeof (n && n.color) === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.color.trim()) ? n.color.trim().toLowerCase() : '#111111',
      underline: !!(n && n.underline),
      highlight: !!(n && n.highlight),
      framed: type === 'text' && !!(n && n.framed),
      borderColor: typeof (n && n.borderColor) === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.borderColor.trim())
        ? n.borderColor.trim().toLowerCase()
        : '#111111',
      type,
      image: imageData,
      imageKey: imageData ? imageKey : '',
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
      toSide: validSide(e.toSide) ? e.toSide : 'left',
      style: ['curved', 'straight', 'square', 'dashed'].includes(e.style) ? e.style : 'curved',
      color: typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color.toLowerCase() : '#171717',
      bidirectional: e.bidirectional === true,
      arrowhead: e.arrowhead !== false
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

  function scheduleActiveEditorVisibilityCheck() {
    if (editorVisibilityRaf || !workspace) return;
    editorVisibilityRaf = requestAnimationFrame(() => {
      editorVisibilityRaf = 0;
      if (!editingId || workspace.classList.contains('panning') || workspace.classList.contains('pinching')) return;
      const editor = document.activeElement;
      if (!(editor instanceof HTMLElement) || !editor.matches('.node-text[contenteditable="true"]')) return;
      const nodeElement = editor.closest('.node[data-node-id]');
      if (!nodeElement || !nodeElement.isConnected) return;
      if (!window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) return;

      const workspaceRect = workspace.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const visualTop = visualViewport ? visualViewport.offsetTop : 0;
      const visualBottom = visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight;
      const visibleTop = Math.max(workspaceRect.top + 10, visualTop + 8);
      const visibleBottom = Math.min(workspaceRect.bottom - 8, visualBottom - 12);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      if (visibleHeight < 80) return;

      const nodeRect = nodeElement.getBoundingClientRect();
      const preferredTop = visibleTop + Math.min(26, visibleHeight * 0.08);
      const upperBandBottom = visibleTop + visibleHeight * 0.42;
      let delta = 0;

      // Keep the active editor near the upper part of the remaining visual
      // viewport, especially after iOS/Android shrink it for the soft keyboard.
      if (nodeRect.top > upperBandBottom || nodeRect.bottom > visibleBottom) {
        delta = nodeRect.top - preferredTop;
      } else if (nodeRect.top < visibleTop) {
        delta = nodeRect.top - visibleTop;
      }
      if (Math.abs(delta) < 7) return;

      const maxScrollTop = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
      const targetScrollTop = clamp(workspace.scrollTop + delta, 0, maxScrollTop);
      if (Math.abs(targetScrollTop - workspace.scrollTop) < 7) return;
      if (lastEditorScrollTarget !== null && Math.abs(lastEditorScrollTarget - targetScrollTop) < 8) return;

      lastEditorScrollTarget = targetScrollTop;
      workspace.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      if (editorScrollResetTimer) window.clearTimeout(editorScrollResetTimer);
      editorScrollResetTimer = window.setTimeout(() => {
        editorScrollResetTimer = 0;
        lastEditorScrollTarget = null;
      }, 650);
    });
  }

  function setMode(next) {
    if (presentationMode) return;
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

  function enterPresentationMode() {
    if (presentationMode || (startScreen && startScreen.classList.contains('visible'))) return;
    closeImageLightbox();

    // Close/finalize any editor or transient UI before switching to the read-only view.
    if (playback.active) exitPlayback();
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (editingId) {
      const activeId = editingId;
      finishEditing(activeId, true);
      // finishEditing intentionally keeps a just-created empty node alive for mobile focus recovery.
      // Presentation mode is an explicit transition, so detach that empty editor safely.
      if (editingId === activeId) {
        const activeNode = nodeById(activeId);
        if (activeNode && !String(activeNode.text || '').trim()) {
          scene.nodes = scene.nodes.filter(node => node.id !== activeId);
          scene.edges = scene.edges.filter(edge => edge.from !== activeId && edge.to !== activeId);
          const invalidBookmarkSlots = pruneInvalidCameraBookmarks(scene.nodes);
          updateCameraBookmarksUI();
          if (invalidBookmarkSlots.length) saveProject();
        }
        editingId = null;
        editingOriginalText = null;
        shouldFocusNewNode = false;
      }
    }

    closeNodeContextMenu();
    closeProjectActionsMenu();
    if (mainArea && mainArea.classList.contains('project-notes-open')) setProjectNotesOpen(false);
    if (modalBackdrop && modalBackdrop.classList.contains('visible')) closeConfirm(false);
    if (projectRenameBackdrop && projectRenameBackdrop.classList.contains('visible')) closeRenameProjectModal();
    if (projectDeleteBackdrop && projectDeleteBackdrop.classList.contains('visible')) closeDeleteProjectModal();
    if (exitConfirmBackdrop && exitConfirmBackdrop.classList.contains('visible')) closeExitConfirm();
    if (exportScreen) exportScreen.classList.remove('visible');

    presentationPreviousState = {
      mode,
      selectedId,
      selectedIds: [...selectedIds],
      selectedEdgeIds: [...selectedEdgeIds]
    };

    // Remove all editing/selection affordances while keeping the graph and camera intact.
    mode = 'select';
    connectionSourceId = null;
    linkDraft = null;
    selectedId = null;
    selectedIds.splice(0);
    selectedEdgeIds.splice(0);
    clearLongPress();
    activeTouchPointers.clear();
    pinchState = null;
    workspace.classList.remove('pinching');
    presentationMode = true;
    document.body.classList.add('presentation-mode');
    if (presentationModeBtn) {
      presentationModeBtn.setAttribute('aria-pressed', 'true');
      presentationModeBtn.setAttribute('aria-label', 'Выйти из режима презентации');
    }
    if (presentationExitBtn) presentationExitBtn.hidden = false;
    syncModeButtons();
    renderScene();
    stage.style.cursor = 'grab';
    workspace.style.cursor = 'grab';
  }

  function exitPresentationMode() {
    if (!presentationMode) return;
    presentationMode = false;
    document.body.classList.remove('presentation-mode');
    if (presentationExitBtn) presentationExitBtn.hidden = true;
    if (presentationModeBtn) {
      presentationModeBtn.setAttribute('aria-pressed', 'false');
      presentationModeBtn.setAttribute('aria-label', 'Включить режим презентации');
    }

    const previous = presentationPreviousState;
    presentationPreviousState = null;
    const validNodeIds = new Set(scene.nodes.map(node => node.id));
    const validEdgeIds = new Set(scene.edges.map(edge => edge.id));
    const restoredMode = previous && ['select', 'text', 'connect'].includes(previous.mode)
      ? previous.mode
      : 'select';

    // Reuse the regular mode setup so cursor and mode-button states stay consistent.
    setMode(restoredMode);
    if (previous) {
      selectedId = previous.selectedId && validNodeIds.has(previous.selectedId) ? previous.selectedId : null;
      selectedIds.splice(0, selectedIds.length, ...previous.selectedIds.filter(id => validNodeIds.has(id)));
      selectedEdgeIds.splice(0, selectedEdgeIds.length, ...previous.selectedEdgeIds.filter(id => validEdgeIds.has(id)));
      if (selectedId && !selectedIds.includes(selectedId)) selectedIds.push(selectedId);
    }
    renderScene();
    updateActionButtons();
  }

  function getStagePoint(event) {
    // getBoundingClientRect() already includes the current workspace scroll and
    // transformed stage offset. Dividing by zoom converts viewport pixels back
    // to the stage's local scene coordinates without changing camera position.
    const rect = stage.getBoundingClientRect();
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return {
      x: Math.max(0, (event.clientX - rect.left) / safeZoom),
      y: Math.max(0, (event.clientY - rect.top) / safeZoom)
    };
  }
  function syncZoomLayout(baseWidth, baseHeight) {
    const left = `${CANVAS_PAD * zoom}px`;
    const top = `${CANVAS_PAD * zoom}px`;
    const transform = `translateZ(0) scale(${zoom})`;
    const worldWidth = `${(baseWidth + CANVAS_PAD * 2) * zoom}px`;
    const worldHeight = `${(baseHeight + CANVAS_PAD * 2) * zoom}px`;
    if (stage.style.left !== left) stage.style.left = left;
    if (stage.style.top !== top) stage.style.top = top;
    if (stage.style.transform !== transform) stage.style.transform = transform;
    if (world.style.width !== worldWidth) world.style.width = worldWidth;
    if (world.style.height !== worldHeight) world.style.height = worldHeight;
    zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
  }

  function getCameraView() {
    const safeZoom = Math.max(.0001, Number(zoom) || 1);
    return {
      x: (workspace.scrollLeft + workspace.clientWidth / 2) / safeZoom - CANVAS_PAD,
      y: (workspace.scrollTop + workspace.clientHeight / 2) / safeZoom - CANVAS_PAD,
      zoom: safeZoom
    };
  }

  function cancelCameraFlight() {
    cameraFlightToken += 1;
    if (cameraFlightRaf) cancelAnimationFrame(cameraFlightRaf);
    cameraFlightRaf = 0;
    workspace?.classList.remove('camera-flying');
  }

  function applyCameraView(centerX, centerY, nextZoom) {
    const next = clamp(Number(nextZoom) || 1, .25, 2.5);
    zoom = next;
    const baseWidth = Math.max(
      (workspace.clientWidth || 1000) / zoom,
      1200,
      Math.ceil(stageContentBounds.maxX + 500)
    );
    const baseHeight = Math.max(
      (workspace.clientHeight || 700) / zoom,
      800,
      Math.ceil(stageContentBounds.maxY + 400)
    );
    const widthValue = `${baseWidth}px`;
    const heightValue = `${baseHeight}px`;
    if (stage.style.width !== widthValue) stage.style.width = widthValue;
    if (stage.style.height !== heightValue) stage.style.height = heightValue;
    syncZoomLayout(baseWidth, baseHeight);
    if (renderedConnectionsSvg) {
      const svgWidth = String(Math.max(baseWidth, 1));
      const svgHeight = String(Math.max(baseHeight, 1));
      if (renderedConnectionsSvg.getAttribute('width') !== svgWidth) renderedConnectionsSvg.setAttribute('width', svgWidth);
      if (renderedConnectionsSvg.getAttribute('height') !== svgHeight) renderedConnectionsSvg.setAttribute('height', svgHeight);
    }
    workspace.scrollLeft = Math.max(0, (centerX + CANVAS_PAD) * zoom - workspace.clientWidth / 2);
    workspace.scrollTop = Math.max(0, (centerY + CANVAS_PAD) * zoom - workspace.clientHeight / 2);
    scheduleViewportCulling();
  }

  function flushPendingCameraInput() {
    if (pendingViewportPan) flushPendingViewportPan();
    if (pendingViewportZoom) {
      const queuedZoom = pendingViewportZoom;
      pendingViewportZoom = null;
      applyZoom(queuedZoom.nextZoom, queuedZoom.clientX, queuedZoom.clientY, queuedZoom.anchorWorldPoint);
    }
  }

  function updateCameraBookmarksUI() {
    if (!cameraBookmarksPanel) return;
    ['1', '2', '3'].forEach(slot => {
      const item = cameraBookmarksPanel.querySelector(`[data-camera-slot="${slot}"]`);
      const goButton = item?.querySelector('[data-camera-go]');
      const clearButton = item?.querySelector('[data-camera-clear]');
      if (!item || !goButton || !clearButton) return;
      const bookmark = cameraState.bookmarks[slot];
      const node = bookmark ? nodeById(bookmark.nodeId) : null;
      const nodeLabel = node
        ? (node.type === 'image' ? 'изображение' : (String(node.text || '').trim().replace(/\s+/g, ' ').slice(0, 42) || 'текстовый узел'))
        : '';
      const bookmarkLabel = node
        ? (node.type === 'image'
          ? 'Изображение'
          : (nodeLabel.length > 22 ? nodeLabel.slice(0, 21) + '…' : nodeLabel))
        : `Сохранить · Ctrl+${slot}`;
      const labelElement = item.querySelector('.camera-bookmark-label');
      if (labelElement) labelElement.textContent = bookmarkLabel;
      item.classList.toggle('is-set', !!bookmark);
      goButton.classList.toggle('is-set', !!bookmark);
      goButton.title = bookmark
        ? `Перейти к закладке ${slot}: ${nodeLabel} (клавиша ${slot})`
        : `Сохранить обзор в слот ${slot} (Ctrl+${slot})`;
      goButton.setAttribute('aria-label', bookmark
        ? `Закладка камеры ${slot} привязана к узлу «${nodeLabel}»: перейти к нему`
        : `Закладка камеры ${slot} пуста: сохранить обзор`);
      clearButton.hidden = !bookmark;
    });
  }

  function saveCameraBookmark(slot) {
    const key = String(slot);
    if (!['1', '2', '3'].includes(key)) return false;
    cancelCameraFlight();
    // Consume queued wheel/pinch input so this captures the latest requested view.
    flushPendingCameraInput();
    const cameraView = getCameraView();
    const selectedNode = (selectedId && nodeById(selectedId)) ||
      [...selectedIds].reverse().map(id => nodeById(id)).find(Boolean) || null;
    const anchorNode = selectedNode || findNearestCameraBookmarkNode(cameraView);
    if (!anchorNode) {
      showToast('На холсте пока нет узлов для привязки закладки');
      return false;
    }
    const center = getCameraBookmarkNodeCenter(anchorNode);
    cameraState.bookmarks[key] = {
      x: center.x,
      y: center.y,
      zoom: cameraView.zoom,
      nodeId: anchorNode.id
    };
    updateCameraBookmarksUI();
    saveProject();
    const label = anchorNode.type === 'image'
      ? 'изображению'
      : `«${String(anchorNode.text || '').trim().replace(/\s+/g, ' ').slice(0, 30) || 'узлу'}»`;
    showToast(`Закладка ${key} привязана к ${label}`);
    return true;
  }

  function clearCameraBookmark(slot, message = null) {
    const key = String(slot);
    if (!['1', '2', '3'].includes(key) || !cameraState.bookmarks[key]) return false;
    cancelCameraFlight();
    cameraState.bookmarks[key] = null;
    updateCameraBookmarksUI();
    if (hasProjectContent()) saveProject();
    else if (currentProjectId) void deleteEmptyProject(currentProjectId);
    showToast(message || `Закладка ${key} очищена`);
    return true;
  }

  function flyToCameraBookmark(slot) {
    const key = String(slot);
    const target = cameraState.bookmarks[key];
    if (!target) return false;
    const anchorNode = target.nodeId ? nodeById(target.nodeId) : null;
    if (!anchorNode) {
      clearCameraBookmark(key, `Закладка ${key} сброшена: привязанный узел удалён`);
      return false;
    }

    cancelCameraFlight();
    flushPendingCameraInput();
    const token = cameraFlightToken;
    const startView = getCameraView();
    const anchorCenter = getCameraBookmarkNodeCenter(anchorNode);
    const targetView = {
      x: anchorCenter.x,
      y: anchorCenter.y,
      zoom: target.zoom
    };
    const startedAt = performance.now();
    workspace.classList.add('camera-flying');
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 140 : 760;
    const easeOutCubic = progress => 1 - Math.pow(1 - progress, 3);

    const animate = now => {
      if (token !== cameraFlightToken) return;
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = easeOutCubic(progress);
      const x = startView.x + (targetView.x - startView.x) * eased;
      const y = startView.y + (targetView.y - startView.y) * eased;
      const nextZoom = startView.zoom + (targetView.zoom - startView.zoom) * eased;
      applyCameraView(x, y, progress >= 1 ? targetView.zoom : nextZoom);
      if (progress < 1) {
        cameraFlightRaf = requestAnimationFrame(animate);
      } else {
        cameraFlightRaf = 0;
        workspace.classList.remove('camera-flying');
      }
    };

    cameraFlightRaf = requestAnimationFrame(animate);
    return true;
  }
  function scheduleViewportFrame() {
    if (isTicking) return;
    isTicking = true;
    requestAnimationFrame(() => {
      isTicking = false;

      // Apply the latest pan position first. If zoom is also pending, its focal
      // point is then calculated from the most recent scroll position.
      flushPendingViewportPan();

      const zoomRequest = pendingViewportZoom;
      pendingViewportZoom = null;
      if (zoomRequest) {
        applyZoom(
          zoomRequest.nextZoom,
          zoomRequest.clientX,
          zoomRequest.clientY,
          zoomRequest.anchorWorldPoint
        );
      }

      if (pendingViewportPan || pendingViewportZoom) scheduleViewportFrame();
    });
  }

  function flushPendingViewportPan() {
    const pan = pendingViewportPan;
    pendingViewportPan = null;
    if (!pan) return;
    workspace.scrollLeft = pan.left;
    workspace.scrollTop = pan.top;
    scheduleViewportCulling();
  }

  function setZoom(nextZoom, clientX, clientY, anchorWorldPoint = null) {
    // Clamp before storing so rapid opposite wheel events accumulate from a
    // valid target even when the previous pending event reached a zoom limit.
    pendingViewportZoom = {
      nextZoom: clamp(nextZoom, .25, 2.5),
      clientX,
      clientY,
      anchorWorldPoint
    };
    scheduleViewportFrame();
  }

  function applyZoom(nextZoom, clientX, clientY, anchorWorldPoint = null) {
    const next = clamp(nextZoom, .25, 2.5);
    if (Math.abs(next - zoom) < .001) return;
    const rect = workspace.getBoundingClientRect();
    const offsetX = (clientX ?? (rect.left + rect.width / 2)) - rect.left;
    const offsetY = (clientY ?? (rect.top + rect.height / 2)) - rect.top;
    const worldX = anchorWorldPoint ? anchorWorldPoint.x : (workspace.scrollLeft + offsetX) / zoom;
    const worldY = anchorWorldPoint ? anchorWorldPoint.y : (workspace.scrollTop + offsetY) / zoom;
    zoom = next;
    // Zooming only transforms the existing stage. Rebuilding every node and SVG path
    // on each wheel tick made large graphs unnecessarily expensive.
    // Bounds are cached during full scene renders and extended only by moved
    // nodes, avoiding an O(N) graph scan on every zoom frame.
    const maxX = stageContentBounds.maxX;
    const maxY = stageContentBounds.maxY;
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
    scheduleViewportCulling();
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
  function chooseSides(a, b, preferredFromSide = null, cachedGeometry = null) {
    const ea = renderedNodeElements.get(a.id);
    const eb = renderedNodeElements.get(b.id);
    const aGeometry = cachedGeometry && cachedGeometry.a;
    const bGeometry = cachedGeometry && cachedGeometry.b;
    const aw = aGeometry ? aGeometry.width : (ea ? ea.offsetWidth : a.width);
    const ah = aGeometry ? aGeometry.height : (ea ? ea.offsetHeight : a.height);
    const bw = bGeometry ? bGeometry.width : (eb ? eb.offsetWidth : b.width);
    const bh = bGeometry ? bGeometry.height : (eb ? eb.offsetHeight : b.height);
    const ax = aGeometry && Number.isFinite(aGeometry.x) ? aGeometry.x : a.x;
    const ay = aGeometry && Number.isFinite(aGeometry.y) ? aGeometry.y : a.y;
    const bx = bGeometry && Number.isFinite(bGeometry.x) ? bGeometry.x : b.x;
    const by = bGeometry && Number.isFinite(bGeometry.y) ? bGeometry.y : b.y;
    const dx = (bx + bw / 2) - (ax + aw / 2);
    const dy = (by + bh / 2) - (ay + ah / 2);

    const oppositeSide = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right'
    };

    // A preferred side is supplied only when the user starts a connection
    // by dragging a specific anchor. All other connections follow geometry.
    if (validSide(preferredFromSide)) {
      return {
        fromSide: preferredFromSide,
        toSide: oppositeSide[preferredFromSide]
      };
    }

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0
        ? { fromSide: 'right', toSide: 'left' }
        : { fromSide: 'left', toSide: 'right' };
    }

    return dy >= 0
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' };
  }

  function edgeSideVector(side) {
    const vectors = {
      top: { x: 0, y: -1 },
      right: { x: 1, y: 0 },
      bottom: { x: 0, y: 1 },
      left: { x: -1, y: 0 }
    };
    return vectors[side] || vectors.right;
  }

  function buildSquareRouteContexts(edges, nodesById, pointForNode) {
    const groups = new Map();
    const getNode = id => nodesById && typeof nodesById.get === 'function'
      ? nodesById.get(id)
      : null;

    edges.forEach(edge => {
      if (edge.style !== 'square' || !validSide(edge.fromSide) || !validSide(edge.toSide)) return;
      const key = `${edge.from}::${edge.fromSide}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    });

    const contexts = new Map();
    const median = values => {
      if (!values.length) return 0;
      const ordered = [...values].sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      return ordered.length % 2
        ? ordered[middle]
        : (ordered[middle - 1] + ordered[middle]) / 2;
    };

    groups.forEach(groupEdges => {
      if (groupEdges.length < 2) return;
      const firstEdge = groupEdges[0];
      const source = getNode(firstEdge.from);
      if (!source) return;

      const sourcePoint = pointForNode(source, firstEdge.fromSide);
      const horizontalSource = firstEdge.fromSide === 'left' || firstEdge.fromSide === 'right';
      const direction = firstEdge.fromSide === 'right' || firstEdge.fromSide === 'bottom' ? 1 : -1;
      const sourceCoordinate = horizontalSource ? sourcePoint.x : sourcePoint.y;
      const outwardDistances = [];

      groupEdges.forEach(edge => {
        const target = getNode(edge.to);
        if (!target) return;
        const targetPoint = pointForNode(target, edge.toSide);
        const targetCoordinate = horizontalSource ? targetPoint.x : targetPoint.y;
        const distance = (targetCoordinate - sourceCoordinate) * direction;
        if (distance > 0.5) outwardDistances.push(distance);
      });

      // One median-based axis is shared by every edge from this parent side.
      // It avoids a different bend point for each child and is less affected
      // by a single unusually distant node than a mean-based calculation.
      const fallbackDistances = groupEdges.map(edge => {
        const target = getNode(edge.to);
        if (!target) return 0;
        const targetPoint = pointForNode(target, edge.toSide);
        const coordinate = horizontalSource ? targetPoint.x : targetPoint.y;
        return Math.abs(coordinate - sourceCoordinate);
      }).filter(distance => distance > 0.5);
      const distanceToBranch = median(outwardDistances.length ? outwardDistances : fallbackDistances);
      const axis = sourceCoordinate + direction * distanceToBranch * 0.5;

      groupEdges.forEach(edge => {
        contexts.set(edge.id, {
          axis,
          horizontalSource,
          fromSide: firstEdge.fromSide,
          siblingCount: groupEdges.length
        });
      });
    });

    return contexts;
  }

  function squarePathPoints(aPoint, bPoint, fromSide, toSide, routeContext = null) {
    const fromVector = edgeSideVector(fromSide);
    const toVector = edgeSideVector(toSide);
    const fromIsHorizontal = fromVector.x !== 0;
    const toIsHorizontal = toVector.x !== 0;

    const compactPoints = points => points.filter((point, index) => {
      if (!index) return true;
      const previous = points[index - 1];
      return Math.abs(point.x - previous.x) > 0.001 || Math.abs(point.y - previous.y) > 0.001;
    });

    if (routeContext && Number.isFinite(routeContext.axis)) {
      const axis = routeContext.axis;
      let points;

      if (fromIsHorizontal) {
        if (toIsHorizontal) {
          // Shared vertical trunk: parent-to-trunk segments overlap exactly,
          // and each child branches horizontally at its own anchor height.
          points = [
            aPoint,
            { x: axis, y: aPoint.y },
            { x: axis, y: bPoint.y },
            bPoint
          ];
        } else {
          // Preserve the same vertical trunk even when a child is attached
          // from its top/bottom. The final short segment approaches that side.
          const sideDirection = toSide === 'top' ? -1 : 1;
          const stub = Math.min(24, Math.max(8, Math.abs(bPoint.y - aPoint.y) * 0.2));
          const branchY = bPoint.y + sideDirection * stub;
          points = [
            aPoint,
            { x: axis, y: aPoint.y },
            { x: axis, y: branchY },
            { x: bPoint.x, y: branchY },
            bPoint
          ];
        }
      } else if (!toIsHorizontal) {
        // Shared horizontal trunk for top/bottom parent branches.
        points = [
          aPoint,
          { x: aPoint.x, y: axis },
          { x: bPoint.x, y: axis },
          bPoint
        ];
      } else {
        // A child connected through its left/right side gets a small approach
        // stub while still branching from the parent's common horizontal rail.
        const sideDirection = toSide === 'left' ? -1 : 1;
        const stub = Math.min(24, Math.max(8, Math.abs(bPoint.x - aPoint.x) * 0.2));
        const branchX = bPoint.x + sideDirection * stub;
        points = [
          aPoint,
          { x: aPoint.x, y: axis },
          { x: branchX, y: axis },
          { x: branchX, y: bPoint.y },
          bPoint
        ];
      }

      return compactPoints(points);
    }

    // For a standalone edge, scale the stubs to the separation along the
    // parent's exit axis. A fixed 24px minimum made close nodes overshoot and
    // created loops or sharp kinks when their anchors were nearly aligned.
    const axisDistance = fromIsHorizontal
      ? Math.abs(bPoint.x - aPoint.x)
      : Math.abs(bPoint.y - aPoint.y);
    const span = Math.max(0, Math.min(
      80,
      Math.max(8, axisDistance * 0.25),
      axisDistance * 0.45
    ));

    const start = {
      x: aPoint.x + fromVector.x * span,
      y: aPoint.y + fromVector.y * span
    };
    const end = {
      x: bPoint.x + toVector.x * span,
      y: bPoint.y + toVector.y * span
    };

    let bends;
    if (fromIsHorizontal && toIsHorizontal) {
      const middleX = (start.x + end.x) / 2;
      bends = [{ x: middleX, y: start.y }, { x: middleX, y: end.y }];
    } else if (!fromIsHorizontal && !toIsHorizontal) {
      const middleY = (start.y + end.y) / 2;
      bends = [{ x: start.x, y: middleY }, { x: end.x, y: middleY }];
    } else if (fromIsHorizontal) {
      bends = [{ x: end.x, y: start.y }];
    } else {
      bends = [{ x: start.x, y: end.y }];
    }

    return compactPoints([aPoint, start, ...bends, end, bPoint]);
  }

  const ARROW_OFFSET = 12;

  function insetEndpointBySide(point, side, offset) {
    if (!point || !offset) return point;
    if (side === 'left') return { x: point.x - offset, y: point.y };
    if (side === 'right') return { x: point.x + offset, y: point.y };
    if (side === 'top') return { x: point.x, y: point.y - offset };
    if (side === 'bottom') return { x: point.x, y: point.y + offset };
    return point;
  }

  function getAxisAlignedEdgePoints(aPoint, bPoint, fromSide, toSide, style = 'curved') {
    if (style !== 'curved' && style !== 'dashed') return null;

    const horizontalSides = side => side === 'left' || side === 'right';
    const verticalSides = side => side === 'top' || side === 'bottom';

    if (horizontalSides(fromSide) && horizontalSides(toSide) &&
        Math.abs(aPoint.y - bPoint.y) <= 1.5) {
      return {
        axis: 'horizontal',
        bPoint: { x: bPoint.x, y: aPoint.y }
      };
    }

    if (verticalSides(fromSide) && verticalSides(toSide) &&
        Math.abs(aPoint.x - bPoint.x) <= 1.5) {
      return {
        axis: 'vertical',
        bPoint: { x: aPoint.x, y: bPoint.y }
      };
    }

    return null;
  }

  function edgeRouteFor(aPoint, bPoint, fromSide, toSide, style = 'curved', routeContext = null) {
    if (style === 'straight') {
      return { type: 'line', points: [aPoint, bPoint] };
    }
    if (style === 'square') {
      return { type: 'polyline', points: squarePathPoints(aPoint, bPoint, fromSide, toSide, routeContext) };
    }

    // Both curved and dashed use the same cubic Bézier geometry.
    const curve = Math.max(28, Math.min(110,
      Math.max(Math.abs(bPoint.x - aPoint.x), Math.abs(bPoint.y - aPoint.y)) * 0.42));
    let c1x = aPoint.x, c1y = aPoint.y, c2x = bPoint.x, c2y = bPoint.y;
    if (fromSide === 'right') c1x += curve;
    if (fromSide === 'left') c1x -= curve;
    if (fromSide === 'top') c1y -= curve;
    if (fromSide === 'bottom') c1y += curve;
    if (toSide === 'right') c2x += curve;
    if (toSide === 'left') c2x -= curve;
    if (toSide === 'top') c2y -= curve;
    if (toSide === 'bottom') c2y += curve;
    return {
      type: 'bezier',
      c1: { x: c1x, y: c1y },
      c2: { x: c2x, y: c2y }
    };
  }

  function pathFor(aPoint, bPoint, fromSide, toSide, style = 'curved', routeContext = null, appendArrowEnd = false, appendArrowStart = false) {
    const axisAlignment = getAxisAlignedEdgePoints(aPoint, bPoint, fromSide, toSide, style);
    if (axisAlignment) {
      const startLeadPoint = appendArrowStart
        ? insetEndpointBySide(aPoint, fromSide, -4.5)
        : aPoint;
      const endLeadPoint = appendArrowEnd
        ? insetEndpointBySide(axisAlignment.bPoint, toSide, -4.5)
        : axisAlignment.bPoint;
      return `M ${startLeadPoint.x} ${startLeadPoint.y} L ${endLeadPoint.x} ${endLeadPoint.y}`;
    }

    const route = edgeRouteFor(aPoint, bPoint, fromSide, toSide, style, routeContext);
    if (route.type === 'line') {
      return `M ${aPoint.x} ${aPoint.y} L ${bPoint.x} ${bPoint.y}`;
    }
    if (route.type === 'polyline') {
      return route.points.map((point, index) =>
        `${index ? 'L' : 'M'} ${point.x} ${point.y}`
      ).join(' ');
    }

    // The Bézier stops 12px before the node. A short straight lead continues
    // along the side normal to the 7.5px arrow-base position. Mirror it at the
    // source for bidirectional arrows so the curve never bends through a tip.
    const startLeadPoint = appendArrowStart
      ? insetEndpointBySide(aPoint, fromSide, -4.5)
      : aPoint;
    const endLeadPoint = appendArrowEnd
      ? insetEndpointBySide(bPoint, toSide, -4.5)
      : bPoint;
    let d = `M ${startLeadPoint.x} ${startLeadPoint.y}`;
    if (appendArrowStart) d += ` L ${aPoint.x} ${aPoint.y}`;
    d += ` C ${route.c1.x} ${route.c1.y}, ${route.c2.x} ${route.c2.y}, ${bPoint.x} ${bPoint.y}`;
    if (appendArrowEnd) d += ` L ${endLeadPoint.x} ${endLeadPoint.y}`;
    return d;
  }

  function addResizeHandles(element, nodeId) {
    ['nw', 'ne', 'sw', 'se'].forEach(handle => {
      const control = document.createElement('span');
      control.className = `resize-handle ${handle}`;
      control.setAttribute('aria-label', 'Изменить размер');
      control?.addEventListener('pointerdown', event => startResize(event, nodeId, handle));
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
      anchor?.addEventListener('pointerdown', event => {
        if (presentationMode) return;
        // On compact nodes the 44px anchor and corner-resize hit areas can
        // geometrically overlap. Route a press to the nearest control so both
        // connection dragging and resizing remain practical on touch screens.
        if (window.matchMedia('(max-width: 767px)').matches && mode === 'select') {
          const rect = element.getBoundingClientRect();
          const anchorPoint = side === 'top'
            ? { x: rect.left + rect.width / 2, y: rect.top }
            : side === 'right'
              ? { x: rect.right, y: rect.top + rect.height / 2 }
              : side === 'bottom'
                ? { x: rect.left + rect.width / 2, y: rect.bottom }
                : { x: rect.left, y: rect.top + rect.height / 2 };
          const corners = [
            { handle: 'nw', x: rect.left, y: rect.top },
            { handle: 'ne', x: rect.right, y: rect.top },
            { handle: 'sw', x: rect.left, y: rect.bottom },
            { handle: 'se', x: rect.right, y: rect.bottom }
          ];
          const anchorDistance = Math.hypot(event.clientX - anchorPoint.x, event.clientY - anchorPoint.y);
          const nearestCorner = corners
            .map(corner => ({ ...corner, distance: Math.hypot(event.clientX - corner.x, event.clientY - corner.y) }))
            .sort((a, b) => a.distance - b.distance)[0];
          if (nearestCorner && nearestCorner.distance < anchorDistance) {
            startResize(event, nodeId, nearestCorner.handle);
            return;
          }
        }
        startLink(event, nodeId, side);
      });
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

      const mobileTouchLayout = window.matchMedia('(max-width: 767px)').matches;
      // Keep both touch-friendly controls available on the selected mobile node:
      // corner handles resize it, while side anchors start a connection drag.
      const showResizeHandles = !isPlayback && id === selectedId && id !== editingId &&
        (!mobileTouchLayout || (mode === 'select' && !linkDraft));
      if (showResizeHandles) addResizeHandles(element, id);
      const canShowAnchors = !isPlayback && id !== editingId &&
        (id === selectedId || (!!linkDraft && id !== linkDraft.fromId)) &&
        (!mobileTouchLayout || mode === 'connect' || (mode === 'select' && id === selectedId) || !!linkDraft);
      if (canShowAnchors) addNodeAnchors(element, id);
    });
  }

  function refreshEdgeSelectionDecorations(model = scene, isPlayback = playback.active) {
    const selected = new Set(isPlayback ? [] : selectedEdgeIds);
    renderedEdgeElements.forEach((entry, id) => {
      if (entry && entry.line) entry.line.classList.toggle('selected', selected.has(id));
    });
  }

  function suppressImmediateDraggedLinkClick(timeout = 0) {
    // A browser may emit click after pointerup even though the user dragged the node.
    // Catch only that immediate click in capture phase; auto-remove the guard if no click follows.
    const suppressClick = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('a.node-link')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener('click', suppressClick, true);
    };

    document?.addEventListener('click', suppressClick, true);
    window.setTimeout(() => {
      document.removeEventListener('click', suppressClick, true);
    }, Math.max(0, timeout));
  }

  // Insert clipboard/drag text as text nodes only. Never let the browser parse
  // clipboard HTML inside the editable graph node (DOM-XSS protection).
  function getEditorSelectionRange(editor) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const currentRange = selection.getRangeAt(0);
      if (editor.contains(currentRange.commonAncestorContainer)) return currentRange.cloneRange();
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function getEditorDropRange(editor, clientX, clientY) {
    let range = null;
    if (typeof document.caretRangeFromPoint === 'function') {
      range = document.caretRangeFromPoint(clientX, clientY);
    } else if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(clientX, clientY);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }
    if (range && editor.contains(range.startContainer)) return range;
    return getEditorSelectionRange(editor);
  }

  function insertPlainTextIntoEditor(editor, value, inputType, range = null) {
    if (!(editor instanceof HTMLElement) || !editor.matches('.node-text[contenteditable="true"]')) return false;
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!text) return false;

    const insertionRange = range || getEditorSelectionRange(editor);
    if (!editor.contains(insertionRange.commonAncestorContainer) && insertionRange.commonAncestorContainer !== editor) {
      return false;
    }

    insertionRange.deleteContents();
    const fragment = document.createDocumentFragment();
    const lines = text.split('\n');
    let lastInserted = null;
    lines.forEach((line, index) => {
      if (line) {
        lastInserted = document.createTextNode(line);
        fragment.appendChild(lastInserted);
      }
      if (index < lines.length - 1) {
        lastInserted = document.createElement('br');
        fragment.appendChild(lastInserted);
      }
    });
    if (!lastInserted) return false;

    insertionRange.insertNode(fragment);
    insertionRange.setStartAfter(lastInserted);
    insertionRange.collapse(true);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(insertionRange);
    }

    // A synthetic input event keeps the existing model-sync/save listener in use.
    // The inserted fragment contains only Text and BR nodes, never parsed HTML.
    let inputEvent;
    try {
      inputEvent = new InputEvent('input', {
        bubbles: true,
        inputType: inputType || 'insertText',
        data: text
      });
    } catch (_) {
      inputEvent = new Event('input', { bubbles: true });
    }
    editor.dispatchEvent(inputEvent);
    return true;
  }

  function bindSafeEditorTransferHandlers(editor) {
    editor.addEventListener('paste', event => {
      // Cancel native rich-HTML insertion even when the clipboard has no plain-text fallback.
      event.preventDefault();
      const clipboard = event.clipboardData;
      const plainText = clipboard ? clipboard.getData('text/plain') : '';
      if (plainText) insertPlainTextIntoEditor(editor, plainText, 'insertFromPaste');
    });

    editor.addEventListener('dragover', event => {
      // Make text drops available, while disabling the browser's native HTML drop behavior.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });

    editor.addEventListener('drop', event => {
      // Never allow dropped text/html or files to be interpreted as editable DOM markup.
      event.preventDefault();
      const transfer = event.dataTransfer;
      if (!transfer) return;
      const plainText = transfer.getData('text/plain') || transfer.getData('text');
      if (!plainText) return;
      const range = getEditorDropRange(editor, event.clientX, event.clientY);
      insertPlainTextIntoEditor(editor, plainText, 'insertFromDrop', range);
    });
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
      anchor?.addEventListener('click', event => {
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

  function addViewportIndexItem(grid, largeIds, id, left, top, right, bottom) {
    const cellSize = VIEWPORT_GRID_CELL_SIZE;
    const minCol = Math.floor(left / cellSize);
    const maxCol = Math.floor(right / cellSize);
    const minRow = Math.floor(top / cellSize);
    const maxRow = Math.floor(bottom / cellSize);
    const cellCount = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    // Very large nodes/edges are rare; keep them in a short overflow set rather
    // than inserting the same ID into hundreds of cells.
    if (cellCount > 64) {
      largeIds.add(id);
      return;
    }
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = `${col}:${row}`;
        let bucket = grid.get(key);
        if (!bucket) grid.set(key, bucket = new Set());
        bucket.add(id);
      }
    }
  }

  function queryViewportIndex(grid, largeIds, left, top, right, bottom) {
    const result = new Set(largeIds);
    const cellSize = VIEWPORT_GRID_CELL_SIZE;
    const minCol = Math.floor(left / cellSize);
    const maxCol = Math.floor(right / cellSize);
    const minRow = Math.floor(top / cellSize);
    const maxRow = Math.floor(bottom / cellSize);
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = grid.get(`${col}:${row}`);
        if (bucket) bucket.forEach(id => result.add(id));
      }
    }
    return result;
  }

  function rebuildViewportSpatialIndexes() {
    viewportNodeGrid.clear();
    viewportEdgeGrid.clear();
    viewportLargeNodeIds.clear();
    viewportLargeEdgeIds.clear();
    viewportNodeBounds.clear();
    viewportEdgeBounds.clear();

    renderedNodeModels.forEach((node, id) => {
      const element = renderedNodeElements.get(id);
      const width = Math.max(10, Number(node.width) || (element && element.offsetWidth) || 10);
      const height = Math.max(10, Number(node.height) || (element && element.offsetHeight) || 10);
      const bounds = { left: node.x, top: node.y, right: node.x + width, bottom: node.y + height };
      viewportNodeBounds.set(id, bounds);
      addViewportIndexItem(
        viewportNodeGrid, viewportLargeNodeIds, id,
        bounds.left, bounds.top, bounds.right, bounds.bottom
      );
    });

    renderedEdgeElements.forEach((bundle, id) => {
      const edge = bundle && bundle.edge;
      const from = edge && renderedNodeModels.get(edge.from);
      const to = edge && renderedNodeModels.get(edge.to);
      if (!from || !to) return;
      const fromEl = renderedNodeElements.get(from.id);
      const toEl = renderedNodeElements.get(to.id);
      const fromW = Math.max(10, Number(from.width) || (fromEl && fromEl.offsetWidth) || 10);
      const fromH = Math.max(10, Number(from.height) || (fromEl && fromEl.offsetHeight) || 10);
      const toW = Math.max(10, Number(to.width) || (toEl && toEl.offsetWidth) || 10);
      const toH = Math.max(10, Number(to.height) || (toEl && toEl.offsetHeight) || 10);
      // The rectangle between both endpoint boxes conservatively contains
      // curved and orthogonal paths, including their control/approach segments.
      const routePadding = 96;
      const bounds = {
        left: Math.min(from.x, to.x) - routePadding,
        top: Math.min(from.y, to.y) - routePadding,
        right: Math.max(from.x + fromW, to.x + toW) + routePadding,
        bottom: Math.max(from.y + fromH, to.y + toH) + routePadding
      };
      viewportEdgeBounds.set(id, bounds);
      addViewportIndexItem(
        viewportEdgeGrid, viewportLargeEdgeIds, id,
        bounds.left, bounds.top, bounds.right, bounds.bottom
      );
    });

    // All newly rendered items start visible; the first cull pass hides the
    // off-screen subset using a delta update rather than touching every item.
    visibleViewportNodeIds = new Set(renderedNodeElements.keys());
    visibleViewportEdgeIds = new Set(renderedEdgeElements.keys());
  }

  function filterViewportCandidates(candidateIds, boundsIndex, left, top, right, bottom) {
    const visibleIds = new Set();
    candidateIds.forEach(id => {
      const bounds = boundsIndex.get(id);
      if (!bounds || (
        bounds.right >= left && bounds.left <= right &&
        bounds.bottom >= top && bounds.top <= bottom
      )) visibleIds.add(id);
    });
    return visibleIds;
  }

  function updateViewportCulling() {
    if (!workspace || !workspace.clientWidth || !workspace.clientHeight) return;
    if (!renderedNodeElements.size && !renderedEdgeElements.size) return;
    const scale = Math.max(0.01, Number(zoom) || 1);
    const margin = 300 / scale;
    // Stage is offset from the world's top-left by CANVAS_PAD at every zoom level.
    const viewLeft = workspace.scrollLeft / scale - CANVAS_PAD;
    const viewTop = workspace.scrollTop / scale - CANVAS_PAD;
    const viewRight = (workspace.scrollLeft + workspace.clientWidth) / scale - CANVAS_PAD;
    const viewBottom = (workspace.scrollTop + workspace.clientHeight) / scale - CANVAS_PAD;
    const left = viewLeft - margin;
    const top = viewTop - margin;
    const right = viewRight + margin;
    const bottom = viewBottom + margin;

    const nextVisibleNodes = filterViewportCandidates(
      queryViewportIndex(viewportNodeGrid, viewportLargeNodeIds, left, top, right, bottom),
      viewportNodeBounds, left, top, right, bottom
    );
    // Keep active edits/selections and the object currently being dragged alive
    // even when its position has moved outside the cell where it was indexed.
    if (editingId) nextVisibleNodes.add(editingId);
    if (selectedId) nextVisibleNodes.add(selectedId);
    selectedIds.forEach(id => nextVisibleNodes.add(id));
    if (drag) {
      if (drag.type === 'move') nextVisibleNodes.add(drag.id);
      else if (drag.type === 'resize') nextVisibleNodes.add(drag.id);
      else if (drag.type === 'moveSelection') drag.ids.forEach(item => nextVisibleNodes.add(item.id));
    }

    // Only mutate visibility when an item's state changes. Off-screen nodes are
    // retained in the DOM (so geometry/editing stays stable) but skipped by paint.
    visibleViewportNodeIds.forEach(id => {
      if (nextVisibleNodes.has(id)) return;
      const element = renderedNodeElements.get(id);
      if (element) element.style.visibility = 'hidden';
    });
    nextVisibleNodes.forEach(id => {
      if (visibleViewportNodeIds.has(id)) return;
      const element = renderedNodeElements.get(id);
      if (element) element.style.visibility = 'visible';
    });
    visibleViewportNodeIds = nextVisibleNodes;

    const nextVisibleEdges = filterViewportCandidates(
      queryViewportIndex(viewportEdgeGrid, viewportLargeEdgeIds, left, top, right, bottom),
      viewportEdgeBounds, left, top, right, bottom
    );
    if (drag) {
      const movedIds = drag.type === 'move' || drag.type === 'resize'
        ? [drag.id]
        : (drag.type === 'moveSelection' ? drag.ids.map(item => item.id) : []);
      movedIds.forEach(nodeId => (renderedNodeToEdges.get(nodeId) || []).forEach(edgeId => nextVisibleEdges.add(edgeId)));
    }
    selectedEdgeIds.forEach(id => nextVisibleEdges.add(id));
    visibleViewportEdgeIds.forEach(id => {
      if (nextVisibleEdges.has(id)) return;
      const bundle = renderedEdgeElements.get(id);
      if (bundle) {
        bundle.hit.style.visibility = 'hidden';
        bundle.line.style.visibility = 'hidden';
      }
    });
    nextVisibleEdges.forEach(id => {
      if (visibleViewportEdgeIds.has(id)) return;
      const bundle = renderedEdgeElements.get(id);
      if (bundle) {
        bundle.hit.style.visibility = 'visible';
        bundle.line.style.visibility = 'visible';
      }
    });
    visibleViewportEdgeIds = nextVisibleEdges;
  }

  function scheduleViewportCulling() {
    if (viewportCullRaf) return;
    viewportCullRaf = requestAnimationFrame(() => {
      viewportCullRaf = 0;
      updateViewportCulling();
    });
  }

  function getMobileTextNodeMaxWidth() {
    if (!window.matchMedia('(max-width: 767px)').matches) return null;
    const viewportWidth = workspace.clientWidth || window.innerWidth || 360;
    // Use a tiny outer-width tolerance: fit-content/max-width and fractional
    // font metrics can otherwise wrap the final glyph of a word one pixel early.
    // Keep the node inside the same compact mobile proportion while rounding up
    // instead of flooring away available sub-pixel space.
    const roundingSafetyPx = 4;
    const preferredWidth = Math.ceil(viewportWidth * 0.82) + roundingSafetyPx;
    return Math.max(120, Math.min(420, preferredWidth));
  }

  function renderScene(model = scene, options = {}) {
    if (model !== scene) model = materializeSceneSnapshot(model);
    currentRenderScene = model;
    const isPlayback = !!options.playback;
    if (!isPlayback && model === scene) {
      const validEdgeIds = new Set(model.edges.map(edge => edge.id));
      selectedEdgeIds.splice(0, selectedEdgeIds.length, ...selectedEdgeIds.filter(id => validEdgeIds.has(id)));
    }
    // Drop detached DOM references before rebuilding the render tree.
    renderedNodeElements.clear();
    renderedNodeModels.clear();
    renderedEdgeElements.clear();
    renderedNodeToEdges.clear();
    renderedSquareGroups.clear();
    viewportNodeGrid.clear();
    viewportEdgeGrid.clear();
    viewportNodeBounds.clear();
    viewportEdgeBounds.clear();
    visibleViewportNodeIds.clear();
    visibleViewportEdgeIds.clear();
    renderedConnectionsSvg = null;
    renderedLinkPreviewEl = null;
    const modelNodesById = new Map(model.nodes.map(node => [node.id, node]));
    const mobileTextMaxWidth = getMobileTextNodeMaxWidth();
    const maxX = model.nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
    const maxY = model.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);
    stageContentBounds = { maxX, maxY };
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
      if (!isPlayback && linkDraft && n.id === linkDraft.snapTargetId) {
        el.classList.add('link-snap-target');
      }
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
        imageEl.src = getImageNodeSource(n);
        imageEl?.addEventListener('load', () => {
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
        if (!isPlayback && !presentationMode) {
          const expandButton = document.createElement('button');
          expandButton.type = 'button';
          expandButton.className = 'image-expand-button';
          expandButton.setAttribute('aria-label', 'Открыть изображение');
          expandButton.setAttribute('title', 'Открыть изображение');
          expandButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></svg>';
          expandButton.addEventListener('pointerdown', event => {
            // The overlay button must not bubble into the image node's drag handler.
            event.stopPropagation();
          });
          expandButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            clearImageExpandButtons();
            openImageLightbox(n.id);
          });
          el.appendChild(expandButton);
        }
      } else {
        // On phones, let text nodes size to their contents but cap the line
        // length to the visible workspace. This also clamps legacy fixed-width
        // nodes that were saved on a much wider desktop canvas.
        el.style.width = mobileTextMaxWidth
          ? 'fit-content'
          : (autoSize ? 'max-content' : `${n.width}px`);
        el.style.height = 'auto';
        el.style.maxWidth = mobileTextMaxWidth ? `${mobileTextMaxWidth}px` : 'none';
        el.style.minWidth = mobileTextMaxWidth || autoSize ? '0' : '10px';
        el.style.minHeight = '0';
        el.style.fontSize = `${n.fontSize || 16}px`;
        const nodeColor = typeof n.color === 'string' ? n.color.trim() : '';
        const normalizedNodeColor = nodeColor.toLowerCase();
        const isBaseBlack = !nodeColor || normalizedNodeColor === '#111111' || normalizedNodeColor === '#171717';
        const isDarkTheme = document.body.classList.contains('dark-theme');
        const calculatedColor = isBaseBlack
          ? (isDarkTheme && !n.highlight ? '#f2f2f2' : '#111111')
          : nodeColor;
        el.style.setProperty('color', calculatedColor, 'important');
        if (n.framed) {
          el.classList.add('framed');
          const borderColor = typeof n.borderColor === 'string' && /^#[0-9a-f]{6}$/i.test(n.borderColor)
            ? n.borderColor.toLowerCase()
            : '#111111';
          const isDefaultDarkFrameColor = borderColor === '#111111' || borderColor === '#171717';
          const calculatedBorderColor = isDarkTheme && isDefaultDarkFrameColor ? '#e5e5e5' : borderColor;
          el.style.setProperty('--node-border-color', calculatedBorderColor);
        }
        if (n.underline) el.classList.add('underlined');
        if (n.highlight) el.classList.add('highlight');
        const textSpan = document.createElement('span');
        textSpan.className = 'node-text';
        // Apply the resolved node color directly to the text wrapper as well as its container.
        textSpan.style.setProperty('color', calculatedColor, 'important');
        if (!isPlayback && n.id !== editingId) {
          appendTextWithLinks(textSpan, n.text);
        } else {
          textSpan.textContent = n.text;
        }
        el.appendChild(textSpan);
        let placeholderEl = null;
        if (!isPlayback && n.id === editingId) {
          // Keep a placeholder node for the full editing session so it can
          // appear immediately if the user deletes all text from an existing node.
          placeholderEl = document.createElement('span');
          placeholderEl.className = `node-placeholder${String(n.text || '').trim() ? ' hidden' : ''}`;
          placeholderEl.textContent = 'Введите текст…';
          el.appendChild(placeholderEl);
        }
        if (!isPlayback && n.id === editingId) {
          const targetId = n.id;
          el.classList.add('editing');
          textSpan.contentEditable = 'true';
          textSpan.spellcheck = false;
          textSpan.style.setProperty('-webkit-user-select', 'text');
          textSpan.style.setProperty('user-select', 'text');
          textSpan.style.setProperty('-webkit-touch-callout', 'default');
          textSpan.setAttribute('role', 'textbox');
          textSpan.setAttribute('aria-label', 'Текстовый узел');
          bindSafeEditorTransferHandlers(textSpan);
          textSpan?.addEventListener('input', () => {
            const target = nodeById(targetId);
            const liveText = textSpan.innerText.replace(/\r/g, '').replace(/\n+$/, '');
            if (target) target.text = liveText;
            if (placeholderEl) placeholderEl.classList.toggle('hidden', !!liveText.trim());
            saveProject();
          });
          textSpan?.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEditing(targetId, true); }
            if (event.key === 'Escape') { event.preventDefault(); finishEditing(targetId, false); }
            event.stopPropagation();
          });
          textSpan?.addEventListener('blur', () => {
            // Capture this editor's identity before the delayed callback runs.
            // A later render may replace `n` or the user may already be editing another node.
            const targetId = n.id;
            window.setTimeout(() => {
              if (editingId !== targetId) return;

              const liveNode = nodeById(targetId);
              if (!liveNode) {
                // The node was deleted while the blur timer was pending. Do not
                // commit stale text into another model object or keep a dead editor active.
                editingId = null;
                editingOriginalText = null;
                return;
              }
              if (document.activeElement === textSpan) return;

              const activeElement = document.activeElement;
              if (
                activeElement instanceof Element &&
                activeElement.closest('#nodeContextMenu')
              ) {
                const currentNodeElement = renderedNodeElements.get(targetId) ||
                  stage.querySelector(`[data-node-id="${CSS.escape(targetId)}"]`);
                const currentEditor = currentNodeElement && currentNodeElement.querySelector('.node-text');
                const editorToRestore = currentEditor && currentEditor.isConnected ? currentEditor : textSpan;
                if (!editorToRestore.isConnected) return;
                try { editorToRestore.focus({ preventScroll: true }); } catch (_) { editorToRestore.focus(); }
                placeCaretAtEnd(editorToRestore);
                return;
              }

              const liveText = String(liveNode.text || '').trim();
              const recentlyCreatedEmptyNode = !!(
                liveNode && liveNode.createdAt &&
                Date.now() - liveNode.createdAt < 2000 &&
                !liveText
              );
              if (recentlyCreatedEmptyNode) {
                const liveNodeElement = renderedNodeElements.get(targetId) ||
                  stage.querySelector(`[data-node-id="${CSS.escape(targetId)}"]`);
                const liveEditor = liveNodeElement && liveNodeElement.querySelector('.node-text');
                if (liveEditor && liveEditor.isConnected) {
                  try { liveEditor.focus({ preventScroll: true }); } catch (_) { liveEditor.focus(); }
                  placeCaretAtEnd(liveEditor);
                }
                return;
              }

              finishEditing(targetId, true);
            }, 350);
          });

          // Empty inline spans have no hit area. After a transient blur, tapping
          // the visible node/placeholder must focus the editor again on touch devices.
          el?.addEventListener('pointerdown', event => {
            if (event.button !== 0 || editingId !== n.id) return;
            if (event.target instanceof Element && event.target.closest('a.node-link')) return;

            const clickedText = event.target === textSpan || textSpan.contains(event.target);
            // For populated text, let the browser calculate the exact caret
            // position from the pointer coordinates. For an empty editor or
            // a hit on the node's padding/placeholder, restore focus at the end.
            if (clickedText && textSpan.textContent.length > 0) return;

            if (!textSpan.textContent.trim() || !clickedText) {
              try { textSpan.focus({ preventScroll: true }); } catch (_) { textSpan.focus(); }
              placeCaretAtEnd(textSpan);
              // The hit is often on the node/placeholder rather than the empty
              // inline editor. Prevent the browser from moving focus back to body.
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      }
      if (!isPlayback && n.id !== editingId) {
        el?.addEventListener('pointerdown', event => {
          if (presentationMode) return;
          const pointerTarget = event.target instanceof Element ? event.target : null;
          const linkTarget = pointerTarget?.closest('a.node-link');

          // ПКМ по уже выделенному узлу начинает перемещение всей выделенной группы.
          // ПКМ по невыделенному узлу остаётся обычным вызовом контекстного меню.
          if (event.button === 2) {
            if (mode === 'select' && selectedIds.includes(n.id)) {
              event.preventDefault();
              event.stopPropagation();
              startNodeDrag(event, n.id);
            }
            return;
          }
          if (event.button !== 0) return;

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
        if (n.type === 'image') {
          el?.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('.image-expand-button')) return;
            if (event.detail !== 1) return;

            // A native click can still be dispatched after a drag on some browsers.
            // Ignore it for the just-dragged image, but only for the matching node.
            const draggedRecently = lastDraggedImageNodeIds.has(n.id) &&
              performance.now() - lastImageDragAt < 350;
            if (draggedRecently) {
              lastDraggedImageNodeIds.delete(n.id);
              return;
            }

            clearImageExpandButtons();
            if (
              mode === 'select' &&
              selectedIds.length <= 1 &&
              !presentationMode &&
              !playback.active &&
              !drag &&
              !wasDragging
            ) {
              el.classList.add('image-expand-visible');
            }
          });
        }
        el?.addEventListener('dblclick', event => {
          if (presentationMode) { event.preventDefault(); event.stopPropagation(); return; }
          const target = event.target instanceof Element ? event.target : null;
          // Double-clicking a URL must not enter node text-edit mode.
          if (target?.closest('a.node-link')) return;
          if (event.button !== 0 || mode !== 'select' || playback.active) return;
          event.preventDefault(); event.stopPropagation();
          if (n.type === 'image') {
            clearImageExpandButtons();
            openImageLightbox(n.id);
          } else {
            startEditing(n.id, { clientX: event.clientX, clientY: event.clientY });
          }
        });
        el?.addEventListener('contextmenu', event => {
          if (presentationMode) { event.preventDefault(); event.stopPropagation(); return; }
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
      const rect = el.getBoundingClientRect();
      const safeZoom = Math.max(0.01, Number(zoom) || 1);
      const exactWidth = rect.width > 0 ? rect.width / safeZoom : el.offsetWidth;
      n.width = Math.max(10, Math.ceil(exactWidth) + 2);
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
    const squareGroups = new Map();
    const addNodeEdgeIndex = (nodeId, edgeId) => {
      if (!nodeToEdges.has(nodeId)) nodeToEdges.set(nodeId, []);
      nodeToEdges.get(nodeId).push(edgeId);
    };
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
    const squareRouteContexts = buildSquareRouteContexts(
      model.edges,
      modelNodesById,
      (node, side) => getStageNodePoint(node, side)
    );
    model.edges.forEach((edge, edgeIndex) => {
      const a = modelNodesById.get(edge.from), b = modelNodesById.get(edge.to);
      if (!a || !b) return;
      const aPoint = getStageNodePoint(a, edge.fromSide);
      const bPoint = getStageNodePoint(b, edge.toSide);
      const lineStartPoint = edge.arrowhead !== false && edge.bidirectional === true
        ? insetEndpointBySide(aPoint, edge.fromSide, ARROW_OFFSET)
        : aPoint;
      const lineEndPoint = edge.arrowhead !== false
        ? insetEndpointBySide(bPoint, edge.toSide, ARROW_OFFSET)
        : bPoint;
      const curvedArrowLead = edge.arrowhead !== false && (edge.style === 'curved' || edge.style === 'dashed');
      const curvedStartArrowLead = curvedArrowLead && edge.bidirectional === true;
      const d = pathFor(
        lineStartPoint, lineEndPoint, edge.fromSide, edge.toSide, edge.style,
        squareRouteContexts.get(edge.id), curvedArrowLead, curvedStartArrowLead
      );
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('class', 'edge-hit');
      hit.setAttribute('d', d);
      hit.dataset.edgeId = edge.id;
      hit?.addEventListener('pointerdown', event => {
        if (presentationMode) return;
        if (event.button !== 0 || isPlayback) return;
        event.preventDefault();
        event.stopPropagation();

        if (event.pointerType === 'touch') {
          // A mobile tap on the actual SVG hit path opens the edge editor
          // directly. Cancel the generic long-press candidate first so the
          // timer and the browser's native contextmenu cannot open competing
          // node/context UI over the edge controls.
          clearLongPress();
          suppressContextMenuUntil = Date.now() + 1300;
          closeNodeContextMenu();
          openSelectedEdgesActions(edge.id, event);
          return;
        }

        selectedId = null;
        selectedIds.splice(0);
        selectedEdgeIds.splice(0, selectedEdgeIds.length, edge.id);
        closeNodeContextMenu();
        refreshNodeSelectionDecorations(scene, false);
        refreshEdgeSelectionDecorations(scene, false);
        updateActionButtons();
      });
      hit?.addEventListener('contextmenu', event => {
        if (presentationMode) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        // Block the browser's native context menu before doing any UI work.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openSelectedEdgesActions(edge.id, event);
      });
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      const edgeClasses = ['edge'];
      if (!isPlayback && selectedEdgeIds.includes(edge.id)) edgeClasses.push('selected');
      if (edge.style === 'dashed') edgeClasses.push('dashed');
      p.setAttribute('class', edgeClasses.join(' '));
      p.setAttribute('d', d);
      p.dataset.edgeId = edge.id;
      const rawEdgeColor = typeof edge.color === 'string' && /^#[0-9a-f]{6}$/i.test(edge.color)
        ? edge.color.toLowerCase()
        : '#171717';
      const isDarkTheme = document.body.classList.contains('dark-theme');
      const isDefaultDarkEdge = rawEdgeColor === '#171717' || rawEdgeColor === '#111111';
      const edgeColor = (isDarkTheme && isDefaultDarkEdge) ? '#e5e5e5' : rawEdgeColor;
      p.style.setProperty('stroke', edgeColor);

      // Marker IDs are unique per edge so each arrowhead can use its own color.
      // arrowhead=false disables both ends; bidirectional adds the start marker too.
      if (edge.arrowhead !== false) {
        const markerId = `edgeArrow-${edgeIndex}`;
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 12 12');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '6');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '10');
        marker.setAttribute('orient', 'auto-start-reverse');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('d', 'M 2 2.5 L 10.5 6 L 2 9.5 Z');
        arrow.setAttribute('fill', edgeColor);
        arrow.setAttribute('stroke', edgeColor);
        arrow.setAttribute('stroke-width', '1.2');
        arrow.setAttribute('stroke-linejoin', 'round');
        marker.appendChild(arrow);
        defs.appendChild(marker);
        p.setAttribute('marker-end', `url(#${markerId})`);
        if (edge.bidirectional === true) {
          p.setAttribute('marker-start', `url(#${markerId})`);
        }
      }
      svg.appendChild(hit); svg.appendChild(p);
      edgeElements.set(edge.id, { edge, hit, line: p });
      addNodeEdgeIndex(edge.from, edge.id);
      addNodeEdgeIndex(edge.to, edge.id);
      if (edge.style === 'square') {
        const groupKey = `${edge.from}::${edge.fromSide}`;
        if (!squareGroups.has(groupKey)) squareGroups.set(groupKey, []);
        squareGroups.get(groupKey).push(edge.id);
      }
    });
    if (!isPlayback && linkDraft) {
      const origin = nodeById(linkDraft.fromId, scene);
      if (origin) {
        const aPoint = getStageNodePoint(origin, linkDraft.fromSide);
        const snapTarget = linkDraft.snapTargetId ? nodeById(linkDraft.snapTargetId, model) : null;
        const previewSide = snapTarget && validSide(linkDraft.snapSide) ? linkDraft.snapSide : 'left';
        const bPoint = snapTarget
          ? getStageNodePoint(snapTarget, previewSide)
          : { x: linkDraft.x, y: linkDraft.y };
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('class', 'edge-preview');
        p.setAttribute('id', 'linkPreview');
        p.setAttribute('d', pathFor(aPoint, bPoint, linkDraft.fromSide, previewSide));
        renderedLinkPreviewEl = p;
        svg.appendChild(p);
      }
    }
    stage.prepend(svg);
    renderedEdgeElements = edgeElements;
    renderedNodeToEdges = nodeToEdges;
    renderedSquareGroups = squareGroups;
    renderedConnectionsSvg = svg;
    rebuildViewportSpatialIndexes();
    if (!isPlayback && editingId) {
      const editingEl = stage.querySelector(`[data-node-id="${CSS.escape(editingId)}"]`);
      const editingText = editingEl && editingEl.querySelector('.node-text');
      if (editingText && shouldFocusNewNode) {
        shouldFocusNewNode = false;
        editingText.focus({ preventScroll: true });
        const caretCoords = pendingEditingCaretCoords;
        pendingEditingCaretCoords = null;
        if (caretCoords && editingText.textContent.length > 0) {
          const range = getEditorDropRange(editingText, caretCoords.clientX, caretCoords.clientY);
          const selection = window.getSelection();
          if (range && selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            placeCaretAtEnd(editingText);
          }
        } else {
          placeCaretAtEnd(editingText);
        }
      }
    }
    updateEmptyState(model, isPlayback);
    updateActionButtons();
    updateViewportCulling();
  }

  function placeCaretAtEnd(el) {
    try {
      const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    } catch (_) {}
  }

  function createNodeAt(x, y) {
    if (presentationMode) return null;
    if (playback.active) exitPlayback();

    // Resolve the requested point before mutating the scene. A malformed or
    // stale context-menu point falls back to the center of the visible canvas.
    let nodeX = Number(x);
    let nodeY = Number(y);
    if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) {
      const visibleCenter = getVisibleCanvasCenter();
      nodeX = visibleCenter.x;
      nodeY = visibleCenter.y;
    }

    const n = {
      id: safeId(),
      createdAt: Date.now(),
      x: Math.max(0, Math.round(nodeX)),
      y: Math.max(0, Math.round(nodeY)),
      text: '',
      width: 120,
      height: 30,
      fontSize: 16,
      autoSize: true,
      color: '#111111',
      underline: false,
      highlight: false,
      framed: defaultTextNodeHasBorder,
      borderColor: defaultTextNodeBorderColor
    };

    scene.nodes.push(n);
    selectedId = n.id;
    selectedIds.splice(0, selectedIds.length, n.id);
    editingId = n.id;
    editingOriginalText = '';
    shouldFocusNewNode = true;
    mode = 'select';
    syncModeButtons();
    modeIndicator.classList.remove('visible');
    stage.style.cursor = 'default';

    pushUndoSnapshot();
    renderScene();

    const createdNodeElement = renderedNodeElements.get(n.id) ||
      stage.querySelector('[data-node-id="' + n.id + '"]');
    const newEditor = createdNodeElement && createdNodeElement.querySelector('.node-text');

    // Keep the camera fixed: node placement uses the stage-local x/y passed in.

    if (newEditor) {
      // WebKit may inherit the canvas' touch-selection suppression. Explicitly
      // re-enable selection/editing on the contenteditable node.
      newEditor.style.setProperty('-webkit-user-select', 'text');
      newEditor.style.setProperty('user-select', 'text');
      newEditor.style.setProperty('-webkit-touch-callout', 'default');

      // Wait until the freshly rendered node is attached and the current
      // pointer sequence has settled before restoring editor focus.
      window.setTimeout(() => {
        if (editingId !== n.id || !newEditor.isConnected) return;
        try {
          newEditor.focus({ preventScroll: true });
        } catch (_) {
          newEditor.focus();
        }
        placeCaretAtEnd(newEditor);
      }, 50);

    } else {
      console.warn('[NetNorth] Created text node has no .node-text editor in DOM', n.id);
    }

    saveProject();
    return n;
  }

  function finishEditing(id, save) {
    if (presentationMode || editingId !== id) return;
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
    if (n && !n.text.trim() && n.createdAt && (Date.now() - n.createdAt < 1500)) {
      return;
    }
    editingId = null;
    editingOriginalText = null;
    pendingEditingCaretCoords = null;
    selectedId = null; selectedIds.splice(0);
    if (n && !n.text.trim()) {
      scene.nodes = scene.nodes.filter(item => item.id !== id);
      scene.edges = scene.edges.filter(e => e.from !== id && e.to !== id);
      closeNodeContextMenu();
    }
    if (save && n && n.text.trim()) {
      commitScene();
    } else {
      const invalidBookmarkSlots = pruneInvalidCameraBookmarks(scene.nodes);
      renderScene(); updateCameraBookmarksUI(); saveProject(); updateActionButtons();
      if (invalidBookmarkSlots.length) showToast(`Закладки ${invalidBookmarkSlots.join(', ')} сброшены: связанный узел удалён`);
    }
  }

  function startEditing(id, caretCoords = null) {
    if (presentationMode) return;
    const n = nodeById(id);
    if (!n || playback.active) return;
    selectedId = id;
    selectedIds.splice(0, selectedIds.length, id);
    editingId = id;
    editingOriginalText = n.text;
    pendingEditingCaretCoords = caretCoords &&
      Number.isFinite(caretCoords.clientX) && Number.isFinite(caretCoords.clientY)
      ? { clientX: caretCoords.clientX, clientY: caretCoords.clientY }
      : null;
    shouldFocusNewNode = true;
    renderScene();
  }

  function selectNode(id, preserveMultiSelection = false, render = false) {
    if (presentationMode) return;
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

  function attachWorkspaceTouchListeners() {
    // These listeners are app-level touch tracking, but they share the same
    // gesture lifecycle as the temporary move/up handlers below. Re-registering
    // the same callback is idempotent, so a new canvas gesture safely restores them.
    window?.addEventListener('pointermove', handleWorkspaceTouchMove, { passive: false });
    window?.addEventListener('pointerup', handleWorkspaceTouchEnd, { passive: false });
    window?.addEventListener('pointercancel', handleWorkspaceTouchEnd, { passive: false });
  }

  function detachPointerGestureListeners() {
    if (activeMoveHandler) {
      window.removeEventListener('pointermove', activeMoveHandler);
      activeMoveHandler = null;
    }
    if (activeUpHandler) {
      window.removeEventListener('pointerup', activeUpHandler);
      activeUpHandler = null;
    }
    window.removeEventListener('pointercancel', cancelPointerGesture);

    // App-level touch tracking listeners remain registered for the lifetime
    // of the application. Only the temporary active gesture callbacks above
    // are detached here.
  }

  function attachPointerGesture(moveHandler, upHandler) {
    detachPointerGestureListeners();
    activeMoveHandler = typeof moveHandler === 'function' ? moveHandler : null;
    activeUpHandler = typeof upHandler === 'function' ? upHandler : null;
    if (activeMoveHandler) window?.addEventListener('pointermove', activeMoveHandler);
    if (activeUpHandler) window?.addEventListener('pointerup', activeUpHandler);
    window?.addEventListener('pointercancel', cancelPointerGesture);
    attachWorkspaceTouchListeners();
  }

  function cancelPointerGesture(event) {
    // pointercancel/programmatic cancellation ends the complete gesture transaction.
    // Flush every tracked touch id so a later pointerdown cannot inherit stale pinch state.
    activeTouchPointers.clear();
    pinchState = null;
    mobileCanvasTapCandidate = null;
    lastMobileCanvasTap = null;
    workspace.classList.remove('pinching');
    const activeDrag = drag;
    const activeBox = boxSelect;
    clearSmartGuides();
    clearFontSizeSnapHighlights(activeDrag);
    clearQueuedGesturePointerMove();
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
    // Discard any pan frame queued by the gesture that is being rolled back.
    pendingViewportPan = null;
    // Clear any magnetic target highlight when a connection gesture is cancelled.
    renderedNodeElements.forEach(el => el.classList.remove('link-snap-target'));
    if (activeBox && activeBox.element.isConnected) activeBox.element.remove();
    boxSelect = null;
    workspace.classList.remove('panning');
    stage.style.cursor = mode === 'select' ? 'grab' : (mode === 'text' || mode === 'connect' ? 'crosshair' : 'default');
    renderScene();
  }

  window?.addEventListener('blur', () => {
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    clearLongPress();
    activeTouchPointers.clear();
    pinchState = null;
    workspace.classList.remove('pinching');
  });

  function startNodeDrag(event, id) {
    if (presentationMode) return;
    const isRightButton = event.button === 2;
    const isLeftButton = event.button === 0;
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
    const pointerType = event.pointerType || 'mouse';
    const rightButtonOnSelection = isRightButton && selectedIds.includes(id);
    if ((!isLeftButton && !rightButtonOnSelection) || editingId || mode !== 'select' || drag || linkDraft || boxSelect) return;

    // Touch pointers use the same pointerId-filtered gesture pipeline as mouse
    // pointers. Do not discard touch here: anchors own connection gestures,
    // while touches on the node body move the node or its current selection.
    wasDragging = false;
    if (isRightButton && event.cancelable) event.preventDefault();

    const n = nodeById(id); if (!n) return;
    const startedOnLink = event.target instanceof Element && !!event.target.closest('a.node-link');

    // Right-drag on any selected node always moves the complete selection.
    // The same moveSelection path is used for left-dragging a multi-selection.
    if (rightButtonOnSelection || (selectedIds.length > 1 && selectedIds.includes(id))) {
      const origins = selectedIds.map(nodeId => nodeById(nodeId)).filter(Boolean).map(node => ({ id: node.id, x: node.x, y: node.y }));
      if (!origins.length) return;
      // Always establish the exact pre-drag baseline, including after imports or sparse history states.
      pushUndoSnapshot();
      drag = { type: 'moveSelection', ids: origins, startX: event.clientX, startY: event.clientY, startZoom: zoom, moved: false, startedOnLink, pointerId, pointerType, button: event.button };
      cacheSmartGuideCandidates(drag, null);
    } else {
      // Capture the original node position before the first pointer movement.
      pushUndoSnapshot();
      drag = { type: 'move', id, startX: event.clientX, startY: event.clientY, startZoom: zoom, originX: n.x, originY: n.y, moved: false, startedOnLink, pointerId, pointerType, button: event.button };
      cacheSmartGuideCandidates(drag, n);
    }
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function cacheSmartGuideCandidates(activeDrag, movingNode) {
    updateViewportCulling();
    if (!activeDrag || (activeDrag.type !== 'move' && activeDrag.type !== 'moveSelection')) return;

    const selectedSet = activeDrag.type === 'moveSelection'
      ? new Set(activeDrag.ids.map(origin => origin.id))
      : new Set(movingNode ? [movingNode.id] : []);
    const safeZoom = Math.max(0.01, Number(zoom) || 1);
    const measureNodeSize = (node, element) => {
      if (element && element.isConnected && typeof element.getBoundingClientRect === 'function') {
        const rect = element.getBoundingClientRect();
        const exactWidth = rect.width > 0 ? rect.width / safeZoom : (Number(node.width) || 10);
        const exactHeight = rect.height > 0 ? rect.height / safeZoom : (Number(node.height) || 10);
        return {
          width: Math.max(10, exactWidth),
          height: Math.max(10, exactHeight)
        };
      }
      return {
        width: Math.max(10, Number(node.width) || 10),
        height: Math.max(10, Number(node.height) || 10)
      };
    };

    if (activeDrag.type === 'moveSelection') {
      // Build one immutable bounding box from the selected nodes' pointer-down
      // coordinates. DOM dimensions are measured only once at drag start.
      const selectedBounds = activeDrag.ids.map(origin => {
        const node = nodeById(origin.id);
        if (!node) return null;
        const element = renderedNodeElements.get(origin.id);
        const { width, height } = measureNodeSize(node, element);
        const left = Number(origin.x) || 0;
        const top = Number(origin.y) || 0;
        return { left, top, right: left + width, bottom: top + height };
      }).filter(Boolean);
      if (!selectedBounds.length) return;

      const originGroupLeft = Math.min(...selectedBounds.map(bounds => bounds.left));
      const originGroupTop = Math.min(...selectedBounds.map(bounds => bounds.top));
      const originGroupRight = Math.max(...selectedBounds.map(bounds => bounds.right));
      const originGroupBottom = Math.max(...selectedBounds.map(bounds => bounds.bottom));
      activeDrag.originX = originGroupLeft;
      activeDrag.originY = originGroupTop;
      activeDrag.nodeWidth = Math.max(10, originGroupRight - originGroupLeft);
      activeDrag.nodeHeight = Math.max(10, originGroupBottom - originGroupTop);
    } else {
      if (!movingNode) return;
      const movingElement = renderedNodeElements.get(movingNode.id);
      const { width, height } = measureNodeSize(movingNode, movingElement);
      activeDrag.nodeWidth = width;
      activeDrag.nodeHeight = height;
    }

    // Capture only visible nodes outside the moving set. When the viewport
    // index is empty, fall back to every non-selected node in the scene.
    const visibleIds = visibleViewportNodeIds.size
      ? visibleViewportNodeIds
      : new Set(scene.nodes.filter(node => node && !selectedSet.has(node.id)).map(node => node.id));

    activeDrag.snapCandidates = scene.nodes
      .filter(node => node && !selectedSet.has(node.id) && visibleIds.has(node.id))
      .map(node => {
        const element = renderedNodeElements.get(node.id);
        const { width, height } = measureNodeSize(node, element);
        const left = Number(node.x) || 0;
        const top = Number(node.y) || 0;
        return {
          id: node.id,
          left,
          centerX: left + width / 2,
          right: left + width,
          top,
          centerY: top + height / 2,
          bottom: top + height
        };
      });
  }

  function findSmartGuideAlignment(rawPosition, nodeSize, candidates, axisKeys, orthogonalStartKey, orthogonalEndKey, movingOrthogonalStart, movingOrthogonalSize, threshold) {
    let best = null;
    const offsets = { left: 0, centerX: nodeSize / 2, right: nodeSize, top: 0, centerY: nodeSize / 2, bottom: nodeSize };

    candidates.forEach(candidate => {
      axisKeys.forEach(key => {
        const delta = candidate[key] - (rawPosition + offsets[key]);
        const distance = Math.abs(delta);
        if (distance <= threshold && (!best || distance < best.distance)) {
          best = { delta, distance, coordinate: candidate[key] };
        }
      });
    });

    if (!best) return { position: rawPosition, guide: null };

    // Include every node sharing the exact snapped axis, not only the node
    // that produced the nearest match, so the guide spans the full alignment.
    let segmentStart = movingOrthogonalStart;
    let segmentEnd = movingOrthogonalStart + movingOrthogonalSize;
    candidates.forEach(candidate => {
      const sharesAxis = axisKeys.some(key => Math.abs(candidate[key] - best.coordinate) <= 0.5);
      if (!sharesAxis) return;
      segmentStart = Math.min(segmentStart, candidate[orthogonalStartKey]);
      segmentEnd = Math.max(segmentEnd, candidate[orthogonalEndKey]);
    });

    return {
      position: Math.max(0, rawPosition + best.delta),
      guide: { coordinate: best.coordinate, start: segmentStart, end: segmentEnd }
    };
  }

  function ensureSmartGuidesLayer() {
    if (smartGuidesLayer && smartGuidesLayer.isConnected) return smartGuidesLayer;
    smartGuidesLayer = stage.querySelector('.smart-guides-layer');
    if (!smartGuidesLayer) {
      smartGuidesLayer = document.createElement('div');
      smartGuidesLayer.className = 'smart-guides-layer';
      smartGuidesLayer.setAttribute('aria-hidden', 'true');
      stage.appendChild(smartGuidesLayer);
    }
    return smartGuidesLayer;
  }

  function clearSmartGuides() {
    const layer = smartGuidesLayer && smartGuidesLayer.isConnected
      ? smartGuidesLayer
      : stage.querySelector('.smart-guides-layer');
    if (layer) layer.remove();
    smartGuidesLayer = null;
  }

  function clearFontSizeSnapHighlights(activeDrag = drag) {
    if (!activeDrag) return;
    const highlightedIds = Array.isArray(activeDrag.fontSizeSnapHighlightIds)
      ? activeDrag.fontSizeSnapHighlightIds
      : [];
    highlightedIds.forEach(id => {
      const element = renderedNodeElements.get(id);
      if (element) element.classList.remove('font-size-snap-match');
    });
    activeDrag.fontSizeSnapHighlightIds = [];
  }

  function paintFontSizeSnapHighlights(activeDrag, movingNode, matchedFontSize) {
    clearFontSizeSnapHighlights(activeDrag);
    if (!activeDrag || !movingNode || !Number.isFinite(matchedFontSize)) return;

    const ids = new Set([movingNode.id]);
    (Array.isArray(activeDrag.sizeSnapCandidates) ? activeDrag.sizeSnapCandidates : [])
      .forEach(candidate => {
        if (candidate.type === 'image' || !Number.isFinite(candidate.fontSize)) return;
        if (Math.abs(candidate.fontSize - matchedFontSize) <= 0.001) ids.add(candidate.id);
      });

    ids.forEach(id => {
      const element = renderedNodeElements.get(id);
      if (element && element.isConnected) element.classList.add('font-size-snap-match');
    });
    activeDrag.fontSizeSnapHighlightIds = [...ids];
  }

  function paintSmartGuides(activeGuides) {
    const vertical = activeGuides && activeGuides.vertical;
    const horizontal = activeGuides && activeGuides.horizontal;
    if (!vertical && !horizontal) {
      clearSmartGuides();
      return;
    }

    const layer = ensureSmartGuidesLayer();
    const updateLine = (type, guide) => {
      let line = layer.querySelector(`.smart-guide.${type}`);
      if (!guide) {
        if (line) line.remove();
        return;
      }
      if (!line) {
        line = document.createElement('div');
        line.className = `smart-guide ${type}`;
        layer.appendChild(line);
      }
      if (type === 'vertical') {
        line.style.left = `${guide.coordinate}px`;
        line.style.top = `${guide.start - 16}px`;
        line.style.height = `${Math.max(0, guide.end - guide.start + 32)}px`;
        line.style.width = '0px';
      } else {
        line.style.left = `${guide.start - 16}px`;
        line.style.top = `${guide.coordinate}px`;
        line.style.width = `${Math.max(0, guide.end - guide.start + 32)}px`;
        line.style.height = '0px';
      }
    };

    updateLine('vertical', vertical);
    updateLine('horizontal', horizontal);
  }

  function cacheResizeSnapCandidates(activeDrag, movingNode) {
    if (!activeDrag || activeDrag.type !== 'resize' || !movingNode) return;
    updateViewportCulling();

    const safeZoom = Math.max(0.01, Number(zoom) || 1);
    const visibleIds = visibleViewportNodeIds.size
      ? visibleViewportNodeIds
      : new Set(scene.nodes.filter(node => node && node.id !== movingNode.id).map(node => node.id));

    activeDrag.sizeSnapCandidates = scene.nodes
      .filter(node => node && node.id !== movingNode.id && visibleIds.has(node.id))
      .map(node => {
        const element = renderedNodeElements.get(node.id);
        const rect = element && element.isConnected && typeof element.getBoundingClientRect === 'function'
          ? element.getBoundingClientRect()
          : null;
        const width = Math.max(10, rect && rect.width > 0
          ? rect.width / safeZoom
          : (Number(node.width) || 10));
        const height = Math.max(10, rect && rect.height > 0
          ? rect.height / safeZoom
          : (Number(node.height) || 10));
        const left = Number(node.x) || 0;
        const top = Number(node.y) || 0;

        return {
          id: node.id,
          type: node.type || 'text',
          fontSize: node.type === 'image'
            ? null
            : Math.round((Number(node.fontSize) || 16) * 2) / 2,
          width,
          height,
          left,
          right: left + width,
          top,
          bottom: top + height
        };
      });
  }

  function buildResizeSmartGuides(node, activeDrag) {
    if (!node || !activeDrag || activeDrag.snapDisabled) return null;
    const candidates = Array.isArray(activeDrag.sizeSnapCandidates) ? activeDrag.sizeSnapCandidates : [];
    if (!candidates.length) return null;

    const threshold = 5 / (activeDrag.startZoom || zoom || 1);
    const west = activeDrag.handle.includes('w');
    const north = activeDrag.handle.includes('n');

    if (node.type === 'image') {
      const match = activeDrag.sizeSnapMatch;
      if (!match || !match.candidate) return null;
      const candidate = match.candidate;
      if (match.axis === 'width') {
        const coordinate = west ? node.x : node.x + node.width;
        return {
          vertical: {
            coordinate,
            start: Math.min(node.y, candidate.top),
            end: Math.max(node.y + node.height, candidate.bottom)
          },
          horizontal: null
        };
      }
      if (match.axis === 'height') {
        const coordinate = north ? node.y : node.y + node.height;
        return {
          vertical: null,
          horizontal: {
            coordinate,
            start: Math.min(node.x, candidate.left),
            end: Math.max(node.x + node.width, candidate.right)
          }
        };
      }
      return null;
    }

    // Text size is snapped through fontSize; edge guides are a secondary
    // visual aid when the resized left/right edge approaches another node.
    const movingEdge = west ? node.x : node.x + node.width;
    let best = null;
    candidates.forEach(candidate => {
      [candidate.left, candidate.right].forEach(coordinate => {
        const distance = Math.abs(coordinate - movingEdge);
        if (distance <= threshold && (!best || distance < best.distance)) {
          best = { candidate, coordinate, distance };
        }
      });
    });
    if (!best) return null;
    return {
      vertical: {
        coordinate: best.coordinate,
        start: Math.min(node.y, best.candidate.top),
        end: Math.max(node.y + node.height, best.candidate.bottom)
      },
      horizontal: null
    };
  }

  function startResize(event, id, handle) {
    if (presentationMode) return;
    event.preventDefault(); event.stopPropagation();
    if (playback.active || linkDraft || drag || boxSelect) return;
    const n = nodeById(id); if (!n) return;
    selectedId = id; selectedIds.splice(0, selectedIds.length, id);
    // Use the rendered box as the resize baseline. Model width/height may be stale
    // for auto-sized text nodes, while getBoundingClientRect reflects the visible box.
    const originAutoSize = n.autoSize;
    const nodeElement = renderedNodeElements.get(id);
    const nodeRect = nodeElement && nodeElement.isConnected ? nodeElement.getBoundingClientRect() : null;
    const resizeZoom = Math.max(0.0001, Number(zoom) || 1);
    const originW = Math.max(10, nodeRect && nodeRect.width > 0
      ? nodeRect.width / resizeZoom
      : (Number(n.width) || 10));
    const originH = Math.max(10, nodeRect && nodeRect.height > 0
      ? nodeRect.height / resizeZoom
      : (Number(n.height) || 10));
    const originFontSize = clamp(Number(n.fontSize) || 16, 10, 80);
    // Store the original dimensions and autoSize state before resize mutates the node.
    pushUndoSnapshot();
    // Once a text node is resized, persist its proportional width so existing
    // line breaks do not collapse back to max-content after the drag commits.
    n.autoSize = false;
    drag = { type: 'resize', id, handle, startX: event.clientX, startY: event.clientY, startZoom: zoom, originX: n.x, originY: n.y, originW, originH, originFontSize, originAutoSize, moved: false, pointerId: event.pointerId };
    cacheResizeSnapCandidates(drag, n);
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function startPan(event) {
    if (event.button !== 0 || editingId || playback.active || mode !== 'select' || drag || linkDraft || boxSelect) return;
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
    const pointerType = event.pointerType || 'mouse';
    wasDragging = false;

    // On desktop, a left-click on empty canvas clears node and edge selections.
    // Touch gestures preserve selection but still keep their own pointer identity.
    if (pointerType !== 'touch' && (selectedId !== null || selectedIds.length || selectedEdgeIds.length)) {
      selectedId = null;
      selectedIds.splice(0);
      selectedEdgeIds.splice(0);
      refreshNodeSelectionDecorations(scene, false);
      refreshEdgeSelectionDecorations(scene, false);
      updateActionButtons();
    }

    if (event.cancelable) event.preventDefault();
    stage.style.cursor = 'grabbing';
    drag = { type: 'pan', startX: event.clientX, startY: event.clientY, startZoom: zoom, originScrollLeft: workspace.scrollLeft, originScrollTop: workspace.scrollTop, moved: false, pointerId, pointerType, button: event.button };
    workspace.classList.add('panning');
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function cacheLinkSnapTargets(draft) {
    if (!draft) return;
    const cacheNodeGeometry = node => {
      const element = renderedNodeElements.get(node.id);
      return {
        id: node.id,
        node,
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        width: Math.max(10, element ? element.offsetWidth : (Number(node.width) || 10)),
        height: Math.max(10, element ? element.offsetHeight : (Number(node.height) || 10))
      };
    };
    const origin = nodeById(draft.fromId);
    draft.fromNode = origin || null;
    draft.fromGeometry = origin ? cacheNodeGeometry(origin) : null;
    // Read every target's layout dimensions once at gesture start, never per pointermove.
    draft.snapTargets = scene.nodes
      .filter(node => node && node.id !== draft.fromId)
      .map(cacheNodeGeometry);
  }

  function getCachedStageNodePoint(node, side, geometry) {
    const box = geometry || { x: node.x, y: node.y, width: node.width, height: node.height };
    if (side === 'top') return { x: box.x + box.width / 2, y: box.y };
    if (side === 'right') return { x: box.x + box.width, y: box.y + box.height / 2 };
    if (side === 'bottom') return { x: box.x + box.width / 2, y: box.y + box.height };
    return { x: box.x, y: box.y + box.height / 2 };
  }

  function findLinkSnapCandidate(point, draft) {
    if (!point || !draft) return null;
    const origin = draft.fromNode || nodeById(draft.fromId);
    if (!origin) return null;

    // point is in stage coordinates, so convert the screen-space snap radius
    // into model coordinates to keep the magnetic distance visually constant.
    const snapRadius = 65 / Math.max(0.01, zoom || 1);
    let best = null;
    const candidates = Array.isArray(draft.snapTargets) ? draft.snapTargets : [];

    candidates.forEach(cachedTarget => {
      const targetNode = cachedTarget.node || nodeById(cachedTarget.id);
      if (!targetNode) return;
      const left = cachedTarget.x;
      const top = cachedTarget.y;
      const width = cachedTarget.width;
      const height = cachedTarget.height;
      const right = left + width;
      const bottom = top + height;
      const nearestX = clamp(point.x, left, right);
      const nearestY = clamp(point.y, top, bottom);
      const boundaryDistance = Math.hypot(point.x - nearestX, point.y - nearestY);
      if (boundaryDistance > snapRadius) return;

      // If nodes overlap, prefer the one whose center is actually nearer.
      const centerDistance = Math.hypot(
        point.x - (left + width / 2),
        point.y - (top + height / 2)
      );
      if (best && (
        boundaryDistance > best.boundaryDistance + 0.001 ||
        (Math.abs(boundaryDistance - best.boundaryDistance) <= 0.001 && centerDistance >= best.centerDistance)
      )) return;

      const sides = chooseSides(origin, targetNode, draft.fromSide, {
        a: draft.fromGeometry,
        b: cachedTarget
      });
      best = {
        node: targetNode,
        geometry: cachedTarget,
        snapSide: sides.toSide,
        boundaryDistance,
        centerDistance
      };
    });

    return best;
  }

  function setLinkSnapTarget(draft, candidate) {
    if (!draft) return;
    const nextId = candidate && candidate.node ? candidate.node.id : null;
    const previousId = draft.snapTargetId || null;

    if (previousId && previousId !== nextId) {
      renderedNodeElements.get(previousId)?.classList.remove('link-snap-target');
    }

    draft.snapTargetId = nextId;
    draft.snapSide = candidate && validSide(candidate.snapSide) ? candidate.snapSide : null;

    if (nextId) {
      renderedNodeElements.get(nextId)?.classList.add('link-snap-target');
    }
  }

  function startLink(event, id, side) {
    if (presentationMode) return;
    event.preventDefault(); event.stopPropagation();
    if (playback.active || drag || linkDraft || boxSelect || editingId) return;
    selectedEdgeIds.splice(0);
    selectedId = id; selectedIds.splice(0, selectedIds.length, id);
    const p = getStagePoint(event);
    linkDraft = {
      fromId: id,
      fromSide: side,
      x: p.x,
      y: p.y,
      snapTargetId: null,
      snapSide: null,
      pointerId: event.pointerId
    };
    // Один рендер для создания пунктирной линии; во время перетаскивания узлы не пересоздаются.
    renderScene();
    cacheLinkSnapTargets(linkDraft);
    attachPointerGesture(onPointerMove, onPointerUp);
  }

  function ensureStageBoundsForDrag(nodeIds = []) {
    // The stage already includes every node at render time. During a drag,
    // inspect only the moved objects instead of reducing the complete graph.
    const currentWidth = Number.parseFloat(stage.style.width) || 1200;
    const currentHeight = Number.parseFloat(stage.style.height) || 800;
    let maxX = 0, maxY = 0;
    nodeIds.forEach(id => {
      const node = renderedNodeModels.get(id) || nodeById(id);
      if (!node) return;
      maxX = Math.max(maxX, node.x + Math.max(10, node.width || 10));
      maxY = Math.max(maxY, node.y + Math.max(10, node.height || 10));
    });
    stageContentBounds.maxX = Math.max(stageContentBounds.maxX, maxX);
    stageContentBounds.maxY = Math.max(stageContentBounds.maxY, maxY);
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
    const affectedSquareGroups = new Set();

    nodeIds.forEach(id => {
      (renderedNodeToEdges.get(id) || []).forEach(edgeId => {
        edgeIds.add(edgeId);
        const bundle = renderedEdgeElements.get(edgeId);
        const edge = bundle && bundle.edge;
        if (edge && edge.style === 'square') {
          affectedSquareGroups.add(`${edge.from}::${edge.fromSide}`);
        }
      });
    });

    // Square branches share a trunk. Update only siblings in the affected
    // source-side group instead of scanning/re-routing the entire graph.
    affectedSquareGroups.forEach(groupKey => {
      (renderedSquareGroups.get(groupKey) || []).forEach(edgeId => edgeIds.add(edgeId));
    });

    const affectedEdges = [...edgeIds]
      .map(edgeId => renderedEdgeElements.get(edgeId))
      .filter(Boolean)
      .map(bundle => bundle.edge);
    const squareRouteContexts = buildSquareRouteContexts(
      affectedEdges,
      renderedNodeModels,
      (node, side) => getStageNodePoint(node, side)
    );

    edgeIds.forEach(edgeId => {
      const bundle = renderedEdgeElements.get(edgeId);
      if (!bundle) return;
      const edge = bundle.edge;
      const from = renderedNodeModels.get(edge.from);
      const to = renderedNodeModels.get(edge.to);
      if (!from || !to) return;
      const aPoint = getStageNodePoint(from, edge.fromSide);
      const bPoint = getStageNodePoint(to, edge.toSide);
      const lineStartPoint = edge.arrowhead !== false && edge.bidirectional === true
        ? insetEndpointBySide(aPoint, edge.fromSide, ARROW_OFFSET)
        : aPoint;
      const lineEndPoint = edge.arrowhead !== false
        ? insetEndpointBySide(bPoint, edge.toSide, ARROW_OFFSET)
        : bPoint;
      const curvedArrowLead = edge.arrowhead !== false && (edge.style === 'curved' || edge.style === 'dashed');
      const curvedStartArrowLead = curvedArrowLead && edge.bidirectional === true;
      const d = pathFor(
        lineStartPoint,
        lineEndPoint,
        edge.fromSide,
        edge.toSide,
        edge.style,
        squareRouteContexts.get(edge.id),
        curvedArrowLead,
        curvedStartArrowLead
      );
      bundle.hit.setAttribute('d', d);
      bundle.line.setAttribute('d', d);
    });
  }

  function paintDragGeometry() {
    if (!drag || drag.type === 'pan') return;
    if (drag.type === 'move' || drag.type === 'moveSelection') paintSmartGuides(drag.activeGuides);
    else if (drag.type !== 'resize') clearSmartGuides();
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
        const mobileTextMaxWidth = node.type === 'image' ? null : getMobileTextNodeMaxWidth();
        el.style.maxWidth = mobileTextMaxWidth ? `${mobileTextMaxWidth}px` : 'none';
        el.style.minWidth = '0';
        el.style.minHeight = '0';

        if (node.type === 'image') {
          // Image dimensions are calculated from the same scale in onPointerMove.
          el.style.width = `${Math.max(10, node.width)}px`;
          el.style.height = `${Math.max(10, node.height)}px`;
        } else {
          // Keep the original wrapping proportions while the font scales.
          // This prevents multiline nodes from expanding into one long line
          // when a corner handle is dragged.
          const fontRatio = clamp(Number(node.fontSize) || 16, 10, 80) / (drag.originFontSize || 16);
          // Round the rendered width upward on every platform. Fractional CSS
          // widths can otherwise push the final glyph to the next line on
          // desktop browsers when font metrics and letter-spacing are rasterized.
          const resizeWidth = Math.max(10, Math.ceil(drag.originW * fontRatio));
          el.style.width = `${resizeWidth}px`;
          el.style.height = 'auto';
          el.style.overflowWrap = 'break-word';
          el.style.fontSize = `${clamp(Number(node.fontSize) || 16, 10, 80)}px`;

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

    if (drag && drag.type === 'resize') {
      const resizedNode = renderedNodeModels.get(drag.id) || nodeById(drag.id);
      drag.activeGuides = buildResizeSmartGuides(resizedNode, drag);
      paintSmartGuides(drag.activeGuides);
    }
    ensureStageBoundsForDrag(ids);
    updateRenderedEdgesForNodes(ids);
    scheduleViewportCulling();
  }

  function scheduleDragGeometryPaint() {
    if (processingPointerMoveFrame) {
      if (dragPaintRaf) { cancelAnimationFrame(dragPaintRaf); dragPaintRaf = 0; }
      paintDragGeometry();
      return;
    }
    if (dragPaintRaf) return;
    dragPaintRaf = requestAnimationFrame(() => {
      dragPaintRaf = 0;
      paintDragGeometry();
    });
  }

  function snapshotPointerMove(event) {
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      cancelable: false,
      preventDefault() {}
    };
  }

  function queueGesturePointerMove(event, handler) {
    if (!event || !handler) return;
    // preventDefault must run during the native event dispatch on iOS Safari;
    // the geometry work itself is deferred to the next animation frame.
    if (event.pointerType === 'touch' && event.cancelable) event.preventDefault();
    pendingPointerMove = snapshotPointerMove(event);
    pendingPointerMoveHandler = handler;
    if (pointerMoveRaf) return;
    pointerMoveRaf = requestAnimationFrame(() => {
      pointerMoveRaf = 0;
      const sample = pendingPointerMove;
      const callback = pendingPointerMoveHandler;
      pendingPointerMove = null;
      pendingPointerMoveHandler = null;
      if (!sample || !callback) return;
      processingPointerMoveFrame = true;
      try { callback(sample); }
      finally { processingPointerMoveFrame = false; }
    });
  }

  function flushQueuedGesturePointerMove(pointerId = null) {
    if (!pendingPointerMove || !pendingPointerMoveHandler) return;
    if (pointerId != null && pendingPointerMove.pointerId !== pointerId) return;
    if (pointerMoveRaf) cancelAnimationFrame(pointerMoveRaf);
    pointerMoveRaf = 0;
    const sample = pendingPointerMove;
    const callback = pendingPointerMoveHandler;
    pendingPointerMove = null;
    pendingPointerMoveHandler = null;
    processingPointerMoveFrame = true;
    try { callback(sample); }
    finally { processingPointerMoveFrame = false; }
  }

  function clearQueuedGesturePointerMove() {
    if (pointerMoveRaf) cancelAnimationFrame(pointerMoveRaf);
    pointerMoveRaf = 0;
    pendingPointerMove = null;
    pendingPointerMoveHandler = null;
  }

  function onPointerMove(event) {
    if (pinchState) return;
    if (!drag && !linkDraft) return;
    if (drag && drag.pointerId != null && event.pointerId !== drag.pointerId) return;
    if (linkDraft && linkDraft.pointerId != null && event.pointerId !== linkDraft.pointerId) return;
    queueGesturePointerMove(event, processPointerMove);
  }

  function processPointerMove(event) {
    if (pinchState) return;
    if (!drag && !linkDraft) return;
    if (drag && drag.pointerId != null && event.pointerId !== drag.pointerId) return;
    if (linkDraft && linkDraft.pointerId != null && event.pointerId !== linkDraft.pointerId) return;
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
        pendingViewportPan = {
          left: drag.originScrollLeft - dx,
          top: drag.originScrollTop - dy
        };
        if (processingPointerMoveFrame) flushPendingViewportPan();
        else scheduleViewportFrame();
        return;
      }
      // Use the zoom captured when this gesture started. This keeps model-space movement
      // stable even if the browser dispatches extra wheel/resize events during a drag.
      const scale = drag.startZoom || zoom;
      const modelDx = dx / scale, modelDy = dy / scale;
      if (drag.type === 'moveSelection') {
        // Snap the complete group's bounding box, then apply one shared delta
        // to every selected node so their relative positions never change.
        const rawX = Math.max(0, drag.originX + modelDx);
        const rawY = Math.max(0, drag.originY + modelDy);
        let nextX = rawX;
        let nextY = rawY;
        let verticalGuide = null;
        let horizontalGuide = null;

        if (!event.altKey && drag.snapCandidates?.length) {
          const snapThreshold = 5 / (drag.startZoom || zoom);
          const xSnap = findSmartGuideAlignment(
            rawX, drag.nodeWidth, drag.snapCandidates,
            ['left', 'centerX', 'right'], 'top', 'bottom', rawY, drag.nodeHeight, snapThreshold
          );
          const ySnap = findSmartGuideAlignment(
            rawY, drag.nodeHeight, drag.snapCandidates,
            ['top', 'centerY', 'bottom'], 'left', 'right', rawX, drag.nodeWidth, snapThreshold
          );
          nextX = xSnap.position;
          nextY = ySnap.position;
          if (xSnap.guide) {
            verticalGuide = { coordinate: xSnap.guide.coordinate, start: Math.min(xSnap.guide.start, nextY), end: Math.max(xSnap.guide.end, nextY + drag.nodeHeight) };
          }
          if (ySnap.guide) {
            horizontalGuide = { coordinate: ySnap.guide.coordinate, start: Math.min(ySnap.guide.start, nextX), end: Math.max(ySnap.guide.end, nextX + drag.nodeWidth) };
          }
        }

        const appliedDx = nextX - drag.originX;
        const appliedDy = nextY - drag.originY;
        drag.ids.forEach(origin => {
          const node = renderedNodeModels.get(origin.id) || nodeById(origin.id);
          if (!node) return;
          node.x = Math.max(0, origin.x + appliedDx);
          node.y = Math.max(0, origin.y + appliedDy);
        });
        drag.activeGuides = { vertical: verticalGuide, horizontal: horizontalGuide };
      } else if (drag.type === 'move') {
        const n = renderedNodeModels.get(drag.id) || nodeById(drag.id); if (!n) return;
        // Always calculate from the original pointer-down position. Re-evaluating
        // the raw position each frame lets the node naturally unstick past 5 screen px.
        const rawX = Math.max(0, drag.originX + modelDx);
        const rawY = Math.max(0, drag.originY + modelDy);
        let nextX = rawX;
        let nextY = rawY;
        let verticalGuide = null;
        let horizontalGuide = null;

        if (!event.altKey && drag.snapCandidates?.length) {
          const snapThreshold = 5 / (drag.startZoom || zoom);
          const xSnap = findSmartGuideAlignment(
            rawX, drag.nodeWidth, drag.snapCandidates,
            ['left', 'centerX', 'right'], 'top', 'bottom', rawY, drag.nodeHeight, snapThreshold
          );
          const ySnap = findSmartGuideAlignment(
            rawY, drag.nodeHeight, drag.snapCandidates,
            ['top', 'centerY', 'bottom'], 'left', 'right', rawX, drag.nodeWidth, snapThreshold
          );
          nextX = xSnap.position;
          nextY = ySnap.position;
          if (xSnap.guide) {
            verticalGuide = { coordinate: xSnap.guide.coordinate, start: Math.min(xSnap.guide.start, nextY), end: Math.max(xSnap.guide.end, nextY + drag.nodeHeight) };
          }
          if (ySnap.guide) {
            horizontalGuide = { coordinate: ySnap.guide.coordinate, start: Math.min(ySnap.guide.start, nextX), end: Math.max(ySnap.guide.end, nextX + drag.nodeWidth) };
          }
        }

        n.x = nextX;
        n.y = nextY;
        drag.activeGuides = { vertical: verticalGuide, horizontal: horizontalGuide };
      } else if (drag.type === 'resize') {
        const n = renderedNodeModels.get(drag.id) || nodeById(drag.id); if (!n) return;
        const west = drag.handle.includes('w');
        const north = drag.handle.includes('n');
        const horizontalDelta = west ? -modelDx : modelDx;
        const verticalDelta = north ? -modelDy : modelDy;
        const snapThreshold = 5 / (drag.startZoom || zoom || 1);
        drag.snapDisabled = !!event.altKey;
        drag.sizeSnapMatch = null;
        drag.activeGuides = null;
        clearFontSizeSnapHighlights(drag);
        n.autoSize = false;

        if (n.type === 'image') {
          // Resize uniformly first; Smart Size Snap may then replace the
          // proposed width with an exact visible image width/height match.
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
          let nextWidth = Math.round(originW * imageScale * 10) / 10;
          let nextHeight = Math.round((nextWidth / aspect) * 10) / 10;
          let hasExactImageSizeSnap = false;

          if (!event.altKey && drag.sizeSnapCandidates?.length) {
            const minWidth = Math.max(10, 10 * aspect);
            const maxWidth = Math.min(2000, 2000 * aspect);
            let bestMatch = null;
            const considerMatch = (axis, distance, candidate, matchedWidth) => {
              if (distance > snapThreshold || matchedWidth < minWidth || matchedWidth > maxWidth) return;
              if (!bestMatch || distance < bestMatch.distance) {
                bestMatch = { axis, distance, candidate, width: matchedWidth };
              }
            };

            drag.sizeSnapCandidates.forEach(candidate => {
              if (candidate.type !== 'image') return;
              considerMatch('width', Math.abs(nextWidth - candidate.width), candidate, candidate.width);
              considerMatch('height', Math.abs(nextHeight - candidate.height), candidate, candidate.height * aspect);
            });

            if (bestMatch) {
              nextWidth = bestMatch.width;
              hasExactImageSizeSnap = true;
              drag.sizeSnapMatch = { axis: bestMatch.axis, candidate: bestMatch.candidate };
              // Keep the image's own aspect ratio even when matching a peer's height.
              nextHeight = nextWidth / aspect;
            }
          }

          // Preserve the candidate's exact subpixel dimension when snapped;
          // only freehand resizing keeps the normal tenth-pixel rounding.
          n.width = hasExactImageSizeSnap ? nextWidth : Math.round(nextWidth * 10) / 10;
          n.height = hasExactImageSizeSnap ? (n.width / aspect) : Math.round((n.width / aspect) * 10) / 10;
          n.x = west ? Math.max(0, drag.originX + drag.originW - n.width) : drag.originX;
          n.y = north ? Math.max(0, drag.originY + drag.originH - n.height) : drag.originY;
        } else {
          // Project pointer movement onto the node's original diagonal. This
          // gives a stable, direction-aware scale for every corner handle and
          // avoids independent X/Y scaling that can drift at font-size limits.
          const originW = Math.max(10, drag.originW);
          const originH = Math.max(10, drag.originH);
          const originDiagonal = Math.max(1, Math.hypot(originW, originH));
          const diagonalX = originW / originDiagonal;
          const diagonalY = originH / originDiagonal;
          const projectedMovement = horizontalDelta * diagonalX + verticalDelta * diagonalY;
          const scaleFactor = Math.max(0, 1 + projectedMovement / originDiagonal);
          const originFontSize = clamp(Number(drag.originFontSize) || Number(n.fontSize) || 16, 10, 80);
          const clampedFontSize = clamp(originFontSize * scaleFactor, 10, 80);
          let nextFontSize = clamp(Math.round(clampedFontSize * 2) / 2, 10, 80);
          let bestFontMatch = null;

          if (!event.altKey && drag.sizeSnapCandidates?.length) {
            drag.sizeSnapCandidates.forEach(candidate => {
              if (candidate.type === 'image' || !Number.isFinite(candidate.fontSize)) return;
              const distance = Math.abs(candidate.fontSize - nextFontSize);
              if (distance <= 1.5 && (!bestFontMatch || distance < bestFontMatch.distance)) {
                bestFontMatch = { fontSize: candidate.fontSize, distance };
              }
            });
            if (bestFontMatch) nextFontSize = bestFontMatch.fontSize;
          }

          n.fontSize = nextFontSize;
          if (bestFontMatch) {
            paintFontSizeSnapHighlights(drag, n, bestFontMatch.fontSize);
          }
          // Apply the font size immediately; the next geometry paint measures
          // the resulting DOM box and anchors its opposite corner to originX/Y.
          const textElement = renderedNodeElements.get(drag.id);
          if (textElement) textElement.style.fontSize = `${n.fontSize}px`;
          n.autoSize = false;
        }
      }
      scheduleDragGeometryPaint();
    } else if (linkDraft) {
      const point = getStagePoint(event);
      linkDraft.x = point.x; linkDraft.y = point.y;

      const snapCandidate = findLinkSnapCandidate(point, linkDraft);
      setLinkSnapTarget(linkDraft, snapCandidate);

      const preview = renderedLinkPreviewEl;
      const origin = linkDraft.fromNode || nodeById(linkDraft.fromId);
      if (preview && origin) {
        const aPoint = getCachedStageNodePoint(origin, linkDraft.fromSide, linkDraft.fromGeometry);
        const previewSide = snapCandidate ? snapCandidate.snapSide : 'left';
        const previewPoint = snapCandidate
          ? getCachedStageNodePoint(snapCandidate.node, snapCandidate.snapSide, snapCandidate.geometry)
          : point;
        preview.setAttribute('d', pathFor(aPoint, previewPoint, linkDraft.fromSide, previewSide));
      }
    }
  }
  function onPointerUp(event) {
    if (pinchState) return;
    if (drag && drag.pointerId != null && event.pointerId !== drag.pointerId) return;
    if (linkDraft && linkDraft.pointerId != null && event.pointerId !== linkDraft.pointerId) return;
    flushQueuedGesturePointerMove(event.pointerId);
    clearSmartGuides();
    clearFontSizeSnapHighlights(drag);
    // Snapshot the active gesture's movement before clearing its global state.
    const movementWasTracked = wasDragging;
    wasDragging = false;
    detachPointerGestureListeners();
    if (dragPaintRaf) { cancelAnimationFrame(dragPaintRaf); dragPaintRaf = 0; }
    if (drag) {
      const finished = drag;
      const changed = finished.moved;
      if (changed && (finished.type === 'move' || finished.type === 'moveSelection')) {
        const movedIds = finished.type === 'moveSelection'
          ? (finished.ids || []).map(item => item.id)
          : [finished.id];
        lastDraggedImageNodeIds = new Set(movedIds.filter(id => nodeById(id)?.type === 'image'));
        lastImageDragAt = performance.now();
      }
      const suppressPostDragLinkClick = movementWasTracked && !!finished.startedOnLink;
      // Browsers may dispatch contextmenu after releasing ПКМ. Suppress it only
      // after an actual right-button drag so the group does not open a menu on drop.
      if (changed && finished.button === 2) {
        suppressContextMenuUntil = Date.now() + 1200;
      }
      drag = null;
      workspace.classList.remove('panning');
      stage.style.cursor = mode === 'select' ? 'grab' : (mode === 'text' || mode === 'connect' ? 'crosshair' : 'default');
      if (finished.type === 'pan') {
        if (!changed) {
          selectedId = null;
          selectedIds.splice(0);
          selectedEdgeIds.splice(0);
          refreshNodeSelectionDecorations(scene, false);
          refreshEdgeSelectionDecorations(scene, false);
          updateActionButtons();
        }
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
      const draft = linkDraft;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = under && under.closest ? under.closest('.node[data-node-id]') : null;
      const directTargetId = nodeEl ? nodeEl.dataset.nodeId : null;
      const anchorEl = under && under.closest ? under.closest('.anchor') : null;
      const directAnchorSide = anchorEl ? [...anchorEl.classList].find(c => validSide(c)) : null;
      const releasePoint = getStagePoint(event);
      const releaseSnap = findLinkSnapCandidate(releasePoint, draft);

      // A node directly under the pointer wins (and an explicit target anchor
      // wins over the calculated side). Otherwise keep the magnetic snap target.
      let targetId = directTargetId
        ? (directTargetId !== draft.fromId ? directTargetId : null)
        : (releaseSnap?.node.id || draft.snapTargetId || null);
      let targetSide = null;
      if (targetId) {
        if (directTargetId === targetId && directAnchorSide) {
          targetSide = directAnchorSide;
        } else if (releaseSnap && releaseSnap.node.id === targetId) {
          targetSide = releaseSnap.snapSide;
        } else if (draft.snapTargetId === targetId && validSide(draft.snapSide)) {
          targetSide = draft.snapSide;
        }
      }

      linkDraft = null;
      const source = nodeById(draft.fromId);
      const target = targetId ? nodeById(targetId) : null;
      if (source && target && target.id !== source.id) {
        const sides = chooseSides(source, target, draft.fromSide);
        addEdge(draft.fromId, target.id, draft.fromSide, targetSide || sides.toSide);
        return;
      }
      renderScene();
    }
  }

  // Когда у одного узла появляется несколько исходящих связей с одной стороны,
  // раскладываем дочерние узлы в ровную колонку/строку с одинаковыми промежутками.
  // Это происходит только при создании связи: последующее ручное перемещение остаётся свободным.
  function autoArrangeBranch(sourceId, side) {
    const source = nodeById(sourceId);
    if (!source || !validSide(side)) return false;

    // Only edges originating from this exact parent side participate.
    const branchEdges = scene.edges.filter(edge =>
      edge.from === sourceId && edge.fromSide === side
    );
    const targetIds = [...new Set(branchEdges.map(edge => edge.to))];
    if (targetIds.length < 2) return false;

    // A node also connected from another side has an independent relationship
    // there, so leave its position untouched rather than pulling it into this branch.
    const targetsConnectedFromOtherSides = new Set(scene.edges
      .filter(edge => edge.from === sourceId && edge.fromSide !== side)
      .map(edge => edge.to));
    const targets = targetIds
      .filter(id => !targetsConnectedFromOtherSides.has(id))
      .map(id => nodeById(id))
      .filter(Boolean);
    if (targets.length < 2) return false;

    const horizontalGap = 24;
    const verticalGap = 4;
    const before = new Map(targets.map(node => [node.id, { x: node.x, y: node.y }]));
    const widthOf = node => Math.max(10, Number(node.width) || 10);
    const heightOf = node => Math.max(10, Number(node.height) || 10);

    if (side === 'right' || side === 'left') {
      // Align only this side's targets into a vertical column. Preserve their
      // average X depth so branches on the opposite side remain independent.
      const ordered = [...targets].sort((a, b) =>
        (a.y + heightOf(a) / 2) - (b.y + heightOf(b) / 2)
      );
      const totalHeight = ordered.reduce((sum, node) => sum + heightOf(node), 0)
        + verticalGap * (ordered.length - 1);
      const sourceCenterY = source.y + heightOf(source) / 2;
      let y = sourceCenterY - totalHeight / 2;

      const averageAlignedEdge = side === 'right'
        ? ordered.reduce((sum, node) => sum + node.x, 0) / ordered.length
        : ordered.reduce((sum, node) => sum + node.x + widthOf(node), 0) / ordered.length;
      const leftEdge = side === 'right'
        ? Math.max(0, averageAlignedEdge)
        : Math.max(Math.max(...ordered.map(widthOf)), averageAlignedEdge);

      ordered.forEach(node => {
        node.x = side === 'right' ? leftEdge : leftEdge - widthOf(node);
        node.y = y;
        y += heightOf(node) + verticalGap;
      });
    } else {
      // Align only this side's targets into a horizontal row. Preserve their
      // average Y depth independently from branches above or below the source.
      const ordered = [...targets].sort((a, b) =>
        (a.x + widthOf(a) / 2) - (b.x + widthOf(b) / 2)
      );
      const totalWidth = ordered.reduce((sum, node) => sum + widthOf(node), 0)
        + horizontalGap * (ordered.length - 1);
      const sourceCenterX = source.x + widthOf(source) / 2;
      let x = sourceCenterX - totalWidth / 2;

      const averageAlignedEdge = side === 'bottom'
        ? ordered.reduce((sum, node) => sum + node.y, 0) / ordered.length
        : ordered.reduce((sum, node) => sum + node.y + heightOf(node), 0) / ordered.length;
      const topEdge = side === 'bottom'
        ? Math.max(0, averageAlignedEdge)
        : Math.max(Math.max(...ordered.map(heightOf)), averageAlignedEdge);

      ordered.forEach(node => {
        node.x = x;
        node.y = side === 'bottom' ? topEdge : topEdge - heightOf(node);
        x += widthOf(node) + horizontalGap;
      });
    }

    // Keep the child anchor facing the parent branch. Reusing a side chosen
    // before auto-arranging can route the curve around the child and make the
    // arrow loop back across itself after the branch changes direction.
    const childSideByBranchSide = {
      right: 'left',
      left: 'right',
      bottom: 'top',
      top: 'bottom'
    };
    const childSide = childSideByBranchSide[side];
    const arrangedTargetIds = new Set(targets.map(node => node.id));
    let edgeSideChanged = false;
    if (childSide) {
      branchEdges.forEach(edge => {
        if (!arrangedTargetIds.has(edge.to) || edge.toSide === childSide) return;
        edge.toSide = childSide;
        edgeSideChanged = true;
      });
    }

    // Do not run chooseSides across the whole scene here: that used to rewrite
    // unrelated branches and collapse the parent's four independent directions.
    // Only the child ends participating in this branch are corrected above.
    const positionsChanged = targets.some(node => {
      const old = before.get(node.id);
      return old && (Math.abs(old.x - node.x) > 0.25 || Math.abs(old.y - node.y) > 0.25);
    });
    return positionsChanged || edgeSideChanged;
  }

  function addEdge(from, to, fromSide, toSide) {
    if (from === to) { renderScene(); return; }

    const exists = scene.edges.some(edge =>
      edge.from === from &&
      edge.to === to &&
      edge.fromSide === fromSide &&
      edge.toSide === toSide
    );

    if (exists) {
      renderScene();
      showToast('Такая связь уже существует');
      return;
    }

    const currentGlobalStyle =
      scene.edges.length > 0 && scene.edges[0].style
        ? scene.edges[0].style
        : 'curved';

    scene.edges.push({
      id: safeId(),
      from,
      to,
      fromSide,
      toSide,
      style: currentGlobalStyle,
      color: '#171717',
      bidirectional: false,
      arrowhead: true
    });

    const autoArranged = autoArrangeEnabled
      ? autoArrangeBranch(from, fromSide)
      : false;

    selectedId = from;
    selectedIds.splice(0, selectedIds.length, from);
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
    if (presentationMode || playback.active) return;

    // Build the selection from both selection representations. selectedId is
    // the primary/fallback id, while selectedIds holds the full marquee group.
    const selectedNodeIdSet = new Set(selectedIds);
    if (selectedId !== null && selectedId !== undefined) {
      selectedNodeIdSet.add(selectedId);
    }

    // Keep only IDs that still exist in the current scene.
    const nodeIds = scene.nodes
      .filter(node => selectedNodeIdSet.has(node.id))
      .map(node => node.id);
    const selectedEdgeIdSet = new Set(selectedEdgeIds);
    const edgeIds = scene.edges
      .filter(edge => selectedEdgeIdSet.has(edge.id))
      .map(edge => edge.id);

    if (!nodeIds.length && !edgeIds.length) {
      selectedId = null;
      selectedIds.splice(0);
      selectedEdgeIds.splice(0);
      updateActionButtons();
      return;
    }

    const removedNodes = new Set(nodeIds);
    const explicitlyRemovedEdges = new Set(edgeIds);

    // Determine all edges to remove before finishing an active text edit,
    // because finishing an empty edit can itself remove its node and edges.
    const removedEdges = new Set(
      scene.edges
        .filter(edge =>
          explicitlyRemovedEdges.has(edge.id) ||
          removedNodes.has(edge.from) ||
          removedNodes.has(edge.to)
        )
        .map(edge => edge.id)
    );
    const deletedNodeCount = scene.nodes.filter(node => removedNodes.has(node.id)).length;
    const deletedEdgeCount = scene.edges.filter(edge => removedEdges.has(edge.id)).length;

    closeNodeContextMenu();
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (editingId) finishEditing(editingId, true);

    // Apply both filters unconditionally so combined node/edge deletion
    // cannot fall through to an edge-only path.
    scene.nodes = scene.nodes.filter(node => !removedNodes.has(node.id));
    scene.edges = scene.edges.filter(edge => !removedEdges.has(edge.id));

    if (connectionSourceId && removedNodes.has(connectionSourceId)) {
      connectionSourceId = null;
    }
    if (contextNodeId && removedNodes.has(contextNodeId)) {
      closeNodeContextMenu();
    }
    if (editingId && removedNodes.has(editingId)) {
      editingId = null;
      editingOriginalText = null;
      shouldFocusNewNode = false;
    }
    if (linkDraft && removedNodes.has(linkDraft.fromId)) {
      linkDraft = null;
    }

    // Clear every selection source, including the single-node fallback.
    selectedId = null;
    selectedIds.splice(0);
    selectedEdgeIds.splice(0);

    closeNodeContextMenu();
    closeConfirm();
    commitScene(`Удалено узлов: ${deletedNodeCount}, связей: ${deletedEdgeCount}`);
  }
  function undo() {
    if (presentationMode || undoIndex <= 0 || playback.active) return;
    if (editingId) finishEditing(editingId, true);
    undoIndex--;
    scene = materializeSceneSnapshot(undoStack[undoIndex]); selectedId = null; selectedIds.splice(0); selectedEdgeIds.splice(0); editingId = null;
    const invalidBookmarkSlots = pruneInvalidCameraBookmarks(scene.nodes);
    recordTimeline(); renderScene(); updateCameraBookmarksUI(); saveProject(); updateActionButtons();
    showToast(invalidBookmarkSlots.length
      ? `Закладки ${invalidBookmarkSlots.join(', ')} сброшены: связанный узел отсутствует в этой версии схемы`
      : 'Действие отменено');
  }
  function redo() {
    if (presentationMode || undoIndex >= undoStack.length - 1 || playback.active) return;
    undoIndex++;
    scene = materializeSceneSnapshot(undoStack[undoIndex]); selectedId = null; selectedIds.splice(0); selectedEdgeIds.splice(0); editingId = null;
    const invalidBookmarkSlots = pruneInvalidCameraBookmarks(scene.nodes);
    recordTimeline(); renderScene(); updateCameraBookmarksUI(); saveProject(); updateActionButtons();
    showToast(invalidBookmarkSlots.length
      ? `Закладки ${invalidBookmarkSlots.join(', ')} сброшены: связанный узел отсутствует в этой версии схемы`
      : 'Действие повторено');
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

        const MAX_IMAGE_SIDE = 1920;
        if (pixelWidth > MAX_IMAGE_SIDE || pixelHeight > MAX_IMAGE_SIDE) {
          const resizeScale = Math.min(MAX_IMAGE_SIDE / pixelWidth, MAX_IMAGE_SIDE / pixelHeight);
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
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
          try {
            imageData = tempCanvas.toDataURL('image/jpeg', 0.88);
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

        const nodeId = safeId();
        const nodeImageKey = `image:${nodeId}`;
        imageStore.set(nodeImageKey, imageData);
        const node = {
          id: nodeId,
          x: insertAt.x,
          y: insertAt.y,
          text: '',
          type: 'image',
          image: imageData,
          imageKey: nodeImageKey,
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

  function copySelectedNodesToInternalClipboard() {
    const selectedNodeIdSet = new Set(selectedIds);
    if (selectedId) selectedNodeIdSet.add(selectedId);

    const selectedNodes = scene.nodes.filter(node => selectedNodeIdSet.has(node.id));
    if (!selectedNodes.length) return 0;

    // Measure the union of the selected nodes, preferring current rendered
    // dimensions but retaining model dimensions when an element is not mounted.
    const bounds = selectedNodes.reduce((result, node) => {
      const element = renderedNodeElements.get(node.id) || null;
      const x = Number(node.x) || 0;
      const y = Number(node.y) || 0;
      const width = Math.max(10, Number(element?.offsetWidth) || Number(node.width) || 120);
      const height = Math.max(10, Number(element?.offsetHeight) || Number(node.height) || 30);
      result.left = Math.min(result.left, x);
      result.top = Math.min(result.top, y);
      result.right = Math.max(result.right, x + width);
      result.bottom = Math.max(result.bottom, y + height);
      return result;
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });

    const copiedNodes = selectedNodes.map(node => {
      const copiedNode = clone(node);
      if (copiedNode.type === 'image') {
        const imageData = (node.imageKey && imageStore.get(node.imageKey)) || node.image || '';
        copiedNode.image = imageData;
      }
      return copiedNode;
    });
    const copiedNodeIds = new Set(copiedNodes.map(node => node.id));
    const copiedEdges = scene.edges
      .filter(edge => copiedNodeIds.has(edge.from) && copiedNodeIds.has(edge.to))
      .map(edge => clone(edge));

    internalClipboard = {
      nodes: copiedNodes,
      edges: copiedEdges,
      centerX: (bounds.left + bounds.right) / 2,
      centerY: (bounds.top + bounds.bottom) / 2
    };
    return copiedNodes.length;
  }

  function pasteInternalClipboardAtVisibleCenter() {
    if (presentationMode || !internalClipboard || !Array.isArray(internalClipboard.nodes) || !internalClipboard.nodes.length) {
      return 0;
    }

    if (playback.active) exitPlayback();
    if (editingId) finishEditing(editingId, true);

    const targetCenter = getVisibleCanvasCenter();
    let offsetX = targetCenter.x - (Number(internalClipboard.centerX) || 0);
    let offsetY = targetCenter.y - (Number(internalClipboard.centerY) || 0);
    // Avoid placing a fresh copy exactly on top of its source when the camera
    // has not moved since Ctrl/Cmd+C.
    if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) {
      offsetX += 28;
      offsetY += 28;
    }

    const idMap = new Map();
    const usedIds = new Set([
      ...scene.nodes.map(node => node.id),
      ...scene.edges.map(edge => edge.id)
    ]);
    const makeUniqueId = () => {
      let id = safeId();
      while (usedIds.has(id)) id = safeId();
      usedIds.add(id);
      return id;
    };
    const newNodes = internalClipboard.nodes.map(sourceNode => {
      const node = clone(sourceNode);
      const oldId = node.id;
      const newId = makeUniqueId();
      idMap.set(oldId, newId);
      node.id = newId;
      node.x = Math.max(0, Math.round((Number(node.x) || 0) + offsetX));
      node.y = Math.max(0, Math.round((Number(node.y) || 0) + offsetY));

      if (node.type === 'image') {
        const imageData = typeof node.image === 'string' && node.image ? node.image : '';
        const imageKey = `image:${newId}`;
        if (imageData) imageStore.set(imageKey, imageData);
        node.imageKey = imageKey;
        if (imageData) node.image = imageData;
        else delete node.image;
      } else {
        delete node.imageKey;
        delete node.image;
      }
      return node;
    });

    const newEdges = internalClipboard.edges
      .map(sourceEdge => {
        const edge = clone(sourceEdge);
        const newFrom = idMap.get(edge.from);
        const newTo = idMap.get(edge.to);
        if (!newFrom || !newTo) return null;
        edge.id = makeUniqueId();
        edge.from = newFrom;
        edge.to = newTo;
        return edge;
      })
      .filter(Boolean);

    scene.nodes.push(...newNodes);
    scene.edges.push(...newEdges);
    selectedIds.splice(0, selectedIds.length, ...newNodes.map(node => node.id));
    selectedId = newNodes.length ? newNodes[newNodes.length - 1].id : null;
    selectedEdgeIds.splice(0);
    editingId = null;
    editingOriginalText = null;
    shouldFocusNewNode = false;
    mode = 'select';
    syncModeButtons();
    modeIndicator.classList.remove('visible');
    stage.style.cursor = 'default';
    closeNodeContextMenu();

    commitScene(newNodes.length > 1
      ? `Вставлено элементов: ${newNodes.length}`
      : 'Элемент вставлен');
    return newNodes.length;
  }

  function positionContextMenu(x, y) {
    if (window.innerWidth < 768) {
      nodeContextMenu.style.left = '0px';
      nodeContextMenu.style.right = '0px';
      nodeContextMenu.style.top = 'auto';
      nodeContextMenu.style.bottom = '0px';
      return;
    }
    const menuWidth = nodeContextMenu.offsetWidth || 216;
    const menuHeight = nodeContextMenu.offsetHeight || 210;
    nodeContextMenu.style.right = 'auto';
    nodeContextMenu.style.bottom = 'auto';
    nodeContextMenu.style.left = `${Math.min(x, window.innerWidth - menuWidth - 8)}px`;
    nodeContextMenu.style.top = `${Math.min(y, window.innerHeight - menuHeight - 8)}px`;
  }

  function showCanvasContextMenu(x, y) {
    if (presentationMode) return;
    if (mainArea && mainArea.classList.contains('project-notes-open')) {
      setProjectNotesOpen(false);
    }
    contextNodeId = null;
    pendingImagePoint = { ...contextCanvasPoint };
    canvasContextActions.hidden = false;
    nodeContextActions.hidden = true;
    nodeContextMenu.classList.add('visible');
    positionContextMenu(x, y);
  }

  function showNodeContextMenu(id, x, y) {
    if (presentationMode) return;
    if (mainArea && mainArea.classList.contains('project-notes-open')) {
      setProjectNotesOpen(false);
    }
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
    const isTextNode = !!n && n.type !== 'image';
    if (textNodeContextActions) textNodeContextActions.hidden = !isTextNode;
    nodeContextMenu.querySelectorAll('[data-node-color]').forEach(btn => {
      btn.classList.toggle('active', !!n && btn.dataset.nodeColor === (n.color || '#111111'));
    });
    nodeContextMenu.querySelectorAll('[data-node-border-color]').forEach(btn => {
      const active = isTextNode && btn.dataset.nodeBorderColor === (n.borderColor || '#111111');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    [['underline', !!(n && n.underline)], ['highlight', !!(n && n.highlight)], ['frame', !!(isTextNode && n.framed)]].forEach(([action, active]) => {
      const btn = nodeContextMenu.querySelector(`[data-node-action="${action}"]`);
      if (!btn) return;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
      const check = btn.querySelector('.check');
      if (check) check.textContent = active ? '✓' : '';
    });
    const frameButton = nodeContextMenu.querySelector('[data-node-action="frame"]');
    const frameLabel = frameButton && frameButton.querySelector('.item-label');
    if (frameLabel) frameLabel.textContent = n && n.framed ? 'Убрать рамку' : 'Добавить рамку';
    const applyAllButton = nodeContextMenu.querySelector('[data-node-action="apply-frame-to-all"]');
    if (applyAllButton) {
      applyAllButton.disabled = !isTextNode || !scene.nodes.some(node => node.type !== 'image' && node.id !== n.id);
      applyAllButton.textContent = n && n.framed
        ? 'Применить рамку ко всем текстовым узлам'
        : 'Убрать рамку у всех текстовых узлов';
    }
  }

  nodeContextMenu?.addEventListener('click', event => {
    const menuTarget = event.target instanceof Element ? event.target : null;
    const canvasButton = menuTarget ? menuTarget.closest('[data-canvas-action]') : null;
    const isCreateTextAction = !!(canvasButton && canvasButton.dataset.canvasAction === 'create-text');

    if (isCreateTextAction) {
      // A trusted click keeps mobile user activation alive for the synchronous
      // contenteditable focus in createNodeAt(), allowing the software keyboard
      // to open on iOS Safari and Android browsers.
      event.stopPropagation();
      event.stopImmediatePropagation();

      const point = { ...contextCanvasPoint };
      closeNodeContextMenu();
      window.setTimeout(() => createNodeAt(point.x, point.y), 60);
      return;
    }

    // Color swatches must not cancel the trusted click's default behavior:
    // on mobile Safari preventDefault() here can blur the active text editor
    // and dismiss the software keyboard. Stopping propagation is sufficient.
    const textColorSwatch = menuTarget ? menuTarget.closest('[data-node-color]') : null;
    const frameColorSwatch = menuTarget ? menuTarget.closest('[data-node-border-color]') : null;
    const swatch = textColorSwatch || frameColorSwatch;
    if (swatch) {
      event.stopPropagation();
    } else {
      // All other controls and empty menu space must stay isolated from the
      // canvas underneath the context sheet.
      event.stopPropagation();
      event.preventDefault();
    }

    if (canvasButton) {
      const action = canvasButton.dataset.canvasAction;
      if (action === 'upload-image') {
        closeNodeContextMenu();
        openImageFilePicker(contextCanvasPoint);
        return;
      }
    }

    const actionButton = menuTarget ? menuTarget.closest('[data-node-action]') : null;
    const n = nodeById(contextNodeId);
    if (swatch) {
      if (!n || n.type === 'image') { closeNodeContextMenu(); return; }
      if (textColorSwatch) {
        n.color = textColorSwatch.dataset.nodeColor;
      } else if (frameColorSwatch) {
        n.borderColor = frameColorSwatch.dataset.nodeBorderColor;
        n.framed = true;
      }
      commitScene(); updateNodeContextMenu(); return;
    }
    if (!actionButton) return;
    if (!n) { closeNodeContextMenu(); return; }
    const action = actionButton.dataset.nodeAction;
    if (action === 'underline') n.underline = !n.underline;
    else if (action === 'highlight') n.highlight = !n.highlight;
    else if (action === 'frame') {
      if (n.type === 'image') return;
      n.framed = !n.framed;
      if (!/^#[0-9a-f]{6}$/i.test(String(n.borderColor || ''))) n.borderColor = '#111111';
    } else if (action === 'apply-frame-to-all') {
      if (n.type === 'image') return;
      const framed = !!n.framed;
      const borderColor = /^#[0-9a-f]{6}$/i.test(String(n.borderColor || ''))
        ? n.borderColor.toLowerCase()
        : '#111111';
      const defaultsChanged = defaultTextNodeHasBorder !== framed || defaultTextNodeBorderColor !== borderColor;

      // The bulk action defines the style for future text nodes as well as
      // applying it to the current scene. A per-node frame toggle/color change
      // never reaches this assignment and therefore stays local to that node.
      defaultTextNodeHasBorder = framed;
      defaultTextNodeBorderColor = borderColor;

      let changedCount = 0;
      scene.nodes.forEach(node => {
        if (node.type === 'image') return;
        if (!!node.framed !== framed || (node.borderColor || '#111111') !== borderColor) {
          node.framed = framed;
          node.borderColor = borderColor;
          changedCount += 1;
        }
      });
      if (!changedCount && !defaultsChanged) {
        showToast('Оформление уже применено ко всем текстовым узлам');
        updateNodeContextMenu();
        return;
      }
      const message = changedCount
        ? (framed ? 'Рамка применена ко всем текстовым узлам' : 'Рамки удалены со всех текстовых узлов')
        : (framed ? 'Рамка по умолчанию включена для новых текстовых узлов' : 'Рамка по умолчанию выключена для новых текстовых узлов');
      commitScene(message);
      updateNodeContextMenu();
      return;
    } else if (action === 'delete') {
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
  document?.addEventListener('pointerdown', event => {
    const pointerTarget = event.target instanceof Element ? event.target : null;

    // The context sheet owns every pointer sequence that begins inside it.
    // Let the native trusted click reach its controls before considering dismissal.
    if (pointerTarget && pointerTarget.closest('#nodeContextMenu')) return;
    if (!nodeContextMenu.classList.contains('visible')) return;

    // Dismiss the sheet only when the pointer lands on genuinely empty canvas.
    // Clicks on application chrome, nodes, edges, resize handles, and anchors
    // must not be interpreted as outside taps.
    if (!pointerTarget || !pointerTarget.closest('#stage')) return;
    const hitNode = pointerTarget.closest('.node[data-node-id]');
    const hitEdge = pointerTarget.closest('.edge-hit');
    const hitControl = pointerTarget.closest('.resize-handle, .anchor');
    if (hitNode || hitEdge || hitControl) return;

    closeNodeContextMenu();
  }, { capture: true });

  let confirmCancelCallback = null;

  function openConfirm(title, message, confirmLabel, callback, cancelLabel = 'Отмена', cancelCallback = null) {
    if (presentationMode) return;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalText').textContent = message;
    const confirmBtn = document.getElementById('modalConfirm');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle('danger', /удалить|очистить/i.test(String(confirmLabel || '')));
    document.getElementById('modalCancel').textContent = cancelLabel;
    confirmCallback = callback;
    confirmCancelCallback = cancelCallback;
    modalBackdrop.classList.add('visible');
  }

  function cleanupEdgeEditor() {
    if (edgeStyleOptions) {
      edgeStyleOptions.querySelectorAll('[data-edge-style]').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
        button.onclick = null;
      });
      edgeStyleOptions.querySelectorAll('[data-edge-color]').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
        button.onclick = null;
      });
      edgeStyleOptions.hidden = true;
    }
    if (edgeColorToggle) {
      edgeColorToggle.onclick = null;
      edgeColorToggle.setAttribute('aria-expanded', 'false');
    }
    if (edgeColorPalette) edgeColorPalette.classList.remove('is-expanded');
    if (edgeBidirectionalInput) {
      edgeBidirectionalInput.onchange = null;
      edgeBidirectionalInput.indeterminate = false;
    }
    if (edgeArrowheadInput) {
      edgeArrowheadInput.onchange = null;
      edgeArrowheadInput.indeterminate = false;
    }
    if (edgeColorPreview) edgeColorPreview.style.backgroundColor = '#171717';

    // Never let a stale edge-editor save action leak into the next modal.
    confirmCallback = null;
  }

  function closeConfirm(runCancelAction = false) {
    // Cancel callbacks run only for a live modal that still has its confirm action.
    const cancelAction = (
      runCancelAction &&
      typeof confirmCancelCallback === 'function' &&
      typeof confirmCallback === 'function'
    ) ? confirmCancelCallback : null;

    // Detach callbacks before closing so duplicate events cannot run the action twice.
    confirmCallback = null;
    confirmCancelCallback = null;
    modalBackdrop.classList.remove('visible');
    cleanupEdgeEditor();
    tempSelectedStyle = null;
    document.getElementById('modalCancel').textContent = 'Отмена';

    // Defer cancellation until modal cleanup and the current pointer event have completed.
    if (cancelAction) window.setTimeout(() => cancelAction(), 0);
  }

  function clearSelection() {
    tempSelectedStyle = null;
    confirmCallback = null;
    confirmCancelCallback = null;
    cleanupEdgeEditor();
    selectedId = null;
    selectedIds.splice(0);
    selectedEdgeIds.splice(0);
    closeNodeContextMenu();
    renderScene();
    updateActionButtons();
  }

  function getEdgePropertyTargets(edgeIds = selectedEdgeIds) {
    const ids = new Set(edgeIds || []);
    return scene.edges.filter(edge => ids.has(edge.id));
  }

  let tempSelectedStyle = null;

  function applyEdgeProperty(property, value) {
    if (property !== 'style') return;
    if (!['curved', 'straight', 'square', 'dashed'].includes(value)) return;
    tempSelectedStyle = value;
    if (!edgeStyleOptions) return;
    edgeStyleOptions.querySelectorAll('[data-edge-style]').forEach(button => {
      const active = button.dataset.edgeStyle === tempSelectedStyle;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateEdgeEditorState(edgeIds = selectedEdgeIds) {
    if (!edgeStyleOptions) return;
    const targets = getEdgePropertyTargets(edgeIds);

    // The editor can outlive the selection for a moment while pointer/modal
    // events are being processed. Reset every control before returning.
    if (!targets.length) {
      edgeStyleOptions.querySelectorAll('[data-edge-style], [data-edge-color]').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
      if (edgeColorPreview) edgeColorPreview.style.backgroundColor = '#171717';
      if (edgeCustomColorInput) edgeCustomColorInput.value = '#171717';
      if (edgeBidirectionalInput) {
        edgeBidirectionalInput.checked = false;
        edgeBidirectionalInput.indeterminate = false;
      }
      if (edgeArrowheadInput) {
        edgeArrowheadInput.checked = false;
        edgeArrowheadInput.indeterminate = false;
      }
      return;
    }

    const styles = targets.map(edge => edge.style || 'curved');
    const commonStyle = styles.length && styles.every(style => style === styles[0]) ? styles[0] : null;
    edgeStyleOptions.querySelectorAll('[data-edge-style]').forEach(button => {
      const active = button.dataset.edgeStyle === commonStyle;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const colors = targets.map(edge => edge.color || '#171717');
    const commonColor = colors.length && colors.every(color => color === colors[0]) ? colors[0] : null;
    edgeStyleOptions.querySelectorAll('[data-edge-color]').forEach(button => {
      const active = button.dataset.edgeColor === commonColor;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const editorColor = commonColor || colors[0] || '#171717';
    if (edgeColorPreview) edgeColorPreview.style.backgroundColor = editorColor;
    if (edgeCustomColorInput && /^#[0-9a-f]{6}$/i.test(editorColor)) {
      edgeCustomColorInput.value = editorColor;
    }

    const bidirectionalValues = targets.map(edge => edge.bidirectional === true);
    const allBidirectional = bidirectionalValues.length > 0 && bidirectionalValues.every(Boolean);
    const someBidirectional = bidirectionalValues.some(Boolean);
    if (edgeBidirectionalInput) {
      edgeBidirectionalInput.checked = allBidirectional;
      edgeBidirectionalInput.indeterminate = someBidirectional && !allBidirectional;
    }

    const arrowheadValues = targets.map(edge => edge.arrowhead !== false);
    const allArrowheads = arrowheadValues.length > 0 && arrowheadValues.every(Boolean);
    const someArrowheads = arrowheadValues.some(Boolean);
    if (edgeArrowheadInput) {
      edgeArrowheadInput.checked = allArrowheads;
      edgeArrowheadInput.indeterminate = someArrowheads && !allArrowheads;
    }
  }

  function updateSelectedEdgeProperty(edgeIds, property, value, message) {
    const targets = getEdgePropertyTargets(edgeIds);
    if (!targets.length) return;
    const changed = targets.some(edge => edge[property] !== value);
    if (!changed) return;
    targets.forEach(edge => { edge[property] = value; });
    commitScene(message);
    updateEdgeEditorState(edgeIds);
  }

  function openSelectedEdgesActions(edgeId = null, sourceEvent = null) {
    if (presentationMode) return;
    if (sourceEvent) {
      if (sourceEvent.cancelable) sourceEvent.preventDefault();
      if (sourceEvent.stopPropagation) sourceEvent.stopPropagation();
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
    const initialEdge = scene.edges.find(edge => edge.id === selectedEdgeSnapshot[0]);
    tempSelectedStyle = initialEdge && initialEdge.style ? initialEdge.style : 'curved';

    openConfirm(
      edgeCount > 1 ? `Выбрано связей: ${edgeCount}` : 'Выбрана связь',
      'Настройте стиль, цвет и направление выбранных связей.',
      'Сохранить',
      () => {
        // Keep the established global style behavior: style changes apply to every edge.
        scene.edges.forEach(edge => {
          edge.style = tempSelectedStyle || 'curved';
        });
        commitScene('Стиль связей обновлен');
      },
      'Удалить',
      () => removeEdgesById(
        selectedEdgeSnapshot,
        edgeCount > 1 ? 'Связи удалены' : 'Связь удалена'
      )
    );

    if (edgeStyleOptions) {
      edgeStyleOptions.hidden = false;
      if (edgeColorPalette) edgeColorPalette.classList.remove('is-expanded');
      if (edgeColorToggle) {
        edgeColorToggle.setAttribute('aria-expanded', 'false');
        edgeColorToggle.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          const open = edgeColorPalette
            ? !edgeColorPalette.classList.contains('is-expanded')
            : false;
          if (edgeColorPalette) edgeColorPalette.classList.toggle('is-expanded', open);
          edgeColorToggle.setAttribute('aria-expanded', String(open));
        };
      }

      edgeStyleOptions.querySelectorAll('[data-edge-style]').forEach(button => {
        button.onclick = () => applyEdgeProperty('style', button.dataset.edgeStyle);
      });
      edgeStyleOptions.querySelectorAll('[data-edge-color]').forEach(button => {
        button.onclick = () => {
          const color = String(button.dataset.edgeColor || '').toLowerCase();
          if (!/^#[0-9a-f]{6}$/i.test(color) || !EDGE_COLORS.includes(color)) return;
          updateSelectedEdgeProperty(
            selectedEdgeSnapshot,
            'color',
            color,
            'Цвет связи обновлён'
          );
          if (edgeColorPalette) edgeColorPalette.classList.add('is-expanded');
          if (edgeColorToggle) edgeColorToggle.setAttribute('aria-expanded', 'true');
        };
      });

      if (edgeCustomColorInput) {
        edgeCustomColorInput.oninput = () => {
          const color = String(edgeCustomColorInput.value || '').toLowerCase();
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          updateSelectedEdgeProperty(
            selectedEdgeSnapshot,
            'color',
            color,
            'Произвольный цвет связи обновлён'
          );
          if (edgeColorPalette) edgeColorPalette.classList.add('is-expanded');
          if (edgeColorToggle) edgeColorToggle.setAttribute('aria-expanded', 'true');
        };
      }

      if (edgeBidirectionalInput) {
        edgeBidirectionalInput.onchange = () => updateSelectedEdgeProperty(
          selectedEdgeSnapshot,
          'bidirectional',
          edgeBidirectionalInput.checked,
          'Направление связи обновлено'
        );
      }
      if (edgeArrowheadInput) {
        edgeArrowheadInput.onchange = () => updateSelectedEdgeProperty(
          selectedEdgeSnapshot,
          'arrowhead',
          edgeArrowheadInput.checked,
          'Наконечник связи обновлён'
        );
      }
      updateEdgeEditorState(selectedEdgeSnapshot);
    }
  }
  function exportProject() {
    if (editingId) finishEditing(editingId, true);
    if (!hasProjectContent()) { showToast('Проект пуст — нечего экспортировать'); return; }
    if (exportFileNameInput) exportFileNameInput.value = projectTitle.value.trim() || 'NetNorth';
    const defaultFormat = document.querySelector('input[name="exportFormat"][value="png"]');
    if (defaultFormat) defaultFormat.checked = true;
    exportScreen.classList.add('visible');
  }

  function exportStandaloneHtml(fileName) {
    exportScreen.classList.remove('visible');
    if (editingId) finishEditing(editingId, true);
    if (!scene.nodes.length) { showToast('Добавь хотя бы один узел для экспорта'); return; }

    try {
      const dark = document.body.classList.contains('dark-theme');
      const activeTheme = dark ? 'dark' : 'light';
      const sceneSnapshot = snapshot(scene);
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      const nodes = sceneSnapshot.nodes.map(node => {
        const liveElement = renderedNodeElements.get(node.id);
        const live = !!(liveElement && liveElement.isConnected);
        const fallback = node.type === 'image'
          ? { width: Math.max(10, Number(node.width) || 360), height: Math.max(10, Number(node.height) || 240) }
          : createFallbackExportNodeMetrics(node, measureContext);
        const liveRect = live && typeof liveElement.getBoundingClientRect === 'function'
          ? liveElement.getBoundingClientRect()
          : null;
        const liveExactWidth = liveRect && liveRect.width > 0
          ? Math.ceil(liveRect.width / Math.max(0.01, Number(zoom) || 1)) + 3
          : 0;
        const width = liveExactWidth > 0
          ? liveExactWidth
          : Number(fallback.width) || Math.max(10, Number(node.width) || 180);
        const height = live && Number(liveElement.offsetHeight) > 0
          ? Number(liveElement.offsetHeight)
          : Number(fallback.height) || Math.max(10, Number(node.height) || 42);
        const normalizedColor = typeof node.color === 'string' ? node.color.toLowerCase() : '#111111';
        const isDefaultTextColor = !normalizedColor || normalizedColor === '#111111' || normalizedColor === '#171717';
        const textColor = isDefaultTextColor
          ? (dark && !node.highlight ? '#f2f2f2' : '#111111')
          : normalizedColor;
        const normalizedBorder = typeof node.borderColor === 'string' ? node.borderColor.toLowerCase() : '#111111';
        const isDefaultBorder = normalizedBorder === '#111111' || normalizedBorder === '#171717';
        const borderColor = dark && isDefaultBorder ? '#e5e5e5' : normalizedBorder;
        const imageKey = typeof node.imageKey === 'string' ? node.imageKey : '';
        const imageData = node.type === 'image' && imageKey ? (imageStore.get(imageKey) || '') : '';
        return {
          id: String(node.id),
          type: node.type === 'image' ? 'image' : 'text',
          x: Number(node.x) || 0,
          y: Number(node.y) || 0,
          width: Math.max(10, width),
          height: Math.max(10, height),
          text: String(node.text || ''),
          fontSize: clamp(Number(node.fontSize) || 16, 8, 80),
          color: textColor,
          framed: node.type !== 'image' && !!node.framed,
          borderColor,
          highlight: node.type !== 'image' && !!node.highlight,
          underline: node.type !== 'image' && !!node.underline,
          autoSize: node.autoSize !== false,
          imageKey
        };
      });
      const validSides = new Set(['top', 'right', 'bottom', 'left']);
      const edges = sceneSnapshot.edges.map(edge => ({
        id: String(edge.id || ''),
        from: String(edge.from || ''),
        to: String(edge.to || ''),
        fromSide: validSides.has(edge.fromSide) ? edge.fromSide : 'right',
        toSide: validSides.has(edge.toSide) ? edge.toSide : 'left',
        style: ['curved', 'straight', 'square', 'dashed'].includes(edge.style) ? edge.style : 'curved',
        color: typeof edge.color === 'string' && /^#[0-9a-f]{6}$/i.test(edge.color) ? edge.color.toLowerCase() : '#171717',
        arrowhead: edge.arrowhead !== false,
        bidirectional: edge.bidirectional === true
      }));
      const imageAssets = collectProjectImageAssets([sceneSnapshot]);
      // Include every referenced image directly from the immutable image store.
      nodes.forEach(node => {
        if (node.type !== 'image' || !node.imageKey || imageAssets[node.imageKey]) return;
        const imageData = imageStore.get(node.imageKey);
        if (typeof imageData === 'string' && imageData) imageAssets[node.imageKey] = imageData;
      });

      const title = projectTitle.value.trim() || 'NetNorth';
      const safeFileName = String(fileName || title || 'NetNorth')
        .replace(/\.html$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/[\u0000-\u001f]/g, '')
        .trim()
        .slice(0, 90) || 'NetNorth';
      const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
      const viewerData = {
        title,
        theme: activeTheme,
        nodes,
        edges,
        images: imageAssets
      };
      const json = JSON.stringify(viewerData)
        .replace(/<\/script/gi, '<\\/script')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="${activeTheme}">
<title>${escapeHtml(title)} — NetNorth</title>
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  body { background: ${dark ? '#111111' : '#ffffff'}; color: ${dark ? '#f1f1f1' : '#171717'}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  #viewer { position: fixed; inset: 0; overflow: hidden; touch-action: none; cursor: grab; -webkit-user-select: none; user-select: none; }
  #viewer.is-dragging { cursor: grabbing; }
  #world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  #edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
  .node { position: absolute; z-index: 2; box-sizing: border-box; min-width: 0; min-height: 0; padding: 10px 12px; border: 1px solid transparent; border-radius: 2px; background: transparent; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; hyphens: manual; line-height: 1.28; font-size: 16px; font-weight: 720; letter-spacing: -.25px; color: ${dark ? '#f2f2f2' : '#111111'}; }
  .node-text { display: inline; color: inherit; font: inherit; line-height: inherit; letter-spacing: inherit; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .node.framed { border: 1.5px solid var(--node-border-color, #111111); border-radius: 9px; background: ${dark ? 'rgba(28,28,28,.97)' : 'rgba(255,255,255,.96)'}; box-shadow: 0 2px 8px rgba(0,0,0,.07); }
  .node.highlight .node-text { color: #111111; background: #ffea00; box-shadow: 2px 0 0 #ffea00, -2px 0 0 #ffea00; }
  .node.underlined .node-text { text-decoration: none; background-image: linear-gradient(currentColor, currentColor); background-repeat: repeat-x; background-size: 100% 1.5px; background-position: left calc(100% - 1px); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .node.image-node { padding: 0; border-color: transparent; border-radius: 0; background: transparent; line-height: 0; font-size: 0; white-space: normal; overflow: hidden; }
  .node-image { display: block; width: 100%; height: 100%; object-fit: fill; pointer-events: none; user-select: none; -webkit-user-drag: none; }
  a.node-link { color: ${dark ? '#82baff' : '#145fc3'}; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; cursor: pointer; overflow-wrap: break-word; word-break: normal; -webkit-user-drag: none; }
  #fitButton { position: fixed; z-index: 10; top: max(14px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); display: grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid ${dark ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.12)'}; border-radius: 9px; color: ${dark ? '#eeeeee' : '#252525'}; background: ${dark ? 'rgba(34,34,34,.68)' : 'rgba(255,255,255,.72)'}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); cursor: pointer; opacity: .72; transition: opacity .16s ease, background .16s ease, transform .16s ease; }
  #fitButton:hover { opacity: 1; transform: translateY(-1px); }
  #fitButton:active { transform: scale(.96); }
  #fitButton svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  #watermark { position: fixed; z-index: 9; right: max(15px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); color: ${dark ? '#ffffff' : '#111111'}; opacity: .35; font-size: 11px; font-weight: 750; letter-spacing: .12em; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { #fitButton { transition: none; } }
</style>
</head>
<body>
<div id="viewer" aria-label="Интерактивная схема NetNorth">
  <div id="world"><svg id="edges" aria-hidden="true"></svg></div>
</div>
<button id="fitButton" type="button" aria-label="Вписать в экран" title="Вписать в экран"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3M8 8h8v8H8z"/></svg></button>
<div id="watermark">NetNorth</div>
<script type="application/json" id="scene-data">${json}</script>
<script>
(function () {
  'use strict';
  const dataElement = document.getElementById('scene-data');
  let data;
  try { data = JSON.parse(dataElement.textContent || '{}'); } catch (_) { return; }
  const viewer = document.getElementById('viewer');
  const world = document.getElementById('world');
  const svg = document.getElementById('edges');
  const fitButton = document.getElementById('fitButton');
  const NS = 'http://www.w3.org/2000/svg';
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const images = data.images || {};
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const validSide = side => ['top', 'right', 'bottom', 'left'].includes(side) ? side : 'right';
  const nodeWidth = node => Math.max(10, numberOr(node.width, 180));
  const nodeHeight = node => Math.max(10, numberOr(node.height, 42));
  const pointFor = (node, side) => {
    const width = nodeWidth(node), height = nodeHeight(node);
    if (side === 'top') return { x: node.x + width / 2, y: node.y };
    if (side === 'right') return { x: node.x + width, y: node.y + height / 2 };
    if (side === 'bottom') return { x: node.x + width / 2, y: node.y + height };
    return { x: node.x, y: node.y + height / 2 };
  };
  const ARROW_OFFSET = 12;
  function insetEndpointBySide(point, side, offset) {
    if (!point || !offset) return point;
    if (side === 'left') return { x: point.x - offset, y: point.y };
    if (side === 'right') return { x: point.x + offset, y: point.y };
    if (side === 'top') return { x: point.x, y: point.y - offset };
    if (side === 'bottom') return { x: point.x, y: point.y + offset };
    return point;
  }
  const vectorFor = side => ({ top: {x:0,y:-1}, right:{x:1,y:0}, bottom:{x:0,y:1}, left:{x:-1,y:0} }[side] || {x:1,y:0});
  const compactPoints = points => points.filter((point, index) => {
    if (!index) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > .001 || Math.abs(point.y - previous.y) > .001;
  });
  function buildSquareContexts() {
    const groups = new Map();
    edges.forEach(edge => {
      if (edge.style !== 'square') return;
      const fromSide = validSide(edge.fromSide), toSide = validSide(edge.toSide);
      const key = edge.from + '::' + fromSide;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ edge, fromSide, toSide });
    });
    const contexts = new Map();
    const median = values => {
      if (!values.length) return 0;
      const ordered = values.slice().sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
    };
    groups.forEach(group => {
      if (group.length < 2) return;
      const first = group[0];
      const source = nodeById.get(first.edge.from);
      if (!source) return;
      const sourcePoint = pointFor(source, first.fromSide);
      const horizontal = first.fromSide === 'left' || first.fromSide === 'right';
      const direction = first.fromSide === 'right' || first.fromSide === 'bottom' ? 1 : -1;
      const origin = horizontal ? sourcePoint.x : sourcePoint.y;
      const outward = [];
      const fallback = [];
      group.forEach(item => {
        const target = nodeById.get(item.edge.to);
        if (!target) return;
        const targetPoint = pointFor(target, item.toSide);
        const coordinate = horizontal ? targetPoint.x : targetPoint.y;
        const distance = (coordinate - origin) * direction;
        if (distance > .5) outward.push(distance);
        if (Math.abs(coordinate - origin) > .5) fallback.push(Math.abs(coordinate - origin));
      });
      const distanceToBranch = median(outward.length ? outward : fallback);
      const axis = origin + direction * distanceToBranch * .5;
      group.forEach(item => contexts.set(item.edge.id, { axis, horizontal, fromSide: first.fromSide, siblingCount: group.length }));
    });
    return contexts;
  }
  function squarePoints(a, b, fromSide, toSide, context) {
    const fromVector = vectorFor(fromSide), toVector = vectorFor(toSide);
    const fromHorizontal = fromVector.x !== 0, toHorizontal = toVector.x !== 0;
    if (context && Number.isFinite(context.axis)) {
      const axis = context.axis;
      let points;
      if (fromHorizontal) {
        if (toHorizontal) {
          points = [a, {x:axis,y:a.y}, {x:axis,y:b.y}, b];
        } else {
          const sideDirection = toSide === 'top' ? -1 : 1;
          const stub = Math.min(24, Math.max(8, Math.abs(b.y - a.y) * .2));
          const branchY = b.y + sideDirection * stub;
          points = [a, {x:axis,y:a.y}, {x:axis,y:branchY}, {x:b.x,y:branchY}, b];
        }
      } else if (!toHorizontal) {
        points = [a, {x:a.x,y:axis}, {x:b.x,y:axis}, b];
      } else {
        const sideDirection = toSide === 'left' ? -1 : 1;
        const stub = Math.min(24, Math.max(8, Math.abs(b.x - a.x) * .2));
        const branchX = b.x + sideDirection * stub;
        points = [a, {x:a.x,y:axis}, {x:branchX,y:axis}, {x:branchX,y:b.y}, b];
      }
      return compactPoints(points);
    }
    const axisDistance = fromHorizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const span = Math.max(0, Math.min(80, Math.max(8, axisDistance * .25), axisDistance * .45));
    const start = {x:a.x + fromVector.x * span, y:a.y + fromVector.y * span};
    const end = {x:b.x + toVector.x * span, y:b.y + toVector.y * span};
    let bends;
    if (fromHorizontal && toHorizontal) {
      const middleX = (start.x + end.x) / 2;
      bends = [{x:middleX,y:start.y},{x:middleX,y:end.y}];
    } else if (!fromHorizontal && !toHorizontal) {
      const middleY = (start.y + end.y) / 2;
      bends = [{x:start.x,y:middleY},{x:end.x,y:middleY}];
    } else if (fromHorizontal) bends = [{x:end.x,y:start.y}];
    else bends = [{x:start.x,y:end.y}];
    return compactPoints([a,start,...bends,end,b]);
  }
  function edgePath(a, b, fromSide, toSide, style, context, appendArrowStart, appendArrowEnd) {
    if (style === 'straight') return 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
    if (style === 'square') return squarePoints(a,b,fromSide,toSide,context).map((point,index) => (index ? 'L ' : 'M ') + point.x + ' ' + point.y).join(' ');

    const horizontalSides = side => side === 'left' || side === 'right';
    const verticalSides = side => side === 'top' || side === 'bottom';
    let alignedB = null;
    if (style === 'curved' || style === 'dashed') {
      if (horizontalSides(fromSide) && horizontalSides(toSide) && Math.abs(a.y - b.y) <= 1.5) {
        alignedB = { x: b.x, y: a.y };
      } else if (verticalSides(fromSide) && verticalSides(toSide) && Math.abs(a.x - b.x) <= 1.5) {
        alignedB = { x: a.x, y: b.y };
      }
    }
    if (alignedB) {
      const startLeadPoint = appendArrowStart ? insetEndpointBySide(a, fromSide, -4.5) : a;
      const endLeadPoint = appendArrowEnd ? insetEndpointBySide(alignedB, toSide, -4.5) : alignedB;
      return 'M ' + startLeadPoint.x + ' ' + startLeadPoint.y + ' L ' + endLeadPoint.x + ' ' + endLeadPoint.y;
    }

    const curve = Math.max(28, Math.min(110, Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*.42));
    const c1 = {x:a.x,y:a.y}, c2 = {x:b.x,y:b.y};
    if (fromSide === 'right') c1.x += curve;
    if (fromSide === 'left') c1.x -= curve;
    if (fromSide === 'top') c1.y -= curve;
    if (fromSide === 'bottom') c1.y += curve;
    if (toSide === 'right') c2.x += curve;
    if (toSide === 'left') c2.x -= curve;
    if (toSide === 'top') c2.y -= curve;
    if (toSide === 'bottom') c2.y += curve;

    // Keep the Bézier itself 12px off the node, then finish with a 4.5px
    // straight segment along the connection side so the arrow enters its base centrally.
    const startLeadPoint = appendArrowStart ? insetEndpointBySide(a, fromSide, -4.5) : a;
    const endLeadPoint = appendArrowEnd ? insetEndpointBySide(b, toSide, -4.5) : b;
    let d = 'M ' + startLeadPoint.x + ' ' + startLeadPoint.y;
    if (appendArrowStart) d += ' L ' + a.x + ' ' + a.y;
    d += ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + b.x + ' ' + b.y;
    if (appendArrowEnd) d += ' L ' + endLeadPoint.x + ' ' + endLeadPoint.y;
    return d;
  }
  function svgElement(name, attributes) {
    const element = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(key => element.setAttribute(key, String(attributes[key])));
    return element;
  }
  function buildLinks(container, text) {
    const value = String(text || '');
    const pattern = /(?:https?:\\/\\/|www\\.)[^\\s<>"']+/gi;
    let last = 0, match;
    while ((match = pattern.exec(value))) {
      const raw = match[0];
      const trailingMatch = raw.match(/[.,!?;:)\\]}]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const visible = trailing ? raw.slice(0, -trailing.length) : raw;
      if (!visible) continue;
      if (match.index > last) container.appendChild(document.createTextNode(value.slice(last, match.index)));
      const anchor = document.createElement('a');
      anchor.className = 'node-link';
      anchor.textContent = visible;
      anchor.href = /^www\\./i.test(visible) ? 'https://' + visible : visible;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      container.appendChild(anchor);
      if (trailing) container.appendChild(document.createTextNode(trailing));
      last = pattern.lastIndex;
    }
    if (last < value.length) container.appendChild(document.createTextNode(value.slice(last)));
  }
  function renderGraph() {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    nodes.forEach(node => {
      node.x = numberOr(node.x, 0); node.y = numberOr(node.y, 0);
      const width = nodeWidth(node), height = nodeHeight(node);
      bounds.minX = Math.min(bounds.minX, node.x);
      bounds.minY = Math.min(bounds.minY, node.y);
      bounds.maxX = Math.max(bounds.maxX, node.x + width);
      bounds.maxY = Math.max(bounds.maxY, node.y + height);
    });
    if (!nodes.length) { bounds.minX = 0; bounds.minY = 0; bounds.maxX = 1; bounds.maxY = 1; }
    const graphWidth = Math.max(1, bounds.maxX), graphHeight = Math.max(1, bounds.maxY);
    world.style.width = graphWidth + 'px';
    world.style.height = graphHeight + 'px';
    svg.setAttribute('width', graphWidth);
    svg.setAttribute('height', graphHeight);
    svg.setAttribute('viewBox', '0 0 ' + graphWidth + ' ' + graphHeight);
    const defs = svgElement('defs');
    svg.appendChild(defs);
    const contexts = buildSquareContexts();
    edges.forEach((edge, index) => {
      const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
      if (!from || !to) return;
      const fromSide = validSide(edge.fromSide), toSide = validSide(edge.toSide);
      const a = pointFor(from, fromSide), b = pointFor(to, toSide);
      const lineStartPoint = edge.arrowhead !== false && edge.bidirectional === true
        ? insetEndpointBySide(a, fromSide, ARROW_OFFSET)
        : a;
      const lineEndPoint = edge.arrowhead !== false
        ? insetEndpointBySide(b, toSide, ARROW_OFFSET)
        : b;
      const rawColor = /^#[0-9a-f]{6}$/i.test(edge.color || '') ? edge.color.toLowerCase() : '#171717';
      const isDefault = rawColor === '#171717' || rawColor === '#111111';
      const color = data.theme === 'dark' && isDefault ? '#e5e5e5' : rawColor;
      const markerId = 'arrow-' + index;
      if (edge.arrowhead !== false) {
        const marker = svgElement('marker', { id: markerId, viewBox: '0 0 12 12', refX: 10, refY: 6, markerWidth: 10, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
        marker.appendChild(svgElement('path', { d: 'M 2 2.5 L 10.5 6 L 2 9.5 Z', fill: color, stroke: color, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
        defs.appendChild(marker);
      }
      const pathAttributes = { d: edgePath(
        lineStartPoint, lineEndPoint, fromSide, toSide, edge.style, contexts.get(edge.id),
        edge.arrowhead !== false && edge.bidirectional === true,
        edge.arrowhead !== false
      ), fill: 'none', stroke: color, 'stroke-width': 1.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      if (edge.style === 'dashed') pathAttributes['stroke-dasharray'] = '6 6';
      if (edge.arrowhead !== false) pathAttributes['marker-end'] = 'url(#' + markerId + ')';
      if (edge.arrowhead !== false && edge.bidirectional === true) pathAttributes['marker-start'] = 'url(#' + markerId + ')';
      svg.appendChild(svgElement('path', pathAttributes));
    });
    nodes.forEach(node => {
      const element = document.createElement('div');
      const isImage = node.type === 'image';
      element.className = 'node' + (isImage ? ' image-node' : '') + (node.framed ? ' framed' : '') + (node.highlight ? ' highlight' : '') + (node.underline ? ' underlined' : '');
      element.style.left = node.x + 'px';
      element.style.top = node.y + 'px';
      if (!isImage && node.autoSize !== false) {
        element.style.width = 'max-content';
        element.style.minWidth = nodeWidth(node) + 'px';
      } else {
        element.style.width = nodeWidth(node) + 'px';
      }
      element.style.height = nodeHeight(node) + 'px';
      if (isImage) {
        element.style.padding = '0';
        const img = document.createElement('img');
        img.className = 'node-image';
        img.alt = 'Изображение';
        img.draggable = false;
        img.src = images[node.imageKey] || '';
        element.appendChild(img);
      } else {
        element.style.fontSize = numberOr(node.fontSize, 16) + 'px';
        element.style.color = node.color || (data.theme === 'dark' && !node.highlight ? '#f2f2f2' : '#111111');
        if (node.framed) element.style.setProperty('--node-border-color', node.borderColor || (data.theme === 'dark' ? '#e5e5e5' : '#111111'));
        const text = document.createElement('span');
        text.className = 'node-text';
        text.style.color = node.color || (data.theme === 'dark' && !node.highlight ? '#f2f2f2' : '#111111');
        buildLinks(text, node.text);
        element.appendChild(text);
      }
      world.appendChild(element);
    });
    return bounds;
  }
  const bounds = renderGraph();
  let scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = .2, MAX_SCALE = 3;
  const clampScale = value => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  function applyTransform() { world.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
  function fitToScreen() {
    const rect = viewer.getBoundingClientRect();
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const padding = Math.min(70, Math.max(28, Math.min(rect.width, rect.height) * .06));
    scale = clampScale(Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height));
    tx = (rect.width - width * scale) / 2 - bounds.minX * scale;
    ty = (rect.height - height * scale) / 2 - bounds.minY * scale;
    applyTransform();
  }
  fitButton.addEventListener('click', fitToScreen);
  window.addEventListener('resize', fitToScreen);
  let pointers = new Map();
  let pan = null;
  let pinch = null;
  function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
  function midpoint(a,b) { return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}; }
  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target === fitButton || fitButton.contains(event.target)) return;
    event.preventDefault();
    const point = {x:event.clientX,y:event.clientY};
    const link = event.target.closest ? event.target.closest('a.node-link') : null;
    pointers.set(event.pointerId, { point, start: point, link, moved: false });
    try { viewer.setPointerCapture(event.pointerId); } catch (_) {}
    if (pointers.size === 1) {
      pan = { id:event.pointerId, start:point, tx, ty };
      pinch = null;
    } else if (pointers.size >= 2) {
      // A multi-touch gesture is navigation, never a link activation.
      pointers.forEach(pointerState => { pointerState.moved = true; });
      const list = Array.from(pointers.values()).slice(0,2);
      const middle = midpoint(list[0].point,list[1].point);
      pinch = { distance:Math.max(1,distance(list[0].point,list[1].point)), scale, worldX:(middle.x-tx)/scale, worldY:(middle.y-ty)/scale };
      pan = null;
    }
    viewer.classList.add('is-dragging');
  }
  function onPointerMove(event) {
    const state = pointers.get(event.pointerId);
    if (!state) return;
    event.preventDefault();
    state.point = {x:event.clientX,y:event.clientY};
    if (distance(state.start,state.point) > 5) state.moved = true;
    if (pointers.size >= 2 && pinch) {
      const list = Array.from(pointers.values()).slice(0,2);
      const middle = midpoint(list[0].point,list[1].point);
      const nextScale = clampScale(pinch.scale * (distance(list[0].point,list[1].point) / pinch.distance));
      scale = nextScale;
      tx = middle.x - pinch.worldX * scale;
      ty = middle.y - pinch.worldY * scale;
      applyTransform();
      return;
    }
    if (pan && pan.id === event.pointerId) {
      tx = pan.tx + (state.point.x - pan.start.x);
      ty = pan.ty + (state.point.y - pan.start.y);
      applyTransform();
    }
  }
  function onPointerUp(event) {
    const state = pointers.get(event.pointerId);
    if (!state) return;
    if (distance(state.start, {x:event.clientX,y:event.clientY}) > 5) state.moved = true;
    const cancelled = event.type === 'pointercancel' || event.type === 'lostpointercapture';
    if (!cancelled && state.link && !state.moved && !pinch && pointers.size <= 1) {
      const href = state.link.href;
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const remaining = Array.from(pointers.entries())[0];
      const id = remaining[0], current = remaining[1];
      pan = { id, start:current.point, tx, ty };
    } else if (pointers.size === 0) pan = null;
    if (pointers.size === 0) viewer.classList.remove('is-dragging');
    try { viewer.releasePointerCapture(event.pointerId); } catch (_) {}
  }
  function zoomAt(clientX, clientY, factor) {
    const rect = viewer.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const worldX = (x - tx) / scale, worldY = (y - ty) / scale;
    scale = clampScale(scale * factor);
    tx = x - worldX * scale;
    ty = y - worldY * scale;
    applyTransform();
  }
  viewer.addEventListener('pointerdown', onPointerDown);
  viewer.addEventListener('pointermove', onPointerMove);
  viewer.addEventListener('pointerup', onPointerUp);
  viewer.addEventListener('pointercancel', onPointerUp);
  viewer.addEventListener('lostpointercapture', onPointerUp);
  viewer.addEventListener('click', event => {
    const link = event.target.closest ? event.target.closest('a.node-link') : null;
    if (link) {
      event.preventDefault();
      if (event.detail === 0) window.open(link.href, '_blank', 'noopener,noreferrer');
    }
  });
  viewer.addEventListener('wheel', event => {
    event.preventDefault();
    zoomAt(event.clientX,event.clientY,Math.exp(-event.deltaY*.0015));
  }, {passive:false});
  document.addEventListener('contextmenu', event => event.preventDefault());
  requestAnimationFrame(fitToScreen);
})();
</script>
</body>
</html>`;

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeFileName + '.html';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('Интерактивный HTML экспортирован');
    } catch (error) {
      console.error('Standalone HTML export failed:', error);
      showToast('Не удалось создать HTML-файл');
    }
  }

  function exportProjectJSON(customFileName = null) {
    const sceneSnapshot = snapshot();
    const timelineSnapshot = timeline.map(frame => ({
      at: Math.max(0, Number(frame.at) || 0),
      scene: snapshot(frame.scene)
    }));
    const data = {
      format: 'osint-visualization', version: 2,
      title: projectTitle.value.trim() || 'Новая схема',
      scene: sceneSnapshot,
      timeline: timelineSnapshot,
      images: collectProjectImageAssets([sceneSnapshot, ...timelineSnapshot.map(frame => frame.scene)]),
      projectStartedAt,
      workedMs: currentProjectWorkedMs(),
      notes: projectNotes,
      checklist: clone(projectChecklist),
      cameraBookmarks: clone(cameraState.bookmarks),
      textNodeDefaults: getTextNodeDefaults()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanName = String(customFileName ?? (projectTitle.value.trim() || 'NetNorth')).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'NetNorth';
    a.href = url; a.download = `${cleanName}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Проект сохранён в JSON');
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    // Mirror the live node's `white-space: pre-wrap` + `overflow-wrap: break-word`.
    // Normal words wrap at whitespace; only an unbreakable token is split when
    // it is wider than the content box. Keep repeated spaces and explicit newlines
    // (the previous split(/\s+/) changed the text geometry during export).
    const result = [];
    const safeWidth = Math.max(1, Number(maxWidth) || 1);
    const paragraphs = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const measure = value => ctx.measureText(value).width;

    paragraphs.forEach(paragraph => {
      let line = '';
      const tokens = paragraph.match(/\s+|[^\s]+/gu) || [];
      tokens.forEach(token => {
        if (/^\s+$/u.test(token)) {
          // Preserve all whitespace. If it no longer fits, move it with the
          // following text just as a pre-wrapped line can begin with spaces.
          for (const character of Array.from(token)) {
            if (line && measure(line + character) > safeWidth) {
              result.push(line);
              line = character;
            } else if (!line && measure(character) > safeWidth) {
              result.push(character);
            } else {
              line += character;
            }
          }
          return;
        }

        if (measure(line + token) <= safeWidth || !line) {
          if (!line && measure(token) > safeWidth) {
            // CSS overflow-wrap:break-word allows only overlong words/URLs to break.
            for (const character of Array.from(token)) {
              if (line && measure(line + character) > safeWidth) {
                result.push(line);
                line = character;
              } else {
                line += character;
              }
            }
          } else {
            line += token;
          }
          return;
        }

        result.push(line);
        line = '';
        if (measure(token) <= safeWidth) {
          line = token;
          return;
        }
        for (const character of Array.from(token)) {
          if (line && measure(line + character) > safeWidth) {
            result.push(line);
            line = character;
          } else {
            line += character;
          }
        }
      });
      result.push(line);
    });

    return result.length ? result : [''];
  }

  function createFallbackExportNodeMetrics(node, measureContext = null) {
    const finitePositive = value => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const fontSize = clamp(finitePositive(node.fontSize) || 16, 8, 256);
    const lineHeight = Math.max(fontSize, fontSize * 1.28);
    const fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    const fontWeight = '720';
    const fontStyle = 'normal';
    const fontVariant = 'normal';
    const fontKerning = 'auto';
    const letterSpacing = -0.25;

    if (node.type === 'image') {
      const width = finitePositive(node.width) || 360;
      const aspectRatio = finitePositive(node.aspectRatio);
      const height = finitePositive(node.height) || (aspectRatio ? width / aspectRatio : 240);
      return {
        width: Math.max(10, width), height: Math.max(10, height),
        paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
        borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: 0,
        contentWidth: Math.max(1, width), fontSize, lineHeight, letterSpacing,
        fontFamily, fontWeight, fontStyle, fontVariant, fontKerning
      };
    }

    const mobileOuterMax = getMobileTextNodeMaxWidth();
    const horizontalPadding = mobileOuterMax ? 14 : 12;
    const verticalPadding = 10;
    const border = node.framed === true ? 1.5 : 1;
    const horizontalExtras = horizontalPadding * 2 + border * 2;
    const verticalExtras = verticalPadding * 2 + border * 2;
    const modelWidth = finitePositive(node.width);
    const modelHeight = finitePositive(node.height);
    const isFixedSize = node.autoSize === false;

    let contentWidth = 0;
    if (mobileOuterMax) {
      const mobileNodeOuterWidth = isFixedSize && modelWidth >= 10
        ? Math.min(modelWidth, mobileOuterMax)
        : mobileOuterMax;
      contentWidth = Math.max(40, mobileNodeOuterWidth - horizontalExtras);
    } else if (isFixedSize && modelWidth >= horizontalExtras + 10) {
      contentWidth = modelWidth - horizontalExtras;
    } else if (measureContext) {
      measureContext.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`;
      if ('fontKerning' in measureContext) measureContext.fontKerning = fontKerning;
      if ('letterSpacing' in measureContext) measureContext.letterSpacing = `${letterSpacing}px`;
      const paragraphs = String(node.text || '').replace(/\r\n?/g, '\n').split('\n');
      contentWidth = Math.max(fontSize * 0.65, ...paragraphs.map(line => measureContext.measureText(line || ' ').width));
    } else {
      contentWidth = Math.max(fontSize * 0.65, Math.min(960, modelWidth || 360) - horizontalExtras);
    }

    if (measureContext) {
      measureContext.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`;
      if ('fontKerning' in measureContext) measureContext.fontKerning = fontKerning;
      if ('letterSpacing' in measureContext) measureContext.letterSpacing = `${letterSpacing}px`;
    }

    const fallbackText = String(node.text || '');
    const lines = measureContext
      ? wrapCanvasText(measureContext, fallbackText, contentWidth)
      : fallbackText.split(/\r\n?|\n/);
    const measuredLineWidth = measureContext
      ? Math.max(fontSize * 0.65, ...lines.map(line => measureContext.measureText(line || ' ').width))
      : Math.max(fontSize * 0.65, ...lines.map(line => Array.from(line || ' ').length * fontSize * 0.55));

    const width = isFixedSize && modelWidth >= 10
      ? Math.min(mobileOuterMax || Infinity, modelWidth)
      : Math.max(10, Math.min(mobileOuterMax || Infinity, measuredLineWidth + horizontalExtras));
    const estimatedHeight = Math.max(1, lines.length) * lineHeight + verticalExtras;
    // Text nodes have auto height even when their width was manually fixed;
    // retain a larger known model height only as an additional safety fallback.
    const height = Math.max(estimatedHeight, modelHeight > 10 ? modelHeight : 0);

    return {
      width, height,
      paddingLeft: horizontalPadding, paddingRight: horizontalPadding,
      paddingTop: verticalPadding, paddingBottom: verticalPadding,
      borderLeft: border, borderRight: border, borderTop: border, borderBottom: border,
      contentWidth: Math.max(1, width - horizontalExtras),
      fontSize, lineHeight, letterSpacing,
      fontFamily, fontWeight, fontStyle, fontVariant, fontKerning
    };
  }

  async function copyPngBlobToClipboard(pngBlob) {
    if (!pngBlob || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
      return false;
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      return true;
    } catch (error) {
      console.warn('Could not copy PNG to clipboard:', error);
      return false;
    }
  }

  async function exportPng(format = 'png', customFileName = null) {
    exportScreen.classList.remove('visible');
    if (editingId) finishEditing(editingId, true);
    if (!scene.nodes.length) { showToast('Добавь хотя бы один узел для экспорта'); return; }

    try {
      if (document.fonts) {
        await document.fonts.ready;
      }

      // Rebuild the live scene after fonts are ready. This guarantees every
      // current node has a fresh, connected DOM element and current layout
      // metrics before export reads renderedNodeElements.
      renderScene(scene);
      void stage.offsetWidth;
      const PADDING = 100;             // итоговые пиксели с каждой стороны
      // Export scale maps graph/CSS pixels directly to output pixels. Do not
      // multiply by window.devicePixelRatio: this keeps DPR-independent sizing
      // and scales fonts, padding, borders and geometry by the same factor.
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

      // Capture the live DOM layout after finishEditing()/renderScene(). The
      // model dimensions can otherwise be stale (for example, a desktop-sized
      // node reopened on a narrow phone). offsetWidth/Height are layout pixels
      // and are not affected by the workspace's CSS zoom transform.
      const parseCssPixels = (value, fallback = 0) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const exportNodeMetrics = new Map();
      const fallbackMeasureCanvas = document.createElement('canvas');
      const fallbackMeasureContext = fallbackMeasureCanvas.getContext('2d');
      nodes.forEach(node => {
        const element = renderedNodeElements.get(node.id);
        const isLiveElement = !!(element && element.isConnected && element.parentElement === stage);
        const textElement = isLiveElement ? element.querySelector('.node-text') : null;
        const elementStyle = isLiveElement ? window.getComputedStyle(element) : null;
        const textStyle = textElement ? window.getComputedStyle(textElement) : elementStyle;
        const fallback = createFallbackExportNodeMetrics(node, fallbackMeasureContext);
        const liveWidth = isLiveElement
          ? Math.ceil(element.getBoundingClientRect().width / Math.max(0.01, Number(zoom) || 1)) + 2
          : 0;
        const liveHeight = isLiveElement ? Number(element.offsetHeight) : 0;
        const width = liveWidth > 0 ? liveWidth : fallback.width;
        const height = liveHeight > 0 ? liveHeight : fallback.height;
        const paddingLeft = elementStyle ? parseCssPixels(elementStyle.paddingLeft, fallback.paddingLeft) : fallback.paddingLeft;
        const paddingRight = elementStyle ? parseCssPixels(elementStyle.paddingRight, fallback.paddingRight) : fallback.paddingRight;
        const paddingTop = elementStyle ? parseCssPixels(elementStyle.paddingTop, fallback.paddingTop) : fallback.paddingTop;
        const paddingBottom = elementStyle ? parseCssPixels(elementStyle.paddingBottom, fallback.paddingBottom) : fallback.paddingBottom;
        const borderLeft = elementStyle ? parseCssPixels(elementStyle.borderLeftWidth, fallback.borderLeft) : fallback.borderLeft;
        const borderRight = elementStyle ? parseCssPixels(elementStyle.borderRightWidth, fallback.borderRight) : fallback.borderRight;
        const borderTop = elementStyle ? parseCssPixels(elementStyle.borderTopWidth, fallback.borderTop) : fallback.borderTop;
        const borderBottom = elementStyle ? parseCssPixels(elementStyle.borderBottomWidth, fallback.borderBottom) : fallback.borderBottom;
        const fontSize = textStyle ? parseCssPixels(textStyle.fontSize, fallback.fontSize) : fallback.fontSize;
        const computedLineHeight = textStyle ? parseCssPixels(textStyle.lineHeight, fallback.lineHeight) : fallback.lineHeight;
        const letterSpacing = textStyle && textStyle.letterSpacing !== 'normal'
          ? parseCssPixels(textStyle.letterSpacing, fallback.letterSpacing)
          : fallback.letterSpacing;
        exportNodeMetrics.set(node.id, {
          width: Math.max(10, width),
          height: Math.max(10, height),
          paddingLeft,
          paddingRight,
          paddingTop,
          paddingBottom,
          borderLeft,
          borderRight,
          borderTop,
          borderBottom,
          contentWidth: Math.max(1, width - paddingLeft - paddingRight - borderLeft - borderRight + 3),
          fontSize: Math.max(1, fontSize),
          lineHeight: Math.max(1, computedLineHeight),
          letterSpacing,
          fontFamily: textStyle ? textStyle.fontFamily : fallback.fontFamily,
          fontWeight: textStyle ? textStyle.fontWeight : fallback.fontWeight,
          fontStyle: textStyle ? textStyle.fontStyle : fallback.fontStyle,
          fontVariant: textStyle ? textStyle.fontVariant : fallback.fontVariant,
          fontKerning: textStyle ? textStyle.fontKerning : fallback.fontKerning
        });
      });

      function nodePoint(node, side) {
        const x = Number(node.x) || 0;
        const y = Number(node.y) || 0;
        const metrics = exportNodeMetrics.get(node.id);
        const w = Math.max(10, metrics ? metrics.width : (Number(node.width) || 10));
        const h = Math.max(10, metrics ? metrics.height : (Number(node.height) || 10));
        if (side === 'top') return { x: x + w / 2, y };
        if (side === 'right') return { x: x + w, y: y + h / 2 };
        if (side === 'bottom') return { x: x + w / 2, y: y + h };
        return { x, y: y + h / 2 };
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
        const metrics = exportNodeMetrics.get(node.id);
        const width = Math.max(10, metrics ? metrics.width : (Number(node.width) || 10));
        const height = Math.max(10, metrics ? metrics.height : (Number(node.height) || 10));
        includePoint(x, y);
        includePoint(x + width, y + height);
      });

      const edgeGeometry = [];
      const exportNodesById = new Map(nodes.map(node => [node.id, node]));
      const squareRouteContexts = buildSquareRouteContexts(scene.edges, exportNodesById, nodePoint);
      scene.edges.forEach(edge => {
        const a = nodeById(edge.from), b = nodeById(edge.to);
        if (!a || !b) return;
        const ap = nodePoint(a, edge.fromSide);
        const bp = nodePoint(b, edge.toSide);
        const lineStartPoint = edge.arrowhead !== false && edge.bidirectional === true
          ? insetEndpointBySide(ap, edge.fromSide, ARROW_OFFSET)
          : ap;
        const lineEndPoint = edge.arrowhead !== false
          ? insetEndpointBySide(bp, edge.toSide, ARROW_OFFSET)
          : bp;
        const axisAlignment = getAxisAlignedEdgePoints(
          lineStartPoint, lineEndPoint, edge.fromSide, edge.toSide, edge.style
        );
        const routedEndPoint = axisAlignment ? axisAlignment.bPoint : lineEndPoint;
        const arrowTipPoint = axisAlignment
          ? (axisAlignment.axis === 'horizontal'
            ? { x: bp.x, y: routedEndPoint.y }
            : { x: routedEndPoint.x, y: bp.y })
          : bp;
        const route = axisAlignment
          ? { type: 'axis-line', points: [lineStartPoint, routedEndPoint] }
          : edgeRouteFor(
            lineStartPoint, lineEndPoint, edge.fromSide, edge.toSide, edge.style,
            squareRouteContexts.get(edge.id)
          );
        edgeGeometry.push({ edge, ap, bp, arrowTipPoint, lineStartPoint, lineEndPoint: routedEndPoint, route });
        if (route.type === 'bezier') {
          includePoint(route.c1.x, route.c1.y);
          includePoint(route.c2.x, route.c2.y);
        } else {
          route.points.forEach(point => includePoint(point.x, point.y));
        }
        // Arrowheads must be included in the export bounds at both ends when enabled.
        if (edge.arrowhead !== false) {
          includePoint(bp.x, bp.y, 20);
          if (edge.bidirectional === true) includePoint(ap.x, ap.y, 20);
        }
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
      let W = 0;
      let H = 0;

      // Recalculate both dimensions after every scale reduction, including padding.
      while (true) {
        W = Math.ceil(contentW * scale + PADDING * 2);
        H = Math.ceil(contentH * scale + PADDING * 2);

        const exceedsCanvasLimits =
          W > MAX_CANVAS_SIDE ||
          H > MAX_CANVAS_SIDE ||
          W * H > MAX_CANVAS_PIXELS;

        if (!exceedsCanvasLimits || scale <= 0.01) break;
        scale *= 0.98;
      }
      const stillExceedsCanvasLimits =
        W > MAX_CANVAS_SIDE ||
        H > MAX_CANVAS_SIDE ||
        W * H > MAX_CANVAS_PIXELS;
      if (scale <= 0.01 && stillExceedsCanvasLimits) {
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

      function drawExportArrowhead(tip, angle, color) {
        const arrowLength = Math.max(7, Math.min(16, 9.5 * scale));
        const halfWidth = arrowLength * 0.44;
        const baseX = tip.x - Math.cos(angle) * arrowLength;
        const baseY = tip.y - Math.sin(angle) * arrowLength;
        const perpX = -Math.sin(angle) * halfWidth;
        const perpY = Math.cos(angle) * halfWidth;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(baseX + perpX, baseY + perpY);
        ctx.lineTo(baseX - perpX, baseY - perpY);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, 1.1 * scale);
        ctx.lineJoin = 'round';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      edgeGeometry.forEach(({ edge, ap, bp, arrowTipPoint, lineStartPoint, lineEndPoint, route }) => {
        const hasCurvedArrowLead = edge.arrowhead !== false && route.type === 'bezier';
        const hasAxisAlignedArrowLead = edge.arrowhead !== false && route.type === 'axis-line';
        const hasCurvedStartArrowLead = hasCurvedArrowLead && edge.bidirectional === true;
        const hasAxisAlignedStartArrowLead = hasAxisAlignedArrowLead && edge.bidirectional === true;
        const exportStartLeadPoint = (hasCurvedStartArrowLead || hasAxisAlignedStartArrowLead)
          ? insetEndpointBySide(lineStartPoint, edge.fromSide, -4.5)
          : lineStartPoint;
        const exportEndLeadPoint = (hasCurvedArrowLead || hasAxisAlignedArrowLead)
          ? insetEndpointBySide(lineEndPoint, edge.toSide, -4.5)
          : lineEndPoint;
        ctx.beginPath();
        ctx.moveTo(tx + exportStartLeadPoint.x * scale, ty + exportStartLeadPoint.y * scale);
        if (route.type === 'bezier') {
          if (hasCurvedStartArrowLead) {
            ctx.lineTo(tx + lineStartPoint.x * scale, ty + lineStartPoint.y * scale);
          }
          ctx.bezierCurveTo(
            tx + route.c1.x * scale, ty + route.c1.y * scale,
            tx + route.c2.x * scale, ty + route.c2.y * scale,
            tx + lineEndPoint.x * scale, ty + lineEndPoint.y * scale
          );
          if (hasCurvedArrowLead) {
            ctx.lineTo(tx + exportEndLeadPoint.x * scale, ty + exportEndLeadPoint.y * scale);
          }
        } else if (route.type === 'axis-line') {
          ctx.lineTo(tx + exportEndLeadPoint.x * scale, ty + exportEndLeadPoint.y * scale);
        } else {
          route.points.slice(1).forEach(point => {
            ctx.lineTo(tx + point.x * scale, ty + point.y * scale);
          });
        }
        const rawEdgeColor = typeof edge.color === 'string' && /^#[0-9a-f]{6}$/i.test(edge.color)
          ? edge.color.toLowerCase()
          : '#171717';
        const isDefaultDarkEdge = rawEdgeColor === '#171717' || rawEdgeColor === '#111111';
        const edgeColor = (dark && isDefaultDarkEdge) ? '#e5e5e5' : rawEdgeColor;
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = Math.max(1, 1.25 * scale);
        ctx.setLineDash(edge.style === 'dashed' ? [6, 6] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        if (edge.arrowhead !== false) {
          let endAngle;
          let startAngle;
          if (route.type === 'bezier') {
            endAngle = hasCurvedArrowLead
              ? Math.atan2(exportEndLeadPoint.y - lineEndPoint.y, exportEndLeadPoint.x - lineEndPoint.x)
              : Math.atan2(lineEndPoint.y - route.c2.y, lineEndPoint.x - route.c2.x);
            startAngle = hasCurvedStartArrowLead
              ? Math.atan2(exportStartLeadPoint.y - lineStartPoint.y, exportStartLeadPoint.x - lineStartPoint.x)
              : Math.atan2(route.c1.y - lineStartPoint.y, route.c1.x - lineStartPoint.x) + Math.PI;
          } else if (route.type === 'axis-line') {
            endAngle = Math.atan2(
              exportEndLeadPoint.y - lineEndPoint.y,
              exportEndLeadPoint.x - lineEndPoint.x
            );
            startAngle = Math.atan2(
              exportStartLeadPoint.y - lineStartPoint.y,
              exportStartLeadPoint.x - lineStartPoint.x
            );
          } else {
            const points = route.points && route.points.length > 1
              ? route.points
              : [lineStartPoint, lineEndPoint];
            const previous = points[points.length - 2];
            const next = points[1];
            endAngle = Math.atan2(lineEndPoint.y - previous.y, lineEndPoint.x - previous.x);
            startAngle = Math.atan2(next.y - lineStartPoint.y, next.x - lineStartPoint.x) + Math.PI;
          }
          drawExportArrowhead(
            { x: tx + arrowTipPoint.x * scale, y: ty + arrowTipPoint.y * scale },
            endAngle,
            edgeColor
          );
          if (edge.bidirectional === true) {
            drawExportArrowhead(
              { x: tx + ap.x * scale, y: ty + ap.y * scale },
              startAngle,
              edgeColor
            );
          }
        }
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
          const imageMetrics = exportNodeMetrics.get(node.id) ||
            createFallbackExportNodeMetrics(node, fallbackMeasureContext);
          if (imageEl) {
            ctx.drawImage(
              imageEl,
              tx + (Number(node.x) || 0) * scale,
              ty + (Number(node.y) || 0) * scale,
              Math.max(10, imageMetrics.width) * scale,
              Math.max(10, imageMetrics.height) * scale
            );
          }
          return;
        }
        const metrics = exportNodeMetrics.get(node.id) ||
          createFallbackExportNodeMetrics(node, fallbackMeasureContext);
        const fontSize = Math.max(1, metrics.fontSize) * scale;
        ctx.font = `${metrics.fontStyle} ${metrics.fontVariant} ${metrics.fontWeight} ${fontSize}px ${metrics.fontFamily}`;
        if ('fontKerning' in ctx && metrics.fontKerning) ctx.fontKerning = metrics.fontKerning;
        ctx.textBaseline = 'alphabetic';
        const nodeX = Number(node.x) || 0;
        const nodeY = Number(node.y) || 0;
        const nodeWidth = Math.max(10, metrics.width);
        const nodeHeight = Math.max(10, metrics.height);
        const hasFrame = node.framed === true;
        // Text origin and available line width now use the actual DOM padding
        // and border, including the tighter mobile padding, for framed and
        // unframed nodes alike.
        const contentOffsetX = metrics.borderLeft + metrics.paddingLeft;
        const contentOffsetY = metrics.borderTop + metrics.paddingTop;
        const px = tx + (nodeX + contentOffsetX) * scale;
        const py = ty + (nodeY + contentOffsetY) * scale;
        if (hasFrame) {
          const frameX = tx + nodeX * scale;
          const frameY = ty + nodeY * scale;
          const frameW = nodeWidth * scale;
          const frameH = nodeHeight * scale;
          const radius = Math.max(0, Math.min(9 * scale, frameW / 2, frameH / 2));
          const rawBorderColor = typeof node.borderColor === 'string' && /^#[0-9a-f]{6}$/i.test(node.borderColor)
            ? node.borderColor.toLowerCase()
            : '#111111';
          const isDefaultDarkFrameColor = rawBorderColor === '#111111' || rawBorderColor === '#171717';
          const exportBorderColor = dark && isDefaultDarkFrameColor ? '#e5e5e5' : rawBorderColor;
          ctx.beginPath();
          ctx.moveTo(frameX + radius, frameY);
          ctx.lineTo(frameX + frameW - radius, frameY);
          ctx.quadraticCurveTo(frameX + frameW, frameY, frameX + frameW, frameY + radius);
          ctx.lineTo(frameX + frameW, frameY + frameH - radius);
          ctx.quadraticCurveTo(frameX + frameW, frameY + frameH, frameX + frameW - radius, frameY + frameH);
          ctx.lineTo(frameX + radius, frameY + frameH);
          ctx.quadraticCurveTo(frameX, frameY + frameH, frameX, frameY + frameH - radius);
          ctx.lineTo(frameX, frameY + radius);
          ctx.quadraticCurveTo(frameX, frameY, frameX + radius, frameY);
          ctx.closePath();
          ctx.fillStyle = dark ? '#1c1c1c' : '#ffffff';
          ctx.fill();
          ctx.strokeStyle = exportBorderColor;
          ctx.lineWidth = Math.max(1, 1.5 * scale);
          ctx.stroke();
        }
        // Canvas and DOM use the same computed letter spacing and content-box
        // width. The old export subtracted only 2px for ordinary text nodes,
        // ignoring their 28px horizontal padding and causing line overflow.
        if ('letterSpacing' in ctx) {
          ctx.letterSpacing = `${metrics.letterSpacing * scale}px`;
        }
        const maxTextW = Math.max(1, metrics.contentWidth * scale);
        const lines = wrapCanvasText(ctx, node.text, maxTextW);
        const lineHeight = Math.max(fontSize, metrics.lineHeight * scale);
        const nodeColor = typeof node.color === 'string' ? node.color.trim() : '';
        const normalizedNodeColor = nodeColor.toLowerCase();
        const isBaseBlack = !nodeColor || normalizedNodeColor === '#111111' || normalizedNodeColor === '#171717';
        const nodeTextColor = isBaseBlack
          ? (dark && !node.highlight ? '#f2f2f2' : '#111111')
          : nodeColor;

        lines.forEach((line, i) => {
          const baseline = py + fontSize * .98 + i * lineHeight;
          const measuredLineWidth = ctx.measureText(line).width;
          const lineWidth = Math.min(maxTextW, measuredLineWidth);
          if (node.highlight) {
            ctx.fillStyle = '#ffea00';
            ctx.fillRect(px - 2 * scale, baseline - fontSize * .86,
                         lineWidth + 4 * scale, fontSize * 1.13);
          }
          ctx.fillStyle = nodeTextColor;
          // Do not let fillText horizontally squeeze a line that already fits.
          if (measuredLineWidth <= maxTextW) {
            ctx.fillText(line, px, baseline);
          } else {
            ctx.fillText(line, px, baseline, maxTextW);
          }
          if (node.underline) {
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            ctx.beginPath();
            ctx.moveTo(px, baseline + 2 * scale);
            ctx.lineTo(px + lineWidth, baseline + 2 * scale);
            ctx.stroke();
          }
        });
        if ('letterSpacing' in ctx) {
          ctx.letterSpacing = '0px';
        }
        if ('fontKerning' in ctx) ctx.fontKerning = 'auto';
      });

      const name = String(customFileName ?? (projectTitle.value.trim() || 'NetNorth')).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'NetNorth';
      canvas.toBlob(async blob => {
        if (!blob) { showToast(`Не удалось подготовить ${formatLabel}`); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        const copiedToClipboard = outputFormat === 'png' ? await copyPngBlobToClipboard(blob) : false;
        if (copiedToClipboard) {
          showToast(`PNG экспортирован и скопирован в буфер (${W} × ${H})`);
        } else {
          showToast(`${formatLabel} экспортирован (${W} × ${H})`);
        }
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
    reader.onload = async () => {
      const previousImageStore = new Map(imageStore);
      let imageStoreReplaced = false;
      try {
        // Validate the envelope before switching away from the current project.
        const data = JSON.parse(String(reader.result || ''));
        validateProjectDataStructure(data);
        const imageAssets = normalizeProjectImageAssets(data.images);
        const importedTitle = typeof data.title === 'string' && data.title.trim()
          ? data.title.slice(0, 90)
          : 'Импортированная схема';
        const timelineInput = Array.isArray(data.timeline) ? data.timeline : [];
        const importedProjectStartedAt = Number(data.projectStartedAt) || Date.now();
        const importedNotes = typeof data.notes === 'string' ? data.notes.slice(0, 100000) : '';
        const importedChecklist = sanitizeProjectChecklist(data.checklist);
        const importedCameraBookmarksData = data.cameraBookmarks;
        const importedTextNodeDefaults = normalizeTextNodeDefaults(data.textNodeDefaults);
        const importedWorkedMs = Math.max(0, Number(data.workedMs) || 0);

        // Commit the previous project while its image cache is still available.
        if (playback.active) exitPlayback();
        if (editingId) finishEditing(editingId, true);
        if (!await flushPendingSave()) {
          showToast('Не удалось сохранить текущий проект перед импортом');
          importFile.value = '';
          return;
        }
        clearProjectRuntimeCaches(false);
        imageStore.clear();
        Object.entries(imageAssets).forEach(([key, value]) => imageStore.set(key, value));
        imageStoreReplaced = true;

        const importedScene = sanitizeScene(data.scene);
        let importedTimeline = timelineInput.map(frame => ({
          at: Math.max(0, Number(frame.at) || 0),
          scene: snapshot(sanitizeScene(frame.scene))
        }));
        if (!importedTimeline.length) {
          importedTimeline = [
            { at: 0, scene: snapshot(freshScene()) },
            { at: 1, scene: snapshot(importedScene) }
          ];
        }

        scene = importedScene;
        currentProjectId = makeProjectId();
        isNewUnsavedSessionProject = true;
        initialOpenedProjectBaseline = null;
        activeSavedProjectId = null;
        activeSavedProjectData = null;
        projectTitle.value = importedTitle;
        timeline = importedTimeline;
        projectStartedAt = importedProjectStartedAt;
        projectNotes = importedNotes;
        projectChecklist = importedChecklist;
        setTextNodeDefaults(importedTextNodeDefaults);
        cameraState.bookmarks = normalizeCameraBookmarks(importedCameraBookmarksData, scene.nodes);
        updateCameraBookmarksUI();
        projectWorkedMs = importedWorkedMs;
        projectSessionStartedAt = Date.now();
        syncProjectNotesPanel();
        selectedId = editingId = null;
        selectedIds.splice(0);
        mode = 'select';
        undoStack = [snapshot()];
        undoIndex = 0;
        currentRenderScene = null;
        syncModeButtons();
        startScreen.classList.remove('visible');
        renderScene();
        saveProject();
        updateActionButtons();
        showToast('Проект открыт');
      } catch (error) {
        if (imageStoreReplaced) {
          imageStore.clear();
          previousImageStore.forEach((value, key) => imageStore.set(key, value));
          currentRenderScene = null;
          try { renderScene(scene); } catch (_) {}
        }
        console.warn('Project import failed:', error);
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
    if (presentationMode) return;
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
    if (presentationMode) return;
    // Marquee selection is intentionally desktop-only (right mouse button).
    // A single touch on empty canvas is reserved for natural one-finger panning.
    const isMouseMarquee = event.pointerType !== 'touch' && event.button === 2;
    if (!isMouseMarquee || playback.active || mode !== 'select' || drag || linkDraft || boxSelect) return;
    const target = event.target;
    if (target.closest && (target.closest('.node[data-node-id]') || target.closest('.edge-hit') || target.closest('.anchor') || target.closest('.resize-handle'))) return;

    // Desktop right-drag is the only marquee gesture. Touch input is routed
    // through startPan() so one finger always pans the canvas naturally.
    if (editingId) finishEditing(editingId, true);
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    closeNodeContextMenu();
    const point = getStagePoint(event);
    const rect = document.createElement('div'); rect.className = 'selection-rect';
    rect.style.left = `${point.x}px`; rect.style.top = `${point.y}px`; rect.style.width = '0'; rect.style.height = '0';
    stage.appendChild(rect);
    boxSelect = {
      startX: point.x, startY: point.y, x: point.x, y: point.y,
      moved: false, element: rect, pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse'
    };
    attachPointerGesture(onBoxSelectionMove, onBoxSelectionUp);
  }

  function onBoxSelectionMove(event) {
    if (!boxSelect || (boxSelect.pointerId != null && event.pointerId !== boxSelect.pointerId)) return;
    queueGesturePointerMove(event, processBoxSelectionMove);
  }

  function processBoxSelectionMove(event) {
    if (!boxSelect || (boxSelect.pointerId != null && event.pointerId !== boxSelect.pointerId)) return;
    const p = getStagePoint(event);
    boxSelect.x = p.x; boxSelect.y = p.y;
    boxSelect.moved = boxSelect.moved || Math.abs(p.x-boxSelect.startX) + Math.abs(p.y-boxSelect.startY) > 4;
    const left = Math.min(boxSelect.startX, p.x), top = Math.min(boxSelect.startY, p.y);
    boxSelect.element.style.left = `${left}px`; boxSelect.element.style.top = `${top}px`;
    boxSelect.element.style.width = `${Math.abs(p.x-boxSelect.startX)}px`;
    boxSelect.element.style.height = `${Math.abs(p.y-boxSelect.startY)}px`;
  }

  function onBoxSelectionUp(event) {
    if (!boxSelect || (boxSelect.pointerId != null && event.pointerId !== boxSelect.pointerId)) return;
    flushQueuedGesturePointerMove(event.pointerId);
    // Prevent native context-menu behavior immediately, before any DOM updates.
    if (event && event.cancelable) event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    // Keep suppressing delayed native context-menu events after either the
    // desktop right-button marquee or a mobile touch marquee.
    suppressContextMenuUntil = Date.now() + 1200;
    detachPointerGestureListeners();
    if (!boxSelect) return;
    const box = boxSelect;
    boxSelect = null;
    if (box.element.isConnected) box.element.remove();

    if (!box.moved) {
      // A tap on empty mobile canvas is not a selection gesture and must not
      // unexpectedly open the canvas context sheet. Desktop right-click keeps
      // its existing context-menu behavior.
      if (box.pointerType === 'touch') return;
      contextCanvasPoint = { x: box.startX, y: box.startY };
      showCanvasContextMenu(event && event.clientX || 0, event && event.clientY || 0);
      return;
    }

    const left = Math.min(box.startX, box.x);
    const right = Math.max(box.startX, box.x);
    const top = Math.min(box.startY, box.y);
    const bottom = Math.max(box.startY, box.y);

    const stageRect = stage.getBoundingClientRect();
    const safeZoom = Math.max(0.0001, Number(zoom) || 1);
    const selected = scene.nodes.filter(node => {
      // Auto-sized text nodes may have stale model width/height values. Prefer
      // their currently rendered bounds so the marquee selects what the user
      // can actually see, including wrapped text and mobile-sized nodes.
      const element = renderedNodeElements.get(node.id);
      if (element && element.isConnected) {
        const bounds = element.getBoundingClientRect();
        const nx1 = (bounds.left - stageRect.left) / safeZoom;
        const ny1 = (bounds.top - stageRect.top) / safeZoom;
        const nx2 = nx1 + bounds.width / safeZoom;
        const ny2 = ny1 + bounds.height / safeZoom;
        return nx2 >= left && nx1 <= right && ny2 >= top && ny1 <= bottom;
      }
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
    // Releasing the marquee only commits the selection. Context actions are
    // opened later by an explicit right-click on a node or edge.
  }

  function clearLongPress() {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = 0;
    longPressCandidate = null;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distanceBetween(a, b) {
    return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  }

  function rebasePinchFromActivePointers() {
    const pointers = [...activeTouchPointers.entries()].slice(0, 2);
    if (pointers.length < 2) return null;
    const [firstEntry, secondEntry] = pointers;
    const center = midpoint(firstEntry[1], secondEntry[1]);
    const rect = workspace.getBoundingClientRect();
    const offsetX = center.x - rect.left;
    const offsetY = center.y - rect.top;
    return {
      pointerIds: [firstEntry[0], secondEntry[0]],
      startDistance: distanceBetween(firstEntry[1], secondEntry[1]),
      startZoom: zoom,
      anchorWorld: {
        x: (workspace.scrollLeft + offsetX) / zoom,
        y: (workspace.scrollTop + offsetY) / zoom
      }
    };
  }

  function cancelGestureForPinch() {
    // Revert an in-progress one-finger drag/pan/link before the pinch takes over.
    // cancelPointerGesture() clears the shared touch map by design, so preserve
    // the currently active pointers across this intentional gesture hand-off.
    const activePointersSnapshot = [...activeTouchPointers.entries()];
    if (drag && drag.startedOnLink) suppressImmediateDraggedLinkClick(1200);
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    else pendingViewportPan = null;
    activeTouchPointers.clear();
    activePointersSnapshot.forEach(([pointerId, point]) => activeTouchPointers.set(pointerId, point));
    clearLongPress();
  }

  function triggerLongPress(candidate) {
    if (!candidate || pinchState || activeTouchPointers.size !== 1) return;
    candidate.triggered = true;
    longPressTimer = 0;
    suppressContextMenuUntil = Date.now() + 1300;

    if (candidate.startedOnLink) suppressImmediateDraggedLinkClick(1200);

    if (candidate.isBlankCanvas) {
      // A stationary hold on empty canvas activates the selection tool.
      // End the pending one-finger pan cleanly; subsequent finger drags remain
      // ordinary canvas pans rather than being converted into touch marquees.
      if (drag || linkDraft || boxSelect) cancelPointerGesture();
      lastMobileCanvasTap = null;
      setMode('select');
      showToast('Инструмент выделения активирован');
      return;
    }

    if (drag && drag.pointerId === candidate.pointerId) {
      cancelPointerGesture();
    } else if (linkDraft && linkDraft.pointerId === candidate.pointerId) {
      cancelPointerGesture();
    }

    if (candidate.edgeId) {
      openSelectedEdgesActions(candidate.edgeId);
      return;
    }
    if (candidate.nodeId) {
      showNodeContextMenu(candidate.nodeId, candidate.x, candidate.y);
    }
  }

  function handleWorkspaceTouchDown(event) {
    const initialTouchTarget = event.target instanceof Element ? event.target : null;
    if (initialTouchTarget && initialTouchTarget.closest('#projectNotesPanel')) return;

    // A previous pointerup/cancel may have detached the global touch trackers.
    // Restore them before processing this new pointer sequence.
    attachWorkspaceTouchListeners();
    if (event.pointerType !== 'touch' || playback.active) return;
    const touchTarget = event.target instanceof Element ? event.target : null;
    if (touchTarget && touchTarget.closest('#nodeContextMenu')) {
      clearLongPress();
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
      return;
    }

    if (nodeContextMenu.classList.contains('visible')) closeNodeContextMenu();

    const target = event.target instanceof Element ? event.target : null;

    // Touches inside the bottom sheet belong to its controls and never start
    // canvas gestures or become candidates for a double tap.
    if (target && target.closest('#nodeContextMenu')) {
      clearLongPress();
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
      return;
    }

    // The text tool keeps its immediate single-tap creation behaviour. In
    // select/connect modes the empty canvas can use long-press and double-tap
    // shortcuts without interfering with node or anchor interactions.
    if (mode === 'text') {
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
      return;
    }

    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinchState) {
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
      // Keep the remaining finger from reverting into a pan/drag after a pinch ends.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (activeTouchPointers.size >= 2) {
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
      cancelGestureForPinch();
      pinchState = rebasePinchFromActivePointers();
      workspace.classList.toggle('pinching', !!pinchState);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (activeTouchPointers.size !== 1 || presentationMode) return;

    const nodeElement = target && target.closest('.node[data-node-id]');
    const edgeElement = target && target.closest('.edge-hit');
    const interactiveControl = target && target.closest(
      '.anchor, .resize-handle, .node-text[contenteditable="true"], a.node-link, .selection-rect'
    );
    const isBlankCanvas = !!(target && target.closest('#stage')) &&
      !nodeElement && !edgeElement && !interactiveControl;

    mobileCanvasTapCandidate = isBlankCanvas && (mode === 'select' || mode === 'connect') ? {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false
    } : null;
    if (!isBlankCanvas) lastMobileCanvasTap = null;

    // Node-body holds still open the node's existing context sheet. Empty-canvas
    // holds are repurposed to activate selection; anchors, resize handles, links
    // and active editors keep their own interaction semantics.
    if (interactiveControl) {
      clearLongPress();
      return;
    }

    longPressCandidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      nodeId: nodeElement ? nodeElement.dataset.nodeId : null,
      edgeId: edgeElement ? edgeElement.dataset.edgeId : null,
      isBlankCanvas,
      startedOnLink: false,
      triggered: false
    };
    longPressTimer = window.setTimeout(() => {
      const candidate = longPressCandidate;
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      triggerLongPress(candidate);
    }, 500);
  }

  function handleWorkspaceTouchMove(event) {
    if (event.pointerType !== 'touch' || !activeTouchPointers.has(event.pointerId)) return;
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (mobileCanvasTapCandidate && mobileCanvasTapCandidate.pointerId === event.pointerId) {
      const tapMovement = Math.hypot(
        event.clientX - mobileCanvasTapCandidate.x,
        event.clientY - mobileCanvasTapCandidate.y
      );
      if (tapMovement > 10) {
        mobileCanvasTapCandidate.moved = true;
        lastMobileCanvasTap = null;
      }
    }

    if (pinchState) {
      if (event.cancelable) event.preventDefault();
      const [firstId, secondId] = pinchState.pointerIds;
      const first = activeTouchPointers.get(firstId);
      const second = activeTouchPointers.get(secondId);
      if (!first || !second) return;
      const center = midpoint(first, second);
      const nextZoom = pinchState.startZoom * (distanceBetween(first, second) / pinchState.startDistance);
      setZoom(nextZoom, center.x, center.y, pinchState.anchorWorld);
      return;
    }

    if (longPressCandidate && longPressCandidate.pointerId === event.pointerId) {
      const movement = Math.hypot(event.clientX - longPressCandidate.x, event.clientY - longPressCandidate.y);
      if (movement > 10) clearLongPress();
    }
  }

  function handleWorkspaceTouchEnd(event) {
    if (event.pointerType !== 'touch') return;
    const pointersBeforeEnd = activeTouchPointers.size;
    activeTouchPointers.delete(event.pointerId);

    const tapCandidate = mobileCanvasTapCandidate && mobileCanvasTapCandidate.pointerId === event.pointerId
      ? mobileCanvasTapCandidate
      : null;
    const longPressWasTriggered = !!(
      longPressCandidate && longPressCandidate.pointerId === event.pointerId && longPressCandidate.triggered
    );

    if (event.type === 'pointerup' && tapCandidate && !tapCandidate.moved &&
        !longPressWasTriggered && !pinchState && pointersBeforeEnd === 1 &&
        (mode === 'select' || mode === 'connect') && !presentationMode) {
      const now = Date.now();
      const previousTap = lastMobileCanvasTap;
      const isDoubleTap = !!previousTap &&
        now - previousTap.time <= MOBILE_DOUBLE_TAP_DELAY &&
        Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= MOBILE_DOUBLE_TAP_DISTANCE;

      if (isDoubleTap) {
        lastMobileCanvasTap = null;
        contextCanvasPoint = getStagePoint({ clientX: event.clientX, clientY: event.clientY });
        suppressContextMenuUntil = Date.now() + 1000;
        if (event.cancelable) event.preventDefault();
        showCanvasContextMenu(event.clientX, event.clientY);
      } else {
        lastMobileCanvasTap = { time: now, x: event.clientX, y: event.clientY };
      }
    } else if (event.type === 'pointercancel' || tapCandidate?.moved || longPressWasTriggered || pinchState) {
      lastMobileCanvasTap = null;
    }

    if (tapCandidate) mobileCanvasTapCandidate = null;
    if (longPressCandidate && longPressCandidate.pointerId === event.pointerId) clearLongPress();

    if (pinchState) {
      if (activeTouchPointers.size >= 2) {
        pinchState = rebasePinchFromActivePointers();
      } else if (activeTouchPointers.size === 0) {
        pinchState = null;
      }
      // Keep the performance mode until all fingers have left the canvas.
      workspace.classList.toggle('pinching', !!pinchState);
      // When one finger remains, pinchState intentionally stays active until it is lifted.
      if (event.cancelable) event.preventDefault();
    }
  }

  // Install global touch trackers during initialization and re-arm them before
  // each new pointer sequence. Capture the down event so marquee selection on
  // the stage cannot swallow long-press/double-tap detection.
  attachWorkspaceTouchListeners();
  window?.addEventListener('pointerdown', attachWorkspaceTouchListeners, { capture: true, passive: true });
  workspace?.addEventListener('pointerdown', handleWorkspaceTouchDown, { capture: true, passive: false });
  document?.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    const target = event.target instanceof Element ? event.target : null;
    // A tap on application chrome or a modal breaks the canvas double-tap pair.
    if (!target || !target.closest('#stage')) {
      mobileCanvasTapCandidate = null;
      lastMobileCanvasTap = null;
    }
  }, { capture: true, passive: true });

  stage?.addEventListener('pointerdown', startBoxSelection);
  document?.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.node.image-node')) clearImageExpandButtons();
    if (!presentationMode) return;
    if (!target || !target.closest('#stage')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);


  // When a contenteditable node receives focus, the mobile keyboard can shrink
  // the visual viewport after the focus event. Recheck during its animation so
  // the active node is brought above the keyboard without scrolling the page.
  stage?.addEventListener('focusin', event => {
    const target = event.target instanceof Element ? event.target : null;
    const editor = target && target.closest('.node-text[contenteditable="true"]');
    if (!editor) return;
    lastEditorScrollTarget = null;
    [0, 70, 160, 280, 420].forEach(delay => {
      window.setTimeout(scheduleActiveEditorVisibilityCheck, delay);
    });
  }, true);

  if (window.visualViewport) {
    window.visualViewport?.addEventListener('resize', scheduleActiveEditorVisibilityCheck, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleActiveEditorVisibilityCheck, { passive: true });
  }

  // ПКМ по пустому холсту открывает меню создания текстового узла или изображения.
  // Capture context-menu events before SVG/node handlers so the browser's
  // native menu never appears over the canvas. We route the intended app action
  // here as well, because stopPropagation() prevents later stage/node listeners.
  document?.addEventListener('contextmenu', event => {
    if (presentationMode) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    // While the app's mobile context sheet is open, suppress the browser menu
    // everywhere on the screen, not only over the canvas element.
    if (nodeContextMenu.classList.contains('visible')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

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
    if (Date.now() < suppressContextMenuUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

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
      closeNodeContextMenu();
      openSelectedEdgesActions(edgeHit.dataset.edgeId, event);
      return;
    }

    const nodeEl = targetElement && targetElement.closest('.node[data-node-id]');
    if (nodeEl) {
      showNodeContextMenu(nodeEl.dataset.nodeId, event.clientX, event.clientY);
      return;
    }

    // A right-click on empty canvas replaces any previously opened node/edge menu.
    // Do not open edge-delete actions merely because some edges are selected.
    // The modal is invoked above only when the pointer is actually over an edge.
    closeNodeContextMenu();
    contextCanvasPoint = getStagePoint(event);
    showCanvasContextMenu(event.clientX, event.clientY);
  }, { capture: true });
  // During history playback, prevent wheel scrolling anywhere on the document,
  // including when the pointer is over the playback panel. Capture + passive:false
  // ensures the browser has not already committed to its default scroll action.
  document?.addEventListener('wheel', event => {
    if (playback.active && event.cancelable) event.preventDefault();
  }, { passive: false, capture: true });

  workspace?.addEventListener('wheel', event => {
    if (playback.active) return;
    cancelCameraFlight();
    event.preventDefault();
    // Keep the coordinate frame stable until a drag/link gesture is released.
    if (drag || linkDraft) return;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const queuedZoom = pendingViewportZoom ? pendingViewportZoom.nextZoom : zoom;
    setZoom(queuedZoom * factor, event.clientX, event.clientY);
  }, { passive: false });

  stage?.addEventListener('pointerdown', event => {
    if (playback.active) return;
    if (event.button !== 0) return;

    if (presentationMode) {
      if (event.cancelable) event.preventDefault();
      startPan(event);
      return;
    }

    const pointerTarget = event.target instanceof Element ? event.target : null;
    const hitNode = pointerTarget && pointerTarget.closest('.node');
    const hitEdge = pointerTarget && pointerTarget.closest('.edge-hit');
    const hitControl = pointerTarget && (
      pointerTarget.closest('.resize-handle') || pointerTarget.closest('.anchor')
    );

    // Finish the previous editor synchronously when the user taps another node.
    // The node hit is still excluded from all canvas-level gestures below.
    if (editingId && hitNode && hitNode.dataset.nodeId !== editingId) {
      finishEditing(editingId, true);
    }

    // Nodes, edges, and their controls own their own pointer gestures. In
    // particular, never let an anchor or resize handle bubble into startPan().
    if (hitNode || hitEdge || hitControl) return;

    // A tap on bare canvas dismisses the sheet, but may continue into the
    // selected canvas tool (text creation, connect mode, or panning).
    if (nodeContextMenu.classList.contains('visible')) {
      closeNodeContextMenu();
    }

    if (selectedEdgeIds.length) {
      selectedEdgeIds.splice(0);
      refreshEdgeSelectionDecorations(scene, false);
      updateActionButtons();
    }
    if (mode === 'text') {
      // Preserve the browser's trusted pointer activation so mobile browsers
      // can focus the new editor and open the software keyboard.
      event.stopPropagation();
      const p = getStagePoint(event);
      createNodeAt(p.x, p.y);
      return;
    }
    if (mode === 'connect') {
      connectionSourceId = null;
      showToast('Нажмите на начальный узел, затем на второй');
      return;
    }
    // Finalize the active editor before starting a canvas pan. finishEditing()
    // may commit/render once; onPointerUp now only refreshes selection decorations.
    if (editingId) finishEditing(editingId, true);
    startPan(event);
  }, { passive: false });
  document.querySelectorAll('[data-mode]').forEach(btn => btn?.addEventListener('click', () => {
    setMode(btn.dataset.mode);
  }));
  document.getElementById('deleteBtn')?.addEventListener('click', deleteSelected);
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  document.getElementById('exportBtn')?.addEventListener('click', exportProject);
  presentationModeBtn?.addEventListener('click', enterPresentationMode);
  presentationExitBtn?.addEventListener('click', exitPresentationMode);
  const themeToggleButton = document.getElementById('themeToggleBtn');
  themeToggleButton?.addEventListener('click', () => applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'));
  // Space is reserved for canvas/workspace interactions. Do not allow the
  // browser's native button activation (which normally fires on keyup) to
  // toggle the theme when this control keeps keyboard focus after a click.
  const preventThemeButtonSpaceActivation = event => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
  };
  themeToggleButton?.addEventListener('keydown', preventThemeButtonSpaceActivation, true);
  themeToggleButton?.addEventListener('keyup', preventThemeButtonSpaceActivation, true);
  document.getElementById('cancelPngExportBtn')?.addEventListener('click', () => exportScreen.classList.remove('visible'));
  document.getElementById('downloadPngBtn')?.addEventListener('click', () => {
    const option = document.querySelector('input[name="exportFormat"]:checked');
    const fileName = exportFileNameInput?.value?.trim() || projectTitle.value.trim() || 'NetNorth';
    if (option && option.value === 'json') {
      exportScreen.classList.remove('visible');
      exportProjectJSON(fileName);
      return;
    }
    if (option && option.value === 'html') {
      exportStandaloneHtml(fileName);
      return;
    }
    if (!scene.nodes.length) {
      showToast('Добавь хотя бы один узел для экспорта картинки');
      return;
    }
    exportPng(option ? option.value : 'png', fileName);
  });
  exportScreen?.addEventListener('pointerdown', event => { if (event.target === exportScreen) exportScreen.classList.remove('visible'); });
  importFile?.addEventListener('change', () => importProjectFile(importFile.files && importFile.files[0]));
  imageFile?.addEventListener('change', event => {
    const file = event.currentTarget.files && event.currentTarget.files[0];
    event.currentTarget.value = ''; // Allows choosing the same image again later.
    if (file) insertImageFile(file, pendingImagePoint);
  });
  document?.addEventListener('paste', event => {
    if (presentationMode) {
      internalClipboardPasteRequested = false;
      event.preventDefault();
      return;
    }
    const target = event.target;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
      internalClipboardPasteRequested = false;
      return;
    }

    const items = event.clipboardData && event.clipboardData.items;
    let imageFileFromClipboard = null;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && ['image/png', 'image/jpeg'].includes(String(item.type || '').toLowerCase())) {
          imageFileFromClipboard = item.getAsFile();
          if (imageFileFromClipboard) break;
        }
      }
    }

    // System clipboard images always have priority over the internal node clipboard.
    if (imageFileFromClipboard) {
      internalClipboardPasteRequested = false;
      event.preventDefault();
      pendingImagePoint = getVisibleCanvasCenter();
      insertImageFile(imageFileFromClipboard, pendingImagePoint);
      return;
    }

    if (internalClipboardPasteRequested && internalClipboard && internalClipboard.nodes && internalClipboard.nodes.length) {
      internalClipboardPasteRequested = false;
      event.preventDefault();
      pasteInternalClipboardAtVisibleCenter();
      return;
    }
    internalClipboardPasteRequested = false;
  });
  document.getElementById('playHistoryBtn')?.addEventListener('click', () => playback.active ? togglePlayback() : openPlayback());
  document.getElementById('playPauseBtn')?.addEventListener('click', togglePlayback);
  document.getElementById('exitPlaybackBtn')?.addEventListener('click', exitPlayback);
  playbackRange?.addEventListener('input', event => seekPlayback(event.target.value));
  projectTitle?.addEventListener('input', saveProject);
  projectTitle?.addEventListener('blur', () => { if (!projectTitle.value.trim()) projectTitle.value = 'Новая схема'; saveProject(); });


  projectNotesToggle?.addEventListener('click', () => {
    setProjectNotesOpen(!mainArea.classList.contains('project-notes-open'));
  });
  projectNotesClose?.addEventListener('click', () => setProjectNotesOpen(false));
  projectNotesBackdrop?.addEventListener('click', () => setProjectNotesOpen(false));
  projectNotesInput?.addEventListener('input', () => {
    projectNotes = projectNotesInput.value.slice(0, 100000);
    saveProject();
  });
  projectChecklistForm?.addEventListener('submit', event => {
    event.preventDefault();
    const text = projectChecklistInput.value.trim().slice(0, 240);
    if (!text) return;
    if (projectChecklist.length >= 300) {
      showToast('В чек-листе можно хранить не более 300 задач');
      return;
    }
    projectChecklist.push({ id: safeId(), text, done: false });
    projectChecklistInput.value = '';
    renderProjectChecklist();
    saveProject();
    projectChecklistInput.focus({ preventScroll: true });
  });
  projectChecklistList?.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-checklist-toggle]');
    if (!checkbox) return;
    const task = projectChecklist.find(item => item.id === checkbox.dataset.checklistToggle);
    if (!task) return;
    task.done = checkbox.checked;
    const row = checkbox.closest('.project-checklist-item');
    if (row) row.classList.toggle('is-done', task.done);
    if (projectChecklistProgress) {
      const completed = projectChecklist.filter(item => item.done).length;
      projectChecklistProgress.textContent = `${completed} / ${projectChecklist.length}`;
    }
    saveProject();
  });
  projectChecklistList?.addEventListener('click', event => {
    const remove = event.target.closest('[data-checklist-delete]');
    if (!remove) return;
    const id = remove.dataset.checklistDelete;
    projectChecklist = projectChecklist.filter(item => item.id !== id);
    renderProjectChecklist();
    saveProject();
  });
  imageLightboxClose?.addEventListener('click', closeImageLightbox);
  imageLightbox?.addEventListener('pointerdown', event => {
    if (event.target !== imageLightboxImg) closeImageLightbox();
  });
  imageLightboxStage?.addEventListener('pointerdown', handleImageLightboxPointerDown);
  imageLightboxStage?.addEventListener('pointermove', handleImageLightboxPointerMove, { passive: false });
  imageLightboxStage?.addEventListener('pointerup', handleImageLightboxPointerEnd);
  imageLightboxStage?.addEventListener('pointercancel', handleImageLightboxPointerEnd);
  imageLightboxStage?.addEventListener('lostpointercapture', handleImageLightboxPointerEnd);
  imageLightboxStage?.addEventListener('wheel', event => {
    if (!imageLightbox?.classList.contains('visible')) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    setImageLightboxZoom(imageLightboxScale * factor);
  }, { passive: false });
  window.addEventListener('resize', () => {
    if (imageLightbox?.classList.contains('visible')) updateImageLightboxTransform();
  });
  imageLightbox?.addEventListener('click', event => {
    if (event.target === imageLightbox) closeImageLightbox();
  });
  document?.addEventListener('keydown', event => {
    if (!imageLightbox?.classList.contains('visible')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') closeImageLightbox();
  }, true);

  document?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mainArea.classList.contains('project-notes-open')) {
      setProjectNotesOpen(false);
      event.stopImmediatePropagation();
    }
  });
  cameraBookmarksPanel?.addEventListener('click', event => {
    const clearButton = event.target.closest('[data-camera-clear]');
    if (clearButton) {
      event.preventDefault();
      event.stopPropagation();
      clearCameraBookmark(clearButton.dataset.cameraClear);
      return;
    }
    const goButton = event.target.closest('[data-camera-go]');
    if (!goButton) return;
    event.preventDefault();
    const slot = goButton.dataset.cameraGo;
    if (cameraState.bookmarks[slot]) flyToCameraBookmark(slot);
    else saveCameraBookmark(slot);
  });

  // Direct canvas interaction takes control away from an in-progress camera flight.
  workspace?.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !target.closest('.camera-bookmarks')) cancelCameraFlight();
  }, { capture: true });

  document.getElementById('clearBtn')?.addEventListener('click', () => openConfirm('Очистить рабочее поле?', 'Все узлы и связи будут удалены из текущей схемы. Это действие можно отменить.', 'Очистить', () => {
    if (playback.active) exitPlayback();
    if (drag || linkDraft || boxSelect) cancelPointerGesture();
    if (editingId) finishEditing(editingId, true);
    clearProjectRuntimeCaches(false);
    scene = freshScene(); selectedId = editingId = null; selectedIds.splice(0); linkDraft = null; connectionSourceId = null;
    commitScene('Рабочее поле очищено');
  }));
  document.getElementById('modalCancel')?.addEventListener('click', () => closeConfirm(true));
  document.getElementById('modalConfirm')?.addEventListener('click', () => { const fn = confirmCallback; try { if (fn) fn(); } finally { closeConfirm(false); } });
  modalBackdrop?.addEventListener('pointerdown', event => { if (event.target === modalBackdrop) closeConfirm(false); });

  exitSaveBtn?.addEventListener('click', saveAndExitToStartScreen);
  exitWithoutSaveBtn?.addEventListener('click', exitWithoutSavingToStartScreen);
  exitCancelBtn?.addEventListener('click', closeExitConfirm);
  exitConfirmBackdrop?.addEventListener('pointerdown', event => {
    if (event.target === exitConfirmBackdrop) closeExitConfirm();
  });

  emptyStateCloseBtn?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    emptyHintDismissed = true;
    emptyStateCloseBtn.blur();
    if (localStorageAvailable) {
      try { localStorage.setItem(EMPTY_HINT_DISMISSED_KEY, '1'); } catch (_) {}
    }
    updateEmptyState();
  });

  document.getElementById('createCanvasBtn')?.addEventListener('click', () => {
    closeProjectActionsMenu();
    void beginNewProject();
  });
  const brandHome = document.querySelector('.brand');
  const activateBrandHome = event => {
    event.preventDefault();
    closeProjectActionsMenu();
    void confirmExit();
  };
  brandHome?.addEventListener('click', activateBrandHome);
  brandHome?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activateBrandHome(event);
  });
  document.getElementById('openPreviousBtn')?.addEventListener('click', () => {
    closeProjectActionsMenu();
    showStartPanel('startProjectsPanel');
  });
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    closeProjectActionsMenu();
    showStartPanel('startSettingsPanel');
  });
  document.querySelectorAll('[data-start-back]').forEach(button => button?.addEventListener('click', () => {
    closeProjectActionsMenu();
    if (!startScreen.classList.contains('visible')) showStartScreen();
    else showStartPanel('startMainPanel');
  }));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button?.addEventListener('click', () => applyTheme(button.dataset.themeChoice)));
  document.getElementById('autoArrangeToggle')?.addEventListener('change', event => setAutoArrangeEnabled(event.currentTarget.checked));
  document.getElementById('projectViewSwitcher')?.addEventListener('click', event => {
    const button = event.target.closest('[data-project-view]');
    if (!button) return;
    event.preventDefault();
    setProjectViewMode(button.dataset.projectView);
  });
  document.getElementById('savedProjectList')?.addEventListener('click', event => {
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
      void openSavedProject(openButton.dataset.projectOpenId);
    }
  });

  projectActionsMenu?.addEventListener('click', event => {
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

  document?.addEventListener('pointerdown', event => {
    if (!projectActionsMenu.classList.contains('visible')) return;
    if (event.target.closest('#projectActionsMenu') || event.target.closest('[data-project-actions-id]')) return;
    closeProjectActionsMenu();
  });
  window?.addEventListener('resize', closeProjectActionsMenu);
  document.getElementById('savedProjectList')?.addEventListener('scroll', closeProjectActionsMenu, { passive: true });

  // Handle validation in JavaScript so an empty title reaches our toast instead
  // of being blocked by the browser's native `required` validation.
  projectRenameForm.noValidate = true;
  projectRenameForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const submittedTitle = projectRenameInput.value;
    const renamed = await renameProject(renameTargetProjectId, submittedTitle);

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
  projectRenameCancelBtn?.addEventListener('click', closeRenameProjectModal);
  projectRenameBackdrop?.addEventListener('pointerdown', event => {
    if (event.target === projectRenameBackdrop) closeRenameProjectModal();
  });

  projectDeleteCancelBtn?.addEventListener('click', closeDeleteProjectModal);
  projectDeleteConfirmBtn?.addEventListener('click', () => { void deleteProject(deleteTargetProjectId); });
  projectDeleteBackdrop?.addEventListener('pointerdown', event => {
    if (event.target === projectDeleteBackdrop) closeDeleteProjectModal();
  });
  document.getElementById('importFromStartBtn')?.addEventListener('click', () => importFile.click());

  // Mouse clicks should not leave toolbar buttons as the keyboard focus target.
  const blurToolbarButtonAfterClick = event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    if (button) button.blur();
  };
  document.querySelector('.topbar')?.addEventListener('click', blurToolbarButtonAfterClick);
  document.getElementById('floatingDock')?.addEventListener('click', blurToolbarButtonAfterClick);

  document?.addEventListener('keydown', event => {
    if (presentationMode) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        exitPresentationMode();
      } else {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
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

    // Alt disables Smart Size Snap immediately, even before the next pointermove.
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      if (drag && drag.type === 'resize') clearFontSizeSnapHighlights(drag);
      return;
    }

    if (event.code === 'Space' || event.key === ' ' || ['PageUp', 'PageDown', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
      return;
    }

    const hasPrimaryModifier = event.ctrlKey || event.metaKey;
    const isCopyKey = event.code === 'KeyC' || String(event.key || '').toLowerCase() === 'c';
    const isPasteKey = event.code === 'KeyV' || String(event.key || '').toLowerCase() === 'v';
    if (!startScreen.classList.contains('visible') && hasPrimaryModifier && !event.shiftKey && !event.altKey) {
      if (isCopyKey) {
        // Preserve the browser's normal copy behavior when ordinary text is selected.
        const selectedText = window.getSelection()?.toString() || '';
        if (!selectedText) {
          const copiedCount = copySelectedNodesToInternalClipboard();
          if (copiedCount) {
            event.preventDefault();
            showToast(copiedCount > 1 ? `Скопировано элементов: ${copiedCount}` : 'Элемент скопирован');
            return;
          }
        }
      } else if (isPasteKey && internalClipboard && internalClipboard.nodes && internalClipboard.nodes.length) {
        // Let the native paste event inspect clipboard files first; its handler
        // gives PNG/JPEG files priority and otherwise pastes this internal group.
        internalClipboardPasteRequested = true;
        window.setTimeout(() => {
          if (!internalClipboardPasteRequested) return;
          internalClipboardPasteRequested = false;
          pasteInternalClipboardAtVisibleCenter();
        }, 30);
        return;
      }
    }

    if (!startScreen.classList.contains('visible') && !event.altKey) {
      const numberKey = ({ Digit1: '1', Digit2: '2', Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3' })[event.code];
      if (numberKey && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
        event.preventDefault();
        saveCameraBookmark(numberKey);
        return;
      }
      if (numberKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && cameraState.bookmarks[numberKey]) {
        event.preventDefault();
        flyToCameraBookmark(numberKey);
        return;
      }
    }
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
    if (event && event.type === 'pagehide' && id && hasProjectContent()) {
      checkpointProjectWorkTime();
      saveProject();
    }
    if (id && !hasProjectContent()) {
      void deleteEmptyProject(id);
      return;
    }

    const dirty = !!(id && hasProjectContent() && hasUnsavedChanges());

    if (event && event.type === 'beforeunload') {
      if (dirty) {
        // Browsers do not reliably allow custom HTML dialogs during unload.
        // Ask for the native confirmation instead; pagehide saves only if unload proceeds.
        event.preventDefault();
        event.returnValue = '';
        return '';
      }

      // If the model is already saved, complete a queued write without prompting.
      if ((pendingSave && (!id || pendingSave.id === id)) || activeSavePromise) void flushPendingSave();
      return;
    }

    // pagehide means navigation/closing is proceeding. Start the IDB transaction
    // immediately because the 140 ms debounce may never fire; browsers may not
    // guarantee completion after a page lifecycle event.
    if (id && hasProjectContent() && dirty) saveProject();
    if (pendingSave || activeSavePromise) void flushPendingSave();
  }
  window?.addEventListener('beforeunload', flushBeforeLeavingPage);
  window?.addEventListener('pagehide', flushBeforeLeavingPage);
  window?.addEventListener('resize', () => {
    if (nodeContextMenu.classList.contains('visible')) {
      const rect = nodeContextMenu.getBoundingClientRect();
      positionContextMenu(rect.left, rect.top);
    }
    if (resizeRenderTimer) clearTimeout(resizeRenderTimer);
    resizeRenderTimer = window.setTimeout(() => {
      resizeRenderTimer = 0;
      // Mobile virtual keyboards resize the visual viewport. Rebuilding the
      // scene while a contenteditable node is active detaches its editor and
      // drops the software-keyboard focus, so defer rendering until editing ends.
      if (editingId !== null) return;
      renderScene(currentRenderScene || scene);
    }, 150);
  });
  workspace?.addEventListener('scroll', scheduleViewportCulling, { passive: true });

  // Initial state: projects are opened from the start menu, rather than loaded invisibly.
  try {
    // A full localStorage quota must not disable IndexedDB project storage.
    // Check API accessibility without attempting a quota-consuming write.
    const storage = window.localStorage;
    void storage.length;
    void storage.getItem(PROJECT_INDEX_KEY);
    localStorageAvailable = true;
  } catch (_) { localStorageAvailable = false; }
  if (localStorageAvailable) {
    migrateLegacyNetNorthStorage();
    projectStorageMigrationPromise = (async () => {
      await migrateLegacyProject();
      await migrateLocalStorageProjectRecordsToIndexedDB();
    })().catch(error => {
      console.warn('Project storage migration could not be completed:', error);
    });
    try {
      applyTheme(localStorage.getItem(THEME_KEY) || 'light', false);
      autoArrangeEnabled = localStorage.getItem(AUTO_ARRANGE_KEY) !== '0';
      emptyHintDismissed = localStorage.getItem(EMPTY_HINT_DISMISSED_KEY) === '1';
      projectViewMode = normalizeProjectViewMode(localStorage.getItem(PROJECT_VIEW_KEY) || 'list');
    } catch (_) {
      applyTheme('light', false);
      autoArrangeEnabled = true;
    }
  } else {
    applyTheme('light', false);
    autoArrangeEnabled = true;
  }
  updateProjectViewSwitcher();
  updateAutoArrangeChoice();
  updateCameraBookmarksUI();
  scene = freshScene();
  projectTitle.value = 'Новая схема';
  projectStartedAt = Date.now();
  projectSessionStartedAt = 0;
  projectWorkedMs = 0;
  projectNotes = '';
  projectChecklist = [];
  syncProjectNotesPanel();
  timeline = [{ at: 0, scene: freshScene() }];
  undoStack = [snapshot()]; undoIndex = 0;
  renderScene();
  updateActionButtons();
  updateProjectNotesMeta();
  // Count only time while this page is visible. Browsers fire visibilitychange
  // when a tab is backgrounded or a mobile screen is locked.
  document?.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      checkpointProjectWorkTime();
      projectSessionStartedAt = 0;
      updateProjectNotesMeta();

      if (currentProjectId && hasProjectContent()) {
        saveProject();
        // Start the IndexedDB transaction immediately; page lifecycle events cannot await it.
        void flushPendingSave();
      }
      return;
    }

    if (currentProjectId) {
      projectSessionStartedAt = Date.now();
      updateProjectNotesMeta();
    }
  });

  window.setInterval(() => {
    if (document.hidden) return;
    if (!currentProjectId) return;
    checkpointProjectWorkTime();
    if (hasProjectContent()) saveProject();
  }, 60000);
  showStartScreen();
})();
