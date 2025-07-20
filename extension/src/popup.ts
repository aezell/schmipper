import { VolumeModeController, VolumeMode, AudioSource } from './volume-modes';
import ShortcutsManager, { ShortcutCommand } from './shortcuts';

interface VolumeMessage {
  action: string;
  tabId?: number;
  volume?: number;
  muted?: boolean;
  mode?: VolumeMode;
}

class PopupController {
  private volumeController: VolumeModeController;
  private audioSources: Map<string, AudioSource> = new Map();
  private shortcutsManager: ShortcutsManager;

  // DOM elements
  private elements: {
    modeSelect: HTMLSelectElement;
    modeDescription: HTMLDivElement;
    modeDescriptionText: HTMLParagraphElement;
    masterSlider: HTMLInputElement;
    masterValue: HTMLSpanElement;
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
    shortcutsSection: HTMLDivElement;
    shortcutsToggle: HTMLButtonElement;
    shortcutsList: HTMLDivElement;
  };

  constructor() {
    this.volumeController = new VolumeModeController();
    this.shortcutsManager = new ShortcutsManager();
    
    this.elements = {
      modeSelect: document.getElementById('mode-select') as HTMLSelectElement,
      modeDescription: document.getElementById('mode-description') as HTMLDivElement,
      modeDescriptionText: document.getElementById('mode-description-text') as HTMLParagraphElement,
      masterSlider: document.getElementById('master-slider') as HTMLInputElement,
      masterValue: document.getElementById('master-value') as HTMLSpanElement,
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
      clearErrors: document.getElementById('clear-errors') as HTMLButtonElement,
      shortcutsSection: document.getElementById('shortcuts-section') as HTMLDivElement,
      shortcutsToggle: document.getElementById('shortcuts-toggle') as HTMLButtonElement,
      shortcutsList: document.getElementById('shortcuts-list') as HTMLDivElement
    };

    this.setupVolumeController();
    this.initializeEventListeners();
    this.initializeShortcuts();
    this.loadStoredSettings();
    this.initialize();
  }

  private setupVolumeController(): void {
    this.volumeController.setCallbacks(
      (sourceId: string, volume: number) => {
        this.updateSourceVolumeDisplay(sourceId, volume);
        const source = this.audioSources.get(sourceId);
        if (source) {
          this.sendMessage({
            action: 'setVolume',
            tabId: source.tabId,
            volume: volume
          });
        }
      },
      (sourceId: string, muted: boolean) => {
        this.updateSourceMuteDisplay(sourceId, muted);
        const source = this.audioSources.get(sourceId);
        if (source) {
          this.sendMessage({
            action: 'setMute',
            tabId: source.tabId,
            muted: muted
          });
        }
      }
    );
  }

