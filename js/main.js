// js/main.js

// --- Application State ---
let appData = {}; // This will hold the single source of truth for savable data
let activeGlobalTabId = null;
let globalTabConfigurations = [];
let recentlyClosedScenarios = []; // NEW: To store data of recently closed scenarios

// --- Initialization ---
function initializeGame() {
    appData = storage.getAppData(); // From storage.js (which is now a global object)
    ui.applyFontPreference(appData.preferences.font || 'normal'); // From ui.js

    globalTabConfigurations = [
        { id: 'home', label: 'Home', isCloseable: false },
        { id: 'data', label: 'Data & Settings', isCloseable: false },
        { id: 'notes', label: 'Notes', isCloseable: false },
    ];

    // NEW: Attempt to load active tab from URL hash
    const initialHashTab = window.location.hash.substring(1); // Remove '#'
    if (initialHashTab && globalTabConfigurations.some(tab => tab.id === initialHashTab)) {
        activeGlobalTabId = initialHashTab;
    } else {
        // Existing logic for initial tab if no valid hash
        if (!appData.apiKey) {
            activeGlobalTabId = 'data';
        } else if (!appData.playerData || !appData.playerData.stats || appData.playerData.stats.operationsCompleted === 0) {
            activeGlobalTabId = 'home';
        } else {
            activeGlobalTabId = 'home';
        }
    }

    // NEW: Load recently closed scenarios from appData on startup
    recentlyClosedScenarios = appData.playerData?.recentlyClosedScenarios || [];

    // Ensure player stats are initialized if not present
    appData.playerData = appData.playerData || {};
    appData.playerData.stats = appData.playerData.stats || { operationsCompleted: 0, successRate: 0 };


    updateGlobalTabsAndContent();
}

// --- Tab Navigation and Management ---
function updateGlobalTabsAndContent() {
    ui.renderGlobalTabs(globalTabConfigurations, activeGlobalTabId, handleTabClick, handleTabClose);
    renderActiveTabContent();
    // NEW: Update URL hash to reflect active tab
    window.location.hash = activeGlobalTabId;
}

function handleTabClick(tabId) {
    if (activeGlobalTabId !== tabId) {
        activeGlobalTabId = tabId;
        updateGlobalTabsAndContent();
    }
}

function handleTabClose(tabId) {
    const essentialTabs = ['home', 'data'];

    // NEW: Logic for closing Home tab - closes all others
    if (tabId === 'home') {
        const confirmCloseHome = confirm("Closing the Home tab will close all other open tabs. Are you sure?");
        if (!confirmCloseHome) {
            return;
        }
        // Close all other tabs first (except essential ones not explicitly closable)
        // Filter out home and data, and any others that are not closeable, or are closeable but not scenarios
        const tabsToProcessAndClose = globalTabConfigurations.filter(tab =>
            tab.id !== 'home' && tab.id !== 'data' && (tab.isCloseable || tab.isCloseableOverride)
        );

        tabsToProcessAndClose.forEach(tabToClose => {
            if (tabToClose.id.startsWith('scenario-')) {
                const scenarioData = game.endScenario(tabToClose.id, appData);
                if (scenarioData) {
                    recentlyClosedScenarios.push(scenarioData);
                    if (recentlyClosedScenarios.length > 5) {
                        recentlyClosedScenarios.shift();
                    }
                }
            }
            ui.removeTabPanel(tabToClose.id); // Remove the panel from UI
        });

        // Reconstruct globalTabConfigurations to contain only essential tabs ('home', 'data', 'notes')
        globalTabConfigurations = globalTabConfigurations.filter(tab => ['home', 'data', 'notes'].includes(tab.id));

        // Always switch to home after closing everything else
        activeGlobalTabId = 'home';
        appData.playerData = appData.playerData || {};
        appData.playerData.recentlyClosedScenarios = recentlyClosedScenarios;
        storage.saveAppData(appData); // Save after all tabs are processed
        updateGlobalTabsAndContent(); // Re-render with only essential tabs
        return; // Exit as home tab processing is done
    }


    if (essentialTabs.includes(tabId) && !globalTabConfigurations.find(t => t.id === tabId)?.isCloseableOverride) {
        return; // Prevent closing essential tabs
    }

    // Handle scenario specific cleanup and saving for re-opening
    if (tabId.startsWith('scenario-')) {
        const scenarioData = game.endScenario(tabId, appData); // game.endScenario should return the data for re-opening
        if (scenarioData) {
            recentlyClosedScenarios.push(scenarioData);
            if (recentlyClosedScenarios.length > 5) { // Keep last 5
                recentlyClosedScenarios.shift();
            }
            appData.playerData = appData.playerData || {};
            appData.playerData.recentlyClosedScenarios = recentlyClosedScenarios;
            storage.saveAppData(appData); // Save after scenario ends
        }
    }

    globalTabConfigurations = globalTabConfigurations.filter(tab => tab.id !== tabId);
    ui.removeTabPanel(tabId);

    if (activeGlobalTabId === tabId) {
        activeGlobalTabId = globalTabConfigurations.find(tab => tab.id === 'home')?.id || globalTabConfigurations[0]?.id || null;
    }
    updateGlobalTabsAndContent();
}

