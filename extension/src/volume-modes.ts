// Volume mode implementations for Browser Volume Controller
// Handles Independent, Linked, and Inverse volume control modes

export type VolumeMode = 'independent' | 'linked' | 'inverse';

export interface AudioSource {
  id: string;
  tabId: number;
  title: string;
  favicon?: string;
  url: string;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
}

export interface VolumeModeSettings {
  mode: VolumeMode;
  masterVolume: number;
  muteAll: boolean;
}

export class VolumeModeController {
  private mode: VolumeMode = 'independent';
  private sources: Map<number, AudioSource> = new Map();
  private settings: VolumeModeSettings = {
    mode: 'independent',
    masterVolume: 100,
    muteAll: false
  };

  constructor() {
    this.loadSettings();
  }

  // Mode management
  public setMode(mode: VolumeMode): void {
    const oldMode = this.mode;
    this.mode = mode;
    this.settings.mode = mode;
    this.saveSettings();
    
    // Handle mode transition
    this.handleModeTransition(oldMode, mode);
  }

  // Additional methods for popup compatibility
  public setCallbacks(_volumeCallback: any, _muteCallback: any): void {
    // Placeholder for callback setup if needed
  }

  public smoothTransition(_modeOrEnable: VolumeMode | boolean): void {
    // Placeholder for smooth transition setting
  }

  public isMasterMuted(): boolean {
    return this.settings.muteAll;
  }

  public setMasterMute(muted: boolean): void {
    this.settings.muteAll = muted;
    this.saveSettings();
  }

  public addSource(source: AudioSource): void {
    this.sources.set(source.tabId, source);
  }

  public setSourceVolume(sourceId: string, volume: number): AudioSource[] {
    const tabId = parseInt(sourceId);
    return this.setVolume(tabId, volume);
  }

  public setSourceMute(sourceId: string, muted: boolean): AudioSource[] {
    const tabId = parseInt(sourceId);
    const source = this.sources.get(tabId);
    if (source) {
      source.muted = muted;
      this.sources.set(tabId, source);
    }
    return this.getSources();
  }

  public getModeInfo(mode?: VolumeMode): { name: string; description: string; masterVolumeEnabled: boolean } {
    const targetMode = mode || this.mode;
    const descriptions = {
      independent: 'Each audio source is controlled separately',
      linked: 'All sources move together maintaining relative levels',
      inverse: 'When one goes up, others go down proportionally'
    };
    
    return {
      name: targetMode.charAt(0).toUpperCase() + targetMode.slice(1),
      description: descriptions[targetMode],
      masterVolumeEnabled: targetMode === 'linked'
    };
  }

  public getMode(): VolumeMode {
    return this.mode;
  }

  // Audio source management
  public updateSources(sources: AudioSource[]): void {
    this.sources.clear();
    sources.forEach(source => {
      this.sources.set(source.tabId, source);
    });
  }

  public getSources(): AudioSource[] {
    return Array.from(this.sources.values());
  }

  // Volume control methods
  public setVolume(tabId: number, volume: number): AudioSource[] {
    const source = this.sources.get(tabId);
    if (!source) return this.getSources();

    switch (this.mode) {
      case 'independent':
        return this.setVolumeIndependent(tabId, volume);
      case 'linked':
        return this.setVolumeLinked(tabId, volume);
      case 'inverse':
        return this.setVolumeInverse(tabId, volume);
      default:
        return this.getSources();
    }
  }

  public setMasterVolume(volume: number): AudioSource[] {
    this.settings.masterVolume = volume;
    this.saveSettings();

    const sources = this.getSources();
    const scaleFactor = volume / 100;

    sources.forEach(source => {
      const newVolume = Math.round(source.volume * scaleFactor);
      source.volume = Math.max(0, Math.min(100, newVolume));
      this.sources.set(source.tabId, source);
    });

    return this.getSources();
  }

  public toggleMuteAll(): AudioSource[] {
    this.settings.muteAll = !this.settings.muteAll;
    this.saveSettings();

    const sources = this.getSources();
    sources.forEach(source => {
      source.muted = this.settings.muteAll;
      this.sources.set(source.tabId, source);
    });

    return this.getSources();
  }

  // Independent mode: Each source controlled separately
  private setVolumeIndependent(tabId: number, volume: number): AudioSource[] {
    const source = this.sources.get(tabId);
    if (source) {
      source.volume = Math.max(0, Math.min(100, volume));
      this.sources.set(tabId, source);
    }
    return this.getSources();
  }

