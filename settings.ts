import { App, PluginSettingTab, Setting } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings } from './types';
import HeadingHelperPlugin from './main';

export const DEFAULT_SETTINGS: HeadingHelperSettings = {
    enableCycling: true,
    showGutterBadges: true,
    wrapAfterH6: true,
    minLevel: HeadingLevel.H1,
    maxLevel: HeadingLevel.H6,
    badgeBackgroundColor: '#3b82f6',
    badgeTextColor: '#ffffff',
    checkHierarchy: true,
    allowHierarchyOverride: false
};

export class HeadingHelperSettingTab extends PluginSettingTab {
    plugin: HeadingHelperPlugin;

    constructor(app: App, plugin: HeadingHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Heading Helper Settings' });

        // Cycling Settings
        containerEl.createEl('h3', { text: 'Heading Cycling' });

        new Setting(containerEl)
            .setName('Enable heading cycling')
            .setDesc('Allow cycling through heading levels with hotkeys')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCycling)
                .onChange(async (value) => {
                    this.plugin.settings.enableCycling = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Wrap after H6')
            .setDesc('When demoting H6, convert it to paragraph instead of staying at H6. If disabled, H6 remains H6 when demoting.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.wrapAfterH6)
                .onChange(async (value) => {
                    this.plugin.settings.wrapAfterH6 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Check heading hierarchy')
            .setDesc('Smart warnings (via Notices) for hierarchy issues: (1) H2→H1 when H1 already exists, (2) H5→H6 when H6 can\'t demote (wrap off) & both exist, (3) Converting headings to Paragraph if lower levels exist. One notice per unique issue/line.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.checkHierarchy)
                .onChange(async (value) => {
                    this.plugin.settings.checkHierarchy = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allow hierarchy override')
            .setDesc('When a hierarchy warning notice appears for a blocking issue (e.g., duplicate H1, demotion blocked), allow the operation to proceed. If off, blocking issues prevent the change.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowHierarchyOverride)
                .onChange(async (value) => {
                    this.plugin.settings.allowHierarchyOverride = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Minimum heading level')
            .setDesc('The minimum heading level to cycle to')
            .addDropdown(dropdown => dropdown
                .addOption(HeadingLevel.H1.toString(), 'H1')
                .addOption(HeadingLevel.H2.toString(), 'H2')
                .addOption(HeadingLevel.H3.toString(), 'H3')
                .addOption(HeadingLevel.H4.toString(), 'H4')
                .addOption(HeadingLevel.H5.toString(), 'H5')
                .addOption(HeadingLevel.H6.toString(), 'H6')
                .setValue(this.plugin.settings.minLevel.toString())
                .onChange(async (value) => {
                    this.plugin.settings.minLevel = parseInt(value) as HeadingLevel;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum heading level')
            .setDesc('The maximum heading level to cycle to')
            .addDropdown(dropdown => dropdown
                .addOption(HeadingLevel.H1.toString(), 'H1')
                .addOption(HeadingLevel.H2.toString(), 'H2')
                .addOption(HeadingLevel.H3.toString(), 'H3')
                .addOption(HeadingLevel.H4.toString(), 'H4')
                .addOption(HeadingLevel.H5.toString(), 'H5')
                .addOption(HeadingLevel.H6.toString(), 'H6')
                .setValue(this.plugin.settings.maxLevel.toString())
                .onChange(async (value) => {
                    this.plugin.settings.maxLevel = parseInt(value) as HeadingLevel;
                    await this.plugin.saveSettings();
                }));

        // Gutter Badge Settings
        containerEl.createEl('h3', { text: 'Gutter Badges' });

        new Setting(containerEl)
            .setName('Show gutter badges')
            .setDesc('Display heading level indicators in the editor gutter')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showGutterBadges)
                .onChange(async (value) => {
                    this.plugin.settings.showGutterBadges = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshBadges();
                }));

        new Setting(containerEl)
            .setName('Badge background color')
            .setDesc('Background color for the gutter badges')
            .addColorPicker(colorPicker => colorPicker
                .setValue(this.plugin.settings.badgeBackgroundColor)
                .onChange(async (value) => {
                    this.plugin.settings.badgeBackgroundColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshBadges();
                }));

        new Setting(containerEl)
            .setName('Badge text color')
            .setDesc('Text color for the gutter badges')
            .addColorPicker(colorPicker => colorPicker
                .setValue(this.plugin.settings.badgeTextColor)
                .onChange(async (value) => {
                    this.plugin.settings.badgeTextColor = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshBadges();
                }));

        // Help Section
        containerEl.createEl('h3', { text: 'Hotkeys' });

        const helpText = containerEl.createEl('div');
        helpText.innerHTML = `
			<p>Default hotkeys (can be customized in Obsidian's Hotkeys settings):</p>
			<ul>
				<li><strong>Ctrl/⌘ + Shift + H</strong> - Cycle heading level</li>
				<li><strong>Ctrl/⌘ + Shift + ↑</strong> - Decrease heading level</li>
				<li><strong>Ctrl/⌘ + Shift + ↓</strong> - Increase heading level</li>
			</ul>
			<p>Click on gutter badges to change heading levels with your mouse.</p>
		`;
    }
} 