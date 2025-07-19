// Enhanced audio detection for Browser Volume Controller
// Provides comprehensive audio source detection and state monitoring

export interface AudioPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  isMuted: boolean;
  sources: AudioSourceInfo[];
  timestamp: number;
  tabInfo?: {
    title: string;
    url: string;
    favicon?: string;
  };
}

export interface AudioSourceInfo {
  type: 'audio' | 'video' | 'webaudio';
  id: string;
  volume: number;
  duration?: number;
  currentTime?: number;
  src?: string;
  title?: string;
}

export class AudioDetector {
  private currentState: AudioPlaybackState;
  private mediaElements: Map<string, HTMLMediaElement> = new Map();
  private audioContexts: AudioContext[] = [];
  private checkInterval: number | null = null;
  private mutationObserver: MutationObserver | null = null;
  private lastReportedState: string = '';

  constructor() {
    this.currentState = {
      isPlaying: false,
      isPaused: false,
      isMuted: false,
      sources: [],
      timestamp: Date.now()
    };
    
    this.initializeDetection();
  }

  private initializeDetection(): void {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.startMonitoring());
    } else {
      this.startMonitoring();
    }
  }

  private startMonitoring(): void {
    // Monitor existing and new media elements
    this.scanForMediaElements();
    this.setupMutationObserver();
    
    // Monitor Web Audio API
    this.monitorWebAudio();
    
    // Periodic state check with optimized frequency
    this.checkInterval = window.setInterval(() => {
      this.updateAudioState();
    }, 500); // More frequent for better responsiveness
    
    // Initial state report
    this.updateAudioState();
  }

  private scanForMediaElements(): void {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach(element => {
      this.trackMediaElement(element as HTMLMediaElement);
    });
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === 'AUDIO' || element.tagName === 'VIDEO') {
              this.trackMediaElement(element as HTMLMediaElement);
            }
            // Also check child elements
            const mediaChildren = element.querySelectorAll?.('audio, video');
            mediaChildren?.forEach(child => {
              this.trackMediaElement(child as HTMLMediaElement);
            });
          }
        });
      });
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private trackMediaElement(element: HTMLMediaElement): void {
    const id = this.generateElementId(element);
    
    if (this.mediaElements.has(id)) return;
    
    this.mediaElements.set(id, element);

    // Add event listeners
    const events = ['play', 'pause', 'ended', 'volumechange', 'loadstart', 'canplay'];
    events.forEach(eventType => {
      element.addEventListener(eventType, () => {
        setTimeout(() => this.updateAudioState(), 50); // Small delay for state stabilization
      });
    });

    // Track src changes
    const observer = new MutationObserver(() => {
      setTimeout(() => this.updateAudioState(), 50);
    });
    observer.observe(element, { attributes: true, attributeFilter: ['src'] });
  }

  private generateElementId(element: HTMLMediaElement): string {
    // Create unique ID based on element properties
    const src = element.src || element.currentSrc || '';
    const position = Array.from(document.querySelectorAll(element.tagName.toLowerCase())).indexOf(element);
    return `${element.tagName.toLowerCase()}-${position}-${src.slice(-20)}`;
  }

  private monitorWebAudio(): void {
    const originalAudioContext = window.AudioContext || (window as any).webkitAudioContext;
    
    if (!originalAudioContext) return;

    const self = this;
    
    const AudioContextProxy = new Proxy(originalAudioContext, {
      construct(target, args) {
        const context = new target(...args);
        self.audioContexts.push(context);
        
        // Monitor context state changes
        const originalResume = context.resume.bind(context);
        const originalSuspend = context.suspend.bind(context);
        
        context.resume = function() {
          const result = originalResume();
          setTimeout(() => self.updateAudioState(), 50);
          return result;
        };
        
        context.suspend = function() {
          const result = originalSuspend();
          setTimeout(() => self.updateAudioState(), 50);
          return result;
        };
        
        return context;
      }
    });

    (window as any).AudioContext = AudioContextProxy;
    if ((window as any).webkitAudioContext) {
      (window as any).webkitAudioContext = AudioContextProxy;
    }
  }

  private updateAudioState(): void {
    const sources: AudioSourceInfo[] = [];
    let hasPlaying = false;
    let hasPaused = false;
    let hasMuted = false;

    // Check HTML5 media elements
    this.mediaElements.forEach((element, id) => {
      if (!document.contains(element)) {
        this.mediaElements.delete(id);
        return;
      }

      const isActive = !element.paused && element.currentTime > 0 && !element.ended;
      const isPaused = element.paused && element.currentTime > 0;
      const isMuted = element.muted || element.volume === 0;

      if (isActive || isPaused) {
        sources.push({
          type: element.tagName.toLowerCase() as 'audio' | 'video',
          id,
          volume: element.volume,
          duration: element.duration,
          currentTime: element.currentTime,
          src: element.src || element.currentSrc,
          title: element.title || this.extractTitle(element)
        });

        if (isActive) hasPlaying = true;
        if (isPaused) hasPaused = true;
        if (isMuted) hasMuted = true;
      }
    });

    // Check Web Audio contexts
    this.audioContexts.forEach((context, index) => {
      if (context.state === 'running') {
        sources.push({
          type: 'webaudio',
          id: `webaudio-${index}`,
          volume: 1 // Web Audio volume is complex, default to 1
        });
        hasPlaying = true;
      }
    });

    // Update state
    this.currentState = {
      isPlaying: hasPlaying,
      isPaused: hasPaused && !hasPlaying,
      isMuted: hasMuted,
      sources,
      timestamp: Date.now(),
      tabInfo: {
        title: document.title,
        url: window.location.href,
        favicon: this.getFaviconUrl()
      }
    };

    // Only report if state changed significantly
    const stateHash = this.hashState(this.currentState);
    if (stateHash !== this.lastReportedState) {
      this.lastReportedState = stateHash;
      this.reportAudioState();
    }
  }

  private extractTitle(element: HTMLMediaElement): string {
    // Try to extract meaningful title from media element
    return element.title || 
           element.getAttribute('aria-label') || 
           element.getAttribute('data-title') ||
           (element.closest('[data-title]')?.getAttribute('data-title')) ||
           '';
  }

  private getFaviconUrl(): string | undefined {
    const favicon = document.querySelector('link[rel*="icon"]') as HTMLLinkElement;
    return favicon?.href;
  }

  private hashState(state: AudioPlaybackState): string {
    // Create simple hash for state comparison
    return JSON.stringify({
      isPlaying: state.isPlaying,
      isPaused: state.isPaused,
      isMuted: state.isMuted,
      sourceCount: state.sources.length,
      sources: state.sources.map(s => ({ type: s.type, id: s.id, volume: s.volume }))
    });
  }

  private reportAudioState(): void {
    try {
      chrome.runtime.sendMessage({
        action: 'audioStateChanged',
        state: this.currentState
      });
    } catch (error) {
      console.warn('Failed to send audio state to background script:', error);
    }
  }

  public getCurrentState(): AudioPlaybackState {
    return { ...this.currentState };
  }

  public destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    this.mediaElements.clear();
    this.audioContexts.length = 0;
  }
}
