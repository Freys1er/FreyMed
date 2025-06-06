// js/main.js (Only the initializeGame function and its direct dependencies within main.js)

// Assume these are defined globally or at the top of main.js
let appData = {};
let activeGlobalTabId = null;
let globalTabConfigurations = []; // This will be populated by initializeGame
// let isScenarioStarting = false; // Not directly used in initializeGame but part of global state
// let logicTimerId = null; // Also not directly used in initializeGame but part of global state

// Assume these functions are defined elsewhere in main.js or globally via window.appShell
// - storage.getAppData
// - gemini.isReady, gemini.initialize
// - ui.applyFontPreference, ui.updateFooterTimerDisplay
// - updateGlobalTabsAndContent (defined in main.js)
// - addPulseOximeterTabForScenario (defined in main.js)
// - game.getScenarioPlayScreenContent (defined in game.js)
// - window.animations.startAnimationLoop (defined in animations.js)
// - startGlobalGameTimerLogic (defined in main.js)
// js/main.js (near the top)
let currentMonitorsScreenInstance = null;

function initializeGame() {
    console.log("MAIN: Initializing game...");
    appData = storage.getAppData(); // Load all persisted data
    window.audioManager.init();
    console.log("MAIN: Loaded appData:", JSON.parse(JSON.stringify(appData))); // Log a deep copy

    // Initialize Gemini if API key exists
    if (appData.apiKey && typeof gemini !== 'undefined' && !gemini.isReady()) {
        console.log("MAIN: API key found, initializing Gemini...");
        gemini.initialize(appData.apiKey);
    }

    // Apply user preferences
    if (typeof ui !== 'undefined' && typeof ui.applyFontPreference === 'function') {
        ui.applyFontPreference(appData.preferences?.font || 'normal');
    }

    // --- Setup Base Global Tab Configurations ---
    globalTabConfigurations = [
        {
            id: 'home',
            label: 'Home',
            isCloseable: false,
            contentGenerator: (currentAppData) => window.homeScreen?.getContentElement?.(
                currentAppData.playerData,
                !!currentAppData.apiKey,
                window.appShell?.handleStartNewGame, // Assuming appShell is defined by end of main.js
                window.appShell?.getRecentlyClosedScenarios,
                window.appShell?.reopenClosedScenario
            ) || Promise.resolve(document.createTextNode("Home Screen Error: Module not fully loaded."))
        },
        { // MODIFIED FOR DATA MANAGEMENT SCREEN
            id: 'data',
            label: 'Data & Settings',
            isCloseable: false,
            contentGenerator: (currentAppData) => { // This now returns a Promise
                if (window.dataManagementScreen && typeof window.dataManagementScreen.getContentElement === 'function') {
                    return window.dataManagementScreen.getContentElement(
                        currentAppData, // Pass full appData
                        window.appShell.handleApiKeyChange, // Pass callbacks from appShell
                        window.appShell.handleFontPreferenceChange,
                        window.appShell.handleImportRequest,
                        window.appShell.handleExportRequest
                    );
                } else {
                    console.error("MAIN: dataManagementScreen.getContentElement not found!");
                    return Promise.resolve(document.createTextNode("Error: Data/Settings module failed to load."));
                }
            }
        },
        {
            id: 'notes',
            label: 'Notes',
            isCloseable: false,
            contentGenerator: (currentAppData) => window.notesScreen?.getContentElement?.(
                currentAppData.notes,
                (updatedNotes) => { // Callback to save notes
                    currentAppData.notes = updatedNotes;
                    storage.saveAppData(currentAppData);
                }
            ) || Promise.resolve(document.createTextNode("Notes Screen Error: Module not fully loaded."))
        },
        { // MONITORS TAB CONFIGURATION
            id: 'monitors-main',
            label: 'Patient Monitors',
            isCloseable: false, // Or false, depending on your preference
            contentGenerator: (currentAppData) => { // This function is key
                console.log("MAIN: Monitors Tab contentGenerator CALLED.");
                let activeScenarioForMonitorsId = null;

                // Determine which scenario's monitors to show.
                // Priority: 1. Globally active scenario tab. 2. First active scenario found.
                if (window.appShell && activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
                    activeScenarioForMonitorsId = activeGlobalTabId;
                } else if (currentAppData.playerData && currentAppData.playerData.activeScenarios) {
                    // Find the first scenario ID that has data in activeScenarios
                    // This is a fallback if no main scenario tab is currently "active" in the UI
                    // but monitors tab is clicked.
                    activeScenarioForMonitorsId = Object.keys(currentAppData.playerData.activeScenarios).find(
                        id => currentAppData.playerData.activeScenarios[id]
                    );
                }

                console.log("MAIN: Monitors Tab - Determined scenarioId for monitors:", activeScenarioForMonitorsId);

                if (activeScenarioForMonitorsId && currentAppData.playerData.activeScenarios[activeScenarioForMonitorsId]) {
                    const scenarioData = currentAppData.playerData.activeScenarios[activeScenarioForMonitorsId];
                    if (window.monitorsScreen && typeof window.monitorsScreen.getContentElement === 'function') {
                        console.log("MAIN: Monitors Tab - Calling monitorsScreen.getContentElement for scenario:", scenarioData.id);
                        // Pass initial visibility states from appData for this scenario
                        const initialMonitorVisibilityStates = scenarioData.visibleMonitors || {};
                        // currentMonitorsScreenInstance might be set here or inside getContentElement if it's a singleton-like pattern
                        // For now, assume getContentElement creates/returns the element and might set currentMonitorsScreenInstance itself
                        return window.monitorsScreen.getContentElement(scenarioData.id, scenarioData.name, initialMonitorVisibilityStates); // This returns a Promise<HTMLElement>
                    } else {
                        console.error("MAIN: Monitors Tab - window.monitorsScreen.getContentElement not found!");
                        return Promise.resolve(document.createTextNode("Error: Monitors screen module failed to load.")); // Return a promise resolving to an element
                    }
                } else {
                    console.log("MAIN: Monitors Tab - No active scenario found or scenario data missing for monitors display.");
                    // Return a valid HTMLElement or a promise resolving to one
                    const noScenarioPanel = document.createElement('div');
                    noScenarioPanel.className = 'tab-panel-placeholder'; // Add a class for styling
                    noScenarioPanel.innerHTML = `
                        <h2>Patient Monitors</h2>
                        <p style="text-align: center; color: #888; margin-top: 20px;">
                            Please start or select an active scenario to view patient monitors.
                        </p>`;
                    return Promise.resolve(noScenarioPanel); // Wrap in Promise.resolve if other paths return promises
                }
            }
        }
    ];
    console.log("MAIN: Initial static globalTabConfigurations set:", globalTabConfigurations.length);

    // --- Restore Active Scenario Tabs (as main scenario tabs first) ---
    if (appData.playerData && appData.playerData.activeScenarios) {
        for (const scenarioId in appData.playerData.activeScenarios) {
            const scenario = appData.playerData.activeScenarios[scenarioId];
            // Ensure timer fields are present for older saves
            if (!scenario.hasOwnProperty('elapsedSeconds')) scenario.elapsedSeconds = 0;
            if (!scenario.hasOwnProperty('isPaused')) scenario.isPaused = false;
            if (!scenario.startTimestamp) scenario.startTimestamp = Date.now();
            scenario.lastUpdatedTimestamp = Date.now(); // Always reset for current session's tracking
            scenario.lastMonitorLogicUpdate = Date.now();


            if (!globalTabConfigurations.find(t => t.id === scenarioId)) {
                console.log(`MAIN: Restoring active SCENARIO tab config: ${scenarioId} - ${scenario.name}`);
                globalTabConfigurations.push({
                    id: scenarioId,
                    label: scenario.name || "Scenario",
                    isCloseable: true,
                    contentGenerator: (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData)
                });
            }
        }
    }
    console.log("MAIN: globalTabConfigurations after restoring scenarios:", globalTabConfigurations.length);

    // --- Determine Initial Tab to Activate (considering hash) ---
    const initialHashTabId = window.location.hash.substring(1);
    let tabToActivate = 'home'; // Default

    if (initialHashTabId) {
        console.log("MAIN: Initial hash found:", initialHashTabId);
        // Check if hash is for an already configured tab (static, or a main scenario tab)
        if (globalTabConfigurations.some(tab => tab.id === initialHashTabId)) {
            tabToActivate = initialHashTabId;
            console.log("MAIN: Hash matches existing configured tab:", tabToActivate);
        }
        // Check if hash is for a monitor tab (which needs its parent scenario and itself configured)
        else if (initialHashTabId.startsWith('pulseox-monitor-')) {
            const scenarioIdForMonitor = initialHashTabId.replace('pulseox-monitor-', '');
            const mainScenarioExists = globalTabConfigurations.some(t => t.id === scenarioIdForMonitor);
            const scenarioData = appData.playerData.activeScenarios?.[scenarioIdForMonitor];

            if (mainScenarioExists && scenarioData) {
                console.log(`MAIN: Hash is for PulseOx tab ${initialHashTabId}. Ensuring its config.`);
                // addPulseOximeterTabForScenario will handle if already in globalTabConfigurations
                // It will be called below if this tab is to be activated.
                // For now, just mark it as the one to activate.
                tabToActivate = initialHashTabId;
            } else {
                console.warn(`MAIN: Hash for monitor ${initialHashTabId}, but main scenario ${scenarioIdForMonitor} config or data not found. Defaulting.`);
                tabToActivate = 'home'; // Fallback
            }
        }
        // Add similar blocks for other monitor types if they can be hash-linked
    }

    // Fallback activation logic if hash didn't resolve or wasn't present
    if (tabToActivate === 'home' && !initialHashTabId) { // Only apply fallback if no hash tried to set it
        if (!appData.apiKey) tabToActivate = 'data';
        else if (!appData.playerData || !appData.playerData.stats || appData.playerData.stats.operationsCompleted === 0) tabToActivate = 'home';
        // else tabToActivate remains 'home'
    }

    // If tabToActivate is a monitor but not yet in globalTabConfigurations, add it now.
    // This covers the case where the hash points directly to a monitor tab.
    if (tabToActivate.startsWith('pulseox-monitor-') && !globalTabConfigurations.some(t => t.id === tabToActivate)) {
        const scenarioIdForMonitor = tabToActivate.replace('pulseox-monitor-', '');
        const scenarioData = appData.playerData.activeScenarios?.[scenarioIdForMonitor];
        if (scenarioData && typeof addPulseOximeterTabForScenario === "function") { // Ensure function is defined
            addPulseOximeterTabForScenario(scenarioIdForMonitor, scenarioData.name, {}); // Add with default vitals initially
        } else if (!scenarioData) {
            console.warn(`MAIN: Cannot add PulseOx tab for ${tabToActivate} from hash; scenario data ${scenarioIdForMonitor} missing. Defaulting active tab.`);
            tabToActivate = 'home'; // Fallback
        }
    }
    // Add for other monitors (ECG, NBP) similarly

    activeGlobalTabId = tabToActivate;
    console.log("MAIN: Final initial active tab ID selected:", activeGlobalTabId);

    // --- Perform Initial UI Rendering and Start Loops ---
    if (typeof updateGlobalTabsAndContent === "function") {
        updateGlobalTabsAndContent(); // This renders tabs and the active panel
    } else {
        console.error("MAIN: updateGlobalTabsAndContent function is not defined!");
    }


    // Explicitly update footer timer for the initial active scenario if it exists
    // This should happen AFTER updateGlobalTabsAndContent has run, which calls renderActiveTabContent
    // renderActiveTabContent itself should handle initial timer display for its content.
    // This is a bit redundant but ensures footer is set.
    if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        const currentScenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
        if (currentScenario && typeof ui !== 'undefined') {
            ui.updateFooterTimerDisplay(currentScenario.elapsedSeconds, currentScenario.isPaused);
        } else if (typeof ui !== 'undefined') {
            ui.updateFooterTimerDisplay(null);
        }
    } else if (typeof ui !== 'undefined') {
        ui.updateFooterTimerDisplay(null);
    }

    if (window.animations && typeof window.animations.startAnimationLoop === 'function') {
        window.animations.startAnimationLoop(); // <<< START THE ANIMATION LOOP
    } else {
        console.error("MAIN: animations.startAnimationLoop function not found!");
    }
    console.log("MAIN: Initialization complete.");
}

