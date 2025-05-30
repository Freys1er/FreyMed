// js/ui.js

const ui = {
    FONT_CLASSES: ['font-normal', 'font-monospace', 'font-handwriting'],
    // DOM elements will be fetched when needed to ensure they exist after DOMContentLoaded
    _globalTabBar: null,
    _mainContentArea: null,

    getGlobalTabBar: function() {
        if (!this._globalTabBar) {
            this._globalTabBar = document.getElementById('global-tab-bar');
        }
        return this._globalTabBar;
    },

    getMainContentArea: function() {
        if (!this._mainContentArea) {
            this._mainContentArea = document.getElementById('main-content-area');
        }
        return this._mainContentArea;
    },

    applyFontPreference: function(fontPreference) {
        document.body.classList.remove(...this.FONT_CLASSES);
        switch (fontPreference) {
            case 'monospace':
                document.body.classList.add('font-monospace');
                break;
            case 'handwriting':
                document.body.classList.add('font-handwriting');
                break;
            case 'normal':
            default:
                document.body.classList.add('font-normal');
                break;
        }
    },

    createFontSelector: function(currentFont, onFontChange) {
        const section = document.createElement('div');
        section.classList.add('font-selector-section');
        section.innerHTML = `
            <label for="font-select">Select Display Font:</label>
            <select id="font-select">
                <option value="normal">Normal (Sans-Serif)</option>
                <option value="monospace">Monospace</option>
                <option value="handwriting">Handwriting</option>
            </select>
        `;
        const selectElement = section.querySelector('#font-select');
        selectElement.value = currentFont || 'normal';
        selectElement.addEventListener('change', (event) => {
            onFontChange(event.target.value);
        });
        return section;
    },

    createDataManagementPanel: function(currentAppData, onApiKeyChange, onFontChange, onImportRequest, onExportRequest) {
        const panel = document.createElement('div');
        panel.classList.add('data-management-panel');
        const apiKey = currentAppData.apiKey || '';
        const currentFont = currentAppData.preferences?.font || 'normal';

        panel.innerHTML = `
            <h2>Data & Settings</h2>
            <div class="data-section">
                <h3>Gemini API Key</h3>
                <p class="api-key-status">
                    Current Status: <span id="api-key-display-status">${apiKey ? 'Set' : 'Not Set'}</span>
                </p>
                <label for="gemini-api-key-input">Enter/Update API Key:</label>
                <input type="password" id="gemini-api-key-input" placeholder="Paste your API key here" value="${apiKey}">
                <button id="save-api-key-btn-panel">Save API Key</button>
            </div>
            <hr>
            <div class="data-section">
                <h3>Display Font</h3>
                <!-- Font selector will be appended here -->
            </div>
            <hr>
            <div class="data-section">
                <h3>Import / Export User Data</h3>
                <p>Save your entire game state, API key, and settings, or load a previous save.</p>
                <button id="import-data-btn-panel">Import Data from File</button>
                <input type="file" id="import-file-input-panel" accept=".json" style="display: none;">
                <button id="export-data-btn-panel">Export Data to File</button>
            </div>
        `;

        const fontSelectorContainer = panel.querySelector('.data-section:nth-of-type(2)'); // Second data-section
        const fontSelectorElement = this.createFontSelector(currentFont, onFontChange); // Use 'this'
        fontSelectorContainer.appendChild(fontSelectorElement);

        const apiKeyInput = panel.querySelector('#gemini-api-key-input');
        panel.querySelector('#save-api-key-btn-panel').addEventListener('click', () => {
            const newApiKey = apiKeyInput.value.trim();
            onApiKeyChange(newApiKey);
            panel.querySelector('#api-key-display-status').textContent = newApiKey ? 'Set' : 'Not Set';
        });

        const importFileInput = panel.querySelector('#import-file-input-panel');
        panel.querySelector('#import-data-btn-panel').addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                onImportRequest(file);
            }
            importFileInput.value = null;
        });

        panel.querySelector('#export-data-btn-panel').addEventListener('click', onExportRequest);
        return panel;
    },

    renderGlobalTabs: function(tabConfigs, activeTabId, onTabClick, onTabClose) {
        const tabBar = this.getGlobalTabBar();
        if (!tabBar) {
            console.error("Error: Global tab bar element not found in renderGlobalTabs.");
            return;
        }
        tabBar.innerHTML = '';

        tabConfigs.forEach(tabConfig => {
            const tabButton = document.createElement('button');
            tabButton.classList.add('tab-button');
            tabButton.dataset.tabId = tabConfig.id;
            tabButton.textContent = tabConfig.label;

            if (tabConfig.id === activeTabId) {
                tabButton.classList.add('active');
            }

            tabButton.addEventListener('click', () => {
                onTabClick(tabConfig.id);
            });

            if (tabConfig.isCloseable && onTabClose) {
                const closeButton = document.createElement('span');
                closeButton.classList.add('tab-close-button');
                closeButton.innerHTML = '×';
                closeButton.title = `Close ${tabConfig.label}`;
                closeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    onTabClose(tabConfig.id);
                });
                tabButton.appendChild(closeButton);
            }
            tabBar.appendChild(tabButton);
        });
    },

    renderTabPanelContent: function(tabId, contentData) {
        const contentArea = this.getMainContentArea();
        if (!contentArea) {
            console.error("Error: Main content area element not found in renderTabPanelContent.");
            return;
        }

        const existingPanels = contentArea.querySelectorAll('.tab-panel');
        existingPanels.forEach(panel => panel.classList.remove('active'));

        let panel = contentArea.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
        if (!panel) {
            panel = document.createElement('div');
            panel.classList.add('tab-panel');
            panel.dataset.tabId = tabId;
            contentArea.appendChild(panel);
        }

        if (typeof contentData === 'string') {
            panel.innerHTML = contentData;
        } else if (contentData instanceof HTMLElement) {
            panel.innerHTML = '';
            panel.appendChild(contentData);
        } else if (typeof contentData === 'object' && contentData !== null) {
            panel.innerHTML = `<h2>Content for ${tabId}</h2><pre>${JSON.stringify(contentData, null, 2)}</pre>`;
        } else {
            panel.innerHTML = `<h2>Content for ${tabId}</h2><p>No specific content provided, or content is undefined.</p>`;
        }
        panel.classList.add('active');
    },

    removeTabPanel: function(tabId) {
        const contentArea = this.getMainContentArea();
        if (!contentArea) return;
        const panel = contentArea.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
        if (panel) {
            panel.remove();
        }
    }
};