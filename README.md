# Heading Helper Plugin for Obsidian

A powerful Obsidian plugin that provides intelligent heading management with hierarchy checking, visual gutter badges, and smart cycling operations.

## 🌟 Features

### 📊 Visual Gutter Badges
- **Subtle indicators** showing heading levels (H1-H6) in the editor gutter
- **Click to change** - Direct heading level selection via dropdown menu
- **Customizable styling** - Adjust colors and appearance
- **Only for headings** - Badges appear only for actual headings, keeping the interface clean

### 🔄 Smart Heading Operations
- **Keyboard shortcuts** for quick heading level changes
- **Heading-only operations** - Only existing headings can be cycled/promoted/demoted
- **Paragraph preservation** - Regular paragraphs are never affected by cycling operations
- **H6 special handling** - Configurable behavior for H6 demotion

### 🛡️ Hierarchy Protection
- **Check heading hierarchy**: Enable smart warnings (via Notices) for specific cases:
  - **H1 Uniqueness**: Prevents promoting any heading to H1 if an H1 already exists elsewhere.
  - **Selected H1/H2**: Warns if the selected text contains both H1 and H2 when promoting.
  - **H5→H6 Flow Break**: Warns when demoting H5 to H6 if "Wrap after H6" is disabled and both H5 & H6 exist globally.
  - **H5/H6 to Paragraph Reminder**: If "Wrap after H6" is ON and H5/H6 exist globally, reminds that repeated demotion leads to Paragraphs.
  - **H6 Demotion Block**: Prevents H6 becoming Paragraph if "Wrap after H6" is disabled.
  - **Paragraph Cascade**: Warns if demoting H1-H5 to Paragraph would orphan lower-level headings.
  - **Debounced Notices**: Prevents spamming notices for identical warnings on the same line quickly.
- **Allow hierarchy override**: If a warning for a *blocking* issue (H1 uniqueness, H6 demotion block, H5→H6 flow break, Paragraph cascade) is shown, this setting allows the operation to proceed. If off, these operations are blocked. General warnings always allow the operation after notice.

### Visual Customization
- **Show gutter badges**: Toggle badge visibility
- **Badge colors**: Customize background and text colors
- **Subtle design**: Low-opacity badges that brighten on hover

## 🎯 How It Works

### Heading Operations Logic

**Promotion (Moving Up)**:
- H6 → H5 → H4 → H3 → H2 → H1
- H1 stays H1 (no wrapping to paragraph)
- Only works on existing headings

**Demotion (Moving Down)**:
- H1 → H2 → H3 → H4 → H5 → H6
- H6 behavior depends on "Wrap after H6" setting:
  - `On`: H6 → Paragraph
  - `Off`: H6 stays H6

**Paragraphs**:
- Never affected by cycling operations
- Maintained as-is to preserve document structure

### Hierarchy Checking Examples

**Smart Warning Scenarios & Behavior (All warnings are Notices):**

1.  **Critical: H1 Uniqueness Violation**
    *   **Rule**: Promoting any heading to H1 when an H1 already exists elsewhere.
    *   **Behavior**: Shows Notice. Operation **blocked** unless "Allow hierarchy override" is ON.
    *   **Message**: `Cannot promote to H1: An H1 already exists. Documents should have only one top-level H1.`

2.  **General: Promotion within H1/H2 Context in Selection**
    *   **Rule**: Promoting any heading when the *current text selection* contains both H1 and H2 headings.
    *   **Behavior**: Shows Notice. Operation **proceeds** (this is a general advisory).
    *   **Message**: `Warning: The current selection contains both H1 and H2 headings. Promoting headings within this selection might affect overall document structure. Please review.`

3.  **Blocking: H5→H6 Demotion into Dead-End**
    *   **Rule**: Demoting an H5 to H6, if "Wrap after H6" is OFF, and both H5 & H6 levels exist globally.
    *   **Behavior**: Shows Notice. Operation **blocked** unless "Allow hierarchy override" is ON.
    *   **Message**: `Demoting H5 to H6: "Wrap after H6" is disabled, and both H5 and H6 levels exist globally. This can create a dead-end. Consider enabling "Wrap after H6".`

