const pulseOximeter = {
    instances: {},
    SPO2_DISPLAY_ID_BASE: 'spo2-display-',
    HR_DISPLAY_ID_BASE: 'hr-from-spo2-display-',
    PLETH_CANVAS_ID_BASE: 'pleth-canvas-',
    PAUSE_RESUME_BTN_ID_BASE: 'pulseox-pause-resume-btn-',

    // components/monitors/pulseOximeter/pulseOximeter.js
    initInstance: function (scenarioId, spo2ToUse, hrToUse) { // Renamed params for clarity
        console.log(`PulseOximeter: initInstance CALLED for scenario ${scenarioId}. Passed SpO2: ${spo2ToUse}, HR: ${hrToUse}`);
        let instance = this.instances[scenarioId];
        let isFirstTimeFullyInitializing = !instance || !instance._isFullyInitialized;

        if (!instance) {
            instance = {};
            this.instances[scenarioId] = instance;
        }

        instance.scenarioId = scenarioId;

        // Set current and target values. If it's a re-activation, spo2ToUse/hrToUse will be the instance's current values.
        instance.currentSpO2 = (spo2ToUse !== undefined) ? spo2ToUse : 98;
        instance.targetSpO2 = (instance.targetSpO2 !== undefined && !isFirstTimeFullyInitializing) ? instance.targetSpO2 : instance.currentSpO2; // Keep existing target unless first time
        instance.currentHR = (hrToUse !== undefined) ? hrToUse : 70;
        instance.targetHR = (instance.targetHR !== undefined && !isFirstTimeFullyInitializing) ? instance.targetHR : instance.currentHR;

        if (isFirstTimeFullyInitializing) {
            console.log(`PulseOximeter (${scenarioId}): First time full initialization.`);
            instance.hrChangeRatePerSecond = 0;
            instance.hrDurationRemaining = 0;
            // ... (reset other rates, durations, isPaused, plethWaveIndex, plethScrollSpeedFactor) ...
            instance.isPaused = false;
            instance.plethWaveData = [];
            instance.plethWaveIndex = 0;
            instance.plethScrollSpeedFactor = 1.0;

            // Fetch DOM elements & setup canvas ONCE
            instance._spO2DisplayElement = document.getElementById(this.SPO2_DISPLAY_ID_BASE + scenarioId);
            instance._hrDisplayElement = document.getElementById(this.HR_DISPLAY_ID_BASE + scenarioId);
            instance._plethCanvasElement = document.getElementById(this.PLETH_CANVAS_ID_BASE + scenarioId);
            instance._pauseResumeBtn = document.getElementById(this.PAUSE_RESUME_BTN_ID_BASE + scenarioId);
            // ... (console.log elements) ...
            if (instance._plethCanvasElement) { /* ... setup canvas ... */ }
            if (instance._pauseResumeBtn) { /* ... add event listener ... */ }
            instance._isFullyInitialized = true;
        } else {
            console.log(`PulseOximeter (${scenarioId}): Re-activating. Current HR: ${instance.currentHR}, SpO2: ${instance.currentSpO2}`);
            if (instance._pauseResumeBtn) instance._pauseResumeBtn.textContent = instance.isPaused ? "Resume Display" : "Pause Display";
        }

        this.renderInstance(scenarioId); // Always render
    },

    /**
     * Generates a single cycle of the plethysmograph waveform data.
     * @param {Object} instance - The specific monitor instance.
     */
    generateBasePlethWave: function (instance) {
        instance.plethWaveData = [];
        const waveLengthPoints = 60; // Number of data points in one visual cycle of the wave

        for (let i = 0; i < waveLengthPoints; i++) {
            // Create a more realistic pleth wave shape:
            // Rapid upstroke, dicrotic notch, slower downstroke.
            const x = i / waveLengthPoints; // Normalized position (0 to 1)
            let y;

            // Simplified model of a pleth wave
            if (x < 0.15) { // Rapid upstroke
                y = Math.sin(x * (Math.PI / 0.3)); // Part of a sine wave for upstroke
            } else if (x < 0.3) { // Peak and start of dicrotic notch
                y = Math.cos((x - 0.15) * (Math.PI / 0.3)); // Peak then dip
            } else if (x < 0.4) { // Dicrotic notch rise
                y = Math.cos((0.3 - 0.15) * (Math.PI / 0.3)) + Math.sin((x - 0.3) * (Math.PI / 0.2)) * 0.3;
            } else { // Slower downstroke
                y = (Math.cos((x - 0.15) * (Math.PI / (1.7 - 0.15 * 2))) + 1) / 2; // Adjusted cosine for slower decay
                // Ensure it comes back down, slightly modified decay
                y = (Math.cos((x - 0.4) * Math.PI / (1.0 - 0.4) * 0.8 + Math.PI * 0.2) + 1) * 0.5 * (Math.cos((0.3 - 0.15) * (Math.PI / 0.3)) * 0.7 + 0.3);
                y = Math.max(0, y * (1 - (x - 0.4) * 0.8)); // Ensure it decays
            }
            // Scale by amplitude and add some minor noise
            const noise = (Math.random() - 0.5) * (instance.plethAmplitude * 0.05); // 5% noise
            instance.plethWaveData.push(instance.plethYOffset - (y * instance.plethAmplitude + noise));
        }
        console.log(`PulseOximeter (${instance.scenarioId}): Base pleth wave generated with ${waveLengthPoints} points.`);
    },


    updateAllActiveLogic: function (activePulseOxMonitorTabIds = [], deltaTimeSeconds) {
        // activePulseOxMonitorTabIds are like "pulseox-monitor-scenario-er-123"
        activePulseOxMonitorTabIds.forEach(tabId => {
            const scenarioId = tabId.replace('pulseox-monitor-', ''); // Extract scenarioId
            if (this.instances[scenarioId]) { // 'this' refers to pulseOximeter object
                this.updateLogicInstance(scenarioId, deltaTimeSeconds);
            }
        });
    },

    updateLogicInstance: function (scenarioId, deltaTimeSeconds) {
        const instance = this.instances[scenarioId];
        if (!instance) return;

        // Update SpO2
        if (instance.spO2DurationRemaining > 0) {
            const changeThisTick = instance.spO2ChangeRatePerSecond * deltaTimeSeconds;
            instance.currentSpO2 += changeThisTick;
            instance.spO2DurationRemaining -= deltaTimeSeconds;
            if (instance.spO2DurationRemaining <= 0 ||
                (instance.spO2ChangeRatePerSecond > 0 && instance.currentSpO2 >= instance.targetSpO2) ||
                (instance.spO2ChangeRatePerSecond < 0 && instance.currentSpO2 <= instance.targetSpO2)) {
                instance.currentSpO2 = instance.targetSpO2;
                instance.spO2DurationRemaining = 0;
                instance.spO2ChangeRatePerSecond = 0;
            }
            instance.currentSpO2 = Math.max(0, Math.min(100, Math.round(instance.currentSpO2)));
        }

        // Update HR
        if (instance.hrDurationRemaining > 0) {
            const hrChangeThisTick = instance.hrChangeRatePerSecond * deltaTimeSeconds;
            instance.currentHR += hrChangeThisTick;
            instance.hrDurationRemaining -= deltaTimeSeconds;
            if (instance.hrDurationRemaining <= 0 ||
                (instance.hrChangeRatePerSecond > 0 && instance.currentHR >= instance.targetHR) ||
                (instance.hrChangeRatePerSecond < 0 && instance.currentHR <= instance.targetHR)) {
                instance.currentHR = instance.targetHR;
                instance.hrDurationRemaining = 0;
                instance.hrChangeRatePerSecond = 0;
            }
            instance.currentHR = Math.max(0, Math.min(300, Math.round(instance.currentHR)));
        }
    },

    // components/monitors/pulseOximeter/pulseOximeter.js
    renderInstance: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (!instance) {
            // console.warn(`PulseOximeter Render WARN (${scenarioId}): No instance data.`);
            return;
        }

        // Re-fetch DOM elements every time for this render - for debugging stale references.
        // This is INEFFICIENT for production but good for finding if elements become detached.
        const hrDisplayElement = document.getElementById(this.HR_DISPLAY_ID_BASE + scenarioId);
        const spo2DisplayElement = document.getElementById(this.SPO2_DISPLAY_ID_BASE + scenarioId);
        const plethCanvasElement = document.getElementById(this.PLETH_CANVAS_ID_BASE + scenarioId);
        // Storing them on instance is still good after init, but re-fetch here for test:
        // instance._hrDisplayElement = hrDisplayElement;
        // instance._spO2DisplayElement = spo2DisplayElement;
        // instance._plethCanvasElement = plethCanvasElement;
        // if (plethCanvasElement && !instance._plethCanvasCtx) instance._plethCanvasCtx = plethCanvasElement.getContext('2d');


        if (this.frameCount === undefined) this.frameCount = 0; // Simple frame counter for less console spam
        this.frameCount++;

        if (this.frameCount % 30 === 0) { // Log roughly every half second
            // console.log(`PulseOx Render (${scenarioId}): HR El: ${!!hrDisplayElement}, SpO2 El: ${!!spo2DisplayElement}, Canvas: ${!!plethCanvasElement}, Current HR: ${instance.currentHR}, Current SpO2: ${instance.currentSpO2}, Paused: ${instance.isPaused}`);
        }


        // Update numeric displays FORCEFULLY for debugging
        if (hrDisplayElement) {
            const hrString = String(Math.round(instance.currentHR)); // Ensure it's an integer string
            // if (hrDisplayElement.textContent !== hrString) { // Temporarily remove optimization
            hrDisplayElement.textContent = hrString;
            if (this.frameCount % 30 === 0 && hrDisplayElement.textContent !== hrString) console.log(`PulseOx Render (${scenarioId}): Updated HR display to ${hrString}`);
            // }
        } else if (this.frameCount % 60 === 0) {
            // console.warn(`PulseOximeter Render WARN (${scenarioId}): HR Display Element NOT FOUND.`);
        }

        if (spo2DisplayElement) {
            const spo2String = String(Math.round(instance.currentSpO2));
            // if (spo2DisplayElement.textContent !== spo2String) { // Temporarily remove optimization
            spo2DisplayElement.textContent = spo2String;
            if (this.frameCount % 30 === 0 && spo2DisplayElement.textContent !== spo2String) console.log(`PulseOx Render (${scenarioId}): Updated SpO2 display to ${spo2String}`);
            // }
        } else if (this.frameCount % 60 === 0) {
            // console.warn(`PulseOximeter Render WARN (${scenarioId}): SpO2 Display Element NOT FOUND.`);
        }


        // Draw Pleth Wave
        if (plethCanvasElement && instance._plethCanvasCtx && !instance.isPaused) {
            const ctx = instance._plethCanvasCtx;
            const canvas = plethCanvasElement; // Use the freshly fetched one for this test

            // Ensure canvas dimensions are set if they were somehow lost
            if (canvas.width !== (canvas.clientWidth || 250) || canvas.height !== (canvas.clientHeight || 60)) {
                canvas.width = canvas.clientWidth || 250;
                canvas.height = canvas.clientHeight || 60;
                instance.plethYOffset = canvas.height / 2;
                instance.plethAmplitude = canvas.height * 0.35;
                // Re-generate wave if dimensions changed significantly, or assume it's okay
                // if (instance.plethWaveData.length === 0) this.generateBasePlethWave(instance);
            }


            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#00FFFF'; // Cyan
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            const pointsInOneCycle = instance.plethWaveData.length;
            if (pointsInOneCycle === 0) return;

            const scrollFactor = Math.max(0.5, (instance.currentHR || 70) / 70) * instance.plethScrollSpeedFactor;
            const pointsToAdvanceThisFrame = scrollFactor * 0.5; // Adjust for speed

            const displayWindowPoints = pointsInOneCycle * 2.5;
            const stepX = canvas.width / displayWindowPoints;

            for (let i = 0; i < displayWindowPoints + 1; i++) {
                const dataIndex = (Math.floor(instance.plethWaveIndex) + i) % pointsInOneCycle;
                if (instance.plethWaveData[dataIndex] === undefined) continue; // Safety check
                const y = instance.plethWaveData[dataIndex];
                const x = i * stepX;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();

            instance.plethWaveIndex = (instance.plethWaveIndex + pointsToAdvanceThisFrame);
            if (instance.plethWaveIndex >= pointsInOneCycle) {
                instance.plethWaveIndex -= pointsInOneCycle;
            }

        } else if (plethCanvasElement && instance._plethCanvasCtx && instance.isPaused) {
            const ctx = instance._plethCanvasCtx;
            const canvas = plethCanvasElement;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#555"; ctx.font = "12px Roboto, Arial";
            ctx.textAlign = "center"; ctx.fillText("Display Paused", canvas.width / 2, canvas.height / 2);
        }
    },
    /**
     * Sets target vital signs for a specific scenario's pulse oximeter.
     * @param {string} scenarioId
     * @param {Object} targets - e.g., { spo2: 95, hr: 80 }
     * @param {number} durationSeconds - How long the change should take.
     */
    setTargetVitals: function (scenarioId, targets, durationSeconds = 10) { // Default duration 10s
        const instance = this.instances[scenarioId];
        if (!instance) {
            console.warn(`PulseOximeter: No instance for ${scenarioId} to set targets.`);
            return;
        }
        console.log(`PulseOximeter (${scenarioId}): Setting targets:`, targets, `over ${durationSeconds}s.`);

        if (targets.hasOwnProperty('spo2')) {
            instance.targetSpO2 = Math.max(0, Math.min(100, targets.spo2));
            if (durationSeconds > 0) {
                instance.spO2ChangeRatePerSecond = (instance.targetSpO2 - instance.currentSpO2) / durationSeconds;
                instance.spO2DurationRemaining = durationSeconds;
            } else {
                instance.currentSpO2 = instance.targetSpO2;
                instance.spO2DurationRemaining = 0;
                instance.spO2ChangeRatePerSecond = 0;
            }
        }

        if (targets.hasOwnProperty('hr')) {
            instance.targetHR = Math.max(0, Math.min(300, targets.hr));
            if (durationSeconds > 0) {
                instance.hrChangeRatePerSecond = (instance.targetHR - instance.currentHR) / durationSeconds;
                instance.hrDurationRemaining = durationSeconds;
            } else {
                instance.currentHR = instance.targetHR;
                instance.hrDurationRemaining = 0;
                instance.hrChangeRatePerSecond = 0;
            }
        }
    },

    /**
     * Sets the visual speed of the pleth waveform scrolling.
     * @param {string} scenarioId
     * @param {string} speed - "slow", "normal", "fast"
     */
    setPlethWaveSpeed: function (scenarioId, speed) {
        const instance = this.instances[scenarioId];
        if (!instance) return;
        switch (speed.toLowerCase()) {
            case 'slow': instance.plethScrollSpeedFactor = 0.5; break;
            case 'fast': instance.plethScrollSpeedFactor = 2.0; break;
            case 'normal':
            default: instance.plethScrollSpeedFactor = 1.0; break;
        }
        console.log(`PulseOximeter (${scenarioId}): Pleth wave speed set to ${speed}`);
    },


    // Method to be called by the global rAF loop for all active instances
    renderAllActiveInstances: function (activeScenarioIds = []) {
        activeScenarioIds.forEach(id => {
            if (id.startsWith('pulseox-monitor-')) { // Check if it's a pulseox tab
                const scenarioId = id.replace('pulseox-monitor-', '');
                if (this.instances[scenarioId]) {
                    this.renderInstance(scenarioId);
                }
            }
        });
    },
    // Method to be called by the global logic timer for all active instances
    renderAllActiveInstances: function (activePulseOxMonitorTabIds = []) {
        activePulseOxMonitorTabIds.forEach(tabId => {
            const scenarioId = tabId.replace('pulseox-monitor-', '');
            if (this.instances[scenarioId]) {
                this.renderInstance(scenarioId);
            }
        });
    },
    removeInstance: function (scenarioId) {
        if (this.instances[scenarioId]) {
            delete this.instances[scenarioId];
            console.log(`PulseOximeter: Instance for ${scenarioId} removed.`);
        }
    }
};

// Expose to global if not using modules, or handle imports/exports appropriately
window.pulseOximeter = pulseOximeter;