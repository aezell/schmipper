interface AudioSource {
  id: string;
  tabId: number;
  title: string;
  favicon?: string;
  url: string;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
}

interface VolumeMessage {
  action: string;
  tabId?: number;
  volume?: number;
  muted?: boolean;
}

class PopupController {
  private audioSources: Map<string, AudioSource> = new Map();

  // DOM elements
  private elements: {
    muteAllButton: HTMLButtonElement;
    audioList: HTMLDivElement;
    noAudio: HTMLDivElement;
    loading: HTMLDivElement;
    error: HTMLDivElement;
    errorMessage: HTMLParagraphElement;
    retryButton: HTMLButtonElement;
    dismissError: HTMLButtonElement;
    errorStack: HTMLPreElement;
    connectionStatus: HTMLDivElement;
    statusIndicator: HTMLDivElement;
    statusDot: HTMLSpanElement;
    statusText: HTMLSpanElement;
    errorsPanel: HTMLDivElement;
    errorsList: HTMLDivElement;
    clearErrors: HTMLButtonElement;
  };

  constructor() {
    
    this.elements = {
      muteAllButton: document.getElementById('mute-all') as HTMLButtonElement,
      audioList: document.getElementById('audio-list') as HTMLDivElement,
      noAudio: document.getElementById('no-audio') as HTMLDivElement,
      loading: document.getElementById('loading') as HTMLDivElement,
      error: document.getElementById('error') as HTMLDivElement,
      errorMessage: document.getElementById('error-message') as HTMLParagraphElement,
      retryButton: document.getElementById('retry-button') as HTMLButtonElement,
      dismissError: document.getElementById('dismiss-error') as HTMLButtonElement,
      errorStack: document.getElementById('error-stack') as HTMLPreElement,
      connectionStatus: document.getElementById('connection-status') as HTMLDivElement,
      statusIndicator: document.getElementById('status-indicator') as HTMLDivElement,
      statusDot: document.getElementById('status-dot') as HTMLSpanElement,
      statusText: document.getElementById('status-text') as HTMLSpanElement,
      errorsPanel: document.getElementById('errors-panel') as HTMLDivElement,
      errorsList: document.getElementById('errors-list') as HTMLDivElement,
      clearErrors: document.getElementById('clear-errors') as HTMLButtonElement
    };

    this.initializeEventListeners();
    this.initialize();
  }


  private initializeEventListeners(): void {

    // Master mute
    this.elements.muteAllButton.addEventListener('click', () => {
      // Toggle mute for all sources
      const allMuted = this.isAllMuted();
      const newMutedState = !allMuted;
      
      // Update all sources
      this.audioSources.forEach(source => {
        source.muted = newMutedState;
        this.sendMessage({
          action: 'setMute',
          tabId: source.tabId,
          muted: newMutedState
        });
      });
      
      // Update the UI
      this.updateAllSourceMuteDisplays();
      this.updateMuteAllButton();
    });

    // Retry button
    this.elements.retryButton.addEventListener('click', () => {
      this.initialize();
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message);
      sendResponse({ success: true });
    });

