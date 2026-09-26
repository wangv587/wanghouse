const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const LOCAL_WORK_KEY = "nova.local.works.v1";
const GITHUB_SETTINGS_KEY = "nova.github.settings.v1";
const GITHUB_TOKEN_KEY = "nova.github.token.session.v1";
const DB_NAME = "nova-portfolio-media";
const DB_STORE = "media";

const state = {
  profile: {},
  remoteWorks: [],
  localWorks: [],
  works: [],
  filteredWorks: [],
  filter: "all",
  lightboxIndex: 0,
  pendingFiles: [],
  coverIndex: 0,
  publishing: false,
};

const dom = {
  loader: $("#loader"),
  nav: $("#site-nav"),
  canvas: $("#ambient-canvas"),
  grid: $("#works-grid"),
  empty: $("#empty-state"),
  filterRow: $("#filter-row"),
  lightbox: $("#lightbox"),
  lightboxImage: $("#lightbox-image"),
  lightboxTitle: $("#lightbox-title"),
  lightboxCategory: $("#lightbox-category"),
  lightboxDescription: $("#lightbox-description"),
  lightboxTags: $("#lightbox-tags"),
  studio: $("#studio"),
  uploadForm: $("#upload-form"),
  fileInput: $("#work-files"),
  dropzone: $("#dropzone"),
  filePreview: $("#file-preview"),
  publishStatus: $("#publish-status"),
  toastStack: $("#toast-stack"),
};

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function slugify(value = "work") {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "work";
}
function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast${type === "error" ? " is-error" : ""}`;
  item.textContent = message;
  dom.toastStack.append(item);
  window.setTimeout(() => { item.style.opacity = "0"; item.style.transform = "translateY(8px)"; window.setTimeout(() => item.remove(), 300); }, 4200);
}
function setStatus(message, status = "") {
  dom.publishStatus.className = `publish-status${status ? ` is-${status}` : ""}`;
  $("p", dom.publishStatus).textContent = message;
}

function applyProfile() {
  const profile = state.profile || {};
  const name = String(profile.name || "NOVA").trim();
  const role = String(profile.role || "Creative Portfolio").trim();
  const email = String(profile.email || "hello@example.com").trim();
  $("#brand-name").textContent = name;
  $("#profile-role").textContent = `${role.toUpperCase()} / ${new Date().getFullYear()}`;
  document.title = `${name} / Personal Works`;
  const contact = $("#contact-email");
  contact.href = `mailto:${email}`;
  contact.replaceChildren(document.createTextNode(email + " "));
  const arrow = document.createElement("span");
  arrow.textContent = "↗";
  contact.append(arrow);
}

async function loadRemoteWorks() {
  try {
    const response = await fetch("./data/works.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.profile = Array.isArray(payload) ? {} : payload.profile || {};
    state.remoteWorks = Array.isArray(payload) ? payload : payload.works || [];
    applyProfile();
  } catch (error) {
    console.warn("Could not load remote works:", error);
    state.remoteWorks = [];
  }
}
function readLocalMetadata() {
  try { const parsed = JSON.parse(localStorage.getItem(LOCAL_WORK_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function writeLocalMetadata(records) { localStorage.setItem(LOCAL_WORK_KEY, JSON.stringify(records)); }

function openMediaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function idbSet(key, value) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
async function idbGet(key) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readonly"); const request = tx.objectStore(DB_STORE).get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
}
async function idbDelete(key) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
async function hydrateLocalWorks() {
  const records = readLocalMetadata();
  const hydrated = [];
  for (const record of records) {
    try {
      const coverBlob = await idbGet(record.coverKey);
      if (!coverBlob) continue;
      hydrated.push({ ...record, local: true, cover: URL.createObjectURL(coverBlob) });
    } catch (error) { console.warn("Could not hydrate local work:", error); }
  }
  state.localWorks = hydrated;
}
function allWorks() { return [...state.localWorks, ...state.remoteWorks]; }
function visibleWorks() { return state.filter === "all" ? allWorks() : allWorks().filter((work) => work.category === state.filter); }
function renderCategoryCounts() {
  const works = allWorks();
  const countMap = works.reduce((map, work) => { map[work.category] = (map[work.category] || 0) + 1; return map; }, {});
  const allCount = String(works.length).padStart(2, "0");
  $("#all-count").textContent = allCount;
  $("#stat-works").textContent = allCount;
  $$("[data-count-for]").forEach((node) => { node.textContent = String(countMap[node.dataset.countFor] || 0).padStart(2, "0"); });
}

function createWorkCard(work, index) {
  const article = document.createElement("article");
  article.className = "work-card";
  article.style.animationDelay = `${Math.min(index * 60, 360)}ms`;
  const localBadge = work.local ? '<span class="local-badge">LOCAL</span>' : "";
  const deleteButton = work.local ? '<button class="delete-local" type="button" aria-label="删除本地作品">删除</button>' : "";
  article.innerHTML = `
    <div class="work-trigger" role="button" tabindex="0" aria-label="查看作品：${escapeHtml(work.title)}">
      <div class="work-visual"><img src="${escapeHtml(work.cover)}" alt="${escapeHtml(work.title)}" loading="lazy"><span class="work-number">${String(index + 1).padStart(2, "0")}</span>${localBadge}<span class="work-open">↗</span></div>
      <div class="work-card-meta"><div><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.category)} / ${escapeHtml(work.year || "")}</p></div><div class="card-actions"><span>${escapeHtml((work.tags || []).slice(0, 2).join(" · "))}</span>${deleteButton}</div></div>
    </div>`;
  const trigger = $(".work-trigger", article);
  const open = () => openLightbox(work.id);
  trigger.addEventListener("click", open);
  trigger.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  if (work.local) $(".delete-local", article).addEventListener("click", (event) => { event.stopPropagation(); deleteLocalWork(work.id); });
  bindTilt($(".work-visual", article));
  return article;
}
function renderWorks() {
  state.works = allWorks();
  state.filteredWorks = visibleWorks();
  dom.grid.replaceChildren();
  state.filteredWorks.forEach((work, index) => dom.grid.append(createWorkCard(work, index)));
  dom.empty.hidden = state.filteredWorks.length > 0;
  renderCategoryCounts();
}
function setFilter(filter) { state.filter = filter; $$(".filter-chip").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === filter)); renderWorks(); }
async function deleteLocalWork(id) {
  if (!window.confirm("删除这个本地作品？GitHub 上已经发布的内容不会被删除。")) return;
  const records = readLocalMetadata();
  const target = records.find((record) => record.id === id);
  if (!target) return;
  for (const key of target.mediaKeys || []) { try { await idbDelete(key); } catch (error) { console.warn(error); } }
  writeLocalMetadata(records.filter((record) => record.id !== id));
  await hydrateLocalWorks();
  renderWorks();
  toast("本地作品已删除。");
}
function openLightbox(id) {
  state.filteredWorks = visibleWorks();
  const index = state.filteredWorks.findIndex((work) => work.id === id);
  if (index < 0) return;
  state.lightboxIndex = index;
  updateLightbox();
  dom.lightbox.hidden = false;
  document.body.classList.add("modal-open");
}
function updateLightbox() {
  const work = state.filteredWorks[state.lightboxIndex];
  if (!work) return;
  dom.lightboxImage.src = work.cover;
  dom.lightboxImage.alt = work.title;
  dom.lightboxTitle.textContent = work.title;
  dom.lightboxCategory.textContent = `${String(work.category || "").toUpperCase()} / ${work.year || ""}`;
  dom.lightboxDescription.textContent = work.description || "这个作品还没有添加说明。";
  dom.lightboxTags.replaceChildren();
  (work.tags || []).forEach((tag) => { const span = document.createElement("span"); span.textContent = tag; dom.lightboxTags.append(span); });
}
function moveLightbox(delta) { if (!state.filteredWorks.length) return; state.lightboxIndex = (state.lightboxIndex + delta + state.filteredWorks.length) % state.filteredWorks.length; updateLightbox(); }
function closeLightbox() { dom.lightbox.hidden = true; dom.lightboxImage.removeAttribute("src"); document.body.classList.toggle("modal-open", !dom.studio.hidden); }
function openStudio() { dom.studio.hidden = false; document.body.classList.add("modal-open"); window.setTimeout(() => $('input[name="title"]', dom.studio)?.focus(), 120); }
function closeStudio() { dom.studio.hidden = true; document.body.classList.toggle("modal-open", !dom.lightbox.hidden); }
function clearPendingFiles() { state.pendingFiles.forEach((entry) => URL.revokeObjectURL(entry.preview)); state.pendingFiles = []; state.coverIndex = 0; dom.filePreview.replaceChildren(); dom.fileInput.value = ""; }
function addPendingFiles(fileList) {
  const incoming = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!incoming.length) { toast("请选择图片文件。", "error"); return; }
  const remaining = 12 - state.pendingFiles.length;
  incoming.slice(0, remaining).forEach((file) => state.pendingFiles.push({ file, preview: URL.createObjectURL(file) }));
  if (incoming.length > remaining) toast("一次最多发布 12 张图片。", "error");
  renderFilePreview();
}
function renderFilePreview() {
  dom.filePreview.replaceChildren();
  state.pendingFiles.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "file-preview-item";
    item.innerHTML = `<img src="${entry.preview}" alt=""><button type="button" aria-label="移除图片">×</button><button class="cover-badge" type="button">${index === state.coverIndex ? "封面" : "设为封面"}</button>`;
    $("button", item).addEventListener("click", () => { URL.revokeObjectURL(entry.preview); state.pendingFiles.splice(index, 1); if (state.coverIndex >= state.pendingFiles.length) state.coverIndex = 0; renderFilePreview(); });
    $(".cover-badge", item).addEventListener("click", () => { state.coverIndex = index; renderFilePreview(); });
    dom.filePreview.append(item);
  });
}
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 2400;
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("图片压缩失败");
  return blob;
}
function formDataToWork(form, id, mediaKeys) {
  const data = new FormData(form);
  const tags = String(data.get("tags") || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  return { id, title: String(data.get("title") || "未命名作品").trim(), category: String(data.get("category") || "Design"), year: String(data.get("year") || new Date().getFullYear()).trim(), description: String(data.get("description") || "").trim(), tags, coverKey: mediaKeys[state.coverIndex], mediaKeys, local: true, createdAt: new Date().toISOString() };
}
async function buildPendingMedia() {
  if (!state.pendingFiles.length) throw new Error("请先选择至少一张作品图片。");
  setStatus("正在压缩图片…", "working");
  const output = [];
  for (let index = 0; index < state.pendingFiles.length; index += 1) {
    const entry = state.pendingFiles[index];
    const blob = await compressImage(entry.file);
    output.push({ blob, filename: `${slugify(entry.file.name.replace(/\.[^.]+$/, ""))}-${index + 1}.webp`, originalName: entry.file.name, size: blob.size });
  }
  return output;
}
async function saveLocalWork(event) {
  event.preventDefault();
  const submit = $("#save-local");
  submit.disabled = true;
  try {
    const media = await buildPendingMedia();
    const id = `${slugify(new FormData(dom.uploadForm).get("title"))}-${Date.now()}`;
    const mediaKeys = media.map((_, index) => `work:${id}:${index}`);
    for (let index = 0; index < media.length; index += 1) await idbSet(mediaKeys[index], media[index].blob);
    const record = formDataToWork(dom.uploadForm, id, mediaKeys);
    const records = readLocalMetadata(); records.unshift(record); writeLocalMetadata(records);
    await hydrateLocalWorks(); renderWorks();
    setStatus("已保存到本机浏览器。", "success"); toast("作品已加入本地画廊。");
    dom.uploadForm.reset(); $('input[name="year"]', dom.uploadForm).value = new Date().getFullYear();
    applyGithubSettings(readGithubSettings()); clearPendingFiles();
  } catch (error) { console.error(error); setStatus(error.message || "保存失败。", "error"); toast(error.message || "保存失败。", "error"); }
  finally { submit.disabled = false; }
}
function readGithubSettings() { try { return JSON.parse(localStorage.getItem(GITHUB_SETTINGS_KEY) || "{}"); } catch { return {}; } }
function applyGithubSettings(settings = {}) {
  const form = dom.uploadForm;
  for (const key of ["owner", "repo", "branch", "basePath"]) { const input = $(`[name="${key}"]`, form); if (input && settings[key]) input.value = settings[key]; }
  const tokenInput = $('[name="token"]', form); if (tokenInput) tokenInput.value = sessionStorage.getItem(GITHUB_TOKEN_KEY) || "";
}
function saveGithubSettings(settings) { localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(settings)); }
function encodeRepoPath(basePath, target) { const cleanBase = String(basePath || "").replace(/^\/+|\/+$/g, ""); const cleanTarget = String(target || "").replace(/^\/+/, ""); return [cleanBase, cleanTarget].filter(Boolean).join("/"); }
function utf8ToBase64(text) { const bytes = new TextEncoder().encode(text); let binary = ""; const chunk = 0x8000; for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk)); return btoa(binary); }
function base64ToUtf8(value) { const binary = atob(String(value).replace(/\s/g, "")); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return new TextDecoder().decode(bytes); }
async function blobToBase64(blob) { const buffer = await blob.arrayBuffer(); const bytes = new Uint8Array(buffer); let binary = ""; const chunk = 0x8000; for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk)); return btoa(binary); }
async function githubRequest(method, url, token, body) {
  const response = await fetch(url, { method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `GitHub API 请求失败（${response.status}）`);
  return payload;
}
async function getGithubJson(owner, repo, path, branch, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
  try { const payload = await githubRequest("GET", url, token); return { sha: payload.sha, data: JSON.parse(base64ToUtf8(payload.content)) }; }
  catch (error) { if (String(error.message).includes("Not Found")) return { sha: null, data: [] }; throw error; }
}
async function putGithubFile(owner, repo, path, branch, token, contentBase64, message, sha = null) { const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`; return githubRequest("PUT", url, token, { message, content: contentBase64, branch, ...(sha ? { sha } : {}) }); }

