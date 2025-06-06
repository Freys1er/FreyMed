// components/dataManagementScreen/dataManagementScreen.js
console.log("DataManagementScreenJS: Script loaded.");

const dataManagementScreen = {
    /**
     * Fetches, populates, and returns the HTML content for the Data & Settings tab.
     * @param {Object} currentAppData - The entire appData object.
     * @param {Function} onApiKeyChangeCallback - (newApiKey) => void
     * @param {Function} onFontChangeCallback - (newFontValue) => void
     * @param {Function} onImportRequestCallback - (file) => void
     * @param {Function} onExportRequestCallback - () => void
     * @returns {Promise<HTMLElement>} - A promise that resolves with the fully prepared DOM element.
     */
    getContentElement: async function(
        currentAppData,
        onApiKeyChangeCallback,
        onFontChangeCallback,
        onImportRequestCallback,
        onExportRequestCallback
    ) {
        console.log("DataManagementScreenJS: getContentElement CALLED.");
        try {
            if (!window.ui || typeof window.ui.fetchHtmlTemplate !== 'function') {
                console.error("DataManagementScreenJS: ui.fetchHtmlTemplate is not available!");
                throw new Error("Core UI function (fetchHtmlTemplate) missing.");
            }

            const htmlString = await window.ui.fetchHtmlTemplate('components/dataManagementScreen/dataManagementScreen.html');
            const panelContainer = document.createElement('div');
            panelContainer.innerHTML = htmlString;
            const panelElement = panelContainer.firstElementChild; // Get the actual .data-management-panel-content

            // --- Populate dynamic fields ---
            const apiKeyStatusEl = panelElement.querySelector('#dms-api-key-display-status');
            const apiKeyInputEl = panelElement.querySelector('#dms-gemini-api-key-input');
            const fontSelectEl = panelElement.querySelector('#dms-font-select');

            if (apiKeyStatusEl) {
                apiKeyStatusEl.textContent = currentAppData.apiKey ? 'Set' : 'Not Set';
                apiKeyStatusEl.style.color = currentAppData.apiKey ? '#76cc76' : '#ff6b6b';
            }
            if (apiKeyInputEl) {
                apiKeyInputEl.value = currentAppData.apiKey || '';
            }
            if (fontSelectEl) {
                fontSelectEl.value = currentAppData.preferences?.font || 'normal';
            }

            // --- Attach Event Listeners ---
            const saveApiKeyBtn = panelElement.querySelector('#dms-save-api-key-btn');
            if (saveApiKeyBtn && apiKeyInputEl && typeof onApiKeyChangeCallback === 'function') {
                saveApiKeyBtn.addEventListener('click', () => {
                    const newApiKey = apiKeyInputEl.value.trim();
                    onApiKeyChangeCallback(newApiKey); // Call main.js handler
                    // Update status display immediately
                    if (apiKeyStatusEl) {
                        apiKeyStatusEl.textContent = newApiKey ? 'Set' : 'Not Set';
                        apiKeyStatusEl.style.color = newApiKey ? '#76cc76' : '#ff6b6b';
                    }
                });
            }

            if (fontSelectEl && typeof onFontChangeCallback === 'function') {
                fontSelectEl.addEventListener('change', (event) => {
                    onFontChangeCallback(event.target.value); // Call main.js handler
                });
            }

            const importBtn = panelElement.querySelector('#dms-import-data-btn');
            const importFileInput = panelElement.querySelector('#dms-import-file-input');
            if (importBtn && importFileInput && typeof onImportRequestCallback === 'function') {
                importBtn.addEventListener('click', () => importFileInput.click()); // Trigger hidden file input
                importFileInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        onImportRequestCallback(file); // Call main.js handler
                    }
                    importFileInput.value = null; // Reset file input
                });
            }

            const exportBtn = panelElement.querySelector('#dms-export-data-btn');
            if (exportBtn && typeof onExportRequestCallback === 'function') {
                exportBtn.addEventListener('click', onExportRequestCallback); // Call main.js handler
            }

            return panelElement;

        } catch (error) {
            console.error("DataManagementScreenJS: Error fetching or processing template:", error);
            const errorPanel = document.createElement('div');
            errorPanel.innerHTML = `<p class="error-message">Error loading Data & Settings: ${error.message}</p>`;
            return errorPanel;
        }
    }
};

// Make it globally available
window.dataManagementScreen = dataManagementScreen;