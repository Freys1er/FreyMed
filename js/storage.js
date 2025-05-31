// js/storage.js

const storage = {
    APP_DATA_STORAGE_ID: 'criticalChoices_appData',

    getAppData: function() {
        try {
            const appDataJSON = localStorage.getItem(this.APP_DATA_STORAGE_ID);
            if (appDataJSON) {
                const parsed = JSON.parse(appDataJSON);
                // Ensure all nested structures exist with defaults
                parsed.preferences = parsed.preferences || { font: 'normal' };
                parsed.playerData = parsed.playerData || {};
                parsed.playerData.stats = parsed.playerData.stats || { operationsCompleted: 0, successRate: 0 };
                parsed.playerData.activeScenarios = parsed.playerData.activeScenarios || {}; // For currently open scenarios
                parsed.playerData.recentlyClosedScenarios = parsed.playerData.recentlyClosedScenarios || []; // For re-opening
                parsed.notes = parsed.notes || "";
                parsed.apiKey = parsed.apiKey || "";
                return parsed;
            }
        } catch (e) {
            console.error("Error parsing app data from localStorage:", e);
        }
        // Return a default structure if no data is found or parsing fails
        return {
            apiKey: '',
            preferences: {
                font: 'normal',
            },
            playerData: {
                stats: {
                    operationsCompleted: 0,
                    successRate: 0,
                },
                activeScenarios: {},
                recentlyClosedScenarios: []
            },
            notes: ""
        };
    },

    saveAppData: function(appData) {
        try {
            if (typeof appData !== 'object' || appData === null) {
                console.error("Invalid appData provided to saveAppData. Must be an object.");
                return;
            }
            localStorage.setItem(this.APP_DATA_STORAGE_ID, JSON.stringify(appData));
            console.log("App data saved:", appData); // For debugging
        } catch (e) {
            console.error("Error saving app data to localStorage:", e);
        }
    },

    exportAppData: function() {
        const appData = this.getAppData();
        const jsonString = JSON.stringify(appData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `critical_choices_save_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("Application data exported.");
        alert("Game data and settings exported!");
    },

    importAppData: async function(file) {
        return new Promise((resolve, reject) => {
            if (!file || file.type !== "application/json") {
                reject(new Error("Invalid file type. Please select a JSON file."));
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    // More robust validation
                    if (typeof importedData === 'object' && importedData !== null &&
                        typeof importedData.apiKey === 'string' &&
                        typeof importedData.preferences === 'object' &&
                        typeof importedData.playerData === 'object' &&
                        typeof importedData.playerData.stats === 'object') {
                        this.saveAppData(importedData);
                        resolve(importedData);
                    } else {
                        reject(new Error("Invalid save file format. Missing essential structure."));
                    }
                } catch (e) {
                    console.error("Error parsing imported file:", e);
                    reject(new Error("Invalid save file format. Could not parse JSON."));
                }
            };
            reader.onerror = () => {
                reject(new Error("Error reading file."));
            };
            reader.readAsText(file);
        });
    }
};