/**
 * Adds a new global tab to the application UI.
 * @param {string} id - Unique ID for the tab.
 * @param {string} label - Display label for the tab.
 * @param {boolean} isCloseable - True if the tab can be closed.
 * @param {boolean} switchToNewTab - True if the app should switch to this new tab immediately.
 * @param {Function} contentGenerator - Function that returns the HTML content for the tab.
 */
function addGlobalTab(id, label, isCloseable = true, switchToNewTab = true, contentGenerator = null) {
    if (globalTabConfigurations.find(tab => tab.id === id)) {
        if (switchToNewTab) handleTabClick(id);
        return;
    }
    // Store the generator if provided, or use a default if it's a scenario without a custom generator
    const generatorFn = typeof contentGenerator === 'function' ?
        contentGenerator :
        (currentAppData) => game.getScenarioPlayScreenContent(id, currentAppData); // Default for scenarios

    globalTabConfigurations.push({ id, label, isCloseable, contentGenerator: generatorFn });
    if (switchToNewTab) activeGlobalTabId = id;
    updateGlobalTabsAndContent();
}

// --- Content Rendering Logic ---
function renderActiveTabContent() {
    if (!activeGlobalTabId) {
        ui.renderTabPanelContent('no-tabs-active', "No active tab.");
        return;
    }

    let contentElementOrHTML;
    const activeTabConfig = globalTabConfigurations.find(tab => tab.id === activeGlobalTabId);

    if (activeTabConfig && typeof activeTabConfig.contentGenerator === 'function') {
        contentElementOrHTML = activeTabConfig.contentGenerator(appData); // Pass appData
    } else {
        switch (activeGlobalTabId) {
            case 'home':
                contentElementOrHTML = game.getHomePageContent(
                    appData.playerData, // Pass playerData directly
                    !!appData.apiKey,
                    appShell.handleStartNewGame,
                    appShell.getRecentlyClosedScenarios,
                    appShell.reopenClosedScenario,
                    () => { /* Continue Game - TODO */ }
                );
                break;
            case 'data':
                contentElementOrHTML = ui.createDataManagementPanel(
                    appData,
                    handleApiKeyChange,
                    handleFontPreferenceChange,
                    handleImportRequest,
                    handleExportRequest
                );
                break;
            case 'notes':
                contentElementOrHTML = game.getNotesPageContent(appData.notes, (updatedNotes) => {
                    appData.notes = updatedNotes;
                    storage.saveAppData(appData); // Save notes immediately on change (debounced in game.js)
                });
                break;
            // Default case for dynamically created scenario/patient tabs is handled by contentGenerator in addGlobalTab
            default:
                // This might catch scenario/patient tabs if contentGenerator wasn't passed correctly
                // or for any other unexpected dynamic tab.
                const cachedScenarioData = appData.playerData.activeScenarios && appData.playerData.activeScenarios[activeGlobalTabId];
                if (activeGlobalTabId.startsWith('scenario-') && cachedScenarioData) {
                    // Re-render scenario from cached data if it's the active one
                    contentElementOrHTML = game.getScenarioPlayScreenContent(activeGlobalTabId, appData, cachedScenarioData.initialDescription);
                } else if (activeGlobalTabId.startsWith('patient-info-') && cachedScenarioData?.patientData) {
                    // Re-render patient info from cached data
                    contentElementOrHTML = game.getPatientTabContent(activeGlobalTabId, cachedScenarioData.patientData);
                } else {
                    contentElementOrHTML = `<h2>${activeGlobalTabId}</h2><p>Content definition missing or data not found.</p>`;
                }
                break;
        }
    }
    ui.renderTabPanelContent(activeGlobalTabId, contentElementOrHTML);
}

