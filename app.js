/* ============================================
   DASHBOARD FLUJO DE DINERO INGENIA - Main App
   Version 2.0 - Executive Dashboard
   ============================================ */

// Configuration
const CONFIG = {
    // Google Sheets ID
    SHEET_ID: '1SK5OiU24RY1H0bwzLuffusz_2480bWtWods-koalfrU',

    // API URL for fetching data
    get API_URL() {
        return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:json`;
    },

    // Auto-refresh interval (5 minutes)
    REFRESH_INTERVAL: 5 * 60 * 1000,

    // Alert thresholds
    ALERT_SINGLE_EXPENSE: 200,    // Alert if single expense > S/.200
    ALERT_MONTHLY_EXPENSE: 500,   // Alert if monthly expenses > S/.500

    // Standardized Colors
    COLORS: {
        income: '#10b981',        // Verde para INGRESOS
        expense: '#ef4444',       // Rojo para EGRESOS
        balance: '#3b82f6',       // Azul para SALDO
        warning: '#f59e0b',       // Naranja para ALERTAS

        // Chart colors for projects (multicolor)
        projects: [
            '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899',
            '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#a855f7'
        ],

        // Green gradient for income charts
        incomeGradient: [
            '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'
        ],

        // Red gradient for expense charts
        expenseGradient: [
            '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2'
        ]
    }
};

// Global state
let dashboardData = {
    transactions: [],
    filteredTransactions: [],
    totals: {
        saldo: 0,
        ingresos: 0,
        egresos: 0,
        count: 0
    },
    byProject: {},
    byResponsable: {},
    byMonth: {},
    byMedio: {},
    alerts: []
};

// Active filters
let activeFilters = {
    year: '2025',
    month: 'all',
    proyecto: 'all',
    responsable: 'all',
    medio: 'all'
};

// Chart instances
let charts = {
    proyectos: null,
    topProyectos: null,
    topIngresos: null,
    tendencia: null,
    responsables: null,
    medios: null,
    projectHealth: null
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

async function initDashboard() {
    try {
        // Fetch data from Google Sheets
        await fetchData();

        // Populate filter dropdowns
        populateFilters();

        // Apply initial filters and render
        applyFiltersAndRender();

        // Hide loading screen
        hideLoading();

        // Setup event listeners
        setupEventListeners();

        // Start auto-refresh
        startAutoRefresh();

        // Update last update time
        updateLastUpdateTime();

    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Error al cargar los datos. Por favor, recarga la página.');
    }
}

// ============================================
// DATA FETCHING
// ============================================
async function fetchData() {
    try {
        let text;

        // Try direct fetch first (works when deployed or with local server)
        try {
            const response = await fetch(CONFIG.API_URL);
            if (!response.ok) throw new Error('Direct fetch failed');
            text = await response.text();
        } catch (directError) {
            // If direct fetch fails (CORS), use proxy
            console.log('Direct fetch failed, using CORS proxy...');
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(CONFIG.API_URL)}`;
            const proxyResponse = await fetch(proxyUrl);
            const proxyData = await proxyResponse.json();
            text = proxyData.contents;
        }

        // Parse Google Sheets JSON response
        const jsonString = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)[1];
        const data = JSON.parse(jsonString);

        // Process the data
        processData(data.table);

    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

function processData(table) {
    const rows = table.rows;

    // Reset raw data
    dashboardData.transactions = [];

    // Process each row (start from row 2 to skip headers)
    rows.forEach((row, index) => {
        if (index < 2) return; // Skip header rows

        const cells = row.c;

        // Extract data from cells
        const numero = cells[1]?.v;
        const fechaRaw = cells[2]?.v;
        const fechaFormatted = cells[2]?.f || '';
        const hora = cells[3]?.f || '';
        const responsable = cells[4]?.v || '';
        const descripcion = cells[5]?.v || '';
        const medio = cells[6]?.v || '';
        const ingreso = cells[8]?.v || 0;
        const proyecto = cells[9]?.v || '';
        const egreso = cells[10]?.v || 0;
        const saldo = cells[11]?.v || 0;

        // Skip empty rows
        if (!numero || (!ingreso && !egreso && !descripcion)) return;

        // Parse date
        let fecha = null;
        let year = null;
        let month = null;
        if (fechaRaw && typeof fechaRaw === 'string' && fechaRaw.includes('Date')) {
            const match = fechaRaw.match(/Date\((\d+),(\d+),(\d+)\)/);
            if (match) {
                fecha = new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
                year = fecha.getFullYear().toString();
                month = String(fecha.getMonth() + 1).padStart(2, '0');
            }
        }

        // Create transaction object
        const transaction = {
            numero: numero,
            fecha: fecha,
            fechaFormatted: fechaFormatted,
            year: year,
            month: month,
            hora: hora,
            responsable: responsable.trim(),
            descripcion: descripcion,
            medio: medio,
            ingreso: parseFloat(ingreso) || 0,
            proyecto: proyecto.trim(),
            egreso: parseFloat(egreso) || 0,
            saldo: parseFloat(saldo) || 0
        };

        dashboardData.transactions.push(transaction);
    });
}

function applyFiltersAndRender() {
    // Filter transactions based on active filters
    dashboardData.filteredTransactions = dashboardData.transactions.filter(t => {
        if (activeFilters.year !== 'all' && t.year !== activeFilters.year) return false;
        if (activeFilters.month !== 'all' && t.month !== activeFilters.month) return false;
        if (activeFilters.proyecto !== 'all' && t.proyecto !== activeFilters.proyecto) return false;
        if (activeFilters.responsable !== 'all' && t.responsable !== activeFilters.responsable) return false;
        if (activeFilters.medio !== 'all' && t.medio !== activeFilters.medio) return false;
        return true;
    });

    // Recalculate aggregations based on filtered data
    calculateAggregations();

    // Check for alerts
    checkAlerts();

    // Render all components
    renderKPIs();
    renderExecutiveKPIs();
    renderCharts();
    renderTransactionsTable();
}