async function publishToGithub() {
  if (state.publishing) return;
  const form = dom.uploadForm; const data = new FormData(form);
  const owner = String(data.get("owner") || "").trim(); const repo = String(data.get("repo") || "").trim(); const branch = String(data.get("branch") || "main").trim(); const basePath = String(data.get("basePath") || "").trim(); const token = String(data.get("token") || "").trim();
  if (!owner || !repo || !branch || !token) { toast("请先填写 GitHub 仓库信息和访问令牌。", "error"); form.querySelector(".github-settings").open = true; return; }
  const publishButton = $("#publish-github"); state.publishing = true; publishButton.disabled = true;
  try {
    const media = await buildPendingMedia(); setStatus("读取 GitHub 作品数据…", "working");
    const worksPath = encodeRepoPath(basePath, "data/works.json");
    const { sha: worksSha, data: remoteData } = await getGithubJson(owner, repo, worksPath, branch, token);
    const remoteWorks = Array.isArray(remoteData) ? remoteData : remoteData.works || [];
    const title = String(data.get("title") || "未命名作品").trim(); const id = `${slugify(title)}-${Date.now()}`; const uploadedPaths = [];
    for (let index = 0; index < media.length; index += 1) {
      const item = media[index]; const path = encodeRepoPath(basePath, `uploads/${id}-${index + 1}.webp`); setStatus(`上传图片 ${index + 1}/${media.length}…`, "working"); const base64 = await blobToBase64(item.blob); await putGithubFile(owner, repo, path, branch, token, base64, `Add ${title} image ${index + 1}`, null);
      const baseClean = String(basePath || "").replace(/^\/+|\/+$/g, ""); const relativeAssetPath = baseClean && path.startsWith(baseClean + "/") ? path.slice(baseClean.length + 1) : path; uploadedPaths.push("./" + relativeAssetPath);
    }
    const coverIndex = state.coverIndex; const tags = String(data.get("tags") || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
    const record = { id, title, category: String(data.get("category") || "Design"), year: String(data.get("year") || new Date().getFullYear()), description: String(data.get("description") || "").trim(), tags, cover: uploadedPaths[coverIndex] || uploadedPaths[0], media: uploadedPaths };
    const nextWorks = [record, ...remoteWorks]; setStatus("提交作品索引…", "working");
    await putGithubFile(owner, repo, worksPath, branch, token, utf8ToBase64(JSON.stringify({ profile: remoteData.profile || {}, works: nextWorks }, null, 2)), `Publish work: ${title}`, worksSha);
    saveGithubSettings({ owner, repo, branch, basePath }); sessionStorage.setItem(GITHUB_TOKEN_KEY, token); setStatus("发布成功，GitHub Pages 正在更新。", "success"); toast("作品已发布到 GitHub，页面通常会在 1–3 分钟后更新。");
    await loadRemoteWorks(); renderWorks(); clearPendingFiles(); form.reset(); $('input[name="year"]', form).value = new Date().getFullYear(); applyGithubSettings({ owner, repo, branch, basePath });
  } catch (error) { console.error(error); setStatus(error.message || "发布失败。", "error"); toast(`发布失败：${error.message || "未知错误"}`, "error"); }
  finally { state.publishing = false; publishButton.disabled = false; }
}
function bindTilt(element) {
  if (!element || matchMedia("(pointer: coarse)").matches) return;
  element.addEventListener("pointermove", (event) => { const rect = element.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - 0.5; const y = (event.clientY - rect.top) / rect.height - 0.5; element.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`); element.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`); });
  element.addEventListener("pointerleave", () => { element.style.removeProperty("--rx"); element.style.removeProperty("--ry"); });
}
function initCursor() {
  if (matchMedia("(pointer: coarse)").matches) return;
  const dot = $(".cursor-dot"); const aura = $(".cursor-aura"); let pointerX = innerWidth / 2; let pointerY = innerHeight / 2; let auraX = pointerX; let auraY = pointerY;
  addEventListener("pointermove", (event) => { pointerX = event.clientX; pointerY = event.clientY; document.body.classList.add("has-pointer"); dot.style.transform = `translate(${pointerX}px, ${pointerY}px) translate(-50%, -50%)`; });
  const animate = () => { auraX += (pointerX - auraX) * 0.14; auraY += (pointerY - auraY) * 0.14; aura.style.transform = `translate(${auraX}px, ${auraY}px) translate(-50%, -50%)`; requestAnimationFrame(animate); }; animate();
  document.addEventListener("pointerover", (event) => { if (event.target.closest("a, button, input, textarea, select, .work-trigger")) document.body.classList.add("cursor-active"); });
  document.addEventListener("pointerout", (event) => { if (event.target.closest("a, button, input, textarea, select, .work-trigger")) document.body.classList.remove("cursor-active"); });
}
function initMagnetic() {
  if (matchMedia("(pointer: coarse)").matches) return;
  $$(".magnetic").forEach((item) => { item.addEventListener("pointermove", (event) => { const rect = item.getBoundingClientRect(); const x = (event.clientX - rect.left - rect.width / 2) / rect.width; const y = (event.clientY - rect.top - rect.height / 2) / rect.height; item.style.transform = `translate(${x * 6}px, ${y * 6}px)`; }); item.addEventListener("pointerleave", () => { item.style.transform = ""; }); });
}
function initReveal() {
  const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }); }, { threshold: 0.13 });
  $$(".reveal").forEach((element) => observer.observe(element));
}
function initAmbientCanvas() {
  const canvas = dom.canvas; if (!canvas) return; const context = canvas.getContext("2d"); const particles = []; let width = 0; let height = 0; let dpr = 1; const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); width = innerWidth; height = innerHeight; canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.min(74, Math.max(28, Math.floor((width * height) / 26000))); particles.length = 0;
    for (let index = 0; index < target; index += 1) particles.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, radius: Math.random() * 1.4 + 0.4 });
  }
  addEventListener("resize", resize); addEventListener("pointermove", (event) => { pointer.x = event.clientX; pointer.y = event.clientY; }); resize();
  const draw = () => {
    context.clearRect(0, 0, width, height); const isLight = document.documentElement.dataset.theme === "light"; const base = isLight ? "20,22,28" : "235,240,255";
    for (const particle of particles) { const dx = pointer.x - particle.x; const dy = pointer.y - particle.y; const distanceSquared = dx * dx + dy * dy; if (distanceSquared < 24500) { particle.vx -= dx * 0.000012; particle.vy -= dy * 0.000012; } particle.vx *= 0.995; particle.vy *= 0.995; particle.x += particle.vx; particle.y += particle.vy; if (particle.x < -20) particle.x = width + 20; if (particle.x > width + 20) particle.x = -20; if (particle.y < -20) particle.y = height + 20; if (particle.y > height + 20) particle.y = -20; context.beginPath(); context.fillStyle = `rgba(${base},${isLight ? 0.18 : 0.2})`; context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); context.fill(); }
    for (let a = 0; a < particles.length; a += 1) for (let b = a + 1; b < particles.length; b += 1) { const dx = particles[a].x - particles[b].x; const dy = particles[a].y - particles[b].y; const distance = Math.hypot(dx, dy); if (distance < 105) { context.beginPath(); context.moveTo(particles[a].x, particles[a].y); context.lineTo(particles[b].x, particles[b].y); context.strokeStyle = `rgba(${base},${(1 - distance / 105) * (isLight ? 0.045 : 0.06)})`; context.lineWidth = 1; context.stroke(); } }
    requestAnimationFrame(draw);
  };
  draw();
}
function initTheme() { const saved = localStorage.getItem("nova.theme"); const preferred = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; document.documentElement.dataset.theme = saved || preferred; $("#theme-toggle").addEventListener("click", () => { const next = document.documentElement.dataset.theme === "light" ? "dark" : "light"; document.documentElement.dataset.theme = next; localStorage.setItem("nova.theme", next); }); }
function initEvents() {
  addEventListener("scroll", () => dom.nav.classList.toggle("is-scrolled", scrollY > 18), { passive: true }); dom.nav.classList.toggle("is-scrolled", scrollY > 18);
  dom.filterRow.addEventListener("click", (event) => { const button = event.target.closest("[data-filter]"); if (button) setFilter(button.dataset.filter); });
  $("#open-studio").addEventListener("click", openStudio); $("#open-studio-secondary").addEventListener("click", openStudio); $$("[data-close-studio]").forEach((button) => button.addEventListener("click", closeStudio));
  $("#lightbox-close").addEventListener("click", closeLightbox); $("#lightbox-prev").addEventListener("click", () => moveLightbox(-1)); $("#lightbox-next").addEventListener("click", () => moveLightbox(1)); dom.lightbox.addEventListener("click", (event) => { if (event.target === dom.lightbox) closeLightbox(); });
  dom.uploadForm.addEventListener("submit", saveLocalWork); $("#publish-github").addEventListener("click", publishToGithub); dom.fileInput.addEventListener("change", (event) => addPendingFiles(event.target.files));
  dom.dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dom.dropzone.classList.add("is-dragging"); }); dom.dropzone.addEventListener("dragleave", () => dom.dropzone.classList.remove("is-dragging")); dom.dropzone.addEventListener("drop", (event) => { event.preventDefault(); dom.dropzone.classList.remove("is-dragging"); addPendingFiles(event.dataTransfer.files); });
  dom.uploadForm.addEventListener("input", (event) => { const name = event.target.name; if (name === "token") sessionStorage.setItem(GITHUB_TOKEN_KEY, event.target.value); if (["owner", "repo", "branch", "basePath"].includes(name)) { const data = new FormData(dom.uploadForm); saveGithubSettings({ owner: String(data.get("owner") || ""), repo: String(data.get("repo") || ""), branch: String(data.get("branch") || "main"), basePath: String(data.get("basePath") || "") }); } });
  addEventListener("keydown", (event) => { if (event.key === "Escape") { if (!dom.studio.hidden) closeStudio(); else if (!dom.lightbox.hidden) closeLightbox(); } if (!dom.lightbox.hidden && event.key === "ArrowLeft") moveLightbox(-1); if (!dom.lightbox.hidden && event.key === "ArrowRight") moveLightbox(1); if (event.key.toLowerCase() === "u" && !event.metaKey && !event.ctrlKey && !event.altKey) openStudio(); });
}
async function init() { initTheme(); initCursor(); initAmbientCanvas(); initReveal(); initMagnetic(); initEvents(); $("#year").textContent = new Date().getFullYear(); await loadRemoteWorks(); await hydrateLocalWorks(); renderWorks(); applyGithubSettings(readGithubSettings()); window.setTimeout(() => dom.loader.classList.add("is-hidden"), 650); }
init();
