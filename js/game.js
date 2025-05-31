// js/game.js

const game = {
    getHomePageContent: function (playerData, isApiKeySet, onStartNewGameClick, getRecentlyClosedScenarios, onReopenClosedScenarioClick /*, onContinueGameClick */) {
        const panel = document.createElement('div');
        panel.classList.add('home-panel-content');
        let welcomeMessage = "Welcome to Frey Medical: A Medical Simulator!";
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
            closedScenariosHtml = '<ul class="content-list closed-scenarios-list">'; // Use content-list for styling
            recentlyClosed.forEach(scenario => {
                const date = scenario.closedTimestamp ? new Date(scenario.closedTimestamp).toLocaleString() : 'N/A';
                closedScenariosHtml += `
                    <li>
                        <span>${scenario.name} (Closed: ${date})</span>
                        <button class="reopen-scenario-btn data-section-button" data-scenario-id="${scenario.id}">Re-open</button>
                    </li>
                `;
            });
            closedScenariosHtml += '</ul>';
        } else {
            closedScenariosHtml = '<p style="color: #888;">No recently closed scenarios found.</p>';
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
                    <div class="player-progress-details">${statsSummary}</div>
                </div>
            </div>

            <div class="data-section" id="new-scenario-setup">
                <h3>Start New Scenario</h3>
                <p>${isApiKeySet ? "Describe the scenario or your role:" : "Configure API Key in 'Data & Settings' to enable AI scenarios."}</p>

                <div class="form-group">
                    <p class="form-label" id="scenario-profession-label">Your Profession/Role (e.g., ER Doctor, Paramedic, Surgeon):</p>
                    <input type="text" id="scenario-profession" class="home-input" placeholder="ER Doctor" aria-labelledby="scenario-profession-label">
                </div>
                <div class="form-group">
                    <p class="form-label" id="scenario-details-label">Scenario Details / Patient Chief Complaint (optional):</p>
                    <textarea id="scenario-details" class="home-textarea" placeholder="e.g., 45yo male with chest pain, or 'Motor vehicle accident'" aria-labelledby="scenario-details-label"></textarea>
                </div>

                <button id="home-start-new-game" class="data-section-button">Generate Scenario</button>
            </div>

            <hr>
            <div class="data-section">
                <h3>Recently Closed Scenarios</h3>
                ${closedScenariosHtml}
            </div>
        `;

        const startBtn = panel.querySelector('#home-start-new-game');
        const professionInput = panel.querySelector('#scenario-profession');
        const detailsInput = panel.querySelector('#scenario-details');
        if (startBtn) {
            if (!isApiKeySet) {
                startBtn.disabled = true;
                startBtn.textContent = "API Key Needed";
                startBtn.style.backgroundColor = '#444';
                startBtn.style.cursor = 'not-allowed';

                professionInput.disabled = true;
                detailsInput.disabled = true;
            } else {
                startBtn.addEventListener('click', () => {
                    const profession = professionInput.value.trim();
                    const details = detailsInput.value.trim();
                    // Pass these values to the handler in main.js
                    onStartNewGameClick({ profession, details }); // Pass as an object
                });
            }
        }
        panel.querySelectorAll('.reopen-scenario-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const scenarioId = btn.dataset.scenarioId;
                onReopenClosedScenarioClick(scenarioId);
            });
        });
        return panel;
    },

    getNotesPageContent: function (currentNotes, onNotesUpdate) {
        const div = document.createElement('div');
        div.classList.add('notes-panel');
        div.innerHTML = `<h2>My Notes</h2>`;
        const textArea = document.createElement('textarea');
        textArea.value = currentNotes || "";
        let debounceTimer;
        textArea.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => onNotesUpdate(textArea.value), 500);
        });
        div.appendChild(textArea);
        return div;
    },

    /**
     * Generates the initial HTML structure for a scenario play screen, including a loading state.
     * The actual content (description, log) will be filled in by ui.updateScenarioOutput.
     * @param {string} scenarioTabId - The ID of the scenario tab.
     * @param {Object} appData - The main application data object.
     * @param {string} [initialMessage] - An initial message to display (e.g., "Loading scenario...").
     * @returns {HTMLElement}
     */
    getScenarioPlayScreenContent: function (scenarioTabId, appData, initialDisplayMessage = "Loading scenario details...") {
        console.log(`GAME: getScenarioPlayScreenContent for ${scenarioTabId}`);
        const panel = document.createElement('div');
        panel.classList.add('scenario-playscreen');

        const scenarioData = appData.playerData.activeScenarios?.[scenarioTabId];
        const scenarioName = scenarioData?.name || "Scenario"; // Use "Scenario" if name not yet set
        const outputDivId = `scenario-output-${scenarioTabId}`;
        let outputContentHTML = '';

        if (scenarioData) {
            // Scenario data exists (active or re-opened) - build its content
            console.log(`GAME: Rendering existing scenario data for ${scenarioTabId}`);
            outputContentHTML += `<h3>Initial Scene</h3><p>${(scenarioData.initialDescription || "No initial description.").replace(/\n/g, '<br>')}</p>`;
            outputContentHTML += `<div class="scenario-event-log-header">--- Event Log ---</div>`;
            if (scenarioData.eventLog && scenarioData.eventLog.length > 0) {
                scenarioData.eventLog.forEach(logEntry => {
                    const logClass = logEntry.type === 'player' ? 'player-command-log' : (logEntry.type === 'ai' ? 'ai-response-log' : 'system-message');
                    // Sanitize text before putting into innerHTML if it's user-generated or AI-generated
                    // For simplicity here, directly using text, but consider sanitization.
                    outputContentHTML += `<p class="${logClass}">${logEntry.text.replace(/\n/g, '<br>')}</p>`;
                });
            } else {
                outputContentHTML += `<p class="system-message">No events yet for this scenario.</p>`;
            }
        } else {
            // No specific scenario data yet, show the initial message (e.g., loading spinner)
            console.log(`GAME: No specific scenario data for ${scenarioTabId}, showing initial message.`);
            outputContentHTML = `<div class="in-tab-loading"><div class="spinner"></div><p>${initialDisplayMessage}</p></div>`;
        }

        panel.innerHTML = `
            <h3>${scenarioName}</h3>
            <div id="${outputDivId}" class="scenario-output-area">
                ${outputContentHTML}
            </div>
        `;

        // Ensure input area is shown if this scenario is active and meant to be interactive
        // This check is important for when tabs are switched.
        if (window.appShell && window.appShell.getActiveTabId() === scenarioTabId) {
            window.appShell.showInputArea();
        }

        // Auto-scroll the output area if content was populated
        // Needs to happen after the panel is added to the DOM and rendered.
        // This is better handled in main.js after renderTabPanelContent.
        // setTimeout(() => {
        //     const outputDiv = document.getElementById(outputDivId);
        //     if (outputDiv) outputDiv.scrollTop = outputDiv.scrollHeight;
        // }, 0);

        return panel;
    },

    getPatientTabContent: function (patientTabId, patientData) {
        const panel = document.createElement('div');
        panel.classList.add('patient-info-panel', 'tab-panel-content'); // Add a general class for padding if needed
        if (!patientData) {
            panel.innerHTML = `<h2>Patient Information</h2><p>Patient data not available for this scenario.</p>`;
            return panel;
        }
        panel.innerHTML = `
            <h2>Patient Information</h2>
            <div class="data-section"> <!-- Reuse data-section for consistent styling -->
                <p class="status-item"><strong>Condition:</strong> <span>${patientData.condition || 'N/A'}</span></p>
                <p class="status-item"><strong>Age:</strong> <span>${patientData.age || 'N/A'}</span></p>
                <p class="status-item"><strong>Sex:</strong> <span>${patientData.sex || 'N/A'}</span></p>
                <p class="status-item"><strong>Chief Complaint:</strong> <span>${patientData.chiefComplaint || 'N/A'}</span></p>
            </div>
            <div class="data-section">
                <h3>Initial Observations</h3>
                <p>${(patientData.initialObservations || "None provided.").replace(/\n/g, '<br>')}</p>
            </div>
            <div class="data-section">
                <h3>Medical Records</h3>
                <p>${(patientData.medicalRecords || "None available.").replace(/\n/g, '<br>')}</p>
            </div>
            <div class="data-section">
                <h3>Bystander/Family Statements</h3>
                <p>${(patientData.bystanderStatements || "None available.").replace(/\n/g, '<br>')}</p>
            </div>
        `;
        return panel;
    },

    handlePlayerCommand: async function (command, activeTabId, appData) { // Removed appendToMainContent, ui.js handles it
        console.log(`GAME: Command "${command}" for tab "${activeTabId}"`);
        let modified = false;
        if (!activeTabId.startsWith('scenario-')) return modified;

        const currentScenario = appData.playerData.activeScenarios[activeTabId];
        if (!currentScenario) {
            console.warn(`GAME: Active scenario data not found for tab ${activeTabId}`);
            ui.appendToScenarioLog(activeTabId, "Error: Current scenario data not found. Please try re-opening.", false);
            return modified;
        }

        // Ensure chatHistory array exists
        if (!currentScenario.chatHistory) currentScenario.chatHistory = [];

        ui.appendToScenarioLog(activeTabId, `> ${command}`, true); // Show player command in UI
        currentScenario.eventLog.push({ type: 'player', text: command, timestamp: Date.now() });
        modified = true;

        const thinkingMessageId = `thinking-${Date.now()}`;
        ui.appendToScenarioLog(activeTabId, `<p id="${thinkingMessageId}" class="system-message thinking-message">AI is thinking...</p>`, false);

        // Pass current chat history to gemini.ask
        const aiResponse = await gemini.ask(command, currentScenario.chatHistory);

        const thinkingElement = document.getElementById(thinkingMessageId);
        if (thinkingElement) thinkingElement.remove();

        if (aiResponse && aiResponse.text && !aiResponse.text.toLowerCase().startsWith("error:")) {
            ui.appendToScenarioLog(activeTabId, aiResponse.text, false); // Show AI response in UI
            currentScenario.eventLog.push({ type: 'ai', text: aiResponse.text, timestamp: Date.now() });

            // IMPORTANT: Update chatHistory in appData with both user prompt and model response
            currentScenario.chatHistory.push({ role: 'user', parts: [{ text: command }] });
            currentScenario.chatHistory.push({ role: 'model', parts: [{ text: aiResponse.text }] });
            // Limit history length if desired (e.g., last 10-20 turns)
            // const MAX_HISTORY_TURNS = 10; // 10 pairs of user/model messages
            // if (currentScenario.chatHistory.length > MAX_HISTORY_TURNS * 2) {
            //    currentScenario.chatHistory = currentScenario.chatHistory.slice(-MAX_HISTORY_TURNS * 2);
            // }
        } else {
            const errorMsg = (aiResponse && aiResponse.text) ? aiResponse.text : "AI response error or no text received. Please check API key or try again.";
            ui.appendToScenarioLog(activeTabId, errorMsg, false);
            currentScenario.eventLog.push({ type: 'system', text: errorMsg, timestamp: Date.now() });
            console.error("GAME: AI Response Error", aiResponse);
        }
        return modified;
    },

    endScenario: function (scenarioTabId, appData) {
        console.log(`GAME: Ending scenario ${scenarioTabId}`);
        let endedScenarioData = null;
        if (appData.playerData.activeScenarios && appData.playerData.activeScenarios[scenarioTabId]) {
            endedScenarioData = { ...appData.playerData.activeScenarios[scenarioTabId] }; // Clone
            endedScenarioData.closedTimestamp = Date.now(); // Add a timestamp when closed
            // Note: Success/failure and score would be determined here or before closing.
            // For now, we just mark it as closed.

            delete appData.playerData.activeScenarios[scenarioTabId];
            console.log(`GAME: Scenario ${scenarioTabId} removed from active.`);
        }
        if (window.appShell) window.appShell.hideInputArea();
        return endedScenarioData; // Return the data for "recently closed"
    }
};