function calculateAggregations() {
    const transactions = dashboardData.filteredTransactions;

    // Reset aggregations
    dashboardData.totals = { saldo: 0, ingresos: 0, egresos: 0, count: 0 };
    dashboardData.byProject = {};
    dashboardData.byResponsable = {};
    dashboardData.byMonth = {};
    dashboardData.byMedio = {};

    transactions.forEach(t => {
        // Update totals
        dashboardData.totals.ingresos += t.ingreso;
        dashboardData.totals.egresos += t.egreso;
        dashboardData.totals.saldo = t.saldo; // Last saldo
        dashboardData.totals.count++;

        // Group by project
        if (t.proyecto) {
            if (!dashboardData.byProject[t.proyecto]) {
                dashboardData.byProject[t.proyecto] = { ingresos: 0, egresos: 0 };
            }
            dashboardData.byProject[t.proyecto].ingresos += t.ingreso;
            dashboardData.byProject[t.proyecto].egresos += t.egreso;
        }

        // Group by responsable
        if (t.responsable) {
            if (!dashboardData.byResponsable[t.responsable]) {
                dashboardData.byResponsable[t.responsable] = { ingresos: 0, egresos: 0 };
            }
            dashboardData.byResponsable[t.responsable].ingresos += t.ingreso;
            dashboardData.byResponsable[t.responsable].egresos += t.egreso;
        }

        // Group by month
        if (t.fecha) {
            const monthKey = `${t.fecha.getFullYear()}-${String(t.fecha.getMonth() + 1).padStart(2, '0')}`;
            if (!dashboardData.byMonth[monthKey]) {
                dashboardData.byMonth[monthKey] = { ingresos: 0, egresos: 0, saldo: 0 };
            }
            dashboardData.byMonth[monthKey].ingresos += t.ingreso;
            dashboardData.byMonth[monthKey].egresos += t.egreso;
            dashboardData.byMonth[monthKey].saldo = t.saldo;
        }

        // Group by medio
        if (t.medio) {
            if (!dashboardData.byMedio[t.medio]) {
                dashboardData.byMedio[t.medio] = { count: 0, total: 0 };
            }
            dashboardData.byMedio[t.medio].count++;
            dashboardData.byMedio[t.medio].total += t.ingreso + t.egreso;
        }
    });
}

function checkAlerts() {
    dashboardData.alerts = [];

    // Check for high single expenses
    dashboardData.filteredTransactions.forEach(t => {
        if (t.egreso > CONFIG.ALERT_SINGLE_EXPENSE) {
            dashboardData.alerts.push({
                type: 'warning',
                icon: 'fa-receipt',
                message: `Egreso elevado: ${formatCurrency(t.egreso)} - "${truncateText(t.descripcion, 40)}"`
            });
        }
    });

    // Check monthly expenses
    Object.entries(dashboardData.byMonth).forEach(([month, data]) => {
        if (data.egresos > CONFIG.ALERT_MONTHLY_EXPENSE) {
            const [year, monthNum] = month.split('-');
            dashboardData.alerts.push({
                type: 'warning',
                icon: 'fa-calendar-exclamation',
                message: `Egresos mensuales altos: ${getMonthName(monthNum)} ${year} = ${formatCurrency(data.egresos)}`
            });
        }
    });

    // Check projects in red
    Object.entries(dashboardData.byProject).forEach(([project, data]) => {
        if (data.egresos > data.ingresos && data.ingresos > 0) {
            const deficit = data.egresos - data.ingresos;
            dashboardData.alerts.push({
                type: 'danger',
                icon: 'fa-triangle-exclamation',
                message: `Proyecto en rojo: "${truncateText(project, 25)}" - Déficit: ${formatCurrency(deficit)}`
            });
        }
    });

    // Show/hide alerts section and render list
    const alertsSection = document.getElementById('alerts-section');
    const alertsList = document.getElementById('alerts-list');
    const alertCount = document.getElementById('alert-count');

    if (dashboardData.alerts.length > 0) {
        alertsSection.classList.remove('hidden');
        alertCount.textContent = `${dashboardData.alerts.length} alerta(s) detectada(s) - Click para ver detalles`;

        // Render alerts list
        alertsList.innerHTML = dashboardData.alerts.map(alert => `
            <div class="alert-item ${alert.type}">
                <i class="fas ${alert.icon || 'fa-exclamation-circle'}"></i>
                <span>${alert.message}</span>
            </div>
        `).join('');

    } else {
        alertsSection.classList.add('hidden');
    }
}

// Toggle alerts list visibility
function toggleAlerts() {
    const alertsList = document.getElementById('alerts-list');
    const toggleBtn = document.getElementById('alerts-toggle');

    alertsList.classList.toggle('hidden');
    toggleBtn.classList.toggle('expanded');
}

// ============================================
// POPULATE FILTERS
// ============================================
function populateFilters() {
    // Populate projects
    const proyectos = [...new Set(dashboardData.transactions.map(t => t.proyecto).filter(p => p))].sort();
    const proyectoSelect = document.getElementById('filter-proyecto');
    proyectoSelect.innerHTML = '<option value="all">Todos los proyectos</option>';
    proyectos.forEach(p => {
        proyectoSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });

    // Populate responsables
    const responsables = [...new Set(dashboardData.transactions.map(t => t.responsable).filter(r => r))].sort();
    const responsableSelect = document.getElementById('filter-responsable');
    responsableSelect.innerHTML = '<option value="all">Todos</option>';
    responsables.forEach(r => {
        const shortName = r.split(' ').slice(0, 2).join(' ');
        responsableSelect.innerHTML += `<option value="${r}">${shortName}</option>`;
    });
}

// ============================================
// KPI RENDERING
// ============================================
function renderKPIs() {
    const transactions = dashboardData.filteredTransactions;
    const totals = dashboardData.totals;

    // Get last transaction date for period display
    let lastDate = 'N/A';
    let firstDate = 'N/A';
    if (transactions.length > 0) {
        lastDate = transactions[transactions.length - 1].fechaFormatted || 'N/A';
        firstDate = transactions[0].fechaFormatted || 'N/A';
    }

    // Saldo Actual
    document.getElementById('kpi-saldo').textContent = formatCurrency(totals.saldo);
    document.getElementById('period-saldo').textContent = `al ${lastDate}`;

    // Calculate trend (comparing first and last)
    if (transactions.length > 1) {
        const firstSaldo = transactions[0].saldo;
        const lastSaldo = totals.saldo;
        const trendPercent = firstSaldo > 0 ? ((lastSaldo - firstSaldo) / firstSaldo * 100).toFixed(1) : 0;
        const trendElement = document.getElementById('trend-saldo');

        if (trendPercent >= 0) {
            trendElement.className = 'kpi-trend positive';
            trendElement.innerHTML = `<i class="fas fa-arrow-up"></i> +${trendPercent}% desde inicio`;
        } else {
            trendElement.className = 'kpi-trend negative';
            trendElement.innerHTML = `<i class="fas fa-arrow-down"></i> ${trendPercent}% desde inicio`;
        }
    }

    // Period label
    const yearFilter = activeFilters.year !== 'all' ? activeFilters.year : 'Todo';
    const monthFilter = activeFilters.month !== 'all' ? getMonthName(activeFilters.month) : '';
    const periodLabel = monthFilter ? `${monthFilter} ${yearFilter}` : `Periodo ${yearFilter}`;

    // Total Ingresos
    document.getElementById('kpi-ingresos').textContent = formatCurrency(totals.ingresos);
    document.getElementById('period-ingresos').textContent = periodLabel;
    const ingresosCount = transactions.filter(t => t.ingreso > 0).length;
    document.getElementById('count-ingresos').textContent = `${ingresosCount} transacciones`;

    // Total Egresos
    document.getElementById('kpi-egresos').textContent = formatCurrency(totals.egresos);
    document.getElementById('period-egresos').textContent = periodLabel;
    const egresosCount = transactions.filter(t => t.egreso > 0).length;
    document.getElementById('count-egresos').textContent = `${egresosCount} transacciones`;

    // Total Transacciones
    document.getElementById('kpi-transacciones').textContent = totals.count;
    if (firstDate !== 'N/A' && lastDate !== 'N/A') {
        document.getElementById('periodo-transacciones').textContent = `${firstDate.split('/')[1]}/${firstDate.split('/')[2]} - ${lastDate.split('/')[1]}/${lastDate.split('/')[2]}`;
    }
}

