// 立即执行函数，避免全局变量冲突
(function () {
  // ======================== 配置 ========================
  const SUPABASE_URL = 'https://ungjwmttwczkrulodbpa.supabase.co';   // 👈 你的 Supabase URL
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZ2p3bXR0d2N6a3J1bG9kYnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTYyMTYsImV4cCI6MjA5MTAzMjIxNn0.8tgP7u7kjrSo8U10z7oDocX8jpiWvxCZAbyGSXQEkEM';

  // ======================== 全局变量 ========================
  let supabase = null;
  let currentUser = null;
  let userRole = 'user';
  let currentView = 'wechat';
  let wechatAccounts = [];
  let qqAccounts = [];

  const NINE_GRID_DAILY_COST_WAN = 2000;
  const HB_TO_RMB_RATE = 38;

  // ======================== DOM 元素 ========================
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

  // ======================== 工具函数 ========================
  function showToast(msg) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.innerText = msg;
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

  // ======================== 鉴权逻辑 ========================
  async function initAuth() {
    try {
      console.log('🚀 初始化 Supabase...');
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase 客户端创建成功');

      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔔 鉴权状态变化:', event, session?.user?.email);
        if (session?.user) {
          currentUser = session.user;
          await fetchUserRole();
          showApp();
          loadData();
          updateStats();
        } else {
          currentUser = null;
          userRole = 'user';
          showAuthModal();
        }
      });

      // 初始检查会话
      const { data: { session } } = await supabase.auth.getSession();
      console.log('📦 当前会话:', session?.user?.email);
      if (session) {
        currentUser = session.user;
        await fetchUserRole();
        console.log('👤 角色:', userRole);
        showApp();
        loadData();
        updateStats();
      } else {
        console.log('❌ 无会话，显示登录框');
        showAuthModal();
      }
    } catch (err) {
      console.error('❌ 初始化失败:', err);
      alert('系统初始化失败，请检查 Supabase 配置。');
    }
  }

  async function fetchUserRole() {
    if (!currentUser) return;
    const { data } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
    userRole = data?.role || 'user';
  }

  function showApp() {
    appDiv.style.display = 'block';
    authModal.style.display = 'none';
    userGreeting.innerText = `${currentUser.email} (${userRole === 'admin' ? '👑 管理员' : '👤 用户'})`;
  }

  function showAuthModal() {
    appDiv.style.display = 'none';
    authModal.style.display = 'flex';
    // 兜底样式（防止 CSS 加载失败时仍可见）
    authModal.style.position = 'fixed';
    authModal.style.top = '0';
    authModal.style.left = '0';
    authModal.style.width = '100%';
    authModal.style.height = '100%';
    authModal.style.background = 'rgba(0,0,0,0.6)';
    authModal.style.alignItems = 'center';
    authModal.style.justifyContent = 'center';
    authModal.style.zIndex = '3000';
  }

  // ======================== 登录/注册表单 ========================
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
        if (error) throw error;
        showToast('登录成功');
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user?.identities?.length === 0) {
          showToast('📨 注册成功！请检查邮箱并点击确认链接激活账户。');
        } else {
          showToast('✅ 注册成功！已自动登录。');
        }
      }
    } catch (err) {
      let msg = '操作失败: ' + err.message;
      if (err.message.includes('already registered')) msg = '该邮箱已被注册，请直接登录。';
      showToast(msg);
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
    const { error } = await supabase.from('sales').insert({
      account_id: acc.id,
      user_id: acc.user_id,
      account_name: acc.name,
      platform: acc.platform,
      amount: amount
    });
    if (error) console.error('记录销售失败', error);
    else updateStats();
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

  async function updateStats() {
    if (!currentUser) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let todayQ = supabase.from('sales').select('amount').gte('sold_at', startOfDay);
    let monthQ = supabase.from('sales').select('amount').gte('sold_at', startOfMonth);
    let allQ = supabase.from('sales').select('amount');

    if (userRole !== 'admin') {
      todayQ = todayQ.eq('user_id', currentUser.id);
      monthQ = monthQ.eq('user_id', currentUser.id);
      allQ = allQ.eq('user_id', currentUser.id);
    }

    const [todayRes, monthRes, allRes] = await Promise.all([todayQ, monthQ, allQ]);
    const sum = (data) => data.reduce((s, r) => s + parseFloat(r.amount), 0);

    document.getElementById('todayIncome').innerText = sum(todayRes.data).toFixed(2);
    document.getElementById('monthIncome').innerText = sum(monthRes.data).toFixed(2);
    document.getElementById('globalTotalAmount').innerText = sum(allRes.data).toFixed(2);

    // 哈弗币总估值
    let totalHb = 0;
    (userRole === 'admin' ? [...wechatAccounts, ...qqAccounts] : getCurrentAccounts())
      .forEach(a => totalHb += (a.hbCoin || 0));
    document.getElementById('globalHbEstimate').innerText = (totalHb / HB_TO_RMB_RATE).toFixed(2);
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

    const cancel = () => { renderTable(); }; // 恢复整个表格

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
      handleStatusChange(acc, oldStatus, acc.status);
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
      gameName: '', contact: '', stamina: 3, endurance: 3, hbCoin: 0, grid9Days: 0,
      safeBoxSize: 4, status: '未售', credit: 'OK', realName: '', bindAccount: '未绑定',
      phone: '', currentSaleAmount: 0, totalSaleAmount: 0, lastStatusChangeTime: Date.now(),
      platform: currentView, user_id: currentUser.id
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

  // ======================== 事件绑定 ========================
  addNewBtn.addEventListener('click', addNewAccount);
  resetBtn.addEventListener('click', resetCurrentView);
  tabBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // ======================== 启动 ========================
  initAuth();
})();