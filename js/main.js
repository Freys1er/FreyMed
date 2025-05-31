// js/main.js

// --- Application State ---
let appData = {};
let activeGlobalTabId = null;
let globalTabConfigurations = [];

let gameTimerInterval = null; // For the global scenario timer
const TIMER_UPDATE_INTERVAL_MS = 100; // Update timer display every second
// recentlyClosedScenarios is part of appData.playerData

// --- Initialization ---
function initializeGame() {
    console.log("MAIN: Initializing game...");
    appData = storage.getAppData(); // storage.getAppData() should provide defaults for timer fields
    console.log("MAIN: Loaded appData:", JSON.parse(JSON.stringify(appData)));

    // Ensure active scenarios from old saves have necessary timer fields initialized
    if (appData.playerData && appData.playerData.activeScenarios) {
        for (const scenarioId in appData.playerData.activeScenarios) {
            const scenario = appData.playerData.activeScenarios[scenarioId];
            if (!scenario.hasOwnProperty('elapsedSeconds')) scenario.elapsedSeconds = 0;
            if (!scenario.hasOwnProperty('isPaused')) scenario.isPaused = false;
            if (!scenario.startTimestamp) scenario.startTimestamp = Date.now(); // Should exist from creation
            scenario.lastUpdatedTimestamp = Date.now(); // Critical: reset for current session
            console.log(`MAIN: Initialized/Checked timer fields for restored scenario ${scenarioId}`);
        }
    }


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
                    contentGenerator: (currentAppData) => game.getScenarioPlayScreenContent(scenarioId, currentAppData)
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
    startGlobalGameTimer(); // Start the timer
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
    const previousActiveTabId = activeGlobalTabId; // Store previous active tab

    if (previousActiveTabId !== tabId) {
        // Update timer for the tab being switched AWAY from (if it's a scenario)
        if (previousActiveTabId && previousActiveTabId.startsWith('scenario-')) {
            const oldScenario = appData.playerData.activeScenarios?.[previousActiveTabId];
            if (oldScenario && !oldScenario.isPaused) {
                const now = Date.now();
                const deltaSeconds = Math.floor((now - oldScenario.lastUpdatedTimestamp) / 1000);
                if (deltaSeconds >= 0) { // Allow 0 for immediate update
                    oldScenario.elapsedSeconds += deltaSeconds;
                    oldScenario.lastUpdatedTimestamp = now;
                }
            }
        }

        activeGlobalTabId = tabId;

        // Update/reset footer timer based on the NEW active tab
        if (activeGlobalTabId.startsWith('scenario-')) {
            const newScenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
            if (newScenario) {
                if (!newScenario.isPaused) newScenario.lastUpdatedTimestamp = Date.now(); // Reset for accurate timing
                ui.updateFooterTimerDisplay(newScenario.elapsedSeconds, newScenario.isPaused);
            } else {
                ui.updateFooterTimerDisplay(null); // Scenario data not found
            }
        } else {
            ui.updateFooterTimerDisplay(null); // Not a scenario tab
        }
        updateGlobalTabsAndContent(); // This will re-render in-tab timer via getScenarioPlayScreenContent
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
        let initialDescription, patientInfo, scenarioEventLog, currentChatHistory;

        if (reopenScenarioData) {
            console.log(`MAIN: Re-opening scenario ${scenarioId}`);
            initialDescription = reopenScenarioData.initialDescription;
            patientInfo = reopenScenarioData.patientData;
            scenarioEventLog = reopenScenarioData.eventLog || [];
            currentChatHistory = reopenScenarioData.chatHistory || [];
            // ui.updateScenarioOutput is not strictly needed here if getScenarioPlayScreenContent handles full render
        } else {
            console.log(`MAIN: Generating new scenario ${scenarioId} with Gemini...`);
            let scenarioTypeInstruction = "Generate a concise new medical scenario.";
            const professionLower = userProfession.toLowerCase();
            const detailsLower = userScenarioDetails.toLowerCase();
            if (professionLower.includes("er doctor") || professionLower.includes("paramedic") || professionLower.includes("emergency") ||
                detailsLower.includes("trauma") || detailsLower.includes("critical") || detailsLower.includes("unresponsive") || detailsLower.includes("collapse")) {
                scenarioTypeInstruction = "Generate a concise, high-intensity medical emergency room (ER) or Intensive Care Unit (ICU) scenario. Focus on critical, life-threatening conditions requiring rapid assessment and intervention.";
            } else if (professionLower.includes("surgeon") || professionLower.includes("anesthesiologist") || professionLower.includes("operating room") ||
                detailsLower.includes("surgery") || detailsLower.includes("operation") || detailsLower.includes("appendectomy") || detailsLower.includes("cholecystectomy")) {
                scenarioTypeInstruction = "Generate a scenario focused on a surgical operation or a pre/post-operative consultation. This could be a planned procedure or an emergent one. Describe the operating room setting or clinic setting if a consult.";
            } else if (professionLower.includes("general practitioner") || professionLower.includes("gp") || professionLower.includes("family doctor") || professionLower.includes("clinic") ||
                detailsLower.includes("consultation") || detailsLower.includes("check-up") || detailsLower.includes("chronic") || detailsLower.includes("follow-up")) {
                scenarioTypeInstruction = "Generate a scenario typical for a general practice or outpatient clinic setting. This could involve a routine check-up, managing a chronic condition, a new patient consultation for non-acute symptoms, or a follow-up visit.";
            }

            let basePrompt = `
You are an AI assistant generating a medical scenario for a simulation game.
The user will be playing as a ${userProfession}.
${scenarioTypeInstruction}

Please generate the scenario details adhering STRICTLY to the following output structure, using the exact headings provided (including any slashes like "Initial Scene / Setting"):

## Scenario Name:
[Provide a very brief, catchy name for the case. Examples: "Sudden Collapse at Mall", "Elective Cholecystectomy", "Worrisome Cough"]

## Initial Scene / Setting:
[Describe the immediate environment (e.g., ER bay 3, Operating Room 2, ICU Bed 5, a busy clinic examination room).
For dynamic emergency scenes, detail the patient's arrival (e.g., via ambulance, walk-in) and their most obvious presenting condition.
For calmer, scheduled scenes (e.g., surgery, clinic visit), describe the room setup and if the patient is already present or just arriving for their appointment.
Make this section 3-5 sentences long and engaging, setting the stage for the ${userProfession}.]
`;
            if (userScenarioDetails) {
                basePrompt += `
The scenario MUST be based on or centrally incorporate the following details, chief complaint, or situation provided by the user: "${userScenarioDetails}".
Integrate these user-provided details naturally into the "Initial Scene / Setting" and the relevant parts of "Patient Information" below.
`;
            } else {
                basePrompt += `\nGenerate a plausible and typical case that a ${userProfession} would encounter.\n`;
            }
            basePrompt += `
## Patient Information:
Follow this exact format for patient details:
Condition: [Patient's current primary medical state relevant to the scenario, e.g., "Acute Myocardial Infarction", "Pre-operative for appendectomy, stable", "Controlled Type 2 Diabetes with new concerns"]
Age: [Patient's age, e.g., 62]
Sex: [Male/Female/Other, or as appropriate]
Chief Complaint: [The main reason the patient is presenting, as reported or observed. If user provided details, use that as the primary complaint. e.g., "I feel like an elephant is sitting on my chest!", "Persistent abdominal pain for 3 days", "Routine physical exam requested"]
Initial Observations / Presentation: [Key objective findings or observations a ${userProfession} would note on first encountering the patient in this setting.
For ER/ICU: Include GCS, general appearance (e.g., pale, diaphoretic, cyanotic), obvious injuries or distress. Example: "GCS 10 (E2V3M5). Pale, cool, clammy skin. Audible wheezing."
For Surgery: Pre-operative status (e.g., "Alert, oriented, anxious. IV access established.") or key intra-operative point if scenario starts mid-op.
For GP/Clinic: General appearance, stated mood, any immediately obvious physical signs. Example: "Appears fatigued but in no acute distress. Cooperative."]
Medical Records / History: [Brief, RELEVANT past medical history, known significant allergies, and key current medications. Focus on what would be quickly available or pertinent. e.g., "PMH: Hypertension, Type 2 Diabetes. Allergies: NKDA. Meds: Metformin 1000mg BID, Lisinopril 10mg OD.", "PMH: Asthma. Allergies: Penicillin (rash). Meds: Salbutamol MDI prn."]
Bystander/Family Statements / Referral Notes: [A brief, relevant quote or summary from anyone accompanying the patient, or a note from a referring physician if applicable. e.g., "Wife reports he suddenly grabbed his chest and said 'it hurts bad' before collapsing.", "Patient states his previous doctor retired and he needs a new GP.", "Referred by Dr. Anya Sharma for evaluation of persistent cough."]

Make the scenario challenging but realistic for a ${userProfession}.
Ensure all requested sections (## Scenario Name, ## Initial Scene / Setting, ## Patient Information with all its sub-fields) are present and populated with appropriate content.
`;
            const initialScenarioPrompt = basePrompt.trim();
            console.log("MAIN: About to call Gemini. initialScenarioPrompt (first 200 chars):", initialScenarioPrompt.substring(0, 200) + "...");
            if (!initialScenarioPrompt) throw new Error("Initial scenario prompt is empty!");

            const geminiResponse = await gemini.ask(initialScenarioPrompt, []);
            console.log("MAIN: Raw Gemini Response Text for parsing:\n", geminiResponse ? geminiResponse.text : "No response text from Gemini"); // Log raw response

            if (!geminiResponse || !geminiResponse.text || geminiResponse.text.toLowerCase().startsWith("error:")) {
                throw new Error(geminiResponse ? geminiResponse.text : "No response from AI for initial scenario.");
            }

            const parsedData = parseGeminiScenarioData(geminiResponse.text); // Ensure this uses the updated scenarioName
            if (parsedData.scenarioName && parsedData.scenarioName !== scenarioName) {
                scenarioName = parsedData.scenarioName;
                const tabConfig = globalTabConfigurations.find(t => t.id === scenarioId);
                if (tabConfig) tabConfig.label = scenarioName;
            }
            initialDescription = parsedData.scenarioDescription;
            patientInfo = parsedData.patientData;
            scenarioEventLog = [
                { type: 'system', text: `Scenario Started (Role: ${userProfession}): ${new Date().toLocaleString()}`, timestamp: Date.now() },
                { type: 'system', text: `Initial Scene: ${initialDescription}`, timestamp: Date.now() } // This log might be redundant if initialDescription is displayed directly
            ];
            currentChatHistory = [{ role: "model", parts: [{ text: geminiResponse.text }] }];
            // Update the scenario tab content with the parsed initial scene
            ui.updateScenarioOutput(scenarioId, `<h3>Initial Scene</h3><p>${initialDescription.replace(/\n/g, '<br>')}</p>`, true);
        }

        appData.playerData.activeScenarios = appData.playerData.activeScenarios || {};
        appData.playerData.activeScenarios[scenarioId] = {
            id: scenarioId, name: scenarioName, initialDescription: initialDescription,
            patientData: patientInfo, eventLog: scenarioEventLog, chatHistory: currentChatHistory,
            startTimestamp: Date.now(), userRole: userProfession
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
            startTimestamp: scenarioStartTimestamp,
            elapsedSeconds: scenarioElapsedSeconds,
            isPaused: scenarioIsPaused,
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


// --- Input Area Management ---
const inputArea = document.getElementById('input-area');
const playerCommandInput = document.getElementById('player-command-input');
const submitCommandBtn = document.getElementById('submit-command-btn');

function showInputArea() {
    if (inputArea) inputArea.classList.remove('hidden');
    if (playerCommandInput) playerCommandInput.focus();
    // When input area is shown due to a scenario, ensure footer timer is updated
    if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        const scenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
        if (scenario) ui.updateFooterTimerDisplay(scenario.elapsedSeconds, scenario.isPaused);
        else ui.updateFooterTimerDisplay(null);
    } else {
        ui.updateFooterTimerDisplay(null);
    }
}
function hideInputArea() {
    if (inputArea) inputArea.classList.add('hidden');
    ui.updateFooterTimerDisplay(null); // Hide timer when input area is hidden
}

if (submitCommandBtn && playerCommandInput) {
    submitCommandBtn.addEventListener('click', processPlayerCommand);
    playerCommandInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); processPlayerCommand(); } });
}
async function processPlayerCommand() {
    const command = playerCommandInput.value.trim();
    if (command && activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
        const scenario = appData.playerData.activeScenarios[activeGlobalTabId];
        if (scenario && scenario.isPaused) {
            alert("Scenario is paused. Please resume to continue.");
            playerCommandInput.value = command; // Put command back
            return;
        }

        playerCommandInput.value = '';
        // Include elapsed time in the context for the AI
        const timeContext = `(Elapsed Scenario Time: ${formatTime(scenario.elapsedSeconds)})`;
        const commandWithContext = `${command} ${timeContext}`;

        // Pass commandWithContext to game.handlePlayerCommand
        // game.handlePlayerCommand will then pass it to gemini.ask
        const modified = await game.handlePlayerCommand(command, commandWithContext, activeGlobalTabId, appData);
        if (modified) {
            storage.saveAppData(appData);
        }
    } else if (command) {
        console.log("MAIN: Command entered but no active scenario tab:", command);
        playerCommandInput.value = '';
    }
}