function renderExecutiveKPIs() {
    const totals = dashboardData.totals;
    const byMonth = dashboardData.byMonth;
    const byProject = dashboardData.byProject;

    // Ratio Egreso/Ingreso
    const ratio = totals.ingresos > 0 ? (totals.egresos / totals.ingresos * 100) : 0;
    document.getElementById('kpi-ratio').textContent = `${ratio.toFixed(1)}%`;

    // Update ratio bar
    const ratioBar = document.getElementById('ratio-bar');
    ratioBar.style.width = `${Math.min(ratio, 100)}%`;
    if (ratio > 100) {
        ratioBar.style.background = CONFIG.COLORS.expense;
    } else if (ratio > 80) {
        ratioBar.style.background = CONFIG.COLORS.warning;
    } else {
        ratioBar.style.background = CONFIG.COLORS.income;
    }

    // Variación Mensual
    const sortedMonths = Object.keys(byMonth).sort();
    if (sortedMonths.length >= 2) {
        const lastMonth = byMonth[sortedMonths[sortedMonths.length - 1]];
        const prevMonth = byMonth[sortedMonths[sortedMonths.length - 2]];
        const variacion = lastMonth.saldo - prevMonth.saldo;
        const variacionEl = document.getElementById('kpi-variacion');

        if (variacion >= 0) {
            variacionEl.textContent = `+${formatCurrency(variacion)}`;
            variacionEl.className = 'kpi-value green';
        } else {
            variacionEl.textContent = formatCurrency(variacion);
            variacionEl.className = 'kpi-value red';
        }

        const lastMonthName = getMonthName(sortedMonths[sortedMonths.length - 1].split('-')[1]);
        document.getElementById('variacion-detail').textContent = `vs mes anterior (${lastMonthName})`;
    } else {
        document.getElementById('kpi-variacion').textContent = 'N/A';
    }

    // Concentración Top 3
    const projectIngresos = Object.entries(byProject)
        .map(([name, data]) => ({ name, ingresos: data.ingresos }))
        .filter(p => p.ingresos > 0)
        .sort((a, b) => b.ingresos - a.ingresos);

    if (projectIngresos.length > 0 && totals.ingresos > 0) {
        const top3 = projectIngresos.slice(0, 3);
        const top3Total = top3.reduce((sum, p) => sum + p.ingresos, 0);
        const concentracion = (top3Total / totals.ingresos * 100).toFixed(1);
        document.getElementById('kpi-concentracion').textContent = `${concentracion}%`;
        document.getElementById('top3-projects').textContent = top3.map(p => p.name.split(' ')[0]).join(', ');
    } else {
        document.getElementById('kpi-concentracion').textContent = 'N/A';
    }

    // Liquidez Promedio Mensual
    const monthCount = Object.keys(byMonth).length || 1;
    const avgLiquidity = totals.saldo / monthCount;
    document.getElementById('kpi-liquidez').textContent = formatCurrency(avgLiquidity);
}

// ============================================
// CHARTS RENDERING
// ============================================
function renderCharts() {
    renderProyectosChart();
    renderTopProyectosChart();
    renderTopIngresosChart();
    renderTendenciaChart();
    renderResponsablesChart();
    renderMediosChart();
    renderProjectHealthChart();
}

