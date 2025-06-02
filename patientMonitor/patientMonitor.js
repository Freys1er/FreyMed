// patientMonitor/patientMonitor.js
console.log("PatientMonitorJS: Script loaded.");

const patientMonitor = {
    instances: {}, // Keyed by scenarioId

    // Base IDs for elements within patientMonitor.html
    // ECG
    ECG_CANVAS_ID_BASE: 'pm-ecg-canvas-',
    ECG_RHYTHM_ID_BASE: 'pm-ecg-rhythm-',
    HR_VALUE_ID_BASE: 'pm-hr-value-',
    // SpO2
    PLETH_CANVAS_ID_BASE: 'pm-pleth-canvas-',
    SPO2_VALUE_ID_BASE: 'pm-spo2-value-',
    // ABP
    ABP_CANVAS_ID_BASE: 'pm-abp-canvas-',
    ABP_VALUE_ID_BASE: 'pm-abp-value-',
    MAP_VALUE_ID_BASE: 'pm-map-value-',
    // NBP (Numeric)
    NBP_VALUE_ID_BASE: 'pm-nbp-value-',
    NBP_MAP_ID_BASE: 'pm-nbp-map-',
    NBP_TIME_ID_BASE: 'pm-nbp-time-',
    // EtCO2
    ETCO2_CANVAS_ID_BASE: 'pm-etco2-canvas-',
    ETCO2_VALUE_ID_BASE: 'pm-etco2-value-',
    ETCO2_UNIT_ID_BASE: 'pm-etco2-unit-',
    RR_VALUE_ID_BASE: 'pm-rr-value-', // Respiratory Rate from EtCO2
    // Temp
    TEMP_VALUE_ID_BASE: 'pm-temp-value-',
    // Controls
    MUTE_ALARMS_BTN_ID_BASE: 'pm-mute-alarms-btn-',
    PAUSE_ALL_BTN_ID_BASE: 'pm-pause-resume-all-btn-',


    /**
     * Initializes or updates a patient monitor instance for a specific scenario.
     * This is called by monitorsScreen.js after injecting patientMonitor.html into a slot.
     * @param {string} scenarioId
     * @param {string} _targetParentContainerId - ID of the slot it was injected into (for context, not strictly needed if IDs are global)
     * @param {Object} [initialVitals={}] - Initial vitals like { hr, spo2, nbpSys, nbpDia, etco2, rr, temp, abpSys, abpDia, map }
     */

    initInstance: async function (scenarioId, monitorWidgetRootElement, initialVitalsFromCaller = {}) {
        console.log(`PatientMonitor (${scenarioId}): initInstance CALLED. InitialVitalsFromCaller:`, JSON.parse(JSON.stringify(initialVitalsFromCaller)), "Widget Root:", !!monitorWidgetRootElement);
        let instance = this.instances[scenarioId];

        if (!monitorWidgetRootElement) {
            console.error(`PatientMonitor (${scenarioId}): CRITICAL - monitorWidgetRootElement was not provided! Cannot initialize.`);
            return;
        }

        // If instance doesn't exist, create it.
        // If it does exist, we are re-initializing its view (DOM elements) because the HTML was re-injected.
        // Its data (vitals, targets, wave data) should persist on the instance object itself.
        if (!instance) {
            instance = { scenarioId: scenarioId, _domFullyInitialized: false }; // Initialize with _domFullyInitialized false
            this.instances[scenarioId] = instance;
            console.log(`PatientMonitor (${scenarioId}): NEW instance object created.`);
        } else {
            console.log(`PatientMonitor (${scenarioId}): Re-initializing VIEW for existing instance.`);
            // Mark DOM as not yet re-initialized for this pass, so we re-fetch elements
            instance._domFullyInitialized = false;
        }
        instance.scenarioId = scenarioId; // Ensure it's always set/updated

        // --- DOM Element Fetching (Always do this as HTML is re-injected by monitorsScreen) ---
        console.log(`PatientMonitor (${scenarioId}): Fetching DOM elements within provided widgetElement.`);
        instance.dom = {
            ecgCanvas: monitorWidgetRootElement.querySelector('#' + this.ECG_CANVAS_ID_BASE + scenarioId),
            ecgRhythmText: monitorWidgetRootElement.querySelector('#' + this.ECG_RHYTHM_ID_BASE + scenarioId),
            hrValue: monitorWidgetRootElement.querySelector('#' + this.HR_VALUE_ID_BASE + scenarioId),
            plethCanvas: monitorWidgetRootElement.querySelector('#' + this.PLETH_CANVAS_ID_BASE + scenarioId),
            spo2Value: monitorWidgetRootElement.querySelector('#' + this.SPO2_VALUE_ID_BASE + scenarioId),
            abpCanvas: monitorWidgetRootElement.querySelector('#' + this.ABP_CANVAS_ID_BASE + scenarioId),
            abpValue: monitorWidgetRootElement.querySelector('#' + this.ABP_VALUE_ID_BASE + scenarioId),
            mapValue: monitorWidgetRootElement.querySelector('#' + this.MAP_VALUE_ID_BASE + scenarioId),
            nbpValue: monitorWidgetRootElement.querySelector('#' + this.NBP_VALUE_ID_BASE + scenarioId),
            nbpMap: monitorWidgetRootElement.querySelector('#' + this.NBP_MAP_ID_BASE + scenarioId),
            nbpTime: monitorWidgetRootElement.querySelector('#' + this.NBP_TIME_ID_BASE + scenarioId),
            etco2Canvas: monitorWidgetRootElement.querySelector('#' + this.ETCO2_CANVAS_ID_BASE + scenarioId),
            etco2Value: monitorWidgetRootElement.querySelector('#' + this.ETCO2_VALUE_ID_BASE + scenarioId),
            etco2Unit: monitorWidgetRootElement.querySelector('#' + this.ETCO2_UNIT_ID_BASE + scenarioId),
            rrValue: monitorWidgetRootElement.querySelector('#' + this.RR_VALUE_ID_BASE + scenarioId),
            tempValue: monitorWidgetRootElement.querySelector('#' + this.TEMP_VALUE_ID_BASE + scenarioId),
            muteAlarmsBtn: monitorWidgetRootElement.querySelector('#' + this.MUTE_ALARMS_BTN_ID_BASE + scenarioId),
            pauseResumeAllBtn: monitorWidgetRootElement.querySelector('#' + this.PAUSE_ALL_BTN_ID_BASE + scenarioId)
        };

        // Log found elements
        if (!instance.dom.hrValue || !instance.dom.ecgCanvas /* Add other CRITICAL checks */) {
            console.error(`PatientMonitor (${scenarioId}): One or more critical display elements NOT FOUND in widgetElement after HTML injection!`);
            monitorWidgetRootElement.innerHTML = "<p class='error-message'>Monitor critical elements missing.</p>";
            return; // Stop if critical elements are missing
        }

        // --- Initialize or Preserve Data Values ---
        // If vitals object doesn't exist on instance, it's the first time data-wise
        if (!instance.vitals) {
            console.log(`PatientMonitor (${scenarioId}): First time data initialization with:`, initialVitalsFromCaller);
            instance.vitals = {
                hr: initialVitalsFromCaller.hr ?? 70,
                spo2: initialVitalsFromCaller.spo2 ?? 98,
                // ... (initialize ALL other vitals from initialVitalsFromCaller or defaults) ...
                abpSys: initialVitalsFromCaller.abpSys ?? 120, abpDia: initialVitalsFromCaller.abpDia ?? 80,
                map: initialVitalsFromCaller.map ?? this.calculateMap(initialVitalsFromCaller.abpSys ?? 120, initialVitalsFromCaller.abpDia ?? 80),
                nbpSys: initialVitalsFromCaller.nbpSys ?? 122, nbpDia: initialVitalsFromCaller.nbpDia ?? 79,
                nbpMap: initialVitalsFromCaller.nbpMap ?? this.calculateMap(initialVitalsFromCaller.nbpSys ?? 122, initialVitalsFromCaller.nbpDia ?? 79),
                nbpLastReadingTime: null,
                etco2: initialVitalsFromCaller.etco2 ?? 35,
                rr: initialVitalsFromCaller.rr ?? 16,
                temp: initialVitalsFromCaller.temp ?? 36.9,
                ecgRhythm: initialVitalsFromCaller.ecgRhythm || "Sinus Rhythm"
            };
            instance.targets = { ...instance.vitals }; // Initial targets match current
            instance.durations = {}; instance.changeRates = {};
            instance.isPaused = false; instance.alarmsMuted = false;

            // Initialize waveform config objects (only if they don't exist)
            if (!instance.ecgWave) instance.ecgWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            if (!instance.plethWave) instance.plethWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            if (!instance.abpWave) instance.abpWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            if (!instance.etco2Wave) instance.etco2Wave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
        } else {
            console.log(`PatientMonitor (${scenarioId}): Re-activating. Preserving existing instance data. Current HR: ${instance.vitals?.hr}`);
            // Vitals data on 'instance' is already the most current.
            // Passed initialVitalsFromCaller might be stale if this is just a tab switch.
            // Only update from initialVitalsFromCaller if they represent a *new explicit command* (handled by setTargetVitals).
        }

        // --- Canvas Setup (if elements found) & Wave Generation (if data empty) ---
        // This should run every time initInstance is called because canvas elements are new
        if (instance.dom.ecgCanvas) this.setupCanvas(instance.dom.ecgCanvas, instance, 'ecgWave');
        if (instance.dom.plethCanvas) this.setupCanvas(instance.dom.plethCanvas, instance, 'plethWave');
        if (instance.dom.abpCanvas) this.setupCanvas(instance.dom.abpCanvas, instance, 'abpWave');
        if (instance.dom.etco2Canvas) this.setupCanvas(instance.dom.etco2Canvas, instance, 'etco2Wave');

        // --- Button Listeners (add ONCE per unique button element) ---
        // Since HTML is re-injected, elements are new, so listeners need to be re-attached.
        // A simple way is to just add them. A more robust way (if elements weren't always new)
        // would be to check for an existing listener flag.
        if (instance.dom.pauseResumeAllBtn) {
            // To prevent duplicates if somehow the element wasn't new:
            const newPauseBtn = instance.dom.pauseResumeAllBtn.cloneNode(true);
            instance.dom.pauseResumeAllBtn.parentNode.replaceChild(newPauseBtn, instance.dom.pauseResumeAllBtn);
            instance.dom.pauseResumeAllBtn = newPauseBtn;

            instance.dom.pauseResumeAllBtn.textContent = instance.isPaused ? "Resume All" : "Pause All";
            instance.dom.pauseResumeAllBtn.addEventListener('click', () => this.togglePauseInstance(scenarioId));
        }
        if (instance.dom.muteAlarmsBtn) {
            const newMuteBtn = instance.dom.muteAlarmsBtn.cloneNode(true);
            instance.dom.muteAlarmsBtn.parentNode.replaceChild(newMuteBtn, instance.dom.muteAlarmsBtn);
            instance.dom.muteAlarmsBtn = newMuteBtn;

            instance.dom.muteAlarmsBtn.textContent = instance.alarmsMuted ? "Unmute Alarms" : "Mute Alarms";
            instance.dom.muteAlarmsBtn.addEventListener('click', () => this.toggleMuteAlarms(scenarioId));
        }
        // Add other button listeners similarly (Start NIBP etc.)


        instance._domFullyInitialized = true; // Mark that DOM elements for this pass are now set up
        this.renderInstance(scenarioId);
        console.log(`PatientMonitor (${scenarioId}): Init/refresh complete. Final Current HR from instance: ${instance.vitals?.hr}`);
    },


    setupCanvas: function (canvasElement, instance, waveType) {
        if (canvasElement && instance) { // Ensure instance is passed and valid
            const waveConfig = instance[waveType]; // e.g., instance.ecgWave or instance.plethWave

            if (!waveConfig) { // If this specific waveConfig object doesn't exist on the instance
                console.error(`PatientMonitor (${instance.scenarioId}): CRITICAL - waveConfig for waveType '${waveType}' is undefined on instance in setupCanvas. Initialize it in initInstance first!`);
                // As a fallback, create it here, but it's better practice to init in initInstance
                // instance[waveType] = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
                // waveConfig = instance[waveType]; // Now try again
                return; // Exit if still not resolvable
            }

            canvasElement.width = canvasElement.clientWidth || window.innerWidth - 100 || 800; // Default to 800 if clientWidth is zero
            canvasElement.height = canvasElement.clientHeight || window.innerHeight / 8 || 100;

            if (canvasElement.height > 0) {
                waveConfig.yOffset = canvasElement.height / 2;
                waveConfig.amplitude = canvasElement.height * 0.3;
                // Generate wave data only if it's empty (e.g., first time)
                if (!waveConfig.data || waveConfig.data.length === 0) {
                    if (waveType === 'ecgWave' && typeof this.generateECGWave === 'function') this.generateECGWave(instance);
                    else if (waveType === 'plethWave' && typeof this.generatePlethWave === 'function') this.generatePlethWave(instance);
                    else if (waveType === 'abpWave' && typeof this.generateABPWave === 'function') this.generateABPWave(instance);
                    else if (waveType === 'etco2Wave' && typeof this.generateEtCO2Wave === 'function') this.generateEtCO2Wave(instance);
                } else {
                    console.log(`PatientMonitor (${instance.scenarioId}): Wave data for '${waveType}' already exists. Length: ${waveConfig.data.length}`);
                }
            } else { /* warn about zero height */ }
        } else if (!canvasElement) {
            console.warn(`PatientMonitor (${instance?.scenarioId || 'UnknownScenario'}): Canvas element for ${waveType} is null in setupCanvas.`);
        } else if (!instance) {
            console.warn(`PatientMonitor (UnknownScenario): Instance is null in setupCanvas for ${waveType}.`);
        }
    },

    // --- Waveform Generation Placeholder Functions ---
    generateECGWave: function (instance) {
        const waveConfig = instance.ecgWave;
        waveConfig.data = []; const len = 120; // Longer cycle for ECG
        for (let i = 0; i < len; i++) { // Placeholder: simple sine wave for ECG
            waveConfig.data.push(waveConfig.yOffset - Math.sin(i / (len / (2 * Math.PI * 4))) * waveConfig.amplitude * 0.8); // Two cycles
        }
        console.log(`PatientMonitor (${instance.scenarioId}): ECG wave generated.`);
    },
    generatePlethWave: function (instance) { /* ... (your existing more detailed pleth logic) ... */
        const waveConfig = instance.plethWave;
        waveConfig.data = []; const len = 120;
        for (let i = 0; i < len; i++) { // Placeholder
            waveConfig.data.push(waveConfig.yOffset - Math.sin(i / (len / (2 * Math.PI))) * waveConfig.amplitude);
        }
        console.log(`PatientMonitor (${instance.scenarioId}): Pleth wave generated.`);
    },
    generateABPWave: function (instance) { /* ... (similar to pleth but maybe different shape/color) ... */
        const waveConfig = instance.abpWave;
        waveConfig.data = []; const len = 120;
        for (let i = 0; i < len; i++) { // Placeholder
            waveConfig.data.push(waveConfig.yOffset - (Math.sin(i / (len / (2 * Math.PI))) * 0.7 + Math.sin(i / (len / (2 * Math.PI * 0.5))) * 0.3) * waveConfig.amplitude);
        }
        console.log(`PatientMonitor (${instance.scenarioId}): ABP wave generated.`);
    },
    generateEtCO2Wave: function (instance) { /* ... (capnography waveform - typically boxy) ... */
        const waveConfig = instance.etco2Wave;
        waveConfig.data = []; const len = 120; const plateauLen = 30;
        for (let i = 0; i < len; i++) {
            let y_norm = 0;
            if (i < 10) y_norm = i / 10; // Phase I & II (upstroke)
            else if (i < 10 + plateauLen) y_norm = 1; // Phase III (plateau)
            else if (i < 10 + plateauLen + 15) y_norm = 1 - (i - (10 + plateauLen)) / 15; // Phase IV (downstroke)
            waveConfig.data.push(waveConfig.yOffset - y_norm * waveConfig.amplitude);
        }
        console.log(`PatientMonitor (${instance.scenarioId}): EtCO2 wave generated.`);
    },
    /**
     * Updates the internal data model for a specific monitor instance.
     * @param {string} scenarioId
     * @param {number} deltaTimeSeconds
     */
    updateLogicInstance: function (scenarioId, deltaTimeSeconds) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals || !instance.targets || !instance.durations || !instance.changeRates) {
            // console.warn(`PatientMonitor Logic (${scenarioId}): Instance or vital tracking objects missing.`);
            return;
        }

        // Check main scenario pause state from appData, and monitor's own pause state
        const appData = window.appShell?.getAppData();
        const mainScenarioPaused = appData?.playerData.activeScenarios[scenarioId]?.isPaused === true;
        if (instance.isPaused || mainScenarioPaused) {
            // if (animations.frameCount % 120 === 0) console.log(`PatientMonitor Logic (${scenarioId}): Paused, no updates.`);
            return;
        }

        let vitalsChangedInInstanceThisTick = false;

        // Define all vitals that can change gradually
        const gradualVitalsKeys = ['hr', 'spo2', 'abpSys', 'abpDia', 'etco2', 'rr', 'temp'];

        gradualVitalsKeys.forEach(vitalKey => {
            if (instance.durations[vitalKey] !== undefined && instance.durations[vitalKey] > 0 &&
                instance.targets[vitalKey] !== undefined && instance.vitals[vitalKey] !== undefined &&
                instance.changeRates[vitalKey] !== undefined) {

                const oldValue = instance.vitals[vitalKey];
                let changeThisTick = instance.changeRates[vitalKey] * deltaTimeSeconds;

                // If very close to target, just snap to avoid overshooting due to large deltaTimeSeconds
                if (Math.abs(instance.targets[vitalKey] - instance.vitals[vitalKey]) < Math.abs(changeThisTick)) {
                    changeThisTick = instance.targets[vitalKey] - instance.vitals[vitalKey];
                }

                instance.vitals[vitalKey] += changeThisTick;
                instance.durations[vitalKey] -= deltaTimeSeconds;

                const target = instance.targets[vitalKey];
                if (instance.durations[vitalKey] <= 0 ||
                    (instance.changeRates[vitalKey] > 0 && instance.vitals[vitalKey] >= target) ||
                    (instance.changeRates[vitalKey] < 0 && instance.vitals[vitalKey] <= target)) {
                    instance.vitals[vitalKey] = target;
                    instance.durations[vitalKey] = 0;
                    instance.changeRates[vitalKey] = 0;
                    // console.log(`PatientMonitor Logic (${scenarioId}): ${vitalKey} reached target ${target}`);
                }

                // Clamping values
                if (vitalKey === 'hr') instance.vitals[vitalKey] = Math.max(0, Math.min(300, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'spo2') instance.vitals[vitalKey] = Math.max(0, Math.min(100, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'abpSys' || vitalKey === 'abpDia') instance.vitals[vitalKey] = Math.max(0, Math.min(300, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'etco2') instance.vitals[vitalKey] = Math.max(0, Math.min(100, parseFloat(instance.vitals[vitalKey].toFixed(1))));
                else if (vitalKey === 'rr') instance.vitals[vitalKey] = Math.max(0, Math.min(60, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'temp') instance.vitals[vitalKey] = Math.max(30, Math.min(45, parseFloat(instance.vitals[vitalKey].toFixed(1))));

                if (oldValue !== instance.vitals[vitalKey]) {
                    vitalsChangedInInstanceThisTick = true;
                    // console.log(`PatientMonitor Logic (${scenarioId}): ${vitalKey} changed to ${instance.vitals[vitalKey]}`); // DEBUG
                }
            }
        });

        // Update Calculated Vitals (MAPs) if their components changed
        let mapChanged = false;
        if (instance.vitals.abpSys !== undefined && instance.vitals.abpDia !== undefined) {
            const newMap = this.calculateMap(instance.vitals.abpSys, instance.vitals.abpDia);
            if (instance.vitals.map !== newMap) { instance.vitals.map = newMap; mapChanged = true; }
        }
        if (instance.vitals.nbpSys !== undefined && instance.vitals.nbpDia !== undefined) {
            const newNbpMap = this.calculateMap(instance.vitals.nbpSys, instance.vitals.nbpDia);
            if (instance.vitals.nbpMap !== newNbpMap) { instance.vitals.nbpMap = newNbpMap; mapChanged = true; }
        }
        if (mapChanged) vitalsChangedInInstanceThisTick = true;


        // If any vital in the instance changed, update the central appData state
        if (vitalsChangedInInstanceThisTick) {
            if (appData?.playerData.activeScenarios[scenarioId]) {
                if (!appData.playerData.activeScenarios[scenarioId].patientData) appData.playerData.activeScenarios[scenarioId].patientData = {};
                if (!appData.playerData.activeScenarios[scenarioId].patientData.vitals) appData.playerData.activeScenarios[scenarioId].patientData.vitals = {};

                // Sync all current vitals from instance to appData
                // Also sync targets and remaining durations for persistence on reload
                for (const key in instance.vitals) {
                    appData.playerData.activeScenarios[scenarioId].patientData.vitals[key] = instance.vitals[key];
                }
                if (instance.targets) {
                    for (const key in instance.targets) {
                        const capKey = key.charAt(0).toUpperCase() + key.slice(1);
                        appData.playerData.activeScenarios[scenarioId].patientData.vitals[`target${capKey}`] = instance.targets[key];
                    }
                }
                if (instance.durations) {
                    for (const key in instance.durations) {
                        appData.playerData.activeScenarios[scenarioId].patientData.vitals[`${key}DurationRemaining`] = instance.durations[key] || 0;
                    }
                }
                // console.log(`PatientMonitor (${scenarioId}): Synced instance vitals to appData after logic update.`);
                // No direct save here; main.js handles saving appData.
            }
        }
    },
    /**
     * Renders a specific monitor instance.
     * @param {string} scenarioId
     */
    // patientMonitor/patientMonitor.js

    renderInstance: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance._domFullyInitialized || !instance.dom || !instance.vitals) {
            // Optional: log less frequently if continuously called for unready instance
            // if (window.animations && window.animations.frameCount % 120 === 0) {
            //     console.warn(`PatientMonitor Render WARN (${scenarioId}): Instance, DOM, or vitals not ready for render.`);
            // }
            return;
        }

        // If the monitor widget itself is paused by its own button
        if (instance.isPaused) {
            // Update text to show paused state, then draw "Paused" on canvases
            if (instance.dom.hrValue && instance.vitals.hr !== undefined) instance.dom.hrValue.textContent = `${Math.round(instance.vitals.hr)} (P)`;
            if (instance.dom.spo2Value && instance.vitals.spo2 !== undefined) instance.dom.spo2Value.textContent = `${Math.round(instance.vitals.spo2)} (P)`;
            if (instance.dom.abpValue && instance.vitals.abpSys !== undefined) instance.dom.abpValue.textContent = `${Math.round(instance.vitals.abpSys)}/${Math.round(instance.vitals.abpDia)} (P)`;
            if (instance.dom.mapValue && instance.vitals.map !== undefined) instance.dom.mapValue.textContent = `${Math.round(instance.vitals.map)} (P)`;
            if (instance.dom.nbpValue && instance.vitals.nbpSys !== undefined) instance.dom.nbpValue.textContent = `${Math.round(instance.vitals.nbpSys)}/${Math.round(instance.vitals.nbpDia)} (P)`;
            if (instance.dom.nbpMap && instance.vitals.nbpMap !== undefined) instance.dom.nbpMap.textContent = `${Math.round(instance.vitals.nbpMap)} (P)`;
            if (instance.dom.etco2Value && instance.vitals.etco2 !== undefined) instance.dom.etco2Value.textContent = `${instance.vitals.etco2.toFixed(1)} (P)`;
            if (instance.dom.rrValue && instance.vitals.rr !== undefined) instance.dom.rrValue.textContent = `${Math.round(instance.vitals.rr)} (P)`;
            if (instance.dom.tempValue && instance.vitals.temp !== undefined) instance.dom.tempValue.textContent = `${instance.vitals.temp.toFixed(1)} (P)`;

            this.clearOrPauseCanvas(instance.dom.ecgCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.plethCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.abpCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.etco2Canvas, "Display Paused");
            return; // Stop further rendering if paused
        }

        // HR
        if (instance.dom.hrValue) {
            const hrStr = (instance.vitals.hr !== undefined) ? String(Math.round(instance.vitals.hr)) : "--";
            if (instance.dom.hrValue.textContent !== hrStr) instance.dom.hrValue.textContent = hrStr;
        }
        // SpO2
        if (instance.dom.spo2Value) {
            const spo2Str = (instance.vitals.spo2 !== undefined) ? String(Math.round(instance.vitals.spo2)) : "--";
            if (instance.dom.spo2Value.textContent !== spo2Str) instance.dom.spo2Value.textContent = spo2Str;
        }
        // ABP & MAP
        if (instance.dom.abpValue) {
            instance.dom.abpValue.textContent = (instance.vitals.abpSys !== undefined && instance.vitals.abpDia !== undefined) ?
                `${Math.round(instance.vitals.abpSys)}/${Math.round(instance.vitals.abpDia)}` : "--/--";
        }
        if (instance.dom.mapValue) {
            instance.dom.mapValue.textContent = (instance.vitals.map !== undefined) ?
                String(Math.round(instance.vitals.map)) : "--";
        }
        // NBP & NBP MAP & Time
        if (instance.dom.nbpValue) {
            instance.dom.nbpValue.textContent = (instance.vitals.nbpSys !== undefined && instance.vitals.nbpDia !== undefined) ?
                `${Math.round(instance.vitals.nbpSys)}/${Math.round(instance.vitals.nbpDia)}` : "--/--";
        }
        if (instance.dom.nbpMap) {
            instance.dom.nbpMap.textContent = (instance.vitals.nbpMap !== undefined) ?
                String(Math.round(instance.vitals.nbpMap)) : "--";
        }
        if (instance.dom.nbpTime) { // Always update time or show placeholder
            instance.dom.nbpTime.textContent = instance.vitals.nbpLastReadingTime ?
                `@ ${new Date(instance.vitals.nbpLastReadingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` :
                "@ --:--";
        }


        // EtCO2 & Unit & RR
        if (instance.dom.etco2Value) {
            instance.dom.etco2Value.textContent = (instance.vitals.etco2 !== undefined) ?
                instance.vitals.etco2.toFixed(1) : "--.-";
        }
        if (instance.dom.etco2Unit) { // Assuming unit might change (mmHg/kPa)
            instance.dom.etco2Unit.textContent = instance.vitals.etco2Unit || "mmHg";
        }
        if (instance.dom.rrValue) {
            instance.dom.rrValue.textContent = (instance.vitals.rr !== undefined) ?
                String(Math.round(instance.vitals.rr)) : "--";
        }
        // Temperature
        if (instance.dom.tempValue) {
            instance.dom.tempValue.textContent = (instance.vitals.temp !== undefined) ?
                instance.vitals.temp.toFixed(1) : "--.-";
        }
        // ECG Rhythm Text
        if (instance.dom.ecgRhythmText && instance.vitals.ecgRhythm) {
            if (instance.dom.ecgRhythmText.textContent !== instance.vitals.ecgRhythm) {
                instance.dom.ecgRhythmText.textContent = instance.vitals.ecgRhythm;
            }
        } else if (instance.dom.ecgRhythmText) instance.dom.ecgRhythmText.textContent = "---";


        // --- Draw Waveforms ---
        // (This part assumes instance.vitals.hr and instance.vitals.rr are used by drawWave for speed)
        if (instance.dom.ecgCanvas) this.drawWave(instance.dom.ecgCanvas, instance.ecgWave, '#00FF00', instance.vitals.hr);
        if (instance.dom.plethCanvas) this.drawWave(instance.dom.plethCanvas, instance.plethWave, '#00FFFF', instance.vitals.hr);
        if (instance.dom.abpCanvas) this.drawWave(instance.dom.abpCanvas, instance.abpWave, '#FF0000', instance.vitals.hr);
        if (instance.dom.etco2Canvas) this.drawWave(instance.dom.etco2Canvas, instance.etco2Wave, '#FFFF00', instance.vitals.rr);
    },


    /**
     * Generic waveform drawing function.
     * @param {HTMLCanvasElement} canvasEl
     * @param {Object} waveConfig - { data, index, amplitude, yOffset, scrollSpeedFactor }
     * @param {string} color
     * @param {number} rateForSpeed - e.g., HR or RR to influence scroll speed
     */
    drawWave: function (canvasEl, waveConfig, color, rateForSpeed) {
        if (!canvasEl || !waveConfig || !waveConfig.data || waveConfig.data.length === 0) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const pointsInOneCycle = waveConfig.data.length;
        const baseScrollRate = 0.5; // Adjust for base visual speed
        const effectiveRate = 60; // Use a sensible default if rate is 0/undefined
        const scrollFactor = (effectiveRate / 60) * waveConfig.scrollSpeedFactor * baseScrollRate;
        const pointsToAdvanceThisFrame = scrollFactor;

        const displayWindowPoints = pointsInOneCycle * 6.0; // How many cycles to show
        const stepX = canvasEl.width / displayWindowPoints;
        let firstPoint = true;

        for (let i = 0; i < displayWindowPoints + 1; i++) {
            const dataIndex = (Math.floor(waveConfig.index) + i) % pointsInOneCycle;
            const y = waveConfig.data[dataIndex];
            if (y === undefined || isNaN(y)) continue;
            const x = i * stepX;
            if (firstPoint) { ctx.moveTo(x, y); firstPoint = false; }
            else { ctx.lineTo(x, y); }
        }
        ctx.stroke();

        waveConfig.index = (waveConfig.index + pointsToAdvanceThisFrame);
        if (waveConfig.index >= pointsInOneCycle) {
            waveConfig.index -= pointsInOneCycle;
        }
    },


    /**
     * Sets target vital signs for a specific scenario's monitor.
     * @param {string} scenarioId
     * @param {Object} targets - e.g., { hr: 90, spo2: 95, abpSys: 110, abpDia: 70, etco2: 40, rr: 20, temp: 37.2 }
     * @param {number} durationSeconds - How long the change should take.
     */
    // patientMonitor/patientMonitor.js
    // patientMonitor/patientMonitor.js
    setTargetVitals: function (scenarioId, targets, durations = {}) { // durations is an object
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals) {
            console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Cannot set targets, instance or instance.vitals not found.`);
            return;
        }
        // Ensure these tracking objects exist on the instance if they somehow weren't created in init
        if (!instance.targets) instance.targets = {};
        if (!instance.durations) instance.durations = {};
        if (!instance.changeRates) instance.changeRates = {};

        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): === ENTERING setTargetVitals ===`);
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Received Targets:`, JSON.parse(JSON.stringify(targets)));
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Received Durations:`, JSON.parse(JSON.stringify(durations)));
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instance.vitals BEFORE processing:`, JSON.parse(JSON.stringify(instance.vitals)));


        let somethingChangedForInstance = false;
        let longestDurationThisCall = 0;

        // Iterate through all keys in the 'targets' object received from AI/command
        for (const key in targets) {
            console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Processing target key: '${key}', Value: '${targets[key]}'`);

            // Check if this 'key' from 'targets' is a recognized vital that this monitor instance manages
            if (instance.vitals.hasOwnProperty(key) || ['ecgRhythm', 'etco2Unit'].includes(key)) {
                const targetValueFromInput = targets[key];
                let parsedTargetValue;

                if (key === 'ecgRhythm' || key === 'etco2Unit') {
                    parsedTargetValue = String(targetValueFromInput);
                } else {
                    parsedTargetValue = parseFloat(targetValueFromInput);
                    if (isNaN(parsedTargetValue)) {
                        console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Invalid numeric target value for ${key}: '${targetValueFromInput}'. Skipping this target.`);
                        continue; // Skip this key
                    }
                }

                console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Validated target for '${key}': ${parsedTargetValue}`);

                instance.targets[key] = parsedTargetValue; // Store the validated target on the instance

                // Get specific duration for this vital, or default, or 0
                const durationForThisKey = durations[key]; // This might be undefined
                const defaultDurationFromInput = durations.default; // This might be undefined
                let effectiveDuration = 0; // Default to instant change

                if (durationForThisKey !== undefined && !isNaN(parseFloat(durationForThisKey)) && parseFloat(durationForThisKey) >= 0) {
                    effectiveDuration = parseFloat(durationForThisKey);
                } else if (defaultDurationFromInput !== undefined && !isNaN(parseFloat(defaultDurationFromInput)) && parseFloat(defaultDurationFromInput) >= 0) {
                    effectiveDuration = parseFloat(defaultDurationFromInput);
                }
                // effectiveDuration is now set (could be 0)

                instance.durations[key] = effectiveDuration;
                if (effectiveDuration > longestDurationThisCall) longestDurationThisCall = effectiveDuration;

                if (effectiveDuration > 0 && typeof parsedTargetValue === 'number' && typeof instance.vitals[key] === 'number') {
                    instance.changeRates[key] = (parsedTargetValue - instance.vitals[key]) / effectiveDuration;
                    console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Gradual change for ${key}: Current=${instance.vitals[key]}, Target=${parsedTargetValue}, Duration=${effectiveDuration}s, Rate=${instance.changeRates[key]?.toFixed(2)}/s`);
                } else { // Instant change or non-numeric vital
                    instance.vitals[key] = parsedTargetValue; // Directly set current vital in the instance
                    if (instance.changeRates) instance.changeRates[key] = 0; // Reset rate
                    instance.durations[key] = 0; // Ensure duration is also 0
                    console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instant change for ${key}: Set instance.vitals.${key} to ${parsedTargetValue}`);
                }
                somethingChangedForInstance = true;
            } else {
                console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Target key '${key}' is unknown or not present in instance.vitals. Skipping.`);
            }
        } // End for...in loop

        // ... (NBP/ABP MAP update logic as before, using instance.vitals) ...

        if (somethingChangedForInstance) {
            console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instance.vitals AFTER processing all targets:`, JSON.parse(JSON.stringify(instance.vitals)));
            // Syncing to appData and saving is handled by main.js after this function returns
            // and processAiStateUpdates calls updateCurrentScenarioVitalsToAppData & storage.saveAppData.

            if (longestDurationThisCall === 0) { // If all changes processed by this call were instant
                console.log(`PatientMonitor SetTargets LOG (${scenarioId}): All target changes were instant, forcing immediate re-render.`);
                this.renderInstance(scenarioId); // Re-render to show instant changes
            }
        }
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): === EXITING setTargetVitals ===`);
    },

    // --- Control Methods ---
    togglePauseInstance: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (instance) {
            instance.isPaused = !instance.isPaused;
            if (instance.dom.pauseResumeAllBtn) {
                instance.dom.pauseResumeAllBtn.textContent = instance.isPaused ? "Resume All" : "Pause All";
            }
            console.log(`PatientMonitor (${scenarioId}): Display ${instance.isPaused ? 'PAUSED' : 'RESUMED'}`);
            if (!instance.isPaused) this.renderInstance(scenarioId); // Re-render if resuming
        }
    },
    toggleMuteAlarms: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (instance) {
            instance.alarmsMuted = !instance.alarmsMuted;
            if (instance.dom.muteAlarmsBtn) {
                instance.dom.muteAlarmsBtn.textContent = instance.alarmsMuted ? "Unmute Alarms" : "Mute Alarms";
            }
            console.log(`PatientMonitor (${scenarioId}): Alarms ${instance.alarmsMuted ? 'MUTED' : 'UNMUTED'}`);
            // TODO: Implement actual alarm sound silencing logic
        }
    },
    calculateMap: function (sys, dia) {
        if (sys === undefined || dia === undefined) return undefined;
        return Math.round((parseFloat(dia) * 2 + parseFloat(sys)) / 3);
    },


    // Methods called by animations.js
    renderAllActiveInstances: function (allScenarioIdsToConsider) {
        allScenarioIdsToConsider.forEach(scenarioId => {
            const instance = this.instances[scenarioId];
            if (instance && instance._domFullyInitialized) {
                // The widget's root element ID for visibility check
                const widgetElement = document.getElementById(`pm-widget-${scenarioId}`);
                if (widgetElement && widgetElement.offsetParent !== null) {
                    this.renderInstance(scenarioId);
                }
            }
        });
    },


    clearOrPauseCanvas: function (canvasEl, message = "Paused") {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.fillStyle = "#444"; // Darker gray for paused text
        ctx.font = "bold 12px Roboto, Arial";
        ctx.textAlign = "center";
        ctx.fillText(message, canvasEl.width / 2, canvasEl.height / 2);
    },

    takeNbpReading: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals) return;
        console.log(`PatientMonitor (${scenarioId}): takeNbpReading called.`);
        // Simulate taking a reading: set current NBP to target NBP instantly
        // Gemini would provide NBP_SYSTOLIC_TARGET and NBP_DIASTOLIC_TARGET with DURATION: 0
        // This function would be called by a button or by Gemini.
        // For now, let's assume Gemini sets targets, and this just updates the timestamp.
        instance.vitals.nbpSys = instance.targets.nbpSys !== undefined ? instance.targets.nbpSys : instance.vitals.nbpSys;
        instance.vitals.nbpDia = instance.targets.nbpDia !== undefined ? instance.targets.nbpDia : instance.vitals.nbpDia;
        instance.vitals.nbpMap = this.calculateMap(instance.vitals.nbpSys, instance.vitals.nbpDia);
        instance.vitals.nbpLastReadingTime = Date.now();

        // Update appData and trigger a save
        const appData = window.appShell?.getAppData();
        if (appData?.playerData.activeScenarios[scenarioId]) {
            if (!appData.playerData.activeScenarios[scenarioId].patientData) appData.playerData.activeScenarios[scenarioId].patientData = {};
            if (!appData.playerData.activeScenarios[scenarioId].patientData.vitals) appData.playerData.activeScenarios[scenarioId].patientData.vitals = {};
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpSys = instance.vitals.nbpSys;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpDia = instance.vitals.nbpDia;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpMap = instance.vitals.nbpMap;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpLastReadingTime = instance.vitals.nbpLastReadingTime;
            window.appShell?.saveGameData(); // Immediate save after NBP reading
        }
        this.renderInstance(scenarioId); // Re-render to show new NBP and time
    },

    updateAllActiveLogic: function (allScenarioIdsToConsider, deltaTimeSeconds) {
        allScenarioIdsToConsider.forEach(scenarioId => {
            if (this.instances[scenarioId]) { // Check if an instance exists for this scenario
                this.updateLogicInstance(scenarioId, deltaTimeSeconds);
            }
        });
    },

    removeInstance: function (scenarioId) {
        if (this.instances[scenarioId]) {
            // Any specific cleanup for this instance's resources can go here
            // e.g., if canvases held complex objects or workers
            delete this.instances[scenarioId];
            console.log(`PatientMonitor (${scenarioId}): Instance removed.`);
        }
    }
};
window.patientMonitor = patientMonitor; // Expose as patientMonitor