// --- Tab Navigation and Management ---
function updateGlobalTabsAndContent() {
    console.log("MAIN_updateGlobalTabs: Active Tab:", activeGlobalTabId, "Tab Configs:", globalTabConfigurations.length);
    ui.renderGlobalTabs(globalTabConfigurations, activeGlobalTabId, handleTabClick, handleTabClose);
    renderActiveTabContent(); // This will render the content of activeGlobalTabId
    window.location.hash = activeGlobalTabId || "";
}


function handleTabClick(tabId) {
    const previousActiveTabId = activeGlobalTabId;
    if (previousActiveTabId !== tabId) {
        // No need to manually update elapsedSeconds of old tab here,
        // the logic loop in animations.js handles it based on _lastLogicUpdateTime.
        activeGlobalTabId = tabId;
        if (activeGlobalTabId.startsWith('scenario-')) {
            const newScenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
            if (newScenario && !newScenario.isPaused) {
                // When a tab becomes active, ensure its lastUpdatedTimestamp is fresh
                // so the logic in animations.js doesn't calculate a huge leap.
                newScenario.lastUpdatedTimestamp = Date.now();
                newScenario.lastMonitorLogicUpdate = Date.now();
            }
        }
        if (window.animations) window.animations.resetDisplayOptimizationFlags();
        updateGlobalTabsAndContent();
    }
}

function handleTabClose(tabId) {
    console.log("MAIN: Closing tab:", tabId);
    const essentialTabs = ['home', 'data', 'notes'];
    if (tabId === 'home') {
        const scenarioTabs = globalTabConfigurations.filter(t => t.id.startsWith('scenario-'));
        if (scenarioTabs.length > 0) {
            const confirmCloseAll = confirm("Closing 'Home' while scenarios are open will close all active scenarios. Are you sure?");
            if (confirmCloseAll) scenarioTabs.forEach(scenarioTab => handleTabClose(scenarioTab.id));
            else return;
        }
        activeGlobalTabId = 'home';
        updateGlobalTabsAndContent();
        return;
    }
    if (essentialTabs.includes(tabId) && !globalTabConfigurations.find(t => t.id === tabId)?.isCloseableOverride) {
        console.warn("MAIN: Attempt to close essential tab prevented:", tabId);
        return;
    }
    if (tabId === 'monitors-main' && currentMonitorsScreenInstance) {
        currentMonitorsScreenInstance.cleanup(); // Cleanup monitor instances
        currentMonitorsScreenInstance = null;
    }
    if (tabId.startsWith('scenario-')) {
        const endedScenario = game.endScenario(tabId, appData);
        if (endedScenario) {
            appData.playerData.recentlyClosedScenarios = appData.playerData.recentlyClosedScenarios || [];
            appData.playerData.recentlyClosedScenarios.unshift(endedScenario);
            if (appData.playerData.recentlyClosedScenarios.length > 5) appData.playerData.recentlyClosedScenarios.pop();
        }
        // No direct gemini.clearChatSession as gemini.js is stateless regarding history now
    }
    globalTabConfigurations = globalTabConfigurations.filter(tab => tab.id !== tabId);
    ui.removeTabPanel(tabId);
    if (activeGlobalTabId === tabId) {
        activeGlobalTabId = globalTabConfigurations.find(tab => tab.id === 'home')?.id || globalTabConfigurations[0]?.id || null;
    }
    storage.saveAppData(appData);
    updateGlobalTabsAndContent();
}

