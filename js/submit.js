/**
 * We Designerz — форма добавления/редактирования проекта (T3 + edit route A).
 * Добавление: гейт без логина → форма → insert со status='pending'.
 * Редактирование (submit.html?id=…): загружаем свой проект, префилл, update
 * (status/is_core не трогаем — их всё равно перехватит триггер и RLS). RLS сам
 * не даст вставить/править published или чужой author_id — фронт этого не обходит.
 */
import { supabase } from './supabase.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { t } from './i18n/ru.js';
import { CATEGORY_LABELS, fetchProjectById } from './projects.js';
import { STAGE_KEYS, LOOKING_KEYS, isStage, stageLabel, lookingLabel } from './vocab.js';
import { isHttpUrl, normalizeHttpUrl, autoGrowTextarea } from './util.js';
import { optimizeImage, readImageDimensions } from './image.js';

const TOOL_PRESETS = ['Claude', 'ChatGPT', 'Cursor', 'v0', 'Lovable', 'Bolt'];
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 9;
const MAX_DESCRIPTION_LEN = 5000;
const MAX_URL_LEN = 300;
const MAX_TOOLS = 10;
const COVER_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const gate = document.querySelector('[data-submit-gate]');
const formWrap = document.querySelector('[data-submit-form-wrap]');
const successEl = document.querySelector('[data-submit-success]');
const form = document.getElementById('submit-form');

