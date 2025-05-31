// js/main.js

// --- Application State ---
let appData = {};
let activeGlobalTabId = null;
let globalTabConfigurations = [];
// recentlyClosedScenarios is part of appData.playerData

// --- Initialization ---
function initializeGame() {
    console.log("MAIN: Initializing game...");
    appData = storage.getAppData();
    console.log("MAIN: Loaded appData:", JSON.parse(JSON.stringify(appData))); // Deep copy for logging

    if (appData.apiKey && !gemini.isReady()) {
        console.log("MAIN: API key found, initializing Gemini...");
        gemini.initialize(appData.apiKey);
    }

    ui.applyFontPreference(appData.preferences.font || 'normal');

    globalTabConfigurations = [
        { id: 'home', label: 'Home', isCloseable: false },
        { id: 'data', label: 'Data & Settings', isCloseable: false },
        { id: 'notes', label: 'Notes', isCloseable: false },
    ];

    if (appData.playerData && appData.playerData.activeScenarios) {
        for (const scenarioId in appData.playerData.activeScenarios) {
            const scenario = appData.playerData.activeScenarios[scenarioId];
            if (!globalTabConfigurations.find(t => t.id === scenarioId)) {
                console.log(`MAIN: Restoring active scenario tab: ${scenarioId} - ${scenario.name}`);
                globalTabConfigurations.push({
                    id: scenarioId,
                    label: scenario.name || "Scenario",
                    isCloseable: true,
                    contentGenerator: (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData) // Will show existing content
                });
            }
        }
    }

    const initialHashTab = window.location.hash.substring(1);
    let tabToActivate = 'home';
    if (initialHashTab && globalTabConfigurations.some(tab => tab.id === initialHashTab)) {
        tabToActivate = initialHashTab;
    } else {
        if (!appData.apiKey) tabToActivate = 'data';
        else if (!appData.playerData || !appData.playerData.stats || appData.playerData.stats.operationsCompleted === 0) tabToActivate = 'home';
        else tabToActivate = 'home';
    }
    activeGlobalTabId = tabToActivate;
    console.log("MAIN: Initial active tab ID:", activeGlobalTabId);
    updateGlobalTabsAndContent();
}

// --- Tab Navigation and Management ---
function updateGlobalTabsAndContent() {
    console.log("MAIN: Updating global tabs and content. Active tab:", activeGlobalTabId);
    ui.renderGlobalTabs(globalTabConfigurations, activeGlobalTabId, handleTabClick, handleTabClose);
    renderActiveTabContent();
    window.location.hash = activeGlobalTabId || "";
}

function handleTabClick(tabId) {
    console.log("MAIN: Tab clicked:", tabId);
    if (activeGlobalTabId !== tabId) {
        activeGlobalTabId = tabId;
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
    console.log(`MAIN: Adding tab: ${id} - ${label}`);
    if (globalTabConfigurations.find(tab => tab.id === id)) {
        console.warn(`MAIN: Tab with id "${id}" already exists.`);
        if (switchToNewTab) handleTabClick(id);
        return;
    }
    const generatorFn = typeof contentGenerator === 'function' ? contentGenerator :
        (currentAppData) => game.getScenarioPlayScreenContent(id, currentAppData, "Loading scenario details...");
    globalTabConfigurations.push({ id, label, isCloseable, contentGenerator: generatorFn });
    if (switchToNewTab) activeGlobalTabId = id;
    updateGlobalTabsAndContent();
}

// --- Content Rendering Logic ---
function renderActiveTabContent() {
    console.log("MAIN: Rendering content for active tab:", activeGlobalTabId);
    if (!activeGlobalTabId) {
        ui.renderTabPanelContent('no-tabs-active', "No active tab selected.");
        return;
    }
    let contentElementOrHTML;
    const activeTabConfig = globalTabConfigurations.find(tab => tab.id === activeGlobalTabId);

    if (activeTabConfig && typeof activeTabConfig.contentGenerator === 'function') {
        contentElementOrHTML = activeTabConfig.contentGenerator(appData);
    } else {
        switch (activeGlobalTabId) {
            case 'home':
                contentElementOrHTML = game.getHomePageContent(
                    appData.playerData, !!appData.apiKey,
                    handleStartNewScenarioRequest, // This is now correctly defined before appShell
                    () => appData.playerData.recentlyClosedScenarios || [],
                    handleReopenScenarioRequest  // This is also correctly defined
                );
                break;
            case 'data':
                contentElementOrHTML = ui.createDataManagementPanel(appData, handleApiKeyChange, handleFontPreferenceChange, handleImportRequest, handleExportRequest);
                break;
            case 'notes':
                contentElementOrHTML = game.getNotesPageContent(appData.notes, (updatedNotes) => {
                    appData.notes = updatedNotes;
                    storage.saveAppData(appData);
                });
                break;
            default:
                contentElementOrHTML = `<h2>${activeGlobalTabId}</h2><p>Content definition missing for this tab configuration.</p>`;
                break;
        }
    }
    ui.renderTabPanelContent(activeGlobalTabId, contentElementOrHTML);

    if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        setTimeout(() => {
            const outputDivId = `scenario-output-${activeGlobalTabId}`;
            const outputDiv = document.getElementById(outputDivId);
            if (outputDiv) {
                console.log(`MAIN: Scrolling scenario output ${outputDivId} to bottom.`);
                outputDiv.scrollTop = outputDiv.scrollHeight;
            }
        }, 0);
    }
}

