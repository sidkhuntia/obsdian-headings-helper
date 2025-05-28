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

        // Cycling Settings
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
            .setDesc('Allow H6 to be wrapped after H6 to Paragraph. If disabled, H6 will remain H6 when demoted.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.wrapAfterH6)
                .onChange(async (value) => {
                    this.plugin.settings.wrapAfterH6 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Check heading hierarchy')
            .setDesc('Check for hierarchy issues and warn if they exist.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.checkHierarchy)
                .onChange(async (value) => {
                    this.plugin.settings.checkHierarchy = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allow hierarchy override')
            .setDesc('Allow the operation to proceed even if a hierarchy issue exists.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowHierarchyOverride)
                .onChange(async (value) => {
                    this.plugin.settings.allowHierarchyOverride = value;
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
                .setValue(this.plugin.settings.minLevel.toString())
                .onChange(async (value) => {
                    this.plugin.settings.minLevel = parseInt(value) as HeadingLevel;
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
                .setValue(this.plugin.settings.maxLevel.toString())
                .onChange(async (value) => {
                    this.plugin.settings.maxLevel = parseInt(value) as HeadingLevel;
                    await this.plugin.saveSettings();
                }));

        // Gutter Badge Settings
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
        const helpText = containerEl.createEl('div');
        helpText.innerHTML = `
            <h4>Usage Tips</h4>
			<p>Configure hotkeys for all commands in Obsidian's main settings under <strong>Hotkeys</strong> (search for "Heading Helper").</p>
			<p>Click on gutter badges (if enabled) to change heading levels directly with your mouse.</p>
		`;
    }
} 