function renderProyectosChart() {
    const ctx = document.getElementById('chart-proyectos').getContext('2d');

    if (charts.proyectos) charts.proyectos.destroy();

    const filterType = document.getElementById('filter-chart-type').value;

    const projectData = Object.entries(dashboardData.byProject)
        .map(([name, data]) => ({
            name: name,
            value: filterType === 'egresos' ? data.egresos : data.ingresos
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

    charts.proyectos = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: projectData.map(p => truncateText(p.name, 20)),
            datasets: [{
                data: projectData.map(p => p.value),
                backgroundColor: CONFIG.COLORS.projects,
                borderColor: 'rgba(0, 0, 0, 0.2)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 10 },
                        boxWidth: 10,
                        padding: 8
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${formatCurrency(context.raw)}`
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function renderTopProyectosChart() {
    const ctx = document.getElementById('chart-top-proyectos').getContext('2d');

    if (charts.topProyectos) charts.topProyectos.destroy();

    const topProjects = Object.entries(dashboardData.byProject)
        .map(([name, data]) => ({ name, egresos: data.egresos }))
        .filter(p => p.egresos > 0)
        .sort((a, b) => b.egresos - a.egresos)
        .slice(0, 5);

    charts.topProyectos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topProjects.map(p => truncateText(p.name, 20)),
            datasets: [{
                label: 'Egreso',
                data: topProjects.map(p => p.egresos),
                backgroundColor: CONFIG.COLORS.expenseGradient.slice(0, 5),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatCurrency(context.raw)
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (value) => formatCurrency(value)
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            }
        }
    });
}

function renderTopIngresosChart() {
    const ctx = document.getElementById('chart-top-ingresos').getContext('2d');

    if (charts.topIngresos) charts.topIngresos.destroy();

    const topIngresos = Object.entries(dashboardData.byProject)
        .map(([name, data]) => ({ name, ingresos: data.ingresos }))
        .filter(p => p.ingresos > 0)
        .sort((a, b) => b.ingresos - a.ingresos);

    charts.topIngresos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topIngresos.map(p => truncateText(p.name, 25)),
            datasets: [{
                label: 'Ingreso',
                data: topIngresos.map(p => p.ingresos),
                backgroundColor: CONFIG.COLORS.incomeGradient.slice(0, topIngresos.length),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatCurrency(context.raw)
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (value) => formatCurrency(value)
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            }
        }
    });
}

function renderTendenciaChart() {
    const ctx = document.getElementById('chart-tendencia').getContext('2d');

    if (charts.tendencia) charts.tendencia.destroy();

    const sortedMonths = Object.keys(dashboardData.byMonth).sort();

    const labels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return `${getMonthName(month)} ${year.slice(2)}`;
    });

    charts.tendencia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ingresos',
                    data: sortedMonths.map(m => dashboardData.byMonth[m].ingresos),
                    borderColor: CONFIG.COLORS.income,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Egresos',
                    data: sortedMonths.map(m => dashboardData.byMonth[m].egresos),
                    borderColor: CONFIG.COLORS.expense,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Saldo',
                    data: sortedMonths.map(m => dashboardData.byMonth[m].saldo),
                    borderColor: CONFIG.COLORS.balance,
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });

    // Update trend comparison footer
    updateTrendComparison(sortedMonths);
}

function updateTrendComparison(sortedMonths) {
    const trendComparison = document.getElementById('trend-comparison');

    if (sortedMonths.length >= 2) {
        const lastMonth = dashboardData.byMonth[sortedMonths[sortedMonths.length - 1]];
        const prevMonth = dashboardData.byMonth[sortedMonths[sortedMonths.length - 2]];

        const ingresosChange = prevMonth.ingresos > 0
            ? ((lastMonth.ingresos - prevMonth.ingresos) / prevMonth.ingresos * 100).toFixed(1)
            : 0;
        const egresosChange = prevMonth.egresos > 0
            ? ((lastMonth.egresos - prevMonth.egresos) / prevMonth.egresos * 100).toFixed(1)
            : 0;

        trendComparison.innerHTML = `
            <span class="trend-item ${ingresosChange >= 0 ? 'positive' : 'negative'}">
                <i class="fas fa-arrow-${ingresosChange >= 0 ? 'up' : 'down'}"></i> 
                Ingresos: ${ingresosChange >= 0 ? '+' : ''}${ingresosChange}% vs mes anterior
            </span>
            <span class="trend-item ${egresosChange >= 0 ? 'negative' : 'positive'}">
                <i class="fas fa-arrow-${egresosChange >= 0 ? 'up' : 'down'}"></i> 
                Egresos: ${egresosChange >= 0 ? '+' : ''}${egresosChange}% vs mes anterior
            </span>
        `;
    }
}

function renderResponsablesChart() {
    const ctx = document.getElementById('chart-responsables').getContext('2d');

    if (charts.responsables) charts.responsables.destroy();

    const responsables = Object.entries(dashboardData.byResponsable)
        .map(([name, data]) => ({
            name: name.split(' ').slice(0, 2).join(' '),
            fullName: name,
            ingresos: data.ingresos,
            egresos: data.egresos
        }))
        .sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos))
        .slice(0, 6);

    charts.responsables = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: responsables.map(r => r.name),
            datasets: [
                {
                    label: 'Ingresos',
                    data: responsables.map(r => r.ingresos),
                    backgroundColor: CONFIG.COLORS.income,
                    borderRadius: 4
                },
                {
                    label: 'Egresos',
                    data: responsables.map(r => r.egresos),
                    backgroundColor: CONFIG.COLORS.expense,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', boxWidth: 10, padding: 8, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        title: (context) => responsables[context[0].dataIndex].fullName,
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

function renderMediosChart() {
    const ctx = document.getElementById('chart-medios').getContext('2d');

    if (charts.medios) charts.medios.destroy();

    const medios = Object.entries(dashboardData.byMedio)
        .map(([name, data]) => ({ name, count: data.count }))
        .sort((a, b) => b.count - a.count);

    charts.medios = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: medios.map(m => m.name),
            datasets: [{
                data: medios.map(m => m.count),
                backgroundColor: [CONFIG.COLORS.balance, CONFIG.COLORS.projects[1], CONFIG.COLORS.warning],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', padding: 12, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${context.raw} transacciones`
                    }
                }
            },
            cutout: '50%'
        }
    });
}

