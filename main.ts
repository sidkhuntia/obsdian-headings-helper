import { Plugin, MarkdownView, Editor } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { DEFAULT_SETTINGS, HeadingHelperSettingTab } from './settings';
import { HeadingOperations } from './heading-operations';
import { GutterBadgeManager } from './gutter-badge';

export default class HeadingHelperPlugin extends Plugin {
    settings: HeadingHelperSettings;
    private headingOps: HeadingOperations;
    private badgeManager: GutterBadgeManager;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.initializeComponents();
        this.registerCommands();
        this.registerEditorExtensions();
        this.addSettingTab(new HeadingHelperSettingTab(this.app, this));
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.updateComponents();
        this.app.workspace.updateOptions();
    }

    private initializeComponents(): void {
        this.headingOps = new HeadingOperations(this.settings, this.app);
        this.badgeManager = new GutterBadgeManager(this.settings, this.handleBadgeLevelChange.bind(this));
    }

    private updateComponents(): void {
        this.headingOps = new HeadingOperations(this.settings, this.app);
        this.badgeManager.updateSettings(this.settings);
    }

    private registerCommands(): void {
        // Cycle heading command
        this.addCommand({
            id: 'cycle-heading',
            name: 'Cycle heading level',
            icon: 'heading',
            editorCallback: (editor: Editor) => this.headingOps.cycleHeading(editor, 'cycle')
        });

        // Heading promotion/demotion commands
        this.addCommand({
            id: 'heading-up',
            name: 'Decrease heading level',
            icon: 'chevron-up',
            editorCallback: (editor: Editor) => this.headingOps.cycleHeading(editor, 'up')
        });

        this.addCommand({
            id: 'heading-down',
            name: 'Increase heading level',
            icon: 'chevron-down',
            editorCallback: (editor: Editor) => this.headingOps.cycleHeading(editor, 'down')
        });

        // Individual heading level commands
        for (let level = 1; level <= 6; level++) {
            this.addCommand({
                id: `set-heading-${level}`,
                name: `Set as Heading ${level}`,
                editorCallback: (editor: Editor) =>
                    this.headingOps.setHeadingLevel(editor, level as HeadingLevel)
            });
        }

        // Paragraph command
        this.addCommand({
            id: 'set-paragraph',
            name: 'Set as Paragraph',
            editorCallback: (editor: Editor) =>
                this.headingOps.setHeadingLevel(editor, HeadingLevel.Paragraph)
        });
    }

    private registerEditorExtensions(): void {
        this.registerEditorExtension(this.badgeManager.getExtension());
    }

    private async handleBadgeLevelChange(lineNumber: number, newLevel: HeadingLevel): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.editor) {
            await this.headingOps.setHeadingLevel(activeView.editor, newLevel, lineNumber);
        }
    }

    // Public API for other plugins
    public getHeadingLevel(editor: Editor, lineNumber: number): HeadingLevel {
        return this.headingOps.getHeadingLevel(editor, lineNumber);
    }

    public async setHeadingLevel(editor: Editor, targetLevel: HeadingLevel, lineNumber?: number): Promise<void> {
        await this.headingOps.setHeadingLevel(editor, targetLevel, lineNumber);
    }

    public async cycleHeading(editor: Editor, direction: 'up' | 'down' | 'cycle' = 'cycle'): Promise<void> {
        await this.headingOps.cycleHeading(editor, direction);
    }
} 