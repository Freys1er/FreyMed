// js/animations.js
console.log("AnimationsJS: Script loaded.");

const animations = {
    _lastDisplayedScenarioTime: -1,
    _lastDisplayedScenarioPauseState: null,
    _animationFrameId: null,

    // Beep Timing State
    _timeSinceLastBeepMs: 0,
    _currentBeepIntervalMs: 1000, // Default to 60 BPM (1 beep per second)

    
    _timeSinceLastAlarmMs: 0,
    _currentAlarmIntervalMs: 2000, // Default to 60 BPM (1 beep per second)


    _lastBeepLogicTimestamp: 0,   // Timestamp of the last frame beep logic was run

    // Logic Update Timing
    _lastLogicUpdateTime: 0,
    LOGIC_UPDATE_INTERVAL_MS: 1000,

    frameCount: 0,

    updateDisplaysAndAnimationsLoop: function () {
        const self = this;
        self.frameCount++;

        if (!window.appShell || typeof window.appShell.getActiveTabId !== 'function' ||
            typeof window.appShell.getAppData !== 'function' ||
            typeof window.appShell.getOpenTabIds !== 'function' ||
            !window.ui ||
            !window.patientMonitor || typeof window.patientMonitor.updateAllActiveLogic !== 'function' ||
            typeof window.patientMonitor.renderAllActiveInstances !== 'function' ||
            !window.audioManager // Make sure audioManager is also checked if used directly
        ) {
            if (self.frameCount % 60 === 0) {
                console.warn("AnimationsJS: Waiting for appShell/UI/PatientMonitor/AudioManager to be fully ready.");
                // Log which one is missing for easier debug:
                // console.log("appShell:", !!window.appShell, "ui:", !!window.ui, "patientMonitor:", !!window.patientMonitor, "audioManager:", !!window.audioManager);
            }
            self._animationFrameId = requestAnimationFrame(self.updateDisplaysAndAnimationsLoop.bind(self));
            return;
        }

        const now = Date.now();
        const activeMainTabId = window.appShell.getActiveTabId();
        const currentAppData = window.appShell.getAppData();
        let scenarioContextId = null;

        if (activeMainTabId?.startsWith('scenario-')) {
            scenarioContextId = activeMainTabId;
        } else if (activeMainTabId === 'monitors-main' && window.monitorsScreen?.activeScenarioId) {
            scenarioContextId = window.monitorsScreen.activeScenarioId;
        }

        // --- 1. Core Game Data Logic Update (Throttled) ---
        const timeSinceLastLogicUpdate = now - self._lastLogicUpdateTime;
        if (timeSinceLastLogicUpdate >= self.LOGIC_UPDATE_INTERVAL_MS) {
            // ... (This block updates appData.elapsedSeconds and calls patientMonitor.updateAllActiveLogic)
            // ... (This is where instance.currentHR in patientMonitor.js instances gets updated)
            // (Content from previous correct version)
            const deltaTimeSecondsForLogic = timeSinceLastLogicUpdate / 1000.0;
            if (activeMainTabId && activeMainTabId.startsWith('scenario-')) {
                const scenarioForTime = currentAppData.playerData.activeScenarios?.[activeMainTabId];
                if (scenarioForTime && !scenarioForTime.isPaused) {
                    scenarioForTime.elapsedSeconds += Math.floor(deltaTimeSecondsForLogic);
                    scenarioForTime.lastUpdatedTimestamp = self._lastLogicUpdateTime + (Math.floor(deltaTimeSecondsForLogic) * 1000);
                }
            }
            const allScenarioIdsWithData = Object.keys(currentAppData.playerData.activeScenarios || {});
            if (allScenarioIdsWithData.length > 0) {
                window.patientMonitor.updateAllActiveLogic(allScenarioIdsWithData, deltaTimeSecondsForLogic);
            }
            self._lastLogicUpdateTime = now;
        }

        // --- 2. Update Visible Scenario Timer Displays ---
        if (scenarioContextId) {
            const scenarioToDisplayTimeFor = currentAppData.playerData.activeScenarios?.[scenarioContextId];
            if (scenarioToDisplayTimeFor) {
                if (scenarioToDisplayTimeFor.elapsedSeconds !== self._lastDisplayedScenarioTime ||
                    scenarioToDisplayTimeFor.isPaused !== self._lastDisplayedScenarioPauseState) {
                    // ... (update UI timers) ...
                    if (window.ui) {
                        if (activeMainTabId === scenarioContextId) {
                            ui.updateScenarioTimerDisplay(scenarioContextId, scenarioToDisplayTimeFor.elapsedSeconds, scenarioToDisplayTimeFor.isPaused);
                        }
                        ui.updateFooterTimerDisplay(scenarioToDisplayTimeFor.elapsedSeconds, scenarioToDisplayTimeFor.isPaused);
                    }
                    self._lastDisplayedScenarioTime = scenarioToDisplayTimeFor.elapsedSeconds;
                    self._lastDisplayedScenarioPauseState = scenarioToDisplayTimeFor.isPaused;
                }

                // --- 3. Heart Rate Beep Logic (for the scenarioContextId) ---
                // This is the critical section for beeps.
                const monitorInstanceForBeep = window.patientMonitor?.instances[scenarioContextId]; // Get the whole monitor instance

                // Log state for beeping decision every ~second
                if (self.frameCount % 60 === 0) {
                    console.log(`ANIM_BeepCheck (${scenarioContextId}): ` +
                        `MonitorInstance: ${!!monitorInstanceForBeep}, ` +
                        `HR: ${monitorInstanceForBeep?.vitals?.hr}, ` +
                        `ScenarioPaused: ${scenarioToDisplayTimeFor?.isPaused}, ` +
                        `MonitorWidgetPaused: ${monitorInstanceForBeep?.isPaused}`);
                }

                if (monitorInstanceForBeep && monitorInstanceForBeep.vitals && monitorInstanceForBeep.vitals.hr > 0 &&
                    scenarioToDisplayTimeFor && !scenarioToDisplayTimeFor.isPaused && // Check main scenario pause
                    !monitorInstanceForBeep.isPaused) { // Check monitor widget's own pause state

                    self._currentBeepIntervalMs = (60 / monitorInstanceForBeep.vitals.hr) * 1000;
                    const deltaBeepLogicTimeMs = self._lastBeepLogicTimestamp ? (now - self._lastBeepLogicTimestamp) : (1000 / 60); // Approx 16ms for 60fps
                    self._timeSinceLastBeepMs += deltaBeepLogicTimeMs;
                    self._timeSinceLastAlarmMs += deltaBeepLogicTimeMs;

                    if (self._timeSinceLastBeepMs >= self._currentBeepIntervalMs) {
                        // console.log(`AnimationsJS: PLAYING BEEP! Scenario: ${scenarioContextId}, HR: ${monitorInstanceForBeep.vitals.hr}, Interval: ${self._currentBeepIntervalMs.toFixed(0)}`);
                        const pitch = (monitorInstanceForBeep.vitals.spo2 - 90) / 4; // Round to nearest 10 for better audio
                        audioManager.playBeep(pitch); // Directly call the global audioManager
                        self._timeSinceLastBeepMs %= self._currentBeepIntervalMs;
                    }
                    if (self._timeSinceLastAlarmMs >= self._currentAlarmIntervalMs && monitorInstanceForBeep.vitals.spo2 < 90) {
                        // console.log(`AnimationsJS: PLAYING BEEP! Scenario: ${scenarioContextId}, HR: ${monitorInstanceForBeep.vitals.hr}, Interval: ${self._currentBeepIntervalMs.toFixed(0)}`);
                        audioManager.playAlarm(1); // Directly call the global audioManager
                        self._timeSinceLastAlarmMs %= self._currentAlarmIntervalMs;
                    }
                } else {
                    self._timeSinceLastBeepMs = 0; // Reset if no HR, or scenario paused, or monitor widget paused
                }
            } else { // No scenario data found for scenarioContextId
                if (self._lastDisplayedScenarioTime !== null && window.ui) ui.updateFooterTimerDisplay(null);
                self._lastDisplayedScenarioTime = null; self._lastDisplayedScenarioPauseState = false;
                self._timeSinceLastBeepMs = 0;
            }
        } else { // No scenarioContextId (e.g., on Home tab)
            if (self._lastDisplayedScenarioTime !== null && window.ui) ui.updateFooterTimerDisplay(null);
            self._lastDisplayedScenarioTime = null; self._lastDisplayedScenarioPauseState = false;
            self._timeSinceLastBeepMs = 0;
        }
        self._lastBeepLogicTimestamp = now; // Update for next frame's delta calculation

        // --- 4. Render All Patient Monitor Instances (Waveforms, Numeric Vitals on Monitor Tabs) ---
        const allMonitorableScenarioIds = Object.keys(currentAppData.playerData.activeScenarios || {});
        if (allMonitorableScenarioIds.length > 0) {
            // if (self.frameCount % 60 === 0) console.log("AnimationsJS: Calling patientMonitor.renderAllActiveInstances");
            window.patientMonitor.renderAllActiveInstances(allMonitorableScenarioIds);
        }

        self._animationFrameId = requestAnimationFrame(self.updateDisplaysAndAnimationsLoop.bind(this));
    },

    startAnimationLoop: function () {
        if (this._animationFrameId) {
            console.log("AnimationsJS: Animation loop already running.");
            return;
        }
        console.log("AnimationsJS: Starting main animation & logic loop.");
        const now = Date.now();
        this._lastLogicUpdateTime = now;
        this._lastBeepLogicTimestamp = now; // Initialize this too
        this.resetDisplayOptimizationFlags();
        this._animationFrameId = requestAnimationFrame(this.updateDisplaysAndAnimationsLoop.bind(this));
    },

    stopAnimationLoop: function () {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
            console.log("AnimationsJS: Animation loop stopped.");
        }
    },

    resetDisplayOptimizationFlags: function () {
        this._lastDisplayedScenarioTime = -1;
        this._lastDisplayedScenarioPauseState = null;
        this._timeSinceLastBeepMs = 0; // Reset beep timer on significant changes too
        this._lastBeepLogicTimestamp = Date.now(); // Reset beep timestamp too
        console.log("AnimationsJS: Display optimization and beep flags reset.");
    }
};
window.animations = animations;