// js/main.js
function startGlobalGameTimer() {
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        // console.log("MAIN: Timer Tick! Active Tab:", activeGlobalTabId); // Keep for debugging if needed
        if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
            const scenario = appData.playerData.activeScenarios?.[activeGlobalTabId];
            if (scenario && !scenario.isPaused) {
                const now = Date.now();
                // Calculate delta from lastUpdatedTimestamp
                const deltaSeconds = Math.floor((now - scenario.lastUpdatedTimestamp) / 1000);

                if (deltaSeconds > 0) {
                    scenario.elapsedSeconds += deltaSeconds;
                    scenario.lastUpdatedTimestamp = now; // CRITICAL: Update last timestamp
                    // console.log(`MAIN: Scenario ${activeGlobalTabId} time: ${formatTime(scenario.elapsedSeconds)} (${scenario.elapsedSeconds}s)`);
                }
                ui.updateScenarioTimerDisplay(activeGlobalTabId, scenario.elapsedSeconds, scenario.isPaused);
                ui.updateFooterTimerDisplay(scenario.elapsedSeconds, scenario.isPaused);
            } else if (scenario && scenario.isPaused) {
                // Ensure display shows paused state even if time isn't incrementing
                ui.updateScenarioTimerDisplay(activeGlobalTabId, scenario.elapsedSeconds, true);
                ui.updateFooterTimerDisplay(scenario.elapsedSeconds, true);
            } else if (!scenario) {
                console.warn("MAIN: Timer tick for scenario tab, but no scenario data found for:", activeGlobalTabId);
                ui.updateFooterTimerDisplay(null);
            }
        } else {
            ui.updateFooterTimerDisplay(null);
        }
    }, TIMER_UPDATE_INTERVAL_MS);
    console.log("MAIN: Global scenario timer (re)started.");
}