// --- Settings & Data Management Handlers ---
function handleApiKeyChange(newApiKey) {
    appData.apiKey = newApiKey;
    storage.saveAppData(appData);
    alert(newApiKey ? 'API Key Saved!' : 'API Key Cleared.');
    if (activeGlobalTabId === 'data' || activeGlobalTabId === 'home') {
        renderActiveTabContent(); // Re-render to update API key status
    }
}

function handleFontPreferenceChange(newFontValue) {
    if (!appData.preferences) appData.preferences = {};
    appData.preferences.font = newFontValue;
    storage.saveAppData(appData);
    ui.applyFontPreference(newFontValue);
}

function handleImportRequest(file) {
    storage.importAppData(file)
        .then((importedData) => {
            appData = importedData;
            alert('Data imported successfully! The game will refresh.');
            initializeGame(); // Re-initialize game with new data
        })
        .catch(err => {
            console.error("Import error in main.js:", err);
            alert('Error importing data: ' + err.message);
        });
}

function handleExportRequest() {
    storage.exportAppData();
}

// --- Input Area Management ---
const inputArea = document.getElementById('input-area');
const playerCommandInput = document.getElementById('player-command-input');
const submitCommandBtn = document.getElementById('submit-command-btn');

function showInputArea() {
    if (inputArea) inputArea.classList.remove('hidden');
    if (playerCommandInput) playerCommandInput.focus(); // Focus the input when shown
}
function hideInputArea() {
    if (inputArea) inputArea.classList.add('hidden');
}

if (submitCommandBtn && playerCommandInput) {
    submitCommandBtn.addEventListener('click', processPlayerCommand);
    playerCommandInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission if input is in a form
            processPlayerCommand();
        }
    });
}

function processPlayerCommand() {
    const command = playerCommandInput.value.trim();
    if (command) {
        // Display player command immediately in the active tab's main content log area
        ui.appendToMainContent(`> ${command}`, true); // Assuming ui.appendToMainContent exists
        playerCommandInput.value = ''; // Clear input

        const modified = game.handlePlayerCommand(command, activeGlobalTabId, appData, ui.appendToMainContent); // Pass appendToMainContent to game.js
        if (modified) {
            storage.saveAppData(appData);
            // Re-rendering the active tab content is typically not needed after a command
            // because game.handlePlayerCommand should append its responses directly.
            // If you have tab-specific data displays that need updating, call renderActiveTabContent();
        }
    }
}

// --- NEW: Scenario Generation and Tab Handling ---

/**
 * Parses the raw Gemini text response into structured scenario and patient data.
 * @param {string} responseText - The raw text response from Gemini.
 * @returns {Object} - An object containing `scenarioDescription` (string) and `patientData` (object).
 */