function addGlobalTab(id, label, isCloseable = true, switchToNewTab = true, contentGenerator = null) {
    console.log(`MAIN_addGlobalTab: Adding tab with ID: ${id}, Label: ${label}, Closeable: ${isCloseable}, SwitchTo: ${switchToNewTab}`);
    if (globalTabConfigurations.find(tab => tab.id === id)) {
        console.warn(`MAIN_addGlobalTab: Tab with id "${id}" already exists. Will attempt to switch if switchToNewTab is true.`);
        if (switchToNewTab) {
            handleTabClick(id); // This will set activeGlobalTabId and call updateGlobalTabsAndContent
        }
        return; // Important to return here to prevent adding duplicate config
    }

    const generatorFn = typeof contentGenerator === 'function' ? contentGenerator :
        (currentAppData) => game.getScenarioPlayScreenContent(id, currentAppData, "Loading details..."); // Fallback for scenarios

    globalTabConfigurations.push({ id, label, isCloseable, contentGenerator: generatorFn });
    console.log("MAIN_addGlobalTab: globalTabConfigurations updated:", JSON.parse(JSON.stringify(globalTabConfigurations)));

    if (switchToNewTab) {
        console.log(`MAIN_addGlobalTab: Switching to new tab ${id}`);
        // handleTabClick will set activeGlobalTabId and call updateGlobalTabsAndContent
        handleTabClick(id);
    } else {
        // If not switching, we still need to re-render the tab bar to show the new (but not active) tab.
        console.log("MAIN_addGlobalTab: New tab added but not switched. Re-rendering tab bar.");
        // We only want to re-render the tabs, not necessarily the content panel of the *currently* active tab
        // unless the active tab IS the one being added.
        // The current updateGlobalTabsAndContent will re-render everything. This is usually fine.
        ui.renderGlobalTabs(globalTabConfigurations, activeGlobalTabId, handleTabClick, handleTabClose);
    }
    // updateGlobalTabsAndContent(); // This might be redundant if handleTabClick is called or if only tab bar needs update
}

// --- Content Rendering Logic ---
function renderActiveTabContent() {
    console.log("MAIN: Rendering content for active tab:", activeGlobalTabId);
    if (!activeGlobalTabId) {
        ui.renderTabPanelContent('no-tabs-active', "No active tab selected."); // From ui.js
        return;
    }

    let contentPromiseOrElement; // Can be a direct element or a promise that resolves to one
    const activeTabConfig = globalTabConfigurations.find(tab => tab.id === activeGlobalTabId);

    if (activeTabConfig && typeof activeTabConfig.contentGenerator === 'function') {
        contentPromiseOrElement = activeTabConfig.contentGenerator(appData); // This might be a Promise now
    } else {
        switch (activeGlobalTabId) {
            case 'home':
                // The contentGenerator for 'home' will be set up in initializeGame
                // This switch case might become redundant if all tabs use contentGenerators
                console.warn("MAIN: 'home' tab should use a contentGenerator. Falling back (might be empty).");
                contentPromiseOrElement = document.createElement('div'); // Empty div as fallback
                break;
            case 'data':
                contentPromiseOrElement = ui.createDataManagementPanel(
                    appData, handleApiKeyChange, handleFontPreferenceChange,
                    handleImportRequest, handleExportRequest
                );
                break;
            case 'notes':
                contentPromiseOrElement = game.getNotesPageContent(appData.notes, (updatedNotes) => {
                    appData.notes = updatedNotes;
                    storage.saveAppData(appData);
                });
                break;
            default:
                contentPromiseOrElement = `<h2>${activeGlobalTabId}</h2><p>Static content definition missing.</p>`;
                break;
        }
    }

    // Handle if content is a Promise (from fetching HTML) or a direct HTMLElement/string
    if (contentPromiseOrElement instanceof Promise) {
        // Display a loading state in the panel while content is fetching
        const tempLoadingPanel = document.createElement('div');
        tempLoadingPanel.className = 'in-tab-loading'; // Use your loading style
        tempLoadingPanel.innerHTML = '<div class="spinner"></div><p>Loading tab content...</p>';
        ui.renderTabPanelContent(activeGlobalTabId, tempLoadingPanel); // Show loading

        contentPromiseOrElement.then(element => {
            // Only render if the tab is still the active one (user might have clicked away)
            if (activeGlobalTabId === activeTabConfig?.id) {
                ui.renderTabPanelContent(activeGlobalTabId, element);
                afterContentRenderedLogic(activeGlobalTabId); // Scroll, etc.
            }
        }).catch(error => {
            console.error(`MAIN: Error loading content for tab ${activeGlobalTabId}:`, error);
            if (activeGlobalTabId === activeTabConfig?.id) {
                ui.renderTabPanelContent(activeGlobalTabId, `<p class="error-message">Failed to load content for ${activeTabConfig.label}.</p>`);
            }
        });
    } else {
        // Content is already an HTMLElement or string
        ui.renderTabPanelContent(activeGlobalTabId, contentPromiseOrElement);
        afterContentRenderedLogic(activeGlobalTabId); // Scroll, etc.
    }
}
function afterContentRenderedLogic(tabId) {
    if (tabId && tabId.startsWith('scenario-')) {
        setTimeout(() => {
            const outputDivId = `scenario-output-${tabId}`;
            const outputDiv = document.getElementById(outputDivId);
            if (outputDiv) {
                outputDiv.scrollTop = outputDiv.scrollHeight;
            }
        }, 0);
    }
    // Add any other logic needed after content is in the DOM
}

// --- Settings & Data Management Handlers ---
function handleApiKeyChange(newApiKey) {
    console.log("MAIN: API Key changed in UI (first 5):", newApiKey ? newApiKey.substring(0, 5) : "EMPTY");
    appData.apiKey = newApiKey;
    gemini.initialize(newApiKey);
    storage.saveAppData(appData);
    alert(newApiKey ? 'API Key Saved! Gemini AI ready.' : 'API Key Cleared. Gemini AI disabled.');
    if (activeGlobalTabId === 'data' || activeGlobalTabId === 'home') renderActiveTabContent();
}
function handleFontPreferenceChange(newFontValue) {
    console.log("MAIN: Font preference changed to:", newFontValue);
    if (!appData.preferences) appData.preferences = {};
    appData.preferences.font = newFontValue;
    storage.saveAppData(appData);
    ui.applyFontPreference(newFontValue);
}
function handleImportRequest(file) {
    console.log("MAIN: Import requested for file:", file.name);
    storage.importAppData(file)
        .then((importedData) => {
            appData = importedData;
            if (appData.apiKey) gemini.initialize(appData.apiKey);
            alert('Data imported successfully! The game will refresh.');
            initializeGame();
        })
        .catch(err => {
            console.error("MAIN: Import error:", err);
            alert('Error importing data: ' + err.message);
        });
}
function handleExportRequest() {
    console.log("MAIN: Export requested.");
    storage.exportAppData();
}

// --- Scenario Lifecycle Handlers ---
let isScenarioStarting = false;