function pauseScenarioTimer(scenarioId) {
    const scenario = appData.playerData.activeScenarios?.[scenarioId];
    if (scenario && !scenario.isPaused) {
        const now = Date.now(); // Get current time for accurate last update
        const deltaSeconds = Math.floor((now - scenario.lastUpdatedTimestamp) / 1000);
        if (deltaSeconds >= 0) scenario.elapsedSeconds += deltaSeconds; // Add any remaining fraction of a second

        scenario.isPaused = true;
        scenario.lastUpdatedTimestamp = now; // Record time of pause
        storage.saveAppData(appData);
        ui.updateScenarioTimerDisplay(scenarioId, scenario.elapsedSeconds, true);
        if (scenarioId === activeGlobalTabId) ui.updateFooterTimerDisplay(scenario.elapsedSeconds, true);
        console.log(`MAIN: Timer PAUSED for scenario ${scenarioId} at ${formatTime(scenario.elapsedSeconds)}`);
    }
}

function resumeScenarioTimer(scenarioId) {
    const scenario = appData.playerData.activeScenarios?.[scenarioId];
    if (scenario && scenario.isPaused) {
        scenario.isPaused = false;
        scenario.lastUpdatedTimestamp = Date.now(); // CRITICAL: Reset for new interval calculations
        storage.saveAppData(appData);
        ui.updateScenarioTimerDisplay(scenarioId, scenario.elapsedSeconds, false);
        if (scenarioId === activeGlobalTabId) ui.updateFooterTimerDisplay(scenario.elapsedSeconds, false);
        console.log(`MAIN: Timer RESUMED for scenario ${scenarioId} at ${formatTime(scenario.elapsedSeconds)}`);
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
    reopenClosedScenario: handleReopenScenarioRequest,

    pauseActiveScenarioTimer: () => {
        if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
            pauseScenarioTimer(activeGlobalTabId);
        }
    },
    resumeActiveScenarioTimer: () => {
        if (activeGlobalTabId && activeGlobalTabId.startsWith('scenario-')) {
            resumeScenarioTimer(activeGlobalTabId);
        }
    }
};

