/**
 * We Designerz — форма добавления проекта (T3).
 * Гейт без логина → форма после входа (без перезагрузки) → insert в Storage/projects со
 * status='pending'. RLS сам не даст вставить published/чужой author_id — фронт этого не обходит.
 */
import { supabase } from './supabase.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { t } from './i18n/ru.js';
import { CATEGORY_LABELS } from './projects.js';
import { isHttpUrl, normalizeHttpUrl } from './util.js';

const TOOL_PRESETS = ['Claude', 'ChatGPT', 'Cursor', 'v0', 'Lovable', 'Bolt'];
const MAX_COVER_BYTES = 3 * 1024 * 1024;
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
  const customInput = form.querySelector('[data-tool-custom-input]');
  const customAddBtn = form.querySelector('[data-tool-custom-add]');
  const coverInput = form.querySelector('[data-cover-input]');
  const coverFilenameEl = form.querySelector('[data-cover-filename]');
  const coverPreview = form.querySelector('[data-cover-preview]');
  const coverPreviewImg = form.querySelector('[data-cover-preview-img]');
  const coverRemoveBtn = form.querySelector('[data-cover-remove]');
  const submitBtn = form.querySelector('[data-submit-btn]');
  const submitError = form.querySelector('[data-submit-error]');

  const selectedTags = new Set();
  const selectedTools = new Set();
  let coverFile = null;
  let currentUser = null;
  let submitting = false;

  applyStaticText();
  buildTagChips();
  buildToolChips();

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
    form.querySelector('[data-label-tags]').textContent = t('submit.field.tags');
    form.querySelector('[data-hint-tags]').textContent = t('submit.field.tags.hint');
    form.querySelector('[data-label-tools]').textContent = t('submit.field.tools');
    form.querySelector('[data-hint-tools]').textContent = t('submit.field.tools.hint');
    form.querySelector('[data-tool-custom-input]').placeholder = t('submit.field.tools.custom.placeholder');
    form.querySelector('[data-tool-custom-add]').textContent = t('submit.field.tools.custom.add');
    form.querySelector('[data-submit-btn]').textContent = t('submit.action.submit');

    document.querySelector('[data-success-title]').textContent = t('submit.success.title');
    document.querySelector('[data-success-text]').textContent = t('submit.success.text');
    document.querySelector('[data-success-chat]').textContent = t('submit.success.chat');
    document.querySelector('[data-success-again]').textContent = t('submit.success.again');
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
        const active = toggleSet(selectedTools, value);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      toolsGroup.appendChild(chip);
    });
  }

  function addCustomTool() {
    const value = customInput.value.trim();
    if (!value || selectedTools.has(value)) {
      customInput.value = '';
      return;
    }
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
    customInput.value = '';
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

  coverInput.addEventListener('change', () => {
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
    coverFile = file;
    coverFilenameEl.textContent = file.name;
    coverPreviewImg.src = URL.createObjectURL(file);
    coverPreview.hidden = false;
  });

  coverRemoveBtn.addEventListener('click', () => {
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
    }

    if (!url) {
      showFieldError('url', t('submit.error.required_url'));
      valid = false;
    } else if (!isHttpUrl(url)) {
      showFieldError('url', t('submit.error.invalid_url'));
      valid = false;
    }

    if (!coverFile) {
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
    submitBtn.textContent = isSubmitting ? t('submit.action.submitting') : t('submit.action.submit');
  }

  async function uploadCover(user) {
    const ext = COVER_MIME_EXT[coverFile.type];
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('covers').upload(path, coverFile, {
      contentType: coverFile.type
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

    let coverUrl = null;
    if (coverFile) {
      const { url, error } = await uploadCover(currentUser);
      if (error) {
        setSubmitting(false);
        submitError.textContent = t('submit.error.upload');
        submitError.hidden = false;
        return;
      }
      coverUrl = url;
    }

    const { error } = await supabase.from('projects').insert({
      author_id: currentUser.id,
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      project_url: form.projectUrl.value.trim(),
      cover_url: coverUrl,
      tags: Array.from(selectedTags),
      tools: Array.from(selectedTools),
      status: 'pending'
    });

    setSubmitting(false);

    if (error) {
      submitError.textContent = t('submit.error.insert');
      submitError.hidden = false;
      return;
    }

    formWrap.hidden = true;
    successEl.hidden = false;
  });

  function resetForm() {
    form.reset();
    selectedTags.clear();
    selectedTools.clear();
    buildTagChips();
    buildToolChips();
    clearCover();
    clearErrors();
    successEl.hidden = true;
    formWrap.hidden = false;
  }

  document.querySelector('[data-success-again]').addEventListener('click', resetForm);

  function applyAuthState(user) {
    currentUser = user;
    if (successEl.hidden === false) return;
    gate.hidden = !!user;
    formWrap.hidden = !user;
  }

  getCurrentUser().then(applyAuthState);
  onAuthChange(applyAuthState);
}
