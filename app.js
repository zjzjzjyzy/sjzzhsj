(function () {
  const SUPABASE_URL = 'https://ungjwmttwczkrulodbpa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZ2p3bXR0d2N6a3J1bG9kYnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTYyMTYsImV4cCI6MjA5MTAzMjIxNn0.8tgP7u7kjrSo8U10z7oDocX8jpiWvxCZAbyGSXQEkEM';

  // ======================== 全局变量 ========================
  let supabase, currentUser, userRole = 'user', currentView = 'wechat';
  let wechatAccounts = [], qqAccounts = [];
  const NINE_GRID_DAILY_COST_WAN = 2000;
  let hbToRmbRate = parseFloat(localStorage.getItem('hbToRmbRate')) || 38; // 自定义汇率

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
  let chartInstances = {};

  // ======================== 工具函数 ========================
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

  function setLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
  }

  function escapeAttr(str) {
    return String(str).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] || m));
  }

  // ======================== 认证 ========================
  async function initAuth() {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false }
      });

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          currentUser = session.user;
          await fetchUserRole();
          showApp();
          await loadData();
          await updateStats();
        } else {
          currentUser = null;
          userRole = 'user';
          showAuthModal();
        }
      });

      // 加强本地令牌检查，避免无效令牌导致白屏
      const rawToken = localStorage.getItem('supabase.auth.token');
      if (rawToken) {
        try {
          const parsed = JSON.parse(rawToken);
          const expiresAt = parsed?.currentSession?.expires_at;
          if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            showAuthModal();
            return;
          }
          const { error } = await supabase.auth.setSession({
            access_token: parsed.currentSession.access_token,
            refresh_token: parsed.currentSession.refresh_token
          });
          if (error) throw error;
        } catch (e) {
          console.warn('恢复会话失败，清除本地令牌', e);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          showAuthModal();
        }
      } else {
        showAuthModal();
      }
    } catch (err) {
      console.error('初始化异常', err);
      showAuthModal();
    }
  }

  async function fetchUserRole() {
    if (!currentUser) return;
    try {
      const { data } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
      userRole = data?.role || 'user';
    } catch (e) {
      userRole = 'user';
    }
  }

  function showApp() {
    appDiv.style.display = 'block';
    authModal.style.display = 'none';
    userGreeting.innerText = `${currentUser.email} (${userRole === 'admin' ? '👑 管理员' : '👤 用户'})`;
    // 添加汇率设置按钮（仅一次）
    if (!document.getElementById('rateBtn')) {
      const rateBtn = document.createElement('button');
      rateBtn.id = 'rateBtn';
      rateBtn.className = 'btn btn-outline';
      rateBtn.style.marginLeft = '8px';
      rateBtn.innerText = '⚙️ 汇率设置';
      rateBtn.addEventListener('click', changeRate);
      document.querySelector('.user-area').appendChild(rateBtn);
    }
    switchToMainView();
  }

  function showAuthModal() {
    appDiv.style.display = 'none';
    authModal.style.display = 'flex';
  }

  // ======================== 汇率设置 ========================
  function changeRate() {
    const newRate = prompt(`当前汇率：${hbToRmbRate} 万哈弗币 = 1 元\n请输入新的汇率（万/元）`, hbToRmbRate);
    if (newRate === null) return;
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate <= 0) {
      showToast('请输入有效的正数');
      return;
    }
    hbToRmbRate = rate;
    localStorage.setItem('hbToRmbRate', rate);
    showToast(`✅ 汇率已更新为 ${rate} 万/元`);
    updateStats();
  }

  // ======================== 视图切换 ========================
  function switchToMainView() {
    mainHeader.style.display = 'flex';
    chartHeader.style.display = 'none';
    mainTableView.style.display = 'block';
    chartViewContainer.style.display = 'none';
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
  }

  async function switchToChartView() {
    mainHeader.style.display = 'none';
    chartHeader.style.display = 'flex';
    mainTableView.style.display = 'none';
    chartViewContainer.style.display = 'block';
    await ensureDailySnapshot();
    await renderCharts();
  }

  document.getElementById('chartViewBtn').addEventListener('click', switchToChartView);
  document.getElementById('backToMainBtn').addEventListener('click', switchToMainView);

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
    } catch (err) {
      showToast(err.message);
    } finally {
      setLoading(false);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  });

  // ======================== 数据操作 ========================
  async function loadData() {
    if (!currentUser) return;
    setLoading(true);
    try {
      let query = supabase.from('accounts').select('*');
      if (userRole !== 'admin') query = query.eq('user_id', currentUser.id);
      const { data, error } = await query;
      if (error) throw error;

      wechatAccounts = [];
      qqAccounts = [];
      data.forEach(row => {
        const acc = dbRowToAccount(row);
        syncSafeBoxByCondition(acc, false);
        if (row.platform === 'wechat') wechatAccounts.push(acc);
        else qqAccounts.push(acc);
      });
      renderTable();
    } catch (err) {
      showToast('加载数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function dbRowToAccount(row) {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      gameName: row.game_name || '',
      contact: row.contact || '',
      stamina: row.stamina,
      endurance: row.endurance,
      hbCoin: Number(row.hb_coin),
      grid9Days: Number(row.grid9_days),
      safeBoxSize: row.safe_box_size,
      status: row.status,
      credit: row.credit,
      realName: row.real_name || '',
      bindAccount: row.bind_account || '未绑定',
      phone: row.phone || '',
      currentSaleAmount: Number(row.current_sale_amount),
      totalSaleAmount: Number(row.total_sale_amount),
      lastStatusChangeTime: Number(row.last_status_change_time),
      platform: row.platform
    };
  }

  function isCoverConditionMet(acc) {
    return acc.grid9Days * NINE_GRID_DAILY_COST_WAN >= acc.hbCoin && acc.hbCoin > 0;
  }

  function syncSafeBoxByCondition(acc, showMsg = true) {
    const cond = isCoverConditionMet(acc);
    if (cond && acc.safeBoxSize !== 9) {
      acc.safeBoxSize = 9;
      if (showMsg) showToast(`✨ "${acc.name}" 九格卡覆盖，安全箱升为9格`);
    } else if (!cond && acc.safeBoxSize === 9) {
      acc.safeBoxSize = 4;
      if (showMsg) showToast(`⚠️ "${acc.name}" 不再覆盖，安全箱降回4格`);
    }
  }

  async function recordSale(acc, amount) {
    if (!acc.id || amount <= 0) return;
    await supabase.from('sales').insert({
      account_id: acc.id,
      user_id: acc.user_id,
      account_name: acc.name,
      platform: acc.platform,
      amount: amount
    });
    updateStats();
  }

  async function handleStatusChange(acc, oldStatus, newStatus) {
    const now = Date.now();
    if (oldStatus === '售出中' && newStatus === '未售') {
      const saleVal = acc.currentSaleAmount || 0;
      acc.totalSaleAmount = (acc.totalSaleAmount || 0) + saleVal;
      acc.currentSaleAmount = 0;
      acc.lastStatusChangeTime = now;
      if (acc.hbCoin !== 0) {
        acc.hbCoin = 0;
        showToast(`💸 "${acc.name}" 售出，哈弗币已清零`);
      }
      syncSafeBoxByCondition(acc, true);
      await recordSale(acc, saleVal);
    } else if (newStatus === '未售' && oldStatus !== '未售') {
      acc.lastStatusChangeTime = now;
    } else if (oldStatus === '未售' && newStatus !== '未售') {
      acc.lastStatusChangeTime = 0;
    }
  }

  // ======================== 统计（修正全部累计 + 汇率） ========================
  async function updateStats() {
    if (!currentUser) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let todayQ = supabase.from('sales').select('amount').gte('sold_at', startOfDay);
    let monthQ = supabase.from('sales').select('amount').gte('sold_at', startOfMonth);
    if (userRole !== 'admin') {
      todayQ = todayQ.eq('user_id', currentUser.id);
      monthQ = monthQ.eq('user_id', currentUser.id);
    }

    const [todayRes, monthRes] = await Promise.all([todayQ, monthQ]);
    const sum = (data) => data.reduce((s, r) => s + parseFloat(r.amount), 0);

    document.getElementById('todayIncome').innerText = sum(todayRes.data).toFixed(2);
    document.getElementById('monthIncome').innerText = sum(monthRes.data).toFixed(2);

    // 全部累计：所有账号（微信+QQ）的 totalSaleAmount 累加
    const allAccounts = [...wechatAccounts, ...qqAccounts];
    const totalAll = allAccounts.reduce((s, a) => s + (a.totalSaleAmount || 0), 0);
    document.getElementById('globalTotalAmount').innerText = totalAll.toFixed(2);

    // 哈弗币估值（使用自定义汇率）
    const totalHb = allAccounts.reduce((s, a) => s + (a.hbCoin || 0), 0);
    document.getElementById('globalHbEstimate').innerText = (totalHb / hbToRmbRate).toFixed(2);
    const rateSmall = document.querySelector('#statsPanel small');
    if (rateSmall) rateSmall.innerText = `(${hbToRmbRate}万=1元)`;
  }

  // ======================== 表格渲染 ========================
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
      const daysSince = (acc.status === '未售' && acc.lastStatusChangeTime)
        ? Math.floor((Date.now() - acc.lastStatusChangeTime) / 86400000)
        : 0;

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
      { key: 'index', label: '#' },
      { key: 'name', label: '昵称' },
      { key: 'gameName', label: '🎮游戏名称' },
      { key: 'contact', label: currentView === 'wechat' ? '💬微信号' : '🐧QQ号' },
      { key: 'stamina', label: '💪体' },
      { key: 'endurance', label: '⚡耐' },
      { key: 'hbCoin', label: '💰哈弗币(万)' },
      { key: 'grid9Days', label: '📆9格(天)' },
      { key: 'safeBoxSize', label: '📦安全箱' },
      { key: 'status', label: '🏷️状态' },
      { key: 'credit', label: '⭐信用' },
      { key: 'daysSince', label: '📅距上次出售(天)' },
      { key: 'realName', label: '👤实名认证' },
      { key: 'currentSaleAmount', label: '💰本次售价(元)' },
      { key: 'totalSaleAmount', label: '💎累计出售(元)' },
      { key: 'phone', label: '📞手机号' },
      { key: 'bindAccount', label: currentView === 'wechat' ? '🔒安全中心·QQ绑定' : '🔒安全中心·微信绑定' },
      { key: 'actions', label: '⚙️操作' }
    ];
  }

  function attachCellEvents() {
    document.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        if (cell.querySelector('.inline-editor')) return;
        const rowIdx = parseInt(cell.dataset.row);
        const field = cell.dataset.field;
        const type = cell.dataset.type || 'text';
        const value = cell.dataset.value || '';
        startInlineEdit(cell, rowIdx, field, value, type);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        await deleteAccount(idx);
      });
    });
  }

  function startInlineEdit(cell, rowIdx, field, currentVal, type) {
    let editor;
    if (type === 'select') {
      const optionsMap = {
        stamina: [1, 2, 3, 4, 5, 6, 7],
        endurance: [1, 2, 3, 4, 5, 6, 7],
        safeBoxSize: ['2格', '4格', '6格', '9格'],
        status: ['售出中', '未售', '待售处'],
        credit: ['OK', '差', '良好']
      };
      const options = optionsMap[field] || [];
      editor = document.createElement('select');
      editor.className = 'inline-editor';
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (field === 'safeBoxSize' ? `${currentVal}格` === opt : String(opt) === String(currentVal)) o.selected = true;
        editor.appendChild(o);
      });
    } else {
      editor = document.createElement('input');
      editor.type = ['hbCoin', 'grid9Days', 'currentSaleAmount'].includes(field) ? 'number' : 'text';
      editor.className = 'inline-editor';
      editor.value = currentVal;
    }
    cell.innerHTML = '';
    cell.appendChild(editor);
    editor.focus();

    const save = async () => {
      let newVal = editor.value;
      if (type === 'select' && field === 'safeBoxSize') newVal = parseInt(newVal);
      if (String(newVal) === String(currentVal)) { cancel(); return; }
      await updateAccountField(rowIdx, field, newVal);
    };

    const cancel = () => { renderTable(); };

    editor.addEventListener('blur', save);
    editor.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') cancel();
    });
  }

  async function updateAccountField(rowIdx, field, newVal) {
    const accounts = getCurrentAccounts();
    const acc = accounts[rowIdx];
    const oldStatus = acc.status;
    let needSync = false;

    switch (field) {
      case 'name': acc.name = newVal?.trim() || '无名'; break;
      case 'gameName': acc.gameName = newVal?.trim() || ''; break;
      case 'contact': acc.contact = newVal; break;
      case 'stamina': acc.stamina = Math.min(7, Math.max(1, parseInt(newVal) || 3)); break;
      case 'endurance': acc.endurance = Math.min(7, Math.max(1, parseInt(newVal) || 3)); break;
      case 'hbCoin': acc.hbCoin = parseFloat(newVal) || 0; needSync = true; break;
      case 'grid9Days': acc.grid9Days = parseInt(newVal) || 0; needSync = true; break;
      case 'safeBoxSize': acc.safeBoxSize = [2, 4, 6, 9].includes(Number(newVal)) ? Number(newVal) : 4; break;
      case 'status': acc.status = newVal; break;
      case 'credit': acc.credit = newVal; break;
      case 'realName': acc.realName = newVal?.trim() || ''; break;
      case 'bindAccount': acc.bindAccount = newVal?.trim() || '未绑定'; break;
      case 'phone': acc.phone = newVal?.trim() || ''; break;
      case 'currentSaleAmount': acc.currentSaleAmount = parseFloat(newVal) || 0; break;
    }

    if (field === 'status') {
      await handleStatusChange(acc, oldStatus, acc.status);
      needSync = true;
    }
    if (needSync) syncSafeBoxByCondition(acc, true);

    await saveAccountToDB(acc);
    renderTable();
  }

  async function saveAccountToDB(acc) {
    const row = {
      id: acc.id,
      user_id: acc.user_id || currentUser.id,
      name: acc.name,
      game_name: acc.gameName,
      contact: acc.contact,
      stamina: acc.stamina,
      endurance: acc.endurance,
      hb_coin: acc.hbCoin,
      grid9_days: acc.grid9Days,
      safe_box_size: acc.safeBoxSize,
      status: acc.status,
      credit: acc.credit,
      real_name: acc.realName,
      bind_account: acc.bindAccount,
      phone: acc.phone,
      current_sale_amount: acc.currentSaleAmount,
      total_sale_amount: acc.totalSaleAmount,
      last_status_change_time: acc.lastStatusChangeTime,
      platform: acc.platform || currentView
    };
    const { error } = await supabase.from('accounts').upsert(row, { onConflict: 'id' });
    if (error) showToast('保存失败: ' + error.message);
  }

  async function addNewAccount() {
    const name = prompt('输入昵称', '新账号');
    if (name === null) return;
    const acc = {
      name: name.trim() || '新账号',
      gameName: '',
      contact: '',
      stamina: 3,
      endurance: 3,
      hbCoin: 0,
      grid9Days: 0,
      safeBoxSize: 4,
      status: '未售',
      credit: 'OK',
      realName: '',
      bindAccount: '未绑定',
      phone: '',
      currentSaleAmount: 0,
      totalSaleAmount: 0,
      lastStatusChangeTime: Date.now(),
      platform: currentView,
      user_id: currentUser.id
    };

    const { data, error } = await supabase.from('accounts').insert({
      user_id: acc.user_id,
      name: acc.name,
      game_name: acc.gameName,
      contact: acc.contact,
      stamina: acc.stamina,
      endurance: acc.endurance,
      hb_coin: acc.hbCoin,
      grid9_days: acc.grid9Days,
      safe_box_size: acc.safeBoxSize,
      status: acc.status,
      credit: acc.credit,
      real_name: acc.realName,
      bind_account: acc.bindAccount,
      phone: acc.phone,
      current_sale_amount: acc.currentSaleAmount,
      total_sale_amount: acc.totalSaleAmount,
      last_status_change_time: acc.lastStatusChangeTime,
      platform: acc.platform
    }).select();

    if (error) return showToast('新增失败: ' + error.message);
    acc.id = data[0].id;
    getCurrentAccounts().push(acc);
    renderTable();
  }

  async function deleteAccount(idx) {
    const accounts = getCurrentAccounts();
    const acc = accounts[idx];
    if (!confirm(`确定删除「${acc.name}」？`)) return;
    const { error } = await supabase.from('accounts').delete().eq('id', acc.id);
    if (error) return showToast('删除失败: ' + error.message);
    accounts.splice(idx, 1);
    renderTable();
  }

  async function resetCurrentView() {
    if (!confirm(`⚠️ 清空当前【${currentView === 'wechat' ? '微信' : 'QQ'}】所有数据？`)) return;
    const accounts = getCurrentAccounts();
    const ids = accounts.map(a => a.id);
    if (ids.length) {
      const { error } = await supabase.from('accounts').delete().in('id', ids);
      if (error) return showToast('清空失败: ' + error.message);
    }
    if (currentView === 'wechat') wechatAccounts = [];
    else qqAccounts = [];
    renderTable();
  }

  function getCurrentAccounts() {
    return currentView === 'wechat' ? wechatAccounts : qqAccounts;
  }

  function switchView(view) {
    currentView = view;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));
    renderTable();
  }

  addNewBtn.addEventListener('click', addNewAccount);
  resetBtn.addEventListener('click', resetCurrentView);
  tabBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // ======================== 每日快照与图表 ========================
  async function ensureDailySnapshot() {
    if (!currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('daily_snapshots')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('platform', currentView)
      .gte('created_at', `${todayStr}T00:00:00Z`)
      .lte('created_at', `${todayStr}T23:59:59Z`)
      .limit(1);

    if (existing && existing.length > 0) return;

    const accounts = getCurrentAccounts();
    const totalHb = accounts.reduce((sum, acc) => sum + (acc.hbCoin || 0), 0);
    await supabase.from('daily_snapshots').insert({
      user_id: currentUser.id,
      platform: currentView,
      total_hb_coins: totalHb,
      created_at: new Date().toISOString()
    });
  }

  async function renderCharts() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 1. 今日销售额按小时
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    let salesQuery = supabase.from('sales').select('amount, sold_at').gte('sold_at', startOfDay);
    if (userRole !== 'admin') salesQuery = salesQuery.eq('user_id', currentUser.id);
    const { data: salesData } = await salesQuery;
    const hourlySales = new Array(24).fill(0);
    salesData?.forEach(r => {
      const h = new Date(r.sold_at).getHours();
      hourlySales[h] += parseFloat(r.amount);
    });
    chartInstances.sales = new Chart(document.getElementById('salesChart'), {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}时`),
        datasets: [{ label: '销售额 (元)', data: hourlySales, borderColor: '#2c7da0', tension: 0.3, fill: false }]
      },
      options: { responsive: true }
    });

    // 2. 今日哈弗币变化（首尾快照差值）
    const { data: todaySnapshots } = await supabase
      .from('daily_snapshots')
      .select('total_hb_coins, created_at')
      .eq('user_id', currentUser.id)
      .eq('platform', currentView)
      .gte('created_at', `${todayStr}T00:00:00Z`)
      .lte('created_at', `${todayStr}T23:59:59Z`)
      .order('created_at', { ascending: true });

    let todayChange = 0;
    if (todaySnapshots && todaySnapshots.length > 1) {
      const first = parseFloat(todaySnapshots[0].total_hb_coins);
      const last = parseFloat(todaySnapshots[todaySnapshots.length - 1].total_hb_coins);
      todayChange = last - first;
    } else if (todaySnapshots && todaySnapshots.length === 1) {
      todayChange = 0;
    }

    const changeTitle = document.querySelector('#hbChangeChart')?.parentElement?.querySelector('h3');
    if (changeTitle) {
      changeTitle.innerHTML = `⚡ 今日哈弗币变化: <span style="color:${todayChange >= 0 ? '#16a34a' : '#dc2626'}">${todayChange > 0 ? '+' : ''}${todayChange.toFixed(0)} 万</span>`;
    }

    chartInstances.hbChange = new Chart(document.getElementById('hbChangeChart'), {
      type: 'bar',
      data: {
        labels: ['今日变化'],
        datasets: [{ label: '变化量 (万)', data: [todayChange], backgroundColor: todayChange >= 0 ? '#16a34a' : '#dc2626' }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    // 3. 累计总哈弗币走势（每日最后快照）
    let snapshotsQuery = supabase
      .from('daily_snapshots')
      .select('total_hb_coins, created_at')
      .eq('user_id', currentUser.id)
      .eq('platform', currentView)
      .order('created_at', { ascending: true });

    const { data: allSnapshots } = await snapshotsQuery;
    const dailyMap = new Map();
    allSnapshots?.forEach(snap => {
      const dateKey = new Date(snap.created_at).toISOString().split('T')[0];
      dailyMap.set(dateKey, parseFloat(snap.total_hb_coins));
    });

    const dates = Array.from(dailyMap.keys()).sort();
    const totals = dates.map(d => dailyMap.get(d));

    chartInstances.totalHb = new Chart(document.getElementById('totalHbChart'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{ label: '总哈弗币 (万)', data: totals, borderColor: '#0f172a', tension: 0.2, fill: false, pointRadius: 3 }]
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: '日期' } },
          y: { title: { display: true, text: '总哈弗币 (万)' } }
        }
      }
    });
  }

  // ======================== 全局错误兜底 ========================
  window.addEventListener('error', e => { console.error('全局错误', e.error); showAuthModal(); });
  window.addEventListener('unhandledrejection', e => { console.error('未捕获异步', e.reason); showAuthModal(); });

  // ======================== 启动 ========================
  initAuth();
})();
