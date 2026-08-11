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
  glossary: (id) => `/api/v1/tasks/${id}/glossary`,
  glossaryExtract: (id) => `/api/v1/tasks/${id}/glossary/extract`,
  consistency: (id) => `/api/v1/tasks/${id}/consistency`,
  qa: (id) => `/api/v1/tasks/${id}/qa`,
  accept: (id) => `/api/v1/tasks/${id}/accept`,
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

  // 操作按钮（按状态渐进展示）
  const actions = [];
  const acceptedBadge = t.accepted
    ? '<span class="badge badge--accepted">已验收</span>'
    : '';

  if (t.status === 'COMPLETED') {
    actions.push(`
      <button class="ghost-btn" onclick="window.downloadTask('${t.task_id}')" title="下载翻译结果">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <path d="M7 10l5 5 5-5"/>
          <path d="M12 15V3"/>
        </svg>
        下载</button>
      <button class="ghost-btn" onclick="window.runConsistency('${t.task_id}')" title="检查译名一致性">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        一致性</button>
      <button class="ghost-btn" onclick="window.runQA('${t.task_id}')" title="质量评估">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M7 15l4-6 3 4 3-7"/>
        </svg>
        QA 评估</button>
      <button class="ghost-btn" onclick="window.acceptTask('${t.task_id}')" title="发布前人工验收">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/>
          <path d="M22 4L12 14l-3-3"/>
        </svg>
        验收</button>`);
  }
  if (['PENDING', 'QUEUED', 'PARSING', 'TRANSLATING', 'ASSEMBLING', 'COMPLETED', 'FAILED'].includes(t.status)) {
    actions.push(`
      <button class="ghost-btn" onclick="window.openGlossary('${t.task_id}')" title="术语表抽取与确认">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        术语表</button>`);
  }

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
        <span class="task-actions">${acceptedBadge}${actions.join('')}</span>
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

/* ============================================================
   阶段 3/6/8 · 术语表 / 一致性 / QA / 验收
   ============================================================ */

let glossaryTaskId = null;
let glossaryTerms = [];

/* ---------- 术语表弹窗 ---------- */
window.openGlossary = async function (taskId) {
  glossaryTaskId = taskId;
  glossaryTerms = [];
  glossaryModal.hidden = false;
  renderGlossaryList();

  try {
    const res = await fetch(API.glossary(taskId));
    const data = await res.json();
    if (data.glossary_draft) {
      glossaryTerms = JSON.parse(data.glossary_draft);
      $('#glossaryHint').textContent = data.glossary_set
        ? `已确认 ${JSON.parse(data.glossary || '[]').length} 条`
        : `候选 ${glossaryTerms.length} 条`;
    } else if (data.glossary_set) {
      glossaryTerms = JSON.parse(data.glossary || '[]');
      $('#glossaryHint').textContent = `已确认 ${glossaryTerms.length} 条`;
    }
  } catch (_) { /* 忽略 */ }
  renderGlossaryList();
};

window.closeGlossaryModal = function () {
  glossaryModal.hidden = true;
  glossaryTaskId = null;
};