    // Also poll for audio sources periodically to catch late-loading audio
    setInterval(() => {
      this.refreshAudioSources();
    }, 2000); // Check every 2 seconds
  }


  private async initialize(): Promise<void> {
    this.showLoading();
    
    try {
      // Request current audio sources from background script
      const response = await this.sendMessage({ action: 'getAudioSources' });
      
      if (response && response.success) {
        this.handleAudioSourcesUpdate(response.sources || []);
        this.hideLoading();
      } else {
        throw new Error(response?.error || 'Failed to get audio sources');
      }
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async refreshAudioSources(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getAudioSources' });
      if (response && response.success) {
        // Only update if we actually got sources or if we currently have none
        if (response.sources?.length > 0 || this.audioSources.size === 0) {
          this.handleAudioSourcesUpdate(response.sources || []);
        }
      }
    } catch (error) {
      // Refresh failed (this is normal)
    }
  }

  private handleMessage(message: any): void {
    switch (message.action) {
      case 'audioSourcesUpdated':
        this.handleAudioSourcesUpdate(message.sources);
        break;
      case 'volumeChanged':
        this.handleVolumeChanged(message.tabId, message.volume);
        break;
      case 'muteChanged':
        this.handleMuteChanged(message.tabId, message.muted);
        break;
      default:
        // Unknown message
    }
  }

  private handleAudioSourcesUpdate(sources: AudioSource[]): void {
    
    // Preserve existing volume and mute settings when updating sources
    const existingSettings = new Map<string, { volume: number; muted: boolean }>();
    this.audioSources.forEach((source, id) => {
      existingSettings.set(id, { volume: source.volume, muted: source.muted });
    });
    
    this.audioSources.clear();
    sources.forEach(source => {
      const sourceId = `${source.tabId}`;
      const existingSetting = existingSettings.get(sourceId);
      
      const sourceWithId = { 
        ...source, 
        id: sourceId,
        // Preserve existing volume/mute settings if they exist
        volume: existingSetting?.volume ?? source.volume,
        muted: existingSetting?.muted ?? source.muted
      };
      
      this.audioSources.set(sourceWithId.id, sourceWithId);
    });
    this.renderAudioSources();
  }

  private handleVolumeChanged(tabId: number, volume: number): void {
    const source = Array.from(this.audioSources.values()).find(s => s.tabId === tabId);
    if (source) {
      source.volume = volume;
      this.updateSourceVolumeDisplay(source.id, volume);
    }
  }

  private handleMuteChanged(tabId: number, muted: boolean): void {
    const source = Array.from(this.audioSources.values()).find(s => s.tabId === tabId);
    if (source) {
      source.muted = muted;
      this.updateSourceMuteDisplay(source.id, muted);
    }
  }

  private renderAudioSources(): void {
    this.elements.audioList.innerHTML = '';

    if (this.audioSources.size === 0) {
      this.elements.noAudio.classList.remove('hidden');
      return;
    }

    this.elements.noAudio.classList.add('hidden');

    Array.from(this.audioSources.values()).forEach(source => {
      const sourceElement = this.createAudioSourceElement(source);
      this.elements.audioList.appendChild(sourceElement);
    });
  }

  private createAudioSourceElement(source: AudioSource): HTMLDivElement {
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'audio-source';
    sourceDiv.dataset.sourceId = source.id;
    if (source.muted) sourceDiv.classList.add('muted');

    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';

    const favicon = document.createElement('div');
    favicon.className = 'tab-favicon';
    if (source.favicon) {
      const img = document.createElement('img');
      img.src = source.favicon;
      img.alt = 'Tab favicon';
      img.onerror = () => {
        // Fallback to generic icon if favicon fails to load
        favicon.innerHTML = '🌐';
      };
      favicon.appendChild(img);
    } else {
      favicon.innerHTML = '🌐';
    }

    const tabDetails = document.createElement('div');
    tabDetails.className = 'tab-details';

    const tabTitle = document.createElement('div');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = source.title || 'Unknown Tab';
    tabTitle.title = source.title || 'Unknown Tab';

    const tabUrl = document.createElement('div');
    tabUrl.className = 'tab-url';
    try {
      const url = new URL(source.url);
      tabUrl.textContent = url.hostname;
    } catch {
      tabUrl.textContent = source.url;
    }
    tabUrl.title = source.url;

    tabDetails.appendChild(tabTitle);
    tabDetails.appendChild(tabUrl);
    tabInfo.appendChild(favicon);
    tabInfo.appendChild(tabDetails);

    const sourceControls = document.createElement('div');
    sourceControls.className = 'source-controls';

    const sourceVolume = document.createElement('div');
    sourceVolume.className = 'source-volume';

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = source.volume.toString();
    volumeSlider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const volume = parseInt(target.value, 10);
      // Update UI immediately for responsive feel
      const volumeValue = target.parentElement?.querySelector('span');
      if (volumeValue) {
        volumeValue.textContent = `${volume}%`;
      }
      
      // Update local source data immediately
      const localSource = this.audioSources.get(source.id);
      if (localSource) {
        localSource.volume = volume;
      }
      
      // Then trigger the actual volume control
      this.setSourceVolume(source.id, volume);
    });

    const volumeValue = document.createElement('span');
    volumeValue.textContent = `${source.volume}%`;

    sourceVolume.appendChild(volumeSlider);
    sourceVolume.appendChild(volumeValue);

    const muteButton = document.createElement('button');
    muteButton.className = 'source-mute';
    muteButton.textContent = source.muted ? 'Unmute' : 'Mute';
    if (source.muted) muteButton.classList.add('muted');
    muteButton.addEventListener('click', () => {
      // Update UI immediately for responsive feel
      const localSource = this.audioSources.get(source.id);
      if (localSource) {
        const newMuted = !localSource.muted;
        
        // Update button immediately
        if (newMuted) {
          muteButton.classList.add('muted');
          muteButton.textContent = 'Unmute';
          muteButton.closest('.audio-source')?.classList.add('muted');
        } else {
          muteButton.classList.remove('muted');
          muteButton.textContent = 'Mute';
          muteButton.closest('.audio-source')?.classList.remove('muted');
        }
        
        // Update local source data AFTER UI update
        localSource.muted = newMuted;
      }
      
      // Then trigger the actual volume control
      this.toggleSourceMute(source.id);
    });

    sourceControls.appendChild(sourceVolume);
    sourceControls.appendChild(muteButton);

    sourceDiv.appendChild(tabInfo);
    sourceDiv.appendChild(sourceControls);

    return sourceDiv;
  }

  private setSourceVolume(sourceId: string, volume: number): void {
    const source = this.audioSources.get(sourceId);
    if (!source) {
      return;
    }

    // Update local source and send to background
    source.volume = volume;
    this.sendMessage({
      action: 'setVolume',
      tabId: source.tabId,
      volume: volume
    });
  }

  private toggleSourceMute(sourceId: string): void {
    const source = this.audioSources.get(sourceId);
    if (!source) {
      return;
    }

    // Send mute change to background
    this.sendMessage({
      action: 'setMute',
      tabId: source.tabId,
      muted: source.muted
    });
  }

  private updateSourceVolumeDisplay(sourceId: string, volume: number): void {
    const sourceElement = document.querySelector(`[data-source-id="${sourceId}"]`);
    if (!sourceElement) return;

    const slider = sourceElement.querySelector('input[type="range"]') as HTMLInputElement;
    const valueSpan = sourceElement.querySelector('.source-volume span') as HTMLSpanElement;

    if (slider) slider.value = volume.toString();
    if (valueSpan) valueSpan.textContent = `${volume}%`;
  }

  private updateSourceMuteDisplay(sourceId: string, muted: boolean): void {
    const sourceElement = document.querySelector(`[data-source-id="${sourceId}"]`);
    if (!sourceElement) return;

    const muteButton = sourceElement.querySelector('.source-mute') as HTMLButtonElement;
    
    if (muted) {
      sourceElement.classList.add('muted');
      muteButton.classList.add('muted');
      muteButton.textContent = 'Unmute';
    } else {
      sourceElement.classList.remove('muted');
      muteButton.classList.remove('muted');
      muteButton.textContent = 'Mute';
    }
  }

  private updateAllSourceMuteDisplays(): void {
    this.audioSources.forEach((source, sourceId) => {
      this.updateSourceMuteDisplay(sourceId, source.muted);
    });
  }


  private updateMuteAllButton(): void {
    const allMuted = this.isAllMuted();
    if (allMuted) {
      this.elements.muteAllButton.classList.add('muted');
      this.elements.muteAllButton.textContent = 'Unmute All';
    } else {
      this.elements.muteAllButton.classList.remove('muted');
      this.elements.muteAllButton.textContent = 'Mute All';
    }
  }

  private isAllMuted(): boolean {
    if (this.audioSources.size === 0) return false;
    return Array.from(this.audioSources.values()).every(source => source.muted);
  }

  private showLoading(): void {
    this.elements.loading.classList.remove('hidden');
    this.elements.error.classList.add('hidden');
    this.elements.audioList.parentElement?.classList.add('hidden');
  }

  private hideLoading(): void {
    this.elements.loading.classList.add('hidden');
    this.elements.connectionStatus.classList.add('hidden');
    this.elements.audioList.parentElement?.classList.remove('hidden');
  }

  private showError(message: string): void {
    this.elements.error.classList.remove('hidden');
    this.elements.errorMessage.textContent = message;
    this.elements.loading.classList.add('hidden');
    this.elements.audioList.parentElement?.classList.add('hidden');
  }

  private async sendMessage(message: VolumeMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});