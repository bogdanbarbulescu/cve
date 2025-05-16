document.addEventListener('DOMContentLoaded', function() {
    // Elemente DOM principale
    const navItems = document.querySelectorAll('.nav-menu .nav-item');
    const pageContents = document.querySelectorAll('.main-content .page-content');
    const pageTitleElement = document.querySelector('.main-content .page-title h1');
    const refreshButton = document.querySelector('.main-content .page-title .refresh-btn');

    // Referințe la grafice (vor fi inițializate)
    window.severityChart = null;
    window.trendsChart = null;
    window.customReportChart = null;

    // Starea curentă a aplicației (pentru filtre, paginare etc.)
    let appState = {
        dashboard: {
            currentPage: 1,
            limit: 6, // Va fi actualizat din setări
            cveIdSearch: '',
            severityFilter: 'ALL',
        },
        cvedb: {
            currentPage: 1,
            limit: 10, // Va fi actualizat din setări
            filters: {},
            sortBy: 'published_date',
            sortOrder: 'DESC',
        },
        settings: { // Valori default pentru setări
            email: 'admin@exemplu.ro',
            notifyCritical: true,
            notifyHigh: true,
            notifyMedium: false,
            notifyLow: false,
            darkMode: 'auto', // 'auto', 'light', 'dark'
            itemsPerPage: 10,
        }
    };

    // Elemente DOM pentru tema
    const themeToggleButton = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleButton ? themeToggleButton.querySelector('i') : null;
    const settingsDarkModeSelect = document.getElementById('setting-dark-mode');


    // --- FUNCȚII UTILITARE ---
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) {
            return dateString;
        }
    }

    function generateDummyCve(index) {
        const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
        const products = ['Windows Server', 'Apache Tomcat', 'Oracle Database', 'Spring Boot', 'WordPress', 'Cisco IOS', 'Linux Kernel'];
        const statuses = ['Nerezolvat', 'În lucru', 'Rezolvat'];
        const descriptions = [
            'Buffer Overflow in System Component leading to RCE.',
            'Cross-Site Scripting (XSS) in web interface.',
            'SQL Injection vulnerability in authentication module.',
            'Denial of Service (DoS) in network stack.',
            'Arbitrary File Read via misconfigured endpoint.',
            'Privilege Escalation through insecure service.'
        ];
        const today = new Date();
        const publishedDate = new Date(today);
        publishedDate.setDate(today.getDate() - (index % 30));

        return {
            cve_id: `CVE-${publishedDate.getFullYear()}-${String(10000 + index).padStart(5, '0')}`,
            description: descriptions[index % descriptions.length],
            severity: severities[index % severities.length],
            product: products[index % products.length],
            cvss_score: Math.min(10, Math.max(0, (index % 100) / 10 + Math.random() * 0.9)).toFixed(1),
            published_date: publishedDate.toISOString(),
            last_modified_date: new Date(publishedDate.getTime() + (Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
            status: statuses[index % statuses.length]
        };
    }

    let allDummyCves = Array.from({ length: 150 }, (_, i) => generateDummyCve(i + 1));

    // --- MANAGEMENT TEMĂ (LIGHT/DARK) ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeIcon) {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
            }
        } else {
            document.body.classList.remove('dark-theme');
            if (themeIcon) {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
            }
        }
        updateChartThemes(theme); // Actualizează tema graficelor
    }

    function updateChartThemes(theme) {
        const isDark = theme === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const ticksColor = isDark ? '#bdc3c7' : '#7f8c8d';
        const legendColor = isDark ? '#ecf0f1' : '#2c3e50';
        const titleColor = isDark ? '#ecf0f1' : '#2c3e50';

        function updateChartOptions(chartInstance) {
            if (chartInstance && chartInstance.options) {
                if (chartInstance.options.scales) {
                    Object.values(chartInstance.options.scales).forEach(scale => {
                        if (scale.ticks) scale.ticks.color = ticksColor;
                        if (scale.grid) scale.grid.color = gridColor;
                        if (scale.title && scale.title.display) scale.title.color = titleColor;
                    });
                }
                if (chartInstance.options.plugins) {
                    if (chartInstance.options.plugins.legend && chartInstance.options.plugins.legend.labels) {
                        chartInstance.options.plugins.legend.labels.color = legendColor;
                    }
                    if (chartInstance.options.plugins.title && chartInstance.options.plugins.title.display) {
                         chartInstance.options.plugins.title.color = titleColor;
                    }
                }
                chartInstance.update('none'); // 'none' pentru a evita animația la schimbarea temei
            }
        }
        updateChartOptions(window.severityChart);
        updateChartOptions(window.trendsChart);
        updateChartOptions(window.customReportChart);
    }

    function toggleTheme() {
        const isCurrentlyDark = document.body.classList.contains('dark-theme');
        const newTheme = isCurrentlyDark ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme); // Salvează tema efectivă
        applyTheme(newTheme);
        if (settingsDarkModeSelect) settingsDarkModeSelect.value = newTheme; // Sincronizează cu select-ul din setări (nu 'auto')
    }

    function loadThemePreference() {
        const savedSetting = appState.settings.darkMode; // 'auto', 'light', sau 'dark'
        const savedEffectiveTheme = localStorage.getItem('theme'); // 'light' sau 'dark'
        let themeToApply = 'light';

        if (savedEffectiveTheme) { // Prioritizează tema efectivă salvată (ultima aplicată)
            themeToApply = savedEffectiveTheme;
        } else if (savedSetting === 'dark') {
            themeToApply = 'dark';
        } else if (savedSetting === 'auto') {
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (systemPrefersDark) {
                themeToApply = 'dark';
            }
        }
        // else rămâne 'light'

        applyTheme(themeToApply);
        if (settingsDarkModeSelect) settingsDarkModeSelect.value = savedSetting; // Setează select-ul la preferința salvată
    }


    // --- INIȚIALIZARE GRAFICE ---
    function initCharts() {
        Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        Chart.defaults.plugins.legend.labels.boxWidth = 12;
        Chart.defaults.plugins.legend.labels.padding = 15;

        const severityCtx = document.getElementById('severityChart')?.getContext('2d');
        if (severityCtx && !window.severityChart) {
            window.severityChart = new Chart(severityCtx, {
                type: 'bar', data: { labels: [], datasets: [{ data: [] }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 11 }, titleFont: {size: 13} } },
                    scales: { x: { beginAtZero: true }, y: {} } // Culorile vor fi setate de updateChartThemes
                }
            });
        }

        const trendsCtx = document.getElementById('trendsChart')?.getContext('2d');
        if (trendsCtx && !window.trendsChart) {
            window.trendsChart = new Chart(trendsCtx, {
                type: 'line', data: { labels: [], datasets: [{}, {}] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } }, tooltip: { bodyFont: { size: 11 }, titleFont: {size: 13} } },
                    scales: { y: { beginAtZero: true }, x: {} },
                    interaction: { intersect: false, mode: 'index' },
                }
            });
        }

        const reportCtx = document.getElementById('customReportChart')?.getContext('2d');
        if (reportCtx && !window.customReportChart) {
            window.customReportChart = new Chart(reportCtx, {
                type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { usePointStyle: true } }, tooltip: { bodyFont: { size: 11 }, titleFont: {size: 13} } }
                }
            });
        }
        loadThemePreference(); // Aplică tema după ce graficele sunt create
    }

    // --- MANAGEMENT PAGINI ---
    function showPage(pageId, title) {
        pageContents.forEach(content => content.classList.remove('active'));
        const activePage = document.getElementById(pageId + '-page');
        if (activePage) {
            activePage.classList.add('active');
            if (pageTitleElement) pageTitleElement.textContent = title;
        }
    }

    function loadPageData(pageId) {
        console.log(`Încărcare date pentru pagina: ${pageId}`);
        // Actualizează limitele din starea paginilor pe baza setărilor
        appState.dashboard.limit = appState.settings.itemsPerPage;
        appState.cvedb.limit = appState.settings.itemsPerPage;

        switch (pageId) {
            case 'dashboard': loadDashboardData(); break;
            case 'cvedb': loadCveDatabasePageData(); break;
            case 'reports': loadReportsPageData(); break;
            case 'notifications': loadNotificationsPageData(); break;
            case 'settings': loadSettingsPageData(); break;
        }
    }

    // --- FUNCȚII DE ÎNCĂRCARE DATE (CU VALORI DUMMY) ---

    function loadDashboardData() {
        console.log("Populare Dashboard cu date dummy...");
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(1) .stat-value').textContent = '1,758';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(1) .trend-text').textContent = '+43 (ultimele 7 zile)';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(2) .stat-value').textContent = '24';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(2) .trend-text').textContent = '+8 (ultimele 7 zile)';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(3) .stat-value').textContent = '387';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(3) .trend-text').textContent = '-12 (ultimele 7 zile)';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(4) .stat-value').textContent = '76%';
        document.querySelector('#dashboard-page .stats-cards .stat-card:nth-child(4) .trend-text').textContent = '+2.3% (ultimele 7 zile)';

        if (window.severityChart) {
            window.severityChart.data.labels = ['Critical', 'High', 'Medium', 'Low', 'Unknown'];
            window.severityChart.data.datasets = [{
                data: [24, 87, 153, 123, 30],
                backgroundColor: ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#95a5a6'],
                borderWidth: 0, barPercentage: 0.7, categoryPercentage: 0.8
            }];
            window.severityChart.update();
        }

        if (window.trendsChart) {
            const trendLabels = ['7 Mai', '8 Mai', '9 Mai', '10 Mai', '11 Mai', '12 Mai', '13 Mai'];
            window.trendsChart.data.labels = trendLabels;
            window.trendsChart.data.datasets = [
                {
                    label: 'CVE-uri noi', data: [12, 19, 8, 15, 23, 17, 14],
                    borderColor: 'var(--primary)', backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4, fill: true, pointBackgroundColor: 'var(--primary)', pointBorderColor: '#fff', pointHoverRadius: 6, pointRadius: 4,
                },
                {
                    label: 'CVE-uri rezolvate', data: [7, 11, 13, 8, 9, 12, 15],
                    borderColor: 'var(--success)', backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    tension: 0.4, fill: true, pointBackgroundColor: 'var(--success)', pointBorderColor: '#fff', pointHoverRadius: 6, pointRadius: 4,
                }
            ];
            window.trendsChart.update();
        }

        const dashboardState = appState.dashboard;
        let filteredCves = [...allDummyCves];
        if (dashboardState.cveIdSearch) {
            filteredCves = filteredCves.filter(cve => cve.cve_id.toLowerCase().includes(dashboardState.cveIdSearch.toLowerCase()));
        }
        if (dashboardState.severityFilter !== 'ALL') {
            filteredCves = filteredCves.filter(cve => cve.severity === dashboardState.severityFilter);
        }
        filteredCves.sort((a,b) => new Date(b.published_date) - new Date(a.published_date));

        renderCveTable(
            '#dashboardCveTable tbody', '#dashboardPagination', filteredCves,
            dashboardState.currentPage, dashboardState.limit,
            (newPage) => { dashboardState.currentPage = newPage; loadDashboardData(); },
            false
        );
    }

    function loadCveDatabasePageData() {
        console.log("Populare Bază de date CVE cu date dummy...");
        const cvedbState = appState.cvedb;
        let filteredCves = [...allDummyCves];

        if (cvedbState.filters.searchId) filteredCves = filteredCves.filter(cve => cve.cve_id.toLowerCase().includes(cvedbState.filters.searchId.toLowerCase()));
        if (cvedbState.filters.severity) filteredCves = filteredCves.filter(cve => cve.severity === cvedbState.filters.severity);
        if (cvedbState.filters.product) filteredCves = filteredCves.filter(cve => cve.product.toLowerCase().includes(cvedbState.filters.product.toLowerCase()));
        if (cvedbState.filters.status) filteredCves = filteredCves.filter(cve => cve.status === cvedbState.filters.status);
        if (cvedbState.filters.dateStart) filteredCves = filteredCves.filter(cve => new Date(cve.published_date) >= new Date(cvedbState.filters.dateStart));
        if (cvedbState.filters.dateEnd) filteredCves = filteredCves.filter(cve => new Date(cve.published_date) <= new Date(cvedbState.filters.dateEnd));
        if (cvedbState.filters.cvssMin) filteredCves = filteredCves.filter(cve => parseFloat(cve.cvss_score) >= parseFloat(cvedbState.filters.cvssMin));
        if (cvedbState.filters.cvssMax) filteredCves = filteredCves.filter(cve => parseFloat(cve.cvss_score) <= parseFloat(cvedbState.filters.cvssMax));

        filteredCves.sort((a, b) => {
            let valA = a[cvedbState.sortBy]; let valB = b[cvedbState.sortBy];
            if (cvedbState.sortBy === 'published_date' || cvedbState.sortBy === 'last_modified_date') { valA = new Date(valA); valB = new Date(valB); }
            else if (cvedbState.sortBy === 'cvss_score') { valA = parseFloat(valA); valB = parseFloat(valB); }
            else if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            if (valA < valB) return cvedbState.sortOrder === 'ASC' ? -1 : 1;
            if (valA > valB) return cvedbState.sortOrder === 'ASC' ? 1 : -1;
            return 0;
        });

        renderCveTable(
            '#cvedb-table tbody', '#cvedb-pagination', filteredCves,
            cvedbState.currentPage, cvedbState.limit,
            (newPage) => { cvedbState.currentPage = newPage; loadCveDatabasePageData(); },
            true
        );
    }

    function loadReportsPageData() {
        console.log("Populare Rapoarte & Analize cu date dummy...");
        const reportType = document.getElementById('report-type')?.value || 'severity_summary';
        const reportPeriod = document.getElementById('report-period')?.value || 'last_30_days';
        let reportTitle = "Rezultate Raport";

        if (window.customReportChart) {
            let chartType = 'bar'; let labels = []; let data = []; let backgroundColors = [];
            if (reportType === 'severity_summary') {
                reportTitle = `Sumar Severități (${reportPeriod.replace(/_/g, ' ')})`; chartType = 'pie';
                labels = ['Critical', 'High', 'Medium', 'Low']; data = [10, 25, 40, 25];
                backgroundColors = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71'];
            } else if (reportType === 'vulnerable_products') {
                reportTitle = `Top Produse Vulnerabile (${reportPeriod.replace(/_/g, ' ')})`; chartType = 'bar';
                labels = ['Produs A', 'Produs B', 'Produs C', 'Produs D', 'Produs E']; data = [30, 22, 18, 15, 10];
                backgroundColors = 'rgba(52, 152, 219, 0.7)';
            } else if (reportType === 'remediation_status') {
                reportTitle = `Status Remediere (${reportPeriod.replace(/_/g, ' ')})`; chartType = 'doughnut';
                labels = ['Rezolvat', 'Nerezolvat', 'În lucru']; data = [60, 25, 15];
                backgroundColors = ['#2ecc71', '#e74c3c', '#3498db'];
            }
            document.getElementById('customReportChartTitle').textContent = reportTitle;
            window.customReportChart.config.type = chartType;
            window.customReportChart.data.labels = labels;
            window.customReportChart.data.datasets = [{
                label: reportTitle, data: data, backgroundColor: backgroundColors,
                borderColor: chartType === 'bar' ? backgroundColors : (document.body.classList.contains('dark-theme') ? '#2c3e50' : '#fff'), // Contextual border color
                borderWidth: chartType === 'bar' ? 0 : 2,
            }];
            window.customReportChart.update();
        }
    }

    function loadNotificationsPageData() {
        console.log("Populare Notificări cu date dummy...");
        const notificationsList = document.querySelector('#notifications-page .notifications-list');
        if (!notificationsList) return;
        const dummyNotifications = [
            { id: 1, title: "CVE Nou Critic: CVE-2025-DUMMY1", message: "Un nou CVE critic a fost adăugat pentru produsul DemoApp.", type: "critical", is_read: false, created_at: new Date(Date.now() - 5 * 60000) },
            { id: 2, title: "Actualizare Sistem", message: "Sistemul de monitorizare va fi actualizat mâine la 03:00 AM.", type: "info", is_read: true, created_at: new Date(Date.now() - 86400000) },
            { id: 3, title: "Alertă Severitate High: CVE-2025-DUMMY2", message: "Vulnerabilitate high detectată în Modulul X.", type: "high", is_read: false, created_at: new Date(Date.now() - 2 * 3600000) },
            { id: 4, title: "Remediere Aplicată", message: "CVE-2024-OLD CVE a fost marcat ca rezolvat.", type: "success", is_read: true, created_at: new Date(Date.now() - 3 * 86400000) },
        ];
        notificationsList.innerHTML = '';
        if (dummyNotifications.length === 0) {
            notificationsList.innerHTML = `<li class="notification-item placeholder"><div class="notification-content"><p class="notification-message">Nu există notificări.</p></div></li>`; return;
        }
        dummyNotifications.forEach(notif => {
            const item = document.createElement('li'); item.classList.add('notification-item');
            if (!notif.is_read) item.classList.add('unread');
            const timeAgo = Math.round((Date.now() - new Date(notif.created_at).getTime()) / 60000);
            let timeText = `${timeAgo} min în urmă`;
            if (timeAgo >= 60) timeText = `${Math.round(timeAgo/60)} ore în urmă`;
            if (timeAgo >= 24*60) timeText = `${Math.round(timeAgo/(24*60))} zile în urmă`;
            item.innerHTML = `
                <div class="notification-icon"><i class="fas fa-${notif.type === 'critical' ? 'exclamation-triangle' : (notif.type === 'high' ? 'exclamation-circle' : (notif.type === 'info' ? 'info-circle' : 'check-circle'))} ${notif.type}"></i></div>
                <div class="notification-content">
                    <span class="notification-title">${notif.title}</span>
                    <p class="notification-message">${notif.message}</p>
                    <span class="notification-time">${timeText}</span>
                </div>
                <button class="action-btn small-btn mark-notification-read" data-id="${notif.id}" title="${notif.is_read ? 'Citit' : 'Marchează ca citit'}">
                    <i class="fas ${notif.is_read ? 'fa-check-double' : 'fa-check'}"></i>
                </button>`;
            notificationsList.appendChild(item);
        });
        addNotificationActionListeners();
    }

    function loadSettingsPageData() {
        console.log("Populare Setări...");
        document.getElementById('setting-email').value = appState.settings.email;
        document.getElementById('notify-critical').checked = appState.settings.notifyCritical;
        document.getElementById('notify-high').checked = appState.settings.notifyHigh;
        document.getElementById('notify-medium').checked = appState.settings.notifyMedium;
        document.getElementById('notify-low').checked = appState.settings.notifyLow;
        document.getElementById('setting-dark-mode').value = appState.settings.darkMode;
        document.getElementById('setting-items-per-page').value = appState.settings.itemsPerPage;
    }

    // --- FUNCȚII DE RENDERING (TABEL, PAGINARE) ---
    function renderCveTable(tableBodySelector, paginationSelector, cveArray, currentPage, limit, pageChangeCallback, showExtraColumns = false) {
        const tableBody = document.querySelector(tableBodySelector); if (!tableBody) return;
        tableBody.innerHTML = '';
        const startIndex = (currentPage - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedCves = cveArray.slice(startIndex, endIndex);
        if (paginatedCves.length === 0) {
            const colspan = showExtraColumns ? 9 : 7;
            tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;">Nu s-au găsit CVE-uri conform filtrelor.</td></tr>`;
        } else {
            paginatedCves.forEach(cve => {
                const severityClass = cve.severity?.toLowerCase() || 'unknown';
                let statusClean = cve.status?.toLowerCase().replace(/\s+/g, '-');
                const statusClass = statusClean || 'unknown';
                const row = `
                    <tr>
                        <td>${cve.cve_id || 'N/A'}</td>
                        <td title="${cve.description || ''}">${(cve.description || 'N/A').substring(0, 70)}${(cve.description || '').length > 70 ? '...' : ''}</td>
                        <td><span class="severity ${severityClass}">${cve.severity || 'N/A'}</span></td>
                        <td>${cve.product || 'N/A'}</td>
                        ${showExtraColumns ? `<td>${cve.cvss_score !== null ? cve.cvss_score : 'N/A'}</td>` : ''}
                        <td>${formatDate(cve.published_date)}</td>
                        ${showExtraColumns ? `<td>${formatDate(cve.last_modified_date)}</td>` : ''}
                        <td><span class="status ${statusClass}">${cve.status || 'N/A'}</span></td>
                        <td>
                            <button class="action-btn" title="Vezi detalii (simulat)"><i class="fas fa-eye"></i></button>
                            <button class="action-btn" title="Editează status (simulat)"><i class="fas fa-edit"></i></button>
                            <button class="action-btn" title="Raportează problemă (simulat)"><i class="fas fa-flag"></i></button>
                        </td>
                    </tr>`;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
        }
        updatePagination(document.querySelector(paginationSelector), currentPage, Math.ceil(cveArray.length / limit), pageChangeCallback);
    }

    function updatePagination(paginationContainer, currentPage, totalPages, pageChangeCallback) {
        if (!paginationContainer) return; paginationContainer.innerHTML = ''; if (totalPages <= 1) return;
        const createPageButton = (pageNum, text, isActive = false, isDisabled = false) => {
            const button = document.createElement('button'); button.classList.add('page-btn');
            if (pageNum) button.dataset.page = pageNum; button.innerHTML = text;
            if (isActive) button.classList.add('active');
            if (isDisabled) { button.classList.add('disabled'); button.disabled = true; }
            else { button.addEventListener('click', () => pageChangeCallback(pageNum)); }
            return button;
        };
        paginationContainer.appendChild(createPageButton(currentPage - 1, '<i class="fas fa-chevron-left"></i>', false, currentPage === 1));
        let startPage, endPage;
        if (totalPages <= 5) { startPage = 1; endPage = totalPages; }
        else {
            if (currentPage <= 3) { startPage = 1; endPage = 5; }
            else if (currentPage + 2 >= totalPages) { startPage = totalPages - 4; endPage = totalPages; }
            else { startPage = currentPage - 2; endPage = currentPage + 2; }
        }
        if (startPage > 1) { paginationContainer.appendChild(createPageButton(1, '1')); if (startPage > 2) paginationContainer.appendChild(createPageButton(null, '...', false, true)); }
        for (let i = startPage; i <= endPage; i++) { paginationContainer.appendChild(createPageButton(i, i, i === currentPage)); }
        if (endPage < totalPages) { if (endPage < totalPages - 1) paginationContainer.appendChild(createPageButton(null, '...', false, true)); paginationContainer.appendChild(createPageButton(totalPages, totalPages)); }
        paginationContainer.appendChild(createPageButton(currentPage + 1, '<i class="fas fa-chevron-right"></i>', false, currentPage === totalPages));
    }

    // --- EVENT LISTENERS ---
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(i => i.classList.remove('active')); this.classList.add('active');
            const pageId = this.dataset.page; const pageTitle = this.querySelector('span').textContent;
            showPage(pageId, pageTitle); loadPageData(pageId);
        });
    });
    if (refreshButton) { refreshButton.addEventListener('click', () => { const activePageItem = document.querySelector('.nav-menu .nav-item.active'); if (activePageItem) loadPageData(activePageItem.dataset.page); }); }
    if (themeToggleButton) { themeToggleButton.addEventListener('click', toggleTheme); }
    if (settingsDarkModeSelect) {
        settingsDarkModeSelect.addEventListener('change', function() {
            const selectedThemeOption = this.value;
            appState.settings.darkMode = selectedThemeOption;
            let themeToApply = 'light';
            if (selectedThemeOption === 'dark') { themeToApply = 'dark'; }
            else if (selectedThemeOption === 'auto') { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) { themeToApply = 'dark';}}
            localStorage.setItem('theme', themeToApply); // Salvează tema efectivă
            applyTheme(themeToApply);
        });
    }

    const dashboardSearchInput = document.getElementById('searchInputCveIdDashboard');
    const dashboardSearchButton = document.getElementById('searchCveButtonDashboard');
    document.querySelectorAll('#dashboardSeverityFilters .severity-filter-btn').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('#dashboardSeverityFilters .severity-filter-btn').forEach(btn => btn.classList.remove('active')); this.classList.add('active');
            appState.dashboard.severityFilter = this.dataset.severity; appState.dashboard.currentPage = 1; loadDashboardData();
        });
    });
    if (dashboardSearchButton) dashboardSearchButton.addEventListener('click', () => { appState.dashboard.cveIdSearch = dashboardSearchInput.value; appState.dashboard.currentPage = 1; loadDashboardData(); });
    if (dashboardSearchInput) dashboardSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { appState.dashboard.cveIdSearch = dashboardSearchInput.value; appState.dashboard.currentPage = 1; loadDashboardData(); }});
    const dashboardExportBtn = document.getElementById('exportDataBtnDashboard'); if(dashboardExportBtn) dashboardExportBtn.addEventListener('click', () => alert('Export date dashboard (simulat)'));

    const cvedbApplyFiltersBtn = document.getElementById('cvedb-apply-filters');
    const cvedbResetFiltersBtn = document.getElementById('cvedb-reset-filters');
    const cvedbExportBtn = document.getElementById('cvedb-export');
    const cvedbSortBy = document.getElementById('cvedb-sort-by');
    const cvedbSortOrder = document.getElementById('cvedb-sort-order');
    if (cvedbApplyFiltersBtn) cvedbApplyFiltersBtn.addEventListener('click', () => {
        appState.cvedb.filters = {
            searchId: document.getElementById('cvedb-search-id').value, severity: document.getElementById('cvedb-severity').value,
            product: document.getElementById('cvedb-product').value, status: document.getElementById('cvedb-status').value,
            dateStart: document.getElementById('cvedb-date-start').value, dateEnd: document.getElementById('cvedb-date-end').value,
            cvssMin: document.getElementById('cvedb-cvss-min').value, cvssMax: document.getElementById('cvedb-cvss-max').value,
        }; appState.cvedb.currentPage = 1; loadCveDatabasePageData();
    });
    if (cvedbResetFiltersBtn) cvedbResetFiltersBtn.addEventListener('click', () => {
        document.getElementById('cvedb-search-id').value = ''; document.getElementById('cvedb-severity').value = '';
        document.getElementById('cvedb-product').value = ''; document.getElementById('cvedb-status').value = '';
        document.getElementById('cvedb-date-start').value = ''; document.getElementById('cvedb-date-end').value = '';
        document.getElementById('cvedb-cvss-min').value = ''; document.getElementById('cvedb-cvss-max').value = '';
        appState.cvedb.filters = {}; appState.cvedb.currentPage = 1; loadCveDatabasePageData();
    });
    if (cvedbExportBtn) cvedbExportBtn.addEventListener('click', () => alert('Export date Bază de Date CVE (simulat)'));
    if(cvedbSortBy) cvedbSortBy.addEventListener('change', () => { appState.cvedb.sortBy = cvedbSortBy.value; appState.cvedb.currentPage = 1; loadCveDatabasePageData(); });
    if(cvedbSortOrder) cvedbSortOrder.addEventListener('change', () => { appState.cvedb.sortOrder = cvedbSortOrder.value; appState.cvedb.currentPage = 1; loadCveDatabasePageData(); });

    const generateReportBtn = document.getElementById('generate-report-btn'); if (generateReportBtn) generateReportBtn.addEventListener('click', loadReportsPageData);
    function addNotificationActionListeners() {
        document.querySelectorAll('.mark-notification-read').forEach(button => {
            button.addEventListener('click', function(e) { e.stopPropagation(); const notifId = this.dataset.id;
                alert(`Marchează notificarea ${notifId} ca citită (simulat).`); this.innerHTML = '<i class="fas fa-check-double"></i>'; this.closest('.notification-item').classList.remove('unread'); }); }); }
    const markAllReadBtn = document.getElementById('mark-all-read-btn'); const clearNotificationsBtn = document.getElementById('clear-notifications-btn');
    if (markAllReadBtn) markAllReadBtn.addEventListener('click', () => { alert('Toate notificările marcate ca citite (simulat).'); document.querySelectorAll('.notification-item.unread').forEach(item => { item.classList.remove('unread'); item.querySelector('.mark-notification-read').innerHTML = '<i class="fas fa-check-double"></i>'; }); });
    if (clearNotificationsBtn) clearNotificationsBtn.addEventListener('click', () => { if(confirm("Sigur doriți să ștergeți toate notificările?")) { alert('Toate notificările șterse (simulat).'); document.querySelector('#notifications-page .notifications-list').innerHTML = `<li class="notification-item placeholder"><div class="notification-content"><p class="notification-message">Nu există notificări.</p></div></li>`; }});

    const settingsForm = document.getElementById('app-settings-form'); const settingsFeedback = document.getElementById('settings-feedback');
    if (settingsForm) settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        appState.settings.email = document.getElementById('setting-email').value;
        appState.settings.notifyCritical = document.getElementById('notify-critical').checked;
        appState.settings.notifyHigh = document.getElementById('notify-high').checked;
        appState.settings.notifyMedium = document.getElementById('notify-medium').checked;
        appState.settings.notifyLow = document.getElementById('notify-low').checked;
        appState.settings.itemsPerPage = parseInt(document.getElementById('setting-items-per-page').value);
        const selectedThemeOption = document.getElementById('setting-dark-mode').value;
        appState.settings.darkMode = selectedThemeOption;
        let themeToApplyOnSave = 'light';
        if (selectedThemeOption === 'dark') { themeToApplyOnSave = 'dark'; }
        else if (selectedThemeOption === 'auto') { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) { themeToApplyOnSave = 'dark';}}
        localStorage.setItem('theme', themeToApplyOnSave); // Salvează tema efectivă
        localStorage.setItem('settings_darkModePreference', selectedThemeOption); // Salvează preferința 'auto'/'light'/'dark'
        applyTheme(themeToApplyOnSave);
        loadPageData(document.querySelector('.nav-menu .nav-item.active').dataset.page); // Reîncarcă datele paginii curente pentru a reflecta limita de itemi
        console.log("Setări salvate (simulat):", appState.settings);
        settingsFeedback.textContent = "Setările au fost salvate cu succes! (simulat)"; settingsFeedback.className = 'feedback-message success'; settingsFeedback.style.display = 'block'; setTimeout(() => settingsFeedback.style.display = 'none', 3000);
    });
    const triggerSyncBtn = document.getElementById('trigger-sync-btn');
    if (triggerSyncBtn) triggerSyncBtn.addEventListener('click', () => {
        alert('Sincronizare manuală CVE pornită (simulat). Acest proces poate dura.');
        settingsFeedback.textContent = "Sincronizarea manuală a CVE-urilor a fost pornită... (simulat)"; settingsFeedback.className = 'feedback-message info'; settingsFeedback.style.display = 'block';
    });

    // --- INIȚIALIZARE APLICAȚIE ---
    // Mai întâi încarcă setările salvate (dacă există) pentru a stabili tema și itemii pe pagină
    const savedItemsPerPage = localStorage.getItem('settings_itemsPerPage');
    const savedDarkModePreference = localStorage.getItem('settings_darkModePreference');
    if (savedItemsPerPage) appState.settings.itemsPerPage = parseInt(savedItemsPerPage);
    if (savedDarkModePreference) appState.settings.darkMode = savedDarkModePreference;
    document.getElementById('setting-items-per-page').value = appState.settings.itemsPerPage; // Setează select-ul din UI
    document.getElementById('setting-dark-mode').value = appState.settings.darkMode; // Setează select-ul din UI


    initCharts(); // Acum include și loadThemePreference
    const initialActiveNavItem = document.querySelector('.nav-menu .nav-item.active');
    if (initialActiveNavItem) {
        const initialPageId = initialActiveNavItem.dataset.page;
        const initialPageTitle = initialActiveNavItem.querySelector('span').textContent;
        showPage(initialPageId, initialPageTitle);
        loadPageData(initialPageId);
    } else {
        showPage('dashboard', 'Dashboard');
        loadPageData('dashboard');
    }
});
