import type { ColorToken, StyleField } from './types';
import type { Rgba } from './color-math';

export interface ColorArea {
  readonly element: HTMLElement;
  set(color: string): void;
  get(): string;
  cancel(): boolean;
}
export interface ColorAreaOptions {
  label: string;
  input(color: string): void;
  commit(color: string): void;
}
export interface PickerApi {
  field(): StyleField;
  colorArea(options: ColorAreaOptions): ColorArea;
  colors(): ColorToken[];
  resolve(color: string): Rgba | null;
  show(value: string): void;
  commit(value: string): Promise<void>;
}
export interface PickerTab {
  readonly id: string;
  readonly label: string;
  accepts(key: string): boolean;
  mount(panel: HTMLElement, api: PickerApi): { open(value: string): boolean; close(): void };
}
export { registerPickerTab } from './color-picker';
