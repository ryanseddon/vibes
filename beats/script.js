document.addEventListener('DOMContentLoaded', () => {
    // Initialize Web Audio API
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    
    // Global variables
    let isPlaying = false;
    let currentStep = 0;
    let bpm = 120;
    let nextNoteTime = 0;
    let timerID;
    let lastNoteDrawn = 0;
    
    // Synthesized drum sounds using Web Audio API
    
    // Helper function to create an envelope
    const createEnvelope = (target, attackTime, decayTime, sustainLevel, releaseTime) => {
        target.value = 0;
        target.exponentialRampToValueAtTime(1, audioCtx.currentTime + attackTime);
        target.exponentialRampToValueAtTime(sustainLevel, audioCtx.currentTime + attackTime + decayTime);
        target.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + attackTime + decayTime + releaseTime);
    };
    
    // White noise generator
    const createNoiseBuffer = () => {
        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        return buffer;
    };
    
    // Synthesized drum sounds
    const drumSounds = {
        // Bass drum (Kick)
        kick: (time) => {
            const oscillator = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = 150;
            oscillator.frequency.exponentialRampToValueAtTime(60, time + 0.08);
            
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
            
            oscillator.connect(gain);
            gain.connect(audioCtx.destination);
            
            oscillator.start(time);
            oscillator.stop(time + 0.4);
            
            return gain;
        },
        
        // Snare drum
        snare: (time) => {
            // Noise component
            const noiseBuffer = createNoiseBuffer();
            const noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 1000;
            noiseFilter.Q.value = 1;
            
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(1, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            
            // Tonal component
            const oscillator = audioCtx.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.value = 250;
            
            const oscGain = audioCtx.createGain();
            oscGain.gain.setValueAtTime(1, time);
            oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            
            // Connections
            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            oscillator.connect(oscGain);
            noiseGain.connect(audioCtx.destination);
            oscGain.connect(audioCtx.destination);
            
            noiseSource.start(time);
            oscillator.start(time);
            noiseSource.stop(time + 0.2);
            oscillator.stop(time + 0.2);
            
            return noiseGain;
        },
        
        // Hi-hat
        hihat: (time) => {
            const noiseBuffer = createNoiseBuffer();
            const source = audioCtx.createBufferSource();
            source.buffer = noiseBuffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 7000;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
            
            source.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            source.start(time);
            source.stop(time + 0.15);
            
            return gain;
        },
        
        // Clap
        clap: (time) => {
            const noiseBuffer = createNoiseBuffer();
            const source = audioCtx.createBufferSource();
            source.buffer = noiseBuffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1500;
            filter.Q.value = 1.5;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(1, time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.3, time + 0.03);
            gain.gain.linearRampToValueAtTime(0.8, time + 0.06);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
            
            source.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            source.start(time);
            source.stop(time + 0.3);
            
            return gain;
        },
        
        // Tom drum
        tom: (time) => {
            const oscillator = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = 120;
            oscillator.frequency.exponentialRampToValueAtTime(60, time + 0.2);
            
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
            
            oscillator.connect(gain);
            gain.connect(audioCtx.destination);
            
            oscillator.start(time);
            oscillator.stop(time + 0.3);
            
            return gain;
        },
        
        // Rim shot
        rim: (time) => {
            const oscillator = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            oscillator.type = 'square';
            oscillator.frequency.value = 800;
            
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
            
            oscillator.connect(gain);
            gain.connect(audioCtx.destination);
            
            oscillator.start(time);
            oscillator.stop(time + 0.08);
            
            return gain;
        },
        
        // Crash cymbal
        crash: (time) => {
            const noiseBuffer = createNoiseBuffer();
            const source = audioCtx.createBufferSource();
            source.buffer = noiseBuffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 3000;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 1.0);
            
            source.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            source.start(time);
            source.stop(time + 1.0);
            
            return gain;
        },
        
        // Percussion
        perc: (time) => {
            const oscillator = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = 300;
            
            // FM modulation for more complex tone
            const modulator = audioCtx.createOscillator();
            const modGain = audioCtx.createGain();
            modulator.frequency.value = 45;
            modGain.gain.value = 150;
            
            modulator.connect(modGain);
            modGain.connect(oscillator.frequency);
            
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            
            oscillator.connect(gain);
            gain.connect(audioCtx.destination);
            
            modulator.start(time);
            oscillator.start(time);
            modulator.stop(time + 0.2);
            oscillator.stop(time + 0.2);
            
            return gain;
        }
    };
    
    // Create sequencer grid
    const createSequencerGrid = () => {
        const gridContainer = document.getElementById('grid-container');
        const instruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'rim', 'crash', 'perc'];
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 16; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.dataset.instrument = instruments[row];
                cell.addEventListener('click', () => {
                    cell.classList.toggle('active');
                    // Update URL hash when pattern changes
                    updateUrlHash();
                });
                gridContainer.appendChild(cell);
            }
        }
    };
    
    // Play synthesized sound
    const playSound = (name, time = 0) => {
        // Get current time if not specified
        time = time || audioCtx.currentTime;
        
        // Create the synthesized sound
        if (drumSounds[name]) {
            // Get master volume
            const volume = parseInt(document.getElementById('volume').value) / 100;
            
            // Create a sound and apply the master volume
            const sound = drumSounds[name](time);
            if (sound && sound.gain) {
                sound.gain.value *= volume;
            }
        }
    };
    
    // Drum pad setup
    const setupDrumPads = () => {
        const pads = document.querySelectorAll('.pad');
        pads.forEach(pad => {
            pad.addEventListener('mousedown', () => {
                const sound = pad.dataset.sound;
                pad.classList.add('active');
                
                // Resume audio context if suspended
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume().then(() => {
                        playSound(sound);
                    });
                } else {
                    playSound(sound);
                }
            });
            
            pad.addEventListener('mouseup', () => {
                pad.classList.remove('active');
            });
            
            pad.addEventListener('mouseleave', () => {
                pad.classList.remove('active');
            });
        });
    };
    
    // Sequencer timing
    const nextNote = () => {
        const secondsPerBeat = 60.0 / bpm;
        nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        currentStep++;
        if (currentStep === 16) {
            currentStep = 0;
        }
    };
    
    const scheduleNote = (beatNumber, time) => {
        // Get active cells for current step
        const activeCells = document.querySelectorAll(`.cell[data-col="${beatNumber}"].active`);
        activeCells.forEach(cell => {
            const instrument = cell.dataset.instrument;
            playSound(instrument, time);
            
            // Add visual feedback for triggered sounds (with slight delay to sync with audio)
            setTimeout(() => {
                cell.classList.add('triggered');
                
                // Remove the triggered class after a short duration
                setTimeout(() => {
                    cell.classList.remove('triggered');
                }, 100);
            }, (time - audioCtx.currentTime) * 1000);
        });
    };
    
    const scheduler = () => {
        while (nextNoteTime < audioCtx.currentTime + 0.1) {
            scheduleNote(currentStep, nextNoteTime);
            nextNote();
        }
        timerID = setTimeout(scheduler, 25);
    };
    
    // Draw playhead
    const drawPlayhead = () => {
        if (lastNoteDrawn !== currentStep) {
            // Remove highlight from all columns
            document.querySelectorAll('.cell.playing').forEach(cell => {
                cell.classList.remove('playing');
            });
            
            // Add highlight to current column
            document.querySelectorAll(`.cell[data-col="${currentStep}"]`).forEach(cell => {
                cell.classList.add('playing');
            });
            
            lastNoteDrawn = currentStep;
        }
        requestAnimationFrame(drawPlayhead);
    };
    
    // Controls setup
    const setupControls = () => {
        const playPauseBtn = document.getElementById('play-pause');
        const bpmInput = document.getElementById('bpm');
        const volumeInput = document.getElementById('volume');
        const clearBtn = document.getElementById('clear');
        
        // BPM change
        bpmInput.addEventListener('input', () => {
            bpm = parseInt(bpmInput.value);
            document.getElementById('bpm-value').textContent = bpm;
            // Update URL hash when BPM changes
            updateUrlHash();
        });
        
        // Volume change
        volumeInput.addEventListener('input', () => {
            document.getElementById('volume-value').textContent = volumeInput.value;
        });
        
        // Play/Pause toggle
        playPauseBtn.addEventListener('click', () => {
            // Resume audio context if it's suspended
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            if (isPlaying) {
                clearTimeout(timerID);
                playPauseBtn.textContent = 'Play';
                isPlaying = false;
                
                // Clear playing highlights
                document.querySelectorAll('.cell.playing').forEach(cell => {
                    cell.classList.remove('playing');
                });
            } else {
                currentStep = 0;
                nextNoteTime = audioCtx.currentTime;
                scheduler();
                requestAnimationFrame(drawPlayhead);
                playPauseBtn.textContent = 'Pause';
                isPlaying = true;
            }
        });
        
        // Clear button
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll('.cell.active').forEach(cell => {
                cell.classList.remove('active');
            });
            // Update URL hash after clearing
            updateUrlHash();
        });
    };
    
    // Keyboard bindings for drum pads
    const setupKeyboardBindings = () => {
        const keyMap = {
            '1': 'kick',
            '2': 'snare',
            '3': 'hihat',
            '4': 'clap',
            'q': 'tom',
            'w': 'rim',
            'e': 'crash',
            'r': 'perc'
        };
        
        document.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            if (keyMap[key]) {
                const padElement = document.querySelector(`.pad[data-sound="${keyMap[key]}"]`);
                if (padElement && !event.repeat) {
                    padElement.classList.add('active');
                    
                    if (audioCtx.state === 'suspended') {
                        audioCtx.resume().then(() => {
                            playSound(keyMap[key]);
                        });
                    } else {
                        playSound(keyMap[key]);
                    }
                }
            }
        });
        
        document.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();
            if (keyMap[key]) {
                const padElement = document.querySelector(`.pad[data-sound="${keyMap[key]}"]`);
                if (padElement) {
                    padElement.classList.remove('active');
                }
            }
        });
    };
    
    // Initialize the app
    const init = async () => {
        createSequencerGrid();
        setupControls();
        setupDrumPads();
        setupKeyboardBindings();
        
        // URL hash state handling
        setupUrlHashHandling();
    };
    
    // URL hash patterns for sharing
    const updateUrlHash = () => {
        // Get current pattern state
        const pattern = [];
        const instruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'rim', 'crash', 'perc'];
        
        // For each instrument track
        instruments.forEach((instrument, row) => {
            const rowPattern = [];
            // Check each step
            for (let col = 0; col < 16; col++) {
                const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                rowPattern.push(cell && cell.classList.contains('active') ? '1' : '0');
            }
            pattern.push(rowPattern.join(''));
        });
        
        // Add BPM to the hash
        const hashData = {
            pattern: pattern,
            bpm: bpm
        };
        
        // Convert to base64 for shorter URLs
        const hashString = btoa(JSON.stringify(hashData));
        window.location.hash = hashString;
    };
    
    const loadPatternFromHash = () => {
        if (!window.location.hash || window.location.hash.length < 2) return;
        
        try {
            // Get hash without the # symbol and decode from base64
            const hashData = JSON.parse(atob(window.location.hash.substring(1)));
            
            // Set BPM if present
            if (hashData.bpm) {
                bpm = hashData.bpm;
                document.getElementById('bpm').value = bpm;
                document.getElementById('bpm-value').textContent = bpm;
            }
            
            // Load pattern
            if (hashData.pattern && Array.isArray(hashData.pattern)) {
                hashData.pattern.forEach((rowPattern, row) => {
                    for (let col = 0; col < 16; col++) {
                        if (rowPattern[col] === '1') {
                            const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                            if (cell) cell.classList.add('active');
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Error loading pattern from URL:', e);
        }
    };
    
    const setupUrlHashHandling = () => {
        // Load pattern from URL hash when page loads
        loadPatternFromHash();
        
        // Listen for hash changes (if user navigates with browser buttons)
        window.addEventListener('hashchange', loadPatternFromHash);
    };
    
    init();
});