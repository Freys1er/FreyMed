// js/storage.js (Ensuring proper default init for operationsCompleted)
const storage = {
    STORAGE_KEY: 'criticalChoicesAppData',

    getAppData: function() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            const parsedData = data ? JSON.parse(data) : {};

            // Ensure appData structure with defaults
            return {
                apiKey: parsedData.apiKey || '',
                preferences: parsedData.preferences || { font: 'normal' },
                notes: parsedData.notes || '',
                playerData: {
                    stats: {
                        operationsCompleted: parsedData.playerData?.stats?.operationsCompleted || 0, // Ensure default to 0
                        successRate: parsedData.playerData?.stats?.successRate || 0
                    },
                    activeScenarios: parsedData.playerData?.activeScenarios || {},
                    completedScenarios: parsedData.playerData?.completedScenarios || {},
                    recentlyClosedScenarios: parsedData.playerData?.recentlyClosedScenarios || []
                }
            };
        } catch (e) {
            console.error("Error loading app data from localStorage:", e);
            alert("Could not load saved data. Starting fresh.");
            return {
                apiKey: '',
                preferences: { font: 'normal' },
                notes: '',
                playerData: {
                    stats: { operationsCompleted: 0, successRate: 0 },
                    activeScenarios: {},
                    completedScenarios: {},
                    recentlyClosedScenarios: []
                }
            };
        }
    },

    saveAppData: function(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            console.log("App data saved.");
        } catch (e) {
            console.error("Error saving app data to localStorage:", e);
            alert("Could not save data. Please check browser storage settings.");
        }
    },

    exportAppData: function() {
        try {
            const data = this.getAppData();
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `critical_choices_save_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert("Game data exported successfully!");
        } catch (e) {
            console.error("Error exporting app data:", e);
            alert("Failed to export data.");
        }
    },

    importAppData: function(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                return reject(new Error("No file selected."));
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    // Basic validation to ensure it's a valid appData structure
                    if (typeof importedData === 'object' && importedData !== null && importedData.playerData) {
                        this.saveAppData(importedData); // Save imported data immediately
                        resolve(importedData);
                    } else {
                        reject(new Error("Invalid game data file format."));
                    }
                } catch (e) {
                    reject(new Error("Failed to parse file: " + e.message));
                }
            };
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }
};