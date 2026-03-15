import { UI } from "../../../core";
import { showContextMenuAtMouseEvent } from "../../../ui";
import type {
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "../tree-builder";

export type GuidebookTreeFileContextAction =
	| "create_collection"
	| "create_category"
	| "rename_collection"
	| "delete_collection";

export type GuidebookTreeH1ContextAction =
	| "create_category"
	| "create_setting"
	| "rename_category"
	| "delete_category";

export type GuidebookTreeH2ContextAction =
	| "create_setting"
	| "edit_setting"
	| "rename_setting"
	| "delete_setting";

export interface GuidebookContextMenuLabels {
	createCollection: string;
	createCategory: string;
	createSetting: string;
	editSetting: string;
	renameCollection: string;
	renameCategory: string;
	renameSetting: string;
	deleteCollection: string;
	deleteCategory: string;
	deleteSetting: string;
}

export function openGuidebookFileContextMenu(
	event: MouseEvent,
	menuLabels: GuidebookContextMenuLabels,
	fileNode: GuidebookTreeFileNode,
	onAction?: (action: GuidebookTreeFileContextAction, fileNode: GuidebookTreeFileNode) => void,
): void {
	showContextMenuAtMouseEvent(event, [
		{
			title: menuLabels.createCollection,
			icon: UI.ICON.FILE,
			onClick: () => onAction?.("create_collection", fileNode),
		},
		{
			title: menuLabels.createCategory,
			icon: UI.ICON.H1,
			onClick: () => onAction?.("create_category", fileNode),
		},
		{
			title: menuLabels.renameCollection,
			icon: UI.ICON.PENCIL,
			onClick: () => onAction?.("rename_collection", fileNode),
		},
		{
			title: menuLabels.deleteCollection,
			icon: UI.ICON.DELETE,
			warning: true,
			onClick: () => onAction?.("delete_collection", fileNode),
		},
	]);
}

export function openGuidebookH1ContextMenu(
	event: MouseEvent,
	menuLabels: GuidebookContextMenuLabels,
	fileNode: GuidebookTreeFileNode,
	h1Node: GuidebookTreeH1Node,
	onAction?: (
		action: GuidebookTreeH1ContextAction,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
	) => void,
): void {
	showContextMenuAtMouseEvent(event, [
		{
			title: menuLabels.createCategory,
			icon: UI.ICON.H1,
			onClick: () => onAction?.("create_category", fileNode, h1Node),
		},
		{
			title: menuLabels.createSetting,
			icon: UI.ICON.H2,
			onClick: () => onAction?.("create_setting", fileNode, h1Node),
		},
		{
			title: menuLabels.renameCategory,
			icon: UI.ICON.PENCIL,
			onClick: () => onAction?.("rename_category", fileNode, h1Node),
		},
		{
			title: menuLabels.deleteCategory,
			icon: UI.ICON.DELETE,
			warning: true,
			onClick: () => onAction?.("delete_category", fileNode, h1Node),
		},
	]);
}

export function openGuidebookH2ContextMenu(
	event: MouseEvent,
	menuLabels: GuidebookContextMenuLabels,
	fileNode: GuidebookTreeFileNode,
	h1Node: GuidebookTreeH1Node,
	h2Node: GuidebookTreeH2Node,
	onAction?: (
		action: GuidebookTreeH2ContextAction,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
		h2Node: GuidebookTreeH2Node,
	) => void,
): void {
	showContextMenuAtMouseEvent(event, [
		{
			title: menuLabels.createSetting,
			icon: UI.ICON.H2,
			onClick: () => onAction?.("create_setting", fileNode, h1Node, h2Node),
		},
		{
			title: menuLabels.editSetting,
			icon: UI.ICON.H2,
			onClick: () => onAction?.("edit_setting", fileNode, h1Node, h2Node),
		},
		{
			title: menuLabels.renameSetting,
			icon: UI.ICON.PENCIL,
			onClick: () => onAction?.("rename_setting", fileNode, h1Node, h2Node),
		},
		{
			title: menuLabels.deleteSetting,
			icon: UI.ICON.DELETE,
			warning: true,
			onClick: () => onAction?.("delete_setting", fileNode, h1Node, h2Node),
		},
	]);
}

export function openGuidebookBlankContextMenu(
	event: MouseEvent,
	menuLabels: GuidebookContextMenuLabels,
	onCreateCollection?: () => void,
): void {
	showContextMenuAtMouseEvent(event, [
		{
			title: menuLabels.createCollection,
			icon: UI.ICON.FILE,
			onClick: () => onCreateCollection?.(),
		},
	]);
}