// --- Settings & Data Management Handlers ---
function handleApiKeyChange(newApiKey) {
    console.log("MAIN: API Key changed in UI (first 5):", newApiKey ? newApiKey.substring(0,5) : "EMPTY");
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

async function handleStartNewScenarioRequest(reopenScenarioData = null) {
    console.log("MAIN: Start scenario request. Reopen data:", reopenScenarioData);
    if (isScenarioStarting) { console.warn("MAIN: Scenario start already in progress."); return; }
    if (!appData.apiKey || !gemini.isReady()) {
        alert("Gemini API Key is not set or AI is not ready. Please configure it in 'Data & Settings'.");
        handleTabClick('data'); return;
    }
    isScenarioStarting = true;
    // Access disableStartGameButton via appShell AFTER appShell is defined
    if (window.appShell) window.appShell.disableStartGameButton(true);


    const scenarioId = reopenScenarioData ? reopenScenarioData.id : `scenario-er-${Date.now()}`;
    let scenarioName = reopenScenarioData ? reopenScenarioData.name : `ER Case #${(appData.playerData.stats.operationsCompleted || 0) + 1}`;
    console.log(`MAIN: Preparing scenario: ${scenarioId} - ${scenarioName}`);

    if (!reopenScenarioData) {
        if (!appData.playerData.stats) appData.playerData.stats = { operationsCompleted: 0, successRate: 0 };
        appData.playerData.stats.operationsCompleted = (appData.playerData.stats.operationsCompleted || 0) + 1;
        scenarioName = `ER Case #${appData.playerData.stats.operationsCompleted}`;
    }

    addGlobalTab(
        scenarioId, scenarioName, true, true,
        (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData, `<div class="in-tab-loading"><div class="spinner"></div><p>${reopenScenarioData ? 'Re-opening scenario...' : 'Generating scenario...'}</p></div>`)
    );

    try {
        let initialDescription, patientInfo, scenarioEventLog, currentChatHistory;

        if (reopenScenarioData) {
            console.log(`MAIN: Re-opening scenario ${scenarioId}`);
            initialDescription = reopenScenarioData.initialDescription;
            patientInfo = reopenScenarioData.patientData;
            scenarioEventLog = reopenScenarioData.eventLog || [];
            currentChatHistory = reopenScenarioData.chatHistory || [];
            // ui.updateScenarioOutput(scenarioId, `<h3>Initial Scene (Re-opened)</h3><p>${initialDescription.replace(/\n/g, '<br>')}</p>`, true);
        } else {
            console.log(`MAIN: Generating new scenario ${scenarioId} with Gemini...`);
            const initialScenarioPrompt = `
Generate a concise new medical emergency room scenario.
Output Format:
## Scenario Name: [A very brief, catchy name for the ER case, e.g., "Sudden Collapse at Mall"]

## Initial Scene:
[Detailed description of the immediate scene, patient's visible condition, what first responders or bystanders are saying. Be descriptive and engaging. Around 3-5 sentences.]

## Patient Information:
Condition: [e.g., Unresponsive, Severe Respiratory Distress]
Age: [e.g., 55]
Sex: [Male/Female]
Chief Complaint: [As reported or observed, e.g., "Crushing chest pain", "Found unresponsive"]
Initial Observations: [Brief physical assessment points, e.g., "Pale, diaphoretic. No obvious trauma. GCS 3."]
Medical Records: [Brief relevant history if known or on person, e.g., "Hx of HTN, Diabetes. Allergic to Penicillin."]
Bystander/Family Statements: [Brief statement, e.g., "Wife states he clutched his chest and collapsed.", "Friend says he was fine a minute ago."]
            `.trim();
            console.log("MAIN: About to call Gemini. initialScenarioPrompt (first 100 chars):", initialScenarioPrompt.substring(0,100) + "...");
            if (!initialScenarioPrompt) throw new Error("Initial scenario prompt is empty!");

            const geminiResponse = await gemini.ask(initialScenarioPrompt, []);

            if (!geminiResponse || !geminiResponse.text || geminiResponse.text.toLowerCase().startsWith("error:")) {
                throw new Error(geminiResponse ? geminiResponse.text : "No response from AI for initial scenario.");
            }

            const parsedData = parseGeminiScenarioData(geminiResponse.text);
            if (parsedData.scenarioName && parsedData.scenarioName !== scenarioName) {
                scenarioName = parsedData.scenarioName;
                const tabConfig = globalTabConfigurations.find(t => t.id === scenarioId);
                if (tabConfig) tabConfig.label = scenarioName;
            }
            initialDescription = parsedData.scenarioDescription;
            patientInfo = parsedData.patientData;
            scenarioEventLog = [
                { type: 'system', text: `Scenario Started: ${new Date().toLocaleString()}`, timestamp: Date.now() },
                { type: 'system', text: `Initial Scene: ${initialDescription}`, timestamp: Date.now() }
            ];
            currentChatHistory = [{role: "model", parts: [{text: geminiResponse.text}]}];
            ui.updateScenarioOutput(scenarioId, `<h3>Initial Scene</h3><p>${initialDescription.replace(/\n/g, '<br>')}</p>`, true);
        }

        appData.playerData.activeScenarios = appData.playerData.activeScenarios || {};
        appData.playerData.activeScenarios[scenarioId] = {
            id: scenarioId, name: scenarioName, initialDescription: initialDescription,
            patientData: patientInfo, eventLog: scenarioEventLog, chatHistory: currentChatHistory,
            startTimestamp: Date.now()
        };

        const patientTabId = `patient-info-${scenarioId}`;
        const patientTabLabel = `Patient: ${scenarioName.substring(0,15)}${scenarioName.length > 15 ? '...' : ''}`;
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
            if(reopenScenarioData && scenarioEventLog && scenarioEventLog.length > 0){
                 let logHtml = scenarioEventLog.map(logEntry => {
                     const logClass = logEntry.type === 'player' ? 'player-command-log' : (logEntry.type === 'ai' ? 'ai-response-log' : 'system-message');
                     if (logEntry.type === 'system' && logEntry.text.startsWith('Initial Scene:')) return '';
                     return `<p class="${logClass}">${logEntry.text.replace(/\n/g, '<br>')}</p>`;
                 }).join('');
                 outputDiv.innerHTML = `<h3>Initial Scene</h3><p>${initialDescription.replace(/\n/g, '<br>')}</p><div class="scenario-event-log-header">--- Event Log ---</div>` + logHtml;
            } else if (!reopenScenarioData && scenarioEventLog && scenarioEventLog.length > 0) {
                 scenarioEventLog.forEach(logEntry => {
                    if(!(logEntry.type === 'system' && logEntry.text.startsWith('Initial Scene:'))) {
                         ui.appendToScenarioLog(scenarioId, logEntry.text, logEntry.type === 'player');
                    }
                });
            }
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }

    } catch (error) {
        console.error("MAIN: Error starting scenario:", error);
        const idToUseForError = scenarioId || 'unknown-scenario';
        ui.updateScenarioOutput(idToUseForError, `<p class="system-message error">Error generating scenario: ${error.message}. Please try again or check API key.</p>`, true);
    } finally {
        storage.saveAppData(appData);
        isScenarioStarting = false;
        // Access disableStartGameButton via appShell AFTER appShell is defined
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
    console.log("MAIN: Parsing Gemini Response (first 300 chars):\n", responseText.substring(0,300));
    let scenarioName = "Unnamed ER Case";
    let scenarioDescription = "AI did not provide a scenario description in the expected format.";
    let patientData = {
        condition: "Unknown", age: "N/A", sex: "N/A",
        chiefComplaint: "N/A", initialObservations: "No observations.",
        medicalRecords: "No records.", bystanderStatements: "No statements."
    };

    const nameMatch = responseText.match(/## Scenario Name:\s*([^\n]+)/i);
    if (nameMatch && nameMatch[1]) scenarioName = nameMatch[1].trim();
    else console.warn("Parser: Scenario Name not found.");

    const sceneMatch = responseText.match(/## Initial Scene:\s*([\s\S]+?)(?=## Patient Information:|$)/i);
    if (sceneMatch && sceneMatch[1]) scenarioDescription = sceneMatch[1].trim();
    else console.warn("Parser: Initial Scene not found.");

    const patientInfoBlockMatch = responseText.match(/## Patient Information:\s*([\s\S]+)/i);
    if (patientInfoBlockMatch && patientInfoBlockMatch[1]) {
        const patientBlock = patientInfoBlockMatch[1].trim();
        patientData.condition = patientBlock.match(/Condition:\s*([^\n]+)/i)?.[1]?.trim() || "Unknown";
        patientData.age = patientBlock.match(/Age:\s*([^\n]+)/i)?.[1]?.trim() || "N/A";
        patientData.sex = patientBlock.match(/Sex:\s*([^\n]+)/i)?.[1]?.trim() || "N/A";
        patientData.chiefComplaint = patientBlock.match(/Chief Complaint:\s*([^\n]+)/i)?.[1]?.trim() || "N/A";
        patientData.initialObservations = patientBlock.match(/Initial Observations:\s*([\s\S]+?)(?=Medical Records:|Bystander\/Family Statements:|$)/i)?.[1]?.trim() || "No observations.";
        patientData.medicalRecords = patientBlock.match(/Medical Records:\s*([\s\S]+?)(?=Bystander\/Family Statements:|$)/i)?.[1]?.trim() || "No records.";
        patientData.bystanderStatements = patientBlock.match(/Bystander\/Family Statements:\s*([\s\S]+)/i)?.[1]?.trim() || "No statements.";
    } else {
        console.warn("Parser: Patient Information block not found.");
    }
    console.log("MAIN: Parsed Data:", { scenarioName, scenarioDescription, patientData });
    return { scenarioName, scenarioDescription, patientData };
}

// --- Input Area Management ---
const inputArea = document.getElementById('input-area');
const playerCommandInput = document.getElementById('player-command-input');
const submitCommandBtn = document.getElementById('submit-command-btn');
function showInputArea() { if (inputArea) inputArea.classList.remove('hidden'); if (playerCommandInput) playerCommandInput.focus(); }
function hideInputArea() { if (inputArea) inputArea.classList.add('hidden'); }
if (submitCommandBtn && playerCommandInput) {
    submitCommandBtn.addEventListener('click', processPlayerCommand);
    playerCommandInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); processPlayerCommand(); }});
}
async function processPlayerCommand() {
    const command = playerCommandInput.value.trim();
    if (command && activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        playerCommandInput.value = '';
        const modified = await game.handlePlayerCommand(command, activeGlobalTabId, appData);
        if (modified) {
            storage.saveAppData(appData);
        }
    } else if (command) {
        console.log("MAIN: Command entered but no active scenario tab:", command);
        playerCommandInput.value = '';
    }
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
        const tabConfig = globalTabConfigurations.find(tab => tab.id === tabId);
        if (tabConfig && tabConfig.contentGenerator) {
             ui.renderTabPanelContent(tabId, tabConfig.contentGenerator(appData));
        } else if (tabConfig) {
            renderActiveTabContent(); // Fallback, maybe more specific logic if no generator
        }
    },
    handleStartNewGame: handleStartNewScenarioRequest,
    disableStartGameButton: (disable) => {
        const startBtn = document.getElementById('home-start-new-game');
        if (startBtn) {
            startBtn.disabled = disable;
            startBtn.textContent = disable ? "Generating..." : "Start New Scenario"; // Changed text
            startBtn.style.cursor = disable ? 'not-allowed' : 'pointer';
            startBtn.style.opacity = disable ? '0.7' : '1';
        }
    },
    getRecentlyClosedScenarios: () => appData.playerData.recentlyClosedScenarios || [],
    reopenClosedScenario: handleReopenScenarioRequest
};