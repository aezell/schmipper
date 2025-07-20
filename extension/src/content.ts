// Content script for audio detection and volume control
// This script runs in each tab to detect audio elements and monitor audio state

class AudioDetector {
  private audioElements: Set<HTMLMediaElement> = new Set();
  private webAudioContexts: Set<AudioContext> = new Set();
  private gainNodes: Map<AudioContext, GainNode> = new Map();
  private currentVolume: number = 1.0;
  private currentMuted: boolean = false;
  private isDetecting: boolean = false;
  private lastNotifiedAudioState: boolean = false;
  private hasEverHadAudio: boolean = false;

  constructor() {
    console.log('[Schmipper] AudioDetector initializing...');
    this.initialize();
  }

  private initialize(): void {
    // Check if extension context is valid before setting up listeners
    if (!chrome.runtime?.id) {
      console.debug('[Schmipper] Extension context invalidated, skipping initialization');
      return;
    }

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });

    // Start detecting audio elements
    this.startAudioDetection();
    
    // Immediately notify current audio state in case background script is just connecting
    this.notifyAudioState();
    
    // Monitor for new audio elements
    this.observeAudioElements();
  }

  private handleMessage(message: any, sendResponse: (response: any) => void): void {
    console.log(`[Schmipper] Content script received message:`, message);
    try {
      switch (message.action) {
        case 'getAudioState':
          sendResponse({
            success: true,
            hasAudio: this.hasActiveAudio(),
            audioElements: Array.from(this.audioElements).map(el => ({
              tagName: el.tagName.toLowerCase(),
              src: el.src || el.currentSrc,
              volume: el.volume,
              muted: el.muted,
              paused: el.paused
            })),
            webAudioContexts: this.webAudioContexts.size,
            gainNodes: this.gainNodes.size
          });
          break;
        
        case 'setVolume':
          if (typeof message.volume !== 'number' || message.volume < 0 || message.volume > 100) {
            sendResponse({ success: false, error: 'Invalid volume value' });
            break;
          }
          this.setVolume(message.volume);
          sendResponse({ success: true, currentVolume: this.currentVolume * 100 });
          break;
        
        case 'setMute':
          if (typeof message.muted !== 'boolean') {
            sendResponse({ success: false, error: 'Invalid mute value' });
            break;
          }
          this.setMute(message.muted);
          sendResponse({ success: true, currentMuted: this.currentMuted });
          break;
        
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[Schmipper] Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private startAudioDetection(): void {
    if (this.isDetecting) return;
    this.isDetecting = true;

    // Find existing audio/video elements
    this.scanForAudioElements();

    // Check for Web Audio API usage
    this.detectWebAudio();

    // Notify background script about audio state
    this.notifyAudioState();

    // Start periodic scanning for new audio elements (less frequent to avoid volume resets)
    setInterval(() => {
      this.scanForAudioElements();
      // Only notify if audio state actually changed
      this.notifyAudioStateIfChanged();
    }, 3000); // Check every 3 seconds
  }

  private scanForAudioElements(): void {
    try {
      const mediaElements = document.querySelectorAll('audio, video');
      
      mediaElements.forEach(element => {
        const mediaElement = element as HTMLMediaElement;
        this.addAudioElement(mediaElement);
      });
      
      console.log(`[Schmipper] Scanned and found ${mediaElements.length} existing media elements`);
    } catch (error) {
      console.log('[Schmipper] Document not ready for scanning, will retry when observer starts');
    }
  }

  private addAudioElement(element: HTMLMediaElement): void {
    if (this.audioElements.has(element)) return;

    this.audioElements.add(element);

    // Listen for audio events
    element.addEventListener('play', () => this.notifyAudioState());
    element.addEventListener('pause', () => this.notifyAudioState());
    element.addEventListener('ended', () => this.notifyAudioState());
    element.addEventListener('volumechange', () => this.notifyAudioState());
    element.addEventListener('loadstart', () => this.notifyAudioState());
  }

  private observeAudioElements(): void {
    const startObserver = () => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check if the added node is an audio/video element
              if (element.tagName === 'AUDIO' || element.tagName === 'VIDEO') {
                this.addAudioElement(element as HTMLMediaElement);
              }
              
              // Check for audio/video elements within the added node
              const mediaElements = element.querySelectorAll('audio, video');
              mediaElements.forEach(mediaEl => {
                this.addAudioElement(mediaEl as HTMLMediaElement);
              });
            }
          });
        });
      });

      // Make sure document.body exists before observing
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        console.log('[Schmipper] MutationObserver started on document.body');
      } else {
        console.log('[Schmipper] document.body not ready, retrying...');
        setTimeout(startObserver, 100);
      }
    };

    startObserver();
  }

  public detectWebAudio(): void {
    // Monitor for Web Audio API usage and inject gain nodes for volume control
    const originalAudioContext = window.AudioContext;
    const originalWebkitAudioContext = (window as any).webkitAudioContext;

    if (originalAudioContext) {
      const self = this;
      window.AudioContext = class extends originalAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          self.interceptAudioContext(this);
        }
      };
    }

    if (originalWebkitAudioContext) {
      const self = this;
      (window as any).webkitAudioContext = class extends originalWebkitAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          self.interceptAudioContext(this as unknown as AudioContext);
        }
      };
    }
  }

  private interceptAudioContext(context: AudioContext): void {
    this.webAudioContexts.add(context);
    
    // Create a gain node for volume control
    const gainNode = context.createGain();
    gainNode.gain.value = this.currentVolume;
    this.gainNodes.set(context, gainNode);
    
    // Override connect methods to insert our gain node
    const originalCreateBufferSource = context.createBufferSource;
    const originalCreateOscillator = context.createOscillator;
    const originalCreateMediaElementSource = context.createMediaElementSource;
    
    // Intercept common audio source creation methods
    context.createBufferSource = function() {
      const source = originalCreateBufferSource.call(this);
      const originalSourceConnect = source.connect;
      
      source.connect = function(destination: any, ...args: any[]) {
        if (destination === context.destination) {
          // Route through our gain node
          originalSourceConnect.call(this, gainNode as any);
          gainNode.connect(destination);
        } else {
          originalSourceConnect.call(this, destination, ...args);
        }
        return destination;
      };
      
      return source;
    };
    
    context.createOscillator = function() {
      const oscillator = originalCreateOscillator.call(this);
      const originalOscConnect = oscillator.connect;
      
      oscillator.connect = function(destination: any, ...args: any[]) {
        if (destination === context.destination) {
          // Route through our gain node
          originalOscConnect.call(this, gainNode as any);
          gainNode.connect(destination);
        } else {
          originalOscConnect.call(this, destination, ...args);
        }
        return destination;
      };
      
      return oscillator;
    };
    
    context.createMediaElementSource = function(mediaElement: HTMLMediaElement) {
      const source = originalCreateMediaElementSource.call(this, mediaElement);
      const originalMediaConnect = source.connect;
      
      source.connect = function(destination: any, ...args: any[]) {
        if (destination === context.destination) {
          // Route through our gain node
          originalMediaConnect.call(this, gainNode as any);
          gainNode.connect(destination);
        } else {
          originalMediaConnect.call(this, destination, ...args);
        }
        return destination;
      };
      
      return source;
    };
    
    // Connect gain node to destination by default
    gainNode.connect(context.destination);
    
    console.log('[Schmipper] Intercepted AudioContext with gain control');
    this.notifyAudioState();
  }

  private hasActiveAudio(): boolean {
    // Check HTML5 media elements - consider both playing and muted-by-extension as "active"
    const hasPlayingMedia = Array.from(this.audioElements).some(element => 
      !element.paused && element.volume > 0 // Don't check element.muted - we want to track muted elements too
    );

    // Check Web Audio API contexts
    const hasWebAudio = Array.from(this.webAudioContexts).some(context => 
      context.state === 'running'
    );

    const hasCurrentAudio = hasPlayingMedia || hasWebAudio;
    
    // Update the flag if we currently have audio
    if (hasCurrentAudio) {
      this.hasEverHadAudio = true;
    }

    // Return true if we currently have audio OR if we've had audio before and are currently muted by extension
    const result = hasCurrentAudio || (this.hasEverHadAudio && this.currentMuted);
    
    console.log(`[Schmipper] hasActiveAudio: hasPlaying=${hasPlayingMedia}, hasWebAudio=${hasWebAudio}, hasEverHad=${this.hasEverHadAudio}, muted=${this.currentMuted}, result=${result}`);
    
    return result;
  }

  private setVolume(volume: number): void {
    const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
    this.currentVolume = this.currentMuted ? 0 : normalizedVolume;
    
    console.log(`[Schmipper] Setting volume to ${volume}% (normalized: ${normalizedVolume})`);
    console.log(`[Schmipper] Found ${this.audioElements.size} HTML5 elements, ${this.gainNodes.size} Web Audio contexts`);
    
    // Control HTML5 media elements
    let htmlElementsControlled = 0;
    this.audioElements.forEach(element => {
      const oldVolume = element.volume;
      element.volume = normalizedVolume;
      htmlElementsControlled++;
      console.log(`[Schmipper] HTML5 element volume: ${oldVolume} -> ${element.volume}`);
    });

    // Control Web Audio API contexts via gain nodes
    let webAudioControlled = 0;
    this.gainNodes.forEach((gainNode, context) => {
      try {
        const oldGainValue = gainNode.gain.value;
        // Use exponential ramping for smooth volume changes
        const currentTime = context.currentTime;
        gainNode.gain.cancelScheduledValues(currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          Math.max(0.001, this.currentVolume), // Avoid zero for exponential ramp
          currentTime + 0.1 // 100ms ramp time
        );
        webAudioControlled++;
        console.log(`[Schmipper] Web Audio gain: ${oldGainValue} -> target: ${this.currentVolume}`);
      } catch (error) {
        // Fallback to immediate value change if ramping fails
        gainNode.gain.value = this.currentVolume;
        webAudioControlled++;
        console.log(`[Schmipper] Web Audio gain (immediate): ${gainNode.gain.value}`);
      }
    });

    console.log(`[Schmipper] Controlled ${htmlElementsControlled} HTML5 elements, ${webAudioControlled} Web Audio contexts`);
  }

  private setMute(muted: boolean): void {
    this.currentMuted = muted;
    
    // Control HTML5 media elements
    this.audioElements.forEach(element => {
      element.muted = muted;
    });

    // Control Web Audio API contexts via gain nodes
    this.gainNodes.forEach((gainNode, context) => {
      try {
        const targetVolume = muted ? 0 : this.currentVolume;
        const currentTime = context.currentTime;
        gainNode.gain.cancelScheduledValues(currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        
        if (muted) {
          // Quick fade to zero when muting
          gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.05);
        } else {
          // Restore volume when unmuting
          gainNode.gain.exponentialRampToValueAtTime(
            Math.max(0.001, targetVolume),
            currentTime + 0.1
          );
        }
      } catch (error) {
        // Fallback to immediate value change
        gainNode.gain.value = muted ? 0 : this.currentVolume;
      }
    });

    console.log(`[Schmipper] Set mute to ${muted}`);
    
    // Notify audio state change after mute operation
    this.notifyAudioState();
  }

  private notifyAudioStateIfChanged(): void {
    const hasAudio = this.hasActiveAudio();
    
    // Only notify if state actually changed
    if (hasAudio === this.lastNotifiedAudioState) {
      return;
    }
    
    this.lastNotifiedAudioState = hasAudio;
    this.notifyAudioState();
  }

  private notifyAudioState(): void {
    const hasAudio = this.hasActiveAudio();
    this.lastNotifiedAudioState = hasAudio;
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.debug('[Schmipper] Extension context invalidated, skipping notification');
      return;
    }
    
    try {
      chrome.runtime.sendMessage({
        action: 'audioStateChanged',
        tabId: undefined, // Will be set by background script
        state: {
          isPlaying: hasAudio
        },
        timestamp: Date.now()
      }).catch(error => {
        // Check for context invalidation
        if (error.message?.includes('Extension context invalidated')) {
          console.debug('[Schmipper] Extension context invalidated during message send');
          return;
        }
        // Ignore other errors if background script is not available
        console.debug('[Schmipper] Failed to notify audio state:', error);
      });
    } catch (error) {
      console.debug('[Schmipper] Runtime not available:', error);
    }
  }
}

// Initialize audio detector when script loads
console.log('[Schmipper] Content script loading...', window.location.href);

// Initialize immediately since we're running at document_start
console.log('[Schmipper] Initializing AudioDetector immediately');
(window as any).audioDetector = new AudioDetector();

// Also set up Web Audio API interception as early as possible
if (typeof window !== 'undefined') {
  console.log('[Schmipper] Setting up early Web Audio API interception');
  const detector = (window as any).audioDetector;
  if (detector) {
    // Call detectWebAudio again to ensure it's set up before any sites create AudioContext
    detector.detectWebAudio();
  }
}
