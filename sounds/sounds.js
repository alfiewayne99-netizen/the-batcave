// Raven Command - Sound System
// Uses Web Audio API for notification sounds

const RavenSounds = (() => {
  let audioContext = null;
  let muted = localStorage.getItem('raven-muted') === 'true';
  
  // Initialize AudioContext on first user interaction
  function getContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }
  
  // Check if sounds are muted
  function isMuted() {
    return muted;
  }
  
  // Toggle mute state
  function toggleMute() {
    muted = !muted;
    localStorage.setItem('raven-muted', muted);
    return muted;
  }
  
  // Set mute state
  function setMute(state) {
    muted = !!state;
    localStorage.setItem('raven-muted', muted);
    return muted;
  }
  
  // Play a tone with given parameters
  function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (muted) return;
    
    try {
      const ctx = getContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      // Envelope for smooth start/end
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('[Sounds] Playback failed:', e);
    }
  }
  
  // Working Start - Rising two-tone chime (energetic)
  function workingStart() {
    if (muted) return;
    const ctx = getContext();
    const now = ctx.currentTime;
    
    // First tone - lower
    playToneAt(440, now, 0.15, 'sine', 0.25);
    // Second tone - higher (perfect fifth)
    playToneAt(660, now + 0.12, 0.2, 'sine', 0.3);
  }
  
  // Task Complete - Satisfying success sound (descending then up)
  function taskComplete() {
    if (muted) return;
    const ctx = getContext();
    const now = ctx.currentTime;
    
    // Three-note success jingle
    playToneAt(523.25, now, 0.12, 'sine', 0.25);       // C5
    playToneAt(659.25, now + 0.1, 0.12, 'sine', 0.28);  // E5
    playToneAt(783.99, now + 0.2, 0.25, 'sine', 0.3);   // G5
  }
  
  // Alert - Attention-grabbing ping
  function alert() {
    if (muted) return;
    playTone(880, 0.15, 'sine', 0.35);
    setTimeout(() => playTone(880, 0.15, 'sine', 0.25), 200);
  }
  
  // Notification - Soft, pleasant ding
  function notification() {
    if (muted) return;
    playTone(698.46, 0.2, 'sine', 0.2); // F5
  }
  
  // Error - Low warning tone
  function error() {
    if (muted) return;
    const ctx = getContext();
    const now = ctx.currentTime;
    playToneAt(220, now, 0.15, 'triangle', 0.3);
    playToneAt(196, now + 0.15, 0.25, 'triangle', 0.25);
  }
  
  // Helper for scheduled tones
  function playToneAt(frequency, startTime, duration, type = 'sine', volume = 0.3) {
    if (muted) return;
    
    try {
      const ctx = getContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    } catch (e) {
      console.warn('[Sounds] Playback failed:', e);
    }
  }
  
  // Initialize context on user interaction
  function init() {
    const initContext = () => {
      if (!audioContext) {
        getContext();
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
      }
    };
    
    document.addEventListener('click', initContext, { once: true });
    document.addEventListener('keydown', initContext, { once: true });
    document.addEventListener('touchstart', initContext, { once: true });
  }
  
  return {
    init,
    isMuted,
    toggleMute,
    setMute,
    workingStart,
    taskComplete,
    alert,
    notification,
    error,
    // Generic tone for custom use
    playTone
  };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
  RavenSounds.init();
}