async function handleStartNewScenarioRequest(scenarioParams = null) {
    let reopenScenarioData = null;
    let userProfession = "ER Doctor";
    let userScenarioDetails = "";
    if (scenarioParams) {
        if (scenarioParams.id && scenarioParams.initialDescription) {
            reopenScenarioData = scenarioParams;
            console.log("MAIN: Start scenario request (REOPENING). Data:", reopenScenarioData);
        } else if (typeof scenarioParams === 'object') {
            userProfession = scenarioParams.profession || userProfession;
            userScenarioDetails = scenarioParams.details || userScenarioDetails;
            console.log(`MAIN: Start scenario request (NEW). Profession: "${userProfession}", Details: "${userScenarioDetails}"`);
        }
    } else {
        console.log("MAIN: Start scenario request (NEW - default).");
    }

    if (isScenarioStarting) { console.warn("MAIN: Scenario start already in progress."); return; }
    if (!appData.apiKey || !gemini.isReady()) {
        alert("Gemini API Key is not set or AI is not ready. Please configure it in 'Data & Settings'.");
        handleTabClick('data'); return;
    }
    isScenarioStarting = true;
    if (window.appShell) window.appShell.disableStartGameButton(true, "Generating...");

    const scenarioId = reopenScenarioData ? reopenScenarioData.id : `scenario-er-${Date.now()}`;
    let scenarioName = reopenScenarioData ? reopenScenarioData.name : `ER Case (${userProfession.substring(0, 15)}) #${(appData.playerData.stats.operationsCompleted || 0) + 1}`;
    console.log(`MAIN: Preparing scenario: ${scenarioId} - ${scenarioName}`);

    if (!reopenScenarioData) {
        if (!appData.playerData.stats) appData.playerData.stats = { operationsCompleted: 0, successRate: 0 };
        appData.playerData.stats.operationsCompleted = (appData.playerData.stats.operationsCompleted || 0) + 1;
        scenarioName = `ER Case (${userProfession.substring(0, 15)}) #${appData.playerData.stats.operationsCompleted}`;
    }

    addGlobalTab(
        scenarioId, scenarioName, true, true,
        (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData, `<div class="in-tab-loading"><div class="spinner"></div><p>${reopenScenarioData ? 'Re-opening scenario...' : 'Generating scenario...'}</p></div>`)
    );

    try {
        let initialDescription, patientInfo, scenarioEventLog, currentChatHistory, scenarioStartTimestamp;

        if (reopenScenarioData) {
            console.log(`MAIN: Re-opening scenario ${scenarioId}`);
            initialDescription = reopenScenarioData.initialDescription;
            patientInfo = reopenScenarioData.patientData;
            scenarioEventLog = reopenScenarioData.eventLog || [];
            currentChatHistory = reopenScenarioData.chatHistory || [];
            // ui.updateScenarioOutput is not strictly needed here if getScenarioPlayScreenContent handles full render
        } else {
            let basePrompt = `
You are an AI assistant for a medical simulation game. The user is a ${userProfession}.

Your primary output is narrative text describing the patient, environment, and outcomes of actions.
HOWEVER, to make the simulation interactive, when specific game state variables need to change,
you MUST include a special block AFTER your narrative. This block is the *only* way to change these game variables.

The block format is:
---GAME_STATE_UPDATES---
VARIABLE_NAME: value
ANOTHER_VARIABLE: value
---END_GAME_STATE_UPDATES---

Available variables for GAME_STATE_UPDATES:
- MONITOR_PULSEOXIMETER_VISIBLE: true_or_false (Use 'true' when the pulse oximeter should be newly attached or made visible. Use 'false' if it's removed/hidden.)
- VITALS_HEARTRATE_TARGET: number (The target heart rate reading on the monitor.)
- VITALS_HEARTRATE_DURATION: number (Seconds for HR to reach target. Use 0 for instant change.)
- VITALS_SPO2_TARGET: number (Target SpO2 reading.)
- VITALS_SPO2_DURATION: number (Seconds for SpO2 to reach target. Use 0 for instant.)
- VITALS_NBP_SYSTOLIC_TARGET: number
- VITALS_NBP_DIASTOLIC_TARGET: number
- VITALS_NBP_DURATION: 0 (NBP readings are typically instant when taken.)
- VITALS_TEMP_TARGET: number (Celsius)
- VITALS_TEMP_DURATION: number (Seconds for Temp to reach target.)

Example 1: Player asks to attach pulse oximeter.
Your response could be:
"Okay, I'm attaching the pulse oximeter to the patient's finger now. It's powering on."
---GAME_STATE_UPDATES---
MONITOR_PULSEOXIMETER_VISIBLE: true
VITALS_HEARTRATE_TARGET: 78
VITALS_HEARTRATE_DURATION: 0
VITALS_SPO2_TARGET: 97
VITALS_SPO2_DURATION: 0
---END_GAME_STATE_UPDATES---

Example 2: Player administers a drug that should lower heart rate.
Your response could be:
"The medication seems to be taking effect, you notice the heart rate on the monitor starting to decrease."
---GAME_STATE_UPDATES---
VITALS_HEARTRATE_TARGET: 65
VITALS_HEARTRATE_DURATION: 30
---END_GAME_STATE_UPDATES---

Example 3: Patient needs to be moved, pulse oximeter disconnected.
Your response could be:
"Alright, we're preparing to move. I'll disconnect the pulse oximeter probe for now."
---GAME_STATE_UPDATES---
MONITOR_PULSEOXIMETER_VISIBLE: false
---END_GAME_STATE_UPDATES---

If the player's action does not directly change one of these specific game variables, or if you are just providing a narrative update or answering a question, DO NOT include the GAME_STATE_UPDATES block.
The game will use the values in the GAME_STATE_UPDATES block to update the visual monitors and internal patient state.

Scenario Structure:
## Scenario Name:
[A very brief, catchy name for the case.]

## Initial Scene / Setting:
[Detailed description of the immediate scene, patient's visible condition, etc. 3-5 sentences. Relevant to ${userProfession}.]
`;
            if (userScenarioDetails) {
                basePrompt += `
The scenario MUST incorporate: "${userScenarioDetails}". Integrate this into the scene and patient info.
`;
            } else {
                basePrompt += `\nGenerate a plausible case for a ${userProfession}.\n`;
            }
            basePrompt += `
## Patient Information:
Condition: [Patient's primary medical state]
Age: [Patient's age]
Sex: [Male/Female/Other]
Chief Complaint: [Main reason for presentation]
Initial Observations / Presentation: [Key objective findings relevant to ${userProfession}]
Medical Records / History: [Brief relevant PMH, allergies, key meds]
Bystander/Family Statements / Referral Notes: [Brief relevant quote or summary]

Ensure all sections are present and populated.
The very first thing I (the player, ${userProfession}) see should be the "Initial Scene / Setting".
What is the initial scene and patient presentation?
`; // Added a direct question at the end to encourage immediate scenario output.
            // --- END REVISED PROMPT ---

            const initialScenarioPrompt = basePrompt.trim();
            console.log("MAIN: About to call Gemini. initialScenarioPrompt (first 300 chars):\n", initialScenarioPrompt.substring(0, 300) + "...");
            if (!initialScenarioPrompt) throw new Error("Initial scenario prompt is empty!");

            // For initial generation, pass an EMPTY chatHistory array
            const geminiResponseObject = await gemini.ask(initialScenarioPrompt, []);
            console.log("MAIN: Raw Gemini Response Object for parsing:\n", geminiResponseObject);

            if (!geminiResponseObject || !geminiResponseObject.narrative || geminiResponseObject.narrative.toLowerCase().startsWith("error:")) {
                throw new Error(geminiResponseObject ? geminiResponseObject.narrative : "No valid narrative from AI for initial scenario.");
            }

            // Use rawResponse for parsing, as it contains the full original text from AI
            const parsedData = parseGeminiScenarioData(geminiResponseObject.rawResponse);
            if (parsedData.scenarioName && parsedData.scenarioName !== scenarioName) {
                scenarioName = parsedData.scenarioName;
                const tabConfig = globalTabConfigurations.find(t => t.id === scenarioId);
                if (tabConfig) tabConfig.label = scenarioName;
            }
            initialDescription = parsedData.scenarioDescription;
            patientInfo = parsedData.patientData;
            scenarioEventLog = [
                { type: 'system', text: `Scenario Started (Role: ${userProfession}): ${new Date().toLocaleString()}`, timestamp: Date.now() },
                { type: 'system', text: `Initial Scene: ${initialDescription}`, timestamp: Date.now() }
            ];
            // Chat history starts with the AI's full raw response (which might include the state update block)
            currentChatHistory = [{ role: "model", parts: [{ text: geminiResponseObject.rawResponse }] }];
            scenarioStartTimestamp = Date.now();

            // Update scenario tab with only the narrative part of the initial scene
            ui.updateScenarioOutput(scenarioId, `<h3>Initial Scene</h3><p>${initialDescription.replace(/\n/g, '<br>')}</p>`, true);

            // Process any state updates Gemini might have included in its *initial* scenario generation
            if (geminiResponseObject.stateUpdates && Object.keys(geminiResponseObject.stateUpdates).length > 0) {
                processAiStateUpdates(geminiResponseObject.stateUpdates, scenarioId, scenarioName, appData);
            } else if (!geminiResponseObject.stateUpdates?.hasOwnProperty('MONITOR_PULSEOXIMETER_VISIBLE')) {
                console.log("MAIN: No explicit PulseOx visibility from AI, opening by default for scenario:", scenarioId);
                if (window.appShell && typeof window.appShell.addPulseOximeterTabForScenario === 'function') {
                    window.appShell.addPulseOximeterTabForScenario(scenarioId, scenarioName);
                }
            }
        }

        // --- Common logic for new and re-opened scenarios ---
        appData.playerData.activeScenarios = appData.playerData.activeScenarios || {};
        appData.playerData.activeScenarios[scenarioId] = {
            id: scenarioId, name: scenarioName, initialDescription: initialDescription,
            patientData: patientInfo, eventLog: scenarioEventLog, chatHistory: currentChatHistory,
            startTimestamp: scenarioStartTimestamp,
            isPaused: false, lastUpdatedTimestamp: Date.now(), userRole: userProfession
        };
        const patientTabId = `patient-info-${scenarioId}`;
        const patientTabLabel = `Patient: ${scenarioName.substring(0, 12)}${scenarioName.length > 12 ? '...' : ''}`;
        if (!globalTabConfigurations.find(t => t.id === patientTabId)) {
            addGlobalTab(patientTabId, patientTabLabel, true, false,
                (currentAppData) => game.getPatientTabContent(patientTabId, currentAppData.playerData.activeScenarios[scenarioId]?.patientData)
            );
        } else {
            const patientTabConfig = globalTabConfigurations.find(t => t.id === patientTabId);
            if (patientTabConfig) {
                patientTabConfig.label = patientTabLabel;
                if (window.appShell && typeof window.appShell.refreshTabContent === 'function') {
                    window.appShell.refreshTabContent(patientTabId);
                }
            }
        }

        const outputDivId = `scenario-output-${scenarioId}`;
        const outputDiv = document.getElementById(outputDivId);
        if (outputDiv) {
            // For new scenarios, initial scene is already set by ui.updateScenarioOutput.
            // For re-opened scenarios, game.getScenarioPlayScreenContent handles the full initial display.
            // This loop now primarily appends *additional* log entries from the loaded/generated eventLog.
            let initialSceneAlreadyDisplayed = !reopenScenarioData; // Assume true for new, false for re-opened

            // If re-opening, game.getScenarioPlayScreenContent should have rendered the initial scene
            // We just need to append subsequent logs.
            // If new, ui.updateScenarioOutput handled the initial scene.

            if (scenarioEventLog && scenarioEventLog.length > 0) {
                // For re-opened, we need to ensure the outputDiv is prepared if getScenarioPlayScreenContent
                // didn't fully render the log (e.g. if it just showed a loading message initially).
                // This part is a bit tricky with the async nature.
                // The safest is that game.getScenarioPlayScreenContent should render the full log for existing scenarios.
                // And for new, ui.updateScenarioOutput sets the scene, then we append logs.

                scenarioEventLog.forEach(logEntry => {
                    // Avoid re-logging the "Initial Scene:" system message if it was just displayed
                    // or if it's handled by the main description area.
                    if (logEntry.type === 'system' && logEntry.text.startsWith('Initial Scene:')) {
                        return; // Skip this, as initialDescription is displayed above the log area
                    }
                    ui.appendToScenarioLog(scenarioId, logEntry.text, logEntry.type === 'player');
                });
            }
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }

        appData.playerData.activeScenarios = appData.playerData.activeScenarios || {};
        appData.playerData.activeScenarios[scenarioId] = {
            id: scenarioId, name: scenarioName, initialDescription: initialDescription,
            patientData: patientInfo, eventLog: scenarioEventLog, chatHistory: currentChatHistory,
            startTimestamp: Date.now(),
            isPaused: false,
            lastUpdatedTimestamp: Date.now(), // Initialize for timer
            userRole: userProfession
        };

    } catch (error) {
        console.error("MAIN: Error starting scenario:", error);
        const idToUseForError = scenarioId || 'unknown-scenario';
        ui.updateScenarioOutput(idToUseForError, `<p class="system-message error">Error generating scenario: ${error.message}. Please try again or check API key.</p>`, true);
    } finally {
        storage.saveAppData(appData);
        isScenarioStarting = false;
        if (window.appShell) window.appShell.disableStartGameButton(false);
        updateGlobalTabsAndContent();
    }
}

