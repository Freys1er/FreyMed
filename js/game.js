// js/game.js

// Ensure 'storage' and 'gemini' objects are available globally
// (assuming storage.js and gemini.js are loaded before game.js in index.html)

const game = {
    // --- Public methods for tab content generation ---

    /**
     * Generates the content for the Home tab.
     * @param {Object} playerData - appData.playerData from main.js
     * @param {boolean} isApiKeySet - True if the API key is set.
     * @param {Function} onStartNewGameClick - Callback for "Start New Game" button.
     * @param {Function} getRecentlyClosedScenarios - Callback to get list of closed scenarios.
     * @param {Function} onReopenClosedScenarioClick - Callback to re-open a closed scenario.
     * @param {Function} onContinueGameClick - Callback for "Continue Game" button (if applicable).
     * @returns {HTMLElement} - The DOM element for the home panel content.
     */
    getHomePageContent: function(playerData, isApiKeySet, onStartNewGameClick, getRecentlyClosedScenarios, onReopenClosedScenarioClick, onContinueGameClick) {
        const panel = document.createElement('div');
        panel.classList.add('home-panel-content'); // Ensure this class exists in CSS for styling

        let welcomeMessage = "Welcome to Critical Choices: A Medical Simulator!";
        // Example: if (playerData && playerData.profile && playerData.profile.name) { welcomeMessage = ... }

        // Corrected playerData access
        let statsSummary = "<p>No game data found. Start a new scenario!</p>";
        if (playerData && playerData.stats) {
            statsSummary = `
                <p>Operations Completed: ${playerData.stats.operationsCompleted || 0}</p>
                <p>Success Rate: ${playerData.stats.successRate || 0}%</p>
            `;
        }

        const recentlyClosed = getRecentlyClosedScenarios();
        let closedScenariosHtml = '<p>No recently closed scenarios.</p>';
        if (recentlyClosed && recentlyClosed.length > 0) {
            closedScenariosHtml = '<ul class="closed-scenarios-list">';
            recentlyClosed.forEach(scenario => {
                const date = new Date(parseInt(scenario.id.split('-')[2])); // Parse timestamp from ID
                closedScenariosHtml += `
                    <li>
                        <span>${scenario.name} (${date.toLocaleString()})</span>
                        <button class="reopen-scenario-btn" data-scenario-id="${scenario.id}">Re-open</button>
                    </li>
                `;
            });
            closedScenariosHtml += '</ul>';
        }

        panel.innerHTML = `
            <h2>${welcomeMessage}</h2>
            <p>Hone your medical decision-making skills in realistic scenarios.</p>
            <div class="data-section">
                <h3>Current Status</h3>
                <div class="status-item">
                    <strong>API Key:</strong>
                    <span style="color: ${isApiKeySet ? 'lightgreen' : 'salmon'};">${isApiKeySet ? 'Set' : 'NOT SET'}</span>
                </div>
                <div class="status-item">
                    <strong>Player Progress:</strong>
                    ${statsSummary}
                </div>
            </div>
            <div class="data-section">
                <p>${isApiKeySet ? "You're ready to play!" : "Configure API Key in 'Data & Settings' to enable AI scenarios."}</p>

                <button id="home-start-new-game">Start New Scenario</button>
            </div>
            <hr>
            <div class="data-section">
                <h3>Recently Closed Scenarios</h3>
                ${closedScenariosHtml}
            </div>
        `;

        const startBtn = panel.querySelector('#home-start-new-game');
        if (startBtn) {
            if (!isApiKeySet) {
                startBtn.disabled = true;
                startBtn.textContent = "API Key Needed";
                startBtn.style.backgroundColor = '#444'; // Dim button
                startBtn.style.cursor = 'not-allowed';
            } else {
                startBtn.addEventListener('click', () => {
                    onStartNewGameClick(); // Call the main.js handler
                });
            }
        }

        // NEW: Add listeners for re-open buttons
        panel.querySelectorAll('.reopen-scenario-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const scenarioId = btn.dataset.scenarioId;
                onReopenClosedScenarioClick(scenarioId);
            });
        });

        return panel;
    },

    /**
     * Generates content for the Notes tab.
     * @param {string} currentNotes - The current notes string from appData.notes.
     * @param {Function} onNotesUpdate - Callback function to pass updated notes back to main.js.
     * @returns {HTMLElement}
     */
    getNotesPageContent: function(currentNotes, onNotesUpdate) {
        const div = document.createElement('div');
        div.classList.add('notes-panel'); // Add a class for specific styling
        div.innerHTML = `<h2>My Notes</h2>`;
        const textArea = document.createElement('textarea');
        textArea.style.width = "calc(100% - 20px)"; // Adjust to use padding from parent
        textArea.style.height = "calc(100% - 70px)"; // Adjust height
        textArea.style.minHeight = "300px";
        textArea.style.backgroundColor = "#131313";
        textArea.style.color = "#b0b0b0";
        textArea.style.border = "1px solid #000000";
        textArea.style.padding = "10px";
        textArea.style.borderRadius = "3px";
        textArea.style.resize = "vertical";
        textArea.style.fontFamily = "inherit";
        textArea.style.fontSize = "0.95em";
        textArea.style.lineHeight = "1.5";
        textArea.style.boxSizing = "border-box";
        textArea.setAttribute("placeholder", "Your personal game notes, ideas, or reminders...");
        textArea.value = currentNotes || "";

        let debounceTimer;
        textArea.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                onNotesUpdate(textArea.value); // Call the callback to update appData in main.js
            }, 500); // Debounce to avoid saving on every keystroke
        });
        div.appendChild(textArea);
        return div;
    },

    /**
     * Generates placeholder content for a scenario play screen.
     * This will be the main interactive area with AI.
     * @param {string} scenarioTabId - The ID of the scenario tab.
     * @param {Object} appData - The main application data object.
     * @returns {HTMLElement}
     */
    getScenarioPlayScreenContent: function(scenarioTabId, appData) {
        const panel = document.createElement('div');
        panel.classList.add('scenario-playscreen'); // For specific styling
        // IMPORTANT: Use the scenarioTabId to create a unique ID for the output area
        // This is crucial for main.js to target it during generation/re-opening
        panel.innerHTML = `
            <h3>Scenario: ${appData.playerData.activeScenarios[scenarioTabId]?.name || 'Loading...'}</h3>
            <div id="scenario-output-${scenarioTabId}" class="scenario-output">
                </div>
            `;
        // For now, it also makes the main input area visible:
        if (window.appShell) window.appShell.showInputArea();
        return panel;
    },

    /**
     * Generates content for the Patient Info tab.
     * @param {string} patientTabId - The ID of the patient tab.
     * @param {Object} patientData - The patient data object.
     * @returns {HTMLElement}
     */
    getPatientTabContent: function(patientTabId, patientData) {
        const panel = document.createElement('div');
        panel.classList.add('patient-info-panel');
        panel.innerHTML = `
            <h2>Patient Information</h2>
            <div class="patient-details">
                <p><strong>Condition:</strong> ${patientData.condition}</p>
                <p><strong>Age:</strong> ${patientData.age}</p>
                <p><strong>Sex:</strong> ${patientData.sex}</p>
                <p><strong>Chief Complaint:</strong> ${patientData.chiefComplaint}</p>
                <h3>Initial Observations</h3>
                <p>${patientData.initialObservations.replace(/\n/g, '<br>')}</p>
                <h3>Medical Records</h3>
                <p>${patientData.medicalRecords.replace(/\n/g, '<br>')}</p>
                <h3>Bystander/Family Statements</h3>
                <p>${patientData.bystanderStatements.replace(/\n/g, '<br>')}</p>
            </div>
        `;
        return panel;
    },

    /**
     * Handles player commands and interacts with Gemini API.
     * This function is called by main.js when the player submits a command.
     * @param {string} command - The command entered by the player.
     * @param {string} activeTabId - The ID of the currently active tab.
     * @param {Object} appData - The main application data object (can be modified by this function).
     * @param {Function} appendToMainContent - Callback to append text to the main content area.
     * @returns {Promise<boolean>} - A promise that resolves to true if appData was modified and needs to be saved.
     */
    handlePlayerCommand: async function(command, activeTabId, appData, appendToMainContent) {
        console.log(`Game received command: "${command}" for tab: "${activeTabId}"`);
        let modified = false;

        // Only process commands for active scenario tabs
        if (activeTabId.startsWith('scenario-')) {
            const currentScenario = appData.playerData.activeScenarios[activeTabId];

            if (currentScenario) {
                currentScenario.eventLog.push(`Player commanded: ${command}`);
                modified = true;

                // Send command to Gemini and get AI response
                if (gemini.isReady()) {
                    appendToMainContent("Thinking...", false); // Show temporary thinking message (should be removed by UI)

                    const aiResponseObj = await gemini.ask(command); // Await full object

                    let aiResponseText = "AI did not provide a text response.";
                    if (aiResponseObj && aiResponseObj.text) {
                        aiResponseText = aiResponseObj.text;
                    } else if (typeof aiResponseObj === 'string') { // Fallback if gemini.ask returns raw string
                        aiResponseText = aiResponseObj;
                    }

                    // Remove thinking message by appending the actual response on top (or replacing it)
                    // The appendToMainContent should handle removing prior thinking message if it adds a new one
                    appendToMainContent(aiResponseText); // Display Gemini's response in the main content area
                    // Also add AI response to scenario event log for persistence
                    currentScenario.eventLog.push(`AI Response: ${aiResponseText}`);
                    modified = true;
                } else {
                    appendToMainContent("Gemini AI is not ready. Please check your API key in Data Management.", false);
                }
            } else {
                console.warn(`Attempted to handle command for non-existent active scenario: ${activeTabId}`);
                appendToMainContent("Scenario data not found. Please start a new scenario.", false);
            }
        }
        return modified; // Let main.js know if it should save appData
    },

    /**
     * Called when a scenario tab is closed.
     * @param {string} scenarioTabId - The ID of the scenario tab being closed.
     * @param {Object} appData - The main application data object.
     * @returns {Object|null} - The scenario data if it was moved to completed/closed, otherwise null.
     */
    endScenario: function(scenarioTabId, appData) {
        console.log(`Game logic for ending scenario: ${scenarioTabId}`);
        let scenarioToSave = null;

        // Hide input when scenario ends (appShell handles this now)
        if (window.appShell) window.appShell.hideInputArea();

        // Clean up scenario-specific data in appData.playerData if necessary
        if (appData.playerData.activeScenarios && appData.playerData.activeScenarios[scenarioTabId]) {
            scenarioToSave = appData.playerData.activeScenarios[scenarioTabId];

            // Don't increment operationsCompleted here, it's done *before* new scenario starts
            // appData.playerData.stats.operationsCompleted = (appData.playerData.stats.operationsCompleted || 0) + 1;
            // Success rate logic would be more complex and depend on game outcome

            delete appData.playerData.activeScenarios[scenarioTabId]; // Remove from active scenarios
            console.log(`Scenario ${scenarioTabId} removed from active.`);
        }
        // No explicit save here, main.js will save based on the return value.
        return scenarioToSave; // Return the scenario data so main.js can store it in recentlyClosedScenarios
    }
};