function renderProjectHealthChart() {
    const ctx = document.getElementById('chart-project-health').getContext('2d');

    if (charts.projectHealth) charts.projectHealth.destroy();

    // Get projects with both ingresos and egresos
    const projects = Object.entries(dashboardData.byProject)
        .map(([name, data]) => ({
            name: name,
            balance: data.ingresos - data.egresos,
            ingresos: data.ingresos,
            egresos: data.egresos
        }))
        .filter(p => p.ingresos > 0 || p.egresos > 0)
        .sort((a, b) => b.balance - a.balance);

    charts.projectHealth = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: projects.map(p => truncateText(p.name, 15)),
            datasets: [{
                label: 'Balance (Ingresos - Egresos)',
                data: projects.map(p => p.balance),
                backgroundColor: projects.map(p => p.balance >= 0 ? CONFIG.COLORS.income : CONFIG.COLORS.expense),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const p = projects[context.dataIndex];
                            return [
                                `Balance: ${formatCurrency(p.balance)}`,
                                `Ingresos: ${formatCurrency(p.ingresos)}`,
                                `Egresos: ${formatCurrency(p.egresos)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

// ============================================
// TRANSACTIONS TABLE
// ============================================
function renderTransactionsTable(filter = 'todos') {
    const tbody = document.getElementById('transactions-tbody');
    tbody.innerHTML = '';

    let filteredTransactions = [...dashboardData.filteredTransactions].reverse();

    const tableFilter = document.getElementById('filter-tipo').value;
    if (tableFilter === 'ingresos') {
        filteredTransactions = filteredTransactions.filter(t => t.ingreso > 0);
    } else if (tableFilter === 'egresos') {
        filteredTransactions = filteredTransactions.filter(t => t.egreso > 0);
    }

    filteredTransactions.slice(0, 15).forEach(t => {
        const row = document.createElement('tr');

        const isIngreso = t.ingreso > 0;
        const monto = isIngreso ? t.ingreso : t.egreso;
        const montoClass = isIngreso ? 'amount-positive' : 'amount-negative';
        const montoPrefix = isIngreso ? '+' : '-';

        // Determine status
        let statusClass = 'ok';
        let statusText = 'OK';
        if (t.egreso > CONFIG.ALERT_SINGLE_EXPENSE) {
            statusClass = 'alert';
            statusText = 'Alto';
        }

        row.innerHTML = `
            <td>${t.fechaFormatted || '-'}</td>
            <td>${truncateText(t.responsable, 20) || '-'}</td>
            <td>${truncateText(t.descripcion, 30) || '-'}</td>
            <td><span class="project-badge">${truncateText(t.proyecto, 15) || '-'}</span></td>
            <td class="${montoClass}">${montoPrefix}${formatCurrency(monto)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        `;

        tbody.appendChild(row);
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('rotating');

        await fetchData();
        applyFiltersAndRender();
        updateLastUpdateTime();

        setTimeout(() => btn.classList.remove('rotating'), 1000);
    });

    // Export PDF button
    document.getElementById('export-btn').addEventListener('click', exportToPDF);

    // Chart type filter
    document.getElementById('filter-chart-type').addEventListener('change', () => {
        renderProyectosChart();
    });

    // Table filter
    document.getElementById('filter-tipo').addEventListener('change', () => {
        renderTransactionsTable();
    });

    // Global filters
    ['filter-year', 'filter-month', 'filter-proyecto', 'filter-responsable', 'filter-medio'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const filterName = id.replace('filter-', '');
            activeFilters[filterName] = e.target.value;
            applyFiltersAndRender();
        });
    });

    // Clear filters
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        activeFilters = {
            year: 'all',
            month: 'all',
            proyecto: 'all',
            responsable: 'all',
            medio: 'all'
        };
        document.getElementById('filter-year').value = 'all';
        document.getElementById('filter-month').value = 'all';
        document.getElementById('filter-proyecto').value = 'all';
        document.getElementById('filter-responsable').value = 'all';
        document.getElementById('filter-medio').value = 'all';
        applyFiltersAndRender();
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('help-modal');
    if (e.target === modal) {
        closeHelpModal();
    }
});

// ============================================
// PDF EXECUTIVE REPORT - COMPLETE TEMPLATE
// ============================================

function getCurrentMonthYear() {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const now = new Date();
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

function generateCompleteReport() {
    const totals = dashboardData.totals;
    const alerts = dashboardData.alerts || [];
    const byProject = dashboardData.byProject;
    const byMonth = dashboardData.byMonth;
    const byResponsable = dashboardData.byResponsable;
    const byMedio = dashboardData.byMedio;
    const transactions = dashboardData.filteredTransactions;

    // Calculate metrics
    const ratio = totals.ingresos > 0 ? (totals.egresos / totals.ingresos * 100).toFixed(1) : 0;
    const liquidezPromedio = Object.keys(byMonth).length > 0
        ? (totals.saldo / Object.keys(byMonth).length).toFixed(2) : totals.saldo;

    // Date range
    const firstDate = transactions.length > 0 ? transactions[0].fechaFormatted : 'N/A';
    const lastDate = transactions.length > 0 ? transactions[transactions.length - 1].fechaFormatted : 'N/A';

    // Top projects by ingresos
    const topIngresosProjects = Object.entries(byProject)
        .map(([name, data]) => ({ name, ingresos: data.ingresos, egresos: data.egresos, saldo: data.ingresos - data.egresos }))
        .filter(p => p.ingresos > 0)
        .sort((a, b) => b.ingresos - a.ingresos)
        .slice(0, 5);

    // Top projects by egresos
    const topEgresosProjects = Object.entries(byProject)
        .map(([name, data]) => ({ name, ingresos: data.ingresos, egresos: data.egresos, saldo: data.ingresos - data.egresos }))
        .filter(p => p.egresos > 0)
        .sort((a, b) => b.egresos - a.egresos)
        .slice(0, 5);

    // Concentration Top 3
    const top3Ingresos = topIngresosProjects.slice(0, 3).reduce((sum, p) => sum + p.ingresos, 0);
    const concentracion = totals.ingresos > 0 ? ((top3Ingresos / totals.ingresos) * 100).toFixed(1) : 0;

    // Projects in red
    const projectsInRed = Object.entries(byProject)
        .filter(([name, data]) => data.egresos > data.ingresos && data.ingresos > 0)
        .map(([name, data]) => ({ name, deficit: data.egresos - data.ingresos }));

    // Monthly variation
    const sortedMonths = Object.keys(byMonth).sort();
    let variacionMensual = 0;
    let tendenciaTexto = '';
    if (sortedMonths.length >= 2) {
        const lastMonth = byMonth[sortedMonths[sortedMonths.length - 1]];
        const prevMonth = byMonth[sortedMonths[sortedMonths.length - 2]];
        variacionMensual = lastMonth.saldo - prevMonth.saldo;
        tendenciaTexto = variacionMensual >= 0
            ? `El saldo aumentó ${formatCurrency(variacionMensual)} respecto al mes anterior.`
            : `El saldo disminuyó ${formatCurrency(Math.abs(variacionMensual))} respecto al mes anterior.`;
    }

    // Responsables analysis
    const responsablesList = Object.entries(byResponsable)
        .map(([name, data]) => ({ name, ingresos: data.ingresos, egresos: data.egresos }))
        .sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos))
        .slice(0, 5);

    // Medio de pago analysis
    const mediosList = Object.entries(byMedio)
        .map(([name, data]) => ({ name, total: data.total, count: data.count }))
        .sort((a, b) => b.total - a.total);

    // Generate conclusions
    let conclusiones = [];
    let riesgos = [];
    let oportunidades = [];
    let acciones = [];

    // Health assessment
    if (ratio < 50) {
        conclusiones.push('Gestión financiera EXCELENTE - El ratio de gastos es bajo (' + ratio + '%).');
        oportunidades.push('Existe margen para inversiones estratégicas.');
    } else if (ratio < 80) {
        conclusiones.push('Gestión financiera BUENA - Ratio de gastos moderado (' + ratio + '%).');
    } else if (ratio < 100) {
        riesgos.push('Los gastos están cerca de igualar los ingresos (' + ratio + '%).');
        acciones.push('Revisar y optimizar gastos operativos.');
    } else {
        riesgos.push('CRÍTICO: Los egresos superan los ingresos (' + ratio + '%).');
        acciones.push('Implementar plan de reducción de gastos inmediato.');
    }

    if (projectsInRed.length > 0) {
        riesgos.push(`${projectsInRed.length} proyecto(s) con déficit financiero.`);
        acciones.push('Evaluar continuidad de proyectos deficitarios.');
    }

    if (concentracion > 70) {
        riesgos.push(`Alta concentración de ingresos (${concentracion}% en Top 3).`);
        oportunidades.push('Diversificar fuentes de ingreso.');
    }

    if (topIngresosProjects.length > 0) {
        oportunidades.push(`"${topIngresosProjects[0].name}" es el proyecto más rentable.`);
    }

    if (responsablesList.length > 0) {
        oportunidades.push(`${responsablesList[0].name} es el responsable más activo.`);
    }

    // CSS styles - ISOLATED & DIRECT COLORS
    // Usamos prefijo 'rep-' para evitar conflictos con el dashboard oscuro
    const styles = `
        <style>
            #rep-container-temp {
                font-family: Arial, Helvetica, sans-serif !important;
                background: #ffffff !important;
                color: #333333 !important;
                line-height: 1.4 !important;
                -webkit-font-smoothing: antialiased;
            }
            
            .rep-page { 
                width: 210mm;
                min-height: 297mm;
                padding: 15mm;
                background: #ffffff !important;
                position: relative;
                overflow: hidden;
                page-break-after: always;
                box-sizing: border-box;
            }
            
            .rep-page * { box-sizing: border-box; }
            
            .rep-page:last-child { page-break-after: avoid; }
            
            /* Header */
            .rep-header {
                background: linear-gradient(135deg, #1e3a5f 0%, #2980b9 100%) !important;
                color: #ffffff !important;
                padding: 20px 25px;
                border-radius: 10px;
                margin-bottom: 25px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .rep-title { font-size: 24pt; font-weight: bold; margin-bottom: 5px; color: white !important; }
            .rep-subtitle { font-size: 14pt; opacity: 0.9; color: white !important; }
            
            .rep-meta-row {
                display: flex;
                justify-content: space-between;
                margin-top: 15px;
                padding-top: 12px;
                border-top: 1px solid rgba(255,255,255,0.3);
            }
            
            .rep-meta-item { text-align: center; }
            .rep-meta-label { font-size: 8pt; opacity: 0.8; text-transform: uppercase; color: white !important; }
            .rep-meta-value { font-size: 12pt; font-weight: bold; color: white !important; }
            
            /* Typography */
            .rep-h2 { 
                font-size: 16pt;
                color: #1e3a5f !important;
                margin: 25px 0 15px;
                padding-bottom: 8px;
                border-bottom: 3px solid #f5a623;
                display: inline-block;
                font-weight: bold;
            }
            
            .rep-h3 { 
                font-size: 12pt; 
                color: #2c3e50 !important; 
                margin: 15px 0 10px; 
                font-weight: bold; 
            }
            
            /* KPI Grid */
            .rep-grid-4 { display: flex; gap: 15px; margin: 15px 0; }
            .rep-card {
                flex: 1;
                background: #f8f9fa !important;
                border-radius: 12px;
                padding: 15px;
                text-align: center;
                border-left: 5px solid #1e3a5f;
                box-shadow: none !important;
            }
            
            .rep-card.blue { border-left-color: #2980b9 !important; }
            .rep-card.green { border-left-color: #27ae60 !important; }
            .rep-card.red { border-left-color: #e74c3c !important; }
            .rep-card.yellow { border-left-color: #f5a623 !important; }
            
            .rep-card-icon { font-size: 24px; margin-bottom: 10px; display: block; }
            .rep-card-val { font-size: 18pt; font-weight: bold; color: #2c3e50 !important; display: block; }
            .rep-card-lbl { font-size: 9pt; color: #666 !important; text-transform: uppercase; margin-top: 5px; display: block; }
            
            /* Chart Area */
            .rep-chart-box {
                background: #f8f9fa !important;
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
            }
            
            .rep-chart-bars {
                display: flex;
                align-items: flex-end;
                justify-content: space-around;
                height: 180px;
                padding-bottom: 10px;
                border-bottom: 2px solid #ddd;
            }
            
            .rep-bar-group {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                height: 100%;
                justify-content: flex-end;
            }
            
            .rep-bars-pair {
                display: flex;
                align-items: flex-end;
                gap: 5px;
                height: 100%;
                justify-content: center;
                width: 100%;
            }
            
            .rep-bar {
                width: 25px;
                border-radius: 4px 4px 0 0;
            }
            .rep-bar.in { background: #27ae60 !important; }
            .rep-bar.out { background: #e74c3c !important; }
            
            .rep-bar-lbl { font-size: 8pt; margin-top: 8px; color: #555 !important; text-align: center; }
            
            .rep-legend {
                display: flex;
                justify-content: center;
                gap: 30px;
                margin-top: 15px;
            }
            .rep-legend-item { display: flex; align-items: center; gap: 8px; font-size: 10pt; color: #333 !important; }
            .rep-dot { width: 12px; height: 12px; border-radius: 3px; }
            .rep-dot.in { background: #27ae60 !important; }
            .rep-dot.out { background: #e74c3c !important; }
            
            /* Tables */
            .rep-table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
                font-size: 9pt;
            }
            
            .rep-table th {
                background: #1e3a5f !important;
                color: #ffffff !important;
                padding: 10px;
                text-align: left;
                font-weight: bold;
            }
            
            .rep-table td {
                padding: 10px;
                border-bottom: 1px solid #eee;
                color: #333 !important;
            }
            
            .rep-table tr:nth-child(even) { background: #f9f9f9 !important; }
            
            .txt-green { color: #27ae60 !important; font-weight: bold; }
            .txt-red { color: #e74c3c !important; font-weight: bold; }
            
            /* Layouts */
            .rep-cols-2 { display: flex; gap: 20px; }
            .rep-col { flex: 1; }
            
            /* Info Box */
            .rep-info {
                padding: 15px;
                border-radius: 8px;
                background: #eef2f7 !important;
                border-left: 5px solid #2980b9;
                margin: 15px 0;
                color: #333 !important;
            }
            .rep-info.success { border-color: #27ae60; background: #e8f8f5 !important; }
            .rep-info.danger { border-color: #e74c3c; background: #fdedec !important; }
            
            /* Timeline */
            .rep-timeline { display: flex; gap: 10px; margin: 20px 0; overflow: hidden; }
            .rep-time-item {
                flex: 1;
                background: #f8f9fa !important;
                border-top: 4px solid #f5a623;
                padding: 10px 5px;
                text-align: center;
            }
            .rep-time-m { font-weight: bold; color: #1e3a5f !important; font-size: 9pt; display: block; }
            .rep-time-v { font-weight: bold; font-size: 11pt; margin: 5px 0; display: block; color: #333 !important; }
            
            /* Conclusiones */
            .rep-concl-grid { display: flex; gap: 15px; margin: 20px 0; }
            .rep-concl-card {
                flex: 1;
                padding: 15px;
                background: #f8f9fa !important;
                border-radius: 8px;
            }
            .rep-concl-card.risk { border-left: 5px solid #e74c3c; }
            .rep-concl-card.opp { border-left: 5px solid #27ae60; }
            .rep-concl-card.act { border-left: 5px solid #2980b9; }
            
            /* Footer */
            .rep-footer {
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 15px;
                margin-top: 30px;
                color: #999 !important;
                font-size: 9pt;
            }
            
            /* Cover specific */
            .rep-cover-flex {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 250mm;
                text-align: center;
            }
            
            .rep-cover-badge {
                background: #f5a623 !important;
                color: #1e3a5f !important;
                padding: 10px 30px;
                border-radius: 30px;
                font-weight: bold;
                margin-bottom: 30px;
                display: inline-block;
            }
            
            .rep-cover-title { font-size: 36pt; font-weight: 800; color: #1e3a5f !important; margin: 0; }
            .rep-cover-sub { font-size: 18pt; color: #2980b9 !important; margin: 10px 0 40px; }
            
            .rep-cover-box {
                background: #1e3a5f !important;
                color: white !important;
                padding: 30px 50px;
                border-radius: 15px;
                margin: 20px 0;
            }
        </style>
    `;



    // Generate bar chart for monthly data
    // Generate bar chart
    const maxValue = Math.max(
        ...sortedMonths.map(m => Math.max(byMonth[m].ingresos, byMonth[m].egresos))
    ) || 1;

    const chartHtml = sortedMonths.map(month => {
        const data = byMonth[month];
        const [year, m] = month.split('-');
        const monthName = getMonthName(m).substring(0, 3);

        const hIn = Math.max(5, (data.ingresos / maxValue) * 100);
        const hOut = Math.max(5, (data.egresos / maxValue) * 100);

        return `
            <div class="rep-bar-group">
                <div class="rep-bars-pair">
                    <div class="rep-bar in" style="height: ${hIn}%"></div>
                    <div class="rep-bar out" style="height: ${hOut}%"></div>
                </div>
                <div class="rep-bar-lbl">${monthName} ${year.slice(2)}</div>
            </div>
        `;
    }).join('');

    // --- CONSTRUCTION OF PAGES (Using new isolated classes) ---

    // 1. Cover
    const page1 = `
        <div class="rep-page">
            <div class="rep-cover-flex">
                <div class="rep-cover-badge">REPORTE FINANCIERO</div>
                <h1 class="rep-cover-title">REPORTE EJECUTIVO</h1>
                <div class="rep-cover-sub">Análisis de Flujo de Dinero</div>
                
                <div class="rep-cover-box">
                    <div style="font-size: 20pt; font-weight: bold;">INGENIA - CEDIPRO UNSA</div>
                    <div style="font-size: 14pt; opacity: 0.9; margin-top: 5px;">Dirección de Logística y Finanzas</div>
                </div>
                
                <div class="rep-grid-4" style="margin-top: 40px; width: 100%; gap: 30px;">
                    <div class="rep-card yellow">
                        <span class="rep-card-val">${formatCurrency(totals.saldo)}</span>
                        <span class="rep-card-lbl">Saldo Actual</span>
                    </div>
                    <div class="rep-card blue">
                        <span class="rep-card-val">${totals.count}</span>
                        <span class="rep-card-lbl">Transacciones</span>
                    </div>
                    <div class="rep-card blue">
                        <span class="rep-card-val">${sortedMonths.length}</span>
                        <span class="rep-card-lbl">Meses</span>
                    </div>
                </div>

                <div style="margin-top: 50px; color: #777; font-size: 10pt;">
                    <strong>Periodo:</strong> ${firstDate} — ${lastDate}<br>
                    <strong>Generado:</strong> ${new Date().toLocaleDateString('es-PE')}
                </div>
            </div>
        </div>
    `;

    // 2. Summary
    const page2 = `
        <div class="rep-page">
            <div class="rep-header">
                <div class="rep-title">Resumen Ejecutivo</div>
                <div class="rep-subtitle">Panorama General Financiero</div>
                <div class="rep-meta-row">
                    <div class="rep-meta-item">
                        <div class="rep-meta-label">Periodo</div>
                        <div class="rep-meta-value">${firstDate} - ${lastDate}</div>
                    </div>
                    <div class="rep-meta-item">
                        <div class="rep-meta-label">Flujo Total</div>
                        <div class="rep-meta-value">${formatCurrency(totals.ingresos + totals.egresos)}</div>
                    </div>
                </div>
            </div>

            <div class="rep-h2">Indicadores Clave</div>
            <div class="rep-grid-4">
                <div class="rep-card blue">
                    <span class="rep-card-icon">💰</span>
                    <span class="rep-card-val">${formatCurrency(totals.saldo)}</span>
                    <span class="rep-card-lbl">Saldo</span>
                </div>
                <div class="rep-card green">
                    <span class="rep-card-icon">📈</span>
                    <span class="rep-card-val">${formatCurrency(totals.ingresos)}</span>
                    <span class="rep-card-lbl">Ingresos</span>
                </div>
                <div class="rep-card red">
                    <span class="rep-card-icon">📉</span>
                    <span class="rep-card-val">${formatCurrency(totals.egresos)}</span>
                    <span class="rep-card-lbl">Egresos</span>
                </div>
            </div>

            <div class="rep-h2">Dinámica Mensual</div>
            <div class="rep-chart-box">
                <div style="font-weight: bold; color: #1e3a5f; margin-bottom: 15px;">📊 Comparativa Ingresos vs Egresos</div>
                <div class="rep-chart-bars">
                    ${chartHtml}
                </div>
                <div class="rep-legend">
                    <div class="rep-legend-item"><div class="rep-dot in"></div> Ingresos</div>
                    <div class="rep-legend-item"><div class="rep-dot out"></div> Egresos</div>
                </div>
            </div>

            <div class="rep-info ${ratio < 80 ? 'success' : 'danger'}">
                <strong>Diagnóstico Rápido:</strong> El ratio de gasto es del <strong>${ratio}%</strong>.
                ${ratio < 80 ? 'La salud financiera es positiva.' : 'Se recomienda revisar los egresos.'}
            </div>

            <div class="rep-footer">INGENIA - CEDIPRO UNSA | Pág. 1</div>
        </div>
    `;

    // 3. Projects
    const page3 = `
        <div class="rep-page">
            <div class="rep-header" style="background: linear-gradient(135deg, #27ae60 0%, #1abc9c 100%) !important;">
                <div class="rep-title">Detalle por Proyectos</div>
                <div class="rep-subtitle">Análisis de Rentabilidad y Gastos</div>
            </div>

            <div class="rep-cols-2">
                <div class="rep-col">
                    <div class="rep-h3">🏆 Top Ingresos</div>
                    <table class="rep-table">
                        <thead><tr><th>Proyecto</th><th>Monto</th></tr></thead>
                        <tbody>
                            ${topIngresosProjects.slice(0, 5).map(p => `
                                <tr><td>${truncateText(p.name, 25)}</td><td class="txt-green">${formatCurrency(p.ingresos)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="rep-col">
                    <div class="rep-h3">📉 Mayor Gasto</div>
                    <table class="rep-table">
                        <thead><tr><th>Proyecto</th><th>Monto</th></tr></thead>
                        <tbody>
                            ${topEgresosProjects.slice(0, 5).map(p => `
                                <tr><td>${truncateText(p.name, 25)}</td><td class="txt-red">${formatCurrency(p.egresos)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="rep-h2">Evolución del Saldo Mensual</div>
            <div class="rep-timeline">
                ${sortedMonths.map(month => {
        const d = byMonth[month];
        return `
                        <div class="rep-time-item">
                            <span class="rep-time-m">${getMonthName(month.split('-')[1]).substring(0, 3)}</span>
                            <span class="rep-time-v" style="color:${d.saldo >= 0 ? '#27ae60' : '#e74c3c'}!important">${formatCurrency(d.saldo)}</span>
                        </div>
                    `;
    }).join('')}
            </div>

            ${projectsInRed.length > 0 ? `
                <div class="rep-info danger">
                    <strong>⚠️ Atención Requerida:</strong> ${projectsInRed.length} proyectos presentan déficit.
                    <br><small>${projectsInRed.map(p => p.name).join(', ')}</small>
                </div>
            `: '<div class="rep-info success">✅ Todos los proyectos tienen saldo positivo.</div>'}

            <div class="rep-footer">INGENIA - CEDIPRO UNSA | Pág. 2</div>
        </div>
    `;

    // 4. Conclusions
    const page4 = `
        <div class="rep-page">
            <div class="rep-header" style="background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%) !important;">
                <div class="rep-title">Conclusiones Finales</div>
                <div class="rep-subtitle">Recomendaciones Estratégicas</div>
            </div>

            <div class="rep-concl-grid">
                <div class="rep-concl-card risk">
                    <div class="rep-h3" style="color:#e74c3c!important">⚠️ Riesgos</div>
                    <div style="font-size:9pt; color:#444;">${riesgos.length ? riesgos.join('<br>• ') : 'Sin riesgos críticos.'}</div>
                </div>
                <div class="rep-concl-card opp">
                    <div class="rep-h3" style="color:#27ae60!important">💡 Oportunidades</div>
                    <div style="font-size:9pt; color:#444;">${oportunidades.length ? oportunidades.join('<br>• ') : 'Continuar optimizando.'}</div>
                </div>
                <div class="rep-concl-card act">
                    <div class="rep-h3" style="color:#2980b9!important">📋 Acciones</div>
                    <div style="font-size:9pt; color:#444;">${acciones.map((a, i) => `${i + 1}. ${a}`).join('<br>')}</div>
                </div>
            </div>

            <div class="rep-info" style="text-align:center; margin-top:50px; background:#fff!important; border:none;">
                <div style="font-size: 14pt; font-weight:bold; color:#1e3a5f; margin-bottom:10px;">Fin del Reporte</div>
                Este documento fue generado automáticamente por el sistema financiero de Ingenia.
            </div>
            
            <div class="rep-footer">INGENIA - CEDIPRO UNSA | Pág. 3</div>
        </div>
    `;

    // --- HTML PDF GENERATION ---
    const fullHtml = styles + page1 + page2 + page3 + page4;

    // Button handling
    const btn = document.getElementById('export-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Generando PDF...</span>';
    }

    // Create a temporary container visible in the DOM but absolutely positioned
    const container = document.createElement('div');
    container.id = 'rep-container-temp';
    container.innerHTML = fullHtml;

    // Scroll top y asegurar fondo oscuro para contraste
    window.scrollTo(0, 0);

    Object.assign(container.style, {
        position: 'absolute', // Absolute para permitir flujo hacia abajo
        top: '0',
        left: '0',
        width: '100%',
        zIndex: '9999',
        background: 'rgba(50, 50, 50, 0.95)', // Fondo oscuro para resaltar el papel
        paddingBottom: '50px'
    });

    // Contenedor interno para el contenido A4 centrado
    const innerContainer = document.createElement('div');
    innerContainer.innerHTML = fullHtml;
    Object.assign(innerContainer.style, {
        width: '210mm',
        minHeight: '297mm', // Altura mínima A4
        background: '#ffffff', // Fondo BLANCO
        margin: '20px auto', // Centrado
        boxShadow: '0 0 30px rgba(0,0,0,0.5)',
        position: 'relative' // Contexto de posicionamiento
    });

    container.innerHTML = ''; // Limpiar fullHtml crudo anterior
    container.appendChild(innerContainer);

    document.body.appendChild(container);

    const opt = {
        margin: 0,
        filename: `Reporte_Ejecutivo_${formatDateForFile(new Date())}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: true, // Activar logs
            backgroundColor: '#ffffff',
            windowWidth: 1200 // Forzar ancho
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'css', after: '.rep-page' }
    };

    html2pdf()
        .set(opt)
        .from(innerContainer) // Renderizar el contenedor interno

        .save()
        .then(() => {
            document.body.removeChild(container);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-pdf"></i> <span>Exportar PDF</span>';
            }

            const toast = document.createElement('div');
            toast.className = 'toast show';
            toast.innerHTML = '<i class="fas fa-check-circle"></i> PDF Generado Exitosamente';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        })
        .catch(err => {
            console.error('PDF Error:', err);
            document.body.removeChild(container);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-pdf"></i> <span>Exportar PDF</span>';
            }
            alert('Error generando PDF: ' + err.message);
        });
}

function exportToPDF() {
    generateCompleteReport();
}


// ============================================
function formatCurrency(value) {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        minimumFractionDigits: 2
    }).format(value);
}

function formatDateForFile(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getMonthName(monthNum) {
    const months = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
    };
    return months[monthNum] || monthNum;
}

function hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    setTimeout(() => loadingScreen.style.display = 'none', 500);
}

function showError(message) {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.querySelector('.loader-text').textContent = message;
    loadingScreen.querySelector('.loader-ring').style.borderTopColor = '#ef4444';
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-update-time').textContent = `Actualizado: ${timeString}`;
}

function startAutoRefresh() {
    setInterval(async () => {
        try {
            await fetchData();
            applyFiltersAndRender();
            updateLastUpdateTime();
            console.log('Dashboard auto-refreshed at', new Date().toLocaleTimeString());
        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }, CONFIG.REFRESH_INTERVAL);
}