if (gate && formWrap && form) {
  const tagsGroup = form.querySelector('[data-tags-group]');
  const toolsGroup = form.querySelector('[data-tools-group]');
  const stageGroup = form.querySelector('[data-stage-group]');
  const lookingGroup = form.querySelector('[data-looking-group]');
  const customInput = form.querySelector('[data-tool-custom-input]');
  const customAddBtn = form.querySelector('[data-tool-custom-add]');
  const coverInput = form.querySelector('[data-cover-input]');
  const coverFilenameEl = form.querySelector('[data-cover-filename]');
  const coverPreview = form.querySelector('[data-cover-preview]');
  const coverPreviewImg = form.querySelector('[data-cover-preview-img]');
  const coverRemoveBtn = form.querySelector('[data-cover-remove]');
  const imagesInput = form.querySelector('[data-images-input]');
  const imagesCountEl = form.querySelector('[data-images-count]');
  const imagesGrid = form.querySelector('[data-images-grid]');
  const submitBtn = form.querySelector('[data-submit-btn]');
  const submitError = form.querySelector('[data-submit-error]');

  const editId = new URLSearchParams(window.location.search).get('id');
  const isEdit = !!editId;

  const selectedTags = new Set();
  const selectedTools = new Set();
  const selectedLooking = new Set();
  let selectedStage = null; // одна стадия или null
  let coverFile = null;
  let currentUser = null;
  let submitting = false;
  let editLoaded = false; // проект для редактирования уже подтянут
  let existingCoverUrl = null; // текущая обложка в edit-режиме (если не меняем файл)
  // Доп. изображения: { file: File|null, url: string|null, previewUrl } — url задан для
  // уже загруженных (edit-префилл), file — для новых, выбранных в этой сессии формы.
  let imageItems = [];
  let removedImageUrls = []; // старые images, убранные в edit — удалим из Storage после сохранения

  applyStaticText();
  buildTagChips();
  buildToolChips();
  buildStageChips();
  buildLookingChips();
  if (isEdit) applyEditModeText();
  form.description.addEventListener('input', () => autoGrowTextarea(form.description));

  function applyStaticText() {
    document.querySelector('[data-submit-gate-text]').textContent = t('submit.gate.text');
    document.querySelector('[data-submit-gate-item1-title]').textContent = t('submit.gate.item1.title');
    document.querySelector('[data-submit-gate-item1-text]').textContent = t('submit.gate.item1.text');
    document.querySelector('[data-submit-gate-item2-title]').textContent = t('submit.gate.item2.title');
    document.querySelector('[data-submit-gate-item2-text]').textContent = t('submit.gate.item2.text');
    document.querySelector('[data-submit-gate-item3-title]').textContent = t('submit.gate.item3.title');
    document.querySelector('[data-submit-gate-item3-text]').textContent = t('submit.gate.item3.text');
    document.querySelector('[data-submit-gate-action]').textContent = t('submit.gate.action');

    form.querySelector('[data-label-title]').textContent = t('submit.field.title');
    form.querySelector('#submit-title').placeholder = t('submit.field.title.placeholder');
    form.querySelector('[data-label-description]').textContent = t('submit.field.description');
    form.querySelector('#submit-description').placeholder = t('submit.field.description.placeholder');
    form.querySelector('[data-label-url]').textContent = t('submit.field.url');
    form.querySelector('#submit-url').placeholder = t('submit.field.url.placeholder');
    form.querySelector('[data-label-cover]').textContent = t('submit.field.cover');
    form.querySelector('[data-cover-choose]').textContent = t('submit.field.cover.choose');
    form.querySelector('[data-hint-cover]').textContent = t('submit.field.cover.hint');
    form.querySelector('[data-cover-remove]').textContent = t('submit.field.cover.remove');
    coverFilenameEl.textContent = t('submit.field.cover.filename_empty');
    form.querySelector('[data-label-images]').textContent = t('submit.field.images');
    form.querySelector('[data-images-choose]').textContent = t('submit.field.images.choose');
    form.querySelector('[data-hint-images]').textContent = t('submit.field.images.hint');
    updateImagesCount();
    form.querySelector('[data-label-tags]').textContent = t('submit.field.tags');
    form.querySelector('[data-hint-tags]').textContent = t('submit.field.tags.hint');
    form.querySelector('[data-label-tools]').textContent = t('submit.field.tools');
    form.querySelector('[data-hint-tools]').textContent = t('submit.field.tools.hint');
    form.querySelector('[data-tool-custom-input]').placeholder = t('submit.field.tools.custom.placeholder');
    form.querySelector('[data-tool-custom-add]').textContent = t('submit.field.tools.custom.add');
    form.querySelector('[data-label-stage]').textContent = t('submit.field.stage');
    form.querySelector('[data-hint-stage]').textContent = t('submit.field.stage.hint');
    form.querySelector('[data-label-looking]').textContent = t('submit.field.looking');
    form.querySelector('[data-hint-looking]').textContent = t('submit.field.looking.hint');
    form.querySelector('[data-submit-btn]').textContent = t('submit.action.submit');

    document.querySelector('[data-success-title]').textContent = t('submit.success.title');
    document.querySelector('[data-success-text]').textContent = t('submit.success.text');
    document.querySelector('[data-success-chat]').textContent = t('submit.success.chat');
    document.querySelector('[data-success-again]').textContent = t('submit.success.again');
  }

  function applyEditModeText() {
    document.title = t('submit.edit.doctitle');
    const heading = document.querySelector('[data-submit-heading]');
    if (heading) heading.textContent = t('submit.edit.title');
    submitBtn.textContent = t('submit.edit.action');
    form.querySelector('[data-hint-cover]').textContent = t('submit.edit.cover_hint');
  }

  // Подтягивает свой проект в форму. Чужой/несуществующий — форму не показываем.
  async function loadProjectForEdit(user) {
    editLoaded = true;
    const { data, error } = await fetchProjectById(editId);
    if (error || !data) {
      showLoadError(t('submit.edit.load_error'));
      return;
    }
    if (data.authorId !== user.id) {
      showLoadError(t('submit.edit.forbidden'));
      return;
    }

    form.title.value = data.title || '';
    form.description.value = data.description || '';
    autoGrowTextarea(form.description);
    form.projectUrl.value = data.projectUrl || '';

    existingCoverUrl = data.coverUrl || null;
    if (existingCoverUrl) {
      coverFilenameEl.textContent = t('submit.field.cover.filename_empty');
      coverPreviewImg.src = existingCoverUrl;
      coverPreview.hidden = false;
    }

    (data.images || []).forEach((url) => {
      if (!isHttpUrl(url) || imageItems.length >= MAX_IMAGES) return;
      imageItems.push({ file: null, url, previewUrl: url });
    });
    renderImageThumbs();

    data.tags.forEach((tag) => selectTagChip(tag));
    data.tools.forEach((tool) => {
      if (TOOL_PRESETS.includes(tool)) selectToolChip(tool);
      else addCustomToolValue(tool);
    });
    if (data.stage) selectStageChip(data.stage);
    data.lookingFor.forEach((key) => selectLookingChip(key));
  }

  // Гейт в edit-режиме используется как экран ошибки (нельзя редактировать).
  function showLoadError(message) {
    formWrap.hidden = true;
    successEl.hidden = true;
    const gateText = document.querySelector('[data-submit-gate-text]');
    if (gateText) gateText.textContent = message;
    gate.hidden = false;
  }

  function selectTagChip(value) {
    if (!CATEGORY_LABELS[value]) return;
    selectedTags.add(value);
    const chip = tagsGroup.querySelector(`[data-value="${CSS.escape(value)}"]`);
    if (chip) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
  }

  function selectToolChip(value) {
    selectedTools.add(value);
    const chip = toolsGroup.querySelector(`[data-value="${CSS.escape(value)}"]`);
    if (chip) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
  }

  function buildTagChips() {
    tagsGroup.innerHTML = '';
    Object.entries(CATEGORY_LABELS).forEach(([value, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = value;
      chip.textContent = label;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const active = toggleSet(selectedTags, value);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      tagsGroup.appendChild(chip);
    });
  }

  function buildToolChips() {
    toolsGroup.innerHTML = '';
    TOOL_PRESETS.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = value;
      chip.textContent = value;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (!selectedTools.has(value) && selectedTools.size >= MAX_TOOLS) {
          showFieldError('tools', t('submit.error.tools_max'));
          return;
        }
        showFieldError('tools', '');
        const active = toggleSet(selectedTools, value);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      toolsGroup.appendChild(chip);
    });
  }

  // Стадия — одиночный выбор (повторный клик по активной снимает).
  function buildStageChips() {
    stageGroup.innerHTML = '';
    STAGE_KEYS.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = value;
      chip.textContent = stageLabel(value);
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const activate = selectedStage !== value;
        selectedStage = activate ? value : null;
        stageGroup.querySelectorAll('.chip').forEach((c) => {
          const on = activate && c.dataset.value === value;
          c.classList.toggle('active', on);
          c.setAttribute('aria-pressed', String(on));
        });
      });
      stageGroup.appendChild(chip);
    });
  }

  // «Что ищу» — мультивыбор (как теги).
  function buildLookingChips() {
    lookingGroup.innerHTML = '';
    LOOKING_KEYS.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = value;
      chip.textContent = lookingLabel(value);
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const active = toggleSet(selectedLooking, value);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      lookingGroup.appendChild(chip);
    });
  }

  function selectStageChip(value) {
    if (!isStage(value)) return;
    selectedStage = value;
    const chip = stageGroup.querySelector(`[data-value="${CSS.escape(value)}"]`);
    if (chip) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
  }

  function selectLookingChip(value) {
    selectedLooking.add(value);
    const chip = lookingGroup.querySelector(`[data-value="${CSS.escape(value)}"]`);
    if (chip) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
  }

  function addCustomTool() {
    addCustomToolValue(customInput.value.trim());
    customInput.value = '';
  }

  function addCustomToolValue(value) {
    if (!value || selectedTools.has(value)) return;
    if (selectedTools.size >= MAX_TOOLS) {
      showFieldError('tools', t('submit.error.tools_max'));
      return;
    }
    showFieldError('tools', '');
    selectedTools.add(value);

    const chip = document.createElement('span');
    chip.className = 'chip active submit-chip-custom';

    const label = document.createElement('span');
    label.textContent = value;
    chip.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'submit-chip-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', t('submit.field.tools.custom.remove'));
    removeBtn.addEventListener('click', () => {
      selectedTools.delete(value);
      chip.remove();
    });
    chip.appendChild(removeBtn);

    toolsGroup.appendChild(chip);
  }

  customAddBtn.addEventListener('click', addCustomTool);
  customInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addCustomTool();
  });

  form.projectUrl.addEventListener('blur', () => {
    const value = form.projectUrl.value.trim();
    if (value) form.projectUrl.value = normalizeHttpUrl(value);
  });

  coverInput.addEventListener('change', async () => {
    const file = coverInput.files?.[0];
    showFieldError('cover', '');
    if (!file) {
      clearCover();
      return;
    }
    if (!COVER_MIME_EXT[file.type]) {
      showFieldError('cover', t('submit.error.cover_type'));
      clearCover();
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      showFieldError('cover', t('submit.error.cover_size'));
      clearCover();
      return;
    }
    let dims;
    try {
      dims = await readImageDimensions(file);
    } catch {
      // Битый файл валидного MIME: createImageBitmap не смог декодировать
      showFieldError('cover', t('submit.error.cover_type'));
      clearCover();
      return;
    }
    if (dims.width < dims.height) {
      showFieldError('cover', t('submit.error.orientation'));
      clearCover();
      return;
    }
    coverFile = file;
    coverFilenameEl.textContent = file.name;
    coverPreviewImg.src = URL.createObjectURL(file);
    coverPreview.hidden = false;
  });

  coverRemoveBtn.addEventListener('click', () => {
    existingCoverUrl = null;
    clearCover();
    showFieldError('cover', '');
  });

  function clearCover() {
    coverFile = null;
    coverInput.value = '';
    coverFilenameEl.textContent = t('submit.field.cover.filename_empty');
    coverPreview.hidden = true;
    if (coverPreviewImg.src) {
      URL.revokeObjectURL(coverPreviewImg.src);
      coverPreviewImg.src = '';
    }
  }

  imagesInput.addEventListener('change', async () => {
    const files = Array.from(imagesInput.files || []);
    imagesInput.value = ''; // сброс — позволяет выбрать тот же файл повторно
    showFieldError('images', '');
    for (const file of files) {
      if (imageItems.length >= MAX_IMAGES) {
        showFieldError('images', t('submit.error.images_max'));
        break;
      }
      if (!COVER_MIME_EXT[file.type]) {
        showFieldError('images', t('submit.error.cover_type'));
        continue;
      }
      if (file.size > MAX_COVER_BYTES) {
        showFieldError('images', t('submit.error.cover_size'));
        continue;
      }
      let dims;
      try {
        dims = await readImageDimensions(file);
      } catch {
        showFieldError('images', t('submit.error.cover_type'));
        continue;
      }
      if (dims.width < dims.height) {
        showFieldError('images', t('submit.error.orientation'));
        continue;
      }
      imageItems.push({ file, url: null, previewUrl: URL.createObjectURL(file) });
    }
    renderImageThumbs();
  });

  function renderImageThumbs() {
    imagesGrid.innerHTML = '';
    imageItems.forEach((item, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'submit-image-thumb';

      const img = document.createElement('img');
      img.src = item.previewUrl;
      img.alt = '';
      thumb.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'submit-cover-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', t('submit.field.images.remove'));
      removeBtn.addEventListener('click', () => removeImageItem(index));
      thumb.appendChild(removeBtn);

      imagesGrid.appendChild(thumb);
    });
    updateImagesCount();
  }

  function updateImagesCount() {
    if (imagesCountEl) imagesCountEl.textContent = `${imageItems.length} / ${MAX_IMAGES}`;
  }

  function removeImageItem(index) {
    const [item] = imageItems.splice(index, 1);
    if (item.url) removedImageUrls.push(item.url);
    if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    renderImageThumbs();
  }

  // Путь в бакете covers из публичного URL — для storage.remove() при удалении старых images.
  function storagePathFromUrl(url) {
    const marker = '/covers/';
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }

  async function cleanupRemovedImages(urls) {
    const paths = urls.map(storagePathFromUrl).filter(Boolean);
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from('covers').remove(paths);
    if (error) console.warn('T17: не удалось убрать старые изображения из Storage', error);
  }

  function toggleSet(set, value) {
    if (set.has(value)) {
      set.delete(value);
      return false;
    }
    set.add(value);
    return true;
  }

  function showFieldError(field, message) {
    const el = form.querySelector(`[data-error="${field}"]`);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function clearErrors() {
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
    submitError.textContent = '';
    submitError.hidden = true;
  }

  function validate() {
    let valid = true;
    const title = form.title.value.trim();
    const description = form.description.value.trim();
    const rawUrl = form.projectUrl.value.trim();
    const url = rawUrl ? normalizeHttpUrl(rawUrl) : rawUrl;
    if (url !== rawUrl) form.projectUrl.value = url;

    if (!title) {
      showFieldError('title', t('submit.error.required_title'));
      valid = false;
    } else if (title.length > 80) {
      showFieldError('title', t('submit.error.max_title'));
      valid = false;
    }

    if (!description) {
      showFieldError('description', t('submit.error.required_description'));
      valid = false;
    } else if (description.length > MAX_DESCRIPTION_LEN) {
      showFieldError('description', t('submit.error.max_description'));
      valid = false;
    }

    if (!url) {
      showFieldError('url', t('submit.error.required_url'));
      valid = false;
    } else if (!isHttpUrl(url)) {
      showFieldError('url', t('submit.error.invalid_url'));
      valid = false;
    } else if (url.length > MAX_URL_LEN) {
      showFieldError('url', t('submit.error.max_url'));
      valid = false;
    }

    if (!coverFile && !existingCoverUrl) {
      showFieldError('cover', t('submit.error.required_cover'));
      valid = false;
    }

    if (selectedTags.size === 0) {
      showFieldError('tags', t('submit.error.required_tags'));
      valid = false;
    }

    if (selectedTools.size === 0) {
      showFieldError('tools', t('submit.error.required_tools'));
      valid = false;
    }

    return valid;
  }

  function setSubmitting(isSubmitting) {
    submitting = isSubmitting;
    submitBtn.disabled = isSubmitting;
    const idle = isEdit ? t('submit.edit.action') : t('submit.action.submit');
    const busy = isEdit ? t('submit.edit.saving') : t('submit.action.submitting');
    submitBtn.textContent = isSubmitting ? busy : idle;
  }

  async function uploadImageFile(user, file) {
    const { blob, ext } = await optimizeImage(file);
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('covers').upload(path, blob, {
      contentType: blob.type || file.type
    });
    if (error) return { url: null, error };
    const { data } = supabase.storage.from('covers').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || !currentUser) return;

    clearErrors();
    if (!validate()) return;

    setSubmitting(true);

    let coverUrl = isEdit ? existingCoverUrl : null;
    if (coverFile) {
      const { url, error } = await uploadImageFile(currentUser, coverFile);
      if (error) {
        setSubmitting(false);
        submitError.textContent = t('submit.error.upload');
        submitError.hidden = false;
        return;
      }
      coverUrl = url;
    }

    // Доп. изображения — грузим ДО insert/update, чтобы не сохранить проект наполовину.
    const uploadedImages = [];
    for (const item of imageItems) {
      if (item.url) {
        uploadedImages.push(item.url);
        continue;
      }
      const { url, error } = await uploadImageFile(currentUser, item.file);
      if (error) {
        setSubmitting(false);
        submitError.textContent = t('submit.error.upload');
        submitError.hidden = false;
        return;
      }
      uploadedImages.push(url);
    }

    const payload = {
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      project_url: form.projectUrl.value.trim(),
      cover_url: coverUrl,
      images: uploadedImages,
      tags: Array.from(selectedTags),
      tools: Array.from(selectedTools),
      stage: selectedStage,
      looking_for: Array.from(selectedLooking)
    };

    // Edit: update своего проекта, статус НЕ трогаем (перемодерации нет, триггер
    // всё равно отобьёт смену status/is_core не-админом). Add: insert как pending.
    const { error } = isEdit
      ? await supabase.from('projects').update(payload).eq('id', editId)
      : await supabase.from('projects').insert({ ...payload, author_id: currentUser.id, status: 'pending' });

    setSubmitting(false);

    if (error) {
      submitError.textContent = isEdit ? t('submit.edit.save_error') : t('submit.error.insert');
      submitError.hidden = false;
      return;
    }

    if (isEdit && removedImageUrls.length > 0) {
      await cleanupRemovedImages(removedImageUrls);
      removedImageUrls = [];
    }

    if (isEdit) {
      window.location.href = `project.html?id=${encodeURIComponent(editId)}`;
      return;
    }

    formWrap.hidden = true;
    successEl.hidden = false;
  });

  function resetForm() {
    form.reset();
    selectedTags.clear();
    selectedTools.clear();
    selectedLooking.clear();
    selectedStage = null;
    buildTagChips();
    buildToolChips();
    buildStageChips();
    buildLookingChips();
    clearCover();
    imageItems.forEach((item) => {
      if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    imageItems = [];
    removedImageUrls = [];
    renderImageThumbs();
    clearErrors();
    successEl.hidden = true;
    formWrap.hidden = false;
  }

  document.querySelector('[data-success-again]').addEventListener('click', resetForm);

  function applyAuthState(user) {
    currentUser = user;
    if (successEl.hidden === false) return;

    if (isEdit) {
      // Редактирование требует входа; после входа один раз подтягиваем проект.
      if (!user) {
        gate.hidden = false;
        formWrap.hidden = true;
        return;
      }
      gate.hidden = true;
      formWrap.hidden = false;
      if (!editLoaded) loadProjectForEdit(user);
      return;
    }

    gate.hidden = !!user;
    formWrap.hidden = !user;
  }

  getCurrentUser().then(applyAuthState);
  onAuthChange(applyAuthState);
}
