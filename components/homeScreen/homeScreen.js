// components/homeScreen/homeScreen.js

const homeScreen = {
    /**
     * Fetches, populates, and returns the HTML content element for the Home tab.
     * @param {Object} playerData - appData.playerData from main.js
     * @param {boolean} isApiKeySet - True if the API key is set.
     * @param {Function} onStartNewScenarioRequest - Callback to main.js to start a new scenario.
     * @param {Function} getRecentlyClosedScenarios - Callback to main.js.
     * @param {Function} onReopenClosedScenarioClick - Callback to main.js.
     * @returns {Promise<HTMLElement>} - A promise that resolves with the fully prepared DOM element.
     */
    getContentElement: async function(playerData, isApiKeySet, onStartNewScenarioRequest, getRecentlyClosedScenarios, onReopenClosedScenarioClick) {
        console.log("HomeScreenJS: Fetching and preparing content. API Key Set:", isApiKeySet);

        try {
            // Ensure ui object and fetchHtmlTemplate are available
            if (!window.ui || typeof window.ui.fetchHtmlTemplate !== 'function') {
                console.error("HomeScreenJS: ui.fetchHtmlTemplate is not available!");
                const errorPanel = document.createElement('div');
                errorPanel.innerHTML = "<p>Error: UI module not loaded correctly.</p>";
                return errorPanel;
            }

            const htmlString = await window.ui.fetchHtmlTemplate('components/homeScreen/homeScreen.html');
            const panel = document.createElement('div'); // Create a container for the fetched HTML
            panel.innerHTML = htmlString; // Inject raw HTML

            // --- Populate dynamic content ---
            const welcomeMsgEl = panel.querySelector('#home-welcome-message');
            const apiKeyStatusEl = panel.querySelector('#home-api-key-status');
            const playerProgressEl = panel.querySelector('#home-player-progress-details');
            const scenarioPromptMsgEl = panel.querySelector('#home-scenario-prompt-message');
            const recentlyClosedListEl = panel.querySelector('#home-recently-closed-list');

            if (welcomeMsgEl) {
                welcomeMessage = "Welcome to Frey Medical Simulator!";
                // if (playerData && playerData.profile && playerData.profile.name) { welcomeMessage = ... }
                welcomeMsgEl.textContent = welcomeMessage;
            }

            if (apiKeyStatusEl) {
                apiKeyStatusEl.textContent = isApiKeySet ? 'Set & Ready' : 'NOT SET';
                apiKeyStatusEl.style.color = isApiKeySet ? '#76cc76' : '#ff6b6b';
            }

            if (playerProgressEl) {
                let statsSummary = "<p>No game data found. Start a new scenario!</p>";
                if (playerData && playerData.stats) {
                    statsSummary = `
                        <p>Operations Completed: ${playerData.stats.operationsCompleted || 0}</p>
                        <p>Success Rate: ${playerData.stats.successRate || 0}%</p>
                    `;
                }
                playerProgressEl.innerHTML = statsSummary;
            }

            if (scenarioPromptMsgEl) {
                scenarioPromptMsgEl.textContent = isApiKeySet ? "Customize your scenario or leave blank for random:" : "Configure API Key in 'Data & Settings' to enable AI scenarios.";
            }

            if (recentlyClosedListEl) {
                const recentlyClosed = getRecentlyClosedScenarios ? getRecentlyClosedScenarios() : [];
                let closedScenariosHtml = '<p style="color: #888;">No recently closed scenarios found.</p>';
                if (recentlyClosed && recentlyClosed.length > 0) {
                    closedScenariosHtml = '<ul class="content-list closed-scenarios-list">'; // Use content-list class
                    recentlyClosed.forEach(scenario => {
                        const date = scenario.closedTimestamp ? new Date(scenario.closedTimestamp).toLocaleString() : 'N/A';
                        closedScenariosHtml += `
                            <li>
                                <span>${scenario.name || 'Unnamed Scenario'} (Closed: ${date})</span>
                                <button class="reopen-scenario-btn data-section-button" data-scenario-id="${scenario.id}">Re-open</button>
                            </li>
                        `;
                    });
                    closedScenariosHtml += '</ul>';
                }
                recentlyClosedListEl.innerHTML = closedScenariosHtml;

                // Add listeners for re-open buttons AFTER they are in the DOM
                recentlyClosedListEl.querySelectorAll('.reopen-scenario-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const scenarioId = btn.dataset.scenarioId;
                        if (typeof onReopenClosedScenarioClick === 'function') {
                            onReopenClosedScenarioClick(scenarioId);
                        }
                    });
                });
            }


            // --- Attach Event Listeners ---
            const startBtn = panel.querySelector('#home-start-new-game-btn');
            const professionInputEl = panel.querySelector('#home-scenario-profession-input');
            const detailsInputEl = panel.querySelector('#home-scenario-details-input');

            if (startBtn && professionInputEl && detailsInputEl) {
                if (!isApiKeySet) {
                    startBtn.disabled = true;
                    startBtn.textContent = "API Key Needed";
                    // Add disabled styles if not in CSS already
                    startBtn.style.cursor = 'not-allowed';
                    startBtn.style.opacity = '0.5';
                    professionInputEl.disabled = true;
                    detailsInputEl.disabled = true;
                } else {
                    startBtn.addEventListener('click', () => {
                        const profession = professionInputEl.value.trim();
                        const details = detailsInputEl.value.trim();
                        console.log("HomeScreenJS: Start New Scenario clicked. Profession:", profession, "Details:", details);
                        if (typeof onStartNewScenarioRequest === 'function') {
                            onStartNewScenarioRequest({ profession: profession || "ER Doctor", details }); // Default profession
                        }
                    });
                }
            } else {
                console.error("HomeScreenJS: Could not find all necessary elements for new scenario setup in fetched template.");
            }

            return panel.firstElementChild; // Return the actual .home-panel-content div
        } catch (error) {
            console.error("HomeScreenJS: Error fetching or processing homeScreen.html:", error);
            const errorPanel = document.createElement('div');
            errorPanel.innerHTML = `<p class="error-message">Error loading Home screen content: ${error.message}</p>`;
            return errorPanel;
        }
    }
};

// Make it globally available
window.homeScreen = homeScreen;