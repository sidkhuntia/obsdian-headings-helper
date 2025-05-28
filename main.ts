import { Plugin, MarkdownView, Editor } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { DEFAULT_SETTINGS, HeadingHelperSettingTab } from './settings';
import { HeadingOperations } from './heading-operations';
import { GutterBadgeManager } from './gutter-badge';
import { HierarchyChecker } from './hierarchy-checker';

export default class HeadingHelperPlugin extends Plugin {
    settings: HeadingHelperSettings;
    private headingOps: HeadingOperations;
    private badgeManager: GutterBadgeManager;
    private hierarchyChecker: HierarchyChecker;
    private editorExtensions: Extension[] = [];

    async onload() {

        // Load settings
        await this.loadSettings();

        // Initialize managers
        this.headingOps = new HeadingOperations(this.settings, this.app);
        this.badgeManager = new GutterBadgeManager(this.settings, this.onBadgeLevelChange.bind(this));
        this.hierarchyChecker = new HierarchyChecker(this.settings);

        // Register commands
        this.addCommands();

        // Register editor extensions
        this.registerEditorExtensions();

        // Register settings tab
        this.addSettingTab(new HeadingHelperSettingTab(this.app, this));

        // Register workspace events
        this.registerEvents();
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Update operations with new settings
        this.headingOps = new HeadingOperations(this.settings, this.app);
        this.badgeManager.updateSettings(this.settings);
        this.hierarchyChecker = new HierarchyChecker(this.settings);

        // Re-register editor extensions with new settings
        this.app.workspace.updateOptions();
    }

    private addCommands(): void {
        // Cycle heading command
        this.addCommand({
            id: 'cycle-heading',
            name: 'Cycle heading level',
            icon: 'heading',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.cycleHeading(editor, 'cycle');
            },
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'h' }]
        });

        // Heading up command
        this.addCommand({
            id: 'heading-up',
            name: 'Decrease heading level',
            icon: 'chevron-up',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.cycleHeading(editor, 'up');
            },
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'ArrowUp' }]
        });

        // Heading down command
        this.addCommand({
            id: 'heading-down',
            name: 'Increase heading level',
            icon: 'chevron-down',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.cycleHeading(editor, 'down');
            },
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'ArrowDown' }]
        });

        // Individual heading level commands
        for (let level = 1; level <= 6; level++) {
            this.addCommand({
                id: `set-heading-${level}`,
                name: `Set as Heading ${level}`,
                editorCallback: async (editor: Editor) => {
                    await this.headingOps.setHeadingLevel(editor, level as HeadingLevel);
                }
            });
        }

        // Set as paragraph command
        this.addCommand({
            id: 'set-paragraph',
            name: 'Set as Paragraph',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.setHeadingLevel(editor, HeadingLevel.Paragraph);
            }
        });
    }

    private registerEditorExtensions(): void {
        // Register the gutter extension
        this.editorExtensions = this.badgeManager.getExtension();
        this.registerEditorExtension(this.editorExtensions);

        // Listen for editor changes to update badges (handled automatically by gutter system)
        // The gutter system updates automatically, but we keep this for any other update needs
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, info) => {
                // Badge updates are now handled automatically by the gutter system
                // This is kept for any future manual refresh needs
                setTimeout(() => {
                    // No action needed - gutter handles this automatically
                }, 100);
            })
        );
    }

    private registerEvents(): void {
        // Refresh badges when switching between files (handled automatically by gutter)
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                // Gutter system handles this automatically
            })
        );

        // Refresh badges when editor mode changes (handled automatically by gutter)
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // Gutter system handles this automatically
            })
        );
    }

    private async onBadgeLevelChange(lineNumber: number, newLevel: HeadingLevel): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.editor) {
            await this.headingOps.setHeadingLevel(activeView.editor, newLevel, lineNumber);
            // Gutter system will update automatically
        }
    }

    public refreshBadges(): void {
        // Method kept for compatibility but gutter system handles updates automatically
        // This could be used to force a refresh if needed in the future
    }

    private refreshBadgesForEditor(editor: Editor): void {
        // Method kept for compatibility but gutter system handles updates automatically
    }

    private getEditorView(editor: Editor): EditorView | null {
        // This method is kept for potential future use
        const cm = (editor as any).cm;
        if (cm && cm instanceof EditorView) {
            return cm;
        }
        return null;
    }

    // Public API for other plugins
    public getHeadingLevel(editor: Editor, lineNumber: number): HeadingLevel {
        return this.headingOps.getHeadingLevel(editor, lineNumber);
    }

    public async setHeadingLevel(editor: Editor, targetLevel: HeadingLevel, lineNumber?: number): Promise<void> {
        await this.headingOps.setHeadingLevel(editor, targetLevel, lineNumber);
        // Gutter system will update automatically
    }

    public async cycleHeading(editor: Editor, direction: 'up' | 'down' | 'cycle' = 'cycle'): Promise<void> {
        await this.headingOps.cycleHeading(editor, direction);
        // Gutter system will update automatically
    }
} 