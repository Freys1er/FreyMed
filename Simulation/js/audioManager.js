// audioManager.js
// This module manages audio playback using Tone.js, generating sounds with Tone.Synth.
// It provides reliable pitch control (frequency change) and options for duration and looping.
// This approach avoids external file loading issues.
// Ensure Tone.js is loaded in your HTML before this script, e.g.:
// <script src="https://unpkg.com/tone@15.1.22/build/Tone.js"></script>

const audioManager = {
    // Properties for the 'beep' sound
    beepSynth: null, // Tone.Synth instance for generating the beep sound
    beepIsPlaying: false, // Flag to track if beep sound is currently playing
    _beepLoop: null, // Internal Tone.Loop instance for continuous beep playback

    // Properties for the 'alarm' sound
    alarmSynth: null, // Tone.Synth instance for generating the alarm sound
    alarmIsPlaying: false, // Flag to track if alarm sound is currently playing
    _alarmLoop: null, // Internal Tone.Loop instance for continuous alarm playback

    messageElement: null, // Element to display messages (optional, for debugging/feedback)
    baseFrequency: 440, // A4 note, 440 Hz, as a base for pitch calculations

    /**
     * Initializes the AudioManager, setting up Tone.js and both Tone.Synth instances.
     * This should be called once when the application starts.
     * @param {HTMLElement} [messageEl=null] - Optional: An HTML element to display log messages.
     */
    init: async function (messageEl = null) {
        this.messageElement = messageEl;
        this.logMessage("AudioManager: Initializing Tone.Synths for sound generation...");

        try {
            // Initialize the 'beep' synth
            this.beepSynth = new Tone.Synth({
                oscillator: {
                    type: 'sine' // Using a sine wave for a softer, classic beep sound
                },
                envelope: {
                    attack: 0.005, // Very fast attack
                    decay: 0.2,   // Short decay
                    sustain: 0,   // No sustain
                    release: 0.005 // Fast release
                }
            }).toDestination(); // Connect the beep synth directly to the speakers

            // Initialize the 'alarm' synth with different settings
            this.alarmSynth = new Tone.Synth({
                oscillator: {
                    type: 'sine' // Using a sawtooth wave for a harsher, alarm-like sound
                },
                envelope: {
                    attack: 0.002,  // Slightly slower attack for a ramp-up
                    decay: 0.4,    // Longer decay
                    sustain: 0.05,  // Sustained sound
                    release: 1   // Noticeable release
                }
            }).toDestination(); // Connect the alarm synth directly to the speakers

            this.logMessage("AudioManager: Tone.Synths ready.");

        } catch (e) {
            console.error("AudioManager: Error initializing Tone.js or Tone.Synths.", e);
            this.logMessage(`AudioManager: Critical error during initialization: ${e.message}`, true);
        }
    },

    /**
     * Plays a generated 'beep' sound with a specific pitch, duration, and looping option.
     * The pitch is adjusted by changing the frequency of the Tone.Synth.
     * @param {number} pitchSemitones - The desired pitch shift in semitones (e.g., -12 for an octave down, 12 for an octave up). Defaults to 0.
     * @param {number} [durationSeconds=0.5] - How long each individual note should play in seconds.
     * @param {boolean} [loop=false] - Whether the sound should loop continuously.
     */
    playBeep: async function (pitchSemitones = 0, durationSeconds = 0.5, loop = false) {
        if (!this.beepSynth) {
            this.logMessage("AudioManager: Beep Synth not initialized. Cannot play.", true);
            return;
        }

        // Ensure Tone.js AudioContext is running (active state).
        if (Tone.context.state === 'suspended') {
            try {
                await Tone.start();
                this.logMessage("AudioManager: Tone.js AudioContext resumed on user interaction.");
            } catch (error) {
                this.logMessage(`AudioManager: Failed to resume Tone.js AudioContext. Error: ${error.message}`, true);
                return;
            }
        }

        // Stop any currently playing beep sound before starting a new one
        //this.stopBeep();

        // Calculate the target frequency based on the base frequency and semitones.
        const targetFrequency = this.baseFrequency * Math.pow(2, pitchSemitones / 12);

        // Clamp the frequency to a reasonable audible range.
        const clampedFrequency = Math.max(50, Math.min(10000, targetFrequency));

        this.logMessage(`AudioManager: Playing generated beep at frequency ${clampedFrequency.toFixed(2)} Hz (from ${pitchSemitones} semitones), Duration: ${durationSeconds}s, Loop: ${loop}.`);

        // If looping, set up a Tone.Loop to repeatedly trigger the synth.
        if (loop) {
            // Dispose of existing loop if it's from a previous configuration
            if (this._beepLoop) {
                this._beepLoop.dispose();
            }
            // Create a new loop instance
            this._beepLoop = new Tone.Loop(time => {
                this.beepSynth.triggerAttackRelease(clampedFrequency, durationSeconds, time);
            }, durationSeconds); // The loop interval is the same as the note duration

            this._beepLoop.start(0); // Start the loop immediately
            Tone.Transport.start(); // Start Tone.Transport for the loop to run
            this.beepIsPlaying = true;
        } else {
            // For non-looping, just trigger once
            this.beepSynth.triggerAttackRelease(clampedFrequency, durationSeconds, Tone.context.currentTime);
            this.beepIsPlaying = true;
            // Schedule to update isPlaying flag after the sound finishes
            Tone.Transport.scheduleOnce(() => {
                this.beepIsPlaying = false;
                this.logMessage("AudioManager: Generated beep playback finished.");
            }, Tone.context.currentTime + durationSeconds);
        }
    },

    /**
     * Plays a generated 'alarm' sound with a specific pitch, duration, and looping option.
     * The pitch is adjusted by changing the frequency of the Tone.Synth.
     * @param {number} pitchSemitones - The desired pitch shift in semitones (e.g., -12 for an octave down, 12 for an octave up). Defaults to 0.
     * @param {number} [durationSeconds=1.0] - How long each individual note should play in seconds. Defaulted longer for alarm.
     * @param {boolean} [loop=true] - Whether the sound should loop continuously. Defaulted to true for alarm.
     */
    playAlarm: async function (pitchSemitones = 0, durationSeconds = 1.0, loop = true) {
        if (!this.alarmSynth) {
            this.logMessage("AudioManager: Alarm Synth not initialized. Cannot play.", true);
            return;
        }

        // Ensure Tone.js AudioContext is running (active state).
        if (Tone.context.state === 'suspended') {
            try {
                await Tone.start();
                this.logMessage("AudioManager: Tone.js AudioContext resumed on user interaction.");
            } catch (error) {
                this.logMessage(`AudioManager: Failed to resume Tone.js AudioContext. Error: ${error.message}`, true);
                return;
            }
        }

        // Stop any currently playing alarm sound before starting a new one
        //this.stopAlarm();

        // Calculate the target frequency based on the base frequency and semitones.
        const targetFrequency = this.baseFrequency * Math.pow(2, pitchSemitones / 12);

        // Clamp the frequency to a reasonable audible range.
        const clampedFrequency = Math.max(50, Math.min(10000, targetFrequency));

        this.logMessage(`AudioManager: Playing generated alarm at frequency ${clampedFrequency.toFixed(2)} Hz (from ${pitchSemitones} semitones), Duration: ${durationSeconds}s, Loop: ${loop}.`);

        // If looping, set up a Tone.Loop to repeatedly trigger the synth.
        if (loop) {
            // Dispose of existing loop if it's from a previous configuration
            if (this._alarmLoop) {
                this._alarmLoop.dispose();
            }
            // Create a new loop instance
            this._alarmLoop = new Tone.Loop(time => {
                this.alarmSynth.triggerAttackRelease(clampedFrequency, durationSeconds, time);
            }, durationSeconds); // The loop interval is the same as the note duration

            this._alarmLoop.start(0); // Start the loop immediately
            Tone.Transport.start(); // Start Tone.Transport for the loop to run
            this.alarmIsPlaying = true;
        } else {
            // For non-looping, just trigger once
            this.alarmSynth.triggerAttackRelease(clampedFrequency, durationSeconds, Tone.context.currentTime);
            this.alarmIsPlaying = true;
            // Schedule to update isPlaying flag after the sound finishes
            Tone.Transport.scheduleOnce(() => {
                this.alarmIsPlaying = false;
                this.logMessage("AudioManager: Generated alarm playback finished.");
            }, Tone.context.currentTime + durationSeconds);
        }
    },

    /**
     * Stops the currently playing 'beep' sound.
     */
    stopBeep: function () {
        if (this.beepSynth && this.beepIsPlaying) {
            this.beepSynth.triggerRelease(); // Stop any active notes
            if (this._beepLoop && this._beepLoop.state === 'started') {
                this._beepLoop.stop();
            }
            this.beepIsPlaying = false;
            this.logMessage("AudioManager: Generated beep playback stopped.");
            // Stop Tone.Transport only if no other sounds are playing
            if (!this.alarmIsPlaying) {
                Tone.Transport.stop();
            }
        }
    },

    /**
     * Stops the currently playing 'alarm' sound.
     */
    stopAlarm: function () {
        if (this.alarmSynth && this.alarmIsPlaying) {
            this.alarmSynth.triggerRelease(); // Stop any active notes
            if (this._alarmLoop && this._alarmLoop.state === 'started') {
                this._alarmLoop.stop();
            }
            this.alarmIsPlaying = false;
            this.logMessage("AudioManager: Generated alarm playback stopped.");
            // Stop Tone.Transport only if no other sounds are playing
            if (!this.beepIsPlaying) {
                Tone.Transport.stop();
            }
        }
    },

    /**
     * Disposes of Tone.js objects to free up resources.
     * Call this when your application is shutting down or no longer needs audio.
     */
    dispose: function () {
        //this.stopBeep(); // Ensure beep sound is stopped before disposing
        //this.stopAlarm(); // Ensure alarm sound is stopped before disposing

        if (this.beepSynth) {
            this.beepSynth.dispose();
            this.beepSynth = null;
        }
        if (this._beepLoop) {
            this._beepLoop.dispose();
            this._beepLoop = null;
        }

        if (this.alarmSynth) {
            this.alarmSynth.dispose();
            this.alarmSynth = null;
        }
        if (this._alarmLoop) {
            this._alarmLoop.dispose();
            this._alarmLoop = null;
        }

        this.logMessage("AudioManager: Disposed Tone.js resources.");
    },

    /**
     * Logs messages to the console and an optional message box.
     * @param {string} message - The message to log.
     * @param {boolean} isError - True if this is an error message.
     */
    logMessage: function (message, isError = false) {
        console.log(message);
        if (this.messageElement) {
            this.messageElement.classList.remove('hidden');
            const timestamp = new Date().toLocaleTimeString();
            this.messageElement.innerHTML += `<p class="${isError ? 'text-red-700' : 'text-gray-700'}">[${timestamp}] ${message}</p>`;
            this.messageElement.scrollTop = this.messageElement.scrollHeight; // Scroll to bottom
        }
    }
};

// Expose audioManager globally for use in other scripts
window.audioManager = audioManager;
