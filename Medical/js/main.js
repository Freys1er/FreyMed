// js/main.js

// --- Application State ---
let appData = {}; // This will hold the single source of truth for savable data
let activeGlobalTabId = null;
let globalTabConfigurations = [];

// --- Initialization ---
function initializeGame() {
    appData = storage.getAppData(); // From storage.js (which is now a global object)
    ui.applyFontPreference(appData.preferences.font || 'normal'); // From ui.js

    globalTabConfigurations = [
        { id: 'home', label: 'Home', isCloseable: false },
        { id: 'data', label: 'Data & Settings', isCloseable: false },
        { id: 'notes', label: 'Notes', isCloseable: false },
    ];

    if (!appData.apiKey) {
        activeGlobalTabId = 'data';
    } else if (!appData.playerData || !appData.playerData.stats || appData.playerData.stats.operationsCompleted === 0) {
        activeGlobalTabId = 'home';
    } else {
        activeGlobalTabId = 'home';
    }
    updateGlobalTabsAndContent();
}

// --- Tab Navigation and Management ---
function updateGlobalTabsAndContent() {
    ui.renderGlobalTabs(globalTabConfigurations, activeGlobalTabId, handleTabClick, handleTabClose);
    renderActiveTabContent();
}

function handleTabClick(tabId) {
    if (activeGlobalTabId !== tabId) {
        activeGlobalTabId = tabId;
        updateGlobalTabsAndContent();
    }
}

function handleTabClose(tabId) {
    const essentialTabs = ['home', 'data'];
    if (essentialTabs.includes(tabId) && !globalTabConfigurations.find(t => t.id === tabId)?.isCloseableOverride) {
        return;
    }
    globalTabConfigurations = globalTabConfigurations.filter(tab => tab.id !== tabId);
    ui.removeTabPanel(tabId);

    if (activeGlobalTabId === tabId) {
        activeGlobalTabId = globalTabConfigurations.find(tab => tab.id === 'home')?.id || globalTabConfigurations[0]?.id || null;
    }
    if (tabId.startsWith('scenario-')) {
        game.endScenario(tabId, appData); // Pass appData for potential cleanup
        storage.saveAppData(appData); // Save after scenario ends
    }
    updateGlobalTabsAndContent();
}

function addGlobalTab(id, label, isCloseable = true, switchToNewTab = true, contentGenerator = null) {
    if (globalTabConfigurations.find(tab => tab.id === id)) {
        if (switchToNewTab) handleTabClick(id);
        return;
    }
    // Store the generator if provided, or use a default that calls game.js
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
                    appData.playerData,
                    !!appData.apiKey,
                    () => { /* Implemented in game.getHomePageContent via appShell */ },
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
            default:
                contentElementOrHTML = `<h2>${activeGlobalTabId}</h2><p>Content definition missing.</p>`;
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
        renderActiveTabContent();
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
            initializeGame();
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
    if (playerCommandInput) playerCommandInput.focus();
}
function hideInputArea() {
    if (inputArea) inputArea.classList.add('hidden');
}

if (submitCommandBtn && playerCommandInput) {
    submitCommandBtn.addEventListener('click', processPlayerCommand);
    playerCommandInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') processPlayerCommand();
    });
}

function processPlayerCommand() {
    const command = playerCommandInput.value.trim();
    if (command) {
        const modified = game.handlePlayerCommand(command, activeGlobalTabId, appData);
        if (modified) {
            storage.saveAppData(appData);
            // If command changed visible content, re-render the current tab's panel
            // This is important if game.handlePlayerCommand directly updates UI text based on appData changes.
            renderActiveTabContent();
        }
        playerCommandInput.value = '';
    }
}

// --- Global Event Listeners & Game Start ---
document.addEventListener('DOMContentLoaded', initializeGame);

window.appShell = {
    addGlobalTab,
    showInputArea,
    hideInputArea,
    getActiveTabId: () => activeGlobalTabId,
    getAppData: () => appData, // Allow game.js to read current appData
    saveGameData: () => storage.saveAppData(appData), // Allow game.js to trigger saves
    refreshCurrentTabContent: () => { // New utility for game.js
        if (activeGlobalTabId) {
            renderActiveTabContent();
        }
    }
};