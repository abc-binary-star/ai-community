'use strict';

/* ============================================================
   译著 · EpubTranslate AI — 前端交互逻辑
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const API = {
  translate: '/api/v1/translate',
  tasks: '/api/v1/tasks',
  health: '/api/v1/health',
  taskDetail: (id) => `/api/v1/tasks/${id}`,
  download: (id) => `/api/v1/tasks/${id}/download`,
};

const LANG_MAP = {
  auto: '自动检测',
  en: '英语',
  ja: '日语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  ko: '韩语',
  zh: '中文',
  'zh-CN': '简体中文',
};

const STATUS_TEXT = {
  PENDING: '等待中',
  QUEUED: '排队中',
  PARSING: '解析中',
  TRANSLATING: '翻译中',
  ASSEMBLING: '组装中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELED: '已取消',
};

/* ---------- DOM 引用 ---------- */
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const dropzoneMain = $('#dropzoneMain');
const dropzoneSub = $('#dropzoneSub');
const dropzoneFile = $('#dropzoneFile');
const dropzoneIcon = $('#dropzoneIcon');
const translateBtn = $('#translateBtn');
const translateBtnText = $('#translateBtnText');
const taskList = $('#taskList');
const emptyState = $('#emptyState');
const tasksMeta = $('#tasksMeta');
const toast = $('#toast');
const healthStatus = $('#healthStatus');
const themeToggle = $('#themeToggle');

/* ---------- 状态 ---------- */
let selectedFile = null;
let pollingTimers = new Map(); // taskId -> interval
let toastTimer = null;

/* ---------- 主题 ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('epub-translator-theme', theme);
  } catch (_) { /* 忽略 */ }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

/* ---------- 健康检查 ---------- */
async function checkHealth() {
  try {
    const res = await fetch(API.health);
    if (res.ok) {
      healthStatus.classList.remove('is-offline');
      $('.health-text').textContent = '服务在线';
    } else {
      setOffline();
    }
  } catch (_) {
    setOffline();
  }
}

function setOffline() {
  healthStatus.classList.add('is-offline');
  $('.health-text').textContent = '服务离线';
}

/* ---------- 轻提示 ---------- */
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast is-visible${type === 'error' ? ' toast--error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}

/* ---------- 文件选择 ---------- */
function handleFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.epub')) {
    showToast('仅支持 .epub 格式文件', 'error');
    return;
  }
  selectedFile = file;
  dropzone.classList.add('has-file');
  dropzoneMain.textContent = '已选择文件';
  dropzoneSub.textContent = '点击可重新选择';
  dropzoneFile.textContent = file.name;
  dropzoneFile.hidden = false;
  dropzoneIcon.innerHTML = `
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <path d="M8 13h8M8 17h5"/>
    </svg>`;
  translateBtn.disabled = false;
  updateSubmitText();
}

function resetDropzone() {
  selectedFile = null;
  dropzone.classList.remove('has-file');
  dropzoneMain.textContent = '拖入 EPUB 文件';
  dropzoneSub.textContent = '或点击选择 · 支持 .epub 格式';
  dropzoneFile.hidden = true;
  dropzoneIcon.innerHTML = `
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <path d="M17 8l-5-5-5 5"/>
      <path d="M12 3v12"/>
    </svg>`;
  translateBtn.disabled = true;
}

/* 拖拽 */
dropzone.addEventListener('click', () => {
  if (!translateBtn.classList.contains('is-loading')) fileInput.click();
});
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
fileInput.addEventListener('click', (e) => e.stopPropagation());

['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  handleFile(e.dataTransfer.files[0]);
});

/* ---------- 提交翻译 ---------- */
function updateSubmitText() {
  if (selectedFile) {
    translateBtnText.textContent = '开始翻译';
  } else {
    translateBtnText.textContent = '请先选择 EPUB 文件';
  }
}

translateBtn.addEventListener('click', async () => {
  if (!selectedFile || translateBtn.classList.contains('is-loading')) return;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('source_lang', $('#sourceLang').value);
  formData.append('target_lang', $('#targetLang').value);
  formData.append('model', $('#modelSelect').value);

  translateBtn.classList.add('is-loading');
  translateBtn.disabled = true;
  translateBtnText.textContent = '提交中…';

  try {
    const res = await fetch(API.translate, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '创建翻译任务失败');
    }
    showToast('翻译任务已创建，正在解析书籍…');
    resetDropzone();
    updateSubmitText();
    await loadTasks();
    startPolling(data.task_id);
  } catch (err) {
    showToast(err.message || '提交失败', 'error');
  } finally {
    translateBtn.classList.remove('is-loading');
    translateBtn.disabled = !selectedFile;
  }
});

/* ---------- 任务列表 ---------- */
function statusBadge(status) {
  const cls = `badge badge--${status.toLowerCase()}`;
  const hasDot = status === 'TRANSLATING' || status === 'PARSING' || status === 'QUEUED';
  return `<span class="${cls}">${hasDot ? '<span class="badge-dot"></span>' : ''}${STATUS_TEXT[status] || status}</span>`;
}

