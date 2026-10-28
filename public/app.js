// ============================================
// STATE MANAGEMENT
// ============================================
let state = {
  articles: [],
  selectedArticle: null,
  activeTab: 'dashboard',
  isCrawling: false,
  metrics: null,
};

// ============================================
// API HELPERS
// ============================================
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ============================================
// METRICS CALCULATION
// ============================================
function calculateMetrics(articles) {
  const total = articles.length;
  if (total === 0) return { totalArticles: 0, goodCount: 0, neutralCount: 0, badCount: 0, goodPercentage: 0, neutralPercentage: 0, badPercentage: 0, netReputationScore: 0, averageReputationScore: 0, crisisAlertsCount: 0 };

  let good = 0, neutral = 0, bad = 0, totalRep = 0, crisis = 0;
  articles.forEach(a => {
    if (a.sentiment === 'Tốt') good++;
    else if (a.sentiment === 'Xấu') bad++;
    else neutral++;
    totalRep += a.reputationScore || 50;
    if (a.crisisAlert) crisis++;
  });

  const gp = Math.round((good / total) * 100);
  const np = Math.round((neutral / total) * 100);
  const bp = Math.round((bad / total) * 100);

  return {
    totalArticles: total, goodCount: good, neutralCount: neutral, badCount: bad,
    goodPercentage: gp, neutralPercentage: np, badPercentage: bp,
    netReputationScore: gp - bp,
    averageReputationScore: Math.round(totalRep / total),
    crisisAlertsCount: crisis,
  };
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderHeader() {
  const m = state.metrics;
  document.getElementById('navArticleCount').textContent = m.totalArticles;
  const crisisBar = document.getElementById('crisisBar');
  if (m.crisisAlertsCount > 0) {
    crisisBar.classList.remove('hidden');
    document.getElementById('crisisCount').textContent = m.crisisAlertsCount;
  } else {
    crisisBar.classList.add('hidden');
  }
}

function renderDashboard() {
  const m = state.metrics;
  const articles = state.articles;

  // Outlet distribution
  const outletCounts = {};
  articles.forEach(a => {
    const o = a.outlet || 'Khác';
    if (!outletCounts[o]) outletCounts[o] = { total: 0, good: 0, neutral: 0, bad: 0 };
    outletCounts[o].total++;
    if (a.sentiment === 'Tốt') outletCounts[o].good++;
    else if (a.sentiment === 'Xấu') outletCounts[o].bad++;
    else outletCounts[o].neutral++;
  });
  const sortedOutlets = Object.entries(outletCounts).sort((a, b) => b[1].total - a[1].total).slice(0, 6);

  // Topic distribution
  const topicCounts = {};
  articles.forEach(a => (a.topics || []).forEach(t => {
    if (!topicCounts[t]) topicCounts[t] = { count: 0, bad: 0 };
    topicCounts[t].count++;
    if (a.sentiment === 'Xấu') topicCounts[t].bad++;
  }));
  const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 6);

  // Urgent articles
  const urgent = articles.filter(a => a.sentiment === 'Xấu' || a.crisisAlert || a.riskLevel === 'Cao' || a.riskLevel === 'Khẩn cấp');

  document.getElementById('mainContent').innerHTML = `
    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Chỉ Số Danh Tiếng (NRS)</div>
        <div class="kpi-value red">${m.netReputationScore > 0 ? '+' : ''}${m.netReputationScore}</div>
        <div style="font-size:12px;color:var(--stone-500);margin-top:4px;">% Tốt - % Xấu</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:var(--emerald)">Bài Tốt (Tích Cực)</div>
        <div class="kpi-value good">${m.goodCount} <span style="font-size:14px;">(${m.goodPercentage}%)</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:var(--sky)">Bài Trung Bình</div>
        <div class="kpi-value neutral">${m.neutralCount} <span style="font-size:14px;">(${m.neutralPercentage}%)</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:var(--rose)">Bài Xấu (Rủi Ro)</div>
        <div class="kpi-value bad">${m.badCount} <span style="font-size:14px;">(${m.badPercentage}%)</span></div>
        <div style="font-size:12px;color:var(--rose);margin-top:4px;">${m.crisisAlertsCount} bài cần phản hồi</div>
      </div>
    </div>

    <!-- Sentiment Bar -->
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Phổ Sắc Thái Báo Chí Về Đại Học UEH</h3>
      <p style="font-size:12px;color:var(--stone-500);margin-bottom:12px;">Dựa trên ${m.totalArticles} bài báo được phân loại bởi Gemini 3.8 Flash</p>
      <div class="sentiment-bar">
        <div class="sentiment-segment sentiment-good" style="width:${m.goodPercentage}%"></div>
        <div class="sentiment-segment sentiment-neutral" style="width:${m.neutralPercentage}%"></div>
        <div class="sentiment-segment sentiment-bad" style="width:${m.badPercentage}%"></div>
      </div>
      <div style="display:flex;gap:24px;font-size:12px;font-weight:500;flex-wrap:wrap;">
        <span style="color:var(--emerald)">● Tốt: ${m.goodPercentage}%</span>
        <span style="color:var(--sky)">● Trung bình: ${m.neutralPercentage}%</span>
        <span style="color:var(--rose)">● Xấu: ${m.badPercentage}%</span>
      </div>
    </div>

    <!-- Outlets & Topics -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
      <div class="card">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">🏢 Độ Phủ Theo Đầu Báo</h3>
        ${sortedOutlets.map(([o, d]) => {
          const gp = Math.round((d.good / d.total) * 100);
          const bp = Math.round((d.bad / d.total) * 100);
          return `<div style="padding:10px;background:var(--stone-50);border-radius:8px;margin-bottom:8px;border:1px solid var(--stone-200);">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:6px;">
              <span>${o}</span><span style="color:var(--stone-500);font-family:monospace;">${d.total} bài</span>
            </div>
            <div style="height:6px;border-radius:3px;overflow:hidden;display:flex;background:var(--stone-200);">
              <div style="width:${gp}%;background:var(--emerald);"></div>
              <div style="width:${100-gp-bp}%;background:var(--sky);"></div>
              <div style="width:${bp}%;background:var(--rose);"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">📊 Chủ Đề Truyền Thông Trọng Tâm</h3>
        ${sortedTopics.map(([t, d]) => `<div style="display:flex;justify-content:space-between;padding:10px;background:var(--stone-50);border-radius:8px;margin-bottom:8px;border:1px solid var(--stone-200);font-size:12px;">
          <span style="font-weight:600;">${t}</span>
          <span><span style="background:white;padding:2px 8px;border-radius:4px;border:1px solid var(--stone-200);font-family:monospace;">${d.count} bài</span>
          ${d.bad > 0 ? `<span style="background:var(--rose-light);color:var(--rose);padding:2px 6px;border-radius:4px;margin-left:4px;">${d.bad} cảnh báo</span>` : ''}</span>
        </div>`).join('')}
      </div>
    </div>

    <!-- Crisis Desk -->
    ${urgent.length > 0 ? `
    <div class="card" style="background:rgba(255,241,242,0.7);border-color:rgba(225,29,72,0.3);margin-bottom:24px;">
      <h3 style="font-size:16px;font-weight:700;color:#881337;margin-bottom:4px;">⚠️ Trung Tâm Phản Ứng Khủng Hoảng</h3>
      <p style="font-size:12px;color:#be123c;margin-bottom:12px;">${urgent.length} bài viết cần Ban Truyền thông UEH theo dõi sát sao</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
        ${urgent.map(a => `<div class="card" style="cursor:pointer;border-color:rgba(225,29,72,0.2);" onclick="openArticleModal('${a.id}')">
          <div style="font-size:11px;color:var(--stone-500);margin-bottom:6px;"><strong style="color:#be123c;">${a.outlet}</strong> • ${a.publishedAt}</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:6px;">${a.title}</div>
          <div style="font-size:11px;color:var(--stone-600);font-style:italic;">"${a.summary?.slice(0,100)}..."</div>
          <div style="margin-top:8px;font-size:11px;color:#be123c;font-weight:600;">Rủi ro: ${a.riskLevel}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Recent Articles -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:16px;font-weight:700;">Bài Báo Mới Cập Nhật</h3>
        <button class="btn-link" onclick="switchTab('articles')" style="color:var(--ueh-red);">Xem tất cả →</button>
      </div>
      ${articles.slice(0, 5).map(a => `<div style="padding:12px 8px;border-bottom:1px solid var(--stone-100);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;" onclick="openArticleModal('${a.id}')">
        <div style="flex:1;">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;font-size:11px;">
            <span class="badge badge-${a.sentiment === 'Tốt' ? 'good' : a.sentiment === 'Xấu' ? 'bad' : 'neutral'}">${a.sentiment}</span>
            <span style="color:var(--stone-500);">${a.outlet}</span>
            <span style="color:var(--stone-400);">• ${a.publishedAt}</span>
          </div>
          <div style="font-size:13px;font-weight:600;">${a.title}</div>
        </div>
        <div style="text-align:right;font-family:monospace;font-size:12px;font-weight:700;color:var(--stone-700);">${a.reputationScore}/100</div>
      </div>`).join('')}
    </div>
  `;
}

function renderArticles() {
  const articles = state.articles;
  document.getElementById('mainContent').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <div>
          <h2 style="font-size:18px;font-weight:700;">Kho Dữ Liệu Báo Chí Về UEH</h2>
          <p style="font-size:12px;color:var(--stone-500);">Tổng số ${articles.length} bài báo đã được phân loại</p>
        </div>
        <button class="btn" style="background:var(--ueh-red);color:white;" onclick="switchTab('crawler')">+ Cào / Nhập Bài Mới</button>
      </div>
      <div class="filters" id="filterBar">
        <input type="text" class="search-input" id="searchInput" placeholder="Tìm tiêu đề, nội dung..." />
        <select class="select-filter" id="sentimentFilter">
          <option value="ALL">Mọi sắc thái</option>
          <option value="Tốt">Tốt</option>
          <option value="Trung bình">Trung bình</option>
          <option value="Xấu">Xấu</option>
        </select>
        <select class="select-filter" id="riskFilter">
          <option value="ALL">Mọi rủi ro</option>
          <option value="Thấp">Thấp</option>
          <option value="Trung bình">Trung bình</option>
          <option value="Cao">Cao</option>
          <option value="Khẩn cấp">Khẩn cấp</option>
        </select>
      </div>
    </div>
    <div id="articleList"></div>
  `;

  renderArticleList();

  document.getElementById('searchInput')?.addEventListener('input', renderArticleList);
  document.getElementById('sentimentFilter')?.addEventListener('change', renderArticleList);
  document.getElementById('riskFilter')?.addEventListener('change', renderArticleList);
}

function renderArticleList() {
  const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  const sentimentFilter = document.getElementById('sentimentFilter')?.value || 'ALL';
  const riskFilter = document.getElementById('riskFilter')?.value || 'ALL';

  let filtered = state.articles.filter(a => {
    if (search) {
      const match = (a.title || '').toLowerCase().includes(search) || (a.content || '').toLowerCase().includes(search) || (a.summary || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    if (sentimentFilter !== 'ALL' && a.sentiment !== sentimentFilter) return false;
    if (riskFilter !== 'ALL' && a.riskLevel !== riskFilter) return false;
    return true;
  });

  const container = document.getElementById('articleList');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px;"><p style="color:var(--stone-400);">Không tìm thấy bài báo phù hợp.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const isBad = a.sentiment === 'Xấu';
    const isGood = a.sentiment === 'Tốt';
    return `<div class="article-card ${isBad ? 'bad' : isGood ? 'good' : ''}">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;">
          <div class="article-badges">
            <span class="badge badge-${isGood ? 'good' : isBad ? 'bad' : 'neutral'}">${a.sentiment === 'Tốt' ? '✓' : a.sentiment === 'Xấu' ? '⚠' : '−'} ${a.sentiment}</span>
            <span style="font-weight:600;background:var(--stone-100);padding:2px 8px;border-radius:4px;">${a.outlet}</span>
            <span style="color:var(--stone-500);">${a.publishedAt}</span>
            ${a.crisisAlert ? '<span class="badge badge-crisis">⚠ Nguy cơ khủng hoảng</span>' : ''}
          </div>
          <div class="article-title" onclick="openArticleModal('${a.id}')">${a.title}</div>
          <div class="article-summary"><strong>Tóm tắt LLM:</strong> ${a.summary}</div>
          ${a.sentimentReasoning ? `<div class="article-reasoning"><strong>Luận giải:</strong> ${a.sentimentReasoning}</div>` : ''}
          <div style="margin-top:8px;">${(a.topics || []).map(t => `<span class="topic-pill">#${t}</span>`).join('')}</div>
        </div>
        <div class="article-sidebar">
          <div class="score-display">
            <div class="score-label">Điểm Danh Tiếng</div>
            <div class="score-value ${isGood ? 'good' : isBad ? 'bad' : 'neutral'}">${a.reputationScore}/100</div>
            <div style="font-size:11px;color:var(--stone-500);">Sắc thái: ${a.sentimentScore > 0 ? '+' : ''}${a.sentimentScore}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-detail" onclick="openArticleModal('${a.id}')">Chi Tiết</button>
            <button class="btn-icon" onclick="reanalyzeArticle('${a.id}')" title="Phân tích lại">⟳</button>
            <button class="btn-icon danger" onclick="deleteArticle('${a.id}')" title="Xóa">🗑</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderCrawler() {
  document.getElementById('mainContent').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">🔄 Thu Thập & Phân Tích Báo Chí UEH</h2>
      <p style="font-size:12px;color:var(--stone-500);margin-bottom:16px;">Nhập URL bài báo hoặc nội dung trực tiếp — Gemini 3.8 Flash sẽ phân tích và lưu vào MongoDB.</p>
      
      <div style="display:flex;gap:8px;margin-bottom:16px;background:var(--stone-100);padding:4px;border-radius:12px;flex-wrap:wrap;">
        <button class="filter-btn active" onclick="setCrawlMode('url')" id="modeUrl">🔗 Cào Từ URL</button>
        <button class="filter-btn" onclick="setCrawlMode('content')" id="modeContent">✏️ Nhập Nội Dung</button>
      </div>

      <div id="crawlerForm"></div>
    </div>
    <div id="crawlResult"></div>
  `;
  setCrawlMode('url');
}

function setCrawlMode(mode) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(mode === 'url' ? 'modeUrl' : 'modeContent')?.classList.add('active');

  const form = document.getElementById('crawlerForm');
  if (!form) return;

  if (mode === 'url') {
    form.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="url" id="crawlUrlInput" placeholder="Dán đường link bài báo (https://tuoitre.vn/...)" style="flex:1;min-width:250px;padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
        <button class="btn" style="background:var(--ueh-red);color:white;padding:10px 20px;" onclick="handleCrawlUrl()" id="btnCrawlUrl">✨ Cào & Phân Tích</button>
      </div>
      <p style="font-size:11px;color:var(--stone-400);margin-top:8px;">Hỗ trợ: Tuổi Trẻ, Thanh Niên, VnExpress, Dân Trí, VietnamNet, SGGP, v.v.</p>
    `;
  } else {
    form.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <input type="text" id="manualTitle" placeholder="Tiêu đề bài báo *" style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <input type="text" id="manualOutlet" placeholder="Nguồn báo (vd: Tuổi Trẻ)" value="Báo Tuổi Trẻ" style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
          <input type="text" id="manualCategory" placeholder="Chuyên mục" value="Giáo dục & Đào tạo" style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <input type="text" id="manualAuthor" placeholder="Tên tác giả" style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
          <input type="url" id="manualUrl" placeholder="Link bài báo (không bắt buộc)" style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);" />
        </div>
        <textarea id="manualContent" rows="6" placeholder="Dán toàn văn nội dung bài báo vào đây..." style="padding:10px 14px;border:1px solid var(--stone-300);border-radius:8px;font-size:13px;font-family:var(--font);resize:vertical;"></textarea>
        <button class="btn" style="background:var(--ueh-red);color:white;padding:10px 20px;align-self:flex-start;" onclick="handleManualContent()" id="btnManualContent">✨ Phân Tích & Lưu Vào MongoDB</button>
      </div>
    `;
  }
}

async function handleCrawlUrl() {
  const input = document.getElementById('crawlUrlInput');
  const btn = document.getElementById('btnCrawlUrl');
  const url = input?.value?.trim();
  if (!url) return alert('Vui lòng nhập URL bài báo.');

  btn.disabled = true;
  btn.textContent = 'Đang cào & phân tích...';
  document.getElementById('crawlResult').innerHTML = '';

  try {
    const data = await apiPost('/api/crawl-url', { url });
    state.articles.unshift(data.article);
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    input.value = '';
    
    document.getElementById('crawlResult').innerHTML = `
      <div class="card" style="border-color:rgba(16,185,129,0.3);background:rgba(209,250,229,0.3);">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:8px;">✅ Cào thành công & đã lưu vào MongoDB</h4>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${data.article.title}</div>
        <div style="font-size:12px;color:var(--stone-600);">Sắc thái: <strong>${data.article.sentiment}</strong> • Điểm UEH: ${data.article.reputationScore}/100 • Rủi ro: ${data.article.riskLevel}</div>
      </div>
    `;
  } catch (err) {
    document.getElementById('crawlResult').innerHTML = `<div class="card" style="border-color:rgba(225,29,72,0.3);background:rgba(255,241,242,0.3);color:#be123c;font-size:13px;">❌ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Cào & Phân Tích';
  }
}

async function handleManualContent() {
  const title = document.getElementById('manualTitle')?.value?.trim();
  const content = document.getElementById('manualContent')?.value?.trim();
  if (!title && !content) return alert('Vui lòng nhập tiêu đề hoặc nội dung.');

  const btn = document.getElementById('btnManualContent');
  btn.disabled = true;
  btn.textContent = 'Đang phân tích...';

  try {
    const analysis = await apiPost('/api/analyze-article', {
      title: title || 'Bài báo về UEH',
      content: content || title,
      outlet: document.getElementById('manualOutlet')?.value || 'Báo chí',
      category: document.getElementById('manualCategory')?.value || 'Giáo dục',
      publishedAt: new Date().toISOString().split('T')[0],
    });

    const res = await apiPost('/api/save-article', {
      title: title || 'Bài báo về UEH',
      content: content || title,
      outlet: document.getElementById('manualOutlet')?.value || 'Báo chí',
      category: document.getElementById('manualCategory')?.value || 'Giáo dục',
      publishedAt: new Date().toISOString().split('T')[0],
      author: document.getElementById('manualAuthor')?.value?.trim() || 'Không rõ tác giả',
      url: document.getElementById('manualUrl')?.value?.trim() || null,
      ...analysis,
    });

    state.articles.unshift(res.article);
    state.metrics = calculateMetrics(state.articles);
    renderHeader();

    document.getElementById('manualTitle').value = '';
    document.getElementById('manualContent').value = '';
    document.getElementById('crawlResult').innerHTML = `<div class="card" style="border-color:rgba(16,185,129,0.3);background:rgba(209,250,229,0.3);font-size:13px;">✅ Đã phân tích và lưu: <strong>${res.article.sentiment}</strong> — Điểm UEH: ${res.article.reputationScore}/100</div>`;
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Phân Tích & Lưu Vào MongoDB';
  }
}

function renderLlmStation() {
  document.getElementById('mainContent').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">✨ Trạm Phân Tích LLM & Xử Lý Khủng Hoảng</h2>
      <p style="font-size:12px;color:var(--stone-500);">Mô hình: <strong>gemini-3.8-flash</strong> (Server-side API). Phân tích sắc thái và tạo kịch bản PR.</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">📝 Dữ Liệu Đầu Vào</h3>
        <input type="text" id="llmTitle" placeholder="Tiêu đề bài báo..." style="width:100%;padding:8px 12px;border:1px solid var(--stone-200);border-radius:8px;font-size:12px;margin-bottom:8px;font-family:var(--font);" />
        <input type="text" id="llmOutlet" placeholder="Nguồn báo..." value="Báo Giáo Dục" style="width:100%;padding:8px 12px;border:1px solid var(--stone-200);border-radius:8px;font-size:12px;margin-bottom:8px;font-family:var(--font);" />
        <textarea id="llmContent" rows="5" placeholder="Nội dung bài báo..." style="width:100%;padding:8px 12px;border:1px solid var(--stone-200);border-radius:8px;font-size:12px;font-family:var(--font);resize:vertical;"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn" style="background:var(--ueh-red);color:white;flex:1;" onclick="runLlmAnalysis()">✨ Phân Tích</button>
          <button class="btn" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;flex:1;" onclick="runCrisisResponse()">⚠️ Tạo Kịch Bản PR</button>
        </div>
      </div>
      <div class="card" id="llmOutput">
        <p style="color:var(--stone-400);text-align:center;padding:32px;font-size:13px;">Bấm "Phân Tích" để xem kết quả từ Gemini 3.8 Flash.</p>
      </div>
    </div>
  `;
}

async function runLlmAnalysis() {
  const title = document.getElementById('llmTitle')?.value || '';
  const content = document.getElementById('llmContent')?.value || '';
  const outlet = document.getElementById('llmOutlet')?.value || 'Báo chí';

  const output = document.getElementById('llmOutput');
  output.innerHTML = '<p style="text-align:center;padding:32px;color:var(--stone-400);">Đang phân tích qua Gemini 3.8 Flash...</p>';

  try {
    const r = await apiPost('/api/analyze-article', { title, content, outlet });
    output.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="padding:10px;border-radius:8px;text-align:center;background:${r.sentiment === 'Tốt' ? 'var(--emerald-light)' : r.sentiment === 'Xấu' ? 'var(--rose-light)' : 'var(--sky-light)'};">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;">Sắc Thái</div>
          <div style="font-size:18px;font-weight:900;">${r.sentiment}</div>
        </div>
        <div style="padding:10px;border-radius:8px;text-align:center;background:var(--stone-50);">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--stone-500);">Cảm Xúc</div>
          <div style="font-size:18px;font-weight:900;">${r.sentimentScore > 0 ? '+' : ''}${r.sentimentScore}</div>
        </div>
        <div style="padding:10px;border-radius:8px;text-align:center;background:var(--stone-50);">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--stone-500);">Điểm UEH</div>
          <div style="font-size:18px;font-weight:900;color:var(--ueh-red);">${r.reputationScore}</div>
        </div>
      </div>
      <div style="font-size:12px;margin-bottom:8px;"><strong>Tóm tắt:</strong> ${r.summary}</div>
      <div style="font-size:12px;margin-bottom:8px;"><strong>Luận giải:</strong> ${r.sentimentReasoning}</div>
      <div style="font-size:12px;padding:10px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d;"><strong>Khuyến nghị PR:</strong> ${r.recommendedPrAction}</div>
      <div style="font-size:10px;color:var(--stone-400);margin-top:8px;font-family:monospace;">Engine: ${r.engine}</div>
    `;
  } catch (err) {
    output.innerHTML = `<p style="color:var(--rose);padding:16px;">Lỗi: ${err.message}</p>`;
  }
}

async function runCrisisResponse() {
  const title = document.getElementById('llmTitle')?.value || 'Sự việc cần phản hồi';
  const content = document.getElementById('llmContent')?.value || '';
  const outlet = document.getElementById('llmOutlet')?.value || 'Báo chí';
  const output = document.getElementById('llmOutput');

  output.innerHTML = '<p style="text-align:center;padding:32px;color:var(--stone-400);">Đang soạn thảo kịch bản...</p>';

  try {
    const r = await apiPost('/api/generate-crisis-response', {
      title, content, outlet, sentiment: 'Xấu', riskLevel: 'Cao',
    });
    output.innerHTML = `
      <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;">📋 Kịch Bản Phản Hồi (Gemini 3.8 Flash)</h4>
      <div style="font-size:12px;white-space:pre-wrap;line-height:1.7;max-height:400px;overflow-y:auto;background:var(--stone-50);padding:12px;border-radius:8px;">${r.statement}</div>
    `;
  } catch (err) {
    output.innerHTML = `<p style="color:var(--rose);padding:16px;">Lỗi: ${err.message}</p>`;
  }
}

function renderArchitecture() {
  document.getElementById('mainContent').innerHTML = `
    <div class="card">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">💻 Kiến Trúc Hệ Thống & Quy Trình LLM</h2>
      <p style="font-size:12px;color:var(--stone-500);margin-bottom:16px;">Backend: Node.js/Express + MongoDB + Gemini 3.8 Flash</p>

      <h3 style="font-size:15px;font-weight:700;margin:16px 0 8px;">1. Sơ Đồ Luồng Dữ Liệu</h3>
      <div style="background:var(--stone-900);color:var(--stone-200);padding:16px;border-radius:8px;font-family:monospace;font-size:12px;overflow-x:auto;">
URL Bài Báo → Cheerio Scraper → Gemini 3.8 Flash → MongoDB (articles collection) → Frontend Dashboard
      </div>

      <h3 style="font-size:15px;font-weight:700;margin:16px 0 8px;">2. MongoDB Schema</h3>
      <pre style="background:var(--stone-900);color:#6ee7b7;padding:16px;border-radius:8px;font-family:monospace;font-size:11px;overflow-x:auto;">{
  _id: ObjectId,
  id: "ueh-xxx",
  title: "UEH vào Top 501-600 THE Rankings",
  outlet: "Báo Tuổi Trẻ",
  sentiment: "Tốt",        // Tốt | Trung bình | Xấu
  sentimentScore: 92,      // -100 đến +100
  reputationScore: 96,     // 0 đến 100
  riskLevel: "Thấp",
  crisisAlert: false,
  summary: "...",
  topics: ["Xếp hạng & Kiểm định"],
  recommendedPrAction: "...",
  analyzedAt: ISODate(...)
}</pre>

      <h3 style="font-size:15px;font-weight:700;margin:16px 0 8px;">3. Gemini 3.8 Flash Configuration</h3>
      <pre style="background:var(--stone-900);color:#fcd34d;padding:16px;border-radius:8px;font-family:monospace;font-size:11px;overflow-x:auto;">{
  model: "gemini-3.8-flash",   // ✅ Model chính thức
  responseMimeType: "application/json",
  // ❌ KHÔNG có temperature — 3.8 Flash không hỗ trợ
  // ❌ KHÔNG có top_p, top_k
}</pre>
      <p style="font-size:11px;color:var(--stone-500);margin-top:4px;">Lưu ý: Gemini 3.8 Flash không hỗ trợ tham số temperature. Xóa bỏ để tránh lỗi API.</p>
    </div>
  `;
}

// ============================================
// MODAL
// ============================================
function openArticleModal(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;

  const modal = document.getElementById('articleModal');
  const content = document.getElementById('modalContent');
  const isGood = article.sentiment === 'Tốt';
  const isBad = article.sentiment === 'Xấu';

  content.innerHTML = `
    <div style="padding:24px;border-bottom:1px solid var(--stone-200);position:sticky;top:0;background:white;z-index:10;border-radius:16px 16px 0 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;">
            <span class="badge badge-${isGood ? 'good' : isBad ? 'bad' : 'neutral'}">${article.sentiment}</span>
            <span style="font-weight:600;">${article.outlet}</span>
            <span style="color:var(--stone-500);">${article.publishedAt}</span>
          </div>
          <h2 style="font-size:18px;font-weight:700;">${article.title}</h2>
        </div>
        <button onclick="closeModal()" style="background:var(--stone-100);border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:18px;">✕</button>
      </div>
    </div>
    <div style="padding:24px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
        <div style="text-align:center;padding:10px;background:var(--stone-50);border-radius:8px;">
          <div style="font-size:10px;color:var(--stone-500);text-transform:uppercase;font-weight:700;">Cảm Xúc</div>
          <div style="font-size:18px;font-weight:900;color:${article.sentimentScore > 0 ? 'var(--emerald)' : article.sentimentScore < 0 ? 'var(--rose)' : 'var(--stone-700)'};">${article.sentimentScore > 0 ? '+' : ''}${article.sentimentScore}</div>
        </div>
        <div style="text-align:center;padding:10px;background:var(--stone-50);border-radius:8px;">
          <div style="font-size:10px;color:var(--stone-500);text-transform:uppercase;font-weight:700;">Điểm UEH</div>
          <div style="font-size:18px;font-weight:900;color:var(--ueh-red);">${article.reputationScore}</div>
        </div>
        <div style="text-align:center;padding:10px;background:var(--stone-50);border-radius:8px;">
          <div style="font-size:10px;color:var(--stone-500);text-transform:uppercase;font-weight:700;">Rủi Ro</div>
          <div style="font-size:14px;font-weight:700;color:${article.riskLevel === 'Cao' || article.riskLevel === 'Khẩn cấp' ? 'var(--rose)' : 'var(--emerald)'};">${article.riskLevel}</div>
        </div>
        <div style="text-align:center;padding:10px;background:var(--stone-50);border-radius:8px;">
          <div style="font-size:10px;color:var(--stone-500);text-transform:uppercase;font-weight:700;">Reach</div>
          <div style="font-size:14px;font-weight:700;font-family:monospace;">${(article.reach || 150000).toLocaleString('vi-VN')}</div>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <strong style="font-size:12px;text-transform:uppercase;color:var(--stone-700);">Tóm Tắt LLM:</strong>
        <p style="font-size:13px;color:var(--stone-700);margin-top:4px;line-height:1.6;">${article.summary}</p>
      </div>

      <div style="margin-bottom:16px;">
        <strong style="font-size:12px;text-transform:uppercase;color:var(--stone-700);">Nội Dung Bài Báo:</strong>
        <div style="font-size:13px;color:var(--stone-600);margin-top:4px;line-height:1.7;max-height:200px;overflow-y:auto;background:var(--stone-50);padding:12px;border-radius:8px;">${article.content || article.summary}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="padding:12px;background:var(--stone-50);border-radius:8px;">
          <strong style="font-size:11px;text-transform:uppercase;color:var(--stone-700);">Luận Giải:</strong>
          <p style="font-size:12px;color:var(--stone-600);margin-top:4px;">${article.sentimentReasoning}</p>
        </div>
        <div style="padding:12px;background:var(--stone-50);border-radius:8px;">
          <strong style="font-size:11px;text-transform:uppercase;color:var(--stone-700);">Bằng Chứng:</strong>
          <ul style="font-size:12px;color:var(--stone-600);margin-top:4px;padding-left:16px;font-style:italic;">
            ${(article.evidenceQuotes || [article.title]).map(q => `<li>"${q}"</li>`).join('')}
          </ul>
        </div>
      </div>

      <div style="padding:16px;background:#fef3c7;border-radius:12px;border:1px solid #fcd34d;">
        <strong style="font-size:12px;color:#92400e;">✨ Khuyến Nghị Hành Động:</strong>
        <p style="font-size:12px;color:#78350f;margin-top:4px;">${article.recommendedPrAction}</p>
        <button class="btn" style="background:var(--ueh-red);color:white;margin-top:8px;" onclick="generateModalCrisis('${article.id}')">Tạo Kịch Bản Phản Hồi</button>
        <div id="modalCrisisOutput" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:16px;font-size:11px;color:var(--stone-400);font-family:monospace;">Phân tích bởi: ${article.analyzedBy || 'Gemini 3.8 Flash'}</div>
    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('articleModal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function generateModalCrisis(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;

  const output = document.getElementById('modalCrisisOutput');
  output.innerHTML = '<p style="font-size:12px;color:var(--stone-500);">Đang soạn thảo...</p>';

  try {
    const r = await apiPost('/api/generate-crisis-response', {
      title: article.title, content: article.content, outlet: article.outlet,
      sentiment: article.sentiment, riskLevel: article.riskLevel,
    });
    output.innerHTML = `<div style="font-size:12px;white-space:pre-wrap;background:white;padding:12px;border-radius:8px;margin-top:8px;max-height:200px;overflow-y:auto;">${r.statement}</div>`;
  } catch (err) {
    output.innerHTML = `<p style="color:var(--rose);font-size:12px;">Lỗi: ${err.message}</p>`;
  }
}

// ============================================
// ACTIONS
// ============================================
async function reanalyzeArticle(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;

  try {
    const res = await apiPost('/api/analyze-article', {
      title: article.title, content: article.content, outlet: article.outlet,
      publishedAt: article.publishedAt, category: article.category,
    });
    Object.assign(article, res, { analyzedAt: new Date().toISOString() });
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    renderArticles();
  } catch (err) { alert('Lỗi phân tích lại: ' + err.message); }
}

async function deleteArticle(articleId) {
  if (!confirm('Xóa bài báo này khỏi MongoDB?')) return;
  try {
    await fetch(`/api/articles/${articleId}`, { method: 'DELETE' });
    state.articles = state.articles.filter(a => a.id !== articleId);
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    renderArticles();
  } catch (err) { alert('Lỗi xóa: ' + err.message); }
}

async function quickCrawl() {
  const outlets = ['Báo Tuổi Trẻ', 'Báo Thanh Niên', 'VnExpress', 'Báo Dân Trí'];
  const outlet = outlets[Math.floor(Math.random() * outlets.length)];
  const btn = document.getElementById('btnQuickCrawl');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-icon">⟳</span> Đang cào...';

  try {
    // Simulate crawl with a sample content (no URL)
    const sampleTitles = [
      'UEH mở thêm 4 chuyên ngành mới đón đầu AI & Kinh tế Bền vững',
      'Sinh viên UEH vô địch cuộc thi Khởi nghiệp ASEAN 2026',
      'UEH công bố học bổng 50 tỷ đồng cho sinh viên vượt khó',
    ];
    const title = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
    const content = `${title}. Đại học Kinh tế TP.HCM (UEH) vừa công bố thông tin mới nhất, thu hút sự quan tâm của đông đảo sinh viên và phụ huynh.`;
    const analysis = await apiPost('/api/analyze-article', { title, content, outlet });

    await apiPost('/api/save-article', {
      title, content, outlet,
      category: 'Giáo dục & Đào tạo',
      publishedAt: new Date().toISOString().split('T')[0],
      ...analysis,
    });

    const all = await apiGet('/api/articles');
    state.articles = all.articles;
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    if (state.activeTab === 'articles') renderArticles();
    if (state.activeTab === 'dashboard') renderDashboard();
  } catch (err) { alert('Lỗi: ' + err.message); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '⟳ Cào Tin Báo Mới';
  }
}

// ============================================
// NAVIGATION
// ============================================
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const renderers = {
    dashboard: renderDashboard,
    articles: renderArticles,
    crawler: renderCrawler,
    'llm-station': renderLlmStation,
    architecture: renderArchitecture,
  };
  renderers[tab]?.();
}

// ============================================
// INIT
// ============================================
async function init() {
  try {
    const data = await apiGet('/api/articles');
    state.articles = data.articles || [];
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    switchTab('dashboard');
  } catch (err) {
    console.error('Init error:', err);
    state.articles = [];
    state.metrics = calculateMetrics(state.articles);
    renderHeader();
    switchTab('dashboard');
    document.getElementById('mainContent').insertAdjacentHTML(
      'afterbegin',
      `<div class="card" role="alert" style="margin-bottom:24px;color:var(--rose);">❌ Không thể tải dữ liệu bài báo: ${err.message}. Trang vẫn hoạt động, nhưng các chức năng cần MongoDB sẽ khả dụng sau khi kết nối được khôi phục.</div>`
    );
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnQuickCrawl')?.addEventListener('click', quickCrawl);
  document.getElementById('btnViewCrisis')?.addEventListener('click', () => switchTab('articles'));
  document.getElementById('btnExportJson')?.addEventListener('click', async () => {
    const data = await apiGet('/api/articles');
    const blob = new Blob([JSON.stringify(data.articles, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ueh_articles.json'; a.click();
  });
  document.getElementById('btnExportCsv')?.addEventListener('click', async () => {
    const data = await apiGet('/api/articles');
    const headers = ['ID','Tiêu đề','Nguồn','Ngày','Sắc thái','Điểm UEH','Rủi ro'];
    const rows = data.articles.map(a => [a.id, `"${(a.title||'').replace(/"/g,'""')}"`, a.outlet, a.publishedAt, a.sentiment, a.reputationScore, a.riskLevel].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ueh_articles.csv'; a.click();
  });

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Close modal on overlay click
  document.getElementById('articleModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'articleModal') closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  init();
});