function handleReopenScenarioRequest(scenarioId) {
    console.log("MAIN: Re-open scenario request for:", scenarioId);
    const scenarioToReopen = (appData.playerData.recentlyClosedScenarios || []).find(s => s.id === scenarioId);
    if (scenarioToReopen) {
        appData.playerData.recentlyClosedScenarios = appData.playerData.recentlyClosedScenarios.filter(s => s.id !== scenarioId);
        handleStartNewScenarioRequest(scenarioToReopen);
    } else {
        alert("Could not find data for the selected scenario to re-open.");
    }
}

function parseGeminiScenarioData(responseText) {
    console.log("MAIN: Parsing Gemini Response (Full):\n", responseText); // Log full response for parsing debug
    let scenarioName = "Unnamed ER Case";
    let scenarioDescription = "AI did not provide a scenario description in the expected format.";
    let patientData = {
        condition: "Unknown", age: "N/A", sex: "N/A",
        chiefComplaint: "N/A", initialObservations: "No observations.",
        medicalRecords: "No records.", bystanderStatements: "No statements."
    };

    // Regex for Scenario Name (more robust)
    const nameMatch = responseText.match(/^##\s*Scenario Name:\s*([^\n]+)/im);
    if (nameMatch && nameMatch[1]) {
        scenarioName = nameMatch[1].trim();
        console.log("Parser: Found Scenario Name:", scenarioName);
    } else {
        console.warn("Parser: Scenario Name heading not found or no content after it.");
    }

    // Regex for Initial Scene / Setting (more robust to handle variations)
    // Matches "## Initial Scene / Setting:" or "## Initial Scene:"
    // Captures everything until "## Patient Information:" or end of string
    const sceneMatch = responseText.match(/^##\s*Initial Scene(?:\s*\/\s*Setting)?\s*:\s*([\s\S]+?)(?=^##\s*Patient Information:|$)/im);
    if (sceneMatch && sceneMatch[1]) {
        scenarioDescription = sceneMatch[1].trim();
        console.log("Parser: Found Initial Scene/Setting content.");
    } else {
        console.warn("Parser: Initial Scene / Setting heading not found or no content after it.");
    }

    // Regex for Patient Information block
    const patientInfoBlockMatch = responseText.match(/^##\s*Patient Information:\s*([\s\S]+)/im);
    if (patientInfoBlockMatch && patientInfoBlockMatch[1]) {
        const patientBlock = patientInfoBlockMatch[1].trim();
        console.log("Parser: Found Patient Information block.");

        // Helper function to extract field value
        const extractField = (block, fieldName) => {
            // Regex to match "FieldName: Value_until_newline"
            // Handles optional whitespace around colon and field name.
            // Case-insensitive for fieldName.
            const regex = new RegExp(`^${fieldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:\\s*([^\\n]+)`, "im");
            const match = block.match(regex);
            return match && match[1] ? match[1].trim() : null;
        };

        // Regex to match multi-line fields (like Observations, Records, Statements)
        // Looks for "FieldName:" and captures everything until the next "FieldName:" or end of block
        const extractMultiLineField = (block, fieldName, nextFieldNames = []) => {
            let lookaheadPattern = nextFieldNames.length > 0 ? `(?=${nextFieldNames.map(name => `^${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:`).join('|')}|$)` : '(?=$)';
            // Ensure fieldName in regex is escaped for special characters if any.
            const fieldNamePattern = fieldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`^${fieldNamePattern}\\s*:\\s*([\\s\\S]+?)${lookaheadPattern}`, "im");
            const match = block.match(regex);
            return match && match[1] ? match[1].trim() : null;
        };


        patientData.condition = extractField(patientBlock, "Condition") || patientData.condition;
        patientData.age = extractField(patientBlock, "Age") || patientData.age;
        patientData.sex = extractField(patientBlock, "Sex") || patientData.sex;
        patientData.chiefComplaint = extractField(patientBlock, "Chief Complaint") || patientData.chiefComplaint;

        // Define the order of multi-line fields to help with lookahead
        const multiLineFieldOrder = [
            "Initial Observations / Presentation",
            "Medical Records / History",
            "Bystander/Family Statements / Referral Notes"
        ];

        patientData.initialObservations = extractMultiLineField(patientBlock, multiLineFieldOrder[0], multiLineFieldOrder.slice(1)) || patientData.initialObservations;
        patientData.medicalRecords = extractMultiLineField(patientBlock, multiLineFieldOrder[1], multiLineFieldOrder.slice(2)) || patientData.medicalRecords;
        patientData.bystanderStatements = extractMultiLineField(patientBlock, multiLineFieldOrder[2]) || patientData.bystanderStatements; // No next fields for the last one

        console.log("Parser: Extracted Patient Data:", patientData);

    } else {
        console.warn("Parser: Patient Information heading not found or no content after it.");
    }

    console.log("MAIN: Final Parsed Data:", { scenarioName, scenarioDescription, patientData });
    return { scenarioName, scenarioDescription, patientData };
}

// js/main.js

// ... (other functions) ...

/**
 * Processes state updates received from Gemini.
 * @param {Object} updates - The stateUpdates object from Gemini's response.
 * @param {string} scenarioId - The ID of the current scenario.
 * @param {string} scenarioName - The name of the current scenario.
 * @param {Object} currentAppDataRef - Reference to the main appData object.
 */
function processAiStateUpdates(updates, scenarioId, scenarioName, currentAppDataRef) {
    if (!updates || Object.keys(updates).length === 0) {
        console.log("MAIN_PROCESS_UPDATES: No state updates to process for scenario", scenarioId);
        return; // No updates to process
    }
    console.log(`MAIN_PROCESS_UPDATES: Processing for scenario ${scenarioId} ('${scenarioName}'):`, JSON.parse(JSON.stringify(updates)));

    let stateDidChangeOverall = false; // Flag if any part of appData or monitor state actually changed
    let needsMonitorScreenRefresh = false; // Flag if the main monitor screen UI needs a full re-render

    // --- Monitor Visibility (Example for Patient Monitor Screen itself) ---
    if (updates.hasOwnProperty('MONITOR_SCREEN_VISIBLE')) {
        const shouldBeVisible = updates.MONITOR_SCREEN_VISIBLE === true;
        console.log(`MAIN_PROCESS_UPDATES: AI requests Patient Monitor Screen Visible: ${shouldBeVisible} for ${scenarioId}`);
        const scenario = currentAppDataRef.playerData.activeScenarios[scenarioId];
        if (scenario) {
            if (!scenario.showMonitorsObject) scenario.showMonitorsObject = {}; // Using a different flag for clarity
            if (scenario.showMonitorsObject.mainScreen !== shouldBeVisible) {
                scenario.showMonitorsObject.mainScreen = shouldBeVisible;
                stateDidChangeOverall = true;
            }
        }
        if (shouldBeVisible) {
            if (activeGlobalTabId !== 'monitors-main' || (currentMonitorsScreenInstance && currentMonitorsScreenInstance.activeScenarioId !== scenarioId)) {
                handleTabClick('monitors-main'); // Activate/refresh monitors tab
            }
            needsMonitorScreenRefresh = true; // Ensure it re-renders with correct scenario
        } else {
            if (activeGlobalTabId === 'monitors-main' && currentMonitorsScreenInstance?.activeScenarioId === scenarioId) {
                if (window.patientMonitor) window.patientMonitor.hideAllDisplay(scenarioId); // Method in patientMonitor
            }
        }
    }
    // Add similar for individual monitor channel visibility if AI controls that directly
    // e.g., updates.MONITOR_PULSEOXIMETER_VISIBLE (though patientMonitor often shows all its channels)


    // --- Process Vital Sign Targets and Durations ---
    const vitalTargets = {};    // To collect { hr: val, spo2: val, ... }
    const vitalDurations = {};  // To collect { hr: dur, spo2: dur, ... }
    let anyVitalsToSetToMonitor = false;

    const defaultDuration = parseFloat(updates.VITALS_DEFAULT_DURATION);
    const fallbackDuration = (!isNaN(defaultDuration) && defaultDuration >= 0) ? defaultDuration : 5; // Default 5s if not specified

    // Helper to process each vital
    const processVital = (vitalKeyInUpdates, targetKeyInObject, durationKeyInObject) => {
        if (updates.hasOwnProperty(vitalKeyInUpdates)) {
            const target = parseFloat(updates[vitalKeyInUpdates]);
            if (!isNaN(target)) {
                vitalTargets[targetKeyInObject] = target;
                const duration = parseFloat(updates[durationKeyInObject]);
                vitalDurations[targetKeyInObject] = (!isNaN(duration) && duration >= 0) ? duration : fallbackDuration;
                anyVitalsToSetToMonitor = true;
            } else {
                console.warn(`MAIN_PROCESS_UPDATES: Invalid target for ${vitalKeyInUpdates}: ${updates[vitalKeyInUpdates]}`);
            }
        }
    };
    const processStringVital = (vitalKeyInUpdates, targetKeyInObject) => {
        if (updates.hasOwnProperty(vitalKeyInUpdates)) {
            vitalTargets[targetKeyInObject] = String(updates[vitalKeyInUpdates]);
            anyVitalsToSetToMonitor = true; // String vitals are usually instant
            vitalDurations[targetKeyInObject] = 0; // Implicit instant change
        }
    };


    // ECG & Heart Rate
    processVital('VITALS_HEARTRATE_TARGET', 'hr', 'VITALS_HEARTRATE_DURATION');
    processStringVital('VITALS_ECG_RHYTHM', 'ecgRhythm');

    // SpO2
    processVital('VITALS_SPO2_TARGET', 'spo2', 'VITALS_SPO2_DURATION');

    // ABP (Arterial Blood Pressure)
    processVital('VITALS_ABP_SYSTOLIC_TARGET', 'abpSys', 'VITALS_ABP_DURATION'); // Assume common duration for sys/dia
    processVital('VITALS_ABP_DIASTOLIC_TARGET', 'abpDia', 'VITALS_ABP_DURATION');

    // NBP (Non-Invasive Blood Pressure) - NBP results are usually instant updates
    if (updates.hasOwnProperty('VITALS_NBP_SYSTOLIC_TARGET')) {
        const sysTarget = parseFloat(updates.VITALS_NBP_SYSTOLIC_TARGET);
        const diaTarget = parseFloat(updates.VITALS_NBP_DIASTOLIC_TARGET); // NBP Dia should also be present
        if (!isNaN(sysTarget) && !isNaN(diaTarget)) {
            vitalTargets.nbpSys = sysTarget;
            vitalTargets.nbpDia = diaTarget;
            vitalDurations.nbpSys = 0; // NBP results are instant
            vitalDurations.nbpDia = 0;
            // NBP_DURATION from AI might mean "time until next auto cycle", not change duration
            // For now, treat NBP target setting as an instant result update.
            anyVitalsToSetToMonitor = true;
        }
    }
    if (updates.hasOwnProperty('REQUEST_NBP_CYCLE') && updates.REQUEST_NBP_CYCLE === true) {
        if (window.patientMonitor) window.patientMonitor.takeNbpReading(scenarioId); // Trigger NBP cycle
        anyVitalsToSetToMonitor = true; // An action occurred
    }


    // EtCO2 & Respiratory Rate
    processVital('VITALS_ETCO2_TARGET', 'etco2', 'VITALS_ETCO2_DURATION');
    processStringVital('VITALS_ETCO2_UNIT', 'etco2Unit');
    processVital('VITALS_RESPIRATORYRATE_TARGET', 'rr', 'VITALS_RESPIRATORYRATE_DURATION');

    // Temperature
    processVital('VITALS_TEMP_TARGET', 'temp', 'VITALS_TEMP_DURATION');

    // Call patientMonitor if any vital targets were identified
    if (anyVitalsToSetToMonitor) {
        console.log(`MAIN_PROCESS_UPDATES: AI Vitals for PatientMonitor ${scenarioId}: Targets:`, vitalTargets, "Durations:", vitalDurations);
        if (window.patientMonitor && typeof window.patientMonitor.setTargetVitals === 'function') {
            window.patientMonitor.setTargetVitals(scenarioId, vitalTargets, vitalDurations);
        } else {
            console.error("MAIN_PROCESS_UPDATES: window.patientMonitor.setTargetVitals not found!");
        }
        stateDidChangeOverall = true; // Vitals were commanded to change
        needsMonitorScreenRefresh = true; // Monitor display likely needs to reflect this
    }

    // General Monitor Controls
    if (updates.hasOwnProperty('MONITOR_ALARMS_MUTED')) {
        if (window.patientMonitor) window.patientMonitor.toggleMuteAlarms(scenarioId, updates.MONITOR_ALARMS_MUTED);
        stateDidChangeOverall = true;
    }
    if (updates.hasOwnProperty('MONITOR_DISPLAY_PAUSED')) { // Pauses the entire patient monitor widget
        if (window.patientMonitor) window.patientMonitor.togglePauseInstance(scenarioId, updates.MONITOR_DISPLAY_PAUSED);
        stateDidChangeOverall = true;
    }


    // --- Final Actions Based on Changes ---
    if (stateDidChangeOverall) {
        // Sync all current vital values from the monitor instance back to appData
        // This is important because setTargetVitals might have made instant changes
        // or ongoing changes will be reflected in the instance.
        updateCurrentScenarioVitalsToAppData(scenarioId, currentAppDataRef);
        storage.saveAppData(currentAppDataRef);
        console.log("MAIN_PROCESS_UPDATES: appData saved after AI state updates for", scenarioId);
    }

    if (needsMonitorScreenRefresh && activeGlobalTabId === 'monitors-main' &&
        currentMonitorsScreenInstance?.activeScenarioId === scenarioId) {
        console.log("MAIN_PROCESS_UPDATES: Monitors tab is active and state changed for its scenario, forcing its content refresh.");
        renderActiveTabContent(); // This will re-run monitorsScreen.getContentElement
    }
}

// ... (rest of main.js, including updateCurrentScenarioVitalsToAppData, initializeGame, etc.)

// js/main.js
function updateCurrentScenarioVitalsToAppData(scenarioId, currentAppDataRef) {
    const scenario = currentAppDataRef.playerData.activeScenarios?.[scenarioId];
    const monitorInstance = window.patientMonitor?.instances[scenarioId];

    if (scenario && monitorInstance && monitorInstance.vitals) {
        if (!scenario.patientData) scenario.patientData = {};
        if (!scenario.patientData.vitals) scenario.patientData.vitals = {};

        // Sync ALL current vitals from instance to appData
        for (const key in monitorInstance.vitals) {
            if (monitorInstance.vitals.hasOwnProperty(key)) {
                scenario.patientData.vitals[key] = monitorInstance.vitals[key];
            }
        }
        // Sync targets and remaining durations
        if (monitorInstance.targets) {
            for (const key in monitorInstance.targets) {
                if (monitorInstance.targets.hasOwnProperty(key)) {
                    const capKey = key.charAt(0).toUpperCase() + key.slice(1);
                    scenario.patientData.vitals[`target${capKey}`] = monitorInstance.targets[key];
                }
            }
        }
        if (monitorInstance.durations) {
            for (const key in monitorInstance.durations) {
                if (monitorInstance.durations.hasOwnProperty(key)) {
                    scenario.patientData.vitals[`${key}DurationRemaining`] = monitorInstance.durations[key] || 0;
                }
            }
        }
        // Persist monitor's own pause state
        // if (scenario.visibleMonitors) { // visibleMonitors is for which *types* are shown in monitorsScreen
        //     // This might need a different structure if each monitor channel can be paused
        // }
        scenario.patientData.vitals.isOverallMonitorPaused = monitorInstance.isPaused; // Save the main pause state

        console.log(`MAIN_SYNC_VITALS: Synced PatientMonitor instance (${scenarioId}) vitals to appData.`);
    } else {
        console.warn(`MAIN_SYNC_VITALS: Could not sync for ${scenarioId}, scenario or monitor instance/vitals missing.`);
    }
}


// --- Input Area Management ---
const inputArea = document.getElementById('input-area');
const playerCommandInput = document.getElementById('player-command-input');
const submitCommandBtn = document.getElementById('submit-command-btn');

function showInputArea() {
    if (inputArea) {
        const wasHidden = inputArea.classList.contains('hidden');
        inputArea.classList.remove('hidden'); // Make it visible FIRST
        if (wasHidden && typeof window.adjustMainContentHeight === 'function') {
            // Call after a microtask delay to allow DOM to update from class removal
            Promise.resolve().then(window.adjustMainContentHeight);
            // requestAnimationFrame(window.adjustMainContentHeight); // Also a good option
        } else if (typeof window.adjustMainContentHeight === 'function') {
            // If it was already visible but something else changed, still good to call
            Promise.resolve().then(window.adjustMainContentHeight);
        }
    }

    // Update footer timer display logic (as before)
    if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        const scenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
        if (scenario) ui.updateFooterTimerDisplay(scenario.elapsedSeconds, scenario.isPaused);
        else ui.updateFooterTimerDisplay(null);
    } else {
        ui.updateFooterTimerDisplay(null);
    }
    console.log("MAIN: showInputArea called. Footer should be visible.");
}

function hideInputArea() {
    if (inputArea) {
        const wasVisible = !inputArea.classList.contains('hidden');
        inputArea.classList.add('hidden'); // Hide it FIRST
        if (wasVisible && typeof window.adjustMainContentHeight === 'function') {
            Promise.resolve().then(window.adjustMainContentHeight);
            // requestAnimationFrame(window.adjustMainContentHeight);
        }
    }
    ui.updateFooterTimerDisplay(null);
    console.log("MAIN: hideInputArea called. Footer should be hidden.");
}


if (submitCommandBtn && playerCommandInput) {
    submitCommandBtn.addEventListener('click', processPlayerCommand);
    playerCommandInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); processPlayerCommand(); } });
}