  // Linked mode: All sources move together maintaining relative levels
  private setVolumeLinked(tabId: number, volume: number): AudioSource[] {
    const targetSource = this.sources.get(tabId);
    if (!targetSource) return this.getSources();

    const oldVolume = targetSource.volume;
    const newVolume = Math.max(0, Math.min(100, volume));
    
    if (oldVolume === 0) {
      // If source was at 0, set all to the new volume
      this.getSources().forEach(source => {
        source.volume = newVolume;
        this.sources.set(source.tabId, source);
      });
    } else {
      // Calculate ratio and apply to all sources
      const ratio = newVolume / oldVolume;
      
      this.getSources().forEach(source => {
        const adjustedVolume = Math.round(source.volume * ratio);
        source.volume = Math.max(0, Math.min(100, adjustedVolume));
        this.sources.set(source.tabId, source);
      });
    }

    return this.getSources();
  }

  // Inverse mode: When one goes up, others go down proportionally
  private setVolumeInverse(tabId: number, volume: number): AudioSource[] {
    const sources = this.getSources();
    const targetSource = this.sources.get(tabId);
    if (!targetSource || sources.length < 2) return sources;

    const newVolume = Math.max(0, Math.min(100, volume));
    const otherSources = sources.filter(s => s.tabId !== tabId);
    
    // Calculate total volume budget (100% per source)
    const totalBudget = 100 * sources.length;
    const remainingBudget = totalBudget - newVolume;
    const volumePerOtherSource = Math.max(0, remainingBudget / otherSources.length);

    // Set target source volume
    targetSource.volume = newVolume;
    this.sources.set(tabId, targetSource);

    // Distribute remaining volume among other sources
    otherSources.forEach(source => {
      source.volume = Math.round(Math.min(100, volumePerOtherSource));
      this.sources.set(source.tabId, source);
    });

    return this.getSources();
  }

  // Mode transition handling
  private handleModeTransition(_oldMode: VolumeMode, newMode: VolumeMode): void {
    const sources = this.getSources();
    
    switch (newMode) {
      case 'independent':
        // No special handling needed
        break;
        
      case 'linked':
        // Normalize all volumes to the average
        if (sources.length > 0) {
          const averageVolume = Math.round(
            sources.reduce((sum, source) => sum + source.volume, 0) / sources.length
          );
          sources.forEach(source => {
            source.volume = averageVolume;
            this.sources.set(source.tabId, source);
          });
        }
        break;
        
      case 'inverse':
        // Distribute volume evenly
        if (sources.length > 0) {
          const evenVolume = Math.round(100 / sources.length);
          sources.forEach(source => {
            source.volume = Math.min(100, evenVolume);
            this.sources.set(source.tabId, source);
          });
        }
        break;
    }
  }

  // Smart grouping by domain
  public groupByDomain(): Map<string, AudioSource[]> {
    const groups = new Map<string, AudioSource[]>();
    
    this.getSources().forEach(source => {
      try {
        const url = new URL(source.url);
        const domain = url.hostname;
        
        if (!groups.has(domain)) {
          groups.set(domain, []);
        }
        groups.get(domain)!.push(source);
      } catch {
        // Invalid URL, group under 'unknown'
        if (!groups.has('unknown')) {
          groups.set('unknown', []);
        }
        groups.get('unknown')!.push(source);
      }
    });
    
    return groups;
  }

  // Settings persistence
  private loadSettings(): void {
    chrome.storage.local.get(['volumeModeSettings'], (result) => {
      if (result.volumeModeSettings) {
        this.settings = { ...this.settings, ...result.volumeModeSettings };
        this.mode = this.settings.mode;
      }
    });
  }

  private saveSettings(): void {
    chrome.storage.local.set({ volumeModeSettings: this.settings });
  }

  // Get mode descriptions for UI
  public getModeDescription(mode: VolumeMode): string {
    switch (mode) {
      case 'independent':
        return 'Each audio source is controlled separately. Moving one slider does not affect others.';
      case 'linked':
        return 'All audio sources move together while maintaining their relative volume levels.';
      case 'inverse':
        return 'When one source goes up, others go down proportionally. Total volume is distributed.';
      default:
        return 'Unknown mode';
    }
  }

  // Utility methods
  public getMasterVolume(): number {
    return this.settings.masterVolume;
  }

  public isMutedAll(): boolean {
    return this.settings.muteAll;
  }

  public getSourceCount(): number {
    return this.sources.size;
  }
}

export default VolumeModeController;
