export type LayerName = 'play' | 'trial';

export type LayerFrame = Record<string, Record<string, string | null>>;

export interface TryCanvas {
  setLayer(name: LayerName, frame: LayerFrame | null): void;
}

export type TrialEnd = 'kept' | 'reverted' | 'dropped' | 'refused';

export interface TrialOwner {
  readonly key: string;
  readonly label: string;
  readonly anchor: HTMLElement;
  inside?(): readonly HTMLElement[];
  ended(how: TrialEnd): void;
}

export interface Trial {
  readonly key: string;
  readonly pending: boolean;
  readonly over: boolean;
  value(): string;
  put(value: string, name: string): void;
  keep(): Promise<void>;
  revert(): void;
}

export interface TryBar {
  readonly element: HTMLElement;
  show(owner: TrialOwner, name: string): void;
  pending(on: boolean): void;
  hide(): void;
  focusKeep(): void;
}

export interface TryBarActions {
  keep(): void;
  revert(): void;
  leave(forward: boolean): void;
}

export interface TryKit {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  begin(owner: TrialOwner): Trial;
  active(): Trial | null;
  busy(): boolean;
  live(key: string, value: string | null): void;
  settled(key: string): void;
  drop(): void;
  intercept(command: string): boolean;
  sync(): void;
}

export interface TryOptions {
  canvas: TryCanvas;
  overlay: HTMLElement;
  fields: ReadonlyMap<string, HTMLInputElement | HTMLSelectElement>;
  segments: ReadonlyMap<string, HTMLButtonElement[]>;
  scope(): string;
  node(): string;
  exists?(id: string): boolean;
  stored(key: string): string;
  inherited(key: string): string;
  editing(): boolean;
  setStyle(key: string, value: string): Promise<unknown>;
  status(message: string, error?: boolean): void;
  changed?(): void;
}