async function processPlayerCommand() {
    const originalCommand = playerCommandInput.value.trim();
    if (originalCommand && activeGlobalTabId) {
        const scenario = appData.playerData.activeScenarios[activeGlobalTabId];
        if (scenario && scenario.isPaused) {
            alert("Scenario is paused. Please resume to continue.");
            playerCommandInput.value = originalCommand;
            return;
        }
        if (!scenario) {
            alert("Error: Active scenario data not found.");
            return;
        }

        playerCommandInput.value = ''; // Clear input

        const timeContext = `(Elapsed Scenario Time: ${formatTime(scenario.elapsedSeconds)})`;

        // --- PREPEND CONCISE SYSTEM INSTRUCTIONS TO THE USER'S COMMAND ---
        const commandForGemini = `${CONCISE_GEMINI_SYSTEM_INSTRUCTIONS}\n\nPlayer says: "${originalCommand}"\n${timeContext}`;
        // --- ---

        // game.handlePlayerCommand will receive the originalCommand (for local parsing & logging)
        // and commandForGemini (to be sent to the AI by gemini.ask)
        const modified = await game.handlePlayerCommand(originalCommand, commandForGemini, activeGlobalTabId, appData);
        if (modified) {
            storage.saveAppData(appData);
        }
    } else if (originalCommand) {
        console.log("MAIN: Command entered but no active scenario tab:", originalCommand);
        playerCommandInput.value = '';
    }
}


