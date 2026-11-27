import type { EditorState } from '../../../types';

export interface StyleField {
  readonly key: string;
  readonly label: string;
  readonly input: HTMLInputElement;
  readonly wrapper: HTMLElement;
  readonly lead: HTMLElement;
  readonly trail: HTMLElement;
  readonly below: HTMLElement;
  value(): string;
  inherited(): string;
  show(value: string): void;
  restore(): void;
  commit(value: string): Promise<void>;
}

export interface ColorToken { name: string; value: string; css: string; group: 'site' | 'brand' | 'team' }

export interface ControlHost {
  readonly overlay: HTMLElement;
  state(): EditorState | undefined;
  colors(): ColorToken[];
  restricted(): boolean;
  status(message: string, error?: boolean): void;
}

export interface Control {
  sync(value: string, inherited: string): boolean;
  setRaw?(raw: boolean): void;
  cancel?(): void;
}

export type ControlFactory = (field: StyleField, host: ControlHost) => Control;

export interface ControlKit {
  sync(): void;
  raw(key: string): boolean;
  setRaw(key: string, raw: boolean): void;
  defaultRaw(): boolean;
  setDefaultRaw(raw: boolean): void;
}