  private initializeEventListeners(): void {
    // Mode selection
    this.elements.modeSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const newMode = target.value as VolumeMode;
      this.volumeController.smoothTransition(newMode);
      this.updateModeUI();
      this.saveSettings();
      this.sendMessage({ action: 'setMode', mode: newMode });
    });

    // Master volume control
    this.elements.masterSlider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const volume = parseInt(target.value, 10);
      this.volumeController.setMasterVolume(volume);
      this.elements.masterValue.textContent = `${volume}%`;
      this.saveSettings();
    });

    // Master mute
    this.elements.muteAllButton.addEventListener('click', () => {
      const newMuted = !this.volumeController.isMasterMuted();
      this.volumeController.setMasterMute(newMuted);
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
  }

  private async loadStoredSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['volumeMode', 'masterVolume']);
      if (result.volumeMode) {
        this.volumeController.setMode(result.volumeMode);
        this.elements.modeSelect.value = result.volumeMode;
      }
      if (result.masterVolume !== undefined) {
        this.volumeController.setMasterVolume(result.masterVolume);
        this.elements.masterSlider.value = result.masterVolume.toString();
        this.elements.masterValue.textContent = `${result.masterVolume}%`;
      }
      this.updateModeUI();
    } catch (error) {
      console.error('Failed to load stored settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({
        volumeMode: this.volumeController.getMode(),
        masterVolume: this.volumeController.getMasterVolume()
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
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
      console.error('Initialization failed:', error);
      this.showError(error instanceof Error ? error.message : 'Unknown error');
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
        console.log('Unknown message:', message);
    }
  }

  private handleAudioSourcesUpdate(sources: AudioSource[]): void {
    this.audioSources.clear();
    sources.forEach(source => {
      const sourceWithId = { ...source, id: `${source.tabId}` };
      this.audioSources.set(sourceWithId.id, sourceWithId);
      this.volumeController.addSource(sourceWithId);
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
    if (!source) return;

    // Update the volume controller with the new volume
    this.volumeController.setSourceVolume(sourceId, volume);
  }

  private toggleSourceMute(sourceId: string): void {
    const source = this.audioSources.get(sourceId);
    if (!source) return;

    // Update the volume controller with the new mute state
    this.volumeController.setSourceMute(sourceId, !source.muted);
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

  private updateModeUI(): void {
    const modeInfo = this.volumeController.getModeInfo();
    
    // Update master volume visibility based on mode
    if (modeInfo.masterVolumeEnabled) {
      this.elements.masterSlider.parentElement?.classList.remove('hidden');
    } else {
      this.elements.masterSlider.parentElement?.classList.add('hidden');
    }
    
    // Update mode description
    this.elements.modeDescriptionText.textContent = modeInfo.description;
    this.elements.modeDescription.classList.remove('hidden');
    this.elements.modeSelect.title = modeInfo.description;
  }

  private updateMuteAllButton(): void {
    const isMuted = this.volumeController.isMasterMuted();
    if (isMuted) {
      this.elements.muteAllButton.classList.add('muted');
      this.elements.muteAllButton.textContent = 'Unmute All';
    } else {
      this.elements.muteAllButton.classList.remove('muted');
      this.elements.muteAllButton.textContent = 'Mute All';
    }
  }

  private showLoading(): void {
    this.elements.loading.classList.remove('hidden');
    this.elements.error.classList.add('hidden');
    this.elements.audioList.parentElement?.classList.add('hidden');
  }

  private hideLoading(): void {
    this.elements.loading.classList.add('hidden');
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

  // Shortcuts functionality
  private initializeShortcuts(): void {
    // Initialize shortcuts toggle
    if (this.elements.shortcutsToggle) {
      this.elements.shortcutsToggle.addEventListener('click', () => {
        this.toggleShortcutsSection();
      });
    }

    this.renderShortcuts();
  }

  private toggleShortcutsSection(): void {
    if (!this.elements.shortcutsSection) return;

    const isHidden = this.elements.shortcutsSection.classList.contains('hidden');
    
    if (isHidden) {
      this.elements.shortcutsSection.classList.remove('hidden');
      this.elements.shortcutsToggle.textContent = 'Hide Shortcuts';
      this.renderShortcuts();
    } else {
      this.elements.shortcutsSection.classList.add('hidden');
      this.elements.shortcutsToggle.textContent = 'Show Shortcuts';
    }
  }

  private renderShortcuts(): void {
    if (!this.elements.shortcutsList) return;

    this.elements.shortcutsList.innerHTML = '';

    const coreShortcuts = this.shortcutsManager.getShortcutsByCategory('core');
    const advancedShortcuts = this.shortcutsManager.getShortcutsByCategory('advanced');

    // Render core shortcuts
    if (coreShortcuts.length > 0) {
      const coreHeader = document.createElement('h4');
      coreHeader.textContent = 'Core Shortcuts';
      coreHeader.className = 'shortcuts-category-header';
      this.elements.shortcutsList.appendChild(coreHeader);

      coreShortcuts.forEach(shortcut => {
        const shortcutElement = this.createShortcutElement(shortcut);
        this.elements.shortcutsList.appendChild(shortcutElement);
      });
    }

    // Render advanced shortcuts
    if (advancedShortcuts.length > 0) {
      const advancedHeader = document.createElement('h4');
      advancedHeader.textContent = 'Advanced Shortcuts';
      advancedHeader.className = 'shortcuts-category-header';
      this.elements.shortcutsList.appendChild(advancedHeader);

      advancedShortcuts.forEach(shortcut => {
        const shortcutElement = this.createShortcutElement(shortcut);
        this.elements.shortcutsList.appendChild(shortcutElement);
      });
    }
  }

  private createShortcutElement(shortcut: ShortcutCommand): HTMLDivElement {
    const shortcutDiv = document.createElement('div');
    shortcutDiv.className = 'shortcut-item';
    if (!shortcut.enabled) shortcutDiv.classList.add('disabled');

    const shortcutInfo = document.createElement('div');
    shortcutInfo.className = 'shortcut-info';

    const shortcutDescription = document.createElement('div');
    shortcutDescription.className = 'shortcut-description';
    shortcutDescription.textContent = shortcut.description;

    const shortcutKey = document.createElement('div');
    shortcutKey.className = 'shortcut-key';
    shortcutKey.textContent = this.shortcutsManager.getActiveKey(shortcut);

    shortcutInfo.appendChild(shortcutDescription);
    shortcutInfo.appendChild(shortcutKey);

    const shortcutControls = document.createElement('div');
    shortcutControls.className = 'shortcut-controls';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'shortcut-toggle';
    toggleButton.textContent = shortcut.enabled ? 'Disable' : 'Enable';
    toggleButton.addEventListener('click', () => {
      this.toggleShortcut(shortcut.id);
    });

    shortcutControls.appendChild(toggleButton);

    shortcutDiv.appendChild(shortcutInfo);
    shortcutDiv.appendChild(shortcutControls);

    return shortcutDiv;
  }

  private async toggleShortcut(shortcutId: string): Promise<void> {
    const shortcut = this.shortcutsManager.getShortcuts().find(s => s.id === shortcutId);
    if (!shortcut) return;

    const newEnabled = !shortcut.enabled;
    await this.shortcutsManager.updateShortcut(shortcutId, { enabled: newEnabled });
    this.renderShortcuts();
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