function pauseScenarioTimer(scenarioId) {
    const scenario = appData.playerData.activeScenarios?.[scenarioId];
    if (scenario && !scenario.isPaused) {
        // The animation loop will handle the final logic tick based on lastLogicUpdateTime
        // We just need to set the state.
        scenario.isPaused = true;
        // lastUpdatedTimestamp will reflect the time of the last logic update done by animations.js
        storage.saveAppData(appData);
        if (window.animations) window.animations.resetDisplayOptimizationFlags();
        console.log(`MAIN: Scenario ${scenarioId} PAUSED at ${formatTime(scenario.elapsedSeconds)}`);
    }
}



function resumeScenarioTimer(scenarioId) {
    const scenario = appData.playerData.activeScenarios?.[scenarioId];
    if (scenario && scenario.isPaused) {
        scenario.isPaused = false;
        const now = Date.now();
        scenario.lastUpdatedTimestamp = now; // Reset for main elapsed time logic in animations.js
        scenario.lastMonitorLogicUpdate = now; // Reset for monitor logic updates in animations.js
        storage.saveAppData(appData);
        if (window.animations) window.animations.resetDisplayOptimizationFlags();
        console.log(`MAIN: Scenario ${scenarioId} RESUMED at ${formatTime(scenario.elapsedSeconds)}`);
    }
}
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let timeString = "";
    if (hours > 0) timeString += `${String(hours).padStart(2, '0')}:`;
    timeString += `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return timeString;
}



// ... (rest of your main.js file: initializeGame, other handlers, appShell definition, etc.) ...

// --- Global Event Listeners & Game Start ---
document.addEventListener('DOMContentLoaded', initializeGame);
window.addEventListener('hashchange', () => {
    const newHashTab = window.location.hash.substring(1);
    if (newHashTab && globalTabConfigurations.some(tab => tab.id === newHashTab) && newHashTab !== activeGlobalTabId) {
        handleTabClick(newHashTab);
    } else if (!newHashTab && activeGlobalTabId !== 'home') {
        handleTabClick('home');
    }
});

let lastProcessedAiStateUpdates = {};

// IMPORTANT: window.appShell MUST be defined AFTER all functions it references are defined.
window.appShell = {
    addGlobalTab,
    showInputArea,
    hideInputArea,
    getActiveTabId: () => activeGlobalTabId,
    getAppData: () => appData,
    saveGameData: () => storage.saveAppData(appData),
    refreshCurrentTabContent: () => { if (activeGlobalTabId) renderActiveTabContent(); },
    refreshTabContent: (tabId) => {
        const tabConfig = globalTabConfigurations.find(t => t.id === tabId);
        if (tabConfig && tabConfig.contentGenerator) {
            if (window.ui) ui.renderTabPanelContent(tabId, tabConfig.contentGenerator(appData));
        } else if (tabConfig) {
            renderActiveTabContent();
        }
    },
    handleStartNewGame: handleStartNewScenarioRequest,
    disableStartGameButton: (disable, buttonText = "Start New Scenario") => {
        const startBtn = document.getElementById('home-start-new-game-btn'); // Corrected ID
        if (startBtn) {
            startBtn.disabled = disable;
            startBtn.textContent = disable ? (buttonText === "Start New Scenario" ? "Generating..." : buttonText) : "Generate Scenario";
            startBtn.style.cursor = disable ? 'not-allowed' : 'pointer';
            startBtn.style.opacity = disable ? '0.7' : '1';
        }
    },
    handleApiKeyChange,         // Expose for dataManagementScreen
    handleFontPreferenceChange, // Expose for dataManagementScreen
    handleImportRequest,        // Expose for dataManagementScreen
    handleExportRequest,        // Expose for dataManagementScreen
    getRecentlyClosedScenarios: () => appData.playerData.recentlyClosedScenarios || [],
    reopenClosedScenario: handleReopenScenarioRequest,
    processAiStateUpdates, // Expose the helper
    toggleScenarioMonitor: (scenarioId, monitorType, show) => { // New function
        if (currentMonitorsScreenInstance && currentMonitorsScreenInstance.activeScenarioId === scenarioId) {
            currentMonitorsScreenInstance.toggleMonitorVisibility(monitorType, show);
        } else if (show) {
            // If monitors tab isn't active for this scenario, activate it then toggle
            handleTabClick('monitors-main'); // This will ensure it's set for the right scenario
            setTimeout(() => { // Defer actual toggle
                if (currentMonitorsScreenInstance && currentMonitorsScreenInstance.activeScenarioId === scenarioId) {
                    currentMonitorsScreenInstance.toggleMonitorVisibility(monitorType, true);
                }
            }, 150);
        }
    },
    closeTab: function (tabIdToClose) { /* ... as before ... */ },
    pauseActiveScenarioTimer: () => { if (activeGlobalTabId?.startsWith('scenario-')) pauseScenarioTimer(activeGlobalTabId); },
    resumeActiveScenarioTimer: () => { if (activeGlobalTabId?.startsWith('scenario-')) resumeScenarioTimer(activeGlobalTabId); },
    getOpenTabIds: () => globalTabConfigurations.map(t => t.id) // Ensure this is here
};


window.addEventListener('beforeunload', (event) => {
    console.log("MAIN: beforeunload. Updating final vitals and saving.");
    // Update current vitals from ALL active, unpaused monitor instances to appData
    if (appData.playerData && appData.playerData.activeScenarios) {
        Object.keys(appData.playerData.activeScenarios).forEach(scenarioId => {
            const scenario = appData.playerData.activeScenarios[scenarioId];
            if (scenario && !scenario.isPaused) { // Check main scenario pause
                // Update elapsed time
                const now = Date.now();
                const deltaSeconds = Math.floor((now - scenario.lastUpdatedTimestamp) / 1000);
                if (deltaSeconds >= 0) scenario.elapsedSeconds += deltaSeconds;
                // Sync monitor instance current values to appData
                updateCurrentScenarioVitalsToAppData(scenarioId, appData);
            }
        });
    }
    storage.saveAppData(appData);
});