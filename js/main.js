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
        {
            id: 'data',
            label: 'Data & Settings',
            isCloseable: false,
            contentGenerator: (currentAppData) => typeof ui !== 'undefined' ? ui.createDataManagementPanel?.(
                currentAppData,
                window.appShell?.handleApiKeyChange, // These will be assigned to appShell later
                window.appShell?.handleFontPreferenceChange,
                window.appShell?.handleImportRequest,
                window.appShell?.handleExportRequest
            ) : document.createTextNode("Data Screen Error: UI Module not fully loaded.")
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

// --- Helper Function for Processing AI State Updates ---
/**
 * Processes state updates received from Gemini.
 * @param {Object} updates - The stateUpdates object from Gemini's response.
 * @param {string} scenarioId - The ID of the current scenario.
 * @param {string} scenarioName - The name of the current scenario (for new tab labels).
 * @param {Object} currentAppData - The main appData object (to check existing states if needed).
 */
function processAiStateUpdates(updates, scenarioId, scenarioName, currentAppData) {
    if (!updates || Object.keys(updates).length === 0) {
        return; // No updates to process
    }
    console.log(`MAIN: Processing AI stateUpdates for scenario ${scenarioId}:`, updates);

    const pulseOxTabId = `pulseox-monitor-${scenarioId}`;

    // Pulse Oximeter Visibility
    if (updates.hasOwnProperty('MONITOR_PULSEOXIMETER_VISIBLE')) {
        if (updates.MONITOR_PULSEOXIMETER_VISIBLE === true) {
            console.log("MAIN: AI requests PulseOx VISIBLE for scenario:", scenarioId);
            if (window.appShell && typeof window.appShell.addPulseOximeterTabForScenario === 'function') {
                window.appShell.addPulseOximeterTabForScenario(scenarioId, scenarioName); // scenarioName passed for new tab
                // Optional: System message if it's not the initial scenario setup's action processing
                // if (window.appShell.getActiveTabId() === scenarioId) { // Check if this is a subsequent update
                //    ui.appendToScenarioLog(scenarioId, "System: Pulse oximeter display activated by AI.", false);
                // }
            }
        } else if (updates.MONITOR_PULSEOXIMETER_VISIBLE === false) {
            console.log("MAIN: AI requests PulseOx HIDDEN for scenario:", scenarioId);
            if (window.appShell && typeof window.appShell.closeTab === 'function') {
                window.appShell.closeTab(pulseOxTabId);
                // if (window.appShell.getActiveTabId() === scenarioId) {
                //    ui.appendToScenarioLog(scenarioId, "System: Pulse oximeter display deactivated by AI.", false);
                // }
            }
        }
    }

    // Pulse Oximeter Vital Targets
    const pulseOxTargets = {};
    if (updates.hasOwnProperty('VITALS_HEARTRATE_TARGET')) {
        pulseOxTargets.hr = parseFloat(updates.VITALS_HEARTRATE_TARGET);
    }
    if (updates.hasOwnProperty('VITALS_SPO2_TARGET')) {
        pulseOxTargets.spo2 = parseFloat(updates.VITALS_SPO2_TARGET);
    }

    if (Object.keys(pulseOxTargets).length > 0) {
        let hrDuration = updates.VITALS_HEARTRATE_DURATION; // Keep as string or number from AI
        let spo2Duration = updates.VITALS_SPO2_DURATION;
        let effectiveDuration = 0; // Default to instant

        // Determine effective duration (can be more sophisticated if needed)
        if (pulseOxTargets.hasOwnProperty('hr') && !isNaN(parseFloat(hrDuration)) && parseFloat(hrDuration) >= 0) {
            effectiveDuration = parseFloat(hrDuration);
        } else if (pulseOxTargets.hasOwnProperty('spo2') && !isNaN(parseFloat(spo2Duration)) && parseFloat(spo2Duration) >= 0) {
            effectiveDuration = parseFloat(spo2Duration);
        } else if (updates.hasOwnProperty('VITALS_DEFAULT_DURATION') && !isNaN(parseFloat(updates.VITALS_DEFAULT_DURATION))) {
            effectiveDuration = parseFloat(updates.VITALS_DEFAULT_DURATION);
        }
        effectiveDuration = Math.max(0, effectiveDuration); // Ensure non-negative

        console.log(`MAIN: AI Vitals for PulseOx ${scenarioId}:`, pulseOxTargets, "Duration:", effectiveDuration);
        if (window.pulseOximeter && typeof window.pulseOximeter.setTargetVitals === 'function') {
            window.pulseOximeter.setTargetVitals(scenarioId, pulseOxTargets, effectiveDuration);
            // Optionally, log this change to the scenario's event log if it's a subsequent update
            // if (window.appShell.getActiveTabId() === scenarioId) {
            //     let vitalsMsg = "System: AI updated vitals - ";
            //     if(pulseOxTargets.hr !== undefined) vitalsMsg += `HR target: ${pulseOxTargets.hr}. `;
            //     if(pulseOxTargets.spo2 !== undefined) vitalsMsg += `SpO2 target: ${pulseOxTargets.spo2}. `;
            //     vitalsMsg += `(Change over ${effectiveDuration}s).`;
            //     ui.appendToScenarioLog(scenarioId, vitalsMsg, false);
            // }
        }
    }
    // TODO: Add processing for other monitors (NBP, Temp, ECG) here
    // Example:
    // if (updates.hasOwnProperty('VITALS_NBP_SYSTOLIC_TARGET')) {
    //     const nbpData = { sys: parseFloat(updates.VITALS_NBP_SYSTOLIC_TARGET) };
    //     if (updates.hasOwnProperty('VITALS_NBP_DIASTOLIC_TARGET')) {
    //         nbpData.dia = parseFloat(updates.VITALS_NBP_DIASTOLIC_TARGET);
    //     }
    //     const nbpDuration = parseFloat(updates.VITALS_NBP_DURATION || 0);
    //     window.nbpDisplay?.setNextReading(scenarioId, nbpData, nbpDuration); // Assuming nbpDisplay module
    // }
}
// --- End Helper Function ---

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
    if (playerCommandInput) playerCommandInput.focus();

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
    if (originalCommand && activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
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


function addPulseOximeterTabForScenario(scenarioId, scenarioName) {
    const pulseOxTabId = `pulseox-monitor-${scenarioId}`;
    const safeScenarioName = scenarioName || "Scenario";
    const pulseOxTabLabel = `PulseOx: ${safeScenarioName.substring(0, 10)}${safeScenarioName.length > 10 ? '...' : ''}`;

    console.log(`MAIN_addPulseOxTab: Attempting for scenarioId: ${scenarioId}, tabId: ${pulseOxTabId}, label: ${pulseOxTabLabel}`);

    if (globalTabConfigurations.find(t => t.id === pulseOxTabId)) {
        console.log(`MAIN_addPulseOxTab: Tab ${pulseOxTabId} already exists. Switching or refreshing.`);
        if (activeGlobalTabId !== pulseOxTabId) {
            handleTabClick(pulseOxTabId); // Switch to it
        } else {
            // If already active, refresh its content. This relies on the contentGenerator being re-run.
            // A more direct refresh might be needed if contentGenerator is complex.
            // For now, handleTabClick -> updateGlobalTabsAndContent -> renderActiveTabContent will re-run the generator.
            renderActiveTabContent(); // Re-render the current (already active) tab
        }
        return; // Exit because tab already exists
    }

    console.log(`MAIN_addPulseOxTab: Calling addGlobalTab for ${pulseOxTabId}`);
    addGlobalTab( // This calls the generic addGlobalTab
        pulseOxTabId,
        pulseOxTabLabel,
        true,  // isCloseable
        true,  // switchToNewTab - IMPORTANT! Set this to TRUE if you want it to become active
        (currentAppData) => { // contentGenerator for the pulse oximeter tab
            console.log(`MAIN_addPulseOxTab: ContentGenerator executing for ${pulseOxTabId}`);
            const panelWrapper = document.createElement('div');
            panelWrapper.innerHTML = `<div class="in-tab-loading"><div class="spinner"></div><p>Loading Pulse Oximeter...</p></div>`;

            if (!window.ui || typeof window.ui.fetchHtmlTemplate !== 'function') {
                console.error("MAIN_addPulseOxTab (ContentGen): ui.fetchHtmlTemplate not available!");
                panelWrapper.innerHTML = "<p class='error-message'>Error: Core UI functions missing for monitor.</p>";
                return panelWrapper;
            }

            window.ui.fetchHtmlTemplate('components/monitors/pulseOximeter/pulseOximeter.html')
                .then(htmlString => {
                    console.log(`MAIN_addPulseOxTab (ContentGen): HTML fetched for ${pulseOxTabId}. Injecting.`);
                    if (htmlString.toLowerCase().includes("error loading ui component")) {
                        panelWrapper.innerHTML = htmlString; return;
                    }
                    if (!window.ui || typeof window.ui.injectHtmlWithPlaceholders !== 'function') { /* error */ return; }

                    window.ui.injectHtmlWithPlaceholders(panelWrapper, htmlString, { "{{SCENARIO_ID}}": scenarioId });

                    if (window.pulseOximeter && typeof window.pulseOximeter.initInstance === 'function') {
                        const scData = currentAppData.playerData.activeScenarios[scenarioId];
                        // Use the VITAL values Gemini JUST provided if available in stateUpdates, otherwise defaults
                        const latestUpdates = window.appShell?.getLastAiStateUpdates?.() || {}; // Need a way to get latest AI updates if needed here

                        const initialSpo2 = latestUpdates.VITALS_SPO2_TARGET !== undefined ? latestUpdates.VITALS_SPO2_TARGET :
                            (scData?.patientData?.vitals?.spo2 ?? (scData?.vitals?.spo2 !== undefined ? scData.vitals.spo2 : 98));
                        const initialHr = latestUpdates.VITALS_HEARTRATE_TARGET !== undefined ? latestUpdates.VITALS_HEARTRATE_TARGET :
                            (scData?.patientData?.vitals?.hr ?? (scData?.vitals?.hr !== undefined ? scData.vitals.hr : 70));

                        console.log(`MAIN_addPulseOxTab (ContentGen): Initializing pulseOximeter JS for ${scenarioId} with SpO2: ${initialSpo2}, HR: ${initialHr}`);
                        window.pulseOximeter.initInstance(scenarioId, initialSpo2, initialHr);
                    } else { /* error */ }
                })
                .catch(error => { /* error handling */ });
            return panelWrapper;
        }
    );
}

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
    getRecentlyClosedScenarios: () => appData.playerData.recentlyClosedScenarios || [],
    reopenClosedScenario: handleReopenScenarioRequest,
    processAiStateUpdates, // Expose the helper
    addPulseOximeterTabForScenario, // Expose this
    closeTab: function (tabIdToClose) { /* ... as before ... */ },
    pauseActiveScenarioTimer: () => { if (activeGlobalTabId?.startsWith('scenario-')) pauseScenarioTimer(activeGlobalTabId); },
    resumeActiveScenarioTimer: () => { if (activeGlobalTabId?.startsWith('scenario-')) resumeScenarioTimer(activeGlobalTabId); },
    getOpenTabIds: () => globalTabConfigurations.map(t => t.id) // Ensure this is here
};

window.addEventListener('beforeunload', (event) => {
    console.log("MAIN: beforeunload event triggered. Performing IMMEDIATE save.");
    if (appDataSaveTimeoutId) { // If a debounced save was pending, clear it
        clearTimeout(appDataSaveTimeoutId);
        appDataSaveTimeoutId = null;
    }
    // Update elapsed time for the active scenario one last time
    if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        const scenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
        if (scenario && !scenario.isPaused) {
            const now = Date.now();
            const deltaSeconds = Math.floor((now - scenario.lastUpdatedTimestamp) / 1000);
            if (deltaSeconds >= 0) {
                scenario.elapsedSeconds += deltaSeconds;
            }
        }
    }
    storage.saveAppData(appData); // Immediate save
    console.log("MAIN: appData saved on beforeunload.");
});
