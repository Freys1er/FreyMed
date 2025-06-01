// js/animations.js

console.log("AnimationsJS: Script loaded.");

const animations = {
    // Display optimization
    _lastDisplayedScenarioTime: -1,
    _lastDisplayedScenarioPauseState: null,
    _animationFrameId: null,

    // Beep Timing
    _timeSinceLastBeepMs: 0,
    _currentBeepIntervalMs: 1000,
    _lastBeepLogicTimestamp: 0,

    // Logic Update Timing
    _lastLogicUpdateTime: 0, // Timestamp of the last time core logic was updated
    LOGIC_UPDATE_INTERVAL_MS: 1000, // How often to run core logic (e.g., update elapsedSeconds)

    /**
     * The main animation and logic loop.
     */
    updateDisplaysAndAnimationsLoop: function () {
        if (!window.appShell) {
            this._animationFrameId = requestAnimationFrame(this.updateDisplaysAndAnimationsLoop.bind(this));
            return;
        }

        const now = Date.now();
        const activeTabId = window.appShell.getActiveTabId();
        const currentAppData = window.appShell.getAppData(); // Get once per frame

        // --- 1. Core Game Logic Update (e.g., every second) ---
        const timeSinceLastLogicUpdate = now - this._lastLogicUpdateTime;
        if (timeSinceLastLogicUpdate >= this.LOGIC_UPDATE_INTERVAL_MS) {
            const deltaTimeSecondsForLogic = timeSinceLastLogicUpdate / 1000.0;
            // console.log(`AnimationsJS: Running core logic. Delta: ${deltaTimeSecondsForLogic.toFixed(2)}s`); // DEBUG

            // Update main scenario elapsed time in appData
            if (activeTabId && activeTabId.startsWith('scenario-')) {
                const scenario = currentAppData.playerData.activeScenarios?.[activeTabId];
                if (scenario && !scenario.isPaused) {
                    // Use the actual delta since last logic update for elapsedSeconds
                    scenario.elapsedSeconds += Math.floor(deltaTimeSecondsForLogic); // Add whole seconds
                    scenario.lastUpdatedTimestamp = now; // Mark when appData.elapsedSeconds was last incremented
                    // No need to call scheduleAppDataSave() every second from here if it's too frequent.
                    // Rely on more significant events or the debounced save.
                }
            }
    
            // Update logic for ALL active monitor instances
            const allOpenScenarioIds = Object.keys(currentAppData.playerData.activeScenarios || {});
            allOpenScenarioIds.forEach(scenarioId => {
                const scenarioData = currentAppData.playerData.activeScenarios[scenarioId];
                if (scenarioData && !scenarioData.isPaused) {
                    const lastMonitorUpdate = scenarioData.lastMonitorLogicUpdate || scenarioData.startTimestamp;
                    const monitorLogicDeltaMs = now - lastMonitorUpdate;
                    const monitorLogicDeltaSeconds = monitorLogicDeltaMs / 1000.0;

                    // Check if enough time has passed for this specific scenario's monitor logic
                    if (monitorLogicDeltaSeconds >= (this.LOGIC_UPDATE_INTERVAL_MS / 1000.0) || monitorLogicDeltaMs < 0) {
                        const activeMonitorTabs = window.appShell.getOpenTabIds()
                            .filter(tId => tId.includes(scenarioId) && tId.includes('-monitor-'));

                        if (window.pulseOximeter) window.pulseOximeter.updateAllActiveLogic(activeMonitorTabs.filter(id => id.startsWith('pulseox-')), monitorLogicDeltaSeconds);
                        // if (window.ecgDisplay) window.ecgDisplay.updateAllActiveLogic(...);
                        scenarioData.lastMonitorLogicUpdate = now;
                    }
                }
            });
            this._lastLogicUpdateTime = now; // Reset timestamp for next logic update cycle
        }


        // js/animations.js (inside updateDisplaysAndAnimationsLoop function)

        // ... (after "Core Game Logic Update" block) ...

        // --- 2. Update Scenario Timer Displays (In-Tab and Footer) ---
        let currentActiveScenarioId = null; // To store the actual scenario ID

        if (activeTabId && activeTabId.startsWith('scenario-')) {
            currentActiveScenarioId = activeTabId; // If the main scenario tab is active
            const scenario = currentAppData.playerData.activeScenarios?.[currentActiveScenarioId];
            if (scenario) {
                if (scenario.elapsedSeconds !== this._lastDisplayedScenarioTime || scenario.isPaused !== this._lastDisplayedScenarioPauseState) {
                    if (window.ui) {
                        ui.updateScenarioTimerDisplay(currentActiveScenarioId, scenario.elapsedSeconds, scenario.isPaused);
                        ui.updateFooterTimerDisplay(scenario.elapsedSeconds, scenario.isPaused);
                    }
                    this._lastDisplayedScenarioTime = scenario.elapsedSeconds;
                    this._lastDisplayedScenarioPauseState = scenario.isPaused;
                }
            } else {
                // Scenario data not found for an active scenario tab - this is an issue.
                if (this._lastDisplayedScenarioTime !== null && window.ui) {
                    ui.updateFooterTimerDisplay(null);
                    ui.updateScenarioTimerDisplay(currentActiveScenarioId, 0, false); // Reset in-tab too
                }
                this._lastDisplayedScenarioTime = null;
                this._lastDisplayedScenarioPauseState = false;
                currentActiveScenarioId = null; // No valid scenario context
            }
        } else if (activeTabId && activeTabId.includes('-monitor-')) {
            // If a monitor tab is active, find its parent scenario ID
            // Example: "pulseox-monitor-scenario-er-123" -> "scenario-er-123"
            // Example: "ecg-monitor-scenario-er-123" -> "scenario-er-123"
            const parts = activeTabId.split('-monitor-');
            if (parts.length > 1) {
                currentActiveScenarioId = parts[parts.length - 1]; // Get the last part after '-monitor-'
                // console.log("AnimationsJS: Active tab is a monitor, parent scenarioId:", currentActiveScenarioId); // DEBUG
                const scenario = currentAppData.playerData.activeScenarios?.[currentActiveScenarioId];
                if (scenario) {
                    // Footer timer still shows main scenario time
                    if (scenario.elapsedSeconds !== this._lastDisplayedScenarioTime || scenario.isPaused !== this._lastDisplayedScenarioPauseState) {
                        if (window.ui) {
                            ui.updateFooterTimerDisplay(scenario.elapsedSeconds, scenario.isPaused);
                        }
                        this._lastDisplayedScenarioTime = scenario.elapsedSeconds;
                        this._lastDisplayedScenarioPauseState = scenario.isPaused;
                    }
                } else {
                    currentActiveScenarioId = null; // Parent scenario not found
                    if (this._lastDisplayedScenarioTime !== null && window.ui) ui.updateFooterTimerDisplay(null);
                    this._lastDisplayedScenarioTime = null; this._lastDisplayedScenarioPauseState = false;
                }
            } else {
                currentActiveScenarioId = null; // Could not parse scenario ID from monitor tab
                if (this._lastDisplayedScenarioTime !== null && window.ui) ui.updateFooterTimerDisplay(null);
                this._lastDisplayedScenarioTime = null; this._lastDisplayedScenarioPauseState = false;
            }
        }
        else { // Not a scenario tab or recognized monitor tab
            if (this._lastDisplayedScenarioTime !== null && window.ui) {
                ui.updateFooterTimerDisplay(null);
            }
            this._lastDisplayedScenarioTime = null;
            this._lastDisplayedScenarioPauseState = false;
            currentActiveScenarioId = null;
        }


        // --- 3. Heart Rate Beep Logic (based on currentActiveScenarioId) ---
        if (currentActiveScenarioId) { // Only beep if there's an active scenario context
            const scenarioForBeep = currentAppData.playerData.activeScenarios?.[currentActiveScenarioId];
            // Get the pulse oximeter instance linked to this specific scenarioId
            const pulseOxInstanceForBeep = window.pulseOximeter?.instances[currentActiveScenarioId];

            if (this.frameCount % 30 === 0 && pulseOxInstanceForBeep && scenarioForBeep) { // Log status every half second approx
                // console.log(`ANIM_BeepLogic: Scenario: ${currentActiveScenarioId}, HR: ${pulseOxInstanceForBeep.currentHR}, ScenarioPaused: ${scenarioForBeep.isPaused}, MonitorPaused: ${pulseOxInstanceForBeep.isPaused}, Interval: ${this._currentBeepIntervalMs.toFixed(0)}, TimeSinceLast: ${this._timeSinceLastBeepMs.toFixed(0)}`);
            }

            if (pulseOxInstanceForBeep && pulseOxInstanceForBeep.currentHR > 0 &&
                scenarioForBeep && !scenarioForBeep.isPaused && // Check main scenario pause
                !pulseOxInstanceForBeep.isPaused) { // Check monitor instance pause

                this._currentBeepIntervalMs = (60 / pulseOxInstanceForBeep.currentHR) * 1000;
                const deltaBeepLogicTimeMs = this._lastBeepLogicTimestamp ? (now - this._lastBeepLogicTimestamp) : (1000 / 60);
                this._timeSinceLastBeepMs += deltaBeepLogicTimeMs;

                if (this._timeSinceLastBeepMs >= this._currentBeepIntervalMs) {
                    if (window.audioManager) audioManager.playBeep();
                    this._timeSinceLastBeepMs %= this._currentBeepIntervalMs;
                }
            } else {
                this._timeSinceLastBeepMs = 0; // Reset if no HR or paused
            }
        } else {
            this._timeSinceLastBeepMs = 0; // No active scenario context for beeps
        }
        this._lastBeepLogicTimestamp = now; // Update this regardless for next frame's delta


        // --- 4. Render All Active Monitor Instances (Waveforms, Numeric Vitals on Monitor Tabs) ---
        // ... (as before, using allOpenTabIds and then extracting scenarioId for each monitor type) ...
        const allOpenTabIds = window.appShell.getOpenTabIds ? window.appShell.getOpenTabIds() : [];

        if (window.pulseOximeter && typeof window.pulseOximeter.renderAllActiveInstances === 'function') {
            const pulseOxMonitorTabIds = allOpenTabIds.filter(id => id.startsWith('pulseox-monitor-'));
            if (pulseOxMonitorTabIds.length > 0) {
                window.pulseOximeter.renderAllActiveInstances(pulseOxMonitorTabIds);
            }
        }
        // if (window.ecgDisplay) {
        //     window.ecgDisplay.renderAllActiveInstances(allOpenTabIds.filter(id => id.startsWith('ecg-')));
        // }
        // if (window.ecgDisplay) { /* ... render ECG ... */ }

        this._animationFrameId = requestAnimationFrame(this.updateDisplaysAndAnimationsLoop.bind(this));
    },


    /**
     * Starts the main animation loop.
     */
    startAnimationLoop: function () {
        if (this._animationFrameId) return;
        console.log("AnimationsJS: Starting main animation loop.");
        this._lastBeepLogicTimestamp = Date.now(); // Initialize beep timestamp
        this._animationFrameId = requestAnimationFrame(this.updateDisplaysAndAnimationsLoop.bind(this));
    },

    /**
     * Stops the main animation loop.
     */
    stopAnimationLoop: function () {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
            console.log("AnimationsJS: Animation loop stopped.");
        }
    },

    // Reset optimization flags when a tab switch significantly changes context
    // This might be called by main.js's handleTabClick
    resetDisplayOptimizationFlags: function () {
        this._lastDisplayedScenarioTime = -1;
        this._lastDisplayedScenarioPauseState = null;
        this._timeSinceLastBeepMs = 0; // Reset beep timer on significant changes too
        console.log("AnimationsJS: Display optimization and beep flags reset.");
    }
};

// Expose the animations object globally
window.animations = animations;