function taskItemHtml(t) {
  const progress = Math.round(t.progress || 0);
  const langText = t.source_lang && t.source_lang !== 'auto'
    ? `${LANG_MAP[t.source_lang] || t.source_lang} → ${LANG_MAP[t.target_lang] || t.target_lang}`
    : `→ ${LANG_MAP[t.target_lang] || t.target_lang}`;

  const errorHtml = t.error ? `<div class="task-error">${escapeHtml(t.error)}</div>` : '';
  const timeText = t.created_at ? formatTime(t.created_at) : '';

  let progressHtml = '';
  if (t.status === 'COMPLETED') {
    progressHtml = `
      <div class="task-progress">
        <div class="task-progress-fill is-complete" style="width:100%"></div>
      </div>`;
  } else if (t.status === 'FAILED' || t.status === 'CANCELED') {
    progressHtml = '';
  } else if (t.status === 'PENDING' || t.status === 'QUEUED') {
    progressHtml = `
      <div class="task-progress">
        <div class="task-progress-fill" style="width:0%"></div>
      </div>`;
  } else {
    progressHtml = `
      <div class="task-progress">
        <div class="task-progress-fill" style="width:${Math.max(progress, 4)}%"></div>
      </div>`;
  }

  const chunksText = t.total_chunks
    ? `${t.translated_chunks || 0} / ${t.total_chunks} 个文本块`
    : '';

  const actions = t.status === 'COMPLETED'
    ? `<button class="ghost-btn" onclick="window.downloadTask('${t.task_id}')" title="下载翻译结果">
         <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
           <path d="M7 10l5 5 5-5"/>
           <path d="M12 15V3"/>
         </svg>
         下载</button>`
    : '';

  return `
    <div class="task-item" id="task-${t.task_id}">
      <div class="task-head">
        <div class="task-file">
          <span class="task-file-icon">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
            </svg>
          </span>
          <span>
            <span class="task-file-name">${escapeHtml(t.file_name || t.book_title || '未命名书籍')}</span>
            <span class="task-file-lang">${langText}</span>
          </span>
        </div>
        ${statusBadge(t.status)}
      </div>
      ${progressHtml}
      <div class="task-meta">
        <span>${chunksText || (t.status === 'TRANSLATING' ? 'AI 处理中…' : '')}</span>
        <span class="task-actions">${actions}</span>
      </div>
      ${errorHtml}
    </div>`;
}

window.downloadTask = function (taskId) {
  const link = document.createElement('a');
  link.href = API.download(taskId);
  link.download = '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

async function loadTasks() {
  try {
    const res = await fetch(API.tasks);
    if (!res.ok) throw new Error('加载任务列表失败');
    const data = await res.json();
    renderTasks(data.tasks || []);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderTasks(tasks) {
  if (!tasks.length) {
    taskList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <path d="M14 2v6h6"/>
          <path d="M8 13h8M8 17h5"/>
        </svg>
        <p>还没有翻译任务</p>
        <span>上传一本书，开始你的第一本译著</span>
      </div>`;
    tasksMeta.textContent = '暂无翻译任务';
    return;
  }

  // 最新的排前面
  tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  taskList.innerHTML = tasks.map(taskItemHtml).join('');

  const running = tasks.filter((t) => ['PENDING', 'QUEUED', 'PARSING', 'TRANSLATING', 'ASSEMBLING'].includes(t.status));
  tasksMeta.textContent = running.length
    ? `${running.length} 个任务进行中`
    : `${tasks.length} 个任务`;

  // 为进行中的任务启动轮询
  tasks.forEach((t) => {
    if (['PENDING', 'QUEUED', 'PARSING', 'TRANSLATING', 'ASSEMBLING'].includes(t.status)) {
      startPolling(t.task_id);
    } else {
      stopPolling(t.task_id);
    }
  });
}

/* ---------- 任务轮询 ---------- */
function startPolling(taskId) {
  if (pollingTimers.has(taskId)) return;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(API.taskDetail(taskId));
      if (!res.ok) throw new Error('查询任务失败');
      const task = await res.json();
      const item = $(`#task-${taskId}`);
      if (item) {
        item.outerHTML = taskItemHtml(task);
      }
      const terminal = ['COMPLETED', 'FAILED', 'CANCELED'].includes(task.status);
      if (terminal) {
        stopPolling(taskId);
        tasksMeta.textContent = `${tasksMeta.textContent}`;
        loadTasks();
      }
    } catch (_) {
      stopPolling(taskId);
    }
  }, 2000);
  pollingTimers.set(taskId, timer);
}

function stopPolling(taskId) {
  const timer = pollingTimers.get(taskId);
  if (timer) {
    clearInterval(timer);
    pollingTimers.delete(taskId);
  }
}

/* ---------- 工具函数 ---------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- 初始化 ---------- */
(function init() {
  // 恢复主题
  let theme = 'light';
  try {
    theme = localStorage.getItem('epub-translator-theme') || 'light';
  } catch (_) { /* 忽略 */ }
  applyTheme(theme);

  checkHealth();
  setInterval(checkHealth, 15000);
  loadTasks();
  setInterval(loadTasks, 10000);

  $('#refreshBtn').addEventListener('click', () => {
    loadTasks();
    showToast('任务列表已刷新');
  });
})();
