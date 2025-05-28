import { Plugin, MarkdownView, Editor } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { DEFAULT_SETTINGS, HeadingHelperSettingTab } from './settings';
import { HeadingOperations } from './heading-operations';
import { GutterBadgeManager, badgeField } from './gutter-badge';
import { HierarchyChecker } from './hierarchy-checker';

export default class HeadingHelperPlugin extends Plugin {
    settings: HeadingHelperSettings;
    private headingOps: HeadingOperations;
    private badgeManager: GutterBadgeManager;
    private hierarchyChecker: HierarchyChecker;
    private editorExtensions: Extension[] = [];

    async onload() {
        console.log('Loading Heading Helper plugin');

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
        console.log('Unloading Heading Helper plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Update operations with new settings
        this.headingOps = new HeadingOperations(this.settings, this.app);
        this.badgeManager = new GutterBadgeManager(this.settings, this.onBadgeLevelChange.bind(this));
        this.hierarchyChecker = new HierarchyChecker(this.settings);
    }

    private addCommands(): void {
        // Cycle heading command
        this.addCommand({
            id: 'cycle-heading',
            name: 'Cycle heading level',
            icon: 'heading',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.cycleHeading(editor, 'cycle');
                this.refreshBadgesForEditor(editor);
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
                this.refreshBadgesForEditor(editor);
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
                this.refreshBadgesForEditor(editor);
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
                    this.refreshBadgesForEditor(editor);
                }
            });
        }

        // Set as paragraph command
        this.addCommand({
            id: 'set-paragraph',
            name: 'Set as Paragraph',
            editorCallback: async (editor: Editor) => {
                await this.headingOps.setHeadingLevel(editor, HeadingLevel.Paragraph);
                this.refreshBadgesForEditor(editor);
            }
        });
    }

    private registerEditorExtensions(): void {
        // Register the badge field extension
        this.editorExtensions = [badgeField];

        this.registerEditorExtension(this.editorExtensions);

        // Listen for editor changes to update badges
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, info) => {
                // Debounce badge updates
                setTimeout(() => {
                    this.refreshBadgesForEditor(editor);
                }, 100);
            })
        );
    }

    private registerEvents(): void {
        // Refresh badges when switching between files
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                setTimeout(() => {
                    this.refreshBadges();
                }, 50);
            })
        );

        // Refresh badges when editor mode changes
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                setTimeout(() => {
                    this.refreshBadges();
                }, 50);
            })
        );
    }

    private async onBadgeLevelChange(lineNumber: number, newLevel: HeadingLevel): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.editor) {
            await this.headingOps.setHeadingLevel(activeView.editor, newLevel, lineNumber);
            this.refreshBadgesForEditor(activeView.editor);
        }
    }

    public refreshBadges(): void {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.editor) {
            this.refreshBadgesForEditor(activeView.editor);
        }
    }

    private refreshBadgesForEditor(editor: Editor): void {
        // Get the CodeMirror editor view
        const editorView = this.getEditorView(editor);
        if (editorView && this.badgeManager) {
            this.badgeManager.updateBadges(editorView);
        }
    }

    private getEditorView(editor: Editor): EditorView | null {
        // This is a bit of a hack to get the CodeMirror EditorView from Obsidian's Editor
        // We need to access the internal CodeMirror instance
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
        this.refreshBadgesForEditor(editor);
    }

    public async cycleHeading(editor: Editor, direction: 'up' | 'down' | 'cycle' = 'cycle'): Promise<void> {
        console.log('cycleHeading', direction);
        await this.headingOps.cycleHeading(editor, direction);
        console.log('cycleHeading done');
        this.refreshBadgesForEditor(editor);
    }
} 