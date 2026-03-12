import { Plugin } from "obsidian";
import { createDefaultSettings, SettingDatas } from "./setting-datas";

export type SettingsChangeListener = (
	next: Readonly<SettingDatas>,
	prev: Readonly<SettingDatas>,
) => void;


const DEFAULT_SETTINGS = createDefaultSettings();

export class SettingStore {
	private plugin: Plugin;
	private settings: SettingDatas = this.clone(DEFAULT_SETTINGS);
	private lastCommitted: SettingDatas = this.clone(DEFAULT_SETTINGS);
	private listeners = new Set<SettingsChangeListener>();

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	// 加载设置数据
	async load(): Promise<SettingDatas> {
		const raw = (await this.plugin.loadData()) as Partial<SettingDatas> | null;
		this.settings = Object.assign(this.clone(DEFAULT_SETTINGS), raw ?? {});
		this.lastCommitted = this.clone(this.settings);
		return this.settings;
	}

	// 用外部计算后的完整设置替换当前状态，并重置提交基线
	replace(next: SettingDatas): void {
		this.settings = this.clone(next);
		this.lastCommitted = this.clone(next);
	}

	// 获取当前所有设置项的值
	get data(): SettingDatas {
		return this.settings;
	}

	// 获取当前所有设置项的快照
	getSnapshot(): Readonly<SettingDatas> {
		return this.clone(this.settings);
	}

	// 获取指定设置项的值
	get<K extends keyof SettingDatas>(key: K): SettingDatas[K] {
		return this.settings[key];
	}

	// 设置指定设置项的值
	set<K extends keyof SettingDatas>(key: K, value: SettingDatas[K]): void {
		this.settings[key] = value;
	}

	// 对象合并式更新，适合简单字段直接覆盖
	patch(patch: Partial<SettingDatas>): void {
		Object.assign(this.settings, patch);
	}

	// 函数式更新，适合带复杂逻辑的更新
	update(mutator: (draft: SettingDatas) => void): void {
		mutator(this.settings);
	}

	// 实际保存数据到data.json
	async save(): Promise<void> {
		await this.plugin.saveData(this.settings);
		this.lastCommitted = this.clone(this.settings);
	}

	// 通知变化
	notify(): void {
		const prev = this.clone(this.lastCommitted);
		const next = this.clone(this.settings);
		this.lastCommitted = next;
		this.emit(next, prev);
	}

	// 实际保存数据到data.json并通知变化
	async saveAndNotify(): Promise<void> {
		const prev = this.clone(this.lastCommitted);
		await this.plugin.saveData(this.settings);
		const next = this.clone(this.settings);
		this.lastCommitted = next;
		this.emit(next, prev);
	}

	// 通知变化
	private emit(next: SettingDatas, prev: SettingDatas): void {
		for (const listener of this.listeners) {
			listener(next, prev);
		}
	}

	// 订阅
	subscribe(listener: SettingsChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	// 清空所有订阅
	clearListeners(): void {
		this.listeners.clear();
	}

	// 深拷贝
	private clone(value: SettingDatas): SettingDatas {
		return JSON.parse(JSON.stringify(value)) as SettingDatas;
	}
}
