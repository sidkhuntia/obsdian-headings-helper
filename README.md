# Heading Helper

A simple plugin that makes working with headings in Obsidian faster and more visual.

## Features

- **Visual heading indicators** - See H1, H2, H3, etc. markers in the editor gutter
- **Quick heading changes** - Click gutter markers to change heading levels
- **Keyboard commands** - Cycle heading levels up/down or set specific levels
- **Smart hierarchy** - Warns about heading structure issues (optional)

## Usage

### Gutter Markers
- Heading markers (H1, H2, H3, etc.) appear in the gutter next to each heading
- Click any marker to open a menu and change the heading level
- Markers are color-coded by importance (H1/H2 are more prominent)

### Commands
The plugin adds several commands you can assign hotkeys to:

- **Cycle heading level** - Cycles through H1 → H2 → H3 → H4 → H5 → H6 → Paragraph
- **Decrease heading level** - H3 → H2 → H1
- **Increase heading level** - H1 → H2 → H3
- **Set as Heading 1-6** - Directly set specific heading levels
- **Set as Paragraph** - Convert heading to normal text

### Settings
- **Show gutter badges** - Toggle the visual markers on/off
- **Hierarchy checking** - Get warnings when heading structure might be confusing
- **Allow hierarchy override** - Choose whether to block or just warn about structure issues

## Installation

### From Community Plugins (Recommended)
1. Open Obsidian Settings
2. Go to Community Plugins and turn off Safe Mode
3. Click Browse and search for "Heading Helper"
4. Install and enable the plugin

### Manual Installation
1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder named `heading-helper` in your vault's `.obsidian/plugins/` directory
3. Place the downloaded files in that folder
4. Enable the plugin in Obsidian Settings → Community Plugins

## Support

If you find this plugin helpful, you can:
- ⭐ Star the repository
- 🐛 Report issues on GitHub
- 💡 Suggest new features

## License

MIT License - see LICENSE file for details.

<hr>

# Roadmap
- [ ] Integrate with Automatic Table of Contents to show the heading level in the toc
- [ ] Customizable color for each heading level
- [ ] Squash all actions into one action to better integrate with undo/redo
- [ ] Allow for vim keybinds
