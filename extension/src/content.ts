// Content script for audio detection and volume control
// This script runs in each tab to detect audio elements and monitor audio state

class AudioDetector {
  private audioElements: Set<HTMLMediaElement> = new Set();
  private audioContext: AudioContext | null = null;
  private isDetecting: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });

    // Start detecting audio elements
    this.startAudioDetection();
    
    // Monitor for new audio elements
    this.observeAudioElements();
  }

  private handleMessage(message: any, sendResponse: (response: any) => void): void {
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
          }))
        });
        break;
      
      case 'setVolume':
        this.setVolume(message.volume);
        sendResponse({ success: true });
        break;
      
      case 'setMute':
        this.setMute(message.muted);
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ success: false, error: 'Unknown action' });
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
  }

  private scanForAudioElements(): void {
    const mediaElements = document.querySelectorAll('audio, video');
    
    mediaElements.forEach(element => {
      const mediaElement = element as HTMLMediaElement;
      this.addAudioElement(mediaElement);
    });
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

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private detectWebAudio(): void {
    // Monitor for Web Audio API usage
    const originalCreateContext = window.AudioContext?.prototype?.constructor;
    const originalCreateWebkitContext = (window as any).webkitAudioContext?.prototype?.constructor;

    if (originalCreateContext) {
      const self = this;
      window.AudioContext = class extends AudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          self.audioContext = this;
          self.notifyAudioState();
        }
      };
    }

    if (originalCreateWebkitContext) {
      const self = this;
      (window as any).webkitAudioContext = class extends (window as any).webkitAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          self.audioContext = this as unknown as AudioContext;
          self.notifyAudioState();
        }
      };
    }
  }

  private hasActiveAudio(): boolean {
    // Check HTML5 media elements
    const hasPlayingMedia = Array.from(this.audioElements).some(element => 
      !element.paused && !element.muted && element.volume > 0
    );

    // Check Web Audio API
    const hasWebAudio = this.audioContext && this.audioContext.state === 'running';

    return hasPlayingMedia || !!hasWebAudio;
  }

  private setVolume(volume: number): void {
    const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
    
    this.audioElements.forEach(element => {
      element.volume = normalizedVolume;
    });

    // Note: Web Audio API volume control would require more complex implementation
    // as it depends on the specific audio graph setup
  }

  private setMute(muted: boolean): void {
    this.audioElements.forEach(element => {
      element.muted = muted;
    });
  }

  private notifyAudioState(): void {
    const hasAudio = this.hasActiveAudio();
    
    chrome.runtime.sendMessage({
      action: 'audioStateChanged',
      tabId: undefined, // Will be set by background script
      hasAudio: hasAudio,
      timestamp: Date.now()
    }).catch(error => {
      // Ignore errors if background script is not available
      console.debug('Failed to notify audio state:', error);
    });
  }
}

// Initialize audio detector when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AudioDetector();
  });
} else {
  new AudioDetector();
}
