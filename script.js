async function loadHomeDashboard() {
    if (!supabaseClient || !currentUser) return;
    const tbody = document.getElementById('recent-activity-body');
    const empty = document.getElementById('recent-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    try {
        const { data, error } = await supabaseClient
            .from('historico')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) throw error;
        const movs = data || [];
        if (movs.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');
        movs.forEach(mov => {
            const item = (itemsList || []).find(i => String(i.id) === String(mov.item_id));
            const code = item ? (item.codigo || item.id) : mov.item_id;
            const name = item ? item.titulo : '-';
            const typeLabel = mov.tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
            const badgeClass = mov.tipo === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200';
            const date = new Date(mov.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-3 sm:px-6 py-3 whitespace-nowrap">${date}</td>
                <td class="hidden md:table-cell px-6 py-3 font-mono text-xs">${code}</td>
                <td class="px-3 sm:px-6 py-3">${escapeHtml(name)}</td>
                <td class="px-3 sm:px-6 py-3 whitespace-nowrap"><span class="px-2 py-0.5 border rounded text-[11px] font-medium ${badgeClass}">${typeLabel}</span></td>
                <td class="px-3 sm:px-6 py-3 text-right whitespace-nowrap">${Number(mov.quantidade || 0).toLocaleString('pt-BR')} ${item.unidade || ''}</td>
            `;
            tbody.appendChild(tr);
        });
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar atividades: ' + (e && e.message ? e.message : e), 'error');
    }
}

// ===== Menu lateral (hambúrguer no mobile) =====
function openSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const btn = document.getElementById('menu-toggle');
    if (!sb) return;
    sb.classList.add('sidebar-open');
    if (ov) ov.classList.add('sidebar-overlay-open');
    if (btn) { btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'Fechar menu'); }
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const btn = document.getElementById('menu-toggle');
    if (sb) sb.classList.remove('sidebar-open');
    if (ov) ov.classList.remove('sidebar-overlay-open');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Abrir menu'); }
    document.body.style.overflow = '';
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('sidebar-open')) closeSidebar();
    else openSidebar();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
});

// Ao aumentar a tela para desktop, garante que o estado do menu mobile seja limpo
window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
    if (e.matches) closeSidebar();
});

// ===== Edição de cadastro (lápis abre/fecha com animação) =====
function setEditSection(open) {
    const sec = document.getElementById('edit-section');
    const btn = document.getElementById('edit-toggle');
    if (!sec) return;
    sec.classList.toggle('edit-open', !!open);
    sec.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.title = open ? 'Fechar edição' : 'Editar cadastro';
    }
    if (open) {
        setTimeout(() => {
            const input = document.getElementById('edit-item-title');
            if (input) input.focus({ preventScroll: true });
        }, 250);
    }
}

function toggleEditSection() {
    const sec = document.getElementById('edit-section');
    setEditSection(!(sec && sec.classList.contains('edit-open')));
}

// ===== Máscaras automáticas dos campos (quantidade e valor em R$) =====
// Moeda: digita só números e o campo vira "R$ 1.234,56" (os dois últimos dígitos são os centavos).
function maskCurrency(raw) {
    let digits = String(raw || '').replace(/\D/g, '').slice(0, 12);
    digits = digits.replace(/^0+/, '');
    if (!digits) return '';
    const cents = parseInt(digits, 10);
    return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Quantidade: vírgula separa os decimais (até 3 casas) e o ponto separa os milhares: "1.500,75"
function maskQuantity(raw, inputType) {
    let v = String(raw || '').replace(/[^\d,.]/g, '');
    const isPaste = inputType === 'insertFromPaste' || inputType === 'insertFromDrop';
    if (!v.includes(',')) {
        if (isPaste) {
            // colou "10.5" ou "1234.567"? um único ponto que não separa grupos de 3 dígitos é decimal
            const parts = v.split('.');
            if (parts.length === 2 && parts[1].length !== 3) v = parts[0] + ',' + parts[1];
        } else if (v.endsWith('.')) {
            // teclado numérico que só tem ponto: o ponto digitado no fim vira vírgula
            v = v.slice(0, -1) + ',';
        }
    }
    v = v.replace(/\./g, '');
    const commaIdx = v.indexOf(',');
    const hasComma = commaIdx !== -1;
    let intPart = (hasComma ? v.slice(0, commaIdx) : v).replace(/\D/g, '').slice(0, 9).replace(/^0+(?=\d)/, '');
    const decPart = hasComma ? v.slice(commaIdx + 1).replace(/\D/g, '').slice(0, 3) : '';
    if (!intPart && !hasComma) return '';
    if (!intPart) intPart = '0';
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (hasComma ? ',' + decPart : '');
}

// Converte o texto formatado de volta para número
function parseCurrencyInput(str) {
    const digits = String(str || '').replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
}

function parseQuantityInput(str) {
    const n = parseFloat(String(str || '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

function applyInputMask(el, inputType) {
    const old = el.value;
    const caret = el.selectionStart == null ? old.length : el.selectionStart;
    const formatted = el.dataset.mask === 'currency' ? maskCurrency(old) : maskQuantity(old, inputType);
    if (formatted === old) return;
    const significantBefore = old.slice(0, caret).replace(/[^\d,]/g, '').length;
    const atEnd = caret >= old.length;
    el.value = formatted;
    let pos = formatted.length;
    if (el.dataset.mask !== 'currency' && !atEnd) {
        // mantém o cursor no mesmo ponto ao editar no meio do número
        let count = 0;
        pos = 0;
        while (pos < formatted.length && count < significantBefore) {
            if (/[\d,]/.test(formatted[pos])) count++;
            pos++;
        }
    }
    try { el.setSelectionRange(pos, pos); } catch (e) {}
}

document.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.mask) applyInputMask(el, e.inputType);
});

// ===== Seletor Entrada / Saída =====
function setMovType(type) {
    const t = type === 'OUT' ? 'OUT' : 'IN';
    const hidden = document.getElementById('mov-type');
    if (hidden) hidden.value = t;
    const seg = document.getElementById('mov-seg');
    if (seg) seg.setAttribute('data-type', t);
    const card = document.getElementById('mov-card');
    if (card) card.setAttribute('data-type', t);
    document.querySelectorAll('.mov-seg-btn').forEach(b => {
        b.setAttribute('aria-checked', String(b.getAttribute('data-type') === t));
    });
    const label = document.getElementById('mov-submit-label');
    if (label) label.textContent = t === 'IN' ? 'Registrar Entrada' : 'Registrar Saída';
    toggleMovCostField();
    updateMovPreview();
}

// Mostra uma prévia do resultado antes de registrar (bom para conferir no celular)
function updateMovPreview() {
    const box = document.getElementById('mov-preview');
    if (!box) return;
    const item = itemsList.find(i => String(i.id) === String(currentItemId));
    const type = (document.getElementById('mov-type') || {}).value || 'IN';
    const qty = parseQuantityInput((document.getElementById('mov-qty') || {}).value);
    if (!item || qty <= 0) {
        box.classList.add('hidden');
        return;
    }
    const un = item.unidade || '';
    const saldo = Number(item.quantidade) || 0;
    const fmt = (n) => Number(n).toLocaleString('pt-BR') + ' ' + un;
    const base = 'text-xs font-medium rounded-lg px-3 py-2 border ';
    let text, cls;
    if (type === 'IN') {
        const total = parseCurrencyInput((document.getElementById('mov-total-price') || {}).value);
        text = (total > 0 ? 'Custo desta entrada: ' + formatUnitCost(total / qty) + ' / ' + un.toLowerCase() + ' · ' : '') +
               'Novo saldo: ' + fmt(saldo + qty);
        cls = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    } else if (qty > saldo) {
        text = 'Estoque insuficiente: saldo atual é ' + fmt(saldo);
        cls = 'bg-rose-100 text-rose-800 border-rose-300';
    } else {
        text = 'Valor da saída: ' + formatCurrency((Number(item.custo_medio) || 0) * qty) + ' · Saldo restante: ' + fmt(saldo - qty);
        cls = 'bg-rose-50 text-rose-800 border-rose-200';
    }
    box.className = base + cls;
    box.textContent = text;
}

document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'mov-qty' || e.target.id === 'mov-total-price')) updateMovPreview();
});

function showSection(section) {
    closeSidebar();
    const home = document.getElementById('sec-home');
    const estoque = document.getElementById('sec-estoque');
    const relatorio = document.getElementById('sec-relatorio');

    [home, estoque, relatorio].forEach(sec => {
        if (sec) {
            sec.classList.remove('active');
            sec.style.display = 'none';
        }
    });

    const show = section === 'home' ? home : section === 'relatorio' ? relatorio : estoque;
    if (show) {
        show.style.display = 'block';
        void show.offsetWidth;
        requestAnimationFrame(() => {
            show.classList.add('active');
        });
    }

    if (section === 'home') {
        loadHomeDashboard();
    } else if (section === 'relatorio') {
        loadRelatorio();
    } else {
        renderItems();
    }
}


// Configuration Supabase pré-configurada
const SUPABASE_URL = "https://qcziixqumhcmlrmqnpec.supabase.co";
const SUPABASE_KEY = "sb_publishable_WLQdhQL9Em2-DMTmSoBOyg_-W6YHEkH";

let supabaseClient = null;
let currentUser = null;
let itemsList = [];
let relatorioData = [];
let relatorioSortCol = null;
let relatorioSortDir = 'desc'; // 'desc' ou 'asc'
let currentItemId = null;

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    // force reflow
    void modal.offsetWidth;
    requestAnimationFrame(() => {
        modal.classList.add('modal-open');
    });
    if (window.lucide) lucide.createIcons();
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('modal-open');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function toggleMovCostField() {
    const type = document.getElementById('mov-type').value === 'IN' ? 'ENTRADA' : 'SAIDA';
    const container = document.getElementById('mov-cost-container');
    const input = document.getElementById('mov-total-price');
    if (type === 'ENTRADA') {
        if (container) container.classList.remove('hidden');
        if (input) {
            input.disabled = false;
            input.readOnly = false;
        }
    } else {
        if (container) container.classList.add('hidden');
        if (input) {
            input.value = '';
            input.disabled = true;
            input.readOnly = true;
        }
    }
}

try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Erro ao inicializar Supabase:", e);
}

(function initSession() {
    let stored = null;
    try { stored = localStorage.getItem('stock_user_session'); } catch (e) { stored = null; }
    if (stored) {
        try {
            currentUser = JSON.parse(stored);
            renderDashboard();
        } catch (e) {
            try { localStorage.removeItem('stock_user_session'); } catch (_) {}
        }
    }
})();

function switchAuthTab(tab) {
    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');
    const submitBtn = document.getElementById('auth-submit-btn');
    if (tab === 'login') {
        loginTab.className = "flex-1 pb-3 text-sm font-semibold border-b-2 border-brand-600 text-brand-600 transition-all";
        registerTab.className = "flex-1 pb-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all";
        if (submitBtn) submitBtn.querySelector('span').textContent = 'Acessar Painel';
    } else {
        loginTab.className = "flex-1 pb-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all";
        registerTab.className = "flex-1 pb-3 text-sm font-semibold border-b-2 border-brand-600 text-brand-600 transition-all";
        if (submitBtn) submitBtn.querySelector('span').textContent = 'Criar Conta';
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    // Limpar sessão/dados antigos do navegador
    try { localStorage.clear(); } catch (e) { console.error(e); }
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const isRegister = document.getElementById('tab-register').className.includes('border-brand-600');

    if (!username || !password) {
        showToast('Preencha usuário e senha.', 'error');
        return;
    }

    if (!supabaseClient) {
        showToast('Supabase não disponível.', 'error');
        return;
    }

    try {
        if (isRegister) {
            const { data: existing } = await supabaseClient.from('usuarios').select('id').eq('username', username).maybeSingle();
            if (existing) {
                showToast('Usuário já existe.', 'error');
                return;
            }
            const newId = generateId();
            const { data, error } = await supabaseClient.from('usuarios').insert([{ id: newId, username, senha: password, display_name: null }]).select().single();
            if (error) throw error;
            currentUser = { id: data.id, username: data.username, display_name: data.display_name };
        } else {
            const { data, error } = await supabaseClient.from('usuarios').select('*').eq('username', username).eq('senha', password).maybeSingle();
            if (error || !data) {
                showToast('Credenciais inválidas.', 'error');
                return;
            }
            currentUser = { id: data.id, username: data.username, display_name: data.display_name };
        }
    } catch (err) {
        console.error(err);
        showToast('Erro de autenticação: ' + (err && err.message ? err.message : err), 'error');
        return;
    }

    try { localStorage.setItem('stock_user_session', JSON.stringify(currentUser)); } catch (e) { console.error(e); }
    showToast('Bem-vindo, ' + currentUser.username + '!', 'success');
    const authUser = document.getElementById('auth-username');
    const authPass = document.getElementById('auth-password');
    if (authUser) authUser.value = '';
    if (authPass) authPass.value = '';
    try {
        await renderDashboard();
    } catch (e) {
        console.error(e);
        showToast('Erro ao abrir painel: ' + (e && e.message ? e.message : e), 'error');
    }
}

function logout() {
    closeSidebar();
    currentUser = null;
    try { localStorage.removeItem('stock_user_session'); } catch (e) { console.error(e); }
    document.getElementById('main-dashboard').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    const authUser2 = document.getElementById('auth-username');
    const authPass2 = document.getElementById('auth-password');
    if (authUser2) authUser2.value = '';
    if (authPass2) authPass2.value = '';
    showToast('Sessão encerrada.', 'info');
}
function getDisplayName() {
    if (!currentUser) return '';
    return currentUser.display_name || '';
}

function updateDisplayNameUI() {
    const el = document.getElementById('user-display-name');
    if (!el || !currentUser) return;
    const name = getDisplayName();
    el.textContent = name || currentUser.email || currentUser.id;
}

async function checkDisplayName() {
    if (!currentUser) return;
    if (supabaseClient) {
        try {
            const { data } = await supabaseClient.from('usuarios').select('display_name').eq('id', currentUser.id).maybeSingle();
            if (data && data.display_name) {
                currentUser.display_name = data.display_name;
                try { localStorage.setItem('stock_user_session', JSON.stringify(currentUser)); } catch (e) {}
            }
        } catch (e) { console.error(e); }
    }
    const name = currentUser.display_name;
    if (!name) {
        const modal = document.getElementById('modal-display-name');
        const input = document.getElementById('display-name-input');
        if (input) input.value = '';
        if (modal) openModal('modal-display-name');
        if (window.lucide) lucide.createIcons();
    } else {
        updateDisplayNameUI();
    }
}

async function handleDisplayNameSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('display-name-input');
    const name = input ? input.value.trim() : '';
    if (!name) {
        showToast('Informe um nome.', 'error');
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast('Supabase não disponível.', 'error');
        return;
    }
    try {
        const { error } = await supabaseClient.from('usuarios').update({ display_name: name }).eq('id', currentUser.id);
        if (error) throw error;
        currentUser.display_name = name;
        try { localStorage.setItem('stock_user_session', JSON.stringify(currentUser)); } catch (e) {}
        updateDisplayNameUI();
        const modal = document.getElementById('modal-display-name');
        if (modal) closeModal('modal-display-name');
        if (input) input.value = '';
        showToast('Nome de perfil salvo.', 'success');
    } catch (e) {
        console.error(e);
        showToast('Erro ao salvar nome: ' + (e && e.message ? e.message : e), 'error');
    }
}


async function renderDashboard() {
    if (!currentUser) return;
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-dashboard').classList.remove('hidden');
    document.getElementById('user-display-name').textContent = currentUser.display_name || currentUser.username || currentUser.id;
    updateDisplayNameUI();
    try {
        await loadItems();
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar itens: ' + (e && e.message ? e.message : e), 'error');
    }
    await loadHomeDashboard();
    showSection('home');
    await checkDisplayName();
}

async function loadItems() {
    if (!supabaseClient || !currentUser) {
        showToast('Supabase não disponível.', 'error');
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('itens')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        
        // Garante que os campos numéricos vêm tratados e nunca vazios/undefined
        itemsList = (data || []).map(i => ({
            ...i,
            quantidade: Number(i.quantidade) || 0,
            custo_medio: Number(i.custo_medio) || 0,
            status: i.status || (Number(i.quantidade) > 0 ? 'COM MOVIMENTAÇÕES' : 'SEM MOVIMENTAÇÕES')
        }));
    } catch (err) {
        console.error('Erro ao carregar itens:', err);
        showToast('Erro ao carregar itens: ' + (err && err.message ? err.message : err), 'error');
        itemsList = [];
    }
    renderItems();
    updateStats();
    populateItemsDatalist();
}

function normalizeItem(i) {
    const quantidade = Number(i.quantidade) || 0;
    return {
        ...i,
        quantidade,
        custo_medio: Number(i.custo_medio) || 0,
        status: i.status || (quantidade > 0 ? 'COM MOVIMENTAÇÕES' : 'SEM MOVIMENTAÇÕES')
    };
}

function setStatValue(id, text, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.setProperty('display', 'block', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('opacity', '1', 'important');
    if (color) el.style.setProperty('color', color, 'important');
}

// Atualiza os 3 cards (Saldo, Custo Médio e Status) do modal do item
function updateModalStatsUI(item) {
    if (!item) return;
    const qtd = Number(item.quantidade) || 0;
    const custo = Number(item.custo_medio) || 0;
    const unidade = item.unidade || '';
    const status = item.status || (qtd > 0 ? 'COM MOVIMENTAÇÕES' : 'SEM MOVIMENTAÇÕES');
    const semMov = status === 'SEM MOVIMENTAÇÕES' || qtd === 0;

    setStatValue('modal-stock-balance', qtd.toLocaleString('pt-BR') + ' ' + unidade, '#1e293b');
    setStatValue('modal-avg-cost', formatUnitCost(custo) + (unidade ? ' / ' + unidade.toLowerCase() : ''), '#0369a1');
    setStatValue('modal-status-badge', semMov ? 'SEM MOVIMENTAÇÕES' : 'ATIVO NO ESTOQUE', semMov ? '#b45309' : '#047857');
}

function saveItemsLocalFallback() {
    try {
        if (currentUser) {
            localStorage.setItem('items_' + currentUser.id, JSON.stringify(itemsList));
        }
    } catch (e) { console.error(e); }
}

function renderItems() {
    const tbody = document.getElementById('items-table-body');
    const emptyState = document.getElementById('empty-state');
    const search = (document.getElementById('search-input').value || '').toLowerCase();
    const filterUnit = document.getElementById('unit-filter').value;

    const filtered = itemsList.filter(item => {
        const matchesSearch = (item.titulo || '').toLowerCase().includes(search);
        const matchesUnit = filterUnit === 'ALL' || item.unidade === filterUnit;
        return matchesSearch && matchesUnit;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');


        tr.className = 'hover:bg-slate-50/80 transition-colors cursor-pointer border-b border-slate-100';
        tr.onclick = () => openItemDetailsModal(item.id);

        const avgCostFormatted = formatUnitCost(item.custo_medio || 0);
        const unitLabel = item.unidade;

        let statusBadge = '';
        if (item.status === 'SEM MOVIMENTAÇÕES' || item.quantidade == 0) {
            statusBadge = '<span class="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-medium whitespace-nowrap">Sem Movimentações</span>';
        } else {
            statusBadge = '<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-medium whitespace-nowrap">Ativo no Estoque</span>';
        }

        tr.innerHTML = `
            <td class="px-3 sm:px-6 py-4 font-semibold text-slate-900 min-w-[140px]">${escapeHtml(item.titulo)}</td>
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono font-medium">${item.unidade}</span>
            </td>
            <td class="px-3 sm:px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">${Number(item.quantidade || 0).toLocaleString('pt-BR')} ${item.unidade}</td>
            <td class="hidden md:table-cell px-6 py-4 font-bold text-brand-600 whitespace-nowrap">
                ${avgCostFormatted} <span class="text-[10px] text-slate-400 font-normal">/ ${unitLabel.toLowerCase()}</span>
            </td>
            <td class="hidden md:table-cell px-6 py-4 whitespace-nowrap">${statusBadge}</td>
            <td class="px-3 sm:px-6 py-4 text-right">
                <button onclick="event.stopPropagation(); openItemDetailsModal('${item.id}')" class="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

function openNewItemModal() {
    document.getElementById('new-title').value = '';
    document.getElementById('new-unit').value = 'GR';
    document.getElementById('new-has-movement').checked = false;
    document.getElementById('movement-fields').classList.add('hidden');
    document.getElementById('new-quantity').value = '';
    document.getElementById('new-total-cost').value = '';
    const preview = document.getElementById('new-calculated-preview');
    if (preview) preview.classList.add('hidden');
    openModal('modal-new-item');
    if (window.lucide) lucide.createIcons();
}

function toggleMovementFields() {
    const checked = document.getElementById('new-has-movement').checked;
    const container = document.getElementById('movement-fields');
    if (checked) container.classList.remove('hidden');
    else container.classList.add('hidden');
}

function calculateNewItemUnitPreview() {
    const qty = parseQuantityInput(document.getElementById('new-quantity').value);
    const cost = parseCurrencyInput(document.getElementById('new-total-cost').value);


    const preview = document.getElementById('new-calculated-preview');
    if (!preview) return;
    if (qty > 0 && cost > 0) {
        const unitCost = cost / qty;
        preview.textContent = 'Custo unitário: ' + formatUnitCost(unitCost);
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'new-quantity' || e.target.id === 'new-total-cost')) {
        calculateNewItemUnitPreview();
    }
});

function generateId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateItemCode() {
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    return 'MP' + randomNum;
}

async function handleCreateItemSubmit(event) {
    event.preventDefault();
    const rawTitle = document.getElementById('new-title').value.trim();
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    const unit = document.getElementById('new-unit').value;
    const hasMovement = document.getElementById('new-has-movement').checked;

    if (!title) {
        showToast('Informe o nome do item.', 'error');
        return;
    }

    const codigo =  generateItemCode();

    let current_stock = 0;
    let avg_unit_cost = 0;
    let status = 'SEM MOVIMENTAÇÕES';

    if (hasMovement) {
        const qty = parseQuantityInput(document.getElementById('new-quantity').value);
        const cost = parseCurrencyInput(document.getElementById('new-total-cost').value);
        if (qty <= 0) {
            showToast('Quantidade inválida.', 'error');
            return;
        }
        current_stock = qty;
        avg_unit_cost = cost / qty;
        status = 'COM MOVIMENTAÇÕES';
    }

    const newItem = {
        id: generateId(),
        codigo,
        user_id: currentUser.id,
        titulo: title,
        unidade: unit,
        quantidade: current_stock,
        custo_medio: avg_unit_cost,
        status,
        created_at: new Date().toISOString()
    };

    if (supabaseClient && !currentUser.id.startsWith('offline-')) {
        try {
            const { data, error } = await supabaseClient.from('itens').insert([{
                id: newItem.id,
                codigo: newItem.codigo,
                user_id: currentUser.id,
                titulo: title,
                unidade: unit,
                quantidade: Number(current_stock) || 0,
                custo_medio: Number(avg_unit_cost) || 0,
                status
            }]).select().single();
            if (error) throw error;
            itemsList.unshift(normalizeItem(data));
            populateItemsDatalist();

            // Se o item foi criado com uma entrada inicial, regista também no histórico
            if (hasMovement && current_stock > 0) {
                const totalCostVal = parseCurrencyInput(document.getElementById('new-total-cost').value);
                await supabaseClient.from('historico').insert([{
                    item_id: newItem.id,
                    user_id: currentUser.id,
                    tipo: 'ENTRADA',
                    quantidade: Number(current_stock),
                    valor_total: totalCostVal,
                    custo_unitario: Number(avg_unit_cost)
                }]);
            }
        } catch (err) {
            console.error(err);
            itemsList.unshift(newItem);
            populateItemsDatalist();
        }
    }


    saveItemsLocalFallback();
    closeModal('modal-new-item');
    renderItems();
    updateStats();
    populateItemsDatalist();
    showToast('Item cadastrado com sucesso.', 'success');
}

function openItemDetailsModal(id) {

    const item = itemsList.find(i => String(i.id) === String(id));
    if (!item) return;
    currentItemId = item.id;

    document.getElementById('modal-item-title-display').textContent = item.titulo || item.title || '-';
    document.getElementById('modal-item-unit-badge').textContent = item.unidade || item.unit || '-';
    const idEl = document.getElementById('modal-item-id');
    if (idEl) idEl.textContent = item.codigo || item.id || 'ID';
    
    document.getElementById('edit-item-title').value = item.titulo || item.title || '';
    document.getElementById('edit-item-unit').value = item.unidade || item.unit || '';
    
    // Cards do topo (Saldo, Custo Médio, Status)
    updateModalStatsUI(item);

    document.getElementById('mov-qty').value = '';
    const priceEl = document.getElementById('mov-total-price');
    if (priceEl) priceEl.value = '';
    const dateEl = document.getElementById('mov-date');
    if (dateEl) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        dateEl.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    setMovType('IN');

    setEditSection(false);
    loadItemHistory(item.id);

    openModal('modal-item-details');
    if (window.lucide) lucide.createIcons();
}
async function loadItemHistory(itemId) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';
    let movements = [];
    if (!supabaseClient || !currentUser) {
        showToast('Supabase não disponível.', 'error');
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('historico')
            .select('*')
            .eq('item_id', itemId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        movements = data || [];
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar histórico: ' + (e && e.message ? e.message : e), 'error');
    }

    movements.forEach(mov => {
        const tr = document.createElement('tr');
        const date = new Date(mov.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const typeLabel = mov.tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
        const typeClass = mov.tipo === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600';
        tr.innerHTML = `
            <td class="p-2.5">${date}</td>
            <td class="p-2.5 font-semibold ${typeClass}">${typeLabel}</td>
            <td class="p-2.5">${Number(mov.quantidade || 0).toLocaleString('pt-BR')}</td>
            <td class="p-2.5">${formatCurrency(mov.valor_total || 0)}</td>
            <td class="p-2.5">${formatUnitCost(mov.custo_unitario || 0)}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveItemEdits() {
    if (!currentItemId) return;
    const rawTitle = document.getElementById('edit-item-title').value.trim();
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    const unit = document.getElementById('edit-item-unit').value;
    if (!title) {
        showToast('Título inválido.', 'error');
        return;

    }
    const item = itemsList.find(i => String(i.id) === String(currentItemId));
    if (!item) return;
    item.titulo = title;
    item.unidade = unit;

    if (supabaseClient && !currentUser.id.startsWith('offline-') && !String(item.id).startsWith('local-')) {
        try {
            await supabaseClient.from('itens').update({ titulo: title, unidade: unit }).eq('id', item.id);
        } catch (e) { console.error(e); }
    } else {
        saveItemsLocalFallback();
    }

    document.getElementById('modal-item-title-display').textContent = title;
    document.getElementById('modal-item-unit-badge').textContent = unit;
    updateModalStatsUI(item);
    renderItems();
    populateItemsDatalist();
    showToast('InformaÃ§Ãµes atualizadas.', 'success');
    setEditSection(false);
}

async function registerMovement() {
    if (!currentItemId) return;
    const item = itemsList.find(i => String(i.id) === String(currentItemId));
    if (!item) return;

    const type = document.getElementById('mov-type').value === 'IN' ? 'ENTRADA' : 'SAIDA';
    const qty = parseQuantityInput(document.getElementById('mov-qty').value);
    let totalCost = 0;
    if (type === 'ENTRADA') {
        totalCost = parseCurrencyInput(document.getElementById('mov-total-price').value);
        if (totalCost < 0) {
            showToast('Valor total inválido.', 'error');
            return;
        }
    } else {
        totalCost = (item.custo_medio || 0) * qty;
    }

    if (qty <= 0) {
        showToast('Quantidade inválida.', 'error');
        return;
    }

    if (type === 'SAIDA' && qty > (item.quantidade || 0)) {
        showToast('Estoque insuficiente.', 'error');
        return;
    }

    const movementDateInput = document.getElementById('mov-date');
    let movementDate = new Date();
    if (movementDateInput && movementDateInput.value) {
        const parsed = new Date(movementDateInput.value);
        if (!isNaN(parsed.getTime())) movementDate = parsed;
    }
    const movementDateIso = movementDate.toISOString();

    const unitCost = type === 'ENTRADA' ? (qty > 0 ? totalCost / qty : 0) : (item.custo_medio || 0);
    const movement = {
        id: 'mov-' + Date.now(),
        item_id: item.id,
        user_id: currentUser.id,
        tipo: type,
        quantidade: qty,
        valor_total: type === 'ENTRADA' ? totalCost : unitCost * qty,
        custo_unitario: unitCost,
        created_at: movementDateIso
    };

    if (type === 'ENTRADA') {
        const oldStock = item.quantidade || 0;
        const oldCost = item.custo_medio || 0;
        const newStock = oldStock + qty;
        const newAvg = newStock > 0 ? ((oldStock * oldCost) + (qty * unitCost)) / newStock : unitCost;
        item.quantidade = newStock;
        item.custo_medio = newAvg;
        item.status = 'COM MOVIMENTAÇÕES';
    } else {
        item.quantidade = (item.quantidade || 0) - qty;
        if (item.quantidade <= 0) {
            item.quantidade = 0;
            item.status = 'SEM MOVIMENTAÇÕES';
        }
    }

    if (supabaseClient && !currentUser.id.startsWith('offline-') && !String(item.id).startsWith('local-')) {
        try {
            await supabaseClient.from('historico').insert([{
                item_id: item.id,
                user_id: currentUser.id,
                tipo: type,
                quantidade: Number(qty) || 0,
                valor_total: Number(movement.valor_total) || 0,
                custo_unitario: Number(unitCost) || 0,
                created_at: movementDateIso
            }]);
            await supabaseClient.from('itens').update({
                quantidade: Number(item.quantidade) || 0,
                custo_medio: Number(item.custo_medio) || 0,
                status: item.status
            }).eq('id', item.id);
        } catch (e) { console.error(e); }
    } else {
        const stored = localStorage.getItem('movements_' + item.id);
        const list = stored ? JSON.parse(stored) : [];
        list.unshift(movement);
        localStorage.setItem('movements_' + item.id, JSON.stringify(list));
        saveItemsLocalFallback();
    }

    updateModalStatsUI(item);

    document.getElementById('mov-qty').value = '';
    document.getElementById('mov-total-price').value = '';
    const dateReset = document.getElementById('mov-date');
    if (dateReset) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        dateReset.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    updateMovPreview();

    loadItemHistory(item.id);
    renderItems();
    updateStats();
    populateItemsDatalist();
    await loadHomeDashboard();
    showToast('Movimentação registrada.', 'success');
}

async function deleteCurrentItem() {
    if (!currentItemId) return;
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    const item = itemsList.find(i => String(i.id) === String(currentItemId));
    itemsList = itemsList.filter(i => String(i.id) !== String(currentItemId));
    populateItemsDatalist();

    if (supabaseClient && !currentUser.id.startsWith('offline-') && item && !String(item.id).startsWith('local-')) {
        try {
            await supabaseClient.from('itens').delete().eq('id', item.id);
        } catch (e) { console.error(e); }
    } else {
        saveItemsLocalFallback();
    }

    closeModal('modal-item-details');
    currentItemId = null;
    renderItems();
    updateStats();
    populateItemsDatalist();
    showToast('Item excluído.', 'info');
}

function openSqlModal() {
    openModal('modal-sql');
    if (window.lucide) lucide.createIcons();
}

function copySql(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('SQL copiado para a área de transferência.', 'success');
    }).catch(() => {
        showToast('Não foi possível copiar.', 'error');
    });
}

async function downloadProjectZip() {
    if (!window.JSZip) {
        showToast('JSZip não carregado.', 'error');
        return;
    }
    const zip = new JSZip();
    zip.file('index.html', document.documentElement.outerHTML);
    zip.file('README.md', '# StockUnit Enterprise');
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'projeto_estoque.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download do ZIP iniciado!', 'success');
}

function updateStats() {
    const totalItemsEl = document.getElementById('stat-total-items');
    const activeItemsEl = document.getElementById('stat-active-items');
    const emptyItemsEl = document.getElementById('stat-empty-items');
    const totalValueEl = document.getElementById('stat-total-value');

    if (totalItemsEl) totalItemsEl.textContent = itemsList.length;
    const active = itemsList.filter(i => i.quantidade > 0).length;
    if (activeItemsEl) activeItemsEl.textContent = active;
    const empty = itemsList.filter(i => i.status === 'SEM MOVIMENTAÇÕES' || i.quantidade == 0).length;
    if (emptyItemsEl) emptyItemsEl.textContent = empty;
    const totalVal = itemsList.reduce((acc, curr) => acc + ((curr.quantidade || 0) * (curr.custo_medio || 0)), 0);
    if (totalValueEl) totalValueEl.textContent = formatCurrency(totalVal);
}


function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');

    let bgClass = 'bg-slate-900 text-white border-slate-700';
    if (type === 'success') bgClass = 'bg-emerald-700 text-white border-emerald-600';
    if (type === 'error') bgClass = 'bg-rose-700 text-white border-rose-600';

    toast.className = `p-3.5 rounded-xl border shadow-xl text-xs font-medium flex items-center justify-between pointer-events-auto transition-all transform translate-y-2 opacity-0 ${bgClass}`;
    toast.innerHTML = `
        <span>${escapeHtml(msg)}</span>
        <button onclick="this.parentElement.remove()" class="ml-3 text-white/70 hover:text-white">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function sortRelatorio(col) {
    if (relatorioSortCol === col) {
        relatorioSortDir = relatorioSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        relatorioSortCol = col;
        relatorioSortDir = 'desc'; // primeiro clique: decrescente
    }
    applyRelatorioSort();
    renderRelatorioTable(relatorioData);
    updateSortIndicators();
}

function applyRelatorioSort() {
    if (!relatorioSortCol || !relatorioData) return;
    const dir = relatorioSortDir === 'desc' ? -1 : 1;
    relatorioData.sort((a, b) => {
        let va, vb;
        const itemA = a.itens || (itemsList || []).find(i => String(i.id) === String(a.item_id)) || {};
        const itemB = b.itens || (itemsList || []).find(i => String(i.id) === String(b.item_id)) || {};
        switch (relatorioSortCol) {
            case 'created_at':
                va = new Date(a.created_at).getTime();
                vb = new Date(b.created_at).getTime();
                break;
            case 'codigo':
                va = (itemA.codigo || itemA.id || a.item_id || '').toString().toLowerCase();
                vb = (itemB.codigo || itemB.id || b.item_id || '').toString().toLowerCase();
                break;
            case 'titulo':
                va = (itemA.titulo || itemA.nome || '').toLowerCase();
                vb = (itemB.titulo || itemB.nome || '').toLowerCase();
                break;
            case 'quantidade':
                va = Number(a.quantidade || 0);
                vb = Number(b.quantidade || 0);
                break;
            case 'valor_total':
                va = Number(a.valor_total || 0);
                vb = Number(b.valor_total || 0);
                break;
            case 'custo_unitario':
                va = Number(a.custo_unitario || 0);
                vb = Number(b.custo_unitario || 0);
                break;
            default:
                va = 0; vb = 0;
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });
}

function renderRelatorioTable(movs) {
    const tbody = document.getElementById('relatorio-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (movs || []).forEach(mov => {
        const item = mov.itens || (itemsList || []).find(i => String(i.id) === String(mov.item_id)) || {};
        const code = item.codigo || item.id || mov.item_id;
        const name = item.titulo || item.nome || '-';
        const isEntrada = mov.tipo === 'ENTRADA' || mov.tipo === 'CADASTRO';
        const typeLabel = isEntrada ? 'Entrada' : 'Saída';
        const badgeClass = isEntrada ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200';
        const date = new Date(mov.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-3 sm:px-6 py-3 whitespace-nowrap">${date}</td>
            <td class="hidden md:table-cell px-6 py-3 font-mono text-xs">${escapeHtml(code)}</td>
            <td class="px-3 sm:px-6 py-3">${escapeHtml(name)}</td>
            <td class="px-3 sm:px-6 py-3 whitespace-nowrap"><span class="px-2 py-0.5 border rounded text-[11px] font-medium ${badgeClass}">${typeLabel}</span></td>
            <td class="px-3 sm:px-6 py-3 text-right whitespace-nowrap">${Number(mov.quantidade || 0).toLocaleString('pt-BR')} ${item.unidade || ''}</td>
            <td class="px-3 sm:px-6 py-3 text-right whitespace-nowrap">${formatCurrency(mov.valor_total || 0)}</td>
            <td class="px-3 sm:px-6 py-3 text-right whitespace-nowrap">${formatUnitCost(mov.custo_unitario || 0)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSortIndicators() {
    const cols = ['created_at', 'codigo', 'titulo', 'quantidade', 'valor_total', 'custo_unitario'];
    cols.forEach(c => {
        const el = document.getElementById('sort-ind-' + c);
        if (el) {
            if (relatorioSortCol === c) {
                el.textContent = relatorioSortDir === 'desc' ? '↓' : '↑';
            } else {
                el.textContent = '';
            }
        }
    });
}


async function loadRelatorio() {
    const tbody = document.getElementById('relatorio-table-body');
    const empty = document.getElementById('relatorio-empty');
    if (tbody) tbody.innerHTML = '';
    if (!supabaseClient || !currentUser) {
        showToast('Supabase não disponível.', 'error');
        return;
    }

    const dataInicial = (document.getElementById('rep-data-inicial') || {}).value || '';
    const dataFinal = (document.getElementById('rep-data-final') || {}).value || '';
    const nomeFilter = ((document.getElementById('rep-nome') || {}).value || '').trim().toLowerCase();
    const codigoFilter = ((document.getElementById('rep-codigo') || {}).value || '').trim().toLowerCase();
    const tipoFilter = (document.getElementById('rep-tipo') || {}).value || 'TODOS';
    const valorMin = parseFloat((document.getElementById('rep-valor-min') || {}).value);
    const valorMax = parseFloat((document.getElementById('rep-valor-max') || {}).value);

    try {
        let query = supabaseClient
            .from('historico')
            .select('*, itens(codigo, titulo, unidade)')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (dataInicial) {
            const start = new Date(dataInicial + 'T00:00:00');
            query = query.gte('created_at', start.toISOString());
        }
        if (dataFinal) {
            const end = new Date(dataFinal + 'T23:59:59');
            query = query.lte('created_at', end.toISOString());
        }
        if (tipoFilter === 'ENTRADA') {
            query = query.in('tipo', ['ENTRADA', 'CADASTRO']);
        } else if (tipoFilter === 'SAIDA') {
            query = query.eq('tipo', 'SAIDA');
        }

        let { data, error } = await query;
        if (error) {
            // Fallback: busca sem join e carrega itens separadamente
            let q2 = supabaseClient
                .from('historico')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            if (dataInicial) q2 = q2.gte('created_at', new Date(dataInicial + 'T00:00:00').toISOString());
            if (dataFinal) q2 = q2.lte('created_at', new Date(dataFinal + 'T23:59:59').toISOString());
            if (tipoFilter === 'ENTRADA') q2 = q2.in('tipo', ['ENTRADA', 'CADASTRO']);
            else if (tipoFilter === 'SAIDA') q2 = q2.eq('tipo', 'SAIDA');
            const r2 = await q2;
            if (r2.error) throw r2.error;
            data = r2.data || [];
            const { data: itemsData } = await supabaseClient.from('itens').select('id, codigo, titulo, unidade').eq('user_id', currentUser.id);
            const map = {};
            (itemsData || []).forEach(it => { map[String(it.id)] = it; });
            data = data.map(m => ({ ...m, itens: map[String(m.item_id)] || null }));
        }

        let movs = data || [];

        movs = movs.filter(mov => {
            const item = mov.itens || (itemsList || []).find(i => String(i.id) === String(mov.item_id)) || {};
            const name = (item.titulo || item.nome || '').toLowerCase();
            const code = String(item.codigo || item.id || mov.item_id || '').toLowerCase();
            if (nomeFilter && !name.includes(nomeFilter)) return false;
            if (codigoFilter && !code.includes(codigoFilter)) return false;
            return true;
        });

        movs = movs.filter(mov => {
            const val = Number(mov.valor_total || 0);
            if (!isNaN(valorMin) && val < valorMin) return false;
            if (!isNaN(valorMax) && val > valorMax) return false;
            return true;
        });

        relatorioData = movs;

        if (movs.length === 0) {
            if (empty) empty.classList.remove('hidden');
            updateRelatorioResumo([]);
            updateSortIndicators();
            updateRelatorioChart([]);
            if (window.lucide) lucide.createIcons();
            return;
        }
        if (empty) empty.classList.add('hidden');

        applyRelatorioSort();
        renderRelatorioTable(relatorioData);
        updateRelatorioResumo(relatorioData);
        updateSortIndicators();
        updateRelatorioChart(relatorioData);
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar relatório: ' + (e && e.message ? e.message : e), 'error');
    }
}


function updateRelatorioResumo(movs) {
    const totalEl = document.getElementById('rep-total-movimentado');
    const opsEl = document.getElementById('rep-total-operacoes');
    const total = (movs || []).reduce((acc, m) => acc + (Number(m.valor_total) || 0), 0);
    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (opsEl) opsEl.textContent = (movs || []).length;
}


function limparFiltrosRelatorio() {
    const ids = ['rep-data-inicial', 'rep-data-final', 'rep-nome', 'rep-codigo', 'rep-valor-min', 'rep-valor-max'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tipo = document.getElementById('rep-tipo');
    if (tipo) tipo.value = 'TODOS';
    loadRelatorio();
}

function exportarRelatorioCSV() {
    if (!relatorioData || relatorioData.length === 0) {
        showToast('Nenhum dado para exportar.', 'info');
        return;
    }
    const header = ['Data/Hora', 'Código do Item', 'Nome do Item', 'Tipo', 'Quantidade', 'Valor Total Pago', 'Custo Unitário Calculado'];
    const rows = relatorioData.map(mov => {
        const item = mov.itens || (itemsList || []).find(i => String(i.id) === String(mov.item_id)) || {};
        const code = item.codigo || item.id || mov.item_id;
        const name = item.titulo || item.nome || '-';
        const isEntrada = mov.tipo === 'ENTRADA' || mov.tipo === 'CADASTRO';
        const typeLabel = isEntrada ? 'Entrada' : 'Saída';
        const date = new Date(mov.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return [
            date,
            code,
            name,
            typeLabel,
            Number(mov.quantidade || 0),
            Number(mov.valor_total || 0).toFixed(2).replace('.', ','),
            Number(mov.custo_unitario || 0).toFixed(3).replace('.', ',')
        ];
    });
    const csv = [header, ...rows].map(r => r.map(v => {
        const s = String(v ?? '');
        if (s.includes(';') || s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }).join(';')).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio_estoque.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exportação CSV iniciada.', 'success');
}



// Custo por unidade/medida: sempre 3 casas depois da vírgula (ex.: R$ 0,017)
function formatUnitCost(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(val) || 0);
}

function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(val);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function populateItemsDatalist() {
    const dl = document.getElementById('items-datalist');
    if (!dl) return;
    const names = [];
    const seen = new Set();
    (itemsList || []).forEach(item => {
        const name = (item.titulo || item.title || item.nome || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            names.push(name);
        }
    });
    dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function setupAutocomplete(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    if (!input || !results) return;
    function renderList(filter) {
        const q = (filter || '').trim().toLowerCase();
        const names = [];
        const seen = new Set();
        (itemsList || []).forEach(item => {
            const name = (item.titulo || item.title || item.nome || '').trim();
            if (!name) return;
            if (q && !name.toLowerCase().includes(q)) return;
            if (seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            names.push(name);
        });
        if (names.length === 0) {
            results.classList.add('hidden');
            results.innerHTML = '';
            return;
        }
        results.innerHTML = names.map(n => '<div class="autocomplete-item hover:bg-brand-50 hover:text-brand-700 cursor-pointer p-2.5" data-value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</div>').join('');
        results.classList.remove('hidden');
    }
    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('focus', () => renderList(input.value));
    results.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            input.value = item.getAttribute('data-value');
            results.classList.add('hidden');
            if (inputId === 'search-input') renderItems();
        }
    });
}

document.addEventListener('click', (e) => {
    document.querySelectorAll('.autocomplete-results').forEach(r => {
        const inp = r.previousElementSibling;
        if (!r.contains(e.target) && !(inp && inp.contains(e.target))) {
            r.classList.add('hidden');
        }
    });
});

function initAutocomplete() {
    setupAutocomplete('rep-nome', 'rep-nome-results');
    setupAutocomplete('search-input', 'search-results');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutocomplete);
} else {
    initAutocomplete();
}

let relatorioChart = null;
let chartTab = 'preco';

function setChartTab(tab) {
    chartTab = tab === 'quantidade' ? 'quantidade' : 'preco';
    document.querySelectorAll('.chart-tab').forEach(btn => {
        if (btn.getAttribute('data-chart-tab') === chartTab) {
            btn.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
            btn.classList.add('bg-brand-600', 'text-white');
        } else {
            btn.classList.remove('bg-brand-600', 'text-white');
            btn.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
        }
    });
    updateRelatorioChart(relatorioData || []);
}

function updateRelatorioChart(movs) {
    const card = document.getElementById('relatorio-chart-card');
    const canvas = document.getElementById('relatorio-chart');
    if (!card || !canvas) return;

    const data = (movs || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (data.length === 0) {
        card.classList.add('hidden');
        if (relatorioChart) { relatorioChart.destroy(); relatorioChart = null; }
        return;
    }

    card.classList.remove('hidden');

    if (chartTab === 'preco') {
        const unitCosts = data.map(m => Number(m.custo_unitario || 0));
        const minVal = Math.min(...unitCosts);
        const maxVal = Math.max(...unitCosts);
        const avgVal = unitCosts.reduce((a, b) => a + b, 0) / unitCosts.length;

        const l1 = document.getElementById('chart-label-1');
        const l2 = document.getElementById('chart-label-2');
        const l3 = document.getElementById('chart-label-3');
        const v1 = document.getElementById('chart-val-1');
        const v2 = document.getElementById('chart-val-2');
        const v3 = document.getElementById('chart-val-3');
        const c1 = document.getElementById('chart-card-1');
        const c2 = document.getElementById('chart-card-2');
        const c3 = document.getElementById('chart-card-3');
        if (l1) l1.textContent = 'Menor Preço Pago';
        if (l2) l2.textContent = 'Maior Preço Pago';
        if (l3) l3.textContent = 'Custo Médio';
        if (v1) v1.textContent = formatCurrency(minVal);
        if (v2) v2.textContent = formatCurrency(maxVal);
        if (v3) v3.textContent = formatCurrency(avgVal);
        if (c1) c1.className = 'rounded-xl p-3 bg-emerald-50 text-emerald-700';
        if (c2) c2.className = 'rounded-xl p-3 bg-rose-50 text-rose-700';
        if (c3) c3.className = 'rounded-xl p-3 bg-sky-50 text-sky-700';
        if (v1) v1.className = 'text-lg font-bold text-emerald-600';
        if (v2) v2.className = 'text-lg font-bold text-rose-600';
        if (v3) v3.className = 'text-lg font-bold text-sky-600';

        const labels = data.map(m => new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
        const values = unitCosts;
        const pointColors = values.map(v => {
            if (v === minVal) return '#10b981';
            if (v === maxVal) return '#f43f5e';
            return '#0284c7';
        });

        if (relatorioChart) { relatorioChart.destroy(); relatorioChart = null; }
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(2, 132, 199, 0.25)');
        gradient.addColorStop(1, 'rgba(2, 132, 199, 0.02)');

        relatorioChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Preço Unitário (R$)',
                    data: values,
                    borderColor: '#0284c7',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: '#64748b', font: { size: 12 } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(100, 116, 139, 0.1)' } },
                    y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => 'R$ ' + Number(v).toFixed(2) }, grid: { color: 'rgba(100, 116, 139, 0.1)' } }
                }
            }
        });
    } else {

        const entradas = data.filter(m => m.tipo === 'ENTRADA' || m.tipo === 'CADASTRO');
        const saidas = data.filter(m => m.tipo === 'SAIDA');
        const totalEntradas = entradas.reduce((a, m) => a + (Number(m.quantidade) || 0), 0);
        const totalSaidas = saidas.reduce((a, m) => a + (Number(m.quantidade) || 0), 0);
        const saldo = totalEntradas - totalSaidas;
        const unidade = (data[0] && data[0].itens && data[0].itens.unidade) || (itemsList || []).find(i => String(i.id) === String(data[0].item_id))?.unidade || '';

        const l1 = document.getElementById('chart-label-1');
        const l2 = document.getElementById('chart-label-2');
        const l3 = document.getElementById('chart-label-3');
        const v1 = document.getElementById('chart-val-1');
        const v2 = document.getElementById('chart-val-2');
        const v3 = document.getElementById('chart-val-3');
        const c1 = document.getElementById('chart-card-1');
        const c2 = document.getElementById('chart-card-2');
        const c3 = document.getElementById('chart-card-3');
        if (l1) l1.textContent = 'Total de Entradas';
        if (l2) l2.textContent = 'Total de Saídas';
        if (l3) l3.textContent = 'Saldo Movimentado';
        if (v1) v1.textContent = totalEntradas.toLocaleString('pt-BR') + ' ' + unidade;
        if (v2) v2.textContent = totalSaidas.toLocaleString('pt-BR') + ' ' + unidade;
        if (v3) v3.textContent = saldo.toLocaleString('pt-BR') + ' ' + unidade;
        if (c1) c1.className = 'rounded-xl p-3 bg-emerald-50 text-emerald-700';
        if (c2) c2.className = 'rounded-xl p-3 bg-rose-50 text-rose-700';
        if (c3) c3.className = 'rounded-xl p-3 bg-sky-50 text-sky-700';
        if (v1) v1.className = 'text-lg font-bold text-emerald-600';
        if (v2) v2.className = 'text-lg font-bold text-rose-600';
        if (v3) v3.className = 'text-lg font-bold text-sky-600';

        const labels = data.map(m => new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
        const entradaVals = data.map(m => (m.tipo === 'ENTRADA' || m.tipo === 'CADASTRO') ? Number(m.quantidade || 0) : 0);
        const saidaVals = data.map(m => m.tipo === 'SAIDA' ? Number(m.quantidade || 0) : 0);

        if (relatorioChart) { relatorioChart.destroy(); relatorioChart = null; }
        const ctx = canvas.getContext('2d');
        relatorioChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Entradas (' + unidade + ')', data: entradaVals, backgroundColor: 'rgba(16, 185, 129, 0.6)', borderColor: '#10b981', borderWidth: 1 },
                    { label: 'Saídas (' + unidade + ')', data: saidaVals, backgroundColor: 'rgba(244, 63, 94, 0.6)', borderColor: '#f43f5e', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, labels: { color: '#64748b', font: { size: 12 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(100, 116, 139, 0.1)' } },
                    y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(100, 116, 139, 0.1)' } }
                }
            }
        });
    }
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-tab');
    if (btn) {
        setChartTab(btn.getAttribute('data-chart-tab'));
    }
});

// init chart tab active state
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setChartTab('preco'));
} else {
    setChartTab('preco');
}