function parseGeminiScenarioData(responseText) {
    let scenarioDescription = "No scenario description provided.";
    let patientData = {
        condition: "Unknown", age: "Unknown", sex: "Unknown",
        chiefComplaint: "N/A", initialObservations: "No observations.",
        medicalRecords: "No records.", bystanderStatements: "No statements."
    };

    // Use regex to find sections based on headings
    const initialSceneMatch = responseText.match(/## Initial Scene:([\s\S]+?)(?=## Patient Information:|$)/i);
    if (initialSceneMatch && initialSceneMatch[1]) {
        scenarioDescription = initialSceneMatch[1].trim();
    }

    const patientInfoMatch = responseText.match(/## Patient Information:([\s\S]+)/i);
    if (patientInfoMatch && patientInfoMatch[1]) {
        const patientInfoBlock = patientInfoMatch[1].trim();

        patientData.condition = patientInfoBlock.match(/Condition:\s*(.+)/i)?.[1]?.trim() || patientData.condition;
        patientData.age = patientInfoBlock.match(/Age:\s*(.+)/i)?.[1]?.trim() || patientData.age;
        patientData.sex = patientInfoBlock.match(/Sex:\s*(.+)/i)?.[1]?.trim() || patientData.sex;
        patientData.chiefComplaint = patientInfoBlock.match(/Chief Complaint:\s*(.+)/i)?.[1]?.trim() || patientData.chiefComplaint;

        // Using positive lookahead to find next section or end of block
        patientData.initialObservations = patientInfoBlock.match(/Initial observations:\s*([\s\S]+?)(?=(Medical Records:|Bystander\/Family Statements:|$))/i)?.[1]?.trim() || patientData.initialObservations;
        patientData.medicalRecords = patientInfoBlock.match(/Medical Records:\s*([\s\S]+?)(?=(Bystander\/Family Statements:|$))/i)?.[1]?.trim() || patientData.medicalRecords;
        patientData.bystanderStatements = patientInfoBlock.match(/Bystander\/Family Statements:\s*([\s\S]+)/i)?.[1]?.trim() || patientData.bystanderStatements;
    }

    return { scenarioDescription, patientData };
}

/**
 * Handles the entire process of starting a new game/scenario.
 * This function is called when the 'Start New Scenario' button is clicked.
 * @param {Object} reopenData - Optional. If provided, reopens an existing scenario.
 */
async function handleStartNewGame(reopenData = null) {
    // 1. Initial checks
    if (!gemini.isReady()) {
        ui.appendToMainContent("Cannot start a new scenario: Gemini AI is not ready. Please configure your API key.", false);
        return;
    }

    // Disable the start button to prevent multiple clicks
    appShell.disableStartGameButton(true);

    // Reset Gemini chat for a fresh start to the scenario context ONLY if starting a brand new scenario
    if (!reopenData) {
        gemini.resetChat();
        // Increment scenario number for new scenarios
        appData.playerData.stats.operationsCompleted = (appData.playerData.stats.operationsCompleted || 0) + 1;
        storage.saveAppData(appData); // Save immediately to reflect the new number
    }

    // Generate unique IDs for the new scenario and patient tabs
    const scenarioId = reopenData ? reopenData.id : `scenario-er-${Date.now()}`;
    const patientTabId = `patient-info-${scenarioId}`;

    let scenarioContentDiv = null; // Declare this to be accessible in finally block

    try {
        // 2. Open the main "Scenario" tab immediately with its local loading indicator
        appShell.addGlobalTab(
            scenarioId,
            reopenData ? reopenData.name : `ER Case ${appData.playerData.stats.operationsCompleted}`, // Tab label
            true, // Is closable
            true, // Switch to this new tab immediately
            (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData) // game.js provides the initial loading UI
        );
        appShell.showInputArea(); // Ensure the command input area is visible

        // Get a reference to the specific content area within the newly opened tab
        // CORRECTED ID: Use scenario-output-${scenarioId} consistently
        scenarioContentDiv = document.getElementById(`scenario-output-${scenarioId}`);
        if (scenarioContentDiv) {
            // Update the initial content with the loading spinner/message
            scenarioContentDiv.innerHTML = `
                <div class="in-tab-loading">
                    <div class="spinner"></div>
                    <p>${reopenData ? 'Re-opening scenario...' : 'Generating initial scenario and patient details...'}</p>
                </div>
            `;
        } else {
            console.warn(`Could not find scenario content div for ID: scenario-output-${scenarioId}. Content may not display correctly.`);
            ui.appendToMainContent(`${reopenData ? 'Re-opening' : 'AI is generating'} your new medical scenario...`, false); // Fallback to global log
        }

        let scenarioDescription, patientData, eventLog;
        if (reopenData) {
            // If re-opening, use existing data
            scenarioDescription = reopenData.initialDescription;
            patientData = reopenData.patientData;
            eventLog = reopenData.eventLog;

            // Re-feed chat history to Gemini for context
            gemini.resetChat(); // Clear current chat history first
            eventLog.forEach(log => {
                if (log.startsWith('Player commanded:')) {
                    gemini.addMessageToHistory('user', log.substring('Player commanded:'.length).trim());
                } else if (log.startsWith('AI Response:')) {
                    gemini.addMessageToHistory('model', log.substring('AI Response:'.length).trim());
                }
            });
            ui.appendToMainContent(`Scenario "${reopenData.name}" re-opened.`, false);
        } else {
            // 3. Make the primary AI call for scenario and patient data
            const initialScenarioPrompt = `
                Generate a new medical emergency room scenario. Describe the immediate scene, the patient's visible condition, and what first responders or bystanders are saying. Use the heading "## Initial Scene:". Provide detailed patient information including: Condition, Age, Sex, Chief Complaint, Initial physical assessment observations, Medical Records (brief history a person might carry), and Bystander/Family Statements. Use the heading "## Patient Information:" for the patient section and specific sub-headings like "Condition:", "Age:", etc., for patient details.
            `;
            const rawGeminiResponse = await gemini.ask(initialScenarioPrompt); // Await full object

            // Handle potential AI errors or empty responses
            if (!rawGeminiResponse || rawGeminiResponse.startsWith("Error:")) {
                const errorMessage = rawGeminiResponse || "Failed to get initial scenario details from Gemini. Check API key.";
                if (scenarioContentDiv) {
                    scenarioContentDiv.innerHTML = `<p style="color: salmon;">${errorMessage}</p>`;
                }
                ui.appendToMainContent(errorMessage, false);
                return; // Exit if AI failed
            }

            // 4. Parse the Gemini response
            const parsedData = parseGeminiScenarioData(rawGeminiResponse);
            scenarioDescription = parsedData.scenarioDescription;
            patientData = parsedData.patientData;
            eventLog = [`Scenario started: ${new Date().toLocaleString('en-US')}`, `Initial Scene: ${scenarioDescription}`];
            ui.appendToMainContent("Scenario and Patient Info generated successfully! Check the 'Patient Info' tab for details.", false);
        }

        // 5. Store the generated/reopened data in appData for persistence
        appData.playerData.activeScenarios = appData.playerData.activeScenarios || {};
        appData.playerData.activeScenarios[scenarioId] = {
            id: scenarioId,
            name: reopenData ? reopenData.name : `ER Case ${appData.playerData.stats.operationsCompleted}`, // Use the incremented number
            initialDescription: scenarioDescription,
            patientData: patientData,
            eventLog: eventLog
        };
        storage.saveAppData(appData);

        // 6. Update the specific scenario content div with the actual description and event log
        if (scenarioContentDiv) {
            scenarioContentDiv.innerHTML = `
                <h3>Initial Scene</h3>
                <p>${scenarioDescription.replace(/\n/g, '<br>')}</p>
                <div class="scenario-event-log">
                    ${eventLog.map(entry => `<p>${entry}</p>`).join('')}
                </div>
                <p style="margin-top: 15px; color: #aaa;">You can now interact with the scenario using the command input below.</p>
            `;
            scenarioContentDiv.scrollTop = scenarioContentDiv.scrollHeight; // Scroll to bottom
        }

        // 7. Open the new "Patient Info" tab (if not already open)
        if (!globalTabConfigurations.find(tab => tab.id === patientTabId)) {
            appShell.addGlobalTab(
                patientTabId,
                "Patient Info",
                true, // Is closable
                false, // Do NOT activate immediately; keep "Current Scenario" active
                (currentAppData) => game.getPatientTabContent(patientTabId, patientData)
            );
        } else {
            // If already open, just re-render to update content if needed (e.g., if re-opening)
            appShell.refreshTabContent(patientTabId);
        }

        // Remove from recentlyClosedScenarios if it was re-opened
        if (reopenData) {
            recentlyClosedScenarios = recentlyClosedScenarios.filter(s => s.id !== reopenData.id);
            appData.playerData.recentlyClosedScenarios = recentlyClosedScenarios;
            storage.saveAppData(appData);
            // Force refresh home tab to update the "Closed Scenarios" list
            if (activeGlobalTabId === 'home') {
                 renderActiveTabContent();
            }
        }

    } catch (error) {
        console.error("Error during scenario start/reopen:", error);
        const errorMessage = `Error starting scenario: ${error.message || "Unknown error."}`;
        if (scenarioContentDiv) {
            scenarioContentDiv.innerHTML = `<p style="color: salmon;">${errorMessage}</p>`;
        }
        ui.appendToMainContent(errorMessage, false);
    } finally {
        // 8. Re-enable the start button
        appShell.disableStartGameButton(false);
    }
}


// --- Global Event Listeners & Game Start ---
document.addEventListener('DOMContentLoaded', initializeGame);
// NEW: Listen for hash changes to update active tab
window.addEventListener('hashchange', () => {
    const newHashTab = window.location.hash.substring(1);
    // Only switch if the hash refers to an existing tab or is empty (go to home)
    if (newHashTab && globalTabConfigurations.some(tab => tab.id === newHashTab)) {
        handleTabClick(newHashTab);
    } else if (!newHashTab && activeGlobalTabId !== 'home') {
        // If hash is cleared, go to home
        handleTabClick('home');
    }
});

// Expose necessary functions/data to global scope if other modules need them
window.appShell = {
    addGlobalTab,
    showInputArea,
    hideInputArea,
    getActiveTabId: () => activeGlobalTabId,
    getAppData: () => appData, // Allow game.js to read current appData
    saveGameData: () => storage.saveAppData(appData), // Allow game.js to trigger saves
    refreshCurrentTabContent: () => { // Utility to force a re-render of active tab content
        if (activeGlobalTabId) {
            renderActiveTabContent();
        }
    },
    refreshTabContent: (tabId) => { // NEW: Utility to force re-render specific tab content
        const tabConfig = globalTabConfigurations.find(tab => tab.id === tabId);
        if (tabConfig) {
            ui.renderTabPanelContent(tabId, tabConfig.contentGenerator(appData));
        }
    },
    // New functions for managing the start button state
    handleStartNewGame, // Expose the new handler
    disableStartGameButton: function(disable) { // Expose disable function
        // This is a direct call to the internal function
        const startBtn = document.getElementById('home-start-new-game');
        if (startBtn) {
            startBtn.disabled = disable;
            startBtn.textContent = disable ? "Starting..." : "Start New Scenario"; // Dynamic text for button
            startBtn.style.cursor = disable ? 'not-allowed' : 'pointer';
            startBtn.style.opacity = disable ? '0.7' : '1';
        }
    },
    appendToMainContent: ui.appendToMainContent, // Assuming ui.appendToMainContent is the way to append
    getRecentlyClosedScenarios: () => recentlyClosedScenarios, // NEW: Expose accessor for closed scenarios
    reopenClosedScenario: (scenarioId) => { // NEW: Expose function to re-open
        const scenarioToReopen = recentlyClosedScenarios.find(s => s.id === scenarioId);
        if (scenarioToReopen) {
            handleStartNewGame(scenarioToReopen); // Call the start function with the saved data
        } else {
            console.warn(`Attempted to re-open unknown scenario: ${scenarioId}`);
        }
    }
};