$('#glossaryExtractBtn').addEventListener('click', async () => {
  if (!glossaryTaskId) return;
  const btn = $('#glossaryExtractBtn');
  btn.disabled = true;
  btn.textContent = 'AI 抽取中…';
  $('#glossaryHint').textContent = '正在抽取专有名词…';
  try {
    const res = await fetch(API.glossaryExtract(glossaryTaskId), { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '抽取失败');
    glossaryTerms = JSON.parse(data.glossary_draft);
    $('#glossaryHint').textContent = `候选 ${glossaryTerms.length} 条，请核对译名`;
    renderGlossaryList();
    showToast(`AI 抽取完成：${glossaryTerms.length} 条候选术语`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 抽取候选';
  }
});

function renderGlossaryList() {
  const list = $('#glossaryList');
  if (!glossaryTerms.length) {
    list.innerHTML = `
      <div class="empty-state">
        <p>暂无术语数据</p>
        <span>点击"AI 抽取候选"从书中提取专有名词</span>
      </div>`;
    return;
  }
  list.innerHTML = glossaryTerms.map((term, i) => `
    <div class="glossary-item" data-i="${i}">
      <input class="term-source" value="${escapeHtml(term.source)}" placeholder="原文" />
      <input class="term-target" value="${escapeHtml(term.target || '')}" placeholder="译名" />
      <span class="term-type">${term.type || 'term'}</span>
      <button class="term-del" type="button" title="删除" onclick="window.deleteGlossaryTerm(${i})">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
        </svg>
      </button>
    </div>`).join('');
}

window.deleteGlossaryTerm = function (i) {
  glossaryTerms.splice(i, 1);
  renderGlossaryList();
};

window.saveGlossary = async function () {
  if (!glossaryTaskId) return;
  // 收集编辑后的术语
  const items = document.querySelectorAll('.glossary-item');
  const terms = [];
  items.forEach((el, i) => {
    const source = el.querySelector('.term-source').value.trim();
    const target = el.querySelector('.term-target').value.trim();
    if (source && target) {
      const orig = glossaryTerms[i] || {};
      terms.push({ source, target, type: orig.type || 'term', confidence: orig.confidence || 0.5 });
    }
  });
  if (!terms.length) {
    showToast('术语表为空，请至少保留一条', 'error');
    return;
  }
  try {
    const res = await fetch(API.glossary(glossaryTaskId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glossary: JSON.stringify(terms) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    showToast(`术语表已保存：${data.count} 条`);
    closeGlossaryModal();
    loadTasks();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

/* ---------- 一致性 / QA 报告 ---------- */
function showReport(title, sub, bodyHtml) {
  $('#reportModalTitle').textContent = title;
  $('#reportModalSub').textContent = sub;
  $('#reportModalBody').innerHTML = bodyHtml;
  reportModal.hidden = false;
}

window.closeReportModal = function () {
  reportModal.hidden = true;
};

window.runConsistency = async function (taskId) {
  try {
    const res = await fetch(API.consistency(taskId), { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '校验失败');
    const issues = JSON.parse(data.consistency_report || '[]');
    if (!issues.length) {
      showReport('一致性检查', '术语与译名一致性良好', `
        <div class="empty-state">
          <p>未发现不一致问题</p>
          <span>全部专有名词与术语译名统一</span>
        </div>`);
      return;
    }
    showReport('一致性检查', `发现 ${issues.length} 处疑似不一致`, `
      <div class="report-section">
        ${issues.map((it) => `
          <div class="issue-item">
            <div><span class="issue-term">${escapeHtml(it.term)}</span>
              <span class="issue-variants"> · ${escapeHtml(it.variants)}</span>
              <span> · 出现 ${it.count || '-'} 次 · ${it.confidence || 'low'}</span>
            </div>
            <div class="issue-suggestion">建议统一为：${escapeHtml(it.suggestion || '-')}</div>
          </div>`).join('')}
      </div>`);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.runQA = async function (taskId) {
  try {
    const res = await fetch(API.qa(taskId), { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '评估失败');
    const report = JSON.parse(data.qa_report || '{}');
    const scores = report.scores || [];
    const dimName = { faithfulness: '忠实度', fluency: '流畅度', terminology: '术语一致性', format: '格式保持' };
    const scoreClass = (s) => (s >= 4 ? 'high' : s >= 3 ? 'mid' : 'low');
    showReport('QA 质量评估', `抽样 ${report.samples || 0} 段 · 综合评分 ${report.overall || '-'}/5`, `
      <div class="qa-scores">
        ${scores.map((s) => `
          <div class="qa-score-card">
            <div class="qa-dim">${dimName[s.dimension] || s.dimension}</div>
            <div class="qa-val ${scoreClass(s.score)}">${s.score}/5</div>
            <div class="qa-comment">${escapeHtml(s.comment || '')}</div>
          </div>`).join('')}
      </div>
      ${(report.issues && report.issues.length) ? `
        <div class="report-section">
          <h4>待改进项</h4>
          ${report.issues.map((i) => `<div class="issue-item">${escapeHtml(i)}</div>`).join('')}
        </div>` : ''}`);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.acceptTask = async function (taskId) {
  if (!confirm('确认通过该任务的质量验收？通过后即可发布下载。')) return;
  try {
    const res = await fetch(API.accept(taskId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '验收失败');
    showToast(data.message || '已通过验收');
    loadTasks();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

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
