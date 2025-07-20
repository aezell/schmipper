import * as os from 'os';
import { MacOSAudioController } from './macos';
import { WindowsAudioController } from './windows';

export interface AudioSource {
  id: string;
  name: string;
  processId: number;
  volume: number;
  isMuted: boolean;
  browserType: 'chrome' | 'brave' | 'firefox' | 'safari' | 'unknown';
}

export interface AudioController {
  getAudioSources(): Promise<AudioSource[]>;
  setVolume(sourceId: string, volume: number): Promise<void>;
  getVolume(sourceId: string): Promise<number>;
  setMute(sourceId: string, muted: boolean): Promise<void>;
  getBrowserProcesses(): Promise<Array<{ pid: number; name: string; browser: string }>>;
}

export function createAudioController(): AudioController {
  const platform = os.platform();
  
  switch (platform) {
    case 'darwin':
      return new MacOSAudioController();
    case 'win32':
      return new WindowsAudioController();
    case 'linux':
      throw new Error('Linux audio control not yet implemented');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export * from './macos';
export * from './windows';
