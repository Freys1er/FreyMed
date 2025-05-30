// js/game.js

const game = {
    /**
     * Generates the content for the Home tab.
     * @param {Object} playerData - appData.playerData from main.js
     * @param {boolean} isApiKeySet - True if the API key is set.
     * @param {Function} onStartNewGameClick - Callback for "Start New Game" button.
     * @param {Function} onContinueGameClick - Callback for "Continue Game" button (if applicable).
     * @returns {HTMLElement} - The DOM element for the home panel content.
     */
    getHomePageContent: function(playerData, isApiKeySet, onStartNewGameClick, onContinueGameClick) {
        const panel = document.createElement('div');
        panel.classList.add('home-panel-content'); // Ensure this class exists in CSS for styling

        let welcomeMessage = "Welcome to Critical Choices: A Medical Simulator!";
        // Example: if (playerData && playerData.profile && playerData.profile.name) { welcomeMessage = ... }

        let statsSummary = "<p>No game data found. Start a new scenario!</p>";
        if (playerData && playerData.stats) {
            statsSummary = `
                <p>Operations Completed: ${playerData.stats.operationsCompleted || 0}</p>
                <p>Success Rate: ${playerData.stats.successRate || 0}%</p>
            `;
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
                <!-- Add continue button logic later if needed based on playerData -->
            </div>
        `;

        const startBtn = panel.querySelector('#home-start-new-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                // This would typically navigate to a scenario selection screen/tab
                // For now, let's just simulate starting one via appShell
                if (window.appShell && typeof window.appShell.addGlobalTab === 'function') {
                    const scenarioId = `scenario-er-${Date.now()}`; // Unique ID
                    window.appShell.addGlobalTab(scenarioId, "ER Case Alpha", true, true, (appDataForScenario) => {
                        return this.getScenarioPlayScreenContent(scenarioId, appDataForScenario);
                    });
                } else {
                    onStartNewGameClick(); // Fallback if appShell not ready or direct call needed
                }
            });
        }
        // Add event listener for continue button if it exists

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
        div.innerHTML = `<h2>My Notes</h2>`;
        const textArea = document.createElement('textarea');
        textArea.style.width = "95%";
        textArea.style.height = "calc(100% - 50px)"; // Adjust height
        textArea.style.minHeight = "300px";
        textArea.style.backgroundColor = "#222";
        textArea.style.color = "#ddd";
        textArea.style.border = "1px solid #444";
        textArea.style.padding = "10px";
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
     * @param {string} scenarioTabId - The ID of the scenario tab.
     * @param {Object} appData - The main application data object.
     * @returns {HTMLElement}
     */
    getScenarioPlayScreenContent: function(scenarioTabId, appData) {
        const panel = document.createElement('div');
        panel.classList.add('scenario-playscreen'); // For specific styling
        panel.innerHTML = `
            <h3>Scenario: ${scenarioTabId.replace('scenario-', '')}</h3>
            <p>Patient Vitals: BP 120/80, HR 75, RR 16, O2 98%</p>
            <p>Event Log: Patient stable.</p>
            <p>Actions: [Implement action list here]</p>
            <p>Type commands below or click actions.</p>
        `;
        // This is where you'd build the detailed ER/Surgery/GP play screen UI
        // It would likely have its own sub-tabs (Vitals, Events, Actions)
        // For now, it also makes the main input area visible:
        if (window.appShell) window.appShell.showInputArea();
        return panel;
    },

    /**
     * Handles player commands.
     * @param {string} command - The command entered by the player.
     * @param {string} activeTabId - The ID of the currently active tab.
     * @param {Object} appData - The main application data object (can be modified by this function).
     * @returns {boolean} - True if appData was modified and needs to be saved.
     */
    handlePlayerCommand: function(command, activeTabId, appData) {
        console.log(`Game received command: "${command}" for tab: "${activeTabId}"`);
        let modified = false;
        if (activeTabId.startsWith('scenario-')) {
            // Example: Update a mock event log in appData for the current scenario
            if (!appData.playerData.scenarios) appData.playerData.scenarios = {};
            if (!appData.playerData.scenarios[activeTabId]) appData.playerData.scenarios[activeTabId] = { eventLog: [] };

            appData.playerData.scenarios[activeTabId].eventLog.push(`Player commanded: ${command}`);
            modified = true;
            console.log("Scenario event log updated:", appData.playerData.scenarios[activeTabId].eventLog);

            // IMPORTANT: After modifying appData, the UI needs to be re-rendered
            // if the changes should be visible immediately.
            // main.js's renderActiveTabContent() will be called by the tab switching logic,
            // but for an in-tab update, main.js might need a way to trigger a content refresh for the active tab.
            // For now, we assume main.js will save on the next relevant event or tab switch.
            // Or, window.appShell.refreshCurrentTabContent(); (if such a function existed in main.js)
        }
        return modified; // Let main.js know if it should save appData
    },

    /**
     * Called when a scenario tab is closed.
     * @param {string} scenarioTabId - The ID of the scenario tab being closed.
     * @param {Object} appData - The main application data object.
     */
    endScenario: function(scenarioTabId, appData) { // appData is passed by main.js if needed for cleanup
        console.log(`Game logic for ending scenario: ${scenarioTabId}`);
        if (window.appShell) window.appShell.hideInputArea(); // Hide input when scenario ends

        // Clean up scenario-specific data in appData.playerData if necessary
        // For example, move completed scenario data to a 'completedScenarios' array
        // and remove it from any 'activeScenario' field.
        // if (appData.playerData.scenarios && appData.playerData.scenarios[scenarioTabId]) {
        //     delete appData.playerData.scenarios[scenarioTabId]; // Example cleanup
        // }
        // The actual save of appData happens in main.js's handleTabClose after this.
    }
};