(function () {
  const SUPABASE_URL = 'https://ungjwmttwczkrulodbpa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZ2p3bXR0d2N6a3J1bG9kYnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTYyMTYsImV4cCI6MjA5MTAzMjIxNn0.8tgP7u7kjrSo8U10z7oDocX8jpiWvxCZAbyGSXQEkEM';

  let supabase, currentUser, userRole = 'user', currentView = 'wechat';
  let wechatAccounts = [], qqAccounts = [];
  const NINE_GRID_DAILY_COST_WAN = 2000, HB_TO_RMB_RATE = 38;

  // DOM 元素
  const appDiv = document.getElementById('app');
  const authModal = document.getElementById('authModal');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const userGreeting = document.getElementById('userGreeting');
  const logoutBtn = document.getElementById('logoutBtn');
  const addNewBtn = document.getElementById('addNewBtn');
  const resetBtn = document.getElementById('resetDefaultBtn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const authTitle = document.getElementById('authTitle');
  const switchAuthBtn = document.getElementById('switchAuthMode');
  const submitAuthBtn = document.getElementById('submitAuth');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  let isLoginMode = true;

  // 视图切换
  const mainHeader = document.getElementById('mainHeader');
  const chartHeader = document.getElementById('chartHeader');
  const mainTableView = document.getElementById('mainTableView');
  const chartViewContainer = document.getElementById('chartViewContainer');
  let currentChart = null; // 存储 Chart.js 实例，用于销毁

  // Toast
  function showToast(msg) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.innerText = msg;
    toast.style.zIndex = '4000';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function setLoading(show) { loadingOverlay.style.display = show ? 'flex' : 'none'; }
  function escapeHtml(str) { return String(str).replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m)); }
  function escapeAttr(str) { return String(str).replace(/[&<>"]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m] || m)); }

  // ======================== 认证 ========================
  async function initAuth() {
    try {
      console.log('🚀 初始化 Supabase');
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false }
      });

      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔔 状态变化:', event, session?.user?.email);
        if (session?.user) {
          try {
            currentUser = session.user;
            await fetchUserRole();
            showApp();
            await loadData();
            await updateStats();
          } catch (e) {
            console.error('💥 登录后出错:', e);
            showAuthModal();
          }
        } else {
          currentUser = null; userRole = 'user';
          showAuthModal();
        }
      });

      // 恢复本地会话
      const localSession = JSON.parse(localStorage.getItem('supabase.auth.token') || 'null')?.currentSession;
      if (localSession?.access_token && localSession?.expires_at > Math.floor(Date.now()/1000)) {
        try {
          await supabase.auth.setSession({ access_token: localSession.access_token, refresh_token: localSession.refresh_token });
        } catch (e) {
          console.warn('会话恢复失败');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          showAuthModal();
        }
      } else {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        showAuthModal();
      }
    } catch (err) {
      console.error('初始化异常:', err);
      showAuthModal();
    }
  }

  async function fetchUserRole() {
    if (!currentUser) return;
    try {
      const { data } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
      userRole = data?.role || 'user';
    } catch (e) { userRole = 'user'; }
  }

  function showApp() {
    appDiv.style.display = 'block';
    authModal.style.display = 'none';
    userGreeting.innerText = `${currentUser.email} (${userRole === 'admin' ? '👑 管理员' : '👤 用户'})`;
    switchToMainView();
  }

  function showAuthModal() {
    appDiv.style.display = 'none';
    authModal.style.display = 'flex';
  }

  // ======================== 视图切换 ========================
  function switchToMainView() {
    mainHeader.style.display = 'flex';
    chartHeader.style.display = 'none';
    mainTableView.style.display = 'block';
    chartViewContainer.style.display = 'none';
    if (currentChart) { currentChart.destroy(); currentChart = null; }
  }

  async function switchToChartView() {
    mainHeader.style.display = 'none';
    chartHeader.style.display = 'flex';
    mainTableView.style.display = 'none';
    chartViewContainer.style.display = 'block';
    await renderCharts();
  }

  // 绑定按钮
  document.getElementById('chartViewBtn')?.addEventListener('click', switchToChartView);
  document.getElementById('backToMainBtn')?.addEventListener('click', switchToMainView);

  // ======================== 登录/注册 ========================
  switchAuthBtn.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? '🔐 登录' : '📝 注册';
    submitAuthBtn.innerText = isLoginMode ? '登录' : '注册';
    switchAuthBtn.innerText = isLoginMode ? '没有账号？去注册' : '已有账号？去登录';
  });

  submitAuthBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return showToast('请填写邮箱和密码');
    setLoading(true);
    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.includes('Invalid login credentials')) throw new Error('邮箱或密码错误');
          if (error.message.includes('Email not confirmed')) throw new Error('邮箱未验证，请检查收件箱');
          throw error;
        }
        showToast('登录成功');
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (error.message.includes('already registered')) throw new Error('该邮箱已注册，请直接登录或检查验证邮件');
          throw error;
        }
        if (data?.user?.identities?.length === 0) {
          showToast('📨 该邮箱已注册但未验证，请检查邮箱确认链接');
        } else if (data?.session === null) {
          showToast('📨 注册成功！请检查邮箱确认链接后登录');
        } else {
          showToast('✅ 注册成功，已自动登录');
        }
      }
    } catch (err) { showToast(err.message); }
    finally { setLoading(false); }
  });

  logoutBtn.addEventListener('click', async () => { setLoading(true); await supabase.auth.signOut(); setLoading(false); });

  // ======================== 数据操作 ========================
  async function loadData() {
    if (!currentUser) return;
    setLoading(true);
    try {
      let query = supabase.from('accounts').select('*');
      if (userRole !== 'admin') query = query.eq('user_id', currentUser.id);
      const { data, error } = await query;
      if (error) throw error;
      wechatAccounts = []; qqAccounts = [];
      data.forEach(row => {
        const acc = dbRowToAccount(row);
        syncSafeBoxByCondition(acc, false);
        if (row.platform === 'wechat') wechatAccounts.push(acc);
        else qqAccounts.push(acc);
      });
      renderTable();
    } catch (err) { showToast('加载数据失败: ' + err.message); }
    finally { setLoading(false); }
  }

  function dbRowToAccount(row) {
    return {
      id: row.id, user_id: row.user_id, name: row.name,
      gameName: row.game_name || '', contact: row.contact || '',
      stamina: row.stamina, endurance: row.endurance,
      hbCoin: Number(row.hb_coin), grid9Days: Number(row.grid9_days),
      safeBoxSize: row.safe_box_size, status: row.status, credit: row.credit,
      realName: row.real_name || '', bindAccount: row.bind_account || '未绑定',
      phone: row.phone || '', currentSaleAmount: Number(row.current_sale_amount),
      totalSaleAmount: Number(row.total_sale_amount),
      lastStatusChangeTime: Number(row.last_status_change_time), platform: row.platform
    };
  }

  function isCoverConditionMet(acc) { return acc.grid9Days * NINE_GRID_DAILY_COST_WAN >= acc.hbCoin && acc.hbCoin > 0; }

  function syncSafeBoxByCondition(acc, showMsg = true) {
    const cond = isCoverConditionMet(acc);
    if (cond && acc.safeBoxSize !== 9) { acc.safeBoxSize = 9; if (showMsg) showToast(`✨ "${acc.name}" 九格卡覆盖，安全箱升为9格`); }
    else if (!cond && acc.safeBoxSize === 9) { acc.safeBoxSize = 4; if (showMsg) showToast(`⚠️ "${acc.name}" 不再覆盖，安全箱降回4格`); }
  }

  async function recordSale(acc, amount) {
    if (!acc.id || amount <= 0) return;
    await supabase.from('sales').insert({ account_id: acc.id, user_id: acc.user_id, account_name: acc.name, platform: acc.platform, amount: amount });
    updateStats();
  }

  async function handleStatusChange(acc, oldStatus, newStatus) {
    const now = Date.now();
    if (oldStatus === '售出中' && newStatus === '未售') {
      const saleVal = acc.currentSaleAmount || 0;
      acc.totalSaleAmount = (acc.totalSaleAmount || 0) + saleVal;
      acc.currentSaleAmount = 0;
      acc.lastStatusChangeTime = now;
      if (acc.hbCoin !== 0) { acc.hbCoin = 0; showToast(`💸 "${acc.name}" 售出，哈弗币已清零`); }
      syncSafeBoxByCondition(acc, true);
      await recordSale(acc, saleVal);
      await logHbChange(acc, 0, acc.hbCoin); // 记录清零
    } else if (newStatus === '未售' && oldStatus !== '未售') {
      acc.lastStatusChangeTime = now;
    } else if (oldStatus === '未售' && newStatus !== '未售') {
      acc.lastStatusChangeTime = 0;
    }
  }

  async function logHbChange(acc, changeAmount, newTotal) {
    if (!acc.id) return;
    await supabase.from('hbf_logs').insert({
      user_id: acc.user_id || currentUser.id,
      account_id: acc.id,
      change_amount: changeAmount,
      total_hb_after: newTotal,
      changed_at: new Date().toISOString(),
      platform: acc.platform || currentView
    });
  }

  async function updateStats() {
    if (!currentUser) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let todayQ = supabase.from('sales').select('amount').gte('sold_at', startOfDay);
    let monthQ = supabase.from('sales').select('amount').gte('sold_at', startOfMonth);
    let allQ = supabase.from('sales').select('amount');
    if (userRole !== 'admin') { todayQ = todayQ.eq('user_id', currentUser.id); monthQ = monthQ.eq('user_id', currentUser.id); allQ = allQ.eq('user_id', currentUser.id); }

    const [todayRes, monthRes, allRes] = await Promise.all([todayQ, monthQ, allQ]);
    const sum = (data) => data.reduce((s, r) => s + parseFloat(r.amount), 0);
    document.getElementById('todayIncome').innerText = sum(todayRes.data).toFixed(2);
    document.getElementById('monthIncome').innerText = sum(monthRes.data).toFixed(2);
    document.getElementById('globalTotalAmount').innerText = sum(allRes.data).toFixed(2);

    let totalHb = 0;
    (userRole === 'admin' ? [...wechatAccounts, ...qqAccounts] : getCurrentAccounts()).forEach(a => totalHb += a.hbCoin);
    document.getElementById('globalHbEstimate').innerText = (totalHb / HB_TO_RMB_RATE).toFixed(2);
  }

  // ======================== 表格渲染（含固定列） ========================
  function renderTable() {
    const accounts = getCurrentAccounts();
    const cols = getColumns();
    document.getElementById('tableHeader').innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    const tbody = document.getElementById('tableBody');
    if (!accounts.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">✨ 暂无账号，点击新增 ✨</td></tr>`;
      document.getElementById('totalSalesAll').innerText = '0.00 元';
      updateStats();
      return;
    }
    let html = '';
    accounts.forEach((acc, idx) => {
      const statusClass = acc.status === '售出中' ? 'status-sold' : (acc.status === '待售处' ? 'status-waiting' : 'status-unsold');
      const creditClass = acc.credit === 'OK' ? 'credit-ok' : (acc.credit === '差' ? 'credit-bad' : 'credit-normal');
      const isCover = isCoverConditionMet(acc);
      const rowClass = isCover ? 'row-cover-active' : '';
      const daysSince = (acc.status === '未售' && acc.lastStatusChangeTime) ? Math.floor((Date.now() - acc.lastStatusChangeTime) / 86400000) : 0;

      const cells = cols.map(col => {
        switch (col.key) {
          case 'index': return `<td>${idx + 1}</td>`;
          case 'name': return `<td class="editable-cell" data-row="${idx}" data-field="name" data-value="${escapeAttr(acc.name)}">${escapeHtml(acc.name)}</td>`;
          case 'gameName': return `<td class="editable-cell" data-row="${idx}" data-field="gameName" data-value="${escapeAttr(acc.gameName)}">${escapeHtml(acc.gameName || '—')}</td>`;
          case 'contact': return `<td class="editable-cell" data-row="${idx}" data-field="contact" data-value="${escapeAttr(acc.contact)}">${escapeHtml(acc.contact || '—')}</td>`;
          case 'bindAccount': return `<td class="editable-cell" data-row="${idx}" data-field="bindAccount" data-value="${escapeAttr(acc.bindAccount)}">${escapeHtml(acc.bindAccount)}</td>`;
          case 'stamina': return `<td class="editable-cell" data-row="${idx}" data-field="stamina" data-type="select" data-value="${acc.stamina}">${acc.stamina}级</td>`;
          case 'endurance': return `<td class="editable-cell" data-row="${idx}" data-field="endurance" data-type="select" data-value="${acc.endurance}">${acc.endurance}级</td>`;
          case 'hbCoin': return `<td class="editable-cell" data-row="${idx}" data-field="hbCoin" data-type="number" data-value="${acc.hbCoin}">${acc.hbCoin.toLocaleString()} 万</td>`;
          case 'grid9Days': return `<td class="editable-cell" data-row="${idx}" data-field="grid9Days" data-type="number" data-value="${acc.grid9Days}">${acc.grid9Days > 0 ? acc.grid9Days + '天' : '—'}</td>`;
          case 'safeBoxSize': return `<td class="editable-cell" data-row="${idx}" data-field="safeBoxSize" data-type="select" data-value="${acc.safeBoxSize}">${acc.safeBoxSize}格${isCover ? '<span class="safeBox-cover-badge">✨覆盖</span>' : ''}</td>`;
          case 'status': return `<td class="editable-cell" data-row="${idx}" data-field="status" data-type="select" data-value="${acc.status}"><span class="badge ${statusClass}">${acc.status}</span></td>`;
          case 'credit': return `<td class="editable-cell" data-row="${idx}" data-field="credit" data-type="select" data-value="${acc.credit}"><span class="badge ${creditClass}">${acc.credit}</span></td>`;
          case 'daysSince': return `<td class="logic-cell">${daysSince} 天</td>`;
          case 'realName': return `<td class="editable-cell" data-row="${idx}" data-field="realName" data-value="${escapeAttr(acc.realName)}">${escapeHtml(acc.realName || '—')}</td>`;
          case 'currentSaleAmount': return `<td class="editable-cell" data-row="${idx}" data-field="currentSaleAmount" data-type="number" data-value="${acc.currentSaleAmount}">${acc.currentSaleAmount.toLocaleString()} 元</td>`;
          case 'totalSaleAmount': return `<td class="logic-cell">${acc.totalSaleAmount.toLocaleString()} 元</td>`;
          case 'phone': return `<td class="editable-cell" data-row="${idx}" data-field="phone" data-value="${escapeAttr(acc.phone)}">${escapeHtml(acc.phone || '—')}</td>`;
          case 'actions': return `<td class="action-btns"><button class="icon-btn delete-btn" data-index="${idx}">🗑️</button></td>`;
          default: return '<td>—</td>';
        }
      });
      html += `<tr class="${rowClass}">${cells.join('')}</tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('totalSalesAll').innerText = accounts.reduce((s, a) => s + (a.totalSaleAmount || 0), 0).toFixed(2) + ' 元';
    updateStats();
    attachCellEvents();
  }

  function getColumns() {
    return [
      { key: 'index', label: '#' }, { key: 'name', label: '昵称' },
      { key: 'gameName', label: '🎮游戏名称' }, { key: 'contact', label: currentView === 'wechat' ? '💬微信号' : '🐧QQ号' },
      { key: 'stamina', label: '💪体' }, { key: 'endurance', label: '⚡耐' },
      { key: 'hbCoin', label: '💰哈弗币(万)' }, { key: 'grid9Days', label: '📆9格(天)' },
      { key: 'safeBoxSize', label: '📦安全箱' }, { key: 'status', label: '🏷️状态' },
      { key: 'credit', label: '⭐信用' }, { key: 'daysSince', label: '📅距上次出售(天)' },
      { key: 'realName', label: '👤实名认证' }, { key: 'currentSaleAmount', label: '💰本次售价(元)' },
      { key: 'totalSaleAmount', label: '💎累计出售(元)' }, { key: 'phone', label: '📞手机号' },
      { key: 'bindAccount', label: currentView === 'wechat' ? '🔒安全中心·QQ绑定' : '🔒安全中心·微信绑定' },
      { key: 'actions', label: '⚙️操作' }
    ];
  }

  function attachCellEvents() {
    document.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        if (cell.querySelector('.inline-editor')) return;
        const rowIdx = parseInt(cell.dataset.row), field = cell.dataset.field;
        const type = cell.dataset.type || 'text', value = cell.dataset.value || '';
        startInlineEdit(cell, rowIdx, field, value, type);
      });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteAccount(parseInt(btn.dataset.index));
      });
    });
  }

  function startInlineEdit(cell, rowIdx, field, currentVal, type) {
    let editor;
    if (type === 'select') {
      const optionsMap = { stamina: [1,2,3,4,5,6,7], endurance: [1,2,3,4,5,6,7], safeBoxSize: ['2格','4格','6格','9格'], status: ['售出中','未售','待售处'], credit: ['OK','差','良好'] };
      editor = document.createElement('select'); editor.className = 'inline-editor';
      (optionsMap[field] || []).forEach(opt => {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt;
        if (field === 'safeBoxSize' ? `${currentVal}格` === opt : String(opt) === String(currentVal)) o.selected = true;
        editor.appendChild(o);
      });
    } else {
      editor = document.createElement('input');
      editor.type = ['hbCoin','grid9Days','currentSaleAmount'].includes(field) ? 'number' : 'text';
      editor.className = 'inline-editor'; editor.value = currentVal;
    }
    cell.innerHTML = ''; cell.appendChild(editor); editor.focus();

    const save = async () => {
      let newVal = editor.value;
      if (type === 'select' && field === 'safeBoxSize') newVal = parseInt(newVal);
      if (String(newVal) === String(currentVal)) { cancel(); return; }
      await updateAccountField(rowIdx, field, newVal);
    };
    const cancel = () => renderTable();
    editor.addEventListener('blur', save);
    editor.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); });
  }

  async function updateAccountField(rowIdx, field, newVal) {
    const accounts = getCurrentAccounts();
    const acc = accounts[rowIdx];
    const oldHb = acc.hbCoin;
    const oldStatus = acc.status;
    let needSync = false;

    switch (field) {
      case 'name': acc.name = newVal?.trim() || '无名'; break;
      case 'gameName': acc.gameName = newVal?.trim() || ''; break;
      case 'contact': acc.contact = newVal; break;
      case 'stamina': acc.stamina = Math.min(7, Math.max(1, parseInt(newVal)||3)); break;
      case 'endurance': acc.endurance = Math.min(7, Math.max(1, parseInt(newVal)||3)); break;
      case 'hbCoin': acc.hbCoin = parseFloat(newVal) || 0; needSync = true; break;
      case 'grid9Days': acc.grid9Days = parseInt(newVal) || 0; needSync = true; break;
      case 'safeBoxSize': acc.safeBoxSize = [2,4,6,9].includes(Number(newVal)) ? Number(newVal) : 4; break;
      case 'status': acc.status = newVal; break;
      case 'credit': acc.credit = newVal; break;
      case 'realName': acc.realName = newVal?.trim() || ''; break;
      case 'bindAccount': acc.bindAccount = newVal?.trim() || '未绑定'; break;
      case 'phone': acc.phone = newVal?.trim() || ''; break;
      case 'currentSaleAmount': acc.currentSaleAmount = parseFloat(newVal) || 0; break;
    }

    if (field === 'status') { await handleStatusChange(acc, oldStatus, acc.status); needSync = true; }
    if (needSync) syncSafeBoxByCondition(acc, true);

    // 记录哈弗币变化日志（如果变化了）
    if (field === 'hbCoin' && oldHb !== acc.hbCoin) {
      await logHbChange(acc, acc.hbCoin - oldHb, acc.hbCoin);
    }

    await saveAccountToDB(acc);
    renderTable();
  }

  async function saveAccountToDB(acc) {
    const row = {
      id: acc.id, user_id: acc.user_id || currentUser.id, name: acc.name,
      game_name: acc.gameName, contact: acc.contact, stamina: acc.stamina,
      endurance: acc.endurance, hb_coin: acc.hbCoin, grid9_days: acc.grid9Days,
      safe_box_size: acc.safeBoxSize, status: acc.status, credit: acc.credit,
      real_name: acc.realName, bind_account: acc.bindAccount, phone: acc.phone,
      current_sale_amount: acc.currentSaleAmount, total_sale_amount: acc.totalSaleAmount,
      last_status_change_time: acc.lastStatusChangeTime, platform: acc.platform || currentView
    };
    await supabase.from('accounts').upsert(row, { onConflict: 'id' });
  }

  async function addNewAccount() {
    const name = prompt('输入昵称', '新账号');
    if (name === null) return;
    const acc = {
      name: name.trim() || '新账号', gameName: '', contact: '', stamina: 3, endurance: 3, hbCoin: 0, grid9Days: 0,
      safeBoxSize: 4, status: '未售', credit: 'OK', realName: '', bindAccount: '未绑定', phone: '',
      currentSaleAmount: 0, totalSaleAmount: 0, lastStatusChangeTime: Date.now(), platform: currentView, user_id: currentUser.id
    };
    const { data, error } = await supabase.from('accounts').insert({ ...acc }).select();
    if (error) return showToast('新增失败: ' + error.message);
    acc.id = data[0].id;
    getCurrentAccounts().push(acc);
    renderTable();
  }

  async function deleteAccount(idx) {
    const accounts = getCurrentAccounts();
    const acc = accounts[idx];
    if (!confirm(`确定删除「${acc.name}」？`)) return;
    await supabase.from('accounts').delete().eq('id', acc.id);
    accounts.splice(idx, 1);
    renderTable();
  }

  async function resetCurrentView() {
    if (!confirm(`⚠️ 清空当前平台所有数据？`)) return;
    const accounts = getCurrentAccounts();
    const ids = accounts.map(a => a.id);
    if (ids.length) await supabase.from('accounts').delete().in('id', ids);
    if (currentView === 'wechat') wechatAccounts = [];
    else qqAccounts = [];
    renderTable();
  }

  function getCurrentAccounts() { return currentView === 'wechat' ? wechatAccounts : qqAccounts; }

  function switchView(view) {
    currentView = view;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));
    renderTable();
  }

  addNewBtn.addEventListener('click', addNewAccount);
  resetBtn.addEventListener('click', resetCurrentView);
  tabBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // ======================== 图表绘制 ========================
  async function renderCharts() {
    // 先销毁已有图表
    if (currentChart) { currentChart.destroy(); currentChart = null; }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. 今日销售额按小时
    let salesQuery = supabase.from('sales').select('amount, sold_at').gte('sold_at', startOfDay);
    if (userRole !== 'admin') salesQuery = salesQuery.eq('user_id', currentUser.id);
    const { data: salesData } = await salesQuery;

    const hourlySales = new Array(24).fill(0);
    salesData?.forEach(r => {
      const hour = new Date(r.sold_at).getHours();
      hourlySales[hour] += parseFloat(r.amount);
    });
    new Chart(document.getElementById('salesChart'), {
      type: 'line',
      data: {
        labels: Array.from({length:24}, (_,i) => `${i}时`),
        datasets: [{ label: '销售额 (元)', data: hourlySales, borderColor: '#2c7da0', tension: 0.3, fill: false, pointBackgroundColor: '#2c7da0' }]
      },
      options: { responsive: true, maintainAspectRatio: true }
    });

    // 2. 今日哈弗币变化（从日志中获取变化量）
    let hbLogQuery = supabase.from('hbf_logs').select('change_amount, changed_at').gte('changed_at', startOfDay);
    if (userRole !== 'admin') hbLogQuery = hbLogQuery.eq('user_id', currentUser.id);
    const { data: hbLogs } = await hbLogQuery;
    const hbChanges = [];
    hbLogs?.forEach(log => {
      hbChanges.push({ x: new Date(log.changed_at), y: parseFloat(log.change_amount) });
    });
    hbChanges.sort((a,b) => a.x - b.x);
    new Chart(document.getElementById('hbChangeChart'), {
      type: 'bar',
      data: {
        datasets: [{
          label: '哈弗币变化 (万)',
          data: hbChanges,
          backgroundColor: hbChanges.map(v => v.y >= 0 ? '#16a34a' : '#dc2626'),
          borderColor: 'transparent',
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { type: 'time', time: { unit: 'hour' }, title: { display: true, text: '时间' } },
          y: { title: { display: true, text: '变化量 (万)' } }
        }
      }
    });

    // 3. 累计总哈弗币走势（基于日志计算各时间点总哈弗币）
    const { data: allHbLogs } = await supabase.from('hbf_logs').select('change_amount, total_hb_after, account_id, changed_at').order('changed_at', { ascending: true });
    const totalHbTimeline = [];
    let runningTotal = 0;
    const accountMap = new Map();
    allHbLogs?.forEach(log => {
      accountMap.set(log.account_id, parseFloat(log.total_hb_after));
      runningTotal = Array.from(accountMap.values()).reduce((s, v) => s + v, 0);
      totalHbTimeline.push({ x: new Date(log.changed_at), y: runningTotal });
    });
    new Chart(document.getElementById('totalHbChart'), {
      type: 'line',
      data: {
        datasets: [{
          label: '总哈弗币 (万)',
          data: totalHbTimeline,
          borderColor: '#0f172a',
          tension: 0.2,
          fill: false,
          pointRadius: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { type: 'time', time: { unit: 'day' }, title: { display: true, text: '日期' } },
          y: { title: { display: true, text: '总哈弗币 (万)' } }
        }
      }
    });
  }

  // 全局错误兜底
  window.addEventListener('error', e => { console.error('全局错误', e.error); showAuthModal(); });
  window.addEventListener('unhandledrejection', e => { console.error('未捕获异步', e.reason); showAuthModal(); });

  initAuth();
})();