4.  **General: H5/H6 Demotion Reminder with Wrap ON**
    *   **Rule**: Demoting an H5 or H6, if "Wrap after H6" is ON, and both H5 & H6 levels exist globally.
    *   **Behavior**: Shows Notice. Operation **proceeds** (this is a reminder).
    *   **Message**: `Reminder: "Wrap after H6" is enabled. Repeatedly demoting H5/H6 will eventually convert them to Paragraphs. The document contains both H5 and H6 levels.`

5.  **Blocking: H6 to Paragraph Demotion with Wrap OFF**
    *   **Rule**: Attempting to demote H6 to Paragraph when "Wrap after H6" is OFF.
    *   **Behavior**: Shows Notice. Operation **blocked** unless "Allow hierarchy override" is ON. (The heading remains H6).
    *   **Message**: `Cannot demote H6 to Paragraph: "Wrap after H6" is disabled. Enable this setting to allow conversion to Paragraph.`

6.  **Blocking: Paragraph Cascade (Orphaning Headings)**
    *   **Rule**: Demoting H1-H5 to Paragraph (with "Wrap after H6" ON) if doing so would leave lower-level headings (H2-H6) without a proper parent in the sequence.
    *   **Behavior**: Shows Notice. Operation **blocked** unless "Allow hierarchy override" is ON.
    *   **Message**: `Converting [CurrentLevel] to Paragraph might orphan existing lower-level headings (e.g., [NextLevel]). Review structure.`

**Operation Handling**:
- **Notices Only**: All warnings are non-intrusive Obsidian Notices.
- **Override Control**: The "Allow hierarchy override" setting determines if *blocking* issues prevent the operation or allow it after the notice.
- **Debounced Notices**: Repeated identical warnings for the same line and operation are suppressed for 1.5 seconds to avoid clutter.

## ⌨️ Default Keyboard Shortcuts

- **Ctrl/⌘ + Shift + H** - Cycle heading level
- **Ctrl/⌘ + Shift + ↑** - Promote heading (decrease level)
- **Ctrl/⌘ + Shift + ↓** - Demote heading (increase level)

*All shortcuts can be customized in Obsidian's Hotkeys settings*

## 🚀 Quick Start

1. **Install** the plugin from Obsidian's Community Plugins
2. **Enable** in Settings → Community Plugins
3. **Configure** in Settings → Heading Helper
4. **Use** keyboard shortcuts or click gutter badges to manage headings

## 💡 Best Practices

### Document Structure
- Start with H1 for main topics
- Use H2 for major sections under H1
- Use H3-H6 for nested subsections
- Let the plugin warn you about hierarchy breaks

### Settings Recommendations
- **Enable hierarchy checking** for structured documents
- **Allow override** if you need flexibility
- **Enable H6 wrap** for natural document flow
- **Show gutter badges** for visual feedback

### Workflow Tips
- Use **Ctrl/⌘ + Shift + ↑/↓** for precise level adjustments
- Use **Ctrl/⌘ + Shift + H** for quick cycling
- **Click badges** when you need to jump multiple levels
- **Pay attention to warnings** - they help maintain document quality

## 🔧 Advanced Configuration

### Custom Styling
The plugin respects Obsidian's theme variables and can be further customized with CSS snippets:

```css
.heading-helper-badge {
    /* Custom badge styling */
    font-family: monospace;
    border: 1px solid var(--text-accent);
}

.heading-helper-menu {
    /* Custom menu styling */
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}
```

### Integration with Other Plugins
The plugin provides a public API for integration:
- `getHeadingLevel(editor, lineNumber)`
- `setHeadingLevel(editor, targetLevel, lineNumber)`
- `cycleHeading(editor, direction)`

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/your-repo/obsidian-heading-helper).

## 📄 License

MIT License - Feel free to modify and distribute.

---

*Made with ❤️ for the Obsidian community*
